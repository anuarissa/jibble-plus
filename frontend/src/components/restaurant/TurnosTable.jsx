import { useMemo, useRef, useState } from 'react'
import { addDays, format, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight, Copy, Download, Upload, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '../ui/Avatar'
import { isoWeekKey, semanaAnteriorKey, DIAS_LABEL } from '../../utils/turnos'
import { descargarTemplateTurnos, parseExcelTurnos } from '../../utils/excel-turnos'

export function TurnosTable({ group, empleados, schedules, cfg }) {
  const [offset, setOffset] = useState(0)
  const fileInputRef = useRef(null)

  const ini = useMemo(() => addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), offset * 7), [offset])
  const fin = useMemo(() => addDays(ini, 6), [ini])
  const weekKey = useMemo(() => isoWeekKey(ini), [ini])

  const semanaTurnos = cfg.turnos?.[weekKey] || {}
  const semanaAnterior = semanaAnteriorKey(weekKey)
  const tienePrev = !!cfg.turnos?.[semanaAnterior]

  const nombreLocal = cfg.config.locales[group.id]?.name || group.name

  function handleCopiarPrev() {
    if (!tienePrev) {
      toast.error('La semana anterior no tiene turnos cargados.')
      return
    }
    if (!confirm(`¿Copiar todos los turnos de la semana ${semanaAnterior} sobre la semana ${weekKey}? Sobreescribe lo actual.`)) return
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
    e.target.value = '' // reset para poder volver a subir el mismo
    try {
      const result = await parseExcelTurnos(file, empleados)
      if (Object.keys(result.aplicar).length === 0) {
        toast.error('No se pudo aplicar ninguna fila. Revisa el formato del archivo.')
      } else {
        cfg.setTurnosSemana(weekKey, result.aplicar)
        const msg = `${result.celdasOk} turnos cargados${result.celdasIgnoradas > 0 ? ` · ${result.celdasIgnoradas} ignorados` : ''}`
        toast.success(msg)
      }
      if (result.warnings.length > 0) {
        result.warnings.forEach(w => toast.warning(w, { duration: 6000 }))
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
            Semana {weekKey} · {format(ini, 'dd MMM')} al {format(fin, 'dd MMM')} · click en una celda para editar
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

      {empleados.length === 0 ? (
        <div className="bg-bg-700/40 rounded-xl p-6 text-center">
          <AlertCircle size={20} className="mx-auto text-warn mb-2" />
          <p className="text-sm text-ink-200">Este local no tiene empleados activos asignados.</p>
          <p className="text-xs text-ink-400 mt-1">Asígnalos desde Configuración → Asignar empleados a locales.</p>
        </div>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[700px]">
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
              {empleados.map(emp => (
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
                  {[1, 2, 3, 4, 5, 6, 7].map(dow => (
                    <td key={dow} className="px-1 py-2 align-top">
                      <TurnoCell
                        weekKey={weekKey}
                        personId={emp.id}
                        dow={dow}
                        valor={semanaTurnos[emp.id]?.[String(dow)]}
                        onChange={(valor) => cfg.setTurnoCelda(weekKey, emp.id, dow, valor)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-white/5 text-xs text-ink-300">
        <p>Si una celda queda vacía, se usa el horario base del empleado para ese día. "OFF" significa que no debe trabajar.</p>
      </div>
    </div>
  )
}

function TurnoCell({ valor, onChange }) {
  const isOff = valor === 'OFF'
  const startTime = (valor && typeof valor === 'object') ? valor.startTime : ''
  const endTime = (valor && typeof valor === 'object') ? valor.endTime : ''

  function setEntrada(v) {
    if (!v) {
      // si quedan ambos vacíos, limpiar la celda
      if (!endTime) onChange(null)
      else onChange({ startTime: '', endTime })
      return
    }
    onChange({ startTime: v, endTime: endTime || v })
  }
  function setSalida(v) {
    if (!v) {
      if (!startTime) onChange(null)
      else onChange({ startTime, endTime: '' })
      return
    }
    onChange({ startTime: startTime || v, endTime: v })
  }
  function toggleOff() {
    if (isOff) onChange(null)
    else onChange('OFF')
  }

  if (isOff) {
    return (
      <button
        onClick={toggleOff}
        className="w-full px-2 py-2 rounded-lg text-xs font-medium bg-idle/20 text-ink-300 border border-white/5 hover:bg-idle/30 transition"
        title="Click para quitar OFF"
      >
        OFF
      </button>
    )
  }

  return (
    <div className="space-y-1">
      <input
        type="time"
        value={startTime}
        onChange={(e) => setEntrada(e.target.value)}
        className="w-full bg-bg-700/60 border border-white/5 rounded-md px-2 py-1 text-xs text-ink-50 focus:outline-none focus:ring-1 focus:ring-accent/40 font-mono"
        placeholder="--:--"
      />
      <input
        type="time"
        value={endTime}
        onChange={(e) => setSalida(e.target.value)}
        className="w-full bg-bg-700/60 border border-white/5 rounded-md px-2 py-1 text-xs text-ink-50 focus:outline-none focus:ring-1 focus:ring-accent/40 font-mono"
        placeholder="--:--"
      />
      <button
        onClick={toggleOff}
        className="w-full px-1 py-0.5 rounded text-[10px] text-ink-400 hover:text-ink-200 hover:bg-bg-700 transition"
      >
        OFF
      </button>
    </div>
  )
}
