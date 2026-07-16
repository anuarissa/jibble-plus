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
import { parseWorkbookTurnos, normalizarNombre } from './excel-turnos'

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

export async function conectarCarpeta(groupId) {
  const handle = await window.showDirectoryPicker({ id: 'horarios-' + groupId, mode: 'read' })
  await idbOp('readwrite', store => store.put(handle, groupId))
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
}

// === Lectura + parseo de la carpeta ===
// Devuelve { aplicarPorSemana, warnings, noEncontrados, archivosLeidos, celdasOk, celdasIgnoradas }
export async function leerCarpeta(handle, empleados, opts = {}) {
  const archivos = []
  for await (const entry of handle.values()) {
    if (entry.kind !== 'file') continue
    if (!/\.xlsx?$/i.test(entry.name)) continue
    if (entry.name.startsWith('~$')) continue // temporales de Excel abierto
    try {
      archivos.push(await entry.getFile())
    } catch {
      // archivo bloqueado o solo-nube sin descargar — se omite en esta pasada
    }
  }
  // Orden ascendente por fecha de modificación → el más reciente pisa semanas repetidas.
  archivos.sort((a, b) => a.lastModified - b.lastModified)

  const total = {
    aplicarPorSemana: {}, warnings: [], noEncontrados: [],
    archivosLeidos: [], celdasOk: 0, celdasIgnoradas: 0,
  }
  for (const file of archivos) {
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      // Formato simple no trae fechas: la semana sale del nombre del archivo
      // (los templates de la app se llaman turnos_<local>_<weekKey>.xlsx).
      const weekEnNombre = file.name.match(/(\d{4}-W\d{1,2})/)?.[1]
      const r = parseWorkbookTurnos(wb, empleados, { ...opts, weekKeyFallback: weekEnNombre })
      if (r.formato === 'simple' && !weekEnNombre) {
        total.warnings.push(`${file.name}: template simple sin semana en el nombre del archivo — omitido.`)
        continue
      }
      for (const [wk, porPersona] of Object.entries(r.aplicarPorSemana)) {
        // Semana repetida entre archivos → la del archivo más reciente reemplaza completa.
        total.aplicarPorSemana[wk] = porPersona
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
  return total
}
