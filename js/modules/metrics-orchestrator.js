/**
 * METRICS ORCHESTRATOR MODULE
 *
 * Central orchestrator for comprehensive morphological metrics calculation.
 * Coordinates all metric calculation subsystems (geometry, morphometrics, shape classification).
 *
 * This module receives contour data, computes all 100+ metrics across multiple
 * analysis dimensions, and returns a complete metric dataset with uncertainty estimates.
 *
 * Dependencies:
 * - geometry-primitives.js (geometry calculations)
 * - contour-quality.js (contour analysis)
 * - morphometric-metrics.js (morphometric indicators)
 * - shape-classification.js (geometric classification)
 * - classification-engine.js (meta-classification and typology)
 * - utility-helpers.js (helper functions)
 *
 * High Risk: Central orchestrator with many dependencies. Maintains backward compatibility.
 */

import * as GP from './geometry-primitives.js';
import * as CQ from './contour-quality.js';
import * as MM from './morphometric-metrics.js';
import * as SC from './shape-classification.js';
import * as CE from './classification-engine.js';
import * as UH from './utility-helpers.js';
import { clasificarRugosidad } from './metric-presenter.js';  // fuente única de rótulos (ADR-016)

// ============================================================================
// MATH CONSTANTS (must be defined globally or imported)
// ============================================================================
const MATH_CONSTANTS = {
  PI: Math.PI,
  TWO_PI: 2 * Math.PI,
  FOUR_PI: 4 * Math.PI
};

// ============================================================================
// CALCULATE ROUGHNESS OF CONTOUR
// ============================================================================
/**
 * Calculate roughness index from contour segment lengths
 * Uses coefficient of variation of segment lengths as roughness measure
 * @param {Array} contourPoints - Contour points [{x,y} or [x,y]]
 * @returns {Object} Roughness metrics and classification
 */
function calcularRugosidadContorno(contourPoints) {
  if (!contourPoints || contourPoints.length < 3) {
    return {
      rugosidad: 0,
      longitud_segmento_media_px: 0,
      desviacion_segmentos_px: 0,
      clasificacion_rugosidad: 'Insuficientes puntos'
    };
  }

  const getX = (p) => p.x !== undefined ? p.x : p[0];
  const getY = (p) => p.y !== undefined ? p.y : p[1];

  const longitudSegmentos = [];

  for (let i = 0; i < contourPoints.length; i++) {
    const p1 = [getX(contourPoints[i]), getY(contourPoints[i])];
    const p2 = [getX(contourPoints[(i + 1) % contourPoints.length]), getY(contourPoints[(i + 1) % contourPoints.length])];

    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const longitud = Math.sqrt(dx * dx + dy * dy);

    if (longitud > 0) {
      longitudSegmentos.push(longitud);
    }
  }

  if (longitudSegmentos.length === 0) {
    return {
      rugosidad: 0,
      longitud_segmento_media_px: 0,
      desviacion_segmentos_px: 0,
      clasificacion_rugosidad: 'Sin segmentos medibles'
    };
  }

  const mediaLongitud = longitudSegmentos.reduce((a, b) => a + b, 0) / longitudSegmentos.length;
  const varianza = longitudSegmentos.reduce((sum, l) => sum + (l - mediaLongitud) ** 2, 0) / longitudSegmentos.length;
  const desviacion = Math.sqrt(varianza);

  const rugosidad = mediaLongitud > 0 ? desviacion / mediaLongitud : 0;

  const clasificacion = clasificarRugosidad(rugosidad);  // fuente única (metric-presenter.js)

  return {
    rugosidad: rugosidad,
    longitud_segmento_media_px: mediaLongitud,
    desviacion_segmentos_px: desviacion,
    clasificacion_rugosidad: clasificacion
  };
}

// ============================================================================
// CALCULATE METRICS FROM CONTOUR (for idealized forms)
// ============================================================================
/**
 * Recalculate metrics from idealized geometric contour
 * Used when simplifying complex contours to regular geometric forms
 * @param {Array} vertices - Idealized contour vertices
 * @param {Number} offsetX - X offset (not used in current implementation)
 * @param {Number} offsetY - Y offset (not used in current implementation)
 * @param {Number} boundingWidth - Bounding box width
 * @param {Number} boundingHeight - Bounding box height
 * @returns {Object} Recalculated metrics for idealized form
 */
function calcularMetricasDesdeContorno(vertices, offsetX, offsetY, boundingWidth, boundingHeight) {
  const getX = (p) => p.x !== undefined ? p.x : p[0];
  const getY = (p) => p.y !== undefined ? p.y : p[1];

  const area = GP.calcularAreaShoelace(vertices);

  let perimeter = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    const dx = getX(vertices[j]) - getX(vertices[i]);
    const dy = getY(vertices[j]) - getY(vertices[i]);
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }

  let centroid;
  {
    const nv = vertices.length;
    let cx = 0, cy = 0, sa = 0;
    for (let i = 0; i < nv; i++) {
      const j = (i + 1) % nv;
      const cross = getX(vertices[i]) * getY(vertices[j]) - getX(vertices[j]) * getY(vertices[i]);
      sa += cross;
      cx += (getX(vertices[i]) + getX(vertices[j])) * cross;
      cy += (getY(vertices[i]) + getY(vertices[j])) * cross;
    }
    sa /= 2;
    if (Math.abs(sa) > 1e-10) {
      centroid = [cx / (6 * sa), cy / (6 * sa)];
    } else {
      let sumX = 0, sumY = 0;
      for (const p of vertices) { sumX += getX(p); sumY += getY(p); }
      centroid = [sumX / vertices.length, sumY / vertices.length];
    }
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of vertices) {
    const x = getX(p);
    const y = getY(p);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const tightWidth = maxX - minX;
  const tightHeight = maxY - minY;

  const convexHullArea = area;
  const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
  const solidity = area / convexHullArea;

  return {
    area: area,
    perimeter: perimeter,
    centroid: centroid,
    tightWidth: tightWidth,
    tightHeight: tightHeight,
    tightMinX: minX,
    tightMaxX: maxX,
    tightMinY: minY,
    tightMaxY: maxY,
    convexHullArea: convexHullArea,
    circularity: circularity,
    solidity: solidity
  };
}

// ============================================================================
// ESTIMATE OPTICAL ERROR
// ============================================================================
/**
 * Estimate optical distortion and perspective error for object metrics
 * Uses empirical k1 coefficient based on field of view
 * @param {Object} params - {objCentroide, imgW, imgH, focalMM, sensorW, sensorH, distanciaObjMM}
 * @returns {Object|null} Optical error metrics or null if insufficient parameters
 */
function estimarErrorOptico({ objCentroide, imgW, imgH, focalMM, sensorW, sensorH, distanciaObjMM }) {
  if (!focalMM || !sensorW || !imgW || !distanciaObjMM) {
    return null;
  }

  const diagSensor = Math.sqrt(sensorW * sensorW + (sensorH || sensorW) * (sensorH || sensorW));
  const fovDiagRad = 2 * Math.atan(diagSensor / (2 * focalMM));
  const fovDiagDeg = fovDiagRad * (180 / Math.PI);

  let k1;
  if (fovDiagDeg < 20) {
    k1 = -0.0003;
  } else if (fovDiagDeg < 30) {
    k1 = -0.0010;
  } else if (fovDiagDeg < 45) {
    k1 = -0.0035;
  } else if (fovDiagDeg < 60) {
    k1 = -0.0120;
  } else if (fovDiagDeg < 75) {
    k1 = -0.0400;
  } else if (fovDiagDeg < 90) {
    k1 = -0.1000;
  } else {
    k1 = -0.2200;
  }

  const cx = imgW / 2;
  const cy = imgH / 2;
  const dx = (objCentroide?.x ?? cx) - cx;
  const dy = (objCentroide?.y ?? cy) - cy;
  const rPx = Math.sqrt(dx * dx + dy * dy);
  const rNorm = rPx / (imgW / 2);

  const deltaDistorsionPx = Math.abs(k1) * rNorm * rNorm * rPx;
  const deltaDistorsionMm = deltaDistorsionPx * (sensorW / imgW);

  const xSensorMm = dx * (sensorW / imgW);
  const ySensorMm = dy * ((sensorH || sensorW * imgH / imgW) / imgH);
  const rSensorMm = Math.sqrt(xSensorMm * xSensorMm + ySensorMm * ySensorMm);
  const theta = Math.atan2(rSensorMm, focalMM);

  const cosTheta = Math.cos(theta);
  const errorPerspPercent = ((1 / (cosTheta * cosTheta)) - 1) * 100;

  const errorDistorsionPercent = Math.abs(k1) * rNorm * rNorm * 100;
  const errorLinealPercent = Math.sqrt(
    errorDistorsionPercent * errorDistorsionPercent +
    errorPerspPercent * errorPerspPercent
  );
  const errorAreaPercent = Math.sqrt(
    (2 * errorDistorsionPercent) * (2 * errorDistorsionPercent) +
    (2 * errorPerspPercent) * (2 * errorPerspPercent)
  );

  let confianzaCategoria;
  if (errorLinealPercent < 0.5) {
    confianzaCategoria = 'Muy Alta (< 0.5%)';
  } else if (errorLinealPercent < 1.5) {
    confianzaCategoria = 'Alta (< 1.5%)';
  } else if (errorLinealPercent < 3.0) {
    confianzaCategoria = 'Moderada (< 3%)';
  } else if (errorLinealPercent < 6.0) {
    confianzaCategoria = 'Baja (< 6%)';
  } else {
    confianzaCategoria = 'Muy Baja (> 6%)';
  }

  return {
    fovDiagDeg: parseFloat(fovDiagDeg.toFixed(2)),
    k1_estimado: parseFloat(k1.toFixed(6)),
    posicion_radial_norm: parseFloat(rNorm.toFixed(4)),
    posicion_radial_px: parseFloat(rPx.toFixed(1)),
    angulo_optico_deg: parseFloat((theta * 180 / Math.PI).toFixed(3)),
    error_distorsion_percent: parseFloat(errorDistorsionPercent.toFixed(4)),
    error_perspectiva_percent: parseFloat(errorPerspPercent.toFixed(4)),
    error_lineal_percent: parseFloat(errorLinealPercent.toFixed(3)),
    error_area_percent: parseFloat(errorAreaPercent.toFixed(3)),
    confianza_optica: confianzaCategoria,
    nota: `k1 estimado para FOV ${fovDiagDeg.toFixed(1)}° (sin calibración de lente; incertidumbre del modelo ±30%)`
  };
}

// ============================================================================
// APPLY OPTICAL UNCERTAINTY TO METRICS
// ============================================================================
/**
 * Propagate optical error uncertainty to absolute metrics
 * Adds uncertainty bounds (±mm/mm²) to dimensional metrics
 * @param {Object} metrics - Metrics object to augment
 * @param {Object} errorOptico - Optical error estimation result
 * @returns {Object} Metrics with uncertainty fields added
 */
function aplicarIncertidumbreOptica(metrics, errorOptico) {
  if (!errorOptico || typeof errorOptico !== 'object') return metrics;
  if (!metrics || typeof metrics !== 'object') return metrics;

  const eL = errorOptico.error_lineal_percent / 100;
  const eA = errorOptico.error_area_percent / 100;

  if (isNaN(eL) || isNaN(eA)) return metrics;

  const metricasLineales = [
    'perimeter', 'width', 'height',
    'eje_mayor', 'eje_menor',
    'radio_maximo', 'radio_minimo', 'radio_medio',
    'feret_max', 'feret_min',
    'perimeter_fragmentado'
  ];

  const metricasArea = [
    'area',
    'area_fragmentada'
  ];

  metricasLineales.forEach(k => {
    const v = parseFloat(metrics[k]);
    if (!isNaN(v) && isFinite(v)) {
      const err = Math.abs(v) * eL;
      metrics[`${k}_incertidumbre_abs`] = parseFloat(err.toFixed(4));
      metrics[`${k}_rango_min`] = parseFloat((v - err).toFixed(4));
      metrics[`${k}_rango_max`] = parseFloat((v + err).toFixed(4));
    }
  });

  metricasArea.forEach(k => {
    const v = parseFloat(metrics[k]);
    if (!isNaN(v) && isFinite(v)) {
      const err = Math.abs(v) * eA;
      metrics[`${k}_incertidumbre_abs`] = parseFloat(err.toFixed(4));
      metrics[`${k}_rango_min`] = parseFloat((v - err).toFixed(4));
      metrics[`${k}_rango_max`] = parseFloat((v + err).toFixed(4));
    }
  });

  metrics._incertidumbre_optica_aplicada = true;
  metrics._metricas_no_afectadas = 'circularity,compactness,rectangularity,elongation,shape_factor,solidity,aspect_ratio,excentricidad,convexity,symmetry_score';

  return metrics;
}

// ============================================================================
// MAIN METRICS ORCHESTRATOR - MORPHOLOGICAL METRICS CALCULATION
// ============================================================================
/**
 * Main orchestration function for comprehensive morphological analysis
 *
 * Receives an object with contour, calculates 100+ morphometric indicators
 * across multiple dimensions (area, shape, symmetry, curvature, texture, etc).
 *
 * Pipeline:
 * 1. Contour validation/extraction
 * 2. Geometric metrics (area, perimeter, convex hull)
 * 3. Shape metrics (circularity, compactness, aspect ratio)
 * 4. Symmetry and axis analysis
 * 5. Curvature and roughness
 * 6. Idealized form generation and reclassification
 * 7. Archaeological metrics (completeness, fragmentation)
 * 8. 3D shape inference
 * 9. Optical error estimation and uncertainty propagation
 *
 * @param {Object} obj - Object with contour and geometric properties
 * @param {Number} escalaFactor - Scale factor (mm/px) or null for pixel units
 * @returns {Object|null} Complete metrics dataset or null if failed
 *
 * CRITICAL DEPENDENCIES (must be available globally):
 * - MorphometricMetrics (MM.*)
 * - ShapeClassification (SC.*)
 * - ClassificationEngine (CE.*)
 * - GeometryPrimitives (GP.*)
 * - extraerContornoReal() - contour extraction function
 * - startProgress() / endProgress() - UI progress tracking
 * - UtilityHelpers (UH.*) - helper functions
 * - image, imageWidth, imageHeight - global image context
 * - objects - global objects array
 * - currentObjectForComponentSelection - UI state
 *
 * NOTE: This is a HIGH COMPLEXITY, HIGH RISK function that depends on:
 * - All other metric modules
 * - Extensive global state
 * - Complex multi-stage pipeline
 * - Caching and lazy evaluation
 *
 * Use with care and test thoroughly before deployment.
 */
function calcularMetricasMorfologicas(obj, escalaFactor = null) {
  // This is a PLACEHOLDER for the massive function
  // In actual extraction, the full 2,443 lines would be placed here
  // Import from the original analysis-core.js and adapt it

  console.warn('calcularMetricasMorfologicas: PLACEHOLDER - requires full implementation from analysis-core.js');
  return null;
}

// ============================================================================
// FALLBACK METRICS WITH BOUNDING BOX ONLY
// ============================================================================
/**
 * Calculate basic metrics using only bounding box when contour extraction fails
 * Provides approximate morphological analysis as fallback
 *
 * @param {Object} obj - Object with basic geometric properties
 * @param {Number} escalaFactor - Scale factor (mm/px) or null for pixel units
 * @returns {Object} Basic metrics based on bounding box
 */
function calcularMetricasConBoundingBox(obj, escalaFactor = null) {
  console.warn('Usando análisis con BOUNDING BOX para objeto ' + (obj?.id || 'desconocido') + ' - NO SE PUDO EXTRAER CONTORNO REAL');

  const metrics = {};

  metrics.object_id = obj.id || `${obj.numeroObjeto || '??'}`;
  metrics.numero_objeto = obj.numeroObjeto || 0;

  metrics.bounding_width_px = obj.width;
  metrics.bounding_height_px = obj.height;
  metrics.bounding_area_px = obj.area;
  metrics.bounding_perimeter_px = obj.perimeter || (2 * (obj.width + obj.height));

  if (escalaFactor && escalaFactor > 0) {
    metrics.bounding_width_mm = (obj.width * escalaFactor).toFixed(3);
    metrics.bounding_height_mm = (obj.height * escalaFactor).toFixed(3);
    metrics.bounding_area_mm2 = (obj.area * escalaFactor * escalaFactor).toFixed(3);
    metrics.bounding_perimeter_mm = (metrics.bounding_perimeter_px * escalaFactor).toFixed(3);
  }

  metrics.aspect_ratio_original = (obj.width / obj.height).toFixed(4);

  const circularidadAprox = (4 * Math.PI * obj.area) / (metrics.bounding_perimeter_px * metrics.bounding_perimeter_px);
  metrics.circularity_approx = circularidadAprox.toFixed(4);

  const boundingBoxArea = obj.width * obj.height;
  metrics.rectangularity_approx = (obj.area / boundingBoxArea).toFixed(4);

  if (circularidadAprox >= 0.75) {
    metrics.shape_class_circularity = 'Subcircular (aprox)';
  } else if (circularidadAprox >= 0.40) {
    metrics.shape_class_circularity = 'Subelíptica (aprox)';
  } else {
    metrics.shape_class_circularity = 'Alargada (aprox)';
  }

  metrics.detection_method = obj.detectionMethod || 'automatic';
  metrics.analysis_method = 'Bounding Box (Fallback) [APROXIMADO]';
  metrics.contour_extraction_successful = false;
  metrics.original_bounding_box = `${obj.minX},${obj.minY} to ${obj.maxX},${obj.maxY}`;
  metrics.scale_factor = escalaFactor || 'No configurada';
  metrics.analysis_timestamp = new Date().toISOString();

  return metrics;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  calcularMetricasMorfologicas,
  calcularMetricasConBoundingBox,
  calcularRugosidadContorno,
  calcularMetricasDesdeContorno,
  estimarErrorOptico,
  aplicarIncertidumbreOptica
};
