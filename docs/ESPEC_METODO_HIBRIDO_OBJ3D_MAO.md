# MAO Plus 3D — Método híbrido PCA → Variables de forma → Orientación y Caras

Fecha: 2026-04-22  
Estado: Especificación técnica implementable (v0.1)

## 1) Objetivo

Extender el flujo 3D actual (centrado en PCA global) hacia un análisis morfológico homologable con MAO Plus 2D, garantizando:

1. **Orientación espacial canónica y reproducible** de la malla.
2. **Definición de caras/superficies regulares** con criterios geométricos robustos.
3. **Clasificación monofacial/bifacial** basada en variables de forma derivadas.
4. **Puente directo al motor morfométrico MAO 2D** mediante proyecciones de cara.

> Principio rector: **PCA no decide caras por sí sola**; PCA configura el marco y las variables globales para que una segmentación de superficies sea estable y verificable.

---

## 2) Diagnóstico del estado actual

Módulo actual `python/modules/obj3d.py` entrega:
- PCA: `eigenvalues`, `explained_variance_ratio`, `principal_axes`.
- Globales: `linearity`, `planarity`, `sphericity`, `elongation`, `surface_area`, `volume`, `bounds`.

Falta para objetivo MAO:
- Normalización de signo/orientación canónica reproducible.
- Segmentación de superficies regulares (caras candidatas).
- Índice de bifacialidad y decisión formal.
- Exportación de proyecciones por cara para reutilizar pipeline 2D.

---

## 3) Arquitectura propuesta (pipeline)

### Fase A — Preparación y calidad de malla

Entrada: OBJ → malla `M`.

A1. Validaciones mínimas:
- `num_vertices >= 500` (umbral configurable).
- `num_faces >= 800` (umbral configurable).
- No NaN/Inf en vértices.

A2. Reparación ligera (si aplica):
- Eliminar componentes diminutas (`area_rel < 0.01`).
- Recalcular normales.
- Reportar `is_watertight`, `n_components`, `mesh_quality_flags`.

A3. Muestreo superficial uniforme:
- `n_samples` configurable (default 20k).
- Salida: nube `P`.

---

### Fase B — Marco canónico con PCA (configurador)

B1. Centrado en centroide: `P0 = P - mean(P)`.

B2. PCA 3D sobre `P0`:
- Ejes `E1, E2, E3` ordenados por varianza.
- Rotación `R_pca = [E1 E2 E3]`.

B3. Desambiguación de signo (crítica):
- PCA da ejes sin signo; fijar reglas deterministas:
  - Regla S1: `+E1` orientado hacia el extremo con mayor masa proyectada.
  - Regla S2: `+E3` hacia la semiesfera con menor rugosidad media (cara más “regular”).
  - Si empate: desempate por hash estable de vértices + regla lexicográfica.

B4. Sistema canónico:
- `Xc = R_fix^T * P0`.
- Exportar `canonical_transform` (rotación + centro).

Salida fase B:
- `canonical_axes`, `canonical_transform`, `orientation_confidence`.

---

### Fase C — Variables de forma derivadas (inspiradas MAO)

Estas variables no “segmentan”, pero condicionan la decisión posterior.

C1. Globales (ya disponibles + derivados):
- `linearity`, `planarity`, `sphericity`, `anisotropy`.
- `extent_x, extent_y, extent_z` en marco canónico.
- `thickness_ratio = extent_z / max(extent_x, extent_y)`.
- `compactness3d`, `surface_to_volume_ratio`.

C2. Variables de regularidad superficial:
- Curvatura media local (estimada en vértices).
- `roughness_mean`, `roughness_std`.
- Histograma de normales (coherencia angular).

C3. Variables de simetría:
- Simetría respecto plano `YZ` y `XZ` en marco canónico.
- `mirror_error_A_B` (error tras reflejo y registro ICP ligero entre hemisuperficies opuestas).

Salida fase C:
- `shape_variables` (bloque estructurado, trazable y exportable).

---

### Fase D — Detección de caras/superficies regulares

D1. Segmentación de parches:
- Agrupar triángulos por similitud de normales + curvatura baja.
- Criterios:
  - `normal_variance <= t_nv`
  - `curvature_mean <= t_curv`
  - `area_patch_rel >= t_area`

D2. Construcción de candidatas:
- Cada parche `Fi` con atributos:
  - área, normal media, curvatura media, rugosidad, convexidad local, bbox local.

D3. Emparejamiento de caras opuestas:
- Buscar pares `(Fi, Fj)` con:
  - `angle(norm_i, norm_j) ≈ 180°`
  - áreas comparables
  - distancia entre planos coherente con espesor global
  - baja energía tras reflejo + ICP

Salida fase D:
- `face_candidates[]`
- `face_pairs[]`
- `face_detection_confidence`.

---

### Fase E — Decisión monofacial/bifacial

Definir índice compuesto:

`I_bif = w1*S_opposition + w2*S_area_balance + w3*S_mirror_similarity + w4*S_regular_surface`

Con `S*` normalizados a `[0,1]`.

Umbrales iniciales:
- `I_bif >= 0.70` → **bifacial**
- `0.45 <= I_bif < 0.70` → **indeterminado/revisión**
- `I_bif < 0.45` → **monofacial**

Asignación:
- Si bifacial: definir `face_A`, `face_B`.
- Si monofacial: `face_primary` (+ opcional secundaria informativa).

Salida fase E:
- `analysis_mode_3d: monofacial | bifacial | indeterminado`
- `bifacial_index` + desglose de componentes.

---

### Fase F — Puente al análisis morfológico MAO Plus

F1. Proyección ortográfica por cara:
- Proyectar geometría de `face_A` y `face_B` a 2D en su plano local.

F2. Generar contornos depurados 2D:
- Máscara/silueta → contorno principal.
- Correcciones equivalentes a flujo MAO 2D (hull, eje mayor/menor, etc.).

F3. Reutilizar motor existente MAO 2D:
- Ejecutar métricas por cara como si fueran imágenes normalizadas.
- Mantener compatibilidad con `metricasResumen`, colección, CSV, comparador.

---

## 4) Contrato de salida propuesto (`obj3d.analyze_v2`)

```json
{
  "status": "ok",
  "obj3d": {
    "version": "2.1.0",
    "pca": {"eigenvalues": [], "principal_axes": [], "linearity": 0.0, "planarity": 0.0, "sphericity": 0.0},
    "orientation": {
      "canonical_transform": {"center": [0,0,0], "rotation": [[0,0,0],[0,0,0],[0,0,0]]},
      "sign_rules": {"rule_s1": true, "rule_s2": true},
      "confidence": 0.0
    },
    "shape_variables": {
      "extents": {"x": 0.0, "y": 0.0, "z": 0.0},
      "thickness_ratio": 0.0,
      "roughness_mean": 0.0,
      "roughness_std": 0.0,
      "symmetry": {"yz": 0.0, "xz": 0.0, "mirror_error": 0.0}
    },
    "faces": {
      "candidates": [],
      "pairs": [],
      "mode": "monofacial",
      "bifacial_index": {
        "value": 0.0,
        "components": {"opposition": 0.0, "area_balance": 0.0, "mirror_similarity": 0.0, "regular_surface": 0.0}
      },
      "assignment": {"A": null, "B": null, "primary": null}
    },
    "mao_bridge": {
      "projections": {"A": null, "B": null, "primary": null},
      "contours_2d": {"A": null, "B": null, "primary": null}
    },
    "quality_flags": []
  }
}
```

---

## 5) Plan de implementación por iteraciones

### Iteración 1 (mínimo funcional)
- Marco canónico robusto (fase B).
- Variables de forma globales + simetría básica (fase C parcial).
- `bifacial_index` inicial sin segmentación compleja (proxy con hemisuperficies).

### Iteración 2
- Segmentación de parches regulares (fase D).
- Pareo A/B confiable + asignación estable.

### Iteración 3
- Proyección por cara + puente completo al motor MAO 2D.
- Exportes y colección homologados.

---

## 6) Criterios de aceptación

1. Misma malla rotada aleatoriamente produce misma decisión `mode` y caras A/B (estabilidad > 95%).
2. Repeticiones con mismo archivo producen mismo `canonical_transform` (tolerancia numérica definida).
3. En dataset controlado:
   - precisión de modo mono/bi >= 85%.
4. Proyección 2D por cara permite ejecutar pipeline MAO sin romper persistencia/CSV/UI.

---

## 7) Riesgos y mitigaciones

- **Riesgo**: PCA inestable en objetos casi isotrópicos.
  - Mitigación: marcar `orientation_confidence` baja + fallback a modo indeterminado.

- **Riesgo**: mallas ruidosas o incompletas.
  - Mitigación: `quality_flags`, denoise opcional, thresholds adaptativos.

- **Riesgo**: sobre-segmentación de caras.
  - Mitigación: fusionado por normal/curvatura + área mínima relativa.

---

## 8) Cambios de código esperados

- `python/modules/obj3d.py`
  - agregar funciones:
    - `_canonicalize_orientation(...)`
    - `_compute_shape_variables(...)`
    - `_segment_regular_surfaces(...)`
    - `_compute_bifacial_index(...)`
    - `_project_face_to_2d(...)`

- `python/server.py`
  - extender endpoint `/api/obj3d/metrics` con `analysis_level`:
    - `pca` (actual)
    - `hybrid_v1` (nuevo)

- `js/obj3d-viewer.js`
  - mostrar bloque `mode`, `bifacial_index`, `quality_flags`.

- `js/project-manager.js` / `js/collection.js`
  - persistir `faces.mode` y resumen de decisión.

---

## 9) Recomendación operativa inmediata

Antes del empaquetamiento final:
1. implementar **Iteración 1** completa;
2. validar estabilidad de orientación;
3. solo entonces empaquetar snapshot “estable”.

Con esto, MAO Plus 3D deja de ser solo PCA descriptivo y pasa a un flujo morfológico operativo compatible con la lógica monofacial/bifacial del sistema.
