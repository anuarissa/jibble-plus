import { useMemo, useRef, useState } from 'react'
import { addDays, format, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight, Copy, Download, Upload, AlertCircle, StickyNote, X, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '../ui/Avatar'
import {
  isoWeekKey, semanaAnteriorKey, DIAS_LABEL,
  getDefaultParaDia, normalizarCelda, esExcepcion, tipoExcepcion, contarCambios,
} from '../../utils/turnos'
import { descargarTemplateTurnos, parseExcelTurnosAuto } from '../../utils/excel-turnos'

export function TurnosTable({ group, empleados, schedules, cfg }) {
  const [offset, setOffset] = useState(0)
  const [showCambios, setShowCambios] = useState(false)
  const [editingNota, setEditingNota] = useState(null) // { personId, dow }
  const fileInputRef = useRef(null)

  const ini = useMemo(() => addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), offset * 7), [offset])
  const fin = useMemo(() => addDays(ini, 6), [ini])
  const weekKey = useMemo(() => isoWeekKey(ini), [ini])

  const semanaTurnos = cfg.turnos?.[weekKey] || {}
  const semanaAnterior = semanaAnteriorKey(weekKey)
  const tienePrev = !!cfg.turnos?.[semanaAnterior]
  const nombreLocal = cfg.config.locales[group.id]?.name || group.name

  // Excepciones de la semana — para el contador del header y la lista expandible
  const cambios = useMemo(
    () => contarCambios(semanaTurnos, empleados, schedules, cfg.personOverrides),
    [semanaTurnos, empleados, schedules, cfg.personOverrides]
  )

  function handleCopiarPrev() {
    if (!tienePrev) {
      toast.error('La semana anterior no tiene turnos cargados.')
      return
    }
    if (!confirm(`¿Copiar todos los turnos de la semana ${semanaAnterior} sobre ${weekKey}? Sobreescribe lo actual.`)) return
    cfg.copiarTurnosDesdeAnterior(weekKey, semanaAnterior)
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
      // Aplicar cada semana por separado (puede ser una o varias)
      for (const [wk, datos] of semanasAplicar) {
        cfg.setTurnosSemana(wk, datos)
      }
      const formatoLabel = result.formato === 'anuar' ? '(formato planilla)' : '(template)'
      const semsLabel = semanasAplicar.length > 1 ? ` en ${semanasAplicar.length} semanas` : ''
      toast.success(`${result.celdasOk} turnos cargados${semsLabel} ${formatoLabel}`, { duration: 5000 })
      if (semanasAplicar.length > 1) {
        const wks = semanasAplicar.map(([w]) => w).join(', ')
        toast.message(`Semanas: ${wks}`, { duration: 6000 })
      }
      if (result.warnings.length > 0) {
        result.warnings.slice(0, 5).forEach(w => toast.warning(w, { duration: 6000 }))
        if (result.warnings.length > 5) {
          toast.message(`+ ${result.warnings.length - 5} avisos más en consola`, { duration: 4000 })
          result.warnings.forEach(w => console.warn('[Excel import]', w))
        }
      }
    } catch (err) {
      toast.error('Error leyendo Excel: ' + err.message)
    }
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
          <button onClick={() => fileInputRef.current?.click()} className="btn-primary text-xs">
            <Upload size={14} /> Importar Excel
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportar} />
        </div>
      </div>

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
                      <span className="text-accent font-mono">{c.celda.startTime}-{c.celda.endTime}</span>
                    </span>
                  )}
                  {c.tipo === 'cambio-off' && <span className="text-xs"><span className="text-ink-400 line-through">{c.defaultDia.startTime}-{c.defaultDia.endTime}</span> → <span className="text-bad">OFF</span></span>}
                  {c.tipo === 'cubre' && <span className="text-xs"><span className="text-ink-400 line-through">OFF</span> → <span className="text-good font-mono">{c.celda.startTime}-{c.celda.endTime}</span> (cubre)</span>}
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
                      const raw = semanaTurnos[emp.id]?.[String(dow)]
                      const def = getDefaultParaDia(emp.id, dow, cfg.personOverrides, sched)
                      const isEditing = editingNota?.personId === emp.id && editingNota?.dow === dow
                      return (
                        <td key={dow} className="px-1 py-2 align-top">
                          <TurnoCell
                            valor={raw}
                            defaultDia={def}
                            onChange={(v) => cfg.setTurnoCelda(weekKey, emp.id, dow, v)}
                            onAbrirNota={() => setEditingNota({ personId: emp.id, dow })}
                            isEditingNota={isEditing}
                            onCerrarNota={() => setEditingNota(null)}
                            onGuardarNota={(nota) => {
                              cfg.setNotaCelda(weekKey, emp.id, dow, nota)
                              setEditingNota(null)
                              if (nota) toast.success('Nota guardada')
                            }}
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
        <p>El horario en gris es el <strong>default del empleado</strong>. Si una celda está distinta del default, se marca en naranja.</p>
        <p>Hover sobre la celda para ver el ícono 📝 — click para escribir nota del por qué cambió esta semana.</p>
      </div>
    </div>
  )
}

function TurnoCell({ valor, defaultDia, onChange, onAbrirNota, isEditingNota, onCerrarNota, onGuardarNota }) {
  const norm = normalizarCelda(valor)
  const tipo = tipoExcepcion(valor, defaultDia)
  const tieneNota = !!norm?.nota
  const esEx = esExcepcion(valor, defaultDia)

  const tieneValorExplicito = norm && (norm.tipo === 'OFF' || norm.startTime)
  const offExplicito = norm?.tipo === 'OFF'
  const defOff = defaultDia?.tipo === 'OFF'

  function setEntrada(v) {
    if (!v && !norm?.endTime) {
      // limpiar ambos: volver a default (preservando nota)
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
    // Convertir el default en valor explícito para empezar a editar
    const seed = defaultDia?.startTime
      ? { startTime: defaultDia.startTime, endTime: defaultDia.endTime }
      : { startTime: '08:00', endTime: '16:00' }
    onChange({ ...seed, ...(norm?.nota ? { nota: norm.nota } : {}) })
  }
  function quitarOff() {
    if (norm?.nota) onChange({ tipo: 'default', nota: norm.nota })
    else onChange(null)
  }

  const baseCls = 'relative group rounded-lg p-1 transition min-h-[64px]'
  let bgCls = ''
  if (esEx && tipo === 'cambio-off') bgCls = 'bg-bad/10 ring-1 ring-bad/40'
  else if (esEx && tipo === 'cubre') bgCls = 'bg-good/10 ring-1 ring-good/40'
  else if (esEx) bgCls = 'bg-accent/10 ring-1 ring-accent/40'

  const tooltip = norm?.nota || ''

  // CASO A: OFF explícito (puede ser cambio respecto al default)
  if (offExplicito) {
    return (
      <div className={`${baseCls} ${bgCls}`} title={tooltip}>
        {esEx && <span className="absolute -top-1.5 left-1 z-10 text-[8px] uppercase tracking-wider bg-bad text-white rounded px-1 font-bold">CAMBIO</span>}
        <NotaButton tieneNota={tieneNota} onClick={onAbrirNota} />
        <button
          onClick={toggleOff}
          className="w-full h-full px-2 py-3 rounded-lg text-xs font-medium bg-idle/20 text-ink-300 border border-white/5 hover:bg-idle/30 transition"
        >
          OFF
        </button>
        {isEditingNota && <NotaPopover nota={norm?.nota} onClose={onCerrarNota} onSave={onGuardarNota} />}
      </div>
    )
  }

  // CASO B: sin valor explícito → mostrar default si existe (vista compacta clickeable)
  if (!tieneValorExplicito) {
    return (
      <div className={`${baseCls}`} title={tieneNota ? norm.nota : (defaultDia?.startTime || defOff ? 'Click para editar (sobreescribe el default)' : 'Click para asignar turno')}>
        <NotaButton tieneNota={tieneNota} onClick={onAbrirNota} />
        <button
          onClick={activarDesdeDefault}
          className="w-full h-full px-1 py-2 rounded-lg border border-dashed border-white/10 text-center hover:bg-bg-700/50 hover:border-accent/40 transition"
        >
          {defOff ? (
            <span className="text-xs text-ink-400 italic">libre</span>
          ) : defaultDia?.startTime ? (
            <span className="block leading-tight">
              <span className="block text-xs font-mono text-ink-300">{defaultDia.startTime}</span>
              <span className="block text-xs font-mono text-ink-400">{defaultDia.endTime}</span>
            </span>
          ) : (
            <span className="text-xs text-ink-500">+ asignar</span>
          )}
        </button>
        {isEditingNota && <NotaPopover nota={norm?.nota} onClose={onCerrarNota} onSave={onGuardarNota} />}
      </div>
    )
  }

  // CASO C: turno explícito con horarios → inputs editables
  return (
    <div className={`${baseCls} ${bgCls}`} title={tooltip}>
      {esEx && tipo === 'cubre' && <span className="absolute -top-1.5 left-1 z-10 text-[8px] uppercase tracking-wider bg-good text-white rounded px-1 font-bold">CUBRE</span>}
      {esEx && tipo === 'cambio-horario' && <span className="absolute -top-1.5 left-1 z-10 text-[8px] uppercase tracking-wider bg-accent text-white rounded px-1 font-bold">CAMBIO</span>}
      <NotaButton tieneNota={tieneNota} onClick={onAbrirNota} />
      <div className="space-y-1">
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
      className={`absolute -top-1.5 -right-1 z-10 w-5 h-5 rounded-full flex items-center justify-center transition ${
        tieneNota
          ? 'bg-accent text-white opacity-100 shadow-glow'
          : 'bg-bg-700 text-ink-400 opacity-0 group-hover:opacity-100 hover:text-accent border border-white/10'
      }`}
      title={tieneNota ? 'Editar nota' : 'Agregar nota'}
    >
      <StickyNote size={11} />
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
