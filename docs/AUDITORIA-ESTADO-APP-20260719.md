# Auditoría de estado — MAO Plus (2026-07-19)

> Método: exploración e indexación del árbol → clasificación código vs. documentación →
> auditoría de los archivos de código y su articulación → diagnóstico de coherencia inter-módulo.
> Antecedente: `docs/AUDITORIA-ESTADO-APP-20260622.md`. Fuente de estado ADR: `docs/ESTADO-ADRS.md`.

**Veredicto:** el código está sano y coherente; **lo que está roto es el entorno de trabajo**.
iCloud está evictando el árbol del proyecto (incluido el `.venv` y objetos de `.git`), lo que dejó
la suite de tests y `git` **no ejecutables durante esta auditoría**. El trabajo pendiente de producto
es acotado y está bien documentado: cierre de ADR-016, implementación de ADR-013 F2, y el plan
ADR-015 (que habilita PROTEC 2025).

---

## 1. Índice del contenido

### 1.1 Archivos que SON código

| Capa | Ubicación | Volumen | Rol |
|------|-----------|---------|-----|
| Shell de escritorio | `main.js` (45 KB), `preload.js` (7 KB) | ~1.5 k líneas | Electron: ventana, `protocol app://`, spawn del backend, IPC |
| Vista | `index.html` | 292 KB, 5 bloques `<script>` inline | Markup + handlers inline (`onclick="…"`) |
| Frontend | `js/` — 48 archivos `.js` | **100 840 líneas** | Lógica de aplicación |
| ├ Núcleo | `js/analysis-core.js` | **51 778 líneas** (51 % del frontend) | IIFE + módulo ES6; Tier-1 API |
| ├ Módulos ES6 | `js/modules/` — 12 archivos | ~15 000 líneas | Extracción Fase 2, por capas L0→L2 |
| └ Satélites | `obj3d-*`, `mao-*`, `comparator`, `collection`, `procrustes`… | ~34 000 líneas | 3D, IA, colección, pestañas LAAR |
| Backend | `python/` — 22 módulos | **14 609 líneas** | FastAPI :8765 + análisis |
| Estilos | `css/` — 3 activos (+3 backups) | ~286 KB activos | `main.css`, `mao-tabs-laar.css`, `procrustes.css` |
| Tests | `tests/` (20 `.py` + 1 `.js`), `python/tests/` (8 `.py`) | 28 archivos | pytest + 1 verificador estático JS |
| Runtime embebido | `runtime/` | 416 MB | CPython 3.9 relocatable (Fase A) |
| Utilidades | `scripts/build-runtime.sh`, `tools/gen_fixture.py`, `start_server.sh` | — | Build y fixtures |

### 1.2 Archivos que NO son código (documentación / registro)

| Grupo | Ubicación | Cuenta | Estado |
|-------|-----------|--------|--------|
| **ADR + planes** | `docs/` | 28 | ✅ Bien organizado — es la fuente de verdad viva |
| Guías de dominio | Raíz: `GUIA_METRICAS_MAO.html`, `FORMULAS_METRICAS_MAO.html`, `PRINCIPIOS_MORFOMETRIA_MAO.html`, `GLOSARIO_TERMINOS_MAO.html` | 4 (~360 KB) | Material de referencia científica; sin índice de acceso |
| Reportes históricos de sesión | Raíz: `AUDIT_SUMMARY.txt`, `SESION_*`, `TEST_MEJORA*`, `VALIDACION_*`, `RESUMEN_*`… | ~24 | Congelados (abr–jun); **la mayoría ya en `.gitignore`** = residuo local, no del repo |
| Arquitectura | `ARCHITECTURE.md`, `MODULES.md`, `MODULE_ARCHITECTURE_MAP.txt`, `CLAUDE.md` | 4 | Vigentes con deriva parcial (§4.7) |
| Scripts huérfanos | Raíz: `VALIDATE_TABS_ROUTER.js`, `mejoras_ps_codigo.js`, `test_cmo_aps.js`, `verificar_*.js` | 5 | No referenciados por la app; 4 de 5 ya ignorados por git |

### 1.3 Articulación (cómo se ensambla)

```
main.js (Electron)
  ├─ protocol.handle('app://')  → sirve index.html con Cache-Control: no-cache
  └─ spawn Python  → dev: .venv/bin/python · prod: Resources/python-runtime/bin/python3
                     └─ python/server.py → FastAPI :8765 (34 endpoints, prefijo /api)

index.html  (orden de carga, verificado)
  1. libs/            exifr, html2canvas, jspdf(+autotable)
  2. utilidades       toast, python-bridge, backend-status, progress, project-manager,
                      file-io, projects-ui, collection, export-manager, tooltips
  3. NÚCLEO           <script type="module" analysis-core.js?v=20260701a>
                        └─ import ×11 → js/modules/  (L0 geometry/quality/metrics/utils
                                                      L1 shape/contour/classification
                                                      L2 orchestrator/visualization/tabla
                                                      + bifacial, metric-presenter)
  4. 3D               obj3d-canonical-raster → obj3d-export → obj3d-morph-canvas → obj3d-viewer
  5. nav legacy       sidebar-nav, object-dimension-mode, comparator, cmo-standalone
  6. IA / extras      mao-ia, procrustes, aps-save, window-controls
  7. pestañas LAAR    mao-tab-router → mao-organizer-base → mao-deteccion-contract
                      → organizers (analysis/proyecto/captura/resultados)   [todos defer]
```

**Contratos que sostienen el ensamblaje:**
- **Tier-1 API** — 10 funciones `window.*` que `mao-ia.js` y `collection.js` llaman sin adaptador.
- **`window.MaoOrganizer`** (`mao-organizer-base.js`) — dependencia **dura** y previa de los 4 organizers.
- **`window.MaoDeteccion`** (ADR-008) — normaliza la salida de detección en el choke point.
- **`PythonBridge`** — único cliente HTTP estructurado (26 rutas); `mao-ia.js` y `obj3d-viewer.js`
  llaman a `/api/mao-ia` y `/api/obj3d/*` **directamente**, fuera del bridge.

---

## 2. Verificaciones ejecutadas en esta auditoría

| Verificación | Resultado |
|--------------|-----------|
| `node --check` sobre 48 `.js` + `main.js` + `preload.js` | ✅ **Limpio** |
| Verificación **ESM estricta** (copia a `.mjs` + check) — detecta redeclaraciones que `node -c` no ve | ✅ **Limpio** en los 12 módulos + núcleo |
| `node tests/test_window_contracts.js` | ✅ **PASS 33/33** contratos presentes |
| Tier-1 API: 10 asignaciones `window.*` en `analysis-core.js` | ✅ **10/10**, una asignación cada una |
| Marcadores `TODO/FIXME/HACK` en código | ✅ **1 real** (`collection.js:655`); el resto son falsos positivos de «MÉTODO»/«TODO» en español |
| Suite pytest (`tests/` + `python/tests/`) | ❌ **NO EJECUTABLE** — ver §3 |
| `git log` / `git status` | ❌ **NO EJECUTABLE** — ver §3 |

---

## 3. 🔴 Hallazgo #1 — iCloud está evictando el árbol del proyecto

**Es el hallazgo dominante de esta auditoría** y degrada todo lo demás.

**Evidencia recogida:**

| Señal | Medición |
|-------|----------|
| `.venv/…/cv2/cv2.abi3.so` (34 MB) | atributo **`dataless`** |
| `.venv/` completo | **96 KB** en disco (debería ser cientos de MB) → prácticamente todo evictado |
| Archivos **fuente** de test | **3 de 20** `.py` en `dataless` (`test_efa`, `test_morphometric_registry`, `test_obj3d_metrics`) |
| `.git/` | 4.6 MB → también parcialmente evictado (explica el bloqueo de `git log`) |
| Proceso `bird` (iCloud) | **90 % CPU** sostenido |
| `pytest`, `git log`, y hasta `cat` del `.so` | Bloqueados >10 min con **0.05 s de CPU** = espera de I/O pura |
| `brctl download .venv/…/cv2` | Completó **sin materializar** el archivo |
| Runtime embebido (`runtime/bin/python3`) | También bloqueado al importar |

**No es nuevo, y el código ya lo está compensando:** `main.js:354` y `main.js:1081` documentan que el
arranque en frío tarda **~55 s** por el import de `cv2/trimesh/onnxruntime` desde iCloud, y contienen
lógica explícita para *no* matar el backend durante esa ventana. Es decir, se está pagando complejidad
permanente en el código de producción para compensar un problema de ubicación de archivos.

**Consecuencia para esta auditoría:** no pude ejecutar la suite (última cifra conocida: 330 passed /
2 skipped) ni consultar el historial git. Todo lo reportado aquí es análisis estático más lo
verificado en §2.

---

## 4. Diagnóstico de coherencia inter-módulo

### 4.1 ✅ Lo que está sano

1. **Contratos frontend íntegros** — 33/33, Tier-1 completo. El refactor C2a/C2b no rompió nada.
2. **Sintaxis limpia** incluso bajo la verificación ESM estricta (la trampa que ya causó un bug real:
   commit `1445610`, `const` duplicada que rompía el módulo).
3. **Sin deuda de TODOs en código** — el pendiente vive en ADRs, no disperso en comentarios.
4. **Logging bajo control** — `analysis-core.js:22` instala un *shadow* de `console` que silencia los
   1 458 `console.log` del núcleo salvo con `window._MAO_DEBUG`. Único desvío: `collection.js` (93 logs
   sin gate).
5. **Distribución (Fase A) sustancialmente resuelta** — contradice la auditoría del 2026-06-22, que la
   marcaba como bloqueador #1: `runtime/` embebido (416 MB), `extraResources` en `package.json`,
   resolución dev/prod en `main.js:102-106`, y DMG arm64 construido. Firma ad-hoc sin notarización,
   conforme a la decisión congelada.
6. **`.gitignore` bien mantenido** — `dist/`, `runtime/`, `node_modules/`, `.venv/` y los residuos de
   sesión están excluidos. El desorden de la raíz es **local**, no del repositorio.
7. **ADRs 001–012 cerrados** y verificados.

### 4.2 🟠 Superficie de backend muerta (~35 % de los endpoints)

Cadena muerta en 3 capas: endpoint FastAPI → wrapper en `python-bridge.js` → **sin llamador**.

| Endpoint | Wrapper en bridge | Llamador en la app |
|----------|-------------------|--------------------|
| `/api/edges` | `detection.edges()` | — *(feature edge-analysis eliminada en la auditoría de botones 2026-06-23; backend y bridge quedaron)* |
| `/api/color` | `detection.color()` | — |
| `/api/morphology` | `morphology.*` | — |
| `/api/classify` | `.classify()` | — |
| `/api/bifacial` | `.bifacial()` | — *(el análisis bifacial vivo es el de `js/modules/bifacial-analysis.js`)* |
| `/api/analyze` | `.analyze()` | — |
| `/api/ph/detect-auto` | `detectAuto()` | — |
| `/api/fs/mkdir`, `/api/fs/write` | `fs.mkdir/write` | — |
| `/api/fs/read`, `/api/fs/list` | *(ni en el bridge)* | — |
| `/api/export/csv` | *(ni en el bridge)* | — |

**Total: ~12 de 34 endpoints sin ruta viva.** Riesgo doble: (a) mantenimiento y confusión sobre cuál es
la implementación canónica —notablemente en bifacial, donde coexisten una versión Python huérfana y una
JS viva—; (b) los cuatro `/api/fs/*` exponen lectura/escritura de sistema de archivos sobre HTTP en
localhost sin consumidor que lo justifique.

### 4.3 🟠 El monolito no se ha reducido

`js/analysis-core.js`: **51 778 líneas · 489 funciones · 83 asignaciones `window.*`**. La Fase 2 extrajo
12 módulos (~15 k líneas) pero el núcleo sigue concentrando el 51 % del frontend. Es el mayor riesgo
estructural y la razón por la que cada cambio exige verificación runtime en Electron.

### 4.4 🟠 ADR-016 (saneamiento del reporte) — en curso, con gate sin cerrar

Cerrados: #1 unidades px→mm, #2 excentricidad duplicada, #3 regularidad ×100, #4 hull 0.0000,
#7 diferencia de área, #8 ángulos Feret, `feret_clasificacion`, y #6 resuelto **semánticamente**
(se neutralizó el rótulo «fracturado/erosionado», no la medición).

Abiertos y **confirmados por inspección**:
- **#5** — el PDF muestra «Método detección N/A · Confianza —» en objetos IA. `comparator.js` sí
  consume `detection_confidence` (líneas 259, 412, 5662), pero la ruta de cabecera del reporte no.
- **#9/#10/#11** (F3 cosmético) — «Pérdida Perímetro» negativa, «Ejes Reales [N/A]» en 2D, y
  «Distancia de Asimetría» sin contextualizar: los tres renders siguen tal cual en
  `tabla-metricas-completa.js:338, 1762, 2228`.
- **Gate global sin cerrar** — regenerar el PDF del objeto de fixture en Electron.
- **Cache-bust declarado pendiente** — `tabla-metricas-completa.js` no se carga por `<script>` sino
  por `import` desde `visualization-export.js:56`, **sin `?v=`**. Probablemente inocuo desde que
  `protocol.handle('app://')` emite `Cache-Control: no-cache`, pero conviene confirmarlo y cerrar
  el punto en el ADR en vez de dejarlo abierto.

### 4.5 🟠 ADR-013 F2 — aprobada, sin implementar

Replicabilidad del contorno: variación de ±20 % con origen diagnosticado (`_build_binary_mask` estima
el fondo desde el recorte). Es **math-critical** y ya tiene gate definido (tests de determinismo,
invariancia ≤2 %, multi-imagen). Aprobada desde el 2026-06-25 sin avance.

### 4.6 🟠 Sin CI y con una única prueba de frontend, estática

No existe `.github/workflows/` — sólo `agents/`, `hooks/`, `prompts/` y `scripts/`. La suite se ejecuta
a mano. Y `tests/test_window_contracts.js`, la única prueba de frontend, es un **verificador de texto por
regex**: confirma que la cadena `window.X =` aparece en el archivo, no que la función exista ni se
comporte en runtime. La brecha que el plan de coherencia identificó («0 tests de frontend») sigue
esencialmente abierta a nivel de comportamiento.

### 4.7 🟡 Deriva de la documentación respecto al código

| Documento | Dice | Realidad medida |
|-----------|------|-----------------|
| `docs/COHERENCIA-MODULOS.md` | 101 `window.*` | **83** — C2a/C2b ya redujeron la superficie; el mapa no se actualizó |
| `docs/ESTADO-ADRS.md` | Última reconciliación ~2026-07-01 | Sin fila para **ADR-014** (dataset ML, ya implementado) ni el trabajo posterior (tests de robustez, validación EFA) |
| `CLAUDE.md` | Encabeza «Sesión 2026-06-24» | Han pasado ~4 semanas de trabajo posterior |
| `js/obj3d-export.js:47` | JSDoc cita `/api/analyze3d` | Ese endpoint **no existe** en `server.py` (es sólo un comentario, no una llamada rota) |

### 4.8 🟡 Verificaciones manuales acumuladas

Los **8 ítems del checklist ADR-010** siguen sin ejecutar desde el 2026-06-18, pese a que el hook
`window.__maoE2E.flujoCompleto()` se construyó precisamente para desbloquearlos (resuelve el límite de
que los `<input type=file>` no se pueblan por script).

### 4.9 🟡 ADR-015 — plan íntegramente pendiente

Las 12 mejoras están en ⬜. **F1 (A1 exactitud Bland-Altman · A2 reproducibilidad ICC · C3
estandarización)** es la que habilita PROTEC 2025 y la publicación con la UAB; son protocolos de
validación, no reescrituras.

---

## 5. Tareas pendientes

Orden por dependencia: T1 desbloquea la verificación de todo lo demás.

### Bloqueantes

| # | Tarea | Por qué | Esfuerzo |
|---|-------|---------|----------|
| **T1** | **Sacar el proyecto (o al menos `.venv`, `.git`, `runtime/`) de iCloud Drive** | Sin esto no hay suite, no hay git, y el arranque en frío cuesta ~55 s. Bloquea T2, T3 y toda verificación | Bajo |
| **T2** | Ejecutar la suite completa y publicar la cifra real | Última conocida: 330/2, **no verificada hoy**. Es el gate de todo lo demás | Bajo (tras T1) |

### Cierre de trabajo en curso

| # | Tarea | Detalle |
|---|-------|---------|
| **T3** | Ejecutar el checklist E2E de ADR-010 (8 ítems) | Usar `window.__maoE2E.flujoCompleto('sintetico_escala_objeto_ph.png')`; relanzar con `npm start`, **no** Cmd+R |
| **T4** | Cerrar ADR-016 #5 | Propagar `detectionMethod`/`detection_confidence` a la cabecera del reporte; reusar el mapeo ya existente en `comparator.js:412` |
| **T5** | Cerrar ADR-016 F3 (#9, #10, #11) | Reetiquetar «variación de perímetro»; ocultar «Ejes Reales» si no aplica en 2D; contextualizar la distancia de asimetría |
| **T6** | Cerrar el gate de ADR-016 | Regenerar el PDF de fixture en Electron y cotejar panel↔tabla↔CSV↔PDF |
| **T7** | Implementar ADR-013 F2 (replicabilidad del contorno) | Math-critical, con gate ya definido. Elimina la variación de ±20 % |

### Coherencia y limpieza

| # | Tarea | Detalle |
|---|-------|---------|
| **T8** | Decidir y ejecutar sobre los ~12 endpoints muertos | Eliminar (`/edges`, `/color`, `/analyze`) o declarar reservados. Prioridad a `/api/fs/*`: quitar si no se usan |
| **T9** | Resolver la duplicación bifacial Python↔JS | Declarar cuál es canónica; los `test_bifacial_parity*` dependen de una checkout externa (`MAO_A`) y se saltan si falta |
| **T10** | Añadir CI mínimo (`.github/workflows/`) | pytest + `node --check` + verificación ESM estricta + `test_window_contracts.js` en cada push |
| **T11** | Elevar el test de frontend de estático a runtime | Hoy es regex sobre texto; debería cargar el módulo y comprobar comportamiento |
| **T12** | Reconciliar la documentación | `COHERENCIA-MODULOS.md` (101→83), fila ADR-014 en `ESTADO-ADRS.md`, cabecera de `CLAUDE.md`, JSDoc `/api/analyze3d` |
| **T13** | Higiene local | 3 backups de `main.css` (20 838 líneas frente a 6 884 del activo; `.gitignore` cubre `*.backup` pero **no** `*.bak`), **worktree huérfano** `.claude/worktrees/strange-chandrasekhar-6f942d` (9.1 MB, 2026-06-30 — contamina los `grep` del árbol), 12 `.DS_Store`, `dist/` en 1.3 GB |

### Producto / científico

| # | Tarea | Detalle |
|---|-------|---------|
| **T14** | **ADR-015 F1 — A1 + A2 + C3** | Exactitud (Bland-Altman/LoA), reproducibilidad (ICC) y estandarización (CV+bootstrap). **Habilita PROTEC 2025 y el artículo con la UAB** |
| **T15** | Plan de reducción del monolito | 51 778 líneas. Requiere primero T10/T11 (red de tests) — la secuencia crítica ya establecida es *enforcement antes de limpiar* |

---

## 6. Recomendación de secuencia

1. **T1 → T2** — recuperar el entorno. Todo lo demás está bloqueado o es no verificable sin esto.
2. **T3** — pagar la deuda de verificación acumulada (8 ítems) de una sola pasada con el hook E2E.
3. **T4 → T6** — cerrar ADR-016, que es el trabajo a medio camino y toca la superficie que ve el revisor
   del artículo.
4. **T14** — arrancar ADR-015 F1, que es lo único con fecha externa (PROTEC 2025).
5. **T10 → T11 → T15** — construir la red de tests y sólo entonces atacar el monolito.

**Nota metodológica:** T8, T12 y T13 son de bajo riesgo y pueden intercalarse en cualquier momento.
T7 y T15 son math-critical / estructurales: no abordarlos sin la suite verde y verificada (T2).
