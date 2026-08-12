// Cuadre de sueldos de SBARRO HUPER contra el preliminar del contador (chequeo cuádruple).
//
//   node scripts/cuadre-huper.mjs            → julio 2026 (el mes del preliminar)
//   node scripts/cuadre-huper.mjs 2026-07    → mes específico
//
// Requiere en la raíz del proyecto:
//   - biometrico huper julio.xls  (export del biométrico físico)
//   - backend/.env con JIBBLE_API_KEY_ID_2 / SECRET_2 (cuenta de Huper)
// Genera reportes/CUADRE <MES> - SBARRO HUPER.html y su PDF (Edge headless).

import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(RAIZ, 'frontend', 'package.json'))
const esbuild = require('esbuild')

const mesArg = process.argv[2]
const mes = /^\d{4}-\d{2}$/.test(mesArg || '') ? mesArg : '2026-07'
if (mesArg && !/^\d{4}-\d{2}$/.test(mesArg)) {
  console.error(`Mes inválido "${mesArg}" — usa el formato 2026-07. Corriendo julio 2026.`)
}

const outDir = path.join(RAIZ, 'scripts', '.build')
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, 'cuadre-huper-core.bundle.mjs')

esbuild.buildSync({
  entryPoints: [path.join(RAIZ, 'scripts', 'cuadre-huper-core.mjs')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  outfile: outFile,
  nodePaths: [path.join(RAIZ, 'frontend', 'node_modules'), path.join(RAIZ, 'backend', 'node_modules')],
  logLevel: 'warning',
})

const { cuadreHuper } = await import(pathToFileURL(outFile).href)
const { rutaHtml, pdf } = await cuadreHuper(mes, RAIZ)

// PDF con Edge headless (el visor del contador no abre HTML)
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p))
if (EDGE) {
  const r = spawnSync(EDGE, [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
    `--print-to-pdf=${pdf}`, pathToFileURL(rutaHtml).href,
  ], { timeout: 60000 })
  if (fs.existsSync(pdf)) console.log(`✓ PDF: ${pdf}`)
  else console.error(`⚠ Edge no generó el PDF (código ${r.status}). Abre el HTML e imprime a PDF manualmente.`)
} else {
  console.error('⚠ No encontré msedge.exe — abre el HTML e imprime a PDF manualmente.')
}
