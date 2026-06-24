# ADR-012 — Detección monolítica (núcleo de segmentación canónico)

- **Estado:** 🟡 **Fase 1 implementada (2026-06-24) — modos manuales** · pendiente verificación
  visual en Electron. `node -c` limpio. Fases 2-3 (automático, IA) diferidas a iteraciones siguientes.
- **Decisión JFRR:** núcleo canónico = pipeline OpenCV `detection.detect()`; motor JS degradado a
  **fallback** solo cuando Python no está. Alcance incremental: **manuales primero**.

## Problema

Tres motores de segmentación **paralelos y redundantes** resuelven el mismo problema (detectar
objetos) con **fidelidad distinta**:

| Motor | Lo usaba | Calidad |
|---|---|---|
| OpenCV `detection.detect()` (`/api/detect`) | **Automático** (botón «Detectar» vía `ejecutarDeteccionAutomatica`, ya desde ADR-007/008) | Z-scan + CLAHE + GrabCut + watershed + confianza |
| JS `detectarObjetosHibrido` (`analysis-core.js`) | **Fallback** del automático + **detección manual de área** (hasta M1) | hand-rolled; **sin confianza** |
| `detect_with_mao_ia()` (`/api/mao-ia`) | Modal IA | el más débil (Otsu + `RETR_EXTERNAL`) |

Premisa («detección monolítica»): **un único núcleo de segmentación canónico**, y que los modos
(automático, manual de área, manual por componente, IA, SAM) sean **priors complementarios** que
alimentan ese núcleo — no reimplementaciones redundantes. Objetivo: **misma fidelidad sea cual
sea el modo**.

> **Corrección (2026-06-24):** la versión inicial de esta tabla afirmaba que el **automático** usaba
> el motor JS. Es falso: el botón «Detectar» (`ejecutarDeteccionAutomatica`, [analysis-core.js:41758])
> **ya enrutaba al núcleo OpenCV** desde el trabajo de detección backend de ADR-007/008 (con fallback
> JS, espera de readiness en frío y aviso al usuario). Es decir, la **«Fase 2» (automático → núcleo)
> ya estaba hecha**; lo único que divergía era el **manual** (resuelto en M1) y queda solo la **IA**
> (Fase 3) como modo aún fuera del núcleo.

## Hallazgo que acota el riesgo

La **etapa de contorno ya era canónica**: `analizarObjetoMorfologicamente` llama a `/api/contour`
(`PythonBridge.contour.extract`) para todos los objetos y ya hereda `detection_confidence` del
núcleo ([analysis-core.js:11881](../js/analysis-core.js)). El `extraerContornoReal` JS (donde vive
el sub-modo de selección por componente) ya es el **fallback** solo-JS. Por tanto, lo único que en
el modo manual aún divergía del núcleo era la **etapa de detección de bboxes**.

## Fase 1 — implementado (modos manuales)

### M1 · La detección manual de área usa el núcleo OpenCV
`detectarObjetosManualRapida(area)` ([analysis-core.js](../js/analysis-core.js)) pasó a `async`:
recorta el ROI (ya lo hacía) y llama a `PythonBridge.detection.detect(roiDataURL, {minArea,
maxObjects:50, separateTouching:true})` — wrapper que **ya existía** y devuelve `null` si Python no
está. Mapea los bboxes/centroides del núcleo sumando el offset del ROI (`area.x/area.y`) y
**hereda `detection_confidence`/`confidence_level`** (el manual ya no nace sin confianza → alimenta
los chips LAAR igual que auto/IA). `detectarObjetosEnArea` y `ejecutarDeteccionEnAreaManual` pasaron
a `async`/`await`. **Fallback:** si `detect()` devuelve `null` (Python caído/inactivo), el control
cae al cuerpo del motor JS, intacto debajo (no se extrajo a otra función: early-return + fall-through,
más simple que el plan original).

### M2 · Coherencia del modo «componente» (no redundante)
`separateTouching:true` hace que el **watershed del núcleo individualice los objetos pegados ya en
la detección** → cada artefacto sale como objeto propio, haciendo **redundante** el sub-modo JS de
selección por componente (`manejarSeleccionComponente`), que solo se dispara dentro del
`extraerContornoReal` de fallback. Queda **documentado como fallback solo-JS** (sin cirugía sobre
`extraerContornoReal`). En esta misma sesión se corrigió un `ReferenceError` previo de ese sub-modo
(estaba anidado por error dentro de `aplicarAnalisisMorfometricoAreaManualMejorado`).

## Caveat conocido (a vigilar en la verificación)
`detect()` aplica, pensado para **imagen completa**, un **filtro de dominancia** (descarta objetos
< 20 % del área del mayor) y un **reordenamiento por relevancia** (penaliza objetos en esquina/borde
como cartas de color / escalas). En una caja manual tales heurísticas podrían descartar/reordenar
objetos pequeños que el usuario sí quería. Si molesta, la corrección (futura, aditiva) es un flag
`roi_mode`/`skip_relevance` en `detect()`. No abordado en Fase 1 para mantener el cambio
frontend-only y reversible.

## Reversibilidad
Aditivo: gateado por `isModuleActive('detection')` + try/catch con fallback al motor JS intacto.
Revertir = quitar la rama backend (un bloque) o forzar el path JS. No se borra ni modifica el motor
JS ni `detection.detect()`.

## Estado de las fases
- **Fase 1 (manual)** — ✅ implementada (M1, ver arriba).
- **Fase 2 (automático)** — ✅ **ya estaba implementada** antes del ADR-012 (ADR-007/008):
  `ejecutarDeteccionAutomatica` ya enruta al núcleo OpenCV con fallback JS. Nada que hacer.
- **Fase 3 (IA)** — ✅ **implementada (2026-06-24)**. Decisión: **opción «Auto (núcleo)» + upgrade**.
  - `detection.detect()` gana el flag aditivo `include_contours` → expone `contour_points` del núcleo
    (gated; sin cambio para el automático).
  - `detect_with_mao_ia` añade la rama `threshold_method == "auto"`: enruta a `detect(separate_touching=True,
    include_contours=True)` y reusa el enriquecimiento por objeto de la IA → **misma fidelidad que
    auto/manual** (Z-scan/GrabCut/watershed/confianza) conservando la salida que el modal espera.
  - Los **modos manuales** (otsu/adaptive/manual) ganan **separación watershed** del núcleo (no-op si
    no hay varios centros) — antes solo `RETR_EXTERNAL`. La confianza por objeto ya la tenían.
  - Endpoint `/api/mao-ia`: `threshold_method` admite `"auto"`. Modal: nueva opción **«Auto (núcleo
    OpenCV) · recomendado» por defecto**; en ese modo los controles de umbral/blur/invert/CLAHE se
    desactivan (no aplican; `min_area`/`max_objects` sí).
- **SAM** se mantiene como prior neuronal (genuinamente complementario, no redundante).

> **Cierre ADR-012:** los **cuatro** caminos de detección (automático, manual de área, IA, y manual por
> componente vía watershed) comparten ya el **núcleo OpenCV canónico**, con el motor JS como único
> fallback (Python ausente). SAM queda como prior neuronal complementario. Premisa cumplida.

## Verificación
- **Estática:** `node -c js/analysis-core.js` ✅.
- **Suite:** `.venv/bin/python -m pytest tests/ python/tests/` — Fase 1 es frontend-only y reusa
  `/api/detect` ya testeado → sin cambios respecto a 288 passed / 2 skipped.
- **Runtime Electron (pendiente):** selección manual sobre zona con 2+ objetos pegados → confirmar
  ruta backend (`[Núcleo OpenCV]` en consola), separación por watershed, chips de confianza poblados
  para objetos manuales; y **fallback**: matar el backend (`kill` puerto 8765) → el path JS sigue
  detectando sin errores de renderer. Relanzar matando+relanzando (no Cmd+R) por la caché `app://`.
