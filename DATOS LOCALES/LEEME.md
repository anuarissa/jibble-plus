# DATOS LOCALES — dónde va cada cosa

Desde el **22-oct-2026 cada local tiene su propia carpeta de asistencia** en OneDrive,
con la misma estructura. Antes esto estaba repartido: el biométrico de Tuesday y de
América vivía en `OneDrive\Anuar\...`, el de Huper acá adentro, y el de SOS tres
niveles dentro de `CUADERNOS DE GERENTES`.

## La estructura, igual en los 4 locales

```
<CARPETA DEL LOCAL>\ASISTENCIA\
  1 HORARIOS DEL GERENTE\   el cuaderno de horarios que llena el gerente
  2 BIOMETRICO\             los exports del aparato de huellas
  3 REPORTES MENSUALES\     los Excel que genera la app (se copian solos al generarlos)
  4 KIOSCO Y PINS\          (solo SOS) instrucciones del celular + hoja de PIN
```

| Local | Carpeta |
|---|---|
| Sbarro América | `C:\Users\anuar\OneDrive\SBARRO AMERICA\ASISTENCIA\` |
| Sbarro Huper | `C:\Users\anuar\OneDrive\SBARRO HUPERMALL\ASISTENCIA\` |
| Tuesday | `C:\Users\anuar\OneDrive\TUESDAY AMERICA\ASISTENCIA\` |
| SOS Pollo | `C:\Users\anuar\OneDrive\SOS POLLO PRADO\ASISTENCIA\` |

Las rutas están en **un solo archivo**: [`scripts/carpetas.mjs`](../scripts/carpetas.mjs).
Si alguna carpeta se mueve, se cambia ahí y nada más.

## El nombre de los archivos sí importa

- **Biométrico**: el nombre tiene que contener la palabra `BIOMETRICO`
  (ej. `09 SEPTIEMBRE BIOMETRICO TUESDAY.xls`). El mes lo detecta la app leyendo el
  contenido del archivo, no el nombre, así que un nombre raro no rompe nada mientras
  lleve esa palabra.
- **Horarios**: un Excel por mes con el número del mes adelante (`09 ...`). Si dos
  archivos traen la misma semana, gana el modificado más recientemente.

## Qué queda en esta carpeta del repo

- `.backups\` — copia del Local Storage de Edge antes de cada carga al navegador.
- `mudanza-carpetas-2026-10-22.txt` — el log de la mudanza (origen → destino de cada
  archivo movido), por si alguna vez hay que revertirla.

**Nada de esto sube a GitHub.**
