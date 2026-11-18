// Excel con TODAS las marcas del mes (entrada y salida de cada persona, día por
// día) de Sbarro Huper y S.O.S Pollo, SIN comparar contra horarios.
//
//   node scripts/marcas-del-mes.mjs 2026-10
//
// Lee Jibble (kiosco/celular) y, si existe, el export del aparato de huellas del
// mes en <LOCAL>\ASISTENCIA\2 BIOMETRICO. Si el export llega después, se vuelve
// a correr y el Excel sale completo. Mismo esquema que reporte-mensual.mjs.

import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(RAIZ, 'frontend', 'package.json'))
const esbuild = require('esbuild')

const mes = process.argv[2]
if (!/^\d{4}-\d{2}$/.test(mes || '')) {
  console.error('Uso: node scripts/marcas-del-mes.mjs 2026-10')
  process.exit(1)
}

const outDir = path.join(RAIZ, 'scripts', '.build')
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, 'marcas-del-mes-core.bundle.mjs')

esbuild.buildSync({
  entryPoints: [path.join(RAIZ, 'scripts', 'marcas-del-mes-core.mjs')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  outfile: outFile,
  nodePaths: [path.join(RAIZ, 'frontend', 'node_modules'), path.join(RAIZ, 'backend', 'node_modules')],
  logLevel: 'warning',
})

const { generarMarcas } = await import(pathToFileURL(outFile).href)
await generarMarcas(mes, RAIZ)
