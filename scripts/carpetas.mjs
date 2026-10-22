// Carpetas de OneDrive por local — FUENTE ÚNICA.
//
// Desde el 22-oct-2026 cada local tiene la misma estructura dentro de su propia
// carpeta (antes el biométrico de Tuesday y América vivía en OneDrive\Anuar\ y
// el de SOS estaba tres niveles adentro de CUADERNOS DE GERENTES):
//
//   <LOCAL>\ASISTENCIA\
//     1 HORARIOS DEL GERENTE\   el cuaderno que llena el gerente
//     2 BIOMETRICO\             los exports del aparato de huellas
//     3 REPORTES MENSUALES\     los Excel que genera la app
//     4 KIOSCO Y PINS\          (solo SOS) instrucciones del celular + PIN
//
// Si una carpeta se mueve, se cambia ACÁ y nada más. El log de la mudanza está
// en DATOS LOCALES\mudanza-carpetas-2026-10-22.txt.

const OD = 'C:/Users/anuar/OneDrive'

const porLocal = carpetaDelLocal => ({
  horarios: `${OD}/${carpetaDelLocal}/ASISTENCIA/1 HORARIOS DEL GERENTE`,
  bio: `${OD}/${carpetaDelLocal}/ASISTENCIA/2 BIOMETRICO`,
  reportes: `${OD}/${carpetaDelLocal}/ASISTENCIA/3 REPORTES MENSUALES`,
})

export const CARPETAS = {
  SOS_POLLO: porLocal('SOS POLLO PRADO'),
  TUESDAY: porLocal('TUESDAY AMERICA'),
  SBARRO_AMERICA: porLocal('SBARRO AMERICA'),
  SBARRO_HUPER: porLocal('SBARRO HUPERMALL'),
}

// Solo SOS por ahora: los PDF del kiosco y la hoja de PIN.
export const CARPETA_KIOSCO_SOS = `${OD}/SOS POLLO PRADO/ASISTENCIA/4 KIOSCO Y PINS`
