# MAO Plus — Bifacial Morphometric Analysis Platform

**Version:** 1.2.0  
**Last Updated:** 2026-06-07  
**Status:** Production-Ready (v1.0 contract frozen)

---

## Overview

MAO Plus is a desktop application (Electron + FastAPI) for **bilateral morphometric analysis** of archaeological stone tool bifacial surfaces. It measures symmetry indices, morphometric properties, and provides statistical comparison across multiple objects.

This version aligns mathematically with **MAO_A** through a formal shared contract ensuring reproducible, interoperable results across platforms.

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

> **Phase 2 note:** `js/analysis-core.js` no longer contains the analysis logic directly — it delegates to ES6 modules in `js/modules/`. See [MODULES.md](MODULES.md) for the full module reference.

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

- **[Developer Guide — Shared Contract](docs/DEVELOPER_GUIDE_SHARED_CONTRACT.md)** ⭐ **Start here**
  - Canonical field names (what's what)
  - Guaranteed parity endpoints (MAO_Plus ↔ MAO_A)
  - Legacy aliases (how to read old data)
  - JSON schema examples
  - Testing parity manually

- **[Technical Contract v1](docs/CONTRATO_COMPAGINACION_MAO_PLUS_MAO_A_v1.md)**
  - Detailed specification of shared modules
  - Remediationplans and governance rules
  - Risk assessment
  - Environment flags

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

## Data Format: Canonical Schema v1

All outputs follow the **frozen schema v1** as documented in [Developer Guide](docs/DEVELOPER_GUIDE_SHARED_CONTRACT.md).

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
  - [MODULES.md](MODULES.md) — per-module reference, dependency matrix, load order, and extension guidelines
  - [ARCHITECTURE.md](ARCHITECTURE.md) — overall system architecture and Phase 2 metrics

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
│   ├── test_bifacial_parity_v2.py  # Parity validation (v1)
│   └── ...
├── docs/
│   ├── DEVELOPER_GUIDE_SHARED_CONTRACT.md  ⭐ Developer documentation
│   ├── CONTRATO_COMPAGINACION_MAO_PLUS_MAO_A_v1.md
│   └── ...
└── requirements.txt        # Python dependencies
```

---

## Testing

### Unit Tests (Python)

```bash
source .venv/bin/activate
pytest tests/ -v
```

### Parity Validation (Manual)

```python
# See docs/DEVELOPER_GUIDE_SHARED_CONTRACT.md section 6
# Verify bifacial() produces identical results across repos
```

---

## Known Limitations & Future Work

### Current (v1.0 — Frozen)

- ✅ Canonical core shared with MAO_A
- ✅ Bilateral symmetry analysis (legacy + extended CI/CMS)
- ✅ Perforation analysis
- ✅ Basic PCA and statistics
- ❌ Online projects (extension in MAO_A only, not ported to MAO_Plus)
- ❌ Advanced Procrustes with TPS (reference only in procrustes.js)

### Planned (Post-v1)

- Extract shared modules to package for easier sync
- Automated CI/CD parity gate
- Web-based version (currently Electron desktop only)
- Multi-language UI (currently Spanish/English)

---

## Contributing

**Before modifying shared modules**, please read:

1. **[Developer Guide](docs/DEVELOPER_GUIDE_SHARED_CONTRACT.md)** — Contract rules and field naming
2. **[Technical Contract](docs/CONTRATO_COMPAGINACION_MAO_PLUS_MAO_A_v1.md)** — Governance and coordination

**Shared modules** (must coordinate across repos):
- `python/modules/metrics.py`
- `python/modules/analysis.py`
- `python/modules/mao_ia_analyzer.py`

**Repository-specific** (independent):
- `js/analysis-core.js`, `js/project-manager.js`, etc.
- `python/modules/scale.py`, `python/modules/detection.py`, etc.

---

## License

[Your License Here]

---

## Support & Issues

- **Parity issues:** See [Troubleshooting section](docs/DEVELOPER_GUIDE_SHARED_CONTRACT.md#8-troubleshooting-parity-issues) in Developer Guide
- **Bug reports:** Include schema version (`GET /api/health`)
- **Feature requests:** Reference [Planned Work](#planned-post-v1) section

---

## Changelog

### v1.2.0 (2026-06-07)

- ✅ Phase 2 complete: `analysis-core.js` split into 10 ES6 modules in `js/modules/`
- ✅ Module reference published ([MODULES.md](MODULES.md))
- ✅ Architecture documentation updated ([ARCHITECTURE.md](ARCHITECTURE.md))
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
