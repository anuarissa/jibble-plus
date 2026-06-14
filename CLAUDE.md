# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Token-Saving Rules (HARD RULES — siempre activas)

1. **No programar sin contexto.** Antes de escribir codigo: lee los archivos relevantes y entiende la arquitectura. Si no tienes contexto suficiente, pregunta. No asumas.
3. **No reescribir archivos completos.** Usa Edit (reemplazo parcial), NUNCA Write para archivos existentes salvo que el cambio sea >80% del archivo. Cambia solo lo necesario. No "limpies" codigo alrededor del cambio.
5. **Validar antes de declarar hecho.** Despues de un cambio: compila, corre tests, o verifica que funciona. Nunca digas "listo" sin evidencia de que funciona.
6. **Cero charla aduladora.** No digas "Excelente pregunta", "Gran idea", "Perfecto", etc. No halagues al usuario. Ve directo al trabajo.
11. **Paralelizar tool calls.** Si necesitas leer 3 archivos independientes, lee los 3 en un solo mensaje, no uno por uno. Menos roundtrips = menos tokens.
13. **No usar Agent cuando Grep/Read basta.** Agent duplica todo el contexto en un subproceso. Solo usalo para busquedas amplias o tareas complejas. Para buscar una funcion o archivo especifico, usa Grep o Glob directo.

## Always Do First
- **Invoke the `frontend-design` skill** before writing any frontend code, every session, no exceptions.
- **Leer `C:\Users\Anuar\OneDrive\Anuar\Claude-Knowledge\README.md`** al inicio de cada sesión. Cargar el `.md` del proyecto activo desde `proyectos/` y revisar `preferencias/`. Actualizar esos archivos cada vez que se aprenda algo nuevo (decisiones, gotchas, referencias externas). Esa carpeta es la memoria persistente entre sesiones y entre dispositivos (sincronizada por OneDrive).

## Reference Images
- If a reference image is provided: match layout, spacing, typography, and color exactly. Swap in placeholder content (images via `https://placehold.co/`, generic copy). Do not improve or add to the design.
- If no reference image: design from scratch with high craft (see guardrails below).
- Screenshot your output, compare against reference, fix mismatches, re-screenshot. Do at least 2 comparison rounds. Stop only when no visible differences remain or user says so.

## Local Server
- **Always serve on localhost** — never screenshot a `file:///` URL.
- Start the dev server: `node serve.mjs` (serves the project root at `http://localhost:3000`)
- `serve.mjs` lives in the project root. Start it in the background before taking any screenshots.
- If the server is already running, do not start a second instance.

## Screenshot Workflow
- Puppeteer is installed at `C:/Users/Anuar/AppData/Local/Temp/puppeteer-test/`. Chrome cache is at `C:/Users/Anuar/.cache/puppeteer/`.
- **Always screenshot from localhost:** `node screenshot.mjs http://localhost:3000`
- Screenshots are saved automatically to `./temporary screenshots/screenshot-N.png` (auto-incremented, never overwritten).
- Optional label suffix: `node screenshot.mjs http://localhost:3000 label` → saves as `screenshot-N-label.png`
- `screenshot.mjs` lives in the project root. Use it as-is.
- After screenshotting, read the PNG from `temporary screenshots/` with the Read tool — Claude can see and analyze the image directly.
- When comparing, be specific: "heading is 32px but reference shows ~24px", "card gap is 16px but should be 24px"
- Check: spacing/padding, font size/weight/line-height, colors (exact hex), alignment, border-radius, shadows, image sizing

## Output Defaults
- Single `index.html` file, all styles inline, unless user says otherwise
- Tailwind CSS via CDN: `<script src="https://cdn.tailwindcss.com"></script>`
- Placeholder images: `https://placehold.co/WIDTHxHEIGHT`
- Mobile-first responsive
- Test at: 320px (mobile), 768px (tablet), 1024px (laptop), 1440px (desktop)

## Brand Assets
- Always check the `brand_assets/` folder before designing. It may contain logos, color guides, style guides, or images.
- If assets exist there, use them. Do not use placeholders where real assets are available.
- If a logo is present, use it. If a color palette is defined, use those exact values — do not invent brand colors.

## Anti-Generic Guardrails
- **Colors:** Never use default Tailwind palette (indigo-500, blue-600, etc.). Pick a custom brand color and derive from it.
- **Typography:** Never use the same font for headings and body. Never default to Inter, Roboto, Arial, or Space Grotesk. Pair a display/serif with a clean sans via Google Fonts. Apply tight tracking (`-0.03em`) on large headings, generous line-height (`1.7`) on body.
- **Shadows:** Never use flat `shadow-md`. Use layered, color-tinted shadows with low opacity.
- **Gradients:** Layer multiple radial gradients. Add grain/texture via SVG noise filter for depth.
- **Animations:** Only animate `transform` and `opacity`. Never `transition-all`. Use spring-style easing.
- **Interactive states:** Every clickable element needs hover, focus-visible, and active states. No exceptions.
- **Images:** Add a gradient overlay (`bg-gradient-to-t from-black/60`) and a color treatment layer with `mix-blend-multiply`.
- **Spacing:** Use intentional, consistent spacing tokens — not random Tailwind steps.
- **Depth:** Surfaces should have a layering system (base → elevated → floating), not all sit at the same z-plane.
- **Backgrounds:** Never default to plain solid colors — use gradient meshes, noise textures, or geometric patterns.

## Hard Rules
- Do not add sections, features, or content not in the reference
- Do not "improve" a reference design — match it
- Do not stop after one screenshot pass
- Do not use `transition-all`
- Do not use default Tailwind blue/indigo as primary color

## CDN Quick Reference

```html
<!-- Tailwind CSS -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- Google Fonts (example pairing) -->
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">

<!-- Lucide Icons -->
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>

<!-- Alpine.js (lightweight interactivity) -->
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>

<!-- GSAP (advanced animations) -->
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/ScrollTrigger.min.js"></script>
```

## Active Projects

- **Sistema de Gestión de Inventario Pro** — Restaurant inventory management app. Spec in `Sistema de Gestión de Inventario.MD`. Stack: Next.js (App Router), Tailwind CSS, Supabase, Lucide React.
