// Tests del parser generalizado de biométricos (utils/biometrico.js) contra
// los exports REALES conocidos. No ejecutar directo: node scripts/test-biometrico.mjs
// Fixtures que no existan en esta máquina se saltan con aviso (no fallan).

import fs from 'node:fs'
import * as XLSX from 'xlsx-js-style'
import {
  parseBiometricoWorkbook, personasSinteticas, resolverPersonasBio, marcasToAttendance, personaSinteticaId,
} from '../frontend/src/utils/biometrico'

let fallos = 0
const check = (n, c, d = '') => { if (c) console.log(`  ✓ ${n}`); else { console.error(`  ✗ ${n} ${d}`); fallos++ } }
const aMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m }
const horasDeMarca = m => {
  if (!m.entrada || !m.salida) return null
  let min = aMin(m.salida) - aMin(m.entrada)
  if (m.cruzaMedianoche) min += 24 * 60
  return (min > 0 && min < 20 * 60) ? min / 60 : null
}

export async function correr(RAIZ) {
  const F = {
    huper: `${RAIZ}/biometrico huper julio.xls`,
    tueJul: 'C:/Users/anuar/OneDrive/Anuar/Tuesday/SUELDOS/SUELDOS 2026/07 JULIO SUELDOS 2026/07 JULIO BIOMETRICO TUESDAY.xls',
    tue2022: 'C:/Users/anuar/OneDrive/TUESDAY AMERICA/sueldos/1_StandardReport.xls',
    tue2023: 'C:/Users/anuar/OneDrive/TUESDAY AMERICA/sueldos/2023/enero 2023 reporte.xls',
    tueOct23: 'C:/Users/anuar/OneDrive/OTRAS COSAS/Datos adjuntos de correo electrónico/02 BIOMETRICO DETALLADO OCTUBRE (1) (1).xlsx',
  }
  const abrir = ruta => parseBiometricoWorkbook(XLSX.readFile(ruta))

  // ===== 1) HUPER JULIO — paridad con el cuadre validado contra el contador =====
  console.log('=== Huper julio 2026 ===')
  if (fs.existsSync(F.huper)) {
    const r = abrir(F.huper)
    check('parsea', !!r)
    check('mes 2026-07 (fila Periodo)', r.mesStr === '2026-07', r.mesStr)
    // 7 con marcas: los 6 del cuadre + VLADY (1 sola marca). 54 bloques totales.
    check('7 personas con marcas', r.personasBio.length === 7, `got ${r.personasBio.length}`)
    check('47 bloques vacíos', r.bloquesVacios === 47, `got ${r.bloquesVacios}`)
    // Totales de horas por persona = los del cuadre Huper (validados contra el contador ±Bs)
    const ESPERADO = { ESTELA: 159.72, CRISTIAN: 291.62, ALICIA: 269.68, GIUSEPE: 209.87, PAULO: 137.12, CARLOS: 220.13 }
    const porNombre = {}
    for (const m of r.marcas) {
      const key = m.nombre.toUpperCase()
      const h = horasDeMarca(m)
      if (h != null) porNombre[key] = (porNombre[key] || 0) + h
    }
    for (const [nombre, esperado] of Object.entries(ESPERADO)) {
      const got = Math.round((porNombre[nombre] || 0) * 100) / 100
      check(`horas ${nombre} = ${esperado}`, Math.abs(got - esperado) < 0.01, `got ${got}`)
    }
    const cruces = r.marcas.filter(m => m.cruzaMedianoche).length
    check('hay cruces de medianoche (Cristian cierra 00-02h)', cruces > 0, `got ${cruces}`)
  } else { console.log('  (fixture no disponible — saltado)') }

  // ===== 2) TUESDAY JULIO 2026 =====
  console.log('=== Tuesday julio 2026 ===')
  let rTue = null
  if (fs.existsSync(F.tueJul)) {
    rTue = abrir(F.tueJul)
    check('parsea', !!rTue)
    check('mes 2026-07', rTue.mesStr === '2026-07', rTue.mesStr)
    check('24 personas con marcas', rTue.personasBio.length === 24, `got ${rTue.personasBio.length}`)
    check('trae a juan (ID 30) y ALEJANDRA (ID 84)',
      rTue.personasBio.some(p => p.idBio === 30) && rTue.personasBio.some(p => p.idBio === 84))
    // Determinismo: dos parses → mismas personas/marcas
    const r2 = abrir(F.tueJul)
    check('determinista (2 corridas idénticas)', JSON.stringify(rTue.marcas) === JSON.stringify(r2.marcas))
  } else { console.log('  (fixture no disponible — saltado)') }

  // ===== 3) Variantes viejas (columna de ID distinta / hoja Hoja1) =====
  console.log('=== Variantes 2022/2023 ===')
  for (const [label, ruta, mesEsperado] of [
    ['Tuesday oct-2022 (ID en col E)', F.tue2022, '2022-10'],
    ['Tuesday ene-2023', F.tue2023, '2023-01'],
    ['Tuesday oct-2023 (hoja Hoja1, fallback por título)', F.tueOct23, '2023-10'],
  ]) {
    if (!fs.existsSync(ruta)) { console.log(`  (${label}: no disponible — saltado)`); continue }
    const r = abrir(ruta)
    check(`${label}: parsea`, !!r)
    if (r) {
      check(`${label}: mes ${mesEsperado}`, r.mesStr === mesEsperado, r.mesStr)
      check(`${label}: >5 personas con marcas`, r.personasBio.length > 5, `got ${r.personasBio.length}`)
    }
  }

  // ===== 4) Conversión a attendance =====
  console.log('=== marcasToAttendance ===')
  {
    const G = 'grupo-test'
    const marcas = [
      { idBio: 1, nombre: 'ANA', date: '2026-07-08', entrada: '15:02', salida: '23:10', cruzaMedianoche: false, nMarcas: 2 },
      { idBio: 1, nombre: 'ANA', date: '2026-07-09', entrada: '16:00', salida: '01:30', cruzaMedianoche: true, nMarcas: 2 },
      { idBio: 1, nombre: 'ANA', date: '2026-07-10', entrada: '16:05', salida: null, cruzaMedianoche: false, nMarcas: 1 },
      { idBio: 2, nombre: 'IGNORADO', date: '2026-07-08', entrada: '08:00', salida: '16:00', cruzaMedianoche: false, nMarcas: 2 },
    ]
    const mapa = { 1: personaSinteticaId(G, 1), 2: 'IGNORAR' }
    const att = marcasToAttendance(marcas, { groupId: G, mapa })
    check('excluye IGNORAR', att.length === 3, `got ${att.length}`)
    check('TZ: 15:02 local → 19:02Z', att[0].clockIn === '2026-07-08T19:02:00.000Z', att[0].clockIn)
    check('cruce medianoche: salida 01:30 → día siguiente 05:30Z', att[1].clockOut === '2026-07-10T05:30:00.000Z', att[1].clockOut)
    check('date sigue siendo el día Bolivia de la ENTRADA', att[1].date === '2026-07-09')
    check('1 marca → clockOut null', att[2].clockOut === null)
    check('id determinista', att[0].id === `bio-${personaSinteticaId(G, 1)}-2026-07-08`, att[0].id)
    check('durationMinutes calculado', att[0].durationMinutes === 8 * 60 + 8, `got ${att[0].durationMinutes}`)
  }

  // ===== 5) Resolución de personas =====
  console.log('=== resolverPersonasBio ===')
  {
    const G = 'grupo-test'
    const personasBio = [{ idBio: 30, nombre: 'juan' }, { idBio: 52, nombre: 'GABY' }, { idBio: 9, nombre: 'Sofia' }]
    // Sin Jibble → sintéticos
    const sint = resolverPersonasBio({ groupId: G, personasBio })
    check('modo sintético: todos mapeados', Object.values(sint.mapa).every(v => v?.startsWith('bio:')) && sint.noEncontrados.length === 0)
    // Con Jibble → matcher + aliases
    const empleados = [
      { id: 'j1', fullName: 'Juan Pérez' },
      { id: 'j2', fullName: 'Sofia Chambilla' },
      { id: 'j3', fullName: 'Gabriela Salinas' },
    ]
    const conJib = resolverPersonasBio({ groupId: G, personasBio, empleadosJibble: empleados })
    check('match directo: juan → j1, Sofia → j2', conJib.mapa[30] === 'j1' && conJib.mapa[9] === 'j2', JSON.stringify(conJib.mapa))
    check('GABY no matchea (≠ Gabriela por Levenshtein) → noEncontrados', conJib.mapa[52] === null && conJib.noEncontrados.includes('GABY'))
    const conAlias = resolverPersonasBio({ groupId: G, personasBio, empleadosJibble: empleados, aliases: { gaby: 'j3' } })
    check('alias resuelve GABY → j3', conAlias.mapa[52] === 'j3')
    // Personas sintéticas shape
    const ps = personasSinteticas(G, personasBio)
    check('sintéticas: id estable + fullName capitalizado', ps[0].id === `bio:${G}:30` && ps[0].fullName === 'Juan' && ps[1].fullName === 'Gaby')
  }

  console.log(fallos === 0 ? '\n✅ TODOS LOS TESTS PASAN' : `\n❌ ${fallos} test(s) fallaron`)
  return fallos
}
