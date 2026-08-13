# MAO Plus — Descripción académica del instrumento

> **Propósito de este documento.** Doble: (a) exponer, en registro académico, qué es MAO Plus, qué
> problema resuelve y bajo qué supuestos metodológicos opera; (b) servir de **insumo directo** para
> la redacción de una ponencia. Cada afirmación técnica está anclada al código verificable del
> repositorio; lo pendiente se declara como pendiente. La § 9 traduce el contenido a estructura de
> ponencia (guion, figuras, preguntas previsibles).
>
> **Estado:** v1.0 · 2026-08-12 · MAO Plus v1.2.0 (package) / v2.1 (denominación científica).
> **Fuentes internas:** `docs/APORTE-MAO-PROTEC2025.md`, `docs/ESTADO-ADRS.md`,
> `docs/ADR-006`, `ADR-011`, `ADR-012`, `ADR-013`, `ADR-015`, `docs/AUDITORIA-ESTADO-APP-20260719.md`.

---

## 1. Problema de investigación

El análisis morfométrico cuantitativo de la cultura material arqueológica opera hoy sobre una
**infraestructura fragmentada**. No existe una herramienta unificada de dominio: el investigador
encadena programas heterogéneos —un editor de imagen para preparar la fotografía, un paquete
estadístico para los descriptores, una hoja de cálculo para consolidar, un software de modelado
para el 3D— cada uno con su propio modelo de datos, sus convenciones de unidades y sus supuestos
implícitos. Esa cadena de traspasos es el lugar donde se pierde la trazabilidad.

De esa fragmentación se derivan tres consecuencias metodológicas, que son las que MAO Plus toma
como problema:

1. **Incertidumbre de digitalización.** Cuando el contorno se define manualmente —clic a clic, o por
   colocación de *landmarks*— la medida hereda la fatiga y la variabilidad inter e intra-observador.
   El dato no es del objeto: es del objeto *más* el operador.
2. **Incertidumbre óptica no declarada.** La fotografía arqueológica introduce distorsión radial de
   lente y escorzo de perspectiva. En la práctica corriente estas fuentes de error **no se reportan**:
   la medida se publica como si el sensor fuera un plano ideal y la lente una proyección perfecta.
3. **Dependencia geográfica del conocimiento.** Al no existir un dato analítico estable y portable,
   la validación de un resultado exige acceso físico a la colección. Esto restringe estructuralmente
   quién puede revisar y quién puede replicar.

**Premisa que ordena el diseño.** MAO Plus se concibe bajo un principio de conservación patrimonial:
si el objeto es físicamente vulnerable, **estabilizar el dato sobre el objeto** —trazable, riguroso,
reproducible— es una garantía científica de primer orden. El instrumento no sustituye la agencia
interpretativa del investigador ni automatiza la exégesis histórica; actúa como soporte metodológico
que estabiliza la medida para liberar el juicio crítico humano. La formulación operativa de este
principio, presente en toda la interfaz, es: **la detección propone, el investigador decide.**

---

## 2. Definición y alcance del instrumento

**MAO Plus** (Morfometría Arqueológica de Objetos) es una **aplicación de escritorio de morfometría
de contorno** para el registro, medición y clasificación de cultura material —con énfasis en
industria lítica y ornamentos—, con dos entornos homologados: 2D (fotografía) y 3D (mallas
poligonales `.obj`).

**Precisión terminológica necesaria.** MAO Plus practica **morfometría de contorno basada en Fourier**,
no *morfometría geométrica* en sentido estricto. La distinción no es cosmética: la morfometría
geométrica clásica (Bookstein, Rohlf) se funda en configuraciones de *landmarks* homólogos y su
superposición procrustiana; MAO Plus **prescinde de landmarks** y describe la forma como una función
periódica del contorno cerrado. Se trata de paradigmas complementarios, no equivalentes, y el
instrumento debe presentarse como lo que es. (Existe un módulo Procrustes en el frontend para
comparación de configuraciones, pero el núcleo descriptivo es de contorno.)

### Alcance declarado

| Dentro del alcance | Fuera del alcance |
|---|---|
| Extracción automática de contorno sub-píxel | Interpretación tipológica autónoma |
| Descriptores de forma invariantes (EFA) | Datación, procedencia, análisis de materia prima |
| Presupuesto de incertidumbre óptica por objeto | Calibración metrológica certificada de la lente (pendiente, § 8) |
| Perforaciones/horadaciones: detección y área neta | Entrenamiento de modelos ML (exporta el dataset, no lo entrena) |
| Homologación métrica 2D↔3D | Morfometría por landmarks *stricto sensu* (diferida) |
| Exportación abierta (CSV, JSON, COCO, PDF) | Repositorio colaborativo en línea (prospectivo) |

---

## 3. Arquitectura del sistema

MAO Plus es una aplicación **Electron** (shell de escritorio, macOS) con un **backend científico
FastAPI en Python** que se lanza como proceso hijo y expone 34 endpoints bajo el prefijo `/api` en
el puerto 8765. Esta partición no es un capricho de implementación: responde a una decisión
metodológica: **todo cálculo científicamente relevante vive en Python** (NumPy, OpenCV, SciPy,
scikit-learn, Shapely), mientras que la capa JavaScript se ocupa de la interacción, la visualización
y la orquestación del flujo. El motor JS preexistente se conserva únicamente como *fallback*
degradado si el backend no está disponible.

```
┌──────────────────────── Electron (macOS) ─────────────────────────┐
│  main.js — ventana, protocolo app://, spawn del backend, IPC      │
│  index.html + js/ (48 archivos, ~101 000 líneas)                  │
│    ├─ analysis-core.js — puente IIFE + API Tier-1 (10 funciones)  │
│    ├─ js/modules/ — 12 módulos ES6 en 3 capas (L0→L2)             │
│    └─ pestañas LAAR: Proyecto → Captura → Análisis → Resultados   │
└──────────────────────────────┬────────────────────────────────────┘
                               │ HTTP :8765  (34 endpoints /api)
┌──────────────────────────────┴────────────────────────────────────┐
│  python/server.py — FastAPI                                        │
│  python/modules/ — 22 módulos, ~14 600 líneas                      │
│    detection · contour · metrics · efa · scale · classifier · ph   │
│    comparator · morphology · obj3d_v2 · sam_segmenter · dataset…   │
│  morphometric_registry.py — repertorio canónico 2D↔3D (ADR-006)    │
└────────────────────────────────────────────────────────────────────┘
```

### 3.1 Gobierno de la coherencia: los contratos

El rasgo arquitectónico más relevante para una audiencia académica no es la partición de procesos,
sino el **mecanismo explícito de coherencia** entre lo que el motor calcula y lo que las salidas
reportan. Un sistema morfométrico falla silenciosamente cuando el panel de pantalla, la tabla, el
CSV y el PDF describen la misma pieza con nombres, unidades o subconjuntos distintos. MAO Plus
combate ese riesgo con **fuentes únicas de verdad**, verificadas por tests:

- **`morphometric_registry.py` (ADR-006)** — repertorio canónico de 31 métricas, cada una con id
  estable, fórmula de referencia, nivel (H = homóloga directa 2D↔3D, P = par homólogo, 3D, 2D),
  modalidad, unidad, y clave real en el módulo que la produce. Invariante rector explícito: *una
  métrica pertenece al núcleo homólogo solo si es invariante ante traslación, rotación y escala, **y**
  adimensional*. Ningún consumidor puede codificar nombres de clave a mano.
- **`category-manifest.js` (ADR-011)** — taxonomía canónica de las 24 categorías del informe
  morfológico, con orden y título fijos, compartida por las cuatro salidas (panel, tabla completa,
  CSV, PDF). Distingue categorías *estructurales* (se rinden siempre, con marcador «sin datos» si
  faltan) de las *comparativas* (condicionales por naturaleza: bifacial, tabla P/H).
- **`MaoDeteccion` (ADR-008)** — contrato de salida de la captura: normaliza método de detección,
  bounding box, área en píxeles y confianza en un único punto de estrangulamiento, de modo que los
  cuatro modos de detección entreguen el mismo esquema.

Este andamiaje es el que permite afirmar que dos análisis distintos son comparables: no porque el
usuario haya sido cuidadoso, sino porque el sistema no admite otra cosa.

---

## 4. El método, etapa por etapa

### 4.1 Escala: de píxeles a milímetros

La escala se resuelve por vía **óptica** a partir de los metadatos EXIF de la imagen (con la base de
datos interna de sensores por modelo de cámara), o manualmente:

```
scale_px_mm = (sensor_w_mm / img_w_px) · (distancia_mm / focal_mm)
```

Existe además un modo **híbrido JPG+RAW**, que extrae de la pareja de archivos los parámetros más
fiables de cada uno. Los formatos RAW sin parser EXIF disponible (p. ej. Canon CR3, contenedor
ISOBMFF) se registran con degradación explícita: la imagen se acepta y el sistema solicita focal,
sensor y apertura manualmente, en lugar de fallar en silencio.

### 4.2 Auditoría óptica: el presupuesto de incertidumbre

Este es el **primer diferenciador** del instrumento. Antes de calcular forma, MAO Plus modela
algebraicamente dos fuentes de error geométrico, en función de la **posición radial del centroide del
objeto dentro del encuadre**:

1. **Distorsión radial de lente.** El coeficiente `k₁` se estima a partir del campo de visión
   diagonal derivado de focal y sensor, mediante una tabla empírica por rangos (de teleobjetivo
   largo, `k₁ ≈ −0.0003`, a ultra-gran angular, `k₁ ≈ −0.22`). El error se modela como
   `|k₁| · r_norm² · 100` (%), con `r_norm` la distancia normalizada del centroide al centro óptico.
2. **Escorzo de perspectiva** sobre plano, función de la misma posición radial.

Ambos se combinan **en cuadratura** (raíz de la suma de cuadrados) y se propagan a cada métrica
dimensional como margen `± mm` / `± mm²`, escritos en el propio diccionario de métricas
(`{clave}_incertidumbre_abs`) y consignados en la sección IX del informe.

**Lo que esta afirmación sí soporta y lo que no.** El sistema **no elimina** el error: lo *cuantifica
y lo declara*. En piezas centradas la incertidumbre óptica resultante es típicamente **< 0.5 %**, y
crece hacia los bordes del encuadre. El modelo declara además **su propia incertidumbre (± 30 %)**,
porque `k₁` es estimado y no calibrado. Debe presentarse, por tanto, como **presupuesto de error de
primer orden**, no como calibración metrológica absoluta. La calibración de Zhang que eliminaría ese
± 30 % está especificada y pendiente (ADR-015 B1, § 8).

Aun con esa cautela, la posición es defendible frente a la práctica dominante: **reportar un error
imperfecto es metodológicamente superior a no reportar ninguno.**

### 4.3 Segmentación y contorno

MAO Plus ofrece cuatro modos de detección —automático, manual por área (ROI), asistido por IA, y
manual por componente—, pero la decisión arquitectónica clave (ADR-012, «detección monolítica») es
que los cuatro comparten **un único núcleo canónico de segmentación** en OpenCV. Los modos son
*priors* complementarios (una región de interés, una semilla neuronal), nunca reimplementaciones
paralelas del algoritmo. La consecuencia metodológica es directa: **el modo de interacción no cambia
el objeto medido.**

El núcleo encadena barrido de color en Z (*Z-scan*), ecualización adaptativa CLAHE, GrabCut,
separación de piezas en contacto por *watershed*, y estimación de confianza por objeto. Sobre esa
máscara, la extracción de contorno aplica: detección del color de fondo, umbralización (blancos
absolutos u Otsu adaptativo según el fondo), operaciones morfológicas, `findContours` con
`CHAIN_APPROX_NONE`, **refinamiento sub-píxel** (`cornerSubPix` con ajuste sensible a textura),
simplificación Douglas-Peucker y validación geométrica con Shapely.

**Cifra de referencia:** error de contorno del orden de **0.15 px**, con desviación de área **< 0.3 %**
frente a fixtures sintéticas de geometría conocida. Esto independiza la fidelidad del trazo tanto de
la resolución discreta del sensor como del pulso del operador.

Dos precisiones de honestidad metodológica:
- **ADR-013** estableció como premisa que el problema primario es **figura-fondo** (MAO mide *un*
  objeto) y la individualización de instancias es subordinada. El diagnóstico surgió de un caso real
  en que el *watershed* sobre una máscara Otsu sucia fragmentó una pieza en ocho; la corrección
  (limpieza de la máscara de siembra antes de sembrar) llevó el caso de 8 → 1.
- La **replicabilidad estricta del contorno** (fase F2 de ADR-013) está aprobada pero **no
  implementada**: GrabCut es no determinista y la estimación de fondo desde el recorte introduce
  variabilidad. Es una limitación conocida y declarada (§ 8).

### 4.4 Descriptores de forma: EFA

Depurada la contingencia óptica y estabilizado el trazo, la descripción de forma corre por
**Análisis Elíptico de Fourier** (Kuhl & Giardina 1982), con 20 armónicos por defecto —estándar en
morfometría arqueológica, ≈ 99 % de la varianza— y mínimo de 8 puntos para estabilidad.

La normalización aplica cuatro invariancias: **traslación** (centrado), **escala** (normalización al
primer armónico), **rotación** (alineación al semieje mayor del primer armónico) y **reflexión**
(activa por defecto para comparación inter-colección). El resultado son descriptores **invariantes a
transformaciones de similaridad**.

**Precisión técnica que hay que sostener ante un revisor:** la invariancia es **de similaridad**, no
**afín**. EFA no cubre *shear* ni escala no uniforme. Formularlo como «invariancia afín» es un error
que un revisor competente detectará.

**Envelope de validez de la orientación canónica (resultado interno, 2026-07-03).** La rotación
canónica ψ₁ es fiable solo cuando el contorno tiene un eje de elongación dominante. El predictor de
riesgo es la relación de ejes del primer armónico: valores > ~0.97 señalan inestabilidad. Lo que
rompe la orientación no es la casi-circularidad *per se* sino la **simetría rotacional**. La
invariancia rígida verificada es exacta al orden de 1e-14, y la correlación de rango con distancias
procrustianas fue ρ_Spearman ≈ 0.90. Este es un límite del método, medido y documentado, no una
sorpresa latente.

### 4.5 Repertorio métrico

El motor calcula ~55 indicadores agrupados en 30 familias: básicas (área, perímetro, centroide,
bounding box), forma (circularidad, compacidad, rectangularidad, elongación, solidez), convexidad
(hull, pérdida por fragmentación), ejes (excentricidad, ejes mayor/menor y orientación por tensor de
inercia de área), avanzadas (simetría bilateral, curvatura de Menger, rugosidad, diámetros de Feret,
radios extremos), índices derivados (estrellamiento, lobularidad, energía de curvatura), ángulos
internos en vértices simplificados y textura (varianza tonal, entropía de histograma, gradiente
Sobel, GLCM).

De ese conjunto, el registro canónico (§ 3.1) marca el **subconjunto homólogo** —invariante y
adimensional— que es el único legítimo para comparar 2D con 3D.

### 4.6 Perforaciones y horadaciones

ADR-009 elevó la detección de perforaciones y horadaciones de tarea manual secundaria a **tarea
primaria del análisis**. El backend detecta huecos internos **sin semillas** durante la extracción de
contorno, combinando dos señales sobre la silueta rellena: interior clasificado como fondo, y
desviación de color respecto de la mediana del cuerpo (que captura huecos pasantes grises y recesos
en sombra invisibles a un umbral de blancos).

La decisión metodológica es deliberadamente conservadora y merece énfasis en la ponencia: los
huecos se surgen como **candidatos a confirmar**, no como hallazgos. **No alteran ninguna métrica
hasta que el investigador los confirma**, y nacen **sin tipo asignado**, porque la distinción entre
perforación (pasante) y horadación (ciega) **no es observable en una imagen 2D**. El área neta solo
descuenta P/H confirmadas. Es la instanciación exacta de «la detección propone, el investigador
decide».

### 4.7 Entorno 3D y homologación

La misma lógica de formalización canónica se extiende a mallas poligonales, evitando la dependencia
de programas externos de modelado. El pipeline `obj3d_v2` resuelve la **subjetividad de la
orientación** en cuatro pasos: segmentación de superficies regulares por curvatura y coherencia de
normales → identificación de caras candidatas (pares opuestos) → **normalización espacial según las
caras detectadas** → PCA *contextualizado* sobre la cara definitiva (PCA global solo como recurso de
reserva). Sobre esa pose se proyectan hiperplanos de corte perpendiculares a los ejes principales,
cuyos perfiles alimentan la misma descomposición de Fourier del entorno 2D, con idéntica
normalización canónica del primer armónico.

**Precisión que corrige un error frecuente en borradores previos:** la pose canónica **no** se obtiene
por autovectores del tensor de inercia. El código lo declara explícitamente («NO según PCA global»);
el tensor de inercia se usa solo para la elongación de secciones 2D.

Bajo este protocolo único se extraen, de forma homóloga entre anverso y reverso, el índice de
coherencia morfométrica inter-cara, la energía de curvatura y las métricas volumétricas de
perforaciones (balance de área sólida frente a vacía, número de perforaciones reales, y verificación
de si su eje atraviesa el centro de masa, `passes_through_com`).

**Este es el segundo diferenciador:** el mismo estándar metrológico describe ambas caras y ambas
dimensionalidades, con el registro canónico garantizando que solo se compare lo comparable.

### 4.8 Clasificación tipológica

La clasificación combina un árbol de reglas sobre métricas morfométricas con evidencia EFA, y
devuelve tipo, subtipo, confianza ∈ [0,1] y el conjunto de evidencias que sostienen la decisión.
Es un apoyo a la asignación, no un sustituto: el resultado se presenta con su confianza y sus
evidencias precisamente para que sea impugnable.

Un episodio interno de 2026-07-31 vale como lección metodológica presentable: no existía **ninguna
medida de exactitud** del reconocimiento de forma. Construir un banco de verdad conocida reveló tres
causas de fondo (índices calculados sobre el *convex hull*, ciegos a puntas y lóbulos; bounding box
alineado a ejes, no invariante a rotación; orden del árbol de decisión) y, sobre todo, que la etapa
final de presentación descartaba el resultado correcto del backend. La exactitud medida pasó de
**38 % a 83 %** sobre ese banco. La moraleja para la ponencia: *lo que no se mide, no está bien; y
un motor correcto puede quedar anulado por su capa de salida.*

### 4.9 Salidas e interoperabilidad

Los descriptores de Fourier funcionan como **firmas morfométricas estables, ligeras e invariantes**:
etiquetas numéricas que registran la forma de manufactura y **reducen** —no eliminan— el ruido
taxonómico inter-observador, puesto que la asignación tipológica sigue siendo humana.

Las salidas son abiertas: CSV, JSON, informe PDF con índice canónico, y **dataset COCO** (ADR-014)
con recortes PNG por objeto y las métricas MAO embebidas como `mao_attributes` en cada anotación,
apto como *ground truth* de alta fidelidad para entrenar modelos de aprendizaje automático. El
proyecto se distribuye bajo licencia MIT. La aspiración —explícitamente **prospectiva**, no
realizada— es que esta arquitectura sostenga una infraestructura de datos abierta e interoperable
que disuelva el aislamiento de las colecciones locales.

---

## 5. Flujo de trabajo del investigador

La interfaz se organiza en cuatro pestañas que son las cuatro fases del método (arquitectura LAAR),
con **guardas de prerrequisito**: no se accede a una fase cuyo insumo no existe.

| Fase | Qué hace el investigador | Qué garantiza el sistema |
|---|---|---|
| **Proyecto** | Identificación arqueológica, modo de flujo (2D/3D, mono/bifacial) | Identificador canónico, estado persistente |
| **Captura** | Carga la imagen o malla, fija escala, detecta objetos | Escala validada, contrato de detección, confianza por objeto |
| **Análisis** | Revisa contorno, confirma P/H, ejecuta la morfometría | Núcleo único de cálculo, presupuesto de incertidumbre, triage por confianza |
| **Resultados** | Compara, explora morfoespacio, exporta | Taxonomía canónica idéntica en las cuatro salidas |

La **confianza por objeto** atraviesa todo el flujo (ADR-007/008): se calcula en la detección, se
hereda al analizar, se muestra como distintivo cromático, permite ordenar y filtrar («solo baja
confianza» como herramienta de triage), y se exporta como columna en el CSV. El investigador puede
así concentrar su revisión donde el sistema declara menos certeza — que es exactamente donde debe
concentrarla.

---

## 6. Verificación y aseguramiento de calidad

MAO Plus se desarrolla bajo un régimen de decisiones documentadas (16 decisiones de arquitectura, ADR-001…ADR-016, con
`docs/ESTADO-ADRS.md` como índice único y autoritativo del estado real de implementación frente al
declarado) y verificación por pruebas automatizadas.

**Cobertura actual (medida en este repositorio):** **329 funciones de prueba** distribuidas en 28
archivos (`tests/` y `python/tests/`). Las últimas ejecuciones registradas en los ADR reportan del
orden de **300–347 pruebas superadas con 2 omitidas** según el corte; *esta redacción no re-ejecutó
la suite*.

Categorías de prueba con valor metodológico:

- **Contratos** (`test_morphometric_registry.py`, `test_coherencia_entrega.py`, `test_window_contracts.js`)
  — verifican que el repertorio canónico y las salidas no diverjan. `test_coherencia_entrega.py`
  encontró por sí solo dos incoherencias reales del informe.
- **Estándar matemático** (`test_estandar_matematico.py`) y **paridad** (`test_paridad_3d.py`,
  `test_bifacial_parity*.py`) — comparan el motor contra implementaciones de referencia.
- **Robustez** (`test_robustez_motor.py`, 24 pruebas) — verifica que la geometría degenerada
  (colineal, minúscula, enorme, casi-duplicada, < 3 puntos) nunca produzca *crash* ni propague
  NaN/Inf a través de métricas, EFA, escala, P/H y clasificador.
- **Bajo contraste** (`test_bajo_contraste.py`) — el caso adverso real del registro fotográfico.

**Una lección de método que conviene presentar.** Un hallazgo recurrente del proyecto es que la
verificación estática es **necesaria pero insuficiente**: un chequeo de sintaxis sobre un archivo
`.js` no detecta redeclaraciones que el motor del navegador sí rechaza en modo estricto, y ni la
comprobación sintáctica ni el *health check* del backend ven un problema de disposición visual. Cada
capa de error exige su propio instrumento de verificación. Es un argumento generalizable a cualquier
software científico: **la validez del cálculo y la validez de su presentación son propiedades
distintas y hay que verificarlas por separado** (cf. el episodio de § 4.8, donde el motor acertaba y
la salida descartaba el acierto).

---

## 7. Posicionamiento frente al estado del arte

| Criterio | Práctica de referencia (Momocs, SHAPE, ImageJ + R) | MAO Plus |
|---|---|---|
| Descriptores EFA normalizados | ✅ maduro | ✅ equivalente (Kuhl & Giardina, 20 armónicos) |
| Morfoespacio PCA/CVA | ✅ integrado (R/Momocs) | 🟡 PCA presente; CVA y morfoespacio in-app pendientes (ADR-015 C1) |
| GM por landmarks | ✅ (geomorph, MorphoJ) | ⏸ fuera del paradigma; diferido |
| Extracción de contorno integrada | 🟡 requiere cadena externa | ✅ integrada, sub-píxel (~0.15 px) |
| **Presupuesto de error óptico por medición** | ❌ ausente | ✅ **implementado** (no calibrado, ± 30 %) |
| **Homología canónica 2D↔3D** | ❌ ausente o ad hoc | ✅ **registro canónico + pose por caras** |
| Validación empírica publicada | ✅ literatura consolidada | ❌ **pendiente** (ADR-015 F1) |
| Exportación para ML | 🟡 parcial | ✅ COCO + métricas embebidas |

**Lectura honesta del cuadro.** MAO Plus cumple el estándar científico **de motor**, y va por delante
en dos criterios que la literatura de referencia sencillamente no aborda: el presupuesto de error
óptico por medición y la homología canónica entre dimensionalidades. Sus brechas son de otra
naturaleza: **(1) de certificación** —la validación empírica no está publicada— y **(2) de
profundización matemática** —modelo óptico sin calibrar, presupuesto de error incompleto,
morfoespacio parcialmente externalizado, simetría bilateral tratada por diferencia de métricas en
lugar de descomposición formal.

Esta distinción es estratégicamente decisiva para una ponencia: **las brechas no son de capacidad,
son de demostración**, y el plan para cerrarlas está especificado y es aditivo (§ 8).

---

## 8. Limitaciones declaradas y trabajo pendiente

Presentar estas limitaciones **explícitamente** fortalece la ponencia: son las preguntas que un
revisor formulará, y llegar con la respuesta ya formulada es mejor que improvisarla.

### Limitaciones vigentes

1. **Modelo óptico no calibrado.** `k₁` se estima por tabla empírica según campo de visión, no por
   calibración de lente. Incertidumbre declarada del modelo: ± 30 %. Es un presupuesto de primer
   orden.
2. **Presupuesto de error incompleto.** Faltan dos términos: relieve/paralaje (el objeto no es plano)
   y propagación de la incertidumbre de la propia escala. El presupuesto completo debería componer
   tres fuentes en cuadratura.
3. **Replicabilidad estricta del contorno.** GrabCut es no determinista y la estimación del fondo
   depende del recorte; ADR-013 F2 lo especifica pero no está implementado.
4. **Simetría bilateral por diferencia de métricas**, no por descomposición formal simétrico/
   asimétrico (Klingenberg).
5. **Sin validación empírica publicada:** ni exactitud contra dimensiones conocidas, ni
   reproducibilidad inter/intra-observador.
6. **Límites del 3D:** mallas no *watertight* y superficies fractales degradan las métricas
   volumétricas; la pose canónica no es robusta a todos los casos.
7. **Alcance de distribución:** macOS arm64, firma ad-hoc, sin notarización. El repositorio aún no
   es público.
8. **Deuda estructural del frontend:** `analysis-core.js` concentra ~52 000 líneas y la verificación
   del frontend es contractual/estática, no funcional; no hay integración continua.

### Plan de cierre (ADR-015, aditivo y verificado por pruebas)

| Fase | Mejoras | Qué desbloquea |
|---|---|---|
| **F1 — Certificación** | A1 exactitud (Bland-Altman, límites de acuerdo) · A2 reproducibilidad (ICC) · C3 cuantificación de estandarización (CV + *bootstrap*) | Convierte «motor a nivel de estándar» en «estándar demostrado». **Habilita la publicación.** |
| **F2 — Núcleo** | B1 calibración de Zhang (elimina el ± 30 %) · B2 término de relieve · B3 propagación de escala · D1 simetría de Klingenberg · D3 corte de armónicos por varianza | Completa y calibra el presupuesto de incertidumbre; eleva el bifacial |
| **F3 — Analítica** | C1 morfoespacio PCA/CVA integrado · C2 selección de métricas independientes (VIF) · D2 pose 3D robusta | Elimina la dependencia de R/Momocs |
| **F4 — Paradigma** | E1 GM por landmarks | Opcional; solo si se decide competir en ese paradigma |

**Nota de coherencia técnica:** casi todo es aditivo sobre lo existente. La varianza explicada ya se
calcula (D3), el conjunto métrico ya está (C1/C2), el módulo óptico ya está (B1/B2/B3). No hay
reescrituras de riesgo; hay profundización.

---

## 9. Traducción a ponencia

### 9.1 Tesis única

> **La incertidumbre de una medida morfométrica es parte de la medida.** MAO Plus demuestra que es
> técnicamente viable integrar, en una sola herramienta de dominio, la estabilización sub-píxel del
> contorno, la cuantificación explícita del error óptico por objeto y la homologación canónica entre
> 2D y 3D — sin desplazar la agencia interpretativa del arqueólogo.

Si la audiencia retiene una sola frase, debe ser: **la detección propone, el investigador decide.**

### 9.2 Títulos candidatos

1. *De la fragmentación al protocolo unificado: MAO Plus como herramienta de morfometría de contorno
   integrada para la reducción de incertidumbre y la formalización canónica en 2D y 3D.*
   (Completo, apto para actas.)
2. *Medir con el error a la vista: presupuesto de incertidumbre óptica y homología canónica 2D↔3D en
   morfometría arqueológica de contorno.* (Más punzante, apto para presentación oral.)
3. *La detección propone, el investigador decide: diseño de un instrumento morfométrico que no
   sustituye el juicio experto.* (Si el foro es más metodológico/epistemológico que técnico.)

### 9.3 Guion para 20 minutos

| Bloque | Min | Contenido | Apoyo visual |
|---|---|---|---|
| 1. Problema | 0–3 | Fragmentación operativa → tres incertidumbres (§ 1). Abrir con la cadena real de programas que hoy exige un análisis | Diagrama de la cadena fragmentada vs. la integrada |
| 2. Premisa | 3–5 | Conservación del dato como garantía científica; el instrumento no interpreta (§ 1, § 2) | Cita de la premisa a pantalla completa |
| 3. Método 2D | 5–11 | Escala → **auditoría óptica** → contorno sub-píxel → EFA (§ 4.1–4.4). **Aquí está el diferenciador: dedicarle tiempo** | Mapa de error óptico según posición en el encuadre; contorno superpuesto con acercamiento sub-píxel |
| 4. P/H y decisión humana | 11–13 | Candidatos a confirmar, sin tipo asignado; el área neta solo cuenta lo confirmado (§ 4.6) | Captura del modal: candidato ámbar discontinuo → confirmado |
| 5. Homología 3D | 13–16 | Pose canónica por caras detectadas → cortes → mismo EFA → registro canónico (§ 4.7, § 3.1) | Secuencia malla → pose → planos de corte → perfiles |
| 6. Salidas | 16–18 | Firmas morfométricas, taxonomía única en 4 salidas, COCO para ML, MIT (§ 4.9) | Fragmento del manifiesto de categorías + anotación COCO |
| 7. Límites y plan | 18–20 | Decir el ± 30 % y el pendiente de validación **antes** de que lo pregunten; cerrar con F1 (§ 8) | Tabla de posicionamiento (§ 7) con las dos ✅ y la ❌ resaltadas |

### 9.4 Afirmaciones defendibles y sus formulaciones prohibidas

Esta tabla es de uso directo al redactar: la columna izquierda es lo que **no** debe escribirse.

| ❌ No decir | ✅ Decir |
|---|---|
| «invariancia afín» | «invariancia a transformaciones de **similaridad**» (EFA no cubre *shear* ni escala no uniforme) |
| «morfometría geométrica» | «morfometría **de contorno** basada en Fourier» (GM *stricto sensu* = landmarks) |
| «reduce la fatiga de digitalizar landmarks» | «**prescinde** de landmarks: elimina esa fuente de error» |
| «acota la incertidumbre a < 0.5 %» | «< 0.5 % en piezas centradas; crece hacia los bordes; el modelo declara ± 30 %» |
| «elimina el ruido taxonómico inter-observador» | «**reduce** el ruido; la tipología sigue siendo humana» |
| «pose canónica por tensor de inercia» | «pose por **detección de caras** + PCA contextual» |
| «mide la coaxialidad 3D de las perforaciones» | «balance de área sólida/vacía, nº de perforaciones, y si el eje atraviesa el centro de masa» |
| «infraestructura de datos abiertos» (presente) | «arquitectura **orientada a** una infraestructura abierta» (prospectivo: el repositorio no es público) |
| «detecta perforaciones automáticamente» | «propone **candidatos a confirmar**, sin tipo asignado; no alteran métricas hasta confirmarse» |

### 9.5 Preguntas previsibles del auditorio

- **«¿Cómo sé que sus medidas son exactas?»** → Reconocer de frente: la validación empírica es la
  brecha declarada (§ 8) y es la fase F1 en curso, con protocolo ya especificado (Bland-Altman para
  exactitud, ICC para reproducibilidad). Ofrecer entretanto la evidencia disponible: error de
  contorno ~0.15 px y < 0.3 % de área sobre geometría sintética conocida, más 329 pruebas
  automatizadas, incluida verificación de robustez ante geometría degenerada.
- **«¿Por qué no landmarks?»** → Son paradigmas complementarios. El contorno cerrado describe piezas
  donde no hay homología puntual defendible (lascas, cuentas, fragmentos) — que es precisamente el
  material problemático. E1 (landmarks) está contemplado como extensión opcional.
- **«Si el modelo óptico tiene ± 30 %, ¿para qué sirve?»** → Un presupuesto de error declarado, aun
  imperfecto, es metodológicamente superior a un error no declarado. Y la calibración de Zhang que
  lo elimina está especificada (B1), no es un problema abierto.
- **«¿Esto reemplaza al arqueólogo?»** → No, por diseño verificable, no por retórica: los candidatos
  de P/H nacen sin tipo y no alteran métrica alguna hasta que un humano los confirma; la
  clasificación entrega confianza y evidencias para ser impugnada; la confianza por objeto existe
  para dirigir la revisión humana.
- **«¿Está disponible?»** → Licencia MIT; publicación del repositorio prospectiva; distribución
  actual limitada a macOS arm64.

### 9.6 Articulación con el caso de estudio

**Advertencia estratégica.** Este documento sostiene el **eje instrumental** (el motor). La
validación empírica exigible en revisión por pares —exactitud contra dimensiones conocidas y
reproducibilidad inter-observador— la aporta el **caso de estudio de los ornamentos de La Draga**,
en el marco de la colaboración con la Universitat Autònoma de Barcelona. Ambos ejes deben
presentarse **articulados**, no como discursos paralelos: el instrumento y su validación aplicada.
Una ponencia que exponga solo el motor invitará precisamente a la objeción de § 9.5-1.

---

## 10. Ficha técnica

| Campo | Valor |
|---|---|
| Nombre | MAO Plus — Morfometría Arqueológica de Objetos |
| Versión | 1.2.0 (paquete) / v2.1 (denominación científica) |
| Autoría | Quipus / Juan Francisco Ramírez |
| Licencia | MIT |
| Plataforma | Aplicación de escritorio Electron (macOS arm64) |
| Backend | FastAPI · Python 3.9 · 34 endpoints · puerto 8765 |
| Bibliotecas científicas | NumPy, OpenCV, SciPy, scikit-learn, Shapely |
| Volumen de código | ~101 000 líneas JS (48 archivos) · ~14 600 líneas Python (22 módulos) |
| Verificación | 329 funciones de prueba en 28 archivos (pytest + contratos JS) |
| Decisiones documentadas | 16 ADR (15 documentos en `docs/` + ADR-001 en `CLAUDE.md`) e índice consolidado de estado |
| Formatos de salida | CSV, JSON, PDF, COCO (dataset ML) |
| Entrada | JPG/RAW (EXIF, modo híbrido) · mallas `.obj` |

### Referencias externas de método

- Kuhl, F. P. & Giardina, C. R. (1982). Elliptic Fourier features of a closed contour.
  *Computer Graphics and Image Processing*, 18(3), 236–258. — Base del módulo EFA.
- Zhang, Z. (2000). A flexible new technique for camera calibration. *IEEE TPAMI*, 22(11).
  — Método previsto para B1 (calibración óptica).
- Klingenberg, C. P. et al. — Descomposición simétrico/asimétrico. Método previsto para D1.
- Rother, C., Kolmogorov, V. & Blake, A. (2004). GrabCut. — Empleado en el núcleo de segmentación.
- Bland, J. M. & Altman, D. G. (1986). — Protocolo previsto para A1 (exactitud).

---

*Documento vivo. Actualizar al cerrar cada fase de ADR-015 (§ 8), especialmente F1: su cierre*
*convierte las afirmaciones prospectivas de la § 7 en afirmaciones demostradas.*
