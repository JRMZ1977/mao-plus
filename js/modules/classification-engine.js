// Classification and Interpretation Engine
// Extracts typological classification, interpretation, and meta-analysis functions
// ============================================================================

import * as MM from './morphometric-metrics.js';
import * as SC from './shape-classification.js';

/**
 * MÉTRICA 6: ÍNDICES DE FORMA 3D INFERIDA
 * Esfericidad, oblongación, aplanamiento (inferidos desde 2D)
 * Útil para: núcleos líticos, cerámica globular, objetos metálicos
 *
 * @param {number} area - Área del objeto en píxeles
 * @param {number} perimetro - Perímetro del contorno
 * @param {number} aspectRatio - Relación de aspecto (eje mayor / eje menor)
 * @param {number} excentricidad - Excentricidad de la elipse ajustada
 * @returns {Object} Índices de forma 3D con clasificaciones
 */
export function calcularIndicesForma3D(area, perimetro, aspectRatio, excentricidad) {
  // Índice de esfericidad (Isoperimetric quotient)
  const esfericidad = perimetro > 0 ? (4 * Math.PI * area) / (perimetro * perimetro) : 0;

  // Clasificación de forma 3D inferida
  let forma3DInferida = '';
  if (esfericidad > 0.95) {
    forma3DInferida = 'Esférica/Globular';
  } else if (esfericidad > 0.85) {
    forma3DInferida = 'Subesférica';
  } else if (esfericidad > 0.70) {
    forma3DInferida = 'Oblata/Prolata (achatada/alargada)';
  } else if (esfericidad > 0.50) {
    forma3DInferida = 'Irregular (asimétrica)';
  } else {
    forma3DInferida = 'Muy irregular/Fragmentada';
  }

  // Índice de oblongación (alargamiento)
  const oblongacion = aspectRatio > 0 ? Math.max(aspectRatio, 1 / aspectRatio) : 1;

  let clasificacionOblongacion = '';
  if (oblongacion < 1.15) {
    clasificacionOblongacion = 'Equidimensional (similar en todas direcciones)';
  } else if (oblongacion < 1.5) {
    clasificacionOblongacion = 'Ligeramente oblonga';
  } else if (oblongacion < 2.0) {
    clasificacionOblongacion = 'Moderadamente oblonga';
  } else if (oblongacion < 3.0) {
    clasificacionOblongacion = 'Muy oblonga (alargada)';
  } else {
    clasificacionOblongacion = 'Extremadamente oblonga (lanceolada)';
  }

  // Índice de aplanamiento (basado en excentricidad)
  let aplanamiento = '';
  if (excentricidad < 0.2) {
    aplanamiento = 'Poco aplanado (casi circular)';
  } else if (excentricidad < 0.5) {
    aplanamiento = 'Moderadamente aplanado';
  } else if (excentricidad < 0.8) {
    aplanamiento = 'Bastante aplanado';
  } else {
    aplanamiento = 'Muy aplanado (casi lineal)';
  }

  return {
    esfericidad: esfericidad,
    forma_3d_inferida: forma3DInferida,
    oblongacion: oblongacion,
    clasificacion_oblongacion: clasificacionOblongacion,
    aplanamiento_inferido: aplanamiento
  };
}

/**
 * Mapear clasificación específica a categoría base
 *
 * @param {string} clasificacion - Nombre específico de la clasificación
 * @returns {string} Categoría base normalizada
 */
export function mapearACategoria(clasificacion) {
  if (!clasificacion) return "Irregular";

  const c = clasificacion.toLowerCase();

  if (c.includes("circular") || c.includes("círculo") || c.includes("esférico"))
    return "Circular";

  if (c.includes("triangular") || c.includes("triángulo"))
    return "Triangular";

  if (c.includes("cuadrangular") || c.includes("rectangular") ||
      c.includes("cuadrado") || c.includes("rectángulo") ||
      c.includes("cuadrilátero") || c.includes("cuadrilatero"))
    return "Cuadrangular";

  if (c.includes("pentagonal") || c.includes("pentágono"))
    return "Pentagonal";

  if (c.includes("hexagonal") || c.includes("hexágono"))
    return "Hexagonal";

  if (c.includes("oval"))
    return "Oval";

  if (c.includes("elipsoidal") || c.includes("elipse") || c.includes("elíptico"))
    return "Elipsoidal";

  if (c.includes("lanceolad") || c.includes("foliáce") || c.includes("foliace"))
    return "Lanceolada";

  if (c.includes("amigdaloide") || c.includes("amígdala") || c.includes("amigdala"))
    return "Amigdaloide";

  if (c.includes("laminar") || c.includes("lineal") || c.includes("lámina"))
    return "Laminar";

  if (c.includes("lunar") || c.includes("cresciente") || c.includes("creciente"))
    return "Lunar";

  if (c.includes("trapezoidal") || c.includes("trapezoide") || c.includes("trapecio"))
    return "Trapezoidal";

  if (c.includes("romboidal") || c.includes("romboid") || c.includes("rombo"))
    return "Romboidal";

  if (c.includes("poligonal") || c.includes("polígono") || (c.includes("regular") && !c.includes("irregular")))
    return "Poligonal";

  if (c.includes("estrellado") || c.includes("estrella"))
    return "Estrellado";

  if (c.includes("lobulado") || c.includes("lóbulo") || c.includes("lobulo"))
    return "Lobulado";

  if (c.includes("anular") || c.includes("perforado"))
    return "Anular";

  return "Irregular";
}

/**
 * Convertir categoría base a nombre formal
 *
 * @param {string} categoria - Categoría base
 * @param {Object} metrics - Métricas del objeto (para validar aspect ratio)
 * @returns {string} Nombre formal de la forma
 */
export function convertirCategoriaANombre(categoria, metrics) {
  const AR = parseFloat(metrics.aspect_ratio_tight) || 1.0;

  const nombres = {
    "Circular": "Forma Circular",
    "Triangular": "Forma Triangular",
    "Cuadrangular": (AR >= 0.90 && AR <= 1.10) ? "Forma Cuadrangular" : "Forma Rectangular",
    "Pentagonal": "Forma Pentagonal",
    "Hexagonal": "Forma Hexagonal",
    "Elipsoidal": "Forma Elipsoidal",
    "Oval":       "Forma Oval",
    "Lanceolada": "Forma Lanceolada",
    "Amigdaloide": "Forma Amigdaloide",
    "Laminar": "Forma Laminar",
    "Lunar": "Forma Lunar",
    "Trapezoidal": "Forma Trapezoidal",
    "Romboidal": "Forma Romboidal",
    "Poligonal": "Forma Poligonal",
    "Irregular": "Forma Irregular",
    "Estrellado": "Forma Estrellada",
    "Lobulado": "Forma Lobulada",
    "Anular": "Forma Anular/Perforada"
  };

  return nombres[categoria] || "Forma Indeterminada";
}

/**
 * Extraer contexto morfológico del objeto
 * Determina propiedades de solidez, circularidad, topología, etc.
 *
 * @param {Object} metrics - Métricas del objeto
 * @param {Object} formaIdealizada - Forma idealizada (si disponible)
 * @returns {Object} Contexto morfológico con propiedades derivadas
 */
export function extraerContextoMorfologico(metrics, formaIdealizada = null) {
  const radialAngular = formaIdealizada?.distribucionRadialAngular || null;
  const solidez = parseFloat(metrics.solidity || metrics.solidez) || 1.0;
  const circularidad = parseFloat(metrics.circularidad || metrics.circularity) || 0;
  const ratioRadios = parseFloat(metrics.ratio_radios);
  const aspectRatio = parseFloat(metrics.aspect_ratio_tight) || 1.0;
  const arNorm = Math.min(aspectRatio, 1.0 / (aspectRatio || 0.001));
  const clasificacionRadial = formaIdealizada?.nombre || radialAngular?.geometriaInferida || "Irregular";
  const categoriaRadial = mapearACategoria(clasificacionRadial);
  const categoriasCurvilineas = new Set(["Circular", "Elipsoidal", "Oval", "Lanceolada", "Amigdaloide", "Laminar", "Lunar"]);
  const categoriasAngulares = new Set(["Triangular", "Cuadrangular", "Pentagonal", "Hexagonal", "Poligonal", "Trapezoidal", "Romboidal"]);
  const categoriasTopologicas = new Set(["Lunar", "Lobulado", "Estrellado", "Anular"]);
  const completitud = parseFloat(metrics.completitud_estimada);

  const contexto = {
    solidez,
    circularidad,
    ratioRadios: isNaN(ratioRadios) ? null : ratioRadios,
    arNorm,
    categoriaRadial,
    clasificacionRadial,
    esFragmento: !!radialAngular?.esFragmento || (!isNaN(completitud) && completitud < 95 && solidez < 0.92),
    esCurvilinea: categoriasCurvilineas.has(categoriaRadial),
    esAngular: categoriasAngulares.has(categoriaRadial),
    esTopologica: categoriasTopologicas.has(categoriaRadial),
    fracturaSevera: solidez < 0.65,
    fragmentacionModerada: solidez < 0.85,
    lunarSuave: !isNaN(ratioRadios) && ratioRadios < 0.50 && arNorm < 0.52 && circularidad >= 0.65 && circularidad < 0.86 && solidez >= 0.75 && solidez < 0.95
  };

  contexto.topologiaBase = (contexto.esTopologica || contexto.lunarSuave)
    ? "concava"
    : (solidez < 0.92 ? "irregular" : "convexa");

  return contexto;
}

/**
 * Aplicar contexto morfológico a evidencias de clasificación
 * Ajusta pesos de evidencias según propiedades del objeto
 *
 * @param {Object} evidencias - Evidencias de clasificación por método
 * @param {Object} contexto - Contexto morfológico
 * @param {Object} metrics - Métricas del objeto
 * @returns {Object} {evidencias ajustadas, notas de ajuste}
 */
export function aplicarContextoAEvidencias(evidencias, contexto, metrics) {
  const ajustadas = Object.fromEntries(
    Object.entries(evidencias).map(([clave, datos]) => [clave, { ...datos }])
  );
  const notas = [];

  if (contexto.fracturaSevera && ajustadas.angulos_vertices) {
    ajustadas.angulos_vertices.peso *= 0.35;
    notas.push("fractura severa: ángulos locales dejan de ser evidencia primaria");
  } else if (contexto.fragmentacionModerada && ajustadas.angulos_vertices) {
    ajustadas.angulos_vertices.peso *= 0.65;
    notas.push("fragmentación moderada: se atenúa el peso de ángulos locales");
  }

  if ((contexto.esCurvilinea || contexto.topologiaBase === "concava") && ajustadas.radial_angular) {
    ajustadas.radial_angular.peso += 0.75;
    notas.push("familia curvilínea/cóncava: se prioriza la distribución radial");
  }

  if ((contexto.esTopologica || contexto.lunarSuave) && ajustadas.tradicional) {
    ajustadas.tradicional.peso *= 0.70;
    notas.push("morfotipo topológico: circularidad/AR tradicional pasan a apoyo");
  }

  const numRectos = parseInt(metrics.num_angulos_rectos) || 0;
  if (contexto.esAngular && contexto.solidez >= 0.80 && numRectos >= 3 && ajustadas.angulos_vertices) {
    ajustadas.angulos_vertices.peso += 0.75;
    notas.push("familia angular bien conservada: se refuerzan vértices/ángulos");
  }

  return { evidencias: ajustadas, notas };
}

/**
 * Construir etiqueta tipológica con información de fragmentación
 *
 * @param {string} base - Nombre base de la forma tipológica
 * @param {boolean} esFragmento - Si el objeto es un fragmento
 * @param {number} completitud - Porcentaje de completitud (0-100)
 * @returns {string|null} Etiqueta tipológica formateada
 */
export function construirEtiquetaTipologica(base, esFragmento, completitud) {
  if (!base) return null;
  if (!esFragmento) return base;
  const prefijo = base.toLowerCase().startsWith('fragmento ') ? '' : 'Fragmento ';
  return `${prefijo}${base}${Number.isFinite(completitud) ? ` (${completitud}% completo)` : ''}`;
}

/**
 * Inferir interpretación tipológica a partir de clasificación geométrica
 * Reinterpreta la forma observada con base en análisis radial-angular
 *
 * @param {string} clasificacionGeometrica - Clasificación geométrica observada
 * @param {string} categoriaBase - Categoría base
 * @param {Object} contexto - Contexto morfológico
 * @param {boolean} esFragmento - Si es fragmento
 * @param {number} completitud - Porcentaje de completitud
 * @returns {Object} Interpretación tipológica con razonamiento
 */
export function inferirInterpretacionTipologica(clasificacionGeometrica, categoriaBase, contexto, esFragmento, completitud) {
  const categoriaGeom = mapearACategoria(clasificacionGeometrica || categoriaBase || 'Irregular');
  const valorCompletitud = Number.isFinite(completitud) ? completitud : 100;
  const resultado = {
    forma_geometrica_observada: clasificacionGeometrica || convertirCategoriaANombre(categoriaBase, {}),
    forma_tipologica_inferida: clasificacionGeometrica || convertirCategoriaANombre(categoriaBase, {}),
    razon_tipologica: 'Sin reinterpretación tipológica adicional: la lectura geométrica observada se conserva como salida principal.',
    requiere_reinterpretacion: false
  };

  if (categoriaGeom === 'Lunar' || contexto.categoriaRadial === 'Lunar') {
    resultado.forma_tipologica_inferida = construirEtiquetaTipologica('Media Luna', esFragmento, valorCompletitud);
    resultado.razon_tipologica = 'La geometría radial ya identifica un morfotipo lunar; la lectura tipológica coincide con la forma observada.';
    return resultado;
  }

  if (contexto.lunarSuave && (categoriaGeom === 'Oval' || categoriaGeom === 'Elipsoidal' || categoriaGeom === 'Irregular')) {
    resultado.forma_tipologica_inferida = construirEtiquetaTipologica('Media Luna', esFragmento, valorCompletitud);
    resultado.razon_tipologica = `Compatible con media luna por asimetría radial fuerte (Rmin/Rmax=${contexto.ratioRadios != null ? contexto.ratioRadios.toFixed(3) : 'n/a'}), curvatura curvilínea (circ=${contexto.circularidad.toFixed(3)}) y lectura semántica de fragmento de toroide.`;
    resultado.requiere_reinterpretacion = true;
    return resultado;
  }

  const toroideSevero =
    esFragmento &&
    contexto.ratioRadios != null && contexto.ratioRadios < 0.50 &&
    contexto.circularidad >= 0.74 && contexto.circularidad < 0.88 &&
    contexto.solidez >= 0.45 && contexto.solidez < 0.75;

  if (toroideSevero && (categoriaGeom === 'Oval' || categoriaGeom === 'Elipsoidal' || categoriaGeom === 'Irregular')) {
    resultado.forma_tipologica_inferida = construirEtiquetaTipologica('Media Luna', esFragmento, valorCompletitud);
    resultado.razon_tipologica = `Lectura tipológica lunar para fragmento toroidal severo: Rmin/Rmax=${contexto.ratioRadios.toFixed(3)}, circ=${contexto.circularidad.toFixed(3)}, solidez=${contexto.solidez.toFixed(3)}.`;
    resultado.requiere_reinterpretacion = true;
    return resultado;
  }

  if (contexto.topologiaBase === 'concava' && categoriaGeom === 'Anular') {
    resultado.forma_tipologica_inferida = construirEtiquetaTipologica('Fragmento de Toroide', esFragmento, valorCompletitud);
    resultado.razon_tipologica = 'La topología anular/perforada sugiere lectura tipológica de fragmento de toroide sobre la geometría observada.';
    resultado.requiere_reinterpretacion = true;
    return resultado;
  }

  return resultado;
}

/**
 * Regla canónica de salida semántica (geometría observada, tipología inferida y forma mostrada)
 * Se usa en manual e IA para evitar divergencias por campos desfasados en cache
 * CRITICAL: Usado por mao-ia.js
 *
 * @param {Object} metricas - Objeto de métricas completo
 * @returns {Object} Salida canónica normalizada
 */
export function aplicarReglaCanonicaInterpretacion(metricas) {
  if (!metricas || typeof metricas !== 'object') {
    return {
      forma_geometrica_observada: '',
      forma_tipologica_inferida: '',
      forma_detectada_mostrada: '',
      forma_requiere_reinterpretacion_tipologica: false,
    };
  }

  const formaGeo = metricas.forma_geometrica_observada || metricas.forma_detectada_meta || metricas.forma_detectada || '';
  let formaTip = metricas.forma_tipologica_inferida || metricas.forma_detectada_tipologica || '';
  let requiere = !!metricas.forma_requiere_reinterpretacion_tipologica;
  const tipologiaAsistidaEfa = !!metricas.forma_tipologia_asistida_efa;
  let formaMostrada = metricas.forma_detectada_mostrada ||
    ((requiere && formaTip) ? formaTip : (metricas.forma_detectada_meta || metricas.forma_detectada || formaTip || formaGeo));

  if (!tipologiaAsistidaEfa && ((formaTip && formaGeo && formaTip !== formaGeo) ||
      (formaMostrada && formaGeo && formaMostrada !== formaGeo))) {
    requiere = true;
  }

  const mostradaEsLunar = /media\s+luna/i.test(String(formaMostrada || ''));
  const tipPareceOval = /(forma\s*)?(oval|elipsoidal)/i.test(String(formaTip || ''));
  if (requiere && mostradaEsLunar && (!formaTip || tipPareceOval)) {
    formaTip = formaMostrada;
  }

  if (!formaTip) formaTip = formaMostrada || formaGeo;
  if (!formaMostrada) formaMostrada = (requiere && formaTip) ? formaTip : (formaGeo || formaTip);

  metricas.forma_geometrica_observada = formaGeo;
  metricas.forma_tipologica_inferida = formaTip;
  metricas.forma_detectada_tipologica = formaTip;
  metricas.forma_requiere_reinterpretacion_tipologica = !!requiere;
  metricas.forma_detectada_mostrada = formaMostrada;
  metricas.forma_detectada = formaMostrada;
  if (!metricas.forma_razon_tipologica && requiere) {
    metricas.forma_razon_tipologica = 'Regla canónica: interpretación tipológica alineada con la forma mostrada.';
  }

  return {
    forma_geometrica_observada: formaGeo,
    forma_tipologica_inferida: formaTip,
    forma_detectada_mostrada: formaMostrada,
    forma_requiere_reinterpretacion_tipologica: !!requiere,
  };
}

/**
 * Calcular confianza de clasificación tradicional (circularidad + aspect ratio)
 *
 * @param {Object} metrics - Métricas del objeto
 * @returns {number} Confianza (0-1)
 */
export function calcularConfianzaTradicional(metrics) {
  const circularidad = parseFloat(metrics.circularidad) || 0;
  const solidez = parseFloat(metrics.solidity) || 0;

  if (solidez < 0.85) return 0.60;
  if (circularidad >= 0.90) return 0.85;
  if (circularidad >= 0.75) return 0.75;
  return 0.65;
}

/**
 * Calcular confianza de análisis de ángulos (vértices)
 *
 * @param {Object} metrics - Métricas del objeto
 * @returns {number} Confianza (0-1)
 */
export function calcularConfianzaAngulos(metrics) {
  const num_vertices = parseInt(metrics.vertices_aproximados) || 0;
  const desviacion = parseFloat(metrics.desviacion_angulos) || 100;

  if (num_vertices >= 3 && desviacion < 15) return 0.90;
  if (num_vertices >= 3 && desviacion < 30) return 0.80;
  if (num_vertices < 3) return 0.60;

  return 0.75;
}

/**
 * Clasificar por complejidad del contorno
 *
 * @param {Object} metrics - Métricas del objeto
 * @returns {string} Clasificación de complejidad
 */
export function clasificarComplejidad(metrics) {
  const indice = parseFloat(metrics.contour_complexity_index) || 1.0;
  const vertices = parseInt(metrics.vertices_aproximados) || 0;

  if (indice < 1.1 && vertices <= 4) return "Muy Simple";
  if (indice < 1.3 && vertices <= 6) return "Simple";
  if (indice < 1.6 && vertices <= 10) return "Moderado";
  if (indice < 2.0) return "Complejo";
  return "Muy Complejo";
}

/**
 * Analizar patrón de agrupamiento de perforaciones/horadaciones
 * Determina distribución espacial y patrón de perforaciones
 *
 * @param {Object} obj - Objeto con perforaciones/horadaciones
 * @returns {Object} Análisis del patrón
 */
export function analizarPatronAgrupamiento(obj) {
  const perforaciones = obj.perforaciones || [];
  const horadaciones = obj.horadaciones || [];
  const total = perforaciones.length + horadaciones.length;

  if (total === 0) {
    return {
      tiene_perforaciones: false,
      patron: "Sin perforaciones/horadaciones",
      clasificacion: "N/A",
      confianza: 0,
      detalles: "No se detectaron perforaciones ni horadaciones"
    };
  }

  const centroides = [];

  perforaciones.forEach((p, idx) => {
    let centroid = null;

    if (p.metricas && p.metricas.centroid && Array.isArray(p.metricas.centroid)) {
      centroid = p.metricas.centroid;
    } else if (p.metricas && p.metricas.centroide_x !== undefined && p.metricas.centroide_y !== undefined) {
      centroid = [p.metricas.centroide_x, p.metricas.centroide_y];
    } else if (p.centroide && Array.isArray(p.centroide)) {
      centroid = p.centroide;
    } else if (p.centroide_x !== undefined && p.centroide_y !== undefined) {
      centroid = [p.centroide_x, p.centroide_y];
    }

    if (centroid) {
      centroides.push({
        x: parseFloat(centroid[0]),
        y: parseFloat(centroid[1]),
        tipo: 'perforacion',
        id: p.id || (idx + 1)
      });
    }
  });

  horadaciones.forEach((h, idx) => {
    let centroid = null;

    if (h.metricas && h.metricas.centroid && Array.isArray(h.metricas.centroid)) {
      centroid = h.metricas.centroid;
    } else if (h.metricas && h.metricas.centroide_x !== undefined && h.metricas.centroide_y !== undefined) {
      centroid = [h.metricas.centroide_x, h.metricas.centroide_y];
    } else if (h.centroide && Array.isArray(h.centroide)) {
      centroid = h.centroide;
    } else if (h.centroide_x !== undefined && h.centroide_y !== undefined) {
      centroid = [h.centroide_x, h.centroide_y];
    }

    if (centroid) {
      centroides.push({
        x: parseFloat(centroid[0]),
        y: parseFloat(centroid[1]),
        tipo: 'horadacion',
        id: h.id || (idx + 1)
      });
    }
  });

  if (centroides.length === 0) {
    return {
      tiene_perforaciones: true,
      patron: "Datos insuficientes",
      clasificacion: "N/A",
      confianza: 0,
      detalles: `${total} P/H detectadas pero sin centroides válidos`
    };
  }

  const centroideObj = obj.metricas ?
    [parseFloat(obj.metricas.centroide_hull_x || obj.metricas.centroide_x) || 0,
     parseFloat(obj.metricas.centroide_hull_y || obj.metricas.centroide_y) || 0] :
    [0, 0];

  let patron = "";
  let clasificacion = "";
  let confianza = 0.8;
  let detalles = "";

  if (total === 1) {
    patron = "Única";
    clasificacion = "Perforación Central";
    detalles = `1 ${centroides[0].tipo}`;

    const dx = centroides[0].x - centroideObj[0];
    const dy = centroides[0].y - centroideObj[1];
    const distancia = Math.sqrt(dx*dx + dy*dy);
    const radioObj = obj.metricas ? parseFloat(obj.metricas.radio_medio_px) || 50 : 50;

    if (distancia < radioObj * 0.3) {
      clasificacion = "Perforación Central (céntrica)";
    } else if (distancia > radioObj * 0.7) {
      clasificacion = "Perforación Excéntrica (periférica)";
    } else {
      clasificacion = "Perforación Intermedia";
    }

  } else if (total === 2) {
    patron = "Bipolar";
    clasificacion = "Perforaciones Bipolares";
    detalles = `${perforaciones.length} perforaciones, ${horadaciones.length} horadaciones`;

    const dx = centroides[1].x - centroides[0].x;
    const dy = centroides[1].y - centroides[0].y;
    const distancia = Math.sqrt(dx*dx + dy*dy);

    const puntoMedio_x = (centroides[0].x + centroides[1].x) / 2;
    const puntoMedio_y = (centroides[0].y + centroides[1].y) / 2;
    const distCentroide = Math.sqrt(
      Math.pow(puntoMedio_x - centroideObj[0], 2) +
      Math.pow(puntoMedio_y - centroideObj[1], 2)
    );

    if (distCentroide < distancia * 0.2) {
      clasificacion = "Perforaciones Bipolares Simétricas (diametrales)";
    } else {
      clasificacion = "Perforaciones Bipolares Asimétricas";
    }

  } else if (total >= 3 && total <= 6) {
    patron = "Múltiple";
    detalles = `${perforaciones.length} perforaciones, ${horadaciones.length} horadaciones`;

    const angulos = centroides.map(c => {
      const dx = c.x - centroideObj[0];
      const dy = c.y - centroideObj[1];
      return Math.atan2(dy, dx) * 180 / Math.PI;
    });

    angulos.sort((a, b) => a - b);

    const diffs = [];
    for (let i = 0; i < angulos.length; i++) {
      const diff = i < angulos.length - 1 ?
        angulos[i + 1] - angulos[i] :
        360 + angulos[0] - angulos[angulos.length - 1];
      diffs.push(diff);
    }

    const media = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const varianza = diffs.reduce((sum, d) => sum + Math.pow(d - media, 2), 0) / diffs.length;
    const desviacion = Math.sqrt(varianza);

    if (desviacion < 15) {
      clasificacion = `Distribución Circular Regular (${total} puntos equidistantes)`;
    } else if (desviacion < 30) {
      clasificacion = `Distribución Circular Irregular (${total} puntos)`;
    } else {
      clasificacion = `Distribución Agrupada (${total} puntos)`;
    }

  } else {
    patron = "Múltiple Complejo";
    clasificacion = `Distribución Compleja (${total} puntos)`;
    detalles = `${perforaciones.length} perforaciones, ${horadaciones.length} horadaciones`;
    confianza = 0.7;
  }

  return {
    tiene_perforaciones: true,
    patron: patron,
    clasificacion: clasificacion,
    confianza: confianza,
    detalles: detalles,
    cantidad_total: total,
    cantidad_perforaciones: perforaciones.length,
    cantidad_horadaciones: horadaciones.length
  };
}

/**
 * META-CLASIFICACIÓN JERÁRQUICA
 * Sintetiza todas las clasificaciones de múltiples métodos y genera la clasificación definitiva
 * con confianza global y razonamiento completo
 *
 * @param {Object} metrics - Métricas del objeto
 * @param {Object} obj - Objeto completo (opcional, para análisis de perforaciones)
 * @returns {Object} Resultado de meta-clasificación con confianza, razonamiento, evidencias
 */
export function metaClasificarForma(metrics, obj = null) {

  const formaIdealizada = metrics._forma_idealizada;
  const radialAngular = formaIdealizada?.distribucionRadialAngular;
  const contextoMorfologico = extraerContextoMorfologico(metrics, formaIdealizada);

  const convexidad = parseFloat(metrics.convexidad) || 1.0;
  let clasificacion_convexidad = "Altamente Convexo";
  if (convexidad < 0.65) clasificacion_convexidad = "Muy Irregular";
  else if (convexidad < 0.80) clasificacion_convexidad = "Irregular";
  else if (convexidad < 0.92) clasificacion_convexidad = "Poco Irregular";

  const evidenciasBase = {
    tradicional: {
      clasificacion: metrics.forma_detectada || "Indeterminada",
      confianza: calcularConfianzaTradicional(metrics),
      peso: 1.5,
      descripcion: "Clasificación basada en circularidad y aspect ratio"
    },

    radial_angular: {
      clasificacion: formaIdealizada?.nombre || "Indeterminada",
      confianza: radialAngular?.confianzaGeometria || 0.85,
      peso: 3.0,
      descripcion: "Análisis radial-angular con Convex Hull (ROBUSTO)"
    },

    angulos_vertices: {
      clasificacion: metrics.geometria_vertices || "No calculado",
      confianza: calcularConfianzaAngulos(metrics),
      peso: 2.5,
      descripcion: "Distribución de ángulos en vértices"
    },

    simetria: {
      clasificacion: metrics.simetria_clasificacion || "No calculado",
      confianza: parseFloat(metrics.simetria_bilateral) || 0,
      peso: 0.0,
      descripcion: "Simetría bilateral (validador de manufactura, no vota)"
    },

    convexidad: {
      clasificacion: clasificacion_convexidad,
      confianza: convexidad,
      peso: 0.0,
      descripcion: "Convexidad del contorno (validador de regularidad)"
    },

    complejidad: {
      clasificacion: clasificarComplejidad(metrics),
      confianza: 0.75,
      peso: 0.0,
      descripcion: "Complejidad del contorno (validador de suavidad, no vota)"
    },

    curvatura: {
      clasificacion: metrics.energia_clasificacion || "No calculado",
      confianza: 0.75,
      peso: 0.0,
      descripcion: "Energía de curvatura (validador de sinuosidad, no vota)"
    }
  };

  const ajusteContextual = aplicarContextoAEvidencias(evidenciasBase, contextoMorfologico, metrics);
  const evidencias = ajusteContextual.evidencias;

  const votos = {
    "Circular": 0,
    "Triangular": 0,
    "Cuadrangular": 0,
    "Pentagonal": 0,
    "Hexagonal": 0,
    "Poligonal": 0,
    "Elipsoidal": 0,
    "Oval": 0,
    "Lanceolada": 0,
    "Amigdaloide": 0,
    "Laminar": 0,
    "Lunar": 0,
    "Estrellado": 0,
    "Lobulado": 0,
    "Trapezoidal": 0,
    "Romboidal": 0,
    "Anular": 0,
    "Irregular": 0
  };

  for (const [nombre_metodo, datos] of Object.entries(evidencias)) {
    if (datos.clasificacion === "No calculado" || datos.clasificacion === "Indeterminada") {
      continue;
    }

    const categoria = mapearACategoria(datos.clasificacion);
    const voto_ponderado = datos.peso * datos.confianza;
    votos[categoria] += voto_ponderado;
  }

  const votosOrdenados = Object.entries(votos)
    .filter(([cat, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  if (votosOrdenados.length === 0) {
    return {
      clasificacion_final: "Forma Indeterminada",
      categoria_base: "Irregular",
      confianza_global: 0,
      metodos_coincidentes: 0,
      total_metodos: 0,
      razonamiento: ["No se pudo determinar clasificación"]
    };
  }

  let categoria_ganadora = votosOrdenados[0][0];
  const votos_ganador = votosOrdenados[0][1];
  const segundo_lugar = votosOrdenados.length > 1 ? votosOrdenados[1] : null;

  if (segundo_lugar && Math.abs(votos_ganador - segundo_lugar[1]) < 0.3) {
    const radial_categoria = mapearACategoria(evidencias.radial_angular.clasificacion);
    if (radial_categoria !== categoria_ganadora) {
      categoria_ganadora = radial_categoria;
    }
  }

  let clasificacion_final = categoria_ganadora;
  let es_fragmento = false;
  let completitud = 100;

  const nombreRadial = evidencias.radial_angular.clasificacion;
  if (nombreRadial && nombreRadial.includes("Fragmento")) {
    es_fragmento = true;
    const match = nombreRadial.match(/(\d+)% completo/);
    if (match) {
      completitud = parseInt(match[1]);
    }
    clasificacion_final = nombreRadial;
  } else {
    clasificacion_final = convertirCategoriaANombre(categoria_ganadora, metrics);
  }

  if (categoria_ganadora === "Cuadrangular") {
    const num_rectos = parseInt(metrics.num_angulos_rectos) || 0;
    if (num_rectos < 3) {
      categoria_ganadora = "Poligonal";
      if (!es_fragmento) {
        clasificacion_final = "Forma Poligonal";
      }
    }
  }

  if ((categoria_ganadora === "Cuadrangular" || categoria_ganadora === "Poligonal") &&
      (parseFloat(metrics.solidity || metrics.solidez) || 1.0) < 0.65) {
    const _radialCat5 = mapearACategoria(evidencias.radial_angular.clasificacion);
    if (_radialCat5 === "Irregular") {
      categoria_ganadora = "Irregular";
      clasificacion_final = es_fragmento
        ? `Fragmento Forma Irregular (${completitud}% completo)`
        : "Forma Irregular";
    }
  }

  if (categoria_ganadora === "Irregular") {
    const _ratio6 = parseFloat(metrics.ratio_radios);
    const _circ6 = parseFloat(metrics.circularity || metrics.circularidad);
    const _sol6 = parseFloat(metrics.solidity || metrics.solidez);
    const _arNorm6 = contextoMorfologico.arNorm;
    const _frag6 = es_fragmento || (!isNaN(parseFloat(metrics.completitud_estimada)) && parseFloat(metrics.completitud_estimada) < 95);

    const _zonaCurvilineaFrontera =
      _frag6 &&
      !isNaN(_ratio6) && _ratio6 >= 0.18 && _ratio6 <= 0.55 &&
      !isNaN(_circ6) && _circ6 >= 0.50 && _circ6 <= 0.86 &&
      !isNaN(_sol6) && _sol6 >= 0.58;

    if (_zonaCurvilineaFrontera) {
      const _catCurv = (_arNorm6 >= 0.82 && _circ6 >= 0.78 && _sol6 >= 0.80)
        ? "Elipsoidal"
        : "Oval";
      const _nombreCurv = convertirCategoriaANombre(_catCurv, metrics);
      categoria_ganadora = _catCurv;
      clasificacion_final = es_fragmento
        ? `Fragmento ${_nombreCurv} (${completitud}% completo)`
        : _nombreCurv;
    }
  }

  if (categoria_ganadora === "Circular") {
    const convexidad = parseFloat(metrics.convexidad) || 1.0;
    const solidez = parseFloat(metrics.solidez) || 1.0;
    const numVertices = parseInt(metrics.num_vertices_detectados) || 0;
    const confianzaRadial = radialAngular?.confianzaGeometria || 0;

    let razon_reclasificacion = null;

    if (confianzaRadial <= 0.88) {
      if (convexidad < 0.65) {
        razon_reclasificacion = `convexidad muy baja (${(convexidad*100).toFixed(0)}% < 65%)`;
      } else if (solidez < 0.70) {
        razon_reclasificacion = `solidez muy baja (${(solidez*100).toFixed(0)}% < 70%)`;
      } else if (numVertices > 10) {
        razon_reclasificacion = `demasiados vértices pronunciados (${numVertices} > 10)`;
      }
    }

    if (razon_reclasificacion) {
      const uniformidadRadial = radialAngular?.uniformidadRadial || 0;
      if (uniformidadRadial >= 0.70 && numVertices >= 4 && numVertices <= 12) {
        categoria_ganadora = "Poligonal";
        clasificacion_final = es_fragmento ? `Fragmento Poligonal (${completitud}% completo)` : "Forma Poligonal";
      } else {
        categoria_ganadora = "Irregular";
        clasificacion_final = es_fragmento ? `Fragmento Irregular (${completitud}% completo)` : "Forma Irregular";
      }
    }
  }

  const interpretacionTipologica = inferirInterpretacionTipologica(
    clasificacion_final,
    categoria_ganadora,
    contextoMorfologico,
    es_fragmento,
    completitud
  );

  let suma_pesos = 0;
  let suma_confianzas_ponderadas = 0;
  let metodos_coincidentes = 0;
  let total_metodos_validos = 0;

  for (const [nombre, datos] of Object.entries(evidencias)) {
    if (datos.clasificacion === "No calculado" || datos.clasificacion === "Indeterminada") {
      continue;
    }

    if (datos.peso === 0) {
      continue;
    }

    total_metodos_validos++;
    suma_pesos += datos.peso;
    const categoria = mapearACategoria(datos.clasificacion);

    if (categoria === categoria_ganadora) {
      suma_confianzas_ponderadas += datos.peso * datos.confianza;
      metodos_coincidentes++;
    }
  }

  const confianza_base = suma_pesos > 0 ? (suma_confianzas_ponderadas / suma_pesos) : 0;
  const factor_consenso = total_metodos_validos > 0 ? (metodos_coincidentes / total_metodos_validos) : 0;
  let confianza_global = (confianza_base * 0.7) + (factor_consenso * 0.3);

  const solidez = parseFloat(metrics.solidity) || 0;
  if (es_fragmento && solidez < 0.85) {
    confianza_global += 0.05;
  }

  const simetria = parseFloat(metrics.simetria_bilateral) || 0;
  if (simetria > 0.90 && categoria_ganadora !== "Irregular") {
    confianza_global += 0.05;
  }

  if (categoria_ganadora === "Cuadrangular" && parseInt(metrics.num_angulos_rectos) >= 4) {
    confianza_global += 0.05;
  }

  if (segundo_lugar && (votos_ganador - segundo_lugar[1]) > 1.5) {
    confianza_global += 0.03;
  }

  confianza_global = Math.max(0, Math.min(1, confianza_global));

  const razonamiento = [];

  razonamiento.push(`Votación: "${categoria_ganadora}" ganó con ${votos_ganador.toFixed(2)} votos ponderados`);
  razonamiento.push(`Consenso: ${metodos_coincidentes}/${total_metodos_validos} métodos coinciden`);

  if (es_fragmento) {
    razonamiento.push(`Fragmentación: Objeto ${completitud}% completo detectado por análisis radial-angular`);
  }
  razonamiento.push(`Contexto morfológico: topología ${contextoMorfologico.topologiaBase}, familia radial ${contextoMorfologico.categoriaRadial}`);
  if (interpretacionTipologica.requiere_reinterpretacion) {
    razonamiento.push(`Interpretación tipológica: ${interpretacionTipologica.forma_tipologica_inferida}`);
  }

  for (const [nombre, datos] of Object.entries(evidencias)) {
    if (datos.clasificacion === "No calculado" || datos.clasificacion === "Indeterminada") {
      continue;
    }
    const categoria = mapearACategoria(datos.clasificacion);
    if (categoria === categoria_ganadora) {
      razonamiento.push(`${nombre}: "${datos.clasificacion}"(confianza ${(datos.confianza*100).toFixed(0)}%)`);
    } else {
      razonamiento.push(`${nombre}: "${datos.clasificacion}"(discrepante)`);
    }
  }

  return {
    clasificacion_final: clasificacion_final,
    categoria_base: categoria_ganadora,
    confianza_global: confianza_global,
    metodos_coincidentes: metodos_coincidentes,
    total_metodos: total_metodos_validos,
    votos_detallados: votos,
    razonamiento: razonamiento,
    evidencias: evidencias,
    contexto_morfologico: contextoMorfologico,
    forma_geometrica_observada: interpretacionTipologica.forma_geometrica_observada,
    forma_tipologica_inferida: interpretacionTipologica.forma_tipologica_inferida,
    razon_tipologica: interpretacionTipologica.razon_tipologica,
    requiere_reinterpretacion_tipologica: interpretacionTipologica.requiere_reinterpretacion,
    es_fragmento: es_fragmento,
    completitud: completitud
  };
}
