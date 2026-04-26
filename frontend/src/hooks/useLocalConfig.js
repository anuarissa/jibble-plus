// Hook para configuración persistida en localStorage:
// - apiKey (solo flag de "configurado", la key real vive en backend/.env)
// - locales: nombres/colores/emojis personalizados
// - tarifas: por empleado
// - condonaciones: por tardanza id
// - settings: tolerancia, multiplicador extras, etc.

import { useEffect, useState, useCallback } from 'react'
import { DEFAULT_TARIFA, EMPLOYEE_OVERRIDES } from '../config/employees'

const KEY_CONFIG = 'jibble_app_config_v1'
const KEY_TARIFAS = 'jibble_tarifas_v1'
const KEY_CONDONACIONES = 'jibble_condonaciones_v1'
const KEY_PERSON_OVERRIDES = 'jibble_person_overrides_v1' // { personId: { groupId, cargo, sueldoMensual, tarifa, schedule, hidden } }
const KEY_TURNOS = 'jibble_turnos_v1' // { weekKey: { personId: { dow: { startTime, endTime } | "OFF" } } }

const DEFAULT_CONFIG = {
  setupComplete: false,
  mockMode: false,
  locales: {}, // { [groupId]: { name, color, emoji } }
  settings: {
    toleranciaMinutos: 0,        // Anuar: tolerancia 0
    multaPorBloque: 10,          // Bs
    bloqueMinutos: 5,            // 10 Bs cada 5 min
    multiplicadorExtra: 1.5,
    horasExtraDesde: 8,          // por día
  },
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch { return fallback }
}

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

export function useLocalConfig() {
  const [config, setConfig] = useState(() => readJSON(KEY_CONFIG, DEFAULT_CONFIG))
  const [tarifas, setTarifas] = useState(() => readJSON(KEY_TARIFAS, {}))
  const [condonaciones, setCondonaciones] = useState(() => readJSON(KEY_CONDONACIONES, {}))
  const [personOverrides, setPersonOverridesState] = useState(() => readJSON(KEY_PERSON_OVERRIDES, {}))
  const [turnos, setTurnos] = useState(() => readJSON(KEY_TURNOS, {}))

  useEffect(() => writeJSON(KEY_CONFIG, config), [config])
  useEffect(() => writeJSON(KEY_TARIFAS, tarifas), [tarifas])
  useEffect(() => writeJSON(KEY_CONDONACIONES, condonaciones), [condonaciones])
  useEffect(() => writeJSON(KEY_PERSON_OVERRIDES, personOverrides), [personOverrides])
  useEffect(() => writeJSON(KEY_TURNOS, turnos), [turnos])

  const completarSetup = useCallback((locales) => {
    setConfig(c => ({ ...c, setupComplete: true, locales }))
  }, [])

  const setMockMode = useCallback((on) => {
    setConfig(c => ({ ...c, mockMode: on, setupComplete: true }))
  }, [])

  const renombrarLocal = useCallback((groupId, patch) => {
    setConfig(c => ({ ...c, locales: { ...c.locales, [groupId]: { ...c.locales[groupId], ...patch } } }))
  }, [])

  const setSettings = useCallback((patch) => {
    setConfig(c => ({ ...c, settings: { ...c.settings, ...patch } }))
  }, [])

  const setTarifa = useCallback((personId, valor) => {
    setTarifas(t => ({ ...t, [personId]: Number(valor) || 0 }))
  }, [])

  // Resuelve tarifa con prioridad:
  //   1) tarifas[personId] (legacy, set inline en pestaña Planilla)
  //   2) personOverrides[personId].tarifa (set desde Empleados)
  //   3) EMPLOYEE_OVERRIDES (hardcoded)
  //   4) DEFAULT_TARIFA
  const getTarifaResolved = useCallback((personId) => {
    if (tarifas[personId] != null) return Number(tarifas[personId])
    const userOv = personOverrides[personId]
    if (userOv?.tarifa != null) return Number(userOv.tarifa)
    const hard = EMPLOYEE_OVERRIDES[personId]
    if (hard?.tarifa != null) return hard.tarifa
    return DEFAULT_TARIFA
  }, [tarifas, personOverrides])

  // Asignar/desasignar persona a un grupo manualmente
  const setPersonGroup = useCallback((personId, groupId) => {
    setPersonOverridesState(prev => ({
      ...prev,
      [personId]: { ...(prev[personId] || {}), groupId: groupId || null },
    }))
  }, [])

  const setPersonCargo = useCallback((personId, cargo) => {
    setPersonOverridesState(prev => ({
      ...prev,
      [personId]: { ...(prev[personId] || {}), cargo: cargo || null },
    }))
  }, [])

  const clearPersonOverride = useCallback((personId) => {
    setPersonOverridesState(prev => {
      const next = { ...prev }
      delete next[personId]
      return next
    })
  }, [])

  // Edición integral de un empleado: cargo, tarifa, sueldo objetivo, schedule custom.
  // patch puede traer cualquier subset; lo que no venga, se preserva.
  const setPersonData = useCallback((personId, patch) => {
    setPersonOverridesState(prev => ({
      ...prev,
      [personId]: { ...(prev[personId] || {}), ...patch },
    }))
  }, [])

  // Soft-delete: el empleado deja de aparecer en planilla y vistas por local
  const setPersonHidden = useCallback((personId, hidden) => {
    setPersonOverridesState(prev => ({
      ...prev,
      [personId]: { ...(prev[personId] || {}), hidden: !!hidden },
    }))
  }, [])

  // === TURNOS ROTATIVOS ===
  // weekKey = "2026-W17" (ISO week). dow = 1..7 (lun..dom)
  // valor = { startTime: "08:00", endTime: "16:00" } | "OFF" | null (sin turno → fallback)
  const setTurnoCelda = useCallback((weekKey, personId, dow, valor) => {
    setTurnos(prev => {
      const week = { ...(prev[weekKey] || {}) }
      const personDays = { ...(week[personId] || {}) }
      if (valor == null) {
        delete personDays[String(dow)]
      } else {
        personDays[String(dow)] = valor
      }
      week[personId] = personDays
      return { ...prev, [weekKey]: week }
    })
  }, [])

  // Set masivo de turnos para una semana (usado por importar Excel)
  // patch: { [personId]: { [dow]: valor } }
  const setTurnosSemana = useCallback((weekKey, patch) => {
    setTurnos(prev => {
      const existing = prev[weekKey] || {}
      const merged = { ...existing }
      for (const personId of Object.keys(patch || {})) {
        merged[personId] = { ...(existing[personId] || {}), ...patch[personId] }
      }
      return { ...prev, [weekKey]: merged }
    })
  }, [])

  // Copia toda la grilla de la semana anterior a la actual
  const copiarTurnosDesdeAnterior = useCallback((weekKeyDestino, weekKeyOrigen) => {
    setTurnos(prev => {
      const origen = prev[weekKeyOrigen]
      if (!origen) return prev
      // Copia profunda para evitar mutación compartida
      const copia = JSON.parse(JSON.stringify(origen))
      return { ...prev, [weekKeyDestino]: copia }
    })
  }, [])

  const condonar = useCallback((tardanzaId, motivo = '') => {
    setCondonaciones(c => ({ ...c, [tardanzaId]: { condonada: true, motivo, fecha: new Date().toISOString() } }))
  }, [])

  const revertirCondonacion = useCallback((tardanzaId) => {
    setCondonaciones(c => {
      const next = { ...c }
      delete next[tardanzaId]
      return next
    })
  }, [])

  const reset = useCallback(() => {
    localStorage.removeItem(KEY_CONFIG)
    localStorage.removeItem(KEY_TARIFAS)
    localStorage.removeItem(KEY_CONDONACIONES)
    localStorage.removeItem(KEY_PERSON_OVERRIDES)
    localStorage.removeItem(KEY_TURNOS)
    setConfig(DEFAULT_CONFIG)
    setTarifas({})
    setCondonaciones({})
    setPersonOverridesState({})
    setTurnos({})
  }, [])

  return {
    config,
    tarifas,
    condonaciones,
    personOverrides,
    turnos,
    completarSetup,
    setMockMode,
    renombrarLocal,
    setSettings,
    setTarifa,
    getTarifaResolved,
    setPersonGroup,
    setPersonCargo,
    setPersonData,
    setPersonHidden,
    clearPersonOverride,
    setTurnoCelda,
    setTurnosSemana,
    copiarTurnosDesdeAnterior,
    condonar,
    revertirCondonacion,
    reset,
  }
}
