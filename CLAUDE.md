# MAO Plus — Codebase Index

MAO Plus is an Electron desktop application for archaeological morphometric analysis of stone tools.
It processes images to extract contours, classify shapes, and compute typological metrics.
Backend: FastAPI (Python 3.9, port 8765). Frontend: Electron + ES6 modules.

## 🎯 Sesión 2026-09-20 (b) — ADR-021 verificado en Electron: panel EFA y casilla TPS

Cierra el único pendiente visual que quedaba de la integración. Arnés nuevo
`tools/verificacion_adr021_electron.mjs` (mismo patrón que `verificacion_visual_electron.mjs`:
Electron por CDP + hook `__maoE2E` de ADR-010). **19/19 comprobaciones, 0 errores de consola.**

**(A) Panel EFA de la ventana de detección asistida** — con `sintetico_fragmento_disco.png`:
`window.MaoInteropGMM` cargado (`N_SEMILANDMARKS=64`), sección «EFA (Fourier Eliptico)» renderizada,
armónicos 20, h95/h99 = 2/3, power spectrum, **«Semilandmarks TPS: 64»** (el valor que ADR-021
cambió: antes eran 32 equidistantes desde `pts[0]`) y botón «Exportar semilandmarks TPS» presente y
clicable. El bloque que produce ese botón: `LM=64`, 64 pares de coordenadas finitas, `SCALE=`, y un
`COMMENT=` que documenta inicio, sentido y **origen arriba-izquierda con y hacia abajo** — es decir,
el eje y del TPS está declarado en el propio archivo, no silenciado.

**(B) Casilla «TPS — Contornos de la colección» (`#excFmtTps`)** — presente en el modal de
exportación con su descripción («Un espécimen por pieza: 64 semilandmarks + curveslide.csv»),
**desmarcada por defecto** (opt-in: no altera exportaciones previas), se deja marcar y el resumen del
pie reacciona: «3 objetos · 3 formatos» → «3 objetos · 4 formatos». Probado contra una colección real
del usuario (3 análisis). La escritura del `.tps` y del `curveslide.csv` ya la cubre
`tests/test_export_lote.js`; lo que faltaba era exactamente esta capa de interfaz.

⚠ **Trampa del arnés, no de la app.** Tras detectar, la vista por defecto de la ventana es el
**lienzo**; `#maoIaViewTable` es el CONTENEDOR (`display:none`), no el conmutador. Quien cambia de
vista es la pestaña `[data-tab="table"]`. Sin ese clic el botón de métricas mide 0×0 y parece un
defecto de interfaz: no lo es. Segunda trampa: `_showMaoMetrics` compara `object_id === id` y el
`onclick` pasa un NÚMERO; leer el id del atributo da una cadena y no encuentra nada.

**Higiene:** `package-lock.json` seguía declarando `1.2.0` mientras `package.json` ya iba por `1.3.1`
desde ADR-021 — `npm install` lo sincronizó. `verificacion-visual/` (capturas) pasa a `.gitignore`.

## 🎯 Sesión 2026-09-20 — Integración de ramas: una sola línea de código (rama `integracion/v1.3.1`)

Consolidación de las ramas dispersas en una única versión. Punto de partida: `38186f2`
(`claude/mao-plus-math-engine-verify-c8c8fd`), que ya contenía **28 de las 32 referencias** del
repositorio —`main`, `origin/main`, los `respaldo/*`, ADR-017/018/019/022, el fix de escala y el
menú «Exportar colección…»—. Solo 4 ramas tenían trabajo único, de 1 commit cada una:

| Rama | Decisión |
|------|----------|
| `claude/mao-plus-academic-description-3daf8a` | ✅ integrada (merge limpio) — `docs/MAO-PLUS-DESCRIPCION-ACADEMICA.md` |
| `claude/quizzical-cannon-452596` | ✅ integrada — retira `ultralytics` y el pin de `opencv-python` |
| `claude/interop-tps-efa` | ✅ integrada — **ADR-021 / 1.3.1**, TPS y EFA interoperables |
| `feat/header-variante-a` | ⏸ **archivada, no integrada** — parte de una base del 2026-07-19, anterior a la armonización de cabeceras de ADR-005; su `index.html` y su CSS revierten el lenguaje LAAR vigente. La rama se conserva por si el diseño se retoma |

**Conflictos y cómo se resolvieron** (5 en total, todos en el merge de ADR-021 salvo el primero):
- `python/modules/sam_segmenter.py` — se conserva la terminología de ADR-022 y se incorpora la
  advertencia sobre `ultralytics` de la rama, reescrita en ese mismo lenguaje.
- `js/mao-ia.js` — gana ADR-021. El código ya fusionado alrededor del conflicto llama a
  `_semilandmarksIA()` y `MaoInteropGMM.bloqueTPS()`; el bloque de HEAD habría quedado muerto y con
  `_buildTpsText` partido a la mitad.
- `index.html` — gana HEAD (comentarios en terminología ADR-022) **más** el bump de caché: los 7
  `<script>` cuyo contenido cambió al integrar pasan a `?v=20260920a`.
- `docs/ESTADO-ADRS.md` — fila 019 de HEAD, fila 021 adaptada a la terminología y con su commit de
  integración, fila 022 de HEAD; la nota de renumeración deja de decir que ADR-021 está fuera.
- `CLAUDE.md` — se conservan las dos entradas de sesión, 2026-09-19 sobre 2026-09-18.

**Verificado:** `npm test` completo y verde (`EXIT=0`) — ESM **17/17**, contratos `window.*`
**36/36**, pytest **655 passed / 0 skipped** (la punta traía 598 y ADR-021 aportó sus 57).

**Higiene:** `python/models/` pasa a `.gitignore` — lo genera `sam_segmenter.download_models` en
tiempo de ejecución (el `.pt` ya caía en `*.pt`; faltaba el `README.md` que escribe el propio código).

**Pendiente:** verificación visual en Electron de lo que ADR-021 dejó anotado (casilla TPS de la
ventana de detección y panel EFA) — ninguna de las dos la cubre `npm test`.

## 🎯 Sesión 2026-09-19 — ADR-022: «detección asistida» sustituye a la sigla IA

⚠️ **Convención vigente.** El modo de detección que la interfaz llamaba «IA», «MAO IA», «AIA» o
«Analizar con IA» se llama **detección asistida**: el operador fija los parámetros de umbralización
y revisa objeto a objeto. **Ningún modo de detección usa un modelo entrenado** (OpenCV clásico). En
texto nuevo —interfaz, CSV/PDF, guías, glosario, avisos, logs— **no usar la sigla**; solo citarla
entre comillas angulares («IA») para explicar la historia. «Inteligencia artificial» se reserva para
un modelo entrenado nombrado (hoy solo MobileSAM, que ningún modo invoca). Las entradas de sesiones
anteriores de este archivo usan «IA» en ese sentido histórico. Doc: `docs/ADR-022-deteccion-asistida.md`.

- **Por qué.** La sigla tenía tres lecturas (inteligencia artificial en las guías, «Identificación
  Automatizada» en ADR-018, «Imagen Asistida» para JFRR) y rotulaba **cinco** cosas, ninguna neuronal:
  la ventana de detección, la detección de P/H por malla, el clasificador tipológico por reglas («IA
  Fase 2»), GrabCut («GrabCut AI») y un panel de MobileSAM que se decía usado por «Analizar con IA»
  (falso: `analizarObjetoConIA` no tiene llamadores). Había errores de contenido en las guías
  (PRINCIPIOS §XV: «Segmentación por modelo SAM/YOLO»).
- **Qué cambió.** Stepper «Detección asistida» + botón «Abrir…» (el número del paso lo pone un contador
  CSS); cabecera de la ventana; `METODO_LABEL.ia` = «Detección asistida (parámetros fijados por el
  operador)»; CSV › Detección: **2 columnas renombradas** —«Umbralización (detección asistida)» y
  «Descriptores precalculados (detección asistida)»—; `analysis_method` nuevo = «Detección asistida»
  (`fuenteAnalisis` sigue leyendo «MAO IA — Detección automática»); P/H «⊞ Detección por malla» +
  «Perfil de tamaño»; tipología «clasificador por reglas»; «GrabCut (clásico)» / «MobileSAM (red
  neuronal)»; CSV de colección con rótulo legible en vez del enum crudo. Guías, glosario (convenciones
  nuevas `deteccion_asistida` e `inteligencia_artificial`; `sigla_ia`/`sigla_aia` → retiradas),
  memoria matemática y docs vivos reescritos; ADR anteriores, auditorías y notas de versión solo anotados.
- **Qué NO cambió (a propósito).** Identificadores internos: `mao-ia.js`, `mao_ia_analyzer.py`,
  `/api/mao-ia`, ids `maoIa*`/`stepIA`, enum `ia`, claves `ia_*`/`mao_ia`, marcas `_fromIA` y
  `_samSegmented` (esta última **no** implica SAM). Están persistidos o son contrato front↔back.
- **Enforcement.** `python/tests/test_terminologia_deteccion_asistida.py` (6): texto visible de
  `index.html`, todas las cadenas de `js/` (léxico mínimo que ignora comentarios y regex), cadenas de
  Python no-docstring, guías y glosario generado. Regla: la sigla solo **citada**. Además
  `test_glosario.py` (pruebas 8-9 reescritas) y `test_procedencia_analisis.py` (cadena nueva → `ia`).
  **Suite: 598 passed** · `npm test` verde.
- **Verificado en Electron (macOS, 2026-09-19)** por CDP con `sintetico_pegados.png`: stepper «3 ·
  Detección asistida · Abrir…», cabecera nueva, 2 objetos separados por watershed con confianza alta,
  envío al análisis con las filas de procedencia nuevas, 0 errores de consola.
- **Fuera de alcance, registrado en ADR-022:** código muerto de MobileSAM; los objetos re-detectados en
  el panel de refinamiento pierden `ia_threshold_method`/`ia_segmentador`/`ia_params`.
- **Caché:** `?v=20260919a` en los 12 `<script>`/`<link>` tocados.

---

## 🎯 Sesión 2026-09-18 — MAO Plus 1.3.1: ADR-021, exportaciones TPS y EFA interoperables

**Nota de versión:** `docs/NOTA-VERSION-1.3.1.md` (🟠 cambian valores exportados) · **ADR:**
`docs/ADR-021-interoperabilidad-tps-efa.md` · rama `claude/interop-tps-efa` sobre `fe84b9d`, **integrada el 2026-09-20**.

Dos defectos que abrían sin error en el programa de destino y daban resultados equivocados:
- **TPS sin correspondencia.** Los «semi-landmarks» eran equidistantes desde `pts[0]` + curvatura
  máxima AÑADIDA AL FINAL: copias exactas de la misma forma daban Procrustes 0,38–1,41 y `LM=` 30–32
  (geomorph no lee eso). Ahora **64 semilandmarks** equidistantes en orden de contorno, inicio en el
  extremo del eje mayor del 1er armónico (θ₁ de la EFA) elegido por **asimetría** (eje menor si la
  forma es una «D»: disco partido), sentido antihorario, `curveslide.csv` con el convenio de geomorph
  (punto 1 fijo). Retirado `landmarks.tps` (contorno + P/H como especímenes del MISMO archivo); nuevo
  «TPS — Contornos de la colección». Curvatura = ayuda visual en CSV, nunca TPS.
- **EFA en el convenio interno.** Los 3 CSV exportaban coeficientes MAO (desfasados 90°), uno rotulado
  «Kuhl & Giardina». Ahora `/api/efa` añade `coefficients_kg`/`coefficients_raw_kg`/
  `coefficient_convention` (= pyefd/Momocs a ~1e-13) y los CSV exportan `*_kg` + `*_mao`.
  **Descriptor interno intacto** (guardia con valores de 1.3.0).

**Fuente única nueva:** `js/mao-interop-gmm.js` (`window.MaoInteropGMM`, script clásico cargado antes
de project-manager/analysis-core). Tres generadores de TPS y tres de CSV EFA pasaban por caminos
distintos; ahora todos por aquí.

⚠️ **Hallazgos:**
- **O-28 · ambigüedad de 180° de θ₁** (también en pyefd/Momocs): la misma pieza con otro punto de
  inicio da `d_EFD` 0,589 («moderadamente distintas»). `test_invariance_start_point` usa una ELIPSE
  (sin armónicos pares) y no podía verlo. Afecta a `efa.compare`/APS y a los coeficientes medios 3D;
  no al espectro. **Pendiente de ADR** (cambia el descriptor → recalcular bancos).
- **La «isometría» de O-16 era falsa en general**: el residuo MAO↔K&G depende de la rama de θ₁
  (hasta 0,31 en `d_EFD`). Corregido en `efa.py`, memoria §6.2 y aquí abajo.
- `enrichCollection` pedía el EFA retroactivo con `{ n_harmonics: 40 }`: el puente espera
  `nHarmonics`/`scalePxMm` → salía en píxeles y el CSV decía «1 mm/px». Corregido.
- `geomorph::readland.tps` sólo aplica `SCALE=` si **todos** los especímenes la traen, y no tiene
  argumento `scale` (un comentario del código lo citaba). El TPS de colección avisa si hay mezcla.

**Verificado:** pytest **592 → 649 / 0 skipped** (línea base re-ejecutada en el mismo entorno) ·
`npm run test:js` verde · ESM 17/17 · cada test nuevo falla contra `fe84b9d` por contenido. Referencia
K&G escrita aparte en los tests; `pyefd` NO está en el `.venv` (el test lo usa si se instala).
Contornos reales de OpenCV a 24 rotaciones: d ≤ 0,012 (lisas), ≤ 0,031 (fragmentos en «D»).
**Verificado en Electron el 2026-09-20** (`tools/verificacion_adr021_electron.mjs`, 19/19, 0 errores
de consola): panel EFA y casilla TPS — ver la entrada de esa sesión arriba. **Pendiente:** O-28
(ambigüedad de 180° de θ₁, requiere ADR con recálculo de bancos).

## 🎯 Sesión 2026-09-15 — MAO Plus 1.3.0: consolidación + verificación independiente del motor

**Nota de versión (léase antes de comparar exportaciones con 1.2):** `docs/NOTA-VERSION-1.3.0.md`.

Las mejoras vivían en **tres líneas divergentes** (`main` local `3043246`, `limpieza`/`fix/exportaciones`
`7b79cef` —la única que arrancaba el lanzador— y `origin/main` `450fc41` —sólo verificada en Linux—) más
el respaldo del glosario `e51632c`. Consolidadas en `claude/mao-plus-math-engine-verify-c8c8fd`
(`a0a8eb7` glosario · `8cab990` limpieza · `476f1fa` origin/main). **Numeración:** ADR-017 = plantillas
(publicado) · ADR-018 = glosario · **ADR-019 = procedencia de detección** (antes «ADR-017» local) ·
ADR-020 reservado para O-1. El `/Applications/MAO Plus.app` es del **2026-06-03**: no contiene nada de esto.

**Verificación contra referencias externas, no contra los tests del autor** — halló y corrigió:
O-24 ICC(3,1) publicado como ICC(2,1) (Shrout & Fleiss Tabla 2) · IC del arnés F4 de consistencia
(cobertura 14 %) · O-25 IC bootstrap del CV al 72–88 % → Vangel · O-20 incompleto: el χ² es asintótico y con
n ≤ 30 no marcaba nada → Beta de Wilks (Python + JS con pseudo-inversa) · O-27 k₁ «línea recta» en px⁻¹ ·
O-26 el endpoint `/api/shape-match` pisaba los umbrales calibrados de F4. **Pendiente de ADR: O-23** — el
presupuesto óptico es desplazamiento de posición; una longitud radial yerra 3× más y el área 2× (memoria §2.2).

**Conduciendo la app Electron real (CDP)** se destaparon fallos que ningún test veía: la ruta Python
sustituía el contorno canónico por el polígono idealizado (713 → 101 pts) y el botón de plantilla decía
«sin forma ideal» por un `null`; y 12 ReferenceError silenciosos (Nuevo análisis abortaba a mitad,
`window.toast` inexistente, GPA de Procrustes, Excel bifacial, SVG con P/H, PDF desde el visor…).
Tras corregir: disco 70 % → **70,17 %** por el botón · anillo → 60,33 % · Zhang = OpenCV · 0 excepciones.

⚠️ **Gotchas nuevos:**
- **ESM: la query forma parte de la identidad del módulo.** `utility-helpers.js?v=…` en un import y
  `./utility-helpers.js` en otro = dos instancias con estado separado. Sin `?v=` en los `import`
  (el protocolo `app://` ya sirve `no-cache`); `test_version_unica.py` lo vigila. En `index.html` sí.
- **`const X` en script clásico no crea `window.X`.** Quien lea `window.toast` no lo encuentra.
- **`calcularMetricasMorfologicas(obj)` MUTA `obj`** (puede reemplazar `contour_points` por la forma
  idealizada). Para cosechar `_forma_idealizada` desde otra ruta, usar `metricasJSSinPisarContorno`.
- **Guardas `typeof f === 'function'` sobre nombres que viven en OTRO script** son siempre falsas: la
  función nunca corre. Buscar con `node verif/undef_names` (TS2304) — ver método abajo.
- **Versión única:** `js/mao-version.js` (`window.MAO_VERSION`), fijada contra `package.json`.
- **`calcularEscala()` es procedimiento Y valor.** Hasta 1.3.0 no devolvía nada y `calcularEscala() || 1`
  guardaba 1 mm/px en `geometria.json` y P/H en px. Para el factor de un análisis GUARDADO usar
  `factorMmPxDeAnalisis()` (métricas primero): los `geometria.json` antiguos siguen con escala 1.
- **Las escrituras IPC sólo se aceptan bajo `$HOME`** (`_assertSafePath` en `main.js`). Un proyecto de
  prueba en `/tmp` falla en silencio para la UI (colección vacía); usar `~/Library/Caches/<algo>`.

**Menú «Exportar colección…»** (Resultados, integrado desde el respaldo `ee0d38d`): un solo motor,
`projectManager.enrichCollection(options)` — `objetos`, `formatos`, `exportDir`, `recalcular`. Con
`options={}` es exactamente «Actualizar colección». Verificado en Electron: 2 piezas → 13 archivos
(PDF, EFA, PNG×3, SVG, CSV) sin tocar `metricas.json`; selección de 1 + recálculo reescribe sólo esa.

**Método reproducible de verificación en Electron sin pisar otra instancia:** copia con
`git archive`, puerto del backend cambiado en los 7 archivos que lo citan (verificar que el diff sólo
toca el número), `--user-data-dir` propio y `--remote-debugging-port`; conducir con el `WebSocket`
nativo de Node 24 y los ganchos `__maoE2E`/`__maoForma`. ⚠ `main.js` **reutiliza cualquier backend MAO
que ya escuche en 8765**: una segunda copia en el mismo puerto habla con el backend de la primera.

## 🎯 Sesión 2026-09-13 (d) — Memoria matemática para revisión externa + O-16/O-20

Encargo: un documento que explique la matemática del motor a un **revisor externo**, con
glosario de métricas y fuentes citadas. Escribirlo obligó a leer cada fórmula contra su
implementación, y de ahí salieron tres defectos. **Dos corregidos aquí** (commit `c0e9ca6`).

**`docs/MEMORIA-MATEMATICA-MAO-PLUS.md`** — 14 secciones + 2 anexos. Página publicada para
el revisor: https://claude.ai/code/artifact/e1d888e8-99b8-469a-8d51-0fade4904eef

Tres decisiones de forma que conviene mantener si se amplía:
- **Cada fórmula lleva su `archivo:línea`** (Anexo B). La doc es contrastable contra el
  código, no contra la intención. Al tocar `metrics.py`/`efa.py`/`comparator.py`, revisar
  el Anexo B — ya se desfasó una vez con ADR-017 F0.
- **Tres etiquetas explícitas**: método canónico de la literatura · **⚙ convención MAO**
  (cambia el número respecto de la práctica estándar) · **⚠ heurística calibrada** (nunca
  presentada como probabilidad).
- **§13 = 22 observaciones** con severidad, remedio y el ADR que las sigue. Es el índice de
  deuda matemática; al cerrar una, marcarla ahí.

### Los tres hallazgos

| | Qué | Estado |
|---|---|---|
| **O-16** | Los coeficientes EFD están **desfasados 90°** respecto de Kuhl & Giardina | ✅ corregido |
| **O-20** | Umbral de atípicos de Mahalanobis fijado para `p=2`, aplicado en dimensión `p` | ✅ corregido |
| **O-1** | La escala usa `s = p·d/f` (campo lejano) en vez de `p·(d−f)/f` | ⏸ requiere ADR-020 |
| (O-7) | Signo invertido de la pérdida de perímetro | ✅ lo arregló ADR-017 F0 en paralelo, mismo remedio |

### O-16 · síntesis EFA — `python/modules/efa.py`

**El descriptor no se ha tocado.** `_efd_raw` almacena `a_k(MAO)=b_k(K&G)`, `b_k(MAO)=−a_k(K&G)`
(ídem c,d). ⚠ **Corregido el 2026-09-18 (ADR-021):** lo que sigue decía que tras normalizar el
residuo era una transformación ortogonal FIJA y el morfoespacio isométrico al canónico (medido
1,7e-16 sobre 15 pares). Es falso en general: el residuo depende de la rama de θ₁ y las `d_EFD`
difieren hasta 0,31; la medición cayó en formas con la misma rama. Espectros sí idénticos. Y la
invariancia al punto de inicio sólo vale módulo 180° (O-28).

Lo que fallaba era la **síntesis**: `_reconstruct_contour` aplicaba la fórmula canónica
`x=Σ(a·cos+b·sin)` sobre coeficientes que no están en ese convenio → curva sistemáticamente
**más redondeada**. Sobre una forma de tres lóbulos: circularidad **0,8586 vs 0,7061** real
(21,6 % de error); tras el arreglo, 0,15 %.

- **El convenio queda documentado en la cabecera del módulo.** Leerlo antes de tocar nada
  ahí. `coefficients` **no es intercambiable con Momocs/pyefd**; desde 1.3.1 para eso están
  `coefficients_kg`/`coefficients_raw_kg`, que es lo que exportan los CSV (ADR-021).
- **Alcance real, mayor de lo que parecía:** además de la superposición visual y del
  «contorno típico» 3D, **ADR-017 F2 publicó `efa.reconstruct()` —que delega en esta misma
  función— como generador del repertorio de plantillas** (`shape_template.py:791`). Las
  formas ideales del banco se generaban más redondeadas que la forma que codifican sus
  coeficientes.
- **NO afecta a `js/procrustes.js`**, que compara contornos reconstruidos: verificado
  Δ ≤ 3,3e-16 sobre seis pares. Es demostrable — `Φᵀ Φ = (n/2)·I` deja invariante la matriz
  de productos cruzados ante una rotación de fase fija.
- **Por qué no se detectó:** `test_efa.py` cubría exhaustivamente el descriptor pero **nadie
  contrastaba la curva sintetizada contra la forma de entrada**. Añadido `TestReconstruccion`
  (3) con magnitudes invariantes a semejanza —circularidad 2 %, ratio de Feret 5 %— porque
  `contour_reconstructed` viene de los coeficientes normalizados.
- **Abierto:** adoptar el convenio canónico en `_efd_raw` exigiría **recalcular el banco EFA
  entero** (viejos y nuevos no se mezclan). Sólo si se publica la matriz de coeficientes.

### O-20 · umbral de atípicos — `comparator.py` + espejo `js/comparator.js`

El umbral era la constante **2,716 = √χ²(2; 0,975)** — correcta sólo en 2D, heredada de
cuando la distancia se calculaba sobre PC1+PC2 (`mahalanobisDistances2D`) — aplicada a
distancias de **p** dimensiones. Sobre gaussianas **sin ningún atípico**: marcaba el **67 %**
con p=10 y el **100 %** con p=30.

- Ahora se deriva en ejecución: `√χ²(0,975; r)` con **r = rango de la covarianza empleada**
  (`_outlier_threshold`; `_mahalanobis_distances` devuelve los gl efectivos). Fracción
  marcada **70 % → 2 %** (nominal 2,5 %).
- **Segundo defecto del mismo bloque:** con `n ≤ p+1` la covarianza se satura y, con
  pseudo-inversa, **todas las distancias colapsan a (n−1)/√n** — el estadístico no discrimina.
  Se declara: `outlier_status="no_evaluable_pocos_objetos"`, lista vacía, umbral `null`
  (**doctrina ADR-017 F0**). La respuesta expone `mahalanobis_df` y `outlier_threshold` para
  que el criterio quede auditable en el informe.
- **Gotcha de duplicados, otra vez:** `mahalanobisDistancesZ` (js) arrastraba el mismo 2,716
  con estimador diagonal. Corregido con cuantil por **Wilson-Hilferty** (error < 1 % para
  df ≥ 2, sin dependencias). Los rótulos dejan de decir «>2.716σ» —que además no eran
  sigmas— y el badge dice «sin evaluar» en vez de callar. Cache-bust `comparator.js?v=20260913a`.

### O-1 · escala en campo lejano — **NO tocado a propósito**

Sesgo sistemático multiplicativo **f/(d−f)**: 20 % con f=50/d=300 (el propio caso de
`test_scale_px_mm_formula`), 25 % con f=100/d=500, 100 % en macro 1:1.

- **No contamina el estudio de estandarización:** el CV es invariante a un factor
  multiplicativo constante, y **nada adimensional cambia**. Sólo se desplazan las medias en
  mm. ⚠ Salvedad: si las piezas se fotografiaron a distancias distintas, el factor deja de
  ser constante y sí contamina el CV.
- **Comprobación empírica sin tocar código:** los proyectos con verificación de escala
  guardan `correction_factor` y `original_error_percent`. Si O-1 es real deben agruparse en
  **1 − f/d** (0,80 para 100/500) y **f/(d−f)** (25 %), siempre **por debajo de 1**.
- **Por qué ADR-020 y no un parche:** hay que fijar antes qué significa «distancia» en el
  protocolo (objetivo→objeto ⇒ `d−f`; plano del sensor→objeto ⇒ `d−2f`) y **cambia valores ya
  exportados a CSV/PDF**. Toca `scale.py:278`, los dos espejos JS (`analysis-core.js:13156`
  y `:13434`) y el test que fija la fórmula. Mismo patrón que la nota de versión de F0.

### Otras convenciones que la memoria dejó por escrito (§5)

- **⚙ La forma canónica es la envolvente convexa:** `area`/`perimeter` son **del hull**, no
  del contorno. `area_real` ↔ `regionprops.area`. Declararlo en cualquier publicación.
- **Redundancia algebraica exacta** (§5.5, O-6/O-19): `compactness ≡ circularity`,
  `shape_factor = 1/c`, `indice_lobularidad = c^(−1/2)`, `ICI = c_frag^(−1/2)`,
  `concavidad_area = 100(1−solidez)`, `bounding_box_efficiency ≡ rectangularity`,
  `anisotropy = 1 − circularity_proxy`, `compactness_3d = Ψ_Wadell³`. **Meterlas juntas en un
  PCA infla PC1** — es la brecha C2 de ADR-015.

- **Verificado:** **suite 398 passed / 2 skipped** (antes de esta sesión, 391/2 en este mismo
  contenedor) · `node --check` en `comparator.js` + los 11 módulos ES · los dos gates muerden
  sobre el código anterior (21,6 % y 70 %) · Procrustes sin regresión.
- ⚠ **Los conteos de suite NO son comparables entre contenedores**: aquí 398/2 (los 2 omitidos
  son los módulos de paridad `MAO_A`), mientras la entrada (c) reporta 372/4 desde otro
  contenedor con distintas dependencias opcionales. **Comparar deltas, no absolutos.**
- **Pendiente:** verificación visual en Electron de los rótulos del comparador (`node --check`
  no ve layout) · ADR-020 para O-1 · estimador robusto (MCD / Ledoit-Wolf) para `n < 3p`.
## 🎯 Sesión 2026-09-14 (b) — ADR-017 F6: plantilla ANILLO (corona circular)

**La primera plantilla que no sale del banco sino del material**: dos fotos reales de La Draga
—una cuenta discoidal perforada íntegra y un fragmento de cuenta anular roto por el orificio—.
El segundo caso el círculo NO puede explicarlo: se queda con el margen exterior y manda el
borde de la perforación al saco de la fractura, hundiendo el soporte bajo el umbral.

- **Modelo:** dos circunferencias **concéntricas**, `R` y `r`. La concentricidad es deliberada
  (es la forma ideal); dejar el 2º centro suelto le permitiría amoldarse a cualquier fractura.
  Una perforación descentrada de verdad sale con más residuo y menos inliers — como debe verse.
- **NO va por el repertorio ICP, y es la decisión de fondo:** el ICP sólo tiene una **semejanza**
  (Umeyama: rotación, escala, traslación) y `r/R` es un parámetro de **FORMA**, no de escala.
  Una plantilla anular fija sólo emparejaría piezas con esa razón exacta → habría que registrar
  una por proporción. Por la vía analítica `r/R` se **estima del contorno**: 0,42 medido sobre
  0,423 real, y bien también en 120/30 y 140/95.
- **El 2º círculo se busca por la distancia radial al centro ya ajustado**: histograma de ancho
  = tolerancia, y las cimas se juzgan por **CONTIGÜIDAD**, no por nº de puntos — mismo criterio
  E1: el borde de una perforación es un arco contiguo; la fractura se reparte por toda la banda.
- **Anillo vs círculo se decide por SOPORTE, no por residuo.** El anillo no ajusta mejor cada
  punto: explica más puntos. Gana sólo si da cuenta de ≥15 pp más de contorno; si empata, se
  queda la forma simple (Occam sobre el eje donde este modelo aporta).
- **Medido:** 75 → **75,5** · 60 → **60,5** · 50 → **50,6** · 40 → **40,8** · 30 → **30,8** %.
  Rechaza disco íntegro, sector de disco, medio disco y rectángulo.
- **Umbral 0,60 del BANCO, no mío:** puse 0,55 por criterio y el banco mostró que aceptaba el
  **11 %** de las formas bajo el 15 % de completitud, y que 0,60 lo lleva a cero **sin coste**
  (misma cobertura 92 %, mismo MAE 0,96, mismo peor 6,3). Segundo umbral que el banco corrige.
- **Obligó a tocar el lienzo:** un anillo son **dos curvas cerradas**; sin separarlas la capa de
  F5 uniría el final de una con el principio de la otra y dibujaría un **radio inexistente**. De
  ahí `plantilla_contorno_componente` y el recorrido por componentes (cada una envuelve dentro
  de su propio rango). Gate ampliado a 25 comprobaciones, 5 de ellas del anillo.
- ⚠ **Gotcha de muestreo que costó una hora:** mi primer generador de anillos usaba el **mismo
  nº de puntos** en los dos arcos → el interior quedaba a 0,57 px de paso, más fino que el ruido
  (1,2 px), su polilínea se inflaba al doble y el ajuste elegía el círculo **INTERIOR** creyéndolo
  el exterior. Era fallo del fixture (`findContours` da paso uniforme), pero la lección general
  es: **un contorno sobremuestreado por debajo del ruido falsea cualquier criterio de longitud
  de arco** — y los de este módulo lo son.
- **Verificado en Electron real** con fixture nuevo `sintetico_anillo_fragmento.png` (60 % sobre
  fondo oscuro): medido **60,37 %**, soporte 0,854, 154/256 puntos respaldados, elegido `anillo`
  sobre círculo y elipse, 0 errores. Confirma lo que ningún test de puntos podía: que
  `contour.extract` **conserva el arco de la perforación** en un fragmento abierto (el
  `MORPH_CLOSE` no sella la boca de la C).
- **Verificado:** suite **431 passed / 4 skipped** (antes 416/4) · gate 25/25 · `node --check` ·
  py3.9 · cache-bust `?v=20260914c`. `anillo` añadida al repertorio del botón (es analítica:
  cuesta lo mismo que un círculo) y a `plantillas_disponibles()`, que hasta ahora **omitía las
  analíticas** — un selector construido desde esa lista no ofrecía ni círculo ni elipse.

## 🎯 Sesión 2026-09-14 — ADR-017 F5: la plantilla, sobre el lienzo

F3 la anotó como «lo primero de F4»; F4 acabó siendo la calibración, así que la capa visual
recibe número propio. Detalle en ADR-017 §6.6.

- **El fallo que la bloqueaba, y que no se veía:** `plantilla_contorno` lo publicaba **sólo la
  vía ICP**. Círculo y elipse —las dos que el botón usa por defecto— devolvían `None`, así que
  la capa habría quedado **muda**: nada dibujado y ningún error en consola. F5 empieza
  publicando la polilínea también desde la vía analítica (`_contorno_con_presencia`).
- **No se dibuja el contorno ideal a secas**, sino partido en dos regímenes: **continuo** donde
  el margen preservado lo respalda, **discontinuo** donde la plantilla lo reconstruye. Sin esa
  distinción, el lienzo mostraría lo medido y lo inferido con el mismo trazo — el vicio que F0
  vino a retirar, en píxeles en vez de en una columna del CSV. Convenio heredado de los
  candidatos de P/H (ADR-009): **discontinuo = hipótesis**.
- **Nueva clave paralela** `plantilla_contorno_presente: [bool,…]`, punto a punto con
  `plantilla_contorno`. Se calcula en **Python**, en cada rama con su propio parámetro (ángulo
  en la analítica, longitud de arco en el ICP) en vez de reconstruirla en JS desde los huecos
  ya redondeados: duplicar geometría en dos lenguajes es como empezó el lío de los cuatro
  estimadores de F0. **No entra al registro ADR-006**: es geometría para dibujar, no una medida.
- **Frontera:** un tramo cuenta como medido sólo si **sus dos extremos** lo están → en la
  frontera gana el trazo de hipótesis, que es el que no afirma de más.
- **Capa aislada:** pasada propia tras el bucle de objetos de `redraw()`, no dentro de sus
  ramas (`contornoReal` vs `has_real_contour`). Quitarla es borrar una línea. Color violeta
  `#7c3aed`, sin reutilizar ninguna capa existente (verde = contorno real · naranja =
  envolvente · azul = bbox · magenta = verificación de escala).
- **Casilla + leyenda** en la tarjeta §6; organizer y lienzo se hablan por evento
  (`mao:plantilla-overlay:toggle`), el mismo camino que `mao:batch-analyze:request`. Lo
  confirmado guarda **su propia copia** del contorno: leerlo del candidato vivo haría que una
  reevaluación con otro repertorio dibujara la decisión humana con otra plantilla.
- **Gate funcional propio** (`tools/adr017_gate_overlay.mjs`, 20/20): extrae el código **real**
  de `analysis-core.js` —no una copia— y lo corre contra un `ctx` de mentira que registra cada
  llamada de dibujo. `node --check` no ve si el polígono cierra ni qué tramo sale discontinuo.
- **Lo que el gate encontró:** dos expectativas **mías** mal calculadas, no del código — el
  tramo discontinuo abarca 18 puntos y no 19, y la parte respaldada sale en **dos** trazos
  porque el hueco no toca la costura del array. Anotado en el gate para que no se lea como bug.
- **Verificado:** suite **+15 tests** (401 → **416 passed / 4 skipped**) · gate 20/20 ·
  `node --check` · sintaxis 3.9 · cache-bust `?v=20260914b`.

### ✅ VERIFICACIÓN VISUAL EN ELECTRON — hecha, y ya no es «imposible»

**Se puede correr Electron en estos contenedores.** `xvfb-run` + `--remote-debugging-port` +
Playwright `connectOverCDP` + el hook `__maoE2E` de ADR-010. Receta completa, escollos y
límites honestos en **`docs/VERIFICACION-VISUAL-ELECTRON.md`**. Esto desbloquea las ~6
entradas de este archivo que terminan en «pendiente de verificación visual».

Fixture nuevo `assets/fixtures/sintetico_fragmento_disco.png`: disco al **70 % exacto** (la
cuenta circular fracturada de ADR-016 #6). Por el pipeline completo el programa midió
**70,17 %** (0,17 pp), arco 0,704, **90/128** puntos marcados como respaldados. En el lienzo:
arco discontinuo violeta cerrando el 30 % ausente, continuo sobre el margen conservado,
distinguible del verde y del naranja; la casilla lo quita sin residuo; confirmada más gruesa
que candidata. **Cero errores de consola.**

**Dos defectos ANTERIORES a F5 que sólo aparecieron al pulsar los botones de verdad:**
1. ⚠ **Las tarjetas §P/H y §6 se construían UNA sola vez.** `partition()` reparte los `<h5>`
   por las secciones en la 1ª pasada; desde entonces `findRoot()` —que los exige hermanos—
   devolvía `null` y `organize()` no volvía a llamar a los constructores. Pulsar «Evaluar
   completitud» cambiaba el chip de la cabecera (se construye ANTES de esa compuerta) y la
   tarjeta seguía ofreciendo «Evaluar»: **el botón «Confirmar» no llegaba a existir**, o sea
   que el flujo de ratificación de F3 era **inalcanzable desde la interfaz**. Arreglado con
   el marcador `.adr2-root` que deja la primera pasada.
2. **La fila «Completitud» de la tabla estaba CLAVADA** en «Sin evaluar» desde F0, y nadie
   volvió a ella al cablear F3: la tarjeta decía «70 %» y la tabla, en la misma pantalla,
   «sin evaluar». Ahora lee `metricas.plantilla_completitud` en los **dos** productores
   (duplicado IIFE de `analysis-core.js` incluido — sin él sobrevive por la ruta legacy).

**Herramienta:** `npm run verificar:visual -- --imagen <ruta>` — arranca la app, la conduce
entera (cargar → escala → identificar → detectar → analizar → emparejar), imprime los números
y deja 4 capturas. `--focal/--sensor/--apertura` para imágenes sin EXIF legible (CR3);
`--objeto N` cuando la foto trae escala o carta de color; `--mantener` deja la ventana abierta.
Única dependencia nueva: `playwright-core` (no descarga navegadores: se conecta al Electron
que ya está corriendo).

- **Pendiente:** mirarlo con una **fotografía real** (el fixture es sintético: bordes limpios,
  fondo uniforme) y en **macOS** (esto es Linux+Xvfb: no valida `hiddenInset` ni semáforos).
  Las fotos del corpus llegan al chat como imagen, no como archivo: la corrida con material
  real se hace en el Mac del usuario con la orden de arriba.

## 🎯 Sesión 2026-09-13 (e) — ADR-017 F4: los umbrales dejan de ser criterio

F1-F3 construyeron, conectaron y expusieron la completitud. F4 pregunta lo único que faltaba:
**¿los números son defendibles?** Protocolo y tablas: `docs/VALIDACION-PLANTILLAS.md`.

- **Banco de umbrales** (`tools/adr017_banco_umbrales.py`): 87 formas de completitud EXACTA
  (2 familias × 12 niveles × 3 ruidos) + 15 controles negativos. Barrido **exacto, no
  aproximado**: los umbrales se aplican *después* del ajuste → se ajusta una vez por forma y
  se reevalúa la rejilla post-hoc. Ruido determinista ⇒ reproducible.
- **Recalibrado: círculo 0,30 → 0,40 · elipse 0,45 → 0,50.** Cuesta 11 pp de cobertura y
  **ninguno de los 5 casos que deja de aceptar estaba bien medido** (errores 5,4 · 10,0 ·
  11,3 · 15,8 · **31,6 pp**). No se cambia exactitud por cobertura: se retira el **modo
  degenerado** —un círculo *pequeño* encajado en un trozo del arco— que los producía. Falsos
  positivos de forma y aceptaciones por debajo del 15 % caen **a cero**.

| ruido de contorno | 0,35/0,50 (cob · MAE · peor) | **0,40/0,50** |
|---|---|---|
| 0,5 px | 100 % · 1,73 · 10,0 | 94 % · 1,48 · 10,0 |
| 1,2 px | 100 % · 2,09 · 13,1 | 100 % · 2,09 · 13,1 |
| 2,5 px | 81 % · **5,79** · **31,6** | 62 % · **0,84** · **3,4** |

  Con segmentación pobre, el umbral bajo no cubre más: **inventa** más.

- **Hallazgo de método: el MAE ocultaba el fallo grave.** 0,35/0,50 parecía bueno (MAE 3,03)
  mientras publicaba **18 % sobre una pieza que conservaba el 50 %**. El error **máximo** es la
  columna que lo delata y se añadió al banco a mitad de fase. El residuo NO sirve para
  detectarlo (es el mismo que el de un ajuste bueno con ese ruido); sólo lo delata la fracción
  de arco, que es justo lo que filtra el umbral.
- **Corrección a lo ya escrito** (3 documentos): «rechaza por debajo de ~15 %» era **falso** con
  los umbrales de F1 — se aceptaba el **22 %** de esas formas. La medición del prototipo no era
  incorrecta; la generalización desde contornos poco ruidosos sí. Corregido en ADR-017 §4,
  `MEMORIA-MATEMATICA` §5.6 (el doc que va al revisor) y la cabecera del gate de F1.
- **Sesgo documentado:** la elipse fragmentaria se **sobreestima** cuanto menos arco queda
  (30 % → 40-43 %), por razón mecánica. Por debajo del 50 %, léase como **cota superior**.
- **Arnés para el corpus real** (`tools/adr017_calibracion_draga.py`), dos pasadas:
  `--inventario` emite la hoja de registro; `--evaluar` corre el pipeline REAL
  (`detect` → `contour.extract` → `match`) y emite **ICC(2,1) de acuerdo absoluto**,
  **Bland-Altman** + sesgo proporcional, **κ de Cohen** y la tasa de rechazo con forma visible.
  **El inventario NO escribe la respuesta de la máquina, a propósito**: si el observador la ve
  antes de anotar, lo medido deja de ser concordancia y pasa a ser anclaje.
- **Dos bugs propios en el arnés**, ambos encontrados por los tests: (1) con ajuste PERFECTO
  `se_pendiente = 0` → el contraste dividía por cero y declaraba «no significativo» el caso más
  significativo posible; (2) con acuerdo perfecto `MS_error = 0` → el IC del ICC salía `NaN`.
  Y una falsa alarma corregida: con 5 pares y residuos diminutos marcaba «sesgo proporcional
  significativo» una pendiente de −0,026 pp/pp → ahora exige ≥ 10 pares **y** deriva ≥ 5 pp.
- **Verificado:** suite **+22 tests** (+19 del arnés, +3 del módulo). Aislado: 372→394. Tras
  rebasar sobre (d): **401 passed / 4 skipped** en este contenedor — comparar el **delta**, no el
  absoluto, según el aviso de la entrada (d) ·
  banco corrido contra los nuevos defectos («ningún juego domina») · arnés probado end-to-end
  sobre corpus sintético **renderizado** (imágenes, no listas de puntos): 100,0 / 75,1 / 51,5 /
  100,0 / 51,0 con rectángulo y blob rechazados · `ast.parse(feature_version=(3,9))` en los 5
  archivos Python tocados.
- **NO hecho / bloqueado:** la corrida sobre **DRG_19-15** — el corpus vive en el Mac del
  usuario (`/Users/…/ANALISIS AGOSTO/DRG_19-15`) y estos contenedores son Linux sin acceso a él.
  Los criterios de éxito quedan declarados **antes** de ver los datos (VALIDACION §4), que es la
  única forma de que signifiquen algo. Sigue pendiente la superposición de `plantilla_contorno`
  en el lienzo (exige verificación visual en Electron) y un **segundo observador humano**, sin
  el cual no se puede separar el error del método de la variabilidad entre arqueólogos (ADR-015 A2).

## 🎯 Sesión 2026-09-13 (c) — ADR-017 F3: el cable

Antes de F3 el backend sabía calcular completitud y **nadie se la pedía**: las únicas
apariciones de `plantilla_completitud` en `js/` eran comentarios de F0. F3 conecta.

- **Registro canónico ADR-006**: 5 claves `plantilla_*` con `fuente_2d` prefijada
  `shape_match.` — mismo convenio que `texture.` para GLCM, porque **no viven en
  `/api/metrics`** (el emparejamiento se pide bajo demanda, ~200 ms por plantilla).
- **`PythonBridge.shapeTemplate.match()`** → `/api/shape-match`, con guard
  `isModuleActive('shape_template')`.
- **Tarjeta en §6** con los cuatro estados, calcados de P/H (ADR-009):

| estado | chip | significado |
|---|---|---|
| `sin-evaluar` | `--wa` | no se pidió el emparejamiento |
| `candidata` | `--wa` | hipótesis sin ratificar |
| `confirmada` | `--ok` | ratificada por un humano — **sólo esto va al CSV** |
| `sin-plantilla` | `--none` | se evaluó y no hay forma ideal: **resultado, no fallo** |

- **Persistencia**: los 4 campos (`plantillaEvaluada/Candidata/Confirmada/Descartada`)
  se escriben y releen del caché de análisis, como `phCandidatos` en ADR-009. Sin eso la
  confirmación se perdía en el siguiente render y había que volver a pagar el cálculo.
- **Repertorio del botón ACOTADO** a propósito (`circulo`, `elipse`, `triangulo`,
  `cuadrado`, `hexagono`): pedir la biblioteca entera multiplica los 200 ms por plantilla.

**Tres bugs encontrados, los tres MUDOS** — la clase propia de una fase de cableado:
código que nadie ejecuta hasta que un humano pulsa un botón.
1. **Los tres nombres de campo del contorno que escribí eran inventados**
   (`obj.contorno.points`, `obj.contourPoints`, `obj.puntos_contorno`). Los canónicos son
   `obj.contour_data.points` (real) y `obj.contour_points` (puede venir simplificado para
   dibujo). El botón habría dicho siempre «sin contorno suficiente».
2. **Argumentos de `toast` invertidos.** `MaoOrganizer.toast(kind, msg)` hace
   `window.toast[kind](msg)`; al revés evalúa `window.toast['El emparejamiento…']`, que no
   es función → **ningún aviso se habría mostrado jamás**, sin error en consola.
3. **Colisión de selector**: `set()` usa `querySelector`, y al añadir el segundo
   `.laar-chip` a la cabecera el selector sin acotar habría escrito siempre en el primero
   (el chip de P/H mostrando el estado de la forma). Ambos acotados ahora.

Los tres con test estático, más un cuarto contrato verificado end-to-end: si
`shape_template` no se anunciara en `/api/capabilities`, el guard del bridge devolvería
`null` siempre y el botón quedaría muerto sin error visible.

- **Verificado:** 15 tests de cableado · **suite 372 passed / 4 skipped** (antes 357/4) ·
  `node --check` en los 7 JS tocados · contratos window 33/33 · cache-bust `?v=20260913a`.
- **NO hecho:** superponer `plantilla_contorno` en el lienzo. El backend ya lo publica en
  coords absolutas, pero exige tocar el pipeline de render y **verificación visual en
  Electron**, imposible en estos contenedores. Es lo primero de F4.

## 🎯 Sesión 2026-09-13 (b) — ADR-017 F2: repertorio arbitrario + ICP recortado

Cierra la pregunta original: **el repertorio EFA sí sirve — como biblioteca de plantillas, no
como espacio de comparación**. `registrar_plantilla_efa()` convierte un banco de coeficientes en
plantillas vía `efa.reconstruct()`, y el **ICP recortado** hace el encaje parcial que la distancia
EFA no puede hacer.

- **TrICP** (Chetverikov et al. 2002): mínimos cuadrados recortados en todas las fases; el artículo
  lo declara aplicable a solapamientos **por debajo del 50 %**, que es justo el caso fragmento.
- **Umeyama (1991)** para la similitud en forma cerrada. Su aporte sobre Arun/Horn es no devolver
  una **reflexión** con datos corrompidos → control explícito de quiralidad (`permitir_reflexion`,
  por defecto `False`: una forma y su espejo no son la misma pieza).
- Repertorio: `circulo_icp`, `elipse_2_1`, `triangulo`, `cuadrado`, `rectangulo_2_1`, `pentagono`,
  `hexagono` + las registradas desde EFA. Endpoint `GET /api/shape-match/templates`.

**Gate del ADR — paridad analítica ↔ ICP ≤ 0,3 pp** (círculo íntegro 0,0 · disco 75 % 0,0 ·
disco 50 % 0,5 · elipse íntegra 0,0). Triángulo/cuadrado/hexágono íntegros → su plantilla al 100 %.
Un círculo **no** se acepta como triángulo.

- **Hallazgo: `efa.reconstruct()` no existía.** La cabecera de `efa.py` la declaraba exportada desde
  siempre, pero sólo estaba la privada `_reconstruct_contour`. Publicada en F2, con validación y test.
- **Dos correcciones que obligó el banco:** (1) los inliers **publicados** salen de la tolerancia
  absoluta, no del recorte ξ — ξ es interno del TrICP y escoge los *k* globalmente más cercanos, que
  quedan entreverados: el tramo contiguo salía 0,11 en un disco al 75 % bien ajustado, y con ξ alto
  el borde de fractura entraba en el residuo (10,5 px). Con la tolerancia el criterio es además el
  MISMO que el de la vía analítica, que es lo que hace comparables las rutas. (2) El recorte entra
  **desde el rastreo grueso**: sin él, un sector de hexágono al 50 % rechazaba su propia plantilla.
- **Ambigüedad de forma, medida:** medio hexágono regular **es** un triángulo equilátero truncado
  (4r de sus 5r yacen sobre un triángulo de lado 2r). El módulo lo reporta bien por partida doble
  —50 % de hexágono · 67 % de triángulo, verdades 50,0 % y 66,7 %— y por eso publica **todos** los
  candidatos. La ambigüedad es de la forma, no del método: refuerza el invariante ADR-009.
- **Coste:** ~200 ms por plantilla ICP (~640 ms para cuatro). **F3 debe invocarlo bajo demanda y con
  el repertorio acotado**, no con la biblioteca entera en cada análisis.
- **Verificado:** 14 tests nuevos · **suite 357 passed / 4 skipped** (antes 343/4) · sintaxis 3.9.
- **Pendiente:** F3 (registro canónico + chip LAAR + modal de confirmación) · F4 (calibración con
  corpus real) · verificación visual en Electron.

## 🎯 Sesión 2026-09-13 — ADR-017 F1: `shape_template.py` + `/api/shape-match`

Vuelve la completitud, esta vez midiendo lo que dice medir. **Nuevo módulo canónico**
`python/modules/shape_template.py` y endpoint `POST /api/shape-match`.

Las tres etapas del ADR §3, todas en el módulo:
- **E1 · margen original vs borde de fractura** — por **CONTIGÜIDAD** del arco de inliers,
  no por umbral de rectitud (probado y descartado: frágil ante el ruido de contorno).
- **E2 · ajuste robusto** — círculo por Kåsa (1976), elipse por **Halíř & Flusser (1998)**
  (variante estable de Fitzgibbon et al. 1999). Se prefirió a `cv2.fitEllipse` porque su
  algoritmo exacto varía entre versiones de OpenCV y hay un requisito de replicabilidad
  abierto (ADR-013 F2). RANSAC con **semilla fija** → determinista, con test que lo verifica.
- **E3 · completitud** = fracción de la **longitud de arco** de la plantilla cubierta,
  medida alrededor del **CENTRO AJUSTADO** — no del centroide del fragmento. Ese error de
  referencia era exactamente el defecto que F0 retiró.

| forma sintética | verdad | medido | veredicto |
|---|---|---|---|
| círculo íntegro | 100 % | **100,0 %** | completo |
| disco 75 / 50 / 25 % | 75 / 50 / 25 | **75,3 / 50,5 / 25,8** | fragmento |
| disco 12,5 % | 12,5 % | — | **rechazada** (fuera de envolvente) |
| elipse íntegra / media | 100 / 50 | **100,0 / 51,0** | completo / fragmento |
| rectángulo 2:1 | n/a | — | **rechazada** (plantilla errónea) |

- **Tres cosas que la implementación obligó a añadir**, ninguna prevista en el diseño:
  (1) **tope de elongación de la elipse** `b/a ≥ 0,15` — una elipse con `b/a → 0` **es** un
  segmento de recta y ajusta cualquier borde de fractura (análogo elíptico del «círculo
  gigante ≈ recta» que ya acotaba `r_max`); sin él, un rectángulo y un sector de 45° se
  aceptaban como plantillas. (2) **soporte mínimo distinto por plantilla** (círculo 0,30 ·
  elipse 0,45): la elipse tiene 5 grados de libertad frente a 3. (3) **Un bug propio**: el
  refinamiento actualizaba el modelo sin su tramo → el «arco de inliers» quedaba medido
  contra otro modelo y contenía puntos fuera de tolerancia. Ahora se actualizan juntos.
- **Coste:** ~320 ms/objeto con las dos plantillas (contorno ~430 pts); el bucle de tramos
  contiguos se vectorizó (era 504 ms). **Relevante para F3**: conviene invocarlo bajo
  demanda, no en cada análisis.
- **Invariante ADR-009 respetado:** el endpoint emite `es_fragmento_candidato` — sugerencia
  a confirmar, nunca veredicto — y `None` cuando no hay plantilla. No toca ninguna métrica.
- **Verificado:** 19 tests nuevos · **suite completa 343 passed / 4 skipped** (antes 324/4) ·
  sintaxis Python 3.9 comprobada con `ast.parse(feature_version=(3,9))`.
  **Esta sesión también cerró la verificación pendiente de F0**: la suite pasa con F0 dentro.
- **Pendiente:** F2 (ICP contra repertorio arbitrario vía `efa.reconstruct()`), F3 (registro
  canónico + chip LAAR + modal de confirmación), F4 (calibración con corpus real). Y la
  verificación visual en Electron, que este contenedor no puede correr.

## 🎯 Sesión 2026-09-12 — ADR-017 F0: retirada del estimador de completitud

**ADR-017** (`docs/ADR-017-emparejamiento-plantillas-completitud.md`): ¿puede MAO inferir «pieza
completa vs. fragmento» emparejando el contorno contra formas ideales? Sí, pero la EFA **no** resuelve
el encaje parcial (descriptor global de curva cerrada, normalizado al 1er armónico *del fragmento*);
el repertorio entra como **biblioteca de plantillas** vía `efa.reconstruct()` y el motor es ajuste
robusto → **ICP** (Wilczek et al. 2021). Arquitectura E1-E4 + prototipo verificado (exacto hasta 25 %
de forma preservada; rechaza por debajo del 15 % en vez de inventar).

**F0 implementada** — retirada de los estimadores que no medían lo que decían. Nota de versión:
`docs/NOTA-VERSION-ADR017-F0.md` (🟠 **cambia valores ya exportados a CSV/PDF**).

| Clave anterior | Ahora | Valor |
|---|---|---|
| `completitud_estimada` (JS: cobertura angular + extent) | **retirada** | señal degenerada |
| `completitud_metodo_convexidad` (= `A/A_bbox`) | `extent` | mismo número |
| `completitud_estimada` (PY: `0,4·conv + 0,6·solidez`) | `indice_convexidad_percent` | **mismo número** |
| `perdida_area_fragmentacion_percent` | `concavidad_area_percent` | mismo número + alias deprecado |
| `perdida_perimetro_fragmentacion_percent` | `concavidad_perimetro_percent` | **signo corregido** |

- **El defecto:** la cobertura angular se medía alrededor del centroide **del propio fragmento**, y
  todo contorno cerrado de `findContours` rodea 360° por construcción → disco entero / medio / cuarto
  daban **91,3 / 91,3 / 91,0 %**, los tres «casi completo». Y `metodo_convexidad` era el **extent**
  (π/4 = 78,5 % para un círculo) → **toda pieza redonda íntegra salía «fragmento»**. **Causa raíz de
  ADR-016 #6** (cuenta circular de La Draga rotulada «fracturada»).
- **Lo más consecuente:** dos rutas (detección asistida en `analysis-core.js` y flujo manual) **inyectaban** la
  etiqueta `Fragmento X (N% completo)` cuando `perdida_area > 1 %` —o sea, con casi cualquier contorno
  real— derivando el porcentaje como `100 − concavidad`. Ambas retiradas.
- **Cuarto estimador descubierto al implementar:** Python tenía su propio `completitud_estimada`
  (`metrics.py` §33), **distinto** del de JS y sin término angular → medición fiel, rótulo equivocado
  → renombrada sin tocar coeficientes. Su compañera `completitud_metodo_convexidad` duplicaba
  `convexity` (§28) ×100 → retirada.
- **Signo invertido confirmado desde el propio repo:** el comentario de `metrics.py` §28 dice «nunca
  >1 (hull ≤ real)», lo que prueba que `(hull_perim − perim_real)/hull_perim` era ≤ 0 por construcción.
- **Doctrina aplicada** (precedente JFRR 2026-07-02, ADR-016 #6): conservar la medición fiel, retirar
  el rótulo que diagnostica de más. Donde no hay dato → «Sin evaluar», nunca un 100 % fabricado.
- **Inerte hasta F1** (compuerta era el flag fabricado): reinterpretación «zona curvilínea frontera»
  y resaltado crítico de la columna de completitud. La lógica se conserva comentada en su sitio.
- **Gotcha confirmado otra vez:** los duplicados IIFE de `analysis-core.js` replicaban los 3
  productores; sin tocarlos el defecto sobrevive por la ruta legacy.
- **Verificado:** gate `node tools/adr017_gate_f0.mjs` 13/13 · `node --check` 11/11 · `py_compile` 2/2
  · enforcement nuevo en `python/tests/test_coherencia_entrega.py` (lógica reproducida a mano).
  Cache-bust `?v=20260912a`. **Pendiente: suite Python completa y verificación visual en Electron**
  (el cambio se preparó en un contenedor sin numpy/cv2/pytest).
## 📖 Glosario canónico de métricas — ADR-018 (F0-F2 ✅, 2026-09-03)

`js/modules/glossary.js` es la fuente ÚNICA de **qué significa cada número** que publica MAO.
Hermano de `category-manifest.js` (qué secciones hay) y `morphometric_registry.py` (qué es
homólogo 2D↔3D). Doc: `docs/ADR-018-glosario-canonico.md`.

**Por qué es un módulo de datos y no un documento:** el informe tiene **dos taxonomías, a
propósito**. ADR-011 congeló los rótulos del CSV (28 secciones en castellano llano, sin
romanos) porque hay scripts externos que dependen de esos nombres de columna, mientras
panel/Tabla/PDF migraron al índice canónico (I → XX-b). No mapean 1:1 — el CSV funde II con
II-b, y publica Feret bajo «Métricas Avanzadas» aunque la Tabla lo rinda en IV. Cada entrada
declara **a la vez** su `categoria` canónica y su columna `csv`, de modo que el glosario **es
el puente** en vez de la tercera taxonomía divergente.

| Artefacto | Qué hace |
|---|---|
| `js/modules/glossary.js` | 88 entradas (clave, categoría, columna CSV, fórmula, unidad, rango, interpretación, fuente, referencia) |
| `js/modules/glossary-annex.js` | `anexoGlosarioHTML()` · `diccionarioColumnasCSV()` · `tooltipDe()` · `bibliografiaHTML()` |
| `scripts/glosario_inventario.py` | cruza manifiesto × CSV × Tabla × registry → cobertura real (`npm run glosario:inventario`) |
| `scripts/generar-glosario-html.mjs` | `GLOSARIO_METRICAS_MAO.html`, página autónoma (`npm run glosario`) |
| `python/tests/test_glosario.py` | 7 pruebas de contrato; la clave es que **toda columna CSV declarada se emita de verdad** |

**Cobertura:** 88 de 278 términos · 12 de 26 categorías · 73 columnas de CSV. F1 (núcleo
morfométrico: IV, V, VI, VII, VII-b, VIII, IX, IX-b, XVII) y F2 (procedencia: I, II, II-b)
cerradas. Pendientes F3 (P/H + bifacial), F4 (resto) y **F5 (cablear el anexo al PDF y los
tooltips a la Tabla — hoy ningún consumidor de producción los importa)**.

⚠️ **Procedencia del ANÁLISIS ≠ procedencia de la DETECCIÓN (ADR-018).** `analysis_method`
es texto libre que **8** sitios escriben distinto y **2** comparaban por igualdad; una de esas
comparaciones estaba **muerta** (`analysis-core.js` buscaba `"Bounding Box (Fallback)"` exacto
y el escritor emite `'… [APROXIMADO]'` → el contador `sinContorno` valía **0 siempre**, y las
piezas medidas por caja envolvente se reportaban como medidas sobre contorno real).
**Corregido** con el patrón de ADR-008: enum `ANALYSIS_SOURCE`
(`contorno_real`/`bbox_fallback`/`ia`/`obj3d`) + `fuenteAnalisis()`/`esFallbackBBox()`/
`esAnalisisIA()` en `js/mao-deteccion-contract.js`; los 8 escritores sellan `analysis_source`
y los 2 lectores usan los predicados. La derivación legacy va **por subcadena, nunca por
igualdad** — eso es lo que impide que un sufijo nuevo mate otro lector en silencio.
`analysis_method` NO cambia (viaja al CSV y al informe). Tests:
`python/tests/test_procedencia_analisis.py` (5).

🔧 **Dos correcciones de ADR-018 (salidas del informe).**
**(a) Área neta publicada.** `area_neta`/`perimetro_neto`/`porosidad` se calculaban y persistían
pero **ninguna salida las rendía**: el CSV daba la bruta y los totales P/H en secciones
separadas. Ahora van **junto a la bruta** en las **6 superficies** (CSV monofacial · Tabla · **`metricas.csv`** archivado por pieza · **PDF integral** · panel · motor), vía `MetricPresenter.areaNetaDerivados(metricas, obj)` + `notaAreaNeta()` — que distingue los
tres casos que «neta = bruta» confunde: sin huecos · huecos sin confirmar · valor almacenado
incoherente (se rechaza si neta > bruta). Hace visible el invariante de ADR-009: **solo se
descuentan P/H CONFIRMADAS**. Llegó a haber **6 derivaciones independientes** del criterio de
aceptación; el PDF además ignoraba el valor persistido y lo recalculaba. GOTCHAS: (1) el área
neta vive en **DOS sitios** —`metricas.area_neta` (sincronización P/H) y `obj.area_neta` (ruta
de exportación)—, y quien consulte solo uno muestra «sin P/H» en piezas que sí los tienen;
(2) `visualization-export.js` **no importaba** `metric-presenter.js` (`node -c` no lo ve, la
prueba de humo del módulo sí); (3) el renderizador del PDF **omite la fila si la clave no
existe**, así que las secciones aceptan ahora un tercer elemento con el valor ya derivado.
**(b) `solidity_class` neutralizado.** Decía «Moderadamente/Muy/Extremadamente fragmentado»
cuando mide `A_real/A_hull` — baja igual por fractura que por morfología cóncava, y contradecía
a XII. Había **3 escaleras** (`metrics.py`, `analysis-core.js` y `mao-ia.js`, esta última con
umbrales propios 0.90/0.75/0.55 → la misma pieza recibía rótulos distintos según la vía). Ahora
una: `metric-presenter.js::clasificarSolidez`, paridad textual en Python, **umbrales intactos**.
+4 tests en `test_coherencia_entrega.py`; la solidez entra en el enforcement de fuente única.

📐 **12 convenciones de nomenclatura** (10 de ADR-018 + 2 de ADR-022) en `CONVENCIONES` de
`glossary.js` (aparte de `TERMINOS`: una sigla no tiene clave, unidad ni fórmula), rendidas como
preámbulo del anexo. El campo `tipo` separa `sigla` («A = B») de `regla` (enunciado). Cada una
nació de una ambigüedad **verificada en el código**: **Detección asistida** es el nombre del modo ·
«IA» y «AIA» **retiradas** (ADR-022; ADR-018 había fijado IA = «Identificación Automatizada») ·
**Inteligencia artificial** solo para un modelo entrenado nombrado · **Confianza** nunca sola (hay **8**
distintas) · **Procedencia** detección≠análisis · **Simetría** bilateral≠bifacial ·
**Eje** 3 sistemas · **Área** 6 magnitudes (la **neta** no tiene clave propia) · **Rótulos**
miden y no diagnostican (`solidity_class` dice «fragmentado» y contradice a XII) ·
**Cara A**=anverso · **P/H** pasante-vs-ciega NO observable en 2D. Dos señalan deuda que no
se arregla escribiendo: clave propia para el área neta, y neutralizar `solidity_class`.

⚠️ **Convención de nomenclatura — la sigla IA (sustituida por ADR-022).** ADR-018 fijó
**IA = «Identificación Automatizada»**; no bastó —el lector la sigue leyendo como «inteligencia
artificial»— y ADR-022 retiró la sigla: el modo se llama **detección asistida** (ver la sesión
2026-09-19 arriba). `METODO_LABEL.ia` = «Detección asistida (parámetros fijados por el operador)»;
el enum canónico `ia` no cambia (ADR-008). Las pruebas 8-9 de `test_glosario.py` exigen ahora
la retirada, y `test_terminologia_deteccion_asistida.py` vigila todas las superficies.

⚠️ **`GLOSARIO_METRICAS_MAO.html` es una SALIDA generada.** No editarla a mano: se pierde al
regenerar y diverge de lo que muestra la app. Las definiciones se corrigen en `glossary.js`.

**4 defectos del código que destapó F0** (registrados en el ADR, no corregidos — cambian la
salida del informe y exigen verificación visual en Electron):
1. `XIV. Depuración` está en el manifiesto pero **ninguna función de la Tabla la rinde** (son
   25 secciones, no las 26 que declaró ADR-011); el CSV sí emite sus 3 filas.
2. `XX. Comparación Bifacial` y `XX-b` tampoco: `generarSeccionComparacionBifacial()` rotula
   «22. COMPARACIÓN BIFACIAL» **en arábigo y a mano**. El test de ADR-019 no lo ve porque
   solo persigue numerales romanos.
3. `generarTablaComparativa{Dimensiones,Forma,PH}()` rotulan sin `encabezadoDe()`.
4. `generarSeccionIncertidumbrePropagada` (II-b + II) y `generarSeccionPropiedadesContorno`
   (XIII + VII) emiten dos secciones desde un cuerpo → sus claves no se adjudican solas.
## 🎯 Sesión 2026-09-12 — ADR-015 F1 (A1+A2+C3) ✅

**ADR-015 Fase 1 completa**: estadísticas de validación metrológica para el paper PROTEC.

**A1 — Exactitud (Bland-Altman):** `python/modules/validation_stats.py` implementa Bland-Altman
completo (sesgo, LoA, MAE%, max error, within_LoA%). Tests: `python/tests/test_validation_accuracy.py`
(14 tests). Protocolo: objetos sintéticos con verdad geométrica conocida (círculos y elipses).
Resultado: MAE < 1% en área y perímetro, sesgo < 0.5%, todos los objetos dentro de los LoA.
**Gate A1 ✅**: MAE% < 5% en todas las métricas.

**A2 — Reproducibilidad (ICC):** `validation_stats.py` implementa ICC(2,1) two-way mixed
(Shrout & Fleiss tipo 2). Tests: `python/tests/test_reproducibility.py` (9 tests). Protocolo:
6 objetos × 5 repeticiones con ruido ±0.3 px (simula digitalización por observador distinto).
**Gate A2 ✅**: ICC ≥ 0.90 en área ("excelente"); varianza entre objetos >> varianza del método.

**C3 — Estandarización (CV + bootstrap):** `python/modules/standardization.py` implementa
`coefficient_of_variation`, `bootstrap_ci` (semilla fija → reproducible), `standardization_report`,
`contrast_groups`, y `estandarizacion_report` (reporte completo para paper con IC por grupo y
contrastes por pares). Tests: `python/tests/test_standardization.py` (20 tests). Incluye simulación
del escenario La Draga: cuentas discoidales CV≈6% (alta estandarización) vs. fragmentos CV>25%.
**Gate C3 ✅**: CV + IC bootstrap correctos; contraste alta/baja estandarización detectado.

**Suite:** 392 passed / 4 skipped (7 pre-existentes `test_comparator.py` por sklearn no instalado).
**Documentación:** `docs/VALIDACION-EXACTITUD.md` — protocolo + resultados + próximos pasos.
**Tablero:** `docs/PLAN-MEJORAS-MAO.md` — A1/A2/C3 marcados ✅.
**Pending F2:** B1 (calibración óptica Zhang), B2 (relieve), B3 (propagación escala), D1 (Klingenberg), D3 (armónicos).

## 🎯 Sesión 2026-06-24 — ADR-012 detección monolítica (Fases 1-3 ✅) + fix modo componente

**ADR-012 «detección monolítica»** (`docs/ADR-012-deteccion-monolitica.md`, commit `eaf01d3`): núcleo de
segmentación **único y canónico = OpenCV `detection.detect()`** (Z-scan+CLAHE+GrabCut+watershed+
confianza); los modos son priors complementarios, no reimplementaciones redundantes. Motor JS
`detectarObjetosHibrido` = **fallback** solo si Python no está.

**Cierre:** los 4 modos (automático, manual de área, asistida —antes «IA»—, manual por componente)
comparten el núcleo; SAM = prior neuronal (ADR-022: hoy ningún modo lo invoca). **Fase 2 (automático) ya estaba hecha** desde ADR-007/008 (`ejecutarDeteccionAutomatica`
→ `PythonBridge.detection.detect`); mi tabla inicial del ADR la describía mal. **Fase 3 (detección asistida)**: nueva opción
**«Auto (núcleo OpenCV)» por defecto** en el modal (`threshold_method="auto"` → `detect(separate_touching,
include_contours)` + enriquecimiento por objeto); modos manuales del modal ganan watershed; `detect()` gana flag
aditivo `include_contours`. Cache `mao-ia.js?v=20260624a`. Verif: suite 288/2 + HTTP `/api/mao-ia auto` (200,
conf alta) + 422 inválido.
- **M1**: `detectarObjetosManualRapida` → `async`; enruta el ROI a `PythonBridge.detection.detect(...,
  {separateTouching:true})`, mapea bbox con offset y **hereda confianza** (el manual ya no nace sin
  confianza). Fallback al cuerpo JS intacto (early-return + fall-through). `detectarObjetosEnArea` y
  `ejecutarDeteccionEnAreaManual` ahora async/await. Cache `analysis-core.js?v=20260624g`.
- **M2**: el watershed del núcleo individualiza los pegados → el clic-componente JS queda como
  fallback solo-JS (la etapa de contorno ya era canónica vía `/api/contour`).
- **Fix de bug**: `manejarSeleccionComponente`/`procesarContornoSeleccionado` estaban anidadas por
  error dentro de `aplicarAnalisisMorfometricoAreaManualMejorado` → `ReferenceError` al clicar.
  Des-anidadas a nivel IIFE (cuerpos byte-idénticos).
- **Verificado**: `node -c` OK · suite 288/2 (frontend-only) · `detect()` sobre ROI de fixture →
  bbox local + conf 0.986/alta (python_zscan_competitive). **Pendiente**: runtime Electron (selección
  manual con 2+ pegados → ruta backend+watershed+chips; y fallback con backend muerto). **Caveat
  RESUELTO (2026-06-25)**: flag `roi_mode` implementado. `detect(roi_mode=True)` desactiva las 3
  heurísticas de imagen completa que contradecían el encuadre manual: (1) recorte de la franja de
  borde — el objeto suele tocar el borde del ROI; (2) filtro de dominancia ≥20% del mayor — no
  descartar lascas/fragmentos que el usuario encuadró; (3) reorden por relevancia arqueológica
  (esquina/borde = carta de color/escala) — dentro del ROI ya no hay referencias. Cableado:
  `detectarObjetosManualRapida` → `PythonBridge.detection.detect(..., {roiMode:true})` → `/api/detect`
  Form `roi_mode` → `detection.detect`. Tests: `TestModoROI` (4) en `tests/test_detection.py`. Suite 292/2.
- **Fase 3 (detección asistida)**: `detection.detect()` gana flag aditivo `include_contours`; `detect_with_mao_ia` añade
  rama `threshold_method=="auto"` (→ núcleo + enriquecimiento por objeto); modos manuales del modal ganan
  watershed; `/api/mao-ia` valida `"auto"`. **ADR-012 completo** (4 modos en el núcleo, JS=fallback).
  **Pendiente único**: verif. visual de la ventana de detección asistida en Electron (flakiness app:// en frío bloqueó la headless).
  **Nota ADR-013 F2**: GrabCut sigue activo en `detection.detect()` y `sam_segmenter`; en `contour.extract`
  fue reemplazado por fallback determinista (2026-09-12) para garantizar el invariante de replicabilidad.

## 🎯 Sesión 2026-09-12 — ADR-013 F2 replicabilidad del contorno ✅

**ADR-013 F2 completo** (`cf26806`). Implementa el invariante de replicabilidad de `contour.extract`:

- **(a) Determinismo** — mismo input → contorno byte-idéntico en N corridas. Causa raíz: GrabCut
  (GMM con estado aleatorio) estaba como fallback en `contour.extract` y producía hashes distintos
  en cada corrida. **Eliminado**; reemplazado por dos fallbacks puramente deterministas:
  - Cobertura >92%: probable máscara invertida → invertir (objeto claro mal clasificado como fondo).
  - Cobertura <4%: máscara vacía → Otsu sobre gris con `THRESH_BINARY_INV`.
  - `metodoDeteccion` refleja el camino: `"python_contour_inv"`, `"python_contour_otsu_gris"`.

- **(b) Invariancia al ROI** — mismo objeto con encuadres ±margen → área ≤ 2%. Mejora: antes de
  llamar a `_build_binary_mask`, `contour.extract` calcula un `white_thresh_override` via Otsu sobre
  el gris del ROI (solo fondo blanco). Si el Otsu produce cobertura razonable (4%–65%, umbral ≥ 80),
  se pasa como `white_thresh_override`; si no (objeto muy claro = caso sintético del intento 1 revertido),
  cae silenciosamente al umbral estándar `brillo_min - 15`.

- **(c) No-regresión** — `_build_binary_mask` gana parámetro `white_thresh_override=None` (aditivo).
  Los callers existentes `detect()` y `sam_segmenter` no se ven afectados.

**Blast radius controlado**: GrabCut sigue activo en `detection.py:832` y `sam_segmenter.py:252`;
el cambio es exclusivo de `contour.extract`. Guard de `ph_candidates`: `_grabcut_usado` → `_fallback_usado`.

**Tests gate** (`python/tests/test_adr013_f2_replicabilidad.py`, 11 tests): Determinismo (3) ·
Invariancia ROI (2) · No-regresión `_build_binary_mask` (4) · Fallback determinista (2).
**Suite: 340 passed / 4 skipped** — sin regresiones.

**Pendiente único**: verificación visual en Electron con imagen real (mismo límite heredado de F1).

## 🎯 Sesión 2026-09-12 — ADR-016 F3 (#9–#11) cosmético ✅ — ADR-016 CERRADO

**ADR-016 completamente cerrado** (`5658db2` #9 · `93aa6bb` #10 · `4d949ec` #11).
Todos los hallazgos F3 (cosmético) implementados en `tabla-metricas-completa.js`:

**(#9) Variación Perímetro — renombrado de «Pérdida Perímetro»:**
La métrica `perdida_perimetro_fragmentacion_percent = (hull_perim − perim_real) / hull_perim × 100`
puede ser negativa (contorno sinuoso, perímetro real > hull). El rótulo «Pérdida» era incorrecto
en ambos signos. Cambios en las dos ocurrencias (secciones VIII y VIII-b):
- Rótulo: `Pérdida Perímetro (%)` → `Variación Perímetro (%)`
- Lógica de color: `> 20 / > 10` → `Math.abs(v) > 20 / > 10` (negativos grandes también alertan)
- Descripción: «Variación vs perímetro convexo (neg. = contorno sinuoso)»

**(#10) Ejes Reales (p1/p2) — ocultos en objetos 2D:**
`eje_mayor_real_p1/p2` y `eje_menor_real_p1/p2` son coordenadas 3D de los extremos de los
ejes inerciales; en modo 2D siempre son `null` → mostraban `[N/A]`. Guard añadido:
`tieneEjesReales = !!(metricas.eje_mayor_real_p1 || metricas.eje_menor_real_p1)` — las dos
filas se omiten en 2D, siguen visibles en 3D.

**(#11) Distancia de Asimetría — contextualización vs tamaño del objeto:**
El valor absoluto en mm no era interpretable sin la escala del objeto, generando tensión
entre «10.07 mm» y «excelente simetría». Fix: añade `distPct = distanciaAsimetria / ejeMayor × 100`
y muestra «X.XX mm (Y.Y% del eje mayor)». Descripción corregida a «Residuo Hausdorff promedio
respecto al radio medio del contorno» (fiel a la fórmula de `_simetria_bilateral`).

**Cache-bust final:** `analysis-core.js?v=20260912e` · `node -c` OK · 5/5 `test_coherencia_entrega`.

## 🎯 Sesión 2026-09-12 — ADR-016 #5 cabecera detección/confianza en PDF ✅

**ADR-016 #5 cerrado** (`74a0e3c`). La cabecera del reporte PDF mostraba
«Método detección N/A · Confianza detección — (N/A)» en objetos de detección asistida. Dos bugs independientes:

**(a) Clave errónea `confidence_level`:**
El análisis morfométrico escribe `metrics.detection_confidence_level` (línea 10202 de
`analysis-core.js`), pero la cabecera de `generarHTMLReporteParaBatch` (línea 20373) leía
`m.confidence_level` — un alias divergente que nunca existe en `metricasFinal`. Mismo bug
en la columna CSV de colección (`project-manager.js:2837`). Fix: cadena de fallback
`m.detection_confidence_level || m.confidence_level` en ambos puntos.

**(b) `detection_method` sin cadena de fallback:**
Objetos de detección asistida guardados antes del contrato ADR-007/008 tienen la clave como `detectionMethod`
o `detection_mode` en su `metricas.json`, no como `detection_method`. Fix: cadena
`m.detection_method || m.detectionMethod || m.detection_mode` en cabecera y CSV.

**Archivos:** `js/analysis-core.js` (líneas 20372-20373) · `js/project-manager.js` (líneas 2835-2837).
**Cache-bust:** `analysis-core.js?v=20260912b` · `project-manager.js?v=20260912a`.
**Suite:** 340 passed / 4 skipped. `node -c` OK.
**Pendiente:** verificar en Electron con PDF real de objeto de detección asistida (requiere `npm start`).

**Estado ADR-016 completo tras esta sesión:**
✅ #1 (BB px→mm) · #2 (excentricidad) · #3 (regularidad ×100) · #4 (hull 0.0000) ·
✅ #5 (detección/confianza N/A) · #6 (rótulo rugosidad — resuelto semánticamente) ·
✅ #7 (dif. área) · #8 (ángulos Feret) · #feret_clasificacion ·
⬜ #9–#11 (cosmético, F3 — pendientes).
## 🎯 Estado de la sesión 2026-09-12/13 — Exportación (rama `claude/audit-export-modules-b320d2`)

Auditoría completa de los módulos de exportación + implementación del lote. **7 commits, +2.922 /
−4.263 líneas.** Rama **subida** (`4c435cc`); **PR pendiente de abrir** contra
`feat/laar-runtime-fix-estetica` (cuerpo redactado, fuera del repo por decisión de JFRR).

> 📋 Detalle exhaustivo con líneas y evidencias → **`docs/AUDITORIA-EXPORTACION-20260912.md`** (§1–§13).

| Commit | Qué |
|--------|-----|
| `c884f38` | Lote a carpeta de resultados + corrección del payload científico (TPS/EFA, IMC bifacial) |
| `fcc730c` | Fase 0 — eliminar código muerto de exportación (−4.263 líneas) |
| `4960add` | Timeout del PDF bifacial y manifiesto auditable |
| `fade583` | `currentAnalyzedObject` como fuente única |
| `0a7d92e` | Sellar el ID arqueológico y alinear análisis con resultados |
| `79c3481` | P3 — exportar al finalizar el análisis |
| `4c435cc` | P4 — chip «listo para exportar» en la cabecera de Análisis |

### Qué hay ahora
Un clic en **«Guardar y Finalizar»** (con la casilla «Exportar al finalizar») guarda el análisis
**y** exporta sus 7 formatos a la carpeta hermana:

```
<proyecto>/QP1_U1_N1_E1_01/            ← datos del análisis
<proyecto>/resultados/QP1_U1_N1_E1_01/ ← CSV · SVG · PNG · PDF · landmarks/ · manifiesto.json
```

- **`js/mao-export-destino.js`** (nuevo): `window.MaoExportDestino`. Sin IPC nuevo. **Con
  `activo === null` el comportamiento es idéntico al anterior** (diálogo nativo) → reversible.
- **`js/export-manager.js` ELIMINADO** (era una implementación paralela y muerta de SVG/PNG).
- **`npm run test:js`** → 95 comprobaciones en 3 suites sin dependencias
  (`tests/test_efa_tps_export.js`, `test_bifacial_export.js`, `test_export_destino.js`).
  Extraen las funciones REALES del IIFE: renombrarlas hace fallar el test, no pasar en vacío.
- Caché: `analysis-core.js?v=20260913e`, `mao-analysis-organizer.js?v=20260913a`.

### ⚠️ Gotchas permanentes descubiertos (valen para todo el repo)

1. **`obj.id` es NUMÉRICO** en el flujo de detección automática. `obj.id?.replace(...)` **no
   protege** (`1` es *truthy*) → `TypeError`. Rompía el PDF integral, el SVG **y el guardado del
   análisis**. Saneado con `String(...)` en 8 sitios. Al escribir código nuevo que use `obj.id`
   para nombres o rutas: **`String(obj.id ?? '')` siempre**.
2. **`requestAnimationFrame` NO dispara en ventanas ocultas.** Los organizers programan con rAF,
   así que `#adr2Header` y sus chips no se construyen si Electron corre en segundo plano. En
   cualquier verificación E2E por CDP hay que llamar **`Page.bringToFront`** antes de inspeccionar.
3. **`currentAnalyzedObject` era DOS variables** (el `let` del IIFE y la propiedad global que
   escribe `visualization-export.js`, módulo ESM donde el identificador resuelve al global).
   Resuelto eliminando el `let`: ahora es **un único binding**. No volver a declararlo local.
4. **El ID arqueológico se sella en `obj.idArqueologico`** (campo aditivo). Es la fuente única de
   la carpeta del análisis, la de resultados y los nombres. `_baseNombreAnalisis()` es el único
   sitio a tocar si algún día se implementa ADR-008 C2.
5. **`imageTimeout: 0` en html2canvas significa ESPERA INDEFINIDA**, no «sin espera». Colgaba el
   PDF bifacial >5 min. Corregido a 15 s + topes con `_conTimeout` en tres capas.

### Pendientes
- **Abrir el PR** (`gh` no disponible en la sesión de Claude; el remoto rechaza su clave).
- **Staleness de la cabecera ADR-002**: tras confirmar una P/H los datos cambian pero la cabecera
  no se refresca — afecta **igual** al chip P/H preexistente y al nuevo de exportación. Tarea propia.
- **Nombres del par bifacial**: `_comparacion.csv` (tabla A-vs-B) vs `_bifacial.csv` (métricas de
  ambas caras) vs `_bifacial.pdf` (informe) es ambiguo. Decisión de nomenclatura, no tocada.
- **Lote bifacial** verificado con caras construidas a mano (la máquina de estados bifacial no se
  ejercita por script); el paso «CSV de ambas caras» salió como omisión por ese motivo.

---

## 🎯 Estado de la sesión 2026-06-14 (lote de cierre)

Commits del lote: `526cf42` (ADR-010 E2E hook) · `be20a0e` (webSecurity + cv2 warmup + Resultados organizer + deuda técnica) · `63694bf` (ADR-006).

| Item | Estado | Commit |
|------|--------|--------|
| ADR-010 hook E2E `window.__maoE2E` | ✅ | 526cf42 |
| `webSecurity:true` en ambas ventanas Electron | ✅ | be20a0e |
| Warmup cv2+numpy antes de uvicorn (iCloud) | ✅ | be20a0e |
| `mao-resultados-organizer.js` (pestaña Resultados) | ✅ | be20a0e |
| Deuda técnica: borrar dupes `cargarMetadatos` en utility-helpers | ✅ | be20a0e |
| ADR-006 Fases 1-3: `morphometric_registry.py` + 19 tests + refactor coherencia | ✅ | 63694bf |
| ADR-008 C2 rewrite id compuesto | ⏸ DIFERIDO — riesgo alto | — |

**Suite tras el lote:** 288 passed, 2 skipped. `node -c` limpio. Caché: `analysis-core.js?v=20260614h` ⚠️ *(superado: ver bloque 2026-09-12/13)*.

**Verificación E2E pendiente (requiere npm start matar+relanzar, no Cmd+R):**
`await window.__maoE2E.flujoCompleto('sintetico_escala_objeto_ph.png')` → validar checklist en `docs/ADR-010-hook-verificacion-e2e.md`.

---

## 🎯 Fase Actual: UI Pestañas LAAR — tratamiento completo (ADR-001…005)

> 📋 **Estado consolidado de TODOS los ADR (001–010) → `docs/ESTADO-ADRS.md`** (fuente única
> de verdad: estado real + commit por ADR; reconcilia cabeceras `Estado:` obsoletas de ADR-002/004/005/006).

**Estado:** ✅ **Migración + rediseño por pestaña + armonización transversal COMPLETADOS y verificados en Electron.**
- Fases A-B (infraestructura de pestañas): commit `5bdfb61` (2026-06-08) · fixes runtime + estética: 2026-06-09.
- ADR-001 guards de flujo · ADR-002 Análisis · ADR-003 Proyecto · ADR-004 Captura · **ADR-005 armonización transversal** (lenguaje canónico `.laar-chip`/`.laar-header` + base `window.MaoOrganizer`; cierra el de-rainbow + jerarquía de las 4 pestañas) — 2026-06-11/12.
- Detalle de cada ADR en sus secciones más abajo y en `docs/ADR-00{1..5}-*.md`.

La interfaz pasó del modelo **sidebar-scroll** al de **pestañas de flujo LAAR** (Proyecto → Captura → Análisis → Resultados). Arquitectura **Strangler Fig**: las pestañas y los organizers (`mao-*-organizer.js`) envuelven la navegación existente sin tocar lógica de negocio. Único pendiente transversal: probar el flip de chips con archivos reales (los `<input type=file>` no se pueblan por script).

**Historial detallado de la migración base (A-B) abajo ↓** (se conserva como registro; el estado vigente es el de los ADR).

**Implementado (A-B):**
- A3: API DOM nativa (compatible CSP `script-src 'self'`)
- A4: Persistencia de estado con sessionStorage
- A5: Guard HMR en buildTabBar()
- B1: contextBridge para maoTabRouter
- B2: BrowserWindow: `titleBarStyle: 'hiddenInset'` (conserva semáforos macOS), zoom deshabilitado
- B3: Meta CSP en index.html
- B4: `-webkit-app-region: drag` para arrastre nativo

**Fixes de runtime (2026-06-09)** — bugs que `node -c` y health check NO detectan, solo runtime visual:
- El tabbar se construía pero quedaba **oculto bajo el header fijo** (`#maoHeader` z9000 vs tabbar z10, ambos en y=0). Fix: `body { padding-top: var(--laar-topbar-h) }` en `mao-tabs-laar.css` (la regla previa `body,html{padding:0}` anulaba la compensación del header de `main.css`).
- El contenido de la pestaña activa quedaba en `display:none`: la nav legacy (`sidebar-nav.js`/`object-dimension-mode.js`) oculta secciones con `.mao-panel--hidden` (`!important`) y corre EN `DOMContentLoaded`, DESPUÉS del router (`defer`). Fix: el router ahora usa esa misma clase autoritativa (`setSectionVisible`) y re-afirma la pestaña activa en un listener `DOMContentLoaded` registrado en boot (corre último).

**Estética LAAR (2026-06-09)** — extendida del tabbar a los componentes en `mao-tabs-laar.css` (sección "ESTÉTICA LAAR — COMPONENTES", acotada a `.mao-main`, reversible): fieldsets/tarjetas planos (radio 4px, borde 0.5px, sin sombra), botones (secundario blanco + acento único azul para primarias; rojo/ámbar semánticos), tabs legacy CMO (anti-arcoíris) y bifacial. Pendiente verificar CMO/bifacial con datos reales; inputs/selects fuera de esta pasada.

**⚠️ Gotcha de caché:** el CSS `file://` se cachea entre relanzamientos. Al editar un `.css`/`.js` versionado, bump el `?v=` de su `<link>`/`<script>` en `index.html` (al cierre de ADR-005: `mao-tabs-laar.css?v=20260612e`, organizers y base en `?v=20260612e`).

## Tech Stack
- **Electron** (main.js + preload.js) — desktop shell
- **Node.js** — build/tooling (`npm start` launches app)
- **FastAPI** (python/server.py, port 8765) — analysis backend
- **Python 3.9** — all image processing and ML inference
- **ES6 modules** — frontend logic (Phase 2 refactoring complete)

## Key Directories

| Path | Contents |
|------|----------|
| `js/` | Frontend JS — main app logic, UI orchestration |
| `js/modules/` | 10 ES6 modules (Phase 2 refactoring output) |
| `python/` | FastAPI server + 13 analysis modules |
| `python/modules/` | Python analysis modules (analysis, metrics, contour, etc.) |
| `tests/` | 183 Python tests (pytest), 1 skipped |
| `docs/` | Technical documentation |

## Entry Points
- **Frontend**: `js/analysis-core.js` — IIFE bridge + Tier 1 API (imports all ES6 modules)
- **Backend**: `python/server.py` — FastAPI app, starts on port 8765
- **Electron**: `main.js` — launches Electron window + spawns Python server

## Critical Constraint: Tier 1 API
Ten `window.*` functions must remain globally accessible at all times.
They are called directly by `mao-ia.js` and `collection.js` (unchanged legacy callers).
Never remove, rename, or scope-gate these functions. See docs/arquitectura/ARCHITECTURE.md for the full list.

## Module Dependency Order (load/import sequence)

```
Layer 0 (zero deps):   geometry-primitives, contour-quality, morphometric-metrics, utility-helpers
Layer 1 (dep on L0):   shape-classification, contour-extraction, classification-engine
Layer 2 (orchestrate): metrics-orchestrator, visualization-export, tabla-metricas-completa
Phase 2d:              bifacial-analysis
```

## Run & Test
```bash
npm start                                    # Launch Electron app + Python server
npm test                                     # Verificación completa → ver abajo
```

`npm test` encadena los tres escalones, y es lo mismo que corre CI (`.github/workflows/ci.yml`,
en push y PR). Cada uno se puede lanzar suelto:

| Script | Qué verifica | Estado al 2026-09-18 (1.3.1) |
|---|---|---|
| `npm run test:esm` | Parseo **como módulo** de los 16 `js/modules/` + `analysis-core.js`, vía `import()` real | 17/17 |
| `npm run test:js` | Contratos `window.*` + `shape-classification` + exportación (TPS/EFA, semilandmarks, bifacial, destino, lote) + P/H + escala | 36/36 · 15/15 · verde (lote 27/27) |
| `npm run test:py` | Suite pytest completa (`tests/` + `python/tests/`) | **649 passed, 0 skipped** |

**`test:esm` no es redundante con `node -c`.** `node -c` parsea en modo script clásico, que es más
permisivo: dos `function f(){}` homónimas **pasan** ahí y son un `SyntaxError` como módulo — que es
como Chrome carga `analysis-core.js`. Ese fallo deja la app en blanco (ya pasó: commit `1445610`).

`npm run test:py` delega en `scripts/run-pytest.sh`, que localiza el intérprete: `$MAO_PYTHON` →
`.venv/` local → `.venv/` del repo principal (necesario **al trabajar en un worktree**, donde el cwd
no tiene `.venv` y caer a `python3` del sistema produce 7 fallos falsos en `test_comparator.py`) →
`python3`.

Las dependencias mínimas para correr la suite son `requirements-runtime.txt` +
`requirements-dev.txt`. **No hace falta `requirements.txt`**: arrastra `ultralytics` → torch +
torchvision (~313 MB) que solo sirven para re-exportar MobileSAM a ONNX offline. Verificado en venv
limpio: 369/2 sin torch ni matplotlib.

**Gotcha — aislamiento del event-loop asyncio (2026-06-12):** los tests sync que ejecutan corrutinas deben usar un **loop propio por llamada** (`asyncio.new_event_loop()` + `close()` en `finally`), nunca `asyncio.get_event_loop().run_until_complete()`. Otros archivos usan `asyncio.run()`, que al salir hace `set_event_loop(None)` y rompe `get_event_loop()` en Py3.9 (`RuntimeError: There is no current event loop` + `coroutine ... was never awaited`) — falla solo en la suite completa, no aislado. Patrón ya aplicado en `python/tests/test_phase4.py` y `test_bajo_contraste.py`. Los `test_bifacial_parity{,_v2}.py` hacen `pytest.skip(allow_module_level=True)` si falta la checkout externa `MAO_A`.

## Ventana de detección asistida (antes «modal IA») — confianza por objeto + análisis cancelable (2026-06-13)

Dos mejoras sobre la ventana de detección asistida (`#maoIaModal` · `js/mao-ia.js`, ids históricos):

- **#1 Confianza por objeto (lenguaje canónico LAAR · ADR-007).** El endpoint `/api/mao-ia` (`python/modules/mao_ia_analyzer.py`) ahora propaga `detection_confidence` (score ∈ [0,1]) y `confidence_level` (`alta`/`media`/`baja`) por objeto, reusando `detection._confianza_objeto` (import **perezoso** obligatorio: `detection.py` importa `_morpho_from_contour` de `mao_ia_analyzer` a nivel de módulo → el ciclo solo se evita con import diferido dentro de `detect_with_mao_ia`). En el modal: chip `.laar-chip --ok/--none/--wa` en el selector (solo media/baja, compacto), **columna «Confianza»** ordenable en la Tabla, **resumen de chips** en la cabecera de resultados, **filtro de triage** «solo baja confianza», y columnas `Confianza_nivel`/`Confianza_score` en el CSV del modal. Test: `python/tests/test_mao_ia_confidence.py` (3 tests).
- **#3 Cancelar + cronómetro.** El `fetch` pasó de `AbortSignal.timeout(120_000)` fijo a un `AbortController` propio (cancelable) con timeout duro de respaldo de 120 s (`abort('timeout')`). El overlay de progreso muestra **tiempo transcurrido** (cronómetro) y un botón **Cancelar** (`abort('user')`); el `catch` distingue cancelación de usuario, timeout y error real.

**Pendiente de verificación visual en Electron** (lección #1: `node -c`/health no ven layout/CSS): el flip de chips y el orden/filtro/cancelación con una imagen real. Verificado: backend (3 tests nuevos), suite completa (257 passed, 2 skipped) y `node -c`. Caché: `mao-ia.js?v=20260613a` en `index.html`.

## ADR-009 — Detección de P/H como tarea primaria (candidatos a confirmar) (2026-06-13)

Eleva perforaciones/horadaciones de tarea **secundaria/manual** a **primaria**: el backend detecta huecos internos **sin semillas** durante el análisis y los surge como **candidatos a confirmar**. Doc: `docs/ADR-009-deteccion-ph-primaria.md`. Decisiones JFRR: **sugerencias a confirmar** (no alteran métricas hasta confirmar) + **candidato sin tipo** (la profundidad pasante/ciega no es observable en 2D; el usuario asigna perforación/horadación). Aditivo, reversible.

- **Backend (Fase 1).** Antes, `contour.extract` rellenaba los huecos (`MORPH_CLOSE`) y usaba `RETR_EXTERNAL` → los P/H se destruían. Ahora se snapshotea `mask_raw_holes` **antes** del CLOSE y `detection.detect_holes()` (nueva) detecta huecos por **2 señales** sobre la silueta rellena: (1) interior clasificado como fondo (`silueta & ¬máscara`, también sin imagen para tests) y (2) **desviación de color** vs la mediana del cuerpo (`|gray−mediana|>max(25,1.5·std)`, silueta erosionada para excluir el borde) — la (2) capta through-holes **grises** y recesos en sombra que el umbral de blancos no veía. Filtra por área relativa al objeto, descarta huecos pegados al borde del ROI, confianza por hueco (`_confianza_hueco`). `/api/contour` emite `ph_candidates[]` en **coords absolutas** (`tipo:"candidato"`). Si GrabCut reemplazó la máscara, se omite. Tests: `python/tests/test_ph_candidates.py` (8).
- **Flujo (Fase 2).** `analysis-core.js` captura `obj.phCandidatos` en el choke point del contorno (junto a la confianza ADR-008); persistido en el caché. **NO** escribe en `obj.perforaciones`/`horadaciones`. El bloque `/contour` corre **también para objetos de detección asistida** (`_samSegmented`, antes excluidos) solo para capturar candidatos — la adopción del contorno/hull/confianza sigue gateada por `!_samSegmented` (no pisa ese contorno). `mao-analysis-organizer.js` añade el **4º estado** de `phEstado()`, con prioridad **hallazgos → candidatos → sin-ph → sin-evaluar** (NO usa `evaluado` por encima de candidatos: los objetos de detección asistida nacen con `perforaciones:[]`, lo que falseaba `evaluado`). Chip `--wa` «P/H: N candidatas — confirmar» + botón «Revisar P/H».
- **Modal (Fase 3).** `#perforationCanvasModal` precarga los candidatos como sugerencias (ámbar **discontinuo**, etiqueta `?N`) solo si el objeto no fue evaluado. Lista con **Perforación / Horadación / Descartar** por candidato (`confirmarCandidatoPH`/`descartarCandidatoPH`, expuestas en `window`). Al confirmar, el candidato pasa a su tipo y `finalizarTodosTrazados` (que filtra por tipo exacto → candidatos excluidos) lo guarda → el área neta se recalcula con la lógica existente (`calcularAreaEfectivaPH`, **sin cambios**). `sincronizarCandidatosPHEnObjeto()` mantiene `obj.phCandidatos` al día.
- **Telemetría (Fase 4).** `buildMonitorAnalisis` (contrato ADR-008) añade `ph_candidatos_detectados` vs `ph_confirmados`. Cache-bust: `analysis-core.js?v=20260614b`, `mao-analysis-organizer.js?v=20260614b`, `mao-deteccion-contract.js?v=20260613e`.
- **Fixes tras prueba real (2026-06-14).** La 1ª prueba (donut de detección asistida con hueco gris) reveló 3 defectos, corregidos: (a) hueco gris no detectado → señal de desviación de color en `detect_holes`; (b) objetos de detección asistida no capturaban candidatos → `/contour` corre también para ellos; (c) chip mostraba «sin P/H» → prioridad `phEstado` recolocada. Verificado por HTTP: gris 195/210/230 y oscuro 60 → detectados; sólido → 0.

**Invariante:** el área neta solo cuenta P/H **confirmados**; la detección automática propone, el humano dispone. **Verificado:** 268 passed/2 skipped, `node -c`, HTTP end-to-end (huecos blancos/grises/oscuros detectados, centroides absolutos exactos, 0 FP en sólido), boot Electron (0 renderer errors). **Pendiente manual:** chip+modal con la imagen real cargada (límite `<input type=file>`).

## Skills for Validation & Error Detection

### mao-launch (Pre-flight Checks)
Validates startup integrity before runtime:
- ✅ ESM syntax check (11 modules via `node -c`)
- ✅ Electron launch success
- ✅ Main process log analysis (0 critical errors)
- ✅ Backend health check (`/api/health` HTTP 200)
- ✅ Tier 1 API completeness (10/10 functions)

**Use case**: After code changes, before full app launch, to catch parse-time errors early.

### mao-console-analyzer v2 (Runtime Error Detection)
Monitors and captures runtime errors via IPC:
- ✅ Renderer error capture (via `window.addEventListener('error')` + IPC)
- ✅ Main process log analysis
- ✅ Error categorization & root cause analysis
- ✅ Auto-correction proposals

**Improvements in v2**:
- Added IPC-based renderer error capture (not just console.log)
- Captures ReferenceError, TypeError, unhandledRejection
- Writes to `/tmp/.mao_renderer_errors.log` for persistence
- Exposes `window.rendererErrors` API for manual inspection

**Use case**: Post-launch monitoring to detect runtime failures (scope loss, missing globals).

## Phase 4-5: Boot Metrics & Resilience

### Boot Metrics Instrumentation
Added comprehensive timestamp tracking for performance validation:
- `bootMetrics` object in main.js tracks: t_electron_ready, t_python_spawn, t_python_health_ok, t_window_created
- `analysis-core.js` init() reports: t_init_duration, t_total_boot
- Metrics sent via IPC to main process and logged: `[METRICS] {...}`
- Result: **2831ms average boot time**, 6.7% variability (< 10% threshold)

### Resilience Features
Validated in Phase 5 Evaluation:
1. **Watchdog recovery** — Backend auto-restart on health check failure (4s recovery time)
2. **Python fallback** — App continues in JS-only mode if Python unavailable
3. **Module error handling** — App doesn't boot loop if Python module fails
4. **Port conflict resolution** — Kills conflicting process, relaunches backend

**Bug fixed during evaluation** (pre-existing):
- Auto-restart condition: Changed `code !== 0 && code !== null` → `code !== 0`
- Reason: Process death via signal sets `code = null`, preventing restart

## Working Rules
- **Methodical execution** over diagnostic-generated plans — verify each step before the next.
- **No unnecessary exploration** — read specific files, not whole directories.
- **Preserve backward compatibility** — mao-ia.js and collection.js must not require changes.
- **IIFE wrapper is intentional** — required for Electron + ES6 module compatibility.
- High-risk state machines (Detection Engine, Manual Selection, Perforation Modal) are deferred.

## Lessons Learned: Safe ES6 Module Factorization

**Problem Discovered** (Phases 1-3 Evaluation):
When extracting utility-helpers.js as an ES6 module, the module lost access to **14 global variables** from the IIFE, causing a cascading ReferenceError pattern:
- Canvas state: `zoom` (30 refs), `offsetX`, `offsetY`, `image`, `canvas`
- DOM elements: `statusDiv`, `objectCountDisplay`, `zoomInput`, `zoomLevelDisplay`
- Data collections: `objects`, `lastDetectionStats`, `contourCache`
- Configuration: `PERFORMANCE_CONFIG`, `DEBUG_LOGS`

**Solution: viewState Pattern** (commits 8fc595a + 53392fa)
1. **Create centralized state object**: `viewState = { zoom, offsetX, ..., objects, ... }`
2. **Expose initialization function**: `initializeViewState(stateObject)` — called from analysis-core.js
3. **Update all extracted functions** to use `viewState.*` instead of bare globals
4. **Add null-safety checks**: `if (!viewState.element)` before accessing
5. **Pass callbacks explicitly**: Functions like `redraw()` passed as `viewState.redraw`

**Example Pattern**:
```javascript
// In utility-helpers.js
let viewState = { zoom: 0.5, offsetX: 0, image: null, ... };

export function initializeViewState(state) {
  viewState = { ...viewState, ...state };
}

export function canvasToImageCoords(x, y) {
  if (!viewState.image) return { x: 0, y: 0 };
  const zoom = viewState.zoom; // Use viewState
  // ... rest of logic
}
```

**Key Takeaways**:
- ✅ **ALWAYS pass globals as parameters** when extracting to modules
- ✅ **Create state synchronization layer** for complex interdependent functions
- ✅ **Validate at module boundary** with null/undefined checks
- ✅ **Test post-extraction** with skills: mao-launch (pre-flight) + mao-console-analyzer (runtime)
- ✅ **Use 5-phase evaluation** if uncertain: Static, Pre-flight, Runtime, Metrics, Resilience

**Prevention**:
- Use `mao-launch` skill for pre-extraction validation (SyntaxError, Tier 1 API, backend)
- Use `mao-console-analyzer` skill for post-extraction runtime monitoring (ReferenceError, TypeError)
- Extract one module at a time, validate before proceeding
- Document global dependencies in module header (see utility-helpers.js lines 1-25)

## Migración LAAR — Fases A-B Completadas (2026-06-08)

### Cambios Implementados

| Fase | Actividad | Archivo | Cambios |
|------|-----------|---------|---------|
| A3 | innerHTML → API DOM nativa | `js/mao-tab-router.js` | CSP-compatible (sin dynamic HTML) |
| A4 | sessionStorage persistence | `js/mao-tab-router.js` | Estado sobrevive `Ctrl+R` |
| A5 | HMR-safe guard | `js/mao-tab-router.js` | Eliminación explícita previo rebuild |
| B1 | contextBridge maoTabRouter | `preload.js` | Exposición segura del API |
| B2 | Electron BrowserWindow | `main.js` | `titleBarStyle: 'hiddenInset'`, zoom disabled |
| B3 | Meta CSP | `index.html` | `default-src 'self'` |
| B4 | webkit-app-region | `css/mao-tabs-laar.css` | Arrastre nativo macOS/Windows |

**Archivos clave:**
- `js/mao-tab-router.js` — LAAR tab router + state management + `setSectionVisible` (clase autoritativa `.mao-panel--hidden`)
- `css/mao-tabs-laar.css` — Design tokens LAAR + layout tabbar + sección "ESTÉTICA LAAR — COMPONENTES"
- `main.js` — BrowserWindow config (`titleBarStyle: 'hiddenInset'`, zoom)
- `preload.js` — contextBridge API exposure
- `index.html` — CSP meta + script/css links (con `?v=` cache-busting)

### Reversibilidad
Comentar 2 líneas en `index.html` restaura sidebar original:
```html
<!-- <link rel="stylesheet" href="css/mao-tabs-laar.css"> -->
<!-- <script src="js/mao-tab-router.js" defer></script>   -->
```

### Próximas Fases (Opcionales)
- **C1**: sessionStorage validation en flujo (detection:done, analysis:done)
- **C2**: HMR testing con Vite
- **C3**: Font fallback para Linux
- **D1-D4**: DevTools validation checklist

## Migración LAAR — Fixes de Runtime + Estética (2026-06-09)

Verificado lanzando la app real en Electron (no solo `node -c`/health). Las pestañas ahora se ven y funcionan, y la estética LAAR se extendió a los componentes.

### Cambios

| # | Problema | Archivo | Fix |
|---|----------|---------|-----|
| R1 | Tabbar oculto bajo el header fijo (`#maoHeader` z9000 vs tabbar z10, ambos y=0) | `css/mao-tabs-laar.css` | `body { padding-top: var(--laar-topbar-h) }` (la regla previa `body,html{padding:0}` anulaba la compensación de `main.css`) |
| R2 | Secciones de la pestaña activa en `display:none` por la nav legacy (`.mao-panel--hidden !important`, corre en DOMContentLoaded tras el router `defer`) | `js/mao-tab-router.js` | `setSectionVisible` usa la clase autoritativa; re-afirmado en listener `DOMContentLoaded` registrado en boot (corre último) |
| E1 | Estética LAAR solo en tabbar/topbar | `css/mao-tabs-laar.css` | Sección "ESTÉTICA LAAR — COMPONENTES" (`.mao-main`): fieldsets/tarjetas planos, botones (secundario blanco + azul primario, rojo/ámbar), tabs CMO/bifacial |
| E2 | Botones estilizados por ID en `main.css` (especificidad 1,0,0) | `css/mao-tabs-laar.css` | `!important` en la capa override (main.css no usa `!important` en botones) |

### Lecciones
- **Validar pestañas/CSS exige runtime visual o inspección del DOM**, no basta con `node -c` + health check (no ven layout/CSS).
- **Caché de CSS `file://`**: bump `?v=` en `index.html` al editar cualquier `.css`, o el cambio no se ve al relanzar.
- **Inspección de DOM/CSS en runtime fiable**: `mainWindow.webContents.executeJavaScript(...)` desde `main.js` volcando a stdout (la consola de DevTools acoplada queda cortada).

### Reversibilidad
Comentar el `<link>` de `mao-tabs-laar.css` (incl. la estética) y el `<script>` del router en `index.html` restaura el sidebar + estilo "cuaderno de campo" originales.

## Fix: Carga de Imagen + Metadatos EXIF + CR3 (2026-06-09)

Verificado en Electron. Problema reportado: "al cargar la imagen no se carga y no lee los metadatos".

### Causa Raíz

Dos bugs independientes en `js/analysis-core.js`:

**Bug 1 — scope IIFE vs módulo ES6 (JPG + RAW)**
`UtilityHelpers.procesarMetadatos()` y `UtilityHelpers.cargarMetadatos()` son funciones exportadas desde `utility-helpers.js`. Esa versión del módulo referencia `cameraModelInput`, `focalInput`, `apertureInput`, `sensorWidthInput`, `sensorHeightInput` y `sensorSizes` como variables sueltas — pero esas variables viven dentro del IIFE de `analysis-core.js`, no en el scope del módulo ni en `window`. Resultado: `ReferenceError` silencioso capturado por el `try/catch` del handler, que:
- Dejaba los campos de cámara vacíos
- No actualizaba el estado (`actualizarEstadoProcesamiento()` nunca corría)
- El status quedaba "MAO listo. Cargue una imagen..."

Existen versiones locales correctas en el mismo IIFE: `cargarMetadatos()` (línea ~13245) y `procesarMetadatos()` (línea ~13341) que sí tienen acceso a todo el scope.

**Bug 2 — CR3 no soportado por exifr.js**
`exifr.js` (full.umd.js v7.1.3) no implementa el parser CR3 de Canon (formato ISOBMFF/`ftyp crx`). `exifr.parse()` lanza "Unknown file format". El error no era manejado: el RAW CR3 no quedaba registrado y el flujo se cortaba.

### Fix Aplicado

| # | Llamada anterior | Llamada corregida | Afecta |
|---|-----------------|-------------------|--------|
| 1 | `UtilityHelpers.cargarMetadatos(file)` | `cargarMetadatos(file)` | JPG handler |
| 2 | `UtilityHelpers.procesarMetadatos(exifData, false)` | `procesarMetadatos(exifData, false)` | JPG handler |
| 3 | `UtilityHelpers.cargarMetadatos(file)` | `cargarMetadatos(file)` | RAW handler |
| 4 | `UtilityHelpers.procesarMetadatos(exifData, true)` | `procesarMetadatos(exifData, true)` | RAW handler |
| 5 | `UtilityHelpers.cargarMetadatos(file)` | `cargarMetadatos(file)` | bifacial JPG cara A/B |
| 6 | `UtilityHelpers.cargarMetadatos(file)` | `cargarMetadatos(file)` | bifacial RAW cara A/B |
| 7 | `UtilityHelpers.procesarMetadatos(metadatos, ...)` | `procesarMetadatos(metadatos, ...)` | bifacial handler |

**CR3 graceful**: En los handlers RAW (monofacial y bifacial), `cargarMetadatos` ahora está envuelto en su propio try-catch. Si el error es "Unknown file format" / "sin metadatos EXIF" / "vacíos o no legibles", el archivo queda registrado con `metadatos: null` y muestra: _"Archivo CR3 cargado. Metadatos no disponibles — ingrese focal, sensor y apertura manualmente."_

### Resultado Verificado (Electron)
- ✅ JPG carga, canvas muestra imagen, campos de cámara se pueblan desde EXIF (CANON EOS R8, focal 100mm, f/8, sensor 35.9×23.9mm)
- ✅ CR3 se registra sin crash; advertencia clara en status y consola
- ✅ Modo híbrido JPG+RAW activo: "Listo para calcular escala híbrida JPG+RAW"

### Gotcha Permanente: funciones duplicadas en analysis-core.js vs utility-helpers.js
`utility-helpers.js` contiene versiones de `cargarMetadatos` y `procesarMetadatos` que **NO funcionan** desde el módulo porque usan variables del IIFE. Las funciones locales del IIFE (sin prefijo `UtilityHelpers.`) son las correctas. No usar `UtilityHelpers.cargarMetadatos` ni `UtilityHelpers.procesarMetadatos` desde dentro del IIFE.

## ADR-001: Guards de Flujo UI (2026-06-09)

Optimización del flujo de pestañas LAAR. **Opción A** del ADR (mínima invasión, reusa el mecanismo `locked/unlock` existente). Solo `js/mao-tab-router.js` — reversible.

### Implementado
- **Guards de prerrequisito**: pestañas `analisis` y `resultados` arrancan `locked: true`. Ya no se puede llegar a Análisis con el panel vacío.
- **Desbloqueo por evento de negocio** (en `bindMaoEvents`):
  - `mao:detection:done` → `unlock('analisis')` (+ `markDone('captura')`). `unlock` va **antes** de `go()` porque `go()` rechaza pestañas bloqueadas.
  - `mao:analysis:done` → `unlock('resultados')` (+ `markDone('analisis')`).
  - El handler legacy `stepCompleted` (`deteccion`/`analisis`) hace los mismos unlocks por consistencia.
- **Re-derivación de guards al restaurar `sessionStorage`** (en `boot`): si `state.done` incluye `captura`/`analisis`, se desbloquea la pestaña siguiente (caso reabrir proyecto avanzado). Si la pestaña activa restaurada quedó bloqueada, cae a la primera desbloqueada vía `firstUnlockedFrom`.
- **Eliminado stub muerto** `mao:scale:set` (listener vacío, evento nunca despachado).

### Deuda técnica conocida (no abordada)
- **F3 — nodo compartido**: `sidebarResultCard` y `sidebarActionsSection` figuran en `sections[]` de `analisis` Y `resultados`. Funciona hoy (status-quo C-γ, riesgo bajo: el nodo es físicamente único tras `relocateOrphanedControls`). El ADR propuso **C-β** (sacarlos de `sections[]` + `position:sticky` para que el resultado quede siempre visible) — **diferido**: es cambio de layout y exige verificación visual en Electron (lección #1: `node -c`/health no ven CSS).
- **F4 — radios hardcoded**: `applyModeVisibility`/`readMode` leen los IDs legacy `objectDimension3D` y `modoBifacial` directamente. Acoplamiento de bajo riesgo (IDs estables). El fix de mayor altitud sería que la nav legacy emita un evento con el modo y el router solo lo escuche (ya existe el listener `mao:object-dimension-changed`).

### ⚠️ Pendiente de verificación visual en Electron
Los guards son lógica pura (verificados con `node -c`), pero el flujo completo arranque→captura→detección→análisis→resultados con desbloqueo progresivo **no se ha corrido en Electron**. Validar con `npm start` (matar+relanzar, no Cmd+R).

## ADR-005: Armonización Transversal de las Pestañas LAAR (2026-06-12)

ADR **ortogonal** a ADR-002/003/004 (que rediseñaron una pestaña cada uno, en sesiones separadas, y al hacerlo derivaron). No rediseña ninguna pestaña: (1) define el **lenguaje canónico compartido** y (2) reconcilia la deriva. La próxima pestaña (Resultados) hereda el lenguaje gratis. Método completo (protocolo de 6 pasos + inventario D1–D5) en `docs/ADR-005-armonizacion-transversal.md`. Decisión JFRR: Doc + Fase 1 + Fase 2, migración **aditiva con alias**. Reversible.

### Lenguaje canónico (el «idioma único»)
- **Chips** `.laar-chip` + `.laar-chip--ok/--wa/--none` (color = **estado real**, no decoración: `wa`=pendiente · `ok`=hecho · `none`=neutro/cero-decidido) + `.laar-chip--lg` (versalita por CSS).
- **Copy** en **sentence case** siempre (no «SIN EVALUAR»); el énfasis mayúscula lo aplica `--lg`, no el string fuente.
- **Cabecera** `.laar-header` (`position:sticky; top:0`).
- Definido en `css/mao-tabs-laar.css`, sección «ADR-005 — CAPA CANÓNICA TRANSVERSAL». Las clases `.adr2-/.adr3-/.adr4-` preexistentes siguen intactas.

### Implementado
| # | Eje | Cambio |
|---|-----|--------|
| **D1** ⚠ | Bug de layout (sticky `top`) | `#adr2Header` y `#adr3ProyectoHeader` usaban `top: calc(topbar+tabbar)` → **duplicaban** el offset (el `body` ya aporta el `padding-top`). Corregido a `top:0` para las **tres** cabeceras. Resuelve la contradicción ADR-003 («top:0 quedaría detrás») vs ADR-004 («top:0 es correcto»): **ADR-004 tenía razón**. |
| **D2** | Familia de chips | `.adr2-chip*` (Análisis) y `.adr3-chip*` (Proyecto/Captura) → canónica `.laar-chip*`. Geometría densa de Análisis preservada con override acotado (`#adr2Header .laar-chip`, `.adr2-ph-card .laar-chip`). |
| **D3** | Copy/mayúsculas | Tarjeta P/H de Análisis «SIN EVALUAR»/«EVALUADO · SIN P/H» → sentence case + `--lg`. |
| **D4** | Helpers JS triplicados | Nuevo `js/mao-organizer-base.js` (`window.MaoOrganizer`: `setChip`/`isVisible`/`readMode`/`modoFlujo`/`toast`/`bootWhenReady`/`log`/`el`/`$`). Los 3 organizers migrados a `MO.*` (~120 líneas de duplicación eliminadas). |
| **D5** | Naming de cabecera | `.laar-header` canónica (para Resultados y adopción futura). |

### ⚠️ Gotcha de carga
`js/mao-organizer-base.js` es **dependencia dura** de los tres organizers: su `<script>` debe ir **antes** que `mao-analysis/proyecto/captura-organizer.js` en `index.html` (ya colocado tras `mao-tab-router.js`). Comentar la base sin comentar los organizers los rompe (`ReferenceError: MaoOrganizer`). Para desactivar una pestaña, comentar **su** organizer, no la base.

### Verificado en Electron (sonda DOM, 2026-06-12)
`MaoOrganizer:true` · `#adr3ProyectoHeader` → `sticky, top:0px, rectTop:70` (justo bajo las barras, = Captura) · chip = `laar-chip laar-chip--ok` (pill 999px, verde) · renderer errors `0`. La base cargó antes que los organizers; D1 confirmado.

### Pendiente
- Flip de chips con **archivos reales** (los `<input type=file>` no se pueblan por script) — mismo límite manual heredado de ADR-003/004.
- `#adr2Header` (Análisis) solo se construye al renderizar un análisis; su `top:0` no se probó en vivo pero usa la regla canónica ya verificada en Proyecto.
