/**
 * Geometry Primitives Module
 * Pure mathematical functions for convex hull calculations and geometry operations
 * No external dependencies, no side effects
 */

// ============================================================================
// PUNTO ORIENTATION PREDICATE
// ============================================================================

/**
 * Determine orientation of three points (using cross product)
 * Returns positive if counter-clockwise, negative if clockwise, 0 if collinear
 * @param {number[]} p - Point 1 [x, y]
 * @param {number[]} q - Point 2 [x, y]
 * @param {number[]} r - Point 3 [x, y]
 * @returns {number} Cross product of (q-p) × (r-q)
 */
export function orientacion(p, q, r) {
  return (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
}

// ============================================================================
// AREA CALCULATION (SHOELACE FORMULA)
// ============================================================================

/**
 * Calculate polygon area using Shoelace formula (Green's theorem)
 * Supports both {x,y} objects and [x,y] arrays
 * @param {Array} contorno - Polygon vertices as array of points
 * @returns {number} Absolute area value
 */
export function calcularAreaShoelace(contorno) {
  if (!contorno || contorno.length < 3) return 0;

  const getX = (p) => p.x !== undefined ? p.x : p[0];
  const getY = (p) => p.y !== undefined ? p.y : p[1];

  let area = 0;
  const n = contorno.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += getX(contorno[i]) * getY(contorno[j]);
    area -= getX(contorno[j]) * getY(contorno[i]);
  }

  return Math.abs(area) / 2;
}

// ============================================================================
// CONVEX HULL (GRAHAM SCAN)
// ============================================================================

/**
 * Calculate convex hull using Graham Scan algorithm
 * Supports both {x,y} objects and [x,y] array point formats
 * Falls back to radial method for degenerate cases
 * @param {Array} points - Input points
 * @returns {Array} Hull vertices as [x,y] arrays
 */
export function calcularConvexHull(points) {
  if (!points || points.length < 3) {
    return points ? points.slice() : [];
  }

  const pointsCopy = points.map(p => {
    if (Array.isArray(p)) {
      return [p[0], p[1]];
    } else {
      return [p.x, p.y];
    }
  });

  const minX = Math.min(...pointsCopy.map(p => p[0]));
  const maxX = Math.max(...pointsCopy.map(p => p[0]));
  const minY = Math.min(...pointsCopy.map(p => p[1]));
  const maxY = Math.max(...pointsCopy.map(p => p[1]));
  const rangeX = maxX - minX;
  const rangeY = maxY - minY;

  if (rangeX < 3 || rangeY < 3) {
    return [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY]
    ];
  }

  let bottom = 0;
  for (let i = 1; i < pointsCopy.length; i++) {
    if (pointsCopy[i][1] > pointsCopy[bottom][1] ||
        (pointsCopy[i][1] === pointsCopy[bottom][1] && pointsCopy[i][0] < pointsCopy[bottom][0])) {
      bottom = i;
    }
  }

  [pointsCopy[0], pointsCopy[bottom]] = [pointsCopy[bottom], pointsCopy[0]];
  const p0 = pointsCopy[0];

  const sortedPoints = pointsCopy.slice(1).sort((a, b) => {
    const angleA = Math.atan2(a[1] - p0[1], a[0] - p0[0]);
    const angleB = Math.atan2(b[1] - p0[1], b[0] - p0[0]);

    if (Math.abs(angleA - angleB) > 0.0001) return angleA - angleB;

    const distA = (a[0] - p0[0]) ** 2 + (a[1] - p0[1]) ** 2;
    const distB = (b[0] - p0[0]) ** 2 + (b[1] - p0[1]) ** 2;
    return distB - distA;
  });

  const uniquePoints = [sortedPoints[0]];
  for (let i = 1; i < sortedPoints.length; i++) {
    const prevAngle = Math.atan2(sortedPoints[i-1][1] - p0[1], sortedPoints[i-1][0] - p0[0]);
    const currAngle = Math.atan2(sortedPoints[i][1] - p0[1], sortedPoints[i][0] - p0[0]);

    if (Math.abs(currAngle - prevAngle) > 0.0001) {
      uniquePoints.push(sortedPoints[i]);
    }
  }

  const hull = [p0];

  if (uniquePoints.length === 0) {
    return [p0];
  }

  hull.push(uniquePoints[0]);

  for (let i = 1; i < uniquePoints.length; i++) {
    while (hull.length > 1 &&
           orientacion(hull[hull.length - 2], hull[hull.length - 1], uniquePoints[i]) <= 0) {
      hull.pop();
    }
    hull.push(uniquePoints[i]);
  }

  if (hull.length < 3) {
    const centroidX = pointsCopy.reduce((sum, p) => sum + p[0], 0) / pointsCopy.length;
    const centroidY = pointsCopy.reduce((sum, p) => sum + p[1], 0) / pointsCopy.length;

    const radialHull = calcularConvexHullRadial(pointsCopy, centroidX, centroidY);

    if (radialHull && radialHull.length >= 3) {
      if (radialHull.length > 12) {
        return simplificarConvexHull(radialHull, 5.0);
      }
      return radialHull;
    }

    return [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY]
    ];
  }

  if (hull.length > 12) {
    return simplificarConvexHull(hull, 5.0);
  }

  return hull;
}

// ============================================================================
// CONVEX HULL (RADIAL METHOD - FALLBACK)
// ============================================================================

/**
 * Alternative convex hull method using radial sweep
 * Useful when Graham Scan fails with collinear/degenerate points
 * @param {Array} points - Input points as [x,y] arrays
 * @param {number} cx - Centroid x coordinate
 * @param {number} cy - Centroid y coordinate
 * @returns {Array|null} Hull vertices or null if insufficient points
 */
export function calcularConvexHullRadial(points, cx, cy) {
  if (points.length < 3) return null;

  const sectores = 72;
  const puntosPorSector = new Array(sectores).fill(null);
  const distanciasPorSector = new Array(sectores).fill(0);

  for (const p of points) {
    const dx = p[0] - cx;
    const dy = p[1] - cy;
    const angulo = Math.atan2(dy, dx);
    const dist = Math.sqrt(dx * dx + dy * dy);

    const sector = Math.floor((angulo + Math.PI) / (2 * Math.PI / sectores)) % sectores;

    if (dist > distanciasPorSector[sector]) {
      distanciasPorSector[sector] = dist;
      puntosPorSector[sector] = p;
    }
  }

  const hullRadial = puntosPorSector.filter(p => p !== null);

  return hullRadial.length >= 3 ? hullRadial : null;
}

// ============================================================================
// CONVEX HULL SIMPLIFICATION
// ============================================================================

/**
 * Intelligently simplify convex hull while preserving shape
 * Adaptive: smooth curves use gentler simplification, angular shapes use aggressive simplification
 * @param {Array} hull - Hull vertices
 * @param {number} toleranciaBase - Base tolerance in pixels
 * @returns {Array} Simplified hull vertices
 */
export function simplificarConvexHull(hull, toleranciaBase = 5.0) {
  if (!hull || hull.length <= 4) return hull;

  const angulos = [];
  for (let i = 0; i < hull.length; i++) {
    const p1 = hull[i];
    const p2 = hull[(i + 1) % hull.length];
    const p3 = hull[(i + 2) % hull.length];

    const v1x = p2[0] - p1[0];
    const v1y = p2[1] - p1[1];
    const v2x = p3[0] - p2[0];
    const v2y = p3[1] - p2[1];

    const dot = v1x * v2x + v1y * v2y;
    const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);

    if (mag1 > 0 && mag2 > 0) {
      const cosAngulo = dot / (mag1 * mag2);
      const angulo = Math.acos(Math.max(-1, Math.min(1, cosAngulo)));
      angulos.push(angulo);
    }
  }

  const curvaturaMedia = angulos.reduce((sum, a) => sum + a, 0) / angulos.length;
  const curvaturaGrados = curvaturaMedia * 180 / Math.PI;

  const esquinasPronunciadas = angulos.filter(a => a > (30 * Math.PI / 180)).length;
  const porcentajeEsquinas = esquinasPronunciadas / angulos.length;

  let tolerancia = toleranciaBase;
  let mantenerCurva = false;

  if (curvaturaGrados < 15 && porcentajeEsquinas < 0.3) {
    tolerancia = toleranciaBase * 0.5;
    mantenerCurva = true;
  } else if (porcentajeEsquinas > 0.5 || esquinasPronunciadas >= 4) {
    tolerancia = toleranciaBase * 1.5;
  }

  const hullSimplificado = simplificarContornoInteligente(hull, tolerancia);

  if (mantenerCurva && hullSimplificado.length < 8) {
    return hull;
  }

  return hullSimplificado;
}

// ============================================================================
// INTELLIGENT CONTOUR SIMPLIFICATION (DOUGLAS-PEUCKER)
// ============================================================================

/**
 * Douglas-Peucker simplification with adaptive epsilon
 * Supports both {x,y} objects and [x,y] array formats
 * @param {Array} contorno - Contour points
 * @param {number} tolerancia - Simplification tolerance
 * @returns {Array} Simplified contour
 */
function simplificarContornoInteligente(contorno, tolerancia = 2.0) {
  if (!contorno || contorno.length <= 3) return contorno;

  const esObjeto = contorno[0] && typeof contorno[0] === 'object' && 'x' in contorno[0];

  const puntos = esObjeto
    ? contorno.map(p => [p.x, p.y])
    : contorno;

  let perimetroEstimado = 0;
  for (let i = 0; i < puntos.length; i++) {
    const j = (i + 1) % puntos.length;
    const dx = puntos[j][0] - puntos[i][0];
    const dy = puntos[j][1] - puntos[i][1];
    perimetroEstimado += Math.sqrt(dx * dx + dy * dy);
  }

  const epsilonAdaptativo = Math.min(tolerancia, Math.max(0.5, perimetroEstimado * 0.001));

  function douglasPeucker(points, epsilon) {
    if (points.length <= 2) return points;

    let maxDist = 0;
    let maxIndex = 0;

    const start = points[0];
    const end = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const dist = distanciaPerpendicularPunto(points[i], start, end);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }

    if (maxDist > epsilon) {
      const left = douglasPeucker(points.slice(0, maxIndex + 1), epsilon);
      const right = douglasPeucker(points.slice(maxIndex), epsilon);

      return left.slice(0, -1).concat(right);
    } else {
      return [start, end];
    }
  }

  const simplified = douglasPeucker([...puntos, puntos[0]], epsilonAdaptativo);

  const result = simplified.slice(0, -1);
  const finalResult = result.length >= 8 ? result : puntos.filter((_, i) => i % Math.ceil(puntos.length / 100) === 0);

  return esObjeto
    ? finalResult.map(p => ({ x: p[0], y: p[1] }))
    : finalResult;
}

/**
 * Calculate perpendicular distance from point to line
 * @param {number[]} punto - Point [x, y]
 * @param {number[]} lineaInicio - Line start [x, y]
 * @param {number[]} lineaFin - Line end [x, y]
 * @returns {number} Perpendicular distance
 */
function distanciaPerpendicularPunto(punto, lineaInicio, lineaFin) {
  const dx = lineaFin[0] - lineaInicio[0];
  const dy = lineaFin[1] - lineaInicio[1];

  if (dx === 0 && dy === 0) {
    return Math.sqrt((punto[0] - lineaInicio[0]) ** 2 + (punto[1] - lineaInicio[1]) ** 2);
  }

  const t = ((punto[0] - lineaInicio[0]) * dx + (punto[1] - lineaInicio[1]) * dy) / (dx * dx + dy * dy);
  const proyeccion = [
    lineaInicio[0] + t * dx,
    lineaInicio[1] + t * dy
  ];

  return Math.sqrt((punto[0] - proyeccion[0]) ** 2 + (punto[1] - proyeccion[1]) ** 2);
}
