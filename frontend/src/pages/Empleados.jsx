import { useMemo, useState } from 'react'
import { Search, Eye, ChevronRight, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { useJibble } from '../hooks/useJibble'
import { Avatar } from '../components/ui/Avatar'
import { Skeleton } from '../components/ui/Skeleton'
import { EditEmployeeModal } from '../components/empleados/EditEmployeeModal'
import { formatBs, formatHoras } from '../utils/format'
import { EMPLOYEE_OVERRIDES } from '../config/employees'

export default function Empleados({ cfg }) {
  const data = useJibble(cfg.personOverrides, cfg.config.locales)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)
  const [showHidden, setShowHidden] = useState(false)

  const { activos, ocultos } = useMemo(() => {
    if (!data.peopleAll) return { activos: [], ocultos: [] }
    const q = query.trim().toLowerCase()
    const matches = (p) => {
      if (!q) return true
      const fields = [p.fullName, p.position, p.email].filter(Boolean).map(s => s.toLowerCase())
      return fields.some(f => f.includes(q))
    }
    return {
      activos: data.peopleAll.filter(p => !p.hidden).filter(matches),
      ocultos: data.peopleAll.filter(p => p.hidden),
    }
  }, [data.peopleAll, query])

  if (data.loading || !data.peopleAll) {
    return <div className="p-6 lg:p-8 max-w-[1400px] mx-auto"><Skeleton className="h-96" /></div>
  }

  const groupName = (id) => {
    if (!id) return <span className="text-ink-400 italic">Sin local</span>
    return cfg.config.locales[id]?.name || data.groupsAll.find(g => g.id === id)?.name || id
  }
  const groupColor = (id) => cfg.config.locales[id]?.color || data.groupsAll.find(g => g.id === id)?.color || '#6b6b73'

  function unhide(personId, fullName) {
    cfg.setPersonHidden(personId, false)
    toast.success(`${fullName} mostrado de nuevo`)
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-display font-bold tracking-tightest mb-1">Empleados</h1>
          <p className="text-sm text-ink-300">{activos.length} activos · {ocultos.length} ocultos · click en una fila para editar</p>
        </div>
      </header>

      <div className="surface p-4 mb-5 grain">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nombre, cargo o email…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      <div className="surface grain overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left">
                {['Empleado', 'Local', 'Cargo', 'Tarifa/h', 'Sueldo objetivo', 'Horario', ''].map(h => (
                  <th key={h} className="text-xs uppercase tracking-wider text-ink-300 px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activos.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center py-10 text-ink-300">
                    {query ? 'Sin resultados para tu búsqueda.' : 'No hay empleados activos.'}
                  </td>
                </tr>
              )}
              {activos.map(p => {
                const tarifa = cfg.getTarifaResolved(p.id)
                const sched = data.schedules?.find(s => s.personId === p.id)
                const sueldo = cfg.personOverrides[p.id]?.sueldoMensual ?? EMPLOYEE_OVERRIDES[p.id]?.sueldoMensual ?? null
                return (
                  <tr
                    key={p.id}
                    onClick={() => setEditing(p)}
                    className="border-t border-white/5 hover:bg-bg-700/40 cursor-pointer transition"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={p.fullName} id={p.id} size="md" />
                        <div className="min-w-0">
                          <div className="font-medium text-ink-50 truncate">{p.fullName}</div>
                          <div className="text-xs text-ink-300 truncate">{p.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: groupColor(p.groupId) }} />
                        <span>{groupName(p.groupId)}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">{p.position || <span className="italic text-ink-400">Sin cargo</span>}</td>
                    <td className="px-4 py-3 font-mono text-ink-100">{formatBs(tarifa)}</td>
                    <td className="px-4 py-3 font-mono text-ink-100">{sueldo ? formatBs(sueldo) : <span className="text-ink-400">—</span>}</td>
                    <td className="px-4 py-3 text-xs text-ink-200">
                      {sched ? `${sched.startTime}-${sched.endTime} · ${formatHoras(sched.expectedHoursPerWeek || 0)}/sem` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight size={16} className="text-ink-300 inline" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {ocultos.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowHidden(s => !s)}
            className="btn-ghost text-sm mb-3"
          >
            {showHidden ? <Eye size={14} /> : <EyeOff size={14} />}
            {showHidden ? 'Ocultar' : 'Mostrar'} {ocultos.length} empleados ocultos
          </button>
          {showHidden && (
            <div className="surface p-4 grain">
              <div className="space-y-2">
                {ocultos.map(p => (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-bg-700/40">
                    <Avatar name={p.fullName} id={p.id} size="sm" />
                    <div className="flex-1">
                      <div className="text-ink-200">{p.fullName}</div>
                      <div className="text-xs text-ink-400">{p.position || 'oculto'}</div>
                    </div>
                    <button onClick={() => unhide(p.id, p.fullName)} className="btn-secondary text-xs">
                      <Eye size={14} /> Mostrar de nuevo
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {editing && (
        <EditEmployeeModal
          persona={editing}
          groups={data.groupsAll}
          locales={cfg.config.locales}
          cfg={cfg}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
