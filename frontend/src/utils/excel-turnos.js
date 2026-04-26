// Template Excel de turnos: descargar/importar.
// Formato fila:  Empleado | Lun | Mar | Mié | Jue | Vie | Sáb | Dom
// Cada celda:    "08:00-16:00" | "OFF" | "" (vacío)

import * as XLSX from 'xlsx'
import { textToTurno, turnoToText, DIAS_LABEL } from './turnos'

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
