// MAO Plus — Comparador Multi-Objeto (CMO)
// ============================================================================
// MÓDULO: COMPARADOR MULTI-OBJETO
// Compara métricas de múltiples análisis guardados en el proyecto activo.
// Usa loadAnalysisFromDisk() de projectManager — sin dependencias externas.
// ============================================================================
const ComparadorMultiObjeto = (() => {

  let _objetos = [];        // [{id, nombre, cara, fecha, metricas, perforaciones, estadisticas}]
  let _selIds  = new Set(); // IDs seleccionados
  let _metrSel = [];        // Keys de la última comparación generada
  let _gruposMetricasUI = []; // Catálogo vigente (grupos base + dinámicos, reconstruido tras cargar)

  // Clave localStorage por proyecto para que distintos proyectos mantengan selecciones distintas
  function _storageSelMetricasKey() {
    const pid = (typeof projectManager !== 'undefined' && projectManager?.activeProject?.id)
      ? projectManager.activeProject.id : 'global';
    return `mao_cmo_metricas_sel_${pid}`;
  }
  function _guardarSeleccionMetricas(keys) {
    try { localStorage.setItem(_storageSelMetricasKey(), JSON.stringify(keys)); } catch(e) {}
  }
  function _cargarSeleccionMetricas() {
    try {
      // Intentar primero con clave de proyecto, luego con la clave global legada
      const legacyKey = 'mao_cmo_metricas_sel';
      const raw = localStorage.getItem(_storageSelMetricasKey())
               || localStorage.getItem(legacyKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length ? parsed : null;
    } catch(e) { return null; }
  }

  // ──── CATÁLOGO DINÁMICO DE MÉTRICAS ─────────────────────────────────────────
  // Igual que en MAO_A: detecta métricas presentes en los análisis cargados que
  // no estén en el catálogo base GRUPOS y las agrupa en "XV — Métricas adicionales".
  function _normalizarEtiquetaMetricaDesdeClave(key) {
    return String(key || '')
      .replace(/^__+/, '')
      .replace(/_/g, ' ')
      .replace(/\b([a-z])/g, (_, c) => c.toUpperCase());
  }

  function _catalogoKeys(grupos) {
    const src = grupos ?? _gruposMetricasUI;
    return new Set((src || []).flatMap(g => (g.items || []).map(it => it.key)));
  }

  function _ordenarKeysSegunCatalogo(keys = []) {
    const wanted = new Set(Array.isArray(keys) ? keys : []);
    const ordered = [];
    const seen = new Set();
    (_gruposMetricasUI || []).forEach(g => {
      (g.items || []).forEach(it => {
        if (!wanted.has(it.key) || seen.has(it.key)) return;
        ordered.push(it.key);
        seen.add(it.key);
      });
    });
    [...wanted]
      .filter(k => !seen.has(k))
      .sort((a, b) => String(KEY_LABEL[a] || a).localeCompare(String(KEY_LABEL[b] || b), 'es'))
      .forEach(k => ordered.push(k));
    return ordered;
  }

  function _construirCatalogoMetricas(objs) {
    // Clonar grupos base
    const grupos = GRUPOS.map(g => ({
      id: g.id,
      label: g.label,
      items: (g.items || []).map(it => ({ ...it })),
    }));
    const known = _catalogoKeys(grupos);
    const extras = [];

    for (const o of (objs || [])) {
      const m = o?.metricas || {};
      for (const k of Object.keys(m)) {
        if (!k || known.has(k)) continue;
        const t = typeof m[k];
        if (!(t === 'number' || t === 'string' || t === 'boolean')) continue;
        known.add(k);
        if (!KEY_LABEL[k]) KEY_LABEL[k] = _normalizarEtiquetaMetricaDesdeClave(k);
        if (!KEY_SRC[k]) KEY_SRC[k] = 'M';
        extras.push({ key: k, label: KEY_LABEL[k], src: KEY_SRC[k] });
      }
    }

    if (extras.length) {
      extras.sort((a, b) => String(a.label).localeCompare(String(b.label), 'es'));
      grupos.push({
        id: 'adicionales_detectadas',
        label: 'XV — Métricas adicionales detectadas en análisis',
        items: extras,
      });
    }
    return grupos;
  }

  // ──── GRUPOS DE MÉTRICAS  (orden = secciones I–VIII + X del Informe PDF) ──
  // src: 'H'=Convex Hull (forma estimada), 'R'=Contorno Real (estado preservado), 'M'=Mixta/derivada
  const GRUPOS = [
    { id: 'clasificacion', label: 'I — Clasificación morfológica', items: [
      { key: 'forma_confianza',                        label: 'Confianza de clasificación [0–1]',        src: 'H' },
      { key: 'symmetry_score',                         label: 'Simetría bilateral [0–1]',                src: 'R' },
      { key: 'simetria_distancia_asimetria',           label: 'Desplazamiento de asimetría (mm)',        src: 'R' },
      { key: 'simetria_distancia_asimetria_px',        label: 'Desplazamiento de asimetría (px)',        src: 'R' },
    ]},
    { id: 'dimensiones', label: 'II — Dimensiones métricas', items: [
      { key: 'area',                                   label: 'Área bruta (mm²)',                        src: 'H' },
      { key: 'area_neta',                              label: '★ Área neta efectiva (mm²) [bruta − P/H]',src: 'H' },
      { key: 'perimeter',                              label: 'Perímetro externo (mm)',                   src: 'H' },
      { key: 'perimeter_neto',                         label: '★ Perímetro neto topológico (mm) [ext + ΣP/H]', src: 'H' },
      { key: 'ancho_mm',                               label: 'Ancho BB (mm)',                           src: 'H' },
      { key: 'alto_mm',                                label: 'Alto BB (mm)',                            src: 'H' },
      { key: 'eje_mayor_mm',                           label: 'Eje mayor (mm)',                          src: 'R' },
      { key: 'eje_menor_mm',                           label: 'Eje menor (mm)',                          src: 'R' },
      { key: 'feret_max',                              label: 'Feret máx (mm)',                          src: 'H' },
      { key: 'feret_min',                              label: 'Feret mín (mm)',                          src: 'H' },
      { key: 'radio_max',                              label: 'Radio máx desde centroide (mm)',           src: 'H' },
      { key: 'radio_min',                              label: 'Radio mín desde centroide (mm)',           src: 'H' },
      { key: 'radio_medio',                            label: 'Radio medio desde centroide (mm)',         src: 'H' },
    ]},
    { id: 'proporciones', label: 'III — Proporciones y forma global', items: [
      { key: 'circularity',                            label: 'Circularidad C [0–1]',                    src: 'H' },
      { key: 'compactness',                            label: 'Compacidad [0–1] ≡ Circularidad',         src: 'H', pcaExclude: true },
      { key: 'solidity',                               label: 'Solidez S [0–1]',                         src: 'M' },
      { key: 'convexity',                              label: 'Convexidad V [0–1]',                      src: 'M' },
      { key: 'rectangularidad',                        label: 'Rectangularidad [0–1]',                   src: 'H' },
      { key: 'elongation',                             label: 'Elongación E [0–1]',                      src: 'H' },
      { key: 'shape_factor',                           label: 'Factor de forma [0–1]',                   src: 'H' },
      { key: 'excentricidad',                          label: 'Excentricidad [0–1]',                     src: 'R' },
      { key: 'aspect_ratio',                           label: 'Aspect Ratio AR',                         src: 'H' },
      { key: 'feret_ratio',                            label: 'Ratio Feret',                             src: 'H' },
      { key: 'anisotropy',                             label: 'Anisotropía [0–1]',                       src: 'R' },
      { key: 'bounding_box_efficiency',                label: 'Eficiencia Bounding Box [0–1]',           src: 'R' },
    ]},
    { id: 'radial', label: 'IV — Regularidad del contorno', items: [
      { key: 'regularidad_radial',                     label: 'Regularidad radial (%)',                  src: 'H' },
      { key: 'cv_radial',                              label: 'CV Radial (%)',                           src: 'H' },
      { key: 'desviacion_radial',                      label: 'Desviación radial (mm)',                  src: 'H' },
      { key: 'ratio_radios',                           label: 'Ratio radios (máx/mín)',                  src: 'H' },
      { key: 'estrellamiento',                         label: 'Estrellamiento IS [0–1]',                 src: 'H' },
      { key: 'lobularidad',                            label: 'Lobularidad L [0–1]',                     src: 'H' },
    ]},
    { id: 'contorno', label: 'V — Rugosidad y complejidad del borde', items: [
      { key: 'rugosidad',                              label: 'Rugosidad ρ',                             src: 'R' },
      { key: 'icc',                                    label: 'Índice de complejidad ICC',               src: 'R' },
      { key: 'rugosidad_longitud_segmento_media',      label: 'Long. media segmento (mm)',               src: 'R' },
      { key: 'rugosidad_desviacion',                   label: 'Desviación rugosidad (mm)',               src: 'R' },
      { key: 'curvatura_media',                        label: 'Curvatura media κ̄',                       src: 'R' },
      { key: 'curvatura_maxima',                       label: 'Curvatura máxima',                        src: 'R' },
      { key: 'curvatura_desviacion',                   label: 'Desviación curvatura',                    src: 'R' },
      { key: 'energia_curvatura',                      label: 'Energía curvatura Eκ',                    src: 'R' },
      { key: 'puntos_inflexion',                       label: 'Puntos de inflexión',                     src: 'R' },
      { key: 'puntos_esquina',                         label: 'Puntos de esquina',                       src: 'R' },
    ]},
    { id: 'orientacion', label: 'VI — Orientación y posición espacial', items: [
      { key: 'orientation',                            label: 'Ángulo eje principal (°)',                src: 'R' },
      { key: 'feret_angulo_max',                       label: 'Ángulo Feret máx (°)',                    src: 'H' },
      { key: 'feret_angulo_min',                       label: 'Ángulo Feret mín (°)',                    src: 'H' },
      { key: 'centroide_x',                            label: 'Centroide X (px)',                        src: 'H' },
      { key: 'centroide_y',                            label: 'Centroide Y (px)',                        src: 'H' },
    ]},
    { id: 'vertices', label: 'VII — Geometría de vértices', items: [
      { key: 'num_vertices',                           label: 'N° vértices',                             src: 'R' },
      { key: 'angulo_medio',                           label: 'Ángulo medio vértices (°)',               src: 'R' },
      { key: 'angulo_predominante',                    label: 'Ángulo predominante (°)',                  src: 'R' },
      { key: 'desviacion_angulos',                     label: 'Desviación ángulos (°)',                  src: 'R' },
      { key: 'angulos_rectos',                         label: 'Ángulos rectos (~90°)',                   src: 'R' },
      { key: 'angulos_agudos',                         label: 'Ángulos agudos (<90°)',                   src: 'R' },
      { key: 'angulos_obtusos',                        label: 'Ángulos obtusos (>90°)',                  src: 'R' },
    ]},
    { id: 'conservacion', label: 'VIII — Conservación y fragmentación', items: [
      { key: 'completitud_estimada',                        label: 'Completitud estimada (%)',                src: 'M' },
      { key: 'cobertura_angular',                           label: 'Cobertura angular (%)',                   src: 'M' },
      { key: 'perdida_area_fragmentacion_percent',          label: 'Pérdida área fragmentación (%)',          src: 'M' },
      { key: 'perdida_perimetro_fragmentacion_percent',     label: 'Pérdida perímetro fragmentación (%)',     src: 'M' },
      { key: 'area_fragmentada',                            label: 'Área fragmentada (mm²)',                  src: 'R' },
      { key: 'perimeter_fragmentado',                       label: 'Perímetro fragmentado (mm)',              src: 'R' },
      { key: 'circularity_fragmentada',                     label: 'Circularidad s/fragmentación [0–1]',      src: 'R' },
      { key: 'compactness_fragmentada',                     label: 'Compacidad s/fragmentación [0–1]',        src: 'R' },
      { key: 'rectangularity_fragmentada',                  label: 'Rectangularidad s/fragmentación [0–1]',   src: 'R' },
      { key: 'shape_factor_fragmentado',                    label: 'Factor forma s/fragmentación [0–1]',      src: 'R' },
    ]},
    { id: 'perforaciones', label: 'X(a) — Recuento y superficies P/H', items: [
      { key: '__n_perforaciones',                             label: 'N° total P/H (perforaciones + horadaciones)', src: 'M' },
      { key: 'num_perforaciones',                            label: 'N° perforaciones',                           src: 'M' },
      { key: 'num_horadaciones',                             label: 'N° horadaciones',                            src: 'M' },
      { key: 'area_neta',                                    label: '★ Área neta efectiva (mm²) [bruta − P/H]',   src: 'H' },
      { key: 'perimeter_neto',                               label: '★ Perímetro neto topológico (mm) [ext + ΣP/H]', src: 'H' },
      { key: 'porosidad',                                    label: 'Porosidad total (%) [P+H]',                  src: 'M' },
      { key: 'area_perforaciones',                           label: 'Área total perforaciones (mm²)',              src: 'R' },
      { key: 'area_horadaciones',                            label: 'Área total horadaciones (mm²)',               src: 'R' },
      { key: 'porcentaje_perforado',                         label: '% área perforada [sólo P]',                  src: 'M' },
      { key: 'porcentaje_horadado',                          label: '% área horadada [sólo H]',                   src: 'M' },
      { key: 'patron_agrupamiento_confianza',                label: 'Confianza patrón P/H (%)',                   src: 'M' },
    ]},
    { id: 'perforaciones_morfologia', label: 'X(b) — Morfología media de P/H', items: [
      { key: 'perforaciones_circularidad_promedio',          label: 'Circularidad media P [0–1]',                 src: 'H' },
      { key: 'perforaciones_regularidad_radial_promedio',    label: 'Regularidad radial media P (%)',             src: 'H' },
      { key: 'perforaciones_desviacion_radial_promedio',      label: 'Desviación radial media P (mm)',             src: 'H' },
      { key: 'perforaciones_excentricidad_promedio',         label: 'Excentricidad media P [0–1]',                src: 'R' },
      { key: 'perforaciones_aspecto_promedio',               label: 'Ratio aspecto medio P',                      src: 'H' },
      { key: 'perforaciones_solidez_promedio',               label: 'Solidez media P [0–1]',                      src: 'M' },
      { key: 'perforaciones_convexidad_promedio',            label: 'Convexidad media P [0–1]',                   src: 'M' },
      { key: 'perforaciones_radio_maximo_promedio',          label: 'Radio máx. medio P (mm)',                    src: 'H' },
      { key: 'perforaciones_radio_minimo_promedio',          label: 'Radio mín. medio P (mm)',                    src: 'H' },
      { key: 'perforaciones_perimetro_promedio',             label: 'Perímetro medio P (mm)',                     src: 'H' },
      { key: 'horadaciones_circularidad_promedio',           label: 'Circularidad media H [0–1]',                 src: 'H' },
      { key: 'horadaciones_regularidad_radial_promedio',     label: 'Regularidad radial media H (%)',             src: 'H' },
      { key: 'horadaciones_desviacion_radial_promedio',       label: 'Desviación radial media H (mm)',             src: 'H' },
      { key: 'perforaciones_shape_factor_promedio',           label: 'Factor de Forma medio P',                   src: 'M' },
      { key: 'horadaciones_shape_factor_promedio',            label: 'Factor de Forma medio H',                   src: 'M' },
      { key: 'perforaciones_rectangularity_promedio',         label: 'Rectangularidad media P [0–1]',             src: 'H' },
      { key: 'horadaciones_rectangularity_promedio',          label: 'Rectangularidad media H [0–1]',             src: 'H' },
      { key: 'perforaciones_feret_max_promedio',              label: 'Feret Máx. medio P (mm)',                   src: 'H' },
      { key: 'horadaciones_feret_max_promedio',               label: 'Feret Máx. medio H (mm)',                   src: 'H' },
      { key: 'perforaciones_feret_min_promedio',              label: 'Feret Mín. medio P (mm)',                   src: 'H' },
      { key: 'horadaciones_feret_min_promedio',               label: 'Feret Mín. medio H (mm)',                   src: 'H' },
      { key: 'horadaciones_excentricidad_promedio',          label: 'Excentricidad media H [0–1]',                src: 'R' },
      { key: 'horadaciones_aspecto_promedio',                label: 'Ratio aspecto medio H',                      src: 'H' },
      { key: 'horadaciones_solidez_promedio',                label: 'Solidez media H [0–1]',                      src: 'M' },
      { key: 'horadaciones_convexidad_promedio',             label: 'Convexidad media H [0–1]',                   src: 'M' },
      { key: 'horadaciones_radio_maximo_promedio',           label: 'Radio máx. medio H (mm)',                    src: 'H' },
      { key: 'horadaciones_radio_minimo_promedio',           label: 'Radio mín. medio H (mm)',                    src: 'H' },
      { key: 'horadaciones_perimetro_promedio',              label: 'Perímetro medio H (mm)',                     src: 'H' },
    ]},
    { id: 'perforaciones_dist', label: 'X(c) — Distribución espacial P/H', items: [
      { key: 'perforaciones_densidad_espacial',              label: 'Densidad espacial P (n/mm²)',                src: 'M' },
      { key: 'horadaciones_densidad_espacial',               label: 'Densidad espacial H (n/mm²)',                src: 'M' },
      { key: 'perforaciones_homogeneidad_morfologica',       label: 'Homogeneidad morfológica P [0–1]',           src: 'M' },
      { key: 'horadaciones_homogeneidad_morfologica',        label: 'Homogeneidad morfológica H [0–1]',           src: 'M' },
    ]},
    { id: 'textura_superficie', label: 'XIV — Textura de superficie', items: [
      { key: 'varianza_interna',    label: 'Varianza interna σ² (dispersión tonal)',    src: 'R' },
      { key: 'entropia_superficie', label: 'Entropía superficial H [bits, 0–8]',         src: 'R' },
      { key: 'gradiente_medio',     label: 'Gradiente medio Sobel Ḡ (bordes intern.)',  src: 'R' },
      { key: 'glcm_contrast',       label: 'GLCM — Contraste (heterogeneidad local)',    src: 'R' },
      { key: 'glcm_dissimilarity',  label: 'GLCM — Disimilaridad',                       src: 'R' },
      { key: 'glcm_homogeneity',    label: 'GLCM — Homogeneidad (uniformidad local)',    src: 'R' },
      { key: 'glcm_energy',         label: 'GLCM — Energía ASM (uniformidad global)',    src: 'R' },
      { key: 'glcm_correlation',    label: 'GLCM — Correlación (dependencia lineal)',    src: 'R' },
      { key: 'glcm_entropy',        label: 'GLCM — Entropía (complejidad textural)',     src: 'R' },
    ]},
    { id: 'efa', label: 'EFA — Análisis elíptico de Fourier', items: [
      { key: 'efa_n_harmonics',       label: 'Armónicos calculados (N)',                  src: 'R' },
      { key: 'efa_harmonics_95pct',   label: 'Armónicos para 95% varianza (h)',           src: 'R' },
      { key: 'efa_harmonics_99pct',   label: 'Armónicos para 99% varianza (h)',           src: 'R' },
      { key: 'efa_n_points',          label: 'Puntos de contorno entrada (N)',            src: 'R' },
    ]},
    { id: 'error_optico', label: 'IX — Incertidumbre óptica posicional', items: [
      { key: 'error_optico_lineal_percent', label: 'Error óptico lineal ± (%)',           src: 'M' },
      { key: 'error_optico_area_percent',   label: 'Error óptico de área ± (%)',           src: 'M' },
    ]},
    { id: 'deteccion', label: 'XV — Confianza de detección (ADR-008)', items: [
      { key: 'detection_confidence',  label: 'Confianza de detección [0–1]',              src: 'M' },
    ]},
  ];

  const KEY_LABEL = {};
  const KEY_SRC        = {};
  const KEY_PCA_EXCLUDE = new Set();
  GRUPOS.forEach(g => g.items.forEach(it => {
    KEY_LABEL[it.key] = it.label;
    KEY_SRC[it.key]   = it.src || '';
    if (it.pcaExclude) KEY_PCA_EXCLUDE.add(it.key);
  }));

  // Catálogo inicial = grupos base (se enriquece con _construirCatalogoMetricas tras cargar objetos)
  _gruposMetricasUI = GRUPOS.map(g => ({ id: g.id, label: g.label, items: (g.items||[]).map(it=>({...it})) }));

  // Renderiza un badge HTML según la fuente metodológica
  function srcBadge(src) {
    if (!src) return '';
    const txt = { H: 'Hull', R: 'Real', M: 'Mix' }[src] || src;
    return `<span class="cmo-src-badge cmo-src-${src}" title="${src==='H'?'Calculado sobre Convex Hull (forma estimada)':src==='R'?'Calculado sobre contorno real (estado preservado)':'Derivado de ambas fuentes'}">${txt}</span>`;
  }

  const DEFAULT_KEYS = [
    'area', 'area_neta', 'perimeter', 'perimeter_neto', 'circularity', 'solidity', 'convexity',
    'aspect_ratio', 'elongation', 'symmetry_score',
    'regularidad_radial', 'completitud_estimada'
  ];

  // Alias: posibles nombres en metricas.objeto para la misma métrica
  const ALIAS = {
    // ── Clasificación ─────────────────────────────────────────────────────
    forma_confianza:          ['classification_confidence','confianza_clasificacion','confianza'],
    simetria_distancia_asimetria: ['simetria_distancia','asymmetry_distance','distancia_asimetria'],
    // ── Radial ────────────────────────────────────────────────────────────
    radio_max:            ['radio_maximo','r_max','radial_max'],
    radio_min:            ['radio_minimo','r_min','radial_min'],
    radio_medio:          ['radio_mean','r_medio','r_mean','radial_mean'],
    regularidad_radial:   ['regularidad_radial_porcentaje','radial_regularity'],
    cv_radial:            ['coeficiente_variacion_radial','radial_cv'],
    desviacion_radial:    ['radial_deviation','radial_std','desviacion_radial_mm'],
    ratio_radios:         ['radio_ratio','radios_ratio','ratio_radial'],
    // ── Contorno ─────────────────────────────────────────────────────────
    rugosidad:            ['rugosidad_contorno','roughness','roughness_index','border_roughness'],
    icc:                  ['contour_complexity_index','complexity_index','contour_complexity','indice_complejidad_contorno'],
    lobularidad:          ['indice_lobularidad','lobularity','lobularity_index'],
    estrellamiento:       ['indice_estrellamiento','star_index','radial_range_index'],
    energia_curvatura:    ['curvature_energy','energy_curvature'],
    curvatura_media:      ['curvature_mean','mean_curvature'],
    curvatura_maxima:     ['curvature_max','max_curvature','kappa_max'],
    curvatura_desviacion: ['curvature_std','curvature_deviation','kappa_std'],
    rugosidad_longitud_segmento_media: ['mean_segment_length','seg_length_mean','rugosidad_seg_media'],
    rugosidad_desviacion: ['roughness_std','rugosidad_std','roughness_deviation'],
    puntos_inflexion:     ['curvatura_puntos_inflexion','inflection_points','inflection_count'],
    puntos_esquina:       ['curvatura_puntos_esquina','corner_points','corner_count'],
    // ── Dimensiones ──────────────────────────────────────────────────────
    eje_mayor_mm:         ['eje_mayor_real_longitud','eje_mayor','eje_mayor_real_longitud_mm','major_axis_mm','major_axis_length_mm'],
    eje_menor_mm:         ['eje_menor_real_longitud','eje_menor','eje_menor_real_longitud_mm','minor_axis_mm','minor_axis_length_mm'],
    ancho_mm:             ['width','tight_width','bounding_width','ancho_mm','width_mm','bb_width_mm','bounding_box_width_mm'],
    alto_mm:              ['height','tight_height','bounding_height','alto_mm','height_mm','bb_height_mm','bounding_box_height_mm'],
    feret_max:            ['feret_maximo','caliper_max','feret_diameter_max'],
    feret_min:            ['feret_minimo','caliper_min','feret_diameter_min'],
    feret_ratio:          ['feret_ratio_min_max','caliper_ratio'],
    // ── Proporciones ─────────────────────────────────────────────────────
    compactness:          ['compactness_index','compactness_score','compacidad'],
    shape_factor:         ['shape_factor_index','factor_forma'],
    excentricidad:        ['eccentricity','excentricidad_elipse','excentricidad_contorno'],
    bounding_box_efficiency: ['bb_efficiency','bbox_efficiency','bounding_efficiency'],
    aspect_ratio:         ['aspect_ratio_original','aspect_ratio_tight'],
    rectangularidad:      ['rectangularity','bounding_box_ratio'],
    symmetry_score:       ['simetria_bilateral','bilateral_symmetry','symmetry'],
    // ── Orientación ──────────────────────────────────────────────────────
    orientation:          ['eje_principal_angulo','eje_principal_orientacion','angulo_predominante','angulo_orientacion','theta','eje_angulo'],
    anisotropy:           ['eje_principal_anisotropia','anisotropia','axis_anisotropy','eje_anisotropia'],
    feret_angulo_max:     ['feret_angulo_maximo','feret_angle_max'],
    feret_angulo_min:     ['feret_angulo_minimo','feret_angle_min'],
    centroide_x:          ['centroid_x','cx','centroide_contorno_x'],
    centroide_y:          ['centroid_y','cy','centroide_contorno_y'],
    // ── Vértices ─────────────────────────────────────────────────────────
    num_vertices:         ['geometria_vertices','vertices_aproximados','vertices_count','n_vertices','hull_vertices'],
    angulo_medio:         ['angulo_medio_vertices','mean_vertex_angle'],
    angulo_predominante:  ['predominant_angle','angulo_predominante_vertice','angulo_modal'],
    desviacion_angulos:   ['vertex_angle_std','angulos_desviacion','desviacion_angulos_vertices'],
    angulos_rectos:       ['num_angulos_rectos','n_angulos_rectos','right_angles'],
    angulos_agudos:       ['num_angulos_agudos','n_angulos_agudos','acute_angles'],
    angulos_obtusos:      ['num_angulos_obtusos','n_angulos_obtusos','obtuse_angles'],
    // ── Conservación ─────────────────────────────────────────────────────
    completitud_estimada: ['completeness_estimate','estimated_completeness','completitud'],
    cobertura_angular:    ['completitud_cobertura_grados','angular_coverage','angular_coverage_pct'],
    tipo_fragmento:       ['completitud_tipo_fragmento','forma_categoria_base','fragment_type','tipo_fragmentacion'],
    perdida_area_fragmentacion_percent:      ['perdida_area_pct','area_loss_percent','perdida_area'],
    perdida_perimetro_fragmentacion_percent: ['perdida_perimetro_pct','perimeter_loss_percent','perdida_perimetro'],
    area_fragmentada:     ['fragmented_area','area_hull_loss'],
    perimeter_fragmentado:['fragmented_perimeter','perimeter_hull_loss'],
    circularity_fragmentada:  ['circularity_hull','circularity_convex'],
    compactness_fragmentada:  ['compactness_hull','compactness_convex'],
    shape_factor_fragmentado: ['shape_factor_hull','shape_factor_convex'],
    // ── Perforaciones y horadaciones ─────────────────────────────────────
    area_neta:                                    ['area_neta_objeto','net_area','effective_area','areaNetaObjeto'],
    perimeter_neto:                               ['perimetro_neto','net_perimeter','topological_perimeter','perimetroNeto'],
    porosidad:                                    ['porcentaje_perforado','porosidad_total','porosity','porosity_pct'],
    num_perforaciones:                            ['n_perforaciones','total_perforaciones','perforaciones_count','count_perforaciones'],
    num_horadaciones:                             ['n_horadaciones','total_horadaciones','horadaciones_count','count_horadaciones'],
    area_perforaciones:                           ['area_total_perforaciones','perforaciones_area_total','total_area_perforaciones'],
    area_horadaciones:                            ['area_total_horadaciones','horadaciones_area_total','total_area_horadaciones'],
    porcentaje_perforado:                         ['pct_perforado','perforado_pct','porcentaje_perforaciones','ratio_perforado'],
    porcentaje_horadado:                          ['pct_horadado','horadado_pct','porcentaje_horadaciones','ratio_horadado'],
    patron_agrupamiento_confianza:                ['patron_confianza','agrupamiento_confianza','ph_pattern_confidence'],
    perforaciones_circularidad_promedio:          ['circularidad_media_perforaciones','circularity_mean_perf'],
    perforaciones_regularidad_radial_promedio:    ['regularidad_radial_media_perf','radial_regularity_mean_perf'],
    perforaciones_excentricidad_promedio:         ['excentricidad_media_perforaciones','eccentricity_mean_perf'],
    perforaciones_aspecto_promedio:               ['aspecto_medio_perf','aspect_ratio_mean_perf'],
    perforaciones_solidez_promedio:               ['solidez_media_perf','solidity_mean_perf'],
    perforaciones_convexidad_promedio:            ['convexidad_media_perf','convexity_mean_perf'],
    perforaciones_radio_maximo_promedio:          ['radio_max_medio_perf','max_radius_mean_perf'],
    perforaciones_radio_minimo_promedio:          ['radio_min_medio_perf','min_radius_mean_perf'],
    perforaciones_perimetro_promedio:             ['perimetro_medio_perf','perimeter_mean_perf'],
    horadaciones_circularidad_promedio:           ['circularidad_media_horadaciones','circularity_mean_hora'],
    horadaciones_regularidad_radial_promedio:     ['regularidad_radial_media_hora','radial_regularity_mean_hora'],
    horadaciones_excentricidad_promedio:          ['excentricidad_media_horadaciones','eccentricity_mean_hora'],
    horadaciones_aspecto_promedio:                ['aspecto_medio_hora','aspect_ratio_mean_hora'],
    horadaciones_solidez_promedio:                ['solidez_media_hora','solidity_mean_hora'],
    horadaciones_convexidad_promedio:             ['convexidad_media_hora','convexity_mean_hora'],
    horadaciones_radio_maximo_promedio:           ['radio_max_medio_hora','max_radius_mean_hora'],
    horadaciones_radio_minimo_promedio:           ['radio_min_medio_hora','min_radius_mean_hora'],
    horadaciones_perimetro_promedio:              ['perimetro_medio_hora','perimeter_mean_hora'],
    perforaciones_desviacion_radial_promedio:     ['desviacion_radial_media_perf','radial_std_mean_perf'],
    horadaciones_desviacion_radial_promedio:      ['desviacion_radial_media_hora','radial_std_mean_hora'],
    perforaciones_shape_factor_promedio:          ['shape_factor_media_perf','sf_mean_perf'],
    horadaciones_shape_factor_promedio:           ['shape_factor_media_hora','sf_mean_hora'],
    perforaciones_rectangularity_promedio:        ['rectangularity_media_perf','rect_mean_perf'],
    horadaciones_rectangularity_promedio:         ['rectangularity_media_hora','rect_mean_hora'],
    perforaciones_feret_max_promedio:             ['feret_max_media_perf','feret_max_mean_perf'],
    horadaciones_feret_max_promedio:              ['feret_max_media_hora','feret_max_mean_hora'],
    perforaciones_feret_min_promedio:             ['feret_min_media_perf','feret_min_mean_perf'],
    horadaciones_feret_min_promedio:              ['feret_min_media_hora','feret_min_mean_hora'],
    perforaciones_densidad_espacial:              ['densidad_espacial_perf','spatial_density_perf','ph_density'],
    horadaciones_densidad_espacial:               ['densidad_espacial_hora','spatial_density_hora'],
    perforaciones_homogeneidad_morfologica:       ['homogeneidad_perf','morpho_homogeneity_perf'],
    horadaciones_homogeneidad_morfologica:        ['homogeneidad_hora','morpho_homogeneity_hora'],
    // ── Simetría extendida ────────────────────────────────────────────────
    simetria_distancia_asimetria_px:              ['simetria_distancia_px','asymmetry_distance_px'],
    // ── Textura GLCM (backend /api/texture) ──────────────────────────────
    glcm_contrast:                                ['contrast','glcm_contrast_value','texture_contrast'],
    glcm_dissimilarity:                           ['dissimilarity','glcm_dissim','texture_dissimilarity'],
    glcm_homogeneity:                             ['homogeneity','glcm_homog','texture_homogeneity'],
    glcm_energy:                                  ['energy','glcm_asm','texture_energy'],
    glcm_correlation:                             ['correlation','glcm_corr','texture_correlation'],
    glcm_entropy:                                 ['entropy','glcm_entr','texture_entropy'],
    // ── Error óptico posicional (Sección IX) ─────────────────────────────
    error_optico_lineal_percent:                  ['error_lineal_percent','error_optico_lineal','optical_error_linear'],
    error_optico_area_percent:                    ['error_area_percent','error_optico_area','optical_error_area'],
    // ── Confianza de detección (ADR-008) ─────────────────────────────────
    detection_confidence:                         ['detectionConfidence','detection_confidence_score','confianza_deteccion'],
  };

  const PALETA = [
    { stroke: '#3182ce', fill: 'rgba(49,130,206,0.18)'  },
    { stroke: '#e53e3e', fill: 'rgba(229,62,62,0.18)'   },
    { stroke: '#38a169', fill: 'rgba(56,161,105,0.18)'  },
    { stroke: '#d69e2e', fill: 'rgba(214,158,46,0.18)'  },
    { stroke: '#805ad5', fill: 'rgba(128,90,213,0.18)'  },
    { stroke: '#0987a0', fill: 'rgba(9,135,160,0.18)'   },
  ];

  // ──── UTILIDADES ─────────────────────────────────────────────────────────
  function esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
                             .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Fallback P/H: calcula métricas agregadas desde los arrays individuales
  // ya cargados del JSON, SIN recalcular nada nuevo.
  function _phAgg(obj, key) {
    const perf    = obj.perforaciones || [];
    const hora    = obj.horadaciones  || [];
    const areaObj = parseFloat(obj.metricas?.area) || 1;

    // Suma de una clave numérica sobre un array de P/H
    const _sum = (arr, k) =>
      arr.reduce((s, x) => s + (parseFloat(x.metricas?.[k]) || 0), 0);

    // Media de una clave, probando múltiples nombres de clave alternativos.
    // Solo incluye en el promedio los P/H que realmente tienen el campo; los
    // que no lo tienen (p.ej. Ruta B sin shape descriptors) son excluidos, no
    // contados como 0, para no subvalorar el promedio morfológico.
    const _mean = (arr, keys) => {
      if (!arr.length) return null;
      let total = 0, count = 0;
      for (const x of arr) {
        let v = null;
        for (const k of (Array.isArray(keys) ? keys : [keys])) {
          if (x.metricas?.[k] != null) { v = parseFloat(x.metricas[k]); break; }
        }
        if (v !== null && isFinite(v)) { total += v; count++; }
      }
      return count > 0 ? total / count : null;
    };

    switch (key) {
      // ── Recuento y superficies ──────────────────────────────────────────
      case 'num_perforaciones':          return perf.length;
      case 'num_horadaciones':           return hora.length;
      case 'area_perforaciones': {
        // Prioridad 1: bruta guardada (todas las P, para display)
        const _spBruta = obj.metricas?.area_perforaciones_bruta ?? obj.metricas?.area_perforaciones;
        if (_spBruta != null && (_spBruta > 0 || perf.length === 0)) return _spBruta;
        // Fallback: sumar desde arrays individuales
        return _sum(perf, 'area');
      }
      case 'area_horadaciones': {
        const _shBruta = obj.metricas?.area_horadaciones_bruta;
        const _shNet   = obj.metricas?.area_horadaciones;
        const _stored  = _shBruta ?? _shNet;
        if (_stored != null && (_stored > 0 || hora.length === 0)) return _stored;
        return _sum(hora, 'area');
      }
      case 'porcentaje_perforado': {
        const _ppS = obj.metricas?.porcentaje_perforado;
        if (_ppS != null && (_ppS > 0 || perf.length === 0)) return _ppS;
        return (_sum(perf, 'area') / areaObj) * 100;
      }
      case 'porcentaje_horadado': {
        const _phS = obj.metricas?.porcentaje_horadado;
        if (_phS != null && (_phS > 0 || hora.length === 0)) return _phS;
        return (_sum(hora, 'area') / areaObj) * 100;
      }
      case 'area_neta': {
        // Prioridad 1: area_neta calculada con valores efectivos (fuente canónica)
        if (obj.metricas?.area_neta != null) return obj.metricas.area_neta;
        // Prioridad 2: usar area_perforaciones_efectiva si existe (excluye P contenidas en H)
        const _aE = obj.metricas?.area_perforaciones_efectiva;
        const _aH2 = parseFloat(obj.metricas?.area_horadaciones) || 0;
        if (_aE != null) return Math.max(0, areaObj - _aE - _aH2);
        // Prioridad 3: area_perforaciones es bruta — para el fallback usamos los arrays directamente
        return Math.max(0, areaObj - _sum(perf, 'area') - _sum(hora, 'area'));
      }
      case 'perimeter_neto': {
        const _scPcmo = (typeof scale !== 'undefined' && scale > 0) ? scale : 1;
        const _gPcmo  = (ph) => ph.metricas?.perimeter ? parseFloat(ph.metricas.perimeter)||0
          : ph.metricas?.perimeter_real ? (parseFloat(ph.metricas.perimeter_real)||0)*_scPcmo
          : parseFloat(ph.perimetro)||0;
        const _pExtCmo = parseFloat(obj.metricas?.perimeter || 0);
        const _pPHcmo  = [...perf, ...hora].reduce((s,ph) => s + _gPcmo(ph), 0);
        return obj.perimetro_neto ?? (_pExtCmo + _pPHcmo);
      }
      case 'porosidad': {
        // Preferir valores almacenados (basados en bruta) para coherencia con UI/CSV/PDF
        const _pBruta = parseFloat(obj.metricas?.area_perforaciones_bruta ?? obj.metricas?.area_perforaciones) || 0;
        const _hBruta = parseFloat(obj.metricas?.area_horadaciones) || 0;
        if (_pBruta > 0 || _hBruta > 0) return (_pBruta + _hBruta) / areaObj * 100;
        return ((_sum(perf, 'area') + _sum(hora, 'area')) / areaObj) * 100;
      }
      // ── Morfología media perforaciones ─────────────────────────────────
      case 'perforaciones_circularidad_promedio':
        return _mean(perf, 'circularity');
      case 'perforaciones_regularidad_radial_promedio':
        return _mean(perf, 'regularidad_radial');
      case 'perforaciones_excentricidad_promedio':
        return _mean(perf, ['excentricidad','eccentricity']);
      case 'perforaciones_aspecto_promedio':
        return _mean(perf, 'aspect_ratio');
      case 'perforaciones_solidez_promedio':
        return _mean(perf, 'solidity');
      case 'perforaciones_convexidad_promedio':
        return _mean(perf, 'convexity');
      case 'perforaciones_radio_maximo_promedio':
        return _mean(perf, ['radio_maximo','max_radius']);
      case 'perforaciones_radio_minimo_promedio':
        return _mean(perf, ['radio_minimo','min_radius']);
      case 'perforaciones_perimetro_promedio':
        return _mean(perf, ['perimeter','perimetro']);
      // ── Morfología media horadaciones ──────────────────────────────────
      case 'horadaciones_circularidad_promedio':
        return _mean(hora, 'circularity');
      case 'horadaciones_regularidad_radial_promedio':
        return _mean(hora, 'regularidad_radial');
      case 'horadaciones_excentricidad_promedio':
        return _mean(hora, ['excentricidad','eccentricity']);
      case 'horadaciones_aspecto_promedio':
        return _mean(hora, 'aspect_ratio');
      case 'horadaciones_solidez_promedio':
        return _mean(hora, 'solidity');
      case 'horadaciones_convexidad_promedio':
        return _mean(hora, 'convexity');
      case 'horadaciones_radio_maximo_promedio':
        return _mean(hora, ['radio_maximo','max_radius']);
      case 'horadaciones_radio_minimo_promedio':
        return _mean(hora, ['radio_minimo','min_radius']);
      case 'horadaciones_perimetro_promedio':
        return _mean(hora, ['perimeter','perimetro']);
      // ── Shape Factor, Rectangularidad, Elongación, Feret P/H ───────────────────────
      case 'perforaciones_shape_factor_promedio':
        return _mean(perf, 'shape_factor');
      case 'horadaciones_shape_factor_promedio':
        return _mean(hora, 'shape_factor');
      case 'perforaciones_rectangularity_promedio':
        return _mean(perf, 'rectangularity');
      case 'horadaciones_rectangularity_promedio':
        return _mean(hora, 'rectangularity');
      case 'perforaciones_feret_max_promedio':
        return _mean(perf, 'feret_max');
      case 'horadaciones_feret_max_promedio':
        return _mean(hora, 'feret_max');
      case 'perforaciones_feret_min_promedio':
        return _mean(perf, 'feret_min');
      case 'horadaciones_feret_min_promedio':
        return _mean(hora, 'feret_min');
      // ── Distribución espacial ──────────────────────────────────────────
      case 'perforaciones_densidad_espacial':
        return perf.length / areaObj;
      case 'horadaciones_densidad_espacial':
        return hora.length / areaObj;
      case 'perforaciones_homogeneidad_morfologica': {
        if (!perf.length) return null;
        if (perf.length === 1) return 1;
        const areas = perf.map(p => parseFloat(p.metricas?.area) || 0);
        const mu = areas.reduce((a,b) => a+b, 0) / areas.length;
        const cv = mu > 0 ? Math.sqrt(areas.reduce((s,a) => s+(a-mu)**2, 0) / areas.length) / mu : 0;
        return Math.max(0, 1 - cv);
      }
      case 'horadaciones_homogeneidad_morfologica': {
        if (!hora.length) return null;
        if (hora.length === 1) return 1;
        const areas = hora.map(h => parseFloat(h.metricas?.area) || 0);
        const mu = areas.reduce((a,b) => a+b, 0) / areas.length;
        const cv = mu > 0 ? Math.sqrt(areas.reduce((s,a) => s+(a-mu)**2, 0) / areas.length) / mu : 0;
        return Math.max(0, 1 - cv);
      }
      default: return undefined;
    }
  }

  function getValor(obj, key) {
    if (key === '__n_perforaciones')
      return (obj.perforaciones?.length ?? 0) + (obj.horadaciones?.length ?? 0);
    const m = obj.metricas;
    let val = (m[key] !== undefined && m[key] !== null) ? m[key] : undefined;
    if (val === undefined) {
      const aliases = ALIAS[key];
      if (aliases) {
        for (const a of aliases) {
          if (m[a] !== undefined && m[a] !== null) { val = m[a]; break; }
        }
      }
    }
    // Para métricas P/H de superficie: si el valor guardado es 0 pero hay P/H
    // con área en el JSON, el dato puede ser obsoleto (análisis guardado antes
    // de trazar las perforaciones). Forzar recálculo desde los arrays.
    const _PH_AREA_KEYS = new Set(['area_perforaciones','area_horadaciones','porosidad','porcentaje_perforado','porcentaje_horadado']);
    if (val === 0 && _PH_AREA_KEYS.has(key) && (obj.perforaciones?.length || obj.horadaciones?.length)) {
      val = undefined; // forzar fallback a _phAgg
    }
    // Fallback: calcular desde arrays individuales de P/H ya en el JSON
    if (val === undefined || val === null) {
      const computed = _phAgg(obj, key);
      if (computed !== undefined) val = computed;
    }
    // Extracción especial: escalares EFA desde metricas._efa_data (nested object)
    if (val === undefined && m._efa_data) {
      const efa = m._efa_data;
      switch (key) {
        case 'efa_n_harmonics':     val = efa.n_harmonics     != null ? efa.n_harmonics     : null; break;
        case 'efa_harmonics_95pct': val = efa.harmonics_for_95pct != null ? efa.harmonics_for_95pct : null; break;
        case 'efa_harmonics_99pct': val = efa.harmonics_for_99pct != null ? efa.harmonics_for_99pct : null; break;
        case 'efa_n_points':        val = efa.n_points_input   != null ? efa.n_points_input  : null; break;
      }
    }
    if (val === undefined || val === null) return null;
    // Coerce numeric strings → number so statistics work
    if (typeof val === 'string' && val.trim() !== '' && !isNaN(val)) return parseFloat(val);
    // Normalizar NaN/Infinity almacenados → null para evitar propagación a estadísticas
    if (typeof val === 'number' && !isFinite(val)) return null;
    return val;
  }

  function fmtValor(val) {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean')  return val ? 'Sí' : 'No';
    if (typeof val === 'string')   return val;
    if (typeof val === 'number') {
      if (!isFinite(val)) return '—';
      return Number.isInteger(val) ? val.toString() : val.toFixed(4);
    }
    return String(val);
  }

  function _sanitizeFilenamePart(value, fallback = 'recurso') {
    const txt = String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
    return txt || fallback;
  }

  function _getCMOCollectionId() {
    const p = (typeof projectManager !== 'undefined' && projectManager?.activeProject) || null;
    return _sanitizeFilenamePart(
      p?.id || p?.collectionId || p?.name || p?.nombre || 'coleccion',
      'coleccion'
    );
  }

  function _buildCMOExportFilename(tipoAnalisis, nombreRecurso, extension) {
    const collectionId = _getCMOCollectionId();
    const tipo = _sanitizeFilenamePart(tipoAnalisis, 'analisis');
    const recurso = _sanitizeFilenamePart(nombreRecurso, 'recurso');
    const ext = String(extension || 'dat').replace(/^\./, '').toLowerCase();
    return `${collectionId}_CMO_${tipo}_${recurso}.${ext}`;
  }

  function _csvEscape(value, sep = ',') {
    const s = String(value ?? '');
    return s.includes(sep) || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  }

  function _tableElementToCSV(tableEl, sep = ',') {
    if (!tableEl) return null;
    const rows = [...tableEl.querySelectorAll('tr')].map(tr => {
      const cells = [...tr.querySelectorAll('th, td')].map(cell => {
        const colspan = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1);
        const text = cell.textContent.replace(/\s+/g, ' ').trim();
        return Array.from({ length: colspan }, () => _csvEscape(text, sep));
      });
      return cells.flat().join(sep);
    }).filter(Boolean);
    return rows.length ? '\uFEFF' + rows.join('\n') : null;
  }

  async function _guardarArchivo(filename, content, format = 'csv', mimeType = 'text/plain;charset=utf-8;') {
    if (window.electronAPI?.saveFileWithDialog) {
      const r = await window.electronAPI.saveFileWithDialog(filename, content, format);
      if (r && !r.success && !r.canceled && typeof toast !== 'undefined') {
        toast.error(`No se pudo guardar ${filename}.`);
      }
      return r;
    }

    const a = document.createElement('a');
    a.download = filename;

    if (typeof content === 'string' && content.startsWith('data:')) {
      a.href = content;
    } else {
      const blob = new Blob([content], { type: mimeType });
      a.href = URL.createObjectURL(blob);
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return { success: true, fallback: true };
  }

  async function _guardarPNGDesdeCanvas(canvas, tipoAnalisis, nombreRecurso) {
    if (!canvas) {
      if (typeof toast !== 'undefined') toast.warning('No hay gráfico disponible para exportar.');
      return { success: false };
    }
    const filename = _buildCMOExportFilename(tipoAnalisis, nombreRecurso, 'png');
    return _guardarArchivo(filename, canvas.toDataURL('image/png'), 'png', 'image/png');
  }

  async function _guardarSVGMarkup(svgMarkup, tipoAnalisis, nombreRecurso) {
    const filename = _buildCMOExportFilename(tipoAnalisis, nombreRecurso, 'svg');
    if (window.electronAPI?.showSaveDialog && window.electronAPI?.saveFile) {
      const dialog = await window.electronAPI.showSaveDialog(filename, 'svg');
      if (!dialog || dialog.canceled || !dialog.filePath) return { canceled: true };
      return window.electronAPI.saveFile(dialog.filePath, svgMarkup);
    }
    const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgMarkup);
    return _guardarArchivo(filename, dataUrl, 'svg', 'image/svg+xml');
  }

  async function _exportTableElementToCSV(tableEl, tipoAnalisis, nombreRecurso) {
    const csv = _tableElementToCSV(tableEl);
    if (!csv) {
      if (typeof toast !== 'undefined') toast.warning('No hay tabla disponible para exportar.');
      return { success: false };
    }
    const filename = _buildCMOExportFilename(tipoAnalisis, nombreRecurso, 'csv');
    return _guardarArchivo(filename, csv, 'csv', 'text/csv;charset=utf-8;');
  }

  // ──── CARGA ──────────────────────────────────────────────────────────────
  async function cargar() {
    const pm = typeof projectManager !== 'undefined' ? projectManager : null;
    if (!pm?.activeProject) {
      if (typeof toast !== 'undefined') toast.error('No hay proyecto activo.');
      return false;
    }
    const refs = pm.activeProject.analyses || [];
    if (!refs.length) {
      if (typeof toast !== 'undefined') toast.warning('El proyecto no tiene análisis guardados.');
      return false;
    }
    _objetos = [];
    const fp = pm.activeProject.folderPath || '';
    for (const ref of refs) {
      const ruta = ref.rutaCompleta || (fp && ref.carpeta ? `${fp}/${ref.carpeta}` : null);
      if (!ruta) continue;
      try {
        const a = await pm.loadAnalysisFromDisk(ruta);
        if (a) {
          const _perfs = a.perforaciones || [];
          const _horas = a.horadaciones  || [];
          const _mBase = a.metricas || {};
          const _areaBase = parseFloat(_mBase.area) || 0;
          // Las métricas P/H (area_neta, porosidad, area_perforaciones, etc.) se leen
          // directamente de los datos guardados en disco — calculados durante el análisis
          // morfológico con los polígonos completos en memoria y las reglas de contención
          // (P inscrita en H → no se suma al descuento) ya aplicadas correctamente.
          // Solo se recalculan los conteos numéricos de arrays, que son siempre fiables.
          const _phMerge = {
            num_perforaciones: _perfs.length,
            num_horadaciones:  _horas.length,
            __n_perforaciones: _perfs.length + _horas.length,
          };

          // Corrección de area_neta para JSONs guardados con código anterior
          // (que podía sumar P+H aunque P estuviera inscrita en H).
          // Regla safe: max(valor_disco, area − ΣH) 
          //   · Si P ⊂ H → area−H  > area−(P+H) → máximo da el correcto (solo H)
          //   · Si P independiente → ambos son iguales → máximo no cambia nada
          if (_areaBase > 0 && _horas.length > 0 && typeof calcularAreaEfectivaPH === 'function') {
            const _phSoloH = calcularAreaEfectivaPH([], _horas);  // solo H, sin P
            const _aNetaSoloH = Math.max(0, _areaBase - _phSoloH.areaTotalHoradaciones);
            const _aNetaDisco = typeof _mBase.area_neta === 'number' ? _mBase.area_neta : -Infinity;
            _phMerge.area_neta = Math.max(_aNetaSoloH, _aNetaDisco);
          }
          // Normalizar nombre: quitar sufijo (Cara X) y derivar cara si falta
          let _caraFinal = (a.cara || '').toUpperCase();
          if (_caraFinal !== 'A' && _caraFinal !== 'B') {
            const _m = /\(\s*cara\s+([ab])\s*\)/i.exec(a.nombreObjeto || '') ||
                       /\[\s*cara\s+([ab])\s*\]/i.exec(a.nombreObjeto || '');
            _caraFinal = _m ? _m[1].toUpperCase() : 'Mono';
          }
          const _nombreBase = (a.nombreObjeto || ref.nombreObjeto || ref.id || '')
            .replace(/\s*[\[(]\s*cara\s+[ab]\s*[\])]\s*$/i, '').trim();
          _objetos.push({
            id:            a.id || ref.id,
            nombre:        _nombreBase || ref.id,
            cara:          _caraFinal,
            fecha:         new Date(a.timestamp).toLocaleDateString('es-ES'),
            thumbnailPath: `${ruta}/imagenes/objeto_recortado.png`,
            metricas:      { ..._mBase, ..._phMerge },
            perforaciones: _perfs,
            horadaciones:  _horas,
            estadisticas:  a.estadisticas || {},
            geometria:     a.geometria || {},
          });
        }
      } catch(e) {
        console.warn('[CMO] No se pudo cargar:', ruta, e.message);
      }
    }
    if (!_objetos.length) {
      if (typeof toast !== 'undefined')
        toast.warning('Sin análisis en disco. Guarda los análisis con el menú de guardado.');
      return false;
    }
    return true;
  }

  // ──── RENDER OBJETOS (lista compacta con buscador) ───────────────────────
  function renderObjetos() {
    _selIds = new Set(_objetos.map(o => o.id));

    // Agrupar por nombre normalizado (sin sufijo de cara) y ordenar caras A → B → Mono
    const grupos = {};
    for (const obj of _objetos) {
      const key = obj.nombre.replace(/\s*[\[(]\s*cara\s+[ab]\s*[\])]\s*$/i, '').trim().toLowerCase();
      if (!grupos[key]) grupos[key] = { nombre: obj.nombre.replace(/\s*[\[(]\s*cara\s+[ab]\s*[\])]\s*$/i, '').trim(), caras: [] };
      grupos[key].caras.push(obj);
    }
    const ORDEN_CARA = { 'A': 0, 'a': 0, 'B': 1, 'b': 1, 'Mono': 2 };
    for (const g of Object.values(grupos)) {
      g.caras.sort((a, b) => (ORDEN_CARA[a.cara] ?? 3) - (ORDEN_CARA[b.cara] ?? 3));
    }
    const lista = Object.values(grupos);

    const container = document.getElementById('cmoListaObjetos');

    // ── Genera HTML de filas con filtro opcional ──────────────────────────
    function buildRows(q) {
      let h = `
        <div class="cmo-sel-search-bar">
          <span class="cmo-sel-search-icon">🔍</span>
          <input type="text" id="cmoFiltroObjetos" class="cmo-sel-search-input"
            placeholder="Filtrar por nombre…" value="${esc(q)}" autocomplete="off">
          <span id="cmoCuentaTotal" class="cmo-sel-search-count"></span>
        </div>
        <div class="cmo-sel-col-header">
          <span></span>
          <span class="cmo-sel-col-thumb"></span>
          <span>Nombre</span>
          <span>Cara</span>
          <span>Fecha</span>
        </div>
        <div class="cmo-sel-list">`;

      let visible = 0;
      for (const g of lista) {
        if (q && !g.nombre.toLowerCase().includes(q)) continue;
        visible++;
        if (g.caras.length === 1) {
          const obj = g.caras[0];
          const caraLbl = obj.cara !== 'Mono' ? obj.cara : 'Mono';
          const sel = _selIds.has(String(obj.id));
          const thumbSrc = obj.thumbnailPath ? `file://${obj.thumbnailPath}` : '';
          const thumbHtml = thumbSrc ? `<img class="cmo-thumb-img" src="${thumbSrc}" onerror="this.style.display='none'" alt="">` : '';
          h += `<label class="cmo-sel-row${sel ? ' sel' : ''}">
            <input type="checkbox" class="cmo-chk-obj" data-id="${esc(String(obj.id))}"${sel ? ' checked' : ''}>
            <span class="cmo-sel-thumb">${thumbHtml}</span>
            <span class="cmo-sel-nombre">${esc(obj.nombre)}</span>
            <span class="cmo-cara-badge cmo-cara-${caraLbl}">${esc(caraLbl)}</span>
            <span class="cmo-sel-fecha">${esc(obj.fecha)}</span>
          </label>`;
        } else {
          const allIds = g.caras.map(c => String(c.id));
          const allSel = allIds.every(id => _selIds.has(id));
          const anySel = allIds.some(id  => _selIds.has(id));
          h += `<div class="cmo-sel-group">
            <label class="cmo-sel-group-row">
              <input type="checkbox" class="cmo-chk-par"
                data-ids="${esc(JSON.stringify(allIds))}"
                ${allSel ? 'checked' : ''}
                ${!allSel && anySel ? 'data-indet="1"' : ''}>
              <span class="cmo-sel-group-name">${esc(g.nombre)}</span>
              <span class="cmo-sel-group-badge">${g.caras.length} caras</span>
            </label>`;
          for (const obj of g.caras) {
            const caraLbl = obj.cara !== 'Mono' ? obj.cara : 'Mono';
            const sel = _selIds.has(String(obj.id));
            const thumbSrcC = obj.thumbnailPath ? `file://${obj.thumbnailPath}` : '';
            const thumbHtmlC = thumbSrcC ? `<img class="cmo-thumb-img cmo-thumb-sm" src="${thumbSrcC}" onerror="this.style.display='none'" alt="">` : '';
            h += `<label class="cmo-sel-row cmo-sel-child${sel ? ' sel' : ''}">
              <input type="checkbox" class="cmo-chk-obj" data-id="${esc(String(obj.id))}"${sel ? ' checked' : ''}>
              <span class="cmo-sel-thumb">${thumbHtmlC}</span>
              <span class="cmo-sel-nombre cmo-sel-child-name">${esc(obj.nombre)}</span>
              <span class="cmo-cara-badge cmo-cara-${caraLbl}">${esc(caraLbl)}</span>
              <span class="cmo-sel-fecha">${esc(obj.fecha)}</span>
            </label>`;
          }
          h += `</div>`;
        }
      }
      if (!visible) {
        h += `<div class="cmo-sel-empty">Sin resultados para «${esc(q)}»</div>`;
      }
      h += `</div>`; // cierra .cmo-sel-list
      requestAnimationFrame(() => {
        const el = document.getElementById('cmoCuentaTotal');
        if (el) el.textContent = `${lista.length} objeto${lista.length !== 1 ? 's' : ''}`;
      });
      return h;
    }

    // ── Vincula eventos tras cada render ──────────────────────────────────
    function bindChk() {
      container.querySelectorAll('.cmo-chk-obj').forEach(chk => {
        chk.addEventListener('change', () => {
          if (chk.checked) _selIds.add(chk.dataset.id);
          else _selIds.delete(chk.dataset.id);
          const grp = chk.closest('.cmo-sel-group');
          if (grp) {
            const par = grp.querySelector('.cmo-chk-par');
            const all = [...grp.querySelectorAll('.cmo-chk-obj')];
            const cnt = all.filter(c => c.checked).length;
            if (par) { par.checked = cnt === all.length; par.indeterminate = cnt > 0 && cnt < all.length; }
          }
          chk.closest('label')?.classList.toggle('sel', chk.checked);
          actualizarContador();
        });
      });
      container.querySelectorAll('.cmo-chk-par').forEach(chk => {
        chk.addEventListener('change', () => {
          const grp = chk.closest('.cmo-sel-group');
          grp.querySelectorAll('.cmo-chk-obj').forEach(c => {
            c.checked = chk.checked;
            c.closest('label')?.classList.toggle('sel', chk.checked);
            if (chk.checked) _selIds.add(c.dataset.id); else _selIds.delete(c.dataset.id);
          });
          actualizarContador();
        });
      });
      container.querySelectorAll('[data-indet="1"]').forEach(el => { el.indeterminate = true; });
      // Vincular buscador
      const fi = document.getElementById('cmoFiltroObjetos');
      if (fi) {
        fi.removeEventListener('input', fi._cmoH);
        fi._cmoH = () => {
          const q = fi.value.trim().toLowerCase();
          container.innerHTML = buildRows(q);
          bindChk();
        };
        fi.addEventListener('input', fi._cmoH);
      }
    }

    container.innerHTML = buildRows('');
    bindChk();
    actualizarContador();
  }

  function actualizarContador() {
    const el = document.getElementById('cmoCuentaSeleccionados');
    if (el) el.textContent = `${_selIds.size} de ${_objetos.length} objetos seleccionados`;
  }

  // ──── RENDER MÉTRICAS ────────────────────────────────────────────────────
  function renderMetricas() {
    const objs = _objetos.filter(o => _selIds.has(String(o.id)));

    // Reconstruir catálogo con los objetos actuales (detecta métricas fuera del catálogo base)
    _gruposMetricasUI = _construirCatalogoMetricas(_objetos);

    const _savedKeys = _cargarSeleccionMetricas(); // A1: restaurar selección previa
    const _isChecked = key => _savedKeys ? _savedKeys.includes(key) : DEFAULT_KEYS.includes(key);

    document.getElementById('cmoGruposMetricas').innerHTML = _gruposMetricasUI.map(g => {
      const conDatos = g.items.filter(it =>
        objs.some(o => { const v = getValor(o, it.key); return typeof v === 'number' && isFinite(v); })
      ).length;
      // Catálogo dinámico: ocultar grupos sin ningún dato en la colección actual
      // (salvo que la métrica esté en la selección guardada → el usuario la eligió antes)
      const tieneDatosOSeleccionado = conDatos > 0 ||
        g.items.some(it => _savedKeys && _savedKeys.includes(it.key));
      if (!tieneDatosOSeleccionado) return '';
      const grupoChecked = g.items.some(it => _isChecked(it.key));
      const isExtra = g.id === 'adicionales_detectadas';
      return `<div class="cmo-grupo-metricas" data-grupo-id="${g.id}">
        <div class="cmo-grupo-header">
          <input type="checkbox" class="cmo-chk-grupo" data-grupo="${g.id}"
            ${grupoChecked ? 'checked' : ''}>
          <span>${esc(g.label)}</span>
          <span style="font-size:10px;font-weight:400;color:#a0aec0;margin-left:auto;">${conDatos}/${g.items.length} con datos${isExtra ? ' · detectadas' : ''}</span>
        </div>
        <div class="cmo-grupo-items">
          ${g.items.map(it => {
            const tieneData = objs.some(o => { const v = getValor(o, it.key); return typeof v === 'number' && isFinite(v); });
            return `<label class="cmo-metrica-item" data-label="${esc(it.label.toLowerCase())}">
              <input type="checkbox" class="cmo-chk-met" data-key="${it.key}"
                ${_isChecked(it.key) ? 'checked' : ''}>
              ${it.src ? srcBadge(it.src) : ''}
              <span>${esc(it.label)}</span>
              ${!tieneData ? '<span style="font-size:9px;color:#fc8181;margin-left:4px;">&mdash; sin datos</span>' : ''}
            </label>`;
          }).join('')}
        </div>
      </div>`;
    }).join('');

    document.querySelectorAll('.cmo-chk-grupo').forEach(chk => {
      chk.addEventListener('change', () => {
        const g = _gruposMetricasUI.find(gr => gr.id === chk.dataset.grupo);
        if (!g) return;
        g.items.forEach(it => {
          const inp = document.querySelector(`.cmo-chk-met[data-key="${it.key}"]`);
          if (inp) inp.checked = chk.checked;
        });
      });
    });

    const busqueda = document.getElementById('cmoBusquedaMetrica');
    if (busqueda) {
      busqueda.value = '';
      busqueda.oninput = () => {
        const q = busqueda.value.trim().toLowerCase();
        document.querySelectorAll('.cmo-grupo-metricas').forEach(gEl => {
          let visibles = 0;
          gEl.querySelectorAll('.cmo-metrica-item').forEach(item => {
            const match = !q || (item.dataset.label || '').includes(q);
            item.classList.toggle('hidden', !match);
            if (match) visibles++;
          });
          gEl.classList.toggle('hidden-group', visibles === 0);
        });
      };
    }
  }

  // ──── TARJETA RESUMEN ─────────────────────────────────────────────────────
  function renderResumen(objs, keys) {
    const numKeys = keys.filter(k => objs.some(o => { const v = getValor(o,k); return typeof v==='number'&&isFinite(v); }));
    let maxCV = 0, maxCVLabel = '—';
    for (const k of numKeys) {
      const vals = objs.map(o=>getValor(o,k)).filter(v=>typeof v==='number'&&isFinite(v));
      if (vals.length < 2) continue;
      const med = vals.reduce((a,b)=>a+b,0)/vals.length;
      const std = Math.sqrt(vals.reduce((a,b)=>a+(b-med)**2,0)/Math.max(vals.length-1,1));
      const cv  = med !== 0 ? Math.abs(std/med)*100 : 0;
      if (cv > maxCV) { maxCV = cv; maxCVLabel = KEY_LABEL[k]||k; }
    }
    let nOutliers = 0;
    for (const k of numKeys) {
      const vals = objs.map(o=>getValor(o,k)).filter(v=>typeof v==='number'&&isFinite(v)).sort((a,b)=>a-b);
      if (vals.length < 2) continue;
      const q1 = vals[Math.floor((vals.length - 1) * 0.25)];
      const q3 = vals[Math.ceil((vals.length - 1) * 0.75)];
      const iqr = q3 - q1;
      const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
      nOutliers += objs.filter(o=>{ const v=getValor(o,k); return typeof v==='number'&&isFinite(v)&&(v<lo||v>hi); }).length;
    }
    const chips = document.getElementById('cmoResumenChips');
    if (chips) chips.innerHTML = [
      `<div class="cmo-chip accent-blue"><span class="cmo-chip-val">${objs.length}</span><span class="cmo-chip-lbl">Objetos comparados</span></div>`,
      `<div class="cmo-chip accent-green"><span class="cmo-chip-val">${keys.length}</span><span class="cmo-chip-lbl">Métricas seleccionadas</span></div>`,
      `<div class="cmo-chip accent-orange" title="Métrica con mayor CV"><span class="cmo-chip-val">${maxCV.toFixed(0)}%</span><span class="cmo-chip-lbl">CV máx: ${esc(maxCVLabel.split(' ').slice(0,2).join(' '))}</span></div>`,
      `<div class="cmo-chip accent-red"><span class="cmo-chip-val">${nOutliers}</span><span class="cmo-chip-lbl">Valores atípicos (IQR)</span></div>`,
    ].join('');
  }

  // ──── TABS ────────────────────────────────────────────────────────────────
  const TAB_MAP = {
    tabla:        'cmoTabTabla',
    radar:        'cmoTabRadar',
    estadisticos: 'cmoTabEstadisticos',
    dispersion:   'cmoTabDispersion',
    correlacion:  'cmoTabCorrelacion',
    morfologia:   'cmoTabMorfologia',
    pca:          'cmoTabPCA',
    efa:          'cmoTabEFA',
    errores:      'cmoTabErrores',
    dendrograma:  'cmoTabDendrograma',
  };
  function activarTab(tab) {
    document.querySelectorAll('.cmo-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    Object.entries(TAB_MAP).forEach(([k,id]) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('active', k === tab);
    });
  }
  function bindTabs() {
    document.querySelectorAll('.cmo-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => { if (!btn.disabled) activarTab(btn.dataset.tab); });
    });
  }

  // ──── STEPPER ─────────────────────────────────────────────────────────────
  function actualizarStepper(paso) {
    for (let i = 1; i <= 3; i++) {
      const el  = document.getElementById(`cmoStep${i}`);
      const sep = document.getElementById(`cmoSep${i}`);
      if (!el) continue;
      el.className  = 'cmo-step' + (i < paso ? ' done' : i === paso ? ' active' : '');
      if (sep) sep.className = 'cmo-step-sep' + (i < paso ? ' done' : '');
    }
  }

  // ──── EXPORTAR INFORME COMPLETO ───────────────────────────────────────────
  function exportarInforme() {
    const objs = _objetos.filter(o => _selIds.has(String(o.id)));
    if (!objs.length || !_metrSel.length) return;
    const keys = _metrSel;
    const sep = ',';
    const csvQ = v => _csvEscape(v, sep);
    const secs = [];

    secs.push('=== TABLA COMPARATIVA ===');
    secs.push([csvQ('Métrica'),...objs.map(o=>csvQ(o.nombre))].join(sep));
    for (const key of keys) {
      secs.push([csvQ(KEY_LABEL[key]||key), ...objs.map(o => csvQ(fmtValor(getValor(o,key))))].join(sep));
    }
    secs.push('');

    secs.push('=== ESTADÍSTICOS ===');
    secs.push(['Métrica','Media','Min','Max','DesvEst','CV_%','Mediana'].map(csvQ).join(sep));
    const numKeys = keys.filter(k => objs.some(o => { const v = getValor(o,k); return typeof v==='number'&&isFinite(v); }));
    for (const key of numKeys) {
      const vals = objs.map(o=>getValor(o,key)).filter(v=>typeof v==='number'&&isFinite(v));
      if (!vals.length) continue;
      const n=vals.length, mn=Math.min(...vals), mx=Math.max(...vals);
      const med=vals.reduce((a,b)=>a+b,0)/n;
      const std=Math.sqrt(vals.reduce((a,b)=>a+(b-med)**2,0)/Math.max(n-1,1));
      const cv=med!==0?Math.abs(std/med)*100:0;
      const sorted=[...vals].sort((a,b)=>a-b), mid=Math.floor(n/2);
      const mediana=n%2===0?(sorted[mid-1]+sorted[mid])/2:sorted[mid];
      secs.push([KEY_LABEL[key]||key,med.toFixed(4),mn.toFixed(4),mx.toFixed(4),std.toFixed(4),cv.toFixed(2),mediana.toFixed(4)].map(csvQ).join(sep));
    }
    secs.push('');

    const corrKeys = numKeys.filter(k => objs.map(o=>getValor(o,k)).filter(v=>typeof v==='number'&&isFinite(v)).length >= 3);
    if (corrKeys.length >= 2) {
      secs.push('=== CORRELACIONES (r Pearson) ===');
      secs.push([csvQ('Métrica'),...corrKeys.map(k=>csvQ(KEY_LABEL[k]||k))].join(sep));
      const pearson = (ka,kb) => {
        const pairs = objs.map(o=>({a:getValor(o,ka),b:getValor(o,kb)})).filter(p=>typeof p.a==='number'&&isFinite(p.a)&&typeof p.b==='number'&&isFinite(p.b));
        if (pairs.length<3) return null;
        const n=pairs.length, ma=pairs.reduce((s,p)=>s+p.a,0)/n, mb=pairs.reduce((s,p)=>s+p.b,0)/n;
        const num=pairs.reduce((s,p)=>s+(p.a-ma)*(p.b-mb),0);
        const da=Math.sqrt(pairs.reduce((s,p)=>s+(p.a-ma)**2,0)), db=Math.sqrt(pairs.reduce((s,p)=>s+(p.b-mb)**2,0));
        return da===0||db===0?null:num/(da*db);
      };
      for (const ka of corrKeys) {
        secs.push([csvQ(KEY_LABEL[ka]||ka),...corrKeys.map(kb=>{ const r=pearson(ka,kb); return r===null?'':csvQ(r.toFixed(4)); })].join(sep));
      }
    }

    const csv = '\uFEFF' + secs.join('\n');
    _guardarCSV(_buildCMOExportFilename('tabla', 'informe_completo', 'csv'), csv)
      .then(() => { if (typeof toast !== 'undefined') toast.success('Informe completo exportado.'); });
  }

  // ──── COMPARAR ───────────────────────────────────────────────────────────
  function comparar() {
    const objs = _objetos.filter(o => _selIds.has(String(o.id)));
    if (objs.length < 2) { if (typeof toast !== 'undefined') toast.warning('Selecciona al menos 2 objetos.'); return; }
    _metrSel = [...document.querySelectorAll('.cmo-chk-met:checked')].map(c => c.dataset.key);
    if (!_metrSel.length) { if (typeof toast !== 'undefined') toast.warning('Selecciona al menos una métrica.'); return; }
    _guardarSeleccionMetricas(_metrSel); // A1: persistir para la próxima sesión
    renderResumen(objs, _metrSel);
    renderTabla(objs, _metrSel);
    renderRadar(objs, _metrSel);
    renderEstadisticos(objs, _metrSel);
    renderDispersion(objs, _metrSel);
    renderCorrelacion(objs, _metrSel);
    renderMorfologia(objs, _metrSel);
    renderPCA(objs, _metrSel);
    renderDendrograma(objs, _metrSel);
    renderEFA(objs);
    renderErrorVerificacion(objs);
    activarTab('tabla');
    actualizarStepper(3);
    document.getElementById('cmoResultados').style.display = 'block';
    document.getElementById('cmoResultados').scrollIntoView({ behavior: 'smooth' });

    // ── Intento Python (asíncrono, enriquece PCA y estadísticos si disponible) ─
    if (window.PythonBridge && PythonBridge.isModuleActive('comparator')) {
      Promise.all([
        PythonBridge.comparator.pca(objs, { keys: _metrSel }),
        PythonBridge.comparator.statistics(objs, _metrSel),
      ]).then(([pyPCA, pyStats]) => {
        if (pyPCA && !pyPCA.error) {
          renderPCAFromPython(pyPCA, objs);
          console.log('[Python] comparator.pca ✓');
        }
        if (pyStats && !pyStats.error) {
          renderEstadisticosFromPython(pyStats, objs, _metrSel);
          console.log('[Python] comparator.statistics ✓');
        }
      }).catch(_e => console.warn('[Python] comparator falló:', _e.message));
    }
  }

  // ──── TABLA (con sorting) ─────────────────────────────────────────────
  let _sortCol  = null; // índice de objeto (0-based) o null
  let _sortDir  = 'desc';

  function renderTabla(objs, keys) {
    _sortCol = null; _sortDir = 'desc';
    _renderTablaInterna(objs, keys);
  }

  function _renderTablaInterna(objs, keys, sortCol, sortDir) {
    let sortedKeys = [...keys];
    if (sortCol !== null && sortCol !== undefined) {
      sortedKeys = sortedKeys.sort((a, b) => {
        const va = getValor(objs[sortCol], a);
        const vb = getValor(objs[sortCol], b);
        const na = typeof va === 'number' && isFinite(va) ? va : -Infinity;
        const nb = typeof vb === 'number' && isFinite(vb) ? vb : -Infinity;
        return sortDir === 'asc' ? na - nb : nb - na;
      });
    }

    // Leyenda de fuentes
    const leyendaHtml = '<div class="cmo-src-leyenda">'
      + '<span>Fuente del cálculo:</span>'
      + ' <span class="cmo-src-badge cmo-src-H">Hull</span> Convex Hull — forma estimada (sin fragmentación)'
      + ' &nbsp;&nbsp;<span class="cmo-src-badge cmo-src-R">Real</span> Contorno real — estado preservado'
      + ' &nbsp;&nbsp;<span class="cmo-src-badge cmo-src-M">Mix</span> Derivada de ambas fuentes'
      + '</div>';
    let html = leyendaHtml + '<table class="cmo-tabla"><thead><tr><th class="cmo-th-metrica">Métrica</th>';
    for (let oi = 0; oi < objs.length; oi++) {
      const o = objs[oi];
      const isSorted = sortCol === oi;
      const icon = isSorted ? (sortDir === 'asc' ? '▲' : '▼') : '▼';
      html += `<th class="cmo-th-sortable${isSorted ? ' sort-'+sortDir : ''}" data-oi="${oi}">`
        + `${esc(o.nombre)}<span class="cmo-obj-sub">${o.cara !== 'Mono' ? 'Cara '+esc(o.cara)+' · ' : ''}${esc(o.fecha)}</span>`
        + `<span class="cmo-sort-icon">${icon}</span></th>`;
    }
    html += '</tr></thead><tbody>';

    // Agrupar métricas por fuente: H → R → M → sin clasificar
    const SRC_ORDER  = ['H', 'R', 'M', ''];
    const SRC_TITLES = {
      H: '◆ Convex Hull — Forma estimada (sin fragmentación)',
      R: '◆ Contorno Real — Estado preservado',
      M: '◆ Derivada de ambas fuentes',
      '': '◆ Sin clasificar',
    };
    const bySource = {};
    for (const key of sortedKeys) {
      const s = KEY_SRC[key] ?? '';
      if (!bySource[s]) bySource[s] = [];
      bySource[s].push(key);
    }
    const nCols = objs.length + 1;
    for (const src of SRC_ORDER) {
      const group = bySource[src];
      if (!group || group.length === 0) continue;
      // Fila encabezado de sección
      html += `<tr class="cmo-src-section"><td class="cmo-src-section-cell cmo-src-section-${src}" colspan="${nCols}">`
        + `${srcBadge(src || '?')} ${SRC_TITLES[src]}</td></tr>`;
      // Filas de métricas de este grupo
      for (const key of group) {
        const label = KEY_LABEL[key] || key;
        const vals  = objs.map(o => getValor(o, key));
        const nums  = vals.filter(v => typeof v === 'number' && isFinite(v));
        const vMax  = nums.length > 1 ? Math.max(...nums) : null;
        const vMin  = nums.length > 1 ? Math.min(...nums) : null;
        html += `<tr><td class="cmo-td-label">${esc(label)}</td>`;
        for (const val of vals) {
          let cls = '';
          if (typeof val === 'number' && isFinite(val) && nums.length > 1) {
            if (val === vMax) cls = 'cmo-val-max';
            else if (val === vMin) cls = 'cmo-val-min';
          }
          html += `<td class="${cls}">${esc(fmtValor(val))}</td>`;
        }
        html += '</tr>';
      }
    }
    html += '</tbody></table>';
    const wrap = document.getElementById('cmoTablaContenido');
    wrap.innerHTML = html;
    // Bind sort headers
    wrap.querySelectorAll('.cmo-th-sortable').forEach(th => {
      th.addEventListener('click', () => {
        const oi = parseInt(th.dataset.oi);
        if (_sortCol === oi) _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
        else { _sortCol = oi; _sortDir = 'desc'; }
        _renderTablaInterna(objs, keys, _sortCol, _sortDir);
      });
    });
  }

  // ──── GRÁFICO RADAR ──────────────────────────────────────────────────────
  function renderRadar(objs, keys) {
    const tabBtn = document.querySelector('.cmo-tab-btn[data-tab="radar"]');
    const contenedor = document.getElementById('cmoRadarContenido');
    if (!contenedor) return;

    const ejes = keys.filter(k => objs.some(o => {
      const v = getValor(o, k);
      return v !== null && typeof v === 'number' && isFinite(v);
    })).slice(0, 12);

    if (ejes.length < 3) {
      if (tabBtn) { tabBtn.style.opacity = '0.4'; tabBtn.disabled = true; }
      contenedor.innerHTML = '<p style="color:#718096;font-size:12px;padding:8px;">Se necesitan al menos 3 métricas numéricas para el radar.</p>';
      return;
    }
    if (tabBtn) { tabBtn.style.opacity = ''; tabBtn.disabled = false; }

    // Rangos para normalizar [0–1]
    const rangos = {};
    for (const k of ejes) {
      const vals = objs.map(o => getValor(o, k)).filter(v => typeof v === 'number' && isFinite(v));
      rangos[k] = { mn: Math.min(...vals), mx: Math.max(...vals) };
    }
    const norm = (v, k) => {
      const { mn, mx } = rangos[k];
      return mn === mx ? 0.5 : (v - mn) / (mx - mn);
    };

    // ── Leyenda (flex-wrap horizontal) ──────────────────────────────────────
    const legendHTML = objs.map((o, oi) => {
      const c = PALETA[oi % PALETA.length];
      const cara = o.cara && o.cara !== 'Mono' ? ` · <em style="color:#a0aec0;font-style:italic;">${esc(o.cara)}</em>` : '';
      return `<div class="cmo-radar-legend-row">
        <div class="cmo-radar-legend-swatch" style="background:${c.stroke};"></div>
        <span style="font-size:11px;color:#2d3748;">${esc(o.nombre)}${cara}</span>
      </div>`;
    }).join('');

    // ── Tabla: métricas = filas, objetos = columnas + CV% (estilo dispersión) ─
    const cvBgRadar = cv => {
      if (cv < 15)  return { bg: '#ebf8f0', fg: '#276749' };
      if (cv < 35)  return { bg: '#fffbeb', fg: '#744210' };
      return { bg: '#fff5f5', fg: '#9b2c2c' };
    };
    const objColHeaders = objs.map((o, oi) => {
      const col  = PALETA[oi % PALETA.length].stroke;
      const cara = o.cara && o.cara !== 'Mono' ? `<br><em style="color:#a0aec0;font-style:italic;font-size:9px;">${esc(o.cara)}</em>` : '';
      return `<th class="cmo-rt-metric-col" style="border-bottom:3px solid ${col};">${esc(o.nombre)}${cara}</th>`;
    }).join('');
    const tableRows = ejes.map(k => {
      const lbl  = KEY_LABEL[k] || k;
      const vals = objs.map(o => getValor(o, k)).filter(v => typeof v === 'number' && isFinite(v));
      const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      const std  = vals.length > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1)) : 0;
      const cv   = mean !== 0 ? Math.abs(std / mean) * 100 : 0;
      const { bg, fg } = cvBgRadar(cv);
      const cells = objs.map((o, oi) => {
        const v   = getValor(o, k);
        const nv  = (v !== null && typeof v === 'number' && isFinite(v)) ? norm(v, k) : null;
        const col = PALETA[oi % PALETA.length].stroke;
        const raw = v !== null && typeof v === 'number' && isFinite(v) ? v.toFixed(3) : '—';
        if (nv === null) return `<td class="cmo-rt-val-cell"><span style="color:#cbd5e0;">—</span></td>`;
        const pct   = Math.round(nv * 100);
        const bgGrad = `linear-gradient(to right, ${col}22 ${pct}%, transparent ${pct}%)`;
        return `<td class="cmo-rt-val-cell" style="background:${bgGrad};" title="${pct}% normalizado">
          <span style="font-size:11px;font-weight:600;">${raw}</span>
        </td>`;
      }).join('');
      return `<tr>
        <td class="cmo-rt-obj-label"><span style="font-size:11px;">${esc(lbl)}</span></td>
        ${cells}
        <td class="cmo-rt-val-cell" style="background:${bg};font-weight:700;color:${fg};" title="Coeficiente de variación">${cv.toFixed(1)}%</td>
      </tr>`;
    }).join('');
    const tableHTML = `
      <div class="cmo-radar-table-wrap" style="max-height:340px;">
        <table class="cmo-radar-table">
          <thead><tr>
            <th class="cmo-rt-obj-header" style="min-width:140px;">Métrica</th>
            ${objColHeaders}
            <th class="cmo-rt-metric-col" style="background:#f7fafc;">CV%</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      <div style="margin-top:6px;font-size:10px;color:#a0aec0;display:flex;gap:14px;flex-wrap:wrap;">
        <span style="color:#276749;font-weight:600;">● CV&lt;15% Homogéneo</span>
        <span style="color:#744210;font-weight:600;">● 15–35% Moderado</span>
        <span style="color:#9b2c2c;font-weight:600;">● &gt;35% Heterogéneo</span>
        <span style="color:#718096;">· Gradiente de celda = posición normalizada</span>
      </div>`;

    // ── Limpiar zoom anterior + inyectar estructura HTML ──────────────────────
    if (window.detachCanvasZoom) contenedor.querySelectorAll('canvas').forEach(c => window.detachCanvasZoom(c));
    contenedor.innerHTML = `
      <div class="cmo-radar-legend-bar">${legendHTML}</div>
      <div class="cmo-radar-canvas-wrap">
        <canvas id="cmoRadarCanvas" width="720" height="640"></canvas>
      </div>
      <div>
        <div class="cmo-radar-side-title" style="margin:0 0 6px;">Valores por objeto y métrica</div>
        ${tableHTML}
      </div>
      <div class="cmo-btn-row" style="margin-top:12px;">
        <button class="cmo-btn cmo-btn-success" id="cmoExportarRadarCSV">Exportar tabla radar CSV</button>
      </div>`;

    // ── Dibujar el radar ─────────────────────────────────────────────────────
    const canvas = document.getElementById('cmoRadarCanvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const n  = ejes.length;
    const cx = W / 2;
    const cy = H / 2 + 10;
    const R  = Math.min(W, H) / 2 - 96;

    const ang = i => (i / n) * 2 * Math.PI - Math.PI / 2;
    const pto = (r, i) => ({ x: cx + r * Math.cos(ang(i)), y: cy + r * Math.sin(ang(i)) });

    // Fondo
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);

    // Niveles del grid (5 anéis)
    for (let lvl = 1; lvl <= 5; lvl++) {
      const rLvl = R * lvl / 5;
      if (lvl % 2 === 0) {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const p = pto(rLvl, i);
          i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(237,242,247,0.45)';
        ctx.fill();
      }
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const p = pto(rLvl, i);
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.strokeStyle = lvl === 5 ? '#a0aec0' : '#e2e8f0';
      ctx.lineWidth = lvl === 5 ? 1.5 : 1;
      ctx.stroke();
      const sp = pto(rLvl, 0);
      ctx.fillStyle = '#a0aec0';
      ctx.font = '8px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${lvl * 20}%`, sp.x, sp.y - 7);
    }

    // Ejes radiales
    for (let i = 0; i < n; i++) {
      const p = pto(R, i);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = '#cbd5e0';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Etiquetas de los ejes (con ajuste de texto en 2 líneas)
    ctx.font = 'bold 11px system-ui,sans-serif';
    for (let i = 0; i < n; i++) {
      const fullLabel = KEY_LABEL[ejes[i]] || ejes[i];
      const words = fullLabel.split(' ');
      const lines = [];
      let line = '';
      for (const w of words) {
        if ((line + ' ' + w).trim().length <= 16) {
          line = (line + ' ' + w).trim();
        } else {
          if (line) lines.push(line);
          line = w;
        }
      }
      if (line) lines.push(line);
      const maxLines = lines.slice(0, 2);
      const p = pto(R + 36, i);
      const maxW = maxLines.reduce((mx, l) => Math.max(mx, ctx.measureText(l).width), 0);
      const bW = maxW + 10, bH = maxLines.length * 14 + 6;
      const bX = p.x - bW / 2, bY = p.y - bH / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.90)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bX, bY, bW, bH, 3);
      else ctx.rect(bX, bY, bW, bH);
      ctx.fill();
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = '#2d3748';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      maxLines.forEach((ln, li) => {
        const lY = p.y - ((maxLines.length - 1) * 14) / 2 + li * 14;
        ctx.fillText(ln, p.x, lY);
      });
    }

    // Polígonos de datos por objeto
    const _vertexHits = [];
    for (let oi = 0; oi < objs.length; oi++) {
      const col = PALETA[oi % PALETA.length];
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const v  = getValor(objs[oi], ejes[i]);
        const nv = (v !== null && typeof v === 'number' && isFinite(v)) ? norm(v, ejes[i]) : 0;
        const p  = pto(R * nv, i);
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fillStyle   = col.fill;
      ctx.strokeStyle = col.stroke;
      ctx.lineWidth   = 2;
      ctx.fill();
      ctx.stroke();
      for (let i = 0; i < n; i++) {
        const v  = getValor(objs[oi], ejes[i]);
        const nv = (v !== null && typeof v === 'number' && isFinite(v)) ? norm(v, ejes[i]) : 0;
        const p  = pto(R * nv, i);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.5, 0, 2 * Math.PI);
        ctx.fillStyle   = col.stroke;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 1.5;
        ctx.stroke();
        _vertexHits.push({
          x: p.x, y: p.y,
          obj:    objs[oi].nombre,
          cara:   objs[oi].cara || '',
          metric: KEY_LABEL[ejes[i]] || ejes[i],
          val:    v,
          pct:    (nv * 100).toFixed(0),
          color:  col.stroke,
        });
      }
    }

    // ── Tooltip ──────────────────────────────────────────────────────────────
    let _tt = document.getElementById('cmoRadarTooltip');
    if (!_tt) {
      _tt = document.createElement('div');
      _tt.id = 'cmoRadarTooltip';
      _tt.className = 'cmo-overlay';
      _tt.style.cssText = 'display:none;position:fixed;background:rgba(26,32,44,0.95);color:#fff;font-size:11px;padding:7px 11px;border-radius:7px;pointer-events:none;z-index:9999;line-height:1.7;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.25);';
      document.body.appendChild(_tt);
    }
    canvas.onmousemove = e => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (W / rect.width);
      const my = (e.clientY - rect.top)  * (H / rect.height);
      const hit = _vertexHits.find(h => Math.hypot(mx - h.x, my - h.y) <= 12);
      if (hit) {
        const rawFmt = hit.val !== null && typeof hit.val === 'number'
          ? hit.val.toFixed(4) : '—';
        _tt.innerHTML =
          `<span style="color:${hit.color};">&#9632;</span> <b>${esc(hit.obj)}</b>${hit.cara && hit.cara !== 'Mono' ? ` <span style="color:#90cdf4">· ${esc(hit.cara)}</span>` : ''}<br>` +
          `<b>${esc(hit.metric)}</b><br>` +
          `Valor real: <b>${rawFmt}</b><br>` +
          `Normalizado: <b>${hit.pct}%</b>`;
        _tt.style.display = 'block';
        _tt.style.left = (e.clientX + 16) + 'px';
        _tt.style.top  = (e.clientY - 14) + 'px';
        canvas.style.cursor = 'crosshair';
      } else {
        _tt.style.display = 'none';
        canvas.style.cursor = 'default';
      }
    };
    canvas.onmouseleave = () => { _tt.style.display = 'none'; };
    // Zoom + pan
    if (window.attachCanvasZoom) window.attachCanvasZoom(canvas);
    // Botón PNG
    const _radarWrap = canvas.closest('.cmo-radar-canvas-wrap') || canvas.parentElement;
    if (_radarWrap && !_radarWrap.querySelector('.cmo-export-png-btn')) {
      const _btn = document.createElement('button');
      _btn.className = 'cmo-export-png-btn';
      _btn.title = 'Guardar radar como imagen PNG';
      _btn.textContent = '📸 PNG';
      _btn.addEventListener('click', () => {
        _guardarPNGDesdeCanvas(canvas, 'radar', 'grafico_radar');
      });
      _radarWrap.appendChild(_btn);
    }
    const _radarCSVBtn = document.getElementById('cmoExportarRadarCSV');
    if (_radarCSVBtn) {
      _radarCSVBtn.onclick = () => _exportTableElementToCSV(
        contenedor.querySelector('.cmo-radar-table'),
        'radar',
        'tabla_valores_radar'
      );
    }
  }

  // ──── ESTADÍSTICOS (tabla + mini sparklines inline) ─────────────────────
  function renderEstadisticos(objs, keys) {
    const tabBtn = document.querySelector('.cmo-tab-btn[data-tab="estadisticos"]');
    const numKeys = keys.filter(k => {
      return objs.some(o => { const v = getValor(o,k); return typeof v==='number' && isFinite(v); });
    });
    if (numKeys.length < 1) { if (tabBtn) { tabBtn.style.opacity='0.4'; tabBtn.disabled=true; } return; }
    if (tabBtn) { tabBtn.style.opacity=''; tabBtn.disabled=false; }

    // Calcular estadísticos completos (incluyendo Q1/Q3 para sparkline)
    const filas = numKeys.map(key => {
      const vals = objs.map(o => getValor(o,key)).filter(v => typeof v==='number' && isFinite(v));
      if (!vals.length) return null;
      const n   = vals.length;
      const sorted = [...vals].sort((a,b)=>a-b);
      const mn  = sorted[0], mx = sorted[n-1];
      const med = vals.reduce((a,b)=>a+b,0)/n;
      const std = Math.sqrt(vals.reduce((a,b)=>a+(b-med)**2,0)/Math.max(n-1,1));
      const cv  = med !== 0 ? Math.abs(std/med)*100 : 0;
      const q1  = sorted[Math.floor((n-1)*0.25)];
      const q3  = sorted[Math.ceil((n-1)*0.75)];
      const mediana = n%2===0 ? (sorted[n/2-1]+sorted[n/2])/2 : sorted[Math.floor(n/2)];
      const cvCls = cv < 15 ? 'cmo-cv-low' : cv < 35 ? 'cmo-cv-mid' : 'cmo-cv-high';
      return { key, label: KEY_LABEL[key]||key, n, mn, mx, med, std, cv, q1, q3, mediana, cvCls, vals };
    }).filter(Boolean);

    // SVG mini sparkline: barra min→max con Q1–Q3, mediana y un punto de color por objeto
    const spark = (f, W=100, H=18) => {
      const range = f.mx - f.mn || 1;
      const px = v => Math.round(((v - f.mn) / range) * (W - 8) + 4);
      const xQ1 = px(f.q1), xQ3 = px(f.q3), xMed = px(f.mediana), xMean = px(f.med);
      // Puntos por objeto (color-coded con PALETA)
      const dots = f.vals.map((v, vi) => {
        const col = PALETA[vi % PALETA.length].stroke;
        return `<circle cx="${px(v)}" cy="${H/2}" r="3" fill="${col}" opacity="0.85" stroke="white" stroke-width="0.8"/>`;
      }).join('');
      return `<svg width="${W}" height="${H}" style="vertical-align:middle;display:block;margin:0 auto;" title="Min: ${f.mn.toFixed(3)} | Q1: ${f.q1.toFixed(3)} | Med: ${f.mediana.toFixed(3)} | Q3: ${f.q3.toFixed(3)} | Max: ${f.mx.toFixed(3)}">` +
        `<line x1="4" y1="${H/2}" x2="${W-4}" y2="${H/2}" stroke="#e2e8f0" stroke-width="2"/>` +
        `<rect x="${xQ1}" y="${H/2-4}" width="${Math.max(1,xQ3-xQ1)}" height="8" fill="rgba(99,179,237,0.28)" stroke="#93c5fd" stroke-width="1"/>` +
        `<line x1="${xMed}" y1="${H/2-6}" x2="${xMed}" y2="${H/2+6}" stroke="#e53e3e" stroke-width="2"/>` +
        `<line x1="${xMean-1}" y1="${H/2-4}" x2="${xMean+1}" y2="${H/2+4}" stroke="#4a5568" stroke-width="2.5"/>` +
        dots +
        `</svg>`;
    };

    // Insight bar: métrica más heterogénea / homogénea / alerta de alta variabilidad
    const maxCVRow = filas.reduce((a, b) => a.cv > b.cv ? a : b);
    const minCVRow = filas.slice().sort((a, b) => a.cv - b.cv)[0];
    const nHigh = filas.filter(f => f.cv > 35).length;
    const insightHtml = `<div class="cmo-insight-bar">
      <div class="cmo-insight-card${maxCVRow.cv > 35 ? ' alert' : ' warn'}">
        <div class="cmo-insight-card-label">Más heterogénea</div>
        <div class="cmo-insight-card-val">${esc(maxCVRow.label.split(' ').slice(0,3).join(' '))}</div>
        <div style="color:#c53030;font-size:11px;font-weight:600;">CV = ${maxCVRow.cv.toFixed(1)}%</div>
      </div>
      <div class="cmo-insight-card">
        <div class="cmo-insight-card-label">Más homogénea</div>
        <div class="cmo-insight-card-val">${esc(minCVRow.label.split(' ').slice(0,3).join(' '))}</div>
        <div style="color:#276749;font-size:11px;font-weight:600;">CV = ${minCVRow.cv.toFixed(1)}%</div>
      </div>
      ${nHigh > 0 ? `<div class="cmo-insight-card alert">
        <div class="cmo-insight-card-label">Alta variabilidad (CV&gt;35%)</div>
        <div class="cmo-insight-card-val">${nHigh} métrica${nHigh > 1 ? 's' : ''}</div>
      </div>` : `<div class="cmo-insight-card info">
        <div class="cmo-insight-card-label">Cohesión del grupo</div>
        <div class="cmo-insight-card-val">CV &lt; 35% en todo</div>
      </div>`}
    </div>`;

    let html = `<table class="cmo-stats-table">
      <thead><tr>
        <th>Métrica</th>
        <th>Media</th><th>Mín</th><th>Máx</th>
        <th>Desv. Est.</th><th>CV (%)</th><th>Mediana</th>
        <th title="Min | IQR | Mediana(rojo) | Máx">Distribución</th>
        <th>N</th>
      </tr></thead><tbody>`;
    for (const f of filas) {
      html += `<tr>
        <td>${esc(f.label)}</td>
        <td>${f.med.toFixed(3)}</td>
        <td>${f.mn.toFixed(3)}</td>
        <td>${f.mx.toFixed(3)}</td>
        <td>${f.std.toFixed(3)}</td>
        <td class="${f.cvCls}">${f.cv.toFixed(1)}%</td>
        <td>${f.mediana.toFixed(3)}</td>
        <td style="padding:2px 8px;">${spark(f)}</td>
        <td style="color:#718096;">${f.n}</td>
      </tr>`;
    }
    html += `</tbody></table>
      <div style="margin-top:8px;font-size:10px;color:#a0aec0;display:flex;gap:14px;flex-wrap:wrap;align-items:center;">
        <span><svg width="40" height="10" style="vertical-align:middle;"><line x1="2" y1="5" x2="38" y2="5" stroke="#cbd5e0" stroke-width="2"/></svg> Rango min–max</span>
        <span><svg width="14" height="10" style="vertical-align:middle;"><rect x="1" y="1" width="12" height="8" fill="rgba(99,179,237,0.4)" stroke="#63b3ed" stroke-width="1"/></svg> IQR (Q1–Q3)</span>
        <span><svg width="14" height="10" style="vertical-align:middle;"><line x1="7" y1="0" x2="7" y2="10" stroke="#e53e3e" stroke-width="2"/></svg> Mediana</span>
        <span><svg width="14" height="10" style="vertical-align:middle;"><circle cx="7" cy="5" r="3" fill="#4a5568" opacity="0.7"/></svg> Media</span>
      </div>`;

    // ── Sección distribución normal: placeholders de canvas ──────────────────
    const normDistHtml = `
      <div class="cmo-radar-side-title" style="margin:20px 0 8px;">Distribución normal estimada por métrica</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(234px,1fr));gap:10px;margin-bottom:10px;">
        ${filas.map((f, fi) => `<div id="cmoNDCard_${fi}" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);background:#fff;cursor:pointer;transition:box-shadow .15s,border-color .15s;" title="Clic para ampliar con estadísticos completos"><canvas id="cmoND_${fi}" width="234" height="132" style="display:block;"></canvas></div>`).join('')}
      </div>
      <div style="font-size:10px;color:#a0aec0;display:flex;gap:14px;flex-wrap:wrap;align-items:center;">
        <span style="color:#1e40af;font-weight:600;">│ Media</span>
        <span style="color:#e53e3e;font-weight:600;">¦ Mediana</span>
        <span>Banda azul oscura = ±1σ &nbsp; Banda clara = ±2σ</span>
        <span>Puntos = valores individuales (color por objeto)</span>
        <span style="color:#276749;font-weight:600;">≈ Normal</span>
        <span style="color:#744210;font-weight:600;">▲▼ Asimetría moderada</span>
        <span style="color:#9b2c2c;font-weight:600;">▲▼ Asimetría alta</span>
      </div>`;

    // Inyectar TODO de una vez (tabla + distribuciones)
    document.getElementById('cmoEstadisticosContenido').innerHTML = insightHtml + html + normDistHtml;

    // ── Dibujar cada mini gráfico de distribución normal ─────────────────────
    const _phi = (x, mu, sigma) =>
      sigma === 0 ? 0 : (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mu) / sigma) ** 2);

    // Tooltip reutilizado para los minicanvas
    let _ttND = document.getElementById('cmoNDTooltipBody');
    if (!_ttND) {
      _ttND = document.createElement('div');
      _ttND.id = 'cmoNDTooltipBody';
      _ttND.className = 'cmo-overlay';
      _ttND.style.cssText = 'display:none;position:fixed;background:rgba(26,32,44,0.95);color:#fff;font-size:11px;padding:6px 10px;border-radius:7px;pointer-events:none;z-index:9999;line-height:1.6;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.2);';
      document.body.appendChild(_ttND);
    }

    filas.forEach((f, fi) => {
      const cnv = document.getElementById('cmoND_' + fi);
      if (!cnv) return;
      const ctx2 = cnv.getContext('2d');
      const W = cnv.width, H = cnv.height;
      const PAD = { t: 32, b: 28, l: 12, r: 12 };
      const PW  = W - PAD.l - PAD.r;
      const PH  = H - PAD.t - PAD.b;
      const mu = f.med, sigma = f.std;

      // Fondo blanco
      ctx2.fillStyle = '#fff'; ctx2.fillRect(0, 0, W, H);

      // Caso sin varianza: solo mostrar línea vertical y nota
      if (sigma < 1e-10) {
        const cx2 = W / 2;
        ctx2.fillStyle = '#2d3748'; ctx2.font = 'bold 8.5px system-ui,sans-serif'; ctx2.textAlign = 'left';
        ctx2.fillText(f.label.split(' ').slice(0, 3).join(' '), PAD.l, 11);
        ctx2.fillStyle = '#a0aec0'; ctx2.font = '8px system-ui,sans-serif'; ctx2.textAlign = 'center';
        ctx2.fillText('Sin varianza (σ≈0)', cx2, H / 2);
        ctx2.strokeStyle = '#1e40af'; ctx2.lineWidth = 2;
        ctx2.beginPath(); ctx2.moveTo(cx2, PAD.t); ctx2.lineTo(cx2, H - PAD.b); ctx2.stroke();
        return;
      }

      // Rango X con margen del 10% + ±3σ
      const margin = (f.mx - f.mn) * 0.08 || sigma * 0.5;
      const xLo   = Math.min(f.mn - margin, mu - 3.2 * sigma);
      const xHi   = Math.max(f.mx + margin, mu + 3.2 * sigma);
      const xRange = xHi - xLo;
      const toX = x => PAD.l + (x - xLo) / xRange * PW;

      // Curva normal (180 puntos)
      const NP  = 180;
      const pts = Array.from({ length: NP }, (_, k) => {
        const x = xLo + (k / (NP - 1)) * xRange;
        return { x, y: _phi(x, mu, sigma) };
      });
      const maxY = Math.max(...pts.map(p => p.y));
      const toY  = y => PAD.t + PH - (y / maxY) * PH;
      const axisY = PAD.t + PH;

      // Fondo del área del gráfico
      ctx2.fillStyle = '#f8fafc';
      ctx2.fillRect(PAD.l, PAD.t, PW, PH);

      // Banda ±2σ
      const fill2 = pts.filter(p => p.x >= mu - 2 * sigma && p.x <= mu + 2 * sigma);
      if (fill2.length > 1) {
        ctx2.beginPath();
        fill2.forEach((p, k) => k === 0 ? ctx2.moveTo(toX(p.x), toY(p.y)) : ctx2.lineTo(toX(p.x), toY(p.y)));
        ctx2.lineTo(toX(mu + 2 * sigma), axisY); ctx2.lineTo(toX(mu - 2 * sigma), axisY); ctx2.closePath();
        ctx2.fillStyle = 'rgba(147,197,253,0.22)'; ctx2.fill();
      }

      // Banda ±1σ
      const fill1 = pts.filter(p => p.x >= mu - sigma && p.x <= mu + sigma);
      if (fill1.length > 1) {
        ctx2.beginPath();
        fill1.forEach((p, k) => k === 0 ? ctx2.moveTo(toX(p.x), toY(p.y)) : ctx2.lineTo(toX(p.x), toY(p.y)));
        ctx2.lineTo(toX(mu + sigma), axisY); ctx2.lineTo(toX(mu - sigma), axisY); ctx2.closePath();
        ctx2.fillStyle = 'rgba(59,130,246,0.26)'; ctx2.fill();
      }

      // Curva de la campana
      ctx2.beginPath();
      pts.forEach((p, k) => k === 0 ? ctx2.moveTo(toX(p.x), toY(p.y)) : ctx2.lineTo(toX(p.x), toY(p.y)));
      ctx2.strokeStyle = '#3b82f6'; ctx2.lineWidth = 2; ctx2.stroke();

      // Eje X
      ctx2.strokeStyle = '#cbd5e0'; ctx2.lineWidth = 1; ctx2.setLineDash([]);
      ctx2.beginPath(); ctx2.moveTo(PAD.l, axisY); ctx2.lineTo(W - PAD.r, axisY); ctx2.stroke();

      // Marcas σ (μ-2σ … μ+2σ)
      [-2, -1, 0, 1, 2].forEach(k => {
        const xk = mu + k * sigma;
        if (xk < xLo || xk > xHi) return;
        ctx2.strokeStyle = '#dde3ec'; ctx2.lineWidth = 1; ctx2.setLineDash([2, 2]);
        ctx2.beginPath(); ctx2.moveTo(toX(xk), PAD.t); ctx2.lineTo(toX(xk), axisY); ctx2.stroke();
        ctx2.setLineDash([]);
        ctx2.fillStyle = '#a0aec0'; ctx2.font = '7.5px system-ui,sans-serif'; ctx2.textAlign = 'center';
        ctx2.fillText(k === 0 ? 'μ' : (k > 0 ? '+' : '') + k + 'σ', toX(xk), axisY + 9);
      });

      // Línea de media (azul sólida)
      ctx2.strokeStyle = '#1e40af'; ctx2.lineWidth = 2; ctx2.setLineDash([]);
      ctx2.beginPath(); ctx2.moveTo(toX(mu), PAD.t); ctx2.lineTo(toX(mu), axisY); ctx2.stroke();

      // Línea de mediana (roja discontinua, solo si difiere de media)
      if (Math.abs(f.mediana - mu) > 0.001 * xRange) {
        ctx2.strokeStyle = '#e53e3e'; ctx2.lineWidth = 1.5; ctx2.setLineDash([3, 2]);
        ctx2.beginPath(); ctx2.moveTo(toX(f.mediana), PAD.t + 14); ctx2.lineTo(toX(f.mediana), axisY); ctx2.stroke();
        ctx2.setLineDash([]);
      }

      // Puntos individuales (rug plot sobre el eje X)
      const _rugHits = [];
      f.vals.forEach((v, vi) => {
        const col = PALETA[vi % PALETA.length].stroke;
        const rx  = toX(v);
        ctx2.beginPath();
        ctx2.arc(rx, axisY + 12, 3.5, 0, 2 * Math.PI);
        ctx2.fillStyle = col; ctx2.globalAlpha = 0.88; ctx2.fill(); ctx2.globalAlpha = 1;
        ctx2.strokeStyle = '#fff'; ctx2.lineWidth = 0.8; ctx2.stroke();
        _rugHits.push({ x: rx, y: axisY + 12, obj: objs[vi] ? objs[vi].nombre : '?', val: v, col });
      });

      // Badge de asimetría (top-right)
      const skew = f.vals.reduce((s, v) => s + ((v - mu) / sigma) ** 3, 0) / f.vals.length;
      const skewLabel = Math.abs(skew) < 0.5 ? '≈ Normal' : skew > 0 ? '▲ Asim.+' : '▼ Asim.-';
      const skewBg  = Math.abs(skew) < 0.5 ? 'rgba(72,187,120,.18)' : Math.abs(skew) < 1 ? 'rgba(237,137,54,.18)' : 'rgba(245,101,101,.18)';
      const skewClr = Math.abs(skew) < 0.5 ? '#276749' : Math.abs(skew) < 1 ? '#744210' : '#9b2c2c';
      const badgeW  = 50, badgeH = 13;
      ctx2.fillStyle = skewBg;
      ctx2.beginPath();
      if (ctx2.roundRect) ctx2.roundRect(W - PAD.r - badgeW, 4, badgeW, badgeH, 3);
      else ctx2.rect(W - PAD.r - badgeW, 4, badgeW, badgeH);
      ctx2.fill();
      ctx2.fillStyle = skewClr; ctx2.font = 'bold 8px system-ui,sans-serif'; ctx2.textAlign = 'center';
      ctx2.fillText(skewLabel, W - PAD.r - badgeW / 2, 14);

      // Badge de curtosis (a la izquierda del badge de asimetría)
      const kurt = sigma > 0 && f.vals.length >= 4
        ? f.vals.reduce((s, v) => s + ((v - mu) / sigma) ** 4, 0) / f.vals.length
        : 3;
      const kurtExc = kurt - 3;
      const kurtLabel = Math.abs(kurtExc) < 0.5 ? '≈ Mesoc.' : kurtExc > 0 ? '▲ Leptoc.' : '▼ Platik.';
      const kurtBg  = Math.abs(kurtExc) < 0.5 ? 'rgba(118,169,250,.18)' : Math.abs(kurtExc) < 1.5 ? 'rgba(237,137,54,.18)' : 'rgba(245,101,101,.18)';
      const kurtClr = Math.abs(kurtExc) < 0.5 ? '#1e40af' : Math.abs(kurtExc) < 1.5 ? '#744210' : '#9b2c2c';
      ctx2.fillStyle = kurtBg;
      ctx2.beginPath();
      if (ctx2.roundRect) ctx2.roundRect(W - PAD.r - badgeW * 2 - 6, 4, badgeW, badgeH, 3);
      else ctx2.rect(W - PAD.r - badgeW * 2 - 6, 4, badgeW, badgeH);
      ctx2.fill();
      ctx2.fillStyle = kurtClr; ctx2.font = 'bold 8px system-ui,sans-serif'; ctx2.textAlign = 'center';
      ctx2.fillText(kurtLabel, W - PAD.r - badgeW * 2 - 6 + badgeW / 2, 14);

      // Título (izquierda)
      const tWords = f.label.split(' ');
      let tLine = '', tLns = [];
      for (const w of tWords) {
        if ((tLine + ' ' + w).trim().length <= 20) tLine = (tLine + ' ' + w).trim();
        else { if (tLine) tLns.push(tLine); tLine = w; }
      }
      if (tLine) tLns.push(tLine);
      ctx2.fillStyle = '#2d3748'; ctx2.font = 'bold 8.5px system-ui,sans-serif'; ctx2.textAlign = 'left';
      ctx2.fillText(tLns.slice(0, 2).join(' '), PAD.l, 11);

      // μ ± σ annotation
      ctx2.fillStyle = '#718096'; ctx2.font = '7.5px system-ui,sans-serif';
      ctx2.fillText(`μ=${mu.toFixed(3)}  σ=${sigma.toFixed(3)}`, PAD.l, 22);

      // Tooltip al pasar sobre rug points
      cnv.onmousemove = e => {
        const rect = cnv.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * (W / rect.width);
        const my = (e.clientY - rect.top)  * (H / rect.height);
        const hit = _rugHits.find(h => Math.hypot(mx - h.x, my - h.y) <= 8);
        if (hit) {
          _ttND.innerHTML = `<span style="color:${hit.col};">●</span> <b>${esc(hit.obj)}</b>: ${hit.val.toFixed(4)}`;
          _ttND.style.display = 'block';
          _ttND.style.left = (e.clientX + 14) + 'px';
          _ttND.style.top  = (e.clientY - 14) + 'px';
        } else {
          _ttND.style.display = 'none';
        }
      };
      cnv.onmouseleave = () => { _ttND.style.display = 'none'; };
      // Hover + click sobre la tarjeta → modal
      const _card = document.getElementById('cmoNDCard_' + fi);
      if (_card) {
        _card.onmouseenter = () => { _card.style.boxShadow='0 4px 14px rgba(43,108,176,0.2)'; _card.style.borderColor='#bee3f8'; };
        _card.onmouseleave = () => { _card.style.boxShadow='0 1px 4px rgba(0,0,0,.06)'; _card.style.borderColor='#e2e8f0'; };
        _card.onclick = () => _openNDModal(f);
      }
    });

    // ── Modal distribución normal ampliado ────────────────────────────────────
    function _openNDModal(fM) {
      const muM = fM.med, sigM = fM.std;
      const skewM = sigM > 0 ? fM.vals.reduce((s,v) => s+((v-muM)/sigM)**3, 0)/fM.vals.length : 0;
      const kurtM  = sigM > 0 ? fM.vals.reduce((s,v) => s+((v-muM)/sigM)**4, 0)/fM.vals.length : 0;
      const skewLblM = Math.abs(skewM)<0.5 ? '≈ Normal' : skewM>0 ? '▲ Asim.+' : '▼ Asim.-';
      const skewBgM  = Math.abs(skewM)<0.5 ? 'rgba(72,187,120,.22)' : Math.abs(skewM)<1 ? 'rgba(237,137,54,.22)' : 'rgba(245,101,101,.22)';
      const skewClrM = Math.abs(skewM)<0.5 ? '#276749' : Math.abs(skewM)<1 ? '#744210' : '#9b2c2c';
      const iqrM = fM.q3 - fM.q1;

      // Crear modal una sola vez
      let modal = document.getElementById('cmoNDModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cmoNDModal';
        modal.className = 'cmo-overlay';
        modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.52);backdrop-filter:blur(3px);align-items:center;justify-content:center;';
        modal.innerHTML = `
          <div id="cmoNDModalBox" style="background:#fff;border-radius:18px;width:90vw;max-width:90vw;height:90vh;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 32px 80px rgba(0,0,0,.38);overflow:hidden;position:relative;">
            <div id="cmoNDModalHdr" style="padding:14px 22px;border-bottom:2px solid #e2e8f0;display:flex;align-items:center;gap:12px;flex-shrink:0;background:linear-gradient(135deg,#ebf8ff 0%,#fafbfc 100%);">
              <div style="width:5px;height:28px;border-radius:3px;background:linear-gradient(180deg,#3b82f6,#1e40af);flex-shrink:0;"></div>
              <div id="cmoNDModalTitle" style="font-size:16px;font-weight:800;color:#1a202c;flex:1;"></div>
              <div id="cmoNDModalMuSig" style="font-size:12px;color:#4a5568;font-weight:600;background:#edf2f7;padding:4px 12px;border-radius:7px;"></div>
              <div id="cmoNDModalSkew" style="border-radius:7px;padding:4px 14px;font-size:12px;font-weight:800;"></div>
              <button id="cmoNDModalClose" style="padding:6px 16px;background:#e2e8f0;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-weight:700;line-height:1;color:#4a5568;">✕</button>
            </div>
            <div style="flex:1;display:flex;overflow:hidden;min-height:0;">
              <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;padding:18px 16px 16px 20px;gap:12px;min-width:0;">
                <canvas id="cmoNDModalCanvas" width="900" height="520" style="display:block;border-radius:10px;border:1px solid #e2e8f0;flex:1;min-height:0;width:100%;box-shadow:0 2px 8px rgba(0,0,0,.06);"></canvas>
                <div style="font-size:10px;color:#718096;display:flex;gap:16px;flex-wrap:wrap;flex-shrink:0;padding:6px 10px;background:#f7fafc;border-radius:7px;border:1px solid #e8edf2;">
                  <span style="color:#1e40af;font-weight:700;">│ Media (μ)</span>
                  <span style="color:#e53e3e;font-weight:700;">¦ Mediana</span>
                  <span>Banda azul oscura = ±1σ → 68.3% de los datos</span>
                  <span>Banda azul clara = ±2σ → 95.4% de los datos</span>
                  <span>● Puntos en eje X = valores individuales (hover para detalle)</span>
                </div>
              </div>
              <div id="cmoNDModalSide" style="width:320px;flex-shrink:0;overflow-y:auto;border-left:2px solid #e8edf2;padding:16px 15px;background:#f8fafc;font-size:12px;"></div>
            </div>
          </div>`;
        document.body.appendChild(modal);
        document.getElementById('cmoNDModalClose').onclick = () => { modal.style.display='none'; };
        modal.onclick = e => { if(e.target===modal) modal.style.display='none'; };
        document.addEventListener('keydown', e => { if(e.key==='Escape'&&modal.style.display==='flex') modal.style.display='none'; });
      }

      // Rellenar cabecera
      document.getElementById('cmoNDModalTitle').textContent = fM.label;
      document.getElementById('cmoNDModalMuSig').textContent = `μ = ${muM.toFixed(5)}   σ = ${sigM.toFixed(5)}`;
      const skewEl = document.getElementById('cmoNDModalSkew');
      skewEl.textContent = skewLblM; skewEl.style.background=skewBgM; skewEl.style.color=skewClrM;

      // Panel lateral: estadísticos + valores individuales
      const pctRankFn = v => { const sv=[...fM.vals].sort((a,b)=>a-b); const idx=sv.indexOf(v); return idx<0?'—':((idx+1)/sv.length*100).toFixed(0)+'%'; };
      const statRows = [
        ['n (observaciones)', fM.n],
        ['Media (μ)', muM.toFixed(6)],
        ['Mediana', fM.mediana.toFixed(6)],
        ['Desv. estándar (σ)', sigM.toFixed(6)],
        ['CV (%)', fM.cv.toFixed(3)+'%'],
        ['Mínimo', fM.mn.toFixed(6)],
        ['Q1 (25%)', fM.q1.toFixed(6)],
        ['Q3 (75%)', fM.q3.toFixed(6)],
        ['Máximo', fM.mx.toFixed(6)],
        ['IQR', iqrM.toFixed(6)],
        ['Rango total', (fM.mx-fM.mn).toFixed(6)],
        ['Asimetría (g₁)', skewM.toFixed(4)],
        ['Curtosis exc. (g₂)', (kurtM-3).toFixed(4)],
        ['μ − 1σ', (muM-sigM).toFixed(6)],
        ['μ + 1σ', (muM+sigM).toFixed(6)],
        ['μ − 2σ', (muM-2*sigM).toFixed(6)],
        ['μ + 2σ', (muM+2*sigM).toFixed(6)],
      ];
      const valsHtml = fM.vals.map((v,vi) => {
        const zSc = sigM>0 ? ((v-muM)/sigM).toFixed(3) : '—';
        const col = PALETA[vi%PALETA.length].stroke;
        return `<div style="display:flex;align-items:center;gap:5px;padding:3px 0;border-bottom:1px solid #f0f4f8;">
          <span style="width:8px;height:8px;border-radius:50%;background:${col};flex-shrink:0;display:inline-block;"></span>
          <span style="font-size:10px;color:#4a5568;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(objs[vi]?.nombre||'?')}">${esc(objs[vi]?.nombre||'?')}</span>
          <span style="font-size:10.5px;font-weight:700;color:#2d3748;white-space:nowrap;">${v.toFixed(4)}</span>
          <span style="font-size:9px;color:#a0aec0;white-space:nowrap;">z=${zSc}</span>
        </div>`;
      }).join('');
      document.getElementById('cmoNDModalSide').innerHTML = `
        <div style="font-size:10.5px;font-weight:800;color:#2b6cb0;margin-bottom:9px;text-transform:uppercase;letter-spacing:0.5px;">Estadísticos</div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
          ${statRows.map(([lbl,val],ri) => `<tr style="background:${ri%2===0?'#fff':'#f0f4f8'};">
            <td style="padding:3.5px 5px;font-size:10px;color:#718096;">${lbl}</td>
            <td style="padding:3.5px 5px;font-size:10.5px;font-weight:700;color:#2d3748;text-align:right;font-variant-numeric:tabular-nums;">${val}</td>
          </tr>`).join('')}
        </table>
        <div style="border-top:1px solid #e2e8f0;padding-top:10px;">
          <div style="font-size:10.5px;font-weight:800;color:#2b6cb0;margin-bottom:7px;text-transform:uppercase;letter-spacing:0.5px;">Valores individuales</div>
          ${valsHtml}
        </div>`;

      // Dibujar canvas grande
      const mc = document.getElementById('cmoNDModalCanvas');
      const mCtx = mc.getContext('2d');
      // Adaptar resolución del canvas a su tamaño CSS real
      const mcRect = mc.getBoundingClientRect();
      if (mcRect.width > 0) { mc.width = Math.round(mcRect.width); mc.height = Math.round(mcRect.height); }
      const MW=mc.width, MH=mc.height;
      const MP = {t:52,b:68,l:22,r:22};
      const MPW=MW-MP.l-MP.r, MPH=MH-MP.t-MP.b;
      mCtx.clearRect(0,0,MW,MH);
      mCtx.fillStyle='#fff'; mCtx.fillRect(0,0,MW,MH);

      if (sigM < 1e-10) {
        mCtx.fillStyle='#a0aec0'; mCtx.font='13px system-ui,sans-serif'; mCtx.textAlign='center';
        mCtx.fillText('Sin varianza (σ ≈ 0) — todos los valores son iguales', MW/2, MH/2);
      } else {
        const marg = (fM.mx-fM.mn)*0.10||sigM*0.6;
        const xLo2=Math.min(fM.mn-marg, muM-3.3*sigM);
        const xHi2=Math.max(fM.mx+marg, muM+3.3*sigM);
        const xRng=xHi2-xLo2;
        const toX2=x=>MP.l+(x-xLo2)/xRng*MPW;
        const NP3=280;
        const pts2=Array.from({length:NP3},(_,k)=>{ const x=xLo2+k/(NP3-1)*xRng; return {x,y:_phi(x,muM,sigM)}; });
        const maxY2=Math.max(...pts2.map(p=>p.y));
        const toY2=y=>MP.t+MPH-(y/maxY2)*MPH;
        const axY=MP.t+MPH;
        // Fondo área
        mCtx.fillStyle='#f8fafc'; mCtx.fillRect(MP.l,MP.t,MPW,MPH);
        // Grid
        mCtx.strokeStyle='#e8edf2'; mCtx.lineWidth=1;
        for(let g=1;g<=4;g++){mCtx.beginPath();mCtx.moveTo(MP.l,MP.t+g*MPH/4);mCtx.lineTo(MP.l+MPW,MP.t+g*MPH/4);mCtx.stroke();}
        // Banda ±2σ
        const b2=pts2.filter(p=>p.x>=muM-2*sigM&&p.x<=muM+2*sigM);
        if(b2.length>1){mCtx.beginPath();b2.forEach((p,k)=>k===0?mCtx.moveTo(toX2(p.x),toY2(p.y)):mCtx.lineTo(toX2(p.x),toY2(p.y)));mCtx.lineTo(toX2(muM+2*sigM),axY);mCtx.lineTo(toX2(muM-2*sigM),axY);mCtx.closePath();mCtx.fillStyle='rgba(147,197,253,0.24)';mCtx.fill();}
        // Banda ±1σ
        const b1=pts2.filter(p=>p.x>=muM-sigM&&p.x<=muM+sigM);
        if(b1.length>1){mCtx.beginPath();b1.forEach((p,k)=>k===0?mCtx.moveTo(toX2(p.x),toY2(p.y)):mCtx.lineTo(toX2(p.x),toY2(p.y)));mCtx.lineTo(toX2(muM+sigM),axY);mCtx.lineTo(toX2(muM-sigM),axY);mCtx.closePath();mCtx.fillStyle='rgba(59,130,246,0.28)';mCtx.fill();}
        // Curva
        mCtx.beginPath();pts2.forEach((p,k)=>k===0?mCtx.moveTo(toX2(p.x),toY2(p.y)):mCtx.lineTo(toX2(p.x),toY2(p.y)));
        mCtx.strokeStyle='#3b82f6';mCtx.lineWidth=2.5;mCtx.stroke();
        // Eje X
        mCtx.strokeStyle='#cbd5e0';mCtx.lineWidth=1;mCtx.setLineDash([]);
        mCtx.beginPath();mCtx.moveTo(MP.l,axY);mCtx.lineTo(MP.l+MPW,axY);mCtx.stroke();
        // Eje Y izquierdo
        mCtx.beginPath();mCtx.moveTo(MP.l,MP.t);mCtx.lineTo(MP.l,axY);mCtx.stroke();
        // Marcas σ
        [-2,-1,0,1,2].forEach(k=>{
          const xk=muM+k*sigM;
          if(xk<xLo2||xk>xHi2) return;
          mCtx.strokeStyle='#dde3ec';mCtx.lineWidth=1;mCtx.setLineDash([3,3]);
          mCtx.beginPath();mCtx.moveTo(toX2(xk),MP.t);mCtx.lineTo(toX2(xk),axY);mCtx.stroke();
          mCtx.setLineDash([]);
          mCtx.fillStyle='#718096';mCtx.font='9.5px system-ui,sans-serif';mCtx.textAlign='center';
          mCtx.fillText(k===0?'μ':(k>0?'+':'')+k+'σ', toX2(xk), axY+13);
          mCtx.fillStyle='#a0aec0';mCtx.font='8px system-ui,sans-serif';
          mCtx.fillText((muM+k*sigM).toFixed(3), toX2(xk), axY+24);
        });
        // Línea media
        mCtx.strokeStyle='#1e40af';mCtx.lineWidth=2.5;mCtx.setLineDash([]);
        mCtx.beginPath();mCtx.moveTo(toX2(muM),MP.t);mCtx.lineTo(toX2(muM),axY);mCtx.stroke();
        // Línea mediana
        const _medDistPx = Math.abs(toX2(fM.mediana) - toX2(muM));
        const _medClose  = _medDistPx < 80; // px — si están muy próximas, offset vertical
        if(Math.abs(fM.mediana-muM)>0.001*xRng){
          mCtx.strokeStyle='#e53e3e';mCtx.lineWidth=2;mCtx.setLineDash([5,3]);
          mCtx.beginPath();mCtx.moveTo(toX2(fM.mediana),MP.t+(_medClose?16:8));mCtx.lineTo(toX2(fM.mediana),axY);mCtx.stroke();
          mCtx.setLineDash([]);
        }
        // Etiquetas μ y mediana — se dibujan después de ambas líneas para evitar solapamiento
        mCtx.font='bold 10px system-ui,sans-serif';mCtx.textAlign='center';
        // μ: siempre en la fila superior
        mCtx.fillStyle='#1e40af';
        mCtx.fillText('μ = '+muM.toFixed(4), toX2(muM), MP.t-6);
        // Med.: si están cerca, va en fila inferior (MP.t+11); si no, misma fila pero a su posición X
        if(Math.abs(fM.mediana-muM)>0.001*xRng){
          mCtx.fillStyle='#e53e3e';
          mCtx.fillText('Med. = '+fM.mediana.toFixed(4), toX2(fM.mediana), _medClose ? MP.t+11 : MP.t-6);
        }
        // Etiquetas de % en bandas
        mCtx.font='bold 10px system-ui,sans-serif';mCtx.textAlign='center';
        mCtx.fillStyle='rgba(59,130,246,0.85)';mCtx.fillText('68.3%  (±1σ)', toX2(muM), toY2(maxY2*0.38));
        mCtx.fillStyle='rgba(100,160,240,0.7)';mCtx.fillText('95.4%  (±2σ)', toX2(muM), toY2(maxY2*0.07));
        // Rug plot — con jitter vertical para puntos solapados
        const mRug=[];
        // Calcular posición X de cada punto y agrupar los solapados
        const _rugR = 5.5;                               // radio en px del canvas
        const _rugGap = _rugR * 2 + 2;                   // distancia vertical entre niveles
        const _rugY0  = axY + _rugR + 6;                 // primera fila (más cercana al eje)
        const _rugPts = fM.vals.map((v,vi)=>({ v, vi, rx: toX2(v) }));
        // Para cada punto, contar cuántos anteriores están "muy cerca" en X y asignar fila
        _rugPts.forEach((p, pi) => {
          const close = _rugPts.slice(0, pi).filter(q => Math.abs(q.rx - p.rx) < _rugGap);
          p.row = close.length;                           // nº de solapamientos ya asignados
        });
        _rugPts.forEach(({v, vi, rx, row}) => {
          const col = PALETA[vi%PALETA.length].stroke;
          const ry  = _rugY0 + row * _rugGap;
          mCtx.beginPath();mCtx.arc(rx, ry, _rugR, 0, 2*Math.PI);
          mCtx.fillStyle=col;mCtx.fill();
          mCtx.strokeStyle='#fff';mCtx.lineWidth=1.2;mCtx.stroke();
          mRug.push({x:rx, y:ry, obj:objs[vi]?.nombre||'?', val:v, col});
        });
        // Tooltip rug en modal
        let _ttM=document.getElementById('cmoNDModalTT');
        if(!_ttM){_ttM=document.createElement('div');_ttM.id='cmoNDModalTT';_ttM.className='cmo-overlay';_ttM.style.cssText='display:none;position:fixed;background:rgba(26,32,44,0.95);color:#fff;font-size:11px;padding:6px 10px;border-radius:7px;pointer-events:none;z-index:10100;line-height:1.6;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.2);';document.body.appendChild(_ttM);}
        mc.onmousemove=e=>{const r=mc.getBoundingClientRect();const mx2=(e.clientX-r.left)*(MW/r.width),my2=(e.clientY-r.top)*(MH/r.height);const h=mRug.find(p=>Math.hypot(mx2-p.x,my2-p.y)<=10);if(h){_ttM.innerHTML=`<span style="color:${h.col};">●</span> <b>${esc(h.obj)}</b>: ${h.val.toFixed(6)}`;_ttM.style.display='block';_ttM.style.left=(e.clientX+14)+'px';_ttM.style.top=(e.clientY-14)+'px';}else{_ttM.style.display='none';}};
        mc.onmouseleave=()=>{_ttM.style.display='none';};
      }
      // Mostrar modal con animación
      modal.style.display='flex';
      const box=document.getElementById('cmoNDModalBox');
      box.style.opacity='0';box.style.transform='scale(0.93)';box.style.transition='opacity .22s,transform .22s';
      requestAnimationFrame(()=>{box.style.opacity='1';box.style.transform='scale(1)';});
    }

    // CSV stats
    document.getElementById('cmoExportarEstadisticosCSV').onclick = () => {
      const rows = ['\uFEFFMetrica,Media,Min,Max,DesvEst,CV_pct,Mediana,Q1,Q3,N'];
      for (const f of filas) {
        rows.push([
          `"${f.label.replace(/,/g,';')}"`,
          f.med.toFixed(4), f.mn.toFixed(4), f.mx.toFixed(4),
          f.std.toFixed(4), f.cv.toFixed(2), f.mediana.toFixed(4),
          f.q1.toFixed(4), f.q3.toFixed(4), f.n
        ].join(','));
      }
      _guardarCSV(_buildCMOExportFilename('estadisticos', 'tabla_estadisticos', 'csv'), rows.join('\n'));
    };
  }

  // ──── DISPERSIÓN (box plots + puntos individuales) ───────────────────────
  function renderDispersion(objs, keys) {
    const tabBtn = document.querySelector('.cmo-tab-btn[data-tab="dispersion"]');
    const numKeys = keys.filter(k => {
      const vals = objs.map(o => getValor(o,k)).filter(v => typeof v==='number' && isFinite(v));
      return vals.length >= 2;
    });
    if (!numKeys.length) { if (tabBtn) { tabBtn.style.opacity='0.4'; tabBtn.disabled=true; } return; }
    if (tabBtn) { tabBtn.style.opacity=''; tabBtn.disabled=false; }

    // ── Percentil helper ────────────────────────────────────────────────────
    const percentil = (sorted, p) => {
      const idx = (p / 100) * (sorted.length - 1);
      const lo = Math.floor(idx), hi = Math.ceil(idx);
      return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
    };

    // ── Estadísticos por métrica ─────────────────────────────────────────────
    const stats = numKeys.map(key => {
      const pairs = objs.map((o,oi) => ({ oi, obj:o, v: getValor(o,key) }))
                        .filter(p => typeof p.v==='number' && isFinite(p.v));
      const vv     = pairs.map(p=>p.v);
      const sorted = [...vv].sort((a,b)=>a-b);
      const n      = vv.length;
      const mn     = sorted[0], mx = sorted[n-1];
      const mean   = vv.reduce((a,b)=>a+b,0)/n;
      const std    = Math.sqrt(vv.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(n-1,1));
      const cv     = mean !== 0 ? Math.abs(std/mean)*100 : 0;
      const q1     = percentil(sorted, 25);
      const q2     = percentil(sorted, 50);
      const q3     = percentil(sorted, 75);
      const iqr    = q3 - q1;
      const wLo    = Math.max(mn, q1 - 1.5 * iqr);
      const wHi    = Math.min(mx, q3 + 1.5 * iqr);
      return { key, label: KEY_LABEL[key]||key, pairs, n, mn, mx, mean, std, cv, q1, q2, q3, iqr, wLo, wHi };
    });

    // ── Pearson entre métricas (para SPLOM) ──────────────────────────────────
    const pearsonDisp = (ka, kb) => {
      const p2 = objs.map(o => ({ a: getValor(o,ka), b: getValor(o,kb) }))
        .filter(p => typeof p.a==='number'&&isFinite(p.a)&&typeof p.b==='number'&&isFinite(p.b));
      if (p2.length < 3) return null;
      const n2 = p2.length;
      const ma = p2.reduce((s,p)=>s+p.a,0)/n2, mb = p2.reduce((s,p)=>s+p.b,0)/n2;
      const num = p2.reduce((s,p)=>s+(p.a-ma)*(p.b-mb),0);
      const da  = Math.sqrt(p2.reduce((s,p)=>s+(p.a-ma)**2,0));
      const db  = Math.sqrt(p2.reduce((s,p)=>s+(p.b-mb)**2,0));
      return da===0||db===0 ? null : num/(da*db);
    };
    const _splomPairs = [];
    for (let _si=0; _si<numKeys.length; _si++) {
      for (let _sj=_si+1; _sj<numKeys.length; _sj++) {
        _splomPairs.push({ i:_si, j:_sj, li:stats[_si].label, lj:stats[_sj].label,
          r: pearsonDisp(numKeys[_si], numKeys[_sj]),
          ki: numKeys[_si], kj: numKeys[_sj] });
      }
    }
    _splomPairs.sort((a,b) => Math.abs(b.r??0) - Math.abs(a.r??0));
    const _SP_W = 174, _SP_H = 130;
    const splomHtml = _splomPairs.length === 0 ? '' : (() => {
      // Mini heatmap de r
      const _hn = numKeys.length;
      const _HCELL = Math.max(30, Math.min(52, Math.floor(500 / _hn)));
      const _hRows = numKeys.map((ki2, ii2) =>
        `<tr>
          <td style="position:sticky;left:0;background:#f8fafc;font-size:9px;color:#4a5568;padding:2px 5px;white-space:nowrap;z-index:2;">${esc(stats[ii2].label)}</td>
          ${numKeys.map((kj2, jj2) => {
            if (ii2 === jj2) return `<td style="background:#e2e8f0;width:${_HCELL}px;height:${_HCELL}px;text-align:center;font-size:9px;font-weight:700;color:#718096;">1</td>`;
            const _r2 = ii2 < jj2 ? pearsonDisp(ki2, kj2) : pearsonDisp(kj2, ki2);
            if (_r2 === null) return `<td style="background:#f8fafc;width:${_HCELL}px;height:${_HCELL}px;text-align:center;font-size:9px;color:#a0aec0;">—</td>`;
            const _abs2 = Math.abs(_r2);
            const _bg2  = _r2 > 0 ? `rgba(56,161,105,${(_abs2*0.55+0.08).toFixed(2)})` : `rgba(229,62,62,${(_abs2*0.55+0.08).toFixed(2)})`;
            const _fg2  = _abs2 > 0.4 ? '#fff' : (_r2 > 0 ? '#276749' : '#c53030');
            const _brd2 = _abs2 >= 0.7 ? `border:2px solid ${_r2>0?'#276749':'#c53030'};` : '';
            return `<td style="background:${_bg2};color:${_fg2};${_brd2}width:${_HCELL}px;height:${_HCELL}px;text-align:center;font-size:${Math.max(8,Math.min(10,Math.round(_HCELL*0.19)))}px;font-weight:700;cursor:pointer;" title="${esc(stats[ii2].label)} × ${esc(stats[jj2].label)}: r=${_r2.toFixed(4)}" data-spi="${ii2}" data-spj="${jj2}">${_r2.toFixed(2)}</td>`;
          }).join('')}
        </tr>`
      ).join('');
      const hdrCells2 = numKeys.map((k,j) => {
        const lbl2 = stats[j].label; const ww = lbl2.split(' ');
        let ll='',ls=[];
        for (const w of ww) { if ((ll+' '+w).trim().length<=10){ll=(ll+' '+w).trim();}else{if(ll)ls.push(ll);ll=w;} }
        if(ll)ls.push(ll);
        return `<th style="position:sticky;top:0;background:#f8fafc;font-size:8.5px;font-weight:700;color:#4a5568;padding:3px 2px;text-align:center;white-space:nowrap;z-index:3;min-width:${_HCELL}px;">${ls.slice(0,2).join('<br>')}</th>`;
      }).join('');
      const heatHtml = `
        <div class="cmo-radar-side-title" style="margin:22px 0 8px;">Heatmap de correlaciones r de Pearson · haz clic en una celda para ver el scatter</div>
        <div style="overflow:auto;max-height:340px;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 1px 6px rgba(0,0,0,.05);">
          <table style="border-collapse:collapse;min-width:100%;">
            <thead><tr>
              <th style="position:sticky;left:0;top:0;background:#f8fafc;z-index:4;padding:3px 5px;font-size:9px;"></th>
              ${hdrCells2}
            </tr></thead>
            <tbody>${_hRows}</tbody>
          </table>
        </div>
        <div style="margin-top:6px;font-size:10px;color:#a0aec0;display:flex;gap:14px;flex-wrap:wrap;">
          <span style="color:#276749;font-weight:600;">■ r positivo</span>
          <span style="color:#c53030;font-weight:600;">■ r negativo</span>
          <span style="font-weight:700;color:#4a5568;">Borde = |r|≥0.7 fuerte</span>
        </div>`;
      // Mini scatter cards (SPLOM)
      const scatCards = _splomPairs.map((sp,pi) => {
        const _rV = sp.r??0, _aR = Math.abs(_rV);
        const _rC = _rV>0?'#276749':'#c53030';
        const _rB = _rV>0?`rgba(56,161,105,${(_aR*0.22+0.04).toFixed(2)})`:`rgba(229,62,62,${(_aR*0.22+0.04).toFixed(2)})`;
        const _itp = _aR>=0.8?'Muy fuerte':_aR>=0.6?'Fuerte':_aR>=0.4?'Moderada':'Débil';
        return `<div class="cmo-disp-splom-card" data-spi="${sp.i}" data-spj="${sp.j}" style="border:1.5px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.06);cursor:pointer;transition:box-shadow .15s;">
          <div style="display:flex;gap:4px;align-items:center;padding:5px 7px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
            <span style="font-size:8.5px;color:#4a5568;font-weight:700;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(sp.li)}">${esc(sp.li)}</span>
            <span style="font-size:9px;color:#a0aec0;flex-shrink:0;">×</span>
            <span style="font-size:8.5px;color:#4a5568;font-weight:700;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;" title="${esc(sp.lj)}">${esc(sp.lj)}</span>
          </div>
          <canvas id="cmoDispSP_${pi}" width="${_SP_W}" height="${_SP_H}" style="display:block;width:100%;"></canvas>
          <div style="padding:4px 8px;background:${_rB};display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:10.5px;font-weight:800;color:${_rC};">r = ${sp.r!==null?sp.r.toFixed(3):'—'}</span>
            <span style="font-size:9px;color:${_rC};font-weight:600;">${_itp}</span>
          </div>
        </div>`;
      }).join('');
      return heatHtml + `
        <div class="cmo-radar-side-title" style="margin:20px 0 8px;">Scatter Plot Matrix — todos los pares de métricas (ordenados por |r|)</div>
        <div id="cmoDispSplomGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(${_SP_W}px,1fr));gap:10px;">
          ${scatCards}
        </div>
        <div id="cmoDispFullScatWrap" style="display:none;margin-top:18px;border-top:1px solid #e2e8f0;padding-top:16px;"></div>`;
    })();

    // ── Insight cards ────────────────────────────────────────────────────────
    const nLow     = stats.filter(s => s.cv < 15).length;
    const nMid     = stats.filter(s => s.cv >= 15 && s.cv < 35).length;
    const nHgh     = stats.filter(s => s.cv >= 35).length;
    const maxCVStat = stats.reduce((a,b) => a.cv > b.cv ? a : b);
    const minCVStat = stats.reduce((a,b) => a.cv < b.cv ? a : b);
    const insightDispHtml = `<div class="cmo-insight-bar" style="margin-bottom:10px;">
      <div class="cmo-insight-card info">
        <div class="cmo-insight-card-label">Homogéneas (CV&lt;15%)</div>
        <div class="cmo-insight-card-val">${nLow}</div>
      </div>
      <div class="cmo-insight-card warn">
        <div class="cmo-insight-card-label">Moderadas (15–35%)</div>
        <div class="cmo-insight-card-val">${nMid}</div>
      </div>
      <div class="cmo-insight-card${nHgh > 0 ? ' alert' : ''}">
        <div class="cmo-insight-card-label">Heterogéneas (CV&gt;35%)</div>
        <div class="cmo-insight-card-val">${nHgh}</div>
      </div>
      <div class="cmo-insight-card${maxCVStat.cv > 35 ? ' alert' : ' warn'}">
        <div class="cmo-insight-card-label">Mayor dispersión</div>
        <div class="cmo-insight-card-val">${esc(maxCVStat.label.split(' ').slice(0,3).join(' '))}</div>
        <div style="font-size:10px;font-weight:600;color:${maxCVStat.cv > 35 ? '#c53030' : '#744210'};">CV = ${maxCVStat.cv.toFixed(1)}%</div>
      </div>
      <div class="cmo-insight-card info">
        <div class="cmo-insight-card-label">Más homogénea</div>
        <div class="cmo-insight-card-val">${esc(minCVStat.label.split(' ').slice(0,3).join(' '))}</div>
        <div style="font-size:10px;font-weight:600;color:#276749;">CV = ${minCVStat.cv.toFixed(1)}%</div>
      </div>
    </div>`;

    // ── Leyenda flex-wrap ────────────────────────────────────────────────────
    const legendBarHtml = `<div class="cmo-radar-legend-bar" style="margin-bottom:12px;">
      ${objs.map((o,oi) => {
        const c = PALETA[oi % PALETA.length];
        const cara = o.cara && o.cara !== 'Mono' ? ` · <em style="color:#a0aec0;font-style:italic;">${esc(o.cara)}</em>` : '';
        return `<div class="cmo-radar-legend-row">
          <div class="cmo-radar-legend-swatch" style="background:${c.stroke};"></div>
          <span style="font-size:11px;color:#2d3748;">${esc(o.nombre)}${cara}</span>
        </div>`;
      }).join('')}
    </div>`;

    // ── Dimensiones del canvas ───────────────────────────────────────────────
    const COL_W  = Math.max(80, Math.min(120, Math.floor(900 / numKeys.length)));
    const PAD_L  = 54, PAD_R = 20, PAD_T = 50, PAD_B = 112;
    const PLOT_H = 320;
    const W = PAD_L + numKeys.length * COL_W + PAD_R;
    const H = PAD_T + PLOT_H + PAD_B;

    // ── Tabla de estadísticos (métricas = filas) ─────────────────────────────
    const cvBg = cv => {
      if (cv < 15)  return { bg:'#ebf8f0', fg:'#276749' };
      if (cv < 35)  return { bg:'#fffbeb', fg:'#744210' };
      return { bg:'#fff5f5', fg:'#9b2c2c' };
    };
    const statsTableHtml = `
      <div class="cmo-radar-side-title" style="margin:18px 0 6px;">Resumen estadístico por métrica</div>
      <div class="cmo-radar-table-wrap" style="max-height:320px;">
        <table class="cmo-radar-table">
          <thead>
            <tr>
              <th class="cmo-rt-obj-header" style="min-width:140px;">Métrica</th>
              <th class="cmo-rt-metric-col">n</th>
              <th class="cmo-rt-metric-col">Mín</th>
              <th class="cmo-rt-metric-col">Q1</th>
              <th class="cmo-rt-metric-col">Mediana</th>
              <th class="cmo-rt-metric-col">Media</th>
              <th class="cmo-rt-metric-col">Q3</th>
              <th class="cmo-rt-metric-col">Máx</th>
              <th class="cmo-rt-metric-col">IQR</th>
              <th class="cmo-rt-metric-col">CV%</th>
            </tr>
          </thead>
          <tbody>
            ${stats.map(s => {
              const {bg,fg} = cvBg(s.cv);
              const cvLabel = s.cv < 15 ? 'Homog.' : s.cv < 35 ? 'Moder.' : 'Heter.';
              return `<tr>
                <td class="cmo-rt-obj-label"><span style="font-size:11px;">${esc(s.label)}</span></td>
                <td class="cmo-rt-val-cell" style="color:#718096;">${s.n}</td>
                <td class="cmo-rt-val-cell">${s.mn.toFixed(3)}</td>
                <td class="cmo-rt-val-cell">${s.q1.toFixed(3)}</td>
                <td class="cmo-rt-val-cell" style="font-weight:700;">${s.q2.toFixed(3)}</td>
                <td class="cmo-rt-val-cell">${s.mean.toFixed(3)}</td>
                <td class="cmo-rt-val-cell">${s.q3.toFixed(3)}</td>
                <td class="cmo-rt-val-cell">${s.mx.toFixed(3)}</td>
                <td class="cmo-rt-val-cell">${s.iqr.toFixed(3)}</td>
                <td class="cmo-rt-val-cell" style="background:${bg};font-weight:700;color:${fg};" title="${cvLabel}">${s.cv.toFixed(1)}%</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:6px;font-size:10px;color:#a0aec0;display:flex;gap:14px;flex-wrap:wrap;">
        <span style="color:#276749;font-weight:600;">● CV&lt;15% Homogéneo</span>
        <span style="color:#744210;font-weight:600;">● 15–35% Moderado</span>
        <span style="color:#9b2c2c;font-weight:600;">● &gt;35% Heterogéneo</span>
      </div>`;

    // ── Inyectar HTML ────────────────────────────────────────────────────────
    const contenido = document.getElementById('cmoDispersionContenido');
    contenido.innerHTML =
      insightDispHtml +
      legendBarHtml +
      `<div style="overflow-x:auto;"><div class="cmo-canvas-zoom-wrap" style="position:relative;display:inline-block;min-width:min-content;"><canvas id="cmoDispCanvas" width="${W}" height="${H}" style="display:block;margin:0 auto;cursor:crosshair;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.07);"></canvas></div></div>` +
      statsTableHtml +
      splomHtml +
      `<div class="cmo-btn-row" style="margin-top:12px;">
        <button class="cmo-btn cmo-btn-success" id="cmoExportarDispersionCSV">Exportar resumen dispersión CSV</button>
      </div>`;

    // ── Dibujar el canvas ────────────────────────────────────────────────────
    const canvas = document.getElementById('cmoDispCanvas');
    const ctx    = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const toY = nv => PAD_T + PLOT_H - nv * PLOT_H;

    // Fondo área de plot
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(PAD_L, PAD_T, W - PAD_L - PAD_R, PLOT_H);

    // Grid horizontal (0 % … 100 %)
    for (let lvl = 0; lvl <= 4; lvl++) {
      const y = toY(lvl / 4);
      ctx.strokeStyle = lvl === 4 ? '#cbd5e0' : '#e2e8f0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
      ctx.fillStyle = '#a0aec0'; ctx.font = '9px system-ui,sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(`${lvl * 25}%`, PAD_L - 5, y + 3);
    }

    // Ejes
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD_L, PAD_T); ctx.lineTo(PAD_L, PAD_T + PLOT_H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD_L, PAD_T + PLOT_H); ctx.lineTo(W - PAD_R, PAD_T + PLOT_H); ctx.stroke();

    // Eje Y label
    ctx.save();
    ctx.translate(13, PAD_T + PLOT_H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#718096'; ctx.font = '9px system-ui,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Valor normalizado [min–max]', 0, 0);
    ctx.restore();

    // Título
    ctx.fillStyle = '#2d3748'; ctx.font = 'bold 11px system-ui,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Box plot + valores individuales (normalizados por métrica)', W / 2, PAD_T - 22);

    // Mini-leyenda de elementos del box plot (cabecera del canvas)
    {
      const lx = PAD_L + 4, ly = 10;
      ctx.fillStyle = 'rgba(99,179,237,0.3)'; ctx.strokeStyle = '#63b3ed'; ctx.lineWidth = 1.5;
      ctx.fillRect(lx, ly, 14, 9); ctx.strokeRect(lx, ly, 14, 9);
      ctx.strokeStyle = '#e53e3e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(lx, ly + 4.5); ctx.lineTo(lx + 14, ly + 4.5); ctx.stroke();
      ctx.fillStyle = '#4a5568'; ctx.font = '9px system-ui,sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('IQR (Q1–Q3)  ·  ─── Mediana', lx + 17, ly + 8);
      ctx.strokeStyle = '#63b3ed'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(lx + 196, ly + 4.5); ctx.lineTo(lx + 210, ly + 4.5); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillText('Bigotes ×1.5IQR', lx + 213, ly + 8);
      ctx.beginPath(); ctx.arc(lx + 310, ly + 4.5, 4, 0, 2 * Math.PI);
      ctx.fillStyle = '#e53e3e'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#4a5568'; ctx.fillText('Outlier', lx + 317, ly + 8);
      ctx.beginPath(); ctx.arc(lx + 368, ly + 4.5, 4, 0, 2 * Math.PI);
      ctx.fillStyle = PALETA[0].stroke; ctx.fill();
      ctx.fillStyle = '#4a5568'; ctx.fillText('Valor individual', lx + 375, ly + 8);
    }

    // ── Hit areas para tooltip ───────────────────────────────────────────────
    const _hitAreas = [];

    // ── Box plots ────────────────────────────────────────────────────────────
    for (let ci = 0; ci < stats.length; ci++) {
      const s     = stats[ci];
      const colX  = PAD_L + ci * COL_W + COL_W / 2;
      const range = s.mx - s.mn || 1;
      const normV = v => (v - s.mn) / range;

      // Separador vertical
      if (ci > 0) {
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(PAD_L + ci * COL_W, PAD_T); ctx.lineTo(PAD_L + ci * COL_W, PAD_T + PLOT_H); ctx.stroke();
      }

      const BOX_W = Math.min(42, COL_W * 0.46);
      const yQ1   = toY(normV(s.q1));
      const yQ3   = toY(normV(s.q3));
      const yWLo  = toY(normV(s.wLo));
      const yWHi  = toY(normV(s.wHi));
      const yMed  = toY(normV(s.q2));

      // Bigote (línea punteada)
      ctx.strokeStyle = '#63b3ed'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.moveTo(colX, yWHi); ctx.lineTo(colX, yWLo); ctx.stroke();
      ctx.setLineDash([]);

      // Tapas de bigote
      ctx.strokeStyle = '#63b3ed'; ctx.lineWidth = 1.5;
      [yWHi, yWLo].forEach(yy => {
        ctx.beginPath(); ctx.moveTo(colX - BOX_W * 0.3, yy); ctx.lineTo(colX + BOX_W * 0.3, yy); ctx.stroke();
      });

      // Caja IQR
      ctx.fillStyle = 'rgba(99,179,237,0.22)'; ctx.strokeStyle = '#63b3ed'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.rect(colX - BOX_W / 2, yQ3, BOX_W, yQ1 - yQ3); ctx.fill(); ctx.stroke();

      // Mediana
      ctx.strokeStyle = '#e53e3e'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(colX - BOX_W / 2, yMed); ctx.lineTo(colX + BOX_W / 2, yMed); ctx.stroke();

      // Anotación mediana
      if (COL_W >= 80) {
        ctx.fillStyle = '#c53030'; ctx.font = 'bold 8px system-ui,sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(s.q2.toFixed(2), colX + BOX_W / 2 + 3, yMed + 3);
      }

      // Puntos individuales con jitter
      const nP = s.pairs.length;
      for (const p of s.pairs) {
        const nv    = normV(p.v);
        const yDot  = toY(nv);
        const isOut = p.v < s.wLo || p.v > s.wHi;
        const jitter = nP > 1 ? (p.oi - (nP - 1) / 2) * Math.min(10, 30 / nP) : 0;
        const col   = PALETA[p.oi % PALETA.length];
        const r     = isOut ? 5.5 : 4.5;
        ctx.beginPath();
        ctx.arc(colX + jitter, yDot, r, 0, 2 * Math.PI);
        ctx.fillStyle = isOut ? '#e53e3e' : col.stroke;
        ctx.globalAlpha = isOut ? 1 : 0.82;
        ctx.fill();
        ctx.globalAlpha = 1;
        if (isOut) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
        _hitAreas.push({ x: colX + jitter, y: yDot, r: r + 4, label: s.label, obj: objs[p.oi].nombre, val: p.v, isOut });
      }

      // Etiqueta X (2 líneas, centrada)
      const words  = s.label.split(' ');
      const lines  = [];
      let line = '';
      for (const w of words) {
        if ((line + ' ' + w).trim().length <= 14) { line = (line + ' ' + w).trim(); }
        else { if (line) lines.push(line); line = w; }
      }
      if (line) lines.push(line);
      const lns = lines.slice(0, 2);
      const ly0 = PAD_T + PLOT_H + 14;
      ctx.fillStyle = '#4a5568'; ctx.font = '9.5px system-ui,sans-serif'; ctx.textAlign = 'center';
      lns.forEach((ln, li) => ctx.fillText(ln, colX, ly0 + li * 13));

      // Badge CV bajo box
      const cvColor = s.cv < 15 ? '#276749' : s.cv < 35 ? '#744210' : '#9b2c2c';
      const cvBgC   = s.cv < 15 ? 'rgba(72,187,120,.18)' : s.cv < 35 ? 'rgba(237,137,54,.18)' : 'rgba(245,101,101,.18)';
      const cvText  = `CV ${s.cv.toFixed(0)}%`;
      ctx.font = 'bold 8.5px system-ui,sans-serif';
      const cvW = ctx.measureText(cvText).width + 8;
      const cvY = ly0 + lns.length * 13 + 3;
      ctx.fillStyle = cvBgC;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(colX - cvW / 2, cvY, cvW, 14, 4);
      else ctx.rect(colX - cvW / 2, cvY, cvW, 14);
      ctx.fill();
      ctx.fillStyle = cvColor;
      ctx.textAlign = 'center';
      ctx.fillText(cvText, colX, cvY + 10);
    }

    // ── Tooltip (body-level, asignado no apilado) ────────────────────────────
    let _ttDisp = document.getElementById('cmoDispTooltipBody');
    if (!_ttDisp) {
      _ttDisp = document.createElement('div');
      _ttDisp.id = 'cmoDispTooltipBody';
      _ttDisp.className = 'cmo-overlay';
      _ttDisp.style.cssText = 'display:none;position:fixed;background:rgba(26,32,44,0.95);color:#fff;font-size:11px;padding:7px 11px;border-radius:7px;pointer-events:none;z-index:9999;line-height:1.7;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.25);';
      document.body.appendChild(_ttDisp);
    }
    canvas.onmousemove = e => {
      const rect   = canvas.getBoundingClientRect();
      const scaleX = W / rect.width, scaleY = H / rect.height;
      const cx2    = (e.clientX - rect.left) * scaleX;
      const cy2    = (e.clientY - rect.top)  * scaleY;
      const hit    = _hitAreas.find(h => Math.hypot(cx2 - h.x, cy2 - h.y) <= h.r);
      if (hit) {
        _ttDisp.innerHTML = `<b>${esc(hit.label)}</b><br>${esc(hit.obj)}: <b>${hit.val.toFixed(4)}</b>${hit.isOut ? ' &nbsp;<span style="color:#fc8181;">⚠ outlier</span>' : ''}`;
        _ttDisp.style.display = 'block';
        _ttDisp.style.left = (e.clientX + 16) + 'px';
        _ttDisp.style.top  = (e.clientY - 14) + 'px';
        canvas.style.cursor = 'crosshair';
      } else {
        _ttDisp.style.display = 'none';
        canvas.style.cursor = 'default';
      }
    };
    canvas.onmouseleave = () => { _ttDisp.style.display = 'none'; };
    // Limpiar zoom anterior si existe, luego adjuntar zoom + pan
    if (window.detachCanvasZoom) window.detachCanvasZoom(canvas);
    if (window.attachCanvasZoom) window.attachCanvasZoom(canvas);
    // Botón PNG
    const _dispWrap = canvas.closest('.cmo-canvas-zoom-wrap') || canvas.parentElement;
    if (_dispWrap && !_dispWrap.querySelector('.cmo-export-png-btn')) {
      const _btn = document.createElement('button');
      _btn.className = 'cmo-export-png-btn';
      _btn.title = 'Guardar dispersión como imagen PNG';
      _btn.textContent = '📸 PNG';
      _btn.addEventListener('click', () => {
        _guardarPNGDesdeCanvas(canvas, 'dispersion', 'grafico_dispersion');
      });
      _dispWrap.appendChild(_btn);
    }
    const _dispCSVBtn = document.getElementById('cmoExportarDispersionCSV');
    if (_dispCSVBtn) {
      _dispCSVBtn.onclick = () => _exportTableElementToCSV(
        contenido.querySelector('.cmo-radar-table'),
        'dispersion',
        'tabla_resumen_dispersion'
      );
    }

    // ── Dibujar SPLOM mini-canvases ──────────────────────────────────────────
    function _drawMiniScat(sp2, pi2) {
      const mc = document.getElementById('cmoDispSP_' + pi2);
      if (!mc) return;
      const mCtx = mc.getContext('2d');
      const MW = _SP_W, MH = _SP_H;
      const MPL = 5, MPR = 5, MPT = 5, MPB = 5;
      const MPW = MW - MPL - MPR, MPH = MH - MPT - MPB;
      mCtx.clearRect(0, 0, MW, MH);
      mCtx.fillStyle = '#fff'; mCtx.fillRect(0, 0, MW, MH);
      const pts3 = objs.map((o,oi) => ({
        x: getValor(o, sp2.ki), y: getValor(o, sp2.kj),
        oi, stroke: PALETA[oi % PALETA.length].stroke,
        name: o.nombre || ('Obj ' + (oi+1))
      })).filter(p => typeof p.x==='number'&&isFinite(p.x)&&typeof p.y==='number'&&isFinite(p.y));
      if (pts3.length < 2) { mCtx.fillStyle='#a0aec0'; mCtx.font='9px system-ui,sans-serif'; mCtx.textAlign='center'; mCtx.fillText('Sin datos', MW/2, MH/2); return; }
      const xVals3 = pts3.map(p=>p.x), yVals3 = pts3.map(p=>p.y);
      const xMin3 = Math.min(...xVals3), xMax3 = Math.max(...xVals3);
      const yMin3 = Math.min(...yVals3), yMax3 = Math.max(...yVals3);
      const xPad3 = (xMax3-xMin3)*0.14||1, yPad3 = (yMax3-yMin3)*0.14||1;
      const xL3 = xMin3-xPad3, xR3 = xMax3+xPad3;
      const yB3 = yMin3-yPad3, yT3 = yMax3+yPad3;
      const tx3 = v => MPL + (v-xL3)/(xR3-xL3)*MPW;
      const ty3 = v => MPT + MPH - (v-yB3)/(yT3-yB3)*MPH;
      // Grid
      mCtx.strokeStyle = '#f0f4f8'; mCtx.lineWidth = 1;
      for (let g=0;g<=3;g++) {
        mCtx.beginPath(); mCtx.moveTo(tx3(xL3+g*(xR3-xL3)/3), MPT); mCtx.lineTo(tx3(xL3+g*(xR3-xL3)/3), MPT+MPH); mCtx.stroke();
        mCtx.beginPath(); mCtx.moveTo(MPL, ty3(yB3+g*(yT3-yB3)/3)); mCtx.lineTo(MPL+MPW, ty3(yB3+g*(yT3-yB3)/3)); mCtx.stroke();
      }
      // Regresión
      const mx3b = pts3.reduce((s,p)=>s+p.x,0)/pts3.length;
      const my3b = pts3.reduce((s,p)=>s+p.y,0)/pts3.length;
      const ssxy3= pts3.reduce((s,p)=>s+(p.x-mx3b)*(p.y-my3b),0);
      const ssx3 = pts3.reduce((s,p)=>s+(p.x-mx3b)**2,0);
      if (ssx3 > 0) {
        const sl3 = ssxy3/ssx3, in3 = my3b - sl3*mx3b;
        const rV3 = sp2.r??0;
        mCtx.beginPath();
        mCtx.moveTo(tx3(xL3), ty3(sl3*xL3+in3));
        mCtx.lineTo(tx3(xR3), ty3(sl3*xR3+in3));
        mCtx.strokeStyle = rV3>0 ? 'rgba(56,161,105,0.55)' : 'rgba(229,62,62,0.55)';
        mCtx.lineWidth = 1.5; mCtx.setLineDash([4,2]); mCtx.stroke(); mCtx.setLineDash([]);
      }
      // Puntos
      pts3.forEach(p => {
        mCtx.beginPath(); mCtx.arc(tx3(p.x), ty3(p.y), 4.5, 0, 2*Math.PI);
        mCtx.fillStyle  = p.stroke + '25'; mCtx.fill();
        mCtx.strokeStyle = p.stroke; mCtx.lineWidth = 1.5; mCtx.stroke();
      });
      // Nombres si pocos puntos
      if (pts3.length <= 6) {
        mCtx.font = '7.5px system-ui,sans-serif';
        pts3.forEach(p => {
          mCtx.fillStyle = p.stroke;
          mCtx.textAlign = 'left';
          mCtx.fillText(String(p.name).substring(0,14), Math.min(tx3(p.x)+6, MW-5), Math.max(ty3(p.y)-4, 10));
        });
      }
    }

    // Dibujar todos los minis
    _splomPairs.forEach((sp2, pi2) => _drawMiniScat(sp2, pi2));

    // ── Función para mostrar scatter expandido ───────────────────────────────
    function _showFullScat(sp3) {
      const la3 = sp3.li, lb3 = sp3.lj;
      const rRaw3 = sp3.r ?? 0;
      const absR3 = Math.abs(rRaw3);
      const rColor3 = rRaw3 > 0 ? '#276749' : '#c53030';
      const rBg3    = rRaw3 > 0 ? 'rgba(56,161,105,0.18)' : 'rgba(229,62,62,0.18)';
      const itp3 = absR3>=0.8?'Muy fuerte':absR3>=0.6?'Fuerte':absR3>=0.4?'Moderada':'Débil';
      const ptsFull = objs.map((o,oi) => ({
        x: getValor(o, sp3.ki), y: getValor(o, sp3.kj),
        name: o.nombre || ('Obj '+(oi+1)), stroke: PALETA[oi%PALETA.length].stroke, oi
      })).filter(p => typeof p.x==='number'&&isFinite(p.x)&&typeof p.y==='number'&&isFinite(p.y));
      if (!ptsFull.length) return;
      const n3   = ptsFull.length;
      const mx4b = ptsFull.reduce((s,p)=>s+p.x,0)/n3;
      const my4b = ptsFull.reduce((s,p)=>s+p.y,0)/n3;
      const ssxy4= ptsFull.reduce((s,p)=>s+(p.x-mx4b)*(p.y-my4b),0);
      const ssx4 = ptsFull.reduce((s,p)=>s+(p.x-mx4b)**2,0);
      const sl4  = ssx4===0?0:ssxy4/ssx4;
      const in4  = my4b - sl4*mx4b;
      const sse4 = ptsFull.reduce((s,p)=>s+(p.y-(sl4*p.x+in4))**2,0);
      const se4  = n3>2?Math.sqrt(sse4/(n3-2)):0;
      const r2v  = rRaw3*rRaw3;
      const signStr4 = in4>=0?`+ ${in4.toFixed(4)}`:`− ${Math.abs(in4).toFixed(4)}`;

      // ── Crear/reusar modal ───────────────────────────────────────────────
      let modal3 = document.getElementById('cmoDispScatModal');
      if (!modal3) {
        modal3 = document.createElement('div');
        modal3.id = 'cmoDispScatModal';
        modal3.className = 'cmo-overlay';
        modal3.style.cssText = 'display:none;position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.52);backdrop-filter:blur(3px);align-items:center;justify-content:center;';
        modal3.innerHTML = `
          <div id="cmoDispScatModalBox" style="background:#fff;border-radius:18px;width:90vw;max-width:90vw;height:90vh;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 32px 80px rgba(0,0,0,.38);overflow:hidden;">
            <div id="cmoDispScatModalHdr" style="padding:14px 22px;border-bottom:2px solid #e2e8f0;display:flex;align-items:center;gap:12px;flex-shrink:0;background:linear-gradient(135deg,#f0fff4 0%,#fafbfc 100%);">
              <div style="width:5px;height:28px;border-radius:3px;background:linear-gradient(180deg,#38a169,#276749);flex-shrink:0;"></div>
              <div id="cmoDispScatModalTitle" style="font-size:16px;font-weight:800;color:#1a202c;flex:1;"></div>
              <div id="cmoDispScatModalR" style="border-radius:7px;padding:5px 16px;font-size:14px;font-weight:800;"></div>
              <div id="cmoDispScatModalR2" style="border-radius:7px;padding:5px 14px;font-size:12px;font-weight:700;background:#f7fafc;border:1px solid #e2e8f0;color:#4a5568;"></div>
              <div id="cmoDispScatModalItp" style="font-size:12px;color:#718096;font-weight:600;"></div>
              <button id="cmoDispScatModalClose" style="padding:6px 16px;background:#e2e8f0;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-weight:700;line-height:1;color:#4a5568;">✕</button>
            </div>
            <div style="flex:1;display:flex;overflow:hidden;min-height:0;">
              <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;padding:18px 16px 16px 20px;gap:12px;min-width:0;">
                <canvas id="cmoDispScatModalCanvas" width="900" height="520" style="display:block;border-radius:10px;border:1px solid #e2e8f0;flex:1;min-height:0;width:100%;box-shadow:0 2px 8px rgba(0,0,0,.06);"></canvas>
                <div style="font-size:10px;color:#718096;display:flex;gap:16px;flex-wrap:wrap;flex-shrink:0;padding:6px 10px;background:#f7fafc;border-radius:7px;border:1px solid #e8edf2;align-items:center;">
                  <span>--- Línea discontinua = regresión OLS</span>
                  <span>Banda sombreada = ±1 SE</span>
                  <span>● Puntos coloreados por objeto (hover para detalle)</span>
                  <span style="font-style:italic;font-weight:700;color:#276749;">ŷ = ${sl4.toFixed(4)}x ${signStr4}</span>
                </div>
              </div>
              <div id="cmoDispScatModalSide" style="width:320px;flex-shrink:0;overflow-y:auto;border-left:2px solid #e8edf2;padding:16px 15px;background:#f8fafc;font-size:12px;"></div>
            </div>
          </div>`;
        document.body.appendChild(modal3);
        document.getElementById('cmoDispScatModalClose').onclick = () => { modal3.style.display='none'; };
        modal3.onclick = e => { if(e.target===modal3) modal3.style.display='none'; };
        document.addEventListener('keydown', e => { if(e.key==='Escape'&&modal3.style.display==='flex') modal3.style.display='none'; });
      }

      // ── Cabecera ─────────────────────────────────────────────────────────
      document.getElementById('cmoDispScatModalTitle').textContent = `${la3}   ×   ${lb3}`;
      const rEl3 = document.getElementById('cmoDispScatModalR');
      rEl3.textContent = `r = ${rRaw3.toFixed(4)}`; rEl3.style.background=rBg3; rEl3.style.color=rColor3;
      document.getElementById('cmoDispScatModalR2').textContent = `R² = ${r2v.toFixed(4)}`;
      document.getElementById('cmoDispScatModalItp').textContent = `${itp3} ${rRaw3>=0?'positiva':'negativa'}`;
      // Actualizar ecuación en leyenda (el elemento ya renderizado)
      const eqEl3 = modal3.querySelector('span[style*="italic"]');
      if (eqEl3) eqEl3.textContent = `ŷ = ${sl4.toFixed(4)}x ${signStr4}`;

      // ── Panel lateral: estadísticos del par + tabla de valores ────────────
      const xValsAll = ptsFull.map(p=>p.x), yValsAll = ptsFull.map(p=>p.y);
      const xMin3s = Math.min(...xValsAll), xMax3s = Math.max(...xValsAll);
      const yMin3s = Math.min(...yValsAll), yMax3s = Math.max(...yValsAll);
      const xStd3  = Math.sqrt(xValsAll.reduce((s,v)=>s+(v-mx4b)**2,0)/n3);
      const yStd3  = Math.sqrt(yValsAll.reduce((s,v)=>s+(v-my4b)**2,0)/n3);
      const statRows3 = [
        ['n (pares)',       n3],
        ['r de Pearson',    rRaw3.toFixed(6)],
        ['R²',              r2v.toFixed(6)],
        ['Interpretación',  `${itp3} ${rRaw3>=0?'(+)':'(-)'}` ],
        ['Pendiente (a)',    sl4.toFixed(6)],
        ['Intercepto (b)',   in4.toFixed(6)],
        ['SE regresión',    se4.toFixed(6)],
        ['Media X',         mx4b.toFixed(6)],
        ['Desv.est. X',     xStd3.toFixed(6)],
        ['Rango X',         `${xMin3s.toFixed(4)} – ${xMax3s.toFixed(4)}`],
        ['Media Y',         my4b.toFixed(6)],
        ['Desv.est. Y',     yStd3.toFixed(6)],
        ['Rango Y',         `${yMin3s.toFixed(4)} – ${yMax3s.toFixed(4)}`],
      ];
      const valsHtml3 = ptsFull.map(p => {
        const res = (p.y - (sl4*p.x+in4));
        return `<div style="display:flex;align-items:center;gap:5px;padding:3px 0;border-bottom:1px solid #f0f4f8;">
          <span style="width:8px;height:8px;border-radius:50%;background:${p.stroke};flex-shrink:0;display:inline-block;"></span>
          <span style="font-size:9.5px;color:#4a5568;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(p.name)}">${esc(p.name)}</span>
          <span style="font-size:9.5px;font-weight:700;color:#2d3748;white-space:nowrap;">${p.x.toFixed(4)}</span>
          <span style="font-size:9px;color:#a0aec0;">·</span>
          <span style="font-size:9.5px;font-weight:700;color:#2d3748;white-space:nowrap;">${p.y.toFixed(4)}</span>
          <span style="font-size:8.5px;color:${res>=0?'#276749':'#c53030'};white-space:nowrap;">ε=${res.toFixed(3)}</span>
        </div>`;
      }).join('');
      document.getElementById('cmoDispScatModalSide').innerHTML = `
        <div style="font-size:10.5px;font-weight:800;color:#276749;margin-bottom:9px;text-transform:uppercase;letter-spacing:0.5px;">Estadísticos del par</div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
          ${statRows3.map(([lbl,val],ri) => `<tr style="background:${ri%2===0?'#fff':'#f0f4f8'};">
            <td style="padding:3.5px 5px;font-size:10px;color:#718096;">${lbl}</td>
            <td style="padding:3.5px 5px;font-size:10.5px;font-weight:700;color:#2d3748;text-align:right;font-variant-numeric:tabular-nums;">${val}</td>
          </tr>`).join('')}
        </table>
        <div style="border-top:1px solid #e2e8f0;padding-top:10px;">
          <div style="font-size:10.5px;font-weight:800;color:#276749;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Pares de valores  <span style="font-weight:400;color:#a0aec0;">(X · Y · ε residuo)</span></div>
          ${valsHtml3}
        </div>`;

      // ── Dibujar canvas ────────────────────────────────────────────────────
      const mc3 = document.getElementById('cmoDispScatModalCanvas');
      const mCtx3 = mc3.getContext('2d');
      // Adaptar resolución del canvas a su tamaño CSS real
      const mc3Rect = mc3.getBoundingClientRect();
      if (mc3Rect.width > 0) { mc3.width = Math.round(mc3Rect.width); mc3.height = Math.round(mc3Rect.height); }
      const MW3=mc3.width, MH3=mc3.height;
      const MP3={t:44,b:55,l:70,r:22};
      const MPW3=MW3-MP3.l-MP3.r, MPH3=MH3-MP3.t-MP3.b;
      mCtx3.clearRect(0,0,MW3,MH3);
      mCtx3.fillStyle='#fafbfc'; mCtx3.fillRect(0,0,MW3,MH3);
      mCtx3.fillStyle='#fff';    mCtx3.fillRect(MP3.l,MP3.t,MPW3,MPH3);
      const xP3b=(xMax3s-xMin3s)*0.12||1, yP3b=(yMax3s-yMin3s)*0.12||1;
      const xL3b=xMin3s-xP3b, xR3b=xMax3s+xP3b, yB3b=yMin3s-yP3b, yT3b=yMax3s+yP3b;
      const tx3b=v=>MP3.l+(v-xL3b)/(xR3b-xL3b)*MPW3;
      const ty3b=v=>MP3.t+MPH3-(v-yB3b)/(yT3b-yB3b)*MPH3;
      const fmt3b=v=>Math.abs(v)>=100000?v.toExponential(1):Math.abs(v)>=100?v.toFixed(1):v.toFixed(3);
      // Grid
      mCtx3.strokeStyle='#e8edf2'; mCtx3.lineWidth=1;
      for(let t=0;t<=5;t++){
        mCtx3.beginPath();mCtx3.moveTo(tx3b(xL3b+t*(xR3b-xL3b)/5),MP3.t);mCtx3.lineTo(tx3b(xL3b+t*(xR3b-xL3b)/5),MP3.t+MPH3);mCtx3.stroke();
        mCtx3.beginPath();mCtx3.moveTo(MP3.l,ty3b(yB3b+t*(yT3b-yB3b)/5));mCtx3.lineTo(MP3.l+MPW3,ty3b(yB3b+t*(yT3b-yB3b)/5));mCtx3.stroke();
      }
      // Banda ±1SE
      if(ssx4>0){
        mCtx3.beginPath();
        mCtx3.moveTo(tx3b(xL3b),ty3b(sl4*xL3b+in4+se4));mCtx3.lineTo(tx3b(xR3b),ty3b(sl4*xR3b+in4+se4));
        mCtx3.lineTo(tx3b(xR3b),ty3b(sl4*xR3b+in4-se4));mCtx3.lineTo(tx3b(xL3b),ty3b(sl4*xL3b+in4-se4));mCtx3.closePath();
        mCtx3.fillStyle=rRaw3>0?'rgba(56,161,105,0.08)':'rgba(229,62,62,0.08)';mCtx3.fill();
        mCtx3.beginPath();mCtx3.moveTo(tx3b(xL3b),ty3b(sl4*xL3b+in4));mCtx3.lineTo(tx3b(xR3b),ty3b(sl4*xR3b+in4));
        mCtx3.strokeStyle=rRaw3>0?'#38a169':'#e53e3e';mCtx3.lineWidth=2;mCtx3.setLineDash([7,3]);mCtx3.stroke();mCtx3.setLineDash([]);
      }
      // Puntos + etiquetas
      ptsFull.forEach(p=>{
        mCtx3.beginPath();mCtx3.arc(tx3b(p.x),ty3b(p.y),6.5,0,2*Math.PI);
        mCtx3.fillStyle=p.stroke+'28';mCtx3.fill();
        mCtx3.strokeStyle=p.stroke;mCtx3.lineWidth=2;mCtx3.stroke();
      });
      mCtx3.font='9px system-ui,sans-serif';
      ptsFull.forEach(p=>{
        mCtx3.fillStyle=p.stroke;mCtx3.textAlign='left';
        mCtx3.fillText(p.name, Math.min(tx3b(p.x)+9,MW3-5), Math.max(ty3b(p.y)-7,12));
      });
      // Ejes
      mCtx3.strokeStyle='#cbd5e0';mCtx3.lineWidth=1.5;
      mCtx3.beginPath();mCtx3.moveTo(MP3.l,MP3.t);mCtx3.lineTo(MP3.l,MP3.t+MPH3);mCtx3.stroke();
      mCtx3.beginPath();mCtx3.moveTo(MP3.l,MP3.t+MPH3);mCtx3.lineTo(MP3.l+MPW3,MP3.t+MPH3);mCtx3.stroke();
      // Tick labels
      mCtx3.fillStyle='#718096';mCtx3.font='9.5px system-ui,sans-serif';
      for(let t=0;t<=5;t++){
        mCtx3.textAlign='center';mCtx3.fillText(fmt3b(xL3b+t*(xR3b-xL3b)/5),tx3b(xL3b+t*(xR3b-xL3b)/5),MP3.t+MPH3+15);
        mCtx3.textAlign='right'; mCtx3.fillText(fmt3b(yB3b+t*(yT3b-yB3b)/5),MP3.l-6,ty3b(yB3b+t*(yT3b-yB3b)/5)+4);
      }
      // Labels ejes
      mCtx3.fillStyle='#4a5568';mCtx3.font='bold 10px system-ui,sans-serif';
      mCtx3.textAlign='center';mCtx3.fillText(la3, MP3.l+MPW3/2, MH3-8);
      mCtx3.save();mCtx3.translate(14,MP3.t+MPH3/2);mCtx3.rotate(-Math.PI/2);
      mCtx3.textAlign='center';mCtx3.fillText(lb3,0,0);mCtx3.restore();
      // Tooltip
      let _ttSM=document.getElementById('cmoDispScatModalTT');
      if(!_ttSM){_ttSM=document.createElement('div');_ttSM.id='cmoDispScatModalTT';_ttSM.className='cmo-overlay';_ttSM.style.cssText='display:none;position:fixed;background:rgba(26,32,44,0.95);color:#fff;font-size:11px;padding:6px 10px;border-radius:7px;pointer-events:none;z-index:10100;line-height:1.6;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.2);';document.body.appendChild(_ttSM);}
      mc3.onmousemove=e=>{
        const r5=mc3.getBoundingClientRect();
        const mx5=(e.clientX-r5.left)*(MW3/r5.width),my5=(e.clientY-r5.top)*(MH3/r5.height);
        let hit5=null,dMin5=14;
        ptsFull.forEach(p=>{const d=Math.hypot(tx3b(p.x)-mx5,ty3b(p.y)-my5);if(d<dMin5){dMin5=d;hit5=p;}});
        if(!hit5){_ttSM.style.display='none';return;}
        const res5=hit5.y-(sl4*hit5.x+in4);
        _ttSM.innerHTML=`<b>${esc(hit5.name)}</b><br>${esc(la3)}: <b>${hit5.x.toFixed(5)}</b><br>${esc(lb3)}: <b>${hit5.y.toFixed(5)}</b><br>ε residuo: <span style="color:${res5>=0?'#68d391':'#fc8181'};">${res5.toFixed(5)}</span>`;
        _ttSM.style.display='block';_ttSM.style.left=(e.clientX+16)+'px';_ttSM.style.top=(e.clientY-14)+'px';
      };
      mc3.onmouseleave=()=>{_ttSM.style.display='none';};

      // ── Mostrar modal con animación ───────────────────────────────────────
      modal3.style.display='flex';
      const box3=document.getElementById('cmoDispScatModalBox');
      box3.style.opacity='0';box3.style.transform='scale(0.93)';box3.style.transition='opacity .22s,transform .22s';
      requestAnimationFrame(()=>{box3.style.opacity='1';box3.style.transform='scale(1)';});
    }

    // ── Eventos: cards SPLOM + heatmap clic → scatter expandido ──────────────
    const _grid = document.getElementById('cmoDispSplomGrid');
    if (_grid) {
      _grid.querySelectorAll('.cmo-disp-splom-card').forEach(card => {
        card.onmouseenter = () => { card.style.boxShadow = '0 4px 14px rgba(0,0,0,.13)'; card.style.borderColor='#bee3f8'; };
        card.onmouseleave = () => { card.style.boxShadow = '0 1px 5px rgba(0,0,0,.06)'; card.style.borderColor='#e2e8f0'; };
        card.onclick = () => {
          const ii=+card.dataset.spi, jj=+card.dataset.spj;
          const sp5 = _splomPairs.find(p=>p.i===ii&&p.j===jj);
          if (sp5) _showFullScat(sp5);
          // Highlight card seleccionada
          _grid.querySelectorAll('.cmo-disp-splom-card').forEach(c=>c.style.outline='');
          card.style.outline = '2.5px solid #2b6cb0';
        };
      });
    }
    // Heatmap clic (delegación)
    const _heatTbl = contenido.querySelector('table');
    if (_heatTbl) {
      _heatTbl.onclick = e => {
        const td = e.target.closest('td[data-spi]');
        if (!td) return;
        const ii=+td.dataset.spi, jj=+td.dataset.spj;
        const sp5 = _splomPairs.find(p=>(p.i===ii&&p.j===jj)||(p.i===jj&&p.j===ii));
        if (sp5) _showFullScat(sp5);
      };
    }
  }
  function renderCorrelacion(objs, keys) {
    const tabBtn = document.querySelector('.cmo-tab-btn[data-tab="correlacion"]');
    const numKeys = keys.filter(k => {
      const vals = objs.map(o => getValor(o, k)).filter(v => typeof v === 'number' && isFinite(v));
      return vals.length >= 3;
    });
    if (numKeys.length < 2) {
      if (tabBtn) { tabBtn.style.opacity = '0.4'; tabBtn.disabled = true; }
      return;
    }
    if (tabBtn) { tabBtn.style.opacity = ''; tabBtn.disabled = false; }

    // ── Pearson ──────────────────────────────────────────────────────────────
    const pearson = (ka, kb) => {
      const pairs = objs.map(o => ({ a: getValor(o, ka), b: getValor(o, kb) }))
        .filter(p => typeof p.a === 'number' && isFinite(p.a) && typeof p.b === 'number' && isFinite(p.b));
      if (pairs.length < 3) return null;
      const n = pairs.length;
      const ma = pairs.reduce((s, p) => s + p.a, 0) / n;
      const mb = pairs.reduce((s, p) => s + p.b, 0) / n;
      const num = pairs.reduce((s, p) => s + (p.a - ma) * (p.b - mb), 0);
      const da  = Math.sqrt(pairs.reduce((s, p) => s + (p.a - ma) ** 2, 0));
      const db  = Math.sqrt(pairs.reduce((s, p) => s + (p.b - mb) ** 2, 0));
      return da === 0 || db === 0 ? null : num / (da * db);
    };

    const n      = numKeys.length;
    const labels = numKeys.map(k => KEY_LABEL[k] || k);

    // ── Matriz de correlaciones ───────────────────────────────────────────────
    const matriz = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => i === j ? 1 : pearson(numKeys[i], numKeys[j]))
    );

    // ── Top pares (ordenados por |r|) ────────────────────────────────────────
    const allPairs = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const r = matriz[i][j];
        if (r !== null) allPairs.push({ r, i, j, li: labels[i], lj: labels[j] });
      }
    }
    allPairs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    const topPares = allPairs.slice(0, Math.min(8, allPairs.length));

    // ── Dimensiones del canvas ────────────────────────────────────────────────
    const CELL   = Math.max(36, Math.min(60, Math.floor(640 / n)));
    const LBL_W  = 130;
    const LBL_H  = 120;           // espacio para etiquetas de columna
    const CW     = LBL_W + n * CELL + 24;
    const CH     = LBL_H + n * CELL + 24;

    // ── Top-pairs HTML ────────────────────────────────────────────────────────
    let topHtml = '';
    if (topPares.length > 0) {
      const nStrong = allPairs.filter(p => Math.abs(p.r) >= 0.7).length;
      const nMod    = allPairs.filter(p => Math.abs(p.r) >= 0.4 && Math.abs(p.r) < 0.7).length;
      const nWeak   = allPairs.filter(p => Math.abs(p.r) < 0.4).length;
      topHtml = `
        <div class="cmo-insight-bar" style="margin:14px 0 10px;">
          <div class="cmo-insight-card${nStrong > 0 ? ' alert' : ''}">
            <div class="cmo-insight-card-label">Fuertes (|r|≥0.7)</div>
            <div class="cmo-insight-card-val">${nStrong}</div>
          </div>
          <div class="cmo-insight-card warn">
            <div class="cmo-insight-card-label">Moderadas (0.4–0.7)</div>
            <div class="cmo-insight-card-val">${nMod}</div>
          </div>
          <div class="cmo-insight-card info">
            <div class="cmo-insight-card-label">Débiles (&lt;0.4)</div>
            <div class="cmo-insight-card-val">${nWeak}</div>
          </div>
        </div>
        <div class="cmo-radar-side-title" style="margin-bottom:6px;">Correlaciones más fuertes detectadas</div>
        <div class="cmo-top-pairs">
          ${topPares.map(p => {
            const pos  = p.r > 0;
            const clr  = pos ? '#276749' : '#c53030';
            const str  = Math.abs(p.r) >= 0.8 ? 'Muy fuerte' : Math.abs(p.r) >= 0.6 ? 'Fuerte' : Math.abs(p.r) >= 0.4 ? 'Moderada' : 'Débil';
            return `<div class="cmo-pair-row ${pos ? 'pos' : 'neg'}">
              <span class="cmo-pair-r" style="color:${clr};">${p.r.toFixed(2)}</span>
              <div class="cmo-pair-bar"><div class="cmo-pair-bar-fill" style="width:${(Math.abs(p.r)*100).toFixed(1)}%;background:${pos ? '#48bb78' : '#fc8181'};"></div></div>
              <span class="cmo-pair-lbl"><b>${str}</b> · ${esc(p.li)} × ${esc(p.lj)}</span>
            </div>`;
          }).join('')}
        </div>`;
    }

    // ── Tabla de correlaciones (HTML, triángulo superior) ─────────────────────
    const hdrCells = numKeys.map((k, j) => {
      const lbl  = labels[j];
      const words = lbl.split(' ');
      let line = '', lns = [];
      for (const w of words) {
        if ((line + ' ' + w).trim().length <= 13) { line = (line + ' ' + w).trim(); }
        else { if (line) lns.push(line); line = w; }
      }
      if (line) lns.push(line);
      return `<th class="cmo-rt-metric-col" title="${esc(lbl)}" style="vertical-align:bottom;padding:3px 4px;">${lns.slice(0,2).join('<br>')}</th>`;
    }).join('');
    const tblRows = numKeys.map((ki, i) => {
      const lbl  = labels[i];
      const cells = numKeys.map((kj, j) => {
        if (j < i) return `<td class="cmo-rt-val-cell" style="background:#f1f5f9;color:#94a3b8;font-size:10px;">${(matriz[i][j]??'—') === '—' ? '—' : matriz[j][i].toFixed(2)}</td>`;
        if (j === i) return `<td class="cmo-rt-val-cell" style="background:#e2e8f0;font-weight:700;">1.00</td>`;
        const r   = matriz[i][j];
        if (r === null) return `<td class="cmo-rt-val-cell" style="color:#a0aec0;">—</td>`;
        const abs = Math.abs(r);
        const bg  = r > 0
          ? `rgba(72,187,120,${(abs * 0.5).toFixed(2)})`
          : `rgba(252,129,129,${(abs * 0.5).toFixed(2)})`;
        const fw  = abs >= 0.7 ? '800' : '600';
        const clr = abs >= 0.5 ? (r > 0 ? '#276749' : '#c53030') : '#4a5568';
        const brd = abs >= 0.7 ? `border:2px solid ${r > 0 ? '#276749' : '#c53030'};` : '';
        return `<td class="cmo-rt-val-cell" style="background:${bg};font-weight:${fw};color:${clr};${brd}" title="${esc(labels[i])} × ${esc(labels[j])}: r=${r.toFixed(4)}">${r.toFixed(2)}</td>`;
      }).join('');
      return `<tr>
        <td class="cmo-rt-obj-label"><span style="font-size:11px;">${esc(lbl)}</span></td>
        ${cells}
      </tr>`;
    }).join('');

    const correlTableHtml = `
      <div class="cmo-radar-side-title" style="margin:16px 0 6px;">Matriz de correlaciones (r de Pearson)</div>
      <div class="cmo-radar-table-wrap" style="max-height:420px;">
        <table class="cmo-radar-table">
          <thead><tr>
            <th class="cmo-rt-obj-header" style="min-width:140px;">Métrica</th>
            ${hdrCells}
          </tr></thead>
          <tbody>${tblRows}</tbody>
        </table>
      </div>
      <div style="margin-top:7px;font-size:10px;display:flex;gap:14px;flex-wrap:wrap;align-items:center;">
        <span style="color:#276749;font-weight:600;">■ Positiva</span>
        <span style="color:#c53030;font-weight:600;">■ Negativa</span>
        <span style="font-weight:700;color:#4a5568;">Negrita + borde = |r|≥0.7 fuerte</span>
        <span style="color:#94a3b8;">Triángulo inferior = espejo</span>
      </div>`;

    // ── Canvas: heatmap de burbujas (visual) ──────────────────────────────────
    const canvasWrapHtml = `
      <div style="overflow-x:auto;margin-bottom:4px;"><div class="cmo-canvas-zoom-wrap" style="position:relative;display:inline-block;min-width:min-content;">
        <canvas id="cmoCorrCanvas" width="${CW}" height="${CH}" style="display:block;margin:0 auto;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.07);cursor:crosshair;"></canvas>
      </div></div>
      <div style="font-size:10px;color:#718096;display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:2px;">
        <span>Tamaño de burbuja ∝ |r|</span>
        <span style="color:#276749;font-weight:600;">● r&gt;0 positivo</span>
        <span style="color:#c53030;font-weight:600;">● r&lt;0 negativo</span>
        <span style="font-weight:700;">Borde rojo/verde = |r|≥0.7</span>
      </div>`;

    // ── HTML: panel selector de par + contenedor scatter ─────────────────────
    const pairsOpts = numKeys.map((k, i) => `<option value="${i}">${esc(labels[i])}</option>`).join('');
    const pairSelectorHtml = `
      <div id="cmoCorrPairPanel" style="background:linear-gradient(135deg,#f0f9ff 0%,#fafbfc 100%);border:1px solid #bee3f8;border-radius:12px;padding:14px 18px;margin-bottom:20px;">
        <div style="font-size:13px;font-weight:700;color:#2b6cb0;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
          <span style="background:#2b6cb0;color:#fff;border-radius:6px;padding:2px 8px;font-size:10px;font-weight:800;letter-spacing:0.6px;text-transform:uppercase;">Scatter</span>
          Análisis de dispersión por par de métricas
        </div>
        <div style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;">
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:10px;font-weight:700;color:#718096;text-transform:uppercase;letter-spacing:0.5px;">Eje X</label>
            <select id="cmoCorrSelX" style="padding:7px 10px;border:1.5px solid #bee3f8;border-radius:7px;font-size:12px;background:#fff;color:#2d3748;cursor:pointer;min-width:170px;">${pairsOpts}</select>
          </div>
          <div style="font-size:18px;color:#a0aec0;padding-bottom:6px;">↔</div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:10px;font-weight:700;color:#718096;text-transform:uppercase;letter-spacing:0.5px;">Eje Y</label>
            <select id="cmoCorrSelY" style="padding:7px 10px;border:1.5px solid #bee3f8;border-radius:7px;font-size:12px;background:#fff;color:#2d3748;cursor:pointer;min-width:170px;">${numKeys.map((k, i) => `<option value="${i}"${i === Math.min(1, n - 1) ? ' selected' : ''}>${esc(labels[i])}</option>`).join('')}</select>
          </div>
          <button id="cmoCorrBtnAnalizar" style="padding:8px 20px;background:#2b6cb0;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(43,108,176,0.3);">Analizar par ›</button>
          <span style="font-size:10px;color:#a0aec0;align-self:flex-end;padding-bottom:9px;">💡 También haz clic en una celda de la matriz</span>
        </div>
        <div id="cmoCorrScatterWrap" style="display:none;margin-top:18px;border-top:1px solid #e2e8f0;padding-top:16px;overflow-x:auto;"></div>
      </div>`;

    // ── Inyectar TODO de una vez (evita innerHTML+= que destruiría el canvas) ──
    const contenido = document.getElementById('cmoCorrelacionContenido');
    contenido.innerHTML = pairSelectorHtml + canvasWrapHtml + correlTableHtml + topHtml + `
      <div class="cmo-btn-row" style="margin-top:12px;">
        <button class="cmo-btn cmo-btn-success" id="cmoExportarCorrelacionCSV">Exportar matriz correlaciones CSV</button>
      </div>`;

    // ── Dibujar en el canvas YA en el DOM ────────────────────────────────────
    const canvas = document.getElementById('cmoCorrCanvas');
    const ctx    = canvas.getContext('2d');
    ctx.clearRect(0, 0, CW, CH);

    // Fondo
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(LBL_W, LBL_H, n * CELL, n * CELL);

    // Grid
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(LBL_W, LBL_H + i * CELL); ctx.lineTo(LBL_W + n * CELL, LBL_H + i * CELL); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(LBL_W + i * CELL, LBL_H); ctx.lineTo(LBL_W + i * CELL, LBL_H + n * CELL); ctx.stroke();
    }

    // Etiquetas de columna (texto en 2 líneas, sin rotar — más legible)
    const fSzLbl = Math.max(8, Math.min(10, CELL - 4));
    ctx.font      = `${fSzLbl}px system-ui,sans-serif`;
    ctx.fillStyle = '#4a5568';
    for (let j = 0; j < n; j++) {
      const cx2   = LBL_W + j * CELL + CELL / 2;
      const words = labels[j].split(' ');
      let line = '', lns = [];
      for (const w of words) {
        if ((line + ' ' + w).trim().length <= Math.floor(CELL / 5) + 3) { line = (line + ' ' + w).trim(); }
        else { if (line) lns.push(line); line = w; }
      }
      if (line) lns.push(line);
      lns = lns.slice(0, 3);
      const totalH = lns.length * (fSzLbl + 2);
      lns.forEach((ln, li) => {
        ctx.textAlign = 'center';
        ctx.fillText(ln, cx2, LBL_H - totalH + li * (fSzLbl + 2) + fSzLbl);
      });
    }

    // Etiquetas de fila
    ctx.textAlign = 'right';
    for (let i = 0; i < n; i++) {
      const words = labels[i].split(' ');
      let line = '', lns = [];
      for (const w of words) {
        if ((line + ' ' + w).trim().length <= 16) { line = (line + ' ' + w).trim(); }
        else { if (line) lns.push(line); line = w; }
      }
      if (line) lns.push(line);
      lns = lns.slice(0, 2);
      const cy2 = LBL_H + i * CELL + CELL / 2;
      const off = (lns.length - 1) * (fSzLbl + 1) / 2;
      lns.forEach((ln, li) => {
        ctx.fillStyle = '#4a5568';
        ctx.font = `${fSzLbl}px system-ui,sans-serif`;
        ctx.fillText(ln, LBL_W - 5, cy2 - off + li * (fSzLbl + 1));
      });
    }

    // Celdas
    const maxR = CELL / 2 - 5;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const cx2 = LBL_W + j * CELL + CELL / 2;
        const cy2 = LBL_H + i * CELL + CELL / 2;

        // Diagonal
        if (i === j) {
          ctx.fillStyle = '#e2e8f0';
          ctx.fillRect(LBL_W + j * CELL, LBL_H + i * CELL, CELL, CELL);
          ctx.fillStyle = '#4a5568'; ctx.font = `bold ${Math.max(8, Math.min(11, Math.round(CELL * 0.19)))}px system-ui,sans-serif`; ctx.textAlign = 'center';
          ctx.fillText('1.00', cx2, cy2 + 4);
          continue;
        }

        // Triángulo inferior (espejo, sombreado)
        if (i > j) {
          ctx.fillStyle = 'rgba(226,232,240,0.4)';
          ctx.fillRect(LBL_W + j * CELL + 1, LBL_H + i * CELL + 1, CELL - 2, CELL - 2);
          const rv = matriz[i][j];
          if (rv !== null) {
            ctx.fillStyle = '#94a3b8'; ctx.font = `${Math.max(7, Math.min(10, Math.round(CELL * 0.17)))}px system-ui,sans-serif`; ctx.textAlign = 'center';
            ctx.fillText(rv.toFixed(2), cx2, cy2 + 4);
          }
          continue;
        }

        // Triángulo superior: fondo de color + burbuja
        const r = matriz[i][j];
        if (r === null) {
          ctx.fillStyle = '#f1f5f9';
          ctx.fillRect(LBL_W + j * CELL + 1, LBL_H + i * CELL + 1, CELL - 2, CELL - 2);
          ctx.fillStyle = '#a0aec0'; ctx.font = `${Math.max(7, Math.min(10, Math.round(CELL * 0.17)))}px system-ui,sans-serif`; ctx.textAlign = 'center';
          ctx.fillText('—', cx2, cy2 + 4);
          continue;
        }

        const abs    = Math.abs(r);
        const alpha  = (abs * 0.28).toFixed(2);
        ctx.fillStyle = r > 0 ? `rgba(72,187,120,${alpha})` : `rgba(252,129,129,${alpha})`;
        ctx.fillRect(LBL_W + j * CELL, LBL_H + i * CELL, CELL, CELL);

        // Burbuja
        const bR = Math.max(4, maxR * abs);
        ctx.beginPath();
        ctx.arc(cx2, cy2, bR, 0, 2 * Math.PI);
        ctx.fillStyle = r > 0
          ? `rgba(56,161,105,${(0.3 + abs * 0.5).toFixed(2)})`
          : `rgba(229,62,62,${(0.3 + abs * 0.5).toFixed(2)})`;
        ctx.fill();

        if (abs >= 0.7) {
          ctx.strokeStyle = r > 0 ? '#276749' : '#c53030'; ctx.lineWidth = 2.5; ctx.stroke();
        }

        // Texto sobre burbuja
        const txtClr = abs > 0.5 ? '#fff' : (r > 0 ? '#276749' : '#c53030');
        ctx.fillStyle = txtClr; ctx.font = `bold ${Math.max(8, Math.min(11, Math.round(CELL * 0.19)))}px system-ui,sans-serif`; ctx.textAlign = 'center';
        ctx.fillText(r.toFixed(2), cx2, cy2 + 4);
      }
    }

    // ── Tooltip (body-level, no apilado) ─────────────────────────────────────
    let _ttCorr = document.getElementById('cmoCorrTooltipBody');
    if (!_ttCorr) {
      _ttCorr = document.createElement('div');
      _ttCorr.id = 'cmoCorrTooltipBody';
      _ttCorr.className = 'cmo-overlay';
      _ttCorr.style.cssText = 'display:none;position:fixed;background:rgba(26,32,44,0.95);color:#fff;font-size:11px;padding:7px 11px;border-radius:7px;pointer-events:none;z-index:9999;line-height:1.7;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.25);';
      document.body.appendChild(_ttCorr);
    }
    canvas.onmousemove = e => {
      const rect = canvas.getBoundingClientRect();
      const mx   = (e.clientX - rect.left) * (CW / rect.width);
      const my   = (e.clientY - rect.top)  * (CH / rect.height);
      const col  = Math.floor((mx - LBL_W) / CELL);
      const row  = Math.floor((my - LBL_H) / CELL);
      if (col < 0 || col >= n || row < 0 || row >= n || row === col) {
        _ttCorr.style.display = 'none'; return;
      }
      const r    = matriz[row][col];
      const lbl1 = labels[row], lbl2 = labels[col];
      if (r === null) { _ttCorr.style.display = 'none'; return; }
      const interp = Math.abs(r) >= 0.8 ? '<b>Muy fuerte</b>' : Math.abs(r) >= 0.6 ? 'Fuerte' : Math.abs(r) >= 0.4 ? 'Moderada' : 'Débil';
      const dir    = r > 0 ? '<span style="color:#68d391;">positiva</span>' : '<span style="color:#fc8181;">negativa</span>';
      _ttCorr.innerHTML = `<b>${esc(lbl1)}</b><br>× <b>${esc(lbl2)}</b><br>r = <b>${r.toFixed(4)}</b> · ${interp} ${dir}`;
      _ttCorr.style.display = 'block';
      _ttCorr.style.left = (e.clientX + 16) + 'px';
      _ttCorr.style.top  = (e.clientY - 14) + 'px';
    };
    canvas.onmouseleave = () => { _ttCorr.style.display = 'none'; };
    // Limpiar zoom anterior si existe, luego adjuntar zoom + pan
    if (window.detachCanvasZoom) window.detachCanvasZoom(canvas);
    if (window.attachCanvasZoom) window.attachCanvasZoom(canvas);
    // Botón PNG
    const _corrWrap = canvas.closest('.cmo-canvas-zoom-wrap') || canvas.parentElement;
    if (_corrWrap && !_corrWrap.querySelector('.cmo-export-png-btn')) {
      const _btn = document.createElement('button');
      _btn.className = 'cmo-export-png-btn';
      _btn.title = 'Guardar correlación como imagen PNG';
      _btn.textContent = '📸 PNG';
      _btn.addEventListener('click', () => {
        _guardarPNGDesdeCanvas(canvas, 'correlacion', 'heatmap_correlaciones');
      });
      _corrWrap.appendChild(_btn);
    }
    const _corrCSVBtn = document.getElementById('cmoExportarCorrelacionCSV');
    if (_corrCSVBtn) {
      _corrCSVBtn.onclick = () => _exportTableElementToCSV(
        contenido.querySelector('.cmo-radar-table'),
        'correlacion',
        'tabla_correlaciones'
      );
    }

    // ── Scatter: dibujo por par de métricas ──────────────────────────────────
    function _drawPairScatter(xiIdx, yiIdx) {
      const wrap2 = document.getElementById('cmoCorrScatterWrap');
      if (!wrap2) return;
      if (xiIdx === yiIdx) {
        wrap2.innerHTML = `<div style="color:#e53e3e;font-size:12px;padding:10px;">Selecciona dos métricas distintas.</div>`;
        wrap2.style.display = 'block'; return;
      }
      const ka = numKeys[xiIdx], kb = numKeys[yiIdx];
      const la = labels[xiIdx],  lb = labels[yiIdx];
      const rRaw = xiIdx < yiIdx ? matriz[xiIdx][yiIdx] : matriz[yiIdx][xiIdx];

      const ptsSrc = objs.map((o, oi) => ({
        x: getValor(o, ka), y: getValor(o, kb),
        name: o.nombre || o.id || ('Obj ' + (oi + 1)),
        stroke: PALETA[oi % PALETA.length].stroke
      })).filter(p => typeof p.x === 'number' && isFinite(p.x) && typeof p.y === 'number' && isFinite(p.y));

      if (ptsSrc.length < 2) {
        wrap2.innerHTML = `<div style="color:#a0aec0;font-size:12px;padding:10px;">Datos insuficientes para este par.</div>`;
        wrap2.style.display = 'block'; return;
      }

      // Regresión lineal OLS
      const mx2 = ptsSrc.reduce((s, p) => s + p.x, 0) / ptsSrc.length;
      const my2 = ptsSrc.reduce((s, p) => s + p.y, 0) / ptsSrc.length;
      const ssxy = ptsSrc.reduce((s, p) => s + (p.x - mx2) * (p.y - my2), 0);
      const ssx  = ptsSrc.reduce((s, p) => s + (p.x - mx2) ** 2, 0);
      const slope     = ssx === 0 ? 0 : ssxy / ssx;
      const intercept = my2 - slope * mx2;
      const residuals = ptsSrc.map(p => p.y - (slope * p.x + intercept));
      const sse = residuals.reduce((s, e) => s + e * e, 0);
      const seReg = ptsSrc.length > 2 ? Math.sqrt(sse / (ptsSrc.length - 2)) : 0;

      const rVal  = rRaw ?? 0;
      const r2Val = rVal * rVal;
      const absR  = Math.abs(rVal);
      const rColor  = rVal > 0 ? '#276749' : '#c53030';
      const rInterp = absR >= 0.8 ? 'Muy fuerte' : absR >= 0.6 ? 'Fuerte' : absR >= 0.4 ? 'Moderada' : 'Débil';
      const rSign   = rVal >= 0 ? 'positiva' : 'negativa';
      const signStr = intercept >= 0 ? `+ ${intercept.toFixed(4)}` : `− ${Math.abs(intercept).toFixed(4)}`;

      wrap2.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
          <div style="background:${rColor};color:#fff;border-radius:8px;padding:5px 14px;font-size:14px;font-weight:800;">r = ${rVal.toFixed(3)}</div>
          <div style="background:#f7fafc;border:1px solid #e2e8f0;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:700;color:#4a5568;">R² = ${r2Val.toFixed(3)}</div>
          <div style="font-size:11px;color:#718096;font-weight:600;">${rInterp} ${rSign}</div>
          <div style="font-size:10px;color:#a0aec0;margin-left:auto;font-style:italic;">ŷ = ${slope.toFixed(4)}x ${signStr}</div>
        </div>
        <canvas id="cmoCorrScat" width="660" height="400" style="display:block;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.07);cursor:crosshair;max-width:100%;"></canvas>
        <div class="cmo-btn-row" style="margin-top:10px;">
          <button class="cmo-btn cmo-btn-primary" id="cmoExportarCorrScatterPNG">Exportar scatter PNG</button>
        </div>`;

      wrap2.style.display  = 'block';
      wrap2.style.opacity  = '0';
      wrap2.style.transform = 'translateY(8px)';
      wrap2.style.transition = 'opacity 0.25s,transform 0.25s';
      requestAnimationFrame(() => { wrap2.style.opacity = '1'; wrap2.style.transform = 'translateY(0)'; });

      // ── Dibujar scatter ──
      const W = 660, H = 400;
      const PL = 76, PR = 24, PT = 50, PB = 62;
      const pw = W - PL - PR, ph = H - PT - PB;

      const xVals = ptsSrc.map(p => p.x), yVals = ptsSrc.map(p => p.y);
      const xMin = Math.min(...xVals), xMax = Math.max(...xVals);
      const yMin = Math.min(...yVals), yMax = Math.max(...yVals);
      const xPad = (xMax - xMin) * 0.13 || 1, yPad = (yMax - yMin) * 0.13 || 1;
      const xL = xMin - xPad, xR = xMax + xPad;
      const yB = yMin - yPad, yT = yMax + yPad;

      const tx2 = v => PL + (v - xL) / (xR - xL) * pw;
      const ty2 = v => PT + ph - (v - yB) / (yT - yB) * ph;

      const sc2  = document.getElementById('cmoCorrScat');
      const ctx3 = sc2.getContext('2d');
      ctx3.clearRect(0, 0, W, H);

      // Fondo del área de plot
      ctx3.fillStyle = '#fafbfc'; ctx3.fillRect(0, 0, W, H);
      ctx3.fillStyle = '#fff';    ctx3.fillRect(PL, PT, pw, ph);

      // Grid
      const nTk = 5;
      ctx3.strokeStyle = '#e8edf2'; ctx3.lineWidth = 1;
      for (let t = 0; t <= nTk; t++) {
        const gx2 = tx2(xL + t * (xR - xL) / nTk);
        const gy2 = ty2(yB + t * (yT - yB) / nTk);
        ctx3.beginPath(); ctx3.moveTo(gx2, PT); ctx3.lineTo(gx2, PT + ph); ctx3.stroke();
        ctx3.beginPath(); ctx3.moveTo(PL, gy2); ctx3.lineTo(PL + pw, gy2); ctx3.stroke();
      }

      // Banda ±1SE y línea de regresión
      if (ssx > 0) {
        const rxL3 = tx2(xL), rxR3 = tx2(xR);
        const ryLt = ty2(slope * xL + intercept + seReg), ryRt = ty2(slope * xR + intercept + seReg);
        const ryLb = ty2(slope * xL + intercept - seReg), ryRb = ty2(slope * xR + intercept - seReg);
        ctx3.beginPath();
        ctx3.moveTo(rxL3, ryLt); ctx3.lineTo(rxR3, ryRt);
        ctx3.lineTo(rxR3, ryRb); ctx3.lineTo(rxL3, ryLb);
        ctx3.closePath();
        ctx3.fillStyle = rVal > 0 ? 'rgba(56,161,105,0.08)' : 'rgba(229,62,62,0.08)';
        ctx3.fill();

        ctx3.beginPath();
        ctx3.moveTo(rxL3, ty2(slope * xL + intercept));
        ctx3.lineTo(rxR3, ty2(slope * xR + intercept));
        ctx3.strokeStyle = rVal > 0 ? '#38a169' : '#e53e3e';
        ctx3.lineWidth = 2; ctx3.setLineDash([7, 3]); ctx3.stroke();
        ctx3.setLineDash([]);
      }

      // Puntos
      ptsSrc.forEach(p => {
        const px3 = tx2(p.x), py3 = ty2(p.y);
        ctx3.beginPath(); ctx3.arc(px3, py3, 6, 0, 2 * Math.PI);
        ctx3.fillStyle  = p.stroke + '28'; ctx3.fill();
        ctx3.strokeStyle = p.stroke; ctx3.lineWidth = 2; ctx3.stroke();
      });

      // Etiquetas de puntos
      ctx3.font = '9px system-ui,sans-serif';
      ptsSrc.forEach(p => {
        const px3 = tx2(p.x), py3 = ty2(p.y);
        ctx3.fillStyle = p.stroke;
        ctx3.textAlign = 'left';
        ctx3.fillText(p.name, Math.min(px3 + 8, W - 4), Math.max(py3 - 6, 12));
      });

      // Ejes
      ctx3.strokeStyle = '#cbd5e0'; ctx3.lineWidth = 1.5;
      ctx3.beginPath(); ctx3.moveTo(PL, PT); ctx3.lineTo(PL, PT + ph); ctx3.stroke();
      ctx3.beginPath(); ctx3.moveTo(PL, PT + ph); ctx3.lineTo(PL + pw, PT + ph); ctx3.stroke();

      // Tick labels
      const fmt2 = v => Math.abs(v) >= 100000 ? v.toExponential(1) : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
      ctx3.fillStyle = '#718096'; ctx3.font = '9.5px system-ui,sans-serif';
      for (let t = 0; t <= nTk; t++) {
        const xv = xL + t * (xR - xL) / nTk, yv = yB + t * (yT - yB) / nTk;
        ctx3.textAlign = 'center'; ctx3.fillText(fmt2(xv), tx2(xv), PT + ph + 14);
        ctx3.textAlign = 'right';  ctx3.fillText(fmt2(yv), PL - 6, ty2(yv) + 4);
      }

      // Etiqueta Eje X
      ctx3.fillStyle = '#4a5568'; ctx3.font = 'bold 10.5px system-ui,sans-serif';
      ctx3.textAlign = 'center'; ctx3.fillText(la, PL + pw / 2, H - 12);

      // Etiqueta Eje Y (rotada)
      ctx3.save(); ctx3.translate(13, PT + ph / 2); ctx3.rotate(-Math.PI / 2);
      ctx3.textAlign = 'center'; ctx3.fillText(lb, 0, 0); ctx3.restore();

      // Tooltip scatter (body-level)
      let _ttScat = document.getElementById('cmoCorrScatTooltipBody');
      if (!_ttScat) {
        _ttScat = document.createElement('div');
        _ttScat.id = 'cmoCorrScatTooltipBody';
        _ttScat.className = 'cmo-overlay';
        _ttScat.style.cssText = 'display:none;position:fixed;background:rgba(26,32,44,0.95);color:#fff;font-size:11px;padding:7px 11px;border-radius:7px;pointer-events:none;z-index:9999;line-height:1.7;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.25);';
        document.body.appendChild(_ttScat);
      }
      sc2.onmousemove = e => {
        const rec4 = sc2.getBoundingClientRect();
        const mx4  = (e.clientX - rec4.left) * (W / rec4.width);
        const my4  = (e.clientY - rec4.top)  * (H / rec4.height);
        let hit = null, dMin = 14;
        ptsSrc.forEach(p => { const d = Math.hypot(tx2(p.x) - mx4, ty2(p.y) - my4); if (d < dMin) { dMin = d; hit = p; } });
        if (!hit) { _ttScat.style.display = 'none'; return; }
        _ttScat.innerHTML = `<b>${esc(hit.name)}</b><br>${esc(la)}: <b>${hit.x.toFixed(4)}</b><br>${esc(lb)}: <b>${hit.y.toFixed(4)}</b>`;
        _ttScat.style.display = 'block';
        _ttScat.style.left = (e.clientX + 16) + 'px';
        _ttScat.style.top  = (e.clientY - 14) + 'px';
      };
      sc2.onmouseleave = () => { _ttScat.style.display = 'none'; };
      const _corrScatterBtn = document.getElementById('cmoExportarCorrScatterPNG');
      if (_corrScatterBtn) {
        _corrScatterBtn.onclick = () => _guardarPNGDesdeCanvas(sc2, 'correlacion', `scatter_${la}_${lb}`);
      }
    }

    // ── Conectar controles del panel selector ─────────────────────────────────
    const _selX = document.getElementById('cmoCorrSelX');
    const _selY = document.getElementById('cmoCorrSelY');
    const _btnA = document.getElementById('cmoCorrBtnAnalizar');
    if (_btnA) {
      _btnA.onmouseenter = () => { _btnA.style.background = '#2c5282'; };
      _btnA.onmouseleave = () => { _btnA.style.background = '#2b6cb0'; };
      _btnA.onclick = () => _drawPairScatter(+_selX.value, +_selY.value);
    }

    // Clic en celda de la matriz → auto-selecciona par y dibuja scatter
    canvas.onclick = e => {
      const rec5 = canvas.getBoundingClientRect();
      const mx5  = (e.clientX - rec5.left) * (CW / rec5.width);
      const my5  = (e.clientY - rec5.top)  * (CH / rec5.height);
      const col5 = Math.floor((mx5 - LBL_W) / CELL);
      const row5 = Math.floor((my5 - LBL_H) / CELL);
      if (col5 < 0 || col5 >= n || row5 < 0 || row5 >= n || row5 === col5) return;
      if (_selX) _selX.value = String(row5);
      if (_selY) _selY.value = String(col5);
      _drawPairScatter(row5, col5);
      const panel = document.getElementById('cmoCorrPairPanel');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    // Auto-render el par con mayor |r| al cargar
    if (topPares.length > 0) {
      const best = topPares[0];
      if (_selX) _selX.value = String(best.i);
      if (_selY) _selY.value = String(best.j);
      _drawPairScatter(best.i, best.j);
    }
  }

  // ──── MORFOLOGÍA RADIAL (centroide hull como referencia) ─────────────────
  function renderMorfologia(objs, keys) {
    const tabBtn = document.querySelector('.cmo-tab-btn[data-tab="morfologia"]');

    // ── HELPER: obtiene los puntos del hull como array de {x,y} ──
    function getHullPts(obj) {
      const pts = obj.geometria?.convexHull?.puntos;
      if (!Array.isArray(pts) || pts.length < 3) return null;
      return pts;
    }

    // ── HELPER: base de normalización — centroide y rmax calculados SIEMPRE
    //    desde los puntos del hull convertidos a coords ABSOLUTAS de imagen.
    //
    //    SISTEMA DE COORDENADAS (todos en coords ABSOLUTAS de imagen):
    //    • geometria.convexHull.puntos  → ABSOLUTO (guardado con +minX/Y en analysis-core.js)
    //    • geometria.contornoReal.puntos → ABSOLUTO (obj.contour_points directos)
    //    • perforaciones[i].puntos       → ABSOLUTO (canvas + perforationCanvasOffset)
    //
    //    Todos los datos en el mismo sistema → toCanvas() solo resta el centroide hull
    //    y normaliza por rmax. No se aplica ningún offset adicional.
    function getHullBasis(obj) {
      const rawPts = getHullPts(obj);
      if (!rawPts) return null;
      const getX = p => p.x !== undefined ? p.x : p[0];
      const getY = p => p.y !== undefined ? p.y : p[1];
      // puntos ya en ABSOLUTO → solo normalizar formato a {x, y}
      const pts = rawPts.map(p => ({ x: getX(p), y: getY(p) }));
      // Usar centroide área-ponderado de métricas como origen (coincide con CSV exportado).
      // Fallback: promedio aritmético de vértices.
      const m = obj.metricas || {};
      const mhx = parseFloat(m.centroide_hull_x);
      const mhy = parseFloat(m.centroide_hull_y);
      let cx, cy;
      if (isFinite(mhx) && isFinite(mhy)) {
        cx = mhx; cy = mhy;
      } else {
        cx = 0; cy = 0;
        for (const p of pts) { cx += p.x; cy += p.y; }
        cx /= pts.length; cy /= pts.length;
      }
      const rmax = Math.max(...pts.map(p => Math.hypot(p.x - cx, p.y - cy))) || 1;
      // Tensor de inercia del hull → eigeneje mayor → ángulo de orientación (radianes, [0,π))
      // Mismo método que calcularEjePrincipal: atan2(λ1 − Sxx, Sxy)
      let sxx = 0, syy = 0, sxy = 0;
      for (const p of pts) { const dx = p.x - cx, dy = p.y - cy; sxx += dx*dx; syy += dy*dy; sxy += dx*dy; }
      sxx /= pts.length; syy /= pts.length; sxy /= pts.length;
      const _l1 = (sxx + syy) / 2 + Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
      let orientAngle = Math.abs(sxy) > 1e-10 ? Math.atan2(_l1 - sxx, sxy) : (sxx >= syy ? 0 : Math.PI / 2);
      if (orientAngle < 0) orientAngle += Math.PI;
      return { cx, cy, rmax, pts, orientAngle };
    }

    // Hull normalizado ({x,y,r,theta,rn}) — solo para la matriz de distancias radiales
    function getHullNorm(basis) {
      const { cx, cy, rmax, pts } = basis;
      const getX = p => p.x !== undefined ? p.x : p[0];
      const getY = p => p.y !== undefined ? p.y : p[1];
      return pts.map(p => {
        const px = getX(p) - cx;
        const py = getY(p) - cy;
        const r  = Math.hypot(px, py);
        return { x: px, y: py, r, theta: Math.atan2(py, px), rn: r / rmax };
      });
    }

    // ── TRANSFORMACIÓN ÚNICA para todas las geometrías ──────────────────────
    // Premisa: centroide hull = origen (0,0) del sistema cartesiano.
    // Todos los datos (hull, contorno, P/H) están en coordenadas ABSOLUTAS de imagen.
    // Esta función resta el centroide y normaliza por rmaxGlobal para que la escala
    // relativa real quede preservada entre objetos.
    // SIN Y-flip: mismas coordenadas que imagen (Y↓), igual que el trazado del análisis.
    function toCanvas(rawPts, basis, rmaxScale) {
      const getX = p => p.x !== undefined ? p.x : p[0];
      const getY = p => p.y !== undefined ? p.y : p[1];
      return rawPts.map(p => ({
        x: CX + ((getX(p) - basis.cx) / rmaxScale) * R,
        y: CY + ((getY(p) - basis.cy) / rmaxScale) * R
      }));
    }

    // Polígonos P y H en coords canvas.
    // Todos los datos son ABSOLUTOS de imagen → se pasan directamente a toCanvas,
    // que resta el centroide hull (también ABSOLUTO) y normaliza.
    function getPHCanvas(obj, basis, rmaxScale) {
      const perfs = (obj.perforaciones || [])
        .filter(p => Array.isArray(p.puntos) && p.puntos.length >= 3)
        .map(p => toCanvas(p.puntos, basis, rmaxScale));
      const horas = (obj.horadaciones || [])
        .filter(h => Array.isArray(h.puntos) && h.puntos.length >= 3)
        .map(h => toCanvas(h.puntos, basis, rmaxScale));
      return { perfs, horas };
    }

    // Contorno real en coords canvas (coordenadas ABSOLUTAS → misma vía que hull y P/H).
    function getContornoCanvas(obj, basis, rmaxScale) {
      const pts = obj.geometria?.contornoReal?.puntos;
      if (!Array.isArray(pts) || pts.length < 3) return null;
      return toCanvas(pts, basis, rmaxScale);
    }

    // Desplazamiento centroide hull → real en píxeles imagen
    function getCentroideOffset(obj) {
      const m = obj.metricas;
      const hullCoords = obj.geometria?.centroides?.centroideHull?.coordenadas;
      const hx = parseFloat(m?.centroide_hull_x ?? (hullCoords ? hullCoords[0] : NaN));
      const hy = parseFloat(m?.centroide_hull_y ?? (hullCoords ? hullCoords[1] : NaN));
      const realCoords = obj.geometria?.centroides?.centroideReal?.coordenadas;
      const rx = parseFloat(m?.centroide_x ?? (realCoords ? realCoords[0] : NaN));
      const ry = parseFloat(m?.centroide_y ?? (realCoords ? realCoords[1] : NaN));
      return (isFinite(hx) && isFinite(hy) && isFinite(rx) && isFinite(ry))
        ? Math.hypot(hx - rx, hy - ry) : null;
    }

    // Rota puntos canvas alrededor de (CX, CY) para normalización de orientación.
    // Sin Y-flip: el eje mayor en canvas está a +orientAngle desde horizontal (igual que imagen).
    // Para llevarlo a 0° (horizontal): rotar −orientAngle (CCW visual en pantalla Y↓).
    function rotateCanvasPts(pts, angle) {
      if (!pts || !pts.length || !angle) return pts;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      return pts.map(p => {
        const dx = p.x - CX, dy = p.y - CY;
        return { x: CX + dx * cos - dy * sin, y: CY + dx * sin + dy * cos };
      });
    }

    // Reflejo especular a través de la línea que pasa por (CX,CY) con ángulo theta.
    // Fórmula: x' = dx·cos2θ + dy·sin2θ,  y' = dx·sin2θ − dy·cos2θ
    function reflectCanvasPts(pts, theta) {
      if (!pts || !pts.length) return pts;
      const cos2 = Math.cos(2 * theta), sin2 = Math.sin(2 * theta);
      return pts.map(p => {
        const dx = p.x - CX, dy = p.y - CY;
        return { x: CX + dx * cos2 + dy * sin2, y: CY + dx * sin2 - dy * cos2 };
      });
    }

    // Proyecta un punto absoluto de imagen a canvas (igual que toCanvas pero para un punto)
    function ptToCanvas(px, py, basis, rmaxScale) {
      return {
        x: CX + ((px - basis.cx) / rmaxScale) * R,
        y: CY + ((py - basis.cy) / rmaxScale) * R
      };
    }

    // Resample hull radial profile a N ángulos equidistantes (para distancia morfológica)
    function resampleHull(hullNorm, N = 36) {
      const sorted = [...hullNorm].sort((a, b) => a.theta - b.theta);
      sorted.push({ ...sorted[0], theta: sorted[0].theta + 2 * Math.PI });
      const result = new Array(N);
      for (let i = 0; i < N; i++) {
        const target = -Math.PI + (i / N) * 2 * Math.PI;
        let lo = 0;
        for (let j = 0; j < sorted.length - 1; j++) {
          if (sorted[j].theta <= target && sorted[j + 1].theta >= target) { lo = j; break; }
        }
        const span = sorted[lo + 1].theta - sorted[lo].theta;
        const t = span === 0 ? 0 : (target - sorted[lo].theta) / span;
        result[i] = sorted[lo].rn + t * (sorted[lo + 1].rn - sorted[lo].rn);
      }
      return result;
    }

    // Construye Path2D desde array de {x,y}
    function buildPath(pts) {
      const p = new Path2D();
      if (!pts || pts.length === 0) return p;
      p.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y);
      p.closePath();
      return p;
    }

    // ── Disponibilidad ─────────────────────────────────────────────────────
    const conHull = objs.filter(o => getHullBasis(o) !== null);
    const sinHull = objs.filter(o => getHullBasis(o) === null);

    if (conHull.length === 0) {
      if (tabBtn) { tabBtn.style.opacity = '0.4'; tabBtn.disabled = true; }
      const c = document.getElementById('cmoMorfologiaContenido');
      if (c) c.innerHTML = '<div style="color:#a0aec0;font-size:12px;padding:20px;">No hay datos de Convex Hull disponibles en los objetos seleccionados.</div>';
      return;
    }
    if (tabBtn) { tabBtn.style.opacity = ''; tabBtn.disabled = false; }

    // ── HTML ───────────────────────────────────────────────────────────────
    const sinHullMsg = sinHull.length
      ? `<span style="color:#fc8181;font-size:10px;"> — ${sinHull.length} obj sin hull: ${sinHull.map(o=>esc(o.nombre)).join(', ')}</span>`
      : '';
    const contenido = document.getElementById('cmoMorfologiaContenido');
    contenido.innerHTML = `
      <div class="cmo-morf-layout">
        <div class="cmo-morf-canvas-col">
          <div class="cmo-morf-section-title">
            Superposición a escala real — centroide hull = origen común${sinHullMsg}
          </div>
          <div class="cmo-morf-layers" id="cmoMorfLayers">
            <label class="cmo-morf-layer-chk"><input type="checkbox" id="mlHull" checked>
              <span class="cmo-morf-layer-dot" style="background:rgba(49,130,206,0.3);border:2px solid #3182ce;"></span>Hull</label>
            <label class="cmo-morf-layer-chk"><input type="checkbox" id="mlContorno" checked>
              <span class="cmo-morf-layer-dot" style="background:transparent;border:2px dashed #888;"></span>Contorno real</label>
            <label class="cmo-morf-layer-chk"><input type="checkbox" id="mlPerf" checked>
              <span class="cmo-morf-layer-dot" style="background:rgba(26,86,219,0.4);border:2px solid #1a56db;"></span>Perforaciones</label>
            <label class="cmo-morf-layer-chk"><input type="checkbox" id="mlHora" checked>
              <span class="cmo-morf-layer-dot" style="background:rgba(5,122,85,0.35);border:2px solid #057a55;"></span>Horadaciones</label>
            <label class="cmo-morf-layer-chk"><input type="checkbox" id="mlOrient">
              <span class="cmo-morf-layer-dot" style="background:#fef3c7;border:2px solid #d97706;font-size:7px;display:flex;align-items:center;justify-content:center;">↔</span>Normalizar orient.</label>
          </div>
          <!-- ── CONTROL DE ROTACIÓN MANUAL ─────────────────────────────── -->
          <div id="cmoMorfRotPanel" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0 2px 0;padding:7px 10px;background:#fffbeb;border:1px solid #fde68a;border-radius:7px;font-size:11px;">
            <span style="color:#92400e;font-weight:600;white-space:nowrap;">↻ Rotación manual:</span>
            <select id="cmoRotObjSel" style="font-size:11px;padding:2px 5px;border:1px solid #fcd34d;border-radius:4px;background:#fff;max-width:170px;">
              <option value="__all__">— todos los objetos —</option>
              ${objs.map((o,i) => `<option value="${i}">${esc(o.nombre)}${o.cara && o.cara!=='Mono' ? ' ('+o.cara+')':''}</option>`).join('')}
            </select>
            <input id="cmoRotAngle" type="number" value="0" min="-360" max="360" step="1"
              style="width:62px;font-size:11px;padding:2px 5px;border:1px solid #fcd34d;border-radius:4px;text-align:right;">
            <span style="color:#78350f;">°</span>
            <button id="cmoRotApply" style="font-size:10px;padding:2px 8px;background:#f59e0b;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600;">Aplicar</button>
            <button id="cmoRotReset" style="font-size:10px;padding:2px 8px;background:#e5e7eb;color:#374151;border:none;border-radius:4px;cursor:pointer;">Reset</button>
            <span style="color:#fcd34d;">│</span>
            <button id="cmoRotMirror" style="font-size:10px;padding:2px 8px;background:#7c3aed;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600;" title="Reflejo especular respecto al eje mayor del objeto en su posición actual">⟺ Reflejar eje mayor</button>
            <span id="cmoRotStatus" style="color:#92400e;font-style:italic;font-size:10px;"></span>
          </div>
          <!-- ───────────────────────────────────────────────────────────── -->
          <canvas id="cmoHullOverlayCanvas" width="520" height="520"
            style="display:block;border-radius:6px;cursor:crosshair;max-width:100%;height:auto;"></canvas>
          <div class="cmo-btn-row" style="margin-top:10px;">
            <button class="cmo-btn cmo-btn-primary" id="cmoExportarMorfologiaPNG">Exportar imagen CGeo PNG</button>
          </div>
          <div class="cmo-hull-legend-caption">
            Círculos: 25·50·75·100% del radio hull del objeto mayor. Escala relativa real preservada.
          </div>
          <div id="cmoHullLegend" class="cmo-hull-legend"></div>
        </div>
        <div class="cmo-morf-table-col">
          <div class="cmo-morf-section-title">Métricas radiales desde centroide Hull</div>
          <div class="cmo-morf-scroll" id="cmoMorfRadialTable"></div>
          <div class="cmo-btn-row" style="margin-top:10px;">
            <button class="cmo-btn cmo-btn-success" id="cmoExportarMorfRadialCSV">Exportar métricas radiales CSV</button>
          </div>
          <div class="cmo-morf-section-title" style="margin-top:16px;">Distancia morfológica entre objetos <span style="font-weight:400;color:#a0aec0;font-size:10px;">(perfil radial Δr̄ normalizado)</span></div>
          <div class="cmo-morf-scroll" id="cmoMorfDistMatrix"></div>
          <div class="cmo-btn-row" style="margin-top:10px;">
            <button class="cmo-btn cmo-btn-success" id="cmoExportarMorfDistCSV">Exportar distancia morfológica CSV</button>
          </div>
        </div>
      </div>
      <div id="cmoHullTooltip" style="display:none;position:fixed;background:rgba(45,55,72,0.95);color:#fff;font-size:11px;padding:6px 10px;border-radius:6px;pointer-events:none;z-index:9999;line-height:1.7;white-space:nowrap;"></div>`;

    // ── CANVAS ─────────────────────────────────────────────────────────────
    const canvas = document.getElementById('cmoHullOverlayCanvas');
    const ctx    = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const CX = W / 2, CY = H / 2, R = Math.min(W, H) / 2 - 52;

    // rmaxGlobal: radio máximo entre todos los objetos → normalizar todos por el mismo valor
    // garantiza que la escala relativa real quede preservada en el canvas.
    const rmaxGlobal = Math.max(...objs.map(o => getHullBasis(o)?.rmax || 0)) || 1;

    // Pre-computar datos por objeto (una sola vez)
    const objData = objs.map((obj, oi) => {
      const basis = getHullBasis(obj);
      if (!basis) return { obj, basis: null, oi };
      // getHullNorm ahora recibe basis (no obj) — valores ya centrados a 0,0
      const hullNorm = getHullNorm(basis);
      // hullCanvas: MISMA función que contorno y P/H → no puede haber desajuste
      const hullCanvas = toCanvas(basis.pts, basis, rmaxGlobal);
      const ph       = getPHCanvas(obj, basis, rmaxGlobal);
      const contorno = getContornoCanvas(obj, basis, rmaxGlobal);
      // Calcular orientAngle como el ángulo real del eje mayor p1→p2 en el espacio canvas.
      // Así la rotación −orientAngle lleva el eje exactamente a 0° (horizontal) sin margen de error.
      // Para eso proyectamos p1/p2 a canvas (con rmaxGlobal) y calculamos atan2(dy, dx).
      // Si no hay puntos recortados disponibles, fallback a eje_principal_angulo del JSON.
      let orientAngle;
      const em = obj.metricas || {};
      const _ep1 = em.eje_mayor_p1_recortado, _ep2 = em.eje_mayor_p2_recortado;
      if (Array.isArray(_ep1) && Array.isArray(_ep2)) {
        const cp1 = ptToCanvas(_ep1[0], _ep1[1], basis, rmaxGlobal);
        const cp2 = ptToCanvas(_ep2[0], _ep2[1], basis, rmaxGlobal);
        // ángulo real del eje en canvas (−π, +π); modulo π para [0, π)
        let a = Math.atan2(cp2.y - cp1.y, cp2.x - cp1.x);
        if (a < 0) a += Math.PI;
        orientAngle = a;
      } else {
        const ejePrincipal = parseFloat(em.eje_principal_angulo);
        orientAngle = isFinite(ejePrincipal) ? ejePrincipal * Math.PI / 180 : basis.orientAngle;
      }
      return { obj, basis, oi, hullNorm, hullCanvas, ph, contorno, orientAngle };
    });

    // Visibilidad per-objeto: { [oi]: { hull, contorno, perf, hora } }
    const objVisibility = {};
    objData.forEach(d => { objVisibility[d.oi] = { hull: true, contorno: true, perf: true, hora: true }; });

    // Rotaciones manuales independientes por objeto: Map<oi → ángulo en radianes>
    const manualRotations = new Map();
    // Reflejos especulares por objeto: Set<oi> — reflejo activo respecto al eje mayor actual
    const manualMirrors = new Set();

    // Paths para hit-testing con mouse
    const hitPaths = []; // { type:'hull'|'perf'|'hora', oi, path, col, obj }

    function drawCanvas(layers) {
      ctx.clearRect(0, 0, W, H);
      hitPaths.length = 0;

      // Rotación compuesta: primero normalización de orientación (si activa),
      // luego rotación manual adicional (si definida). Ambas pueden coexistir.
      // Finalmente, reflejo especular si está activo para el objeto.
      const rot = (pts, d) => {
        let r = pts;
        if (layers.orient && d?.orientAngle) r = rotateCanvasPts(r, -d.orientAngle);
        if (d && manualRotations.has(d.oi))  r = rotateCanvasPts(r, manualRotations.get(d.oi));
        if (d && manualMirrors.has(d.oi)) {
          // El eje de reflejo es el eje mayor TAL COMO ESTÁ en canvas tras las rotaciones previas.
          // Sin orient: eje en orientAngle; con orient: eje en 0; más rotación manual: suma α.
          const baseAngle = layers.orient ? 0 : (d.orientAngle || 0);
          const extraRot  = manualRotations.get(d.oi) || 0;
          r = reflectCanvasPts(r, baseAngle + extraRot);
        }
        return r;
      };

      // Fondo
      ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, W, H);
      ctx.setLineDash([]);

      // Círculos de referencia
      for (let lvl = 1; lvl <= 4; lvl++) {
        ctx.beginPath(); ctx.arc(CX, CY, R * lvl / 4, 0, 2 * Math.PI);
        ctx.strokeStyle = lvl === 4 ? '#94a3b8' : '#e2e8f0';
        ctx.lineWidth = lvl === 4 ? 1.5 : 1; ctx.stroke();
        ctx.fillStyle = '#b0bec5'; ctx.font = '8px system-ui,sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`${lvl * 25}%`, CX + 2, CY - R * lvl / 4 - 4);
      }
      // Ejes angulares (8 dir)
      for (let a = 0; a < 8; a++) {
        const th = (a / 8) * 2 * Math.PI;
        ctx.beginPath(); ctx.moveTo(CX, CY);
        ctx.lineTo(CX + (R + 10) * Math.cos(th), CY + (R + 10) * Math.sin(th));
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.stroke();
      }
      // Etiquetas angulares
      const angLabels = ['0°','45°','90°','135°','180°','225°','270°','315°'];
      ctx.fillStyle = '#94a3b8'; ctx.font = '9px system-ui,sans-serif';
      for (let a = 0; a < 8; a++) {
        const th = (a / 8) * 2 * Math.PI;
        ctx.textAlign = 'center';
        ctx.fillText(angLabels[a], CX + (R + 26) * Math.cos(th), CY + (R + 26) * Math.sin(th) + 3);
      }
      // Título canvas
      ctx.fillStyle = '#2d3748'; ctx.font = 'bold 10px system-ui,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(layers.orient
        ? 'Orientación normalizada — eje mayor ↔ 0° (todos los objetos)'
        : 'Superposición a escala real — centroide hull = origen común', CX, 15);

      // Eje de referencia de orientación (sólo cuando orient activo)
      if (layers.orient) {
        ctx.save();
        ctx.strokeStyle = '#d97706'; ctx.lineWidth = 2; ctx.setLineDash([6, 3]);
        ctx.beginPath(); ctx.moveTo(CX - R - 8, CY); ctx.lineTo(CX + R + 8, CY); ctx.stroke();
        ctx.setLineDash([]);
        // Cabezas de flecha
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(CX + R + 2, CY - 5); ctx.lineTo(CX + R + 9, CY); ctx.lineTo(CX + R + 2, CY + 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(CX - R - 2, CY - 5); ctx.lineTo(CX - R - 9, CY); ctx.lineTo(CX - R - 2, CY + 5); ctx.stroke();
        ctx.fillStyle = '#d97706'; ctx.font = 'bold 8px system-ui,sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('eje mayor', CX, CY - 10);
        ctx.restore();
      }

      // ── PASADA 1: relleno hull ───────────────────────────────────────────
      if (layers.hull) {
        for (const d of objData) {
          if (!d.basis || !(objVisibility[d.oi]?.hull ?? true)) continue;
          const col  = PALETA[d.oi % PALETA.length];
          const path = buildPath(rot(d.hullCanvas, d));
          ctx.save();
          ctx.fillStyle = col.fill;
          ctx.fill(path);
          ctx.restore();
          hitPaths.push({ type: 'hull', oi: d.oi, path, col, obj: d.obj });
        }
      }

      // ── PASADA 2: contorno real (línea punteada, sin relleno) ────────────
      if (layers.contorno) {
        for (const d of objData) {
          if (!d.basis || !d.contorno || !(objVisibility[d.oi]?.contorno ?? true)) continue;
          const col = PALETA[d.oi % PALETA.length];
          const path = buildPath(rot(d.contorno, d));
          ctx.save();
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = col.stroke; ctx.lineWidth = 1.2;
          ctx.stroke(path);
          ctx.setLineDash([]);
          ctx.restore();
        }
      }

      // ── PASADA 3: perforaciones (azul semitransparente + borde objeto) ───
      if (layers.perf) {
        for (const d of objData) {
          if (!d.basis || !d.ph.perfs.length || !(objVisibility[d.oi]?.perf ?? true)) continue;
          const col = PALETA[d.oi % PALETA.length];
          for (const poly of d.ph.perfs) {
            const path = buildPath(rot(poly, d));
            ctx.save();
            ctx.fillStyle = 'rgba(26,86,219,0.28)';
            ctx.fill(path);
            ctx.setLineDash([3, 2]);
            ctx.strokeStyle = col.stroke; ctx.lineWidth = 1.5;
            ctx.stroke(path);
            ctx.setLineDash([]);
            ctx.restore();
            hitPaths.push({ type: 'perf', oi: d.oi, path, col, obj: d.obj });
          }
        }
      }

      // ── PASADA 4: horadaciones (verde semitransparente + borde objeto) ───
      if (layers.hora) {
        for (const d of objData) {
          if (!d.basis || !d.ph.horas.length || !(objVisibility[d.oi]?.hora ?? true)) continue;
          const col = PALETA[d.oi % PALETA.length];
          for (const poly of d.ph.horas) {
            const path = buildPath(rot(poly, d));
            ctx.save();
            ctx.fillStyle = 'rgba(5,122,85,0.25)';
            ctx.fill(path);
            ctx.setLineDash([6, 3]);
            ctx.strokeStyle = col.stroke; ctx.lineWidth = 1.5;
            ctx.stroke(path);
            ctx.setLineDash([]);
            ctx.restore();
            hitPaths.push({ type: 'hora', oi: d.oi, path, col, obj: d.obj });
          }
        }
      }

      // ── PASADA 5: stroke hull encima (contorno dominante) ────────────────
      if (layers.hull) {
        for (const d of objData) {
          if (!d.basis || !(objVisibility[d.oi]?.hull ?? true)) continue;
          const col  = PALETA[d.oi % PALETA.length];
          const path = buildPath(rot(d.hullCanvas, d));
          ctx.save();
          ctx.strokeStyle = col.stroke; ctx.lineWidth = 2;
          ctx.stroke(path);
          ctx.restore();
        }
      }

      // ── PASADA 6 → reemplazada por PASADA 7 (ver abajo con ejes+centroides) ──

      // ── PASADA 7: ejes mayor/menor y centroides CH·CR·P·H ──────────────
      // Coordinación con capas: ejes → hull, CR → contorno, P → perf, H → hora
      // También respeta objVisibility per-objeto.
      for (const d of objData) {
        if (!d.basis) continue;
        const col = PALETA[d.oi % PALETA.length];
        const ov  = objVisibility[d.oi] || {};
        const θ = d.orientAngle;
        const L  = R * 0.44;
        const Lm = R * 0.20;  // eje menor más corto
        const cosθ = Math.cos(θ), sinθ = Math.sin(θ);

        // ── Eje mayor y menor → visibles con capa Hull ──
        // Se usan los puntos reales almacenados (eje_mayor_p1/p2_recortado) para garantizar
        // coincidencia exacta con el eje dibujado en el análisis morfológico.
        // Fallback: reconstrucción geométrica desde ángulo si no hay datos guardados.
        if (layers.hull && (ov.hull ?? true)) {
          const em = d.obj.metricas || {};
          const _em1r = em.eje_mayor_p1_recortado, _em2r = em.eje_mayor_p2_recortado;
          let emP1, emP2;
          if (Array.isArray(_em1r) && Array.isArray(_em2r)) {
            emP1 = ptToCanvas(_em1r[0], _em1r[1], d.basis, rmaxGlobal);
            emP2 = ptToCanvas(_em2r[0], _em2r[1], d.basis, rmaxGlobal);
          } else {
            emP1 = { x: CX - L * cosθ, y: CY - L * sinθ };
            emP2 = { x: CX + L * cosθ, y: CY + L * sinθ };
          }
          const [emR1, emR2] = rot([emP1, emP2], d);
          ctx.save();
          ctx.globalAlpha = 0.6;
          ctx.strokeStyle = col.stroke; ctx.lineWidth = 1.8; ctx.setLineDash([10, 4]);
          ctx.beginPath(); ctx.moveTo(emR1.x, emR1.y); ctx.lineTo(emR2.x, emR2.y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = col.stroke; ctx.font = 'bold 8px system-ui,sans-serif'; ctx.textAlign = 'center';
          ctx.fillText((θ * 180 / Math.PI).toFixed(1) + '°', emR2.x, emR2.y - 5);
          // Eje menor (perpendicular, gris)
          const _mn1r = em.eje_menor_p1_recortado, _mn2r = em.eje_menor_p2_recortado;
          let emn1, emn2;
          if (Array.isArray(_mn1r) && Array.isArray(_mn2r)) {
            emn1 = ptToCanvas(_mn1r[0], _mn1r[1], d.basis, rmaxGlobal);
            emn2 = ptToCanvas(_mn2r[0], _mn2r[1], d.basis, rmaxGlobal);
          } else {
            emn1 = { x: CX + Lm * (-sinθ), y: CY + Lm * cosθ };
            emn2 = { x: CX - Lm * (-sinθ), y: CY - Lm * cosθ };
          }
          const [emnR1, emnR2] = rot([emn1, emn2], d);
          ctx.globalAlpha = 0.35;
          ctx.strokeStyle = '#718096'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(emnR1.x, emnR1.y); ctx.lineTo(emnR2.x, emnR2.y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          ctx.restore();
        }

        // ── Centroide CR → visible con capa Contorno real ──
        if (layers.contorno && (ov.contorno ?? true)) {
          const m = d.obj.metricas || {};
          const realCoords = d.obj.geometria?.centroides?.centroideReal?.coordenadas;
          const crx = parseFloat(m.centroide_x ?? (realCoords ? realCoords[0] : NaN));
          const cry = parseFloat(m.centroide_y ?? (realCoords ? realCoords[1] : NaN));
          if (isFinite(crx) && isFinite(cry)) {
            const crPt = ptToCanvas(crx, cry, d.basis, rmaxGlobal);
            const [crR] = rot([crPt], d);
            ctx.save();
            ctx.beginPath(); ctx.arc(crR.x, crR.y, 4, 0, 2 * Math.PI);
            ctx.fillStyle = '#805ad5'; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
            ctx.fillStyle = '#805ad5'; ctx.font = 'bold 7px system-ui,sans-serif'; ctx.textAlign = 'left';
            ctx.fillText('CR', crR.x + 5, crR.y + 3);
            ctx.restore();
          }
        }

        // ── Centroides de Perforaciones → visibles con capa Perf ──
        if (layers.perf && (ov.perf ?? true)) {
          (d.obj.perforaciones || []).forEach((perf, pi) => {
            const pts = perf.puntos;
            if (!Array.isArray(pts) || pts.length < 3) return;
            const getX = p => p.x !== undefined ? p.x : p[0];
            const getY = p => p.y !== undefined ? p.y : p[1];
            const cx = pts.reduce((s, p) => s + getX(p), 0) / pts.length;
            const cy = pts.reduce((s, p) => s + getY(p), 0) / pts.length;
            const pPt = ptToCanvas(cx, cy, d.basis, rmaxGlobal);
            const [pR] = rot([pPt], d);
            ctx.save();
            ctx.beginPath(); ctx.arc(pR.x, pR.y, 3.5, 0, 2 * Math.PI);
            ctx.fillStyle = '#1a56db'; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
            ctx.fillStyle = '#1a56db'; ctx.font = '7px system-ui,sans-serif'; ctx.textAlign = 'left';
            ctx.fillText('P' + (pi + 1), pR.x + 4, pR.y + 3);
            ctx.restore();
          });
        }

        // ── Centroides de Horadaciones → visibles con capa Hora ──
        if (layers.hora && (ov.hora ?? true)) {
          (d.obj.horadaciones || []).forEach((hora, hi) => {
            const pts = hora.puntos;
            if (!Array.isArray(pts) || pts.length < 3) return;
            const getX = p => p.x !== undefined ? p.x : p[0];
            const getY = p => p.y !== undefined ? p.y : p[1];
            const cx = pts.reduce((s, p) => s + getX(p), 0) / pts.length;
            const cy = pts.reduce((s, p) => s + getY(p), 0) / pts.length;
            const hPt = ptToCanvas(cx, cy, d.basis, rmaxGlobal);
            const [hR] = rot([hPt], d);
            ctx.save();
            ctx.beginPath(); ctx.arc(hR.x, hR.y, 3.5, 0, 2 * Math.PI);
            ctx.fillStyle = '#057a55'; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
            ctx.fillStyle = '#057a55'; ctx.font = '7px system-ui,sans-serif'; ctx.textAlign = 'left';
            ctx.fillText('H' + (hi + 1), hR.x + 4, hR.y + 3);
            ctx.restore();
          });
        }
      }

      // Marcador del origen común (centroide hull CH)
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(CX, CY, 6, 0, 2 * Math.PI);
      ctx.fillStyle = '#ff6600'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = '#ff6600'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(CX - 16, CY); ctx.lineTo(CX + 16, CY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(CX, CY - 16); ctx.lineTo(CX, CY + 16); ctx.stroke();
      ctx.fillStyle = '#ff6600'; ctx.font = 'bold 7px system-ui,sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('CH', CX + 8, CY - 8);
    }

    // Dibujo inicial
    const layers = { hull: true, contorno: true, perf: true, hora: true, orient: false };
    drawCanvas(layers);

    const _morfPngBtn = document.getElementById('cmoExportarMorfologiaPNG');
    if (_morfPngBtn) {
      _morfPngBtn.onclick = () => _guardarPNGDesdeCanvas(canvas, 'morfologia', 'imagen_superposicion_hull');
    }

    const _morfRadialBtn = document.getElementById('cmoExportarMorfRadialCSV');
    if (_morfRadialBtn) {
      _morfRadialBtn.onclick = () => _exportTableElementToCSV(
        document.querySelector('#cmoMorfRadialTable table'),
        'morfologia',
        'tabla_metricas_radiales'
      );
    }

    const _morfDistBtn = document.getElementById('cmoExportarMorfDistCSV');
    if (_morfDistBtn) {
      _morfDistBtn.onclick = () => _exportTableElementToCSV(
        document.querySelector('#cmoMorfDistMatrix table'),
        'morfologia',
        'tabla_distancia_morfologica'
      );
    }

    // Layer toggles
    [['mlHull','hull'], ['mlContorno','contorno'], ['mlPerf','perf'], ['mlHora','hora'], ['mlOrient','orient']].forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => { layers[key] = el.checked; drawCanvas(layers); });
    });

    // ── Control de rotación manual ─────────────────────────────────────────
    (function iniciarControlRotacion() {
      const btnApply  = document.getElementById('cmoRotApply');
      const btnReset  = document.getElementById('cmoRotReset');
      const selObj    = document.getElementById('cmoRotObjSel');
      const inputAng  = document.getElementById('cmoRotAngle');
      const statusEl  = document.getElementById('cmoRotStatus');

      if (!btnApply || !selObj || !inputAng) return;

      function resolveOiList() {
        const v = selObj.value;
        if (v === '__all__') return objData.map(d => d.oi);
        const n = parseInt(v);
        return isNaN(n) ? [] : [n];
      }

      function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

      btnApply.addEventListener('click', () => {
        const ois = resolveOiList();
        const deg = parseFloat(inputAng.value) || 0;
        const rad = deg * Math.PI / 180;
        ois.forEach(oi => {
          if (rad === 0) manualRotations.delete(oi);
          else manualRotations.set(oi, rad);
        });
        drawCanvas(layers);
        setStatus(ois.length > 1 ? `${deg}° aplicado a todos` : `${deg}° aplicado`);
      });

      btnReset.addEventListener('click', () => {
        const ois = resolveOiList();
        ois.forEach(oi => { manualRotations.delete(oi); manualMirrors.delete(oi); });
        drawCanvas(layers);
        if (inputAng) inputAng.value = '0';
        updateMirrorBtn(resolveOiList());
        setStatus('');
      });

      // Botón reflejar: alterna el estado espejo del objeto seleccionado
      const btnMirror = document.getElementById('cmoRotMirror');

      function updateMirrorBtn(ois) {
        if (!btnMirror) return;
        const allMirrored = ois.length > 0 && ois.every(oi => manualMirrors.has(oi));
        btnMirror.style.background  = allMirrored ? '#5b21b6' : '#7c3aed';
        btnMirror.style.boxShadow   = allMirrored ? 'inset 0 0 0 2px #c4b5fd' : 'none';
        btnMirror.textContent       = allMirrored ? '⟺ Reflejado ✓' : '⟺ Reflejar eje mayor';
      }

      if (btnMirror) {
        btnMirror.addEventListener('click', () => {
          const ois = resolveOiList();
          const allMirrored = ois.every(oi => manualMirrors.has(oi));
          ois.forEach(oi => allMirrored ? manualMirrors.delete(oi) : manualMirrors.add(oi));
          drawCanvas(layers);
          updateMirrorBtn(ois);
          setStatus(allMirrored ? 'Reflejo desactivado' : 'Reflejo activado');
        });
      }

      // Al cambiar selección actualizar el ángulo mostrado con el que tenga ese objeto
      selObj.addEventListener('change', () => {
        if (selObj.value === '__all__') { setStatus(''); return; }
        const oi = parseInt(selObj.value);
        if (!isNaN(oi) && manualRotations.has(oi)) {
          inputAng.value = String(Math.round(manualRotations.get(oi) * 180 / Math.PI));
        } else {
          inputAng.value = '0';
        }
        updateMirrorBtn([oi]);
        setStatus('');
      });
    })();

    // ── Leyenda HTML ────────────────────────────────────────────────────────
    const legendEl = document.getElementById('cmoHullLegend');
    if (legendEl) {
      // Metadatos por objeto para toggle condicional de P/H
      const legMeta = objs.map((o, oi) => ({
        oi,
        col: PALETA[oi % PALETA.length],
        nPerf: (o.perforaciones || []).filter(p => Array.isArray(p.puntos) && p.puntos.length >= 3).length,
        nHora: (o.horadaciones  || []).filter(h => Array.isArray(h.puntos) && h.puntos.length >= 3).length,
        lbl: o.nombre + (o.cara !== 'Mono' ? ' · ' + o.cara : ''),
        hasHull: !!getHullBasis(o)
      })).filter(m => m.hasHull);

      const hasAnyPerf = legMeta.some(m => m.nPerf > 0);
      const hasAnyHora = legMeta.some(m => m.nHora > 0);

      // Cabecera con botones de columna
      const hdrPBtn = hasAnyPerf ? `<button class="cmo-legend-col-btn" data-col-layer="perf"  title="Encender/Apagar P en todos">P</button>` : `<span style="min-width:28px"></span>`;
      const hdrHBtn = hasAnyHora ? `<button class="cmo-legend-col-btn" data-col-layer="hora"  title="Encender/Apagar H en todos">H</button>` : `<span style="min-width:28px"></span>`;
      let html = `<div class="cmo-legend-hdr">
        <button class="cmo-legend-col-btn cmo-all-btn" id="cmoBtnToggleAll" title="Encender/Apagar todos">Todos</button>
        <span class="cmo-legend-hdr-label">Objeto</span>
        <button class="cmo-legend-col-btn" data-col-layer="hull"     title="Encender/Apagar CH en todos">CH</button>
        <button class="cmo-legend-col-btn" data-col-layer="contorno" title="Encender/Apagar PR en todos">PR</button>
        ${hdrPBtn}${hdrHBtn}
      </div>`;

      // Filas por objeto
      html += legMeta.map(({ oi, col, nPerf, nHora, lbl }) => {
        const chkP = nPerf > 0 ? `<label class="cmo-ov-chk" title="${nPerf} Perforación(es)"><input type="checkbox" class="cmo-ov-input" data-oi="${oi}" data-layer="perf" checked><span style="color:#1a56db">P</span></label>` : (hasAnyPerf ? `<span style="min-width:28px"></span>` : '');
        const chkH = nHora > 0 ? `<label class="cmo-ov-chk" title="${nHora} Horadación(es)"><input type="checkbox" class="cmo-ov-input" data-oi="${oi}" data-layer="hora" checked><span style="color:#057a55">H</span></label>` : (hasAnyHora ? `<span style="min-width:28px"></span>` : '');
        return `<div class="cmo-hull-legend-item">
          <button class="cmo-legend-row-btn" data-row-oi="${oi}" title="Encender/Apagar ${esc(lbl)}">◉</button>
          <span class="cmo-hull-legend-swatch" style="background:${col.stroke};"></span>
          <span class="cmo-hull-legend-name">${esc(lbl)}</span>
          <label class="cmo-ov-chk" title="Convex Hull"><input type="checkbox" class="cmo-ov-input" data-oi="${oi}" data-layer="hull" checked><span style="color:${col.stroke}">CH</span></label>
          <label class="cmo-ov-chk" title="Perímetro Real"><input type="checkbox" class="cmo-ov-input" data-oi="${oi}" data-layer="contorno" checked><span style="color:#718096">PR</span></label>
          ${chkP}${chkH}
        </div>`;
      }).join('');
      legendEl.innerHTML = html;

      // Actualiza estado visual de los botones de columna/fila según objVisibility
      function refreshLegendBtns() {
        const layers4 = ['hull','contorno','perf','hora'];
        // Botones de columna
        legendEl.querySelectorAll('.cmo-legend-col-btn[data-col-layer]').forEach(btn => {
          const layer = btn.dataset.colLayer;
          const relevant = legMeta.filter(m => layer === 'hull' || layer === 'contorno' || (layer === 'perf' && m.nPerf > 0) || (layer === 'hora' && m.nHora > 0));
          const onCount  = relevant.filter(m => objVisibility[m.oi][layer]).length;
          btn.classList.remove('cmo-col-off','cmo-col-partial');
          if (onCount === 0) btn.classList.add('cmo-col-off');
          else if (onCount < relevant.length) btn.classList.add('cmo-col-partial');
        });
        // Botón Todos
        const allBtn = legendEl.querySelector('#cmoBtnToggleAll');
        if (allBtn) {
          const total = legMeta.reduce((s,m) => s + layers4.filter(l => objVisibility[m.oi][l]).length, 0);
          const max   = legMeta.length * layers4.length;
          allBtn.classList.toggle('cmo-col-off', total === 0);
        }
        // Botones de fila
        legendEl.querySelectorAll('.cmo-legend-row-btn[data-row-oi]').forEach(btn => {
          const oi = parseInt(btn.dataset.rowOi);
          const anyOn = layers4.some(l => objVisibility[oi][l]);
          btn.classList.toggle('cmo-row-off', !anyOn);
        });
      }

      // Checkboxes individuales
      legendEl.querySelectorAll('.cmo-ov-input').forEach(chk => {
        chk.addEventListener('change', () => {
          const oi = parseInt(chk.dataset.oi);
          objVisibility[oi][chk.dataset.layer] = chk.checked;
          refreshLegendBtns();
          drawCanvas(layers);
        });
      });

      // Botones de columna (toggle todos los objetos para ese layer)
      legendEl.querySelectorAll('.cmo-legend-col-btn[data-col-layer]').forEach(btn => {
        btn.addEventListener('click', () => {
          const layer = btn.dataset.colLayer;
          const relevant = legMeta.filter(m => layer === 'hull' || layer === 'contorno' || (layer === 'perf' && m.nPerf > 0) || (layer === 'hora' && m.nHora > 0));
          const allOn = relevant.every(m => objVisibility[m.oi][layer]);
          const nextVal = !allOn;
          relevant.forEach(m => {
            objVisibility[m.oi][layer] = nextVal;
            const chk = legendEl.querySelector(`.cmo-ov-input[data-oi="${m.oi}"][data-layer="${layer}"]`);
            if (chk) chk.checked = nextVal;
          });
          refreshLegendBtns();
          drawCanvas(layers);
        });
      });

      // Botones de fila (toggle todos los layers de ese objeto)
      legendEl.querySelectorAll('.cmo-legend-row-btn[data-row-oi]').forEach(btn => {
        btn.addEventListener('click', () => {
          const oi = parseInt(btn.dataset.rowOi);
          const layers4 = ['hull','contorno','perf','hora'];
          const allOn = layers4.every(l => objVisibility[oi][l]);
          const nextVal = !allOn;
          layers4.forEach(l => {
            objVisibility[oi][l] = nextVal;
            const chk = legendEl.querySelector(`.cmo-ov-input[data-oi="${oi}"][data-layer="${l}"]`);
            if (chk) chk.checked = nextVal;
          });
          refreshLegendBtns();
          drawCanvas(layers);
        });
      });

      // Botón Todos
      const allBtn = legendEl.querySelector('#cmoBtnToggleAll');
      if (allBtn) {
        allBtn.addEventListener('click', () => {
          const layers4 = ['hull','contorno','perf','hora'];
          const totalOn = legMeta.reduce((s,m) => s + layers4.filter(l => objVisibility[m.oi][l]).length, 0);
          const nextVal = totalOn === 0 ? true : !(totalOn === legMeta.length * layers4.length);
          legMeta.forEach(m => {
            layers4.forEach(l => {
              objVisibility[m.oi][l] = nextVal;
              const chk = legendEl.querySelector(`.cmo-ov-input[data-oi="${m.oi}"][data-layer="${l}"]`);
              if (chk) chk.checked = nextVal;
            });
          });
          refreshLegendBtns();
          drawCanvas(layers);
        });
      }

      refreshLegendBtns();
    }

    // ── Tooltip hover ───────────────────────────────────────────────────────
    const tooltip = document.getElementById('cmoHullTooltip');
    if (canvas._morfMM) canvas.removeEventListener('mousemove', canvas._morfMM);
    if (canvas._morfML) canvas.removeEventListener('mouseleave', canvas._morfML);
    canvas._morfMM = e => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (W / rect.width);
      const my = (e.clientY - rect.top)  * (H / rect.height);
      let hit = null;
      for (let i = hitPaths.length - 1; i >= 0; i--) {
        if (ctx.isPointInPath(hitPaths[i].path, mx, my)) { hit = hitPaths[i]; break; }
      }
      if (hit) {
        const o   = hit.obj;
        const typeLbl = hit.type === 'hull' ? 'Convex Hull'
                      : hit.type === 'perf' ? 'Perforación'
                      : 'Horadación';
        const rmax = getValor(o, 'radio_max'),  rmin = getValor(o, 'radio_min');
        const reg  = getValor(o, 'regularidad_radial'), cv = getValor(o, 'cv_radial');
        const off  = getCentroideOffset(o);
        const nP   = (o.perforaciones || []).filter(p => Array.isArray(p.puntos) && p.puntos.length >= 3).length;
        const nH   = (o.horadaciones  || []).filter(h => Array.isArray(h.puntos) && h.puntos.length >= 3).length;
        tooltip.innerHTML =
          `<b style="color:${hit.col.stroke}">${esc(o.nombre)}</b>`
          + (o.cara !== 'Mono' ? ` <span style="opacity:.7">(${o.cara})</span>` : '')
          + ` <span style="opacity:.55;font-size:10px;">[${typeLbl}]</span><br>`
          + `R máx: <b>${rmax !== null ? rmax.toFixed(2)+' mm' : '—'}</b> &nbsp; R mín: <b>${rmin !== null ? rmin.toFixed(2)+' mm' : '—'}</b><br>`
          + (reg !== null ? `Regularidad: <b>${reg.toFixed(1)}%</b>  CV: <b>${cv !== null ? cv.toFixed(1)+'%' : '—'}</b><br>` : '')
          + (off !== null ? `Desp. centroide: <b>${off.toFixed(1)} px</b><br>` : '')
          + (nP || nH ? `P/H: <b>${nP}</b> perf · <b>${nH}</b> hora` : '');
        tooltip.style.display = 'block';
        tooltip.style.left    = (e.clientX + 14) + 'px';
        tooltip.style.top     = (e.clientY - 10) + 'px';
        canvas.style.cursor   = 'pointer';
      } else {
        tooltip.style.display = 'none'; canvas.style.cursor = 'crosshair';
      }
    };
    canvas._morfML = () => { tooltip.style.display = 'none'; };
    canvas.addEventListener('mousemove', canvas._morfMM);
    canvas.addEventListener('mouseleave', canvas._morfML);

    // ── TABLA: métricas radiales ────────────────────────────────────────────
    const radialKeys = [
      { key: 'radio_max',           label: 'R máx (mm)'         },
      { key: 'radio_min',           label: 'R mín (mm)'         },
      { key: 'radio_medio',         label: 'R medio (mm)'       },
      { key: 'regularidad_radial',  label: 'Regularidad (%)'    },
      { key: 'cv_radial',           label: 'CV radial (%)'      },
      { key: 'estrellamiento',      label: 'Estrellamiento IS'  },
      { key: 'lobularidad',         label: 'Lobularidad L'      },
      { key: 'solidity',            label: 'Solidez S'          },
      { key: 'convexity',           label: 'Convexidad V'       },
      { key: 'circularity',         label: 'Circularidad C'     },
    ];

    let tbl = '<table class="cmo-morf-table">';
    tbl += '<thead><tr><th class="cmo-morf-th-label">Métrica</th>';
    for (const o of objs) {
      const hasH = getHullBasis(o) !== null;
      tbl += `<th class="cmo-morf-th-obj">`
           + `<span class="cmo-morf-obj-name">${esc(o.nombre)}</span>`
           + (o.cara !== 'Mono' ? `<br><span class="cmo-morf-obj-cara">Cara ${o.cara}</span>` : '')
           + (!hasH ? '<br><span class="cmo-morf-obj-nohull">sin hull</span>' : '')
           + '</th>';
    }
    tbl += '</tr></thead><tbody>';

    // Fila: desplazamiento centroide hull → real
    tbl += '<tr class="cmo-morf-row-centroide"><th class="cmo-morf-row-label" style="color:#744210;font-weight:700;">⊕ Desp. centroide (px)</th>';
    for (const o of objs) {
      const v   = getCentroideOffset(o);
      const clr = v !== null ? (v < 5 ? '#276749' : v < 20 ? '#744210' : '#c53030') : '#a0aec0';
      tbl += `<td class="cmo-morf-cell" style="color:${clr};font-weight:700;">${v !== null ? v.toFixed(1) : '—'}</td>`;
    }
    tbl += '</tr>';

    // Filas: conteos P y H con contorno disponible
    const nPerfRow = objs.map(o => (o.perforaciones || []).filter(p => Array.isArray(p.puntos) && p.puntos.length >= 3).length);
    const nHoraRow = objs.map(o => (o.horadaciones  || []).filter(h => Array.isArray(h.puntos) && h.puntos.length >= 3).length);
    const maxP = Math.max(...nPerfRow), minP = Math.min(...nPerfRow);
    const maxH = Math.max(...nHoraRow), minH = Math.min(...nHoraRow);

    tbl += '<tr><td class="cmo-morf-row-label" style="color:#1a56db;">● Perforaciones (con contorno)</td>';
    for (const v of nPerfRow) {
      let cls = 'cmo-morf-cell';
      if (maxP > minP) { if (v === maxP) cls += ' cmo-morf-cell-max'; else if (v === minP) cls += ' cmo-morf-cell-min'; }
      tbl += `<td class="${cls}">${v}</td>`;
    }
    tbl += '</tr>';

    tbl += '<tr><td class="cmo-morf-row-label" style="color:#057a55;">● Horadaciones (con contorno)</td>';
    for (const v of nHoraRow) {
      let cls = 'cmo-morf-cell';
      if (maxH > minH) { if (v === maxH) cls += ' cmo-morf-cell-max'; else if (v === minH) cls += ' cmo-morf-cell-min'; }
      tbl += `<td class="${cls}">${v}</td>`;
    }
    tbl += '</tr>';

    for (const rk of radialKeys) {
      const vals = objs.map(o => { const v = getValor(o, rk.key); return typeof v === 'number' && isFinite(v) ? v : null; });
      const nums = vals.filter(v => v !== null);
      const vmax = nums.length > 1 ? Math.max(...nums) : null;
      const vmin = nums.length > 1 ? Math.min(...nums) : null;
      tbl += `<tr><td class="cmo-morf-row-label">${esc(rk.label)}</td>`;
      for (const v of vals) {
        let cls = 'cmo-morf-cell';
        if (v !== null && nums.length > 1) {
          if (v === vmax) cls += ' cmo-morf-cell-max';
          else if (v === vmin) cls += ' cmo-morf-cell-min';
        }
        tbl += `<td class="${cls}">${v !== null ? v.toFixed(3) : '<span class="cmo-morf-null">—</span>'}</td>`;
      }
      tbl += '</tr>';
    }
    tbl += '</tbody></table>';
    document.getElementById('cmoMorfRadialTable').innerHTML = tbl;

    // ── MATRIZ DE DISTANCIA MORFOLÓGICA ────────────────────────────────────
    if (conHull.length >= 2) {
      const profiles = conHull.map(o => resampleHull(getHullNorm(getHullBasis(o))));
      const morphDist = (p1, p2) => {
        let sum = 0; for (let i = 0; i < p1.length; i++) sum += Math.abs(p1[i] - p2[i]);
        return sum / p1.length;
      };
      let dMin = Infinity, dMax = 0;
      for (let i = 0; i < conHull.length; i++)
        for (let j = i + 1; j < conHull.length; j++) {
          const d = morphDist(profiles[i], profiles[j]);
          if (d < dMin) dMin = d; if (d > dMax) dMax = d;
        }
      const colorCell = d => {
        const t = dMax > dMin ? (d - dMin) / (dMax - dMin) : 0;
        if (t < 0.33)      return `rgba(72,187,120,${0.3 + t * 0.9})`;
        else if (t < 0.66) return `rgba(246,173,85,${0.3 + t * 0.5})`;
        else               return `rgba(252,129,129,${0.35 + t * 0.35})`;
      };
      const interp = d => {
        const t = dMax > dMin ? (d - dMin) / (dMax - dMin) : 0;
        return t < 0.33 ? 'muy similar' : t < 0.66 ? 'moderado' : 'diferente';
      };

      let mostSimilar = null, leastSimilar = null;
      let dm = '<table class="cmo-dist-table">';
      dm += '<thead><tr><th class="cmo-dist-th-corner"></th>';
      for (const o of conHull)
        dm += `<th class="cmo-dist-th-col">${esc(o.nombre)}<br><span class="cmo-dist-cara-lbl">${o.cara !== 'Mono' ? 'Cara '+o.cara : ''}</span></th>`;
      dm += '</tr></thead><tbody>';
      for (let i = 0; i < conHull.length; i++) {
        dm += `<tr><th class="cmo-dist-th-row">${esc(conHull[i].nombre)}<br><span class="cmo-dist-cara-lbl">${conHull[i].cara !== 'Mono' ? 'Cara '+conHull[i].cara : ''}</span></th>`;
        for (let j = 0; j < conHull.length; j++) {
          if (i === j) { dm += '<td class="cmo-dist-td-self">—</td>'; continue; }
          const d = morphDist(profiles[i], profiles[j]);
          if (i < j) {
            if (!mostSimilar  || d < mostSimilar.d)  mostSimilar  = { d, a: conHull[i], b: conHull[j] };
            if (!leastSimilar || d > leastSimilar.d) leastSimilar = { d, a: conHull[i], b: conHull[j] };
          }
          const gaugeW   = dMax > dMin ? Math.round(((d - dMin) / (dMax - dMin)) * 100) : 50;
          const gaugeCol = d <= dMin ? '#48bb78' : d >= dMax ? '#fc8181' : '#f6ad55';
          dm += `<td class="cmo-dist-td" style="background:${colorCell(d)};">
            <b class="cmo-dist-val">${d.toFixed(3)}</b>
            <div class="cmo-dist-gauge-wrap"><div class="cmo-dist-gauge-bar" style="width:${gaugeW}%;background:${gaugeCol};"></div></div>
            <div class="cmo-dist-label">${interp(d)}</div>
          </td>`;
        }
        dm += '</tr>';
      }
      dm += '</tbody></table>';
      dm += '<div style="margin-top:6px;font-size:9px;color:#a0aec0;display:flex;gap:10px;flex-wrap:wrap;">'
           + '<span style="color:#48bb78;">●</span> Muy similar &nbsp;'
           + '<span style="color:#ed8936;">●</span> Moderado &nbsp;'
           + '<span style="color:#fc8181;">●</span> Diferente &nbsp;&mdash;&nbsp;'
           + 'Métrica: diferencia media del perfil radial normalizado (36 ángulos).</div>';
      if (mostSimilar) {
        dm += `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
          <div class="cmo-dist-pair-card" style="border-color:#bbf7d0;">
            <span style="font-size:9px;font-weight:700;color:#276749;text-transform:uppercase;">Más similar</span><br>
            <b>${esc(mostSimilar.a.nombre)} × ${esc(mostSimilar.b.nombre)}</b><br>
            <span style="font-size:10px;color:#2d3748;">Δr̄ = ${mostSimilar.d.toFixed(4)}</span>
          </div>
          ${leastSimilar && leastSimilar.d !== mostSimilar.d ? `<div class="cmo-dist-pair-card" style="border-color:#fecdd3;">
            <span style="font-size:9px;font-weight:700;color:#c53030;text-transform:uppercase;">Más diferente</span><br>
            <b>${esc(leastSimilar.a.nombre)} × ${esc(leastSimilar.b.nombre)}</b><br>
            <span style="font-size:10px;color:#2d3748;">Δr̄ = ${leastSimilar.d.toFixed(4)}</span>
          </div>` : ''}
        </div>`;
      }
      document.getElementById('cmoMorfDistMatrix').innerHTML = dm;
    } else {
      document.getElementById('cmoMorfDistMatrix').innerHTML =
        '<span style="font-size:11px;color:#a0aec0;">Se necesitan ≥2 objetos con datos de hull.</span>';
    }
  }

  // ──── PCA ── Análisis de Componentes Principales ────────────────────────
  // ──── RENDERIZADO PYTHON: PCA ─────────────────────────────────────────────
  /**
   * Sustituye el gráfico PCA cuando el servidor Python devuelve resultados.
   * @param {Object} pyPCA  - Respuesta de /api/pca
   * @param {Array}  objs   - Objetos seleccionados (para etiquetas y colores)
   */
  function renderPCAFromPython(pyPCA, objs) {
    // Patrón «enriquecer, no reemplazar»: Python agrega validación sklearn al bloque
    // de diagnóstico existente sin tocar el canvas JS ni los controles interactivos.
    if (!pyPCA || !Array.isArray(pyPCA.scores)) return;
    const diagEl = document.querySelector('#cmoPCAContenido .cmo-pca-diag');
    if (!diagEl) return; // renderPCA no corrió o mostró mensaje de error — no hay nada que enriquecer

    const explained    = pyPCA.explained_variance || [];
    const sil          = typeof pyPCA.silhouette === 'number' ? pyPCA.silhouette : null;
    const outlierIdx   = Array.isArray(pyPCA.outliers) ? pyPCA.outliers : [];
    const nFeat        = pyPCA.n_features ?? '—';
    const nObj         = pyPCA.n_objects  ?? objs.length;
    const expl0        = explained[0] != null ? (explained[0] * 100).toFixed(1) : '—';
    const expl1        = explained[1] != null ? (explained[1] * 100).toFixed(1) : '—';
    const expl12       = (explained[0] != null && explained[1] != null)
      ? ((explained[0] + explained[1]) * 100).toFixed(1) : '—';
    const silCls       = sil === null ? '#718096'
      : sil >= 0.5 ? '#166534' : sil >= 0.25 ? '#854d0e' : '#9f1239';
    const outlierNames = outlierIdx
      .map(i => objs[i] ? esc(objs[i].nombre) : `Obj ${i+1}`).join(', ');

    // Quitar badge anterior si ya existía (re-comparación)
    const prev = diagEl.querySelector('.cmo-pca-py-badge');
    if (prev) prev.remove();

    const badge = document.createElement('div');
    badge.className = 'cmo-pca-py-badge';
    badge.style.cssText = 'margin:0 0 10px;padding:7px 12px;background:#f0f4ff;'
      + 'border:1px solid #c7d2fe;border-radius:6px;font-size:11px;color:#4a5568;line-height:1.6;';
    badge.innerHTML = `<span style="color:#6d28d9;font-weight:600">sklearn SVD</span>`
      + ` &nbsp;·&nbsp; PC1 <strong>${expl0}%</strong>`
      + ` &nbsp;·&nbsp; PC2 <strong>${expl1}%</strong>`
      + ` &nbsp;·&nbsp; PC1+PC2 <strong>${expl12}%</strong>`
      + (sil !== null
          ? ` &nbsp;·&nbsp; Silhouette <strong style="color:${silCls}">${sil.toFixed(3)}</strong>`
          : '')
      + ` &nbsp;<span style="color:#94a3b8">(${nFeat} métricas / ${nObj} objetos)</span>`
      + (outlierNames
          ? `<br><span style="color:#c05621">⚠ Outliers sklearn: ${outlierNames}</span>`
          : '');

    diagEl.insertBefore(badge, diagEl.firstChild);
  }

  // ──── RENDERIZADO PYTHON: ESTADÍSTICOS ───────────────────────────────────
  /**
   * Sustituye la tabla de estadísticos con los resultados del servidor Python.
   * @param {Object} pyStats  - Respuesta de /api/statistics
   * @param {Array}  objs     - Objetos seleccionados
   * @param {Array}  keys     - Claves de métricas seleccionadas
   */
  function renderEstadisticosFromPython(pyStats, objs, keys) {
    const contenedor = document.getElementById('cmoEstadisticosContenido');
    if (!contenedor || !pyStats || !pyStats.statistics) return;
    const stats = pyStats.statistics; // servidor devuelve 'statistics' con cv en 0-1

    let html = `<div style="font-size:11px;color:#64748b;margin-bottom:6px"><b>Estadísticos — Python/scipy</b></div>`
      + `<table class="cmo-tabla"><thead><tr>`
      + `<th>Métrica</th><th>Media</th><th>Mediana</th><th>Std</th><th>Min</th><th>Max</th><th>CV%</th></tr></thead><tbody>`;
    keys.forEach(k => {
      const s = stats[k];
      if (!s) return;
      const cv = typeof s.cv === 'number' ? s.cv * 100 : 0;  // servidor envía cv en 0-1, convertir a %
      const cvCls = cv < 15 ? 'cmo-cv-low' : cv < 35 ? 'cmo-cv-mid' : 'cmo-cv-high';
      const fmt = v => (typeof v === 'number' && isFinite(v)) ? v.toFixed(3) : '—';
      html += `<tr><td>${esc(KEY_LABEL[k] || k)}</td><td>${fmt(s.mean)}</td><td>${fmt(s.median)}</td>`
        + `<td>${fmt(s.std)}</td><td>${fmt(s.min)}</td><td>${fmt(s.max)}</td>`
        + `<td><span class="${cvCls}">${cv.toFixed(1)}%</span></td></tr>`;
    });
    html += `</tbody></table>`;
    contenedor.innerHTML = html;
  }

  function renderPCA(objs, keys) {
    const contenedor = document.getElementById('cmoPCAContenido');
    if (!contenedor) return;

    // ── Funciones matemáticas ─────────────────────────────────────────────
    function matMul(A, B) {
      const n = A.length, m = B[0].length, k = B.length;
      const C = Array.from({length: n}, () => new Array(m).fill(0));
      for (let i = 0; i < n; i++)
        for (let j = 0; j < m; j++)
          for (let p = 0; p < k; p++) C[i][j] += A[i][p] * B[p][j];
      return C;
    }
    function matT(A) {
      return A[0].map((_, j) => A.map(row => row[j]));
    }
    // Estandarización columna a columna (z-score)
    function standardize(data) {
      const n = data.length, p = data[0].length;
      const means = new Array(p).fill(0);
      const stds  = new Array(p).fill(0);
      for (let j = 0; j < p; j++) {
        let s = 0; for (let i = 0; i < n; i++) s += data[i][j];
        means[j] = s / n;
      }
      for (let j = 0; j < p; j++) {
        let s = 0; for (let i = 0; i < n; i++) s += (data[i][j] - means[j]) ** 2;
        stds[j] = Math.sqrt(s / (n - 1)) || 1;
      }
      return data.map(row => row.map((v, j) => (v - means[j]) / stds[j]));
    }
    // Matriz de correlación (= covarianza de datos estandarizados / (n-1))
    function corrMatrix(Z) {
      const n = Z.length, p = Z[0].length;
      const C = Array.from({length: p}, () => new Array(p).fill(0));
      for (let i = 0; i < p; i++)
        for (let j = i; j < p; j++) {
          let s = 0;
          for (let k = 0; k < n; k++) s += Z[k][i] * Z[k][j];
          C[i][j] = C[j][i] = s / (n - 1);
        }
      return C;
    }
    // Jacobi eigendecomposition de matriz simétrica p×p
    // Devuelve { values: [], vectors: [[]] } ordenados descendente
    function jacobiEigen(A) {
      const p = A.length;
      // Copia de A
      let M = A.map(r => [...r]);
      // V = identidad
      let V = Array.from({length: p}, (_, i) => Array.from({length: p}, (_, j) => i === j ? 1 : 0));
      const maxIter = 100 * p * p;
      for (let iter = 0; iter < maxIter; iter++) {
        // Elemento off-diagonal de mayor magnitud
        let maxVal = 0, pi = 0, qi = 1;
        for (let i = 0; i < p - 1; i++)
          for (let j = i + 1; j < p; j++)
            if (Math.abs(M[i][j]) > maxVal) { maxVal = Math.abs(M[i][j]); pi = i; qi = j; }
        if (maxVal < 1e-12) break;
        // Ángulo de rotación
        const Mpq = M[pi][qi];
        const theta = (M[qi][qi] - M[pi][pi]) / (2 * Mpq);
        const t = Math.sign(theta) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;
        // Aplicar rotación Givens
        const Mnew = M.map(r => [...r]);
        for (let r = 0; r < p; r++) {
          if (r !== pi && r !== qi) {
            Mnew[r][pi] = Mnew[pi][r] = c * M[r][pi] - s * M[r][qi];
            Mnew[r][qi] = Mnew[qi][r] = s * M[r][pi] + c * M[r][qi];
          }
        }
        Mnew[pi][pi] = c * c * M[pi][pi] - 2 * s * c * Mpq + s * s * M[qi][qi];
        Mnew[qi][qi] = s * s * M[pi][pi] + 2 * s * c * Mpq + c * c * M[qi][qi];
        Mnew[pi][qi] = Mnew[qi][pi] = 0;
        M = Mnew;
        const Vnew = V.map(r => [...r]);
        for (let r = 0; r < p; r++) {
          Vnew[r][pi] = c * V[r][pi] - s * V[r][qi];
          Vnew[r][qi] = s * V[r][pi] + c * V[r][qi];
        }
        V = Vnew;
      }
      // Extraer autovalores y autovectores
      const pairs = Array.from({length: p}, (_, i) => ({ val: M[i][i], vec: V.map(r => r[i]) }));
      pairs.sort((a, b) => b.val - a.val);
      return {
        values: pairs.map(p => p.val),
        vectors: pairs.map(p => p.vec), // vectores columna: vectors[comp][var]
      };
    }
    // K-means N-dimensional con inicialización k-means++
    // Opera sobre cualquier dimensión (scores completos, no solo 2D)
    function kMeans(pts, k, maxIter = 60) {
      if (k < 2 || pts.length < k) return pts.map(() => 0);
      const dim = pts[0].length;
      const dist2 = (a, b) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);
      // PRNG determinista (xorshift32) — mismos datos + k → mismos clusters
      let _seed = (pts.reduce((s, p, i) => s + Math.round(p[0]*1000)*31 + Math.round((p[1]||0)*1000)*17 + i, k * 12345)) >>> 0 || 1;
      const _rand = () => { _seed ^= _seed << 13; _seed ^= _seed >>> 17; _seed ^= _seed << 5; return (_seed >>> 0) / 0x100000000; };
      // k-means++ init (determinista)
      const centers = [pts[Math.floor(_rand() * pts.length)]];
      while (centers.length < k) {
        const dists = pts.map(p => Math.min(...centers.map(c => dist2(p, c))));
        const total = dists.reduce((a, b) => a + b, 0);
        let r = _rand() * total;
        for (let i = 0; i < pts.length; i++) {
          r -= dists[i]; if (r <= 0) { centers.push(pts[i]); break; }
        }
        if (centers.length < k) centers.push(pts[pts.length - 1]);
      }
      let labels = new Array(pts.length).fill(0);
      for (let iter = 0; iter < maxIter; iter++) {
        const newLabels = pts.map(p =>
          centers.reduce((best, c, ci) => {
            const d = dist2(p, c);
            return d < best.d ? { ci, d } : best;
          }, { ci: 0, d: Infinity }).ci
        );
        const sums = Array.from({length: k}, () => new Array(dim).fill(0));
        const cnts = new Array(k).fill(0);
        newLabels.forEach((l, i) => { pts[i].forEach((v, d) => { sums[l][d] += v; }); cnts[l]++; });
        centers.forEach((_, ci) => {
          if (cnts[ci] > 0) centers[ci] = sums[ci].map(v => v / cnts[ci]);
        });
        if (newLabels.every((l, i) => l === labels[i])) break;
        labels = newLabels;
      }
      return labels;
    }
    // Elipse de confianza (covarianza 2D → radios y ángulo)
    function ellipseParams(pts) {
      if (pts.length < 3) return null;
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      let sxx = 0, syy = 0, sxy = 0;
      pts.forEach(p => { sxx += (p[0]-cx)**2; syy += (p[1]-cy)**2; sxy += (p[0]-cx)*(p[1]-cy); });
      const n = pts.length - 1;
      sxx /= n; syy /= n; sxy /= n;
      const trace = sxx + syy;
      const det   = sxx * syy - sxy * sxy;
      const l1 = trace/2 + Math.sqrt(Math.max(0, (trace/2)**2 - det));
      const l2 = trace/2 - Math.sqrt(Math.max(0, (trace/2)**2 - det));
      const angle = sxy === 0 ? 0 : Math.atan2(l1 - sxx, sxy);
      const scale = 2.15; // ~90% CI bivariate normal: sqrt(chi2(2, 0.90)) ≈ 2.15
      return { cx, cy, rx: scale * Math.sqrt(Math.max(0, l1)), ry: scale * Math.sqrt(Math.max(0, l2)), angle };
    }
    // Silhouette score promedio — N-dimensional (usa todos los PCs disponibles)
    function silhouetteScore(pts, labels, k) {
      if (k < 2 || pts.length < 4) return null;
      const dist = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
      const s = pts.map((p, i) => {
        const myL  = labels[i];
        const same = pts.filter((_, j) => j !== i && labels[j] === myL);
        if (!same.length) return 0;
        const a = same.reduce((acc, q) => acc + dist(p, q), 0) / same.length;
        let b = Infinity;
        for (let ci = 0; ci < k; ci++) {
          if (ci === myL) continue;
          const other = pts.filter((_, j) => labels[j] === ci);
          if (!other.length) continue;
          const d = other.reduce((acc, q) => acc + dist(p, q), 0) / other.length;
          if (d < b) b = d;
        }
        if (!isFinite(b)) return 0;
        return (b - a) / Math.max(a, b);
      });
      return s.reduce((acc, v) => acc + v, 0) / s.length;
    }
    // Silhouette sweep — calcula silhouette para k=2..kMax y retorna el k óptimo
    function bestKBySilhouette(pts, kMax = 8) {
      const n = pts.length, kLim = Math.min(kMax, n - 1);
      if (kLim < 2) return { k: 2, scores: [] };
      const scores = [];
      for (let k = 2; k <= kLim; k++) {
        const labels = kMeans(pts, k);
        const sil = silhouetteScore(pts, labels, k) ?? -1;
        scores.push({ k, sil: +sil.toFixed(4) });
      }
      const best = scores.reduce((b, s) => s.sil > b.sil ? s : b, scores[0]);
      return { k: best.k, scores };
    }
    // Distancias de Mahalanobis al centroide global en el espacio completo de métricas
    // estandarizadas (Z). Más preciso que operar solo en PC1+PC2 para colecciones
    // donde componentes menores capturan varianza diagnóstica.
    function mahalanobisDistancesZ(Z) {
      const n = Z.length;
      if (n < 3 || !Z[0]?.length) return Z.map(() => 0);
      const p = Z[0].length;
      // Centroide
      const mu = Array.from({length: p}, (_, j) => Z.reduce((s, row) => s + row[j], 0) / n);
      // Varianza por dimensión (ddof=1) como aproximación diagonal de la covarianza
      // (la covarianza completa p×p es no invertible cuando n < p+1, situación frecuente
      //  en MAO con 20-40 métricas y 3-10 objetos → usamos la diagonal regularizada)
      const variances = Array.from({length: p}, (_, j) => {
        const v = Z.reduce((s, row) => s + (row[j] - mu[j]) ** 2, 0) / Math.max(n - 1, 1);
        return v > 1e-10 ? v : 1; // regularización: dimensiones constantes no penalizan
      });
      return Z.map(row =>
        Math.sqrt(row.reduce((s, z, j) => s + (z - mu[j]) ** 2 / variances[j], 0))
      );
    }

    // ── Paleta de clusters (diferente a PALETA de objetos) ─────────────────
    const CLUSTER_COLORS = [
      '#7c3aed','#059669','#dc2626','#d97706','#2563eb','#db2777',
    ];

    // ── Construcción de la matriz de datos ─────────────────────────────────
    // Solo métricas numéricas válidas en TODOS los objetos; excluir duplicados matemáticos
    const validKeys = keys.filter(k => {
      if (KEY_PCA_EXCLUDE.has(k)) return false;
      return objs.every(o => {
        const v = getValor(o, k);
        return v !== null && v !== undefined && isFinite(Number(v));
      });
    });

    if (validKeys.length < 2) {
      contenedor.innerHTML = '<p style="color:#e53e3e;font-size:12px;padding:10px;">' +
        'Se necesitan al menos 2 métricas numéricas válidas en todos los objetos seleccionados.</p>';
      return;
    }
    if (objs.length < 3) {
      contenedor.innerHTML = '<p style="color:#e53e3e;font-size:12px;padding:10px;">' +
        'Se necesitan al menos 3 objetos para el PCA.</p>';
      return;
    }

    // Matriz n×p
    const rawData = objs.map(o => validKeys.map(k => Number(getValor(o, k))));
    const Z = standardize(rawData);
    const C = corrMatrix(Z);
    const { values: eigenvals, vectors: eigenvecs } = jacobiEigen(C);

    // Varianza total = suma de autovalores (= p para matriz de correlación)
    const totalVar = eigenvals.reduce((s, v) => s + Math.max(0, v), 0) || 1;
    const varPct = eigenvals.map(v => Math.max(0, v) / totalVar * 100);

    // Scores: proyección Z sobre PC1, PC2 (eigenvecs[comp] = vector de pesos)
    const scores2D = Z.map(row =>
      [0, 1].map(ci => row.reduce((s, z, vi) => s + z * eigenvecs[ci][vi], 0))
    );

    // Scores N-dimensional para K-means y Silhouette (todos los PCs con varianza >0.5%)
    const _kPCs = eigenvals.reduce((cnt, v, i) => (v / totalVar * 100 > 0.5 ? cnt + 1 : cnt), 0);
    const _nKPCs = Math.max(2, Math.min(_kPCs, eigenvals.length));
    const scoresND = Z.map(row =>
      Array.from({length: _nKPCs}, (_, ci) => row.reduce((s, z, vi) => s + z * eigenvecs[ci][vi], 0))
    );

    // Loadings: eigenvecs[comp][var] × sqrt(eigenval) — hasta PC5
    const _nLoadings = Math.min(5, eigenvals.length, validKeys.length);
    const loadings = Array.from({length: _nLoadings}, (_, ci) =>
      validKeys.map((k, vi) => eigenvecs[ci][vi] * Math.sqrt(Math.max(0, eigenvals[ci])))
    );

    // ── k óptimo por silhouette sweep (k=2..8) ────────────────────────────
    const _sweep = bestKBySilhouette(scoresND, 8);
    const _bestK = _sweep.k;

    // ── Renderizado de la UI ───────────────────────────────────────────────
    // Leer controles (pueden existir si ya se renderizó antes)
    let kVal  = _bestK; // default: k óptimo por silhouette sweep
    let kAuto = true;   // true → modo automático (opción "auto" seleccionada)
    let showBiplot   = true;
    let showLabels   = true;
    {
      const kSel = document.getElementById('cmoPCAkSel');
      const bip  = document.getElementById('cmoPCABiplot');
      const lbl  = document.getElementById('cmoPCALabels');
      if (kSel) {
        kAuto = (kSel.value === 'auto');
        kVal  = kAuto ? _bestK : parseInt(kSel.value);
      }
      if (bip)  showBiplot  = bip.checked;
      if (lbl)  showLabels  = lbl.checked;
    }

    // K-means sobre espacio N-dimensional (todos los PCs con varianza >0.5%)
    const kLabels = kVal >= 2 ? kMeans(scoresND, kVal) : scoresND.map(() => -1);

    // ── Diágnóstico automático ─────────────────────────────────────────────
    // Mapa de cátegoría morfológica por clave
    const _CAT = {
      forma:   ['circularity','solidity','convexity','rectangularidad'],
      regular: ['regularidad_radial','cv_radial','symmetry_score'],
      elonga:  ['aspect_ratio','elongation','feret_ratio','anisotropy'],
      border:  ['rugosidad','icc','lobularidad','estrellamiento','energia_curvatura','curvatura_media'],
      size:    ['area','perimeter','ancho_mm','alto_mm','feret_max','feret_min','eje_mayor_mm','eje_menor_mm'],
      vertex:  ['num_vertices','angulo_medio','angulos_rectos','angulos_agudos','angulos_obtusos'],
    };
    const _CAT_LABEL = {
      forma:   { short: 'Estandarización formal',    desc: 'compacidad, solidez y convexidad' },
      regular: { short: 'Regularidad de producción', desc: 'simetría y uniformidad radial' },
      elonga:  { short: 'Alargamiento morfológico',  desc: 'elongación y proporción de ejes' },
      border:  { short: 'Complejidad del borde',     desc: 'rugosidad, lobularidad y curvatura' },
      size:    { short: 'Tamaño absoluto',           desc: 'dimensiones métricas del objeto' },
      vertex:  { short: 'Morfología poligonal',      desc: 'número y ángulo de vértices' },
    };
    function _axisType(loadVec) {
      const w = Object.fromEntries(Object.keys(_CAT).map(k => [k, 0]));
      loadVec.forEach((l, vi) => {
        const key = validKeys[vi], mag = Math.abs(l);
        for (const [cat, arr] of Object.entries(_CAT)) if (arr.includes(key)) w[cat] += mag;
      });
      const best = Object.entries(w).sort((a,b) => b[1]-a[1])[0][0];
      return _CAT_LABEL[best] || { short: 'Mixto', desc: 'sin categoría dominante clara' };
    }
    // Varianza PC1+PC2
    const varPC12 = varPct[0] + varPct[1];
    const _vSt = varPC12 >= 80 ? { badge:'Excelente',   kpiBg:'#f0fdf4', kpiCol:'#166534' }
               : varPC12 >= 70 ? { badge:'Buena',       kpiBg:'#eff6ff', kpiCol:'#1e40af' }
               : varPC12 >= 50 ? { badge:'Aceptable',   kpiBg:'#fefce8', kpiCol:'#854d0e' }
               :                 { badge:'Insuficiente', kpiBg:'#fff1f2', kpiCol:'#9f1239' };
    // Silhouette
    const _sil   = kVal >= 2 ? silhouetteScore(scoresND, kLabels, kVal) : null;
    const _silSt = _sil === null ? null
      : _sil >= 0.5  ? { col:'#276749', bg:'#c6f6d5', cls:'status-ok',   kpiBg:'#f0fdf4', kpiCol:'#166534', sub:'Bien definidos'  }
      : _sil >= 0.25 ? { col:'#744210', bg:'#fefcbf', cls:'status-warn', kpiBg:'#fefce8', kpiCol:'#854d0e', sub:'Separación mod.' }
      :                { col:'#742a2a', bg:'#fed7d7', cls:'status-bad',  kpiBg:'#fff1f2', kpiCol:'#9f1239', sub:'Solapados'       };
    // Outliers (Mahalanobis > umbral)
    const _mdists   = mahalanobisDistancesZ(Z);
    const _OL_THR   = 2.716; // sqrt(chi²(2, 0.975)) — percentil 97.5%, alineado con Python
    const _outliers = objs.filter((_, i) => _mdists[i] > _OL_THR);
    // Interpretación de ejes (hasta PC5)
    const _nPCs = Math.min(5, loadings.length);
    const _axAll = Array.from({length: _nPCs}, (_, i) => loadings[i] ? _axisType(loadings[i]) : null);
    const [_ax1, _ax2] = _axAll;
    // Variable de mayor peso combinado
    const _domIdx = validKeys.reduce((best, _, vi) => {
      const w = _axAll.reduce((s, _, pi) => s + (loadings[pi]?.[vi] ?? 0) ** 2, 0);
      return w > best.w ? { vi, w } : best;
    }, { vi: 0, w: -1 }).vi;
    const _domLabel = KEY_LABEL[validKeys[_domIdx]] || validKeys[_domIdx];
    // Varianza acumulada
    const _varAccum = varPct.slice(0, _nPCs).reduce((s, v) => s + v, 0);
    // Colores por PC
    const _pcColors  = ['#7c3aed','#3b82f6','#059669','#d97706','#db2777'];
    const _pcClasses = ['pc1','pc2','pc3','pc4','pc5'];
    // ── KPI cards
    const _kpiCards = `<div class="cmo-pca-diag-kpis">
      <div class="cmo-pca-diag-kpi" style="background:${_vSt.kpiBg};color:${_vSt.kpiCol};">
        <span class="cmo-pca-diag-kpi-label">Varianza PC1+PC2</span>
        <span class="cmo-pca-diag-kpi-val">${varPC12.toFixed(1)}%</span>
        <span class="cmo-pca-diag-kpi-sub">${_vSt.badge}</span>
      </div>
      ${_silSt ? `<div class="cmo-pca-diag-kpi" style="background:${_silSt.kpiBg};color:${_silSt.kpiCol};">
        <span class="cmo-pca-diag-kpi-label">Silhouette k=${kVal}${kAuto?' ★':''} (${_nKPCs}D)</span>
        <span class="cmo-pca-diag-kpi-val">${_sil.toFixed(2)}</span>
        <span class="cmo-pca-diag-kpi-sub">${_silSt.sub}</span>
      </div>` : `<div class="cmo-pca-diag-kpi" style="background:#f8fafc;color:#718096;">
        <span class="cmo-pca-diag-kpi-label">Silhouette</span>
        <span class="cmo-pca-diag-kpi-val" style="font-size:11px;">—</span>
        <span class="cmo-pca-diag-kpi-sub">Sin clusters</span>
      </div>`}
      <div class="cmo-pca-diag-kpi" style="background:${_varAccum>=80?'#f0fdf4':_varAccum>=60?'#eff6ff':'#fefce8'};color:${_varAccum>=80?'#166534':_varAccum>=60?'#1e40af':'#854d0e'};">
        <span class="cmo-pca-diag-kpi-label">Var. acum. PC1–PC${_nPCs}</span>
        <span class="cmo-pca-diag-kpi-val">${_varAccum.toFixed(1)}%</span>
        <span class="cmo-pca-diag-kpi-sub">${_varAccum>=80?'Excelente':_varAccum>=60?'Buena':'Parcial'}</span>
      </div>
    </div>`;
    // ── Filas de interpretación por PC
    const _pcRows = Array.from({length: _nPCs}, (_, i) => {
      const ax = _axAll[i]; if (!ax) return '';
      const residual = i >= 2 && varPct[i] < 8;
      const varBarW  = Math.max(2, (varPct[i] / (varPct[0] || 1)) * 100).toFixed(0);
      return `<div class="cmo-pca-diag-pc-row ${_pcClasses[i]}">
        <div class="cmo-pca-diag-pc-num" style="color:${_pcColors[i]};">PC${i+1}</div>
        <div class="cmo-pca-diag-pc-info">
          <div class="cmo-pca-diag-pc-name">${ax.short}${residual?' <span style="font-size:9px;font-weight:400;color:#a0aec0;">(residual)</span>':''}</div>
          <div class="cmo-pca-diag-pc-desc">${ax.desc} &nbsp;·&nbsp; <strong style="color:${_pcColors[i]}">${varPct[i].toFixed(1)}%</strong> varianza</div>
          <div class="cmo-pca-diag-pc-varbar"><div class="cmo-pca-diag-pc-varbar-fill" style="width:${varBarW}%;background:${_pcColors[i]};"></div></div>
        </div>
      </div>`;
    }).filter(Boolean).join('');
    // ── Fila de outliers
    const _outlierRow = _outliers.length > 0
      ? `<div class="cmo-pca-diag-row status-warn">
          <span class="cmo-pca-diag-icon">⚠️</span>
          <span>Outliers (&gt;${_OL_THR}σ):</span>
          <span style="color:#c05621;font-weight:700;">${_outliers.map(o => esc(o.nombre)).join(', ')}</span>
        </div>`
      : `<div class="cmo-pca-diag-row status-ok">
          <span class="cmo-pca-diag-icon">✅</span>
          <span>Sin outliers morfológicos:</span>
          <span style="color:#2f855a;font-size:10px;">todos los objetos dentro de ${_OL_THR}σ del centroide</span>
        </div>`;
    // ── Párrafo interpretativo final
    let _interpLine = '';
    if (varPC12 >= 50) {
      _interpLine = `La variable de mayor peso combinado es <strong>${_domLabel}</strong>.`;
      if (_sil !== null) {
        const _q = _sil >= 0.5 ? 'clara separación' : _sil >= 0.25 ? 'separación moderada' : 'solapamiento';
        _interpLine += ` Los ${kVal} grupos muestran <strong>${_q}</strong> en el espacio morfológico bidimensional.`;
      }
      if (_nPCs >= 3) {
        _interpLine += ` Los ${_nPCs} componentes analizados explican el <strong>${_varAccum.toFixed(1)}%</strong> de la varianza morfológica total.`;
      }
      if (_outliers.length === 1)
        _interpLine += ` <strong>${esc(_outliers[0].nombre)}</strong> se aleja significativamente del perfil colectivo — revisarlo como pieza atípica o de distinta adscripción.`;
      else if (_outliers.length > 1)
        _interpLine += ` ${_outliers.length} objetos se alejan del perfil colectivo (&gt;${_OL_THR}σ): ${_outliers.map(o => `<strong>${esc(o.nombre)}</strong>`).join(', ')}.`;
    }
    // ── Mini bar chart del silhouette sweep ─────────────────────────────
    const _maxSweepSil = Math.max(..._sweep.scores.map(s => s.sil), 0.01);
    const _sweepHTML = _sweep.scores.length > 0 ? (
      '<div class="cmo-pca-diag-sweep">'
      + '<div class="cmo-pca-diag-sweep-title">Silhouette sweep k=2..' + (1 + _sweep.scores.length)+ '<span style="float:right;font-weight:800;color:#7c3aed;">★ óptimo k=' + _bestK + '</span></div>'
      + '<div class="cmo-pca-diag-sweep-cols">'
      + _sweep.scores.map(({k, sil}) => {
          const barH = Math.max(3, Math.round((Math.max(0, sil) / _maxSweepSil) * 28));
          return '<div class="cmo-pca-diag-sweep-col' + (k === kVal ? ' best' : '') + '">'
            + '<div class="cmo-pca-diag-sweep-bar-wrap"><div class="cmo-pca-diag-sweep-bar" style="height:' + barH + 'px;"></div></div>'
            + '<div class="cmo-pca-diag-sweep-k">k' + k + '</div>'
            + '<div class="cmo-pca-diag-sweep-s">' + (sil >= 0 ? sil.toFixed(2) : '—') + '</div>'
            + '</div>';
        }).join('')
      + '</div></div>'
    ) : '';
    const diagHTML = `
      <div class="cmo-pca-diag">
        <div class="cmo-pca-diag-header">⚡ Diagnóstico automático</div>
        <div class="cmo-pca-diag-body">
          ${_kpiCards}
          ${_sweepHTML}
          <div class="cmo-pca-diag-pc-rows">${_pcRows}</div>
          ${_outlierRow}
          ${_interpLine ? `<div class="cmo-pca-diag-interp">💡 ${_interpLine}</div>` : ''}
        </div>
      </div>`;

    // ── HTML principal ────────────────────────────────────────────────────
    // Barra de controles
    const ctrlHTML = `
      <div class="cmo-pca-ctrl-row" style="margin-bottom:12px;">
        <label>Clusters k-means:
          <select id="cmoPCAkSel" class="cmo-pca-select">
            <option value="0"${!kAuto&&kVal===0?' selected':''}>Sin clusters</option>
            <option value="auto"${kAuto?' selected':''}>Auto ★ (k=${_bestK})</option>
            <option value="2"${!kAuto&&kVal===2?' selected':''}>2</option>
            <option value="3"${!kAuto&&kVal===3?' selected':''}>3</option>
            <option value="4"${!kAuto&&kVal===4?' selected':''}>4</option>
            <option value="5"${!kAuto&&kVal===5?' selected':''}>5</option>
            <option value="6"${!kAuto&&kVal===6?' selected':''}>6</option>
            <option value="7"${!kAuto&&kVal===7?' selected':''}>7</option>
            <option value="8"${!kAuto&&kVal===8?' selected':''}>8</option>
          </select>
        </label>
        <label style="display:flex;align-items:center;gap:4px;">
          <input type="checkbox" id="cmoPCABiplot"${showBiplot?' checked':''}> Biplot
        </label>
        <label style="display:flex;align-items:center;gap:4px;">
          <input type="checkbox" id="cmoPCALabels"${showLabels?' checked':''}> Etiquetas
        </label>
        <button class="cmo-pca-export-btn" id="cmoPCAexportBtn">Exportar CSV</button>
        <button class="cmo-pca-export-btn" id="cmoPCAexportPngBtn">Exportar PNG</button>
      </div>`;

    // Chips de varianza explicada (PC1..PC4)
    const varHTML = Array.from({length: Math.min(5, eigenvals.length)}, (_, i) => `
      <span class="cmo-pca-var-chip">
        PC${i+1}
        <span class="cmo-pca-var-bar"><span class="cmo-pca-var-bar-fill" style="width:${varPct[i].toFixed(1)}%"></span></span>
        ${varPct[i].toFixed(1)}%
      </span>`).join('');

    // Loadings panel (top por magnitud, paneles independientes PC1 y PC2)
    const ranked0 = [...validKeys.keys()].sort((a, b) => Math.abs(loadings[0][b]) - Math.abs(loadings[0][a]));
    const ranked1 = [...validKeys.keys()].sort((a, b) => Math.abs(loadings[1][b]) - Math.abs(loadings[1][a]));
    function loadingBarHTML(val) {
      const absVal = Math.abs(val);
      const pct = Math.min(100, absVal * 100 / 1.2).toFixed(0);
      const col = val >= 0 ? '#7c3aed' : '#f97316';
      return `<div class="cmo-pca-loading-bar-wrap"><div class="cmo-pca-loading-bar" style="width:${pct}%;background:${col}"></div></div>`;
    }
    function loadingTableSingle(ranked, pcIdx) {
      const PC_COLORS = ['#7c3aed','#3b82f6'];
      // normalizar barras al máximo del propio componente
      const maxAbs = Math.max(...ranked.map(vi => Math.abs(loadings[pcIdx][vi])), 0.01);
      return ranked.map(vi => {
        const val = loadings[pcIdx][vi];
        const pct = Math.min(100, (Math.abs(val) / maxAbs) * 100).toFixed(0);
        const barCol = val >= 0 ? PC_COLORS[pcIdx] : '#f97316';
        const valCol = val >= 0 ? PC_COLORS[pcIdx] : '#f97316';
        const sign = val >= 0 ? '+' : '';
        const lbl = (KEY_LABEL[validKeys[vi]] || validKeys[vi]).replace(/</g,'&lt;');
        return `<div class="cmo-pca-lp-item">
          <div class="cmo-pca-lp-lbl" title="${lbl}">${lbl}</div>
          <div class="cmo-pca-lp-bar-wrap"><div class="cmo-pca-lp-bar" style="width:${pct}%;background:${barCol}"></div></div>
          <span class="cmo-pca-lp-val" style="color:${valCol}">${sign}${val.toFixed(2)}</span>
        </div>`;
      }).join('');
    }
    function loadingTable(ranked) { return loadingTableSingle(ranked, 0); }

    // Cluster legend
    let clusterLegendHTML = '';
    if (kVal >= 2) {
      clusterLegendHTML = '<div class="cmo-pca-side-title">Clusters k-means</div>';
      for (let ci = 0; ci < kVal; ci++) {
        const members = objs.filter((_, i) => kLabels[i] === ci);
        const names = members.map(o => esc(o.nombre)).join(', ');
        clusterLegendHTML += `<div class="cmo-pca-cluster-row">
          <div class="cmo-pca-cluster-swatch" style="background:${CLUSTER_COLORS[ci % CLUSTER_COLORS.length]}"></div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;color:#2d3748;font-size:11px;">Cluster ${ci + 1} (${members.length})</div>
            <div style="color:#718096;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${names}">${names}</div>
          </div>
        </div>`;
      }
    }

    const _excludedKeys = keys.filter(k => !validKeys.includes(k));
    const _warnHTML = _excludedKeys.length > 0
      ? `<div style="background:#fffbeb;border:1px solid #f6ad55;border-radius:6px;padding:8px 12px;margin-bottom:8px;font-size:11px;color:#744210;"><strong>⚠ PCA calculado con ${validKeys.length} de ${keys.length} métricas seleccionadas.</strong> Las siguientes fueron excluidas por no tener valor numérico válido en todos los objetos: <span style="color:#c05621;">${_excludedKeys.map(k => KEY_LABEL[k]||k).join(', ')}</span></div>`
      : '';
    contenedor.innerHTML = _warnHTML + ctrlHTML + `
      <div class="cmo-pca-layout">
        <div class="cmo-pca-scatter-wrap">
          <div class="cmo-pca-variance" style="margin-bottom:8px;">${varHTML}</div>
          <canvas id="cmoPCACanvas" width="560" height="480" style="border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.08);display:block;cursor:crosshair;"></canvas>
          <div id="cmoPCATooltip" style="position:absolute;display:none;background:rgba(22,28,38,0.88);color:#fff;border-radius:6px;padding:6px 10px;font-size:11px;pointer-events:none;z-index:99;white-space:nowrap;"></div>
        </div>
        <div class="cmo-pca-side">
          <div class="cmo-pca-side-box">
            <div class="cmo-pca-side-title">Loadings (contribución por métrica)</div>
            <div style="display:grid;grid-template-columns:148px 1fr 40px;gap:5px;margin-bottom:6px;font-size:9px;color:#a0aec0;font-weight:700;">
              <span>Métrica</span><span></span><span style="text-align:right">valor</span>
            </div>
            <div style="font-size:10px;font-weight:700;color:#7c3aed;margin-bottom:5px;padding-bottom:3px;border-bottom:2px solid #ede9fe;display:flex;align-items:center;gap:6px;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#7c3aed;"></span>PC1 — ${varPct[0].toFixed(1)}% varianza
              <span style="margin-left:auto;font-size:9px;font-weight:400;color:#a0aec0;">${ranked0.length} métricas</span>
            </div>
            <div style="max-height:${Math.min(ranked0.length,9)*22+4}px;overflow-y:auto;padding-right:2px;">
            ${loadingTableSingle(ranked0, 0)}
            </div>
            <div style="font-size:10px;font-weight:700;color:#3b82f6;margin-top:10px;margin-bottom:5px;padding-bottom:3px;border-bottom:2px solid #dbeafe;display:flex;align-items:center;gap:6px;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#3b82f6;"></span>PC2 — ${varPct[1].toFixed(1)}% varianza
              <span style="margin-left:auto;font-size:9px;font-weight:400;color:#a0aec0;">${ranked1.length} métricas</span>
            </div>
            <div style="max-height:${Math.min(ranked1.length,9)*22+4}px;overflow-y:auto;padding-right:2px;">
            ${loadingTableSingle(ranked1, 1)}
            </div>
            <div style="margin-top:8px;padding-top:6px;border-top:1px solid #f0f4f8;font-size:9px;color:#a0aec0;display:flex;gap:12px;">
              <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#7c3aed;vertical-align:middle;margin-right:3px;"></span>positivo</span>
              <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#f97316;vertical-align:middle;margin-right:3px;"></span>negativo</span>
              <span style="margin-left:auto;">barras normalizadas al máx.</span>
            </div>
          </div>
          <div class="cmo-pca-side-box" id="cmoPCAClusterBox">
            ${clusterLegendHTML}
          </div>
        </div>
      </div>` + diagHTML;

    // ── Dibujar scatter ────────────────────────────────────────────────────
    const canvas  = document.getElementById('cmoPCACanvas');
    const ctx     = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const PAD = { top: 36, right: 30, bottom: 56, left: 60 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top  - PAD.bottom;

    // Rangos de datos
    const xs = scores2D.map(p => p[0]);
    const ys = scores2D.map(p => p[1]);
    let xMin = Math.min(...xs), xMax = Math.max(...xs);
    let yMin = Math.min(...ys), yMax = Math.max(...ys);
    // Ampliar si biplot
    if (showBiplot) {
      const lx = loadings[0], ly = loadings[1];
      const scale = Math.min(plotW, plotH) * 0.38;
      const lfactor = 1.8; // flechas en escala PCA
      const lxvals = lx.map(v => v * lfactor);
      const lyvals = ly.map(v => v * lfactor);
      xMin = Math.min(xMin, ...lxvals) - 0.3;
      xMax = Math.max(xMax, ...lxvals) + 0.3;
      yMin = Math.min(yMin, ...lyvals) - 0.3;
      yMax = Math.max(yMax, ...lyvals) + 0.3;
    }
    const marginRatio = 0.15;
    const dx = (xMax - xMin) * marginRatio;
    const dy = (yMax - yMin) * marginRatio;
    xMin -= dx; xMax += dx; yMin -= dy; yMax += dy;
    // Forzar simetría en 0
    const xAbs = Math.max(Math.abs(xMin), Math.abs(xMax));
    const yAbs = Math.max(Math.abs(yMin), Math.abs(yMax));
    xMin = -xAbs; xMax = xAbs; yMin = -yAbs; yMax = yAbs;

    function toCanvasX(v) { return PAD.left + (v - xMin) / (xMax - xMin) * plotW; }
    function toCanvasY(v) { return PAD.top  + (1 - (v - yMin) / (yMax - yMin)) * plotH; }

    // Fondo
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.fillRect(PAD.left, PAD.top, plotW, plotH);

    // Grid suave
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    const nGrid = 5;
    for (let i = 0; i <= nGrid; i++) {
      const gx = PAD.left + i * plotW / nGrid;
      const gy = PAD.top  + i * plotH / nGrid;
      ctx.beginPath(); ctx.moveTo(gx, PAD.top);    ctx.lineTo(gx, PAD.top + plotH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(PAD.left, gy);   ctx.lineTo(PAD.left + plotW, gy); ctx.stroke();
    }

    // Ejes cruzados en 0
    const cx0 = toCanvasX(0), cy0 = toCanvasY(0);
    ctx.strokeStyle = '#a0aec0'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(PAD.left, cy0); ctx.lineTo(PAD.left + plotW, cy0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx0, PAD.top);  ctx.lineTo(cx0, PAD.top + plotH); ctx.stroke();
    ctx.setLineDash([]);

    // Borde del área
    ctx.strokeStyle = '#cbd5e0'; ctx.lineWidth = 1;
    ctx.strokeRect(PAD.left, PAD.top, plotW, plotH);

    // Tick labels eje X
    ctx.fillStyle = '#718096'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    for (let i = 0; i <= nGrid; i++) {
      const v = xMin + i * (xMax - xMin) / nGrid;
      ctx.fillText(v.toFixed(1), PAD.left + i * plotW / nGrid, PAD.top + plotH + 14);
    }
    // Tick labels eje Y
    ctx.textAlign = 'right';
    for (let i = 0; i <= nGrid; i++) {
      const v = yMax - i * (yMax - yMin) / nGrid;
      ctx.fillText(v.toFixed(1), PAD.left - 6, PAD.top + i * plotH / nGrid + 4);
    }

    // Etiquetas de eje
    ctx.textAlign = 'center'; ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#4a5568';
    ctx.fillText(`PC1  (${varPct[0].toFixed(1)}%)`, PAD.left + plotW / 2, H - 10);
    ctx.save();
    ctx.translate(14, PAD.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`PC2  (${varPct[1].toFixed(1)}%)`, 0, 0);
    ctx.restore();

    // ── Elipses de cluster ─────────────────────────────────────────────────
    if (kVal >= 2) {
      for (let ci = 0; ci < kVal; ci++) {
        const pts = scores2D.filter((_, i) => kLabels[i] === ci);
        const ep = ellipseParams(pts);
        if (!ep) continue;
        ctx.save();
        ctx.translate(toCanvasX(ep.cx), toCanvasY(ep.cy));
        ctx.rotate(-ep.angle);
        const rx = (ep.rx / (xMax - xMin)) * plotW;
        const ry = (ep.ry / (yMax - yMin)) * plotH;
        const col = CLUSTER_COLORS[ci % CLUSTER_COLORS.length];
        ctx.beginPath();
        ctx.ellipse(0, 0, Math.max(6, rx), Math.max(6, ry), 0, 0, Math.PI * 2);
        ctx.fillStyle   = col + '22';
        ctx.strokeStyle = col + '88';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.fill(); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // ── Biplot (flechas de loadings) ───────────────────────────────────────
    if (showBiplot && validKeys.length <= 30) {
      const biplotScale = 1.8;
      // Solo las top-6 variables por magnitud combinada
      const topVars = [...validKeys.keys()]
        .map(vi => ({ vi, mag: Math.sqrt(loadings[0][vi]**2 + loadings[1][vi]**2) }))
        .sort((a, b) => b.mag - a.mag)
        .slice(0, 6);
      ctx.lineWidth = 1.5;
      topVars.forEach(({ vi, mag }) => {
        const lx = loadings[0][vi] * biplotScale;
        const ly = loadings[1][vi] * biplotScale;
        const ex = toCanvasX(lx), ey = toCanvasY(ly);
        const ox = toCanvasX(0),  oy = toCanvasY(0);
        const angle = Math.atan2(ey - oy, ex - ox);
        const arrowLen = 8;
        // Línea
        ctx.beginPath();
        ctx.moveTo(ox, oy); ctx.lineTo(ex, ey);
        ctx.strokeStyle = 'rgba(124,58,237,0.65)'; ctx.stroke();
        // Punta de flecha
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - arrowLen * Math.cos(angle - 0.35), ey - arrowLen * Math.sin(angle - 0.35));
        ctx.lineTo(ex - arrowLen * Math.cos(angle + 0.35), ey - arrowLen * Math.sin(angle + 0.35));
        ctx.closePath();
        ctx.fillStyle = 'rgba(124,58,237,0.75)'; ctx.fill();
        // Etiqueta
        const lbl = (KEY_LABEL[validKeys[vi]] || validKeys[vi]).split(' ')[0];
        ctx.fillStyle = '#5b21b6'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
        const offX = 10 * Math.cos(angle), offY = 10 * Math.sin(angle);
        ctx.fillText(lbl, ex + offX, ey + offY);
      });
    }

    // ── Puntos de objetos ─────────────────────────────────────────────────
    const hitAreas = [];
    scores2D.forEach(([sx, sy], i) => {
      const px = toCanvasX(sx), py = toCanvasY(sy);
      const col = kVal >= 2 ? CLUSTER_COLORS[kLabels[i] % CLUSTER_COLORS.length] : PALETA[i % PALETA.length].stroke;
      // Sombra suave
      ctx.shadowColor = 'rgba(0,0,0,0.15)';
      ctx.shadowBlur  = 4;
      // Círculo
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fillStyle   = col;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 2;
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      // Etiqueta
      if (showLabels) {
        const name = objs[i].nombre || `Obj ${i+1}`;
        const shortName = name.length > 12 ? name.slice(0, 11) + '…' : name;
        ctx.font = '9px sans-serif'; ctx.fillStyle = '#2d3748'; ctx.textAlign = 'center';
        ctx.fillText(shortName, px, py - 11);
      }
      hitAreas.push({ px, py, i });
    });

    // ── Tooltip al pasar el mouse ─────────────────────────────────────────
    const tooltip = document.getElementById('cmoPCATooltip');
    if (tooltip) {
      canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
        const my = (e.clientY - rect.top)  * (canvas.height / rect.height);
        let found = null;
        for (const h of hitAreas) {
          if ((mx - h.px)**2 + (my - h.py)**2 < 100) { found = h; break; }
        }
        if (found) {
          const o = objs[found.i];
          const [s1, s2] = scores2D[found.i];
          const clLabel = kVal >= 2 ? `\nCluster: ${kLabels[found.i] + 1}` : '';
          tooltip.textContent = `${o.nombre}${o.cara ? ' · ' + o.cara : ''}${clLabel}\nPC1: ${s1.toFixed(3)}   PC2: ${s2.toFixed(3)}`;
          tooltip.style.display = 'block';
          tooltip.style.whiteSpace = 'pre';
          tooltip.style.top  = (e.offsetY - 60) + 'px';
          tooltip.style.left = (e.offsetX + 12) + 'px';
        } else {
          tooltip.style.display = 'none';
        }
      };
      canvas.onmouseleave = () => { tooltip.style.display = 'none'; };
    }

    // ── Reconectar controles interactivos ─────────────────────────────────
    function reRender() { renderPCA(objs, keys); }
    const kSel = document.getElementById('cmoPCAkSel');
    const bip  = document.getElementById('cmoPCABiplot');
    const lbl2 = document.getElementById('cmoPCALabels');
    if (kSel) kSel.addEventListener('change', reRender);
    if (bip)  bip.addEventListener('change',  reRender);
    if (lbl2) lbl2.addEventListener('change',  reRender);

    // ── Exportar CSV de scores ─────────────────────────────────────────────
    const expBtn = document.getElementById('cmoPCAexportBtn');
    if (expBtn) {
      expBtn.onclick = () => {
        const header = ['Objeto','Cara','PC1','PC2',...validKeys.map((k,i) => `PC${i+1}_loading_${k}`)];
        const rows = objs.map((o, i) => {
          const [s1, s2] = scores2D[i];
          return [
            `"${o.nombre}"`,
            `"${o.cara||''}"`,
            s1.toFixed(6),
            s2.toFixed(6),
            ...validKeys.map((_, vi) => loadings[0][vi].toFixed(6)),
          ].join(',');
        });
        const csv  = '\uFEFF' + [header.join(','), ...rows].join('\n');
        _guardarCSV(_buildCMOExportFilename('pca', 'scores_componentes_principales', 'csv'), csv)
          .then(() => { if (typeof toast !== 'undefined') toast.success('CSV PCA exportado.'); });
      };
    }
    const expPngBtn = document.getElementById('cmoPCAexportPngBtn');
    if (expPngBtn) {
      expPngBtn.onclick = () => _guardarPNGDesdeCanvas(canvas, 'pca', 'grafico_pca');
    }
  }

  // ──── Helper descarga CSV (Electron + fallback navegador) ────────────────
  async function _guardarCSV(filename, csvContent) {
    return _guardarArchivo(filename, csvContent, 'csv', 'text/csv;charset=utf-8;');
  }

  // ──── EXPORTAR CSV ───────────────────────────────────────────────────────
  function exportarCSV() {
    const objs = _objetos.filter(o => _selIds.has(String(o.id)));
    if (!objs.length) { if (typeof toast !== 'undefined') toast.warning('Ningún objeto seleccionado.'); return; }
    const keys = _metrSel.length ? _metrSel : DEFAULT_KEYS;
    const filas = [['Metrica','Clave',...objs.map(o => o.nombre)].join(',')];
    for (const key of keys) {
      const label  = (KEY_LABEL[key]||key).replace(/,/g,';');
      const valores = objs.map(o => {
        const v = getValor(o, key);
        if (v===null||v===undefined) return '';
        const s = fmtValor(v);
        return s.includes(',') ? `"${s}"` : s;
      });
      filas.push([`"${label}"`, key, ...valores].join(','));
    }
    const csv  = '\uFEFF' + filas.join('\n'); // BOM para Excel
    _guardarCSV(_buildCMOExportFilename('tabla', 'tabla_comparativa', 'csv'), csv)
      .then(() => { if (typeof toast !== 'undefined') toast.success('CSV de comparación exportado.'); });
  }

  // ──── PESTAÑA EFA (Descriptores de Fourier Elípticos) ────────────────────
  function renderEFA(objs) {
    const tabBtn    = document.querySelector('.cmo-tab-btn[data-tab="efa"]');
    const contenedor = document.getElementById('cmoTabEFA');
    if (!contenedor) return;

    // Extraer _efa_data de cada objeto (guardado en obj.metricas._efa_data)
    const datos = objs.map(o => ({
      nombre: o.nombre,
      cara:   o.cara,
      efa:    o.metricas?._efa_data || null,
    }));

    const conEFA = datos.filter(d => d.efa && d.efa.status === 'ok');

    if (!conEFA.length) {
      if (tabBtn) { tabBtn.style.opacity = '0.4'; tabBtn.disabled = true; }
      contenedor.innerHTML = `<div style="padding:24px;text-align:center;color:#a0aec0;font-size:12px;">
        Ningún objeto de esta colección tiene datos EFA calculados.<br>
        El análisis EFA se ejecuta al hacer clic en «Descriptores de Fourier» en el panel de análisis individual.
      </div>`;
      return;
    }
    if (tabBtn) { tabBtn.style.opacity = ''; tabBtn.disabled = false; }

    const PALETTE = [
      '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
      '#06b6d4','#f97316','#84cc16','#ec4899','#6366f1',
    ];

    // ── 1. Tabla comparativa ──────────────────────────────────────────────────
    const thead = `<thead><tr style="background:#f7fafc;font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#718096;">
      <th style="padding:6px 10px;text-align:left;border-bottom:2px solid #e2e8f0;white-space:nowrap;">Objeto</th>
      <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e2e8f0;">Cara</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid #e2e8f0;" title="Armónicos totales calculados">Arm. totales</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid #e2e8f0;" title="Armónicos para capturar el 95% de la varianza de forma">h @ 95 %</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid #e2e8f0;" title="Armónicos para capturar el 99% de la varianza de forma">h @ 99 %</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid #e2e8f0;" title="Proporción de varianza capturada por el primer armónico (elipse base)">Var h1 (%)</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid #e2e8f0;" title="Puntos del contorno usados como entrada">Pts entrada</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid #e2e8f0;" title="Índice de complejidad: ratio h@99% / arm.totales (cuanto menor, más simple)">Complejidad</th>
    </tr></thead>`;

    const filas = conEFA.map((d, i) => {
      const e   = d.efa;
      const ps  = Array.isArray(e.power_spectrum) ? e.power_spectrum : [];
      const h1v = ps.length > 0 ? (ps[0] * 100).toFixed(1) : '—';
      const nT  = e.n_harmonics ?? '—';
      const h95 = e.harmonics_for_95pct ?? '—';
      const h99 = e.harmonics_for_99pct ?? '—';
      const nPts = e.n_points_input ?? '—';
      const complejidad = (typeof nT === 'number' && typeof h99 === 'number' && nT > 0)
        ? (h99 / nT).toFixed(2) : '—';
      const bg = i % 2 === 0 ? '#ffffff' : '#f9fafb';
      const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${PALETTE[i % PALETTE.length]};margin-right:5px;"></span>`;
      const caraLbl = d.cara && d.cara !== 'Mono' ? d.cara : '·';
      return `<tr style="background:${bg};font-size:11px;">
        <td style="padding:5px 10px;font-weight:600;">${dot}${esc(d.nombre)}</td>
        <td style="padding:5px 8px;text-align:center;"><span class="cmo-cara-badge cmo-cara-${caraLbl}">${esc(caraLbl)}</span></td>
        <td style="padding:5px 8px;text-align:center;">${nT}</td>
        <td style="padding:5px 8px;text-align:center;font-weight:700;color:#2b6cb0;">${h95}</td>
        <td style="padding:5px 8px;text-align:center;font-weight:700;color:#276749;">${h99}</td>
        <td style="padding:5px 8px;text-align:center;">${h1v}</td>
        <td style="padding:5px 8px;text-align:center;color:#718096;">${nPts}</td>
        <td style="padding:5px 8px;text-align:center;color:${complejidad !== '—' && parseFloat(complejidad) > 0.5 ? '#c05621' : '#276749'};">${complejidad}</td>
      </tr>`;
    });

    const tablaHtml = `<div style="overflow-x:auto;margin-bottom:18px;">
      <table style="width:100%;border-collapse:collapse;" id="cmoTablaEFA">
        ${thead}<tbody>${filas.join('')}</tbody>
      </table>
    </div>`;

    // ── 2. Gráfico de espectro de potencia acumulado ──────────────────────────
    const CHART_W = 580, CHART_H = 240;
    const PAD = { top: 18, right: 20, bottom: 44, left: 52 };
    const innerW = CHART_W - PAD.left - PAD.right;
    const innerH = CHART_H - PAD.top  - PAD.bottom;

    // Número máximo de armónicos a mostrar (cap 20 para legibilidad)
    const maxH = Math.min(20, Math.max(...conEFA.map(d =>
      Array.isArray(d.efa.power_spectrum) ? d.efa.power_spectrum.length : 0
    )));

    // Construir varianza acumulada normalizada para cada objeto
    const series = conEFA.map(d => {
      const ps = Array.isArray(d.efa.power_spectrum) ? d.efa.power_spectrum : [];
      const total = ps.reduce((s, v) => s + v, 0) || 1;
      let cum = 0;
      return Array.from({ length: maxH }, (_, i) => {
        cum += (ps[i] || 0);
        return cum / total * 100;
      });
    });

    // Escala X: 1…maxH; Y: 0…100%
    const xPos = h => PAD.left + (h / (maxH - 1 || 1)) * innerW;
    const yPos = v => PAD.top  + (1 - v / 100) * innerH;

    // Líneas por objeto
    const lineas = series.map((pts, i) => {
      const color = PALETTE[i % PALETTE.length];
      const d = pts.map((v, h) => `${h === 0 ? 'M' : 'L'}${xPos(h).toFixed(1)},${yPos(v).toFixed(1)}`).join(' ');
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
    });

    // Marcadores en h@95 y h@99 para cada objeto (líneas verticales tenues)
    const markers95 = conEFA.map((d, i) => {
      const h = d.efa.harmonics_for_95pct;
      if (!h || h > maxH) return '';
      const x = xPos(h - 1).toFixed(1);
      return `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + innerH}" stroke="${PALETTE[i % PALETTE.length]}" stroke-width="1" stroke-dasharray="3,3" opacity=".5"/>`;
    });

    // Líneas de referencia 95% y 99%
    const ref95y = yPos(95).toFixed(1);
    const ref99y = yPos(99).toFixed(1);
    const refs = `
      <line x1="${PAD.left}" y1="${ref95y}" x2="${PAD.left + innerW}" y2="${ref95y}" stroke="#3b82f6" stroke-width="1" stroke-dasharray="4,4" opacity=".6"/>
      <text x="${PAD.left - 4}" y="${parseFloat(ref95y) + 4}" text-anchor="end" font-size="9" fill="#3b82f6">95%</text>
      <line x1="${PAD.left}" y1="${ref99y}" x2="${PAD.left + innerW}" y2="${ref99y}" stroke="#10b981" stroke-width="1" stroke-dasharray="4,4" opacity=".6"/>
      <text x="${PAD.left - 4}" y="${parseFloat(ref99y) + 4}" text-anchor="end" font-size="9" fill="#10b981">99%</text>`;

    // Ejes
    const ejex = Array.from({ length: Math.min(maxH, 10) }, (_, i) => {
      const h = Math.round(i * (maxH - 1) / 9);
      const x = xPos(h).toFixed(1);
      return `<line x1="${x}" y1="${PAD.top + innerH}" x2="${x}" y2="${PAD.top + innerH + 4}" stroke="#cbd5e0" stroke-width="1"/>
              <text x="${x}" y="${PAD.top + innerH + 14}" text-anchor="middle" font-size="9" fill="#718096">h${h + 1}</text>`;
    }).join('');
    const ejey = [0, 25, 50, 75, 100].map(v => {
      const y = yPos(v).toFixed(1);
      return `<line x1="${PAD.left - 4}" y1="${y}" x2="${PAD.left + innerW}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>
              <text x="${PAD.left - 6}" y="${parseFloat(y) + 3}" text-anchor="end" font-size="9" fill="#718096">${v}</text>`;
    }).join('');

    // Leyenda (nombres de objetos)
    const leyenda = conEFA.map((d, i) => {
      const lbl = d.nombre + (d.cara && d.cara !== 'Mono' ? ` (${d.cara})` : '');
      return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;color:#4a5568;margin-right:10px;white-space:nowrap;">
        <span style="display:inline-block;width:14px;height:3px;border-radius:2px;background:${PALETTE[i % PALETTE.length]};"></span>${esc(lbl)}
      </span>`;
    }).join('');

    const svgChart = `<svg viewBox="0 0 ${CHART_W} ${CHART_H}" xmlns="http://www.w3.org/2000/svg"
        style="width:100%;max-width:${CHART_W}px;height:auto;display:block;margin:0 auto;">
      <!-- fondo -->
      <rect x="${PAD.left}" y="${PAD.top}" width="${innerW}" height="${innerH}" fill="#f8fafc" rx="3"/>
      <!-- rejilla Y -->
      ${ejey}
      <!-- referencias 95/99 -->
      ${refs}
      <!-- marcadores h@95 por objeto -->
      ${markers95.join('')}
      <!-- curvas -->
      ${lineas.join('')}
      <!-- eje X -->
      ${ejex}
      <!-- borde eje -->
      <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + innerH}" stroke="#cbd5e0" stroke-width="1"/>
      <line x1="${PAD.left}" y1="${PAD.top + innerH}" x2="${PAD.left + innerW}" y2="${PAD.top + innerH}" stroke="#cbd5e0" stroke-width="1"/>
      <!-- etiquetas ejes -->
      <text x="${PAD.left + innerW / 2}" y="${CHART_H - 4}" text-anchor="middle" font-size="10" fill="#718096">Armónico</text>
      <text x="11" y="${PAD.top + innerH / 2}" text-anchor="middle" font-size="10" fill="#718096"
            transform="rotate(-90,11,${PAD.top + innerH / 2})">Varianza acum. (%)</text>
    </svg>`;

    const graficoHtml = `<div style="margin-bottom:8px;">
      <div style="font-size:11px;font-weight:600;color:#4a5568;margin-bottom:6px;">Espectro de potencia acumulado</div>
      ${svgChart}
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;">${leyenda}</div>
    </div>`;

    // ── 3. Nota + CSV ──────────────────────────────────────────────────────────
    const notaHtml = `<div style="margin-top:14px;padding:10px 14px;background:#ebf8ff;border-left:3px solid #63b3ed;border-radius:0 6px 6px 0;font-size:11px;color:#2b6cb0;line-height:1.6;">
      <strong>Lectura:</strong>
      Cuanto antes alcanza una curva el 95 %, más simple es la forma del objeto.
      Un alto h@95 indica geometría irregular o dentada (lascas retocadas, núcleos).
      El índice de complejidad = h@99 / arm.totales: &lt; 0.35 simple, 0.35–0.60 moderado, &gt; 0.60 complejo.
      Las líneas discontinuas verticales marcan el armónico h@95 de cada objeto.
    </div>`;

    // Exportar CSV de coeficientes (todos los objetos con EFA)
    const btnCSVId = `cmoEFAExportCSV_${Date.now()}`;
    const btnCSV = `<button class="cmo-btn cmo-btn-ghost" id="${btnCSVId}"
        style="font-size:11px;padding:4px 10px;margin-top:10px;">
      &#128190; Exportar CSV de coeficientes EFA
    </button>`;

    // Aviso si hay objetos sin EFA
    const sinEFACount = datos.length - conEFA.length;
    const avisoHtml = sinEFACount > 0
      ? `<div style="padding:7px 12px;background:#fffbeb;border:1px solid #f6ad55;border-radius:6px;font-size:11px;color:#744210;margin-bottom:12px;">
          ⚠ ${sinEFACount} objeto(s) sin datos EFA — solo se muestran los ${conEFA.length} con EFA calculado.
         </div>` : '';

    const pane = contenedor.querySelector('p');
    const desc = pane ? pane.outerHTML : '';
    contenedor.innerHTML = desc + avisoHtml + tablaHtml + graficoHtml + notaHtml + btnCSV;

    // Cablear CSV de coeficientes
    const btnEl = document.getElementById(btnCSVId);
    if (btnEl) {
      btnEl.addEventListener('click', () => {
        const sep = ',';
        const q   = s => { const t = String(s ?? ''); return t.includes(sep) || t.includes('"') ? `"${t.replace(/"/g,'""')}"` : t; };
        // Encabezado: Objeto, Cara, Armónico, an, bn, cn, dn
        const rows = [];
        rows.push(['Objeto','Cara','Armonico','an','bn','cn','dn'].map(q).join(sep));
        conEFA.forEach(d => {
          const coeffs = Array.isArray(d.efa.coefficients) ? d.efa.coefficients : [];
          coeffs.forEach((c, i) => {
            const [an, bn, cn, dn] = Array.isArray(c) ? c : [c.an ?? '', c.bn ?? '', c.cn ?? '', c.dn ?? ''];
            rows.push([d.nombre, d.cara, i + 1, an, bn, cn, dn].map(q).join(sep));
          });
        });
        const csv = '﻿' + rows.join('\n');
        _guardarCSV(_buildCMOExportFilename('efa', 'coeficientes_efa', 'csv'), csv)
          .then(() => { if (typeof toast !== 'undefined') toast.success('CSV de coeficientes EFA exportado.'); });
      });
    }
  }

  // ──── PESTAÑA DE VERIFICACIÓN DE ERROR ──────────────────────────────────
  function renderErrorVerificacion(objs) {
    const tabBtn    = document.querySelector('.cmo-tab-btn[data-tab="errores"]');
    const contenedor = document.getElementById('cmoTabErrores');
    if (!contenedor) return;
    if (!objs.length) {
      if (tabBtn) { tabBtn.style.opacity = '0.4'; tabBtn.disabled = true; }
      return;
    }
    if (tabBtn) { tabBtn.style.opacity = ''; tabBtn.disabled = false; }

    // ── Helpers ──────────────────────────────────────────────────────────────
    const fNum  = (v, dec = 2) => (typeof v === 'number' && isFinite(v)) ? v.toFixed(dec) : '—';
    const fPct  = v  => (typeof v === 'number' && isFinite(v)) ? v.toFixed(2) + ' %' : '—';
    const NA    = '<span style="color:#a0aec0;">—</span>';

    // Nivel óptico → color/etiqueta
    function opticoCls(nivel) {
      if (!nivel || nivel === 'Sin datos') return { bg: '#f7fafc', fg: '#a0aec0', badge: 'Sin datos', dot: '⬜' };
      const n = nivel.toLowerCase();
      if (n.includes('alta') || n.includes('excelente')) return { bg: '#f0fff4', fg: '#276749', badge: nivel, dot: '🟢' };
      if (n.includes('media') || n.includes('buena'))    return { bg: '#fefce8', fg: '#854d0e', badge: nivel, dot: '🟡' };
      return { bg: '#fff5f5', fg: '#9b2c2c', badge: nivel, dot: '🔴' };
    }

    // Confianza de detección → color
    function detCls(score) {
      if (score == null || !isFinite(score)) return { bg: '#f7fafc', fg: '#a0aec0', dot: '⬜' };
      if (score >= 0.75) return { bg: '#f0fff4', fg: '#276749', dot: '🟢' };
      if (score >= 0.45) return { bg: '#fefce8', fg: '#854d0e', dot: '🟡' };
      return { bg: '#fff5f5', fg: '#9b2c2c', dot: '🔴' };
    }

    // Método de detección → etiqueta legible
    function metodoLabel(m) {
      if (!m) return '—';
      const t = m.toLowerCase();
      if (t.includes('ia') || t.includes('sam') || t.includes('mao_ia')) return 'IA / SAM';
      if (t.includes('manual_area') || t.includes('manual area'))        return 'Manual área';
      if (t.includes('manual'))                                            return 'Manual';
      if (t.includes('auto') || t.includes('zscan'))                      return 'Automático';
      return m;
    }

    // ── Por objeto: extraer campos de error ──────────────────────────────────
    const filas = objs.map(o => {
      const m = o.metricas || {};
      return {
        nombre:            o.nombre,
        cara:              o.cara,
        fecha:             o.fecha,
        // Error óptico posicional
        errorLineal:       parseFloat(m.error_optico_lineal_percent),
        errorArea:         parseFloat(m.error_optico_area_percent),
        confianzaOptica:   m.confianza_optica   || 'Sin datos',
        notaOptica:        m.nota_error_optico  || '',
        // Incertidumbre propagada en métricas absolutas clave
        incertArea:        parseFloat(m.area_incertidumbre_abs),
        incertPerim:       parseFloat(m.perimeter_incertidumbre_abs),
        incertEjeMayor:    parseFloat(m.eje_mayor_incertidumbre_abs),
        incertFeretMax:    parseFloat(m.feret_max_incertidumbre_abs),
        // Valores nominales para contexto
        area:              parseFloat(m.area),
        perimeter:         parseFloat(m.perimeter),
        // Confianza de detección
        detScore:          parseFloat(m.detection_confidence),
        detLevel:          m.detection_confidence_level || null,
        detMethod:         m.detection_method || null,
        // Flag de incertidumbre aplicada
        incertAplicada:    !!m._incertidumbre_optica_aplicada,
      };
    });

    // ── Estadísticos colectivos ───────────────────────────────────────────────
    const conOptica  = filas.filter(f => isFinite(f.errorLineal));
    const sinOptica  = filas.filter(f => !isFinite(f.errorLineal));
    const mediaErr   = conOptica.length
      ? conOptica.reduce((s, f) => s + f.errorLineal, 0) / conOptica.length : null;
    const maxErr     = conOptica.length
      ? Math.max(...conOptica.map(f => f.errorLineal)) : null;
    const conDet     = filas.filter(f => isFinite(f.detScore));
    const mediaDet   = conDet.length
      ? conDet.reduce((s, f) => s + f.detScore, 0) / conDet.length : null;

    // ── Resumen colectivo ─────────────────────────────────────────────────────
    const resumenHtml = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
        <div style="background:#f7fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 16px;min-width:140px;">
          <div style="font-size:10px;color:#718096;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Error óptico medio</div>
          <div style="font-size:20px;font-weight:700;color:${mediaErr != null && mediaErr > 3 ? '#c05621' : '#276749'};">
            ${mediaErr != null ? mediaErr.toFixed(2) + ' %' : '—'}
          </div>
          <div style="font-size:10px;color:#a0aec0;">${conOptica.length}/${filas.length} con datos</div>
        </div>
        <div style="background:#f7fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 16px;min-width:140px;">
          <div style="font-size:10px;color:#718096;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Error óptico máx.</div>
          <div style="font-size:20px;font-weight:700;color:${maxErr != null && maxErr > 5 ? '#c05621' : '#276749'};">
            ${maxErr != null ? maxErr.toFixed(2) + ' %' : '—'}
          </div>
          <div style="font-size:10px;color:#a0aec0;">lineal posicional</div>
        </div>
        <div style="background:#f7fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 16px;min-width:140px;">
          <div style="font-size:10px;color:#718096;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Confianza detección media</div>
          <div style="font-size:20px;font-weight:700;color:${mediaDet != null && mediaDet < 0.5 ? '#c05621' : '#276749'};">
            ${mediaDet != null ? (mediaDet * 100).toFixed(1) + ' %' : '—'}
          </div>
          <div style="font-size:10px;color:#a0aec0;">${conDet.length}/${filas.length} con datos</div>
        </div>
        ${sinOptica.length > 0 ? `
        <div style="background:#fffbeb;border:1px solid #f6ad55;border-radius:6px;padding:10px 16px;min-width:180px;max-width:320px;">
          <div style="font-size:10px;color:#854d0e;font-weight:600;margin-bottom:4px;">⚠ Sin error óptico</div>
          <div style="font-size:11px;color:#744210;">${sinOptica.map(f => esc(f.nombre)).join(', ')} — parámetros de cámara no disponibles al momento del análisis.</div>
        </div>` : ''}
      </div>`;

    // ── Tabla por objeto ───────────────────────────────────────────────────────
    const thead = `<thead><tr style="background:#f7fafc;font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#718096;">
      <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e2e8f0;white-space:nowrap;">Objeto</th>
      <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e2e8f0;">Cara</th>
      <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e2e8f0;">Fecha</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid #e2e8f0;" title="Error óptico posicional lineal">Err. óptico lineal</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid #e2e8f0;" title="Error óptico posicional en área">Err. óptico área</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid #e2e8f0;">Confianza óptica</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid #e2e8f0;" title="Incertidumbre absoluta en área (±mm²)">±Área (mm²)</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid #e2e8f0;" title="Incertidumbre absoluta en perímetro (±mm)">±Perímetro (mm)</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid #e2e8f0;" title="Incertidumbre absoluta en eje mayor (±mm)">±Eje mayor (mm)</th>
      <th style="padding:6px 8px;text-align:center;border-bottom:2px solid #e2e8f0;" title="Confianza de detección automática (score 0–1)">Conf. detección</th>
      <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e2e8f0;">Método detección</th>
    </tr></thead>`;

    const tbody = filas.map((f, i) => {
      const oc  = opticoCls(f.confianzaOptica);
      const dc  = detCls(f.detScore);
      const row = i % 2 === 0 ? '#ffffff' : '#f9fafb';
      const caraLbl = f.cara && f.cara !== 'Mono' ? f.cara : '·';

      // Incertidumbre relativa de área para contexto (%)
      const incertAreaPct = isFinite(f.incertArea) && isFinite(f.area) && f.area > 0
        ? ` <span style="color:#a0aec0;font-size:9px;">(${(f.incertArea / f.area * 100).toFixed(1)}%)</span>` : '';
      const incertPerimPct = isFinite(f.incertPerim) && isFinite(f.perimeter) && f.perimeter > 0
        ? ` <span style="color:#a0aec0;font-size:9px;">(${(f.incertPerim / f.perimeter * 100).toFixed(1)}%)</span>` : '';

      const notaTitle = f.notaOptica ? ` title="${esc(f.notaOptica)}"` : '';

      return `<tr style="background:${row};font-size:11px;">
        <td style="padding:5px 8px;font-weight:600;white-space:nowrap;">${esc(f.nombre)}</td>
        <td style="padding:5px 8px;text-align:center;">
          <span class="cmo-cara-badge cmo-cara-${caraLbl}">${esc(caraLbl)}</span>
        </td>
        <td style="padding:5px 8px;color:#718096;white-space:nowrap;">${esc(f.fecha)}</td>
        <td style="padding:5px 8px;text-align:center;"${notaTitle}>
          ${isFinite(f.errorLineal) ? `<span style="font-weight:700;color:${f.errorLineal > 3 ? '#c05621' : '#276749'};">${fPct(f.errorLineal)}</span>` : NA}
        </td>
        <td style="padding:5px 8px;text-align:center;">
          ${isFinite(f.errorArea) ? `<span style="font-weight:700;color:${f.errorArea > 6 ? '#c05621' : '#276749'};">${fPct(f.errorArea)}</span>` : NA}
        </td>
        <td style="padding:5px 8px;text-align:center;">
          <span style="display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;
            background:${oc.bg};color:${oc.fg};">${oc.dot} ${esc(oc.badge)}</span>
        </td>
        <td style="padding:5px 8px;text-align:center;">
          ${isFinite(f.incertArea) ? `±${fNum(f.incertArea, 3)}${incertAreaPct}` : NA}
        </td>
        <td style="padding:5px 8px;text-align:center;">
          ${isFinite(f.incertPerim) ? `±${fNum(f.incertPerim, 3)}${incertPerimPct}` : NA}
        </td>
        <td style="padding:5px 8px;text-align:center;">
          ${isFinite(f.incertEjeMayor) ? `±${fNum(f.incertEjeMayor, 3)}` : NA}
        </td>
        <td style="padding:5px 8px;text-align:center;">
          ${isFinite(f.detScore)
            ? `<span style="font-weight:700;color:${dc.fg};">${dc.dot} ${(f.detScore * 100).toFixed(1)} %</span>`
            : NA}
        </td>
        <td style="padding:5px 8px;color:#4a5568;">${esc(metodoLabel(f.detMethod))}</td>
      </tr>`;
    }).join('');

    const tabla = `<div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:11px;" id="cmoTablaErrores">
        ${thead}<tbody>${tbody}</tbody>
      </table>
    </div>`;

    // ── Nota metodológica ─────────────────────────────────────────────────────
    const notaHtml = `<div style="margin-top:14px;padding:10px 14px;background:#ebf8ff;border-left:3px solid #63b3ed;border-radius:0 6px 6px 0;font-size:11px;color:#2b6cb0;line-height:1.6;">
      <strong>Nota metodológica:</strong>
      El error óptico posicional es función de la distancia del objeto al centro óptico (efecto de distorsión radial).
      Un error lineal &lt; 1 % es despreciable; entre 1–3 % es aceptable; &gt; 3 % requiere cautela en métricas absolutas.
      La incertidumbre en área ≈ 2 × error lineal por propagación cuadrática.
      La confianza de detección refleja la calidad del contorno extraído (0 = sin datos, 1 = máxima).
    </div>`;

    // ── Exportar CSV ───────────────────────────────────────────────────────────
    const btnCSV = `<button class="cmo-btn cmo-btn-ghost" id="cmoErroresExportCSV"
        style="font-size:11px;padding:4px 10px;margin-top:10px;">
      &#128190; Exportar CSV de errores
    </button>`;

    contenedor.innerHTML = resumenHtml + tabla + notaHtml + btnCSV;

    // Cablear exportar CSV
    const btnEl = document.getElementById('cmoErroresExportCSV');
    if (btnEl) {
      btnEl.addEventListener('click', () => {
        const sep = ',';
        const q   = s => { const t = String(s ?? ''); return t.includes(sep) || t.includes('"') ? `"${t.replace(/"/g,'""')}"` : t; };
        const header = ['Objeto','Cara','Fecha','Error óptico lineal (%)','Error óptico área (%)','Confianza óptica',
          '±Área (mm²)','±Perímetro (mm)','±Eje mayor (mm)','Confianza detección (0-1)','Método detección'].map(q).join(sep);
        const rows = filas.map(f => [
          f.nombre, f.cara, f.fecha,
          isFinite(f.errorLineal)  ? f.errorLineal.toFixed(4)  : '',
          isFinite(f.errorArea)    ? f.errorArea.toFixed(4)    : '',
          f.confianzaOptica,
          isFinite(f.incertArea)   ? f.incertArea.toFixed(4)   : '',
          isFinite(f.incertPerim)  ? f.incertPerim.toFixed(4)  : '',
          isFinite(f.incertEjeMayor) ? f.incertEjeMayor.toFixed(4) : '',
          isFinite(f.detScore)     ? f.detScore.toFixed(4)     : '',
          metodoLabel(f.detMethod),
        ].map(q).join(sep));
        const csv = '﻿' + [header, ...rows].join('\n');
        _guardarCSV(_buildCMOExportFilename('errores', 'verificacion_error', 'csv'), csv)
          .then(() => { if (typeof toast !== 'undefined') toast.success('CSV de verificación de errores exportado.'); });
      });
    }
  }

  // ──── DENDROGRAMA (Ward linkage, distancia euclídea) ─────────────────────
  function renderDendrograma(objs, keys) {
    const tabBtn = document.querySelector('.cmo-tab-btn[data-tab="dendrograma"]');
    const contenedor = document.getElementById('cmoDendrogramaContenido');
    if (!contenedor) return;

    // Métricas numéricas válidas en todos los objetos (mismo filtro que PCA)
    const vKeys = keys.filter(k =>
      !KEY_PCA_EXCLUDE.has(k) &&
      objs.every(o => { const v = getValor(o, k); return v !== null && v !== undefined && isFinite(Number(v)); })
    );
    if (vKeys.length < 1 || objs.length < 2) {
      if (tabBtn) { tabBtn.style.opacity = '0.4'; tabBtn.disabled = true; }
      contenedor.innerHTML = '<p style="color:#a0aec0;font-size:12px;padding:12px;">Se necesitan al menos 2 objetos y 1 métrica numérica.</p>';
      return;
    }
    if (tabBtn) { tabBtn.style.opacity = ''; tabBtn.disabled = false; }

    const n = objs.length;

    // Estandarizar (z-score, ddof=1)
    const Z = (() => {
      const raw = objs.map(o => vKeys.map(k => Number(getValor(o, k))));
      return raw.map(row =>
        row.map((v, j) => {
          const col = raw.map(r => r[j]);
          const mu  = col.reduce((a, b) => a + b, 0) / n;
          const sd  = Math.sqrt(col.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(n - 1, 1)) || 1;
          return (v - mu) / sd;
        })
      );
    })();

    // Distancia euclídea entre dos vectores
    const dist = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));

    // Matriz de distancias inicial n×n
    const D = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => dist(Z[i], Z[j])));

    // Ward linkage aglomerativo
    // Cada clúster almacena: { members: [idx...], centroid: [...], height: número }
    let clusters = objs.map((_, i) => ({ members: [i], centroid: [...Z[i]], height: 0 }));
    const merges = []; // [{left, right, height, size}]

    while (clusters.length > 1) {
      // Encontrar el par de menor distancia de Ward
      let minD = Infinity, mi = 0, mj = 1;
      for (let a = 0; a < clusters.length; a++) {
        for (let b = a + 1; b < clusters.length; b++) {
          const na = clusters[a].members.length, nb = clusters[b].members.length;
          // Distancia de Ward: incremento de inercia intra-grupo al fusionar
          const dab = dist(clusters[a].centroid, clusters[b].centroid);
          const ward = (na * nb) / (na + nb) * dab * dab;
          if (ward < minD) { minD = ward; mi = a; mj = b; }
        }
      }
      const ca = clusters[mi], cb = clusters[mj];
      const na = ca.members.length, nb = cb.members.length;
      const newMembers = [...ca.members, ...cb.members];
      const newCentroid = ca.centroid.map((v, i) => (v * na + cb.centroid[i] * nb) / (na + nb));
      const height = Math.sqrt(minD); // raíz → escala en distancia euclídea
      merges.push({ left: ca, right: cb, height, size: newMembers.length });
      clusters.splice(mj, 1);
      clusters.splice(mi, 1);
      clusters.push({ members: newMembers, centroid: newCentroid, height });
    }

    // ── Render en canvas ──────────────────────────────────────────────────────
    const LEAF_W  = Math.max(60, Math.min(100, Math.floor(680 / n)));
    const W       = n * LEAF_W + 60;
    const H       = 320;
    const PAD_L   = 50, PAD_R = 20, PAD_T = 20, PAD_B = 60;
    const plotW   = W - PAD_L - PAD_R;
    const plotH   = H - PAD_T - PAD_B;

    const maxH    = merges.length ? merges[merges.length - 1].height : 1;
    const yScale  = v => PAD_T + plotH * (1 - v / (maxH * 1.05));
    const PALETA  = ['#6366f1','#059669','#dc2626','#d97706','#0891b2','#db2777','#7c3aed','#65a30d'];

    // Asignar posición X a cada hoja en el orden de fusión
    const leafOrder = [];
    (function extractOrder(node) {
      if (!node) return;
      if (!node.left && !node.right) {
        // hoja raíz (caso n=2 sin sub-nodos)
        node.members.forEach(i => { if (!leafOrder.includes(i)) leafOrder.push(i); });
        return;
      }
      const walkLeft  = m => { if (m.left || m.right) { walkLeft(m.left); walkLeft(m.right); } else { m.members.forEach(i => { if (!leafOrder.includes(i)) leafOrder.push(i); }); } };
      const walkRight = m => { if (m.left || m.right) { walkLeft(m.left); walkLeft(m.right); } else { m.members.forEach(i => { if (!leafOrder.includes(i)) leafOrder.push(i); }); } };
      (function walk(m) {
        if (!m) return;
        if (!m.left && !m.right) { m.members.forEach(i => { if (!leafOrder.includes(i)) leafOrder.push(i); }); return; }
        walk(m.left); walk(m.right);
      })(node);
    })(clusters[0]);
    // Completar con hojas no asignadas (por si acaso)
    objs.forEach((_, i) => { if (!leafOrder.includes(i)) leafOrder.push(i); });

    const xPos = i => PAD_L + (leafOrder.indexOf(i) + 0.5) * (plotW / n);

    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    canvas.style.cssText = 'max-width:100%;display:block;margin:0 auto;';
    const ctx = canvas.getContext('2d');

    // Fondo
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // Eje Y — altura
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    const yTicks = 5;
    ctx.font = '9px system-ui,sans-serif';
    ctx.fillStyle = '#a0aec0';
    ctx.textAlign = 'right';
    for (let t = 0; t <= yTicks; t++) {
      const val = maxH * 1.05 * t / yTicks;
      const y   = yScale(val);
      ctx.beginPath(); ctx.moveTo(PAD_L - 4, y); ctx.lineTo(PAD_L, y); ctx.stroke();
      ctx.fillText(val.toFixed(2), PAD_L - 6, y + 3);
    }
    // Línea de base
    ctx.strokeStyle = '#cbd5e0';
    ctx.beginPath(); ctx.moveTo(PAD_L, PAD_T); ctx.lineTo(PAD_L, PAD_T + plotH); ctx.stroke();

    // Dibujar cada fusión recursivamente
    function drawNode(node, colorIdx) {
      if (!node) return { x: 0, y: H - PAD_B };
      if (!node.left && !node.right) {
        // hoja
        const x = xPos(node.members[0]);
        const y = H - PAD_B;
        return { x, y };
      }
      const col = PALETA[colorIdx % PALETA.length];
      const lRes = drawNode(node.left,  colorIdx * 2 + 1);
      const rRes = drawNode(node.right, colorIdx * 2 + 2);
      const y    = yScale(node.height);
      // Barra horizontal
      ctx.strokeStyle = col;
      ctx.lineWidth   = 2;
      ctx.beginPath(); ctx.moveTo(lRes.x, y); ctx.lineTo(rRes.x, y); ctx.stroke();
      // Brazo izquierdo
      ctx.beginPath(); ctx.moveTo(lRes.x, lRes.y); ctx.lineTo(lRes.x, y); ctx.stroke();
      // Brazo derecho
      ctx.beginPath(); ctx.moveTo(rRes.x, rRes.y); ctx.lineTo(rRes.x, y); ctx.stroke();
      // Etiqueta de altura
      const midX = (lRes.x + rRes.x) / 2;
      ctx.font = '8px system-ui,sans-serif';
      ctx.fillStyle = col;
      ctx.textAlign = 'center';
      ctx.fillText(node.height.toFixed(2), midX, y - 4);
      return { x: midX, y };
    }

    // Reconstruir árbol con referencias left/right desde merges
    const nodeMap = objs.map((_, i) => ({ members: [i], left: null, right: null, height: 0 }));
    let nextId = n;
    merges.forEach(m => {
      const node = { members: m.size === 2 ? [...m.left.members, ...m.right.members] : m.left.members.concat(m.right.members),
                     left: m.left, right: m.right, height: m.height, left: m.left, right: m.right };
      m.left._node  = m.left;
      m.right._node = m.right;
      m._node = node;
    });
    const root = merges.length ? merges[merges.length - 1] : null;
    if (root) drawNode({ left: root.left, right: root.right, height: root.height, members: root.left.members.concat(root.right.members) }, 0);

    // Etiquetas de hojas
    ctx.font = '10px system-ui,sans-serif';
    ctx.textAlign = 'center';
    leafOrder.forEach((i, pos) => {
      const x   = PAD_L + (pos + 0.5) * (plotW / n);
      const y   = H - PAD_B + 8;
      const lbl = (objs[i]?.nombre || `Obj ${i + 1}`).replace(/\s*[\[(]\s*cara\s+[ab]\s*[\])]\s*$/i, '');
      ctx.fillStyle = '#4a5568';
      // Rotar etiqueta si hay muchos objetos
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(n > 6 ? -Math.PI / 4 : 0);
      ctx.fillText(lbl.length > 12 ? lbl.slice(0, 11) + '…' : lbl, 0, 0);
      ctx.restore();
    });

    // Exportar PNG
    const btnExp = document.createElement('button');
    btnExp.className = 'cmo-btn cmo-btn-ghost';
    btnExp.style.cssText = 'font-size:11px;padding:4px 10px;margin:8px 0 0;display:block;';
    btnExp.textContent = '📸 Exportar PNG';
    btnExp.onclick = () => _guardarPNGDesdeCanvas(canvas, 'dendrograma', 'ward');

    contenedor.innerHTML = '';
    contenedor.appendChild(canvas);
    contenedor.appendChild(btnExp);
  }

  // ──── INIT ───────────────────────────────────────────────────────────────
  function actualizarInfoProyecto() {
    const el = document.getElementById('cmoInfoProyecto');
    if (!el) return;
    try {
      const p = typeof projectManager !== 'undefined' && projectManager.activeProject;
      if (!p) { el.textContent = 'Sin proyecto activo'; return; }
      const fp2 = p.folderPath || '';
      const total = (p.analyses || []).filter(a => a.rutaCompleta || (fp2 && a.carpeta)).length;
      el.textContent = `Proyecto: ${p.name || p.nombre || 'Sin nombre'} · ${total} análisis guardado${total !== 1 ? 's' : ''}`;
    } catch(e) { el.textContent = 'Sin proyecto activo'; }
  }

  function poblarSelectorProyecto() {
    const sel = document.getElementById('cmoProyectoSelect');
    if (!sel) return;
    const pm = typeof projectManager !== 'undefined' ? projectManager : null;
    if (!pm) return;
    const proyectos = pm.projects || [];
    // Conservar primera opción placeholder
    sel.innerHTML = '<option value="">— Seleccionar proyecto —</option>';
    proyectos.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      const total = (p.analyses || []).length;
      opt.textContent = `${p.name || p.nombre || p.id}  (${total} análisis)`;
      if (pm.activeProject && pm.activeProject.id === p.id) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  async function cargarColeccionDesdeSelector() {
    const sel = document.getElementById('cmoProyectoSelect');
    const btn = document.getElementById('cmoCargarColeccionBtn');
    if (!sel || !sel.value) {
      if (typeof toast !== 'undefined') toast.warning('Selecciona un proyecto primero.');
      return;
    }
    const pm = typeof projectManager !== 'undefined' ? projectManager : null;
    if (!pm) return;
    // Cambiar proyecto activo si es distinto
    if (!pm.activeProject || pm.activeProject.id !== sel.value) {
      pm.setActiveProject(sel.value);
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Cargando…'; }
    try {
      const ok = await cargar();
      if (ok) {
        renderObjetos();
        renderMetricas();
        const $ = id => document.getElementById(id);
        $('cmoSelectorObjetos').style.display  = 'block';
        $('cmoSelectorMetricas').style.display = 'block';
        $('cmoResultados').style.display       = 'none';
        $('cmoHeader').textContent = `Comparador Multi-Objeto — ${_objetos.length} análisis cargados`;
        actualizarStepper(2);
        bindTabs();
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Cargar colección'; }
      actualizarInfoProyecto();
    }
  }

  function init() {
    const $ = id => document.getElementById(id);

    // Ventana CMO standalone: activar proyecto desde pid URL param y auto-cargar
    const _urlParams = new URLSearchParams(window.location.search);
    const _isCMO = _urlParams.get('cmo') === '1';
    const _pidParam = _urlParams.get('pid');
    if (_isCMO && _pidParam) {
      const pm = typeof projectManager !== 'undefined' ? projectManager : null;
      if (pm && (!pm.activeProject || pm.activeProject.id !== _pidParam)) {
        pm.setActiveProject(_pidParam);
      }
    }

    poblarSelectorProyecto();
    actualizarInfoProyecto();

    // Auto-cargar colección en ventana CMO si hay proyecto activo
    if (_isCMO && typeof projectManager !== 'undefined' && projectManager?.activeProject?.analyses?.length) {
      cargar().then(ok => {
        if (!ok) return;
        renderObjetos();
        renderMetricas();
        $('cmoSelectorObjetos').style.display  = 'block';
        $('cmoSelectorMetricas').style.display = 'block';
        $('cmoResultados').style.display       = 'none';
        $('cmoHeader').textContent = `Comparador Multi-Objeto — ${_objetos.length} análisis cargados`;
        actualizarStepper(2);
        bindTabs();
        actualizarInfoProyecto();
      });
    }

    // A1: guardar selección de métricas en tiempo real (delegación persistente)
    const _gruposEl = $('cmoGruposMetricas');
    if (_gruposEl) {
      _gruposEl.addEventListener('change', (e) => {
        if (e.target.classList.contains('cmo-chk-met')) {
          const keys = [...document.querySelectorAll('.cmo-chk-met:checked')].map(c => c.dataset.key);
          _guardarSeleccionMetricas(keys);
        }
      });
    }

    const btnCargar = $('cmoCargarColeccionBtn');
    if (btnCargar) btnCargar.addEventListener('click', cargarColeccionDesdeSelector);

    // A3: carga incremental — añade solo los análisis nuevos, conserva selección y resultados
    const btnActualizar = $('cmoActualizarBtn');
    if (btnActualizar) btnActualizar.addEventListener('click', async () => {
      if (_objetos.length === 0) { cargarColeccionDesdeSelector(); return; }
      btnActualizar.disabled = true;
      btnActualizar.textContent = '⏳ Actualizando…';
      const idsExistentes = new Set(_objetos.map(o => String(o.id)));
      try {
        const ok = await cargar(); // recarga completa en _objetos (interno)
        if (!ok) return;
        const nuevos = _objetos.filter(o => !idsExistentes.has(String(o.id)));
        if (nuevos.length === 0) {
          if (typeof toast !== 'undefined') toast.info('La colección ya está al día — no hay análisis nuevos.');
        } else {
          if (typeof toast !== 'undefined') toast.success(`${nuevos.length} análisis nuevo${nuevos.length > 1 ? 's' : ''} incorporado${nuevos.length > 1 ? 's' : ''}.`);
          renderObjetos();
          $('cmoHeader').textContent = `Comparador Multi-Objeto — ${_objetos.length} análisis cargados`;
        }
        actualizarInfoProyecto();
      } finally {
        btnActualizar.disabled = false;
        btnActualizar.textContent = '↻ Actualizar';
      }
    });

    const btnAbrir = $('abrirComparadorBtn');
    if (btnAbrir) {
      // En ventana principal → abrir CMO en ventana independiente via IPC
      // En ventana CMO (standalone) → comportamiento in-page normal
      const isCMOWindow = new URLSearchParams(window.location.search).get('cmo') === '1';
      if (!isCMOWindow) {
        btnAbrir.addEventListener('click', () => {
          // Incluir el id del proyecto activo en la URL para que la nueva ventana lo herede
          const pid = (typeof projectManager !== 'undefined' && projectManager.activeProject)
            ? projectManager.activeProject.id : '';
          const cmoUrl = location.href.split('?')[0] + '?cmo=1' + (pid ? '&pid=' + encodeURIComponent(pid) : '');
          window.open(cmoUrl, '_blank');
        });
      } else {
        btnAbrir.addEventListener('click', async () => {
          actualizarInfoProyecto();
          btnAbrir.disabled = true;
          btnAbrir.textContent = 'Cargando análisis...';
          try {
            const ok = await cargar();
            if (ok) {
              renderObjetos();
              renderMetricas();
              $('comparadorMultiObjetoSection').style.display  = 'block';
              $('cmoSelectorObjetos').style.display  = 'block';
              $('cmoSelectorMetricas').style.display = 'block';
              $('cmoResultados').style.display       = 'none';
              $('cmoHeader').textContent = `Comparador Multi-Objeto — ${_objetos.length} análisis cargados`;
              actualizarStepper(2);
              bindTabs();
              $('comparadorMultiObjetoSection').scrollIntoView({ behavior: 'smooth' });
            }
          } finally {
            btnAbrir.disabled = false;
            btnAbrir.textContent = 'Actualizar comparador';
            actualizarInfoProyecto();
          }
        });
      }
    }

    // A2: carga automática cuando el usuario navega a la pestaña Resultados
    // y hay proyecto activo con análisis — sin bloquear la UI (fire-and-forget)
    document.addEventListener('mao:tab:change', async (e) => {
      if (e.detail?.tab !== 'resultados') return;
      if (_objetos.length > 0) return; // ya cargado — no recargar
      const pm = typeof projectManager !== 'undefined' ? projectManager : null;
      if (!pm?.activeProject?.analyses?.length) return;
      poblarSelectorProyecto();
      // Actualizar selector para reflejar proyecto activo
      const sel = $('cmoProyectoSelect');
      if (sel && pm.activeProject) sel.value = pm.activeProject.id;
      const ok = await cargar();
      if (ok) {
        renderObjetos();
        renderMetricas();
        $('cmoSelectorObjetos').style.display  = 'block';
        $('cmoSelectorMetricas').style.display = 'block';
        $('cmoResultados').style.display       = 'none';
        $('cmoHeader').textContent = `Comparador Multi-Objeto — ${_objetos.length} análisis cargados`;
        actualizarStepper(2);
        bindTabs();
        actualizarInfoProyecto();
      }
    });

    const on = (id, fn) => { const el=$(id); if(el) el.addEventListener('click', fn); };
    on('cmoCompararBtn',  comparar);
    on('cmoExportarCSV',  exportarCSV);
    on('cmoExportarInformeCSV', exportarInforme);
    on('cmoCerrarBtn',    () => {
      if (new URLSearchParams(window.location.search).get('cmo') === '1') {
        window.close();
      } else {
        $('comparadorMultiObjetoSection').style.display='none';
        actualizarStepper(1);
      }
    });
    on('cmoSelTodosBtn',  () => {
      document.querySelectorAll('.cmo-chk-obj').forEach(c => {
        c.checked = true;
        c.closest('label')?.classList.add('sel');
      });
      document.querySelectorAll('.cmo-chk-par').forEach(c => { c.checked = true; c.indeterminate = false; });
      _selIds = new Set(_objetos.map(o => String(o.id)));
      actualizarContador();
    });
    on('cmoDeselTodosBtn', () => {
      document.querySelectorAll('.cmo-chk-obj').forEach(c => {
        c.checked = false;
        c.closest('label')?.classList.remove('sel');
      });
      document.querySelectorAll('.cmo-chk-par').forEach(c => { c.checked = false; c.indeterminate = false; });
      _selIds = new Set();
      actualizarContador();
    });
  }

  return { init };
})();

window.addEventListener('DOMContentLoaded', () => { ComparadorMultiObjeto.init(); });
