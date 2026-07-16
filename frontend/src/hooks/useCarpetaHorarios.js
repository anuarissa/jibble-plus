// Hook de sincronización de turnos desde la carpeta OneDrive del local.
// Al montar: si hay carpeta conectada y el navegador conserva el permiso,
// lee y aplica solo (Excel = fuente de verdad). Si el permiso expiró,
// queda en 'requiere-permiso' y un click en Sincronizar lo re-otorga.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  soportaCarpetas, getHandle, conectarCarpeta, desconectarCarpeta,
  estadoPermiso, pedirPermiso, leerCarpeta, getAliases,
} from '../utils/carpeta-horarios'

const KEY_SYNC = 'jibble_carpetas_sync_v1'

function readSyncInfo() {
  try { return JSON.parse(localStorage.getItem(KEY_SYNC)) || {} } catch { return {} }
}

function writeSyncInfo(groupId, info) {
  const all = readSyncInfo()
  all[groupId] = info
  localStorage.setItem(KEY_SYNC, JSON.stringify(all))
}

// estado: 'sin-soporte' | 'cargando' | 'sin-carpeta' | 'requiere-permiso' | 'listo' | 'sincronizando' | 'error'
export function useCarpetaHorarios({ groupId, empleados, turnos, setTurnosSemana }) {
  const [estado, setEstado] = useState(soportaCarpetas ? 'cargando' : 'sin-soporte')
  const [nombreCarpeta, setNombreCarpeta] = useState(null)
  const [resultado, setResultado] = useState(null) // { semanasAplicadas, celdasOk, warnings, noEncontrados, archivosLeidos }
  const [lastSync, setLastSync] = useState(() => readSyncInfo()[groupId]?.ts || null)

  // Refs para usar los valores frescos dentro de callbacks sin re-crear la sync.
  const empleadosRef = useRef(empleados)
  empleadosRef.current = empleados
  const turnosRef = useRef(turnos)
  turnosRef.current = turnos

  const aplicar = useCallback((lectura) => {
    let semanasAplicadas = 0
    const semanas = []
    for (const [wk, datos] of Object.entries(lectura.aplicarPorSemana)) {
      // No tocar el store si cada celda ya está idéntica (evita re-renders en cada visita).
      const actual = turnosRef.current?.[wk] || {}
      const sinCambios = Object.keys(datos).every(pid =>
        Object.keys(datos[pid]).every(
          dow => JSON.stringify(actual[pid]?.[dow]) === JSON.stringify(datos[pid][dow])
        )
      )
      if (!sinCambios) {
        setTurnosSemana(wk, datos)
        semanasAplicadas++
      }
      semanas.push(wk)
    }
    return { semanasAplicadas, semanas }
  }, [setTurnosSemana])

  const sincronizar = useCallback(async ({ conGesto = false } = {}) => {
    if (!soportaCarpetas) return null
    const handle = await getHandle(groupId)
    if (!handle) { setEstado('sin-carpeta'); return null }
    setNombreCarpeta(handle.name)

    let permiso = await estadoPermiso(handle)
    if (permiso !== 'granted' && conGesto) permiso = await pedirPermiso(handle)
    if (permiso !== 'granted') { setEstado('requiere-permiso'); return null }

    setEstado('sincronizando')
    try {
      const lectura = await leerCarpeta(handle, empleadosRef.current, { aliases: getAliases(groupId) })
      const { semanasAplicadas, semanas } = aplicar(lectura)
      const res = {
        semanasAplicadas,
        semanasDetectadas: semanas,
        celdasOk: lectura.celdasOk,
        warnings: lectura.warnings,
        noEncontrados: lectura.noEncontrados,
        archivosLeidos: lectura.archivosLeidos,
      }
      setResultado(res)
      const ts = Date.now()
      setLastSync(ts)
      writeSyncInfo(groupId, { ts, carpeta: handle.name, semanas: semanas.length, archivos: lectura.archivosLeidos.length })
      setEstado('listo')
      return res
    } catch (e) {
      setResultado({ error: e.message })
      setEstado('error')
      return null
    }
  }, [groupId, aplicar])

  const conectar = useCallback(async () => {
    try {
      await conectarCarpeta(groupId)
    } catch (e) {
      if (e?.name === 'AbortError') return null // usuario canceló el picker
      throw e
    }
    return sincronizar({ conGesto: true })
  }, [groupId, sincronizar])

  const desconectar = useCallback(async () => {
    await desconectarCarpeta(groupId)
    setNombreCarpeta(null)
    setResultado(null)
    setEstado('sin-carpeta')
  }, [groupId])

  // Auto-sync al montar / cambiar de local — solo si los empleados ya cargaron.
  const autoSyncDone = useRef(null)
  useEffect(() => {
    if (!soportaCarpetas) return
    if (!empleados?.length) return
    if (autoSyncDone.current === groupId) return
    autoSyncDone.current = groupId
    sincronizar()
  }, [groupId, empleados?.length, sincronizar])

  return { soportado: soportaCarpetas, estado, nombreCarpeta, lastSync, resultado, conectar, sincronizar, desconectar }
}
