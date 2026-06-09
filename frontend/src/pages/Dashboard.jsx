import { useJibble } from '../hooks/useJibble'
import { useAlerts } from '../hooks/useAlerts'
import { useActiveWorkspace } from '../hooks/useActiveWorkspace'
import { GlobalStats } from '../components/dashboard/GlobalStats'
import { RestaurantCard } from '../components/dashboard/RestaurantCard'
import { AlertsPanel } from '../components/dashboard/AlertsPanel'
import { WorkspaceSwitcher } from '../components/WorkspaceSwitcher'
import { Skeleton } from '../components/ui/Skeleton'
import { statsRestaurante, statsGlobales } from '../utils/stats'
import { RefreshCw } from 'lucide-react'
import { format } from 'date-fns'

export default function Dashboard({ cfg }) {
  const ws = useActiveWorkspace()
  const data = useJibble(cfg.personOverrides)
  const alerts = useAlerts({
    active: data.active,
    schedules: data.schedules,
    people: data.people,
    attendance: data.attendance,
  })

  const ready = !data.loading && data.groups && data.people && data.schedules && data.attendance

  const ctx = ready
    ? {
        groups: data.groups,
        people: data.people,
        attendance: data.attendance,
        schedules: data.schedules,
        active: data.active,
        // Resolver tarifas con overrides + default antes de pasar al stats engine
        tarifas: Object.fromEntries(data.people.map(p => [p.id, cfg.getTarifaResolved(p.id)])),
        condonaciones: cfg.condonaciones,
        settings: cfg.config.settings,
        turnos: cfg.turnos,
        personOverrides: cfg.personOverrides,
      }
    : null

  const globalStats = ctx ? statsGlobales(ctx) : null

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <header className="flex items-end justify-between mb-8 flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-ink-300 mb-1">
            {format(new Date(), 'EEEE, dd MMM yyyy')}
          </div>
          <h1 className="text-4xl font-display font-bold tracking-tightest">Panel de control</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <WorkspaceSwitcher workspaces={ws.workspaces} active={ws.active} onChange={ws.setActive} />
          <span className="text-xs text-ink-300">
            {data.health?.mode === 'live' ? '🟢 Datos reales' : '🟡 Modo demo'}
          </span>
          <button onClick={data.refetch} className="btn-ghost text-sm" disabled={data.loading}>
            <RefreshCw size={14} className={data.loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </header>

      {!ready && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-56" />)}
          </div>
        </>
      )}

      {ready && (
        <>
          <div className="mb-8">
            <GlobalStats {...globalStats} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
            <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-fr">
              {data.groups.map(g => {
                const stats = statsRestaurante({ group: g, ...ctx })
                return (
                  <RestaurantCard
                    key={g.id}
                    group={g}
                    customConfig={cfg.config.locales[g.id]}
                    stats={stats}
                  />
                )
              })}
            </div>
            <div className="lg:col-span-1">
              <AlertsPanel alerts={alerts} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
