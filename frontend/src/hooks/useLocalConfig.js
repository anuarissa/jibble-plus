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
    toleranciaMinutos: 0,        // Anuar: tolerancia 0 (1 min tarde ya cuenta)
    // NOTA: la regla de multa es escalonada y vive hardcoded en utils/lateness.js
    //   1-10 min → 10 Bs (fijo)
    //   11+ min  → 10 Bs + 20 Bs por cada bloque de 10 min iniciado
    // Las claves multaPorBloque/bloqueMinutos quedan en localStorage por compatibilidad
    // con instalaciones viejas, pero ya no se usan.
    multaPorBloque: 10,
    bloqueMinutos: 5,
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

  // === HORARIO DEFAULT POR DÍA (defaultWeek) ===
  // Permite definir distinto horario para cada día (Lun..Dom). Prevalece sobre schedule legacy.
  // valor: { startTime, endTime } | { tipo: 'OFF' } | null (limpiar ese día)
  const setDefaultDia = useCallback((personId, dow, valor) => {
    setPersonOverridesState(prev => {
      const ov = { ...(prev[personId] || {}) }
      const dw = { ...(ov.defaultWeek || {}) }
      if (valor == null) delete dw[String(dow)]
      else dw[String(dow)] = valor
      // Si quedó vacío, eliminar defaultWeek para volver al schedule legacy
      ov.defaultWeek = Object.keys(dw).length > 0 ? dw : undefined
      return { ...prev, [personId]: ov }
    })
  }, [])

  // Borra el defaultWeek de un empleado (vuelve a usar el schedule legacy)
  const clearDefaultWeek = useCallback((personId) => {
    setPersonOverridesState(prev => {
      const ov = { ...(prev[personId] || {}) }
      delete ov.defaultWeek
      return { ...prev, [personId]: ov }
    })
  }, [])

  // === TURNOS ROTATIVOS ===
  // weekKey = "2026-W17" (ISO week). dow = 1..7 (lun..dom)
  // valor = { startTime, endTime, nota? } | { tipo: 'OFF', nota? } | "OFF" (legacy) | null
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

  // Setear/borrar nota de una celda preservando el resto de campos
  const setNotaCelda = useCallback((weekKey, personId, dow, nota) => {
    setTurnos(prev => {
      const week = { ...(prev[weekKey] || {}) }
      const personDays = { ...(week[personId] || {}) }
      const raw = personDays[String(dow)]
      let next
      // Si la celda no existe explícita y se quiere agregar nota, marcamos como "default con nota"
      // usando el shape { tipo:'default', nota } no es estándar — preferimos no permitir nota sin valor
      if (raw == null) {
        // Sin valor explícito: si nos piden setear nota, creamos celda placeholder con tipo:'default'
        if (nota) personDays[String(dow)] = { tipo: 'default', nota }
        else return prev
      } else if (raw === 'OFF') {
        next = { tipo: 'OFF' }
        if (nota) next.nota = nota
        personDays[String(dow)] = next
      } else if (typeof raw === 'object') {
        next = { ...raw }
        if (nota) next.nota = nota
        else delete next.nota
        // Si era una celda { tipo:'default', nota } y se borra la nota → quitar la celda
        if (next.tipo === 'default' && !next.nota) {
          delete personDays[String(dow)]
        } else {
          personDays[String(dow)] = next
        }
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
    setDefaultDia,
    clearDefaultWeek,
    clearPersonOverride,
    setTurnoCelda,
    setNotaCelda,
    setTurnosSemana,
    copiarTurnosDesdeAnterior,
    condonar,
    revertirCondonacion,
    reset,
  }
}
