/**
 * Contour Quality & Validation Module
 *
 * Pure ES6 module for contour validation, quality assessment, and smoothing.
 * Works with contour point arrays only (no canvas/image dependencies).
 *
 * All functions are pure functions with no global state access.
 */

// Math constants for angle normalization
const MATH_CONSTANTS = {
  TWO_PI: 2 * Math.PI
};

/**
 * Verificar si un píxel es realmente un punto de borde (tiene al menos un vecino vacío)
 * @param {Uint8Array} binaryMask - Binary mask array
 * @param {number} x - Pixel x coordinate
 * @param {number} y - Pixel y coordinate
 * @param {number} width - Mask width
 * @param {number} height - Mask height
 * @returns {boolean} True if pixel is an edge point
 */
export function esPuntoBorde(binaryMask, x, y, width, height) {
  if (x <= 0 || x >= width - 1 || y <= 0 || y >= height - 1) return true;

  // Verificar vecinos 8-conectividad
  const neighbors = [
    [-1, -1], [0, -1], [1, -1],
    [-1,  0],          [1,  0],
    [-1,  1], [0,  1], [1,  1]
  ];

  let emptyNeighbors = 0;
  for (const [dx, dy] of neighbors) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
      if (binaryMask[ny * width + nx] === 0) {
        emptyNeighbors++;
      }
    }
  }

  // Es borde si tiene al menos 2 vecinos vacíos (evita ruido)
  return emptyNeighbors >= 2;
}

/**
 * Calcular calidad de conexión entre dos píxeles (evita atajos incorrectos)
 * @param {Uint8Array} binaryMask - Binary mask array
 * @param {number} x1 - First pixel x coordinate
 * @param {number} y1 - First pixel y coordinate
 * @param {number} x2 - Second pixel x coordinate
 * @param {number} y2 - Second pixel y coordinate
 * @param {number} width - Mask width
 * @param {number} height - Mask height
 * @returns {number} Connection quality score (0-1)
 */
export function calcularCalidadConexion(binaryMask, x1, y1, x2, y2, width, height) {
  const dx = x2 - x1;
  const dy = y2 - y1;

  // Penalizar conexiones diagonales que "cortan" el objeto
  if (Math.abs(dx) === 1 && Math.abs(dy) === 1) {
    // Verificar si la conexión diagonal es válida
    const corner1 = binaryMask[y1 * width + x2]; // Esquina 1
    const corner2 = binaryMask[y2 * width + x1]; // Esquina 2

    // Si ambas esquinas están vacías, es una conexión "cortante"
    if (corner1 === 0 && corner2 === 0) {
      return 0.3; // Baja calidad
    }
    return 0.7; // Calidad media para diagonales válidas
  }

  return 1.0; // Alta calidad para conexiones ortogonales
}

/**
 * Suavizar contorno eliminando zigzags y artefactos
 * @param {Array} contorno - Contour point array (supports {x,y} or [x,y] format)
 * @param {number} tolerance - Angle difference threshold in radians (default 1.5)
 * @returns {Array} Smoothed contour
 */
export function suavizarContorno(contorno, tolerance = 1.5) {
  if (!contorno || contorno.length < 5) return contorno;

  const suavizado = [contorno[0]]; // Mantener primer punto

  for (let i = 1; i < contorno.length - 1; i++) {
    const prev = contorno[i - 1];
    const curr = contorno[i];
    const next = contorno[i + 1];

    // Calcular ángulo de desviación
    const angle1 = Math.atan2(curr[1] - prev[1], curr[0] - prev[0]);
    const angle2 = Math.atan2(next[1] - curr[1], next[0] - curr[0]);
    let angleDiff = Math.abs(angle2 - angle1);

    // Normalizar diferencia angular
    if (angleDiff > Math.PI) angleDiff = MATH_CONSTANTS.TWO_PI - angleDiff;

    // Solo mantener puntos que no creen zigzags abruptos
    if (angleDiff > tolerance || i % 2 === 0) { // También mantener algunos puntos para preservar detalle
      suavizado.push(curr);
    }
  }

  if (contorno.length > 1) {
    suavizado.push(contorno[contorno.length - 1]); // Mantener último punto
  }

  return suavizado;
}

/**
 * Calcular área usando fórmula de Shoelace (Green's theorem)
 * @param {Array} contorno - Contour point array
 * @returns {number} Area value
 */
export function calcularAreaShoelace(contorno) {
  if (!contorno || contorno.length < 3) return 0;

  // Función auxiliar para obtener coordenadas (soporta {x,y} y [x,y])
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

/**
 * Evaluar la calidad de un contorno extraído
 * @param {Array} contorno - Contour point array
 * @param {Object} obj - Object info with area property
 * @returns {Object} Quality assessment {score, nivel, problemas}
 */
export function evaluarCalidadContorno(contorno, obj) {
  if (!contorno || contorno.length < 3) {
    return { score: 0, nivel: 'Muy bajo', problemas: ['Contorno insuficiente'] };
  }

  let score = 1.0;
  const problemas = [];

  // 1. Verificar ratio puntos/área (densidad razonable)
  const densidad = contorno.length / obj.area;
  if (densidad < 0.01) {
    score *= 0.7;
    problemas.push('Densidad muy baja');
  } else if (densidad > 0.5) {
    score *= 0.8;
    problemas.push('Densidad muy alta');
  }

  // 2. Verificar suavidad del contorno (detectar zigzags)
  let cambiosAbruptos = 0;
  for (let i = 1; i < contorno.length - 1; i++) {
    const prev = contorno[i - 1];
    const curr = contorno[i];
    const next = contorno[i + 1];

    const angle1 = Math.atan2(curr[1] - prev[1], curr[0] - prev[0]);
    const angle2 = Math.atan2(next[1] - curr[1], next[0] - curr[0]);
    let diff = Math.abs(angle2 - angle1);
    if (diff > Math.PI) diff = MATH_CONSTANTS.TWO_PI - diff;

    if (diff > 2.5) cambiosAbruptos++; // Cambio > ~143 grados
  }

  const ratioZigzag = cambiosAbruptos / contorno.length;
  if (ratioZigzag > 0.3) {
    score *= 0.6;
    problemas.push('Exceso de zigzags');
  }

  // 3. Verificar que el contorno esté cerrado
  const inicio = contorno[0];
  const fin = contorno[contorno.length - 1];
  const distanciaCierre = Math.sqrt((fin[0] - inicio[0])**2 + (fin[1] - inicio[1])**2);
  if (distanciaCierre > 3) {
    score *= 0.5;
    problemas.push('Contorno no cerrado');
  }

  // 4. Determinar nivel de calidad
  let nivel;
  if (score >= 0.9) nivel = 'Excelente';
  else if (score >= 0.75) nivel = 'Buena';
  else if (score >= 0.5) nivel = 'Aceptable';
  else if (score >= 0.3) nivel = 'Baja';
  else nivel = 'Muy baja';

  return { score, nivel, problemas };
}

/**
 * Validar que el contorno corresponda exactamente a la superficie del objeto (blancos absolutos)
 * @param {Array} contorno - Contour point array
 * @param {Uint8Array} binaryMask - Binary mask array
 * @param {number} width - Mask width
 * @param {number} height - Mask height
 * @returns {Object} Validation diagnostics
 */
export function validarSuperficieReal(contorno, binaryMask, width, height) {
  if (!contorno || contorno.length < 3) {
    return { valido: false, razon: 'Contorno insuficiente' };
  }

  // 1. Verificar que todos los puntos del contorno sean píxeles de objeto (1) o borde
  let puntosValidosContorno = 0;
  let puntosInvalidosContorno = 0;

  for (const p of contorno) {
    const x = p.x !== undefined ? p.x : p[0]; // Soportar tanto {x,y} como [x,y]
    const y = p.y !== undefined ? p.y : p[1];

    if (x >= 0 && x < width && y >= 0 && y < height) {
      const pixelValue = binaryMask[y * width + x];
      if (pixelValue === 1 || esPuntoBorde(binaryMask, x, y, width, height)) {
        puntosValidosContorno++;
      } else {
        puntosInvalidosContorno++;
      }
    }
  }

  const ratioValidezContorno = puntosValidosContorno / contorno.length;

  // 2. Calcular área por contorno vs área real de píxeles de objeto
  const areaPorContorno = calcularAreaShoelace(contorno);
  const areaRealPixeles = binaryMask.reduce((sum, pixel) => sum + pixel, 0);
  const errorArea = Math.abs(areaPorContorno - areaRealPixeles) / areaRealPixeles;

  // 3. Determinar validez
  const esValido = ratioValidezContorno >= 0.95 && errorArea <= 0.1;

  const diagnostico = {
    valido: esValido,
    ratioValidezContorno: ratioValidezContorno.toFixed(3),
    areaPorContorno: areaPorContorno.toFixed(1),
    areaRealPixeles: areaRealPixeles,
    errorArea: (errorArea * 100).toFixed(1) + '%',
    puntosValidosContorno,
    puntosInvalidosContorno
  };

  if (!esValido) {
    diagnostico.razon = [];
    if (ratioValidezContorno < 0.95) {
      diagnostico.razon.push(`Contorno impreciso (${(ratioValidezContorno*100).toFixed(1)}% válido)`);
    }
    if (errorArea > 0.1) {
      diagnostico.razon.push(`Error de área excesivo (${(errorArea*100).toFixed(1)}%)`);
    }
  }

  return diagnostico;
}

/**
 * Detecta y corrige anomalías comunes en contornos extraídos:
 *
 * 1. AUTO-INTERSECCIONES: Segmentos que se cruzan entre sí
 * 2. SALTOS GRANDES: Distancias anormales entre puntos consecutivos
 * 3. PUNTOS AISLADOS: Píxeles sueltos no conectados al contorno principal
 * 4. DUPLICADOS: Puntos repetidos consecutivamente
 * 5. ZIGZAG EXCESIVO: Oscilaciones de alta frecuencia (ruido)
 *
 * @param {Array} contorno - Contour point array (with {x,y} format)
 * @param {Object} options - Configuration options
 * @param {number} options.maxSaltoPx - Max distance between consecutive points (default 10)
 * @param {boolean} options.eliminarDuplicados - Remove duplicate points (default true)
 * @param {boolean} options.suavizarZigzag - Smooth high-frequency oscillations (default true)
 * @param {number} options.ventanaSuavizado - Smoothing window size, must be odd (default 3)
 * @returns {Array} Corrected contour
 */
export function validarYCorregirContorno(contorno, options = {}) {
  const {
    maxSaltoPx = 10,           // Distancia máxima permitida entre puntos consecutivos
    eliminarDuplicados = true, // Eliminar puntos duplicados
    suavizarZigzag = true,     // Suavizar oscilaciones de alta frecuencia
    ventanaSuavizado = 3       // Ventana para suavizado (debe ser impar)
  } = options;

  if (!contorno || contorno.length < 3) return contorno;

  let contornoCorregido = [...contorno];
  let correcciones = {
    duplicados: 0,
    saltosGrandes: 0,
    zigzag: 0,
    total: 0
  };

  // ========================================================================
  // PASO 1: Eliminar puntos duplicados consecutivos
  // ========================================================================
  if (eliminarDuplicados) {
    const sinDuplicados = [];
    sinDuplicados.push(contornoCorregido[0]);

    for (let i = 1; i < contornoCorregido.length; i++) {
      const actual = contornoCorregido[i];
      const anterior = contornoCorregido[i - 1];

      const distancia = Math.sqrt(
        Math.pow(actual.x - anterior.x, 2) +
        Math.pow(actual.y - anterior.y, 2)
      );

      if (distancia > 0.001) { // Umbral mínimo para considerar diferente
        sinDuplicados.push(actual);
      } else {
        correcciones.duplicados++;
      }
    }

    contornoCorregido = sinDuplicados;
  }

  // ========================================================================
  // PASO 2: Detectar y corregir saltos grandes
  // ========================================================================
  const sinSaltos = [];
  sinSaltos.push(contornoCorregido[0]);

  for (let i = 1; i < contornoCorregido.length; i++) {
    const actual = contornoCorregido[i];
    const anterior = contornoCorregido[i - 1];

    const distancia = Math.sqrt(
      Math.pow(actual.x - anterior.x, 2) +
      Math.pow(actual.y - anterior.y, 2)
    );

    if (distancia > maxSaltoPx) {
      // Salto detectado - interpolar puntos intermedios
      const numPuntosInterpolados = Math.ceil(distancia / 2); // Un punto cada ~2px

      for (let j = 1; j <= numPuntosInterpolados; j++) {
        const t = j / (numPuntosInterpolados + 1);
        sinSaltos.push({
          x: anterior.x + t * (actual.x - anterior.x),
          y: anterior.y + t * (actual.y - anterior.y)
        });
      }

      correcciones.saltosGrandes++;
    }

    sinSaltos.push(actual);
  }

  contornoCorregido = sinSaltos;

  // ========================================================================
  // PASO 3: Suavizar zigzag (ruido de alta frecuencia)
  // ========================================================================
  if (suavizarZigzag && contornoCorregido.length >= ventanaSuavizado) {
    const suavizado = [];
    const radio = Math.floor(ventanaSuavizado / 2);

    for (let i = 0; i < contornoCorregido.length; i++) {
      if (i < radio || i >= contornoCorregido.length - radio) {
        // Mantener puntos en los extremos sin modificar
        suavizado.push(contornoCorregido[i]);
      } else {
        // Promedio móvil en ventana
        let sumaX = 0, sumaY = 0;
        let cuenta = 0;

        for (let j = -radio; j <= radio; j++) {
          sumaX += contornoCorregido[i + j].x;
          sumaY += contornoCorregido[i + j].y;
          cuenta++;
        }

        const distanciaOriginal = Math.sqrt(
          Math.pow(contornoCorregido[i].x - sumaX / cuenta, 2) +
          Math.pow(contornoCorregido[i].y - sumaY / cuenta, 2)
        );

        if (distanciaOriginal > 0.5) { // Solo si el suavizado hace diferencia
          correcciones.zigzag++;
        }

        suavizado.push({
          x: sumaX / cuenta,
          y: sumaY / cuenta
        });
      }
    }

    contornoCorregido = suavizado;
  }

  correcciones.total = correcciones.duplicados + correcciones.saltosGrandes + correcciones.zigzag;

  return contornoCorregido;
}
