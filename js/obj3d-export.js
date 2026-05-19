/**
 * MAO Plus — OBJ3D Export Module  (obj3d-export.js)
 * ─────────────────────────────────────────────────
 * Exportación sistematizada para el modo de análisis 3D:
 *   · CSV  — métricas numéricas completas del JSON de análisis
 *   · PNG  — canvas 3D (visor) y captura de panel/pestaña vía html2canvas
 *   · SVG  — contornos / secciones canónicas como paths vectoriales
 *   · PDF  — reporte integral compuesto con jsPDF
 *   · ZIP  — paquete completo (todos los formatos anteriores)
 *
 * Patrón: IIFE que expone window.Obj3dExport
 * Dependencias opcionales: html2canvas (global), jsPDF (global, libs/jspdf.umd.min.js)
 */

'use strict';

window.Obj3dExport = (() => {

  // ──────────────────────────────────────────────────────────────────────────
  // Utilidades internas
  // ──────────────────────────────────────────────────────────────────────────

  const _fmt = (v, d = 6) => (v == null || v === '' || Number.isNaN(Number(v))) ? '' : Number(v).toFixed(d);
  const _s   = (v)         => (v == null ? '' : String(v));
  const _dl  = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const _stamp = () => new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const _fileBase = () => {
    const ident = window._obj3dGetAssignedIdentification?.();
    return (ident?.valor ? ident.valor : (window._obj3dGetFileBaseName?.() || 'obj3d'))
      .replace(/[^a-zA-Z0-9_\-]/g, '_');
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 1. CSV — métricas completas del análisis 3D
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Convierte el JSON de análisis 3D en filas CSV.
   * Formato: seccion,variable,valor,unidad,descripcion
   * @param {Object} res  - objeto devuelto por la API /api/analyze3d
   * @returns {string}    - contenido CSV completo
   */
  function analysis3dToCSV(res) {
    const rows = ['seccion,variable,valor,unidad,descripcion'];
    const push = (sec, varName, val, unit = '', desc = '') =>
      rows.push(`${sec},${varName},${_s(val).replace(/,/g, ';')},${unit},${_s(desc).replace(/,/g, ';')}`);

    const p             = res?.obj3d || res || {};
    const pca           = p?.pca    || {};
    const morph         = p?.morphometry || {};
    const canonical     = p?.orientation_canonical || {};
    const axisDef       = canonical?.axis_definition || {};
    const grav          = canonical?.gravitational || {};
    const dims          = canonical?.dimensions || {};
    const facesData     = p?.faces  || {};
    const faceAssign    = facesData?.assignment || {};
    const faceSemantic  = facesData?.semantic   || {};
    const facesCanon    = canonical?.faces      || {};
    const edgesCanon    = canonical?.edges      || {};
    const norm          = p?.normalization      || {};
    const seg           = p?.segmentation       || {};
    const mao2d         = p?.mao2d_adapted      || {};
    const oriented2d    = mao2d?.oriented_2d    || {};
    const orientedPlanes = oriented2d?.planes   || {};
    const frontBackRef  = mao2d?.front_back_reference || {};
    const fbBalance     = (p?.morphology_canonical?.front_back?.bifacial_balance) || {};
    const transSum      = p?.morphology_canonical?.transverse_summary || {};
    const coherence     = p?.coherence_mao_plus || mao2d?.coherence_2d_3d || {};
    const coherenceComp = coherence?.components || {};
    const hom3d         = p?.homologation_3d    || mao2d?.homologation_3d || {};
    const pcaSeq        = p?.pca_sequential_morphometry || {};
    const canonMorph    = p?.morphology_canonical || {};
    const maoIdx        = canonMorph?.mao_plus_indices || {};
    const mao3d         = canonMorph?.mao3d_indices || {};
    const longAxis      = axisDef?.longitudinal  || {};
    const morphPlane    = longAxis?.morphological_plane || {};
    const eigenvalues   = pca?.eigenvalues || [];
    const paridad2d     = p?.paridad_2d || {};

    // ── 01 Pipeline ────────────────────────────────────────────────────────
    push('01_Pipeline', 'analysis_level',        p?.analysis_level,              '',   'Nivel de análisis detectado');
    push('01_Pipeline', 'orientation_mode',      p?.orientation_mode,            '',   'Modo de orientación aplicado');
    push('01_Pipeline', 'norm_method',           norm?.method,                   '',   'Método de normalización');
    push('01_Pipeline', 'norm_confidence',       _fmt(norm?.confidence, 4),      '',   'Confianza del método de normalización');
    push('01_Pipeline', 'face_criterion',        faceSemantic?.criterion,        '',   'Criterio de detección de caras');
    push('01_Pipeline', 'face_mode',             facesData?.mode,                '',   'Modo de análisis de caras');
    push('01_Pipeline', 'seg_n_faces',           seg?.n_faces,                   '',   'Número de caras en la malla');
    push('01_Pipeline', 'seg_n_vertices',        seg?.n_vertices,                '',   'Número de vértices en la malla');
    push('01_Pipeline', 'seg_n_components',      seg?.n_components,              '',   'Componentes conexas detectadas');

    // ── 02 Orientación canónica ──────────────────────────────────────────
    push('02_Orientacion', 'canonical_method',         canonical?.method,                '',   'Método de orientación canónica');
    push('02_Orientacion', 'canonical_reproducible',   canonical?.reproducible,          '',   '¿Orientación reproducible?');
    push('02_Orientacion', 'reproducibility_score',    _fmt(canonical?.reproducibility_score, 4), '', 'Score de reproducibilidad');
    push('02_Orientacion', 'longitudinal_rule',        longAxis?.rule,                   '',   'Regla de eje longitudinal');
    push('02_Orientacion', 'morph_plane_name',         morphPlane?.name,                 '',   'Nombre del plano morfológico activo');
    push('02_Orientacion', 'morph_plane_equation',     morphPlane?.equation,             '',   'Ecuación del plano morfológico');
    push('02_Orientacion', 'axis_longitudinal_extent', _fmt(axisDef?.longitudinal?.extent, 4), 'u3d', 'Extensión eje longitudinal');
    push('02_Orientacion', 'axis_transversal_extent',  _fmt(axisDef?.transversal?.extent, 4),  'u3d', 'Extensión eje transversal');
    push('02_Orientacion', 'axis_dorsoventral_extent', _fmt(axisDef?.dorsoventral?.extent, 4), 'u3d', 'Extensión eje dorsoventral');
    push('02_Orientacion', 'face_A_patch',             facesCanon?.A?.patch_id,          '',   'ID de parche — Cara A');
    push('02_Orientacion', 'face_B_patch',             facesCanon?.B?.patch_id,          '',   'ID de parche — Cara B');
    push('02_Orientacion', 'face_front_assign',        faceAssign?.front,                '',   'Asignación de cara frontal (ANVERSO)');
    push('02_Orientacion', 'face_reverse_assign',      faceAssign?.reverse,              '',   'Asignación de cara reverso');
    push('02_Orientacion', 'edge_proximal_x',          _fmt(edgesCanon?.proximal?.x_value, 4), 'u3d', 'Posición X borde proximal');
    push('02_Orientacion', 'edge_distal_x',            _fmt(edgesCanon?.distal?.x_value,  4),  'u3d', 'Posición X borde distal');
    push('02_Orientacion', 'resting_stability_score',  _fmt(grav?.resting_stability_score, 3), '',   'Score de estabilidad en reposo');
    push('02_Orientacion', 'stability_margin',         _fmt(grav?.stability_margin, 3),         '',   'Margen de estabilidad gravitacional');
    push('02_Orientacion', 'dim_ancho',                _fmt(dims?.ancho, 4),             'u3d', 'Ancho en reposo');
    push('02_Orientacion', 'dim_alto',                 _fmt(dims?.alto, 4),              'u3d', 'Alto en reposo');
    push('02_Orientacion', 'dim_espesor',              _fmt(dims?.espesor, 4),           'u3d', 'Espesor en reposo');

    // ── 03 Morfometría base ──────────────────────────────────────────────
    push('03_Morfometria', 'thickness_ratio',   _fmt(morph?.thickness_ratio, 6),  '',    'Ratio de espesor dorsoventral');
    push('03_Morfometria', 'anisotropy',        _fmt(morph?.anisotropy, 6),       '',    'Anisotropía global');
    push('03_Morfometria', 'planarity',         _fmt(morph?.planarity, 6),        '',    'Planaridad (proximidad a plano)');
    push('03_Morfometria', 'elongation',        _fmt(morph?.elongation, 6),       '',    'Elongación longitudinal');
    push('03_Morfometria', 'surface_area',      _fmt(p?.surface_area, 4),         'u3d²','Área superficial total');
    push('03_Morfometria', 'volume',            _fmt(p?.volume, 4),               'u3d³','Volumen total');
    push('03_Morfometria', 'pca_linearity',     _fmt(pca?.linearity, 6),          '',    'Linealidad PCA');
    push('03_Morfometria', 'pca_sphericity',    _fmt(pca?.sphericity, 6),         '',    'Esfericidad PCA');
    eigenvalues.forEach((ev, i) =>
      push('03_Morfometria', `pca_eigenvalue_${i + 1}`, _fmt(ev, 8), '', `Autovalor PCA λ${i + 1}`)
    );
    (pca?.pca_extents || []).forEach((ex, i) =>
      push('03_Morfometria', `pca_extent_${i + 1}`, _fmt(ex, 4), 'u3d', `Extensión PCA eje ${i + 1}`)
    );

    // ── 03b Paridad 2D ↔ 3D — descriptores derivados del convex hull, ──
    //    esfericidad Wadell, Feret 3D, dimensión fractal box-counting
    push('03b_Paridad2D', 'convex_hull_area',        _fmt(paridad2d?.convex_hull_area, 4),        'u3d²', 'Área de la envolvente convexa 3D');
    push('03b_Paridad2D', 'convex_hull_volume',      _fmt(paridad2d?.convex_hull_volume, 4),      'u3d³', 'Volumen de la envolvente convexa 3D');
    push('03b_Paridad2D', 'solidity_3d',             _fmt(paridad2d?.solidity_3d, 6),             '',     'Solidez 3D (V_real / V_hull)');
    push('03b_Paridad2D', 'convexity_3d',            _fmt(paridad2d?.convexity_3d, 6),            '',     'Convexidad 3D (A_hull / A_real)');
    push('03b_Paridad2D', 'sphericity_wadell',       _fmt(paridad2d?.sphericity_wadell, 6),       '',     'Esfericidad de Wadell 3D');
    push('03b_Paridad2D', 'compactness_3d',          _fmt(paridad2d?.compactness_3d, 6),          '',     'Compacidad 3D adimensional (36πV²/A³)');
    push('03b_Paridad2D', 'equivalent_diameter_3d', _fmt(paridad2d?.equivalent_diameter_3d, 4),  'u3d',  'Diámetro esférico equivalente');
    push('03b_Paridad2D', 'feret_3d_max',            _fmt(paridad2d?.feret_3d_max, 4),            'u3d',  'Calibre Feret máximo 3D');
    push('03b_Paridad2D', 'feret_3d_min',            _fmt(paridad2d?.feret_3d_min, 4),            'u3d',  'Calibre Feret mínimo 3D');
    push('03b_Paridad2D', 'feret_3d_ratio',          _fmt(paridad2d?.feret_3d_ratio, 6),          '',     'Ratio Feret 3D (min/max)');
    push('03b_Paridad2D', 'aspect_ratio_3d_max_min', _fmt(paridad2d?.aspect_ratio_3d_max_min, 6), '',     'Aspect ratio 3D (extent max/min)');
    push('03b_Paridad2D', 'aspect_ratio_3d_max_mid', _fmt(paridad2d?.aspect_ratio_3d_max_mid, 6), '',     'Aspect ratio 3D (extent max/mid)');
    push('03b_Paridad2D', 'fractal_dimension_3d',    _fmt(paridad2d?.fractal_dimension_3d, 4),    '',     'Dimensión fractal 3D (box-counting)');
    push('03b_Paridad2D', 'fractal_method',          paridad2d?.fractal_method,                   '',     'Método de cálculo fractal');
    push('03b_Paridad2D', 'is_watertight',           paridad2d?.is_watertight ? 'Sí' : 'No',      '',     '¿Malla cerrada (watertight)?');

    // ── 04 Homologación 2D↔3D ────────────────────────────────────────────
    push('04_Hom2D3D', 'ref_plane',              frontBackRef?.plane || oriented2d?.reference_plane, '', 'Plano de referencia 2D');
    push('04_Hom2D3D', 'area_2d_ref',            _fmt(frontBackRef?.area_2d, 4),          'u3d²','Área 2D de referencia FRONT/BACK');
    push('04_Hom2D3D', 'perimeter_2d_ref',       _fmt(frontBackRef?.perimeter_2d, 4),     'u3d', 'Perímetro 2D de referencia');
    push('04_Hom2D3D', 'circularity_2d_ref',     _fmt(frontBackRef?.circularity_2d, 4),   '',    'Circularidad 2D de referencia');
    push('04_Hom2D3D', 'aspect_ratio_2d_ref',    _fmt(frontBackRef?.aspect_ratio_2d, 4),  '',    'Aspect ratio 2D de referencia');
    push('04_Hom2D3D', 'fb_area_balance',        _fmt(fbBalance?.area_balance, 4),        '',    'Balance de área FRONT/BACK');
    push('04_Hom2D3D', 'fb_perimeter_balance',   _fmt(fbBalance?.perimeter_balance, 4),   '',    'Balance de perímetro FRONT/BACK');
    push('04_Hom2D3D', 'transverse_sections_n',  transSum?.count,                          '',    'Número de secciones transversales');
    push('04_Hom2D3D', 'transverse_mean_area',   _fmt(transSum?.mean_area, 4),            'u3d²','Área media de secciones transversales');
    push('04_Hom2D3D', 'transverse_mean_thick_z',_fmt(transSum?.mean_thickness_z, 4),     'u3d', 'Espesor Z medio de secciones');
    push('04_Hom2D3D', 'transverse_mean_circ',   _fmt(transSum?.mean_circularity, 4),     '',    'Circularidad media de secciones');
    push('04_Hom2D3D', 'transverse_mean_solid',  _fmt(transSum?.mean_solidity, 4),        '',    'Solidez media de secciones');
    push('04_Hom2D3D', 'transverse_mean_elong',  _fmt(transSum?.mean_elongation, 4),      '',    'Elongación media de secciones');
    push('04_Hom2D3D', 'coherence_score',        _fmt(coherence?.score, 4),               '',    'Score coherencia 2D↔3D');
    push('04_Hom2D3D', 'coherence_level',        coherence?.level,                         '',    'Nivel coherencia 2D↔3D');
    push('04_Hom2D3D', 'coh_bifacial_homology',  _fmt(coherenceComp?.bifacial_homology, 4),  '', 'Componente bifacial de coherencia');
    push('04_Hom2D3D', 'coh_longitudinal_stab',  _fmt(coherenceComp?.longitudinal_stability, 4), '', 'Componente longitudinal de coherencia');
    push('04_Hom2D3D', 'coh_shape_consistency',  _fmt(coherenceComp?.shape_consistency, 4),   '', 'Consistencia de forma');
    push('04_Hom2D3D', 'coh_thickness_consist',  _fmt(coherenceComp?.thickness_consistency, 4), '', 'Consistencia de espesor');
    if (orientedPlanes?.lateral_xz) {
      push('04_Hom2D3D', 'plane_lateral_xz_area',_fmt(orientedPlanes.lateral_xz.area, 4), 'u3d²','Área plano lateral XZ');
      push('04_Hom2D3D', 'plane_lateral_xz_ar',  _fmt(orientedPlanes.lateral_xz.aspect_ratio, 4), '', 'AR plano lateral XZ');
    }
    if (orientedPlanes?.transversal_yz) {
      push('04_Hom2D3D', 'plane_transv_yz_area',  _fmt(orientedPlanes.transversal_yz.area, 4), 'u3d²','Área plano transversal YZ');
      push('04_Hom2D3D', 'plane_transv_yz_ar',    _fmt(orientedPlanes.transversal_yz.aspect_ratio, 4), '', 'AR plano transversal YZ');
    }

    // ── 05 MAO Plus — índices morfología canónica ────────────────────────
    Object.entries(maoIdx).forEach(([k, v]) =>
      push('05_MaoPlus_Indices', k, typeof v === 'number' ? _fmt(v, 6) : _s(v), '', `Índice MAO Plus: ${k}`)
    );
    Object.entries(mao3d).forEach(([k, v]) =>
      push('05_MaoPlus_3D', k, typeof v === 'number' ? _fmt(v, 6) : _s(v), '', `Índice 3D seccional: ${k}`)
    );

    // ── 06 PCA · Procrustes secuencial ───────────────────────────────────
    push('06_PCA_Procrustes', 'overall_mean_similarity', _fmt(pcaSeq?.overall?.mean_procrustes_similarity, 4), '', 'Similaridad Procrustes media global');
    push('06_PCA_Procrustes', 'overall_consistency',     pcaSeq?.overall?.consistency_level, '', 'Nivel de consistencia global');
    push('06_PCA_Procrustes', 'overall_n_comparisons',   pcaSeq?.overall?.n_comparisons,     '', 'Número de comparaciones');
    (pcaSeq?.sections || []).forEach((sec, i) => {
      const pf = `06_PCA_Procrustes_sec${i + 1}`;
      push(pf, 'section_id',   sec?.section_id,                            '', `Sección ${i + 1} ID`);
      push(pf, 'similarity',   _fmt(sec?.procrustes_similarity, 4),        '', `Similaridad Procrustes sección ${i + 1}`);
      push(pf, 'rotation_deg', _fmt(sec?.rotation_angle_degrees, 2),       '°', `Rotación Procrustes sección ${i + 1}`);
      push(pf, 'scale_ratio',  _fmt(sec?.scale_ratio, 4),                  '', `Ratio escala Procrustes sección ${i + 1}`);
    });

    // ── 07 Homologación 3D ───────────────────────────────────────────────
    push('07_Hom3D', 'hom_score',         _fmt(hom3d?.homologation?.score, 4),          '', 'Score de homologación 3D');
    push('07_Hom3D', 'hom_level',         hom3d?.homologation?.level,                    '', 'Nivel de homologación 3D');
    push('07_Hom3D', 'hom_comparable',    hom3d?.homologation?.is_comparable,            '', '¿Es comparable inter-objeto?');
    push('07_Hom3D', 'hom_method',        hom3d?.method,                                 '', 'Método de homologación');
    push('07_Hom3D', 'hom_reference_set', hom3d?.reference_set,                          '', 'Conjunto de referencia');

    return rows.join('\n');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Export CSV
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Genera y descarga el CSV con todas las métricas 3D.
   * @param {Object} res - objeto de análisis 3D (state.lastMetrics en el visor)
   */
  function exportCSV(res) {
    if (!res) { window.toast?.error('No hay análisis 3D disponible para exportar.'); return; }
    const content = analysis3dToCSV(res);
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    _dl(blob, `${_fileBase()}_metricas3d_${_stamp()}.csv`);
    window.toast?.success('CSV 3D exportado correctamente.');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Export PNG — canvas del visor (reutiliza el flujo existente)
  // ──────────────────────────────────────────────────────────────────────────

  function exportCanvasPNG() {
    const canvas = document.getElementById('obj3dCanvas');
    if (!canvas) { window.toast?.error('No hay canvas 3D disponible.'); return; }
    try {
      const dataUrl  = canvas.toDataURL('image/png');
      const blob     = _dataUrlToBlob(dataUrl);
      _dl(blob, `${_fileBase()}_visor3d_${_stamp()}.png`);
      window.toast?.success('PNG del visor 3D exportado.');
    } catch (e) {
      console.error('[Obj3dExport] PNG error:', e);
      window.toast?.error('No se pudo exportar el PNG del visor.');
    }
  }

  function _dataUrlToBlob(dataUrl) {
    const [meta, b64] = dataUrl.split(',');
    const mime = meta.match(/:(.*?);/)[1];
    const bin  = atob(b64);
    const arr  = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Export PNG — captura de un panel del Datos 3D
  // ──────────────────────────────────────────────────────────────────────────

  async function exportPanelPNG(paneId) {
    const el = document.getElementById(`obj3dPane-${paneId}`)
            || document.getElementById(`obj3dMetrics-${paneId}`)
            || document.getElementById(paneId);
    if (!el) { window.toast?.error(`Panel "${paneId}" no encontrado.`); return; }

    if (typeof html2canvas === 'undefined') {
      window.toast?.error('html2canvas no disponible. No se puede capturar el panel.');
      return;
    }
    try {
      window.toast?.info('Capturando panel…');
      const cnv = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
      const blob = await new Promise(r => cnv.toBlob(r, 'image/png'));
      _dl(blob, `${_fileBase()}_panel_${paneId}_${_stamp()}.png`);
      window.toast?.success(`PNG del panel "${paneId}" exportado.`);
    } catch (e) {
      console.error('[Obj3dExport] Panel PNG error:', e);
      window.toast?.error('Error al capturar el panel.');
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Export SVG — contornos canónicos (secciones planas)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Genera un SVG con las secciones canónicas (transversal, coronal, frontal)
   * si están presentes en el análisis.
   */
  function exportSVG(res) {
    if (!res) { window.toast?.error('No hay análisis 3D disponible.'); return; }

    const p        = res?.obj3d || res || {};
    const sections = p?.canonical_sections || p?.morphology_canonical?.canonical_sections || [];

    if (!sections.length) {
      window.toast?.warning('No hay contornos canónicos en el análisis para exportar como SVG.');
      return;
    }

    const PAD = 20;
    // Calcular bounding box global
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    sections.forEach(sec => {
      (sec?.contour_2d || []).forEach(([x, y]) => {
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      });
    });
    const W = (maxX - minX) + PAD * 2;
    const H = (maxY - minY) + PAD * 2;
    const ox = PAD - minX;
    const oy = PAD - minY;

    const COLORS = ['#1e88e5', '#e53935', '#43a047', '#fb8c00', '#8e24aa'];
    let paths = '';
    sections.forEach((sec, i) => {
      const pts = sec?.contour_2d || [];
      if (!pts.length) return;
      const d = pts.map(([x, y], j) => `${j === 0 ? 'M' : 'L'}${(x + ox).toFixed(2)},${(y + oy).toFixed(2)}`).join(' ') + ' Z';
      const col = COLORS[i % COLORS.length];
      const label = sec?.section_type || sec?.id || `sec${i + 1}`;
      paths += `  <g id="${label}">\n`;
      paths += `    <path d="${d}" fill="none" stroke="${col}" stroke-width="1.5" opacity="0.85"/>\n`;
      paths += `    <text x="${(pts[0][0] + ox).toFixed(1)}" y="${(pts[0][1] + oy - 4).toFixed(1)}" font-family="Arial" font-size="8" fill="${col}">${label}</text>\n`;
      paths += `  </g>\n`;
    });

    const ident = _fileBase();
    const svg = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(1)}" height="${H.toFixed(1)}" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}">`,
      `  <title>Contornos canónicos — ${ident}</title>`,
      `  <desc>Exportado desde MAO Plus · ${new Date().toLocaleString('es-ES')}</desc>`,
      `  <rect width="100%" height="100%" fill="#ffffff"/>`,
      paths,
      `</svg>`,
    ].join('\n');

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    _dl(blob, `${ident}_contornos3d_${_stamp()}.svg`);
    window.toast?.success('SVG de contornos 3D exportado.');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Export PDF — reporte integral
  // ──────────────────────────────────────────────────────────────────────────

  async function exportPDF(res) {
    if (typeof window.jspdf === 'undefined' && typeof jsPDF === 'undefined') {
      window.toast?.error('jsPDF no disponible. Asegúrate de que libs/jspdf.umd.min.js está cargado.');
      return;
    }
    if (!res) { window.toast?.error('No hay análisis 3D disponible.'); return; }

    window.toast?.info('Generando PDF 3D… puede tardar unos segundos.');
    try {
      const jsPDFCtor = (typeof jsPDF !== 'undefined') ? jsPDF : window.jspdf.jsPDF;
      const doc  = new jsPDFCtor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const PW   = doc.internal.pageSize.getWidth();
      const PH   = doc.internal.pageSize.getHeight();
      const MARG = 14;
      const CW   = PW - MARG * 2;
      let   y    = MARG;

      const addTitle = (text, size = 13, color = [30, 136, 229]) => {
        doc.setFontSize(size);
        doc.setTextColor(...color);
        doc.text(text, MARG, y);
        y += size * 0.5 + 2;
        doc.setTextColor(0, 0, 0);
      };
      const addLine = (text, size = 9) => {
        doc.setFontSize(size);
        doc.text(text, MARG, y, { maxWidth: CW });
        y += size * 0.45 + 1;
      };
      const checkPage = (needed = 10) => {
        if (y + needed > PH - MARG) { doc.addPage(); y = MARG; }
      };

      // ── Portada ──────────────────────────────────────────────────────────
      addTitle('Reporte análisis 3D — MAO Plus', 16);
      addLine(`Objeto: ${_fileBase()}`);
      addLine(`Fecha: ${new Date().toLocaleString('es-ES')}`);
      y += 4;

      // ── Canvas 3D como imagen ────────────────────────────────────────────
      const canvas3d = document.getElementById('obj3dCanvas');
      if (canvas3d) {
        try {
          const imgData = canvas3d.toDataURL('image/jpeg', 0.85);
          const ratio   = canvas3d.height / canvas3d.width;
          const imgW    = CW;
          const imgH    = imgW * ratio;
          checkPage(imgH + 4);
          doc.addImage(imgData, 'JPEG', MARG, y, imgW, Math.min(imgH, PH * 0.45));
          y += Math.min(imgH, PH * 0.45) + 4;
        } catch (_) { /* canvas tainted — skip */ }
      }

      // ── Paneles de métricas como imágenes (html2canvas si disponible) ───
      const panes = ['metricas', 'pipeline', 'orientacion', 'morfometria', 'hom2d3d', 'maoplus', 'pcaprocrustes', 'hom3d'];
      if (typeof html2canvas !== 'undefined') {
        for (const pid of panes) {
          const el = document.getElementById(`obj3dPane-${pid}`);
          if (!el || el.style.display === 'none') continue;
          try {
            const cnv   = await html2canvas(el, { scale: 1.5, backgroundColor: '#ffffff', useCORS: true, logging: false });
            const imgD  = cnv.toDataURL('image/jpeg', 0.85);
            const ratio = cnv.height / cnv.width;
            const iW    = CW;
            const iH    = Math.min(iW * ratio, PH * 0.4);
            checkPage(iH + 8);
            addTitle(`Panel: ${pid}`, 11, [80, 80, 80]);
            doc.addImage(imgD, 'JPEG', MARG, y, iW, iH);
            y += iH + 6;
          } catch (_) { /* skip pane */ }
        }
      }

      // ── Tabla de métricas CSV (texto) ────────────────────────────────────
      checkPage(12);
      addTitle('Métricas numéricas completas', 12);
      y += 2;
      const csvRows = analysis3dToCSV(res).split('\n').slice(1); // skip header
      doc.setFontSize(7);
      doc.setTextColor(40, 40, 40);
      for (const row of csvRows) {
        checkPage(5);
        const [sec, varName, val, unit, desc] = row.split(',');
        const line = `${(sec || '').padEnd(22)} ${(varName || '').padEnd(30)} ${(val || '').padEnd(12)} ${unit || ''}`;
        doc.text(line, MARG, y, { maxWidth: CW });
        y += 3.8;
      }

      doc.save(`${_fileBase()}_reporte3d_${_stamp()}.pdf`);
      window.toast?.success('PDF 3D exportado correctamente.');
    } catch (e) {
      console.error('[Obj3dExport] PDF error:', e);
      window.toast?.error('Error al generar el PDF.');
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // API pública
  // ──────────────────────────────────────────────────────────────────────────

  return {
    exportCSV,
    exportCanvasPNG,
    exportPanelPNG,
    exportSVG,
    exportPDF,
    analysis3dToCSV,
  };

})();

console.log('✅ Obj3dExport inicializado');
