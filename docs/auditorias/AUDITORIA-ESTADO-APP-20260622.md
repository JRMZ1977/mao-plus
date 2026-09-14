# Auditoría — Estado de avance como aplicación de escritorio + Plan de desarrollo total

> **Fecha:** 2026-06-22 · **Rama auditada:** `feat/laar-runtime-fix-estetica` (HEAD `4f34f61`)
> **Alcance:** todo el código de `MAO PLUS_PY_01` (backend Python, frontend JS, shell Electron, empaquetado).
> **Método:** inventario de archivos → distinción código/documentación → mapa de articulación →
> diagnóstico por capa → deuda priorizada → plan por fases.
> **Evidencia objetiva:** suite `288 passed, 2 skipped` (12.6 s) · `npm`/`node -c` limpio · git tree limpio.

---

## 1. Índice: qué es código y qué es documentación

### 1a. Código (lo que ejecuta la app)

| Capa | Archivos clave | Tipo | LOC aprox. | Estado |
|------|----------------|------|-----------|--------|
| **Shell Electron** | `main.js` (1.16k LOC), `preload.js` | proceso principal + contextBridge | ~1.4k | Maduro |
| **Vista** | `index.html` (4 587 líneas, 290 KB), `css/main.css`, `css/mao-tabs-laar.css` | HTML/CSS | — | ⚠ HTML monolítico con 4 `<script>` y 3 `<style>` inline |
| **Frontend núcleo** | `js/analysis-core.js` | **IIFE monolito (55 534 LOC, 2.6 MB)** | 55.5k | ⚠ Riesgo estructural |
| **Frontend ES6** | `js/modules/*.js` (11 módulos) | módulos extraídos (Fase 2) | ~13k | Bien factorizado |
| **Frontend resto** | `comparator.js`, `obj3d-viewer.js`, `procrustes.js`, `project-manager.js`, `collection.js`, `mao-ia.js`, `visualization-export.js`, organizers LAAR… (37 archivos) | UI / dominio | ~34k | Funcional, archivos grandes |
| **Backend** | `python/server.py` (2 118 LOC, 33 endpoints) | FastAPI | 2.1k | Maduro |
| **Backend módulos** | `python/modules/*.py` (17 módulos) | análisis de imagen / morfometría | ~11.7k | **Capa más sólida** |
| **Tests** | `tests/*.py` + `python/tests/*.py` (23 archivos) | pytest | ~5k | 288 ✓ / 2 skip |

**Totales de código:** ~102 000 LOC JS · ~13 900 LOC Python · ~5 000 LOC tests.

### 1b. Documentación y artefactos (no ejecutables)

- **Documentación viva y útil:** `CLAUDE.md` (30 KB, índice del codebase), `docs/ESTADO-ADRS.md`
  (fuente única de verdad de los 10 ADR), `docs/ADR-00{1..10}-*.md`, `ARCHITECTURE.md`, `MODULES.md`,
  `README_DEVELOPMENT.md`. **Disciplina de ADR notable** — es el principal activo de mantenibilidad.
- **Debris en la raíz (37 archivos `.md/.txt/.html`):** muchos son informes de sesión históricos ya
  **listados en `.gitignore`** pero **aún presentes en disco** (`VALIDACION_*`, `SESION_COMPLETADA_*`,
  `TEST_MEJORA*`, `RESUMEN_*`, `AUDITORIA_*`). 4 guías HTML grandes (72–104 KB:
  `GUIA_METRICAS_MAO.html`, `FORMULAS_METRICAS_MAO.html`, `PRINCIPIOS_MORFOMETRIA_MAO.html`,
  `ANALISIS_3D_MAO.html`) — material de referencia valioso pero mal ubicado (deberían vivir en `docs/`).
- **Backups versionados:** `index.html.backup` ×3, `main.js.backup`, `preload.js.backup` — ruido en git.
- **Artefacto muerto:** `yolov8n.pt` (6.5 MB) **trackeado** pero YOLO fue **retirado** del código
  (commit `8675ede`); solo quedan menciones en comentarios y en el *exporter* opcional de SAM.
- **Build:** `dist/MAO Plus-1.2.0.dmg` (121 MB, 2026-06-03) — no trackeado (correcto).

---

## 2. Articulación de los módulos (cómo se conecta todo)

```
┌─────────────────────────── PROCESO PRINCIPAL (Electron) ───────────────────────────┐
│  main.js  ── spawn ──▶  uvicorn python.server:app  (127.0.0.1:8765, FastAPI)         │
│    ├─ watchdog + health check (/api/health) + auto-restart                            │
│    ├─ PYTHON_BIN = APP_DIR/.venv/bin/python  ·  fallback a `python` del PATH          │
│    ├─ warmup cv2+numpy (mitiga evicción iCloud)                                       │
│    └─ ~30 ipcMain.handle (fs-*, save-file, select-folder, boot-metrics, renderer-err)│
│                                                                                       │
│  preload.js  ── contextBridge ──▶  window.maoTabRouter / window.electronAPI          │
└──────────────────────────────────────────────────────────────────────────────────────┘
            │ carga index.html (CSP script-src 'self')
            ▼
┌─────────────────────────────── RENDERER (frontend) ───────────────────────────────┐
│  analysis-core.js  (IIFE)  ── expone ──▶  221 × window.*  (Tier 1 = 10 contractuales)│
│    ├─ importa los 11 módulos ES6 de js/modules/ (orden por capas L0→L1→L2)           │
│    ├─ fetch HTTP ──▶  los 33 endpoints del backend                                   │
│    └─ callers legacy intocables: mao-ia.js, collection.js                            │
│                                                                                       │
│  Capa UI LAAR (Strangler Fig, aditiva y reversible):                                 │
│    mao-tab-router.js → mao-organizer-base.js (window.MaoOrganizer)                    │
│       → mao-{proyecto,captura,analisis,resultados}-organizer.js                      │
│       → mao-deteccion-contract.js (window.MaoDeteccion, normaliza salida de captura) │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**Backend interno:** `server.py` orquesta 17 módulos (`detection`, `contour`, `metrics`, `efa`,
`obj3d_v2`, `morphometric_registry`, `sam_segmenter`, `ph`, `scale`, `bifacial`…) con **imports
perezosos** dentro de los handlers (evita ciclos y acelera el arranque). `morphometric_registry.py`
(ADR-006) es la fuente canónica de las 31 métricas 2D↔3D.

**Contrato de acoplamiento crítico** (documentado en `CLAUDE.md`): el **Tier 1 API** (10 `window.*`)
no se puede renombrar ni quitar; `mao-ia.js` y `collection.js` los llaman sin modificar. El acoplamiento
real es mayor: **221 asignaciones `window.*`** forman la superficie global efectiva.

**Coherencia entre capas:** alta en el backend (registry único, tests de contrato, paridad 2D/3D
verificada). En el frontend la coherencia se sostiene por convención y por la capa canónica LAAR
(`.laar-chip`/`MaoOrganizer`), **no por tipos ni tests** — es el punto más frágil.

---

## 3. Diagnóstico por capa

### 3.1 Backend Python — **Maduro (la mejor capa)** 🟢
- 33 endpoints REST cohesionados; 17 módulos de responsabilidad clara.
- **288 tests pasan, 2 skip** (skips legítimos: requieren la checkout externa `MAO_A`).
- Refactors recientes correctos y con cobertura: EFA invariancia rotacional, Procrustes/Feret 3D,
  registry canónico ADR-006 (Δ < 1e-6), detección P/H seedless ADR-009, contrato de salida ADR-008.
- **Riesgos:** `obj3d_v2.py` (3 848 LOC) y `metrics.py` (1 130 LOC) son archivos grandes; aislamiento
  del event-loop asyncio en Py3.9 ya resuelto pero es una trampa latente documentada.

### 3.2 Frontend JS — **Funcional pero con riesgo estructural** 🟠
- `analysis-core.js` = **55 534 LOC en un solo archivo**. Es el activo más crítico y el más frágil:
  un `ReferenceError` por pérdida de scope IIFE→módulo ya ocurrió dos veces (cargarMetadatos,
  visualization-export) y solo se detecta en runtime visual.
- **0 tests automatizados de frontend** (los 290 son Python). 102 000 LOC sin red de seguridad.
- **1 807 `console.log`** en `js/*.js` (Fase 1 silenció 191 con `window._MAO_DEBUG`; resto pendiente).
- Patrón recurrente «**pendiente de verificación visual en Electron**»: síntoma directo de la ausencia
  de E2E. El hook `window.__maoE2E` (ADR-010) es el embrión correcto de la solución, pero su checklist
  de 8 ítems **nunca se ejecutó**.

### 3.3 Shell Electron — **Maduro** 🟢
- Watchdog con auto-restart, fallback JS-only, resolución de conflicto de puerto, métricas de boot
  (~2.8 s), `webSecurity:true`, CSP estricta, fix de arranque en frío `app://` (esquema propio).
- Bien instrumentado para resiliencia.

### 3.4 Empaquetado y distribución — **Incompleto** 🔴 (bloqueador para terceros)
- `electron-builder` produce **DMG dual-arch (x64+arm64)** — la mecánica existe y funcionó (v1.2.0).
- **Pero el Python no va embebido:** `package.json files` excluye `.venv`; `PYTHON_BIN` apunta a un
  `.venv/bin/python` que **no existe dentro del bundle** → cae al `python` del PATH, que en una máquina
  ajena no tiene `cv2/fastapi/numpy`. Resultado: en un Mac de terceros la app arranca **en modo
  JS-only** y el análisis no funciona.
- DMG actual del **2026-06-03**, anterior a ~3 semanas de trabajo (desactualizado).
- **Sin notarización/firma verificada** (hay `hardenedRuntime` + entitlements declarados, falta validar).
- **Sin auto-update.**

### 3.5 Infraestructura de proyecto — **Débil** 🟠
- **Sin CI:** `.github/` tiene `agents/`, `hooks/`, `prompts/`, `scripts/` pero **no `workflows/`**.
  Los 290 tests solo corren a mano. Nada impide mergear código roto.
- **Riesgo iCloud:** proyecto + `.venv` en `~/Documents` → iCloud **evicta `cv2.abi3.so`** de forma
  intermitente (causa de caídas del backend). Mitigado con warmup; el fix robusto (sacar `.venv` de
  iCloud) sigue pendiente.
- **Deriva de `requirements.txt`:** marca `scikit-learn` como «instalar en Fase 3» pero **ya está
  instalado** (1.6.1); lista `rawpy`/`exifread` como no instalados aunque RAW/EXIF se manejan en el
  frontend. El manifiesto no refleja el entorno real.

---

## 4. Estado de avance — veredicto

**Madurez global: ~75 % · «Beta avanzada de uso interno».**

| Eje | Avance | Comentario |
|-----|:------:|------------|
| Funcionalidad de dominio (morfometría 2D/3D) | **90 %** | Completa y verificada por tests |
| Backend / API | **90 %** | Sólido, cubierto, coherente |
| Shell de escritorio (boot, resiliencia, IPC) | **85 %** | Robusto |
| UI / flujo LAAR | **70 %** | Implementado; faltan verificaciones visuales E2E |
| Calidad de frontend (tests, tamaño de archivos) | **35 %** | Monolito + 0 tests JS |
| **Distribución a terceros (Python embebido, firma, update)** | **25 %** | **Bloqueador principal** |
| Infra (CI, higiene de repo) | **30 %** | Sin CI; debris y artefactos muertos |

**En una frase:** MAO Plus es una aplicación de escritorio **funcionalmente madura y científicamente
sólida para uso interno**, cuyo siguiente salto no es de funcionalidad sino de **industrialización**:
empaquetar Python, blindar el frontend con tests y poner una red de CI.

---

## 5. Deuda priorizada (orden de ataque)

| # | Hallazgo | Severidad | Esfuerzo | Acción |
|---|----------|:---------:|:--------:|--------|
| D1 | Python no embebido en el DMG | 🔴 Alta | M | Bundlear intérprete + deps (PyInstaller/`python-build-standalone`) y apuntar `PYTHON_BIN` a `process.resourcesPath` |
| D2 | 0 tests de frontend / verificación solo manual | 🔴 Alta | M-L | E2E **a través de Electron**: runner casero sobre `MAO_PROBE`+`__maoE2E` (Ruta 1, 0 deps) → graduar a Playwright `_electron` en CI (Ruta 2). Pytest del backend se queda como está |
| D3 | Sin CI | 🟠 Media | S | GitHub Actions: pytest + `node -c` en cada push |
| D4 | `analysis-core.js` 55k LOC monolito | 🟠 Media | L | Continuar Strangler Fig: extraer módulos ES6 de uno en uno con validación |
| D5 | Riesgo iCloud (.venv evictado) | 🟠 Media | S | Mover `.venv` fuera de `~/Documents` (o documentar ubicación obligatoria) |
| D6 | Higiene de repo: backups, `yolov8n.pt` muerto, debris en raíz | 🟢 Baja | S | `git rm` backups + `yolov8n.pt`; mover guías HTML a `docs/`; borrar debris gitignoreado |
| D7 | `requirements.txt` desincronizado del entorno | 🟢 Baja | S | `pip freeze` → reconciliar (sklearn ya instalado) |
| D8 | 1 807 `console.log` | 🟢 Baja | S | Completar migración a `window._MAO_DEBUG` |
| D9 | ADR-008 C2 (rewrite `id` compuesto) | 🟢 Baja | M | Diferido conscientemente; abordar solo si se unifican IDs |

---

## 6. Plan de desarrollo total (por fases)

> Reconcilia y extiende el *roadmap de continuación* (aprobado 2026-06-18). La **Fase 1 (estabilizar)**
> ya está mayormente commiteada; este plan reordena las prioridades a la luz de la auditoría.

### Fase A — Industrialización de la distribución (desbloquea el envío a terceros) — *2–3 semanas*
**Objetivo: que el DMG funcione en un Mac que nunca vio Python.**
1. **A1. Embeber Python** (D1): bundlear intérprete + deps con un runtime relocatable; `PYTHON_BIN`
   resuelto vía `app.isPackaged ? process.resourcesPath : .venv`. Hito: backend vivo en máquina limpia.
2. **A2. Firma + notarización** macOS (validar `hardenedRuntime`/entitlements end-to-end).
3. **A3. Sacar `.venv` de iCloud** (D5) y documentar la ubicación canónica del entorno de dev.
4. **A4. Reconstruir el DMG** (está al 2026-06-03) y verificar instalación en un segundo equipo.

### Fase B — Red de seguridad (frena la regresión silenciosa) — *2–3 semanas*

> **Estrategia de tests (decidida 2026-06-22): las pruebas de frontend se ejecutan _a través de
> Electron_, no con un DOM simulado.** El hueco no es de lógica (el backend ya tiene 288 tests pytest)
> sino de integración renderer+backend real — lo que hoy «solo lo ve el runtime visual». Distinción
> clave: **los 288 tests de Python siguen en pytest** (meterlos en Electron solo añadiría lentitud y
> flakiness); la capa E2E sobre Electron es **nueva** y asevera el flujo real. Dos primitivas ya
> existen y se reutilizan: `window.__maoE2E` (ADR-010, `analysis-core.js:52656` — `cargar/escala/`
> `detectar/flujoCompleto`, inyecta el fixture en el `<input type=file>` real) y el harness `MAO_PROBE`
> (`main.js:468` — lanza la app real, ejecuta JS vía `executeJavaScript`, vuelca JSON a stdout,
> auto-sale con `MAO_PROBE_QUIT=1`).

1. **B1. CI en GitHub Actions** (D3): pytest + `node -c` de los módulos + lint en cada push/PR. La capa
   E2E (B3) requiere **runner macOS** (somos arm64-only) o display headless — planificar el job aparte.
2. **B2. Runner E2E homegrown sobre `MAO_PROBE` (Ruta 1, cero deps nuevas).** `scripts/e2e.mjs` lanza
   `npm start` con `MAO_PROBE_FILE=tests/e2e/flujo.js MAO_PROBE_QUIT=1`; el probe ejecuta
   `window.__maoE2E.flujoCompleto('sintetico_escala_objeto_ph.png')`, recoge aserciones (estado de
   chips, nº de objetos, columnas del CSV, `window.rendererErrors.length === 0`) como JSON y fija el
   exit code. Convierte el **checklist de 8 ítems de ADR-010** en aserciones reales y cierra las
   verificaciones manuales acumuladas (ADR 003/004/005/007/008/009). Esfuerzo: ~1 día.
3. **B3. Graduar a Playwright `_electron` (Ruta 2)** al cablear CI: `_electron.launch({ args:['.'] })`
   + `page.evaluate(() => window.__maoE2E…)`, con reintentos, screenshots/trace al fallar, reporting y
   ejecución headless. Reemplaza al runner casero cuando su tooling (no antes) pague el coste de la dep.
4. **B4. Higiene de repo** (D6/D7/D8): borrar backups y `yolov8n.pt`, reubicar guías HTML, reconciliar
   `requirements.txt`, completar silenciado de logs.
5. **B5. Confirmar el gateado a dev de `window.__maoE2E`** (el hook no debe viajar activo en el DMG
   firmado) — verificación de superficie, no debe quedar expuesto en `app.isPackaged`.

### Fase C — Salud estructural del frontend (reduce el riesgo a largo plazo) — *continuo*
1. **C1. Desmontar `analysis-core.js`** (D4) por Strangler Fig: extraer 1 módulo ES6 por iteración,
   validando con la red E2E de Fase B (B2/B3) tras cada extracción. Meta: ningún archivo > ~5 000 LOC.
2. **C2. Reducir la superficie global** (221 `window.*`): agrupar estado en objetos namespaced
   (patrón `viewState` ya probado) y documentar el contrato real, no solo los 10 de Tier 1.
3. **C3. Partir `index.html`** (290 KB): extraer los `<script>`/`<style>` inline a archivos.

### Fase D — Producto y madurez de release — *según prioridad de negocio*
1. **D1. Auto-update** (electron-updater) y canal de versiones.
2. **D2. ADR-008 C2** (rewrite de `id` compuesto) si se necesita unificar IDs entre proyectos.
3. **D3. Multiplataforma** (Windows/Linux) — solo si la audiencia lo requiere.
4. **D4. Telemetría de errores** en producción (más allá de `renderer-errors.log` local).

### Orden recomendado y porqué
**A → B → C → D.** La auditoría muestra que el dominio ya está resuelto; el cuello de botella es de
**ingeniería de entrega**: sin Python embebido (A) no hay producto distribuible, y sin CI+E2E (B) cada
mejora del monolito (C) arriesga regresiones que hoy solo se ven «relanzando la app a mano». D es
incremental sobre una base ya industrializada.

---

## 7. Conclusión

MAO Plus está **más avanzado de lo que su empaquetado sugiere**: el motor morfométrico y el backend
son de calidad de producción, el shell Electron es resiliente y la disciplina de ADR es ejemplar. La
brecha entre «funciona en la máquina del autor» y «aplicación de escritorio distribuible» se explica
por tres ausencias concretas y acotadas — **Python embebido, tests/CI de frontend, y limpieza de
distribución** — todas atacables en ~4–6 semanas (Fases A+B) sin tocar la lógica de dominio. El
refactor del monolito (Fase C) es importante pero **no urgente** y debe hacerse *después* de tener la
red de seguridad, nunca antes.
