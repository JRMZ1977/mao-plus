# MAO Plus 1.3.1 — nota de versión

**Fecha:** 2026-09-18 · **Rama:** `claude/interop-tps-efa` (sobre 1.3.0, `fe84b9d`)
**Decisión:** `docs/ADR-021-interoperabilidad-tps-efa.md`

## 1. Qué es esta versión

Una corrección de **interoperabilidad**: lo que MAO exporta para otros programas de morfometría
(Momocs, pyefd, geomorph, tpsRelw) se abría sin error y daba resultados equivocados. **El motor no
cambia**: ni el descriptor EFA interno, ni las distancias, ni ninguna métrica del informe. Cambia lo
que sale en los archivos TPS y en las columnas de coeficientes EFA.

## 2. ⚠ Valores que cambian respecto de 1.3.0 (no mezclar exportaciones sin leer esto)

| Salida | 1.3.0 | 1.3.1 | Por qué |
|---|---|---|---|
| Puntos de los TPS (panel, lote, modal IA) | 32 «semi-landmarks»: equidistantes desde el primer punto del contorno + curvatura máxima añadida al final; entre 30 y 32 según la pieza | **64 semilandmarks** equidistantes en orden de contorno, inicio en el extremo del eje mayor del 1er armónico EFA (θ₁), sentido antihorario | sin correspondencia: dos fotos de la misma pieza daban distancia de Procrustes 0,4–1,4; `LM=` variable impedía leer el archivo en geomorph |
| `landmarks/landmarks.tps` del lote | contorno y P/H como especímenes de un mismo archivo | **retirado**; un TPS por estructura + `landmarks/curveslide.csv` | un GPA habría superpuesto una perforación sobre el contorno |
| TPS con varios especímenes | — | nuevo formato **«TPS — Contornos de la colección»** (un espécimen por pieza) en «Exportar colección…», desactivado por defecto | es el TPS multi-espécimen que sí tiene sentido |
| Nombre del archivo TPS descargado | `…_landmarks.tps` | `…_semilandmarks.tps` | el contenido es otro |
| `COMMENT=` del TPS | dos líneas («semi-landmarks (curvatura + arco)») | una línea ASCII que documenta N, inicio, sentido, deslizamiento, coordenadas y escala | geomorph lo ignora; es para el lector |
| Columnas del CSV EFA (panel, lote, colección) | `a_norm…d_norm, a_raw…d_raw`: convenio **interno** de MAO sin rotular | `a_norm_kg…d_norm_kg, a_raw_kg…d_raw_kg` (**Kuhl & Giardina**, las de pyefd/Momocs) + `a_norm_mao…d_norm_mao` (internas) | leídas como K&G describían otra curva: circularidad 0,856 frente a 0,706 real |
| CSV EFA de «Exportar colección…» | `harmonic,an,bn,cn,dn` con «Método: Kuhl & Giardina (1982)» sobre coeficientes MAO | el mismo CSV que el del análisis | rótulo falso |
| CSV de coeficientes del comparador CMO | `an,bn,cn,dn` internos | columnas K&G + `*_mao` + `origen_kg` y nota de convenio | ídem |
| Metadatos del CSV EFA | `theta_1_deg`, `psi_1_deg`, `convenio_quiralidad` | `theta_1_deg_kg/_mao`, `psi_1_deg_kg/_mao`, `Convenio_kg`, `Origen_kg`, `Ambiguedad_180`, `Version_MAO`… | cada campo, un nombre único |
| `/api/efa` y `_efa_data` guardado | sólo convenio MAO | + `coefficients_kg`, `coefficients_raw_kg`, `normalization_kg`, `coefficient_convention` | aditivo: los campos internos no cambian |
| EFA retroactivo de «Actualizar colección» | 20 armónicos **en píxeles**, `scale_px_mm: 1` (el CSV decía «1 mm/px») | 20 armónicos en mm con la escala del análisis, o 0 = «sin escala» | las opciones se llamaban `n_harmonics` en vez de `nHarmonics`/`scalePxMm` |
| `versionMAO` / `mao_version` | `1.3.0` | `1.3.1` | para distinguir exportaciones de antes y después |

**Análisis guardados con 1.3.0 o antes:** al volver a exportarlos, las columnas `*_kg` se **derivan**
de los coeficientes crudos guardados (error ≤ 1,4·10⁻⁹ por el redondeo a 8 decimales) y el CSV lo
declara (`Origen_kg`). Los TPS se regeneran siempre desde el contorno guardado: no hace falta
recalcular nada.

**Scripts que leían el CSV EFA:** fallarán al buscar `a_norm`. Es intencionado: sustituir por
`a_norm_kg` (para Momocs/pyefd) o `a_norm_mao` (para reproducir las `d_EFD` de MAO).

## 3. Cómo cargarlos

```r
library(geomorph)
A  <- readland.tps("Sitio_contornos_semilandmarks.tps", specID = "ID")   # aplica SCALE= si todas lo traen
cs <- as.matrix(read.csv("curveslide.csv"))                              # = define.sliders(c(1:64, 1))
gpa <- gpagen(A, curves = cs)
```

```python
import pandas as pd, pyefd
t = pd.read_csv("QP1_contorno_efa.csv", nrows=20)            # la tabla va antes del bloque de metadatos
coef = t[["a_raw_kg", "b_raw_kg", "c_raw_kg", "d_raw_kg"]].to_numpy()
norm = pyefd.normalize_efd(coef.copy())                      # = columnas a_norm_kg…d_norm_kg
```

Coordenadas del TPS: píxeles de imagen, origen arriba-izquierda, y hacia abajo (como en 1.3.0). Para
mezclarlas con datos digitalizados en tpsDig (origen abajo-izquierda) hay que invertir y.

## 4. Hallazgo que queda abierto — O-28

La normalización de Kuhl & Giardina fija el inicio en un extremo del eje mayor del 1er armónico, pero
**cuál de los dos depende del punto de inicio del contorno**: en formas con armónicos pares, esos
coeficientes normalizados cambian de signo. La misma pieza con otro punto de inicio sale a
`d_EFD` = 0,589 («formas moderadamente distintas»). Pasa igual en pyefd y Momocs, y en el descriptor
interno de MAO (comparaciones EFA del APS, coeficientes medios de secciones 3D). **No afecta** al
espectro de potencia, a la varianza explicada ni a la clasificación por firma espectral. Corregirlo
cambia el descriptor interno → ADR propio con recálculo. Mientras tanto, para comparar especímenes
con coeficientes normalizados, alinear el punto de inicio (el TPS de semilandmarks ya lo hace) o
trabajar con los crudos.

## 5. Verificación

Suite Python **592 → 649 passed, 0 skipped** · `npm run test:js` en verde · ESM 17/17. Cada test nuevo
se ejecutó contra 1.3.0 y falla allí por el contenido. Detalle y cifras en el ADR-021 §4.
