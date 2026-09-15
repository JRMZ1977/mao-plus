/**
 * DETECTION SECTION — contenido canónico de la sección «I. Detección del Objeto»
 * ============================================================================
 * ADR-017. Fuente ÚNICA de QUÉ filas componen la sección de procedencia de
 * detección. Las superficies (panel, Tabla Completa → PDF, CSV, PDF batch, PDF
 * integral, PDF bifacial) piden aquí los pares etiqueta/valor y los pintan cada
 * una con su propio estilo.
 *
 * Se separa el CONTENIDO del ESTILO a propósito: la lección de ADR-016 es que
 * cuando cada superficie escribe su propia lista de campos, un fix hay que
 * aplicarlo N veces y las superficies divergen en silencio (fue así como el
 * objeto IA acabó mostrando «N/A» sólo en el PDF).
 *
 * Sin dependencias, igual que category-manifest.js y metric-presenter.js.
 * ============================================================================
 */

/** Etiqueta legible para el enum canónico de `detectionMethod` (ADR-008). */
const METODO_LABEL = {
  automatic: 'Automático (núcleo OpenCV)',
  manual:    'Manual (área encuadrada por el operador)',
  // ADR-018: la sigla se expande en el rótulo. En MAO, IA = Identificación
  // Automatizada; sin desarrollarla, los informes se leían como «inteligencia
  // artificial» y atribuían a un modelo lo que resuelve la umbralización clásica.
  ia:        'IA — Identificación Automatizada (segmentación asistida)',
};

/** Rótulo humano del método, tolerante con los valores crudos legacy. */
export function metodoLegible(metricas) {
  const m = metricas || {};
  // ADR-016 #5: los objetos IA guardados antes del contrato ADR-007/008 traen la
  // clave como `detectionMethod` o `detection_mode` en su metricas.json.
  const canon = m.detection_method || m.detectionMethod || m.detection_mode;
  if (canon && METODO_LABEL[canon]) return METODO_LABEL[canon];
  if (canon) return String(canon);
  return null;
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
    ['Umbralización (modo IA)',  m.ia_threshold_method || null],
    ['Enriquecido por IA',       m.ia_enriquecido == null ? null : (m.ia_enriquecido ? 'Sí' : 'No')],
  ];

  const filas = crudas.map(([label, valor]) => ({
    label,
    valor: valor == null || valor === '' ? SIN : String(valor),
    sinDato: valor == null || valor === '',
  }));

  return omitirVacias ? filas.filter(f => !f.sinDato) : filas;
}

/**
 * Resumen de una línea para cabeceras y pies: «IA (segmentación asistida) · alta (0.986)».
 * Devuelve null si no hay ningún dato de procedencia.
 */
export function resumenDeteccion(metricas) {
  const met = metodoLegible(metricas);
  const conf = confianzaLegible(metricas);
  if (!met && !conf) return null;
  return [met, conf].filter(Boolean).join(' · ');
}
