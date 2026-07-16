import { useMemo } from 'react'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'
import { Trophy, TrendingUp, Clock, Award } from 'lucide-react'
import { addDays, startOfWeek, format } from 'date-fns'
import { useJibble } from '../hooks/useJibble'
import { Skeleton } from '../components/ui/Skeleton'
import { statsRestaurante, attendanceEnRango, tardanzasConCondonacion } from '../utils/stats'
import { formatBs, formatHoras } from '../utils/format'

const TOOLTIP_STYLE = {
  background: '#1a1a1f',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  color: '#fafafa',
  fontSize: 12,
}

export default function Comparison({ cfg }) {
  const data = useJibble(cfg.personOverrides, cfg.config.locales)
  const ready = !data.loading && data.groups

  const stats = useMemo(() => {
    if (!ready) return null
    const tarifasResolved = Object.fromEntries(data.people.map(p => [p.id, cfg.getTarifaResolved(p.id)]))
    return data.groups.map(g => {
      const s = statsRestaurante({
        group: g, people: data.people, attendance: data.attendance,
        schedules: data.schedules, active: data.active,
        tarifas: tarifasResolved, condonaciones: cfg.condonaciones, settings: cfg.config.settings,
        turnos: cfg.turnos,
        personOverrides: cfg.personOverrides,
      })
      const customConfig = cfg.config.locales[g.id]
      return {
        ...s,
        groupId: g.id,
        name: customConfig?.name || g.name,
        color: customConfig?.color || g.color,
        emoji: customConfig?.emoji || g.emoji,
      }
    })
  }, [ready, data, cfg.tarifas, cfg.condonaciones, cfg.config])

  // Puntualidad últimas 4 semanas — gráfico de líneas
  const lineData = useMemo(() => {
    if (!ready) return []
    const semanas = []
    for (let w = -3; w <= 0; w++) {
      const ini = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), w * 7)
      const fin = addDays(ini, 6)
      const semana = attendanceEnRango(data.attendance, ini, fin)
      const tardanzas = tardanzasConCondonacion(data.attendance, data.schedules, cfg.condonaciones, ini, fin, cfg.turnos, cfg.personOverrides)
      const row = { semana: `S${w >= 0 ? '0' : w}` === 'S00' ? 'Esta' : `Sem ${w}`, _ini: ini }
      for (const g of data.groups) {
        const fLocal = semana.filter(a => a.groupId === g.id).length
        const tLocal = tardanzas.filter(t => t.groupId === g.id && !t.condonada).length
        row[g.id] = fLocal > 0 ? Math.round(((fLocal - tLocal) / fLocal) * 100) : 100
      }
      semanas.push(row)
    }
    return semanas
  }, [ready, data, cfg.condonaciones])

  if (!ready || !stats) {
    return <div className="p-8 max-w-[1400px] mx-auto"><Skeleton className="h-96" /></div>
  }

  const ranking = [...stats].sort((a, b) => b.puntualidad - a.puntualidad)
  const masHoras = [...stats].sort((a, b) => b.horasSemana - a.horasSemana)[0]
  const menosTardanzas = [...stats].sort((a, b) => a.tardanzasActivas - b.tardanzasActivas)[0]

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <header className="mb-8">
        <h1 className="text-4xl font-display font-bold tracking-tightest mb-1">Comparativo</h1>
        <p className="text-sm text-ink-300">Tus {data.groups.length} locales lado a lado · esta semana</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Chart title="Horas trabajadas por local" subtitle="Esta semana">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="#a1a1aa" tick={{ fontSize: 11 }} />
              <YAxis stroke="#a1a1aa" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => formatHoras(v)} />
              <Bar dataKey="horasSemana" radius={[8, 8, 0, 0]}>
                {stats.map(s => <Cell key={s.groupId} fill={s.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Chart>

        <Chart title="Planilla estimada por local" subtitle="Esta semana">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="#a1a1aa" tick={{ fontSize: 11 }} />
              <YAxis stroke="#a1a1aa" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => formatBs(v)} />
              <Bar dataKey="planillaSemana" radius={[8, 8, 0, 0]}>
                {stats.map(s => <Cell key={s.groupId} fill={s.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Chart>
      </div>

      <Chart title="Puntualidad últimas 4 semanas" subtitle="% de fichajes a tiempo" className="mb-6">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={lineData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="semana" stroke="#a1a1aa" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} stroke="#a1a1aa" tick={{ fontSize: 11 }} unit="%" />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {data.groups.map(g => (
              <Line
                key={g.id}
                type="monotone"
                dataKey={g.id}
                name={cfg.config.locales[g.id]?.name || g.name}
                stroke={cfg.config.locales[g.id]?.color || g.color}
                strokeWidth={2.5}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Chart>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="surface p-5 grain">
          <h3 className="font-display font-semibold flex items-center gap-2 mb-4">
            <Trophy size={18} className="text-accent" /> Ranking de puntualidad
          </h3>
          <div className="space-y-2">
            {ranking.map((s, i) => (
              <div key={s.groupId} className="flex items-center gap-3 p-3 rounded-xl bg-bg-700/40">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold ${
                  i === 0 ? 'bg-accent text-white' : 'bg-bg-600 text-ink-200'
                }`}>{i + 1}</div>
                <span className="text-2xl">{s.emoji}</span>
                <div className="flex-1 font-medium">{s.name}</div>
                <div className="font-display font-bold text-lg" style={{ color: s.color }}>{s.puntualidad}%</div>
              </div>
            ))}
          </div>
        </div>

        <div className="surface p-5 grain">
          <h3 className="font-display font-semibold flex items-center gap-2 mb-4">
            <Award size={18} className="text-accent" /> Récords
          </h3>
          <div className="space-y-3">
            <RecordRow icon={<Clock size={14} />} label="Más horas trabajadas" value={masHoras?.name} detail={formatHoras(masHoras?.horasSemana)} color={masHoras?.color} />
            <RecordRow icon={<TrendingUp size={14} />} label="Menos tardanzas" value={menosTardanzas?.name} detail={`${menosTardanzas?.tardanzasActivas} esta semana`} color={menosTardanzas?.color} />
            <RecordRow icon={<Trophy size={14} />} label="Mayor puntualidad" value={ranking[0]?.name} detail={`${ranking[0]?.puntualidad}%`} color={ranking[0]?.color} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Chart({ title, subtitle, children, className = '' }) {
  return (
    <div className={`surface p-5 grain ${className}`}>
      <div className="mb-4">
        <h3 className="font-display font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-ink-300 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function RecordRow({ icon, label, value, detail, color }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-bg-700/40">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}22`, color }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-ink-300">{label}</div>
        <div className="font-medium text-ink-50 truncate">{value}</div>
      </div>
      <div className="text-sm font-display text-ink-100">{detail}</div>
    </div>
  )
}
