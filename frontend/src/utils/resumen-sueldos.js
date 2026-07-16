// Agregación para la página Sueldos: por empleado sobre un rango ARBITRARIO de fechas.
// Reutiliza el motor por día (tablaSemanal) y el cálculo de pago (planillaLocal),
// con dos mejoras sobre el modo mes de Planilla:
//   - recorta por DÍA al rango [ini, fin] (las semanas que cruzan el borde no ensucian)
//   - los días futuros no cuentan, y HOY no cuenta como falta (aunque aún no fiche)

import { format, addDays, startOfWeek } from 'date-fns'
import {
  tablaSemanal, extrasYRetrasoDeCells, attendanceEnRango, groupByPerson,
  tardanzasConCondonacion,
} from './stats'
import { planillaLocal } from './payroll'

// Duración en horas de un horario programado "HH:MM" → "HH:MM" (maneja cruce de medianoche).
function horasDeProgramado(startStr, endStr) {
  if (!startStr || !endStr) return 0
  const [sh, sm] = String(startStr).split(':').map(Number)
  const [eh, em] = String(endStr).split(':').map(Number)
  if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return 0
  let min = (eh * 60 + em) - (sh * 60 + sm)
  if (min < 0) min += 24 * 60
  return min / 60
}

function round(n, d = 2) {
  const f = Math.pow(10, d)
  return Math.round(n * f) / f
}

// empleados: ya filtrados por local (y por trabajador si hay filtro activo).
// Devuelve { filas, totales, porDia }:
//   filas[]:  por empleado — horas programadas/trabajadas/pagables, cumplimiento %,
//             tardanzas (días/min/multa), faltas {count, detalle[]}, no-registro,
//             extras, bruto/descuentos/totalAPagar, y `cells` para el detalle diario.
//   totales:  agregado del conjunto.
//   porDia[]: serie diaria para gráficas { dayStr, label, horas, horasProgramadas, minTarde, faltas }.
export function resumenSueldos({
  empleados, attendance, schedules, condonaciones, turnos, personOverrides,
  ini, fin, settings, getTarifa, groupId,
}) {
  const hoyStr = format(new Date(), 'yyyy-MM-dd')
  const iniStr = format(ini, 'yyyy-MM-dd')
  const finStr = format(fin, 'yyyy-MM-dd')

  // 1) Celdas por persona: iterar las semanas ISO que tocan el rango y RECORTAR
  //    a días dentro de [ini, fin] y no-futuros (cada celda es autocontenida).
  const cellsPorPersona = {}
  let semanaIni = startOfWeek(ini, { weekStartsOn: 1 })
  while (semanaIni <= fin) {
    const tabla = tablaSemanal({ empleados, attendance, schedules, ini: semanaIni, condonaciones, turnos, personOverrides })
    for (const fila of tabla.filas) {
      const keep = fila.cells.filter(c => c.dayStr >= iniStr && c.dayStr <= finStr && c.dayStr <= hoyStr)
      if (keep.length) {
        if (!cellsPorPersona[fila.empleado.id]) cellsPorPersona[fila.empleado.id] = []
        cellsPorPersona[fila.empleado.id].push(...keep)
      }
    }
    semanaIni = addDays(semanaIni, 7)
  }

  // 2) Pago con el MISMO motor que la pestaña Planilla (paridad de Bs).
  const empleadosConTarifa = empleados.map(emp => {
    const sched = (schedules || []).find(s => s.personId === emp.id)
    return { ...emp, tarifa: getTarifa(emp.id), expectedHoursPerWeek: sched?.expectedHoursPerWeek ?? 0 }
  })
  const fichajesPorPersona = groupByPerson(
    attendanceEnRango(attendance, ini, fin).filter(a => !groupId || a.groupId === groupId)
  )
  const tardanzasRango = tardanzasConCondonacion(attendance, schedules, condonaciones, ini, fin, turnos, personOverrides)
    .filter(t => !groupId || t.groupId === groupId)
  const tardanzasPorPersona = groupByPerson(tardanzasRango)

  const horasExtraPorPersona = {}, horasPagablesPorPersona = {}, descuentoNoRegistroPorPersona = {}, diasNoRegistroPorPersona = {}
  const aggPorPersona = {}
  for (const emp of empleados) {
    const agg = extrasYRetrasoDeCells(cellsPorPersona[emp.id] || [])
    aggPorPersona[emp.id] = agg
    horasExtraPorPersona[emp.id] = agg.horasExtra
    horasPagablesPorPersona[emp.id] = agg.horasPagables
    descuentoNoRegistroPorPersona[emp.id] = agg.descuentoNoRegistro
    diasNoRegistroPorPersona[emp.id] = agg.diasNoRegistro
  }

  const planilla = planillaLocal(empleadosConTarifa, fichajesPorPersona, tardanzasPorPersona, {
    multiplicadorExtra: settings?.multiplicadorExtra,
    horasExtraPorPersona, horasPagablesPorPersona, descuentoNoRegistroPorPersona, diasNoRegistroPorPersona,
  })
  const planillaPorPersona = Object.fromEntries(planilla.filas.map(f => [f.personId, f]))

  // 3) Fila final por empleado: horas + faltas + tardanzas + Bs + celdas para detalle.
  const filas = empleados.map(emp => {
    const cells = (cellsPorPersona[emp.id] || []).slice().sort((a, b) => a.dayStr.localeCompare(b.dayStr))
    const agg = aggPorPersona[emp.id]
    const pago = planillaPorPersona[emp.id] || {}

    // Faltas: programado sin fichaje, solo días YA pasados (hoy aún puede fichar).
    const faltas = cells
      .filter(c => c.falto && c.dayStr < hoyStr)
      .map(c => ({ dayStr: c.dayStr, programadoStart: c.programadoStart, programadoEnd: c.programadoEnd, horas: horasDeProgramado(c.programadoStart, c.programadoEnd) }))

    // Días anómalos (sin salida / horas absurdas): usar horas pagables (programadas)
    // en vez de las horas crudas — un "sin salida" viejo inflaría el total hasta hoy.
    const horasTrabajadas = cells.reduce((a, c) => a + (c.anomalia ? (c.horasPagables || 0) : (c.horas || 0)), 0)
    const horasProgramadas = cells.reduce((a, c) => {
      if (c.falto) return a + (c.dayStr < hoyStr ? horasDeProgramado(c.programadoStart, c.programadoEnd) : 0)
      return a + (c.horasProgramadas || 0)
    }, 0)
    const diasProgramados = cells.filter(c => (c.falto && c.dayStr < hoyStr) || c.horasProgramadas > 0).length
    const diasTrabajados = cells.filter(c => c.fichaje).length
    const diasLibreTrabajado = cells.filter(c => c.motivoColor === 'diaLibreTrabajado').length
    const diasTarde = cells.filter(c => c.mins > 0 && c.mins <= 180).length
    const cumplimiento = horasProgramadas > 0 ? Math.round((agg.horasPagables / horasProgramadas) * 100) : null

    return {
      empleado: emp,
      personId: emp.id,
      fullName: emp.fullName,
      position: emp.position || '',
      tarifa: pago.tarifa ?? getTarifa(emp.id),
      horasProgramadas: round(horasProgramadas),
      horasTrabajadas: round(horasTrabajadas),
      horasPagables: round(agg.horasPagables),
      cumplimiento,
      diasProgramados,
      diasTrabajados,
      diasLibreTrabajado,
      diasTarde,
      minTarde: agg.minTarde,
      multaBs: round(agg.multaBs),
      faltas,
      diasNoRegistro: agg.diasNoRegistro,
      descuentoNoRegistro: round(agg.descuentoNoRegistro),
      horasExtra: round(agg.horasExtra),
      anomalias: agg.anomalias,
      bruto: pago.bruto ?? 0,
      descuentoTardanza: pago.descuentoTardanza ?? 0,
      totalAPagar: pago.totalAPagar ?? 0,
      cantidadTardanzas: pago.cantidadTardanzas ?? 0,
      tardanzasCondonadas: pago.tardanzasCondonadas ?? 0,
      cells,
    }
  }).sort((a, b) => b.totalAPagar - a.totalAPagar)

  // 4) Totales del conjunto
  const totales = filas.reduce((t, f) => ({
    horasProgramadas: t.horasProgramadas + f.horasProgramadas,
    horasTrabajadas: t.horasTrabajadas + f.horasTrabajadas,
    horasPagables: t.horasPagables + f.horasPagables,
    horasExtra: t.horasExtra + f.horasExtra,
    diasTarde: t.diasTarde + f.diasTarde,
    minTarde: t.minTarde + f.minTarde,
    multaBs: t.multaBs + f.multaBs,
    faltas: t.faltas + f.faltas.length,
    diasNoRegistro: t.diasNoRegistro + f.diasNoRegistro,
    descuentoNoRegistro: t.descuentoNoRegistro + f.descuentoNoRegistro,
    bruto: t.bruto + f.bruto,
    descuentoTardanza: t.descuentoTardanza + f.descuentoTardanza,
    totalAPagar: t.totalAPagar + f.totalAPagar,
  }), {
    horasProgramadas: 0, horasTrabajadas: 0, horasPagables: 0, horasExtra: 0,
    diasTarde: 0, minTarde: 0, multaBs: 0, faltas: 0,
    diasNoRegistro: 0, descuentoNoRegistro: 0, bruto: 0, descuentoTardanza: 0, totalAPagar: 0,
  })
  Object.keys(totales).forEach(k => { totales[k] = round(totales[k]) })
  totales.cumplimiento = totales.horasProgramadas > 0
    ? Math.round((totales.horasPagables / totales.horasProgramadas) * 100)
    : null

  // 5) Serie diaria para gráficas
  const porDiaMap = {}
  for (const f of filas) {
    for (const c of f.cells) {
      if (!porDiaMap[c.dayStr]) {
        porDiaMap[c.dayStr] = { dayStr: c.dayStr, horas: 0, horasProgramadas: 0, minTarde: 0, faltas: 0 }
      }
      const d = porDiaMap[c.dayStr]
      d.horas += c.anomalia ? (c.horasPagables || 0) : (c.horas || 0)
      d.horasProgramadas += c.falto
        ? (c.dayStr < hoyStr ? horasDeProgramado(c.programadoStart, c.programadoEnd) : 0)
        : (c.horasProgramadas || 0)
      if (c.mins > 0 && c.mins <= 180) d.minTarde += c.mins
      if (c.falto && c.dayStr < hoyStr) d.faltas++
    }
  }
  const porDia = Object.values(porDiaMap)
    .sort((a, b) => a.dayStr.localeCompare(b.dayStr))
    .map(d => ({ ...d, horas: round(d.horas), horasProgramadas: round(d.horasProgramadas) }))

  return { filas, totales, porDia }
}
