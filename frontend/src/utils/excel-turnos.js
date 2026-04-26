// Template Excel de turnos: descargar/importar.
// Soporta DOS formatos:
//   1) Template simple: una fila por empleado, 7 columnas (Lun..Dom). Celda "08:00-16:00" o "OFF".
//   2) Formato planilla Anuar: 3 filas por empleado (ENTRADA/SALIDA/HORAS), días en cols E-K.
//      Detección automática.

import * as XLSX from 'xlsx'
import { textToTurno, turnoToText, DIAS_LABEL, isoWeekKey } from './turnos'

const HEADERS = ['Empleado', ...DIAS_LABEL]

// Genera y descarga un .xlsx con los empleados del local pre-llenado con turnos actuales.
//   empleados: [{ id, fullName }]
//   turnos:    estado actual de turnos del store
//   weekKey:   "2026-W17"
//   nombreLocal: para el nombre del archivo
export function descargarTemplateTurnos({ empleados, turnos, weekKey, nombreLocal }) {
  const semana = turnos?.[weekKey] || {}
  const data = [HEADERS]
  for (const emp of empleados) {
    const fila = [emp.fullName]
    for (let dow = 1; dow <= 7; dow++) {
      const celda = semana[emp.id]?.[String(dow)]
      fila.push(turnoToText(celda))
    }
    data.push(fila)
  }
  // Fila ejemplo si no hay empleados
  if (empleados.length === 0) {
    data.push(['(Sin empleados activos en este local)', '', '', '', '', '', '', ''])
  }
  // Hint en hoja
  data.push([])
  data.push(['Formato: 08:00-16:00 (entrada-salida) o "OFF" para día libre. Celda vacía = sin turno.'])

  const ws = XLSX.utils.aoa_to_sheet(data)
  // Anchos sugeridos
  ws['!cols'] = [{ wch: 28 }, ...DIAS_LABEL.map(() => ({ wch: 14 }))]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, weekKey)
  const safe = (nombreLocal || 'local').replace(/[^a-z0-9]+/gi, '_')
  XLSX.writeFile(wb, `turnos_${safe}_${weekKey}.xlsx`)
}

// Parser de archivo subido por el usuario.
// Devuelve { aplicar: { [personId]: { dow: valor } }, errores: [string], warnings: [string] }
//   - Match empleado por nombre exacto (case-insensitive, trim).
//   - Errores de formato por celda → warning, no rompen.
//   - Empleados no encontrados → warning con sus nombres.
export async function parseExcelTurnos(file, empleados) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error('El archivo no tiene hojas válidas.')

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (!rows.length) throw new Error('Hoja vacía.')

  // Primera fila: headers. La columna 0 debe ser "Empleado", luego 7 días.
  // Aceptamos variantes de mayúsculas.
  const header = rows[0].map(h => String(h).trim().toLowerCase())
  if (header[0] !== 'empleado' && header[0] !== 'employee' && header[0] !== 'nombre') {
    throw new Error('Primera columna debe ser "Empleado". Descarga el template para ver el formato.')
  }

  const empByNombre = new Map(
    empleados.map(e => [normalizar(e.fullName), e])
  )

  const aplicar = {}
  const warnings = []
  const errores = []
  const noEncontrados = new Set()
  let celdasOk = 0
  let celdasIgnoradas = 0

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || !row[0]) continue
    const nombreRaw = String(row[0]).trim()
    if (!nombreRaw || nombreRaw.startsWith('(')) continue // saltar líneas tipo "(Sin empleados...)"
    if (nombreRaw.toLowerCase().startsWith('formato')) continue // skip hint line

    const emp = empByNombre.get(normalizar(nombreRaw))
    if (!emp) {
      noEncontrados.add(nombreRaw)
      continue
    }

    const personId = emp.id
    aplicar[personId] = aplicar[personId] || {}

    for (let c = 1; c <= 7; c++) {
      const raw = row[c]
      try {
        const valor = textToTurno(raw)
        if (valor === null) {
          // Celda vacía → setear null para limpiar el turno previo
          aplicar[personId][String(c)] = null
        } else {
          aplicar[personId][String(c)] = valor
          celdasOk++
        }
      } catch (e) {
        warnings.push(`${emp.fullName} · ${DIAS_LABEL[c - 1]}: ${e.message}`)
        celdasIgnoradas++
      }
    }
  }

  if (noEncontrados.size > 0) {
    warnings.push(`Empleados no encontrados (no se aplicaron): ${[...noEncontrados].join(', ')}`)
  }

  return { aplicar, warnings, errores, celdasOk, celdasIgnoradas }
}

function normalizar(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ')
}

// =====================================================================
// PARSER FORMATO PLANILLA ANUAR (3 filas por empleado: ENTRADA/SALIDA/HORAS)
// =====================================================================

// Punto de entrada principal: detecta automáticamente qué formato es
// y devuelve siempre el shape unificado:
//   { aplicarPorSemana: { weekKey: { personId: { dow: valor } } },
//     warnings, celdasOk, celdasIgnoradas, formato: 'simple'|'anuar' }
export async function parseExcelTurnosAuto(file, empleados, weekKeyActualSiUnoSolo) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error('El archivo no tiene hojas válidas.')
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (!rows.length) throw new Error('Hoja vacía.')

  // Heurística de detección: ¿hay alguna fila con "ENTRADA" en col D y "SALIDA" en col D justo después?
  const esFormatoAnuar = detectarFormatoAnuar(rows)

  if (esFormatoAnuar) {
    return parseFormatoAnuar(rows, empleados)
  }
  // Formato simple
  const result = await parseExcelTurnos(file, empleados)
  return {
    aplicarPorSemana: { [weekKeyActualSiUnoSolo]: result.aplicar },
    warnings: result.warnings,
    celdasOk: result.celdasOk,
    celdasIgnoradas: result.celdasIgnoradas,
    formato: 'simple',
  }
}

function detectarFormatoAnuar(rows) {
  // Buscar al menos una fila con "ENTRADA" en col 3 (D) y otra con "SALIDA" justo después
  for (let i = 0; i < rows.length - 1; i++) {
    const c1 = String(rows[i]?.[3] || '').trim().toUpperCase()
    const c2 = String(rows[i + 1]?.[3] || '').trim().toUpperCase()
    if (c1 === 'ENTRADA' && c2 === 'SALIDA') return true
  }
  return false
}

function parseFormatoAnuar(rows, empleados) {
  const empByNombre = construirIndiceNombres(empleados)
  const aplicarPorSemana = {} // { weekKey: { personId: { dow: valor } } }
  const warnings = []
  const noEncontrados = new Set()
  let celdasOk = 0
  let celdasIgnoradas = 0
  const semanasDetectadas = new Set()

  // Buscar bloques: cada uno empieza con una fila que tenga "NOMBRE Y APELLIDO" en col A
  for (let i = 0; i < rows.length; i++) {
    const headerRow = rows[i]
    if (!headerRow) continue
    const c0 = String(headerRow[0] || '').trim().toUpperCase()
    if (!c0.startsWith('NOMBRE')) continue

    // Detectar orden de días: buscar 1-3 filas atrás una fila con LUNES/MARTES/etc en cols 4-10
    let dowOrder = null
    for (let back = 1; back <= 4; back++) {
      const r = rows[i - back]
      if (!r) continue
      const dows = r.slice(4, 11).map(parseDow)
      if (dows.filter(d => d != null).length >= 5) {
        dowOrder = dows
        break
      }
    }
    if (!dowOrder) dowOrder = [1, 2, 3, 4, 5, 6, 7] // fallback Lun-Dom

    // weekKey: usar primera fecha en la fila header (cols 4-10)
    const fechas = headerRow.slice(4, 11)
    let weekKey = null
    for (const f of fechas) {
      const d = parseFechaCorta(f)
      if (d) { weekKey = isoWeekKey(d); break }
    }
    if (!weekKey) weekKey = isoWeekKey(new Date())
    semanasDetectadas.add(weekKey)
    if (!aplicarPorSemana[weekKey]) aplicarPorSemana[weekKey] = {}

    // Iterar empleados
    let j = i + 1
    let safety = 0
    while (j < rows.length && safety++ < 200) {
      const r = rows[j]
      if (!r) { j++; continue }
      const colA = String(r[0] || '').trim().toUpperCase()
      const colD = String(r[3] || '').trim().toUpperCase()

      // Romper si entramos a otro bloque
      if (colA.startsWith('NOMBRE') || colA.includes('SBARRO') || colA.includes('TUESDAY') || colA.includes('SOS') || colA.includes('OFICINAS')) break
      const colE = String(r[4] || '').trim().toUpperCase()
      if (colE.includes('SBARRO') || colE.includes('TUESDAY') || colE.includes('SOS')) break

      if (colD === 'ENTRADA') {
        const filaSalida = rows[j + 1]
        if (!filaSalida || String(filaSalida[3] || '').trim().toUpperCase() !== 'SALIDA') {
          j++; continue
        }
        const nombreRaw = String(r[1] || '').trim()
        if (!nombreRaw) { j += 3; continue }

        const emp = matchEmpleado(empByNombre, nombreRaw)
        if (!emp) {
          noEncontrados.add(nombreRaw)
          j += 3
          continue
        }
        if (!aplicarPorSemana[weekKey][emp.id]) aplicarPorSemana[weekKey][emp.id] = {}

        // Parsear los 7 días
        for (let c = 0; c < 7; c++) {
          const dow = dowOrder[c]
          if (dow == null) continue
          const eRaw = r[4 + c]
          const sRaw = filaSalida[4 + c]
          try {
            const valor = parseEntradaSalida(eRaw, sRaw)
            if (valor) {
              aplicarPorSemana[weekKey][emp.id][String(dow)] = valor
              celdasOk++
            }
          } catch (e) {
            warnings.push(`${nombreRaw} · ${DIAS_LABEL[dow - 1]}: ${e.message}`)
            celdasIgnoradas++
          }
        }
        j += 3
      } else {
        j++
      }
    }
    i = Math.max(i, j - 1) // continuar después del bloque
  }

  if (noEncontrados.size > 0) {
    warnings.push(`Empleados no encontrados en la app: ${[...noEncontrados].join(', ')}`)
  }
  if (semanasDetectadas.size > 1) {
    warnings.push(`Detectadas ${semanasDetectadas.size} semanas distintas en el archivo: ${[...semanasDetectadas].join(', ')}`)
  }

  return { aplicarPorSemana, warnings, celdasOk, celdasIgnoradas, formato: 'anuar', semanasDetectadas: [...semanasDetectadas] }
}

// Match flexible: nombre exacto > primer nombre exacto > substring
function matchEmpleado(empByNombre, raw) {
  const norm = normalizar(raw)
  if (empByNombre.has(norm)) return empByNombre.get(norm)
  const firstWord = norm.split(' ')[0]
  // Match exacto por primer nombre
  for (const [k, v] of empByNombre) {
    if (k.split(' ')[0] === firstWord) return v
  }
  // Substring (cuidado: solo si el Excel name es >= 4 chars)
  if (norm.length >= 4) {
    for (const [k, v] of empByNombre) {
      if (k.includes(norm) || norm.includes(k.split(' ')[0])) return v
    }
  }
  return null
}

function construirIndiceNombres(empleados) {
  const m = new Map()
  for (const e of empleados) m.set(normalizar(e.fullName), e)
  return m
}

function parseDow(raw) {
  const s = String(raw).trim().toUpperCase()
  if (!s) return null
  if (s.startsWith('LUN') || s === 'L') return 1
  if (s.startsWith('MAR') || s === 'M') return 2
  if (s.startsWith('MIÉ') || s.startsWith('MIE') || s === 'MI' || s === 'X') return 3
  if (s.startsWith('JUE') || s === 'J') return 4
  if (s.startsWith('VIE') || s === 'V') return 5
  if (s.startsWith('SÁB') || s.startsWith('SAB') || s === 'S') return 6
  if (s.startsWith('DOM') || s === 'D') return 7
  return null
}

const MESES = { ene:0, feb:1, mar:2, abr:3, may:4, jun:5, jul:6, ago:7, sep:8, oct:9, nov:10, dic:11, jan:0, apr:3, aug:7, dec:11 }
function parseFechaCorta(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number') {
    // Excel serial date
    const epoch = new Date(Date.UTC(1899, 11, 30))
    return new Date(epoch.getTime() + raw * 86400000)
  }
  const s = String(raw).trim()
  // Formato "2-Mar", "14-Feb"
  const m = s.match(/^(\d{1,2})[-\/]([A-Za-záéíóúñ]+)/)
  if (!m) return null
  const dia = parseInt(m[1])
  const mesStr = m[2].toLowerCase().slice(0, 3)
  const mes = MESES[mesStr]
  if (mes == null) return null
  return new Date(new Date().getFullYear(), mes, dia)
}

function parseEntradaSalida(entradaRaw, salidaRaw) {
  const e = normalizarHora(entradaRaw)
  const s = normalizarHora(salidaRaw)
  // "LIBRE" en cualquiera → día libre (OFF)
  if (e === 'LIBRE' || s === 'LIBRE') return { tipo: 'OFF' }
  // Ambos vacíos → no setear (usa default)
  if (!e && !s) return null
  // Texto largo no-hora (ej "APOYO HORAS CLAVES Y CAJERO NUEVO") → ignorar
  if (e === 'TEXTO' || s === 'TEXTO') return null
  if (!e || !s) throw new Error(`Falta ${!e ? 'entrada' : 'salida'}`)

  const eH = parseHora(e)
  const sH = parseHora(s)
  if (!eH || !sH) throw new Error(`Hora no reconocida: "${entradaRaw}" / "${salidaRaw}"`)
  const [eh, em] = eH.split(':').map(Number)
  const [sh, sm] = sH.split(':').map(Number)
  if (sh * 60 + sm <= eh * 60 + em) throw new Error(`Salida (${sH}) debe ser después que entrada (${eH})`)
  return { startTime: eH, endTime: sH }
}

// Normaliza un raw value (puede ser número decimal Excel-time, string "9:30", "LIBRE", etc).
// Devuelve: 'LIBRE' | 'TEXTO' (ignorable) | "HH:MM" (ya parseado) | "" (vacío)
function normalizarHora(raw) {
  if (raw == null || raw === '') return ''
  // Número Excel: fracción de día (0.5 = 12:00, 0.375 = 9:00)
  if (typeof raw === 'number') {
    return excelTimeToHHMM(raw) || ''
  }
  const s = String(raw).trim().toUpperCase()
  if (!s) return ''
  if (s === 'LIBRE' || s === 'OFF') return 'LIBRE'
  // Si tiene ":" intentar como HH:MM
  if (s.includes(':')) return s
  // Decimal en string ("0.375")
  const num = parseFloat(s.replace(',', '.'))
  if (!isNaN(num) && num >= 0 && num < 1) {
    return excelTimeToHHMM(num) || ''
  }
  // Texto largo no parseable
  if (s.length > 6 && !/\d/.test(s)) return 'TEXTO'
  return s // último intento, parseHora lo evaluará
}

function excelTimeToHHMM(n) {
  if (n < 0 || n >= 1) return null
  const totalMin = Math.round(n * 24 * 60)
  const h = Math.floor(totalMin / 60)
  const min = totalMin % 60
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function parseHora(s) {
  if (!s) return null
  const str = String(s).trim()
  // Formato HH:MM
  const m = str.match(/^(\d{1,2}):(\d{2})$/)
  if (m) {
    const h = parseInt(m[1])
    const min = parseInt(m[2])
    if (h > 23 || min > 59) return null
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }
  return null
}
