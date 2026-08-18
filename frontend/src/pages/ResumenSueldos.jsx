// Página "Sueldos": resumen completo por local para armar los sueldos.
// Por empleado: horas trabajadas vs programadas (cumplimiento), tardanzas y
// multas Bs, FALTAS (debía venir y no vino, con fechas), no-registro, extras
// y total a pagar. Filtros: local, Día/Semana/Mes/Rango libre y por empleado.

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Wallet, Calendar, CalendarDays, CalendarRange, CalendarSearch, Fingerprint, MonitorSmartphone,
  ChevronLeft, ChevronRight, ChevronDown, Download, FileSpreadsheet, Clock, UserX, Timer, AlertTriangle,
} from 'lucide-react'
import { addDays, addMonths, format, startOfMonth, endOfMonth, startOfWeek, parseISO } from 'date-fns'
import { useJibble } from '../hooks/useJibble'
import { useActiveWorkspace } from '../hooks/useActiveWorkspace'
import { useCarpetaBiometrico } from '../hooks/useCarpetaBiometrico'
import { GRUPOS_SOLO_BIOMETRICO } from '../config/employees'
import { Avatar } from '../components/ui/Avatar'
import { Skeleton } from '../components/ui/Skeleton'
import { FuenteBiometricoPanel } from '../components/sueldos/FuenteBiometricoPanel'
import { resumenSueldos } from '../utils/resumen-sueldos'
import { MODELO_MENSUAL_DEFAULT } from '../utils/payroll'
import { celdaToRow, comentarioAnomalia } from '../utils/stats'
import { resolverPersonasBio, marcasToAttendance } from '../utils/biometrico'
import { exportLiquidacionEmpleado, multaDelDia, noRegistroDelDia } from '../utils/liquidacion-empleado'
import { marcasEnRango, personasBioDeLocal, mesesConDatos, localesConBio, useBioVersion } from '../utils/biometrico-store'
import { getAliases, setAlias } from '../utils/carpeta-horarios'
import { asumirSemanasFaltantes, isoWeekKey } from '../utils/turnos'
import { formatBs, formatHoras, formatFecha, formatFechaCorta, formatMesAno, formatDiaLargo } from '../utils/format'
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
// Tardanza = rojo (es lo malo); extras = azul. No reusar el naranja de "Trabajadas"
// para que un mismo color no signifique cosas distintas entre gráficas.
const COLOR_TARDE = '#ef4444'
const COLOR_EXTRA = '#5c85d6'
const TOOLTIP_STYLE = {
  background: '#1a1a1f', border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12, color: '#fafafa', fontSize: 12,
}

export default function ResumenSueldos({ cfg }) {
  const data = useJibble(cfg.personOverrides, cfg.config.locales)
  const ws = useActiveWorkspace()
  const [groupId, setGroupId] = useState('')
  const [modo, setModo] = useState('semana')
  const [offset, setOffset] = useState(0)
  const [desde, setDesde] = useState(format(addDays(new Date(), -14), 'yyyy-MM-dd'))
  const [hasta, setHasta] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [personId, setPersonId] = useState('')
  const [expandido, setExpandido] = useState(null)
  // Fuente de asistencia: null = automática ('bio' si el local no tiene gente en
  // Jibble, 'app' en el resto). El usuario puede alternar App ↔ Biométrico.
  const [fuente, setFuente] = useState(null)
  const [aliasVersion, setAliasVersion] = useState(0)
  const bioVersion = useBioVersion()

  // Locales visibles ∪ locales ocultos que YA tienen datos biométricos cargados
  // (resuelve el primer uso de Tuesday, oculto por default hasta el primer sync).
  const grupos = useMemo(() => {
    const visibles = data.groups || []
    const conBio = localesConBio()
    const extra = (data.groupsAll || []).filter(g => !visibles.some(v => v.id === g.id) && conBio.includes(g.id))
    return [...visibles, ...extra]
  }, [data.groups, data.groupsAll, bioVersion])
  const grupoActivo = groupId || grupos[0]?.id || ''
  const nombreLocal = cfg.config.locales[grupoActivo]?.name || grupos.find(g => g.id === grupoActivo)?.name || ''

  const { ini, fin, rangoLabel, rangoCorto } = useMemo(() => {
    const today = new Date()
    if (modo === 'dia') {
      const d = addDays(today, offset)
      return { ini: d, fin: d, rangoLabel: formatDiaLargo(d), rangoCorto: formatFechaCorta(d) }
    }
    if (modo === 'mes') {
      const m = addMonths(startOfMonth(today), offset)
      return { ini: startOfMonth(m), fin: endOfMonth(m), rangoLabel: formatMesAno(m), rangoCorto: formatMesAno(m) }
    }
    if (modo === 'rango') {
      const i = parseISO(desde)
      const f = parseISO(hasta)
      return { ini: i, fin: f >= i ? f : i, rangoLabel: `${formatFecha(desde)} – ${formatFecha(hasta)}`, rangoCorto: '' }
    }
    const lun = addDays(startOfWeek(today, { weekStartsOn: 1 }), offset * 7)
    const dom = addDays(lun, 6)
    return {
      ini: lun, fin: dom,
      rangoLabel: `Semana ${formatFechaCorta(lun)} – ${formatFechaCorta(dom)} ${format(dom, 'yyyy')}`,
      rangoCorto: `${formatFechaCorta(lun)} – ${formatFechaCorta(dom)}`,
    }
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

  // Modelo mensual del contador (3.300 Bs por 208 h, extras a 13,75) SOLO en modo Mes:
  // el umbral de 208 h es mensual, en día/semana/rango se muestra el cálculo por hora.
  const modeloMensual = modo === 'mes' ? MODELO_MENSUAL_DEFAULT : null

  // Local "solo biométrico" = toda su gente es sintética (no existe en Jibble), ej. Tuesday.
  const esLocalBio = empleadosLocal.length > 0 && empleadosLocal.every(p => p.synthetic)
  const fuenteEfectiva = fuente ?? (esLocalBio ? 'bio' : 'app')

  // Carpeta del biométrico del local. Al primer sync con datos: mostrar el local
  // si estaba oculto por default (sin pisar una decisión explícita del usuario).
  const carpetaBio = useCarpetaBiometrico({
    groupId: grupoActivo,
    onDatosCargados: () => {
      if (cfg.config.locales[grupoActivo]?.hidden === undefined) {
        cfg.renombrarLocal(grupoActivo, { hidden: false })
      }
    },
  })

  // Asistencia desde el biométrico: marcas del rango + resolución de nombres
  // (local con Jibble → alias/matcher a personId reales; sin Jibble → sintéticos).
  const attendanceBio = useMemo(() => {
    if (!grupoActivo) return { rows: [], noEncontrados: [] }
    const iniStr = format(ini, 'yyyy-MM-dd')
    const finStr = format(fin, 'yyyy-MM-dd')
    const personasBio = personasBioDeLocal(grupoActivo)
    const empleadosJibble = esLocalBio ? [] : empleadosLocal.filter(p => !p.synthetic)
    const { mapa, noEncontrados } = resolverPersonasBio({
      groupId: grupoActivo, personasBio, empleadosJibble, aliases: getAliases(grupoActivo),
    })
    return { rows: marcasToAttendance(marcasEnRango(grupoActivo, iniStr, finStr), { groupId: grupoActivo, mapa }), noEncontrados }
  }, [grupoActivo, ini, fin, empleadosLocal, esLocalBio, bioVersion, aliasVersion])

  const attendanceFuente = fuenteEfectiva === 'bio' ? attendanceBio.rows : data.attendance

  // REGLA DE LA CASA (solo locales biométricos): semana del rango sin horario en el
  // cuaderno → se AVISA y se asume el horario de la semana más cercana con datos.
  const { turnosEfectivos, semanasAsumidas } = useMemo(() => {
    if (!esLocalBio) return { turnosEfectivos: cfg.turnos, semanasAsumidas: [] }
    const weekKeys = []
    for (let d = startOfWeek(ini, { weekStartsOn: 1 }); d <= fin; d = addDays(d, 7)) weekKeys.push(isoWeekKey(d))
    const ids = empleadosLocal.map(p => p.id)
    const { relleno, semanasAsumidas } = asumirSemanasFaltantes(cfg.turnos, weekKeys, ids)
    return { turnosEfectivos: relleno, semanasAsumidas }
  }, [esLocalBio, cfg.turnos, ini, fin, empleadosLocal])

  const resumen = useMemo(() => {
    if (!ready || empleadosFiltrados.length === 0) return null
    return resumenSueldos({
      empleados: empleadosFiltrados,
      attendance: attendanceFuente,
      schedules: data.schedules,
      condonaciones: cfg.condonaciones,
      extrasAprobadas: cfg.extrasAprobadas,
      turnos: turnosEfectivos,
      personOverrides: cfg.personOverrides,
      ini, fin,
      settings: cfg.config.settings,
      getTarifa: cfg.getTarifaResolved,
      groupId: grupoActivo,
      modeloMensual,
    })
  }, [ready, empleadosFiltrados, attendanceFuente, data.schedules, cfg.condonaciones, cfg.extrasAprobadas, turnosEfectivos, cfg.personOverrides, ini, fin, cfg.config.settings, grupoActivo, modeloMensual])

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

  // Retrasos y extras por día (lo que pidió ver): solo días con algo que mostrar.
  const chartRetrasos = useMemo(() => (resumen?.porDia || [])
    .filter(d => d.minTarde > 0 || d.minExtra > 0)
    .map(d => ({
      name: format(parseISO(d.dayStr), 'dd/MM'),
      'Min tarde': d.minTarde,
      'Min extra': d.minExtra,
      aRevisar: d.aRevisar,
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
    { label: 'Min extra', accessor: 'minExtra', width: 10, numFmt: '0' },
    { label: 'Min extra por aprobar', accessor: 'minExtraPendiente', width: 18, numFmt: '0' },
    { label: 'Llegadas ≥30 min antes', accessor: 'diasTemprano', width: 18, numFmt: '0' },
    { label: 'Multa tardanza (Bs)', accessor: 'multaBs', width: 16, numFmt: '"Bs" #,##0.00' },
    { label: 'Días no-registro', accessor: 'diasNoRegistro', width: 14, numFmt: '0' },
    { label: 'Desc. no-registro (Bs)', accessor: 'descuentoNoRegistro', width: 18, numFmt: '"Bs" #,##0.00' },
    { label: 'H. extra', accessor: 'horasExtra', width: 10, numFmt: '0.00' },
    { label: 'Tarifa/h (Bs)', accessor: 'tarifa', width: 12, numFmt: '0.00' },
    { label: 'Bruto (Bs)', accessor: 'bruto', width: 12, numFmt: '"Bs" #,##0.00' },
    { label: 'Total a pagar (Bs)', accessor: 'totalAPagar', width: 16, numFmt: '"Bs" #,##0.00' },
    { label: 'Días sin horario', accessor: 'diasSinHorario', width: 14, numFmt: '0' },
    { label: 'Días a revisar', accessor: 'diasARevisar', width: 13, numFmt: '0' },
  ]
  const fileBase = `sueldos_${nombreLocal.replace(/[^a-z0-9]+/gi, '_')}_${format(ini, 'dd-MM-yyyy')}_${format(fin, 'dd-MM-yyyy')}${fuenteEfectiva === 'bio' ? '_BIOMETRICO' : ''}`

  if (!ready) return <div className="p-8 max-w-[1400px] mx-auto"><Skeleton className="h-96" /></div>

  const t = resumen?.totales

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <header className="mb-6">
        <h1 className="text-4xl font-display font-bold tracking-tightest mb-1 flex items-center gap-3">
          <Wallet size={30} className="text-accent" /> Sueldos
        </h1>
        <p className="text-sm text-ink-300">
          {nombreLocal} · {rangoLabel} · fuente:{' '}
          <span className="text-ink-100 font-medium">{fuenteEfectiva === 'bio' ? 'Biométrico físico' : 'App (Jibble)'}</span>
        </p>
      </header>

      {/* Filtros */}
      <div className="surface p-4 mb-6 grain flex items-center gap-2 flex-wrap">
        <select value={grupoActivo} onChange={e => { setGroupId(e.target.value); setPersonId(''); setExpandido(null); setFuente(null) }} className="input text-sm w-auto">
          {grupos.map(g => <option key={g.id} value={g.id}>{cfg.config.locales[g.id]?.name || g.name}</option>)}
        </select>
        {/* Fuente de asistencia: App (Jibble) vs Biométrico físico */}
        <div className="flex gap-1 bg-bg-700/50 p-1 rounded-xl border border-white/5" data-testid="selector-fuente">
          <button
            onClick={() => setFuente('app')}
            disabled={esLocalBio}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-35 disabled:cursor-not-allowed ${
              fuenteEfectiva === 'app' ? 'bg-accent text-white shadow-glow' : 'text-ink-200 hover:text-ink-50'
            }`}
            title={esLocalBio ? 'Este local no usa Jibble — solo biométrico' : 'Fichajes de Jibble (celulares / kiosco)'}
          >
            <MonitorSmartphone size={13} /> App
          </button>
          <button
            onClick={() => setFuente('bio')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              fuenteEfectiva === 'bio' ? 'bg-accent text-white shadow-glow' : 'text-ink-200 hover:text-ink-50'
            }`}
            title="Marcas del aparato biométrico del local"
          >
            <Fingerprint size={13} /> Biométrico
          </button>
        </div>
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
          // El rango va ENTRE las flechas: siempre se ve qué mes/semana estás mirando
          <div className="flex items-center gap-1">
            <button onClick={() => setOffset(o => o - 1)} className="btn-ghost p-2" title="Anterior"><ChevronLeft size={16} /></button>
            <span className="text-xs font-semibold text-ink-50 px-2 min-w-[110px] text-center whitespace-nowrap">{rangoCorto}</span>
            <button onClick={() => setOffset(o => o + 1)} disabled={offset >= 0} className="btn-ghost p-2 disabled:opacity-30" title="Siguiente"><ChevronRight size={16} /></button>
            {offset !== 0 && (
              <button onClick={() => setOffset(0)} className="btn-secondary text-xs whitespace-nowrap">
                {modo === 'mes' ? 'Este mes' : modo === 'semana' ? 'Esta semana' : 'Hoy'}
              </button>
            )}
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

      {/* El local vive en OTRA cuenta de Jibble y el filtro activo la excluye:
          sin su gente no hay horarios ni comparación App/Biométrico. */}
      {ready && empleadosLocal.length === 0 && !GRUPOS_SOLO_BIOMETRICO.has(grupoActivo) && ws.active !== 'all' && ws.hasMultiple && (
        <div className="mb-6 rounded-xl border border-warn/40 bg-warn/5 p-4 flex items-center gap-3 flex-wrap" data-testid="banner-otra-cuenta">
          <AlertTriangle size={20} className="text-warn shrink-0" />
          <div className="text-sm text-ink-200 flex-1 min-w-[260px]">
            <span className="font-semibold text-warn">La gente de este local está en otra cuenta de Jibble</span>
            {' '}— ahora mismo solo estás viendo una cuenta, por eso no aparecen sus empleados, horarios ni la comparación App/Biométrico.
          </div>
          <button
            onClick={() => ws.setActive('all')}
            className="btn-secondary text-xs whitespace-nowrap"
            data-testid="btn-todas-cuentas"
          >
            Ver todas las cuentas
          </button>
        </div>
      )}

      {/* Fuente biométrico: carpeta conectada, meses cargados, nombres sin resolver */}
      {fuenteEfectiva === 'bio' && (
        <FuenteBiometricoPanel
          carpeta={carpetaBio}
          groupId={grupoActivo}
          meses={mesesConDatos(grupoActivo)}
          noEncontrados={attendanceBio.noEncontrados}
          empleadosParaAlias={esLocalBio ? [] : empleadosLocal.filter(p => !p.synthetic)}
          onAlias={(nombre, valor) => { setAlias(grupoActivo, nombre, valor); setAliasVersion(v => v + 1) }}
          sinDatosEnRango={attendanceBio.rows.length === 0}
          rangoLabel={rangoLabel}
        />
      )}

      {/* Semanas del rango sin horario en el cuaderno → horario asumido (regla de la casa) */}
      {semanasAsumidas.length > 0 && (
        <div className="mb-6 rounded-xl border border-warn/40 bg-warn/5 p-4 flex items-start gap-3" data-testid="banner-semanas-asumidas">
          <AlertTriangle size={20} className="text-warn mt-0.5 shrink-0" />
          <div className="text-sm text-ink-200">
            <span className="font-semibold text-warn">
              {semanasAsumidas.length} semana{semanasAsumidas.length > 1 ? 's' : ''} sin horario en el cuaderno del gerente
            </span>
            {' — '}se asumió el horario de la semana más cercana para poder calcular retrasos:{' '}
            {semanasAsumidas.map(s => `${s.semana} (usa ${s.desde})`).join(' · ')}.
            <span className="block text-xs text-ink-300 mt-0.5">
              Los días asumidos llevan su nota en el detalle. Pide al gerente completar el cuaderno para tener el dato real.
            </span>
          </div>
        </div>
      )}

      {!resumen || resumen.filas.length === 0 ? (
        <div className="surface p-8 text-center text-ink-300">
          {empleadosLocal.length === 0 && !GRUPOS_SOLO_BIOMETRICO.has(grupoActivo) && ws.active !== 'all' && ws.hasMultiple
            ? 'Este local está en otra cuenta de Jibble — usa "Ver todas las cuentas" (arriba) para cargar a su gente.'
            : fuenteEfectiva === 'bio' && attendanceBio.rows.length === 0
              ? 'Sin marcas del biométrico en este rango — conecta la carpeta o exporta el mes del aparato.'
              : 'Sin empleados o datos en este rango.'}
        </div>
      ) : (
        <>
          {/* Lo que no cuadra: sin horario cargado y días a revisar */}
          {(resumen.empleadosSinHorario.length > 0 || t.diasARevisar > 0) && (
            <div className="mb-6 rounded-xl border border-bad/40 bg-bad/5 p-4 flex items-start gap-3">
              <AlertTriangle size={20} className="text-bad mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0 space-y-1.5">
                {resumen.empleadosSinHorario.length > 0 && (
                  <div>
                    <span className="font-semibold text-bad text-sm">
                      Sin horario cargado en este rango ({resumen.empleadosSinHorario.length}):
                    </span>
                    <span className="text-sm text-ink-200"> {resumen.empleadosSinHorario.join(', ')}</span>
                    <p className="text-xs text-ink-300 mt-0.5">
                      Sus días no se evalúan (no cuentan como falta ni tardanza) y solo se les pagan las horas fichadas.
                      Carga la planilla del mes en la pestaña <span className="text-ink-100 font-medium">Turnos</span> del local,
                      o define su horario base en <span className="text-ink-100 font-medium">Empleados</span>.
                    </p>
                  </div>
                )}
                {t.diasARevisar > 0 && (
                  <p className="text-sm text-ink-200">
                    <span className="font-semibold text-bad">{t.diasARevisar} día{t.diasARevisar > 1 ? 's' : ''} con datos a revisar</span>
                    {' '}— aparecen en rojo con el motivo dentro del detalle de cada empleado.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Revisión pendiente: extras sin aprobar y llegadas muy tempranas (reglas de la casa) */}
          {(t.diasExtraPendiente > 0 || t.diasTemprano > 0) && (
            <div data-testid="banner-revision" className="mb-6 rounded-xl border border-warn/40 bg-warn/5 p-4 flex items-start gap-3">
              <Timer size={20} className="text-warn mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0 text-sm text-ink-200 space-y-1">
                {t.diasExtraPendiente > 0 && (
                  <p>
                    <span className="font-semibold text-warn">{t.diasExtraPendiente} día{t.diasExtraPendiente > 1 ? 's' : ''} con extras por aprobar</span>
                    {' '}({t.minExtraPendiente} min en total). No se pagan salvo que los apruebes: abre el detalle
                    del empleado y usa el botón <span className="text-ink-100 font-medium">Aprobar</span> en cada día.
                  </p>
                )}
                {t.diasTemprano > 0 && (
                  <p>
                    <span className="font-semibold text-warn">{t.diasTemprano} llegada{t.diasTemprano > 1 ? 's' : ''} ≥30 min antes del horario</span>
                    {' '}— ese tiempo no se paga (la ventana arranca en la hora programada), pero revisa qué pasó.
                  </p>
                )}
              </div>
            </div>
          )}

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
              label="Tardanzas y extras"
              value={`${t.diasTarde} días · ${t.minTarde} min`}
              sub={`−${formatBs(t.multaBs)} en multas${t.minExtra > 0 ? ` · +${t.minExtra} min extra` : ''}`}
              subClass={t.multaBs > 0 ? 'text-bad' : 'text-ink-400'}
            />
            <Kpi
              icon={Wallet}
              label="Total a pagar"
              value={formatBs(t.totalAPagar)}
              valueClass="text-accent"
              sub={modeloMensual
                ? `bruto ${formatBs(t.bruto)} − descuentos ${formatBs(t.descuentoAplicado)} · modelo mensual: 3.300 Bs por 208 h`
                : `bruto ${formatBs(t.bruto)} − descuentos ${formatBs(t.descuentoAplicado)}`}
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

          {/* Retrasos y extras por día */}
          {chartRetrasos.length > 0 && (
            <div className="mb-6">
              <ChartCard
                title="Retrasos y minutos extra por día"
                subtitle={`${personId ? empleadosLocal.find(p => p.id === personId)?.fullName : 'todo el local'} · solo días con retraso o extras`}
              >
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartRetrasos} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="name" stroke="#a1a1aa" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis stroke="#a1a1aa" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={34} unit="m" />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.03)' }} formatter={v => `${v} min`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Min tarde" fill={COLOR_TARDE} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                    <Bar dataKey="Min extra" fill={COLOR_EXTRA} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}

          {/* Tabla principal */}
          <div className="surface p-5 grain">
            <h3 className="font-display font-semibold text-lg mb-4">Detalle por empleado</h3>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[1050px] text-sm">
                <thead>
                  <tr className="text-left">
                    {['Empleado', 'H. prog.', 'H. trab.', '% Cumpl.', 'Días tarde', 'Min tarde', 'Min extra', 'Multa', 'Faltas', 'No-reg.', 'H. extra', 'Bruto', 'Total a pagar', ''].map((h, i) => (
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
                        rangoLabel={rangoLabel}
                        fuente={fuenteEfectiva}
                        modeloMensual={modeloMensual}
                        aprobarExtra={cfg.aprobarExtra}
                        revertirExtra={cfg.revertirExtra}
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
                    <td className="text-right py-3 text-accent-400">{t.minExtra || '—'}</td>
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

// Celda de extras del detalle diario. Regla de la casa (ago-2026 v2): quedarse
// >15 min tras la salida = extra aprobable; si se aprueba se pagan TODOS los
// minutos (incluidos los primeros 15) y se puede aprobar PARCIAL ("de tus 45
// te apruebo 30") con el input.
function CeldaExtra({ c, aprobarExtra, revertirExtra }) {
  const [minutos, setMinutos] = useState('')
  if (c.anomalia || !c.extraKey) return <span className="text-ink-400">—</span>

  if (c.extraAprobada && c.minExtraComputado > 0) {
    const parcial = c.minExtraComputado < c.extraAprobable
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className={parcial ? 'text-warn font-medium' : 'text-good font-medium'}
          title={parcial ? `Aprobaste ${c.minExtraComputado} de los ${c.extraAprobable} min que se quedó — el resto sigue pendiente` : `Aprobado completo: ${c.minExtraComputado} min pagados`}>
          +{c.minExtraComputado}{parcial ? ` de ${c.extraAprobable}` : ''} ✓
        </span>
        <button
          onClick={e => { e.stopPropagation(); revertirExtra(c.extraKey) }}
          className="text-[10px] px-1.5 py-0.5 rounded-md border border-white/10 text-ink-300 hover:text-ink-50 hover:border-white/25 focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent active:opacity-70 transition-colors"
          title="Quitar la aprobación: estos minutos dejan de pagarse (puedes volver a aprobar otra cantidad)"
        >Quitar</button>
      </span>
    )
  }

  if (c.extraAprobable > 0) {
    const valor = minutos === '' ? c.extraAprobable : minutos
    const clamped = Math.max(1, Math.min(Number(valor) || c.extraAprobable, c.extraAprobable))
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-warn font-medium" title="Se quedó después de su salida programada — solo se paga lo que apruebes (todo o una parte)">
          {c.extraAprobable} min
        </span>
        <input
          type="number"
          min={1}
          max={c.extraAprobable}
          value={valor}
          onChange={e => setMinutos(e.target.value)}
          onClick={e => e.stopPropagation()}
          className="w-14 px-1.5 py-0.5 text-right text-[11px] rounded-md bg-bg-700/70 border border-warn/40 text-ink-50 focus:outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-warn"
          title={`Cuántos minutos aprobar (máx. ${c.extraAprobable})`}
          data-testid="input-min-extra"
        />
        <button
          onClick={e => { e.stopPropagation(); aprobarExtra(c.extraKey, clamped); setMinutos('') }}
          className="text-[10px] px-1.5 py-0.5 rounded-md bg-warn/15 border border-warn/40 text-warn hover:bg-warn/25 focus-visible:outline focus-visible:outline-1 focus-visible:outline-warn active:opacity-70 transition-colors font-medium"
          title={`Aprobar ${clamped} min (se pagan completos, incluidos los primeros 15)`}
        >Aprobar</button>
      </span>
    )
  }

  return <span className="text-ink-400">—</span>
}

function FilaEmpleado({ f, abierto, onToggle, nombreLocal, rangoLabel, fuente, modeloMensual, aprobarExtra, revertirExtra }) {
  // Filtro del detalle diario: qué días generaron cada descuento y por qué.
  // El componente NO se desmonta al colapsar → resetear al cerrar.
  const [filtroDetalle, setFiltroDetalle] = useState('todos')
  useEffect(() => { if (!abierto) setFiltroDetalle('todos') }, [abierto])

  const cellsVisibles = f.cells.filter(c => !(c.state === 'idle' && !c.falto && !c.sinHorario))
  const bsRetrasos = cellsVisibles.reduce((a, c) => a + multaDelDia(c), 0)
  const categorias = [
    { id: 'todos', label: `Todos · ${cellsVisibles.length} días`, test: () => true },
    { id: 'retrasos', label: `Retrasos · −Bs ${bsRetrasos}`, test: c => c.mins > 0 && c.mins <= 180 },
    { id: 'noRegistro', label: `No marcó · −Bs ${f.descuentoNoRegistro}`, test: c => c.registroIncompleto },
    { id: 'faltas', label: `Faltas`, test: c => c.falto },
    { id: 'extras', label: `Extras`, test: c => !c.anomalia && (c.extraAprobable > 0 || c.minExtraComputado > 0) },
    { id: 'tempranas', label: `Llegó antes`, test: c => !c.anomalia && c.revisarTemprano },
    { id: 'revisar', label: `A revisar`, test: c => c.anomalia },
  ].map(cat => ({ ...cat, count: cat.id === 'todos' ? cellsVisibles.length : cellsVisibles.filter(cat.test).length }))
  const catActiva = categorias.find(c => c.id === filtroDetalle) || categorias[0]
  const cellsFiltradas = filtroDetalle === 'todos' ? cellsVisibles : cellsVisibles.filter(catActiva.test)

  return (
    <>
      <tr onClick={onToggle} className="border-t border-white/5 hover:bg-bg-700/30 transition cursor-pointer">
        <td className="py-3">
          <div className="flex items-center gap-2.5">
            <Avatar name={f.fullName} id={f.personId} size="sm" />
            <div className="min-w-0">
              <div className="font-medium text-ink-50 flex items-center gap-1.5">
                {f.fullName}
                {f.diasARevisar > 0 && (
                  <span className="badge bg-bad/15 text-bad text-[10px] whitespace-nowrap" title="Días con datos a revisar — abre el detalle">
                    {f.diasARevisar} a revisar
                  </span>
                )}
                {f.diasExtraPendiente > 0 && (
                  <span className="badge bg-warn/15 text-warn text-[10px] whitespace-nowrap" title={`Se quedó después de su salida en ${f.diasExtraPendiente} día(s) — ${f.minExtraPendiente} min por aprobar. Abre el detalle para aprobar o descartar.`}>
                    {f.minExtraPendiente} min por aprobar
                  </span>
                )}
                {f.diasTemprano > 0 && (
                  <span className="badge bg-warn/15 text-warn text-[10px] whitespace-nowrap" title={`Llegó ≥30 min antes de su horario en ${f.diasTemprano} día(s) (${f.minAntesTotal} min). Ese tiempo no se paga — revisa qué pasó.`}>
                    {f.diasTemprano} llegada{f.diasTemprano > 1 ? 's' : ''} temprana{f.diasTemprano > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="text-xs text-ink-300">
                {f.position}
                {f.horasProgramadas === 0 && f.diasSinHorario > 0 && (
                  <span className="text-bad"> · sin horario cargado</span>
                )}
              </div>
            </div>
          </div>
        </td>
        <td className="text-right py-3 font-mono text-ink-200">{f.horasProgramadas > 0 ? formatHoras(f.horasProgramadas) : <span className="text-bad" title="Sin horario cargado en este rango">—</span>}</td>
        <td className="text-right py-3 font-mono font-semibold text-ink-50">{formatHoras(f.horasTrabajadas)}</td>
        <td className="text-right py-3">
          {f.cumplimiento == null ? <span className="text-ink-400">—</span> : (
            <span className={`font-medium ${f.cumplimiento >= 95 ? 'text-good' : f.cumplimiento >= 80 ? 'text-warn' : 'text-bad'}`}>{f.cumplimiento}%</span>
          )}
        </td>
        <td className="text-right py-3">{f.diasTarde || <span className="text-ink-400">—</span>}</td>
        <td className="text-right py-3">{f.minTarde || <span className="text-ink-400">—</span>}</td>
        <td className="text-right py-3">{f.minExtra > 0 ? <span className="text-accent-400">{f.minExtra}</span> : <span className="text-ink-400">—</span>}</td>
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
          <td colSpan={14} className="py-3 px-2 bg-bg-700/20">
            {f.faltas.length > 0 && (
              <div className="mb-3 rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm">
                <span className="font-semibold text-bad">No vino ({f.faltas.length}):</span>{' '}
                <span className="text-ink-200">
                  {f.faltas.map(x => `${formatFecha(x.dayStr)} (programado ${x.programadoStart}–${x.programadoEnd})`).join(' · ')}
                </span>
              </div>
            )}
            {/* Filtros: qué días exactos generaron cada descuento / señal */}
            <div className="mb-3 flex items-center gap-1.5 flex-wrap" data-testid="filtro-detalle">
              {categorias.filter(cat => cat.count > 0).map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setFiltroDetalle(cat.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent active:opacity-70 ${
                    filtroDetalle === cat.id
                      ? 'bg-accent text-white border-accent shadow-glow'
                      : cat.id === 'retrasos' || cat.id === 'noRegistro' || cat.id === 'faltas' || cat.id === 'revisar'
                        ? 'border-bad/40 text-bad hover:bg-bad/10'
                        : cat.id === 'todos'
                          ? 'border-white/15 text-ink-200 hover:text-ink-50 hover:border-white/30'
                          : 'border-warn/40 text-warn hover:bg-warn/10'
                  }`}
                  title={cat.id === 'todos' ? 'Ver todos los días' : `Ver solo los días de: ${cat.label}`}
                >
                  {cat.label}{cat.id !== 'todos' ? ` · ${cat.count} día${cat.count > 1 ? 's' : ''}` : ''}
                </button>
              ))}
              <button
                onClick={e => { e.stopPropagation(); exportLiquidacionEmpleado({ fila: f, nombreLocal, rangoLabel, fuente, modeloMensual }) }}
                className="ml-auto btn-secondary text-[11px] whitespace-nowrap"
                data-testid="btn-excel-empleado"
                title={`Liquidación imprimible de ${f.fullName}: resumen del pago + día a día con cada descuento`}
              >
                <FileSpreadsheet size={13} /> Excel de {f.fullName.split(' ')[0]}
              </button>
            </div>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-xs min-w-[900px]">
                <thead>
                  <tr className="text-left text-ink-400 uppercase tracking-wider">
                    <th className="pb-2 font-medium">Fecha</th>
                    <th className="pb-2 font-medium">Estado</th>
                    <th className="pb-2 font-medium text-right">Prog. entrada</th>
                    <th className="pb-2 font-medium text-right">Entrada real</th>
                    <th className="pb-2 font-medium text-right">Min tarde</th>
                    <th className="pb-2 font-medium text-right">Prog. salida</th>
                    <th className="pb-2 font-medium text-right">Salida real</th>
                    <th className="pb-2 font-medium text-right">Min extra</th>
                    <th className="pb-2 font-medium text-right">Horas</th>
                    <th className="pb-2 font-medium text-right">Desc. Bs</th>
                    <th className="pb-2 font-medium pl-3">Comentario</th>
                  </tr>
                </thead>
                <tbody>
                  {cellsFiltradas.length === 0 && (
                    <tr><td colSpan={11} className="py-3 text-ink-400">Sin días en esta categoría.</td></tr>
                  )}
                  {cellsFiltradas.map(c => {
                    const row = celdaToRow(f.empleado, c, nombreLocal)
                    const comentario = comentarioAnomalia(c)
                    // Rojo = algo no cuadra o no vino: falta, anomalía o día sin horario.
                    const enRojo = c.falto || c.anomalia
                    return (
                      <tr key={c.dayStr} className={`border-t border-white/5 ${enRojo ? 'bg-bad/5' : ''}`}>
                        <td className={`py-1.5 text-ink-200 ${enRojo ? 'border-l-2 border-bad pl-1.5' : ''}`}>{formatFecha(c.dayStr)}</td>
                        <td className={`py-1.5 ${c.falto ? 'text-bad font-semibold' : c.anomalia ? 'text-bad' : c.sinHorario ? 'text-ink-400' : c.mins > 0 ? 'text-warn' : 'text-ink-200'}`}>{row.Estado}</td>
                        <td className="py-1.5 text-right font-mono text-ink-300">{row['Programado entrada'] || '—'}</td>
                        <td className="py-1.5 text-right font-mono text-ink-100">{row['Entrada real'] || '—'}</td>
                        <td className="py-1.5 text-right">{row['Min tarde'] ? <span className={c.condonada ? 'text-ink-400 line-through' : 'text-warn'}>+{row['Min tarde']}</span> : '—'}</td>
                        <td className="py-1.5 text-right font-mono text-ink-300">{row['Programado salida'] || '—'}</td>
                        <td className="py-1.5 text-right font-mono text-ink-100">{row['Salida real'] || '—'}</td>
                        <td className="py-1.5 text-right whitespace-nowrap">
                          <CeldaExtra c={c} aprobarExtra={aprobarExtra} revertirExtra={revertirExtra} />
                        </td>
                        <td className="py-1.5 text-right font-mono" title={c.anomalia ? 'Día anómalo: se muestran las horas PAGABLES (programadas), no las fichadas' : undefined}>
                          {c.anomalia
                            ? (c.horasPagables > 0 ? `${c.horasPagables.toFixed(2)}*` : '—')
                            : (row['Horas trabajadas'] || '—')}
                        </td>
                        <td className="py-1.5 text-right whitespace-nowrap" title={multaDelDia(c) + noRegistroDelDia(c) > 0 ? `${multaDelDia(c) ? `Retraso de ${c.mins} min: −Bs ${multaDelDia(c)}` : ''}${multaDelDia(c) && noRegistroDelDia(c) ? ' · ' : ''}${noRegistroDelDia(c) ? `No marcó entrada o salida: −Bs ${noRegistroDelDia(c)}` : ''}` : undefined}>
                          {multaDelDia(c) + noRegistroDelDia(c) > 0
                            ? <span className="text-bad font-medium">−Bs {multaDelDia(c) + noRegistroDelDia(c)}</span>
                            : <span className="text-ink-400">—</span>}
                        </td>
                        <td className={`py-1.5 pl-3 ${enRojo || c.sinHorario ? 'text-bad' : 'text-ink-400'}`}>
                          {[
                            c.revisarTemprano ? `Llegó ${c.minAntes} min antes de su horario (no se pagan — revisar).` : null,
                            comentario,
                            !comentario && c.condonada ? 'Tardanza condonada — no se cobra multa.' : null,
                          ].filter(Boolean).join(' ')}
                        </td>
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
