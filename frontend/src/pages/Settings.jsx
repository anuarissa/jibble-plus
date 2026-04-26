import { useJibble } from '../hooks/useJibble'
import { Trash2, KeyRound, RefreshCw, AlertTriangle, Users, RotateCcw, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { clearCache, logout } from '../api/jibble'
import { Avatar } from '../components/ui/Avatar'
import { EMPLOYEE_OVERRIDES } from '../config/employees'

const COLORS = ['#ff6b35', '#dc2626', '#0ea5e9', '#eab308', '#a855f7', '#10b981', '#ec4899', '#f97316']
const EMOJIS = ['🍔', '🍕', '🍗', '🌮', '🥡', '🍣', '🥪', '🍝', '🥗', '🍦', '☕', '🥐']

export default function Settings({ cfg }) {
  const data = useJibble(cfg.personOverrides)

  function reconectar() {
    clearCache()
    toast.success('Caché limpio · vuelve a cargar la página')
    setTimeout(() => window.location.reload(), 800)
  }

  function resetCompleto() {
    if (!confirm('¿Borrar TODA la configuración (locales, tarifas, condonaciones)? Esto no se puede deshacer.')) return
    cfg.reset()
    clearCache()
    toast.success('Configuración borrada · volviendo al setup inicial')
    setTimeout(() => window.location.reload(), 800)
  }

  return (
    <div className="p-6 lg:p-8 max-w-[900px] mx-auto">
      <header className="mb-8">
        <h1 className="text-4xl font-display font-bold tracking-tightest mb-1">Configuración</h1>
        <p className="text-sm text-ink-300">Ajustes globales de la app</p>
      </header>

      <Section
        title="Asignar empleados a locales"
        subtitle="Jibble plan gratuito no permite asignar empleados a grupos. Hazlo aquí — se guarda local y se aplica al cálculo de planilla y vistas por local."
      >
        <PersonGroupAssign
          people={data.people}
          groups={data.groups}
          locales={cfg.config.locales}
          personOverrides={cfg.personOverrides}
          onAssign={cfg.setPersonGroup}
          onCargo={cfg.setPersonCargo}
          onClear={cfg.clearPersonOverride}
        />
      </Section>

      <Section title="Tus locales" subtitle="Renombra, cambia color o emoji de cada local">
        <div className="space-y-3">
          {data.groups?.map(g => {
            const cur = cfg.config.locales[g.id] || {}
            return (
              <div key={g.id} className="surface-elevated p-4">
                <div className="flex gap-3 items-start">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0" style={{ background: cur.color || g.color }}>
                    {cur.emoji || g.emoji}
                  </div>
                  <div className="flex-1 grid gap-2">
                    <input
                      type="text"
                      value={cur.name || g.name}
                      onChange={e => cfg.renombrarLocal(g.id, { name: e.target.value })}
                      className="input"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {COLORS.map(c => (
                        <button key={c} onClick={() => cfg.renombrarLocal(g.id, { color: c })}
                          className={`w-6 h-6 rounded-lg ring-2 transition ${(cur.color || g.color) === c ? 'ring-white' : 'ring-transparent hover:ring-white/40'}`}
                          style={{ background: c }} />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {EMOJIS.map(e => (
                        <button key={e} onClick={() => cfg.renombrarLocal(g.id, { emoji: e })}
                          className={`w-7 h-7 rounded-lg text-base transition ${(cur.emoji || g.emoji) === e ? 'bg-accent/20 ring-1 ring-accent' : 'hover:bg-bg-600'}`}>
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="Reglas de tardanza y planilla" subtitle="Aplican a los cálculos de toda la app">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumberField
            label="Tolerancia de tardanza (minutos)"
            help="Si llegan después de este tiempo, cuenta como tarde. 0 = desde el primer minuto."
            value={cfg.config.settings.toleranciaMinutos}
            onChange={v => cfg.setSettings({ toleranciaMinutos: Number(v) })}
          />
          <NumberField
            label="Multa por bloque (Bs)"
            help="Cuánto se descuenta por cada bloque de minutos tarde."
            value={cfg.config.settings.multaPorBloque}
            onChange={v => cfg.setSettings({ multaPorBloque: Number(v) })}
          />
          <NumberField
            label="Tamaño de bloque (minutos)"
            help="Cada cuántos minutos sube la multa."
            value={cfg.config.settings.bloqueMinutos}
            onChange={v => cfg.setSettings({ bloqueMinutos: Number(v) })}
          />
          <NumberField
            label="Multiplicador horas extra"
            step={0.1}
            help="Por cada hora extra, se paga la tarifa × este multiplicador (default 1.5)."
            value={cfg.config.settings.multiplicadorExtra}
            onChange={v => cfg.setSettings({ multiplicadorExtra: Number(v) })}
          />
        </div>
      </Section>

      <Section title="Sesión">
        <button
          onClick={() => { logout(); window.location.reload() }}
          className="btn-secondary text-sm"
        >
          <LogOut size={14} /> Cerrar sesión
        </button>
        <p className="text-xs text-ink-400 mt-2">Te llevará de nuevo a la pantalla de login.</p>
      </Section>

      <Section title="Conexión Jibble">
        <div className="surface-elevated p-4">
          <div className="flex items-start gap-3">
            <div className={`w-2.5 h-2.5 rounded-full mt-1.5 ${data.health?.connected ? 'bg-good' : 'bg-warn'}`} />
            <div className="flex-1">
              <div className="font-medium text-ink-50">
                {data.health?.mode === 'live' ? 'Conectado a Jibble en vivo' : 'Modo demo (sin API key)'}
              </div>
              <div className="text-xs text-ink-300 mt-1">
                Para conectar tus datos reales: edita <code className="text-accent">backend/.env</code>, pega tu API key en <code className="text-accent">JIBBLE_API_KEY=...</code> y reinicia el backend.
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={reconectar} className="btn-secondary text-sm">
            <RefreshCw size={14} /> Limpiar caché y recargar
          </button>
        </div>
      </Section>

      <Section title="Zona peligrosa" danger>
        <div className="surface-elevated border-bad/30 p-4">
          <div className="flex items-start gap-3 mb-3">
            <AlertTriangle size={18} className="text-bad mt-0.5 shrink-0" />
            <div>
              <div className="font-medium text-ink-50">Borrar toda la configuración</div>
              <div className="text-xs text-ink-300 mt-0.5">
                Elimina nombres de locales, tarifas, condonaciones y caché. La API key de <code>backend/.env</code> NO se toca.
              </div>
            </div>
          </div>
          <button onClick={resetCompleto} className="btn-secondary text-sm border-bad/30 text-bad hover:bg-bad/10">
            <Trash2 size={14} /> Resetear todo
          </button>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, subtitle, children, danger }) {
  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className={`font-display font-semibold text-lg ${danger ? 'text-bad' : ''}`}>{title}</h2>
        {subtitle && <p className="text-xs text-ink-300 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function PersonGroupAssign({ people, groups, locales, personOverrides, onAssign, onCargo, onClear }) {
  if (!people || !groups) return <p className="text-sm text-ink-300">Cargando empleados…</p>
  if (people.length === 0) return <p className="text-sm text-ink-300">No hay empleados todavía.</p>

  const groupName = (id) => {
    if (!id) return '— Sin asignar —'
    const custom = locales[id]?.name
    return custom || groups.find(g => g.id === id)?.name || id
  }
  const groupColor = (id) => locales[id]?.color || groups.find(g => g.id === id)?.color || '#6b6b73'

  // Personas con override forzado por código (no editables aquí, solo informativas)
  const isHardcoded = (personId) => Boolean(EMPLOYEE_OVERRIDES[personId]?.groupId)

  return (
    <div className="space-y-2">
      {people.map(p => {
        const hard = isHardcoded(p.id)
        const userOverride = personOverrides[p.id]
        return (
          <div key={p.id} className="surface-elevated p-4 flex items-center gap-3 flex-wrap">
            <Avatar name={p.fullName} id={p.id} size="md" />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-ink-50 truncate">{p.fullName}</div>
              <div className="text-xs text-ink-300 truncate">
                {p.position || <span className="italic text-ink-400">Sin cargo</span>}
                {hard && <span className="ml-2 badge bg-accent/15 text-accent text-[10px]">Forzado por código</span>}
                {userOverride?.groupId && <span className="ml-2 badge bg-good/15 text-good text-[10px]">Asignado por ti</span>}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: groupColor(p.groupId) }} />
              <select
                value={p.groupId || ''}
                onChange={(e) => {
                  onAssign(p.id, e.target.value || null)
                  toast.success(e.target.value ? `${p.fullName} → ${groupName(e.target.value)}` : `${p.fullName} sin local`)
                }}
                disabled={hard}
                title={hard ? 'Esta persona tiene grupo forzado por código (config/employees.js)' : ''}
                className="input text-sm py-1.5 w-44 disabled:opacity-50"
              >
                <option value="">— Sin asignar —</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{groupName(g.id)}</option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Cargo (opcional)"
                defaultValue={userOverride?.cargo || ''}
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v !== (userOverride?.cargo || '')) {
                    onCargo(p.id, v || null)
                    if (v) toast.success(`Cargo de ${p.fullName}: ${v}`)
                  }
                }}
                className="input text-sm py-1.5 w-40"
              />

              {userOverride && !hard && (
                <button
                  onClick={() => { onClear(p.id); toast.message(`Override removido de ${p.fullName}`) }}
                  className="btn-ghost p-1.5"
                  title="Quitar override"
                >
                  <RotateCcw size={14} />
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function NumberField({ label, help, value, onChange, step = 1 }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-ink-300 block mb-1">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="input"
      />
      {help && <span className="text-xs text-ink-400 block mt-1">{help}</span>}
    </label>
  )
}
