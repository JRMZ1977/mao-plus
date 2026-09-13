# ADR-017 — Emparejamiento con plantillas de forma ideal e inferencia de completitud (fragmento vs. pieza completa)

**Estado:** 🟡 **F0, F1 y F2 implementadas (2026-09-12/13)** · F3-F4 propuestas
**Nota de versión F0:** `docs/NOTA-VERSION-ADR017-F0.md` (cambia valores exportados)
**Fecha:** 2026-09-12
**Autor:** JFRR + Claude Code
**Relacionado:** ADR-006 (repertorio canónico) · ADR-007 (confianza por objeto) · **ADR-009 (patrón
«candidatos a confirmar» — precedente rector)** · ADR-011 (taxonomía canónica) · ADR-012 (núcleo
monolítico) · ADR-015 D1/D3/E1 (simetría formal, corte de armónicos, landmarks) ·
**ADR-016 #6/#7 (síntomas ya reportados en el reporte real)** · `python/modules/efa.py`

---

## Contexto y decisión

**Pregunta de origen (JFRR):** ¿puede MAO inferir, a partir del contorno de la forma idealizada, si
una pieza es **completa** o el **fragmento** de una forma mayor, emparejándola contra un repertorio
de formas ideales (círculo, rectángulo, triángulo, óvalo…)? ¿Implica eso mantener un repertorio de
descriptores EFA con los que comparar?

**Respuesta corta:** sí es posible, tiene respaldo bibliográfico consolidado y está **demostrado en
prototipo** (§4). Pero exige dos correcciones de rumbo:

1. **MAO ya lo intenta, y los tres estimadores que lo hacen hoy no miden completitud** (§1). Esto no
   es una mejora pendiente: es un defecto en producción que ya produjo un hallazgo en el reporte
   real auditado por ADR-016.
2. **Un repertorio de EFA no puede resolver el emparejamiento parcial** (§2). La EFA sirve como
   *biblioteca de plantillas* y como descriptor de la forma **reconstruida**, no como espacio de
   comparación fragmento↔original.

**Decisión:** adoptar una arquitectura de **cuatro etapas** (segmentación margen/fractura → ajuste
robusto de plantilla → completitud como cobertura del modelo ajustado → EFA sobre la reconstrucción)
y surgir su resultado bajo el **patrón ADR-009: la detección propone candidatos, el humano
confirma**. Aditivo y reversible, salvo la fase F0, que retira una métrica errónea ya publicada.

## Invariantes

- **Aditivo y reversible** salvo F0, que es corrección de defecto (ver §6, riesgo declarado).
- **La detección propone, el humano dispone** (ADR-009). Ninguna inferencia de completitud altera
  métricas por sí sola; `area_real`, `area_efectiva` y el pool morfométrico **no se tocan**.
- **Medir fiel, no sobre-interpretar** — precedente JFRR 2026-07-02 (ADR-016 #6): una herramienta de
  morfometría conserva la medición fiel y neutraliza el rótulo que diagnostica de más.
- **Trazabilidad de referencias:** cada método cita su fuente (§7), como EFA→Kuhl & Giardina 1982.
- **Gated por tests:** módulo math-critical; ningún cambio entra sin su prueba de exactitud sobre
  formas de completitud conocida.

---

## 1. Evidencia: los tres estimadores actuales no miden completitud

MAO tiene hoy **tres** rutas independientes que estiman fragmentación, y las tres miden otra cosa.

### 1.1 `completitud_estimada` — cobertura angular sobre el centroide propio

`analizarDistribucionRadialAngular` (`js/modules/shape-classification.js:589`) calcula
`coberturaAngular = θ_max − θ_min` sobre los puntos del contorno ordenados por ángulo **alrededor
del centroide del propio fragmento**; `calcularCompletitudFragmento`
(`js/modules/morphometric-metrics.js:1029`) la combina con un segundo término. Ambas están en
producción (`analysis-core.js:9451` y `:10978`) y alimentan `completitud_estimada`,
`completitud_tipo_fragmento`, el CSV (`project-manager.js:1079`), el PDF
(`visualization-export.js:701`) y el comparador (`comparator.js:177`).

**Defecto estructural:** todo contorno cerrado de `cv2.findContours` cuyo centroide caiga dentro
rodea 360° **por construcción** — el fragmento también. La señal es idénticamente ≈360° y no
discrimina. Sonda con formas sintéticas de completitud conocida (estado **previo a F0**;
el script es hoy el gate `tools/adr017_gate_f0.mjs`, ver §9):

| forma sintética | completitud real | `coberturaGrados` | `completitud_estimada` | veredicto emitido |
|---|---|---|---|---|
| círculo completo | 100 % | 359,1° | **91,3 %** | «Casi completo (fragmento menor)» |
| medio círculo | **50 %** | 359,1° | **91,3 %** | «Casi completo (fragmento menor)» |
| cuarto de círculo | **25 %** | 357,3° | **91,0 %** | «Casi completo (fragmento menor)» |
| rectángulo 2:1 | 100 % | 358,9° | 99,8 % | «Objeto completo» |

Un disco entero y un cuarto de disco son **indistinguibles** para la métrica.

**Segundo defecto, de nombre:** `metodo_convexidad` está implementado como `área / área_bbox`
(`morphometric-metrics.js:1064`), que es el **extent**, no la convexidad de perímetro
(`P_hull/P_real`) ni la solidez (`A/A_hull`) que sí existen en el registro canónico ADR-006. El
tooltip (`js/tooltips.js:229`) promete «cobertura angular + ratio de convexidad»; no ocurre ninguna
de las dos. Como el extent de un círculo es π/4 = 78,5 %, **toda pieza redonda completa se reporta
como fragmento**. En conjunto, `completitud_estimada` mide *cuán rectangular* es la pieza.

**Esto explica la causa raíz del hallazgo ADR-016 #6** (cuenta circular de La Draga rotulada
«fracturada/erosionada», señalado allí como contradictorio con la tesis del artículo). ADR-016 lo
resolvió neutralizando el rótulo de `rugosidad`; la vía de completitud sigue emitiendo el mismo
mensaje por otro canal.

### 1.2 `perdida_area_fragmentacion_percent` — la concavidad rebautizada

`python/modules/metrics.py:567`:

```python
m["perdida_area_fragmentacion_percent"] = _r((hull_area - area_real) / hull_area * 100, 1)
```

Es exactamente `1 − solidez`, expresada en porcentaje y rotulada «área perdida por fragmentación».
Mide **concavidad**, no pérdida: una pieza lunada íntegra —fabricada así— reporta «pérdida por
fragmentación» alta. Se muestra en el PDF (`visualization-export.js:676`) y en la tabla
(`tabla-metricas-completa.js:303`).

> **A verificar en F0:** `perdida_perimetro_fragmentacion_percent` (`metrics.py:568`) usa
> `(hull_perim − perim_real) / hull_perim`. Para toda curva cerrada simple, el perímetro del casco
> convexo es **≤** el del contorno (desigualdad clásica de convexidad), luego la expresión es **≤ 0
> por construcción** y solo vale 0 en piezas convexas. Confirmar con datos reales antes de decidir
> entre corregir el signo o retirar la clave.

### 1.3 `esFragmento` del motor de clasificación

`js/modules/classification-engine.js:204` combina la señal degenerada de §1.1 con un umbral de
solidez: `!!radialAngular?.esFragmento || (completitud < 95 && solidez < 0.92)`. Hereda el defecto
de la primera y la confusión concavidad↔fragmentación de la segunda.

### 1.4 Observación de diseño que sí apunta en la dirección correcta

`metrics.py:570` declara: *«PRINCIPIO MAO: area y perimeter PRIMARIOS = convex hull (forma canónica
completa)»*. Es decir, MAO **ya usa el casco convexo como sustituto de "la forma completa"**. Este
ADR no introduce un paradigma ajeno: sustituye ese sustituto —válido solo para pérdidas convexas
pequeñas— por un **modelo paramétrico ajustado**, que es su generalización principiada.

### 1.5 Deuda colateral

Existen **duplicados IIFE** de ambas funciones (`analysis-core.js:7002` y `:8722`) además de las
versiones de módulo. Cualquier corrección debe tocar las dos rutas o el defecto sobrevive por la vía
legacy — el gotcha ya documentado en `CLAUDE.md` para `cargarMetadatos`/`procesarMetadatos`.

---

## 2. Por qué un repertorio de EFA no resuelve el emparejamiento parcial

La intuición de usar EFA como lenguaje común es correcta para comparar piezas **completas**, y MAO
ya la tiene construida (`/api/efa`, `/api/efa/compare`). No sirve, en cambio, para decidir si una
pieza es fragmento:

- **La EFA es un descriptor global de una curva cerrada**, parametrizada por longitud de arco
  normalizada al perímetro total `T` (Kuhl & Giardina 1982, ecs. 9-12 — implementado en
  `python/modules/efa.py:40`). **La EFA de medio disco no es «la mitad» de la EFA del disco**: al
  cambiar el recorrido cambia `T`, y la normalización canónica (`_normalize_coeffs`: θ₁ de fase, ψ₁
  espacial, escala E₁, quiralidad d₁≥0) reescala y realinea respecto del **primer armónico del
  fragmento**. Fragmento y original caen en puntos arbitrariamente distintos del morfoespacio. No
  existe una operación de «encaje parcial» en el espacio EFD: `d_efd` (`efa.py:336`) es una
  distancia entre formas completas.
- **El contorno cerrado de un fragmento incluye el borde de fractura**, que no es forma original
  sino ruido tafonómico, y contamina todos los armónicos por igual.
- Para contornos **abiertos** —que es lo que realmente conserva un fragmento— la literatura
  morfométrica no usa EFA sino la **Transformada Discreta del Coseno** (Dommergues et al. 2007),
  implementada en Momocs como `dfourier` precisamente por esta razón.

**Consecuencia de diseño:** el repertorio de formas ideales entra como **biblioteca de plantillas**,
no como espacio de comparación. Y existe ya el puente: `efa.reconstruct()`
(`_reconstruct_contour`, `efa.py:171`) **renderiza un contorno a partir de coeficientes EFD**, de
modo que el repertorio EFA puede generar las plantillas que el motor de emparejamiento consume.

---

## 3. Arquitectura: cuatro etapas

```
E1  segmentar el contorno  →  margen original  vs  borde de fractura
E2  ajustar la plantilla ideal SOLO al margen original   (ajuste robusto → ICP)
E3  completitud = cobertura de la plantilla ajustada     (el "EVE" arqueológico)
E4  EFA sobre la forma RECONSTRUIDA  →  tipología contra el repertorio
```

**Clave técnica, y corrección del defecto §1.1: la cobertura angular se mide alrededor del centro de
la plantilla ajustada, no del centroide del fragmento.** En un medio disco, el centro del círculo
ajustado cae sobre la cuerda de fractura; el arco preservado cubre 180° alrededor de *ese* centro →
50 %.

### E1 · Segmentación margen original / borde de fractura

Un borde de fractura (snap, Siret, corte) es un tramo del contorno que **no pertenece a la forma
original**. Dos criterios evaluados en prototipo:

- ❌ **Umbral de rectitud** (curvatura local, o cuerda/arco tras RDP): frágil. Con ruido de contorno
  realista el cociente cuerda/arco de una recta cae muy por debajo de 1, y la longitud de segmento
  RDP no discrimina recta de curva suave (una circunferencia también produce cuerdas largas). Ambas
  variantes fallaron: sobre-detección al 61 % del contorno de un círculo íntegro, o cero detección.
- ✅ **Contigüidad del ajuste** (adoptado): el margen original preservado es **un arco contiguo** del
  contorno; la fractura es el resto. Puntuando el modelo por **longitud del tramo contiguo de
  inliers** —no por número de inliers— la fractura se separa sola, sin umbral de rectitud.

### E2 · Ajuste robusto de plantilla

- **Fase F1 (plantillas analíticas):** círculo por ajuste algebraico (Kåsa/Taubin) y elipse por
  mínimos cuadrados, envueltos en **RANSAC** (Fischler & Bolles 1981) con **tolerancia absoluta**
  (proporcional a la diagonal del objeto, nunca al radio candidato: una tolerancia relativa al radio
  premia círculos gigantes ≈ recta, que declaran inlier a todo el contorno — fallo reproducido y
  corregido en el prototipo) y **cota de radio** `r ≤ 3·diagonal`.
- **Fase F2 (repertorio arbitrario):** **ICP** (Besl & McKay 1992) entre el margen original (polilínea
  abierta) y cada plantilla del repertorio, con escala y rotación libres, puntuando por residuo +
  cobertura. Es el método que Wilczek et al. (2021) encontraron **mejor en su comparación de cuatro
  algoritmos** (ICP, DCT, RDP, RTC) sobre cerámica de La Graufesenque: candidato correcto entre los
  5 primeros para el **95 %** de los bordes, y **el único que además funciona con fragmentos sin
  borde diagnóstico**.

### E3 · Completitud

`completitud = cobertura angular del arco preservado alrededor del centro ajustado`, calculada por
**huecos** (suma de saltos angulares mayores que `gap_min`, robusta a la densidad de puntos) y no
por binning, que es sensible al muestreo.

Es el análogo directo del **EVE** (*estimated vessel equivalent*) ceramológico, donde cada fragmento
se puntúa como fracción del borde completo (Orton & Hughes 2013). Karasik & Smilansky (2011)
formulan la misma condición: el fragmento es utilizable mientras conserve el rasgo diagnóstico que
ancla el ajuste.

### E4 · EFA sobre la reconstrucción

Solo aquí entra el repertorio EFA: se calcula la EFA de la **forma completa hipotetizada** (no del
fragmento) y se compara contra el repertorio con la maquinaria existente. Para comparar fragmento
con fragmento sin reconstruir, la vía correcta es DCT sobre el arco abierto (Dommergues et al.
2007), no EFA.

### Refinamiento opcional (enlaza con ADR-015 D1)

La **Continuous Symmetry Measure** (Zabrodsky et al. 1995) es literalmente «distancia a la forma
simétrica más próxima» — la formalización canónica de «¿cuánto se parece a la forma ideal?», con uso
arqueológico consolidado en bifaces (Saragusti et al. 1998). Sirve a la vez como puntuación de
ajuste de plantilla (E2) y como base de la simetría formal que pide ADR-015 D1.

---

## 4. Evidencia de viabilidad: prototipo

Prototipo de E1-E3 para la plantilla círculo (Kåsa + RANSAC puntuado por tramo contiguo), sobre las
mismas formas sintéticas de la sonda §1.1, con ruido de contorno
(`node tools/adr017_proto_plantilla.mjs`, reproducible):

| forma | completitud real | **estimada** | radio ajustado (error) | veredicto |
|---|---|---|---|---|
| círculo completo | 100 % | **100,0 %** | 100,0 (+0,0 %) | COMPLETO |
| disco 75 % | 75 % | **75,3 %** | 99,9 (−0,1 %) | FRAGMENTO 75 % |
| disco 50 % | 50 % | **50,5 %** | 99,7 (−0,3 %) | FRAGMENTO 50 % |
| disco 25 % | 25 % | **25,8 %** | 98,4 (−1,6 %) | FRAGMENTO 26 % |
| disco 12,5 % | 12,5 % | — | 54,2 (−45,8 %) | plantilla rechazada |
| disco 6 % | 6,25 % | — | 26,7 (−73,3 %) | plantilla rechazada |
| rectángulo 2:1 | n/a (plantilla errónea) | — | — | plantilla rechazada ✓ |

**Envolvente operativa declarada: exacta hasta ~25 % de forma preservada; por debajo de ~15 % el
ajuste degenera y el método lo rechaza en vez de inventar.** El rechazo del rectángulo confirma que
una plantilla equivocada no se acepta. El límite coincide con el conocido en estimación de diámetro
de borde a partir de tiestos pequeños.

El umbral de rechazo (`fracción del perímetro en el arco ajustado > 0,30`) y el de «completo»
(`cobertura > 0,93`) son parámetros del módulo, calibrables con corpus real en F3.

---

## 5. Contrato de salida (claves nuevas)

Registradas en `python/modules/morphometric_registry.py` (ADR-006) como nivel **2D**, no adimensional
salvo donde se indica, y propagadas por el contrato ADR-008:

| clave | tipo | significado |
|---|---|---|
| `plantilla_tipo` | str | `circulo` \| `elipse` \| `rectangulo` \| `triangulo` \| `poligono_n` \| `ninguna` |
| `plantilla_completitud` | float 0-100 | % de la forma ideal preservado (cobertura del modelo) |
| `plantilla_arco_fraccion` | float 0-1 | fracción del perímetro del contorno que es margen original |
| `plantilla_residuo_rms` | float mm | bondad de ajuste (residuo del margen original al modelo) |
| `plantilla_parametros` | dict | parámetros del modelo en coords **absolutas** (cx, cy, r · a, b, θ) |
| `plantilla_confianza` | float 0-1 | + `plantilla_confianza_nivel` (`alta`/`media`/`baja`, ADR-007) |
| `plantilla_metodo` | str | `ransac_circulo` \| `ransac_elipse` \| `icp_repertorio` |
| `es_fragmento_candidato` | bool | **candidato**, nunca hecho consumado (ADR-009) |

**Retiradas / renombradas en F0** (ver riesgo en §6):

| clave actual | destino |
|---|---|
| `completitud_estimada`, `completitud_tipo_fragmento` | retiradas como «completitud»; sustituidas por `plantilla_completitud` |
| `metodo_convexidad` | renombrada a **`extent`** (`A/A_bbox`) — medición fiel, nombre correcto; clave nueva en el registro |
| `metodo_angular` | retirada (señal degenerada, sin valor recuperable) |
| `perdida_area_fragmentacion_percent` | conserva el número (= `1 − solidez`), pierde el rótulo de fragmentación → `concavidad_area_percent`, con alias de lectura |

Es exactamente el patrón ADR-016 #6: **se conserva la medición fiel y se neutraliza el rótulo que
diagnostica de más**; lo que aquí se retira es únicamente lo que no mide lo que dice medir.

### UI (lenguaje canónico ADR-005)

Chip `.laar-chip --wa` en la pestaña Análisis: **«Forma: fragmento de círculo · 50 % — confirmar»**;
`--ok` cuando el usuario confirma; `--none` cuando la plantilla se rechaza (pieza irregular, sin
forma ideal subyacente: el caso normal en lítica). Nunca `--ok` automático.

---

## 6. Fases, gates y riesgo

| Fase | Alcance | Archivos | Gate de aceptación | Riesgo |
|---|---|---|---|---|
| **F0** | ✅ **Hecha.** 13 archivos, 15 con docs. Ver §6.1 | los 8 previstos + `mao-ia.js`, `comparator.js`, `visualization-export.js`, `metric-presenter.js`, `index.html` | ✅ gate `tools/adr017_gate_f0.mjs` 13/13 · ✅ `node --check` 11/11 + `py_compile` 2/2 · ⏳ suite y Electron pendientes (entorno sin numpy/pytest) | 🟠 **cambia valores exportados** → `docs/NOTA-VERSION-ADR017-F0.md` |
| **F1** | ✅ **Hecha.** `python/modules/shape_template.py` + `/api/shape-match` + 19 tests. Ver §6.2 | nuevo módulo, `server.py`, `modules/__init__.py`, 2 ficheros de test | ✅ error ≤ 1 punto porcentual entre 25 % y 100 % · ✅ rechaza < 15 % · ✅ rechaza plantilla errónea · suite 343/4 | 🟢 aditivo |
| **F2** | ✅ **Hecha.** ICP recortado sobre repertorio + `efa.reconstruct()` publicada + `/api/shape-match/templates`. Ver §6.3 | `shape_template.py`, `efa.py`, `server.py` | ✅ paridad ≤ 0,3 pp en los 4 casos · ✅ 3 plantillas poligonales validadas · suite 357/4 | 🟢 aditivo |
| **F3** | Registro canónico + contrato + chip LAAR + modal de confirmación (patrón ADR-009) | `morphometric_registry.py`, `mao-deteccion-contract.js`, `mao-analysis-organizer.js` | chip en los 4 estados; confirmar/descartar persiste; CSV con las claves nuevas | 🟢 |
| **F4** | Calibración de umbrales con corpus real (La Draga) + validación contra medición manual | `docs/VALIDACION-PLANTILLAS.md` | umbrales justificados con datos; acuerdo método↔observador reportado (enlaza ADR-015 A2/ICC) | 🟢 |

**Secuencia recomendada:** F0 primero y por separado — es autónomo, corrige un defecto que ya
contamina el reporte del artículo, y no depende de nada de lo demás.

### 6.3 · Resultados medidos de F2

**Paridad analítica ↔ ICP** (el gate del ADR: si divergieran, una de las dos
estaría mal). Diferencia máxima **0,3 puntos porcentuales**:

| forma | vía analítica | vía ICP | Δ |
|---|---|---|---|
| círculo íntegro | 100,0 % | 100,0 % | 0,0 pp |
| disco 75 % | 75,3 % | 75,3 % | 0,0 pp |
| disco 50 % | 50,5 % | 50,0 % | 0,5 pp |
| elipse íntegra | 100,0 % | 100,0 % | 0,0 pp |

**Plantillas poligonales**: triángulo, cuadrado y hexágono íntegros eligen su
propia plantilla al 100,0 %, y las demás quedan rechazadas por soporte. Un
círculo NO se acepta como triángulo: la generalización no debilita el rechazo.

**El puente EFA → repertorio**, que era la pregunta original: `registrar_plantilla_efa`
convierte un banco de coeficientes en plantillas vía `efa.reconstruct()`, y una
forma trilobulada generada desde 3 armónicos se empareja consigo misma al 100 %.

**Hallazgo: `efa.reconstruct()` no existía.** La cabecera de `efa.py` la declaraba
exportada desde siempre, pero sólo estaba la privada `_reconstruct_contour`. Se
publicó como parte de F2, con validación de entrada y test propio.

**Ambigüedad de forma — medida, no teórica.** Un medio hexágono regular **es** un
triángulo equilátero truncado: sus 5r de perímetro incluyen 4r que yacen sobre un
triángulo de lado 2r. El módulo lo reporta correctamente por partida doble —50 %
de un hexágono, 67 % de un triángulo (verdades geométricas: 50,0 % y 66,7 %)— y
por eso publica **todos** los candidatos en vez de un veredicto único. Es
evidencia empírica a favor del invariante ADR-009: la ambigüedad es de la forma,
no del método, y resolverla es trabajo del arqueólogo.

**Dos correcciones que el banco obligó a hacer:**

1. **Los inliers publicados salen de la tolerancia absoluta, no del recorte ξ.**
   ξ es un parámetro *interno* de TrICP (gobierna la búsqueda de pose); usarlo
   también para reportar rompía dos cosas a la vez: el recorte escoge los *k*
   globalmente más cercanos, que quedan **entreverados** a lo largo del contorno,
   así que el tramo contiguo salía ridículo (0,11 en un disco al 75 % bien
   ajustado, con residuo 0,9 → *rechazado*); y con ξ alto el borde de fractura
   entraba en el residuo (10,5 px en un hexágono correctamente emparejado). Con
   la tolerancia absoluta el criterio es además **el mismo** que el de la vía
   analítica, que es justo lo que hace comparables ambas rutas.
2. **El recorte entra desde el rastreo grueso.** Una fase gruesa sin recortar
   (ξ=1) parece inocua pero falla en el caso que importa: con un fragmento al
   50 %, el 40 % del contorno es fractura, arrastra la pose inicial y la fase
   fina no se recupera — el sector de hexágono rechazaba *su propia* plantilla.
   Es exactamente lo que TrICP resuelve aplicando LTS en todas las fases.

**Coste:** ~200 ms por plantilla ICP (~640 ms para cuatro). Más caro que la vía
analítica por plantilla, así que **F3 debe invocarlo bajo demanda y con el
repertorio acotado**, no con la biblioteca entera en cada análisis.

### 6.2 · Resultados medidos de F1

Ejecutado sobre formas sintéticas de completitud conocida con ruido de contorno
(`python/tests/test_shape_template.py`, 16 tests + 3 de endpoint):

| forma | verdad | plantilla elegida | completitud medida | error |
|---|---|---|---|---|
| círculo íntegro | 100 % | círculo | **100,0 %** | 0,0 pp |
| disco 75 % | 75 % | círculo | **75,3 %** | 0,3 pp |
| disco 50 % | 50 % | círculo | **50,5 %** | 0,5 pp |
| disco 25 % | 25 % | círculo | **25,8 %** | 0,8 pp |
| disco 12,5 % | 12,5 % | **rechazada** | — | fuera de envolvente ✓ |
| elipse íntegra 2:1 | 100 % | elipse | **100,0 %** | 0,0 pp |
| media elipse | 50 % | elipse | **51,0 %** | 1,0 pp |
| rectángulo 2:1 | n/a | **rechazada** | — | plantilla errónea ✓ |

Mejor que el gate exigido (≤ 3 puntos porcentuales). En el medio disco recupera
centro y radio verdaderos dentro de 3 px **aunque el centro real caiga sobre la
cuerda de fractura**, fuera del fragmento — que es justamente lo que el estimador
retirado en F0 no podía hacer.

**Tres cosas que la implementación obligó a añadir, ninguna prevista en el diseño:**

1. **Tope de elongación de la elipse** (`b/a ≥ 0,15`). Una elipse con `b/a → 0`
   **es** un segmento de recta y ajusta cualquier borde de fractura: es el análogo
   elíptico del «círculo gigante ≈ recta» que ya acotaba `r_max`. Sin él se
   aceptaban un rectángulo y un sector de 45° como plantillas válidas.
2. **Soporte mínimo distinto por plantilla** (círculo 0,30 · elipse 0,45). La
   elipse tiene 5 grados de libertad frente a 3 del círculo, así que con poco arco
   queda subdeterminada. Un umbral común de 0,30 la dejaba pasar con ajustes malos.
3. **Un bug propio, detectado en banco:** el refinamiento iterativo actualizaba el
   modelo sin actualizar su tramo, de modo que el «arco de inliers» quedaba medido
   contra un modelo distinto del que lo había producido — y contenía puntos a más
   de la tolerancia (residuo RMS 19,5 px con tolerancia 4,5). Modelo y tramo se
   actualizan ahora juntos.

**Coste:** ~320 ms por objeto con las dos plantillas (contorno de ~430 puntos).
El bucle de tramos contiguos se vectorizó (era 504 ms). Relevante para F3, que lo
cableará al flujo por objeto: conviene invocarlo bajo demanda, no en cada análisis.

**Decisiones de diseño con fuente:** el ajuste de círculo es algebraico (Kåsa 1976)
y el de elipse es directo con restricción, en la variante numéricamente estable de
**Halíř & Flusser (1998)** sobre Fitzgibbon et al. (1999) — se prefirió a
`cv2.fitEllipse` porque su algoritmo exacto varía entre versiones de OpenCV y este
repo tiene un requisito de replicabilidad abierto (ADR-013 F2). El RANSAC usa
semilla fija: misma entrada ⇒ misma salida, con test que lo verifica.

### 6.1 · Lo que F0 encontró de más al implementarse

Tres hallazgos no previstos en el diagnóstico inicial, todos incorporados:

1. **Había un CUARTO estimador, en Python** (`metrics.py`, §33): `completitud_estimada` =
   `0,4·convexidad + 0,6·solidez`, **distinto** del de JS y sin el término angular
   degenerado. Medición fiel con rótulo equivocado → renombrada a
   `indice_convexidad_percent` conservando el número, sin tocar un coeficiente. Su
   compañera `completitud_metodo_convexidad` duplicaba `convexity` (§28) ×100 → retirada.
2. **El signo invertido se confirmó desde el propio código.** El comentario de `metrics.py`
   §28 dice «nunca >1 (hull ≤ real)», lo que prueba que
   `(hull_perim − perim_real)/hull_perim` era ≤ 0 por construcción. Corregido a exceso de
   perímetro; la clave vieja no se aliasa porque su valor carecía de significado.
3. **Dos rutas INYECTABAN la etiqueta de fragmento** (flujo IA y flujo manual) cuando
   `perdida_area > 1 %` —o sea, con casi cualquier contorno real— derivando el porcentaje
   como `100 − concavidad`. Ese es el mecanismo concreto de ADR-016 #6; ambas retiradas.
   Sus guardas `solidity ≥ 0.92 → es P/H, no fractura` reconocían el problema pero sólo
   acotaban el síntoma.

Efectos colaterales declarados: dos reglas de clasificación quedan **inertes** hasta F1
(reinterpretación de «zona curvilínea frontera» y resaltado crítico de la columna de
completitud), porque su compuerta era el flag fabricado. La lógica se conserva en su sitio,
comentada, para que F1 la re-active con `es_fragmento_candidato`.

## 7. Invariante arqueológico (lo que este ADR **no** afirma)

En lítica, «completo vs. fragmento» **no se dictamina desde la silueta 2D**. El diagnóstico de
fractura se hace por atributos de la cara ventral —talón, bulbo, ondas de percusión, terminación,
fractura Siret—, no por el contorno (Inizan et al. 1999; Andrefsky 2005). Es el debate que abrieron
Sullivan & Rozen (1985) con su tipología de debitage «libre de interpretación» y que Amick & Mauldin
(1989) criticaron precisamente por no serlo.

Por eso el resultado se surge como **candidato a confirmar** (ADR-009) y nunca como dato que altere
métricas. Un objeto sin forma ideal subyacente —el caso frecuente en lítica— debe devolver
`plantilla_tipo: "ninguna"`, no una plantilla forzada.

El corolario positivo: donde el método **más rinde** es en el caso de estudio en curso. Adornos,
cuentas y contenedores son formas geométricamente idealizables por manufactura, y ahí la inferencia
plantilla→completitud es tan sólida como la estimación de diámetro de borde en cerámica, su análogo
canónico. Y resuelve de raíz el hallazgo ADR-016 #6: una cuenta circular íntegra dejará de
describirse como fragmento.

## 8. Reversibilidad

F1-F4 son módulos, claves y superficie de UI **nuevos**: desactivarlos es no llamar a
`/api/shape-match` y comentar el chip en su organizer. F0 **no es reversible por comentario** —es
corrección de defecto— y por eso va con nota de versión y con `test_coherencia_entrega.py` como red.

## 9. Verificación

Además de los gates por fase: suite ≥ 306 passed / 2 skipped, `node -c` limpio, y —para F3— sonda
DOM en Electron con `window.__maoE2E` (ADR-010), porque `node -c` y el health check no ven ni layout
ni exactitud numérica de runtime.

Los números de §1.1 y §4 son **reproducibles hoy**: las dos sondas están versionadas junto a este
ADR y no dependen de nada fuera del repo.

```bash
node tools/adr017_gate_f0.mjs                          # no regresión de F0
node tools/adr017_proto_plantilla.mjs                  # §4 — prototipo de viabilidad
python -m pytest python/tests/test_shape_template.py \
                 tests/test_shape_match_api.py         # gate de F1+F2 (33 tests)
```

`adr017_gate_f0.mjs` era la sonda que documentaba el defecto (§1.1); tras F0 verifica lo
contrario — que el estimador degenerado no ha vuelto y que la medición fiel que lo sustituye
se comporta como debe. Los números originales quedan en el git log y en §1.1.

`adr017_proto_plantilla.mjs` es prototipo de validación del método, **no** código de producción: la
implementación canónica corresponde a `python/modules/shape_template.py` (F1), conforme a ADR-012
(el núcleo de análisis vive en Python; JS es fallback).

---

## 10. Bibliografía

- **Kuhl, F.P. & Giardina, C.R.** (1982). Elliptic Fourier features of a closed contour.
  *Computer Graphics and Image Processing* 18(3): 236-258. — referencia canónica ya citada en `efa.py`.
- **Dommergues, C.H., Dommergues, J.-L. & Verrecchia, E.P.** (2007). The Discrete Cosine Transform,
  a Fourier-related Method for Morphometric Analysis of Open Contours. *Mathematical Geology* 39(8):
  749-763. doi:10.1007/s11004-007-9124-6 · https://hal.science/hal-00198835
- **Bonhomme, V. et al.** (2014). Momocs: Outline Analysis Using R. *Journal of Statistical Software*
  56(13). Función `dfourier` (DCT para contornos abiertos):
  https://search.r-project.org/CRAN/refmans/Momocs/html/dfourier.html
- **Wilczek, J., Monna, F. et al.** (2021). A computer tool to identify best matches for pottery
  fragments. *Journal of Archaeological Science: Reports* 37: 102891. — comparación ICP / DCT / RDP /
  RTC. https://www.sciencedirect.com/science/article/abs/pii/S2352409X21001036
- **Karasik, A. & Smilansky, U.** (2011). Computerized morphological classification of ceramics.
  *Journal of Archaeological Science* 38(10): 2644-2657.
- **Orton, C. & Hughes, M.** (2013). *Pottery in Archaeology*, 2ª ed. Cambridge University Press. —
  EVEs / porcentaje de borde.
- **Zabrodsky, H., Peleg, S. & Avnir, D.** (1995). Symmetry as a continuous feature. *IEEE TPAMI*
  17(12): 1154-1166.
- **Saragusti, I., Sharon, I., Katzenelson, O. & Avnir, D.** (1998). Quantitative analysis of the
  symmetry of artefacts: Lower Paleolithic handaxes. *Journal of Archaeological Science* 25: 817-825.
- **Arbour, J.H. & Brown, C.M.** (2014). Incomplete specimens in geometric morphometric analyses.
  *Methods in Ecology and Evolution*. doi:10.1111/2041-210X.12128
- **Sullivan, A.P. & Rozen, K.C.** (1985). Debitage Analysis and Archaeological Interpretation.
  *American Antiquity* 50(4): 755-779. — y la crítica de **Amick, D.S. & Mauldin, R.P.** (1989),
  *American Antiquity* 54: 166-168.
- **Besl, P.J. & McKay, N.D.** (1992). A method for registration of 3-D shapes. *IEEE TPAMI* 14(2):
  239-256. — ICP.
- **Chetverikov, D., Svirko, D., Stepanov, D. & Krsek, P.** (2002). The Trimmed Iterative Closest
  Point algorithm. *Proc. ICPR'02*, vol. 3: 545-548. doi:10.1109/ICPR.2002.1047997 — TrICP: mínimos
  cuadrados recortados en todas las fases; **aplicable a solapamientos por debajo del 50 %**, que es
  exactamente el caso fragmento. Implementado en F2.
- **Umeyama, S.** (1991). Least-squares estimation of transformation parameters between two point
  patterns. *IEEE TPAMI* 13(4): 376-380. doi:10.1109/34.88573 — solución cerrada de la similitud; su
  aporte sobre Arun (1987) y Horn (1987) es no devolver una **reflexión** con datos corrompidos,
  control que F2 usa para decidir si una forma y su espejo cuentan como la misma.
- **Kåsa, I.** (1976). A circle fitting procedure and its error analysis. *IEEE Trans. Instrum. Meas.*
  25(1): 8-14. — ajuste algebraico de círculo usado en F1.
- **Fischler, M.A. & Bolles, R.C.** (1981). Random Sample Consensus. *Communications of the ACM*
  24(6): 381-395. — RANSAC.
- **Inizan, M.-L. et al.** (1999). *Technology and Terminology of Knapped Stone*. CREP, Nanterre.
- **Andrefsky, W.** (2005). *Lithics: Macroscopic Approaches to Analysis*, 2ª ed. Cambridge UP.
