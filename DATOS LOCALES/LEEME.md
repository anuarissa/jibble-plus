# DATOS LOCALES — dónde va cada cosa

Carpeta para los datos reales de los locales **Sbarro** (biométricos y planillas del contador).
Se sincroniza sola por OneDrive a todas tus PCs. **Nada de esto sube a GitHub.**

## TUESDAY no va aquí

Tuesday usa sus carpetas de siempre (la app ya las conoce):

- **Horarios**: `C:\Users\anuar\OneDrive\TUESDAY AMERICA\CUADERNOS DE GERENTES\CUADERNOS GERENTES\`
  (los `NN MES del 2026 LIBROS DE GERENTES.xlsx` de cada mes, hoja PERSONAL TUESDAY)
- **Biométrico + planilla del contador**: `C:\Users\anuar\OneDrive\Anuar\Tuesday\SUELDOS\SUELDOS 2026\<NN MES> SUELDOS 2026\`
  - El biométrico de cada mes con este nombre: `07 JULIO BIOMETRICO TUESDAY.xls` (cambiando el mes).
    Se exporta del aparato con el mismo programa de siempre (el que genera "Reporte de Asistencia").

## Sbarro Huper y Sbarro América

```text
DATOS LOCALES\
  SBARRO HUPER\
    BIOMETRICO\             ← export mensual del aparato:  biometrico sbarro huper 2026-08.xls
    PLANILLAS CONTADOR\     ← el Excel de sueldos que te pasa el contador cada mes
  SBARRO AMERICA\
    BIOMETRICO\             ← export mensual del aparato:  biometrico sbarro america 2026-07.xls
    PLANILLAS CONTADOR\
```

- **El nombre del archivo es solo para orden** — la app lee el mes real de la fila
  `Periodo:` que viene adentro del export. Cualquier `.xls`/`.xlsx` con la palabra
  `biometrico` en el nombre se procesa.
- Si exportas dos veces el mismo mes, **gana el archivo más nuevo**.

## Cómo se usa en la página web (jibble-plus.vercel.app o localhost)

1. Ir a **Sueldos** y elegir el local.
2. Con el filtro **Fuente** puedes alternar entre **App** (fichajes de Jibble) y
   **Biométrico** (marcas del aparato).
3. La primera vez en fuente Biométrico: botón **"Conectar carpeta"** → elegir la
   carpeta `BIOMETRICO` del local (para Tuesday: la carpeta `SUELDOS 2026`).
   Elegir "Permitir en cada visita" para que sincronice sola.
4. Si aparece el panel **"Nombres sin empleado"**, asignar cada nombre del aparato
   a su empleado (o "Ignorar siempre") — se hace una sola vez.

## Reportes por consola (sin navegador)

- `node scripts/reporte-mensual.mjs 2026-07` → planillas App y Biométrico de cada local
- `node scripts/cuadre-tuesday.mjs 2026-07` → cuadre de Tuesday contra el contador (PDF)
- `node scripts/cuadre-huper.mjs 2026-07` → cuadre de Huper contra el contador (PDF)
