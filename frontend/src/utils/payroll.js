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

  // Horas totales: si el caller pasa config.horasPagablesDia (horas reales por día,
  // con días incompletos/absurdos ya reemplazados por el horario programado), se usa eso.
  // Si no (legacy), suma los fichajes crudos (puede inflar días sin cerrar).
  const horasTotales = config.horasPagablesDia != null
    ? Math.max(0, config.horasPagablesDia)
    : sumarHoras(fichajes, ahora)

  // Modelo de horas extra:
  //  - config.horasExtraDia (extras por día: solo lo que pasa de 30 min tras la salida) → se usa.
  //  - Si no (legacy), modelo semanal: total - esperadas.
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
  // Multa: si el caller pasa config.multaBsDia / minTardeDia (calculados por día en
  // stats.extrasYRetrasoDeCells), se usan — esa es la regla real: ignora las tardanzas
  // absurdas (>3h = horario mal cargado) y respeta condonaciones. Si no (legacy),
  // suma las multas crudas de la lista de tardanzas.
  const descuentoTardanza = config.multaBsDia != null
    ? Math.max(0, config.multaBsDia)
    : tardanzasActivas.reduce((s, t) => s + (t.multa || 0), 0)
  const minutosTardeTotales = config.minTardeDia != null
    ? Math.max(0, config.minTardeDia)
    : tardanzasActivas.reduce((s, t) => s + (t.minutosTarde || 0), 0)

  // Descuento por no-registro (20 Bs × día incompleto), categoría separada, se ACUMULA.
  const descuentoNoRegistro = Math.max(0, config.descuentoNoRegistro || 0)
  const diasNoRegistro = config.diasNoRegistro || 0

  const bruto = baseTarifa + extraTarifa
  const totalAPagar = Math.max(0, bruto - descuentoTardanza - descuentoNoRegistro)

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
    descuentoNoRegistro,
    diasNoRegistro,
    minutosTardeTotales,
    totalAPagar: round(totalAPagar, 2),
    cantidadTardanzas: tardanzas.length,
    tardanzasCondonadas: tardanzas.length - tardanzasActivas.length,
  }
}

// Agrega planillas de todos los empleados de un local en una sola corrida.
// Mapas opcionales por persona (mismo patrón, todos retrocompatibles):
//   config.horasExtraPorPersona        { [personId]: horasExtra por día }
//   config.horasPagablesPorPersona     { [personId]: horas reales pagables (días incompletos → programado) }
//   config.descuentoNoRegistroPorPersona { [personId]: 20 × días incompletos }
//   config.diasNoRegistroPorPersona    { [personId]: cantidad de días incompletos }
//   config.multaBsPorPersona           { [personId]: multa Bs por tardanza (regla por día) }
//   config.minTardePorPersona          { [personId]: minutos tarde (regla por día) }
export function planillaLocal(empleados, fichajesPorPersona, tardanzasPorPersona, config = {}) {
  const extraPP = config.horasExtraPorPersona || null
  const pagablesPP = config.horasPagablesPorPersona || null
  const descNoRegPP = config.descuentoNoRegistroPorPersona || null
  const diasNoRegPP = config.diasNoRegistroPorPersona || null
  const multaPP = config.multaBsPorPersona || null
  const minTardePP = config.minTardePorPersona || null
  const filas = empleados.map(emp => {
    const cfg = { ...config }
    if (extraPP) cfg.horasExtraDia = extraPP[emp.id] ?? 0
    if (pagablesPP) cfg.horasPagablesDia = pagablesPP[emp.id] ?? 0
    if (descNoRegPP) cfg.descuentoNoRegistro = descNoRegPP[emp.id] ?? 0
    if (diasNoRegPP) cfg.diasNoRegistro = diasNoRegPP[emp.id] ?? 0
    if (multaPP) cfg.multaBsDia = multaPP[emp.id] ?? 0
    if (minTardePP) cfg.minTardeDia = minTardePP[emp.id] ?? 0
    return planillaEmpleado(emp, fichajesPorPersona[emp.id] || [], tardanzasPorPersona[emp.id] || [], cfg)
  })
  const totales = filas.reduce((acc, f) => ({
    horasNormales: acc.horasNormales + f.horasNormales,
    horasExtra: acc.horasExtra + f.horasExtra,
    bruto: acc.bruto + f.bruto,
    descuentoTardanza: acc.descuentoTardanza + f.descuentoTardanza,
    descuentoNoRegistro: acc.descuentoNoRegistro + f.descuentoNoRegistro,
    totalAPagar: acc.totalAPagar + f.totalAPagar,
  }), { horasNormales: 0, horasExtra: 0, bruto: 0, descuentoTardanza: 0, descuentoNoRegistro: 0, totalAPagar: 0 })

  return {
    filas,
    totales: {
      horasNormales: round(totales.horasNormales, 2),
      horasExtra: round(totales.horasExtra, 2),
      bruto: round(totales.bruto, 2),
      descuentoTardanza: round(totales.descuentoTardanza, 2),
      descuentoNoRegistro: round(totales.descuentoNoRegistro, 2),
      totalAPagar: round(totales.totalAPagar, 2),
    },
  }
}

function round(n, d = 2) {
  const f = Math.pow(10, d)
  return Math.round(n * f) / f
}
