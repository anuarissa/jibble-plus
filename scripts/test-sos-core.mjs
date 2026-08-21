// Tests de SOS POLLO contra los archivos REALES (cuaderno de horarios + export
// del aparato). Cubre las correcciones que pidió Anuar el 21-ago-2026:
//   · "NICOLAS" id 9 (27 días) es Nicolas Bernardo → resuelve BERNARDO/DESPACHO
//   · X/DESPACHO y X/MESAS no entran a la planilla (se pagan al día)
//   · NICOLAS/MESAS queda pendiente (dos candidatos) en vez de inventarle a
//     Bernardo un turno doble
// No ejecutar directo: node scripts/test-sos.mjs

import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx-js-style'
import { parseWorkbookTurnos, construirIndiceNombres, matchEmpleado } from '../frontend/src/utils/excel-turnos'
import { parseBiometricoWorkbook, personasSinteticas, personaSinteticaId } from '../frontend/src/utils/biometrico'
import { GROUP_IDS, ALIAS_TURNOS_FIJOS } from '../frontend/src/config/employees'

const SOS = GROUP_IDS.SOS_POLLO
const CARPETA_BIO = 'C:/Users/anuar/OneDrive/SOS POLLO PRADO/CUADERNOS DE GERENTES/CUADERNOS GERENTES/BIOMETRICO'
const CARPETA_HOR = 'C:/Users/anuar/OneDrive/SOS POLLO PRADO/CUADERNOS DE GERENTES/CUADERNOS GERENTES/CUADERNOS GERENTES 2026'
// Mismo rename que siembra cargar-navegador-core (RENOMBRES_POR_APARATO).
const RENOMBRES = { 9: 'Nicolas Bernardo' }

export async function correr() {
  let fallos = 0
  const check = (n, c, d = '') => { if (c) console.log(`  ✓ ${n}`); else { console.error(`  ✗ ${n} ${d}`); fallos++ } }

  const archivoBio = fs.existsSync(CARPETA_BIO)
    ? fs.readdirSync(CARPETA_BIO).find(f => /biometric/i.test(f) && /\.xls[xm]?$/i.test(f)) : null
  const archivoHor = fs.existsSync(CARPETA_HOR)
    ? fs.readdirSync(CARPETA_HOR).find(f => /\.xlsx$/i.test(f) && !f.startsWith('~$')) : null
  if (!archivoBio || !archivoHor) {
    console.log(`  ⏭ Faltan archivos de SOS (bio: ${archivoBio || 'no'} · cuaderno: ${archivoHor || 'no'}) — tests omitidos`)
    return fallos
  }

  console.log(`  · aparato: ${archivoBio} · cuaderno: ${archivoHor}`)
  const bio = parseBiometricoWorkbook(XLSX.readFile(path.join(CARPETA_BIO, archivoBio)))
  check(`el aparato trae ${bio.personasBio.length} personas`, bio.personasBio.length >= 9)

  // Gente del aparato con el nombre corregido (lo que ve la web con el override)
  const empleados = personasSinteticas(SOS, bio.personasBio)
    .map(e => (RENOMBRES[e.idBio] ? { ...e, fullName: RENOMBRES[e.idBio] } : e))
  const bernardo = empleados.find(e => e.id === personaSinteticaId(SOS, 9))
  const nico74 = empleados.find(e => e.id === personaSinteticaId(SOS, 74))
  check('el "NICOLAS" de 27 días se llama Nicolas Bernardo', bernardo?.fullName === 'Nicolas Bernardo', bernardo?.fullName)
  check('el otro Nicolas (id 74) queda como estaba', nico74?.fullName === 'Nicolas', nico74?.fullName)

  const idx = construirIndiceNombres(empleados)
  check('BERNARDO/DESPACHO del cuaderno → Nicolas Bernardo (match por apellido)',
    matchEmpleado(idx, 'BERNARDO/DESPACHO')?.id === bernardo.id)
  check('NICOLAS a secas → el único Nicolas (id 74), sin ambigüedad',
    matchEmpleado(idx, 'NICOLAS')?.id === nico74.id)

  const r = parseWorkbookTurnos(XLSX.readFile(path.join(CARPETA_HOR, archivoHor)), empleados, { aliases: ALIAS_TURNOS_FIJOS[SOS] })
  const semanas = Object.keys(r.aplicarPorSemana).sort()
  check(`julio completo: ${semanas.join(', ')}`, semanas.join(',') === '2026-W27,2026-W28,2026-W29,2026-W30,2026-W31')
  check(`ninguna celda perdida (${r.celdasOk} ok)`, r.celdasIgnoradas === 0, `${r.celdasIgnoradas} ignoradas`)
  check('X/DESPACHO y X/MESAS ignorados (se pagan al día)', !r.noEncontrados.some(n => /^X\//i.test(n)), r.noEncontrados.join(', '))
  check('BERNARDO ya no queda sin resolver', !r.noEncontrados.some(n => /BERNARDO/i.test(n)))
  check('Nicolas Bernardo con horario en las 5 semanas',
    semanas.filter(wk => r.aplicarPorSemana[wk]?.[bernardo.id]).length === 5)

  // Dos personas del aparato podrían ser "NICOLAS/MESAS": no adivinar.
  const ambNico = r.ambiguos.find(a => /NICOLAS/i.test(a.nombre))
  check('NICOLAS/MESAS queda pendiente con sus 2 candidatos', !!ambNico && ambNico.candidatos.length === 2,
    JSON.stringify(r.ambiguos.map(a => a.nombre)))
  const hayDobles = Object.values(r.aplicarPorSemana)
    .some(sem => Object.values(sem).some(dias => Object.values(dias).some(c => c?.segments?.length > 1)))
  check('nadie recibe turnos dobles inventados', !hayDobles)

  // Gente del cuaderno que no marcó en julio: se informa, NUNCA se crea sola.
  const noMarcaron = r.noEncontrados.filter(n => /ANNA|SHARUK|JHULIANA|ELENA/i.test(n))
  check(`los que no marcaron solo se informan (${noMarcaron.join(', ')})`, noMarcaron.length === 4)

  return fallos
}
