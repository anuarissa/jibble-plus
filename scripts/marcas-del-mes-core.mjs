// Núcleo de "marcas del mes": TODO lo registrado (entradas y salidas) por local,
// SIN comparar contra horarios. No ejecutar directo: usar
// `node scripts/marcas-del-mes.mjs 2026-10` (el lanzador lo bundlea con esbuild).
//
// Fuentes, por local:
//   - Jibble (kiosco o celular): las marcas CRUDAS de TimeEntries, emparejadas
//     acá mismo (entrada → salida) para mostrar cada día.
//   - Aparato de huellas: el export del mes en <LOCAL>\ASISTENCIA\2 BIOMETRICO
//     (si existe; mismo lector que la app).
// Salida: <LOCAL>\ASISTENCIA\3 REPORTES MENSUALES\MARCAS <MES> <AÑO> - <LOCAL>.xlsx
// (+ copia en reportes\). Hojas RESUMEN, DIA A DIA y MARCAS.

import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import * as XLSX from 'xlsx-js-style'
import { CARPETAS } from './carpetas.mjs'
import { bioDeCarpeta } from './reporte-mensual-core.mjs'
import {
  GROUP_IDS, EMPLOYEE_OVERRIDES, resolveGroupId, esPersonaDummy, nombreDeAparato, fueraDeRango,
} from '../frontend/src/config/employees'

const LOCALES = [
  { nombre: 'SBARRO HUPER', groupId: GROUP_IDS.SBARRO_HUPER, ws: 'B', ...CARPETAS.SBARRO_HUPER },
  { nombre: 'SOS POLLO', groupId: GROUP_IDS.SOS_POLLO, ws: 'A', ...CARPETAS.SOS_POLLO },
]

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const TZ_OFFSET_MIN = -4 * 60 // Bolivia, sin horario de verano

// ------------------------------ Jibble crudo ------------------------------
function leerCredenciales(raiz) {
  dotenv.config({ path: path.join(raiz, 'backend', '.env') })
  const c = {}
  if (process.env.JIBBLE_API_KEY_ID) c.A = { id: process.env.JIBBLE_API_KEY_ID.trim(), secret: process.env.JIBBLE_API_KEY_SECRET.trim() }
  for (const n of [2, 3, 4]) {
    const id = process.env[`JIBBLE_API_KEY_ID_${n}`]?.trim(), secret = process.env[`JIBBLE_API_KEY_SECRET_${n}`]?.trim()
    if (id && secret) c[String.fromCharCode(64 + n)] = { id, secret }
  }
  return c
}

async function clienteJibble({ id, secret }) {
  const r = await fetch('https://identity.prod.jibble.io/connect/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
  })
  if (!r.ok) throw new Error(`token Jibble ${r.status}`)
  const token = (await r.json()).access_token
  return async function todo(url) {
    const out = []
    for (let next = url; next;) {
      const res = await fetch(next, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
      if (!res.ok) throw new Error(`${res.status} ${next}`)
      const d = await res.json()
      out.push(...(d.value || []))
      next = d['@odata.nextLink'] || null
    }
    return out
  }
}

// ISO UTC → { fecha 'yyyy-MM-dd', hora 'HH:MM' } en hora de Bolivia
function horaBolivia(isoUtc) {
  const d = new Date(new Date(isoUtc).getTime() + TZ_OFFSET_MIN * 60000)
  const iso = d.toISOString()
  return { fecha: iso.slice(0, 10), hora: iso.slice(11, 16) }
}

function fuenteDe(e) {
  if (e.kioskId) return 'Kiosco'
  if (/geofence/i.test(e.platform || e.clientType || '')) return 'Geocerca (automática)'
  if (/android|ios/i.test(e.clientType || '')) return 'Celular'
  return e.clientType || 'Jibble'
}

// Marcas In/Out de una persona (orden por hora) → sesiones { entrada, salida }
function emparejar(marcas) {
  const ses = []
  let abierta = null
  for (const m of marcas) {
    if (m.type === 'In') {
      if (abierta) ses.push({ entrada: abierta, salida: null })
      abierta = m
    } else if (m.type === 'Out') {
      if (abierta) { ses.push({ entrada: abierta, salida: m }); abierta = null }
      else ses.push({ entrada: null, salida: m })
    }
  }
  if (abierta) ses.push({ entrada: abierta, salida: null })
  return ses
}

// ------------------------------ Excel ------------------------------
const AZUL = '1F3A5F'
const estiloCab = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: AZUL } }, alignment: { vertical: 'center', wrapText: true } }
const estiloTitulo = { font: { bold: true, sz: 14, color: { rgb: AZUL } } }
const estiloAviso = { font: { bold: true, color: { rgb: '9C2A00' } }, alignment: { wrapText: true, vertical: 'top' } }

function hoja(filas, { cabecera, anchos, desdeFila = 0 }) {
  const ws = XLSX.utils.aoa_to_sheet(filas)
  ws['!cols'] = anchos.map(wch => ({ wch }))
  const r = desdeFila
  cabecera.forEach((_, c) => {
    const ref = XLSX.utils.encode_cell({ r, c })
    if (ws[ref]) ws[ref].s = estiloCab
  })
  ws['!freeze'] = { xSplit: 0, ySplit: r + 1 }
  ws['!views'] = [{ state: 'frozen', ySplit: r + 1 }]
  return ws
}

const h2 = n => Math.round(n * 100) / 100

// ------------------------------ Por local ------------------------------
async function marcasDeLocal(local, mesStr, cred) {
  const [anio, mes] = mesStr.split('-').map(Number)
  const ultimo = new Date(anio, mes, 0).getDate()
  const from = `${mesStr}-01`, to = `${mesStr}-${String(ultimo).padStart(2, '0')}`

  // Personal del local en Jibble
  const todo = await clienteJibble(cred)
  const people = await todo('https://workspace.prod.jibble.io/v1/People?$top=500')
  const delLocal = people.filter(p =>
    !esPersonaDummy(p.fullName) && !EMPLOYEE_OVERRIDES[p.id]?.skip &&
    resolveGroupId(p.id, p.groupId, {}, local.ws, p.fullName) === local.groupId)
  const nombre = new Map(delLocal.map(p => [p.id, EMPLOYEE_OVERRIDES[p.id]?.nombre || p.fullName.trim()]))

  // Un día de margen a cada lado: la salida de un turno que cierra pasada la
  // medianoche del último día Jibble la anota en el día siguiente (sin esto el
  // 31 salía "Sin salida"). Después se queda solo lo que EMPIEZA dentro del mes.
  const corrido = (iso, dias) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10) }
  const filtro = encodeURIComponent(`status eq 'Active' and belongsToDate ge ${corrido(from, -1)} and belongsToDate le ${corrido(to, 1)}`)
  const crudas = (await todo(`https://time-tracking.prod.jibble.io/v1/TimeEntries?$top=1000&$orderby=time asc&$filter=${filtro}`))
    .filter(e => nombre.has(e.personId) && (e.type === 'In' || e.type === 'Out'))
  const sesionesDe = new Map() // personId → sesiones que empiezan en el mes
  for (const pid of new Set(crudas.map(e => e.personId))) {
    const ses = emparejar(crudas.filter(e => e.personId === pid))
      .filter(s => { const d = (s.entrada || s.salida).belongsToDate; return d >= from && d <= to })
    if (ses.length) sesionesDe.set(pid, ses)
  }
  const entries = [...sesionesDe.values()].flat().flatMap(s => [s.entrada, s.salida].filter(Boolean))

  const marcasFilas = [] // hoja MARCAS
  const dias = []        // hoja DIA A DIA: { fecha, persona, fuente, tramos:[{ent,sal,horas,obs}] }
  const porPersona = new Map()
  for (const e of entries) {
    if (!porPersona.has(e.personId)) porPersona.set(e.personId, [])
    porPersona.get(e.personId).push(e)
  }

  for (const [pid, lista] of porPersona) {
    const persona = nombre.get(pid)
    for (const e of lista) {
      const l = horaBolivia(e.time)
      const auto = e.isAutomatic ? 'Automática' : e.isManual ? 'Agregada a mano' : ''
      marcasFilas.push([l.fecha, l.hora, persona, e.type === 'In' ? 'Entrada' : 'Salida', fuenteDe(e), auto, e.note || '', e.belongsToDate])
    }
    // Sesiones agrupadas por el día al que Jibble las asigna (belongsToDate de la entrada)
    const porDia = new Map()
    for (const s of sesionesDe.get(pid)) {
      const base = s.entrada || s.salida
      const dia = base.belongsToDate
      const ent = s.entrada ? horaBolivia(s.entrada.time) : null
      const sal = s.salida ? horaBolivia(s.salida.time) : null
      const obs = []
      let salTxt = sal ? sal.hora : ''
      if (sal && ent && sal.fecha !== ent.fecha) salTxt += ' (+1 día)'
      if (!s.salida) obs.push('Sin salida')
      if (!s.entrada) obs.push('Salida sin entrada')
      if (s.salida?.isAutomatic) obs.push('Salida automática de Jibble')
      if (s.entrada?.isManual || s.salida?.isManual) obs.push('Marca agregada a mano')
      const horas = s.entrada && s.salida ? (new Date(s.salida.time) - new Date(s.entrada.time)) / 3600000 : null
      if (!porDia.has(dia)) porDia.set(dia, { fecha: dia, persona, fuente: new Set(), tramos: [] })
      const d = porDia.get(dia)
      d.fuente.add(fuenteDe(base))
      d.tramos.push({ ent: ent ? ent.hora : '', sal: salTxt, horas, obs })
    }
    dias.push(...porDia.values())
  }

  // Aparato de huellas (si hay export del mes)
  const bio = bioDeCarpeta(local.bio, mesStr)
  if (bio) {
    const nombreBio = new Map((bio.personas || []).map(p => [p.idBio, nombreDeAparato(local.groupId, p.idBio, p.nombre)]))
    for (const m of bio.marcas) {
      const persona = nombreBio.get(m.idBio) || m.nombre
      const salTxt = m.salida ? m.salida + (m.cruzaMedianoche ? ' (+1 día)' : '') : ''
      let horas = null
      if (m.entrada && m.salida) {
        const [eh, em] = m.entrada.split(':').map(Number), [sh, sm] = m.salida.split(':').map(Number)
        horas = ((sh * 60 + sm) - (eh * 60 + em) + (m.cruzaMedianoche ? 1440 : 0)) / 60
      }
      const obs = []
      if (!m.salida) obs.push('Sin salida')
      if (!m.entrada) obs.push('Salida sin entrada')
      if (m.nMarcas > 2) obs.push(`${m.nMarcas} marcas en el día (se toma la primera y la última)`)
      dias.push({ fecha: m.date, persona, fuente: new Set(['Aparato de huellas']), tramos: [{ ent: m.entrada || '', sal: salTxt, horas, obs }] })
      if (m.entrada) marcasFilas.push([m.date, m.entrada, persona, 'Entrada', 'Aparato de huellas', '', '', m.date])
      if (m.salida) marcasFilas.push([m.date, m.salida, persona, 'Salida', 'Aparato de huellas', '', m.cruzaMedianoche ? 'Salida pasada la medianoche' : '', m.date])
    }
  }

  dias.sort((a, b) => a.persona.localeCompare(b.persona) || a.fecha.localeCompare(b.fecha))
  marcasFilas.sort((a, b) => a[2].localeCompare(b[2]) || (a[0] + a[1]).localeCompare(b[0] + b[1]))

  // Personal sin marcas: solo quien trabajaba en el mes (fuera bajas anteriores
  // y altas posteriores). Quien marcó aparece siempre.
  const personal = delLocal.filter(p => !fueraDeRango(p.id, from, to)).map(p => nombre.get(p.id)).sort()
  return { from, to, dias, marcasFilas, entries, bio, personal }
}

function armarExcel(local, mesStr, r) {
  const [anio, mes] = mesStr.split('-').map(Number)
  const mesNombre = `${MESES[mes - 1]} ${anio}`

  // --- Resumen por persona ---
  const res = new Map()
  for (const p of r.personal) res.set(p, { dias: new Set(), horas: 0, sinSalida: 0, fuentes: new Set() })
  for (const d of r.dias) {
    if (!res.has(d.persona)) res.set(d.persona, { dias: new Set(), horas: 0, sinSalida: 0, fuentes: new Set() })
    const x = res.get(d.persona)
    x.dias.add(d.fecha)
    for (const f of d.fuente) x.fuentes.add(f)
    for (const t of d.tramos) { if (t.horas != null) x.horas += t.horas; if (t.obs.includes('Sin salida')) x.sinSalida++ }
  }

  const fechas = r.dias.map(d => d.fecha).sort()
  const cobertura = []
  if (!r.dias.length) {
    cobertura.push(`No hay NINGUNA marca registrada de ${local.nombre} en ${mesNombre.toLowerCase()}.`)
  } else {
    cobertura.push(`Hay marcas del ${fechas[0].slice(8)} al ${fechas.at(-1).slice(8)} de ${MESES[mes - 1].toLowerCase()}.`)
    if (fechas[0] > r.from) cobertura.push(`Del 01 al ${String(Number(fechas[0].slice(8)) - 1).padStart(2, '0')} no hay ningún registro.`)
  }
  if (!r.bio) cobertura.push(`Falta el export del aparato de huellas de ${mesNombre.toLowerCase()} (carpeta ${local.nombre} > ASISTENCIA > 2 BIOMETRICO). Cuando se baje, se vuelve a generar este Excel y se suma solo.`)
  if (!r.entries.length) cobertura.push('Jibble no tiene marcas de este local en el mes.')
  if (local.groupId === GROUP_IDS.SOS_POLLO) cobertura.push('El kiosco de Jibble de S.O.S empezó el 22-oct-2026; antes se marcaba solo en el aparato de huellas.')
  if (local.groupId === GROUP_IDS.SBARRO_HUPER) cobertura.push('El kiosco de Jibble del Huper empezó el 5-nov-2026; antes se marcaba en el aparato de huellas.')

  const resFilas = [
    [`MARCAS ${mesNombre} — ${local.nombre}`],
    ['Todo lo registrado: hora de entrada y de salida de cada persona. SIN comparar contra horarios (eso va aparte).'],
    [],
    ['QUÉ CUBRE ESTE ARCHIVO'],
    ...cobertura.map(t => [t]),
    [],
  ]
  const filaCab = resFilas.length
  resFilas.push(['Persona', 'Días con marcas', 'Primer día', 'Último día', 'Horas marcadas', 'Días sin salida', 'Fuente'])
  for (const [p, x] of [...res].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ds = [...x.dias].sort()
    resFilas.push([p, ds.length, ds[0] || '', ds.at(-1) || '', h2(x.horas), x.sinSalida, [...x.fuentes].join(', ') || 'Sin marcas'])
  }
  resFilas.push([], ['Horas marcadas = salida − entrada de cada tramo con las dos marcas. Los días sin salida no suman horas.'],
    [`Generado el ${new Date().toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}`])

  const wsRes = hoja(resFilas, { cabecera: Array(7).fill(0), anchos: [26, 15, 12, 12, 15, 15, 26], desdeFila: filaCab })
  wsRes.A1.s = estiloTitulo
  for (let i = 0; i < cobertura.length; i++) {
    const ref = XLSX.utils.encode_cell({ r: 4 + i, c: 0 })
    wsRes[ref].s = estiloAviso
  }
  wsRes['!merges'] = [0, 1, ...cobertura.map((_, i) => 4 + i)].map(r0 => ({ s: { r: r0, c: 0 }, e: { r: r0, c: 6 } }))
  wsRes.A4.s = { font: { bold: true } }
  delete wsRes['!freeze']; wsRes['!views'] = []

  // --- Día a día ---
  const maxTramos = Math.max(2, ...r.dias.map(d => d.tramos.length))
  const cabDia = ['Fecha', 'Día', 'Persona', 'Fuente']
  for (let i = 1; i <= maxTramos; i++) cabDia.push(`Entrada ${i}`, `Salida ${i}`)
  cabDia.push('Horas', 'Observación')
  const filasDia = [cabDia]
  for (const d of r.dias) {
    const [y, m, dd] = d.fecha.split('-').map(Number)
    const fila = [d.fecha, DIAS[new Date(y, m - 1, dd).getDay()], d.persona, [...d.fuente].join(', ')]
    for (let i = 0; i < maxTramos; i++) fila.push(d.tramos[i]?.ent || '', d.tramos[i]?.sal || '')
    const conHoras = d.tramos.filter(t => t.horas != null)
    fila.push(conHoras.length ? h2(conHoras.reduce((s, t) => s + t.horas, 0)) : '', [...new Set(d.tramos.flatMap(t => t.obs))].join(' · '))
    filasDia.push(fila)
  }
  if (!r.dias.length) filasDia.push(['—', '', 'Sin marcas en el mes'])
  const wsDia = hoja(filasDia, { cabecera: cabDia, anchos: [11, 10, 24, 18, ...Array(maxTramos * 2).fill(13), 8, 40] })

  // --- Marcas crudas ---
  const cabM = ['Fecha', 'Hora', 'Persona', 'Tipo', 'Fuente', 'Manual / automática', 'Nota', 'Día asignado']
  const filasM = [cabM, ...r.marcasFilas]
  if (!r.marcasFilas.length) filasM.push(['—', '', 'Sin marcas en el mes'])
  const wsM = hoja(filasM, { cabecera: cabM, anchos: [11, 7, 24, 9, 22, 18, 30, 12] })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, wsRes, 'RESUMEN')
  XLSX.utils.book_append_sheet(wb, wsDia, 'DIA A DIA')
  XLSX.utils.book_append_sheet(wb, wsM, 'MARCAS')
  return { wb, archivo: `MARCAS ${mesNombre} - ${local.nombre}.xlsx` }
}

export async function generarMarcas(mesStr, raiz) {
  const cred = leerCredenciales(raiz)
  const resultados = []
  for (const local of LOCALES) {
    console.log(`\n=== ${local.nombre} · ${mesStr}`)
    if (!cred[local.ws]) { console.log(`  ✗ sin credenciales de la cuenta ${local.ws}`); continue }
    const r = await marcasDeLocal(local, mesStr, cred[local.ws])
    const { wb, archivo } = armarExcel(local, mesStr, r)
    fs.mkdirSync(local.reportes, { recursive: true })
    const destino = path.join(local.reportes, archivo)
    XLSX.writeFile(wb, destino)
    fs.mkdirSync(path.join(raiz, 'reportes'), { recursive: true })
    fs.copyFileSync(destino, path.join(raiz, 'reportes', archivo))
    const porPersona = {}
    for (const f of r.marcasFilas) porPersona[f[2]] = (porPersona[f[2]] || 0) + 1
    console.log(`  Jibble: ${r.entries.length} marcas · aparato: ${r.bio ? r.bio.archivo : 'sin export del mes'}`)
    console.log(`  Días-persona: ${r.dias.length} · marcas por persona:`, porPersona)
    console.log(`  ✓ ${destino}`)
    resultados.push({ local: local.nombre, destino, ...r })
  }
  return resultados
}
