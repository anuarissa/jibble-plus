// Genera alertas en tiempo real a partir de los datos de Jibble.
// 🔴 Empleado fichado > 10h sin salir
// 🟡 Apertura sin fichaje 30+ min después del horario
//
// La hora esperada del noshow usa el MISMO resolver que las tardanzas
// (turno semanal > default por día del empleado > schedule real), así la alerta
// dice la hora verdadera del turno y no el default genérico 09:00.
// Locales ocultos (config.locales[id].hidden) no generan alertas.

import { useMemo } from 'react'
import { format } from 'date-fns'
import { buildStartTimeResolver } from '../utils/stats'
import { localOculto } from '../config/employees'

export function useAlerts({ active, schedules, people, attendance, turnos, personOverrides, locales }) {
  return useMemo(() => {
    if (!active || !schedules || !people || !attendance) return []
    const alerts = []
    const ahora = new Date()
    const todayStr = format(ahora, 'yyyy-MM-dd') // fecha LOCAL (toISOString corría el día en UTC-4)

    // 🔴 Activos > 10h
    for (const a of active) {
      const inDate = new Date(a.clockIn)
      const hours = (ahora - inDate) / 3600000
      if (hours > 10) {
        const persona = people.find(p => p.id === a.personId)
        if (!persona) continue
        alerts.push({
          id: `over10_${a.id}`,
          severity: 'bad',
          title: 'Más de 10 horas fichado',
          desc: `${persona.fullName} lleva ${hours.toFixed(1)}h sin salir`,
          personId: a.personId,
          groupId: a.groupId,
        })
      }
    }

    // 🟡 Apertura sin fichaje 30 min después del turno real.
    // Se excluyen los schedules default (isDefault) — sin horario real conocido
    // no se puede afirmar que "debió fichar".
    const schedulesReales = schedules.filter(s => !s.isDefault)
    const resolver = buildStartTimeResolver(turnos || {}, schedulesReales, personOverrides || {})
    const todaysAttendanceByPerson = new Map(
      attendance.filter(x => x.date === todayStr).map(x => [x.personId, x])
    )

    for (const persona of people) {
      const startTime = resolver({ personId: persona.id, date: todayStr, clockIn: null })
      if (!startTime || startTime === 'OFF') continue
      const [sh, sm] = startTime.split(':').map(Number)
      const programada = new Date(ahora)
      programada.setHours(sh, sm, 0, 0)
      const elapsedMin = (ahora - programada) / 60000
      // Solo si ya pasaron 30 min Y el empleado no fichó
      if (elapsedMin > 30 && elapsedMin < 60 * 4 && !todaysAttendanceByPerson.has(persona.id)) {
        alerts.push({
          id: `noshow_${persona.id}`,
          severity: 'warn',
          title: 'Sin fichaje al inicio del turno',
          desc: `${persona.fullName} debió fichar a las ${startTime} (${Math.round(elapsedMin)} min de retraso)`,
          personId: persona.id,
          groupId: persona.groupId,
        })
      }
    }

    return alerts
      .filter(a => !a.groupId || !localOculto(a.groupId, locales))
      .sort((a, b) => (a.severity === 'bad' ? -1 : 1))
  }, [active, schedules, people, attendance, turnos, personOverrides, locales])
}
