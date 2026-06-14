// Derivaciones / agregaciones a partir de los datos brutos de Jibble + config local.
// Consolida lógica que necesitan Dashboard, vistas por restaurante y comparativos.

import { startOfWeek, endOfWeek, format, isWithinInterval, parseISO, addDays, startOfMonth, endOfMonth, getDaysInMonth, getDate } from 'date-fns'
import { detectarTardanzasEnRango, minutosTarde, minutosDiff, calcularMulta } from './lateness'
import { planillaEmpleado, sumarHoras } from './payroll'
import { isoWeekKey, dayOfWeek, getTurnoEfectivo, getDefaultParaDia, normalizarCelda } from './turnos'
import { formatHora } from './format'

// Construye el resolver getStartTimeForFichaje a partir de turnos + schedules + defaults.
// Devuelve "OFF" si el día está marcado off, "HH:MM" si hay hora programada, o null si no hay nada.
export function buildStartTimeResolver(turnos, schedules, personOverrides = {}) {
  const schedByPerson = new Map((schedules || []).map(s => [s.personId, s]))
  return (fichaje) => {
    if (!fichaje?.date) return null
    const wk = isoWeekKey(fichaje.date)
    const dow = dayOfWeek(fichaje.date)
    const celda = normalizarCelda(turnos?.[wk]?.[fichaje.personId]?.[String(dow)])
    // Celda explícita: prevalece
    if (celda?.tipo === 'OFF') return 'OFF'
    if (celda?.startTime) return celda.startTime
    // celda null o tipo:'default' → usar default por día del empleado
    const sched = schedByPerson.get(fichaje.personId)
    const def = getDefaultParaDia(fichaje.personId, dow, personOverrides, sched)
    if (def?.tipo === 'OFF') return 'OFF'
    if (def?.startTime) return def.startTime
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
// `turnos` y `personOverrides` opcionales: usan turno custom + default por día del empleado.
export function tardanzasConCondonacion(attendance, schedules, condonaciones, ini, fin, turnos = null, personOverrides = {}) {
  const inRange = attendanceEnRango(attendance, ini, fin)
  // Siempre construir el resolver: aunque turnos sea null, los defaults por día sí afectan.
  const resolver = buildStartTimeResolver(turnos || {}, schedules, personOverrides)
  const detectadas = detectarTardanzasEnRango(inRange, schedules || [], resolver)
  return detectadas.map(t => {
    const c = condonaciones[t.id]
    return c?.condonada ? { ...t, condonada: true, motivoCondonacion: c.motivo } : t
  })
}

// Stats por restaurante para usar en RestaurantCard del Dashboard.
export function statsRestaurante({ group, people, attendance, schedules, active, tarifas, condonaciones, settings, turnos, personOverrides = {} }) {
  const empleadosLocal = (people || []).filter(p => p.groupId === group.id)
  const { ini, fin } = semanaActual()
  const semana = attendanceEnRango(attendance, ini, fin).filter(a => a.groupId === group.id)
  const fichados = (active || []).filter(a => a.groupId === group.id).length

  // Horas semana (todos los empleados)
  const horas = sumarHoras(semana)

  // Planilla estimada
  const fichajesPorPersona = groupByPerson(semana)
  const tardanzasFiltradas = tardanzasConCondonacion(attendance, schedules, condonaciones, ini, fin, turnos, personOverrides)
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
  const tardanzasGlob = tardanzasConCondonacion(rest.attendance, rest.schedules, rest.condonaciones, ini, fin, rest.turnos, rest.personOverrides)
  const semana = attendanceEnRango(rest.attendance, ini, fin)
  const totalFichG = semana.length
  const conTard = tardanzasGlob.filter(t => !t.condonada).length
  const punt = totalFichG > 0 ? Math.round(((totalFichG - conTard) / totalFichG) * 100) : 100
  return { totalEmpleados: totalEmp, horasSemana: horas, planillaSemana: planilla, puntualidadGlobal: punt }
}

// Helper interno: resuelve estado, mins tarde, horas y turno para un día.
// Prioridad: turno custom de la semana > default por día del empleado > schedule legacy.
function resolverDia({ emp, day, fichajesEmp, sched, condonaciones, turnos, personOverrides = {}, weekKeyOverride }) {
  const dayStr = format(day, 'yyyy-MM-dd')
  const fich = fichajesEmp.find(a => a.date === dayStr)
  const dow = day.getDay() === 0 ? 7 : day.getDay()
  const wk = weekKeyOverride || isoWeekKey(day)

  const celdaTurno = normalizarCelda(turnos?.[wk]?.[emp.id]?.[String(dow)])
  let startTimeProgramado = null
  let endTimeProgramado = null
  let programado = false
  let turnoCustom = false

  if (celdaTurno?.tipo === 'OFF') {
    programado = false  // OFF explícito
  } else if (celdaTurno?.startTime) {
    startTimeProgramado = celdaTurno.startTime
    endTimeProgramado = celdaTurno.endTime
    programado = true
    turnoCustom = true
  } else {
    // Sin celda explícita → usar default por día (defaultWeek > schedule legacy)
    const def = getDefaultParaDia(emp.id, dow, personOverrides, sched)
    if (def?.tipo === 'OFF') {
      programado = false
    } else if (def?.startTime) {
      startTimeProgramado = def.startTime
      endTimeProgramado = def.endTime
      programado = true
    }
  }

  if (!programado) {
    if (!fich) return { state: 'idle', day, dayStr }
    // Vino en su día libre: mostrar fichaje aunque siga fichando ahora.
    // Si no hay clockOut, calculamos horas hasta el momento actual.
    const outRef = fich.clockOut ? new Date(fich.clockOut) : new Date()
    const horasLibre = (outRef - new Date(fich.clockIn)) / 3600000
    return {
      state: 'good', day, dayStr, fichaje: fich, horas: horasLibre,
      mins: 0,
      programadoStart: null, programadoEnd: null,
      salidaState: fich.clockOut ? null : 'sinSalida',
      minSalidaDiff: null,
      motivoColor: 'diaLibreTrabajado',
      turnoCustom: false,
    }
  }
  if (!fich) return {
    state: 'idle', day, dayStr, falto: true,
    motivoColor: 'falta',
    programadoStart: startTimeProgramado,
    programadoEnd: endTimeProgramado,
  }

  // ENTRADA
  let state = 'good'
  let mins = 0
  if (startTimeProgramado && fich.clockIn) {
    mins = minutosTarde(startTimeProgramado, fich.clockIn)
    if (mins > 0) state = mins < 15 ? 'warn' : 'bad'
    if (condonaciones?.[fich.id]?.condonada) state = 'good'
  }

  // SALIDA: comparar clockOut vs endTimeProgramado
  // Tolerancia: ±5 min "a tiempo". EXTRA solo si se quedó >30 min después
  // (regla del local: quedadas cortas no cuentan como hora extra).
  const SALIDA_TOLERANCE = 5
  const EXTRA_UMBRAL = 30
  let salidaState = null     // 'aTiempo' | 'temprano' | 'extras' | 'sinSalida'
  let minSalidaDiff = null   // signo: + = se quedó después, - = se fue antes
  if (!fich.clockOut && fich.clockIn) {
    salidaState = 'sinSalida'
  } else if (fich.clockOut && endTimeProgramado) {
    const diff = minutosDiff(endTimeProgramado, fich.clockOut)
    if (diff != null) {
      minSalidaDiff = diff
      if (diff > EXTRA_UMBRAL) salidaState = 'extras'
      else if (diff < -SALIDA_TOLERANCE) salidaState = 'temprano'
      else salidaState = 'aTiempo'
    }
  }

  // motivoColor combinado: prioriza la "razón principal" para visualización rápida.
  // Orden: falta > tardeEntrada > sinSalida > salidaTemprana > extras > aTiempo
  let motivoColor = 'aTiempo'
  if (mins > 0) motivoColor = 'tardeEntrada'
  else if (salidaState === 'sinSalida') motivoColor = 'sinSalida'
  else if (salidaState === 'temprano') motivoColor = 'salidaTemprana'
  else if (salidaState === 'extras') motivoColor = 'extras'

  // Horas: si está fichando ahora (sin clockOut), calculamos hasta el momento actual
  const outRef = fich.clockOut ? new Date(fich.clockOut) : new Date()
  const horas = (outRef - new Date(fich.clockIn)) / 3600000

  // Minutos extra que SÍ cuentan: solo lo que pasa de 30 min tras la salida programada.
  // Se descartan diffs absurdos (>=600 min = cruce de medianoche mal interpretado).
  const minExtraComputado = (minSalidaDiff != null && minSalidaDiff > 30 && minSalidaDiff < 600)
    ? minSalidaDiff - 30 : 0

  // Anomalía: dato sospechoso ACCIONABLE para revisar (no contamina totales).
  // No incluye cierres post-medianoche de turnos PM (eso es normal, no un error).
  const anomalia = !!(
    salidaState === 'sinSalida' ||                          // no marcó salida
    (horas != null && horas > 16) ||                        // olvidó cerrar → horas absurdas
    mins > 180                                              // entró 3h+ tarde = horario mal configurado
  )

  return {
    state, day, dayStr, fichaje: fich, horas, mins,
    programadoStart: startTimeProgramado,
    programadoEnd: endTimeProgramado,
    salidaState,
    minSalidaDiff,
    minExtraComputado,
    anomalia,
    motivoColor,
    turnoCustom,
  }
}

// VISTA DÍA: detalle de un único día — un empleado por fila con horas exactas.
export function vistaDia({ empleados, attendance, schedules, dia, condonaciones, turnos = null, personOverrides = {} }) {
  const filas = empleados.map(emp => {
    const sched = schedules.find(s => s.personId === emp.id)
    const fichajesEmp = (attendance || []).filter(a => a.personId === emp.id)
    const cell = resolverDia({ emp, day: dia, fichajesEmp, sched, condonaciones, turnos, personOverrides })
    return { empleado: emp, ...cell }
  })
  return filas
}

// VISTA MES: filas = empleados, columnas = todos los días del mes.
export function tablaMensual({ empleados, attendance, schedules, mes, condonaciones, turnos = null, personOverrides = {} }) {
  const ini = startOfMonth(mes)
  const numDias = getDaysInMonth(mes)
  const dias = Array.from({ length: numDias }, (_, i) => addDays(ini, i))

  const filas = empleados.map(emp => {
    const sched = schedules.find(s => s.personId === emp.id)
    const fichajesEmp = (attendance || []).filter(a => a.personId === emp.id)
    const cells = dias.map(day => resolverDia({ emp, day, fichajesEmp, sched, condonaciones, turnos, personOverrides }))
    const totalHoras = cells.reduce((acc, c) => acc + (c.horas || 0), 0)
    const tardanzas = cells.filter(c => c.state === 'warn' || c.state === 'bad').length
    const aTiempo = cells.filter(c => c.state === 'good').length
    const faltas = cells.filter(c => c.falto).length
    return { empleado: emp, cells, totalHoras, tardanzas, aTiempo, faltas }
  })
  return { dias, filas }
}

// Datos para tabla semanal de asistencia: filas por empleado, columnas por día.
export function tablaSemanal({ empleados, attendance, schedules, ini, condonaciones, turnos = null, personOverrides = {} }) {
  const dias = Array.from({ length: 7 }, (_, i) => addDays(ini, i))
  const weekKey = isoWeekKey(ini)
  const filas = empleados.map(emp => {
    const sched = schedules.find(s => s.personId === emp.id)
    const fichajesEmp = (attendance || []).filter(a => a.personId === emp.id)
    const cells = dias.map(day =>
      resolverDia({ emp, day, fichajesEmp, sched, condonaciones, turnos, personOverrides, weekKeyOverride: weekKey })
    )
    const totalHoras = cells.reduce((acc, c) => acc + (c.horas || 0), 0)
    return { empleado: emp, cells, totalHoras }
  })
  return { dias, filas }
}

// Agrega los retrasos (tiempo + multa Bs) y extras (solo lo que pasa de 30 min/día)
// de un conjunto de celdas resueltas. Base del cálculo monetario y de planilla.
//   minTarde:   suma de minutos de retraso de entrada del período
//   multaBs:    suma de multas (regla escalonada calcularMulta)
//   horasExtra: suma de horas extra computadas (solo >30 min/día, descartando anomalías)
//   anomalias:  cantidad de días con datos sospechosos a revisar
export function extrasYRetrasoDeCells(cells) {
  let minExtra = 0, minTarde = 0, multaBs = 0, anomalias = 0
  for (const c of (cells || [])) {
    if (c.anomalia) { anomalias++; continue }  // días raros van a "revisar", no suman a totales
    minExtra += c.minExtraComputado || 0
    if (c.mins > 0) { minTarde += c.mins; multaBs += calcularMulta(c.mins) }
  }
  return { horasExtra: minExtra / 60, minExtra, minTarde, multaBs, anomalias }
}

// Convierte una "celda" resuelta (de vistaDia/tablaSemanal) a una fila plana
// con campos para exportar a Excel/CSV.
export function celdaToRow(empleado, c, nombreLocal) {
  if (c.state === 'idle' && !c.falto) {
    return {
      Fecha: c.dayStr,
      Empleado: empleado.fullName,
      Cargo: empleado.position || '',
      Local: nombreLocal,
      Estado: 'Día libre',
      'Programado entrada': '',
      'Entrada real': '',
      'Min tarde': '',
      'Programado salida': '',
      'Salida real': '',
      'Diff salida (min)': '',
      'Horas trabajadas': '',
    }
  }
  if (c.falto) {
    return {
      Fecha: c.dayStr,
      Empleado: empleado.fullName,
      Cargo: empleado.position || '',
      Local: nombreLocal,
      Estado: 'No fichó',
      'Programado entrada': c.programadoStart || '',
      'Entrada real': '',
      'Min tarde': '',
      'Programado salida': c.programadoEnd || '',
      'Salida real': '',
      'Diff salida (min)': '',
      'Horas trabajadas': '',
    }
  }
  const estadoStr =
    c.motivoColor === 'aTiempo' ? 'A tiempo' :
    c.motivoColor === 'tardeEntrada' ? `Tarde entrada (+${c.mins}min)` :
    c.motivoColor === 'salidaTemprana' ? `Salió ${Math.abs(c.minSalidaDiff || 0)}min antes` :
    c.motivoColor === 'extras' ? `Quedó +${c.minSalidaDiff || 0}min extras` :
    c.motivoColor === 'sinSalida' ? 'Sin salida (activo)' :
    c.motivoColor === 'diaLibreTrabajado' ? 'Vino en día libre' : '—'
  return {
    Fecha: c.dayStr,
    Empleado: empleado.fullName,
    Cargo: empleado.position || '',
    Local: nombreLocal,
    Estado: estadoStr,
    'Programado entrada': c.programadoStart || '',
    'Entrada real': c.fichaje?.clockIn ? formatHora(c.fichaje.clockIn) : '',
    'Min tarde': c.mins || 0,
    'Programado salida': c.programadoEnd || '',
    'Salida real': c.fichaje?.clockOut ? formatHora(c.fichaje.clockOut) : '',
    'Diff salida (min)': c.minSalidaDiff != null ? c.minSalidaDiff : '',
    'Horas trabajadas': c.horas != null ? c.horas.toFixed(2) : '',
  }
}

export const EXPORT_COLUMNS_ASISTENCIA = [
  { label: 'Fecha', accessor: 'Fecha' },
  { label: 'Empleado', accessor: 'Empleado' },
  { label: 'Cargo', accessor: 'Cargo' },
  { label: 'Local', accessor: 'Local' },
  { label: 'Estado', accessor: 'Estado' },
  { label: 'Programado entrada', accessor: 'Programado entrada' },
  { label: 'Entrada real', accessor: 'Entrada real' },
  { label: 'Min tarde', accessor: 'Min tarde' },
  { label: 'Programado salida', accessor: 'Programado salida' },
  { label: 'Salida real', accessor: 'Salida real' },
  { label: 'Diff salida (min)', accessor: 'Diff salida (min)' },
  { label: 'Horas trabajadas', accessor: 'Horas trabajadas' },
]
