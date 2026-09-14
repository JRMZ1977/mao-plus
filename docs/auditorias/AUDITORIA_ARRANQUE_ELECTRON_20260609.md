# Auditoría de Arranque — MAO Plus (Electron)

**Fecha:** 2026-06-09 · **Rama:** `feat/laar-runtime-fix-estetica` · **Foco:** verificar que la aplicación Electron se lanza correctamente
**Método:** índice código/documentación → articulación de módulos → chequeo estático → **lanzamiento real** (mato+relanzo, no Cmd+R) con captura de logs.

---

## Veredicto

✅ **La aplicación se lanza correctamente.** Arranque limpio en **4070 ms**, backend Python sano (13/13 módulos), renderer sin errores, pestañas LAAR activas, esquema `app://` funcionando (sin `ERR_FAILED` de cold-start).

⚠️ **Un bug latente confirmado** (no bloquea el arranque, pero rompe una feature documentada): la captura de errores del renderer vía IPC está **muerta** por un `});` faltante en `main.js`.

---

## a) Índice: código vs. documentación

| Tipo | Forma de articulación | Archivos clave |
|------|----------------------|----------------|
| **Código de arranque (JS/Electron)** | Proceso principal y puente seguro | `main.js`, `preload.js` |
| **Código frontend (JS renderer)** | ~30 `<script>` cargados desde `index.html` vía `app://mao/` | `js/*.js` (orquestación) + `js/modules/*.js` (11 módulos ES6) |
| **Marcado/estilos** | Documento raíz + 2 hojas con cache-busting `?v=` | `index.html`, `css/main.css`, `css/mao-tabs-laar.css` |
| **Código backend (Python)** | FastAPI/uvicorn en `127.0.0.1:8765` | `python/server.py` + `python/modules/*.py` (13 módulos) |
| **Configuración** | Manifiesto Electron + deps | `package.json`, `requirements.txt`, `.venv/` |
| **Documentación (NO código)** | Markdown/HTML/TXT de referencia y reportes | `CLAUDE.md`, `ARCHITECTURE.md`, `MODULES.md`, `*.html` (guías), `*_REPORT.md`, `AUDIT_*.txt`, etc. |
| **Respaldos (NO código, ruido)** | Copias `.backup`/`.bak` versionadas a mano | `main.js.backup`, `preload.js.backup`, `index.html.backup*` (×3), `css/main.css.bak*` (×3) |

## b) Articulación de la ruta de arranque

```
package.json (main: main.js)
   └─ main.js  (proceso principal)
        ├─ registra esquema app:// (privilegiado, antes de 'ready')
        ├─ app.whenReady():
        │    1. protocol.handle('app', …)  → sirve archivos locales bajo APP_DIR
        │    2. startPythonServer()         → spawn .venv/bin/python -m uvicorn python.server:app
        │    3. waitForServer(50×300ms)     → sondea /api/health hasta 200 OK
        │    4. createWindow()              → loadURL('app://mao/index.html') + preload.js
        │    5. startWatchdog()             → health cada 15s, auto-restart (máx 3)
        └─ preload.js (contextBridge):  electronAPI{fs/diálogos/estado backend} + rendererErrors
              └─ index.html → ~30 <script> (app://mao/js/…) + analysis-core.js (type=module)
                    └─ mao-tab-router.js (defer, corre último) → pestañas LAAR
```

---

## c) Diagnóstico de arranque (evidencia de ejecución real)

### ✅ Backend Python
```
GET /api/health → 200
{"status":"ok","version":"2.0.0",
 "modules":[detection,contour,metrics,morphology,analysis,comparator,scale,
            ph,persistence,mao_ia_analyzer,obj3d,efa,classifier],   ← 13/13
 "modules_failed":{}}                                               ← 0 fallidos
```
- `.venv/bin/python` = Python 3.9.6; `import python.server` OK.
- Health respondió a los **2400 ms** del spawn (dentro del presupuesto de 15 s).

### ✅ Proceso principal y renderer
- Secuencia de boot completa sin warnings: spawn → health OK → ventana creada.
- `[METRICS] t_total_boot: 4070 ms` (coherente con baseline ~2.8–4 s).
- Preload: `contextBridge activo` + `error reporter activo`.
- **Todos los scripts cargaron vía `app://mao/js/…`** — sin `net::ERR_FAILED` (el bug de concurrencia de `file://` que rompía las pestañas en frío está resuelto, commit `d714b68`).
- `[MAO Tab Router] Inicializado. Pestaña activa: proyecto`; `[DIAG] tabbar=present, sidebar.display=none` → **modo LAAR activo y visible**.
- `python-bridge`: conectado a v2.0.0, 13 módulos.
- **0 errores reales** en el log (56 líneas, todo informativo): sin `ReferenceError`/`TypeError`/`Uncaught`/`Refused to`.

### ✅ Chequeo estático
- `node -c` pasa en `main.js`, `preload.js` y los ~22 archivos de `js/` + `js/modules/`.
- CSP coherente con `app://`: `default-src 'self'` + `connect-src` al backend `127.0.0.1:8765`.

---

## ⚠️ Hallazgo: handlers de captura de errores del renderer = código muerto

**Archivo:** [main.js:1096-1130](main.js:1096) — **Severidad: media** (no afecta el arranque; rompe una feature documentada).

El handler `fs-trash-item` **no se cierra** con `});` tras su `catch`. El `});` de cierre está hasta la línea 1130, así que todo el bloque de captura de errores del renderer (líneas 1105-1128) queda **dentro del callback de `fs-trash-item`, después de un `return`** → inalcanzable y **nunca registrado**.

`node -c` y el health check **no lo detectan** (es sintácticamente válido y no afecta al backend). Confirmado cargando `main.js` con un stub de Electron que cuenta los handlers registrados *en carga*:

```
ipcMain.handle registrados: 18  (incluye fs-trash-item ✓)
ipcMain.on registrados:     [report-boot-metrics]
¿renderer-error-occurred?   NO ❌   ← preload.js:125 envía aquí; nadie escucha
¿get-renderer-errors?       NO ❌
¿clear-renderer-errors?     NO ❌
```

**Impacto:**
- La feature "IPC-based renderer error capture" de `mao-console-analyzer v2` (documentada en `CLAUDE.md`) está **inoperativa**: los errores del renderer **no** se escriben a `.mao_renderer_errors.log` (el archivo no llega a crearse).
- `get-renderer-errors` / `clear-renderer-errors` por IPC fallarían (no hay handler).
- *Mitigación parcial existente:* `preload.js` mantiene su propio buffer en memoria y expone `window.rendererErrors` (eso sí funciona, independiente del IPC).

**Corrección (1 línea):** cerrar el handler `fs-trash-item` con `});` tras su `}` del `catch` (antes del comentario de la línea 1105), y quitar el `});` sobrante de la línea 1130. Así los 3 handlers vuelven al scope de módulo y se registran al cargar.

---

## Housekeeping (no afecta funcionamiento)
- 7 archivos de respaldo manuales en el repo (`*.backup`, `*.bak*`). Recomendado eliminarlos y confiar en git (ya están en historial).

## Resumen ejecutivo
| Aspecto | Estado |
|---------|--------|
| Lanzamiento Electron | ✅ Correcto (4070 ms) |
| Backend Python (13 módulos) | ✅ Sano, 0 fallidos |
| Esquema `app://` / cold-start | ✅ Sin `ERR_FAILED` |
| Pestañas LAAR | ✅ Visibles y activas |
| Errores de runtime en boot | ✅ Ninguno |
| Captura de errores del renderer (IPC) | ⚠️ Código muerto — corregir `main.js:1096-1130` |
| Respaldos manuales en repo | 🧹 Limpieza recomendada |
