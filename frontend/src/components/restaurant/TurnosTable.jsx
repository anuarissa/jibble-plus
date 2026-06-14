import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, format, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight, Copy, Download, Upload, AlertCircle, StickyNote, X, Pencil, Save, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '../ui/Avatar'
import {
  isoWeekKey, semanaAnteriorKey, DIAS_LABEL,
  getDefaultParaDia, normalizarCelda, esExcepcion, tipoExcepcion, contarCambios, turnoToText,
} from '../../utils/turnos'
import { descargarTemplateTurnos, parseExcelTurnosAuto } from '../../utils/excel-turnos'

// Texto de una celda para la lista de cambios: "08:00-16:00" o "09:00-16:00 + 18:00-23:00".
const celdaTexto = (celda) => turnoToText(celda)

// Sentinel para borrar una celda (volver al default) en el buffer.
const DELETE = '__DELETE__'

export function TurnosTable({ group, empleados, schedules, cfg }) {
  const [offset, setOffset] = useState(0)
  const [showCambios, setShowCambios] = useState(false)
  const [editingNota, setEditingNota] = useState(null) // { personId, dow }
  // Buffer de cambios pendientes — { [personId]: { [dow]: valor | DELETE } }
  const [pending, setPending] = useState({})
  // Avisos persistentes del último import (empleados no encontrados, celdas mal formateadas, etc.)
  const [importWarnings, setImportWarnings] = useState([])
  const fileInputRef = useRef(null)

  const ini = useMemo(() => addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), offset * 7), [offset])
  const fin = useMemo(() => addDays(ini, 6), [ini])
  const weekKey = useMemo(() => isoWeekKey(ini), [ini])

  const semanaTurnos = cfg.turnos?.[weekKey] || {}
  const semanaAnterior = semanaAnteriorKey(weekKey)
  const tienePrev = !!cfg.turnos?.[semanaAnterior]
  const nombreLocal = cfg.config.locales[group.id]?.name || group.name

  // Merge de turnos guardados + pending para visualización efectiva.
  // Útil para contarCambios y para resolver el valor que ve cada celda.
  const turnosEfectivos = useMemo(() => {
    const semana = { ...semanaTurnos }
    for (const pid of Object.keys(pending)) {
      const merged = { ...(semana[pid] || {}) }
      for (const dow of Object.keys(pending[pid])) {
        const v = pending[pid][dow]
        if (v === DELETE) delete merged[dow]
        else merged[dow] = v
      }
      semana[pid] = merged
    }
    return semana
  }, [semanaTurnos, pending])

  // Excepciones de la semana (basadas en lo efectivo, incluyendo pending)
  const cambios = useMemo(
    () => contarCambios(turnosEfectivos, empleados, schedules, cfg.personOverrides),
    [turnosEfectivos, empleados, schedules, cfg.personOverrides]
  )

  // Cantidad de cambios pendientes (sin guardar)
  const pendingCount = useMemo(() => {
    let n = 0
    for (const pid of Object.keys(pending)) n += Object.keys(pending[pid]).length
    return n
  }, [pending])

  // Resetear pending al cambiar de semana — con confirmación si hay pending
  const lastWeekKeyRef = useRef(weekKey)
  useEffect(() => {
    if (lastWeekKeyRef.current === weekKey) return
    if (pendingCount > 0) {
      const ok = window.confirm(`Tienes ${pendingCount} cambios sin guardar. ¿Descartarlos?`)
      if (!ok) {
        // No se puede revertir el setOffset desde acá; al menos limpiar para evitar loop.
      }
    }
    setPending({})
    lastWeekKeyRef.current = weekKey
  }, [weekKey, pendingCount])

  // Aviso al cerrar la pestaña con cambios pendientes
  useEffect(() => {
    function beforeUnload(e) {
      if (pendingCount > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [pendingCount])

  function handleCopiarPrev() {
    if (!tienePrev) {
      toast.error('La semana anterior no tiene turnos cargados.')
      return
    }
    if (pendingCount > 0) {
      if (!confirm(`Tienes ${pendingCount} cambios sin guardar. ¿Descartarlos y copiar?`)) return
    }
    if (!confirm(`¿Copiar todos los turnos de la semana ${semanaAnterior} sobre ${weekKey}? Sobreescribe lo actual.`)) return
    cfg.copiarTurnosDesdeAnterior(weekKey, semanaAnterior)
    setPending({})
    toast.success(`Turnos copiados desde ${semanaAnterior}`)
  }

  function handleDescargar() {
    descargarTemplateTurnos({ empleados, turnos: cfg.turnos, weekKey, nombreLocal })
    toast.success('Template descargado')
  }

  async function handleImportar(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const result = await parseExcelTurnosAuto(file, empleados, weekKey)
      const semanasAplicar = Object.entries(result.aplicarPorSemana || {})
      if (semanasAplicar.length === 0 || result.celdasOk === 0) {
        toast.error('No se pudo aplicar ninguna celda. Revisa el formato.')
        return
      }

      // Si hay pending sin guardar, confirmar antes de pisarlos.
      if (pendingCount > 0) {
        if (!confirm(`Tienes ${pendingCount} cambios sin guardar. ¿Reemplazarlos por la importación?`)) return
      }

      // Otras semanas (no visibles) → guardar directo. La visible va al buffer pending.
      let directas = 0
      const semanasDirectas = []
      for (const [wk, datos] of semanasAplicar) {
        if (wk !== weekKey) {
          cfg.setTurnosSemana(wk, datos)
          for (const pid of Object.keys(datos)) directas += Object.keys(datos[pid]).length
          semanasDirectas.push(wk)
        }
      }

      // Convertir los datos de la semana visible a shape pending, filtrando los que
      // ya coinciden con lo guardado (no son cambios reales).
      const datosVisible = result.aplicarPorSemana[weekKey] || {}
      const nuevoPending = {}
      let buffered = 0
      for (const pid of Object.keys(datosVisible)) {
        const persona = {}
        for (const dow of Object.keys(datosVisible[pid])) {
          const v = datosVisible[pid][dow]
          const original = semanaTurnos[pid]?.[dow]
          if (JSON.stringify(v) !== JSON.stringify(original)) {
            persona[dow] = v
            buffered++
          }
        }
        if (Object.keys(persona).length > 0) nuevoPending[pid] = persona
      }
      setPending(nuevoPending)

      const formatoLabel = result.formato === 'anuar' ? '(formato planilla)' : '(template)'
      if (semanasDirectas.length === 0) {
        if (buffered === 0) {
          toast.message(`Excel sin cambios respecto a lo guardado ${formatoLabel}`, { duration: 5000 })
        } else {
          toast.success(`${buffered} turnos cargados en preview. Apretá Guardar para confirmar. ${formatoLabel}`, { duration: 6000 })
        }
      } else if (buffered === 0) {
        toast.success(`${directas} turnos guardados en ${semanasDirectas.length} ${semanasDirectas.length === 1 ? 'semana distinta' : 'semanas distintas'} a la actual ${formatoLabel}`, { duration: 5000 })
      } else {
        toast.success(`${buffered} turnos en preview (semana actual) + ${directas} guardados en ${semanasDirectas.length === 1 ? 'otra semana' : 'otras semanas'}. ${formatoLabel}`, { duration: 6000 })
      }

      // Persistir warnings (empleados no encontrados, celdas mal formateadas) en panel visible.
      // Reemplazan los del import anterior. Si no hay, limpiar.
      setImportWarnings(result.warnings || [])
      if (result.warnings.length > 0) {
        result.warnings.forEach(w => console.warn('[Excel import]', w))
      }
    } catch (err) {
      toast.error('Error leyendo Excel: ' + err.message)
    }
  }

  // Cuando el usuario edita una celda, NO se persiste en localStorage —
  // solo en el buffer pending. Hasta que aprieten Guardar.
  function handleCellChange(personId, dow, valor) {
    setPending(prev => {
      const next = { ...prev }
      const persona = { ...(next[personId] || {}) }
      // Si valor === null y la celda guardada original tampoco tenía valor,
      // limpiar la entrada en lugar de marcarla como DELETE
      const original = semanaTurnos[personId]?.[String(dow)]
      if (valor == null) {
        if (original == null) {
          // No había nada → no marcamos delete, solo quitar del pending si estaba
          delete persona[String(dow)]
        } else {
          persona[String(dow)] = DELETE
        }
      } else {
        // Si el nuevo valor es igual al original, no es un cambio real
        if (JSON.stringify(valor) === JSON.stringify(original)) {
          delete persona[String(dow)]
        } else {
          persona[String(dow)] = valor
        }
      }
      if (Object.keys(persona).length === 0) delete next[personId]
      else next[personId] = persona
      return next
    })
  }

  // Las notas se guardan directo (no pasan por el buffer).
  // Nota está pensada como auditoría / contexto, no como cambio operativo reversible.
  function handleNotaChange(personId, dow, nota) {
    cfg.setNotaCelda(weekKey, personId, dow, nota)
    setEditingNota(null)
    if (nota) toast.success('Nota guardada')
  }

  function handleGuardar() {
    let n = 0
    for (const pid of Object.keys(pending)) {
      for (const dow of Object.keys(pending[pid])) {
        const v = pending[pid][dow]
        if (v === DELETE) cfg.setTurnoCelda(weekKey, pid, parseInt(dow), null)
        else cfg.setTurnoCelda(weekKey, pid, parseInt(dow), v)
        n++
      }
    }
    setPending({})
    toast.success(`${n} ${n === 1 ? 'cambio guardado' : 'cambios guardados'}`)
  }

  function handleDescartar() {
    if (pendingCount === 0) return
    if (!confirm(`¿Descartar ${pendingCount} cambios sin guardar?`)) return
    setPending({})
    toast.message('Cambios descartados')
  }

  return (
    <div className="surface p-5 grain">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h3 className="font-display font-semibold text-lg">Turnos rotativos</h3>
          <p className="text-xs text-ink-300 mt-0.5">
            Semana {weekKey} · {format(ini, 'dd MMM')} al {format(fin, 'dd MMM')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <button onClick={() => setOffset(o => o - 1)} className="btn-ghost p-2"><ChevronLeft size={16} /></button>
            <button onClick={() => setOffset(0)} className="btn-secondary text-xs">Esta semana</button>
            <button onClick={() => setOffset(o => o + 1)} className="btn-ghost p-2"><ChevronRight size={16} /></button>
          </div>
          <button onClick={handleCopiarPrev} disabled={!tienePrev} className="btn-secondary text-xs disabled:opacity-40">
            <Copy size={14} /> Copiar semana anterior
          </button>
          <button onClick={handleDescargar} className="btn-secondary text-xs">
            <Download size={14} /> Excel template
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="btn-secondary text-xs">
            <Upload size={14} /> Importar Excel
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportar} />
        </div>
      </div>

      {/* Banner sticky cuando hay cambios pendientes */}
      {pendingCount > 0 && (
        <div className="mb-4 sticky top-2 z-30 surface-elevated border-accent/40 ring-1 ring-accent/40 shadow-glow">
          <div className="p-3 flex items-center gap-3 flex-wrap">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="font-medium text-ink-50 text-sm">
              {pendingCount} {pendingCount === 1 ? 'cambio sin guardar' : 'cambios sin guardar'}
            </span>
            <span className="text-xs text-ink-300">— se aplicarán cuando aprietes Guardar</span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={handleDescartar} className="btn-ghost text-xs">
                <Undo2 size={13} /> Descartar
              </button>
              <button onClick={handleGuardar} className="btn-primary text-xs">
                <Save size={13} /> Guardar todos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Avisos del último import (empleados no encontrados, etc.) — persistentes hasta cerrar */}
      {importWarnings.length > 0 && (
        <div className="mb-4 rounded-xl border border-warn/40 bg-warn/5">
          <div className="p-3 flex items-start gap-3">
            <AlertCircle size={18} className="text-warn mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-ink-50 text-sm mb-1">
                Avisos del Excel importado ({importWarnings.length})
              </div>
              <ul className="text-sm text-ink-200 space-y-1 list-disc pl-4">
                {importWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
              <div className="text-xs text-ink-300 mt-2">
                La importación cargó solo los empleados que sí están en el sistema. Revisa los nombres si falta alguien.
              </div>
            </div>
            <button onClick={() => setImportWarnings([])} className="btn-ghost p-1.5 shrink-0" title="Cerrar avisos">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {cambios.length > 0 && (
        <div className="mb-4 surface-elevated border-accent/30">
          <button
            onClick={() => setShowCambios(s => !s)}
            className="w-full p-3 flex items-center gap-2 text-left hover:bg-accent/5 transition"
          >
            <Pencil size={14} className="text-accent" />
            <span className="font-medium text-ink-50">
              {cambios.length} {cambios.length === 1 ? 'cambio' : 'cambios'} respecto al horario base
            </span>
            <ChevronRight size={14} className={`ml-auto text-ink-300 transition ${showCambios ? 'rotate-90' : ''}`} />
          </button>
          {showCambios && (
            <ul className="px-4 pb-3 pt-1 space-y-1 text-sm border-t border-white/5">
              {cambios.map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-ink-200">
                  <span className="font-medium text-ink-50">{c.fullName}</span>
                  <span className="text-ink-400">·</span>
                  <span className="text-xs uppercase tracking-wider text-ink-300">{DIAS_LABEL[c.dow - 1]}</span>
                  <span className="text-ink-400">·</span>
                  {c.tipo === 'cambio-horario' && (
                    <span className="text-xs">
                      <span className="text-ink-400 line-through">{c.defaultDia.startTime}-{c.defaultDia.endTime}</span>
                      {' → '}
                      <span className="text-accent font-mono">{celdaTexto(c.celda)}</span>
                    </span>
                  )}
                  {c.tipo === 'cambio-off' && <span className="text-xs"><span className="text-ink-400 line-through">{c.defaultDia.startTime}-{c.defaultDia.endTime}</span> → <span className="text-bad">OFF</span></span>}
                  {c.tipo === 'cubre' && <span className="text-xs"><span className="text-ink-400 line-through">OFF</span> → <span className="text-good font-mono">{celdaTexto(c.celda)}</span> (cubre)</span>}
                  {c.nota && <span className="text-xs italic text-accent-400 ml-1">"{c.nota}"</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {empleados.length === 0 ? (
        <div className="bg-bg-700/40 rounded-xl p-6 text-center">
          <AlertCircle size={20} className="mx-auto text-warn mb-2" />
          <p className="text-sm text-ink-200">Este local no tiene empleados activos asignados.</p>
          <p className="text-xs text-ink-400 mt-1">Asígnalos desde Configuración → Asignar empleados a locales.</p>
        </div>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="text-left">
                <th className="text-xs uppercase tracking-wider text-ink-300 pb-3 font-medium pr-3">Empleado</th>
                {DIAS_LABEL.map((d, i) => (
                  <th key={d} className="text-center text-xs uppercase tracking-wider text-ink-300 pb-3 font-medium px-1">
                    <div>{d}</div>
                    <div className="text-ink-400 mt-0.5 font-mono">{format(addDays(ini, i), 'dd')}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {empleados.map(emp => {
                const sched = schedules?.find(s => s.personId === emp.id)
                return (
                  <tr key={emp.id} className="border-t border-white/5">
                    <td className="py-3 pr-3 align-top">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={emp.fullName} id={emp.id} size="sm" />
                        <div className="min-w-0">
                          <div className="font-medium text-ink-50 text-sm truncate">{emp.fullName}</div>
                          <div className="text-xs text-ink-300 truncate">{emp.position || '—'}</div>
                        </div>
                      </div>
                    </td>
                    {[1, 2, 3, 4, 5, 6, 7].map(dow => {
                      const valorEfectivo = turnosEfectivos[emp.id]?.[String(dow)]
                      const valorOriginal = semanaTurnos[emp.id]?.[String(dow)]
                      const def = getDefaultParaDia(emp.id, dow, cfg.personOverrides, sched)
                      const isEditing = editingNota?.personId === emp.id && editingNota?.dow === dow
                      const tienePending = pending[emp.id]?.[String(dow)] !== undefined
                      return (
                        <td key={dow} className="px-1 py-1 align-top">
                          <TurnoCell
                            valor={valorEfectivo}
                            valorOriginal={valorOriginal}
                            tienePending={tienePending}
                            defaultDia={def}
                            onChange={(v) => handleCellChange(emp.id, dow, v)}
                            onAbrirNota={() => setEditingNota({ personId: emp.id, dow })}
                            isEditingNota={isEditing}
                            onCerrarNota={() => setEditingNota(null)}
                            onGuardarNota={(nota) => handleNotaChange(emp.id, dow, nota)}
                          />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-white/5 text-xs text-ink-300 space-y-1">
        <p>El horario en gris claro es el <strong>default del empleado</strong>. Si una celda difiere, se marca con un borde lateral de color y un punto pequeño dentro.</p>
        <p>🟧 cambio de horario · 🟢 cubre (antes era libre) · 🔴 pasó a OFF · 🟦 pendiente de guardar.</p>
        <p>Hover sobre la celda → ícono 📝 para escribir nota del por qué cambió esta semana.</p>
      </div>
    </div>
  )
}

// =====================================================================
// CELDA DE TURNO — visual sutil con border-l-2 + dots internos
// =====================================================================

function TurnoCell({ valor, valorOriginal, tienePending, defaultDia, onChange, onAbrirNota, isEditingNota, onCerrarNota, onGuardarNota }) {
  const norm = normalizarCelda(valor)
  const tipo = tipoExcepcion(valor, defaultDia)
  const tieneNota = !!norm?.nota
  const esEx = esExcepcion(valor, defaultDia)

  const tieneValorExplicito = norm && (norm.tipo === 'OFF' || norm.startTime)
  const offExplicito = norm?.tipo === 'OFF'
  const defOff = defaultDia?.tipo === 'OFF'

  // Color del borde lateral según tipo de excepción
  let borderColor = 'transparent'
  if (esEx && tipo === 'cambio-off') borderColor = '#ef4444' // bad
  else if (esEx && tipo === 'cubre') borderColor = '#22c55e' // good
  else if (esEx) borderColor = '#ff6b35' // accent

  // Dot interno (esquina sup. izq.) según tipo
  let dotColor = null
  if (esEx && tipo === 'cambio-off') dotColor = '#ef4444'
  else if (esEx && tipo === 'cubre') dotColor = '#22c55e'
  else if (esEx) dotColor = '#ff6b35'

  function setEntrada(v) {
    if (!v && !norm?.endTime) {
      if (norm?.nota) onChange({ tipo: 'default', nota: norm.nota })
      else onChange(null)
      return
    }
    onChange({ ...(norm || {}), startTime: v, endTime: norm?.endTime || v })
  }
  function setSalida(v) {
    if (!v && !norm?.startTime) {
      if (norm?.nota) onChange({ tipo: 'default', nota: norm.nota })
      else onChange(null)
      return
    }
    onChange({ ...(norm || {}), startTime: norm?.startTime || v, endTime: v })
  }
  function toggleOff() {
    if (offExplicito) {
      if (norm?.nota) onChange({ tipo: 'default', nota: norm.nota })
      else onChange(null)
    } else {
      onChange({ tipo: 'OFF', ...(norm?.nota ? { nota: norm.nota } : {}) })
    }
  }
  function activarDesdeDefault() {
    const seed = defaultDia?.startTime
      ? { startTime: defaultDia.startTime, endTime: defaultDia.endTime }
      : { startTime: '08:00', endTime: '16:00' }
    onChange({ ...seed, ...(norm?.nota ? { nota: norm.nota } : {}) })
  }

  // Construye tooltip con contexto del cambio
  const tooltip = useMemo(() => {
    const parts = []
    const txtTurno = norm?.segments
      ? norm.segments.map(s => `${s.startTime}-${s.endTime}`).join(' + ')
      : `${norm?.startTime}-${norm?.endTime}`
    if (tipo === 'cambio-horario' && defaultDia) parts.push(`Default: ${defaultDia.startTime}-${defaultDia.endTime} → ${txtTurno}`)
    else if (tipo === 'cambio-off' && defaultDia) parts.push(`Default: ${defaultDia.startTime}-${defaultDia.endTime} → OFF`)
    else if (tipo === 'cubre') parts.push(`Default: OFF → ${txtTurno} (cubre)`)
    if (tienePending) parts.push('Sin guardar')
    if (norm?.nota) parts.push(`Nota: ${norm.nota}`)
    return parts.join(' · ')
  }, [tipo, defaultDia, norm, tienePending])

  // Visual base — MISMO TAMAÑO siempre (no agrandar con badges externos)
  const baseStyle = {
    borderLeftWidth: borderColor === 'transparent' ? '1px' : '3px',
    borderLeftColor: borderColor === 'transparent' ? 'rgba(255,255,255,0.05)' : borderColor,
  }

  const dotsCorner = (
    <>
      {dotColor && (
        <span
          className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full"
          style={{ background: dotColor }}
        />
      )}
      {tienePending && (
        <span
          className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full ring-1 ring-bg-800"
          style={{ background: '#0ea5e9' }}
          title="Sin guardar"
        />
      )}
    </>
  )

  // CASO A: OFF explícito
  if (offExplicito) {
    return (
      <div
        className="relative group rounded-md min-h-[64px] bg-bg-700/30 border border-white/5"
        style={baseStyle}
        title={tooltip}
      >
        {dotsCorner}
        <NotaButton tieneNota={tieneNota} onClick={onAbrirNota} />
        <button
          onClick={toggleOff}
          className="w-full h-full px-2 py-3 rounded-md text-xs font-medium text-ink-300 hover:bg-bg-700/50 transition"
        >
          OFF
        </button>
        {isEditingNota && <NotaPopover nota={norm?.nota} onClose={onCerrarNota} onSave={onGuardarNota} />}
      </div>
    )
  }

  // CASO B: sin valor explícito → mostrar default si existe (placeholder)
  if (!tieneValorExplicito) {
    return (
      <div
        className="relative group rounded-md min-h-[64px] border border-white/5"
        style={baseStyle}
        title={tieneNota ? norm.nota : (defaultDia?.startTime || defOff ? 'Default · click para cambiar' : 'Click para asignar turno')}
      >
        {dotsCorner}
        <NotaButton tieneNota={tieneNota} onClick={onAbrirNota} />
        <button
          onClick={activarDesdeDefault}
          className="w-full h-full px-1 py-2 rounded-md text-center hover:bg-bg-700/50 transition"
        >
          {defOff ? (
            <span className="text-xs text-ink-400 italic">libre</span>
          ) : defaultDia?.startTime ? (
            <span className="block leading-tight">
              <span className="block text-xs font-mono text-ink-400">{defaultDia.startTime}</span>
              <span className="block text-xs font-mono text-ink-500">{defaultDia.endTime}</span>
            </span>
          ) : (
            <span className="text-xs text-ink-500">+ asignar</span>
          )}
        </button>
        {isEditingNota && <NotaPopover nota={norm?.nota} onClose={onCerrarNota} onSave={onGuardarNota} />}
      </div>
    )
  }

  // CASO P: turno PARTIDO (≥2 tramos). Solo display — se crea/edita por Excel.
  if (norm?.segments) {
    return (
      <div
        className="relative group rounded-md min-h-[64px] border border-white/5"
        style={baseStyle}
        title={tooltip || 'Turno partido'}
      >
        {dotsCorner}
        <NotaButton tieneNota={tieneNota} onClick={onAbrirNota} />
        <div className="p-1 space-y-0.5">
          <span className="block text-[9px] font-semibold uppercase tracking-wide text-accent-400 text-center">partido</span>
          {norm.segments.map((s, i) => (
            <div key={i} className="text-[11px] font-mono text-ink-100 text-center bg-bg-700/60 rounded px-1 py-0.5">
              {s.startTime}-{s.endTime}
            </div>
          ))}
          <button
            onClick={toggleOff}
            className="w-full px-1 py-0.5 rounded text-[10px] text-ink-400 hover:text-ink-200 hover:bg-bg-700 transition"
          >
            OFF
          </button>
        </div>
        {isEditingNota && <NotaPopover nota={norm?.nota} onClose={onCerrarNota} onSave={onGuardarNota} />}
      </div>
    )
  }

  // CASO C: turno explícito con horarios
  return (
    <div
      className="relative group rounded-md min-h-[64px] border border-white/5"
      style={baseStyle}
      title={tooltip}
    >
      {dotsCorner}
      <NotaButton tieneNota={tieneNota} onClick={onAbrirNota} />
      <div className="space-y-1 p-1">
        <input
          type="time"
          value={norm.startTime}
          onChange={(e) => setEntrada(e.target.value)}
          className="w-full bg-bg-700/60 border border-white/5 rounded-md px-2 py-1 text-xs text-ink-50 focus:outline-none focus:ring-1 focus:ring-accent/40 font-mono"
        />
        <input
          type="time"
          value={norm.endTime}
          onChange={(e) => setSalida(e.target.value)}
          className="w-full bg-bg-700/60 border border-white/5 rounded-md px-2 py-1 text-xs text-ink-50 focus:outline-none focus:ring-1 focus:ring-accent/40 font-mono"
        />
        <button
          onClick={toggleOff}
          className="w-full px-1 py-0.5 rounded text-[10px] text-ink-400 hover:text-ink-200 hover:bg-bg-700 transition"
        >
          OFF
        </button>
      </div>
      {isEditingNota && <NotaPopover nota={norm?.nota} onClose={onCerrarNota} onSave={onGuardarNota} />}
    </div>
  )
}

function NotaButton({ tieneNota, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`absolute top-1 right-1 z-10 w-5 h-5 rounded-full flex items-center justify-center transition ${
        tieneNota
          ? 'bg-accent/80 text-white opacity-100'
          : 'bg-bg-700 text-ink-400 opacity-0 group-hover:opacity-100 hover:text-accent border border-white/10'
      }`}
      title={tieneNota ? 'Editar nota' : 'Agregar nota'}
    >
      <StickyNote size={10} />
    </button>
  )
}

function NotaPopover({ nota, onClose, onSave }) {
  const [valor, setValor] = useState(nota || '')
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="surface-elevated p-5 max-w-sm w-full"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <StickyNote size={16} className="text-accent" />
            <h4 className="font-display font-semibold">Nota del cambio</h4>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={14} /></button>
        </div>
        <textarea
          autoFocus
          value={valor}
          onChange={e => setValor(e.target.value)}
          placeholder="Ej: Cubrió a Pedro porque estaba enfermo"
          className="input min-h-[80px] resize-none text-sm"
        />
        <div className="flex gap-2 mt-3">
          {nota && (
            <button
              onClick={() => onSave('')}
              className="btn-secondary text-sm border-bad/30 text-bad hover:bg-bad/10"
            >
              Borrar nota
            </button>
          )}
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={() => onSave(valor.trim())} className="btn-primary flex-1">Guardar</button>
        </div>
      </div>
    </div>
  )
}
