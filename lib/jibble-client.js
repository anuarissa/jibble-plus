// Cliente real Jibble v2.
//
// Auth: OAuth 2.0 client_credentials (token ~1h, cacheado).
// Dos servicios OData:
//   - Workspace:     https://workspace.prod.jibble.io/v1     (Groups, People, Schedules, Positions)
//   - TimeTracking:  https://time-tracking.prod.jibble.io/v1 (TimeEntries, WhoIsWorkingNow)
//
// Modelo TimeEntry de Jibble: cada fichaje es UN evento (type: "In" o "Out"),
// linked-list con previousTimeEntryId/nextTimeEntryId. Aquí los emparejamos
// por persona+día para formar sesiones { clockIn, clockOut } como espera la app.

import axios from 'axios'

const TOKEN_URL = process.env.JIBBLE_TOKEN_URL    || 'https://identity.prod.jibble.io/connect/token'
const WS_BASE   = process.env.JIBBLE_BASE_URL     || 'https://workspace.prod.jibble.io/v1'
const TT_BASE   = process.env.JIBBLE_TIME_BASE    || 'https://time-tracking.prod.jibble.io/v1'

export function makeJibbleClient(clientId, clientSecret) {
  let cachedToken = null
  let cachedUntil = 0

  async function getToken() {
    const now = Date.now()
    if (cachedToken && now < cachedUntil) return cachedToken
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    })
    const { data } = await axios.post(TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    })
    cachedToken = data.access_token
    cachedUntil = now + ((data.expires_in || 3600) - 60) * 1000
    return cachedToken
  }

  async function get(base, path, params = {}) {
    const token = await getToken()
    const { data } = await axios.get(base + path, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      params,
      timeout: 25000,
    })
    return data.value !== undefined ? data.value : data
  }

  return {
    async getGroups() {
      const groups = await get(WS_BASE, '/Groups')
      return groups.filter(g => g.status !== 'Removed').map(adaptGroup)
    },

    async getPeople() {
      const [people, positions] = await Promise.all([
        get(WS_BASE, '/People', { '$top': 500 }),
        get(WS_BASE, '/Positions').catch(() => []),
      ])
      const posById = new Map(positions.map(p => [p.id, p.name]))
      return people
        .filter(p => p.status !== 'Removed')
        .map(p => adaptPerson(p, posById))
    },

    async getAttendance({ from, to, groupId } = {}) {
      // Pedimos TimeEntries en rango y los emparejamos In/Out por persona+día.
      const params = { '$top': 1000, '$orderby': 'time asc' }
      const filters = ['status eq \'Active\'']
      if (from) filters.push(`belongsToDate ge ${from}`)
      if (to)   filters.push(`belongsToDate le ${to}`)
      params['$filter'] = filters.join(' and ')

      const entries = await get(TT_BASE, '/TimeEntries', params)

      // Necesitamos groupId por persona (TimeEntries no lo trae). Lo cruzamos con People.
      const people = await get(WS_BASE, '/People', { '$top': 500 })
      const personGroup = new Map(people.map(p => [p.id, p.groupId]))

      const sessions = pairInOut(entries, personGroup)
      return groupId ? sessions.filter(s => s.groupId === groupId) : sessions
    },

    async getTimesheet(opts) {
      return this.getAttendance(opts)
    },

    async getActive() {
      // WhoIsWorkingNow lista personas con un fichaje "In" abierto.
      try {
        const list = await get(TT_BASE, '/WhoIsWorkingNow', { '$top': 200 })
        return list.map(adaptWhoIsWorkingNow)
      } catch {
        return []
      }
    },

    async getWorkSchedules() {
      // Cada persona puede tener un scheduleId. Pedimos people con expand y resolvemos.
      const people = await get(WS_BASE, '/People', { '$top': 500, '$expand': 'schedule' })
      return people
        .filter(p => p.status !== 'Removed')
        .map(adaptScheduleFromPerson)
        .filter(Boolean)
    },
  }
}

// ---------- Adapters ----------

function adaptGroup(g) {
  return { id: g.id, name: g.name }
}

function adaptPerson(p, posById) {
  const fn = (p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.preferredName || 'Sin nombre').trim()
  const isOwner = p.role === 'Owner'
  return {
    id: p.id,
    fullName: fn,
    firstName: p.firstName || fn.split(' ')[0],
    lastName: p.lastName || fn.split(' ').slice(1).join(' '),
    position: posById?.get(p.positionId) || (isOwner ? 'Propietario' : ''),
    groupId: p.groupId,
    groupName: null,
    avatarUrl: p.avatarUrl || null,
    role: p.role,
    email: p.email,
  }
}

// Empareja eventos In/Out de Jibble en sesiones completas.
// Estrategia: por personId, ordenar por time asc, recorrer y armar {clockIn, clockOut}.
function pairInOut(entries, personGroup) {
  const byPerson = new Map()
  for (const e of entries) {
    if (!byPerson.has(e.personId)) byPerson.set(e.personId, [])
    byPerson.get(e.personId).push(e)
  }
  const sessions = []
  for (const [personId, list] of byPerson) {
    list.sort((a, b) => new Date(a.time) - new Date(b.time))
    let openIn = null
    for (const e of list) {
      if (e.type === 'In') {
        if (openIn) {
          // 'In' previo sin out — registrar como sesión activa abierta.
          sessions.push(makeSession(openIn, null, personGroup.get(personId)))
        }
        openIn = e
      } else if (e.type === 'Out') {
        if (openIn) {
          sessions.push(makeSession(openIn, e, personGroup.get(personId)))
          openIn = null
        }
        // Out sin In previo: lo ignoramos (datos huérfanos).
      }
    }
    if (openIn) {
      // Sesión activa al final (no hay clock-out aún).
      sessions.push(makeSession(openIn, null, personGroup.get(personId)))
    }
  }
  return sessions
}

function makeSession(inEv, outEv, groupId) {
  const inTime = inEv.time
  const outTime = outEv?.time || null
  const date = inEv.belongsToDate || (inTime ? inTime.slice(0, 10) : null)
  const durationMinutes = outTime
    ? Math.round((new Date(outTime) - new Date(inTime)) / 60000)
    : null
  return {
    id: inEv.id,
    personId: inEv.personId,
    groupId: groupId || null,
    date,
    clockIn: inTime,
    clockOut: outTime,
    durationMinutes,
    location: inEv.coordinates || null,
  }
}

function adaptWhoIsWorkingNow(w) {
  // Shape común: incluye personId, lastInTime/inTime, etc.
  return {
    id: w.id || w.timeEntryId || w.personId,
    personId: w.personId,
    groupId: w.groupId || null,
    date: (w.inTime || w.time || '').slice(0, 10),
    clockIn: w.inTime || w.time,
    clockOut: null,
    durationMinutes: null,
    location: null,
  }
}

function adaptScheduleFromPerson(p) {
  const sched = p.schedule
  if (!sched) {
    return {
      personId: p.id,
      daysOfWeek: [1, 2, 3, 4, 5, 6],
      startTime: '09:00',
      endTime: '18:00',
      expectedHoursPerDay: 8,
      expectedHoursPerWeek: 48,
    }
  }
  const expectedHoursPerWeek = parseISO8601DurationHours(sched.weeklyHours) || 48
  return {
    personId: p.id,
    daysOfWeek: sched.daysOfWeek || [1, 2, 3, 4, 5],
    startTime: firstDefined(sched.startTime, sched.shifts?.[0]?.startTime, '09:00'),
    endTime: firstDefined(sched.endTime, sched.shifts?.[0]?.endTime, '18:00'),
    expectedHoursPerDay: Math.round(expectedHoursPerWeek / 5),
    expectedHoursPerWeek,
  }
}

function firstDefined(...vals) {
  for (const v of vals) if (v != null && v !== '') return v
  return null
}

function parseISO8601DurationHours(s) {
  if (!s || typeof s !== 'string') return null
  const m = s.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/)
  if (!m) return null
  const [, d, h, mi] = m
  return (parseInt(d || 0) * 24) + parseInt(h || 0) + (parseInt(mi || 0) / 60)
}
