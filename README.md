# Jibble+ · Gestión multi-local

App web propia para gestionar 5 locales con la API de Jibble (plan gratuito).
Reemplaza el panel nativo con vista consolidada, planilla automática con descuento por tardanza, comparativos y exportes.

**Locales conectados:**
- 🍔 Tuesday S.R.L
- 🍕 Sbarro Huper
- 🍕 Sbarro América
- 🍗 S.O.S. Pollo
- 💼 Oficinas (admin/gerencia que reporta directo, no a gerentes de tienda)

Restaurantes: turnos Lun-Sáb (8-16 / 14-22). Oficinas: Lun-Vie 9-18 (40h/sem).

---

## Qué hace

- **Dashboard global** — los 4 locales lado a lado con fichados ahora, horas semana, planilla estimada, semáforo de puntualidad.
- **Vista por restaurante** con 4 pestañas:
  - Asistencia semanal con semáforos por día
  - Planilla con tarifas editables, horas extra (×1.5) y descuento por tardanza deducido del total
  - Tardanzas listadas con botón "Condonar" (motivo opcional, recalcula planilla en vivo)
  - Empleados con avatar, barra de progreso de horas vs esperadas
- **Comparativo** — 3 gráficos (Recharts) + ranking de puntualidad + récords.
- **Historial** — rango libre de fechas, filtros, export CSV/Excel.
- **Configuración** — colores/emojis por local, reglas de tardanza, multiplicador de extras.
- **Alertas tiempo real** — empleado fichado >10h, no-show 30 min después del turno. Polling cada 5 min.

---

## Reglas de tardanza (configurables)

- Tolerancia: 0 minutos (1 min ya cuenta como tarde)
- Multa: **10 Bs por cada bloque de 5 minutos**
  - 1-5 min → 10 Bs
  - 6-10 min → 20 Bs
  - 11-15 min → 30 Bs
  - … y así sucesivamente
- La multa se **deduce automáticamente del total a pagar** en Planilla
- Botón "Condonar" por tardanza (con motivo) revierte la multa y recalcula
- Las condonaciones quedan visibles en auditoría con badge

Editable en `Configuración → Reglas de tardanza`.

---

## Cálculo de planilla semanal

```
horas_normales = min(horas_totales, horas_esperadas_segun_horario)
horas_extra    = max(0, horas_totales - horas_esperadas)
bruto          = (normales × tarifa) + (extras × tarifa × 1.5)
descuento      = suma de multas no condonadas
total_a_pagar  = bruto - descuento
```

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
├── pages/              # Setup · Dashboard · Restaurant · Comparison · History · Settings
├── components/
│   ├── dashboard/      # RestaurantCard · GlobalStats · AlertsPanel
│   ├── restaurant/     # AttendanceTable · PayrollTable · LatenessPanel · EmployeeCards
│   ├── layout/         # Layout · Sidebar
│   └── ui/             # Avatar · Skeleton
├── hooks/              # useJibble · useLocalConfig · useAlerts
├── utils/
│   ├── lateness.js     # ★ Detección + multa 10 Bs / 5 min
│   ├── payroll.js      # ★ Cálculo planilla con descuentos
│   ├── stats.js        # Agregaciones para Dashboard/Restaurant/Comparison
│   ├── format.js       # Bs 1.250,00, fechas
│   └── export.js       # CSV con BOM UTF-8 + Excel SheetJS
└── api/jibble.js       # Cliente HTTP con caché localStorage 5 min
```

---

## Validación de la lógica de negocio

`utils/lateness.js` y `utils/payroll.js` están testeados:

- 8 casos de `calcularMulta` (0, 1, 5, 6, 10, 11, 15, 30 min)
- Cálculo de minutos de retraso entre hora programada y fichaje real
- Severidad good/warn/bad según rangos
- Planilla completa: empleado de 50h con 48h esperadas a 15 Bs/h y 2 tardanzas (5+7 min)
  - Esperado: 48×15 + 2×15×1.5 − 30 = **735 Bs**
  - Test pasa ✓
- Condonación: planilla recalcula sin la multa condonada ✓

Para correr los tests manualmente:

```bash
cd frontend
node --input-type=module -e "import('./src/utils/lateness.js').then(m => console.log(m.calcularMulta(7)))"  # → 20
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

## TODO (futuras iteraciones)

- [ ] Export semanal automático por WhatsApp/email cada domingo
- [ ] Vista de turnos en calendario (quién trabaja qué día en cada local)
- [ ] Comparar esta semana vs anterior por local
- [ ] Indicador de "horas faltantes" si no completó la semana
- [ ] Mapa con los 4 locales y empleados activos en cada uno
- [ ] Modo "solo lectura" para gerentes de local (sin ver planilla completa)
- [ ] Histórico de planillas por mes en BD (hoy todo en localStorage)
- [ ] Costo por hora de cada local (planilla ÷ horas de apertura)
