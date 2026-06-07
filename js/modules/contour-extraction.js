/**
 * MÓDULO: Contour Extraction & Refinement
 *
 * Contiene funciones especializadas para:
 * - Extracción de contornos desde máscaras binarias
 * - Refinamiento sub-píxel y por gradiente
 * - Operaciones morfológicas (dilatación, erosión, cierre, apertura)
 * - Validación y corrección de contornos
 *
 * Dependencias:
 * - contour-quality.js (validarYCorregirContorno, evaluarCalidadContorno)
 *
 * NOTA: Este módulo requiere acceso a canvasPool (debe pasarse en opciones)
 */

import * as CQ from './contour-quality.js';

// =====================================================================================
// OPERACIONES MORFOLÓGICAS PARA MEJORAR LA MÁSCARA BINARIA
// =====================================================================================

/**
 * Aplica operación morfológica de DILATACIÓN
 * Expande las regiones de objeto (1) hacia el fondo (0)
 * Útil para cerrar pequeños huecos y conectar regiones cercanas
 */
export function dilatarMascara(binaryMask, width, height, iterations = 1) {
  // Dos buffers reutilizados (ping-pong) — evita N allocaciones de Uint8Array
  let src = new Uint8Array(binaryMask);
  let dst = new Uint8Array(binaryMask.length);

  for (let iter = 0; iter < iterations; iter++) {
    const w = width;
    for (let y = 1; y < height - 1; y++) {
      const row = y * w;
      for (let x = 1; x < width - 1; x++) {
        const i = row + x;
        // Kernel 3×3 desenrollado
        dst[i] = (src[i] === 1 ||
          src[i - 1] === 1 || src[i + 1] === 1 ||
          src[i - w - 1] === 1 || src[i - w] === 1 || src[i - w + 1] === 1 ||
          src[i + w - 1] === 1 || src[i + w] === 1 || src[i + w + 1] === 1) ? 1 : 0;
      }
    }
    // Intercambiar buffers
    const tmp = src; src = dst; dst = tmp;
  }
  return src;
}

/**
 * Aplica operación morfológica de EROSIÓN
 * Reduce las regiones de objeto (1) hacia adentro
 * Útil para eliminar ruido y protuberancias pequeñas
 */
export function erosionarMascara(binaryMask, width, height, iterations = 1) {
  // Dos buffers reutilizados (ping-pong) — evita N allocaciones de Uint8Array
  let src = new Uint8Array(binaryMask);
  let dst = new Uint8Array(binaryMask.length);

  for (let iter = 0; iter < iterations; iter++) {
    const w = width;
    for (let y = 1; y < height - 1; y++) {
      const row = y * w;
      for (let x = 1; x < width - 1; x++) {
        const i = row + x;
        // Kernel 3×3 desenrollado: solo 1 si TODOS los vecinos son 1
        dst[i] = (src[i] === 1 &&
          src[i - 1] === 1 && src[i + 1] === 1 &&
          src[i - w - 1] === 1 && src[i - w] === 1 && src[i - w + 1] === 1 &&
          src[i + w - 1] === 1 && src[i + w] === 1 && src[i + w + 1] === 1) ? 1 : 0;
      }
    }
    // Intercambiar buffers
    const tmp = src; src = dst; dst = tmp;
  }
  return src;
}

/**
 * Aplica operación morfológica de CIERRE (dilatación + erosión)
 * Útil para CERRAR pequeños huecos en el objeto
 * Ideal para imágenes reales con ruido fotográfico
 */
export function cerrarMascara(binaryMask, width, height, iterations = 1) {
  const DEBUG_LOGS = { masks: false };
  if (DEBUG_LOGS.masks) {
    console.log(`🔧 Cierre morfológico (${iterations} iter) - suavizando máscara...`);
  }
  let mask = dilatarMascara(binaryMask, width, height, iterations);
  mask = erosionarMascara(mask, width, height, iterations);
  return mask;
}

/**
 * Aplica operación morfológica de APERTURA (erosión + dilatación)
 * Útil para ELIMINAR ruido y pequeños artefactos
 * Ideal para limpiar la máscara antes de trazar contorno
 */
export function abrirMascara(binaryMask, width, height, iterations = 1) {
  const DEBUG_LOGS = { masks: false };
  if (DEBUG_LOGS.masks) {
    console.log(`🔧 Apertura morfológica (${iterations} iter) - eliminando ruido...`);
  }
  let mask = erosionarMascara(binaryMask, width, height, iterations);
  mask = dilatarMascara(mask, width, height, iterations);
  return mask;
}

/**
 * Aplica suavizado completo a la máscara binaria
 * Combina cierre (para huecos) y apertura (para ruido)
 * RECOMENDADO para imágenes fotográficas reales
 */
export function suavizarMascaraMorfologica(binaryMask, width, height, options = {}) {
  const {
    usarCierre = true,       // Cerrar huecos pequeños
    usarApertura = true,     // Eliminar ruido
    iteraciones = 1          // Número de iteraciones (1-2 recomendado)
  } = options;

  const DEBUG_LOGS = { masks: false };
  let mask = new Uint8Array(binaryMask);

  if (DEBUG_LOGS.masks) {
    console.log(`🎨 Suavizado morfológico: cierre=${usarCierre}, apertura=${usarApertura}, iter=${iteraciones}`);
  }

  // Primero cerrar huecos (si está habilitado)
  if (usarCierre) {
    mask = cerrarMascara(mask, width, height, iteraciones);
  }

  // Luego eliminar ruido (si está habilitado)
  if (usarApertura) {
    mask = abrirMascara(mask, width, height, iteraciones);
  }

  // Calcular estadísticas de cambios
  let pixelesCambiados = 0;
  for (let i = 0; i < binaryMask.length; i++) {
    if (binaryMask[i] !== mask[i]) pixelesCambiados++;
  }

  const porcentajeCambio = ((pixelesCambiados / binaryMask.length) * 100).toFixed(2);

  if (DEBUG_LOGS.masks) {
    console.log(`   ✅ Completado: ${pixelesCambiados} px modificados (${porcentajeCambio}%)`);
  }

  return mask;
}

// ============================================================================
// M4-LITE: GRADIENT SNAP — REFINAMIENTO DE CONTORNO POR MÁXIMO DE GRADIENTE
// ============================================================================

/**
 * refinarContornoGradiente(contorno, imageData, width, height)
 *
 * Desplaza cada punto del contorno al lugar donde el gradiente de intensidad
 * es máximo a lo largo de la dirección normal al contorno.
 *
 * Motivación: la detección por máscara binaria coloca el borde en el último
 * píxel clasificado como "objeto". En imágenes con desenfoque óptico o JPEG,
 * ese punto puede estar 2-5 px adentro del borde fotométrico real. El gradiente
 * máximo coincide con el borde real independientemente del umbral de clasificación.
 *
 * Algoritmo (una sola pasada, sin energía interna ni iteraciones):
 *   Para cada punto P[i]:
 *     1. Tangente local ≈ (P[i+1] - P[i-1]) / 2  (diferencia central)
 *     2. Normal = tangente rotada 90° (hacia el exterior, dirección fondo)
 *     3. Muestrear |∇I| en t ∈ [-SNAP_RANGE, +SNAP_RANGE] a lo largo de la normal
 *        |∇I| calculado con kernel Sobel 3×3 en escala de grises
 *     4. P[i] ← t* = argmax |∇I|  (limitado a SNAP_RANGE px del original)
 *   Paso final: suavizado geométrico ligero (media móvil ventana 3) para
 *   evitar zig-zag introducido por el snap independiente de cada punto.
 *
 * Parámetros:
 *   SNAP_RANGE  = 6 px  → rango de búsqueda (cubre desenfoque óptico típico)
 *   MIN_GRAD    = 8     → gradiente mínimo para hacer snap (evita ruido plano)
 *   SMOOTH_ITER = 1     → iteraciones de suavizado post-snap
 */
export function refinarContornoGradiente(contorno, imageData, width, height) {
  const SNAP_RANGE  = 6;   // px máximo de desplazamiento en cada dirección
  const MIN_GRAD    = 8;   // umbral mínimo de gradiente para activar snap
  const SMOOTH_ITER = 1;   // iteraciones de suavizado final

  const data = imageData.data;
  const n = contorno.length;

  // --- Construir imagen en escala de grises (una sola vez) ---
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    // Luminancia BT.601
    gray[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
  }

  // --- Calcular |∇I| con Sobel 3×3 (en toda la imagen, evita recálculo por punto) ---
  const grad = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const tl = gray[(y - 1) * width + (x - 1)], tc = gray[(y - 1) * width + x], tr = gray[(y - 1) * width + (x + 1)];
      const ml = gray[y       * width + (x - 1)],                                  mr = gray[y       * width + (x + 1)];
      const bl = gray[(y + 1) * width + (x - 1)], bc = gray[(y + 1) * width + x], br = gray[(y + 1) * width + (x + 1)];
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      grad[y * width + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  // --- Función auxiliar: interpolar |∇I| bilineal en coordenadas reales ---
  function gradAt(fx, fy) {
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = x0 + 1,        y1 = y0 + 1;
    if (x0 < 0 || y0 < 0 || x1 >= width || y1 >= height) return 0;
    const dx = fx - x0, dy = fy - y0;
    return (1 - dy) * ((1 - dx) * grad[y0 * width + x0] + dx * grad[y0 * width + x1])
         +      dy  * ((1 - dx) * grad[y1 * width + x0] + dx * grad[y1 * width + x1]);
  }

  // --- Gradient snap por punto ---
  const snapped = new Array(n);
  let ptsMovidos = 0;

  for (let i = 0; i < n; i++) {
    const prev = contorno[(i - 1 + n) % n];
    const curr = contorno[i];
    const next = contorno[(i + 1) % n];

    // Tangente por diferencia central
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const tLen = Math.sqrt(tx * tx + ty * ty);

    if (tLen < 1e-6) {
      snapped[i] = { x: curr.x, y: curr.y };
      continue;
    }

    // Normal exterior (rotación +90°: apunta hacia el fondo)
    const nx =  ty / tLen;
    const ny = -tx / tLen;

    // Muestrear gradiente a lo largo de la normal en pasos de 0.5 px
    let bestGrad = -1;
    let bestT = 0;
    for (let t = -SNAP_RANGE; t <= SNAP_RANGE; t += 0.5) {
      const sampleX = curr.x + t * nx;
      const sampleY = curr.y + t * ny;
      const g = gradAt(sampleX, sampleY);
      if (g > bestGrad) {
        bestGrad = g;
        bestT = t;
      }
    }

    if (bestGrad >= MIN_GRAD && Math.abs(bestT) > 0.25) {
      snapped[i] = {
        x: Math.round(curr.x + bestT * nx * 10) / 10,  // 0.1 px de resolución
        y: Math.round(curr.y + bestT * ny * 10) / 10
      };
      ptsMovidos++;
    } else {
      snapped[i] = { x: curr.x, y: curr.y };
    }
  }

  // --- Suavizado geométrico post-snap (media ponderada ventana 3) ---
  // Elimina zig-zag introducido por snaps independientes en puntos adyacentes
  let resultado = snapped;
  for (let iter = 0; iter < SMOOTH_ITER; iter++) {
    const suavizado = new Array(n);
    for (let i = 0; i < n; i++) {
      const prev = resultado[(i - 1 + n) % n];
      const curr = resultado[i];
      const next = resultado[(i + 1) % n];
      suavizado[i] = {
        x: prev.x * 0.25 + curr.x * 0.5 + next.x * 0.25,
        y: prev.y * 0.25 + curr.y * 0.5 + next.y * 0.25
      };
    }
    resultado = suavizado;
  }

  console.log(`   ↳ gradient snap: ${ptsMovidos}/${n} puntos desplazados (rango ±${SNAP_RANGE}px, umbral |∇|≥${MIN_GRAD})`);
  return resultado;
}

/**
 * REFINAMIENTO SUB-PÍXEL DE CONTORNO
 * Mejora la precisión del contorno interpolando entre píxeles adyacentes
 *
 * En lugar de coordenadas enteras (x=10, y=20), calcula posiciones decimales
 * más precisas (x=10.3, y=20.7) basándose en gradientes de intensidad.
 *
 * Método: Para cada punto del contorno, analiza la transición objeto-fondo
 * y estima la posición exacta del borde mediante interpolación lineal.
 *
 * IMPORTANTE: Mejora significativamente la precisión de mediciones,
 * especialmente en objetos pequeños donde cada fracción de píxel cuenta.
 */
export function refinarContornoSubPixel(contorno, imageData, binaryMask, width, height, options = {}) {
  const {
    ventana = 1,          // Tamaño de ventana de análisis (1 = 3x3, 2 = 5x5)
    umbralGradiente = 10  // Gradiente mínimo para considerar refinamiento
  } = options;

  const DEBUG_LOGS = { contours: false };
  if (!contorno || contorno.length < 3) return contorno;

  if (DEBUG_LOGS.contours) {
    console.log(`🔬 Refinamiento sub-píxel: ${contorno.length} puntos`);
  }

  const data = imageData.data;
  const contornoRefinado = [];
  let puntosRefinados = 0;

  // Convertir a escala de grises para calcular gradientes
  const grayData = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    grayData[i] = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
  }

  for (let i = 0; i < contorno.length; i++) {
    const punto = contorno[i];
    const x = Math.round(punto.x);
    const y = Math.round(punto.y);

    // Validar límites
    if (x < ventana || x >= width - ventana || y < ventana || y >= height - ventana) {
      contornoRefinado.push({ x: punto.x, y: punto.y });
      continue;
    }

    // Calcular gradientes en X e Y usando diferencias finitas
    const idx = y * width + x;

    // Gradiente en X (horizontal)
    const gradX = (grayData[idx + 1] - grayData[idx - 1]) / 2;

    // Gradiente en Y (vertical)
    const gradY = (grayData[idx + width] - grayData[idx - width]) / 2;

    // Magnitud del gradiente
    const magnitud = Math.sqrt(gradX * gradX + gradY * gradY);

    // Solo refinar si hay gradiente significativo (borde real)
    if (magnitud < umbralGradiente) {
      contornoRefinado.push({ x: punto.x, y: punto.y });
      continue;
    }

    // Normalizar dirección del gradiente
    const nx = gradX / magnitud;
    const ny = gradY / magnitud;

    // Buscar la posición sub-píxel del borde en dirección del gradiente
    // Muestrear intensidades en dirección perpendicular al borde
    let sumaIntensidad = 0;
    let sumaPeso = 0;

    for (let offset = -ventana; offset <= ventana; offset++) {
      const sx = Math.round(x + offset * nx);
      const sy = Math.round(y + offset * ny);

      if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
        const sidx = sy * width + sx;
        const intensidad = grayData[sidx];
        const peso = 1.0 / (1.0 + Math.abs(offset)); // Mayor peso a píxeles cercanos

        sumaIntensidad += intensidad * peso;
        sumaPeso += peso;
      }
    }

    const intensidadPromedio = sumaPeso > 0 ? sumaIntensidad / sumaPeso : grayData[idx];

    // Interpolar posición basada en intensidad
    // Si el píxel está más cerca del fondo (claro), desplazar hacia adentro
    // Si está más cerca del objeto (oscuro), desplazar hacia afuera
    const valorFondo = 255; // Asumiendo fondo blanco
    const valorObjeto = 0;  // Asumiendo objeto oscuro

    const ratio = (intensidadPromedio - valorObjeto) / (valorFondo - valorObjeto);
    const desplazamiento = (ratio - 0.5) * 0.5; // Desplazamiento máximo ±0.25 píxeles

    // Aplicar refinamiento sub-píxel
    const xRefinado = punto.x + desplazamiento * nx;
    const yRefinado = punto.y + desplazamiento * ny;

    contornoRefinado.push({
      x: xRefinado,
      y: yRefinado
    });

    puntosRefinados++;
  }

  if (DEBUG_LOGS.contours) {
    const porcentajeRefinado = ((puntosRefinados / contorno.length) * 100).toFixed(1);
    console.log(`   ✅ Completado: ${puntosRefinados}/${contorno.length} pts (${porcentajeRefinado}%)`);
  }

  return contornoRefinado;
}

// ============================================================================
// EXTRACCIÓN DE CONTORNO DIRECTO DESDE MÁSCARA BINARIA
// Algoritmo más simple y robusto que Moore - extrae todos los píxeles
// que están en el borde entre objeto (blanco) y fondo (negro)
// CON DEPURACIÓN INTELIGENTE para eliminar píxeles de sombra/fondo
// ============================================================================

export function extraerContornoDesdeMascara(binaryMask, width, height, imageData = null) {
  const startTime = performance.now();
  console.log(`🎯 Extrayendo contorno directo desde máscara binaria (${width}x${height})...`);

  // ============================================================================
  // PRE-CÓMPUTO DE COLOR DE FONDO Y CONFIANZA CROMÁTICA
  // ============================================================================
  let bgRloc = 128, bgGloc = 128, bgBloc = 128;
  let bgHueLoc = -1, bgSatLoc = 0;
  let usarFiltroConfianza = false;
  const CONFIANZA_UMBRAL = 0.50;
  const MAX_ELIMINADOS = 0.50;

  if (imageData && imageData.data) {
    const bW = Math.max(3, Math.min(8, Math.floor(Math.min(width, height) * 0.04)));
    let rS = 0, gS = 0, bS = 0, cnt = 0;
    // Franja superior
    for (let yy = 0; yy < bW; yy++)
      for (let xx = 0; xx < width; xx++) {
        const ci = (yy * width + xx) * 4;
        rS += imageData.data[ci]; gS += imageData.data[ci+1]; bS += imageData.data[ci+2]; cnt++;
      }
    // Franja inferior
    for (let yy = height - bW; yy < height; yy++)
      for (let xx = 0; xx < width; xx++) {
        const ci = (yy * width + xx) * 4;
        rS += imageData.data[ci]; gS += imageData.data[ci+1]; bS += imageData.data[ci+2]; cnt++;
      }
    // Franjas laterales
    for (let yy = bW; yy < height - bW; yy++) {
      for (let xx = 0; xx < bW; xx++) {
        const ci = (yy * width + xx) * 4;
        rS += imageData.data[ci]; gS += imageData.data[ci+1]; bS += imageData.data[ci+2]; cnt++;
      }
      for (let xx = width - bW; xx < width; xx++) {
        const ci = (yy * width + xx) * 4;
        rS += imageData.data[ci]; gS += imageData.data[ci+1]; bS += imageData.data[ci+2]; cnt++;
      }
    }
    if (cnt > 0) { bgRloc = rS/cnt; bgGloc = gS/cnt; bgBloc = bS/cnt; }

    const bgMax = Math.max(bgRloc, bgGloc, bgBloc);
    const bgMin = Math.min(bgRloc, bgGloc, bgBloc);
    const bgRange = bgMax - bgMin;
    bgSatLoc = bgMax > 0 ? bgRange / bgMax : 0;
    const esCromatico = bgRange > 25 && bgSatLoc > 0.15;

    if (esCromatico) {
      if (bgMax === bgRloc)      bgHueLoc = (((bgGloc - bgBloc) / bgRange) + (bgGloc < bgBloc ? 6 : 0)) * 60;
      else if (bgMax === bgGloc) bgHueLoc = (((bgBloc - bgRloc) / bgRange) + 2) * 60;
      else                       bgHueLoc = (((bgRloc - bgGloc) / bgRange) + 4) * 60;
      usarFiltroConfianza = true;
      console.log(`🎨 Fondo cromático detectado (RGB≈${bgRloc.toFixed(0)},${bgGloc.toFixed(0)},${bgBloc.toFixed(0)} Hue≈${bgHueLoc.toFixed(0)}°) → filtro de confianza ACTIVO`);
    }
  }

  // ============================================================================
  // LOOP DE EXTRACCIÓN DE BORDE CON CONFIANZA CROMÁTICA
  // ============================================================================
  const contornoPuntos = [];
  let totalBordes = 0;
  const data = imageData ? imageData.data : null;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;

      if (binaryMask[idx] === 0) continue;

      // Verificar si es borde (8-conectividad)
      let esBorde = false;
      for (let dy = -1; dy <= 1 && !esBorde; dy++) {
        for (let dx = -1; dx <= 1 && !esBorde; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (binaryMask[(y + dy) * width + (x + dx)] === 0) esBorde = true;
        }
      }
      if (!esBorde) continue;

      totalBordes++;

      // --- Filtro de confianza cromática ---
      if (usarFiltroConfianza && data) {
        const pi = (y * width + x) * 4;
        const pr = data[pi], pg = data[pi+1], pb = data[pi+2];
        const pMax = Math.max(pr, pg, pb);
        const pMin = Math.min(pr, pg, pb);
        const pRange = pMax - pMin;
        const pSat = pMax > 0 ? pRange / pMax : 0;

        let confianza;
        if (pSat > 0.08 && pRange > 8) {
          let pHue;
          if (pMax === pr)      pHue = (((pg - pb) / pRange) + (pg < pb ? 6 : 0)) * 60;
          else if (pMax === pg) pHue = (((pb - pr) / pRange) + 2) * 60;
          else                  pHue = (((pr - pg) / pRange) + 4) * 60;

          let hueDiff = Math.abs(pHue - bgHueLoc);
          if (hueDiff > 180) hueDiff = 360 - hueDiff;

          confianza = Math.min(1.0, hueDiff / 80);
        } else {
          const pixBrillo = (pr + pg + pb) / 3;
          const bgBrillo  = (bgRloc + bgGloc + bgBloc) / 3;
          const diffBrillo = Math.abs(pixBrillo - bgBrillo) / 128;
          confianza = 0.5 + diffBrillo * 0.4;
        }

        if (confianza < CONFIANZA_UMBRAL) continue;
        contornoPuntos.push({x, y});
      } else {
        contornoPuntos.push({x, y});
      }
    }
  }

  // Seguridad: si el filtro eliminó demasiados puntos, revertir
  if (usarFiltroConfianza && totalBordes > 0) {
    const fraccionEliminada = 1 - contornoPuntos.length / totalBordes;
    if (fraccionEliminada > MAX_ELIMINADOS && totalBordes >= 10) {
      console.warn(`⚠️ Filtro de confianza eliminó ${(fraccionEliminada*100).toFixed(0)}% de bordes → revertiendo a colección completa`);
      contornoPuntos.length = 0;
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x;
          if (binaryMask[idx] === 0) continue;
          let esBorde = false;
          for (let dy = -1; dy <= 1 && !esBorde; dy++)
            for (let dx = -1; dx <= 1 && !esBorde; dx++)
              if ((dx !== 0 || dy !== 0) && binaryMask[(y+dy)*width+(x+dx)] === 0) esBorde = true;
          if (esBorde) contornoPuntos.push({x, y});
        }
      }
    } else {
      console.log(`✅ Filtro de confianza: ${totalBordes} bordes → ${contornoPuntos.length} retenidos (${((1-fraccionEliminada)*100).toFixed(0)}%)`);
    }
  }

  const totalTime = performance.now() - startTime;
  console.log(`✅ Contorno extraído: ${contornoPuntos.length} puntos de borde en ${totalTime.toFixed(0)}ms`);

  if (contornoPuntos.length === 0) {
    console.warn('❌ No se encontraron puntos de borde en la máscara');
    return [];
  }

  // ============================================================================
  // SEGUNDA PASADA: DEPURACIÓN POR COHERENCIA CON VECINOS INTERNOS
  // ============================================================================
  const APLICAR_DEPURACION_CROMATICA = usarFiltroConfianza;

  let contornoFinal = contornoPuntos;

  if (APLICAR_DEPURACION_CROMATICA && imageData) {
    console.log(`🔬 Segunda pasada: coherencia vecinal...`);
    const contornoDepurado = depurarContornoPorCoherencia(
      contornoPuntos,
      binaryMask,
      imageData,
      width,
      height
    );
    const eliminados = contornoPuntos.length - contornoDepurado.length;
    const porcentajeEliminado = contornoPuntos.length > 0
      ? ((eliminados / contornoPuntos.length) * 100).toFixed(1)
      : '0';

    if (parseFloat(porcentajeEliminado) < 30) {
      console.log(`✅ Depuración vecinal: ${contornoDepurado.length} puntos válidos (${eliminados} eliminados - ${porcentajeEliminado}%)`);
      contornoFinal = contornoDepurado;
    } else {
      console.warn(`⚠️ Depuración vecinal demasiado agresiva (${porcentajeEliminado}% eliminado) - usando filtro hue solamente`);
      contornoFinal = contornoPuntos;
    }
  } else {
    console.log(`ℹ️ Segunda pasada desactivada (fondo neutro) - usando contorno directo`);
  }

  // ============================================================================
  // ORDENAMIENTO RADIAL - Método robusto para formas complejas
  // ============================================================================
  console.log(`🔗 Ordenando ${contornoFinal.length} puntos mediante método radial...`);
  const ordenados = ordenarPuntosContornoRadial(contornoFinal, width, height);

  console.log(`✅ Contorno ordenado: ${ordenados.length} puntos`);
  return ordenados;
}

/**
 * ORDENAMIENTO RADIAL DE CONTORNO
 * Algoritmo robusto que ordena puntos mediante barrido angular desde el centroide
 */
function ordenarPuntosContornoRadial(puntos, width, height) {
  if (puntos.length < 3) return puntos;

  const startTime = performance.now();

  // Paso 1: Calcular centroide de los puntos del contorno
  let sumX = 0, sumY = 0;
  for (let i = 0; i < puntos.length; i++) {
    sumX += puntos[i].x;
    sumY += puntos[i].y;
  }
  const centroidX = sumX / puntos.length;
  const centroidY = sumY / puntos.length;

  console.log(`   📍 Centroide del contorno: (${centroidX.toFixed(1)}, ${centroidY.toFixed(1)})`);

  // Paso 2: Convertir cada punto a coordenadas polares (r, θ) desde el centroide
  const puntosPolares = puntos.map(p => {
    const dx = p.x - centroidX;
    const dy = p.y - centroidY;
    const r = Math.sqrt(dx * dx + dy * dy);
    const theta = Math.atan2(dy, dx);

    return {
      x: p.x,
      y: p.y,
      r: r,
      theta: theta
    };
  });

  // Paso 3: Ordenar por ángulo (barrido antihorario desde el eje X positivo)
  puntosPolares.sort((a, b) => a.theta - b.theta);

  // Paso 4: Detectar y resolver múltiples puntos en el mismo ángulo
  const puntosLimpios = [];
  let i = 0;

  while (i < puntosPolares.length) {
    const angulo = puntosPolares[i].theta;
    const puntosEnAngulo = [puntosPolares[i]];

    let j = i + 1;
    while (j < puntosPolares.length && Math.abs(puntosPolares[j].theta - angulo) < 0.009) {
      puntosEnAngulo.push(puntosPolares[j]);
      j++;
    }

    if (puntosEnAngulo.length === 1) {
      puntosLimpios.push(puntosEnAngulo[0]);
    } else {
      const masDist = puntosEnAngulo.reduce((max, p) => p.r > max.r ? p : max);
      puntosLimpios.push(masDist);

      console.log(`   🔄 ${puntosEnAngulo.length} puntos en θ=${(angulo * 180 / Math.PI).toFixed(1)}° → mantener el más lejano (r=${masDist.r.toFixed(1)})`);
    }

    i = j;
  }

  const totalTime = performance.now() - startTime;
  console.log(`   ✅ Ordenamiento radial completado: ${puntos.length} → ${puntosLimpios.length} puntos en ${totalTime.toFixed(1)}ms`);

  return puntosLimpios.map(p => ({x: p.x, y: p.y}));
}

/**
 * Depurar contorno eliminando píxeles de sombra/fondo que fueron incorrectamente
 * incluidos en el borde. Analiza coherencia cromática y geométrica local.
 */
function depurarContornoPorCoherencia(contornoPuntos, binaryMask, imageData, width, height) {
  if (!imageData || !imageData.data) {
    console.warn('⚠️ No hay imageData disponible - saltando depuración cromática');
    return contornoPuntos;
  }

  const data = imageData.data;
  const puntosConScore = [];

  // Análisis de cada punto del contorno
  for (const punto of contornoPuntos) {
    const {x, y} = punto;
    const idx = y * width + x;
    const pixelIdx = idx * 4;

    // Color del píxel actual
    const r = data[pixelIdx];
    const g = data[pixelIdx + 1];
    const b = data[pixelIdx + 2];

    const vecinos_internos = [];
    const vecinos_exteriores = [];
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dy === 0) continue;

        const nx = x + dx;
        const ny = y + dy;

        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nidx = ny * width + nx;
          const npixelIdx = nidx * 4;
          const nc = { r: data[npixelIdx], g: data[npixelIdx + 1], b: data[npixelIdx + 2] };
          if (binaryMask[nidx] > 0) {
            vecinos_internos.push(nc);
          } else {
            vecinos_exteriores.push(nc);
          }
        }
      }
    }

    // Calcular promedio de vecinos internos
    let avgR = 0, avgG = 0, avgB = 0;
    if (vecinos_internos.length > 0) {
      for (const v of vecinos_internos) { avgR += v.r; avgG += v.g; avgB += v.b; }
      avgR /= vecinos_internos.length;
      avgG /= vecinos_internos.length;
      avgB /= vecinos_internos.length;
    }

    let scoreColor;
    if (vecinos_exteriores.length > 0) {
      let avgRext = 0, avgGext = 0, avgBext = 0;
      for (const v of vecinos_exteriores) { avgRext += v.r; avgGext += v.g; avgBext += v.b; }
      avgRext /= vecinos_exteriores.length;
      avgGext /= vecinos_exteriores.length;
      avgBext /= vecinos_exteriores.length;
      const distanciaFondo = Math.sqrt(
        Math.pow(r - avgRext, 2) + Math.pow(g - avgGext, 2) + Math.pow(b - avgBext, 2)
      );
      scoreColor = Math.min(1, distanciaFondo / 40);
    } else if (vecinos_internos.length === 0) {
      puntosConScore.push({punto, score: 0.0});
      continue;
    } else {
      const distanciaInterior = Math.sqrt(
        Math.pow(r - avgR, 2) + Math.pow(g - avgG, 2) + Math.pow(b - avgB, 2)
      );
      scoreColor = Math.max(0, 1 - distanciaInterior / 150);
    }

    // CRITERIO 2: COHERENCIA GEOMÉTRICA
    let vecinosEnContorno = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;

        const nx = x + dx;
        const ny = y + dy;

        if (nx >= 1 && nx < width - 1 && ny >= 1 && ny < height - 1) {
          const nidx = ny * width + nx;

          if (binaryMask[nidx] > 0) {
            let vecinoEsBorde = false;
            for (let ddy = -1; ddy <= 1 && !vecinoEsBorde; ddy++) {
              for (let ddx = -1; ddx <= 1 && !vecinoEsBorde; ddx++) {
                const nnidx = (ny + ddy) * width + (nx + ddx);
                if (binaryMask[nnidx] === 0) {
                  vecinoEsBorde = true;
                }
              }
            }
            if (vecinoEsBorde) vecinosEnContorno++;
          }
        }
      }
    }

    const scoreGeometrico = vecinosEnContorno / 8;

    // CRITERIO 3: VARIANZA LOCAL DE COLOR
    let scoreUniformidad = 0.5;
    if (vecinos_internos.length > 1) {
      let varianzaR = 0, varianzaG = 0, varianzaB = 0;
      for (const vecino of vecinos_internos) {
        varianzaR += Math.pow(vecino.r - avgR, 2);
        varianzaG += Math.pow(vecino.g - avgG, 2);
        varianzaB += Math.pow(vecino.b - avgB, 2);
      }
      varianzaR /= vecinos_internos.length;
      varianzaG /= vecinos_internos.length;
      varianzaB /= vecinos_internos.length;
      const varianzaTotal = (varianzaR + varianzaG + varianzaB) / 3;
      scoreUniformidad = Math.max(0, 1 - Math.sqrt(varianzaTotal) / 50);
    }

    const scoreFinal = (
      scoreColor      * 0.35 +
      scoreGeometrico * 0.50 +
      scoreUniformidad * 0.15
    );
    puntosConScore.push({punto, score: scoreFinal});
  }

  const UMBRAL_CONFIANZA = 0.20;
  const puntosValidos = puntosConScore
    .filter(item => item.score >= UMBRAL_CONFIANZA)
    .map(item => item.punto);

  const eliminados = contornoPuntos.length - puntosValidos.length;
  const porcentajeEliminado = ((eliminados / contornoPuntos.length) * 100).toFixed(1);

  if (eliminados > 0) {
    console.log(`   🧹 Depuración cromática: ${eliminados} píxeles de baja confianza eliminados (${porcentajeEliminado}%)`);

    const scores = puntosConScore.map(item => item.score);
    const scorePromedio = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3);
    const scoreMin = Math.min(...scores).toFixed(3);
    const scoreMax = Math.max(...scores).toFixed(3);
    console.log(`   📊 Scores: promedio=${scorePromedio}, rango=[${scoreMin}, ${scoreMax}], umbral=${UMBRAL_CONFIANZA}`);
  } else {
    console.log(`   ✅ Todos los píxeles del contorno son coherentes (score ≥ ${UMBRAL_CONFIANZA})`);
  }

  if (porcentajeEliminado > 40) {
    console.warn(`   ⚠️ ADVERTENCIA: Se eliminó ${porcentajeEliminado}% del contorno - posiblemente demasiado agresivo`);
    console.warn(`   💡 Considera desactivar depuración cromática o ajustar umbral de confianza`);
  }

  return puntosValidos;
}

/**
 * Moore Neighborhood Tracing mejorado para contornos más precisos
 */
export function trazarContornoMoore(binaryMask, width, height) {
  const startTime = performance.now();
  const MAX_EXECUTION_TIME = 5000;

  const areaImagen = width * height;
  let MAX_POINTS;
  if (areaImagen < 50000) {
    MAX_POINTS = 2000;
  } else if (areaImagen < 100000) {
    MAX_POINTS = 3000;
  } else if (areaImagen < 200000) {
    MAX_POINTS = 5000;
  } else {
    MAX_POINTS = 8000;
  }

  console.log(`🔍 Iniciando Moore Neighborhood Tracing (${width}x${height}, área=${areaImagen}, max ${MAX_POINTS} puntos, timeout ${MAX_EXECUTION_TIME}ms)...`);

  const componentLabels = new Uint32Array(width * height);
  let numComponents = 0;
  const componentSizes = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (binaryMask[idx] > 0 && componentLabels[idx] === 0) {
        numComponents++;
        let size = 0;
        const stack = [{x, y}];

        while (stack.length > 0) {
          const {x: cx, y: cy} = stack.pop();
          const cidx = cy * width + cx;

          if (cx < 1 || cx >= width - 1 || cy < 1 || cy >= height - 1) continue;
          if (binaryMask[cidx] === 0 || componentLabels[cidx] !== 0) continue;

          componentLabels[cidx] = numComponents;
          size++;

          stack.push({x: cx + 1, y: cy});
          stack.push({x: cx - 1, y: cy});
          stack.push({x: cx, y: cy + 1});
          stack.push({x: cx, y: cy - 1});
        }

        componentSizes.push({id: numComponents, size});
      }
    }
  }

  if (numComponents === 0) {
    console.warn('❌ No se encontró ningún componente en la máscara');
    return [];
  }

  const largestComponent = componentSizes.reduce((max, comp) =>
    comp.size > max.size ? comp : max, componentSizes[0]);

  console.log(`🔍 ${numComponents} componente(s) encontrado(s). Más grande: ${largestComponent.size} píxeles (ID ${largestComponent.id})`);

  let startX = -1, startY = -1;

  for (let x = 1; x < width - 1; x++) {
    for (let y = 1; y < height - 1; y++) {
      const idx = y * width + x;
      if (componentLabels[idx] === largestComponent.id) {
        if (CQ.esPuntoBorde(binaryMask, x, y, width, height)) {
          startX = x;
          startY = y;
          break;
        }
      }
    }
    if (startX !== -1) break;
  }

  if (startX === -1) {
    console.warn('❌ No se encontró punto inicial del contorno en el componente principal');
    return [];
  }

  console.log(`✅ Punto inicial encontrado en componente principal: (${startX}, ${startY})`);

  const directions = [
    [1, 0],   // E
    [0, -1],  // N
    [-1, 0],  // W
    [0, 1],   // S
    [1, -1],  // NE
    [-1, -1], // NW
    [-1, 1],  // SW
    [1, 1]    // SE
  ];

  const directionWeights = [1, 1, 1, 1, 1.4, 1.4, 1.4, 1.4];

  const contorno = [];
  let currentX = startX;
  let currentY = startY;
  let direction = 6;

  const visited = new Set();
  let iterations = 0;

  do {
    iterations++;

    if (iterations % 100 === 0) {
      const elapsed = performance.now() - startTime;
      if (elapsed > MAX_EXECUTION_TIME) {
        console.warn(`⚠️ TIMEOUT: Trazado de contorno excedió ${MAX_EXECUTION_TIME}ms (${iterations} iteraciones)`);
        break;
      }
    }

    const pointKey = `${currentX},${currentY}`;
    contorno.push([currentX, currentY]);
    visited.add(pointKey);

    if (contorno.length >= MAX_POINTS) {
      console.warn(`⚠️ LÍMITE: Contorno alcanzó ${MAX_POINTS} puntos, terminando`);
      break;
    }

    let bestCandidate = null;
    let bestScore = -1;

    for (let i = 0; i < 8; i++) {
      const checkDir = (direction + i) % 8;
      const nextX = currentX + directions[checkDir][0];
      const nextY = currentY + directions[checkDir][1];
      const nextKey = `${nextX},${nextY}`;

      if (nextX >= 1 && nextX < width - 1 && nextY >= 1 && nextY < height - 1) {
        if (binaryMask[nextY * width + nextX] > 0) {

          if (visited.has(nextKey) && contorno.length < 8) {
            continue;
          }

          const connectionQuality = CQ.calcularCalidadConexion(binaryMask, currentX, currentY, nextX, nextY, width, height);
          const directionBonus = 1.0 / directionWeights[checkDir];
          const borderBonus = CQ.esPuntoBorde(binaryMask, nextX, nextY, width, height) ? 1.2 : 0.8;

          const score = connectionQuality * directionBonus * borderBonus;

          if (score > bestScore) {
            bestScore = score;
            bestCandidate = {
              x: nextX,
              y: nextY,
              dir: checkDir
            };
          }
        }
      }
    }

    if (!bestCandidate) {
      console.warn('No se encontró siguiente punto válido en el contorno');
      break;
    }

    currentX = bestCandidate.x;
    currentY = bestCandidate.y;
    direction = (bestCandidate.dir + 6) % 8;

  } while (!(currentX === startX && currentY === startY) || contorno.length < 4);

  const totalTime = performance.now() - startTime;
  console.log(`✅ Trazado completado: ${contorno.length} puntos brutos, ${iterations} iteraciones, ${totalTime.toFixed(0)}ms`);

  console.log(`📐 Contorno final: ${contorno.length} puntos`);

  return contorno;
}

// Export canvasPool placeholder (debe ser proveído externamente)
export const canvasPool = {
  getCanvas: (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  },
  returnCanvas: (canvas) => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
};
