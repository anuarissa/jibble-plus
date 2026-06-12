// Dropdown custom para cambiar entre cuentas de Jibble configuradas.
// Solo aparece si hay 2+ workspaces. Menú propio (no <select> nativo) para
// respetar el dark theme de la app — el dropdown del sistema se veía blanco
// y poco legible.

import { useState, useRef, useEffect } from 'react'
import { Building2, ChevronDown, Check } from 'lucide-react'

export function WorkspaceSwitcher({ workspaces, active, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Cerrar al click afuera o Escape
  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // No mostrar si solo hay 1 cuenta (o ninguna)
  if (!workspaces || workspaces.length < 2) return null

  const options = [
    { value: 'all', name: 'Todas las cuentas' },
    ...workspaces.map(w => ({ value: String(w.id), name: w.name })),
  ]
  const current = options.find(o => o.value === (active || 'all')) || options[0]

  function pick(value) {
    setOpen(false)
    if (value !== active) onChange(value)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 surface-elevated px-3.5 py-2 text-sm hover:border-accent/40 transition group"
        title="Cambiar entre cuentas de Jibble"
      >
        <Building2 size={15} className="text-accent shrink-0" />
        <span className="text-ink-300 hidden sm:inline">Cuenta:</span>
        <span className="font-semibold text-ink-50">{current.name}</span>
        <ChevronDown size={14} className={`text-ink-300 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 min-w-[230px] bg-bg-700 border border-white/10 rounded-xl shadow-soft overflow-hidden">
          {options.map(opt => {
            const isActive = opt.value === (active || 'all')
            return (
              <button
                key={opt.value}
                onClick={() => pick(opt.value)}
                className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm text-left transition ${
                  isActive
                    ? 'bg-accent/15 text-accent-400 font-semibold'
                    : 'text-ink-100 hover:bg-bg-600 hover:text-ink-50'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-accent' : 'bg-ink-400/30'}`} />
                <span className="flex-1">{opt.name}</span>
                {isActive && <Check size={15} className="text-accent shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
