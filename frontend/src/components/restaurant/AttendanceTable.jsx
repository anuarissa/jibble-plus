import { useMemo, useState } from 'react'
import { addDays, format, startOfWeek, addMonths, startOfMonth } from 'date-fns'
import { ChevronLeft, ChevronRight, CalendarDays, Calendar, CalendarRange } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { tablaSemanal, vistaDia, tablaMensual } from '../../utils/stats'
import { formatHoras, formatHora, formatFechaCorta } from '../../utils/format'

const MODOS = [
  { id: 'dia', label: 'Día', icon: Calendar },
  { id: 'semana', label: 'Semana', icon: CalendarDays },
  { id: 'mes', label: 'Mes', icon: CalendarRange },
]

const colorState = {
  good: 'bg-good',
  warn: 'bg-warn',
  bad: 'bg-bad',
  idle: 'bg-idle/30',
}

export function AttendanceTable({ empleados, attendance, schedules, condonaciones, turnos, personOverrides }) {
  const [modo, setModo] = useState('semana')
  const [offset, setOffset] = useState(0) // significado depende del modo

  // Header navegación: misma lógica para todos los modos
  function ir(delta) {
    setOffset(o => o + delta)
  }
  function hoy() { setOffset(0) }

  return (
    <div className="surface p-5 grain">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h3 className="font-display font-semibold text-lg">Asistencia</h3>
          <p className="text-xs text-ink-300 mt-0.5">Cambia entre vista diaria, semanal o mensual</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-bg-700/50 p-1 rounded-xl border border-white/5">
            {MODOS.map(m => (
              <button
                key={m.id}
                onClick={() => { setModo(m.id); setOffset(0) }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  modo === m.id ? 'bg-accent text-white shadow-glow' : 'text-ink-200 hover:text-ink-50'
                }`}
              >
                <m.icon size={13} /> {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => ir(-1)} className="btn-ghost p-2"><ChevronLeft size={16} /></button>
            <button onClick={hoy} className="btn-secondary text-xs">Hoy</button>
            <button onClick={() => ir(1)} disabled={offset >= 0} className="btn-ghost p-2 disabled:opacity-30"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {modo === 'dia' && (
        <DiaView empleados={empleados} attendance={attendance} schedules={schedules}
                 condonaciones={condonaciones} turnos={turnos} personOverrides={personOverrides} offset={offset} />
      )}
      {modo === 'semana' && (
        <SemanaView empleados={empleados} attendance={attendance} schedules={schedules}
                    condonaciones={condonaciones} turnos={turnos} personOverrides={personOverrides} offset={offset} />
      )}
      {modo === 'mes' && (
        <MesView empleados={empleados} attendance={attendance} schedules={schedules}
                 condonaciones={condonaciones} turnos={turnos} personOverrides={personOverrides} offset={offset} />
      )}

      <div className="flex items-center gap-4 mt-5 pt-4 border-t border-white/5 text-xs text-ink-300 flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-good" /> A tiempo</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warn" /> Tarde &lt;15min</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-bad" /> Tarde 15min+ / falta</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-idle/50" /> Día libre</span>
      </div>
    </div>
  )
}

// ============== VISTA DÍA ==============

function DiaView({ empleados, attendance, schedules, condonaciones, turnos, personOverrides, offset }) {
  const dia = useMemo(() => addDays(new Date(), offset), [offset])
  const filas = useMemo(
    () => vistaDia({ empleados, attendance, schedules, dia, condonaciones, turnos, personOverrides }),
    [empleados, attendance, schedules, dia, condonaciones, turnos, personOverrides]
  )

  return (
    <>
      <div className="mb-3">
        <h4 className="font-display font-semibold">{format(dia, 'EEEE dd MMMM yyyy')}</h4>
        <p className="text-xs text-ink-300 mt-0.5">{filas.filter(f => f.fichaje).length} fichados · {filas.filter(f => f.falto).length} faltaron · {filas.filter(f => f.state === 'idle' && !f.falto).length} día libre</p>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="text-left">
              {['Empleado', 'Programado', 'Entrada real', 'Salida real', 'Horas', 'Estado'].map(h => (
                <th key={h} className="text-xs uppercase tracking-wider text-ink-300 pb-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map(({ empleado, fichaje, programadoStart, programadoEnd, state, mins, falto, horas, turnoCustom }) => (
              <tr key={empleado.id} className="border-t border-white/5 hover:bg-bg-700/30 transition">
                <td className="py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={empleado.fullName} id={empleado.id} size="sm" />
                    <div>
                      <div className="text-ink-50">{empleado.fullName}</div>
                      <div className="text-xs text-ink-300">{empleado.position || '—'}</div>
                    </div>
                  </div>
                </td>
                <td className="py-3 font-mono text-ink-100">
                  {programadoStart
                    ? <>
                        {programadoStart}–{programadoEnd}
                        {turnoCustom && <span className="ml-1 badge bg-accent/15 text-accent text-[10px]">turno</span>}
                      </>
                    : <span className="text-ink-400">Día libre</span>}
                </td>
                <td className="py-3 font-mono text-ink-100">
                  {fichaje?.clockIn ? formatHora(fichaje.clockIn) : <span className="text-ink-400">—</span>}
                </td>
                <td className="py-3 font-mono text-ink-100">
                  {fichaje?.clockOut ? formatHora(fichaje.clockOut) : (fichaje ? <span className="text-warn">activo</span> : <span className="text-ink-400">—</span>)}
                </td>
                <td className="py-3 font-mono text-ink-100">{horas != null ? formatHoras(horas) : <span className="text-ink-400">—</span>}</td>
                <td className="py-3">
                  {falto && <span className="badge bg-bad/15 text-bad">No fichó</span>}
                  {!falto && state === 'good' && <span className="badge bg-good/15 text-good">A tiempo</span>}
                  {!falto && state === 'warn' && <span className="badge bg-warn/15 text-warn">+{mins}min tarde</span>}
                  {!falto && state === 'bad' && <span className="badge bg-bad/15 text-bad">+{mins}min tarde</span>}
                  {!falto && state === 'idle' && <span className="text-ink-400 text-xs">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ============== VISTA SEMANA ==============

function SemanaView({ empleados, attendance, schedules, condonaciones, turnos, personOverrides, offset }) {
  const ini = useMemo(() => addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), offset * 7), [offset])
  const data = useMemo(
    () => tablaSemanal({ empleados, attendance, schedules, ini, condonaciones, turnos, personOverrides }),
    [empleados, attendance, schedules, ini, condonaciones, turnos, personOverrides]
  )
  const dayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  return (
    <>
      <p className="text-xs text-ink-300 mb-3">
        Semana del {format(ini, 'dd MMM')} al {format(addDays(ini, 6), 'dd MMM yyyy')}
      </p>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="text-left">
              <th className="text-xs uppercase tracking-wider text-ink-300 pb-3 font-medium">Empleado</th>
              {data.dias.map((d, i) => (
                <th key={i} className="text-center text-xs uppercase tracking-wider text-ink-300 pb-3 font-medium">
                  <div>{dayLabels[i]}</div>
                  <div className="text-ink-400 mt-0.5">{format(d, 'dd')}</div>
                </th>
              ))}
              <th className="text-right text-xs uppercase tracking-wider text-ink-300 pb-3 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.filas.map(({ empleado, cells, totalHoras }) => (
              <tr key={empleado.id} className="border-t border-white/5 hover:bg-bg-700/30 transition">
                <td className="py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={empleado.fullName} id={empleado.id} size="sm" />
                    <div className="min-w-0">
                      <div className="font-medium text-ink-50 text-sm truncate">{empleado.fullName}</div>
                      <div className="text-xs text-ink-300">{empleado.position}</div>
                    </div>
                  </div>
                </td>
                {cells.map((c, i) => (
                  <td key={i} className="text-center py-3" title={c.fichaje ? `${formatHoras(c.horas || 0)}${c.mins ? ` · +${c.mins}min tarde` : ''}` : c.falto ? 'No fichó' : 'Día libre'}>
                    <div className="flex flex-col items-center gap-1">
                      <span className={`w-2.5 h-2.5 rounded-full ${colorState[c.state]}`} />
                      <span className="text-[11px] text-ink-300 font-mono">{c.horas ? c.horas.toFixed(1) : c.falto ? '—' : '·'}</span>
                    </div>
                  </td>
                ))}
                <td className="text-right py-3 font-display font-semibold text-ink-50">{formatHoras(totalHoras)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ============== VISTA MES ==============

function MesView({ empleados, attendance, schedules, condonaciones, turnos, personOverrides, offset }) {
  const mes = useMemo(() => addMonths(startOfMonth(new Date()), offset), [offset])
  const data = useMemo(
    () => tablaMensual({ empleados, attendance, schedules, mes, condonaciones, turnos, personOverrides }),
    [empleados, attendance, schedules, mes, condonaciones, turnos, personOverrides]
  )

  // Totales globales del local
  const totalEmp = data.filas.length
  const totalATiempo = data.filas.reduce((a, f) => a + f.aTiempo, 0)
  const totalTardanzas = data.filas.reduce((a, f) => a + f.tardanzas, 0)
  const totalHorasMes = data.filas.reduce((a, f) => a + f.totalHoras, 0)

  return (
    <>
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h4 className="font-display font-semibold capitalize">{format(mes, 'MMMM yyyy')}</h4>
        <p className="text-xs text-ink-300">
          {totalEmp} empleados · <span className="text-good">{totalATiempo}</span> a tiempo · <span className="text-bad">{totalTardanzas}</span> tarde · {formatHoras(totalHorasMes)} totales
        </p>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="text-xs uppercase tracking-wider text-ink-300 pb-3 font-medium sticky left-0 bg-bg-800/95 z-10 pr-3">Empleado</th>
              {data.dias.map((d, i) => (
                <th key={i} className="text-center text-[10px] uppercase tracking-wider text-ink-300 pb-3 font-medium px-0.5">
                  <div className="font-mono">{format(d, 'dd')}</div>
                </th>
              ))}
              <th className="text-right text-xs uppercase tracking-wider text-ink-300 pb-3 font-medium pl-3 sticky right-0 bg-bg-800/95">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.filas.map(({ empleado, cells, totalHoras, tardanzas }) => (
              <tr key={empleado.id} className="border-t border-white/5 hover:bg-bg-700/30 transition">
                <td className="py-2 sticky left-0 bg-bg-800/95 z-10 pr-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={empleado.fullName} id={empleado.id} size="sm" />
                    <div className="min-w-0">
                      <div className="font-medium text-ink-50 text-sm truncate">{empleado.fullName}</div>
                      <div className="text-[10px] text-ink-300">
                        {tardanzas > 0 && <span className="text-warn">{tardanzas} tarde · </span>}
                        {empleado.position}
                      </div>
                    </div>
                  </div>
                </td>
                {cells.map((c, i) => (
                  <td key={i} className="text-center py-2 px-0.5"
                      title={c.fichaje ? `${formatFechaCorta(c.dayStr)}: ${formatHoras(c.horas || 0)}${c.mins ? ` · +${c.mins}min` : ''}` : c.falto ? 'No fichó' : 'Día libre'}>
                    <span className={`inline-block w-2 h-2 rounded-full ${colorState[c.state]}`} />
                  </td>
                ))}
                <td className="text-right py-2 pl-3 font-display font-semibold text-ink-50 sticky right-0 bg-bg-800/95">
                  {formatHoras(totalHoras)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
