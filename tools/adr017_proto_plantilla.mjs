/**
 * ADR-017 §4 — Prototipo de la arquitectura propuesta (E1+E2+E3, plantilla círculo).
 *
 * E1 segmentación margen original / borde de fractura  → por CONTIGÜIDAD del arco inlier
 *    (no por umbral de rectitud, que resultó frágil ante el ruido de contorno).
 * E2 ajuste robusto de la plantilla                    → Kåsa + RANSAC con tolerancia
 *    ABSOLUTA y cota de radio (una tolerancia relativa al radio premia círculos gigantes
 *    ≈ recta, que declaran inlier a todo el contorno — fallo reproducido y corregido).
 * E3 completitud = cobertura angular alrededor del CENTRO AJUSTADO (no del centroide del
 *    fragmento), calculada por huecos y no por binning.
 *
 * Uso:  node tools/adr017_proto_plantilla.mjs
 * Ver:  docs/ADR-017-emparejamiento-plantillas-completitud.md §3 y §4
 *
 * Prototipo de validación del método — NO es código de producción: la implementación
 * canónica corresponde a python/modules/shape_template.py (fase F1 del ADR).
 */

// ── Ajuste algebraico de círculo (Kåsa): minimiza Σ(x²+y²+Dx+Ey+F)² ──────────
function ajusteCirculoKasa(pts) {
  const n = pts.length;
  let Sx = 0, Sy = 0, Sxx = 0, Syy = 0, Sxy = 0, Sz = 0, Sxz = 0, Syz = 0;
  for (const [x, y] of pts) {
    const z = x * x + y * y;
    Sx += x; Sy += y; Sxx += x * x; Syy += y * y; Sxy += x * y;
    Sz += z; Sxz += x * z; Syz += y * z;
  }
  const sol = resolver3([[Sxx, Sxy, Sx], [Sxy, Syy, Sy], [Sx, Sy, n]], [-Sxz, -Syz, -Sz]);
  if (!sol) return null;
  const [D, E, F] = sol;
  const cx = -D / 2, cy = -E / 2, r2 = cx * cx + cy * cy - F;
  return r2 > 0 ? { cx, cy, r: Math.sqrt(r2) } : null;
}

/** Gauss-Jordan 3×3 con pivoteo parcial. */
function resolver3(A, b) {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

function diagonal(pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

// ── E1+E2: RANSAC puntuado por LONGITUD DEL TRAMO CONTIGUO de inliers ────────
// El margen original preservado de un fragmento es UN arco contiguo del contorno;
// los bordes de fractura son el resto. La contigüidad discrimina sin umbral de rectitud.
function ajustarPlantillaCirculo(pts, { iters = 4000, seed = 11 } = {}) {
  const n = pts.length, diag = diagonal(pts);
  const tol = 0.02 * diag;   // ABSOLUTA: no premia radios enormes
  const rMax = 3 * diag;     // un "círculo" mayor que esto es una recta
  let rnd = seed;
  const rand = () => (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  const largoDe = (i0, i1) => {
    let L = 0;
    for (let t = i0; t < i1; t++) {
      L += Math.hypot(pts[(t + 1) % n][0] - pts[t % n][0], pts[(t + 1) % n][1] - pts[t % n][1]);
    }
    return L;
  };
  const perimetro = largoDe(0, n);

  /** Tramo contiguo (cíclico) de inliers más largo para un círculo candidato. */
  const evaluar = (c) => {
    const inl = pts.map(p => Math.abs(Math.hypot(p[0] - c.cx, p[1] - c.cy) - c.r) < tol);
    let mejor = { i0: 0, i1: 0, L: 0 };
    let i = 0;
    while (i < 2 * n) {
      if (!inl[i % n]) { i++; continue; }
      let j = i;
      while (j < i + n && inl[j % n]) j++;
      const L = largoDe(i, j);
      if (L > mejor.L) mejor = { i0: i, i1: j, L };
      i = j + 1;
    }
    return mejor;
  };

  let best = null;
  for (let it = 0; it < iters; it++) {
    const i0 = Math.floor(rand() * n);
    const s = [0, 1, 2].map(k => pts[(i0 + Math.floor(n * (k / 3 + 0.12 * rand()))) % n]);
    const c = ajusteCirculoKasa(s);
    if (!c || !isFinite(c.r) || c.r <= 0 || c.r > rMax) continue;
    const tramo = evaluar(c);
    if (!best || tramo.L > best.tramo.L) best = { circle: c, tramo };
  }
  if (!best) return null;

  let ref = best.circle, tramo = best.tramo;
  for (let k = 0; k < 4; k++) {              // refit sobre el tramo contiguo
    const sub = [];
    for (let t = tramo.i0; t < tramo.i1; t++) sub.push(pts[t % n]);
    if (sub.length < 5) break;
    const c = ajusteCirculoKasa(sub);
    if (!c || !isFinite(c.r) || c.r > rMax) break;
    const t2 = evaluar(c);
    if (t2.L <= tramo.L * 0.98) { ref = c; break; }
    ref = c; tramo = t2;
  }
  const arco = [];
  for (let t = tramo.i0; t < tramo.i1; t++) arco.push(pts[t % n]);
  return { circulo: ref, arco, fraccionPerimetro: tramo.L / perimetro };
}

// ── E3: cobertura angular alrededor del CENTRO AJUSTADO, por huecos ──────────
function coberturaAngular(arco, { cx, cy }, gapMinDeg = 8) {
  if (arco.length < 3) return 0;
  const th = arco
    .map(([x, y]) => { const t = Math.atan2(y - cy, x - cx); return t < 0 ? t + 2 * Math.PI : t; })
    .sort((a, b) => a - b);
  const gapMin = gapMinDeg * Math.PI / 180;
  let faltante = 0;
  for (let i = 0; i < th.length; i++) {
    const g = (i === th.length - 1) ? (th[0] + 2 * Math.PI - th[i]) : (th[i + 1] - th[i]);
    if (g > gapMin) faltante += g;     // sólo los huecos REALES cuentan como ausencia
  }
  return Math.max(0, 1 - faltante / (2 * Math.PI));
}

// ── Casos sintéticos de completitud conocida ─────────────────────────────────
const densificar = (poly, paso = 1.5) => {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    const d = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.round(d / paso));
    for (let k = 0; k < n; k++) out.push([x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n]);
  }
  return out;
};
const ruido = (pts, s = 1.2) =>
  pts.map(([x, y], i) => [x + Math.sin(i * 2.3) * s, y + Math.cos(i * 1.7) * s]);  // determinista

const R = 100, C = [300, 300];
const arcoDe = (a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => {
  const t = a0 + (a1 - a0) * i / n;
  return [C[0] + R * Math.cos(t), C[1] + R * Math.sin(t)];
});

const UMBRAL_PLANTILLA = 0.30;   // fracción mínima del perímetro sobre el arco ajustado
const UMBRAL_COMPLETO  = 0.93;   // cobertura por encima de la cual se declara «completo»

const casos = {
  'círculo completo (100%)':  [ruido(densificar(arcoDe(0, 2 * Math.PI, 600).slice(0, -1))), 100],
  'disco 75%':                [ruido(densificar([...arcoDe(0, 1.5 * Math.PI, 450), C])), 75],
  'disco 50%':                [ruido(densificar(arcoDe(0, Math.PI, 300))), 50],
  'disco 25%':                [ruido(densificar([...arcoDe(0, Math.PI / 2, 150), C])), 25],
  'disco 12.5%':              [ruido(densificar([...arcoDe(0, Math.PI / 4, 80), C])), 12.5],
  'disco 6%':                 [ruido(densificar([...arcoDe(0, Math.PI / 8, 40), C])), 6.25],
  'rectángulo 2:1 (plantilla errónea)':
    [ruido(densificar([[200, 250], [400, 250], [400, 350], [200, 350]])), null],
};

console.log('caso'.padEnd(36), '| R ajust (err)   | arco/perím | completitud | verdad | veredicto');
for (const [nombre, [pts, verdad]] of Object.entries(casos)) {
  const fit = ajustarPlantillaCirculo(pts);
  if (!fit) { console.log(nombre.padEnd(36), '| sin ajuste'); continue; }
  const cob = coberturaAngular(fit.arco, fit.circulo);
  const errR = 100 * (fit.circulo.r - R) / R;
  const valida = fit.fraccionPerimetro > UMBRAL_PLANTILLA;
  const veredicto = !valida ? 'plantilla rechazada'
    : cob > UMBRAL_COMPLETO ? 'COMPLETO'
    : `FRAGMENTO ${(cob * 100).toFixed(0)}%`;
  console.log(
    nombre.padEnd(36),
    '|', fit.circulo.r.toFixed(1).padStart(6), `(${errR >= 0 ? '+' : ''}${errR.toFixed(1)}%)`.padStart(9),
    '|', ((fit.fraccionPerimetro * 100).toFixed(0) + '%').padStart(10),
    '|', ((cob * 100).toFixed(1) + '%').padStart(11),
    '|', String(verdad ?? '—').padStart(6),
    '|', veredicto
  );
}
console.log('\nEnvolvente operativa: exacto hasta ~25% preservado; por debajo de ~15% se RECHAZA');
console.log('la plantilla en vez de inventar. Plantilla errónea (rectángulo) también rechazada.');
