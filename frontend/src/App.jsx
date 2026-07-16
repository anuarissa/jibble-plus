import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useLocalConfig } from './hooks/useLocalConfig'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Setup from './pages/Setup'
import Dashboard from './pages/Dashboard'
import Restaurant from './pages/Restaurant'
import Empleados from './pages/Empleados'
import Comparison from './pages/Comparison'
import ResumenSueldos from './pages/ResumenSueldos'
import History from './pages/History'
import Settings from './pages/Settings'
import { getSessionToken, getHealth } from './api/jibble'

export default function App() {
  const cfg = useLocalConfig()
  const [authed, setAuthed] = useState(() => !!getSessionToken())
  const [needsAuth, setNeedsAuth] = useState(null) // null = unknown, true/false una vez chequeado

  // Verificar si la app requiere auth (APP_PASSWORD configurada en Vercel)
  useEffect(() => {
    getHealth()
      .then(h => setNeedsAuth(!!h.protected))
      .catch(() => setNeedsAuth(true)) // ante duda, pedir auth
  }, [])

  // Reaccionar a 401 desde cualquier llamada API
  useEffect(() => {
    function onUnauth() { setAuthed(false) }
    window.addEventListener('jibble:unauth', onUnauth)
    return () => window.removeEventListener('jibble:unauth', onUnauth)
  }, [])

  // Pantalla de carga mientras consultamos /api/health
  if (needsAuth === null) {
    return <div className="min-h-screen flex items-center justify-center text-ink-300 text-sm">Cargando…</div>
  }

  // Si el servidor pide auth y no tenemos token válido → Login
  if (needsAuth && !authed) {
    return <Login onLogged={() => setAuthed(true)} />
  }

  if (!cfg.config.setupComplete) {
    return (
      <Routes>
        <Route path="*" element={<Setup cfg={cfg} />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<Layout cfg={cfg} />}>
        <Route path="/" element={<Dashboard cfg={cfg} />} />
        <Route path="/restaurante/:groupId" element={<Restaurant cfg={cfg} />} />
        <Route path="/empleados" element={<Empleados cfg={cfg} />} />
        <Route path="/comparativo" element={<Comparison cfg={cfg} />} />
        <Route path="/sueldos" element={<ResumenSueldos cfg={cfg} />} />
        <Route path="/historial" element={<History cfg={cfg} />} />
        <Route path="/configuracion" element={<Settings cfg={cfg} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
