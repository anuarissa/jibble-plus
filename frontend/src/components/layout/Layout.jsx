import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, BarChart3, History, Settings as SettingsIcon, Activity, ChevronLeft, Users, Wallet } from 'lucide-react'
import { useState } from 'react'

export default function Layout({ cfg }) {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const items = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/empleados', label: 'Empleados', icon: Users },
    { to: '/comparativo', label: 'Comparativo', icon: BarChart3 },
    { to: '/sueldos', label: 'Sueldos', icon: Wallet },
    { to: '/historial', label: 'Historial', icon: History },
    { to: '/configuracion', label: 'Configuración', icon: SettingsIcon },
  ]

  return (
    <div className="min-h-screen flex">
      <aside className={`${collapsed ? 'w-16' : 'w-64'} shrink-0 transition-all duration-300 ease-spring border-r border-white/5 bg-bg-800/50 backdrop-blur-md sticky top-0 h-screen flex flex-col`}>
        <button
          onClick={() => navigate('/')}
          className="p-5 flex items-center gap-3 hover:bg-bg-700/50 transition border-b border-white/5"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-accent-700 flex items-center justify-center text-white shadow-glow shrink-0">
            <Activity size={18} />
          </div>
          {!collapsed && (
            <div className="text-left">
              <div className="font-display font-bold text-ink-50 leading-none tracking-tightest">Jibble<span className="text-accent">+</span></div>
              <div className="text-[10px] text-ink-300 tracking-wider uppercase mt-0.5">Multi-Local</div>
            </div>
          )}
        </button>
        <nav className="flex-1 p-3 space-y-1">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                  isActive ? 'bg-accent/10 text-accent shadow-[inset_0_0_0_1px] shadow-accent/20' : 'text-ink-200 hover:text-ink-50 hover:bg-bg-700/60'
                }`
              }
            >
              <it.icon size={18} className="shrink-0" />
              {!collapsed && <span>{it.label}</span>}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => setCollapsed(c => !c)}
          className="m-3 p-2 rounded-lg hover:bg-bg-700 text-ink-300 transition flex items-center justify-center"
        >
          <ChevronLeft size={16} className={`transition ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </aside>

      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  )
}
