// Arma el "seed" del mes leyendo las carpetas reales del disco — lo que la web
// cargaría con "Conectar carpeta", pero hecho por script (autorizado por Anuar).
// No ejecutar directo: node scripts/cargar-navegador.mjs 2026-07

import path from 'node:path'
import dotenv from 'dotenv'
import { makeJibbleClient } from '../backend/jibble-client.js'
import {
  turnosDeCarpeta, bioDeCarpeta, ALIAS_GERENTE_TUESDAY, TUESDAY_SIN_BIOMETRICO,
} from './reporte-mensual-core.mjs'
import { personasSinteticas } from '../frontend/src/utils/biometrico'
import { isoWeekKey } from '../frontend/src/utils/turnos'
import { GROUP_IDS, resolveGroupId, esPersonaDummy, EMPLOYEE_OVERRIDES } from '../frontend/src/config/employees'

const CARPETA_SUELDOS_TUESDAY = 'C:/Users/anuar/OneDrive/Anuar/Tuesday/SUELDOS/SUELDOS 2026'
const CARPETA_CUADERNOS_TUESDAY = 'C:/Users/anuar/OneDrive/TUESDAY AMERICA/CUADERNOS DE GERENTES/CUADERNOS GERENTES'
const CARPETA_HORARIOS_SOS = 'C:/Users/anuar/OneDrive/SOS POLLO PRADO/CUADERNOS DE GERENTES/CUADERNOS GERENTES/CUADERNOS GERENTES 2026'
const CARPETA_BIO_SOS = 'C:/Users/anuar/OneDrive/SOS POLLO PRADO/CUADERNOS DE GERENTES/CUADERNOS GERENTES/BIOMETRICO'
const CARPETA_HORARIOS_HUPER = 'C:/Users/anuar/OneDrive/SBARRO HUPERMALL/1- CUADERNOS/5- CUADERNOS DE GERENTES/2026 CUADERNO GERENTES'
const CARPETA_HORARIOS_AMERICA = 'C:/Users/anuar/OneDrive/SBARRO AMERICA/CUADERNOS DE GERENTES SA/PLANILLA SUPERVISORES SA/2026/HORARIOS 2026'
const CARPETA_BIO_AMERICA = 'C:/Users/anuar/OneDrive/Anuar/SBARRO Cochabamba/FORMATOS CBBA/PAGOS SUELDOS DESDE 2017/PAGOS SUELDOS 2026'

// → { bioStore: { [groupId]: { [mes]: {marcas, personas, ts, archivo} } }, turnos: { [wk]: { [pid]: {...} } }, resumen: [...] }
export async function armarSeed(mesStr, raiz) {
  const [anio, mesNum] = mesStr.split('-').map(Number)
  const ini = new Date(anio, mesNum - 1, 1)
  const bioStore = {}
  const turnos = {}
  const resumen = []
  const mergeTurnos = (aplicarPorSemana) => {
    for (const [wk, porPersona] of Object.entries(aplicarPorSemana || {})) {
      if (!turnos[wk]) turnos[wk] = {}
      for (const [pid, dias] of Object.entries(porPersona)) turnos[wk][pid] = { ...(turnos[wk][pid] || {}), ...dias }
    }
  }

  // ===== TUESDAY: biométrico + horarios del cuaderno =====
  const bioTue = bioDeCarpeta(CARPETA_SUELDOS_TUESDAY, mesStr)
  if (bioTue) {
    bioStore[GROUP_IDS.TUESDAY] = { [mesStr]: { marcas: bioTue.marcas, personas: bioTue.personas, ts: Date.now(), archivo: bioTue.archivo } }
    const empTue = personasSinteticas(GROUP_IDS.TUESDAY, bioTue.personas)
    const porBio = Object.fromEntries(empTue.map(e => [e.idBio, e.id]))
    const aliases = {}
    for (const [nom, idBio] of Object.entries(ALIAS_GERENTE_TUESDAY)) if (porBio[idBio]) aliases[nom] = porBio[idBio]
    for (const nom of TUESDAY_SIN_BIOMETRICO) aliases[nom] = 'IGNORAR'
    const t = turnosDeCarpeta(CARPETA_CUADERNOS_TUESDAY, empTue, GROUP_IDS.TUESDAY, isoWeekKey(ini), aliases)
    mergeTurnos(t.aplicarPorSemana)
    resumen.push(`TUESDAY: bio ${bioTue.archivo} (${bioTue.personas.length} personas) · turnos ${Object.keys(t.aplicarPorSemana).length} semanas de ${t.archivos.length} cuadernos`)
  } else {
    resumen.push(`TUESDAY: SIN export biométrico de ${mesStr} en ${CARPETA_SUELDOS_TUESDAY}`)
  }

  // ===== SOS POLLO: biométrico + horarios (solo-biométrico, como Tuesday) =====
  const bioSos = bioDeCarpeta(CARPETA_BIO_SOS, mesStr)
  if (bioSos) {
    bioStore[GROUP_IDS.SOS_POLLO] = { [mesStr]: { marcas: bioSos.marcas, personas: bioSos.personas, ts: Date.now(), archivo: bioSos.archivo } }
    // personasSinteticas ya aplica RENOMBRES_APARATO (config/employees.js): así
    // "BERNARDO/DESPACHO" del cuaderno cae en Nicolas Bernardo y los dos
    // "NICOLAS" del aparato dejan de confundirse entre sí.
    const empSos = personasSinteticas(GROUP_IDS.SOS_POLLO, bioSos.personas)
    const tS = turnosDeCarpeta(CARPETA_HORARIOS_SOS, empSos, GROUP_IDS.SOS_POLLO, isoWeekKey(ini))
    mergeTurnos(tS.aplicarPorSemana)
    resumen.push(`SOS POLLO: bio ${bioSos.archivo} (${bioSos.personas.length} personas) · turnos ${Object.keys(tS.aplicarPorSemana).length} semanas de ${tS.archivos.length} cuadernos`)
    if (tS.noEncontrados.length) resumen.push(`SOS POLLO: nombres del cuaderno sin resolver: ${tS.noEncontrados.join(', ')}`)
  } else {
    resumen.push(`SOS POLLO: SIN export biométrico de ${mesStr} en ${CARPETA_BIO_SOS} — se omite (su gente sale del aparato)`)
  }

  // ===== SBARRO HUPER: biométrico (DATOS LOCALES) + horarios (su carpeta OneDrive) =====
  const bioHup = bioDeCarpeta(path.join(raiz, 'DATOS LOCALES', 'SBARRO HUPER', 'BIOMETRICO'), mesStr)
  if (bioHup) {
    bioStore[GROUP_IDS.SBARRO_HUPER] = { [mesStr]: { marcas: bioHup.marcas, personas: bioHup.personas, ts: Date.now(), archivo: bioHup.archivo } }
    resumen.push(`SBARRO HUPER: bio ${bioHup.archivo} (${bioHup.personas.length} personas)`)
  } else {
    resumen.push(`SBARRO HUPER: SIN export biométrico de ${mesStr} en DATOS LOCALES/SBARRO HUPER/BIOMETRICO`)
  }
  // Horarios de Huper con su gente real de Jibble (cuenta B) — así la fuente
  // Biométrico calcula retrasos aunque la carpeta no esté conectada en la web.
  dotenv.config({ path: path.join(raiz, 'backend', '.env') })
  const id2 = process.env.JIBBLE_API_KEY_ID_2?.trim(), sec2 = process.env.JIBBLE_API_KEY_SECRET_2?.trim()
  if (id2 && sec2) {
    try {
      const client = makeJibbleClient(id2, sec2)
      const peopleRaw = await client.getPeople()
      const empHup = peopleRaw
        .filter(p => !esPersonaDummy(p.fullName))
        .filter(p => EMPLOYEE_OVERRIDES[p.id]?.skip !== true)
        .map(p => ({ ...p, groupId: resolveGroupId(p.id, p.groupId, {}, 'B') }))
        .filter(p => p.groupId === GROUP_IDS.SBARRO_HUPER)
      const tH = turnosDeCarpeta(CARPETA_HORARIOS_HUPER, empHup, GROUP_IDS.SBARRO_HUPER, isoWeekKey(ini))
      mergeTurnos(tH.aplicarPorSemana)
      resumen.push(`SBARRO HUPER: turnos ${Object.keys(tH.aplicarPorSemana).length} semanas de ${tH.archivos.length} planillas`)
    } catch (e) {
      resumen.push(`SBARRO HUPER: no se pudieron leer turnos (${e.message})`)
    }
  } else {
    resumen.push('SBARRO HUPER: sin credenciales _2 en backend/.env — turnos no incluidos')
  }

  // ===== SBARRO AMÉRICA: biométrico (carpeta de sueldos por mes) + horarios =====
  const bioAme = bioDeCarpeta(CARPETA_BIO_AMERICA, mesStr)
  if (bioAme) {
    bioStore[GROUP_IDS.SBARRO_AMERICA] = { [mesStr]: { marcas: bioAme.marcas, personas: bioAme.personas, ts: Date.now(), archivo: bioAme.archivo } }
    resumen.push(`SBARRO AMERICA: bio ${bioAme.archivo} (${bioAme.personas.length} personas)`)
  } else {
    resumen.push(`SBARRO AMERICA: SIN export biométrico de ${mesStr} en ${CARPETA_BIO_AMERICA}`)
  }
  // Horarios con la gente real de la cuenta A (sin grupo → América salvo Oficinas)
  const idA = process.env.JIBBLE_API_KEY_ID?.trim(), secA = process.env.JIBBLE_API_KEY_SECRET?.trim()
  if (idA && secA) {
    try {
      const clientA = makeJibbleClient(idA, secA)
      const peopleA = await clientA.getPeople()
      const empAme = peopleA
        .filter(p => !esPersonaDummy(p.fullName))
        .filter(p => EMPLOYEE_OVERRIDES[p.id]?.skip !== true)
        .map(p => ({ ...p, groupId: resolveGroupId(p.id, p.groupId, {}, 'A', p.fullName) }))
        .filter(p => p.groupId === GROUP_IDS.SBARRO_AMERICA)
      const tA = turnosDeCarpeta(CARPETA_HORARIOS_AMERICA, empAme, GROUP_IDS.SBARRO_AMERICA, isoWeekKey(ini))
      mergeTurnos(tA.aplicarPorSemana)
      resumen.push(`SBARRO AMERICA: turnos ${Object.keys(tA.aplicarPorSemana).length} semanas de ${tA.archivos.length} planillas · ${empAme.length} empleados`)
      if (tA.noEncontrados.length) resumen.push(`SBARRO AMERICA: nombres del Excel sin resolver: ${tA.noEncontrados.join(', ')}`)
    } catch (e) {
      resumen.push(`SBARRO AMERICA: no se pudieron leer turnos (${e.message})`)
    }
  } else {
    resumen.push('SBARRO AMERICA: sin credenciales de la cuenta A en backend/.env — turnos no incluidos')
  }

  return { bioStore, turnos, resumen }
}
