// Reporte mensual de asistencia por local, sin abrir el navegador.
//
//   node scripts/reporte-mensual.mjs            → mes anterior
//   node scripts/reporte-mensual.mjs 2026-07    → mes específico
//
// Bundlea el núcleo con esbuild (viene con Vite) porque los utils del frontend
// usan imports sin extensión que node puro no resuelve, y luego lo ejecuta.

import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(RAIZ, 'frontend', 'package.json'))
const esbuild = require('esbuild')

const mesArg = process.argv[2]
const mes = /^\d{4}-\d{2}$/.test(mesArg || '')
  ? mesArg
  : (() => {
      const d = new Date()
      d.setMonth(d.getMonth() - 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })()

if (mesArg && !/^\d{4}-\d{2}$/.test(mesArg)) {
  console.error(`Mes inválido "${mesArg}" — usa el formato 2026-07. Generando el mes anterior (${mes}).`)
}

const outDir = path.join(RAIZ, 'scripts', '.build')
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, 'reporte-mensual-core.bundle.mjs')

esbuild.buildSync({
  entryPoints: [path.join(RAIZ, 'scripts', 'reporte-mensual-core.mjs')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  // xlsx hace require() dinámicos de módulos de node → dejarlos externos
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  outfile: outFile,
  nodePaths: [path.join(RAIZ, 'frontend', 'node_modules'), path.join(RAIZ, 'backend', 'node_modules')],
  logLevel: 'warning',
})

const { generarReportes } = await import(pathToFileURL(outFile).href)
await generarReportes(mes, RAIZ)
