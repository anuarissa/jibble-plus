// Tests de la escala de descuentos (regla Anuar 21-ago-2026, todos los locales):
//   tardanza 1-10 min = 10 Bs · 11-20 = 20 Bs · 21+ = 30 Bs (tope)
//   no marcó entrada o salida (vino) = 40 Bs
//   faltó al trabajo (día programado sin fichaje) = 110 Bs (justificable)
//   >180 min tarde = no se cobra (horario mal cargado, día en rojo)
// No ejecutar directo: node scripts/test-multas.mjs

import { calcularMulta, MULTA_FRANJAS } from '../frontend/src/utils/lateness'
import { MULTA_NO_REGISTRO, MULTA_FALTA, claveCondonacionFalta } from '../frontend/src/utils/stats'
import { resumenSueldos } from '../frontend/src/utils/resumen-sueldos'
import { TARIFA_MULTA_LABEL } from '../frontend/src/utils/liquidacion-empleado'

export async function correr() {
  let fallos = 0
  const check = (n, c, d = '') => { if (c) console.log(`  ✓ ${n}`); else { console.error(`  ✗ ${n} ${d}`); fallos++ } }

  console.log('═══ Escala de tardanza ═══')
  const casos = [[0, 0], [1, 10], [5, 10], [10, 10], [11, 20], [15, 20], [20, 20], [21, 30], [30, 30], [45, 30], [60, 30], [120, 30], [179, 30]]
  for (const [min, esperado] of casos) {
    const got = calcularMulta(min)
    check(`${min} min tarde → Bs ${esperado}`, got === esperado, `got ${got}`)
  }
  check('la escala tiene 3 franjas con tope', MULTA_FRANJAS.length === 3 && MULTA_FRANJAS[2].hastaMin === Infinity)
  check(`no-registro = Bs 40 (${MULTA_NO_REGISTRO})`, MULTA_NO_REGISTRO === 40)
  check(`falta = Bs 110 (${MULTA_FALTA})`, MULTA_FALTA === 110)
  check(`label de la escala: "${TARIFA_MULTA_LABEL}"`, /1-10.*10.*11-20.*20.*21\+.*30/.test(TARIFA_MULTA_LABEL))

  console.log('═══ Escenario sintético (semana 6-12 jul 2026, ya pasada) ═══')
  // Lunes 6-jul: FALTA (programado, sin fichaje)
  // Martes 7-jul: llegó 15 min tarde (08:15) → 20 Bs
  // Miércoles 8-jul: llegó 45 min tarde (08:45) → 30 Bs (tope)
  // Jueves 9-jul: solo marcó entrada (sin salida) → no-registro 40 Bs
  // Viernes 10-jul: llegó 200 min tarde → NO se cobra (horario mal cargado)
  const e1 = { id: 'e1', fullName: 'Prueba Uno' }
  const bol = (d, hhmm) => `2026-07-${String(d).padStart(2, '0')}T${String(Number(hhmm.slice(0, 2)) + 4).padStart(2, '0')}:${hhmm.slice(3)}:00.000Z` // Bolivia UTC-4
  const att = [
    { id: 'a-mar', personId: 'e1', date: '2026-07-07', clockIn: bol(7, '08:15'), clockOut: bol(7, '16:00') },
    { id: 'a-mie', personId: 'e1', date: '2026-07-08', clockIn: bol(8, '08:45'), clockOut: bol(8, '16:00') },
    { id: 'a-jue', personId: 'e1', date: '2026-07-09', clockIn: bol(9, '08:00'), clockOut: null },
    { id: 'a-vie', personId: 'e1', date: '2026-07-10', clockIn: bol(10, '11:20'), clockOut: bol(10, '16:00') },
  ]
  const dia = { startTime: '08:00', endTime: '16:00' }
  const turnos = { '2026-W28': { e1: { 1: dia, 2: dia, 3: dia, 4: dia, 5: dia } } }
  const base = {
    empleados: [e1],
    attendance: att,
    schedules: [{ personId: 'e1', expectedHoursPerWeek: 40 }],
    extrasAprobadas: {},
    turnos,
    personOverrides: {},
    ini: new Date(2026, 6, 6),
    fin: new Date(2026, 6, 12),
    settings: { multiplicadorExtra: 1.5 },
    getTarifa: () => 13.75,
    groupId: undefined,
    modeloMensual: null,
  }

  const r = resumenSueldos({ ...base, condonaciones: {} })
  const f = r.filas[0]
  check(`minutos tarde contados = 60 (15+45; los 200 del viernes no) → ${f.minTarde}`, f.minTarde === 60)
  check(`multa tardanzas = Bs 50 (20+30 tope) → ${f.multaBs}`, f.multaBs === 50)
  check(`no-registro: 1 día × Bs 40 → ${f.descuentoNoRegistro}`, f.diasNoRegistro === 1 && f.descuentoNoRegistro === 40)
  check(`falta del lunes: 1 día × Bs 110 → ${f.descuentoFaltas}`, f.diasFalta === 1 && f.descuentoFaltas === 110)
  check('el viernes (200 min) queda como anomalía, no como multa', f.diasARevisar >= 1)
  const esperadoTotal = Math.max(0, f.bruto - f.multaBs - f.descuentoNoRegistro - f.descuentoFaltas)
  check(`total a pagar descuenta las 3 categorías (${f.totalAPagar} = ${f.bruto} − 50 − 40 − 110)`,
    Math.abs(f.totalAPagar - esperadoTotal) < 0.01)
  check('totales del local suman descuentoFaltas', r.totales.descuentoFaltas === 110)

  console.log('═══ Falta justificada (vacaciones/permiso) ═══')
  const cond = { [claveCondonacionFalta('e1', '2026-07-06')]: { condonada: true, motivo: 'vacaciones' } }
  const r2 = resumenSueldos({ ...base, condonaciones: cond })
  const f2 = r2.filas[0]
  check(`justificada: sigue contando como falta en la lista (${f2.faltas.length})`, f2.faltas.length === 1 && f2.faltas[0].condonada === true)
  check(`justificada: NO se descuentan los Bs 110 → ${f2.descuentoFaltas}`, f2.diasFalta === 0 && f2.descuentoFaltas === 0)
  check(`justificada: el total sube exactamente Bs 110 (${f2.totalAPagar} vs ${f.totalAPagar})`,
    Math.abs(f2.totalAPagar - f.totalAPagar - 110) < 0.01)

  console.log('═══ Tardanza condonada sigue funcionando ═══')
  const r3 = resumenSueldos({ ...base, condonaciones: { 'a-mie': { condonada: true, motivo: 'cita médica' } } })
  const f3 = r3.filas[0]
  check(`condonar el miércoles quita sus Bs 30 → multa ${f3.multaBs}`, f3.multaBs === 20)

  return fallos
}
