// Hook centralizado: trae datos de Jibble cada 5 min y aplica overrides del usuario.
// Devuelve: groups, people (con groupId/cargo/schedule resueltos, hidden filtrado),
// schedules, attendance, active.

import { useEffect, useState, useCallback, useMemo } from 'react'
import { format, addDays } from 'date-fns'
import * as jibble from '../api/jibble'
import { getScheduleForPerson, shouldSkipPerson, resolveGroupId, resolveCargo, EMPLOYEE_OVERRIDES, esPersonaDummy, localOculto, GRUPOS_SOLO_BIOMETRICO } from '../config/employees'
import { useActiveWorkspace } from './useActiveWorkspace'
import { personasSinteticas, sinteticosPorAlias } from '../utils/biometrico'
import { readBio, useBioVersion } from '../utils/biometrico-store'
import { getAliases } from '../utils/carpeta-horarios'
import { useAliasVersion } from './useAliasVersion'

// Skip hardcoded (Owner) — siempre filtrar, no editable por usuario
function EMPLOYEE_HARDCODED_SKIP(personId) {
  return EMPLOYEE_OVERRIDES[personId]?.skip === true
}

const POLL_MS = 5 * 60 * 1000 // 5 min

export function useJibble(personOverrides = {}, locales = {}) {
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

  // GROUPS_ALL: grupos de la API del ws activo ∪ locales configurados que la API
  // no traiga (ej. cuenta secundaria sin grupos en Jibble → se sintetizan desde
  // config.locales para que el local siga existiendo en toda la app).
  const groupsAll = useMemo(() => {
    if (!raw.groups) return null // preservar gate de loading
    const byId = new Set(raw.groups.map(g => g.id))
    const synth = Object.entries(locales || {})
      .filter(([id, l]) => !byId.has(id) && l?.name)
      .map(([id, l]) => ({ id, name: l.name, synthetic: true }))
    return [...raw.groups, ...synth]
  }, [raw.groups, locales])

  // GROUPS: los visibles (sin locales ocultos por el usuario o por default) — lo que usa la app.
  const groups = useMemo(
    () => (groupsAll ? groupsAll.filter(g => !localOculto(g.id, locales)) : null),
    [groupsAll, locales]
  )

  // Cambian al sincronizar un biométrico o al resolver un nombre del aparato
  const bioVersion = useBioVersion()
  const aliasVersion = useAliasVersion()

  // PEOPLE_ALL: incluye los hidden, sin filtrar (para pantalla Empleados).
  // Además inyecta PERSONAS SINTÉTICAS del biométrico físico, SOLO para locales
  // sin gente en Jibble (ej. Tuesday): así Sueldos/Empleados/Turnos funcionan
  // igual que con gente real. Los locales con Jibble no reciben sintéticos —
  // sus marcas biométricas se mapean por alias a los personId reales.
  const peopleAll = useMemo(() => {
    if (!raw.peopleRaw) return null
    // Nombre editado a mano (Empleados → Nombre). Imprescindible con la gente
    // del aparato biométrico: ahí el nombre viene como lo tipeó el gerente en el
    // reloj y a veces no es el real (caso SOS: "NICOLAS" id 9 = Nicolas
    // Bernardo). El id NO cambia, así que tarifas y aprobaciones se conservan.
    const conNombre = p => {
      const nombre = personOverrides[p.id]?.nombre
      if (!nombre) return p
      return { ...p, fullName: nombre, firstName: nombre.split(' ')[0] }
    }
    const jibblePeople = raw.peopleRaw
      .filter(p => !(EMPLOYEE_HARDCODED_SKIP(p.id))) // el Owner se filtra siempre
      .filter(p => !esPersonaDummy(p.fullName)) // cuentas dummy del local (ej. "Sbarro Huper")
      .map(p => conNombre({
        ...p,
        // __ws = workspace de origen (lo etiqueta el backend al fusionar cuentas).
        // fullName: para la regla de la cuenta A (sin grupo → América u Oficinas).
        groupId: resolveGroupId(p.id, p.groupId, personOverrides, p.__ws, p.fullName),
        position: resolveCargo(p.id, p.position) || p.position,
        hidden: !!personOverrides[p.id]?.hidden,
      }))
    const gruposConGente = new Set(jibblePeople.map(p => p.groupId))
    const bio = readBio()
    const sinteticos = []
    const conCargo = p => conNombre({
      ...p,
      position: resolveCargo(p.id, '') || personOverrides[p.id]?.cargo || '',
      hidden: !!personOverrides[p.id]?.hidden,
    })
    for (const groupId of Object.keys(bio)) {
      const porId = new Map()
      for (const mesStr of Object.keys(bio[groupId]).sort()) {
        for (const p of (bio[groupId][mesStr].personas || [])) porId.set(p.idBio, p)
      }
      const personasBio = [...porId.values()]
      // Locales SIN cuenta Jibble (Tuesday): todo su personal es del aparato.
      // Un local con Jibble puede venir "vacío" porque el workspace activo
      // excluye su cuenta — inventarle sintéticos rompería el cruce por personId.
      if (GRUPOS_SOLO_BIOMETRICO.has(groupId) && !gruposConGente.has(groupId)) {
        for (const p of personasSinteticas(groupId, personasBio)) sinteticos.push(conCargo(p))
        continue
      }
      // Locales CON Jibble: solo los nombres que el usuario marcó como
      // "crear empleado (solo biométrico)" — decisión explícita, nunca automática.
      for (const p of sinteticosPorAlias(groupId, personasBio, getAliases(groupId))) sinteticos.push(conCargo(p))
    }
    return [...jibblePeople, ...sinteticos]
  }, [raw.peopleRaw, personOverrides, bioVersion, aliasVersion])

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
    groups,        // visibles: API ∪ config.locales, sin locales ocultos
    groupsAll,     // igual pero CON ocultos — para Settings y lookups por id
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
