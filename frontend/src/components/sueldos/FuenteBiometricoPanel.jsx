// Panel de la fuente "Biométrico" en Sueldos: estado de la carpeta conectada,
// meses cargados y resolución de nombres del aparato → empleados.
// Mismo patrón visual que el conector de carpeta de horarios (TurnosTable).

import { FolderOpen, FolderCheck, RefreshCw, X, Fingerprint, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { borrarBioMes } from '../../utils/biometrico-store'

const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const labelMes = mesStr => {
  const [a, m] = mesStr.split('-')
  return `${MESES_CORTO[Number(m) - 1]} ${a}`
}

export function FuenteBiometricoPanel({
  carpeta, meses, noEncontrados, empleadosParaAlias, onAlias, sinDatosEnRango, rangoLabel, groupId,
}) {
  const { soportado, estado, nombreCarpeta, lastSync, resultado } = carpeta

  return (
    <div className="mb-6 space-y-3" data-testid="panel-biometrico">
      {/* Estado de la carpeta */}
      <div className="surface p-4 grain flex items-center gap-3 flex-wrap">
        <span className="flex items-center gap-2 text-ink-200 text-sm font-medium">
          <Fingerprint size={16} className="text-accent" /> Biométrico físico
        </span>

        {!soportado && (
          <span className="text-xs text-ink-400">Conectar carpetas requiere Chrome o Edge.</span>
        )}

        {soportado && (estado === 'sin-carpeta' || estado === 'cargando') && (
          <button onClick={carpeta.conectar} className="btn-secondary text-xs" data-testid="btn-conectar-bio">
            <FolderOpen size={14} /> Conectar carpeta del biométrico
          </button>
        )}

        {soportado && estado !== 'sin-carpeta' && estado !== 'cargando' && (
          <span className="inline-flex items-center gap-2 rounded-lg border border-good/30 bg-good/5 px-2.5 py-1.5 text-xs"
            title={resultado?.archivosLeidos?.length ? `Archivos: ${resultado.archivosLeidos.join(', ')}` : undefined}>
            <FolderCheck size={14} className="text-good" />
            <span className="max-w-[160px] truncate text-ink-100">{nombreCarpeta || 'Carpeta conectada'}</span>
            {lastSync && <span className="text-ink-400">{format(lastSync, 'dd MMM HH:mm')}</span>}
            <button
              onClick={() => carpeta.sincronizar({ conGesto: true })}
              disabled={estado === 'sincronizando'}
              className="p-1 rounded-md text-ink-300 hover:text-ink-50 focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent active:opacity-70 transition-colors disabled:opacity-40"
              title="Volver a sincronizar"
            >
              <RefreshCw size={13} className={estado === 'sincronizando' ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => { if (confirm('¿Desconectar la carpeta del biométrico? Los meses ya cargados no se borran.')) carpeta.desconectar() }}
              className="p-1 rounded-md text-ink-300 hover:text-bad focus-visible:outline focus-visible:outline-1 focus-visible:outline-bad active:opacity-70 transition-colors"
              title="Desconectar carpeta"
            >
              <X size={13} />
            </button>
          </span>
        )}

        {/* Meses cargados */}
        {meses.length > 0 && (
          <span className="flex items-center gap-1.5 flex-wrap text-[11px]">
            {meses.map(m => (
              <span key={m.mesStr} className="badge bg-bg-700/60 border border-white/10 text-ink-200 whitespace-nowrap inline-flex items-center gap-1"
                title={`${m.archivo} · ${m.personas} personas · ${m.marcas} días con marcas`}>
                {labelMes(m.mesStr)} · {m.personas}👤
                <button
                  onClick={() => { if (confirm(`¿Quitar ${labelMes(m.mesStr)} del biométrico de este local? (el archivo en tu carpeta no se toca)`)) borrarBioMes(groupId, m.mesStr) }}
                  className="text-ink-400 hover:text-bad transition-colors"
                  title="Quitar este mes de la app"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </span>
        )}
      </div>

      {/* Permiso expirado */}
      {estado === 'requiere-permiso' && (
        <div className="rounded-xl border border-warn/40 bg-warn/5 p-3.5 flex items-center gap-3 text-sm">
          <AlertTriangle size={16} className="text-warn shrink-0" />
          <span className="text-ink-200 flex-1">El navegador pide permiso de nuevo para leer la carpeta del biométrico.</span>
          <button onClick={() => carpeta.sincronizar({ conGesto: true })} className="btn-secondary text-xs whitespace-nowrap">
            Dar permiso y sincronizar
          </button>
        </div>
      )}

      {/* Sin datos en el rango que se está viendo */}
      {sinDatosEnRango && estado !== 'requiere-permiso' && (
        <div className="rounded-xl border border-warn/40 bg-warn/5 p-3.5 flex items-start gap-3 text-sm" data-testid="banner-sin-bio">
          <AlertTriangle size={16} className="text-warn mt-0.5 shrink-0" />
          <div className="text-ink-200">
            <span className="font-semibold text-warn">Sin marcas del biométrico en {rangoLabel}.</span>{' '}
            {estado === 'sin-carpeta'
              ? 'Conecta la carpeta donde guardas los exports del aparato (botón de arriba).'
              : 'Exporta el mes desde el aparato y suéltalo en la carpeta conectada (el archivo debe llevar "BIOMETRICO" en el nombre); después toca re-sincronizar.'}
          </div>
        </div>
      )}

      {/* Nombres del aparato sin empleado asignado (solo locales con gente en Jibble) */}
      {noEncontrados.length > 0 && empleadosParaAlias.length > 0 && (
        <div className="surface p-4 grain" data-testid="panel-nombres-bio">
          <p className="text-sm font-medium text-ink-100 mb-1">
            Nombres del biométrico sin empleado asignado ({noEncontrados.length})
          </p>
          <p className="text-xs text-ink-400 mb-3">
            Asigna cada nombre del aparato a su empleado (o ignóralo). Se guarda una sola vez y vale también para los horarios.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {noEncontrados.map(nombre => (
              <div key={nombre} className="flex items-center gap-2">
                <span className="text-sm text-ink-100 font-mono min-w-[110px] truncate" title={nombre}>{nombre}</span>
                <select
                  defaultValue=""
                  onChange={e => e.target.value && onAlias(nombre, e.target.value)}
                  className="input text-xs flex-1"
                >
                  <option value="" disabled>Asignar a…</option>
                  {empleadosParaAlias.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                  ))}
                  <option value="IGNORAR">— Ignorar siempre —</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warnings del sync */}
      {resultado?.warnings?.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-bg-700/30 p-3 text-xs text-ink-300 max-h-28 overflow-y-auto scrollbar-thin">
          {resultado.warnings.map((w, i) => <div key={i}>· {w}</div>)}
        </div>
      )}
      {resultado?.error && (
        <div className="rounded-xl border border-bad/40 bg-bad/5 p-3 text-sm text-bad">{resultado.error}</div>
      )}
    </div>
  )
}
