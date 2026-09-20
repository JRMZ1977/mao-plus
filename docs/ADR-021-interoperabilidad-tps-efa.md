# ADR-021 — Interoperabilidad de las exportaciones morfométricas: semilandmarks TPS con correspondencia y coeficientes EFA en el convenio de Kuhl & Giardina

**Estado:** ✅ Implementado · 2026-09-18 · MAO Plus **1.3.1** (rama `claude/interop-tps-efa`, sobre `fe84b9d`)
**Contexto previo:** O-16 (`MEMORIA-MATEMATICA-MAO-PLUS.md` §6.2, síntesis EFA corregida el
2026-09-13), `AUDITORIA-EXPORTACION-20260912.md` §9 (TPS/EFA del lote), ADR-017 F2
(`efa.reconstruct()` como generador de plantillas).
**Nota de versión:** `docs/NOTA-VERSION-1.3.1.md` — 🟠 **cambian valores ya exportados**.

---

## 1. Problema

Dos defectos de interoperabilidad hallados leyendo el código, no reportados por ningún usuario.
Los dos hacen lo mismo: el archivo **se abre sin error** en el programa de destino y da un
resultado **equivocado sin aviso**.

### 1.1 El TPS no daba correspondencia de puntos entre especímenes

`_generarLandmarksSemiAutomaticos(contourPoints, 32, 10)` (`js/analysis-core.js`) construía
`merged = [...uniform, ...curvPts]`: 22 puntos equidistantes en longitud de arco **desde `pts[0]`**
seguidos de 10 puntos de curvatura máxima de Menger **añadidos al final**, luego deduplicados y
recortados a 32. Tres consecuencias, medidas sobre el código de 1.3.0:

| Defecto | Medido |
|---|---|
| El punto i de un espécimen no es el punto i de otro (inicio = primer punto del contorno, que depende de la rotación de la foto; los de curvatura, propios de cada pieza y fuera de orden) | copias **exactas** de la misma forma (girada, con otro inicio, recorrida al revés): distancia de Procrustes **0,38–1,41** |
| El número de puntos variaba con la deduplicación | `LM=` 30/31/32 según el contorno → `geomorph::readland.tps` **no devuelve la matriz** de un archivo así |
| Contornos reales de OpenCV (4 formas × 7 rotaciones rasterizadas) | 0,17–0,83, y 11 de 24 pares con `LM=` distinto |

`_generarTextoTPSLandmarks` / `_generarTpsMultiEspecimen` los escribían en archivos destinados, según
sus propios comentarios, a tpsRelw y `geomorph::readland.tps()`: un GPA sobre ellos empareja puntos
no homólogos. Había **dos generadores más** con el mismo problema de inicio: el del modal IA
(`js/mao-ia.js`, 32 equidistantes desde `pts[0]`) y el panel de fuentes P/H.

Además, `landmarks/landmarks.tps` del lote metía **el contorno y cada P/H como especímenes del mismo
archivo**. Un TPS multi-espécimen es la misma estructura en individuos distintos; tpsRelw o
`gpagen` habrían superpuesto una perforación contra el contorno de la pieza.

### 1.2 Los coeficientes EFA exportados no estaban en el convenio de Kuhl & Giardina

`python/modules/efa.py` calcula `a_k(MAO)=b_k(K&G)`, `b_k(MAO)=−a_k(K&G)`, `c_k(MAO)=d_k(K&G)`,
`d_k(MAO)=−c_k(K&G)` — es decir `M_k(MAO) = M_k(K&G)·R(π/2)`. La cabecera lo documentaba desde O-16,
pero **los tres productores de CSV EFA exportaban esos coeficientes tal cual**:

| Productor | Columnas | Rótulo |
|---|---|---|
| `_generarCsvEFA` (panel y lote) | `a_norm…d_norm, a_raw…d_raw` | ninguno |
| `_buildEfaCsvContent` («Exportar colección…») | `an,bn,cn,dn` | **«Método: Kuhl & Giardina (1982)»** |
| CSV de coeficientes del comparador CMO | `an,bn,cn,dn` | ninguno |

Cargados en pyefd o Momocs describen otra curva: sobre la forma trilobulada de los tests, la
circularidad de la curva sintetizada por la serie canónica es **0,856 frente a 0,706 real** (+21 %);
los crudos difieren de los de K&G hasta 6,06 sobre magnitudes de 5,4.

### 1.3 Dos hallazgos al verificar contra una referencia externa

**(a) O-28 · ambigüedad de 180° de la normalización — también en el descriptor interno.** θ₁ sólo
está definido módulo π: qué extremo del eje mayor del 1er armónico se toma depende del **punto de
inicio** del contorno. En formas con armónicos pares, esos coeficientes normalizados cambian de signo
según dónde empiece el contorno. La misma forma trilobulada con otro punto de inicio sale a
**`d_EFD` = 0,589, similitud 0,629, «Formas moderadamente distintas»**. Es propia de la normalización
de K&G (pyefd y Momocs la comparten: con los `*_kg` la distancia es la misma 0,589).
`tests/test_efa.py::test_invariance_start_point` usa una **elipse**, que no tiene armónicos pares, y
por eso no podía verlo. Afecta a `efa.compare`/`d_EFD` (APS/Procrustes), a los coeficientes medios
de secciones 3D (`obj3d_v2`, que promedia signos opuestos) y a cualquier PCA sobre normalizados. **No**
afecta al espectro de potencia ni a la varianza explicada (normas por armónico), ni por tanto a la
clasificación por firma espectral (§6.5 de la memoria).

**(b) La afirmación de O-16 «morfoespacio isométrico al de K&G» era falsa en general.** El residuo
entre normalizados MAO y K&G es `R((1−k)π/2)` cuando θ₁ MAO = θ₁ K&G − 90°, pero **cambia de signo en
los armónicos pares** cuando es + 90°, y cuál toca depende de la forma y del inicio. La medición del
2026-09-13 (máx. 1,7·10⁻¹⁶ sobre 15 pares) cayó en formas con la misma rama. Medido ahora: hasta
**0,31** de diferencia en `d_EFD` entre convenios.

### 1.4 Un tercer defecto en el camino: el EFA retroactivo de la colección

`enrichCollection` pedía `PythonBridge.efa.calculate(pts, { n_harmonics: 40 })`, pero las opciones del
puente se llaman `nHarmonics` / `scalePxMm`: se ignoraban y el EFA salía con 20 armónicos **en
píxeles** y `scale_px_mm: 1`, que el CSV declaraba como «1 mm/px».

## 2. Decisión

**No se toca el descriptor interno** (`coefficients`, `coefficients_raw`, `normalization`), ni las
distancias, ni ninguna métrica: la guardia `test_el_descriptor_interno_de_mao_no_cambia` fija los
valores de 1.3.0. Todo lo demás es aditivo en el backend y afecta sólo a lo que se exporta.

### 2.1 EFA: exportar en el convenio de Kuhl & Giardina

- `efa.calculate` publica además `coefficients_raw_kg`, `coefficients_kg`, `normalization_kg` y
  `coefficient_convention` (convenio de cada campo). Los `*_kg` van **sin redondear**.
  - `coefficients_raw_kg` = `pyefd.elliptic_fourier_descriptors(contorno cerrado, t = 0 en el primer
    punto)` — por conversión exacta de los crudos MAO (`_mao_a_kuhl_giardina`, permutación con signo).
  - `coefficients_kg` = normalización de K&G §4 **tal como la hacen pyefd (`normalize_efd`) y Momocs
    (`efourier_norm`)**: θ₁, ψ₁, |a₁|. Se **renormaliza** desde los crudos convertidos; convertir los
    normalizados de MAO no basta (la rama de θ₁ difiere, §1.3 b).
  - **Sin canonizar la quiralidad**, a diferencia del descriptor interno (d₁ ≥ 0). Motivos: paridad
    exacta con pyefd/Momocs, y que la serie reconstruya la pieza y no su imagen especular. El signo de
    d₁ informa del sentido de recorrido.
- Los tres CSV salen de **una sola fuente**, `MaoInteropGMM.csvEFA` (`js/mao-interop-gmm.js`):
  columnas `a_norm_kg…d_norm_kg, a_raw_kg…d_raw_kg` primero; las internas se conservan como
  `*_norm_mao` para reproducir las `d_EFD` de MAO. El sufijo va en el nombre **a propósito**: un script
  que leía `a_norm` falla en vez de mezclar convenios. Los metadatos nombran el convenio, su origen, la
  normalización, la ambigüedad de 180° y el sistema de coordenadas.
- Análisis guardados antes de 1.3.1 (sólo convenio MAO): los `*_kg` se **derivan** en el renderer de
  `coefficients_raw` (redondeados a 1e-8 por el backend: error ≤ 1,4·10⁻⁹ medido) y el CSV lo declara
  (`Origen_kg = derivado`). Sin crudos no se inventan: columnas vacías y «no disponible».
- Los JSON (`_efa_data` del análisis guardado, APS/Procrustes) declaran el convenio y llevan el juego
  K&G. Los botones «Copiar JSON/Firma» de las secciones 3D se rotulan como convenio interno.
- `efa.reconstruct(..., convenio="kuhl_giardina_1982")` sintetiza coeficientes de K&G (p. ej. un banco
  exportado desde Momocs para `registrar_plantilla_efa`).

### 2.2 TPS: semilandmarks con correspondencia reproducible

`MaoInteropGMM.semilandmarksContorno` — **fuente única** para el panel, el lote, la colección y el
modal IA:

1. **N = 64** puntos equidistantes en longitud de arco, en orden de contorno. Fijo para todo espécimen.
2. **Sentido** antihorario en pantalla (un contorno horario se invierte).
3. **Inicio = el de la normalización EFA**: la fase θ₁ de Kuhl & Giardina, que alinea la
   parametrización con un extremo del semieje mayor de la elipse del 1er armónico (el pedido original).
4. **Qué extremo** (θ₁ es módulo π): el hacia el que la **asimetría** del contorno (tercer momento
   estandarizado, exacto por segmento) es positiva a lo largo del eje mayor; si ésta es menor que un
   cuarto de la del eje menor —forma en «D», p. ej. un disco partido— decide el eje menor. Invariante
   a traslación, rotación, escala, punto de inicio y sentido de recorrido.
5. `inicio.estable = false` —y un `ATENCION` en el `COMMENT=`— cuando el inicio puede no reproducirse
   entre fotos de la misma pieza: 1er armónico casi circular (b/a > 0,95) o forma casi simétrica
   (asimetría < 0,02; el ruido de píxel medido es ≤ 0,003 a ~500 px y ~0,01 a ~100 px).
6. Son **semilandmarks deslizantes**. `curveslide.csv` sigue el convenio que documenta geomorph para
   curvas cerradas, `define.sliders(c(1:N, 1))`: el punto 1 (el inicio, punto construido de tipo III)
   queda fijo y deslizan 2…N. Sin un punto fijo toda la curva podría deslizar en bloque.
7. Los puntos de curvatura máxima quedan como **ayuda visual opcional** (botón «Curvatura (visual)»):
   un CSV rotulado «NO SON LANDMARKS», nunca un TPS.

`COMMENT=` único y ASCII (readland.tps lo ignora; tpsDig/tpsRelw no siempre leen UTF-8) documenta
N, inicio, sentido, deslizamiento, sistema de coordenadas y escala.

### 2.3 Qué va en un TPS con varios especímenes

- **Lote de un análisis:** un TPS por estructura (`landmarks/contorno.tps`, `landmarks/P1.tps`…) más
  `landmarks/curveslide.csv`. Se **retira** `landmarks/landmarks.tps` (contorno + P/H mezclados).
- **Colección:** formato nuevo **«TPS — Contornos de la colección»** en «Exportar colección…»: un
  espécimen (el contorno) por pieza, `ID=` = carpeta, `SCALE=` de las métricas
  (`factorMmPxDeAnalisis`, no del `1` de `geometria.json`). Desactivado por defecto: con `options={}`
  «Actualizar colección» se comporta como antes. Si unas piezas tienen escala y otras no, se avisa:
  `readland.tps` sólo aplica `SCALE=` si **todos** los especímenes la traen.

### 2.4 Lo que NO se decide aquí

- **O-28 en el descriptor interno.** Resolver la ambigüedad (p. ej. con el mismo criterio de extremo
  que el TPS) cambia `coefficients`, `d_EFD`, el comparador y los bancos de plantillas → **ADR propio
  con recálculo** («viejos y nuevos no se mezclan»). Los `*_kg` la conservan a propósito: son los de
  pyefd/Momocs, y quien los use ahí se encontrará lo mismo.
- **Eje y del TPS.** Las coordenadas siguen en el sistema de la imagen (origen arriba-izquierda, y
  hacia abajo), como siempre, y ahora el `COMMENT=` lo dice. tpsDig usa origen abajo-izquierda: para
  mezclar con datos digitalizados en tpsDig hay que invertir y. Cambiarlo exige la altura de la imagen
  en cada salida y es otro cambio de valores exportados.

## 3. Implementación

| Archivo | Cambio |
|---|---|
| `python/modules/efa.py` | `_mao_a_kuhl_giardina`; `_normalize_coeffs(canonizar_quiralidad=True)`; campos `*_kg` + `coefficient_convention` en `calculate`; `reconstruct(convenio=…)`; cabecera corregida (§1.3) |
| `python/server.py` | docstring de `/api/efa` |
| `python/modules/shape_template.py` | `registrar_plantilla_efa(..., convenio=…)`: un banco exportado de Momocs/pyefd registra la misma plantilla que su equivalente MAO |
| `js/mao-interop-gmm.js` (nuevo) | `kgDesdeMao`, `normalizarKG`, `efaKuhlGiardina`, `efaConConvenio`, `csvEFA`, `semilandmarksContorno`, `curveslideCerrado`, `bloqueTPS`, `puntosCurvaturaMaxima`, `csvCurvaturaVisual` |
| `js/analysis-core.js` | TPS y CSV EFA delegan en el helper; fuentes con su contorno; lote por estructura + `curveslide.csv`; retirado el generador antiguo y `_landmarks_semiauto`; `_efa_data` del análisis guardado con convenio |
| `js/project-manager.js` | CSV EFA de colección desde el helper; formato `tps`; EFA retroactivo con `nHarmonics`/`scalePxMm` |
| `js/comparator.js` | CSV de coeficientes del CMO en K&G + `*_mao` + nota de convenio |
| `js/mao-ia.js` | TPS del modal IA con los mismos semilandmarks (+ `SCALE=` si hay escala) |
| `js/procrustes.js` | APS: `efaCoeficientesConvenio` y `efaCoeficientesKG` |
| `js/obj3d-viewer.js` | rótulos de convenio en «Copiar Firma/JSON» |
| `js/mao-resultados-organizer.js`, `index.html` | casilla «TPS — Contornos de la colección»; carga del helper; cache-bust `?v=20260918a` |
| `package.json`, `js/mao-version.js` | **1.3.1** |

## 4. Verificación

**Suite:** Python **592 → 649 passed, 0 skipped** (+57, línea base 1.3.0 re-ejecutada en el mismo
entorno) · `npm run test:js` en verde (nuevo `tests/test_tps_semilandmarks.js`) · ESM 17/17.
**Cada test nuevo se ejecutó contra `fe84b9d` y falla allí** por el contenido, no por un nombre:

| Test | Contra | En 1.3.0 |
|---|---|---|
| `python/tests/test_efa_kuhl_giardina.py` (57) | K&G escrito aparte en el test (ecs. 6-7 y §4, convenios de pyefd) y, si está instalado, **pyefd**; y la **definición**: la serie canónica reconstruye el contorno | 56 fallan; pasa sólo la guardia del descriptor interno, que existe para eso |
| `tests/test_efa_tps_export.js` §G-H | K&G escrito en JS aparte del helper | 19 fallos |
| `tests/test_tps_semilandmarks.js` | Procrustes (tamaño 1, sin reflexión) entre copias | 15 fallos: d = 0,38–1,41; `LM` 30/32/32/31 |
| `tests/test_export_lote.js` (6 nuevos) | archivos escritos por `enrichCollection` | 6 fallos, p. ej. `opciones={"n_harmonics":40}` |

Tolerancias: crudos K&G a ≤ 10⁻¹⁰ relativo de la referencia (medido: ≤ 3·10⁻¹³ absoluto); normalizados ≤ 10⁻¹⁰;
derivados de crudos redondeados a 1e-8, 1,4·10⁻⁹. `pyefd` **no** está instalado en el `.venv` del
proyecto: la referencia de la tabla es la transcripción de las ecuaciones; el test se amplía solo si
se instala. La «referencia usada en la verificación de 1.3.0» no se conservó en el repositorio.

**Robustez del inicio con contornos reales de OpenCV** (rasterizados, `findContours`, 24 rotaciones):
formas lisas asimétricas d ≤ 0,012; fragmentos de disco al 50/70/85 % (forma en «D», decide el eje
menor) d ≤ 0,031; ningún par por encima de 0,05. Con el generador de 1.3.0, 0,17–0,83.

**Pendiente:** verificación visual en Electron de la casilla nueva del modal «Exportar colección…» y
del texto del panel EFA (`node --check` no ve la maquetación); probar la carga real en R
(`geomorph::readland.tps` + `gpagen(curves=)`, `Momocs`) — aquí sólo se verificó el formato contra el
código fuente de geomorph (`define.sliders`, `readland.tps`).

## 5. Reversibilidad

El descriptor interno no cambió, así que revertir no invalida nada calculado. Revertir el commit
devuelve los formatos de 1.3.0; los análisis guardados con 1.3.1 conservan campos `*_kg` adicionales
en `_efa_data`, que 1.3.0 ignora.
