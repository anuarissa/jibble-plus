// Store en localStorage de las marcas del BIOMÉTRICO físico por local/mes.
// key jibble_attendance_bio_v1 = { [groupId]: { [yyyy-MM]: { marcas, personas, ts, archivo } } }
// (~45 KB por local/mes — cabe; si algún día crece, migrar a IndexedDB.)
//
// A diferencia del cache de Jibble, un QuotaExceededError acá NO se traga en
// silencio: se devuelve { ok:false } para que la UI lo muestre.

import { useSyncExternalStore } from 'react'

export const KEY_BIO = 'jibble_attendance_bio_v1'
const EVENTO = 'jibble:bio-updated'

export function readBio() {
  try { return JSON.parse(localStorage.getItem(KEY_BIO)) || {} } catch { return {} }
}

export function guardarBioMes(groupId, mesStr, { marcas, personas, archivo }) {
  const all = readBio()
  if (!all[groupId]) all[groupId] = {}
  all[groupId][mesStr] = { marcas, personas, ts: Date.now(), archivo }
  try {
    localStorage.setItem(KEY_BIO, JSON.stringify(all))
  } catch (e) {
    return { ok: false, error: e?.name === 'QuotaExceededError' ? 'Sin espacio en el navegador para guardar el biométrico (borra meses viejos).' : (e?.message || 'No se pudo guardar') }
  }
  window.dispatchEvent(new Event(EVENTO))
  return { ok: true }
}

// Personas del local (unión de todos los meses cargados; nombre del mes más nuevo gana)
export function personasBioDeLocal(groupId) {
  const meses = readBio()[groupId] || {}
  const porId = new Map()
  for (const mesStr of Object.keys(meses).sort()) {
    for (const p of (meses[mesStr].personas || [])) porId.set(p.idBio, p)
  }
  return [...porId.values()]
}

// Marcas del local dentro de [iniStr, finStr] ('yyyy-MM-dd', inclusive)
export function marcasEnRango(groupId, iniStr, finStr) {
  const meses = readBio()[groupId] || {}
  const out = []
  for (const mesStr of Object.keys(meses)) {
    if (mesStr < iniStr.slice(0, 7) || mesStr > finStr.slice(0, 7)) continue
    for (const m of (meses[mesStr].marcas || [])) {
      if (m.date >= iniStr && m.date <= finStr) out.push(m)
    }
  }
  return out
}

export function mesesConDatos(groupId) {
  const meses = readBio()[groupId] || {}
  return Object.keys(meses).sort().map(mesStr => ({
    mesStr,
    personas: (meses[mesStr].personas || []).length,
    marcas: (meses[mesStr].marcas || []).length,
    archivo: meses[mesStr].archivo,
    ts: meses[mesStr].ts,
  }))
}

export function localesConBio() {
  return Object.keys(readBio()).filter(g => Object.keys(readBio()[g] || {}).length > 0)
}

// === Suscripción para React (re-render al sincronizar) ===
let version = 0
if (typeof window !== 'undefined') {
  window.addEventListener(EVENTO, () => { version++ })
  window.addEventListener('storage', e => { if (e.key === KEY_BIO) { version++; window.dispatchEvent(new Event(EVENTO)) } })
}

function subscribe(cb) {
  window.addEventListener(EVENTO, cb)
  return () => window.removeEventListener(EVENTO, cb)
}

// Versión monotónica del store — úsala como dep de useMemo para recalcular al sincronizar.
export function useBioVersion() {
  return useSyncExternalStore(subscribe, () => version, () => 0)
}
