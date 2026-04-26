import { requireAuth } from '../../lib/auth.js'
import { jibble, useMock, mock, jibbleHandler } from '../../lib/jibble-singleton.js'

export default requireAuth(jibbleHandler(async () => {
  if (useMock) return mock.getActiveClockIns()
  return await jibble().getActive()
}))
