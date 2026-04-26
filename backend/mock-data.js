// Mock data realista para los 4 restaurantes de Anuar.
// Refleja el shape esperado de la API Jibble (subset que usa la app).
// Si Jibble responde con un shape diferente, el adaptador en jibble-client.js lo normaliza.

import { addDays, format, setHours, setMinutes, startOfWeek } from 'date-fns'

const today = new Date()
const weekStart = startOfWeek(today, { weekStartsOn: 1 }) // lunes

// 5 locales: 4 restaurantes + Oficinas (gente de admin/gerencia que reporta directo a Anuar)
export const groups = [
  { id: 'g-tuesday',     name: 'Tuesday S.R.L',   color: '#ff6b35', emoji: '🍔' },
  { id: 'g-sbarro-h',    name: 'Sbarro Huper',    color: '#dc2626', emoji: '🍕' },
  { id: 'g-sbarro-a',    name: 'Sbarro América',  color: '#0ea5e9', emoji: '🍕' },
  { id: 'g-sospollo',    name: 'S.O.S. Pollo',    color: '#eab308', emoji: '🍗' },
  { id: 'g-oficinas',    name: 'Oficinas',        color: '#a855f7', emoji: '💼' },
]

const firstNames = ['Carlos', 'Ana', 'Luis', 'María', 'Pedro', 'Sofía', 'Diego', 'Lucía', 'Javier', 'Camila', 'Andrés', 'Valeria', 'Roberto', 'Daniela', 'Fernando', 'Gabriela']
const lastNames  = ['Rojas', 'Mamani', 'Quispe', 'Villca', 'Choque', 'Flores', 'Vargas', 'Suárez', 'Mendoza', 'Cruz', 'Ríos', 'Salazar']
const positions  = ['Cajero', 'Mesero', 'Cocinero', 'Encargado', 'Ayudante', 'Parrillero', 'Barista', 'Limpieza']
const officePositions = ['Contador', 'Administración', 'RRHH', 'Compras', 'Marketing', 'Asistente Gerencia']

function pseudoRandom(seed) {
  // RNG determinista para que los mocks sean estables entre reloads
  let x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

function makeEmployees() {
  const people = []
  let idx = 0
  for (const g of groups) {
    const isOffice = g.id === 'g-oficinas'
    // Oficinas: 4-5 personas. Restaurantes: 6-8.
    const count = isOffice
      ? 4 + Math.floor(pseudoRandom(idx + 1) * 2)
      : 6 + Math.floor(pseudoRandom(idx + 1) * 3)
    const posList = isOffice ? officePositions : positions
    for (let i = 0; i < count; i++) {
      const seed = idx * 100 + i
      const fn = firstNames[Math.floor(pseudoRandom(seed) * firstNames.length)]
      const ln = lastNames[Math.floor(pseudoRandom(seed + 7) * lastNames.length)]
      const pos = posList[Math.floor(pseudoRandom(seed + 13) * posList.length)]
      people.push({
        id: `p-${g.id}-${i}`,
        fullName: `${fn} ${ln}`,
        firstName: fn,
        lastName: ln,
        position: pos,
        groupId: g.id,
        groupName: g.name,
        avatarUrl: null,
      })
    }
    idx++
  }
  return people
}

export const people = makeEmployees()

// Horarios: oficina típico (9-18 Lun-Vie) vs restaurante (turnos 8-16 / 14-22 Lun-Sáb)
export const workSchedules = people.map((p, i) => {
  const isOffice = p.groupId === 'g-oficinas'
  if (isOffice) {
    return {
      personId: p.id,
      daysOfWeek: [1, 2, 3, 4, 5], // Lun-Vie
      startTime: '09:00',
      endTime: '18:00',
      expectedHoursPerDay: 8, // 9h - 1h almuerzo
      expectedHoursPerWeek: 40,
    }
  }
  const shiftMorning = i % 2 === 0
  const startHour = shiftMorning ? 8 : 14
  const endHour = shiftMorning ? 16 : 22
  return {
    personId: p.id,
    daysOfWeek: [1, 2, 3, 4, 5, 6], // Lun-Sáb
    startTime: `${String(startHour).padStart(2, '0')}:00`,
    endTime: `${String(endHour).padStart(2, '0')}:00`,
    expectedHoursPerDay: endHour - startHour,
    expectedHoursPerWeek: (endHour - startHour) * 6,
  }
})

// Fichajes (timesheet/attendance): últimos 14 días
// Mezcla: la mayoría puntuales, algunos con tardanzas distribuidas para poblar las vistas.
function makeAttendance() {
  const records = []
  for (let dayOffset = -13; dayOffset <= 0; dayOffset++) {
    const day = addDays(today, dayOffset)
    const dow = day.getDay() // 0=domingo
    if (dow === 0) continue // domingos cerrado
    for (const p of people) {
      const sched = workSchedules.find(s => s.personId === p.id)
      if (!sched.daysOfWeek.includes(dow === 0 ? 7 : dow)) continue
      const seed = p.id.length * 31 + dayOffset * 7
      const r1 = pseudoRandom(seed)
      const r2 = pseudoRandom(seed + 1)
      // 70% puntual, 20% tarde leve (1-9 min), 8% tarde grave (10-30 min), 2% no fichó
      let lateMinutes = 0
      let absent = false
      if (r1 < 0.02) absent = true
      else if (r1 < 0.10) lateMinutes = 10 + Math.floor(r2 * 21) // 10-30
      else if (r1 < 0.30) lateMinutes = 1 + Math.floor(r2 * 9)  // 1-9
      if (absent) continue
      const [sh, sm] = sched.startTime.split(':').map(Number)
      const [eh, em] = sched.endTime.split(':').map(Number)
      const clockIn = setMinutes(setHours(day, sh), sm + lateMinutes)
      // 90% sale a tiempo, 10% sale 0-30 min después (horas extra)
      const overtimeMinutes = r2 < 0.1 ? Math.floor(r2 * 300) : 0
      const clockOut = setMinutes(setHours(day, eh), em + overtimeMinutes)
      records.push({
        id: `a-${p.id}-${dayOffset}`,
        personId: p.id,
        groupId: p.groupId,
        date: format(day, 'yyyy-MM-dd'),
        clockIn: clockIn.toISOString(),
        clockOut: clockOut.toISOString(),
        scheduledStart: sched.startTime,
        scheduledEnd: sched.endTime,
        durationMinutes: Math.round((clockOut - clockIn) / 60000),
        location: { lat: -17.39 + (pseudoRandom(seed + 5) - 0.5) * 0.02, lng: -66.16 + (pseudoRandom(seed + 6) - 0.5) * 0.02 },
      })
    }
  }
  return records
}

export const attendance = makeAttendance()

// Empleados con fichaje activo HOY (los que ya entraron pero no salieron, simulado)
// 30% del turno de mañana está fichado actualmente
export function getActiveClockIns() {
  const todayStr = format(today, 'yyyy-MM-dd')
  const todayRecords = attendance.filter(a => a.date === todayStr)
  // Devolver solo algunos como "activos" (sin clockOut)
  return todayRecords
    .filter((_, i) => i % 3 === 0)
    .map(r => ({ ...r, clockOut: null, durationMinutes: null }))
}

export const timesheet = {
  // Resumen por persona/semana — la app lo recalcula con utils/payroll, pero exponemos el shape
  generate(from, to) {
    const fromDate = from ? new Date(from) : addDays(today, -7)
    const toDate = to ? new Date(to) : today
    const filtered = attendance.filter(a => {
      const d = new Date(a.date)
      return d >= fromDate && d <= toDate
    })
    return filtered
  },
}
