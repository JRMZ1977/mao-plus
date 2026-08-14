# Auditoría de Código y Coherencia entre Módulos — MAO Plus

**Fecha:** 2026-07-31
**Alcance:** Aplicación completa (frontend Electron + backend Python FastAPI), excluyendo `node_modules/`, `.venv/`, `.git/`.
**Método:** Índice código/documentación → identificación de tipos y articulación → auditoría estática de coherencia inter-módulo.

---

## 1. Índice: código vs. documentación

### 1.1 Archivos que SON código (ejecutable / articulación real)

| Capa | Tipo | Nº | Ubicación | Rol |
|---|---|---|---|---|
| Frontend lógica | `.js` | 36 | `js/` | Renderer Electron (UI, análisis, exportación) |
| Frontend módulos ESM | `.js` | 13 | `js/modules/` | Cálculo morfométrico, visualización, clasificación |
| Proceso principal | `.js` | 2 | `main.js`, `preload.js` | Electron main + puente IPC |
| Backend API | `.py` | 1 | `python/server.py` | Servidor FastAPI (34 endpoints) |
| Backend módulos | `.py` | 20 | `python/modules/` | Detección, contorno, métricas, 3D, EFA, PH |
| Vista | `.html` | 1 | `index.html` | DOM único; orquesta el orden de carga de scripts |
| Estilos | `.css` | 9 | `css/` | Presentación |
| Config | `.json` | — | `package.json`, `requirements*.txt` | Dependencias y build |
| Tests | `.py`/`.js` | 20 + 1 | `tests/` | 21 suites (20 pytest + 1 contrato JS) |

### 1.2 Archivos que NO son código (documentación / ruido)

- **20 `.md`** + **13 `.txt`** de auditorías, reportes de sesión y validaciones en la raíz.
- **5 `.html` de guías** (`FORMULAS_METRICAS_MAO.html`, `GLOSARIO_TERMINOS_MAO.html`, etc.) — material de referencia, no parte de la app.
- **`.mao_server.log`**, `output.log` — logs de ejecución.

> **Observación de índice:** la raíz mezcla 33 documentos de texto con el código. No es un fallo funcional, pero dificulta distinguir la superficie real de la app. Recomendado mover a `docs/`.

---

## 2. Tipos de archivo y forma de articulación

### 2.1 Frontend — el punto crítico de coherencia

`index.html` carga **todos los scripts salvo uno como scripts clásicos** (globales sobre `window`), y **únicamente `analysis-core.js` como `type="module"` (ESM)**:

```
Scripts clásicos (globales): toast, python-bridge, collection, export-manager,
  comparator, procrustes, sidebar-nav, obj3d-*, project-manager, … (35 archivos)
ESM (scope aislado):         js/analysis-core.js  →  importa js/modules/*.js
```

**Consecuencia estructural:** existen **dos mundos de scope**:
- Los scripts clásicos y los módulos ESM (`js/modules/`) sólo pueden comunicarse a través de **`window.*`**.
- `analysis-core.js` mantiene además **variables locales del módulo** que *espeja manualmente* a `window`.

Esta frontera es la **fuente raíz** de la clase de bugs más grave del proyecto (ver §3.1). La superficie de acoplamiento es alta: **141 asignaciones `window.X =`** con **109 nombres globales distintos** sólo en `analysis-core.js`.

### 2.2 Backend — articulación limpia

`server.py` (FastAPI) → importa `python/modules/*` → 34 endpoints REST bajo `/api`. El frontend llama vía `fetch` a `http://127.0.0.1:8765/api/...`. Articulación clara y desacoplada, respaldada por tests.

---

## 3. Diagnóstico de coherencia — hallazgos

### 🔴 3.1 CRÍTICO — Desincronización variable local ↔ `window.*` (bug de exportación, ya corregido)

**Mecanismo:** el flujo de análisis renderiza vía `VisualizationExport.mostrarAnalisisMorfologico()` ([visualization-export.js:2051](js/modules/visualization-export.js#L2051)), que asigna **sólo** `window.currentAnalyzedObject`. Las funciones de exportación en `analysis-core.js` leían la **variable local del módulo** `currentAnalyzedObject` (línea 138), que el flujo nunca actualiza → quedaba `null` → todas las exportaciones abortaban con *"No hay análisis para exportar"* pese a mostrarse resultados en pantalla.

**Estado:** ✅ **RESUELTO DE RAÍZ** en esta sesión. Se eliminó la declaración `let currentAnalyzedObject` del IIFE de `analysis-core.js` ([línea 138](js/analysis-core.js#L138)). Al no existir binding local, las 131 referencias del archivo resuelven a la propiedad global `window.currentAnalyzedObject` — el **mismo almacenamiento** que ya usan `visualization-export.js` (escrituras bare) y `collection.js`. Ya no hay dos copias que sincronizar: **fuente única de verdad**. Verificado con prueba de runtime que reproduce el escenario analizar→exportar (CSV/PDF/SVG convergen en el mismo objeto) y con el test de contrato (33/33).

**Riesgo residual — ✅ RESUELTO.** Las otras variables con el mismo patrón recibieron el mismo tratamiento tras verificar caso por caso. El análisis detallado reveló **un bug latente adicional no reportado** y **un falso positivo**:

| Variable | Veredicto | Detalle |
|---|---|---|
| `canvas`, `ctx` | 🔴 **Bug latente real — corregido** | Existían **dos rutas paralelas** del cambio a modo bifacial: una escribía bare ([42594](js/analysis-core.js#L42594)) y otra sólo `window.canvas = …` ([42709](js/analysis-core.js#L42709), comentada *"Reasignar variables globales"*). Con la ruta `window.`, las ~545/771 referencias bare —incluido `redraw()`, que usa `ctx` 163 veces— **seguían dibujando en el canvas anterior**. Colapsadas → ambas rutas comparten almacenamiento. |
| `perforationZoomLevel` | 🔴 **Drift real — corregido** | `utility-helpers.js:180` (ESM) escribe `window.perforationZoomLevel` al hacer zoom, pero analysis-core leía/escribía la local en 3 sitios con un solo espejo → el zoom aplicado desde el módulo **nunca llegaba** al archivo principal. |
| `perforationCanvas`, `perforationCanvasOffsetX/Y` | 🟠 **Frágil — corregido** | `utility-helpers.js` los lee **bare** (0 declaraciones locales) para las conversiones de coordenadas; dependían de que el setup recordara espejarlos. |
| `canvasBackup` | ⚪ **Falso positivo — sin cambios** | La `let canvasBackup` de [20025](js/analysis-core.js#L20025) es una **temporal dentro de una función**, sin relación con el global `window.canvasBackup` (usado en 819/42578/42620). Son dos entidades distintas con ciclos de vida distintos; unificarlas habría sido un error. Detectada por la intersección automática, descartada por inspección. |

**Verificaciones de seguridad previas al cambio:** (a) sin colisión de globales — ningún otro script clásico declara `canvas`/`ctx`/`perforation*` a nivel superior; (b) las 14/22 declaraciones anidadas de `canvas`/`ctx` son todas `const` temporales (`createElement`, `getContext`, parámetros de `forEach`) cuyo shadowing se comporta **idéntico** con binding local o global; (c) la guarda `typeof canvas !== 'undefined'` ([11847](js/analysis-core.js#L11847)) mantiene semántica (`'object'` en ambos casos); (d) `perforationCanvasCtx` se dejó local por no tener consumidor externo.

### 🟠 3.2 IMPORTANTE — El test de contrato da falsa confianza

`tests/test_window_contracts.js` verifica que exista la asignación `window.currentAnalyzedObject =` en el código… y **pasa (33/33)**. Pero sólo comprueba *presencia sintáctica de la asignación*, no que el valor se mantenga *sincronizado* con la variable local que consumen las funciones. Es decir: el contrato estaba "verde" mientras la exportación estaba rota. El test protege contra borrados accidentales, no contra el drift semántico que causa los fallos reales.

### 🟠 3.3 IMPORTANTE — `analysis-core.js` es un god-file de 51.796 líneas

- Concentra ~59% de todo el JS de la app.
- ~11% son líneas de comentario `//`, con **83 marcas** de `eliminado/deshabilitado/obsoleto/inerte` → volumen alto de código muerto/comentado conviviendo con el activo.
- Al ser el único ESM, cualquier error de evaluación en su carga (o en un `import` de `js/modules/`) deja **sin registrar los listeners de exportación y de análisis** (se registran dentro de su `DOMContentLoaded`). Es un único punto de fallo para media aplicación.

### 🟢 3.4 MENOR — Referencia de endpoint obsoleta en documentación

`obj3d-export.js:47` documenta en JSDoc *"objeto devuelto por la API `/api/analyze3d`"*, endpoint que **no existe** en el backend (las rutas 3D son `/api/obj3d/*`). Es sólo un comentario (no una llamada `fetch`), pero induce a error. Corregir el texto.

### 🟢 3.5 MENOR — Deuda técnica baja pero presente

5 `TODO` + 1 `BUG` en el código de app. Volumen sano; conviene triarlos.

---

### 🔴 3.1-bis — Hallazgos de la verificación E2E en Electron

Verificación real en la app (Electron + CDP, fixture `sintetico_escala_objeto_ph.png`, flujo cargar → escala → detectar → analizar → exportar). Resultados:

| Resultado | Detalle |
|---|---|
| ✅ **CSV exporta** | 8.469 bytes reales de CSV tras un análisis de **243 métricas**. El fallo reportado originalmente queda **verificado como resuelto en la app**, no sólo en tests. |
| ✅ **Render intacto** | Canvas, ejes, convex hull, centroides y clasificación (93.9 %, consenso 3/3) se dibujan bien → la unificación de `canvas`/`ctx` no afectó a `redraw()`. |
| 🔴 **Regresión introducida y corregida durante la sesión** | El primer intento de colapsar `canvas` al global provocó **recursión infinita** (`RangeError: Maximum call stack size exceeded`): `bridgeIIFEStateToModules()` publica `window.canvas` como **getter vivo** `() => canvas` respaldado por la local; sin binding local, el getter se auto-invoca. Ningún check estático lo detectó (`node --check`, contrato y 237 tests pasaban). Corregido restaurando el binding local. |
| 🔴 **Bug preexistente confirmado (canvas bifacial)** | `window.canvas` es accessor **sin setter**; en modo estricto (analysis-core es ESM) `window.canvas = …` lanza `TypeError: Cannot set property canvas of #<Window> which has only a getter` — comprobado empíricamente en la app. Las dos rutas de `iniciarDeteccionManualBifacial` (Cara A y B) abortaban ahí. Corregidas a asignación bare. |
| ✅ **Bug preexistente `.replace` sobre valores numéricos — CORREGIDO** | Las exportaciones **SVG, PNG y PDF** fallaban al construir el nombre de archivo: `obj.id` es un **número** (`1`) en detección automática (`id: index + 1`) pero **cadena** en manual (`manual_1`). `js/collection.js:2905` propagaba el número a `nombreObjeto` → `.replace` reventaba en `collection.js:1539`; el PDF fallaba igual en `analysis-core.js:32134` (el optional chaining `obj.id?.replace` protege de `null`, **no de un número**). **No se normalizó `obj.id` en origen** porque hay ~33 comparaciones estrictas (`o.id === n`) que romperían al cambiarle el tipo; se coacciona al construir el nombre, vía el helper `_idParaArchivo()` (8 sitios en analysis-core) y `String()` en los 3 de collection.js. |

**Verificación final con `obj.id` forzado a numérico (el caso que fallaba), archivos reales en disco:**

| Formato | Resultado |
|---|---|
| CSV | ✅ 7.990 bytes |
| SVG | ✅ `1_geometria.svg` — 3.586 B, XML válido (37 elementos), `<title>Análisis Morfológico - 1</title>` |
| PNG | ✅ `1_morfologia.png` — 201×141 px, 5.486 B |
| PDF | ✅ `1_integral.pdf` — 40.147 B, ~12 páginas, PDF 1.3 |

**Lección de método:** el contrato `window.*`, `node --check` y las 237 pruebas de Python dieron verde con la app rota por recursión infinita. La verificación estática no sustituye a ejecutar la aplicación.

## 4. Estado de salud por subsistema

| Subsistema | Estado | Evidencia |
|---|---|---|
| **Backend Python** | 🟢 Sólido | 237 tests passed / 2 skipped; endpoints coherentes con el frontend |
| **Sintaxis JS** | 🟢 OK | 49/49 archivos pasan `node --check` |
| **Ruteo FE↔BE** | 🟢 Coherente | Todas las rutas `fetch` mapean a un endpoint real (salvo el comentario 3.4) |
| **Exportación (4 formatos)** | 🟢 Verificado E2E | CSV, SVG, PNG y PDF generan archivos válidos en disco, incluido el caso `obj.id` numérico que fallaba (§3.1-bis) |
| **Acoplamiento frontend** | 🟡 Saneado en el estado compartido | Las 6 variables con drift real (`currentAnalyzedObject`, `canvas`, `ctx`, `perforation*`) tienen ahora **fuente única**; queda la superficie amplia de 109 globales `window.*` como deuda de diseño |
| **Mantenibilidad** | 🟠 Comprometida | God-file de 52k líneas con código muerto |

---

## 5. Recomendaciones priorizadas

1. ~~**(Preventivo, alto valor)** Eliminar la clase de bug del §3.1 de raíz.~~ ✅ **COMPLETADO** — las 6 variables con drift real quedaron con fuente única de verdad; `canvasBackup` se descartó por falso positivo.
2. **(Test — ahora la prioridad nº1)** Reforzar `test_window_contracts.js`: hoy sólo verifica que exista `window.X =` y por eso daba verde con la exportación rota. Añadir (a) una guarda que **falle si reaparece una declaración local** (`let|var`) de las 6 variables de estado compartido —protege la corrección aplicada contra regresiones—, y (b) un test funcional del flujo "analizar → exportar".
3. **(Estructura)** Plan de troceado incremental de `analysis-core.js`: extraer el bloque de exportación (~funciones `exportar*`) a un módulo propio `js/modules/export-core.js`, reduciendo el single-point-of-failure.
4. **(Higiene)** Mover los 33 documentos `.md`/`.txt` de la raíz a `docs/`; purgar el código muerto marcado como *inerte/eliminado*.
5. **(Menor)** Corregir el JSDoc de `obj3d-export.js:47` y triar los 5 TODO + 1 BUG.

---

## 6. Conclusión

La aplicación está **funcionalmente operativa y con un backend robusto** (237 tests verdes, ruteo coherente). El fallo reportado de exportación no era un problema de la lógica de exportación en sí, sino un síntoma del **problema estructural central**: la frontera entre el módulo ESM `analysis-core.js` y el resto de scripts clásicos, comunicada por una amplia superficie de globales `window.*` que se sincronizan a mano. Mientras esa frontera exista sin una fuente única de estado, seguirán apareciendo bugs de la misma familia (valores obsoletos que fallan en silencio). Las prioridades 1 y 2 atacan la causa; 3 y 4 reducen la probabilidad de reincidencia.
