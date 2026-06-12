# ADR-004 — Rediseño de la pestaña «Captura»: jerarquía de estado, estilo LAAR y de-rainbow

- **Estado:** Aprobado (2026-06-12) · **Fase 1 en implementación**
- **Decisores:** JFRR (alcance y orden de fases) · Claude (diagnóstico y diseño)
- **Precedentes:** ADR-001 (guards de flujo UI) · ADR-002 (rediseño Análisis: cabecera sticky, chips tri-estado, de-rainbow) · ADR-003 (rediseño Proyecto: chips tri-estado, jerarquía, CTA con guard suave)

---

## Contexto

La pestaña Captura agrupa, vía `mao-tab-router.js` TABS[1], las secciones
heredadas del modelo sidebar-scroll: `sectionImagen`, `sectionObj3D`,
`sectionEscala`, `canvasMonofacial`, `canvasBifacial`,
`individualObjectsContainer`, `nuevoAnalisisBtnContainer`
(ver `index.html:775–1580`). Es la única de las cuatro pestañas que aún no ha
recibido el tratamiento LAAR de ADR-002/003.

Diagnóstico:

| # | Problema | Evidencia |
|---|----------|-----------|
| 1 | **Sin cabecera de estado** (Proyecto y Análisis ya la tienen) | No hay equivalente a `#adr3ProyectoHeader` / `#adr2Header`. El estado está disperso en 6+ nodos: `#status`, `#statusCaraA/B`, `#scaleDisplay`+`CORREGIDA`, `#objectCount`, `#procesoStatus`, `#detectionStatus`. No hay un punto donde leer «imagen.jpg · escala 0.12 mm/px · 3 objetos». Es el mismo «estado disperso» #3 de ADR-003. |
| 2 | **La línea de escala flota huérfana** | `#canvas2dScaleLine` (escala mm/px + `#objectCount` + chip CORREGIDA, index.html:1437) queda suelta entre el fieldset y el canvas — es material de cabecera, no de cuerpo. |
| 3 | **Anti-LAAR generalizado** (mismo #5 de ADR-003) | Botones por decoración: `btn-purple` (Verificar, IA), `btn-teal` (Individualizar), `btn-success`. Badge IA `#6f42c1`. Panel verificación `border:2px solid #7C4DFF`. YOLO `linear-gradient(135deg,#6a1b9a22,#1565c022)` + ✨ `#7b1fa2`. Canvas bifacial `border:2px #607D8B/#455A64` + fondo `#ECEFF1`. `individualizarBifacialBtn2` gradiente + box-shadow. Selects del visor 3D en dark-theme (`#1e2530`/`#445`). Cajas info `#e7f3ff`/`#fff3cd`/`#ECEFF1`. `scaleCorrectedIndicator` `#CFD8DC`/`#37474F`. `fieldsetPruebaVirtual` gradientes rosa/gris (dev-only). |
| 4 | **Jerarquía de botones plana en el stepper** | `#stepperProcesamiento` es bueno (ya es el espinazo del flujo Escala→Detección→IA), pero la acción primaria de cada paso (Calcular Escala, Detectar) pesa igual que las secundarias; peor: **Verificar** es morado llamativo siendo secundaria. |
| 5 | **Semántico por decoración, no por estado** | Rojo/morado/teal usados como color de marca, no para comunicar estado real (mismo vicio que el «0 falso» que ADR-002/003 corrigieron). |

Lo que **ya está bien** y se conserva: el stepper visual de pasos; los parámetros
avanzados ya colapsados en `<details>` (index.html:1286); y que el router oculta
el fieldset 3D fuera de modo 3D (`applyModeVisibility`).

---

## Decisión

### A. Jerarquización — cabecera de estado con chips

Mismo patrón que `#adr3ProyectoHeader` y `#adr2Header`, sticky bajo topbar+tabbar
(`top: calc(var(--laar-topbar-h) + var(--laar-tabbar-h))`).

```
┌─ CABECERA DE CAPTURA (sticky) ─────────────────────────────────────┐
│ Imagen: ⚠ SIN CARGAR   Escala: ⚠ SIN CALCULAR   Objetos: ◔ —       │
│ Flujo: 2D · Monofacial                              [híbrido JPG+RAW]│
├────────────────────────────────────────────────────────────────────┤
│ ▾ §1 Imagen          (carga mono / dual bifacial / .OBJ en 3D)     │
│ ▾ §2 Escala y Detección  (stepper como columna vertebral;          │
│                       acciones primarias visibles, params en        │
│                       <details> — ya existe)                        │
├────────────────────────────────────────────────────────────────────┤
│   [Canvas]  →  [Objetos individualizados]                          │
└────────────────────────────────────────────────────────────────────┘
```

Chips tri-estado (mismo patrón que el chip P/H del ADR-002):

| Chip | Estados |
|------|---------|
| **Imagen** | ⚠ ámbar «sin cargar» · ✓ verde «nombre.jpg» (absorbe `#status`); badge `híbrido JPG+RAW` (absorbe `#hybridAnalysisInfo`). Bifacial: «A ✓ · B ⚠» (absorbe `statusCaraA/B`). |
| **Escala** | ⚠ «sin calcular» · ✓ «0.123 mm/px» (absorbe `#scaleDisplay`); marca CORREGIDA → estado `ok` del chip. |
| **Objetos** | ◔ «pendiente» · ✓ «N objetos» (absorbe `#objectCount` + `#procesoStatus`). |
| **Flujo** | informativo «2D · Monofacial» / «2D · Bifacial» / «3D» — se **hereda** del chip Flujo de Proyecto para continuidad. |

Progressive disclosure: textos didácticos (`#notaEscalaBifacial`, nota bifacial
del canvas, ayuda «Área mínima ↑↓») → `<details class="laar-details">`.

### B. Estilo visual LAAR (de-rainbow)

Disciplina de tokens de `css/mao-tabs-laar.css`, acotado a las secciones de
Captura, con `!important` contra los estilos inline del HTML legacy (precedente
E2 del fix 2026-06-09). Reversible comentando el `<link>`.

| Objetivo | Regla |
|----------|-------|
| Stepper | Una sola primaria `--laar-b500` por paso activo; resto secundarias blanco + borde `g300`. Elimina `btn-purple`/`btn-teal`/`btn-success` decorativos. |
| IA / YOLO | Quita gradiente y `#6f42c1`/`#7b1fa2`; acento `b500` cuando activo; ✨ sin color de marca. |
| Verificación escala | `2px #7C4DFF` → plano 0.5px `g300`; «Cancelar» = `er` semántico real. |
| Canvas bifacial | `#607D8B/#455A64` → solo acento de borde desaturado (regla caras A/B de ADR-003); fondos → `bg-secondary`/`g50`. |
| Selects del visor 3D | dark-theme `#1e2530` → inputs estándar LAAR. |
| Cajas info | `#e7f3ff`/`#fff3cd`/`#ECEFF1` → grises neutros; `wa` solo para avisos reales. |
| `scaleCorrectedIndicator` | `#CFD8DC`/`#37474F` → chip `ok` plano. |
| `fieldsetPruebaVirtual` | de-rainbow de los gradientes (dev-only, ya `aria-hidden`). |

### C. Eventos / cableado de la cabecera

La cabecera se alimenta de eventos existentes y estado del DOM, sin tocar la
lógica de negocio (igual que `mao-proyecto-organizer.js` / `mao-analysis-organizer.js`):

- `mao:detection:done` (ya existe) → chip Objetos a ✓ con el conteo.
- Carga de imagen: nuevo `mao:capture:image-loaded` emitido donde ya se actualiza
  `#status` / `statusCaraA/B`, o lectura directa del DOM como fallback.
- Escala: revivir `mao:scale:set` como **evento real** (ADR-001 retiró el stub
  muerto) emitido al calcular/corregir escala → chip Escala a ✓.
- Chip Flujo: reusa el estado de los radios (mismos IDs que lee el router; no
  agrava la deuda F4 de ADR-001).

Nuevo `js/mao-captura-organizer.js` (espejo del organizador de Proyecto)
construye `#adr4CapturaHeader`, mueve `#canvas2dScaleLine` a la cabecera y enlaza
los chips. Reversible: comentar su `<script>`.

### D. Forward / CTA

El avance ya es por evento: el router salta a Análisis en `mao:detection:done`
(ADR-001). No se añade CTA obligatoria. Opcional: guard suave informativo si el
usuario navega manualmente a Análisis sin objetos detectados (coherente con la
filosofía ADR-001/002 «pregunta, no bloquea»).

---

## Plan por fases (incremental, reversible, Strangler Fig)

| Fase | Alcance | Riesgo | Verificación |
|------|---------|--------|--------------|
| **1 — Estilo LAAR** | De-rainbow vía CSS acotado a las secciones de Captura (`!important` contra inline): stepper, IA/YOLO, panel verificación, canvas bifacial, selects del visor 3D, cajas info, `scaleCorrectedIndicator`, `fieldsetPruebaVirtual`. Sin tocar lógica. | Bajo | Visual Electron + bump `?v=` |
| **2 — Cabecera de chips** | `#adr4CapturaHeader` con chips Imagen/Escala/Objetos/Flujo; nuevo `js/mao-captura-organizer.js`; absorbe los indicadores dispersos; mueve `#canvas2dScaleLine`. Reusa `mao:detection:done`; revive `mao:scale:set`. | Medio | Visual + sonda DOM |
| **3 — Jerarquía del cuerpo** | Promover el stepper a §2 «Escala y Detección»; didácticos a `<details>`; guard suave opcional. | Bajo-medio | Visual relanzando |

## Restricciones (reglas del proyecto)

- API Tier 1 intacta; `mao-ia.js`, `collection.js` y las máquinas de estado de
  alto riesgo (Detección, Selección Manual, Modal de Perforación) sin cambios.
- Cada fase reversible de forma independiente.
- Validación = runtime visual en Electron **relanzando** (no Cmd+R).
- Al editar cualquier `.css`/`.js` versionado: bump `?v=` en `index.html`.

## Consecuencias

- ✅ Estado de la captura legible de un vistazo (imagen · escala · objetos · flujo),
  homogéneo con Proyecto y Análisis.
- ✅ Cierra el de-rainbow de las cuatro pestañas (LAAR completo de extremo a extremo).
- ✅ Jerarquía de acción clara: una primaria por paso del stepper.
- ⚠ La cabecera (Fase 2) introduce un organizador nuevo que lee estado disperso;
  exige verificación visual de mono / bifacial / 3D.
- ⚠ Revivir `mao:scale:set` requiere localizar el punto de cálculo/corrección de
  escala en `analysis-core.js` y emitirlo sin romper el flujo existente.

---

## Registro de implementación

### Fase 1 — Estilo LAAR (2026-06-12) · ✅ VERIFICADA en Electron

| Archivo | Cambios |
|---------|---------|
| `css/mao-tabs-laar.css` | Sección «ESTÉTICA LAAR — PESTAÑA CAPTURA (ADR-004 · Fase 1)»: de-rainbow acotado a las secciones de Captura. |
| `index.html` | Bump `?v=` del `<link>` de `mao-tabs-laar.css` (`20260612b`). |

**Verificado visualmente** (computer-use, app real relanzada) en los tres modos:

- **Monofacial:** stepper plano (botones secundarios; acento b500 solo al
  habilitado); insignia «1/2» gris; barra de zoom flotante de-rainbow.
- **Bifacial:** paneles de carga con badge gris + acento de borde desaturado
  (azul A / verde B); aviso «Modo Bifacial» en ámbar correcto; lienzo dual con
  marcos grises (sin slate `#607D8B/#455A64`); «Escala Bifacial» en gris.
- **3D:** sección OBJ neutra (btn-muted), checkboxes en b500.
- **Avanzado:** YOLO IA sin gradiente morado; inputs/selects neutros.

**Dos correcciones extra detectadas durante la verificación** (no estaban en el
borrador de la fase, se incorporaron):

1. **Insignia IA del stepper** seguía morada en reposo: era un
   `style="background:#6f42c1"` **inline** en el `<span>` (index.html:1221), no
   la clase `.step-active`. Fix: `.mao-main #stepIA .proc-step-num { background:
   var(--laar-g400) }` (el b500 activo / ok hecho reaparece por las reglas más
   específicas).
2. **Toolbar flotante de zoom** (`#zoomToolbar` en `canvasMonofacial`): presets
   `gray-400` rellenos, nivel slate y el ⊞ individualizar **verde** (de la regla
   vieja `#individualizarBtn { background:#416e41 }`, main.css:947). Fix: presets
   → chips `g100`, nivel → `g700`, ⊞ → acento `b500`.

**Observación (fuera de alcance, pre-existente · deuda F4 de ADR-001):** al
cambiar 2D/3D con los radios desde la pestaña Proyecto, la nav legacy
(`object-dimension-mode.js`) des-oculta `#sectionImagen` sobre la pestaña
Proyecto, contradiciendo al router. No es estético; candidato para Fase 2/3.

### Fase 2 — Cabecera de chips (2026-06-12) · ✅ VERIFICADA en Electron

| Archivo | Cambios |
|---------|---------|
| `index.html` | Nuevo `#adr4CapturaHeader` (chips Imagen/Escala/Objetos/Flujo) antes de `#sectionImagen`; `<script>` de `mao-captura-organizer.js`; bumps `?v=`. |
| `js/mao-captura-organizer.js` | **Nuevo.** Organizador espejo de `mao-proyecto-organizer.js`. |
| `js/mao-tab-router.js` | `adr4CapturaHeader` añadido como 1ª sección de `captura` en TABS. |
| `css/mao-tabs-laar.css` | Contenedor `#adr4CapturaHeader.adr4-header` (reusa `.adr3-chip*`); `#canvas2dScaleLine` oculto (absorbido). |

**Cableado** (solo observación, sin tocar lógica de negocio):
- **Imagen**: lectura directa de los `<input type=file>` (`change`): mono jpg/raw,
  bifacial caras A/B, OBJ 3D. Híbrido → «nombre.jpg (+RAW)».
- **Escala**: MutationObserver sobre `#scaleDisplay` (`-` = sin calcular) +
  `#scaleCorrectedIndicator` → «valor mm/px [· corregida]».
- **Objetos**: MutationObserver sobre `#objectCount` + evento `mao:detection:done`.
- **Flujo**: radios 2D/3D · mono/bifacial + `mao:object-dimension-changed`.
- **Reset**: click en `#nuevoAnalisisBtn` → chips a estado inicial.

Se prefirió MutationObserver/lectura de inputs sobre revivir `mao:scale:set`
(el borrador lo proponía): cero cambios en `analysis-core.js`.

**Bug de layout corregido (sonda DOM):** la cabecera sticky con
`top: calc(topbar+tabbar)` se fijaba en **y=140** y tapaba `#cargaMonofacial`
(JPG/RAW, y=150–173). Causa: el contenedor de scroll es `body`
(`overflow-x:hidden` ⇒ `overflow-y:auto`) y **ya** lleva
`padding-top: topbar+tabbar`; el sticky `top:70` se sumaba a ese padding. Fix:
`top: 0` (se fija en el borde del contenido = y=70, justo bajo las barras;
verificado por sonda: header 70→117, `#cargaMonofacial` en 150, sin solape).
Nota: las cabeceras de ADR-002/003 tienen el mismo doble-offset pero su primer
control va más abajo, por eso allí no se notaba.

**Verificado** en mono (chips iniciales wa/wa/none + Flujo «2D · Monofacial»),
bifacial (Flujo «2D · Bifacial», paneles de carga A/B visibles sin solape) y la
absorción de `#canvas2dScaleLine`.

**Pendiente de prueba con archivos reales (manual):** el flip dinámico de los
chips Imagen→ok / Escala→ok / Objetos→ok al cargar imagen + calcular escala +
detectar (los `<input type=file>` no se pueblan por script). El cableado quedó
verificado por construcción + el chip Flujo cambiando mono↔bifacial en vivo.

### Fase 3 — Jerarquía del cuerpo (2026-06-12) · ✅ VERIFICADA en Electron

HTML puro (sin tocar CSS/JS versionados → sin bump `?v=`). Reversible.

| Cambio | Archivo |
|--------|---------|
| Legend de `#sectionEscala`: «Configuración y Procesamiento» → **«Escala y Detección»** (promueve la sección como §2, con el stepper de columna vertebral). | `index.html` |
| Didáctico bifacial verboso (`.bifacial-warning`, «Modo Bifacial Activado…») → `<details class="laar-details">` colapsado **«Cómo funciona el modo bifacial»** (progressive disclosure, reusa el estilo de ADR-003). | `index.html` |

**Decisiones de alcance:**
- `#notaEscalaBifacial` se **dejó** como está: lo togglea el JS individualmente
  (`style.display` en analysis-core.js:53644/53667); envolverlo en `<details>`
  rompería ese control. Ya está de-rainbow (Fase 1) y solo aparece en bifacial.
- **Guard suave omitido**: la pestaña Análisis ya está bloqueada hasta
  `mao:detection:done` (ADR-001), así que no se puede llegar sin detección — un
  guard sería redundante.
- `.bifacial-warning` es seguro de envolver porque su visibilidad la controla el
  contenedor `#cargaBifacial` (no se togglea individualmente).

**Verificado** en Electron: legend «ESCALA Y DETECCIÓN» en mono y bifacial; el
`<details>` «Cómo funciona el modo bifacial» colapsa/expande correctamente con el
cromo `laar-details` (▶/▼).

---

## Estado final

Las tres fases del ADR-004 quedaron **implementadas y verificadas en Electron**
(2026-06-12). La pestaña Captura completa el tratamiento LAAR de las cuatro
pestañas (de-rainbow + jerarquía + cabecera de estado), homogénea con Proyecto
y Análisis. Único pendiente: prueba manual del flip dinámico de los chips con
archivos reales.
