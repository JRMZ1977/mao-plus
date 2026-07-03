# ADR-015 — Plan de mejoras: superar brechas y optimizar capacidades matemáticas

**Estado:** Propuesto · aprobación por fases
**Fecha:** 2026-07-01
**Autor:** JFRR + Claude Code
**Relacionado:** ADR-006 (repertorio canónico), ADR-009 (P/H), ADR-014 (dataset ML),
`docs/APORTE-MAO-PROTEC2025.md`, `docs/PLAN-MEJORAS-MAO.md` (tablero de seguimiento)

---

## Contexto y decisión

La auditoría de posicionamiento (2026-07-01) frente a las herramientas de referencia del campo
(PyLithics, Momocs, geomorph/MorphoJ, AGMT3-D/Artifact3-D) estableció que MAO Plus **cumple el
estándar científico en el plano del motor** —métodos correctos y verificados, trazabilidad física,
cuantificación de incertidumbre, repertorio canónico 2D↔3D— y en **dos criterios está por delante**
del campo (presupuesto de error óptico por medición y homología canónica 2D↔3D). Sus brechas **no
son de ingeniería**, sino de dos clases:

1. **Brecha de certificación (Eje 2):** falta validación empírica publicada (exactitud,
   reproducibilidad) — es lo que separa a MAO de los referentes ya certificados.
2. **Brecha de profundización matemática (Eje 1):** varias capacidades fuertes tienen un techo
   analítico o un asterisco (modelo óptico no calibrado, presupuesto de error incompleto,
   morfoespacio multivariante externalizado, simetría por diferencia de métricas).

**Decisión:** ejecutar un plan de mejoras **aditivo y por fases** que cierre ambas brechas bajo la
premisa de *superar brechas + optimizar lo matemático*. Cada mejora declara la brecha que cierra, la
matemática que optimiza, los archivos afectados y un **gate de aceptación** (tests) — porque los
módulos tocados son math-critical (misma disciplina que ADR-013 F2).

## Premisa e invariantes

- **Aditivo y reversible:** ninguna mejora reescribe lógica de negocio existente; extiende.
- **Gated por tests:** todo cambio matemático entra con su prueba de exactitud/invariancia. La suite
  no debe bajar de su estado actual (302 passed / 2 skipped).
- **Trazabilidad de referencias:** cada método nuevo cita su fuente (como EFA→Kuhl & Giardina 1982).

---

## Catálogo de mejoras

### Grupo A — Cerrar la brecha de certificación (Eje 2)

**A1 · Validación de exactitud vs. dimensiones conocidas** 🔴 crítico
- **Brecha:** ausencia de validación de exactitud (trueness) publicable.
- **Matemática:** regresión medido‑vs‑real, análisis de Bland‑Altman, límites de acuerdo (LoA),
  sesgo sistemático y % de error por métrica.
- **Archivos:** `python/tests/test_validation_accuracy.py` (nuevo), corpus de patrones de dimensión
  conocida (calibrador/piezas medidas); reporte en `docs/VALIDACION-EXACTITUD.md`.
- **Gate:** error sistemático por métrica H documentado; LoA reportados; script reproducible.

**A2 · Reproducibilidad inter/intra‑observador** 🔴 crítico
- **Brecha:** sin estudio de precisión/repetibilidad.
- **Matemática:** ANOVA de error de medición / coeficiente de correlación intraclase (ICC);
  descomposición de varianza atribuible al método vs. al objeto.
- **Archivos:** `python/tests/test_reproducibility.py` (nuevo); protocolo de réplicas en
  `docs/VALIDACION-EXACTITUD.md`.
- **Gate:** ICC reportado por métrica; varianza método < umbral acordado.

### Grupo B — Optimizar el presupuesto de incertidumbre (el diferenciador estrella)

**B1 · Consumir la calibración de lente del investigador** 🟠 alto
- **Brecha/optimización:** hoy `_estimar_error_optico` usa una tabla empírica de `k₁` con
  incertidumbre de modelo declarada ±30% → *primer orden*, no calibrado.
- **Front-end YA construido** (`calibracion_lente.html`, herramienta translocal client-side).
  Escalera de degradación grácil de 3 métodos: (1) **Zhang/tablero** (OpenCV.js → intrínsecos
  completos `fx,fy,cx,cy` + distorsión `k₁,k₂,p₁,p₂,k₃`, RMS de reproyección → ±1–5%); (2)
  **plumb-line** de emergencia (`k₁≈−4δ/r²`, ±7.5%); (3) **importación manual** (Adobe/DxO/PTLens).
  Exporta JSON `mao_calibracion` con bloque `mao_plus.k1_estimado` + procedencia (método, RMS,
  nº imágenes, calidad). Cualquiera de los tres bate el ±30% del fallback FOV.
- **Trabajo B1 = lado MAO:** importar el JSON, **persistir el perfil de lente** (clave
  `modelo + focal_mm`), y consumirlo en `_estimar_error_optico`.
- ⚠ **Reconciliación de convención de k₁ (crítico):** el `k₁` de OpenCV opera sobre
  `r_n = r_px/fx` (coords normalizadas por focal); `_estimar_error_optico` usa
  `r_norm = r_px/(W/2)`. **NO son intercambiables** (~4× de error si se sustituye directo). En el
  camino calibrado, calcular el desplazamiento con el modelo Brown-Conrady real usando los
  intrínsecos: `r_n = r_px/fx`, `disp% = (k₁·r_n² + k₂·r_n⁴ + k₃·r_n⁶)·100`. Con los intrínsecos
  completos, medir el desplazamiento geométrico exacto en el centroide de cada objeto e incluir la
  **distorsión tangencial** (p₁,p₂). La tabla FOV queda solo como *fallback* sin perfil.
- **Incertidumbre reportada (ladder):** Zhang ±1–5% > plumb ±7.5% > manual (declarada) > FOV ±30%.
- **Procedencia:** propagar método+RMS+calidad al CSV/PDF (refuerza el reporte metrológico del paper).
- **Archivos:** `python/modules/scale.py` (`_estimar_error_optico` + import/persistencia de perfil),
  nuevo `python/modules/optical_calibration.py`; UI «Importar calibración de lente» en parámetros de
  escala. Front-end de generación: `calibracion_lente.html` (ya existe).
- **Gate:** test con perfil de distorsión conocida → desplazamiento posicional reproducido dentro de
  tolerancia; sin perfil → cae al FOV sin romper; test de la reconciliación de convención k₁.

**B2 · Término de relieve/paralaje** 🟠 alto
- **Brecha:** el presupuesto cubre distorsión + perspectiva pero **no el relieve fuera de plano**
  de un objeto 3D fotografiado en 2D (3ª fuente ausente).
- **Matemática:** corrección de proyección por altura del objeto (paralaje) sobre el plano de escala.
- **Archivos:** `python/modules/scale.py` (nuevo término aditivo al RSS); requiere altura estimada.
- **Gate:** test sintético objeto con relieve conocido → error de área acotado correctamente.

**B3 · Propagar la incertidumbre de calibración de escala** 🟠 alto
- **Brecha:** la incertidumbre de `px/mm` no se propaga a las métricas.
- **Matemática:** propagación de errores (RSS) de las 3 fuentes → ± por métrica completo.
- **Archivos:** `python/modules/scale.py` (`aplicar_incertidumbre_optica`).
- **Gate:** `{métrica}_incertidumbre_abs` integra las 3 fuentes; test de propagación.

### Grupo C — Explotación estadística (mayor brecha analítica vs. Momocs)

**C1 · Morfoespacio integrado in‑app (PCA/CVA)** 🟠 alto
- **Brecha:** MAO produce el vector de forma pero **externaliza** el morfoespacio (R/Momocs).
- **Matemática:** PCA/CVA sobre banco EFA + pool métrico, con estandarización (z‑score) y control de
  multicolinealidad (VIF); proyección y elipses de confianza por grupo.
- **Archivos:** nuevo `python/modules/morphospace.py`; endpoint `/api/morphospace`; integración en
  `js/comparator.js`.
- **Gate:** paridad numérica con `scikit-learn`/referencia sobre dataset de prueba.

**C2 · Selección de métricas independientes** 🟡 medio
- **Brecha:** pool inflado por descriptores correlacionados.
- **Matemática:** matriz de correlación del pool → subconjunto ortogonal informativo (VIF, clustering
  de variables).
- **Archivos:** `python/modules/morphospace.py` (utilidad de selección) + reporte.
- **Gate:** subconjunto reportado con VIF < umbral.

**C3 · Cuantificación de estandarización (caso La Draga)** 🔴 paper
- **Brecha/aporte:** medir "estandarización" con rigor para el artículo PROTEC.
- **Matemática:** dispersión / coeficiente de variación por morfotipo + intervalos de confianza
  **bootstrap**; contraste entre morfotipos (baja vs. alta variabilidad).
- **Archivos:** `python/modules/comparator.py` (o nuevo `standardization.py`).
- **Gate:** CV e IC bootstrap por grupo; test sobre datos sintéticos con dispersión conocida.

### Grupo D — Robustez matemática del núcleo

**D1 · Simetría bilateral formal (Klingenberg)** 🟠 alto
- **Brecha/optimización:** el bifacial compara por **diferencia de métricas**, no por descomposición
  formal. Para *estandarización de ornamentos*, la simetría es el indicador de control técnico.
- **Matemática:** descomposición componente **simétrico / asimétrico** (Procrustes o EFA de objetos
  con emparejamiento reflejado); índice de asimetría con significación.
- **Archivos:** `python/modules/metrics.py` (simetría), `python/modules/efa.py`;
  `js/modules/bifacial-analysis.js`.
- **Gate:** objeto perfectamente simétrico → componente asimétrico ≈ 0; test de invariancia.

**D2 · Pose canónica 3D robusta + mallas no‑watertight** 🟡 medio
- **Brecha:** límites conocidos (requisito watertight; pose por caras con fallback PCA).
- **Matemática:** tensor de inercia como criterio principled + detección de plano de simetría;
  reparación/relleno de malla (`trimesh.repair`) antes de la volumetría.
- **Archivos:** `python/modules/obj3d_v2.py` (`_normalize_by_faces`, `_pca_contextual`).
- **Gate:** malla con agujeros → volumen estable; pose reproducible ante rotación de entrada.

**D3 · Corte de armónicos EFA por criterio de varianza** 🟡 medio
- **Optimización:** `variance_explained`/`harmonics_for_95/99pct` ya existen; formalizar el corte
  como parámetro reportado.
- **Archivos:** `python/modules/efa.py`.
- **Gate:** `n_harmonics` efectivo reportado según umbral; test de reconstrucción.

### Grupo E — Extensión de paradigma (largo plazo)

**E1 · GM por landmarks/semi‑landmarks (opcional)** 🟢 largo plazo
- **Brecha:** paradigma ausente frente a geomorph/AGMT3-D.
- **Matemática:** superposición de Procrustes (GPA) sobre puntos homólogos.
- **Nota:** alto esfuerzo, cambio de paradigma; abordar solo si se busca diálogo directo con la GM
  por landmarks. Fuera del alcance de las fases 1‑2.

---

## Fases y secuencia

| Fase | Objetivo | Mejoras | Disparador |
|------|----------|---------|------------|
| **F1** | Certificación (habilita PROTEC) | A1, A2, C3 | Inmediato — es el corazón metodológico del artículo |
| **F2** | Optimización matemática del núcleo | B1, B2, B3, D1, D3 | Tras F1; B1+D1 refuerzan directamente el caso ornamentos |
| **F3** | Cerrar brechas analíticas | C1, C2, D2 | Post‑congreso |
| **F4** | Paradigma (opcional) | E1 | Solo si se decide competir en GM por landmarks |

**Recomendación de arranque:** F1 completa + adelanto de **B1 y D1** (calibración óptica real +
simetría formal), por ser los que más refuerzan el estudio de estandarización de cuentas de La Draga.

## Reversibilidad y riesgo

Todas las mejoras son **aditivas** (módulos o campos nuevos, o parámetros opcionales). Riesgo bajo
salvo: **C1** (nuevo endpoint/superficie de UI) y **D2** (toca la pose 3D, math-critical → gate
estricto). Ninguna reescribe claves de join ni contratos existentes (a diferencia del diferido
ADR-008 C2).

## Verificación

Cada mejora entra con su gate. Verificación global: suite ≥ 302 passed / 2 skipped, `node -c`
limpio, y —para las de UI— sonda DOM en Electron (lección transversal: `node -c`/health no ven
layout/CSS ni exactitud numérica de runtime).
