// Helpers para turnos rotativos por semana.
// Storage shape (en localStorage.jibble_turnos_v1):
//   { [weekKey]: { [personId]: { [dow: 1..7]: { startTime, endTime } | "OFF" } } }

import { getISOWeek, getISOWeekYear, parseISO, addDays, startOfISOWeek } from 'date-fns'

// "2026-W17" — usado como clave de semana
export function isoWeekKey(date) {
  const d = typeof date === 'string' ? parseISO(date) : date
  const year = getISOWeekYear(d)
  const week = getISOWeek(d)
  return `${year}-W${String(week).padStart(2, '0')}`
}

// dow: 1 (Lun) ... 7 (Dom). Date#getDay() devuelve 0..6 con 0=Dom; convertimos.
export function dayOfWeek(date) {
  const d = typeof date === 'string' ? parseISO(date) : date
  const js = d.getDay()
  return js === 0 ? 7 : js
}

export function lunesDeSemana(date) {
  const d = typeof date === 'string' ? parseISO(date) : date
  return startOfISOWeek(d)
}

// Genera la weekKey de la semana anterior a la dada
export function semanaAnteriorKey(weekKey) {
  // weekKey "2026-W17" → busca cualquier día de esa semana, le resta 7
  const [yearStr, weekPart] = weekKey.split('-W')
  const week = parseInt(weekPart)
  // 4 de enero del año está en la semana 1 ISO de ese año (regla)
  const ene4 = new Date(parseInt(yearStr), 0, 4)
  const lunW1 = startOfISOWeek(ene4)
  const lunActual = addDays(lunW1, (week - 1) * 7)
  const lunAnterior = addDays(lunActual, -7)
  return isoWeekKey(lunAnterior)
}

// Resuelve el turno efectivo para (semana, persona, día):
//   - Si hay turno custom en esa celda → lo devuelve
//   - "OFF" → null (no debe trabajar)
//   - Si no, fallback al schedule fijo (si esos días incluyen el dow)
//   - Si tampoco, null
export function getTurnoEfectivo(turnos, weekKey, personId, dow, schedule) {
  const celda = turnos?.[weekKey]?.[personId]?.[String(dow)]
  if (celda === 'OFF') return null
  if (celda && typeof celda === 'object' && celda.startTime && celda.endTime) {
    return { startTime: celda.startTime, endTime: celda.endTime }
  }
  // Fallback al schedule fijo del empleado
  if (schedule?.daysOfWeek?.includes(dow) && schedule.startTime && schedule.endTime) {
    return { startTime: schedule.startTime, endTime: schedule.endTime }
  }
  return null
}

// Para fichaje específico, retorna la hora programada en formato "HH:MM" o null
export function getProgramadoParaFichaje(turnos, schedule, fichaje) {
  if (!fichaje?.date) return null
  const wk = isoWeekKey(fichaje.date)
  const dow = dayOfWeek(fichaje.date)
  const turno = getTurnoEfectivo(turnos, wk, fichaje.personId, dow, schedule)
  return turno?.startTime ?? null
}

// Convierte celda almacenada a string para mostrar/exportar.
// "08:00-16:00" | "OFF" | ""
export function turnoToText(celda) {
  if (celda === 'OFF') return 'OFF'
  if (celda?.startTime && celda?.endTime) return `${celda.startTime}-${celda.endTime}`
  return ''
}

// Parser inverso: "08:00-16:00" → { startTime, endTime } | "OFF" | null si vacío | error con throw
export function textToTurno(raw) {
  if (raw == null) return null
  const s = String(raw).trim().toUpperCase().replace(/\s+/g, '')
  if (!s) return null
  if (s === 'OFF' || s === 'LIBRE' || s === '-') return 'OFF'
  // Formatos aceptados: 08:00-16:00, 8:00-16:00, 08-16, 8-16
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?-(\d{1,2})(?::(\d{2}))?$/)
  if (!m) throw new Error(`Formato no reconocido: "${raw}"`)
  const [, h1, m1 = '00', h2, m2 = '00'] = m
  const startTime = `${String(h1).padStart(2,'0')}:${m1}`
  const endTime = `${String(h2).padStart(2,'0')}:${m2}`
  // Validar
  const startMin = parseInt(h1) * 60 + parseInt(m1)
  const endMin = parseInt(h2) * 60 + parseInt(m2)
  if (endMin <= startMin) throw new Error(`Salida (${endTime}) debe ser después que entrada (${startTime})`)
  return { startTime, endTime }
}

// Días de la semana en español (orden Lun..Dom)
export const DIAS_LABEL = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
export const DIAS_LARGO = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
