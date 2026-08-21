// Tests de SOS Pollo (cuaderno + aparato): node scripts/test-sos.mjs
// (bundlea el core con esbuild, mismo patrón que test-biometrico.mjs)

import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(RAIZ, 'frontend', 'package.json'))
const esbuild = require('esbuild')

const outDir = path.join(RAIZ, 'scripts', '.build')
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, 'test-sos-core.bundle.mjs')

esbuild.buildSync({
  entryPoints: [path.join(RAIZ, 'scripts', 'test-sos-core.mjs')],
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
console.log(fallos === 0 ? '\n✅ TODOS LOS TESTS PASAN' : `\n❌ ${fallos} test(s) fallaron`)
process.exit(fallos === 0 ? 0 : 1)
