// POST /api/login — recibe { password }, devuelve { ok, token } si match
import { makeToken } from '../lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }
  const expectedPassword = process.env.APP_PASSWORD
  if (!expectedPassword) {
    // Modo dev/local sin password: permitir cualquier login y devolver token vacío
    return res.json({ ok: true, token: 'dev', protected: false })
  }
  const sent = (req.body?.password || '').toString()
  if (sent !== expectedPassword) {
    // Pequeño delay para frenar fuerza bruta básica (rate limiting real se hace en Vercel/Cloudflare)
    await new Promise(r => setTimeout(r, 500))
    return res.status(401).json({ error: 'invalid_password' })
  }
  return res.json({ ok: true, token: makeToken(expectedPassword), protected: true })
}
