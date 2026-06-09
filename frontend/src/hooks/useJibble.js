// Hook centralizado: trae datos de Jibble cada 5 min y aplica overrides del usuario.
// Devuelve: groups, people (con groupId/cargo/schedule resueltos, hidden filtrado),
// schedules, attendance, active.

import { useEffect, useState, useCallback, useMemo } from 'react'
import { format, addDays } from 'date-fns'
import * as jibble from '../api/jibble'
import { getScheduleForPerson, shouldSkipPerson, resolveGroupId, resolveCargo, EMPLOYEE_OVERRIDES } from '../config/employees'
import { useActiveWorkspace } from './useActiveWorkspace'

// Skip hardcoded (Owner) — siempre filtrar, no editable por usuario
function EMPLOYEE_HARDCODED_SKIP(personId) {
  return EMPLOYEE_OVERRIDES[personId]?.skip === true
}

const POLL_MS = 5 * 60 * 1000 // 5 min

export function useJibble(personOverrides = {}) {
  const { active: activeWs } = useActiveWorkspace()
  const [raw, setRaw] = useState({
    groups: null,
    peopleRaw: null,
    schedulesRaw: null, // map { personId → schedule de Jibble }
    attendance: null,
    active: null,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [health, setHealth] = useState(null)

  const wsParam = activeWs && activeWs !== 'all' ? activeWs : undefined

  const fetchAll = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)
      const today = new Date()
      // 60 días: cubre mes anterior + mes actual completos para vista mensual
      const from = format(addDays(today, -60), 'yyyy-MM-dd')
      const to = format(today, 'yyyy-MM-dd')

      const [healthRes, groups, peopleRaw, schedulesArr, attendance, active] = await Promise.all([
        jibble.getHealth().catch(() => null),
        jibble.getGroups(wsParam),
        jibble.getPeople(wsParam),
        jibble.getWorkSchedules(wsParam),
        jibble.getAttendance({ from, to, ws: wsParam }),
        jibble.getActive(wsParam),
      ])
      const schedulesRaw = Object.fromEntries((schedulesArr || []).map(s => [s.personId, s]))
      setHealth(healthRes)
      setRaw({ groups, peopleRaw, schedulesRaw, attendance, active })
    } catch (err) {
      console.error('useJibble fetch error', err)
      setError(err.message || 'Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [wsParam])

  useEffect(() => {
    fetchAll()
    const id = setInterval(fetchAll, POLL_MS)
    return () => clearInterval(id)
  }, [fetchAll])

  // PEOPLE_ALL: incluye los hidden, sin filtrar (para pantalla Empleados)
  const peopleAll = useMemo(() => {
    if (!raw.peopleRaw) return null
    return raw.peopleRaw
      .filter(p => !(EMPLOYEE_HARDCODED_SKIP(p.id))) // solo el Owner se filtra siempre
      .map(p => ({
        ...p,
        groupId: resolveGroupId(p.id, p.groupId, personOverrides),
        position: resolveCargo(p.id, p.position) || p.position,
        hidden: !!personOverrides[p.id]?.hidden,
      }))
  }, [raw.peopleRaw, personOverrides])

  // PEOPLE: lista activa (sin Owner ni hidden) — la que usan Dashboard, Restaurant, etc.
  const people = useMemo(() => {
    if (!peopleAll) return null
    return peopleAll.filter(p => !p.hidden)
  }, [peopleAll])

  // SCHEDULES: solo para personas activas, mergeando override del usuario > hardcoded > Jibble
  const schedules = useMemo(() => {
    if (!people || !raw.schedulesRaw) return null
    return people.map(p => getScheduleForPerson(p.id, raw.schedulesRaw[p.id], personOverrides))
  }, [people, raw.schedulesRaw, personOverrides])

  // ATTENDANCE: re-asigna groupId al de la persona resuelta (cubre plan gratis Jibble)
  const attendance = useMemo(() => {
    if (!raw.attendance || !people) return raw.attendance
    const personGroup = new Map(people.map(p => [p.id, p.groupId]))
    return raw.attendance.map(a => ({
      ...a,
      groupId: personGroup.get(a.personId) ?? a.groupId,
    }))
  }, [raw.attendance, people])

  const active = useMemo(() => {
    if (!raw.active || !people) return raw.active
    const personGroup = new Map(people.map(p => [p.id, p.groupId]))
    return raw.active.map(a => ({
      ...a,
      groupId: personGroup.get(a.personId) ?? a.groupId,
    }))
  }, [raw.active, people])

  return {
    groups: raw.groups,
    people,        // sin Owner ni hidden — la que usa la app activa
    peopleAll,     // sin Owner pero CON hidden marcados — para pantalla Empleados
    schedules,
    attendance,
    active,
    loading,
    error,
    health,
    refetch: fetchAll,
  }
}
