// GET /api/health — público (no requiere token)
import { useMock } from '../lib/jibble-singleton.js'

export default function handler(req, res) {
  res.json({
    ok: true,
    mode: useMock ? 'mock' : 'live',
    connected: !useMock,
    baseUrl: process.env.JIBBLE_BASE_URL || 'https://workspace.prod.jibble.io/v1',
    protected: !!process.env.APP_PASSWORD,
    timestamp: new Date().toISOString(),
  })
}
