// Recarga de TODAS las carpetas de Excel conectadas (horarios + biométrico de
// todos los locales), con toast de resumen. Lo usan el botón "Recargar Excels"
// del Dashboard, el panel de Configuración y la auto-recarga al volver a la
// pestaña del navegador.

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { soportaCarpetas } from '../utils/carpeta-horarios'
import { recargarTodo } from '../utils/sincronizar-carpetas'

const MIN_ENTRE_AUTO_MS = 30_000

function resumenTexto(r) {
  const partes = []
  if (r.semanasAplicadas) partes.push(`${r.semanasAplicadas} semana${r.semanasAplicadas > 1 ? 's' : ''} de horarios`)
  if (r.mesesCargados) partes.push(`${r.mesesCargados} mes${r.mesesCargados > 1 ? 'es' : ''} de biométrico`)
  if (r.personasBorradas) partes.push(`${r.personasBorradas} turno${r.personasBorradas > 1 ? 's' : ''} que ya no están en el Excel`)
  if (r.mesesBorrados) partes.push(`${r.mesesBorrados} mes${r.mesesBorrados > 1 ? 'es' : ''} sin archivo`)
  return partes.join(' · ')
}

export function useRecargarExcels({ cfg, people }) {
  const [cargando, setCargando] = useState(false)
  const ultimaRef = useRef(0)
  // Refs: la recarga se dispara desde callbacks/listeners y necesita datos frescos
  const datosRef = useRef({ cfg, people })
  datosRef.current = { cfg, people }

  const recargar = useCallback(async ({ fiel = true, silencioso = false } = {}) => {
    if (!soportaCarpetas) {
      if (!silencioso) toast.error('Este navegador no puede leer carpetas — usa Chrome o Edge.')
      return null
    }
    setCargando(true)
    try {
      const { cfg: c, people: gente } = datosRef.current
      const peoplePorLocal = {}
      for (const p of (gente || [])) {
        if (!p.groupId) continue
        ;(peoplePorLocal[p.groupId] = peoplePorLocal[p.groupId] || []).push(p)
      }
      const r = await recargarTodo({
        peoplePorLocal,
        acciones: { setTurnosSemana: c.setTurnosSemana, reemplazarTurnosDeLocal: c.reemplazarTurnosDeLocal },
        fiel,
        turnosActuales: c.turnos,
      })
      ultimaRef.current = Date.now()

      if (!silencioso) {
        if (!r.carpetas) {
          toast.message('No hay carpetas conectadas', { description: 'Conéctalas en Configuración → Carpetas de Excel, o desde la pestaña Turnos de cada local.' })
        } else {
          const detalle = resumenTexto(r)
          toast.success(`Excels recargados · ${r.carpetas} carpeta${r.carpetas > 1 ? 's' : ''}`, {
            description: detalle
              ? `${detalle}. Para que el gerente vea esto en su dispositivo, publica los datos.`
              : 'Todo estaba al día — ningún cambio en los archivos.',
            duration: 8000,
          })
        }
        for (const a of r.abortados) {
          toast.warning('No se borró nada en un local por seguridad', { description: `${a.motivoAborto}. Se actualizó lo demás; revisa que OneDrive haya descargado los archivos y vuelve a recargar.`, duration: 9000 })
        }
        if (r.requierenPermiso.length) {
          toast.warning(`${r.requierenPermiso.length} carpeta(s) piden permiso otra vez`, { description: 'Ve a Configuración → Carpetas de Excel y dale permiso a cada una (el navegador lo pide de a una).', duration: 9000 })
        }
        for (const e of r.errores) toast.error(`Error leyendo una carpeta: ${e.error}`)
      } else if (resumenTexto(r)) {
        toast.success('Excels actualizados', { description: resumenTexto(r), duration: 4000 })
      }
      return r
    } catch (e) {
      if (!silencioso) toast.error('No se pudo recargar: ' + e.message)
      return null
    } finally {
      setCargando(false)
    }
  }, [])

  return { recargar, cargando, soportado: soportaCarpetas }
}

// Auto-recarga al volver a la pestaña del navegador (típico: Anuar edita el
// Excel, vuelve al navegador y quiere verlo ya). Modo NO fiel: nunca borra sin
// que lo pidan explícitamente con el botón.
export function useAutoRecargaExcels({ cfg, people, activo = true }) {
  const { recargar, cargando } = useRecargarExcels({ cfg, people })
  const ultimaRef = useRef(0)
  const corriendoRef = useRef(false)

  useEffect(() => {
    if (!activo || !soportaCarpetas) return
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return
      if (corriendoRef.current) return
      if (Date.now() - ultimaRef.current < MIN_ENTRE_AUTO_MS) return
      corriendoRef.current = true
      ultimaRef.current = Date.now()
      try { await recargar({ fiel: false, silencioso: true }) } finally { corriendoRef.current = false }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [activo, recargar])

  return { cargando }
}
