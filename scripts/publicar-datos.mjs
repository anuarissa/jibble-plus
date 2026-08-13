// PUBLICA los datos del navegador de Anuar para que TODOS los dispositivos
// (gerente incluido, celular incluido) los vean al entrar con la contraseña:
//
//   node scripts/publicar-datos.mjs
//
// Cómo funciona:
//   1. Cierra Edge (autorizado) y lee del LevelDB del perfil las keys COMPARTIBLES:
//      biométrico, turnos, aliases, overrides de personas, tarifas, condonaciones,
//      extras aprobadas, y los nombres/colores de los locales.
//      NUNCA publica: settings, flags hidden por-dispositivo, ni el token.
//   2. Cifra todo con AES-256-GCM. La llave se deriva (HKDF) del token de sesión,
//      que es determinista a partir de la contraseña de la app → cualquier
//      dispositivo logueado puede descifrar; nadie sin la contraseña puede.
//   3. Escribe frontend/public/datos-publicados.enc, hace commit + push → Vercel
//      lo sirve en ~1 min y la app lo aplica sola al cargar (merge, nunca borra).
//   4. Reabre Edge.
//
// Correlo después de cargar un mes nuevo o de aprobar extras, para que el resto
// de dispositivos vean lo mismo que tu PC.

import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { ORIGEN, cerrarEdge, abrirEdge, backupLevelDB, abrirDB, leerKeyJSON, leerKeyString } from './leveldb-edge.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Keys que viajan a los demás dispositivos (datos del negocio, no preferencias)
const KEYS_COMPARTIBLES = [
  'jibble_attendance_bio_v1',
  'jibble_turnos_v1',
  'jibble_alias_nombres_v1',
  'jibble_person_overrides_v1',
  'jibble_tarifas_v1',
  'jibble_condonaciones_v1',
  'jibble_extras_aprobadas_v1',
]

console.log(`\n════════ PUBLICAR DATOS (→ todos los dispositivos con la contraseña) ════════`)

// 1) Leer del navegador (Edge cerrado)
await cerrarEdge()
const dirBackup = backupLevelDB(RAIZ)
console.log(`  ✓ Backup del Local Storage → ${dirBackup}`)

const db = await abrirDB(RAIZ)
let token, datos
try {
  token = await leerKeyString(db, 'jibble_session_token')
  if (!token || token === 'dev-local') {
    throw new Error('El navegador no tiene sesión iniciada en ' + ORIGEN + ' — entra una vez con la contraseña y vuelve a correr.')
  }
  datos = {}
  for (const k of KEYS_COMPARTIBLES) {
    const v = await leerKeyJSON(db, k)
    if (v && Object.keys(v).length) datos[k] = v
  }
  // De la config, SOLO la identidad de los locales (nombre/color/emoji) — jamás
  // hidden (preferencia por dispositivo) ni settings.
  const config = await leerKeyJSON(db, 'jibble_app_config_v1')
  if (config?.locales) {
    const locales = {}
    for (const [id, l] of Object.entries(config.locales)) {
      const limpio = {}
      if (l?.name) limpio.name = l.name
      if (l?.color) limpio.color = l.color
      if (l?.emoji) limpio.emoji = l.emoji
      if (Object.keys(limpio).length) locales[id] = limpio
    }
    if (Object.keys(locales).length) datos.locales = locales
  }
} finally {
  await db.close()
}
abrirEdge()
console.log(`  ✓ Leído: ${Object.keys(datos).join(', ')}`)

// 2) Cifrar: llave = HKDF-SHA256(token, salt 'jibble-datos-v1') → AES-256-GCM
const key = Buffer.from(crypto.hkdfSync('sha256', Buffer.from(token, 'utf8'), Buffer.from('jibble-datos-v1'), Buffer.from('datos'), 32))
const iv = crypto.randomBytes(12)
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
const plano = Buffer.from(JSON.stringify(datos), 'utf8')
const ct = Buffer.concat([cipher.update(plano), cipher.final(), cipher.getAuthTag()])
const blob = JSON.stringify({ v: 1, ts: Date.now(), iv: iv.toString('base64'), ct: ct.toString('base64') })

const destino = path.join(RAIZ, 'frontend', 'public', 'datos-publicados.enc')
fs.writeFileSync(destino, blob, 'utf8')
console.log(`  ✓ Cifrado (AES-256-GCM, llave derivada de la contraseña): ${(blob.length / 1024).toFixed(0)} KB → ${destino}`)

// 3) Commit + push → deploy de Vercel
const git = (...args) => spawnSync('git', args, { cwd: RAIZ, encoding: 'utf8' })
git('add', 'frontend/public/datos-publicados.enc')
const commit = git('commit', '-m', `Publicar datos cifrados para todos los dispositivos (${new Date().toISOString().slice(0, 16)})

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`)
if (/nothing to commit/.test(commit.stdout + commit.stderr)) {
  console.log('  · Sin cambios respecto a lo ya publicado.')
} else {
  const push = git('push')
  if (push.status !== 0) { console.error('  ✗ git push falló:\n' + push.stderr); process.exit(1) }
  console.log('  ✓ Subido — Vercel despliega en ~1 min y todos los dispositivos lo reciben al refrescar.')
}
console.log('\n✓ Listo.')
