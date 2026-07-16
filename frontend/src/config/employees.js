// Configuración específica de empleados de Anuar.
//
// Este archivo tiene los DEFAULTS hardcodeados. La asignación de empleados a
// grupos (locales) puede sobreescribirse desde la UI de Settings y queda en
// localStorage — eso permite usar el plan gratuito de Jibble (que no permite
// asignar grupos a empleados) y administrar la pertenencia a locales acá.
//
// Prioridad al resolver:
//   1) localStorage (configurado por usuario en Settings)
//   2) hardcoded EMPLOYEE_OVERRIDES de este archivo
//   3) lo que devuelve Jibble

// Tarifa por hora estándar: sueldo mínimo Bolivia = 3.300 Bs/mes
//   3.300 / (30 días × 8 horas) = 13,75 Bs/hora
export const DEFAULT_TARIFA = 13.75
export const DEFAULT_SUELDO_MENSUAL = 3300

// IDs de los grupos de Jibble — útiles para defaults de assignment desde código
export const GROUP_IDS = {
  TUESDAY: '8aab06f8-29e2-4a8d-8b64-56d45a81c65a',
  SBARRO_HUPER: 'c861e236-e39c-4fd1-9491-eee531249db6',
  SBARRO_AMERICA: '3ab9e1ac-b61b-462e-9322-b5575e710fac',
  SOS_POLLO: '26503aca-0374-4871-a699-7a779c9426d1',
  OFICINAS: '70a9e06f-6f8f-4f71-b095-7812dc2ef88c',
}

// Overrides específicos. Clave = personId UUID de Jibble.
// Para añadir un nuevo empleado con condiciones especiales, agregar entrada aquí.
export const EMPLOYEE_OVERRIDES = {
  // Leisy Oficina — medio tiempo mañana, Lun-Vie 8-12
  '89948148-3add-4100-a930-cae25ed65003': {
    nombre: 'Leisy Oficina',
    sueldoMensual: 1500,
    tarifa: +(1500 / (30 * 4)).toFixed(2), // 12.50 Bs/h
    schedule: {
      startTime: '08:00',
      endTime: '12:00',
      daysOfWeek: [1, 2, 3, 4, 5],
      expectedHoursPerDay: 4,
      expectedHoursPerWeek: 20,
    },
  },
  // Alejandra Patino — Marketing Oficinas, medio tiempo Lun-Vie 9-13
  // Override groupId porque Jibble plan gratis no permite asignar grupo a empleado
  'bec8074c-3686-4827-a21c-acddc1047a40': {
    nombre: 'Alejandra Patino',
    sueldoMensual: 2200,
    tarifa: +(2200 / (30 * 4)).toFixed(2), // 18.33 Bs/h
    groupId: '70a9e06f-6f8f-4f71-b095-7812dc2ef88c', // OFICINAS TUESDAY
    cargo: 'Marketing',
    schedule: {
      startTime: '09:00',
      endTime: '13:00',
      daysOfWeek: [1, 2, 3, 4, 5],
      expectedHoursPerDay: 4,
      expectedHoursPerWeek: 20,
    },
  },
  // Anuar (Owner) — no se le calcula planilla pero excluyo por las dudas
  '01a52f8a-4b58-4347-bb7a-27ebfa799a51': {
    nombre: 'OFICINAS TUESDAY (Owner)',
    sueldoMensual: 0,
    tarifa: 0,
    skip: true, // marca para excluir de planilla
  },
  // === SBARRO AMÉRICA ===
  // Horario default: 16:00-23:00 todos los días, miércoles libre
  // Fabiola Rojas
  '93a65596-276e-4b8b-93bd-56d0017621ca': {
    nombre: 'Fabiola Rojas',
    groupId: '3ab9e1ac-b61b-462e-9322-b5575e710fac', // SBARRO AMERICA
    sueldoMensual: 3300,
    tarifa: 13.75,
    defaultWeek: {
      '1': { startTime: '16:00', endTime: '23:00' },
      '2': { startTime: '16:00', endTime: '23:00' },
      '3': 'OFF',
      '4': { startTime: '16:00', endTime: '23:00' },
      '5': { startTime: '16:00', endTime: '23:00' },
      '6': { startTime: '16:00', endTime: '23:00' },
      '7': { startTime: '16:00', endTime: '23:00' },
    },
  },
  // Axel Acosta
  '6afcf65b-e0d7-477a-8b92-c16590fcfbfe': {
    nombre: 'Axel Acosta',
    groupId: '3ab9e1ac-b61b-462e-9322-b5575e710fac',
    sueldoMensual: 3300,
    tarifa: 13.75,
    defaultWeek: {
      '1': { startTime: '16:00', endTime: '23:00' },
      '2': { startTime: '16:00', endTime: '23:00' },
      '3': 'OFF',
      '4': { startTime: '16:00', endTime: '23:00' },
      '5': { startTime: '16:00', endTime: '23:00' },
      '6': { startTime: '16:00', endTime: '23:00' },
      '7': { startTime: '16:00', endTime: '23:00' },
    },
  },
  // Anthony Inturias
  '84130dab-0854-42d1-8855-2e7979f4dad5': {
    nombre: 'Anthony Inturias',
    groupId: '3ab9e1ac-b61b-462e-9322-b5575e710fac',
    sueldoMensual: 3300,
    tarifa: 13.75,
    defaultWeek: {
      '1': { startTime: '16:00', endTime: '23:00' },
      '2': { startTime: '16:00', endTime: '23:00' },
      '3': 'OFF',
      '4': { startTime: '16:00', endTime: '23:00' },
      '5': { startTime: '16:00', endTime: '23:00' },
      '6': { startTime: '16:00', endTime: '23:00' },
      '7': { startTime: '16:00', endTime: '23:00' },
    },
  },
}

// Default schedule (para empleados full-time sin override).
// Lun-Sáb 8h/día = 48h/semana. Este es el patrón más común en restaurantes.
// Si un empleado tiene horario distinto, agregar a EMPLOYEE_OVERRIDES.
export const DEFAULT_SCHEDULE = {
  startTime: '09:00',
  endTime: '18:00',
  daysOfWeek: [1, 2, 3, 4, 5, 6],
  expectedHoursPerDay: 8,
  expectedHoursPerWeek: 48,
}

// Resuelve tarifa para una persona: override o default.
export function getTarifaForPerson(personId) {
  const override = EMPLOYEE_OVERRIDES[personId]
  if (override) return override.tarifa
  return DEFAULT_TARIFA
}

// Resuelve schedule efectivo con prioridad:
//   1) userOverrides[personId].schedule (editado en Empleados)
//   2) EMPLOYEE_OVERRIDES[personId].schedule (hardcoded)
//   3) jibbleSchedule (lo que vino de Jibble)
//   4) DEFAULT_SCHEDULE
export function getScheduleForPerson(personId, jibbleSchedule, userOverrides = {}) {
  const userSched = userOverrides[personId]?.schedule
  if (userSched && userSched.startTime && userSched.endTime) {
    return { personId, ...userSched }
  }
  const override = EMPLOYEE_OVERRIDES[personId]
  if (override?.schedule) return { personId, ...override.schedule }
  // isDefault: marca que es un horario genérico (no configurado a propósito) — las
  // alertas lo excluyen para no inventar "debió fichar a las 09:00". Jibble asigna
  // a TODOS un work schedule 09:00-18:00 por defecto, así que ese patrón también
  // cuenta como genérico.
  if (jibbleSchedule) {
    const esGenericoJibble = jibbleSchedule.startTime === DEFAULT_SCHEDULE.startTime
      && jibbleSchedule.endTime === DEFAULT_SCHEDULE.endTime
    return esGenericoJibble ? { ...jibbleSchedule, isDefault: true } : jibbleSchedule
  }
  return { personId, ...DEFAULT_SCHEDULE, isDefault: true }
}

// Local por defecto según el workspace de origen de la persona.
// El workspace B es la cuenta Jibble "SBARRO HUPER" (sin grupos propios):
// toda su gente pertenece a ese local salvo override manual.
export const WORKSPACE_DEFAULT_GROUP = {
  B: GROUP_IDS.SBARRO_HUPER,
}

// Usuarios "dummy" de Jibble (cuentas del local, no personas reales) — nunca
// aparecen en la app. Se matchean por nombre normalizado porque su personId
// varía según el workspace.
const DUMMY_PERSON_NAMES = new Set(['sbarro huper'])
export function esPersonaDummy(fullName) {
  return DUMMY_PERSON_NAMES.has(String(fullName || '').trim().toLowerCase())
}

// Locales ocultos por defecto en todas las vistas (decisión Anuar Jul-2026:
// el panel principal muestra solo Sbarro América y Sbarro Huper). El toggle
// del ojo en Configuración puede revertirlo (hidden:false explícito gana).
const DEFAULT_HIDDEN_GROUPS = new Set([
  GROUP_IDS.SOS_POLLO,
  GROUP_IDS.OFICINAS,
  GROUP_IDS.TUESDAY,
])

// Resuelve si un local está oculto: flag explícito del usuario > default.
export function localOculto(groupId, locales = {}) {
  const flag = locales?.[groupId]?.hidden
  if (flag !== undefined) return !!flag
  return DEFAULT_HIDDEN_GROUPS.has(groupId)
}

// True si la persona NO debe aparecer en planillas/Dashboard:
// - Skip hardcoded (Owner)
// - Hidden por el usuario desde Empleados
export function shouldSkipPerson(personId, userOverrides = {}) {
  if (EMPLOYEE_OVERRIDES[personId]?.skip === true) return true
  if (userOverrides[personId]?.hidden === true) return true
  return false
}

// Resuelve el groupId final de una persona considerando:
// 1) override del usuario en localStorage (personGroupOverrides)
// 2) override hardcodeado en EMPLOYEE_OVERRIDES.groupId
// 3) lo que viene de Jibble (puede ser null en plan gratis)
// 4) default por workspace de origen (ej. todo el ws B → SBARRO HUPER)
export function resolveGroupId(personId, jibbleGroupId, userOverrides = {}, ws = undefined) {
  if (userOverrides[personId]?.groupId) return userOverrides[personId].groupId
  const hard = EMPLOYEE_OVERRIDES[personId]?.groupId
  if (hard) return hard
  return jibbleGroupId || WORKSPACE_DEFAULT_GROUP[ws] || null
}

// Resuelve cargo final: override > Jibble position > vacío
export function resolveCargo(personId, jibblePosition) {
  const hard = EMPLOYEE_OVERRIDES[personId]?.cargo
  if (hard) return hard
  return jibblePosition || ''
}
