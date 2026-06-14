// Cálculo de planilla semanal con descuento por tardanzas.
// Reglas:
//   - horas_normales = min(horas_totales, horas_esperadas_segun_horario)
//   - horas_extra = max(0, horas_totales - horas_esperadas)
//   - bruto = (normales × tarifa) + (extras × tarifa × multiplicador)  [default mult = 1.5]
//   - descuento = suma de multas de tardanzas NO condonadas
//   - total = bruto - descuento

export const DEFAULT_OVERTIME_MULTIPLIER = 1.5

// Suma horas totales de una lista de fichajes (clockOut puede ser null si está activo).
export function sumarHoras(attendanceList, ahora = new Date()) {
  let totalMin = 0
  for (const a of attendanceList) {
    const inDate = new Date(a.clockIn)
    const outDate = a.clockOut ? new Date(a.clockOut) : ahora
    const diffMin = (outDate - inDate) / 60000
    if (diffMin > 0 && diffMin < 24 * 60) totalMin += diffMin // ignorar fichajes corruptos
  }
  return totalMin / 60
}

// Calcula planilla de un empleado para un período.
// empleado: { id, fullName, position, tarifa, expectedHoursPerWeek }
// fichajes: lista de attendance del empleado en el período
// tardanzas: lista de tardanzas del empleado en el período (con flag .condonada)
// config: { multiplicadorExtra, ahora }
export function planillaEmpleado(empleado, fichajes, tardanzas, config = {}) {
  const mult = config.multiplicadorExtra ?? DEFAULT_OVERTIME_MULTIPLIER
  const ahora = config.ahora || new Date()
  const tarifa = Number(empleado.tarifa) || 0
  const esperadas = Number(empleado.expectedHoursPerWeek) || 0

  const horasTotales = sumarHoras(fichajes, ahora)

  // Modelo de horas extra:
  //  - Si el caller pasa config.horasExtraDia (extras calculadas POR DÍA desde stats:
  //    solo lo que pasa de 30 min tras la salida programada), se usa ese valor.
  //  - Si no (llamadas legacy), cae al modelo semanal: total - esperadas.
  let horasExtra, horasNormales
  if (config.horasExtraDia != null) {
    horasExtra = Math.max(0, config.horasExtraDia)
    horasNormales = Math.max(0, horasTotales - horasExtra)
  } else {
    horasNormales = Math.min(horasTotales, esperadas)
    horasExtra = Math.max(0, horasTotales - esperadas)
  }

  const baseTarifa = horasNormales * tarifa
  const extraTarifa = horasExtra * tarifa * mult

  const tardanzasActivas = tardanzas.filter(t => !t.condonada)
  const descuentoTardanza = tardanzasActivas.reduce((s, t) => s + (t.multa || 0), 0)
  const minutosTardeTotales = tardanzasActivas.reduce((s, t) => s + (t.minutosTarde || 0), 0)

  const bruto = baseTarifa + extraTarifa
  const totalAPagar = Math.max(0, bruto - descuentoTardanza)

  return {
    personId: empleado.id,
    fullName: empleado.fullName,
    position: empleado.position,
    tarifa,
    horasTotales: round(horasTotales, 2),
    horasNormales: round(horasNormales, 2),
    horasExtra: round(horasExtra, 2),
    baseTarifa: round(baseTarifa, 2),
    extraTarifa: round(extraTarifa, 2),
    bruto: round(bruto, 2),
    descuentoTardanza,
    minutosTardeTotales,
    totalAPagar: round(totalAPagar, 2),
    cantidadTardanzas: tardanzas.length,
    tardanzasCondonadas: tardanzas.length - tardanzasActivas.length,
  }
}

// Agrega planillas de todos los empleados de un local en una sola corrida.
//   config.horasExtraPorPersona (opcional): { [personId]: horasExtra calculadas por día }.
//     Si se pasa, cada empleado usa su valor (modelo "extra solo lo que pasa de 30 min/día").
export function planillaLocal(empleados, fichajesPorPersona, tardanzasPorPersona, config = {}) {
  const extraPorPersona = config.horasExtraPorPersona || null
  const filas = empleados.map(emp => planillaEmpleado(
    emp,
    fichajesPorPersona[emp.id] || [],
    tardanzasPorPersona[emp.id] || [],
    extraPorPersona
      ? { ...config, horasExtraDia: extraPorPersona[emp.id] ?? 0 }
      : config,
  ))
  const totales = filas.reduce((acc, f) => ({
    horasNormales: acc.horasNormales + f.horasNormales,
    horasExtra: acc.horasExtra + f.horasExtra,
    bruto: acc.bruto + f.bruto,
    descuentoTardanza: acc.descuentoTardanza + f.descuentoTardanza,
    totalAPagar: acc.totalAPagar + f.totalAPagar,
  }), { horasNormales: 0, horasExtra: 0, bruto: 0, descuentoTardanza: 0, totalAPagar: 0 })

  return {
    filas,
    totales: {
      horasNormales: round(totales.horasNormales, 2),
      horasExtra: round(totales.horasExtra, 2),
      bruto: round(totales.bruto, 2),
      descuentoTardanza: round(totales.descuentoTardanza, 2),
      totalAPagar: round(totales.totalAPagar, 2),
    },
  }
}

function round(n, d = 2) {
  const f = Math.pow(10, d)
  return Math.round(n * f) / f
}
