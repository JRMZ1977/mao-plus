# ADR-003 — Rediseño de la pestaña «Proyecto»: jerarquía, estilo LAAR y auto-identificación Opción C

- **Estado:** Aprobado (2026-06-11) · **Fases 1-3 IMPLEMENTADAS y verificadas en Electron (2026-06-12)**
- **Decisores:** JFRR (orden de secciones, re-derivación automática en Opción C) · Claude (diagnóstico y diseño)
- **Precedentes:** ADR-001 (guards de flujo UI) · ADR-002 (rediseño pestaña Análisis: cabecera sticky, chips tri-estado, guard suave, de-rainbow)

---

## Contexto

La pestaña Proyecto agrupa tres secciones heredadas del modelo sidebar-scroll
(`fieldsetGestionProyectos`, `sectionIdentificacion`, `sectionModo`,
ver `mao-tab-router.js` TABS[0]). Diagnóstico sobre `index.html:449–736`:

| # | Problema | Evidencia |
|---|----------|-----------|
| 1 | **Decisión rectora enterrada** | El selector 2D/3D («define el flujo de trabajo» según su propio label) vive DENTRO del fieldset Gestión de Proyectos, debajo del info-box didáctico (`#objectDimensionSelector`, index.html:519). El otro selector de modo (mono/bifacial) sí tiene fieldset propio. Dos decisiones del mismo rango a niveles distintos. |
| 2 | **Orden contradice la dependencia** | `object-dimension-mode.js` declara «Define el modo de trabajo ANTES de la identificación»; la Opción C de identificación cambia su preview según mono/bifacial. Pero el DOM ordena: Proyecto → Identificación → Modo. |
| 3 | **Estado disperso** | Cuatro indicadores sueltos: `proyectoActivoIndicador`/`sinProyectoIndicador`, `identificacionAsignada`, `objectDimensionStatus`, `modoDescripcion`. No hay un punto donde leer «Proyecto X · ID asignada · 2D monofacial». |
| 4 | **Equivalente al «0 falso» de P/H** ⚠ | «Sin Proyecto Activo» es un aviso neutro y nada impide avanzar: se pueden correr análisis completos creyendo que se guardan en disco cuando solo van al navegador. Nadie decidió explícitamente «trabajar sin proyecto». |
| 5 | **Anti-LAAR** | Todo en estilo inline: gradiente `linear-gradient(135deg,#CFD8DC…)` en Identificación Asignada, azul `#0066cc`/verde `#28a745` en caras A/B, rojos `#D32F2F`/`#bf360c`, bordes 2px. |
| 6 | **Sin CTA ni jerarquía de botones** | 4 botones de proyecto con idéntico peso (Gestionar/Crear/Abrir/Importar); ningún «Continuar a Captura →». Textos didácticos siempre expandidos. |
| 7 | **Fricción Opción C** ⚠ | Identificación «Por archivo»: el preview del nombre ya se actualiza automáticamente al cargar imágenes (`actualizarPreviewFotografia()` en los handlers de carga, analysis-core.js:43599 / 45297 / 54137), pero la CONFIRMACIÓN exige volver a Proyecto y pulsar `btnAsignarFotografia` (analysis-core.js:54110). Residuo del modelo de scroll único: con pestañas se volvió un retroceso de flujo. |

---

## Decisión

### A. Jerarquización

```
┌─ CABECERA DE ESTADO (sticky) ──────────────────────────────────────┐
│ Proyecto: ⚠ SIN PROYECTO [Crear/Activar]   ID: ⚠ SIN ASIGNAR      │
│ Flujo: 2D · Monofacial                                             │
├────────────────────────────────────────────────────────────────────┤
│ ▾ §1 Proyecto        (gestión: Crear/Activar primaria, resto       │
│                       secundarias; ayuda en <details> colapsado)   │
│ ▾ §2 Flujo de trabajo (2D/3D promovido a sección propia +          │
│                       mono/bifacial anidado, visible solo en 2D)   │
│ ▾ §3 Identificación  (A/B/C; indicador absorbido por la cabecera)  │
├────────────────────────────────────────────────────────────────────┤
│              [Continuar a Captura →]  (guard suave)                │
└────────────────────────────────────────────────────────────────────┘
```

1. **Orden §2 Flujo antes de §3 Identificación** (decisión JFRR 2026-06-11):
   la dependencia va en esa dirección — el flujo condiciona cómo se identifica
   (simétrico a «P/H antes de EFA» del ADR-002). Se invierte el orden actual
   del DOM moviendo nodos **con IDs y listeners intactos** (patrón
   `relocateOrphanedControls` ya probado). `objectDimensionSelector` sale de
   Gestión de Proyectos y se fusiona con `sectionModo` en una sección
   «Flujo de trabajo». No agrava la deuda F4 de ADR-001 (el router sigue
   leyendo los mismos IDs de radios).
2. **Cabecera con chips tri-estado** (mismo patrón que el chip P/H):

   | Chip | Estados |
   |------|---------|
   | Proyecto | ⚠ ámbar «SIN PROYECTO» [Crear/Activar] · ✓ verde «‹nombre activo›» · ✓ gris «Sin proyecto (decidido)» — el tercer estado exige pulsar explícitamente «Trabajar sin proyecto» |
   | ID | ⚠ ámbar «SIN ASIGNAR» · ✓ valor asignado (absorbe `identificacionAsignada`) · ◔ «auto al cargar imágenes» si Opción C pendiente |
   | Flujo | informativo: «2D · Monofacial» / «2D · Bifacial» / «3D» |

3. **Progressive disclosure**: «¿Qué es un proyecto?», explicación 2D/3D,
   tip de identificación y nota de nombre común bifacial pasan a `<details>`
   colapsados.

### B. Estilo visual LAAR

Disciplina de tokens de `css/mao-tabs-laar.css`, acotado a los fieldsets de la
pestaña Proyecto (reversible):

| Regla | Aplicación |
|-------|------------|
| Acento único `--laar-b500` | Una sola primaria por sección (Crear/Activar proyecto; Asignar identificación), CTA «Continuar a Captura». |
| Cuerpo en grises | Legends/labels `g700` · valores `g900` · micro-etiquetas `g500`. |
| Semánticos = estado real | `wa` para «sin proyecto»/«sin asignar», `er` solo errores de validación, `ok` para asignado/activo. Nunca decoración. |
| Plano | Radio 4 px, borde 0.5 px `g200`, sin sombra ni gradiente, transición 100 ms. |
| Caras A/B | El azul/verde funcional de Captura se conserva solo como acento de borde desaturado, no como color de texto. |
| `!important` | Necesario contra estilos inline del HTML legacy (precedente E2 del fix 2026-06-09). |

### C. Auto-asignación de identificación en Opción C (pieza central)

> Cuando el modo de identificación activo es **Opción C (por archivo)** y aún
> no hay identificación bloqueada, la carga de archivos asigna la
> identificación automáticamente en el punto donde ya se actualiza el preview
> — sin volver a la pestaña Proyecto.

1. **Punto de enganche**: los call sites existentes de
   `actualizarPreviewFotografia()` (mono 43599, bifacial 45297, OBJ 3D vía
   `mao:obj3d-file-changed` 54137). Función nueva
   `autoAsignarIdentificacionFotografia()` que verifica
   `modoIdFotografia.checked` + `!identificacionActual.bloqueada` + nombre
   derivado disponible → **delega en el cableado existente** (mismo patrón que
   el chip P/H del ADR-002 delega en `trazarPerforacionesBtn`).
2. **Regla bifacial**: solo auto-asignar cuando existe el **nombre común**
   (ambas caras cargadas). Con una sola cara, el preview se actualiza pero la
   asignación espera a la segunda.
3. **Re-derivación silenciosa** (decisión JFRR 2026-06-11, opción a): si ya
   auto-asignada y se carga otra imagen distinta, se re-deriva
   automáticamente + toast. El archivo es la fuente de verdad mientras nadie
   haya confirmado manualmente; en Opción C el usuario eligió justamente «que
   mande el archivo». La asignación manual (click en `btnAsignarFotografia` o
   en las opciones A/B) sí queda bloqueada y exige «Cambiar».
4. **Feedback en sitio**: toast «Identificación asignada automáticamente: X» +
   chip ID de la cabecera pasa a ✓, emitiendo `mao:identification:assigned`
   (simétrico a los eventos ADR-001).
5. **Modo 3D incluido**: el listener `mao:obj3d-file-changed` cubre la
   identificación por nombre de archivo .OBJ.

### D. CTA y guard suave

- Pie con **«Continuar a Captura →»** primaria `b500`.
- Guard suave (no bloquea, pregunta — filosofía ADR-001/002):
  - Sin proyecto activo y sin decisión: *«¿Continuar sin proyecto activo? Los
    análisis solo se guardarán en el navegador»* → `[Crear proyecto]` /
    `[Continuar sin proyecto]`.
  - Opción C seleccionada sin archivos: informa (no advierte): *«La
    identificación se asignará automáticamente al cargar las imágenes»* —
    estado legítimo para avanzar.
  - Opciones A/B sin asignar: *«¿Continuar sin identificación asignada?»*.
- Opcional: emitir `mao:project:ready`.

---

## Plan por fases (incremental, reversible, Strangler Fig)

| Fase | Alcance | Riesgo | Verificación |
|------|---------|--------|--------------|
| **1 — Estilo LAAR** | De-rainbow vía CSS acotado a los 3 fieldsets (`!important` contra inline) + `<details>` para textos didácticos. Sin tocar lógica. | Bajo | Visual Electron + bump `?v=` |
| **2 — Jerarquía** | Cabecera de estado con chips tri-estado; promover 2D/3D a §2 fusionado con mono/bifacial (mover nodos, IDs intactos). | Medio | Visual + sonda DOM (radios siguen cableados) |
| **3 — CTA + guard + auto-ID** | Pie «Continuar a Captura →», decisión explícita «sin proyecto», guard suave, `autoAsignarIdentificacionFotografia()` con los 3 escenarios (mono, bifacial A+B, OBJ 3D). | Bajo-medio | Visual; `projects-ui.js` sin cambios |

## Restricciones (reglas del proyecto)

- API Tier 1 intacta; `mao-ia.js`, `collection.js` y `projects-ui.js` sin cambios internos.
- Máquinas de estado de alto riesgo no se modifican.
- Cada fase reversible de forma independiente.
- Validación = runtime visual en Electron **relanzando** (no Cmd+R).
- Al editar cualquier `.css`/`.js` versionado: bump `?v=` en `index.html`.

## Consecuencias

- ✅ Estado del proyecto legible de un vistazo; imposible trabajar «sin
  proyecto» sin haberlo decidido explícitamente (análogo al cero real de P/H).
- ✅ Opción C deja de exigir el viaje de vuelta Captura → Proyecto.
- ✅ Las dos decisiones de modo (2D/3D y mono/bifacial) quedan en una sola
  sección, antes de la identificación, en el orden de dependencia real.
- ⚠ La promoción del selector 2D/3D (Fase 2) mueve nodos con listeners vivos
  de `object-dimension-mode.js`; exige verificación visual de ambos modos.
- ⚠ La re-derivación silenciosa cambia el contrato implícito de `bloqueada`
  para el caso auto-asignado: requiere distinguir asignación automática de
  manual (flag interno `auto`).

---

## Registro de implementación (2026-06-12)

Las tres fases quedaron implementadas y verificadas en Electron (sonda DOM
`executeJavaScript` + capturePage desde `main.js`, retirada tras verificar).

| Fase | Archivos | Notas |
|------|----------|-------|
| 1 | `css/mao-tabs-laar.css` (sección «ESTÉTICA LAAR — PESTAÑA PROYECTO»), `index.html` (4 `<details class="laar-details">`) | De-rainbow + textos colapsables. |
| 2 | `index.html` (`#adr3ProyectoHeader` con chips; nuevo `<fieldset id="sectionFlujo">` que absorbe `#objectDimensionSelector` + `#sectionModo`), `js/mao-tab-router.js` (TABS[0].sections + branch `proyecto` en `applyModeVisibility`), `js/mao-proyecto-organizer.js` (nuevo), CSS de chips | El selector 2D/3D quedó **antes** de Identificación. `#sectionModo` anidado en `#sectionFlujo` con IDs/listeners intactos. |
| 3 | `index.html` (`#adr3ProyectoFooter` con CTA), `js/analysis-core.js` (`autoAsignarIdentificacionFotografia()` + guard en `actualizarPreviewFotografia` + eventos `mao:identification:assigned`/`:cleared`), `js/mao-proyecto-organizer.js` (guard suave + `go('captura')`) | Auto-ID Opción C con `auto:true` y re-derivación silenciosa; manual = sticky. |

**Verificado por sonda:** chips Proyecto(ok)/ID(wa→ok por evento→wa por clear)/Flujo(2D·Mono→2D·Bifacial); §2 Flujo contiene 2D/3D + modo sin duplicar IDs; CTA presente; cabecera visible.

**Bug corregido en verificación:** la cabecera sticky con `top:0` quedaba detrás
de las barras fijas (topbar+tabbar, 70px). Fix: `top: calc(var(--laar-topbar-h)
+ var(--laar-tabbar-h))`.

**Pendiente de prueba con datos reales (manual):** la auto-asignación en Opción C
al cargar imágenes (mono JPG / bifacial A+B / OBJ 3D) se verificó por lógica +
`node -c` + eventos, pero NO cargando archivos reales (los `<input type=file>` no
se pueden poblar por script). Probar manualmente los 3 escenarios.
