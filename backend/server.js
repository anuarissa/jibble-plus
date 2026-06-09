import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { makeJibbleClient } from './jibble-client.js'
import * as mock from './mock-data.js'

const app = express()
const PORT = process.env.PORT || 3001
const apiKeyId = process.env.JIBBLE_API_KEY_ID?.trim()
const apiKeySecret = process.env.JIBBLE_API_KEY_SECRET?.trim()
const useMock = !apiKeyId || !apiKeySecret

// MULTI-WORKSPACE: A obligatorio; B, C... opcionales (cuentas Jibble extra
// para locales lejanos, cada una con su propia geocerca en plan gratis).
function readCredentials() {
  const creds = []
  if (apiKeyId && apiKeySecret) creds.push({ ws: 'A', id: apiKeyId, secret: apiKeySecret })
  for (const n of [2, 3, 4]) {
    const id = process.env[`JIBBLE_API_KEY_ID_${n}`]?.trim()
    const secret = process.env[`JIBBLE_API_KEY_SECRET_${n}`]?.trim()
    if (id && secret) creds.push({ ws: String.fromCharCode(64 + n), id, secret })
  }
  return creds
}

app.use(cors())
app.use(express.json())

// Logger sencillo
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`)
  next()
})

// Clientes de todos los workspaces configurados.
const clients = useMock
  ? []
  : readCredentials().map(c => ({ ws: c.ws, client: makeJibbleClient(c.id, c.secret) }))

// Filtra clientes por workspace (1-indexed o letra). undefined/'all' → todos.
function filterClients(wsFilter) {
  if (!wsFilter || wsFilter === 'all') return clients
  const s = String(wsFilter).trim()
  if (/^\d+$/.test(s)) {
    const idx = parseInt(s, 10) - 1
    return clients[idx] ? [clients[idx]] : []
  }
  return clients.filter(c => c.ws === s.toUpperCase())
}

// Llama `method` en los workspaces seleccionados y concatena. Tolerante a fallos.
async function mergeAll(wsFilter, method, ...args) {
  const cs = filterClients(wsFilter)
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

// Lista de workspaces (para el frontend dropdown). CSV opcional en env.
function listWorkspaces() {
  const namesCsv = process.env.JIBBLE_WORKSPACE_NAMES?.trim()
  const names = namesCsv ? namesCsv.split(',').map(s => s.trim()).filter(Boolean) : []
  return clients.map((c, i) => ({ id: i + 1, ws: c.ws, name: names[i] || `Workspace ${i + 1}` }))
}

// Wrapper que captura errores de Jibble y devuelve 502 con detalle.
function handler(fn) {
  return async (req, res) => {
    try {
      const data = await fn(req)
      res.json(data)
    } catch (err) {
      const status = err.response?.status || 500
      const detail = err.response?.data || err.message
      console.error('Error:', status, detail)
      res.status(502).json({ error: 'jibble_upstream_error', status, detail })
    }
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mode: useMock ? 'mock' : 'live',
    connected: !useMock,
    baseUrl: process.env.JIBBLE_BASE_URL || 'https://workspace.prod.jibble.io/v1',
    protected: false, // dev local: sin auth (en Vercel sí, vía APP_PASSWORD)
    timestamp: new Date().toISOString(),
  })
})

// Endpoint /api/login para que el flujo local también funcione (sin password)
app.post('/api/login', express.json(), (_req, res) => {
  res.json({ ok: true, token: 'dev-local', protected: false })
})

app.get('/api/workspaces', (_req, res) => {
  if (useMock) return res.json([{ id: 1, ws: 'A', name: 'Demo (Mock)' }])
  res.json(listWorkspaces())
})

app.get('/api/jibble/groups', handler(async (req) => {
  if (useMock) return mock.groups
  return await mergeAll(req.query?.ws, 'getGroups')
}))

app.get('/api/jibble/people', handler(async (req) => {
  if (useMock) return mock.people
  return await mergeAll(req.query?.ws, 'getPeople')
}))

app.get('/api/jibble/attendance', handler(async (req) => {
  const { from, to, groupId, ws } = req.query
  if (useMock) {
    const records = mock.timesheet.generate(from, to)
    return groupId ? records.filter(r => r.groupId === groupId) : records
  }
  return await mergeAll(ws, 'getAttendance', { from, to, groupId })
}))

app.get('/api/jibble/timesheet', handler(async (req) => {
  const { from, to, groupId, ws } = req.query
  if (useMock) {
    const records = mock.timesheet.generate(from, to)
    return groupId ? records.filter(r => r.groupId === groupId) : records
  }
  return await mergeAll(ws, 'getTimesheet', { from, to, groupId })
}))

app.get('/api/jibble/workSchedules', handler(async (req) => {
  if (useMock) return mock.workSchedules
  return await mergeAll(req.query?.ws, 'getWorkSchedules')
}))

app.get('/api/jibble/active', handler(async (req) => {
  if (useMock) return mock.getActiveClockIns()
  return await mergeAll(req.query?.ws, 'getActive')
}))

app.listen(PORT, () => {
  console.log(`Backend listo en http://localhost:${PORT}`)
  console.log(`Modo: ${useMock ? 'MOCK (no hay JIBBLE_API_KEY en .env)' : 'LIVE (conectado a Jibble)'}`)
})
