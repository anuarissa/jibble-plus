// Tests de SBARRO AMÉRICA contra los archivos REALES del disco:
//   1) lector de planillas de horarios (24:00, celdas combinadas, bloque sin ENTRADA,
//      alias fijo FABIOLA→Rojas, ambiguos visibles, aviso de dos puestos, merges)
//   2) resolución de nombres del biométrico (Carolina sola, alias CREAR, IGNORAR,
//      dos Fabiolas separables por idBio, aviso de choque de fechas)
// No ejecutar directo: node scripts/test-america.mjs

import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx-js-style'
import { parseWorkbookTurnos } from '../frontend/src/utils/excel-turnos'
import { normalizarCelda, turnoToText } from '../frontend/src/utils/turnos'
import {
  parseBiometricoWorkbook, resolverPersonasBio, sinteticosPorAlias,
  personaSinteticaId, marcasToAttendance, ALIAS_CREAR, aliasKeyBio,
} from '../frontend/src/utils/biometrico'
import { GROUP_IDS, ALIAS_TURNOS_FIJOS, EMPLOYEE_OVERRIDES } from '../frontend/src/config/employees'

const CARPETA_HORARIOS = 'C:/Users/anuar/OneDrive/SBARRO AMERICA/CUADERNOS DE GERENTES SA/PLANILLA SUPERVISORES SA/2026/HORARIOS 2026'
const CARPETA_BIO = 'C:/Users/anuar/OneDrive/Anuar/SBARRO Cochabamba/FORMATOS CBBA/PAGOS SUELDOS DESDE 2017/PAGOS SUELDOS 2026'
const G = GROUP_IDS.SBARRO_AMERICA

// Gente real de América en Jibble (cuenta A). Fabiola Rojas lleva su uuid REAL
// porque el alias fijo compartido (ALIAS_TURNOS_FIJOS) apunta a ese id; el resto
// son etiquetas — lo que se prueba es el matcher de nombres.
const ROJAS = '93a65596-276e-4b8b-93bd-56d0017621ca'
const EMP = [
  { id: 'axel', fullName: 'Axel Acosta' },
  { id: 'alex', fullName: 'Alex Villegas' },
  { id: 'anthony', fullName: 'Anthony Inturias' },
  { id: ROJAS, fullName: 'Fabiola Rojas' },
  { id: 'carolina', fullName: 'Carolina Villalobos Apaza' },
  { id: 'gabriel', fullName: 'Gabriel Carvajal' },
  { id: 'daniela', fullName: 'Daniela Delgadillo' },
  { id: 'alondra', fullName: 'Alondra Sbarro' },
  { id: 'jhon', fullName: 'Jhon Diaz' },
  { id: 'cae', fullName: 'Cae Aranibar Delgadillo' },
  { id: 'fabiolaN', fullName: 'Fabiola Nava' },
]
// Los mismos alias fijos que usan la web y el CLI (fuente única).
const ALIASES_TURNOS = ALIAS_TURNOS_FIJOS[G]

const normNombre = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()

export async function correr() {
  let fallos = 0
  const check = (n, c, d = '') => { if (c) console.log(`  ✓ ${n}`); else { console.error(`  ✗ ${n} ${d}`); fallos++ } }

  if (!fs.existsSync(CARPETA_HORARIOS)) {
    console.log(`  ⏭ Sin acceso a ${CARPETA_HORARIOS} — tests de horarios omitidos`)
  } else {
    console.log('\n═══ PLANILLAS DE HORARIOS ═══')
    const archivos = fs.readdirSync(CARPETA_HORARIOS).filter(f => /\.xlsx?$/i.test(f) && !f.startsWith('~$')).sort()
    console.log('  · archivos:', archivos.join(' · '))

    const total = { aplicarPorSemana: {}, warnings: [], noEncontrados: new Set(), celdasOk: 0, celdasIgnoradas: 0 }
    for (const f of archivos) {
      const wb = XLSX.readFile(path.join(CARPETA_HORARIOS, f))
      const r = parseWorkbookTurnos(wb, EMP, { aliases: ALIASES_TURNOS })
      for (const [wk, porPersona] of Object.entries(r.aplicarPorSemana)) {
        total.aplicarPorSemana[wk] = { ...(total.aplicarPorSemana[wk] || {}), ...porPersona }
      }
      r.warnings.forEach(w => total.warnings.push(`${f}: ${w}`))
      r.noEncontrados.forEach(n => total.noEncontrados.add(n))
      total.celdasOk += r.celdasOk
      total.celdasIgnoradas += r.celdasIgnoradas
    }
    const semanas = Object.keys(total.aplicarPorSemana).sort()
    console.log(`  · semanas: ${semanas.join(', ')} · celdas ok ${total.celdasOk} · ignoradas ${total.celdasIgnoradas}`)
    console.log('  · nombres sin resolver:', [...total.noEncontrados].join(', ') || '(ninguno)')

    const dia = (wk, pid, dow) => turnoToText(normalizarCelda(total.aplicarPorSemana[wk]?.[pid]?.[String(dow)]))

    // Salida "24:00" (celda = 1 en el serial de Excel): antes daba "Falta salida"
    // y el viernes/sábado de los turnos PM quedaban sin horario.
    for (const [pid, label] of [['alondra', 'Alondra'], ['axel', 'Axel'], ['alex', 'Alex']]) {
      const vie = dia('2026-W33', pid, 5)
      check(`${label}: viernes W33 con turno`, !!vie && vie !== 'OFF', `got "${vie}"`)
      if (vie) check(`${label}: el viernes cierra 23:59 (24:00 del Excel)`, /23:59$/.test(vie), vie)
    }
    check('sin warnings "Falta salida"', !total.warnings.some(w => /Falta salida/.test(w)),
      total.warnings.filter(w => /Falta salida/.test(w)).slice(0, 3).join(' | '))

    // Celdas combinadas: el bloque PM va sin nombre (viene del merge de arriba).
    const diasAnthony = [1, 2, 3, 4, 5, 6, 7].map(d => dia('2026-W33', 'anthony', d))
    console.log('  · Anthony W33:', diasAnthony.map((t, i) => `${['L', 'M', 'X', 'J', 'V', 'S', 'D'][i]}=${t || '—'}`).join(' '))
    check('Anthony conserva sus turnos PM (bloque de celda combinada)',
      diasAnthony.filter(t => /1[6-9]:|2[0-3]:/.test(t)).length >= 2, diasAnthony.join(' | '))

    // Bloque con nombre pero sin fila ENTRADA/SALIDA: antes se perdía en silencio.
    const avisoSinFilas = total.warnings.find(w => /no tiene ENTRADA\/SALIDA/.test(w))
    check('avisa del bloque que no se pudo leer (BUFFET/LUCIANA)', !!avisoSinFilas, total.warnings.slice(0, 5).join(' | '))

    check('julio y agosto cubiertos (W27..W34)',
      ['2026-W27', '2026-W30', '2026-W31', '2026-W34'].every(w => semanas.includes(w)), semanas.join(','))
    check('W33 con 8+ personas', Object.keys(total.aplicarPorSemana['2026-W33'] || {}).length >= 8)
    check('MATIAS se reporta como no encontrado', [...total.noEncontrados].some(n => /MATIAS/i.test(n)),
      [...total.noEncontrados].join(','))
    check('ninguna celda ignorada', total.celdasIgnoradas === 0, `${total.celdasIgnoradas} ignoradas`)

    // ── FABIOLA (el bug que reportó Anuar): con el alias fijo compartido, su
    // horario del cuaderno se aplica a Fabiola Rojas en TODAS las semanas y
    // entra a las 08:00 — no el default viejo de la tarde. ──
    const semanasFabiola = semanas.filter(wk => total.aplicarPorSemana[wk]?.[ROJAS])
    check(`Fabiola Rojas tiene horario en las 8 semanas (${semanasFabiola.length})`, semanasFabiola.length === 8)
    const diasF = [1, 2, 3, 4, 5, 6, 7].map(d => dia('2026-W33', ROJAS, d))
    console.log('  · Fabiola W33:', diasF.map((t, i) => `${['L', 'M', 'X', 'J', 'V', 'S', 'D'][i]}=${t || '—'}`).join(' '))
    check('Fabiola lunes W33 = 08:00-23:00 (turno largo del cuaderno)', diasF[0] === '08:00-23:00', diasF[0])
    check('Fabiola miércoles W33 = OFF (igual que el cuaderno)', diasF[2] === 'OFF', diasF[2])
    check('Fabiola entra 08:00 todos los días laborales (NO 16:00)',
      diasF.every((t, i) => i === 2 || /^08:00/.test(t)), diasF.join(' | '))
    check('Fabiola Nava NO recibe ningún horario', !semanas.some(wk => total.aplicarPorSemana[wk]?.fabiolaN))
    check('el defaultWeek viejo de tarde de Fabiola Rojas ya no existe',
      !EMPLOYEE_OVERRIDES[ROJAS]?.defaultWeek)

    // ── Ambiguos: SIN alias, FABIOLA matchea a las dos y debe llegar al panel
    // (antes se descartaba sin dejar rastro resoluble). ──
    const sinAlias = { aplicar: {}, ambiguos: [], noEncontrados: [] }
    for (const f of archivos) {
      const r = parseWorkbookTurnos(XLSX.readFile(path.join(CARPETA_HORARIOS, f)), EMP, { aliases: {} })
      for (const a of r.ambiguos) if (!sinAlias.ambiguos.some(x => x.nombre === a.nombre)) sinAlias.ambiguos.push(a)
      for (const n of r.noEncontrados) if (!sinAlias.noEncontrados.includes(n)) sinAlias.noEncontrados.push(n)
      for (const wk of Object.keys(r.aplicarPorSemana)) sinAlias.aplicar[wk] = { ...sinAlias.aplicar[wk], ...r.aplicarPorSemana[wk] }
    }
    const ambFab = sinAlias.ambiguos.find(a => /FABIOLA/i.test(a.nombre))
    check('sin alias: FABIOLA llega como AMBIGUA con sus 2 candidatas', !!ambFab && ambFab.candidatos.length === 2,
      JSON.stringify(sinAlias.ambiguos))
    check('sin alias: las candidatas son Rojas y Nava',
      !!ambFab && ambFab.candidatos.map(c => c.fullName).sort().join(' | ') === 'Fabiola Nava | Fabiola Rojas')
    check('sin alias: FABIOLA no se duplica en "no encontrados"', !sinAlias.noEncontrados.some(n => /^FABIOLA$/i.test(n)))
    check('sin alias: el horario NO se aplica a ninguna Fabiola (ambigua)',
      !Object.values(sinAlias.aplicar).some(sem => sem[ROJAS] || sem.fabiolaN))

    // ── JHON en dos puestos (COCINA y MESERO, W27/W28): se fusiona como turno
    // doble pero ahora AVISA — puede ser otra persona con el mismo nombre. ──
    const avisoJhon = total.warnings.find(w => /JHON/i.test(w) && /dos puestos/.test(w))
    check('avisa que JHON aparece en dos puestos (W27/W28)', !!avisoJhon, total.warnings.filter(w => /puestos/.test(w)).join(' | '))
  }

  // ── Unit: DOS empleados que se llaman EXACTAMENTE igual (caso real: dos
  // NICOLAS en el aparato de SOS) — el índice ya no pisa al primero y el
  // matcher lo declara ambiguo en vez de asignar al equivocado en silencio. ──
  {
    const { construirIndiceNombres, matchEmpleado } = await import('../frontend/src/utils/excel-turnos')
    const dosNicolas = [
      { id: 'bio:sos:9', fullName: 'Nicolas' },
      { id: 'bio:sos:74', fullName: 'Nicolas' },
      { id: 'carla', fullName: 'Carla' },
    ]
    const idx = construirIndiceNombres(dosNicolas)
    const amb = new Map()
    check('nombre duplicado exacto → NO se asigna solo', matchEmpleado(idx, 'NICOLAS', amb) === null)
    check('el duplicado queda registrado como ambiguo con sus 2 candidatos',
      amb.get('NICOLAS')?.length === 2 && amb.get('NICOLAS').every(c => c.fullName === 'Nicolas'),
      JSON.stringify([...amb.keys()]))
    check('un nombre único sigue matcheando normal', matchEmpleado(idx, 'CARLA')?.id === 'carla')
    check('sin ambiguousOut tampoco asigna (devuelve null)', matchEmpleado(idx, 'NICOLAS') === null)
  }

  // ── Unit sintético: nombres por ANCLA del merge — texto oculto bajo la celda
  // combinada (caso "Daniela Wolf") no se le regala a nadie si el ancla se vacía. ──
  {
    const serial = d => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000)
    const lun = serial(new Date(2026, 7, 17)) // lunes 17-ago-2026 (W34)
    const filas = [
      ['', '', '', '', 'L', 'M', 'Mi', 'J', 'V', 'S', 'D'],
      ['NOMBRE Y APELLIDO', '', '', '', lun, lun + 1, lun + 2, lun + 3, lun + 4, lun + 5, lun + 6],
      // Bloque 1: ancla VACÍA (nombre borrado) + texto fantasma en la fila SALIDA.
      ['GERENTE', '', 'AM', 'ENTRADA', '08:00', '08:00', '08:00', '08:00', '08:00', '08:00', '08:00'],
      ['', 'Daniela Fantasma', '', 'SALIDA', '16:00', '16:00', '16:00', '16:00', '16:00', '16:00', '16:00'],
      ['', '', '', 'HORAS', '', '', '', '', '', '', ''],
      // Bloque 2: normal, con nombre en el ancla.
      ['COCINA', 'PEDRO', 'AM', 'ENTRADA', '09:00', '09:00', '09:00', '09:00', '09:00', '09:00', '09:00'],
      ['', '', '', 'SALIDA', '17:00', '17:00', '17:00', '17:00', '17:00', '17:00', '17:00'],
      ['', '', '', 'HORAS', '', '', '', '', '', '', ''],
    ]
    const ws = XLSX.utils.aoa_to_sheet(filas)
    ws['!merges'] = [
      { s: { r: 2, c: 1 }, e: { r: 4, c: 1 } },  // nombre del bloque 1 (ancla vacía, fantasma dentro)
      { s: { r: 5, c: 1 }, e: { r: 7, c: 1 } },  // nombre del bloque 2 (PEDRO)
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Horarios')
    const empSint = [{ id: 'd1', fullName: 'Daniela Fantasma' }, { id: 'p1', fullName: 'Pedro Perez' }]
    const r = parseWorkbookTurnos(wb, empSint, {})
    const sem = r.aplicarPorSemana['2026-W34'] || {}
    check('merge con ancla vacía: el texto oculto NO se convierte en horario de nadie', !sem.d1, JSON.stringify(sem.d1 || null))
    check('merge normal: PEDRO sí recibe su horario', !!sem.p1 && turnoToText(normalizarCelda(sem.p1['1'])) === '09:00-17:00',
      JSON.stringify(sem.p1?.['1'] || null))
  }

  // ── Biométrico: nombres del aparato → empleados ────────────────────────────
  const buscarBio = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { const r = buscarBio(p); if (r) return r }
      else if (/biometrico/i.test(e.name) && /^7[_ ]|julio/i.test(e.name) && /\.xls[xm]?$/i.test(e.name)) return p
    }
    return null
  }
  const archivoBio = fs.existsSync(CARPETA_BIO) ? buscarBio(CARPETA_BIO) : null
  if (!archivoBio) {
    console.log(`\n  ⏭ Sin export biométrico de julio en ${CARPETA_BIO} — tests del aparato omitidos`)
    return fallos
  }

  console.log('\n═══ BIOMÉTRICO ═══')
  console.log('  · archivo:', path.basename(archivoBio))
  const bio = parseBiometricoWorkbook(XLSX.readFile(archivoBio))
  const buscar = frag => bio.personasBio.find(p => p.nombre.toUpperCase().includes(frag))
  const luciana = buscar('LUCIANA'), josecoyo = buscar('JOSECOYO'), carolina = buscar('CAROLINA')
  check('LUCIANA, JOSECOYO y CAROLINA están en el aparato', !!luciana && !!josecoyo && !!carolina)

  // Carolina existe en Jibble sin grupo: con la regla de cuenta A entra a América
  // y el matcher la resuelve sin que Anuar tenga que asignar nada.
  const CAROLINA_JIBBLE = { id: '2cb8dfe6-8eee-4e00-b5b4-2865aaa983dd', fullName: 'Carolina Villalobos Apaza', groupId: G }
  const base = resolverPersonasBio({ groupId: G, personasBio: bio.personasBio, empleadosJibble: [CAROLINA_JIBBLE], aliases: {} })
  check('CAROLINA se resuelve sola', base.mapa[carolina.idBio] === CAROLINA_JIBBLE.id)
  const hC = marcasToAttendance(bio.marcas, { groupId: G, mapa: base.mapa })
    .filter(a => a.personId === CAROLINA_JIBBLE.id)
    .reduce((s, a) => s + (a.durationMinutes || 0), 0) / 60
  check(`CAROLINA suma ~266 h en julio (${hC.toFixed(1)} h)`, hC > 255 && hC < 275)
  check('LUCIANA y JOSECOYO quedan pendientes de asignar',
    base.noEncontrados.some(n => /LUCIANA/i.test(n)) && base.noEncontrados.some(n => /JOSECOYO/i.test(n)))

  // Alias CREAR: gente que solo existe en el aparato.
  const aliases = { [normNombre(luciana.nombre)]: ALIAS_CREAR, [normNombre(josecoyo.nombre)]: ALIAS_CREAR }
  const res = resolverPersonasBio({ groupId: G, personasBio: bio.personasBio, empleadosJibble: [CAROLINA_JIBBLE], aliases })
  const idL = personaSinteticaId(G, luciana.idBio), idJ = personaSinteticaId(G, josecoyo.idBio)
  check('CREAR mapea al id sintético estable', res.mapa[luciana.idBio] === idL, res.mapa[luciana.idBio])
  check('el id sintético no cambia entre pasadas (no se pierden tarifas ni aprobaciones)',
    resolverPersonasBio({ groupId: G, personasBio: bio.personasBio, empleadosJibble: [CAROLINA_JIBBLE], aliases }).mapa[luciana.idBio] === idL)
  const sint = sinteticosPorAlias(G, bio.personasBio, aliases)
  const empL = sint.find(e => e.id === idL)
  check('sinteticosPorAlias devuelve los 2 empleados creados', sint.length === 2, `${sint.length}`)
  check(`empleado creado con nombre y local correctos ("${empL?.fullName}")`,
    !!empL && empL.groupId === G && empL.synthetic === true)

  const att = marcasToAttendance(bio.marcas, { groupId: G, mapa: res.mapa })
  const horas = id => att.filter(a => a.personId === id).reduce((s, a) => s + (a.durationMinutes || 0), 0) / 60
  const dias = id => att.filter(a => a.personId === id).length
  check(`LUCIANA entra a la planilla con ~40 h (${horas(idL).toFixed(1)} h · ${dias(idL)} días)`, horas(idL) > 35 && horas(idL) < 45)
  check(`JOSECOYO entra a la planilla con ~23 h (${horas(idJ).toFixed(1)} h · ${dias(idJ)} días)`, horas(idJ) > 18 && horas(idJ) < 28)

  // IGNORAR: sigue sacando a la persona sin crear a nadie.
  const alIg = { [normNombre(luciana.nombre)]: 'IGNORAR' }
  const resIg = resolverPersonasBio({ groupId: G, personasBio: bio.personasBio, empleadosJibble: [CAROLINA_JIBBLE], aliases: alIg })
  check('IGNORAR no crea empleados', sinteticosPorAlias(G, bio.personasBio, alIg).length === 0)
  check('IGNORAR deja fuera de la planilla las marcas de esa persona',
    !marcasToAttendance(bio.marcas, { groupId: G, mapa: resIg.mapa }).some(a => a.personId === 'IGNORAR' || a.personId === idL))

  // ── Las DOS Fabiolas del aparato («FABIOLA» id 31 y «fabiola» id 13): por
  // nombre colapsaban a la misma clave; con alias por idBio van a personas
  // DISTINTAS y las horas de cada una a quien corresponde. ──
  const fabiolas = bio.personasBio.filter(p => /fabiola/i.test(p.nombre))
  check('el aparato tiene DOS Fabiolas', fabiolas.length === 2, fabiolas.map(p => `${p.nombre}(${p.idBio})`).join(', '))
  const [fabA, fabB] = fabiolas.sort((a, b) => Number(b.idBio) - Number(a.idBio)) // 31 (Rojas) y 13 (Nava)
  const ROJAS_J = { id: '93a65596-276e-4b8b-93bd-56d0017621ca', fullName: 'Fabiola Rojas', groupId: G }
  const NAVA_J = { id: 'nava-uuid', fullName: 'Fabiola Nava', groupId: G }
  const empDos = [CAROLINA_JIBBLE, ROJAS_J, NAVA_J]

  // Sin alias: ambas quedan pendientes (matcher ambiguo) y con su idBio para la UI.
  const resDos = resolverPersonasBio({ groupId: G, personasBio: bio.personasBio, empleadosJibble: empDos, aliases: {} })
  check('sin alias: las dos Fabiolas quedan pendientes (matcher ambiguo)',
    resDos.pendientes.filter(p => /fabiola/i.test(p.nombre)).length === 2, JSON.stringify(resDos.pendientes))
  check('pendientes trae idBio + nombre (para asignar por id)',
    resDos.pendientes.every(p => p.idBio != null && p.nombre))

  // Con alias por idBio: cada una a su empleada.
  const alDos = { [aliasKeyBio(fabA.idBio)]: ROJAS_J.id, [aliasKeyBio(fabB.idBio)]: NAVA_J.id }
  const resSep = resolverPersonasBio({ groupId: G, personasBio: bio.personasBio, empleadosJibble: empDos, aliases: alDos, marcas: bio.marcas })
  check('alias por idBio separa: id 31 → Rojas, id 13 → Nava',
    resSep.mapa[fabA.idBio] === ROJAS_J.id && resSep.mapa[fabB.idBio] === NAVA_J.id)
  check('bien separadas: sin avisos de choque', resSep.avisos.length === 0, resSep.avisos.join(' | '))
  const attSep = marcasToAttendance(bio.marcas, { groupId: G, mapa: resSep.mapa })
  const hSep = id => attSep.filter(a => a.personId === id).reduce((s, a) => s + (a.durationMinutes || 0), 0) / 60
  // 257,5 h verificadas día por día (26 días, 3 con salida pasada la medianoche).
  check(`Rojas recibe SOLO sus horas (~257,5 h → ${hSep(ROJAS_J.id).toFixed(1)})`, hSep(ROJAS_J.id) > 250 && hSep(ROJAS_J.id) < 265)
  check(`Nava recibe SOLO sus horas (~13,9 h → ${hSep(NAVA_J.id).toFixed(1)})`, hSep(NAVA_J.id) > 10 && hSep(NAVA_J.id) < 18)

  // Las dos al MISMO empleado por error: ambas marcaron el 30 y 31 de julio →
  // sus fichajes chocarían; el resolver debe avisar.
  const alMal = { [aliasKeyBio(fabA.idBio)]: ROJAS_J.id, [aliasKeyBio(fabB.idBio)]: ROJAS_J.id }
  const resMal = resolverPersonasBio({ groupId: G, personasBio: bio.personasBio, empleadosJibble: empDos, aliases: alMal, marcas: bio.marcas })
  check('dos ids del aparato al mismo empleado con marcas el mismo día → AVISA',
    resMal.avisos.length === 1 && /mismo día/i.test(resMal.avisos[0]), resMal.avisos.join(' | '))
  check('el aviso nombra los días que chocan (30 y 31 de julio)',
    /2026-07-30/.test(resMal.avisos[0] || '') && /2026-07-31/.test(resMal.avisos[0] || ''), resMal.avisos[0])

  // Compatibilidad: un alias por NOMBRE sigue funcionando cuando no hay duplicado.
  const resNom = resolverPersonasBio({ groupId: G, personasBio: bio.personasBio, empleadosJibble: empDos, aliases: { [normNombre(luciana.nombre)]: 'IGNORAR' } })
  check('alias por nombre (sin duplicado) sigue valiendo', resNom.mapa[luciana.idBio] === 'IGNORAR')

  return fallos
}
