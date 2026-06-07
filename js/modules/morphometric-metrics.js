/**
 * morphometric-metrics.js
 * ========================
 * ES6 Module: Morphometric metric calculation functions
 * Extracted from analysis-core.js (lines 5752-7010)
 * 
 * EXPORTED FUNCTIONS:
 *   - calcularExcentricidad()
 *   - calcularSimetriaBilateral()
 *   - calcularCurvaturaLocal()
 *   - calcularRugosidadContorno()
 *   - calcularDimensionFractal()
 *   - calcularTexturaSuperficie()
 *   - refinarMascaraPorTextura()
 *   - recortarLineaDentroDeContorno()
 *   - calcularRadiosExtremos()
 *   - calcularEjePrincipal()
 *   - calcularDiametroFeret()
 *   - calcularAngulosVertices()
 *   - calcularCompletitudFragmento()
 *   - calcularIndicesForma3D()
 * 
 * DEPENDENCIES: None - self-contained
 */

// ============================================================================
// MÉTRICA 0: EXCENTRICIDAD (y eje principal)
// Momentos de inercia de área (Green's theorem) para PCA geométrico
// ============================================================================

export function calcularExcentricidad(contourPoints, centroid) {
  if (!contourPoints || contourPoints.length < 3) {
    return { excentricidad: 0, eje_mayor: 0, eje_menor: 0 };
  }
  
  const getX = (p) => p.x !== undefined ? p.x : p[0];
  const getY = (p) => p.y !== undefined ? p.y : p[1];
  const n = contourPoints.length;
  
  let cx, cy;
  if (centroid && centroid.length >= 2 && isFinite(centroid[0]) && isFinite(centroid[1])) {
    cx = centroid[0]; cy = centroid[1];
  } else {
    let sa = 0, scx = 0, scy = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const cross = getX(contourPoints[i]) * getY(contourPoints[j]) - getX(contourPoints[j]) * getY(contourPoints[i]);
      sa += cross;
      scx += (getX(contourPoints[i]) + getX(contourPoints[j])) * cross;
      scy += (getY(contourPoints[i]) + getY(contourPoints[j])) * cross;
    }
    sa /= 2;
    if (Math.abs(sa) > 1e-10) { cx = scx / (6 * sa); cy = scy / (6 * sa); }
    else { let sx = 0, sy = 0; for (const p of contourPoints) { sx += getX(p); sy += getY(p); } cx = sx / n; cy = sy / n; }
  }
  
  let sxx = 0, syy = 0, sxy = 0, signedArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = getX(contourPoints[i]) - cx, yi = getY(contourPoints[i]) - cy;
    const xj = getX(contourPoints[j]) - cx, yj = getY(contourPoints[j]) - cy;
    const cross = xi * yj - xj * yi;
    signedArea += cross;
    sxx += (xi * xi + xi * xj + xj * xj) * cross;
    syy += (yi * yi + yi * yj + yj * yj) * cross;
    sxy += (2 * xi * yi + 2 * xj * yj + xi * yj + xj * yi) * cross;
  }
  if (Math.abs(signedArea) < 1e-10) {
    sxx = 0; syy = 0; sxy = 0;
    for (const p of contourPoints) {
      const dx = getX(p) - cx, dy = getY(p) - cy;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    sxx /= n; syy /= n; sxy /= n;
  } else {
    sxx /= (6 * signedArea);
    syy /= (6 * signedArea);
    sxy /= (12 * signedArea);
  }
  
  const trace = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const discriminant = Math.sqrt(Math.max(0, trace * trace - 4 * det));
  const lambda1 = (trace + discriminant) / 2;
  const lambda2 = (trace - discriminant) / 2;
  
  let angulo = 0;
  if (Math.abs(sxy) > 1e-10) { angulo = Math.atan2(lambda1 - sxx, sxy); }
  else { angulo = sxx > syy ? 0 : Math.PI / 2; }
  
  const cos_a = Math.cos(angulo), sin_a = Math.sin(angulo);
  let pMax1 = -Infinity, pMin1 = Infinity, pMax2 = -Infinity, pMin2 = Infinity;
  for (let i = 0; i < n; i++) {
    const px = getX(contourPoints[i]) - cx, py = getY(contourPoints[i]) - cy;
    const p1 = px * cos_a + py * sin_a;
    const p2 = -px * sin_a + py * cos_a;
    if (p1 > pMax1) pMax1 = p1; if (p1 < pMin1) pMin1 = p1;
    if (p2 > pMax2) pMax2 = p2; if (p2 < pMin2) pMin2 = p2;
  }
  const eje_mayor = pMax1 - pMin1;
  const eje_menor = pMax2 - pMin2;
  
  const excentricidad = eje_mayor > 0
    ? Math.sqrt(Math.max(0, 1 - (eje_menor * eje_menor) / (eje_mayor * eje_mayor)))
    : 0;

  let anguloGrados = angulo * 180 / Math.PI;
  if (anguloGrados < 0) anguloGrados += 180;

  return {
    excentricidad: Math.min(excentricidad, 1),
    eje_mayor: eje_mayor,
    eje_menor: eje_menor,
    angulo_eje_principal: anguloGrados
  };
}

// ============================================================================
// MÉTRICA 1: SIMETRÍA BILATERAL
// ============================================================================

export function calcularSimetriaBilateral(contourPoints, centroid, anguloEje = 0) {
  if (!contourPoints || contourPoints.length < 10) {
    return {
      simetria_bilateral: 0,
      distancia_asimetria_px: 0,
      clasificacion_simetria: 'Insuficientes puntos'
    };
  }

  const getX = (p) => p.x !== undefined ? p.x : p[0];
  const getY = (p) => p.y !== undefined ? p.y : p[1];
  const cx = centroid[0], cy = centroid[1];

  let ptsAnalisis;
  if (anguloEje !== 0) {
    const thetaRad = (90 - anguloEje) * Math.PI / 180;
    const cosT = Math.cos(thetaRad), sinT = Math.sin(thetaRad);
    ptsAnalisis = contourPoints.map(p => {
      const dx = getX(p) - cx, dy = getY(p) - cy;
      return [cx + dx * cosT - dy * sinT, cy + dx * sinT + dy * cosT];
    });
  } else {
    ptsAnalisis = contourPoints.map(p => [getX(p), getY(p)]);
  }

  const mitadIzquierda = [];
  const mitadDerecha = [];
  ptsAnalisis.forEach(p => {
    if (p[0] < cx) { mitadIzquierda.push(p); } else { mitadDerecha.push(p); }
  });

  if (mitadIzquierda.length < 3 || mitadDerecha.length < 3) {
    return {
      simetria_bilateral: 0,
      distancia_asimetria_px: 0,
      clasificacion_simetria: 'Contorno no divisible'
    };
  }

  const mitadDerechaReflejada = mitadDerecha.map(p => [2 * cx - p[0], p[1]]);

  let sumaDistancias = 0;
  mitadIzquierda.forEach(pIzq => {
    let distanciaMinima = Infinity;
    mitadDerechaReflejada.forEach(pDerRef => {
      const d = Math.hypot(pIzq[0] - pDerRef[0], pIzq[1] - pDerRef[1]);
      if (d < distanciaMinima) distanciaMinima = d;
    });
    sumaDistancias += distanciaMinima;
  });
  const distanciaAsimetriaPromedio = sumaDistancias / mitadIzquierda.length;

  let sumaRadios = 0;
  contourPoints.forEach(p => {
    const dx = getX(p) - cx, dy = getY(p) - cy;
    sumaRadios += Math.sqrt(dx * dx + dy * dy);
  });
  const radioPromedio = sumaRadios / contourPoints.length;

  const indiceSimetria = Math.max(0, Math.min(1, 1 - (distanciaAsimetriaPromedio / radioPromedio)));

  let clasificacion = '';
  if (indiceSimetria >= 0.95) {
    clasificacion = 'Altamente simétrico';
  } else if (indiceSimetria >= 0.85) {
    clasificacion = 'Simetría buena';
  } else if (indiceSimetria >= 0.70) {
    clasificacion = 'Simetría moderada';
  } else if (indiceSimetria >= 0.50) {
    clasificacion = 'Levemente asimétrico';
  } else {
    clasificacion = 'Asimétrico';
  }

  return {
    simetria_bilateral: indiceSimetria,
    distancia_asimetria_px: distanciaAsimetriaPromedio,
    clasificacion_simetria: clasificacion,
    radio_referencia_px: radioPromedio
  };
}

// ============================================================================
// MÉTRICA 2: CURVATURA LOCAL Y PUNTOS DE INFLEXIÓN
// ============================================================================

export function calcularCurvaturaLocal(contourPoints) {
  if (!contourPoints || contourPoints.length < 5) {
    return {
      curvatura_media: 0,
      curvatura_maxima: 0,
      desviacion_curvatura: 0,
      puntos_inflexion: 0,
      puntos_esquina: 0,
      clasificacion_suavidad: 'Insuficientes puntos'
    };
  }
  
  const getX = (p) => p.x !== undefined ? p.x : p[0];
  const getY = (p) => p.y !== undefined ? p.y : p[1];
  
  const curvaturas = [];
  
  for (let i = 1; i < contourPoints.length - 1; i++) {
    const p0 = [getX(contourPoints[i-1]), getY(contourPoints[i-1])];
    const p1 = [getX(contourPoints[i]), getY(contourPoints[i])];
    const p2 = [getX(contourPoints[i+1]), getY(contourPoints[i+1])];
    
    const area = Math.abs((p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1])) / 2;
    
    const d01 = Math.sqrt((p1[0] - p0[0]) ** 2 + (p1[1] - p0[1]) ** 2);
    const d12 = Math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2);
    const d20 = Math.sqrt((p0[0] - p2[0]) ** 2 + (p0[1] - p2[1]) ** 2);
    
    if (d01 > 0 && d12 > 0 && d20 > 0) {
      const k = (4 * area) / (d01 * d12 * d20);
      curvaturas.push(k);
    }
  }
  
  if (curvaturas.length === 0) {
    return {
      curvatura_media: 0,
      curvatura_maxima: 0,
      desviacion_curvatura: 0,
      puntos_inflexion: 0,
      puntos_esquina: 0,
      clasificacion_suavidad: 'Sin curvatura calculable'
    };
  }
  
  const curvaturaMedia = curvaturas.reduce((a, b) => a + b, 0) / curvaturas.length;
  const curvaturaMaxima = Math.max(...curvaturas);
  
  const varianza = curvaturas.reduce((sum, k) => sum + (k - curvaturaMedia) ** 2, 0) / curvaturas.length;
  const desviacionCurvatura = Math.sqrt(varianza);
  
  const umbralInflexion = curvaturaMedia + 2 * desviacionCurvatura;
  const puntosInflexion = curvaturas.filter(k => k > umbralInflexion).length;
  
  const umbralEsquina = curvaturaMedia + 3 * desviacionCurvatura;
  const puntosEsquina = curvaturas.filter(k => k > umbralEsquina).length;
  
  let clasificacion = '';
  if (desviacionCurvatura < 0.005) {
    clasificacion = 'Muy suave (circular/elíptico)';
  } else if (desviacionCurvatura < 0.02) {
    clasificacion = 'Suave (bordes redondeados)';
  } else if (desviacionCurvatura < 0.05) {
    clasificacion = 'Moderado (algunas inflexiones)';
  } else if (desviacionCurvatura < 0.10) {
    clasificacion = 'Irregular (múltiples inflexiones)';
  } else {
    clasificacion = 'Muy irregular (esquinas pronunciadas)';
  }
  
  return {
    curvatura_media: curvaturaMedia,
    curvatura_maxima: curvaturaMaxima,
    desviacion_curvatura: desviacionCurvatura,
    puntos_inflexion: puntosInflexion,
    puntos_esquina: puntosEsquina,
    clasificacion_suavidad: clasificacion,
    curvaturas: curvaturas
  };
}

// ============================================================================
// MÉTRICA 3: RUGOSIDAD DEL CONTORNO
// ============================================================================

export function calcularRugosidadContorno(contourPoints) {
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
  
  let clasificacion = '';
  if (rugosidad < 0.05) {
    clasificacion = 'Muy suave (pulido/regular)';
  } else if (rugosidad < 0.15) {
    clasificacion = 'Suave (ligera irregularidad)';
  } else if (rugosidad < 0.30) {
    clasificacion = 'Moderado (irregular)';
  } else if (rugosidad < 0.50) {
    clasificacion = 'Rugoso (muy irregular)';
  } else {
    clasificacion = 'Muy rugoso (fracturado/erosionado)';
  }
  
  return {
    rugosidad: rugosidad,
    longitud_segmento_media_px: mediaLongitud,
    desviacion_segmentos_px: desviacion,
    clasificacion_rugosidad: clasificacion
  };
}

// ============================================================================
// DIMENSIÓN FRACTAL — Box-counting
// ============================================================================

export function calcularDimensionFractal(contourPoints) {
  if (!contourPoints || contourPoints.length < 5) return 1.0;
  const getX = p => (p.x !== undefined ? p.x : p[0]);
  const getY = p => (p.y !== undefined ? p.y : p[1]);
  const GRID = 256;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of contourPoints) {
    const x = getX(p), y = getY(p);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const rngX = (maxX - minX) || 1;
  const rngY = (maxY - minY) || 1;

  const pixels = new Set();
  const n = contourPoints.length;
  for (let i = 0; i < n; i++) {
    const p0 = contourPoints[i], p1 = contourPoints[(i + 1) % n];
    const x0 = Math.round((getX(p0) - minX) / rngX * (GRID - 1));
    const y0 = Math.round((getY(p0) - minY) / rngY * (GRID - 1));
    const x1 = Math.round((getX(p1) - minX) / rngX * (GRID - 1));
    const y1 = Math.round((getY(p1) - minY) / rngY * (GRID - 1));
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let t = 0; t <= steps; t++) {
      const f = steps > 0 ? t / steps : 0;
      const px = Math.round(x0 + f * (x1 - x0));
      const py = Math.round(y0 + f * (y1 - y0));
      pixels.add(px * (GRID + 1) + py);
    }
  }
  if (pixels.size === 0) return 1.0;
  const pixArr = Array.from(pixels).map(code => [Math.floor(code / (GRID + 1)), code % (GRID + 1)]);

  const logEInv = [], logN = [];
  for (let k = 1; k <= 7; k++) {
    const eps = 1 << k;
    if (eps >= GRID) break;
    const boxes = new Set(pixArr.map(([x, y]) => (x >> k) * (GRID + 1) + (y >> k)));
    if (boxes.size > 0) {
      logEInv.push(Math.log(GRID / eps));
      logN.push(Math.log(boxes.size));
    }
  }
  if (logEInv.length < 3) return 1.0;

  const mE = logEInv.reduce((a, b) => a + b, 0) / logEInv.length;
  const mN = logN.reduce((a, b) => a + b, 0) / logN.length;
  let num = 0, den = 0;
  for (let i = 0; i < logEInv.length; i++) {
    num += (logEInv[i] - mE) * (logN[i] - mN);
    den += (logEInv[i] - mE) ** 2;
  }
  if (den < 1e-12) return 1.0;
  const D = num / den;
  return parseFloat(Math.max(1.0, Math.min(2.0, D)).toFixed(4));
}

// ============================================================================
// TEXTURA DE SUPERFICIE
// ============================================================================

export function calcularTexturaSuperficie(obj) {
  const resultado = { varianza_interna: null, entropia_superficie: null, gradiente_medio: null,
                      _mediaLum: null, _pixeles: null };

  let pixeles = null;
  let ancho = 0, alto = 0;
  let mascara = null;

  if (obj.detection_mask && obj.detection_width && obj.detection_height &&
      obj.canvasOriginal) {
    try {
      const w = obj.detection_width;
      const h = obj.detection_height;
      const tmpCtx = document.createElement('canvas').getContext('2d');
      tmpCtx.canvas.width  = w;
      tmpCtx.canvas.height = h;
      tmpCtx.drawImage(obj.canvasOriginal, 0, 0, w, h);
      const imgData = tmpCtx.getImageData(0, 0, w, h).data;

      const lums = [];
      for (let i = 0; i < w * h; i++) {
        if (obj.detection_mask[i]) {
          const b = i * 4;
          lums.push((imgData[b] + imgData[b+1] + imgData[b+2]) / 3);
        }
      }
      pixeles = lums;
      ancho = w; alto = h;
      mascara = obj.detection_mask;
    } catch(e) { return resultado; }

  } else if (obj.canvasOriginal) {
    try {
      const cnv = obj.canvasOriginal;
      const tmpCtx = document.createElement('canvas').getContext('2d');
      tmpCtx.canvas.width  = cnv.width;
      tmpCtx.canvas.height = cnv.height;
      tmpCtx.drawImage(cnv, 0, 0);
      const imgData = tmpCtx.getImageData(0, 0, cnv.width, cnv.height).data;
      const lums = [];
      const _maskFallback = new Uint8Array(cnv.width * cnv.height);
      for (let i = 0; i < cnv.width * cnv.height; i++) {
        const b = i * 4;
        const r = imgData[b], g = imgData[b+1], bl = imgData[b+2];
        if (!(r > 240 && g > 240 && bl > 240)) {
          lums.push((r + g + bl) / 3);
          _maskFallback[i] = 1;
        }
      }
      pixeles = lums;
      ancho = cnv.width; alto = cnv.height;
      mascara = _maskFallback;
    } catch(e) { return resultado; }
  } else {
    return resultado;
  }

  if (!pixeles || pixeles.length < 10) return resultado;
  const N = pixeles.length;

  const media = pixeles.reduce((s, v) => s + v, 0) / N;
  const varianza = pixeles.reduce((s, v) => s + (v - media) ** 2, 0) / N;
  resultado.varianza_interna = parseFloat(varianza.toFixed(4));
  resultado._mediaLum = media;
  resultado._pixeles  = pixeles;

  const hist = new Array(256).fill(0);
  pixeles.forEach(v => hist[Math.round(v)]++);
  let entropia = 0;
  hist.forEach(c => { if (c > 0) { const p = c / N; entropia -= p * Math.log2(p); } });
  resultado.entropia_superficie = parseFloat(entropia.toFixed(4));

  if (mascara && (obj.detection_width || ancho) && (obj.detection_height || alto)) {
    try {
      const w = obj.detection_width || ancho, h = obj.detection_height || alto;
      const tmpCtx2 = document.createElement('canvas').getContext('2d');
      tmpCtx2.canvas.width = w; tmpCtx2.canvas.height = h;
      tmpCtx2.drawImage(obj.canvasOriginal, 0, 0, w, h);
      const imgData2 = tmpCtx2.getImageData(0, 0, w, h).data;
      const L = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const b = i * 4;
        L[i] = (imgData2[b] + imgData2[b+1] + imgData2[b+2]) / 3;
      }

      let sumGrad = 0, nGrad = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = y * w + x;
          if (!mascara[idx]) continue;
          const gx = -L[(y-1)*w+(x-1)] + L[(y-1)*w+(x+1)]
                     -2*L[y*w+(x-1)]   + 2*L[y*w+(x+1)]
                     -L[(y+1)*w+(x-1)] + L[(y+1)*w+(x+1)];
          const gy = -L[(y-1)*w+(x-1)] - 2*L[(y-1)*w+x] - L[(y-1)*w+(x+1)]
                     +L[(y+1)*w+(x-1)] + 2*L[(y+1)*w+x] + L[(y+1)*w+(x+1)];
          sumGrad += Math.sqrt(gx*gx + gy*gy);
          nGrad++;
        }
      }
      if (nGrad > 0) resultado.gradiente_medio = parseFloat((sumGrad / nGrad).toFixed(4));
    } catch(e) {}
  }

  return resultado;
}

// ============================================================================
// REFINAMIENTO DE MÁSCARA POR TEXTURA
// ============================================================================

export function refinarMascaraPorTextura(obj, texturaData) {
  if (!obj.detection_mask || !obj.detection_width || !obj.detection_height) return null;
  if (!obj.canvasOriginal) return null;
  if (texturaData.varianza_interna === null || texturaData.varianza_interna < 400) return null;

  const media = texturaData._mediaLum;
  if (media === null) return null;

  try {
    const w = obj.detection_width, h = obj.detection_height;

    const tmpCtx = document.createElement('canvas').getContext('2d');
    tmpCtx.canvas.width = w; tmpCtx.canvas.height = h;
    tmpCtx.drawImage(obj.canvasOriginal, 0, 0, w, h);
    const imgData = tmpCtx.getImageData(0, 0, w, h).data;

    const BORDE = 2;
    let sumFondo = 0, nFondo = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x >= BORDE && x < w - BORDE && y >= BORDE && y < h - BORDE) continue;
        const b = (y * w + x) * 4;
        sumFondo += (imgData[b] + imgData[b+1] + imgData[b+2]) / 3;
        nFondo++;
      }
    }
    const lumFondo = nFondo > 0 ? sumFondo / nFondo : 255;

    if (lumFondo < 200) {
      return null;
    }

    if (media > lumFondo - 25) {
      return null;
    }

    const umbral = media + (lumFondo - media) * 0.60;

    const origMask = obj.detection_mask;
    const refinedMask = new Uint8Array(origMask.length);
    let nOrig = 0, nRefined = 0;

    for (let i = 0; i < w * h; i++) {
      if (!origMask[i]) continue;
      nOrig++;
      const b = i * 4;
      const lum = (imgData[b] + imgData[b+1] + imgData[b+2]) / 3;
      if (lum <= umbral) {
        refinedMask[i] = 1;
        nRefined++;
      }
    }

    if (nOrig === 0 || nRefined / nOrig < 0.60) {
      return null;
    }

    return refinedMask;

  } catch(e) {
    return null;
  }
}

// ============================================================================
// FUNCIÓN AUXILIAR: Recortar línea para que quede dentro del contorno
// ============================================================================

export function recortarLineaDentroDeContorno(p1, p2, contour) {
  if (!contour || contour.length < 3) return { p1, p2 };
  
  function puntoEnPoligono(punto, poligono) {
    let x = punto[0], y = punto[1];
    let dentro = false;
    
    for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
      let xi = poligono[i][0], yi = poligono[i][1];
      let xj = poligono[j][0], yj = poligono[j][1];
      
      let intersecta = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersecta) dentro = !dentro;
    }
    
    return dentro;
  }
  
  function interseccionLineas(p1, p2, p3, p4) {
    const x1 = p1[0], y1 = p1[1];
    const x2 = p2[0], y2 = p2[1];
    const x3 = p3[0], y3 = p3[1];
    const x4 = p4[0], y4 = p4[1];
    
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-10) return null;
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return [
        x1 + t * (x2 - x1),
        y1 + t * (y2 - y1)
      ];
    }
    
    return null;
  }
  
  const intersecciones = [];
  
  for (let i = 0; i < contour.length; i++) {
    const p3 = contour[i];
    const p4 = contour[(i + 1) % contour.length];
    
    const interseccion = interseccionLineas(p1, p2, p3, p4);
    if (interseccion) {
      intersecciones.push(interseccion);
    }
  }
  
  if (intersecciones.length === 0) {
    if (puntoEnPoligono(p1, contour) && puntoEnPoligono(p2, contour)) {
      return { p1, p2 };
    }
    return { p1, p2 };
  }
  
  const puntosValidos = [...intersecciones];
  if (puntoEnPoligono(p1, contour)) puntosValidos.push(p1);
  if (puntoEnPoligono(p2, contour)) puntosValidos.push(p2);
  
  if (puntosValidos.length < 2) {
    return { p1, p2 };
  }
  
  let maxDistancia = 0;
  let puntoInicio = puntosValidos[0];
  let puntoFin = puntosValidos[0];
  
  for (let i = 0; i < puntosValidos.length; i++) {
    for (let j = i + 1; j < puntosValidos.length; j++) {
      const dx = puntosValidos[j][0] - puntosValidos[i][0];
      const dy = puntosValidos[j][1] - puntosValidos[i][1];
      const distancia = Math.sqrt(dx * dx + dy * dy);
      
      if (distancia > maxDistancia) {
        maxDistancia = distancia;
        puntoInicio = puntosValidos[i];
        puntoFin = puntosValidos[j];
      }
    }
  }
  
  return { p1: puntoInicio, p2: puntoFin };
}

// ============================================================================
// MÉTRICA AUXILIAR: RADIOS EXTREMOS
// ============================================================================

export function calcularRadiosExtremos(hullPoints, centroid, fullContour) {
  if (!hullPoints || hullPoints.length < 3 || !centroid) {
    return {
      radio_maximo: 0,
      radio_minimo: 0,
      punto_radio_maximo: null,
      punto_radio_minimo: null,
      ratio_radios: 1,
      regularidad_radial: 100,
      radio_medio: 0,
      desviacion_radial: 0,
      coeficiente_variacion_radial: 0
    };
  }

  const getX = p => p.x !== undefined ? p.x : p[0];
  const getY = p => p.y !== undefined ? p.y : p[1];
  const cx = centroid[0], cy = centroid[1];
  const nh = hullPoints.length;

  let radioMaximo = 0, puntoRadioMaximo = hullPoints[0];
  for (const p of hullPoints) {
    const d = Math.hypot(getX(p) - cx, getY(p) - cy);
    if (d > radioMaximo) { radioMaximo = d; puntoRadioMaximo = p; }
  }

  let radioMinimo = Infinity;
  let puntoRadioMinimo = [getX(hullPoints[0]), getY(hullPoints[0])];
  for (let i = 0; i < nh; i++) {
    const Ax = getX(hullPoints[i]) - cx,      Ay = getY(hullPoints[i]) - cy;
    const Bx = getX(hullPoints[(i+1) % nh]) - cx, By = getY(hullPoints[(i+1) % nh]) - cy;
    const abx = Bx - Ax, aby = By - Ay;
    const ab2 = abx * abx + aby * aby;
    let nearX, nearY;
    if (ab2 < 1e-12) {
      nearX = Ax; nearY = Ay;
    } else {
      const t = Math.max(0, Math.min(1, -(Ax * abx + Ay * aby) / ab2));
      nearX = Ax + t * abx;
      nearY = Ay + t * aby;
    }
    const d = Math.hypot(nearX, nearY);
    if (d < radioMinimo) {
      radioMinimo = d;
      puntoRadioMinimo = [cx + nearX, cy + nearY];
    }
  }

  const puntosStats = (fullContour && fullContour.length >= 3) ? fullContour : hullPoints;
  let suma = 0;
  const distancias = puntosStats.map(p => {
    const d = Math.hypot(getX(p) - cx, getY(p) - cy);
    suma += d;
    return d;
  });
  const mediaRadios = suma / distancias.length;
  const varianza = distancias.reduce((acc, d) => acc + (d - mediaRadios) * (d - mediaRadios), 0) / distancias.length;
  const desviacionEstandar = Math.sqrt(varianza);
  const coeficienteVariacion = mediaRadios > 0 ? (desviacionEstandar / mediaRadios) * 100 : 0;

  const ratioRadios = radioMaximo > 0 ? radioMinimo / radioMaximo : 0;
  const regularidadRadial = ratioRadios * 100;

  return {
    radio_maximo: radioMaximo,
    radio_minimo: radioMinimo,
    radio_medio: mediaRadios,
    punto_radio_maximo: puntoRadioMaximo,
    punto_radio_minimo: puntoRadioMinimo,
    ratio_radios: ratioRadios,
    regularidad_radial: regularidadRadial,
    desviacion_radial: desviacionEstandar,
    coeficiente_variacion_radial: coeficienteVariacion
  };
}

// ============================================================================
// MÉTRICA 4: EJE PRINCIPAL Y ORIENTACIÓN
// ============================================================================

export function calcularEjePrincipal(contourPoints, centroid) {
  if (!contourPoints || contourPoints.length < 3) {
    return {
      angulo_eje_principal: 0,
      orientacion: 'Indeterminada',
      anisotropia: 0,
      forma_dominante: 'Indeterminada'
    };
  }
  
  const getX = (p) => p.x !== undefined ? p.x : p[0];
  const getY = (p) => p.y !== undefined ? p.y : p[1];
  const cx = centroid[0], cy = centroid[1];
  const n = contourPoints.length;
  
  let sxx = 0, syy = 0, sxy = 0, signedArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = getX(contourPoints[i]) - cx, yi = getY(contourPoints[i]) - cy;
    const xj = getX(contourPoints[j]) - cx, yj = getY(contourPoints[j]) - cy;
    const cross = xi * yj - xj * yi;
    signedArea += cross;
    sxx += (xi * xi + xi * xj + xj * xj) * cross;
    syy += (yi * yi + yi * yj + yj * yj) * cross;
    sxy += (2 * xi * yi + 2 * xj * yj + xi * yj + xj * yi) * cross;
  }
  if (Math.abs(signedArea) < 1e-10) {
    sxx = 0; syy = 0; sxy = 0;
    for (const p of contourPoints) {
      const dx = getX(p) - cx, dy = getY(p) - cy;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    sxx /= n; syy /= n; sxy /= n;
  } else {
    sxx /= (6 * signedArea);
    syy /= (6 * signedArea);
    sxy /= (12 * signedArea);
  }
  
  const traza = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const discriminante = Math.sqrt(Math.max(0, traza * traza - 4 * det));
  const lambda1 = (traza + discriminante) / 2;
  const lambda2 = (traza - discriminante) / 2;
  
  let angulo = 0;
  if (Math.abs(sxy) > 1e-10) {
    angulo = Math.atan2(lambda1 - sxx, sxy);
  } else {
    angulo = sxx > syy ? 0 : Math.PI / 2;
  }
  
  let anguloGrados = (angulo * 180 / Math.PI);
  if (anguloGrados < 0) anguloGrados += 180;
  
  let orientacion = '';
  if (anguloGrados < 15 || anguloGrados > 165) {
    orientacion = 'Horizontal';
  } else if (anguloGrados > 75 && anguloGrados < 105) {
    orientacion = 'Vertical';
  } else if (anguloGrados >= 15 && anguloGrados <= 75) {
    orientacion = 'Diagonal NE-SO';
  } else {
    orientacion = 'Diagonal NO-SE';
  }
  
  const anisotropia = lambda1 + lambda2 > 0 ? (lambda1 - lambda2) / (lambda1 + lambda2) : 0;
  
  let formaDominante = '';
  if (anisotropia < 0.2) {
    formaDominante = 'Isótropa (circular/cuadrada)';
  } else if (anisotropia < 0.5) {
    formaDominante = 'Moderadamente alargada';
  } else if (anisotropia < 0.8) {
    formaDominante = 'Alargada';
  } else {
    formaDominante = 'Muy alargada (lineal)';
  }
  
  const cos_a = Math.cos(angulo), sin_a = Math.sin(angulo);
  let projMax1 = -Infinity, projMin1 = Infinity;
  let projMax2 = -Infinity, projMin2 = Infinity;
  for (let i = 0; i < n; i++) {
    const px = getX(contourPoints[i]) - cx, py = getY(contourPoints[i]) - cy;
    const p1 =  px * cos_a + py * sin_a;
    const p2 = -px * sin_a + py * cos_a;
    if (p1 > projMax1) projMax1 = p1; if (p1 < projMin1) projMin1 = p1;
    if (p2 > projMax2) projMax2 = p2; if (p2 < projMin2) projMin2 = p2;
  }
  const ejeMayorLongitud = projMax1 - projMin1;
  const ejeMenorLongitud = projMax2 - projMin2;
  
  const ejeMayorP1 = [cx + projMin1 * cos_a,    cy + projMin1 * sin_a   ];
  const ejeMayorP2 = [cx + projMax1 * cos_a,    cy + projMax1 * sin_a   ];
  const ejeMenorP1 = [cx + projMin2 * (-sin_a), cy + projMin2 * cos_a   ];
  const ejeMenorP2 = [cx + projMax2 * (-sin_a), cy + projMax2 * cos_a   ];
  
  const ejeMayorRecortado = recortarLineaDentroDeContorno(ejeMayorP1, ejeMayorP2, contourPoints);
  const ejeMenorRecortado = recortarLineaDentroDeContorno(ejeMenorP1, ejeMenorP2, contourPoints);
  
  return {
    angulo_eje_principal: anguloGrados,
    orientacion: orientacion,
    anisotropia: anisotropia,
    forma_dominante: formaDominante,
    eigenvalue_mayor: lambda1,
    eigenvalue_menor: lambda2,
    eje_mayor_longitud: ejeMayorLongitud,
    eje_menor_longitud: ejeMenorLongitud,
    eje_mayor_p1: ejeMayorP1,
    eje_mayor_p2: ejeMayorP2,
    eje_menor_p1: ejeMenorP1,
    eje_menor_p2: ejeMenorP2,
    eje_mayor_p1_recortado: ejeMayorRecortado.p1,
    eje_mayor_p2_recortado: ejeMayorRecortado.p2,
    eje_menor_p1_recortado: ejeMenorRecortado.p1,
    eje_menor_p2_recortado: ejeMenorRecortado.p2,
    elongacion_inercia:     lambda2 > 1e-10 ? Math.sqrt(lambda1 / lambda2) : null,
    excentricidad_eliptica: lambda1 > 1e-10 ? Math.sqrt(Math.max(0, 1 - lambda2 / lambda1)) : null,
    isotropia_inercial:     lambda1 > 1e-10 ? lambda2 / lambda1 : null,
    radio_giro_mayor:       Math.sqrt(Math.max(0, lambda1))
  };
}

// ============================================================================
// MÉTRICA AVANZADA: DIÁMETRO DE FERET (Caliper Diameter)
// ============================================================================

export function calcularDiametroFeret(contourPoints) {
  if (!contourPoints || contourPoints.length < 3) {
    return {
      feret_max: 0,
      feret_min: 0,
      feret_ratio: 0,
      angulo_feret_max: 0,
      angulo_feret_min: 0
    };
  }
  
  let feretMax = 0;
  let feretMin = Infinity;
  let anguloFeretMax = 0;
  let anguloFeretMin = 0;
  
  const numAngulos = 90;
  const deltaAngulo = Math.PI / numAngulos;
  
  for (let i = 0; i < numAngulos; i++) {
    const angulo = i * deltaAngulo;
    const cos_a = Math.cos(angulo);
    const sin_a = Math.sin(angulo);
    
    let proyMin = Infinity;
    let proyMax = -Infinity;
    
    for (const point of contourPoints) {
      const px = Array.isArray(point) ? point[0] : point.x;
      const py = Array.isArray(point) ? point[1] : point.y;
      
      const proyeccion = px * cos_a + py * sin_a;
      
      proyMin = Math.min(proyMin, proyeccion);
      proyMax = Math.max(proyMax, proyeccion);
    }
    
    const feretEnDireccion = proyMax - proyMin;
    
    if (feretEnDireccion > feretMax) {
      feretMax = feretEnDireccion;
      anguloFeretMax = angulo * (180 / Math.PI);
    }
    
    if (feretEnDireccion < feretMin) {
      feretMin = feretEnDireccion;
      anguloFeretMin = angulo * (180 / Math.PI);
    }
  }
  
  const feretRatio = feretMin / feretMax;
  
  return {
    feret_max: feretMax,
    feret_min: feretMin,
    feret_ratio: feretRatio,
    angulo_feret_max: anguloFeretMax,
    angulo_feret_min: anguloFeretMin
  };
}

// ============================================================================
// MÉTRICA AVANZADA: ÁNGULOS EN VÉRTICES
// ============================================================================

export function calcularAngulosVertices(vertices) {
  if (!vertices || vertices.length < 3) {
    return {
      angulos: [],
      angulo_medio: 0,
      angulo_predominante: 0,
      desviacion_angulos: 0,
      num_angulos_rectos: 0,
      num_angulos_agudos: 0,
      num_angulos_obtusos: 0
    };
  }
  
  const angulos = [];
  
  for (let i = 0; i < vertices.length; i++) {
    const prev = vertices[(i - 1 + vertices.length) % vertices.length];
    const curr = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    
    const v1x = prev[0] - curr[0];
    const v1y = prev[1] - curr[1];
    const v2x = next[0] - curr[0];
    const v2y = next[1] - curr[1];
    
    const dotProduct = v1x * v2x + v1y * v2y;
    const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
    
    if (mag1 > 0 && mag2 > 0) {
      let angulo = Math.acos(Math.max(-1, Math.min(1, dotProduct / (mag1 * mag2))));
      angulo = angulo * (180 / Math.PI);
      angulos.push(angulo);
    }
  }
  
  if (angulos.length === 0) {
    return {
      angulos: [],
      angulo_medio: 0,
      angulo_predominante: 0,
      desviacion_angulos: 0,
      num_angulos_rectos: 0,
      num_angulos_agudos: 0,
      num_angulos_obtusos: 0
    };
  }
  
  const anguloMedio = angulos.reduce((a, b) => a + b, 0) / angulos.length;
  const varianza = angulos.reduce((sum, ang) => sum + Math.pow(ang - anguloMedio, 2), 0) / angulos.length;
  const desviacion = Math.sqrt(varianza);
  
  const histograma = {};
  for (const ang of angulos) {
    const bin = Math.round(ang / 5) * 5;
    histograma[bin] = (histograma[bin] || 0) + 1;
  }
  const anguloPredominante = Object.keys(histograma).reduce((a, b) => 
    histograma[a] > histograma[b] ? a : b
  );
  
  let numRectos = 0, numAgudos = 0, numObtusos = 0;
  for (const ang of angulos) {
    if (Math.abs(ang - 90) < 15) numRectos++;
    else if (ang < 75) numAgudos++;
    else numObtusos++;
  }
  
  return {
    angulos: angulos,
    angulo_medio: anguloMedio,
    angulo_predominante: parseFloat(anguloPredominante),
    desviacion_angulos: desviacion,
    num_angulos_rectos: numRectos,
    num_angulos_agudos: numAgudos,
    num_angulos_obtusos: numObtusos
  };
}

// ============================================================================
// MÉTRICA 5: ANÁLISIS DE COMPLETITUD MEJORADO
// ============================================================================

export function calcularCompletitudFragmento(contourPoints, centroid, distribucionRadialAngular) {
  if (!contourPoints || contourPoints.length < 10 || !distribucionRadialAngular) {
    return {
      completitud_estimada: 100,
      metodo_angular: 100,
      metodo_convexidad: 100,
      es_fragmento: false,
      tipo_fragmento: 'Objeto completo'
    };
  }
  
  const getX = (p) => p.x !== undefined ? p.x : p[0];
  const getY = (p) => p.y !== undefined ? p.y : p[1];
  
  const coberturaGrados = distribucionRadialAngular.coberturaGrados || 360;
  const completitudAngular = (coberturaGrados / 360) * 100;
  
  const puntos2D = contourPoints.map(p => [getX(p), getY(p)]);
  
  let areaContorno = 0;
  for (let i = 0; i < puntos2D.length; i++) {
    const p1 = puntos2D[i];
    const p2 = puntos2D[(i + 1) % puntos2D.length];
    areaContorno += p1[0] * p2[1] - p2[0] * p1[1];
  }
  areaContorno = Math.abs(areaContorno) / 2;
  
  const xs = puntos2D.map(p => p[0]);
  const ys = puntos2D.map(p => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const areaBBox = (maxX - minX) * (maxY - minY);
  
  const ratioConvexidad = areaBBox > 0 ? (areaContorno / areaBBox) : 1;
  const completitudConvexidad = ratioConvexidad * 100;
  
  const completitudEstimada = (completitudAngular * 0.6 + completitudConvexidad * 0.4);
  
  const esFragmento = completitudEstimada < 85 || coberturaGrados < 300;
  
  let tipoFragmento = '';
  if (completitudEstimada >= 95) {
    tipoFragmento = 'Objeto completo';
  } else if (completitudEstimada >= 75) {
    tipoFragmento = 'Casi completo (fragmento menor)';
  } else if (completitudEstimada >= 50) {
    tipoFragmento = 'Fragmento grande (>50%)';
  } else if (completitudEstimada >= 25) {
    tipoFragmento = 'Fragmento mediano (25-50%)';
  } else {
    tipoFragmento = 'Fragmento pequeño (<25%)';
  }
  
  return {
    completitud_estimada: completitudEstimada,
    metodo_angular: completitudAngular,
    metodo_convexidad: completitudConvexidad,
    es_fragmento: esFragmento,
    tipo_fragmento: tipoFragmento,
    cobertura_angular_grados: coberturaGrados
  };
}

// ============================================================================
// MÉTRICA 6: ÍNDICES DE FORMA 3D INFERIDA
// ============================================================================

export function calcularIndicesForma3D(area, perimetro, aspectRatio, excentricidad) {
  const esfericidad = perimetro > 0 ? (4 * Math.PI * area) / (perimetro * perimetro) : 0;
  
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
  
  let aplanamiento = '';
  if (excentricidad < 0.2) {
    aplanamiento = 'Poco aplanado (casi circular)';
  } else if (excentricidad < 0.5) {
    aplanamiento = 'Moderadamente aplanado';
  } else if (excentricidad < 0.8) {
    aplanamiento = 'Bastante aplanado';
  } else {
    aplanamiento = 'Extremadamente aplanado (laminado)';
  }
  
  return {
    esfericidad: esfericidad,
    forma_3d_inferida: forma3DInferida,
    oblongacion: oblongacion,
    clasificacion_oblongacion: clasificacionOblongacion,
    aplanamiento: aplanamiento
  };
}
