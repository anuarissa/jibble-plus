import { useEffect, useMemo, useState } from 'react'
import { format, addDays } from 'date-fns'
import { Download, FileSpreadsheet, Filter, Loader2 } from 'lucide-react'
import { useJibble } from '../hooks/useJibble'
import { Skeleton } from '../components/ui/Skeleton'
import { Avatar } from '../components/ui/Avatar'
import { detectarTardanza } from '../utils/lateness'
import { formatFecha, formatHora } from '../utils/format'
import { exportCSV, exportExcel } from '../utils/export'
import * as jibble from '../api/jibble'

export default function History({ cfg }) {
  const data = useJibble(cfg.personOverrides)
  const [from, setFrom] = useState(format(addDays(new Date(), -14), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [groupId, setGroupId] = useState('')
  const [personId, setPersonId] = useState('')
  const [tipo, setTipo] = useState('all') // all | onTime | late
  const [rangeAttendance, setRangeAttendance] = useState(null)
  const [rangeLoading, setRangeLoading] = useState(false)

  // Fetch propio cuando cambian fechas o local. Debounce 400ms.
  useEffect(() => {
    let cancelled = false
    setRangeLoading(true)
    const t = setTimeout(async () => {
      try {
        const result = await jibble.getAttendance({ from, to })
        if (cancelled) return
        // Aplicar override de groupId por persona (igual que useJibble)
        const personGroup = new Map((data.people || []).map(p => [p.id, p.groupId]))
        const adjusted = result.map(a => ({
          ...a,
          groupId: personGroup.get(a.personId) ?? a.groupId,
        }))
        setRangeAttendance(adjusted)
      } catch (err) {
        console.error('History fetch error', err)
      } finally {
        if (!cancelled) setRangeLoading(false)
      }
    }, 400)
    return () => { cancelled = true; clearTimeout(t) }
  }, [from, to, data.people])

  const ready = !data.loading && data.people && rangeAttendance != null

  const rows = useMemo(() => {
    if (!ready) return []
    return (rangeAttendance || [])
      .filter(a => !groupId || a.groupId === groupId)
      .filter(a => !personId || a.personId === personId)
      .map(a => {
        const sched = data.schedules.find(s => s.personId === a.personId)
        const tardanza = detectarTardanza(a, sched)
        const persona = data.people.find(p => p.id === a.personId)
        const grupo = data.groups.find(g => g.id === a.groupId)
        return {
          ...a,
          fullName: persona?.fullName || 'Desconocido',
          position: persona?.position || '',
          groupName: cfg.config.locales[grupo?.id]?.name || grupo?.name || '',
          minutosTarde: tardanza?.minutosTarde || 0,
          esTarde: !!tardanza,
          horas: a.clockOut ? ((new Date(a.clockOut) - new Date(a.clockIn)) / 3600000).toFixed(2) : '—',
        }
      })
      .filter(r => {
        if (tipo === 'late') return r.esTarde
        if (tipo === 'onTime') return !r.esTarde
        return true
      })
      .sort((a, b) => (b.date + b.clockIn).localeCompare(a.date + a.clockIn))
  }, [ready, rangeAttendance, data, groupId, personId, tipo, cfg.config])

  const exportColumns = [
    { label: 'Fecha', accessor: 'date' },
    { label: 'Empleado', accessor: 'fullName' },
    { label: 'Cargo', accessor: 'position' },
    { label: 'Local', accessor: 'groupName' },
    { label: 'Entrada', accessor: r => r.clockIn ? formatHora(r.clockIn) : '' },
    { label: 'Salida', accessor: r => r.clockOut ? formatHora(r.clockOut) : '' },
    { label: 'Horas', accessor: 'horas' },
    { label: 'Tarde (min)', accessor: 'minutosTarde' },
  ]

  const peopleEnGrupo = useMemo(() => {
    if (!data.people) return []
    return groupId ? data.people.filter(p => p.groupId === groupId) : data.people
  }, [data.people, groupId])

  if (!ready) return <div className="p-8 max-w-[1400px] mx-auto"><Skeleton className="h-96" /></div>

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <header className="mb-6">
        <h1 className="text-4xl font-display font-bold tracking-tightest mb-1">Historial</h1>
        <p className="text-sm text-ink-300">Todos los registros · filtrar por fecha, local, empleado o tipo</p>
      </header>

      <div className="surface p-5 mb-6 grain">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-accent" />
          <h3 className="font-display font-semibold text-sm">Filtros</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Field label="Desde">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input text-sm" />
          </Field>
          <Field label="Hasta">
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input text-sm" />
          </Field>
          <Field label="Local">
            <select value={groupId} onChange={e => { setGroupId(e.target.value); setPersonId('') }} className="input text-sm">
              <option value="">Todos</option>
              {data.groups.map(g => <option key={g.id} value={g.id}>{cfg.config.locales[g.id]?.name || g.name}</option>)}
            </select>
          </Field>
          <Field label="Empleado">
            <select value={personId} onChange={e => setPersonId(e.target.value)} className="input text-sm">
              <option value="">Todos</option>
              {peopleEnGrupo.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
            </select>
          </Field>
          <Field label="Tipo">
            <select value={tipo} onChange={e => setTipo(e.target.value)} className="input text-sm">
              <option value="all">Todos</option>
              <option value="onTime">A tiempo</option>
              <option value="late">Solo tarde</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="surface p-5 grain">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="text-sm text-ink-200 flex items-center gap-2">
            {rangeLoading && <Loader2 size={14} className="animate-spin text-accent" />}
            <span className="font-display font-bold text-ink-50 text-xl">{rows.length}</span> registros
            {rangeLoading && <span className="text-xs text-ink-300">cargando rango…</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => exportCSV(`historial_${from}_${to}`, rows, exportColumns)} className="btn-secondary text-xs">
              <Download size={14} /> CSV
            </button>
            <button onClick={() => exportExcel(`historial_${from}_${to}`, rows, exportColumns)} className="btn-secondary text-xs">
              <FileSpreadsheet size={14} /> Excel
            </button>
          </div>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="text-left">
                {['Fecha', 'Empleado', 'Local', 'Entrada', 'Salida', 'Horas', 'Tarde'].map(h => (
                  <th key={h} className="text-xs uppercase tracking-wider text-ink-300 pb-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map(r => (
                <tr key={r.id} className="border-t border-white/5 hover:bg-bg-700/30 transition">
                  <td className="py-2.5 font-mono text-xs text-ink-200">{formatFecha(r.date)}</td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={r.fullName} id={r.personId} size="sm" />
                      <div>
                        <div className="text-ink-50">{r.fullName}</div>
                        <div className="text-xs text-ink-300">{r.position}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 text-ink-100">{r.groupName}</td>
                  <td className="py-2.5 font-mono text-ink-100">{r.clockIn ? formatHora(r.clockIn) : '—'}</td>
                  <td className="py-2.5 font-mono text-ink-100">{r.clockOut ? formatHora(r.clockOut) : <span className="text-warn">activo</span>}</td>
                  <td className="py-2.5 font-mono text-ink-100">{r.horas}</td>
                  <td className="py-2.5">
                    {r.esTarde ? (
                      <span className="badge bg-bad/15 text-bad">+{r.minutosTarde}min</span>
                    ) : (
                      <span className="text-ink-400 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 200 && (
            <p className="text-center text-xs text-ink-300 mt-4">Mostrando primeros 200 — exporta para ver todos</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-ink-300 block mb-1">{label}</span>
      {children}
    </label>
  )
}
