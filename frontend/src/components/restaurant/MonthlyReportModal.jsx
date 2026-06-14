// Reporte ejecutivo MENSUAL del local entero, con preview en pantalla,
// export a Excel (5 hojas) y opción de imprimir / guardar como PDF.

import { useMemo, useState, useEffect } from 'react'
import { addMonths, startOfMonth, endOfMonth, format } from 'date-fns'
import { X, ChevronLeft, ChevronRight, Printer, FileSpreadsheet, Calendar, AlertTriangle, DollarSign, Users, TrendingUp } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { tablaMensual, tablaSemanal, tardanzasConCondonacion, attendanceEnRango, groupByPerson, extrasYRetrasoDeCells } from '../../utils/stats'
import { planillaLocal } from '../../utils/payroll'
import { formatHoras, formatBs } from '../../utils/format'
import { descargarReporteMensual } from '../../utils/reporte-mensual'

export function MonthlyReportModal({ empleados, attendance, schedules, cfg, group, onClose }) {
  const [offset, setOffset] = useState(0)

  const mes = useMemo(() => addMonths(startOfMonth(new Date()), offset), [offset])
  const ini = useMemo(() => startOfMonth(mes), [mes])
  const fin = useMemo(() => endOfMonth(mes), [mes])
  const nombreLocal = cfg?.config?.locales?.[group?.id]?.name || group?.name || ''
  const monthLabel = format(mes, "MMMM yyyy")
  const monthKey = format(mes, 'yyyy-MM')

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // === DATOS DEL MES ===
  const datos = useMemo(() => {
    const data = tablaMensual({ empleados, attendance, schedules, mes,
      condonaciones: cfg.condonaciones, turnos: cfg.turnos, personOverrides: cfg.personOverrides })
    const tardanzas = tardanzasConCondonacion(attendance, schedules, cfg.condonaciones, ini, fin,
      cfg.turnos, cfg.personOverrides).filter(t => t.groupId === group.id)

    // Métricas
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

    // Ranking — incluye min tarde, multa Bs y anomalías por empleado
    const ranking = data.filas.map(fila => {
      const fichados = fila.cells.filter(c => c.fichaje && !c.falto).length
      const aTiempo = fila.cells.filter(c => c.motivoColor === 'aTiempo').length
      const tardanzasEmp = fila.cells.filter(c => c.motivoColor === 'tardeEntrada').length
      const extras = fila.cells.filter(c => c.motivoColor === 'extras').length
      const pct = fichados > 0 ? (aTiempo / fichados) * 100 : 0
      const agg = extrasYRetrasoDeCells(fila.cells)
      return { empleado: fila.empleado, fichados, faltas: fila.faltas, aTiempo,
        tardanzas: tardanzasEmp, extras, totalHoras: fila.totalHoras, pct,
        minTarde: agg.minTarde, multaBs: agg.multaBs, anomalias: agg.anomalias }
    }).sort((a, b) => b.pct - a.pct)

    // Planilla mensual (iteramos semanas)
    const empleadosConTarifa = empleados.map(emp => {
      const sched = schedules.find(s => s.personId === emp.id)
      return { ...emp, tarifa: cfg.getTarifaResolved(emp.id), expectedHoursPerWeek: sched?.expectedHoursPerWeek ?? 0 }
    })
    const acc = {}
    let semanaIni = new Date(ini); semanaIni.setDate(semanaIni.getDate() - ((semanaIni.getDay() + 6) % 7))
    while (semanaIni <= fin) {
      const semanaFin = new Date(semanaIni); semanaFin.setDate(semanaFin.getDate() + 6)
      const fichSem = attendanceEnRango(attendance, semanaIni, semanaFin).filter(a => a.groupId === group.id)
      const tardSem = tardanzas.filter(t => {
        const d = new Date(t.date + 'T00:00:00')
        return d >= semanaIni && d <= semanaFin
      })
      const tablaSem = tablaSemanal({ empleados, attendance, schedules, ini: new Date(semanaIni),
        condonaciones: cfg.condonaciones, turnos: cfg.turnos, personOverrides: cfg.personOverrides })
      const horasExtraPorPersona = {}
      for (const fila of tablaSem.filas) {
        horasExtraPorPersona[fila.empleado.id] = extrasYRetrasoDeCells(fila.cells).horasExtra
      }
      const ps = planillaLocal(empleadosConTarifa, groupByPerson(fichSem), groupByPerson(tardSem),
        { multiplicadorExtra: cfg.config.settings.multiplicadorExtra, horasExtraPorPersona })
      for (const f of ps.filas) {
        if (!acc[f.personId]) acc[f.personId] = { totalAPagar: 0, bruto: 0, descuentoTardanza: 0 }
        acc[f.personId].totalAPagar += f.totalAPagar
        acc[f.personId].bruto += f.bruto
        acc[f.personId].descuentoTardanza += f.descuentoTardanza
      }
      semanaIni.setDate(semanaIni.getDate() + 7)
    }
    const totalAPagarMes = Object.values(acc).reduce((s, x) => s + x.totalAPagar, 0)
    const totalDescuentoMes = Object.values(acc).reduce((s, x) => s + x.descuentoTardanza, 0)

    return { data, tardanzas, totalFichados, totalFaltas, totalATiempo, totalDiasLibres,
             totalHoras, tardanzasActivas, totalMinTarde, pctPuntualidad, ranking,
             totalAPagarMes, totalDescuentoMes }
  }, [empleados, attendance, schedules, mes, ini, fin, cfg, group])

  function handleImprimir() { window.print() }
  function handleExcel() {
    descargarReporteMensual({
      empleados, attendance, schedules,
      condonaciones: cfg.condonaciones, turnos: cfg.turnos, personOverrides: cfg.personOverrides,
      mes, cfg, group,
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm overflow-auto" onClick={onClose}>
      <div className="min-h-full flex items-start justify-center p-4 sm:p-6">
        <div className="print-area surface-elevated max-w-5xl w-full p-6 sm:p-8 my-4" onClick={e => e.stopPropagation()}>
          {/* Controles superiores — ocultos en PDF */}
          <div className="no-print flex flex-wrap items-center gap-2 mb-6 pb-5 border-b border-white/5">
            <h2 className="font-display font-bold text-lg text-ink-50">Reporte Mensual · {nombreLocal}</h2>
            <div className="flex items-center gap-1 ml-auto">
              <button onClick={() => setOffset(o => o - 1)} className="btn-ghost p-2"><ChevronLeft size={16} /></button>
              <button onClick={() => setOffset(0)} className="btn-secondary text-xs">Este mes</button>
              <button onClick={() => setOffset(o => o + 1)} disabled={offset >= 0} className="btn-ghost p-2 disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
            <button onClick={handleExcel} className="btn-secondary text-sm font-semibold">
              <FileSpreadsheet size={15} /> Excel (5 hojas)
            </button>
            <button onClick={handleImprimir} className="btn-primary text-sm font-semibold">
              <Printer size={15} /> Imprimir / PDF
            </button>
            <button onClick={onClose} className="btn-ghost p-2" title="Cerrar (Esc)"><X size={16} /></button>
          </div>

          {/* === REPORTE === */}
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl bg-gradient-to-br from-accent/30 to-accent/10 border border-accent/30">
                📅
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-ink-300 uppercase tracking-wider font-semibold">Reporte de Asistencia · Mensual</p>
                <h2 className="font-display font-bold text-2xl text-ink-50 tracking-tight capitalize">{monthLabel}</h2>
                <p className="text-sm text-ink-200 mt-0.5">{nombreLocal} · {empleados.length} empleados · {format(ini, "dd MMM")} – {format(fin, "dd MMM yyyy")}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-ink-300 uppercase tracking-wider font-semibold">Mes</p>
                <p className="font-display font-bold text-lg text-ink-50">{monthKey}</p>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard icon={Users} label="Empleados activos" value={empleados.length} tone="neutral" />
              <KpiCard icon={TrendingUp} label="% Puntualidad"
                value={`${datos.pctPuntualidad.toFixed(0)}%`}
                sub={`${datos.totalATiempo} de ${datos.totalFichados}`}
                tone={datos.pctPuntualidad >= 80 ? 'good' : datos.pctPuntualidad >= 50 ? 'warn' : 'bad'} />
              <KpiCard icon={AlertTriangle} label="Tardanzas"
                value={datos.tardanzasActivas.length}
                sub={`${datos.totalMinTarde} min totales`}
                tone={datos.tardanzasActivas.length === 0 ? 'good' : 'warn'} />
              <KpiCard icon={DollarSign} label="Total a pagar"
                value={formatBs(datos.totalAPagarMes)}
                sub={datos.totalDescuentoMes > 0 ? `−${formatBs(datos.totalDescuentoMes)} descuento` : null}
                tone="accent" />
            </div>

            {/* Ranking */}
            <div>
              <h3 className="font-display font-bold text-base mb-3 flex items-center gap-2">
                <TrendingUp size={16} className="text-accent" />
                Ranking del mes
              </h3>
              <div className="overflow-x-auto rounded-xl border border-white/5">
                <table className="w-full text-sm">
                  <thead className="bg-bg-700/50">
                    <tr>
                      <th className="text-center text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5 w-12">#</th>
                      <th className="text-left text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5">Empleado</th>
                      <th className="text-right text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5">Fichados</th>
                      <th className="text-right text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5">Faltas</th>
                      <th className="text-right text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5">Días tarde</th>
                      <th className="text-right text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5">Min tarde</th>
                      <th className="text-right text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5">Descuento</th>
                      <th className="text-right text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5">Días extras</th>
                      <th className="text-right text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5">Horas</th>
                      <th className="text-right text-xs uppercase tracking-wider font-bold text-ink-100 px-3 py-2.5">% Punt.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.ranking.map((r, i) => {
                      const medal = i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1)
                      const punctClass = r.pct >= 80 ? 'bg-good/15 text-good print-good'
                                       : r.pct >= 50 ? 'bg-warn/15 text-warn print-warn'
                                       : 'bg-bad/15 text-bad print-bad'
                      const isFalton = r.faltas >= 10
                      return (
                        <tr key={r.empleado.id} className={`border-t border-white/5 ${isFalton ? 'bg-bad/5' : ''}`}>
                          <td className="px-3 py-2.5 text-center font-bold">{medal}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={r.empleado.fullName} id={r.empleado.id} size="sm" />
                              <span className="font-semibold text-ink-50">{r.empleado.fullName}</span>
                              {r.anomalias > 0 && (
                                <span className="badge bg-bad/15 text-bad print-bad text-[10px]" title="Tiene días con datos raros para revisar">
                                  <AlertTriangle size={10} /> {r.anomalias} revisar
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold">{r.fichados}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold">
                            {r.faltas > 0 ? <span className="text-bad print-bad">{r.faltas}</span> : <span className="text-ink-400 print-muted">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold">{r.tardanzas}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold">
                            {r.minTarde > 0 ? <span className="text-warn print-warn">{r.minTarde} min</span> : <span className="text-ink-400 print-muted">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold">
                            {r.multaBs > 0 ? <span className="text-bad print-bad">−{formatBs(r.multaBs)}</span> : <span className="text-ink-400 print-muted">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold">
                            {r.extras > 0 ? <span className="text-accent-400">{r.extras}</span> : <span className="text-ink-400 print-muted">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-ink-50">{formatHoras(r.totalHoras)}</td>
                          <td className="px-3 py-2.5 text-right">
                            <span className={`badge ${punctClass}`}>{r.pct.toFixed(0)}%</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Calendario visual */}
            <div>
              <h3 className="font-display font-bold text-base mb-3 flex items-center gap-2">
                <Calendar size={16} className="text-accent" />
                Calendario visual del mes
              </h3>
              <div className="overflow-x-auto rounded-xl border border-white/5 p-3 bg-bg-800/40">
                <CalendarioMensual filas={datos.data.filas} dias={datos.data.dias} />
              </div>
            </div>

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
    good: 'print-good', warn: 'print-warn', bad: 'print-bad', accent: '', neutral: '',
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

function CalendarioMensual({ filas, dias }) {
  function dotColor(c) {
    if (c.falto) return '#DC2626'
    if (c.state === 'idle') return '#374151'
    if (c.motivoColor === 'aTiempo') return '#16A34A'
    if (c.motivoColor === 'tardeEntrada') {
      const m = c.mins || 0
      return m < 15 ? '#F59E0B' : '#DC2626'
    }
    if (c.motivoColor === 'extras') return '#0EA5E9'
    if (c.motivoColor === 'salidaTemprana') return '#A855F7'
    if (c.motivoColor === 'sinSalida') return '#6B7280'
    if (c.motivoColor === 'diaLibreTrabajado') return '#06B6D4'
    return '#9CA3AF'
  }
  return (
    <table className="border-collapse">
      <thead>
        <tr>
          <th className="text-left text-xs text-ink-300 px-2 py-1 font-bold">Empleado</th>
          {dias.map((d, i) => (
            <th key={i} className="text-center text-[10px] text-ink-300 px-0.5 py-1 w-6 font-mono">{d.getDate()}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map(({ empleado, cells }) => (
          <tr key={empleado.id}>
            <td className="text-left text-xs font-semibold text-ink-100 px-2 py-1 whitespace-nowrap">{empleado.fullName}</td>
            {cells.map((c, i) => (
              <td key={i} className="text-center px-0.5 py-1" title={`${c.dayStr} · ${c.motivoColor || c.state}`}>
                <span className="inline-block w-3 h-3 rounded-full" style={{ background: dotColor(c) }} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
