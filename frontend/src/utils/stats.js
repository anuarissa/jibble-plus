// Derivaciones / agregaciones a partir de los datos brutos de Jibble + config local.
// Consolida lógica que necesitan Dashboard, vistas por restaurante y comparativos.

import { startOfWeek, endOfWeek, format, isWithinInterval, parseISO, addDays, startOfMonth, endOfMonth, getDaysInMonth, getDate } from 'date-fns'
import { detectarTardanzasEnRango, minutosTarde, minutosDiff, calcularMulta } from './lateness'
import { planillaEmpleado, sumarHoras } from './payroll'
import { isoWeekKey, dayOfWeek, getTurnoEfectivo, getDefaultParaDia, normalizarCelda } from './turnos'
import { formatHora } from './format'

// De un conjunto de tramos, devuelve el startTime del tramo cuya entrada está
// MÁS CERCA del clockIn real. Para turnos partidos: así cada fichaje (mañana/tarde)
// se compara contra la entrada de SU tramo. Sin clockIn → primer tramo.
function startTimeDeTramoMasCercano(segments, clockIn) {
  if (!segments?.length) return null
  if (!clockIn) return segments[0].startTime
  let best = segments[0], bestDiff = Infinity
  for (const seg of segments) {
    const d = minutosDiff(seg.startTime, clockIn)
    const abs = d == null ? Infinity : Math.abs(d)
    if (abs < bestDiff) { bestDiff = abs; best = seg }
  }
  return best.startTime
}

// Construye el resolver getStartTimeForFichaje a partir de turnos + schedules + defaults.
// Devuelve "OFF" si el día está marcado off, "HH:MM" si hay hora programada, o null si no hay nada.
// En turnos partidos elige el tramo cuya entrada está más cerca del clockIn del fichaje.
export function buildStartTimeResolver(turnos, schedules, personOverrides = {}) {
  const schedByPerson = new Map((schedules || []).map(s => [s.personId, s]))
  return (fichaje) => {
    if (!fichaje?.date) return null
    const wk = isoWeekKey(fichaje.date)
    const dow = dayOfWeek(fichaje.date)
    const celda = normalizarCelda(turnos?.[wk]?.[fichaje.personId]?.[String(dow)])
    // Celda explícita: prevalece
    if (celda?.tipo === 'OFF') return 'OFF'
    if (celda?.segments) return startTimeDeTramoMasCercano(celda.segments, fichaje.clockIn)
    if (celda?.startTime) return celda.startTime
    // celda null o tipo:'default' → usar default por día del empleado
    const sched = schedByPerson.get(fichaje.personId)
    const def = getDefaultParaDia(fichaje.personId, dow, personOverrides, sched)
    if (def?.tipo === 'OFF') return 'OFF'
    if (def?.segments) return startTimeDeTramoMasCercano(def.segments, fichaje.clockIn)
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
  // Recalc puntualidad global desde tardanzas globales — solo de los locales visibles,
  // coherente con el resto de los KPIs (que iteran `groups` ya filtrado).
  const visibleIds = new Set((groups || []).map(g => g.id))
  const { ini, fin } = semanaActual()
  const tardanzasGlob = tardanzasConCondonacion(rest.attendance, rest.schedules, rest.condonaciones, ini, fin, rest.turnos, rest.personOverrides)
    .filter(t => visibleIds.has(t.groupId))
  const semana = attendanceEnRango(rest.attendance, ini, fin).filter(a => visibleIds.has(a.groupId))
  const totalFichG = semana.length
  const conTard = tardanzasGlob.filter(t => !t.condonada).length
  const punt = totalFichG > 0 ? Math.round(((totalFichG - conTard) / totalFichG) * 100) : 100
  return { totalEmpleados: totalEmp, horasSemana: horas, planillaSemana: planilla, puntualidadGlobal: punt }
}

// Resuelve un día de TURNO PARTIDO (≥2 tramos). Empareja, en orden, cada tramo con
// su sesión de fichaje (tramo[i] ↔ sesión[i]) y mide la tardanza de CADA tramo.
//   mins        = suma de minutos tarde de todos los tramos (para mostrar/totalizar)
//   multaDia    = suma de multas por tramo (escalonada por tramo, no por el total)
//   horas       = suma de duraciones reales de cada sesión (excluye el hueco)
//   salida/extra = se miden contra el ÚLTIMO tramo
function resolverDiaPartido({ segments, fichajesDelDia, condonaciones, turnoCustom, day, dayStr }) {
  const SALIDA_TOLERANCE = 5
  const EXTRA_UMBRAL = 30
  const sesiones = [...fichajesDelDia].sort((a, b) =>
    new Date(a.clockIn || a.date) - new Date(b.clockIn || b.date))
  const primera = sesiones[0]
  const ultima = sesiones[sesiones.length - 1]
  const clockOut = ultima?.clockOut || null

  // Tardanza por tramo: asignación ordenada tramo[i] ↔ sesión[i]
  let minsTotal = 0, maxMin = 0, multaDia = 0
  for (let i = 0; i < segments.length; i++) {
    const ses = sesiones[i]
    if (!ses?.clockIn) continue
    let m = minutosTarde(segments[i].startTime, ses.clockIn)
    if (condonaciones?.[ses.id]?.condonada) m = 0
    if (m > 0) { minsTotal += m; multaDia += calcularMulta(m); if (m > maxMin) maxMin = m }
  }

  // Horas reales = suma de duraciones de cada sesión (sin contar el hueco entre tramos)
  let horas = 0
  for (const s of sesiones) {
    if (s.clockIn && s.clockOut) horas += (new Date(s.clockOut) - new Date(s.clockIn)) / 3600000
    else if (s.clockIn && !s.clockOut) horas += (new Date() - new Date(s.clockIn)) / 3600000
  }

  // Horas programadas = suma de los tramos
  let horasProgramadas = 0
  for (const seg of segments) {
    const [sh, sm] = seg.startTime.split(':').map(Number)
    const [eh, em] = seg.endTime.split(':').map(Number)
    let d = (eh * 60 + em) - (sh * 60 + sm)
    if (d < 0) d += 24 * 60
    horasProgramadas += d / 60
  }

  // Salida: contra el fin del ÚLTIMO tramo
  const ultimaSeg = segments[segments.length - 1]
  const algunaSinSalida = sesiones.some(s => s.clockIn && !s.clockOut)
  const algunaSinEntrada = sesiones.some(s => !s.clockIn && s.clockOut)
  let salidaState = null, minSalidaDiff = null
  if (algunaSinSalida) salidaState = 'sinSalida'
  else if (algunaSinEntrada) salidaState = 'sinEntrada'
  else if (clockOut) {
    const diff = minutosDiff(ultimaSeg.endTime, clockOut)
    if (diff != null) {
      minSalidaDiff = diff
      if (diff > EXTRA_UMBRAL) salidaState = 'extras'
      else if (diff < -SALIDA_TOLERANCE) salidaState = 'temprano'
      else salidaState = 'aTiempo'
    }
  }

  // Registro incompleto: alguna sesión con solo ingreso o solo salida.
  const registroIncompleto = sesiones.some(s => (!!s.clockIn) !== (!!s.clockOut))

  let state = 'good'
  if (minsTotal > 0) state = maxMin < 15 ? 'warn' : 'bad'

  let motivoColor = 'aTiempo'
  if (salidaState === 'sinEntrada') motivoColor = 'sinSalida'
  else if (minsTotal > 0) motivoColor = 'tardeEntrada'
  else if (salidaState === 'sinSalida') motivoColor = 'sinSalida'
  else if (salidaState === 'temprano') motivoColor = 'salidaTemprana'
  else if (salidaState === 'extras') motivoColor = 'extras'

  const horasPagables = (registroIncompleto || horas > 16) ? horasProgramadas : horas
  const minExtraComputado = (minSalidaDiff != null && minSalidaDiff > 30 && minSalidaDiff < 600)
    ? minSalidaDiff - 30 : 0
  const anomalia = !!(registroIncompleto || horas > 16 || maxMin > 180 ||
    (minSalidaDiff != null && minSalidaDiff < -180))

  return {
    state, day, dayStr,
    fichaje: clockOut ? { ...primera, clockOut } : primera,
    horas, mins: minsTotal, multaDia,
    programadoStart: segments[0].startTime,
    programadoEnd: ultimaSeg.endTime,
    segments,
    salidaState, minSalidaDiff, minExtraComputado,
    horasProgramadas, horasPagables, registroIncompleto, anomalia,
    motivoColor, turnoCustom, esPartido: true,
  }
}

// Helper interno: resuelve estado, mins tarde, horas y turno para un día.
// Prioridad: turno custom de la semana > default por día del empleado > schedule legacy.
function resolverDia({ emp, day, fichajesEmp, sched, condonaciones, turnos, personOverrides = {}, weekKeyOverride }) {
  const dayStr = format(day, 'yyyy-MM-dd')
  const fichajesDelDia = fichajesEmp.filter(a => a.date === dayStr)
  const fich = fichajesDelDia[0]
  const dow = day.getDay() === 0 ? 7 : day.getDay()
  const wk = weekKeyOverride || isoWeekKey(day)

  const celdaTurno = normalizarCelda(turnos?.[wk]?.[emp.id]?.[String(dow)])
  let startTimeProgramado = null
  let endTimeProgramado = null
  let segmentsProgramado = null
  let programado = false
  let turnoCustom = false
  // sinHorario: no hay NINGUNA fuente real de horario para ese día (ni turno de la
  // semana, ni OFF explícito, ni defaultWeek del empleado). No se puede evaluar:
  // ni falta, ni tardanza, ni horas programadas. Distinto de "día libre" (OFF real).
  let sinHorario = false

  if (celdaTurno?.tipo === 'OFF') {
    programado = false  // OFF explícito
  } else if (celdaTurno?.startTime) {
    startTimeProgramado = celdaTurno.startTime
    endTimeProgramado = celdaTurno.endTime
    segmentsProgramado = celdaTurno.segments || null
    programado = true
    turnoCustom = true
  } else {
    // Sin celda explícita → usar default por día (defaultWeek > schedule real)
    const def = getDefaultParaDia(emp.id, dow, personOverrides, sched)
    if (def?.tipo === 'OFF') {
      programado = false
    } else if (def?.startTime) {
      startTimeProgramado = def.startTime
      endTimeProgramado = def.endTime
      segmentsProgramado = def.segments || null
      programado = true
    } else {
      sinHorario = true
    }
  }

  if (!programado) {
    // Sin horario cargado: si fichó, sus horas cuentan (no sabemos su turno);
    // si no fichó, no es falta — no sabemos si debía venir.
    if (sinHorario) {
      if (!fich) return { state: 'idle', day, dayStr, sinHorario: true, motivoColor: 'sinHorario' }
      const outRefSH = fich.clockOut ? new Date(fich.clockOut) : new Date()
      const horasSH = (outRefSH - new Date(fich.clockIn)) / 3600000
      const dudosoSH = !fich.clockIn || !fich.clockOut || horasSH > 16
      return {
        state: 'good', day, dayStr, fichaje: fich,
        // Sin horario no hay a qué compararlo: si el registro está incompleto no se
        // pueden estimar horas (tampoco se cobra el no-registro: el día no se evalúa).
        horas: dudosoSH ? 0 : horasSH,
        mins: 0,
        programadoStart: null, programadoEnd: null,
        salidaState: fich.clockOut ? null : 'sinSalida',
        minSalidaDiff: null,
        horasProgramadas: 0,
        horasPagables: dudosoSH ? 0 : horasSH,
        registroIncompleto: false,
        anomalia: dudosoSH,
        sinHorario: true,
        motivoColor: 'sinHorario',
        turnoCustom: false,
      }
    }
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

  // TURNO PARTIDO: el día tiene ≥2 tramos. Se evalúa cada tramo por separado
  // (tardanza por tramo) y las horas/salida se calculan sobre todas las sesiones.
  if (segmentsProgramado && segmentsProgramado.length >= 2) {
    return resolverDiaPartido({ segments: segmentsProgramado, fichajesDelDia, condonaciones, turnoCustom, day, dayStr })
  }

  // ENTRADA
  let state = 'good'
  let mins = 0
  const condonada = !!condonaciones?.[fich.id]?.condonada
  if (startTimeProgramado && fich.clockIn) {
    mins = minutosTarde(startTimeProgramado, fich.clockIn)
    if (mins > 0) state = mins < 15 ? 'warn' : 'bad'
    if (condonada) state = 'good'
  }

  const tieneEntrada = !!fich.clockIn
  const tieneSalida = !!fich.clockOut

  // SALIDA: comparar clockOut vs endTimeProgramado
  // Tolerancia: ±5 min "a tiempo". EXTRA solo si se quedó >30 min después
  // (regla del local: quedadas cortas no cuentan como hora extra).
  const SALIDA_TOLERANCE = 5
  const EXTRA_UMBRAL = 30
  let salidaState = null     // 'aTiempo' | 'temprano' | 'extras' | 'sinSalida' | 'sinEntrada'
  let minSalidaDiff = null   // signo: + = se quedó después, - = se fue antes
  if (tieneEntrada && !tieneSalida) {
    salidaState = 'sinSalida'
  } else if (!tieneEntrada && tieneSalida) {
    salidaState = 'sinEntrada'     // marcó solo salida (sin ingreso)
  } else if (tieneSalida && endTimeProgramado) {
    const diff = minutosDiff(endTimeProgramado, fich.clockOut)
    if (diff != null) {
      minSalidaDiff = diff
      if (diff > EXTRA_UMBRAL) salidaState = 'extras'
      else if (diff < -SALIDA_TOLERANCE) salidaState = 'temprano'
      else salidaState = 'aTiempo'
    }
  }

  // motivoColor combinado: prioriza la "razón principal" para visualización rápida.
  let motivoColor = 'aTiempo'
  if (salidaState === 'sinEntrada') motivoColor = 'sinSalida'  // registro incompleto (sin ingreso)
  else if (mins > 0) motivoColor = 'tardeEntrada'
  else if (salidaState === 'sinSalida') motivoColor = 'sinSalida'
  else if (salidaState === 'temprano') motivoColor = 'salidaTemprana'
  else if (salidaState === 'extras') motivoColor = 'extras'

  // Horas reales (si tiene ambos fichajes). Si falta uno, no son confiables.
  let horas = 0
  if (tieneEntrada && tieneSalida) {
    horas = (new Date(fich.clockOut) - new Date(fich.clockIn)) / 3600000
  } else if (tieneEntrada && !tieneSalida) {
    // fichando ahora (sin cerrar): estimación hasta el momento actual (puede inflarse)
    horas = (new Date() - new Date(fich.clockIn)) / 3600000
  }

  // Horas programadas del día (para pagar días con registro incompleto u horas absurdas).
  let horasProgramadas = 0
  if (startTimeProgramado && endTimeProgramado) {
    const [sh, sm] = startTimeProgramado.split(':').map(Number)
    const [eh, em] = endTimeProgramado.split(':').map(Number)
    let mins2 = (eh * 60 + em) - (sh * 60 + sm)
    if (mins2 < 0) mins2 += 24 * 60   // cruza medianoche
    horasProgramadas = mins2 / 60
  }

  // Registro incompleto: marcó solo ingreso o solo salida → descuento fijo (no-registro).
  const registroIncompleto = (tieneEntrada && !tieneSalida) || (!tieneEntrada && tieneSalida)

  // Horas PAGABLES: en días incompletos u horas absurdas, se paga el horario programado.
  let horasPagables
  if (registroIncompleto || horas > 16) horasPagables = horasProgramadas
  else horasPagables = horas

  // Minutos extra que SÍ cuentan: solo lo que pasa de 30 min tras la salida programada.
  const minExtraComputado = (minSalidaDiff != null && minSalidaDiff > 30 && minSalidaDiff < 600)
    ? minSalidaDiff - 30 : 0

  // Anomalía: dato sospechoso ACCIONABLE para revisar (no contamina totales).
  // No incluye cierres post-medianoche de turnos PM (eso es normal).
  const anomalia = !!(
    registroIncompleto ||           // marcó solo ingreso o solo salida
    horas > 16 ||                   // olvidó cerrar → horas absurdas
    mins > 180 ||                   // entró 3h+ tarde = horario mal configurado
    (minSalidaDiff != null && minSalidaDiff < -180)  // salió 3h+ antes = idem (ej. turno PM cargado a alguien que trabaja AM)
  )

  return {
    state, day, dayStr, fichaje: fich, horas, mins,
    condonada,                      // la tardanza fue perdonada → no genera multa
    programadoStart: startTimeProgramado,
    programadoEnd: endTimeProgramado,
    salidaState,
    minSalidaDiff,
    minExtraComputado,
    horasProgramadas,
    horasPagables,
    registroIncompleto,
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

export const MULTA_NO_REGISTRO = 20  // Bs por día con registro incompleto (falta ingreso o salida)

// Agrega retrasos (tiempo + multa Bs), extras (solo lo que pasa de 30 min/día),
// descuento por no-registro y horas pagables de un conjunto de celdas resueltas.
// Base del cálculo monetario y de planilla.
//   minTarde:            suma de minutos de retraso de entrada (1–180; >180 = horario mal config, se ignora)
//   multaBs:             suma de multas por tardanza (regla escalonada). Se ACUMULA con el no-registro.
//   horasExtra:          horas extra (solo >30 min/día, descartando días incompletos)
//   diasNoRegistro:      cantidad de días con registro incompleto
//   descuentoNoRegistro: 20 Bs × diasNoRegistro
//   horasPagables:       horas que SÍ se pagan (días incompletos/absurdos → horario programado)
//   anomalias:           cantidad de días con datos a revisar
export function extrasYRetrasoDeCells(cells) {
  let minExtra = 0, minTarde = 0, multaBs = 0, anomalias = 0
  let diasNoRegistro = 0, descuentoNoRegistro = 0, horasPagables = 0
  for (const c of (cells || [])) {
    horasPagables += c.horasPagables || 0
    if (c.registroIncompleto) { diasNoRegistro++; descuentoNoRegistro += MULTA_NO_REGISTRO }
    // Tardanza real (1–180 min): se acumula aunque el día sea incompleto. >180 = horario mal config.
    // La multa NO se cobra si la tardanza fue condonada. En turnos partidos la multa
    // viene precalculada por tramo (multaDia, que ya excluye los tramos condonados).
    if (c.mins > 0 && c.mins <= 180) {
      minTarde += c.mins
      if (!c.condonada) multaBs += (c.multaDia != null ? c.multaDia : calcularMulta(c.mins))
    }
    // Extra solo en días no anómalos (no incompletos)
    if (!c.anomalia) minExtra += c.minExtraComputado || 0
    if (c.anomalia) anomalias++
  }
  return { horasExtra: minExtra / 60, minExtra, minTarde, multaBs,
           diasNoRegistro, descuentoNoRegistro, horasPagables, anomalias }
}

// Explica en lenguaje claro por qué un día "no cuadra" y qué se hizo con él.
// Devuelve null si el día está bien. Se muestra en rojo junto al día.
export function comentarioAnomalia(c) {
  if (!c) return null
  if (c.sinHorario) {
    if (c.anomalia) return 'Sin horario cargado y registro incompleto — no se pueden calcular sus horas. Carga la planilla del mes en Turnos.'
    if (c.fichaje) return 'Sin horario cargado: se pagan las horas fichadas, pero no se evalúa tardanza ni salida.'
    return 'Sin horario cargado ese día — no se evalúa (no cuenta como falta).'
  }
  if (!c.anomalia) return null
  // Orden: primero lo que rompe el dato del día, después lo que delata un horario mal cargado.
  if (c.salidaState === 'sinEntrada') return 'Fichó salida sin entrada — se pagan las horas programadas y se descuentan 20 Bs por no-registro.'
  if (c.registroIncompleto) return 'Fichó entrada pero no salida — se pagan las horas programadas y se descuentan 20 Bs por no-registro.'
  if (c.horas > 16) return 'Horas absurdas (olvidó cerrar el fichaje) — se pagan las horas programadas, no las fichadas.'
  if (c.mins > 180) return `Entró ${Math.floor(c.mins / 60)}h ${c.mins % 60}min tarde: el horario cargado no coincide con la realidad. No se cobra multa — revisa el Excel de turnos.`
  if (c.minSalidaDiff != null && c.minSalidaDiff < -180) {
    const h = Math.round(Math.abs(c.minSalidaDiff) / 60)
    return `Salió ${h}h antes de su salida programada (${c.programadoStart}–${c.programadoEnd}): ese horario no es el que trabaja. Corrige su horario base en Empleados o carga el turno real del Excel.`
  }
  return 'Datos a revisar.'
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
      Estado: c.sinHorario ? 'Sin horario cargado' : 'Día libre',
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
    c.motivoColor === 'sinHorario' ? 'Sin horario cargado' :
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
