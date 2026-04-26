import { useMemo, useState } from 'react'
import { addDays, format, startOfWeek, addMonths, startOfMonth, endOfMonth } from 'date-fns'
import { Check, X, FileText, Clock, Calendar, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Download, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '../ui/Avatar'
import { tardanzasConCondonacion } from '../../utils/stats'
import { formatBs, formatFecha, formatHora } from '../../utils/format'
import { exportCSV, exportExcel } from '../../utils/export'

const MODOS = [
  { id: 'dia', label: 'Día', icon: Calendar },
  { id: 'semana', label: 'Semana', icon: CalendarDays },
  { id: 'mes', label: 'Mes', icon: CalendarRange },
]

export function LatenessPanel({ group, empleados, attendance, schedules, cfg }) {
  const [modalTardanza, setModalTardanza] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [modo, setModo] = useState('semana')
  const [offset, setOffset] = useState(0)

  // Calcular rango según modo + offset
  const { ini, fin, rangoLabel } = useMemo(() => {
    const today = new Date()
    if (modo === 'dia') {
      const d = addDays(today, offset)
      return { ini: d, fin: d, rangoLabel: format(d, 'EEEE dd MMMM yyyy') }
    }
    if (modo === 'mes') {
      const m = addMonths(startOfMonth(today), offset)
      return { ini: startOfMonth(m), fin: endOfMonth(m), rangoLabel: format(m, 'MMMM yyyy') }
    }
    // semana
    const lun = addDays(startOfWeek(today, { weekStartsOn: 1 }), offset * 7)
    const dom = addDays(lun, 6)
    return { ini: lun, fin: dom, rangoLabel: `Semana ${format(lun, 'dd MMM')} – ${format(dom, 'dd MMM')}` }
  }, [modo, offset])

  const tardanzas = useMemo(() => {
    return tardanzasConCondonacion(attendance, schedules, cfg.condonaciones, ini, fin, cfg.turnos, cfg.personOverrides)
      .filter(t => t.groupId === group.id)
      .sort((a, b) => (b.date + ' ' + b.minutosTarde).localeCompare(a.date + ' ' + a.minutosTarde))
  }, [attendance, schedules, cfg.condonaciones, cfg.turnos, cfg.personOverrides, ini, fin, group.id])

  // Contador del mes para mostrar al lado del nombre (siempre del mes actual de la tardanza)
  const conteoMes = useMemo(() => {
    const m1 = startOfMonth(new Date())
    const m2 = endOfMonth(new Date())
    const mensual = tardanzasConCondonacion(attendance, schedules, cfg.condonaciones, m1, m2, cfg.turnos, cfg.personOverrides)
      .filter(t => t.groupId === group.id)
    const counts = {}
    for (const t of mensual) counts[t.personId] = (counts[t.personId] || 0) + 1
    return counts
  }, [attendance, schedules, cfg.condonaciones, cfg.turnos, cfg.personOverrides, group.id])

  // Stats del rango actual
  const stats = useMemo(() => {
    const activas = tardanzas.filter(t => !t.condonada)
    const condonadas = tardanzas.filter(t => t.condonada)
    const totalMinutos = activas.reduce((acc, t) => acc + t.minutosTarde, 0)
    const totalMulta = activas.reduce((acc, t) => acc + t.multa, 0)
    return { activas: activas.length, condonadas: condonadas.length, totalMinutos, totalMulta }
  }, [tardanzas])

  const empById = useMemo(() => Object.fromEntries(empleados.map(e => [e.id, e])), [empleados])
  const nombreLocal = cfg.config.locales[group.id]?.name || group.name

  function abrirModal(t) {
    setModalTardanza(t)
    setMotivo(cfg.condonaciones[t.id]?.motivo || '')
  }
  function confirmarCondonacion() {
    cfg.condonar(modalTardanza.id, motivo.trim())
    toast.success('Tardanza condonada · planilla actualizada')
    setModalTardanza(null)
    setMotivo('')
  }
  function revertir(tardanzaId) {
    cfg.revertirCondonacion(tardanzaId)
    toast.message('Condonación revertida')
  }

  // Export
  const exportRows = useMemo(() => tardanzas.map(t => {
    const emp = empById[t.personId]
    return {
      Fecha: t.date,
      Empleado: emp?.fullName || '',
      Cargo: emp?.position || '',
      Local: nombreLocal,
      Programado: t.scheduledStart || '',
      'Hora real': t.clockIn ? formatHora(t.clockIn) : '',
      'Minutos tarde': t.minutosTarde,
      'Multa Bs': t.multa,
      Estado: t.condonada ? 'CONDONADA' : 'Activa',
      'Motivo condonacion': t.motivoCondonacion || '',
    }
  }), [tardanzas, empById, nombreLocal])

  const exportColumns = [
    { label: 'Fecha', accessor: 'Fecha' },
    { label: 'Empleado', accessor: 'Empleado' },
    { label: 'Cargo', accessor: 'Cargo' },
    { label: 'Local', accessor: 'Local' },
    { label: 'Programado', accessor: 'Programado' },
    { label: 'Hora real', accessor: 'Hora real' },
    { label: 'Minutos tarde', accessor: 'Minutos tarde' },
    { label: 'Multa Bs', accessor: 'Multa Bs' },
    { label: 'Estado', accessor: 'Estado' },
    { label: 'Motivo', accessor: 'Motivo condonacion' },
  ]
  const fileBase = `tardanzas_${nombreLocal.replace(/[^a-z0-9]+/gi, '_')}_${modo}_${format(ini, 'dd-MM-yyyy')}`

  function ir(delta) { setOffset(o => o + delta) }
  function hoy() { setOffset(0) }

  return (
    <>
      <div className="surface p-5 grain">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h3 className="font-display font-semibold text-lg flex items-center gap-2">
              <Clock size={18} className="text-warn" />
              Tardanzas · {rangoLabel}
            </h3>
            <p className="text-xs text-ink-300 mt-0.5">
              <span className="text-bad font-medium">{stats.activas} activas</span>
              {stats.condonadas > 0 && <span> · {stats.condonadas} condonadas</span>}
              {stats.activas > 0 && <span> · {stats.totalMinutos} min total · {formatBs(stats.totalMulta)} en multas</span>}
            </p>
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
            {tardanzas.length > 0 && (
              <>
                <button onClick={() => exportCSV(fileBase, exportRows, exportColumns)} className="btn-secondary text-xs">
                  <Download size={14} /> CSV
                </button>
                <button onClick={() => exportExcel(fileBase, exportRows, exportColumns)} className="btn-secondary text-xs">
                  <FileSpreadsheet size={14} /> Excel
                </button>
              </>
            )}
          </div>
        </div>

        {tardanzas.length === 0 ? (
          <p className="text-center text-ink-200 py-8">No hay tardanzas en este rango. 👌</p>
        ) : (
          <div className="space-y-2">
            {tardanzas.map(t => {
              const emp = empById[t.personId]
              if (!emp) return null
              return (
                <div
                  key={t.id}
                  className={`flex items-center gap-4 p-3 rounded-xl border transition ${
                    t.condonada
                      ? 'bg-bg-700/30 border-white/5 opacity-60'
                      : t.severidad === 'bad'
                        ? 'bg-bad/5 border-bad/20'
                        : 'bg-warn/5 border-warn/20'
                  }`}
                >
                  <Avatar name={emp.fullName} id={emp.id} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink-50 truncate">{emp.fullName}</span>
                      {t.condonada && <span className="badge bg-good/15 text-good text-[10px]">CONDONADA</span>}
                    </div>
                    <div className="text-xs text-ink-300">
                      {formatFecha(t.date)} · Programado {t.scheduledStart} · Real {formatHora(t.clockIn)}
                      {conteoMes[t.personId] && (
                        <span className="ml-2 text-ink-400">
                          · {conteoMes[t.personId]} este mes
                        </span>
                      )}
                    </div>
                    {t.motivoCondonacion && (
                      <div className="text-xs text-good mt-1 italic">"{t.motivoCondonacion}"</div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-display font-bold text-lg ${t.severidad === 'bad' ? 'text-bad' : 'text-warn'}`}>
                      +{t.minutosTarde}min
                    </div>
                    <div className={`text-xs ${t.condonada ? 'line-through text-ink-400' : 'text-bad'}`}>
                      {formatBs(t.multa)}
                    </div>
                  </div>
                  {t.condonada ? (
                    <button onClick={() => revertir(t.id)} className="btn-ghost text-xs">
                      Revertir
                    </button>
                  ) : (
                    <button onClick={() => abrirModal(t)} className="btn-secondary text-xs">
                      <Check size={14} /> Condonar
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modalTardanza && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setModalTardanza(null)}>
          <div className="surface-elevated p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText size={20} className="text-accent" />
                <h4 className="font-display font-semibold text-lg">Condonar tardanza</h4>
              </div>
              <button onClick={() => setModalTardanza(null)} className="btn-ghost p-1.5"><X size={16} /></button>
            </div>
            <div className="bg-bg-700/40 rounded-xl p-3 mb-4 text-sm">
              <div className="text-ink-50 font-medium">{empById[modalTardanza.personId]?.fullName}</div>
              <div className="text-xs text-ink-300 mt-0.5">
                {formatFecha(modalTardanza.date)} · {modalTardanza.minutosTarde} min tarde · multa {formatBs(modalTardanza.multa)}
              </div>
            </div>
            <label className="block text-sm text-ink-200 mb-2">Motivo (opcional)</label>
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ej: Justificó con receta médica, problema de transporte público, etc."
              className="input min-h-[80px] resize-none"
            />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setModalTardanza(null)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={confirmarCondonacion} className="btn-primary flex-1">
                <Check size={14} /> Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
