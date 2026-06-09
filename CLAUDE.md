# MAO Plus — Codebase Index

MAO Plus is an Electron desktop application for archaeological morphometric analysis of stone tools.
It processes images to extract contours, classify shapes, and compute typological metrics.
Backend: FastAPI (Python 3.9, port 8765). Frontend: Electron + ES6 modules.

## 🎯 Fase Actual: Migración UI Pestañas LAAR

**Estado:** ✅ **Fases A-B + fixes de runtime + estética COMPLETADAS** (Fases A-B: commit `5bdfb61`, 2026-06-08 · fixes runtime + estética: 2026-06-09, verificados visualmente en Electron)

La interfaz está en transición del modelo **sidebar-scroll** al modelo de **pestañas de flujo LAAR** (Proyecto → Captura → Análisis → Resultados). Arquitectura **Strangler Fig**: las pestañas envuelven la navegación existente sin tocar lógica de negocio.

**Implementado (A-B):**
- A3: API DOM nativa (compatible CSP `script-src 'self'`)
- A4: Persistencia de estado con sessionStorage
- A5: Guard HMR en buildTabBar()
- B1: contextBridge para maoTabRouter
- B2: BrowserWindow: `titleBarStyle: 'hiddenInset'` (conserva semáforos macOS), zoom deshabilitado
- B3: Meta CSP en index.html
- B4: `-webkit-app-region: drag` para arrastre nativo

**Fixes de runtime (2026-06-09)** — bugs que `node -c` y health check NO detectan, solo runtime visual:
- El tabbar se construía pero quedaba **oculto bajo el header fijo** (`#maoHeader` z9000 vs tabbar z10, ambos en y=0). Fix: `body { padding-top: var(--laar-topbar-h) }` en `mao-tabs-laar.css` (la regla previa `body,html{padding:0}` anulaba la compensación del header de `main.css`).
- El contenido de la pestaña activa quedaba en `display:none`: la nav legacy (`sidebar-nav.js`/`object-dimension-mode.js`) oculta secciones con `.mao-panel--hidden` (`!important`) y corre EN `DOMContentLoaded`, DESPUÉS del router (`defer`). Fix: el router ahora usa esa misma clase autoritativa (`setSectionVisible`) y re-afirma la pestaña activa en un listener `DOMContentLoaded` registrado en boot (corre último).

**Estética LAAR (2026-06-09)** — extendida del tabbar a los componentes en `mao-tabs-laar.css` (sección "ESTÉTICA LAAR — COMPONENTES", acotada a `.mao-main`, reversible): fieldsets/tarjetas planos (radio 4px, borde 0.5px, sin sombra), botones (secundario blanco + acento único azul para primarias; rojo/ámbar semánticos), tabs legacy CMO (anti-arcoíris) y bifacial. Pendiente verificar CMO/bifacial con datos reales; inputs/selects fuera de esta pasada.

**⚠️ Gotcha de caché:** el CSS `file://` se cachea entre relanzamientos. Al editar un `.css`, bump el `?v=` de su `<link>` en `index.html` (mao-tabs-laar.css ya está versionado: `?v=20260609b`).

## Tech Stack
- **Electron** (main.js + preload.js) — desktop shell
- **Node.js** — build/tooling (`npm start` launches app)
- **FastAPI** (python/server.py, port 8765) — analysis backend
- **Python 3.9** — all image processing and ML inference
- **ES6 modules** — frontend logic (Phase 2 refactoring complete)

## Key Directories

| Path | Contents |
|------|----------|
| `js/` | Frontend JS — main app logic, UI orchestration |
| `js/modules/` | 10 ES6 modules (Phase 2 refactoring output) |
| `python/` | FastAPI server + 13 analysis modules |
| `python/modules/` | Python analysis modules (analysis, metrics, contour, etc.) |
| `tests/` | 183 Python tests (pytest), 1 skipped |
| `docs/` | Technical documentation |

## Entry Points
- **Frontend**: `js/analysis-core.js` — IIFE bridge + Tier 1 API (imports all ES6 modules)
- **Backend**: `python/server.py` — FastAPI app, starts on port 8765
- **Electron**: `main.js` — launches Electron window + spawns Python server

## Critical Constraint: Tier 1 API
Ten `window.*` functions must remain globally accessible at all times.
They are called directly by `mao-ia.js` and `collection.js` (unchanged legacy callers).
Never remove, rename, or scope-gate these functions. See ARCHITECTURE.md for the full list.

## Module Dependency Order (load/import sequence)

```
Layer 0 (zero deps):   geometry-primitives, contour-quality, morphometric-metrics, utility-helpers
Layer 1 (dep on L0):   shape-classification, contour-extraction, classification-engine
Layer 2 (orchestrate): metrics-orchestrator, visualization-export, tabla-metricas-completa
Phase 2d:              bifacial-analysis
```

## Run & Test
```bash
npm start                                    # Launch Electron app + Python server
.venv/bin/python -m pytest tests/            # Run 183 tests (1 skipped)
```

## Skills for Validation & Error Detection

### mao-launch (Pre-flight Checks)
Validates startup integrity before runtime:
- ✅ ESM syntax check (11 modules via `node -c`)
- ✅ Electron launch success
- ✅ Main process log analysis (0 critical errors)
- ✅ Backend health check (`/api/health` HTTP 200)
- ✅ Tier 1 API completeness (10/10 functions)

**Use case**: After code changes, before full app launch, to catch parse-time errors early.

### mao-console-analyzer v2 (Runtime Error Detection)
Monitors and captures runtime errors via IPC:
- ✅ Renderer error capture (via `window.addEventListener('error')` + IPC)
- ✅ Main process log analysis
- ✅ Error categorization & root cause analysis
- ✅ Auto-correction proposals

**Improvements in v2**:
- Added IPC-based renderer error capture (not just console.log)
- Captures ReferenceError, TypeError, unhandledRejection
- Writes to `/tmp/.mao_renderer_errors.log` for persistence
- Exposes `window.rendererErrors` API for manual inspection

**Use case**: Post-launch monitoring to detect runtime failures (scope loss, missing globals).

## Phase 4-5: Boot Metrics & Resilience

### Boot Metrics Instrumentation
Added comprehensive timestamp tracking for performance validation:
- `bootMetrics` object in main.js tracks: t_electron_ready, t_python_spawn, t_python_health_ok, t_window_created
- `analysis-core.js` init() reports: t_init_duration, t_total_boot
- Metrics sent via IPC to main process and logged: `[METRICS] {...}`
- Result: **2831ms average boot time**, 6.7% variability (< 10% threshold)

### Resilience Features
Validated in Phase 5 Evaluation:
1. **Watchdog recovery** — Backend auto-restart on health check failure (4s recovery time)
2. **Python fallback** — App continues in JS-only mode if Python unavailable
3. **Module error handling** — App doesn't boot loop if Python module fails
4. **Port conflict resolution** — Kills conflicting process, relaunches backend

**Bug fixed during evaluation** (pre-existing):
- Auto-restart condition: Changed `code !== 0 && code !== null` → `code !== 0`
- Reason: Process death via signal sets `code = null`, preventing restart

## Working Rules
- **Methodical execution** over diagnostic-generated plans — verify each step before the next.
- **No unnecessary exploration** — read specific files, not whole directories.
- **Preserve backward compatibility** — mao-ia.js and collection.js must not require changes.
- **IIFE wrapper is intentional** — required for Electron + ES6 module compatibility.
- High-risk state machines (Detection Engine, Manual Selection, Perforation Modal) are deferred.

## Lessons Learned: Safe ES6 Module Factorization

**Problem Discovered** (Phases 1-3 Evaluation):
When extracting utility-helpers.js as an ES6 module, the module lost access to **14 global variables** from the IIFE, causing a cascading ReferenceError pattern:
- Canvas state: `zoom` (30 refs), `offsetX`, `offsetY`, `image`, `canvas`
- DOM elements: `statusDiv`, `objectCountDisplay`, `zoomInput`, `zoomLevelDisplay`
- Data collections: `objects`, `lastDetectionStats`, `contourCache`
- Configuration: `PERFORMANCE_CONFIG`, `DEBUG_LOGS`

**Solution: viewState Pattern** (commits 8fc595a + 53392fa)
1. **Create centralized state object**: `viewState = { zoom, offsetX, ..., objects, ... }`
2. **Expose initialization function**: `initializeViewState(stateObject)` — called from analysis-core.js
3. **Update all extracted functions** to use `viewState.*` instead of bare globals
4. **Add null-safety checks**: `if (!viewState.element)` before accessing
5. **Pass callbacks explicitly**: Functions like `redraw()` passed as `viewState.redraw`

**Example Pattern**:
```javascript
// In utility-helpers.js
let viewState = { zoom: 0.5, offsetX: 0, image: null, ... };

export function initializeViewState(state) {
  viewState = { ...viewState, ...state };
}

export function canvasToImageCoords(x, y) {
  if (!viewState.image) return { x: 0, y: 0 };
  const zoom = viewState.zoom; // Use viewState
  // ... rest of logic
}
```

**Key Takeaways**:
- ✅ **ALWAYS pass globals as parameters** when extracting to modules
- ✅ **Create state synchronization layer** for complex interdependent functions
- ✅ **Validate at module boundary** with null/undefined checks
- ✅ **Test post-extraction** with skills: mao-launch (pre-flight) + mao-console-analyzer (runtime)
- ✅ **Use 5-phase evaluation** if uncertain: Static, Pre-flight, Runtime, Metrics, Resilience

**Prevention**:
- Use `mao-launch` skill for pre-extraction validation (SyntaxError, Tier 1 API, backend)
- Use `mao-console-analyzer` skill for post-extraction runtime monitoring (ReferenceError, TypeError)
- Extract one module at a time, validate before proceeding
- Document global dependencies in module header (see utility-helpers.js lines 1-25)

## Migración LAAR — Fases A-B Completadas (2026-06-08)

### Cambios Implementados

| Fase | Actividad | Archivo | Cambios |
|------|-----------|---------|---------|
| A3 | innerHTML → API DOM nativa | `js/mao-tab-router.js` | CSP-compatible (sin dynamic HTML) |
| A4 | sessionStorage persistence | `js/mao-tab-router.js` | Estado sobrevive `Ctrl+R` |
| A5 | HMR-safe guard | `js/mao-tab-router.js` | Eliminación explícita previo rebuild |
| B1 | contextBridge maoTabRouter | `preload.js` | Exposición segura del API |
| B2 | Electron BrowserWindow | `main.js` | `titleBarStyle: 'hiddenInset'`, zoom disabled |
| B3 | Meta CSP | `index.html` | `default-src 'self'` |
| B4 | webkit-app-region | `css/mao-tabs-laar.css` | Arrastre nativo macOS/Windows |

**Archivos clave:**
- `js/mao-tab-router.js` — LAAR tab router + state management + `setSectionVisible` (clase autoritativa `.mao-panel--hidden`)
- `css/mao-tabs-laar.css` — Design tokens LAAR + layout tabbar + sección "ESTÉTICA LAAR — COMPONENTES"
- `main.js` — BrowserWindow config (`titleBarStyle: 'hiddenInset'`, zoom)
- `preload.js` — contextBridge API exposure
- `index.html` — CSP meta + script/css links (con `?v=` cache-busting)

### Reversibilidad
Comentar 2 líneas en `index.html` restaura sidebar original:
```html
<!-- <link rel="stylesheet" href="css/mao-tabs-laar.css"> -->
<!-- <script src="js/mao-tab-router.js" defer></script>   -->
```

### Próximas Fases (Opcionales)
- **C1**: sessionStorage validation en flujo (detection:done, analysis:done)
- **C2**: HMR testing con Vite
- **C3**: Font fallback para Linux
- **D1-D4**: DevTools validation checklist

## Migración LAAR — Fixes de Runtime + Estética (2026-06-09)

Verificado lanzando la app real en Electron (no solo `node -c`/health). Las pestañas ahora se ven y funcionan, y la estética LAAR se extendió a los componentes.

### Cambios

| # | Problema | Archivo | Fix |
|---|----------|---------|-----|
| R1 | Tabbar oculto bajo el header fijo (`#maoHeader` z9000 vs tabbar z10, ambos y=0) | `css/mao-tabs-laar.css` | `body { padding-top: var(--laar-topbar-h) }` (la regla previa `body,html{padding:0}` anulaba la compensación de `main.css`) |
| R2 | Secciones de la pestaña activa en `display:none` por la nav legacy (`.mao-panel--hidden !important`, corre en DOMContentLoaded tras el router `defer`) | `js/mao-tab-router.js` | `setSectionVisible` usa la clase autoritativa; re-afirmado en listener `DOMContentLoaded` registrado en boot (corre último) |
| E1 | Estética LAAR solo en tabbar/topbar | `css/mao-tabs-laar.css` | Sección "ESTÉTICA LAAR — COMPONENTES" (`.mao-main`): fieldsets/tarjetas planos, botones (secundario blanco + azul primario, rojo/ámbar), tabs CMO/bifacial |
| E2 | Botones estilizados por ID en `main.css` (especificidad 1,0,0) | `css/mao-tabs-laar.css` | `!important` en la capa override (main.css no usa `!important` en botones) |

### Lecciones
- **Validar pestañas/CSS exige runtime visual o inspección del DOM**, no basta con `node -c` + health check (no ven layout/CSS).
- **Caché de CSS `file://`**: bump `?v=` en `index.html` al editar cualquier `.css`, o el cambio no se ve al relanzar.
- **Inspección de DOM/CSS en runtime fiable**: `mainWindow.webContents.executeJavaScript(...)` desde `main.js` volcando a stdout (la consola de DevTools acoplada queda cortada).

### Reversibilidad
Comentar el `<link>` de `mao-tabs-laar.css` (incl. la estética) y el `<script>` del router en `index.html` restaura el sidebar + estilo "cuaderno de campo" originales.

## Fix: Carga de Imagen + Metadatos EXIF + CR3 (2026-06-09)

Verificado en Electron. Problema reportado: "al cargar la imagen no se carga y no lee los metadatos".

### Causa Raíz

Dos bugs independientes en `js/analysis-core.js`:

**Bug 1 — scope IIFE vs módulo ES6 (JPG + RAW)**
`UtilityHelpers.procesarMetadatos()` y `UtilityHelpers.cargarMetadatos()` son funciones exportadas desde `utility-helpers.js`. Esa versión del módulo referencia `cameraModelInput`, `focalInput`, `apertureInput`, `sensorWidthInput`, `sensorHeightInput` y `sensorSizes` como variables sueltas — pero esas variables viven dentro del IIFE de `analysis-core.js`, no en el scope del módulo ni en `window`. Resultado: `ReferenceError` silencioso capturado por el `try/catch` del handler, que:
- Dejaba los campos de cámara vacíos
- No actualizaba el estado (`actualizarEstadoProcesamiento()` nunca corría)
- El status quedaba "MAO listo. Cargue una imagen..."

Existen versiones locales correctas en el mismo IIFE: `cargarMetadatos()` (línea ~13245) y `procesarMetadatos()` (línea ~13341) que sí tienen acceso a todo el scope.

**Bug 2 — CR3 no soportado por exifr.js**
`exifr.js` (full.umd.js v7.1.3) no implementa el parser CR3 de Canon (formato ISOBMFF/`ftyp crx`). `exifr.parse()` lanza "Unknown file format". El error no era manejado: el RAW CR3 no quedaba registrado y el flujo se cortaba.

### Fix Aplicado

| # | Llamada anterior | Llamada corregida | Afecta |
|---|-----------------|-------------------|--------|
| 1 | `UtilityHelpers.cargarMetadatos(file)` | `cargarMetadatos(file)` | JPG handler |
| 2 | `UtilityHelpers.procesarMetadatos(exifData, false)` | `procesarMetadatos(exifData, false)` | JPG handler |
| 3 | `UtilityHelpers.cargarMetadatos(file)` | `cargarMetadatos(file)` | RAW handler |
| 4 | `UtilityHelpers.procesarMetadatos(exifData, true)` | `procesarMetadatos(exifData, true)` | RAW handler |
| 5 | `UtilityHelpers.cargarMetadatos(file)` | `cargarMetadatos(file)` | bifacial JPG cara A/B |
| 6 | `UtilityHelpers.cargarMetadatos(file)` | `cargarMetadatos(file)` | bifacial RAW cara A/B |
| 7 | `UtilityHelpers.procesarMetadatos(metadatos, ...)` | `procesarMetadatos(metadatos, ...)` | bifacial handler |

**CR3 graceful**: En los handlers RAW (monofacial y bifacial), `cargarMetadatos` ahora está envuelto en su propio try-catch. Si el error es "Unknown file format" / "sin metadatos EXIF" / "vacíos o no legibles", el archivo queda registrado con `metadatos: null` y muestra: _"Archivo CR3 cargado. Metadatos no disponibles — ingrese focal, sensor y apertura manualmente."_

### Resultado Verificado (Electron)
- ✅ JPG carga, canvas muestra imagen, campos de cámara se pueblan desde EXIF (CANON EOS R8, focal 100mm, f/8, sensor 35.9×23.9mm)
- ✅ CR3 se registra sin crash; advertencia clara en status y consola
- ✅ Modo híbrido JPG+RAW activo: "Listo para calcular escala híbrida JPG+RAW"

### Gotcha Permanente: funciones duplicadas en analysis-core.js vs utility-helpers.js
`utility-helpers.js` contiene versiones de `cargarMetadatos` y `procesarMetadatos` que **NO funcionan** desde el módulo porque usan variables del IIFE. Las funciones locales del IIFE (sin prefijo `UtilityHelpers.`) son las correctas. No usar `UtilityHelpers.cargarMetadatos` ni `UtilityHelpers.procesarMetadatos` desde dentro del IIFE.
