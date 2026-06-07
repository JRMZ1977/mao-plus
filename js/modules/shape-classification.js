/**
 * MÓDULO: shape-classification.js
 *
 * Funciones de clasificación geométrica e idealización de formas.
 * Análisis estadístico de contornos para detectar geometrías ideales.
 *
 * Características:
 * - Detección de vértices significativos
 * - Análisis de continuidad geométrica
 * - Simplificación Douglas-Peucker adaptativa
 * - Generación de formas ideales (círculo, elipse, polígonos)
 * - Análisis radial-angular desde centroide
 * - Clasificación de 18 morfotipos arqueológicos
 */

import * as GM from './geometry-primitives.js';
import * as MM from './morphometric-metrics.js';

// ============================================================================
// FUNCIONES AUXILIARES BÁSICAS
// ============================================================================

/**
 * Extrae coordenada X de un punto (array o objeto)
 */
function getX(p) {
  return p.x !== undefined ? p.x : p[0];
}

/**
 * Extrae coordenada Y de un punto (array o objeto)
 */
function getY(p) {
  return p.y !== undefined ? p.y : p[1];
}

// ============================================================================
// ANÁLISIS DE CONTINUIDAD GEOMÉTRICA Y DETECCIÓN DE VÉRTICES
// ============================================================================

/**
 * Aproxima vértices de un contorno detectando cambios de dirección significativos
 * @param {Array} contourPoints - Puntos del contorno
 * @returns {Object} {count, points}
 */
export function aproximarVertices(contourPoints) {
  if (!contourPoints || contourPoints.length < 3) {
    return { count: 0, points: [] };
  }

  const n = contourPoints.length;

  // Calcular perímetro para determinar epsilon adaptativo
  let perimeter = 0;
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const dx = contourPoints[next][0] - contourPoints[i][0];
    const dy = contourPoints[next][1] - contourPoints[i][1];
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }

  // Epsilon adaptativo: 1-3% del perímetro
  const epsilon = Math.max(perimeter * 0.015, 2.0);

  // Ventana adaptativa: ~4% del nº de puntos (mín. 3, máx. 25)
  const windowSize = Math.max(3, Math.min(25, Math.floor(n * 0.04)));

  // Simplificación: buscar puntos con cambios de dirección significativos
  const vertices = [];
  const angleThreshold = Math.PI * 0.15; // ~27 grados

  for (let i = 0; i < n; i++) {
    const prev = contourPoints[(i - windowSize + n) % n];
    const curr = contourPoints[i];
    const next = contourPoints[(i + windowSize) % n];

    // Vectores de dirección: llegada (prev→curr) y salida (curr→next)
    const v1 = [curr[0] - prev[0], curr[1] - prev[1]];
    const v2 = [next[0] - curr[0], next[1] - curr[1]];

    // Producto punto y magnitudes
    const dot = v1[0] * v2[0] + v1[1] * v2[1];
    const mag1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1]);
    const mag2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1]);

    if (mag1 > 0 && mag2 > 0) {
      const cosAngle = dot / (mag1 * mag2);
      const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));

      // Si el ángulo de cambio de dirección es significativo, es un vértice
      if (angle > angleThreshold) {
        vertices.push([curr[0], curr[1]]);
      }
    }
  }

  // Filtrar vértices muy cercanos
  const filteredVertices = [];
  const minDistance = epsilon;

  vertices.forEach(vertex => {
    let tooClose = false;
    for (const existing of filteredVertices) {
      const dx = vertex[0] - existing[0];
      const dy = vertex[1] - existing[1];
      if (Math.sqrt(dx * dx + dy * dy) < minDistance) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      filteredVertices.push(vertex);
    }
  });

  return {
    count: filteredVertices.length,
    points: filteredVertices
  };
}

/**
 * Análisis de continuidad geométrica: detecta puntos que rompen la tendencia estadística
 * @param {Array} contourPoints - Puntos del contorno
 * @param {Number} windowSize - Tamaño de ventana para análisis
 * @returns {Array} Scores de continuidad [0,1]
 */
export function analizarContinuidadGeometrica(contourPoints, windowSize = 11) {
  const n = contourPoints.length;
  const scores = new Array(n).fill(0);

  // Para cada punto, calcular su "score de continuidad"
  for (let i = 0; i < n; i++) {
    const window = [];

    // Extraer ventana de puntos alrededor
    for (let j = -Math.floor(windowSize/2); j <= Math.floor(windowSize/2); j++) {
      const idx = (i + j + n) % n;
      window.push(contourPoints[idx]);
    }

    // Calcular dirección promedio (vector tangente estadístico)
    let sumDx = 0, sumDy = 0, count = 0;
    for (let k = 1; k < window.length; k++) {
      const dx = getX(window[k]) - getX(window[k-1]);
      const dy = getY(window[k]) - getY(window[k-1]);
      sumDx += dx;
      sumDy += dy;
      count++;
    }
    const avgDx = sumDx / count;
    const avgDy = sumDy / count;
    const avgMag = Math.sqrt(avgDx * avgDx + avgDy * avgDy);

    if (avgMag === 0) {
      scores[i] = 1.0; // Punto estable
      continue;
    }

    // Calcular desviación del punto central respecto a la tendencia
    const centerIdx = Math.floor(window.length / 2);
    const actualDx = getX(window[centerIdx + 1]) - getX(window[centerIdx - 1]);
    const actualDy = getY(window[centerIdx + 1]) - getY(window[centerIdx - 1]);
    const actualMag = Math.sqrt(actualDx * actualDx + actualDy * actualDy);

    if (actualMag === 0) {
      scores[i] = 1.0;
      continue;
    }

    // Similitud coseno: mide si el punto sigue la tendencia
    const cosineSimilarity = (actualDx * avgDx + actualDy * avgDy) / (actualMag * avgMag);

    // Score de continuidad: 1.0 = perfecta continuidad, 0.0 = discontinuidad total
    scores[i] = (cosineSimilarity + 1) / 2; // Normalizar [0,1]
  }

  return scores;
}

/**
 * Filtrado estadístico de ruido de alta frecuencia
 * @param {Array} contourPoints - Puntos del contorno
 * @param {Array} continuityScores - Scores de continuidad
 * @param {Number} threshold - Umbral de continuidad (por defecto 0.75)
 * @returns {Array} Contorno filtrado
 */
export function filtrarRuidoEstadistico(contourPoints, continuityScores, threshold = 0.75) {
  const filtered = [];

  for (let i = 0; i < contourPoints.length; i++) {
    // Solo mantener puntos con alta continuidad (geometría real)
    if (continuityScores[i] >= threshold) {
      filtered.push(contourPoints[i]);
    }
  }

  // Si el filtrado es muy agresivo, usar threshold más permisivo
  if (filtered.length < contourPoints.length * 0.3) {
    return filtrarRuidoEstadistico(contourPoints, continuityScores, threshold * 0.8);
  }

  return filtered;
}

/**
 * Detección de vértices significativos mediante análisis de curvatura local
 * @param {Array} contourPoints - Puntos del contorno
 * @param {Number} minCurvature - Curvatura mínima
 * @returns {Array} Array de vértices con índice, punto y curvatura
 */
export function detectarVerticesSignificativos(contourPoints, minCurvature = 0.15) {
  const n = contourPoints.length;
  const vertices = [];
  const curvaturas = new Array(n).fill(0);

  // Calcular curvatura en cada punto (cambio de dirección)
  for (let i = 0; i < n; i++) {
    const prev = contourPoints[(i - 1 + n) % n];
    const curr = contourPoints[i];
    const next = contourPoints[(i + 1) % n];

    // Vectores
    const v1x = getX(curr) - getX(prev);
    const v1y = getY(curr) - getY(prev);
    const v2x = getX(next) - getX(curr);
    const v2y = getY(next) - getY(curr);

    // Magnitudes
    const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);

    if (mag1 > 0 && mag2 > 0) {
      // Producto cruz normalizado = curvatura
      const crossProduct = v1x * v2y - v1y * v2x;
      const curvatura = Math.abs(crossProduct) / (mag1 * mag2);
      curvaturas[i] = curvatura;
    }
  }

  // Análisis estadístico: umbral adaptativo basado en media y desviación estándar
  const mean = curvaturas.reduce((a, b) => a + b, 0) / n;
  const variance = curvaturas.reduce((a, c) => a + (c - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  const adaptiveThreshold = Math.max(minCurvature, mean + stdDev);

  // Detectar vértices: curvaturas significativamente mayores a la media
  for (let i = 0; i < n; i++) {
    if (curvaturas[i] >= adaptiveThreshold) {
      vertices.push({
        index: i,
        point: contourPoints[i],
        curvatura: curvaturas[i]
      });
    }
  }

  return vertices;
}

/**
 * Algoritmo Douglas-Peucker mejorado para simplificación de líneas
 * @param {Array} points - Puntos a simplificar
 * @param {Number} epsilon - Tolerancia de distancia
 * @returns {Array} Puntos simplificados
 */
export function douglasPeucker(points, epsilon) {
  if (points.length <= 2) return points;

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const d = distanciaPerpendicularALinea(points[i], points[0], points[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const recResults1 = douglasPeucker(points.slice(0, index + 1), epsilon);
    const recResults2 = douglasPeucker(points.slice(index), epsilon);
    return recResults1.slice(0, -1).concat(recResults2);
  } else {
    return [points[0], points[end]];
  }
}

/**
 * Calcula la distancia perpendicular de un punto a una línea
 * @param {*} punto - Punto de evaluación
 * @param {*} lineaInicio - Inicio de línea
 * @param {*} lineaFin - Fin de línea
 * @returns {Number} Distancia perpendicular
 */
export function distanciaPerpendicularALinea(punto, lineaInicio, lineaFin) {
  const px = getX(punto);
  const py = getY(punto);
  const x1 = getX(lineaInicio);
  const y1 = getY(lineaInicio);
  const x2 = getX(lineaFin);
  const y2 = getY(lineaFin);

  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  }

  const numerador = Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1);
  const denominador = Math.sqrt(dx * dx + dy * dy);

  return numerador / denominador;
}

/**
 * Suavizado estadístico mediante filtro Gaussiano
 * @param {Array} points - Puntos a suavizar
 * @param {Number} windowSize - Tamaño de ventana
 * @returns {Array} Puntos suavizados
 */
export function suavizarContorno(points, windowSize = 7) {
  if (points.length < windowSize) return points;

  const smoothed = [];
  const halfWindow = Math.floor(windowSize / 2);

  // Kernel Gaussiano
  const sigma = windowSize / 3.0;
  const kernel = [];
  let kernelSum = 0;
  for (let i = -halfWindow; i <= halfWindow; i++) {
    const weight = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(weight);
    kernelSum += weight;
  }
  // Normalizar kernel
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= kernelSum;
  }

  for (let i = 0; i < points.length; i++) {
    let sumX = 0;
    let sumY = 0;

    for (let j = -halfWindow; j <= halfWindow; j++) {
      const idx = (i + j + points.length) % points.length;
      const weight = kernel[j + halfWindow];
      sumX += getX(points[idx]) * weight;
      sumY += getY(points[idx]) * weight;
    }

    smoothed.push({x: sumX, y: sumY});
  }

  return smoothed;
}

// ============================================================================
// GENERACIÓN DE FORMAS IDEALES
// ============================================================================

/**
 * Genera un círculo perfecto
 * @param {Number} centroX - Centro X
 * @param {Number} centroY - Centro Y
 * @param {Number} radio - Radio
 * @param {Number} numPuntos - Número de puntos (por defecto 32)
 * @returns {Array} Puntos del círculo ideal
 */
export function generarCirculoIdeal(centroX, centroY, radio, numPuntos = 32) {
  const puntos = [];
  for (let i = 0; i < numPuntos; i++) {
    const angulo = (2 * Math.PI * i) / numPuntos;
    puntos.push({
      x: centroX + radio * Math.cos(angulo),
      y: centroY + radio * Math.sin(angulo)
    });
  }
  return puntos;
}

/**
 * Genera una elipse perfecta
 * @param {Number} centroX - Centro X
 * @param {Number} centroY - Centro Y
 * @param {Number} radioMayor - Radio mayor (semieje a)
 * @param {Number} radioMenor - Radio menor (semieje b)
 * @param {Number} anguloRotacion - Ángulo de rotación en radianes
 * @param {Number} numPuntos - Número de puntos (por defecto 32)
 * @returns {Array} Puntos de la elipse ideal
 */
export function generarElipseIdeal(centroX, centroY, radioMayor, radioMenor, anguloRotacion, numPuntos = 32) {
  const puntos = [];
  const cos = Math.cos(anguloRotacion);
  const sin = Math.sin(anguloRotacion);

  for (let i = 0; i < numPuntos; i++) {
    const t = (2 * Math.PI * i) / numPuntos;
    const x = radioMayor * Math.cos(t);
    const y = radioMenor * Math.sin(t);

    // Aplicar rotación
    puntos.push({
      x: centroX + x * cos - y * sin,
      y: centroY + x * sin + y * cos
    });
  }
  return puntos;
}

/**
 * Genera un triángulo equilátero
 * @param {Number} centroX - Centro X
 * @param {Number} centroY - Centro Y
 * @param {Number} area - Área del triángulo
 * @returns {Array} Vértices del triángulo ideal
 */
export function generarTrianguloIdeal(centroX, centroY, area) {
  const lado = Math.sqrt((4 * area) / Math.sqrt(3));
  const altura = (Math.sqrt(3) / 2) * lado;

  return [
    {x: centroX, y: centroY - (2/3) * altura},                    // Vértice superior
    {x: centroX - lado/2, y: centroY + (1/3) * altura},          // Vértice inferior izquierdo
    {x: centroX + lado/2, y: centroY + (1/3) * altura}           // Vértice inferior derecho
  ];
}

/**
 * Genera un cuadrado perfecto
 * @param {Number} centroX - Centro X
 * @param {Number} centroY - Centro Y
 * @param {Number} area - Área del cuadrado
 * @returns {Array} Vértices del cuadrado ideal
 */
export function generarCuadradoIdeal(centroX, centroY, area) {
  const lado = Math.sqrt(area);
  const mitad = lado / 2;

  return [
    {x: centroX - mitad, y: centroY - mitad},  // Superior izquierda
    {x: centroX + mitad, y: centroY - mitad},  // Superior derecha
    {x: centroX + mitad, y: centroY + mitad},  // Inferior derecha
    {x: centroX - mitad, y: centroY + mitad}   // Inferior izquierda
  ];
}

/**
 * Genera un rectángulo perfecto
 * @param {Number} centroX - Centro X
 * @param {Number} centroY - Centro Y
 * @param {Number} ancho - Ancho del rectángulo
 * @param {Number} alto - Alto del rectángulo
 * @returns {Array} Vértices del rectángulo ideal
 */
export function generarRectanguloIdeal(centroX, centroY, ancho, alto) {
  const mitadAncho = ancho / 2;
  const mitadAlto = alto / 2;

  return [
    {x: centroX - mitadAncho, y: centroY - mitadAlto},
    {x: centroX + mitadAncho, y: centroY - mitadAlto},
    {x: centroX + mitadAncho, y: centroY + mitadAlto},
    {x: centroX - mitadAncho, y: centroY + mitadAlto}
  ];
}

/**
 * Genera un polígono regular
 * @param {Number} centroX - Centro X
 * @param {Number} centroY - Centro Y
 * @param {Number} radio - Radio circunscrito
 * @param {Number} numLados - Número de lados
 * @returns {Array} Vértices del polígono regular ideal
 */
export function generarPoligonoRegularIdeal(centroX, centroY, radio, numLados) {
  const puntos = [];
  for (let i = 0; i < numLados; i++) {
    const angulo = (2 * Math.PI * i) / numLados - Math.PI / 2; // Empezar desde arriba
    puntos.push({
      x: centroX + radio * Math.cos(angulo),
      y: centroY + radio * Math.sin(angulo)
    });
  }
  return puntos;
}

/**
 * Calcula el ángulo de rotación principal de una elipse usando PCA simplificado
 * @param {Array} contourPoints - Puntos del contorno
 * @param {Array} centroid - Centroide [x, y]
 * @returns {Number} Ángulo de rotación en radianes
 */
export function calcularAnguloRotacionElipse(contourPoints, centroid) {
  let sumXX = 0, sumYY = 0, sumXY = 0;
  for (const p of contourPoints) {
    const dx = getX(p) - centroid[0];
    const dy = getY(p) - centroid[1];
    sumXX += dx * dx;
    sumYY += dy * dy;
    sumXY += dx * dy;
  }

  // Calcular ángulo del eje principal
  if (sumXY !== 0) {
    return 0.5 * Math.atan2(2 * sumXY, sumXX - sumYY);
  }
  return 0;
}

// ============================================================================
// ANÁLISIS DE REGULARIDAD Y DISTRIBUCIÓN GEOMÉTRICA
// ============================================================================

/**
 * Análisis de regularidad geométrica usando compacidad y distribución radial
 * @param {Array} contourPoints - Puntos del contorno
 * @param {*} centroid - Centroide {x, y} o [x, y]
 * @param {Number} area - Área de la forma
 * @param {Number} perimetro - Perímetro de la forma
 * @returns {Object} Análisis de regularidad con métricas estadísticas
 */
export function analizarRegularidadGeometrica(contourPoints, centroid, area, perimetro) {
  const cx = centroid.x !== undefined ? centroid.x : centroid[0];
  const cy = centroid.y !== undefined ? centroid.y : centroid[1];

  // Compacidad (Isoperimetric Quotient)
  const compacidad = (4 * Math.PI * area) / (perimetro * perimetro);

  // Distribución radial
  const distancias = [];
  for (const p of contourPoints) {
    const dx = getX(p) - cx;
    const dy = getY(p) - cy;
    const distancia = Math.sqrt(dx * dx + dy * dy);
    distancias.push(distancia);
  }

  // Estadísticas de distribución radial
  const distanciaMedia = distancias.reduce((a, b) => a + b, 0) / distancias.length;
  const distanciaMin = Math.min(...distancias);
  const distanciaMax = Math.max(...distancias);

  // Varianza radial
  const varianzaRadial = distancias.reduce((acc, d) => acc + (d - distanciaMedia) ** 2, 0) / distancias.length;
  const desviacionRadial = Math.sqrt(varianzaRadial);

  // Coeficiente de variación radial
  const coeficienteVariacion = desviacionRadial / distanciaMedia;

  // Regularidad radial
  const regularidadRadial = 1 / (1 + coeficienteVariacion);

  // Ratio de extensión radial
  const ratioExtension = distanciaMin / distanciaMax;

  // Índice de regularidad combinado
  const indiceRegularidad = (compacidad * 0.4) + (regularidadRadial * 0.4) + (ratioExtension * 0.2);

  return {
    compacidad: compacidad,
    distanciaMedia: distanciaMedia,
    distanciaMin: distanciaMin,
    distanciaMax: distanciaMax,
    desviacionRadial: desviacionRadial,
    coeficienteVariacion: coeficienteVariacion,
    regularidadRadial: regularidadRadial,
    ratioExtension: ratioExtension,
    indiceRegularidad: indiceRegularidad,

    // Interpretación cualitativa
    esAltamenteRegular: indiceRegularidad >= 0.75,
    esModeradamenteRegular: indiceRegularidad >= 0.60 && indiceRegularidad < 0.75,
    esIrregular: indiceRegularidad < 0.60
  };
}

/**
 * Análisis radial-angular desde centroide usando coordenadas polares
 * Detecta formas regulares incluso en fragmentos incompletos
 * @param {Array} contourPoints - Puntos del contorno
 * @param {*} centroid - Centroide {x, y} o [x, y]
 * @returns {Object} Análisis radial-angular con geometría inferida
 */
export function analizarDistribucionRadialAngular(contourPoints, centroid) {
  const cx = centroid.x !== undefined ? centroid.x : centroid[0];
  const cy = centroid.y !== undefined ? centroid.y : centroid[1];

  // Convertir a coordenadas polares (r, θ)
  const puntosPolares = [];
  for (const p of contourPoints) {
    const dx = getX(p) - cx;
    const dy = getY(p) - cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    const theta = Math.atan2(dy, dx);
    puntosPolares.push({ r, theta, x: getX(p), y: getY(p) });
  }

  // Ordenar por ángulo
  puntosPolares.sort((a, b) => a.theta - b.theta);

  // Análisis de cobertura angular
  const anguloMin = puntosPolares[0].theta;
  const anguloMax = puntosPolares[puntosPolares.length - 1].theta;
  const coberturaAngular = anguloMax - anguloMin;
  const coberturaGrados = (coberturaAngular * 180 / Math.PI);

  // Detectar gaps angulares
  const UMBRAL_GAP = 15 * Math.PI / 180; // 15 grados
  const gaps = [];
  for (let i = 1; i < puntosPolares.length; i++) {
    const gap = puntosPolares[i].theta - puntosPolares[i-1].theta;
    if (gap > UMBRAL_GAP) {
      gaps.push({
        inicio: puntosPolares[i-1].theta,
        fin: puntosPolares[i].theta,
        tamaño: gap * 180 / Math.PI
      });
    }
  }

  // Clasificar completitud
  const esFragmento = gaps.length > 0 || coberturaAngular < (2 * Math.PI * 0.85);
  const porcentajeCompletitud = (coberturaAngular / (2 * Math.PI)) * 100;

  // Análisis de uniformidad radial por sector angular
  const NUM_SECTORES = 36;
  const sectores = new Array(NUM_SECTORES).fill(null).map(() => ({ radios: [], count: 0 }));

  for (const punto of puntosPolares) {
    const thetaNormalizado = punto.theta < 0 ? punto.theta + 2 * Math.PI : punto.theta;
    const sectorIdx = Math.floor((thetaNormalizado / (2 * Math.PI)) * NUM_SECTORES) % NUM_SECTORES;
    sectores[sectorIdx].radios.push(punto.r);
    sectores[sectorIdx].count++;
  }

  // Calcular radio promedio por sector
  const radiosPromedioSectores = [];
  for (const sector of sectores) {
    if (sector.count > 0) {
      const radioPromedio = sector.radios.reduce((a, b) => a + b, 0) / sector.count;
      radiosPromedioSectores.push(radioPromedio);
    }
  }

  // Inferir geometría ideal subyacente
  const radioGlobalPromedio = puntosPolares.reduce((sum, p) => sum + p.r, 0) / puntosPolares.length;
  const varianzaRadios = radiosPromedioSectores.reduce((sum, r) => sum + (r - radioGlobalPromedio) ** 2, 0) / radiosPromedioSectores.length;
  const desviacionRadios = Math.sqrt(varianzaRadios);
  const coeficienteVariacionRadial = desviacionRadios / radioGlobalPromedio;

  const uniformidadRadial = 1 / (1 + coeficienteVariacionRadial);

  // Detección de vértices pronunciados
  let cambiosAbruptos = 0;
  const UMBRAL_CAMBIO_ABRUPTO = 0.07;

  for (let i = 0; i < radiosPromedioSectores.length - 1; i++) {
    const r1 = radiosPromedioSectores[i];
    const r2 = radiosPromedioSectores[i + 1];
    const cambioRelativo = Math.abs(r2 - r1) / radioGlobalPromedio;

    if (cambioRelativo > UMBRAL_CAMBIO_ABRUPTO) {
      cambiosAbruptos++;
    }
  }

  // Análisis con ventana de 3 sectores
  let cambiosAbrupto3Sectores = 0;
  for (let i = 0; i < radiosPromedioSectores.length - 2; i++) {
    const r1 = radiosPromedioSectores[i];
    const r3 = radiosPromedioSectores[i + 2];
    const cambioRelativo = Math.abs(r3 - r1) / radioGlobalPromedio;

    if (cambioRelativo > 0.12) {
      cambiosAbrupto3Sectores++;
    }
  }

  const porcentajeCambiosAbruptos = cambiosAbruptos / radiosPromedioSectores.length;
  const porcentajeCambios3Sectores = cambiosAbrupto3Sectores / (radiosPromedioSectores.length - 2);
  const tieneVerticesPronunciados = porcentajeCambiosAbruptos > 0.15 || porcentajeCambios3Sectores > 0.10;

  // Identificar geometría ideal
  let geometriaInferida = "Irregular";
  let confianzaGeometria = 0;

  if (tieneVerticesPronunciados) {
    // Calcular si la variación radial es gradual (elíptica) vs abrupta (esquinas)
    const cambiosOrdenados = [];
    for (let _i = 0; _i < radiosPromedioSectores.length - 1; _i++) {
      cambiosOrdenados.push(Math.abs(radiosPromedioSectores[_i+1] - radiosPromedioSectores[_i]) / radioGlobalPromedio);
    }
    cambiosOrdenados.sort((a, b) => b - a);

    const sumaCambiosTotal = cambiosOrdenados.reduce((s, v) => s + v, 0);
    const suma3Mayores = cambiosOrdenados.slice(0, 3).reduce((s, v) => s + v, 0);
    const concentracionCambios = sumaCambiosTotal > 0 ? suma3Mayores / sumaCambiosTotal : 1;
    const esElipsoidal = concentracionCambios < 0.55 && uniformidadRadial >= 0.72;

    if (esElipsoidal) {
      // Análisis adicional para discriminar morfotipos elipsoidales
      const arNorm = 0.5; // Placeholder - debería venir del contexto

      // Buscar minimos radiales para detectar puntas
      let _minR_v = Infinity, _minIdx = 0;
      for (let _si = 0; _si < NUM_SECTORES; _si++) {
        if (sectores[_si].count > 0) {
          const _v = sectores[_si].radios.reduce((a, b) => a + b, 0) / sectores[_si].count;
          if (_v < _minR_v) { _minR_v = _v; _minIdx = _si; }
        }
      }

      geometriaInferida = "Elipsoidal";
      confianzaGeometria = uniformidadRadial;

      if (esFragmento) {
        geometriaInferida = `Fragmento Elipsoidal (${porcentajeCompletitud.toFixed(0)}% completo)`;
      }
    } else if (uniformidadRadial >= 0.70) {
      geometriaInferida = "Poligonal";
      confianzaGeometria = Math.max(porcentajeCambiosAbruptos, porcentajeCambios3Sectores);

      if (esFragmento) {
        geometriaInferida = `Fragmento Poligonal (${porcentajeCompletitud.toFixed(0)}% completo)`;
      }
    } else {
      geometriaInferida = "Irregular";
      confianzaGeometria = 1 - uniformidadRadial;

      if (esFragmento) {
        geometriaInferida = `Fragmento Irregular (${porcentajeCompletitud.toFixed(0)}% completo)`;
      }
    }
  } else if (uniformidadRadial >= 0.93) {
    geometriaInferida = "Circular";
    confianzaGeometria = uniformidadRadial;

    if (esFragmento) {
      geometriaInferida = `Fragmento Circular (${porcentajeCompletitud.toFixed(0)}% completo)`;
    }
  } else if (uniformidadRadial >= 0.70 && uniformidadRadial < 0.93) {
    geometriaInferida = "Poligonal";
    confianzaGeometria = uniformidadRadial;

    if (esFragmento) {
      geometriaInferida = `Fragmento Poligonal (${porcentajeCompletitud.toFixed(0)}% completo)`;
    }
  } else {
    geometriaInferida = "Irregular";
    confianzaGeometria = 1 - uniformidadRadial;

    if (esFragmento) {
      geometriaInferida = `Fragmento Irregular (${porcentajeCompletitud.toFixed(0)}% completo)`;
    }
  }

  return {
    puntosPolares: puntosPolares,
    coberturaAngular: coberturaAngular,
    coberturaGrados: coberturaGrados,
    porcentajeCompletitud: porcentajeCompletitud,
    esFragmento: esFragmento,
    gaps: gaps,
    radioPromedio: radioGlobalPromedio,
    desviacionRadial: desviacionRadios,
    coeficienteVariacionRadial: coeficienteVariacionRadial,
    uniformidadRadial: uniformidadRadial,
    geometriaInferida: geometriaInferida,
    confianzaGeometria: confianzaGeometria,
    sectoresAnalizados: radiosPromedioSectores.length,
    sectoresTotal: NUM_SECTORES
  };
}

/**
 * Generación de forma ideal desde análisis radial-angular
 * @param {Object} distribucionRadialAngular - Resultado del análisis radial
 * @param {Array} centroid - Centroide [x, y]
 * @param {Number} ancho - Ancho del objeto
 * @param {Number} alto - Alto del objeto
 * @param {Number} area - Área del objeto
 * @param {Number} aspectRatio - Aspect ratio
 * @param {Number} excentricidad - Excentricidad
 * @returns {Object} {vertices, tipo, numPuntos, radioPromedio, uniformidadRadial}
 */
export function generarFormaIdealDesdeAnalisisRadial(distribucionRadialAngular, centroid, ancho, alto, area, aspectRatio, excentricidad) {
  const {
    uniformidadRadial,
    coberturaGrados,
    porcentajeCompletitud,
    esFragmento,
    radioPromedio,
    geometriaInferida
  } = distribucionRadialAngular;

  let vertices = [];
  let tipo = "Irregular";
  let numPuntos = 0;

  if (geometriaInferida === "Poligonal" || geometriaInferida.includes("Poligonal")) {
    const arValido = !isNaN(aspectRatio) && isFinite(aspectRatio);

    if (arValido && aspectRatio >= 0.85 && aspectRatio <= 1.15) {
      vertices = generarCuadradoIdeal(centroid[0], centroid[1], area);
      tipo = "Cuadrado";
      numPuntos = 4;
    } else if (arValido) {
      vertices = generarRectanguloIdeal(centroid[0], centroid[1], ancho, alto);
      tipo = "Rectángulo";
      numPuntos = 4;
    } else {
      const radioEquiv = Math.sqrt(area / Math.PI);
      vertices = generarPoligonoRegularIdeal(centroid[0], centroid[1], radioEquiv, 6);
      tipo = "Polígono Regular (6 lados)";
      numPuntos = 6;
    }
  } else if (uniformidadRadial >= 0.75) {
    const arValido = !isNaN(aspectRatio) && isFinite(aspectRatio);

    if (!arValido || (aspectRatio >= 0.80 && aspectRatio <= 1.20)) {
      vertices = generarCirculoIdeal(centroid[0], centroid[1], radioPromedio, 32);
      tipo = esFragmento ? `Fragmento Circular (${porcentajeCompletitud.toFixed(0)}%)` : "Círculo";
      numPuntos = 32;
    } else if (arValido && excentricidad > 0.3) {
      const rMayor = Math.max(ancho, alto) / 2;
      const rMenor = Math.min(ancho, alto) / 2;
      const angulo = 0;
      vertices = generarElipseIdeal(centroid[0], centroid[1], rMayor, rMenor, angulo, 32);
      tipo = esFragmento ? `Fragmento Elíptico (${porcentajeCompletitud.toFixed(0)}%)` : "Elipse";
      numPuntos = 32;
    }
  } else if (uniformidadRadial >= 0.60) {
    const arValido = !isNaN(aspectRatio) && isFinite(aspectRatio);

    if (arValido && aspectRatio >= 0.85 && aspectRatio <= 1.15) {
      vertices = generarCuadradoIdeal(centroid[0], centroid[1], area);
      tipo = "Cuadrado";
      numPuntos = 4;
    } else if (arValido && (aspectRatio < 0.85 || aspectRatio > 1.15)) {
      vertices = generarRectanguloIdeal(centroid[0], centroid[1], ancho, alto);
      tipo = "Rectángulo";
      numPuntos = 4;
    } else {
      const radioEquiv = Math.sqrt(area / Math.PI);
      vertices = generarPoligonoRegularIdeal(centroid[0], centroid[1], radioEquiv, 6);
      tipo = "Polígono Regular (6 lados)";
      numPuntos = 6;
    }
  } else if (uniformidadRadial >= 0.45) {
    vertices = generarTrianguloIdeal(centroid[0], centroid[1], area);
    tipo = "Triángulo Equilátero";
    numPuntos = 3;
  }

  return {
    vertices: vertices,
    tipo: tipo,
    numPuntos: numPuntos,
    radioPromedio: radioPromedio,
    uniformidadRadial: uniformidadRadial
  };
}

/**
 * Validación estadística: Contorno Real vs Forma Ideal
 * @param {Array} contornoReal - Contorno real
 * @param {Array} contornoIdeal - Contorno ideal
 * @param {Array} centroid - Centroide [x, y]
 * @returns {Object} Métricas de similitud y decisión
 */
export function validarFormaIdealContraReal(contornoReal, contornoIdeal, centroid) {
  if (!contornoIdeal || contornoIdeal.length === 0) {
    return {
      desviacionMedia: Infinity,
      coeficienteVariacion: Infinity,
      similitud: 0,
      usarIdeal: false
    };
  }

  // Calcular distancias radiales del contorno REAL
  const distanciasReales = contornoReal.map(p => {
    const dx = getX(p) - centroid[0];
    const dy = getY(p) - centroid[1];
    return Math.sqrt(dx * dx + dy * dy);
  });

  // Calcular distancias radiales del contorno IDEAL
  const distanciasIdeales = contornoIdeal.map(p => {
    const dx = getX(p) - centroid[0];
    const dy = getY(p) - centroid[1];
    return Math.sqrt(dx * dx + dy * dy);
  });

  // Estadísticas
  const mediaReal = distanciasReales.reduce((a, b) => a + b, 0) / distanciasReales.length;
  const mediaIdeal = distanciasIdeales.reduce((a, b) => a + b, 0) / distanciasIdeales.length;

  // Calcular desviación entre real e ideal
  const desviaciones = distanciasReales.map(rReal => {
    return Math.abs(rReal - mediaIdeal);
  });

  const desviacionMedia = desviaciones.reduce((a, b) => a + b, 0) / desviaciones.length;
  const coeficienteVariacion = desviacionMedia / mediaIdeal;

  // Calcular similitud
  const similitud = Math.max(0, Math.min(1, 1 - coeficienteVariacion));

  // Decisión de usar ideal
  const UMBRAL_CV = 0.20;
  const usarIdeal = coeficienteVariacion < UMBRAL_CV;

  return {
    desviacionMedia: desviacionMedia,
    coeficienteVariacion: coeficienteVariacion,
    similitud: similitud,
    usarIdeal: usarIdeal,
    mediaReal: mediaReal,
    mediaIdeal: mediaIdeal
  };
}

// ============================================================================
// CLASIFICACIÓN DE FORMA GEOMÉTRICA
// ============================================================================

/**
 * Clasificación automática de forma geométrica basada en métricas morfológicas
 * @param {Object} metrics - Métricas morfológicas del objeto
 * @param {Number} numVertices - Número de vértices detectados
 * @returns {Object} {nombre, confianza, razon}
 */
export function clasificarFormaGeometrica(metrics, numVertices) {
  const circularidad = parseFloat(metrics.circularity || 0);
  const aspectRatio = parseFloat(metrics.aspect_ratio_tight || 1);
  const solidez = parseFloat(metrics.solidity || 1);
  const excentricidad = parseFloat(metrics.excentricidad || 0);
  const arNorm = Math.min(aspectRatio, 1.0 / (aspectRatio || 0.001));

  const clasificaciones = [];

  // LAMINAR/LINEAL
  if (arNorm < 0.28 && solidez > 0.55) {
    clasificaciones.push({
      nombre: "Laminar",
      confianza: 0.85,
      razon: `Elongación extrema (AR_norm=${arNorm.toFixed(2)} < 0.28), solidez ${solidez.toFixed(2)}`
    });
  }
  // LUNAR/CRESCIENTE
  else if (solidez < 0.60 && circularidad > 0.22 && circularidad < 0.72) {
    clasificaciones.push({
      nombre: "Lunar",
      confianza: 0.80,
      razon: `Solidez muy baja (${solidez.toFixed(2)} < 0.60), forma cóncava/cresciente pronunciada`
    });
  }
  // LUNAR SUAVE
  else if (
    arNorm < 0.52 &&
    (parseFloat(metrics.ratio_radios) || 1.0) < 0.50 &&
    circularidad >= 0.65 && circularidad < 0.86 &&
    solidez >= 0.75 && solidez < 0.95
  ) {
    clasificaciones.push({
      nombre: "Lunar",
      confianza: 0.75,
      razon: `Asimetría radial fuerte, elongada, curvatura lunar`
    });
  }
  // LANCEOLADA
  else if (arNorm >= 0.28 && arNorm < 0.55 &&
           circularidad >= 0.46 && circularidad < 0.76 &&
           solidez >= 0.68 && solidez <= 0.95 &&
           numVertices >= 2 && numVertices <= 7) {
    clasificaciones.push({
      nombre: "Lanceolada",
      confianza: 0.82,
      razon: `Elongada apuntada (AR_norm=${arNorm.toFixed(2)}, circ=${circularidad.toFixed(2)}, solidez=${solidez.toFixed(2)})`
    });
  }
  // AMIGDALOIDE
  else if (arNorm >= 0.53 && arNorm < 0.85 &&
           circularidad >= 0.68 && circularidad < 0.92 &&
           solidez >= 0.83) {
    clasificaciones.push({
      nombre: "Amigdaloide",
      confianza: 0.80,
      razon: `Almendrada (AR_norm=${arNorm.toFixed(2)}), muy convexa (solidez=${solidez.toFixed(2)})`
    });
  }
  // ELIPSOIDAL
  else if (arNorm >= 0.48 && arNorm < 0.82 &&
           circularidad >= 0.62 && circularidad < 0.92 &&
           solidez >= 0.76 && excentricidad >= 0.25) {
    clasificaciones.push({
      nombre: "Elipsoidal",
      confianza: 0.80,
      razon: `Ovalada (AR_norm=${arNorm.toFixed(2)}, exc=${excentricidad.toFixed(2)}), convexa (solidez=${solidez.toFixed(2)})`
    });
  }
  // CÍRCULO
  else if (numVertices > 10 && circularidad >= 0.90 &&
      aspectRatio >= 0.90 && aspectRatio <= 1.10 && excentricidad <= 0.2) {
    clasificaciones.push({
      nombre: "Círculo",
      confianza: 0.95,
      razon: "Alta circularidad (≥0.90), AR≈1, baja excentricidad"
    });
  }
  // CUADRADO
  else if (numVertices >= 3 && numVertices <= 5 && circularidad >= 0.75 && circularidad <= 0.85 &&
           aspectRatio >= 0.85 && aspectRatio <= 1.15 && solidez >= 0.85) {
    clasificaciones.push({
      nombre: "Cuadrado",
      confianza: 0.85,
      razon: "~4 vértices, circularidad ~0.78, AR≈1, alta solidez"
    });
  }
  // RECTÁNGULO
  else if (numVertices >= 3 && numVertices <= 6 && circularidad >= 0.60 && circularidad <= 0.80 &&
           (aspectRatio < 0.80 || aspectRatio > 1.25) && solidez >= 0.80) {
    clasificaciones.push({
      nombre: "Rectángulo",
      confianza: 0.80,
      razon: "~4 vértices, circularidad media (0.60-0.80), AR≠1, solidez alta"
    });
  }
  // TRIÁNGULO
  else if (numVertices >= 2 && numVertices <= 4 && circularidad >= 0.45 && circularidad <= 0.70 && solidez >= 0.80) {
    clasificaciones.push({
      nombre: "Triángulo",
      confianza: 0.75,
      razon: "~3 vértices, circularidad media-baja (0.45-0.70)"
    });
  }
  // TRAPEZOIDAL
  else if (numVertices >= 3 && numVertices <= 6 &&
           circularidad >= 0.58 && circularidad <= 0.82 && solidez >= 0.80) {
    clasificaciones.push({
      nombre: "Trapezoidal",
      confianza: 0.65,
      razon: `~4 vértices, solidez alta (${solidez.toFixed(2)}), forma cuadrangular sin ángulos rectos`
    });
  }
  // ROMBOIDAL
  else if (numVertices >= 3 && numVertices <= 6 &&
           circularidad >= 0.60 && circularidad <= 0.84 &&
           solidez >= 0.78 && excentricidad >= 0.15 && excentricidad < 0.65) {
    clasificaciones.push({
      nombre: "Romboidal",
      confianza: 0.62,
      razon: `~4 vértices, excentricidad ${excentricidad.toFixed(2)}, forma romboidea`
    });
  }
  // PENTÁGONO/HEXÁGONO
  else if (numVertices >= 5 && numVertices <= 7 && circularidad >= 0.60 && circularidad <= 0.80 &&
           aspectRatio >= 0.80 && aspectRatio <= 1.20 && solidez >= 0.80) {
    clasificaciones.push({
      nombre: `Polígono regular (${numVertices} lados)`,
      confianza: 0.70,
      razon: `${numVertices} vértices, circularidad media, AR≈1`
    });
  }
  // ESTRELLA/FORMA COMPLEJA
  else if (numVertices > 8 && circularidad < 0.60 && solidez < 0.70) {
    clasificaciones.push({
      nombre: "Forma estrellada/compleja",
      confianza: 0.65,
      razon: "Muchos vértices, baja circularidad, baja solidez"
    });
  }
  // POLÍGONO IRREGULAR
  else if (numVertices > 6) {
    clasificaciones.push({
      nombre: "Polígono irregular",
      confianza: 0.60,
      razon: "Forma compleja sin patrón geométrico regular"
    });
  }

  // Default
  if (clasificaciones.length === 0) {
    clasificaciones.push({
      nombre: "Forma irregular",
      confianza: 0.50,
      razon: "No encaja en patrones geométricos estándar"
    });
  }

  return clasificaciones.sort((a, b) => b.confianza - a.confianza)[0];
}

/**
 * Simplificación a forma regular: depuración estadística de contorno
 * Función principal que orquesta todo el pipeline de análisis
 * @param {Array} contourPoints - Puntos del contorno original
 * @param {Object} metricas - Métricas morfológicas
 * @param {Object} contornoMetrics - Métricas de contorno con Convex Hull
 * @returns {Object} Forma depurada con vértices finales y clasificación
 */
export function simplificarAFormaRegular(contourPoints, metricas, contornoMetrics) {
  if (!contourPoints || contourPoints.length < 3) {
    return null;
  }

  // Filtrar elementos nulos
  contourPoints = contourPoints.filter(p => p != null);
  if (contourPoints.length < 3) {
    return null;
  }

  // Validar contornoMetrics
  if (!contornoMetrics) {
    contornoMetrics = metricas._contour_data?.metrics || {};
  }

  const area = metricas._contour_data?.metrics?.area_real || 0;
  const perimetro = metricas._contour_data?.metrics?.perimeter_real || 0;

  // PASO 1: Análisis de continuidad geométrica
  const continuityScores = analizarContinuidadGeometrica(contourPoints, 11);
  const avgContinuity = continuityScores.reduce((a, b) => a + b, 0) / continuityScores.length;

  // PASO 2: Filtrado estadístico
  const umbralContinuidad = Math.max(0.70, avgContinuity * 0.85);
  const contornoFiltrado = filtrarRuidoEstadistico(contourPoints, continuityScores, umbralContinuidad);
  const eliminados = contourPoints.length - contornoFiltrado.length;

  // PASO 3: Suavizado Gaussiano
  const contornoSuavizado = suavizarContorno(contornoFiltrado, 7);

  // PASO 4: Detección de vértices significativos
  const verticesSignificativos = detectarVerticesSignificativos(contornoSuavizado, 0.12);

  // PASO 5: Simplificación Douglas-Peucker
  const epsilonBase = perimetro / 250;
  const epsilonAdaptativo = Math.max(1.5, Math.min(5.0, epsilonBase));
  const contornoSimplificado = douglasPeucker(contornoSuavizado, epsilonAdaptativo);

  // PASO 6: Análisis de parámetros geométricos
  const circularidad = parseFloat(metricas.circularity || 0);
  const aspectRatio = parseFloat(metricas.aspect_ratio_tight || 1);
  const solidez = parseFloat(metricas.solidity || 1);
  const centroid = metricas._contour_data?.metrics?.centroid || [0, 0];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of contornoSimplificado) {
    const x = getX(p);
    const y = getY(p);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const ancho = maxX - minX;
  const alto = maxY - minY;
  const radioEquivalente = Math.sqrt(area / Math.PI);

  // PASO 7: Análisis radial-angular
  let puntosParaAnalisis = contornoFiltrado;

  if (contornoMetrics && contornoMetrics.convex_hull && contornoMetrics.convex_hull.length >= 3) {
    const convexHullParaAnalisis = contornoMetrics.convex_hull.map(p => {
      if (Array.isArray(p)) {
        return {x: p[0], y: p[1]};
      }
      return p;
    });
    puntosParaAnalisis = convexHullParaAnalisis;
  }

  const distribucionRadialAngular = analizarDistribucionRadialAngular(puntosParaAnalisis, centroid);

  // PASO 8: Análisis de regularidad
  const regularidad = analizarRegularidadGeometrica(contornoFiltrado, centroid, area, perimetro);

  // Determinar vértices finales
  let verticesFinales = contornoSimplificado;
  let esFormaIdealizada = false;
  let tipoGeometrico = distribucionRadialAngular.geometriaInferida;
  let puntosGenerados = contornoSimplificado.length;

  const convexHullDisponible = contornoMetrics && contornoMetrics.convex_hull && contornoMetrics.convex_hull.length >= 3;

  if (convexHullDisponible) {
    const convexHullSimplificado = contornoMetrics.convex_hull.map(p => {
      if (Array.isArray(p)) {
        return {x: p[0], y: p[1]};
      }
      return p;
    });

    const esCirculoGenuino = (
      verticesSignificativos.length <= 2 &&
      circularidad >= 0.88 &&
      distribucionRadialAngular.uniformidadRadial >= 0.88 &&
      regularidad.indiceRegularidad >= 0.85
    );

    if (esCirculoGenuino) {
      const formaIdealInferida = generarFormaIdealDesdeAnalisisRadial(
        distribucionRadialAngular,
        centroid,
        ancho,
        alto,
        area,
        aspectRatio,
        0
      );
      verticesFinales = formaIdealInferida.vertices;
      esFormaIdealizada = true;
      puntosGenerados = formaIdealInferida.vertices.length;
    } else {
      verticesFinales = convexHullSimplificado;
      esFormaIdealizada = true;
      puntosGenerados = convexHullSimplificado.length;
    }
  }

  // Clasificación definitiva
  const geometriaInferida = distribucionRadialAngular.geometriaInferida;
  const arNorm = Math.min(aspectRatio, 1.0 / (aspectRatio || 0.001));

  let tipoForma = 'irregular';
  let nombreForma = 'Forma Irregular';
  let colorForma = '#6c757d';

  // Árbol de decisión de clasificación (18 categorías)
  if (arNorm < 0.28 && solidez > 0.55) {
    tipoForma = 'laminar';
    nombreForma = 'Forma Laminar';
    colorForma = '#6f42c1';
  } else if (solidez < 0.60 && circularidad < 0.72) {
    tipoForma = 'lunar';
    nombreForma = 'Forma Lunar';
    colorForma = '#20c997';
  } else if (geometriaInferida.includes("Circular")) {
    if (arNorm < 0.80 && regularidad.desviacionRadial > 0) {
      tipoForma = 'elipsoidal';
      nombreForma = 'Forma Elipsoidal';
      colorForma = '#e83e8c';
    } else {
      tipoForma = 'circular';
      nombreForma = 'Forma Circular';
      colorForma = '#007bff';
    }
  } else if (geometriaInferida.includes("Elipsoidal")) {
    tipoForma = 'elipsoidal';
    nombreForma = 'Forma Elipsoidal';
    colorForma = '#e83e8c';
  } else if (geometriaInferida.includes("Oval")) {
    tipoForma = 'oval';
    nombreForma = 'Forma Oval';
    colorForma = '#c0397a';
  } else if (geometriaInferida.includes("Amigdaloide")) {
    tipoForma = 'amigdaloide';
    nombreForma = 'Forma Amigdaloide';
    colorForma = '#795548';
  } else if (geometriaInferida.includes("Lanceolada")) {
    tipoForma = 'lanceolada';
    nombreForma = 'Forma Lanceolada';
    colorForma = '#fd7e14';
  } else if (geometriaInferida.includes("Poligonal") || geometriaInferida.includes("Triangular")) {
    const nV = verticesSignificativos.length;

    if (nV === 3) {
      tipoForma = 'triangular';
      nombreForma = 'Forma Triangular';
      colorForma = '#28a745';
    } else if (nV === 4) {
      if (aspectRatio >= 0.85 && aspectRatio <= 1.18) {
        tipoForma = 'cuadrangular';
        nombreForma = 'Forma Cuadrangular';
        colorForma = '#ffc107';
      } else {
        tipoForma = 'rectangular';
        nombreForma = 'Forma Rectangular';
        colorForma = '#fd7e14';
      }
    } else if (nV === 5) {
      tipoForma = 'pentagonal';
      nombreForma = 'Forma Pentagonal';
      colorForma = '#6610f2';
    } else if (nV === 6) {
      tipoForma = 'hexagonal';
      nombreForma = 'Forma Hexagonal';
      colorForma = '#20c997';
    } else {
      tipoForma = 'poligonal';
      nombreForma = `Forma Poligonal (${nV > 0 ? nV : '?'} vértices)`;
      colorForma = '#17a2b8';
    }
  }

  const parametros = {
    puntos_originales: contourPoints.length,
    puntos_filtrados: contornoFiltrado.length,
    artefactos_eliminados: eliminados,
    puntos_simplificados: contornoSimplificado.length,
    puntos_finales: puntosGenerados,
    reduccion_porcentaje: ((1 - puntosGenerados / contourPoints.length) * 100).toFixed(1),
    epsilon_usado: epsilonAdaptativo.toFixed(2),
    umbral_continuidad: umbralContinuidad.toFixed(3),
    continuidad_promedio: avgContinuity.toFixed(3),
    vertices_significativos: verticesSignificativos.length,
    compacidad: regularidad.compacidad.toFixed(3),
    regularidad_radial: regularidad.regularidadRadial.toFixed(3),
    indice_regularidad: regularidad.indiceRegularidad.toFixed(3),
    radio_medio: regularidad.distanciaMedia.toFixed(1),
    desviacion_radial: regularidad.desviacionRadial.toFixed(1),
    ratio_extension: regularidad.ratioExtension.toFixed(3),
    cobertura_angular_grados: distribucionRadialAngular.coberturaGrados.toFixed(1),
    completitud_porcentaje: distribucionRadialAngular.porcentajeCompletitud.toFixed(0),
    uniformidad_radial_angular: distribucionRadialAngular.uniformidadRadial.toFixed(3),
    cv_radial_angular: (distribucionRadialAngular.coeficienteVariacionRadial * 100).toFixed(1),
    es_fragmento: distribucionRadialAngular.esFragmento,
    geometria_inferida: distribucionRadialAngular.geometriaInferida,
    es_forma_idealizada: esFormaIdealizada,
    tipo_geometrico: tipoGeometrico,
    puntos_generados: puntosGenerados,
    centroide: centroid,
    ancho: ancho.toFixed(1),
    alto: alto.toFixed(1),
    area: area.toFixed(1),
    perimetro: perimetro.toFixed(1),
    radio_equivalente: radioEquivalente.toFixed(1)
  };

  return {
    tipo: tipoForma,
    vertices: verticesFinales,
    parametros: parametros,
    color: colorForma,
    nombre: nombreForma,
    distribucionRadialAngular: distribucionRadialAngular
  };
}
