import { useMemo, useState } from 'react'
import { addDays, startOfWeek, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import { Check, X, FileText, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '../ui/Avatar'
import { tardanzasConCondonacion } from '../../utils/stats'
import { formatBs, formatFecha, formatHora } from '../../utils/format'

export function LatenessPanel({ group, empleados, attendance, schedules, cfg }) {
  const [modalTardanza, setModalTardanza] = useState(null)
  const [motivo, setMotivo] = useState('')

  const ini = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), [])
  const fin = useMemo(() => addDays(ini, 6), [ini])

  const tardanzas = useMemo(() => {
    return tardanzasConCondonacion(attendance, schedules, cfg.condonaciones, ini, fin, cfg.turnos, cfg.personOverrides)
      .filter(t => t.groupId === group.id)
      .sort((a, b) => b.minutosTarde - a.minutosTarde)
  }, [attendance, schedules, cfg.condonaciones, cfg.turnos, cfg.personOverrides, ini, fin, group.id])

  // Contador mensual por empleado
  const mes = useMemo(() => {
    const m1 = startOfMonth(new Date())
    const m2 = endOfMonth(new Date())
    const mensual = tardanzasConCondonacion(attendance, schedules, cfg.condonaciones, m1, m2, cfg.turnos, cfg.personOverrides)
      .filter(t => t.groupId === group.id)
    const counts = {}
    for (const t of mensual) {
      counts[t.personId] = (counts[t.personId] || 0) + 1
    }
    return counts
  }, [attendance, schedules, cfg.condonaciones, cfg.turnos, group.id])

  const empById = useMemo(() => Object.fromEntries(empleados.map(e => [e.id, e])), [empleados])

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

  return (
    <>
      <div className="surface p-5 grain">
        <div className="mb-5">
          <h3 className="font-display font-semibold text-lg flex items-center gap-2">
            <Clock size={18} className="text-warn" />
            Tardanzas de la semana
          </h3>
          <p className="text-xs text-ink-300 mt-0.5">
            Multa: 10 Bs por cada bloque de 5 min · {tardanzas.filter(t => !t.condonada).length} activas, {tardanzas.filter(t => t.condonada).length} condonadas
          </p>
        </div>

        {tardanzas.length === 0 ? (
          <p className="text-center text-ink-200 py-8">No hay tardanzas esta semana. 👌</p>
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
                      {mes[t.personId] && (
                        <span className="ml-2 text-ink-400">
                          · {mes[t.personId]} tardanzas este mes
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
