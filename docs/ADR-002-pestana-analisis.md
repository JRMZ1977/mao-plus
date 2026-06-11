# ADR-002 — Rediseño de la pestaña «Análisis»: jerarquía, estilo LAAR y flujo P/H

- **Estado:** Aprobado (2026-06-11) · implementación pendiente por fases
- **Decisores:** JFRR (orden de secciones y rol de P/H) · Claude (diagnóstico y diseño)
- **Precedentes:** ADR-001 (guards de flujo UI, documentado en `CLAUDE.md`) · fix de visibilidad del panel morfológico (commit `67a6599`)

---

## Contexto

Tras el fix `67a6599`, la pestaña Análisis muestra por fin el panel completo
(`#morphologicalAnalysisContainer`), pero arrastra la deuda del modelo
sidebar-scroll. Diagnóstico verificado en Electron con datos reales
(DRG15_NC856 / DRG16_NC1263):

| # | Problema | Evidencia |
|---|----------|-----------|
| 1 | **Sin jerarquía** | Un solo scroll de ~6.225 px; todo vive en el grupo «a) Métricas»; el veredicto (forma + confianza) queda sepultado; el EFA al final del grupo A. |
| 2 | **Información triplicada** | Panel inline + `sidebarResultCard` («Ver métricas completas») + modal «Tabla Completa» (181 métricas): tres vistas del mismo dato. |
| 3 | **Anti-LAAR** | Cabeceras naranja/azul/verde/púrpura, valores coloreados, gradientes. El token `--laar-b500` está declarado como «único uso cromático permitido». |
| 4 | **Flujo confuso** | «GUARDAR Y FINALIZAR» arriba y «NUEVO ANÁLISIS» abajo; Herramientas + Exportar solo alcanzables tras 6 k px de scroll; exports sin indicar qué produce cada uno. |
| 5 | **Breadcrumb erróneo** | Dice «Resultados › …» estando en la pestaña Análisis. |
| 6 | **Conflación P/H** ⚠ | `(obj.perforaciones && obj.perforaciones.length) || 0` (`tabla-metricas-completa.js:2801`): «sin evaluar» (`undefined`) se muestra igual que «evaluado: ninguna» (`[]`). Observado en vivo: disco DRG16 con orificio central evidente reportaba *Total Perforaciones: 0 · Porosidad: 0.00%*. Exportado a CSV, el dato es falso. |

**Premisa de P/H (JFRR):** la detección de perforaciones/horadaciones **infiere
sobre las métricas del objeto** (porosidad, patrón de agrupamiento, ratios de
área, EFA con P/H confirmados — `_hidratarEFAConfirmadoPH`,
`analysis-core.js:22972`), por lo tanto P/H es **etapa del pipeline**, no
herramienta accesoria, y debe estar disponible desde el principio.

---

## Decisión

### A. Jerarquización de la información

Orden interpretativo → técnico, con secciones colapsables:

```
┌─ CABECERA DE RESULTADO (sticky) ──────────────────────────────────┐
│ DRG15…_245 · obj #1 · MAO IA      Forma: LANCEOLADA · 65.1%       │
│ P/H: ⚠ SIN EVALUAR [Evaluar P/H]  Escala 0.0099 · Área 17.8 mm²  │
├───────────────────────────┬───────────────────────────────────────┤
│  LIENZO (sticky)          │  SECCIONES                            │
│  imagen + overlays        │  ▾ §1 Clasificación        (abierta)  │
│  [Real|Contorno|          │  ▾ §2 P/H — Perforaciones &           │
│   Esquema|EFA-recon]      │       Horadaciones         (abierta)  │
│  Leyenda ▾                │  ▾ §3 EFA — Fourier elíptico (abierta)│
│                           │  ▸ §4 Dimensiones + Radial            │
│                           │  ▸ §5 Forma & Geometría               │
│                           │  ▸ §6 Conservación                    │
│                           │  ▸ §7 Textura óptica (GLCM)           │
│                           │  ▸ §8 Procesamiento / técnico         │
└───────────────────────────┴───────────────────────────────────────┘
```

1. **Cabecera de resultado sticky** que absorbe el `sidebarResultCard`
   redundante: identificación, forma + confianza + consenso, chip P/H,
   stat-strip (escala, área, ejes).
2. **Orden §2 P/H antes de §3 EFA** (decisión JFRR 2026-06-11): coherencia de
   dependencias — P/H alimenta al EFA y a las métricas; el lector ve la causa
   antes que el efecto. EFA permanece *above the fold*.
3. **Lienzo unificado**: fusionar canvas del grupo A + «b) Contorno Depurado» +
   «c) Vista Esquemática» en un solo lienzo con conmutador segmentado
   (Real / Contorno / Esquema / EFA-reconstrucción) + capa P/H.
4. **Modal «Tabla Completa (181)»** se reencuadra como *vista de poder*
   (filtro + CSV + imprimir), no como vía principal de lectura.
5. Breadcrumb corregido: «Análisis › Morfometría › …».

### B. Estilo visual LAAR

Aplicado con la disciplina de tokens de `css/mao-tabs-laar.css`, acotado a
`.mao-main #morphologicalAnalysisContainer` (reversible):

| Regla | Aplicación |
|-------|------------|
| Acento único `--laar-b500` | Solo CTA primaria, sección activa, enlaces. |
| Cuerpo en grises | Cabeceras `g700` · valores `g900` (tabular-nums) · micro-etiquetas `g500` mayúsculas. |
| Semánticos = estado real | `ok/wa/er` solo para: estado P/H, nivel de confianza, métrica fuera de rango, fragmentación. Nunca decoración por fila. |
| Plano | Radio 4 px, borde 0.5 px `g200`, sin sombra ni gradiente, transición 100 ms. |
| Excepción | Lienzo oscuro `#111827` se conserva (token «sin cambio permitido»). |

### C. Flujo P/H (pieza central)

1. **Chip tri-estado en la cabecera sticky** — disponible desde el primer píxel:

   | Estado del dato | Render | Significado |
   |---|---|---|
   | `obj.perforaciones === undefined` | ⚠ ámbar `--laar-wa-*` «SIN EVALUAR» + botón **Evaluar P/H** | métricas P/H provisionales |
   | evaluado, con hallazgos | ✓ verde `--laar-ok-*` «2 perforaciones · 1 horadación» + **Editar** | métricas completas |
   | evaluado, sin hallazgos | ✓ gris «Evaluado · sin P/H» | el cero es un cero real |

   El botón delega en el cableado existente (`trazarPerforacionesBtn` legacy).
   **No se toca la máquina de estados del Perforation Modal** (regla del
   proyecto: diferida por alto riesgo). Solo se reposiciona el punto de
   entrada y se refleja su estado.

2. **Métricas provisionales:** mientras P/H esté sin evaluar, las métricas que
   infiere muestran `— pendiente P/H` (no un `0` engañoso): Porosidad, Total
   Perforaciones/Horadaciones, patrón de agrupamiento, ratios de área, y nota
   en el listado EFA («contorno sin P/H confirmados»). Al confirmar, rehidratan
   por la vía existente (recompute + `_hidratarEFAConfirmadoPH`).

3. **Sección §2** con: contadores, tabla por P/H individual, ratios, patrón de
   agrupamiento. Abierta por defecto si el estado es «sin evaluar».

4. **Capa P/H en el lienzo** (las leyendas `leyendaPerforaciones` /
   `leyendaHoradaciones` ya existen en el DOM); desde el lienzo también se
   lanza Evaluar/Editar P/H.

5. **Guard suave en «Guardar y Finalizar»:** si P/H está sin evaluar, la CTA no
   bloquea pero pregunta: *«¿Finalizar sin evaluar P/H?»* →
   `[Evaluar ahora]` / `[Marcar «sin P/H» y finalizar]`. Fuerza la decisión
   explícita del tri-estado en el único punto donde importa (coherente con la
   filosofía de guards de ADR-001). Opcional: emitir `mao:ph:done` (evento
   nuevo, simétrico a `mao:detection:done` / `mao:analysis:done`).

### D. Barra de acciones (pie sticky)

```
│  Exportar ▾ →  CSV · tabla de métricas    PDF · reporte integral   │
│                SVG · trazado vectorial    PNG · morfología c/escala│
│  ──────────────────────────────────────────────────────────────── │
│        [Nuevo análisis]              [Guardar y finalizar →]       │
```

- La zona «Herramientas» **desaparece** (P/H se movió a la cabecera/lienzo).
- Cada export con sub-etiqueta de qué artefacto produce.
- «Nuevo análisis» secundario · «Guardar y finalizar» primaria `b500` con el
  guard suave de P/H; al confirmar avanza a la pestaña Resultados.

---

## Plan por fases (incremental, reversible, Strangler Fig)

| Fase | Alcance | Riesgo | Verificación |
|------|---------|--------|--------------|
| **1 — Estilo LAAR** | De-rainbow + aplanado; solo CSS en `mao-tabs-laar.css` acotado al panel. Sin tocar DOM/lógica. | Bajo | Visual en Electron + bump `?v=` |
| **2 — Jerarquía + P/H** | Cabecera sticky con chip P/H tri-estado, orden §1–§8, marcado «pendiente P/H», breadcrumb. | Medio | Visual + sonda DOM |
| **3 — Lienzo unificado** | Conmutador de vista + capa P/H, fusionando grupos A-canvas/B/C. | Medio-alto | Visual; preservar IDs de canvas legacy |
| **4 — Barra de acciones** | Pie sticky; unificar Guardar/Nuevo/Exportar; guard suave P/H. | Medio | Visual; botones legacy siguen cableados |

## Restricciones (reglas del proyecto)

- API Tier 1 intacta; `mao-ia.js` y `collection.js` sin cambios.
- Máquinas de estado de alto riesgo (Detection Engine, Manual Selection,
  **Perforation Modal**) no se modifican internamente.
- Cada fase reversible de forma independiente.
- Validación = runtime visual en Electron **relanzando** (no Cmd+R);
  `node -c` + health check no ven CSS/layout.
- Al editar cualquier `.css`/`.js` versionado: bump `?v=` en `index.html`.

## Consecuencias

- ✅ El veredicto y el estado P/H visibles sin scroll; EFA en §3 above the fold.
- ✅ Se elimina la triplicación (cabecera absorbe `sidebarResultCard`; modal
  queda como vista de poder).
- ✅ Integridad científica: imposible exportar «0 perforaciones» sin que nadie
  haya decidido que ese cero es real.
- ⚠ La fusión del lienzo (Fase 3) es el cambio más delicado: tres canvas
  legacy con renderers distintos; exige verificación visual exhaustiva.
- ⚠ Mientras no se implemente la Fase 2, la conflación `undefined`/`[]` del
  punto 6 del contexto sigue activa en la tabla de 181 métricas.
