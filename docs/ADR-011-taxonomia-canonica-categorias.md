# ADR-011 — Taxonomía canónica de categorías del análisis morfológico

**Estado:** PROPUESTA — taxonomía pendiente de validación (JFRR, experto de dominio).
**Fecha:** 2026-06-24.
**Relacionados:** [[adr006_repertorio_canonico_morfometrico]] (registro canónico **backend**, `python/modules/morphometric_registry.py`), [[analysis_category_stability]] (esqueleto estable del panel), ADR-005 (lenguaje canónico LAAR), ADR-008 (contrato de salida de captura).

---

## Contexto

Las **mismas métricas** se consignan en **cuatro salidas** independientes, y cada una usa **su propia taxonomía de categorías** (nombres, orden y conjunto distintos). Además, varias categorías **desaparecen según el modo de detección o acciones secundarias** (mismo patrón del bug del error óptico en IA).

| Salida | Generador | Nº categorías | Taxonomía |
|---|---|---|---|
| Panel Análisis | `mostrarAnalisisMorfologico` (`js/modules/visualization-export.js`) | ~20 | Dimensiones, Radial, Conservación, Textura GLCM, Error Óptico, P/H… |
| Tabla Completa | `generarTablaMetricasCompleta` (`js/modules/tabla-metricas-completa.js`) | 26 secciones (I…) | numeradas, otra nomenclatura |
| CSV descarga | `extraerMetricasCompletasConPHSimple` (`js/analysis-core.js`) | 23 | `Categoría,Métrica,Valor,Unidad` |
| PDF integral | `generarReportePDFIntegral` (`js/analysis-core.js`) | 14 «SECCIÓN» | nomenclatura totalmente distinta |

**Síntomas concretos de incoherencia:**
1. El **CSV no tiene** las categorías **Textura (GLCM)** ni **Error Óptico** que sí están en el panel.
2. El **PDF** usa 14 secciones con nombres que no mapean 1:1 a ninguna otra salida.
3. Dentro de cada salida, categorías como Fragmentación, Patrón, P/H, Forma Idealizada se **ocultan** cuando faltan datos (dependen del modo/acción).

Ya hay precedente de fuente-única-de-verdad en el **backend**: `morphometric_registry.py` (ADR-006). Este ADR es su **contraparte de presentación** en el frontend.

## Decisión

Definir **una taxonomía canónica única** de categorías (nombres + orden + tipo) en un **manifiesto** (`js/modules/category-manifest.js`), **consumido por las cuatro salidas**. Toda categoría `estructural` o `factual` se rinde **siempre**, en el **mismo orden** y con el **mismo nombre**, en panel, tabla, CSV y PDF. Las categorías `comparativa` (bifacial, tabla comparativa por-P/H) siguen condicionales por naturaleza.

Decisión JFRR previa (vigente): **esqueleto estable** (nada desaparece por modo/acción) + **P/H siempre visibles**. Este ADR lo eleva de "por salida" a "transversal a las 4 salidas".

## Taxonomía canónica propuesta (a validar)

Orden científico de lectura: identidad → métricas geométricas → superficie/óptica → clasificación → rasgos factuales → metadatos.

| # | Categoría canónica | Tipo | Cubre hoy (panel / tabla / csv / pdf) |
|---|---|---|---|
| 1 | Identificación y Clasificación | estructural | ✓/✓/✓/✓ |
| 2 | Dimensiones Básicas | estructural | ✓/✓/✓/✓ |
| 3 | Ejes y Orientación | estructural | ✓/✓/✓/✓ |
| 4 | Análisis Radial | estructural | ✓/✓/✓/parc |
| 5 | Índices de Forma | estructural | ✓/✓/✓/✓ |
| 6 | Estado de Conservación y Fragmentación | estructural | ✓/✓/✓/parc |
| 7 | Simetría | estructural | ✓/✓/✓/✓ |
| 8 | Curvatura | estructural | parc/✓/✓/✓ |
| 9 | Propiedades del Contorno | estructural | ✓/✓/✓/✓ |
| 10 | Convex Hull | estructural | ✓/✓/✓/parc |
| 11 | Vértices y Ángulos | estructural | ✓/✓/✓/✓ |
| 12 | Métricas Avanzadas (Feret, Lobularidad, Estrellamiento) | estructural | ✓/✓/✓/✓ |
| 13 | Centroide | estructural | ✓/✓/✓/✗ |
| 14 | Forma 3D Inferida | estructural | ✓/✓/✓/✓ |
| 15 | **Textura Óptica (GLCM)** | estructural | ✓/parc/**✗**/✓ |
| 16 | **Error e Incertidumbre Óptica** | estructural | ✓/✓/**✗**/✗ |
| 17 | Depuración Estadística de Contorno | estructural | ✓/✓/parc/✗ |
| 18 | Clasificación y Síntesis (meta + 6 métodos + síntesis) | estructural | ✓/✓/✓/✓ |
| 19 | Perforaciones | factual | ✓/✓/✓/parc |
| 20 | Horadaciones | factual | ✓/✓/✓/parc |
| 21 | Patrón de Agrupamiento | factual | ✓/✓/✓/✗ |
| 22 | Información Técnica / Metadatos | estructural | ✓/parc/parc/✓ |
| — | Comparación Bifacial | comparativa | condicional (requiere otra cara) |
| — | Tabla Comparativa por-P/H | comparativa | condicional (requiere P/H) |

(parc = presente con otro nombre o subconjunto; ✗ = ausente → hay que añadirla en la migración.)

## Diseño del manifiesto

`js/modules/category-manifest.js` — fuente única de verdad, sin dependencias:

```js
export const CATEGORIAS = [
  { id: 'identificacion', titulo: 'Identificación y Clasificación', orden: 1, tipo: 'estructural' },
  { id: 'dimensiones',    titulo: 'Dimensiones Básicas',           orden: 2, tipo: 'estructural' },
  // … 22 entradas + 2 comparativas
];
// Helpers: categoriasEstructurales(), categoriasFactuales(), porId(id), tituloDe(id)
```

Cada generador importa `CATEGORIAS` y **itera en orden**, emitiendo cada categoría `estructural`/`factual` **siempre** (con marcador "sin datos" cuando sus campos no existen), con el `titulo` canónico. Los campos por categoría (clave en `metricas`, label, unidad, formateo) se cablean **por fase**, reusando los nombres de campo reales ya inventariados (backbone del CSV body).

Formatos planos (CSV, PDF) → data-driven completo desde el manifiesto.
Formatos ricos (panel, tabla) → conservan su HTML, pero reordenados a `orden` canónico y garantizando presencia + `titulo`.

## Plan por fases (aditivo, reversible, validación entre fases)

- **F0 — Doc + taxonomía** (este ADR). Validar la tabla de arriba. *Sin código.*
- **F1 — Manifiesto** `category-manifest.js` + tests de contrato (orden único, ids únicos, tipos válidos). Riesgo nulo.
- **F2 — CSV** migrar `extraerMetricasCompletasConPHSimple` al manifiesto: categorías condicionales → siempre; **añadir Textura + Error Óptico**. Plano, bajo riesgo, verificable por diff de texto.
- **F3 — PDF** `generarReportePDFIntegral` al manifiesto (renombrar sus 14 secciones a las canónicas, añadir faltantes). Verificación visual del PDF.
- **F4 — Tabla Completa** reordenar las 26 secciones a `orden` canónico + nombres canónicos (las secciones ya rinden siempre tras el fix de P/H de 2026-06-24).
- **F5 — Panel** alinear orden/nombres del panel al manifiesto (el esqueleto estable ya está hecho).
- **F6 — Verificación E2E** `window.__maoE2E.flujoCompleto(...)` en los 4 modos; checklist de paridad de categorías entre las 4 salidas.

## Estado de avance (pre-ADR, ya hecho)

- **Panel**: esqueleto estable — 8 categorías con rama "sin datos" (commit pendiente). [[analysis_category_stability]]
- **Tabla Completa**: P/H ahora **siempre** (gates de orquestador eliminados; las secciones ya traen esqueleto interno). `node -c` ✅.

## Consecuencias

**+** Coherencia total de categorías entre las 4 salidas; nada depende del modo ni de acciones secundarias; una sola fuente de verdad para añadir/renombrar/reordenar categorías a futuro.
**−** Refactor amplio (4 funciones grandes en 2 archivos); requiere verificación visual de PDF/tabla (lección #1 del repo: `node -c`/health no ven layout). Mitigación: fases pequeñas, validación entre cada una, manifiesto primero.

## Reversibilidad

El manifiesto es aditivo; cada generador puede revertirse a su gating previo de forma independiente. Comentar el import del manifiesto y restaurar el bloque original por fase.

---

## Estado de implementación (2026-06-24)

Decisión refinada (JFRR, premisa app científica): **el manifiesto es contrato de COBERTURA** (qué categorías deben existir y nunca desaparecer por modo/acción), **no** se renombran esquemas establecidos del CSV (reproducibilidad: scripts downstream dependen de los nombres de columna). Salidas de lectura humana (panel/tabla/PDF) → cobertura + estabilidad; CSV → cobertura + esquema estable.

| Salida | Estado | Detalle |
|---|---|---|
| **Panel** | ✅ | Esqueleto estable — 8 categorías con "sin datos" agnóstico al modo. |
| **Tabla Completa** | ✅ | 26 secciones siempre + P/H siempre (gates de orquestador eliminados). |
| **CSV** | ✅ | + Textura GLCM, + Error/Incertidumbre Óptica, + Depuración (faltaban); Fragmentación/Patrón/P-H siempre emiten. **Esquema preservado** (no se renombra). |
| **PDF integral** | ✅ | **Corrección:** NO era maqueta. El `opciones.integral` reconstruye el PDF desde datos REALES (jsPDF); las ~110 N/A del generador HTML se descartan. Estaba **roto** (llamaba `VisualizationExport.generarReportePDFIntegral`, inexistente en el módulo → TypeError desde 2026-06-07). **Fix:** quitar el prefijo (función local). **Cobertura completada:** + Convex Hull, + Forma 3D, + Centroide (a `seccionesMetricas`) y + GLCM en §XIV. |

**F6 — verificación E2E (Electron, sonda MAO_PROBE) ✅:** probadas las salidas de lectura humana con un objeto SIN datos opcionales (sin textura/P-H/fragmentación/óptico/depuración):
- **Panel** (`mostrarAnalisisMorfologico`): 13 categorías presentes — incluidas Textura GLCM, Resumen Perforaciones, Resumen Horadaciones, Análisis de Patrón, Depuración e Incertidumbre Óptica — con **12 marcadores "sin datos"**. `errors: []`.
- **Tabla Completa** (`generarTablaMetricasCompleta`): 26 secciones, incluidas «20. Perforaciones» y «21. Horadaciones» **siempre**, Error Óptico, Convex Hull, Forma 3D, Centroide. `errors: []`.

**Dos bugs encontrados y corregidos durante F6:**
1. **Regresión propia (init-abort):** el "un-break" del PDF asignaba `window.generarReportePDFIntegral = generarReportePDFIntegral`, pero esa función **no existe** (su definición local está dentro de un bloque `/* */` comentado desde el refactor; nunca se movió al módulo). El identificador inexistente lanzaba **ReferenceError que abortaba el init** → se perdían `window.__maoE2E` y más. Fix: no asignar; el PDF integral lo arma `generarPDFDesdeHTML` (rama `opciones.integral`) desde datos reales, y los call sites pasan `'<div class="contenedor"></div>'`.
2. **Fragilidad pre-existente de la Tabla:** `generarSeccionClasificacionesIndividuales` accedía `metricas._clasificaciones_individuales.radial_angular` sin guardia → si faltaba, **tumbaba TODA la tabla**. Fix: `Proxy` con fallback "Sin datos".

**Pendiente menor:** flujo de detección→análisis E2E real (timeout en cold-start, ortogonal a la coherencia; los renderers se verificaron directamente). Deuda: `generarReportePDFIntegral` comentado (~905 líneas muertas) — eliminar en limpieza futura.

**Cache-bust:** `analysis-core.js?v=20260624e`. Verificado: `node -c` (4 archivos + manifiesto) + E2E runtime (panel+tabla).
