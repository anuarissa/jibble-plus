// Panel de Configuración: todas las carpetas de Excel conectadas (horarios y
// biométrico de cada local), con su última sincronización y acciones. El botón
// "Recargar Excels" pide los permisos vencidos de a uno por click (límite del
// navegador); acá además se VE cuál carpeta quedó pidiendo permiso y se puede
// resolver individualmente.

import { useCallback, useEffect, useState } from 'react'
import { FolderSync, FolderOpen, FolderCheck, RefreshCw, X, CalendarDays, Fingerprint, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { listarCarpetas, conectarCarpeta, desconectarCarpeta, soportaCarpetas, getHandle, estadoPermiso } from '../utils/carpeta-horarios'
import { bioKey, sincronizarLocalHorarios, sincronizarLocalBiometrico } from '../utils/sincronizar-carpetas'
import { mesesConDatos } from '../utils/biometrico-store'
import { useRecargarExcels } from '../hooks/useRecargarExcels'
import { rutaSugerida } from '../config/carpetas-locales'

const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const labelMes = m => `${MESES_CORTO[Number(m.split('-')[1]) - 1]} ${m.split('-')[0]}`

const KEY_SYNC_HOR = 'jibble_carpetas_sync_v1'
const KEY_SYNC_BIO = 'jibble_carpetas_bio_sync_v1'
const readJSON = k => { try { return JSON.parse(localStorage.getItem(k)) || {} } catch { return {} } }

export function CarpetasExcelPanel({ cfg, groups, people }) {
  const [conectadas, setConectadas] = useState(null)   // Set de keys crudas
  const [permisos, setPermisos] = useState({})         // { key: 'granted'|'prompt'|'denied' }
  const [ocupado, setOcupado] = useState(null)
  const { recargar, cargando } = useRecargarExcels({ cfg, people })

  const refrescar = useCallback(async () => {
    if (!soportaCarpetas) { setConectadas(new Set()); return }
    try {
      const keys = (await listarCarpetas()).map(String)
      setConectadas(new Set(keys))
      // Estado de permiso por carpeta: sin esto una carpeta con permiso vencido
      // se ve idéntica a una sana y solo se descubre al apretar Recargar.
      const est = {}
      for (const k of keys) {
        try { est[k] = await estadoPermiso(await getHandle(k)) } catch { est[k] = 'none' }
      }
      setPermisos(est)
    } catch { setConectadas(new Set()) }
  }, [])
  useEffect(() => { refrescar() }, [refrescar])

  if (!soportaCarpetas) {
    return <p className="text-sm text-ink-300">Para leer carpetas de OneDrive hace falta Chrome o Edge en computadora.</p>
  }

  const syncHor = readJSON(KEY_SYNC_HOR)
  const syncBio = readJSON(KEY_SYNC_BIO)
  const empleadosDe = groupId => (people || []).filter(p => p.groupId === groupId)

  // ¿Ya hay datos de este local aunque la carpeta no esté conectada en ESTE
  // navegador? (los cargó el script desde la PC de Anuar o llegaron publicados)
  const datosDe = (groupId, tipo) => {
    if (tipo === 'biometrico') {
      const meses = mesesConDatos(groupId)
      if (!meses.length) return null
      return meses.length === 1
        ? `${labelMes(meses[0].mesStr)} · ${meses[0].personas} personas`
        : `${meses.length} meses cargados`
    }
    const ids = new Set(empleadosDe(groupId).map(p => String(p.id)))
    if (!ids.size) return null
    const semanas = Object.values(cfg.turnos || {}).filter(sem => Object.keys(sem || {}).some(pid => ids.has(String(pid)))).length
    return semanas ? `${semanas} semana${semanas > 1 ? 's' : ''} de horarios` : null
  }

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
          onClick={() => recargar({ fiel: true, conGesto: true })}
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
                const datos = conectada ? null : datosDe(g.id, f.tipo)
                const ruta = rutaSugerida(g.id, f.tipo)
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
                        {permisos[key] && permisos[key] !== 'granted' && (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-warn/40 bg-warn/10 px-2 py-1 text-[11px] text-warn" data-testid="badge-pide-permiso"
                            title='Edge perdió el permiso de lectura. Aprieta "Recargar" y en la ventanita elige "Permitir en cada visita" para que no lo vuelva a pedir.'>
                            <AlertTriangle size={11} /> pide permiso
                          </span>
                        )}
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
                          title='Volver a leer esta carpeta ahora. Si Edge pide permiso, elige "Permitir en cada visita" y no lo vuelve a pedir.'
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
                      <>
                        {datos && (
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-good/30 bg-good/5 px-2 py-1 text-xs text-ink-100" title="Ya cargado en este dispositivo (no hace falta conectar la carpeta para verlo)">
                            <FolderCheck size={13} className="text-good" /> {datos}
                          </span>
                        )}
                        <button
                          onClick={() => accion(id, async () => {
                            await conectarCarpeta(g.id, f.tipo === 'biometrico' ? { pickerPrefix: 'bio-', storageKey: key } : {})
                            const r = f.tipo === 'horarios'
                              ? await sincronizarLocalHorarios(g.id, empleadosDe(g.id), { setTurnosSemana: cfg.setTurnosSemana, reemplazarTurnosDeLocal: cfg.reemplazarTurnosDeLocal }, { conGesto: true, turnosActuales: cfg.turnos })
                              : await sincronizarLocalBiometrico(g.id, { conGesto: true })
                            toast.success(`${nombre}: carpeta conectada${r?.archivosLeidos?.length ? ` · ${r.archivosLeidos.length} archivo(s)` : ''}`)
                          })}
                          disabled={ocupado === id}
                          className={datos ? 'text-xs text-ink-300 hover:text-ink-50 underline underline-offset-2 transition-colors' : 'btn-ghost text-xs'}
                          title={ruta ? `Elige esta carpeta: ${ruta}` : undefined}
                        >
                          {datos ? 'Conectar carpeta para recargar tú mismo' : <><FolderOpen size={12} /> Conectar carpeta</>}
                        </button>
                        {ruta && <span className="text-[10px] text-ink-400 font-mono truncate max-w-[320px]" title={ruta}>{ruta}</span>}
                      </>
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
      <p className="text-xs text-ink-400 flex items-start gap-2">
        <FolderCheck size={13} className="mt-0.5 shrink-0" />
        Cuando Edge pregunte por una carpeta, elige <span className="text-ink-200 font-medium">"Permitir en cada visita"</span> — así "Recargar Excels" queda de un solo click, sin ventanitas, para siempre.
      </p>
    </div>
  )
}
