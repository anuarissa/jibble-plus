// Cuadre de sueldos de TUESDAY AMÉRICA contra la planilla bancaria del contador.
//
//   node scripts/cuadre-tuesday.mjs            → julio 2026
//   node scripts/cuadre-tuesday.mjs 2026-07    → mes específico
//
// Fuentes: biométrico + banco en OneDriveAnuarTuesdaySUELDOSSUELDOS 2026, horarios en el cuaderno
// del gerente (TUESDAY AMERICACUADERNOS DE GERENTES). Genera HTML + PDF en reportes/.

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
const outFile = path.join(outDir, 'cuadre-tuesday-core.bundle.mjs')

esbuild.buildSync({
  entryPoints: [path.join(RAIZ, 'scripts', 'cuadre-tuesday-core.mjs')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  outfile: outFile,
  nodePaths: [path.join(RAIZ, 'frontend', 'node_modules'), path.join(RAIZ, 'backend', 'node_modules')],
  logLevel: 'warning',
})

const { cuadreTuesday } = await import(pathToFileURL(outFile).href)
const { rutaHtml, pdf } = await cuadreTuesday(mes, RAIZ)

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
