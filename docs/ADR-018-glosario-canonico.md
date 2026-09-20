# ADR-018 — Glosario canónico de métricas

**Fecha:** 2026-09-03 · **Estado:** F0-F2 implementadas · **Decisión:** JFRR

> **Nota (2026-09-19).** La convención de la sigla IA de este ADR («IA = Identificación
> Automatizada») fue **sustituida por ADR-022**: la sigla se retiró y el modo se llama
> **detección asistida**. Las secciones afectadas conservan su texto como registro de la decisión
> anterior y llevan un aviso.

## Contexto

MAO Plus publica 278 magnitudes distintas repartidas en cuatro salidas (panel, Tabla
Completa, CSV y PDF). Ninguna parte del código dice qué significan. Un CSV de MAO no se
puede leer sin abrir `python/modules/metrics.py` al lado, y el anexo metodológico que
exige una publicación no existe.

Lo que sí existía:

| Artefacto | Qué fija | Alcance |
|---|---|---|
| `js/modules/category-manifest.js` (ADR-011/019) | qué secciones hay y en qué orden (I → XX-b) | 26 categorías |
| `python/modules/morphometric_registry.py` (ADR-006) | qué métricas son homólogas 2D↔3D, con fórmula y unidad | 31 métricas |
| `GLOSARIO_TERMINOS_MAO.html` | guía de nomenclatura, índice propio I–VI | ~40 términos, sin relación con el índice del informe |

La pieza que falta es la definición: **qué significa cada número**.

## El hecho que define el diseño

El informe tiene **dos taxonomías, y es deliberado.** ADR-011 congeló los rótulos del
CSV —«Índices de Forma», «Dimensiones Básicas», sin numeral romano— porque hay scripts
externos que dependen de esos nombres de columna, mientras panel, Tabla y PDF migraron
al índice canónico. Las dos no mapean 1:1:

- el CSV funde `II. Error Óptico` con `II-b. Incertidumbre` en una sola sección;
- publica los diámetros de Feret bajo «Métricas Avanzadas» aunque la Tabla los rinda en `IV`;
- tiene «Métricas Complementarias», «Clasificaciones», «Síntesis Final» y «COMPARACIÓN
  MORFOLÓGICA», que no existen en el manifiesto.

Un glosario escrito a mano contra una de las dos sería la **tercera taxonomía
divergente** — exactamente el fallo que ADR-016 y ADR-019 vinieron a corregir.

## Decisión

**El glosario es un módulo de datos, no un documento.** `js/modules/glossary.js`, sin
dependencias, hermano de los otros dos módulos canónicos. Cada entrada declara a la vez
su categoría canónica (`categoria` → numeral romano vía el manifiesto) y la columna
exacta del CSV que la publica (`csv`). Así el glosario **es el puente** entre las dos
taxonomías en lugar de competir con ellas.

De ese único origen salen todas las superficies, ninguna con definiciones propias:

- `anexoGlosarioHTML()` — anexo del informe, en orden canónico.
- `diccionarioColumnasCSV()` — columna del CSV → definición · unidad · fórmula.
- `tooltipDe()` — texto plano para el `title=` de la Tabla Completa.
- `scripts/generar-glosario-html.mjs` → `GLOSARIO_METRICAS_MAO.html`, página autónoma.

Profundidad por entrada (decisión JFRR): **científica con referencia bibliográfica** —
nombre, definición, fórmula, unidad, rango, interpretación arqueológica, módulo fuente y
origen conceptual. El campo `ref` apunta a la familia formal del índice, **no** a la
implementación: citar a Cox (1927) no afirma que el código replique ese artículo.

## Enforcement

Un glosario sin verificación se desincroniza en la siguiente sesión.
`python/tests/test_glosario.py` (11 pruebas) exige:

1. coherencia interna — sin duplicados, sin campos vacíos, sin referencias inexistentes;
2. toda `categoria` existe en el manifiesto;
3. **toda columna del CSV declarada se emite de verdad** — es la prueba del puente, la
   que detecta que alguien renombró un rótulo;
4. el `nivel` declarado coincide con `morphometric_registry.py`;
5. los alias se declaran como tales (evita creer que hay dos mediciones);
6. toda `fuente` apunta a un archivo existente;
7. la cobertura de F1+F2 nunca retrocede;
8. la sigla IA se declara ~~como «Identificación Automatizada»~~ **retirada** (ADR-022);
9. el rótulo del modo que ve el usuario ~~expande la sigla~~ **no la usa**: dice «Detección asistida» (ADR-022);
10. las convenciones declaradas no retroceden;
11. toda convención declara si es `sigla` o `regla`.

A ellas se suman las 5 de `python/tests/test_procedencia_analisis.py`, que fijan la
separación entre procedencia de detección y de análisis (ver más abajo).

**No** se exige que la adjudicación de categoría del glosario coincida con la que infiere
el inventario: el inventario *observa* qué emite el código con una heurística, el glosario
*adjudica* qué significa cada cosa con criterio. Que difieran es información.

## Procedencia del análisis: `analysis_source` (defecto corregido)

`analysis_method` es texto libre y **ocho** sitios lo escriben con ocho cadenas distintas
(«Contorno Real Extraído [REAL]», «… [Python]», «Bounding Box (Fallback) [APROXIMADO]»,
«MAO IA — Detección automática», «OBJ3D + PCA», «OBJ3D + FRONT/BACK 2D HOMOLOGATED»,
«MAO 3D — \<cara\>»), mientras **dos** lo comparaban por igualdad.

Una de esas comparaciones estaba muerta: `analysis-core.js` buscaba `"Bounding Box
(Fallback)"` **exacto**, y el único escritor emite `'Bounding Box (Fallback) [APROXIMADO]'`
— el sufijo se añadió después sin actualizar al lector. Consecuencia: el contador
`sinContorno` valía **0 siempre**, y toda pieza se reportaba como medida sobre contorno real,
incluidas las resueltas por caja envolvente, cuyas métricas de forma son aproximaciones.
La otra comparación (`collection.js`, ruta de re-enriquecimiento de análisis IA) **sí
coincidía**, pero por la misma vía frágil.

El campo mezcla además tres hechos ortogonales: de dónde salió el contorno, si es un
fallback aproximado, y con qué modo se detectó el objeto.

**Corrección**, siguiendo el precedente de ADR-008 (`detectionMethod` → enum +
`detectionMethodRaw`):

- enum canónico `ANALYSIS_SOURCE` = `contorno_real` · `bbox_fallback` · `ia` · `obj3d`, en
  `js/mao-deteccion-contract.js` junto al resto del contrato de procedencia;
- `fuenteAnalisis(m)` prefiere `analysis_source` y, para los análisis ya guardados en disco,
  lo deriva de la cadena legible **por subcadena, nunca por igualdad** — que es justamente
  lo que impide que un sufijo nuevo vuelva a matar un lector en silencio;
- predicados `esFallbackBBox(m)` y `esAnalisisIA(m)`;
- los 8 escritores sellan `analysis_source` junto a la cadena;
- los 2 lectores pasan por los predicados.

`analysis_method` **no cambia**: sigue siendo la cadena legible que viaja al CSV y al
informe. Lo que se añade es el campo que las máquinas deben leer.

`python/tests/test_procedencia_analisis.py` (5 pruebas) fija la separación: que todo
escritor selle el enum, que **nadie** compare la cadena por igualdad, que los valores
escritos sean miembros del enum, que las 8 cadenas legacy sigan resolviendo, y que sin
procedencia devuelva `null` en vez de adivinar.

## Convenciones de nomenclatura

Viven en `CONVENCIONES` dentro de `glossary.js`, **aparte de `TERMINOS`**: una sigla o una
regla de uso no es una métrica —no tiene clave en `metricas`, ni unidad, ni fórmula—.
Se rinden como **preámbulo del anexo**, antes de la primera métrica, porque son la clave de
lectura de todo lo que sigue. El campo `tipo` distingue `sigla` (se rinde «A = B») de
`regla` (enunciado de uso); sin él, el anexo imprimiría «Confianza = siempre calificada».

Cada una nació de una ambigüedad **verificada en el código**, no de una intuición:

| Término | Convención | Evidencia |
|---|---|---|
| **IA** | ~~= Identificación Automatizada~~ → **sigla retirada; el modo se llama «detección asistida»** (ADR-022) | 2 guías la expandían como «inteligencia artificial» |
| **AIA** | sigla retirada; ~~decir IA~~ → decir «detección asistida» (ADR-022) | segunda sigla del mismo módulo, nunca desarrollada; llega al usuario en 2 avisos |
| **Confianza** | nunca sola: «confianza DE qué» | **8** campos distintos; el código ya llevaba un aviso a mano |
| **Procedencia** | detección ≠ análisis | el defecto de `analysis_method`, arriba |
| **Simetría** | bilateral (1 pieza) ≠ bifacial (2 caras) | IX-b vs XX, medidas ortogonales |
| **Eje** | 3 sistemas distintos | rect. de área mínima · cuerda del contorno · PCA (+3 en 3D) |
| **Área** | 6 magnitudes; decir cuál | el área **neta** no tiene clave propia: es `area` recalculada |
| **Rótulos** | miden, no diagnostican | `solidity_class` dice «fragmentado» y contradice a XII |
| **Cara A/B** | A = anverso, B = reverso | constante en 5 sitios, nunca declarada |
| **Perforación / Horadación** | pasante vs ciega **no** es observable en 2D | decisión de ADR-009: candidatos sin tipo |

Dos de ellas señalan trabajo pendiente que **no** se resuelve escribiendo una convención:
darle clave propia al área neta, y neutralizar los rótulos de `solidity_class` como ADR-016 #6
hizo con los de rugosidad. Ambos cambian la salida del informe y exigen verificación visual.

## La sigla IA en detalle

> **Sustituido por ADR-022 (2026-09-19).** Redefinir la sigla no bastó: su autor la concebía como
> «Imagen Asistida», este ADR la fijó como «Identificación Automatizada», y cualquier lector
> hispanohablante la sigue leyendo como «inteligencia artificial». ADR-022 la retira y llama al modo
> **detección asistida**; `METODO_LABEL.ia` dice ahora «Detección asistida (parámetros fijados por el
> operador)» y las pruebas 8 y 9 exigen la retirada en lugar de la expansión. Lo que sigue es el
> registro de la decisión anterior. Una corrección adicional: la afirmación de que el modo puede
> resolverse «con MobileSAM como prior» no se sostenía — ninguna ruta de ese modo invoca MobileSAM.

**En MAO Plus «IA» significa «Identificación Automatizada», no «inteligencia artificial».**
La sigla nombra QUÉ hace el modo de detección —aislar la pieza sin que el operador trace ni
encuadre—, no con qué técnica lo hace. Ese dato es independiente y se consigna pieza a pieza
en `ia_segmentador`, que registra el motor concreto (núcleo OpenCV, MobileSAM como prior, o
ambos).

Leer la sigla como «inteligencia artificial» tiene dos costes reales: atribuye a un modelo
estadístico mediciones que a menudo produjo la umbralización clásica, y siembra desconfianza
sobre resultados tan deterministas como los del modo automático.

La convención vive en `CONVENCIONES` dentro de `glossary.js` — **aparte de `TERMINOS`**,
porque una sigla no es una métrica: no tiene clave en `metricas`, ni unidad, ni fórmula.
Se rinde como preámbulo del anexo, antes de la primera métrica, porque es la clave de
lectura de todo lo que sigue.

**Alcance de la corrección:**

| Superficie | Antes | Ahora |
|---|---|---|
| `detection-section.js::METODO_LABEL` | `IA (segmentación asistida)` | `IA — Identificación Automatizada (segmentación asistida)` |
| `GUIA_METRICAS_MAO.html` | «análisis asistido por inteligencia artificial» (×4) | expansión correcta |
| `PRINCIPIOS_MORFOMETRIA_MAO.html` | «(Análisis por Inteligencia Artificial)» | «(Identificación Automatizada)» |
| `index.html` (tooltip del botón) | sin expandir | expande la sigla una vez, al introducirla |

Cambiar `METODO_LABEL` es seguro: es una etiqueta de **presentación**. La clave canónica es
el enum `ia` (ADR-008), `detection_method_raw` conserva el valor crudo y nada en el código
compara contra ese texto. Cambia el VALOR de la columna «Detección › Método de detección»
del CSV, no su nombre — el esquema que ADR-011 congeló queda intacto.

Dos pruebas lo sostienen: `test_la_sigla_ia_se_declara_como_identificacion_automatizada` y
`test_el_rotulo_del_modo_ia_expande_la_sigla`.

## Dos correcciones que las convenciones destaparon

Ambas señaladas por la convención correspondiente y corregidas después, a petición explícita.

### Área neta: existía, se persistía, y nadie la publicaba

`area_neta`, `perimetro_neto` y `porosidad` se calculan y se guardan cuando la pieza tiene
P/H confirmados — pero **ninguna salida de lectura las rendía**. El CSV daba el área bruta en
«Dimensiones Básicas» y los totales de P/H en otra sección, dejando al lector una resta que
ni siquiera era obviamente la correcta; la Tabla Completa no las mencionaba.

*(Una revisión anterior de este ADR afirmó que el área neta «no tenía clave propia». Era
falso: la clave existía desde hacía tiempo. El defecto era de publicación, no de modelo.)*

**Corrección:** derivado canónico `MetricPresenter.areaNetaDerivados()` —único sitio que
decide cuándo un `area_neta` almacenado es fiable: se rechaza si supera a la bruta, señal de
que viene de otra escala o de un cálculo desfasado— y `notaAreaNeta()`, que distingue los tres
casos que «neta = bruta» confunde: no hay huecos · los hay sin confirmar · el valor almacenado
es incoherente. Se publican en el CSV (4 filas nuevas en «Dimensiones Básicas», emitidas
siempre por esqueleto estable de ADR-011) y en la Tabla Completa, **junto a la bruta**, que es
donde la comparación es inmediata.

El invariante de ADR-009 queda por fin visible: **el área neta sólo descuenta P/H
confirmados**; un candidato detectado y no confirmado no altera nada.

### `solidity_class`: rótulos que diagnosticaban en vez de medir

La solidez es `A_real / A_hull`. Baja igual por una fractura que por una morfología
naturalmente cóncava, de modo que rotularla «Moderadamente / Muy / Extremadamente
fragmentado» emitía un juicio tafonómico que la medición no sostiene — y contradecía a
`XII. Estado de Conservación`, que sí mide fragmentación por área perdida. Es la misma
corrección que ADR-016 #6 aplicó a la rugosidad; la solidez había quedado fuera.

Había **tres** escaleras: `metrics.py`, `analysis-core.js` y `mao-ia.js` — esta última con
umbrales propios (0.90/0.75/0.55) y rótulos propios, así que la misma pieza recibía un rótulo
distinto según la vía por la que se analizara. Ahora una sola,
`metric-presenter.js::clasificarSolidez`, con paridad textual verificada en Python y
**umbrales intactos** (0.95/0.85/0.70/0.50): sólo cambia el texto.

| Solidez | Antes | Ahora |
|---|---|---|
| ≥ 0.95 | Completamente sólido/intacto | Sin concavidades (ocupa su envolvente) |
| ≥ 0.85 | Mayormente completo | Concavidades leves |
| ≥ 0.70 | Moderadamente fragmentado | Concavidades moderadas |
| ≥ 0.50 | Muy fragmentado | Concavidades marcadas |
| < 0.50 | Extremadamente fragmentado | Contorno muy entrante |

También se neutralizaron los bloques «Evaluación» hardcodeados de las dos superficies, que
afirmaban «Objeto en excelente estado de conservación» a partir de la solidez.

`python/tests/test_coherencia_entrega.py` gana 4 pruebas: que ningún sitio asigne a
`solidity_class` un rótulo con «fragmentad», la paridad textual Python↔JS, que el área neta se
publique junto a la bruta **con su nota**, y que ambas superficies usen el derivado canónico.
La escalera de solidez entra además en el enforcement de fuente única que ya existía para
rugosidad y curvatura.

### Cobertura del área neta en las seis superficies

Publicarla en dos salidas y no en las demás deja al lector comparando un informe que la trae
con otro que no, así que se cerró en todas:

| Superficie | Antes | Ahora |
|---|---|---|
| CSV monofacial | ❌ | ✅ Área Neta + nota + Perímetro Neto + Porosidad |
| Tabla Completa | ❌ | ✅ Área neta + Perímetro neto (la porosidad ya la rinde XIX) |
| **`metricas.csv`** (archivado por pieza) | ❌ | ✅ `02_Dimensiones` (la porosidad ya la emite `11_ComparativoPH`) |
| **PDF integral** | ❌ | ✅ en «II. Dimensiones Métricas del Objeto» |
| Panel de análisis | ⚠️ inline ×2 | ✅ derivado canónico |
| Motor (`sincronizarMetricasPH`) | — | fuente del valor |

Llegó a haber **seis derivaciones independientes** del mismo criterio de aceptación
(«rechazar el `area_neta` almacenado si supera a la bruta»): CSV, Tabla, PDF, dos en el panel
y la del motor. El PDF, además, ignoraba por completo el valor persistido y lo recalculaba
como `metricas.area − Σ P/H`.

Dos hallazgos al cerrarlo:

- **El área neta vive en DOS sitios** según qué código la escribiera: `metricas.area_neta`
  (sincronización de P/H — lo que leen CSV, Tabla y PDF) y `obj.area_neta` (ruta de
  exportación — lo que leía el panel). Una superficie que consulte sólo uno muestra «sin P/H
  confirmados» en piezas que sí los tienen. `areaNetaDerivados(metricas, obj)` consulta ambos,
  con precedencia del primero.
- **`visualization-export.js` no importaba `metric-presenter.js`.** Las dos llamadas nuevas
  habrían lanzado `ReferenceError` en runtime; `node -c` no lo ve, y la prueba de humo del
  módulo sí. Import añadido.

El PDF necesitó además un cambio de contrato menor: sus secciones se declaran como
`[etiqueta, clave]` y el renderizador **omite la fila si la clave no existe** — que es
justamente lo que pasa con `area_neta` cuando no hay P/H, y omitirla devolvería al lector la
ambigüedad que este trabajo quita. Ahora admite un tercer elemento con el valor ya derivado.

### Efecto lateral en el inventario

Las filas del CSV que toman su valor de un derivado (`${fmt(_an.neta, 3)}` en vez de
`m.area_neta`) no son enlazables por parseo estático: son **30 de 217**, y `area_neta` y
`perimetro_neto` quedaban por eso fuera del universo, subestimando la cobertura en silencio.
El inventario ahora recupera el enlace desde el propio glosario —que lo declara— aceptándolo
sólo si la columna existe de verdad en el CSV, y reporta ambas cifras en el resumen.

## Plan por fases

| Fase | Alcance | Estado |
|---|---|---|
| **F0** | Inventario automático: `scripts/glosario_inventario.py` cruza las 4 fuentes | ✅ |
| **F1** | Núcleo morfométrico: IV, V, VI, VII, VII-b, VIII, IX, IX-b, XVII | ✅ |
| **F2** | Procedencia e incertidumbre: I, II, II-b | ✅ |
| **F3** | P/H (XV, XV-b) y comparativas (XX, XX-b) | pendiente |
| **F4** | XI 3D, XII conservación, XIII textura, XIV depuración, XVI patrón, XVIII clasificación, XIX metadatos | pendiente |
| **F5** | Cableado del anexo al PDF + tooltips en la Tabla; retiro de `GLOSARIO_TERMINOS_MAO.html` | pendiente |

Cobertura al cierre de F2: **88 términos de 278**, 12 categorías de 26, 73 columnas del
CSV documentadas. `npm run glosario:inventario` mide el resto en cualquier momento.

## Hallazgos del código que destapó F0

El inventario no era el objetivo, pero al construirlo salieron cuatro defectos reales:

1. **`XIV. Depuración Estadística de Contorno` no la rinde ninguna función de la Tabla**,
   pese a estar en el manifiesto y a que el CSV sí emite sus 3 filas. ADR-011 dio la Tabla
   por «26 secciones siempre»; son 25.
2. **`XX. Comparación Bifacial` y `XX-b` tampoco.** `generarSeccionComparacionBifacial()`
   rotula «22. COMPARACIÓN BIFACIAL» en **arábigo y a mano**. El test de ADR-019 no lo
   detecta porque solo persigue numerales romanos.
3. **Tres funciones comparativas** (`generarTablaComparativaDimensiones`, `…Forma`, `…PH`)
   leen métricas y rotulan sin pasar por `encabezadoDe()`.
4. **Dos funciones emiten varias secciones desde un solo cuerpo**
   (`generarSeccionIncertidumbrePropagada` → II-b + II; `generarSeccionPropiedadesContorno`
   → XIII + VII), lo que impide adjudicar sus claves automáticamente.

Ninguno se corrige en este ADR: son ortogonales al glosario y (1) y (2) cambian la salida
del informe, lo que exige verificación visual en Electron. Quedan registrados aquí.

## Consecuencias

- Corregir una definición se hace en un sitio y cambia en las tres superficies.
- Una columna del CSV renombrada rompe el test en vez de dejar una definición fantasma.
- El anexo metodológico para publicación deja de escribirse a mano.
- Coste: cada métrica nueva debe traer su entrada, o la cobertura declarada retrocede y el
  test avisa.

## Reversibilidad

**El glosario, total.** `glossary.js` y `glossary-annex.js` no los importa ninguna superficie
de producción todavía (F5 es lo que las cablea). Borrar los dos módulos, sus pruebas y los dos
scripts deja el repositorio como estaba; nada más depende de ellos.

**El arreglo de `analysis_source`, no** — y a propósito: corrige un contador que reportaba mal.
Es aditivo (ningún campo existente cambia de valor, `analysis_method` incluido) y degrada con
gracia: los lectores caen a una comparación por subcadena si `window.MaoDeteccion` no está,
de modo que comentar el `<script>` del contrato no rompe nada, solo devuelve la derivación al
modo tolerante. Revertirlo del todo restaura el contador roto.

**Las convenciones, total.** Son datos; vaciar `CONVENCIONES` no afecta a ninguna métrica.
La única que además cambió código es la sigla IA, en una etiqueta de presentación.
