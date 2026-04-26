import { useNavigate } from 'react-router-dom'
import { Users, Clock, TrendingUp, ChevronRight } from 'lucide-react'
import { formatBs, formatHoras } from '../../utils/format'

export function RestaurantCard({ group, customConfig, stats }) {
  const navigate = useNavigate()
  const color = customConfig?.color || group.color || '#ff6b35'
  const emoji = customConfig?.emoji || group.emoji || '🍴'
  const name = customConfig?.name || group.name

  const semaforo = stats?.puntualidad >= 90 ? 'good' : stats?.puntualidad >= 75 ? 'warn' : 'bad'
  const semaforoBg = { good: 'bg-good', warn: 'bg-warn', bad: 'bg-bad' }[semaforo]
  const semaforoText = { good: 'text-good', warn: 'text-warn', bad: 'text-bad' }[semaforo]

  return (
    <button
      onClick={() => navigate(`/restaurante/${group.id}`)}
      className="surface relative overflow-hidden group text-left p-6 hover:border-white/10 transition-all duration-300 ease-spring hover:scale-[1.01] active:scale-[0.99] grain"
      style={{
        boxShadow: `0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 32px -16px ${color}44, 0 1px 2px rgba(0,0,0,0.4)`,
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-1 opacity-80"
        style={{ background: `linear-gradient(90deg, ${color}, ${color}66)` }}
      />
      <div
        className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-10 blur-3xl"
        style={{ background: color }}
      />

      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
            style={{ background: `${color}25`, border: `1px solid ${color}55` }}
          >
            {emoji}
          </div>
          <div>
            <h3 className="font-display font-semibold text-lg text-ink-50 leading-tight">{name}</h3>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`w-1.5 h-1.5 rounded-full ${semaforoBg} animate-pulse`} />
              <span className={`text-xs font-medium ${semaforoText}`}>{stats?.puntualidad ?? 0}% puntualidad</span>
            </div>
          </div>
        </div>
        <ChevronRight size={18} className="text-ink-300 group-hover:text-ink-50 group-hover:translate-x-0.5 transition" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat
          icon={<Users size={14} />}
          label="Fichados ahora"
          value={
            <span className="text-2xl font-display font-bold tracking-tight" style={{ color }}>
              {stats?.fichados ?? 0}
              <span className="text-sm text-ink-300 font-sans font-normal">/{stats?.totalEmpleados ?? 0}</span>
            </span>
          }
        />
        <Stat
          icon={<Clock size={14} />}
          label="Horas semana"
          value={<span className="text-2xl font-display font-bold tracking-tight">{formatHoras(stats?.horasSemana ?? 0)}</span>}
        />
        <Stat
          icon={<TrendingUp size={14} />}
          label="Planilla est."
          value={<span className="text-base font-display font-bold tracking-tight">{formatBs(stats?.planillaSemana ?? 0)}</span>}
          full
        />
      </div>
    </button>
  )
}

function Stat({ icon, label, value, full }) {
  return (
    <div className={`bg-bg-700/40 rounded-xl p-3 ${full ? 'col-span-2' : ''}`}>
      <div className="flex items-center gap-1.5 text-xs text-ink-300 mb-1">
        {icon} {label}
      </div>
      <div className="text-ink-50">{value}</div>
    </div>
  )
}
