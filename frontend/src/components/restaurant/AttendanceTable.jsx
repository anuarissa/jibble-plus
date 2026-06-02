import { useMemo, useState } from 'react'
import { addDays, format, startOfWeek, addMonths, startOfMonth } from 'date-fns'
import { ChevronLeft, ChevronRight, CalendarDays, Calendar, CalendarRange, Download, FileSpreadsheet } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { tablaSemanal, vistaDia, tablaMensual, celdaToRow, EXPORT_COLUMNS_ASISTENCIA } from '../../utils/stats'
import { formatHoras, formatHora, formatFechaCorta, formatFecha } from '../../utils/format'
import { exportCSV, exportExcel } from '../../utils/export'
import { descargarReporteSemanal } from '../../utils/reporte-semanal'
import { CeldaDetalleModal, MotivoBadge } from './CeldaDetalleModal'
import { EmployeeReportModal } from './EmployeeReportModal'
import { MonthlyReportModal } from './MonthlyReportModal'

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

// Mini-dot lateral para indicar el estado de SALIDA (cuando difiere del estándar).
//   extras → punto azul (#0ea5e9)
//   temprano → punto morado (#a855f7)
//   sinSalida → anillo gris claro
function colorDotSalida(salidaState) {
  if (salidaState === 'extras') return '#0ea5e9'
  if (salidaState === 'temprano') return '#a855f7'
  if (salidaState === 'sinSalida') return '#6b6b73'
  return null
}

// Construye el tooltip enriquecido para una celda
function tooltipCelda(c, fechaLabel) {
  if (c.state === 'idle' && !c.falto) return `${fechaLabel} · Día libre`
  if (c.falto) return `${fechaLabel} · No fichó · Programado ${c.programadoStart}–${c.programadoEnd}`
  if (c.motivoColor === 'diaLibreTrabajado') {
    const partes = [
      fechaLabel,
      'Vino en día libre',
      `Real ${c.fichaje?.clockIn ? formatHora(c.fichaje.clockIn) : '?'} → ${c.fichaje?.clockOut ? formatHora(c.fichaje.clockOut) : 'activo'}`,
      c.horas != null ? `${formatHoras(c.horas)} trabajadas` : null,
    ].filter(Boolean)
    return partes.join(' · ')
  }
  const partes = [
    fechaLabel,
    `Programado ${c.programadoStart}–${c.programadoEnd}`,
    `Real ${c.fichaje?.clockIn ? formatHora(c.fichaje.clockIn) : '?'} → ${c.fichaje?.clockOut ? formatHora(c.fichaje.clockOut) : 'activo'}`,
    c.horas != null ? `${formatHoras(c.horas)} trabajadas` : null,
    c.mins > 0 ? `Tarde +${c.mins}min` : null,
    c.salidaState === 'extras' ? `Quedó +${c.minSalidaDiff}min extras` : null,
    c.salidaState === 'temprano' ? `Salió ${Math.abs(c.minSalidaDiff)}min antes` : null,
    c.salidaState === 'sinSalida' ? `Sin salida (activo)` : null,
  ].filter(Boolean)
  return partes.join(' · ')
}

const EXPORT_COLUMNS = EXPORT_COLUMNS_ASISTENCIA

export function AttendanceTable({ empleados, attendance, schedules, condonaciones, turnos, personOverrides, cfg, group }) {
  const [modo, setModo] = useState('semana')
  const [offset, setOffset] = useState(0) // significado depende del modo
  const [detalle, setDetalle] = useState(null) // { celda, empleado }
  const [reporteEmpId, setReporteEmpId] = useState(null) // empleado para el reporte individual
  const [reporteMensualAbierto, setReporteMensualAbierto] = useState(false)

  function ir(delta) { setOffset(o => o + delta) }
  function hoy() { setOffset(0) }

  const nombreLocal = cfg?.config?.locales?.[group?.id]?.name || group?.name || 'local'

  return (
    <div className="surface p-5 grain">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h3 className="font-display font-semibold text-xl">Asistencia</h3>
          <p className="text-sm text-ink-200 mt-1">Click en celda para detalle/condonar · Click en nombre del empleado para reporte individual</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-bg-700/50 p-1 rounded-xl border border-white/5">
            {MODOS.map(m => (
              <button
                key={m.id}
                onClick={() => { setModo(m.id); setOffset(0) }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition ${
                  modo === m.id ? 'bg-accent text-white shadow-glow' : 'text-ink-200 hover:text-ink-50'
                }`}
              >
                <m.icon size={14} /> {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => ir(-1)} className="btn-ghost p-2"><ChevronLeft size={18} /></button>
            <button onClick={hoy} className="btn-secondary text-sm font-semibold">Hoy</button>
            <button onClick={() => ir(1)} disabled={offset >= 0} className="btn-ghost p-2 disabled:opacity-30"><ChevronRight size={18} /></button>
          </div>
        </div>
      </div>

      {modo === 'dia' && (
        <DiaView empleados={empleados} attendance={attendance} schedules={schedules}
                 condonaciones={condonaciones} turnos={turnos} personOverrides={personOverrides}
                 offset={offset} onCelda={(c, emp) => setDetalle({ celda: c, empleado: emp })}
                 nombreLocal={nombreLocal} />
      )}
      {modo === 'semana' && (
        <SemanaView empleados={empleados} attendance={attendance} schedules={schedules}
                    condonaciones={condonaciones} turnos={turnos} personOverrides={personOverrides}
                    offset={offset} onCelda={(c, emp) => setDetalle({ celda: c, empleado: emp })}
                    onEmpleado={(empId) => setReporteEmpId(empId)}
                    nombreLocal={nombreLocal} cfg={cfg} group={group} />
      )}
      {modo === 'mes' && (
        <MesView empleados={empleados} attendance={attendance} schedules={schedules}
                 condonaciones={condonaciones} turnos={turnos} personOverrides={personOverrides}
                 offset={offset} onCelda={(c, emp) => setDetalle({ celda: c, empleado: emp })}
                 onReporteMensual={() => setReporteMensualAbierto(true)}
                 nombreLocal={nombreLocal} cfg={cfg} group={group} />
      )}

      <div className="flex items-center gap-x-4 gap-y-2 mt-5 pt-4 border-t border-white/5 text-sm text-ink-200 flex-wrap">
        <span className="font-semibold text-ink-100">ENTRADA:</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-good" /> A tiempo</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-warn" /> Tarde &lt;15min</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-bad" /> Tarde 15min+ / falta</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-idle/50" /> Día libre</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#06b6d4' }} /> Vino en día libre</span>
        <span className="font-semibold text-ink-100 ml-2">SALIDA:</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#0ea5e9' }} /> Hizo extras</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#a855f7' }} /> Salió antes</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#6b6b73' }} /> Sin salida</span>
      </div>

      {detalle && (
        <CeldaDetalleModal
          celda={detalle.celda}
          empleado={detalle.empleado}
          cfg={cfg}
          onClose={() => setDetalle(null)}
        />
      )}

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

      {reporteMensualAbierto && cfg && group && (
        <MonthlyReportModal
          empleados={empleados}
          attendance={attendance}
          schedules={schedules}
          cfg={cfg}
          group={group}
          onClose={() => setReporteMensualAbierto(false)}
        />
      )}
    </div>
  )
}

// ============== VISTA DÍA ==============

function DiaView({ empleados, attendance, schedules, condonaciones, turnos, personOverrides, offset, onCelda, nombreLocal }) {
  const dia = useMemo(() => addDays(new Date(), offset), [offset])
  const filas = useMemo(
    () => vistaDia({ empleados, attendance, schedules, dia, condonaciones, turnos, personOverrides }),
    [empleados, attendance, schedules, dia, condonaciones, turnos, personOverrides]
  )

  const exportRows = useMemo(
    () => filas.map(f => celdaToRow(f.empleado, f, nombreLocal)),
    [filas, nombreLocal]
  )
  const fileBase = `asistencia_${nombreLocal.replace(/[^a-z0-9]+/gi, '_')}_dia_${format(dia, 'dd-MM-yyyy')}`

  return (
    <>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h4 className="font-display font-bold capitalize text-lg">{format(dia, 'EEEE dd MMMM yyyy')}</h4>
          <p className="text-sm text-ink-200 mt-1">{filas.filter(f => f.fichaje).length} fichados · {filas.filter(f => f.falto).length} faltaron · {filas.filter(f => f.state === 'idle' && !f.falto).length} día libre</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportCSV(fileBase, exportRows, EXPORT_COLUMNS)} className="btn-secondary text-sm font-semibold"><Download size={15} /> CSV</button>
          <button onClick={() => exportExcel(fileBase, exportRows, EXPORT_COLUMNS, { rowHighlight: r => r?.Estado === 'No fichó' })} className="btn-secondary text-sm font-semibold"><FileSpreadsheet size={15} /> Excel</button>
        </div>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[800px] text-base">
          <thead>
            <tr className="text-left">
              {['Empleado', 'Programado', 'Entrada real', 'Salida real', 'Horas', 'Estado'].map(h => (
                <th key={h} className="text-sm uppercase tracking-wider text-ink-100 pb-3 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => {
              const { empleado, fichaje, programadoStart, programadoEnd, mins, salidaState, minSalidaDiff, falto, horas, turnoCustom, motivoColor } = fila
              return (
                <tr key={empleado.id} className="border-t border-white/10 hover:bg-bg-700/30 transition cursor-pointer" onClick={() => onCelda(fila, empleado)}>
                  <td className="py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={empleado.fullName} id={empleado.id} size="sm" />
                      <div>
                        <div className="text-ink-50 font-semibold text-base">{empleado.fullName}</div>
                        <div className="text-sm text-ink-200">{empleado.position || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 font-mono font-semibold text-ink-50">
                    {programadoStart
                      ? <>
                          {programadoStart}–{programadoEnd}
                          {turnoCustom && <span className="ml-1 badge bg-accent/15 text-accent text-[10px]">turno</span>}
                        </>
                      : <span className="text-ink-400">Día libre</span>}
                  </td>
                  <td className="py-3.5 font-mono font-semibold text-ink-50">
                    {fichaje?.clockIn ? formatHora(fichaje.clockIn) : <span className="text-ink-400">—</span>}
                  </td>
                  <td className="py-3.5 font-mono font-semibold text-ink-50">
                    {fichaje?.clockOut ? formatHora(fichaje.clockOut) : (fichaje ? <span className="text-warn">activo</span> : <span className="text-ink-400">—</span>)}
                  </td>
                  <td className="py-3.5 font-mono font-semibold text-ink-50">{horas != null ? formatHoras(horas) : <span className="text-ink-400">—</span>}</td>
                  <td className="py-3">
                    {falto && <span className="badge bg-bad/15 text-bad">No fichó</span>}
                    {!falto && motivoColor === 'diaLibreTrabajado' && (
                      <span className="badge" style={{ background: 'rgba(6,182,212,0.15)', color: '#22d3ee' }}>Vino en día libre</span>
                    )}
                    {!falto && motivoColor === 'aTiempo' && <span className="badge bg-good/15 text-good">A tiempo</span>}
                    {!falto && (motivoColor === 'tardeEntrada' || motivoColor === 'sinSalida' || motivoColor === 'salidaTemprana' || motivoColor === 'extras') && (
                      <div className="flex flex-col gap-1 items-start">
                        {/* Entrada chip */}
                        {mins > 0 && (
                          <span className={`badge ${mins >= 15 ? 'bg-bad/15 text-bad' : 'bg-warn/15 text-warn'}`}>
                            +{mins}min tarde
                          </span>
                        )}
                        {mins === 0 && motivoColor !== 'falta' && (
                          <span className="badge bg-good/15 text-good">Entrada puntual</span>
                        )}
                        {/* Salida chip */}
                        {salidaState === 'extras' && (
                          <span className="badge bg-accent/15 text-accent-400">+{minSalidaDiff}min extras</span>
                        )}
                        {salidaState === 'temprano' && (
                          <span className="badge bg-warn/15 text-warn">{minSalidaDiff}min antes</span>
                        )}
                        {salidaState === 'sinSalida' && (
                          <span className="badge bg-warn/15 text-warn">Sin salida</span>
                        )}
                      </div>
                    )}
                    {!falto && motivoColor === 'idle' && <span className="text-ink-400 text-xs">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ============== VISTA SEMANA ==============

function SemanaView({ empleados, attendance, schedules, condonaciones, turnos, personOverrides, offset, onCelda, onEmpleado, nombreLocal, cfg, group }) {
  const ini = useMemo(() => addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), offset * 7), [offset])
  const fin = useMemo(() => addDays(ini, 6), [ini])
  const data = useMemo(
    () => tablaSemanal({ empleados, attendance, schedules, ini, condonaciones, turnos, personOverrides }),
    [empleados, attendance, schedules, ini, condonaciones, turnos, personOverrides]
  )
  const dayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  const exportRows = useMemo(() => {
    const out = []
    for (const fila of data.filas) {
      for (const c of fila.cells) {
        out.push(celdaToRow(fila.empleado, c, nombreLocal))
      }
    }
    return out
  }, [data, nombreLocal])
  const fileBase = `asistencia_${nombreLocal.replace(/[^a-z0-9]+/gi, '_')}_sem_${format(ini, 'dd-MM-yyyy')}`

  function generarReporte() {
    descargarReporteSemanal({
      empleados, attendance, schedules, condonaciones, turnos, personOverrides,
      ini, fin, cfg, group,
    })
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-sm font-medium text-ink-200">Semana del {format(ini, 'dd MMM')} al {format(fin, 'dd MMM yyyy')}</p>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => exportCSV(fileBase, exportRows, EXPORT_COLUMNS)} className="btn-secondary text-sm font-semibold"><Download size={15} /> CSV</button>
          <button onClick={() => exportExcel(fileBase, exportRows, EXPORT_COLUMNS, { rowHighlight: r => r?.Estado === 'No fichó' })} className="btn-secondary text-sm font-semibold"><FileSpreadsheet size={15} /> Excel</button>
          {cfg && group && (
            <button onClick={generarReporte} className="btn-primary text-sm font-semibold" title="Excel con 4 hojas: Resumen, Asistencia, Tardanzas y Planilla">
              <FileSpreadsheet size={15} /> Reporte semanal
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="text-left">
              <th className="text-sm uppercase tracking-wider text-ink-100 pb-3 font-bold">Empleado</th>
              {data.dias.map((d, i) => (
                <th key={i} className="text-center text-sm uppercase tracking-wider text-ink-100 pb-3 font-bold">
                  <div>{dayLabels[i]}</div>
                  <div className="text-ink-50 mt-0.5 text-base font-bold">{format(d, 'dd')}</div>
                </th>
              ))}
              <th className="text-right text-sm uppercase tracking-wider text-ink-100 pb-3 font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.filas.map(({ empleado, cells, totalHoras }) => (
              <tr key={empleado.id} className="border-t border-white/10 hover:bg-bg-700/30 transition">
                <td className="py-3.5">
                  <button
                    onClick={() => onEmpleado?.(empleado.id)}
                    className="flex items-center gap-3 text-left hover:opacity-80 transition w-full group"
                    title="Ver reporte individual de esta semana"
                  >
                    <Avatar name={empleado.fullName} id={empleado.id} size="sm" />
                    <div className="min-w-0">
                      <div className="font-semibold text-ink-50 text-base truncate group-hover:text-accent transition">{empleado.fullName}</div>
                      <div className="text-sm text-ink-200">{empleado.position}</div>
                    </div>
                  </button>
                </td>
                {cells.map((c, i) => {
                  const isClickable = c.fichaje || c.falto
                  const dotSalidaColor = colorDotSalida(c.salidaState)
                  const isDiaLibreTrabajado = c.motivoColor === 'diaLibreTrabajado'
                  const fechaLabel = `${dayLabels[i]} ${format(c.day, 'dd MMM')}`
                  return (
                    <td
                      key={i}
                      className={`text-center py-3.5 ${isClickable ? 'cursor-pointer hover:bg-bg-600/30 rounded-md' : ''}`}
                      title={tooltipCelda(c, fechaLabel)}
                      onClick={() => isClickable && onCelda(c, empleado)}
                    >
                      <div className="flex flex-col items-center gap-1.5">
                        <div className="relative">
                          <span
                            className={`block w-3 h-3 rounded-full ${isDiaLibreTrabajado ? '' : colorState[c.state]}`}
                            style={isDiaLibreTrabajado ? { background: '#06b6d4' } : undefined}
                          />
                          {dotSalidaColor && (
                            <span
                              className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-1 ring-bg-800"
                              style={{ background: dotSalidaColor }}
                            />
                          )}
                        </div>
                        <span className="text-sm text-ink-100 font-mono font-semibold">{c.horas ? c.horas.toFixed(1) : c.falto ? '—' : '·'}</span>
                      </div>
                    </td>
                  )
                })}
                <td className="text-right py-3.5 font-display font-bold text-ink-50 text-base">{formatHoras(totalHoras)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ============== VISTA MES ==============

function MesView({ empleados, attendance, schedules, condonaciones, turnos, personOverrides, offset, onCelda, onReporteMensual, nombreLocal, cfg, group }) {
  const mes = useMemo(() => addMonths(startOfMonth(new Date()), offset), [offset])
  const data = useMemo(
    () => tablaMensual({ empleados, attendance, schedules, mes, condonaciones, turnos, personOverrides }),
    [empleados, attendance, schedules, mes, condonaciones, turnos, personOverrides]
  )

  const totalEmp = data.filas.length
  const totalATiempo = data.filas.reduce((a, f) => a + f.aTiempo, 0)
  const totalTardanzas = data.filas.reduce((a, f) => a + f.tardanzas, 0)
  const totalHorasMes = data.filas.reduce((a, f) => a + f.totalHoras, 0)

  const exportRows = useMemo(() => {
    const out = []
    for (const fila of data.filas) {
      for (const c of fila.cells) {
        out.push(celdaToRow(fila.empleado, c, nombreLocal))
      }
    }
    return out
  }, [data, nombreLocal])
  const fileBase = `asistencia_${nombreLocal.replace(/[^a-z0-9]+/gi, '_')}_mes_${format(mes, 'MM-yyyy')}`

  return (
    <>
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h4 className="font-display font-bold capitalize text-lg">{format(mes, 'MMMM yyyy')}</h4>
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-sm text-ink-200">
            {totalEmp} empleados · <span className="text-good font-semibold">{totalATiempo}</span> a tiempo · <span className="text-bad font-semibold">{totalTardanzas}</span> tarde · <span className="font-semibold text-ink-100">{formatHoras(totalHorasMes)}</span> totales
          </p>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => exportCSV(fileBase, exportRows, EXPORT_COLUMNS)} className="btn-secondary text-sm font-semibold"><Download size={15} /> CSV</button>
            <button onClick={() => exportExcel(fileBase, exportRows, EXPORT_COLUMNS, { rowHighlight: r => r?.Estado === 'No fichó' })} className="btn-secondary text-sm font-semibold"><FileSpreadsheet size={15} /> Excel</button>
            {cfg && group && onReporteMensual && (
              <button onClick={onReporteMensual} className="btn-primary text-sm font-semibold" title="Reporte ejecutivo del mes con KPIs, ranking, calendario y PDF imprimible">
                <FileSpreadsheet size={15} /> Reporte mensual
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="text-sm uppercase tracking-wider text-ink-100 pb-3 font-bold sticky left-0 bg-bg-800/95 z-10 pr-3">Empleado</th>
              {data.dias.map((d, i) => (
                <th key={i} className="text-center text-xs uppercase tracking-wider text-ink-100 pb-3 font-bold px-0.5">
                  <div className="font-mono">{format(d, 'dd')}</div>
                </th>
              ))}
              <th className="text-right text-sm uppercase tracking-wider text-ink-100 pb-3 font-bold pl-3 sticky right-0 bg-bg-800/95">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.filas.map(({ empleado, cells, totalHoras, tardanzas }) => (
              <tr key={empleado.id} className="border-t border-white/10 hover:bg-bg-700/30 transition">
                <td className="py-2.5 sticky left-0 bg-bg-800/95 z-10 pr-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={empleado.fullName} id={empleado.id} size="sm" />
                    <div className="min-w-0">
                      <div className="font-semibold text-ink-50 text-base truncate">{empleado.fullName}</div>
                      <div className="text-xs text-ink-200">
                        {tardanzas > 0 && <span className="text-warn font-semibold">{tardanzas} tarde · </span>}
                        {empleado.position}
                      </div>
                    </div>
                  </div>
                </td>
                {cells.map((c, i) => {
                  const isClickable = c.fichaje || c.falto
                  const dotSalidaColor = colorDotSalida(c.salidaState)
                  const isDiaLibreTrabajado = c.motivoColor === 'diaLibreTrabajado'
                  return (
                    <td
                      key={i}
                      className={`text-center py-2 px-0.5 ${isClickable ? 'cursor-pointer' : ''}`}
                      title={tooltipCelda(c, formatFechaCorta(c.dayStr))}
                      onClick={() => isClickable && onCelda(c, empleado)}
                    >
                      <span className="relative inline-block">
                        <span
                          className={`inline-block w-2.5 h-2.5 rounded-full ${isDiaLibreTrabajado ? '' : colorState[c.state]}`}
                          style={isDiaLibreTrabajado ? { background: '#06b6d4' } : undefined}
                        />
                        {dotSalidaColor && (
                          <span
                            className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ring-1 ring-bg-800"
                            style={{ background: dotSalidaColor }}
                          />
                        )}
                      </span>
                    </td>
                  )
                })}
                <td className="text-right py-2.5 pl-3 font-display font-bold text-ink-50 text-base sticky right-0 bg-bg-800/95">
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
