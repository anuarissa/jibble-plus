// Al abrir la app: baja el blob cifrado del deploy (si existe), lo descifra con
// el token de sesión y mergea los datos al localStorage del dispositivo. Si algo
// cambió, recarga UNA vez (el ts aplicado se guarda antes, así que no re-entra).
// Silencioso ante 404 / token inválido / blob corrupto.

import { useEffect } from 'react'
import { descifrarDatosPublicados, mergeDatosPublicados, tsAplicado, guardarTsAplicado } from '../utils/datos-publicados'

// `activo`: re-intentar cuando cambia (ej. después del login, que recién deja el token).
export function useDatosPublicados(activo = true) {
  useEffect(() => {
    if (!activo) return
    let cancelado = false
    ;(async () => {
      try {
        const token = localStorage.getItem('jibble_session_token')
        if (!token || token === 'dev-local') return
        const res = await fetch('/datos-publicados.enc', { cache: 'no-store' })
        if (!res.ok) return
        const blob = await res.json()
        if (!blob?.ct || !blob?.iv || !blob?.ts) return
        if (blob.ts <= tsAplicado()) return
        const datos = await descifrarDatosPublicados(blob, token)
        if (cancelado) return
        const cambio = mergeDatosPublicados(datos)
        guardarTsAplicado(blob.ts)
        if (cambio) {
          // Los hooks de estado leen localStorage al montar → recargar una vez
          // para que toda la app vea los datos recién llegados.
          window.location.reload()
        }
      } catch { /* sin red, sin blob o contraseña distinta — seguir normal */ }
    })()
    return () => { cancelado = true }
  }, [activo])
}
