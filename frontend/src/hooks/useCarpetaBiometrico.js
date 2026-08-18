// Hook de sincronización de exports del BIOMÉTRICO físico desde una carpeta
// OneDrive (gemelo de useCarpetaHorarios). La lógica vive en
// utils/sincronizar-carpetas.js — acá solo el estado de la UI.

import { useCallback, useEffect, useRef, useState } from 'react'
import { soportaCarpetas, conectarCarpeta, desconectarCarpeta } from '../utils/carpeta-horarios'
import { sincronizarLocalBiometrico, bioKey } from '../utils/sincronizar-carpetas'
import { mesesConDatos } from '../utils/biometrico-store'

const KEY_SYNC = 'jibble_carpetas_bio_sync_v1'

function readSyncInfo() {
  try { return JSON.parse(localStorage.getItem(KEY_SYNC)) || {} } catch { return {} }
}

function writeSyncInfo(groupId, info) {
  const all = readSyncInfo()
  all[groupId] = info
  localStorage.setItem(KEY_SYNC, JSON.stringify(all))
}

// estado: 'sin-soporte' | 'cargando' | 'sin-carpeta' | 'requiere-permiso' | 'listo' | 'sincronizando' | 'error'
export function useCarpetaBiometrico({ groupId, onDatosCargados }) {
  const [estado, setEstado] = useState(soportaCarpetas ? 'cargando' : 'sin-soporte')
  const [nombreCarpeta, setNombreCarpeta] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [lastSync, setLastSync] = useState(() => readSyncInfo()[groupId]?.ts || null)

  const onDatosRef = useRef(onDatosCargados)
  onDatosRef.current = onDatosCargados

  const sincronizar = useCallback(async ({ conGesto = false, fiel = false } = {}) => {
    if (!soportaCarpetas) return null
    setEstado('sincronizando')
    try {
      const r = await sincronizarLocalBiometrico(groupId, { conGesto, fiel })
      if (r.estado === 'sin-carpeta') { setEstado('sin-carpeta'); return null }
      if (r.estado === 'requiere-permiso') { setEstado('requiere-permiso'); return null }
      setNombreCarpeta(r.carpeta)
      const res = { ...r, meses: mesesConDatos(groupId) }
      setResultado(res)
      const ts = Date.now()
      setLastSync(ts)
      writeSyncInfo(groupId, { ts, carpeta: r.carpeta, meses: r.mesesCargados.length, archivos: r.archivosLeidos.length })
      setEstado('listo')
      if (r.archivosLeidos.length) onDatosRef.current?.()
      return res
    } catch (e) {
      setResultado({ error: e.message })
      setEstado('error')
      return null
    }
  }, [groupId])

  const conectar = useCallback(async () => {
    try {
      await conectarCarpeta(groupId, { pickerPrefix: 'bio-', storageKey: bioKey(groupId) })
    } catch (e) {
      if (e?.name === 'AbortError') return null // usuario canceló el picker
      throw e
    }
    return sincronizar({ conGesto: true })
  }, [groupId, sincronizar])

  const desconectar = useCallback(async () => {
    await desconectarCarpeta(bioKey(groupId))
    setNombreCarpeta(null)
    setResultado(null)
    setEstado('sin-carpeta')
  }, [groupId])

  // Auto-sync al montar / cambiar de local
  const autoSyncDone = useRef(null)
  useEffect(() => {
    if (!soportaCarpetas) return
    if (autoSyncDone.current === groupId) return
    autoSyncDone.current = groupId
    sincronizar()
  }, [groupId, sincronizar])

  return { soportado: soportaCarpetas, estado, nombreCarpeta, lastSync, resultado, conectar, sincronizar, desconectar }
}
