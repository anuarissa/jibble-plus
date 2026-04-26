// Derivaciones / agregaciones a partir de los datos brutos de Jibble + config local.
// Consolida lógica que necesitan Dashboard, vistas por restaurante y comparativos.

import { startOfWeek, endOfWeek, format, isWithinInterval, parseISO, addDays, startOfMonth, endOfMonth, getDaysInMonth, getDate } from 'date-fns'
import { detectarTardanzasEnRango, minutosTarde } from './lateness'
import { planillaEmpleado, sumarHoras } from './payroll'
import { isoWeekKey, dayOfWeek, getTurnoEfectivo } from './turnos'

// Construye el resolver getStartTimeForFichaje a partir de turnos + schedules.
// Devuelve "OFF" si el día está marcado off (no es tardanza), un "HH:MM" si hay turno o schedule, o null si no hay nada.
export function buildStartTimeResolver(turnos, schedules) {
  const schedByPerson = new Map((schedules || []).map(s => [s.personId, s]))
  return (fichaje) => {
    if (!fichaje?.date) return null
    const wk = isoWeekKey(fichaje.date)
    const dow = dayOfWeek(fichaje.date)
    const celda = turnos?.[wk]?.[fichaje.personId]?.[String(dow)]
    if (celda === 'OFF') return 'OFF'
    if (celda?.startTime) return celda.startTime
    const sched = schedByPerson.get(fichaje.personId)
    if (sched?.daysOfWeek?.includes(dow) && sched.startTime) return sched.startTime
    return null
  }
}

export function semanaActual(now = new Date()) {
  const ini = startOfWeek(now, { weekStartsOn: 1 })
  const fin = endOfWeek(now, { weekStartsOn: 1 })
  return { ini, fin }
}

export function attendanceEnRango(attendance, ini, fin) {
  return (attendance || []).filter(a => {
    const d = parseISO(a.date)
    return isWithinInterval(d, { start: ini, end: fin })
  })
}

// Agrupa fichajes por personId.
export function groupByPerson(records) {
  const m = {}
  for (const r of records || []) {
    if (!m[r.personId]) m[r.personId] = []
    m[r.personId].push(r)
  }
  return m
}

// Tardanzas en un rango con flag .condonada aplicado desde el localStorage.
// `turnos` opcional: si se pasa, las tardanzas usan el turno custom para cada día.
export function tardanzasConCondonacion(attendance, schedules, condonaciones, ini, fin, turnos = null) {
  const inRange = attendanceEnRango(attendance, ini, fin)
  const resolver = turnos ? buildStartTimeResolver(turnos, schedules) : null
  const detectadas = detectarTardanzasEnRango(inRange, schedules || [], resolver)
  return detectadas.map(t => {
    const c = condonaciones[t.id]
    return c?.condonada ? { ...t, condonada: true, motivoCondonacion: c.motivo } : t
  })
}

// Stats por restaurante para usar en RestaurantCard del Dashboard.
export function statsRestaurante({ group, people, attendance, schedules, active, tarifas, condonaciones, settings, turnos }) {
  const empleadosLocal = (people || []).filter(p => p.groupId === group.id)
  const { ini, fin } = semanaActual()
  const semana = attendanceEnRango(attendance, ini, fin).filter(a => a.groupId === group.id)
  const fichados = (active || []).filter(a => a.groupId === group.id).length

  // Horas semana (todos los empleados)
  const horas = sumarHoras(semana)

  // Planilla estimada
  const fichajesPorPersona = groupByPerson(semana)
  const tardanzasFiltradas = tardanzasConCondonacion(attendance, schedules, condonaciones, ini, fin, turnos)
    .filter(t => t.groupId === group.id)
  const tardanzasPorPersona = groupByPerson(tardanzasFiltradas)
  let planillaTotal = 0
  for (const emp of empleadosLocal) {
    const sched = schedules?.find(s => s.personId === emp.id)
    const tarifa = tarifas[emp.id] ?? 0
    const r = planillaEmpleado(
      { ...emp, tarifa, expectedHoursPerWeek: sched?.expectedHoursPerWeek ?? 0 },
      fichajesPorPersona[emp.id] || [],
      tardanzasPorPersona[emp.id] || [],
      { multiplicadorExtra: settings.multiplicadorExtra },
    )
    planillaTotal += r.totalAPagar
  }

  // Puntualidad: % de fichajes a tiempo (sin tardanza activa) en la semana
  const totalFichajes = semana.length
  const conTardanza = tardanzasFiltradas.filter(t => !t.condonada).length
  const aTiempo = totalFichajes - conTardanza
  const puntualidad = totalFichajes > 0 ? Math.round((aTiempo / totalFichajes) * 100) : 100

  return {
    groupId: group.id,
    fichados,
    totalEmpleados: empleadosLocal.length,
    horasSemana: horas,
    planillaSemana: planillaTotal,
    puntualidad,
    tardanzasActivas: conTardanza,
  }
}

// Stats globales (todos los locales sumados)
export function statsGlobales({ groups, ...rest }) {
  let totalEmp = 0, horas = 0, planilla = 0, totalFich = 0, aTiempo = 0
  for (const g of groups || []) {
    const s = statsRestaurante({ group: g, ...rest })
    totalEmp += s.totalEmpleados
    horas += s.horasSemana
    planilla += s.planillaSemana
    totalFich += s.totalEmpleados // aproximación; mejor recalcular abajo
  }
  // Recalc puntualidad global desde tardanzas globales
  const { ini, fin } = semanaActual()
  const tardanzasGlob = tardanzasConCondonacion(rest.attendance, rest.schedules, rest.condonaciones, ini, fin, rest.turnos)
  const semana = attendanceEnRango(rest.attendance, ini, fin)
  const totalFichG = semana.length
  const conTard = tardanzasGlob.filter(t => !t.condonada).length
  const punt = totalFichG > 0 ? Math.round(((totalFichG - conTard) / totalFichG) * 100) : 100
  return { totalEmpleados: totalEmp, horasSemana: horas, planillaSemana: planilla, puntualidadGlobal: punt }
}

// Helper interno: resuelve estado, mins tarde, horas y turno custom para un día específico.
function resolverDia({ emp, day, fichajesEmp, sched, condonaciones, turnos, weekKeyOverride }) {
  const dayStr = format(day, 'yyyy-MM-dd')
  const fich = fichajesEmp.find(a => a.date === dayStr)
  const dow = day.getDay() === 0 ? 7 : day.getDay()
  const wk = weekKeyOverride || isoWeekKey(day)

  const celdaTurno = turnos?.[wk]?.[emp.id]?.[String(dow)]
  let startTimeProgramado = null
  let endTimeProgramado = null
  let programado = false
  if (celdaTurno === 'OFF') {
    programado = false
  } else if (celdaTurno?.startTime) {
    startTimeProgramado = celdaTurno.startTime
    endTimeProgramado = celdaTurno.endTime
    programado = true
  } else if (sched?.daysOfWeek?.includes(dow)) {
    startTimeProgramado = sched.startTime
    endTimeProgramado = sched.endTime
    programado = true
  }

  if (!programado) return { state: 'idle', day, dayStr }
  if (!fich) return { state: 'idle', day, dayStr, falto: true, programadoStart: startTimeProgramado, programadoEnd: endTimeProgramado }

  let state = 'good'
  let mins = 0
  if (startTimeProgramado && fich.clockIn) {
    mins = minutosTarde(startTimeProgramado, fich.clockIn)
    if (mins > 0) state = mins < 15 ? 'warn' : 'bad'
    if (condonaciones?.[fich.id]?.condonada) state = 'good'
  }
  const horas = fich.clockOut
    ? (new Date(fich.clockOut) - new Date(fich.clockIn)) / 3600000
    : null
  return {
    state, day, dayStr, fichaje: fich, horas, mins,
    programadoStart: startTimeProgramado,
    programadoEnd: endTimeProgramado,
    turnoCustom: !!celdaTurno?.startTime,
  }
}

// VISTA DÍA: detalle de un único día — un empleado por fila con horas exactas.
export function vistaDia({ empleados, attendance, schedules, dia, condonaciones, turnos = null }) {
  const filas = empleados.map(emp => {
    const sched = schedules.find(s => s.personId === emp.id)
    const fichajesEmp = (attendance || []).filter(a => a.personId === emp.id)
    const cell = resolverDia({ emp, day: dia, fichajesEmp, sched, condonaciones, turnos })
    return { empleado: emp, ...cell }
  })
  return filas
}

// VISTA MES: filas = empleados, columnas = todos los días del mes.
export function tablaMensual({ empleados, attendance, schedules, mes, condonaciones, turnos = null }) {
  const ini = startOfMonth(mes)
  const numDias = getDaysInMonth(mes)
  const dias = Array.from({ length: numDias }, (_, i) => addDays(ini, i))

  const filas = empleados.map(emp => {
    const sched = schedules.find(s => s.personId === emp.id)
    const fichajesEmp = (attendance || []).filter(a => a.personId === emp.id)
    const cells = dias.map(day => resolverDia({ emp, day, fichajesEmp, sched, condonaciones, turnos }))
    const totalHoras = cells.reduce((acc, c) => acc + (c.horas || 0), 0)
    const tardanzas = cells.filter(c => c.state === 'warn' || c.state === 'bad').length
    const aTiempo = cells.filter(c => c.state === 'good').length
    const faltas = cells.filter(c => c.falto).length
    return { empleado: emp, cells, totalHoras, tardanzas, aTiempo, faltas }
  })
  return { dias, filas }
}

// Datos para tabla semanal de asistencia: filas por empleado, columnas por día.
export function tablaSemanal({ empleados, attendance, schedules, ini, condonaciones, turnos = null }) {
  const dias = Array.from({ length: 7 }, (_, i) => addDays(ini, i))
  const weekKey = isoWeekKey(ini)
  const filas = empleados.map(emp => {
    const sched = schedules.find(s => s.personId === emp.id)
    const fichajesEmp = (attendance || []).filter(a => a.personId === emp.id)
    const cells = dias.map(day =>
      resolverDia({ emp, day, fichajesEmp, sched, condonaciones, turnos, weekKeyOverride: weekKey })
    )
    const totalHoras = cells.reduce((acc, c) => acc + (c.horas || 0), 0)
    return { empleado: emp, cells, totalHoras }
  })
  return { dias, filas }
}
