// Tests de SBARRO AMÉRICA contra los archivos REALES del disco:
//   1) lector de planillas de horarios (24:00, celdas combinadas, bloque sin ENTRADA)
//   2) resolución de nombres del biométrico (Carolina sola, alias CREAR, IGNORAR)
// No ejecutar directo: node scripts/test-america.mjs

import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx-js-style'
import { parseWorkbookTurnos } from '../frontend/src/utils/excel-turnos'
import { normalizarCelda, turnoToText } from '../frontend/src/utils/turnos'
import {
  parseBiometricoWorkbook, resolverPersonasBio, sinteticosPorAlias,
  personaSinteticaId, marcasToAttendance, ALIAS_CREAR,
} from '../frontend/src/utils/biometrico'
import { GROUP_IDS } from '../frontend/src/config/employees'

const CARPETA_HORARIOS = 'C:/Users/anuar/OneDrive/SBARRO AMERICA/CUADERNOS DE GERENTES SA/PLANILLA SUPERVISORES SA/2026/HORARIOS 2026'
const CARPETA_BIO = 'C:/Users/anuar/OneDrive/Anuar/SBARRO Cochabamba/FORMATOS CBBA/PAGOS SUELDOS DESDE 2017/PAGOS SUELDOS 2026'
const G = GROUP_IDS.SBARRO_AMERICA

// Gente real de América en Jibble (cuenta A). Los ids de este test son etiquetas:
// lo que se prueba es el matcher de nombres, no los uuid.
const EMP = [
  { id: 'axel', fullName: 'Axel Acosta' },
  { id: 'alex', fullName: 'Alex Villegas' },
  { id: 'anthony', fullName: 'Anthony Inturias' },
  { id: 'fabiolaR', fullName: 'Fabiola Rojas' },
  { id: 'carolina', fullName: 'Carolina Villalobos Apaza' },
  { id: 'gabriel', fullName: 'Gabriel Carvajal' },
  { id: 'daniela', fullName: 'Daniela Delgadillo' },
  { id: 'alondra', fullName: 'Alondra Sbarro' },
  { id: 'jhon', fullName: 'Jhon Diaz' },
  { id: 'cae', fullName: 'Cae Aranibar Delgadillo' },
  { id: 'fabiolaN', fullName: 'Fabiola Nava' },
]
const ALIASES_TURNOS = { anuar: 'IGNORAR', fabiola: 'fabiolaR' }

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

  return fallos
}
