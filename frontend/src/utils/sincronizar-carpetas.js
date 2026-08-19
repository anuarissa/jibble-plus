// Núcleo (sin React) para re-leer las carpetas de Excel de UNO o de TODOS los
// locales. Lo usan el botón "Recargar Excels" del Dashboard, el panel de
// Configuración y los hooks por-local (useCarpetaHorarios / useCarpetaBiometrico).
//
// Dos modos:
//   normal  → actualiza y agrega lo que traen los Excel (nunca borra).
//   fiel    → además BORRA lo que ya no está en los archivos (persona sacada de
//             la semana, día vaciado, archivo eliminado). Con protecciones: si
//             algún archivo no se pudo leer (OneDrive solo-nube, Excel abierto)
//             o la carpeta quedó vacía, NO borra nada y lo reporta.

import * as XLSX from 'xlsx-js-style'
import {
  getHandle, listarCarpetas, estadoPermiso, pedirPermiso, leerCarpeta, getAliasesTurnos,
} from './carpeta-horarios'
import { parseBiometricoWorkbook } from './biometrico'
import { guardarBioMes, mesesConDatos, borrarBioMes } from './biometrico-store'

export const bioKey = groupId => 'bio:' + groupId

// Archivos "biometrico*.xls(x)" de la carpeta y sus subcarpetas (1 nivel — los
// exports de Tuesday viven en subcarpetas por mes).
export async function archivosBiometrico(handle) {
  const out = []
  const omitidos = []
  async function delDir(dir, profundidad) {
    for await (const entry of dir.values()) {
      if (entry.kind === 'directory') {
        if (profundidad < 1) await delDir(entry, profundidad + 1)
        continue
      }
      if (!/\.xlsx?$/i.test(entry.name)) continue
      if (entry.name.startsWith('~$')) continue
      if (!/biometric/i.test(entry.name)) continue
      try { out.push(await entry.getFile()) } catch { omitidos.push(entry.name) }
    }
  }
  await delDir(handle, 0)
  out.sort((a, b) => a.lastModified - b.lastModified) // el más nuevo pisa el mes repetido
  return { archivos: out, omitidos }
}

// Resuelve el handle y el permiso. → { handle } | { estado: 'sin-carpeta'|'requiere-permiso' }
async function abrirCarpeta(key, conGesto) {
  const handle = await getHandle(key)
  if (!handle) return { estado: 'sin-carpeta' }
  let permiso = await estadoPermiso(handle)
  if (permiso !== 'granted' && conGesto) permiso = await pedirPermiso(handle)
  if (permiso !== 'granted') return { estado: 'requiere-permiso', handle }
  return { handle }
}

// HORARIOS de un local. acciones = { setTurnosSemana, reemplazarTurnosDeLocal }
export async function sincronizarLocalHorarios(groupId, empleados, acciones, { conGesto = false, fiel = false, turnosActuales = null } = {}) {
  const abierta = await abrirCarpeta(groupId, conGesto)
  if (abierta.estado) return { tipo: 'horarios', groupId, estado: abierta.estado }

  const lectura = await leerCarpeta(abierta.handle, empleados || [], { aliases: getAliasesTurnos(groupId) })
  const semanas = Object.keys(lectura.aplicarPorSemana)

  // Protecciones de la recarga fiel: sin ellas, un archivo que OneDrive no bajó
  // (o que está abierto en Excel) haría desaparecer semanas enteras.
  const motivoAborto = !fiel ? null
    : lectura.archivosOmitidos?.length ? `no se pudieron leer ${lectura.archivosOmitidos.length} archivo(s) (¿abiertos en Excel o sin descargar de OneDrive?)`
    : !lectura.archivosLeidos.length ? 'la carpeta no tiene archivos legibles'
    : !semanas.length ? 'ningún archivo aportó semanas'
    : null

  let semanasAplicadas = 0
  let personasBorradas = 0
  if (fiel && !motivoAborto) {
    const ids = new Set((empleados || []).map(e => String(e.id)))
    for (const porPersona of Object.values(lectura.aplicarPorSemana)) {
      for (const pid of Object.keys(porPersona)) ids.add(String(pid))
    }
    if (turnosActuales) {
      for (const wk of lectura.semanasCubiertas) {
        for (const pid of Object.keys(turnosActuales[wk] || {})) {
          if (ids.has(String(pid)) && !lectura.aplicarPorSemana[wk]?.[pid]) personasBorradas++
        }
      }
    }
    acciones.reemplazarTurnosDeLocal(lectura.semanasCubiertas, lectura.aplicarPorSemana, [...ids])
    semanasAplicadas = lectura.semanasCubiertas.length
  } else {
    for (const [wk, datos] of Object.entries(lectura.aplicarPorSemana)) {
      const actual = turnosActuales?.[wk] || {}
      const sinCambios = Object.keys(datos).every(pid =>
        Object.keys(datos[pid]).every(dow => JSON.stringify(actual[pid]?.[dow]) === JSON.stringify(datos[pid][dow])))
      if (!sinCambios) { acciones.setTurnosSemana(wk, datos); semanasAplicadas++ }
    }
  }

  return {
    tipo: 'horarios', groupId, estado: 'listo', fiel: fiel && !motivoAborto, motivoAborto,
    semanasAplicadas, semanasDetectadas: semanas, personasBorradas,
    archivosLeidos: lectura.archivosLeidos, archivosOmitidos: lectura.archivosOmitidos || [],
    warnings: lectura.warnings, noEncontrados: lectura.noEncontrados,
    ambiguos: lectura.ambiguos || [],
    carpeta: abierta.handle.name,
  }
}

// BIOMÉTRICO de un local.
export async function sincronizarLocalBiometrico(groupId, { conGesto = false, fiel = false } = {}) {
  const abierta = await abrirCarpeta(bioKey(groupId), conGesto)
  if (abierta.estado) return { tipo: 'biometrico', groupId, estado: abierta.estado }

  const { archivos, omitidos } = await archivosBiometrico(abierta.handle)
  const warnings = []
  const mesesCargados = []
  const archivosLeidos = []
  for (const file of archivos) {
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const r = parseBiometricoWorkbook(wb)
      if (!r) { warnings.push(`${file.name}: no parece un export del biométrico — omitido`); continue }
      for (const w of r.warnings) warnings.push(`${file.name}: ${w}`)
      const res = guardarBioMes(groupId, r.mesStr, { marcas: r.marcas, personas: r.personasBio, archivo: file.name })
      if (!res.ok) { warnings.push(`${file.name}: ${res.error}`); continue }
      archivosLeidos.push(file.name)
      if (!mesesCargados.includes(r.mesStr)) mesesCargados.push(r.mesStr)
    } catch (e) {
      warnings.push(`${file.name}: ${e.message}`)
    }
  }

  const motivoAborto = !fiel ? null
    : omitidos.length ? `no se pudieron leer ${omitidos.length} archivo(s) del biométrico`
    : !archivosLeidos.length ? 'la carpeta no tiene exports legibles del biométrico'
    : null

  // Fiel: los meses guardados cuyo archivo ya no está en la carpeta se borran.
  let mesesBorrados = []
  if (fiel && !motivoAborto) {
    mesesBorrados = mesesConDatos(groupId).map(m => m.mesStr).filter(m => !mesesCargados.includes(m))
    for (const m of mesesBorrados) borrarBioMes(groupId, m)
  }

  return {
    tipo: 'biometrico', groupId, estado: 'listo', fiel: fiel && !motivoAborto, motivoAborto,
    mesesCargados: mesesCargados.sort(), mesesBorrados, archivosLeidos, archivosOmitidos: omitidos,
    warnings, carpeta: abierta.handle.name,
  }
}

// TODAS las carpetas conectadas (horarios + biométrico de todos los locales).
//   peoplePorLocal: { [groupId]: empleados[] }
//   acciones: { setTurnosSemana, reemplazarTurnosDeLocal }
// El bulk corre SIN pedir permiso (pedirPermiso consume la activación del gesto
// y solo el primero sería fiable) → los que lo necesiten se listan para
// re-otorgarlo de a uno desde Configuración.
export async function recargarTodo({ peoplePorLocal = {}, acciones, fiel = false, turnosActuales = null } = {}) {
  const keys = await listarCarpetas()
  const resultados = []
  for (const key of keys) {
    const esBio = String(key).startsWith('bio:')
    const groupId = esBio ? String(key).slice(4) : String(key)
    try {
      resultados.push(esBio
        ? await sincronizarLocalBiometrico(groupId, { fiel })
        : await sincronizarLocalHorarios(groupId, peoplePorLocal[groupId] || [], acciones, { fiel, turnosActuales }))
    } catch (e) {
      resultados.push({ tipo: esBio ? 'biometrico' : 'horarios', groupId, estado: 'error', error: e.message })
    }
  }
  const total = (campo) => resultados.reduce((a, r) => a + (Array.isArray(r[campo]) ? r[campo].length : (r[campo] || 0)), 0)
  return {
    resultados,
    carpetas: keys.length,
    locales: new Set(resultados.map(r => r.groupId)).size,
    semanasAplicadas: total('semanasAplicadas'),
    mesesCargados: total('mesesCargados'),
    personasBorradas: total('personasBorradas'),
    mesesBorrados: total('mesesBorrados'),
    requierenPermiso: resultados.filter(r => r.estado === 'requiere-permiso'),
    abortados: resultados.filter(r => r.motivoAborto),
    errores: resultados.filter(r => r.estado === 'error'),
  }
}
