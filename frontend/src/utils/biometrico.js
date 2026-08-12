// Parser GENERALIZADO de exports del biométrico físico (mismo software en todos
// los locales: hojas "Reporte de Turnos/Estadístico/de Asistencia/de Excepciones").
// Lo usan la web (fuente "Biométrico" en Sueldos) y los CLI (bundle esbuild).
//
// Variantes reales cubiertas (verificadas contra exports de Huper y Tuesday):
//   - la columna del VALOR del ID no es fija (col 2 en Huper-2026, col 4 en Tuesday-2026)
//   - el nombre del empleado viene a la derecha de la celda "Nombre:" (posición variable)
//   - hoja llamada "Reporte de Asistencia" o (exports viejos) "Hoja1" con el título en A1
//   - marcas concatenadas sin separador en una celda ("15:0222:34"), columna = día del mes
//   - marcas de madrugada (<06:00) = SALIDA del turno PM del día anterior (regla medianoche)

import * as XLSX from 'xlsx-js-style'
import { normalizarNombre, matchEmpleado, construirIndiceNombres } from './excel-turnos'

const aMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m }

// "gaby" / "JUAN " → "Gaby" / "Juan" (los exports traen mayúsculas/minúsculas mezcladas)
function titulo(nombre) {
  return String(nombre).trim().toLowerCase().replace(/\p{L}+/gu, w => w[0].toUpperCase() + w.slice(1))
}

function hojaAsistencia(wb) {
  // 1) por nombre de hoja
  const name = wb.SheetNames.find(n => /asistencia/i.test(n))
  if (name) return { name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }) }
  // 2) por título en las primeras celdas (exports viejos: hoja "Hoja1")
  for (const n of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' })
    const cab = rows.slice(0, 3).flat().map(x => String(x)).join(' ')
    if (/asistencia/i.test(cab)) return { name: n, rows }
    // 3) por estructura: alguna fila con 'ID:' en col 0 en las primeras 40 filas
    if (rows.slice(0, 40).some(r => String(r?.[0]).trim() === 'ID:')) return { name: n, rows }
  }
  return null
}

// Parsea un workbook de export biométrico. Devuelve null si no parece serlo.
// opts: { mesStr?: 'yyyy-MM' (fallback si el archivo no trae fila "Periodo:"),
//         horaCorteMadrugada?: minutos (default 360 = 06:00),
//         maxHorasSesion?: horas (default 20, solo informativo para warnings) }
// → { mesStr, periodo: {from,to}|null, marcas: [Marca], personasBio: [{idBio,nombre}],
//     warnings: [], bloquesVacios, permisos }
// Marca = { idBio, nombre, date:'yyyy-MM-dd', entrada:'HH:MM'|null, salida:'HH:MM'|null,
//           cruzaMedianoche, nMarcas }
export function parseBiometricoWorkbook(wb, opts = {}) {
  const hoja = hojaAsistencia(wb)
  if (!hoja) return null
  const { rows } = hoja
  const warnings = []
  const corte = opts.horaCorteMadrugada ?? 6 * 60

  // --- Periodo: fila cuyo col 0 empieza con "Periodo" → "yyyy-mm-dd ~ yyyy-mm-dd" ---
  let periodo = null
  for (const r of rows.slice(0, 10)) {
    if (!/^Periodo/i.test(String(r?.[0] ?? '').trim())) continue
    for (let c = 1; c <= 6; c++) {
      const m = String(r[c] ?? '').match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/)
      if (m) { periodo = { from: m[1], to: m[2] }; break }
    }
    if (periodo) break
  }
  const mesStr = periodo ? periodo.from.slice(0, 7) : (opts.mesStr || null)
  if (!mesStr) return null // sin periodo ni fallback no se pueden fechar las marcas
  if (opts.mesStr && periodo && opts.mesStr !== mesStr) {
    warnings.push(`El archivo es del periodo ${mesStr}, no de ${opts.mesStr}`)
  }

  // --- Mapa columna → día: fila con enteros consecutivos arrancando en 1 ---
  let colToDia = null
  for (const r of rows.slice(0, 8)) {
    const pares = []
    r?.forEach((cell, col) => { if (typeof cell === 'number' && Number.isInteger(cell) && cell >= 1 && cell <= 31) pares.push([col, cell]) })
    if (pares.length >= 20 && pares[0][1] === 1 && pares.every(([, v], i) => v === i + 1)) {
      colToDia = new Map(pares)
      break
    }
  }
  const diaDeCol = col => colToDia ? (colToDia.get(col) ?? null) : (col + 1 >= 1 && col + 1 <= 31 ? col + 1 : null)

  // --- Bloques "ID:" → marcas crudas por día ---
  const rawPorId = new Map()   // idBio → { nombre, dias: { dia: [HH:MM...] } }
  let bloquesVacios = 0, permisos = 0
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i]?.[0]).trim() !== 'ID:') continue
    const fila = rows[i]
    // id: primera celda numérica en cols 1..8 (la posición varía entre exports)
    let idBio = null
    for (let c = 1; c <= 8; c++) {
      const v = fila[c]
      if (v !== '' && v != null && !isNaN(Number(v))) { idBio = Number(v); break }
    }
    if (idBio == null) { warnings.push(`Bloque ID: sin número (fila ${i + 1})`); continue }
    // nombre: celda no vacía a la derecha de la celda "Nombre:"
    let nombre = null
    const colNombre = fila.findIndex(x => /^Nombre/i.test(String(x).trim()))
    if (colNombre >= 0) {
      for (let c = colNombre + 1; c < fila.length; c++) {
        const v = String(fila[c] ?? '').trim()
        if (v && !/^Departamento/i.test(v)) { nombre = v; break }
      }
    }
    if (!nombre) nombre = `ID ${idBio}`

    const entry = rawPorId.get(idBio) || { nombre, dias: {} }
    if (!rawPorId.has(idBio)) rawPorId.set(idBio, entry)

    for (let j = i + 1; j <= i + 2 && j < rows.length; j++) {
      if (String(rows[j]?.[0]).trim() === 'ID:') break
      rows[j]?.forEach((cell, col) => {
        const s = String(cell)
        if (/^\s*PERMISO\s*$/i.test(s)) { permisos++; return }
        const horas = s.match(/\d{2}:\d{2}/g)
        if (!horas) return
        const dia = diaDeCol(col)
        if (dia == null) return
        entry.dias[dia] = [...new Set([...(entry.dias[dia] || []), ...horas])].sort()
      })
    }
  }
  if (rawPorId.size === 0) return null

  // --- Regla medianoche + entrada/salida por día ---
  const marcas = []
  const personasBio = []
  const [anio, mesNum] = mesStr.split('-').map(Number)
  const diasEnMes = new Date(anio, mesNum, 0).getDate()
  for (const [idBio, { nombre, dias }] of rawPorId) {
    const porDia = {}
    for (let d = 1; d <= diasEnMes; d++) porDia[d] = (dias[d] || []).slice()
    let algunaMarca = false
    for (let d = 2; d <= diasEnMes; d++) {
      const tempranas = porDia[d].filter(t => aMin(t) < corte)
      if (tempranas.length) {
        porDia[d] = porDia[d].filter(t => aMin(t) >= corte)
        porDia[d - 1] = [...porDia[d - 1], tempranas[tempranas.length - 1] + '+1']
      }
    }
    for (let d = 1; d <= diasEnMes; d++) {
      const todas = porDia[d]
      if (!todas.length) continue
      algunaMarca = true
      const normales = todas.filter(t => !t.endsWith('+1')).sort()
      const cierresMad = todas.filter(t => t.endsWith('+1'))
      const entrada = normales[0] || null
      let salida = null, cruzaMedianoche = false
      if (cierresMad.length) { salida = cierresMad[0].replace('+1', ''); cruzaMedianoche = true }
      else if (normales.length > 1) salida = normales[normales.length - 1]
      marcas.push({
        idBio, nombre,
        date: `${mesStr}-${String(d).padStart(2, '0')}`,
        entrada, salida, cruzaMedianoche,
        nMarcas: todas.length,
      })
    }
    if (algunaMarca) personasBio.push({ idBio, nombre })
    else bloquesVacios++
  }

  return { mesStr, periodo, marcas, personasBio, warnings, bloquesVacios, permisos }
}

// Id ESTABLE de una persona sintética (no existe en Jibble): sobrevive re-imports
// para que tarifas/turnos/overrides guardados por personId no se pierdan.
export const personaSinteticaId = (groupId, idBio) => `bio:${groupId}:${idBio}`

// Personas sintéticas con el shape que espera la app (useJibble / Empleados / Sueldos).
export function personasSinteticas(groupId, personasBio) {
  return (personasBio || []).map(p => ({
    id: personaSinteticaId(groupId, p.idBio),
    fullName: titulo(p.nombre),
    firstName: titulo(p.nombre).split(' ')[0],
    lastName: '',
    position: '',
    groupId,
    email: null,
    avatarUrl: null,
    synthetic: true,
    idBio: p.idBio,
  }))
}

// Resuelve idBio → personId:
//   - sin empleados Jibble (Tuesday): todos sintéticos, nada queda sin resolver.
//   - con empleados Jibble (Sbarro): alias guardado > matcher de nombres (mismo de
//     los Excel de turnos). Sin match → null + nombre en noEncontrados (panel UI).
// aliases: { [nombreNormalizado]: personId | 'IGNORAR' } (jibble_alias_nombres_v1 del local)
export function resolverPersonasBio({ groupId, personasBio, empleadosJibble = [], aliases = {} }) {
  const mapa = {}
  const noEncontrados = []
  if (!empleadosJibble.length) {
    for (const p of (personasBio || [])) mapa[p.idBio] = personaSinteticaId(groupId, p.idBio)
    return { mapa, noEncontrados }
  }
  const indice = construirIndiceNombres(empleadosJibble)
  for (const p of (personasBio || [])) {
    const norm = normalizarNombre(p.nombre)
    const alias = aliases[norm]
    if (alias) { mapa[p.idBio] = alias; continue }   // personId o 'IGNORAR'
    const emp = matchEmpleado(indice, p.nombre)
    if (emp) mapa[p.idBio] = emp.id
    else { mapa[p.idBio] = null; noEncontrados.push(p.nombre) }
  }
  return { mapa, noEncontrados }
}

// "HH:MM" hora Bolivia (UTC-4 fija, espejo de lateness.js) → ISO UTC.
function toIsoUtc(dateStr, hhmm, diasExtra = 0) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [H, M] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(y, m - 1, d + diasExtra, H + 4, M)).toISOString()
}

// Marcas del parser → attendance con el MISMO shape que el backend de Jibble.
// Ids DETERMINISTAS (bio-<personId>-<date>): las condonaciones y extras aprobadas
// se indexan por attendance.id y deben sobrevivir re-imports.
// mapa[idBio] === null | 'IGNORAR' → la persona se excluye.
export function marcasToAttendance(marcas, { groupId, mapa }) {
  const out = []
  for (const m of (marcas || [])) {
    const personId = mapa?.[m.idBio]
    if (!personId || personId === 'IGNORAR') continue
    if (!m.entrada && !m.salida) continue
    // Día solo con cierre de madrugada (sin entrada): sesión incompleta con solo
    // salida — el motor la trata como registro incompleto (igual que en Jibble).
    const clockIn = m.entrada ? toIsoUtc(m.date, m.entrada) : toIsoUtc(m.date, m.salida, m.cruzaMedianoche ? 1 : 0)
    const clockOut = (m.entrada && m.salida) ? toIsoUtc(m.date, m.salida, m.cruzaMedianoche ? 1 : 0) : null
    out.push({
      id: `bio-${personId}-${m.date}`,
      personId,
      groupId,
      date: m.date,               // día Bolivia (el motor filtra por string exacto)
      clockIn,
      clockOut,
      durationMinutes: clockOut ? Math.round((new Date(clockOut) - new Date(clockIn)) / 60000) : null,
      location: null,
      __source: 'biometrico',
    })
  }
  return out
}
