// Singleton del cliente Jibble + flags de modo (live/mock).
// Reutilizable desde serverless functions (api/) y dev local (backend/).

import { makeJibbleClient } from './jibble-client.js'
import * as mock from './mock-data.js'

const apiKeyId = process.env.JIBBLE_API_KEY_ID?.trim()
const apiKeySecret = process.env.JIBBLE_API_KEY_SECRET?.trim()
export const useMock = !apiKeyId || !apiKeySecret

let _client = null
export function jibble() {
  if (useMock) return null
  if (!_client) _client = makeJibbleClient(apiKeyId, apiKeySecret)
  return _client
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
