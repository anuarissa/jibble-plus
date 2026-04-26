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

app.use(cors())
app.use(express.json())

// Logger sencillo
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`)
  next()
})

const jibble = useMock ? null : makeJibbleClient(apiKeyId, apiKeySecret)

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

app.get('/api/jibble/groups', handler(async () => {
  if (useMock) return mock.groups
  return await jibble.getGroups()
}))

app.get('/api/jibble/people', handler(async () => {
  if (useMock) return mock.people
  return await jibble.getPeople()
}))

app.get('/api/jibble/attendance', handler(async (req) => {
  const { from, to, groupId } = req.query
  if (useMock) {
    const records = mock.timesheet.generate(from, to)
    return groupId ? records.filter(r => r.groupId === groupId) : records
  }
  return await jibble.getAttendance({ from, to, groupId })
}))

app.get('/api/jibble/timesheet', handler(async (req) => {
  const { from, to, groupId } = req.query
  if (useMock) {
    const records = mock.timesheet.generate(from, to)
    return groupId ? records.filter(r => r.groupId === groupId) : records
  }
  return await jibble.getTimesheet({ from, to, groupId })
}))

app.get('/api/jibble/workSchedules', handler(async () => {
  if (useMock) return mock.workSchedules
  return await jibble.getWorkSchedules()
}))

app.get('/api/jibble/active', handler(async () => {
  if (useMock) return mock.getActiveClockIns()
  return await jibble.getActive()
}))

app.listen(PORT, () => {
  console.log(`Backend listo en http://localhost:${PORT}`)
  console.log(`Modo: ${useMock ? 'MOCK (no hay JIBBLE_API_KEY en .env)' : 'LIVE (conectado a Jibble)'}`)
})
