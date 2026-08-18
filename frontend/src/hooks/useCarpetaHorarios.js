// Hook de sincronización de turnos desde la carpeta OneDrive del local.
// Al montar: si hay carpeta conectada y el navegador conserva el permiso,
// lee y aplica solo (Excel = fuente de verdad). Si el permiso expiró,
// queda en 'requiere-permiso' y un click en Sincronizar lo re-otorga.
//
// La lógica vive en utils/sincronizar-carpetas.js (compartida con el botón
// global "Recargar Excels"); acá solo se maneja el estado de la UI.

import { useCallback, useEffect, useRef, useState } from 'react'
import { soportaCarpetas, conectarCarpeta, desconectarCarpeta } from '../utils/carpeta-horarios'
import { sincronizarLocalHorarios } from '../utils/sincronizar-carpetas'
import { isoWeekKey } from '../utils/turnos'

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
export function useCarpetaHorarios({ groupId, empleados, turnos, setTurnosSemana, reemplazarTurnosDeLocal }) {
  const [estado, setEstado] = useState(soportaCarpetas ? 'cargando' : 'sin-soporte')
  const [nombreCarpeta, setNombreCarpeta] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [lastSync, setLastSync] = useState(() => readSyncInfo()[groupId]?.ts || null)

  // Refs para usar los valores frescos dentro de callbacks sin re-crear la sync.
  const empleadosRef = useRef(empleados)
  empleadosRef.current = empleados
  const turnosRef = useRef(turnos)
  turnosRef.current = turnos
  const accionesRef = useRef({ setTurnosSemana, reemplazarTurnosDeLocal })
  accionesRef.current = { setTurnosSemana, reemplazarTurnosDeLocal }

  const sincronizar = useCallback(async ({ conGesto = false, fiel = false } = {}) => {
    if (!soportaCarpetas) return null
    setEstado('sincronizando')
    try {
      const r = await sincronizarLocalHorarios(groupId, empleadosRef.current, accionesRef.current, {
        conGesto, fiel, turnosActuales: turnosRef.current,
      })
      if (r.estado === 'sin-carpeta') { setEstado('sin-carpeta'); return null }
      if (r.estado === 'requiere-permiso') { setEstado('requiere-permiso'); return null }
      setNombreCarpeta(r.carpeta)

      // Chequeo inverso (clave con la rotación de personal): ¿qué empleados
      // registrados NO aparecen en la última semana que trae el Excel?
      const semanasOrdenadas = [...r.semanasDetectadas].sort()
      const ultimaSemana = semanasOrdenadas[semanasOrdenadas.length - 1] || null
      const sinHorario = ultimaSemana
        ? (empleadosRef.current || []).filter(e => !turnosRef.current?.[ultimaSemana]?.[e.id]).map(e => e.fullName)
        : []
      const res = { ...r, ultimaSemana, sinHorario, faltaSemanaActual: !semanasOrdenadas.includes(isoWeekKey(new Date())) }
      setResultado(res)
      const ts = Date.now()
      setLastSync(ts)
      writeSyncInfo(groupId, { ts, carpeta: r.carpeta, semanas: r.semanasDetectadas.length, archivos: r.archivosLeidos.length })
      setEstado('listo')
      return res
    } catch (e) {
      setResultado({ error: e.message })
      setEstado('error')
      return null
    }
  }, [groupId])

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
