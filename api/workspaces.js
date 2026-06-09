// Lista las cuentas Jibble configuradas en este deploy.
// El frontend lo usa para armar el dropdown de selector de cuenta.

import { requireAuth } from '../lib/auth.js'
import { listWorkspaces, useMock } from '../lib/jibble-singleton.js'

export default requireAuth(async (req, res) => {
  try {
    if (useMock) {
      res.json([{ id: 1, ws: 'A', name: 'Demo (Mock)' }])
      return
    }
    res.json(listWorkspaces())
  } catch (err) {
    console.error('workspaces error:', err)
    res.status(500).json({ error: 'workspaces_error', detail: err.message })
  }
})
