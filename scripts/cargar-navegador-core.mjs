// Arma el "seed" del mes leyendo las carpetas reales del disco — lo que la web
// cargaría con "Conectar carpeta", pero hecho por script (autorizado por Anuar).
// No ejecutar directo: node scripts/cargar-navegador.mjs 2026-07

import path from 'node:path'
import dotenv from 'dotenv'
import { makeJibbleClient } from '../backend/jibble-client.js'
import { turnosDeCarpeta, bioDeCarpeta } from './reporte-mensual-core.mjs'
import { personasSinteticas, sinteticosPorAlias } from '../frontend/src/utils/biometrico'
import { isoWeekKey } from '../frontend/src/utils/turnos'
import { CARPETAS } from './carpetas.mjs'
import { GROUP_IDS, resolveGroupId, esPersonaDummy, EMPLOYEE_OVERRIDES, ALIAS_BIO_FIJOS } from '../frontend/src/config/employees'

const CARPETA_BIO_TUESDAY = CARPETAS.TUESDAY.bio
const CARPETA_CUADERNOS_TUESDAY = CARPETAS.TUESDAY.horarios
const CARPETA_HORARIOS_SOS = CARPETAS.SOS_POLLO.horarios
const CARPETA_BIO_SOS = CARPETAS.SOS_POLLO.bio
const CARPETA_HORARIOS_HUPER = CARPETAS.SBARRO_HUPER.horarios
const CARPETA_HORARIOS_AMERICA = CARPETAS.SBARRO_AMERICA.horarios
const CARPETA_BIO_AMERICA = CARPETAS.SBARRO_AMERICA.bio

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

  // Gente de SOS que solo existe en el aparato (ex-empleados): se usa más abajo,
  // junto con las fichas del kiosco, para resolver los nombres del cuaderno.
  let sintSos = []

  // ===== TUESDAY: biométrico + horarios del cuaderno =====
  const bioTue = bioDeCarpeta(CARPETA_BIO_TUESDAY, mesStr)
  if (bioTue) {
    bioStore[GROUP_IDS.TUESDAY] = { [mesStr]: { marcas: bioTue.marcas, personas: bioTue.personas, ts: Date.now(), archivo: bioTue.archivo } }
    const empTue = personasSinteticas(GROUP_IDS.TUESDAY, bioTue.personas)
    // Los alias del cuaderno de Tuesday (GABRIELA, ALEJA NDRA, KATY, gente sin
    // huella...) viven en ALIAS_TURNOS_FIJOS, fuente única web+CLI: turnosDeCarpeta
    // ya los aplica por groupId.
    const t = turnosDeCarpeta(CARPETA_CUADERNOS_TUESDAY, empTue, GROUP_IDS.TUESDAY, isoWeekKey(ini))
    mergeTurnos(t.aplicarPorSemana)
    resumen.push(`TUESDAY: bio ${bioTue.archivo} (${bioTue.personas.length} personas) · turnos ${Object.keys(t.aplicarPorSemana).length} semanas de ${t.archivos.length} cuadernos`)
  } else {
    resumen.push(`TUESDAY: SIN export biométrico de ${mesStr} en ${CARPETA_BIO_TUESDAY}`)
  }

  // ===== SOS POLLO: biométrico del aparato (histórico de julio/agosto) =====
  const bioSos = bioDeCarpeta(CARPETA_BIO_SOS, mesStr)
  if (bioSos) {
    bioStore[GROUP_IDS.SOS_POLLO] = { [mesStr]: { marcas: bioSos.marcas, personas: bioSos.personas, ts: Date.now(), archivo: bioSos.archivo } }
    // personasSinteticas ya aplica RENOMBRES_APARATO (config/employees.js): así
    // "BERNARDO/DESPACHO" del cuaderno cae en Nicolas Bernardo y los dos
    // "NICOLAS" del aparato dejan de confundirse entre sí.
    sintSos = sinteticosPorAlias(GROUP_IDS.SOS_POLLO, bioSos.personas, ALIAS_BIO_FIJOS[GROUP_IDS.SOS_POLLO] || {})
    resumen.push(`SOS POLLO: bio ${bioSos.archivo} (${bioSos.personas.length} personas del aparato)`)
  } else {
    resumen.push(`SOS POLLO: sin export del aparato de ${mesStr} (desde oct-2026 ficha en el kiosco: no hace falta)`)
  }

  // ===== SBARRO HUPER: biométrico + horarios (su carpeta del local) =====
  const bioHup = bioDeCarpeta(CARPETAS.SBARRO_HUPER.bio, mesStr)
  if (bioHup) {
    bioStore[GROUP_IDS.SBARRO_HUPER] = { [mesStr]: { marcas: bioHup.marcas, personas: bioHup.personas, ts: Date.now(), archivo: bioHup.archivo } }
    resumen.push(`SBARRO HUPER: bio ${bioHup.archivo} (${bioHup.personas.length} personas)`)
  } else {
    resumen.push(`SBARRO HUPER: SIN export biométrico de ${mesStr} en ${CARPETAS.SBARRO_HUPER.bio}`)
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
      // + gente que solo existe en el aparato pero cobra por planilla (ANGELO/ANGEL):
      // sin esto sus filas del cuaderno ("ANGHELO", "ANGEL") no se asignan a nadie.
      const sintHup = bioHup ? sinteticosPorAlias(GROUP_IDS.SBARRO_HUPER, bioHup.personas, ALIAS_BIO_FIJOS[GROUP_IDS.SBARRO_HUPER] || {}) : []
      const tH = turnosDeCarpeta(CARPETA_HORARIOS_HUPER, [...empHup, ...sintHup], GROUP_IDS.SBARRO_HUPER, isoWeekKey(ini))
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
      const gentePrincipal = peopleA
        .filter(p => !esPersonaDummy(p.fullName))
        .filter(p => EMPLOYEE_OVERRIDES[p.id]?.skip !== true)
        .map(p => ({ ...p, groupId: resolveGroupId(p.id, p.groupId, {}, 'A', p.fullName) }))
      const empAme = gentePrincipal.filter(p => p.groupId === GROUP_IDS.SBARRO_AMERICA)
      // + gente que solo existe en el aparato pero cobra por planilla (ANGEL,
      // MATIAS, LUCIANA). Sin ellos, "ANGEL" del cuaderno se parecía a "AXEL"
      // (Levenshtein 2) y sus turnos terminaban en la ficha equivocada.
      const sintAme = bioAme ? sinteticosPorAlias(GROUP_IDS.SBARRO_AMERICA, bioAme.personas, ALIAS_BIO_FIJOS[GROUP_IDS.SBARRO_AMERICA] || {}) : []
      const tA = turnosDeCarpeta(CARPETA_HORARIOS_AMERICA, [...empAme, ...sintAme], GROUP_IDS.SBARRO_AMERICA, isoWeekKey(ini))
      mergeTurnos(tA.aplicarPorSemana)
      resumen.push(`SBARRO AMERICA: turnos ${Object.keys(tA.aplicarPorSemana).length} semanas de ${tA.archivos.length} planillas · ${empAme.length} empleados`)
      if (tA.noEncontrados.length) resumen.push(`SBARRO AMERICA: nombres del Excel sin resolver: ${tA.noEncontrados.join(', ')}`)

      // SOS POLLO ficha en el kiosco (misma cuenta A): sus turnos se resuelven
      // contra las fichas reales + los ex-empleados que solo están en el aparato.
      const empSos = gentePrincipal.filter(p => p.groupId === GROUP_IDS.SOS_POLLO)
      const tS = turnosDeCarpeta(CARPETA_HORARIOS_SOS, [...empSos, ...sintSos], GROUP_IDS.SOS_POLLO, isoWeekKey(ini))
      mergeTurnos(tS.aplicarPorSemana)
      resumen.push(`SOS POLLO: turnos ${Object.keys(tS.aplicarPorSemana).length} semanas de ${tS.archivos.length} cuadernos · ${empSos.length} personas del kiosco`)
      if (tS.noEncontrados.length) resumen.push(`SOS POLLO: nombres del cuaderno sin resolver: ${tS.noEncontrados.join(', ')}`)
    } catch (e) {
      resumen.push(`SBARRO AMERICA: no se pudieron leer turnos (${e.message})`)
    }
  } else {
    resumen.push('SBARRO AMERICA: sin credenciales de la cuenta A en backend/.env — turnos no incluidos')
  }

  return { bioStore, turnos, resumen }
}
