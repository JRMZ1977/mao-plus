# ADR-008 — Contrato de salida de captura (coherencia entre modos de detección)

- **Estado:** En curso (2026-06-13) · Fase 0 (doc) + **Fase 1 (normalizador) + Fase 2 (paridad de confianza) implementadas y verificadas en Electron**; Fase 3 pendiente
- **Decisores:** JFRR (alcance: «establecer coherencia de salida entre modos de captura») · Claude (diagnóstico y diseño)
- **Precedentes:** ADR-005 (lenguaje canónico LAAR + `window.MaoOrganizer`) · ADR-007 (reconciliación captura→análisis, confianza por objeto) · ADR-006 (patrón «registro + contrato» aplicado al núcleo morfométrico). Detección backend: commits `8675ede` (watershed + confianza, retira YOLO), `4fef282` (confianza a UI/CSV).
- **Ámbito:** frontera de **detección → `window.objects`** (frontend) y forma de objeto que emite el backend de detección. **No** toca la lógica de detección de ningún modo, ni el cálculo morfométrico (`metrics.py`), ni la Tier 1 API. Aditivo, con alias, reversible.

---

## Contexto

MAO Plus individualiza objetos por **cuatro caminos** que evolucionaron por
separado y hoy emiten **cuatro formas de objeto distintas** hacia el mismo destino
(`window.objects`, que alimenta el análisis morfométrico, la tabla, el export CSV y
la colección). No existe un contrato que declare **qué campos** debe traer un objeto
detectado ni **con qué nombres**, así que cada consumidor aguas abajo improvisa
(p. ej. el monitor *adivina* el método: `detectionMethod === 'manual_area' ||
detectionArea ? 'manual' : 'automatico'`, `analysis-core.js:12141`).

ADR-007 canonizó la **confianza por objeto** como lenguaje LAAR (chip · filtro de
triage · columnas CSV), pero ese trabajo solo cubre 2 de los 4 caminos. La salida es
incoherente justo en el eje recién entregado.

### Las cuatro fuentes (lo que ya está construido)

| Camino | Origen | `id` nativo | `detectionMethod` | Bbox | Confianza | Pre-morfo |
|--------|--------|-------------|-------------------|------|-----------|-----------|
| Auto **backend** | `detection.detect()` · `detection.py:668` | `PY_01` | `python_automatic` | `bbox{x,y,w,h}` **+** `minX/minY/width/height` | ✅ `detection_confidence`+`confidence_level` | ✅ anidado `mao_ia{}` |
| Auto **frontend** | `detectarObjetosHibrido` · `analysis-core.js:17682` | compuesto (`generarIDObjeto`, `:52047`) | `automatic` | `minX/minY/width/height` | ❌ | ❌ |
| **Manual** | `detectarObjetosEnArea` · `analysis-core.js:16247` | `manual_1` | `manual_area` (+ `region_bfs`, `:19182`) | `minX/maxX/minY/maxY/width/height` (sin `bbox`) | ❌ | ❌ |
| **IA** | `mao_ia_analyzer.analyze` · `mao_ia_analyzer.py:425` → `cardObj` · `analysis-core.js:55051` | `MAO_01` | `mao_ia` | `bbox_x/y/w/h` planos | ✅ | ✅ planos + métricas |

> El **único** camino que emite el ID arqueológico compuesto (`QP1_U1_N1_E1_01`) es
> auto-frontend. Los otros tres usan placeholders no comparables entre sí ni con la
> colección.

### Inventario de deriva por ejes

| # | Eje | Deriva actual | Canónico (este ADR) |
|---|-----|---------------|---------------------|
| **C1** | Confianza (ADR-007) | solo auto-backend + IA la traen → chip/triage/CSV **vacíos** en manual y auto-frontend | `detection_confidence`+`confidence_level` **requeridos** en los 4; se calculan una vez en la frontera del contorno (§ Decisión C) |
| **C2** | Esquema de `id` | 4 convenciones (`PY_*`/compuesto/`manual_*`/`MAO_*`) | `id` = ID arqueológico compuesto en los 4; `source_id` preserva el nativo |
| **C3** | `detectionMethod` | 6 variantes (`python_automatic`, `automatic`, `manual_area`, `region_bfs`, `mao_ia`…) | enum canónico `'automatic' \| 'manual' \| 'ia'`; el crudo va a `detectionMethodRaw` |
| **C4** | Bounding box | 3 representaciones (`bbox{}` / `minX..maxX` / `bbox_x..`) | `bbox:{x,y,w,h}` única; `minX/minY/maxX/maxY` como alias derivados |
| **C5** | Área | `area` / `area_pixels` / `pixelCount` / `area_px`(hull) / `area_fragmentada_px` | `area_pixels` canónica; `area`/`pixelCount` como alias |
| **C6** | Pre-descriptores morfo | anidado `mao_ia{}` (auto-backend), planos (IA), ausentes (manual/auto-frontend) | clave única `morpho{}` opcional, misma forma en los 4 |
| **C7** | Telemetría | IA emite `[MONITOR_ANALISIS]` rico (`mao-ia.js:2614`); auto/manual otra forma | un schema `[MONITOR_DETECCION]` + uno `[MONITOR_ANALISIS]` para los 3 modos |

**Conclusión del diagnóstico:** el tráfico detección→análisis ya circula y funciona;
lo que falta es **el contrato** — una forma única que los 4 caminos produzcan y que
los consumidores (análisis, tabla, CSV, colección, triage) lean sin improvisar. Este
ADR es **ortogonal** a los algoritmos de detección: no cambia cómo se segmenta ni se
mide; (1) define el contrato y (2) lo materializa en una función normalizadora única.

---

## Invariante rector — «un objeto cruza la frontera ya normalizado»

Ningún objeto entra a `window.objects` sin pasar por `normalizarObjetoDeteccion()`.
La frontera es el choke point que ADR-007 ya estableció: los eventos
`mao:objects:rendered` (`analysis-core.js:33591`) y `mao:objects:changed`
(`:43696`). Corolarios:

- **Confianza siempre presente.** `detection_confidence`/`confidence_level` son
  parte del contrato; `null` se permite **solo** cuando es genuinamente incalculable
  (p. ej. contorno aún no resuelto y sin máscara), nunca por «este modo no lo trae».
- **Fuente única de confianza.** El valor autoritativo proviene de
  `_confianza_objeto` (`detection.py:479`) —la misma que alimenta el chip LAAR—, no
  de tres cálculos divergentes.
- **Alias, no renombrado.** Los nombres legacy (`minX`, `area`, `pixelCount`,
  `mao_ia`) se conservan como alias para no romper a los consumidores existentes; el
  contrato **añade** los canónicos. Migración aditiva, igual que ADR-005.

---

## Contrato canónico (forma del objeto de detección)

```
{
  id,                        // SIEMPRE el ID arqueológico compuesto (generarIDObjeto)
  source_id,                 // nativo preservado: 'MAO_01' | 'PY_01' | 'manual_1'
  detectionMethod,           // ENUM: 'automatic' | 'manual' | 'ia'
  detectionMethodRaw,        // crudo del origen: 'python_white_absolute+watershed', …
  bbox: { x, y, w, h },      // ÚNICA representación canónica del bounding box
  // alias derivados (compat legacy): minX, minY, maxX, maxY, width, height
  area_pixels,               // ÚNICA área canónica (px); alias: area, pixelCount
  detection_confidence,      // score ∈ [0,1] | null (regla del invariante)
  confidence_level,          // 'alta' | 'media' | 'baja' | null  (lenguaje ADR-007)
  morpho: {                  // pre-descriptores rápidos (opcional, misma clave en 4)
    circularity, solidity, extent, aspect_ratio, equivalent_diameter
  },
  has_real_contour,          // ya coherente hoy en los 4
  contour_pending            // ya coherente hoy en los 4
}
```

`has_real_contour`/`contour_pending` **ya** son coherentes (los 4 difieren el
contorno real al paso morfométrico lazy); el contrato los formaliza, no los cambia.

---

## Plan por fases (incremental, reversible, aditivo)

| Fase | Alcance | Riesgo | Verificación |
|------|---------|--------|--------------|
| **0 — Documento** | Este ADR. | Nulo | — |
| **1 — Normalizador + alias** | `normalizarObjetoDeteccion(obj, modo)` (nuevo módulo o extensión de `mao-organizer-base.js`). Los 4 caminos la atraviesan antes de `window.objects`. Canoniza `id` (C2), `detectionMethod` (C3), `bbox`+alias (C4), `area_pixels`+alias (C5). **No** añade confianza todavía. | Bajo | runtime Electron (sonda DOM `MAO_PROBE` sobre `window.objects`) + suite Python sin regresión |
| **2 — Paridad de confianza** | La confianza se computa **una vez, en la frontera del contorno** vía `_confianza_objeto` para los 4 modos. Auto-backend/IA conservan su score como *preview*; se reconcilia con el autoritativo al resolver el contorno. Cierra C1 + C6. | Medio | 3 modos muestran chip/filtro/CSV de confianza con imagen real en Electron |
| **3 — Telemetría + export + guard** | Un schema `[MONITOR_DETECCION]`/`[MONITOR_ANALISIS]` compartido (C7); columnas CSV idénticas en los 3 modos; **guard de schema** en modo dev que valida el contrato al despachar `mao:objects:rendered`. | Bajo | CSV de los 3 modos diff-idéntico en columnas; guard registra 0 violaciones |

La Fase 1 es **estructural pero aditiva** (alias; nada legacy se borra). La Fase 2 es
la única que toca el momento de cálculo (mueve la confianza a la frontera del
contorno) y exige verificación visual. La Fase 3 es presentación + telemetría.

---

## Implementado — Fase 1 (2026-06-13)

Módulo nuevo `js/mao-deteccion-contract.js` (`window.MaoDeteccion`), cableado en el
**único** choke point `individualizarObjetos()` (`analysis-core.js`, el render que
despacha `mao:objects:rendered`): `if (window.MaoDeteccion) MaoDeteccion.normalizarLista(objects)`
antes del agrupado/triage. Script en `index.html` tras `mao-organizer-base.js`
(`?v=20260613b`). El normalizador es **idempotente** y **nunca lanza** (el render es
crítico). Resuelto por eje:

| Eje | Resultado |
|-----|-----------|
| **C3** | `detectionMethod` → enum `'automatic'\|'manual'\|'ia'`; crudo preservado en `detectionMethodRaw`. Monitor (`analysis-core.js:12141`) acepta enum y crudo. |
| **C4** | `bbox:{x,y,w,h}` derivado de cualquier forma (`bbox`/`minX..`/`minX..maxX`/`bbox_x..`); `minX/minY/maxX/maxY/width/height` rellenados **solo si faltan** (nunca se sobrescriben). |
| **C5** | `area_pixels` canónica; `area`/`pixelCount` como alias rellenados si faltan. |
| **C2** ⚠ | **Split.** Solo la mitad aditiva: `source_id = id` nativo. **El rewrite de `id` se difiere** (ver abajo). |
| **C6** | `morpho{}` reunido de `mao_ia`/`_maoIA`/campos planos (aditivo, opcional). |

**Hallazgo que parte C2 (decisión de implementación):** reescribir `id` en caliente
es inseguro. `id` es **clave de join viva** en ~17 sitios `find(o => o.id === obj.id)`
(entre `objects`, `analisisMorfologicos.objetos` y el caché por objeto) y es la
**identidad persistida** en `collection.js` (`data-analysis-id`, ID arqueológico de
export). Si el normalizador reescribiera `id` después de que un objeto se analizó o
guardó bajo su id nativo, todos esos joins romperían en silencio. Por eso C2 se
divide: **Fase 1 añade `source_id`** (riesgo cero) y el **rewrite de `id` a compuesto
queda como migración aparte** — debe ocurrir en el **punto de creación** de cada
camino (no en el normalizador) y mover las claves de dedupe/colección a
`source_id`+`numeroObjeto`+`cara`. Eso convierte la Decisión A en una sub-fase propia
con su propia ratificación.

**Verificación Fase 1:** `node -c` (contract + analysis-core) ✓ · test del
normalizador en node con una muestra de los 4 modos + idempotencia (20/20) ✓ · suite
Python `257 passed, 2 skipped` (baseline; Fase 1 no toca Python) ✓ · **sonda DOM en
Electron en vivo** (gated `MAO_PROBE=1`, revertida tras usar) ✓:

- `MaoDeteccion` y `MaoOrganizer` cargados, orden correcto, `CONTRACT_VERSION=1`.
- El choke point real `individualizarObjetos()` normalizó los **4 modos** inyectados
  en `window.objects` (getter que devuelve la referencia viva): `detectionMethod`
  enum (`automatic`/`manual`/`automatic`/`ia`), `detectionMethodRaw` preservado
  (`manual_area`/`python_automatic`), `bbox{x,y,w,h}`, `source_id`=id nativo, `id`
  intacto, `morpho` presente en py/IA, sello `__contrato=1`.
- `renderThrew=false` (el render toleró objetos sintéticos sin imagen) · 0 errores de
  renderer en stdout.

Queda fuera de la sonda lo que exige interacción manual (heredado de ADR-003/004/007):
el flip con **archivos reales** (los `<input type=file>` no se pueblan por script).

---

## Implementado — Fase 2 (2026-06-13)

Cierra **C1** (confianza en los 4 modos) reutilizando la frontera del contorno.
**Decisión C resuelta por evidencia → Opción 2** (no se abrió endpoint batch): el
análisis por objeto **ya** hace round-trip a `/contour` (`PythonBridge.contour.extract`,
`analysis-core.js:11879`), así que se extendió ese endpoint en vez de añadir llamadas.

| Capa | Cambio |
|------|--------|
| Backend | `contour.extract` (`contour.py`) computa `detection_confidence`/`confidence_level` con `_confianza_objeto` (import a nivel de módulo; `contour.py` ya dependía de `detection.py`, sin ciclo nuevo) sobre la **máscara y el ROI ya calculados** — 0 round-trips extra. El endpoint `/contour` los devuelve. Calidad geométrica (`quality`) ≠ confianza de detección: son campos distintos. |
| Frontend | Tras `contour.extract` (`analysis-core.js:~11899`) se adjunta la confianza **autoritativa** al objeto: `detection_confidence`/`confidence_level` + alias legacy `_confidence`/`_confidenceLvl`. Manual y auto-frontend la **heredan aquí**; auto-backend/IA reconcilian su preview de detección. |
| Contrato | El normalizador (`mao-deteccion-contract.js`) gana la sincronización de alias de confianza (**C1**): canónico ↔ legacy en ambos sentidos, para que triage (`_confidenceLvl`), viz-export y CSV la vean venga del campo que venga. No inventa confianza si no existe. |

**Fuente única.** Las cuatro vías usan ahora `_confianza_objeto` (contraste de borde +
extent) — la misma que alimenta el chip LAAR de ADR-007. La confianza es **autoritativa
en el análisis** (frontera del contorno), donde los 4 modos tienen un contorno real
comparable; calcularla antes exigiría máscaras por-modo (la divergencia que se elimina).

**Límite aceptado.** El **chip de triage pre-análisis** se puebla solo donde es natural
(auto-backend/IA, que calculan una máscara en detección). Manual/auto-frontend obtienen
la confianza **al analizar** (tarjeta + CSV + colección = la «salida» coherente). Poblar
también su triage pre-análisis exigiría el endpoint batch (alternativa de la Decisión C),
deferida por no ser necesaria para la coherencia de **salida**.

**Verificación Fase 2:** suite Python `260 passed, 2 skipped` (+3 tests en
`tests/test_contour.py`: claves de confianza presentes, nivel canónico, score ∈ [0,1] y
no-nulo para objeto nítido) ✓ · test del aliasing en node (6/6: legacy→canónico,
canónico→legacy, manual no inventa) ✓ · **sonda Electron end-to-end** (gated
`MAO_PROBE=2`, revertida) ✓: aliasing live en ambos sentidos + **bridge real
`PythonBridge.contour.extract` con imagen sintética → `score=0.675, level='alta'`**
(coincide con `0.65·contraste+0.35·extent`), `contourActive=true`, 0 errores de renderer.

> **Gotcha de verificación (uvicorn obsoleto):** la 1ª corrida dio `hasConf:false` pese
> al código correcto — un `uvicorn` previo seguía vivo en `:8765` sirviendo el `/contour`
> viejo (uvicorn **no recarga** y la app **reusa** un puerto sano). Al editar backend y
> verificar en vivo: `lsof -ti tcp:8765 | xargs kill -9` antes de relanzar.

---

## Decisiones de diseño (a confirmar en Fase 1)

### A · El `id` canónico es el compuesto arqueológico
`generarIDObjeto` produce el ID que la colección y el export ya esperan. Unificar
los 4 caminos a él hace los objetos comparables end-to-end. **Riesgo conocido:** el
ID compuesto depende del estado del proyecto (QP/U/N/E); si la identificación cambia
entre detección y export, `source_id` + `numeroObjeto`+`cara` son la clave estable
de dedupe (igual que ya hace el camino IA en `analysis-core.js:55039`).

### B · `normalizarObjetoDeteccion` vive en la capa organizer
Espejo del patrón `window.MaoOrganizer` (ADR-005/D4). La **lógica de detección**
permanece en el core legacy y en el backend; la **normalización** es presentación de
datos y vive en la capa estranguladora — invocable por evento desde cualquier UI
futura, coherente con la frontera Strangler Fig de ADR-007/D3.

### C · Confianza en la frontera del contorno, no por modo
En vez de portar `_confianza_objeto` a JS (manual/auto-frontend son client-side) y
mantener 3 implementaciones, se calcula **una vez** cuando el contorno real se
resuelve (paso lazy compartido por los 4). Una sola fórmula, un solo punto de
mantenimiento; manual y auto-frontend **heredan** la confianza sin código nuevo de
cálculo. Decisión a ratificar: si el round-trip al backend en el paso lazy es
aceptable, o si se expone `_confianza_objeto` como endpoint batch.

---

## Restricciones (reglas del proyecto)

- **Strangler Fig / reversibilidad:** desactivar el normalizador (comentar su
  `<script>`) hace que los objetos crucen con su forma legacy; los consumidores
  legacy siguen funcionando por los alias. Nada se borra.
- **Tier 1 API intacta:** sin cambios en `mao-ia.js` ni `collection.js`. El contrato
  **añade** campos; no retira los que esos callers leen.
- **Dependencia dura `MaoOrganizer`:** si el normalizador vive en/junto a
  `mao-organizer-base.js`, hereda su orden de carga (antes que los organizers).
- **Caché `file://`:** bump de `?v=` en `index.html` para todo `.js`/`.css`
  versionado que se toque (los organizers y la base ya van versionados).
- **Verificación en Electron real:** `node -c`/health no ven el flip de chips, el
  orden de columnas ni el CSV con archivos reales (lección #1). Sonda DOM en runtime.
- **Máquinas de estado de alto riesgo** (Detección, Selección Manual, Modal de
  Perforación) **no** se reescriben: el normalizador se aplica a su **salida**, no a
  su lógica interna.

---

## Consecuencias

- ✅ Una sola forma de objeto detectado: análisis, tabla, CSV, colección y triage
  dejan de improvisar el método, el bbox y el área.
- ✅ La confianza (ADR-007) deja de tener huecos: chip/filtro/CSV pueblan en los 4
  caminos, no en 2.
- ✅ IDs comparables end-to-end (detección ↔ análisis ↔ colección ↔ export).
- ✅ La cuarta pestaña (Resultados) y el comparador heredan un contrato declarado en
  vez de descubrirlo leyendo cuatro funciones — mismo dividendo que ADR-006 dio al
  backend morfométrico.
- ✅ Aditivo y reversible: el normalizador se desactiva sin romper a los consumidores
  legacy (alias).
- ⚠ La Fase 2 mueve el momento de cálculo de la confianza (a la frontera del
  contorno): exige verificar que auto-backend/IA siguen mostrando el mismo nivel tras
  reconciliar el *preview* con el valor autoritativo.
- ⚠ El contrato debe mantenerse sincronizado: si un modo añade/renombra un campo, el
  guard de schema (Fase 3) lo detecta en dev — esa es la red de seguridad, no un
  efecto colateral.
- ⚠ **Pendiente heredado:** probar con archivos reales (los `<input type=file>` no se
  pueblan por script) — mismo límite manual de ADR-003/004/007.
