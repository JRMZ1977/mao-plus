# HOMOLOGACIÓN MÉTRICA 2D → 3D: MAPEO EXACTO

## 1. CUANTIFICACIÓN DE MÉTRICAS

### Modo 2D (puro, archivo único `metricas.json`)
- **Total claves en `metricas` dict**: ~120+ (incluyendo aliases, clasificaciones, metadata)
- **Indicadores morfométricos únicos**: ~55 (`area`, `perimetro`, `circularidad`, `solidez`, `elongacion`, etc.)
- **Categorías**:
  - Geometría base: 5 (área, perímetro, centroide, bounding box, aspect ratio)
  - Forma: 10 (circularidad, compacidad, rectangularidad, solidez, elongación, factor de forma, complejidad, eficiencia)
  - Convex hull: 3 (área, perímetro, puntos)
  - Ejes: 8 (excentricidad, eje mayor/menor, orientación, anisotropía, radio de giro)
  - Simetría: 4 (bilateral, distancia asimetría, clasificación)
  - Curvatura: 5 (media, máxima, desviación, puntos inflexión, clasificación suavidad)
  - Rugosidad: 4 (coeficiente, segmento medio, desviación, clasificación)
  - Feret: 5 (max, min, ratio, ángulos, clasificación)
  - Radios: 7 (máximo, mínimo, medio, desviación, ratio, regularidad, CV)
  - Índices derivados: 6 (estrellamiento, lobularidad, energía curvatura, Fractal dimension)
  - Textura: 3 (varianza, entropía, gradiente Sobel)
  - Vértices: 6 (conteo, ángulos medio/predominante, desviación, rectos/agudos/obtusos)
  - Clasificación forma: 5 (detectada, confianza, categoría, clase por circularidad/compacidad/aspecto/complejidad, clase convexidad)

### Modo 3D (por secciones canonicalizadas + descriptores)
**Nivel 1: Métricas POR SECCIÓN (9 secciones transversales en media)**
- Por cada sección YZ (transversal): `_loop_quick_metrics()` → ~12 métricas rápidas
  - `area`, `perimeter`, `circularity`, `aspect_ratio`, `rectangularity`
  - `excentricidad`, `eje_mayor`, `eje_menor`, `angulo_eje_principal`
  - `solidity` (si hay perforaciones)
  - `elongation`
  - Métricas de horadaciones/piezas interiores si existen (enriquecimiento)
  
- Igual para 9 secciones coronales XZ (coronales)
- Igual para 9 secciones frontales XY (frontales)

- **Subtotal por sección: 12 métricas × 3 ejes × 9 secciones media = ~324 datos (pero comprimibles)**

**Nivel 2: FRONT/BACK (homología bifacial 2D)**
- FRONT (z≥0): `_projected_hull_metrics_2d()` → ~5 métricas (area, perimeter, circularity, aspect_ratio, rectangularity)
- BACK  (z<0):  igual → ~5 métricas
- **Subtotal: 10 métricas**

**Nivel 3: Firma Canónica (mao_plus_indices dict)**
Selección de ~14 índices homologados clave:
```
{
  "bifacial_homology_index":       float  (0–1)  — grado de simetría bifacial
  "area_balance":                  float  — min(A_front, A_back) / max(...)
  "perimeter_balance":             float  — min(P_front, P_back) / max(...)
  "transverse_area_cv":            float  — coeficiente variación áreas secciones
  "transverse_thickness_cv":       float  — CV espesores secciones
  "circularity_front":             float  — circularidad proyección frontal
  "circularity_back":              float  — circularidad proyección posterior
  "linearity":                     float  (PCA) — (λ1 - λ2) / λ1
  "planarity":                     float  (PCA) — (λ2 - λ3) / λ1
  "sphericity":                    float  (PCA) — λ3 / λ1
  "mean_section_elongation":       float  — promedio elongación de secciones
  "mean_section_solidity":         float  — promedio solidez de secciones
  "coherence_2d_3d":               float  (0–1) — score de consistencia 2D-3D
  "procrustes_pca_seq":            float  (0–1) — similitud Procrustes secuencial
}
```
- **Subtotal: 14 componentes clave**

**Nivel 4: EFA integrado multi-eje (descriptor 3D)**
- signature_3d: vector concatenado [EFD_YZ, EFD_XZ, EFD_XY]
  - Si n_harmonics=10 → dimensión = 3 × 10 × 4 = 120 componentes
  - Si n_harmonics=20 → dimensión = 3 × 20 × 4 = 240 componentes
- **Subtotal: 120–240 (según n_harmonics elegido)**

---

## 2. ARQUITECTURA DE HOMOLOGACIÓN

```
┌─────────────────────────────────────────────────────────────────┐
│                    ENTRADA: OBJ 3D                              │
│                                                                  │
│  1. PCA + Canonicalización (reglas de signo reproducibles)      │
│     ↓                                                            │
│     Pose canónica: FRONT/BACK a lo largo Z, X = longitudinal   │
└─────────────────────────────────────────────────────────────────┘
                          ↓↓↓
        ┌─────────────────────────────────────┐
        │   RUTA 1: SECCIONES 2D (VISTAS)    │
        │   ════════════════════════════════ │
        │                                    │
        │ • 9 cortes transversales YZ        │ ──→ _loop_quick_metrics()
        │ • 9 cortes coronales XZ            │ ──→ 12 métricas/sección
        │ • 9 cortes frontales XY            │
        │ • FRONT/BACK proyecciones XY       │ ──→ 5 métricas/cara
        │                                    │
        │ SALIDA: mao2d_adapted +            │
        │         morphology_canonical       │
        │         (contornos + métricas)     │
        └─────────────────────────────────────┘
                          ↓↓↓
        ┌─────────────────────────────────────┐
        │  RUTA 2: DESCRIPTORES (FIRMA)      │
        │  ════════════════════════════════  │
        │                                    │
        │ • EFA seccional: promedio de EFD   │ ──→ por eje (YZ, XZ, XY)
        │ • EFA 3D integrado: concatenación  │ ──→ signature_3d (120–240 dims)
        │ • Índices homologados clave        │ ──→ mao_plus_indices (14 comps)
        │ • Coherencia MAO2D-3D              │ ──→ cross_dimensional_coherence
        │ • Procrustes PCA secuencial        │ ──→ pca_sequential_alignment
        │                                    │
        │ SALIDA: homologation_signature     │
        │         (firma compacta)           │
        └─────────────────────────────────────┘
                          ↓↓↓
        ┌─────────────────────────────────────┐
        │  CONVERGENCIA A PERSISTENCIA 2D     │
        │  ════════════════════════════════  │
        │                                    │
        │ • metricas.json: solo índices      │ ──→ ~14 clave + resumen
        │   principales (ruta firma)        │     (sin 300+ datos sección)
        │ • geometria.json: contornos +      │ ──→ FRONT/BACK contours +
        │   perforaciones 3D si existen      │     bounding box 3D
        │ • metadata.json: identificación    │ ──→ cara='3D', modo='obj3d'
        │ • collection_index.json: registro  │ ──→ timestamp + referencias
        │                                    │
        │ SALIDA: Archivo homologado 2D      │
        │         (compatible CMO)           │
        └─────────────────────────────────────┘
```

---

## 3. FLUJO EXACTO DE HOMOLOGACIÓN (EN CÓDIGO)

### Paso 1: Orientación Canónica
**Archivo**: `python/modules/obj3d_v2.py`
- Función: `_canonicalize_orientation(points, principal_axes, eigenvalues)`
- Entrada: nube 3D con PCA ya calculado
- Salida: 
  - `canonical_points` (transformados a marco PCA)
  - `rotation_matrix` (R)
  - `orientation_meta` (signos aplicados, confianza)

### Paso 2: Generar SECCIONES 2D
**Función**: `_compute_canonical_morphological_analysis()`
- **Para FRONT/BACK** (Cara A/B homóloga):
  - Proyectar XY: puntos con Z≥0 (front) vs Z<0 (back)
  - Llamar `_projected_hull_metrics_2d()` → 5 métricas por cara
  - Generar contorno 2D: `_contour_points_from_projection()` → ~120 pts

- **Para Cortes Transversales (9×)**:
  - Iterar X-relativo (10%–90% de rango X)
  - Extraer YZ en ventana de ±3% rango X
  - Si hay malla: `_mesh_section_loops()` (obtiene outer + holes)
  - Si no: proyectar YZ → `_contour_points_from_projection()`
  - Llamar `_section_morphometric_metrics_2d()` → ~12 métricas
  - Si hay horadaciones: `_enrich_with_void_metrics()` (agrega métricas vacío)
  - Calcular EFA: `_section_efa(contour)` → coeficientes de Fourier

- **Igual para Coronales (XZ) y Frontales (XY)**

### Paso 3: Calcular Firma Homologada (mao_plus_indices)
**Función**: `_compute_mao_plus_indices()`
- Leer `bifacial_index.value` → `bifacial_homology_index`
- Leer balances de áreas/perímetros FRONT/BACK
- Calcular CV de secciones (variabilidad transversal)
- Extraer circularidades FRONT/BACK
- Leer PCA (linearity, planarity, sphericity)
- Promediar elongación/solidez de todas las secciones
- Computar coherencia MAO2D-3D: `_compute_crossdimensional_mao_coherence()`
- Computar Procrustes: `_compute_pca_sequential_alignment()`

**Resultado: dict con 14 componentes clave**

### Paso 4: EFA Multi-Eje (signature_3d)
**Función**: En mismo `_compute_canonical_morphological_analysis()`
- Promediar EFD de secciones YZ → vector medio_yz (nh×4)
- Promediar EFD de secciones XZ → vector medio_xz (nh×4)
- Promediar EFD de secciones XY → vector medio_xy (nh×4)
- Concatenar: `signature_3d = [medio_yz.flatten(), medio_xz.flatten(), medio_xy.flatten()]`
- Dimensión final: 3 × nh × 4 = 120–240 según nh

**Resultado: vector descriptor 3D comparable entre objetos**

### Paso 5: Incripción en Homologation Signature (JSON retorno v2)
```json
{
  "homologation_signature": {
    "status": "ok",
    "model": "mao_plus_3d_homologation_v1",
    "signature": {
      "bifacial_homology": <float>,
      "area_balance": <float>,
      "perimeter_balance": <float>,
      "transverse_area_cv": <float>,
      "transverse_thickness_cv": <float>,
      "circularity_front": <float>,
      "circularity_back": <float>,
      "aspect_resting": <float>,
      "thickness_resting": <float>,
      "linearity": <float>,
      "planarity": <float>,
      "sphericity": <float>,
      "coherence_2d_3d": <float>,
      "procrustes_pca_seq": <float>
    },
    "signature_vector": [<14 valores float>],
    "comparable": <bool>,
    "homologation_level": "muy_alta|alta|media|baja",
    "global_score": <float 0–1>
  },
  "efa_3d_integrado": {
    "available": true,
    "n_harmonics": <int>,
    "descriptor_dim": <int 120–240>,
    "signature_3d": [<120–240 floats>],
    "signature_norm": <float>,
    "recon_yz": [[x,y], ...],  # forma media proyección YZ
    "recon_xz": [[x,y], ...],  # forma media proyección XZ
    "recon_xy": [[x,y], ...]   # forma media proyección XY
  }
}
```

### Paso 6: Adaptar al Formato 2D/CMO Persistente
**Función**: `buildObj3dCompatArtifacts()` en `js/obj3d-viewer.js`
- Tomar `homologation_signature.signature`
- Crear `metricas.json` 2D-compatible:
  ```json
  {
    "objeto": {
      "area": 0,  // no es aplicable en 3D, proxy = 0
      "perimeter": 0,
      "circularity": 0.75,  // promedio FRONT+BACK/2
      "solidity": 0.9,
      "elongation": 0.45,
      "modo_3d": "obj3d_pca",
      "bifacial_index": 0.82,
      "linearity": 0.55,
      "planarity": 0.30,
      "sphericity": 0.15,
      ...más índices homologados...
    },
    "estadisticas": {
      "totalPerforaciones": 0,
      "totalHoradaciones": 0
    }
  }
  ```
- Crear `geometria.json` con contornos FRONT/BACK de XY
- Crear `trazados.json` con canvas snapshots
- Actualizar `collection_index.json` con entrada del 3D

---

## 4. RESPUESTA DIRECTA A TU PREGUNTA

### ¿Homologación EN TORNO A SECCIONES O EN TORNO A EFA?

**RESPUESTA: Jerárquico en DOS NIVELES**

1. **BASE (Secciones 2D)**:
   - Se generan **contornos 2D canónicos** desde cortes 3D (9× transversales, 9× coronales, 9× frontales + FRONT/BACK)
   - Se aplica **el mismo motor `metrics.calculate()` del 2D puro** a cada contorno
   - Resultado: ~12 métricas por sección × 27 secciones = ~324 datos
   - **ESTOS datos seccionales NO se guardan en `metricas.json` final** (demasiado pesados)
   - Se sintetizan en: CV (variabilidad), promedios, índices de balance

2. **CAPA DESCRIPTOR (Firma Homologada)**:
   - Se toman **los EFD calculados en cada sección**
   - Se promedian en 3 ejes → signature_3d (120–240 componentes)
   - Se seleccionan **14 índices clave** de mao_plus_indices (derivados de secciones)
   - Resultado: firma compacta y comparable

3. **INSCRIPCIÓN EN PERSISTENCIA 2D**:
   - Solo se guardan los **14 índices de mao_plus_indices** (que resurgen de secciones pero sintetizados)
   - `signature_3d` se retorna pero NO se almacena por defecto (opcional para PCA inter-objeto)
   - Formato final = homologado al formato 2D `/metricas.json`

**EN RESUMEN:**
- ✅ Homologación **BASADA EN SECCIONES** (son el origen de las métricas)
- ✅ Homologación **CODIFICADA EN EFA** (descriptor para comparación)
- ✅ Homologación **PERSISTIDA EN FIRMA CANÓNICA** (14 índices + signature_3d opcional)

---

## 5. TABLA COMPARATIVA FINAL

| Métrica | 2D Puro | 3D v2 Inscrito | Nota |
|---------|---------|---|---|
| **Área** | ✅ px² → mm² | ❌ 0 (3D no tiene área 2D) | proxy = 0 |
| **Perímetro** | ✅ px → mm | ❌ 0 | proxy = 0 |
| **Circularidad** | ✅ individual contorno | ✅ promedio FRONT+BACK | de cortes XY |
| **Solidez** | ✅ individual contorno | ✅ promedio secciones | si hay horadaciones |
| **Elongación** | ✅ eje mayor/menor | ✅ promedio secciones | de cortes |
| **Feret** | ✅ individual | ✅ si se rasteriza | opcional en contour-analyze |
| **Simetría bilateral** | ✅ individual | ✅ bifacial_homology | en FRONT vs BACK |
| **Curvatura Menger** | ✅ individual | ✅ si se rasteriza | en contour-analyze |
| **Rugosidad** | ✅ individual | ✅ si se rasteriza | en contour-analyze |
| **Radios extremos** | ✅ individual | ✅ si se rasteriza | en contour-analyze |
| **EFA** | ❌ no está | ✅ signature_3d | descriptor 3D multi-eje |
| **Bifacial index** | ❌ no aplicable | ✅ bifacial_homology | nuevo para 3D |
| **Linearity/Planarity/Sphericity** | ❌ no aplicable | ✅ PCA 3D | nuevo para 3D |
| **CV transversal** | ❌ no aplicable | ✅ área y espesor | estabilidad secciones |

