// Hook de sincronización de exports del BIOMÉTRICO físico desde una carpeta
// OneDrive (calcado de useCarpetaHorarios). Diferencias:
//   - la carpeta puede tener SUBCARPETAS por mes (Tuesday: "07 JULIO SUELDOS 2026\")
//     → se recorre 1 nivel de profundidad
//   - solo se leen archivos con "biometrico" en el nombre (.xls/.xlsx); el mes real
//     sale de la fila "Periodo:" interna del export
//   - el resultado se guarda en jibble_attendance_bio_v1 (no en turnos)

import { useCallback, useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx-js-style'
import {
  soportaCarpetas, getHandle, conectarCarpeta, desconectarCarpeta,
  estadoPermiso, pedirPermiso,
} from '../utils/carpeta-horarios'
import { parseBiometricoWorkbook } from '../utils/biometrico'
import { guardarBioMes, mesesConDatos } from '../utils/biometrico-store'

const KEY_SYNC = 'jibble_carpetas_bio_sync_v1'
const bioKey = groupId => 'bio:' + groupId

function readSyncInfo() {
  try { return JSON.parse(localStorage.getItem(KEY_SYNC)) || {} } catch { return {} }
}

function writeSyncInfo(groupId, info) {
  const all = readSyncInfo()
  all[groupId] = info
  localStorage.setItem(KEY_SYNC, JSON.stringify(all))
}

// Junta los archivos "biometrico*.xls(x)" de la carpeta y sus subcarpetas (1 nivel).
async function archivosBiometrico(handle) {
  const out = []
  async function delDir(dir, profundidad) {
    for await (const entry of dir.values()) {
      if (entry.kind === 'directory') {
        if (profundidad < 1) await delDir(entry, profundidad + 1)
        continue
      }
      if (!/\.xlsx?$/i.test(entry.name)) continue
      if (entry.name.startsWith('~$')) continue
      if (!/biometric/i.test(entry.name)) continue
      try { out.push(await entry.getFile()) } catch { /* solo-nube sin descargar */ }
    }
  }
  await delDir(handle, 0)
  return out.sort((a, b) => a.lastModified - b.lastModified) // el más nuevo pisa el mes repetido
}

// estado: 'sin-soporte' | 'cargando' | 'sin-carpeta' | 'requiere-permiso' | 'listo' | 'sincronizando' | 'error'
export function useCarpetaBiometrico({ groupId, onDatosCargados }) {
  const [estado, setEstado] = useState(soportaCarpetas ? 'cargando' : 'sin-soporte')
  const [nombreCarpeta, setNombreCarpeta] = useState(null)
  const [resultado, setResultado] = useState(null) // { mesesCargados, archivosLeidos, warnings }
  const [lastSync, setLastSync] = useState(() => readSyncInfo()[groupId]?.ts || null)

  const onDatosRef = useRef(onDatosCargados)
  onDatosRef.current = onDatosCargados

  const sincronizar = useCallback(async ({ conGesto = false } = {}) => {
    if (!soportaCarpetas) return null
    const handle = await getHandle(bioKey(groupId))
    if (!handle) { setEstado('sin-carpeta'); return null }
    setNombreCarpeta(handle.name)

    let permiso = await estadoPermiso(handle)
    if (permiso !== 'granted' && conGesto) permiso = await pedirPermiso(handle)
    if (permiso !== 'granted') { setEstado('requiere-permiso'); return null }

    setEstado('sincronizando')
    try {
      const archivos = await archivosBiometrico(handle)
      const warnings = []
      const mesesCargados = []
      const archivosLeidos = []
      let algunDato = false
      for (const file of archivos) {
        try {
          const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
          const r = parseBiometricoWorkbook(wb)
          if (!r) { warnings.push(`${file.name}: no parece un export del biométrico — omitido`); continue }
          for (const w of r.warnings) warnings.push(`${file.name}: ${w}`)
          const res = guardarBioMes(groupId, r.mesStr, { marcas: r.marcas, personas: r.personasBio, archivo: file.name })
          if (!res.ok) { warnings.push(`${file.name}: ${res.error}`); continue }
          algunDato = true
          archivosLeidos.push(file.name)
          if (!mesesCargados.includes(r.mesStr)) mesesCargados.push(r.mesStr)
        } catch (e) {
          warnings.push(`${file.name}: ${e.message}`)
        }
      }
      const res = { mesesCargados: mesesCargados.sort(), archivosLeidos, warnings, meses: mesesConDatos(groupId) }
      setResultado(res)
      const ts = Date.now()
      setLastSync(ts)
      writeSyncInfo(groupId, { ts, carpeta: handle.name, meses: mesesCargados.length, archivos: archivosLeidos.length })
      setEstado('listo')
      if (algunDato) onDatosRef.current?.()
      return res
    } catch (e) {
      setResultado({ error: e.message })
      setEstado('error')
      return null
    }
  }, [groupId])

  const conectar = useCallback(async () => {
    try {
      await conectarCarpeta(groupId, { pickerPrefix: 'bio-', storageKey: bioKey(groupId) })
    } catch (e) {
      if (e?.name === 'AbortError') return null // usuario canceló el picker
      throw e
    }
    return sincronizar({ conGesto: true })
  }, [groupId, sincronizar])

  const desconectar = useCallback(async () => {
    await desconectarCarpeta(bioKey(groupId))
    setNombreCarpeta(null)
    setResultado(null)
    setEstado('sin-carpeta')
  }, [groupId])

  // Auto-sync al montar / cambiar de local
  const autoSyncDone = useRef(null)
  useEffect(() => {
    if (!soportaCarpetas) return
    if (autoSyncDone.current === groupId) return
    autoSyncDone.current = groupId
    sincronizar()
  }, [groupId, sincronizar])

  return { soportado: soportaCarpetas, estado, nombreCarpeta, lastSync, resultado, conectar, sincronizar, desconectar }
}
