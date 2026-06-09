// Dropdown para cambiar entre cuentas de Jibble configuradas.
// Solo aparece si hay 2+ workspaces (si solo hay 1, no tiene sentido).

import { Building2 } from 'lucide-react'

export function WorkspaceSwitcher({ workspaces, active, onChange }) {
  // No mostrar si solo hay 1 cuenta (o ninguna)
  if (!workspaces || workspaces.length < 2) return null

  return (
    <div className="flex items-center gap-2 surface-elevated px-3 py-2 text-sm">
      <Building2 size={15} className="text-accent" />
      <span className="text-ink-300 hidden sm:inline">Cuenta:</span>
      <select
        value={active || 'all'}
        onChange={e => onChange(e.target.value)}
        className="bg-transparent text-ink-50 font-semibold text-sm outline-none cursor-pointer pr-1"
        title="Cambiar entre cuentas de Jibble"
      >
        <option value="all">Todas las cuentas</option>
        {workspaces.map(w => (
          <option key={w.id} value={String(w.id)}>{w.name}</option>
        ))}
      </select>
    </div>
  )
}
