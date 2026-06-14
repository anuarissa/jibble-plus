// Reporte ejecutivo MENSUAL — un Excel con 5 hojas que resume el mes entero
// para administración: KPIs, ranking, asistencia diaria, tardanzas y planilla.
// Análogo a reporte-semanal.js pero a 30/31 días.

import { format, addDays, startOfMonth, endOfMonth, startOfWeek } from 'date-fns'
import { tablaMensual, tablaSemanal, tardanzasConCondonacion, attendanceEnRango, groupByPerson,
         celdaToRow, EXPORT_COLUMNS_ASISTENCIA, extrasYRetrasoDeCells } from './stats'
import { planillaLocal } from './payroll'
import { formatHora } from './format'
import { exportExcelMultiSheet } from './export'

export function descargarReporteMensual({
  empleados, attendance, schedules, condonaciones, turnos, personOverrides,
  mes, cfg, group,
}) {
  const nombreLocal = cfg?.config?.locales?.[group?.id]?.name || group?.name || 'local'
  const ini = startOfMonth(mes)
  const fin = endOfMonth(mes)
  const monthKey = format(mes, 'yyyy-MM')
  const monthLabel = format(mes, "MMMM 'de' yyyy").replace(/^\w/, c => c.toUpperCase())
  const rangoLabel = `${format(ini, 'dd MMM')} – ${format(fin, 'dd MMM yyyy')}`

  // === DATOS BRUTOS DEL MES ===
  const data = tablaMensual({ empleados, attendance, schedules, mes, condonaciones, turnos, personOverrides })
  const tardanzas = tardanzasConCondonacion(attendance, schedules, condonaciones, ini, fin, turnos, personOverrides)
    .filter(t => t.groupId === group.id)

  // === PLANILLA MENSUAL — iterar semanas que tocan el mes (como hace PayrollTable mes) ===
  const empleadosConTarifa = empleados.map(emp => {
    const sched = schedules.find(s => s.personId === emp.id)
    return {
      ...emp,
      tarifa: cfg.getTarifaResolved(emp.id),
      expectedHoursPerWeek: sched?.expectedHoursPerWeek ?? 0,
    }
  })
  const acc = {} // { personId: filaAcumulada }
  let semanaIni = startOfWeek(ini, { weekStartsOn: 1 })
  while (semanaIni <= fin) {
    const semanaFin = addDays(semanaIni, 6)
    const fichajesSem = attendanceEnRango(attendance, semanaIni, semanaFin).filter(a => a.groupId === group.id)
    const tardanzasSem = tardanzas.filter(t => {
      const d = new Date(t.date + 'T00:00:00')
      return d >= semanaIni && d <= semanaFin
    })
    // Horas extra POR DÍA de esa semana (solo lo que pasa de 30 min tras la salida)
    const tablaSem = tablaSemanal({ empleados, attendance, schedules, ini: semanaIni,
      condonaciones, turnos, personOverrides })
    const horasExtraPorPersona = {}
    for (const fila of tablaSem.filas) {
      horasExtraPorPersona[fila.empleado.id] = extrasYRetrasoDeCells(fila.cells).horasExtra
    }
    const planSem = planillaLocal(empleadosConTarifa, groupByPerson(fichajesSem), groupByPerson(tardanzasSem), {
      multiplicadorExtra: cfg.config.settings.multiplicadorExtra,
      horasExtraPorPersona,
    })
    for (const fila of planSem.filas) {
      if (!acc[fila.personId]) {
        acc[fila.personId] = {
          personId: fila.personId, fullName: fila.fullName, position: fila.position, tarifa: fila.tarifa,
          horasTotales: 0, horasNormales: 0, horasExtra: 0,
          bruto: 0, descuentoTardanza: 0, minutosTardeTotales: 0, totalAPagar: 0,
        }
      }
      const a = acc[fila.personId]
      a.horasTotales += fila.horasTotales
      a.horasNormales += fila.horasNormales
      a.horasExtra += fila.horasExtra
      a.bruto += fila.bruto
      a.descuentoTardanza += fila.descuentoTardanza
      a.minutosTardeTotales += fila.minutosTardeTotales || 0
      a.totalAPagar += fila.totalAPagar
    }
    semanaIni = addDays(semanaIni, 7)
  }
  const r2 = (n) => Math.round(n * 100) / 100
  const planillaFilas = Object.values(acc).map(f => ({
    ...f,
    horasTotales: r2(f.horasTotales),
    horasNormales: r2(f.horasNormales),
    horasExtra: r2(f.horasExtra),
    bruto: r2(f.bruto),
    descuentoTardanza: r2(f.descuentoTardanza),
    totalAPagar: r2(f.totalAPagar),
  }))
  const planillaTotales = planillaFilas.reduce((t, f) => ({
    horasTotales: t.horasTotales + f.horasTotales,
    horasNormales: t.horasNormales + f.horasNormales,
    horasExtra: t.horasExtra + f.horasExtra,
    bruto: t.bruto + f.bruto,
    descuentoTardanza: t.descuentoTardanza + f.descuentoTardanza,
    totalAPagar: t.totalAPagar + f.totalAPagar,
  }), { horasTotales: 0, horasNormales: 0, horasExtra: 0, bruto: 0, descuentoTardanza: 0, totalAPagar: 0 })
  Object.keys(planillaTotales).forEach(k => planillaTotales[k] = r2(planillaTotales[k]))

  // === MÉTRICAS GLOBALES ===
  let totalFichados = 0, totalFaltas = 0, totalATiempo = 0, totalDiasLibres = 0, totalHoras = 0
  for (const fila of data.filas) {
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

  // === RANKING DE EMPLEADOS ===
  const rankingRows = data.filas.map(fila => {
    const fichados = fila.cells.filter(c => c.fichaje && !c.falto).length
    const aTiempo = fila.cells.filter(c => c.motivoColor === 'aTiempo').length
    const tardanzasEmp = fila.cells.filter(c => c.motivoColor === 'tardeEntrada').length
    const extras = fila.cells.filter(c => c.motivoColor === 'extras').length
    const pct = fichados > 0 ? (aTiempo / fichados) * 100 : 0
    const agg = extrasYRetrasoDeCells(fila.cells)
    return {
      Empleado: fila.empleado.fullName,
      Cargo: fila.empleado.position || '',
      'Días fichados': fichados,
      Faltas: fila.faltas,
      'Días tarde': tardanzasEmp,
      'Min tarde': agg.minTarde,
      'Multa (Bs)': agg.multaBs,
      'Días extras': extras,
      'Horas trabajadas': r2(fila.totalHoras),
      'A revisar': agg.anomalias > 0 ? `${agg.anomalias} día(s) raros` : '',
      '% Puntualidad': `${pct.toFixed(0)}%`,
      _anomalia: agg.anomalias > 0,
    }
  }).sort((a, b) => parseFloat(b['% Puntualidad']) - parseFloat(a['% Puntualidad']))

  // === TOP TARDANZAS ===
  const tardanzasPorEmp = {}
  for (const t of tardanzasActivas) {
    tardanzasPorEmp[t.personId] = (tardanzasPorEmp[t.personId] || 0) + 1
  }
  const empById = Object.fromEntries(empleados.map(e => [e.id, e]))
  const topTardanzas = Object.entries(tardanzasPorEmp)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([pid, n]) => ({ nombre: empById[pid]?.fullName || pid, cantidad: n }))

  // === HOJA RESUMEN ===
  const resumenRows = [
    { Campo: 'Local', Valor: nombreLocal },
    { Campo: 'Mes', Valor: `${monthLabel} (${rangoLabel})` },
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
    { Campo: 'Horas normales (planilla)', Valor: planillaTotales.horasNormales },
    { Campo: 'Horas extra (planilla)', Valor: planillaTotales.horasExtra },
    { Campo: '', Valor: '' },
    { Campo: '— PLANILLA MENSUAL (Bs) —', Valor: '' },
    { Campo: 'Bruto total', Valor: planillaTotales.bruto },
    { Campo: 'Descuento por tardanzas', Valor: planillaTotales.descuentoTardanza },
    { Campo: 'TOTAL A PAGAR', Valor: planillaTotales.totalAPagar },
    { Campo: '', Valor: '' },
    { Campo: '— TOP TARDANZAS —', Valor: '' },
  ]
  if (topTardanzas.length === 0) {
    resumenRows.push({ Campo: '(sin tardanzas este mes)', Valor: '' })
  } else {
    topTardanzas.forEach((t, i) => {
      resumenRows.push({ Campo: `${i + 1}. ${t.nombre}`, Valor: `${t.cantidad} ${t.cantidad === 1 ? 'tardanza' : 'tardanzas'}` })
    })
  }

  // === HOJA ASISTENCIA (todas las celdas, día por día) ===
  const asistenciaRows = []
  for (const fila of data.filas) {
    for (const c of fila.cells) {
      asistenciaRows.push(celdaToRow(fila.empleado, c, nombreLocal))
    }
  }

  // === HOJA TARDANZAS ===
  const tardanzasRows = tardanzas.length === 0
    ? [{ Fecha: '—', Empleado: 'Sin tardanzas este mes', Cargo: '', Programado: '', 'Hora real': '',
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

  // === HOJA PLANILLA MENSUAL ===
  const TARIFA_MULTA_LABEL = '10 Bs hasta 10 min · +20 Bs cada 10 min adicional'
  const planillaSheetRows = planillaFilas.map(f => ({
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
  planillaSheetRows.push({
    Empleado: 'TOTAL LOCAL',
    Cargo: '',
    'Tarifa/h (Bs)': '',
    'Horas totales': planillaTotales.horasTotales,
    'Horas normales': planillaTotales.horasNormales,
    'Horas extra': planillaTotales.horasExtra,
    'Bruto (Bs)': planillaTotales.bruto,
    'Min tarde': totalMinTarde,
    'Tarifa multa': '',
    'Descuento tardanza (Bs)': planillaTotales.descuentoTardanza,
    'Total a pagar (Bs)': planillaTotales.totalAPagar,
  })

  // === HOJAS ===
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
      name: 'RANKING',
      columns: [
        { label: 'Empleado', accessor: 'Empleado', width: 26 },
        { label: 'Cargo', accessor: 'Cargo', width: 16 },
        { label: 'Días fichados', accessor: 'Días fichados', width: 13, numFmt: '0' },
        { label: 'Faltas', accessor: 'Faltas', width: 10, numFmt: '0' },
        { label: 'Días tarde', accessor: 'Días tarde', width: 11, numFmt: '0' },
        { label: 'Min tarde', accessor: 'Min tarde', width: 10, numFmt: '0' },
        { label: 'Multa (Bs)', accessor: 'Multa (Bs)', width: 12, numFmt: '"Bs" #,##0.00' },
        { label: 'Días extras', accessor: 'Días extras', width: 11, numFmt: '0' },
        { label: 'Horas trabajadas', accessor: 'Horas trabajadas', width: 16, numFmt: '0.00' },
        { label: 'A revisar', accessor: 'A revisar', width: 16 },
        { label: '% Puntualidad', accessor: '% Puntualidad', width: 14 },
      ],
      rows: rankingRows,
      // Rojo si tiene 10+ faltas o días con datos raros para revisar
      rowHighlight: (row) => row?.Faltas >= 10 || row?._anomalia === true,
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
        { label: 'Tarifa multa', accessor: 'Tarifa multa', width: 44 },
        { label: 'Descuento tardanza (Bs)', accessor: 'Descuento tardanza (Bs)', width: 18, numFmt: '"Bs" #,##0.00' },
        { label: 'Total a pagar (Bs)', accessor: 'Total a pagar (Bs)', width: 16, numFmt: '"Bs" #,##0.00' },
      ],
      rows: planillaSheetRows,
    },
  ]

  const safe = nombreLocal.replace(/[^a-z0-9]+/gi, '_')
  exportExcelMultiSheet(`reporte_mensual_${safe}_${monthKey}.xlsx`, sheets)

  return {
    ranking: rankingRows,
    totales: { totalFichados, totalFaltas, totalATiempo, totalDiasLibres, totalHoras,
               tardanzasActivas: tardanzasActivas.length, totalMinTarde, pctPuntualidad,
               planilla: planillaTotales },
    topTardanzas,
  }
}
