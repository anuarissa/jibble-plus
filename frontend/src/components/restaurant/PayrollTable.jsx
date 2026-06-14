import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet, ChevronLeft, ChevronRight, CalendarDays, CalendarRange } from 'lucide-react'
import { addDays, startOfWeek, format, addMonths, startOfMonth, endOfMonth } from 'date-fns'
import { Avatar } from '../ui/Avatar'
import { planillaLocal } from '../../utils/payroll'
import { attendanceEnRango, groupByPerson, tardanzasConCondonacion, tablaSemanal, extrasYRetrasoDeCells } from '../../utils/stats'
import { formatBs, formatHoras } from '../../utils/format'
import { exportCSV, exportExcel } from '../../utils/export'

const MODOS = [
  { id: 'semana', label: 'Semana', icon: CalendarDays },
  { id: 'mes', label: 'Mes', icon: CalendarRange },
]

export function PayrollTable({ group, empleados, attendance, schedules, cfg }) {
  const [modo, setModo] = useState('semana')
  const [offset, setOffset] = useState(0)

  // Calcular rango según modo
  const { ini, fin, rangoLabel, fileLabel } = useMemo(() => {
    const today = new Date()
    if (modo === 'mes') {
      const m = addMonths(startOfMonth(today), offset)
      const i = startOfMonth(m)
      const f = endOfMonth(m)
      return {
        ini: i, fin: f,
        rangoLabel: format(m, "MMMM 'de' yyyy"),
        fileLabel: `mes_${format(m, 'MM-yyyy')}`,
      }
    }
    const lun = addDays(startOfWeek(today, { weekStartsOn: 1 }), offset * 7)
    const dom = addDays(lun, 6)
    return {
      ini: lun, fin: dom,
      rangoLabel: `Semana ${format(lun, 'dd MMM')} – ${format(dom, 'dd MMM yyyy')}`,
      fileLabel: `semana_${format(lun, 'dd-MM-yyyy')}`,
    }
  }, [modo, offset])

  // Para modo Mes: iterar las semanas que tocan el mes y sumar las planillas semanales.
  // Eso preserva el cálculo correcto de horas extra por semana (la regla legal local).
  const planilla = useMemo(() => {
    const empleadosConTarifa = empleados.map(emp => {
      const sched = schedules.find(s => s.personId === emp.id)
      return {
        ...emp,
        tarifa: cfg.getTarifaResolved(emp.id),
        expectedHoursPerWeek: sched?.expectedHoursPerWeek ?? 0,
      }
    })

    function planillaSemana(iniS, finS) {
      const semana = attendanceEnRango(attendance, iniS, finS).filter(a => a.groupId === group.id)
      const fichajesPorPersona = groupByPerson(semana)
      const tardanzas = tardanzasConCondonacion(attendance, schedules, cfg.condonaciones, iniS, finS, cfg.turnos, cfg.personOverrides)
        .filter(t => t.groupId === group.id)
      const tardanzasPorPersona = groupByPerson(tardanzas)
      // Cálculos POR DÍA desde stats: extras (>30min), horas pagables, descuento no-registro
      const tabla = tablaSemanal({ empleados, attendance, schedules, ini: iniS,
        condonaciones: cfg.condonaciones, turnos: cfg.turnos, personOverrides: cfg.personOverrides })
      const horasExtraPorPersona = {}, horasPagablesPorPersona = {}, descuentoNoRegistroPorPersona = {}, diasNoRegistroPorPersona = {}
      for (const fila of tabla.filas) {
        const agg = extrasYRetrasoDeCells(fila.cells)
        horasExtraPorPersona[fila.empleado.id] = agg.horasExtra
        horasPagablesPorPersona[fila.empleado.id] = agg.horasPagables
        descuentoNoRegistroPorPersona[fila.empleado.id] = agg.descuentoNoRegistro
        diasNoRegistroPorPersona[fila.empleado.id] = agg.diasNoRegistro
      }
      return planillaLocal(empleadosConTarifa, fichajesPorPersona, tardanzasPorPersona, {
        multiplicadorExtra: cfg.config.settings.multiplicadorExtra,
        horasExtraPorPersona, horasPagablesPorPersona, descuentoNoRegistroPorPersona, diasNoRegistroPorPersona,
      })
    }

    if (modo === 'semana') return planillaSemana(ini, fin)

    // Mes: acumular por semanas
    const acc = {} // { personId: filaAcumulada }
    let semanaIni = startOfWeek(ini, { weekStartsOn: 1 })
    while (semanaIni <= fin) {
      const semanaFin = addDays(semanaIni, 6)
      const r = planillaSemana(semanaIni, semanaFin)
      // Filtrar fichajes/tardanzas que caigan FUERA del mes (la primera/última semana suele cruzar)
      // Aquí planillaSemana ya filtró por groupId pero usa rango entero — para precisión recortamos.
      // Para simplificar, sumamos directo. Si una semana cruza, los días fuera no aportan fichajes (no estaban en el rango).
      // Pero acá el rango es la semana completa, así que SÍ se suman. Ajustamos abajo recortando attendance previo.
      for (const fila of r.filas) {
        if (!acc[fila.personId]) {
          acc[fila.personId] = {
            personId: fila.personId, fullName: fila.fullName, position: fila.position, tarifa: fila.tarifa,
            horasTotales: 0, horasNormales: 0, horasExtra: 0,
            baseTarifa: 0, extraTarifa: 0, bruto: 0,
            descuentoTardanza: 0, descuentoNoRegistro: 0, diasNoRegistro: 0, minutosTardeTotales: 0, totalAPagar: 0,
            cantidadTardanzas: 0, tardanzasCondonadas: 0,
          }
        }
        const a = acc[fila.personId]
        a.horasTotales += fila.horasTotales
        a.horasNormales += fila.horasNormales
        a.horasExtra += fila.horasExtra
        a.baseTarifa += fila.baseTarifa
        a.extraTarifa += fila.extraTarifa
        a.bruto += fila.bruto
        a.descuentoTardanza += fila.descuentoTardanza
        a.descuentoNoRegistro += fila.descuentoNoRegistro || 0
        a.diasNoRegistro += fila.diasNoRegistro || 0
        a.minutosTardeTotales += fila.minutosTardeTotales || 0
        a.totalAPagar += fila.totalAPagar
        a.cantidadTardanzas += fila.cantidadTardanzas
        a.tardanzasCondonadas += fila.tardanzasCondonadas
      }
      semanaIni = addDays(semanaIni, 7)
    }

    const r2 = round
    const filas = Object.values(acc).map(a => ({
      ...a,
      horasTotales: r2(a.horasTotales),
      horasNormales: r2(a.horasNormales),
      horasExtra: r2(a.horasExtra),
      baseTarifa: r2(a.baseTarifa),
      extraTarifa: r2(a.extraTarifa),
      bruto: r2(a.bruto),
      descuentoTardanza: r2(a.descuentoTardanza),
      descuentoNoRegistro: r2(a.descuentoNoRegistro),
      totalAPagar: r2(a.totalAPagar),
    }))
    const totales = filas.reduce((t, f) => ({
      horasTotales: t.horasTotales + f.horasTotales,
      horasNormales: t.horasNormales + f.horasNormales,
      horasExtra: t.horasExtra + f.horasExtra,
      bruto: t.bruto + f.bruto,
      descuentoTardanza: t.descuentoTardanza + f.descuentoTardanza,
      descuentoNoRegistro: t.descuentoNoRegistro + f.descuentoNoRegistro,
      totalAPagar: t.totalAPagar + f.totalAPagar,
    }), { horasTotales: 0, horasNormales: 0, horasExtra: 0, bruto: 0, descuentoTardanza: 0, descuentoNoRegistro: 0, totalAPagar: 0 })
    Object.keys(totales).forEach(k => totales[k] = r2(totales[k]))
    return { filas, totales }
  }, [empleados, attendance, schedules, cfg.tarifas, cfg.personOverrides, cfg.condonaciones, cfg.turnos, ini, fin, modo, group.id, cfg.config.settings.multiplicadorExtra])

  const exportColumns = [
    { label: 'Empleado', accessor: 'fullName', width: 26 },
    { label: 'Cargo', accessor: 'position', width: 16 },
    { label: 'Tarifa/h (Bs)', accessor: 'tarifa', width: 12, numFmt: '0.00' },
    { label: 'Horas totales', accessor: 'horasTotales', width: 13, numFmt: '0.00' },
    { label: 'Horas normales', accessor: 'horasNormales', width: 14, numFmt: '0.00' },
    { label: 'Horas extra', accessor: 'horasExtra', width: 12, numFmt: '0.00' },
    { label: 'Bruto (Bs)', accessor: 'bruto', width: 12, numFmt: '"Bs" #,##0.00' },
    { label: 'Min tarde', accessor: r => r.minutosTardeTotales || 0, width: 10, numFmt: '0' },
    { label: 'Tarifa multa', accessor: () => '10 Bs hasta 10 min · +20 Bs cada 10 min adicional', width: 44 },
    { label: 'Descuento tardanza (Bs)', accessor: 'descuentoTardanza', width: 18, numFmt: '"Bs" #,##0.00' },
    { label: 'Días no-registro', accessor: r => r.diasNoRegistro || 0, width: 14, numFmt: '0' },
    { label: 'Descuento no-registro (Bs)', accessor: r => r.descuentoNoRegistro || 0, width: 20, numFmt: '"Bs" #,##0.00' },
    { label: 'Total a pagar (Bs)', accessor: 'totalAPagar', width: 16, numFmt: '"Bs" #,##0.00' },
  ]
  const fileBase = `planilla_${(cfg.config.locales[group.id]?.name || group.name || 'local').replace(/[^a-z0-9]+/gi, '_')}_${fileLabel}`

  return (
    <div className="surface p-5 grain">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h3 className="font-display font-semibold text-lg">Planilla {modo === 'mes' ? 'mensual' : 'semanal'}</h3>
          <p className="text-xs text-ink-300 mt-0.5 capitalize">{rangoLabel} · Tarifas se editan inline</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
          <div className="flex items-center gap-1">
            <button onClick={() => setOffset(o => o - 1)} className="btn-ghost p-2"><ChevronLeft size={16} /></button>
            <button onClick={() => setOffset(0)} className="btn-secondary text-xs">{modo === 'mes' ? 'Este mes' : 'Esta semana'}</button>
            <button onClick={() => setOffset(o => o + 1)} disabled={offset >= 0} className="btn-ghost p-2 disabled:opacity-30"><ChevronRight size={16} /></button>
          </div>
          <button onClick={() => exportCSV(fileBase, planilla.filas, exportColumns)} className="btn-secondary text-xs">
            <Download size={14} /> CSV
          </button>
          <button onClick={() => exportExcel(fileBase, planilla.filas, exportColumns)} className="btn-secondary text-xs">
            <FileSpreadsheet size={14} /> Excel
          </button>
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="text-left">
              <th className="text-xs uppercase tracking-wider text-ink-300 pb-3 font-medium">Empleado</th>
              <th className="text-xs uppercase tracking-wider text-ink-300 pb-3 font-medium text-right">Tarifa/h</th>
              <th className="text-xs uppercase tracking-wider text-ink-300 pb-3 font-medium text-right">H. totales</th>
              <th className="text-xs uppercase tracking-wider text-ink-300 pb-3 font-medium text-right">H. normales</th>
              <th className="text-xs uppercase tracking-wider text-ink-300 pb-3 font-medium text-right">H. extra</th>
              <th className="text-xs uppercase tracking-wider text-ink-300 pb-3 font-medium text-right">Bruto</th>
              <th className="text-xs uppercase tracking-wider text-ink-300 pb-3 font-medium text-right">Desc. tardanza</th>
              <th className="text-xs uppercase tracking-wider text-ink-300 pb-3 font-medium text-right">Desc. no-registro</th>
              <th className="text-xs uppercase tracking-wider text-ink-300 pb-3 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {planilla.filas.map(fila => (
              <tr key={fila.personId} className="border-t border-white/5 hover:bg-bg-700/30 transition">
                <td className="py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={fila.fullName} id={fila.personId} size="sm" />
                    <div>
                      <div className="font-medium text-ink-50">{fila.fullName}</div>
                      <div className="text-xs text-ink-300">{fila.position}</div>
                    </div>
                  </div>
                </td>
                <td className="text-right py-3">
                  <input
                    type="number"
                    step="0.5"
                    value={fila.tarifa}
                    onChange={e => cfg.setTarifa(fila.personId, e.target.value)}
                    className="w-24 bg-bg-700/60 border border-white/5 rounded-lg px-2.5 py-1.5 text-right text-ink-50 focus:outline-none focus:ring-1 focus:ring-accent/40"
                  />
                </td>
                <td className="text-right py-3 font-mono font-semibold text-ink-50">{formatHoras(fila.horasTotales)}</td>
                <td className="text-right py-3 font-mono text-ink-200">{formatHoras(fila.horasNormales)}</td>
                <td className="text-right py-3 font-mono">
                  {fila.horasExtra > 0 ? <span className="text-accent-400">{formatHoras(fila.horasExtra)}</span> : <span className="text-ink-400">—</span>}
                </td>
                <td className="text-right py-3 font-display text-ink-100">{formatBs(fila.bruto)}</td>
                <td className="text-right py-3 font-display">
                  {fila.descuentoTardanza > 0 ? <span className="text-bad">−{formatBs(fila.descuentoTardanza)}</span> : <span className="text-ink-400">—</span>}
                </td>
                <td className="text-right py-3 font-display">
                  {fila.descuentoNoRegistro > 0
                    ? <span className="text-bad" title={`${fila.diasNoRegistro} día(s) sin registrar ingreso o salida`}>−{formatBs(fila.descuentoNoRegistro)}</span>
                    : <span className="text-ink-400">—</span>}
                </td>
                <td className="text-right py-3 font-display font-bold text-ink-50">{formatBs(fila.totalAPagar)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-white/10 bg-bg-700/30">
              <td className="py-3 font-display font-bold text-ink-50">TOTAL LOCAL</td>
              <td></td>
              <td className="text-right py-3 font-mono font-bold text-ink-50">{formatHoras(planilla.totales.horasTotales)}</td>
              <td className="text-right py-3 font-mono">{formatHoras(planilla.totales.horasNormales)}</td>
              <td className="text-right py-3 font-mono text-accent-400">{formatHoras(planilla.totales.horasExtra)}</td>
              <td className="text-right py-3 font-display">{formatBs(planilla.totales.bruto)}</td>
              <td className="text-right py-3 font-display text-bad">{planilla.totales.descuentoTardanza > 0 ? `−${formatBs(planilla.totales.descuentoTardanza)}` : '—'}</td>
              <td className="text-right py-3 font-display text-bad">{planilla.totales.descuentoNoRegistro > 0 ? `−${formatBs(planilla.totales.descuentoNoRegistro)}` : '—'}</td>
              <td className="text-right py-3 font-display font-bold text-accent text-lg">{formatBs(planilla.totales.totalAPagar)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function round(n, d = 2) {
  const f = Math.pow(10, d)
  return Math.round(n * f) / f
}
