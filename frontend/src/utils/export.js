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

export function exportExcel(filename, rows, columns) {
  const data = [columns.map(c => c.label)]
  for (const r of rows) {
    data.push(columns.map(c => typeof c.accessor === 'function' ? c.accessor(r) : r[c.accessor]))
  }
  const ws = XLSX.utils.aoa_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Datos')
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
