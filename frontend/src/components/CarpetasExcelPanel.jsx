// Panel de Configuración: todas las carpetas de Excel conectadas (horarios y
// biométrico de cada local), con su última sincronización y acciones. Acá se
// resuelven los permisos que el navegador vuelve a pedir — el botón global
// "Recargar Excels" no puede otorgarlos en lote (el navegador solo acepta uno
// por click).

import { useCallback, useEffect, useState } from 'react'
import { FolderSync, FolderOpen, FolderCheck, RefreshCw, X, CalendarDays, Fingerprint, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { listarCarpetas, conectarCarpeta, desconectarCarpeta, soportaCarpetas } from '../utils/carpeta-horarios'
import { bioKey, sincronizarLocalHorarios, sincronizarLocalBiometrico } from '../utils/sincronizar-carpetas'
import { useRecargarExcels } from '../hooks/useRecargarExcels'

const KEY_SYNC_HOR = 'jibble_carpetas_sync_v1'
const KEY_SYNC_BIO = 'jibble_carpetas_bio_sync_v1'
const readJSON = k => { try { return JSON.parse(localStorage.getItem(k)) || {} } catch { return {} } }

export function CarpetasExcelPanel({ cfg, groups, people }) {
  const [conectadas, setConectadas] = useState(null)   // Set de keys crudas
  const [ocupado, setOcupado] = useState(null)
  const { recargar, cargando } = useRecargarExcels({ cfg, people })

  const refrescar = useCallback(async () => {
    if (!soportaCarpetas) { setConectadas(new Set()); return }
    try { setConectadas(new Set((await listarCarpetas()).map(String))) } catch { setConectadas(new Set()) }
  }, [])
  useEffect(() => { refrescar() }, [refrescar])

  if (!soportaCarpetas) {
    return <p className="text-sm text-ink-300">Para leer carpetas de OneDrive hace falta Chrome o Edge en computadora.</p>
  }

  const syncHor = readJSON(KEY_SYNC_HOR)
  const syncBio = readJSON(KEY_SYNC_BIO)
  const empleadosDe = groupId => (people || []).filter(p => p.groupId === groupId)

  const accion = async (id, fn) => {
    setOcupado(id)
    try { await fn() } catch (e) { if (e?.name !== 'AbortError') toast.error(e.message) } finally { setOcupado(null); refrescar() }
  }

  const filas = [
    { tipo: 'horarios', icono: CalendarDays, label: 'Horarios (cuaderno del gerente)', keyDe: g => String(g.id), sync: syncHor },
    { tipo: 'biometrico', icono: Fingerprint, label: 'Biométrico (export del aparato)', keyDe: g => bioKey(g.id), sync: syncBio },
  ]

  return (
    <div className="space-y-4" data-testid="panel-carpetas">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => recargar({ fiel: true })}
          className="btn-secondary text-sm"
          disabled={cargando}
          data-testid="btn-recargar-todas"
        >
          <FolderSync size={14} className={cargando ? 'animate-spin' : ''} /> Recargar todas
        </button>
        <span className="text-xs text-ink-400">
          Vuelve a leer todos los Excel y deja los datos igual a los archivos de ahora (lo que borraste del Excel se borra acá).
        </span>
      </div>

      {(groups || []).map(g => {
        const nombre = cfg.config.locales[g.id]?.name || g.name
        const algunaConectada = filas.some(f => conectadas?.has(f.keyDe(g)))
        return (
          <div key={g.id} className={`surface-elevated p-4 ${algunaConectada ? '' : 'opacity-70'}`}>
            <div className="font-medium text-ink-50 mb-3">{cfg.config.locales[g.id]?.emoji || ''} {nombre}</div>
            <div className="space-y-2">
              {filas.map(f => {
                const key = f.keyDe(g)
                const conectada = conectadas?.has(key)
                const info = f.sync[g.id]
                const id = `${g.id}:${f.tipo}`
                const Icono = f.icono
                return (
                  <div key={f.tipo} className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="flex items-center gap-1.5 text-ink-200 min-w-[230px]">
                      <Icono size={14} className="text-ink-400" /> {f.label}
                    </span>
                    {conectada ? (
                      <>
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-good/30 bg-good/5 px-2 py-1 text-xs">
                          <FolderCheck size={13} className="text-good" />
                          <span className="max-w-[190px] truncate text-ink-100">{info?.carpeta || 'conectada'}</span>
                          {info?.ts && <span className="text-ink-400">{format(info.ts, 'dd MMM HH:mm')}</span>}
                        </span>
                        <button
                          onClick={() => accion(id, async () => {
                            const r = f.tipo === 'horarios'
                              ? await sincronizarLocalHorarios(g.id, empleadosDe(g.id), { setTurnosSemana: cfg.setTurnosSemana, reemplazarTurnosDeLocal: cfg.reemplazarTurnosDeLocal }, { conGesto: true, fiel: true, turnosActuales: cfg.turnos })
                              : await sincronizarLocalBiometrico(g.id, { conGesto: true, fiel: true })
                            if (r.estado === 'requiere-permiso') toast.warning('El navegador no dio permiso — vuelve a intentar')
                            else if (r.motivoAborto) toast.warning(`No se borró nada: ${r.motivoAborto}`)
                            else toast.success(`${nombre}: ${f.tipo === 'horarios' ? 'horarios' : 'biométrico'} al día`)
                          })}
                          disabled={ocupado === id}
                          className="btn-ghost text-xs"
                          title="Volver a leer esta carpeta ahora (pide permiso si el navegador lo perdió)"
                        >
                          <RefreshCw size={12} className={ocupado === id ? 'animate-spin' : ''} /> Recargar
                        </button>
                        <button
                          onClick={() => accion(id, async () => {
                            if (!confirm(`¿Desconectar la carpeta de ${f.tipo} de ${nombre}? Los datos ya cargados NO se borran.`)) return
                            await desconectarCarpeta(key)
                            toast.success('Carpeta desconectada')
                          })}
                          className="p-1 rounded-md text-ink-400 hover:text-bad transition-colors"
                          title="Desconectar"
                        >
                          <X size={13} />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => accion(id, async () => {
                          await conectarCarpeta(g.id, f.tipo === 'biometrico' ? { pickerPrefix: 'bio-', storageKey: key } : {})
                          const r = f.tipo === 'horarios'
                            ? await sincronizarLocalHorarios(g.id, empleadosDe(g.id), { setTurnosSemana: cfg.setTurnosSemana, reemplazarTurnosDeLocal: cfg.reemplazarTurnosDeLocal }, { conGesto: true, turnosActuales: cfg.turnos })
                            : await sincronizarLocalBiometrico(g.id, { conGesto: true })
                          toast.success(`${nombre}: carpeta conectada${r?.archivosLeidos?.length ? ` · ${r.archivosLeidos.length} archivo(s)` : ''}`)
                        })}
                        disabled={ocupado === id}
                        className="btn-ghost text-xs"
                      >
                        <FolderOpen size={12} /> Conectar carpeta
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <p className="text-xs text-ink-400 flex items-start gap-2">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        Si un Excel está abierto en tu PC o OneDrive todavía no lo descargó, esa carpeta no borra nada por seguridad: se actualiza lo demás y te avisa.
      </p>
    </div>
  )
}
