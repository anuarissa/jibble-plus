// Parser de la planilla de horarios de TUESDAY (cuaderno del gerente:
// "NN MES del 2026 LIBROS DE GERENTES.xlsx", hoja "PERSONAL TUESDAY").
//
// Formato REAL (verificado contra julio 2026):
//   - Bloques de semana apilados; la etiqueta "SEMANA n" NO sirve (todas dicen
//     "SEMANA 1") — la verdad son los SERIALES de fecha de la fila "NOMBRE Y APELLIDO".
//   - Por persona: bloque AM y/o PM, cada uno con filas ENTRADA / SALIDA / HORAS.
//     Col A = categoría (SUPERVISORES/CAJEROS/..., celda merged), col B = nombre
//     (merged, con espacios extra: "ALEJA NDRA"), col C = AM|PM, col D = etiqueta.
//   - Horas como FRACCIÓN de día (0.3333 = 08:00, 0.6667 = 16:00, 1 = 24:00),
//     "LIBRE" = día libre de ese tramo.
//   - AM y PM el mismo día = turno partido; si empalman (AM sale 16:00 y PM entra
//     16:00) queda un turno corrido.
//
// Devuelve el MISMO shape que parseWorkbookTurnos (excel-turnos.js) para que los
// dos call-sites (leerCarpeta y turnosDeCarpeta del CLI) puedan elegir parser.

import * as XLSX from 'xlsx-js-style'
import { normalizarNombre, matchEmpleado, construirIndiceNombres } from './excel-turnos'
import { isoWeekKey, dayOfWeek } from './turnos'

const HOJA_RE = /personal\s*tuesday/i

export function esWorkbookTuesday(wb) {
  return (wb?.SheetNames || []).some(n => HOJA_RE.test(n))
}

// Fracción de día → "HH:MM" redondeando a 5 min. 1.0 (24:00) → "23:59"
// (parseHora del resto del sistema rechaza 24:00 y una salida "00:00" dispararía
// el bug conocido de salidas post-medianoche en minutosDiff).
function fracToHHMM(n) {
  if (typeof n !== 'number' || isNaN(n) || n < 0 || n > 1) return null
  let min = Math.round((n * 1440) / 5) * 5
  if (min >= 1440) return '23:59'
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

// Celda del cuaderno → 'LIBRE' | 'HH:MM' | null (vacío/no interpretable)
function valorHora(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number') return fracToHHMM(raw)
  const s = String(raw).trim().toUpperCase()
  if (s === 'LIBRE' || s === 'OFF') return 'LIBRE'
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (m) return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`
  const num = parseFloat(s.replace(',', '.'))
  if (!isNaN(num) && num >= 0 && num <= 1) return fracToHHMM(num)
  return null
}

// Serial Excel → Date en hora LOCAL (medianoche UTC en Bolivia cae al día anterior
// y corre la semana ISO — mismo cuidado que parseFechaCorta del parser Sbarro).
function serialToFechaLocal(serial) {
  const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

const aMinutos = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

// opts: { aliases: { [nombreNormalizado]: personId|'IGNORAR' }, desdeSemana: 'yyyy-Wnn' }
// → { aplicarPorSemana, warnings, noEncontrados, celdasOk, celdasIgnoradas, semanasDetectadas, formato:'tuesday' }
export function parseWorkbookTurnosTuesday(wb, empleados, opts = {}) {
  const hojaName = wb.SheetNames.find(n => HOJA_RE.test(n))
  const out = { aplicarPorSemana: {}, warnings: [], noEncontrados: [], celdasOk: 0, celdasIgnoradas: 0, semanasDetectadas: [], formato: 'tuesday' }
  if (!hojaName) { out.warnings.push('No se encontró la hoja PERSONAL TUESDAY'); return out }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[hojaName], { header: 1, defval: '' })

  const aliases = opts.aliases || {}
  const desdeSemana = opts.desdeSemana || ''
  const indice = construirIndiceNombres(empleados || [])
  const cachePersona = new Map() // nombreNormalizado → personId | 'IGNORAR' | null
  const noEncontradosSet = new Set()

  const resolverPersona = (nombreRaw, weekKeys) => {
    const limpio = String(nombreRaw).replace(/\s+/g, ' ').trim() // "ALEJA NDRA " → "ALEJA NDRA"
    const normEspacios = normalizarNombre(limpio.replace(/ /g, ''))  // colapso total para typos "ALEJA NDRA"
    const norm = normalizarNombre(limpio)
    if (cachePersona.has(norm)) return cachePersona.get(norm)
    let personId = aliases[norm] || aliases[normEspacios] || null
    if (!personId) {
      const emp = matchEmpleado(indice, limpio) || matchEmpleado(indice, limpio.replace(/ /g, ''))
      personId = emp ? emp.id : null
    }
    if (!personId) {
      // solo hacer ruido para semanas recientes (mismo criterio que el parser Sbarro)
      const esReciente = !desdeSemana || weekKeys.some(wk => wk >= desdeSemana)
      if (esReciente) noEncontradosSet.add(limpio)
    }
    cachePersona.set(norm, personId)
    return personId
  }

  // tramosPorClave: `${personId}|${dateStr}` → [{startTime,endTime}] ; libres: Set de claves con LIBRE explícito
  const tramosPorClave = new Map()
  const libresExplicitos = new Set()
  const fechaDeClave = {}

  let colFechas = null   // Map col → Date (bloque de semana actual)
  let nombreActual = null

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || []

    // ¿Fila de fechas (encabezado de bloque)? — ≥5 seriales Excel plausibles
    const seriales = []
    r.forEach((cell, col) => {
      if (typeof cell === 'number' && Number.isInteger(cell) && cell > 40000 && cell < 60000) seriales.push([col, cell])
    })
    if (seriales.length >= 5) {
      colFechas = new Map(seriales.map(([col, s]) => [col, serialToFechaLocal(s)]))
      nombreActual = null
      continue
    }
    if (!colFechas) continue

    // ¿Fila ENTRADA de un tramo? (col D = 'ENTRADA'; la SALIDA está en la fila siguiente)
    if (String(r[3]).trim().toUpperCase() !== 'ENTRADA') continue
    const nombreCelda = String(r[1] ?? '').trim()
    if (nombreCelda) nombreActual = nombreCelda
    if (!nombreActual) continue
    const filaSalida = rows[i + 1] || []
    if (String(filaSalida[3]).trim().toUpperCase() !== 'SALIDA') {
      out.warnings.push(`Fila ${i + 1} (${nombreActual}): ENTRADA sin fila SALIDA — tramo ignorado`)
      continue
    }

    const weekKeys = [...colFechas.values()].map(f => isoWeekKey(f))
    const personId = resolverPersona(nombreActual, weekKeys)
    if (!personId || personId === 'IGNORAR') { continue }

    for (const [col, fecha] of colFechas) {
      const e = valorHora(r[col])
      const s = valorHora(filaSalida[col])
      const dateStr = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
      const clave = `${personId}|${dateStr}`
      fechaDeClave[clave] = fecha
      if (e === 'LIBRE' || s === 'LIBRE' || (e == null && s == null)) {
        // tramo libre/vacío: solo cuenta como LIBRE explícito si lo dice
        if (e === 'LIBRE' || s === 'LIBRE') libresExplicitos.add(clave)
        continue
      }
      // Warnings solo de semanas recientes (mismo criterio que noEncontrados: los
      // cuadernos viejos traen celdas a medio llenar que ya no le importan a nadie).
      const esReciente = !desdeSemana || isoWeekKey(fecha) >= desdeSemana
      if (e == null || s == null) {
        if (esReciente) out.warnings.push(`${nombreActual} ${dateStr}: tramo con ${e == null ? 'entrada' : 'salida'} ilegible — ignorado`)
        out.celdasIgnoradas++
        continue
      }
      if (aMinutos(s) <= aMinutos(e)) {
        if (esReciente) out.warnings.push(`${nombreActual} ${dateStr}: salida (${s}) no es posterior a la entrada (${e}) — ignorado`)
        out.celdasIgnoradas++
        continue
      }
      if (!tramosPorClave.has(clave)) tramosPorClave.set(clave, [])
      tramosPorClave.get(clave).push({ startTime: e, endTime: s })
    }
  }

  // Tramos por persona/día → celdas por semana
  const todasClaves = new Set([...tramosPorClave.keys(), ...libresExplicitos])
  for (const clave of todasClaves) {
    const [personId] = clave.split('|')
    const fecha = fechaDeClave[clave]
    const wk = isoWeekKey(fecha)
    const dow = String(dayOfWeek(fecha))
    const tramos = (tramosPorClave.get(clave) || []).sort((a, b) => aMinutos(a.startTime) - aMinutos(b.startTime))

    let celda
    if (!tramos.length) {
      celda = { tipo: 'OFF' }   // solo LIBRE explícito llega acá
    } else {
      // fusionar tramos que empalman o se solapan (AM 08-16 + PM 16-24 = corrido 08-23:59)
      const fusion = [tramos[0]]
      for (let k = 1; k < tramos.length; k++) {
        const prev = fusion[fusion.length - 1]
        if (aMinutos(tramos[k].startTime) <= aMinutos(prev.endTime)) {
          if (aMinutos(tramos[k].endTime) > aMinutos(prev.endTime)) prev.endTime = tramos[k].endTime
        } else fusion.push(tramos[k])
      }
      celda = fusion.length === 1
        ? { startTime: fusion[0].startTime, endTime: fusion[0].endTime }
        : { startTime: fusion[0].startTime, endTime: fusion[fusion.length - 1].endTime, segments: fusion }
    }

    if (!out.aplicarPorSemana[wk]) out.aplicarPorSemana[wk] = {}
    if (!out.aplicarPorSemana[wk][personId]) out.aplicarPorSemana[wk][personId] = {}
    const existente = out.aplicarPorSemana[wk][personId][dow]
    if (existente) {
      // nombre repetido en dos categorías (ej. NICOL en HOUSTER y MESEROS):
      // el horario real (no-OFF) gana; dos horarios distintos → warning y queda el primero
      if (existente.tipo === 'OFF' && celda.tipo !== 'OFF') out.aplicarPorSemana[wk][personId][dow] = celda
      else if (existente.tipo !== 'OFF' && celda.tipo !== 'OFF' && JSON.stringify(existente) !== JSON.stringify(celda)) {
        out.warnings.push(`${personId} ${wk} día ${dow}: dos horarios distintos para la misma persona (nombre repetido en el cuaderno) — se usa el primero`)
      }
    } else {
      out.aplicarPorSemana[wk][personId][dow] = celda
    }
    out.celdasOk++
  }

  out.noEncontrados = [...noEncontradosSet]
  out.semanasDetectadas = Object.keys(out.aplicarPorSemana).sort()
  return out
}
