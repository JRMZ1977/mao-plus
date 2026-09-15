# MAO Plus — Bifacial Morphometric Analysis Platform

**Version:** 1.2.0  
**Last Updated:** 2026-06-07  
**Status:** Production-Ready

---

## Overview

MAO Plus is a desktop application (Electron + FastAPI) for **bilateral morphometric analysis** of archaeological stone tool bifacial surfaces. It measures symmetry indices, morphometric properties, and provides statistical comparison across multiple objects.

---

## Quick Start

### Prerequisites

- **Node.js** 16+ (Electron runtime)
- **Python** 3.9+
- Virtual environment (`.venv`)

### Installation

```bash
# Clone or navigate to workspace
cd "/Users/juanramirez/Documents/MAO PLUS_PY_01"

# Install Python dependencies
source .venv/bin/activate
pip install -r requirements.txt

# Install Node dependencies
npm install

# Start development server
npm start
```

The application launches at `http://localhost:3000` (Electron) with backend at `http://localhost:8000` (FastAPI).

> **Phase 2 note:** `js/analysis-core.js` no longer contains the analysis logic directly — it delegates to ES6 modules in `js/modules/`. See [MODULES.md](docs/arquitectura/MODULES.md) for the full module reference.

### Lanzador de desarrollo (macOS · icono/Dock)

Para arrancar la app sin abrir una terminal, se compila un applet **dentro del propio repositorio**:

```bash
npm run launcher      # → "MAO Plus (dev).app" en la raíz del repo
open "MAO Plus (dev).app"
```

Fuente: [`scripts/mao-dev-launcher.applescript`](scripts/mao-dev-launcher.applescript) (versionada; el
`.app` compilado está en `.gitignore`). El applet **se auto-localiza** —deduce el repositorio del
directorio que lo contiene—, así que mover o clonar el proyecto no lo rompe. Antes de lanzar comprueba
`node_modules/.bin/electron` y `.venv/bin/python`, y avisa con un diálogo indicando el comando exacto
que falta. Log de arranque: `/tmp/mao_launch.log`.

**Selector de copia de trabajo.** Si el proyecto tiene git worktrees en `.claude/worktrees/` (ramas en
paralelo), el applet los detecta y pregunta cuál arrancar, mostrando la rama de cada copia y marcando
las que aún no tienen dependencias instaladas:

```
principal — fix/exportaciones-fuente-unica-estado
worktree quizzical-cannon-452596 — claude/detection-optical-error-improvements   [faltan dependencias]
```

Con una sola copia arranca directo, sin preguntar. **No hay que recompilar el applet al cambiar el
código de la app**: es una lámina fina que ejecuta `electron .` contra la copia elegida, así que
siempre corre el árbol al día. Solo se recompila (`npm run launcher`) si se edita el `.applescript`.

Un worktree recién creado no hereda `node_modules` ni `.venv` del principal: hay que instalarlos
**dentro** de esa copia, y el diálogo indica la ruta exacta.

Arrástralo al Dock para anclarlo. Es un lanzador de **desarrollo** (corre el código del repo); para un
bundle autónomo, ver *Build & Distribution* abajo.

---

## Build & Distribution (macOS · Fase A)

El DMG distribuible **embebe su propio Python** (CPython relocatable + deps de runtime), por lo que
funciona en un Mac que nunca instaló Python. Decisiones congeladas (2026-06-22): **solo arm64** (Apple
Silicon) y **firma ad-hoc sin notarización**. Plan completo: [docs/PLAN-FASE-A-DISTRIBUCION.md](docs/PLAN-FASE-A-DISTRIBUCION.md).

### Construir el DMG (dos pasos)

```bash
# 1. Construir el runtime Python embebible (~432 MB): descarga CPython relocatable,
#    instala requirements-runtime.txt y poda lo no usado (torch/polars/etc.). → ./runtime/
bash scripts/build-runtime.sh

# 2. Empaquetar la app + runtime en un DMG arm64. → dist/MAO Plus-<versión>-arm64.dmg
npm run package
```

`runtime/` está gitignored (se regenera con el script). En **dev** (`npm start`) la app sigue usando el
`.venv` del repo; el runtime embebido solo se usa cuando `app.isPackaged` (ver `main.js` → `PYTHON_BIN`).

### Primer arranque en un Mac de destino (Gatekeeper)

Como el DMG **no está notarizado**, macOS lo marca en cuarentena al descargarlo. El usuario debe, **una
sola vez**:

- **Opción A (recomendada):** clic derecho sobre `MAO Plus.app` → **Abrir** → confirmar en el diálogo.
- **Opción B (terminal):** `xattr -dr com.apple.quarantine "/Applications/MAO Plus.app"`

Tras eso abre normalmente. (Si en el futuro hay Apple Developer ID, se reactiva `hardenedRuntime` +
entitlements + notarización en `package.json` y este paso desaparece.)

### Entorno de desarrollo fuera de iCloud

El repo en `~/Documents` queda bajo iCloud, que **evicta `cv2.abi3.so`** de forma intermitente y tumba
el backend en dev. Recomendado: mantener el checkout de desarrollo **fuera de iCloud** (p. ej.
`~/Developer/MAO_PLUS_PY_01`). Esto **no afecta al DMG** (que lleva su propio runtime), solo a la
ergonomía de desarrollo.

---

## Core Features

### 1. **Morphometric Analysis**
- Automatic contour extraction
- Measurement of area, perimeter, circularity, convexity, solidity, elongation
- Centroid and major axis detection
- Scale calibration (manual/optical)

### 2. **Bilateral Symmetry**
- **Legacy:** `indiceSimetriaGeneral` [0,1]
- **Extended:** Congruence Index (CI) + Cumulative Morphometric Score (CMS)
- Spatial alignment metrics
- Perforation/horadación analysis

### 3. **Statistical Comparison**
- Principal Component Analysis (PCA)
- Pairwise statistics
- Multi-object collections
- Export to PDF/JSON

### 4. **Data Persistence**
- Project management
- Collection indexing
- Metadata tracking
- Traceability logging

---

## Documentation

### For Developers

- **[ADR status](docs/ESTADO-ADRS.md)** ⭐ **Start here** — every architecture decision and its real implementation state
- **[ARCHITECTURE.md](docs/arquitectura/ARCHITECTURE.md)** and **[MODULES.md](docs/arquitectura/MODULES.md)** — system and module reference
- **[FORMULAS_METRICAS_MAO.html](docs/guias/FORMULAS_METRICAS_MAO.html)** — metric formulas specification

### For Users

- See `index.html` for web UI documentation
- Embedded tooltips explain each feature

---

## API Endpoints

### Core Metrics

- `GET /api/health` — Service status and schema version
- `POST /api/metrics` — Extract morphometric measures from contour
- `POST /api/ph_metrics` — Analyze perforations/horadaciones
- `POST /api/bifacial` — Bilateral symmetry comparison
- `POST /api/scale` — Calibration and unit conversion

### Analysis

- `POST /api/pca` — Principal component analysis
- `POST /api/statistics` — Summary statistics

**Full endpoint docs:** See `python/server.py` docstrings or swagger (if enabled).

---

## Data Format

### Example: `/api/bifacial` Response

```json
{
  "indiceSimetriaGeneral": 0.876,
  "interpretacionSimetria": "Muy similar",
  "simetriaArea": 0.971,
  "simetriaPerimetro": 0.974,
  "coherenciaPromedio": 0.88,
  "CI": 0.910,
  "CMS": 0.893,
  "subindicesCMS": {
    "area": 0.971,
    "perimeter": 0.974,
    "shape": 0.780
  },
  "interpretacionCI_CMS": "Muy similares"
}
```

(Fields `CI`, `CMS`, `subindicesCMS`, `interpretacionCI_CMS` appear only if `MAO_ENABLE_CI_CMS=1`)

---

## Environment Flags

### Enable Extended Bilateral Indices

```bash
export MAO_ENABLE_CI_CMS=1
npm start
```

When enabled, endpoints return extended bilateral metrics (CI, CMS). Default: disabled (legacy mode only).

---

## Phase 2 Modular Architecture

Phase 2 (completed 2026-06-07) refactored the frontend analysis code from a single monolithic file into 10 focused ES6 modules.

- **What changed:** `js/analysis-core.js` was split into `js/modules/` — 10 modules covering geometry, contour processing, metrics, classification, orchestration, visualization, and export.
- **What stayed the same:** All public behavior, the Python backend, and the v1 canonical schema are unchanged.
- **References:**
  - [MODULES.md](docs/arquitectura/MODULES.md) — per-module reference, dependency matrix, load order, and extension guidelines
  - [ARCHITECTURE.md](docs/arquitectura/ARCHITECTURE.md) — overall system architecture and Phase 2 metrics

---

## File Structure

```
MAO PLUS_PY_01/
├── index.html              # Web UI
├── js/                     # Frontend modules
│   ├── analysis-core.js    # Core UI logic (imports from js/modules/ since Phase 2)
│   ├── modules/            # ES6 modules — Phase 2 modular architecture
│   │   ├── geometry-primitives.js      # Convex hull, Shoelace area, orientation
│   │   ├── contour-quality.js          # Contour validation and smoothing
│   │   ├── morphometric-metrics.js     # Core metric calculations (14 functions)
│   │   ├── shape-classification.js     # 18-morphotype geometric classification
│   │   ├── contour-extraction.js       # Contour tracing, morphological ops
│   │   ├── classification-engine.js    # Typological classification + canonical rules
│   │   ├── utility-helpers.js          # Coords, cache, config, DOM helpers
│   │   ├── metrics-orchestrator.js     # Central metrics coordinator (100+ metrics)
│   │   ├── visualization-export.js     # Display, JSON/PDF export
│   │   ├── tabla-metricas-completa.js  # Complete metrics table (26 sections)
│   │   └── bifacial-analysis.js        # Bifacial symmetry math (standalone)
│   ├── comparator.js       # Bilateral comparison UI
│   ├── procrustes.js       # Procrustes superposition (APS)
│   ├── collection.js       # Object collection manager
│   ├── project-manager.js  # Project persistence
│   └── ...
├── css/
├── assets/
├── python/
│   ├── server.py           # FastAPI app
│   ├── config.py
│   └── modules/
│       ├── metrics.py          # Core morphometric formulas
│       ├── analysis.py         # Advanced analysis (PCA, stats)
│       ├── comparator.py       # Bilateral comparison (CMO backend)
│       ├── contour.py          # Contour processing
│       ├── detection.py        # Object detection
│       ├── morphology.py       # Morphological operations
│       ├── scale.py            # Scaling & calibration
│       ├── ph.py               # Perforation/horadación analysis
│       ├── mao_ia_analyzer.py  # IA artifact detection
│       └── ...
├── tests/                  # Pytest suite
│   ├── test_metrics.py
│   └── ...
├── docs/
│   ├── ESTADO-ADRS.md      ⭐ ADR implementation status
│   ├── ADR-*.md            # Architecture decision records
│   ├── arquitectura/       # Architecture and module reference
│   ├── auditorias/         # Code audits
│   ├── guias/              # HTML guides (metrics, formulas, glossary)
│   └── ...
└── requirements.txt        # Python dependencies
```

---

## Testing

### Todo de una vez

```bash
npm test
```

Encadena ESM estricto → tests de frontend → suite pytest, y es exactamente lo que ejecuta CI
(`.github/workflows/ci.yml`) en cada push y PR. Al 2026-08-14: 15/15 módulos ESM, 33/33 contratos,
15/15 casos de clasificación, **369 passed / 2 skipped**.

Preparar el entorno desde cero (no hace falta `requirements.txt`, que arrastra torch):

```bash
python3 -m venv .venv && .venv/bin/python -m pip install -r requirements-runtime.txt -r requirements-dev.txt
```

### Por partes

```bash
npm run test:esm    # parseo como módulo — detecta lo que node -c no ve
npm run test:js     # contratos window.* + clasificación de forma + exportación
npm run test:py     # suite pytest (tests/ + python/tests/)
```

La suite no tiene saltos permanentes: los tests de paridad con `MAO_A` se retiraron junto con ese
proyecto. CI falla si aparece un salto, que suele ser un test desactivado sin querer.

---

## Known Limitations & Future Work

### Current

- ✅ Bilateral symmetry analysis (legacy + extended CI/CMS)
- ✅ Perforation analysis
- ✅ Basic PCA and statistics
- ❌ Advanced Procrustes with TPS (reference only in procrustes.js)

### Planned (Post-v1)

- Web-based version (currently Electron desktop only)
- Multi-language UI (currently Spanish/English)

---

## Contributing

Before changing a metric or the analysis flow, check [docs/ESTADO-ADRS.md](docs/ESTADO-ADRS.md) for the decision that governs that part, and run the test suite.

---

## License

[Your License Here]

---

## Support & Issues

- **Bug reports:** Include schema version (`GET /api/health`)
- **Feature requests:** Reference [Planned Work](#planned-post-v1) section

---

## Changelog

### v1.2.0 (2026-06-07)

- ✅ Phase 2 complete: `analysis-core.js` split into 10 ES6 modules in `js/modules/`
- ✅ Module reference published ([MODULES.md](docs/arquitectura/MODULES.md))
- ✅ Architecture documentation updated ([ARCHITECTURE.md](docs/arquitectura/ARCHITECTURE.md))
- ✅ Zero behavioral changes — all public APIs and schema v1 preserved

### v1.0 (2026-04-27)

- ✅ Canonical schema v1 frozen
- ✅ Shared contract published (MAO_Plus ↔ MAO_A)
- ✅ Extended bilateral indices (CI/CMS) via `MAO_ENABLE_CI_CMS` flag
- ✅ Full parity validation (synthetic + real data)
- ✅ Developer Guide and technical documentation
- ✅ Legacy alias support (backward compatibility)

### v0.x (Pre-release)

- Initial development, pre-contract phase
