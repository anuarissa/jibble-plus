import { useState } from 'react'
import { X, Check, Clock, LogIn, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '../ui/Avatar'
import { formatBs, formatFecha, formatHora, formatHoras } from '../../utils/format'
import { calcularMulta } from '../../utils/lateness'

// Modal que muestra el detalle de una celda (un día específico de un empleado).
// Recibe la fila/celda procesada por resolverDia y el empleado.
// Permite condonar tardanza si aplica.
export function CeldaDetalleModal({ celda, empleado, cfg, onClose }) {
  const [motivo, setMotivo] = useState('')
  if (!celda || !empleado) return null

  const {
    dayStr, fichaje, falto, programadoStart, programadoEnd,
    mins, salidaState, minSalidaDiff, horas, motivoColor, registroIncompleto,
  } = celda

  const condonacionExistente = fichaje && cfg.condonaciones?.[fichaje.id]
  const yaCondonada = !!condonacionExistente?.condonada
  const puedeCondonar = mins > 0 && !yaCondonada
  const multa = mins > 0 ? calcularMulta(mins) : 0

  function condonar() {
    if (!fichaje?.id) return
    cfg.condonar(fichaje.id, motivo.trim())
    toast.success('Tardanza condonada · planilla actualizada')
    onClose()
  }
  function revertir() {
    if (!fichaje?.id) return
    cfg.revertirCondonacion(fichaje.id)
    toast.message('Condonación revertida')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-auto" onClick={onClose}>
      <div className="surface-elevated p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <Avatar name={empleado.fullName} id={empleado.id} size="lg" />
            <div>
              <h3 className="font-display font-bold text-lg">{empleado.fullName}</h3>
              <p className="text-xs text-ink-300 capitalize">{formatFecha(dayStr)}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>

        {/* Estado principal */}
        <div className="mb-4">
          <MotivoBadge motivo={motivoColor} mins={mins} salidaDiff={minSalidaDiff} salidaState={salidaState} grande />
          {yaCondonada && (
            <div className="mt-2">
              <span className="badge bg-good/15 text-good text-xs">CONDONADA</span>
              {condonacionExistente?.motivo && (
                <p className="text-xs text-good/80 italic mt-1">"{condonacionExistente.motivo}"</p>
              )}
            </div>
          )}
        </div>

        {/* Detalle entrada/salida */}
        <div className="bg-bg-700/40 rounded-xl p-4 space-y-3 mb-4">
          {falto ? (
            <div className="text-center py-2">
              <p className="text-bad font-medium">No fichó este día</p>
              <p className="text-xs text-ink-300 mt-1">Programado: {programadoStart}–{programadoEnd}</p>
            </div>
          ) : (
            <>
              <FilaTiempo
                icon={<LogIn size={14} />}
                label="Entrada"
                programado={programadoStart}
                real={fichaje?.clockIn ? formatHora(fichaje.clockIn) : null}
                diff={mins > 0 ? `+${mins}min tarde` : 'puntual'}
                diffColor={mins >= 15 ? 'bad' : mins > 0 ? 'warn' : 'good'}
              />
              <FilaTiempo
                icon={<LogOut size={14} />}
                label="Salida"
                programado={programadoEnd}
                real={fichaje?.clockOut ? formatHora(fichaje.clockOut) : (fichaje?.clockIn ? '(activo)' : null)}
                diff={
                  salidaState === 'sinSalida' ? 'sin fichar salida' :
                  salidaState === 'extras' ? `+${minSalidaDiff}min extras` :
                  salidaState === 'temprano' ? `${minSalidaDiff}min antes` :
                  salidaState === 'aTiempo' ? 'puntual' : null
                }
                diffColor={
                  salidaState === 'extras' ? 'accent' :
                  salidaState === 'temprano' ? 'warn' :
                  salidaState === 'sinSalida' ? 'warn' :
                  'good'
                }
              />
              <div className="pt-2 border-t border-white/5 flex items-center justify-between text-sm">
                <span className="text-ink-300 flex items-center gap-1.5"><Clock size={12} /> Horas trabajadas</span>
                <span className="font-display font-semibold text-ink-50">{horas != null ? formatHoras(horas) : '—'}</span>
              </div>
              {mins > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-300">Multa por tardanza</span>
                  <span className={yaCondonada ? 'line-through text-ink-400' : 'text-bad font-display'}>−{formatBs(multa)}</span>
                </div>
              )}
              {registroIncompleto && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-bad flex items-center gap-1.5">
                    ⚠ {salidaState === 'sinSalida' ? 'No marcó salida' : 'No marcó ingreso'}
                  </span>
                  <span className="text-bad font-display">−{formatBs(20)}</span>
                </div>
              )}
            </>
          )}
        </div>
        {registroIncompleto && (
          <div className="mb-4 -mt-1 text-xs text-bad/90 bg-bad/10 rounded-lg px-3 py-2">
            Descuento de 20 Bs por registro incompleto. Las horas de este día se pagan según el horario programado.
          </div>
        )}

        {/* Acciones de condonación */}
        {!falto && puedeCondonar && (
          <>
            <label className="block text-xs uppercase tracking-wider text-ink-300 mb-1.5">Motivo de condonación (opcional)</label>
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ej: Cubrió a Pedro, cita médica justificada..."
              className="input min-h-[60px] resize-none text-sm"
            />
            <div className="flex gap-2 mt-3">
              <button onClick={onClose} className="btn-secondary flex-1">Cerrar</button>
              <button onClick={condonar} className="btn-primary flex-1">
                <Check size={14} /> Condonar tardanza
              </button>
            </div>
          </>
        )}
        {!falto && yaCondonada && (
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary flex-1">Cerrar</button>
            <button onClick={revertir} className="btn-secondary border-bad/30 text-bad hover:bg-bad/10">
              Revertir condonación
            </button>
          </div>
        )}
        {(falto || (!puedeCondonar && !yaCondonada)) && (
          <button onClick={onClose} className="btn-secondary w-full">Cerrar</button>
        )}
      </div>
    </div>
  )
}

function FilaTiempo({ icon, label, programado, real, diff, diffColor }) {
  const colorMap = {
    good: 'text-good',
    warn: 'text-warn',
    bad: 'text-bad',
    accent: 'text-accent-400',
  }
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-300 flex items-center gap-1.5">{icon} {label}</span>
      <div className="text-right">
        <div className="font-mono text-ink-100">
          <span className="text-ink-400">{programado || '—'}</span>
          <span className="mx-1.5 text-ink-500">→</span>
          <span className={real ? 'text-ink-50' : 'text-ink-400'}>{real || '—'}</span>
        </div>
        {diff && <div className={`text-[11px] mt-0.5 ${colorMap[diffColor] || 'text-ink-300'}`}>{diff}</div>}
      </div>
    </div>
  )
}

// Badge grande del motivo principal
export function MotivoBadge({ motivo, mins, salidaDiff, salidaState, grande = false }) {
  const map = {
    aTiempo: { label: 'A tiempo', cls: 'bg-good/15 text-good' },
    tardeEntrada: { label: `+${mins}min tarde`, cls: mins >= 15 ? 'bg-bad/15 text-bad' : 'bg-warn/15 text-warn' },
    salidaTemprana: { label: `Salió ${Math.abs(salidaDiff || 0)}min antes`, cls: 'bg-warn/15 text-warn' },
    extras: { label: `+${salidaDiff || 0}min extras`, cls: 'bg-accent/15 text-accent-400' },
    sinSalida: { label: 'Sin salida (activo)', cls: 'bg-warn/15 text-warn' },
    falta: { label: 'No fichó', cls: 'bg-bad/15 text-bad' },
    diaLibreTrabajado: { label: 'Vino en día libre', cls: '', style: { background: 'rgba(6,182,212,0.15)', color: '#22d3ee' } },
  }
  const item = map[motivo] || map.aTiempo
  return (
    <span
      className={`inline-block ${grande ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs'} rounded-full font-medium ${item.cls}`}
      style={item.style}
    >
      {item.label}
    </span>
  )
}
