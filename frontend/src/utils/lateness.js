// Detección y multa de tardanzas — Bolivianos.
// Regla Anuar: tolerancia 0 min (1 min ya es tarde). Multa 10 Bs por cada bloque de 5 min iniciado.
//
// Ejemplos:
//   0 min → 0 Bs   (puntual)
//   1 min → 10 Bs  (bloque 1)
//   5 min → 10 Bs  (bloque 1 todavía)
//   6 min → 20 Bs  (bloque 2)
//   30 min → 60 Bs (bloque 6)

export const FINE_PER_BLOCK = 10  // Bs
export const BLOCK_MINUTES = 5

export function calcularMulta(minutosTarde) {
  if (!minutosTarde || minutosTarde <= 0) return 0
  const bloques = Math.ceil(minutosTarde / BLOCK_MINUTES)
  return bloques * FINE_PER_BLOCK
}

// Calcula minutos de retraso entre hora programada y hora real, en zona Bolivia.
// scheduledStart: "HH:MM" string del workSchedule (interpretado como hora local Bolivia)
// clockIn: ISO timestamp del fichaje real (UTC)
export function minutosTarde(scheduledStart, clockIn) {
  if (!scheduledStart || !clockIn) return 0
  const [sh, sm] = scheduledStart.split(':').map(Number)
  const real = new Date(clockIn) // UTC
  // La hora "programada" es 08:00 hora Bolivia (UTC-4) en el mismo día.
  // Construimos su equivalente UTC: 08:00 Bolivia = 12:00 UTC.
  // Para evitar líos de DST (Bolivia no tiene DST, así que offset siempre -4),
  // usamos un offset fijo. Si en el futuro Bolivia adopta DST, cambiar a date-fns-tz.
  const BOLIVIA_OFFSET_HOURS = 4 // UTC = local + 4
  const realUtcMs = real.getTime()
  // El día calendario en Bolivia es real desplazado -4h.
  const realInBolivia = new Date(realUtcMs - BOLIVIA_OFFSET_HOURS * 3600000)
  // Construimos el "día Bolivia + hora programada" como UTC equivalente:
  const y = realInBolivia.getUTCFullYear()
  const m = realInBolivia.getUTCMonth()
  const d = realInBolivia.getUTCDate()
  // 08:00 Bolivia = 12:00 UTC del mismo día Bolivia
  const programadaUtc = Date.UTC(y, m, d, sh + BOLIVIA_OFFSET_HOURS, sm, 0)
  const diffMin = Math.round((realUtcMs - programadaUtc) / 60000)
  return diffMin > 0 ? diffMin : 0
}

// Severidad para semáforo en UI.
//   verde: 0 min
//   amarillo: 1-14 min
//   rojo: 15+ min
export function severidad(minutosTarde) {
  if (minutosTarde <= 0) return 'good'
  if (minutosTarde < 15) return 'warn'
  return 'bad'
}

// Diferencia con SIGNO entre hora programada (HH:MM, hora Bolivia) y hora real (ISO timestamp UTC).
//   - Positivo: real fue DESPUÉS de la programada (tarde si es entrada, extras si es salida)
//   - Negativo: real fue ANTES (temprano)
//   - 0: a tiempo
// Misma lógica que minutosTarde pero conserva el signo.
export function minutosDiff(scheduledTime, realISO) {
  if (!scheduledTime || !realISO) return null
  const [sh, sm] = scheduledTime.split(':').map(Number)
  const real = new Date(realISO)
  if (isNaN(real)) return null
  const BOLIVIA_OFFSET_HOURS = 4
  const realUtcMs = real.getTime()
  const realInBolivia = new Date(realUtcMs - BOLIVIA_OFFSET_HOURS * 3600000)
  const y = realInBolivia.getUTCFullYear()
  const m = realInBolivia.getUTCMonth()
  const d = realInBolivia.getUTCDate()
  const programadaUtc = Date.UTC(y, m, d, sh + BOLIVIA_OFFSET_HOURS, sm, 0)
  return Math.round((realUtcMs - programadaUtc) / 60000)
}

// Convierte un fichaje crudo a un objeto tardanza completo.
// scheduledStartOverride: si existe, prevalece sobre schedule.startTime
//   (lo usa la lógica de turnos rotativos: cada día puede tener distinta hora).
export function detectarTardanza(attendance, schedule, scheduledStartOverride = null) {
  if (!attendance) return null
  const startTime = scheduledStartOverride || schedule?.startTime
  if (!startTime) return null
  const min = minutosTarde(startTime, attendance.clockIn)
  if (min <= 0) return null
  return {
    id: attendance.id,
    personId: attendance.personId,
    groupId: attendance.groupId,
    date: attendance.date,
    scheduledStart: startTime,
    clockIn: attendance.clockIn,
    minutosTarde: min,
    multa: calcularMulta(min),
    severidad: severidad(min),
  }
}

// Detecta tardanzas en un rango. Si se pasa `getStartTimeForFichaje(fichaje)` resuelve
// la hora programada custom (turnos rotativos). Si la función devuelve null para un
// fichaje (ej: ese día era "OFF"), no se cuenta como tardanza.
export function detectarTardanzasEnRango(attendanceList, schedules, getStartTimeForFichaje = null) {
  const schedByPerson = new Map(schedules.map(s => [s.personId, s]))
  return attendanceList
    .map(a => {
      const sched = schedByPerson.get(a.personId)
      if (getStartTimeForFichaje) {
        const startOverride = getStartTimeForFichaje(a)
        if (startOverride === 'OFF') return null // explícitamente off → no tardanza
        return detectarTardanza(a, sched, startOverride)
      }
      return detectarTardanza(a, sched)
    })
    .filter(Boolean)
}
