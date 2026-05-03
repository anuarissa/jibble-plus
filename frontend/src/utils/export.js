// Exportación a CSV y Excel.
// CSV: con BOM UTF-8 + separador ; para que Excel español lo abra bien sin importarlo.
// Excel: usando SheetJS (xlsx).

import * as XLSX from 'xlsx'

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

// columns: [{ label, accessor, width?, numFmt? }]
//   width: ancho explícito en caracteres. Si no se pasa, se autocalcula.
//   numFmt: formato numérico XLSX (ej "0.00", '"Bs" #,##0.00', '0').
//           Solo se aplica a celdas que parsean a número.
export function exportExcel(filename, rows, columns, opts = {}) {
  const sheetName = opts.sheetName || 'Datos'
  const data = [columns.map(c => c.label)]
  for (const r of rows) {
    data.push(columns.map(c => typeof c.accessor === 'function' ? c.accessor(r) : r[c.accessor]))
  }
  const ws = XLSX.utils.aoa_to_sheet(data)

  // Anchos: usa width explícito o autocalcula del label/contenido (cap a 40)
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

  // Aplicar formatos numéricos por columna
  for (let idx = 0; idx < columns.length; idx++) {
    const fmt = columns[idx].numFmt
    if (!fmt) continue
    for (let r = 1; r < data.length; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: idx })
      const cell = ws[addr]
      if (!cell) continue
      // Si el valor es número (o string numérico), normalizamos a number y aplicamos formato.
      const v = cell.v
      if (typeof v === 'number') {
        cell.t = 'n'; cell.z = fmt
      } else if (typeof v === 'string' && v !== '' && !isNaN(Number(v))) {
        cell.v = Number(v); cell.t = 'n'; cell.z = fmt
      }
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
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
