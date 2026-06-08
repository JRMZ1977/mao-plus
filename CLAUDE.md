# MAO Plus — Codebase Index

MAO Plus is an Electron desktop application for archaeological morphometric analysis of stone tools.
It processes images to extract contours, classify shapes, and compute typological metrics.
Backend: FastAPI (Python 3.9, port 8765). Frontend: Electron + ES6 modules.

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
