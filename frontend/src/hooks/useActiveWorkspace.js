// Hook global del workspace activo de Jibble.
//
// State compartido: hay un solo "active" para toda la app y un solo fetch a
// /api/workspaces. Cada instancia del hook se sincroniza vía un pequeño
// pub-sub interno (sin Context para no agregar boilerplate al árbol de la app).
//
// Persiste en localStorage. El valor activo se inyecta como `?ws=` en cada
// llamada a la API. Al cambiar de cuenta se limpia el cache local para que
// no se mezclen datos del workspace anterior.

import { useEffect, useState, useCallback } from 'react'
import * as jibble from '../api/jibble'

const STORAGE_KEY = 'jibble_active_workspace'
const DEFAULT_WS = 'all'

// === Estado compartido a nivel de módulo ===
let _workspaces = null              // lista cacheada (null = no cargada)
let _workspacesLoading = false      // evita fetches paralelos
let _workspacesPromise = null
const _subscribers = new Set()      // cada useActiveWorkspace registra un callback

function readActive() {
  try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_WS } catch { return DEFAULT_WS }
}
function writeActive(val) {
  try { localStorage.setItem(STORAGE_KEY, val || DEFAULT_WS) } catch {}
}

function notifyAll() {
  for (const cb of _subscribers) cb()
}

async function ensureWorkspacesLoaded() {
  if (_workspaces !== null) return _workspaces
  if (_workspacesLoading) return _workspacesPromise
  _workspacesLoading = true
  _workspacesPromise = jibble.getWorkspaces()
    .then(ws => {
      _workspaces = Array.isArray(ws) ? ws : []
      _workspacesLoading = false
      notifyAll()
      return _workspaces
    })
    .catch(err => {
      console.warn('No se pudo cargar lista de workspaces:', err.message)
      _workspaces = []
      _workspacesLoading = false
      notifyAll()
      return _workspaces
    })
  return _workspacesPromise
}

export function useActiveWorkspace() {
  const [active, setActiveState] = useState(readActive)
  const [workspaces, setWorkspaces] = useState(_workspaces)

  useEffect(() => {
    const cb = () => {
      setActiveState(readActive())
      setWorkspaces(_workspaces)
    }
    _subscribers.add(cb)
    ensureWorkspacesLoaded().then(ws => setWorkspaces(ws))
    return () => { _subscribers.delete(cb) }
  }, [])

  const setActive = useCallback((val) => {
    const next = val || DEFAULT_WS
    if (next === readActive()) return
    writeActive(next)
    jibble.clearCache() // descartar datos del workspace anterior
    notifyAll()         // sincronizar todas las instancias del hook
  }, [])

  return {
    workspaces,                              // [{id, ws, name}] o null mientras carga
    active,                                  // 'all' | '1' | '2' | ...
    setActive,
    loading: workspaces === null,
    hasMultiple: (workspaces?.length ?? 0) > 1,
  }
}
