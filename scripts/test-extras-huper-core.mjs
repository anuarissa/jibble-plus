// Tests de lo pedido por Anuar el 10-sep-2026:
//   1) Extras: en días anómalos ("horas absurdas", horario mal cargado) se pueden
//      aprobar minutos A MANO o denegar; denegar también en días normales.
//   2) Huper: ANGELO (id 37) y ANGEL (id 51) solo existen en el aparato pero
//      cobran por planilla → empleados creados; el cuaderno ("ANGHELO", "ANGEL")
//      les asigna horario.
//   3) Bajas: Carlos (último día 25-jul-2026) no entra desde agosto y en julio no
//      suma faltas después de su último día.
// No ejecutar directo: node scripts/test-extras-huper.mjs

import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx-js-style'
import { decisionExtra, MAX_EXTRA_MANUAL } from '../frontend/src/utils/stats'
import { resumenSueldos } from '../frontend/src/utils/resumen-sueldos'
import { parseWorkbookTurnos } from '../frontend/src/utils/excel-turnos'
import {
  parseBiometricoWorkbook, resolverPersonasBio, sinteticosPorAlias, marcasToAttendance, personaSinteticaId,
} from '../frontend/src/utils/biometrico'
import {
  GROUP_IDS, ALIAS_BIO_FIJOS, ALIAS_TURNOS_FIJOS, dadoDeBajaAntesDe, fechaBaja, fechaAlta, fueraDeRango,
} from '../frontend/src/config/employees'
import { MODELO_MENSUAL_DEFAULT } from '../frontend/src/utils/payroll'

const HUPER = GROUP_IDS.SBARRO_HUPER
const CARLOS = '1337f853-a692-4143-9ade-4319d1cc139e'
const BIO_AGO = 'C:/Users/anuar/OneDrive/Anuar/JIBBLE APP ASISTENCIA/DATOS LOCALES/SBARRO HUPER/BIOMETRICO'
const CUADERNO_AGO = 'C:/Users/anuar/OneDrive/SBARRO HUPERMALL/1- CUADERNOS/5- CUADERNOS DE GERENTES/2026 CUADERNO GERENTES/08 PLANILLA HORARIOS 2026.xlsx'

// Hora Bolivia (UTC-4) → ISO, con día explícito (para salidas pasada la medianoche)
const bol = (y, m, d, hhmm) => new Date(Date.UTC(y, m - 1, d, Number(hhmm.slice(0, 2)) + 4, Number(hhmm.slice(3)))).toISOString()

export async function correr() {
  let fallos = 0
  const check = (n, c, d = '') => { if (c) console.log(`  ✓ ${n}`); else { console.error(`  ✗ ${n} ${d}`); fallos++ } }

  // ── 1a) decisionExtra: reglas puras ─────────────────────────────────────
  console.log('═══ Decisión de extras (reglas) ═══')
  {
    const normal = { anomalia: false, extraAprobable: 45, horasAbsurdas: false }
    check('normal sin decisión: sugiere lo que se quedó (45)', decisionExtra(null, normal).extraSugerido === 45)
    check('normal aprobado parcial 30 de 45 → paga 30', decisionExtra({ aprobada: true, minutos: 30 }, normal).minExtraAprobado === 30)
    check('normal: no se puede aprobar más de lo que se quedó (90 → 45)', decisionExtra({ aprobada: true, minutos: 90 }, normal).minExtraAprobado === 45)
    const den = decisionExtra({ denegada: true }, normal)
    check('normal denegado → paga 0 y queda marcado', den.extraDenegada && den.minExtraAprobado === 0)

    const absurdo = { anomalia: true, extraAprobable: 71, horasAbsurdas: true }
    check('horas absurdas: sugiere los 71 min que se quedó', decisionExtra(null, absurdo).extraSugerido === 71)
    check('horas absurdas: aprobado a mano 90 → paga 90 (sin tope contra lo calculado)',
      decisionExtra({ aprobada: true, minutos: 90 }, absurdo).minExtraAprobado === 90)
    const desfase = { anomalia: true, extraAprobable: 40, horasAbsurdas: false }
    check('horario mal cargado: sugiere 0 (ya se pagan las horas fichadas)', decisionExtra(null, desfase).extraSugerido === 0)
    check(`tope anti-typo: 5000 → ${MAX_EXTRA_MANUAL}`,
      decisionExtra({ aprobada: true, minutos: 5000 }, desfase).minExtraAprobado === MAX_EXTRA_MANUAL)
    check('anómalo decidido (aprobado o denegado) → revisado',
      decisionExtra({ aprobada: true, minutos: 10 }, desfase).revisado && decisionExtra({ denegada: true }, desfase).revisado)
    check('anómalo sin decidir → NO revisado', !decisionExtra(null, desfase).revisado)
    check('día normal nunca queda "revisado" (no es anómalo)', !decisionExtra({ denegada: true }, normal).revisado)
  }

  // ── 1b) Escenario completo por la planilla (semana 6-12 jul 2026) ────────
  console.log('═══ Extras en la planilla (semana 6-12 jul 2026) ═══')
  {
    const e = { id: 'e1', fullName: 'Prueba Uno' }
    const sched = [{ personId: 'e1', startTime: '08:00', endTime: '16:00', daysOfWeek: [1, 2, 3, 4, 5, 6], expectedHoursPerWeek: 48 }]
    const att = [
      { id: 'lun', personId: 'e1', groupId: 'g', date: '2026-07-06', clockIn: bol(2026, 7, 6, '08:00'), clockOut: bol(2026, 7, 6, '16:00') },
      // Martes: se quedó 45 min → normal, se aprueban 30 (parcial)
      { id: 'mar', personId: 'e1', groupId: 'g', date: '2026-07-07', clockIn: bol(2026, 7, 7, '08:00'), clockOut: bol(2026, 7, 7, '16:45') },
      // Miércoles: se quedó 40 min → normal, DENEGADO
      { id: 'mie', personId: 'e1', groupId: 'g', date: '2026-07-08', clockIn: bol(2026, 7, 8, '08:00'), clockOut: bol(2026, 7, 8, '16:40') },
      // Jueves: HORAS ABSURDAS (08:00 → 01:00 del día siguiente = 17 h) → aprobado a mano 90
      { id: 'jue', personId: 'e1', groupId: 'g', date: '2026-07-09', clockIn: bol(2026, 7, 9, '08:00'), clockOut: bol(2026, 7, 10, '01:00') },
      // Viernes: HORARIO MAL CARGADO (llegó 200 min tarde) → denegado
      { id: 'vie', personId: 'e1', groupId: 'g', date: '2026-07-10', clockIn: bol(2026, 7, 10, '11:20'), clockOut: bol(2026, 7, 10, '16:00') },
      // Sábado: solo entrada (registro incompleto) → anómalo SIN decidir
      { id: 'sab', personId: 'e1', groupId: 'g', date: '2026-07-11', clockIn: bol(2026, 7, 11, '08:00'), clockOut: null },
    ]
    const base = {
      empleados: [e], attendance: att, schedules: sched, condonaciones: {}, turnos: {}, personOverrides: {},
      ini: new Date(2026, 6, 6), fin: new Date(2026, 6, 12),
      settings: { multiplicadorExtra: 1.5 }, getTarifa: () => 13.75, groupId: 'g',
    }
    const decisiones = {
      mar: { aprobada: true, minutos: 30 },
      mie: { denegada: true },
      jue: { aprobada: true, minutos: 90 },
      vie: { denegada: true },
    }
    const sin = resumenSueldos({ ...base, extrasAprobadas: {} }).filas[0]
    const con = resumenSueldos({ ...base, extrasAprobadas: decisiones }).filas[0]
    const celda = (f, d) => f.cells.find(c => c.dayStr === d)

    check('jueves 17 h = horas absurdas (anómalo)', celda(con, '2026-07-09')?.anomalia === true)
    check('jueves: los 90 min aprobados a mano se pagan', celda(con, '2026-07-09')?.minExtraComputado === 90)
    check(`total extra pagado = 30 (mar) + 90 (jue) = 120 min (${con.minExtra})`, con.minExtra === 120)
    check(`pendiente = solo los 15 min restantes del martes (${con.minExtraPendiente})`, con.minExtraPendiente === 15)
    check('el miércoles denegado ya no está pendiente', celda(con, '2026-07-08')?.extraDenegada === true)
    check(`a revisar: solo el sábado sin decidir (${con.diasARevisar}; antes ${sin.diasARevisar})`,
      con.diasARevisar === 1 && sin.diasARevisar === 3)
    const dif = Math.round((con.totalAPagar - sin.totalAPagar) * 100) / 100
    check(`la planilla paga las 2 h extra aprobadas (+Bs ${dif} = 2 h × 13,75 × 1,5)`, Math.abs(dif - 41.25) < 0.01)
  }

  // ── 3) Bajas ────────────────────────────────────────────────────────────
  console.log('═══ Baja de Carlos (último día 25-jul-2026) ═══')
  {
    check(`fecha de baja registrada (${fechaBaja(CARLOS)})`, fechaBaja(CARLOS) === '2026-07-25')
    check('desde agosto ya no entra', dadoDeBajaAntesDe(CARLOS, '2026-08-01'))
    check('julio sí lo incluye', !dadoDeBajaAntesDe(CARLOS, '2026-07-01'))

    const carlos = { id: CARLOS, fullName: 'Carlos Avila Pérez' }
    const sched = [{ personId: CARLOS, startTime: '08:00', endTime: '16:00', daysOfWeek: [1, 2, 3, 4, 5, 6], expectedHoursPerWeek: 48 }]
    const att = [{ id: 'c20', personId: CARLOS, groupId: 'g', date: '2026-07-20', clockIn: bol(2026, 7, 20, '08:00'), clockOut: bol(2026, 7, 20, '16:00') }]
    const comun = { attendance: att, schedules: sched, condonaciones: {}, extrasAprobadas: {}, turnos: {}, personOverrides: {}, settings: {}, getTarifa: () => 13.75, groupId: 'g' }
    const jul = resumenSueldos({ ...comun, empleados: [carlos], ini: new Date(2026, 6, 20), fin: new Date(2026, 6, 31) })
    const fj = jul.filas[0]
    check('julio: aparece en la planilla', !!fj)
    check(`julio: faltas solo hasta su último día (21–25 jul = 5; tuvo ${fj?.faltas.length})`,
      fj?.faltas.length === 5 && fj.faltas.every(x => x.dayStr <= '2026-07-25'))
    const ago = resumenSueldos({ ...comun, empleados: [carlos], ini: new Date(2026, 7, 1), fin: new Date(2026, 7, 31) })
    check('agosto: no figura en la planilla', ago.filas.length === 0)
  }

  // ── 2) Huper con los archivos reales de agosto ──────────────────────────
  const archivoBio = fs.existsSync(BIO_AGO) ? fs.readdirSync(BIO_AGO).find(f => /biometric/i.test(f) && /2026-08/.test(f)) : null
  if (!archivoBio || !fs.existsSync(CUADERNO_AGO)) {
    console.log('  ⏭ Faltan los archivos de agosto de Huper — tests reales omitidos')
    return fallos
  }
  console.log(`═══ Huper agosto (reales: ${archivoBio}) ═══`)
  const bio = parseBiometricoWorkbook(XLSX.readFile(path.join(BIO_AGO, archivoBio)))
  const jibble = [
    { id: '0fd05836-c25d-4fc9-ad3d-97bb14524a06', fullName: 'Giuseppe Argento' },
    { id: CARLOS, fullName: 'Carlos Avila Pérez' },
    { id: 'cristian', fullName: 'Cristian Murillo' },
    { id: 'estela', fullName: 'Estela Valdez' },
    { id: 'alicia', fullName: 'Alicia Barbolín' },
    { id: 'paulo', fullName: 'Paulo Delgadillo' },
  ].map(p => ({ ...p, groupId: HUPER }))
  const sint = sinteticosPorAlias(HUPER, bio.personasBio, ALIAS_BIO_FIJOS[HUPER])
  const idAngelo = personaSinteticaId(HUPER, 37), idAngel = personaSinteticaId(HUPER, 51)
  check(`ANGELO y ANGEL se crean como empleados de Huper (${sint.map(s => s.fullName).join(', ')})`,
    sint.length === 2 && sint.some(s => s.id === idAngelo) && sint.some(s => s.id === idAngel))

  const { mapa, noEncontrados } = resolverPersonasBio({ groupId: HUPER, personasBio: bio.personasBio, empleadosJibble: jibble, aliases: ALIAS_BIO_FIJOS[HUPER] })
  check('ya no quedan nombres del aparato sin asignar', noEncontrados.length === 0, noEncontrados.join(', '))
  const att = marcasToAttendance(bio.marcas, { groupId: HUPER, mapa })
  const dias = id => att.filter(a => a.personId === id).length
  check(`las marcas de ANGELO van a su empleado (${dias(idAngelo)} días)`, dias(idAngelo) === 12)
  check(`las marcas de ANGEL van a su empleado (${dias(idAngel)} días)`, dias(idAngel) === 6)

  const r = parseWorkbookTurnos(XLSX.readFile(CUADERNO_AGO), [...jibble, ...sint], { aliases: ALIAS_TURNOS_FIJOS[HUPER] })
  check('el cuaderno ya no deja "ANGHELO"/"ANGEL" sin resolver', !r.noEncontrados.some(n => /ANGH?EL/i.test(n)), r.noEncontrados.join(', '))
  const semanasDe = id => Object.keys(r.aplicarPorSemana).filter(wk => r.aplicarPorSemana[wk][id]).sort()
  check(`ANGELO tiene horario del cuaderno (${semanasDe(idAngelo).join(', ')})`, semanasDe(idAngelo).length > 0)
  check(`ANGEL tiene horario del cuaderno (${semanasDe(idAngel).join(', ')})`, semanasDe(idAngel).length > 0)
  check('nadie recibe turnos dobles por el cambio', !Object.values(r.aplicarPorSemana)
    .some(sem => Object.entries(sem).some(([pid, d]) => [idAngelo, idAngel].includes(pid) && Object.values(d).some(c => c?.segments?.length > 1))))

  // ── Ingreso de Angel (25-ago) y baja de Angelo (15-ago) ─────────────────
  console.log('═══ Ingreso de Angel y baja de Angelo ═══')
  check(`Angel ingresó el ${fechaAlta(idAngel)}`, fechaAlta(idAngel) === '2026-08-25')
  check(`Angelo se fue el ${fechaBaja(idAngelo)}`, fechaBaja(idAngelo) === '2026-08-15')
  check('los dos entran a la planilla de agosto', !fueraDeRango(idAngel, '2026-08-01', '2026-08-31') && !fueraDeRango(idAngelo, '2026-08-01', '2026-08-31'))
  check('Angel no entra a julio (todavía no trabajaba)', fueraDeRango(idAngel, '2026-07-01', '2026-07-31'))
  const schedSint = [...jibble, ...sint].map(p => ({ personId: p.id, expectedHoursPerWeek: 0, isDefault: true }))
  const resAgo = resumenSueldos({
    empleados: sint, attendance: att, schedules: schedSint, condonaciones: {}, extrasAprobadas: {},
    turnos: r.aplicarPorSemana, personOverrides: {}, ini: new Date(2026, 7, 1), fin: new Date(2026, 7, 31),
    settings: {}, getTarifa: () => 15.865, groupId: HUPER, modeloMensual: MODELO_MENSUAL_DEFAULT,
  })
  const fAngel = resAgo.filas.find(f => f.personId === idAngel)
  const fAngelo = resAgo.filas.find(f => f.personId === idAngelo)
  check(`Angel: ninguna falta antes del 25 (${fAngel?.faltas.map(x => x.dayStr.slice(5)).join(', ') || 'sin faltas'})`,
    !!fAngel && fAngel.faltas.every(x => x.dayStr >= '2026-08-25'))
  check(`Angelo: la falta del 16 ya no cuenta, la del 11 sí (${fAngelo?.faltas.map(x => x.dayStr.slice(5)).join(', ')})`,
    !!fAngelo && fAngelo.faltas.some(x => x.dayStr === '2026-08-11') && !fAngelo.faltas.some(x => x.dayStr > '2026-08-15'))

  return fallos
}
