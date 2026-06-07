# MAO Plus — Module Reference (Phase 2)

**Version:** 1.2.0  
**Last Updated:** 2026-06-07  
**Scope:** `js/modules/` — ES6 modules extracted from `analysis-core.js` during Phase 2 refactoring

---

## Overview

Phase 2 split the monolithic `analysis-core.js` into 10 focused ES6 modules (plus one standalone math module not imported by `analysis-core.js` directly). All modules live under `js/modules/`. `analysis-core.js` imports them via namespace imports and delegates all domain logic to them.

---

## Module Reference

### 1. geometry-primitives.js

**File:** `js/modules/geometry-primitives.js` (355 lines)

**Purpose:** Pure mathematical functions for computational geometry. Provides orientation predicates, polygon area via the Shoelace formula, convex hull computation (Graham Scan + radial fallback), and hull simplification. Has no external dependencies and no side effects.

**Dependencies:** None

**Key Exports:**

| Export | Description |
|--------|-------------|
| `orientacion(p, q, r)` | Cross-product orientation predicate for three points (CCW / CW / collinear) |
| `calcularAreaShoelace(contorno)` | Polygon area using Shoelace formula; accepts `{x,y}` or `[x,y]` points |
| `calcularConvexHull(points)` | Graham Scan convex hull; falls back to radial method for degenerate cases |
| `calcularConvexHullRadial(points, cx, cy)` | Radial convex hull sorted around a given centroid |
| `simplificarConvexHull(hull, toleranciaBase)` | Simplify hull by removing near-collinear vertices |

**Usage pattern:**
```js
import * as GeometryPrimitives from './modules/geometry-primitives.js';
const hull = GeometryPrimitives.calcularConvexHull(contourPoints);
const area = GeometryPrimitives.calcularAreaShoelace(hull);
```

---

### 2. contour-quality.js

**File:** `js/modules/contour-quality.js` (410 lines)

**Purpose:** Contour validation, quality assessment, and smoothing. All functions are pure — they operate only on contour point arrays and binary masks with no global state access.

**Dependencies:** None

**Key Exports:**

| Export | Description |
|--------|-------------|
| `esPuntoBorde(binaryMask, x, y, width, height)` | Returns `true` if a pixel has at least two empty 8-connected neighbors |
| `calcularCalidadConexion(binaryMask, x1, y1, x2, y2, width, height)` | Connection quality score (0–1) penalizing diagonal shortcuts |
| `suavizarContorno(contorno, tolerance)` | Gaussian-weighted smoothing of contour points |
| `calcularAreaShoelace(contorno)` | Local copy of Shoelace area (used internally by quality checks) |
| `evaluarCalidadContorno(contorno, obj)` | Scores a contour on completeness, smoothness, and closure |
| `validarSuperficieReal(contorno, binaryMask, width, height)` | Validates that contour points lie on the object's binary mask |
| `validarYCorregirContorno(contorno, options)` | Validates contour geometry and attempts automatic correction |

**Usage pattern:**
```js
import * as ContourQuality from './modules/contour-quality.js';
const quality = ContourQuality.evaluarCalidadContorno(contour, obj);
const fixed   = ContourQuality.validarYCorregirContorno(contour, { minPoints: 10 });
```

---

### 3. morphometric-metrics.js

**File:** `js/modules/morphometric-metrics.js` (1,167 lines)

**Purpose:** Core metric calculation functions for morphometric analysis. Computes eccentricity, bilateral symmetry, curvature, fractal dimension, texture, principal axis, Feret diameter, vertex angles, fragment completeness, and 3D shape indices. Self-contained with no module dependencies.

**Dependencies:** None

**Key Exports:**

| Export | Description |
|--------|-------------|
| `calcularExcentricidad(contourPoints, centroid)` | Eccentricity and principal axis lengths via geometric moments |
| `calcularSimetriaBilateral(contourPoints, centroid, anguloEje)` | Bilateral symmetry index relative to an axis angle |
| `calcularCurvaturaLocal(contourPoints)` | Per-vertex local curvature array |
| `calcularRugosidadContorno(contourPoints)` | Roughness index from coefficient of variation of segment lengths |
| `calcularDimensionFractal(contourPoints)` | Box-counting fractal dimension of the contour |
| `calcularTexturaSuperficie(obj)` | Surface texture metrics from the object's image data |
| `refinarMascaraPorTextura(obj, texturaData)` | Refine binary mask using texture analysis results |
| `recortarLineaDentroDeContorno(p1, p2, contour)` | Clip a line segment to lie inside the contour |
| `calcularRadiosExtremos(hullPoints, centroid, fullContour)` | Min/max radii from centroid to hull and contour |
| `calcularEjePrincipal(contourPoints, centroid)` | Principal axis direction and length via PCA |
| `calcularDiametroFeret(contourPoints)` | Maximum and minimum Feret diameters |
| `calcularAngulosVertices(vertices)` | Interior angles at each detected vertex |
| `calcularCompletitudFragmento(contourPoints, centroid, distribucionRadialAngular)` | Fragment completeness index (0–1) |
| `calcularIndicesForma3D(area, perimetro, aspectRatio, excentricidad)` | Sphericity, elongation, and flatness inferred from 2D geometry |

**Usage pattern:**
```js
import * as MorphometricMetrics from './modules/morphometric-metrics.js';
const ecc  = MorphometricMetrics.calcularExcentricidad(contour, centroid);
const sym  = MorphometricMetrics.calcularSimetriaBilateral(contour, centroid, ecc.angulo_eje);
```

---

### 4. shape-classification.js

**File:** `js/modules/shape-classification.js` (1,345 lines)

**Purpose:** Shape idealization and geometric classification. Detects vertices, analyzes geometric continuity, simplifies contours using Douglas-Peucker, generates ideal geometric shapes (circle, ellipse, polygons), performs radial-angular analysis, and classifies 18 archaeological morphotypes.

**Dependencies:**
- `geometry-primitives.js` (imported as `GM`)
- `morphometric-metrics.js` (imported as `MM`)

**Key Exports:**

| Export | Description |
|--------|-------------|
| `aproximarVertices(contourPoints)` | Detect significant direction-change vertices |
| `analizarContinuidadGeometrica(contourPoints, windowSize)` | Score geometric continuity along the contour |
| `filtrarRuidoEstadistico(contourPoints, continuityScores, threshold)` | Remove statistically anomalous contour points |
| `detectarVerticesSignificativos(contourPoints, minCurvature)` | High-curvature vertex detection |
| `douglasPeucker(points, epsilon)` | Recursive Douglas-Peucker polyline simplification |
| `distanciaPerpendicularALinea(punto, lineaInicio, lineaFin)` | Perpendicular distance from a point to a line segment |
| `suavizarContorno(points, windowSize)` | Moving-average contour smoothing |
| `generarCirculoIdeal(centroX, centroY, radio, numPuntos)` | Generate ideal circle as point array |
| `generarElipseIdeal(centroX, centroY, radioMayor, radioMenor, anguloRotacion, numPuntos)` | Generate ideal ellipse as point array |
| `generarTrianguloIdeal(centroX, centroY, area)` | Generate equilateral triangle from area |
| `generarCuadradoIdeal(centroX, centroY, area)` | Generate square from area |
| `generarRectanguloIdeal(centroX, centroY, ancho, alto)` | Generate rectangle from dimensions |
| `generarPoligonoRegularIdeal(centroX, centroY, radio, numLados)` | Generate regular n-gon |
| `calcularAnguloRotacionElipse(contourPoints, centroid)` | Ellipse rotation angle from covariance |
| `analizarRegularidadGeometrica(contourPoints, centroid, area, perimetro)` | Geometric regularity scores |
| `analizarDistribucionRadialAngular(contourPoints, centroid)` | Radial-angular distribution in 36 sectors |
| `generarFormaIdealDesdeAnalisisRadial(...)` | Synthesize ideal shape from radial analysis |
| `validarFormaIdealContraReal(contornoReal, contornoIdeal, centroid)` | Validate ideal shape fit against real contour |
| `clasificarFormaGeometrica(metrics, numVertices)` | Classify into one of 18 archaeological morphotypes |
| `simplificarAFormaRegular(contourPoints, metricas, contornoMetrics)` | Simplify contour to nearest regular geometric form |

**Usage pattern:**
```js
import * as ShapeClassification from './modules/shape-classification.js';
const radial = ShapeClassification.analizarDistribucionRadialAngular(contour, centroid);
const forma  = ShapeClassification.clasificarFormaGeometrica(metrics, vertices.count);
```

---

### 5. contour-extraction.js

**File:** `js/modules/contour-extraction.js` (1,027 lines)

**Purpose:** Contour tracing and morphological operations on binary masks. Provides dilation, erosion, opening, closing, mask smoothing, sub-pixel refinement, gradient-based refinement, and full contour extraction (Moore neighborhood tracing). Also exports a `canvasPool` for reusing off-screen canvases.

**Dependencies:**
- `contour-quality.js` (imported as `CQ`)

**Key Exports:**

| Export | Description |
|--------|-------------|
| `dilatarMascara(binaryMask, width, height, iterations)` | Morphological dilation (expands foreground) |
| `erosionarMascara(binaryMask, width, height, iterations)` | Morphological erosion (shrinks foreground) |
| `cerrarMascara(binaryMask, width, height, iterations)` | Morphological closing (dilation then erosion) |
| `abrirMascara(binaryMask, width, height, iterations)` | Morphological opening (erosion then dilation) |
| `suavizarMascaraMorfologica(binaryMask, width, height, options)` | Combined morphological mask smoothing pipeline |
| `refinarContornoGradiente(contorno, imageData, width, height)` | Sub-pixel gradient-based contour refinement |
| `refinarContornoSubPixel(contorno, imageData, binaryMask, width, height, options)` | Full sub-pixel contour refinement with options |
| `extraerContornoDesdeMascara(binaryMask, width, height, imageData)` | Main contour extraction entry point from binary mask |
| `trazarContornoMoore(binaryMask, width, height)` | Moore neighborhood boundary tracing algorithm |
| `canvasPool` | Off-screen canvas pool object for reuse (acquire/release) |

**Usage pattern:**
```js
import * as ContourExtraction from './modules/contour-extraction.js';
const closed  = ContourExtraction.cerrarMascara(mask, w, h, 2);
const contour = ContourExtraction.extraerContornoDesdeMascara(closed, w, h, imageData);
```

---

### 6. classification-engine.js

**File:** `js/modules/classification-engine.js` (944 lines)

**Purpose:** Typological classification and canonical interpretation rules. Converts raw metric objects into archaeological typological labels, confidence scores, contextual interpretations, and meta-classifications. Applies a canonical rule set for 18 typological categories.

**Dependencies:**
- `morphometric-metrics.js` (imported as `MM`)
- `shape-classification.js` (imported as `SC`)

**Key Exports:**

| Export | Description |
|--------|-------------|
| `calcularIndicesForma3D(area, perimetro, aspectRatio, excentricidad)` | 3D shape indices (sphericity, elongation, flatness) |
| `mapearACategoria(clasificacion)` | Map geometric classification string to numeric category |
| `convertirCategoriaANombre(categoria, metrics)` | Convert numeric category to typological name |
| `extraerContextoMorfologico(metrics, formaIdealizada)` | Extract morphological context object from metrics |
| `aplicarContextoAEvidencias(evidencias, contexto, metrics)` | Weight evidences using contextual factors |
| `construirEtiquetaTipologica(base, esFragmento, completitud)` | Build typological label string with fragment qualifier |
| `inferirInterpretacionTipologica(...)` | Infer archaeological interpretation from classification + context |
| `aplicarReglaCanonicaInterpretacion(metricas)` | Apply canonical rule set to produce final interpretation |
| `calcularConfianzaTradicional(metrics)` | Confidence score from traditional morphometric thresholds |
| `calcularConfianzaAngulos(metrics)` | Confidence score based on vertex angle analysis |
| `clasificarComplejidad(metrics)` | Classify contour complexity (simple / moderate / complex) |
| `analizarPatronAgrupamiento(obj)` | Cluster pattern analysis across multiple detected objects |
| `metaClasificarForma(metrics, obj)` | Master classifier returning complete typological result |

**Usage pattern:**
```js
import * as ClassificationEngine from './modules/classification-engine.js';
const result = ClassificationEngine.metaClasificarForma(metrics, obj);
const label  = ClassificationEngine.aplicarReglaCanonicaInterpretacion(metrics);
```

---

### 7. utility-helpers.js

**File:** `js/modules/utility-helpers.js` (684 lines)

**Purpose:** Coordinate conversion, contour caching, application configuration persistence, DOM display helpers, image metadata loading (EXIF/RAW), file header validation, and canvas view management. Functions in this module access global state from `analysis-core.js` (canvas, image, zoom, offsets, etc.).

**Dependencies:** None (accesses `analysis-core.js` globals at runtime)

**Key Exports:**

| Export | Description |
|--------|-------------|
| `canvasToImageCoords(canvasX, canvasY)` | Convert canvas pixel coords to image coords (handles zoom/pan and manual mode) |
| `imageToCanvasCoords(imageX, imageY)` | Inverse: image coords to canvas display coords |
| `perforationCanvasToImageCoords(canvasX, canvasY)` | Coordinate conversion for the perforation sub-canvas |
| `imageToPerforationCanvasCoords(imgX, imgY)` | Inverse perforation canvas mapping |
| `aplicarZoomPerforationCanvas(zoomLevel)` | Apply zoom to perforation canvas with pan reset |
| `updateDisplays()` | Refresh object count and status displays |
| `setStatus(msg, isError)` | Set status bar message (optionally styled as error) |
| `generateCacheKey(obj)` | Generate a unique string key for contour caching |
| `getCachedContour(obj)` | Retrieve contour data from cache (returns `null` if stale) |
| `setCachedContour(obj, contourData)` | Store contour data in cache with timestamp |
| `clearContourCache()` | Evict all entries from the contour cache |
| `safeToFixed(value, decimals, defaultValue)` | `Number.toFixed` with NaN/Infinity guard |
| `cargarMetadatos(file)` | Load EXIF / RAW metadata from an image file via `exifr` |
| `procesarMetadatos(exifData, esArchivoRAW)` | Parse and normalize metadata into structured object |
| `readFileHeader(file, bytesToRead)` | Read raw bytes from a file for header inspection |
| `validateImageHeader(bytes, mimeType, fileName)` | Validate file magic bytes against declared MIME type |
| `resetView()` | Reset zoom and pan to defaults |
| `setZoomFromPercent(percent)` | Set zoom from a percentage value |
| `redrawCanvas()` | Trigger a full canvas redraw |
| `guardarConfiguracion()` | Persist user configuration to `localStorage` |
| `cargarConfiguracion()` | Load persisted configuration from `localStorage` |

**Usage pattern:**
```js
import * as UtilityHelpers from './modules/utility-helpers.js';
const imageCoords = UtilityHelpers.canvasToImageCoords(e.clientX, e.clientY);
UtilityHelpers.setStatus('Procesando...', false);
```

---

### 8. metrics-orchestrator.js

**File:** `js/modules/metrics-orchestrator.js` (460 lines)

**Purpose:** Central orchestrator for comprehensive morphological metric calculation. Coordinates all subsystem modules, computes 100+ metrics across multiple analysis dimensions from a contour input, and returns a complete metric dataset with uncertainty estimates. The primary entry point for full analysis runs.

**Dependencies:**
- `geometry-primitives.js` (imported as `GP`)
- `contour-quality.js` (imported as `CQ`)
- `morphometric-metrics.js` (imported as `MM`)
- `shape-classification.js` (imported as `SC`)
- `classification-engine.js` (imported as `CE`)
- `utility-helpers.js` (imported as `UH`)

**Key Exports:**

| Export | Description |
|--------|-------------|
| `calcularMetricasMorfologicas(obj, escalaFactor, opciones)` | Full morphometric analysis from an object with contour data |
| `calcularMetricasConBoundingBox(obj, escalaFactor)` | Fallback metrics computation using bounding box when contour unavailable |
| `calcularRugosidadContorno(contourPoints)` | Internal roughness metric exposed for external callers |
| `calcularMetricasDesdeContorno(contorno, escalaFactor, opciones)` | Compute metrics from a raw contour point array |
| `estimarErrorOptico(obj, escalaFactor)` | Estimate optical error and calibration uncertainty |
| `aplicarIncertidumbreOptica(metricas, errorEstimado)` | Propagate optical uncertainty into metric result object |

**Usage pattern:**
```js
import * as MetricsOrchestrator from './modules/metrics-orchestrator.js';
const metricas = await MetricsOrchestrator.calcularMetricasMorfologicas(obj, escala, opts);
```

---

### 9. visualization-export.js

**File:** `js/modules/visualization-export.js` (3,441 lines)

**Purpose:** All display and export functionality for morphological analysis results. Renders the analysis panel, generates schematic and idealized-shape canvases, exports data as JSON, CSV, and PDF (via `html2canvas` + `jsPDF`), and validates coherence before export. Also re-exports `generarTablaMetricasCompleta` from `tabla-metricas-completa.js`.

**Dependencies:**
- `morphometric-metrics.js` (imported as `MM`)
- `classification-engine.js` (imported as `CE`)
- `contour-quality.js` (imported as `CQ`)
- `geometry-primitives.js` (imported as `GP`)
- `utility-helpers.js` (imported as `UH`)
- External: `html2canvas`, `jsPDF`

**Key Exports:**

| Export | Description |
|--------|-------------|
| `mostrarAnalisisMorfologico(obj, metricas, imagenEspecifica)` | Render full analysis panel to the DOM |
| `generarCanvasEsquematico(obj, metricas)` | Draw schematic canvas overlay with contour and metrics annotations |
| `exportarAnalisisMorfologico(obj, metricas)` | Export analysis as PDF (uses `html2canvas` + `jsPDF`) |
| `generarJSON(obj, metricas)` | Serialize analysis result to canonical JSON string |
| `validarCoherenciaPreexportacion(obj, metricas, modo)` | Async validation of metric coherence before export |
| `generarTablaMetricasCompleta` | Re-export from `tabla-metricas-completa.js` |

**Usage pattern:**
```js
import * as VisualizationExport from './modules/visualization-export.js';
VisualizationExport.mostrarAnalisisMorfologico(obj, metricas);
await VisualizationExport.exportarAnalisisMorfologico(obj, metricas);
```

---

### 10. tabla-metricas-completa.js

**File:** `js/modules/tabla-metricas-completa.js` (2,855 lines)

**Purpose:** Complete metrics table HTML generator. Orchestrates 26 section-generator functions to produce a full structured HTML table covering all morphological dimensions (dimensions, fragmentation, shape indices, orientation, symmetry, perforations, radial analysis, contour properties, curvature, convex hull, vertices, 3D shape, centroid, classification, and synthesis). Has no module imports — it is self-contained HTML generation.

**Dependencies:** None

**Key Exports:**

| Export | Description |
|--------|-------------|
| `generarTablaMetricasCompleta(obj, metricas)` | Generate complete metrics table HTML for `obj` with `metricas` data |
| `contarMetricas(metricas, obj)` | Count populated metrics across all sections for summary display |

**Section generators (internal, not exported):** `generarSeccionDimensiones`, `generarSeccionFragmentacion`, `generarSeccionIndicesForma`, `generarSeccionMetricasMorfologicas`, `generarSeccionOrientacion`, `generarSeccionSimetria`, `generarSeccionPerforaciones`, `generarSeccionHoradaciones`, `generarSeccionComparacionBifacial`, `generarSeccionEstadoConservacion`, `generarSeccionErrorOptico`, `generarSeccionEjesOrientacion`, `generarSeccionAnalisisRadial`, `generarSeccionPropiedadesContorno`, `generarSeccionCurvatura`, `generarSeccionConvexHull`, `generarSeccionMetricasAvanzadas`, `generarSeccionClasificacionesIndividuales`, `generarSeccionVerticesAngulos`, `generarSeccionForma3D`, `generarSeccionCentroide`, `generarSeccionClasificacion`, `generarSeccionPatronAgrupamiento`, `generarSeccionSintesisFinal`, `generarSeccionClasificaciones`, `generarSeccionMetricasComplementarias`.

**Usage pattern:**
```js
import * as TablaMetricasCompleta from './modules/tabla-metricas-completa.js';
const html  = TablaMetricasCompleta.generarTablaMetricasCompleta(obj, metricas);
const count = TablaMetricasCompleta.contarMetricas(metricas, obj);
```

---

### Bonus: bifacial-analysis.js

**File:** `js/modules/bifacial-analysis.js` (451 lines)

**Purpose:** Pure math functions for bilateral (bifacial) symmetry analysis between Face A (obverse) and Face B (reverse) of a lithic artefact. Uses specular reflection (180° rotation) as the spatial model. No DOM or module dependencies.

**Dependencies:** None

**Key Exports:**

| Export | Description |
|--------|-------------|
| `aplicarReflejoEspecular(punto, centroide)` | Horizontally reflect a point across the centroid |
| `calcularAngulo(vector)` | Angle of a 2D vector relative to the X axis (degrees) |
| `normalizarAngulo(angulo)` | Normalize an angle to [−180, 180] |
| `calcularComparacionBifacial(caraA, caraB)` | Full bifacial comparison metrics (symmetry, alignment, correspondence) |
| `analizarDistribucionPH(caraA, caraB, centroideA, centroideB)` | Compare perforation/horadación distributions between faces |

**Note:** `bifacial-analysis.js` is untracked in git and not yet imported by `analysis-core.js`. It supplements the Python-side bifacial backend (`python/modules/comparator.py`).

---

## Dependency Matrix

Each row is a module; columns marked with `X` are its imports.

| Module | geometry-primitives | contour-quality | morphometric-metrics | shape-classification | contour-extraction | classification-engine | utility-helpers |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **geometry-primitives** | — | | | | | | |
| **contour-quality** | | — | | | | | |
| **morphometric-metrics** | | | — | | | | |
| **shape-classification** | X | | X | — | | | |
| **contour-extraction** | | X | | | — | | |
| **classification-engine** | | | X | X | | — | |
| **utility-helpers** | | | | | | | — |
| **metrics-orchestrator** | X | X | X | X | | X | X |
| **visualization-export** | X | X | X | | | X | X |
| **tabla-metricas-completa** | | | | | | | |
| **bifacial-analysis** | | | | | | | |

---

## Module Load Order

ES6 module bundling resolves cycles automatically, but for mental model clarity the correct topological order from leaves to orchestrators is:

```
Layer 0 — No dependencies (pure math / pure generation):
  1. geometry-primitives.js
  2. morphometric-metrics.js
  3. utility-helpers.js
  4. tabla-metricas-completa.js
  5. bifacial-analysis.js          (standalone)

Layer 1 — Depends on Layer 0:
  6. contour-quality.js            (no imports, but logically pairs with geometry)
  7. shape-classification.js       (← geometry-primitives, morphometric-metrics)
  8. contour-extraction.js         (← contour-quality)

Layer 2 — Depends on Layer 1:
  9. classification-engine.js      (← morphometric-metrics, shape-classification)

Layer 3 — Orchestrators:
 10. metrics-orchestrator.js       (← all of layers 0-2)
 11. visualization-export.js       (← geometry, contour-quality, morphometric-metrics,
                                       classification-engine, utility-helpers)

Entry point:
 12. analysis-core.js              (imports all of the above)
```

---

## Adding New Modules

Follow these guidelines when extending the module system:

1. **One responsibility per module.** Each module should own a single domain (geometry, quality, metrics, classification, display, or export). Avoid mixing computation and DOM manipulation.

2. **Declare imports explicitly.** Use `import * as Alias from './module.js'` at the top. Never use dynamic `import()` inside functions unless lazy-loading is intentional.

3. **Pure functions preferred.** Modules in Layers 0–2 must be pure (no global state, no DOM). Only orchestrators (Layer 3) and `utility-helpers.js` may access `analysis-core.js` globals.

4. **Export at the bottom.** Group all `export` statements at the end of the file (or use named `export function` declarations inline). Avoid `export default`.

5. **Document dependencies in the file header.** Update the JSDoc block at the top of your new file listing `Dependencies:` and `EXPORTED FUNCTIONS:`.

6. **Update this file.** Add a section to the Module Reference, update the Dependency Matrix, and update the Module Load Order.

7. **Register in analysis-core.js.** Add the namespace import at the top of `analysis-core.js` and wire up any delegated calls.

8. **Consider line count thresholds.** Modules over ~1,500 lines may benefit from a further split. Modules under ~100 lines may be better merged into a peer.
