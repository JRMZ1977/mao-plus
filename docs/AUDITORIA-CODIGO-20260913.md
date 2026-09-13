# Auditoría de código — MAO Plus

**Fecha:** 2026-09-13 · **Rama:** `claude/audit-export-modules-b320d2` (8 commits)
**Alcance:** verificar la **efectividad de implementación** de las mejoras de exportación y la
coherencia entre módulos tras ellas.

**Veredicto: las mejoras están efectivamente implementadas.** 40 comprobaciones mecánicas sobre el
código, 0 fallos reales. Los 3 «fallos» que arrojó la primera pasada eran defectos de mis propias
aserciones, no del código (§5).

---

## 1 · Índice: código vs. no-código

| Categoría | Archivos | Líneas |
|---|---:|---:|
| **JS de aplicación** (Electron + ESM) | 49 | 97.806 |
| **Python backend** (FastAPI) | 21 | 13.860 |
| `index.html` — shell único | 1 | 4.580 |
| JS de terceros (`libs/`, vendorizado) | 4 | 427 |
| CSS | 2 | — |
| Tests Python (pytest) | 25 | — |
| **Tests JS** (node, sin dependencias) | **3** | — |
| — *no código* — | | |
| Documentación `.md` | 33 | — |
| Guías `.html` no ejecutables | 5 | — |
| Informes `.txt` | 7 | — |

Distinción relevante: los cinco `.html` de la raíz (`GUIA_METRICAS_MAO.html`,
`FORMULAS_METRICAS_MAO.html`…) **no forman parte del código** — son material de consulta que no se
carga desde `index.html`. Lo mismo los `.txt` de informes.

## 2 · Articulación entre tipos

```
index.html  (shell único, ordena la carga)
├── 37 scripts CLÁSICOS  → comparten globals; EL ORDEN IMPORTA
│     mao-organizer-base.js  DEBE preceder a los 4 organizers (dependencia dura)
│     mao-export-destino.js  DEBE preceder a analysis-core.js
└──  1 entrada ESM: analysis-core.js  →  importa 10 módulos de js/modules/

preload.js  → contextBridge, 23 puentes IPC  (nodeIntegration: false)
main.js     → 23 handlers IPC + spawn de uvicorn
python/     → FastAPI :8765, 33 endpoints  ←  js/python-bridge.js
```

**Frontera crítica IIFE ↔ ESM.** `analysis-core.js` envuelve su cuerpo en un IIFE; los módulos ESM
**no ven sus variables locales**. El acoplamiento se sostiene con **128 asignaciones a `window`**.
Es el punto estructural más débil del sistema y el origen directo de 2 de los 5 defectos
encontrados en esta rama (§4).

## 3 · Efectividad de las mejoras — 33 comprobaciones, 0 fallos

| Bloque | Comprobado |
|---|---|
| **C1 · Payload TPS/EFA** (10) | `SCALE=`/`IMAGE=` estándar · sin el `COMMENT=scale_px_mm` no estándar · no inventa escala cuando no la hay · centinela `0` del backend · CSV de 11 columnas · `coefficients_raw` y `scale_factor` presentes · metadatos entrecomillados · claves de fuente estables |
| **C2 · Bifacial** (5) | bloque IMC en el CSV **vivo** · IMC ausente se declara · nombre del par compartido por los 4 exportables · ya no se nombra desde el formulario |
| **C3 · `obj.id` numérico** (4) | sin `.id?.replace(` sin sanear · saneado en `analysis-core`, `collection` y **la ruta de guardado** de `project-manager` |
| **C4 · Binding único** (3) | no existe `let currentAnalyzedObject` · la global se declara antes de usarse · parche de alineación retirado |
| **C5 · ID sellado** (5) | se sella en `obj.idArqueologico` · es fuente preferente · se persiste · la carpeta del análisis lo prefiere · **no reescribe `obj.id`** (ADR-008 C2 intacto) |
| **C6 · Timeouts** (4) | `_conTimeout` en 5 puntos · `imageTimeout: 0` erradicado · 7 pasos del lote auditables |
| **C7 · Código muerto** (5) | 7 funciones ausentes · `export-manager.js` borrado · sin `<script>` huérfano · cero referencias colgantes |
| **C8 · Capa de destino** (6) | sin IPC nuevo · **reversible** (los 3 puntos comprueban `activo`) · crea subcarpetas · manifiesto con motivos · orden de carga correcto |

## 4 · Coherencia entre módulos — 7 comprobaciones, 0 fallos

Todos los `<script>` del shell existen · los 10 imports ESM resuelven · `mao-organizer-base`
precede a los organizers · cache-bust presente en los archivos tocados · API expuesta a `window`
intacta (7 símbolos, incluidos los nuevos) · `contextBridge` sin `nodeIntegration` · **cero
referencias a los símbolos eliminados**.

### Diagnóstico estructural

**El acoplamiento por `window` es el riesgo vivo.** De los cinco defectos que esta rama corrigió,
dos nacieron ahí:

- `currentAnalyzedObject` existía **dos veces** (el `let` del IIFE y la propiedad global que
  escribe el módulo ESM, donde el identificador no está declarado). Ningún linter lo ve: es JS
  legal. Solo se manifiesta en runtime y solo en ciertos flujos.
- Varias funciones estaban **duplicadas** entre el IIFE y los módulos, con una copia muerta que se
  parcheaba sin efecto (documentado ya en `CLAUDE.md` para `cargarMetadatos`).

**El contrato de tipo de `obj.id` no está garantizado.** Es numérico en detección automática y
cadena arqueológica en otros flujos. Ocho sitios asumían cadena; el `?.` no protege. Mitigado a
nivel de nombres con `_baseNombreAnalisis()`, pero la laxitud de fondo sigue: es ADR-008 C2.

## 5 · Nota de método: tres falsos positivos de la auditoría

Conviene registrarlo, porque quien repita esta auditoría los volverá a ver:

1. **C2.4** esperaba 3 usos de `_baseNombreParBifacial`; hay 4 (se añadió el orquestador del lote).
2. **C3.2** buscaba `String(obj.id ?? '')`; 4 de esos sitios se **mejoraron** después a
   `_baseNombreAnalisis()`, que es estrictamente mejor.
3. **D2** marcaba `utility-helpers.js?v=…` como no resuelto: el archivo existe, el comprobador no
   descontaba el `?v=` en los *imports ESM* (sí lo hacía en los `<script src>`).

Ninguno era un defecto del código. Una aserción desactualizada da la misma señal roja que un
bug real, y distinguirlos exige mirar cada uno.

## 6 · Regresión

- `node --check` limpio en **52 archivos**.
- **95 comprobaciones JS** en 3 suites sin dependencias (`npm run test:js`), que extraen las
  funciones **reales** del IIFE en vez de copiarlas.
- Python: **262 passed · 4 skipped · 7 failed**. Los 7 fallos son `ModuleNotFoundError: sklearn`
  en `test_comparator.py` (PCA), **ambientales**: el `.venv` del proyecto vive en el checkout
  principal y no en este worktree. Comprobado que fallan igual sin los cambios de la rama.

## 7 · Pendientes abiertos

| # | Asunto | Severidad |
|---|---|---|
| 1 | ~~Staleness de la cabecera ADR-002~~ → ✅ **CORREGIDA** (2026-09-13, ver §8) | — |
| 2 | **`analysis-core.js` sigue en ~30k líneas** tras quitar 4.263. La frontera IIFE↔ESM con 128 puentes a `window` seguirá generando defectos de este tipo. | Media — estructural, no urgente |
| 3 | **Nombres del par bifacial** ambiguos (`_comparacion.csv` vs `_bifacial.csv` vs `_bifacial.pdf`). | Baja — nomenclatura |
| 4 | **Lote bifacial** verificado con caras construidas a mano; la máquina de estados bifacial no se ejercita por script. | Baja — cobertura de prueba |

---

## 8 · Corrección: staleness de la cabecera ADR-002 (2026-09-13)

**Síntoma.** Tras confirmar una P/H los datos cambiaban (`perforaciones: 1, candidatos: 0`) pero la
cabecera seguía mostrando «1 candidata — confirmar». Afectaba **igual al chip P/H preexistente y al
nuevo de exportación**, así que no era del chip sino del refresco.

**Lo que despistó.** `#morphologicalAnalysisContainer` tenía la clase `adr2-on`, que parecía probar
que el organizer seguía vivo. No lo prueba: `classList.add` es **sticky** — atestigua que
`organize()` corrió *alguna vez*, no que siga corriendo. Con una sonda temporal en `buildHeader` se
vio la secuencia real.

**Tres fragilidades corregidas**, todas en el camino «dato cambia → cabecera se entera»:

1. **Latch del planificador.** `schedule()` marcaba `scheduled = true` y confiaba en
   `requestAnimationFrame`, **que no dispara en ventanas ocultas o minimizadas**. Ahora corre lo
   primero que llegue —rAF o un temporizador de respaldo de 250 ms— con ejecución idempotente.
2. **Observador huérfano.** Vigilaba `#morphologicalMetrics`; el panel se re-renderiza reemplazando
   nodos internos, así que tras el primer re-render observaba un elemento ya desconectado. Reanclado
   al **contenedor**, que sí es estable, con `subtree: true`.
3. **Ninguna señal de intención.** `finalizarTodosTrazados` y los confirmadores de candidatos mutaban
   las P/H sin avisar a nadie: el refresco dependía de que el re-render produjera una mutación
   observable en el instante justo. Nuevo evento **`mao:ph:changed`**, emitido por quien muta los
   datos (4 puntos) y escuchado por el organizer junto a `mao:objects:changed` y `mao:analysis:done`.

**Verificado en Electron**, con la ventana en segundo plano (el escenario que antes lo rompía):

| Chip | Antes de confirmar | Después |
|---|---|---|
| P/H | `1 candidata — confirmar` | `1 perforacion · 0 horadaciones` |
| Exportar | `1 P/H sin confirmar` (`--wa`) | **`Listo para exportar`** (`--ok`) |

**Nota honesta sobre la atribución:** las tres correcciones se aplicaron juntas y no se aisló cuál
bastaba por sí sola. La (1) es la que explica el fallo observado en ventana oculta; la (2) y la (3)
eliminan fragilidades reales del mismo camino. No se reclama precisión mayor que ésa.

---

*Auditoría mecánica: 40 aserciones sobre el código fuente, más verificación E2E previa en Electron
con backend Python real y archivos reales en disco (`docs/AUDITORIA-EXPORTACION-20260912.md` §10–§12).*
