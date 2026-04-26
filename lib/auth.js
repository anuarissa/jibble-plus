// Auth simple por contraseña + token HMAC (sin BD).
//
// Flujo:
//   1) Frontend → POST /api/login con { password }
//   2) Backend valida password contra APP_PASSWORD env var
//   3) Si OK, devuelve token = HMAC-SHA256(APP_PASSWORD, "jibble-app-v1")
//      (no expira, no requiere DB; si Anuar quiere revocar a todos, cambia APP_PASSWORD)
//   4) Frontend guarda token en localStorage y lo manda en header Authorization
//   5) Cada API valida con verifyToken(req)

import crypto from 'node:crypto'

const SALT = 'jibble-app-v1'

export function makeToken(password) {
  if (!password) return null
  return crypto.createHmac('sha256', password).update(SALT).digest('hex')
}

// Valida la request: lee Authorization: Bearer <token> y compara con el esperado.
// Retorna true si OK. Si false, el handler debe responder 401.
export function verifyRequest(req) {
  const expectedPassword = process.env.APP_PASSWORD
  if (!expectedPassword) {
    // Sin APP_PASSWORD configurada → app abierta (modo local/dev sin auth)
    return true
  }
  const auth = req.headers.authorization || ''
  const m = auth.match(/^Bearer\s+(.+)$/)
  if (!m) return false
  const expected = makeToken(expectedPassword)
  // Comparación timing-safe
  const sent = m[1]
  if (sent.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected))
}

// Wrapper para handlers serverless: valida token o devuelve 401.
export function requireAuth(handler) {
  return async (req, res) => {
    if (!verifyRequest(req)) {
      return res.status(401).json({ error: 'unauthorized' })
    }
    return handler(req, res)
  }
}
