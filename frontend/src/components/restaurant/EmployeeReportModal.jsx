// Reporte individual de un empleado en una semana, con preview en pantalla,
// export a Excel y opción de imprimir / guardar como PDF (window.print + CSS @media print).

import { useMemo, useState, useEffect } from 'react'
import { addDays, format, startOfWeek } from 'date-fns'
import { X, ChevronLeft, ChevronRight, Printer, FileSpreadsheet, Clock, Calendar, AlertTriangle, DollarSign } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { tablaSemanal, tardanzasConCondonacion, attendanceEnRango, groupByPerson } from '../../utils/stats'
import { planillaLocal } from '../../utils/payroll'
import { formatHora, formatHoras, formatBs, formatFecha } from '../../utils/format'
import { exportExcelMultiSheet } from '../../utils/export'

const DAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export function EmployeeReportModal({ empleados, attendance, schedules, cfg, group, initialEmployeeId, onClose }) {
  const [empId, setEmpId] = useState(initialEmployeeId || empleados[0]?.id)
  const [offset, setOffset] = useState(0)

  const ini = useMemo(() => addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), offset * 7), [offset])
  const fin = useMemo(() => addDays(ini, 6), [ini])
  const empleado = empleados.find(e => e.id === empId) || empleados[0]
  const nombreLocal = cfg?.config?.locales?.[group?.id]?.name || group?.name || ''
  const weekKey = format(ini, "RRRR-'W'II")
  const rangoLabel = `${format(ini, 'dd MMM')} – ${format(fin, 'dd MMM yyyy')}`

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // === DATOS DEL EMPLEADO EN LA SEMANA ===
  const datos = useMemo(() => {
    if (!empleado) return null
    const semana = tablaSemanal({
      empleados: [empleado], attendance, schedules,
      ini, condonaciones: cfg.condonaciones, turnos: cfg.turnos, personOverrides: cfg.personOverrides,
    })
    const fila = semana.filas[0]
    const cells = fila.cells.map((c, i) => ({ ...c, dow: i + 1, day: addDays(ini, i), label: DAY_LABELS[i] }))

    const tardanzas = tardanzasConCondonacion(
      attendance, schedules, cfg.condonaciones, ini, fin, cfg.turnos, cfg.personOverrides
    ).filter(t => t.personId === empleado.id)

    // Planilla solo de este empleado
    const fichajesEmp = attendanceEnRango(attendance, ini, fin)
      .filter(a => a.personId === empleado.id && a.groupId === group.id)
    const empConTarifa = {
      ...empleado,
      tarifa: cfg.getTarifaResolved(empleado.id),
      expectedHoursPerWeek: schedules.find(s => s.personId === empleado.id)?.expectedHoursPerWeek ?? 0,
    }
    const planilla = planillaLocal([empConTarifa],
      groupByPerson(fichajesEmp), groupByPerson(tardanzas),
      { multiplicadorExtra: cfg.config.settings.multiplicadorExtra }).filas[0] || {}

    // KPIs
    const totalHoras = cells.reduce((s, c) => s + (c.horas || 0), 0)
    const faltas = cells.filter(c => c.falto).length
    const fichados = cells.filter(c => c.fichaje && !c.falto).length
    const aTiempo = cells.filter(c => c.motivoColor === 'aTiempo').length
    const minTardeTotal = tardanzas.filter(t => !t.condonada).reduce((s, t) => s + t.minutosTarde, 0)
    const pctPuntualidad = fichados > 0 ? (aTiempo / fichados) * 100 : 0

    return { cells, tardanzas, planilla, totalHoras, faltas, fichados, aTiempo, minTardeTotal, pctPuntualidad }
  }, [empleado, attendance, schedules, ini, fin, cfg, group])

  function handleImprimir() {
    window.print()
  }

  function handleExportExcel() {
    if (!datos) return
    const fechaStr = c => format(c.day, 'EEE dd/MM')
    const detalleRows = datos.cells.map(c => {
      const horario = c.programadoStart && c.programadoEnd ? `${c.programadoStart} – ${c.programadoEnd}` : 'Día libre'
      const entrada = c.fichaje?.clockIn ? formatHora(c.fichaje.clockIn) : (c.falto ? '— NO FICHÓ' : '')
      const salida = c.fichaje?.clockOut ? formatHora(c.fichaje.clockOut) : (c.fichaje ? 'Activo' : '')
      const minTarde = c.mins > 0 ? c.mins : 0
      const estado =
        c.falto ? 'No fichó' :
        c.state === 'idle' ? 'Día libre' :
        c.motivoColor === 'aTiempo' ? 'A tiempo' :
        c.motivoColor === 'tardeEntrada' ? `Tarde +${c.mins}min` :
        c.motivoColor === 'salidaTemprana' ? `Salió ${Math.abs(c.minSalidaDiff || 0)}min antes` :
        c.motivoColor === 'extras' ? `+${c.minSalidaDiff}min extras` :
        c.motivoColor === 'sinSalida' ? 'Sin salida (activo)' : '—'
      return { Día: fechaStr(c), Horario: horario, 'Entrada real': entrada, 'Salida real': salida, 'Min tarde': minTarde, 'Horas': c.horas ? c.horas.toFixed(2) : '', Estado: estado }
    })

    const tardanzaRows = datos.tardanzas.length === 0
      ? [{ Fecha: '—', Programado: '', 'Hora real': '', 'Min tarde': '', 'Multa Bs': '', Estado: 'Sin tardanzas esta semana', Motivo: '' }]
      : datos.tardanzas.map(t => ({
          Fecha: t.date,
          Programado: t.scheduledStart || '',
          'Hora real': t.clockIn ? formatHora(t.clockIn) : '',
          'Min tarde': t.minutosTarde,
          'Multa Bs': t.multa,
          Estado: t.condonada ? 'CONDONADA' : 'Activa',
          Motivo: t.motivoCondonacion || '',
        }))

    const resumenRows = [
      { Campo: 'Empleado', Valor: empleado.fullName },
      { Campo: 'Cargo', Valor: empleado.position || '' },
      { Campo: 'Local', Valor: nombreLocal },
      { Campo: 'Semana', Valor: `${weekKey} · ${rangoLabel}` },
      { Campo: '', Valor: '' },
      { Campo: 'Días fichados', Valor: datos.fichados },
      { Campo: 'Faltas', Valor: datos.faltas },
      { Campo: 'A tiempo', Valor: datos.aTiempo },
      { Campo: '% Puntualidad', Valor: `${datos.pctPuntualidad.toFixed(1)}%` },
      { Campo: 'Tardanzas activas', Valor: datos.tardanzas.filter(t => !t.condonada).length },
      { Campo: 'Tardanzas condonadas', Valor: datos.tardanzas.filter(t => t.condonada).length },
      { Campo: 'Total minutos tarde', Valor: datos.minTardeTotal },
      { Campo: 'Horas trabajadas', Valor: datos.totalHoras.toFixed(2) },
      { Campo: '', Valor: '' },
      { Campo: '— Planilla (Bs) —', Valor: '' },
      { Campo: 'Tarifa/h', Valor: datos.planilla.tarifa || 0 },
      { Campo: 'Bruto', Valor: datos.planilla.bruto || 0 },
      { Campo: 'Descuento tardanza', Valor: datos.planilla.descuentoTardanza || 0 },
      { Campo: 'TOTAL A PAGAR', Valor: datos.planilla.totalAPagar || 0 },
    ]

    const sheets = [
      {
        name: 'RESUMEN',
        columns: [
          { label: 'Métrica', accessor: 'Campo', width: 26 },
          { label: 'Valor', accessor: 'Valor', width: 32 },
        ],
        rows: resumenRows,
      },
      {
        name: 'DETALLE DIAS',
        columns: [
          { label: 'Día', accessor: 'Día', width: 14 },
          { label: 'Horario programado', accessor: 'Horario', width: 20 },
          { label: 'Entrada real', accessor: 'Entrada real', width: 14 },
          { label: 'Salida real', accessor: 'Salida real', width: 14 },
          { label: 'Min tarde', accessor: 'Min tarde', width: 11, numFmt: '0' },
          { label: 'Horas trabajadas', accessor: 'Horas', width: 16, numFmt: '0.00' },
          { label: 'Estado', accessor: 'Estado', width: 24 },
        ],
        rows: detalleRows,
      },
      {
        name: 'TARDANZAS',
        columns: [
          { label: 'Fecha', accessor: 'Fecha', width: 12 },
          { label: 'Programado', accessor: 'Programado', width: 12 },
          { label: 'Hora real', accessor: 'Hora real', width: 12 },
          { label: 'Min tarde', accessor: 'Min tarde', width: 11, numFmt: '0' },
          { label: 'Multa Bs', accessor: 'Multa Bs', width: 12, numFmt: '"Bs" #,##0.00' },
          { label: 'Estado', accessor: 'Estado', width: 14 },
          { label: 'Motivo', accessor: 'Motivo', width: 30 },
        ],
        rows: tardanzaRows,
      },
    ]
    const safe = (empleado.fullName + '_' + weekKey).replace(/[^a-z0-9]+/gi, '_')
    exportExcelMultiSheet(`reporte_${safe}.xlsx`, sheets)
  }

  if (!empleado || !datos) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm overflow-auto" onClick={onClose}>
      <div className="min-h-full flex items-start justify-center p-4 sm:p-6">
        <div className="print-area surface-elevated max-w-4xl w-full p-6 sm:p-8 my-4" onClick={e => e.stopPropagation()}>
          {/* Controles superiores — ocultos en PDF */}
          <div className="no-print flex flex-wrap items-center gap-2 mb-6 pb-5 border-b border-white/5">
            <div className="flex items-center gap-2">
              <label className="text-xs text-ink-300 font-medium">Empleado</label>
              <select
                value={empId}
                onChange={e => setEmpId(e.target.value)}
                className="bg-bg-700/60 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-ink-50 focus:outline-none focus:ring-1 focus:ring-accent/40"
              >
                {empleados.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <button onClick={() => setOffset(o => o - 1)} className="btn-ghost p-2"><ChevronLeft size={16} /></button>
              <button onClick={() => setOffset(0)} className="btn-secondary text-xs">Esta semana</button>
              <button onClick={() => setOffset(o => o + 1)} disabled={offset >= 0} className="btn-ghost p-2 disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
            <button onClick={handleExportExcel} className="btn-secondary text-sm font-semibold">
              <FileSpreadsheet size={15} /> Excel
            </button>
            <button onClick={handleImprimir} className="btn-primary text-sm font-semibold">
              <Printer size={15} /> Imprimir / PDF
            </button>
            <button onClick={onClose} className="btn-ghost p-2" title="Cerrar (Esc)"><X size={16} /></button>
          </div>

          {/* === REPORTE === */}
          <div className="space-y-6">
            {/* Header del reporte */}
            <div className="flex items-center gap-4 flex-wrap">
              <Avatar name={empleado.fullName} id={empleado.id} size="lg" />
              <div className="flex-1 min-w-0">
                <h2 className="font-display font-bold text-2xl text-ink-50 tracking-tight">{empleado.fullName}</h2>
                <p className="text-sm text-ink-300 mt-0.5">
                  {empleado.position ? `${empleado.position} · ` : ''}{nombreLocal}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-ink-300 uppercase tracking-wider font-semibold">Semana</p>
                <p className="font-display font-bold text-lg text-ink-50">{weekKey}</p>
                <p className="text-sm text-ink-200">{rangoLabel}</p>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard icon={Clock} label="Horas trabajadas" value={formatHoras(datos.totalHoras)} tone="neutral" />
              <KpiCard icon={Calendar} label="A tiempo" value={`${datos.pctPuntualidad.toFixed(0)}%`} sub={`${datos.aTiempo} de ${datos.fichados}`}
                tone={datos.pctPuntualidad >= 90 ? 'good' : datos.pctPuntualidad >= 70 ? 'warn' : 'bad'} />
              <KpiCard icon={AlertTriangle} label="Tardanzas" value={datos.tardanzas.filter(t => !t.condonada).length}
                sub={`${datos.minTardeTotal} min totales`}
                tone={datos.tardanzas.filter(t => !t.condonada).length === 0 ? 'good' : 'warn'} />
              <KpiCard icon={DollarSign} label="Total a pagar" value={formatBs(datos.planilla.totalAPagar || 0)}
                sub={datos.planilla.descuentoTardanza > 0 ? `−${formatBs(datos.planilla.descuentoTardanza)} descuento` : null}
                tone="accent" />
            </div>

            {/* Tabla detallada por día */}
            <div>
              <h3 className="font-display font-bold text-base mb-3 flex items-center gap-2">
                <Calendar size={16} className="text-accent" />
                Detalle día por día
              </h3>
              <div className="overflow-x-auto rounded-xl border border-white/5">
                <table className="w-full text-sm">
                  <thead className="bg-bg-700/50">
                    <tr>
                      <th className="text-left text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5">Día</th>
                      <th className="text-left text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5">Horario programado</th>
                      <th className="text-left text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5">Entrada real</th>
                      <th className="text-left text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5">Salida real</th>
                      <th className="text-right text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5">Min tarde</th>
                      <th className="text-right text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5">Horas</th>
                      <th className="text-left text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.cells.map(c => <FilaDia key={c.dow} c={c} />)}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tabla de tardanzas */}
            {datos.tardanzas.length > 0 && (
              <div>
                <h3 className="font-display font-bold text-base mb-3 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-warn" />
                  Tardanzas registradas
                </h3>
                <div className="overflow-x-auto rounded-xl border border-white/5">
                  <table className="w-full text-sm">
                    <thead className="bg-bg-700/50">
                      <tr>
                        <th className="text-left text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5">Fecha</th>
                        <th className="text-left text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5">Programado</th>
                        <th className="text-left text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5">Hora real</th>
                        <th className="text-right text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5">Min tarde</th>
                        <th className="text-right text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5">Multa</th>
                        <th className="text-left text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.tardanzas.map(t => (
                        <tr key={t.id} className="border-t border-white/5">
                          <td className="px-3 py-2.5 font-mono text-ink-50">{formatFecha(t.date).split(',')[0]}</td>
                          <td className="px-3 py-2.5 font-mono text-ink-50">{t.scheduledStart}</td>
                          <td className="px-3 py-2.5 font-mono text-ink-50">{formatHora(t.clockIn)}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-bad print-bad">+{t.minutosTarde} min</td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-bad print-bad">{formatBs(t.multa)}</td>
                          <td className="px-3 py-2.5">
                            {t.condonada
                              ? <span className="badge bg-ink-300/15 text-ink-200 print-muted">CONDONADA{t.motivoCondonacion ? ` · ${t.motivoCondonacion}` : ''}</span>
                              : <span className="badge bg-bad/15 text-bad print-bad">Activa</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="pt-4 border-t border-white/5 flex justify-between items-center text-xs text-ink-300 print-muted">
              <span>Generado: {format(new Date(), 'dd MMM yyyy HH:mm')}</span>
              <span>{nombreLocal} · Jibble+</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, sub, tone }) {
  const toneClasses = {
    good: 'text-good',
    warn: 'text-warn',
    bad: 'text-bad',
    accent: 'text-accent-400',
    neutral: 'text-ink-50',
  }
  const toneClassesPrint = {
    good: 'print-good',
    warn: 'print-warn',
    bad: 'print-bad',
    accent: '',
    neutral: '',
  }
  return (
    <div className="surface-elevated p-4">
      <div className="flex items-center gap-2 text-xs text-ink-300 uppercase tracking-wider font-semibold mb-2 print-muted">
        <Icon size={13} /> {label}
      </div>
      <div className={`font-display font-bold text-2xl ${toneClasses[tone]} ${toneClassesPrint[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-ink-300 mt-1 print-muted">{sub}</div>}
    </div>
  )
}

function FilaDia({ c }) {
  const horario = c.programadoStart && c.programadoEnd
    ? <span className="font-mono text-ink-100">{c.programadoStart} – {c.programadoEnd}</span>
    : <span className="text-ink-400 italic print-muted">Día libre</span>
  const entrada = c.fichaje?.clockIn
    ? <span className="font-mono font-semibold text-ink-50">{formatHora(c.fichaje.clockIn)}</span>
    : c.falto
      ? <span className="text-bad font-semibold print-bad">NO FICHÓ</span>
      : <span className="text-ink-400 print-muted">—</span>
  const salida = c.fichaje?.clockOut
    ? <span className="font-mono font-semibold text-ink-50">{formatHora(c.fichaje.clockOut)}</span>
    : c.fichaje
      ? <span className="text-warn print-warn">Activo</span>
      : <span className="text-ink-400 print-muted">—</span>
  const minTarde = c.mins > 0
    ? <span className={`font-mono font-semibold ${c.mins >= 15 ? 'text-bad print-bad' : 'text-warn print-warn'}`}>+{c.mins}</span>
    : c.fichaje && !c.falto ? <span className="text-good print-good font-mono">0</span> : <span className="text-ink-400 print-muted">—</span>
  const horas = c.horas != null ? <span className="font-mono font-semibold text-ink-50">{c.horas.toFixed(2)}</span> : <span className="text-ink-400 print-muted">—</span>
  const estado = c.falto
    ? <span className="badge bg-bad/15 text-bad print-bad">No fichó</span>
    : c.state === 'idle'
      ? <span className="badge bg-ink-300/10 text-ink-300 print-muted">Día libre</span>
      : c.motivoColor === 'aTiempo'
        ? <span className="badge bg-good/15 text-good print-good">A tiempo</span>
        : c.motivoColor === 'tardeEntrada'
          ? <span className={`badge ${c.mins >= 15 ? 'bg-bad/15 text-bad print-bad' : 'bg-warn/15 text-warn print-warn'}`}>Tarde +{c.mins} min</span>
          : c.motivoColor === 'extras'
            ? <span className="badge bg-accent/15 text-accent-400">+{c.minSalidaDiff}min extras</span>
            : c.motivoColor === 'salidaTemprana'
              ? <span className="badge bg-warn/15 text-warn print-warn">Salió {Math.abs(c.minSalidaDiff)}min antes</span>
              : c.motivoColor === 'sinSalida'
                ? <span className="badge bg-warn/15 text-warn print-warn">Sin salida</span>
                : <span className="text-ink-400 print-muted">—</span>

  return (
    <tr className="border-t border-white/5">
      <td className="px-3 py-2.5">
        <div className="font-semibold text-ink-50">{c.label}</div>
        <div className="text-xs text-ink-300 print-muted">{format(c.day, 'dd MMM')}</div>
      </td>
      <td className="px-3 py-2.5">{horario}</td>
      <td className="px-3 py-2.5">{entrada}</td>
      <td className="px-3 py-2.5">{salida}</td>
      <td className="px-3 py-2.5 text-right">{minTarde}</td>
      <td className="px-3 py-2.5 text-right">{horas}</td>
      <td className="px-3 py-2.5">{estado}</td>
    </tr>
  )
}
