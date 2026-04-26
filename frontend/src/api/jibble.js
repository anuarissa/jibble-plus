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

export async function getGroups() {
  return getWithCache('/jibble/groups', {}, 'groups')
}

export async function getPeople() {
  return getWithCache('/jibble/people', {}, 'people')
}

export async function getAttendance({ from, to, groupId } = {}) {
  return getWithCache('/jibble/attendance', { from, to, groupId }, `attendance_${from}_${to}_${groupId || 'all'}`)
}

export async function getTimesheet({ from, to, groupId } = {}) {
  return getWithCache('/jibble/timesheet', { from, to, groupId }, `timesheet_${from}_${to}_${groupId || 'all'}`)
}

export async function getWorkSchedules() {
  return getWithCache('/jibble/workSchedules', {}, 'workSchedules')
}

export async function getActive() {
  // No cacheamos los activos — necesitan ser fresh.
  const { data } = await api.get('/jibble/active')
  return data
}
