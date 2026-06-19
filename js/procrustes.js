// MAO Plus — Módulo de Análisis Procrustes (PS)
// ============================================================================
// MÓDULO: ANÁLISIS DE PROCRUSTES
// Implementa PS Parcial (pairwise) y PS Completa / GPA (Generalized Procrustes
// Analysis) sobre contornos reales de objetos de la colección activa.
//
// Algoritmos formales:
//   · resampleByArc     — N semi-landmarks equidistantes en longitud de arco
//   · svd2x2            — SVD analítica cerrada para la matriz de covarianza 2×2
//   · centrarYNormalizar — traslación al centroide, escala por CS_k = √Σ||xi||²
//   · psParcial         — registro óptimo A→B, distancia ρ = arccos(Σσ/(|A||B|))
//   · gpaIterativo      — consensus iterativo (GPA) con distancias al promedio
// ============================================================================
const ProcrustesModule = (() => {
  // ── Producción: console.log silenciado; warn/error siempre activos ────────
  // Para depuración local: window._MAO_DEBUG = true → recarga la página.
  /* eslint-disable no-console */
  const console = !window._MAO_DEBUG ? {  // shadow: silencia logs en producción
    log: () => {}, dir: () => {}, table: () => {},
    group: () => {}, groupEnd: () => {}, groupCollapsed: () => {},
    warn:  window.console.warn.bind(window.console),
    error: window.console.error.bind(window.console),
    info:  window.console.info.bind(window.console),
  } : window.console;
  /* eslint-enable no-console */

  // ─── Estado interno ───────────────────────────────────────────────────────
  let _objetos   = [];        // objetos cargados de la colección
  let _selIds    = new Set(); // IDs seleccionados
  let _tabActiva = 'parcial'; // 'parcial' | 'gpa'
  let _usedReflectionMat = null; // matriz para tracking de reflexión en pares bifaciales
  let _alignedMat       = null; // matrices {aligned_A, norm_B} ya en espacio Procrustes
  let _forceReflectionToggle = false; // toggle manual del usuario para visualizar con reflexión
  const N_PUNTOS = 64;        // semi-landmarks por contorno

  // ─── Utilidades HTML ──────────────────────────────────────────────────────
  const $  = id  => document.getElementById(id);
  const esc = s  => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  // ──────────────────────────────────────────────────────────────────────────
  //  MATEMÁTICAS PROCRUSTES
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Remuestrea una polilínea cerrada (pts = [{x,y},...]) en N puntos
   * equidistantes según la longitud de arco (semi-landmarks formales).
   * @param {Array<{x:number,y:number}>} pts
   * @param {number} N
   * @returns {Array<{x:number,y:number}>}
   */

  /**
   * Normaliza el sentido de recorrido del contorno a CW en coordenadas
   * de pantalla (Y↓, área con signo positiva). Imprescindible para que
   * el anverso y el reverso (imagen especular) compartan el mismo
   * orden de semi-landmarks antes del registro Procrustes.
   * @param {Array<{x,y}>} pts
   * @returns {Array<{x,y}>}
   */
  function normalizeFormat(pts) {
    if (!pts || !Array.isArray(pts)) return [];
    // Convertir formato: [x,y] → {x,y}
    return pts.map(p => {
      if (!p) return null;
      if (Array.isArray(p) && p.length >= 2) return {x: p[0], y: p[1]};
      if (typeof p === 'object' && 'x' in p && 'y' in p) return p;
      return null;
    }).filter(p => p !== null);
  }

  function normalizeWinding(pts) {
    if (!pts || pts.length < 3) return pts || [];
    // Normalizar formato primero
    pts = normalizeFormat(pts);
    // Fórmula de Gauss (shoelace). Positivo → CW en Y-down (pantalla).
    let a = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    // Si negativo (CCW en pantalla), invertir para tener CW consistente.
    return a < 0 ? pts.slice().reverse() : pts.slice();
  }

  function resampleByArc(pts, N) {
    if (!pts || pts.length < 3) return pts || [];
    // Normalizar formato
    pts = normalizeFormat(pts);
    if (pts.length < 3) return pts;
    // Normalizar sentido de recorrido antes de cualquier cálculo de arco
    pts = normalizeWinding(pts);
    // Longitudes de arco acumuladas (polilínea cerrada)
    const n = pts.length;
    const arc = [0];
    for (let i = 1; i < n; i++) {
      const dx = pts[i].x - pts[i-1].x;
      const dy = pts[i].y - pts[i-1].y;
      arc.push(arc[i-1] + Math.sqrt(dx*dx + dy*dy));
    }
    // Cierre: último → primero
    const dx0 = pts[0].x - pts[n-1].x;
    const dy0 = pts[0].y - pts[n-1].y;
    const totalLen = arc[n-1] + Math.sqrt(dx0*dx0 + dy0*dy0);
    if (totalLen === 0) return pts.slice(0, N);

    // N puntos a intervalos iguales de arco
    const step = totalLen / N;
    const out = [];
    let j = 0;
    for (let i = 0; i < N; i++) {
      const target = i * step;
      while (j < n - 1 && arc[j+1] < target) j++;
      // Interpolación lineal entre pts[j] y pts[(j+1) % n]
      const a0 = arc[j];
      const a1 = j + 1 < n ? arc[j+1] : totalLen;
      const t  = a1 > a0 ? (target - a0) / (a1 - a0) : 0;
      const p0 = pts[j];
      const p1 = pts[(j + 1) % n];
      out.push({ x: p0.x + t * (p1.x - p0.x), y: p0.y + t * (p1.y - p0.y) });
    }
    return out;
  }

  /**
   * SVD analítica cerrada para una matriz 2×2 M = [[m00,m01],[m10,m11]].
   * Devuelve {U, S, V} tales que M = U·diag(S)·V^T.
   * Usado para encontrar la rotación óptima: R* = V·U^T.
   * @param {number[]} m — array [m00, m01, m10, m11]
   * @returns {{U:number[], S:number[], V:number[]}} matrices aplanadas 2×2
   */
  function svd2x2(m) {
    const [m00, m01, m10, m11] = m;
    // Ángulos via Jacobi
    const t1 = 0.5 * Math.atan2(m01 + m10, m00 - m11);
    const t2 = 0.5 * Math.atan2(m01 - m10, m00 + m11);
    const c1 = Math.cos(t1), s1 = Math.sin(t1);
    const c2 = Math.cos(t2), s2 = Math.sin(t2);
    // U = rot(t1+t2), V = rot(t2-t1) en convención estándar
    const ca = Math.cos(t1+t2), sa = Math.sin(t1+t2);
    const cb = Math.cos(t2-t1), sb = Math.sin(t2-t1);
    // Valores singulares
    const s0 = m00*c1*c2 + m11*s1*s2 + m01*s1*c2 + m10*c1*s2;
    const s_  = m00*s1*s2 + m11*c1*c2 - m01*c1*s2 - m10*s1*c2; // en general s0≥s_
    return {
      U: [ca, -sa, sa, ca],    // U  (2×2 aplanada row-major)
      S: [Math.abs(s0), Math.abs(s_)],
      V: [cb, -sb, sb, cb],    // V
      detSign: Math.sign(s0)   // para corrección de reflexión
    };
  }

  /**
   * Calcula el centroide (media) de una configuración de puntos.
   * @param {Array<{x,y}>} pts
   * @returns {{cx:number, cy:number}}
   */
  function centroide(pts) {
    // Normalizar formato primero
    pts = normalizeFormat(pts);
    if (pts.length === 0) return { cx: 0, cy: 0 };
    let sx = 0, sy = 0;
    for (const p of pts) { sx += p.x; sy += p.y; }
    return { cx: sx / pts.length, cy: sy / pts.length };
  }

  /**
   * Detecta y elimina puntos outliers usando desviación estándar.
   * Mejora 1: Los outliers pueden distorsionar significativamente el alineamiento.
   * @param {Array<{x,y}>} pts
   * @param {number} stdThreshold — número de desv. estándar (default: 2.5)
   * @returns {Array<{x,y}>}
   */
  function detectarYFiltrarOutliers(pts, stdThreshold = 2.5) {
    if (!pts || pts.length < 4) return pts;
    
    pts = normalizeFormat(pts);
    const { cx, cy } = centroide(pts);
    
    // Calcular distancia de cada punto al centroide
    const distancias = pts.map((p, i) => ({
      index: i,
      dist: Math.hypot(p.x - cx, p.y - cy),
      punto: p
    }));
    
    // Estadísticas de distancias
    const dists = distancias.map(d => d.dist);
    const media = dists.reduce((a, b) => a + b, 0) / dists.length;
    const varianza = dists.reduce((a, d) => a + (d - media) ** 2, 0) / dists.length;
    const stdDev = Math.sqrt(varianza);
    
    // Umbral: media ± (stdThreshold × stdDev)
    const umbralInf = media - stdThreshold * stdDev;
    const umbralSup = media + stdThreshold * stdDev;
    
    // Filtrar puntos dentro del rango
    const filtrados = distancias
      .filter(d => d.dist >= umbralInf && d.dist <= umbralSup)
      .map(d => d.punto);
    
    const eliminados = pts.length - filtrados.length;
    if (eliminados > 0) {
      console.log(`🔍 [Outliers] ${pts.length} → ${filtrados.length} (eliminados: ${eliminados})`);
    }
    
    // Fallback: si elimina demasiados puntos, mantener original
    return filtrados.length >= 3 ? filtrados : pts;
  }

  /**
   * Calcula correlación de similitud de forma entre dos conjuntos de puntos
   * @param {Array<{x,y}>} pts1 
   * @param {Array<{x,y}>} pts2 
   * @returns {number} correlación (-1 a 1)
   */
  function calcularCorrelacionForma(pts1, pts2) {
    if (!pts1 || !pts2 || pts1.length < 2 || pts2.length < 2) return 0;
    const len = Math.min(pts1.length, pts2.length);
    const _pts1 = pts1.slice(0, len);
    const _pts2 = pts2.slice(0, len);
    const media1 = { x: _pts1.reduce((a,p)=>a+p.x,0)/len,
                     y: _pts1.reduce((a,p)=>a+p.y,0)/len };
    const media2 = { x: _pts2.reduce((a,p)=>a+p.x,0)/len,
                     y: _pts2.reduce((a,p)=>a+p.y,0)/len };
    let num = 0, den1 = 0, den2 = 0;
    for (let i = 0; i < len; i++) {
      const d1x = pts1[i].x - media1.x, d1y = pts1[i].y - media1.y;
      const d2x = pts2[i].x - media2.x, d2y = pts2[i].y - media2.y;
      num += d1x * d2x + d1y * d2y;
      den1 += d1x * d1x + d1y * d1y;
      den2 += d2x * d2x + d2y * d2y;
    }
    return num / Math.sqrt(den1 * den2 + 1e-10);
  }

  /**
   * MEJORA 2: Valida la calidad del alineamiento Procrustes
   * @param {Array<{x,y}>} ptsA_original — puntos A antes de alineamiento
   * @param {Array<{x,y}>} ptsA_aligned — puntos A después de alineamiento  
   * @param {Array<{x,y}>} ptsB_norm — puntos B normalizados
   * @param {number} rho — Procrustes distance (distancia angular)
   * @returns {{score:number, interpretacion:string, flags:string[]}} — validación 0-100
   */
  function validarAlineamiento(ptsA_original, ptsA_aligned, ptsB_norm, rho) {
    const flags = [];
    let score = 100;
    
    // ─── Métrica 1: Correlación de forma antes/después ─────────────
    const corrAntes = calcularCorrelacionForma(ptsA_original, ptsB_norm);
    const corrDespues = calcularCorrelacionForma(ptsA_aligned, ptsB_norm);
    const mejora = (corrDespues - corrAntes) / Math.abs(corrAntes + 1e-6);
    
    if (mejora < 0.1) {
      flags.push("Mejora mínima al alinear (< 10%)");
      score -= 15;
    }
    
    // ─── Métrica 2: Uniformidad de residuos ──────────────────────
    const _lenR = Math.min(ptsA_aligned.length, ptsB_norm.length);
    const residuos = Array.from({length: _lenR}, (_, i) =>
      Math.hypot(ptsA_aligned[i].x - ptsB_norm[i].x, ptsA_aligned[i].y - ptsB_norm[i].y)
    );
    const mediaResiduo = residuos.reduce((a,b) => a+b, 0) / residuos.length;
    const stdResiduo = Math.sqrt(residuos.reduce((a,d) => a+(d-mediaResiduo)**2, 0) / residuos.length);
    const coefVariacion = stdResiduo / (mediaResiduo + 1e-6);
    
    if (coefVariacion > 0.8) {
      flags.push("Residuos muy variables (distribución no uniforme)");
      score -= 20;
    }
    
    // ─── Métrica 3: Rho aceptable ───────────────────────────────
    if (rho > Math.PI / 4) {  // > 45°
      flags.push("Distancia ρ muy alta (> 45°) - alineamiento pobre");
      score -= 25;
    } else if (rho > Math.PI / 6) {  // > 30°
      flags.push("Distancia ρ moderada (> 30°)");
      score -= 10;
    }
    
    // ─── Métrica 4: Magnitud del cambio de escala ────────────────
    const magnitudA = Math.sqrt(ptsA_aligned.reduce((a,p) => a+p.x*p.x+p.y*p.y, 0));
    const magnitudB = Math.sqrt(ptsB_norm.reduce((a,p) => a+p.x*p.x+p.y*p.y, 0));
    const ratioEscala = magnitudA / magnitudB;
    
    if (Math.abs(ratioEscala - 1) > 0.3) {
      flags.push(`Escala cambió mucho (ratio: ${ratioEscala.toFixed(2)})`);
      score -= 10;
    }
    
    // ─── Interpretación ──────────────────────────────────────────
    let interpretacion = "ERROR";
    if (score >= 90) interpretacion = "✅ Excelente — alineamiento muy preciso";
    else if (score >= 75) interpretacion = "✅ Bueno — alineamiento confiable";
    else if (score >= 60) interpretacion = "⚠️  Aceptable — revisar resultados";
    else if (score >= 40) interpretacion = "❌ Pobre — posibles problemas";
    else interpretacion = "❌ Muy pobre — NO CONFIABLE";
    
    console.log(`📊 Validación: ${score}/100 — ${interpretacion}`);
    if (flags.length > 0) console.log(`   Alertas: ${flags.join('; ')}`);
    
    return { score: Math.max(0, score), interpretacion, flags };
  }

  /**
   * Calcula el eje de inercia (eje de máxima varianza) de una configuración centrada.
   * Retorna el ángulo de rotación necesario para alinearlo horizontalmente.
   * @param {Array<{x,y}>} pts — puntos centrados en el origen
   * @returns {{angle:number, lambda1:number, lambda2:number}} — ángulo de rotación y valores propios
   */
  function calcularEjeInercia(pts) {
    if (!pts || pts.length < 2) return { angle: 0, lambda1: 0, lambda2: 0 };
    
    // Matriz de covarianza 2x2 centrada
    const n = pts.length;
    let Sxx = 0, Syy = 0, Sxy = 0;
    for (const p of pts) {
      Sxx += p.x * p.x;
      Syy += p.y * p.y;
      Sxy += p.x * p.y;
    }
    Sxx /= n; Syy /= n; Sxy /= n;
    
    // Método analítico para eigenvalores de matriz 2x2
    const trace = Sxx + Syy;
    const det = Sxx * Syy - Sxy * Sxy;
    const disc = Math.sqrt(Math.max(0, trace * trace / 4 - det));
    
    const lambda1 = trace / 2 + disc;  // Mayor eigenvalue
    const lambda2 = trace / 2 - disc;  // Menor eigenvalue
    
    // Ángulo del eigenvector correspondiente a lambda1
    let angle = 0;
    if (Math.abs(Sxy) > 1e-10) {
      angle = 0.5 * Math.atan2(2 * Sxy, Sxx - Syy);
    } else if (Sxx < Syy) {
      angle = Math.PI / 2;
    }
    
    return { angle, lambda1, lambda2 };
  }

  /**
   * Alinea un contorno centrado según su eje de inercia (lo pone horizontal).
   * @param {Array<{x,y}>} pts — puntos centrados
   * @returns {Array<{x,y}>} — puntos rotados
   */
  function alinearPorEjeInercia(pts) {
    if (!pts || pts.length < 2) return pts;
    
    const { angle } = calcularEjeInercia(pts);
    if (Math.abs(angle) < 1e-10) return pts;
    
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    
    return pts.map(p => ({
      x: p.x * cos - p.y * sin,
      y: p.x * sin + p.y * cos
    }));
  }

  /**
   * Centra, normaliza Y alinea según eje de inercia en una sola función.
   * Esto es crítico para Procrustes: asegura que ambos contornos compartan
   * la misma orientación del eje principal antes del registro.
   * @param {Array<{x,y}>} pts
   * @returns {{pts:Array<{x,y}>, cs:number, cx:number, cy:number, angle:number}}
   */
  function centrarNormalizarYAlinearPorEjeInercia(pts) {
    // Paso 1: Centrar y normalizar (como siempre)
    const { pts: norm, cs, cx, cy } = centrarYNormalizar(pts);
    
    // Paso 2: Alinear por eje de inercia
    const alineado = alinearPorEjeInercia(norm);
    
    // Guardar el ángulo para tracking
    const { angle } = calcularEjeInercia(norm);
    
    return { pts: alineado, cs, cx, cy, angle };
  }

  /**
   * Centra y normaliza una configuración por su CS_k (Centroid Size).
   * CS_k = √(Σ||xi − x̄||²)
   * @param {Array<{x,y}>} pts
   * @returns {{pts:Array<{x,y}>, cs:number, cx:number, cy:number}}
   */
  function centrarYNormalizar(pts) {
    // Normalizar formato primero
    pts = normalizeFormat(pts);
    if (pts.length < 1) return { pts: [], cs: 1, cx: 0, cy: 0 };
    const { cx, cy } = centroide(pts);
    const cent = pts.map(p => ({ x: p.x - cx, y: p.y - cy }));
    const cs = Math.sqrt(cent.reduce((s, p) => s + p.x*p.x + p.y*p.y, 0));
    if (cs === 0) return { pts: cent, cs: 1, cx, cy };
    const norm = cent.map(p => ({ x: p.x / cs, y: p.y / cs }));
    return { pts: norm, cs, cx, cy };
  }

  /**
   * Rotación óptima de A para coincidir con B mediante SVD.
   * Ambas configuraciones deben estar ya centradas y normalizadas.
   * @param {Array<{x,y}>} A
   * @param {Array<{x,y}>} B
   * @returns {{Ar:Array<{x,y}>, sigma:number, R:number[]}} — A rotada, Σσ, R 2×2
   */
  function rotar(A, B) {
    // Matriz de covarianza cruzada M = A^T · B (2×2)
    let m00=0, m01=0, m10=0, m11=0;
    for (let i = 0; i < A.length; i++) {
      m00 += A[i].x * B[i].x;  m01 += A[i].x * B[i].y;
      m10 += A[i].y * B[i].x;  m11 += A[i].y * B[i].y;
    }
    const { U, S, V, detSign } = svd2x2([m00, m01, m10, m11]);
    // R* = V·U^T (con corrección de reflexión si det < 0)
    // V = [[v00,v01],[v10,v11]], U = [[u00,u01],[u10,u11]]
    // Corrección: si det(M) < 0, voltear última columna de V
    const [v00, v01, v10, v11] = V;
    const [u00, u01, u10, u11] = U;
    // det(V·U^T) debe ser +1
    const sign = detSign >= 0 ? 1 : -1;
    // R = V · diag(1,sign) · U^T
    const r00 =  v00*u00 + sign*v01*u01;
    const r01 = -v00*u10 - sign*v01*u11;
    const r10 =  v10*u00 + sign*v11*u01;
    const r11 = -v10*u10 - sign*v11*u11;
    const Ar = A.map(p => ({ x: r00*p.x + r01*p.y, y: r10*p.x + r11*p.y }));
    const sigma = S[0] + sign * S[1]; // Σσk (suma valores singulares ajustados)
    return { Ar, sigma, R: [r00, r01, r10, r11] };
  }

  /**
   * PS Parcial entre dos configuraciones de puntos brutos.
   * Pasos: resample → centrar+normalizar → rotar A sobre B.
   * @param {Array<{x,y}>} ptsA  puntos del contorno A (sin procesar)
   * @param {Array<{x,y}>} ptsB  puntos del contorno B
   * @param {number} N           número de semi-landmarks
   * @returns {{dist:number, csA:number, csB:number, aligned_A:Array, norm_B:Array, paused:boolean}}
   */
  /**
   * Rotación con opción explícita de reflexión.
   * Permite calcular alineamiento tanto con rotación como con reflexión.
   * @param {Array<{x,y}>} A
   * @param {Array<{x,y}>} B
   * @param {boolean} permitirReflexion - si true, permite det(R)=-1
   * @returns {{Ar:Array<{x,y}>, sigma:number, R:number[], usedReflection:boolean}}
   */
  function rotarConReflexion(A, B, permitirReflexion = false) {
    let m00=0, m01=0, m10=0, m11=0;
    for (let i = 0; i < A.length; i++) {
      m00 += A[i].x * B[i].x;  m01 += A[i].x * B[i].y;
      m10 += A[i].y * B[i].x;  m11 += A[i].y * B[i].y;
    }
    const { U, S, V, detSign } = svd2x2([m00, m01, m10, m11]);
    
    const [v00, v01, v10, v11] = V;
    const [u00, u01, u10, u11] = U;
    
    // Si permitirReflexion=true, usar el signo natural de detSign
    // Si permitirReflexion=false, forzar sign=1 (rotación pura)
    let sign, usedReflection = false;
    if (permitirReflexion && detSign < 0) {
      // Permitir reflexión: usar det natural
      sign = -1;
      usedReflection = true;
    } else {
      sign = 1; // Forzar rotación pura
    }
    
    // R = V · diag(1,sign) · U^T
    const r00 =  v00*u00 + sign*v01*u01;
    const r01 = -v00*u10 - sign*v01*u11;
    const r10 =  v10*u00 + sign*v11*u01;
    const r11 = -v10*u10 - sign*v11*u11;
    
    const Ar = A.map(p => ({ x: r00*p.x + r01*p.y, y: r10*p.x + r11*p.y }));
    const sigma = S[0] + sign * S[1];
    
    return { Ar, sigma, R: [r00, r01, r10, r11], usedReflection };
  }

  function psParcial(ptsA, ptsB, N) {
    // Normalizar formato de entrada
    ptsA = normalizeFormat(ptsA);
    ptsB = normalizeFormat(ptsB);
    if (ptsA.length < 3 || ptsB.length < 3) return { dist: Infinity, csA: 0, csB: 0, aligned_A: [], norm_B: [] };
    
    // ✨ MEJORA 1: Filtrar outliers antes del resample
    ptsA = detectarYFiltrarOutliers(ptsA, 2.5);
    ptsB = detectarYFiltrarOutliers(ptsB, 2.5);
    
    const rA = resampleByArc(ptsA, N);
    const rB = resampleByArc(ptsB, N);
    // ✓ Alinear por eje de inercia ANTES del Procrustes (crítico para calidad de registro)
    const { pts: nA, cs: csA } = centrarNormalizarYAlinearPorEjeInercia(rA);
    const { pts: nB, cs: csB } = centrarNormalizarYAlinearPorEjeInercia(rB);
    const nA_original = nA; // Guardar para validación (antes de rotar)
    const { Ar, sigma } = rotar(nA, nB);
    // Distancia de Procrustes parcial: ρ = arccos(Σσ / (|A|·|B|))
    // Como nA y nB ya están normalizados (CS=1 después de normalizar), Σσ ≤ 1
    const clamped = Math.max(-1, Math.min(1, sigma));
    const dist = Math.acos(clamped); // ρ ∈ [0, π/2]
    
    // MEJORA 2: Calcular score de validación
    const validation = validarAlineamiento(nA_original, Ar, nB, dist);
    
    return { dist, csA, csB, aligned_A: Ar, norm_B: nB, validation };
  }

  /**
   * PS Parcial para PARES BIFACIALES (caras A y B del mismo objeto).
   * Prueba alineamiento CON Y SIN reflexión y elige el mejor.
   * Las caras bifaciales son imágenes especulares, por eso la reflexión es crítica.
   * @param {Array<{x,y}>} ptsA
   * @param {Array<{x,y}>} ptsB
   * @param {number} N
   * @returns {{dist:number, csA:number, csB:number, aligned_A:Array, norm_B:Array, usedReflection:boolean}}
   */
  function psParcialBifacial(ptsA, ptsB, N, preProcessed = false) {
    ptsA = normalizeFormat(ptsA);
    ptsB = normalizeFormat(ptsB);
    if (ptsA.length < 3 || ptsB.length < 3) return { dist: Infinity, csA: 0, csB: 0, aligned_A: [], norm_B: [], usedReflection: false };

    let rA, rB;
    if (preProcessed) {
      rA = ptsA;
      rB = ptsB;
    } else {
      // ✨ MEJORA 1: Filtrar outliers antes del resample (crítico para bifaciales)
      ptsA = detectarYFiltrarOutliers(ptsA, 2.5);
      ptsB = detectarYFiltrarOutliers(ptsB, 2.5);
      rA = resampleByArc(ptsA, N);
      rB = resampleByArc(ptsB, N);
    }

    // ✓ Alinear por eje de inercia ANTES del Procrustes (crítico para caras bifaciales)
    const { pts: nA, cs: csA } = centrarNormalizarYAlinearPorEjeInercia(rA);
    const { pts: nB, cs: csB } = centrarNormalizarYAlinearPorEjeInercia(rB);
    const nA_original = nA; // Guardar para validación
    
    // Probar AMBAS opciones
    const sineflexion = rotarConReflexion(nA, nB, false);
    const conreflexion = rotarConReflexion(nA, nB, true);
    
    // Comparar distancias - elegir la que dé mejor alineamiento (menor ρ)
    const sigma1 = Math.max(-1, Math.min(1, sineflexion.sigma));
    const sigma2 = Math.max(-1, Math.min(1, conreflexion.sigma));
    const dist1 = Math.acos(sigma1);
    const dist2 = Math.acos(sigma2);
    
    // Usar la mejor alineación
    const mejor = dist2 < dist1 ? conreflexion : sineflexion;
    const dist = Math.min(dist1, dist2);
    
    // MEJORA 2: Calcular score de validación para el mejor alineamiento
    const validation = validarAlineamiento(nA_original, mejor.Ar, nB, dist);
    
    return { 
      dist, csA, csB, 
      aligned_A: mejor.Ar, 
      norm_B: nB, 
      usedReflection: conreflexion.usedReflection && dist2 < dist1,
      validation
    };
  }

  /**
   * Forma media de un conjunto de configuraciones ya centradas y normalizadas.
   * @param {Array<Array<{x,y}>>} configs
   * @returns {Array<{x,y}>}
   */
  function shapeMean(configs) {
    const N = configs[0].length;
    const mean = Array.from({ length: N }, () => ({ x: 0, y: 0 }));
    for (const cfg of configs) {
      for (let i = 0; i < N; i++) {
        mean[i].x += cfg[i].x;
        mean[i].y += cfg[i].y;
      }
    }
    const k = configs.length;
    return mean.map(p => ({ x: p.x / k, y: p.y / k }));
  }

  /**
   * GPA iterativo (Generalized Procrustes Analysis).
   * @param {Array<Array<{x,y}>>} rawConfigs  — arrays de puntos brutos (sin procesar)
   * @param {number} N                        — semi-landmarks
   * @param {number} maxIter
   * @returns {{consensus:Array<{x,y}>, aligned:Array<Array<{x,y}>>, dists:number[], csAll:number[], iters:number}}
   */
  /**
   * @param {boolean[]} [mirrorMask]  — si mirrorMask[i]===true, la config i se refleja
   *   en eje X (x→−x) DESPUÉS de centrar+normalizar+alinear, es decir en espacio de
   *   forma puro. Esto es correcto para caras B de pares bifaciales.
   */
  function gpaIterativo(rawConfigs, N, maxIter = 30, mirrorMask = null, preProcessed = false, bakedMask = null) {
    try {
      // Validar entrada
      if (!rawConfigs || !Array.isArray(rawConfigs) || rawConfigs.length < 2) {
        console.error('❌ [GPA] rawConfigs inválido:', rawConfigs);
        return { consensus: [], aligned: [], dists: [], csAll: [], iters: 0 };
      }
      
      if (!N || N < 3) {
        console.error('❌ [GPA] N inválido:', N);
        return { consensus: [], aligned: [], dists: [], csAll: [], iters: 0 };
      }

      // Normalizar formato de todas las configuraciones
      // Mantener el índice original para que mirrorMask se aplique correctamente
      // (configs_norm podría filtrar configs inválidas, desincronizando índices con mirrorMask)
      const configs_norm   = [];
      const mirrorResolved = [];
      rawConfigs.forEach((cfg, origIdx) => {
        const nf = normalizeFormat(cfg);
        if (nf.length >= 3) {
          configs_norm.push(nf);
          mirrorResolved.push(mirrorMask ? !!mirrorMask[origIdx] : false);
        }
      });
      if (configs_norm.length < 2) {
        console.warn('⚠️ [GPA] Después de normalizar, < 2 configs válidas');
        return { consensus: [], aligned: [], dists: [], csAll: [], iters: 0 };
      }
      
      // 1. Resample + centrar + normalizar + ALINEAR POR EJE DE INERCIA todos
      // Para caras B bifaciales: aplicar espejo (x→−x) ANTES del resample en coordenadas
      // de píxel, de modo que resampleByArc→normalizeWinding re-normalice el sentido de
      // recorrido y los semi-landmarks queden en correspondencia CW con las caras A.
      const normalized = configs_norm
        .map((pts, i) => {
          // Configuración ya preprocesada (N semi-landmarks consistentes)
          if (preProcessed) {
            return centrarNormalizarYAlinearPorEjeInercia(normalizeFormat(pts));
          }

          // Si bakedMask indica landmarks ya horneados y no requiere espejo,
          // saltar filter+resample y solo re-normalizar para GPA.
          if (bakedMask && bakedMask[i] && !mirrorResolved[i]) {
            return centrarNormalizarYAlinearPorEjeInercia(pts);
          }

          // Espejo en espacio píxel → normalizeWinding lo reordenará correctamente
          const workPts = mirrorResolved[i] ? pts.map(p => ({ x: -p.x, y: p.y })) : pts;
          const filtered  = detectarYFiltrarOutliers(workPts, 2.5);
          const resampled = resampleByArc(filtered, N);
          const result    = centrarNormalizarYAlinearPorEjeInercia(resampled);
          return result;
        });
      
      let configs = normalized.map(r => r.pts);
      const csAll  = normalized.map(r => r.cs);

      // Validar que configs no esté vacío
      if (!configs || configs.length === 0) {
        console.error('❌ [GPA] Config vacío después de normalizar');
        return { consensus: [], aligned: [], dists: [], csAll: [], iters: 0 };
      }

      // Detección temprana de posibles inversiones de orientación (180°)
      // frente a la media inicial del conjunto.
      let mean = shapeMean(configs);
      const inversionSuspects = configs.map((cfg, i) => {
        const corr = cfg.reduce((s, p, j) => s + p.x * mean[j].x + p.y * mean[j].y, 0);
        return corr < 0 ? i : -1;
      }).filter(i => i >= 0);

      if (inversionSuspects.length > 0) {
        console.warn(`⚠️ [GPA] ${inversionSuspects.length} forma(s) con orientación opuesta al grupo: índices [${inversionSuspects.join(', ')}]`);
      }

      let prevSS = Infinity;
      let iters = 0;
      let converged = false;

      for (let iter = 0; iter < maxIter; iter++) {
        // 2. Normalizar la forma media
        const { pts: meanN } = centrarYNormalizar(mean);

        // 3. Rotar cada config sobre la media normalizada
        configs = configs.map(cfg => rotar(cfg, meanN).Ar);

        // 4. Nueva media
        mean = shapeMean(configs);

        // 5. Convergencia: suma de distancias al cuadrado
        const ss = configs.reduce((acc, cfg) => {
          const { pts: mnN2 } = centrarYNormalizar(mean);
          return acc + cfg.reduce((a, p, i) => {
            const dx = p.x - mnN2[i].x, dy = p.y - mnN2[i].y;
            return a + dx*dx + dy*dy;
          }, 0);
        }, 0);

        if (Math.abs(prevSS - ss) < 1e-10) { iters = iter + 1; converged = true; break; }
        prevSS = ss;
        iters = iter + 1;
      }

      // 6. Consensus final alineado por eje de inercia
      // centrarNormalizarYAlinearPorEjeInercia garantiza orientación canónica (eje mayor → horizontal).
      // Esto no altera las distancias (arccos del producto punto es invariante a rotación global).
      const { pts: consensus } = centrarNormalizarYAlinearPorEjeInercia(mean);

      // Re-alinear todos los configs al consensus con eje de inercia para que el canvas
      // muestre las formas ya orientadas coherentemente.
      const aligned = configs.map(cfg => rotar(cfg, consensus).Ar);

      const dists = aligned.map(cfg => {
        const sigma = cfg.reduce((s, p, i) => s + p.x*consensus[i].x + p.y*consensus[i].y, 0);
        const clamped = Math.max(-1, Math.min(1, sigma));
        return Math.acos(clamped);
      });

      console.log(`✅ GPA completado: ${configs_norm.length} objetos, ${iters} iteraciones`);
      return { consensus, aligned, dists, csAll, iters, converged, inversionSuspects };
    } catch (err) {
      console.error('❌ [GPA] Error en gpaIterativo:', err.message, err.stack);
      return { consensus: [], aligned: [], dists: [], csAll: [], iters: 0 };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  ACCESO A DATOS DE GEOMETRÍA
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Extrae los puntos del contorno real de un objeto de la colección.
   * Fallback: convex hull si no hay contorno.
   * @param {object} obj
   * @returns {Array<{x,y}>|null}
   */
  function getPuntos(obj) {
    // Debug: verificar estructura
    const debug = false; // Cambiar a true para diagnosticar
    if (debug) {
      console.log(`🔍 [PS] getPuntos(${obj.id}):`, {
        tieneGeometria: !!obj.geometria,
        tieneContornoReal: !!obj.geometria?.contornoReal,
        contornoRealKeys: Object.keys(obj.geometria?.contornoReal || {}),
        tieneContornoPuntos: !!obj.geometria?.contornoReal?.puntos,
        contornoCantidad: obj.geometria?.contornoReal?.puntos?.length || 0,
        tieneConvexHull: !!obj.geometria?.convexHull,
        convexHullCantidad: obj.geometria?.convexHull?.puntos?.length || 0
      });
    }
    
    // Contorno real (primera opción)
    const cr = obj.geometria?.contornoReal?.puntos;
    if (Array.isArray(cr) && cr.length >= 3) {
      if (debug) console.log(`  ✅ Usando contorno real (${cr.length} puntos)`);
      // Normalizar formato: si son arrays [x,y], convertir a {x,y}
      return cr.map(p => Array.isArray(p) ? {x: p[0], y: p[1]} : p);
    }
    
    // Convex hull (fallback principal)
    const ch = obj.geometria?.convexHull?.puntos || obj.geometria?.convexHull;
    if (Array.isArray(ch) && ch.length >= 3) {
      if (debug) console.log(`  📦 Contorno vacío, usando Convex Hull (${ch.length} puntos)`);
      return ch.map(p => Array.isArray(p) ? {x: p[0], y: p[1]} : p);
    }
    
    // Último recurso: intentar metricas.convex_hull_points
    const chMetricas = obj.metricas?.convex_hull_points;
    if (Array.isArray(chMetricas) && chMetricas.length >= 3) {
      if (debug) console.log(`  📦 Usando metricas.convex_hull_points (${chMetricas.length} puntos)`);
      return chMetricas.map(p => Array.isArray(p) ? {x: p[0], y: p[1]} : p);
    }
    
    if (debug) console.log(`  ❌ No hay contorno ni hull disponible`);
    return null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  CARGA DE OBJETOS (patrón idéntico al CMO)
  // ──────────────────────────────────────────────────────────────────────────

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
          // Derivar cara desde el nombre cuando el campo cara no está disponible
          // (e.g. datos guardados antes de la bifacial detection, o nombre = "Obj (Cara A)")
          let caraFinal = (a.cara || '').toUpperCase();
          if (caraFinal !== 'A' && caraFinal !== 'B') {
            const m = /\(\s*cara\s+([ab])\s*\)/i.exec(a.nombreObjeto || '') ||
                      /\[\s*cara\s+([ab])\s*\]/i.exec(a.nombreObjeto || '');
            caraFinal = m ? m[1].toUpperCase() : 'Mono';
          }
          // Nombre base: quitar sufijo "(Cara X)" o "[Cara X]" si lo tiene
          const nombreBase = (a.nombreObjeto || ref.nombreObjeto || ref.id || '')
            .replace(/\s*[\[(]\s*cara\s+[ab]\s*[\])]\s*$/i, '').trim();
          _objetos.push({
            id:            a.id || ref.id,
            nombre:        nombreBase || ref.id,
            cara:          caraFinal,
            fecha:         new Date(a.timestamp).toLocaleDateString('es-ES'),
            thumbnailPath: `${ruta}/imagenes/objeto_recortado.png`,
            metricas:      a.metricas || {},
            geometria:     a.geometria || {},
          });
        }
      } catch(e) {
        console.warn('[PS] No se pudo cargar:', ruta, e.message);
      }
    }
    if (!_objetos.length) {
      if (typeof toast !== 'undefined')
        toast.warning('Sin análisis en disco. Guarda los análisis primero.');
      return false;
    }
    return true;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  RENDER: PANEL DE SELECCIÓN DE OBJETOS
  // ──────────────────────────────────────────────────────────────────────────

  function renderObjetos() {
    _selIds = new Set(_objetos.map(o => String(o.id)));
    const container = $('psListaObjetos');
    if (!container) return;

    // Agrupar por nombre base (sin sufijo de cara), ordenar caras
    const grupos = {};
    for (const obj of _objetos) {
      const key = obj.nombre.replace(/\s*[\[(]\s*cara\s+[ab]\s*[\])]\s*$/i, '').trim().toLowerCase();
      if (!grupos[key]) grupos[key] = { nombre: obj.nombre.replace(/\s*[\[(]\s*cara\s+[ab]\s*[\])]\s*$/i, '').trim(), caras: [] };
      grupos[key].caras.push(obj);
    }
    const ORDEN = { 'A':0,'a':0,'B':1,'b':1,'Mono':2 };
    for (const g of Object.values(grupos)) {
      g.caras.sort((a, b) => (ORDEN[a.cara]??3) - (ORDEN[b.cara]??3));
    }
    const lista = Object.values(grupos);

    function buildRows(q) {
      let h = `
        <div class="cmo-sel-search-bar">
          <span class="cmo-sel-search-icon">🔍</span>
          <input type="text" id="psFiltroObjetos" class="cmo-sel-search-input"
            placeholder="Filtrar por nombre…" value="${esc(q)}" autocomplete="off">
          <span id="psCuentaTotal" class="cmo-sel-search-count"></span>
        </div>
        <div class="cmo-sel-col-header">
          <span></span><span class="cmo-sel-col-thumb"></span><span>Nombre</span><span>Cara</span><span>Fecha</span>
        </div>
        <div class="cmo-sel-list">`;

      let visible = 0;
      for (const g of lista) {
        if (q && !g.nombre.toLowerCase().includes(q)) continue;
        visible++;
        if (g.caras.length === 1) {
          const obj = g.caras[0];
          const lbl = obj.cara !== 'Mono' ? obj.cara : 'Mono';
          const sel = _selIds.has(String(obj.id));
          const _tSrc = obj.thumbnailPath ? `file://${obj.thumbnailPath}` : '';
          const _tHtml = _tSrc ? `<img class="cmo-thumb-img" src="${_tSrc}" onerror="this.style.display='none'" alt="">` : '';
          h += `<label class="cmo-sel-row${sel?' sel':''}">
            <input type="checkbox" class="ps-chk-obj" data-id="${esc(String(obj.id))}"${sel?' checked':''}>
            <span class="cmo-sel-thumb">${_tHtml}</span>
            <span class="cmo-sel-nombre">${esc(obj.nombre)}</span>
            <span class="cmo-cara-badge cmo-cara-${lbl}">${esc(lbl)}</span>
            <span class="cmo-sel-fecha">${esc(obj.fecha)}</span>
          </label>`;
        } else {
          const allIds  = g.caras.map(c => String(c.id));
          const allSel  = allIds.every(id => _selIds.has(id));
          const anySel  = allIds.some(id  => _selIds.has(id));
          h += `<div class="cmo-sel-group">
            <label class="cmo-sel-group-row">
              <input type="checkbox" class="ps-chk-par"
                data-ids="${esc(JSON.stringify(allIds))}"
                ${allSel?'checked':''} ${!allSel&&anySel?'data-indet="1"':''}>
              <span class="cmo-sel-group-name">${esc(g.nombre)}</span>
              <span class="cmo-sel-group-badge">${g.caras.length} caras</span>
            </label>`;
          for (const obj of g.caras) {
            const lbl = obj.cara !== 'Mono' ? obj.cara : 'Mono';
            const sel = _selIds.has(String(obj.id));
            const _tSrcC = obj.thumbnailPath ? `file://${obj.thumbnailPath}` : '';
            const _tHtmlC = _tSrcC ? `<img class="cmo-thumb-img cmo-thumb-sm" src="${_tSrcC}" onerror="this.style.display='none'" alt="">` : '';
            h += `<label class="cmo-sel-row cmo-sel-child${sel?' sel':''}">
              <input type="checkbox" class="ps-chk-obj" data-id="${esc(String(obj.id))}"${sel?' checked':''}>
              <span class="cmo-sel-thumb">${_tHtmlC}</span>
              <span class="cmo-sel-nombre cmo-sel-child-name">${esc(obj.nombre)}</span>
              <span class="cmo-cara-badge cmo-cara-${lbl}">${esc(lbl)}</span>
              <span class="cmo-sel-fecha">${esc(obj.fecha)}</span>
            </label>`;
          }
          h += `</div>`;
        }
      }
      if (!visible) h += `<div class="cmo-sel-empty">Sin resultados para «${esc(q)}»</div>`;
      h += `</div>`;
      requestAnimationFrame(() => {
        const el = $('psCuentaTotal');
        if (el) el.textContent = `${lista.length} objeto${lista.length!==1?'s':''}`;
      });
      return h;
    }

    function bindChk() {
      container.querySelectorAll('.ps-chk-obj').forEach(chk => {
        chk.addEventListener('change', () => {
          if (chk.checked) _selIds.add(chk.dataset.id);
          else _selIds.delete(chk.dataset.id);
          const grp = chk.closest('.cmo-sel-group');
          if (grp) {
            const par = grp.querySelector('.ps-chk-par');
            const all = [...grp.querySelectorAll('.ps-chk-obj')];
            const cnt = all.filter(c => c.checked).length;
            if (par) { par.checked = cnt===all.length; par.indeterminate = cnt>0 && cnt<all.length; }
          }
          chk.closest('label')?.classList.toggle('sel', chk.checked);
          actualizarContador();
        });
      });
      container.querySelectorAll('.ps-chk-par').forEach(chk => {
        chk.addEventListener('change', () => {
          const grp = chk.closest('.cmo-sel-group');
          grp.querySelectorAll('.ps-chk-obj').forEach(c => {
            c.checked = chk.checked;
            chk.checked ? _selIds.add(c.dataset.id) : _selIds.delete(c.dataset.id);
            c.closest('label')?.classList.toggle('sel', chk.checked);
          });
          chk.indeterminate = false;
          actualizarContador();
        });
      });
      const filtro = $('psFiltroObjetos');
      if (filtro) {
        filtro.addEventListener('input', () => {
          container.innerHTML = buildRows(filtro.value.trim().toLowerCase());
          bindChk();
        });
      }
    }

    container.innerHTML = buildRows('');
    bindChk();
  }

  function actualizarContador() {
    const el = $('psCuentaSeleccionados');
    if (el) el.textContent = `${_selIds.size} seleccionado${_selIds.size!==1?'s':''}`;
    const btn = $('psEjecutarBtn');
    if (btn) btn.disabled = _selIds.size < 2;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  CANVAS HELPERS
  // ──────────────────────────────────────────────────────────────────────────
  const CX = 280, CY = 280, CR = 240; // centro y radio del área de dibujo (canvas 560×560)

  /**
   * Escala puntos normalizados (rango ≈[-1,1]) al canvas.
   * @param {Array<{x,y}>} pts  — ya centrados y normalizados
   * @param {number} scale      — factor de escala visual (px por unidad)
   */
  function toCanvas(pts, scale) {
    return pts.map(p => ({ x: CX + p.x * scale, y: CY - p.y * scale }));
  }

  /**
   * Dibuja una polilínea cerrada en el canvas context.
   */
  function drawShape(ctx, pts, color, lineWidth, fill, fillAlpha) {
    if (!pts || pts.length < 2) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    if (fill) {
      ctx.globalAlpha = fillAlpha || 0.12;
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth || 1.5;
    ctx.stroke();
    ctx.restore();
  }

  /** Obtiene el factor de zoom visual aplicado por canvas-zoom.js */
  function getCanvasZoomScale(canvas) {
    const z = parseFloat(canvas?.dataset?.zoomScale || '1');
    return Number.isFinite(z) && z > 0 ? z : 1;
  }

  /** Compensa lineWidth para que al escalar por CSS se vea estable en pantalla */
  function zoomCompensatedLineWidth(baseWidth, zoomScale, min = 0.35, max = 6) {
    const z = Math.max(0.001, zoomScale || 1);
    return Math.max(min, Math.min(max, baseWidth / z));
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  PALETA DE COLORES (hasta 20 objetos)
  // ──────────────────────────────────────────────────────────────────────────
  const PALETA = [
    '#3182ce','#e53e3e','#38a169','#d69e2e','#805ad5',
    '#dd6b20','#2b6cb0','#c53030','#276749','#b7791f',
    '#6b46c1','#c05621','#2c7a7b','#9b2c2c','#553c9a',
    '#744210','#1a365d','#822727','#1c4532','#5f370e',
  ];

  // ──────────────────────────────────────────────────────────────────────────
  //  CLASIFICACIÓN DE SELECCIÓN (especular / comparación / mixto)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Analiza el array de objetos seleccionados y determina el tipo de análisis:
   *   'especular'   — todos forman pares A↔B del mismo nombre de objeto
   *   'comparacion' — todos son objetos distintos (o Mono sin par)
   *   'mixto'       — combinación de pares bifaciales + objetos independientes
   */
  function clasificarSeleccion(objs) {
    const grupos = {};
    for (const obj of objs) {
      // Normalizar clave: quitar sufijo "(Cara X)" / "[Cara X]" del nombre
      const key = obj.nombre.replace(/\s*[\[(]\s*cara\s+[ab]\s*[\])]\s*$/i, '').trim().toLowerCase();
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(obj);
    }
    const paresBifaciales = [];
    const objetosIndep    = [];
    for (const arr of Object.values(grupos)) {
      // Cara efectiva: usar campo cara si es A/B; sino derivar del nombre
      const caraEfectiva = o => {
        const c = (o.cara || '').toUpperCase();
        if (c === 'A' || c === 'B') return c;
        const m = /\(\s*cara\s+([ab])\s*\)/i.exec(o.nombre) || /\[\s*cara\s+([ab])\s*\]/i.exec(o.nombre);
        return m ? m[1].toUpperCase() : '';
      };
      const objA = arr.find(o => caraEfectiva(o) === 'A');
      const objB = arr.find(o => caraEfectiva(o) === 'B');
      if (objA && objB) {
        paresBifaciales.push({ nombre: arr[0].nombre, objA, objB });
        // Caras distintas de A/B (e.g. Mono) del mismo nombre → independientes
        arr.filter(o => { const c=(o.cara||'').toUpperCase(); return c!=='A'&&c!=='B'; })
           .forEach(o => objetosIndep.push(o));
      } else {
        arr.forEach(o => objetosIndep.push(o));
      }
    }
    let modo, etiqueta, descripcion, iconoModo;
    if (paresBifaciales.length > 0 && objetosIndep.length === 0) {
      modo = 'especular'; iconoModo = '\uD83D\uDD00';
      etiqueta    = 'An\u00e1lisis de Simetr\u00eda Bilateral';
      descripcion = 'Se detectaron <strong>' + paresBifaciales.length + ' par' + (paresBifaciales.length>1?'es bifaciales':' bifacial') + '</strong>. Cada par (Anverso&nbsp;\u2194&nbsp;Reverso) corresponde al mismo objeto; \u03c1 mide la <em>asimetr\u00eda bilateral</em> de su forma.';
    } else if (paresBifaciales.length === 0) {
      modo = 'comparacion'; iconoModo = '\uD83D\uDCD0';
      etiqueta    = 'Comparaci\u00f3n Morfol\u00f3gica entre Objetos';
      descripcion = 'Se comparan <strong>' + objs.length + ' objetos independientes</strong>. La distancia&nbsp;\u03c1 cuantifica la <em>disimilitud de forma</em> entre objetos distintos.';
    } else {
      modo = 'mixto'; iconoModo = '\uD83D\uDD01';
      etiqueta    = 'An\u00e1lisis Mixto';
      descripcion = 'Se detectaron <strong>' + paresBifaciales.length + ' par' + (paresBifaciales.length>1?'es bifaciales':' bifacial') + '</strong> y <strong>' + objetosIndep.length + ' objeto' + (objetosIndep.length>1?'s independientes':' independiente') + '</strong>. Los pares miden simetr\u00eda bilateral; el resto, similitud morfol\u00f3gica.';
    }
    // Construir bifacialSet (\u00edndices en el array objs recibido)
    const bifacialSet = new Set();
    for (const bf of paresBifaciales) {
      const iA = objs.indexOf(bf.objA), iB = objs.indexOf(bf.objB);
      if (iA >= 0 && iB >= 0) { bifacialSet.add(iA+'_'+iB); bifacialSet.add(iB+'_'+iA); }
    }
    return { paresBifaciales, objetosIndep, modo, etiqueta, descripcion, iconoModo, bifacialSet };
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  TAB: PS PARCIAL
  // ──────────────────────────────────────────────────────────────────────────

  async function ejecutarParcial(selObj) {
    const cont = $('psParcialContenido');
    if (!cont) return;

    if (selObj.length < 2) {
      cont.innerHTML = `<p class="ps-aviso">Selecciona al menos 2 objetos para el análisis parcial.</p>`;
      return;
    }

    // Verificar que todos tienen contorno
    const conPuntos = selObj.filter(o => getPuntos(o) !== null);
    if (conPuntos.length < 2) {
      const sinDatos = selObj.filter(o => getPuntos(o) === null);
      let detalles = sinDatos.map(o => {
        const tieneGeo = !!o.geometria;
        const tieneCR = !!o.geometria?.contornoReal;
        const tienePts = !!o.geometria?.contornoReal?.puntos;
        const cantPts = o.geometria?.contornoReal?.puntos?.length || 0;
        const tieneHull = !!o.geometria?.convexHull?.puntos || !!o.metricas?.convex_hull_points;
        return `[${o.nombre}: geometria=${tieneGeo}, contornoReal=${tieneCR}, puntos=${tienePts}(${cantPts}), hull=${tieneHull}]`;
      }).join(' ');
      cont.innerHTML = `<p class="ps-aviso ps-aviso-error">
        ❌ Menos de 2 objetos tienen datos de contorno accesibles.<br>
        Verifica que cada análisis se haya guardado correctamente con contornos.<br>
        <strong>Debug:</strong> ${detalles}
      </p>`;
      return;
    }
    if (conPuntos.length < selObj.length) {
      const sinDatos = selObj.filter(o => getPuntos(o) === null).map(o => esc(o.nombre)).join(', ');
      cont.innerHTML = `<div class="ps-aviso ps-aviso-warn">⚠️ Los siguientes objetos no tienen datos de contorno y se omitirán: ${sinDatos}</div>`;
    }

    const n = conPuntos.length;

    // ─── Hidratar EFA por objeto (asíncrono, no bloquea APS) ─────────────────
    // COHERENCIA GEOMÉTRICA: MAO PLUS no tiene sistema de pre-alineamiento
    // guardado, por lo tanto psParcial usa getPuntos(obj) directamente, y EFA
    // también usa getPuntos(obj). Ambos parten de la misma geometría bruta →
    // la coherencia está garantizada. El cache _efa_data es siempre válido aquí.
    // Si en el futuro se incorpora pre-alineamiento, este bloque debe usar la
    // misma función que entregue los puntos transformados a psParcial.
    const _efaMap = new Map(); // idx → {coefficients, power_spectrum, ...} | null
    const _efaPromesas = conPuntos.map(async (obj, idx) => {
      try {
        // Cache válido: no hay pre-alineamiento en MAO PLUS que pueda invalidarlo
        const efa = obj.metricas?._efa_data || obj._efa_data;
        if (efa && efa.coefficients) {
          _efaMap.set(idx, efa);
          return;
        }
        // getPuntos(obj) → misma fuente que psParcial en MAO PLUS
        const pts = getPuntos(obj);
        if (!pts || pts.length < 8) { _efaMap.set(idx, null); return; }
        if (window.PythonBridge?.efa?.calculate) {
          const res = await window.PythonBridge.efa.calculate(pts, { nHarmonics: 20, normalize: true });
          _efaMap.set(idx, res?.coefficients ? res : null);
        } else {
          _efaMap.set(idx, null);
        }
      } catch (_) { _efaMap.set(idx, null); }
    });
    // Esperar hidratación antes de calcular distancias (máx 4s por seguridad)
    await Promise.race([
      Promise.all(_efaPromesas),
      new Promise(r => setTimeout(r, 4000))
    ]);
    const efaDisponible = [..._efaMap.values()].some(v => v !== null);

    // ─── Clasificar selección PRIMERO (antes de calcular distancias) ─────────
    const clsf = clasificarSeleccion(conPuntos);
    const { paresBifaciales, modo, etiqueta, descripcion, iconoModo } = clsf;
    
    // Crear set de pares bifaciales para rápida búsqueda
    const bifacialSet = new Set();
    for (const bf of paresBifaciales) {
      bf.i = conPuntos.indexOf(bf.objA);
      bf.j = conPuntos.indexOf(bf.objB);
      if (bf.i >= 0 && bf.j >= 0) {
        bifacialSet.add(bf.i+'_'+bf.j);
        bifacialSet.add(bf.j+'_'+bf.i);
      }
    }

    // ─── Calcular matrices pairwise ─────────────────────────────────────────
    // dist[i][j] y csA[i][j]
    const distMat = Array.from({length:n}, () => new Array(n).fill(0));
    const resultados = [];  // [{i, j, dist, csA, csB}]
    _usedReflectionMat = Array.from({length:n}, () => new Array(n).fill(false)); // Track reflexión
    _alignedMat        = Array.from({length:n}, () => new Array(n).fill(null));  // Puntos ya alineados

    for (let i = 0; i < n; i++) {
      for (let j = i+1; j < n; j++) {
        const pA = getPuntos(conPuntos[i]);
        const pB = getPuntos(conPuntos[j]);
        
        // Si es un par bifacial, usar la versión que permite reflexión
        const esPar = bifacialSet.has(i+'_'+j);
        const r = esPar 
          ? psParcialBifacial(pA, pB, N_PUNTOS) 
          : psParcial(pA, pB, N_PUNTOS);
        
        distMat[i][j] = r.dist;
        distMat[j][i] = r.dist;
        if (r.usedReflection) {
          _usedReflectionMat[i][j] = true;
          _usedReflectionMat[j][i] = true;
        }
        // Guardar puntos ya alineados en espacio Procrustes para canvas fiel al cálculo
        if (esPar && r.aligned_A && r.aligned_A.length >= 3 && r.norm_B && r.norm_B.length >= 3) {
          _alignedMat[i][j] = { aligned_A: r.aligned_A, norm_B: r.norm_B };
        }
        // MEJORA 2: Incluir validación en resultados
        resultados.push({ i, j, dist: r.dist, csA: r.csA, csB: r.csB, validation: r.validation });
      }
    }

    // Enriquecer paresBifaciales con distancias
    for (const bf of paresBifaciales) {
      bf.dist = (bf.i >= 0 && bf.j >= 0) ? distMat[bf.i][bf.j] : 0;
    }
    // ISB (Índice de Simetría Bilateral): mapeo lineal ρ → [0, 100%]
    const isb = rho => Math.max(0, (1 - rho / (Math.PI / 2)) * 100);

    // ─── Par de referencia para el canvas ────────────────────────────────────
    // Para modo especular: mostrar el primer par bifacial en el canvas
    const par0 = (modo === 'especular' && paresBifaciales.length > 0 &&
                  paresBifaciales[0].i >= 0 && paresBifaciales[0].j >= 0)
      ? { i: paresBifaciales[0].i, j: paresBifaciales[0].j }
      : resultados[0];

    // ─── Render HTML ────────────────────────────────────────────────────────
    resultados.sort((a,b) => a.dist - b.dist);
    const _validProbs = resultados.filter(r => r.validation && r.validation.score < 75);

    const methodHtmlParcial = `
      <details class="ps-method-details" open>
        <summary>&#9671; PS Parcial — Método (ver detalles)</summary>
        <div class="ps-desc-panel">
          <div class="ps-desc-title">&#9671; PS Parcial — Método</div>
          <ol class="ps-desc-steps">
            <li><strong>Winding</strong>: normalización del sentido de recorrido del contorno (CW en pantalla), corrigiendo la inversión especular entre caras A&#8596;B.</li>
            <li><strong>Remuestreo por arco</strong>: cada contorno se convierte en <strong>${N_PUNTOS} semi-landmarks</strong> equidistantes en longitud de arco.</li>
            <li><strong>Centrado + escala</strong>: traslación al centroide y normalización por CS<sub>k</sub> = &radic;(&Sigma;&#8214;x<sub>i</sub>&#8214;&sup2;).</li>
            <li><strong>Rotación óptima</strong>: SVD 2&times;2 de A<sup>T</sup>B &rarr; R* = VU<sup>T</sup>. ${modo==='especular'?'Para pares bifaciales, se prueba <strong>con y sin reflexión</strong> — permite espejo A↔B':'(con corrección de reflexión si es necesario.)'}</li>
            <li><strong>Distancia &rho;</strong>: &rho; = arccos(&Sigma;&sigma;<sub>k</sub>) &isin; [0,&nbsp;&pi;/2]. ${modo==='especular'?'Mide <em>asimetría bilateral</em> — bajo = alta simetría.':'Mide <em>disimilitud morfológica</em> — bajo = formas similares.'}</li>
            ${modo!=='comparacion'?'<li><strong>ISB</strong>: Índice de Simetría Bilateral = (1 − ρ/(π/2)) × 100%. 100% = simetría perfecta.</li>':''}
          </ol>
          <div class="ps-desc-note">&#9432; El tamaño (CS<sub>k</sub>) se excluye del análisis — solo se compara la <em>forma pura</em>. ${modo==='especular'?'🪞 Las caras bifaciales son imágenes especulares, por eso el análisis permite reflexión para obtener alineamiento óptimo.':''}</div>
        </div>
      </details>`;

    let summaryHtmlParcial = '';
    if (modo === 'especular' && paresBifaciales.length > 0) {
      const bfV = paresBifaciales.filter(bf => bf.i>=0 && bf.j>=0);
      const isbMed = bfV.length ? bfV.reduce((s,bf)=>s+isb(bf.dist),0)/bfV.length : 0;
      const bfMax = bfV.length ? bfV.reduce((a,b)=>isb(a.dist)>isb(b.dist)?a:b, bfV[0]) : null;
      const bfMin = bfV.length ? bfV.reduce((a,b)=>isb(a.dist)<isb(b.dist)?a:b, bfV[0]) : null;
      summaryHtmlParcial = (
        '<div class="ps-chip ps-chip-green">'+
        '<span class="ps-chip-label">&#8596; Más simétrico</span>'+
        '<span class="ps-chip-val">'+(bfMax?esc(bfMax.nombre):'—')+'</span>'+
        '<span class="ps-chip-sub">ISB = '+(bfMax?isb(bfMax.dist).toFixed(1):'0')+'% &nbsp;|&nbsp; &rho; = '+(bfMax?bfMax.dist.toFixed(4):'0')+' rad</span>'+
        '</div>'+
        '<div class="ps-chip ps-chip-red">'+
        '<span class="ps-chip-label">&#8596; Menos simétrico</span>'+
        '<span class="ps-chip-val">'+(bfMin?esc(bfMin.nombre):'—')+'</span>'+
        '<span class="ps-chip-sub">ISB = '+(bfMin?isb(bfMin.dist).toFixed(1):'0')+'% &nbsp;|&nbsp; &rho; = '+(bfMin?bfMin.dist.toFixed(4):'0')+' rad</span>'+
        '</div>'+
        '<div class="ps-chip ps-chip-gray">'+
        '<span class="ps-chip-label">ISB medio del conjunto</span>'+
        '<span class="ps-chip-val">'+isbMed.toFixed(1)+'%</span>'+
        '<span class="ps-chip-sub">'+bfV.length+' par'+(bfV.length!==1?'es bifaciales':' bifacial')+' analizados</span>'+
        '</div>'
      );
    } else {
      const media = resultados.reduce((s,r)=>s+r.dist,0)/resultados.length;
      summaryHtmlParcial = (
        '<div class="ps-chip ps-chip-green">'+
        '<span class="ps-chip-label">Par más similar</span>'+
        '<span class="ps-chip-val">'+esc(conPuntos[resultados[0].i].nombre)+' &#8596; '+esc(conPuntos[resultados[0].j].nombre)+'</span>'+
        '<span class="ps-chip-sub">&rho; = '+resultados[0].dist.toFixed(4)+' rad</span>'+
        '</div>'+
        '<div class="ps-chip ps-chip-red">'+
        '<span class="ps-chip-label">Par más diferente</span>'+
        '<span class="ps-chip-val">'+esc(conPuntos[resultados[resultados.length-1].i].nombre)+' &#8596; '+esc(conPuntos[resultados[resultados.length-1].j].nombre)+'</span>'+
        '<span class="ps-chip-sub">&rho; = '+resultados[resultados.length-1].dist.toFixed(4)+' rad</span>'+
        '</div>'+
        '<div class="ps-chip ps-chip-gray">'+
        '<span class="ps-chip-label">&rho; media (todos los pares)</span>'+
        '<span class="ps-chip-val">'+media.toFixed(4)+' rad</span>'+
        '<span class="ps-chip-sub">'+resultados.length+' pares comparados</span>'+
        '</div>'
      );
    }

    const rankingHtmlParcial = paresBifaciales.filter(bf=>bf.i>=0&&bf.j>=0).length ? (
      '<div class="ps-matrix-title" style="margin-top:14px;">'+(modo==='especular'?'🔀 Simetría bilateral — Anverso ↔ Reverso':'&#9670; Pares bifaciales en la selección')+'</div>'+
      '<table class="ps-ranking-table" style="margin-bottom:12px;">'+
      '<thead><tr><th>Objeto</th><th style="text-align:center">A</th><th style="text-align:center">B</th><th>&rho; (rad)</th><th>ISB (%)</th><th>Interpretación</th></tr></thead>'+
      '<tbody>'+
      paresBifaciales.filter(bf=>bf.i>=0&&bf.j>=0).map(bf => {
        const isbVal = isb(bf.dist);
        const nivel = isbVal>=94 ? '&#128994; Alta simetría bilateral'
                    : isbVal>=84 ? '&#128993; Simetría moderada'
                    : isbVal>=65 ? '&#128992; Asimetría notable'
                    :              '&#128308; Asimetría significativa';
        const isbColor = isbVal>=84?'#276749':isbVal>=65?'#744210':'#9b2c2c';
        const refIndicador = (_usedReflectionMat && bf.i >= 0 && bf.j >= 0 && _usedReflectionMat[bf.i][bf.j])
          ? ' <span style="color:#d69e2e;font-weight:700;">(🪞)</span>'
          : '';
        return '<tr style="background:#fffbeb;">'+
          '<td style="font-weight:600">'+esc(bf.nombre)+refIndicador+'</td>'+
          '<td style="text-align:center"><span class="cmo-cara-badge cmo-cara-A">A</span></td>'+
          '<td style="text-align:center"><span class="cmo-cara-badge cmo-cara-B">B</span></td>'+
          '<td class="ps-rank-dist">'+bf.dist.toFixed(4)+'</td>'+
          '<td class="ps-rank-dist" style="font-weight:700;color:'+isbColor+'">'+isbVal.toFixed(1)+'%</td>'+
          '<td style="font-size:11px">'+nivel+'</td>'+
          '</tr>';
      }).join('')+
      '</tbody></table>'+
      '<div class="ps-desc-note" style="margin-bottom:10px;">&#9432; <strong>ISB</strong> = (1&nbsp;&minus;&nbsp;&rho;/(&pi;/2))&nbsp;&times;&nbsp;100%. 100% = simetría perfecta. La normalización de <em>winding</em> y la corrección de reflexión SVD compensan el espejo A&nbsp;&#8596;&nbsp;B.</div>'
    ) : '';

    const matrixHtmlParcial = `
      <div class="ps-matrix-title">Matriz de distancias Procrustes (&rho;)${modo!=='comparacion'?' — celdas bifaciales incluyen ISB':''}</div>
      <div class="ps-table-scroll">
        <table class="ps-dist-table">
          <thead><tr>
            <th class="ps-th-corner"></th>
            ${conPuntos.map((o,i) => `<th><span class="ps-obj-dot" style="background:${PALETA[i%PALETA.length]}"></span>${esc(o.nombre)}${o.cara&&o.cara!=='Mono'?` <span class="cmo-cara-badge cmo-cara-${o.cara}">${esc(o.cara)}</span>`:''}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${conPuntos.map((rowObj,i) => `<tr>
              <td class="ps-th-row"><span class="ps-obj-dot" style="background:${PALETA[i%PALETA.length]}"></span>${esc(rowObj.nombre)}${rowObj.cara&&rowObj.cara!=='Mono'?` <span class="cmo-cara-badge cmo-cara-${rowObj.cara}">${esc(rowObj.cara)}</span>`:''}</td>
              ${conPuntos.map((_, j) => {
                if (i === j) return `<td class="ps-cell-diag">—</td>`;
                const v = distMat[i][j];
                const vmax = Math.max(...resultados.map(r=>r.dist));
                const vmin = Math.min(...resultados.map(r=>r.dist));
                const t = vmax > vmin ? (v - vmin)/(vmax - vmin) : 0;
                const r = Math.round(t * 200);
                const g = Math.round((1-t) * 180);
                const esBifacial = bifacialSet.has(i+'_'+j);
                const extraStyle = esBifacial ? 'outline:2px solid #d69e2e;outline-offset:-2px;font-weight:700;' : '';
                const isbLabel = (esBifacial && modo !== 'comparacion') ? ' ('+isb(v).toFixed(0)+'%)' : '';
                const titulo = esBifacial ? 'ISB='+isb(v).toFixed(1)+'% · '+esc(rowObj.nombre)+' ↔ '+esc(conPuntos[j].nombre) : esc(rowObj.nombre)+' ↔ '+esc(conPuntos[j].nombre);
                return '<td class="ps-cell-val ps-cell-clickable'+(esBifacial?' ps-cell-bifacial':'')+'" data-pi="'+i+'" data-pj="'+j+'" style="background:rgba('+r+','+g+',80,0.25);'+extraStyle+'cursor:pointer;" title="👁 Clic para visualizar · '+titulo+'">'+v.toFixed(4)+isbLabel+(esBifacial?' ✶':'')+'</td>';
              }).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    const inferenciasHtmlParcial = _validProbs.length > 0 ? `
      <div style="margin-top:10px;padding:12px 16px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;">
        <div style="font-weight:700;font-size:12px;color:#2d3748;margin-bottom:8px;">⚡ Inferencias — Pares con baja calidad de alineamiento</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="background:#f7fafc;">
              <th style="padding:5px 8px;text-align:left;border-bottom:1px solid #e2e8f0;font-weight:600;">Par</th>
              <th style="padding:5px 8px;text-align:center;border-bottom:1px solid #e2e8f0;font-weight:600;">Score</th>
              <th style="padding:5px 8px;text-align:left;border-bottom:1px solid #e2e8f0;font-weight:600;">Interpretación</th>
              <th style="padding:5px 8px;text-align:left;border-bottom:1px solid #e2e8f0;font-weight:600;">Advertencias</th>
            </tr>
          </thead>
          <tbody>
            ${_validProbs.map(r => {
              const sc = r.validation.score;
              const clr = sc >= 60 ? '#744210' : '#9b2c2c';
              const bg  = sc >= 60 ? '#fefcbf' : '#fed7d7';
              return `<tr style="border-bottom:1px solid #f0f0f0;">
                <td style="padding:5px 8px;">${esc(conPuntos[r.i].nombre)} ↔ ${esc(conPuntos[r.j].nombre)}</td>
                <td style="padding:5px 8px;text-align:center;"><span style="background:${bg};color:${clr};padding:2px 6px;border-radius:3px;font-weight:700;">${sc.toFixed(0)}</span></td>
                <td style="padding:5px 8px;color:#4a5568;">${esc(r.validation.interpretacion)}</td>
                <td style="padding:5px 8px;color:#718096;font-size:10px;">${(r.validation.flags||[]).join('; ') || '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`
      : '<div class="ps-desc-note" style="margin-top:10px;">✅ Inferencias: no se detectaron pares con calidad de alineamiento crítica.</div>';

    let html = `
      <!-- Banner de modo de análisis -->
      <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;margin-bottom:14px;
        border-radius:7px;border-left:4px solid ${modo==='especular'?'#3182ce':modo==='comparacion'?'#38a169':'#d69e2e'};
        background:${modo==='especular'?'#ebf4ff':modo==='comparacion'?'#f0fff4':'#fffaf0'};">
        <span style="font-size:20px;line-height:1;flex-shrink:0;">${iconoModo}</span>
        <div>
          <div style="font-weight:700;font-size:13px;margin-bottom:3px;">${esc(etiqueta)}</div>
          <div style="font-size:11px;color:#4a5568;line-height:1.4;">${descripcion}</div>
        </div>
      </div>

      <!-- Panel de descripción del método -->
      <details class="ps-method-details">
        <summary>&#9671; PS Parcial — Método (ver detalles)</summary>
        <div class="ps-desc-panel">
        <div class="ps-desc-title">&#9671; PS Parcial — Método</div>
        <ol class="ps-desc-steps">
          <li><strong>Winding</strong>: normalización del sentido de recorrido del contorno (CW en pantalla), corrigiendo la inversión especular entre caras A&#8596;B.</li>
          <li><strong>Remuestreo por arco</strong>: cada contorno se convierte en <strong>${N_PUNTOS} semi-landmarks</strong> equidistantes en longitud de arco.</li>
          <li><strong>Centrado + escala</strong>: traslación al centroide y normalización por CS<sub>k</sub> = &radic;(&Sigma;&#8214;x<sub>i</sub>&#8214;&sup2;).</li>
          <li><strong>Rotación óptima</strong>: SVD 2&times;2 de A<sup>T</sup>B &rarr; R* = VU<sup>T</sup>. ${modo==='especular'?'Para pares bifaciales, se prueba <strong>con y sin reflexión</strong> — permite espejo A↔B':'(con corrección de reflexión si es necesario.)'}</li>
          <li><strong>Distancia &rho;</strong>: &rho; = arccos(&Sigma;&sigma;<sub>k</sub>) &isin; [0,&nbsp;&pi;/2]. ${modo==='especular'?'Mide <em>asimetr\u00eda bilateral</em> — bajo = alta simetr\u00eda.':'Mide <em>disimilitud morfol\u00f3gica</em> — bajo = formas similares.'}</li>
          ${modo!=='comparacion'?'<li><strong>ISB</strong>: \u00cdndice de Simetr\u00eda Bilateral = (1 \u2212 \u03c1/(&pi;/2)) \u00d7 100%. 100%&nbsp;=&nbsp;simetr\u00eda perfecta.</li>':''}
        </ol>
        <div class="ps-desc-note">&#9432; El tama\u00f1o (CS<sub>k</sub>) se excluye del an\u00e1lisis \u2014 solo se compara la <em>forma pura</em>. ${modo==='especular'?'🪞 Las caras bifaciales son imágenes especulares, por eso el análisis permite reflexión para obtener alineamiento óptimo.':''}</div>
      </div><!-- /.ps-desc-panel -->
      </details>

      <div class="ps-layout-2col">
        <!-- Canvas de alineación del primer par -->
        <div class="ps-canvas-wrap">
          <div class="ps-canvas-title" style="display:flex;align-items:center;gap:8px;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span id="psParcialCanvasTitle">${modo==='especular' && conPuntos.length <= 2 ? 'Superposici\u00f3n bifacial: <em>' + esc(conPuntos[par0.i]?.nombre||'') + '</em> &middot; A &#8596; B' : modo==='especular' ? 'Superposici\u00f3n bilateral \u2014 todos los objetos' : 'Vista de alineaci\u00f3n: <em>' + esc(conPuntos[par0.i]?.nombre||'') + '</em> &rarr; <em>' + esc(conPuntos[par0.j]?.nombre||'') + '</em>'}</span>
              ${(_usedReflectionMat && par0.i >= 0 && par0.j >= 0 && _usedReflectionMat[par0.i][par0.j]) ? '<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:3px;font-size:11px;border:1px solid #f59e0b;">🪞 Reflexión detectada</span>' : ''}
            </div>
            ${modo!=='comparacion' ? '<button id="psToggleReflectionBtn" class="ps-toggle-btn" style="background:#f0f7ff;color:#1e40af;border:1px solid #93c5fd;padding:4px 10px;border-radius:4px;font-size:11px;cursor:pointer;font-weight:500;transition:all 0.2s;">🪞 Aplicar reflexión bilateral</button>' : ''}
          </div>
          <!-- ── Panel de alineación manual (al estilo CGeo) ───────────────────── -->
          <div id="psAlignPanel" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:5px 0 3px;padding:6px 10px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;font-size:11px;">
            <span style="color:#92400e;font-weight:600;white-space:nowrap;">↻ Alinear:</span>
            <select id="psAlignObjSel" style="font-size:11px;padding:2px 4px;border:1px solid #fcd34d;border-radius:4px;background:#fff;max-width:160px;">
              <option value="__all__">— todos —</option>
              ${conPuntos.map((p, i) => `<option value="${i}">${esc(p.nombre)}${p.cara && p.cara !== 'Mono' ? ' (' + p.cara + ')' : ''}</option>`).join('')}
            </select>
            <input id="psAlignAngle" type="number" value="0" min="-360" max="360" step="1"
              style="width:58px;font-size:11px;padding:2px 4px;border:1px solid #fcd34d;border-radius:4px;text-align:right;">
            <span style="color:#78350f;">°</span>
            <button id="psAlignApply" style="font-size:10px;padding:2px 8px;background:#f59e0b;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600;">Aplicar</button>
            <button id="psAlignReset" style="font-size:10px;padding:2px 8px;background:#e5e7eb;color:#374151;border:none;border-radius:4px;cursor:pointer;">Reset</button>
            <span style="color:#fcd34d;">│</span>
            <button id="psAlignFlip" style="font-size:10px;padding:2px 8px;background:#7c3aed;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600;" title="Reflejo horizontal visual (no afecta al cálculo de ρ)">⟺ Reflejar</button>
            <span id="psAlignStatus" style="color:#92400e;font-style:italic;font-size:10px;margin-left:2px;"></span>
          </div>
          <div class="ps-canvas-viewport">
            <canvas id="psParcialCanvas" width="560" height="560"></canvas>
          </div>
          <div class="ps-canvas-legend" id="psParcialLeyenda"></div>
        </div>

        <!-- Resumen chip cards -->
        <div class="ps-stats-col">
          ${(() => {
            resultados.sort((a,b) => a.dist - b.dist);
            if (modo === 'especular' && paresBifaciales.length > 0) {
              const bfV = paresBifaciales.filter(bf => bf.i>=0 && bf.j>=0);
              const isbMed = bfV.length ? bfV.reduce((s,bf)=>s+isb(bf.dist),0)/bfV.length : 0;
              const bfMax = bfV.length ? bfV.reduce((a,b)=>isb(a.dist)>isb(b.dist)?a:b, bfV[0]) : null;
              const bfMin = bfV.length ? bfV.reduce((a,b)=>isb(a.dist)<isb(b.dist)?a:b, bfV[0]) : null;
              return (
              '<div class="ps-chip ps-chip-green">'+
              '<span class="ps-chip-label">&#8596; M\u00e1s sim\u00e9trico</span>'+
              '<span class="ps-chip-val">'+(bfMax?esc(bfMax.nombre):'\u2014')+'</span>'+
              '<span class="ps-chip-sub">ISB = '+(bfMax?isb(bfMax.dist).toFixed(1):'0')+'% &nbsp;|&nbsp; &rho; = '+(bfMax?bfMax.dist.toFixed(4):'0')+' rad</span>'+
              '</div>'+
              '<div class="ps-chip ps-chip-red">'+
              '<span class="ps-chip-label">&#8596; Menos sim\u00e9trico</span>'+
              '<span class="ps-chip-val">'+(bfMin?esc(bfMin.nombre):'\u2014')+'</span>'+
              '<span class="ps-chip-sub">ISB = '+(bfMin?isb(bfMin.dist).toFixed(1):'0')+'% &nbsp;|&nbsp; &rho; = '+(bfMin?bfMin.dist.toFixed(4):'0')+' rad</span>'+
              '</div>'+
              '<div class="ps-chip ps-chip-gray">'+
              '<span class="ps-chip-label">ISB medio del conjunto</span>'+
              '<span class="ps-chip-val">'+isbMed.toFixed(1)+'%</span>'+
              '<span class="ps-chip-sub">'+bfV.length+' par'+(bfV.length!==1?'es bifaciales':' bifacial')+' analizados</span>'+
              '</div>'
              );
            } else {
              const media = resultados.reduce((s,r)=>s+r.dist,0)/resultados.length;
              return (
              '<div class="ps-chip ps-chip-green">'+
              '<span class="ps-chip-label">Par m\u00e1s similar</span>'+
              '<span class="ps-chip-val">'+esc(conPuntos[resultados[0].i].nombre)+' &#8596; '+esc(conPuntos[resultados[0].j].nombre)+'</span>'+
              '<span class="ps-chip-sub">&rho; = '+resultados[0].dist.toFixed(4)+' rad</span>'+
              '</div>'+
              '<div class="ps-chip ps-chip-red">'+
              '<span class="ps-chip-label">Par m\u00e1s diferente</span>'+
              '<span class="ps-chip-val">'+esc(conPuntos[resultados[resultados.length-1].i].nombre)+' &#8596; '+esc(conPuntos[resultados[resultados.length-1].j].nombre)+'</span>'+
              '<span class="ps-chip-sub">&rho; = '+resultados[resultados.length-1].dist.toFixed(4)+' rad</span>'+
              '</div>'+
              '<div class="ps-chip ps-chip-gray">'+
              '<span class="ps-chip-label">&rho; media (todos los pares)</span>'+
              '<span class="ps-chip-val">'+media.toFixed(4)+' rad</span>'+
              '<span class="ps-chip-sub">'+resultados.length+' pares comparados</span>'+
              '</div>'
              );
            }
          })()}
        </div>
      </div>

      ${ paresBifaciales.filter(bf=>bf.i>=0&&bf.j>=0).length ? (
      '<div class="ps-matrix-title" style="margin-top:20px;">'+(modo==='especular'?'\uD83D\uDD00 Simetr\u00eda bilateral \u2014 Anverso \u2194 Reverso':'&#9670; Pares bifaciales en la selecci\u00f3n')+'</div>'+
      '<table class="ps-ranking-table" style="margin-bottom:12px;">'+
      '<thead><tr><th>Objeto</th><th style="text-align:center">A</th><th style="text-align:center">B</th><th>&rho; (rad)</th><th>ISB (%)</th><th>Interpretaci\u00f3n</th></tr></thead>'+
      '<tbody>'+
      paresBifaciales.filter(bf=>bf.i>=0&&bf.j>=0).map(bf => {
        const isbVal = isb(bf.dist);
        const nivel = isbVal>=94 ? '&#128994; Alta simetr\u00eda bilateral'
                    : isbVal>=84 ? '&#128993; Simetr\u00eda moderada'
                    : isbVal>=65 ? '&#128992; Asimetr\u00eda notable'
                    :              '&#128308; Asimetr\u00eda significativa';
        const isbColor = isbVal>=84?'#276749':isbVal>=65?'#744210':'#9b2c2c';
        const refIndicador = (_usedReflectionMat && bf.i >= 0 && bf.j >= 0 && _usedReflectionMat[bf.i][bf.j]) 
          ? ' <span style="color:#d69e2e;font-weight:700;">(🪞)</span>' 
          : '';
        return '<tr style="background:#fffbeb;">'+
          '<td style="font-weight:600">'+esc(bf.nombre)+refIndicador+'</td>'+
          '<td style="text-align:center"><span class="cmo-cara-badge cmo-cara-A">A</span></td>'+
          '<td style="text-align:center"><span class="cmo-cara-badge cmo-cara-B">B</span></td>'+
          '<td class="ps-rank-dist">'+bf.dist.toFixed(4)+'</td>'+
          '<td class="ps-rank-dist" style="font-weight:700;color:'+isbColor+'">'+isbVal.toFixed(1)+'%</td>'+
          '<td style="font-size:11px">'+nivel+'</td>'+
          '</tr>';
      }).join('')+
      '</tbody></table>'+
      '<div class="ps-desc-note" style="margin-bottom:16px;">&#9432; <strong>ISB</strong> = (1&nbsp;&minus;&nbsp;&rho;/(&pi;/2))&nbsp;&times;&nbsp;100%. 100% = simetr\u00eda perfecta. La normalizaci\u00f3n de <em>winding</em> y la correcci\u00f3n de reflexi\u00f3n SVD compensan el espejo A&nbsp;&#8596;&nbsp;B.</div>'
      ) : '' }

      <!-- Matriz de distancias -->
      <div class="ps-matrix-title">Matriz de distancias Procrustes (&rho;)${modo!=='comparacion'?' \u2014 celdas bifaciales incluyen ISB':''}</div>
      <div class="ps-table-scroll">
        <table class="ps-dist-table">
          <thead><tr>
            <th class="ps-th-corner"></th>
            ${conPuntos.map((o,i) => `<th><span class="ps-obj-dot" style="background:${PALETA[i%PALETA.length]}"></span>${esc(o.nombre)}${o.cara&&o.cara!=='Mono'?` <span class="cmo-cara-badge cmo-cara-${o.cara}">${esc(o.cara)}</span>`:''}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${conPuntos.map((rowObj,i) => `<tr>
              <td class="ps-th-row"><span class="ps-obj-dot" style="background:${PALETA[i%PALETA.length]}"></span>${esc(rowObj.nombre)}${rowObj.cara&&rowObj.cara!=='Mono'?` <span class="cmo-cara-badge cmo-cara-${rowObj.cara}">${esc(rowObj.cara)}</span>`:''}</td>
              ${conPuntos.map((_, j) => {
                if (i === j) return `<td class="ps-cell-diag">—</td>`;
                const v = distMat[i][j];
                const vmax = Math.max(...resultados.map(r=>r.dist));
                const vmin = Math.min(...resultados.map(r=>r.dist));
                const t = vmax > vmin ? (v - vmin)/(vmax - vmin) : 0;
                const r = Math.round(t * 200);
                const g = Math.round((1-t) * 180);
                const esBifacial = bifacialSet.has(i+'_'+j);
                const extraStyle = esBifacial ? 'outline:2px solid #d69e2e;outline-offset:-2px;font-weight:700;' : '';
                const isbLabel = (esBifacial && modo !== 'comparacion') ? ' ('+isb(v).toFixed(0)+'%)' : '';
                const titulo = esBifacial ? 'ISB='+isb(v).toFixed(1)+'% \u00b7 '+esc(rowObj.nombre)+' \u2194 '+esc(conPuntos[j].nombre) : esc(rowObj.nombre)+' \u2194 '+esc(conPuntos[j].nombre);
                return '<td class="ps-cell-val ps-cell-clickable'+(esBifacial?' ps-cell-bifacial':'')+'" data-pi="'+i+'" data-pj="'+j+'" style="background:rgba('+r+','+g+',80,0.25);'+extraStyle+'cursor:pointer;" title="\ud83d\udc41 Clic para visualizar \u00b7 '+titulo+'">'+v.toFixed(4)+isbLabel+(esBifacial?' \u2736':'')+'</td>';
              }).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;

    // DEBUGGING: verificar antes de asignar
    // Limpiar canvas zoom anterior antes de reemplazar DOM
    if (window.detachCanvasZoom) {
      cont.querySelectorAll('canvas[data-zoom-attached], canvas._zoomAttached').forEach(c => window.detachCanvasZoom(c));
      cont.querySelectorAll('canvas').forEach(c => window.detachCanvasZoom(c));
    }

    console.log('🔍 [ejecutarParcial] cont element existe:', !!cont);
    console.log('🔍 [ejecutarParcial] cont.id:', cont?.id);
    console.log('🔍 [ejecutarParcial] html length:', html.length);
    console.log('🔍 [ejecutarParcial] html preview:', html.substring(0, 200));
    
    cont.innerHTML = html;
    
    console.log('🔍 [ejecutarParcial] DESPUÉS de innerHTML - cont.children.length:', cont.children.length);
    console.log('🔍 [ejecutarParcial] DESPUÉS de innerHTML - cont.innerHTML.length:', cont.innerHTML.length);

    // ─── Refinamiento de estructura: método → resumen → ranking → matriz → inferencias
    const parcialLayout = cont.querySelector('.ps-layout-2col');
    const parcialStatsCol = parcialLayout?.querySelector('.ps-stats-col');
    if (parcialLayout && parcialStatsCol) {
      parcialLayout.classList.add('ps-layout-2col--parcial');
      parcialStatsCol.classList.add('ps-sequence-col');

      const metodo = cont.querySelector('details.ps-method-details');
      if (metodo && metodo.parentElement !== parcialStatsCol) {
        metodo.setAttribute('open', 'open');
        parcialStatsCol.prepend(metodo);
      }

      const titles = [...cont.querySelectorAll('.ps-matrix-title')];
      const rankingTitle = titles.find(el => /Simetría bilateral|Pares bifaciales/i.test(el.textContent || ''));
      const rankingTable = cont.querySelector('.ps-ranking-table');
      const rankingNote = (rankingTable?.nextElementSibling && rankingTable.nextElementSibling.classList?.contains('ps-desc-note'))
        ? rankingTable.nextElementSibling
        : null;
      if (rankingTitle) parcialStatsCol.appendChild(rankingTitle);
      if (rankingTable) parcialStatsCol.appendChild(rankingTable);
      if (rankingNote) parcialStatsCol.appendChild(rankingNote);

      const matrixTitle = titles.find(el => /Matriz de distancias Procrustes/i.test(el.textContent || ''));
      const matrixScroll = cont.querySelector('.ps-table-scroll');
      if (matrixTitle) parcialStatsCol.appendChild(matrixTitle);
      if (matrixScroll) parcialStatsCol.appendChild(matrixScroll);

      const inferBlock = document.createElement('div');
      inferBlock.className = 'ps-desc-note';
      const best = resultados[0];
      const worst = resultados[resultados.length - 1];
      inferBlock.innerHTML = `🔬 <strong>Inferencias rápidas:</strong> par más próximo <strong>${esc(conPuntos[best.i]?.nombre || '—')} ↔ ${esc(conPuntos[best.j]?.nombre || '—')}</strong> (&rho;=${best.dist.toFixed(4)}), y mayor divergencia <strong>${esc(conPuntos[worst.i]?.nombre || '—')} ↔ ${esc(conPuntos[worst.j]?.nombre || '—')}</strong> (&rho;=${worst.dist.toFixed(4)}).`;
      parcialStatsCol.appendChild(inferBlock);
    }

    // MEJORA 11: Guardar resultados para exportación y mostrar botones
    window._lastResultados = resultados;
    window._lastConPuntos = conPuntos;
    window._lastModo = modo;

    // Inicializar / actualizar _lastAPS con datos del PS Parcial
    // ─── Calcular distancias EFA pairwise ─────────────────────────────────────
    const efaPares = []; // [{i, j, dEFA, simCombinada}]
    if (efaDisponible && window.PythonBridge?.efa?.compare) {
      for (const r of resultados) {
        const efaA = _efaMap.get(r.i);
        const efaB = _efaMap.get(r.j);
        if (efaA?.coefficients && efaB?.coefficients) {
          try {
            const cmp = await window.PythonBridge.efa.compare(efaA.coefficients, efaB.coefficients);
            const dEFA = cmp?.distance ?? null;
            const dAPS_norm = r.dist / (Math.PI / 2);
            const dEFA_norm = dEFA !== null ? Math.min(1, dEFA) : null;

            // ρ_EFA: Procrustes sobre contornos reconstruidos EFD (suavizado de Fourier)
            // contour_reconstructed está en espacio EFD canónico (centrado, escala E1=1, θ₁-alineado)
            // psParcial re-normaliza ambos por igual → residuos de forma pura
            let rhoEFA = null;
            if (efaA.contour_reconstructed?.length >= 8 && efaB.contour_reconstructed?.length >= 8) {
              try {
                const psEFA = psParcial(efaA.contour_reconstructed, efaB.contour_reconstructed, N_PUNTOS);
                rhoEFA = isFinite(psEFA.dist) ? psEFA.dist : null;
              } catch (_efa) { rhoEFA = null; }
            }
            const rhoEFA_norm = rhoEFA !== null ? rhoEFA / (Math.PI / 2) : null;

            // Fusión 3 canales: S = 100*(1 - (0.5·ρ_EFA_norm + 0.3·ρ_raw_norm + 0.2·dEFA_norm))
            // Degradación graceful si algún canal no está disponible
            let simCombinada;
            if (rhoEFA_norm !== null && dEFA_norm !== null) {
              simCombinada = Math.max(0, 100 * (1 - (0.5 * rhoEFA_norm + 0.3 * dAPS_norm + 0.2 * dEFA_norm)));
            } else if (rhoEFA_norm !== null) {
              simCombinada = Math.max(0, 100 * (1 - (0.65 * rhoEFA_norm + 0.35 * dAPS_norm)));
            } else if (dEFA_norm !== null) {
              simCombinada = Math.max(0, 100 * (1 - (0.75 * dAPS_norm + 0.25 * dEFA_norm)));
            } else {
              simCombinada = Math.max(0, 100 * (1 - dAPS_norm));
            }

            efaPares.push({ i: r.i, j: r.j, dEFA, rhoEFA, simCombinada });
          } catch (_) { efaPares.push({ i: r.i, j: r.j, dEFA: null, rhoEFA: null, simCombinada: null }); }
        } else {
          efaPares.push({ i: r.i, j: r.j, dEFA: null, rhoEFA: null, simCombinada: null });
        }
      }
    }
    const _efaPorPar = new Map(efaPares.map(e => (`${e.i}_${e.j}`), e => e));

    window._lastAPS = {
      id: null, // se asigna al guardar
      timestamp: new Date().toISOString(),
      modo: modo,
      N_landmarks: N_PUNTOS,
      efaDisponible,
      objetos: conPuntos.map((o, idx) => ({
        nombre: o.nombre, cara: o.cara || null, id: o.id || null,
        efaCoeficientes: _efaMap.get(idx)?.coefficients ?? null,
        efaVarianza95: _efaMap.get(idx)?.harmonics_for_95pct ?? null,
        efaContornoReconstruido: _efaMap.get(idx)?.contour_reconstructed ?? null
      })),
      parcial: resultados.map(r => {
        const ep = efaPares.find(e => e.i === r.i && e.j === r.j) || {};
        return {
          i: r.i, j: r.j,
          objA: conPuntos[r.i]?.nombre || '',
          objB: conPuntos[r.j]?.nombre || '',
          rho: r.dist,
          csA: r.csA, csB: r.csB,
          ISB: Math.max(0, (1 - r.dist / (Math.PI / 2)) * 100),
          usedReflection: r.usedReflection || false,
          validation: r.validation || null,
          dEFA: ep.dEFA ?? null,
          rhoEFA: ep.rhoEFA ?? null,
          simCombinada: ep.simCombinada ?? null
        };
      }),
      gpa: null // se rellena en ejecutarGPA
    };

    // ─── Celdas de la matriz clickeables para cambiar par visualizado ─────────
    let _activePar = { i: par0.i, j: par0.j };
    // Rotaciones manuales por objeto en el canvas (idx → ángulo en radianes)
    const _psManualRot = new Map();
    // Reflejos horizontales manuales por objeto (Set de idx activos)
    const _psManualFlip = new Set();
    // Visibilidad por objeto: índices en este set se omiten del canvas (toggle click en leyenda)
    const _psHiddenSet  = new Set();
    cont.querySelectorAll('.ps-cell-clickable').forEach(td => {
      td.addEventListener('click', () => {
        const pi = parseInt(td.dataset.pi, 10);
        const pj = parseInt(td.dataset.pj, 10);
        if (isNaN(pi) || isNaN(pj) || pi === pj) return;
        // Resaltar celda activa
        cont.querySelectorAll('.ps-cell-clickable').forEach(t => t.style.outline = '');
        td.style.outline = '2px solid #3b82f6';
        td.style.outlineOffset = '-2px';
        _activePar = { i: pi, j: pj };
        // Actualizar título del canvas
        const titleEl = document.getElementById('psParcialCanvasTitle');
        if (titleEl) titleEl.innerHTML = modo === 'especular' && conPuntos.length <= 2
          ? 'Superposición bifacial: <em>' + esc(conPuntos[pi]?.nombre||'') + '</em> · A &#8596; B'
          : modo === 'especular'
            ? 'Superposición bilateral — todos los objetos'
            : 'Vista de alineación: <em>' + esc(conPuntos[pi]?.nombre||'') + '</em> &rarr; <em>' + esc(conPuntos[pj]?.nombre||'') + '</em>';
        // Actualizar botón de toggle para reflejar decisión matemática del nuevo par
        if (typeof _syncToggleBtn === 'function') _syncToggleBtn(_activePar);
        // Redibujar canvas con el nuevo par
        requestAnimationFrame(() => renderizarCanvasParcialFn(conPuntos, modo, _activePar));
      });
    });

    // Agregar botones de exportación CSV/JSON
    setTimeout(() => {
      agregarBotonesExportacion();
      console.log('✅ Botones de exportación agregados');
    }, 100);

    // ─── Event listener para el toggle de reflexión ──────────────────────────
    const toggleBtn = $('psToggleReflectionBtn');
    /**
     * Sincroniza la etiqueta del botón con el par activo.
     * Muestra si el espejo es la decisión matemática óptima o un override manual.
     * @param {{i:number, j:number}} par
     */
    const _syncToggleBtn = (par) => {
      if (!toggleBtn) return;
      const mathMirror = _usedReflectionMat?.[par.i]?.[par.j] ?? true;
      if (!_forceReflectionToggle) {
        // Ruta óptima activa: mostrando resultado matemático fiel
        const label = mathMirror ? 'reflejo' : 'rotación pura';
        toggleBtn.textContent = `⭐ Vista óptima (${label}) — ver alternativa`;
        toggleBtn.style.background = '#dbeafe';
        toggleBtn.style.color = '#0369a1';
        toggleBtn.style.borderColor = '#0284c7';
      } else {
        // Ruta alternativa: exploración con alineamiento invertido
        const label = mathMirror ? 'sin reflejo' : 'con reflejo';
        toggleBtn.textContent = `🔍 Vista alternativa (${label}) — ver óptimo`;
        toggleBtn.style.background = '#fef3c7';
        toggleBtn.style.color = '#92400e';
        toggleBtn.style.borderColor = '#f59e0b';
      }
    };
    if (toggleBtn) {
      _syncToggleBtn(par0);  // Estado inicial según par0
      toggleBtn.addEventListener('click', () => {
        _forceReflectionToggle = !_forceReflectionToggle;
        _syncToggleBtn(_activePar);
        requestAnimationFrame(() => renderizarCanvasParcialFn(conPuntos, modo, _activePar));
      });
    }

    // ─── Event listeners del panel de alineación manual ──────────────────────
    (function iniciarPanelAlineacion() {
      const btnApply  = $('psAlignApply');
      const btnReset  = $('psAlignReset');
      const btnFlip   = $('psAlignFlip');
      const selObj    = $('psAlignObjSel');
      const inputAng  = $('psAlignAngle');
      const statusEl  = $('psAlignStatus');
      if (!btnApply || !selObj || !inputAng) return;

      const resolveIdxList = () => {
        const v = selObj.value;
        if (v === '__all__') return conPuntos.map((_, i) => i);
        const n = parseInt(v, 10);
        return isNaN(n) ? [] : [n];
      };
      const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };
      const redraw = () => requestAnimationFrame(() => renderizarCanvasParcialFn(conPuntos, modo, _activePar));

      btnApply.addEventListener('click', () => {
        const deg = parseFloat(inputAng.value);
        if (!isFinite(deg)) { setStatus('Ángulo inválido'); return; }
        const rad = deg * Math.PI / 180;
        const idxs = resolveIdxList();
        idxs.forEach(idx => {
          const prev = _psManualRot.get(idx) || 0;
          const total = prev + rad;
          if (Math.abs(total) < 1e-6) _psManualRot.delete(idx);
          else _psManualRot.set(idx, total);
        });
        setStatus(idxs.length === 1
          ? `+${deg}° → ${(((_psManualRot.get(idxs[0]) || 0) * 180 / Math.PI)).toFixed(1)}° total`
          : `+${deg}° aplicado a ${idxs.length} objetos`);
        redraw();
      });

      btnReset.addEventListener('click', () => {
        const idxs = resolveIdxList();
        idxs.forEach(idx => { _psManualRot.delete(idx); _psManualFlip.delete(idx); });
        if (inputAng) inputAng.value = 0;
        setStatus(idxs.length === 1 ? 'Resetear objeto' : 'Todos reseteados');
        redraw();
      });

      btnFlip.addEventListener('click', () => {
        const idxs = resolveIdxList();
        idxs.forEach(idx => {
          if (_psManualFlip.has(idx)) _psManualFlip.delete(idx);
          else _psManualFlip.add(idx);
        });
        setStatus(idxs.length === 1
          ? (_psManualFlip.has(idxs[0]) ? 'Reflejo activo' : 'Reflejo removido')
          : `Flip toggle (${idxs.length} obj)`);
        redraw();
      });
    })();

    // ─── Dibujar canvas ─────────────────────────────────────────────────────
    // Índices de Cara B en pares bifaciales — usados para aplicar espejo x→-x
    const _bFaceCanvasSet = new Set();
    for (const bf of paresBifaciales) {
      if (bf.j >= 0) _bFaceCanvasSet.add(bf.j);
    }

    const renderizarCanvasParcialFn = (conPuntos, modo, par0) => {
      const canvas = $('psParcialCanvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const zoomScale = getCanvasZoomScale(canvas);
      const zlw = (w, min = 0.35, max = 6) => zoomCompensatedLineWidth(w, zoomScale, min, max);
      ctx.clearRect(0,0,560,560);
      // Fondo
      ctx.fillStyle = '#f7fafc';
      ctx.fillRect(0,0,560,560);
      // Grilla
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = zlw(0.5, 0.22, 2.2);
      for (let g = 0; g <= 560; g += 70) {
        ctx.beginPath(); ctx.moveTo(g,0); ctx.lineTo(g,560); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0,g); ctx.lineTo(560,g); ctx.stroke();
      }
      // Cruz central
      ctx.strokeStyle = '#cbd5e0'; ctx.lineWidth = zlw(1, 0.3, 2.8);
      ctx.beginPath(); ctx.moveTo(CX,CY-CR); ctx.lineTo(CX,CY+CR); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(CX-CR,CY); ctx.lineTo(CX+CR,CY); ctx.stroke();

      // Helper: prepara puntos de un objeto aplicando espejo si corresponde.
      // explicitMirror: null = automático (modo comparación/mixto, usa _bFaceCanvasSet + toggle)
      //                 true  = forzar espejo   (modo especular: decisión explícita)
      //                 false = forzar sin espejo (modo especular: decisión explícita)
      const _prepPts = (rawPts, idx, explicitMirror = null) => {
        const filtered = detectarYFiltrarOutliers(rawPts, 2.5);
        // Fallback: si el filtro elimina demasiados puntos, usar los originales
        const usePts = filtered.length >= 3 ? filtered : rawPts;
        let aplicarEspejo;
        if (explicitMirror !== null) {
          // Modo especular: decisión explícita sincronizada con resultado matemático
          aplicarEspejo = explicitMirror;
        } else {
          // Modo comparación/mixto: lógica genérica para todo el conjunto de Cara B
          aplicarEspejo = _bFaceCanvasSet.has(idx) && !_forceReflectionToggle;
        }
        const workPts = aplicarEspejo ? usePts.map(p => ({ x: -p.x, y: p.y })) : usePts;
        const { pts } = centrarNormalizarYAlinearPorEjeInercia(resampleByArc(workPts, N_PUNTOS));
        return pts;
      };

      // ── Transformaciones visuales en canvas (no afectan ρ calculado) ──────────
      // Equivalente a rotateCanvasPts / reflectCanvasPts de CGeo, pero para el
      // espacio canvas de APS donde el origen es (CX, CY).
      const _rotCanvasPts = (pts, angleRad) => {
        if (!pts || !pts.length || !angleRad) return pts;
        const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
        return pts.map(p => {
          const dx = p.x - CX, dy = p.y - CY;
          return { x: CX + dx * cos - dy * sin, y: CY + dx * sin + dy * cos };
        });
      };
      // Reflejo horizontal visual: x → 2·CX − x
      const _flipCanvasPts = (pts) => pts.map(p => ({ x: 2 * CX - p.x, y: p.y }));
      // Aplicar rotación y/o flip manual al objeto con índice idx
      const _applyTransform = (canvPts, idx) => {
        let r = canvPts;
        if (_psManualRot.has(idx)) r = _rotCanvasPts(r, _psManualRot.get(idx));
        if (_psManualFlip.has(idx)) r = _flipCanvasPts(r);
        return r;
      };

      // Helper: genera item de leyenda con toggle de visibilidad (click para ocultar/mostrar)
      const _psLeyItem = (idx, nombre, extra) => {
        const hid = _psHiddenSet.has(idx);
        const col = PALETA[idx % PALETA.length];
        return '<span class="ps-ley-item ps-ley-toggle" data-idx="' + idx + '"' +
          ' style="cursor:pointer;opacity:' + (hid ? 0.28 : 1) + ';' + (hid ? 'text-decoration:line-through;' : '') + 'transition:all 0.15s;user-select:none;"' +
          ' title="' + (hid ? '🟢 Click para mostrar' : '🔴 Click para ocultar') + '">' +
          '<span class="ps-ley-dot" style="background:' + col + ';"></span>' +
          esc(nombre) + (extra || '') + '</span>';
      };

      const leyendaEl = $('psParcialLeyenda');
      let leyHtml = '';

      if (modo === 'especular' && par0 && par0.i >= 0 && par0.j >= 0 && conPuntos.length <= 2) {
        // ── Modo bifacial con par único: mostrar sólo el par activo (A vs B espejada) ──
        const idxA = par0.i;
        const idxB = par0.j;
        // ── Decisión de espejo sincronizada con el resultado matemático ───────
        // _usedReflectionMat[i][j] = true si psParcialBifacial determinó que
        // la reflexión produce menor ρ (mejor alineamiento bilateral).
        // _forceReflectionToggle permite al usuario invertir la decisión manual.
        // Si reflejo no mejora: el canvas usa rotación pura (racionalización de formas).
        const mathMirrorB = _usedReflectionMat?.[idxA]?.[idxB] ?? true;
        const doMirrorB   = _forceReflectionToggle ? !mathMirrorB : mathMirrorB;
        console.log(`[PS] Par (${idxA},${idxB}): mathMirror=${mathMirrorB}, toggle=${_forceReflectionToggle}, doMirror=${doMirrorB}`);
        const refPts = getPuntos(conPuntos[idxA]);
        if (!refPts || refPts.length < 3) {
          console.error(`❌ [PS] refPts inválido para ${conPuntos[idxA]?.nombre}`);
          if (leyendaEl) leyendaEl.innerHTML = `<p style="color:red;font-weight:bold;" class="ps-ley-item">Error: Coordenadas no disponibles</p>`;
          return;
        }
        // ── Ruta 1: usar puntos ya alineados del cálculo matemático (modo normal) ─
        // Garantiza coincidencia perfecta entre visual y ρ reportado.
        const preAligned = _alignedMat?.[idxA]?.[idxB];
        if (preAligned && !_forceReflectionToggle) {
          // aligned_A = A rotada hacia B; norm_B = B referencia — ya en espacio Procrustes
          const canvA = _applyTransform(toCanvas(preAligned.aligned_A, CR * 0.95), idxA);
          if (!_psHiddenSet.has(idxA)) drawShape(ctx, canvA, PALETA[idxA % PALETA.length], zlw(2, 0.5, 4.2), true, 0.10);
          leyHtml += _psLeyItem(idxA, conPuntos[idxA].nombre);
          const canvB = _applyTransform(toCanvas(preAligned.norm_B, CR * 0.95), idxB);
          if (!_psHiddenSet.has(idxB)) drawShape(ctx, canvB, PALETA[idxB % PALETA.length], zlw(1.5, 0.45, 3.6), true, 0.10);
          leyHtml += _psLeyItem(idxB, conPuntos[idxB].nombre);
        } else {
          // ── Ruta 2: toggle manual activo — re-normalizar con espejo invertido ─
          // (exploración visual; el ρ reportado sigue siendo el óptimo)
          const refNorm = _prepPts(refPts, idxA, false);
          const canvA = _applyTransform(toCanvas(refNorm, CR * 0.95), idxA);
          if (!_psHiddenSet.has(idxA)) drawShape(ctx, canvA, PALETA[idxA % PALETA.length], zlw(2, 0.5, 4.2), true, 0.10);
          leyHtml += _psLeyItem(idxA, conPuntos[idxA].nombre);
          const ptsB = getPuntos(conPuntos[idxB]);
          if (ptsB && ptsB.length >= 3) {
            const normB = _prepPts(ptsB, idxB, doMirrorB);
            const { Ar: arB } = rotar(normB, refNorm);
            const canvB = _applyTransform(toCanvas(arB, CR * 0.95), idxB);
            if (!_psHiddenSet.has(idxB)) drawShape(ctx, canvB, PALETA[idxB % PALETA.length], zlw(1.5, 0.45, 3.6), true, 0.10);
            leyHtml += _psLeyItem(idxB, conPuntos[idxB].nombre);
          }
        }
      } else {
        // ── Modo comparación/mixto (o especular con múltiples pares): mostrar todos ─
        const refPts = getPuntos(conPuntos[0]);
        if (!refPts || refPts.length < 3) {
          console.error(`❌ [PS] No se puede renderizar canvas: refPts vacío o inválido para ${conPuntos[0]?.nombre}`);
          if (leyendaEl) {
            leyendaEl.innerHTML = `<p style="color:red;font-weight:bold;" class="ps-ley-item">Error: Coordenadas no disponibles</p>`;
          }
          return;
        }
        const refNorm = _prepPts(refPts, 0);
        for (let i = 0; i < conPuntos.length; i++) {
          const pts = getPuntos(conPuntos[i]);
          if (!pts || pts.length < 3) {
            console.warn(`⚠️ [PS] Objeto ${i} (${conPuntos[i]?.nombre}) omitido: puntos inválidos`);
            continue;
          }
          const norm = _prepPts(pts, i);
          const { Ar } = rotar(norm, refNorm);
          const canv = _applyTransform(toCanvas(Ar, CR * 0.95), i);
          if (!_psHiddenSet.has(i)) drawShape(ctx, canv, PALETA[i%PALETA.length], i===0 ? zlw(2, 0.5, 4.2) : zlw(1.5, 0.45, 3.6), true, 0.10);
          leyHtml += _psLeyItem(i, conPuntos[i].nombre);
        }
      }
      if (leyendaEl) {
        leyendaEl.innerHTML = leyHtml;
        // Attach toggle listeners after each render
        leyendaEl.querySelectorAll('.ps-ley-toggle').forEach(el => {
          el.addEventListener('click', () => {
            const idx = parseInt(el.dataset.idx, 10);
            if (_psHiddenSet.has(idx)) _psHiddenSet.delete(idx); else _psHiddenSet.add(idx);
            requestAnimationFrame(() => renderizarCanvasParcialFn(conPuntos, modo, _activePar));
          });
        });
      }
    };

    // Renderizar canvas primera vez
    requestAnimationFrame(() => {
      renderizarCanvasParcialFn(conPuntos, modo, par0);
      const _pCanv = $('psParcialCanvas');
      if (_pCanv && window.attachCanvasZoom) {
        window.attachCanvasZoom(_pCanv);
        let _rq = null;
        _pCanv.addEventListener('canvaszoomchange', () => {
          if (_rq) return;
          _rq = requestAnimationFrame(() => {
            _rq = null;
            renderizarCanvasParcialFn(conPuntos, modo, _activePar);
          });
        });
      }
      // Botón PNG
      const _pWrap = _pCanv?.closest('.ps-canvas-viewport') || _pCanv?.closest('.ps-canvas-wrap') || _pCanv?.parentElement;
      if (_pWrap && _pCanv && !_pWrap.querySelector('.cmo-export-png-btn')) {
        const _btn = document.createElement('button');
        _btn.className = 'cmo-export-png-btn';
        _btn.title = 'Guardar superposición como PNG';
        _btn.textContent = '📸 PNG';
        _btn.addEventListener('click', () => {
          const link = document.createElement('a');
          link.href = _pCanv.toDataURL('image/png');
          link.download = 'APS_PSParcial_' + new Date().toISOString().slice(0,10) + '.png';
          link.click();
        });
        _pWrap.appendChild(_btn);
      }
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  MÉTRICAS GMM — Espacio tangente, TPS bending energy, PCA de formas
  //    · computeTangentSpace    — proyección al espacio tangente en el consensus
  //    · computeTpsBendingMatrix — kernel TPS K×K del consensus
  //    · computeBendingEnergies  — energía de flexión por forma (escalar)
  //    · computeLandmarkVariance — varianza por semi-landmark en espacio tangente
  //    · jacobiEigen             — eigenvalores/vectores de matriz simétrica n×n
  //    · computeShapePCA         — PCA del espacio de formas vía matriz de Gram
  // ──────────────────────────────────────────────────────────────────────────

  /** Proyección al espacio tangente en el consensus (Dryden & Mardia 1998).
   *  T_i = aligned_i / cos(ρ_i) − consensus
   *  Linealiza el espacio de Kendall para estadística multivariada.            */
  function computeTangentSpace(aligned, consensus, dists) {
    // El plano tangente en consensus es estable para ρ < π/2.
    // Para ρ grandes, cos(ρ) se aproxima a 0 y puede inflar numéricamente T_i.
    const MIN_SIGMA = 0.05; // amplificación máxima ≈ x20
    return aligned.map((al, i) => {
      const cosRho = Math.cos(dists[i]);
      if (dists[i] > Math.PI / 2) {
        console.warn(`⚠️ [Tangent] Obj ${i}: ρ=${dists[i].toFixed(3)} > π/2 — proyección tangente poco confiable`);
      }
      const sigma  = Math.max(cosRho, MIN_SIGMA);
      return al.map((p, k) => ({ x: p.x / sigma - consensus[k].x, y: p.y / sigma - consensus[k].y }));
    });
  }

  /** Matriz kernel TPS (K×K): U[j,k] = r²·ln(r²), r = distancia entre lmk j y k en el consensus.
   *  Cuantifica la energía de curvatura del campo de deformación.               */
  function computeTpsBendingMatrix(reference, K) {
    const U = Array.from({length: K}, () => new Float64Array(K));
    const MIN_R2 = 1e-8;       // regularización de colapsos de landmarks
    const MAX_BENDING = 1e12;  // cap defensivo para extremos numéricos
    let collapsed = 0;
    for (let j = 0; j < K; j++) {
      for (let k = j + 1; k < K; k++) {
        const dx = reference[j].x - reference[k].x;
        const dy = reference[j].y - reference[k].y;
        let r2 = dx * dx + dy * dy;
        if (r2 < MIN_R2) {
          r2 = MIN_R2;
          collapsed++;
        }
        let v = r2 * Math.log(r2);
        if (Math.abs(v) > MAX_BENDING) {
          v = Math.sign(v) * MAX_BENDING;
        }
        U[j][k] = v; U[k][j] = v;
      }
    }
    const totalPairs = (K * (K - 1)) / 2;
    if (totalPairs > 0 && collapsed > 0) {
      const collapseRate = (collapsed / totalPairs) * 100;
      console.warn(`⚠️ [TPS] ${collapsed} pares de landmarks colapsan (${collapseRate.toFixed(1)}%) — posible ROI defectuoso`);
      if (collapseRate > 10) {
        console.error(`❌ [TPS] ROI defectuoso: ${collapseRate.toFixed(0)}% de landmarks colapsados — considerar re-digitalización`);
      }
    }
    return U;
  }

  /** Energía de flexión TPS por forma: E_i = (t_x'·U·t_x + t_y'·U·t_y) / K.
   *  Mayor valor → deformación más localizada/irregular respecto al consensus.  */
  function computeBendingEnergies(tangent, U, K) {
    return tangent.map(t => {
      let ex = 0, ey = 0;
      for (let j = 0; j < K; j++) {
        let sx = 0, sy = 0;
        for (let k = 0; k < K; k++) { sx += U[j][k] * t[k].x; sy += U[j][k] * t[k].y; }
        ex += t[j].x * sx; ey += t[j].y * sy;
      }
      return (ex + ey) / K;
    });
  }

  /** Varianza por semi-landmark: var_k = (1/n) Σ_i ‖T_ik‖².
   *  Indica qué zonas del contorno varían más entre objetos del grupo.           */
  function computeLandmarkVariance(tangent, K, n) {
    return Array.from({length: K}, (_, k) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += tangent[i][k].x ** 2 + tangent[i][k].y ** 2;
      return s / n;
    });
  }

  /** Algoritmo de Jacobi para eigen-descomposición de matriz simétrica n×n.
   *  Retorna { vals: eigenvalores[], vecs: V (eigenvectores como filas) }.       */
  function jacobiEigen(A, n) {
    const M = A.map(row => [...row]);
    const V = Array.from({length: n}, (_, i) => Array.from({length: n}, (_, j) => i === j ? 1 : 0));
    for (let iter = 0, maxIt = n * n * 20; iter < maxIt; iter++) {
      let maxVal = 0, p = 0, q = 1;
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++)
          if (Math.abs(M[i][j]) > maxVal) { maxVal = Math.abs(M[i][j]); p = i; q = j; }
      if (maxVal < 1e-12) break;
      const theta  = (M[q][q] - M[p][p]) / (2 * M[p][q]);
      const t_rot  = (theta < 0 ? -1 : 1) / (Math.abs(theta) + Math.sqrt(1 + theta * theta));
      const c = 1 / Math.sqrt(1 + t_rot * t_rot), s = t_rot * c;
      const Mpp = M[p][p], Mqq = M[q][q], Mpq = M[p][q];
      M[p][p] = c*c*Mpp - 2*s*c*Mpq + s*s*Mqq;
      M[q][q] = s*s*Mpp + 2*s*c*Mpq + c*c*Mqq;
      M[p][q] = M[q][p] = 0;
      for (let r = 0; r < n; r++) {
        if (r !== p && r !== q) {
          const Mrp = M[r][p], Mrq = M[r][q];
          M[r][p] = M[p][r] =  c * Mrp - s * Mrq;
          M[r][q] = M[q][r] =  s * Mrp + c * Mrq;
        }
        const Vrp = V[r][p], Vrq = V[r][q];
        V[r][p] =  c * Vrp - s * Vrq;
        V[r][q] =  s * Vrp + c * Vrq;
      }
    }
    return { vals: M.map((row, i) => row[i]), vecs: V };
  }

  /** PCA del espacio de formas vía matriz de Gram (válido para n ≪ 2K).
   *  Retorna { scores:[{pc1,pc2},...], varExpl:[0..1,...], eigenvalues }.        */
  function computeShapePCA(tangent, n, K) {
    if (n < 2) return null;
    const dim = 2 * K;
    const vecs = tangent.map(t => {
      const v = new Float64Array(dim);
      for (let k = 0; k < K; k++) { v[k] = t[k].x; v[K + k] = t[k].y; }
      return v;
    });
    const mu = new Float64Array(dim);
    for (const v of vecs) for (let j = 0; j < dim; j++) mu[j] += v[j] / n;
    const cen = vecs.map(v => {
      const c = new Float64Array(dim);
      for (let j = 0; j < dim; j++) c[j] = v[j] - mu[j];
      return c;
    });
    const G = Array.from({length: n}, (_, i) =>
      Array.from({length: n}, (_, j) => {
        let s = 0;
        for (let k = 0; k < dim; k++) s += cen[i][k] * cen[j][k];
        return s / Math.max(n - 1, 1);
      })
    );
    const { vals, vecs: evecs } = jacobiEigen(G, n);
    const order = vals.map((v, i) => ({ v: Math.max(v, 0), i })).sort((a, b) => b.v - a.v);
    const totalVar = order.reduce((s, o) => s + o.v, 0);
    const scores = Array.from({length: n}, (_, i) => ({
      pc1: evecs[i][order[0].i] * Math.sqrt(Math.max(order[0].v, 0)),
      pc2: n >= 3 ? evecs[i][order[1].i] * Math.sqrt(Math.max(order[1].v, 0)) : 0,
      // all: scores for ALL n PCs — necesario para D² Mahalanobis
      all: order.map(o => evecs[i][o.i] * Math.sqrt(Math.max(o.v, 0)))
    }));
    return { scores, varExpl: order.map(o => totalVar > 0 ? o.v / totalVar : 0), eigenvalues: order.map(o => o.v) };
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  MÉTRICAS GMM — MEDIA PRIORIDAD
  //    · computeAllometry      — regresión multivariada forma ~ log(CS)
  //    · computeMahalanobisD2  — D² Mahalanobis + T² Hotelling + Pillai + perm
  // ──────────────────────────────────────────────────────────────────────────

  /** Alometría: regresión de forma (espacio tangente) sobre log(CS) (Monteiro 1999).
   *  Retorna { Rsq, pval, logCS, logCSc, meanLogCS, regScores, b1, b1norm }         */
  function computeAllometry(tangent, csAll, n, K) {
    if (n < 3) return null;
    const dim = 2 * K;
    const Y = tangent.map(t => {
      const v = new Float64Array(dim);
      for (let k = 0; k < K; k++) { v[k] = t[k].x; v[K + k] = t[k].y; }
      return v;
    });
    const mu = new Float64Array(dim);
    for (const v of Y) for (let j = 0; j < dim; j++) mu[j] += v[j] / n;
    const Yc = Y.map(v => {
      const c = new Float64Array(dim);
      for (let j = 0; j < dim; j++) c[j] = v[j] - mu[j];
      return c;
    });
    const logCS    = csAll.map(cs => Math.log(cs));
    const meanLCS  = logCS.reduce((s, v) => s + v, 0) / n;
    const logCSc   = logCS.map(v => v - meanLCS);
    const ssX      = logCSc.reduce((s, v) => s + v * v, 0);
    if (ssX < 1e-14) return null;
    // OLS slope: b1[j] = Σ_i logCSc[i]·Yc[i][j] / ssX
    const b1 = new Float64Array(dim);
    for (let i = 0; i < n; i++) for (let j = 0; j < dim; j++) b1[j] += logCSc[i] * Yc[i][j] / ssX;
    const b1sq   = b1.reduce((s, v) => s + v * v, 0);
    const b1norm = Math.sqrt(b1sq) || 1;
    // Regression scores: proyección de cada forma sobre dirección alométrica b1/‖b1‖
    const regScores = Yc.map(yc => yc.reduce((s, v, j) => s + v * b1[j] / b1norm, 0));
    // R² = SS_reg / SS_tot;  SS_reg = ‖b1‖² · ssX  (OLS con 1 predictor)
    const SS_reg = b1sq * ssX;
    const SS_tot = Yc.reduce((s, yc) => s + yc.reduce((si, v) => si + v * v, 0), 0);
    const Rsq    = SS_tot > 1e-14 ? Math.min(SS_reg / SS_tot, 1) : 0;
    // Test de permutación (999): barajar asignación talla → forma
    let nEx = 0;
    for (let p = 0; p < 999; p++) {
      const perm = [...logCSc].sort(() => Math.random() - 0.5);
      const b1p  = new Float64Array(dim);
      for (let i = 0; i < n; i++) for (let j = 0; j < dim; j++) b1p[j] += perm[i] * Yc[i][j] / ssX;
      if (b1p.reduce((s, v) => s + v * v, 0) >= b1sq) nEx++;
    }
    const pval = (nEx + 1) / 1000;
    return { Rsq, pval, logCS, logCSc, meanLCS, regScores, b1, b1norm };
  }

  /** D² Mahalanobis entre 2 grupos en los primeros r PCs del espacio de formas.
   *  Incluye T² Hotelling, traza de Pillai y test de permutación (999).
   *  shapePCAfull: retorno de computeShapePCA (scores[i].all debe existir).
   *  groups: [{ label, idxs:[] }, { label, idxs:[] }]                              */
  function computeMahalanobisD2(shapePCAfull, groups, r) {
    if (!shapePCAfull || groups.length < 2) return null;
    const [g1, g2] = groups;
    const n1 = g1.idxs.length, n2 = g2.idxs.length;
    if (n1 < 1 || n2 < 1) return null;
    const nTotal = n1 + n2;
    const maxR   = shapePCAfull.scores[0]?.all?.length || 2;
    const actualR = Math.min(r, nTotal - 2, maxR);
    if (actualR < 1) return null;
    const getRow = i => shapePCAfull.scores[i].all.slice(0, actualR);
    // Medias grupales en PC space
    const mu1 = new Float64Array(actualR), mu2 = new Float64Array(actualR);
    for (const i of g1.idxs) { const s = getRow(i); for (let j = 0; j < actualR; j++) mu1[j] += s[j] / n1; }
    for (const i of g2.idxs) { const s = getRow(i); for (let j = 0; j < actualR; j++) mu2[j] += s[j] / n2; }
    // Varianza within-group poolada (diagonal) — regularización implícita
    const pVar = new Float64Array(actualR);
    for (const i of g1.idxs) { const s = getRow(i); for (let j = 0; j < actualR; j++) pVar[j] += (s[j]-mu1[j])**2; }
    for (const i of g2.idxs) { const s = getRow(i); for (let j = 0; j < actualR; j++) pVar[j] += (s[j]-mu2[j])**2; }
    for (let j = 0; j < actualR; j++) pVar[j] /= Math.max(nTotal - 2, 1);
    // D² = Σ_j (μ1_j − μ2_j)² / pVar_j
    let D2 = 0;
    for (let j = 0; j < actualR; j++) {
      const d = mu1[j] - mu2[j];
      D2 += d * d / Math.max(pVar[j], 1e-12);
    }
    const T2    = D2 * n1 * n2 / nTotal;
    const df1   = actualR, df2 = nTotal - actualR - 1;
    const F     = df2 > 0 ? T2 * df2 / ((nTotal - 2) * df1) : NaN;
    // Traza de Pillai para 2 grupos: V = T²/(T² + n − 2)
    const pillai = T2 / (T2 + nTotal - 2);
    // Test de permutación (999): barajar etiquetas de grupo
    const allRows = [
      ...g1.idxs.map(i => getRow(i)),
      ...g2.idxs.map(i => getRow(i))
    ];
    let nEx = 0;
    for (let p = 0; p < 999; p++) {
      const perm = [...Array(nTotal).keys()].sort(() => Math.random() - 0.5);
      const pm1  = perm.slice(0, n1), pm2 = perm.slice(n1);
      const pmu1 = new Float64Array(actualR), pmu2 = new Float64Array(actualR);
      for (const i of pm1) { const s = allRows[i]; for (let j = 0; j < actualR; j++) pmu1[j] += s[j]/n1; }
      for (const i of pm2) { const s = allRows[i]; for (let j = 0; j < actualR; j++) pmu2[j] += s[j]/n2; }
      const ppv = new Float64Array(actualR);
      for (const i of pm1) { const s = allRows[i]; for (let j = 0; j < actualR; j++) ppv[j] += (s[j]-pmu1[j])**2; }
      for (const i of pm2) { const s = allRows[i]; for (let j = 0; j < actualR; j++) ppv[j] += (s[j]-pmu2[j])**2; }
      for (let j = 0; j < actualR; j++) ppv[j] /= Math.max(nTotal-2, 1);
      let pD2 = 0;
      for (let j = 0; j < actualR; j++) {
        const d = pmu1[j] - pmu2[j];
        pD2 += d * d / Math.max(ppv[j], 1e-12);
      }
      if (pD2 >= D2) nEx++;
    }
    const pval = (nEx + 1) / 1000;
    return { D2, T2, F, df1, df2, pillai, pval, actualR, n1, n2, labelA: g1.label, labelB: g2.label };
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  TAB: PS GPA (ANÁLISIS GENERALIZADO)
  // ──────────────────────────────────────────────────────────────────────────

  function ejecutarGPA(selObj) {
    const cont = $('psGPAContenido');
    if (!cont) return;

    if (selObj.length < 3) {
      cont.innerHTML = `<p class="ps-aviso">El GPA requiere al menos 3 objetos para calcular un consensus significativo.</p>`;
      return;
    }

    const conPuntos = selObj.filter(o => getPuntos(o) !== null);
    if (conPuntos.length < 3) {
      cont.innerHTML = `<p class="ps-aviso ps-aviso-error">Se necesitan al menos 3 objetos con datos de contorno para el GPA.</p>`;
      return;
    }

    // Clasificar selección ANTES del GPA para detectar pares bifaciales
    const gpaClsf = clasificarSeleccion(conPuntos);

    // Identificar índices de cara B en pares bifaciales para aplicar espejo especular
    const _bFaceIndicesGPA = new Set();
    for (const bf of gpaClsf.paresBifaciales) {
      const iB = conPuntos.indexOf(bf.objB);
      if (iB >= 0) _bFaceIndicesGPA.add(iB);
    }

    // rawConfigs SIN modificar — el espejo se aplica dentro de gpaIterativo
    // en espacio de forma normalizado (después de centrar+alinear), que es
    // matemáticamente correcto para reflexión bilateral canónica.
    const rawConfigs = conPuntos.map(o => getPuntos(o));
    const mirrorMask = conPuntos.map((_, i) => _bFaceIndicesGPA.has(i));

    console.log(`🪞 [GPA] Caras B reflejadas: ${[..._bFaceIndicesGPA].join(', ') || 'ninguna'}`);

    const { consensus, aligned, dists, csAll, iters, converged } = gpaIterativo(rawConfigs, N_PUNTOS, 30, mirrorMask);
    const n = conPuntos.length;

    // Validar que GPA produjo resultados válidos
    if (!consensus || consensus.length === 0 || !aligned || aligned.length === 0) {
      console.error('❌ [GPA] Sin resultados válidos: consensus=', consensus?.length, 'aligned=', aligned?.length);
      cont.innerHTML = `<p class="ps-aviso ps-aviso-error">Error al ejecutar GPA. Verifica la consola para detalles.</p>`;
      return;
    }

    // Ordenar por distancia al consensus (de menor a mayor)
    const ranking = dists.map((d,i) => ({ i, d })).sort((a,b) => a.d-b.d);

    // ── GMM alta prioridad: varianza Procrustes, espacio tangente, bending energy, PCA ──
    const procVar  = dists.reduce((s, d) => s + d * d, 0) / n;
    const meanRho  = dists.reduce((s, d) => s + d, 0) / n;
    const tangent  = computeTangentSpace(aligned, consensus, dists);
    const bendingU = computeTpsBendingMatrix(consensus, N_PUNTOS);
    const bendingE = computeBendingEnergies(tangent, bendingU, N_PUNTOS);
    const lmkVar   = computeLandmarkVariance(tangent, N_PUNTOS, n);
    const shapePCA = n >= 3 ? computeShapePCA(tangent, n, N_PUNTOS) : null;
    console.log(`📊 [GMM] Vp=${procVar.toFixed(6)} ρ̄=${meanRho.toFixed(4)} E_flex_media=${(bendingE.reduce((s,e)=>s+e,0)/n).toFixed(4)}`);

    // ─── GMM media prioridad: alometría, grupos, D², MANOVA ─────────────────
    const allometry = computeAllometry(tangent, csAll, n, N_PUNTOS);
    // Grupos A vs B (válido solo si hay ≥ 2 caras A y ≥ 2 caras B)
    const nB = _bFaceIndicesGPA.size;
    const nA = n - nB;
    const hasValidGroups = gpaClsf.modo === 'especular' && nA >= 2 && nB >= 2;
    const gmmGroups = hasValidGroups ? [
      { label: 'Cara\u00a0A', idxs: conPuntos.map((_, i) => i).filter(i => !_bFaceIndicesGPA.has(i)) },
      { label: 'Cara\u00a0B', idxs: [..._bFaceIndicesGPA] }
    ] : [];
    const mahaD2 = (hasValidGroups && shapePCA)
      ? computeMahalanobisD2(shapePCA, gmmGroups, Math.min(nA + nB - 2, 8))
      : null;
    // Strings de interpretación para el template HTML
    const allomSig = !allometry ? 'ns'
      : allometry.pval < 0.001 ? '***' : allometry.pval < 0.01 ? '**' : allometry.pval < 0.05 ? '*' : 'ns';
    const allomInterpret = !allometry ? '—'
      : allometry.Rsq < 0.05 ? 'Sin efecto alométrico detectable'
      : allometry.Rsq < 0.20 ? 'Alometría débil'
      : allometry.Rsq < 0.50 ? 'Alometría moderada' : 'Alometría fuerte';
    const d2Sig = !mahaD2 ? ''
      : mahaD2.pval < 0.001 ? '***' : mahaD2.pval < 0.01 ? '**' : mahaD2.pval < 0.05 ? '*' : 'ns';
    console.log(`[Allom] R²=${allometry?.Rsq?.toFixed(4)} p=${allometry?.pval?.toFixed(3)} | D²=${mahaD2?.D2?.toFixed(4)} Pillai=${mahaD2?.pillai?.toFixed(4)} p=${mahaD2?.pval?.toFixed(3)}`);

    let html = `
      <!-- Banner de modo GPA -->
      <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;margin-bottom:14px;
        border-radius:7px;border-left:4px solid ${gpaClsf.modo==='especular'?'#3182ce':gpaClsf.modo==='comparacion'?'#38a169':'#d69e2e'};
        background:${gpaClsf.modo==='especular'?'#ebf4ff':gpaClsf.modo==='comparacion'?'#f0fff4':'#fffaf0'};">
        <span style="font-size:20px;line-height:1;flex-shrink:0;">${gpaClsf.iconoModo}</span>
        <div>
          <div style="font-weight:700;font-size:13px;margin-bottom:3px;">${esc(gpaClsf.etiqueta)}</div>
          <div style="font-size:11px;color:#4a5568;line-height:1.4;">${gpaClsf.descripcion}${gpaClsf.modo==='especular'?' El consensus GPA representa la <em>forma media bilateral</em> del grupo. <strong>Las caras B se reflejan automáticamente</strong> (espejo X) antes del análisis para alinearlas con la cara A.':''}</div>
        </div>
      </div>

      <!-- Panel de descripción del método -->
      <details class="ps-method-details">
        <summary>&#9670; PS Completa / GPA — Método (ver detalles)</summary>
        <div class="ps-desc-panel">
        <div class="ps-desc-title">&#9671; PS Completa / GPA — Método</div>
        <ol class="ps-desc-steps">
          <li><strong>Remuestreo por arco</strong>: ${N_PUNTOS} semi-landmarks equidistantes en cada contorno.</li>
          ${_bFaceIndicesGPA.size > 0 ? `<li><strong>Pre-espejo (caras B)</strong>: <span style="background:#ebf4ff;color:#2b6cb0;padding:1px 6px;border-radius:4px;">🪞 ${_bFaceIndicesGPA.size} cara${_bFaceIndicesGPA.size>1?'s B reflejadas':'B reflejada'}</span> — reflexión en eje X para orientación canónica bilateral antes del GPA.</li>` : ''}
          <li><strong>Pre-normalización</strong>: centrado + escala por CS<sub>k</sub> para cada objeto.</li>
          <li><strong>Consensus iterativo</strong>: se calcula la forma media, todos los objetos se rotan sobre ella, se repite hasta convergencia (Δss &lt; 10⁻¹⁰). Converge en <strong>${iters} iteraciones</strong> ${converged ? '<span style="background:#c6f6d5;color:#276749;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:700;vertical-align:middle;">✅ Convergió</span>' : '<span style="background:#fed7d7;color:#9b2c2c;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:700;vertical-align:middle;">⚠ Máx. iter.</span>'}.</li>
          <li><strong>Forma media (consensus)</strong>: promedio de todas las configuraciones alineadas.</li>
          <li><strong>Distancia al consensus</strong>: ρ<sub>i</sub> = arccos(Σσ<sub>k</sub>) para cada objeto respecto al consensus final.</li>
        </ol>
        <div class="ps-desc-note">&#9432; El GPA minimiza la suma total de distancias al cuadrado (DRSS total) de forma simultánea. A diferencia del PS Parcial (pairwise), el consensus captura la <em>forma promedio del conjunto completo</em>.</div>
        </div><!-- /.ps-desc-panel -->
      </details>

      <div class="ps-layout-2col">
        <!-- Canvas consensus -->
        <div class="ps-canvas-wrap">
          <div class="ps-canvas-title">Formas alineadas al consensus (GPA)</div>
          <!-- ── Panel de alineación manual GPA ───────────────────────────── -->
          <div id="psGPAAlignPanel" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:5px 0 3px;padding:6px 10px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;font-size:11px;">
            <span style="color:#92400e;font-weight:600;white-space:nowrap;">↻ Alinear:</span>
            <select id="psGPAAlignObjSel" style="font-size:11px;padding:2px 4px;border:1px solid #fcd34d;border-radius:4px;background:#fff;max-width:160px;">
              <option value="__all__">— todos —</option>
              ${conPuntos.map((p, i) => `<option value="${i}">${esc(p.nombre)}${p.cara && p.cara !== 'Mono' ? ' (' + p.cara + ')' : ''}</option>`).join('')}
            </select>
            <input id="psGPAAlignAngle" type="number" value="0" min="-360" max="360" step="1"
              style="width:58px;font-size:11px;padding:2px 4px;border:1px solid #fcd34d;border-radius:4px;text-align:right;">
            <span style="color:#78350f;">°</span>
            <button id="psGPAAlignApply" style="font-size:10px;padding:2px 8px;background:#f59e0b;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600;">Aplicar</button>
            <button id="psGPAAlignReset" style="font-size:10px;padding:2px 8px;background:#e5e7eb;color:#374151;border:none;border-radius:4px;cursor:pointer;">Reset</button>
            <span style="color:#fcd34d;">│</span>
            <button id="psGPAAlignFlip" style="font-size:10px;padding:2px 8px;background:#7c3aed;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600;" title="Reflejo horizontal visual (no afecta al cálculo GPA)">⟺ Reflejar</button>
            <span id="psGPAAlignStatus" style="color:#92400e;font-style:italic;font-size:10px;margin-left:2px;"></span>
          </div>
          <div class="ps-canvas-viewport">
            <canvas id="psGPACanvas" width="560" height="560"></canvas>
          </div>
          <div class="ps-canvas-legend" id="psGPALeyenda"></div>
        </div>

        <!-- Ranking de objetos por distancia al consensus -->
        <div class="ps-stats-col">
          <div class="ps-ranking-title">Ranking — distancia al consensus (ρ)
            <button id="psGPARankCsvBtn" style="float:right;font-size:10px;padding:2px 8px;background:#e2e8f0;color:#2d3748;border:1px solid #cbd5e0;border-radius:4px;cursor:pointer;font-weight:600;" title="Descargar ranking como CSV">↓ CSV</button>
          </div>
          <table id="psGPARankingTable" class="ps-ranking-table">
            <thead><tr><th>#</th><th>Objeto</th><th>ρ</th><th>CS</th><th>E<sub>flex</sub></th></tr></thead>
            <tbody>
              ${ranking.map((r,rank) => `
                <tr>
                  <td class="ps-rank-num">${rank+1}</td>
                  <td><span class="ps-obj-dot" style="background:${PALETA[r.i%PALETA.length]}"></span>${esc(conPuntos[r.i].nombre)}</td>
                  <td class="ps-rank-dist">${r.d.toFixed(4)}</td>
                  <td class="ps-rank-cs">${csAll[r.i].toFixed(1)} px</td>
                  <td class="ps-rank-be">${bendingE[r.i].toFixed(4)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
          <div class="ps-desc-note" style="margin-top:10px;">
            CS = Centroid Size (px) — tamaño del objeto antes de normalizar.<br>
            El GPA excluye el tamaño; solo compara <em>forma pura</em>.
          </div>
          <!-- Dispersión de semi-landmarks — debajo del ranking en la columna derecha -->
          <div class="ps-matrix-title" style="margin-top:12px;">Dispersión de semi-landmarks</div>
          <div class="ps-canvas-viewport" style="width:340px;height:340px;">
            <canvas id="psDeformCanvas" width="340" height="340"></canvas>
          </div>
          <p style="font-size:10px;color:#718096;text-align:center;margin:4px 0 0;">
            Heatmap: azul=baja varianza · rojo=alta varianza por semi-landmark
          </p>
        </div>
      </div>

      <!-- ── Panel GMM del grupo ──────────────────────────────────────────────── -->
      <div class="ps-gmm-stats-panel">
        <div class="ps-ranking-title" style="margin-bottom:10px;">✦ Estadísticas GMM del grupo</div>
        <div class="ps-gmm-stats-grid">
          <div class="ps-stat-card">
            <div class="ps-stat-val">${procVar.toFixed(6)}</div>
            <div class="ps-stat-lbl">Varianza Procrustes (V<sub>p</sub> = &Sigma;&rho;&sup2;/n)</div>
          </div>
          <div class="ps-stat-card">
            <div class="ps-stat-val">${meanRho.toFixed(4)} rad</div>
            <div class="ps-stat-lbl">&rho; media del grupo</div>
          </div>
          <div class="ps-stat-card">
            <div class="ps-stat-val">${Math.min(...dists).toFixed(4)} &rarr; ${Math.max(...dists).toFixed(4)}</div>
            <div class="ps-stat-lbl">Rango &rho; (m&iacute;n &rarr; m&aacute;x)</div>
          </div>
          <div class="ps-stat-card">
            <div class="ps-stat-val">${(bendingE.reduce((s,e)=>s+e,0)/n).toFixed(4)}</div>
            <div class="ps-stat-lbl">Energ&iacute;a flexi&oacute;n media (E<sub>flex</sub>)</div>
          </div>
        </div>
        <!-- Botón CSV de estadísticas GMM -->
        <button id="psGPAGmmCsvBtn" style="margin-top:8px;font-size:10px;padding:3px 10px;background:#e2e8f0;color:#2d3748;border:1px solid #cbd5e0;border-radius:4px;cursor:pointer;font-weight:600;" title="Descargar estadísticas GMM como CSV">↓ CSV estadísticas</button>
        ${shapePCA ? `
        <div style="margin-top:16px;">
          <div class="ps-matrix-title">Espacio de formas &mdash; PC1 vs PC2 (proyección tangente de Procrustes)</div>
          <div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-top:8px;">
            <div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;">
              <div class="ps-canvas-viewport" style="width:280px;height:280px;">
                <canvas id="psGPAPCACanvas" width="280" height="280"></canvas>
              </div>
              <p style="font-size:10px;color:#718096;text-align:center;margin:0;width:280px;">
                PC1 (${(shapePCA.varExpl[0]*100).toFixed(1)}%) &bull; PC2 (${(shapePCA.varExpl[1]*100).toFixed(1)}%)
              </p>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;padding-top:4px;">
              ${shapePCA.scores.map((sc, i) => `
                <div class="ps-stat-card" style="min-width:200px;">
                  <span class="ps-obj-dot" style="background:${PALETA[i%PALETA.length]}"></span>
                  <span style="font-size:11px;font-weight:600;">${esc(conPuntos[i].nombre)}</span><br>
                  <span style="font-size:10px;color:#4a5568;">PC1: ${sc.pc1.toFixed(4)} &nbsp;&bull;&nbsp; PC2: ${sc.pc2.toFixed(4)}</span>
                </div>`).join('')}
              <div class="ps-desc-note" style="max-width:220px;">
                PCA del espacio tangente de Procrustes.<br>
                Cada punto = forma normalizada proyectada en los 2 primeros componentes de variaci&oacute;n de forma.
              </div>
            </div>
          </div>
        </div>` : ''}

        <!-- ── Alometría ──────────────────────────────────────────────────── -->
        ${allometry ? `<details class="ps-method-details" style="margin-top:14px;" open>
          <summary>&#9670; Alometr&iacute;a &mdash; forma ~ log(CS)</summary>
          <div style="padding:10px 0 4px;">
            <div class="ps-gmm-stats-grid" style="grid-template-columns:repeat(auto-fill,minmax(148px,1fr));margin-bottom:10px;">
              <div class="ps-stat-card">
                <div class="ps-stat-val">${allometry.Rsq.toFixed(4)}
                  <span style="font-size:11px;font-weight:700;color:${allometry.pval<0.05?'#276749':'#9b2c2c'};margin-left:4px;">${allomSig}</span>
                </div>
                <div class="ps-stat-lbl">R&sup2; (forma ~ log CS)</div>
              </div>
              <div class="ps-stat-card">
                <div class="ps-stat-val">${allometry.pval < 0.001 ? '&lt; 0.001' : allometry.pval.toFixed(3)}</div>
                <div class="ps-stat-lbl">p-valor (permutaci&oacute;n n=999)</div>
              </div>
              <div class="ps-stat-card" style="grid-column:span 2;background:${allometry.pval<0.05?'#f0fff4':'#fff5f5'};">
                <div class="ps-stat-val" style="font-size:12px;color:${allometry.pval<0.05?'#276749':'#9b2c2c'};">${allomInterpret}</div>
                <div class="ps-stat-lbl">Interpretaci&oacute;n</div>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;">
              <div class="ps-canvas-viewport" style="width:300px;height:180px;">
                <canvas id="psGPAAllomCanvas" width="300" height="180"></canvas>
              </div>
              <p style="font-size:10px;color:#718096;margin:0;width:300px;">
                Eje X: log(CS) &mdash; Eje Y: score alometr&iacute;co (proyecci&oacute;n sobre b<sub>1</sub>). L&iacute;nea = ajuste OLS.
              </p>
            </div>
          </div>
        </details>` : `<div class="ps-desc-note" style="margin-top:10px;">Alometr&iacute;a requiere n &ge; 3 objetos.</div>`}

        <!-- ── D² Mahalanobis + MANOVA ────────────────────────────────────── -->
        ${mahaD2 ? `<details class="ps-method-details" style="margin-top:14px;" open>
          <summary>&#9670; D&sup2; Mahalanobis &amp; MANOVA &mdash; ${esc(mahaD2.labelA)} vs ${esc(mahaD2.labelB)}</summary>
          <div style="padding:10px 0 4px;">
            <div class="ps-gmm-stats-grid" style="grid-template-columns:repeat(auto-fill,minmax(148px,1fr));margin-bottom:10px;">
              <div class="ps-stat-card">
                <div class="ps-stat-val">${mahaD2.D2.toFixed(4)}</div>
                <div class="ps-stat-lbl">D&sup2; Mahalanobis (r=${mahaD2.actualR}\u00a0PCs)</div>
              </div>
              <div class="ps-stat-card">
                <div class="ps-stat-val">${mahaD2.T2.toFixed(4)}</div>
                <div class="ps-stat-lbl">T&sup2; Hotelling (n<sub>A</sub>=${mahaD2.n1}, n<sub>B</sub>=${mahaD2.n2})</div>
              </div>
              <div class="ps-stat-card">
                <div class="ps-stat-val">${mahaD2.pillai.toFixed(4)}</div>
                <div class="ps-stat-lbl">Traza de Pillai (MANOVA)</div>
              </div>
              <div class="ps-stat-card" style="background:${mahaD2.pval<0.05?'#f0fff4':'#fff5f5'};">
                <div class="ps-stat-val" style="color:${mahaD2.pval<0.05?'#276749':'#9b2c2c'};">
                  ${mahaD2.pval < 0.001 ? '&lt; 0.001' : mahaD2.pval.toFixed(3)}
                  <span style="font-size:11px;font-weight:700;margin-left:4px;">${d2Sig}</span>
                </div>
                <div class="ps-stat-lbl">p-valor (permutaci&oacute;n n=999)</div>
              </div>
            </div>
            <div class="ps-desc-note">
              Distancia entre centroides de grupo en espacio de Mahalanobis (r=${mahaD2.actualR} PCs).
              Pillai = T&sup2;/(T&sup2;&nbsp;+&nbsp;n&nbsp;&minus;&nbsp;2).&ensp;
              <strong>${mahaD2.pval < 0.05
                ? 'Los grupos difieren significativamente en forma.'
                : 'Sin diferencia significativa de forma entre grupos.'}</strong>
            </div>
          </div>
        </details>`
        : hasValidGroups
          ? `<div class="ps-desc-note" style="margin-top:10px;">&#9888; Error calculando D&sup2;/MANOVA.</div>`
          : gpaClsf.modo === 'especular'
            ? `<div class="ps-desc-note" style="margin-top:10px;">D&sup2; y MANOVA requieren &ge;\u202f2 objetos por cara (actuales: A=${nA}, B=${nB}).</div>`
            : `<div class="ps-desc-note" style="margin-top:10px;">D&sup2; y MANOVA requieren grupos definidos (modo bifacial con &ge;\u202f2 pares).</div>`}

      </div>
    `;

    // DEBUGGING: verificar antes de asignar
    // Limpiar canvas zoom anterior antes de reemplazar DOM
    if (window.detachCanvasZoom) {
      cont.querySelectorAll('canvas').forEach(c => window.detachCanvasZoom(c));
    }

    console.log('🔍 [ejecutarGPA] cont element existe:', !!cont);
    console.log('🔍 [ejecutarGPA] cont.id:', cont?.id);
    console.log('🔍 [ejecutarGPA] html length:', html.length);
    console.log('🔍 [ejecutarGPA] html preview:', html.substring(0, 200));
    
    cont.innerHTML = html;
    
    console.log('🔍 [ejecutarGPA] DESPUÉS de innerHTML - cont.children.length:', cont.children.length);
    console.log('🔍 [ejecutarGPA] DESPUÉS de innerHTML - cont.innerHTML.length:', cont.innerHTML.length);

    // ─── Refinamiento de estructura GPA: método → resumen → ranking → matriz → inferencias
    const gpaLayout = cont.querySelector('.ps-layout-2col');
    const gpaStatsCol = gpaLayout?.querySelector('.ps-stats-col');
    if (gpaLayout && gpaStatsCol) {
      gpaLayout.classList.add('ps-layout-2col--gpa');
      gpaStatsCol.classList.add('ps-sequence-col');

      const metodoGPA = cont.querySelector('details.ps-method-details');
      if (metodoGPA && metodoGPA.parentElement !== gpaStatsCol) {
        metodoGPA.setAttribute('open', 'open');
        gpaStatsCol.prepend(metodoGPA);
      }

      const resumenGPA = document.createElement('div');
      resumenGPA.className = 'ps-chip ps-chip-gray';
      resumenGPA.innerHTML =
        '<span class="ps-chip-label">Resumen ejecutivo GPA</span>' +
        '<span class="ps-chip-val">ρ̄ = ' + meanRho.toFixed(4) + ' rad · Vp = ' + procVar.toFixed(6) + '</span>' +
        '<span class="ps-chip-sub">Iteraciones: ' + iters + (converged ? ' (convergió)' : ' (máximo alcanzado)') + '</span>';
      gpaStatsCol.insertBefore(resumenGPA, gpaStatsCol.firstElementChild || null);

      const gmmPanel = cont.querySelector('.ps-gmm-stats-panel');
      if (gmmPanel) {
        gpaStatsCol.appendChild(gmmPanel);
      }
    }

    // MEJORA 11: Guardar resultados para exportación y mostrar botones (GPA)
    // window._lastResultados se conserva del análisis Parcial (ya ejecutado antes)
    window._lastConPuntos = conPuntos;
    window._lastModo = 'gpa';

    // Actualizar _lastAPS con datos GPA completos
    if (window._lastAPS) {
      window._lastAPS.gpa = {
        consensus: consensus.map(p => ({ x: p.x, y: p.y })),
        dists: dists.slice(),
        csAll: csAll.slice(),
        iters, converged,
        procVar, meanRho,
        bendingE: bendingE.slice(),
        lmkVar: lmkVar.slice(),
        shapePCA: shapePCA ? {
          scores:   shapePCA.scores.map(s => ({ pc1: s.pc1, pc2: s.pc2 })),
          varExpl:  shapePCA.varExpl.slice(),
          eigenvalues: shapePCA.eigenvalues.slice()
        } : null,
        allometry: allometry ? {
          Rsq:        allometry.Rsq,
          pval:       allometry.pval,
          logCS:      allometry.logCS.slice(),
          logCSc:     allometry.logCSc.slice(),
          regScores:  allometry.regScores.slice(),
          b1norm:     allometry.b1norm
        } : null,
        mahaD2: mahaD2 ? {
          D2:     mahaD2.D2,
          T2:     mahaD2.T2,
          pillai: mahaD2.pillai,
          pval:   mahaD2.pval,
          labelA: mahaD2.labelA,
          labelB: mahaD2.labelB
        } : null
      };
    }

    // Mostrar botón Guardar APS
    const _btnGuardar = document.getElementById('psGuardarAPSBtn');
    if (_btnGuardar) _btnGuardar.style.display = 'inline-block';
    
    // Agregar botones de exportación CSV/JSON
    setTimeout(() => {
      agregarBotonesExportacion();
      console.log('✅ Botones de exportación agregados (GPA)');
    }, 100);

    // ─── Estado de transformaciones visuales del canvas GPA ──────────────────
    // (no afectan ρ ni el consensus — sólo ayuda a inspeccionar orientación)
    const _gpaHiddenSet  = new Set(); // Índices ocultos visualmente (toggle en leyenda)
    const _gpaLeyItem = (idx, nombre, extra) => {
      const hid = _gpaHiddenSet.has(idx);
      const col = PALETA[idx % PALETA.length];
      return '<span class="ps-ley-item ps-ley-toggle" data-gpa-idx="' + idx + '"' +
        ' style="cursor:pointer;opacity:' + (hid ? 0.28 : 1) + ';' + (hid ? 'text-decoration:line-through;' : '') + 'transition:all 0.15s;user-select:none;"' +
        ' title="' + (hid ? '\u{1F7E2} Click para mostrar' : '\u{1F534} Click para ocultar') + '">' +
        '<span class="ps-ley-dot" style="background:' + col + ';"></span>' +
        esc(nombre) + (extra || '') + '</span>';
    };
    const _gpaManualRot  = new Map(); // idx → ángulo acumulado en radianes
    const _gpaManualFlip = new Set(); // Set<idx> con reflejo horizontal activo

    // ─── Dibujar canvas GPA ─────────────────────────────────────────────────
    requestAnimationFrame(() => {
      try {
        // Validar datos antes de renderizar
        if (!consensus || consensus.length === 0 || !aligned || aligned.length === 0) {
          console.error(`❌ [PS-GPA] Datos vacíos: consensus=${consensus?.length || 0}, aligned=${aligned?.length || 0}`);
          return;
        }
      
      // Canvas de formas superpuestas
      const canvas = $('psGPACanvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const zoomScale = getCanvasZoomScale(canvas);
        const zlw = (w, min = 0.35, max = 6) => zoomCompensatedLineWidth(w, zoomScale, min, max);
        ctx.clearRect(0,0,560,560);
        ctx.fillStyle = '#f7fafc'; ctx.fillRect(0,0,560,560);
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = zlw(0.5, 0.22, 2.2);
        for (let g = 0; g <= 560; g += 70) {
          ctx.beginPath(); ctx.moveTo(g,0); ctx.lineTo(g,560); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0,g); ctx.lineTo(560,g); ctx.stroke();
        }
        ctx.strokeStyle = '#cbd5e0'; ctx.lineWidth = zlw(1, 0.3, 2.8);
        ctx.beginPath(); ctx.moveTo(CX,CY-CR); ctx.lineTo(CX,CY+CR); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(CX-CR,CY); ctx.lineTo(CX+CR,CY); ctx.stroke();

        // ── Helpers de transformación visual del canvas GPA ────────────────
        const _rotGPA = (pts, rad) => {
          if (!pts || !pts.length || !rad) return pts;
          const cos = Math.cos(rad), sin = Math.sin(rad);
          return pts.map(p => {
            const dx = p.x - CX, dy = p.y - CY;
            return { x: CX + dx * cos - dy * sin, y: CY + dx * sin + dy * cos };
          });
        };
        const _flipGPA   = (pts) => pts.map(p => ({ x: 2 * CX - p.x, y: p.y }));
        const _applyGPATr = (canvPts, idx) => {
          let r = canvPts;
          if (_gpaManualRot.has(idx))  r = _rotGPA(r, _gpaManualRot.get(idx));
          if (_gpaManualFlip.has(idx)) r = _flipGPA(r);
          return r;
        };

        const leyendaEl = $('psGPALeyenda');
        let leyHtml = '';
        // Hit-zones: centroides de cada forma para tooltip
        const _gpaHits = [];

        // Dibujar cada forma alineada
        for (let i = 0; i < n; i++) {
          if (!aligned[i] || aligned[i].length === 0) continue;
          const canv = _applyGPATr(toCanvas(aligned[i], CR * 0.95), i);
          const isMirrored = _bFaceIndicesGPA.has(i);
          if (!_gpaHiddenSet.has(i)) drawShape(ctx, canv, PALETA[i%PALETA.length], zlw(1.5, 0.45, 3.6), true, 0.08);
          leyHtml += _gpaLeyItem(i, conPuntos[i].nombre, isMirrored ? ' <span style="font-size:10px;opacity:.8" title="Cara B reflejada (espejo)">🪞</span>' : '');
          // Guardar centroide de la forma en coordenadas canvas para hover
          const cx_ = canv.reduce((s,p)=>s+p.x,0)/canv.length;
          const cy_ = canv.reduce((s,p)=>s+p.y,0)/canv.length;
          _gpaHits.push({ cx: cx_, cy: cy_, pts: canv, nombre: conPuntos[i].nombre, color: PALETA[i%PALETA.length], dist: dists[i], mirrored: isMirrored });
        }
        // Consensus encima (línea gruesa blanca/negra) — sin transform: forma de referencia fija
        const consensusCanv = toCanvas(consensus, CR * 0.95);
        drawShape(ctx, consensusCanv, '#000', zlw(2.5, 0.6, 5), false);
        drawShape(ctx, consensusCanv, '#fff', zlw(1.0, 0.3, 2.8), false);
        leyHtml += '<span class="ps-ley-item"><span class="ps-ley-dot" style="background:#000;border:1px solid #999"></span><em>Consensus</em></span>';
        if (leyendaEl) {
          leyendaEl.innerHTML = leyHtml;
          leyendaEl.querySelectorAll('.ps-ley-toggle').forEach(el => {
            el.addEventListener('click', () => {
              const idx = parseInt(el.dataset.gpaIdx, 10);
              if (_gpaHiddenSet.has(idx)) _gpaHiddenSet.delete(idx); else _gpaHiddenSet.add(idx);
              requestAnimationFrame(_redrawGPA);
            });
          });
        }

        // Tooltip de objetos en canvas GPA
        let _ttGPA = document.getElementById('psGPATooltip');
        if (!_ttGPA) {
          _ttGPA = document.createElement('div');
          _ttGPA.id = 'psGPATooltip';
          _ttGPA.style.cssText = 'display:none;position:fixed;background:rgba(26,32,44,0.93);color:#fff;font-size:11px;padding:6px 10px;border-radius:7px;pointer-events:none;z-index:9999;line-height:1.7;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.25);';
          document.body.appendChild(_ttGPA);
        }
        canvas.onmousemove = e => {
          const rect = canvas.getBoundingClientRect();
          const scX = 560 / rect.width, scY = 560 / rect.height;
          const mx = (e.clientX - rect.left) * scX;
          const my = (e.clientY - rect.top) * scY;
          // Encontrar la forma cuyo centroide está más cerca del cursor
          let best = null, bestD = Infinity;
          for (const h of _gpaHits) {
            const d = Math.hypot(mx - h.cx, my - h.cy);
            if (d < bestD) { bestD = d; best = h; }
          }
          if (best && bestD < CR * 0.9) {
            _ttGPA.innerHTML = `<span style="color:${best.color};">●</span> <b>${esc(best.nombre)}</b>${best.mirrored ? ' <span title="Cara B reflejada">🪞</span>' : ''}<br>ρ = ${best.dist.toFixed(4)} rad`;
            _ttGPA.style.display = 'block';
            _ttGPA.style.left = (e.clientX + 14) + 'px';
            _ttGPA.style.top  = (e.clientY - 14) + 'px';
          } else {
            _ttGPA.style.display = 'none';
          }
        };
        canvas.onmouseleave = () => { _ttGPA.style.display = 'none'; };
      }

      // Canvas de dispersión de landmarks
      const dc = $('psDeformCanvas');
      if (dc) {
        const ctx = dc.getContext('2d');
        const zoomScale = getCanvasZoomScale(dc);
        const zlw = (w, min = 0.3, max = 4) => zoomCompensatedLineWidth(w, zoomScale, min, max);
        ctx.clearRect(0,0,340,340);
        ctx.fillStyle = '#f7fafc'; ctx.fillRect(0,0,340,340);
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = zlw(0.5, 0.2, 1.8);
        for (let g = 0; g <= 340; g += 40) {
          ctx.beginPath(); ctx.moveTo(g,0); ctx.lineTo(g,340); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0,g); ctx.lineTo(340,g); ctx.stroke();
        }
        // Líneas de variación: desde consensus, para cada objeto
        const DCX=170,DCY=170,sc=142;
        for (let i = 0; i < n; i++) {
          if (!aligned[i] || aligned[i].length === 0) continue;
          // Aplicar transform visual al objeto alineado
          const alignedCanv = _applyGPATr(aligned[i].map(p => ({ x: DCX + p.x * sc, y: DCY - p.y * sc })), i);
          ctx.strokeStyle = PALETA[i%PALETA.length] + '80'; // ~50% alpha
          ctx.lineWidth = zlw(0.8, 0.25, 2.2);
          for (let k = 0; k < N_PUNTOS; k++) {
            const cx_ = DCX + consensus[k].x * sc;
            const cy_ = DCY - consensus[k].y * sc;
            ctx.beginPath(); ctx.moveTo(cx_, cy_); ctx.lineTo(alignedCanv[k].x, alignedCanv[k].y); ctx.stroke();
          }
        }
        // Consensus: dots coloreados por varianza por landmark (heatmap azul→rojo)
        const _lmkVarMax = Math.max(...lmkVar, 1e-10);
        for (let k = 0; k < N_PUNTOS; k++) {
          const tc = lmkVar[k] / _lmkVarMax;
          const rr = Math.round(tc * 220), bb = Math.round((1 - tc) * 220);
          ctx.fillStyle = `rgb(${rr},50,${bb})`;
          ctx.beginPath();
            ctx.arc(DCX + consensus[k].x * sc, DCY - consensus[k].y * sc, zlw(3.5, 1.2, 5), 0, Math.PI * 2);
          ctx.fill();
        }
        // Puntos de cada objeto alineado (con transform visual)
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = PALETA[i%PALETA.length];
          const alignedCanv = _applyGPATr(aligned[i].map(p => ({ x: DCX + p.x * sc, y: DCY - p.y * sc })), i);
          for (const p of alignedCanv) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, zlw(2, 0.9, 3.2), 0, Math.PI*2);
            ctx.fill();
          }
        }
      }

      } catch (err) {
        console.error('❌ [GPA] Error al dibujar canvas GPA:', err.message, err.stack);
      }

      // ── PCA espacio de formas — try/catch independiente ─────────────────────
      try {
        const pcaC = $('psGPAPCACanvas');
        console.log('[GPA-PCA] pcaC=', !!pcaC, '| shapePCA=', !!shapePCA, '| n=', n);
        if (pcaC && shapePCA && shapePCA.scores && shapePCA.scores.length >= 2) {
          const pcaCtx = pcaC.getContext('2d');
          const W2 = 280, H2 = 280, pad = 34;
          pcaCtx.clearRect(0, 0, W2, H2);
          pcaCtx.fillStyle = '#f8fafc'; pcaCtx.fillRect(0, 0, W2, H2);
          const allPc1 = shapePCA.scores.map(s => s.pc1).filter(isFinite);
          const allPc2 = shapePCA.scores.map(s => s.pc2).filter(isFinite);
          console.log('[GPA-PCA] allPc1=', allPc1, 'allPc2=', allPc2);
          if (allPc1.length < 2) {
            pcaCtx.fillStyle = '#718096'; pcaCtx.font = '11px sans-serif';
            pcaCtx.fillText('Variación insuf. para PCA', 20, H2 / 2);
          } else {
            const pc1min = Math.min(...allPc1), pc1max = Math.max(...allPc1);
            const pc2min = Math.min(...allPc2.length ? allPc2 : [0]);
            const pc2max = Math.max(...allPc2.length ? allPc2 : [0]);
            const pc1r = (pc1max - pc1min) || 1, pc2r = (pc2max - pc2min) || 1;
            const usableW = W2 - 2 * pad, usableH = H2 - 2 * pad;
            const toXY = (pc1, pc2) => ({
              x: pad + ((isFinite(pc1) ? (pc1 - pc1min) / pc1r : 0.5) * 0.7 + 0.15) * usableW,
              y: H2 - pad - ((isFinite(pc2) ? (pc2 - pc2min) / pc2r : 0.5) * 0.7 + 0.15) * usableH
            });
            // Grid
            pcaCtx.strokeStyle = '#e2e8f0'; pcaCtx.lineWidth = 0.5;
            for (let g = pad; g <= W2 - pad + 1; g += usableW / 4) {
              pcaCtx.beginPath(); pcaCtx.moveTo(g, pad); pcaCtx.lineTo(g, H2 - pad); pcaCtx.stroke();
            }
            for (let g = pad; g <= H2 - pad + 1; g += usableH / 4) {
              pcaCtx.beginPath(); pcaCtx.moveTo(pad, g); pcaCtx.lineTo(W2 - pad, g); pcaCtx.stroke();
            }
            // Ejes en el centro del scatter
            const cx0 = pad + usableW * 0.5, cy0 = H2 - pad - usableH * 0.5;
            pcaCtx.strokeStyle = '#cbd5e0'; pcaCtx.lineWidth = 1;
            pcaCtx.beginPath(); pcaCtx.moveTo(pad, cy0); pcaCtx.lineTo(W2 - pad, cy0); pcaCtx.stroke();
            pcaCtx.beginPath(); pcaCtx.moveTo(cx0, pad); pcaCtx.lineTo(cx0, H2 - pad); pcaCtx.stroke();
            // Puntos de cada objeto
            for (let i = 0; i < n; i++) {
              const sc = shapePCA.scores[i];
              if (!sc) continue;
              const {x, y} = toXY(sc.pc1, sc.pc2);
              pcaCtx.fillStyle = PALETA[i % PALETA.length];
              pcaCtx.strokeStyle = '#fff'; pcaCtx.lineWidth = 1.5;
              pcaCtx.beginPath(); pcaCtx.arc(x, y, 7.5, 0, Math.PI * 2); pcaCtx.fill(); pcaCtx.stroke();
              pcaCtx.fillStyle = '#1a202c'; pcaCtx.font = 'bold 9px sans-serif';
              pcaCtx.fillText(conPuntos[i].nombre.substring(0, 14), x + 10, y + 4);
            }
            // Etiquetas de ejes
            const ve0 = (shapePCA.varExpl[0] * 100).toFixed(1);
            const ve1 = (shapePCA.varExpl[1] * 100).toFixed(1);
            pcaCtx.fillStyle = '#4a5568'; pcaCtx.font = '9px sans-serif';
            pcaCtx.fillText(`PC1 (${ve0}%)`, W2 - pad - 52, H2 - 5);
            pcaCtx.save(); pcaCtx.translate(10, H2 / 2 + 28); pcaCtx.rotate(-Math.PI / 2);
            pcaCtx.fillText(`PC2 (${ve1}%)`, 0, 0);
            pcaCtx.restore();
            console.log(`✅ [GPA-PCA] Renderizado OK — PC1 (${ve0}%), PC2 (${ve1}%)`);
          }
        }
      } catch (errPCA) {
        console.error('❌ [GPA-PCA] Error al renderizar PCA:', errPCA.message, errPCA.stack);
      }

      // ── Alometría scatter — try/catch independiente ─────────────────────
      try {
        const allomC = $('psGPAAllomCanvas');
        if (allomC && allometry) {
          const ax = allomC.getContext('2d');
          const W = 300, H = 180, px = 42, py = 22;
          ax.clearRect(0, 0, W, H);
          ax.fillStyle = '#f8fafc'; ax.fillRect(0, 0, W, H);
          const usW = W - px - 16, usH = H - py - 28;
          const lcsMin = Math.min(...allometry.logCS), lcsMax = Math.max(...allometry.logCS);
          const rsMin  = Math.min(...allometry.regScores), rsMax = Math.max(...allometry.regScores);
          const lcsR   = (lcsMax - lcsMin) || 1, rsR = (rsMax - rsMin) || 1;
          const margin = 0.12;
          const toX = lcs => px + ((lcs - lcsMin) / lcsR * (1 - 2*margin) + margin) * usW;
          const toY = rs  => py + usH - ((rs  - rsMin) / rsR  * (1 - 2*margin) + margin) * usH;
          // Grid
          ax.strokeStyle = '#e2e8f0'; ax.lineWidth = 0.5;
          for (let g = 0; g <= 4; g++) {
            const xg = px + g * usW / 4, yg = py + g * usH / 4;
            ax.beginPath(); ax.moveTo(xg, py); ax.lineTo(xg, py + usH); ax.stroke();
            ax.beginPath(); ax.moveTo(px, yg); ax.lineTo(px + usW, yg); ax.stroke();
          }
          // Ejes
          ax.strokeStyle = '#94a3b8'; ax.lineWidth = 1;
          ax.beginPath(); ax.moveTo(px, py); ax.lineTo(px, py + usH); ax.lineTo(px + usW, py + usH); ax.stroke();
          // Línea de regresión: y = b1norm * logCSc_i → en coords canvas
          // logCSc = logCS - meanLCS → puntos at (toX(lcsMin), toY(-b1norm*(lcsMin-meanLCS))) etc
          const xL0 = lcsMin, xL1 = lcsMax;
          const yL0 = allometry.b1norm * (xL0 - allometry.meanLCS);
          const yL1 = allometry.b1norm * (xL1 - allometry.meanLCS);
          ax.strokeStyle = '#64748b'; ax.lineWidth = 1.5; ax.setLineDash([4, 3]);
          ax.beginPath(); ax.moveTo(toX(xL0), toY(yL0)); ax.lineTo(toX(xL1), toY(yL1)); ax.stroke();
          ax.setLineDash([]);
          // Puntos
          for (let i = 0; i < n; i++) {
            const x = toX(allometry.logCS[i]), y = toY(allometry.regScores[i]);
            ax.fillStyle = PALETA[i % PALETA.length];
            ax.strokeStyle = '#fff'; ax.lineWidth = 1.2;
            ax.beginPath(); ax.arc(x, y, 6, 0, Math.PI * 2); ax.fill(); ax.stroke();
            ax.fillStyle = '#1e293b'; ax.font = 'bold 8px sans-serif';
            ax.fillText(conPuntos[i].nombre.substring(0, 10), x + 7, y + 3);
          }
          // Etiquetas de ejes
          ax.fillStyle = '#64748b'; ax.font = '9px sans-serif';
          ax.fillText('log(CS)', px + usW / 2 - 16, H - 4);
          ax.save(); ax.translate(10, py + usH / 2 + 20); ax.rotate(-Math.PI / 2);
          ax.fillText('Score alométrico', 0, 0); ax.restore();
          // R² anotación
          const sigColor = allometry.pval < 0.05 ? '#15803d' : '#b91c1c';
          ax.fillStyle = sigColor; ax.font = 'bold 9px sans-serif';
          ax.fillText(`R²=${allometry.Rsq.toFixed(3)} p=${allometry.pval < 0.001 ? '<0.001' : allometry.pval.toFixed(3)} ${allomSig}`, px + 4, py + 12);
        }
      } catch (errAllom) {
        console.error('❌ [GPA-Allom] Error al renderizar alometría:', errAllom.message);
      }

      // Zoom + pan en todos los canvas
      const _gpaC   = $('psGPACanvas');
      const _defC   = $('psDeformCanvas');
      const _pcaC2  = $('psGPAPCACanvas');
      const _allomC2= $('psGPAAllomCanvas');
      if (_gpaC    && window.attachCanvasZoom) window.attachCanvasZoom(_gpaC);
      if (_defC    && window.attachCanvasZoom) window.attachCanvasZoom(_defC);
      if (_pcaC2   && window.attachCanvasZoom) window.attachCanvasZoom(_pcaC2);
      if (_allomC2 && window.attachCanvasZoom) window.attachCanvasZoom(_allomC2);

      // Redibujar con lineWidth compensado cada vez que cambia el zoom
      let _gpaZoomRq = null;
      const _scheduleGPARedraw = () => {
        if (_gpaZoomRq) return;
        _gpaZoomRq = requestAnimationFrame(() => {
          _gpaZoomRq = null;
          _redrawGPA();
        });
      };
      _gpaC?.addEventListener('canvaszoomchange', _scheduleGPARedraw);
      _defC?.addEventListener('canvaszoomchange', _scheduleGPARedraw);

      // Helper descargar canvas como PNG (busca viewport o parent)
      const _addPNG = (canv, fname, title) => {
        const wrap = canv?.closest('.ps-canvas-viewport') || canv?.closest('.ps-canvas-wrap') || canv?.parentElement;
        if (wrap && canv && !wrap.querySelector('.cmo-export-png-btn')) {
          const b = document.createElement('button');
          b.className = 'cmo-export-png-btn';
          b.title = title;
          b.textContent = '📸 PNG';
          b.addEventListener('click', () => {
            const link = document.createElement('a');
            link.href = canv.toDataURL('image/png');
            link.download = fname + '_' + new Date().toISOString().slice(0,10) + '.png';
            link.click();
          });
          wrap.appendChild(b);
        }
      };
      _addPNG(_gpaC,   'APS_GPA_Formas',      'Guardar formas GPA como PNG');
      _addPNG(_defC,   'APS_GPA_Deformacion',  'Guardar dispersión de landmarks como PNG');
      _addPNG(_pcaC2,  'APS_GPA_PCA_Formas',   'Guardar PCA de formas como PNG');
      _addPNG(_allomC2,'APS_GPA_Alometria',     'Guardar scatter alometría como PNG');

      // ── Helper CSV: convierte lista de filas en descarga .csv ────────────
      const _downloadCSV = (rows, fname) => {
        const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fname + '_' + new Date().toISOString().slice(0,10) + '.csv';
        a.click(); URL.revokeObjectURL(url);
      };

      // CSV Ranking
      const _rankBtn = $('psGPARankCsvBtn');
      if (_rankBtn) {
        _rankBtn.addEventListener('click', () => {
          const rows = [['Rank','Objeto','rho','CS_px','E_flex']];
          ranking.forEach((r, rank) => {
            rows.push([rank+1, conPuntos[r.i].nombre, r.d.toFixed(6),
                       csAll[r.i].toFixed(2), bendingE[r.i].toFixed(6)]);
          });
          _downloadCSV(rows, 'APS_GPA_Ranking');
        });
      }

      // CSV Estadísticas GMM (varProcrustes + allometría + D² + PCA scores)
      const _gmmCsvBtn = $('psGPAGmmCsvBtn');
      if (_gmmCsvBtn) {
        _gmmCsvBtn.addEventListener('click', () => {
          const rows = [];
          rows.push(['# APS GPA — Estadísticas GMM']);
          rows.push(['Métrica', 'Valor']);
          rows.push(['V_Procrustes', procVar.toFixed(8)]);
          rows.push(['rho_media',    meanRho.toFixed(6)]);
          rows.push(['rho_min',      Math.min(...dists).toFixed(6)]);
          rows.push(['rho_max',      Math.max(...dists).toFixed(6)]);
          rows.push(['E_flex_media', (bendingE.reduce((s,e)=>s+e,0)/n).toFixed(6)]);
          if (allometry) {
            rows.push(['Allom_R2',     allometry.Rsq.toFixed(6)]);
            rows.push(['Allom_pval',   allometry.pval.toFixed(4)]);
            rows.push(['Allom_interp', allomInterpret]);
          }
          if (mahaD2) {
            rows.push(['D2_Mahalanobis',  mahaD2.D2.toFixed(6)]);
            rows.push(['T2_Hotelling',    mahaD2.T2.toFixed(6)]);
            rows.push(['Pillai_MANOVA',   mahaD2.pillai.toFixed(6)]);
            rows.push(['MANOVA_pval',     mahaD2.pval.toFixed(4)]);
            rows.push(['MANOVA_r_PCs',    mahaD2.actualR]);
          }
          rows.push([]);
          rows.push(['# Scores PCA por objeto']);
          rows.push(['Objeto', 'PC1', 'PC2', 'rho', 'CS_px', 'E_flex', 'logCS']);
          conPuntos.forEach((obj, i) => {
            const sc = shapePCA?.scores[i];
            rows.push([obj.nombre,
                       sc ? sc.pc1.toFixed(6) : '',
                       sc ? sc.pc2.toFixed(6) : '',
                       dists[i].toFixed(6), csAll[i].toFixed(2),
                       bendingE[i].toFixed(6),
                       allometry ? allometry.logCS[i].toFixed(6) : '']);
          });
          if (allometry) {
            rows.push([]);
            rows.push(['# Scores alométricos por objeto']);
            rows.push(['Objeto', 'logCS', 'logCS_centrado', 'score_alometrico']);
            conPuntos.forEach((obj, i) => {
              rows.push([obj.nombre,
                         allometry.logCS[i].toFixed(6),
                         allometry.logCSc[i].toFixed(6),
                         allometry.regScores[i].toFixed(6)]);
            });
          }
          _downloadCSV(rows, 'APS_GPA_GMM_Stats');
        });
      }

      // ── Event listeners del panel de alineación GPA ──────────────────────
      // La función de redibujado invoca de nuevo toda la lógica del rAF:
      // sencillo y seguro porque las variables aligned/consensus son closures.
      const _redrawGPA = () => {
        // Re-ejecutar el bloque de canvas para ambos canvas
        const _gpaCv = $('psGPACanvas');
        if (!_gpaCv) return;
        const _gpaCtx = _gpaCv.getContext('2d');
        const _gpaZoom = getCanvasZoomScale(_gpaCv);
        const _zlw = (w, min = 0.35, max = 6) => zoomCompensatedLineWidth(w, _gpaZoom, min, max);
        _gpaCtx.clearRect(0,0,560,560);
        _gpaCtx.fillStyle = '#f7fafc'; _gpaCtx.fillRect(0,0,560,560);
        _gpaCtx.strokeStyle = '#e2e8f0'; _gpaCtx.lineWidth = _zlw(0.5, 0.22, 2.2);
        for (let g = 0; g <= 560; g += 70) {
          _gpaCtx.beginPath(); _gpaCtx.moveTo(g,0); _gpaCtx.lineTo(g,560); _gpaCtx.stroke();
          _gpaCtx.beginPath(); _gpaCtx.moveTo(0,g); _gpaCtx.lineTo(560,g); _gpaCtx.stroke();
        }
        _gpaCtx.strokeStyle = '#cbd5e0'; _gpaCtx.lineWidth = _zlw(1, 0.3, 2.8);
        _gpaCtx.beginPath(); _gpaCtx.moveTo(CX,CY-CR); _gpaCtx.lineTo(CX,CY+CR); _gpaCtx.stroke();
        _gpaCtx.beginPath(); _gpaCtx.moveTo(CX-CR,CY); _gpaCtx.lineTo(CX+CR,CY); _gpaCtx.stroke();
        const _rotGPAr = (pts, rad) => {
          if (!pts || !pts.length || !rad) return pts;
          const cos = Math.cos(rad), sin = Math.sin(rad);
          return pts.map(p => { const dx=p.x-CX,dy=p.y-CY; return {x:CX+dx*cos-dy*sin,y:CY+dx*sin+dy*cos}; });
        };
        const _flipGPAr = pts => pts.map(p => ({x: 2*CX-p.x, y: p.y}));
        const _applyTr  = (cp, idx) => {
          let r = cp;
          if (_gpaManualRot.has(idx))  r = _rotGPAr(r, _gpaManualRot.get(idx));
          if (_gpaManualFlip.has(idx)) r = _flipGPAr(r);
          return r;
        };
        const _leyEl = $('psGPALeyenda');
        let _leyHtml = '';
        for (let i = 0; i < n; i++) {
          if (!aligned[i] || aligned[i].length === 0) continue;
          const cv = _applyTr(toCanvas(aligned[i], CR * 0.95), i);
          if (!_gpaHiddenSet.has(i)) drawShape(_gpaCtx, cv, PALETA[i%PALETA.length], _zlw(1.5, 0.45, 3.6), true, 0.08);
          _leyHtml += _gpaLeyItem(i, conPuntos[i].nombre, _bFaceIndicesGPA.has(i) ? '<span style="font-size:10px;opacity:.8">🪞</span>' : '');
        }
        const _csCanv = toCanvas(consensus, CR * 0.95);
        drawShape(_gpaCtx, _csCanv, '#000', _zlw(2.5, 0.6, 5), false);
        drawShape(_gpaCtx, _csCanv, '#fff', _zlw(1.0, 0.3, 2.8), false);
        _leyHtml += '<span class="ps-ley-item"><span class="ps-ley-dot" style="background:#000;border:1px solid #999"></span><em>Consensus</em></span>';
        if (_leyEl) {
          _leyEl.innerHTML = _leyHtml;
          _leyEl.querySelectorAll('.ps-ley-toggle').forEach(el => {
            el.addEventListener('click', () => {
              const idx = parseInt(el.dataset.gpaIdx, 10);
              if (_gpaHiddenSet.has(idx)) _gpaHiddenSet.delete(idx); else _gpaHiddenSet.add(idx);
              requestAnimationFrame(_redrawGPA);
            });
          });
        }

        // Dispersión de landmarks
        const _dcv = $('psDeformCanvas');
        if (_dcv) {
          const _dctx = _dcv.getContext('2d');
          const _dZoom = getCanvasZoomScale(_dcv);
          const _dzlw = (w, min = 0.3, max = 4) => zoomCompensatedLineWidth(w, _dZoom, min, max);
          _dctx.clearRect(0,0,340,340);
          _dctx.fillStyle = '#f7fafc'; _dctx.fillRect(0,0,340,340);
          _dctx.strokeStyle = '#e2e8f0'; _dctx.lineWidth = _dzlw(0.5, 0.2, 1.8);
          for (let g = 0; g <= 340; g += 40) {
            _dctx.beginPath(); _dctx.moveTo(g,0); _dctx.lineTo(g,340); _dctx.stroke();
            _dctx.beginPath(); _dctx.moveTo(0,g); _dctx.lineTo(340,g); _dctx.stroke();
          }
          const _DCX=170,_DCY=170,_sc=142;
          for (let i = 0; i < n; i++) {
            if (!aligned[i] || aligned[i].length === 0) continue;
            const _aCanv = _applyTr(aligned[i].map(p =>({x:_DCX+p.x*_sc,y:_DCY-p.y*_sc})), i);
            _dctx.strokeStyle = PALETA[i%PALETA.length] + '80'; _dctx.lineWidth = _dzlw(0.8, 0.25, 2.2);
            for (let k = 0; k < N_PUNTOS; k++) {
              _dctx.beginPath();
              _dctx.moveTo(_DCX+consensus[k].x*_sc, _DCY-consensus[k].y*_sc);
              _dctx.lineTo(_aCanv[k].x, _aCanv[k].y);
              _dctx.stroke();
            }
          }
          // Consensus: dots coloreados por varianza por landmark (heatmap)
          const _lmkVarMaxR = Math.max(...lmkVar, 1e-10);
          for (let k = 0; k < N_PUNTOS; k++) {
            const tc_ = lmkVar[k] / _lmkVarMaxR;
            const rr_ = Math.round(tc_ * 220), bb_ = Math.round((1 - tc_) * 220);
            _dctx.fillStyle = `rgb(${rr_},50,${bb_})`;
            _dctx.beginPath(); _dctx.arc(_DCX+consensus[k].x*_sc,_DCY-consensus[k].y*_sc,_dzlw(3.5,1.2,5),0,Math.PI*2); _dctx.fill();
          }
          for (let i = 0; i < n; i++) {
            _dctx.fillStyle = PALETA[i%PALETA.length];
            const _aCanv = _applyTr(aligned[i].map(p =>({x:_DCX+p.x*_sc,y:_DCY-p.y*_sc})), i);
            for (const p of _aCanv) { _dctx.beginPath(); _dctx.arc(p.x,p.y,_dzlw(2,0.9,3.2),0,Math.PI*2); _dctx.fill(); }
          }
        }
      };

      (function iniciarPanelGPA() {
        const btnApply = $('psGPAAlignApply');
        const btnReset = $('psGPAAlignReset');
        const btnFlip  = $('psGPAAlignFlip');
        const selObj_  = $('psGPAAlignObjSel');
        const inputAng = $('psGPAAlignAngle');
        const statusEl = $('psGPAAlignStatus');
        if (!btnApply || !selObj_ || !inputAng) return;

        const resolveIdxList = () => {
          const v = selObj_.value;
          if (v === '__all__') return conPuntos.map((_, i) => i);
          const nn = parseInt(v, 10);
          return isNaN(nn) ? [] : [nn];
        };
        const setStatus = msg => { if (statusEl) statusEl.textContent = msg; };

        btnApply.addEventListener('click', () => {
          const deg = parseFloat(inputAng.value);
          if (!isFinite(deg)) { setStatus('Ángulo inválido'); return; }
          const rad = deg * Math.PI / 180;
          const idxs = resolveIdxList();
          idxs.forEach(idx => {
            const prev = _gpaManualRot.get(idx) || 0;
            const total = prev + rad;
            if (Math.abs(total) < 1e-6) _gpaManualRot.delete(idx);
            else _gpaManualRot.set(idx, total);
          });
          setStatus(idxs.length === 1
            ? `+${deg}° → ${((_gpaManualRot.get(idxs[0]) || 0) * 180 / Math.PI).toFixed(1)}° total`
            : `+${deg}° → ${idxs.length} objetos`);
          requestAnimationFrame(_redrawGPA);
        });

        btnReset.addEventListener('click', () => {
          const idxs = resolveIdxList();
          idxs.forEach(idx => { _gpaManualRot.delete(idx); _gpaManualFlip.delete(idx); });
          if (inputAng) inputAng.value = 0;
          setStatus(idxs.length === 1 ? 'Objeto reseteado' : 'Todos reseteados');
          requestAnimationFrame(_redrawGPA);
        });

        btnFlip.addEventListener('click', () => {
          const idxs = resolveIdxList();
          idxs.forEach(idx => {
            if (_gpaManualFlip.has(idx)) _gpaManualFlip.delete(idx);
            else _gpaManualFlip.add(idx);
          });
          setStatus(idxs.length === 1
            ? (_gpaManualFlip.has(idxs[0]) ? 'Reflejo activo' : 'Reflejo removido')
            : `Flip toggle (${idxs.length} obj)`);
          requestAnimationFrame(_redrawGPA);
        });
      })();
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  EJECUCIÓN PRINCIPAL CON PROGRESO
  // ──────────────────────────────────────────────────────────────────────────

  function ejecutar() {
    const selObj = _objetos.filter(o => _selIds.has(String(o.id)));
    const n = selObj.length;
    if (n < 2) return;

    // ── Limpiar resultados del análisis anterior ─────────────────────────────
    // Vaciar contenedores para que el DOM no acumule canvas viejos con
    // _zoomAttached=true ni barras de zoom/PNG duplicadas.
    const _limpiarContenedor = id => {
      const el = $(id);
      if (el) el.innerHTML = '';
    };
    _limpiarContenedor('psParcialContenido');
    _limpiarContenedor('psGPAContenido');
    // Resetear toggle de reflexión en cada ejecución nueva
    _forceReflectionToggle = false;

    // Clasificar para personalizar los pasos
    const clsf = clasificarSeleccion(selObj.filter(o => getPuntos(o) !== null));
    const conGPA = selObj.filter(o => getPuntos(o) !== null).length >= 3;

    const pasos = [
      { id: 'prep',     title: 'Preparando configuraciones',
        detail: `${n} objeto${n !== 1 ? 's' : ''} seleccionado${n !== 1 ? 's' : ''}` },
      { id: 'winding',  title: 'Normalización de sentido (winding)',
        detail: 'Unificando orientación de contornos A ↔ B' },
      { id: 'resample', title: 'Remuestreo por arco',
        detail: `${N_PUNTOS} semi-landmarks por contorno` },
      { id: 'parcial',  title: clsf.modo === 'especular'
          ? 'Calculando simetría bilateral (PS Parcial)'
          : 'Calculando distancias Procrustes (PS Parcial)',
        detail: `${Math.round(n*(n-1)/2)} par${n*(n-1)/2 !== 1 ? 'es' : ''} a comparar` },
      ...(conGPA ? [{ id: 'gpa', title: 'Análisis GPA — consensus iterativo',
        detail: `Convergencia Δss < 10⁻¹⁰ · máx. 30 iteraciones` }] : []),
      { id: 'render',   title: 'Generando visualización',
        detail: 'Canvas, matrices y gráficos' },
    ];

    const tiempoEst = 2 + Math.ceil(n * n * 0.12) + (conGPA ? 3 : 0);

    // ── Verificar disponibilidad del sistema de progreso ────────────────────
    const hasProgress = typeof startDetailedProgress === 'function' &&
                        typeof updateDetailedProgress === 'function' &&
                        typeof endDetailedProgress    === 'function';

    if (hasProgress) startDetailedProgress('Análisis Procrustes (PS)', pasos, tiempoEst);

    const tick = (id, detail) => {
      if (hasProgress && typeof isProgressCancelled === 'function' && isProgressCancelled()) {
        throw new Error('cancelled');
      }
      if (hasProgress) updateDetailedProgress(id, detail || undefined);
    };

    // Usar setTimeout para ceder el hilo y permitir que el overlay se pinte
    setTimeout(() => {
      try {
        tick('prep');

        setTimeout(() => {
          try {
            tick('winding');

            setTimeout(() => {
              try {
                tick('resample');

                setTimeout(() => {
                  try {
                    tick('parcial', `Procesando ${Math.round(n*(n-1)/2)} pares…`);
                    ejecutarParcial(selObj);

                    if (hasProgress && typeof completeCurrentStep === 'function') completeCurrentStep();

                    // GPA paso (puede tardar más con N grande)
                    const doGPA = () => {
                      try {
                        if (conGPA) {
                          tick('gpa', `${selObj.filter(o=>getPuntos(o)!==null).length} objetos → iterando…`);
                          ejecutarGPA(selObj);
                          if (hasProgress && typeof completeCurrentStep === 'function') completeCurrentStep();
                        }

                        // Render / navegación
                        setTimeout(() => {
                          try {
                            tick('render');
                            console.log('🔍 [ejecutar] Mostrando paso 2...');
                            const step1 = $('psStep1Panel');
                            const step2 = $('psStep2Panel');
                            console.log('🔍 [ejecutar] step1 existe:', !!step1, 'step2 existe:', !!step2);
                            if (step1) {
                              step1.style.display = 'none';
                              console.log('🔍 [ejecutar] step1.style.display cambió a none');
                            }
                            if (step2) {
                              step2.style.display = 'block';
                              console.log('🔍 [ejecutar] step2.style.display cambió a block');
                              console.log('🔍 [ejecutar] psStep2Panel visible - children:', step2.children.length);
                            }
                            actualizarStepper(2);
                            switchTab(_tabActiva);

                            if (hasProgress) {
                              endDetailedProgress(true,
                                clsf.modo === 'especular'
                                  ? `Simetría bilateral calculada — ${n} objetos analizados`
                                  : `Análisis PS completado — ${n} objetos`
                              );
                            }
                          } catch(e) {
                            if (e.message !== 'cancelled' && hasProgress)
                              endDetailedProgress(false, 'Error al renderizar resultados');
                          }
                        }, 80);

                      } catch(e) {
                        if (e.message !== 'cancelled' && hasProgress)
                          endDetailedProgress(false, 'Error en GPA');
                      }
                    };

                    // Pequeña pausa antes del GPA para que la barra se actualice
                    setTimeout(doGPA, 60);

                  } catch(e) {
                    if (e.message !== 'cancelled' && hasProgress)
                      endDetailedProgress(false, 'Error en PS Parcial');
                  }
                }, 60);
              } catch(e) {
                if (e.message !== 'cancelled' && hasProgress)
                  endDetailedProgress(false, 'Error en remuestreo');
              }
            }, 60);
          } catch(e) {
            if (e.message !== 'cancelled' && hasProgress)
              endDetailedProgress(false, 'Error en normalización');
          }
        }, 60);
      } catch(e) {
        if (e.message !== 'cancelled' && hasProgress)
          endDetailedProgress(false, 'Error al preparar el análisis');
      }
    }, 80);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  TABS
  // ──────────────────────────────────────────────────────────────────────────

  function switchTab(tab) {
    console.log('🔍 [switchTab] Cambiando a tab:', tab);
    _tabActiva = tab;
    
    const btnElements = document.querySelectorAll('.ps-tab-btn');
    const paneElements = document.querySelectorAll('.ps-tab-pane');
    
    console.log('🔍 [switchTab] Encontrados', btnElements.length, 'botones de tab');
    console.log('🔍 [switchTab] Encontrados', paneElements.length, 'panes de tab');
    
    btnElements.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    paneElements.forEach(p => {
      const shouldBeActive = p.id === `psTab_${tab}`;
      p.classList.toggle('active', shouldBeActive);
      console.log('🔍 [switchTab] psTab_' + tab + ' -> active =', shouldBeActive, '| display:', window.getComputedStyle(p).display);
    });
  }

  function bindTabs() {
    document.querySelectorAll('.ps-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  STEPPER VISUAL
  // ──────────────────────────────────────────────────────────────────────────

  function actualizarStepper(paso) {
    const s1 = $('psStep1');
    const s2 = $('psStep2');
    if (!s1 || !s2) return;
    s1.classList.toggle('active', paso === 1);
    s1.classList.toggle('done',   paso > 1);
    s2.classList.toggle('active', paso === 2);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  APERTURA DEL MODAL
  // ──────────────────────────────────────────────────────────────────────────

  async function abrir() {
    const modal = $('psModal');
    if (!modal) return;

    // Resetear estado visual y toggle de reflexión
    _forceReflectionToggle = false;
    const step1 = $('psStep1Panel');
    const step2 = $('psStep2Panel');
    if (step1) step1.style.display = 'block';
    if (step2) step2.style.display = 'none';
    actualizarStepper(1);

    const btnEj = $('psEjecutarBtn');
    if (btnEj) { btnEj.disabled = true; btnEj.textContent = 'Cargando…'; }

    // Mostrar modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Cargar objetos
    const ok = await cargar();
    if (ok) {
      renderObjetos();
      actualizarContador();
      if (btnEj) { btnEj.disabled = _selIds.size < 2; btnEj.textContent = 'Ejecutar Análisis PS'; }
    } else {
      if (btnEj) { btnEj.textContent = 'Sin datos'; }
    }
  }

  function cerrar() {
    const modal = $('psModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
    
    // Refresh geometry canvas to show current analysis (not PS results)
    if (typeof renderGeometryCanvas === 'function' && window.currentGeometryData) {
      renderGeometryCanvas(window.currentGeometryData);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  MEJORA 11: EXPORTACIÓN A CSV Y JSON
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Genera matriz de rotación desde ángulo (radianes)
   * @param {number} angle - ángulo en radianes
   * @returns {Array<Array<number>>} matriz 2x2
   */
  function generarMatrizRotacion(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [[c, -s], [s, c]];
  }

  /**
   * Exporta resultados a JSON con metadata y matriz de rotación
   * @param {Array} resultados - array de {i, j, dist, csA, csB, validation}
   * @param {string} modo - 'especular', 'comparacion', etc
   * @param {Array} conPuntos - objetos analizados
   * @returns {Object} estructura JSON exportable
   */
  function exportarJSON(resultados, modo, conPuntos) {
    const ahora = new Date().toISOString();
    const apsSnap = window._lastAPS;
    const json = {
      metadata: {
        version: "2.1.0",
        timestamp: ahora,
        modo: modo,
        N_landmarks: N_PUNTOS,
        total_pares: resultados.length,
        efaDisponible: apsSnap?.efaDisponible ?? false,
        usuario: "",
        software: "MAO PLUS — Procrustes Shape Analysis"
      },
      resultados: resultados.map(r => {
        const objA = conPuntos[r.i];
        const objB = conPuntos[r.j];
        const rotacionGrados = (r.dist * 180) / Math.PI;
        const isb = Math.max(0, (1 - r.dist / (Math.PI / 2)) * 100);
        const snap = apsSnap?.parcial?.find(p => p.i === r.i && p.j === r.j);
        
        return {
          objA_nombre: objA?.nombre || `Objeto_${r.i}`,
          objB_nombre: objB?.nombre || `Objeto_${r.j}`,
          objA_indice: r.i,
          objB_indice: r.j,
          rho_radianes: r.dist.toFixed(6),
          rho_grados: rotacionGrados.toFixed(2),
          ISB_porcentaje: isb.toFixed(2),
          CS_A: r.csA.toFixed(6),
          CS_B: r.csB.toFixed(6),
          dEFA: snap?.dEFA !== null && snap?.dEFA !== undefined ? Number(snap.dEFA).toFixed(6) : null,
          rhoEFA_radianes: snap?.rhoEFA !== null && snap?.rhoEFA !== undefined ? Number(snap.rhoEFA).toFixed(6) : null,
          simCombinada_porcentaje: snap?.simCombinada !== null && snap?.simCombinada !== undefined ? Number(snap.simCombinada).toFixed(2) : null,
          efa_fuente: snap?.dEFA !== null ? 'backend_python' : 'no_disponible',
          validation_score: r.validation?.score || null,
          validation_interpretacion: r.validation?.interpretacion || null,
          validation_flags: r.validation?.flags || []
        };
      }),
      // Datos EFA por objeto (coeficientes + contorno) para reutilización en MAO_A
      objetos: apsSnap?.objetos?.map(o => ({
        nombre: o.nombre,
        cara: o.cara,
        id: o.id,
        efaCoeficientes: o.efaCoeficientes ?? null,
        efaVarianza95: o.efaVarianza95 ?? null,
        efaContornoReconstruido: o.efaContornoReconstruido ?? null
      })) ?? []
    };
    return json;
  }

  /**
   * Genera tabla CSV desde resultados
   * @param {Array} resultados - array de {i, j, dist, csA, csB, validation}
   * @param {Array} conPuntos - objetos analizados
   * @returns {string} CSV con headers y datos
   */
  function exportarCSV(resultados, conPuntos) {
    const apsSnap = window._lastAPS;
    const headers = [
      'objA_nombre',
      'objB_nombre',
      'rho_radianes',
      'rho_grados',
      'ISB_porcentaje',
      'CS_A',
      'CS_B',
      'dEFA',
      'rhoEFA_radianes',
      'simCombinada_porcentaje',
      'efa_fuente',
      'validation_score',
      'validation_interpretacion'
    ];
    
    const rows = resultados.map(r => {
      const objA = conPuntos[r.i];
      const objB = conPuntos[r.j];
      const rotacionGrados = (r.dist * 180) / Math.PI;
      const isb = Math.max(0, (1 - r.dist / (Math.PI / 2)) * 100);
      const snap = apsSnap?.parcial?.find(p => p.i === r.i && p.j === r.j);
      
      return [
        objA?.nombre || `Objeto_${r.i}`,
        objB?.nombre || `Objeto_${r.j}`,
        r.dist.toFixed(6),
        rotacionGrados.toFixed(2),
        isb.toFixed(2),
        r.csA.toFixed(6),
        r.csB.toFixed(6),
        snap?.dEFA !== null && snap?.dEFA !== undefined ? Number(snap.dEFA).toFixed(6) : '',
        snap?.rhoEFA !== null && snap?.rhoEFA !== undefined ? Number(snap.rhoEFA).toFixed(6) : '',
        snap?.simCombinada !== null && snap?.simCombinada !== undefined ? Number(snap.simCombinada).toFixed(2) : '',
        snap?.dEFA !== null && snap?.dEFA !== undefined ? 'backend_python' : 'no_disponible',
        r.validation?.score || '',
        r.validation?.interpretacion || ''
      ];
    });
    
    // Escapar comillas en valores
    const escapaCSV = (val) => {
      if (val === undefined || val === null) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    
    const csv = [
      headers.join(','),
      ...rows.map(r => r.map(escapaCSV).join(','))
    ].join('\n');
    
    return csv;
  }

  /**
   * Descarga archivo desde el navegador
   * @param {string} contenido - contenido del archivo
   * @param {string} nombreArchivo - nombre del archivo
   * @param {string} tipo - MIME type (text/csv, application/json)
   */
  function descargarArchivo(contenido, nombreArchivo, tipo) {
    const blob = new Blob([contenido], { type: tipo + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nombreArchivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Botones de exportación en la UI
   */
  function agregarBotonesExportacion() {
    // Buscar el contenedor de stats (puede ser por clase o ID)
    let statsCol = $('psStatsDiv');
    if (!statsCol) {
      statsCol = document.querySelector('.ps-stats-col');
    }
    if (!statsCol) return;
    
    // Verificar si ya existen botones (para no duplicarlos)
    if (statsCol.querySelector('.ps-export-buttons')) return;
    
    // Crear contenedor de botones
    const btnContainer = document.createElement('div');
    btnContainer.className = 'ps-export-buttons';
    btnContainer.style.cssText = 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;';
    
    // Botón exportar CSV
    const btnCSV = document.createElement('button');
    btnCSV.textContent = '📊 Exportar CSV';
    btnCSV.style.cssText = `
      background: #10b981;
      color: white;
      border: none;
      padding: 8px 14px;
      border-radius: 5px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    `;
    btnCSV.onmouseover = () => btnCSV.style.background = '#059669';
    btnCSV.onmouseout = () => btnCSV.style.background = '#10b981';
    btnCSV.onclick = () => {
      if (window._lastResultados) {
        const csv = exportarCSV(window._lastResultados, window._lastConPuntos);
        const timestamp = new Date().toISOString().slice(0,10);
        descargarArchivo(csv, `PS_Analisis_${timestamp}.csv`, 'text/csv');
        console.log('✅ CSV exportado correctamente');
      }
    };
    
    // Botón exportar JSON
    const btnJSON = document.createElement('button');
    btnJSON.textContent = '{ } Exportar JSON';
    btnJSON.style.cssText = `
      background: #3b82f6;
      color: white;
      border: none;
      padding: 8px 14px;
      border-radius: 5px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    `;
    btnJSON.onmouseover = () => btnJSON.style.background = '#2563eb';
    btnJSON.onmouseout = () => btnJSON.style.background = '#3b82f6';
    btnJSON.onclick = () => {
      if (window._lastResultados) {
        const json = exportarJSON(window._lastResultados, window._lastModo, window._lastConPuntos);
        const timestamp = new Date().toISOString().slice(0,10);
        descargarArchivo(JSON.stringify(json, null, 2), `PS_Analisis_${timestamp}.json`, 'application/json');
        console.log('✅ JSON exportado correctamente');
      }
    };
    
    btnContainer.appendChild(btnCSV);
    btnContainer.appendChild(btnJSON);
    statsCol.appendChild(btnContainer);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  INIT
  // ──────────────────────────────────────────────────────────────────────────

  function init() {
    const btnAbrir = $('abrirProcrustesBtn');
    if (btnAbrir) btnAbrir.addEventListener('click', abrir);

    const btnAbrir2 = $('sidebarAbrirProcrustesBtn');
    if (btnAbrir2) btnAbrir2.addEventListener('click', abrir);

    const btnCerrar = $('psCerrarBtn');
    if (btnCerrar) btnCerrar.addEventListener('click', cerrar);

    const modal = $('psModal');
    if (modal) {
      modal.addEventListener('click', e => {
        if (e.target === modal) cerrar();
      });
    }

    const btnEj = $('psEjecutarBtn');
    if (btnEj) btnEj.addEventListener('click', ejecutar);

    const btnVolver = $('psVolverBtn');
    if (btnVolver) btnVolver.addEventListener('click', () => {
      const step1 = $('psStep1Panel');
      const step2 = $('psStep2Panel');
      if (step1) step1.style.display = 'block';
      if (step2) step2.style.display = 'none';
      actualizarStepper(1);
      // Limpiar resultados para que el próximo ejecutar parta limpio
      const _lim = id => { const el = $(id); if (el) el.innerHTML = ''; };
      _lim('psParcialContenido');
      _lim('psGPAContenido');
      _forceReflectionToggle = false;
    });

    const btnSelTodos = $('psSelTodosBtn');
    if (btnSelTodos) btnSelTodos.addEventListener('click', () => {
      document.querySelectorAll('.ps-chk-obj').forEach(c => {
        c.checked = true; c.closest('label')?.classList.add('sel');
      });
      _selIds = new Set(_objetos.map(o => String(o.id)));
      actualizarContador();
    });

    const btnDesel = $('psDeselTodosBtn');
    if (btnDesel) btnDesel.addEventListener('click', () => {
      document.querySelectorAll('.ps-chk-obj').forEach(c => {
        c.checked = false; c.closest('label')?.classList.remove('sel');
      });
      _selIds.clear();
      actualizarContador();
    });

    bindTabs();
  }

  // Exponer init para llamarlo desde DOMContentLoaded
  return { init };

})();

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ProcrustesModule.init());
} else {
  ProcrustesModule.init();
}
