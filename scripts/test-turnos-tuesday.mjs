// Tests del parser de biométricos: node scripts/test-biometrico.mjs
// (bundlea el core con esbuild, mismo patrón que reporte-mensual.mjs)

import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(RAIZ, 'frontend', 'package.json'))
const esbuild = require('esbuild')

const outDir = path.join(RAIZ, 'scripts', '.build')
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, 'test-turnos-tuesday-core.bundle.mjs')

esbuild.buildSync({
  entryPoints: [path.join(RAIZ, 'scripts', 'test-turnos-tuesday-core.mjs')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  outfile: outFile,
  nodePaths: [path.join(RAIZ, 'frontend', 'node_modules'), path.join(RAIZ, 'backend', 'node_modules')],
  logLevel: 'warning',
})

const { correr } = await import(pathToFileURL(outFile).href)
const fallos = await correr(RAIZ.replace(/\\/g, '/'))
process.exit(fallos === 0 ? 0 : 1)
