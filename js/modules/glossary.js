/**
 * GLOSSARY — Glosario canónico de términos morfométricos de MAO Plus
 * ==========================================================================
 * Fuente ÚNICA de la DEFINICIÓN de cada magnitud que MAO Plus mide y publica.
 * Hermano de `category-manifest.js` (que fija QUÉ secciones existen y en qué
 * orden) y de `morphometric_registry.py` (que fija qué métricas son homólogas
 * entre 2D y 3D). Este módulo responde la tercera pregunta, la que hasta ahora
 * no tenía respuesta en ninguna parte del código: **qué significa cada número**.
 *
 * ─── Por qué es un módulo de datos y no un documento ──────────────────────
 * El informe de MAO tiene DOS taxonomías, y es deliberado. ADR-011 congeló los
 * rótulos del CSV («Índices de Forma», «Dimensiones Básicas») para no romper los
 * scripts que ya consumen esas columnas, mientras el panel, la Tabla Completa y
 * el PDF migraron al índice canónico con numeral romano (I → XX-b). Las dos
 * conviven y no mapean 1:1: el CSV funde `II. Error Óptico` con `II-b.
 * Incertidumbre` en una sola sección, y publica los diámetros de Feret bajo
 * «Métricas Avanzadas» aunque la Tabla los rinda en `IV. Dimensiones`.
 *
 * Un glosario escrito a mano se convertiría en la tercera taxonomía divergente.
 * Escrito como datos, es el PUENTE entre las dos: cada entrada declara a la vez
 * su categoría canónica (`categoria` → numeral romano vía el manifiesto) y la
 * columna exacta del CSV que la publica (`csv`). De ahí se generan el anexo del
 * informe, el diccionario de datos del CSV y los tooltips de la app, sin que
 * ninguna superficie vuelva a escribir una definición por su cuenta.
 *
 * ─── Sobre el campo `ref` ─────────────────────────────────────────────────
 * Apunta al ORIGEN CONCEPTUAL del índice, no a la implementación. Que una
 * entrada cite a Cox (1927) significa que el índice pertenece a esa familia
 * formal, no que el código replique ese artículo. Donde MAO define una magnitud
 * propia (los índices de estrellamiento y lobularidad, la escalera de rótulos
 * de rugosidad), la entrada no lleva `ref` y lo dice en `definicion`.
 *
 * ─── Alcance de esta pasada (F1 + F2) ─────────────────────────────────────
 * Procedencia e incertidumbre (I, II, II-b) y núcleo morfométrico (IV, V, VI,
 * VII, VII-b, VIII, IX, IX-b, XVII). Las categorías XI, XII, XIII, XIV, XV,
 * XV-b, XVI, XVIII, XIX, XX y XX-b quedan para F3-F4; el inventario
 * (`scripts/glosario_inventario.py`) mide en cada momento lo que falta.
 *
 * Sin dependencias, igual que los otros dos módulos canónicos.
 * ==========================================================================
 */

/**
 * @typedef {Object} TerminoSpec
 * @property {string}   clave          Clave real en el objeto `metricas` (la que viaja en el JSON).
 * @property {string}   ambito         'objeto' | 'perforacion' | 'horadacion' | 'bifacial'.
 * @property {string}   categoria      id de `category-manifest.js` → aporta el numeral romano.
 * @property {?string[]} csv           [sección, campo] exactos del CSV, o null si no se publica allí.
 * @property {string}   nombre         Etiqueta legible.
 * @property {string}   definicion     Qué mide, en una o dos frases.
 * @property {?string}  formula        Expresión de referencia. null si es un rótulo derivado.
 * @property {string}   unidad         'mm' | 'mm²' | 'grados' | '%' | 'adimensional' | 'texto' | 'conteo'
 * @property {?string}  rango          Dominio y lectura de los extremos.
 * @property {string}   interpretacion Qué significa para la pieza, no para el píxel.
 * @property {string}   fuente         `archivo::función` que la calcula.
 * @property {?string}  nivel          'H'|'P'|'2D'|'3D' de `morphometric_registry.py`, si figura allí.
 * @property {?string[]} ref           Claves de `REFERENCIAS`.
 * @property {?string}  nota           Advertencia de uso: alias, trampa conocida, ámbito de validez.
 */

/** Bibliografía citada por las entradas. Clave → referencia completa. */
export const REFERENCIAS = {
  cox1927: 'Cox, E. P. (1927). A method of assigning numerical and percentage values to the degree of roundness of sand grains. Journal of Paleontology, 1(3), 179–183.',
  wadell1932: 'Wadell, H. (1932). Volume, shape and roundness of rock particles. The Journal of Geology, 40(5), 443–451.',
  wadell1935: 'Wadell, H. (1935). Volume, shape, and roundness of quartz particles. The Journal of Geology, 43(3), 250–280.',
  feret1930: 'Feret, L. R. (1930). La grosseur des grains des matières pulvérulentes. Association Internationale pour l\'Essai des Matériaux, 2D, 428–436.',
  menger1930: 'Menger, K. (1930). Untersuchungen über allgemeine Metrik. Mathematische Annalen, 103, 466–501.',
  brown1971: 'Brown, D. C. (1971). Close-range camera calibration. Photogrammetric Engineering, 37(8), 855–866.',
  zhang2000: 'Zhang, Z. (2000). A flexible new technique for camera calibration. IEEE Transactions on Pattern Analysis and Machine Intelligence, 22(11), 1330–1334.',
  gum2008: 'JCGM 100:2008. Evaluation of measurement data — Guide to the expression of uncertainty in measurement (GUM). Bureau International des Poids et Mesures.',
  klingenberg2015: 'Klingenberg, C. P. (2015). Analyzing fluctuating asymmetry with geometric morphometrics: concepts, methods, and applications. Symmetry, 7(2), 843–934.',
  bookstein1991: 'Bookstein, F. L. (1991). Morphometric Tools for Landmark Data: Geometry and Biology. Cambridge University Press.',
  // kuhl1982 (EFA), haralick1973 (GLCM), andrefsky2005 e inizan1999 (terminología
  // lítica) entran con sus secciones en F3-F4. El contrato prohíbe bibliografía
  // declarada y no citada: se añaden cuando haya un término que las use.
  russ2011: 'Russ, J. C. (2011). The Image Processing Handbook (6th ed.). CRC Press.',
};

const METRICS = 'python/modules/metrics.py';
const SCALE = 'python/modules/scale.py';

/**
 * @typedef {Object} ConvencionSpec
 * @property {string} id        Identificador estable de la convención.
 * @property {'sigla'|'regla'} tipo  `sigla` se rinde como «A = B»; `regla` como
 *                              enunciado de uso. Mezclarlas produce rótulos
 *                              absurdos del tipo «Confianza = siempre calificada».
 * @property {string} termino   La sigla o el término tal como aparece en la interfaz.
 * @property {string} expansion Qué designa, desarrollado.
 * @property {string} nota      Por qué se fija la convención y qué NO afirma.
 */

/**
 * CONVENCIONES DE NOMENCLATURA — siglas y términos de interfaz.
 *
 * No son métricas: no tienen clave en `metricas`, ni unidad, ni fórmula. Viven
 * aparte de `TERMINOS` justamente por eso — meterlas en el mismo array obligaría
 * a inventarles campos que no tienen. Se rinden como preámbulo del anexo, antes
 * de la primera métrica, porque son la clave de lectura de todo lo que sigue.
 *
 * @type {ConvencionSpec[]}
 */
export const CONVENCIONES = [
  {
    id: 'deteccion_asistida', tipo: 'regla',
    termino: 'Detección asistida',
    expansion: 'el operador fija los parámetros, encuadra si quiere y revisa objeto a objeto; no interviene ningún modelo entrenado',
    nota: 'Nombre del modo de detección que la interfaz rotulaba «IA», «MAO IA» o «Analizar con IA» (ADR-022). Ocupa el punto intermedio de una escala de intervención del operador: en la detección **automática** el sistema aísla las piezas sin ayuda; en la **asistida** el operador elige la umbralización (`auto` = núcleo OpenCV, u Otsu, adaptativa o manual), el realce CLAHE, el desenfoque y el área mínima, puede encuadrar una región, revisa cada objeto por su confianza de detección, lo refina si hace falta y decide cuáles pasan al análisis; en la **manual** el operador encuadra un área o señala un componente. Todo el procesamiento es clásico y determinista —CLAHE, umbral, watershed y, con `auto`, el núcleo Z-scan + GrabCut de ADR-012—: **no interviene ningún modelo entrenado**. «Asistida» describe la participación del operador, no una asistencia por inteligencia artificial. Los identificadores internos conservan el nombre histórico —enum `ia` (ADR-008/018), claves `ia_*`, `mao_ia`, `/api/mao-ia`, `mao-ia.js`— porque los proyectos guardados dependen de ellos; nunca se muestran al usuario.',
  },
  {
    id: 'sigla_ia', tipo: 'sigla',
    // Las siglas retiradas van entre comillas angulares: se MENCIONAN, no se usan.
    termino: '«IA»',
    expansion: 'sigla retirada — el modo se llama «detección asistida»',
    nota: 'La sigla tuvo **tres lecturas incompatibles**: las guías la desarrollaban como «inteligencia artificial», ADR-018 la fijó como «Identificación Automatizada» y su autor la concebía como «Imagen Asistida». Ninguna redefinición resolvía el problema, porque un lector hispanohablante lee «IA» como inteligencia artificial antes de llegar a la nota que dice lo contrario. El efecto era doble: se atribuían a un modelo estadístico mediciones que produjo la umbralización clásica, y se desconfiaba de resultados tan deterministas como los del modo automático. **Convención (ADR-022): la sigla se retira y el modo se llama «detección asistida».** Vale también para «MAO IA» y «MAO_IA», que eran además el nombre de la aplicación autónoma de la que se portó el pipeline. Un análisis guardado con la cadena antigua («MAO IA — Detección automática») se sigue leyendo: la procedencia se deriva del enum, no del texto.',
  },
  {
    id: 'sigla_aia', tipo: 'sigla',
    termino: '«AIA»',
    expansion: 'sigla retirada — decir «detección asistida»',
    nota: '«AIA» fue una segunda sigla del mismo modo, **nunca desarrollada en ningún sitio**: rotulaba la sección de la guía («Módulo MAO IA — Detección AIA»), un botón y dos avisos de `collection.js` («Actualizando métricas del análisis AIA…»). ADR-018 la retiró en favor de «IA»; al retirarse también «IA» (ADR-022), las dos remiten a **«detección asistida»**. Los identificadores internos que la conservan (`_isAIA`, `modalAIA`) solo los lee quien edita el código; ningún texto que vea el usuario la usa.',
  },
  {
    id: 'inteligencia_artificial', tipo: 'regla',
    termino: 'Inteligencia artificial',
    expansion: 'solo para un modelo entrenado, y nombrándolo; hoy ningún modo de detección ni de medición usa uno',
    nota: 'Ninguna superficie debe sugerir que MAO Plus mide con inteligencia artificial, porque ningún modo vigente lo hace. Lo que la interfaz llegó a presentar como tal es cálculo clásico: **GrabCut** (Rother, Kolmogorov y Blake, 2004) es un corte de grafos sobre mezclas gaussianas estimadas en la propia imagen —se rotulaba «GrabCut AI»—; la **tipología arqueológica** sale de un clasificador por reglas morfométricas con evidencia EFA, sin datos de entrenamiento —se rotulaba «IA Fase 2»—; la **detección de P/H por malla** hace crecer regiones desde una malla de semillas —se rotulaba «Detección IA Auto»—. El comparador de colecciones usa estadística multivariante clásica (PCA, k-medias) ajustada a la propia colección, no un modelo preentrenado. El único componente neuronal del repositorio es **MobileSAM**, un segmentador preentrenado opcional (`/api/sam-contour`) que hoy ningún modo de detección invoca. **Convención: «IA» no se usa como rótulo. Un modelo entrenado se nombra por su nombre y su naturaleza («MobileSAM, red neuronal») en el punto exacto donde interviene.**',
  },
  {
    id: 'confianza_calificada', tipo: 'regla',
    termino: 'Confianza',
    expansion: 'nunca sola: siempre «confianza DE qué»',
    nota: 'MAO calcula al menos **ocho confianzas semánticamente distintas**, y el propio código ya llevaba un aviso escrito a mano advirtiéndolo (`detection-section.js`: «Confundirlas es un error de lectura real en informes previos»). Son: `detection_confidence` (fiabilidad del **recorte**), `forma_confianza` y `forma_confianza_global` (de la **clasificación de forma**), `confianza_optica` (tramo del **error óptico**), `patron_agrupamiento_confianza` (ajuste del **patrón de P/H**), `confianza_tipologia` (seguridad de la **tipología arqueológica**), `_confianza_hueco` (verosimilitud de un **candidato P/H**) y `forma_idealizada_confianza`. Un informe que diga «Confianza: alta» en dos secciones está afirmando dos cosas sin relación entre sí, y nada en el texto avisa de ello. **Convención: en toda superficie visible, «confianza» va calificada.** Un valor de confianza sin calificar es un defecto de presentación, no un dato.',
  },
  {
    id: 'procedencia_deteccion_vs_analisis', tipo: 'regla',
    termino: 'Procedencia',
    expansion: 'dos ejes distintos: cómo se DETECTÓ y de dónde salieron las MÉTRICAS',
    nota: 'Son preguntas independientes y se responden con campos distintos. **Detección** (`detection_method`, enum `automatic`/`manual`/`ia` de ADR-008): cómo se aisló la pieza del fondo. **Análisis** (`analysis_source`, enum `contorno_real`/`bbox_fallback`/`ia`/`obj3d` de ADR-018): de dónde salieron sus métricas. La distinción no es académica: un objeto con `bbox_fallback` tiene métricas de forma que son **aproximaciones por caja envolvente**, no mediciones del contorno, y leerlas como equivalentes falsea cualquier comparación. `analysis_method` conserva la cadena legible para el CSV y el informe, pero **no debe compararse por igualdad**: es texto libre que ocho sitios escriben distinto, y esa comparación ya mató un contador una vez (ver ADR-018).',
  },
  {
    id: 'simetria_ambito', tipo: 'regla',
    termino: 'Simetría',
    expansion: 'siempre con su unidad de análisis: bilateral (una pieza) o bifacial (dos caras)',
    nota: 'Dos familias con el mismo nombre y objetos distintos. **Bilateral** (`simetria_bilateral`, sección IX-b) compara **una pieza consigo misma** respecto a su eje principal. **Bifacial** (`simetriaArea`, `simetriaEspecular`, `simetriaPosicional`, `simetriaOrientacion`, sección XX) compara **dos caras entre sí**. Una pieza puede ser muy simétrica bilateralmente y muy asimétrica entre caras, o al revés: son medidas ortogonales. **Convención: «simetría» nunca aparece sin su calificador.**',
  },
  {
    id: 'eje_sistema', tipo: 'regla',
    termino: 'Eje mayor / eje principal',
    expansion: 'tres sistemas distintos que dan tres números sobre la misma pieza',
    nota: 'No son sinónimos. `eje_mayor` sale del **rectángulo de área mínima**; `eje_mayor_real_longitud` es la **cuerda máxima medida sobre el contorno**; `eje_principal_*` viene del **análisis de componentes principales** de la distribución de masa del contorno. Difieren cuando la pieza no llena su rectángulo, y su dirección puede no coincidir. En 3D hay además `eje_longitudinal_principal`, `eje_transversal` y `eje_dorsoventral_espesor`. **Convención: citar cuál se usó.** Para comparar piezas entre sí, la magnitud más robusta no es ninguna de las tres sino `feret_max`, que no depende de ejes ni de cajas.',
  },
  {
    id: 'area_variante', tipo: 'regla',
    termino: 'Área',
    expansion: 'seis magnitudes; decir cuál',
    nota: '`area` (encerrada por el contorno real, **bruta**) · `area_neta` (descuenta P/H confirmadas) · `hull_area` (envolvente convexa) · `area_px` (sin escalar) · `area_fragmentada` · `bbox_area` (caja). **Convención: al publicar un área, decir cuál es y si es neta.** `area_neta` sí tiene clave propia —una revisión anterior afirmó lo contrario y era falso—, pero hasta ADR-018 **ninguna salida de lectura la publicaba**: el CSV daba la bruta y los totales de P/H en secciones separadas, y restar a mano ni siquiera era obviamente correcto. Ahora ambas van juntas, con una nota que distingue «no hay huecos» de «los hay sin confirmar».'
  },
  {
    id: 'rotulos_miden_no_diagnostican', tipo: 'regla',
    termino: 'Rótulos de clasificación',
    expansion: 'describen la medición; no diagnostican el estado de la pieza',
    nota: 'El motor mide; la lectura tafonómica es del investigador. ADR-016 #6 ya neutralizó por esta razón los rótulos de rugosidad, que diagnosticaban fractura y **contradecían la sección de conservación de la misma pieza**. La solidez quedó fuera de aquella pasada y **se corrigió en ADR-018**: `solidity_class` decía «Moderadamente/Muy/Extremadamente fragmentado» cuando lo que mide es la relación entre el área y su casco convexo —una lasca naturalmente cóncava salía «fragmentada» sin estarlo, contradiciendo a `XII. Estado de Conservación`, que sí mide fragmentación por área perdida—. Ahora describe concavidades, con los umbrales intactos. **Convención: los rótulos nombran lo medido.** La escalera vive en `metric-presenter.js::clasificarSolidez`, con paridad textual en `metrics.py`; había además una TERCERA en `mao-ia.js` con umbrales propios (0.90/0.75/0.55), de modo que la misma pieza recibía rótulos distintos según la vía — también unificada.',
  },
  {
    id: 'caras_a_b', tipo: 'regla',
    termino: 'Cara A / Cara B',
    expansion: 'A = anverso, B = reverso — de facto constante, ahora declarado',
    nota: 'La correspondencia se aplica de forma consistente en toda la interfaz y las exportaciones (`Anverso (Cara A)`, `A - Anverso`, `Cara A (Anverso)`), pero **no estaba declarada en ninguna parte**: era una regularidad, no una regla, y nada impedía que un sitio nuevo la invirtiera. Qué cara física es el anverso lo decide el investigador al fotografiar; MAO no lo infiere. **Convención: A es anverso y B es reverso; en texto para lector humano se nombra la cara, no la letra sola.**',
  },
  {
    id: 'perforacion_horadacion', tipo: 'regla',
    termino: 'Perforación / Horadación',
    expansion: 'pasante vs. ciega — distinción NO observable en 2D',
    nota: 'Los nombres afirman una diferencia de profundidad —la perforación atraviesa la pieza, la horadación no— que **una imagen cenital no puede sostener**. ADR-009 ya asumió la consecuencia: los huecos que el motor detecta solos nacen como **candidatos sin tipo**, y es el investigador quien asigna uno. **Convención: el motor detecta «huecos»; perforación y horadación son determinaciones humanas.** Una salida que presente un hueco ya tipado sin confirmación del usuario está afirmando algo que no midió. De ahí que el área neta solo descuente P/H **confirmados**.',
  },
];

/** @type {TerminoSpec[]} */
export const TERMINOS = [

  // ═══════════════════════════════════════════════════════════════════════
  // I. DETECCIÓN DEL OBJETO — la procedencia del dato
  // ═══════════════════════════════════════════════════════════════════════
  {
    clave: 'detection_method', ambito: 'objeto', categoria: 'deteccion',
    csv: ['Detección', 'Método de detección'],
    nombre: 'Método de detección', formula: null, unidad: 'texto',
    rango: 'automático | detección asistida | manual de área | manual por componente',
    definicion: 'Modo por el que se aisló la pieza del fondo, ordenado por la intervención del operador: **automático** (ninguna), **detección asistida** (el operador fija los parámetros de umbralización y revisa objeto a objeto), **manual** de área o por componente (el operador encuadra un rectángulo o señala la pieza). Los modos comparten el núcleo de segmentación OpenCV (Z-scan + CLAHE + GrabCut + watershed) y se diferencian en lo que el operador le aporta; en la detección asistida, los umbrales distintos de `auto` sustituyen el Z-scan por el criterio elegido y conservan la separación por watershed. **Ninguno usa un modelo entrenado.**',
    interpretacion: 'Condiciona la comparabilidad entre piezas: un lote medido con encuadres o umbrales elegidos a mano no es directamente comparable con uno automático. Declararlo es requisito para reproducir la medición.',
    fuente: 'js/modules/detection-section.js::metodoLegible', nivel: null, ref: null,
    nota: 'ADR-012: el núcleo es único; el modo es un prior, no una reimplementación. El enum interno del modo asistido sigue siendo `ia` por compatibilidad con los proyectos guardados; su rótulo es «Detección asistida» (ADR-022).',
  },
  {
    clave: 'detection_method_raw', ambito: 'objeto', categoria: 'deteccion',
    csv: ['Detección', 'Modo crudo registrado'], nombre: 'Modo crudo registrado', formula: null, unidad: 'texto',
    rango: 'enum interno del motor', definicion: 'Identificador sin traducir del modo de detección, tal como lo emitió el motor. Se conserva junto al rótulo legible para no perder resolución cuando el enum crece.',
    interpretacion: 'Uso diagnóstico. Si `detection_method` y este campo discrepan, el mapeo de rótulos quedó desactualizado.',
    fuente: 'js/modules/detection-section.js::filasDeteccion', nivel: null, ref: null, nota: null,
  },
  {
    clave: 'detection_confidence', ambito: 'objeto', categoria: 'deteccion',
    csv: null, nombre: 'Confianza de detección (score)', formula: null, unidad: 'adimensional',
    rango: '[0,1] — 1 = segmentación inequívoca',
    definicion: 'Puntuación compuesta que el núcleo asigna al aislamiento de la pieza, combinando el contraste figura-fondo, la estabilidad del contorno entre umbrales y la competencia entre candidatos del Z-scan.',
    interpretacion: 'Es confianza en el RECORTE, no en la clasificación tipológica ni en la exactitud métrica. Un score bajo invalida las métricas derivadas del contorno antes que cualquier otra cosa: conviene revisar esas piezas a mano antes de agregarlas a un análisis.',
    fuente: 'python/modules/detection.py::_confianza_objeto', nivel: null, ref: null,
    nota: 'El CSV publica score y nivel juntos en la columna «Detección › Confianza de detección», declarada por `detection_confidence_level`.',
  },
  {
    clave: 'detection_confidence_level', ambito: 'objeto', categoria: 'deteccion',
    csv: ['Detección', 'Confianza de detección'], nombre: 'Confianza de detección (nivel)', formula: null, unidad: 'texto',
    rango: 'alta | media | baja',
    definicion: 'Discretización de `detection_confidence` en tres tramos, para triage visual.',
    interpretacion: 'El filtro «solo baja confianza» de la interfaz opera sobre este campo. Sirve para ordenar el trabajo de revisión, no para descartar piezas automáticamente.',
    fuente: 'python/modules/detection.py::_confianza_objeto', nivel: null, ref: null,
    nota: 'Alias histórico: `confidence_level`. Ambos se emiten; documentan la misma magnitud.',
  },
  {
    clave: 'confidence_level', ambito: 'objeto', categoria: 'deteccion',
    csv: null, nombre: 'Confianza de detección (nivel, alias)', formula: null, unidad: 'texto',
    rango: 'alta | media | baja',
    definicion: 'Alias de `detection_confidence_level`, conservado por compatibilidad con consumidores anteriores al contrato de ADR-008.',
    interpretacion: 'No es una segunda medición. Si difiere de `detection_confidence_level`, hay una ruta de datos que no pasó por el normalizador del contrato de captura.',
    fuente: 'js/mao-deteccion-contract.js', nivel: null, ref: null,
    nota: 'Alias — preferir `detection_confidence_level` en análisis nuevos.',
  },
  {
    clave: 'ia_segmentador', ambito: 'objeto', categoria: 'deteccion',
    csv: ['Detección', 'Segmentador / motor'], nombre: 'Segmentador / motor', formula: null, unidad: 'texto',
    rango: 'Núcleo OpenCV (Z-scan+CLAHE+GrabCut+watershed) | Umbralización OpenCV (otsu, adaptive o manual) + watershed',
    definicion: 'Motor que resolvió el aislamiento de la pieza en la detección asistida: el núcleo canónico (umbralización `auto`) o el umbral que eligió el operador seguido de la separación por watershed. Es el campo que dice CON QUÉ se aisló la pieza.',
    interpretacion: 'Parte de la trazabilidad del dato: junto con `ia_params`, permite reproducir el contorno de la pasada principal. Vacío en los modos que no pasan por la ventana de detección asistida. Ningún valor actual corresponde a un modelo entrenado; si alguno llegara a hacerlo, este campo tendría que nombrarlo.',
    fuente: 'js/mao-ia.js', nivel: null, ref: null,
    nota: 'El prefijo `ia_` de la clave es el nombre histórico del modo (ADR-022): se conserva porque los proyectos guardados lo usan, y no significa inteligencia artificial.',
  },
  {
    clave: 'ia_threshold_method', ambito: 'objeto', categoria: 'deteccion',
    csv: ['Detección', 'Umbralización (detección asistida)'], nombre: 'Umbralización (detección asistida)', formula: null, unidad: 'texto',
    rango: 'auto | otsu | adaptive | manual',
    definicion: 'Estrategia de umbral que el operador eligió en la detección asistida. `auto` delega en el núcleo OpenCV canónico; `otsu`, `adaptive` y `manual` umbralizan con ese criterio y separan las piezas en contacto con el watershed del núcleo.',
    interpretacion: 'Con `auto` la pieza es comparable con las detectadas en modo automático, porque el contorno sale del mismo núcleo. Con las otras tres, el contorno depende del umbral elegido, y conviene declararlo al comparar lotes. En los cuatro casos el resultado es determinista.',
    fuente: 'python/modules/mao_ia_analyzer.py::detect_with_mao_ia', nivel: null, ref: null,
    nota: 'Columna del CSV renombrada en ADR-022; antes «Umbralización (modo IA)».',
  },
  {
    clave: 'ia_enriquecido', ambito: 'objeto', categoria: 'deteccion',
    csv: ['Detección', 'Descriptores precalculados (detección asistida)'], nombre: 'Descriptores precalculados (detección asistida)', formula: null, unidad: 'texto',
    rango: 'Sí | No',
    definicion: 'Indica que la pieza llegó al análisis desde la ventana de detección asistida con sus descriptores ya calculados por objeto en el backend —circularidad, solidez, defectos de convexidad, textura y el resto de métricas del contorno—, que luego se convierten a la escala del proyecto.',
    interpretacion: 'Explica por qué esas piezas no pasan por la re-extracción de contorno del análisis individual: su contorno ya es el definitivo. No significa que otro motor haya modificado el contorno; la detección asistida no usa segmentadores externos.',
    fuente: 'js/mao-ia.js', nivel: null, ref: null,
    nota: 'Columna del CSV renombrada en ADR-022; antes «Enriquecido por IA».',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // II. ERROR ÓPTICO POSICIONAL
  // ═══════════════════════════════════════════════════════════════════════
  {
    clave: 'fov_diagonal_deg', ambito: 'objeto', categoria: 'error_optico',
    csv: ['Error e Incertidumbre Óptica', 'FOV Diagonal'],
    nombre: 'Campo visual diagonal', formula: 'FOV = 2·atan(√(w_s² + h_s²) / (2·f))',
    unidad: 'grados', rango: 'típicamente 10°–120°',
    definicion: 'Ángulo de visión diagonal del sistema óptico, derivado de la diagonal del sensor y la distancia focal declaradas en el EXIF.',
    interpretacion: 'Es el predictor de cuánta distorsión cabe esperar: por debajo de ~30° la lente apenas deforma; por encima de ~75° la deformación domina el error de medición.',
    fuente: `${SCALE}::_estimar_error_optico`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'k1_estimado', ambito: 'objeto', categoria: 'error_optico',
    csv: ['Error e Incertidumbre Óptica', 'k1 Estimado'],
    nombre: 'Coeficiente de distorsión radial k₁', formula: 'k₁ = f(FOV) — tabla empírica por tramos',
    unidad: 'adimensional', rango: '−0.0003 (teleobjetivo) a −0.22 (ojo de pez); negativo = barril',
    definicion: 'Primer coeficiente de distorsión radial del modelo de Brown–Conrady, ESTIMADO por tramos a partir del campo visual — no medido sobre un patrón de calibración.',
    interpretacion: 'La estimación sin calibración arrastra una incertidumbre propia del orden de ±30 %. Para trabajo publicable conviene calibrar la lente con un patrón y sustituir este valor.',
    fuente: `${SCALE}::_estimar_error_optico`, nivel: null,
    ref: ['brown1971', 'zhang2000'],
    nota: 'Valor estimado, no calibrado. Es la principal limitación declarada de la Sección II.',
  },
  {
    clave: 'posicion_radial_norm', ambito: 'objeto', categoria: 'error_optico',
    csv: ['Error e Incertidumbre Óptica', 'Posición Radial Normalizada'],
    nombre: 'Posición radial normalizada', formula: 'r_norm = ‖c − c_img‖ / (W/2)',
    unidad: 'adimensional', rango: '0 = centro óptico · 1 = borde horizontal',
    definicion: 'Distancia del centroide de la pieza al centro de la imagen, normalizada por la semianchura del fotograma.',
    interpretacion: 'Es la variable de la que dependen ambos errores ópticos. Centrar la pieza en el encuadre es la intervención más barata y efectiva para reducir el error de medición.',
    fuente: `${SCALE}::_estimar_error_optico`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'posicion_radial_px', ambito: 'objeto', categoria: 'error_optico',
    csv: null, nombre: 'Posición radial (píxeles)', formula: 'r_px = ‖c − c_img‖',
    unidad: 'px', rango: '≥ 0',
    definicion: 'La misma distancia al centro óptico, sin normalizar.',
    interpretacion: 'Útil para reconstruir el cálculo; la magnitud comparable entre imágenes de distinta resolución es la normalizada.',
    fuente: `${SCALE}::_estimar_error_optico`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'angulo_optico_deg', ambito: 'objeto', categoria: 'error_optico',
    csv: ['Error e Incertidumbre Óptica', 'Ángulo Óptico'],
    nombre: 'Ángulo respecto al eje óptico', formula: 'θ = atan2(r_sensor, f)',
    unidad: 'grados', rango: '0° (en eje) a FOV/2',
    definicion: 'Ángulo que forma la línea cámara-pieza con el eje óptico, calculado sobre el plano del sensor.',
    interpretacion: 'Gobierna el error de perspectiva: una pieza plana fotografiada fuera del eje se proyecta escorzada, y el escorzo crece con sec²θ.',
    fuente: `${SCALE}::_estimar_error_optico`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'error_distorsion_percent', ambito: 'objeto', categoria: 'error_optico',
    csv: ['Error e Incertidumbre Óptica', 'Error Distorsión'],
    nombre: 'Error por distorsión radial', formula: 'ε_d = |k₁| · r_norm² · 100',
    unidad: '%', rango: '≥ 0; crece con el cuadrado de la excentricidad en el encuadre',
    definicion: 'Componente del error debida a la curvatura que la lente introduce en las rectas del objeto.',
    interpretacion: 'Nulo en el centro de la imagen por construcción. Es la componente que una calibración formal de la lente reduciría más.',
    fuente: `${SCALE}::_estimar_error_optico`, nivel: null, ref: ['brown1971'], nota: null,
  },
  {
    clave: 'error_perspectiva_percent', ambito: 'objeto', categoria: 'error_optico',
    csv: ['Error e Incertidumbre Óptica', 'Error Perspectiva'],
    nombre: 'Error por perspectiva', formula: 'ε_p = (sec²θ − 1) · 100',
    unidad: '%', rango: '≥ 0',
    definicion: 'Componente del error debida a que la pieza, al no estar en el eje óptico, se proyecta sobre el sensor con un factor de escala distinto al del centro.',
    interpretacion: 'A diferencia de la distorsión, no depende de la lente sino de la geometría del montaje: se corrige recentrando la pieza o alejando la cámara, no calibrando.',
    fuente: `${SCALE}::_estimar_error_optico`, nivel: null, ref: null,
    nota: 'Supone la pieza sobre un plano perpendicular al eje óptico. Una pieza inclinada añade error no contabilizado aquí.',
  },
  {
    clave: 'error_optico_lineal_percent', ambito: 'objeto', categoria: 'error_optico',
    csv: ['Error e Incertidumbre Óptica', 'Error Lineal'],
    nombre: 'Error óptico lineal', formula: 'ε_L = √(ε_d² + ε_p²)',
    unidad: '%', rango: '≥ 0; < 1.5 % es el régimen de trabajo habitual',
    definicion: 'Incertidumbre relativa de toda medida de longitud en mm, compuesta en cuadratura (suma en raíz de cuadrados) a partir de las dos componentes ópticas.',
    interpretacion: 'Es el número que acompaña a cada longitud publicada. Componer en cuadratura supone que distorsión y perspectiva son independientes, lo que es razonable pero no exacto: ambas crecen con la excentricidad.',
    fuente: `${SCALE}::_estimar_error_optico`, nivel: null, ref: ['gum2008'], nota: null,
  },
  {
    clave: 'error_optico_area_percent', ambito: 'objeto', categoria: 'error_optico',
    csv: ['Error e Incertidumbre Óptica', 'Error Área'],
    nombre: 'Error óptico de área', formula: 'ε_A = √((2·ε_d)² + (2·ε_p)²) = 2·ε_L',
    unidad: '%', rango: '≥ 0; exactamente el doble del error lineal',
    definicion: 'Incertidumbre relativa de toda medida de superficie. El factor 2 es la propagación de un error relativo a través de una magnitud cuadrática.',
    interpretacion: 'Las áreas son sistemáticamente el doble de inciertas que las longitudes. Conviene recordarlo al comparar piezas por área en lotes con encuadres dispares.',
    fuente: `${SCALE}::_estimar_error_optico`, nivel: null, ref: ['gum2008'], nota: null,
  },
  {
    clave: 'confianza_optica', ambito: 'objeto', categoria: 'error_optico',
    csv: ['Error e Incertidumbre Óptica', 'Confianza Óptica'],
    nombre: 'Categoría de confianza óptica', formula: null, unidad: 'texto',
    rango: 'Muy Alta (<0.5 %) · Alta (<1.5 %) · Moderada (<3 %) · Baja (<6 %) · Muy Baja (>6 %)',
    definicion: 'Discretización del error lineal en cinco tramos.',
    interpretacion: 'Sirve para descartar de un vistazo las capturas cuyo montaje óptico no sostiene el uso previsto. No mide la calidad de la segmentación — eso es `detection_confidence`.',
    fuente: `${SCALE}::_estimar_error_optico`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'nota_error_optico', ambito: 'objeto', categoria: 'error_optico',
    csv: ['Error e Incertidumbre Óptica', 'Nota'],
    nombre: 'Advertencia metodológica', formula: null, unidad: 'texto',
    rango: 'texto libre',
    definicion: 'Declaración explícita de que k₁ se estimó sin calibración formal de lente, con el FOV para el que se estimó.',
    interpretacion: 'Debe reproducirse en cualquier publicación que use estas medidas: es la salvedad que hace honesto el número.',
    fuente: `${SCALE}::_estimar_error_optico`, nivel: null, ref: null, nota: null,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // II-b. INCERTIDUMBRE PROPAGADA POR MÉTRICA
  // Familias de claves derivadas, no métricas independientes.
  // ═══════════════════════════════════════════════════════════════════════
  {
    clave: '{metrica}_incertidumbre_abs', ambito: 'objeto', categoria: 'incertidumbre',
    csv: null, nombre: 'Incertidumbre absoluta de una métrica',
    formula: 'u(x) = |x| · ε_L/100  (longitudes) · |x| · ε_A/100  (áreas)',
    unidad: 'la de la métrica base (mm o mm²)', rango: '≥ 0',
    definicion: 'Familia de claves: por cada métrica dimensional se emite su incertidumbre absoluta, obtenida aplicando el error óptico relativo al valor medido. Se genera para 13 magnitudes lineales (perimeter, width, height, eje_mayor, eje_menor, radio_maximo, radio_minimo, radio_medio, feret_max, feret_min, perimeter_fragmentado, bounding_width, bounding_height) y 2 de área (area, area_fragmentada).',
    interpretacion: 'Las métricas ADIMENSIONALES no reciben incertidumbre y eso es correcto, no una omisión: el factor de escala se cancela en un cociente, de modo que circularidad, solidez o elongación son inmunes al error de escala aunque no al de contorno.',
    fuente: `${SCALE}::aplicar_incertidumbre_optica`, nivel: null, ref: ['gum2008'],
    nota: 'Patrón de clave, no clave literal. Ejemplo real: `area_incertidumbre_abs`.',
  },
  {
    clave: '{metrica}_rango_min', ambito: 'objeto', categoria: 'incertidumbre',
    csv: null, nombre: 'Extremo inferior del intervalo', formula: 'x − u(x)',
    unidad: 'la de la métrica base', rango: '≤ valor medido',
    definicion: 'Valor mínimo probable de la métrica una vez aplicada la incertidumbre óptica.',
    interpretacion: 'El intervalo [min, max] cubre solo la incertidumbre ÓPTICA. No incluye el error de segmentación del contorno ni el de la referencia de escala, así que es un piso, no una barra de error completa.',
    fuente: `${SCALE}::aplicar_incertidumbre_optica`, nivel: null, ref: ['gum2008'],
    nota: 'Patrón de clave. Ejemplo real: `perimeter_rango_min`.',
  },
  {
    clave: '{metrica}_rango_max', ambito: 'objeto', categoria: 'incertidumbre',
    csv: null, nombre: 'Extremo superior del intervalo', formula: 'x + u(x)',
    unidad: 'la de la métrica base', rango: '≥ valor medido',
    definicion: 'Valor máximo probable de la métrica una vez aplicada la incertidumbre óptica.',
    interpretacion: 'Ver la advertencia de `{metrica}_rango_min`: el intervalo es incompleto por construcción.',
    fuente: `${SCALE}::aplicar_incertidumbre_optica`, nivel: null, ref: ['gum2008'],
    nota: 'Patrón de clave. Ejemplo real: `area_rango_max`.',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // IV. DIMENSIONES MÉTRICAS DEL OBJETO
  // ═══════════════════════════════════════════════════════════════════════
  {
    clave: 'area', ambito: 'objeto', categoria: 'dimensiones',
    csv: ['Dimensiones Básicas', 'Área'],
    nombre: 'Área', formula: 'A = área encerrada por el contorno real (Green/shoelace)',
    unidad: 'mm²', rango: '> 0',
    definicion: 'Superficie proyectada de la pieza sobre el plano de la imagen, escalada a milímetros por la referencia métrica.',
    interpretacion: 'Es área PROYECTADA, no superficie real del objeto: una pieza curva o inclinada proyecta menos de lo que mide. Y es BRUTA: incluye la superficie de los huecos. Para la materia efectiva, leer `area_neta`.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null,
    nota: 'Es el área BRUTA: no descuenta P/H. La que sí lo hace es `area_neta`, publicada junto a ella. Incertidumbre asociada: `area_incertidumbre_abs` (doble del error lineal).',
  },
  {
    clave: 'area_neta', ambito: 'objeto', categoria: 'dimensiones',
    csv: ['Dimensiones Básicas', 'Área Neta (P/H descontadas)'],
    nombre: 'Área neta', formula: 'A_neta = A − Σ A_(P/H confirmadas)',
    unidad: 'mm²', rango: '(0, A] — igual a A cuando no hay P/H confirmadas',
    definicion: 'Superficie de la pieza una vez descontadas las perforaciones y horadaciones **confirmadas por el investigador**. Es la magnitud que responde «cuánta materia hay», frente a `area`, que responde «cuánto ocupa la silueta».',
    interpretacion: 'El invariante de ADR-009 vive aquí: un candidato P/H detectado por el motor y **no confirmado** no descuenta nada. Que neta y bruta coincidan puede significar dos cosas distintas —la pieza no tiene huecos, o los tiene sin confirmar— y por eso la columna se acompaña siempre de «Área Neta - Nota», que dice cuál de las dos es.',
    fuente: 'js/analysis-core.js::sincronizarMetricasPH', nivel: null, ref: null,
    nota: 'Se calculaba y persistía desde hace tiempo, pero NINGUNA salida de lectura la publicaba (ADR-018): el CSV daba el área bruta y los totales de P/H en secciones distintas, dejando la resta al lector. El derivado canónico es `MetricPresenter.areaNetaDerivados()`.',
  },
  {
    clave: 'perimetro_neto', ambito: 'objeto', categoria: 'dimensiones',
    csv: ['Dimensiones Básicas', 'Perímetro Neto (incluye bordes de P/H)'],
    nombre: 'Perímetro neto', formula: 'P_neto = P_externo + Σ P_(P/H confirmadas)',
    unidad: 'mm', rango: '≥ perimeter',
    definicion: 'Longitud total de borde de la pieza, sumando al contorno externo los bordes internos de cada perforación u horadación confirmada.',
    interpretacion: 'A diferencia del área, el perímetro **crece** al descontar huecos: un hueco quita superficie pero añade borde. Es la magnitud pertinente cuando lo que interesa es la extensión de filo o de superficie trabajada, no la masa.',
    fuente: 'js/analysis-core.js::sincronizarMetricasPH', nivel: null, ref: null,
    nota: 'Sólo se emite cuando el motor lo calculó; sin P/H confirmadas coincide con `perimeter`.',
  },
  {
    clave: 'porosidad', ambito: 'objeto', categoria: 'dimensiones',
    csv: ['Dimensiones Básicas', 'Porosidad (P/H sobre área bruta)'],
    nombre: 'Porosidad', formula: '(Σ A_(P/H confirmadas) / A) · 100',
    unidad: '%', rango: '[0, 100) — 0 = pieza maciza',
    definicion: 'Proporción del área bruta ocupada por perforaciones y horadaciones confirmadas.',
    interpretacion: 'Normaliza el descuento por el tamaño de la pieza, lo que la hace comparable entre piezas de dimensiones distintas: dos horadaciones de 5 mm² no significan lo mismo en una lámina que en un núcleo. Como todo lo derivado de P/H, sólo cuenta lo confirmado.',
    fuente: 'js/analysis-core.js::sincronizarMetricasPH', nivel: null, ref: null, nota: null,
  },
  {
    clave: 'perimeter', ambito: 'objeto', categoria: 'dimensiones',
    csv: ['Dimensiones Básicas', 'Perímetro'],
    nombre: 'Perímetro', formula: 'P = Σ‖p_{i+1} − p_i‖ sobre el contorno cerrado',
    unidad: 'mm', rango: '> 0',
    definicion: 'Longitud del contorno real de la pieza, sumando las distancias entre puntos consecutivos.',
    interpretacion: 'Sensible a la resolución: un contorno muestreado más fino mide más perímetro sobre el mismo objeto (efecto de línea de costa). Comparar perímetros exige capturas de resolución equivalente.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: ['russ2011'],
    nota: 'La dependencia de la resolución es la razón de que los índices de forma se calculen sobre el hull cuando se busca estabilidad.',
  },
  {
    clave: 'width', ambito: 'objeto', categoria: 'dimensiones',
    csv: ['Dimensiones Básicas', 'Ancho (BB Ajustado)'],
    nombre: 'Ancho (caja ajustada)', formula: 'lado menor del rectángulo de área mínima',
    unidad: 'mm', rango: '> 0',
    definicion: 'Anchura de la pieza medida sobre el rectángulo de área mínima, es decir, el rectángulo orientado según la propia pieza y no según los ejes de la imagen.',
    interpretacion: 'Es la anchura que un investigador mediría con calibre: invariante a cómo se apoyó la pieza al fotografiarla. Preferir siempre esta sobre la caja original.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'height', ambito: 'objeto', categoria: 'dimensiones',
    csv: ['Dimensiones Básicas', 'Alto (BB Ajustado)'],
    nombre: 'Alto (caja ajustada)', formula: 'lado mayor del rectángulo de área mínima',
    unidad: 'mm', rango: '> 0',
    definicion: 'Longitud de la pieza medida sobre el rectángulo de área mínima.',
    interpretacion: 'Invariante a la rotación de la pieza en la fotografía, a diferencia del alto de la caja original.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'bounding_width', ambito: 'objeto', categoria: 'dimensiones',
    csv: ['Dimensiones Básicas', 'Ancho (BB Original)'],
    nombre: 'Ancho (caja original)', formula: 'x_max − x_min en coordenadas de imagen',
    unidad: 'mm', rango: '> 0',
    definicion: 'Anchura de la caja envolvente ALINEADA A LOS EJES de la imagen.',
    interpretacion: 'Depende de cómo se orientó la pieza al fotografiarla: la misma pieza girada 45° da otro valor. No es una dimensión de la pieza sino de la fotografía; usarla para comparar es un error frecuente.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null,
    nota: 'ADR-016 #1: en la ruta de la detección asistida este campo puede llegar en píxeles; el conversor `MetricPresenter.conversorBBaMm` lo normaliza en el reporte.',
  },
  {
    clave: 'bounding_height', ambito: 'objeto', categoria: 'dimensiones',
    csv: ['Dimensiones Básicas', 'Alto (BB Original)'],
    nombre: 'Alto (caja original)', formula: 'y_max − y_min en coordenadas de imagen',
    unidad: 'mm', rango: '> 0',
    definicion: 'Altura de la caja envolvente alineada a los ejes de la imagen.',
    interpretacion: 'Misma salvedad que el ancho original: no es invariante a la rotación de la pieza.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'contour_points', ambito: 'objeto', categoria: 'dimensiones',
    csv: ['Dimensiones Básicas', 'Puntos del Contorno'],
    nombre: 'Puntos del contorno', formula: null, unidad: 'conteo', rango: 'entero ≥ 3',
    definicion: 'Número de vértices con que se discretizó el contorno.',
    interpretacion: 'Metadato de calidad, no morfología. Un contorno con pocos puntos subestima el perímetro y la rugosidad; con muchos, los sobreestima. Comparar rugosidades entre piezas con recuentos muy dispares no es válido.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'feret_max', ambito: 'objeto', categoria: 'dimensiones',
    csv: ['Métricas Avanzadas', 'Diámetro Feret Máximo'],
    nombre: 'Diámetro de Feret máximo', formula: 'max‖p_i − p_j‖ sobre pares del contorno',
    unidad: 'mm', rango: '> 0',
    definicion: 'Máxima distancia entre dos puntos cualesquiera de la pieza: la longitud del calibre abierto al máximo sobre el objeto.',
    interpretacion: 'La medida de longitud más robusta y comparable que produce MAO: no depende de ejes, cajas ni orientación. Es la dimensión de referencia para comparar piezas entre sí.',
    fuente: `${METRICS}::_feret`, nivel: null, ref: ['feret1930'],
    nota: 'El CSV lo publica bajo «Métricas Avanzadas» aunque la Tabla lo rinda en IV. Alias: `max_feret_diameter`.',
  },
  {
    clave: 'feret_min', ambito: 'objeto', categoria: 'dimensiones',
    csv: ['Métricas Avanzadas', 'Diámetro Feret Mínimo'],
    nombre: 'Diámetro de Feret mínimo', formula: 'mínima anchura entre rectas de apoyo paralelas',
    unidad: 'mm', rango: '> 0, ≤ feret_max',
    definicion: 'Menor separación entre dos rectas paralelas que dejan la pieza entre ellas: la anchura de la ranura más estrecha por la que pasaría.',
    interpretacion: 'Junto al máximo describe la esbeltez de la pieza sin recurrir a ejes principales, que son inestables en formas casi circulares.',
    fuente: `${METRICS}::_feret`, nivel: null, ref: ['feret1930'],
    nota: 'Alias: `min_feret_diameter`.',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // V. PROPORCIONES Y FORMA GLOBAL
  // ═══════════════════════════════════════════════════════════════════════
  {
    clave: 'circularity', ambito: 'objeto', categoria: 'indices_forma',
    csv: ['Índices de Forma', 'Circularidad'],
    nombre: 'Circularidad', formula: 'C = 4π·A / P²', unidad: 'adimensional',
    rango: '(0, 1] — 1 = círculo perfecto',
    definicion: 'Cociente entre el área de la pieza y la del círculo que tendría su mismo perímetro. Índice isoperimétrico clásico.',
    interpretacion: 'Baja tanto por lobulación real como por rugosidad del borde, y no distingue una causa de la otra: una pieza redonda de borde dentado puntúa como una lobulada de borde liso. Leer siempre junto a `rugosidad_contorno`.',
    fuente: `${METRICS}::compute_metrics`, nivel: 'H', ref: ['cox1927', 'wadell1935'],
    nota: 'Invariante a traslación, rotación y escala — núcleo H del repertorio (ADR-006).',
  },
  {
    clave: 'solidity', ambito: 'objeto', categoria: 'indices_forma',
    csv: ['Índices de Forma', 'Solidez'],
    nombre: 'Solidez', formula: 'S = A_real / A_hull', unidad: 'adimensional',
    rango: '(0, 1] — 1 = sin concavidades',
    definicion: 'Fracción de la envolvente convexa que la pieza ocupa realmente. Mide cuánta materia falta respecto a su propio casco.',
    interpretacion: 'El indicador más directo de concavidades: melladuras, escotaduras, fracturas y lascados. En material lítico, caídas de solidez concentradas en un borde suelen señalar retoque o daño de uso.',
    fuente: `${METRICS}::compute_metrics`, nivel: 'H', ref: null,
    nota: 'Es la base de `solidity_class`, cuyos rótulos son descriptivos y NO diagnostican fractura (neutralizados en ADR-018; antes decían «fragmentado» y contradecían a XII).',
  },
  {
    clave: 'solidity_class', ambito: 'objeto', categoria: 'indices_forma',
    csv: ['Índices de Forma', 'Clasificación de Solidez'],
    nombre: 'Clasificación de solidez', formula: null, unidad: 'texto',
    rango: '≥0.95 Sin concavidades · ≥0.85 Concavidades leves · ≥0.70 Concavidades moderadas · ≥0.50 Concavidades marcadas · <0.50 Contorno muy entrante',
    definicion: 'Discretización de la solidez en cinco tramos.',
    interpretacion: 'Los rótulos describen la GEOMETRÍA medida —cuánto de su envolvente convexa ocupa la pieza—, no su estado tafonómico. La fragmentación real se consigna en «XII. Estado de Conservación», que la mide por área perdida. La lectura arqueológica es del investigador.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'convexity', ambito: 'objeto', categoria: 'indices_forma',
    csv: ['Convex Hull', 'Convexidad'],
    nombre: 'Convexidad de perímetro', formula: 'Cx = P_hull / P_real', unidad: 'adimensional',
    rango: '(0, 1] — 1 = contorno perfectamente convexo',
    definicion: 'Cociente entre el perímetro de la envolvente convexa y el perímetro real.',
    interpretacion: 'Complementa a la solidez: la solidez detecta pérdida de ÁREA, la convexidad detecta exceso de BORDE. Una pieza con un borde muy sinuoso pero sin entrantes profundos baja la convexidad sin bajar la solidez.',
    fuente: `${METRICS}::compute_metrics`, nivel: 'H', ref: null,
    nota: 'En `morphometric_registry.py` su id canónico es `convexity_perim`; en la salida plana de la API la clave es `convexity`.',
  },
  {
    clave: 'convexity_class', ambito: 'objeto', categoria: 'indices_forma',
    csv: ['Convex Hull', 'Clasificación Convexidad'],
    nombre: 'Clasificación de convexidad', formula: null, unidad: 'texto',
    rango: 'escalera descriptiva',
    definicion: 'Discretización de la convexidad de perímetro.',
    interpretacion: 'Rótulo neutral: describe la medición, no diagnostica daño.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null,
    nota: 'Alias histórico en algunas rutas: `convexidad_class`.',
  },
  {
    clave: 'compactness', ambito: 'objeto', categoria: 'indices_forma',
    csv: ['Índices de Forma', 'Compacidad'],
    nombre: 'Compacidad', formula: 'K = A_hull / (π·r²), con r = P_hull / 2π',
    unidad: 'adimensional', rango: '(0, 1] — 1 = círculo',
    definicion: 'Área del casco convexo frente a la del círculo de igual perímetro de casco. Formalmente la circularidad, pero evaluada sobre el HULL en vez del contorno real.',
    interpretacion: 'Al ir sobre el hull es ciega a la rugosidad del borde y estable frente a la resolución. Ese es su valor —y su límite: no ve puntas ni dentado, solo la silueta envolvente.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: ['cox1927'],
    nota: 'Se calcula sobre el hull. Comparar con `circularity`, que va sobre el contorno real: la diferencia entre ambas ES la rugosidad del borde.',
  },
  {
    clave: 'rectangularity', ambito: 'objeto', categoria: 'indices_forma',
    csv: ['Índices de Forma', 'Rectangularidad'],
    nombre: 'Rectangularidad', formula: 'R = A_real / A_bbox', unidad: 'adimensional',
    rango: '(0, 1] — 1 = rectángulo perfecto',
    definicion: 'Fracción de la caja envolvente que la pieza ocupa.',
    interpretacion: 'Un círculo puntúa ≈0.785 (π/4) y un triángulo ≈0.5, así que el índice ORDENA formas más que identificarlas. La variante `rectangularity_min_rect`, sobre el rectángulo de área mínima, es invariante a la rotación y preferible para comparar.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null,
    nota: 'Calculada sobre la caja alineada a los ejes: NO es invariante a la rotación de la pieza en la foto.',
  },
  {
    clave: 'shape_factor', ambito: 'objeto', categoria: 'indices_forma',
    csv: ['Índices de Forma', 'Factor de Forma'],
    nombre: 'Factor de forma', formula: 'F = P_hull² / (4π·A_hull)', unidad: 'adimensional',
    rango: '[1, ∞) — 1 = círculo; crece con la irregularidad',
    definicion: 'Inverso de la circularidad, evaluado sobre el casco convexo.',
    interpretacion: 'Mismo contenido que la compacidad pero en escala inversa y sin techo, lo que separa mejor las formas muy irregulares. La variante `shape_factor_fragmentado` usa el contorno real y sí acusa la rugosidad.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: ['cox1927'], nota: null,
  },
  {
    clave: 'aspect_ratio_tight', ambito: 'objeto', categoria: 'indices_forma',
    csv: ['Índices de Forma', 'Relación de Aspecto'],
    nombre: 'Relación de aspecto', formula: 'AR = eje_mayor / eje_menor', unidad: 'adimensional',
    rango: '[1, ∞) — 1 = equidimensional',
    definicion: 'Cociente entre los ejes del rectángulo de área mínima.',
    interpretacion: 'La proporción básica de la pieza, invariante a la rotación por usar el rectángulo ajustado. En formas casi circulares el eje mayor se vuelve inestable y el cociente ruidoso: por debajo de ~1.05 conviene leer los diámetros de Feret.',
    fuente: `${METRICS}::compute_metrics`, nivel: 'H', ref: null,
    nota: 'Id canónico en el registry: `aspect_ratio`. Existe además `aspect_ratio_original`, sobre la caja alineada a ejes, que no es invariante.',
  },
  {
    clave: 'elongation', ambito: 'objeto', categoria: 'indices_forma',
    csv: ['Índices de Forma', 'Elongación'],
    nombre: 'Elongación', formula: 'E = 1 − eje_menor / eje_mayor', unidad: 'adimensional',
    rango: '[0, 1) — 0 = equidimensional, → 1 = muy alargada',
    definicion: 'Complemento del cociente de ejes, acotado a [0,1).',
    interpretacion: 'Contiene la misma información que la relación de aspecto en una escala acotada, más cómoda para promediar y para análisis multivariante.',
    fuente: `${METRICS}::compute_metrics`, nivel: 'H', ref: null, nota: null,
  },
  {
    clave: 'excentricidad', ambito: 'objeto', categoria: 'indices_forma',
    csv: ['Índices de Forma', 'Excentricidad'],
    nombre: 'Excentricidad', formula: 'e = √(1 − λ_menor / λ_mayor)', unidad: 'adimensional',
    rango: '[0, 1) — 0 = circular, → 1 = muy alargada',
    definicion: 'Excentricidad de la elipse de igual momento de inercia que la pieza, calculada sobre los autovalores de la matriz de covarianza del contorno.',
    interpretacion: 'A diferencia de la relación de aspecto, usa TODA la distribución de masa del contorno y no solo sus extremos, así que es menos sensible a una punta aislada. Es la vía preferible para la elongación en análisis estadístico.',
    fuente: `${METRICS}::compute_metrics`, nivel: 'H', ref: ['bookstein1991'], nota: null,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // VI. ANÁLISIS RADIAL Y REGULARIDAD DEL CONTORNO
  // ═══════════════════════════════════════════════════════════════════════
  {
    clave: 'radio_maximo', ambito: 'objeto', categoria: 'radial',
    csv: ['Análisis Radial', 'Radio Máximo'],
    nombre: 'Radio máximo', formula: 'R_max = max‖v_i − c‖ sobre vértices del hull',
    unidad: 'mm', rango: '> 0',
    definicion: 'Distancia del centroide al vértice más alejado de la envolvente convexa.',
    interpretacion: 'Marca la punta o el saliente dominante de la pieza. Se mide sobre el hull, de modo que el dentado del borde no lo altera.',
    fuente: `${METRICS}::_radios_extremos`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'radio_minimo', ambito: 'objeto', categoria: 'radial',
    csv: ['Análisis Radial', 'Radio Mínimo'],
    nombre: 'Radio mínimo', formula: 'R_min = mín. distancia perpendicular del centroide a las aristas del hull',
    unidad: 'mm', rango: '> 0, ≤ R_max',
    definicion: 'Distancia del centroide a la arista más próxima del casco convexo — no al vértice más próximo.',
    interpretacion: 'Es el radio del mayor círculo inscrito centrado en el centroide: la «cintura» de la pieza. La distinción arista/vértice importa, y es la razón de que no coincida con el mínimo de la serie radial del contorno.',
    fuente: `${METRICS}::_radios_extremos`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'radio_medio', ambito: 'objeto', categoria: 'radial',
    csv: ['Análisis Radial', 'Radio Medio'],
    nombre: 'Radio medio', formula: 'R̄ = (1/n)·Σ‖p_i − c‖ sobre el contorno completo',
    unidad: 'mm', rango: '> 0',
    definicion: 'Media de las distancias del centroide a todos los puntos del contorno REAL (no del hull).',
    interpretacion: 'Tamaño radial característico. Sirve de escala normalizadora para la simetría bilateral y el índice de estrellamiento, lo que hace a ambos adimensionales.',
    fuente: `${METRICS}::_radios_extremos`, nivel: null, ref: null,
    nota: 'Ojo: máximo y mínimo van sobre el hull, media y dispersión sobre el contorno completo.',
  },
  {
    clave: 'ratio_radios', ambito: 'objeto', categoria: 'radial',
    csv: ['Análisis Radial', 'Ratio de Radios'],
    nombre: 'Ratio de radios', formula: 'R_min / R_max', unidad: 'adimensional',
    rango: '(0, 1] — 1 = círculo',
    definicion: 'Cociente entre el círculo inscrito y el circunscrito respecto al centroide.',
    interpretacion: 'Medida clásica de redondez de la silueta envolvente. Cae con la elongación y con la presencia de puntas, sin distinguir una de otra.',
    fuente: `${METRICS}::_radios_extremos`, nivel: null, ref: ['wadell1932'], nota: null,
  },
  {
    clave: 'regularidad_radial', ambito: 'objeto', categoria: 'radial',
    csv: ['Análisis Radial', 'Regularidad Radial'],
    nombre: 'Regularidad radial', formula: '(R_min / R_max) · 100', unidad: '%',
    rango: '(0, 100] — 100 = círculo',
    definicion: 'El ratio de radios expresado en porcentaje.',
    interpretacion: 'No añade información sobre `ratio_radios`; es el mismo número en otra escala, para lectura humana.',
    fuente: `${METRICS}::_radios_extremos`, nivel: null, ref: null,
    nota: 'ADR-016 #3: ya viene en porcentaje desde el backend. Multiplicarlo por 100 en el renderer fue un defecto corregido; no volver a escalarlo.',
  },
  {
    clave: 'desviacion_radial', ambito: 'objeto', categoria: 'radial',
    csv: ['Análisis Radial', 'Desviación Radial'],
    nombre: 'Desviación radial', formula: 'σ de ‖p_i − c‖ sobre el contorno completo',
    unidad: 'mm', rango: '≥ 0',
    definicion: 'Desviación estándar de la serie de radios del contorno.',
    interpretacion: 'Dispersión ABSOLUTA de la silueta: crece con el tamaño de la pieza, así que no es comparable entre piezas de tamaños distintos. Para comparar, usar el coeficiente de variación.',
    fuente: `${METRICS}::_radios_extremos`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'coeficiente_variacion_radial', ambito: 'objeto', categoria: 'radial',
    csv: ['Análisis Radial', 'Coeficiente Variación'],
    nombre: 'Coeficiente de variación radial', formula: 'CV = (σ_R / R̄) · 100', unidad: '%',
    rango: '≥ 0; 0 = círculo perfecto',
    definicion: 'Desviación radial normalizada por el radio medio.',
    interpretacion: 'La medida de irregularidad de silueta comparable entre piezas de cualquier tamaño. Es el análogo radial de la rugosidad del contorno, que hace lo mismo con las longitudes de segmento.',
    fuente: `${METRICS}::_radios_extremos`, nivel: null, ref: null, nota: null,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // VII. RUGOSIDAD Y COMPLEJIDAD DEL BORDE
  // ═══════════════════════════════════════════════════════════════════════
  {
    clave: 'rugosidad_contorno', ambito: 'objeto', categoria: 'contorno',
    csv: ['Propiedades del Contorno', 'Rugosidad'],
    nombre: 'Rugosidad del contorno', formula: 'CV de las longitudes de segmento = σ_s / μ_s',
    unidad: 'adimensional', rango: '≥ 0; 0 = segmentos perfectamente uniformes',
    definicion: 'Coeficiente de variación de las longitudes de los segmentos que componen el contorno.',
    interpretacion: 'Mide la irregularidad del MUESTREO del borde, que en la práctica refleja el dentado real. Depende de cómo se discretizó el contorno: solo comparable entre capturas de resolución y método de extracción equivalentes.',
    fuente: `${METRICS}::_rugosidad`, nivel: '2D', ref: null,
    nota: 'La medición es del contorno extraído, no de la superficie física de la pieza.',
  },
  {
    clave: 'rugosidad_clasificacion', ambito: 'objeto', categoria: 'contorno',
    csv: ['Propiedades del Contorno', 'Clasificación Rugosidad'],
    nombre: 'Clasificación de rugosidad', formula: null, unidad: 'texto',
    rango: '<0.05 Muy suave · <0.15 Suave · <0.30 Moderado · <0.50 Rugoso · ≥0.50 Muy rugoso',
    definicion: 'Discretización de la rugosidad en cinco tramos, con rótulos deliberadamente neutrales.',
    interpretacion: 'Los rótulos describen la MEDICIÓN, no diagnostican fractura ni erosión. Fue una corrección explícita (ADR-016 #6): los rótulos anteriores diagnosticaban daño y contradecían la sección de conservación de la misma pieza.',
    fuente: 'js/modules/metric-presenter.js::clasificarRugosidad', nivel: null, ref: null,
    nota: 'Fuente única de estos rótulos: `metric-presenter.js`, con copia de paridad textual en Python.',
  },
  {
    clave: 'rugosidad_desviacion', ambito: 'objeto', categoria: 'contorno',
    csv: ['Propiedades del Contorno', 'Desviación Segmentos'],
    nombre: 'Desviación de longitudes de segmento', formula: 'σ_s', unidad: 'mm', rango: '≥ 0',
    definicion: 'Desviación estándar absoluta de las longitudes de segmento del contorno.',
    interpretacion: 'Numerador de la rugosidad. Absoluta y por tanto dependiente de la escala; la magnitud comparable es la rugosidad.',
    fuente: `${METRICS}::_rugosidad`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'rugosidad_longitud_segmento_media', ambito: 'objeto', categoria: 'contorno',
    csv: ['Propiedades del Contorno', 'Longitud Media Segmento'],
    nombre: 'Longitud media de segmento', formula: 'μ_s = P / n_segmentos', unidad: 'mm', rango: '> 0',
    definicion: 'Longitud media de los segmentos del contorno: el paso de muestreo efectivo.',
    interpretacion: 'Indicador directo de la resolución del contorno. Es el número que hay que comparar antes de comparar rugosidades entre dos piezas.',
    fuente: `${METRICS}::_rugosidad`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'contour_complexity_index', ambito: 'objeto', categoria: 'contorno',
    csv: ['Propiedades del Contorno', 'Índice de Complejidad'],
    nombre: 'Índice de complejidad del contorno', formula: 'CCI = P_real / (2π·√(A/π))',
    unidad: 'adimensional', rango: '[1, ∞) — 1 = círculo',
    definicion: 'Perímetro real frente al del círculo de igual área: cuánto borde «de más» tiene la pieza respecto al mínimo posible.',
    interpretacion: 'Equivale a la raíz del inverso de la circularidad, en escala lineal y sin techo. Sube tanto por lobulación como por dentado; leerlo junto a la lobularidad, que solo ve la primera, permite separar ambas causas.',
    fuente: `${METRICS}::compute_metrics`, nivel: 'H', ref: ['cox1927'], nota: null,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // VII-b. CURVATURA
  // ═══════════════════════════════════════════════════════════════════════
  {
    clave: 'curvatura_media', ambito: 'objeto', categoria: 'curvatura',
    csv: ['Curvatura', 'Curvatura Media'],
    nombre: 'Curvatura local media (Menger)',
    formula: 'κ_i = 4·área(p_{i−1}, p_i, p_{i+1}) / (d₀₁·d₁₂·d₂₀);  κ̄ = media(κ_i)',
    unidad: 'adimensional', rango: '≥ 0',
    definicion: 'Media de la curvatura de Menger a lo largo del contorno: para cada terna de puntos consecutivos, el inverso del radio del círculo que los atraviesa.',
    interpretacion: 'Cuantifica cuán cerrado gira el borde en promedio. Depende del paso de muestreo —un contorno más fino mide curvaturas mayores—, de modo que solo es comparable a resolución equivalente.',
    fuente: `${METRICS}::_curvatura_local`, nivel: '2D', ref: ['menger1930'], nota: null,
  },
  {
    clave: 'curvatura_maxima', ambito: 'objeto', categoria: 'curvatura',
    csv: ['Curvatura', 'Curvatura Máxima'],
    nombre: 'Curvatura local máxima', formula: 'max(κ_i)', unidad: 'adimensional', rango: '≥ 0',
    definicion: 'Mayor curvatura registrada en el contorno.',
    interpretacion: 'Localiza el punto más agudo de la pieza: el ápice de una punta o el vértice de una fractura fresca. Muy sensible a un único punto atípico del contorno.',
    fuente: `${METRICS}::_curvatura_local`, nivel: null, ref: ['menger1930'], nota: null,
  },
  {
    clave: 'curvatura_desviacion', ambito: 'objeto', categoria: 'curvatura',
    csv: ['Curvatura', 'Desviación de Curvatura'],
    nombre: 'Desviación de curvatura', formula: 'σ(κ_i)', unidad: 'adimensional', rango: '≥ 0',
    definicion: 'Desviación estándar de la curvatura a lo largo del contorno.',
    interpretacion: 'Mide si el borde gira de forma uniforme (elipse) o alterna tramos rectos con quiebres bruscos (pieza facetada). Es la entrada de `curvatura_clasificacion`.',
    fuente: `${METRICS}::_curvatura_local`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'curvatura_clasificacion', ambito: 'objeto', categoria: 'curvatura',
    csv: ['Curvatura', 'Clasificación Suavidad'],
    nombre: 'Clasificación de suavidad', formula: null, unidad: 'texto',
    rango: '<0.005 Muy suave · <0.02 Suave · <0.05 Moderado · <0.10 Irregular · ≥0.10 Muy variable',
    definicion: 'Discretización de la desviación de curvatura en cinco tramos.',
    interpretacion: 'Rótulo neutral: no diagnostica quiebre ni daño. Se calcula sobre la DESVIACIÓN, no sobre la curvatura media.',
    fuente: 'js/modules/metric-presenter.js::clasificarCurvatura', nivel: null, ref: null, nota: null,
  },
  {
    clave: 'curvatura_puntos_inflexion', ambito: 'objeto', categoria: 'curvatura',
    csv: ['Curvatura', 'Puntos de Inflexión'],
    nombre: 'Puntos de inflexión', formula: null, unidad: 'conteo', rango: 'entero ≥ 0',
    definicion: 'Número de puntos donde el contorno cambia el sentido de su curvatura, pasando de convexo a cóncavo o al revés.',
    interpretacion: 'Cuenta los lóbulos y entrantes de la silueta. Una forma convexa pura tiene cero; cada escotadura añade dos.',
    fuente: `${METRICS}::_curvatura_local`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'curvatura_puntos_esquina', ambito: 'objeto', categoria: 'curvatura',
    csv: ['Curvatura', 'Puntos de Esquina'],
    nombre: 'Puntos de esquina', formula: null, unidad: 'conteo', rango: 'entero ≥ 0',
    definicion: 'Número de puntos cuya curvatura local supera el umbral de esquina, es decir, donde el borde quiebra en vez de girar.',
    interpretacion: 'Aproxima el recuento de vértices de la pieza sin idealizarla a un polígono. Útil para separar formas facetadas de formas curvilíneas.',
    fuente: `${METRICS}::_curvatura_local`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'energia_curvatura', ambito: 'objeto', categoria: 'curvatura',
    csv: ['Curvatura', 'Energía de Curvatura'],
    nombre: 'Energía de curvatura', formula: 'E_κ = (1/n)·Σ κ_i²', unidad: 'adimensional', rango: '≥ 0',
    definicion: 'Media de los cuadrados de la curvatura local: análogo discreto de la energía de flexión de una curva elástica.',
    interpretacion: 'Al elevar al cuadrado pondera desproporcionadamente los quiebres agudos, así que discrimina mejor que la curvatura media entre un borde suavemente ondulado y uno con pocos vértices marcados.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'energia_clasificacion', ambito: 'objeto', categoria: 'curvatura',
    csv: ['Curvatura', 'Clasificación Energía'],
    nombre: 'Clasificación de sinuosidad', formula: null, unidad: 'texto',
    rango: '>0.1 Muy sinuoso · >0.05 Moderadamente sinuoso · >0.01 Ligeramente sinuoso · ≤0.01 Muy suave',
    definicion: 'Discretización de la energía de curvatura en cuatro tramos.',
    interpretacion: 'Rótulo descriptivo del trazado del borde.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null, nota: null,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // VIII. ENVOLVENTE CONVEXA
  // ═══════════════════════════════════════════════════════════════════════
  {
    clave: 'convex_hull_area', ambito: 'objeto', categoria: 'convex_hull',
    csv: null, nombre: 'Área de la envolvente convexa', formula: 'A_hull', unidad: 'mm²', rango: '≥ area',
    definicion: 'Área del menor polígono convexo que contiene la pieza: la superficie que ocuparía si se tensara una goma a su alrededor.',
    interpretacion: 'Denominador de la solidez. La diferencia `A_hull − A` es la superficie de las concavidades, magnitud directamente interpretable como materia ausente respecto a la silueta envolvente.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null,
    nota: 'Alias en la salida plana: `hull_area`.',
  },
  {
    clave: 'convex_hull_perimeter', ambito: 'objeto', categoria: 'convex_hull',
    csv: null, nombre: 'Perímetro de la envolvente convexa', formula: 'P_hull', unidad: 'mm', rango: '≤ perimeter',
    definicion: 'Perímetro del casco convexo.',
    interpretacion: 'Siempre menor o igual que el perímetro real; la igualdad caracteriza a las piezas convexas. Es la base de compacidad, factor de forma y lobularidad, todos calculados sobre el hull por estabilidad.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null,
    nota: 'Alias en la salida plana: `perimeter_hull`.',
  },
  {
    clave: 'convex_hull_points', ambito: 'objeto', categoria: 'convex_hull',
    csv: ['Convex Hull', 'Número de Puntos'],
    nombre: 'Vértices del casco convexo', formula: null, unidad: 'conteo', rango: 'entero ≥ 3',
    definicion: 'Número de vértices que definen la envolvente convexa.',
    interpretacion: 'Indicador de la complejidad de la silueta envolvente. Un recuento muy bajo (3–5) advierte de que los índices calculados sobre el hull están describiendo un polígono grosero, no la pieza: fue la causa de clasificaciones falsas de «fragmento circular» sobre piezas rectangulares.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null,
    nota: 'Vigilar este campo al interpretar compacidad, factor de forma y lobularidad.',
  },
  {
    clave: 'area_px', ambito: 'objeto', categoria: 'convex_hull',
    csv: null, nombre: 'Área en píxeles', formula: null, unidad: 'px²', rango: '> 0',
    definicion: 'Área de la pieza antes de aplicar el factor de escala.',
    interpretacion: 'Magnitud de trabajo, no de reporte. Se conserva porque el cociente `area / area_px` reconstruye el factor de escala aplicado, y con él se detecta cuándo una ruta dejó dimensiones sin convertir.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null,
    nota: 'Es el insumo del conversor px→mm que corrige ADR-016 #1.',
  },
  {
    clave: 'perimeter_px', ambito: 'objeto', categoria: 'convex_hull',
    csv: null, nombre: 'Perímetro en píxeles', formula: null, unidad: 'px', rango: '> 0',
    definicion: 'Perímetro del contorno antes de escalar.',
    interpretacion: 'Magnitud de trabajo. Útil para auditar la conversión de unidades.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null, nota: null,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // IX. EJES, ORIENTACIÓN Y POSICIÓN ESPACIAL
  // ═══════════════════════════════════════════════════════════════════════
  {
    clave: 'eje_mayor', ambito: 'objeto', categoria: 'ejes_orientacion',
    csv: ['Ejes y Orientación', 'Eje Mayor'],
    nombre: 'Eje mayor', formula: 'lado mayor del rectángulo de área mínima', unidad: 'mm', rango: '> 0',
    definicion: 'Longitud del eje principal de la pieza.',
    interpretacion: 'La dimensión de referencia para la orientación canónica. En piezas casi equidimensionales su dirección es inestable, y con ella todo lo que se apoya en ella (simetría bilateral, ángulo del eje principal).',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null,
    nota: 'Recibe incertidumbre propagada: `eje_mayor_incertidumbre_abs`, `eje_mayor_rango_min/max`.',
  },
  {
    clave: 'eje_menor', ambito: 'objeto', categoria: 'ejes_orientacion',
    csv: ['Ejes y Orientación', 'Eje Menor'],
    nombre: 'Eje menor', formula: 'lado menor del rectángulo de área mínima', unidad: 'mm', rango: '> 0, ≤ eje_mayor',
    definicion: 'Longitud del eje perpendicular al principal.',
    interpretacion: 'Junto al mayor define la relación de aspecto y la elongación.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'eje_mayor_real_longitud', ambito: 'objeto', categoria: 'ejes_orientacion',
    csv: ['Ejes y Orientación', 'Eje Mayor Real - Longitud'],
    nombre: 'Eje mayor real', formula: 'longitud de la cuerda máxima medida SOBRE el contorno',
    unidad: 'mm', rango: '> 0',
    definicion: 'Longitud del eje mayor trazado entre puntos reales del contorno, no sobre el rectángulo envolvente.',
    interpretacion: 'Difiere del `eje_mayor` cuando la pieza no llena su rectángulo: el rectángulo mide la caja, este mide la pieza. Sus extremos son `eje_mayor_real_p1/p2`, que permiten dibujar el eje sobre la imagen.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'eje_menor_real_longitud', ambito: 'objeto', categoria: 'ejes_orientacion',
    csv: ['Ejes y Orientación', 'Eje Menor Real - Longitud'],
    nombre: 'Eje menor real', formula: 'longitud de la cuerda perpendicular máxima sobre el contorno',
    unidad: 'mm', rango: '> 0',
    definicion: 'Longitud del eje menor medido entre puntos reales del contorno.',
    interpretacion: 'Anchura efectiva de la pieza en su punto más ancho perpendicular al eje mayor.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'eje_principal_angulo', ambito: 'objeto', categoria: 'ejes_orientacion',
    csv: ['Ejes y Orientación', 'Eje Principal - Ángulo'],
    nombre: 'Ángulo del eje principal', formula: 'arg del autovector mayor de la covarianza del contorno',
    unidad: 'grados', rango: '[0°, 180°)',
    definicion: 'Orientación del eje principal de inercia de la pieza en el plano de la imagen.',
    interpretacion: 'Es propiedad de la FOTOGRAFÍA, no de la pieza: depende de cómo se apoyó al capturar. Solo tiene sentido comparativo dentro de una misma imagen (p. ej. orientación relativa entre piezas de un mismo plano).',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: ['bookstein1991'], nota: null,
  },
  {
    clave: 'eje_principal_orientacion', ambito: 'objeto', categoria: 'ejes_orientacion',
    csv: ['Ejes y Orientación', 'Eje Principal - Orientación'],
    nombre: 'Orientación dominante', formula: null, unidad: 'texto',
    rango: 'Horizontal (<15° o >165°) · Vertical (75°–105°) · Diagonal NE-SO (15°–75°) · Diagonal NO-SE (resto)',
    definicion: 'Discretización del ángulo del eje principal en cuatro cuadrantes.',
    interpretacion: 'Descriptor de la disposición en la foto. No es un atributo de la pieza.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'eje_principal_anisotropia', ambito: 'objeto', categoria: 'ejes_orientacion',
    csv: ['Ejes y Orientación', 'Anisotropía'],
    nombre: 'Anisotropía', formula: 'a = (λ₁ − λ₂) / (λ₁ + λ₂)', unidad: 'adimensional',
    rango: '[0, 1] — 0 = isótropa, 1 = lineal',
    definicion: 'Contraste normalizado entre los autovalores de la matriz de covarianza del contorno.',
    interpretacion: 'Mide cuán marcada es la dirección dominante de la pieza. A diferencia de la relación de aspecto, es acotada y estable: cerca de 0 avisa de que el eje principal —y todo lo que depende de él— carece de significado.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: ['bookstein1991'],
    nota: 'Es el predictor de fiabilidad de la orientación canónica: por debajo de ~0.2 la dirección del eje mayor es ruido.',
  },
  {
    clave: 'eje_principal_forma_dominante', ambito: 'objeto', categoria: 'ejes_orientacion',
    csv: ['Ejes y Orientación', 'Forma Dominante'],
    nombre: 'Forma dominante', formula: null, unidad: 'texto',
    rango: '<0.2 Isótropa · <0.5 Moderadamente alargada · <0.8 Alargada · ≥0.8 Muy alargada (lineal)',
    definicion: 'Discretización de la anisotropía en cuatro tramos.',
    interpretacion: '«Isótropa» debe leerse como advertencia metodológica: en ese tramo el eje principal no es fiable.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null, nota: null,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // IX-b. SIMETRÍA BILATERAL
  // ═══════════════════════════════════════════════════════════════════════
  {
    clave: 'simetria_bilateral', ambito: 'objeto', categoria: 'simetria',
    csv: ['Simetría', 'Simetría Bilateral'],
    nombre: 'Índice de simetría bilateral',
    formula: 'S = clamp(1 − d_asim / R̄, 0, 1), con d_asim = media de distancias mínimas del semicontorno izquierdo al derecho reflejado',
    unidad: 'adimensional', rango: '[0, 1] — 1 = simetría perfecta',
    definicion: 'Se rota el contorno a su eje principal, se parte por el centroide, se refleja la mitad derecha sobre la izquierda y se promedia la distancia de cada punto izquierdo a su vecino más próximo del reflejo. Esa discrepancia media, normalizada por el radio medio, da el índice.',
    interpretacion: 'En piezas bifaciales retocadas la simetría es indicador de inversión técnica y de control del gesto. Depende críticamente del eje principal: en piezas de anisotropía baja el eje es inestable y el índice pierde sentido — verificar `eje_principal_anisotropia` antes de interpretarlo.',
    fuente: `${METRICS}::_simetria_bilateral`, nivel: 'H', ref: ['klingenberg2015', 'bookstein1991'],
    nota: 'La discrepancia es una media de distancias mínimas en un solo sentido (izquierda→derecha), no una distancia de Hausdorff simétrica.',
  },
  {
    clave: 'simetria_clasificacion', ambito: 'objeto', categoria: 'simetria',
    csv: ['Simetría', 'Clasificación'],
    nombre: 'Clasificación de simetría', formula: null, unidad: 'texto',
    rango: '≥0.95 Altamente simétrico · ≥0.85 Simetría buena · ≥0.70 Simetría moderada · ≥0.50 Levemente asimétrico · <0.50 Asimétrico',
    definicion: 'Discretización del índice de simetría bilateral en cinco tramos.',
    interpretacion: 'Con menos de 10 puntos de contorno, o si el contorno no se puede partir en dos mitades de al menos 3 puntos, el motor devuelve 0 con un rótulo explicativo en vez de un valor: distinguir ese caso de una asimetría real.',
    fuente: `${METRICS}::_simetria_bilateral`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'simetria_distancia_asimetria', ambito: 'objeto', categoria: 'simetria',
    csv: ['Simetría', 'Distancia Asimetría'],
    nombre: 'Distancia de asimetría', formula: 'd_asim', unidad: 'mm', rango: '≥ 0',
    definicion: 'Discrepancia media absoluta entre el semicontorno y el reflejo del opuesto.',
    interpretacion: 'Magnitud absoluta de la asimetría, interpretable como «cuántos milímetros se aparta en promedio una mitad de la otra». Crece con el tamaño de la pieza; para comparar entre piezas, usar el índice normalizado.',
    fuente: `${METRICS}::_simetria_bilateral`, nivel: null, ref: null, nota: null,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // XVII. CARACTERÍSTICAS GEOMÉTRICAS AVANZADAS
  // ═══════════════════════════════════════════════════════════════════════
  {
    clave: 'max_feret_diameter', ambito: 'objeto', categoria: 'avanzadas',
    csv: null, nombre: 'Diámetro de Feret máximo (alias)', formula: null,
    unidad: 'mm', rango: '> 0',
    definicion: 'Alias de `feret_max` emitido por la sección de métricas avanzadas.',
    interpretacion: 'No es una segunda medición. Si difiere de `feret_max`, hay dos rutas de cálculo activas y una de ellas está desactualizada.',
    fuente: `${METRICS}::_feret`, nivel: null, ref: ['feret1930'],
    nota: 'Alias — preferir `feret_max`.',
  },
  {
    clave: 'min_feret_diameter', ambito: 'objeto', categoria: 'avanzadas',
    csv: null, nombre: 'Diámetro de Feret mínimo (alias)', formula: null,
    unidad: 'mm', rango: '> 0',
    definicion: 'Alias de `feret_min`.',
    interpretacion: 'Ver la nota de `max_feret_diameter`.',
    fuente: `${METRICS}::_feret`, nivel: null, ref: ['feret1930'], nota: 'Alias — preferir `feret_min`.',
  },
  {
    clave: 'feret_max_angle', ambito: 'objeto', categoria: 'avanzadas',
    csv: null, nombre: 'Ángulo del Feret máximo', formula: null, unidad: 'grados', rango: '[0°, 180°)',
    definicion: 'Orientación en la imagen de la cuerda que realiza el diámetro de Feret máximo.',
    interpretacion: 'Permite dibujar el eje de Feret sobre la pieza y contrastarlo con el eje principal de inercia: cuando divergen mucho, la masa de la pieza y su extensión apuntan en direcciones distintas.',
    fuente: `${METRICS}::_feret`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'feret_min_angle', ambito: 'objeto', categoria: 'avanzadas',
    csv: null, nombre: 'Ángulo del Feret mínimo', formula: null, unidad: 'grados', rango: '[0°, 180°)',
    definicion: 'Orientación de la dirección en que se mide la anchura mínima.',
    interpretacion: 'Perpendicular aproximada al eje de máxima extensión en piezas alargadas.',
    fuente: `${METRICS}::_feret`, nivel: null, ref: null, nota: null,
  },
  {
    clave: 'feret_ratio', ambito: 'objeto', categoria: 'avanzadas',
    csv: null, nombre: 'Ratio de Feret', formula: 'feret_min / feret_max', unidad: 'adimensional',
    rango: '(0, 1] — 1 = equidimensional',
    definicion: 'Cociente entre los diámetros de Feret mínimo y máximo.',
    interpretacion: 'La medida de esbeltez más robusta del repertorio: no usa ejes principales ni cajas envolventes, así que sigue siendo fiable en piezas casi circulares, donde la relación de aspecto se vuelve ruidosa.',
    fuente: `${METRICS}::_feret`, nivel: 'H', ref: ['feret1930'], nota: null,
  },
  {
    clave: 'feret_clasificacion', ambito: 'objeto', categoria: 'avanzadas',
    csv: ['Métricas Avanzadas', 'Clasificación Feret'],
    nombre: 'Clasificación por Feret', formula: null, unidad: 'texto', rango: 'escalera descriptiva',
    definicion: 'Discretización del ratio de Feret.',
    interpretacion: 'Rótulo de esbeltez independiente de los ejes principales.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null,
    nota: 'Alias en algunas rutas: `clasificacion_feret`.',
  },
  {
    clave: 'indice_lobularidad', ambito: 'objeto', categoria: 'avanzadas',
    csv: ['Métricas Avanzadas', 'Índice de Lobularidad'],
    nombre: 'Índice de lobularidad', formula: 'L = P_hull / (2π·√(A_hull/π))',
    unidad: 'adimensional', rango: '[1, ∞) — 1 = circular',
    definicion: 'Perímetro del casco convexo frente al del círculo de igual área de casco. Índice propio de MAO, de la familia isoperimétrica.',
    interpretacion: 'Al ir sobre el HULL solo ve lóbulos de la silueta envolvente, nunca el dentado del borde: el hull es liso por construcción. Esa ceguera es deliberada —separa lobulación de rugosidad— pero implica que no debe usarse para detectar retoque marginal.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: ['cox1927'],
    nota: 'Formalmente idéntico al índice de complejidad, pero sobre el hull en vez del contorno real.',
  },
  {
    clave: 'lobularidad_clasificacion', ambito: 'objeto', categoria: 'avanzadas',
    csv: ['Métricas Avanzadas', 'Clasificación Lobularidad'],
    nombre: 'Clasificación de lobularidad', formula: null, unidad: 'texto',
    rango: '>1.3 Muy lobulado · >1.15 Moderadamente lobulado · >1.05 Ligeramente lobulado · ≤1.05 Circular/Suave',
    definicion: 'Discretización del índice de lobularidad en cuatro tramos.',
    interpretacion: 'Descriptor de la silueta envolvente.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null,
    nota: 'Alias en algunas rutas: `clasificacion_lobularidad`.',
  },
  {
    clave: 'indice_estrellamiento', ambito: 'objeto', categoria: 'avanzadas',
    csv: ['Métricas Avanzadas', 'Índice de Estrellamiento'],
    nombre: 'Índice de estrellamiento', formula: 'E = (R_max − R_min) / R̄',
    unidad: 'adimensional', rango: '≥ 0; 0 = radios uniformes',
    definicion: 'Amplitud de la serie radial normalizada por el radio medio. Índice propio de MAO.',
    interpretacion: 'Detecta puntas y salientes marcados. Usa solo los dos extremos de la serie radial, así que un único saliente lo dispara: es sensible pero no robusto. Para irregularidad global, el coeficiente de variación radial es preferible.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null,
    nota: 'R_max y R_min se miden sobre el hull, de modo que el índice tampoco ve el dentado del borde.',
  },
  {
    clave: 'estrellamiento_clasificacion', ambito: 'objeto', categoria: 'avanzadas',
    csv: ['Métricas Avanzadas', 'Clasificación Estrellamiento'],
    nombre: 'Clasificación de estrellamiento', formula: null, unidad: 'texto',
    rango: '>0.6 Muy estrellado · >0.4 Moderadamente estrellado · >0.2 Ligeramente estrellado · ≤0.2 Redondeado/Regular',
    definicion: 'Discretización del índice de estrellamiento en cuatro tramos.',
    interpretacion: 'Descriptor de la presencia de puntas en la silueta envolvente.',
    fuente: `${METRICS}::compute_metrics`, nivel: null, ref: null,
    nota: 'Alias en algunas rutas: `clasificacion_estrellamiento`.',
  },
];


// ═══════════════════════════════════════════════════════════════════════════
// API DE CONSULTA
// ═══════════════════════════════════════════════════════════════════════════

/** Índice `ambito:clave` → término, construido una vez. */
const _INDICE = new Map(TERMINOS.map(t => [`${t.ambito}:${t.clave}`, t]));

/**
 * Término por clave de métrica. `ambito` por omisión es 'objeto', que es el de
 * la pieza; las perforaciones y horadaciones tienen sus propias magnitudes
 * homónimas y NO deben resolverse contra las de la pieza.
 * @returns {?TerminoSpec}
 */
export function porClave(clave, ambito = 'objeto') {
  return _INDICE.get(`${ambito}:${clave}`) || null;
}

/** Términos de una categoría del manifiesto, en orden de declaración. */
export function porCategoria(categoriaId) {
  return TERMINOS.filter(t => t.categoria === categoriaId);
}

/**
 * Término que define una columna del CSV. Es la consulta que hace legible un
 * CSV de MAO sin el código delante.
 * @returns {?TerminoSpec}
 */
export function porColumnaCSV(seccion, campo) {
  return TERMINOS.find(t => t.csv && t.csv[0] === seccion && t.csv[1] === campo) || null;
}

/** Referencias bibliográficas citadas por un término, ya resueltas a texto. */
export function referenciasDe(termino) {
  if (!termino || !termino.ref) return [];
  return termino.ref.map(k => REFERENCIAS[k]).filter(Boolean);
}

/** Cobertura por categoría: `{ [categoriaId]: nº de términos }`. */
export function cobertura() {
  const c = {};
  for (const t of TERMINOS) c[t.categoria] = (c[t.categoria] || 0) + 1;
  return c;
}

/**
 * Valida la coherencia interna del glosario. Devuelve [] si está sano, o la
 * lista de problemas. Lo consume el test de contrato; también sirve de
 * autodiagnóstico en desarrollo.
 *
 * NO valida contra el inventario: el inventario OBSERVA qué emite el código
 * (con una heurística), el glosario ADJUDICA qué significa cada cosa. Que
 * difieran es información, no un fallo.
 */
export function validarGlosario(idsCategoriasValidas = null) {
  const problemas = [];
  const vistos = new Set();
  const AMBITOS = ['objeto', 'perforacion', 'horadacion', 'bifacial'];
  const CAMPOS = ['clave', 'ambito', 'categoria', 'nombre', 'definicion', 'unidad', 'interpretacion', 'fuente'];

  for (const t of TERMINOS) {
    const id = `${t.ambito}:${t.clave}`;
    if (vistos.has(id)) problemas.push(`término duplicado: ${id}`);
    vistos.add(id);

    for (const c of CAMPOS) {
      if (!t[c]) problemas.push(`${id}: falta el campo obligatorio \`${c}\``);
    }
    if (!AMBITOS.includes(t.ambito)) problemas.push(`${id}: ámbito desconocido \`${t.ambito}\``);
    if (t.csv && (!Array.isArray(t.csv) || t.csv.length !== 2)) {
      problemas.push(`${id}: \`csv\` debe ser [sección, campo] o null`);
    }
    for (const r of (t.ref || [])) {
      if (!REFERENCIAS[r]) problemas.push(`${id}: referencia inexistente \`${r}\``);
    }
    if (idsCategoriasValidas && !idsCategoriasValidas.includes(t.categoria)) {
      problemas.push(`${id}: categoría \`${t.categoria}\` no existe en el manifiesto`);
    }
  }

  // Convenciones de nomenclatura: mismos requisitos de completitud.
  const idsConv = new Set();
  for (const c of CONVENCIONES) {
    for (const campo of ['id', 'tipo', 'termino', 'expansion', 'nota']) {
      if (!c[campo]) problemas.push(`convención ${c.id || '?'}: falta \`${campo}\``);
    }
    if (idsConv.has(c.id)) problemas.push(`convención duplicada: ${c.id}`);
    if (c.tipo && !['sigla', 'regla'].includes(c.tipo)) {
      problemas.push(`convención ${c.id}: tipo desconocido \`${c.tipo}\``);
    }
    idsConv.add(c.id);
  }

  // Una columna del CSV no puede quedar definida por dos términos distintos.
  const porColumna = new Map();
  for (const t of TERMINOS) {
    if (!t.csv) continue;
    const k = `${t.csv[0]}›${t.csv[1]}`;
    if (porColumna.has(k)) {
      problemas.push(`columna CSV «${k}» definida por \`${porColumna.get(k)}\` y \`${t.clave}\``);
    }
    porColumna.set(k, t.clave);
  }

  return problemas;
}
