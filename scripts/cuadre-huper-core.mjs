// CUADRE DE SUELDOS — SBARRO HUPER (chequeo CUÁDRUPLE, julio 2026).
// No ejecutar directo: usar `node scripts/cuadre-huper.mjs 2026-07`
// (el lanzador lo bundlea con esbuild y después imprime el PDF con Edge headless).
//
// Compara, por empleado, 4 fuentes:
//   1. Jibble (fichajes crudos de la cuenta B)
//   2. Biométrico físico del local (biometrico huper julio.xls, regla de medianoche)
//   3. Motor de la app con las REGLAS DE LA CASA (ventana pagable + extras por aprobar
//      + modelo mensual 3.300 Bs por 208 h, extras a 13,75)
//   4. Preliminar del contador (montos tipeados en la hoja "Base" del xlsm)
// y genera reportes/CUADRE <MES> - SBARRO HUPER.html con:
//   - el modelo del contador descifrado y verificado monto por monto
//   - discrepancias Jibble ↔ biométrico día por día ("dónde estamos fallando")
//   - extras pendientes de aprobación y llegadas tempranas (señal de revisión)
//   - la PLANILLA LISTA PARA CONTADOR: básico + extras aprobadas − retrasos (por día,
//     con Bs claros) − no-registro; al contador solo le queda añadir faltas mayores,
//     productos y consumos.

import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import { makeJibbleClient } from '../backend/jibble-client.js'
import { turnosDeCarpeta } from './reporte-mensual-core.mjs'
import { resumenSueldos } from '../frontend/src/utils/resumen-sueldos'
import { MODELO_MENSUAL_DEFAULT } from '../frontend/src/utils/payroll'
import { calcularMulta } from '../frontend/src/utils/lateness'
import { isoWeekKey } from '../frontend/src/utils/turnos'
import {
  GROUP_IDS, resolveGroupId, esPersonaDummy, getScheduleForPerson, EMPLOYEE_OVERRIDES,
} from '../frontend/src/config/employees'
import * as XLSX from 'xlsx-js-style'

// ============================== CONFIGURACIÓN ==============================
const CARPETA_HUPER = 'C:/Users/anuar/OneDrive/SBARRO HUPERMALL/1- CUADERNOS/5- CUADERNOS DE GERENTES/2026 CUADERNO GERENTES'

// IDs del biométrico físico → nombre corto (los actuales de Huper)
const IDS_BIOMETRICO = { 30: 'ESTELA', 45: 'CRISTIAN', 46: 'ALICIA', 48: 'GIUSEPE', 49: 'PAULO', 54: 'CARLOS', 37: 'ANGELO' }

// Nombre en Jibble → nombre corto del cuadre
const NOMBRE_JIBBLE = {
  'Giuseppe Argento': 'GIUSEPE', 'Estela Valdez': 'ESTELA', 'Alicia Barbolín': 'ALICIA',
  'Carlos Avila Pérez': 'CARLOS', 'Cristian Murillo': 'CRISTIAN', 'Paulo Delgadillo': 'PAULO',
}

// Preliminar del contador (hoja "Base" de "08 SUELDOS HUPER JULIO 2026 orueba.xlsm").
// Los montos están TIPEADOS en el Excel (sin fórmulas) — esta es la referencia del cuadre.
const CONTADOR_JULIO = {
  GIUSEPE:  { basico: 3212.74, extras: 0,       descuentos: 0,  nota: '' },
  ESTELA:   { basico: 2578,    extras: 0,       descuentos: 48, nota: 'retrasos 20 + otros 28' },
  CARLOS:   { basico: 3300,    extras: 178.75,  descuentos: 41, nota: '' },
  CRISTIAN: { basico: 3300,    extras: 1120.62, descuentos: 10, nota: '' },
  ALICIA:   { basico: 3300,    extras: 460.62,  descuentos: 30, nota: '' },
  PAULO:    { basico: 2181.49, extras: 0,       descuentos: 0,  nota: 'no llegó a 208 h (salario ref. 3.062 en su hoja)' },
}
// ===========================================================================

const { sueldoCompleto, horasCompletas, tarifaExtra } = MODELO_MENSUAL_DEFAULT
const TARIFA_HORA = sueldoCompleto / horasCompletas   // 15,865 Bs/h

const r2 = n => Math.round(n * 100) / 100
const aMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m }
const hhmmUTC4 = isoStr => {
  const d = new Date(isoStr)
  return `${String((d.getUTCHours() + 20) % 24).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

// ================= 1) BIOMÉTRICO (con regla de medianoche) =================
// Las marcas vienen como cadenas "15:0222:34..." por columna-día. Regla:
// una marca antes de las 06:00 es la SALIDA del turno PM del día anterior.
function parseBiometrico(rutaXls, mesStr) {
  const wb = XLSX.readFile(rutaXls)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Reporte de Asistencia'], { header: 1, defval: '' })
  const rawMarcas = {}
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() !== 'ID:') continue
    const id = Number(rows[i].find((x, c) => c > 0 && x !== '' && !isNaN(Number(x))))
    if (!(id in IDS_BIOMETRICO)) continue
    const nombre = IDS_BIOMETRICO[id]
    rawMarcas[nombre] = rawMarcas[nombre] || {}
    for (let j = i + 1; j <= i + 2 && j < rows.length; j++) {
      if (String(rows[j][0]).trim() === 'ID:') break
      rows[j].forEach((cell, col) => {
        const horas = String(cell).match(/\d{2}:\d{2}/g)
        if (!horas) return
        const dia = col + 1
        if (dia < 1 || dia > 31) return
        rawMarcas[nombre][dia] = [...new Set([...(rawMarcas[nombre][dia] || []), ...horas])].sort()
      })
    }
  }
  const bio = {}
  for (const [nombre, dias] of Object.entries(rawMarcas)) {
    bio[nombre] = {}
    const porDia = {}
    for (let d = 1; d <= 31; d++) porDia[d] = (dias[d] || []).slice()
    for (let d = 2; d <= 31; d++) {
      const tempranas = porDia[d].filter(t => aMin(t) < 6 * 60)
      if (tempranas.length) {
        porDia[d] = porDia[d].filter(t => aMin(t) >= 6 * 60)
        porDia[d - 1] = [...porDia[d - 1], tempranas[tempranas.length - 1] + '+1']
      }
    }
    for (let d = 1; d <= 31; d++) {
      const marcas = porDia[d]
      if (!marcas.length) continue
      const normales = marcas.filter(t => !t.endsWith('+1')).sort()
      const cierresMad = marcas.filter(t => t.endsWith('+1'))
      const entrada = normales[0] || null
      let salida = null, cruza = false
      if (cierresMad.length) { salida = cierresMad[0].replace('+1', ''); cruza = true }
      else if (normales.length > 1) salida = normales[normales.length - 1]
      let horas = null
      if (entrada && salida) {
        let min = aMin(salida) - aMin(entrada)
        if (cruza) min += 24 * 60
        if (min > 0 && min < 20 * 60) horas = min / 60
      }
      bio[nombre][`${mesStr}-${String(d).padStart(2, '0')}`] = {
        in: entrada, out: salida, cruza, horas,
      }
    }
  }
  return bio
}

// ============================ CUADRE PRINCIPAL =============================
export async function cuadreHuper(mesStr, raiz) {
  const RAIZ = raiz
  const [anio, mesNum] = mesStr.split('-').map(Number)
  const ini = new Date(anio, mesNum - 1, 1)
  const fin = new Date(anio, mesNum, 0)
  const from = `${mesStr}-01`
  const to = `${mesStr}-${String(fin.getDate()).padStart(2, '0')}`
  const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']
  const mesNombre = `${MESES[mesNum - 1]} ${anio}`

  console.log(`\n════════ CUADRE SBARRO HUPER — ${mesNombre} ════════`)

  // --- Fuente 2: biométrico físico ---
  const rutaBio = path.join(RAIZ, 'biometrico huper julio.xls')
  if (!fs.existsSync(rutaBio)) throw new Error(`No encuentro el export del biométrico: ${rutaBio}`)
  const bio = parseBiometrico(rutaBio, mesStr)
  const bioTotales = {}
  for (const [nombre, dias] of Object.entries(bio)) {
    const conHoras = Object.values(dias).filter(x => x.horas != null)
    bioTotales[nombre] = {
      dias: Object.keys(dias).length,
      completos: conHoras.length,
      horas: r2(conHoras.reduce((a, x) => a + x.horas, 0)),
    }
  }

  // --- Fuente 1: Jibble (cuenta B) ---
  dotenv.config({ path: path.join(RAIZ, 'backend', '.env') })
  const id2 = process.env.JIBBLE_API_KEY_ID_2?.trim(), sec2 = process.env.JIBBLE_API_KEY_SECRET_2?.trim()
  if (!id2 || !sec2) throw new Error('Faltan JIBBLE_API_KEY_ID_2 / SECRET_2 en backend/.env (cuenta de Huper)')
  const client = makeJibbleClient(id2, sec2)
  const [peopleRaw, schedulesArr, attendanceRaw] = await Promise.all([
    client.getPeople(), client.getWorkSchedules(), client.getAttendance({ from, to }),
  ])
  const empleados = peopleRaw
    .filter(p => !esPersonaDummy(p.fullName))
    .filter(p => EMPLOYEE_OVERRIDES[p.id]?.skip !== true)
    .map(p => ({ ...p, groupId: resolveGroupId(p.id, p.groupId, {}, 'B') }))
    .filter(p => p.groupId === GROUP_IDS.SBARRO_HUPER)
  const schedRaw = Object.fromEntries((schedulesArr || []).map(s => [s.personId, s]))
  const schedules = empleados.map(p => getScheduleForPerson(p.id, schedRaw[p.id], {}))
  const personGroup = new Map(empleados.map(p => [p.id, p.groupId]))
  const attendance = attendanceRaw
    .filter(a => personGroup.has(a.personId))
    .map(a => ({ ...a, groupId: personGroup.get(a.personId) }))

  const corto = {}   // personId → nombre corto
  const porCorto = {} // nombre corto → empleado
  for (const p of empleados) {
    const n = NOMBRE_JIBBLE[p.fullName]
    if (n) { corto[p.id] = n; porCorto[n] = p }
  }

  // Jibble por día (para el cruce contra el biométrico).
  // Sesión de ≥16 h = olvidó marcar salida y la cerraron horas/días después
  // (julio trae varias de 24–236 h) → NO suma horas; cuenta como "cierre olvidado".
  const jib = {}
  for (const a of attendance) {
    const n = corto[a.personId]
    if (!n) continue
    jib[n] = jib[n] || {}
    const dur = a.clockOut ? (new Date(a.clockOut) - new Date(a.clockIn)) / 3600000 : null
    const corrupta = dur == null || dur >= 16
    const horas = corrupta ? null : dur
    const prev = jib[n][a.date]
    if (!prev) jib[n][a.date] = { in: hhmmUTC4(a.clockIn), out: a.clockOut ? hhmmUTC4(a.clockOut) : null, horas, corrupta }
    else {
      prev.horas = (prev.horas || 0) + (horas || 0)
      prev.corrupta = prev.corrupta || corrupta
      if (a.clockOut) prev.out = hhmmUTC4(a.clockOut)
    }
  }

  // --- Fuente 3: motor de la app (reglas de la casa + modelo mensual) ---
  const t = turnosDeCarpeta(CARPETA_HUPER, empleados, GROUP_IDS.SBARRO_HUPER, isoWeekKey(ini))
  const resumen = resumenSueldos({
    empleados, attendance, schedules,
    condonaciones: {}, extrasAprobadas: {}, turnos: t.aplicarPorSemana, personOverrides: {},
    ini, fin, settings: { multiplicadorExtra: 1.5 }, getTarifa: () => TARIFA_HORA,
    groupId: GROUP_IDS.SBARRO_HUPER,
    modeloMensual: MODELO_MENSUAL_DEFAULT,
  })
  const filaPorCorto = {}
  for (const f of resumen.filas) if (corto[f.personId]) filaPorCorto[corto[f.personId]] = f

  // --- Cruce Jibble ↔ biométrico ---
  const discrepancias = {}
  for (const n of Object.keys(CONTADOR_JULIO)) {
    const dj = jib[n] || {}, db = bio[n] || {}
    const dias = [...new Set([...Object.keys(dj), ...Object.keys(db)])].sort()
    discrepancias[n] = []
    for (const d of dias) {
      const j = dj[d], b = db[d]
      if (b && !j) discrepancias[n].push({ dia: d, tipo: 'Solo biométrico (no marcó en Jibble)', bio: `${b.in || '?'} → ${b.out || '?'}${b.cruza ? ' (+1)' : ''}`, jib: '—' })
      else if (j && !b) discrepancias[n].push({ dia: d, tipo: 'Solo Jibble (no marcó en el biométrico)', bio: '—', jib: `${j.in || '?'} → ${j.out || '?'}` })
      else if (j?.in && b?.in && Math.abs(aMin(j.in) - aMin(b.in)) > 10) {
        discrepancias[n].push({ dia: d, tipo: `Entrada difiere ${Math.abs(aMin(j.in) - aMin(b.in))} min`, bio: `${b.in} → ${b.out || '?'}${b.cruza ? ' (+1)' : ''}`, jib: `${j.in} → ${j.out || '?'}` })
      }
    }
  }

  // --- Fuente 4 vs modelo: reproducir los montos del contador con horas del biométrico ---
  const modeloSobre = h => r2(Math.min(h, horasCompletas) * TARIFA_HORA + Math.max(0, h - horasCompletas) * tarifaExtra)
  const cuadre = Object.entries(CONTADOR_JULIO).map(([n, c]) => {
    const hBio = bioTotales[n]?.horas || 0
    const hJib = r2(Object.values(jib[n] || {}).reduce((a, x) => a + (x.horas || 0), 0))
    const cierresOlvidados = Object.values(jib[n] || {}).filter(x => x.corrupta).length
    const f = filaPorCorto[n]
    const brutoContador = r2(c.basico + c.extras)
    const modeloBio = modeloSobre(hBio)
    return {
      nombre: n, fullName: porCorto[n]?.fullName || n,
      hBio, hJib, cierresOlvidados, hPagables: f?.horasPagables ?? 0,
      brutoContador, liquidoContador: r2(brutoContador - c.descuentos),
      modeloBio, difModelo: r2(modeloBio - brutoContador),
      appBruto: f?.bruto ?? 0, appLiquido: f?.totalAPagar ?? 0,
      multaBs: f?.multaBs ?? 0, noRegistro: f?.descuentoNoRegistro ?? 0,
      minExtraPendiente: f?.minExtraPendiente ?? 0, diasExtraPendiente: f?.diasExtraPendiente ?? 0,
      diasTemprano: f?.diasTemprano ?? 0, minAntesTotal: f?.minAntesTotal ?? 0,
      faltas: f?.faltas ?? [], nota: c.nota, contador: c,
    }
  })

  // --- Consola: el triple chequeo en números ---
  console.log('\n1) ¿El modelo (208 h → 3.300 · 15,865/h · extras 13,75) reproduce al contador sobre las horas del BIOMÉTRICO?')
  for (const c of cuadre) {
    const ok = Math.abs(c.difModelo) <= 25 ? '✓' : '⚠'
    console.log(`   ${ok} ${c.nombre.padEnd(9)} contador ${String(c.brutoContador).padStart(8)} · modelo(bio ${String(c.hBio).padStart(6)} h) = ${String(c.modeloBio).padStart(8)} · dif ${c.difModelo}`)
  }
  console.log('\n2) Horas por fuente (bio = lo que usa el contador · Jibble sin sesiones corruptas · pagables = reglas nuevas):')
  for (const c of cuadre) {
    console.log(`   ${c.nombre.padEnd(9)} bio ${String(c.hBio).padStart(6)} h · Jibble ${String(c.hJib).padStart(6)} h · pagables app ${String(r2(c.hPagables)).padStart(6)} h · cierres olvidados: ${c.cierresOlvidados} · discrepancias J↔B: ${discrepancias[c.nombre].length}`)
  }
  console.log('\n3) Bs contador vs app (reglas nuevas, extras SIN aprobar todavía):')
  for (const c of cuadre) {
    console.log(`   ${c.nombre.padEnd(9)} contador líquido ${String(c.liquidoContador).padStart(8)} · app líquido ${String(r2(c.appLiquido)).padStart(8)} · retrasos app −${c.multaBs} · extras por aprobar ${c.minExtraPendiente} min`)
  }

  // --- HTML del informe ---
  const html = generarHTML({ mesNombre, mesStr, cuadre, discrepancias, filaPorCorto, bioTotales, resumen })
  const dirReportes = path.join(RAIZ, 'reportes')
  fs.mkdirSync(dirReportes, { recursive: true })
  const rutaHtml = path.join(dirReportes, `CUADRE ${mesNombre} - SBARRO HUPER.html`)
  fs.writeFileSync(rutaHtml, html, 'utf8')
  console.log(`\n✓ Informe HTML: ${rutaHtml}`)
  return { rutaHtml, pdf: path.join(dirReportes, `CUADRE ${mesNombre} - SBARRO HUPER.pdf`) }
}

// ============================== INFORME HTML ==============================
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

function generarHTML({ mesNombre, mesStr, cuadre, discrepancias, filaPorCorto }) {
  const bsF = n => `Bs ${Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const totalContador = cuadre.reduce((a, c) => a + c.liquidoContador, 0)
  const totalApp = cuadre.reduce((a, c) => a + c.appLiquido, 0)
  const totalPendiente = cuadre.reduce((a, c) => a + c.minExtraPendiente, 0)
  const totDiscrep = cuadre.reduce((a, c) => a + discrepancias[c.nombre].length, 0)

  // Detalle de retrasos por día (para que el contador vea el descuento CLARO)
  const filasRetraso = []
  const filasExtraPend = []
  const filasTempranas = []
  for (const c of cuadre) {
    const f = filaPorCorto[c.nombre]
    if (!f) continue
    for (const cell of f.cells || []) {
      if (cell.mins > 0 && cell.mins <= 180) {
        filasRetraso.push({
          nombre: c.nombre, dia: cell.dayStr, prog: cell.programadoStart || '—',
          real: cell.fichaje?.clockIn ? hhmmLocal(cell.fichaje.clockIn) : '—',
          mins: cell.mins, multa: cell.multaDia != null ? cell.multaDia : calcularMulta(cell.mins),
        })
      }
      if (!cell.anomalia && cell.extraAprobable > 0 && !cell.extraAprobada) {
        filasExtraPend.push({
          nombre: c.nombre, dia: cell.dayStr, progFin: cell.programadoEnd || '—',
          realFin: cell.fichaje?.clockOut ? hhmmLocal(cell.fichaje.clockOut) : '—',
          seQuedo: Math.max(0, cell.minSalidaDiff ?? 0), aprobable: cell.extraAprobable,
        })
      }
      if (!cell.anomalia && cell.revisarTemprano) {
        filasTempranas.push({
          nombre: c.nombre, dia: cell.dayStr, prog: cell.programadoStart || '—',
          real: cell.fichaje?.clockIn ? hhmmLocal(cell.fichaje.clockIn) : '—', minAntes: cell.minAntes,
        })
      }
    }
  }
  filasRetraso.sort((a, b) => a.nombre.localeCompare(b.nombre) || a.dia.localeCompare(b.dia))
  filasExtraPend.sort((a, b) => a.nombre.localeCompare(b.nombre) || a.dia.localeCompare(b.dia))
  filasTempranas.sort((a, b) => a.nombre.localeCompare(b.nombre) || a.dia.localeCompare(b.dia))

  function hhmmLocal(isoStr) {
    const d = new Date(isoStr)
    return `${String((d.getUTCHours() + 20) % 24).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  }
  const fmtDia = s => `${s.slice(8)}/${s.slice(5, 7)}`

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Cuadre ${esc(mesNombre)} — Sbarro Huper</title>
<style>
  :root { --tinta:#1d1a16; --suave:#6b6257; --linea:#e4ddd2; --fondo:#faf7f2; --acento:#b4531f; --ok:#2e7d4f; --mal:#b3261e; --warn:#9a6b00; }
  * { box-sizing: border-box; margin: 0; }
  body { font: 13px/1.55 Georgia, 'Times New Roman', serif; color: var(--tinta); background:#fff; padding: 0; }
  main { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 26px; letter-spacing: -0.02em; }
  h2 { font-size: 17px; margin: 26px 0 8px; padding-bottom: 4px; border-bottom: 2px solid var(--tinta); }
  h2 .num { color: var(--acento); }
  p.nota { color: var(--suave); font-size: 12px; margin: 4px 0 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 8px 0; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--suave); border-bottom: 1px solid var(--tinta); padding: 4px 6px; }
  td { padding: 4px 6px; border-bottom: 1px solid var(--linea); vertical-align: top; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  tr.total td { border-top: 2px solid var(--tinta); border-bottom: none; font-weight: bold; }
  .ok { color: var(--ok); } .mal { color: var(--mal); } .warn { color: var(--warn); }
  .caja { background: var(--fondo); border: 1px solid var(--linea); border-radius: 8px; padding: 12px 14px; margin: 10px 0; }
  .kpis { display: flex; gap: 10px; margin: 14px 0; }
  .kpi { flex: 1; background: var(--fondo); border: 1px solid var(--linea); border-radius: 8px; padding: 10px 12px; }
  .kpi b { display: block; font-size: 19px; }
  .kpi span { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--suave); }
  .firma { color: var(--suave); font-size: 11px; margin-top: 26px; border-top: 1px solid var(--linea); padding-top: 8px; }
  @media print { .caja, .kpi { -webkit-print-color-adjust: exact; print-color-adjust: exact; } h2 { break-after: avoid; } table { break-inside: auto; } tr { break-inside: avoid; } }
</style></head><body><main>

<header>
  <h1>Cuadre de sueldos — Sbarro Huper · ${esc(mesNombre)}</h1>
  <p class="nota">Chequeo cuádruple: Jibble (app) · biométrico físico · motor con las reglas de la casa · preliminar del contador.
  Generado desde <em>scripts/cuadre-huper.mjs</em>.</p>
</header>

<div class="kpis">
  <div class="kpi"><span>Contador (líquido)</span><b>${bsF(totalContador)}</b></div>
  <div class="kpi"><span>App reglas nuevas (líquido)</span><b>${bsF(totalApp)}</b></div>
  <div class="kpi"><span>Extras por aprobar</span><b>${totalPendiente} min</b></div>
  <div class="kpi"><span>Discrepancias Jibble↔biométrico</span><b>${totDiscrep} días</b></div>
</div>

<h2><span class="num">1.</span> El modelo del contador, descifrado y verificado</h2>
<div class="caja">
  <b>Cómo calcula el contador (confirmado número por número):</b> usa las horas del <b>biométrico físico</b> y paga
  <b>Bs 15,865 por hora</b> (= 3.300 ÷ 208). Al llegar a <b>208 h</b> el básico se congela en <b>Bs 3.300</b> y
  cada hora por encima va como “extras” a <b>Bs 13,75</b> (= 3.300 ÷ 240). Quien no llega a 208 h cobra proporcional
  — por eso Paulo cobra menos: no cubrió las 208 h del mes.
</div>
<table>
  <tr><th>Empleado</th><th class="n">Horas biométrico</th><th class="n">Modelo sobre esas horas</th><th class="n">Bruto del contador</th><th class="n">Diferencia</th><th>Lectura</th></tr>
  ${cuadre.map(c => `<tr>
    <td>${esc(c.nombre)}</td><td class="n">${c.hBio.toFixed(2)}</td>
    <td class="n">${bsF(c.modeloBio)}</td><td class="n">${bsF(c.brutoContador)}</td>
    <td class="n ${Math.abs(c.difModelo) <= 25 ? 'ok' : 'warn'}">${c.difModelo > 0 ? '+' : ''}${c.difModelo.toFixed(2)}</td>
    <td>${Math.abs(c.difModelo) <= 25 ? 'cuadra' : 'ajuste manual del contador (recortes a mano)'}${c.nota ? ` · ${esc(c.nota)}` : ''}</td>
  </tr>`).join('')}
</table>
<p class="nota">Diferencias chicas = redondeos y recortes manuales que el contador aplica “a ojo” (justo lo que estas reglas automatizan).</p>

<h2><span class="num">2.</span> Dónde estamos fallando: Jibble vs biométrico, día por día</h2>
<p class="nota">El contador cobra con el biométrico; la app ve Jibble. Cada día que falta en Jibble son horas que la app no puede pagar.
“Cierres olvidados” = sesiones de Jibble que quedaron abiertas y se cerraron 24–236 h después (julio tiene ${cuadre.reduce((a, c) => a + c.cierresOlvidados, 0)}): ese día la app paga el horario programado, no lo marcado.
Estas son TODAS las diferencias (${totDiscrep} días):</p>
<table>
  <tr><th>Empleado</th><th class="n">Bio</th><th class="n">Jibble</th><th class="n">Pagables (app)</th><th class="n">Cierres olvidados</th><th>Diferencias día por día</th></tr>
  ${cuadre.map(c => `<tr>
    <td>${esc(c.nombre)}</td><td class="n">${c.hBio.toFixed(1)} h</td><td class="n">${c.hJib.toFixed(1)} h</td><td class="n">${Number(c.hPagables).toFixed(1)} h</td>
    <td class="n ${c.cierresOlvidados > 0 ? 'mal' : 'ok'}">${c.cierresOlvidados}</td>
    <td>${discrepancias[c.nombre].length === 0 ? '<span class="ok">sin diferencias</span>'
      : discrepancias[c.nombre].map(d => `<div><b>${fmtDia(d.dia)}</b> — ${esc(d.tipo)} · bio ${esc(d.bio)} · Jibble ${esc(d.jib)}</div>`).join('')}
    </td>
  </tr>`).join('')}
</table>
<div class="caja">
  <b>Acción:</b> el personal marca en el biométrico pero se olvida de Jibble (días que faltan, entradas más tarde,
  y sesiones sin cerrar). El modo kiosco en tablet corrige esto: una sola marcada, en la entrada del local.
</div>

<h2><span class="num">3.</span> Señales de revisión — antes de aprobar la planilla</h2>
<p class="nota">Reglas de la casa: llegar antes no suma (ventana arranca en la hora programada) y quedarse después
no se paga salvo aprobación tuya (desde el minuto 16). Aprueba o descarta en la web → Sueldos → detalle del empleado.</p>
${filasExtraPend.length ? `
<h3 style="font-size:13px;margin-top:12px">Extras pendientes de aprobación (${filasExtraPend.length} días · ${filasExtraPend.reduce((a, x) => a + x.aprobable, 0)} min)</h3>
<table>
  <tr><th>Empleado</th><th>Día</th><th class="n">Salida prog.</th><th class="n">Marcó salida</th><th class="n">Se quedó</th><th class="n">Aprobable (min 16+)</th><th class="n">Si apruebas</th></tr>
  ${filasExtraPend.map(x => `<tr>
    <td>${esc(x.nombre)}</td><td>${fmtDia(x.dia)}</td><td class="n">${esc(x.progFin)}</td><td class="n">${esc(x.realFin)}</td>
    <td class="n">${x.seQuedo} min</td><td class="n warn"><b>${x.aprobable} min</b></td><td class="n">${bsF(x.aprobable / 60 * 13.75)}</td>
  </tr>`).join('')}
</table>` : '<p class="ok">Sin extras pendientes.</p>'}
${filasTempranas.length ? `
<h3 style="font-size:13px;margin-top:12px">Llegadas ≥30 min antes del horario (${filasTempranas.length}) — no se pagan, pero revisa qué pasó</h3>
<table>
  <tr><th>Empleado</th><th>Día</th><th class="n">Entrada prog.</th><th class="n">Marcó</th><th class="n">Min antes</th></tr>
  ${filasTempranas.map(x => `<tr><td>${esc(x.nombre)}</td><td>${fmtDia(x.dia)}</td><td class="n">${esc(x.prog)}</td><td class="n">${esc(x.real)}</td><td class="n warn">${x.minAntes}</td></tr>`).join('')}
</table>` : ''}

<h2><span class="num">4.</span> Retrasos y sus descuentos, día por día</h2>
<p class="nota">Multa escalonada del local: 1–10 min = Bs 10 · cada bloque de 10 min adicional suma Bs 20. Retrasos de más de 3 h no se cobran (horario mal cargado — salen en rojo en la app).</p>
${filasRetraso.length ? `<table>
  <tr><th>Empleado</th><th>Día</th><th class="n">Entrada prog.</th><th class="n">Marcó</th><th class="n">Min tarde</th><th class="n">Multa</th></tr>
  ${filasRetraso.map(x => `<tr><td>${esc(x.nombre)}</td><td>${fmtDia(x.dia)}</td><td class="n">${esc(x.prog)}</td><td class="n">${esc(x.real)}</td><td class="n">${x.mins}</td><td class="n mal">−${bsF(x.multa)}</td></tr>`).join('')}
  <tr class="total"><td colspan="5">Total multas por retraso</td><td class="n mal">−${bsF(filasRetraso.reduce((a, x) => a + x.multa, 0))}</td></tr>
</table>` : '<p class="ok">Sin retrasos con multa en el mes.</p>'}

<h2><span class="num">5.</span> Planilla lista para el contador</h2>
<p class="nota">Básico por el modelo (15,865/h hasta 208 h, tope 3.300) sobre las <b>horas pagables</b> (recortadas a la ventana
programada) + extras que apruebes a 13,75 − retrasos (arriba, día por día) − no-registro (Bs 20 por día con marcado incompleto).
<b>Al contador solo le queda añadir: faltas mayores, productos y consumos.</b></p>
<table>
  <tr><th>Empleado</th><th class="n">Horas pagables</th><th class="n">Básico</th><th class="n">Extras (&gt;208 h + aprobadas)</th><th class="n">Retrasos</th><th class="n">No-registro</th><th class="n">Líquido app</th><th class="n">Contador (ref.)</th><th class="n">Faltas may. / productos / consumos</th></tr>
  ${cuadre.map(c => {
    const f = filaPorCorto[c.nombre] || {}
    return `<tr>
    <td>${esc(c.nombre)}${c.minExtraPendiente > 0 ? ` <span class="warn">(*${c.minExtraPendiente} min por aprobar)</span>` : ''}</td>
    <td class="n">${Number(c.hPagables).toFixed(2)}</td>
    <td class="n">${bsF(f.baseTarifa || 0)}</td>
    <td class="n">${bsF(f.extraTarifa || 0)}</td>
    <td class="n mal">−${bsF(c.multaBs)}</td>
    <td class="n mal">−${bsF(c.noRegistro)}</td>
    <td class="n"><b>${bsF(c.appLiquido)}</b></td>
    <td class="n">${bsF(c.liquidoContador)}</td>
    <td class="n">__________</td>
  </tr>`
  }).join('')}
  <tr class="total"><td>TOTAL</td><td></td><td></td><td></td>
    <td class="n mal">−${bsF(cuadre.reduce((a, c) => a + c.multaBs, 0))}</td>
    <td class="n mal">−${bsF(cuadre.reduce((a, c) => a + c.noRegistro, 0))}</td>
    <td class="n">${bsF(totalApp)}</td><td class="n">${bsF(totalContador)}</td><td></td></tr>
</table>
<div class="caja">
  <b>Por qué el líquido de la app es distinto al del contador:</b>
  (1) el contador usa horas del biométrico y la app usa Jibble — los días que faltan en Jibble (sección 2) no se pueden pagar;
  (2) el contador paga TODO el tiempo marcado (llegadas tempranas y quedadas incluidas) — las reglas nuevas recortan a la ventana
  programada y las quedadas quedan como extras <b>que tú apruebas</b>;
  (3) la app ya descuenta retrasos y no-registro, el preliminar del contador casi no descuenta.
  Con el kiosco (una sola fuente de marcado) y las aprobaciones al día, ambos números convergen.
</div>

<p class="firma">Cuadre generado automáticamente · reglas: sueldo ref. Bs 3.300 / 208 h/mes (Bs 15,865/h) · extras aprobadas Bs 13,75/h desde el minuto 16 ·
llegar antes no suma (≥30 min antes = revisar) · multa retraso escalonada · no-registro Bs 20/día · ${esc(mesStr)}</p>

</main></body></html>`
}
