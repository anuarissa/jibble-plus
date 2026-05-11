// Exportación a CSV y Excel con estilos profesionales.
// CSV: con BOM UTF-8 + separador ; para que Excel español lo abra bien sin importarlo.
// Excel: usa xlsx-js-style (drop-in de xlsx + soporte de estilos: fills, fonts, borders, autoFilter).

import * as XLSX from 'xlsx-js-style'

export function exportCSV(filename, rows, columns) {
  const sep = ';'
  const header = columns.map(c => escape(c.label)).join(sep)
  const body = rows.map(r =>
    columns.map(c => escape(typeof c.accessor === 'function' ? c.accessor(r) : r[c.accessor])).join(sep)
  ).join('\n')
  const csv = '﻿' + header + '\n' + body  // BOM
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, filename.endsWith('.csv') ? filename : filename + '.csv')
}

// === Paleta de estilos (alineada con la UI de la app) ===
const COLOR = {
  accent: 'F97316',       // naranja principal (igual al accent de Tailwind)
  accentDark: 'C2410C',   // borde del header
  white: 'FFFFFF',
  text: '1F2937',         // gris oscuro para body
  textMuted: '6B7280',
  borderLight: 'E5E7EB',  // gris muy claro para bordes de body
  zebraBg: 'F9FAFB',      // gris casi blanco para filas alternadas
  sectionBg: 'F3F4F6',    // fondo para filas de subtítulo en RESUMEN
}

const HEADER_STYLE = {
  fill: { patternType: 'solid', fgColor: { rgb: COLOR.accent } },
  font: { bold: true, color: { rgb: COLOR.white }, sz: 11, name: 'Calibri' },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: {
    top:    { style: 'thin',   color: { rgb: COLOR.accentDark } },
    bottom: { style: 'medium', color: { rgb: COLOR.accentDark } },
    left:   { style: 'thin',   color: { rgb: COLOR.accentDark } },
    right:  { style: 'thin',   color: { rgb: COLOR.accentDark } },
  },
}

const BODY_BORDER = {
  top:    { style: 'thin', color: { rgb: COLOR.borderLight } },
  bottom: { style: 'thin', color: { rgb: COLOR.borderLight } },
  left:   { style: 'thin', color: { rgb: COLOR.borderLight } },
  right:  { style: 'thin', color: { rgb: COLOR.borderLight } },
}

const SECTION_STYLE = {
  fill: { patternType: 'solid', fgColor: { rgb: COLOR.sectionBg } },
  font: { bold: true, color: { rgb: COLOR.text }, sz: 11 },
  alignment: { vertical: 'center' },
}

// Estilo para filas con falta / no fichó — fondo rojo claro + texto rojo bold.
// Llama la atención al instante en el Excel.
const MISSED_STYLE = {
  fill: { patternType: 'solid', fgColor: { rgb: 'FEE2E2' } },     // rojo-100
  font: { bold: true, color: { rgb: 'B91C1C' }, sz: 11, name: 'Calibri' }, // rojo-700
  alignment: { vertical: 'center' },
  border: {
    top:    { style: 'thin', color: { rgb: 'FCA5A5' } },
    bottom: { style: 'thin', color: { rgb: 'FCA5A5' } },
    left:   { style: 'thin', color: { rgb: 'FCA5A5' } },
    right:  { style: 'thin', color: { rgb: 'FCA5A5' } },
  },
}

// columns: [{ label, accessor, width?, numFmt?, bold? }]
//   width: ancho explícito en caracteres. Si no se pasa, se autocalcula.
//   numFmt: formato numérico XLSX (ej "0.00", '"Bs" #,##0.00', '0').
//   bold: si true, todas las celdas body de esa columna van bold (para columna "Tipo" en HORARIO vs REAL).
// opts: { autoFilter, zebra, sectionMarkerCol, sectionMarkerPrefix, rowHighlight }
//   autoFilter: true por default. AutoFilter sobre el header.
//   zebra: true por default. Filas alternadas con fondo gris claro.
//   sectionMarkerCol: nombre de columna donde buscar marcadores de sección (ej "Campo").
//   sectionMarkerPrefix: si una celda en esa columna empieza con este string (ej "—"),
//     toda la fila se estiliza como SECTION_STYLE (negrita + fondo gris).
//   rowHighlight: (row, rowIndex) => boolean. Si retorna true, todas las celdas de
//     esa fila reciben MISSED_STYLE (rojo) — útil para marcar faltas/no fichó.
function buildSheet(columns, rows, opts = {}) {
  const { autoFilter = true, zebra = true, sectionMarkerCol = null, sectionMarkerPrefix = null, rowHighlight = null } = opts

  const data = [columns.map(c => c.label)]
  for (const r of rows) {
    data.push(columns.map(c => typeof c.accessor === 'function' ? c.accessor(r) : r[c.accessor]))
  }
  const ws = XLSX.utils.aoa_to_sheet(data)

  // Anchos: usa width explícito o autocalcula
  ws['!cols'] = columns.map((c, idx) => {
    if (typeof c.width === 'number') return { wch: c.width }
    let max = String(c.label || '').length
    for (let r = 1; r < data.length; r++) {
      const v = data[r][idx]
      if (v == null) continue
      const len = String(v).length
      if (len > max) max = len
    }
    return { wch: Math.min(max + 2, 40) }
  })

  // Altura del header
  ws['!rows'] = [{ hpt: 24 }]

  // Detectar columna de "marcador de sección" si se pidió
  const sectionColIdx = sectionMarkerCol
    ? columns.findIndex(c => c.accessor === sectionMarkerCol || c.label === sectionMarkerCol)
    : -1

  // === HEADER STYLE ===
  for (let c = 0; c < columns.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[addr]) ws[addr] = { t: 's', v: columns[c].label }
    ws[addr].s = HEADER_STYLE
  }

  // === BODY STYLES + NUMERIC FORMAT ===
  for (let r = 1; r < data.length; r++) {
    // ¿Esta fila es una "sección" (subtítulo)?
    let isSection = false
    if (sectionColIdx >= 0 && sectionMarkerPrefix) {
      const v = data[r][sectionColIdx]
      isSection = typeof v === 'string' && v.trim().startsWith(sectionMarkerPrefix)
    }

    // ¿Esta fila debe destacarse como falta/no fichó?
    const isMissed = !isSection && rowHighlight && !!rowHighlight(rows[r - 1], r - 1)

    for (let c = 0; c < columns.length; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      let cell = ws[addr]
      // Si la celda no existe (por valor vacío), creala para poder estilizar
      if (!cell) {
        cell = { t: 's', v: '' }
        ws[addr] = cell
      }

      // Formato numérico
      const fmt = columns[c].numFmt
      const isNumeric = !!fmt
      if (isNumeric) {
        const v = cell.v
        if (typeof v === 'number') {
          cell.t = 'n'; cell.z = fmt
        } else if (typeof v === 'string' && v !== '' && !isNaN(Number(v))) {
          cell.v = Number(v); cell.t = 'n'; cell.z = fmt
        }
      }

      // Construir style — MISSED tiene prioridad sobre section/zebra
      let style
      if (isMissed) {
        style = {
          ...MISSED_STYLE,
          alignment: { ...MISSED_STYLE.alignment, horizontal: isNumeric ? 'right' : 'left' },
        }
      } else if (isSection) {
        style = { ...SECTION_STYLE, border: BODY_BORDER }
      } else {
        style = {
          font: { color: { rgb: COLOR.text }, sz: 11, name: 'Calibri', bold: !!columns[c].bold },
          alignment: {
            vertical: 'center',
            horizontal: isNumeric ? 'right' : 'left',
            wrapText: false,
          },
          border: BODY_BORDER,
        }
        // Zebra: filas pares (índice par sin contar header, r=2,4,6...)
        if (zebra && r % 2 === 0) {
          style.fill = { patternType: 'solid', fgColor: { rgb: COLOR.zebraBg } }
        }
      }
      cell.s = style
    }
  }

  // === AUTOFILTER ===
  if (autoFilter && data.length > 1 && columns.length > 0) {
    const lastCol = XLSX.utils.encode_col(columns.length - 1)
    ws['!autofilter'] = { ref: `A1:${lastCol}${data.length}` }
  }

  // === FREEZE PANE (header sticky) ===
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  ws['!views'] = [{ state: 'frozen', ySplit: 1 }]

  return ws
}

function safeSheetName(name) {
  // Excel: max 31 chars, no permite: / \ ? * [ ]
  return String(name).replace(/[/\\?*[\]]/g, '').slice(0, 31) || 'Hoja'
}

export function exportExcel(filename, rows, columns, opts = {}) {
  const ws = buildSheet(columns, rows, opts)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName(opts.sheetName || 'Datos'))
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : filename + '.xlsx')
}

// sheets: [{ name, columns, rows, autoFilter?, zebra?, sectionMarkerCol?, sectionMarkerPrefix? }]
export function exportExcelMultiSheet(filename, sheets) {
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const { name, columns, rows, ...opts } = sheet
    const ws = buildSheet(columns, rows, opts)
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(name))
  }
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : filename + '.xlsx')
}

function escape(value) {
  if (value == null) return ''
  const s = String(value)
  if (/[;"\n,]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
