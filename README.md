# Jibble+ · Gestión multi-local

App web propia para gestionar 5 locales con la API de Jibble (plan gratuito).
Reemplaza el panel nativo con vista consolidada, planilla automática con descuento por tardanza, comparativos y exportes.

**Locales conectados:**
- 🍕 Sbarro América — cuenta Jibble "Principal"
- 🍕 Sbarro Huper — su propio workspace Jibble (cuenta secundaria, sin grupos: su gente se asigna sola al local)
- Ocultos por defecto (se muestran con el ojo en `Configuración → Tus locales`): 🍗 S.O.S. Pollo · 💼 Oficinas Tuesday · 🍔 Tuesday S.R.L

**Horarios:** salen del Excel de planilla del gerente (sincronizado desde OneDrive) o del horario base por empleado.
Si un día no tiene ninguno de los dos, **no se evalúa** (no cuenta falta ni tardanza) y la app avisa en rojo.

---

## Qué hace

- **Dashboard global** — locales visibles lado a lado con fichados ahora, horas semana, planilla estimada, semáforo de puntualidad.
- **Sueldos** (`/sueldos`, menú lateral) — **la vista para armar los sueldos**: por local y por empleado, con filtros Día/Semana/Mes/**Rango libre** (quincenas):
  - Horas trabajadas vs programadas + % de cumplimiento
  - Faltas (debía venir y no vino) con fecha y horario programado
  - Tardanzas (días, minutos, multa) y **minutos extra por día**
  - Bruto, descuentos y total a pagar — mismo motor que la pestaña Planilla (los Bs cuadran)
  - Gráficas: horas por empleado, horas por día, retrasos y extras por día
  - Todo lo que no cuadra sale **en rojo con su comentario** explicando qué pasó y qué se hizo con la plata
- **Vista por restaurante** con 5 pestañas:
  - Asistencia semanal con semáforos por día
  - **Turnos** — grilla editable + **carpeta OneDrive conectada** (lee el Excel del gerente solo, ver abajo)
  - Planilla con tarifas editables, horas extra (×1.5) y descuentos deducidos del total
  - Tardanzas con botón "Condonar" (motivo opcional, recalcula planilla en vivo) + modo Resumen
  - Empleados con avatar, barra de progreso de horas vs esperadas
- **Comparativo** — 3 gráficos (Recharts) + ranking de puntualidad + récords.
- **Historial** — rango libre de fechas, filtros, export CSV/Excel.
- **Configuración** — ocultar locales (ojo), colores/emojis, asignar empleados a locales, reglas de tardanza.
- **Alertas tiempo real** — empleado fichado >10h, no-show 30 min después del turno **real** (no del horario genérico de Jibble). Polling cada 5 min.

---

## Horarios automáticos desde OneDrive

En `Local → Turnos → Conectar carpeta OneDrive` se elige **una vez** la carpeta del local
(ej. `SBARRO HUPERMALL\1- CUADERNOS\5- CUADERNOS DE GERENTES\2026 CUADERNO GERENTES`).
Desde ahí, cada vez que se abre la pestaña los turnos se cargan solos.

- Cada local tiene su carpeta. Requiere Chrome/Edge (File System Access API); conviene marcar "Permitir en cada visita".
- **No importa el nombre del archivo**: se leen todos los `.xlsx` y las semanas se detectan por las **fechas de adentro** (hoja "Horarios", formato planilla del gerente). Convención: un Excel por mes (`07 PLANILLA HORARIOS 2026.xlsx`).
- Si dos archivos traen la misma semana, gana el guardado más recientemente. **El Excel siempre manda** sobre lo editado a mano en la app.
- Turnos partidos, "LIBRE" y nombres con typos se resuelven solos; los que no, se vinculan una vez desde un panel y queda recordado.
- Avisa qué empleados registrados **no están** en el Excel más reciente y si falta cargar la semana actual.

---

## Reglas de tardanza y descuentos

- Tolerancia: 0 minutos (1 min ya cuenta como tarde)
- **Multa escalonada** (hardcodeada en `utils/lateness.js` → `calcularMulta`):
  - 1-10 min → **10 Bs** (fijo)
  - 11+ min → 10 Bs + **20 Bs por cada bloque de 10 min iniciado** después de los primeros 10
  - Ejemplos: 11 min = 30 Bs · 20 min = 30 Bs · 21 min = 50 Bs · 31 min = 70 Bs
- **No-registro: 20 Bs por día** con fichaje incompleto (marcó entrada o salida, no ambas). Ese día se pagan las **horas programadas**, no las fichadas.
- **Tardanza de +3h → no se cobra**: casi siempre significa horario mal cargado. El día se marca en rojo para revisar el Excel.
- **Día sin horario cargado → no se evalúa**: ni falta ni tardanza; se pagan las horas fichadas y se avisa en rojo.
- La multa se **deduce automáticamente del total a pagar**; el pago por empleado nunca baja de 0.
- Botón "Condonar" por tardanza (con motivo) revierte la multa y recalcula. El día sigue contando como "llegó tarde", pero sin multa.

Tolerancia y multiplicador de extras se editan en `Configuración → Reglas de tardanza`.

---

## Cálculo de planilla

Todo se calcula **por día** (`utils/stats.js` → `resolverDia`) y se agrega en el rango pedido
(`utils/resumen-sueldos.js` → `resumenSueldos`, que usan tanto `/sueldos` como la pestaña Planilla → mismos Bs).

```
horas_pagables = horas fichadas del día
                 (si el registro está incompleto o da >16h → se usan las horas programadas)
horas_extra    = solo lo que pasa de 30 min DESPUÉS de la salida programada (por día)
horas_normales = horas_pagables - horas_extra
bruto          = (normales × tarifa) + (extras × tarifa × 1.5)
descuentos     = multas por tardanza (no condonadas, con tope de 3h) + 20 Bs × días sin registro
total_a_pagar  = max(0, bruto - descuentos)
```

Días **sin horario cargado** no aportan horas programadas ni faltas; sus horas fichadas sí se pagan.
El rango se recorta **por día**: una semana que cruza el borde del mes no mete días del mes vecino.

**Tarifas por hora**: editables inline en la pestaña Planilla, se guardan en localStorage (Jibble gratuito no expone este campo en la API).

---

## Cómo correr

### 1. Instalar dependencias

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Conseguir tu API key de Jibble

**Yo no puedo generarla por ti** — sale de tu cuenta logueada.

1. Entra a [jibble.io](https://jibble.io) con tu usuario admin
2. Ve a `Settings → Integrations → API`
3. Click en `Generate API Token`, copia el token
4. Crea `backend/.env` (copia desde `.env.example`) y pega:
   ```
   JIBBLE_API_KEY=pega_aquí_tu_token
   ```
5. Reinicia el backend (Ctrl+C → `npm run dev`)

**Sin API key**, la app corre en **modo demo** con datos realistas (los 4 locales reales con empleados ficticios). Útil para probar antes de conectar.

### 3. Arrancar

En 2 terminales separadas:

```bash
# Terminal 1
cd backend && npm run dev    # http://localhost:3001

# Terminal 2
cd frontend && npm run dev   # http://localhost:3000
```

Abrir [http://localhost:3000](http://localhost:3000). La primera vez te lleva a la pantalla de Setup.

---

## Stack

| Capa | Tech |
|---|---|
| Frontend | React 18 + Vite 5 + Tailwind 3 + React Router 6 |
| Charts | Recharts |
| Iconos | Lucide React |
| Toasts | Sonner |
| Excel | SheetJS (xlsx) |
| Backend | Node 24 + Express 4 + Axios |
| Almacenamiento | localStorage (tarifas, condonaciones, config) |

---

## Estructura

```
backend/
├── server.js           # Proxy Express, modo mock auto si no hay JIBBLE_API_KEY
├── jibble-client.js    # Cliente axios + adaptadores defensivos
├── mock-data.js        # 4 locales × 6-8 empleados × 14 días de fichajes
└── .env.example

frontend/src/
├── pages/              # Setup · Dashboard · Restaurant · ResumenSueldos · Comparison · History · Settings
├── components/
│   ├── dashboard/      # RestaurantCard · GlobalStats · AlertsPanel
│   ├── restaurant/     # AttendanceTable · TurnosTable · PayrollTable · LatenessPanel · EmployeeCards
│   ├── layout/         # Layout · Sidebar
│   └── ui/             # Avatar · Skeleton
├── hooks/              # useJibble · useLocalConfig · useAlerts · useCarpetaHorarios · useActiveWorkspace
├── utils/
│   ├── lateness.js     # ★ Detección + multa escalonada (10 Bs ≤10min, +20 Bs / 10 min)
│   ├── stats.js        # ★ Motor por día (resolverDia) + agregaciones + comentarioAnomalia
│   ├── payroll.js      # ★ Cálculo planilla con descuentos
│   ├── resumen-sueldos.js  # ★ Agregación por rango (la usan /sueldos y Planilla)
│   ├── turnos.js       # Celdas de turno, semana ISO, turnos partidos, horario por día
│   ├── excel-turnos.js # Parser del Excel del gerente (+ template propio) y alias de nombres
│   ├── carpeta-horarios.js # Carpeta OneDrive: File System Access API + IndexedDB
│   ├── format.js       # Bs 1.250,00, fechas y meses en español
│   └── export.js       # CSV con BOM UTF-8 + Excel SheetJS
├── config/employees.js # GROUP_IDS, horarios base, locales ocultos por defecto
└── api/jibble.js       # Cliente HTTP con caché localStorage 5 min
```

**Multi-workspace**: el backend fusiona varias cuentas Jibble (`JIBBLE_API_KEY_ID`, `_2`, `_3`…) y
las etiqueta; el selector "Cuenta" del Dashboard filtra por una o las muestra todas.

---

## Validación de la lógica de negocio

No hay test runner instalado: la lógica se valida con scripts node ad-hoc (bundle con esbuild,
que ya viene con Vite) y con Puppeteer contra datos reales. Lo verificado hasta hoy:

- `calcularMulta` y minutos de retraso (hora programada vs fichaje real, zona Bolivia UTC-4)
- `resumenSueldos`: faltas, turnos partidos, día incompleto (no-registro), extras >30 min,
  recorte por día del rango, días futuros y "hoy" excluidos de faltas
- Horario genérico de Jibble → no genera faltas ni tardanzas; el turno del Excel sí
- Tardanza >3h no se cobra; condonaciones respetadas en planilla
- `/sueldos` y la pestaña Planilla dan **el mismo total** para el mismo rango
- Parser del Excel del gerente contra los cuadernos reales de HUPERMALL (semanas, LIBRE,
  turnos partidos, typos de nombres, filas basura)

Los scripts viven en el scratchpad de la sesión (no en el repo). Para un chequeo rápido:

```bash
cd frontend
node --input-type=module -e "import('./src/utils/lateness.js').then(m => console.log(m.calcularMulta(7)))"  # → 10
```

---

## Cuando llegue la API key real

El cliente Jibble en `backend/jibble-client.js` usa adaptadores defensivos: si Jibble responde con un shape ligeramente distinto del esperado, sólo hay que ajustar las funciones `adaptPerson`, `adaptGroup`, `adaptAttendance` y `adaptSchedule` — el resto de la app no se entera.

**Smoke test al primer arranque con key real:**

```bash
curl -H "Authorization: Bearer TU_API_KEY" https://time-api.jibble.io/v1/People | head
```

Si responde JSON con `value` o array de personas → todo bien. Si responde con shape diferente, ajustar los adapters.

---

## Hecho (Jul-2026)

- [x] Vista de turnos por local (grilla empleados × días) + import/export Excel
- [x] Carga automática de horarios desde la carpeta OneDrive del local (Excel del gerente)
- [x] Indicador de horas trabajadas vs programadas y % de cumplimiento (página Sueldos)
- [x] Página Sueldos: faltas, tardanzas, extras, descuentos y total a pagar por rango libre
- [x] Avisos en rojo de todo lo que no cuadra (con su comentario y qué se hizo con la plata)
- [x] Ocultar locales de las vistas · soporte de la 2da cuenta Jibble (Sbarro Huper)

## TODO (futuras iteraciones)

- [ ] Export semanal automático por WhatsApp/email cada domingo
- [ ] Comparar esta semana vs anterior por local
- [ ] Mapa con los locales y empleados activos en cada uno
- [ ] Modo "solo lectura" para gerentes de local (sin ver planilla completa)
- [ ] Histórico de planillas por mes en BD (hoy todo en localStorage → hace falta para ver desde el celular)
- [ ] Costo por hora de cada local (planilla ÷ horas de apertura)
- [ ] Salidas después de medianoche: `minutosDiff` las lee como "salió 22h antes" (turno PM que
      cierra 00:30). También `24:00` en el Excel se rechaza al importar (`parseHora` corta en 23:59).
- [ ] Consolidar `backend/jibble-client.js` y `lib/jibble-client.js` (están duplicados)
