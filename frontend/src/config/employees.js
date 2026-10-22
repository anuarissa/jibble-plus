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
  // Fabiola Rojas — SIN defaultWeek a propósito: hoy es cajera AM (cuaderno de
  // horarios) y el default viejo de tarde (16:00-23:00) le medía las tardanzas
  // contra las 16:00. Su horario real viene del Excel; un día sin Excel no se
  // evalúa (regla de Anuar: sin horario cargado no se inventan multas).
  '93a65596-276e-4b8b-93bd-56d0017621ca': {
    nombre: 'Fabiola Rojas',
    groupId: '3ab9e1ac-b61b-462e-9322-b5575e710fac', // SBARRO AMERICA
    sueldoMensual: 3300,
    tarifa: 13.75,
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
  // === SOS POLLO · gente del kiosco de Jibble (plantilla real al 22-oct-2026) ===
  // Creados en la cuenta Principal para fichar en el celular del local en modo
  // quiosco (nombre + PIN de 4 dígitos). El plan gratis ya no deja asignar grupo
  // (Groups es Premium), así que sin este groupId caerían en SBARRO AMÉRICA.
  //
  // skip: true MIENTRAS la planilla de SOS siga saliendo del aparato de huellas.
  // Si entran como gente real de SOS, useJibble.js toma la rama "local CON
  // Jibble" y deja de crear los sintéticos del aparato → se perdería el
  // histórico de julio/agosto. El día que SOS cobre por los fichajes del kiosco:
  // quitar skip y sacar SOS_POLLO de GRUPOS_SOLO_BIOMETRICO.
  '51126b10-560a-4adc-8d28-f433ffb6b36e': { nombre: 'Nicolas Bernardo', groupId: GROUP_IDS.SOS_POLLO, skip: true },   // PIN 1981
  'f31b0ccb-d682-47fa-83e1-de277b8b5d18': { nombre: 'Carla', groupId: GROUP_IDS.SOS_POLLO, skip: true },              // PIN 9861
  '7cb1a19f-7d44-4ba8-9f01-db9f4f202104': { nombre: 'Carlo', groupId: GROUP_IDS.SOS_POLLO, skip: true },              // PIN 9027
  '7f291d7b-08a0-45b9-86bd-bbf6758acfc3': { nombre: 'Itai', groupId: GROUP_IDS.SOS_POLLO, skip: true },               // PIN 2768
  '0b72580f-5905-4a1b-8a56-ce355ab5ef2c': { nombre: 'Wendy', groupId: GROUP_IDS.SOS_POLLO, skip: true },              // PIN 4448
  'beca728d-ba8e-44f0-9b12-e9ff290f4248': { nombre: 'Yeico', groupId: GROUP_IDS.SOS_POLLO, skip: true },              // PIN 5860
  'd7201535-41cc-4c21-8281-3b38b321558a': { nombre: 'Lorena', groupId: GROUP_IDS.SOS_POLLO, skip: true },             // PIN 2295
  '66f3f810-4e1a-444f-981b-53be5311e78c': { nombre: 'Henry', groupId: GROUP_IDS.SOS_POLLO, skip: true },              // PIN 8163
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

// Cuenta A ("Principal"): solo tiene gente de SBARRO AMÉRICA y de OFICINAS, y
// Jibble (plan gratis) no asigna grupos. Quien no tenga grupo cae en América,
// salvo estos nombres de oficina. MISMA regla que el CLI (reporte-mensual) —
// antes solo existía ahí, y por eso gente nueva de América (ej. Carolina
// Villalobos) no aparecía en la web hasta asignarla a mano.
const OFICINAS_NOMBRES = new Set(['leisy oficina', 'erika bascope', 'vladimir hooper', 'oficinas tuesday'])
export function esPersonaDeOficinas(fullName) {
  return OFICINAS_NOMBRES.has(String(fullName || '').trim().toLowerCase())
}

// Alias FIJOS de nombres del cuaderno de horarios → personId (o 'IGNORAR'),
// compartidos por la web y el CLI (antes solo existían en reporte-mensual-core y
// la web no los tenía: "FABIOLA" era ambigua entre Rojas y Nava, el matcher la
// descartaba y su horario del Excel nunca se aplicaba). Los alias que el usuario
// guarda desde la página (jibble_alias_nombres_v1) tienen prioridad sobre estos.
// OJO: aplican SOLO al matching de horarios — el biométrico se resuelve aparte
// (allí hay DOS Fabiolas del aparato y se asignan por id del aparato).
export const ALIAS_TURNOS_FIJOS = {
  [GROUP_IDS.SBARRO_HUPER]: {
    daniela: 'IGNORAR',                                      // gerente (filas 00:00)
    giussep: '0fd05836-c25d-4fc9-ad3d-97bb14524a06',         // Giuseppe Argento (typo de 3 letras, fuera del alcance del matcher)
    andy: 'IGNORAR',                                         // apoyo EXTRA, no registrado en Jibble
    nuevo: 'IGNORAR',                                        // fila placeholder del gerente
    // Gente de Huper que solo existe en el aparato (ver ALIAS_BIO_FIJOS): el
    // cuaderno los escribe distinto que el reloj y "ANGHELO" empataba entre
    // Angelo y Angel. Son DOS personas (Anuar, 10-sep-2026).
    anghelo: 'bio:c861e236-e39c-4fd1-9491-eee531249db6:37',  // ANGELO del aparato (id 37)
    angel: 'bio:c861e236-e39c-4fd1-9491-eee531249db6:51',    // ANGEL del aparato (id 51)
    brenda: 'bio:c861e236-e39c-4fd1-9491-eee531249db6:1',    // BRENDA del aparato (id 1), desde sep-2026
    // ALONDRA se pasó de la América al Huper el 21-sep-2026 pero todavía no
    // tiene huella en este aparato ni ficha en esta cuenta de Jibble: sin esto
    // el cuaderno le generaría faltas por días que nadie puede medir.
    alondra: 'IGNORAR',
  },
  [GROUP_IDS.SBARRO_AMERICA]: {
    anuar: 'IGNORAR',                                        // el dueño no entra a planilla
    fabiola: '93a65596-276e-4b8b-93bd-56d0017621ca',         // Fabiola Rojas (la cajera AM del cuaderno; Nava también existe en Jibble → ambigüedad)
    angel: 'bio:3ab9e1ac-b61b-462e-9322-b5575e710fac:3',     // ANGEL del aparato (id 3), vino del Huper en sep-2026
    // MATIAS: el cuaderno lo programa todas las semanas 18:00-23:00 pero solo
    // lo llaman días sueltos (4 en sep-2026, Anuar 11-oct) → sin horario fijo:
    // cobra las horas que marca y no se le cuentan faltas por días que nadie
    // esperaba que viniera. Si pasa a turno fijo, apuntarlo a su id del aparato.
    matias: 'IGNORAR',
  },
  [GROUP_IDS.SOS_POLLO]: {
    // Puestos SIN persona fija en el cuaderno del gerente: esa gente se paga al
    // día y no entra a la planilla (decisión de Anuar, 21-ago-2026).
    'x/despacho': 'IGNORAR',
    'x/mesas': 'IGNORAR',
  },
  // TUESDAY: local solo-biométrico. El gerente escribe los nombres a su manera (y
  // hasta mete dos personas en una fila), así que estos alias son los que evitan
  // faltas falsas: 32 días (Bs 3.520) en sep-2026. Antes vivían solo en
  // scripts/reporte-mensual-core (ALIAS_GERENTE_TUESDAY / TUESDAY_SIN_BIOMETRICO) y
  // la web no los tenía — el mismo origen del bug de Fabiola.
  [GROUP_IDS.TUESDAY]: {
    gabriela: 'bio:8aab06f8-29e2-4a8d-8b64-56d45a81c65a:52',  // GABY del aparato (id 52)
    // "ALEJA NDRA" (fila AM 11:30-15:30) y "ALEJANDRA" (fila PM 19:00-23:00) son la
    // MISMA persona con turno partido (sus marcas son 11:19 → 23:03). Sin esto la
    // mitad AM caía en ALE (id 3, que marcó 1 día) → 17 faltas falsas en sep-2026 y
    // Alejandra cobraba medio turno. El parser prueba el nombre sin espacios.
    alejandra: 'bio:8aab06f8-29e2-4a8d-8b64-56d45a81c65a:84',
    // El gerente la escribe "KATTY" y "KATY"; en el aparato es KATHY (id 1). Estaba
    // en la lista de "sin huella" → su horario se ignoraba y sus 17 días de sep
    // cobraban sin nada contra lo que medir.
    katty: 'bio:8aab06f8-29e2-4a8d-8b64-56d45a81c65a:1',
    katy: 'bio:8aab06f8-29e2-4a8d-8b64-56d45a81c65a:1',
    // Fila con DOS personas: su tramo PM 16:00-23:59 es de Fernando (sin huella) y
    // caía en DANZ, que trabaja de mañana (07:56 → 16:04) → ventana pagable de 4
    // minutos por 8 h trabajadas. Pedirle al gerente que separe la fila.
    'fernando / danz': 'IGNORAR',
    // Gente del cuaderno sin huella en el aparato: se informa, no cobra por la app.
    // "KENY" no es Kevin — Kevin tiene sus propias filas y cuadra 25/25 días.
    fernando: 'IGNORAR',
    'fernando ticona': 'IGNORAR',
    pedro: 'IGNORAR',
    israel: 'IGNORAR',
    'extra/israel': 'IGNORAR',
    daniel: 'IGNORAR',
    keny: 'IGNORAR',
    luis: 'IGNORAR',
    laura: 'IGNORAR',
    nuevo: 'IGNORAR',
  },
}

// Gente del aparato biométrico registrada con un nombre que NO es el suyo (lo
// tipeó el gerente en el reloj). Se corrige por código para que web y CLI
// muestren lo mismo; el usuario puede pisarlo desde Empleados → Nombre
// (personOverrides[personId].nombre gana sobre esto).
// { [groupId]: { [idBio]: 'Nombre real' } }
export const RENOMBRES_APARATO = {
  [GROUP_IDS.SOS_POLLO]: {
    9: 'Nicolas Bernardo',   // "NICOLAS" con 27 días — es Bernardo (confirmado por Anuar, 21-ago-2026)
  },
}

export function nombreDeAparato(groupId, idBio, nombreOriginal) {
  return RENOMBRES_APARATO[groupId]?.[idBio] || nombreOriginal
}

// Gente que MARCA en el aparato pero NO cobra sueldo por la app: cubre-turnos
// que se pagan al día. Sus marcas no entran a la planilla del local ni figuran
// como empleados. { [groupId]: [idBio...] }
export const SIN_PLANILLA_APARATO = {
  [GROUP_IDS.TUESDAY]: [
    21,   // ANUAR — la huella del dueño (marcó 1 vez en sep-2026)
  ],
  [GROUP_IDS.SBARRO_HUPER]: [
    16,   // VLADY — cubre-turnos, no cobra por planilla
    17,   // ANUAR — la huella del dueño (marcó 1 vez en sep)
  ],
  [GROUP_IDS.SOS_POLLO]: [
    29,   // VLADY (1 día en julio) — no cubre sueldo (Anuar, 21-ago-2026)
    55,   // ALEJANDRO (7 días en julio) — íd.
  ],
}

export function esFueraDePlanilla(groupId, idBio) {
  return (SIN_PLANILLA_APARATO[groupId] || []).includes(Number(idBio))
}

// Alias FIJOS del biométrico en locales CON Jibble: personas del aparato que no
// están en Jibble pero SÍ cobran por planilla → 'CREAR' (empleado solo
// biométrico). Clave 'id:<idBio>' (misma que usa el panel web). Los alias que
// el usuario guarda en la página tienen prioridad.
export const ALIAS_BIO_FIJOS = {
  [GROUP_IDS.SBARRO_HUPER]: {
    'id:37': 'CREAR',   // ANGELO — cuaderno "ANGHELO", marcó 3–15 ago 2026
    'id:51': 'CREAR',   // ANGEL — entró el 25 ago 2026, se fue a la América el 21 sep
    'id:1': 'CREAR',    // BRENDA — entró el 23 sep 2026 (reemplaza a Angel)
  },
  [GROUP_IDS.SBARRO_AMERICA]: {
    // La huella 31 es Fabiola Rojas (Anuar, 16-sep-2026). Sin esto sus ~214 h de
    // agosto no se pagaban y le salían 27 faltas falsas: en Jibble hay dos
    // Fabiolas y el matcher no puede elegir sola.
    'id:31': '93a65596-276e-4b8b-93bd-56d0017621ca',
    'id:40': 'CREAR',   // LUCIANA — solo existe en el aparato (decisión de Anuar 19-ago-2026)
    'id:3': 'CREAR',    // ANGEL — el mismo que trabajaba en Huper: se vino el 22 sep 2026
    'id:2': 'CREAR',    // MATIAS — por fin tiene huella; trabajó 4 días de sep (Anuar, 11-oct)
  },
}

// Bajas: último día trabajado. Desde el día siguiente la persona no entra a la
// planilla (ni faltas ni fila vacía), pero los meses que sí trabajó se conservan
// — por eso no se usa "ocultar", que la borraría también de su historia.
export const FECHAS_BAJA = {
  // TUESDAY, septiembre 2026 (Anuar, 11-oct): cuatro salidas en el mes. Sin estas
  // fechas el cuaderno les sigue generando faltas de Bs 110 por día.
  'bio:8aab06f8-29e2-4a8d-8b64-56d45a81c65a:84': '2026-09-13', // ALEJANDRA (aparato id 84)
  'bio:8aab06f8-29e2-4a8d-8b64-56d45a81c65a:30': '2026-09-15', // JUAN (id 30)
  'bio:8aab06f8-29e2-4a8d-8b64-56d45a81c65a:2': '2026-09-21',  // ITALO (id 2)
  'bio:8aab06f8-29e2-4a8d-8b64-56d45a81c65a:78': '2026-09-27', // JHILDA (id 78) — solo 3 días en el mes
  '1337f853-a692-4143-9ade-4319d1cc139e': '2026-07-25', // Carlos Avila Pérez (Huper) — ya no trabaja (Anuar, 10-sep-2026)
  'bio:c861e236-e39c-4fd1-9491-eee531249db6:37': '2026-08-15', // ANGELO (Huper, aparato id 37) — se fue el 15-ago
  // Septiembre 2026: ALONDRA y ANGEL se cambiaron de local a mitad de mes
  // (Anuar, 11-oct-2026). Cada local paga solo su parte; sin estas fechas les
  // caerían Bs 110 de falta por cada día posterior a su salida.
  '46d4b11d-3837-45ed-9d1c-5cd3070b3fd5': '2026-09-20', // Alondra Sbarro — dejó la América y se fue al Huper
  'bio:c861e236-e39c-4fd1-9491-eee531249db6:51': '2026-09-21', // ANGEL en Huper — se fue a la América
}

// Ingresos: primer día trabajado. Los días ANTERIORES no cuentan (ni como falta
// aunque el cuaderno ya lo tuviera en el horario — caso real: el gerente puso a
// ANGEL desde el 18-ago y empezó el 25).
export const FECHAS_ALTA = {
  // TUESDAY, septiembre 2026: KATTY entró el 7 y los cuatro nuevos empezaron a
  // marcar el 21-22. JANETH figuraba en el cuaderno desde el 7 como lavaplatos pero
  // entró el 22 (Anuar, 11-oct-2026) → esas 9 faltas no eran suyas.
  'bio:8aab06f8-29e2-4a8d-8b64-56d45a81c65a:1': '2026-09-07',  // KATHY (id 1)
  'bio:8aab06f8-29e2-4a8d-8b64-56d45a81c65a:3': '2026-09-21',  // ALE (id 3) — marcó 1 día
  'bio:8aab06f8-29e2-4a8d-8b64-56d45a81c65a:5': '2026-09-22',  // JANETH (id 5)
  'bio:8aab06f8-29e2-4a8d-8b64-56d45a81c65a:6': '2026-09-22',  // DANZ (id 6)
  'bio:8aab06f8-29e2-4a8d-8b64-56d45a81c65a:7': '2026-09-22',  // PAULO (id 7)
  'bio:c861e236-e39c-4fd1-9491-eee531249db6:51': '2026-08-25', // ANGEL (Huper, aparato id 51)
  'bio:3ab9e1ac-b61b-462e-9322-b5575e710fac:3': '2026-09-22',  // ANGEL en la América (vino del Huper)
  'bio:c861e236-e39c-4fd1-9491-eee531249db6:1': '2026-09-23',  // BRENDA (Huper)
}

export const fechaBaja = personId => FECHAS_BAJA[personId] || null
export const fechaAlta = personId => FECHAS_ALTA[personId] || null

// true si la persona ya se había ido ANTES de este día (yyyy-MM-dd).
export function dadoDeBajaAntesDe(personId, diaStr) {
  const baja = FECHAS_BAJA[personId]
  return !!baja && baja < diaStr
}

// true si la persona NO trabajó en ningún día del rango [iniStr, finStr]:
// se fue antes de que empiece o entró después de que termine.
export function fueraDeRango(personId, iniStr, finStr) {
  const alta = FECHAS_ALTA[personId]
  return dadoDeBajaAntesDe(personId, iniStr) || (!!alta && alta > finStr)
}

// true si ese día (yyyy-MM-dd) está fuera de su período de trabajo.
export function diaFueraDeContrato(personId, diaStr) {
  const baja = FECHAS_BAJA[personId], alta = FECHAS_ALTA[personId]
  return (!!baja && diaStr > baja) || (!!alta && diaStr < alta)
}

// Locales SIN cuenta Jibble: su personal existe SOLO en el biométrico físico
// (personas sintéticas). Lista EXPLÍCITA a propósito: si un local con cuenta
// Jibble no muestra gente (p.ej. el workspace activo excluye su cuenta), NO se
// deben inventar sintéticos — eso rompería el cruce con turnos/tarifas por
// personId. Agregar aquí futuros locales solo-biométrico.
export const GRUPOS_SOLO_BIOMETRICO = new Set([
  GROUP_IDS.TUESDAY,
  GROUP_IDS.SOS_POLLO,   // biométrico pendiente — el día que llegue su export, funciona solo
])

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
// Solo OFICINAS queda oculto por default (pedido de Anuar 13-ago: TUESDAY y SOS
// deben aparecer como opción en TODOS los dispositivos, tengan o no datos aún).
// El flag explícito del usuario (ojo en Configuración) siempre gana.
const DEFAULT_HIDDEN_GROUPS = new Set([
  GROUP_IDS.OFICINAS,
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
// 5) cuenta A sin grupo → América (o Oficinas por nombre) — pasar fullName
export function resolveGroupId(personId, jibbleGroupId, userOverrides = {}, ws = undefined, fullName = '') {
  if (userOverrides[personId]?.groupId) return userOverrides[personId].groupId
  const hard = EMPLOYEE_OVERRIDES[personId]?.groupId
  if (hard) return hard
  if (jibbleGroupId) return jibbleGroupId
  if (WORKSPACE_DEFAULT_GROUP[ws]) return WORKSPACE_DEFAULT_GROUP[ws]
  // Sin grupo en la cuenta Principal: Oficinas por nombre, el resto América.
  if ((ws === 'A' || ws === '1') && fullName) {
    return esPersonaDeOficinas(fullName) ? GROUP_IDS.OFICINAS : GROUP_IDS.SBARRO_AMERICA
  }
  return null
}

// Resuelve cargo final: override > Jibble position > vacío
export function resolveCargo(personId, jibblePosition) {
  const hard = EMPLOYEE_OVERRIDES[personId]?.cargo
  if (hard) return hard
  return jibblePosition || ''
}
