// Cliente HTTP frontend → backend proxy. Caché ligero en localStorage para carga optimista.

import axios from 'axios'

const TOKEN_KEY = 'jibble_session_token'

export function getSessionToken() {
  try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' }
}

export function setSessionToken(t) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {}
}

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

// Mete el token en cada request automáticamente
api.interceptors.request.use(cfg => {
  const t = getSessionToken()
  if (t) cfg.headers.Authorization = `Bearer ${t}`
  return cfg
})

// Si el backend devuelve 401 → limpiar token y forzar reload (volverá al login)
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      setSessionToken('')
      // Recarga: App.jsx detectará la falta de token y mostrará Login
      if (typeof window !== 'undefined' && !window.location.pathname.endsWith('/login')) {
        window.dispatchEvent(new Event('jibble:unauth'))
      }
    }
    return Promise.reject(err)
  },
)

export async function login(password) {
  const { data } = await api.post('/login', { password })
  if (data?.token) setSessionToken(data.token)
  return data
}

export function logout() {
  setSessionToken('')
  // limpiar caché para que la próxima sesión no muestre datos viejos
  clearCache()
}

const CACHE_PREFIX = 'jibble_cache_'
const CACHE_TTL_MS = 1000 * 60 * 5 // 5 min

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const { at, value } = JSON.parse(raw)
    if (Date.now() - at > CACHE_TTL_MS) return null
    return value
  } catch { return null }
}

function cacheSet(key, value) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), value }))
  } catch { /* quota exceeded */ }
}

export function clearCache() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i)
    if (k?.startsWith(CACHE_PREFIX)) localStorage.removeItem(k)
  }
}

async function getWithCache(path, params, cacheKey) {
  const cached = cacheGet(cacheKey)
  const fresh = api.get(path, { params }).then(r => { cacheSet(cacheKey, r.data); return r.data })
  if (cached) {
    // Carga optimista: devolver caché y refetch en background.
    fresh.catch(() => {})
    return cached
  }
  return await fresh
}

export async function getHealth() {
  const { data } = await api.get('/health')
  return data
}

// Workspaces: lista las cuentas Jibble configuradas en el deploy.
export async function getWorkspaces() {
  const { data } = await api.get('/workspaces')
  return data
}

// El parámetro `ws` filtra por una cuenta Jibble específica:
//   undefined / 'all' → todas las cuentas fusionadas (default, comportamiento legacy)
//   '1' / '2' / 'A' / 'B' → solo esa cuenta
// La cache es por-workspace para que cambiar de cuenta muestre datos correctos.
function wsKey(ws) { return ws ? `ws${ws}` : 'all' }

export async function getGroups(ws) {
  return getWithCache('/jibble/groups', { ws }, `groups_${wsKey(ws)}`)
}

export async function getPeople(ws) {
  return getWithCache('/jibble/people', { ws }, `people_${wsKey(ws)}`)
}

export async function getAttendance({ from, to, groupId, ws } = {}) {
  return getWithCache('/jibble/attendance', { from, to, groupId, ws }, `attendance_${from}_${to}_${groupId || 'all'}_${wsKey(ws)}`)
}

export async function getTimesheet({ from, to, groupId, ws } = {}) {
  return getWithCache('/jibble/timesheet', { from, to, groupId, ws }, `timesheet_${from}_${to}_${groupId || 'all'}_${wsKey(ws)}`)
}

export async function getWorkSchedules(ws) {
  return getWithCache('/jibble/workSchedules', { ws }, `workSchedules_${wsKey(ws)}`)
}

export async function getActive(ws) {
  // No cacheamos los activos — necesitan ser fresh.
  const { data } = await api.get('/jibble/active', { params: { ws } })
  return data
}
