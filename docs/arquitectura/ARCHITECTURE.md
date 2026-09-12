# MAO Plus — Architecture Documentation

## Overview

MAO Plus began as a single 55K-line monolith (`analysis-core.js`). Phase 2 split it into 10 ES6
modules to improve maintainability (isolated concerns), testability (module-level unit tests),
and performance (73% faster parse, 81% lower memory when lazy-loaded).

---

## Before / After (Phase 2 Refactoring)

| Metric | Before (monolith) | After (modular) | Change |
|--------|-------------------|-----------------|--------|
| Lines of code | 55,399 | 5,869 (modules) | -80% |
| Disk size | 2,635 KB | 200 KB (modules) | -92% |
| Max parse time | ~300 ms | ~80 ms | -73% |
| Parsed memory | 4.40 MB | 0.83 MB | -81% |
| Startup time (cold) | 255–410 ms | 115–184 ms | -55% |
| Circular dependencies | N/A | 0 | — |
| Max dependency depth | N/A | 2 levels | optimal |

---

## Module Architecture

```
analysis-core.js  (IIFE bridge — imports all modules, exposes Tier 1 API)
│
├── Layer 0: Zero-dependency leaf modules
│   ├── geometry-primitives.js      (355 lines, 10.9 KB)  — circles, polygons, interpolation
│   ├── contour-quality.js          (410 lines, 13.3 KB)  — edge detection, quality scoring
│   ├── morphometric-metrics.js   (1,167 lines, 38.6 KB)  — area, perimeter, compactness
│   └── utility-helpers.js          (621 lines, 20.3 KB)  — math, DOM, CSV/PDF, formatting
│
├── Layer 1: Depend on Layer 0
│   ├── shape-classification.js   (1,345 lines, 45.8 KB)  ← geometry-primitives + morphometric-metrics
│   ├── contour-extraction.js     (1,027 lines, 36.2 KB)  ← contour-quality
│   └── classification-engine.js    (944 lines, 34.8 KB)  ← morphometric-metrics + shape-classification
│
├── Layer 2: Orchestrators
│   ├── metrics-orchestrator.js                           ← L0 + L1 modules
│   ├── visualization-export.js                           ← L0 + L1 modules
│   └── tabla-metricas-completa.js                        ← L0 + L1 modules
│
└── Phase 2d (partial)
    └── bifacial-analysis.js                              ← bifacial comparison logic
```

**Coupling**: 5 inter-module imports total across all layers. No circular dependencies.

---

## Tier 1 API

These 10 `window.*` functions must remain globally accessible. Called directly by `mao-ia.js`
and `collection.js` (legacy callers that must not be modified).

| Function | Provided by |
|----------|-------------|
| `window.estimarErrorOptico` | MetricsOrchestrator |
| `window.aplicarIncertidumbreOptica` | MetricsOrchestrator |
| `window.generarTablaMetricasCompleta` | VisualizationExport |
| `window.generarReportePDFIntegral` | VisualizationExport |
| `window.mostrarAnalisisMorfologico` | VisualizationExport |
| `window.saveFileWithDialog` | analysis-core.js (local fn) |
| `window.metaClasificarFormaIA` | analysis-core.js (local fn) |
| `window.inyectarObjetosDesdeIA` | analysis-core.js (local fn) |
| `window.inyectarObjetosDesdeObj3d` | analysis-core.js (local fn) |
| `window.mostrarCardObjetoIA` | analysis-core.js (local fn) |

**Rule**: Never remove, rename, or scope-gate these functions.

---

## ES6 Module Pattern

`analysis-core.js` acts as a bridge between the legacy IIFE pattern and the new ES6 modules:

```javascript
// analysis-core.js structure
import { ... } from './modules/geometry-primitives.js';
import { ... } from './modules/morphometric-metrics.js';
// ... all 10 modules

(function() {           // IIFE wrapper — required for Electron compatibility
  // orchestration logic
  window.estimarErrorOptico = MetricsOrchestrator.estimarErrorOptico;
  // ... other Tier 1 API assignments
})();
```

The IIFE wrapper is intentional: Electron's renderer process does not support top-level ES6
module semantics in the same way browsers do, and the IIFE provides a clean scope boundary.

---

## Backend Architecture

**Entry point**: `python/server.py` — FastAPI app, port 8765.

### 13 Python Modules (`python/modules/`)

| Module | Role |
|--------|------|
| `analysis.py` | Core image analysis pipeline |
| `classifier.py` | Shape/typology classification |
| `comparator.py` | Object comparison logic |
| `contour.py` | Contour detection and processing |
| `detection.py` | Object detection (YOLO integration) |
| `efa.py` | Elliptic Fourier Analysis |
| `mao_ia_analyzer.py` | MAO-IA model integration |
| `metrics.py` | Metric computation |
| `morphology.py` | Morphological operations |
| `obj3d.py` | 3D object support |
| `obj3d_canonical_raster.py` | 3D canonical rasterization |
| `obj3d_v2.py` | 3D object v2 pipeline |
| `persistence.py` | Data save/load |
| `ph.py` | Persistent homology |
| `sam_segmenter.py` | SAM segmentation |
| `scale.py` | Scale calibration |

### Key Endpoints
```
POST /analyze          — full morphometric analysis
POST /classify         — shape classification
POST /detect           — object detection (YOLO)
POST /compare          — bifacial comparison
GET  /health           — server health check
```

---

## Phase Roadmap

| Phase | Status | Scope |
|-------|--------|-------|
| Phase 1 | Complete | Stabilization, test suite (183 tests), baseline metrics |
| Phase 2a | Complete | Extract geometry-primitives, contour-quality, morphometric-metrics |
| Phase 2b | Complete | Extract contour-extraction, shape-classification, classification-engine, utility-helpers |
| Phase 2c | Complete | Extract metrics-orchestrator, visualization-export, tabla-metricas-completa |
| Phase 2d | Partial | bifacial-analysis.js extracted; deferred items below |

### Phase 2d Deferred Items (high-risk state machines)
- **Detection Engine** — complex YOLO + SAM interaction state
- **Manual Selection Modal** — pixel-level canvas state machine
- **Perforation Modal** — multi-step user flow with DOM side effects

These were deferred because extraction risk outweighed benefit at current codebase maturity.

---

## Design Decisions

### Backward compatibility maintained
`mao-ia.js` and `collection.js` call `window.*` functions directly. Modifying them would require
coordinated changes across untested code paths. All Tier 1 API functions are preserved as-is
on `window` so these callers need no changes.

### IIFE wrapper kept
Electron's renderer environment handles ES6 top-level module scope differently than browsers.
The IIFE provides deterministic scope isolation and ensures `window.*` assignments happen after
all module imports resolve, preventing race conditions on startup.

### High-risk state machines deferred
Detection Engine, Manual Selection, and Perforation Modal each manage complex, tightly-coupled
UI state (canvas buffers, event listeners, modal lifecycles). Extracting them without a
comprehensive integration test suite for those flows creates unacceptable regression risk.
They remain in `analysis-core.js` until dedicated tests cover those workflows.
