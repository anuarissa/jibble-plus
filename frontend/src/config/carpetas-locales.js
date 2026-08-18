// Dónde vive el Excel de cada local (las mismas rutas que usan los scripts del
// CLI). Se muestran en la UI para que conectar una carpeta sea elegir la que ya
// dice la pantalla, sin tener que recordarla.

import { GROUP_IDS } from './employees'

export const RUTAS_SUGERIDAS = {
  [GROUP_IDS.TUESDAY]: {
    horarios: 'OneDrive\\TUESDAY AMERICA\\CUADERNOS DE GERENTES\\CUADERNOS GERENTES',
    biometrico: 'OneDrive\\Anuar\\Tuesday\\SUELDOS\\SUELDOS 2026',
  },
  [GROUP_IDS.SBARRO_HUPER]: {
    horarios: 'OneDrive\\SBARRO HUPERMALL\\1- CUADERNOS\\5- CUADERNOS DE GERENTES\\2026 CUADERNO GERENTES',
    biometrico: 'JIBBLE APP ASISTENCIA\\DATOS LOCALES\\SBARRO HUPER\\BIOMETRICO',
  },
  [GROUP_IDS.SBARRO_AMERICA]: {
    horarios: 'OneDrive\\SBARRO AMERICA\\CUADERNOS DE GERENTES SA\\PLANILLA SUPERVISORES SA\\2026\\HORARIOS 2026',
    biometrico: 'JIBBLE APP ASISTENCIA\\DATOS LOCALES\\SBARRO AMERICA\\BIOMETRICO',
  },
  [GROUP_IDS.SOS_POLLO]: {
    horarios: null,      // pendiente: Anuar avisará dónde queda
    biometrico: null,
  },
}

export const rutaSugerida = (groupId, tipo) => RUTAS_SUGERIDAS[groupId]?.[tipo] || null
