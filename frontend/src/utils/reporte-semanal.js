// Reporte ejecutivo todo-en-uno de la semana visible: 1 Excel con 4 hojas
//   - RESUMEN: KPIs de la semana (puntualidad, horas, planilla)
//   - ASISTENCIA: detalle día-empleado
//   - TARDANZAS: cada tardanza con multa y condonación
//   - PLANILLA: cálculo bruto/descuentos/total con "Min tarde" y "Tarifa multa"
//
// Pensado para administración de oficina — un archivo y se ve cómo le fue al local.

import { format, addDays } from 'date-fns'
import { tablaSemanal, tardanzasConCondonacion, attendanceEnRango, groupByPerson,
         celdaToRow, EXPORT_COLUMNS_ASISTENCIA, extrasYRetrasoDeCells } from './stats'
import { planillaLocal } from './payroll'
import { formatHora } from './format'
import { exportExcelMultiSheet } from './export'

export function descargarReporteSemanal({
  empleados, attendance, schedules, condonaciones, turnos, personOverrides,
  ini, fin, cfg, group,
}) {
  const nombreLocal = cfg?.config?.locales?.[group?.id]?.name || group?.name || 'local'
  const rangoLabel = `${format(ini, 'dd MMM yyyy')} – ${format(fin, 'dd MMM yyyy')}`
  const weekKey = format(ini, "RRRR-'W'II")

  // === DATOS BRUTOS DE LA SEMANA ===
  const semana = tablaSemanal({ empleados, attendance, schedules, ini, condonaciones, turnos, personOverrides })
  const tardanzas = tardanzasConCondonacion(attendance, schedules, condonaciones, ini, fin, turnos, personOverrides)
    .filter(t => t.groupId === group.id)
  const fichajesSemana = attendanceEnRango(attendance, ini, fin).filter(a => a.groupId === group.id)
  const fichajesPorPersona = groupByPerson(fichajesSemana)
  const tardanzasPorPersona = groupByPerson(tardanzas)
  const empleadosConTarifa = empleados.map(emp => {
    const sched = schedules.find(s => s.personId === emp.id)
    return {
      ...emp,
      tarifa: cfg.getTarifaResolved(emp.id),
      expectedHoursPerWeek: sched?.expectedHoursPerWeek ?? 0,
    }
  })
  // Horas extra POR DÍA (solo lo que pasa de 30 min tras la salida programada)
  const horasExtraPorPersona = {}
  for (const fila of semana.filas) {
    horasExtraPorPersona[fila.empleado.id] = extrasYRetrasoDeCells(fila.cells).horasExtra
  }
  const planilla = planillaLocal(empleadosConTarifa, fichajesPorPersona, tardanzasPorPersona, {
    multiplicadorExtra: cfg.config.settings.multiplicadorExtra,
    horasExtraPorPersona,
  })

  // === MÉTRICAS PARA RESUMEN ===
  let totalFichados = 0, totalFaltas = 0, totalATiempo = 0, totalDiasLibres = 0
  let totalHoras = 0
  for (const fila of semana.filas) {
    for (const c of fila.cells) {
      if (c.falto) totalFaltas++
      else if (c.fichaje) {
        totalFichados++
        totalHoras += c.horas || 0
        if (c.motivoColor === 'aTiempo') totalATiempo++
      } else if (c.state === 'idle') totalDiasLibres++
    }
  }
  const tardanzasActivas = tardanzas.filter(t => !t.condonada)
  const totalMinTarde = tardanzasActivas.reduce((s, t) => s + (t.minutosTarde || 0), 0)
  const pctPuntualidad = totalFichados > 0 ? (totalATiempo / totalFichados) * 100 : 0

  // Top 3 empleados con más tardanzas activas
  const tardanzasPorEmpleado = {}
  for (const t of tardanzasActivas) {
    tardanzasPorEmpleado[t.personId] = (tardanzasPorEmpleado[t.personId] || 0) + 1
  }
  const empById = Object.fromEntries(empleados.map(e => [e.id, e]))
  const topTardanzas = Object.entries(tardanzasPorEmpleado)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([pid, n]) => ({ nombre: empById[pid]?.fullName || pid, cantidad: n }))

  // === HOJA 1: RESUMEN ===
  const resumenRows = [
    { Campo: 'Local', Valor: nombreLocal },
    { Campo: 'Semana', Valor: `${weekKey} · ${rangoLabel}` },
    { Campo: 'Empleados activos', Valor: empleados.length },
    { Campo: '', Valor: '' },
    { Campo: '— ASISTENCIA —', Valor: '' },
    { Campo: 'Días fichados (total)', Valor: totalFichados },
    { Campo: 'Faltas (no fichó)', Valor: totalFaltas },
    { Campo: 'Días libres', Valor: totalDiasLibres },
    { Campo: '', Valor: '' },
    { Campo: '— PUNTUALIDAD —', Valor: '' },
    { Campo: '% A tiempo', Valor: `${pctPuntualidad.toFixed(1)}%` },
    { Campo: 'Tardanzas activas', Valor: tardanzasActivas.length },
    { Campo: 'Tardanzas condonadas', Valor: tardanzas.length - tardanzasActivas.length },
    { Campo: 'Minutos tarde (total)', Valor: totalMinTarde },
    { Campo: '', Valor: '' },
    { Campo: '— HORAS —', Valor: '' },
    { Campo: 'Horas trabajadas (total)', Valor: totalHoras.toFixed(2) },
    { Campo: 'Horas normales (planilla)', Valor: planilla.totales.horasNormales },
    { Campo: 'Horas extra (planilla)', Valor: planilla.totales.horasExtra },
    { Campo: '', Valor: '' },
    { Campo: '— PLANILLA (Bs) —', Valor: '' },
    { Campo: 'Bruto total', Valor: planilla.totales.bruto },
    { Campo: 'Descuento por tardanzas', Valor: planilla.totales.descuentoTardanza },
    { Campo: 'TOTAL A PAGAR', Valor: planilla.totales.totalAPagar },
    { Campo: '', Valor: '' },
    { Campo: '— TOP TARDANZAS —', Valor: '' },
  ]
  if (topTardanzas.length === 0) {
    resumenRows.push({ Campo: '(sin tardanzas esta semana)', Valor: '' })
  } else {
    topTardanzas.forEach((t, i) => {
      resumenRows.push({ Campo: `${i + 1}. ${t.nombre}`, Valor: `${t.cantidad} ${t.cantidad === 1 ? 'tardanza' : 'tardanzas'}` })
    })
  }

  // === HOJA 2: ASISTENCIA ===
  const asistenciaRows = []
  for (const fila of semana.filas) {
    for (const c of fila.cells) {
      asistenciaRows.push(celdaToRow(fila.empleado, c, nombreLocal))
    }
  }

  // === HOJA 3: TARDANZAS ===
  const tardanzasRows = tardanzas.length === 0
    ? [{ Fecha: '—', Empleado: 'Sin tardanzas esta semana', Cargo: '', Programado: '', 'Hora real': '',
        'Minutos tarde': '', 'Multa (Bs)': '', Estado: '', 'Motivo condonación': '' }]
    : tardanzas.map(t => {
        const emp = empById[t.personId]
        return {
          Fecha: t.date,
          Empleado: emp?.fullName || '',
          Cargo: emp?.position || '',
          Programado: t.scheduledStart || '',
          'Hora real': t.clockIn ? formatHora(t.clockIn) : '',
          'Minutos tarde': t.minutosTarde,
          'Multa (Bs)': t.multa,
          Estado: t.condonada ? 'CONDONADA' : 'Activa',
          'Motivo condonación': t.motivoCondonacion || '',
        }
      })

  // === HOJA 4: PLANILLA ===
  const TARIFA_MULTA_LABEL = '10 Bs hasta 10 min · +20 Bs cada 10 min adicional'
  const planillaRows = planilla.filas.map(f => ({
    Empleado: f.fullName,
    Cargo: f.position || '',
    'Tarifa/h (Bs)': f.tarifa,
    'Horas totales': f.horasTotales,
    'Horas normales': f.horasNormales,
    'Horas extra': f.horasExtra,
    'Bruto (Bs)': f.bruto,
    'Min tarde': f.minutosTardeTotales || 0,
    'Tarifa multa': TARIFA_MULTA_LABEL,
    'Descuento tardanza (Bs)': f.descuentoTardanza,
    'Total a pagar (Bs)': f.totalAPagar,
  }))
  // Fila TOTAL al final
  planillaRows.push({
    Empleado: 'TOTAL LOCAL',
    Cargo: '',
    'Tarifa/h (Bs)': '',
    'Horas totales': planilla.totales.horasNormales + planilla.totales.horasExtra,
    'Horas normales': planilla.totales.horasNormales,
    'Horas extra': planilla.totales.horasExtra,
    'Bruto (Bs)': planilla.totales.bruto,
    'Min tarde': totalMinTarde,
    'Tarifa multa': '',
    'Descuento tardanza (Bs)': planilla.totales.descuentoTardanza,
    'Total a pagar (Bs)': planilla.totales.totalAPagar,
  })

  // === HOJA 5: HORARIO vs REAL (comparativa visual planificado vs ejecutado) ===
  // Formato: 3 filas por empleado (Programado / Real / Estado) + 1 fila vacía como separador.
  // Hace fácil ver de un vistazo si la persona llegó al horario que estaba planificado.
  const dayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  const dayKeys = []
  for (let i = 0; i < 7; i++) {
    dayKeys.push(`${dayLabels[i]} ${format(addDays(ini, i), 'dd/MM')}`)
  }
  const planVsRealRows = []
  for (const fila of semana.filas) {
    const filaProg = { Empleado: fila.empleado.fullName, Tipo: 'Programado' }
    const filaReal = { Empleado: '', Tipo: 'Real' }
    const filaEst = { Empleado: '', Tipo: 'Estado' }
    for (let i = 0; i < 7; i++) {
      const c = fila.cells[i]
      const k = dayKeys[i]
      // Programado
      filaProg[k] = c.programadoStart && c.programadoEnd
        ? `${c.programadoStart}-${c.programadoEnd}`
        : 'Libre'
      // Real
      if (c.fichaje?.clockIn) {
        const ent = formatHora(c.fichaje.clockIn)
        const sal = c.fichaje.clockOut ? formatHora(c.fichaje.clockOut) : 'activo'
        filaReal[k] = `${ent}-${sal}`
      } else if (c.falto) {
        filaReal[k] = 'NO FICHÓ'
      } else {
        filaReal[k] = '—'
      }
      // Estado
      filaEst[k] = c.falto ? '✗ Faltó'
        : c.state === 'idle' ? '—'
        : c.motivoColor === 'aTiempo' ? '✓ A tiempo'
        : c.motivoColor === 'tardeEntrada' ? `Tarde +${c.mins} min`
        : c.motivoColor === 'salidaTemprana' ? `Salió ${Math.abs(c.minSalidaDiff || 0)} min antes`
        : c.motivoColor === 'extras' ? `+${c.minSalidaDiff} min extras`
        : c.motivoColor === 'sinSalida' ? 'Sin salida (activo)'
        : c.motivoColor === 'diaLibreTrabajado' ? 'Vino en día libre'
        : '—'
    }
    planVsRealRows.push(filaProg, filaReal, filaEst, {}) // {} = fila vacía separadora
  }
  const planVsRealColumns = [
    { label: 'Empleado', accessor: 'Empleado', width: 24 },
    { label: ' ', accessor: 'Tipo', width: 12 },
    ...dayKeys.map(k => ({ label: k, accessor: k, width: 16 })),
  ]

  // === DEFINICIÓN DE COLUMNAS POR HOJA ===
  // Cada hoja puede declarar opts (autoFilter, zebra, sectionMarkerCol, sectionMarkerPrefix)
  // que se pasan a buildSheet en export.js.
  const sheets = [
    {
      name: 'RESUMEN',
      columns: [
        { label: 'Métrica', accessor: 'Campo', width: 32 },
        { label: 'Valor', accessor: 'Valor', width: 30 },
      ],
      rows: resumenRows,
      autoFilter: false,
      zebra: false,
      sectionMarkerCol: 'Campo',
      sectionMarkerPrefix: '—',
    },
    {
      name: 'HORARIO vs REAL',
      columns: planVsRealColumns.map(c => c.accessor === 'Tipo' ? { ...c, bold: true } : c),
      rows: planVsRealRows,
      autoFilter: false,
      zebra: false,
      // Pintar de rojo cualquier fila que contenga "NO FICHÓ" o "✗ Faltó" en algún día.
      // Eso destaca tanto la fila "Real" del día faltado como la fila "Estado".
      rowHighlight: (row) => Object.values(row).some(v => v === 'NO FICHÓ' || v === '✗ Faltó'),
    },
    {
      name: 'ASISTENCIA',
      columns: EXPORT_COLUMNS_ASISTENCIA,
      rows: asistenciaRows,
      rowHighlight: (row) => row?.Estado === 'No fichó',
    },
    {
      name: 'TARDANZAS',
      columns: [
        { label: 'Fecha', accessor: 'Fecha', width: 12 },
        { label: 'Empleado', accessor: 'Empleado', width: 26 },
        { label: 'Cargo', accessor: 'Cargo', width: 16 },
        { label: 'Programado', accessor: 'Programado', width: 12 },
        { label: 'Hora real', accessor: 'Hora real', width: 12 },
        { label: 'Minutos tarde', accessor: 'Minutos tarde', width: 14, numFmt: '0' },
        { label: 'Multa (Bs)', accessor: 'Multa (Bs)', width: 12, numFmt: '"Bs" #,##0.00' },
        { label: 'Estado', accessor: 'Estado', width: 12 },
        { label: 'Motivo condonación', accessor: 'Motivo condonación', width: 30 },
      ],
      rows: tardanzasRows,
    },
    {
      name: 'PLANILLA',
      columns: [
        { label: 'Empleado', accessor: 'Empleado', width: 26 },
        { label: 'Cargo', accessor: 'Cargo', width: 16 },
        { label: 'Tarifa/h (Bs)', accessor: 'Tarifa/h (Bs)', width: 12, numFmt: '0.00' },
        { label: 'Horas totales', accessor: 'Horas totales', width: 13, numFmt: '0.00' },
        { label: 'Horas normales', accessor: 'Horas normales', width: 14, numFmt: '0.00' },
        { label: 'Horas extra', accessor: 'Horas extra', width: 12, numFmt: '0.00' },
        { label: 'Bruto (Bs)', accessor: 'Bruto (Bs)', width: 12, numFmt: '"Bs" #,##0.00' },
        { label: 'Min tarde', accessor: 'Min tarde', width: 10, numFmt: '0' },
        { label: 'Tarifa multa', accessor: 'Tarifa multa', width: 22 },
        { label: 'Descuento tardanza (Bs)', accessor: 'Descuento tardanza (Bs)', width: 18, numFmt: '"Bs" #,##0.00' },
        { label: 'Total a pagar (Bs)', accessor: 'Total a pagar (Bs)', width: 16, numFmt: '"Bs" #,##0.00' },
      ],
      rows: planillaRows,
    },
  ]

  const safe = nombreLocal.replace(/[^a-z0-9]+/gi, '_')
  const filename = `reporte_semanal_${safe}_${weekKey}.xlsx`
  exportExcelMultiSheet(filename, sheets)
}
