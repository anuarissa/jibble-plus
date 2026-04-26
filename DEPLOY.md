# 🚀 Deploy a Vercel — 4 pasos

## 1️⃣ Crear repo en GitHub

Click directo: **https://github.com/new**

- Repository name: `jibble-plus` (o el que quieras)
- Privacy: **Private** (recomendado)
- NO marques "Add README", "gitignore" ni "license" (ya los tengo locales)
- Click **Create repository**

## 2️⃣ Push tu código

GitHub te muestra los comandos. Usa el bloque **"…or push an existing repository from the command line"**. Copia y pega en una terminal abierta en `C:\Users\Anuar\OneDrive\Anuar\JIBBLE APP ASISTENCIA`:

```bash
git remote add origin https://github.com/TU_USUARIO/jibble-plus.git
git push -u origin main
```

(El primer commit ya está hecho, solo falta empujarlo.)

## 3️⃣ Importar a Vercel

Click directo: **https://vercel.com/new**

- "Import Git Repository" → busca `jibble-plus` → **Import**
- Framework Preset: **Vite** (auto-detectado)
- Root Directory: déjalo en `./`
- **NO toques** Build Command ni Output Directory (los configura `vercel.json`)

### Variables de entorno (antes de Deploy)

En la sección **Environment Variables**, agrega estas 5:

| Name | Value |
|---|---|
| `APP_PASSWORD` | Inventa una contraseña fuerte. Ejemplo: `JibbleTuesday2026!` |
| `JIBBLE_API_KEY_ID` | El UUID que generaste en Jibble |
| `JIBBLE_API_KEY_SECRET` | El secret largo de Jibble |
| `JIBBLE_BASE_URL` | `https://workspace.prod.jibble.io/v1` |
| `JIBBLE_TIME_BASE` | `https://time-tracking.prod.jibble.io/v1` |

Click **Deploy**.

## 4️⃣ Listo

En ~1 minuto Vercel te da una URL tipo `https://jibble-plus.vercel.app`.

- Abre esa URL → te pide la contraseña que pusiste en `APP_PASSWORD`.
- La sesión queda guardada en tu navegador (localStorage). En otro dispositivo o ventana incógnita pide login otra vez.

---

## Cambios futuros

Edita los archivos local → `git commit` → `git push`. Vercel re-deploya solo en ~30s.

## Si quieres cambiar la contraseña

Vercel Dashboard → tu proyecto → **Settings → Environment Variables** → editar `APP_PASSWORD` → Save → **Redeploy** (Deployments → último → ⋯ → Redeploy).

Esto invalida tokens viejos en todos los dispositivos automáticamente (hash cambia).
