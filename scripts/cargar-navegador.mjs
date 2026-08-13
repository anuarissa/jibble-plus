// Carga los datos de un mes DIRECTO en el Edge de Anuar (perfil Default) para
// jibble-plus.vercel.app — el "conectar carpetas" hecho por script:
//
//   node scripts/cargar-navegador.mjs            → julio 2026
//   node scripts/cargar-navegador.mjs 2026-08    → mes específico
//
// Cómo: arma el seed leyendo las carpetas del disco (biométrico Tuesday + Huper,
// cuadernos de horarios), CIERRA Edge (autorizado por Anuar 13-ago-2026), hace
// BACKUP completo de la carpeta Local Storage del perfil y MERGEA (nunca
// reemplaza) las keys jibble_attendance_bio_v1 y jibble_turnos_v1 escribiendo
// directo en el LevelDB del navegador. Al final reabre Edge en Sueldos.
//
// Por qué no por automatización del navegador: Edge/Chrome ≥136 bloquean CDP
// sobre el perfil por defecto (seguridad). La escritura directa con Edge cerrado
// es el único camino — con backup total para poder revertir.
// No toca: tarifas, condonaciones, extras aprobadas, aliases, configuración.

import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { spawnSync, spawn } from 'node:child_process'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(RAIZ, 'frontend', 'package.json'))
const esbuild = require('esbuild')
const { ClassicLevel } = require('classic-level')

const ORIGEN = 'https://jibble-plus.vercel.app'
const LEVELDB = 'C:/Users/anuar/AppData/Local/Microsoft/Edge/User Data/Default/Local Storage/leveldb'
const EDGE_EXE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p))

const mesArg = process.argv[2]
const mes = /^\d{4}-\d{2}$/.test(mesArg || '') ? mesArg : '2026-07'
if (mesArg && !/^\d{4}-\d{2}$/.test(mesArg)) console.error(`Mes inválido "${mesArg}" — usando 2026-07.`)

// Registro de localStorage en el leveldb de Chromium:
//   key   = "_<origen>\x00\x01<nombreKey>"   (latin1)
//   value = "\x00" + UTF-16LE | "\x01" + latin1
const claveDe = nombre => Buffer.concat([Buffer.from(`_${ORIGEN}\u0000\u0001`, 'latin1'), Buffer.from(nombre, 'latin1')])
const decodificar = buf => {
  if (!buf || !buf.length) return null
  return buf[0] === 0 ? buf.slice(1).toString('utf16le') : buf.slice(1).toString('latin1')
}
const codificar = str => Buffer.concat([Buffer.from([0]), Buffer.from(str, 'utf16le')])

// 1) Seed desde disco (bundle del core con esbuild, mismo patrón que los demás scripts)
const outDir = path.join(RAIZ, 'scripts', '.build')
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, 'cargar-navegador-core.bundle.mjs')
esbuild.buildSync({
  entryPoints: [path.join(RAIZ, 'scripts', 'cargar-navegador-core.mjs')],
  bundle: true, platform: 'node', format: 'esm',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  outfile: outFile,
  nodePaths: [path.join(RAIZ, 'frontend', 'node_modules'), path.join(RAIZ, 'backend', 'node_modules')],
  logLevel: 'warning',
})
const { armarSeed } = await import(pathToFileURL(outFile).href)
console.log(`\n════════ CARGAR ${mes} EN EL NAVEGADOR (Edge → ${ORIGEN}) ════════`)
const seed = await armarSeed(mes, RAIZ)
for (const linea of seed.resumen) console.log('  ·', linea)
if (!Object.keys(seed.bioStore).length) {
  console.error('  ✗ Nada que cargar (sin biométricos del mes). Abortando sin tocar el navegador.')
  process.exit(1)
}

// 2) Cerrar Edge (autorizado). Startup boost lo revive → matar árbol en loop.
const edgeVivo = () => spawnSync('tasklist', ['/FI', 'IMAGENAME eq msedge.exe'], { encoding: 'utf8' }).stdout.includes('msedge.exe')
if (edgeVivo()) console.log('  Cerrando Edge (autorizado — las pestañas se restauran al reabrir)…')
for (let intento = 0; intento < 6 && edgeVivo(); intento++) {
  spawnSync('taskkill', ['/F', '/T', '/IM', 'msedge.exe'], { encoding: 'utf8' })
  await new Promise(r => setTimeout(r, 1500))
}
if (edgeVivo()) { console.error('  ✗ Edge sigue corriendo. Ciérralo a mano y vuelve a correr.'); process.exit(1) }

// 3) BACKUP completo de la carpeta Local Storage (rollback total posible)
const ts = new Date().toISOString().replace(/[:.]/g, '-')
const dirBackup = path.join(RAIZ, 'DATOS LOCALES', '.backups', `leveldb-${ts}`)
fs.mkdirSync(dirBackup, { recursive: true })
fs.cpSync(LEVELDB, dirBackup, { recursive: true })
console.log(`  ✓ Backup completo del Local Storage → ${dirBackup}`)

// 4) MERGE conservador escribiendo en el LevelDB
const db = new ClassicLevel(LEVELDB, { keyEncoding: 'buffer', valueEncoding: 'buffer', createIfMissing: false })
await db.open()
try {
  const leerKey = async nombre => {
    try { return JSON.parse(decodificar(await db.get(claveDe(nombre)))) || {} } catch { return {} }
  }
  // sanity: el origen debe existir en este perfil (la app ya usada ahí)
  const config = await leerKey('jibble_app_config_v1')
  if (!config.setupComplete) console.log('  ⚠ Este perfil no tenía la app configurada — se cargan los datos igual.')

  const bio = await leerKey('jibble_attendance_bio_v1')
  for (const [g, meses] of Object.entries(seed.bioStore)) bio[g] = { ...(bio[g] || {}), ...meses }

  const turnos = await leerKey('jibble_turnos_v1')
  let semanasTocadas = 0
  for (const [wk, porPersona] of Object.entries(seed.turnos)) {
    turnos[wk] = { ...(turnos[wk] || {}) }
    for (const [pid, dias] of Object.entries(porPersona)) turnos[wk][pid] = { ...(turnos[wk][pid] || {}), ...dias }
    semanasTocadas++
  }

  // Workspace activo → 'all': con una sola cuenta seleccionada, la gente del
  // otro local no carga y la app no puede cruzar horarios ni comparar fuentes.
  const wsAntes = decodificar(await db.get(claveDe('jibble_active_workspace')).catch(() => null))
  await db.batch([
    { type: 'put', key: claveDe('jibble_attendance_bio_v1'), value: codificar(JSON.stringify(bio)) },
    { type: 'put', key: claveDe('jibble_turnos_v1'), value: codificar(JSON.stringify(turnos)) },
    { type: 'put', key: claveDe('jibble_active_workspace'), value: codificar('all') },
  ])
  if (wsAntes && wsAntes !== 'all') console.log(`  ✓ Workspace activo: '${wsAntes}' → 'all' (ver ambas cuentas Jibble)`)

  // Verificación por relectura
  const bioCheck = await leerKey('jibble_attendance_bio_v1')
  const turnosCheck = await leerKey('jibble_turnos_v1')
  const gruposOk = Object.keys(seed.bioStore).every(g => bioCheck[g]?.[mes]?.marcas?.length > 0)
  const semanasOk = Object.keys(seed.turnos).every(wk => turnosCheck[wk] && Object.keys(turnosCheck[wk]).length > 0)
  if (!gruposOk || !semanasOk) throw new Error('La relectura no cuadra — restaurar el backup y revisar.')
  console.log(`  ✓ Merge verificado: biométrico de ${Object.keys(seed.bioStore).length} local(es) en ${mes} · ${semanasTocadas} semanas de turnos actualizadas (${Object.keys(turnosCheck).length} en total)`)
} finally {
  await db.close()
}

// 5) Reabrir Edge en la página de Sueldos
if (EDGE_EXE) {
  spawn('cmd', ['/c', 'start', '', 'msedge', ORIGEN + '/sueldos'], { detached: true, stdio: 'ignore' }).unref()
  console.log('\n✓ Listo: Edge reabierto en Sueldos con los datos cargados.')
} else {
  console.log('\n✓ Datos cargados. Abre Edge en ' + ORIGEN + '/sueldos')
}
console.log(`  Para revertir: cerrar Edge y copiar de vuelta ${dirBackup} sobre la carpeta leveldb.`)
