# ADR-022 — «Detección asistida»: retirar la sigla IA

**Fecha:** 2026-09-19 · **Estado:** Implementado · **Decisión:** JFRR — nombre elegido entre
cuatro propuestas (detección asistida · paramétrica · guiada · con revisión)

## Contexto

El modo de detección en que el operador fija los parámetros y revisa objeto a objeto se
rotulaba «IA», y con cinco variantes más: «MAO IA», «MAO_IA», «AIA», «Analizar con IA» y
«Análisis IA». La sigla tenía **tres lecturas incompatibles**:

| Dónde | Lectura |
|---|---|
| `GUIA_METRICAS_MAO.html`, `PRINCIPIOS_MORFOMETRIA_MAO.html` (hasta ADR-018) | «inteligencia artificial» |
| ADR-018 (convención `sigla_ia`) | «Identificación Automatizada» |
| Su autor (JFRR, 2026-09-18) | «Imagen Asistida» |

ADR-018 intentó cerrar el problema **redefiniendo** la sigla. No bastó: un lector
hispanohablante lee «IA» como inteligencia artificial antes de llegar a la nota que dice lo
contrario, y el error cuesta caro en una herramienta científica, porque atribuye a un modelo
estadístico mediciones que produjo la umbralización clásica y siembra desconfianza sobre
resultados tan deterministas como los del modo automático.

### Lo que el inventario encontró (2026-09-18)

La sigla no nombraba una cosa sino **cinco**, y en la aplicación vigente **ninguna usa un
modelo entrenado**:

| Rótulo | Qué es en realidad | Dónde |
|---|---|---|
| «Analizar con IA», «Análisis IA», «MAO_IA — Análisis Morfológico» | Detección con parámetros del operador: CLAHE, umbral Otsu/adaptativo/manual + watershed, o el núcleo `auto` de ADR-012 | `mao_ia_analyzer.detect_with_mao_ia` |
| «✦ Detección IA Auto», «Perfil IA» | Crecimiento de regiones desde una malla de semillas (P/H) | `detectarPhAutomatico` → `/api/ph/detect-auto` |
| «Tipología Arqueológica — IA Fase 2» | Clasificador por reglas morfométricas con evidencia EFA, sin datos de entrenamiento | `python/modules/classifier.py` |
| «GrabCut AI» | Corte de grafos sobre mezclas gaussianas (Rother, Kolmogorov y Blake, 2004) | `sam_segmenter.py` |
| «SEGMENTACIÓN IA», con la leyenda «usado por Analizar con IA» | Segmentador opcional (MobileSAM o GrabCut) **que ningún modo invoca**: la única función que lo llamaría, `analizarObjetoConIA`, no tiene llamadores | `/api/sam-contour` |

El único componente neuronal del repositorio es **MobileSAM**, y está desconectado de todo
flujo de detección.

La confusión ya había producido **errores de contenido**, no solo de nombre:

- `PRINCIPIOS_MORFOMETRIA_MAO.html` §XV describía el flujo como «Segmentación por modelo
  SAM/YOLO — máscara de alta precisión» y dedicaba una subsección a las ventajas de SAM.
- `FORMULAS_METRICAS_MAO.html` presentaba esos objetos como segmentados por SAM
  (`_samSegmented = true`, una marca de nombre engañoso).
- `GUIA_METRICAS_MAO.html` mandaba al usuario a un «botón AIA» que no existe y afirmaba que la
  detección automática «procesa un único objeto por ejecución» (detecta hasta 50).
- `ARCHITECTURE.md`: `detection.py` «YOLO integration» (rama retirada el 2026-06-12) y
  `mao_ia_analyzer.py` «MAO-IA model integration».
- El glosario decía que los modos se diferencian en «un rectángulo, un clic, o una máscara
  neuronal», y un comentario de `mao-ia.js`, que el contorno era «definitivo (red neuronal)».

## Decisión

1. **El modo se llama «detección asistida».** Ocupa el punto intermedio de una escala de
   intervención del operador:

   | Modo | Qué aporta el operador |
   |---|---|
   | automática | nada |
   | **asistida** | los parámetros de umbralización, un encuadre opcional y la revisión objeto a objeto (confianza, refinamiento, selección) |
   | manual (de área o por componente) | el encuadre o el clic sobre cada pieza |

   *Asistida* describe la participación del operador, no una asistencia por inteligencia
   artificial. Conserva el sentido que su autor le daba («Imagen Asistida») sin la sigla.

2. **La sigla se retira** —«IA», «AIA», «MAO IA», «MAO_IA»— de todo lo que lee una persona.
   Solo puede aparecer **citada entre comillas angulares** («IA») para explicar la historia.

3. **«Inteligencia artificial» se reserva para un modelo entrenado, y nombrándolo.** Hoy solo
   MobileSAM lo es; se rotula «MobileSAM (red neuronal)». GrabCut pasa a «GrabCut (clásico)».

4. **Los identificadores internos conservan el nombre histórico**: `mao-ia.js`,
   `mao_ia_analyzer.py`, la ruta `/api/mao-ia`, los ids `maoIa*` y `stepIA`, el enum `ia`
   (`detection_method`, `analysis_source`), las claves `ia_*` y `mao_ia`, y las marcas
   `_fromIA` y `_samSegmented`. Están persistidos en los proyectos guardados o son el contrato
   entre frontend y backend; renombrarlos exigiría migrar datos sin ninguna ganancia visible.
   Es el mismo criterio que ADR-018 aplicó a `_isAIA`. Donde el nombre engaña, un comentario
   lo aclara en el punto de definición.

5. **Las otras cosas rotuladas «IA» se nombran por lo que son** (tabla de abajo). Además,
   «Tipología asistida por clasificador EFA» pasa a «Tipología *sugerida* por el clasificador
   EFA», para que *asistida* signifique siempre lo mismo: intervención del operador.

## Superficies

| Superficie | Antes | Ahora |
|---|---|---|
| Stepper de Captura | insignia «IA» · «Análisis IA» · botón «Analizar con IA» | número del paso (contador CSS) · «Detección asistida» · botón «Abrir…» |
| Cabecera de la ventana | «MAO_IA — Análisis Morfológico» | «Detección asistida» · «Parámetros fijados por el operador · revisión objeto a objeto · visión computacional clásica (OpenCV)» |
| Indicador de progreso | «Analizando con IA...» | «Detectando y midiendo objetos…» |
| Informe/CSV › Método de detección | «IA — Identificación Automatizada (segmentación asistida)» | «Detección asistida (parámetros fijados por el operador)» |
| CSV › Detección (columna) | «Umbralización (modo IA)» | «Umbralización (detección asistida)» |
| CSV › Detección (columna) | «Enriquecido por IA» | «Descriptores precalculados (detección asistida)» |
| PDF integral y bifacial (fila) | «Umbralización (modo IA)» | «Umbralización (detección asistida)» |
| Valor de `ia_segmentador` | «Umbralización IA (otsu)» | «Umbralización OpenCV (otsu) + watershed» |
| Valor de `analysis_method` en análisis nuevos | «MAO IA — Detección automática» | «Detección asistida» |
| CSV de colección › `Método_detección` | enum crudo (`ia`) | rótulo legible |
| CSV exportado desde la ventana | `MAO_IA_resultados.csv` | `MAO_deteccion_asistida.csv` |
| TPS exportado desde la ventana | `ID=IA_OBJ_n` · `COMMENT=MAO Plus IA semi-landmarks…` | `ID=OBJ_n` · `COMMENT=MAO Plus semi-landmarks (longitud de arco) - deteccion asistida` |
| Tabla Completa, tipología | «Tipología Arqueológica — IA Fase 2» | «Tipología Arqueológica — clasificador por reglas» |
| Forma idealizada sin nombre | «Contorno IA» · «— (contorno IA)» | «Contorno real» · «— (sin depuración estadística)», la misma marca que ya usa la rama sin análisis JS |
| Avisos de la colección | «Actualizando métricas del análisis AIA…» | «Actualizando métricas de la detección asistida…» |
| Comparador › método | «IA / SAM» | «Detección asistida» |
| P/H | «✦ Detección IA Auto» · «Perfil IA» | «⊞ Detección por malla» (en paralelo con «◎ Detección por punto») · «Perfil de tamaño» |
| Panel del segmentador | «SEGMENTACIÓN IA: GrabCut AI», «usado por Analizar con IA» | «Segmentador opcional: GrabCut (clásico) / MobileSAM (red neuronal)», y el aviso de que ningún modo lo usa |
| `/api/sam/status` › `mode` | `grabcut_ai` | `grabcut` |

## Compatibilidad

- **Análisis guardados.** `fuenteAnalisis()` resuelve a `ia` tanto «MAO IA — Detección
  automática» como «Detección asistida», y `metodoLegible()` rotula con el nombre vigente los
  valores crudos históricos («MAO IA», `mao_ia`). Nada compara contra las cadenas antiguas.
- **CSV.** Cambia el nombre de dos columnas de la sección «Detección». ADR-011 congeló los
  nombres de **sección**, no estas filas, que introdujo ADR-019 (entonces numerado ADR-017) el
  2026-07-31. Un script que las lea por nombre debe actualizarse según la tabla de arriba.
- **API.** `/api/mao-ia` no cambia. `/api/sam/status` devuelve `mode: "grabcut"` en vez de
  `"grabcut_ai"`; ningún lector compara ese valor (el frontend solo mira `mobilesam_onnx`).

## Enforcement

- **`python/tests/test_terminologia_deteccion_asistida.py`** (6 pruebas). Recorre el texto
  visible de `index.html` (nodos, `title`, `placeholder`, `aria-label`, `alt` y las cadenas de
  sus `<script>`), **todas** las cadenas de `js/` —con un léxico mínimo que distingue
  comentarios, plantillas anidadas y expresiones regulares—, las cadenas de Python que no son
  docstrings, y las guías y el glosario generado. Regla única: las formas retiradas no pueden
  aparecer **usadas**; citadas entre comillas angulares, sí. Una prueba positiva exige que la
  interfaz nombre el modo, porque un rótulo borrado también pasaría la negativa.
- **`test_glosario.py`**: las pruebas 8 y 9 de ADR-018 se reescriben (la sigla se declara
  retirada; el rótulo del modo no la usa) y el guard de convenciones suma
  `deteccion_asistida` e `inteligencia_artificial`.
- **`test_procedencia_analisis.py`**: la cadena vigente también resuelve a `ia`.

Los **comentarios de código no se vigilan**: documentan la historia del cambio, y un
comentario que diga «antes “IA”» es útil.

## Documentos

- **Vigentes, reescritos:** las tres guías (`GUIA` §3 y preguntas frecuentes, `PRINCIPIOS`
  §XV, `FORMULAS`), el glosario generado, `MEMORIA-MATEMATICA-MAO-PLUS.md`,
  `ARCHITECTURE.md`, `README_DEVELOPMENT.md`, `COHERENCIA-MODULOS.md`, `ESTADO-ADRS.md` y
  `CLAUDE.md`.
- **Registros, anotados y no reescritos:** los ADR anteriores, las auditorías, las notas de
  versión y el inventario F0 del glosario registran lo que se decidió y cómo se llamaba
  entonces; citan decisiones y preguntas del autor con sus palabras. Cada uno lleva al
  principio una nota terminológica que remite aquí.
- **ADR-018:** su convención de la sigla queda marcada como sustituida.

## Fuera de alcance (registrado)

1. **Código muerto de MobileSAM.** `analizarObjetoConIA` no tiene llamadores, y el panel
   «Segmentador opcional» prepara un modelo que nada usa. Hay que decidir si se cablea o se
   retira; mientras tanto, el panel dice la verdad.
2. **Procedencia de los objetos refinados.** El panel de refinamiento de la ventana
   («Re-detectar contorno») reemplaza el objeto por uno sin `ia_threshold_method`,
   `ia_segmentador` ni `ia_params`, así que el CSV dice «Sin datos» en esas filas para las
   piezas refinadas.
3. **Renombrar los identificadores internos** exigiría migrar proyectos guardados; no lo
   justifica ninguna ganancia visible.

## Reversibilidad

Total. Son rótulos, textos y dos nombres de columna del CSV. Revertir el commit restaura los
anteriores, y los análisis guardados con cualquiera de las dos versiones se siguen leyendo,
porque la procedencia se deriva del enum y la derivación por texto reconoce ambas cadenas.
