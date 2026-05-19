# Contrato de compaginación MAO_Plus ↔ MAO_A (v1)

Fecha: 2026-04-27  
Estado: Propuesta técnica operativa (lista para implementación)  
Ámbito: MAO_Plus (`/Users/juanramirez/Documents/MAO PLUS_PY_01`) y MAO_A (`/Users/juanramirez/Documents/MAO_A`)

---

## 1) Objetivo y criterio de éxito

Establecer una **compaginación estable** entre MAO_Plus y MAO_A sin duplicar ni divergir la matemática morfométrica.

Criterio de éxito:

1. Mismo input geométrico/fotográfico produce mismas métricas canónicas en ambos repos.
2. La capa online de MAO_A no altera fórmulas ni nombres del núcleo matemático.
3. Las salidas son interoperables en exportación, colección y comparador.

---

## 2) Flujo operativo reconstruido

1. Captura/detección/contorno (JS + Python endpoint).
2. Cálculo de métricas canónicas (`/api/metrics`, `/api/ph_metrics`, `/api/bifacial`, `/api/scale`).
3. Persistencia y trazabilidad (`collection_index.json`, `trazabilidadMetricas`).
4. Comparación estadística (`/api/pca`, `/api/statistics`) y reportes.
5. Extensión online MAO_A (`/api/projects`, `/api/jobs/*`) sobre los mismos objetos métricos.

Principio rector: **la matemática vive en núcleo compartido; el modo online vive como extensión**.

---

## 3) Inventario de paridad actual

### 3.1 Núcleo idéntico (canónico, no duplicar)

- `python/modules/metrics.py`
- `python/modules/analysis.py`
- `python/modules/mao_ia_analyzer.py`

### 3.2 Diferencias funcionales esperadas

- Solo MAO_A:
  - `python/modules/online_jobs.py`
  - `js/mao-a-module.js`
- Diferentes entre repos:
  - `python/server.py`
  - `js/analysis-core.js`, `js/mao-ia.js`, `js/comparator.js`, `js/project-manager.js`, `js/collection.js`, `js/cmo-standalone.js`
  - `package.json`

Diagnóstico: la divergencia está en orquestación/UX/modo online, no en el corazón matemático crítico.

---

## 4) Hallazgos priorizados

### Crítico

1. Riesgo de deriva semántica de campos métricos entre capas JS/API/export.
2. Riesgo de inversión silenciosa de ratios si cambian convenciones de implementación.

### Alto

1. Diferencias de `server.py` pueden introducir payloads incompatibles entre apps.
2. APS online en MAO_A aún no implementado en Python (contrato existe, motor no).

### Medio

1. Inconsistencias históricas de naming bilingüe (`perimeter` vs `perimetro`, etc.) que requieren alias controlados.

---

## 5) Contrato canónico v1 (obligatorio)

## 5.1 Reglas generales

1. Agregar campo `schemaVersion` en respuestas y artefactos exportados.
2. Mantener `metricas` como objeto principal de medidas morfométricas.
3. Campos legacy permitidos solo como alias de lectura (no como fuente única).
4. Toda métrica derivada debe preservar fórmula y dirección del ratio canónico.

## 5.2 Endpoints mínimos de paridad

Ambos repos deben conservar contrato equivalente (request/response):

- `GET /api/health`
- `POST /api/metrics`
- `POST /api/ph_metrics`
- `POST /api/bifacial`
- `POST /api/scale`
- `POST /api/pca`
- `POST /api/statistics`

Extensión exclusiva de MAO_A (no bloqueante para MAO_Plus):

- `POST /api/projects`
- `GET /api/projects/{project_id}`
- `GET /api/projects/{project_id}/collections`
- `POST /api/projects/{project_id}/collections/upload`
- `POST /api/jobs/cmo`
- `POST /api/jobs/aps`
- `GET /api/jobs/{job_id}`
- `GET /api/jobs/{job_id}/result`

## 5.3 Campos canónicos críticos

### `/api/metrics`

- `status`
- `metricas.area`
- `metricas.perimeter`
- `metricas.circularity`
- `metricas.elongation`
- `metricas.solidity`
- Campos derivados en mm cuando aplique (`*_mm`, `*_mm2`)

### `/api/ph_metrics`

- `perforaciones[]`
- `horadaciones[]`
- `area_efectiva`
- `count_perforaciones`
- `count_horadaciones`
- En cada P/H: `area`, `perimetro`, `circularidad`, `convexidad`, `feret_ratio`

### `/api/bifacial`

- Legacy de compatibilidad: `indiceSimetriaGeneral`
- Canónico sección XIII:
  - `CI`
  - `CMS`
  - `subindicesCMS`
  - `interpretacionCI_CMS`

### `/api/scale`

- `scale_px_mm`
- `error_optico` (bloque completo de indicadores)

## 5.4 Matriz de alias permitidos (lectura)

| Canónico | Alias legacy tolerado | Regla |
|---|---|---|
| `perimeter` | `perimetro` | normalizar en capa de adaptación |
| `circularity` | `circularidad` | normalizar en capa de adaptación |
| `convexity` | `convexidad` | normalizar en capa de adaptación |
| `mean` | `media` | solo en estadísticos legados |

Nota: el write-path (persistencia nueva/export nuevo) debe escribir nombre canónico.

---

## 6) Trazabilidad y gobernanza

1. Persistir `trazabilidadMetricas` por objeto en índice de colección.
2. Mantener resumen `collection.trazabilidadMetricas` para auditoría rápida.
3. Incluir en trazabilidad:
   - versión de contrato (`schemaVersion`)
   - módulos usados (`metrics`, `ph`, `bifacial`, `scale`)
   - presencia de CI/CMS
   - flags de calidad del análisis

---

## 7) Plan de remediación por fases

### Fase 1 — Congelación del contrato (quick win)

- Publicar este contrato como referencia oficial v1.
- Añadir `schemaVersion` en salidas de endpoints canónicos.
- Consolidar tabla de alias y adaptadores de lectura.

### Fase 2 — Hardening de paridad

- Suite de paridad MAO_Plus vs MAO_A para endpoints canónicos.
- Dataset fijo de regresión (mismos contornos y payloads P/H).
- Gate de CI: no merge si rompe paridad en métricas críticas.

### Fase 3 — Arquitectura compartida

- Extraer núcleo matemático a paquete compartido interno (`mao_core` o equivalente).
- Dejar `online_jobs` y UI como capas consumidoras del mismo core.

---

## 8) Verificación mínima exigida

1. `pytest tests/test_metrics.py tests/test_ph.py tests/test_comparator.py`
2. Prueba cruzada de payload igual en ambos repos para:
   - `/api/metrics`
   - `/api/ph_metrics`
   - `/api/bifacial`
3. Confirmar igualdad (o tolerancia numérica definida) en:
   - `area`, `perimeter/perimetro`, `circularity/circularidad`
   - `CI`, `CMS`, categoría `interpretacionCI_CMS`

---

## 9) Riesgos residuales

1. APS online aún pendiente de portar a backend Python en MAO_A.
2. Flujos UI distintos pueden ocultar campos si no pasan por adaptador canónico.
3. Cualquier cambio de naming sin alias rompe exportación histórica.

---

## 10) Decisión operativa recomendada

- Declarar desde ya: **MAO_Plus define el contrato matemático canónico**.
- Declarar desde ya: **MAO_A extiende ese contrato en modo online**.
- No introducir nuevas fórmulas en UI/JS sin test de paridad Python equivalente.

Con esto, la compaginación deja de depender de “buena voluntad de sincronía” y pasa a depender de contrato + pruebas reproducibles.
