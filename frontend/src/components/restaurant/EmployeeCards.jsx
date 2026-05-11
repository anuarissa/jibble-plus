import { useMemo, useState } from 'react'
import { addDays, startOfWeek } from 'date-fns'
import { FileText } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { attendanceEnRango } from '../../utils/stats'
import { sumarHoras } from '../../utils/payroll'
import { formatHoras, formatHora, formatFechaCorta } from '../../utils/format'
import { EmployeeReportModal } from './EmployeeReportModal'

export function EmployeeCards({ empleados, attendance, schedules, cfg, group }) {
  const [reporteEmpId, setReporteEmpId] = useState(null)
  const ini = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), [])
  const fin = useMemo(() => addDays(ini, 6), [ini])

  const datosPorEmp = useMemo(() => {
    const semana = attendanceEnRango(attendance, ini, fin)
    return empleados.map(emp => {
      const sched = schedules.find(s => s.personId === emp.id)
      const fichajes = semana.filter(a => a.personId === emp.id)
      const horas = sumarHoras(fichajes)
      const esperadas = sched?.expectedHoursPerWeek || 0
      const ultima = fichajes
        .filter(f => f.clockIn)
        .sort((a, b) => new Date(b.clockIn) - new Date(a.clockIn))[0]
      return { emp, horas, esperadas, ultima }
    })
  }, [empleados, attendance, schedules, ini, fin])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {datosPorEmp.map(({ emp, horas, esperadas, ultima }) => {
        const pct = esperadas > 0 ? Math.min(100, (horas / esperadas) * 100) : 0
        const barColor = pct >= 95 ? 'bg-good' : pct >= 70 ? 'bg-accent' : 'bg-warn'
        return (
          <div key={emp.id} className="surface p-4 grain">
            <div className="flex items-start gap-3 mb-4">
              <Avatar name={emp.fullName} id={emp.id} size="lg" />
              <div className="flex-1 min-w-0">
                <h4 className="font-display font-semibold text-ink-50 truncate">{emp.fullName}</h4>
                <p className="text-xs text-ink-300">{emp.position}</p>
              </div>
            </div>

            <div className="mb-3">
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-xs text-ink-300">Horas esta semana</span>
                <span className="text-sm font-display text-ink-50">
                  {formatHoras(horas)} <span className="text-ink-400">/ {formatHoras(esperadas)}</span>
                </span>
              </div>
              <div className="h-1.5 bg-bg-700 rounded-full overflow-hidden">
                <div
                  className={`h-full ${barColor} rounded-full transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <div className="text-xs text-ink-300 flex items-center justify-between pt-3 border-t border-white/5">
              <span>Última entrada</span>
              <span className="font-mono text-ink-100">
                {ultima ? `${formatFechaCorta(ultima.date)} · ${formatHora(ultima.clockIn)}` : '—'}
              </span>
            </div>

            {cfg && group && (
              <button
                onClick={() => setReporteEmpId(emp.id)}
                className="btn-secondary text-xs font-semibold w-full mt-3 justify-center"
                title="Ver reporte semanal individual con horarios, tardanzas y planilla"
              >
                <FileText size={13} /> Ver reporte semanal
              </button>
            )}
          </div>
        )
      })}

      {reporteEmpId && cfg && group && (
        <EmployeeReportModal
          empleados={empleados}
          attendance={attendance}
          schedules={schedules}
          cfg={cfg}
          group={group}
          initialEmployeeId={reporteEmpId}
          onClose={() => setReporteEmpId(null)}
        />
      )}
    </div>
  )
}
