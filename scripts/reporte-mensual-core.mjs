// Núcleo del reporte mensual por local, SIN navegador.
// No ejecutar directo: usar `node scripts/reporte-mensual.mjs 2026-07`
// (el lanzador lo bundlea con esbuild porque los utils del frontend usan
// imports sin extensión que node puro no resuelve).
//
// Qué hace por cada local configurado en LOCALES:
//   1. Consulta a Jibble (credenciales de backend/.env) la gente y los fichajes del mes.
//   2. Parsea los turnos DIRECTO de la carpeta OneDrive del local (mismos parsers de la app;
//      si dos Excel traen la misma semana gana el modificado más recientemente).
//   3. Genera reportes/reporte_mensual_<LOCAL>_<mes>.xlsx con el motor real de la app
//      (RESUMEN, RANKING, ASISTENCIA día a día, TARDANZAS, PLANILLA).
//   4. Imprime los huecos: semanas del mes sin planilla, nombres sin resolver, días a revisar.
//
// LIMITACIÓN (documentada): las tarifas editadas en el navegador y las condonaciones
// viven en el localStorage de la app → aquí se usan las tarifas de config/default y
// cero condonaciones. Para la versión con esos ajustes: app → Sueldos → Mes → Excel.

import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import { makeJibbleClient } from '../backend/jibble-client.js'
import { parseWorkbookTurnos } from '../frontend/src/utils/excel-turnos'
import { isoWeekKey } from '../frontend/src/utils/turnos'
import { descargarReporteMensual } from '../frontend/src/utils/reporte-mensual'
import { resumenSueldos } from '../frontend/src/utils/resumen-sueldos'
import { MODELO_MENSUAL_DEFAULT } from '../frontend/src/utils/payroll'
import {
  GROUP_IDS, resolveGroupId, esPersonaDummy, getTarifaForPerson, getScheduleForPerson, EMPLOYEE_OVERRIDES,
} from '../frontend/src/config/employees'
import * as XLSX from 'xlsx-js-style'

let RAIZ = process.cwd()

// ============================== CONFIGURACIÓN ==============================
// Carpeta OneDrive de planillas por local + cuenta Jibble (A = 1ra del .env, B = _2, ...)
const LOCALES = [
  {
    nombre: 'SBARRO AMERICA',
    groupId: GROUP_IDS.SBARRO_AMERICA,
    ws: 'A',
    carpeta: 'C:/Users/anuar/OneDrive/SBARRO AMERICA/CUADERNOS DE GERENTES SA/PLANILLA SUPERVISORES SA/2026/HORARIOS 2026',
  },
  {
    nombre: 'SBARRO HUPER',
    groupId: GROUP_IDS.SBARRO_HUPER,
    ws: 'B',
    carpeta: 'C:/Users/anuar/OneDrive/SBARRO HUPERMALL/1- CUADERNOS/5- CUADERNOS DE GERENTES/2026 CUADERNO GERENTES',
  },
]

// La cuenta Principal solo tiene América + Oficinas: la gente sin grupo asignado en
// Jibble se asume de América, salvo estos nombres (Oficinas, no entran al reporte).
const OFICINAS_NOMBRES = new Set(['leisy oficina', 'erika bascope', 'vladimir hooper', 'oficinas tuesday'])

// Alias de nombres del Excel → resolución fija para el CLI (editable).
// 'IGNORAR' = ese nombre del Excel no se reporta (gerente, dueño, personal rotado).
const ALIASES = {
  [GROUP_IDS.SBARRO_HUPER]: {
    daniela: 'IGNORAR',                                      // gerente (filas 00:00)
    giussep: '0fd05836-c25d-4fc9-ad3d-97bb14524a06',         // Giuseppe Argento (typo de 3 letras, fuera del alcance del matcher)
    andy: 'IGNORAR',                                         // apoyo EXTRA, no registrado en Jibble
    nuevo: 'IGNORAR',                                        // fila placeholder del gerente
  },
  [GROUP_IDS.SBARRO_AMERICA]: {
    anuar: 'IGNORAR',
    fabiola: '93a65596-276e-4b8b-93bd-56d0017621ca', // Fabiola Rojas (Nava ya no trabaja pero sigue en Jibble → ambigüedad)
  },
}
// ===========================================================================

function leerCredenciales() {
  dotenv.config({ path: path.join(RAIZ, 'backend', '.env') })
  const cuentas = {}
  if (process.env.JIBBLE_API_KEY_ID && process.env.JIBBLE_API_KEY_SECRET) {
    cuentas.A = { id: process.env.JIBBLE_API_KEY_ID.trim(), secret: process.env.JIBBLE_API_KEY_SECRET.trim() }
  }
  for (const n of [2, 3, 4]) {
    const id = process.env[`JIBBLE_API_KEY_ID_${n}`]?.trim()
    const secret = process.env[`JIBBLE_API_KEY_SECRET_${n}`]?.trim()
    if (id && secret) cuentas[String.fromCharCode(64 + n)] = { id, secret }
  }
  return cuentas
}

// Réplica en fs de leerCarpeta (mismo comportamiento que la app):
// todos los .xlsx, orden por mtime asc → semana repetida la gana el más nuevo.
// (exportada: también la usa scripts/cuadre-huper-core.mjs)
export function turnosDeCarpeta(carpeta, empleados, groupId, desdeSemana) {
  const out = { aplicarPorSemana: {}, noEncontrados: [], warnings: [], archivos: [] }
  if (!fs.existsSync(carpeta)) {
    out.warnings.push(`La carpeta no existe: ${carpeta}`)
    return out
  }
  const archivos = fs.readdirSync(carpeta)
    .filter(f => /\.xlsx?$/i.test(f) && !f.startsWith('~$'))
    .map(f => ({ f, full: path.join(carpeta, f), mtime: fs.statSync(path.join(carpeta, f)).mtimeMs }))
    .sort((a, b) => a.mtime - b.mtime)
  for (const { f, full } of archivos) {
    try {
      const wb = XLSX.readFile(full)
      const r = parseWorkbookTurnos(wb, empleados, { aliases: ALIASES[groupId] || {}, desdeSemana })
      for (const [wk, porPersona] of Object.entries(r.aplicarPorSemana)) out.aplicarPorSemana[wk] = porPersona
      for (const n of r.noEncontrados) if (!out.noEncontrados.includes(n)) out.noEncontrados.push(n)
      for (const w of r.warnings) {
        if (w.startsWith('Detectadas') || w.startsWith('Empleados no encontrados')) continue
        const linea = `${f}: ${w}`
        if (!out.warnings.includes(linea)) out.warnings.push(linea)
      }
      out.archivos.push(f)
    } catch (e) {
      out.warnings.push(`${f}: ${e.message}`)
    }
  }
  return out
}

function lunesDelMes(anio, mes0) {
  // Lunes de cada semana ISO que toca el mes
  const lunes = []
  const d = new Date(anio, mes0, 1)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // lunes de la 1ra semana
  while (d <= new Date(anio, mes0 + 1, 0)) {
    lunes.push(new Date(d))
    d.setDate(d.getDate() + 7)
  }
  return lunes
}

export async function generarReportes(mesStr, raiz) {
  if (raiz) RAIZ = raiz
  const [anio, mesNum] = mesStr.split('-').map(Number)
  const mes = new Date(anio, mesNum - 1, 1)
  const ini = new Date(anio, mesNum - 1, 1)
  const fin = new Date(anio, mesNum, 0)
  const from = `${mesStr}-01`
  const to = `${mesStr}-${String(fin.getDate()).padStart(2, '0')}`

  const cuentas = leerCredenciales()
  const dirReportes = path.join(RAIZ, 'reportes')
  fs.mkdirSync(dirReportes, { recursive: true })
  process.chdir(dirReportes) // XLSX.writeFile escribe relativo al cwd

  console.log(`\n════════ REPORTE MENSUAL ${mesStr} ════════`)
  let generados = 0

  for (const local of LOCALES) {
    console.log(`\n── ${local.nombre} (cuenta ${local.ws}) ──`)
    const cred = cuentas[local.ws]
    if (!cred) {
      console.log(`  ✗ SIN CREDENCIALES para la cuenta ${local.ws} en backend/.env`)
      console.log(`    Agrega JIBBLE_API_KEY_ID${local.ws === 'A' ? '' : '_' + (local.ws.charCodeAt(0) - 64)} y su SECRET (Jibble web → Ajustes de la organización → Credenciales API) y vuelve a correr.`)
      continue
    }

    const client = makeJibbleClient(cred.id, cred.secret)
    const [peopleRaw, schedulesArr, attendanceRaw] = await Promise.all([
      client.getPeople(),
      client.getWorkSchedules(),
      client.getAttendance({ from, to }),
    ])

    // Personas del local: mismos defaults que la app + regla Oficinas para la cuenta A
    const empleados = peopleRaw
      .filter(p => !esPersonaDummy(p.fullName))
      .filter(p => EMPLOYEE_OVERRIDES[p.id]?.skip !== true)
      .map(p => {
        let groupId = resolveGroupId(p.id, p.groupId, {}, local.ws)
        if (!groupId && local.ws === 'A') {
          groupId = OFICINAS_NOMBRES.has(p.fullName.trim().toLowerCase()) ? GROUP_IDS.OFICINAS : GROUP_IDS.SBARRO_AMERICA
        }
        return { ...p, groupId }
      })
      .filter(p => p.groupId === local.groupId)

    console.log(`  Personal: ${empleados.length} — ${empleados.map(e => e.fullName.split(' ')[0]).join(', ')}`)

    const schedRaw = Object.fromEntries((schedulesArr || []).map(s => [s.personId, s]))
    const schedules = empleados.map(p => getScheduleForPerson(p.id, schedRaw[p.id], {}))

    // Fichajes con el groupId de la persona (mismo re-mapeo que la app)
    const personGroup = new Map(empleados.map(p => [p.id, p.groupId]))
    const attendance = attendanceRaw
      .filter(a => personGroup.has(a.personId))
      .map(a => ({ ...a, groupId: personGroup.get(a.personId) }))
    console.log(`  Fichajes del mes: ${attendance.length} sesiones`)

    // Turnos desde la carpeta OneDrive (ruido de nombres solo del mes hacia adelante)
    const t = turnosDeCarpeta(local.carpeta, empleados, local.groupId, isoWeekKey(ini))
    console.log(`  Planillas leídas: ${t.archivos.length ? t.archivos.join(' · ') : '(ninguna)'}`)

    // Cobertura de semanas del mes
    const semanas = lunesDelMes(anio, mesNum - 1).map(l => isoWeekKey(l))
    const sinPlanilla = semanas.filter(wk => !t.aplicarPorSemana[wk])
    if (sinPlanilla.length) console.log(`  ⚠ Semanas del mes SIN planilla: ${sinPlanilla.join(', ')} (esos días no evalúan faltas/tardanzas)`)
    if (t.noEncontrados.length) console.log(`  ⚠ Nombres del Excel sin resolver: ${t.noEncontrados.join(', ')}`)
    for (const w of t.warnings) console.log(`  ⚠ ${w}`)

    // cfg mínimo compatible con el motor de reportes
    const cfg = {
      config: {
        locales: { [local.groupId]: { name: local.nombre } },
        settings: { toleranciaMinutos: 0, multiplicadorExtra: 1.5 },
      },
      condonaciones: {},
      turnos: t.aplicarPorSemana,
      personOverrides: {},
      getTarifaResolved: (id) => getTarifaForPerson(id),
    }

    descargarReporteMensual({
      empleados, attendance, schedules,
      condonaciones: {}, turnos: t.aplicarPorSemana, personOverrides: {},
      mes, cfg, group: { id: local.groupId, name: local.nombre },
    })

    // Totales de control (mismo motor que la página Sueldos, modo Mes → modelo mensual
    // del contador: 3.300 Bs por 208 h, extras aprobadas a 13,75 Bs/h). Las aprobaciones
    // viven en el navegador (localStorage) — el CLI no aprueba, solo lista pendientes.
    const resumen = resumenSueldos({
      empleados, attendance, schedules,
      condonaciones: {}, extrasAprobadas: {}, turnos: t.aplicarPorSemana, personOverrides: {},
      ini, fin, settings: cfg.config.settings, getTarifa: cfg.getTarifaResolved, groupId: local.groupId,
      modeloMensual: MODELO_MENSUAL_DEFAULT,
    })
    const tt = resumen.totales
    console.log(`  Totales: ${tt.horasTrabajadas} h trabajadas / ${tt.horasProgramadas} h programadas · ${tt.faltas} faltas · ${tt.minTarde} min tarde (−Bs ${tt.multaBs}) · a pagar Bs ${tt.totalAPagar}`)
    if (tt.diasExtraPendiente > 0 || tt.diasTemprano > 0) {
      console.log(`  ⚠ Revisión pendiente: ${tt.diasExtraPendiente} día(s) con extras por aprobar (${tt.minExtraPendiente} min, no pagados) · ${tt.diasTemprano} llegada(s) ≥30 min antes`)
      for (const f of resumen.filas) {
        if (f.diasExtraPendiente > 0 || f.diasTemprano > 0) {
          const partes = []
          if (f.diasExtraPendiente > 0) partes.push(`${f.minExtraPendiente} min extra por aprobar en ${f.diasExtraPendiente} día(s)`)
          if (f.diasTemprano > 0) partes.push(`${f.diasTemprano} llegada(s) temprana(s) (${f.minAntesTotal} min)`)
          console.log(`    - ${f.fullName}: ${partes.join(' · ')} → aprobar en la web (Sueldos → detalle)`)
        }
      }
    }
    const safe = local.nombre.replace(/[^a-z0-9]+/gi, '_')
    console.log(`  ✓ Excel: reportes/reporte_mensual_${safe}_${mesStr}.xlsx`)
    generados++
  }

  console.log(`\n${generados}/${LOCALES.length} reportes generados en ${dirReportes}`)
  console.log('Nota: tarifas editadas en el navegador y condonaciones NO se incluyen (usar la app → Sueldos → Excel para esa versión).\n')
}
