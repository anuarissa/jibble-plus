import { useState, useEffect } from 'react'
import { Activity, KeyRound, Check, Loader2, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { getHealth, getGroups } from '../api/jibble'

const EMOJIS = ['🍔', '🍕', '🍗', '🌮', '🥡', '🍣', '🥪', '🍝', '🥗', '🍦', '☕', '🥐']
const COLORS = ['#ff6b35', '#dc2626', '#0ea5e9', '#eab308', '#a855f7', '#10b981', '#ec4899', '#f97316']

export default function Setup({ cfg }) {
  const [step, setStep] = useState(0)
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(false)
  const [health, setHealth] = useState(null)
  const [locales, setLocales] = useState({})

  useEffect(() => {
    getHealth().then(setHealth).catch(() => {})
  }, [])

  async function probarConexion() {
    setLoading(true)
    try {
      const grupos = await getGroups()
      if (!grupos?.length) throw new Error('No se recibieron grupos')
      setGroups(grupos)
      const init = {}
      for (let i = 0; i < grupos.length; i++) {
        const g = grupos[i]
        init[g.id] = { name: g.name, color: g.color || COLORS[i % COLORS.length], emoji: g.emoji || EMOJIS[i % EMOJIS.length] }
      }
      setLocales(init)
      setStep(1)
    } catch (err) {
      toast.error('No se pudo conectar al backend. ¿Está corriendo `npm run dev` en /backend?')
    } finally {
      setLoading(false)
    }
  }

  function actualizarLocal(id, patch) {
    setLocales(l => ({ ...l, [id]: { ...l[id], ...patch } }))
  }

  function finalizar() {
    cfg.completarSetup(locales)
    toast.success('Configuración guardada')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-accent-700 items-center justify-center mb-5 shadow-glow">
            <Activity size={26} className="text-white" />
          </div>
          <h1 className="text-4xl font-display font-bold tracking-tightest mb-2">
            Bienvenido a <span className="text-accent">Jibble+</span>
          </h1>
          <p className="text-ink-200">Vista consolidada para todos tus locales</p>
        </div>

        {step === 0 && (
          <div className="surface p-8 grain">
            <div className="flex items-center gap-2 mb-6">
              <KeyRound size={18} className="text-accent" />
              <h2 className="text-xl font-display font-semibold">Conexión con Jibble</h2>
            </div>

            <div className="space-y-5 text-sm text-ink-200 mb-6">
              <p>
                Para conectar tus datos reales necesitas la <span className="text-ink-50 font-semibold">API key de Jibble</span>.
                Pégala en el archivo <code className="text-accent bg-bg-700 px-1.5 py-0.5 rounded text-xs">backend/.env</code> y reinicia el servidor.
              </p>
              <details className="bg-bg-700/40 rounded-xl p-4 cursor-pointer">
                <summary className="font-medium text-ink-50">¿Cómo obtenerla?</summary>
                <ol className="list-decimal list-inside mt-3 space-y-1.5 text-ink-200">
                  <li>Entra a Jibble web (jibble.io) con tu cuenta de admin.</li>
                  <li>Ve a <span className="text-ink-50">Settings → Integrations → API</span>.</li>
                  <li>Click <span className="text-ink-50">Generate API Token</span> y copia el token.</li>
                  <li>Pégalo en <code className="text-accent">JIBBLE_API_KEY=...</code> dentro de <code>backend/.env</code>.</li>
                  <li>Reinicia el backend (Ctrl+C → <code>npm run dev</code>).</li>
                </ol>
              </details>

              <div className="bg-bg-700/40 rounded-xl p-4 flex items-start gap-3">
                <div className={`w-2.5 h-2.5 rounded-full mt-1.5 ${health?.connected ? 'bg-good shadow-[0_0_12px] shadow-good/60' : 'bg-warn'}`} />
                <div>
                  <div className="font-medium text-ink-50">
                    Estado actual: {health?.mode === 'live' ? 'Conectado a Jibble' : 'Modo demo (sin API key)'}
                  </div>
                  <div className="text-xs text-ink-300 mt-0.5">
                    {health?.mode === 'live'
                      ? 'La app va a usar datos reales de tu cuenta.'
                      : 'Puedes seguir igual y probar la app con datos de ejemplo. Cuando configures la key, se conectará automáticamente.'}
                  </div>
                </div>
              </div>
            </div>

            <button onClick={probarConexion} disabled={loading} className="btn-primary w-full">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Conectando…</> : <>Continuar <ChevronRight size={16} /></>}
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="surface p-8 grain">
            <h2 className="text-xl font-display font-semibold mb-2">Personaliza tus locales</h2>
            <p className="text-sm text-ink-200 mb-6">Renombra, asigna color y emoji. Podrás cambiarlos después en Configuración.</p>

            <div className="space-y-4 mb-8">
              {groups.map(g => {
                const cur = locales[g.id]
                return (
                  <div key={g.id} className="surface-elevated p-4">
                    <div className="flex gap-3 items-start">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0" style={{ background: cur?.color }}>
                        {cur?.emoji}
                      </div>
                      <div className="flex-1 grid gap-3">
                        <input
                          type="text"
                          value={cur?.name || ''}
                          onChange={e => actualizarLocal(g.id, { name: e.target.value })}
                          className="input"
                          placeholder="Nombre del local"
                        />
                        <div className="flex flex-wrap gap-1.5">
                          {COLORS.map(c => (
                            <button
                              key={c}
                              onClick={() => actualizarLocal(g.id, { color: c })}
                              className={`w-7 h-7 rounded-lg ring-2 transition ${cur?.color === c ? 'ring-white' : 'ring-transparent hover:ring-white/40'}`}
                              style={{ background: c }}
                            />
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {EMOJIS.map(e => (
                            <button
                              key={e}
                              onClick={() => actualizarLocal(g.id, { emoji: e })}
                              className={`w-8 h-8 rounded-lg text-lg transition ${cur?.emoji === e ? 'bg-accent/20 ring-1 ring-accent' : 'hover:bg-bg-600'}`}
                            >
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

            <div className="flex gap-3">
              <button onClick={() => setStep(0)} className="btn-secondary">Atrás</button>
              <button onClick={finalizar} className="btn-primary flex-1">
                <Check size={16} /> Finalizar y entrar al Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
