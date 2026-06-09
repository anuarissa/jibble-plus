import { requireAuth } from '../../lib/auth.js'
import { jibbleAll, useMock, mock, jibbleHandler } from '../../lib/jibble-singleton.js'

export default requireAuth(jibbleHandler(async (req) => {
  const { from, to, groupId, ws } = req.query
  if (useMock) {
    const records = mock.timesheet.generate(from, to)
    return groupId ? records.filter(r => r.groupId === groupId) : records
  }
  return await jibbleAll(ws).getTimesheet({ from, to, groupId })
}))
