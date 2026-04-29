# 📌 Cómo retomar este proyecto

> Documento personal de Anuar. Si lo abres desde otra compu vía OneDrive, sigue estos pasos.

---

## 📂 Dónde vive todo

| Cosa | Ubicación |
|---|---|
| **Carpeta del proyecto** | `C:\Users\Anuar\OneDrive\Anuar\JIBBLE APP ASISTENCIA\` |
| **App en producción** | https://jibble-plus.vercel.app |
| **Repositorio Git** | https://github.com/anuarissa/jibble-plus |
| **Hosting** | Vercel — proyecto `jibble-plus` (cuenta `anuarissa`) |
| **Datos de empleados** | Jibble — https://web.jibble.io |
| **Memoria persistente Claude** | `C:\Users\Anuar\OneDrive\Anuar\Claude-Knowledge\proyectos\jibble-app-asistencia.md` |

⚠️ **OneDrive sincroniza la carpeta entre compus**, pero `node_modules/` no se sincroniza (está en `.gitignore`). En cada compu tienes que correr `npm install` la primera vez.

---

## 🆕 Primera vez en otra compu

### 1. Software que necesitas instalar

| Programa | Para qué | Link |
|---|---|---|
| **Node.js 20 o más** | Correr la app local | https://nodejs.org |
| **Git** | Versionar código | https://git-scm.com |
| **VS Code** | Editor | https://code.visualstudio.com |
| (Opcional) **Vercel CLI** | Deployar desde terminal | `npm install -g vercel` |

### 2. Esperar que OneDrive sincronice la carpeta

Espera a que la carpeta `JIBBLE APP ASISTENCIA` aparezca completa (icono de check verde en File Explorer). Si solo está la nube ☁️, click derecho → "Mantener siempre en este dispositivo".

### 3. Abrir en VS Code

**Opción rápida (recomendada)**: click derecho sobre la carpeta `JIBBLE APP ASISTENCIA` → **"Open with Code"** (si tienes VS Code instalado, aparece esa opción).

**Opción manual**:
1. Abrir VS Code
2. Menú **File → Open Folder**
3. Navegar a `C:\Users\Anuar\OneDrive\Anuar\JIBBLE APP ASISTENCIA`
4. Click "Seleccionar carpeta"

### 4. Instalar dependencias (una sola vez por compu)

Abrir terminal dentro de VS Code (`Ctrl+\``) y pegar uno por uno:

```bash
cd "C:\Users\Anuar\OneDrive\Anuar\JIBBLE APP ASISTENCIA\frontend"
npm install
```

```bash
cd "C:\Users\Anuar\OneDrive\Anuar\JIBBLE APP ASISTENCIA\backend"
npm install
```

Tarda ~2 min cada uno. Solo se hace una vez por compu.

### 5. (Si quieres correr local) Crear el archivo de credenciales

El archivo `backend/.env` **NO se sincroniza** (es secreto). Tienes que crearlo:

1. Copiar `backend/.env.example` y renombrarlo a `backend/.env`
2. Pegar tus credenciales reales (las tienes en https://web.jibble.io → Ajustes → Credenciales API)
3. Formato del archivo:

```
JIBBLE_API_KEY_ID=tu-id-aqui
JIBBLE_API_KEY_SECRET=tu-secret-aqui
JIBBLE_TOKEN_URL=https://identity.prod.jibble.io/connect/token
JIBBLE_BASE_URL=https://workspace.prod.jibble.io/v1
JIBBLE_TIME_BASE=https://time-tracking.prod.jibble.io/v1
PORT=3001
APP_PASSWORD=la-password-de-tu-app
```

> Las credenciales reales **están en Vercel** (no en este archivo). Para verlas:
> https://vercel.com/anuarissa/jibble-plus/settings/environment-variables — click el ícono de "ojo" para revelar el valor.

⚠️ Si NO vas a correr local (solo trabajar en producción) → puedes saltarte este paso. La app en Vercel ya tiene las credenciales.

---

## 🚀 Cómo trabajar día a día

### Opción A — Solo usar la app (no programar)

Abrir https://jibble-plus.vercel.app en cualquier navegador, meter password, listo.

### Opción B — Programar y ver cambios local

Doble click sobre `start.bat` en la carpeta del proyecto:
- Abre 2 ventanas negras (backend + frontend)
- Abre solo el navegador en http://localhost:3000

Para detener: cerrar las dos ventanas negras.

**Editar código**: en VS Code, modificas archivos, guardas (`Ctrl+S`) → la app local se actualiza sola (Vite hot reload).

### Opción C — Subir cambios a producción

Cuando quieras que los cambios estén en https://jibble-plus.vercel.app:

```bash
cd "C:\Users\Anuar\OneDrive\Anuar\JIBBLE APP ASISTENCIA"
git add .
git commit -m "Describe el cambio"
git push
```

Vercel detecta el push y redeploya automáticamente en ~1 minuto.

---

## 📁 Mapa de archivos importantes

```
JIBBLE APP ASISTENCIA/
├── frontend/                 ← Aplicación web (lo que ves en el navegador)
│   ├── src/
│   │   ├── pages/            ← Páginas: Dashboard, Restaurant, Empleados, etc.
│   │   ├── components/       ← Componentes reutilizables (cards, tablas, modales)
│   │   ├── hooks/            ← Lógica compartida (useJibble, useLocalConfig)
│   │   ├── utils/            ← Cálculos (planilla, tardanzas, turnos, format)
│   │   ├── config/
│   │   │   └── employees.js  ← Lista hardcoded de empleados con horario default
│   │   └── api/              ← Cliente HTTP al backend
│   └── package.json          ← Dependencias frontend
│
├── backend/                  ← Servidor Express (solo dev local, no sube a Vercel)
│   ├── server.js
│   ├── jibble-client.js      ← Cliente que llama a la API de Jibble
│   └── .env                  ← TUS CREDENCIALES (secreto, no se sube a Git)
│
├── api/                      ← Funciones serverless (lo que usa Vercel en producción)
│   ├── login.js
│   ├── jibble/               ← Endpoints proxy a Jibble
│   └── _lib/                 ← Código compartido
│
├── lib/                      ← Cliente Jibble compartido entre backend/api
├── start.bat                 ← Doble-click para arrancar todo local
├── README.md                 ← Documentación técnica
├── COMO-RETOMAR.md           ← ESTE archivo
└── EJEMPLO DE HORARIO.xlsx   ← Excel template de turnos rotativos
```

### Archivos que más vas a tocar

- **`frontend/src/config/employees.js`** — agregar empleado nuevo (con sueldo, horario default)
- **Páginas** dentro de `frontend/src/pages/` — cambios de UI
- **`backend/.env`** — cambiar password de la app (`APP_PASSWORD=...`)

---

## 🔧 Cosas comunes

### Agregar un empleado nuevo

1. **En Jibble web** primero: agrega la persona en https://web.jibble.io → Personas → +Add
2. **En la app**: vas a `/empleados` y le asignas local, cargo, tarifa, horario
3. Si tiene horario fijo distinto al default → edítalo desde el modal de Empleados

### Cambiar la contraseña de la app

Abrir terminal en la carpeta del proyecto:

```bash
vercel env rm APP_PASSWORD production -y
```
```bash
echo "tu-nueva-pass" | vercel env add APP_PASSWORD production
```
```bash
vercel --prod --yes
```

Si nunca usaste Vercel CLI antes, primero: `vercel login`.

### Ver los logs de Vercel (cuando algo falla)

https://vercel.com/anuarissa/jibble-plus/logs

### Recuperar el repo en una nueva compu desde cero (sin OneDrive)

Si OneDrive no está disponible:

```bash
git clone https://github.com/anuarissa/jibble-plus.git
cd jibble-plus
cd frontend && npm install
cd ../backend && npm install
```

Luego crear `backend/.env` con las credenciales como arriba.

---

## 🆘 Cuando algo falla

| Síntoma | Solución |
|---|---|
| `npm install` falla | Borrar `node_modules` y `package-lock.json`, intentar de nuevo |
| `git push` pide password | Usa Personal Access Token de GitHub (no tu password normal). Ver https://github.com/settings/tokens |
| App en producción muestra error | Mirar logs en https://vercel.com/anuarissa/jibble-plus/logs |
| Login dice "incorrect password" | Verificar `APP_PASSWORD` en https://vercel.com/anuarissa/jibble-plus/settings/environment-variables |
| Ports 3000 o 3001 ocupados al arrancar local | Cerrar todas las ventanas de Node, reabrir `start.bat` |
| OneDrive no sincroniza | Click derecho carpeta → "Free up space" → luego "Always keep on this device" |

---

## 📞 Información de cuentas

- **Email principal**: `anuarissa117@gmail.com`
- **GitHub**: `anuarissa`
- **Vercel**: `anuarissa` (login con GitHub)
- **Jibble**: cuenta admin de Tuesday/Sbarro
- **Locales en Jibble**: Tuesday S.R.L, Sbarro Huper, Sbarro América, S.O.S. Pollo, Oficinas Tuesday

---

## 🎯 Atajos VS Code útiles

| Atajo | Qué hace |
|---|---|
| `Ctrl + \`` | Abrir/cerrar terminal integrada |
| `Ctrl + P` | Buscar archivo por nombre |
| `Ctrl + Shift + F` | Buscar texto en TODO el proyecto |
| `Ctrl + S` | Guardar archivo (Vite hot-reloads automáticamente) |
| `Ctrl + B` | Ocultar/mostrar el panel lateral |
| `Ctrl + ñ` | Comentar/descomentar línea |

---

**Última actualización**: 2026-04-27
**Estado del proyecto**: en producción, todo funcional.
