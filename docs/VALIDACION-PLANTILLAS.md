# Validación del emparejamiento de plantillas (ADR-017 F4)

> **Qué es esto.** El protocolo con el que se comprueba que `plantilla_completitud`
> mide lo que dice medir, y los números que hoy la respaldan. ADR-017 nació porque
> cuatro estimadores de fragmentación anteriores publicaban porcentajes que nadie
> había contrastado nunca; este documento existe para que el sustituto no herede
> ese vicio.
>
> **Estado:** nivel 1 (banco sintético) **hecho** · nivel 2 (corpus real La Draga)
> **pendiente de ejecución por el observador** — el arnés está listo (§4).

---

## 1. Por qué hacen falta dos niveles de validación

Los dos responden a preguntas distintas y ninguno sustituye al otro.

| | Pregunta que responde | Lo que puede dar | Lo que NO puede dar |
|---|---|---|---|
| **Nivel 1 — banco sintético** | ¿el algoritmo recupera la completitud que se le impuso? | verdad-terreno **exacta** (la forma se genera con el 62,5 % preservado, no «alrededor de») | si un arqueólogo llamaría a eso lo mismo |
| **Nivel 2 — corpus real** | ¿coincide su número con el de un observador experto sobre piezas reales? | validez de uso: bordes erosionados, pátina, fracturas antiguas, contorno de segmentación real | precisión, porque la verdad del observador es **también** una estimación |

Publicar sólo el nivel 1 sería decir «el método es exacto» cuando lo demostrado es
«el método es autoconsistente». Publicar sólo el nivel 2 impediría saber si un
desacuerdo viene del algoritmo o del ojo humano. Van juntos.

---

## 2. Nivel 1 — banco sintético

**Herramienta:** `tools/adr017_banco_umbrales.py` · **reproducible**: el ruido es
determinista (`sin/cos` del índice, no un generador aleatorio), así que dos
ejecuciones dan la misma tabla.

**Diseño.** 87 formas = 2 familias (sector de disco, sector de elipse 2:1 rotada) ×
12 niveles de completitud (100 · 90 · 75 · 60 · 50 · 40 · 30 · 25 · 20 · 15 · 12,5 ·
10 %) × 3 niveles de ruido de contorno (0,5 · 1,2 · 2,5 px), más **15 controles
negativos** (rectángulos 1:1, 2:1 y 4:1; estrella de 5 puntas; blob orgánico de
armónicos) × 3 ruidos. Los sectores se cierran por el centro, como la silueta que
`findContours` devuelve de un fragmento real.

**Por qué el barrido es exacto y no una aproximación.** Los umbrales se aplican
*después* del ajuste (`shape_template.py`, bloque de aceptación): se ajusta **una
vez** por forma y luego se reevalúa la rejilla de umbrales sobre los números ya
obtenidos. No hay remuestreo ni interpolación.

### 2.1 Las cuatro magnitudes que se miden

- **Cobertura** — % de formas dentro de la envolvente declarada (≥ 25 % preservado)
  a las que se acepta *alguna* plantilla.
- **MAE** — error absoluto medio en puntos porcentuales de completitud.
- **PEOR** — error **máximo**. Es la columna decisiva y se añadió a mitad de F4:
  el MAE promedia, y el modo de fallo grave afecta a pocos casos con errores
  enormes. Con MAE solo, F4 habría avalado unos umbrales que publican un 18 % sobre
  una pieza que conserva el 50 %.
- **Falsos** — aceptaciones por debajo del 15 % de completitud (donde el ajuste
  degenera) y aceptaciones de los controles negativos (formas sin cónica alguna).

### 2.2 Resultado del barrido

`arco_c` / `arco_e` = fracción mínima del perímetro del fragmento que debe caer
sobre la plantilla para aceptarla (círculo / elipse); `comp` = completitud mínima.

| arco_c | arco_e | comp | cobertura | MAE (pp) | PEOR (pp) | acepta < 15 % | falsos positivos |
|---|---|---|---|---|---|---|---|
| 0,30 | 0,45 | 0,15 | 96 % | 3,68 | **31,6** | 22 % | 7 % | ← valores de F1 |
| 0,35 | 0,50 | 0,15 | 94 % | 3,03 | **31,6** | 11 % | 0 % |
| **0,40** | **0,50** | **0,15** | **85 %** | **1,56** | **13,1** | **0 %** | **0 %** | ← **vigentes** |
| 0,40 | 0,55 | 0,15 | 83 % | 1,31 | 11,6 | 0 % | 0 % |
| 0,45 | 0,55 | 0,15 | 79 % | 0,95 | 5,9 | 0 % | 0 % |

### 2.3 La decisión sobre los umbrales, y su evidencia

Subir el soporte mínimo del círculo de 0,30 a 0,40 y el de la elipse de 0,45 a 0,50
cuesta 11 puntos de cobertura. **Ninguno de los casos que se dejan de aceptar estaba
bien medido:**

| caso que se pierde | daba | verdad | error |
|---|---|---|---|
| elipse 25 % · ruido 0,5 | círculo 19,6 % | 25 % | 5,4 pp (y plantilla equivocada) |
| elipse 30 % · ruido 0,5 | elipse 40,0 % | 30 % | 10,0 pp |
| círculo 30 % · ruido 2,5 | círculo 18,7 % | 30 % | 11,3 pp |
| elipse 25 % · ruido 0,5 | elipse 40,8 % | 25 % | 15,8 pp |
| elipse 50 % · ruido 2,5 | círculo 18,4 % | 50 % | **31,6 pp** |

No se cambia exactitud por cobertura: se retira exactamente el **modo degenerado**
—un círculo *pequeño* encajado en un trozo del arco— que producía los cinco.

El desglose por ruido lo enseña sin ambigüedad:

| umbrales | ruido 0,5 px | ruido 1,2 px | ruido 2,5 px |
|---|---|---|---|
| 0,35 / 0,50 | 100 % cob · MAE 1,73 · peor 10,0 | 100 % · 2,09 · 13,1 | 81 % · **5,79** · **31,6** |
| **0,40 / 0,50** | 94 % cob · MAE 1,48 · peor 10,0 | 100 % · 2,09 · 13,1 | **62 %** · **0,84** · **3,4** |

Con segmentación pobre, el umbral bajo no cubre más: **inventa** más. Y el único
falso positivo del banco —el blob orgánico aceptado como «círculo al 39,5 %»—
desaparece.

**Principio aplicado.** MAO propone y el humano dispone (ADR-009, ADR-017 §7). Bajo
esa doctrina un número falso es peor que ningún número: el rechazo se muestra como
*«sin plantilla»*, que el ADR declara **resultado y no fallo**, y no contamina el
CSV; el número inventado, en cambio, viaja hasta la publicación. Por eso se elige el
juego que anula los falsos aunque no domine en cobertura.

**Lo que NO se hizo y por qué.** `0,45 / 0,55` es mejor en MAE (0,95) y en error
máximo (5,9 pp). No se adopta: la ganancia cabe dentro del margen de un banco de 87
formas sintéticas de dos familias, y afinar hasta ahí sería ajustar los umbrales *a
este banco*. Quien debe moverlos de nuevo es el corpus real (§4).

Los umbrales son **valores por defecto, no constantes**: `shape_template.match()`
acepta `min_arco_fraccion`, de modo que la recalibración no obliga a tocar código.
El guard de no-regresión está en `python/tests/test_shape_template.py`
(`test_los_umbrales_no_bajan_de_lo_calibrado`), y los dos casos que movieron la
decisión —el blob y la media elipse ruidosa— son ahora tests con dientes: bajo los
umbrales de F1 devuelven 39,5 % y 18,4 % y fallan.

### 2.4 Comportamiento resultante, pieza a pieza

Mejor candidato por residuo, umbrales vigentes:

| familia | verdad | ruido 0,5 | ruido 1,2 | ruido 2,5 |
|---|---|---|---|---|
| círculo | 100 % | 100,0 | 100,0 | 100,0 |
| círculo | 90 % | 90,2 | 90,2 | 90,3 |
| círculo | 75 % | 75,2 | 75,4 | 75,7 |
| círculo | 60 % | 60,2 | 60,4 | 60,7 |
| círculo | 50 % | 50,6 | 50,8 | 50,6 |
| círculo | 40 % | 40,3 | 40,5 | 41,0 |
| círculo | 30 % | 30,3 | 30,6 | rechaza |
| círculo | 25 % | 25,4 | 25,8 | rechaza |
| círculo | 20 % | 20,7 | rechaza | rechaza |
| círculo | ≤ 15 % | rechaza | rechaza | rechaza |
| elipse | 100 % | 100,0 | 100,0 | 100,0 |
| elipse | 90 % | 92,7 | 92,9 | 93,4 |
| elipse | 75 % | 75,2 | 75,5 | 75,8 |
| elipse | 60 % | 58,0 | 58,4 | 59,1 |
| elipse | 50 % | 50,6 | 51,0 | rechaza |
| elipse | 40 % | 44,5 | 45,9 | rechaza |
| elipse | 30 % | 40,0 | 43,1 | rechaza |
| elipse | 25 % | rechaza | 20,2 ⚠ | rechaza |
| elipse | ≤ 20 % | rechaza | rechaza | rechaza |

Controles negativos aceptados: **0 de 15**.

### 2.5 Sesgos y límites conocidos — léase antes de citar un número

1. **La elipse fragmentaria se SOBREESTIMA, y tanto más cuanto menos arco queda.**
   30 % → 40-43 %; 40 % → 44-46 %; 60 % → 58-59 %. Es mecánico, no un fallo de
   implementación: con poco arco el mejor ajuste es una elipse *más pequeña* que la
   original, y la fracción cubierta **de esa elipse** es mayor. Por debajo del 50 %
   preservado, la completitud de una elipse debe leerse como cota superior.
2. **La familia puede confundirse cerca del suelo.** Una elipse al 25 % con ruido
   medio se acepta como *círculo* al 20,2 % (fila ⚠). Es el último residuo del modo
   degenerado dentro de la envolvente. Por eso el módulo publica **todos** los
   candidatos y no un veredicto único.
3. **El suelo efectivo depende del ruido de contorno, no es un valor fijo.** Con
   contorno limpio se mide bien hasta el 20 %; con segmentación pobre (2,5 px) el
   suelo sube al 40-50 %. Un contorno malo no produce un número malo: produce un
   rechazo, que es el comportamiento buscado.
4. **Redacción corregida respecto a F1.** El ADR-017 y la cabecera del gate decían
   «rechaza por debajo de ~15 %». Con los umbrales de F1 eso era **falso**: el 22 %
   de las formas con ≤ 15 % de completitud se aceptaban. Con los umbrales de F4 el
   banco da **0 %** y la frase es cierta *sobre este banco* — no una garantía
   universal. La formulación honesta es: *no se aceptó ninguna forma por debajo del
   15 % en 87 formas sintéticas con tres niveles de ruido.*
5. **Sólo hay dos familias en el banco.** El repertorio ICP (triángulo, cuadrado,
   pentágono, hexágono, y lo que entre por `efa.reconstruct()`) usa otro umbral
   (`_MIN_ARCO_ICP`) y **no está calibrado por este banco**. Su gate es la paridad
   analítica ↔ ICP verificada en F2 (≤ 0,3 pp), que es una prueba de consistencia
   entre vías, no de exactitud frente a verdad-terreno.

---

## 3. Qué se mide en el nivel 2 y por qué esos estadísticos

- **Bland-Altman (1986) es el análisis PRINCIPAL.** Esto es una comparación de
  métodos, no un estudio de fiabilidad: interesa «¿cuánto puede apartarse este
  número del que yo daría?», que son el sesgo y los límites de acuerdo. El propio
  artículo de 1986 existe para argumentar que un coeficiente de correlación alto
  **no** demuestra acuerdo. Se añade la comprobación de sesgo proporcional
  (Bland & Altman 1999), porque el nivel 1 ya avisó de que la desviación depende de
  la magnitud.
- **ICC(2,1), acuerdo absoluto, medida individual** (Shrout & Fleiss 1979 caso 2;
  forma computacional de McGraw & Wong 1996), como complemento. **Absoluto** y no
  de consistencia: un desplazamiento sistemático aquí *sí* es un error. Bandas de
  lectura de Koo & Li (2016) — convención de la literatura, no ley natural.
- **κ de Cohen (1960)** para el tipo de plantilla, que es nominal. Se informa junto
  al porcentaje bruto de aciertos: con «ninguna» dominando el corpus —lo esperable
  en lítica— un 90 % de aciertos puede ser κ ≈ 0.
- **Tasa de rechazo con forma visible** — piezas donde el observador ve una forma
  ideal y el programa dice «sin plantilla». Es el **coste real** de los umbrales de
  §2.3 sobre material arqueológico, y es exactamente lo que el banco sintético no
  puede saber.

---

## 4. Nivel 2 — protocolo de calibración con corpus real

**Corpus de referencia:** La Draga (Banyoles), conjunto **DRG_19-15**.
**Herramienta:** `tools/adr017_calibracion_draga.py`. Sólo lee; no modifica el corpus.

### Paso 1 — inventario y hoja de registro (antes de mirar nada)

```bash
python tools/adr017_calibracion_draga.py \
        --corpus "/ruta/a/DRG_19-15" --inventario
```

Recorre la carpeta, informa de cuántas imágenes son legibles y cuántas son RAW, y
escribe `verdad_observador.csv` con una fila por pieza.

### Paso 2 — anotar a ciegas

Rellenar a mano `forma_ideal` (`circulo` / `elipse` / `ninguna`),
`completitud_observada_pct` y `seguridad_observador` (`alta` / `media` / `baja`).

> **El CSV de inventario NO contiene la respuesta del programa, y es deliberado.**
> Si el observador la ve primero, su juicio deja de ser independiente y el acuerdo
> medido no mide concordancia sino anclaje. Es la razón por la que la herramienta
> tiene dos pasadas en vez de una.

`ninguna` es una respuesta **válida y esperable**: en lítica la mayoría de las
piezas no derivan de una forma ideal. Un corpus anotado sin ningún `ninguna` haría
imposible medir los falsos positivos.

### Paso 3 — evaluación

```bash
python tools/adr017_calibracion_draga.py \
        --corpus "/ruta/a/DRG_19-15" --evaluar
```

Corre el pipeline **real** (`detection.detect` → `contour.extract` →
`shape_template.match`, el mismo camino que la aplicación) y escribe
`calibracion_adr017.md` con los estadísticos de §3 y la tabla pieza a pieza.

Opciones útiles: `--solo-seguras` (sólo piezas de lectura segura), `--objeto N`
(si la foto trae escala o carta de color y el artefacto no es el primero que
detecta MAO), `--repertorio circulo,elipse,hexagono`.

### Tamaño de muestra y cómo leer el resultado

- Koo & Li (2016) recomiendan **≥ 30 sujetos** para un estudio de fiabilidad. Por
  debajo de ~30 piezas anotadas, informar los estimadores puntuales y decir que el
  intervalo es ancho; **no concluir**. Con menos de 10 pares, la herramienta ni
  siquiera evalúa el sesgo proporcional, por falta de potencia.
- **Sólo hay dos «jueces»** (observador y máquina), el mínimo. Con un **segundo
  observador humano** se podría separar lo que es error del método de lo que es
  variabilidad entre arqueólogos — que es la pregunta que abre ADR-015 A2, y la
  única forma de saber si un desacuerdo de, digamos, 12 pp es mucho o es lo normal
  entre dos expertos mirando la misma pieza.

### Criterio de éxito — declarado ANTES de ver los datos

El método se considera calibrado para uso publicable si, sobre ≥ 30 piezas:

| criterio | umbral | por qué |
|---|---|---|
| sesgo (máquina − observador) | \|sesgo\| ≤ 5 pp y su IC 95 % incluye 0 | sin desplazamiento sistemático |
| límites de acuerdo | amplitud ≤ ±15 pp | por encima, el número no sostiene una lectura tipológica |
| falsos positivos de forma | ≤ 5 % | proponer forma donde no la hay es el fallo más caro |
| κ del tipo de plantilla | ≥ 0,60 (acuerdo sustancial) | por debajo, la familia no es fiable |

**Si no se cumple**, la acción NO es aflojar el criterio: es (a) recalibrar
`min_arco_fraccion` con estos datos, (b) restringir la envolvente publicada, o (c)
degradar `plantilla_completitud` a indicador interno no exportable. Cualquiera de
las tres es preferible a un CSV con números que nadie contrastó — que es
exactamente lo que ADR-017 F0 tuvo que retirar.

---

## 5. Resultados sobre La Draga

> **Pendiente.** El corpus reside en el equipo del observador; este repositorio no
> lo contiene y ninguna cifra de esta sección puede rellenarse desde aquí.
> Al ejecutar el paso 3, pegar debajo el contenido de `calibracion_adr017.md`.

| | |
|---|---|
| Fecha de la calibración | — |
| Piezas anotadas / con forma ideal | — |
| ICC(2,1) [IC 95 %] | — |
| Sesgo [IC 95 %] | — |
| Límites de acuerdo | — |
| κ del tipo | — |
| Rechazos con forma visible | — |
| Falsos positivos de forma | — |
| **¿Cumple el criterio de §4?** | — |

---

## 6. Reproducir esta validación

```bash
python tools/adr017_banco_umbrales.py          # nivel 1, ~3 min
python -m pytest python/tests/test_shape_template.py \
                python/tests/test_adr017_calibracion.py -q
node tools/adr017_gate_overlay.mjs             # geometría de la superposición
```

El banco imprime el barrido completo y dice si algún juego de umbrales domina al
vigente. Los tests fijan tanto el comportamiento del módulo como los estadísticos
de la herramienta de calibración (un ICC mal implementado devuelve un número
plausible entre 0 y 1: por eso se prueban **propiedades** —acuerdo perfecto = 1,
sesgo constante < 1, simetría entre jueces— y no valores copiados de la propia
implementación).

---

## 7. Fuentes

**Concordancia y acuerdo**

- Bland, J.M. & Altman, D.G. (1986). «Statistical methods for assessing agreement
  between two methods of clinical measurement». *The Lancet* 327(8476):307-310.
  doi:[10.1016/S0140-6736(86)90837-8](https://doi.org/10.1016/S0140-6736(86)90837-8)
- Bland, J.M. & Altman, D.G. (1999). «Measuring agreement in method comparison
  studies». *Statistical Methods in Medical Research* 8(2):135-160.
  doi:[10.1177/096228029900800204](https://doi.org/10.1177/096228029900800204)
- Shrout, P.E. & Fleiss, J.L. (1979). «Intraclass correlations: uses in assessing
  rater reliability». *Psychological Bulletin* 86(2):420-428.
  doi:[10.1037/0033-2909.86.2.420](https://doi.org/10.1037/0033-2909.86.2.420)
- McGraw, K.O. & Wong, S.P. (1996). «Forming inferences about some intraclass
  correlation coefficients». *Psychological Methods* 1(1):30-46.
  doi:[10.1037/1082-989X.1.1.30](https://doi.org/10.1037/1082-989X.1.1.30)
- Koo, T.K. & Li, M.Y. (2016). «A guideline of selecting and reporting intraclass
  correlation coefficients for reliability research». *Journal of Chiropractic
  Medicine* 15(2):155-163.
  doi:[10.1016/j.jcm.2016.02.012](https://doi.org/10.1016/j.jcm.2016.02.012)
- Cohen, J. (1960). «A coefficient of agreement for nominal scales». *Educational
  and Psychological Measurement* 20(1):37-46.
  doi:[10.1177/001316446002000104](https://doi.org/10.1177/001316446002000104)
- Bonett, D.G. (2002). «Sample size requirements for estimating intraclass
  correlations with desired precision». *Statistics in Medicine* 21(9):1331-1335.
  doi:[10.1002/sim.1108](https://doi.org/10.1002/sim.1108)

**Método** (ajuste robusto, ICP, EFA, precedentes arqueológicos): ver la
bibliografía completa en `docs/ADR-017-emparejamiento-plantillas-completitud.md`
§10.
