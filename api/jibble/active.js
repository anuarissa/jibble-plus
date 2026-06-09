import { requireAuth } from '../../lib/auth.js'
import { jibbleAll, useMock, mock, jibbleHandler } from '../../lib/jibble-singleton.js'

export default requireAuth(jibbleHandler(async (req) => {
  if (useMock) return mock.getActiveClockIns()
  return await jibbleAll(req.query?.ws).getActive()
}))
