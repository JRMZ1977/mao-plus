# MAO Plus/MAO_A Developer Guide — Shared Contract v1

**Last updated:** 2026-04-27  
**Status:** Stable (v1.0)  
**Scope:** MAO_Plus and MAO_A repositories — bifacial morphometric analysis

---

## Quick Start: Using the Shared Modules

MAO_Plus and MAO_A share a **canonical mathematical core**. This guide explains:

1. Which modules are shared (don't duplicate)
2. Which endpoints guarantee identical outputs across both apps
3. How to extend without breaking parity
4. Naming conventions and aliases

---

## 0. Canonical Terminology (UI/API)

Use these terms consistently in user-facing text and reports. Keep technical field names unchanged when required for backward compatibility.

| Canonical Term (ES) | Preferred Alias | Avoid in UI as primary label | Notes |
|---------------------|-----------------|------------------------------|-------|
| Relación de aspecto | AR | Aspect ratio / Aspect Ratio | Define as `eje mayor / eje menor` |
| Elongación | Elongación (normalizada) | Elongation (EN only) | Normalized elongation in `[0,1]` where applicable |
| Anverso / Reverso | FRONT / BACK | Mixing both without equivalence note | In bilingual contexts use `Anverso/Reverso (FRONT/BACK)` |
| Perforación | P | Hueco (ambiguous) | Through-hole (pasante) |
| Horadación | H | Hueco (ambiguous) | Non-through depression/cavity |

Implementation rule:
- If English must be shown, present Spanish first and English as alias in parentheses.

---

## 1. Shared Modules (Do Not Fork)

These modules implement canonical mathematical algorithms. Use them as-is in both repositories:

| Module | Purpose | Location |
|--------|---------|----------|
| `metrics.py` | Basic morphometric measures (area, perimeter, circularity, etc.) | `python/modules/` |
| `analysis.py` | Advanced contour analysis (PCA, statistical summaries) | `python/modules/` |
| `mao_ia_analyzer.py` | Artifact detection and IA pipeline | `python/modules/` |

**Rule:** If you need to improve these modules, do it in both repos simultaneously or extract to shared package.

---

## 2. Guaranteed Parity Endpoints

These endpoints **must produce identical outputs** when given identical inputs:

### Core Metrics (Required)

```
POST /api/metrics
POST /api/ph_metrics  (perforations/horadaciones)
POST /api/bifacial    (bilateral symmetry index)
POST /api/scale       (calibration and scaling)
```

### Analysis & Statistics (Required)

```
POST /api/pca         (principal component analysis)
POST /api/statistics  (summary statistics)
GET  /api/health      (service health check)
```

### Extensions (MAO_A only)

```
POST /api/projects
GET  /api/projects/{id}
POST /api/jobs/cmo    (cross-bilateral morphometry)
POST /api/jobs/aps    (automated Procrustes superposition)
GET  /api/jobs/{id}
```

---

## 3. Field Reference: Canonical Names

### Basic Morphometrics (Required Fields in `/api/metrics`)

| Field | Type | Unit | Description |
|-------|------|------|-------------|
| `area` | float | mm² | Blob area |
| `perimeter` | float | mm | Blob perimeter |
| `circularity` | float | [0,1] | 4π·area/perimeter² |
| `convexity` | float | [0,1] | area / convex_hull_area |
| `solidity` | float | [0,1] | area / bounding_box_area |
| `elongation` | float | ≥1 | major_axis / minor_axis |
| `centroide` | [x, y] | mm | Center of mass |
| `angulo_eje_mayor` | float | degrees | Major axis angle |
| `radio_maximo` | float | mm | Maximum radial distance from centroid |
| `radio_minimo` | float | mm | Minimum radial distance from centroid |

### Legacy Aliases (Read-Only)

These names are accepted for **backward compatibility** but should **not be used in new code**:

| Canonical | Legacy Alias | Note |
|-----------|--------------|------|
| `perimeter` | `perimetro` | Convert on input; output always `perimeter` |
| `circularity` | `circularidad` | Convert on input; output always `circularity` |
| `convexity` | `convexidad` | Convert on input; output always `convexity` |
| `solidity` | `solidez` | Convert on input; output always `solidity` |

**Migration rule:** When you export, save canonical names. Legacy names are for reading old data only.

### Bifacial Symmetry Index (Legacy)

**Field:** `indiceSimetriaGeneral`  
**Range:** [0, 1]  
**Meaning:** Overall bilateral symmetry (0 = asymmetric, 1 = identical)  
**Note:** This is the legacy unified index. New code should use `CI/CMS` below.

### Bifacial Symmetry Index (Extended — Optional)

When environment flag `MAO_ENABLE_CI_CMS=1` is set:

| Field | Type | Description |
|-------|------|-------------|
| `CI` | float | **Congruence Index** — shape similarity [0,1] |
| `CMS` | float | **Cumulative Morphometric Score** — combined bilateral metric [0,1] |
| `subindicesCMS` | dict | Breakdown of CMS by component (e.g., `area`, `perimeter`, `shape`) |
| `interpretacionCI_CMS` | str | Qualitative interpretation ("Identical", "Very Similar", "Similar", "Different", etc.) |

**Backward compatibility:** If `MAO_ENABLE_CI_CMS=0` (default), these fields are **not present** in output; `indiceSimetriaGeneral` alone is returned.

---

## 4. Environment Flags

### CI/CMS Extended Analysis

```bash
# Enable extended bilateral indices
export MAO_ENABLE_CI_CMS=1

# Or in Python
os.environ["MAO_ENABLE_CI_CMS"] = "1"
```

When enabled:
- `bifacial()` returns `CI`, `CMS`, `subindicesCMS`, `interpretacionCI_CMS` in addition to legacy fields
- Endpoints `/api/bifacial` include extended fields
- JSON exports preserve extended fields for audit trail

---

## 5. Data Exchange: JSON Schema Examples

### `/api/bifacial` Request

```json
{
  "cara_a": {
    "metricas": {
      "area": 1050.5,
      "perimeter": 151.2,
      "circularity": 0.843,
      "convexity": 0.91,
      "solidity": 0.87,
      "elongation": 1.28,
      "centroide": [120.5, 98.3],
      "angulo_eje_mayor": 12.4,
      "radio_maximo": 65.2,
      "radio_minimo": 31.8
    },
    "perforaciones": [],
    "horadaciones": [],
    "clasificacion_forma": "cuasirectangular"
  },
  "cara_b": {
    "metricas": {
      "area": 1020.3,
      "perimeter": 149.1,
      "circularity": 0.851,
      "convexity": 0.92,
      "solidity": 0.88,
      "elongation": 1.25,
      "centroide": [119.2, 97.1],
      "angulo_eje_mayor": 11.8,
      "radio_maximo": 64.1,
      "radio_minimo": 32.5
    },
    "perforaciones": [],
    "horadaciones": [],
    "clasificacion_forma": "cuasirectangular"
  }
}
```

### `/api/bifacial` Response (Legacy Mode)

```json
{
  "indiceSimetriaGeneral": 0.8756,
  "interpretacionSimetria": "Muy similar",
  "simetriaArea": 0.9709,
  "simetriaPerimetro": 0.9736,
  "coherenciaPromedio": 0.8801,
  "correlacionEspacial": 0.9102,
  "alineacionEspacial": "Excelente",
  "desplazamientoNormalizado": 0.0234,
  "reflejoEspecular": true,
  "distribucionPH": {
    "simetriaEspecular": 1.0,
    "simetriaPosicional": 1.0,
    "descripcion": "Identical perforations layout"
  },
  "perforacionesA": 0,
  "perforacionesB": 0,
  "horadacionesA": 0,
  "horadacionesB": 0,
  "totalPH_A": 0,
  "totalPH_B": 0,
  "mismaClasificacion": true
}
```

### `/api/bifacial` Response (Extended Mode: `MAO_ENABLE_CI_CMS=1`)

Additional fields in response (above response plus):

```json
{
  "CI": 0.9102,
  "CMS": 0.8927,
  "subindicesCMS": {
    "area": 0.9709,
    "perimeter": 0.9736,
    "shape": 0.7803,
    "spatial": 0.8801
  },
  "interpretacionCI_CMS": "Muy similares"
}
```

---

## 6. Testing Parity: Manual Validation

To verify both repos produce identical results:

```python
# MAO_Plus bifacial
import sys
sys.path.insert(0, "/Users/juanramirez/Documents/MAO PLUS_PY_01/python")
from modules.comparator import bifacial as bifacial_plus

# MAO_A bifacial
sys.path.insert(0, "/Users/juanramirez/Documents/MAO_A/python")
from modules.comparator import bifacial as bifacial_a

# Test with identical caras
cara_a = {"metricas": {...}, "perforaciones": [], "horadaciones": []}
cara_b = {"metricas": {...}, "perforaciones": [], "horadaciones": []}

result_plus = bifacial_plus(cara_a, cara_b)
result_a    = bifacial_a(cara_a, cara_b)

# Verify parity (within 1e-6 tolerance)
assert abs(result_plus["indiceSimetriaGeneral"] - result_a["indiceSimetriaGeneral"]) < 1e-6
```

---

## 7. Common Integration Patterns

### Pattern 1: Reading Legacy Data

If you're reading JSON exports from older versions with legacy field names:

```python
def normalize_metricas(metricas_dict):
    """Convert legacy field names to canonical."""
    mapping = {
        "perimetro": "perimeter",
        "circularidad": "circularity",
        "convexidad": "convexity",
        "solidez": "solidity",
    }
    for legacy, canonical in mapping.items():
        if legacy in metricas_dict and canonical not in metricas_dict:
            metricas_dict[canonical] = metricas_dict.pop(legacy)
    return metricas_dict
```

### Pattern 2: Ensuring Extended Fields

```python
import os

# Enable extended analysis
os.environ["MAO_ENABLE_CI_CMS"] = "1"

# Call bifacial
result = bifacial(cara_a, cara_b)

# Safely access extended fields
ci = result.get("CI")
cms = result.get("CMS")

if ci is None:
    print("Extended fields not available; using legacy index only")
    indice = result.get("indiceSimetriaGeneral")
```

### Pattern 3: Cross-Repo Validation

```bash
# Terminal: Verify both servers return same schema version
curl -s http://localhost:8000/api/health | jq .schemaVersion
curl -s http://localhost:8001/api/health | jq .schemaVersion
# Both should return: "v1"
```

---

## 8. Troubleshooting: Parity Issues

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `indiceSimetriaGeneral` differs by > 1e-6 | Float precision drift or formula divergence | Check `comparator.py` in both repos for identical formula |
| CI/CMS fields missing | `MAO_ENABLE_CI_CMS` not set | Set `export MAO_ENABLE_CI_CMS=1` before running |
| Field name errors (e.g., "perimetro not found") | Code using legacy name in new version | Use canonical name or apply normalization function |
| Numerical difference in area calculation | Contour encoding (closed vs. open polygon) | Ensure both repos close contour same way (e.g., `contour[0] == contour[-1]`) |

---

## 9. Contributing: What NOT to Do

### ❌ Don't fork these modules:
- `metrics.py` — share formula improvements across both repos
- `analysis.py` — keep analysis logic synchronized
- `mao_ia_analyzer.py` — coordinate IA enhancements

### ❌ Don't invert ratios silently:
- If a field is `major / minor`, keep it that way
- If you need `minor / major`, use a new field name with explicit formula in docs

### ❌ Don't add new canonical fields without coordinating:
- New metric → propose → document → add to both repos simultaneously
- Or use a named extension field (e.g., `metricas_extended`, `metricas_v2`)

### ✅ Do follow this workflow for improvements:
1. Propose improvement in issue (affects both repos)
2. Implement in one repo (test thoroughly)
3. Create PR with full test coverage
4. Apply same change to second repo (same PR sequence)
5. Update this guide if naming/schema changed

---

## 10. Support & Contact

**For parity issues or new features**, open an issue with:
- Schema version (`GET /api/health` → `schemaVersion`)
- Endpoint involved
- Input JSON
- Observed vs. expected output
- Environment flags (e.g., `MAO_ENABLE_CI_CMS`)

**Example issue title:**  
`[PARITY] /api/bifacial returns different CI on MAO_A vs MAO_Plus`

---

## Appendix: Schema Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2026-04-27 | Initial canonical schema; legacy alias support; CI/CMS optional; endpoints frozen |

---

## License & Usage

These modules and endpoints are part of the MAO Plus/MAO_A open research platform. Use subject to platform license. For commercial use, contact platform maintainers.
