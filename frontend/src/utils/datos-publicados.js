// Recepción de los DATOS PUBLICADOS: el script publicar-datos.mjs sube al deploy
// un blob cifrado (frontend/public/datos-publicados.enc) con el biométrico,
// turnos, aliases, tarifas, condonaciones, extras y nombres de locales del PC
// de Anuar. Cualquier dispositivo logueado lo descifra (la llave se deriva del
// token de sesión, que es determinista a partir de la contraseña) y lo MERGEA
// en su localStorage — nunca borra lo local, y jamás toca settings ni hidden.

const KEY_TS = 'jibble_datos_publicados_v1'

// Descifra el blob {v, ts, iv, ct} con WebCrypto: HKDF-SHA256(token) → AES-256-GCM.
export async function descifrarDatosPublicados(blob, token) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(token), 'HKDF', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('jibble-datos-v1'), info: new TextEncoder().encode('datos') },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0))
  const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(blob.iv) }, key, b64(blob.ct))
  return JSON.parse(new TextDecoder().decode(plano))
}

const read = k => { try { return JSON.parse(localStorage.getItem(k)) || {} } catch { return {} } }
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v))

// Merge conservador en localStorage. Lo publicado GANA a nivel de entrada
// (Anuar es la fuente de verdad) pero lo local que no viene en el blob se queda.
// Devuelve true si algo cambió.
export function mergeDatosPublicados(datos) {
  let cambio = false
  const aplicar = (key, merger) => {
    if (!datos[key]) return
    const local = read(key)
    const merged = merger(local, datos[key])
    if (JSON.stringify(merged) !== JSON.stringify(local)) { write(key, merged); cambio = true }
  }

  // Biométrico: por local → por mes (mes publicado reemplaza ese mes)
  aplicar('jibble_attendance_bio_v1', (local, pub) => {
    const out = { ...local }
    for (const [g, meses] of Object.entries(pub)) out[g] = { ...(out[g] || {}), ...meses }
    return out
  })
  // Turnos: por semana → la persona publicada REEMPLAZA a la local (asignación,
  // no spread). Si Anuar borró un día del Excel y recargó, el blob manda y el
  // día no revive; las personas que el blob no trae quedan intactas.
  aplicar('jibble_turnos_v1', (local, pub) => {
    const out = { ...local }
    for (const [wk, porPersona] of Object.entries(pub)) {
      out[wk] = { ...(out[wk] || {}) }
      for (const [pid, dias] of Object.entries(porPersona)) out[wk][pid] = dias
    }
    return out
  })
  // Mapas planos: entrada publicada gana, entradas locales extra se quedan
  for (const k of ['jibble_alias_nombres_v1', 'jibble_tarifas_v1', 'jibble_condonaciones_v1', 'jibble_extras_aprobadas_v1', 'jibble_person_overrides_v1']) {
    aplicar(k, (local, pub) => ({ ...local, ...pub }))
  }
  // Identidad de locales (nombre/color/emoji) dentro de la config; hidden y
  // settings son POR DISPOSITIVO y el blob no los trae → quedan intactos.
  if (datos.locales) {
    const cfgKey = 'jibble_app_config_v1'
    const cfg = read(cfgKey)
    const locales = { ...(cfg.locales || {}) }
    for (const [id, l] of Object.entries(datos.locales)) locales[id] = { ...(locales[id] || {}), ...l }
    const next = { ...cfg, locales }
    if (JSON.stringify(next) !== JSON.stringify(cfg)) { write(cfgKey, next); cambio = true }
  }
  return cambio
}

export function tsAplicado() {
  return read(KEY_TS).ts || 0
}

export function guardarTsAplicado(ts) {
  write(KEY_TS, { ts })
}
