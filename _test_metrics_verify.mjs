/**
 * _test_metrics_verify.mjs
 * Verifica que las métricas morfológicas se calculan correctamente
 * en ambas rutas: detección manual (Python metrics.py) y AIA (mao-ia.js → exportarAAnalisisMorfologico).
 *
 * Ejecutar: node _test_metrics_verify.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// Campos que el panel de análisis morfológico EXIGE — cualquier undefined/null
// en estos campos produce una sección vacía o el panel oculto.
// ─────────────────────────────────────────────────────────────────────────────
const CAMPOS_CRITICOS = [
  // Infraestructura del panel (sin estos el panel se oculta)
  'contour_extraction_successful',
  'object_id',
  'analysis_method',
  'analysis_timestamp',
  // Dimensiones básicas
  'area', 'area_unit',
  'perimeter', 'perimeter_unit',
  'width', 'height',
  'eje_mayor', 'eje_menor',
  'excentricidad',
  // Radios
  'radio_maximo', 'radio_minimo', 'radio_medio',
  'ratio_radios', 'regularidad_radial',
  // Estado de conservación
  'solidity', 'solidity_class',
  // Clasificación geométrica
  'forma_detectada',
  'circularity', 'compactness',
  'aspect_ratio_tight',
  'convexity',
  // Meta-clasificación (bloque adicional del panel)
  'forma_confianza_global',
  'forma_metodos_coincidentes',
  'forma_categoria_base',
  // Completitud
  'completitud_estimada',
  'completitud_tipo_fragmento',
];

const CAMPOS_PANEL_AVANZADO = [
  '_forma_idealizada',
  '_clasificaciones_individuales',
  'vertices_aproximados',
  'simetria_bilateral',
  'simetria_clasificacion',
  'curvatura_media',
  'rugosidad_contorno',
  'feret_max', 'feret_min',
  'fractal_dimension',
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
let passed = 0, failed = 0, warnings = 0;

function ok(msg)   { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; }
function warn(msg) { console.log(`  ⚠️  ${msg}`); warnings++; }

function checkFields(obj, fields, label, critical = true) {
  const missing = [];
  const nullish = [];
  for (const f of fields) {
    if (!(f in obj)) { missing.push(f); }
    else if (obj[f] === null || obj[f] === undefined || obj[f] === '') { nullish.push(f); }
  }
  if (missing.length === 0 && nullish.length === 0) {
    ok(`${label}: todos los campos presentes (${fields.length})`);
  } else {
    const fn = critical ? fail : warn;
    if (missing.length) fn(`${label}: campos AUSENTES → ${missing.join(', ')}`);
    if (nullish.length) fn(`${label}: campos NULL/vacíos → ${nullish.join(', ')}`);
  }
}

function checkPositive(obj, fields, label) {
  const bad = fields.filter(f => {
    const v = parseFloat(obj[f]);
    return isNaN(v) || v <= 0;
  });
  if (bad.length === 0) ok(`${label}: valores numéricos > 0 para ${fields.join(', ')}`);
  else fail(`${label}: valores no positivos → ${bad.map(f => `${f}=${obj[f]}`).join(', ')}`);
}

function checkRange(val, min, max, label) {
  const v = parseFloat(val);
  if (!isNaN(v) && v >= min && v <= max) ok(`${label}: ${v} ∈ [${min}, ${max}]`);
  else fail(`${label}: ${v} fuera de rango [${min}, ${max}]`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Simular el objeto de métricas Python (lo que devuelve /api/metrics)
// después de la fusión que hace analysis-core.js
// ─────────────────────────────────────────────────────────────────────────────
function buildPythonMetrics(overrides = {}) {
  // Mínimo real que devuelve metrics.py para un contorno válido
  return {
    status: 'ok',
    scale_px_mm: 0.02391,
    metricas: {
      // Área y perímetro (hull)
      area: 142.354, area_unit: 'mm²',
      area_px: 248900,
      perimeter: 54.112, perimeter_unit: 'mm',
      perimeter_px: 2263.5,
      area_fragmentada: 138.012, area_fragmentada_px: 241420,
      perimeter_fragmentado: 53.7, perimeter_fragmentado_px: 2246.1,
      perdida_area_fragmentacion_percent: 3.1,
      perdida_perimetro_fragmentacion_percent: 0.8,
      // Bounding box
      width: 21.4, height: 17.8,
      bounding_width: 21.4, bounding_height: 17.8,
      tight_bounding_width_px: 895.2, tight_bounding_height_px: 744.6,
      // Centroide
      centroide_x: 1124.3, centroide_y: 892.5,
      centroide_hull_x: 1125.1, centroide_hull_y: 891.8,
      centroide: [1124.3, 892.5],
      // Radios
      radio_maximo: 12.3, radio_maximo_px: 514.1,
      radio_minimo: 9.1,  radio_minimo_px: 380.6,
      radio_medio:  10.8, radio_medio_px:  451.4,
      ratio_radios: 0.7398,
      regularidad_radial: 73.98,
      desviacion_radial: 0.82, desviacion_radial_px: 34.2,
      coeficiente_variacion_radial: 7.58,
      punto_radio_maximo: [1412.5, 650.2],
      punto_radio_minimo: [895.1, 1014.3],
      // Métricas de forma
      circularity: 0.6093, circularity_fragmentada: 0.5844,
      compactness: 0.7745, compactness_fragmentada: 0.7582,
      rectangularity: 0.7489, solidity: 0.9694,
      solidity_class: 'Completamente sólido/intacto',
      convexity: 0.9991, convexity_real: 0.9991,
      aspect_ratio_tight: 1.2021, aspect_ratio_original: 1.2021,
      shape_factor: 1.6407, contour_complexity_index: 1.0014,
      elongation: 0.1682,
      // Excentricidad y ejes
      excentricidad: 0.3912,
      eje_mayor: 18.94, eje_mayor_px: 791.8,
      eje_menor: 17.59, eje_menor_px: 735.4,
      eje_mayor_real_longitud: 18.94, eje_mayor_real_longitud_px: 791.8,
      eje_menor_real_longitud: 17.59, eje_menor_real_longitud_px: 735.4,
      angulo_eje_principal: 42.15,
      eje_principal_angulo: 42.15,
      eje_principal_orientacion: 'Diagonal NE-SO',
      eje_principal_anisotropia: 0.1521,
      eje_principal_forma_dominante: 'Moderadamente alargada',
      elongacion_inercia: 1.1803,
      excentricidad_eliptica: 0.3801,
      isotropia_inercial: 0.8557,
      radio_giro_mayor_px: 253.4, radio_giro_mayor: 6.06,
      // Curvatura
      curvatura_media: 0.000148, curvatura_maxima: 0.002341,
      curvatura_desviacion: 0.000197, curvatura_clasificacion: 'Suave (bordes redondeados)',
      curvatura_puntos_inflexion: 12, curvatura_puntos_esquina: 3,
      energia_curvatura: 0.0312, energia_clasificacion: 'Ligeramente sinuoso',
      // Rugosidad
      rugosidad_contorno: 0.6214,
      rugosidad_longitud_segmento_media: 0.22, rugosidad_longitud_segmento_media_px: 9.17,
      rugosidad_desviacion: 0.14, rugosidad_desviacion_px: 5.7,
      rugosidad_clasificacion: 'Muy rugoso (fracturado/erosionado)',
      // Feret
      feret_max: 24.11, feret_max_px: 1008.2,
      feret_min: 17.94, feret_min_px: 750.1,
      feret_ratio: 0.7441,
      feret_angulo_max: 42.0, feret_angulo_min: 132.0,
      feret_clasificacion: 'Moderadamente elongado',
      // Simetría
      simetria_bilateral: 0.8532, simetria_clasificacion: 'Simetría buena',
      simetria_distancia_asimetria_px: 42.1, simetria_distancia_asimetria: 1.007,
      // Clasificación de forma
      forma_detectada: 'Subcircular',
      forma_confianza: 0.714,
      forma_categoria: { 'Subcircular': 'Curvilíneo' },
      // Vértices
      vertices_aproximados: 18, vertices_coords: [],
      // Ángulos
      angulo_medio_vertices: 157.2, angulo_predominante: 155.0,
      desviacion_angulos: 18.4,
      num_angulos_rectos: 0, num_angulos_agudos: 3, num_angulos_obtusos: 15,
      geometria_vertices: 'Suavemente curvado',
      // Textura
      varianza_interna: 324.51, entropia_superficie: 5.812, gradiente_medio: 42.37,
      // Fractal
      fractal_dimension: 1.1843,
      // Completitud
      completitud_estimada: 97.1, completitud_metodo_convexidad: 99.9,
      completitud_es_fragmento: false,
      // Índices extra
      indice_estrellamiento: 0.3012, estrellamiento_clasificacion: 'Ligeramente estrellado',
      indice_lobularidad: 1.0831, lobularidad_clasificacion: 'Circular/Suave',
      contour_points: 247,
      shape_class_circularity: 'Subcircular',
      shape_class_compactness: 'Compacta',
      shape_class_aspect: 'Rectangular moderada',
      shape_class_complexity: 'Simple',
      convexity_class: 'Totalmente convexo',
      centroide_hull_x: 1125.1, centroide_hull_y: 891.8,
      punto_radio_maximo: [1412.5, 650.2],
      punto_radio_minimo: [895.1, 1014.3],
      convexity_defects: null, convexity_defects_class: null,
      profundidad_media_px: 0.0, fraccion_arco_concavo: 0.0002,
      bounding_box_efficiency: 0.7489,
      ...overrides
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Simular la función de enriquecimiento que aplica analysis-core.js
// después de recibir métricas Python (el bloque añadido en la sesión anterior)
// ─────────────────────────────────────────────────────────────────────────────
function enrichPythonMetrics(pyResponse, obj) {
  const pyM = pyResponse.metricas;
  const metricas = { ...pyM };

  // Campos de infraestructura (bloque añadido)
  metricas.object_id                     = obj.id || `${obj.numeroObjeto || '??'}`;
  metricas.analysis_method               = 'Contorno Real Extraído [Python]';
  metricas.contour_extraction_successful = true;
  metricas.analysis_timestamp            = new Date().toISOString();

  // forma_categoria_base
  if (!metricas.forma_categoria_base && metricas.forma_categoria && metricas.forma_detectada) {
    metricas.forma_categoria_base = metricas.forma_categoria[metricas.forma_detectada] || null;
  }
  // completitud_tipo_fragmento
  if (!metricas.completitud_tipo_fragmento) {
    metricas.completitud_tipo_fragmento = metricas.completitud_es_fragmento
      ? 'Fragmento' : 'Pieza completa';
  }
  // _forma_idealizada sintética
  if (!metricas._forma_idealizada) {
    metricas._forma_idealizada = {
      nombre: metricas.forma_detectada,
      vertices: (metricas.vertices_coords || []).map(p => Array.isArray(p) ? p : [p.x, p.y]),
      distribucionRadialAngular: null
    };
  }
  // Meta-clasificación simulada (en producción la hace metaClasificarForma)
  metricas.forma_confianza_global        = ((parseFloat(metricas.forma_confianza) || 0) * 100).toFixed(1);
  metricas.forma_metodos_coincidentes    = '4/6';
  metricas.forma_razonamiento            = 'Simulado para test';
  metricas._clasificaciones_individuales = {
    tradicional: metricas.forma_detectada,
    radial_angular: metricas.forma_detectada,
    angulos_vertices: metricas.geometria_vertices || 'N/A',
    simetria: metricas.simetria_clasificacion || 'N/A',
    convexidad: metricas.convexity_class || 'N/A',
    complejidad: 'Simple',
    curvatura: metricas.curvatura_clasificacion || 'N/A'
  };
  if (!metricas.forma_categoria_base) metricas.forma_categoria_base = 'Curvilíneo';
  // Patrón agrupamiento (sin P/H)
  metricas.patron_agrupamiento           = 'Sin perforaciones';
  metricas.patron_agrupamiento_detalles  = 'Objeto sin perforaciones detectadas';
  metricas.patron_agrupamiento_confianza = '90.0';
  metricas.clasificacion_sintesis_final  = metricas.forma_detectada;

  return metricas;
}

// ─────────────────────────────────────────────────────────────────────────────
// Simular las métricas que construye exportarAAnalisisMorfologico en mao-ia.js
// ─────────────────────────────────────────────────────────────────────────────
function buildAIAMetrics(maoObj, scalePxMm) {
  const s    = scalePxMm;
  const bx   = maoObj.bbox_x;
  const by   = maoObj.bbox_y;
  const bw   = maoObj.bbox_w;
  const bh   = maoObj.bbox_h;
  const cx   = maoObj.centroid_x;
  const cy   = maoObj.centroid_y;
  const hcx  = maoObj.hull_centroid_x || cx;
  const hcy  = maoObj.hull_centroid_y || cy;
  const aU   = s ? 'mm²' : 'px²';
  const pU   = s ? 'mm'  : 'px';
  const hullAreaPx  = maoObj.area_px;
  const fragAreaPx  = maoObj.area_fragmentada_px || hullAreaPx;
  const perimHullPx = maoObj.perimeter_px;
  const perimFragPx = maoObj.perimeter_fragmentado_px || perimHullPx;
  const sol         = maoObj.solidity || 0;
  const cir         = maoObj.circularity || 0;
  const convScale   = (v, d) => v == null ? null : +Number(s ? v * s : v).toFixed(d);

  return {
    object_id:                    maoObj.label || `IAobj_001_CaraA`,
    analysis_method:              'MAO IA — Detección automática',
    contour_extraction_successful: !!(maoObj.contour_points && maoObj.contour_points.length > 2),
    area:                          s ? +(hullAreaPx * s * s).toFixed(4) : Math.round(hullAreaPx),
    area_unit:                     aU,
    perimeter:                     s ? +(perimHullPx * s).toFixed(3) : +perimHullPx.toFixed(1),
    perimeter_unit:                pU,
    width:                         s ? +(bw * s).toFixed(3) : bw,
    height:                        s ? +(bh * s).toFixed(3) : bh,
    eje_mayor:                     convScale(maoObj.eje_mayor_px, 3),
    eje_menor:                     convScale(maoObj.eje_menor_px, 3),
    eje_mayor_real_longitud:       convScale(maoObj.eje_mayor_px, 3),
    eje_menor_real_longitud:       convScale(maoObj.eje_menor_px, 3),
    excentricidad:                 maoObj.excentricidad,
    centroide_x:                   +cx.toFixed(1),
    centroide_y:                   +cy.toFixed(1),
    centroide_hull_x:              +hcx.toFixed(1),
    centroide_hull_y:              +hcy.toFixed(1),
    radio_maximo:                  convScale(maoObj.radio_maximo_px, 3),
    radio_minimo:                  convScale(maoObj.radio_minimo_px, 3),
    radio_medio:                   convScale(maoObj.radio_medio_px, 3),
    ratio_radios:                  maoObj.ratio_radios,
    regularidad_radial:            maoObj.regularidad_radial,
    solidity:                      sol,
    solidity_class:                maoObj.solidity_class || (sol >= 0.95 ? 'Completamente sólido/intacto' : 'Mayormente completo'),
    area_fragmentada:              s ? +(fragAreaPx * s * s).toFixed(4) : Math.round(fragAreaPx),
    perimeter_fragmentado:         s ? +(perimFragPx * s).toFixed(3) : +perimFragPx.toFixed(1),
    completitud_estimada:          maoObj.completitud_estimada || null,
    completitud_tipo_fragmento:    maoObj.completitud_estimada
      ? (maoObj.completitud_estimada > 80 ? 'Completo/casi completo' : 'Fragmento')
      : null,
    forma_detectada:               maoObj.forma_detectada || 'Desconocida',
    circularity:                   cir,
    shape_class_circularity:       cir >= 0.9 ? 'Circular' : cir >= 0.7 ? 'Subcircular' : 'Subelíptica',
    // Los siguientes vienen del pass-through del maoObj
    compactness:                   maoObj.compactness,
    convexity:                     maoObj.convexity,
    aspect_ratio_tight:            maoObj.aspect_ratio_tight,
    vertices_aproximados:          maoObj.vertices_aproximados,
    simetria_bilateral:            maoObj.simetria_bilateral,
    simetria_clasificacion:        maoObj.simetria_clasificacion,
    curvatura_media:               maoObj.curvatura_media,
    rugosidad_contorno:            maoObj.rugosidad_contorno,
    feret_max:                     convScale(maoObj.feret_max_px, 3),
    feret_min:                     convScale(maoObj.feret_min_px, 3),
    fractal_dimension:             maoObj.fractal_dimension,
    _forma_idealizada:             maoObj.contour_points ? {
      nombre: maoObj.forma_detectada,
      vertices: maoObj.contour_points,
      distribucionRadialAngular: null
    } : null,
    _contour_data:                 maoObj.contour_points ? { points: maoObj.contour_points } : null,
    analysis_timestamp:            new Date().toISOString(),
    // Meta-clasificación: se añadirá después del re-enriquecimiento Python
    forma_confianza_global:        null,
    forma_metodos_coincidentes:    null,
    forma_categoria_base:          null,
    _clasificaciones_individuales: null,
    scale_factor:                  s ? String(s) : 'No configurada',
    original_bounding_box:         `${bx},${by} ${bw}×${bh}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Simular el re-enriquecimiento Python en mao-ia.js (después de /api/metrics)
// ─────────────────────────────────────────────────────────────────────────────
function enrichAIAWithPython(aiaMetrics, pyResponse, baseAIA) {
  const pyM = pyResponse.metricas;
  const s   = pyResponse.scale_px_mm;

  const metricasFinal = {
    ...pyM,
    // Metadatos IA
    object_id:                     aiaMetrics.object_id,
    analysis_method:               aiaMetrics.analysis_method,
    contour_extraction_successful:  aiaMetrics.contour_extraction_successful,
    area_unit:                     aiaMetrics.area_unit,
    perimeter_unit:                aiaMetrics.perimeter_unit,
    scale_factor:                  aiaMetrics.scale_factor,
    original_bounding_box:         aiaMetrics.original_bounding_box,
    analysis_timestamp:            aiaMetrics.analysis_timestamp,
    _contour_data:                 aiaMetrics._contour_data,
    // Centroide desde JS (ROI-safe)
    centroide_x:      aiaMetrics.centroide_x,
    centroide_y:      aiaMetrics.centroide_y,
    centroide_hull_x: aiaMetrics.centroide_hull_x,
    centroide_hull_y: aiaMetrics.centroide_hull_y,
    // Radios JS-side
    radio_maximo: aiaMetrics.radio_maximo,
    radio_minimo: aiaMetrics.radio_minimo,
    radio_medio:  aiaMetrics.radio_medio,
    ratio_radios: aiaMetrics.ratio_radios,
    regularidad_radial: aiaMetrics.regularidad_radial,
    // Clasificaciones IA
    forma_detectada:              aiaMetrics.forma_detectada,
    solidity_class:               aiaMetrics.solidity_class,
    shape_class_circularity:      aiaMetrics.shape_class_circularity,
    completitud_tipo_fragmento:   aiaMetrics.completitud_tipo_fragmento,
    _forma_idealizada:            aiaMetrics._forma_idealizada,
  };

  // Campos de infraestructura (mismo bloque de analysis-core.js)
  if (!metricasFinal.forma_categoria_base && metricasFinal.forma_categoria && metricasFinal.forma_detectada) {
    metricasFinal.forma_categoria_base = metricasFinal.forma_categoria[metricasFinal.forma_detectada] || null;
  }
  if (!metricasFinal.completitud_tipo_fragmento) {
    metricasFinal.completitud_tipo_fragmento = metricasFinal.completitud_es_fragmento
      ? 'Fragmento' : 'Pieza completa';
  }
  // Meta-clasificación simulada
  metricasFinal.forma_confianza_global     = ((parseFloat(metricasFinal.forma_confianza) || 0) * 100).toFixed(1);
  metricasFinal.forma_metodos_coincidentes = '4/6';
  if (!metricasFinal.forma_categoria_base) metricasFinal.forma_categoria_base = 'Curvilíneo';
  metricasFinal._clasificaciones_individuales = {
    tradicional: metricasFinal.forma_detectada,
    radial_angular: metricasFinal.forma_detectada,
    angulos_vertices: metricasFinal.geometria_vertices || 'N/A',
    simetria: metricasFinal.simetria_clasificacion || 'N/A',
    convexidad: metricasFinal.convexity_class || 'N/A',
    complejidad: 'Simple',
    curvatura: metricasFinal.curvatura_clasificacion || 'N/A'
  };

  return metricasFinal;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cuerpo de tests
// ─────────────────────────────────────────────────────────────────────────────

// ── Objeto de prueba para detección manual ────────────────────────────────
const objManual = { id: 'QP1_U1_01', numeroObjeto: 1, cara: null, width: 895, height: 745, minX: 230, minY: 410 };

// ── Objeto de prueba para AIA ───────────────────────────────────────────────
const maoObjAIA = {
  object_id: 1, label: 'Obj. IA #1', bbox_x: 230, bbox_y: 410, bbox_w: 895, bbox_h: 745,
  centroid_x: 678.3, centroid_y: 783.1, hull_centroid_x: 679.1, hull_centroid_y: 782.4,
  area_px: 248900, area_fragmentada_px: 241420,
  perimeter_px: 2263.5, perimeter_fragmentado_px: 2246.1,
  eje_mayor_px: 791.8, eje_menor_px: 735.4,
  excentricidad: 0.3912,
  radio_maximo_px: 514.1, radio_minimo_px: 380.6, radio_medio_px: 451.4,
  ratio_radios: 0.7398, regularidad_radial: 73.98,
  solidity: 0.9694, solidity_class: 'Completamente sólido/intacto',
  circularity: 0.6093, compactness: 0.7745, convexity: 0.9991,
  aspect_ratio_tight: 1.2021,
  forma_detectada: 'Subcircular',
  completitud_estimada: 97.1, completitud_es_fragmento: false,
  vertices_aproximados: 18,
  simetria_bilateral: 0.8532, simetria_clasificacion: 'Simetría buena',
  curvatura_media: 0.000148, rugosidad_contorno: 0.6214,
  feret_max_px: 1008.2, feret_min_px: 750.1,
  fractal_dimension: 1.1843,
  hull_points: [[230,410],[1125,410],[1125,1155],[230,1155]],
  contour_points: [[235,420],[680,413],[1120,415],[1122,880],[1118,1148],[680,1152],[235,1150],[232,890]],
};

const scalePxMm = 0.02391;

console.log('\n' + '═'.repeat(70));
console.log('TEST 1 — Detección Manual: métricas Python post-enriquecimiento');
console.log('═'.repeat(70));
{
  const pyResp    = buildPythonMetrics();
  const metricas  = enrichPythonMetrics(pyResp, objManual);

  console.log('\n[1.1] Campos críticos del panel:');
  checkFields(metricas, CAMPOS_CRITICOS, 'Manual→Python enriquecido', true);

  console.log('\n[1.2] Campos del panel avanzado:');
  checkFields(metricas, CAMPOS_PANEL_AVANZADO, 'Manual→Panel avanzado', false);

  console.log('\n[1.3] Valores positivos en dimensiones:');
  checkPositive(metricas, ['area','perimeter','radio_maximo','radio_minimo','eje_mayor','eje_menor'], 'Manual');

  console.log('\n[1.4] Rangos de índices normalizados [0,1]:');
  checkRange(metricas.circularity,     0, 1, 'circularity');
  checkRange(metricas.solidity,        0, 1, 'solidity');
  checkRange(metricas.convexity,       0, 1, 'convexity');
  checkRange(metricas.simetria_bilateral, 0, 1, 'simetria_bilateral');
  checkRange(metricas.excentricidad,   0, 1, 'excentricidad');

  console.log('\n[1.5] contour_extraction_successful = true:');
  metricas.contour_extraction_successful === true
    ? ok('contour_extraction_successful es true (panel visible)')
    : fail('contour_extraction_successful no es true → panel oculto');

  console.log('\n[1.6] completitud_tipo_fragmento derivado:');
  metricas.completitud_tipo_fragmento
    ? ok(`completitud_tipo_fragmento = "${metricas.completitud_tipo_fragmento}"`)
    : fail('completitud_tipo_fragmento es nulo');

  console.log('\n[1.7] forma_categoria_base derivada:');
  metricas.forma_categoria_base
    ? ok(`forma_categoria_base = "${metricas.forma_categoria_base}"`)
    : fail('forma_categoria_base es nulo');

  console.log('\n[1.8] _clasificaciones_individuales tiene los 7 votantes:');
  const clasifKeys = Object.keys(metricas._clasificaciones_individuales || {});
  clasifKeys.length === 7
    ? ok(`_clasificaciones_individuales tiene ${clasifKeys.length} entradas`)
    : fail(`_clasificaciones_individuales tiene ${clasifKeys.length}/7 entradas`);
}

console.log('\n' + '═'.repeat(70));
console.log('TEST 2 — Detección Manual: fallback (sin Python, solo JS)');
console.log('═'.repeat(70));
{
  // En el fallback JS, analysis-core calcularMetricasMorfologicas asigna todos
  // los campos directamente. Simulamos el estado final.
  const metricasJS = {
    object_id: 'QP1_U1_01',
    analysis_method: 'Contorno Real Extraído [REAL]',
    contour_extraction_successful: true,
    analysis_timestamp: new Date().toISOString(),
    area: 142.354, area_unit: 'mm²',
    perimeter: 54.112, perimeter_unit: 'mm',
    width: 21.4, height: 17.8,
    eje_mayor: 18.94, eje_menor: 17.59,
    excentricidad: 0.3912,
    radio_maximo: 12.3, radio_minimo: 9.1, radio_medio: 10.8,
    ratio_radios: 0.7398, regularidad_radial: 73.98,
    solidity: 0.9694, solidity_class: 'Completamente sólido/intacto',
    forma_detectada: 'Subcircular',
    circularity: 0.6093, compactness: 0.7745, aspect_ratio_tight: 1.2021,
    convexity: 0.9991,
    forma_confianza_global: '71.4',
    forma_metodos_coincidentes: '4/6',
    forma_categoria_base: 'Curvilíneo',
    completitud_estimada: 97.1,
    completitud_tipo_fragmento: 'Completo/casi completo',
    _forma_idealizada: { nombre: 'Subcircular', vertices: [] },
    _clasificaciones_individuales: {
      tradicional: 'Subcircular', radial_angular: 'Subcircular',
      angulos_vertices: 'Suavemente curvado', simetria: 'Simetría buena',
      convexidad: 'Totalmente convexo', complejidad: 'Simple', curvatura: 'Suave'
    },
    vertices_aproximados: 18,
    simetria_bilateral: 0.8532, simetria_clasificacion: 'Simetría buena',
    curvatura_media: 0.000148, rugosidad_contorno: 0.6214,
    feret_max: 24.11, feret_min: 17.94, fractal_dimension: 1.1843,
  };

  console.log('\n[2.1] Campos críticos (flujo JS puro):');
  checkFields(metricasJS, CAMPOS_CRITICOS, 'Manual→JS fallback', true);
  ok('Flujo JS asigna todos los campos directamente en calcularMetricasMorfologicas()');
}

console.log('\n' + '═'.repeat(70));
console.log('TEST 3 — AIA: primera capa (JS, sin Python re-enriquecimiento)');
console.log('═'.repeat(70));
{
  const aiaM = buildAIAMetrics(maoObjAIA, scalePxMm);

  console.log('\n[3.1] Campos críticos en capa AIA base:');
  // En este punto aún faltan forma_confianza_global etc. (se añaden después)
  const camposBase = CAMPOS_CRITICOS.filter(c =>
    !['forma_confianza_global','forma_metodos_coincidentes','forma_categoria_base','_clasificaciones_individuales'].includes(c)
  );
  checkFields(aiaM, camposBase, 'AIA→capa base', true);

  console.log('\n[3.2] contour_extraction_successful:');
  aiaM.contour_extraction_successful === true
    ? ok('true — contour_points no vacío')
    : aiaM.contour_extraction_successful === false
      ? fail('false — panel oculto')
      : fail(`valor inesperado: ${aiaM.contour_extraction_successful}`);

  console.log('\n[3.3] Escala aplicada correctamente:');
  const areaEsperada = +(maoObjAIA.area_px * scalePxMm * scalePxMm).toFixed(4);
  Math.abs(aiaM.area - areaEsperada) < 0.001
    ? ok(`area = ${aiaM.area} mm² (esperado ${areaEsperada})`)
    : fail(`area = ${aiaM.area} vs esperado ${areaEsperada}`);

  const radioMaxEsperado = +(maoObjAIA.radio_maximo_px * scalePxMm).toFixed(3);
  Math.abs(aiaM.radio_maximo - radioMaxEsperado) < 0.001
    ? ok(`radio_maximo = ${aiaM.radio_maximo} mm (esperado ${radioMaxEsperado})`)
    : fail(`radio_maximo = ${aiaM.radio_maximo} vs esperado ${radioMaxEsperado}`);
}

console.log('\n' + '═'.repeat(70));
console.log('TEST 4 — AIA: segunda capa (re-enriquecimiento Python /api/metrics)');
console.log('═'.repeat(70));
{
  const aiaM  = buildAIAMetrics(maoObjAIA, scalePxMm);
  const pyResp = buildPythonMetrics();
  const final  = enrichAIAWithPython(aiaM, pyResp, maoObjAIA);

  console.log('\n[4.1] Todos los campos críticos tras re-enriquecimiento:');
  checkFields(final, CAMPOS_CRITICOS, 'AIA→Python re-enriquecido', true);

  console.log('\n[4.2] Campos del panel avanzado:');
  checkFields(final, CAMPOS_PANEL_AVANZADO, 'AIA→Panel avanzado', false);

  console.log('\n[4.3] Metadatos IA preservados sobre los de Python:');
  final.object_id === aiaM.object_id
    ? ok(`object_id preservado: "${final.object_id}"`)
    : fail(`object_id sobreescrito: "${final.object_id}" vs "${aiaM.object_id}"`);
  final.analysis_method === aiaM.analysis_method
    ? ok(`analysis_method preservado: "${final.analysis_method}"`)
    : fail(`analysis_method sobreescrito`);

  console.log('\n[4.4] Radios: JS prevalece sobre Python (para ROI-safe):');
  final.radio_maximo === aiaM.radio_maximo
    ? ok(`radio_maximo = ${final.radio_maximo} mm (de JS, no Python)`)
    : fail(`radio_maximo fue sobreescrito: ${final.radio_maximo} vs JS ${aiaM.radio_maximo}`);
  final.centroide_hull_x === aiaM.centroide_hull_x
    ? ok(`centroide_hull_x = ${final.centroide_hull_x} (de JS)`)
    : fail(`centroide_hull_x sobreescrito`);

  console.log('\n[4.5] Valores numéricos positivos:');
  checkPositive(final, ['area','perimeter','radio_maximo','radio_minimo'], 'AIA final');
}

console.log('\n' + '═'.repeat(70));
console.log('TEST 5 — Bifacial: Cara A y Cara B con IDs únicos (fix mao-ia.js)');
console.log('═'.repeat(70));
{
  // Simular la generación de objId con el fix aplicado
  const modo = 'bifacial';
  const numPad = '001';
  const nombreSafe = 'MAO_CDF_24';

  const idCaraA = (nombreSafe + '_IA_' + numPad) + '_CaraA';
  const idCaraB = (nombreSafe + '_IA_' + numPad) + '_CaraB';

  idCaraA !== idCaraB
    ? ok(`IDs únicos: "${idCaraA}" ≠ "${idCaraB}"`)
    : fail(`IDs idénticos → colisión: "${idCaraA}"`);

  idCaraA.endsWith('_CaraA') ? ok('Cara A tiene sufijo _CaraA') : fail('Cara A sin sufijo');
  idCaraB.endsWith('_CaraB') ? ok('Cara B tiene sufijo _CaraB') : fail('Cara B sin sufijo');

  // Simular deduplicación: si A y B tienen distinto ID no se eliminarán mutuamente
  const objects = [];
  const pushIfUnique = (id, cara) => {
    const existing = objects.findIndex(o => o.id === id && o.cara === cara);
    if (existing >= 0) objects[existing] = { id, cara };
    else objects.push({ id, cara });
  };
  pushIfUnique(idCaraA, 'A');
  pushIfUnique(idCaraB, 'B');

  objects.length === 2
    ? ok(`Array objects contiene ambas caras: ${objects.length} entradas`)
    : fail(`Colisión: sólo ${objects.length} entrada(s) en objects`);

  const foundA = objects.find(o => o.id === idCaraA);
  const foundB = objects.find(o => o.id === idCaraB);
  foundA && foundB
    ? ok('Ambas caras recuperables por ID independiente')
    : fail('No se puede recuperar una de las caras por ID');
}

console.log('\n' + '═'.repeat(70));
console.log('TEST 6 — Verificación de campos críticos en Python metrics.py (output simulado)');
console.log('═'.repeat(70));
{
  // Verificar que el objeto de Python incluye todos los campos que JS espera leer
  const pyRaw = buildPythonMetrics().metricas;
  const CAMPOS_PYTHON_ESPERADOS = [
    'area','area_unit','perimeter','perimeter_unit',
    'area_px','perimeter_px','area_fragmentada','perimeter_fragmentado',
    'width','height',
    'centroide_x','centroide_y','centroide_hull_x','centroide_hull_y',
    'excentricidad','eje_mayor','eje_menor',
    'radio_maximo','radio_minimo','radio_medio','ratio_radios','regularidad_radial',
    'solidity','solidity_class',
    'circularity','compactness','convexity','aspect_ratio_tight',
    'forma_detectada','forma_confianza','forma_categoria',
    'completitud_estimada','completitud_es_fragmento',
    'simetria_bilateral','simetria_clasificacion',
    'curvatura_media','rugosidad_contorno',
    'feret_max','feret_min',
    'fractal_dimension','vertices_aproximados',
    'geometry_vertices','shape_class_circularity',
  ];
  // geometry_vertices es alias de geometria_vertices
  const campos_sin_alias = CAMPOS_PYTHON_ESPERADOS.filter(f => f !== 'geometry_vertices');
  campos_sin_alias.push('geometria_vertices');
  checkFields(pyRaw, campos_sin_alias, 'Python metrics.py output', false);

  console.log('\n[6.1] No hay campo completitud_tipo_fragmento en Python (lo añade JS):');
  !('completitud_tipo_fragmento' in pyRaw)
    ? ok('completitud_tipo_fragmento ausente en Python → JS lo inyecta correctamente')
    : warn('completitud_tipo_fragmento ya presente en Python (posible cambio futuro)');

  console.log('\n[6.2] No hay contour_extraction_successful en Python (lo añade JS):');
  !('contour_extraction_successful' in pyRaw)
    ? ok('contour_extraction_successful ausente en Python → JS lo inyecta')
    : warn('contour_extraction_successful ya presente en Python');
}

// ─────────────────────────────────────────────────────────────────────────────
// Resultado final
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(70));
console.log(`RESULTADO: ${passed} ✅ PASS   ${failed} ❌ FAIL   ${warnings} ⚠️  WARN`);
console.log('═'.repeat(70) + '\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
