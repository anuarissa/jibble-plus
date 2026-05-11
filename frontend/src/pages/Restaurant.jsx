import { useParams, useNavigate, useLocation, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { ArrowLeft, Calendar, DollarSign, Clock, Users, CalendarDays } from 'lucide-react'
import { useJibble } from '../hooks/useJibble'
import { Skeleton } from '../components/ui/Skeleton'
import { AttendanceTable } from '../components/restaurant/AttendanceTable'
import { PayrollTable } from '../components/restaurant/PayrollTable'
import { LatenessPanel } from '../components/restaurant/LatenessPanel'
import { EmployeeCards } from '../components/restaurant/EmployeeCards'
import { TurnosTable } from '../components/restaurant/TurnosTable'

const TABS = [
  { id: 'asistencia', label: 'Asistencia', icon: Calendar },
  { id: 'turnos', label: 'Turnos', icon: CalendarDays },
  { id: 'planilla', label: 'Planilla', icon: DollarSign },
  { id: 'tardanzas', label: 'Tardanzas', icon: Clock },
  { id: 'empleados', label: 'Empleados', icon: Users },
]

export default function Restaurant({ cfg }) {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const data = useJibble(cfg.personOverrides)
  // tab inicial puede venir del state de navegación (ej: desde Empleados → "Editar turnos")
  const [tab, setTab] = useState(location.state?.tab || 'asistencia')

  useEffect(() => {
    if (location.state?.tab) setTab(location.state.tab)
  }, [location.state])

  if (data.loading) {
    return (
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
        <Skeleton className="h-12 w-1/3 mb-8" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  const group = data.groups?.find(g => g.id === groupId)
  if (!group) return <Navigate to="/" replace />

  const customConfig = cfg.config.locales[groupId]
  const color = customConfig?.color || group.color
  const emoji = customConfig?.emoji || group.emoji
  const name = customConfig?.name || group.name
  const empleados = data.people.filter(p => p.groupId === groupId)

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <button onClick={() => navigate('/')} className="btn-ghost text-sm mb-5 -ml-2">
        <ArrowLeft size={14} /> Dashboard
      </button>

      <header className="flex items-center gap-4 mb-8">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-soft shrink-0"
          style={{ background: `linear-gradient(135deg, ${color}33, ${color}11)`, border: `1px solid ${color}55` }}
        >
          {emoji}
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tightest">{name}</h1>
          <p className="text-sm text-ink-300">{empleados.length} empleados activos</p>
        </div>
      </header>

      <div className="flex gap-1 mb-6 bg-bg-800/60 p-1 rounded-xl border border-white/5 w-fit overflow-x-auto scrollbar-thin">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
              tab === t.id
                ? 'bg-accent text-white shadow-glow'
                : 'text-ink-200 hover:text-ink-50 hover:bg-bg-700'
            }`}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'asistencia' && (
        <AttendanceTable
          empleados={empleados}
          attendance={data.attendance}
          schedules={data.schedules}
          condonaciones={cfg.condonaciones}
          turnos={cfg.turnos}
          personOverrides={cfg.personOverrides}
          cfg={cfg}
          group={group}
        />
      )}
      {tab === 'turnos' && (
        <TurnosTable
          group={group}
          empleados={empleados}
          schedules={data.schedules}
          cfg={cfg}
        />
      )}
      {tab === 'planilla' && (
        <PayrollTable
          group={group}
          empleados={empleados}
          attendance={data.attendance}
          schedules={data.schedules}
          cfg={cfg}
        />
      )}
      {tab === 'tardanzas' && (
        <LatenessPanel
          group={group}
          empleados={empleados}
          attendance={data.attendance}
          schedules={data.schedules}
          cfg={cfg}
        />
      )}
      {tab === 'empleados' && (
        <EmployeeCards
          empleados={empleados}
          attendance={data.attendance}
          schedules={data.schedules}
          cfg={cfg}
          group={group}
        />
      )}
    </div>
  )
}
