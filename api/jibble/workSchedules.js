import { requireAuth } from '../../lib/auth.js'
import { jibbleAll, useMock, mock, jibbleHandler } from '../../lib/jibble-singleton.js'

export default requireAuth(jibbleHandler(async (req) => {
  if (useMock) return mock.workSchedules
  return await jibbleAll(req.query?.ws).getWorkSchedules()
}))
