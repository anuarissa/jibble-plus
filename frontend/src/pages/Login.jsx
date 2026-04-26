import { useState } from 'react'
import { Activity, Lock, Loader2, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { login, getHealth } from '../api/jibble'

export default function Login({ onLogged }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      // Si la app está sin password configurada, igual hacemos login (devuelve token "dev")
      const health = await getHealth().catch(() => ({}))
      const result = await login(password)
      if (result?.ok) {
        toast.success('Bienvenido')
        onLogged?.()
      } else {
        toast.error('Contraseña incorrecta')
      }
    } catch (err) {
      const msg = err.response?.data?.error === 'invalid_password'
        ? 'Contraseña incorrecta'
        : 'Error de conexión'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-accent-700 items-center justify-center mb-5 shadow-glow">
            <Activity size={26} className="text-white" />
          </div>
          <h1 className="text-3xl font-display font-bold tracking-tightest mb-1">
            Jibble<span className="text-accent">+</span>
          </h1>
          <p className="text-sm text-ink-300">Acceso protegido</p>
        </div>

        <div className="surface p-6 grain">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-300 flex items-center gap-1 mb-2">
              <Lock size={12} /> Contraseña
            </span>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input"
              disabled={loading}
            />
          </label>

          <button type="submit" disabled={loading || !password} className="btn-primary w-full mt-5">
            {loading ? <><Loader2 size={16} className="animate-spin" /> Validando…</> : <>Entrar <ChevronRight size={16} /></>}
          </button>
        </div>

        <p className="text-center text-xs text-ink-400 mt-5">
          La contraseña se configura en variables de entorno de Vercel (APP_PASSWORD).
        </p>
      </form>
    </div>
  )
}
