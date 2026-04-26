import { Users, Clock, Wallet, Target } from 'lucide-react'
import { formatBs, formatHoras } from '../../utils/format'

export function GlobalStats({ totalEmpleados, horasSemana, planillaSemana, puntualidadGlobal }) {
  const items = [
    { icon: <Users size={18} />, label: 'Empleados totales', value: totalEmpleados, color: '#0ea5e9' },
    { icon: <Clock size={18} />, label: 'Horas esta semana', value: formatHoras(horasSemana), color: '#a855f7' },
    { icon: <Wallet size={18} />, label: 'Planilla estimada', value: formatBs(planillaSemana), color: '#ff6b35' },
    { icon: <Target size={18} />, label: 'Puntualidad global', value: `${puntualidadGlobal}%`, color: puntualidadGlobal >= 90 ? '#22c55e' : puntualidadGlobal >= 75 ? '#f59e0b' : '#ef4444' },
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((it) => (
        <div
          key={it.label}
          className="surface p-5 grain relative overflow-hidden"
        >
          <div
            className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10 blur-2xl"
            style={{ background: it.color }}
          />
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
            style={{ background: `${it.color}22`, color: it.color }}
          >
            {it.icon}
          </div>
          <div className="text-xs uppercase tracking-wider text-ink-300 mb-1">{it.label}</div>
          <div className="text-2xl font-display font-bold tracking-tightest text-ink-50">{it.value}</div>
        </div>
      ))}
    </div>
  )
}
