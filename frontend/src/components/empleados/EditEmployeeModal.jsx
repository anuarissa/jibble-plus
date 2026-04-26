import { useEffect, useState } from 'react'
import { X, Save, EyeOff, Trash2, Calendar, DollarSign, Tag } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '../ui/Avatar'
import { formatBs } from '../../utils/format'
import { EMPLOYEE_OVERRIDES } from '../../config/employees'

const DAYS = [
  { dow: 1, label: 'Lun' },
  { dow: 2, label: 'Mar' },
  { dow: 3, label: 'Mié' },
  { dow: 4, label: 'Jue' },
  { dow: 5, label: 'Vie' },
  { dow: 6, label: 'Sáb' },
  { dow: 7, label: 'Dom' },
]

export function EditEmployeeModal({ persona, groups, locales, cfg, onClose }) {
  const personId = persona.id
  const userOv = cfg.personOverrides[personId] || {}
  const hardOv = EMPLOYEE_OVERRIDES[personId] || {}
  const tarifaActual = cfg.getTarifaResolved(personId)
  const isHardForced = !!(hardOv.groupId || hardOv.schedule)

  // Estado local del form (se commitea al guardar)
  const [cargo, setCargo] = useState(userOv.cargo ?? hardOv.cargo ?? persona.position ?? '')
  const [groupId, setGroupId] = useState(userOv.groupId ?? hardOv.groupId ?? persona.groupId ?? '')
  const [tarifa, setTarifa] = useState(String(tarifaActual))
  const [sueldoMensual, setSueldoMensual] = useState(String(userOv.sueldoMensual ?? hardOv.sueldoMensual ?? ''))

  const baseSched = userOv.schedule ?? hardOv.schedule ?? {
    startTime: '09:00',
    endTime: '18:00',
    daysOfWeek: [1, 2, 3, 4, 5, 6],
    expectedHoursPerDay: 8,
    expectedHoursPerWeek: 48,
  }
  const [startTime, setStartTime] = useState(baseSched.startTime)
  const [endTime, setEndTime] = useState(baseSched.endTime)
  const [daysOfWeek, setDaysOfWeek] = useState(baseSched.daysOfWeek || [1, 2, 3, 4, 5])

  // Cuando cambia sueldo mensual, sugerimos tarifa = sueldo / (30 × horasDia)
  useEffect(() => {
    const sm = parseFloat(sueldoMensual)
    if (!isNaN(sm) && sm > 0) {
      const horasDia = horasDiaCalc(startTime, endTime) || 8
      const sugerida = sm / (30 * horasDia)
      setTarifa(sugerida.toFixed(2))
    }
  }, [sueldoMensual, startTime, endTime])

  function toggleDay(dow) {
    setDaysOfWeek(prev =>
      prev.includes(dow) ? prev.filter(d => d !== dow) : [...prev, dow].sort()
    )
  }

  function handleSave() {
    const horasDia = horasDiaCalc(startTime, endTime) || 8
    const expectedHoursPerWeek = horasDia * daysOfWeek.length

    const patch = {
      cargo: cargo.trim() || null,
      groupId: groupId || null,
      tarifa: parseFloat(tarifa) || 0,
      sueldoMensual: parseFloat(sueldoMensual) || null,
      schedule: {
        startTime,
        endTime,
        daysOfWeek,
        expectedHoursPerDay: horasDia,
        expectedHoursPerWeek,
      },
    }
    cfg.setPersonData(personId, patch)
    toast.success(`Datos de ${persona.fullName} guardados`)
    onClose()
  }

  function handleHide() {
    if (!confirm(`¿Ocultar a ${persona.fullName} de la app? Se puede revertir desde la sección "Ocultos".`)) return
    cfg.setPersonHidden(personId, true)
    toast.message(`${persona.fullName} ocultado`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-auto" onClick={onClose}>
      <div className="surface-elevated p-6 max-w-2xl w-full my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <Avatar name={persona.fullName} id={persona.id} size="lg" />
            <div>
              <h3 className="font-display font-bold text-xl">{persona.fullName}</h3>
              <p className="text-xs text-ink-300">{persona.email || 'sin email'}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>

        {isHardForced && (
          <div className="bg-accent/10 border border-accent/30 rounded-xl p-3 mb-5 text-xs text-accent-400">
            ⚠️ Esta persona tiene overrides forzados por código (Leisy/Alejandra). Lo que edites aquí prevalece sobre lo hardcodeado.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <Field label="Cargo" icon={<Tag size={14} />}>
            <input type="text" value={cargo} onChange={e => setCargo(e.target.value)} placeholder="Ej: Cajero, Cocinero" className="input" />
          </Field>
          <Field label="Local">
            <select value={groupId} onChange={e => setGroupId(e.target.value)} className="input">
              <option value="">— Sin asignar —</option>
              {groups?.map(g => (
                <option key={g.id} value={g.id}>{locales[g.id]?.name || g.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Sueldo mensual objetivo (Bs)" icon={<DollarSign size={14} />} help="Si lo llenas, calculo la tarifa automáticamente con sueldo / (30 × horas/día).">
            <input type="number" value={sueldoMensual} onChange={e => setSueldoMensual(e.target.value)} placeholder="3300" className="input" />
          </Field>
          <Field label="Tarifa Bs/hora" help={`Calculada: ${formatBs(parseFloat(tarifa) || 0)}/h`}>
            <input type="number" step="0.01" value={tarifa} onChange={e => setTarifa(e.target.value)} className="input" />
          </Field>
        </div>

        <div className="border-t border-white/5 pt-5 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={14} className="text-accent" />
            <h4 className="font-display font-semibold">Horario base</h4>
            <span className="text-xs text-ink-300">(se aplica si no hay turno específico para esa semana)</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="Entrada">
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="input" />
            </Field>
            <Field label="Salida">
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="input" />
            </Field>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-ink-300 block mb-2">Días que trabaja</span>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map(d => {
                const active = daysOfWeek.includes(d.dow)
                return (
                  <button
                    key={d.dow}
                    type="button"
                    onClick={() => toggleDay(d.dow)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      active ? 'bg-accent text-white shadow-glow' : 'bg-bg-700 text-ink-200 hover:bg-bg-600'
                    }`}
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-ink-400 mt-2">
              {daysOfWeek.length} días/semana × {(horasDiaCalc(startTime, endTime) || 0).toFixed(1)}h = <strong>{(daysOfWeek.length * (horasDiaCalc(startTime, endTime) || 0)).toFixed(1)}h/semana</strong>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-between">
          <button onClick={handleHide} className="btn-secondary text-sm border-bad/30 text-bad hover:bg-bad/10">
            <EyeOff size={14} /> Ocultar empleado
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary">Cancelar</button>
            <button onClick={handleSave} className="btn-primary">
              <Save size={14} /> Guardar cambios
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, icon, help, children }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-ink-300 flex items-center gap-1 mb-1">
        {icon} {label}
      </span>
      {children}
      {help && <span className="text-xs text-ink-400 block mt-1">{help}</span>}
    </label>
  )
}

function horasDiaCalc(startTime, endTime) {
  if (!startTime || !endTime) return 0
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  const minutes = (eh * 60 + em) - (sh * 60 + sm)
  return minutes > 0 ? minutes / 60 : 0
}
