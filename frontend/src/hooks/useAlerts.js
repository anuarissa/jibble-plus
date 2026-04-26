// Genera alertas en tiempo real a partir de los datos de Jibble.
// 🔴 Empleado fichado > 10h sin salir
// 🟡 Apertura sin fichaje 30+ min después del horario
// 🟢 Todos del turno ya ficharon (informativa)

import { useMemo } from 'react'

export function useAlerts({ active, schedules, people, attendance }) {
  return useMemo(() => {
    if (!active || !schedules || !people || !attendance) return []
    const alerts = []
    const ahora = new Date()
    const todayStr = ahora.toISOString().slice(0, 10)

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

    // 🟡 Apertura sin fichaje 30 min después
    const dow = ahora.getDay() === 0 ? 7 : ahora.getDay()
    const todaysAttendanceByPerson = new Map(
      attendance.filter(x => x.date === todayStr).map(x => [x.personId, x])
    )

    for (const sched of schedules) {
      if (!sched.daysOfWeek.includes(dow)) continue
      const persona = people.find(p => p.id === sched.personId)
      if (!persona) continue
      const [sh, sm] = sched.startTime.split(':').map(Number)
      const programada = new Date(ahora)
      programada.setHours(sh, sm, 0, 0)
      const elapsedMin = (ahora - programada) / 60000
      // Solo si ya pasaron 30 min Y el empleado no fichó
      if (elapsedMin > 30 && elapsedMin < 60 * 4 && !todaysAttendanceByPerson.has(persona.id)) {
        alerts.push({
          id: `noshow_${persona.id}`,
          severity: 'warn',
          title: 'Sin fichaje al inicio del turno',
          desc: `${persona.fullName} debió fichar a las ${sched.startTime} (${Math.round(elapsedMin)} min de retraso)`,
          personId: persona.id,
          groupId: persona.groupId,
        })
      }
    }

    return alerts.sort((a, b) => (a.severity === 'bad' ? -1 : 1))
  }, [active, schedules, people, attendance])
}
