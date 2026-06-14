# ADR-009 — Detección de P/H como tarea primaria (candidatos auto-detectados a confirmar)

- **Estado:** ✅ **Implementado (2026-06-13) + fixes tras prueba real (2026-06-14)** · Fases 0–4 completas. Verificado: 8 tests nuevos + suite completa (268 passed, 2 skipped), `node -c` limpio, **HTTP end-to-end** (huecos blancos, **grises** y oscuros detectados; 0 FP en sólido), **boot Electron** (0 renderer errors). **Pendiente manual**: confirmación visual del chip y del modal con la imagen real cargada por el usuario.

## Fixes tras la primera prueba con imagen real (2026-06-14)

La primera prueba (artefacto anular tipo «donut» con hueco central, objeto **IA/SAM**)
mostró el chip «P/H: evaluado · sin P/H» en vez de proponer el hueco evidente. Tres
defectos, los tres corregidos:

1. **El hueco gris no se detectaba.** `_build_binary_mask` por blancos absolutos
   (umbral ~240) clasificaba un hueco **gris** (no blanco puro) como objeto → `mask_raw`
   sin hueco. **Fix:** `detect_holes` ahora combina DOS señales sobre la silueta rellena:
   (1) interior clasificado como fondo (`silueta & ¬máscara`, también sin imagen para los
   tests) y (2) **desviación de color** respecto a la mediana del cuerpo del objeto
   (`|gray − mediana| > max(25, 1.5·std)`, con la silueta erosionada para excluir el
   borde). La señal (2) capta through-holes grises y recesos en sombra. Verificado por
   HTTP: huecos gris 195/210/230 y receso oscuro 60 → 1 candidato cada uno; sólido → 0.
2. **Objetos IA/SAM no capturaban candidatos.** El bloque `contour.extract` se saltaba si
   `obj._samSegmented` → `obj.phCandidatos` nunca se poblaba. **Fix:** el bloque corre
   también para IA/SAM (excepto `_canonicalRaster`), pero la adopción del
   contorno/hull/confianza queda gateada por `!obj._samSegmented` (se preserva el contorno
   IA); `ph_candidates` se captura siempre.
3. **El chip ocultaba los candidatos.** Los objetos IA nacen con `perforaciones:[]` /
   `horadaciones:[]` → `evaluado=true`, y la prioridad original daba `sin-ph`. **Fix:**
   `phEstado()` prioriza `hallazgos` (confirmados) → `candidatos` (nC>0) → `sin-ph` →
   `sin-evaluar`; ya **no** usa `evaluado` por encima de candidatos. El «no nag» se
   mantiene porque confirmar→hallazgos, y descartar/finalizar **limpian** `obj.phCandidatos`.
- **Decisores:** JFRR (alcance: «mejorar la detección de P/H y reclasificarla como tarea primaria, porque sus métricas impactan las del objeto») · Claude (diagnóstico y diseño).
- **Precedentes:** ADR-002 (pestaña Análisis · §2 P/H tri-estado) · ADR-005 (lenguaje canónico LAAR `.laar-chip` + `window.MaoOrganizer`) · ADR-007 (confianza por objeto) · ADR-008 (contrato de salida de captura). Detección backend: `detection.detect()`, `contour.extract()`.
- **Ámbito:** detección **seedless** de huecos internos durante el análisis del contorno + su surgimiento en el flujo como **candidatos a confirmar**. **No** toca `calcularAreaEfectivaPH`, el área neta, ni `metrics.py`. Aditivo, reversible.

---

## Contexto

Hoy la detección de perforaciones/horadaciones (P/H) es una **tarea secundaria,
manual y opcional**:

- El backend **nunca extrae huecos internos**. `contour.extract` aplica un
  `MORPH_CLOSE` que **rellena los huecos** (`contour.py:382`) y luego usa
  `RETR_EXTERNAL` (`contour.py:418`) — los P/H se destruyen durante el análisis.
- La única «detección» existente exige intervención humana: flood-fill desde un clic
  (`_ph_detect_from_seed`, `server.py:1798`) vía `/ph/detect-at-point` y
  `/ph/detect-auto` (lote de semillas). El `tienePerforacion` del Z-scan es solo una
  pista de color; no produce contorno.
- En la UI, P/H vive en el modal `#perforationCanvasModal` que se abre **después** del
  análisis, y el chip de la pestaña Análisis arranca en **«P/H: sin evaluar»** (ámbar)
  — `phEstado()` en `js/mao-analysis-organizer.js:82`.

El problema: **las métricas de P/H impactan en las del objeto** — área neta (= área
bruta − área P/H efectiva), porosidad, patrón de agrupamiento, clasificación
«Perforaciones Bipolares», ratios EFA. El propio organizer lo reconoce
(`mao-analysis-organizer.js:192`): *«La detección de P/H infiere sobre las métricas del
objeto… hasta evaluarla, esas métricas son provisionales.»* Aun así el flujo trata P/H
como un paso posterior y fácil de omitir.

**Objetivo:** elevar P/H al flujo **primario** — detectar los huecos internos
automáticamente (sin semillas) durante el análisis y **surgirlos de forma prominente**
como candidatos.

## Decisiones del usuario (dominio arqueológico)

1. **Sugerencias a confirmar.** Los candidatos auto-detectados **no** alteran el área
   neta ni ninguna métrica hasta que el usuario los confirma. Ninguna métrica cambia sin
   aprobación humana. → Los candidatos viven en un campo aparte (`obj.phCandidatos`),
   nunca en `obj.perforaciones`/`obj.horadaciones` hasta confirmarse.

2. **Candidato sin tipo.** La profundidad (pasante vs ciega) **no es observable en una
   sola imagen 2D**, así que el hueco se detecta como «P/H candidato» neutro; el usuario
   asigna perforación u horadación al confirmar. → Evita mislabel que afecte
   «Perforaciones Bipolares» y el dedup P-en-H.

## Invariante rector

> El área neta y `calcularAreaEfectivaPH` **no se tocan**: siguen leyendo **solo** los
> P/H **confirmados** (`obj.perforaciones`/`obj.horadaciones`). La detección automática
> solo **propone**; el humano **dispone**.

## Diseño (pipeline aditivo y reversible)

```
/contour (extract) ──► detect_holes() seedless ──► result.ph_candidates[]
       │                                                   │
       ▼                                                   ▼
analysis-core.js  ──► obj.phCandidatos = [...]   (NO toca perforaciones/horadaciones)
       │
       ▼
mao-analysis-organizer.js §2 ──► chip 4º estado «N candidatas P/H — confirmar» (--wa, CTA)
       │
       ▼
#perforationCanvasModal ──► precarga candidatos como sugerencias editables
                            (usuario asigna tipo + Confirmar/Descartar por candidato)
       │ al confirmar
       ▼
obj.perforaciones / obj.horadaciones (tipados) ──► área neta se recalcula (lógica actual)
```

## Contrato de `ph_candidates` (salida de `/contour`)

`result["ph_candidates"]` = lista (posiblemente vacía) de:

| Campo | Tipo | Significado |
|-------|------|-------------|
| `points` | `[[x,y], …]` | contorno del hueco en **coordenadas absolutas** de la imagen completa (ROI + offset bbox) |
| `area_px` | float | área del hueco en px² |
| `bbox` | `{x,y,w,h}` | caja del hueco (coords absolutas) |
| `centroid` | `[cx,cy]` | centroide (coords absolutas) |
| `perimeter_px` | float | perímetro en px |
| `circularity` | float | 4π·área/perím² ∈ [0,1] |
| `detection_confidence` | float ∈ [0,1] | confianza del hueco (contraste de borde + compacidad) |
| `confidence_level` | `"alta"\|"media"\|"baja"` | nivel LAAR (chip ADR-007/008) |
| `tipo` | `"candidato"` | neutro: sin perforación/horadación hasta confirmar |

Filtros de aceptación (espejan `/ph/detect-auto`): `area_px ≥ max(16, 0.001·área_objeto)`
y `area_px ≤ 0.35·área_objeto`. Solo huecos **cerrados** (interiores al objeto); las
concavidades abiertas al borde quedan excluidas por construcción.

## Reutilización (no reinventar)

- `_confianza_objeto` (`detection.py:479`) — patrón confianza por objeto (anillo ΔE + extent).
- Umbrales de `/ph/detect-auto` (`server.py:1903`) — referencia área/circularidad/dedup.
- `ph.calculate_metrics` / `process_batch` (`python/modules/ph.py`) — métricas de los P/H **confirmados** (sin cambios).
- `calcularAreaEfectivaPH` (analysis-core.js) — área neta con dedup P-en-H (sin cambios).
- `window.MaoOrganizer` (`MO.setChip`, `.laar-chip`, ADR-005) — chips canónicos.

## Reversibilidad

Si `ph_candidates` viene vacío o `/contour` falla, el flujo cae al comportamiento actual
(«sin evaluar» + modal manual) sin romperse. La detección de huecos es un bloque aislado
en `contour.extract` que puede neutralizarse devolviendo `[]`.

## Riesgos

- El modal `#perforationCanvasModal` es state machine de alto riesgo (CLAUDE.md): la
  Fase 3 es la más delicada; cambios acotados y aditivos, verificar en Electron.
- Falsos positivos (ruido/sombra): mitigados por umbrales de área relativos al objeto +
  confianza por candidato + confirmación humana (nada auto-aplica).
