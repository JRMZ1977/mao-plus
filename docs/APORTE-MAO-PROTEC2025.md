# Aporte instrumental de MAO Plus — texto a prueba de revisor (PROTEC 2025)

> Versión revisada del documento «DESARROLLOS CONCEPTUALES» para integrarse como sección de
> **instrumento / material y métodos** del artículo. Mantiene los cuatro pilares del aporte
> (reducción de incertidumbre · formalización canónica 2D↔3D · unificación instrumental ·
> infraestructura de datos), con cada afirmación anclada a la implementación verificada y con las
> imprecisiones técnicas corregidas. Al final, apéndice de trazabilidad (qué se corrigió y por qué).

---

## Título propuesto

**De la fragmentación al protocolo unificado: MAO Plus como herramienta de morfometría de contorno
integrada para la reducción de incertidumbre y la formalización canónica en 2D y 3D.**

## Introducción y problemática

El análisis morfométrico cuantitativo de la cultura material afronta una fragmentación operativa:
la ausencia de herramientas específicas unificadas obliga a encadenar programas dispares e
incompatibles. Esa dispersión traslada al resultado dos fuentes de incertidumbre técnica del
registro: la que introduce la **digitalización manual** (fatiga y variabilidad inter‑observador) y
la que aportan las **aberraciones ópticas** de la captura fotográfica. Ello compromete la
reproducibilidad y, al restringir la validación a quien posee acceso físico a las colecciones,
perpetúa una brecha en el acceso al conocimiento.

## Enfoque de la herramienta

MAO Plus (v2.1) es una herramienta de morfometría **de contorno** integrada, concebida bajo un
principio de conservación patrimonial: estabilizar el dato sobre el objeto —trazable, riguroso y
reproducible— como garantía científica frente a su vulnerabilidad física. No sustituye la agencia
interpretativa del investigador ni automatiza la exégesis histórica: actúa como soporte
metodológico que estabiliza las medidas para potenciar el juicio crítico humano y liberar el
conocimiento de su dependencia geográfica. La detección propone; el investigador decide.

## Entorno 2D — control de la contingencia del registro fotográfico

En el plano bidimensional, MAO Plus antepone al cálculo una fase de control de las limitaciones
físicas de la imagen. Primero atenúa la degradación del borde por pixelación (*aliasing*) mediante
una estabilización de contorno en el plano **sub‑píxel (error de contorno ≈ 0.15 px)**, que
independiza la fidelidad del trazo de la resolución discreta del sensor y del operador. A
continuación, un **módulo de auditoría óptica** decodifica los metadatos EXIF y **modela
algebraicamente dos fuentes de error geométrico** —la distorsión radial de la lente (coeficiente
*k₁* estimado a partir del campo de visión) y el escorzo de perspectiva— en función de la posición
del objeto en el encuadre. El sistema **no elimina** el error, sino que lo **cuantifica y reporta
como presupuesto de incertidumbre por objeto**, propagado a cada métrica dimensional como margen
`± mm / ± mm²`. En piezas centradas la incertidumbre óptica es típicamente **< 0.5 %**, creciendo
hacia los bordes del encuadre; el modelo declara su propia incertidumbre (± 30 %), por lo que debe
entenderse como un presupuesto de error de primer orden, no como una calibración absoluta.

Depurada así la contingencia óptica, el Análisis Elíptico de Fourier (EFA, según Kuhl & Giardina
1982) describe la morfología del contorno mediante descriptores **invariantes a transformaciones de
similaridad** —traslación, rotación, escala uniforme, punto de inicio y reflexión— estableciendo
lecturas canónicas y comparables sobre la materialidad.

## Entorno 3D — volumetría y simetría bilateral bajo el mismo protocolo

La misma lógica de formalización canónica se extiende a las mallas poligonales, evitando recurrir a
programas externos de modelado 3D para extraer perfiles comparativos. MAO Plus resuelve la
subjetividad de la orientación **detectando las caras dominantes del objeto** (por curvatura y
coherencia de normales) y fijando a partir de ellas un **plano canónico reproducible**, con un PCA
contextual como refinamiento (y PCA global como recurso de reserva) — un criterio de orientación
independiente del operador. Sobre esa pose, la herramienta proyecta **hiperplanos de corte
automatizados**, perpendiculares a los ejes principales, cuyos perfiles alimentan directamente la
descomposición de Fourier. La normalización canónica del primer armónico (*a₁ = 1, b₁ = 0,
c₁ = 0*) confiere a los descriptores la misma **invariancia a similaridad** que en 2D.

Bajo este protocolo único se extraen, de forma homóloga entre anverso y reverso, descriptores como
el **índice de homología / coherencia morfométrica inter‑cara**, la **energía de curvatura**, y las
**métricas volumétricas de las perforaciones** —balance de área sólida frente a vacía, número de
perforaciones reales y verificación de si su eje atraviesa el centro de masa—. La formalización
matemática garantiza así que ambas caras del objeto se describan bajo un mismo estándar metrológico.

## Infraestructura de datos e interoperabilidad

Los descriptores de Fourier funcionan como **firmas morfométricas estables, ligeras e invariantes**:
etiquetas numéricas que registran la forma de manufactura y **reducen** el ruido taxonómico
inter‑observador (sin sustituir la asignación tipológica humana). Exportables en formatos abiertos
(COCO, CSV, JSON), constituyen conjuntos de entrenamiento (*ground truth*) de alta fidelidad para
modelos de aprendizaje automático. Por diseño, esta arquitectura orienta a MAO Plus hacia una
**infraestructura de datos abierta e interoperable** —licencia MIT— cuyo objetivo, una vez
publicado el repositorio, es disolver el aislamiento de las colecciones locales y facilitar el
acceso translocal al dato analítico.

---

## Apéndice — trazabilidad de las correcciones sobre el borrador original

| # | Afirmación original | Estado | Corrección aplicada |
|---|---|---|---|
| 1 | «invariancia **afín** absoluta» | 🔴 incorrecto | «invariancia a **similaridad**» (EFA no es afín: no cubre *shear* ni escala no uniforme) |
| 2 | «reduce la fatiga de la **digitalización manual de landmarks**» | 🔴 impreciso | MAO **prescinde** de landmarks (contorno automático); se reformula como eliminación de esa fuente de error |
| 3 | «**morfometría geométrica**» | 🔴 impreciso | «morfometría **de contorno** / basada en Fourier» (GM *stricto sensu* = landmarks) |
| 4 | «acota la incertidumbre a **< 0.5 %**» | 🟡 sobredicho | Banda óptima (piezas centradas); se reformula como presupuesto por objeto, creciente hacia bordes, modelo ± 30 % |
| 5 | «**eliminan** el ruido taxonómico inter‑observador» | 🟡 sobredicho | «**reducen**» (la tipología sigue siendo humana) |
| 6 | «infraestructura de datos abiertos / democratización» (presente) | 🟡 aspiracional | Reformulado en prospectivo (repositorio aún no público) |
| 7 | pose canónica por «**autovectores del tensor de inercia**» | 🔴 no coincide con el código | Pose por **detección de caras** + PCA contextual (`obj3d_v2` marca *«NO según PCA global»*; tensor de inercia se usa solo para elongación de secciones 2D) |
| 8 | «**coaxialidad tridimensional** de las perforaciones» | 🔴 métrica inexistente | Sustituido por métricas reales: balance área sólida/vacía, nº de perforaciones, `passes_through_com` |

**Nota de estrategia (Eje 1 vs Eje 2):** este texto sostiene el aporte **conceptual/instrumental**
(el motor). La validación empírica exigible en revisión por pares —exactitud contra dimensiones
conocidas y reproducibilidad inter‑observador— la aporta el **caso de estudio de los ornamentos de
La Draga**. Ambos deben presentarse articulados: el instrumento (este documento) y su validación
aplicada (el corpus de cuentas), no como discursos paralelos.
