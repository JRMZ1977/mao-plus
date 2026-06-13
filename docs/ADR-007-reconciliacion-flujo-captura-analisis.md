# ADR-007 — Reconciliación del flujo captura→análisis

- **Estado:** Aprobado (2026-06-13) · implementación en la misma sesión
- **Decisores:** JFRR (alcance: «ADR-007 + reconciliar deriva») · Claude (diagnóstico, diseño, implementación)
- **Precedentes:** ADR-001 (guards de flujo) · ADR-004 (chips de Captura) · ADR-005 (lenguaje canónico + `window.MaoOrganizer`). Mejoras de detección/flujo: commits `8675ede`, `4fef282`.

---

## Contexto

Tras las mejoras del módulo de detección se añadieron cuatro controles al puente
**Captura→Análisis**, todos sobre la lista de objetos individualizados:

- **A1** — triage por confianza (chips + filtro «solo revisar»).
- **C1** — batch «Analizar todos» con barra de progreso.
- **D1** — guard de escala antes de analizar.
- **E1** — marcado de referencias (carta de color / escala) excluidas del análisis.

Funcionan y están verificados en Electron, pero su **primera** implementación vivió
entera dentro del IIFE legacy (`analysis-core.js`) y construyó su UI a mano. Eso
reintrodujo **exactamente la deriva** que ADR-005 cerró. Inventario por ejes:

| # | Eje | Deriva (1ª implementación) | Canónico (este ADR) |
|---|-----|----------------------------|---------------------|
| **D1** | Fuente de verdad de chips | toolbar repinta `Sin escala · px` y `N objetos` | cabecera de Captura (ADR-004) ya los tiene → **dedupe** |
| **D2** | Construcción de chips | `innerHTML` con `laar-chip` hardcoded | `window.MaoOrganizer.setChip` (helper canónico, ADR-005/D4) |
| **D3** | Altitud (Strangler Fig) | toolbar renderizada por el core legacy | render en `mao-captura-organizer.js` (capa de presentación) |
| **D4** | Filosofía de guard | `confirm()` de escala paralelo a guards de tabs | **decisión explícita:** D1 es guard **soft** (calidad), ADR-001 son **hard** (estructura) |
| **D5** | Modelo event-driven | marcar referencia no emitía evento | `mao:objects:changed` → la cabecera refleja artefactos·referencias |

> Nota: la numeración D1–D5 es local a este ADR (no la de ADR-005).

---

## Decisiones

### D1 · Dedupe — una sola fuente de verdad por eje
La **cabecera de Captura** (ADR-004: `adr4ChipEscala`, `adr4ChipObjetos`) es la
autoridad de **Escala** y **Objetos**. La toolbar de triage **no** los repite: solo
muestra el eje nuevo —**confianza** (`M requieren revisión`) y **referencias**
(`N referencias`)— más la **acción batch**. La escala se vigila en la cabecera y se
hace cumplir con el guard D4 al lanzar el análisis.

### D2 · `MaoOrganizer.setChip` para todo chip
Todos los chips (toolbar y el chip de confianza por tarjeta) se construyen con
`MO.setChip(el, state, txt)`. Si la convención de chip evoluciona, todos siguen.
`state ∈ 'ok'|'wa'|'none'` con la semántica fija de ADR-005 (color = estado real).

### D3 · La toolbar es presentación → vive en el organizer
`mao-captura-organizer.js` renderiza la toolbar (lee `window.objects`, expuesto por
el IIFE). El core conserva la **lógica de negocio** (filtro, batch, guard, toggle de
referencia) y la **render del grid** (`individualizarObjetos`, que es legacy y no se
mueve). La coordinación es **event-driven**, como ADR-001/004:

```
core  ──mao:objects:rendered {soloRevisar}──▶  organizer.renderTriageToolbar()
organizer ──mao:batch-analyze:request──▶        core._analizarTodos()
organizer ──mao:triage-filter:toggle──▶         core (flip flag + re-render)
core  ──mao:objects:changed──▶                  organizer.updateObjetosChip()
```

Consecuencia aceptada: desactivar el organizer (Strangler Fig: comentar su
`<script>`) quita la toolbar y, con ella, el acceso a batch/filtro. Es la frontera
correcta: la **presentación** vive en el organizer; la **lógica** permanece en el
core y se puede invocar por evento desde cualquier otra UI futura.

### D4 · Escala = guard **soft** (decisión explícita)
ADR-001 son guards **hard**: bloquean la pestaña por evento (no se llega a Análisis
sin detección). El guard de escala es de otra naturaleza —**calidad de la medida**,
no estructura del flujo— y se resuelve como **soft**: un `confirm()` que advierte
«las métricas saldrán en píxeles» y permite continuar (análisis px-relativo es
legítimo; la escala puede calibrarse después). Se materializa además como
procedencia: `metricas.sin_escala_calibrada` + fila en `metricas.csv`. **No** se
convierte en guard de pestaña.

### D5 · Marcar referencia emite evento
El toggle de referencia despacha `mao:objects:changed`. El chip **Objetos** de la
cabecera de Captura pasa a reflejar el desglose (p. ej. `3 · 1 ref`), de modo que el
modelo event-driven de ADR-001/004 conserva una sola narrativa del estado.

---

## Arquitectura resultante (encaje en el flujo)

```
Proyecto ─▶ Captura ───────────────────────────────────▶ Análisis ─▶ Resultados
            │ cabecera ADR-004: Imagen·Escala·Objetos·Flujo  (verdad de escala/conteo)
            │ grid de objetos (core: individualizarObjetos)
            │   · chip de confianza por tarjeta (MO.setChip)
            │   · toggle «referencia» (E1)
            └ toolbar de triage (organizer, event-driven):
                confianza · referencias · [Analizar todos] ──┐
                                                              ▼
   batch ⇒ analizarObjetoMorfologicamente ⇒ mostrarAnalisisMorfologico
           ⇒ emite mao:analysis:done ⇒ ADR-001 desbloquea Resultados
```

Lo que **ya** era coherente y se conserva: el batch alcanza
`mostrarAnalisisMorfologico` que emite `mao:analysis:done`
(`analysis-core.js:23270`), por lo que Resultados se desbloquea según ADR-001; la
detección sigue emitiendo `mao:detection:done`; los chips usan `.laar-chip*`.

---

## Restricciones (reglas del proyecto)

- **Strangler Fig / reversibilidad:** la toolbar se desactiva comentando el
  `<script>` del organizer en `index.html`; el core no se rompe (los listeners de
  `mao:batch-analyze:request` / `mao:triage-filter:toggle` quedan sin emisor).
- **Dependencia dura `MaoOrganizer`:** el organizer ya depende de
  `mao-organizer-base.js` (cargado antes). La toolbar usa `MO.setChip`.
- **Caché `file://`:** `analysis-core.js` y los organizers no van versionados con
  `?v=`; no requieren bump. El relanzamiento en frío (matar+relanzar) basta.
- **Verificación:** sonda DOM en runtime (`MAO_PROBE`) — `node -c` no ve layout/CSS
  ni el cableado de eventos.

---

## Consecuencias

- **+** Una sola fuente de verdad por eje; chips canónicos; presentación en su capa.
- **+** El flujo captura→análisis queda documentado y event-driven, listo para que
  Resultados/colección reaccionen a `mao:objects:changed` sin tocar el core.
- **−** Batch/filtro dependen del organizer activo (frontera Strangler Fig asumida).
- **Pendiente heredado:** probar con archivos reales (los `<input type=file>` no se
  pueblan por script); auto-sugerencia de referencias desde el re-ranking de
  `detect()` (hoy el tier no se devuelve) — fuera de alcance de este ADR.
