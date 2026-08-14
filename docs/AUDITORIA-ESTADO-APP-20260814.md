# Auditoría de código y coherencia de módulos — MAO Plus

**Fecha:** 2026-08-14
**Rama auditada:** `claude/app-audit-8d7d3a` (idéntica a `main`, HEAD `32cc8e2`, 2026-07-19)
**Alcance:** aplicación completa (Electron + FastAPI), excluyendo `node_modules/`, `.venv/`, `.git/`, `libs/` (vendor).
**Método:** (a) índice código ↔ documentación → (b) tipos de archivo y forma de articulación → (c) auditoría estática + ejecución de la suite.

**Veredicto:** el motor de cálculo está **sano y verificado** (342/2 en 12 s, ESM estricto limpio, 33/33 contratos). Los problemas no son de corrección numérica sino de **estructura y de gestión del repositorio**: 8,6 % de `analysis-core.js` es código muerto duplicado, 8 endpoints son verticales muertas, no hay CI, y **el trabajo más reciente de la aplicación no está en `main`**.

---

## 1. Índice: qué es código y qué no

191 archivos versionados. La separación es nítida y se resume así:

### 1.1 Código ejecutable — la superficie real de la app

| Capa | Tipo | Nº | Ubicación | Líneas | Rol |
|---|---|---|---|---|---|
| Proceso principal | `.js` | 2 | `main.js`, `preload.js` | 1 412 | Shell Electron, spawn del backend, IPC |
| Renderer — scripts clásicos | `.js` | 31 | `js/` | ~48 000 | UI, colección, 3D, comparador, organizers LAAR |
| Renderer — monolito ESM | `.js` | 1 | `js/analysis-core.js` | **51 778** | Puente IIFE + Tier-1 API + flujo de análisis |
| Renderer — módulos ESM | `.js` | 13 | `js/modules/` | ~13 000 | Cálculo morfométrico, clasificación, render de tabla |
| Vista | `.html` | 1 | `index.html` | 292 KB | DOM único; fija el orden de carga |
| Estilos | `.css` | 3 | `css/` | 9 020 | `main.css` 6 884 · `mao-tabs-laar.css` 1 708 · `procrustes.css` 428 |
| Backend API | `.py` | 1 | `python/server.py` | 2 173 | FastAPI, 34 endpoints bajo `/api`, puerto 8765 |
| Backend módulos | `.py` | 18 | `python/modules/` | 14 344 | Detección, contorno, métricas, 3D, EFA, P/H, escala |
| Herramientas | `.py`/`.sh` | 4 | `python/tools/`, `scripts/` | ~600 | Validador de dataset, build del runtime, lanzador |
| Tests | `.py` | 28 | `tests/`, `python/tests/` | 5 901 | 20 + 8 suites pytest |
| Tests | `.js` | 1 | `tests/test_window_contracts.js` | 100 | Contrato de globales `window.*` |
| Config | `.json`/`.txt` | 5 | raíz | — | `package.json`, `requirements{,-dev,-runtime}.txt` |

### 1.2 No es código — documentación, informes y ruido

- **29 archivos `.md`/`.txt`/`.html` en la raíz**: auditorías previas, informes de sesión, guías de métricas (`FORMULAS_METRICAS_MAO.html` 100 KB, `GUIA_METRICAS_MAO.html` 106 KB, `PRINCIPIOS_MORFOMETRIA_MAO.html` 82 KB). Material de referencia valioso, pero mezclado con la superficie ejecutable.
- **27 documentos en `docs/`**: 16 ADR + estado consolidado + planes. Es la documentación viva y está bien organizada.
- **`.github/`**: agentes, hooks y prompts — **no hay `workflows/`**.
- **Ruido versionado**: `css/main.css.bak`, `css/main.css.bak.20260517_123952`, `css/main.css.bak.20260518_203437`, `modularize.py`, `VALIDATE_TABS_ROUTER.js`, `js/theme.js` (1 línea: «tema oscuro eliminado»).

> **Hallazgo de índice.** La raíz mezcla 29 documentos con el código. No rompe nada, pero un lector nuevo no distingue la app de sus informes. Los `.bak` de CSS versionados son un riesgo real: son candidatos a editarse por error.

---

## 2. Tipos de archivo y forma de articulación

### 2.1 Frontend — dos mundos de scope

`index.html` carga **41 recursos en orden fijo**: 3 CSS, 4 librerías vendor, 34 scripts. De esos 34, **33 son scripts clásicos** (globales sobre `window`) y **uno solo es ESM**: `js/analysis-core.js`, que importa los 13 módulos de `js/modules/`.

```
index.html
├── css/*.css (3, con ?v= cache-bust)
├── libs/*.js (4, vendor: exifr, html2canvas, jspdf ×2)
├── scripts clásicos (33)  ──────────────►  window.*
│     toast · python-bridge · project-manager · collection · comparator ·
│     procrustes · obj3d-* · sidebar-nav · mao-tab-router · mao-*-organizer …
└── analysis-core.js  type="module"  ─────►  import ./modules/*.js (13)
```

Grafo ESM real (verificado, 13 módulos):

```
Capa 0   geometry-primitives · contour-quality · morphometric-metrics · utility-helpers · metric-presenter
Capa 1   shape-classification · contour-extraction · classification-engine
Capa 2   metrics-orchestrator · visualization-export ──► tabla-metricas-completa
Capa 2d  bifacial-analysis
Huérfano category-manifest  ◄── 0 importadores
```

**La frontera clásico↔ESM es la fuente estructural de riesgo del proyecto.** Los dos mundos solo se comunican por `window.*`, y `analysis-core.js` mantiene además variables locales que espeja a mano: **83 nombres globales distintos, 124 asignaciones**.

> ⚠️ **Corrección a la documentación.** `ARCHITECTURE.md` sitúa `tabla-metricas-completa.js` en la Capa 2 como si `analysis-core` la importara. No lo hace: la importa `visualization-export.js` y la re-exporta. `docs/COHERENCIA-MODULOS.md` declara «TOTAL 101» globales; el recuento real hoy es **83** (C2a/C2b ya redujeron y el mapa no se actualizó). Cifra a corregir.

### 2.2 Backend — articulación limpia

`server.py` importa `python/modules/*` y expone **34 endpoints REST** bajo `/api`. El frontend los consume por HTTP a `127.0.0.1:8765`. Sin estado compartido, sin acoplamiento circular relevante (el único ciclo conocido, `detection ↔ mao_ia_analyzer`, está resuelto con import perezoso documentado). Respaldado por 28 suites de tests.

### 2.3 La articulación cruzada: `js/python-bridge.js`

El puente declara **13 espacios de nombres** (`detection`, `contour`, `metrics`, `efa`, `obj3d`, `morphology`, `scale`, `comparator`, `persistence`, `ph`, `bifacial`, `pipeline`, `sam`, `classifier`) que envuelven 30 de los 34 endpoints. Es la disciplina de acceso correcta: timeout, health check, degradación a modo solo-JS.

**Pero no es la única.** Cuatro archivos la esquivan con `fetch` directo:

| Archivo | Endpoints llamados a pelo |
|---|---|
| `js/obj3d-viewer.js` | `/api/obj3d/contour-analyze` (×3), `/api/obj3d/front-back-metrics-homologated` |
| `js/mao-ia.js` | `/api/mao-ia` (×2), `/api/efa` |
| `js/analysis-core.js` | `/api/detect` (×2), `/api/dataset/export` |
| `js/mao-resultados-organizer.js` | `/api/health`, `/api/debug-log` |

Consecuencia: esas 10 llamadas no heredan el timeout, el health check ni la degradación del puente. Es la incoherencia de articulación más concreta del frontend.

---

## 3. Auditoría del código: estado verificado

Todo lo de esta sección se **ejecutó**, no se infirió.

| Verificación | Resultado |
|---|---|
| Suite pytest completa (`tests/` + `python/tests/`) | ✅ **342 passed, 2 skipped, 12,0 s** |
| Entorno Python (`cv2` 4.13.0, `numpy` 2.0.2, `scipy`, `sklearn`) | ✅ importables — el problema de desalojo por iCloud está resuelto |
| Parseo ESM estricto de los 13 módulos + `analysis-core` | ✅ 13/13 `OK`; `analysis-core` parsea (falla solo por `document` ausente en Node, esperado) |
| Contrato de globales (`node tests/test_window_contracts.js`) | ✅ **33/33 contracts present** |
| Referencias rotas en `index.html` | ✅ ninguna: los 41 recursos existen |
| Árbol de trabajo | ✅ limpio |
| Config de empaquetado (`package.json > build`) | ✅ completa (arm64, DMG, `extraResources`) |

Los 2 `skipped` son `test_bifacial_parity{,_v2}.py`, que se saltan a propósito si falta el checkout externo `MAO_A`. Correcto.

**Conclusión de esta sección: el motor matemático y su verificación están en buen estado.** Los hallazgos que siguen son estructurales.

---

## 4. Diagnóstico de coherencia — hallazgos

### 🔴 H1 — El trabajo más reciente de la app no está en `main`

`main` (= la rama auditada) está en `32cc8e2`, del **2026-07-19**. Dos ramas descienden de ella y **ninguna está integrada**:

| Rama | Commits | Qué aporta | Solape |
|---|---|---|---|
| `fix/exportaciones-fuente-unica-estado` | 5 (hasta 2026-07-31) | Reconocimiento de forma invariante a la rotación, ponderación de evidencias por poder discriminante, restauración del fallback JS de métricas, fuente única de `currentAnalyzedObject`, 2 suites nuevas (`test_clasificacion_formas.py`, `test_shape_classification.mjs`) | — |
| `claude/detection-optical-error-improvements-3618a6` | 1 (`b7f069d`, ADR-017) | Procedencia de detección + error óptico en todas las salidas, índice canónico, **cableado de `category-manifest.js`** (+109 líneas), −803 líneas de `analysis-core.js`, `js/modules/detection-section.js` | — |

Las dos tocan **5 archivos en común**: `index.html`, `js/analysis-core.js`, `js/modules/metrics-orchestrator.js`, `js/modules/visualization-export.js`, `js/project-manager.js`. Ambas modifican fuertemente `analysis-core.js` (una +127/−…, la otra +803/−681 sobre el mismo monolito).

**Riesgo:** cuanto más se tarde en integrar, más caro y más arriesgado es el merge sobre un archivo de 51 778 líneas. Además, «el estado de la aplicación» hoy es ambiguo: hay tres respuestas distintas según la rama.

**Acción:** decidir el orden de integración y ejecutarlo antes de cualquier trabajo nuevo. Sugerido: ADR-017 primero (es 1 commit y *reduce* `analysis-core`), luego `fix/exportaciones` sobre esa base.

### 🔴 H2 — 72 funciones duplicadas muertas en `analysis-core.js` (~4 478 líneas)

La factorización ESM de la Fase 2 se hizo **copiando**, no moviendo: el IIFE conservó sus propias definiciones. De los 105 `export function` de `js/modules/`, **82 tienen una definición homónima dentro de `analysis-core.js`**. Desglose medido:

| Situación | Nº | Estado |
|---|---|---|
| Copia local sin ninguna llamada ni exposición | **72** | ☠️ código muerto — **~4 478 líneas, 8,6 % del archivo** |
| Copia local realmente invocada (sombra viva del módulo) | **8** | ⚠️ dos implementaciones vivas a la vez |
| Copia local expuesta vía `window.X = fn` | 2 | contrato — revisar caso a caso |

Las 8 sombras vivas: `calcularRugosidadContorno`, `calcularTexturaSuperficie`, `canvasToImageCoords`, `imageToCanvasCoords`, `contarMetricas`, `metaClasificarForma`, `safeToFixed`, `updateDisplays`.

**Verificación de divergencia** (diff normalizado local ↔ módulo):

- `safeToFixed` → ✅ idénticas.
- `calcularRugosidadContorno` → ⚠️ divergen en forma, no en resultado: el módulo llama `clasificarRugosidad` importada; la copia local llama `MetricPresenter.clasificarRugosidad`. Misma fuente única (ADR-016), comportamiento equivalente **hoy**.
- `metaClasificarForma` → ⚠️ **314 líneas (módulo) vs 471 (local)**. Divergencia sustantiva.

Sobre `metaClasificarForma` hay un matiz importante y verificado: **las 6 llamadas reales usan `ClassificationEngine.metaClasificarForma`** (el módulo). La copia local de 471 líneas no se invoca nunca… salvo que `analysis-core.js:11741` hace `typeof metaClasificarForma === 'function'` como guarda —que resuelve a la copia local— y acto seguido llama a la del módulo. **La guarda comprueba una cosa y ejecuta otra.** Si alguien borrase la copia local sin tocar la guarda, el bloque de recálculo desde caché dejaría de ejecutarse en silencio.

Este es exactamente el patrón que ya costó dos bugs registrados (el error óptico perdido en el merge de IA; las 3 copias eliminadas en la consolidación de 2026-06-24). Quedan 72 más.

**Acción:** borrar las 72 copias muertas es mecánico y de bajo riesgo (cero llamadas), pero debe hacerse **después** de integrar H1, porque ambas ramas tocan ese archivo. Las 8 sombras exigen decisión caso a caso y arreglar la guarda de `metaClasificarForma` primero.

### 🟠 H3 — 8 verticales muertas entre backend y frontend

De los 34 endpoints, **8 no tienen ni un solo consumidor** en ninguna de las dos disciplinas de acceso (puente o `fetch` directo):

| Endpoint | Envoltorio en el puente | Llamadas |
|---|---|---|
| `/api/morphology` | `morphology.analyze` | 0 |
| `/api/edges` | `detection.edges` | 0 |
| `/api/color` | `detection.color` | 0 |
| `/api/bifacial` | `bifacial.*` | 0 |
| `/api/obj3d/metrics` | `obj3d.metrics` | 0 |
| `/api/analyze` | `pipeline.*` | 0 |
| `/api/fs/list` | `persistence.listFiles` | 0 |
| `/api/export/csv` | — (sin envoltorio) | 0 |

Son **tres capas de código vivo que no se ejecutan nunca**: la ruta en `server.py`, el módulo Python detrás y el envoltorio JS. `/api/bifacial` es el caso más caro: el análisis bifacial existe duplicado en Python (endpoint muerto) y en JS (`js/modules/bifacial-analysis.js`, vivo), y solo la versión JS se usa.

**Acción:** decidir por endpoint entre *cablear* o *retirar*. `/api/bifacial` y `/api/morphology` merecen decisión explícita (¿se quiere el cálculo en Python?); el resto son candidatos claros a retirada.

### 🟠 H4 — Sin CI y con la única prueba del frontend desconectada

- `.github/` tiene agentes, hooks y prompts, pero **no tiene `workflows/`**. Nada verifica nada automáticamente al hacer push.
- `package.json` no define script `test`. `tests/test_window_contracts.js` —que pasa 33/33— **solo corre si alguien lo invoca a mano**.
- La verificación del frontend se agota ahí: 33 contratos comprobados sobre **83 globales** (≈ **40 % de cobertura de contrato**), y es un verificador **por regex sobre el texto fuente** — comprueba que la asignación existe, no que la función funcione. Cobertura de comportamiento del frontend: **0 %**.

Con dos ramas pendientes de merge sobre un monolito de 51 K líneas, la ausencia de una comprobación automática es el multiplicador de riesgo de H1 y H2.

**Acción mínima y barata:** añadir `"test": "node tests/test_window_contracts.js && python -m pytest tests/ python/tests/ -q"` a `package.json`, y un workflow que lo ejecute en push y PR.

### 🟡 H5 — ADR-011 entregado a medias: el manifiesto canónico no está cableado

`js/modules/category-manifest.js` declara **24 categorías validadas** y tiene **0 importadores**. Fue la Fase 1 de ADR-011 (taxonomía canónica de las 4 salidas: panel, tabla, CSV, PDF). Las fases F2–F6 —migrar cada salida a leer del manifiesto— nunca se hicieron, así que las cuatro salidas siguen manteniendo su propia lista de categorías.

Esto no es un detalle cosmético: la causa raíz de los 11 hallazgos de ADR-016 sobre un PDF real fue precisamente «deriva ADR-011 no migrada al reporte». El manifiesto es el antídoto y está desconectado.

**Nota:** ADR-017 (rama sin integrar, H1) añade +109 líneas a este archivo y lo cablea. **Integrar H1 cierra parcialmente H5** — razón adicional para priorizar el merge.

### 🟡 H6 — Documentación de arquitectura desalineada con el código

| Documento | Dice | Realidad medida |
|---|---|---|
| `ARCHITECTURE.md` | `tabla-metricas-completa.js` en Capa 2, importada por `analysis-core` | La importa `visualization-export.js` y la re-exporta |
| `ARCHITECTURE.md` | `utility-helpers.js` 621 líneas | 540 |
| `docs/COHERENCIA-MODULOS.md` | 101 globales `window.*` | **83** |
| `CLAUDE.md` | «183 tests Python, 1 skipped» | **342 passed, 2 skipped** |
| `CLAUDE.md` | «Suite completa → 257 passed» (bloque *Run & Test*) | ídem |

`docs/ESTADO-ADRS.md` sí está bien mantenido y es fiable — es la fuente única correcta. El desfase está en los documentos de arquitectura de la raíz.

### 🟡 H7 — Ruido versionado y logging sin control

- 3 `.bak` de `css/main.css` versionados en git.
- `js/theme.js` (1 línea de comentario) se carga en `index.html`.
- `modularize.py` y `VALIDATE_TABS_ROUTER.js` son andamiaje de migraciones ya cerradas.
- **1 458 `console.log` en `analysis-core.js`** (+95 en `visualization-export.js`, 93 en `collection.js`, 59 en `diagnostics.js`). El roadmap Fase 1 silenció 191 tras `window._MAO_DEBUG`; el grueso sigue sin gate.
- 27 marcadores `TODO`/`FIXME`/`HACK` en el código.

### 🟢 H8 — Empaquetado: config lista, runtime sin construir

`package.json > build` está completo y es coherente con `main.js` (`app.isPackaged` → `Resources/python-runtime/bin/python3`). Los archivos que la config referencia existen, **salvo el directorio `runtime/`**, que produce `scripts/build-runtime.sh`.

No es un defecto de código: es un paso de build. Pero conviene notar la discrepancia con la auditoría del 2026-07-19, que daba `runtime/` por construido (416 MB) y el DMG arm64 por generado: **hoy no existe `runtime/` ni `dist/` en el repositorio**, ni en el worktree ni en la copia principal. Mientras no se ejecute el script, `npm run package` produce un DMG sin backend Python.

---

## 5. Estado de implementación por subsistema

| Subsistema | Estado | Evidencia |
|---|---|---|
| Backend FastAPI + módulos de cálculo | ✅ **Sólido** | 342/2 en 12 s; 26 de 34 endpoints con consumidor real |
| Motor morfométrico 2D (métricas, EFA, escala, P/H) | ✅ **Sólido y verificado** | Suites dedicadas + `test_estandar_matematico` + `test_robustez_motor` |
| Motor 3D (`obj3d_v2`, 3 848 líneas) | ✅ Funcional | `test_obj3d_*` (4 suites); `/api/obj3d/metrics` muerto pero `contour-analyze` vivo |
| Detección (ADR-012/013) | ✅ Núcleo único OpenCV | 4 modos sobre `detection.detect()`; ADR-013 F2 (replicabilidad) pendiente |
| UI de pestañas LAAR (ADR-001…005) | ✅ Implementada y verificada | Organizers + lenguaje canónico `.laar-chip` |
| Reporte / salidas (ADR-011, ADR-016) | 🟡 **A medias** | ADR-016 6 de 11 hallazgos; ADR-011 F2–F6 sin migrar (H5) |
| Frontend: estructura del monolito | 🔴 **Deuda alta** | 51 778 líneas, 90 globales, 72 duplicados muertos (H2) |
| Verificación automática | 🔴 **Ausente** | Sin CI, sin `npm test` (H4) |
| Distribución macOS | 🟡 Config lista, build pendiente | `runtime/` no construido (H8) |
| Integración de ramas | 🔴 **Bloqueante** | 2 ramas sin merge, 5 archivos en solape (H1) |

---

## 6. Orden de trabajo recomendado

El orden importa: varios puntos se estorban si se hacen al revés.

1. **H1 — integrar las dos ramas.** Primero `b7f069d` (ADR-017: 1 commit y *reduce* `analysis-core.js`), luego `fix/exportaciones`. Nada más debe tocar `analysis-core.js` hasta cerrar este punto.
2. **H4 — cablear la verificación.** `npm test` + un workflow de GitHub Actions. Es la red de seguridad de todo lo que sigue, y cuesta una tarde.
3. **H2 — borrar las 72 copias muertas** (~4 478 líneas). Mecánico, cero llamadas, pero solo con (1) y (2) hechos. Antes de tocar las 8 sombras, **arreglar la guarda de `metaClasificarForma`** en `analysis-core.js:11741`.
4. **H5 — cablear `category-manifest.js`** en las 4 salidas (F2–F6 de ADR-011). Parcialmente resuelto por (1); completar el resto cierra la causa raíz de ADR-016.
5. **H3 — decidir sobre las 8 verticales muertas.** Cablear o retirar, endpoint por endpoint. Empezar por `/api/bifacial` (duplicación Python↔JS real).
6. **H6/H7 — sanear documentación y ruido.** Corregir las cifras de `ARCHITECTURE.md`, `COHERENCIA-MODULOS.md` y `CLAUDE.md`; borrar los `.bak`, `theme.js`, `modularize.py`, `VALIDATE_TABS_ROUTER.js`; mover los 29 documentos de la raíz a `docs/`.
7. **H8 — ejecutar `scripts/build-runtime.sh`** y validar el DMG completo.

---

## 7. Ejecución del punto 1 — ramas integradas (2026-08-14)

El paso 1 del orden recomendado se ejecutó el mismo día, en la rama `claude/app-audit-8d7d3a`
(que partía del mismo commit que `main`). **H1 queda cerrado.**

| # | Merge | Commit | Conflictos |
|---|---|---|---|
| 1 | `claude/detection-optical-error-improvements-3618a6` (ADR-017) | `10eec4b` | ninguno |
| 2 | `fix/exportaciones-fuente-unica-estado` (5 commits) | `ec12dd0` | **1**, trivial |

El único conflicto fue el `?v=` de `analysis-core.js` en `index.html`: ambas ramas lo habían
bumpeado (`20260731a` vs `20260731b`). Como el archivo fusionado difiere de las dos versiones,
se resolvió con una versión nueva, **`?v=20260814a`** — que es lo que exige la convención de
cache-busting del proyecto. `js/analysis-core.js`, `metrics-orchestrator.js`,
`visualization-export.js` y `project-manager.js` auto-fusionaron sin intervención.

**Verificación posterior a cada merge:**

| Métrica | Antes | Tras ADR-017 | Tras ambos |
|---|---|---|---|
| Suite pytest | 342 / 2 | 347 / 2 | ✅ **369 passed, 2 skipped** |
| Contratos `window.*` | 33/33 | 33/33 | ✅ 33/33 |
| ESM estricto | 13/13 | 14/14 | ✅ limpio |
| `tests/test_shape_classification.mjs` | — | — | ✅ **15/15** |
| `tests/test_clasificacion_formas.py` | — | — | ✅ 22 passed |
| Referencias rotas en `index.html` | 0 | 0 | ✅ 0 |
| Marcadores de conflicto residuales | — | — | ✅ 0 |

Se comprobó además que sobrevivieron las aportaciones de **ambas** ramas en el archivo que las dos
reescribían: `detection-section` y `category-manifest` importados (ADR-017), fallback JS de métricas
e importación de `shape-classification` (`fix/exportaciones`).

**Efectos sobre el resto del diagnóstico:**

- **H5 cerrado en parte, como se preveía.** `js/modules/category-manifest.js` pasó de **0 a 2
  importadores** (`analysis-core.js` y `tabla-metricas-completa.js`). Quedan por migrar las salidas
  restantes.
- **La suite ganó un test real de comportamiento del frontend.** `test_shape_classification.mjs`
  (15 casos) ejercita el módulo de verdad, no por regex — es el primer contrapeso al 0 % de
  cobertura de comportamiento señalado en H4. H4 sigue abierto: no hay CI ni `npm test`.
- **H2 no se movió.** `analysis-core.js` bajó de 51 778 a **51 514** líneas, pero las −803 de
  ADR-017 estaban en el código de reporte y detección, no en los duplicados: siguen siendo
  **72 copias muertas (~4 478 líneas), 8 sombras vivas y 2 expuestas**. Los globales subieron de
  83 a **86**. La guarda de `metaClasificarForma` sigue viva, ahora en
  `js/analysis-core.js:11816` (antes `:11741`) — **ese es el número a usar en el punto 3**.

> **Pendiente de decisión del usuario:** los merges están en `claude/app-audit-8d7d3a`; `main`
> sigue en `32cc8e2`. Avanzar `main` a `ec12dd0` es un fast-forward. Nada se ha publicado.

---

## Anexo — comandos de verificación reproducibles

```bash
.venv/bin/python -m pytest tests/ python/tests/ -q
```

```bash
node tests/test_window_contracts.js
```

```bash
grep -oE "window\.[a-zA-Z_$][a-zA-Z0-9_$]*\s*=" js/analysis-core.js | sed 's/\s*=//' | sort -u | wc -l
```
