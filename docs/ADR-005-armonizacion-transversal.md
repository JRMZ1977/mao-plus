# ADR-005 — Armonización transversal de las pestañas LAAR

- **Estado:** Aprobado (2026-06-12) · implementación por fases
- **Decisores:** JFRR (alcance, decisión de migración aditiva con alias) · Claude (diagnóstico y diseño)
- **Precedentes:** ADR-002 (Análisis) · ADR-003 (Proyecto) · ADR-004 (Captura) — los tres rediseñaron **una** pestaña cada uno, en sesiones separadas.

---

## Contexto

ADR-002/003/004 trataron Análisis, Proyecto y Captura de forma **aislada**. Cada
uno reinventó localmente los mismos componentes (cabecera sticky de estado, chips
tri-estado, organizador JS Strangler Fig). Al hacerlo, las tres implementaciones
**derivaron**. Diagnóstico (inventario de divergencias por ejes fijos):

| # | Eje | Análisis (ADR-002) | Proyecto (ADR-003) | Captura (ADR-004) | Canónico |
|---|-----|--------------------|--------------------|--------------------|----------|
| **D1** ⚠ | Layout — sticky `top` de la cabecera | `top: calc(topbar+tabbar)` | `top: calc(topbar+tabbar)` | **`top: 0`** | `top: 0` (ADR-004, verificado por sonda DOM) |
| **D2** | Naming — familia de clases de chip | `.adr2-chip*` | `.adr3-chip*` | reusa `.adr3-chip*` | `.laar-chip*` (color semántico compartido) |
| **D3** | Copy — mayúsculas | header "sin evaluar" vs tarjeta "SIN EVALUAR" | "Sin asignar" | "Sin cargar" | sentence case + énfasis por CSS |
| **D4** | Código — helpers JS duplicados | `setChip`/`boot`… | `setChip`/`modoFlujo`/`isVisible`… | idénticos, con deriva | `mao-organizer-base.js` |
| **D5** | Naming — clase de cabecera | `#adr2Header` (sin clase) | `.adr3-header` | `.adr4-header` | `.laar-header` |

**D1 es un error real, no solo cosmético.** El `body` ya aplica
`padding-top: calc(topbar+tabbar)` (`mao-tabs-laar.css:121`) y es el contenedor de
scroll (`overflow-x:hidden ⇒ overflow-y:auto`). Para un `position:sticky` cuyo
contenedor de scroll es ese `body`, el offset `top` se mide desde el borde del
*padding box*; por tanto `top:0` fija la cabecera justo bajo las barras (y≈70), y
`top: calc(topbar+tabbar)` **duplica** el offset (la fija en y≈140). Captura lo
detectó al taparse `#cargaMonofacial` y lo corrigió a `top:0`. Análisis y Proyecto
arrastran el `top: calc(...)` sin que se note **solo porque su primer control va más
abajo** — pero el CSS quedó con **comentarios contradictorios** sobre el mismo punto
(`#adr3ProyectoHeader`: «con top:0 quedaría detrás»; `#adr4CapturaHeader`: «top:0 es
lo correcto porque el body ya aporta el offset»). El análisis correcto es el de
ADR-004.

Este ADR es **ortogonal** a los tres anteriores: no rediseña ninguna pestaña; (1)
define el **lenguaje canónico compartido** y (2) reconcilia la deriva. La próxima
pestaña (Resultados) hereda el lenguaje gratis.

---

## El método (protocolo de normalización reutilizable)

Seis pasos, aplicables a cualquier futura armonización transversal:

1. **Inventario de divergencias** por ejes fijos: naming (clases/IDs/helpers),
   primitivas de layout (sticky `top`, spacing, estructura de cabecera), copy
   (mayúsculas, vocabulario tri-estado), duplicación de código, bugs latentes.
2. **Referencia canónica por eje**: gana la implementación más reciente/correcta
   (p. ej. `top:0` de ADR-004; `.adr3-chip` que Captura ya reusó).
3. **Extracción a capa compartida**: CSS → `.laar-chip*` + `.laar-header`; JS →
   `mao-organizer-base.js` con los helpers comunes.
4. **Migración aditiva, sin romper** (Strangler Fig): las clases viejas quedan como
   **alias** de las canónicas; los IDs que lee código legacy **no se tocan**.
5. **Verificación** = runtime visual en Electron **relanzando** (no Cmd+R) + sonda
   DOM; bump `?v=` en `index.html` al editar cualquier `.css`/`.js` versionado.
6. **Documentar** el lenguaje canónico para que la siguiente pestaña lo herede.

**Principio rector — discreción:** se unifica solo lo presentacional e interno.
No se renombran IDs leídos por listeners/router, no se toca lógica de negocio ni
máquinas de estado de alto riesgo. La variación legítima por contexto (p. ej. la
geometría de chip densa de la cabecera de Análisis frente al pill de Proyecto) se
**preserva**; lo que se canoniza es la semántica de color, no el tamaño.

---

## Lenguaje canónico (el «idioma único»)

### Chips tri-estado — semántica fija, no decoración

| Estado | Clase canónica | Color | Significado | Copy (ejemplos) |
|--------|----------------|-------|-------------|-----------------|
| Pendiente | `.laar-chip--wa` | ámbar | falta algo que debería estar | "Sin proyecto", "Sin asignar", "Sin cargar", "Sin calcular", "Sin evaluar" |
| Positivo | `.laar-chip--ok` | verde | valor logrado / hecho | nombre de proyecto, "0.123 mm/px", "3 objetos", "2 perforaciones" |
| Neutro | `.laar-chip--none` | gris | informativo / cero decidido | "2D · Monofacial", "—", "Evaluado · sin P/H" |

Las tres modificadoras de color usan los mismos tokens (`--laar-{ok,wa}-{bg,bd,tx}`,
`--laar-g*`) que ya compartían `.adr2-chip*` y `.adr3-chip*`: la canonización del
color es pura consolidación, sin cambio visual.

### Copy / mayúsculas

**Sentence case** en toda string de chip ("Sin evaluar", no "SIN EVALUAR" ni "sin
evaluar"). El énfasis visual (p. ej. la tarjeta grande de P/H en Análisis) se logra
con CSS (`.laar-chip--lg { text-transform: uppercase }`), **no** escribiendo strings
en mayúsculas — así el copy fuente queda uniforme y traducible.

### Cabecera sticky

`.laar-header`: `position: sticky; top: 0` (canónico ADR-004). Queda bajo las barras
fijas gracias al `padding-top` del `body`. Geometría de chip por contexto: pill
(`.laar-chip`, 12px) por defecto; densa (override acotado) en la cabecera de Análisis.

---

## Plan por fases (incremental, reversible, Strangler Fig)

| Fase | Alcance | Riesgo | Verificación |
|------|---------|--------|--------------|
| **0 — Documento** | Este ADR. | Nulo | — |
| **1 — CSS + fix** | `.laar-chip*`/`.laar-header`/`.laar-chip--lg` canónicas (aditivas); **fix D1** (`top:0` en las 3 cabeceras); override de geometría densa para Análisis. Bump `?v=`. | Bajo | Visual Electron + **sonda DOM de las 3 cabeceras en y≈70** |
| **2 — Base JS** | `js/mao-organizer-base.js` (`window.MaoOrganizer`); migrar los 3 organizers a `MaoOrganizer.*` + `.laar-chip`; Análisis: copy sentence case + `--lg` (D3). | Medio | `node -c` + visual relanzando |

## Restricciones (reglas del proyecto)

- API Tier 1 intacta; `mao-ia.js`, `collection.js`, `projects-ui.js` sin cambios.
- IDs leídos por listeners/router (`adr2Header`, `adr3ProyectoHeader`,
  `adr4CapturaHeader`, `objectDimension3D`, `modoBifacial`, `scaleDisplay`,
  `objectCount`…) **se conservan**.
- Máquinas de estado de alto riesgo (Detección, Selección Manual, Modal de
  Perforación) no se modifican.
- `mao-organizer-base.js` es dependencia dura de los 3 organizers: cargar siempre
  **antes** que ellos.
- Validación = runtime visual en Electron **relanzando** (no Cmd+R).

## Consecuencias

- ✅ Se corrige el bug latente D1: las tres cabeceras quedan a la misma altura.
- ✅ Un solo vocabulario de chip (color semántico) y de copy (sentence case) en las
  tres pestañas; la cuarta (Resultados) lo hereda.
- ✅ Fin de la duplicación de helpers (D4): un punto único de verdad.
- ✅ Reversible: alias en CSS (comentar el `<link>`) y `<script>` por organizer.
- ⚠ D1 exige re-verificación visual: los registros de ADR-003 y ADR-004 se
  contradicen sobre el sticky `top`. Confirmar por sonda DOM antes de dar por buena
  la fase. Si Proyecto/Análisis rompieran con `top:0`, revertir esos dos a `calc`.
- ⚠ La nueva global `window.MaoOrganizer` debe vigilarse con `mao-console-analyzer`
  (ReferenceError si un organizer carga antes que la base).
