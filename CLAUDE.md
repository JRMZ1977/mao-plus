# MAO Plus — Codebase Index

MAO Plus is an Electron desktop application for archaeological morphometric analysis of stone tools.
It processes images to extract contours, classify shapes, and compute typological metrics.
Backend: FastAPI (Python 3.9, port 8765). Frontend: Electron + ES6 modules.

## 🎯 Sesión 2026-06-24 — ADR-012 detección monolítica (Fases 1-3 ✅) + fix modo componente

**ADR-012 «detección monolítica»** (`docs/ADR-012-deteccion-monolitica.md`, sin commitear): núcleo de
segmentación **único y canónico = OpenCV `detection.detect()`** (Z-scan+CLAHE+GrabCut+watershed+
confianza); los modos son priors complementarios, no reimplementaciones redundantes. Motor JS
`detectarObjetosHibrido` = **fallback** solo si Python no está.

**Cierre:** los 4 modos (automático, manual de área, IA, manual por componente) comparten el núcleo;
SAM = prior neuronal. **Fase 2 (automático) ya estaba hecha** desde ADR-007/008 (`ejecutarDeteccionAutomatica`
→ `PythonBridge.detection.detect`); mi tabla inicial del ADR la describía mal. **Fase 3 (IA)**: nueva opción
**«Auto (núcleo OpenCV)» por defecto** en el modal (`threshold_method="auto"` → `detect(separate_touching,
include_contours)` + enriquecimiento IA); modos manuales del modal ganan watershed; `detect()` gana flag
aditivo `include_contours`. Cache `mao-ia.js?v=20260624a`. Verif: suite 288/2 + HTTP `/api/mao-ia auto` (200,
conf alta) + 422 inválido.
- **M1**: `detectarObjetosManualRapida` → `async`; enruta el ROI a `PythonBridge.detection.detect(...,
  {separateTouching:true})`, mapea bbox con offset y **hereda confianza** (el manual ya no nace sin
  confianza). Fallback al cuerpo JS intacto (early-return + fall-through). `detectarObjetosEnArea` y
  `ejecutarDeteccionEnAreaManual` ahora async/await. Cache `analysis-core.js?v=20260624g`.
- **M2**: el watershed del núcleo individualiza los pegados → el clic-componente JS queda como
  fallback solo-JS (la etapa de contorno ya era canónica vía `/api/contour`).
- **Fix de bug**: `manejarSeleccionComponente`/`procesarContornoSeleccionado` estaban anidadas por
  error dentro de `aplicarAnalisisMorfometricoAreaManualMejorado` → `ReferenceError` al clicar.
  Des-anidadas a nivel IIFE (cuerpos byte-idénticos).
- **Verificado**: `node -c` OK · suite 288/2 (frontend-only) · `detect()` sobre ROI de fixture →
  bbox local + conf 0.986/alta (python_zscan_competitive). **Pendiente**: runtime Electron (selección
  manual con 2+ pegados → ruta backend+watershed+chips; y fallback con backend muerto). **Caveat**:
  `detect()` filtra dominancia (<20% del mayor) y reordena por relevancia — pensado para imagen
  completa; en ROI manual podría descartar objetos pequeños (fix futuro: flag `roi_mode`).
- **Fase 3 (IA)**: `detection.detect()` gana flag aditivo `include_contours`; `detect_with_mao_ia` añade
  rama `threshold_method=="auto"` (→ núcleo + enriquecimiento IA); modos manuales del modal ganan
  watershed; `/api/mao-ia` valida `"auto"`. **ADR-012 completo** (4 modos en el núcleo, JS=fallback).
  **Pendiente único**: verif. visual del modal IA en Electron (flakiness app:// en frío bloqueó la headless).

## 🎯 Estado de la sesión 2026-06-14 (lote de cierre)

Commits del lote: `526cf42` (ADR-010 E2E hook) · `be20a0e` (webSecurity + cv2 warmup + Resultados organizer + deuda técnica) · `63694bf` (ADR-006).

| Item | Estado | Commit |
|------|--------|--------|
| ADR-010 hook E2E `window.__maoE2E` | ✅ | 526cf42 |
| `webSecurity:true` en ambas ventanas Electron | ✅ | be20a0e |
| Warmup cv2+numpy antes de uvicorn (iCloud) | ✅ | be20a0e |
| `mao-resultados-organizer.js` (pestaña Resultados) | ✅ | be20a0e |
| Deuda técnica: borrar dupes `cargarMetadatos` en utility-helpers | ✅ | be20a0e |
| ADR-006 Fases 1-3: `morphometric_registry.py` + 19 tests + refactor coherencia | ✅ | 63694bf |
| ADR-008 C2 rewrite id compuesto | ⏸ DIFERIDO — riesgo alto | — |

**Suite tras el lote:** 288 passed, 2 skipped. `node -c` limpio. Caché: `analysis-core.js?v=20260614h`.

**Verificación E2E pendiente (requiere npm start matar+relanzar, no Cmd+R):**
`await window.__maoE2E.flujoCompleto('sintetico_escala_objeto_ph.png')` → validar checklist en `docs/ADR-010-hook-verificacion-e2e.md`.

---

## 🎯 Fase Actual: UI Pestañas LAAR — tratamiento completo (ADR-001…005)

> 📋 **Estado consolidado de TODOS los ADR (001–010) → `docs/ESTADO-ADRS.md`** (fuente única
> de verdad: estado real + commit por ADR; reconcilia cabeceras `Estado:` obsoletas de ADR-002/004/005/006).

**Estado:** ✅ **Migración + rediseño por pestaña + armonización transversal COMPLETADOS y verificados en Electron.**
- Fases A-B (infraestructura de pestañas): commit `5bdfb61` (2026-06-08) · fixes runtime + estética: 2026-06-09.
- ADR-001 guards de flujo · ADR-002 Análisis · ADR-003 Proyecto · ADR-004 Captura · **ADR-005 armonización transversal** (lenguaje canónico `.laar-chip`/`.laar-header` + base `window.MaoOrganizer`; cierra el de-rainbow + jerarquía de las 4 pestañas) — 2026-06-11/12.
- Detalle de cada ADR en sus secciones más abajo y en `docs/ADR-00{1..5}-*.md`.

La interfaz pasó del modelo **sidebar-scroll** al de **pestañas de flujo LAAR** (Proyecto → Captura → Análisis → Resultados). Arquitectura **Strangler Fig**: las pestañas y los organizers (`mao-*-organizer.js`) envuelven la navegación existente sin tocar lógica de negocio. Único pendiente transversal: probar el flip de chips con archivos reales (los `<input type=file>` no se pueblan por script).

**Historial detallado de la migración base (A-B) abajo ↓** (se conserva como registro; el estado vigente es el de los ADR).

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

**⚠️ Gotcha de caché:** el CSS `file://` se cachea entre relanzamientos. Al editar un `.css`/`.js` versionado, bump el `?v=` de su `<link>`/`<script>` en `index.html` (al cierre de ADR-005: `mao-tabs-laar.css?v=20260612e`, organizers y base en `?v=20260612e`).

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
.venv/bin/python -m pytest tests/ python/tests/   # Suite completa → 257 passed, 2 skipped
```

**Gotcha — aislamiento del event-loop asyncio (2026-06-12):** los tests sync que ejecutan corrutinas deben usar un **loop propio por llamada** (`asyncio.new_event_loop()` + `close()` en `finally`), nunca `asyncio.get_event_loop().run_until_complete()`. Otros archivos usan `asyncio.run()`, que al salir hace `set_event_loop(None)` y rompe `get_event_loop()` en Py3.9 (`RuntimeError: There is no current event loop` + `coroutine ... was never awaited`) — falla solo en la suite completa, no aislado. Patrón ya aplicado en `python/tests/test_phase4.py` y `test_bajo_contraste.py`. Los `test_bifacial_parity{,_v2}.py` hacen `pytest.skip(allow_module_level=True)` si falta la checkout externa `MAO_A`.

## Modal de detección IA — confianza por objeto + análisis cancelable (2026-06-13)

Dos mejoras sobre la ventana de detección con IA (`#maoIaModal` · `js/mao-ia.js`):

- **#1 Confianza por objeto (lenguaje canónico LAAR · ADR-007).** El endpoint `/api/mao-ia` (`python/modules/mao_ia_analyzer.py`) ahora propaga `detection_confidence` (score ∈ [0,1]) y `confidence_level` (`alta`/`media`/`baja`) por objeto, reusando `detection._confianza_objeto` (import **perezoso** obligatorio: `detection.py` importa `_morpho_from_contour` de `mao_ia_analyzer` a nivel de módulo → el ciclo solo se evita con import diferido dentro de `detect_with_mao_ia`). En el modal: chip `.laar-chip --ok/--none/--wa` en el selector (solo media/baja, compacto), **columna «Confianza»** ordenable en la Tabla, **resumen de chips** en la cabecera de resultados, **filtro de triage** «solo baja confianza», y columnas `Confianza_nivel`/`Confianza_score` en el CSV del modal. Test: `python/tests/test_mao_ia_confidence.py` (3 tests).
- **#3 Cancelar + cronómetro.** El `fetch` pasó de `AbortSignal.timeout(120_000)` fijo a un `AbortController` propio (cancelable) con timeout duro de respaldo de 120 s (`abort('timeout')`). El overlay de progreso muestra **tiempo transcurrido** (cronómetro) y un botón **Cancelar** (`abort('user')`); el `catch` distingue cancelación de usuario, timeout y error real.

**Pendiente de verificación visual en Electron** (lección #1: `node -c`/health no ven layout/CSS): el flip de chips y el orden/filtro/cancelación con una imagen real. Verificado: backend (3 tests nuevos), suite completa (257 passed, 2 skipped) y `node -c`. Caché: `mao-ia.js?v=20260613a` en `index.html`.

## ADR-009 — Detección de P/H como tarea primaria (candidatos a confirmar) (2026-06-13)

Eleva perforaciones/horadaciones de tarea **secundaria/manual** a **primaria**: el backend detecta huecos internos **sin semillas** durante el análisis y los surge como **candidatos a confirmar**. Doc: `docs/ADR-009-deteccion-ph-primaria.md`. Decisiones JFRR: **sugerencias a confirmar** (no alteran métricas hasta confirmar) + **candidato sin tipo** (la profundidad pasante/ciega no es observable en 2D; el usuario asigna perforación/horadación). Aditivo, reversible.

- **Backend (Fase 1).** Antes, `contour.extract` rellenaba los huecos (`MORPH_CLOSE`) y usaba `RETR_EXTERNAL` → los P/H se destruían. Ahora se snapshotea `mask_raw_holes` **antes** del CLOSE y `detection.detect_holes()` (nueva) detecta huecos por **2 señales** sobre la silueta rellena: (1) interior clasificado como fondo (`silueta & ¬máscara`, también sin imagen para tests) y (2) **desviación de color** vs la mediana del cuerpo (`|gray−mediana|>max(25,1.5·std)`, silueta erosionada para excluir el borde) — la (2) capta through-holes **grises** y recesos en sombra que el umbral de blancos no veía. Filtra por área relativa al objeto, descarta huecos pegados al borde del ROI, confianza por hueco (`_confianza_hueco`). `/api/contour` emite `ph_candidates[]` en **coords absolutas** (`tipo:"candidato"`). Si GrabCut reemplazó la máscara, se omite. Tests: `python/tests/test_ph_candidates.py` (8).
- **Flujo (Fase 2).** `analysis-core.js` captura `obj.phCandidatos` en el choke point del contorno (junto a la confianza ADR-008); persistido en el caché. **NO** escribe en `obj.perforaciones`/`horadaciones`. El bloque `/contour` corre **también para objetos IA/SAM** (`_samSegmented`, antes excluidos) solo para capturar candidatos — la adopción del contorno/hull/confianza sigue gateada por `!_samSegmented` (no pisa el contorno IA). `mao-analysis-organizer.js` añade el **4º estado** de `phEstado()`, con prioridad **hallazgos → candidatos → sin-ph → sin-evaluar** (NO usa `evaluado` por encima de candidatos: los objetos IA nacen con `perforaciones:[]`, lo que falseaba `evaluado`). Chip `--wa` «P/H: N candidatas — confirmar» + botón «Revisar P/H».
- **Modal (Fase 3).** `#perforationCanvasModal` precarga los candidatos como sugerencias (ámbar **discontinuo**, etiqueta `?N`) solo si el objeto no fue evaluado. Lista con **Perforación / Horadación / Descartar** por candidato (`confirmarCandidatoPH`/`descartarCandidatoPH`, expuestas en `window`). Al confirmar, el candidato pasa a su tipo y `finalizarTodosTrazados` (que filtra por tipo exacto → candidatos excluidos) lo guarda → el área neta se recalcula con la lógica existente (`calcularAreaEfectivaPH`, **sin cambios**). `sincronizarCandidatosPHEnObjeto()` mantiene `obj.phCandidatos` al día.
- **Telemetría (Fase 4).** `buildMonitorAnalisis` (contrato ADR-008) añade `ph_candidatos_detectados` vs `ph_confirmados`. Cache-bust: `analysis-core.js?v=20260614b`, `mao-analysis-organizer.js?v=20260614b`, `mao-deteccion-contract.js?v=20260613e`.
- **Fixes tras prueba real (2026-06-14).** La 1ª prueba (donut IA con hueco gris) reveló 3 defectos, corregidos: (a) hueco gris no detectado → señal de desviación de color en `detect_holes`; (b) objetos IA/SAM no capturaban candidatos → `/contour` corre también para ellos; (c) chip mostraba «sin P/H» → prioridad `phEstado` recolocada. Verificado por HTTP: gris 195/210/230 y oscuro 60 → detectados; sólido → 0.

**Invariante:** el área neta solo cuenta P/H **confirmados**; la detección automática propone, el humano dispone. **Verificado:** 268 passed/2 skipped, `node -c`, HTTP end-to-end (huecos blancos/grises/oscuros detectados, centroides absolutos exactos, 0 FP en sólido), boot Electron (0 renderer errors). **Pendiente manual:** chip+modal con la imagen real cargada (límite `<input type=file>`).

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

## ADR-001: Guards de Flujo UI (2026-06-09)

Optimización del flujo de pestañas LAAR. **Opción A** del ADR (mínima invasión, reusa el mecanismo `locked/unlock` existente). Solo `js/mao-tab-router.js` — reversible.

### Implementado
- **Guards de prerrequisito**: pestañas `analisis` y `resultados` arrancan `locked: true`. Ya no se puede llegar a Análisis con el panel vacío.
- **Desbloqueo por evento de negocio** (en `bindMaoEvents`):
  - `mao:detection:done` → `unlock('analisis')` (+ `markDone('captura')`). `unlock` va **antes** de `go()` porque `go()` rechaza pestañas bloqueadas.
  - `mao:analysis:done` → `unlock('resultados')` (+ `markDone('analisis')`).
  - El handler legacy `stepCompleted` (`deteccion`/`analisis`) hace los mismos unlocks por consistencia.
- **Re-derivación de guards al restaurar `sessionStorage`** (en `boot`): si `state.done` incluye `captura`/`analisis`, se desbloquea la pestaña siguiente (caso reabrir proyecto avanzado). Si la pestaña activa restaurada quedó bloqueada, cae a la primera desbloqueada vía `firstUnlockedFrom`.
- **Eliminado stub muerto** `mao:scale:set` (listener vacío, evento nunca despachado).

### Deuda técnica conocida (no abordada)
- **F3 — nodo compartido**: `sidebarResultCard` y `sidebarActionsSection` figuran en `sections[]` de `analisis` Y `resultados`. Funciona hoy (status-quo C-γ, riesgo bajo: el nodo es físicamente único tras `relocateOrphanedControls`). El ADR propuso **C-β** (sacarlos de `sections[]` + `position:sticky` para que el resultado quede siempre visible) — **diferido**: es cambio de layout y exige verificación visual en Electron (lección #1: `node -c`/health no ven CSS).
- **F4 — radios hardcoded**: `applyModeVisibility`/`readMode` leen los IDs legacy `objectDimension3D` y `modoBifacial` directamente. Acoplamiento de bajo riesgo (IDs estables). El fix de mayor altitud sería que la nav legacy emita un evento con el modo y el router solo lo escuche (ya existe el listener `mao:object-dimension-changed`).

### ⚠️ Pendiente de verificación visual en Electron
Los guards son lógica pura (verificados con `node -c`), pero el flujo completo arranque→captura→detección→análisis→resultados con desbloqueo progresivo **no se ha corrido en Electron**. Validar con `npm start` (matar+relanzar, no Cmd+R).

## ADR-005: Armonización Transversal de las Pestañas LAAR (2026-06-12)

ADR **ortogonal** a ADR-002/003/004 (que rediseñaron una pestaña cada uno, en sesiones separadas, y al hacerlo derivaron). No rediseña ninguna pestaña: (1) define el **lenguaje canónico compartido** y (2) reconcilia la deriva. La próxima pestaña (Resultados) hereda el lenguaje gratis. Método completo (protocolo de 6 pasos + inventario D1–D5) en `docs/ADR-005-armonizacion-transversal.md`. Decisión JFRR: Doc + Fase 1 + Fase 2, migración **aditiva con alias**. Reversible.

### Lenguaje canónico (el «idioma único»)
- **Chips** `.laar-chip` + `.laar-chip--ok/--wa/--none` (color = **estado real**, no decoración: `wa`=pendiente · `ok`=hecho · `none`=neutro/cero-decidido) + `.laar-chip--lg` (versalita por CSS).
- **Copy** en **sentence case** siempre (no «SIN EVALUAR»); el énfasis mayúscula lo aplica `--lg`, no el string fuente.
- **Cabecera** `.laar-header` (`position:sticky; top:0`).
- Definido en `css/mao-tabs-laar.css`, sección «ADR-005 — CAPA CANÓNICA TRANSVERSAL». Las clases `.adr2-/.adr3-/.adr4-` preexistentes siguen intactas.

### Implementado
| # | Eje | Cambio |
|---|-----|--------|
| **D1** ⚠ | Bug de layout (sticky `top`) | `#adr2Header` y `#adr3ProyectoHeader` usaban `top: calc(topbar+tabbar)` → **duplicaban** el offset (el `body` ya aporta el `padding-top`). Corregido a `top:0` para las **tres** cabeceras. Resuelve la contradicción ADR-003 («top:0 quedaría detrás») vs ADR-004 («top:0 es correcto»): **ADR-004 tenía razón**. |
| **D2** | Familia de chips | `.adr2-chip*` (Análisis) y `.adr3-chip*` (Proyecto/Captura) → canónica `.laar-chip*`. Geometría densa de Análisis preservada con override acotado (`#adr2Header .laar-chip`, `.adr2-ph-card .laar-chip`). |
| **D3** | Copy/mayúsculas | Tarjeta P/H de Análisis «SIN EVALUAR»/«EVALUADO · SIN P/H» → sentence case + `--lg`. |
| **D4** | Helpers JS triplicados | Nuevo `js/mao-organizer-base.js` (`window.MaoOrganizer`: `setChip`/`isVisible`/`readMode`/`modoFlujo`/`toast`/`bootWhenReady`/`log`/`el`/`$`). Los 3 organizers migrados a `MO.*` (~120 líneas de duplicación eliminadas). |
| **D5** | Naming de cabecera | `.laar-header` canónica (para Resultados y adopción futura). |

### ⚠️ Gotcha de carga
`js/mao-organizer-base.js` es **dependencia dura** de los tres organizers: su `<script>` debe ir **antes** que `mao-analysis/proyecto/captura-organizer.js` en `index.html` (ya colocado tras `mao-tab-router.js`). Comentar la base sin comentar los organizers los rompe (`ReferenceError: MaoOrganizer`). Para desactivar una pestaña, comentar **su** organizer, no la base.

### Verificado en Electron (sonda DOM, 2026-06-12)
`MaoOrganizer:true` · `#adr3ProyectoHeader` → `sticky, top:0px, rectTop:70` (justo bajo las barras, = Captura) · chip = `laar-chip laar-chip--ok` (pill 999px, verde) · renderer errors `0`. La base cargó antes que los organizers; D1 confirmado.

### Pendiente
- Flip de chips con **archivos reales** (los `<input type=file>` no se pueblan por script) — mismo límite manual heredado de ADR-003/004.
- `#adr2Header` (Análisis) solo se construye al renderizar un análisis; su `top:0` no se probó en vivo pero usa la regla canónica ya verificada en Proyecto.
