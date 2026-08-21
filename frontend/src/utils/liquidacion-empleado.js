// Excel de LIQUIDACIÓN por empleado (imprimible): hoja RESUMEN con el cálculo
// completo del pago y hoja DIA A DIA con cada jornada y su descuento exacto.
// Pensado para mostrárselo al trabajador cuando tenga dudas de un descuento.

import { exportExcelMultiSheet } from './export'
import { celdaToRow, comentarioAnomalia, MULTA_NO_REGISTRO, MULTA_FALTA } from './stats'
import { calcularMulta, MULTA_FRANJAS } from './lateness'
import { formatFecha } from './format'

// Multa por retraso de UN día (misma regla que la planilla: 1–180 min, condonada = 0;
// en turnos partidos viene precalculada por tramo en multaDia).
export function multaDelDia(c) {
  if (!c || !(c.mins > 0 && c.mins <= 180) || c.condonada) return 0
  return c.multaDia != null ? c.multaDia : calcularMulta(c.mins)
}

// Descuento por no marcar entrada o salida de UN día.
export function noRegistroDelDia(c) {
  return c?.registroIncompleto ? MULTA_NO_REGISTRO : 0
}

// Descuento por faltar de UN día (solo días ya pasados; condonada = justificada).
// hoy en hora LOCAL (Bolivia) — toISOString daría el día UTC y correría el corte.
export function faltaDelDia(c) {
  if (!c?.falto || c.faltaCondonada) return 0
  const d = new Date()
  const hoyStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return c.dayStr < hoyStr ? MULTA_FALTA : 0
}

// Texto de la escala para pantallas y Excel (fuente única).
export const TARIFA_MULTA_LABEL = MULTA_FRANJAS
  .map((f, i, arr) => {
    const desde = i === 0 ? 1 : arr[i - 1].hastaMin + 1
    return f.hastaMin === Infinity ? `${desde}+ min: Bs ${f.multa} (tope)` : `${desde}-${f.hastaMin} min: Bs ${f.multa}`
  })
  .join(' · ')

const r2 = n => Math.round((n || 0) * 100) / 100

// fila: la fila del empleado que devuelve resumenSueldos (con .cells y todos los Bs).
export function exportLiquidacionEmpleado({ fila, nombreLocal, rangoLabel, fuente, modeloMensual }) {
  const f = fila
  const fuenteLabel = fuente === 'bio' ? 'Biométrico físico' : 'App (Jibble)'

  // ===== Hoja RESUMEN (Campo / Valor, secciones con "—") =====
  const resumenRows = [
    { Campo: 'Empleado', Valor: f.fullName },
    { Campo: 'Cargo', Valor: f.position || '—' },
    { Campo: 'Local', Valor: nombreLocal },
    { Campo: 'Período', Valor: rangoLabel },
    { Campo: 'Fuente de asistencia', Valor: fuenteLabel },
    { Campo: '— HORAS —', Valor: '' },
    { Campo: 'Horas pagadas (dentro de su horario)', Valor: r2(f.horasPagables) },
    { Campo: 'Horas programadas', Valor: r2(f.horasProgramadas) },
    { Campo: 'Cumplimiento', Valor: f.cumplimiento == null ? '—' : `${f.cumplimiento}%` },
    { Campo: '— PAGO —', Valor: '' },
    { Campo: modeloMensual ? `Básico (Bs ${modeloMensual.sueldoCompleto} por ${modeloMensual.horasCompletas} h/mes)` : 'Básico (horas × tarifa)', Valor: r2(f.baseTarifa) },
    { Campo: 'Extras aprobadas (Bs)', Valor: r2(f.extraTarifa) },
    { Campo: 'BRUTO (Bs)', Valor: r2(f.bruto) },
    { Campo: '— DESCUENTOS (ver detalle día a día) —', Valor: '' },
    { Campo: `Retrasos: ${f.diasTarde} día(s) · ${f.minTarde} min en total`, Valor: -r2(f.multaBs) },
    { Campo: `No marcó entrada o salida: ${f.diasNoRegistro} día(s) × Bs ${MULTA_NO_REGISTRO}`, Valor: -r2(f.descuentoNoRegistro) },
    { Campo: `Faltas: ${f.diasFalta || 0} día(s) × Bs ${MULTA_FALTA}${f.faltas.length ? ' → ' + f.faltas.map(x => formatFecha(x.dayStr) + (x.condonada ? ' (justificada)' : '')).join(', ') : ''}`, Valor: -r2(f.descuentoFaltas || 0) },
    { Campo: '— TOTAL —', Valor: '' },
    { Campo: 'TOTAL A PAGAR (Bs)', Valor: r2(f.totalAPagar) },
    ...(f.minExtraPendiente > 0 ? [{ Campo: `Pendiente: ${f.minExtraPendiente} min extra POR APROBAR (no incluidos)`, Valor: '' }] : []),
    { Campo: '— REGLAS DEL LOCAL —', Valor: '' },
    { Campo: 'Multa por retraso', Valor: TARIFA_MULTA_LABEL },
    { Campo: 'No marcar entrada o salida', Valor: `Bs ${MULTA_NO_REGISTRO} por día` },
    { Campo: 'Faltar al trabajo (día programado sin marcar)', Valor: `Bs ${MULTA_FALTA} por día, además de no pagarse esas horas (falta justificada no descuenta)` },
    { Campo: 'Llegar antes del horario', Valor: 'No suma horas (la ventana arranca a la hora programada)' },
    { Campo: 'Quedarse después de la salida', Valor: 'Solo se paga lo que el encargado apruebe (todo o una parte); pasada la medianoche cuenta igual' },
    ...(modeloMensual ? [{ Campo: 'Mes completo', Valor: `Bs ${modeloMensual.sueldoCompleto} al cubrir ${modeloMensual.horasCompletas} h; proporcional si no llega; sobre ${modeloMensual.horasCompletas} h a Bs ${modeloMensual.tarifaExtra}/h` }] : []),
  ]

  // ===== Hoja DIA A DIA =====
  const diaRows = f.cells
    .filter(c => !(c.state === 'idle' && !c.falto && !c.sinHorario))
    .map(c => {
      const row = celdaToRow(f.empleado, c, nombreLocal)
      const multa = multaDelDia(c)
      const noReg = noRegistroDelDia(c)
      return {
        Fecha: formatFecha(c.dayStr),
        Estado: row.Estado,
        'Prog. entrada': row['Programado entrada'] || '—',
        'Entrada real': row['Entrada real'] || '—',
        'Min tarde': c.mins > 0 && c.mins <= 180 ? c.mins : '',
        'Multa (Bs)': multa ? -multa : '',
        'Prog. salida': row['Programado salida'] || '—',
        'Salida real': row['Salida real'] || '—',
        'Extra aprobado (min)': (!c.anomalia && c.minExtraComputado > 0) ? c.minExtraComputado : '',
        // Pendiente = lo aprobable menos lo ya aprobado (cubre aprobaciones parciales)
        'Por aprobar (min)': (!c.anomalia && (c.extraAprobable || 0) - (c.minExtraComputado || 0) > 0) ? (c.extraAprobable - (c.minExtraComputado || 0)) : '',
        'Horas pagadas': c.falto ? 0 : r2(c.anomalia ? (c.horasPagables || 0) : (c.horas || 0)),
        'No-registro (Bs)': noReg ? -noReg : '',
        'Falta (Bs)': faltaDelDia(c) ? -faltaDelDia(c) : '',
        Comentario: [
          comentarioAnomalia(c),
          !comentarioAnomalia(c) && c.condonada ? 'Retraso condonado — no se cobra.' : null,
          c.falto && c.faltaCondonada ? 'Falta justificada — no se descuenta.' : null,
        ].filter(Boolean).join(' '),
        _rojo: !!(c.falto || c.anomalia),
      }
    })
  diaRows.push({
    Fecha: 'TOTAL', Estado: '',
    'Prog. entrada': '', 'Entrada real': '',
    'Min tarde': f.minTarde || '',
    'Multa (Bs)': f.multaBs ? -r2(f.multaBs) : '',
    'Prog. salida': '', 'Salida real': '',
    'Extra aprobado (min)': f.minExtra || '',
    'Por aprobar (min)': f.minExtraPendiente || '',
    'Horas pagadas': r2(f.horasPagables),
    'No-registro (Bs)': f.descuentoNoRegistro ? -r2(f.descuentoNoRegistro) : '',
    'Falta (Bs)': f.descuentoFaltas ? -r2(f.descuentoFaltas) : '',
    Comentario: `Total a pagar: Bs ${r2(f.totalAPagar)}`,
    _rojo: false,
  })

  const sheets = [
    {
      name: 'RESUMEN',
      columns: [
        { label: 'Concepto', accessor: 'Campo', width: 52 },
        { label: 'Valor', accessor: 'Valor', width: 44 },
      ],
      rows: resumenRows,
      autoFilter: false,
      zebra: false,
      sectionMarkerCol: 'Campo',
      sectionMarkerPrefix: '—',
    },
    {
      name: 'DIA A DIA',
      columns: [
        { label: 'Fecha', accessor: 'Fecha', width: 12 },
        { label: 'Estado', accessor: 'Estado', width: 22 },
        { label: 'Prog. entrada', accessor: 'Prog. entrada', width: 12 },
        { label: 'Entrada real', accessor: 'Entrada real', width: 12 },
        { label: 'Min tarde', accessor: 'Min tarde', width: 9, numFmt: '0' },
        { label: 'Multa (Bs)', accessor: 'Multa (Bs)', width: 11, numFmt: '"Bs" #,##0.00' },
        { label: 'Prog. salida', accessor: 'Prog. salida', width: 11 },
        { label: 'Salida real', accessor: 'Salida real', width: 11 },
        { label: 'Extra aprob. (min)', accessor: 'Extra aprobado (min)', width: 15, numFmt: '0' },
        { label: 'Por aprobar (min)', accessor: 'Por aprobar (min)', width: 15, numFmt: '0' },
        { label: 'Horas pagadas', accessor: 'Horas pagadas', width: 13, numFmt: '0.00' },
        { label: 'No-registro (Bs)', accessor: 'No-registro (Bs)', width: 14, numFmt: '"Bs" #,##0.00' },
        { label: 'Falta (Bs)', accessor: 'Falta (Bs)', width: 11, numFmt: '"Bs" #,##0.00' },
        { label: 'Comentario', accessor: 'Comentario', width: 60 },
      ],
      rows: diaRows,
      rowHighlight: row => row?._rojo === true,
    },
  ]

  const safeNombre = f.fullName.replace(/[^a-z0-9áéíóúñ]+/gi, '_')
  const safeLocal = nombreLocal.replace(/[^a-z0-9]+/gi, '_')
  const safeRango = String(rangoLabel).replace(/[^a-z0-9]+/gi, '_').slice(0, 30)
  exportExcelMultiSheet(`liquidacion_${safeNombre}_${safeLocal}_${safeRango}${fuente === 'bio' ? '_BIOMETRICO' : ''}.xlsx`, sheets)
  return sheets   // para tests
}
