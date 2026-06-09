// Singleton del cliente Jibble + flags de modo (live/mock).
// Reutilizable desde serverless functions (api/) y dev local (backend/).
//
// MULTI-WORKSPACE: Jibble plan gratis = 1 geocerca por cuenta. Para tener
// control de ubicación en locales lejanos se usan varias cuentas Jibble.
// Cada cuenta = un set de credenciales:
//   Workspace A: JIBBLE_API_KEY_ID   / JIBBLE_API_KEY_SECRET   (obligatorio)
//   Workspace B: JIBBLE_API_KEY_ID_2 / JIBBLE_API_KEY_SECRET_2 (opcional)
//   Workspace C: JIBBLE_API_KEY_ID_3 / JIBBLE_API_KEY_SECRET_3 (opcional)
// jibbleAll() lee todas y fusiona los resultados en una sola lista.
// Los IDs de Jibble son UUID → no chocan entre workspaces.

import { makeJibbleClient } from './jibble-client.js'
import * as mock from './mock-data.js'

const apiKeyId = process.env.JIBBLE_API_KEY_ID?.trim()
const apiKeySecret = process.env.JIBBLE_API_KEY_SECRET?.trim()
export const useMock = !apiKeyId || !apiKeySecret

// Credenciales de todos los workspaces configurados (A obligatorio; B, C... opcionales).
function readCredentials() {
  const creds = []
  if (apiKeyId && apiKeySecret) creds.push({ ws: 'A', id: apiKeyId, secret: apiKeySecret })
  for (const n of [2, 3, 4]) {
    const id = process.env[`JIBBLE_API_KEY_ID_${n}`]?.trim()
    const secret = process.env[`JIBBLE_API_KEY_SECRET_${n}`]?.trim()
    if (id && secret) creds.push({ ws: String.fromCharCode(64 + n), id, secret }) // 2→'B', 3→'C'...
  }
  return creds
}

let _client = null
export function jibble() {
  if (useMock) return null
  if (!_client) _client = makeJibbleClient(apiKeyId, apiKeySecret)
  return _client
}

let _clients = null
function clients() {
  if (useMock) return []
  if (!_clients) {
    _clients = readCredentials().map(c => ({ ws: c.ws, client: makeJibbleClient(c.id, c.secret) }))
  }
  return _clients
}

// Nombres custom para los workspaces (CSV en env). Ej "Principal,Hüper Mall".
// Si no se define, fallback "Workspace 1", "Workspace 2", etc.
function readWorkspaceNames() {
  const csv = process.env.JIBBLE_WORKSPACE_NAMES?.trim()
  if (!csv) return null
  return csv.split(',').map(s => s.trim()).filter(Boolean)
}

// Lista de workspaces disponibles para que el frontend arme el dropdown.
// Cada entry: { id (1-indexed), ws (letra A/B/C), name }
export function listWorkspaces() {
  const cs = clients()
  const names = readWorkspaceNames() || []
  return cs.map((c, i) => ({
    id: i + 1,
    ws: c.ws,
    name: names[i] || `Workspace ${i + 1}`,
  }))
}

// Devuelve solo los clientes que matchean wsFilter.
//   wsFilter: undefined | null | 'all' → todos (comportamiento legacy)
//   wsFilter: '1' / '2' / '3' (string numérico) → 1-indexed
//   wsFilter: 'A' / 'B' / 'C' → por letra
function filterClients(wsFilter) {
  const cs = clients()
  if (!wsFilter || wsFilter === 'all') return cs
  const s = String(wsFilter).trim()
  if (/^\d+$/.test(s)) {
    const idx = parseInt(s, 10) - 1
    return cs[idx] ? [cs[idx]] : []
  }
  const upper = s.toUpperCase()
  return cs.filter(c => c.ws === upper)
}

// Llama `method` en los workspaces filtrados y concatena los resultados.
// Tolerante a fallos: si un workspace falla (token vencido, rate limit, key mala),
// se loguea y se devuelven igual los datos de los demás (no se rompe el dashboard).
async function mergeAcross(wsFilter, method, ...args) {
  const cs = filterClients(wsFilter)
  if (cs.length === 0) return []
  const results = await Promise.allSettled(cs.map(({ client }) => client[method](...args)))
  const out = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      for (const item of r.value) {
        if (item && typeof item === 'object' && item.__ws === undefined) item.__ws = cs[i].ws
      }
      out.push(...r.value)
    } else if (r.status === 'rejected') {
      console.error(`jibble[${cs[i].ws}].${method} falló:`, r.reason?.message || r.reason)
    }
  })
  return out
}

// Cliente "fusionado": misma interfaz que makeJibbleClient pero sobre N workspaces.
// wsFilter opcional para limitar a un workspace específico (1-indexed o letra).
export function jibbleAll(wsFilter) {
  return {
    getGroups:        () => mergeAcross(wsFilter, 'getGroups'),
    getPeople:        () => mergeAcross(wsFilter, 'getPeople'),
    getAttendance:    (opts) => mergeAcross(wsFilter, 'getAttendance', opts),
    getTimesheet:     (opts) => mergeAcross(wsFilter, 'getTimesheet', opts),
    getActive:        () => mergeAcross(wsFilter, 'getActive'),
    getWorkSchedules: () => mergeAcross(wsFilter, 'getWorkSchedules'),
  }
}

export { mock }

// Wrapper estándar para handlers que llaman Jibble: catch errores upstream.
export function jibbleHandler(fn) {
  return async (req, res) => {
    try {
      const data = await fn(req, res)
      if (data !== undefined && !res.headersSent) res.json(data)
    } catch (err) {
      const status = err.response?.status || 500
      const detail = err.response?.data || err.message
      console.error('jibble error:', status, detail)
      if (!res.headersSent) {
        res.status(502).json({ error: 'jibble_upstream_error', status, detail })
      }
    }
  }
}
