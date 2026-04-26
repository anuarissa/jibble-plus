import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet, ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, startOfWeek, format } from 'date-fns'
import { Avatar } from '../ui/Avatar'
import { planillaLocal } from '../../utils/payroll'
import { attendanceEnRango, groupByPerson, tardanzasConCondonacion } from '../../utils/stats'
import { formatBs, formatHoras } from '../../utils/format'
import { exportCSV, exportExcel } from '../../utils/export'

export function PayrollTable({ group, empleados, attendance, schedules, cfg }) {
  const [offset, setOffset] = useState(0)
  const ini = useMemo(() => addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), offset * 7), [offset])
  const fin = useMemo(() => addDays(ini, 6), [ini])

  const planilla = useMemo(() => {
    const semana = attendanceEnRango(attendance, ini, fin).filter(a => a.groupId === group.id)
    const fichajesPorPersona = groupByPerson(semana)
    const tardanzas = tardanzasConCondonacion(attendance, schedules, cfg.condonaciones, ini, fin, cfg.turnos, cfg.personOverrides)
      .filter(t => t.groupId === group.id)
    const tardanzasPorPersona = groupByPerson(tardanzas)
    const empleadosConTarifa = empleados.map(emp => {
      const sched = schedules.find(s => s.personId === emp.id)
      return {
        ...emp,
        tarifa: cfg.getTarifaResolved(emp.id),
        expectedHoursPerWeek: sched?.expectedHoursPerWeek ?? 0,
      }
    })
    return planillaLocal(empleadosConTarifa, fichajesPorPersona, tardanzasPorPersona, {
      multiplicadorExtra: cfg.config.settings.multiplicadorExtra,
    })
  }, [empleados, attendance, schedules, cfg.tarifas, cfg.personOverrides, cfg.condonaciones, cfg.turnos, ini, fin, group.id, cfg.config.settings.multiplicadorExtra])

  const semanaLabel = `${format(ini, 'dd-MM')}_a_${format(fin, 'dd-MM-yyyy')}`
  const exportColumns = [
    { label: 'Empleado', accessor: 'fullName' },
    { label: 'Cargo', accessor: 'position' },
    { label: 'Tarifa/h', accessor: 'tarifa' },
    { label: 'Horas normales', accessor: 'horasNormales' },
    { label: 'Horas extra', accessor: 'horasExtra' },
    { label: 'Bruto', accessor: 'bruto' },
    { label: 'Descuento tardanza', accessor: 'descuentoTardanza' },
    { label: 'Total a pagar', accessor: 'totalAPagar' },
  ]

  return (
    <div className="surface p-5 grain">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h3 className="font-display font-semibold text-lg">Planilla semanal</h3>
          <p className="text-xs text-ink-300 mt-0.5">Semana del {format(ini, 'dd MMM')} al {format(fin, 'dd MMM')} · Tarifas se editan inline</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button onClick={() => setOffset(o => o - 1)} className="btn-ghost p-2"><ChevronLeft size={16} /></button>
            <button onClick={() => setOffset(0)} className="btn-secondary text-xs">Esta semana</button>
            <button onClick={() => setOffset(o => o + 1)} disabled={offset >= 0} className="btn-ghost p-2 disabled:opacity-30"><ChevronRight size={16} /></button>
          </div>
          <button onClick={() => exportCSV(`planilla_${group.id}_${semanaLabel}`, planilla.filas, exportColumns)} className="btn-secondary text-xs">
            <Download size={14} /> CSV
          </button>
          <button onClick={() => exportExcel(`planilla_${group.id}_${semanaLabel}`, planilla.filas, exportColumns)} className="btn-secondary text-xs">
            <FileSpreadsheet size={14} /> Excel
          </button>
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="text-left">
              {['Empleado', 'Tarifa/h', 'H. normales', 'H. extra', 'Bruto', 'Descuento', 'Total'].map((h, i) => (
                <th key={i} className={`text-xs uppercase tracking-wider text-ink-300 pb-3 font-medium ${i >= 4 ? 'text-right' : i >= 1 ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {planilla.filas.map(fila => (
              <tr key={fila.personId} className="border-t border-white/5 hover:bg-bg-700/30 transition">
                <td className="py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={fila.fullName} id={fila.personId} size="sm" />
                    <div>
                      <div className="font-medium text-ink-50">{fila.fullName}</div>
                      <div className="text-xs text-ink-300">{fila.position}</div>
                    </div>
                  </div>
                </td>
                <td className="text-right py-3">
                  <input
                    type="number"
                    step="0.5"
                    value={fila.tarifa}
                    onChange={e => cfg.setTarifa(fila.personId, e.target.value)}
                    className="w-24 bg-bg-700/60 border border-white/5 rounded-lg px-2.5 py-1.5 text-right text-ink-50 focus:outline-none focus:ring-1 focus:ring-accent/40"
                  />
                </td>
                <td className="text-right py-3 font-mono text-ink-100">{formatHoras(fila.horasNormales)}</td>
                <td className="text-right py-3 font-mono">
                  {fila.horasExtra > 0 ? <span className="text-accent-400">{formatHoras(fila.horasExtra)}</span> : <span className="text-ink-400">—</span>}
                </td>
                <td className="text-right py-3 font-display text-ink-100">{formatBs(fila.bruto)}</td>
                <td className="text-right py-3 font-display">
                  {fila.descuentoTardanza > 0 ? <span className="text-bad">−{formatBs(fila.descuentoTardanza)}</span> : <span className="text-ink-400">—</span>}
                </td>
                <td className="text-right py-3 font-display font-bold text-ink-50">{formatBs(fila.totalAPagar)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-white/10 bg-bg-700/30">
              <td className="py-3 font-display font-bold text-ink-50">TOTAL LOCAL</td>
              <td></td>
              <td className="text-right py-3 font-mono">{formatHoras(planilla.totales.horasNormales)}</td>
              <td className="text-right py-3 font-mono text-accent-400">{formatHoras(planilla.totales.horasExtra)}</td>
              <td className="text-right py-3 font-display">{formatBs(planilla.totales.bruto)}</td>
              <td className="text-right py-3 font-display text-bad">−{formatBs(planilla.totales.descuentoTardanza)}</td>
              <td className="text-right py-3 font-display font-bold text-accent text-lg">{formatBs(planilla.totales.totalAPagar)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
