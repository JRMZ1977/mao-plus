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
