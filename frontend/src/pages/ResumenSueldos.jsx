// Página "Sueldos": resumen completo por local para armar los sueldos.
// Por empleado: horas trabajadas vs programadas (cumplimiento), tardanzas y
// multas Bs, FALTAS (debía venir y no vino, con fechas), no-registro, extras
// y total a pagar. Filtros: local, Día/Semana/Mes/Rango libre y por empleado.

import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Wallet, Calendar, CalendarDays, CalendarRange, CalendarSearch,
  ChevronLeft, ChevronRight, ChevronDown, Download, FileSpreadsheet, Clock, UserX, Timer,
} from 'lucide-react'
import { addDays, addMonths, format, startOfMonth, endOfMonth, startOfWeek, parseISO } from 'date-fns'
import { useJibble } from '../hooks/useJibble'
import { Avatar } from '../components/ui/Avatar'
import { Skeleton } from '../components/ui/Skeleton'
import { resumenSueldos } from '../utils/resumen-sueldos'
import { celdaToRow } from '../utils/stats'
import { formatBs, formatHoras, formatFecha } from '../utils/format'
import { exportCSV, exportExcel } from '../utils/export'

const MODOS = [
  { id: 'dia', label: 'Día', icon: Calendar },
  { id: 'semana', label: 'Semana', icon: CalendarDays },
  { id: 'mes', label: 'Mes', icon: CalendarRange },
  { id: 'rango', label: 'Rango', icon: CalendarSearch },
]

// Paleta de las gráficas — validada (dataviz) contra la superficie oscura:
// trabajadas = naranja de la marca un paso más profundo; programadas = azul de referencia.
const COLOR_TRABAJADAS = '#e8571f'
const COLOR_PROGRAMADAS = '#5c85d6'
const TOOLTIP_STYLE = {
  background: '#1a1a1f', border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12, color: '#fafafa', fontSize: 12,
}

export default function ResumenSueldos({ cfg }) {
  const data = useJibble(cfg.personOverrides, cfg.config.locales)
  const [groupId, setGroupId] = useState('')
  const [modo, setModo] = useState('semana')
  const [offset, setOffset] = useState(0)
  const [desde, setDesde] = useState(format(addDays(new Date(), -14), 'yyyy-MM-dd'))
  const [hasta, setHasta] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [personId, setPersonId] = useState('')
  const [expandido, setExpandido] = useState(null)

  const grupos = data.groups || []
  const grupoActivo = groupId || grupos[0]?.id || ''
  const nombreLocal = cfg.config.locales[grupoActivo]?.name || grupos.find(g => g.id === grupoActivo)?.name || ''

  const { ini, fin, rangoLabel } = useMemo(() => {
    const today = new Date()
    if (modo === 'dia') {
      const d = addDays(today, offset)
      return { ini: d, fin: d, rangoLabel: format(d, 'EEEE dd MMMM yyyy') }
    }
    if (modo === 'mes') {
      const m = addMonths(startOfMonth(today), offset)
      return { ini: startOfMonth(m), fin: endOfMonth(m), rangoLabel: format(m, "MMMM 'de' yyyy") }
    }
    if (modo === 'rango') {
      const i = parseISO(desde)
      const f = parseISO(hasta)
      return { ini: i, fin: f >= i ? f : i, rangoLabel: `${formatFecha(desde)} – ${formatFecha(hasta)}` }
    }
    const lun = addDays(startOfWeek(today, { weekStartsOn: 1 }), offset * 7)
    const dom = addDays(lun, 6)
    return { ini: lun, fin: dom, rangoLabel: `Semana ${format(lun, 'dd MMM')} – ${format(dom, 'dd MMM yyyy')}` }
  }, [modo, offset, desde, hasta])

  const ready = !data.loading && data.people && data.schedules && data.attendance && grupos.length > 0

  const empleadosLocal = useMemo(
    () => (data.people || []).filter(p => p.groupId === grupoActivo),
    [data.people, grupoActivo]
  )
  const empleadosFiltrados = useMemo(
    () => (personId ? empleadosLocal.filter(p => p.id === personId) : empleadosLocal),
    [empleadosLocal, personId]
  )

  const resumen = useMemo(() => {
    if (!ready || empleadosFiltrados.length === 0) return null
    return resumenSueldos({
      empleados: empleadosFiltrados,
      attendance: data.attendance,
      schedules: data.schedules,
      condonaciones: cfg.condonaciones,
      turnos: cfg.turnos,
      personOverrides: cfg.personOverrides,
      ini, fin,
      settings: cfg.config.settings,
      getTarifa: cfg.getTarifaResolved,
      groupId: grupoActivo,
    })
  }, [ready, empleadosFiltrados, data.attendance, data.schedules, cfg.condonaciones, cfg.turnos, cfg.personOverrides, ini, fin, cfg.config.settings, grupoActivo])

  // Series de las gráficas
  const chartEmpleados = useMemo(() => (resumen?.filas || []).map(f => ({
    name: f.fullName.split(' ')[0],
    Programadas: f.horasProgramadas,
    Trabajadas: f.horasTrabajadas,
  })), [resumen])

  const chartDias = useMemo(() => (resumen?.porDia || []).map(d => ({
    name: format(parseISO(d.dayStr), 'dd/MM'),
    Programadas: d.horasProgramadas,
    Trabajadas: d.horas,
    minTarde: d.minTarde,
    faltas: d.faltas,
  })), [resumen])

  const exportColumns = [
    { label: 'Empleado', accessor: 'fullName', width: 26 },
    { label: 'Cargo', accessor: 'position', width: 16 },
    { label: 'H. programadas', accessor: 'horasProgramadas', width: 14, numFmt: '0.00' },
    { label: 'H. trabajadas', accessor: 'horasTrabajadas', width: 13, numFmt: '0.00' },
    { label: '% Cumplimiento', accessor: r => r.cumplimiento == null ? '' : r.cumplimiento + '%', width: 14 },
    { label: 'Faltas', accessor: r => r.faltas.length, width: 8, numFmt: '0' },
    { label: 'Fechas de faltas', accessor: r => r.faltas.map(x => x.dayStr).join(', '), width: 30 },
    { label: 'Días tarde', accessor: 'diasTarde', width: 10, numFmt: '0' },
    { label: 'Min tarde', accessor: 'minTarde', width: 10, numFmt: '0' },
    { label: 'Multa tardanza (Bs)', accessor: 'multaBs', width: 16, numFmt: '"Bs" #,##0.00' },
    { label: 'Días no-registro', accessor: 'diasNoRegistro', width: 14, numFmt: '0' },
    { label: 'Desc. no-registro (Bs)', accessor: 'descuentoNoRegistro', width: 18, numFmt: '"Bs" #,##0.00' },
    { label: 'H. extra', accessor: 'horasExtra', width: 10, numFmt: '0.00' },
    { label: 'Tarifa/h (Bs)', accessor: 'tarifa', width: 12, numFmt: '0.00' },
    { label: 'Bruto (Bs)', accessor: 'bruto', width: 12, numFmt: '"Bs" #,##0.00' },
    { label: 'Total a pagar (Bs)', accessor: 'totalAPagar', width: 16, numFmt: '"Bs" #,##0.00' },
  ]
  const fileBase = `sueldos_${nombreLocal.replace(/[^a-z0-9]+/gi, '_')}_${format(ini, 'dd-MM-yyyy')}_${format(fin, 'dd-MM-yyyy')}`

  if (!ready) return <div className="p-8 max-w-[1400px] mx-auto"><Skeleton className="h-96" /></div>

  const t = resumen?.totales

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <header className="mb-6">
        <h1 className="text-4xl font-display font-bold tracking-tightest mb-1 flex items-center gap-3">
          <Wallet size={30} className="text-accent" /> Sueldos
        </h1>
        <p className="text-sm text-ink-300 capitalize">{nombreLocal} · {rangoLabel}</p>
      </header>

      {/* Filtros */}
      <div className="surface p-4 mb-6 grain flex items-center gap-2 flex-wrap">
        <select value={grupoActivo} onChange={e => { setGroupId(e.target.value); setPersonId(''); setExpandido(null) }} className="input text-sm w-auto">
          {grupos.map(g => <option key={g.id} value={g.id}>{cfg.config.locales[g.id]?.name || g.name}</option>)}
        </select>
        <div className="flex gap-1 bg-bg-700/50 p-1 rounded-xl border border-white/5">
          {MODOS.map(m => (
            <button
              key={m.id}
              onClick={() => { setModo(m.id); setOffset(0) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                modo === m.id ? 'bg-accent text-white shadow-glow' : 'text-ink-200 hover:text-ink-50'
              }`}
            >
              <m.icon size={13} /> {m.label}
            </button>
          ))}
        </div>
        {modo === 'rango' ? (
          <div className="flex items-center gap-2">
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="input text-sm w-auto" />
            <span className="text-ink-400 text-xs">a</span>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="input text-sm w-auto" />
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button onClick={() => setOffset(o => o - 1)} className="btn-ghost p-2"><ChevronLeft size={16} /></button>
            <button onClick={() => setOffset(0)} className="btn-secondary text-xs">Hoy</button>
            <button onClick={() => setOffset(o => o + 1)} disabled={offset >= 0} className="btn-ghost p-2 disabled:opacity-30"><ChevronRight size={16} /></button>
          </div>
        )}
        <select value={personId} onChange={e => { setPersonId(e.target.value); setExpandido(null) }} className="input text-sm w-auto">
          <option value="">Todos los empleados</option>
          {empleadosLocal.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
        </select>
        {resumen && resumen.filas.length > 0 && (
          <div className="ml-auto flex gap-2">
            <button onClick={() => exportCSV(fileBase, resumen.filas, exportColumns)} className="btn-secondary text-xs">
              <Download size={14} /> CSV
            </button>
            <button onClick={() => exportExcel(fileBase, resumen.filas, exportColumns)} className="btn-secondary text-xs">
              <FileSpreadsheet size={14} /> Excel
            </button>
          </div>
        )}
      </div>

      {!resumen || resumen.filas.length === 0 ? (
        <div className="surface p-8 text-center text-ink-300">Sin empleados o datos en este rango.</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Kpi
              icon={Clock}
              label="Horas trabajadas / programadas"
              value={`${formatHoras(t.horasTrabajadas)} / ${formatHoras(t.horasProgramadas)}`}
              sub={t.cumplimiento == null ? 'sin horario programado' : `${t.cumplimiento}% de cumplimiento`}
              subClass={t.cumplimiento == null ? 'text-ink-400' : t.cumplimiento >= 95 ? 'text-good' : t.cumplimiento >= 80 ? 'text-warn' : 'text-bad'}
            />
            <Kpi
              icon={UserX}
              label="Faltas (debía venir y no vino)"
              value={t.faltas}
              valueClass={t.faltas > 0 ? 'text-bad' : 'text-good'}
              sub={t.faltas > 0 ? 'ver fechas en el detalle de cada empleado' : 'sin faltas en el rango'}
            />
            <Kpi
              icon={Timer}
              label="Tardanzas"
              value={`${t.diasTarde} días · ${t.minTarde} min`}
              sub={`−${formatBs(t.multaBs)} en multas`}
              subClass={t.multaBs > 0 ? 'text-bad' : 'text-ink-400'}
            />
            <Kpi
              icon={Wallet}
              label="Total a pagar"
              value={formatBs(t.totalAPagar)}
              valueClass="text-accent"
              sub={`bruto ${formatBs(t.bruto)} − desc. ${formatBs(t.descuentoTardanza + t.descuentoNoRegistro)}`}
            />
          </div>

          {/* Gráficas */}
          <div className={`grid grid-cols-1 ${chartEmpleados.length > 1 ? 'xl:grid-cols-2' : ''} gap-4 mb-6`}>
            {chartEmpleados.length > 1 && (
              <ChartCard title="Horas por empleado" subtitle="¿Cumplieron las horas? trabajadas vs programadas">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartEmpleados} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="name" stroke="#a1a1aa" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis stroke="#a1a1aa" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={34} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => formatHoras(v)} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Programadas" fill={COLOR_PROGRAMADAS} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                    <Bar dataKey="Trabajadas" fill={COLOR_TRABAJADAS} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
            {chartDias.length > 1 && (
              <ChartCard title="Horas por día" subtitle={personId ? empleadosLocal.find(p => p.id === personId)?.fullName : 'todo el local'}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartDias} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="name" stroke="#a1a1aa" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis stroke="#a1a1aa" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={34} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<TooltipDia />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Programadas" fill={COLOR_PROGRAMADAS} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                    <Bar dataKey="Trabajadas" fill={COLOR_TRABAJADAS} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>

          {/* Tabla principal */}
          <div className="surface p-5 grain">
            <h3 className="font-display font-semibold text-lg mb-4">Detalle por empleado</h3>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[1050px] text-sm">
                <thead>
                  <tr className="text-left">
                    {['Empleado', 'H. prog.', 'H. trab.', '% Cumpl.', 'Días tarde', 'Min tarde', 'Multa', 'Faltas', 'No-reg.', 'H. extra', 'Bruto', 'Total a pagar', ''].map((h, i) => (
                      <th key={i} className={`text-xs uppercase tracking-wider text-ink-300 pb-3 font-medium ${i > 0 ? 'text-right pl-2' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resumen.filas.map(f => {
                    const abierto = expandido === f.personId
                    return (
                      <FilaEmpleado
                        key={f.personId}
                        f={f}
                        abierto={abierto}
                        onToggle={() => setExpandido(abierto ? null : f.personId)}
                        nombreLocal={nombreLocal}
                      />
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-white/10 bg-bg-700/30">
                    <td className="py-3 font-display font-bold text-ink-50">TOTAL</td>
                    <td className="text-right py-3 font-mono">{formatHoras(t.horasProgramadas)}</td>
                    <td className="text-right py-3 font-mono font-bold text-ink-50">{formatHoras(t.horasTrabajadas)}</td>
                    <td className="text-right py-3">{t.cumplimiento == null ? '—' : `${t.cumplimiento}%`}</td>
                    <td className="text-right py-3">{t.diasTarde}</td>
                    <td className="text-right py-3">{t.minTarde}</td>
                    <td className="text-right py-3 text-bad">{t.multaBs > 0 ? `−${formatBs(t.multaBs)}` : '—'}</td>
                    <td className="text-right py-3 font-bold text-bad">{t.faltas || '—'}</td>
                    <td className="text-right py-3 text-bad">{t.descuentoNoRegistro > 0 ? `−${formatBs(t.descuentoNoRegistro)}` : '—'}</td>
                    <td className="text-right py-3 text-accent-400">{t.horasExtra > 0 ? formatHoras(t.horasExtra) : '—'}</td>
                    <td className="text-right py-3 font-display">{formatBs(t.bruto)}</td>
                    <td className="text-right py-3 font-display font-bold text-accent text-lg">{formatBs(t.totalAPagar)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ icon: Icon, label, value, sub, valueClass = 'text-ink-50', subClass = 'text-ink-400' }) {
  return (
    <div className="surface p-4 grain">
      <div className="flex items-center gap-2 text-ink-300 mb-2">
        <Icon size={15} />
        <span className="text-[11px] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <div className={`font-display font-bold text-2xl ${valueClass}`}>{value}</div>
      {sub && <div className={`text-xs mt-1 ${subClass}`}>{sub}</div>}
    </div>
  )
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="surface p-5 grain">
      <h3 className="font-display font-semibold">{title}</h3>
      <p className="text-xs text-ink-300 mb-3">{subtitle}</p>
      {children}
    </div>
  )
}

// Tooltip del chart diario: horas + tardanzas + faltas del día
function TooltipDia({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const extra = payload[0]?.payload
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2">
      <div className="font-medium mb-1">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.fill }}>{p.dataKey}: {formatHoras(p.value)}</div>
      ))}
      {extra?.minTarde > 0 && <div className="text-warn mt-1">+{extra.minTarde} min tarde</div>}
      {extra?.faltas > 0 && <div className="text-bad">{extra.faltas} falta{extra.faltas > 1 ? 's' : ''}</div>}
    </div>
  )
}

function FilaEmpleado({ f, abierto, onToggle, nombreLocal }) {
  return (
    <>
      <tr onClick={onToggle} className="border-t border-white/5 hover:bg-bg-700/30 transition cursor-pointer">
        <td className="py-3">
          <div className="flex items-center gap-2.5">
            <Avatar name={f.fullName} id={f.personId} size="sm" />
            <div>
              <div className="font-medium text-ink-50">{f.fullName}</div>
              <div className="text-xs text-ink-300">{f.position}</div>
            </div>
          </div>
        </td>
        <td className="text-right py-3 font-mono text-ink-200">{formatHoras(f.horasProgramadas)}</td>
        <td className="text-right py-3 font-mono font-semibold text-ink-50">{formatHoras(f.horasTrabajadas)}</td>
        <td className="text-right py-3">
          {f.cumplimiento == null ? <span className="text-ink-400">—</span> : (
            <span className={`font-medium ${f.cumplimiento >= 95 ? 'text-good' : f.cumplimiento >= 80 ? 'text-warn' : 'text-bad'}`}>{f.cumplimiento}%</span>
          )}
        </td>
        <td className="text-right py-3">{f.diasTarde || <span className="text-ink-400">—</span>}</td>
        <td className="text-right py-3">{f.minTarde || <span className="text-ink-400">—</span>}</td>
        <td className="text-right py-3">{f.multaBs > 0 ? <span className="text-bad">−{formatBs(f.multaBs)}</span> : <span className="text-ink-400">—</span>}</td>
        <td className="text-right py-3">
          {f.faltas.length > 0
            ? <span className="font-bold text-bad" title={f.faltas.map(x => formatFecha(x.dayStr)).join(', ')}>{f.faltas.length}</span>
            : <span className="text-ink-400">—</span>}
        </td>
        <td className="text-right py-3">
          {f.descuentoNoRegistro > 0
            ? <span className="text-bad" title={`${f.diasNoRegistro} día(s) sin registrar ingreso o salida`}>−{formatBs(f.descuentoNoRegistro)}</span>
            : <span className="text-ink-400">—</span>}
        </td>
        <td className="text-right py-3">{f.horasExtra > 0 ? <span className="text-accent-400">{formatHoras(f.horasExtra)}</span> : <span className="text-ink-400">—</span>}</td>
        <td className="text-right py-3 font-display text-ink-100">{formatBs(f.bruto)}</td>
        <td className="text-right py-3 font-display font-bold text-ink-50">{formatBs(f.totalAPagar)}</td>
        <td className="text-right py-3 pl-2 text-ink-400">
          <ChevronDown size={15} className={`transition ${abierto ? 'rotate-180' : ''}`} />
        </td>
      </tr>
      {abierto && (
        <tr className="border-t border-white/5">
          <td colSpan={13} className="py-3 px-2 bg-bg-700/20">
            {f.faltas.length > 0 && (
              <div className="mb-3 rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm">
                <span className="font-semibold text-bad">No vino ({f.faltas.length}):</span>{' '}
                <span className="text-ink-200">
                  {f.faltas.map(x => `${formatFecha(x.dayStr)} (programado ${x.programadoStart}–${x.programadoEnd})`).join(' · ')}
                </span>
              </div>
            )}
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-xs min-w-[760px]">
                <thead>
                  <tr className="text-left text-ink-400 uppercase tracking-wider">
                    <th className="pb-2 font-medium">Fecha</th>
                    <th className="pb-2 font-medium">Estado</th>
                    <th className="pb-2 font-medium text-right">Prog. entrada</th>
                    <th className="pb-2 font-medium text-right">Entrada real</th>
                    <th className="pb-2 font-medium text-right">Min tarde</th>
                    <th className="pb-2 font-medium text-right">Prog. salida</th>
                    <th className="pb-2 font-medium text-right">Salida real</th>
                    <th className="pb-2 font-medium text-right">Horas</th>
                  </tr>
                </thead>
                <tbody>
                  {f.cells.filter(c => !(c.state === 'idle' && !c.falto)).map(c => {
                    const row = celdaToRow(f.empleado, c, nombreLocal)
                    return (
                      <tr key={c.dayStr} className={`border-t border-white/5 ${c.falto ? 'bg-bad/5' : ''}`}>
                        <td className="py-1.5 text-ink-200">{formatFecha(c.dayStr)}</td>
                        <td className={`py-1.5 ${c.falto ? 'text-bad font-semibold' : c.mins > 0 ? 'text-warn' : 'text-ink-200'}`}>{row.Estado}</td>
                        <td className="py-1.5 text-right font-mono text-ink-300">{row['Programado entrada'] || '—'}</td>
                        <td className="py-1.5 text-right font-mono text-ink-100">{row['Entrada real'] || '—'}</td>
                        <td className="py-1.5 text-right">{row['Min tarde'] ? <span className="text-warn">+{row['Min tarde']}</span> : '—'}</td>
                        <td className="py-1.5 text-right font-mono text-ink-300">{row['Programado salida'] || '—'}</td>
                        <td className="py-1.5 text-right font-mono text-ink-100">{row['Salida real'] || '—'}</td>
                        <td className="py-1.5 text-right font-mono">{row['Horas trabajadas'] || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
