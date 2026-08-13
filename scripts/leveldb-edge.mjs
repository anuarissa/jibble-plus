// Helpers compartidos para leer/escribir el localStorage del Edge de Anuar
// (perfil Default, origen jibble-plus.vercel.app) directo en el LevelDB de
// Chromium con Edge CERRADO. Los usan cargar-navegador.mjs y publicar-datos.mjs.
//
// Formato Chromium: key "_<origen>\x00\x01<nombreKey>" (latin1);
// valor "\x00"+UTF-16LE o "\x01"+latin1.

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync, spawn } from 'node:child_process'

export const ORIGEN = 'https://jibble-plus.vercel.app'
export const LEVELDB = 'C:/Users/anuar/AppData/Local/Microsoft/Edge/User Data/Default/Local Storage/leveldb'
export const EDGE_EXE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p))

export const claveDe = nombre => Buffer.concat([Buffer.from(`_${ORIGEN}\u0000\u0001`, 'latin1'), Buffer.from(nombre, 'latin1')])
export const decodificar = buf => {
  if (!buf || !buf.length) return null
  return buf[0] === 0 ? buf.slice(1).toString('utf16le') : buf.slice(1).toString('latin1')
}
export const codificar = str => Buffer.concat([Buffer.from([0]), Buffer.from(str, 'utf16le')])

export const edgeVivo = () => spawnSync('tasklist', ['/FI', 'IMAGENAME eq msedge.exe'], { encoding: 'utf8' }).stdout.includes('msedge.exe')

// Cierra Edge (autorizado por Anuar 13-ago-2026). Startup boost lo revive →
// matar el árbol en loop. Lanza error si no se deja cerrar.
export async function cerrarEdge() {
  if (edgeVivo()) console.log('  Cerrando Edge (autorizado — las pestañas se restauran al reabrir)…')
  for (let intento = 0; intento < 6 && edgeVivo(); intento++) {
    spawnSync('taskkill', ['/F', '/T', '/IM', 'msedge.exe'], { encoding: 'utf8' })
    await new Promise(r => setTimeout(r, 1500))
  }
  if (edgeVivo()) throw new Error('Edge sigue corriendo. Ciérralo a mano y vuelve a correr.')
  await new Promise(r => setTimeout(r, 1500))
}

export function abrirEdge(url = ORIGEN + '/sueldos') {
  if (!EDGE_EXE) return false
  spawn('cmd', ['/c', 'start', '', 'msedge', url], { detached: true, stdio: 'ignore' }).unref()
  return true
}

// Backup completo de la carpeta Local Storage → DATOS LOCALES/.backups/ (rollback total)
export function backupLevelDB(raiz) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = path.join(raiz, 'DATOS LOCALES', '.backups', `leveldb-${ts}`)
  fs.mkdirSync(dir, { recursive: true })
  fs.cpSync(LEVELDB, dir, { recursive: true })
  return dir
}

// Abre el LevelDB (Edge debe estar cerrado). classic-level vive en frontend/node_modules.
export async function abrirDB(raiz) {
  const require2 = createRequire(path.join(raiz, 'frontend', 'package.json'))
  const { ClassicLevel } = require2('classic-level')
  const db = new ClassicLevel(LEVELDB, { keyEncoding: 'buffer', valueEncoding: 'buffer', createIfMissing: false })
  await db.open()
  return db
}

export async function leerKeyJSON(db, nombre) {
  try { return JSON.parse(decodificar(await db.get(claveDe(nombre)))) } catch { return null }
}

export async function leerKeyString(db, nombre) {
  try { return decodificar(await db.get(claveDe(nombre))) } catch { return null }
}
