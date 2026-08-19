// Sincronización de turnos desde una carpeta local (OneDrive sincronizado en el PC)
// usando la File System Access API — solo Chromium (Chrome/Edge).
//
// El FileSystemDirectoryHandle se persiste en IndexedDB (no entra en localStorage).
// El permiso de lectura puede quedar guardado por el navegador ("Permitir en cada
// visita") → al abrir la app los horarios se leen y aplican solos.
//
// Cada local (groupId) tiene su propia carpeta. Se leen TODOS los .xlsx de la
// carpeta (ej. cuadernos "02/03 PLANILLAS SUPERVISOR..."), se parsean con
// parseWorkbookTurnos (formato planilla o template simple, autodetectado) y si dos
// archivos definen la misma semana gana el de modificación más reciente.

import * as XLSX from 'xlsx-js-style'
import { addDays } from 'date-fns'
import { parseWorkbookTurnos, normalizarNombre } from './excel-turnos'
import { esWorkbookTuesday, parseWorkbookTurnosTuesday } from './excel-turnos-tuesday'
import { isoWeekKey } from './turnos'

// Ventana de "recencia": semana actual + N anteriores. Nombres no encontrados y
// warnings de celdas de semanas más viejas se silencian (alta rotación de personal
// — esos nombres ya no existen), aunque sus turnos se aplican igual.
const SEMANAS_RECIENTES = 2

export const soportaCarpetas = typeof window !== 'undefined' && 'showDirectoryPicker' in window

// === Mini store IndexedDB (solo para los directory handles) ===
const DB_NAME = 'jibble_carpetas_v1'
const STORE = 'handles'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbOp(mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}

export function getHandle(groupId) {
  return idbOp('readonly', store => store.get(groupId))
}

// Todas las carpetas conectadas. Devuelve las keys crudas del store: `groupId`
// (carpeta de horarios) y `'bio:'+groupId` (carpeta del biométrico).
export function listarCarpetas() {
  return idbOp('readonly', store => store.getAllKeys())
}

// pickerPrefix distingue funcionalidades (horarios 'hor-', biométrico 'bio-') para
// que Chrome recuerde la última carpeta de CADA una; storageKey permite que ambas
// convivan en el mismo store de IndexedDB (biométrico usa 'bio:'+groupId).
export async function conectarCarpeta(groupId, { pickerPrefix = 'hor-', storageKey = groupId } = {}) {
  // id ≤ 32 chars (límite duro de la API, charset [a-zA-Z0-9_-]); único por local
  // para que Chrome recuerde la última carpeta elegida de CADA local por separado.
  const pickerId = (pickerPrefix + String(groupId).replace(/[^a-zA-Z0-9_-]/g, '')).slice(0, 32)
  const handle = await window.showDirectoryPicker({ id: pickerId, mode: 'read' })
  await idbOp('readwrite', store => store.put(handle, storageKey))
  return handle
}

export function desconectarCarpeta(groupId) {
  return idbOp('readwrite', store => store.delete(groupId))
}

// 'granted' | 'prompt' | 'denied' | 'none'
export async function estadoPermiso(handle) {
  if (!handle) return 'none'
  if (typeof handle.queryPermission !== 'function') return 'granted'
  return handle.queryPermission({ mode: 'read' })
}

// Requiere gesto de usuario (click).
export function pedirPermiso(handle) {
  if (typeof handle.requestPermission !== 'function') return Promise.resolve('granted')
  return handle.requestPermission({ mode: 'read' })
}

// === Alias de nombres (Excel → personId), persistidos en localStorage ===
// { "<groupId>:<nombreNormalizado>": personId | 'IGNORAR' }
const KEY_ALIASES = 'jibble_alias_nombres_v1'

function readAliasStore() {
  try { return JSON.parse(localStorage.getItem(KEY_ALIASES)) || {} } catch { return {} }
}

// Devuelve { [nombreNormalizado]: personId|'IGNORAR' } para pasar a parseWorkbookTurnos.
export function getAliases(groupId) {
  const all = readAliasStore()
  const out = {}
  const prefix = groupId + ':'
  for (const k of Object.keys(all)) {
    if (k.startsWith(prefix)) out[k.slice(prefix.length)] = all[k]
  }
  return out
}

export function setAlias(groupId, nombreExcel, personIdOIgnorar) {
  const all = readAliasStore()
  all[groupId + ':' + normalizarNombre(nombreExcel)] = personIdOIgnorar
  localStorage.setItem(KEY_ALIASES, JSON.stringify(all))
  // Avisar a la app: los alias deciden a quién pertenecen las marcas del
  // aparato (y si hay que crear una persona nueva), así que hay que recalcular.
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_ALIAS))
}

export const EVENTO_ALIAS = 'jibble:alias-updated'

// Versión monotónica de los alias — dep de useMemo para recalcular al cambiarlos.
let versionAlias = 0
if (typeof window !== 'undefined') window.addEventListener(EVENTO_ALIAS, () => { versionAlias++ })
export function subscribeAlias(cb) {
  window.addEventListener(EVENTO_ALIAS, cb)
  return () => window.removeEventListener(EVENTO_ALIAS, cb)
}
export function getAliasVersion() { return versionAlias }

// === Lectura + parseo de la carpeta ===
// Devuelve { aplicarPorSemana, warnings, noEncontrados, archivosLeidos, celdasOk, celdasIgnoradas }
export async function leerCarpeta(handle, empleados, opts = {}) {
  const archivos = []
  // Archivos que existen pero no se pudieron leer (bloqueados por Excel abierto,
  // o solo-nube sin descargar). Se reportan: una recarga fiel NO debe borrar las
  // semanas que traía un archivo que hoy simplemente no se pudo abrir.
  const omitidos = []
  for await (const entry of handle.values()) {
    if (entry.kind !== 'file') continue
    if (!/\.xlsx?$/i.test(entry.name)) continue
    if (entry.name.startsWith('~$')) continue // temporales de Excel abierto
    try {
      archivos.push(await entry.getFile())
    } catch {
      omitidos.push(entry.name)
    }
  }
  // Orden ascendente por fecha de modificación → el más reciente pisa semanas repetidas.
  archivos.sort((a, b) => a.lastModified - b.lastModified)

  const total = {
    aplicarPorSemana: {}, warnings: [], noEncontrados: [],
    archivosLeidos: [], celdasOk: 0, celdasIgnoradas: 0,
    archivosOmitidos: omitidos,
  }
  const desdeSemana = isoWeekKey(addDays(new Date(), -7 * SEMANAS_RECIENTES))
  for (const file of archivos) {
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      // Formato simple no trae fechas: la semana sale del nombre del archivo
      // (los templates de la app se llaman turnos_<local>_<weekKey>.xlsx).
      const weekEnNombre = file.name.match(/(\d{4}-W\d{1,2})/)?.[1]
      // Cuaderno de Tuesday (hoja PERSONAL TUESDAY) tiene su propio formato/parser.
      const parse = esWorkbookTuesday(wb) ? parseWorkbookTurnosTuesday : parseWorkbookTurnos
      const r = parse(wb, empleados, { ...opts, weekKeyFallback: weekEnNombre, desdeSemana })
      if (r.formato === 'simple' && !weekEnNombre) {
        total.warnings.push(`${file.name}: template simple sin semana en el nombre del archivo — omitido.`)
        continue
      }
      for (const [wk, porPersona] of Object.entries(r.aplicarPorSemana)) {
        // Semana repetida entre archivos: se MERGEA por persona y el archivo más
        // reciente pisa a esa persona. (Antes se reemplazaba la semana entera, lo
        // que borraba a la gente que solo estaba en otro cuaderno de la carpeta.)
        total.aplicarPorSemana[wk] = { ...(total.aplicarPorSemana[wk] || {}), ...porPersona }
      }
      for (const w of r.warnings) {
        // En sync de carpeta, multi-semana es lo normal y los nombres no
        // encontrados tienen su propio panel de resolución → no son warnings.
        if (w.startsWith('Detectadas') || w.startsWith('Empleados no encontrados')) continue
        const linea = `${file.name}: ${w}`
        if (!total.warnings.includes(linea)) total.warnings.push(linea)
      }
      for (const n of r.noEncontrados) {
        if (!total.noEncontrados.includes(n)) total.noEncontrados.push(n)
      }
      total.celdasOk += r.celdasOk
      total.celdasIgnoradas += r.celdasIgnoradas
      total.archivosLeidos.push(file.name)
    } catch (e) {
      total.warnings.push(`${file.name}: ${e.message}`)
    }
  }
  // Rango de semanas que ESTA carpeta cubre hoy (contiguo, de la más vieja a la
  // más nueva encontrada). Sirve a la recarga fiel para saber en qué semanas
  // puede borrar: fuera de este rango no hay información, no se toca nada.
  total.semanasCubiertas = semanasDelRango(Object.keys(total.aplicarPorSemana))
  return total
}

// ['2026-W27','2026-W30'] → todas las semanas ISO entre la primera y la última.
export function semanasDelRango(weekKeys) {
  const keys = (weekKeys || []).filter(Boolean).sort()
  if (!keys.length) return []
  const lunesDe = wk => {
    const [y, w] = wk.split('-W')
    const ene4 = new Date(Number(y), 0, 4)
    const lunW1 = new Date(ene4)
    lunW1.setDate(ene4.getDate() - ((ene4.getDay() + 6) % 7))
    const d = new Date(lunW1)
    d.setDate(lunW1.getDate() + (Number(w) - 1) * 7)
    return d
  }
  const out = []
  const fin = lunesDe(keys[keys.length - 1])
  for (let d = lunesDe(keys[0]); d <= fin; d.setDate(d.getDate() + 7)) out.push(isoWeekKey(new Date(d)))
  return out
}
