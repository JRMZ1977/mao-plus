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

## Working Rules
- **Methodical execution** over diagnostic-generated plans — verify each step before the next.
- **No unnecessary exploration** — read specific files, not whole directories.
- **Preserve backward compatibility** — mao-ia.js and collection.js must not require changes.
- **IIFE wrapper is intentional** — required for Electron + ES6 module compatibility.
- High-risk state machines (Detection Engine, Manual Selection, Perforation Modal) are deferred.
