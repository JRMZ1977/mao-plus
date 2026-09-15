# ADR-019 — Procedencia de detección y error óptico en todas las salidas, con índice canónico

**Estado:** ✅ Implementado (F0–F7) · 2026-07-31
**Contexto previo:** ADR-008 (contrato de salida de captura), ADR-011 (taxonomía canónica de
categorías), ADR-016 (saneamiento del reporte — cierra su hallazgo #5).

---

## 1. Problema

Tres mejoras encadenadas sobre los informes exportados, con una misma causa de fondo: **el
orden, el nombre y la cobertura de las secciones estaban hardcodeados por separado en cada
superficie de exportación**, en vez de derivarse de la fuente única
`js/modules/category-manifest.js` — que ADR-011 creó pero **nunca cableó a ningún renderer**
(cero imports en todo el repo).

### 1.1 La procedencia de detección no se almacenaba en modo IA

El flujo IA construye en `js/mao-ia.js` un objeto nuevo para el renderer que sólo llevaba
`_samSegmented: true`. El contrato ADR-008 normaliza método y confianza, pero se aplica en un
único choke point (`normalizarLista(objects)` dentro de `individualizarObjetos()`) que **ese
objeto no atraviesa**. Como `metricas.json` persiste literalmente el objeto de métricas, lo que
no se escribía ahí no se almacenaba y no podía exportarse después.

La cadena estaba cortada en **cinco puntos independientes**:

| # | Corte | Efecto |
|---|-------|--------|
| 1 | El productor escribía `detection_confidence_level`; el informe batch y el CSV de colección leían `confidence_level` | Nivel de confianza vacío **siempre, en los tres modos** |
| 2 | La confianza autoritativa de `/contour` se asignaba dentro de `if (!obj._samSegmented)` | Los objetos IA **nunca** recibían confianza |
| 3 | El objeto IA no llevaba campos de detección | Ficha IA sin método ni confianza |
| 4 | `params_used` (umbral, modelo, CLAHE…) se descartaba entero — no se referenciaba ni una vez en `js/` | Imposible declarar **cómo** se detectó |
| 5 | La fusión con las métricas de Python descartaba todo lo no listado a mano | Merge-drop, el mismo que ya obligó a preservar los 11 `error_optico_*` |

Arreglar uno solo dejaba el dato igualmente sin llegar.

### 1.2 El error óptico no llegaba a todas las combinaciones

El cálculo es sólido y agnóstico del modo por diseño (`aplicarErrorOpticoPosicional`), y **en
PDF estaba cubierto en los cuatro casos**, bifacial incluido. La laguna estaba en CSV y en dos
detalles de exactitud:

- 🔴 **Ningún CSV bifacial emitía la Sección IX.** La ruta viva usaba una lista blanca legacy de
  ~10 claves, sin error óptico, sin GLCM y con el área en `cm²`.
- 🔴 **`generarCSVMetricas` degradaba CSVs ya enriquecidos**: reescribe `metricas.csv` desde el
  visor de colección y no tenía error óptico → un análisis que lo tenía lo **perdía**.
- 🟠 **Bifacial sesgado a Cara A**: `escalaParamsOpticos` es un global único poblado desde
  `imageWidthCaraA`; el camino híbrido usaba directamente los globales *monofaciales*. Con dos
  fotos de distinta resolución, la Cara B se normalizaba contra las dimensiones de la A.
- 🟠 **El fallback por bounding box escribía 4 de los 11 campos** → Sección IX mutilada.
- 🟡 `posicion_radial_px` se calculaba y **no se exportaba en ningún CSV ni PDF**.

### 1.3 El índice canónico estaba roto en tres sentidos

1. **Desordenado**: la Tabla Completa emitía `II → VIII → III → …`; la secuencia de llamada no
   guardaba relación con los romanos escritos a mano en cada sección.
2. **Colisiones y mezcla de sistemas**: `XII-a` rotulaba dos secciones distintas; Simetría era
   `VI-b` en el módulo y `XI-b` en la copia de `analysis-core.js`; las P/H usaban arábigo
   (`20.`, `21.`), y convivían con `3.`, `4.` y `10.`
3. **El único índice coherente estaba inalcanzable**: vivía en `generarHTMLReporteParaBatch`,
   pero el commit `bc9cdc9` lo pasó de `window.…` a `const` local mientras su único consumidor
   seguía gateando con `typeof window.generarHTMLReporteParaBatch === 'function'`. El `if` era
   siempre falso: **el PDF batch se saltaba en silencio**, sin warning ni fallback.

---

## 2. Decisión

Decisiones tomadas por JFRR (AskUserQuestion, 2026-07-31):

| Punto | Decisión |
|---|---|
| Índice | **Renumerar de cero**, contiguo, sin arábigos ni duplicados |
| Datos de detección | **Núcleo** (método canónico + crudo + score + nivel) **+ parámetros del modo IA**. *No* se incluyen bbox/área px ni procedencia ROI/PH |
| Alcance | Superficies canónicas **+ bifacial** |
| Registro | ADR propio (este), cerrando ADR-016 #5 |

**Principio rector:** el informe declara sus **condiciones de producción antes que sus
resultados** — cómo se detectó el objeto y con qué incertidumbre se midió, antes de cualquier
métrica morfométrica.

---

## 3. Índice canónico nuevo

Vive **una sola vez**, en el campo `indice` de `js/modules/category-manifest.js`. Ninguna
superficie vuelve a escribir un numeral a mano; todas piden `encabezadoDe(id)`.

| # | Índice | Categoría | Tipo |
|---|--------|-----------|------|
| 1 | **I** | Detección del Objeto *(NUEVA)* | estructural |
| 2 | **II** | Error Óptico Posicional | estructural |
| 3 | **II-b** | Incertidumbre Propagada por Métrica | estructural |
| 4 | **III** | Identificación y Clasificación | estructural |
| 5 | **IV** | Dimensiones Métricas del Objeto | estructural |
| 6 | **V** | Proporciones y Forma Global | estructural |
| 7 | **VI** | Análisis Radial y Regularidad del Contorno | estructural |
| 8 | **VII** | Rugosidad y Complejidad del Borde | estructural |
| 9 | **VII-b** | Curvatura | estructural |
| 10 | **VIII** | Envolvente Convexa (Convex Hull) | estructural |
| 11 | **IX** | Ejes, Orientación y Posición Espacial | estructural |
| 12 | **IX-b** | Simetría Bilateral | estructural |
| 13 | **IX-c** | Centroide y Posición Espacial | estructural |
| 14 | **X** | Geometría de Vértices | estructural |
| 15 | **XI** | Forma 3D Inferida | estructural |
| 16 | **XII** | Estado de Conservación y Fragmentación | estructural |
| 17 | **XIII** | Textura Óptica (GLCM) | estructural |
| 18 | **XIV** | Depuración Estadística de Contorno | estructural |
| 19 | **XV** | Perforaciones | factual |
| 20 | **XV-b** | Horadaciones | factual |
| 21 | **XVI** | Patrón de Agrupamiento | factual |
| 22 | **XVII** | Características Geométricas Avanzadas | estructural |
| 23 | **XVIII** | Clasificación y Síntesis | estructural |
| 24 | **XIX** | Información Técnica / Metadatos | estructural |
| 25 | **XX** | Comparación Bifacial | comparativa |
| 26 | **XX-b** | Análisis Comparativo Objeto–P/H | comparativa |

Las dos `comparativa` van **al final** a propósito: son condicionales por naturaleza (requieren
otra cara o P/H), y si se intercalan, el índice de las estructurales deja de ser contiguo en
cuanto una falta.

### 3.1 Tabla de equivalencias (índice viejo → nuevo)

Necesaria porque «Sección IX = error óptico» aparece en `APORTE-MAO-PROTEC2025.md`, en ADR-016
y en informes ya entregados a la UAB.

| Antes | Ahora | Sección |
|-------|-------|---------|
| I | III | Identificación y Clasificación |
| II | IV | Dimensiones métricas |
| III | V | Proporciones y forma global |
| III-b | XI | Forma 3D inferida |
| IV | VI | Análisis radial / regularidad del contorno |
| IV-b | VIII | Convex hull |
| V | VII | Rugosidad y complejidad del borde |
| V-b | VII-b | Curvatura |
| VI | IX | Ejes, orientación y posición espacial |
| VI-b | IX-b | Simetría bilateral |
| VI-c | IX-c | Centroide |
| VII | X | Geometría de vértices |
| VIII | XII | Conservación y fragmentación |
| VIII-b | XII-b | Defectos y conservación |
| **IX** | **II** | **Error óptico posicional** |
| **IX-B** | **II-b** | **Incertidumbre propagada** |
| X / X-b · «20.» / «21.» | XV / XV-b | Perforaciones / Horadaciones |
| XI (patrón) | XVI | Patrón de agrupamiento |
| XI-a · «4.» | IX-a | Orientación y ejes principales |
| XI-b (simetría, copia core) | IX-b | Simetría bilateral |
| XI-b (distribución P/H) | XIX | Información técnica / metadatos |
| XII-a (avanzadas) | XVII | Características geométricas avanzadas |
| XII-a (tipología) | XVIII-b | Tipología arqueológica |
| XII-b | XVIII-c | Clasificación morfológica detallada |
| XII-c | XVIII-d | Clasificaciones complementarias |
| XII-d | XVIII-e | Síntesis final integrada |
| XIV / XIV-b | XIII / XIII-b | Textura de superficie / GLCM |
| «3.» | V-a | Métricas morfológicas principales |
| «10.» | XVIII-a | Clasificaciones individuales |
| — | **I** | **Detección del objeto (nueva)** |

---

## 4. Implementación

### F1 · Regresión del PDF batch
`window.generarHTMLReporteParaBatch` reexpuesta, y `console.warn` en el `else` del gate de
`project-manager.js` para que una futura desconexión no vuelva a ser silenciosa.

### F2 · El manifiesto como fuente única
`category-manifest.js` gana la entrada `deteccion`, el campo `indice` por entrada, el orden
nuevo y los helpers `indiceDe()`, `encabezadoDe()` y `validarManifiesto()`. Se expone en
`window.CategoryManifest` (precedente: `window.MetricPresenter`) porque `project-manager.js` es
script clásico y no puede `import`.

### F3 · Procedencia end-to-end
Nuevo **escritor único** `MaoDeteccion.aplicarProcedencia(metricas, obj)`, invocado desde los
cuatro modos después de toda fusión. Además: clave de nivel unificada (escribe ambas, canónica
`confidence_level`), gate `_samSegmented` levantado sobre la confianza (protege el contorno, no
la procedencia), objeto IA sellado con `MaoDeteccion.normalizar`, `params_used` capturado y
proyectado, y bloque `deteccion` en `metadata.json`.

### F4 · Sección I + error óptico en todas las salidas
Nuevo módulo `js/modules/detection-section.js`: fuente única de **qué filas** componen la
sección (las superficies aportan el estilo). Consumido por Tabla Completa, CSV principal, CSV de
regeneración, PDF batch, PDF integral, PDF bifacial y panel.

Error óptico: CSV bifacial migrado al extractor canónico monofacial (−87 líneas de lista blanca
legacy), categoría añadida a `generarCSVMetricas`, `escalaParamsOpticos.porCara` para que cada
cara se normalice contra su propia foto, fallback por bounding box completado a 11/11 campos, y
`posicion_radial_px` + nota + incertidumbre propagada añadidos al CSV.

### F5 · Índice aplicado
60 numerales hardcodeados sustituidos por `encabezadoDe(id)` / `indiceDe(id)` en
`tabla-metricas-completa.js` (30) y `analysis-core.js` (30), y las secuencias de emisión
reordenadas al orden canónico.

### F6 · Bugs colaterales
- `_f(m.confianza_optica)` aplicaba `parseFloat` a un string → columna vacía siempre. → `_csvVal`.
- El semáforo de confianza óptica buscaba `'Media'`, pero la categoría real es `'Moderada (< 3%)'`.
- La Sección IX del panel no llevaba `.morphological-metric` → su CSV nunca la incluía.
- El export de dataset ML usaba `|| 1.0`: un objeto **sin** confianza se exportaba como
  **perfecto** y el filtro `min_confidence` lo dejaba pasar siempre. Ahora «no medida» es un
  estado propio (`null`) y no supera un filtro de confianza.
- Eliminadas `exportarObjetoBifacialCompletoUnificado` y `extraerMetricasCompletasConPH`
  (~400 líneas, sin llamadores): eran una cuarta copia divergida de la lógica de export.

---

## 5. Enforcement

`python/tests/test_coherencia_entrega.py` (+4 tests, análisis estático de los `.js`):

- `test_manifiesto_indice_contiguo_y_unico` — ids y numerales únicos, `orden` contiguo desde 1.
- `test_manifiesto_abre_con_procedencia` — las tres primeras son detección → error óptico →
  incertidumbre.
- `test_las_comparativas_van_al_final` — ninguna estructural después de una comparativa.
- `test_ninguna_superficie_hardcodea_el_indice_romano` — **cero** numerales escritos a mano
  fuera del manifiesto. Es lo que impide que el índice vuelva a desincronizarse en silencio.

**Suite: 347 passed, 2 skipped** (línea base previa: 342/2).

---

## 6. Reversibilidad y riesgos

- **Renumerar rompe referencias externas.** Mitigado con la tabla de equivalencias de §3.1.
- **`window.CategoryManifest`/`window.DetectionSection`** son dependencia de superficies que no
  son módulos ES. Se declaran junto a `window.MetricPresenter`, con fallback defensivo en los
  puntos de consumo.
- **Superficies duplicadas.** Siguen existiendo 26 `generarSeccion*` clonadas entre
  `tabla-metricas-completa.js` y `analysis-core.js`. Aquí sólo se alinearon sus numerales; la
  consolidación real es deuda de `COHERENCIA-MODULOS.md` y queda fuera de este ADR.
