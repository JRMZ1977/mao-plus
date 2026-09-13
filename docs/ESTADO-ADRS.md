# Estado consolidado de los ADR — MAO Plus

> Fuente única de verdad del estado de implementación de cada ADR.
> Generado el 2026-06-18 (F1.4 del roadmap de continuación). Reconcilia el estado real
> contra el git log, porque varias cabeceras `Estado:` de los docs individuales quedaron
> **obsoletas** (se redactaron al *aprobar* el ADR y no se actualizaron al *implementarlo*).

## Tabla maestra

| ADR | Título | Estado real | Commit(s) | Pendiente / nota |
|-----|--------|-------------|-----------|------------------|
| 001 | Guards de flujo UI | ✅ Implementado | `3ba869c` | — |
| 002 | Pestaña Análisis | ✅ Fases 1-4 implementadas | `6f922c8` (F2), `e04c9ac` (F1/3/4) + fixes `8da3277`, `67a6599` | ⚠ cabecera del doc dice «implementación pendiente por fases» — **OBSOLETA** |
| 003 | Pestaña Proyecto | ✅ Fases 1-3 impl. + verificadas en Electron | `a10418b` | Auto-ID (Opción C) con archivos reales — límite `<input type=file>`, lo cubre ADR-010 |
| 004 | Pestaña Captura | ✅ Fases 1-3 implementadas | `dec1724` | ⚠ cabecera dice «Fase 1 en implementación» — **OBSOLETA**. Flip de chips con archivos reales (ADR-010) |
| 005 | Armonización transversal LAAR | ✅ Implementado + verificado en Electron | `6ce72d6` | ⚠ cabecera dice «implementación por fases» — **OBSOLETA** |
| 006 | Repertorio canónico morfométrico 2D↔3D | ✅ Completado (Fases 0-3) | `1c26686` (F0), `63694bf` (F1-3) | ⚠ cabecera dice «Propuesto · Fase 0» — **OBSOLETA**. Impacto CSV/PDF = cero |
| 007 | Reconciliación flujo captura→análisis | ✅ Implementado + verificado en Electron | `a9d3dc6`, `4fef282` | — |
| 008 | Contrato de salida de captura | ✅ Completado (Fases 0-3) | `d3e4628` (F1+2), `d12a2a6` (F3) | ⏸ **C2 DIFERIDO** (rewrite de `id` a compuesto, riesgo alto — `id` es clave de join viva) |
| 009 | Detección P/H primaria | ✅ Completado (Fases 0-4) + fixes prueba real | `84778ac` | Confirmación visual chip+modal con imagen real (ADR-010) |
| 010 | Hook verificación E2E `window.__maoE2E` | ✅ Implementado | `526cf42` | Ejecutar el checklist de 8 ítems (tarea F1.2 del roadmap) |
| 012 | Detección monolítica (núcleo OpenCV canónico) | ✅ Fases 1-3 (auto ya estaba por ADR-007/008; manual=M1; IA=opción «Auto (núcleo)») | `eaf01d3` | Los 4 modos comparten el núcleo; JS = fallback; SAM = prior. Verif: suite 288/2 + HTTP `/api/mao-ia auto`. Caveat: dominancia/relevancia de `detect()` en ROI manual. Pendiente: verif. visual modal IA en Electron |
| 013 | Figura-fondo primaria; instancias subordinada y no destructiva | 🟡 F1 impl. (commit `ad1763b`) · **F2 aprobada (replicabilidad), impl. pendiente** | `ad1763b` | **F1** fix `_separate_touching_watershed`: máscara de siembra limpia (`_fill_holes` + descarte specks, **sin** `MORPH_CLOSE` que fusionaba pegados). Verif: `DRG16` 8→1, `sintetico_pegados`→2, suite 288/2. + fix crash `puntos_originales` (visualization-export.js:887 y 2380). **F2** replicabilidad del contorno: invariante determinista + invariante-ROI/modo + persistente; GrabCut EXCLUIDO (no-determinista); causa ±20% = `_build_binary_mask` estima fondo desde el recorte; gate = tests determinismo/invariancia ≤2%/multi-imagen (módulo math-critical). Pendiente: impl. F2 + verif. visual Electron + commit |
| 016 | Saneamiento del reporte morfométrico (PDF/HTML) | 🟡 En curso: #1,#2,#3,#4,#7,#8 + feret_clasificacion impl. en `tabla-metricas-completa.js` (`node -c` OK, cache-bust `analysis-core.js?v=20260701a`). **Enforcement: `python/tests/test_coherencia_entrega.py`** (13 métricas canónicas; encontró #8 + feret_clasificacion). #5 pendiente (cabecera en collection.js). #6 diferido (redef. métrica rugosidad math-critical). Suite 306/2 | — | 11 hallazgos en reporte real `CDF20_286_27_IA_001_CaraA` (2026-06-30). Raíz común = renderer `tabla-metricas-completa.js` lee claves que no coinciden con el backend → `|| 0`/alias divergente (deriva ADR-011 no migrada al reporte). 🔴 #1 unidades px→mm en BB (contamina IX-B) · #2 excentricidad 0.000 vs 0.6005 (`excentricidad` vs `eccentricity`) · #3 regularidad radial 71.56 vs 7156% · #4 hull circ/aspect 0.0000 · #6 cuenta circular clasif. «fracturada/sinuosa» (umbral sin corregir por 72 pts → **contradice tesis del paper**). 🟠 #5 detección/confianza N/A en objeto IA (contrato ADR-007/008 no llega al PDF) · #7 dif. área 0.0% vs solidez. F1=1,2,3,4,6. Gate: coherencia panel↔tabla↔CSV↔PDF + PDF regenerado en Electron |
| 015 | Plan de mejoras: superar brechas + optimizar matemáticas | 📋 Propuesto · aprobación por fases | — | Origen: auditoría de posicionamiento 2026-07-01 (`APORTE-MAO-PROTEC2025.md`). Brechas = (1) certificación/Eje 2, (2) profundización matemática. **F1** A1 exactitud (Bland-Altman/LoA) · A2 reproducibilidad (ICC) · C3 estandarización (CV+bootstrap) → habilita PROTEC. **F2** B1 calibrar óptica (Zhang, quita ±30%) · B2 relieve · B3 propagación escala · D1 simetría formal (Klingenberg) · D3 corte armónicos. **F3** C1 morfoespacio PCA/CVA in-app · C2 selección métricas (VIF) · D2 pose 3D robusta. **F4** E1 landmarks GM (opcional). Aditivo, gated por tests. Tablero: `PLAN-MEJORAS-MAO.md` |
| 017 | Emparejamiento con plantillas de forma ideal + completitud (fragmento vs. completo) | 🟡 **F0-F3 implementadas (2026-09-12/13)** · F4 propuesta | `3a43f92` (F0), `53e183a` (F1), `b23a379` (F2) | Origen: pregunta JFRR 2026-09-12 (¿inferir completo/fragmento emparejando contra formas ideales?). **Hallazgo:** los 3 estimadores de fragmentación actuales no miden completitud — `completitud_estimada` mide cobertura angular sobre el centroide **propio** (≈360° siempre: disco entero y cuarto de disco dan 91,3 % ambos) y `metodo_convexidad` es en realidad `extent` (⇒ toda pieza redonda completa sale «fragmento»); `perdida_area_fragmentacion_percent` es `1 − solidez` rebautizada. **Causa raíz de ADR-016 #6.** EFA **no** resuelve el encaje parcial (descriptor global de curva cerrada); el repertorio entra como biblioteca de plantillas vía `efa.reconstruct()`, y el motor es ajuste robusto → ICP (Wilczek et al. 2021). Arquitectura E1-E4; prototipo verificado: exacto hasta 25 % preservado (error de radio ≤1,6 %), rechaza por debajo de 15 % y rechaza plantilla errónea. **F0 ✅ HECHA** (13 archivos): retiradas `completitud_*` (JS y Python), `perdida_*`→`concavidad_*` con signo de perímetro corregido, `completitud_metodo_convexidad`→`extent`, `completitud_estimada` (PY)→`indice_convexidad_percent` (mismo número). Retiradas las DOS rutas (IA y manual) que inyectaban «Fragmento X (N% completo)» cuando `perdida_area > 1 %`. Gate `tools/adr017_gate_f0.mjs` 13/13 · `node --check` 11/11 · enforcement en `test_coherencia_entrega.py`. 🟠 cambia valores exportados → `docs/NOTA-VERSION-ADR017-F0.md`. ✅ **suite verificada: 343 passed / 4 skipped** (F0 324/4 → F1 343/4). ⏳ pendiente sólo la verificación visual en Electron. **F1 ✅ HECHA**: `python/modules/shape_template.py` (E1 contigüidad · E2 Kåsa 1976 + Halíř & Flusser 1998 con RANSAC determinista · E3 completitud por longitud de arco alrededor del CENTRO AJUSTADO) + `/api/shape-match` + 19 tests. Medido: error ≤ 1 punto porcentual entre 25 % y 100 %; rechaza < 15 % y la plantilla errónea; recupera centro y radio aunque el centro real caiga fuera del fragmento. Añadidos no previstos: tope de elongación de la elipse (b/a ≥ 0,15 — si no, una elipse ES una recta y ajusta la fractura) y soporte mínimo mayor para la elipse (5 gdl vs 3). ~320 ms/objeto. **F2 ✅ HECHA**: ICP recortado (TrICP, Chetverikov et al. 2002) con similitud cerrada (Umeyama 1991) sobre un repertorio de plantillas —polígonos paramétricos y formas reconstruidas desde coeficientes **EFA**, que es el puente que pedía la pregunta original—. Paridad analítica↔ICP ≤ 0,3 pp en los 4 casos; triángulo/cuadrado/hexágono íntegros al 100 %; un círculo NO se acepta como triángulo. **Hallazgo: `efa.reconstruct()` estaba documentada en la cabecera de `efa.py` pero no existía** — publicada en F2 con test. Dos correcciones de banco: los inliers publicados salen de la tolerancia absoluta y no del recorte ξ (que es interno del TrICP), y el recorte entra desde el rastreo grueso (sin él, un fragmento al 50 % rechazaba su propia plantilla). **Ambigüedad medida**: medio hexágono ES un triángulo equilátero truncado, y el módulo lo reporta bien por partida doble (50 % / 67 %) — evidencia a favor de publicar todos los candidatos. ~200 ms por plantilla ICP. **F3 ✅ HECHA** (el cable): claves en el registro canónico, `PythonBridge.shapeTemplate`, tarjeta con los 4 estados (confirmada/candidata/sin-plantilla/sin-evaluar), confirmar-descartar con persistencia en el caché de análisis, y CSV/reporte que exportan **sólo lo confirmado**. Encontró 3 bugs de cableado —los 3 mudos— : campos de contorno inventados, argumentos de `toast` invertidos y colisión de selector entre los dos chips de la cabecera; los 3 con test estático. Pendiente: superponer `plantilla_contorno` en el lienzo (exige verificación visual). Suite 372/4. · **F3** registro+chip LAAR (patrón ADR-009) · **F4** calibración con corpus real |

## Único diferido (no es deuda olvidada, es decisión consciente)

**ADR-008 C2** — reescribir `id` de objeto a compuesto arqueológico en el punto de creación.
Riesgo alto: `id` es clave viva en ~17 `find(o => o.id === obj.id)` entre `objects`,
`analisisMorfologicos.objetos` y cachés; reescribirlo en caliente rompería esos joins en
silencio. Lo implementado preserva `source_id = id` (riesgo cero). Abordar sólo si se necesita
unificar IDs, en una sub-fase C2-alpha con su propia ratificación.

## Verificaciones manuales pendientes (checklist ADR-010)

Todas comparten el mismo límite: los `<input type=file>` no se pueblan por script. El hook E2E
de ADR-010 (`window.__maoE2E.flujoCompleto('sintetico_escala_objeto_ph.png')`, sólo en dev) lo
resuelve inyectando la imagen vía `DataTransfer` + `dispatchEvent` sobre el handler real.

- [ ] **ADR-004** — chips Imagen/Escala/Objetos → `ok` en la pestaña Captura
- [ ] **ADR-003** — auto-ID arqueológico poblado en la pestaña Proyecto
- [ ] **ADR-009** — chip «N candidatas — confirmar» + modal confirmar/tipar/descartar P/H
- [ ] **ADR-005** — lenguaje `.laar-chip` consistente en las 4 pestañas
- [ ] **ADR-007** — triage de confianza en el batch de análisis
- [ ] **ADR-008** — CSV con columnas `Confianza_nivel`/`Confianza_score`
- [ ] **Modal IA** — orden/filtro por confianza + cancelación con cronómetro
- [ ] **P/H** — recálculo del área neta tras confirmar candidatos

Detalle del checklist en `docs/ADR-010-hook-verificacion-e2e.md`.

## Cómo mantener este documento

Al implementar una fase de un ADR: actualizar la fila aquí (estado + commit) en el mismo commit.
Las cabeceras `Estado:` de los docs individuales describen la *decisión* original; este índice
describe la *implementación* real. Ante discrepancia, **manda este índice**.
