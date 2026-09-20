/**
 * DETECTION SECTION — contenido canónico de la sección «I. Detección del Objeto»
 * ============================================================================
 * ADR-019. Fuente ÚNICA de QUÉ filas componen la sección de procedencia de
 * detección. Las superficies (panel, Tabla Completa → PDF, CSV, PDF batch, PDF
 * integral, PDF bifacial) piden aquí los pares etiqueta/valor y los pintan cada
 * una con su propio estilo.
 *
 * Se separa el CONTENIDO del ESTILO a propósito: la lección de ADR-016 es que
 * cuando cada superficie escribe su propia lista de campos, un fix hay que
 * aplicarlo N veces y las superficies divergen en silencio (fue así como el
 * objeto de detección asistida acabó mostrando «N/A» sólo en el PDF).
 *
 * Sin dependencias, igual que category-manifest.js y metric-presenter.js.
 * ============================================================================
 */

/** Etiqueta legible para el enum canónico de `detectionMethod` (ADR-008). */
const METODO_LABEL = {
  automatic: 'Automático (núcleo OpenCV)',
  manual:    'Manual (área encuadrada por el operador)',
  // ADR-022: el enum conserva su nombre histórico `ia` (lo usan los proyectos
  // guardados), pero el modo se llama «detección asistida». La sigla IA se
  // retiró: se leía como «inteligencia artificial» y atribuía a un modelo lo que
  // resuelve la umbralización clásica bajo control del operador.
  ia:        'Detección asistida (parámetros fijados por el operador)',
};

/**
 * Enum canónico a partir de un valor crudo. Los análisis antiguos pueden traer
 * el nombre histórico del modo asistido como texto («MAO IA», `mao_ia`); se
 * rotulan con el nombre vigente para que un proyecto viejo no devuelva la sigla
 * retirada al informe.
 */
function claveMetodo(canon) {
  if (METODO_LABEL[canon]) return canon;
  const s = String(canon).toLowerCase();
  if (s.indexOf('mao ia') !== -1 || s.indexOf('mao_ia') !== -1) return 'ia';
  return null;
}

/** Rótulo humano del método, tolerante con los valores crudos legacy. */
export function metodoLegible(metricas) {
  const m = metricas || {};
  // ADR-016 #5: los objetos de detección asistida guardados antes del contrato
  // ADR-007/008 traen la clave como `detectionMethod` o `detection_mode` en su
  // metricas.json.
  const canon = m.detection_method || m.detectionMethod || m.detection_mode;
  if (!canon) return null;
  const clave = claveMetodo(canon);
  return clave ? METODO_LABEL[clave] : String(canon);
}

/**
 * Confianza de detección formateada como «alta (0.986)».
 * OJO: es la confianza de DETECCIÓN (qué tan fiable es el recorte del objeto),
 * distinta de `forma_confianza`, que es la confianza de CLASIFICACIÓN de forma.
 * Confundirlas es un error de lectura real en informes previos.
 */
export function confianzaLegible(metricas) {
  const m = metricas || {};
  // `detection_confidence_level` es la clave legacy; sigue viva en análisis ya
  // guardados en disco, así que se acepta como respaldo.
  const nivel = m.confidence_level || m.detection_confidence_level || null;
  const score = m.detection_confidence;
  const hayScore = typeof score === 'number' && isFinite(score);
  if (!nivel && !hayScore) return null;
  if (nivel && hayScore) return `${nivel} (${Number(score).toFixed(3)})`;
  return nivel || Number(score).toFixed(3);
}

/**
 * Filas canónicas de la sección de detección.
 *
 * @param {Object} metricas - objeto de métricas del análisis
 * @param {Object} [opts]
 * @param {boolean} [opts.omitirVacias=false] - si true, descarta las filas sin dato.
 *   Por defecto se conservan con marcador «Sin datos», porque la categoría es
 *   `estructural` en el manifiesto: se rinde SIEMPRE (esqueleto estable, ADR-011).
 * @returns {{label:string, valor:string, sinDato:boolean}[]}
 */
export function filasDeteccion(metricas, opts) {
  const m = metricas || {};
  const omitirVacias = !!(opts && opts.omitirVacias);
  const SIN = 'Sin datos';

  const crudas = [
    ['Método de detección',      metodoLegible(m)],
    ['Confianza de detección',   confianzaLegible(m)],
    ['Modo crudo registrado',    m.detection_method_raw || null],
    ['Segmentador / motor',      m.ia_segmentador || null],
    // Las claves `ia_*` conservan el nombre histórico del modo (ADR-022); los
    // rótulos, no.
    ['Umbralización (detección asistida)',               m.ia_threshold_method || null],
    ['Descriptores precalculados (detección asistida)',  m.ia_enriquecido == null ? null : (m.ia_enriquecido ? 'Sí' : 'No')],
  ];

  const filas = crudas.map(([label, valor]) => ({
    label,
    valor: valor == null || valor === '' ? SIN : String(valor),
    sinDato: valor == null || valor === '',
  }));

  return omitirVacias ? filas.filter(f => !f.sinDato) : filas;
}

/**
 * Resumen de una línea para cabeceras y pies:
 * «Detección asistida (parámetros fijados por el operador) · alta (0.986)».
 * Devuelve null si no hay ningún dato de procedencia.
 */
export function resumenDeteccion(metricas) {
  const met = metodoLegible(metricas);
  const conf = confianzaLegible(metricas);
  if (!met && !conf) return null;
  return [met, conf].filter(Boolean).join(' · ');
}
