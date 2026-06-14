// Helpers para turnos rotativos por semana.
//
// Storage shape (en localStorage.jibble_turnos_v1):
//   { [weekKey]: { [personId]: { [dow: 1..7]: Celda } } }
//
// Celda puede ser:
//   - { startTime, endTime, nota?: string }  — turno explícito
//   - { tipo: "OFF", nota?: string }         — día libre explícito (cambio respecto al default)
//   - "OFF"                                   — formato legacy, equivalente a { tipo:"OFF" }
//   - null/undefined                          — usar el default del empleado para ese día

import { getISOWeek, getISOWeekYear, parseISO, addDays, startOfISOWeek } from 'date-fns'
import { EMPLOYEE_OVERRIDES } from '../config/employees'

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

// Normaliza el shape de una celda. Devuelve uno de:
//   { startTime, endTime, nota? }               → trabajo explícito (un tramo)
//   { startTime, endTime, segments:[...], nota? } → turno partido (≥2 tramos)
//   { tipo: 'OFF', nota? }            → libre explícito
//   { tipo: 'default', nota }         → sin valor explícito (usa default) pero con nota
//   null                              → vacío total
// En partidos: startTime/endTime = span del día (1er inicio, último fin) por
// compatibilidad con el código que no conoce tramos; segments tiene el detalle.
export function normalizarCelda(raw) {
  if (raw == null) return null
  if (raw === 'OFF') return { tipo: 'OFF' }
  if (typeof raw === 'object') {
    if (raw.tipo === 'OFF') return { tipo: 'OFF', ...(raw.nota ? { nota: raw.nota } : {}) }
    if (raw.tipo === 'default') return raw.nota ? { tipo: 'default', nota: raw.nota } : null
    const segs = normalizarSegments(raw.segments)
    if (segs && segs.length >= 2) {
      const out = { startTime: segs[0].startTime, endTime: segs[segs.length - 1].endTime, segments: segs }
      if (raw.nota) out.nota = raw.nota
      return out
    }
    if (raw.startTime && raw.endTime) {
      const out = { startTime: raw.startTime, endTime: raw.endTime }
      if (raw.nota) out.nota = raw.nota
      return out
    }
  }
  return null
}

// Valida y limpia un array de tramos. Devuelve [{startTime,endTime}, ...] o null.
function normalizarSegments(segs) {
  if (!Array.isArray(segs)) return null
  const out = []
  for (const s of segs) {
    if (s && s.startTime && s.endTime) out.push({ startTime: s.startTime, endTime: s.endTime })
  }
  return out.length ? out : null
}

// Default por día del empleado.
// Prioridad:
//   1) defaultWeek del usuario (localStorage) — editable desde Empleados
//   2) defaultWeek hardcodeado (EMPLOYEE_OVERRIDES de config/employees.js)
//   3) schedule legacy (mismo horario todos los días)
//   4) null
// Devuelve { startTime, endTime } | { tipo:'OFF' } | null.
export function getDefaultParaDia(personId, dow, personOverrides, schedule) {
  const dwUser = personOverrides?.[personId]?.defaultWeek
  if (dwUser) {
    const c = normalizarCelda(dwUser[String(dow)])
    if (c) return c
    return null
  }
  const dwHard = EMPLOYEE_OVERRIDES?.[personId]?.defaultWeek
  if (dwHard) {
    const c = normalizarCelda(dwHard[String(dow)])
    if (c) return c
    return null
  }
  if (schedule?.daysOfWeek?.includes(dow) && schedule.startTime && schedule.endTime) {
    return { startTime: schedule.startTime, endTime: schedule.endTime }
  }
  return null
}

// True si la celda explícita representa un cambio respecto al default.
//   - tipo:'default' (solo nota, sin valor) → no es excepción
//   - sin default y celda OFF → no es cambio real (nada que cubrir)
export function esExcepcion(celdaExplicita, defaultParaDia) {
  const c = normalizarCelda(celdaExplicita)
  const d = defaultParaDia
  if (!c && !d) return false
  if (!c || c.tipo === 'default') return false
  if (!d) return c.tipo !== 'OFF' // celda OFF sin default → no es cambio
  if (c.tipo === 'OFF' && d.tipo === 'OFF') return false
  if (c.tipo === 'OFF' || d.tipo === 'OFF') return true
  // Comparar por texto cubre turnos simples y partidos (segments).
  return turnoToText(c) !== turnoToText(d)
}

// Tipo de cambio para mostrar badge: 'cambio-horario' | 'cambio-off' | 'cubre' | null
export function tipoExcepcion(celdaExplicita, defaultParaDia) {
  const c = normalizarCelda(celdaExplicita)
  const d = defaultParaDia
  if (!c || c.tipo === 'default') return null
  if (c.tipo === 'OFF' && d && d.tipo !== 'OFF') return 'cambio-off'
  if (c.startTime && (!d || d.tipo === 'OFF')) return 'cubre'
  if (c.startTime && d?.startTime && turnoToText(c) !== turnoToText(d)) return 'cambio-horario'
  return null
}

// Resuelve el turno efectivo para (semana, persona, día) considerando default.
// Devuelve { startTime, endTime, segments?, fuente: 'turno'|'default' } | null.
// segments solo está presente en turnos partidos (≥2 tramos).
export function getTurnoEfectivo(turnos, weekKey, personId, dow, schedule, personOverrides = {}) {
  const celda = normalizarCelda(turnos?.[weekKey]?.[personId]?.[String(dow)])
  if (celda?.tipo === 'OFF') return null
  if (celda?.startTime) {
    return { startTime: celda.startTime, endTime: celda.endTime, ...(celda.segments ? { segments: celda.segments } : {}), fuente: 'turno' }
  }
  // celda con tipo:'default' o null → usar default
  const def = getDefaultParaDia(personId, dow, personOverrides, schedule)
  if (def?.tipo === 'OFF') return null
  if (def?.startTime) return { startTime: def.startTime, endTime: def.endTime, ...(def.segments ? { segments: def.segments } : {}), fuente: 'default' }
  return null
}

// Para fichaje específico, retorna la hora programada en formato "HH:MM" o null
export function getProgramadoParaFichaje(turnos, schedule, fichaje, personOverrides = {}) {
  if (!fichaje?.date) return null
  const wk = isoWeekKey(fichaje.date)
  const dow = dayOfWeek(fichaje.date)
  const turno = getTurnoEfectivo(turnos, wk, fichaje.personId, dow, schedule, personOverrides)
  return turno?.startTime ?? null
}

// Cuenta cambios respecto al default para los empleados de una semana.
// Devuelve [{ personId, fullName, dow, default, celda, tipo, nota? }]
export function contarCambios(semanaTurnos, empleados, schedules, personOverrides = {}) {
  const cambios = []
  if (!semanaTurnos) return cambios
  for (const emp of empleados) {
    const sched = schedules?.find(s => s.personId === emp.id)
    const personDays = semanaTurnos[emp.id] || {}
    for (let dow = 1; dow <= 7; dow++) {
      const celda = personDays[String(dow)]
      const def = getDefaultParaDia(emp.id, dow, personOverrides, sched)
      if (esExcepcion(celda, def)) {
        const norm = normalizarCelda(celda)
        cambios.push({
          personId: emp.id,
          fullName: emp.fullName,
          dow,
          defaultDia: def,
          celda: norm,
          tipo: tipoExcepcion(celda, def),
          nota: norm?.nota || null,
        })
      }
    }
  }
  return cambios
}

// Convierte celda almacenada a string para mostrar/exportar.
// "08:00-16:00" | "09:00-16:00 + 18:00-23:00" (partido) | "OFF" | ""
export function turnoToText(celda) {
  const c = normalizarCelda(celda)
  if (!c) return ''
  if (c.tipo === 'OFF') return 'OFF'
  if (c.segments) return c.segments.map(s => `${s.startTime}-${s.endTime}`).join(' + ')
  if (c.startTime && c.endTime) return `${c.startTime}-${c.endTime}`
  return ''
}

// Parsea un rango "HH:MM-HH:MM" (acepta 8-16, 08:00-16:00) → { startTime, endTime, startMin, endMin }
// Lanza error si el formato no se reconoce o la salida no es posterior a la entrada.
function parseRango(s) {
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?-(\d{1,2})(?::(\d{2}))?$/)
  if (!m) throw new Error(`Formato no reconocido: "${s}"`)
  const [, h1, m1 = '00', h2, m2 = '00'] = m
  const startTime = `${String(h1).padStart(2,'0')}:${m1}`
  const endTime = `${String(h2).padStart(2,'0')}:${m2}`
  const startMin = parseInt(h1) * 60 + parseInt(m1)
  const endMin = parseInt(h2) * 60 + parseInt(m2)
  if (endMin <= startMin) throw new Error(`Salida (${endTime}) debe ser después que entrada (${startTime})`)
  return { startTime, endTime, startMin, endMin }
}

// Parser inverso. Devuelve:
//   { startTime, endTime }                          → un solo tramo
//   { startTime, endTime, segments:[...] }          → turno partido ("R1 + R2")
//   "OFF" | null (si vacío) | error con throw
export function textToTurno(raw) {
  if (raw == null) return null
  const s = String(raw).trim().toUpperCase().replace(/\s+/g, '')
  if (!s) return null
  if (s === 'OFF' || s === 'LIBRE' || s === '-') return 'OFF'
  // Turno partido: varios rangos separados por "+" (ej "09:00-16:00+18:00-23:00")
  const partes = s.split('+').filter(Boolean)
  if (partes.length === 1) {
    const r = parseRango(partes[0])
    return { startTime: r.startTime, endTime: r.endTime }
  }
  const rangos = partes.map(parseRango).sort((a, b) => a.startMin - b.startMin)
  // Validar que no se solapen
  for (let i = 1; i < rangos.length; i++) {
    if (rangos[i].startMin < rangos[i - 1].endMin) {
      throw new Error(`Los tramos se solapan: "${raw}"`)
    }
  }
  const segments = rangos.map(r => ({ startTime: r.startTime, endTime: r.endTime }))
  return { startTime: segments[0].startTime, endTime: segments[segments.length - 1].endTime, segments }
}

// Días de la semana en español (orden Lun..Dom)
export const DIAS_LABEL = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
export const DIAS_LARGO = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
