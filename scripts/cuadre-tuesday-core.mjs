// CUADRE DE SUELDOS — TUESDAY AMÉRICA (julio 2026 en adelante).
// No ejecutar directo: usar `node scripts/cuadre-tuesday.mjs 2026-07`
//
// Tuesday NO usa Jibble: la asistencia sale del BIOMÉTRICO físico y los horarios
// del CUADERNO del gerente (hoja PERSONAL TUESDAY). Se compara contra la planilla
// BANCARIA del contador (archivo "excel-simplificado", los montos líquidos reales)
// aplicando las MISMAS reglas de la casa que en Sbarro:
//   ventana pagable (llegar antes no suma, quedarse después no se paga sin aprobar),
//   multa escalonada por retraso, no-registro Bs 20, modelo mensual 208 h → Bs 3.300
//   (15,865/h proporcional) y extras a 13,75.
//
// Fuentes (rutas reales de Anuar):
//   horarios:  OneDrive\TUESDAY AMERICA\CUADERNOS DE GERENTES\CUADERNOS GERENTES\NN MES ... LIBROS DE GERENTES.xlsx
//   biométrico + contador: OneDrive\Anuar\Tuesday\SUELDOS\SUELDOS 2026\<NN MES> SUELDOS 2026\
// Semana sin horario en el cuaderno → se AVISA y se ASUME la semana más cercana (regla de Anuar).

import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx-js-style'
import {
  parseBiometricoWorkbook, personasSinteticas, personaSinteticaId, marcasToAttendance,
} from '../frontend/src/utils/biometrico'
import { parseWorkbookTurnosTuesday } from '../frontend/src/utils/excel-turnos-tuesday'
import { asumirSemanasFaltantes, isoWeekKey } from '../frontend/src/utils/turnos'
import { resumenSueldos } from '../frontend/src/utils/resumen-sueldos'
import { MODELO_MENSUAL_DEFAULT } from '../frontend/src/utils/payroll'
import { calcularMulta } from '../frontend/src/utils/lateness'
import { GROUP_IDS } from '../frontend/src/config/employees'

// ============================== CONFIGURACIÓN ==============================
const CARPETA_CUADERNOS = 'C:/Users/anuar/OneDrive/TUESDAY AMERICA/CUADERNOS DE GERENTES/CUADERNOS GERENTES'
const CARPETA_SUELDOS = 'C:/Users/anuar/OneDrive/Anuar/Tuesday/SUELDOS/SUELDOS 2026'
const GRUPO = GROUP_IDS.TUESDAY

// Nombre del beneficiario en el archivo BANCARIO → id del biométrico.
// (los nombres completos del banco no se parecen a los apodos del aparato)
const ALIAS_CONTADOR = {
  'MARISCAL GARCIA JUAN JOSE': 30,          // juan
  'MASCAYA ARDAYA KEVIN': 59,               // KEVIN
  'MENESES CORZO NICOLE AIDEE': 18,         // nicole
  'FLORES URQUIETA JOSE ROBERTO': 11,       // ROBERTO
  'LUZ ALEJANDRA CORTEZ': 84,               // ALEJANDRA
  'DANZ LOPEZ': 81,                         // DANZ
  'BARRIOS FLORES CARMINIA': 51,            // CARMINIA
  'SEGUNDO CARLA LORENA': 63,               // LORENA (fritura PM) — OJO: no es CARLA (37)
  'CALLAO MORALES JOSSELINE': 50,           // JOSELINE
  'SALINAS ACUÑA GABRIELA': 52,             // GABY
  'RODRIGO MUNGUIA ERAZO': 12,              // Rodrigo
  'CARLA ESPINOZA ARTUNDUAGA': 37,          // CARLA (cubre vacaciones)
  'JUNIOR MELGARES MACIAS': 79,             // JUNIOR
  'NEO MITA HUARAYO': 85,                   // NOE
  'REVOLLO PLAZA ROSARIO MARISELVA': 83,    // NANCY (Nancy Teran Revollo)
  'MARCELO FUENTE OROZCO': 86,              // MARCELO
  'JHAEL VALERIA ALMENDRAS TERRAZAS': 87,   // VALERIA
  'MARISOL TORRICO': 70,                    // MARISOL
}

// Nombres del CUADERNO del gerente que el matcher no resuelve solo contra el biométrico:
//   GABRIELA = GABY (id 52); el resto no tiene marcas en el aparato → se ignoran del
//   cálculo (salen listados en el informe para que Anuar los revise).
const ALIAS_GERENTE_FIJOS = { gabriela: 52 }
const GERENTE_SIN_BIOMETRICO = ['pedro', 'israel', 'fernando ticona', 'fernando', 'daniel', 'katty']

// Checksum del archivo bancario de JULIO (validado a mano): si el parser no
// reproduce esto, algo cambió en el formato → abortar antes de reportar cifras malas.
const CHECKSUM_JULIO = { beneficiarios: 18, totalBs: 32050.18 }
// ===========================================================================

const { sueldoCompleto, horasCompletas, tarifaExtra } = MODELO_MENSUAL_DEFAULT
const TARIFA_HORA = sueldoCompleto / horasCompletas
const r2 = n => Math.round(n * 100) / 100
const norm = s => String(s).replace(/\s+/g, ' ').trim().toUpperCase()
const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']

function buscarArchivo(carpeta, regex) {
  if (!fs.existsSync(carpeta)) return null
  const hit = fs.readdirSync(carpeta).find(f => regex.test(f) && !f.startsWith('~$'))
  return hit ? path.join(carpeta, hit) : null
}

// Planilla bancaria: hoja "Pagos", encabezado "Nro Cuenta..." y filas debajo.
function parseBanco(ruta) {
  const wb = XLSX.readFile(ruta)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Pagos'] || wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
  const iHead = rows.findIndex(r => /nombre beneficiario/i.test(String(r[1])))
  const pagos = []
  for (let i = iHead + 1; i < rows.length; i++) {
    const nombre = String(rows[i][1] ?? '').trim()
    const importe = Number(rows[i][2])
    if (!nombre || isNaN(importe) || importe <= 0) continue
    pagos.push({ nombre, importe: r2(importe) })
  }
  return pagos
}

// Hoja PLANILLA DE DESCUENTOS del cuaderno: FECHA(serial) | NOMBRE | JUSTIFICATIVO | MOTIVO | Bs
function parseDescuentosCuaderno(wb) {
  const ws = wb.Sheets['PLANILLA DE DESCUENTOS']
  if (!ws) return []
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const out = []
  for (const r of rows) {
    const bs = Number(r[4])
    const nombre = String(r[1] ?? '').trim()
    if (!nombre || isNaN(bs) || bs <= 0) continue
    if (/^nombre$/i.test(nombre)) continue
    const serial = Number(r[0])
    const fecha = Number.isFinite(serial) && serial > 40000
      ? new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
      : ''
    out.push({ fecha, nombre, motivo: String(r[3] ?? '').trim() || String(r[2] ?? '').trim(), detalle: String(r[2] ?? '').trim(), bs: r2(bs) })
  }
  return out
}

export async function cuadreTuesday(mesStr, raiz) {
  const [anio, mesNum] = mesStr.split('-').map(Number)
  const ini = new Date(anio, mesNum - 1, 1)
  const fin = new Date(anio, mesNum, 0)
  const mesNombre = `${MESES[mesNum - 1]} ${anio}`
  const nn = String(mesNum).padStart(2, '0')

  console.log(`\n════════ CUADRE TUESDAY AMÉRICA — ${mesNombre} ════════`)

  // ---------- Fuente 1: biométrico físico ----------
  const carpetaMes = buscarArchivo(CARPETA_SUELDOS, new RegExp(`^${nn}\\b.*SUELDOS`, 'i'))
  if (!carpetaMes || !fs.statSync(carpetaMes).isDirectory()) {
    throw new Error(`No encuentro la carpeta del mes en ${CARPETA_SUELDOS} (esperaba "${nn} <MES> SUELDOS ${anio}")`)
  }
  const rutaBio = buscarArchivo(carpetaMes, /biometrico.*\.xlsx?$/i)
  if (!rutaBio) {
    console.log(`  ⚠ No hay export del biométrico en ${carpetaMes}`)
    console.log(`    Exportarlo del aparato (mismo programa que Huper) y guardarlo como "${nn} ${MESES[mesNum - 1]} BIOMETRICO TUESDAY.xls"`)
    throw new Error('Sin biométrico no hay cuadre de asistencia.')
  }
  const bio = parseBiometricoWorkbook(XLSX.readFile(rutaBio), { mesStr })
  if (!bio || bio.mesStr !== mesStr) throw new Error(`El export ${path.basename(rutaBio)} no es del mes ${mesStr} (trae ${bio?.mesStr})`)
  console.log(`  Biométrico: ${path.basename(rutaBio)} · ${bio.personasBio.length} personas con marcas · ${bio.marcas.length} días-persona`)

  const empleados = personasSinteticas(GRUPO, bio.personasBio)
  const idPorBio = Object.fromEntries(bio.personasBio.map(p => [p.idBio, personaSinteticaId(GRUPO, p.idBio)]))
  const nombrePorBio = Object.fromEntries(bio.personasBio.map(p => [p.idBio, p.nombre.toUpperCase()]))
  const attendance = marcasToAttendance(bio.marcas, { groupId: GRUPO, mapa: idPorBio })

  // ---------- Fuente 2: horarios del cuaderno del gerente ----------
  const rutaCuaderno = buscarArchivo(CARPETA_CUADERNOS, new RegExp(`^${nn}\\b.*LIBROS DE GERENTES.*\\.xlsx$`, 'i'))
  if (!rutaCuaderno) throw new Error(`No encuentro el cuaderno "${nn} ... LIBROS DE GERENTES.xlsx" en ${CARPETA_CUADERNOS}`)
  const wbCuaderno = XLSX.readFile(rutaCuaderno)
  const aliasesGerente = {}
  for (const [nom, idBio] of Object.entries(ALIAS_GERENTE_FIJOS)) {
    if (idPorBio[idBio]) aliasesGerente[nom] = idPorBio[idBio]
  }
  for (const nom of GERENTE_SIN_BIOMETRICO) aliasesGerente[nom] = 'IGNORAR'
  const turnosParse = parseWorkbookTurnosTuesday(wbCuaderno, empleados, { aliases: aliasesGerente })
  console.log(`  Cuaderno: ${path.basename(rutaCuaderno)} · semanas ${turnosParse.semanasDetectadas.join(', ')} · ${turnosParse.celdasOk} celdas`)
  if (turnosParse.noEncontrados.length) console.log(`  ⚠ Nombres del cuaderno sin resolver: ${turnosParse.noEncontrados.join(', ')}`)

  // Semanas que el mes necesita; faltantes → asumidas de la más cercana (regla de Anuar)
  const semanasDelMes = []
  for (let d = new Date(ini); d <= fin; d.setDate(d.getDate() + 7)) semanasDelMes.push(isoWeekKey(d))
  if (!semanasDelMes.includes(isoWeekKey(fin))) semanasDelMes.push(isoWeekKey(fin))
  const { relleno: turnos, semanasAsumidas } = asumirSemanasFaltantes(turnosParse.aplicarPorSemana, semanasDelMes)
  if (semanasAsumidas.length) {
    for (const s of semanasAsumidas) console.log(`  ⚠ Semana ${s.semana} SIN horario en el cuaderno → ASUMIDO el de ${s.desde}`)
  }

  // ---------- Motor con las reglas de la casa ----------
  const schedules = empleados.map(p => ({ personId: p.id, expectedHoursPerWeek: 0, isDefault: true }))
  const resumen = resumenSueldos({
    empleados, attendance, schedules,
    condonaciones: {}, extrasAprobadas: {}, turnos, personOverrides: {},
    ini, fin, settings: { multiplicadorExtra: 1.5 }, getTarifa: () => TARIFA_HORA,
    groupId: GRUPO, modeloMensual: MODELO_MENSUAL_DEFAULT,
  })
  const filaPorBio = {}
  for (const f of resumen.filas) {
    const idBio = empleados.find(e => e.id === f.personId)?.idBio
    if (idBio != null) filaPorBio[idBio] = f
  }

  // ---------- Fuente 3: planilla bancaria del contador ----------
  const rutaBanco = buscarArchivo(carpetaMes, /excel-simplificado.*\.xlsx$/i)
  let pagos = []
  if (rutaBanco) {
    pagos = parseBanco(rutaBanco)
    console.log(`  Banco: ${path.basename(rutaBanco)} · ${pagos.length} beneficiarios · Bs ${r2(pagos.reduce((a, p) => a + p.importe, 0))}`)
    if (mesStr === '2026-07') {
      const total = r2(pagos.reduce((a, p) => a + p.importe, 0))
      if (pagos.length !== CHECKSUM_JULIO.beneficiarios || Math.abs(total - CHECKSUM_JULIO.totalBs) > 0.01) {
        throw new Error(`Checksum del banco no cuadra (${pagos.length} beneficiarios, Bs ${total}; esperaba ${CHECKSUM_JULIO.beneficiarios} / ${CHECKSUM_JULIO.totalBs}). Revisar formato.`)
      }
      console.log('  ✓ Checksum del archivo bancario verificado (18 beneficiarios / Bs 32.050,18)')
    }
  } else {
    console.log(`  ⚠ Sin archivo bancario (excel-simplificado*.xlsx) en ${carpetaMes} — informe sin columna contador`)
  }
  const aliasNorm = Object.fromEntries(Object.entries(ALIAS_CONTADOR).map(([k, v]) => [norm(k), v]))
  const bancoPorBio = {}
  const bancoSinMapa = []
  for (const p of pagos) {
    const key = Object.keys(aliasNorm).find(k => norm(p.nombre).startsWith(k) || k.startsWith(norm(p.nombre)))
    if (key != null) bancoPorBio[aliasNorm[key]] = p
    else bancoSinMapa.push(p)
  }
  if (bancoSinMapa.length) console.log(`  ⚠ Beneficiarios del banco sin mapear a biométrico: ${bancoSinMapa.map(p => p.nombre).join(' · ')} (agregar a ALIAS_CONTADOR)`)

  // Descuentos disciplinarios/adelantos del cuaderno (el contador ya los aplica — se listan para el cruce)
  const descuentos = parseDescuentosCuaderno(wbCuaderno)

  // ---------- Cuadre por persona ----------
  const modeloSobre = h => r2(Math.min(h, horasCompletas) * TARIFA_HORA + Math.max(0, h - horasCompletas) * tarifaExtra)
  const idsBioOrden = [...new Set([...Object.keys(bancoPorBio), ...Object.keys(filaPorBio)])].map(Number)
    .sort((a, b) => (nombrePorBio[a] || '').localeCompare(nombrePorBio[b] || ''))
  const cuadre = idsBioOrden.map(idBio => {
    const f = filaPorBio[idBio]
    const banco = bancoPorBio[idBio]
    const hPag = f?.horasPagables ?? 0
    return {
      idBio,
      nombre: nombrePorBio[idBio] || `ID ${idBio}`,
      nombreBanco: banco?.nombre || null,
      hPagables: r2(hPag),
      modeloBs: modeloSobre(hPag),
      appLiquido: f?.totalAPagar ?? 0,
      bancoBs: banco?.importe ?? null,
      multaBs: f?.multaBs ?? 0,
      noRegistro: f?.descuentoNoRegistro ?? 0,
      minExtraPendiente: f?.minExtraPendiente ?? 0,
      diasExtraPendiente: f?.diasExtraPendiente ?? 0,
      diasTemprano: f?.diasTemprano ?? 0,
      minAntesTotal: f?.minAntesTotal ?? 0,
      faltas: f?.faltas ?? [],
      baseTarifa: f?.baseTarifa ?? 0,
      extraTarifa: f?.extraTarifa ?? 0,
      fila: f || null,
    }
  })

  // ---------- Consola: el chequeo en números ----------
  console.log('\n¿Los montos del banco salen del modelo (15,865/h hasta 208 h, extras 13,75) sobre las horas pagables?')
  for (const c of cuadre) {
    const dif = c.bancoBs != null ? r2(c.modeloBs - c.bancoBs) : null
    console.log(`   ${String(c.nombre).padEnd(10)} pagables ${String(c.hPagables).padStart(7)} h · modelo ${String(c.modeloBs).padStart(8)} · banco ${c.bancoBs != null ? String(c.bancoBs).padStart(8) : '   (sin fila)'} ${dif != null ? `· dif ${dif}` : ''} · retrasos −${c.multaBs} · extras por aprobar ${c.minExtraPendiente} min`)
  }

  // ---------- Informe HTML ----------
  const html = generarHTML({ mesNombre, mesStr, cuadre, resumen, semanasAsumidas, descuentos, bancoSinMapa, turnosParse, filaPorBio, nombrePorBio })
  const dirReportes = path.join(raiz, 'reportes')
  fs.mkdirSync(dirReportes, { recursive: true })
  const rutaHtml = path.join(dirReportes, `CUADRE ${mesNombre} - TUESDAY.html`)
  fs.writeFileSync(rutaHtml, html, 'utf8')
  console.log(`\n✓ Informe HTML: ${rutaHtml}`)
  return { rutaHtml, pdf: path.join(dirReportes, `CUADRE ${mesNombre} - TUESDAY.pdf`) }
}

// ============================== INFORME HTML ==============================
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

function generarHTML({ mesNombre, mesStr, cuadre, resumen, semanasAsumidas, descuentos, bancoSinMapa, turnosParse, filaPorBio, nombrePorBio }) {
  const bsF = n => `Bs ${Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtDia = s => `${s.slice(8)}/${s.slice(5, 7)}`
  const hhmmLocal = iso => { const d = new Date(iso); return `${String((d.getUTCHours() + 20) % 24).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` }

  const totalBanco = cuadre.reduce((a, c) => a + (c.bancoBs || 0), 0)
  const totalApp = cuadre.reduce((a, c) => a + c.appLiquido, 0)
  const totalPendiente = cuadre.reduce((a, c) => a + c.minExtraPendiente, 0)

  const filasRetraso = [], filasExtraPend = [], filasTempranas = []
  for (const c of cuadre) {
    const f = c.fila
    if (!f) continue
    for (const cell of f.cells || []) {
      if (cell.mins > 0 && cell.mins <= 180) {
        filasRetraso.push({ nombre: c.nombre, dia: cell.dayStr, prog: cell.programadoStart || '—', real: cell.fichaje?.clockIn ? hhmmLocal(cell.fichaje.clockIn) : '—', mins: cell.mins, multa: cell.multaDia != null ? cell.multaDia : calcularMulta(cell.mins) })
      }
      if (!cell.anomalia && cell.extraAprobable > 0 && !cell.extraAprobada) {
        filasExtraPend.push({ nombre: c.nombre, dia: cell.dayStr, progFin: cell.programadoEnd || '—', realFin: cell.fichaje?.clockOut ? hhmmLocal(cell.fichaje.clockOut) : '—', seQuedo: Math.max(0, cell.minSalidaDiff ?? 0), aprobable: cell.extraAprobable })
      }
      if (!cell.anomalia && cell.revisarTemprano) {
        filasTempranas.push({ nombre: c.nombre, dia: cell.dayStr, prog: cell.programadoStart || '—', real: cell.fichaje?.clockIn ? hhmmLocal(cell.fichaje.clockIn) : '—', minAntes: cell.minAntes })
      }
    }
  }
  const ord = (a, b) => a.nombre.localeCompare(b.nombre) || a.dia.localeCompare(b.dia)
  filasRetraso.sort(ord); filasExtraPend.sort(ord); filasTempranas.sort(ord)

  const descPorNombre = {}
  for (const d of descuentos) {
    const k = d.nombre.toUpperCase().replace(/\s+/g, ' ').trim()
    if (!descPorNombre[k]) descPorNombre[k] = { items: 0, bs: 0, adelantos: 0 }
    descPorNombre[k].items++
    if (/adelanto/i.test(d.motivo) || /adelanto/i.test(d.detalle)) descPorNombre[k].adelantos += d.bs
    else descPorNombre[k].bs += d.bs
  }

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Cuadre ${esc(mesNombre)} — Tuesday América</title>
<style>
  :root { --tinta:#1d1a16; --suave:#6b6257; --linea:#e4ddd2; --fondo:#faf7f2; --acento:#1f5cb4; --ok:#2e7d4f; --mal:#b3261e; --warn:#9a6b00; }
  * { box-sizing: border-box; margin: 0; }
  body { font: 13px/1.55 Georgia, 'Times New Roman', serif; color: var(--tinta); background:#fff; }
  main { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 26px; letter-spacing: -0.02em; }
  h2 { font-size: 17px; margin: 26px 0 8px; padding-bottom: 4px; border-bottom: 2px solid var(--tinta); }
  h2 .num { color: var(--acento); }
  h3 { font-size: 13px; margin-top: 12px; }
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
  @media print { .caja, .kpi { -webkit-print-color-adjust: exact; print-color-adjust: exact; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
</style></head><body><main>

<header>
  <h1>Cuadre de sueldos — Tuesday América · ${esc(mesNombre)}</h1>
  <p class="nota">Tuesday no usa Jibble: asistencia del <b>biométrico físico</b> + horarios del <b>cuaderno del gerente</b>
  (hoja PERSONAL TUESDAY), comparado contra la <b>planilla bancaria</b> del contador. Mismas reglas que Sbarro.
  Generado por <em>scripts/cuadre-tuesday.mjs</em>.</p>
</header>

<div class="kpis">
  <div class="kpi"><span>Banco (líquido real pagado)</span><b>${bsF(totalBanco)}</b></div>
  <div class="kpi"><span>App reglas de la casa (líquido)</span><b>${bsF(totalApp)}</b></div>
  <div class="kpi"><span>Extras por aprobar</span><b>${totalPendiente} min</b></div>
  <div class="kpi"><span>Semanas asumidas</span><b>${semanasAsumidas.length}</b></div>
</div>

${semanasAsumidas.length ? `<div class="caja"><b>⚠ Semanas sin horario en el cuaderno:</b> ${semanasAsumidas.map(s => `${esc(s.semana)} (se asumió el horario de ${esc(s.desde)})`).join(' · ')} — los retrasos de esas semanas son estimados; pedile al gerente completar el cuaderno.</div>` : ''}

<h2><span class="num">1.</span> Modelo vs banco, persona por persona</h2>
<p class="nota">Modelo = horas <b>pagables</b> (recortadas a la ventana del cuaderno) × 15,865 Bs/h, tope Bs 3.300 a las 208 h,
excedente a 13,75. El banco es el líquido FINAL del contador (ya trae sus bonos y descuentos) — la columna diferencia
muestra qué habría que justificar con bonos, faltas mayores, productos o consumos.</p>
<table>
  <tr><th>Empleado (aparato)</th><th>Beneficiario (banco)</th><th class="n">H. pagables</th><th class="n">Modelo</th><th class="n">Líquido app</th><th class="n">Banco</th><th class="n">Banco − modelo</th></tr>
  ${cuadre.map(c => `<tr>
    <td>${esc(c.nombre)}</td>
    <td>${c.nombreBanco ? esc(c.nombreBanco) : '<span class="warn">sin fila en el banco — ¿se paga por otro canal?</span>'}</td>
    <td class="n">${c.hPagables.toFixed(2)}</td>
    <td class="n">${bsF(c.modeloBs)}</td>
    <td class="n">${bsF(c.appLiquido)}</td>
    <td class="n">${c.bancoBs != null ? bsF(c.bancoBs) : '—'}</td>
    <td class="n ${c.bancoBs == null ? '' : Math.abs(c.bancoBs - c.modeloBs) <= 30 ? 'ok' : 'warn'}">${c.bancoBs != null ? (c.bancoBs - c.modeloBs > 0 ? '+' : '') + r2(c.bancoBs - c.modeloBs).toFixed(2) : '—'}</td>
  </tr>`).join('')}
  <tr class="total"><td colspan="4">TOTAL</td><td class="n">${bsF(totalApp)}</td><td class="n">${bsF(totalBanco)}</td><td></td></tr>
</table>
${bancoSinMapa.length ? `<p class="nota mal">Beneficiarios del banco sin mapear al aparato: ${bancoSinMapa.map(p => esc(p.nombre)).join(' · ')} — agregar a ALIAS_CONTADOR en el script.</p>` : ''}
${turnosParse.noEncontrados.length ? `<p class="nota warn">En el cuaderno pero SIN marcas en el aparato este mes: ${turnosParse.noEncontrados.map(esc).join(' · ')} — ¿no marcan, rotaron, o les falta ID?</p>` : ''}

<h2><span class="num">2.</span> Retrasos y sus descuentos, día por día</h2>
<p class="nota">Contra la ENTRADA del cuaderno del gerente. Multa del local: 1–10 min = Bs 10 · 11–20 = Bs 20 · 21+ = Bs 30 (tope) · &gt;3 h no se cobra (horario mal cargado, sale en rojo).</p>
${filasRetraso.length ? `<table>
  <tr><th>Empleado</th><th>Día</th><th class="n">Entrada cuaderno</th><th class="n">Marcó</th><th class="n">Min tarde</th><th class="n">Multa</th></tr>
  ${filasRetraso.map(x => `<tr><td>${esc(x.nombre)}</td><td>${fmtDia(x.dia)}</td><td class="n">${esc(x.prog)}</td><td class="n">${esc(x.real)}</td><td class="n">${x.mins}</td><td class="n mal">−${bsF(x.multa)}</td></tr>`).join('')}
  <tr class="total"><td colspan="5">Total multas por retraso</td><td class="n mal">−${bsF(filasRetraso.reduce((a, x) => a + x.multa, 0))}</td></tr>
</table>` : '<p class="ok">Sin retrasos con multa en el mes.</p>'}

<h2><span class="num">3.</span> Señales de revisión</h2>
${filasExtraPend.length ? `
<h3>Se quedaron después de su salida (${filasExtraPend.length} días · ${filasExtraPend.reduce((a, x) => a + x.aprobable, 0)} min aprobables) — NO se pagan salvo que los apruebes en la web</h3>
<table>
  <tr><th>Empleado</th><th>Día</th><th class="n">Salida cuaderno</th><th class="n">Marcó salida</th><th class="n">Se quedó</th><th class="n">Aprobable (completo)</th><th class="n">Si apruebas</th></tr>
  ${filasExtraPend.map(x => `<tr><td>${esc(x.nombre)}</td><td>${fmtDia(x.dia)}</td><td class="n">${esc(x.progFin)}</td><td class="n">${esc(x.realFin)}</td><td class="n">${x.seQuedo} min</td><td class="n warn"><b>${x.aprobable} min</b></td><td class="n">${bsF(x.aprobable / 60 * 13.75)}</td></tr>`).join('')}
</table>` : '<p class="ok">Sin extras pendientes.</p>'}
${filasTempranas.length ? `
<h3>Llegadas ≥30 min antes del horario (${filasTempranas.length}) — no se pagan, pero revisa qué pasó</h3>
<table>
  <tr><th>Empleado</th><th>Día</th><th class="n">Entrada cuaderno</th><th class="n">Marcó</th><th class="n">Min antes</th></tr>
  ${filasTempranas.map(x => `<tr><td>${esc(x.nombre)}</td><td>${fmtDia(x.dia)}</td><td class="n">${esc(x.prog)}</td><td class="n">${esc(x.real)}</td><td class="n warn">${x.minAntes}</td></tr>`).join('')}
</table>` : ''}

<h2><span class="num">4.</span> Descuentos del cuaderno (los aplica el contador — para el cruce)</h2>
<p class="nota">Hoja PLANILLA DE DESCUENTOS del cuaderno: faltas operativas y adelantos. Son APARTE de las multas por retraso de la sección 2 (que hoy nadie estaba cobrando).</p>
${Object.keys(descPorNombre).length ? `<table>
  <tr><th>Nombre (cuaderno)</th><th class="n">Ítems</th><th class="n">Descuentos operativos</th><th class="n">Adelantos</th></tr>
  ${Object.entries(descPorNombre).sort((a, b) => (b[1].bs + b[1].adelantos) - (a[1].bs + a[1].adelantos)).map(([nom, d]) => `<tr>
    <td>${esc(nom)}</td><td class="n">${d.items}</td><td class="n mal">−${bsF(d.bs)}</td><td class="n">${d.adelantos ? '−' + bsF(d.adelantos) : '—'}</td>
  </tr>`).join('')}
</table>` : '<p class="nota">Sin hoja de descuentos este mes.</p>'}

<h2><span class="num">5.</span> Planilla lista para el contador</h2>
<p class="nota">Básico por el modelo sobre las horas pagables + extras que apruebes a 13,75 − retrasos (sección 2, día por día)
− no-registro (Bs 20 por día con marcado incompleto). <b>Al contador solo le queda añadir: bonos, adelantos, faltas mayores, productos y consumos.</b></p>
<table>
  <tr><th>Empleado</th><th class="n">H. pagables</th><th class="n">Básico</th><th class="n">Extras (&gt;208 h + aprobadas)</th><th class="n">Retrasos</th><th class="n">No-registro</th><th class="n">Líquido app</th><th class="n">Banco (ref.)</th><th class="n">Bonos / faltas may. / consumos</th></tr>
  ${cuadre.map(c => `<tr>
    <td>${esc(c.nombre)}${c.minExtraPendiente > 0 ? ` <span class="warn">(*${c.minExtraPendiente} min por aprobar)</span>` : ''}</td>
    <td class="n">${c.hPagables.toFixed(2)}</td>
    <td class="n">${bsF(c.baseTarifa)}</td>
    <td class="n">${bsF(c.extraTarifa)}</td>
    <td class="n mal">−${bsF(c.multaBs)}</td>
    <td class="n mal">−${bsF(c.noRegistro)}</td>
    <td class="n"><b>${bsF(c.appLiquido)}</b></td>
    <td class="n">${c.bancoBs != null ? bsF(c.bancoBs) : '—'}</td>
    <td class="n">__________</td>
  </tr>`).join('')}
  <tr class="total"><td>TOTAL</td><td></td><td></td><td></td>
    <td class="n mal">−${bsF(cuadre.reduce((a, c) => a + c.multaBs, 0))}</td>
    <td class="n mal">−${bsF(cuadre.reduce((a, c) => a + c.noRegistro, 0))}</td>
    <td class="n">${bsF(totalApp)}</td><td class="n">${bsF(totalBanco)}</td><td></td></tr>
</table>

<p class="firma">Cuadre generado automáticamente · reglas: sueldo ref. Bs 3.300 / 208 h/mes (Bs 15,865/h) · extras aprobadas Bs 13,75/h (al aprobar se pagan TODOS los minutos; se puede aprobar parcial) ·
llegar antes no suma (≥30 min antes = revisar) · multa retraso escalonada · no-registro Bs 40/día · falta Bs 110/día · fuentes: biométrico físico + cuaderno del gerente + planilla bancaria · ${esc(mesStr)}</p>

</main></body></html>`
}
