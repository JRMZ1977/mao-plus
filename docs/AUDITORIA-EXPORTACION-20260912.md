# Auditoría de los módulos de exportación — MAO Plus

> Fecha: 2026-09-12 · Rama: `claude/audit-export-modules-b320d2`
> Pregunta que motiva la auditoría: **¿es posible exportar de una sola acción todos los
> formatos descargables de un análisis, y depositarlos en una carpeta hermana de la del
> análisis dedicada exclusivamente a resultados?**
>
> **Veredicto corto: sí a ambas.** No requiere IPC nuevo, ni dependencias nuevas, ni tocar
> lógica de cálculo. El trabajo real son ~4 puntos de parametrización, 1 orquestador nuevo
> y 3 riesgos de secuencia que hay que respetar (§5).

---

## 1. Mapa del terreno: dos sistemas distintos que hoy no se hablan

MAO Plus tiene **dos caminos de escritura a disco** que la UI presenta como si fueran lo
mismo, pero que no comparten ni código ni destino ni esquema.

### 1.A — Persistencia automática (carpeta del análisis)

La dispara el botón **«Guardar y Finalizar»** (`closeAnalysisBtn`, `analysis-core.js:14646`)
→ `guardarAnalisisMorfologico(obj, true)` → `projectManager.addAnalysis()`
→ `saveAnalysisFiles()` (`project-manager.js:381`).

Escribe, sin diálogo y sin preguntar, en `<proyecto>/<ID_arqueológico>/`:

| Archivo | Generador |
|---|---|
| `metadata.json` | `saveAnalysisFiles` |
| `metricas.json` | `saveAnalysisFiles` |
| `metricas.csv` | `analysisToCSV()` (`project-manager.js:995`) |
| `geometria.json` | `saveAnalysisFiles` |
| `trazados.json` | `saveAnalysisFiles` |
| `imagenes/objeto_recortado.png` | `saveAnalysisImages` (`:755`) |
| `imagenes/analisis_morfologico.png` | captura de `#morphologicalCanvas` ×3 |
| `imagenes/forma_idealizada.png` | captura de `#idealizedShapeCanvas` ×3 |
| `imagenes/esquema_morfometrico.png` | captura de `#schematicCanvas` ×3 |
| `imagenes/original.png` | re-render de la imagen fuente |
| `imagenes/metadata.json`, `imagenes/imagenes.json` | índice + base64 |

Y a nivel de proyecto: `resumen.csv` (`updateProjectSummaryCSV`, `:938`),
`collection_index.json`, `<proyecto>.mao`.

El nombre de carpeta es **determinista**: `obj.id.replace(/[^a-zA-Z0-9_-]/g,'_')`
(`project-manager.js:409-412`). Esto es clave para §4.

### 1.B — Exportación manual (descargas)

Son botones sueltos; cada uno abre **su propio diálogo nativo** y escribe **un** archivo
donde el usuario diga (por defecto `lastExportDir`, o `~/Downloads`).
Nada de esto toca la carpeta del análisis.

---

## 2. Inventario completo de formatos exportables de un análisis

Menú **Exportar…** de la barra lateral (`index.html:368+`, proxies cableados en
`sidebar-nav.js:157-162` hacia botones ocultos de `index.html:1953-1956`):

| # | Formato | Botón | Cadena de llamadas | Mecanismo de guardado |
|---|---|---|---|---|
| 1 | **CSV métricas** | `sidebarExportCSVBtn` | `exportarAnalisisCompletoUnificado()` (`analysis-core.js:31973`) → `exportarAnalisisMonofacialUnificado()` | `saveFileWithDialog(…,'csv')` |
| 2 | **PDF integral** | `sidebarExportPDFBtn` | `exportarPDFIntegralCaraActiva()` (`:32454`) → `generarPDFDesdeHTML(…,{integral:true})` (`:29112`) | `saveFileWithDialog(…,'pdf')` (`:30267`) |
| 3 | **SVG vectorial** | `sidebarExportSVGBtn` | `exportarSVGMorfologicoActual()` (`collection.js:2655`) → `exportGeometryToSVG()` (`:1173`) | `showSaveDialog` + `saveFile` inline (`collection.js:1536-1545`) |
| 4 | **PNG morfología** | `sidebarExportPNGBtn` | `exportarPNGMorfologicoActual()` (`collection.js:2805`) | `_guardarPNGNativo()` (`collection.js:1733`) |
| 5 | CSV comparación bifacial | `sidebarExportBifacialCSVBtn` (solo bifacial) | `exportarComparacionBifacialDesdeUI()` (`:31181`) | `saveFileWithDialog` |
| 6 | PDF reporte bifacial | `sidebarExportBifacialPDFBtn` | `generarReporteBifacialPDF()` (`:27671`) | `saveFileWithDialog` |
| 7 | CSV tabla completa (modal) | `exportarMetricasModalBtn` (`index.html:2848`) | `exportarTablaModalDesdeUI()` (`:31044`) | `saveFileWithDialog` |
| 8 | **TPS landmarks ×N** | botón «TPS» por fuente, panel EFA (`:23204`) | `_descargarLandmarksTPS()` (`:22994`) | `a.download` — **sin diálogo, va a Descargas** |
| 9 | **CSV coef. EFA ×N** | botón «CSV EFA» por fuente (`:23205`) | `_descargarCoeficientesEFA()` (`:23007`) | `a.download` — **sin diálogo** |
| 10 | SVG / PNG del visor | `index.html:3334`, `:3342` | `exportGeometryToSVG()` / `exportarCanvasToPNG()` | diálogo |

`N` en #8/#9 = 1 (contorno) + número de P/H confirmadas. Un análisis con 2 perforaciones
produce **6 archivos TPS/EFA**, cada uno con su clic.

**Total para un análisis monofacial completo: entre 6 y 6+2N archivos, y otros tantos
diálogos nativos.** En bifacial, ×2 más los 2 comparativos.

Aparte, el modo 3D tiene su propio menú (`obj3d-viewer.js:4193`) sobre `window.Obj3dExport`
(CSV / PNG canvas / PNG panel / SVG / PDF), todo por `a.download` sin diálogo.

### 2.A — Cuatro mecanismos de guardado para diez formatos

Este es el hallazgo estructural. No hay una capa de escritura; hay cuatro:

1. `saveFileWithDialog(filename, content, format)` — `analysis-core.js:30854`, expuesta en
   `window` (`:30929`). Convierte Blob/ArrayBuffer a data URL y delega en
   `electronAPI.showSaveDialog` + `electronAPI.saveFile`. Con fallback a `a.download`.
2. Bloque inline en `exportGeometryToSVG` (`collection.js:1536-1545`) — hace lo mismo a mano.
3. `_guardarPNGNativo(dataURL, filename)` — `collection.js:1733` — hace lo mismo a mano.
4. `a.download` pelado — TPS, EFA, y todo `Obj3dExport` (`obj3d-export.js:27`).

Los tres primeros son el mismo algoritmo escrito tres veces. El cuarto ni siquiera pregunta.

---

## 3. Código muerto encontrado — ✅ **ELIMINADO** (Fase 0, 2026-09-12)

Buena noticia para el esfuerzo estimado: parte de lo que parece «módulo de exportación»
no está conectado a nada.

| Artefacto | Tamaño | Estado |
|---|---|---|
| `js/export-manager.js` completo (`window.ExportManager`) | 429 líneas | **Muerto.** Sus únicos consumidores son las dos funciones muertas de abajo. Cargado en `index.html:2815`. |
| `exportarTodosMorfologicoActual()` (`collection.js:2942`) | ~35 líneas | **Muerto.** Irónicamente, *ya es* un «exportar todo» (`ExportManager.exportAll(obj,['svg','png','jpeg'])`) — pero ningún botón lo llama, y usa una geometría propia más pobre que la canónica. |
| `exportarJPEGMorfologicoActual()` (`collection.js:2914`) | ~25 líneas | **Muerto.** |
| `VisualizationExport.exportarAnalisisMorfologico()` (`visualization-export.js:2900`) | 349 líneas | **Muerto.** Exporta un `.txt` + un `.csv` con bloque óptico. Ningún caller. |
| `generarReporteMorfologico()` (`analysis-core.js:23649`) | ~1.856 líneas | **Muerto.** Generaba el reporte HTML/PDF morfológico. Ningún caller. |
| `generarReportePDFIntegral()` (`analysis-core.js:25519-26424`) | 906 líneas | Ya comentado en bloque; documentado en ADR-011. |
| `descargarImagenConEtiquetas()` (`analysis-core.js:19611`) | ~120 líneas | **Muerto.** PNG de la detección con etiquetas. |

Son **≈3.700 líneas de exportación inalcanzable**. Ninguna hace falta conservar para lo que
se pide; al contrario, `export-manager.js` es una implementación paralela y peor de los
formatos 3 y 4 y conviene borrarla antes de construir encima, para no dejar dos caminos.

---

### 3.1 — Ejecución de la Fase 0

**−4.263 líneas, +99 de lápidas.** Cada borrado se verificó con cero llamadores reales antes de
aplicarlo (ignorando comentarios, la propia definición y funciones homónimas de otros archivos), y
con `node --check` después.

| Artefacto | Líneas |
|---|---|
| `generarReporteMorfologico()` | −2.868 |
| `js/export-manager.js` completo (`window.ExportManager`) + su `<script>` | −429 |
| `VisualizationExport.exportarAnalisisMorfologico()` | −343 |
| `generarTablaComparativaBifacialCSV()` | −166 |
| `descargarImagenConEtiquetas()` | −135 |
| `exportarComparacionBifacial()` | −109 |
| `exportarObjetoBifacialCompletoUnificado()` | −51 |
| `exportarTodosMorfologicoActual()` | −30 |
| `exportarJSON()` (analysis-core) | −27 |
| `exportarJPEGMorfologicoActual()` | −24 |

Dos artefactos **no previstos** cayeron dentro del rango de `generarReporteMorfologico` y se
comprobó que también eran muertos: el bloque ya comentado de `generarReportePDFIntegral()` (que
la propia ADR-011 daba por retirado) y `crearImagenRecortadaDesdeImagen()`, que en `HEAD` sólo
tenía su definición y ningún llamador.

`exportarJSON()` de `analysis-core.js` se eliminó; la **homónima de `js/procrustes.js`** es otra
función en otro ámbito y queda intacta.

Verificación posterior: cero referencias colgantes a ninguna de las 10 funciones eliminadas ·
`node --check` limpio en 52 archivos · 87 comprobaciones JS · arranque en Electron con 0 errores
de renderer, Tier 1 API 5/5 y la exportación en lote produciendo sus 7 archivos igual que antes.

## 4. Precedente que ya existe en el repo

La pregunta «¿se puede, con una acción, escribir muchos archivos en una carpeta elegida?»
ya tiene una respuesta afirmativa **implementada y funcionando** en el modo 3D:

`saveObj3dJsonIndependent()` — `obj3d-viewer.js:2814`

Hace exactamente el patrón pedido:
`selectFolder()` → `ensureFolder(<base>/<slug>_analisis3d_<stamp>)` → 8 `saveFile()` de JSON/CSV
→ `ensureFolder(.../imagenes)` → 3 `saveFile()` más → actualiza `collection_index.json`.
Un clic, doce archivos, cero diálogos intermedios.

**Conclusión: la capacidad ya está probada en producción.** Lo que falta es aplicarla al
flujo 2D.

---

## 5. Viabilidad de la acción única — **SÍ**, con tres condiciones

### Lo que juega a favor

- Las cuatro exportaciones canónicas ya son `async` y ya producen el contenido **en memoria**
  (string CSV, Blob PDF, string SVG, dataURL PNG) antes de guardarlo. **Solo difieren en el
  último paso.** Redirigir el destino no toca la generación.
- `electronAPI.saveFile(path, content)` ya acepta texto **y** data URLs base64
  (`main.js:827-843` detecta el prefijo `data:` y escribe bytes). No hace falta IPC nuevo.
- `electronAPI.ensureFolder(path)` ya existe (`main.js:884`). Tampoco.
- La capa `PythonBridge.persistence` (`python/modules/persistence.py`) replica ambas para el
  modo navegador, así que el modo sin Electron queda cubierto por el mismo adaptador
  (`_getFsAdapter()`, `project-manager.js:12`).
- Solo hay **4 sitios** donde parametrizar el destino: `saveFileWithDialog`,
  las 2 líneas de `generarPDFDesdeHTML` (`:30267`, `:30445`), el bloque de
  `exportGeometryToSVG`, y `_guardarPNGNativo`.

### Condición 1 — el orden importa (riesgo real de corrupción visual)

Las exportaciones 2, 3 y 4 **leen el DOM vivo**:

- `exportarPNGMorfologicoActual` copia `#morphologicalCanvas` tal cual está en pantalla.
- `exportarPDFIntegralCaraActiva` **re-renderiza** el canvas para el objeto destino
  (`VisualizationExport.mostrarAnalisisMorfologico`), espera `setTimeout(500)`, captura, y
  después **restaura el canvas anterior de forma asíncrona** vía `img.onload`
  (`analysis-core.js:32684-32692`).

Si el orquestador lanza PNG inmediatamente después del PDF, puede capturar un canvas a medio
restaurar. **Orden obligatorio: PNG y SVG (lectores) primero, PDF al final** — o bien
`await` explícito de la restauración.

### Condición 2 — el análisis aún no existe en disco cuando se exporta

`closeAnalysisBtn` («Guardar y Finalizar») es lo que crea `<proyecto>/<ID>/`, y justo después
pone `currentAnalyzedObject = null` (`analysis-core.js:14685-14686`). Los botones de
exportación dependen de `currentAnalyzedObject`, así que **solo funcionan antes de guardar**:
al momento de exportar, la carpeta del análisis todavía no existe.

Esto **no bloquea** la propuesta, porque la ruta es determinista
(`${project.folderPath}/${obj.id.replace(/[^a-zA-Z0-9_-]/g,'_')}`), así que la carpeta de
resultados se puede calcular y crear sin depender de que exista la hermana. Pero define
el diseño: el orquestador **no puede** buscar la carpeta del análisis; tiene que derivarla.

(La alternativa más limpia a medio plazo es invertirlo: que «Guardar y Finalizar» guarde
**y luego** dispare la exportación completa, con la carpeta ya creada.)

### Condición 3 — coste temporal y reentrada

El PDF integral tarda 10-15 s por diseño (html2canvas + `setTimeout(500)`). Un «exportar
todo» realista tarda **20-40 s**. Necesita barra de progreso, botón deshabilitado mientras
corre, y protección contra doble clic. Si el análisis tiene P/H confirmadas, sumar N×2
archivos TPS/EFA (esos sí son instantáneos).

---

## 6. Viabilidad de la carpeta hermana de resultados — **SÍ**

### Dos disposiciones posibles

**Opción A — hermana por análisis**
```
<proyecto>/
├── QP1_U1_N1_E1_01_ca/              ← datos (ya existe)
└── QP1_U1_N1_E1_01_ca_resultados/   ← exportables (nuevo)
```

**Opción B — raíz de resultados con subcarpeta por análisis** ← *recomendada*
```
<proyecto>/
├── QP1_U1_N1_E1_01_ca/
├── aps/                              ← ya existe (aps-save.js:149)
└── resultados/
    └── QP1_U1_N1_E1_01_ca/
        ├── QP1_..._analisis.csv
        ├── QP1_..._integral.pdf
        ├── QP1_..._geometria.svg
        ├── QP1_..._morfologia.png
        └── landmarks/  (TPS + CSV EFA por fuente)
```

### Por qué B

Hay un detalle del código que decide la cuestión. Dos sitios enumeran las carpetas de la
raíz del proyecto y tratan **toda carpeta no oculta** como candidata a análisis, filtrando
solo contra un conjunto fijo:

```js
const CARPETAS_SISTEMA = new Set(['imagenes', 'img', 'images', 'thumbnails']);
```
— `project-manager.js:1793` (`rebuildCollectionIndex`) y `projects-ui.js:355` (`_SYS`).

- `projects-ui.js:354-358` usa ese conteo como **número de análisis mostrado en la tarjeta
  del proyecto** cuando `collection_index.json` no se puede leer. Con la Opción A, ese número
  **se duplica**.
- `rebuildCollectionIndex` sí descarta con elegancia las carpetas sin `metadata.json`
  (`:1815-1823`), así que ahí no hay corrupción, solo ruido en el log.
- `fs-scan-for-analysis` (`main.js:941`) exige `metadata.json` + `metricas.json` +
  `geometria.json` + `imagenes/` simultáneamente, así que **no** confunde una carpeta de
  resultados. Ese está a salvo con cualquier opción.

La Opción B añade **una** carpeta candidata (igual que el `aps/` que ya existe); la A añade
**una por análisis**. En ambos casos conviene añadir `resultados` (y de paso `aps`, que hoy
sufre el mismo problema) al conjunto `CARPETAS_SISTEMA` — arreglo de una línea en dos sitios.

Y «`<proyecto>/resultados/`» sigue siendo literalmente **hermana de la carpeta del análisis**,
que es lo pedido.

### Restricción heredada a tener presente

`_assertSafePath` (`main.js:818-826`) rechaza cualquier ruta fuera de `os.homedir()`.
Un proyecto ubicado en un volumen externo (`/Volumes/...`) o en `/Users/Shared` **ya falla hoy**
al guardar el análisis; la carpeta de resultados heredaría la misma limitación. Es deuda
preexistente, pero la nueva función la va a exponer más. El equivalente Python
(`persistence.py:_ALLOWED_BASE_DIRS`) permite además el temporal del sistema.

---

## 7. Propuesta de implementación

Aditiva y reversible. No toca ningún cálculo morfométrico.

### Fase 0 — limpieza previa (opcional pero recomendada)
Eliminar `js/export-manager.js` + su `<script>`, y las funciones muertas del §3.
Evita construir encima de un segundo camino de exportación peor y ya existente.

### Fase 1 — capa de destino (el núcleo, ~80 líneas)
Un módulo nuevo `js/mao-export-destino.js` con:

```js
window.MaoExportDestino = {
  activo: null,                  // null = comportamiento actual (diálogo nativo)
  resolver(obj, project),        // → `${project.folderPath}/resultados/${slug(obj.id)}`
  async abrir(obj, project),     // ensureFolder + fija `activo`
  async escribir(nombre, contenido, formato),  // saveFile directo, sin diálogo
  cerrar()                       // activo = null
};
```

Y en los 4 puntos de guardado: `if (MaoExportDestino.activo) → escribir(); else → diálogo`.
Con `activo = null` el comportamiento actual queda **idéntico** (reversibilidad total).

### Fase 2 — orquestador y botón
`exportarTodoElAnalisis()` en `analysis-core.js`, cableado a un nuevo ítem
**«Todo — a carpeta de resultados»** en el menú Exportar de la barra lateral
(`index.html:368+`), con su proxy en `sidebar-nav.js:157`.

Secuencia obligatoria (§5.1):
1. `MaoExportDestino.abrir(obj, projectManager.activeProject)`
2. CSV métricas → 3. SVG → 4. PNG → 5. TPS + EFA (×N) → 6. **PDF integral (último)**
7. `manifiesto.json` con lo generado y sus rutas → 8. `cerrar()`
Con progreso visible y guardia de reentrada.

### Fase 3 — higiene del proyecto
- Añadir `resultados` y `aps` a `CARPETAS_SISTEMA` (`project-manager.js:1793`) y a `_SYS`
  (`projects-ui.js:355`).
- Registrar la carpeta de resultados en `collection_index.json` / `.mao` para que el visor
  pueda ofrecer «abrir resultados».

### Fase 4 (opcional) — invertir el orden del flujo
Que «Guardar y Finalizar» ejecute guardado **y** exportación completa, ya con la carpeta del
análisis creada. Resuelve la Condición 2 de raíz y convierte «exportar todo» en el
comportamiento por defecto en lugar de un botón más.

---

## 8. Incorporación de la comparación bifacial

La comparación bifacial **no encaja en el orquestador por cara**, y la razón no es de
implementación sino de modelo de datos: vive en otro nivel y en otro momento del flujo.

### 8.1 — Por qué no se puede simplemente «añadir al mismo botón»

| | Exportables **por cara** | Exportables de la **comparación** |
|---|---|---|
| Unidad de análisis | una cara (`..._ca` / `..._cb`) | el objeto (par A+B) |
| Estado fuente | `currentAnalyzedObject` | `window.ultimaComparacionBifacial` |
| Momento válido | **antes** de «Guardar y Finalizar» | **después** de guardar la **2ª** cara |
| Locus en la UI | menú Exportar de la barra lateral | menú Exportar dentro de la tabla de comparación (`index.html:1661-1662`) |
| Carpeta natural | `resultados/<ID>_ca/` | ninguna de las dos — es del par |

Cuando se exporta la cara A, **la comparación todavía no existe**: se calcula dentro de
`guardarAnalisisMorfologico()` sólo cuando ya existe la cara opuesta
(`analysis-core.js:34918-34948`). Y `window.ultimaComparacionBifacial` no se puebla hasta que
corre `generarComparacionBifacialSimple()` (`:38212`), es decir hasta que la tabla se **renderiza**.

### 8.2 — El punto de enganche ya existe

`_abrirComparacionBifacialSiCompleto(obj)` (`analysis-core.js:14546`), invocada en `:14657`
justo después de guardar. Cuando devuelve `true`, se cumplen **las tres precondiciones a la vez**:

1. ambas carpetas de análisis existen en disco (A se guardó antes, B acaba de guardarse);
2. `generarComparacionBifacialSimple()` ya corrió → `window.ultimaComparacionBifacial`
   **y** su sub-objeto `.imc` están poblados (el IMC se asigna en `:39640`, dentro de esa misma función);
3. `#bifacialComparisonsSection` está visible.

Ese `return true` es el disparador natural del segundo orquestador. No hay que inventar
ninguna señal nueva.

### 8.3 — Esquema de carpetas

El ID del par ya es derivable, y el código **ya lo deriva** en `analysis-core.js:32812`:
`caraA.id.replace(/_c[ab]$/, '')`.

```
<proyecto>/
├── QP1_U1_N1_E1_01_ca/                 ← datos cara A (existente)
├── QP1_U1_N1_E1_01_cb/                 ← datos cara B (existente)
└── resultados/
    ├── QP1_U1_N1_E1_01_ca/             ← exportables cara A
    ├── QP1_U1_N1_E1_01_cb/             ← exportables cara B
    └── QP1_U1_N1_E1_01__bifacial/      ← exportables del par
```

El sufijo `__bifacial` (doble guión bajo) ordena la carpeta del par junto a sus dos caras y
la hace inconfundible. Mantiene la estructura plana que ya usan las carpetas de análisis,
sin reestructurar nada.

### 8.4 — Qué va dentro: **cuatro** artefactos, no dos

| # | Artefacto | Función | Estado hoy |
|---|---|---|---|
| 1 | CSV comparación bifacial | `exportarComparacionBifacialDesdeUI()` (`:31181`) | vivo (`index.html:1661`) |
| 2 | PDF reporte bifacial | `generarReporteBifacialPDF()` (`:27671`) | vivo (`index.html:1662`) |
| 3 | CSV ambas caras en un archivo | `exportarObjetoBifacialCompletoDesdeDatos()` (`:31809`) | vivo pero **escondido**: sólo se alcanza desde el modal de tabla de métricas cuando detecta par completo (`:31089`) |
| 4 | `comparacion_bifacial_objeto_N_<ts>.json` | `guardarAnalisisComparativoBifacial()` (`:35179`) | **ya se escribe hoy** — pero en la **raíz del proyecto** |

El #4 es la ganancia gratuita de esta pasada. Hoy se escribe en
`<proyecto>/comparacion_bifacial_objeto_3_2026-06-14_10-22-31.json`, con timestamp, así que
**se acumula un archivo nuevo por cada guardado** de cualquiera de las dos caras. Redirigirlo a
`resultados/<ID>__bifacial/comparacion.json` limpia la raíz del proyecto **y** elimina de paso
uno de los focos del problema de conteo del §6 (`CARPETAS_SISTEMA`).

### 8.5 — Tres defectos encontrados al auditar esta rama — (a) y (b) ✅ **CORREGIDOS** (2026-09-12)

Cobertura: `tests/test_bifacial_export.js` (31 comprobaciones, sin dependencias:
`npm run test:js`). El diagnóstico se conserva, con la solución aplicada en cada caso.

**(a) El IMC nunca llega a ningún archivo exportado.**
El Índice Morfométrico Comparativo (global, CI, CMS, 5 sub-scores, rasgos divergentes) se
calcula, se guarda en `window.ultimaComparacionBifacial.imc` (`:39640`) y se pinta en
`#imcSummaryCard`. Pero el CSV **vivo** (`exportarComparacionBifacialDesdeUI`) **no lo incluye**.
El único exportador que sí lo escribía estaba dentro de `exportarComparacionBifacial()`, que es
**código muerto sin callers**. Resultado: el dato más interpretativo de la comparación bilateral
se veía en pantalla y se perdía al exportar.

**✅ Corregido.** Nuevo generador puro `_generarBloqueCsvIMC(imc)`, cableado en el CSV vivo
(`exportarComparacionBifacialDesdeUI`) justo tras el bloque `# PROYECTO` y antes de la tabla,
siguiendo la disposición que el archivo ya tenía. Emite una sub-tabla de 4 columnas
`Indicador,Valor,Peso,Descripción` con el IMC global, el nivel interpretativo, CI y CMS, los
cinco sub-scores **con su peso documentado** (30/30/20/10/10) y los rasgos divergentes.

Dos decisiones sobre los degradados, porque el silencio aquí sería engañoso:

- **Sin IMC** (la tabla de comparación no se llegó a abrir) el bloque no se omite: escribe
  `IMC · No disponible` y explica que el índice se calcula al abrir la tabla. Un índice ausente
  no debe confundirse con un índice bajo.
- **Sub-scores ausentes** salen como `N/D`, nunca como `NaN%` ni `0.0%`.

La sub-tabla de 4 columnas convive con la tabla principal de 5 sin romperse: el CSV vivo **no**
pasa por `_normalizarCsvEstructural()`, y esa función respeta las filas con menos columnas de
las esperadas — verificado antes de insertar el bloque.

**(b) Los nombres de archivo se derivaban de estado vivo, no del par exportado.**
Tanto el CSV como el PDF bifaciales nombraban el archivo con `obtenerIdentificacionActual()`,
que devuelve la identificación **actualmente en el formulario**, no la del par que se está
exportando: si el usuario ya pasó a otro objeto, el archivo salía con el nombre equivocado.
Era cosmético; **con destino a carpeta habría dejado de serlo**, porque el nombre determina en
qué carpeta cae el archivo.

**✅ Corregido.** Nuevo helper compartido `_baseNombreParBifacial(caraA, caraB, numeroObjeto)`,
que deriva el id del **par** quitando el sufijo `_ca`/`_cb` del id de cualquiera de las caras
(`QP1_U1_N1_E1_01_ca` → `QP1_U1_N1_E1_01`), con respaldos encadenados: cara B si A no tiene id →
identificación viva (comportamiento anterior, sólo alcanzable si ninguna cara tiene id) →
`OBJ_<n>`. Siempre devuelve un nombre saneado y válido, nunca `undefined`.

Cableado en **tres** sitios, no dos — el tercero tenía el mismo defecto de otra forma:

| Exportable | Antes | Ahora |
|---|---|---|
| CSV comparación | `<identificación viva>_comparacion` | `QP1_U1_N1_E1_01_comparacion` |
| PDF bifacial | `<identificación viva>_bifacial` | `QP1_U1_N1_E1_01_bifacial` |
| CSV ambas caras | `QP1_U1_N1_E1_01_ca_bifacial` | `QP1_U1_N1_E1_01_bifacial` |

El tercero (`exportarObjetoBifacialCompletoDesdeDatos`) usaba `caraA.id` tal cual, nombrando con
**una cara** un artefacto que es de **las dos**. Compartir helper es lo que impide que los tres
vuelvan a divergir.

⚠️ **Efecto colateral a decidir:** el PDF bifacial y el CSV de ambas caras comparten ahora la
base `<par>_bifacial` (distinta extensión, sin colisión de archivo). Pero la nomenclatura queda
ambigua: `_comparacion.csv` es la tabla A-vs-B, `_bifacial.csv` son las métricas de ambas caras
y `_bifacial.pdf` es el informe comparativo. Renombrar el CSV de ambas caras a `_caras.csv`
lo aclararía, pero es una decisión de nomenclatura, no un defecto: **no se ha tocado**.

**(c) El PDF bifacial también toca el canvas vivo.** — sigue pendiente, es del orden de ejecución (§5.1), no del payload.
Renderiza en un contenedor off-screen (`#pdfCanvasA`/`#pdfCanvasB`, `:27879-27881`), pero al
terminar **re-renderiza el canvas morfológico vivo** para restaurar la vista
(`VisualizationExport.mostrarAnalisisMorfologico`, `:29046`). Le aplica la misma regla de orden
del §5.1: va **al final** del lote.

### 8.6 — Más código muerto en esta rama

| Artefacto | Estado |
|---|---|
| `exportarComparacionBifacial()` | **Muerto** — era la versión *correcta* (IMC + ID derivado). ✅ **Ya canibalizado**: ambas cosas viven ahora en `_generarBloqueCsvIMC()` y `_baseNombreParBifacial()`, usadas por los exportadores vivos. Se puede borrar sin pérdida. |
| `exportarObjetoBifacialCompletoUnificado()` (`:32017`) | **Muerto** — duplica el #3 de §8.4. |
| `generarTablaComparativaBifacialCSV()` (`:33227`) | **Muerto por arrastre** — único caller es `:32809`, dentro del muerto anterior. |

Había **dos implementaciones paralelas** del CSV de comparación bifacial, y la que quedó
cableada era la que perdía el IMC. ✅ Resuelto extrayendo lo valioso de la muerta a helpers
compartidos, en vez de cambiar el cableado a una función sin callers ni pruebas de uso.

### 8.7 — Impacto sobre el plan del §7

**La Fase 1 no cambia.** La capa de destino sigue siendo la misma; sólo se generaliza su
resolvedor para aceptar un descriptor en vez de un objeto:

```js
MaoExportDestino.resolver({ tipo: 'cara',     id: 'QP1_U1_N1_E1_01_ca' })
//   → <proyecto>/resultados/QP1_U1_N1_E1_01_ca/
MaoExportDestino.resolver({ tipo: 'bifacial', id: 'QP1_U1_N1_E1_01' })
//   → <proyecto>/resultados/QP1_U1_N1_E1_01__bifacial/
```

**La Fase 2 pasa a tener dos orquestadores** sobre la misma capa:

| Orquestador | Dispara desde | Produce |
|---|---|---|
| `exportarTodoElAnalisis(obj)` | menú Exportar de la barra lateral | CSV · SVG · PNG · TPS×N · EFA×N · PDF integral |
| `exportarTodoElObjetoBifacial(caraA, caraB)` | menú Exportar de la tabla de comparación **y/o** el `return true` de `_abrirComparacionBifacialSiCompleto` | CSV comparación (**con IMC**) · CSV ambas caras · `comparacion.json` · PDF bifacial |

**Fase 2.bis — ✅ COMPLETADA (2026-09-12):** el bloque IMC llega al exportador vivo (defecto *a*) y
los tres nombres derivan del id del par (defecto *b*). El «exportar todo» bifacial ya puede
escribir archivos completos y correctamente nombrados en carpetas fijas.

**Fase 3** gana un ítem: redirigir `guardarAnalisisComparativoBifacial()` (`:35186-35187`) de la
raíz del proyecto a `resultados/<ID>__bifacial/comparacion.json`, sin timestamp en el nombre
(que el versionado lo lleve el contenido, no el nombre de archivo).

### 8.8 — Nota de UI: proxies bifaciales huérfanos

Los botones canónicos (`index.html:1661-1662`) viven **dentro** de la tabla de comparación y son
visibles siempre que la tabla lo esté. Sus proxies de barra lateral
(`sidebarExportBifacialCSVBtn` / `PDFBtn`) están además gateados por `updateActionsSection()`
(`sidebar-nav.js:175-188`), cuyo `hasResults` exige que el **panel morfológico** esté abierto —
y ese panel se cierra (`analysis-core.js:14656`) justo antes de que se abra la comparación.
Con el `setInterval` de 2 s (`sidebar-nav.js:681`), los proxies se ocultan a los pocos segundos
de que la comparación aparece en pantalla. No bloquea nada (los canónicos siguen ahí), pero son
botones que nunca se ven en el momento en que servirían. Si se añade un «Todo — bifacial»,
ponerlo en el menú canónico de la tabla, no en el proxy.

---

## 9. Incorporación de TPS y EFA (contorno + P/H)

Es la rama **más fácil de cablear** y la que **más problemas de fondo destapa**. Cablearla es
trivial; el trabajo real es que lo que se escriba sirva para algo en tpsRelw / geomorph / MorphoJ.

### 9.1 — Cómo se producen hoy

El panel EFA del análisis morfológico lista una fila por **fuente** y da dos botones por fila
(«TPS» y «CSV EFA»). Las fuentes las arma `_colectarFuentesEFAConfirmadas()`
(`analysis-core.js:23088`):

| Fuente | Origen | Condición |
|---|---|---|
| `Contorno principal` | `metricas._efa_data` + `metricas._landmarks_semiauto` | que EFA haya resuelto |
| `P1`, `P2`… | `obj.perforaciones[i].metricas._efa_data` | **`if (!metricasPH?._efa_data) return;`** (`:23106`) |
| `H1`, `H2`… | `obj.horadaciones[i].metricas._efa_data` | ídem |

El `_efa_data` de cada P/H lo rellena `_hidratarEFAConfirmadoPH(obj)` (`:23126`), que llama a
`PythonBridge.efa.calculate()` una vez por P/H. Corre **dentro** de `renderPanelEFA()` (`:23258`),
tanto en la rama de caché (`:23291`) como en la de cálculo (`:23335`).

**Sólo entran P/H confirmadas.** Los candidatos de ADR-009 viven en `obj.phCandidatos` y no se
escriben en `obj.perforaciones`/`horadaciones` hasta que el usuario los confirma y tipa; por eso
no tienen `metricas` ni `_efa_data` y quedan fuera. Es el comportamiento correcto: *la detección
propone, el humano dispone* — y el invariante se mantiene también en la exportación.

### 9.2 — La condición que el orquestador NO puede saltarse

`renderPanelEFA()` es **asíncrona** y se dispara desde `mostrarAnalisisMorfologico()`
(`visualization-export.js:2051-2053`), que la guarda en `currentAnalyzedObject.efaPromise`.
Nadie la espera salvo «Guardar y Finalizar» (`analysis-core.js:14640-14643`).

Es decir: **al pulsar «Exportar», el EFA del contorno y la hidratación de las P/H pueden estar a
medias.** Exportar en ese momento produce cero o pocos archivos TPS/EFA, en silencio.

```js
// primera línea obligatoria de exportarTodoElAnalisis(obj)
if (currentAnalyzedObject?.efaPromise) await currentAnalyzedObject.efaPromise;
```

Un solo `await` cubre todo, porque la hidratación de P/H está *dentro* de esa misma promesa.

Nota de flujo, ya resuelta: si el usuario confirma P/H **después** de renderizar el análisis,
`finalizarTodosTrazados()` (`:48099`) termina llamando a `actualizarTablaMorfologica()`
→ `mostrarAnalisisMorfologico()` → nuevo `efaPromise` → rama de caché → `_hidratarEFAConfirmadoPH()`.
Las P/H recién confirmadas quedan hidratadas. (Las dos líneas `if (t._efa_data)` de `:48162` y
`:48189` son defensivas muertas: nada asigna `_efa_data` a un *trazado*.)

### 9.3 — Tres defectos de escala y payload — ✅ **CORREGIDOS** (2026-09-12)

Estos eran el verdadero contenido de esta pregunta: cablear el destino sin corregirlos sólo
habría cambiado de sitio archivos que no servían. **Se corrigieron antes de tocar el destino**;
el diagnóstico se conserva abajo como registro, con la solución aplicada en cada caso.

Cobertura: `tests/test_efa_tps_export.js` (30 comprobaciones, sin dependencias:
`npm run test:js`). Extrae las funciones reales del IIFE y las ejecuta con stubs del
closure, de modo que renombrarlas o moverlas hace fallar el test en vez de pasar en vacío.

**(a) El TPS nunca lleva escala — y los landmarks van en píxeles.**

`_generarTextoTPSLandmarks()` (`:22979`) intenta emitir la escala así:

```js
if (Number.isFinite(Number(metricas?.scale_px_mm))) {
  lines.push(`COMMENT=scale_px_mm ${Number(metricas.scale_px_mm).toFixed(8)}`);
}
```

**`metricas.scale_px_mm` no lo escribe nadie en el frontend.** El orquestador de métricas
pone `metrics.scale_factor` (`metrics-orchestrator.js:443`), que además puede valer el string
`'No configurada'`. `Number(undefined)` → `NaN` → la condición **siempre es falsa**: la línea
no se emite jamás.

Y los landmarks salen de `_generarLandmarksSemiAutomaticos(contourPoints, …)` sobre los puntos
de `_obtenerPuntosContornoEFA()` (`:22854`), que son **píxeles de imagen sin escalar**.

Resultado: **TPS en píxeles, sin ninguna anotación de escala.** No se podía calcular centroid
size real, ni alometría, ni comparar entre fotografías tomadas a distinta distancia. Era el
defecto más grave de esta rama.

**✅ Corregido.** Nuevo `_resolverEscalaMmPx(metricas)`, que resuelve el factor por prioridad:
`metricas._efa_data.scale_px_mm` (el que el backend usó *para esa fuente*) → `metricas.scale_px_mm`
(clave legada) → `scale` del IIFE. El `0` que devuelve el backend cuando no hay escala se trata
como centinela, no como factor. El TPS pasa a emitir el campo **estándar** `SCALE=` (más `IMAGE=`)
en el orden canónico `LM= · coords · IMAGE= · ID= · SCALE= · COMMENT=`. **Las coordenadas siguen
en píxeles a propósito**: es la convención del formato (tpsDig las guarda así) y `SCALE=` es el
multiplicador que leen `tpsRelw` y `geomorph::readland.tps(..., scale = TRUE)`. Si no hay escala
configurada **no se emite `SCALE=`** — escribir `1.0` afirmaría falsamente 1 mm/px; en su lugar se
deja constancia explícita en un `COMMENT=`.

Además `COMMENT=` no es el campo estándar: tpsDig/tpsRelw/geomorph leen **`SCALE=`** (mm por
píxel). Arreglo correcto, ~6 líneas:

```js
const f = Number(window.currentScale);           // getter vivo, analysis-core.js:52024
if (Number.isFinite(f) && f > 0) lines.push(`SCALE=${f.toFixed(8)}`);
lines.push(`IMAGE=${resolverNombreFotografia(obj) || ''}`);
```

**(b) El CSV de EFA tira la mitad del payload — incluida la única vía para recuperar el tamaño.**

`_descargarCoeficientesEFA()` (`:23007`) escribe exclusivamente `harmonic,an,bn,cn,dn` a partir
de `efaData.coefficients`. El backend (`efa.py:318-331`) devuelve además:

| Campo descartado | Por qué importa |
|---|---|
| `coefficients_raw` | los coeficientes **con tamaño**; `coefficients` van normalizados |
| `normalization.scale_factor` | el divisor que quitó el tamaño — **sin él la normalización es irreversible** |
| `normalization.theta_1_deg` / `psi_1_deg` | rotación y fase eliminadas; necesarias para reponer la orientación |
| `power_spectrum`, `variance_explained` | justifican cuántos armónicos retener |
| `harmonics_for_95pct` / `_99pct`, `n_points_input` | reproducibilidad |

Nótese que `efa.py:284` hace `pts = pts * scale_px_mm` **antes** del EFD: el cálculo sí es
consciente de la escala. Es la exportación la que la pierde. Con lo que hoy sale del CSV no se
puede hacer análisis alométrico ni reconstruir el contorno a tamaño real.

Lo irónico: **todo eso ya se persiste en disco** dentro de `metricas.json`, porque
`guardarAnalisisMorfologico()` hace spread de `obj.metricas` (que contiene `_efa_data` entero) y
las P/H se guardan con su `metricas` completa (`project-manager.js:~540`). El dato estaba en el
proyecto; sólo el CSV lo tiraba.

**✅ Corregido.** Nuevo generador puro `_generarCsvEFA(efaData, fuente)`. La tabla pasa de 5 a 11
columnas — `harmonic, a_norm…d_norm, a_raw…d_raw, power_spectrum, variance_acum_pct` — y va
**primero**, seguida de una línea en blanco y un bloque `Seccion,Campo,Valor,Nota` con
`scale_factor`, `theta_1_deg`, `psi_1_deg`, el convenio de quiralidad, los componentes DC y la
escala mm/px aplicada. Ese orden (tabla antes que metadatos) replica el de
`exportarAnalisisMorfologico` y permite `read.csv(f, nrows = n_harmonics)` directo.

Dos precisiones **verificadas contra `python/modules/efa.py`**, no asumidas:

- `scale_factor` es el semieje mayor del **primer armónico** tras la alineación, en las unidades
  del contorno (mm si hubo escala). Multiplicar los coeficientes normalizados por él restituye la
  magnitud — comprobado con contornos elípticos sintéticos. Pero **no es el semieje mayor del
  objeto**: la razón entre ambos varía con la elongación (1,00 en un círculo · 0,90 con a/b≈2,3 ·
  0,83 con a/b=8). La nota del CSV lo dice con esas palabras, para que nadie lo use como medida.
- La reflexión `d1≥0` se aplica **después** del escalado y niega `cn`/`dn` de todos los armónicos,
  así que `coef_norm × scale_factor` puede diferir en el signo de las componentes-y. También anotado.

Los valores y las notas van **entrecomillados**: varias notas llevan comas y `:`, que sin comillas
desalinearían las columnas — el mismo fallo que ADR-008 corrigió en el CSV morfológico.

**(c) La etiqueta de la fuente se usa como nombre de archivo.**

`_renderResumenFuentesEFA` (`:23169`) pasa `` `${obj.id}_${fuente.etiqueta}` `` como base, y
`_descargarLandmarksTPS` la sanea con `replace(/[^a-zA-Z0-9_-]/g,'_')`. De ahí sale
`QP1_U1_N1_E1_01_ca_Contorno_principal_landmarks.tps`: una etiqueta de UI en español,
con espacio, convertida en nombre de archivo. Si mañana la etiqueta cambia, cambian los nombres.
En una carpeta de resultados hace falta una clave estable (`contorno`, `P1`, `H1`), no un rótulo.
De paso, `fuente.key` sólo se asignaba a las P/H — la fuente del contorno quedaba con `key`
`undefined` (generaba ids `efaFuenteTps_undefined_…`, inocuo por el sufijo aleatorio).

**✅ Corregido.** Cada fuente lleva ahora tres campos con responsabilidades separadas:
`clave` (identificador estable para nombres de archivo, **no traducir**), `key` (fragmento de id
del DOM, ya asignado también al contorno) y `etiqueta` (rótulo de UI, libre de cambiar). El nombre
de archivo pasa a derivarse de `clave`. Efecto visible: el contorno exporta
`<ID>_contorno_landmarks.tps` en vez de `<ID>_Contorno_principal_landmarks.tps`; los nombres de
P/H (`P1`, `H1`) no cambian.

### 9.4 — Destino propuesto

Una subcarpeta `landmarks/` dentro de la carpeta de resultados del análisis, con **claves
estables**:

```
resultados/QP1_U1_N1_E1_01_ca/
├── QP1_U1_N1_E1_01_ca_analisis.csv
├── QP1_U1_N1_E1_01_ca_integral.pdf
├── QP1_U1_N1_E1_01_ca_geometria.svg
├── QP1_U1_N1_E1_01_ca_morfologia.png
└── landmarks/
    ├── contorno.tps          ├── contorno_efa.csv
    ├── P1.tps                ├── P1_efa.csv
    ├── H1.tps                ├── H1_efa.csv
    └── landmarks.tps         ← multi-espécimen: contorno + todas las P/H
```

El `landmarks.tps` agregado importa más de lo que parece: **TPS es un formato multi-espécimen**.
Un archivo por contorno obliga al investigador a concatenarlos a mano antes de poder correr
`tpsRelw` o `geomorph::readland.tps()`. Generarlo es concatenar los bloques que ya se producen —
coste casi nulo, y convierte la carpeta en algo directamente utilizable.

Extensión natural a nivel de proyecto (opcional): `resultados/_coleccion/landmarks_todos.tps`
con el contorno de cada análisis de la colección. Eso es, literalmente, el artefacto para el que
existe el formato.

### 9.5 — Refactor necesario: separar generar de descargar

`_descargarLandmarksTPS` y `_descargarCoeficientesEFA` mezclan generación y `a.download`.
**✅ Hecho al corregir §9.3.** Ambos generadores están ya separados y son puros:
`_generarTextoTPSLandmarks()` y el nuevo `_generarCsvEFA(efaData, fuente)`. Las funciones de
descarga quedaron como *generador + guardado*, que es justo la forma que necesita la capa de
destino.

Con eso, ambas funciones de descarga quedan como generador + guardado, y el guardado pasa por
`MaoExportDestino` igual que los demás formatos (§7, Fase 1). Los botones individuales del panel
siguen funcionando: con `MaoExportDestino.activo === null` caen al `a.download` de siempre.

### 9.6 — Integración en el orquestador

Dentro de `exportarTodoElAnalisis(obj)` (Fase 2), y como **paso 5**, entre los rásteres y el PDF
(ver la regla de orden del §5.1):

```js
// 0 · esperar EFA (contorno + hidratación de P/H) — §9.2
if (currentAnalyzedObject?.efaPromise) await currentAnalyzedObject.efaPromise;
…
// 5 · TPS + EFA por fuente
const fuentes = _colectarFuentesEFAConfirmadas(
  obj, metricas, metricas._efa_data, { landmarks: metricas._landmarks_semiauto }
);
for (const f of fuentes) {
  const clave = f.tipo === 'contorno' ? 'contorno' : f.etiqueta;   // 'P1' | 'H1'
  await MaoExportDestino.escribir(`landmarks/${clave}.tps`,
    _generarTextoTPSLandmarks(f.landmarks, f.objRef || obj, f.metricasRef || metricas));
  await MaoExportDestino.escribir(`landmarks/${clave}_efa.csv`, _generarCsvEFA(f.efaData));
}
await MaoExportDestino.escribir('landmarks/landmarks.tps', _generarTpsMultiEspecimen(fuentes, obj));
```

Las tres funciones (`_colectarFuentesEFAConfirmadas`, `_generarTextoTPSLandmarks`,
`_generarCsvEFA`) son privadas del IIFE de `analysis-core.js`, y el orquestador vive ahí mismo:
**acceso directo, sin exponer nada nuevo en `window`.**

### 9.7 — Reportar lo que no se pudo generar

`_hidratarEFAConfirmadoPH` sale en silencio si el backend EFA no está activo
(`PythonBridge.isModuleActive('efa')`, `:23127`), y `_colectarFuentesEFAConfirmadas` descarta sin
avisar toda P/H sin `_efa_data` (`:23106`). Hoy eso sólo significa «faltan filas en un panel».
En un «exportar todo» significaría **una carpeta de resultados incompleta sin que nadie lo note**.

El `manifiesto.json` de la Fase 2 debe registrar, por fuente: generada / omitida y el motivo
(`backend EFA inactivo`, `contorno < 8 puntos`, `P/H sin confirmar`). Es la diferencia entre una
exportación y una exportación auditable.

---

## 10. Verificación en Electron (2026-09-12)

App real lanzada con `--remote-debugging-port=9222` y conducida por CDP, **sin modificar el
código para la prueba**: fixture sintético de ADR-010, backend Python real (módulo `efa`
activo), descargas interceptadas con `Browser.setDownloadBehavior`. Los archivos examinados
son los que la app escribió en disco.

### 10.1 — Lo que la app produjo

Flujo: `cargar('sintetico_escala_objeto_ph.png')` → datos de cámara → escala → identificar
→ detectar → análisis morfológico → `await efaPromise` → confirmar el candidato P/H de ADR-009
→ clic en los 4 botones TPS / CSV EFA.

| Comprobación | Resultado |
|---|---|
| Escala calculada | **0,44875 mm/px** = 35,9/800 × (1000/100) — exacta |
| Objeto detectado | 1 · **230 métricas** |
| Candidato P/H (ADR-009) | 1 · «CANDIDATO ?1 (12 pts · conf. 91% alta)» · área 1112 px² ≈ elipse 44×32 del fixture |
| Tras confirmar | P1 con `_efa_data` hidratado y 31 landmarks · área 221,21 mm² (esperado 222,7) |
| Fuentes EFA | `contorno` + `perforacion_1` |
| Errores de renderer | **0** en toda la sesión |

### 10.2 — Los tres defectos de §9.3, verificados sobre archivos reales

**Premisa del defecto (a), confirmada en vivo:** `metricas.scale_px_mm` salió **AUSENTE** del
objeto analizado real — la clave de la que dependía el TPS antiguo efectivamente no existe.
El nuevo resolvedor tomó `_efa_data.scale_px_mm = 0,44875`, idéntico a la escala del app.

TPS emitido (`1_contorno_landmarks.tps`):

```
LM=31
350.250000 250.250000
…
IMAGE=sintetico_escala_objeto_ph.png
ID=1
SCALE=0.44875000
COMMENT=MAO Plus semi-landmarks (curvatura + arco)
```

**Prueba científica decisiva** — leer el TPS como haría `geomorph::readland.tps(…, scale = TRUE)`:

| Fuente | Extensión medida | Esperado (geometría del fixture) | Error |
|---|---|---|---|
| `contorno` | 89,75 × 62,82 mm | 89,75 × 62,82 mm (rect 200×140 px) | **0,00 %** |
| `P1` | 19,62 × 14,28 mm | 19,74 × 14,36 mm (elipse 44×32 px) | **0,61 %** |

Aplicar `SCALE` devuelve las dimensiones reales. Antes del arreglo esto era imposible: el
archivo salía en píxeles sin ninguna anotación de escala.

**Defecto (b):** el CSV pasó de 5 a **11 columnas** con `coefficients_raw` y `power_spectrum`,
más el bloque de metadatos (`scale_factor`, `theta_1_deg`, `psi_1_deg`, DC, escala mm/px).
El `|1er armónico|` normalizado salió **exactamente 1,000000** en ambas fuentes — la
demostración empírica de que sin `scale_factor` el tamaño es irrecuperable. Valores reales:
49,30918 (contorno) y 9,439558 (P1). El bloque de metadatos parsea con 4 columnas exactas y la
tabla con `csv.DictReader` sin errores.

**Defecto (c):** los archivos salieron como `1_contorno_*` y `1_P1_*`. Los ids de los botones
pasaron de `efaFuenteTps_undefined_…` a `efaFuenteTps_contorno_…`.

### 10.3 — Los dos defectos de §8.5

El botón de exportación bifacial pasa por `saveFileWithDialog` → **diálogo nativo de guardado**,
que no es automatizable por CDP (es del proceso principal, no del renderer; `electronAPI` está
congelado por contextBridge y no se puede interceptar). Verificado hasta donde llega sin diálogo:

- `generarComparacionBifacialSimple()` del app produjo `ultimaComparacionBifacial.imc` con
  **exactamente las 10 claves** que lee `_generarBloqueCsvIMC`: `global, dimensional, forma,
  radial, contorno, conservacion, ci, cms, nivel, divergentes`.
- Los ids de cara salieron `QP1_U1_N1_E1_01_ca` / `_cb`, confirmando el sufijo que
  `_baseNombreParBifacial` elimina.
- Pasando ese payload **real** por las funciones extraídas: bloque IMC completo y correcto, y
  los tres nombres derivando de `QP1_U1_N1_E1_01` **aunque la identificación viva apuntara a
  otro objeto** — el escenario exacto del bug.

⚠️ **No ejercitado:** la escritura a disco del CSV/PDF bifacial. Queda como verificación manual
(exportar una comparación bifacial real y comprobar nombre y bloque IMC del archivo guardado).
Los valores del IMC salieron 100 % porque la comprobación fue **estructural** — se compararon
dos copias del mismo objeto para validar el juego de claves, no los números.

### 10.4 — ⚠️ Defecto PREEXISTENTE encontrado y corregido

La verificación se bloqueó de entrada con un `TypeError` que **abortaba la construcción de todo
el panel morfológico** — incluido el panel EFA, que se renderiza al final.

```
TypeError: Cannot read properties of undefined (reading 'puntos_originales')
  at mostrarAnalisisMorfologico (visualization-export.js:903)
```

**Causa.** La rama Python de `analysis-core.js` (~`:12060`) construye un fallback
`_forma_idealizada = {nombre, vertices, distribucionRadialAngular}` — **sin `parametros` ni
`color`** — cuando la clasificación JS no produce forma. La guarda de
`visualization-export.js:887` sólo exigía que `_forma_idealizada` existiera, así que entraba
igualmente y reventaba en `params.puntos_originales`.

**Preexistente, confirmado:** el fallback es idéntico en `HEAD`, y `visualization-export.js` no
figura en el diff de esta sesión. Nada que ver con los cambios de exportación.

**Alcance:** en ese camino el usuario no ve **ningún** panel morfológico. No es un fallo estético.

**Corrección (1 línea + comentario):** exigir también `parametros` en la guarda. El archivo ya
tenía la rama correcta — el esqueleto estable de ADR-011 (`_hSkel` + `_filaSinDatos`), que ahora
rinde «Sin datos — contorno no depurado estadísticamente en este modo». Verificado en vivo: panel
completo (6.881 caracteres), sección de depuración con el mensaje honesto, 0 errores de renderer.

**Corrección de altitud — ✅ aplicada después (2026-09-12).** Ver §10.6.

### 10.5 — Regresión

`node --check` limpio en 51 archivos JS · `npm run test:js` 61/61 · Python 262 passed / 4 skipped
/ 7 failed (los 7 son `sklearn` ausente en el worktree, idénticos antes del cambio) · 0 errores de
renderer · sin errores en el log del proceso principal.

### 10.6 — Corrección de altitud: el fallback de `analysis-core.js:12060`

Auditado el contrato completo de `_forma_idealizada` antes de tocar nada. **Cinco productores**,
y sólo uno lo incumplía:

| Productor | `parametros` | `color` |
|---|---|---|
| `shape-classification.js:1303` (canónico JS, vía `simplificarAFormaRegular`) | ✅ | ✅ |
| `analysis-core.js:11418` — `null` explícito cuando no hay forma | n/a (los consumidores toman su rama `else`) | n/a |
| `analysis-core.js:~11723` — fallback IA/caché | ✅ | ✅ |
| `mao-ia.js:2199` — AIA | ✅ | ✅ |
| **`analysis-core.js:12060`** — fallback rama Python | ❌ | ❌ |

Consumidores que desreferencian `parametros` **sin guarda**: `visualization-export.js:903`
(el panel morfológico, vivo) y `analysis-core.js:24943`/`:24981` (dentro de
`generarReporteMorfologico`, que es **código muerto** — §3). Los demás usan `?.` o `|| {}`.

Es decir: el impacto **vivo** del defecto era exactamente un consumidor, y lo tapó la guarda de
§10.4. El arreglo de `:12060` es corrección de **contrato**: pone al quinto productor al nivel de
los otros cuatro y protege al consumidor muerto-pero-revivible y a cualquiera futuro.

**Aplicado:** el fallback devuelve ahora `{nombre, color, vertices, parametros{…}, distribucionRadialAngular}`
completo, con valores que dicen la verdad y el marcador explícito
`umbral_continuidad: '— (sin depuración estadística)'` — mismo patrón que la rama IA usa con
`'— (contorno IA)'`.

Un matiz que la primera versión del arreglo se comía: `vertices_coords` son los vértices de la
forma **idealizada** por el clasificador Python (4 esquinas del rectángulo), no un contorno
depurado. Mezclarlos con el recuento de la depuración producía «680 → 4 puntos, reducción 0,0 %»:
incoherente. Separados, el panel queda honesto — la depuración no tocó nada (680 → 680, 0 %) y los
4 vértices van a `vertices_significativos`:

```
Depuración Estadística de Contorno
  Forma Identificada:                Rectangular
  Puntos Detectados (Máscara):       680 puntos del borde
  Artefactos Digitales Eliminados:   0 puntos (0.0%)
  Puntos Depurados (Geometría Real): 680 puntos (reducción total: 0.0%)
  Continuidad Geométrica Promedio:   1.000 (umbral: — (sin depuración estadística))
  Vértices significativos:           4
```

**Verificado en Electron** (relanzado, caché invalidada): las 5 claves presentes, los 10 campos de
`parametros`, `puntos_originales === puntos_simplificados`, **sin `NaN`** en el panel, 0 errores de
renderer. Y la exportación TPS/EFA sigue idéntica tras el cambio (`SCALE=0.44875000`, 11 columnas,
`scale_factor=49.30918`) — sin regresión.

La guarda de §10.4 **se mantiene** como defensa en profundidad: con el productor arreglado ya no
se dispara en esta ruta, pero el contrato es implícito y un productor futuro podría romperlo otra vez.

---

## 11. Implementación de la exportación en lote (2026-09-12)

Fases 1-3 del §7 implementadas y **verificadas en Electron con archivos reales en disco**.
Un clic en «Todo — a carpeta de resultados» produce:

```
<proyecto>/resultados/QP1_U1_N1_E1_01/
├── QP1_U1_N1_E1_01_analisis.csv    (8,0 KB)
├── 1_geometria.svg                  (2,1 KB · image/svg+xml)
├── 1_morfologia.png                 (3,9 KB · image/png)
├── 1_integral.pdf                  (30,2 KB · %PDF-1.3)
├── landmarks/
│   ├── contorno.tps                 (SCALE=0.44875000 · §9.3a intacto)
│   ├── contorno_efa.csv             (11 columnas · §9.3b intacto)
│   └── landmarks.tps                (multi-espécimen)
└── manifiesto.json
```

**7 generados · 0 omitidos · 0 errores de renderer.**

### 11.1 — Qué se construyó

| Fase | Entrega |
|---|---|
| 1 | `js/mao-export-destino.js` (206 líneas) — `window.MaoExportDestino`: `resolver`/`abrir`/`escribir`/`omitir`/`cerrar`. Sin IPC nuevo: reutiliza `_getFsAdapter()`. **Con `activo === null` el comportamiento es idéntico al anterior** (cada guardado cae a su diálogo): reversibilidad total. |
| 1b | Tres puntos de guardado parametrizados: `saveFileWithDialog` (CSV+PDF), `_guardarPNGNativo`, el bloque inline de `exportGeometryToSVG`. |
| 2 | `exportarTodoElAnalisis()` y `exportarTodoElObjetoBifacial()` en el IIFE de `analysis-core.js`, con el orden obligatorio del §5.1 (lectores de canvas antes del PDF), `await efaPromise` del §9.2, guardia de reentrada y progreso por pasos. |
| 2b | UI: ítem «Todo — a carpeta de resultados» en el menú Exportar de la barra lateral y en el menú canónico de la tabla de comparación bifacial (§8.8). |
| 3 | `resultados` y `aps` añadidos a `CARPETAS_SISTEMA` (`project-manager.js`) y `_SYS` (`projects-ui.js`) — si no, el conteo de análisis de la tarjeta de proyecto los contaba como análisis (§6). |

Cobertura: `tests/test_export_destino.js` (26 comprobaciones, `npm run test:js`), que carga el módulo real en un `window` simulado con un FS falso.

### 11.2 — El manifiesto hace auditable la exportación

`manifiesto.json` registra lo generado **y lo omitido con su motivo**. No es adorno: durante la
propia verificación fue lo que reveló los tres defectos siguientes, cada uno apareciendo como una
línea en `omitidos` en vez de como una carpeta incompleta en silencio (§9.7).

### 11.3 — ⚠️ Defecto sistémico destapado: `obj.id` es NUMÉRICO

En el flujo de **detección automática** el objeto recibe `obj.id = 1` (un `Number`), no el
identificador arqueológico. Varios exportadores asumen que es una cadena:

| Sitio | Síntoma |
|---|---|
| `analysis-core.js` ×4 (`obj.id?.replace(...)`) | `TypeError: obj.id?.replace is not a function` — **abortaba el PDF integral por completo**. El `?.` no protege: `1` es *truthy*, así que se accede a `.replace` igual. |
| `collection.js:1513` y `:1530` (`analysis.nombreObjeto`) | mismo `TypeError` — **abortaba el SVG**. |

**Preexistente y no exclusivo del lote:** el botón «PDF — Reporte integral» y el de SVG fallan
igual al pulsarlos de uno en uno sobre un objeto detectado automáticamente. Corregido saneando
con `String(...)` en los 6 sitios. Es el mismo patrón de la deuda ADR-008 C2 (el `id` como clave
viva de formato no garantizado).

### 11.4 — ⚠️ `currentAnalyzedObject` son DOS variables distintas

`analysis-core.js:137` declara `let currentAnalyzedObject` **dentro del IIFE**, y `:138` crea
además la propiedad global `window.currentAnalyzedObject`. `visualization-export.js` es un módulo
ESM donde el identificador **no está declarado**, así que resuelve al **global**: escribe en
`window.*`, nunca en la local del IIFE.

Resultado: en el flujo IA/pestañas la local queda en `null` mientras la global tiene el análisis.
El repo **ya conocía y parcheaba** esta divergencia, pero sólo en el modal de P/H
(`analysis-core.js:~44573`, con el comentario «Sincronizar la var local del IIFE con la fuente
autoritativa»).

Cualquier exportador que lea la local sale en vacío. El orquestador lee ahora
`window.currentAnalyzedObject` y, además, **alinea la local** durante el lote —mismo remedio que el
modal— para que los sub-exportadores que la leen (`exportarPDFIntegralCaraActiva`) funcionen.

✅ **Resuelto el 2026-09-13 con una sola fuente**, ver §11.9.

### 11.5 — `exportarPNGMorfologicoActual` no era esperable

Escribía el PNG dentro del callback de `canvas.toBlob()`, retornando antes. Un
`await exportarPNGMorfologicoActual()` no esperaba nada y en el lote el PNG aterrizaba **después**
del manifiesto (aparecía en disco pero no en la lista de generados). Ahora la función envuelve el
`toBlob` en una promesa y se resuelve cuando el archivo está escrito.

### 11.6 — Pendiente conocido

- ~~**Nombres mixtos dentro de la carpeta**~~ → ✅ **unificado**, ver §11.7.
- ~~**Lote bifacial no ejercitado end-to-end**~~ → ✅ verificado, ver §11.8.
- **`landmarks.tps` con 1 espécimen** en la corrida verificada, por no haber P/H confirmadas; la
  lógica multi-fuente está probada en §10.2.

### 11.7 — Unificación de nombres con el ID arqueológico (2026-09-12)

Los cuatro formatos derivaban su nombre por su cuenta y salían mezclados:
`QP1_U1_N1_E1_01_analisis.csv` junto a `1_geometria.svg`, `1_morfologia.png` y `1_integral.pdf`
—porque SVG/PNG/PDF usaban `obj.id`, numérico en detección automática (§11.3).

**Fuente única:** `_baseNombreAnalisis(obj)` en el IIFE de `analysis-core.js`, expuesta como
`window.maoBaseNombreAnalisis` para los exportadores de `collection.js`, que viven fuera (mismo
patrón que `window.calcularEscala`). Resuelve por prioridad: identificación arqueológica asignada
→ `obj.id` → `OBJ_<numeroObjeto>`, siempre saneada.

Convención de cara: sufijo **`_ca`/`_cb`**, el mismo que usan `obj.id` en bifacial y las carpetas
de análisis. No se duplica si la identificación ya lo trae. (El CSV usaba antes `_CaraA`; ahora
sigue la convención común.)

Cablada en cinco sitios: CSV, PDF, SVG (vía `analysisData.id`), PNG y la carpeta del lote.

**Verificado en Electron:**

```
resultados/QP1_U1_N1_E1_01/
├── QP1_U1_N1_E1_01_analisis.csv     8,0 KB · text
├── QP1_U1_N1_E1_01_geometria.svg    2,1 KB · image/svg+xml
├── QP1_U1_N1_E1_01_morfologia.png   5,7 KB · image/png
├── QP1_U1_N1_E1_01_integral.pdf    30,2 KB · application/pdf
├── landmarks/  (contorno.tps · SCALE=0.44875000 · EFA CSV 11 columnas)
└── manifiesto.json                  7 generados · 0 omitidos
```

Carpeta y archivos comparten base; los de `landmarks/` mantienen sus claves estables
(`contorno`, `P1`, `H1`) porque identifican la FUENTE dentro del análisis, no el análisis (§9.3c).

⚠️ La identificación se lee del formulario (estado vivo) porque **el ID arqueológico no viaja en
el objeto** — deuda ADR-008 C2. Si se implementa C2, `_baseNombreAnalisis` es el único sitio a
cambiar. Cobertura: 11 comprobaciones en `tests/test_bifacial_export.js` (sección G).

### 11.8 — Verificación E2E del lote bifacial y timeout del PDF (2026-09-13)

Con **dos análisis reales y distintos** (fixtures cara A y cara B, 230 métricas cada uno), el IMC
salió **98,9 %** —no el 100 % degenerado de la comprobación estructural del §10.3— con tres rasgos
divergentes reales (`Varianza Tonal Δ46,0 % | Entropía Tonal Δ34,3 % | Gradiente Interno Δ26,5 %`).

**Primer intento: el PDF bifacial se colgó >5 minutos** sin error, con el status congelado en
«puede tomar 20-30 segundos», el destino abierto y el manifiesto sin escribir.

**Causa raíz:** `html2canvas(..., { imageTimeout: 0 })` en dos sitios. `0` **no** significa «sin
espera» sino **espera indefinida**: basta una imagen que no cargue para que la captura no resuelva
nunca. Corregido a `15000` ms.

**Defensa en profundidad** (un cuelgue silencioso es peor que un fallo):

| Capa | Tope |
|---|---|
| `renderizarCanvasDesdeTrazos` por cara | 20 s |
| `html2canvas` por página | 45 s |
| Paso PDF completo en ambos orquestadores | 180 s |

Helper `_conTimeout(promesa, ms, etiqueta)`: rechaza con motivo y etiqueta legibles, y **propaga
tal cual los fallos reales** sin enmascararlos de timeout. 3 comprobaciones en la sección H de
`tests/test_bifacial_export.js`.

**Resultado verificado:** PDF de 679 KB (`%PDF-1.3`), CSV de comparación con el bloque IMC y
`comparacion.json`, en `resultados/QP1_U1_N1_E1_01__bifacial/`. 0 errores de renderer.

#### Hueco de auditabilidad cerrado de paso

El paso «CSV de ambas caras» no aparecía **ni** en `archivos` ni en `omitidos`: su exportador sale
antes con un toast, sin lanzar y sin escribir, así que el manifiesto declaraba «0 omitidos»
ocultando un paso que no hizo nada. Nuevo `_pasoLote(destino, etiqueta, fn)` compara el número de
escritos antes y después y registra la omisión. Los 7 pasos de ambos orquestadores pasan por él.

Ahora el manifiesto dice la verdad: `3 generados · 1 omitido — «el exportador terminó sin escribir
ningún archivo»`. (Esa omisión concreta es límite del montaje de prueba: las caras se construyeron
a mano y no quedaron registradas en `analisisMorfologicos.objetos`, donde ese exportador las busca.)

### 11.9 — `currentAnalyzedObject`: una sola fuente (2026-09-13)

El arreglo resultó ser **eliminar una línea**, no añadir getters ni parches.

`analysis-core.js:137` declaraba `let currentAnalyzedObject` dentro del IIFE, y `:138` creaba
además la propiedad global. Como `visualization-export.js` es un módulo ESM donde el identificador
**no está declarado**, sus asignaciones resolvían al objeto global — nunca a ese `let`. Dos
variables con el mismo nombre y distinto contenido.

Quitando el `let`, el identificador resuelve **dentro del IIFE a esa misma propiedad global**:
un único binding compartido por el IIFE y por los módulos. Funciona porque `analysis-core.js` es
un módulo (modo estricto) y en modo estricto sí es legal asignar a una propiedad global que **ya
existe** — de ahí que la declaración de `:138` deba ir antes de cualquier uso.

Retirados los dos parches que compensaban la divergencia: la alineación que había añadido el
orquestador del lote, y el comentario del modal de P/H (`~:41329`), cuya auto-asignación se
conserva por inocua.

**Verificado en Electron:** arranque sin errores de renderer (un `ReferenceError` aquí sería
fatal), y el lote produciendo sus **7 archivos con 0 omitidos**. La prueba decisiva es el PDF
integral: lee el identificador *bare* y ya no recibe ninguna ayuda de alineación, así que sólo
puede aterrizar si el binding es realmente único. Con ello, los exportadores individuales que
leen ese identificador —el botón «PDF — Reporte integral» entre ellos— dejan de salir en vacío en
el flujo IA/pestañas.

---

## 12. Flujo de análisis: alinear guardado y exportación (2026-09-13)

Al preparar el PR salieron dos comprobaciones que invalidaban la premisa de partida
(«una carpeta hermana de la del análisis»).

### 12.1 — El guardado de un análisis automático estaba roto

`project-manager.js:410` hacía `analysis.data?.id?.replace(...)`, y `data.id` es `obj.id`:
**numérico** en detección automática. El `?.` no protege —`1` es *truthy*— así que `1?.replace`
lanzaba `TypeError`, lo tragaba el `try/catch` de `saveAnalysisFiles` y el guardado salía como
«Error al guardar archivos». Mismo defecto sistémico del §11.3, pero en la ruta de **guardado**,
que no se había tocado. **Corregido con `String(...)`.**

### 12.2 — Las dos carpetas no eran hermanas

El ID arqueológico **no se persistía en ninguna parte**: `_baseNombreAnalisis` lo leía del
formulario y `saveAnalysisFiles` lo derivaba de `obj.id`. Dos fuentes para el mismo dato, con
resultados distintos: el análisis habría caído en `<proyecto>/1/` y sus exportables en
`<proyecto>/resultados/QP1_U1_N1_E1_01/`.

**Solución — sellar el ID en el objeto.** Campo nuevo y **aditivo** `obj.idArqueologico`:

1. `_baseNombreAnalisis` lo usa como fuente preferente; si no existe, lo calcula del formulario
   y lo **sella** en el objeto. A partir de ahí deja de depender del estado vivo — cierra la
   salvedad del §11.7.
2. `guardarAnalisisMorfologico` lo persiste en `datosAnalisis`, de donde llega a `metadata.json`.
3. `saveAnalysisFiles` lo prefiere sobre `data.id` para nombrar la carpeta del análisis.

Deliberadamente **no** reescribe `obj.id`: eso es ADR-008 C2, diferido por riesgo alto (`id` es
clave viva de join en ~17 `find(o => o.id === ...)`). Esto captura el beneficio con riesgo
cercano a cero, y si algún día se aborda C2, `_baseNombreAnalisis` sigue siendo el único sitio.

### 12.3 — Verificado en Electron

```
<proyecto>/
├── QP1_U1_N1_E1_01/          ← datos del análisis  (metadata, métricas, geometría, imagenes/)
│   └── imagenes/
└── resultados/
    └── QP1_U1_N1_E1_01/      ← exportables        (7 archivos + manifiesto)
```

Nombres **idénticos**: ahora sí son hermanas. `collection_index.json` registra
`carpeta: QP1_U1_N1_E1_01`. El guardado completó («Análisis 1 guardado») con 0 errores de
renderer — antes fallaba. 5 comprobaciones del sellado en la sección I de
`tests/test_bifacial_export.js`.

### 12.4 — Pendientes propuestos y no abordados

- **P3 · invertir el orden del flujo:** hoy exportar sólo funciona ANTES de «Guardar y Finalizar»,
  que además anula `currentAnalyzedObject`; si se guarda primero se pierde la exportación sin
  reabrir el análisis. Que ese botón guarde → exporte → cierre, con casilla recordada.
- **P4 · chip «listo para exportar»** en la cabecera de Análisis (`.laar-chip`): *EFA pendiente* ·
  *P/H sin decidir* · *listo*. Hoy nada avisa antes; el manifiesto sólo lo registra después.

---

## 13. Resumen ejecutivo

| Pregunta | Respuesta |
|---|---|
| ¿Se puede exportar todos los formatos con una acción? | **Sí.** La generación ya está desacoplada del guardado; solo hay 4 puntos de escritura que parametrizar. |
| ¿Se puede dirigir a una carpeta hermana de resultados? | **Sí.** `ensureFolder` + `saveFile` ya existen por IPC y por Python; el patrón ya está implementado en `saveObj3dJsonIndependent()`. |
| ¿Hace falta IPC, librerías o dependencias nuevas? | **No.** Ni ZIP, ni `fs` en el renderer, ni npm. |
| ¿Hace falta tocar la lógica de cálculo? | **No.** Ni métricas, ni contorno, ni P/H. |
| Riesgo principal | Orden de ejecución: el PDF re-renderiza y restaura el canvas de forma asíncrona. PNG/SVG deben ir antes. |
| Restricción heredada | Todo lo que se escriba debe quedar bajo `os.homedir()` (`_assertSafePath`). |
| ¿La comparación bifacial entra en el mismo proceso? | **Sí, pero como segundo orquestador.** Es del *par*, no de la cara, y sólo existe tras guardar la 2ª cara. Engancha en el `return true` de `_abrirComparacionBifacialSiCompleto()` (§8.2). |
| Carpeta hermana, ¿de verdad? | ✅ **Sí desde el 2026-09-13 (§12).** Hasta entonces el análisis iba a `<proyecto>/1/` y los exportables a `resultados/QP1_.../`. Sellando el ID arqueológico en el objeto, ambas rutas derivan del mismo dato. De paso se arregló que **guardar un análisis automático fallaba** (§12.1). |
| Bloqueante previo al bifacial | ✅ **Resuelto el 2026-09-12.** El IMC (global, CI, CMS, 5 sub-scores con peso, rasgos divergentes) llega ya al CSV vivo, y los tres exportables del par comparten un id derivado de las caras. 31 comprobaciones en `npm run test:js` (§8.5). |
| ¿TPS y EFA (contorno + P/H) entran? | **Sí, y es la rama más fácil de cablear** — pero exige `await currentAnalyzedObject.efaPromise` antes de exportar (§9.2), o salen carpetas vacías en silencio. |
| Bloqueante previo al TPS/EFA | ✅ **Resuelto el 2026-09-12.** El TPS emite `SCALE=`/`IMAGE=` estándar (y calla en vez de mentir cuando no hay escala); el CSV de EFA pasa de 5 a 11 columnas + bloque de metadatos con `scale_factor`. 30 comprobaciones en `npm run test:js` (§9.3). |
| ¿Y las P/H candidatas de ADR-009? | Quedan fuera **por diseño**: sin confirmar no tienen `metricas` ni `_efa_data`. El invariante «la detección propone, el humano dispone» se mantiene en la exportación. |
| ¿Verificado en Electron? | **Sí, §10.** App real + backend Python real + archivos reales en disco. TPS/EFA verificado end-to-end (contorno y P/H): aplicar `SCALE` devuelve las dimensiones reales con **0,00 % / 0,61 %** de error. Bifacial verificado hasta el diálogo nativo, que no es automatizable. |
| ⚠️ Hallazgo fuera de encargo | Un `TypeError` **preexistente** tumbaba el panel morfológico entero. ✅ Corregido en los dos niveles: guarda defensiva en el render (§10.4) y, en el productor, el fallback de `analysis-core.js:12060` — el único de los **cinco** productores de `_forma_idealizada` que incumplía el contrato (§10.6). Verificado en Electron. |
| ¿Exportación en lote implementada? | **Sí, §11.** Un clic → 7 archivos + manifiesto en `<proyecto>/resultados/<ID>/`, **todos con el ID arqueológico** (§11.7). Verificado en Electron con PDF, SVG, PNG, CSV y landmarks reales en disco. |
| ⚠️ Defecto sistémico destapado | `obj.id` es **numérico** en detección automática y 6 sitios asumían cadena: **el PDF integral y el SVG fallaban también al exportarlos uno a uno** (§11.3). Corregido. |
| Lote bifacial | ✅ **Verificado E2E (§11.8)** con IMC real 98,9 %. Destapó `imageTimeout: 0` (espera INDEFINIDA) que colgaba el PDF: corregido + topes en tres capas. |
| Trampa de ámbito | ✅ **Resuelta (§11.9):** `currentAnalyzedObject` pasa a ser un único binding eliminando el `let` del IIFE. Los dos parches que compensaban la divergencia, retirados. |
| Código muerto | ✅ **Eliminado (Fase 0):** −4.263 líneas en 10 funciones + `js/export-manager.js` completo, con verificación de cero llamadores y arranque en Electron (§3.1). |
