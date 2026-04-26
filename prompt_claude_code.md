# PROMPT PARA CLAUDE CODE
# Herramienta de gestión de restaurantes integrada con Jibble (plan gratuito)

---

Quiero que construyas una aplicación web completa de gestión de personal para
4 restaurantes, integrada con la API de Jibble (plan gratuito).
La app debe reemplazar el panel de Jibble con una vista más potente,
visual y enfocada en mis necesidades como dueño de los 4 locales.

---

## STACK TECNOLÓGICO

- Frontend: React + Vite
- Estilos: Tailwind CSS
- Gráficos: Recharts
- Routing: React Router
- HTTP: Axios
- Backend proxy: Node.js + Express (para manejar la API key de Jibble
  de forma segura sin exponerla en el frontend)
- Almacenamiento local: localStorage para caché y configuración

---

## CONEXIÓN CON JIBBLE (plan gratuito)

Usa la API REST pública de Jibble:
- Base URL: https://time-api.jibble.io
- Autenticación: Bearer token (API key del usuario)
- Documentación: https://developer.jibble.io

Endpoints principales a usar:
- GET /people            → lista de empleados
- GET /groups            → grupos (mis 4 restaurantes)
- GET /timesheet         → hojas de horas por rango de fecha
- GET /attendance        → registros de entrada/salida
- GET /workSchedules     → horarios configurados

Crea una pantalla de configuración inicial donde el usuario pega
su API key de Jibble (obtenida en Jibble > Ajustes > API).
Guárdala en localStorage. Nunca la expongas en el frontend,
pásala siempre por el proxy Express.

---

## ESTRUCTURA DE LA APP

### 1. PANTALLA DE CONFIGURACIÓN (primera vez)
- Campo para ingresar API key de Jibble
- Botón "Conectar" que valida la key haciendo un GET /people
- Si conecta bien, muestra los grupos (restaurantes) encontrados
- El usuario puede renombrar cada grupo con un nombre amigable
- Asigna un color y un emoji a cada restaurante
- Guarda todo en localStorage

---

### 2. DASHBOARD PRINCIPAL

Panel de control con vista de todos los restaurantes en tiempo real.
Muestra:

- Tarjetas por restaurante con:
  - Nombre y color del local
  - Cuántas personas están fichadas AHORA (en vivo)
  - Total de empleados del local
  - Horas acumuladas esta semana
  - Planilla estimada de la semana
  - Semáforo de puntualidad (verde/amarillo/rojo según % de llegadas a tiempo)

- Resumen global arriba:
  - Total empleados en todos los locales
  - Total horas esta semana (todos los locales)
  - Planilla total estimada
  - Alerta si alguien lleva más de 10 horas fichado sin salir

---

### 3. VISTA POR RESTAURANTE

Al hacer clic en un restaurante se abre su vista detallada:

#### Pestaña "Asistencia"
- Tabla semanal con todos los empleados del local
- Columnas: Lunes a Domingo con horas trabajadas cada día
- Indicadores visuales:
  - 🟢 verde: llegó a tiempo
  - 🟡 amarillo: llegó tarde (menos de 15 min)
  - 🔴 rojo: llegó tarde (más de 15 min) o faltó
  - ⚫ gris: día libre / no programado
- Total de horas por empleado a la derecha
- Filtro por semana con navegación ← →

#### Pestaña "Planilla"
- Tabla de empleados con:
  - Nombre y cargo
  - Tarifa por hora (editable, guardada en localStorage ya que Jibble
    gratuito no tiene este campo en la API)
  - Horas normales trabajadas
  - Horas extra (las que superan las horas del horario asignado)
  - Cálculo automático: horas normales × tarifa + horas extra × tarifa × 1.5
  - Total a pagar por empleado
- Fila de totales al final
- Botón exportar a CSV y a Excel

#### Pestaña "Tardanzas"
- Lista de todos los registros donde el empleado llegó tarde esta semana
- Muestra: empleado, día, hora programada, hora real, minutos de retraso
- Ordena de mayor a menor retraso
- Contador de tardanzas acumuladas por empleado en el mes

#### Pestaña "Empleados"
- Tarjetas de cada empleado con:
  - Foto (avatar con iniciales si no hay foto)
  - Nombre y cargo
  - Horas trabajadas esta semana vs horas esperadas
  - Barra de progreso
  - Última entrada registrada
  - Botón para ver historial completo

---

### 4. COMPARATIVO DE RESTAURANTES

Vista de análisis con gráficos comparando los 4 locales:

- Gráfico de barras: horas trabajadas por local esta semana
- Gráfico de barras: planilla estimada por local
- Gráfico de líneas: puntualidad por local (últimas 4 semanas)
  (% de fichajes a tiempo sobre total de fichajes)
- Ranking de locales por puntualidad (del mejor al peor)
- Tabla de récords:
  - Local con más horas trabajadas
  - Local con menos tardanzas
  - Local con mayor cumplimiento de horarios
  - Empleado más puntual de la semana (todos los locales)
  - Empleado con más horas extra

---

### 5. ALERTAS EN TIEMPO REAL

Sistema de notificaciones dentro de la app:

- 🔴 Alerta si un empleado lleva más de 10 horas fichado
- 🟡 Alerta si alguien del turno de apertura no fichó entrada
  pasados 30 minutos del inicio del turno
- 🟢 Notificación cuando todos los empleados de un turno ya ficharon
- El panel de alertas se actualiza cada 5 minutos automáticamente
  (polling a la API de Jibble)

---

### 6. HISTORIAL Y REPORTES

- Selector de rango de fechas libre
- Filtros: por restaurante, por empleado, por tipo de registro
- Tabla con todos los registros del período:
  - Fecha, empleado, local, hora entrada, hora salida, horas trabajadas,
    si llegó tarde, minutos de retraso
- Exportar como CSV o Excel
- Resumen del período: total horas, total planilla, % puntualidad global

---

### 7. CONFIGURACIÓN

- Editar nombre y color de cada restaurante
- Editar tarifas por hora de cada empleado
  (esto se guarda local porque Jibble gratuito no tiene este campo)
- Definir tolerancia de tardanza (default: 10 minutos)
- Definir cuántas horas se consideran "extra" por día (default: 8h)
- Multiplicador de horas extra (default: 1.5x)
- Botón para cambiar API key
- Botón para limpiar caché y reconectar

---

## DATOS QUE VIENEN DE JIBBLE (API gratuita)

✅ Sí disponible en plan gratuito:
- Lista de empleados y grupos
- Registros de entrada y salida (timestamp exacto)
- Horarios asignados (para comparar con hora real y detectar tardanzas)
- Hojas de horas semanales
- Geolocalización de cada fichaje

❌ No disponible en plan gratuito (manejar localmente):
- Tarifas por hora → guardar en localStorage por empleado
- Reportes de nómina automáticos → calcular en el frontend
- Exportación avanzada → generar en el frontend con SheetJS

---

## LÓGICA DE TARDANZAS

Para calcular si un empleado llegó tarde:
1. Obtener el horario asignado del empleado (GET /workSchedules)
2. Obtener la hora de su primer fichaje del día (GET /attendance)
3. Si hora_real_entrada > hora_programada_entrada + tolerancia_minutos
   → marcar como tardanza
4. Minutos de retraso = hora_real_entrada - hora_programada_entrada
5. Guardar histórico en localStorage para análisis mensual

---

## CÁLCULO DE PLANILLA

Para cada empleado por semana:
- horas_totales = suma de (hora_salida - hora_entrada) de cada día,
  menos descansos si están registrados
- horas_normales = min(horas_totales, horas_esperadas_segun_horario)
- horas_extra = max(0, horas_totales - horas_esperadas_segun_horario)
- total_a_pagar = (horas_normales × tarifa) + (horas_extra × tarifa × multiplicador)

---

## DISEÑO Y UX

- Tema oscuro por defecto, con opción de cambiar a claro
- Cada restaurante tiene su color distintivo en toda la app
- Responsive: funciona bien en tablet (para ver desde la caja del local)
- Sidebar colapsable con íconos
- Carga optimista: muestra datos del caché mientras actualiza
- Skeleton loaders mientras carga datos de la API
- Toast notifications para errores de conexión

---

## ESTRUCTURA DE ARCHIVOS SUGERIDA

```
/
├── backend/
│   ├── server.js          (proxy Express para la API key)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── jibble.js  (todas las llamadas a la API)
│   │   ├── components/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── RestaurantCard.jsx
│   │   │   ├── AttendanceTable.jsx
│   │   │   ├── PayrollTable.jsx
│   │   │   ├── LatenessPanel.jsx
│   │   │   ├── ComparisonCharts.jsx
│   │   │   ├── AlertsPanel.jsx
│   │   │   └── Settings.jsx
│   │   ├── hooks/
│   │   │   ├── useJibble.js
│   │   │   └── useLocalConfig.js
│   │   ├── utils/
│   │   │   ├── payroll.js     (cálculos de planilla)
│   │   │   ├── lateness.js    (detección de tardanzas)
│   │   │   └── export.js      (CSV y Excel)
│   │   └── App.jsx
│   └── package.json
└── README.md              (instrucciones de instalación)
```

---

## INSTRUCCIONES FINALES PARA CLAUDE CODE

1. Crea primero el backend proxy en Express (server.js) con las rutas
   necesarias para cada endpoint de Jibble

2. Luego crea el frontend en React con Vite

3. Instala todas las dependencias necesarias

4. Crea un archivo .env.example con las variables necesarias

5. Escribe un README.md con instrucciones claras:
   - Cómo instalar (npm install en /backend y /frontend)
   - Cómo obtener la API key de Jibble
   - Cómo correr el proyecto (npm run dev en ambos)
   - Cómo configurar los restaurantes la primera vez

6. Haz que la app funcione completamente con datos reales de Jibble
   y también con datos de ejemplo (mock data) si la API key no está
   configurada, para poder probarla antes de conectar Jibble

7. Prioriza que la detección de tardanzas y el cálculo de planilla
   funcionen correctamente antes que el diseño visual

---

## IDEAS ADICIONALES PARA IMPLEMENTAR DESPUÉS
(menciónalas como TODOs en el código)

- Exportar reportes automáticamente por WhatsApp o email al final
  de cada semana
- Vista de turnos en calendario (quién trabaja qué día en cada local)
- Comparar esta semana vs semana pasada para cada local
- Indicador de "horas faltantes" si un empleado no completó su semana
- Mapa con los 4 locales y quién está en cada uno ahora mismo
- Modo de solo lectura para gerentes de local (sin ver planilla completa)
- Historial de planillas anteriores por mes
- Cálculo de costo por hora de cada local (planilla ÷ horas de apertura)
```
