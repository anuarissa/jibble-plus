// Template Excel de turnos: descargar/importar.
// Soporta DOS formatos:
//   1) Template simple: una fila por empleado, 7 columnas (Lun..Dom). Celda "08:00-16:00" o "OFF".
//   2) Formato planilla Anuar: 3 filas por empleado (ENTRADA/SALIDA/HORAS), días en cols E-K.
//      Detección automática.

import * as XLSX from 'xlsx-js-style'
import { textToTurno, DIAS_LABEL, isoWeekKey } from './turnos'

const HEADERS = ['Empleado', ...DIAS_LABEL]

// Genera y descarga un .xlsx limpio para administrar turnos en oficinas.
// Hoja 1 "TURNOS": empleados pre-poblados (vacíos para llenar).
// Hoja 2 "INSTRUCCIONES": cómo llenarlo paso a paso.
//   empleados: [{ id, fullName }]
//   turnos:    estado actual de turnos del store (no se usa — siempre vacío para llenar)
//   weekKey:   "2026-W17"
//   nombreLocal: para el nombre del archivo
export function descargarTemplateTurnos({ empleados, weekKey, nombreLocal }) {
  // === HOJA 1: TURNOS ===
  const turnos = [
    ['Empleado', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
    ['(EJEMPLO) Borra esta fila', '09:00-16:00', '09:00-16:00', 'OFF', '09:00-16:00', '09:00-16:00 + 18:00-23:00', '16:00-23:00', 'OFF'],
    [],
  ]
  if (empleados.length === 0) {
    turnos.push(['(Sin empleados activos en este local)', '', '', '', '', '', '', ''])
  } else {
    for (const emp of empleados) {
      turnos.push([emp.fullName, '', '', '', '', '', '', ''])
    }
  }
  turnos.push([])
  turnos.push(['(*) FORMATO ACEPTADO POR CELDA:'])
  turnos.push(['(*)   "09:00-16:00"   →  Entrada 9 AM, salida 4 PM'])
  turnos.push(['(*)   "16:00-23:00"   →  Entrada 4 PM, salida 11 PM'])
  turnos.push(['(*)   "09:00-16:00 + 18:00-23:00" →  Turno PARTIDO (mañana y tarde, con corte)'])
  turnos.push(['(*)   "OFF" o "LIBRE" →  Día libre'])
  turnos.push(['(*)   (celda vacía)   →  Mantiene el horario por defecto del empleado'])
  turnos.push([])
  turnos.push(['(*) IMPORTANTE:'])
  turnos.push(['(*)   1. No cambies los nombres — deben coincidir exactamente con el sistema.'])
  turnos.push([`(*)   2. Antes de importar, posicionate en la SEMANA ${weekKey} en la app.`])
  turnos.push(['(*)   3. Click en "Importar Excel" → seleccioná este archivo.'])
  turnos.push(['(*)   4. Revisá el preview y si todo está bien, apretá "Guardar todos".'])

  const wsTurnos = XLSX.utils.aoa_to_sheet(turnos)
  wsTurnos['!cols'] = [
    { wch: 30 },
    ...DIAS_LABEL.map(() => ({ wch: 14 })),
  ]
  wsTurnos['!rows'] = [{ hpt: 24 }]
  // Estilo del header (fila 0): naranja + blanco. El resto sin estilo (texto libre).
  const HDR = {
    fill: { patternType: 'solid', fgColor: { rgb: 'F97316' } },
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'C2410C' } },
      bottom: { style: 'medium', color: { rgb: 'C2410C' } },
      left: { style: 'thin', color: { rgb: 'C2410C' } },
      right: { style: 'thin', color: { rgb: 'C2410C' } },
    },
  }
  for (let c = 0; c < 8; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (wsTurnos[addr]) wsTurnos[addr].s = HDR
  }
  wsTurnos['!freeze'] = { xSplit: 0, ySplit: 1 }
  wsTurnos['!views'] = [{ state: 'frozen', ySplit: 1 }]

  // === HOJA 2: INSTRUCCIONES ===
  const instrucciones = [
    [`CÓMO LLENAR ESTE TEMPLATE — ${nombreLocal || 'Local'} · Semana ${weekKey}`],
    [],
    ['PASO 1 — Llenar los horarios'],
    ['  En la hoja "TURNOS" (a la izquierda), poné el horario de cada empleado por día.'],
    [],
    ['PASO 2 — Formatos válidos por celda'],
    ['  09:00-16:00       Horario normal (entrada-salida)'],
    ['  08:30-12:00       Cualquier rango con minutos'],
    ['  16:00-23:00       Turno de tarde / noche'],
    ['  09:00-16:00 + 18:00-23:00   Turno PARTIDO: dos tramos en el día separados por " + "'],
    ['                    (ej. trabaja mañana, corta unas horas y vuelve a la tarde/noche).'],
    ['                    La tardanza se mide en CADA tramo por separado.'],
    ['  OFF               Día libre'],
    ['  LIBRE             Día libre (alternativa)'],
    ['  (vacío)           No tocar — usa el horario por defecto del empleado'],
    [],
    ['PASO 3 — Importar a la app'],
    ['  1. Andá a la app de Jibble+'],
    [`  2. Entrá al local "${nombreLocal || ''}"`],
    ['  3. Pestaña "Turnos"'],
    [`  4. Asegurate de estar parado en la semana ${weekKey} (botones « » para navegar)`],
    ['  5. Click "Importar Excel" → elegí este archivo'],
    ['  6. Vas a ver un banner naranja "X cambios sin guardar" con preview'],
    ['  7. Si todo está bien, click "Guardar todos". Si no, "Descartar".'],
    [],
    ['REGLAS IMPORTANTES'],
    ['  - Los nombres de la columna "Empleado" deben coincidir EXACTAMENTE con los del sistema.'],
    ['  - Si agregás un nombre que no existe en el sistema, va a aparecer un aviso amarillo'],
    ['    "Empleados no encontrados" — los demás SE CARGAN igual.'],
    ['  - Si un nombre matchea con varios empleados (ej "FABIOLA" → Rojas y Nava),'],
    ['    no se aplica a ninguna. Escribí el nombre completo para diferenciarlos.'],
    [],
    ['DESCUENTOS POR TARDANZA'],
    ['  - Regla escalonada:'],
    ['      * 1 a 10 minutos tarde  →  10 Bs (fijo)'],
    ['      * 11 minutos o más      →  10 Bs + 20 Bs por cada bloque de 10 min iniciado'],
    ['        después de los primeros 10. Ejemplos: 11min=30Bs, 20min=30Bs,'],
    ['        21min=50Bs, 30min=50Bs, 31min=70Bs.'],
    ['  - Tolerancia: 0 minutos (1 minuto tarde ya cuenta).'],
    ['  - Para condonar una tardanza puntual, hacelo desde la pestaña "Tardanzas".'],
  ]
  const wsInstr = XLSX.utils.aoa_to_sheet(instrucciones)
  wsInstr['!cols'] = [{ wch: 80 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, wsTurnos, 'TURNOS')
  XLSX.utils.book_append_sheet(wb, wsInstr, 'INSTRUCCIONES')
  const safe = (nombreLocal || 'local').replace(/[^a-z0-9]+/gi, '_')
  XLSX.writeFile(wb, `turnos_${safe}_${weekKey}.xlsx`)
}

// Parser de archivo subido por el usuario.
// Devuelve { aplicar: { [personId]: { dow: valor } }, errores: [string], warnings: [string] }
//   - Match empleado por nombre exacto (case-insensitive, trim).
//   - Errores de formato por celda → warning, no rompen.
//   - Empleados no encontrados → warning con sus nombres.
export async function parseExcelTurnos(file, empleados) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error('El archivo no tiene hojas válidas.')

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (!rows.length) throw new Error('Hoja vacía.')
  return parseRowsSimple(rows, empleados)
}

function parseRowsSimple(rows, empleados) {
  // Primera fila: headers. La columna 0 debe ser "Empleado", luego 7 días.
  // Aceptamos variantes de mayúsculas.
  const header = rows[0].map(h => String(h).trim().toLowerCase())
  if (header[0] !== 'empleado' && header[0] !== 'employee' && header[0] !== 'nombre') {
    throw new Error('Primera columna debe ser "Empleado". Descarga el template para ver el formato.')
  }

  const empByNombre = new Map(
    empleados.map(e => [normalizar(e.fullName), e])
  )

  const aplicar = {}
  const warnings = []
  const errores = []
  const noEncontrados = new Set()
  const ambiguos = new Map() // nombreRaw → [empleados que matchean por primer nombre]
  let celdasOk = 0
  let celdasIgnoradas = 0

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || !row[0]) continue
    const nombreRaw = String(row[0]).trim()
    if (!nombreRaw || nombreRaw.startsWith('(')) continue // saltar líneas tipo "(Sin empleados...)"
    if (nombreRaw.toLowerCase().startsWith('formato')) continue // skip hint line

    // Usa matchEmpleado para tolerar nombres parciales (ej "Alondra" → "Alondra Sbarro")
    // y detectar ambigüedad cuando varios empleados comparten primer nombre.
    const emp = matchEmpleado(empByNombre, nombreRaw, ambiguos)
    if (!emp) {
      if (!ambiguos.has(nombreRaw)) noEncontrados.add(nombreRaw)
      continue
    }

    const personId = emp.id
    aplicar[personId] = aplicar[personId] || {}

    for (let c = 1; c <= 7; c++) {
      const raw = row[c]
      try {
        const valor = textToTurno(raw)
        if (valor === null) {
          // Celda vacía → setear null para limpiar el turno previo
          aplicar[personId][String(c)] = null
        } else {
          aplicar[personId][String(c)] = valor
          celdasOk++
        }
      } catch (e) {
        warnings.push(`${emp.fullName} · ${DIAS_LABEL[c - 1]}: ${e.message}`)
        celdasIgnoradas++
      }
    }
  }

  if (noEncontrados.size > 0) {
    warnings.push(`Empleados no encontrados (no se aplicaron): ${[...noEncontrados].join(', ')}`)
  }
  if (ambiguos.size > 0) {
    for (const [raw, matches] of ambiguos) {
      warnings.push(`"${raw}" en el Excel es ambiguo — matchea con ${matches.map(m => m.fullName).join(' y ')}. Escribí el nombre completo en el Excel para diferenciarlos.`)
    }
  }

  return { aplicar, warnings, errores, celdasOk, celdasIgnoradas, noEncontrados: [...noEncontrados] }
}

// Exportada como normalizarNombre para el mapa de alias (carpeta-horarios.js / UI).
export { normalizar as normalizarNombre }

function normalizar(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

// Distancia de Levenshtein acotada (para typos tipo "CRITIAN" → "cristian").
function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99
  const prev = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      diag = tmp
    }
  }
  return prev[b.length]
}

// =====================================================================
// PARSER FORMATO PLANILLA ANUAR (3 filas por empleado: ENTRADA/SALIDA/HORAS)
// =====================================================================

// Punto de entrada principal: detecta automáticamente qué formato es
// y devuelve siempre el shape unificado:
//   { aplicarPorSemana: { weekKey: { personId: { dow: valor } } },
//     warnings, celdasOk, celdasIgnoradas, formato: 'simple'|'anuar' }
export async function parseExcelTurnosAuto(file, empleados, weekKeyActualSiUnoSolo, opts = {}) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  return parseWorkbookTurnos(wb, empleados, { weekKeyFallback: weekKeyActualSiUnoSolo, ...opts })
}

// Parsea un workbook ya leído. Lo usan el import manual (parseExcelTurnosAuto)
// y la sincronización de carpeta OneDrive (carpeta-horarios.js).
// opts:
//   weekKeyFallback: semana a usar si el archivo es formato simple (sin fechas)
//   aliases: { [nombreNormalizado]: personId | 'IGNORAR' } — resoluciones manuales persistidas
export function parseWorkbookTurnos(wb, empleados, opts = {}) {
  // Leer todas las hojas una vez y clasificarlas.
  const hojas = []
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    if (!ws) continue
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    if (!rows.length) continue
    // Los índices de `rows` están corridos si el rango de la hoja no empieza en
    // A1 (pasa en los cuadernos reales) — el offset permite mapear los merges
    // (coordenadas absolutas de la hoja) a índices de `rows`.
    const rango = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { s: { r: 0, c: 0 } }
    hojas.push({
      name,
      rows,
      merges: ws['!merges'] || null,
      offsetHoja: { r: rango.s.r, c: rango.s.c },
      esAnuar: detectarFormatoAnuar(rows),
      esHorario: normalizar(name).includes('horario'),
    })
  }
  if (!hojas.length) throw new Error('El archivo no tiene hojas válidas.')

  // Preferir hojas llamadas "Horario(s)" con formato planilla; si no, cualquier hoja con ese formato.
  // (En las planillas reales la hoja "Horarios" NO es la primera del archivo.)
  let candidatas = hojas.filter(h => h.esHorario && h.esAnuar)
  if (!candidatas.length) candidatas = hojas.filter(h => h.esAnuar)

  if (candidatas.length) {
    const total = {
      aplicarPorSemana: {}, warnings: [], celdasOk: 0, celdasIgnoradas: 0,
      formato: 'anuar', semanasDetectadas: [], noEncontrados: [], ambiguos: [],
    }
    for (const h of candidatas) {
      const r = parseFormatoAnuar(h.rows, empleados, { ...opts, merges: h.merges, offsetHoja: h.offsetHoja })
      for (const [wk, porPersona] of Object.entries(r.aplicarPorSemana)) {
        if (!total.aplicarPorSemana[wk]) total.aplicarPorSemana[wk] = {}
        for (const [pid, dias] of Object.entries(porPersona)) {
          total.aplicarPorSemana[wk][pid] = { ...total.aplicarPorSemana[wk][pid], ...dias }
        }
      }
      total.warnings.push(...r.warnings)
      total.celdasOk += r.celdasOk
      total.celdasIgnoradas += r.celdasIgnoradas
      for (const wk of r.semanasDetectadas) if (!total.semanasDetectadas.includes(wk)) total.semanasDetectadas.push(wk)
      for (const n of r.noEncontrados) if (!total.noEncontrados.includes(n)) total.noEncontrados.push(n)
      for (const a of r.ambiguos) if (!total.ambiguos.some(x => x.nombre === a.nombre)) total.ambiguos.push(a)
    }
    return total
  }

  // Formato simple (template de la app): primera hoja, sin fechas → weekKeyFallback
  const result = parseRowsSimple(hojas[0].rows, empleados)
  const weekKey = opts.weekKeyFallback || isoWeekKey(new Date())
  return {
    aplicarPorSemana: { [weekKey]: result.aplicar },
    warnings: result.warnings,
    celdasOk: result.celdasOk,
    celdasIgnoradas: result.celdasIgnoradas,
    formato: 'simple',
    semanasDetectadas: [weekKey],
    noEncontrados: result.noEncontrados,
    ambiguos: [],
  }
}

function detectarFormatoAnuar(rows) {
  // Buscar al menos una fila con "ENTRADA" en col 3 (D) y otra con "SALIDA" justo después
  for (let i = 0; i < rows.length - 1; i++) {
    const c1 = String(rows[i]?.[3] || '').trim().toUpperCase()
    const c2 = String(rows[i + 1]?.[3] || '').trim().toUpperCase()
    if (c1 === 'ENTRADA' && c2 === 'SALIDA') return true
  }
  return false
}

function parseFormatoAnuar(rows, empleados, opts = {}) {
  const aliases = opts.aliases || {}
  const empByNombre = construirIndiceNombres(empleados)
  const aplicarPorSemana = {} // { weekKey: { personId: { dow: valor } } }
  const warnings = []
  const noEncontrados = new Set()
  const ambiguos = new Map() // nombreRaw → [empleados que matchean]
  const ambiguosRecientes = new Set() // solo estos generan warning (los viejos solo van al panel)
  let celdasOk = 0
  let celdasIgnoradas = 0
  const semanasDetectadas = new Set()

  // Lectura consciente de celdas combinadas: si la celda cae dentro de un merge,
  // vale lo que dice la celda ANCLA — no el texto oculto que pueda haber debajo
  // (caso real: "Daniela Wolf" enterrado en las filas SALIDA/HORAS del bloque del
  // gerente; sin esto, borrar el nombre del ancla se lo regalaría a otra persona).
  const merges = opts.merges || null
  const off = opts.offsetHoja || { r: 0, c: 0 }
  const celdaConMerge = (fila, col) => {
    if (merges) {
      const r = fila + off.r
      const c = col + off.c
      const m = merges.find(mm => mm.s.c <= c && c <= mm.e.c && mm.s.r <= r && r <= mm.e.r)
      if (m) return String(rows[m.s.r - off.r]?.[m.s.c - off.c] ?? '').trim()
    }
    return String(rows[fila]?.[col] ?? '').trim()
  }
  const nombreEnFila = fila => celdaConMerge(fila, 1)
  const areaEnFila = fila => celdaConMerge(fila, 0)

  // Buscar bloques: cada uno empieza con una fila que tenga "NOMBRE Y APELLIDO" en col A
  for (let i = 0; i < rows.length; i++) {
    const headerRow = rows[i]
    if (!headerRow) continue
    const c0 = String(headerRow[0] || '').trim().toUpperCase()
    if (!c0.startsWith('NOMBRE')) continue

    // Detectar orden de días: buscar 1-3 filas atrás una fila con LUNES/MARTES/etc en cols 4-10
    let dowOrder = null
    for (let back = 1; back <= 4; back++) {
      const r = rows[i - back]
      if (!r) continue
      const dows = r.slice(4, 11).map(parseDow)
      if (dows.filter(d => d != null).length >= 5) {
        dowOrder = dows
        break
      }
    }
    if (!dowOrder) dowOrder = [1, 2, 3, 4, 5, 6, 7] // fallback Lun-Dom

    // weekKey: usar primera fecha en la fila header (cols 4-10)
    const fechas = headerRow.slice(4, 11)
    let weekKey = null
    for (const f of fechas) {
      const d = parseFechaCorta(f)
      if (d) { weekKey = isoWeekKey(d); break }
    }
    if (!weekKey) {
      // Sin fecha no sabemos a qué semana pertenece el bloque — saltarlo es más
      // seguro que adivinar la semana actual.
      warnings.push(`Bloque de horarios sin fechas (fila ${i + 1}) — omitido.`)
      continue
    }
    semanasDetectadas.add(weekKey)
    if (!aplicarPorSemana[weekKey]) aplicarPorSemana[weekKey] = {}

    // Semanas viejas (< opts.desdeSemana): los turnos se aplican igual (sirven para
    // reportes históricos), pero NO generan ruido de nombres no encontrados ni
    // warnings de celdas — hay mucha rotación y esos nombres ya no existen.
    // weekKeys zero-padded → comparación lexicográfica válida.
    const esReciente = !opts.desdeSemana || weekKey >= opts.desdeSemana

    // Iterar empleados
    let j = i + 1
    let safety = 0
    // Nombre del último bloque leído: lo hereda el bloque PM cuando la celda del
    // nombre está combinada (merge vertical) y solo trae texto en la fila de arriba.
    let ultimoNombreBloque = ''
    // Área (col A: CAJEROS/PIZZERIA/COCINA…) del bloque, heredada igual que el
    // nombre. Sirve para avisar si el MISMO empleado aparece en DOS puestos
    // distintos la misma semana (ej. JHON en COCINA y en MESERO): puede ser un
    // doble turno real o dos personas distintas con el mismo nombre.
    let ultimaArea = ''
    const areaPorEmpleado = new Map() // emp.id → área del primer bloque de esta semana
    while (j < rows.length && safety++ < 200) {
      const r = rows[j]
      if (!r) { j++; continue }
      const colA = String(r[0] || '').trim().toUpperCase()
      const colD = String(r[3] || '').trim().toUpperCase()

      // Romper si entramos a otro bloque
      if (colA.startsWith('NOMBRE') || colA.includes('SBARRO') || colA.includes('TUESDAY') || colA.includes('SOS') || colA.includes('OFICINAS')) break
      const colE = String(r[4] || '').trim().toUpperCase()
      if (colE.includes('SBARRO') || colE.includes('TUESDAY') || colE.includes('SOS')) break

      if (colD === 'ENTRADA') {
        const filaSalida = rows[j + 1]
        if (!filaSalida || String(filaSalida[3] || '').trim().toUpperCase() !== 'SALIDA') {
          j++; continue
        }
        // El nombre puede estar en la fila ENTRADA o en la fila SALIDA (algunos
        // archivos lo "centran verticalmente" escribiéndolo en la fila de abajo).
        // Ambas lecturas respetan el ancla del merge si la celda está combinada.
        let nombreRaw = nombreEnFila(j)
        if (!nombreRaw) nombreRaw = nombreEnFila(j + 1)
        // CELDA COMBINADA sin info de merges (fallback): cuando una persona tiene
        // bloque AM y PM, el nombre suele estar solo en la primera fila del merge
        // (ej. B40:B45). Sin esto el bloque PM se descartaba entero.
        if (!nombreRaw) nombreRaw = ultimoNombreBloque
        if (!nombreRaw) { j += 3; continue }
        ultimoNombreBloque = nombreRaw
        const areaBloque = areaEnFila(j) || ultimaArea
        if (areaBloque) ultimaArea = areaBloque

        // Alias resueltos a mano tienen prioridad sobre el matching automático.
        const alias = aliases[normalizar(nombreRaw)]
        if (alias === 'IGNORAR') { j += 3; continue }
        let emp = alias ? empleados.find(e => e.id === alias) : null
        // Ambiguos: se registran SIEMPRE (también en semanas viejas — antes se
        // perdían en silencio) para que la UI ofrezca elegir al correcto; el
        // warning de texto sí se limita a semanas recientes.
        if (!emp) emp = matchEmpleado(empByNombre, nombreRaw, ambiguos)
        if (!emp) {
          if (ambiguos.has(nombreRaw)) {
            if (esReciente) ambiguosRecientes.add(nombreRaw)
          } else if (esReciente) {
            noEncontrados.add(nombreRaw)
          }
          j += 3
          continue
        }
        if (!aplicarPorSemana[weekKey][emp.id]) aplicarPorSemana[weekKey][emp.id] = {}

        // Mismo empleado en dos puestos distintos la misma semana → avisar (los
        // tramos se fusionan igual: puede ser un doble turno legítimo).
        const areaPrev = areaPorEmpleado.get(emp.id)
        if (areaPrev === undefined) {
          areaPorEmpleado.set(emp.id, areaBloque)
        } else if (esReciente && areaBloque && areaPrev && areaBloque !== areaPrev) {
          const aviso = `"${nombreRaw}" (${weekKey}) aparece en dos puestos del cuaderno: ${areaPrev} y ${areaBloque}. Se sumaron como turno doble de la misma persona — si son dos personas distintas, diferencia los nombres en el cuaderno.`
          if (!warnings.includes(aviso)) warnings.push(aviso)
        }

        // Parsear los 7 días
        for (let c = 0; c < 7; c++) {
          const dow = dowOrder[c]
          if (dow == null) continue
          const eRaw = r[4 + c]
          const sRaw = filaSalida[4 + c]
          try {
            const valor = parseEntradaSalida(eRaw, sRaw)
            if (valor === 'IGNORAR') {
              celdasIgnoradas++
            } else if (valor) {
              // El mismo empleado puede aparecer en 2 bloques la misma semana
              // (ej. "EXTRA" dos veces) = turno partido → fusionar tramos.
              const prev = aplicarPorSemana[weekKey][emp.id][String(dow)]
              const { merged, error } = fusionarTurnos(prev, valor)
              if (error) {
                if (esReciente) warnings.push(`${nombreRaw} · ${DIAS_LABEL[dow - 1]}: ${error}`)
                celdasIgnoradas++
              } else {
                aplicarPorSemana[weekKey][emp.id][String(dow)] = merged
                celdasOk++
              }
            }
          } catch (e) {
            if (esReciente) warnings.push(`${nombreRaw} · ${DIAS_LABEL[dow - 1]}: ${e.message}`)
            celdasIgnoradas++
          }
        }
        j += 3
      } else {
        // Fila con NOMBRE pero sin ENTRADA/SALIDA en la columna D: el bloque no
        // se puede leer (le falta la estructura). Antes se ignoraba en silencio
        // y la persona desaparecía sin aparecer siquiera en "nombres sin
        // resolver" (caso real: el bloque BUFFET del cuaderno de América).
        const posibleNombre = String(r[1] || '').trim()
        if (esReciente && posibleNombre && posibleNombre.length > 2 && !colD && !/^\d+$/.test(posibleNombre)) {
          const aviso = `"${posibleNombre}": su fila no tiene ENTRADA/SALIDA en el cuaderno — no se pudo leer su horario`
          if (!warnings.includes(aviso)) warnings.push(aviso)
        }
        j++
      }
    }
    i = Math.max(i, j - 1) // continuar después del bloque
  }

  if (noEncontrados.size > 0) {
    warnings.push(`Empleados no encontrados en la app: ${[...noEncontrados].join(', ')}`)
  }
  for (const raw of ambiguosRecientes) {
    const matches = ambiguos.get(raw) || []
    warnings.push(`"${raw}" en el Excel es ambiguo — matchea con ${matches.map(m => m.fullName).join(' y ')}. Elegí al correcto en el panel de nombres (o escribe el nombre completo en el cuaderno).`)
  }
  if (semanasDetectadas.size > 1) {
    warnings.push(`Detectadas ${semanasDetectadas.size} semanas distintas en el archivo: ${[...semanasDetectadas].join(', ')}`)
  }

  return {
    aplicarPorSemana, warnings, celdasOk, celdasIgnoradas, formato: 'anuar',
    semanasDetectadas: [...semanasDetectadas], noEncontrados: [...noEncontrados],
    // Nombres que matchean a VARIOS empleados: la UI ofrece elegir al correcto.
    ambiguos: [...ambiguos].map(([nombre, candidatos]) => ({
      nombre,
      candidatos: candidatos.map(c => ({ id: c.id, fullName: c.fullName })),
    })),
  }
}

// Fusiona dos turnos del mismo día (empleado repetido en la planilla = turno partido).
// Devuelve { merged } o { merged: prev, error } si los tramos se solapan.
function fusionarTurnos(prev, nuevo) {
  if (!prev) return { merged: nuevo }
  if (prev?.tipo === 'OFF') return { merged: nuevo }
  if (nuevo?.tipo === 'OFF') return { merged: prev }
  const aMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const tramos = [
    ...(prev.segments || [{ startTime: prev.startTime, endTime: prev.endTime }]),
    ...(nuevo.segments || [{ startTime: nuevo.startTime, endTime: nuevo.endTime }]),
  ].sort((x, y) => aMin(x.startTime) - aMin(y.startTime))
  for (let k = 1; k < tramos.length; k++) {
    if (aMin(tramos[k].startTime) < aMin(tramos[k - 1].endTime)) {
      return { merged: prev, error: `tramos solapados (${tramos[k - 1].startTime}-${tramos[k - 1].endTime} y ${tramos[k].startTime}-${tramos[k].endTime})` }
    }
  }
  return {
    merged: {
      startTime: tramos[0].startTime,
      endTime: tramos[tramos.length - 1].endTime,
      segments: tramos,
    },
  }
}

// Match flexible: nombre exacto > primer nombre exacto > substring
// ambiguousOut (Map opcional): si el nombre matchea a varios empleados (por
// primer nombre, o porque DOS empleados se llaman exactamente igual — caso real:
// dos NICOLAS en el aparato de SOS), se registra ahí y matchEmpleado devuelve
// null para no aplicar al equivocado. El caller usa el map para el panel/warning.
export function matchEmpleado(empByNombre, raw, ambiguousOut = null) {
  const norm = normalizar(raw)
  // Una entrada del índice puede ser un ARRAY (varios empleados con el mismo
  // nombre normalizado) — eso nunca se resuelve solo.
  const resolver = v => {
    if (!Array.isArray(v)) return v
    if (ambiguousOut) ambiguousOut.set(raw, v)
    return null
  }
  if (empByNombre.has(norm)) return resolver(empByNombre.get(norm))
  const firstWord = norm.split(' ')[0]
  // Match exacto por primer nombre — pero si hay varios, es ambiguo
  const matches = []
  for (const [k, v] of empByNombre) {
    if (k.split(' ')[0] === firstWord) matches.push(...(Array.isArray(v) ? v : [v]))
  }
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) {
    if (ambiguousOut) ambiguousOut.set(raw, matches)
    return null
  }
  // Substring (cuidado: solo si el Excel name es >= 4 chars)
  if (norm.length >= 4) {
    for (const [k, v] of empByNombre) {
      if (k.includes(norm) || norm.includes(k.split(' ')[0])) return resolver(v)
    }
  }
  // Typos: Levenshtein <= 2 sobre el primer nombre (ej "critian" → "cristian").
  // Solo si el match es ÚNICO — si empata con varios, es ambiguo.
  if (firstWord.length >= 4) {
    const fuzzy = []
    for (const [k, v] of empByNombre) {
      if (levenshtein(firstWord, k.split(' ')[0]) <= 2) fuzzy.push(...(Array.isArray(v) ? v : [v]))
    }
    if (fuzzy.length === 1) return fuzzy[0]
    if (fuzzy.length > 1) {
      if (ambiguousOut) ambiguousOut.set(raw, fuzzy)
      return null
    }
  }
  return null
}

export function construirIndiceNombres(empleados) {
  // Nombres normalizados repetidos (dos empleados que se llaman igual) se
  // acumulan en un array: antes el segundo PISABA al primero y el matcher
  // asignaba en silencio al que sobrevivía — turnos del NICOLAS equivocado.
  const m = new Map()
  for (const e of empleados) {
    const k = normalizar(e.fullName)
    if (!m.has(k)) m.set(k, e)
    else m.set(k, [...(Array.isArray(m.get(k)) ? m.get(k) : [m.get(k)]), e])
  }
  return m
}

function parseDow(raw) {
  const s = String(raw).trim().toUpperCase()
  if (!s) return null
  if (s.startsWith('LUN') || s === 'L') return 1
  if (s.startsWith('MAR') || s === 'M') return 2
  if (s.startsWith('MIÉ') || s.startsWith('MIE') || s === 'MI' || s === 'X') return 3
  if (s.startsWith('JUE') || s === 'J') return 4
  if (s.startsWith('VIE') || s === 'V') return 5
  if (s.startsWith('SÁB') || s.startsWith('SAB') || s === 'S') return 6
  if (s.startsWith('DOM') || s === 'D') return 7
  return null
}

const MESES = { ene:0, feb:1, mar:2, abr:3, may:4, jun:5, jul:6, ago:7, sep:8, oct:9, nov:10, dic:11, jan:0, apr:3, aug:7, dec:11 }
function parseFechaCorta(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number') {
    // Excel serial date. Construir la fecha en hora LOCAL: si se devuelve la
    // medianoche UTC, en Bolivia (UTC-4) cae al día anterior y corre la semana ISO.
    const epoch = new Date(Date.UTC(1899, 11, 30))
    const d = new Date(epoch.getTime() + raw * 86400000)
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  }
  const s = String(raw).trim()
  // Formato "2-Mar", "14-Feb"
  const m = s.match(/^(\d{1,2})[-\/]([A-Za-záéíóúñ]+)/)
  if (!m) return null
  const dia = parseInt(m[1])
  const mesStr = m[2].toLowerCase().slice(0, 3)
  const mes = MESES[mesStr]
  if (mes == null) return null
  return new Date(new Date().getFullYear(), mes, dia)
}

function parseEntradaSalida(entradaRaw, salidaRaw) {
  const e = normalizarHora(entradaRaw)
  const s = normalizarHora(salidaRaw)
  // "LIBRE" en cualquiera → día libre (OFF)
  if (e === 'LIBRE' || s === 'LIBRE') return { tipo: 'OFF' }
  // Ambos vacíos → no setear (usa default)
  if (!e && !s) return null
  // Texto largo no-hora (ej "APOYO HORAS CLAVES Y CAJERO NUEVO") → ignorar
  if (e === 'TEXTO' || s === 'TEXTO') return null
  // ENTRADA 00:00 = fila de relleno (ej. bloque GERENTE en la planilla real) → ignorar el día
  if (parseHora(e) === '00:00') return 'IGNORAR'
  if (!e || !s) throw new Error(`Falta ${!e ? 'entrada' : 'salida'}`)

  const eH = parseHora(e)
  const sH = parseHora(s)
  if (!eH || !sH) throw new Error(`Hora no reconocida: "${entradaRaw}" / "${salidaRaw}"`)
  const [eh, em] = eH.split(':').map(Number)
  const [sh, sm] = sH.split(':').map(Number)
  if (sh * 60 + sm <= eh * 60 + em) throw new Error(`Salida (${sH}) debe ser después que entrada (${eH})`)
  return { startTime: eH, endTime: sH }
}

// Normaliza un raw value (puede ser número decimal Excel-time, string "9:30", "LIBRE", etc).
// Devuelve: 'LIBRE' | 'TEXTO' (ignorable) | "HH:MM" (ya parseado) | "" (vacío)
function normalizarHora(raw) {
  if (raw == null || raw === '') return ''
  // Número Excel: fracción de día (0.5 = 12:00, 0.375 = 9:00)
  if (typeof raw === 'number') {
    return excelTimeToHHMM(raw) || ''
  }
  const s = String(raw).trim().toUpperCase()
  if (!s) return ''
  if (s === 'LIBRE' || s === 'OFF') return 'LIBRE'
  // Si tiene ":" intentar como HH:MM
  if (s.includes(':')) return s
  // Decimal en string ("0.375")
  const num = parseFloat(s.replace(',', '.'))
  if (!isNaN(num) && num >= 0 && num < 1) {
    return excelTimeToHHMM(num) || ''
  }
  // Texto largo no parseable
  if (s.length > 6 && !/\d/.test(s)) return 'TEXTO'
  return s // último intento, parseHora lo evaluará
}

function excelTimeToHHMM(n) {
  if (n < 0 || n > 1) return null
  // 1 = medianoche (24:00) en las planillas: cierre del turno de noche. Se mapea
  // a 23:59 porque parseHora rechaza 24:00 y una salida "00:00" se leería como
  // salida ANTES de la entrada. Antes devolvía null → "Falta salida" y el día
  // se perdía (pasaba con los viernes/sábados de varios turnos PM).
  if (n === 1) return '23:59'
  const totalMin = Math.round(n * 24 * 60)
  const h = Math.floor(totalMin / 60)
  const min = totalMin % 60
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function parseHora(s) {
  if (!s) return null
  const str = String(s).trim()
  // Formato HH:MM — se acepta también "23.00" / "23,00" (los gerentes a veces
  // escriben la hora con punto y Excel la guarda como texto; sin esto el turno
  // se perdía con "Hora no reconocida"). Las fracciones de día (0.66) ya se
  // convirtieron antes en normalizarHora, así que acá no hay ambigüedad.
  const m = str.match(/^(\d{1,2})[:.,](\d{2})$/)
  if (m) {
    const h = parseInt(m[1])
    const min = parseInt(m[2])
    if (h > 23 || min > 59) return null
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }
  return null
}
