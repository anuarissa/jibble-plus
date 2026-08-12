// Tests del parser de horarios de Tuesday (PERSONAL TUESDAY) + asumirSemanasFaltantes.
// No ejecutar directo: node scripts/test-turnos-tuesday.mjs

import fs from 'node:fs'
import * as XLSX from 'xlsx-js-style'
import { esWorkbookTuesday, parseWorkbookTurnosTuesday } from '../frontend/src/utils/excel-turnos-tuesday'
import { parseBiometricoWorkbook, personasSinteticas } from '../frontend/src/utils/biometrico'
import { asumirSemanasFaltantes, normalizarCelda } from '../frontend/src/utils/turnos'

let fallos = 0
const check = (n, c, d = '') => { if (c) console.log(`  ✓ ${n}`); else { console.error(`  ✗ ${n} ${d}`); fallos++ } }

const CUADERNO = 'C:/Users/anuar/OneDrive/TUESDAY AMERICA/CUADERNOS DE GERENTES/CUADERNOS GERENTES/07 JULIO del 2026 LIBROS DE GERENTES.xlsx'
const BIO = 'C:/Users/anuar/OneDrive/Anuar/Tuesday/SUELDOS/SUELDOS 2026/07 JULIO SUELDOS 2026/07 JULIO BIOMETRICO TUESDAY.xls'
const GRUPO = 'test-tuesday'

export async function correr() {
  if (!fs.existsSync(CUADERNO) || !fs.existsSync(BIO)) {
    console.log('Fixtures de Tuesday no disponibles — tests saltados.')
    return 0
  }
  // Personas: las del biométrico de julio (así el matcher enfrenta los nombres reales del gerente)
  const bio = parseBiometricoWorkbook(XLSX.readFile(BIO))
  const empleados = personasSinteticas(GRUPO, bio.personasBio)
  console.log(`  · ${empleados.length} personas sintéticas del biométrico`)

  const wb = XLSX.readFile(CUADERNO)
  check('esWorkbookTuesday detecta el cuaderno', esWorkbookTuesday(wb) === true)
  // "GABRIELA" (gerente) ≠ "GABY" (biométrico) → se resuelve con alias, como en la app
  const gabyId = empleados.find(e => e.fullName === 'Gaby')?.id
  const r = parseWorkbookTurnosTuesday(wb, empleados, { aliases: { gabriela: gabyId } })

  console.log('=== semanas y celdas ===')
  check('5 semanas detectadas (W27..W31)', r.semanasDetectadas.length === 5, r.semanasDetectadas.join(','))
  check('semanas correctas por serial', JSON.stringify(r.semanasDetectadas) === JSON.stringify(['2026-W27', '2026-W28', '2026-W29', '2026-W30', '2026-W31']), r.semanasDetectadas.join(','))
  check('celdas ok > 400', r.celdasOk > 400, `got ${r.celdasOk}`)
  console.log(`  · celdasOk ${r.celdasOk} · ignoradas ${r.celdasIgnoradas} · warnings ${r.warnings.length} · noEncontrados: ${r.noEncontrados.join(', ') || '(ninguno)'}`)

  console.log('=== casos puntuales (verificados a mano contra el cuaderno) ===')
  const idDe = nombre => empleados.find(e => e.fullName.toLowerCase().startsWith(nombre))?.id
  const italo = idDe('italo')
  const w27 = r.aplicarPorSemana['2026-W27'] || {}
  // ITALO: AM 08:00-16:00 toda la semana, PM LIBRE → celda simple 08:00-16:00
  const celdaItaloLun = normalizarCelda(w27[italo]?.['1'])
  check('ITALO lun W27 = 08:00-16:00', celdaItaloLun?.startTime === '08:00' && celdaItaloLun?.endTime === '16:00', JSON.stringify(celdaItaloLun))
  // JUAN lun: AM LIBRE + PM 16:00-24:00 → 16:00-23:59 (1.0 → 23:59)
  const juan = idDe('juan')
  const celdaJuanLun = normalizarCelda(w27[juan]?.['1'])
  check('JUAN lun W27 = 16:00-23:59 (24:00 clampeado)', celdaJuanLun?.startTime === '16:00' && celdaJuanLun?.endTime === '23:59', JSON.stringify(celdaJuanLun))
  // JUAN mar: AM 12:00-16:00 + PM 16:00-24:00 → corrido 12:00-23:59 (empalman)
  const celdaJuanMar = normalizarCelda(w27[juan]?.['2'])
  check('JUAN mar W27 = 12:00-23:59 corrido (AM+PM empalmados)', celdaJuanMar?.startTime === '12:00' && celdaJuanMar?.endTime === '23:59' && !celdaJuanMar?.segments, JSON.stringify(celdaJuanMar))
  // GABRIELA (alias → Gaby) sáb: AM LIBRE + PM LIBRE → OFF
  const celdaGabySab = normalizarCelda(w27[gabyId]?.['6'])
  check('GABRIELA→Gaby (alias) sáb W27 = OFF (LIBRE en ambos tramos)', celdaGabySab?.tipo === 'OFF', JSON.stringify(celdaGabySab))
  check('GABRIELA ya no está en noEncontrados (resuelta por alias)', !r.noEncontrados.includes('GABRIELA'), r.noEncontrados.join(','))
  // KEVIN vie: AM 08-16 + PM 19:00-23:00 → turno PARTIDO (hueco 16→19)
  const kevin = idDe('kevin')
  const celdaKevinVie = normalizarCelda(w27[kevin]?.['5'])
  check('KEVIN vie W27 = partido 08:00-16:00 + 19:00-23:00', !!celdaKevinVie?.segments && celdaKevinVie.segments.length === 2 && celdaKevinVie.segments[1].startTime === '19:00', JSON.stringify(celdaKevinVie))

  console.log('=== asumirSemanasFaltantes ===')
  {
    // Quitar W29 a propósito y pedir las 5 → debe copiar W28 con nota
    const sinW29 = { ...r.aplicarPorSemana }
    delete sinW29['2026-W29']
    const { relleno, semanasAsumidas } = asumirSemanasFaltantes(sinW29, ['2026-W27', '2026-W28', '2026-W29', '2026-W30', '2026-W31'])
    check('detecta 1 semana asumida (W29 ← W28)', semanasAsumidas.length === 1 && semanasAsumidas[0].semana === '2026-W29' && semanasAsumidas[0].desde === '2026-W28', JSON.stringify(semanasAsumidas))
    const celdaAsumida = normalizarCelda(relleno['2026-W29']?.[italo]?.['1'])
    check('celda copiada con nota "ASUMIDO"', /asumido/i.test(celdaAsumida?.nota || ''), JSON.stringify(celdaAsumida))
    check('horario copiado de W28 intacto', celdaAsumida?.startTime != null || celdaAsumida?.tipo === 'OFF')
    // Semana futura sin datos → copia de la última disponible
    const fut = asumirSemanasFaltantes(r.aplicarPorSemana, ['2026-W32'])
    check('semana futura W32 ← W31', fut.semanasAsumidas[0]?.desde === '2026-W31', JSON.stringify(fut.semanasAsumidas))
    // Con todo presente → nada asumido
    const nada = asumirSemanasFaltantes(r.aplicarPorSemana, r.semanasDetectadas)
    check('sin faltantes → 0 asumidas', nada.semanasAsumidas.length === 0)
  }

  console.log(fallos === 0 ? '\n✅ TODOS LOS TESTS PASAN' : `\n❌ ${fallos} test(s) fallaron`)
  return fallos
}
