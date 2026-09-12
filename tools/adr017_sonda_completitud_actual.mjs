/**
 * ADR-017 §1.1 — Sonda del estimador de completitud EN PRODUCCIÓN.
 *
 * Demuestra que `analizarDistribucionRadialAngular` + `calcularCompletitudFragmento`
 * NO miden completitud: la cobertura angular se calcula alrededor del centroide del
 * PROPIO fragmento, y todo contorno cerrado de cv2.findContours cuyo centroide caiga
 * dentro rodea 360° por construcción. Un disco entero y un cuarto de disco resultan
 * indistinguibles.
 *
 * Uso:  node tools/adr017_sonda_completitud_actual.mjs
 * Ver:  docs/ADR-017-emparejamiento-plantillas-completitud.md §1.1
 */

import { analizarDistribucionRadialAngular } from '../js/modules/shape-classification.js';
import { calcularCompletitudFragmento } from '../js/modules/morphometric-metrics.js';

/** Centroide de polígono (ponderado por área, no media de vértices). */
function centroidePoligono(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    const cr = x1 * y2 - x2 * y1;
    a += cr; cx += (x1 + x2) * cr; cy += (y1 + y2) * cr;
  }
  a /= 2;
  return [cx / (6 * a), cy / (6 * a)];
}

/** Remuestrea el polígono a paso ~constante, como hace findContours. */
function densificar(poly, paso = 2) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    const d = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.round(d / paso));
    for (let k = 0; k < n; k++) out.push([x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n]);
  }
  return out;
}

const R = 100, C = [300, 300];
const arco = (a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => {
  const t = a0 + (a1 - a0) * i / n;
  return [C[0] + R * Math.cos(t), C[1] + R * Math.sin(t)];
});

// Formas sintéticas de completitud CONOCIDA (el contorno se cierra por la cuerda/radios,
// igual que la silueta real de un fragmento).
const casos = {
  'círculo completo (100%)': densificar(arco(0, 2 * Math.PI, 400).slice(0, -1)),
  'medio círculo (50%)':     densificar(arco(0, Math.PI, 200)),
  'cuarto círculo (25%)':    densificar([...arco(0, Math.PI / 2, 100), C]),
  'rectángulo 2:1 (100%)':   densificar([[200, 250], [400, 250], [400, 350], [200, 350]]),
};

console.log('caso'.padEnd(24), '| coberturaº | gaps | esFragmento | completitud | veredicto emitido');
for (const [nombre, pts] of Object.entries(casos)) {
  const c = centroidePoligono(pts);
  const radial = analizarDistribucionRadialAngular(pts, c);
  const comp = calcularCompletitudFragmento(pts, c, radial);
  console.log(
    nombre.padEnd(24),
    '|', radial.coberturaGrados.toFixed(1).padStart(9),
    '|', String(radial.gaps.length).padStart(4),
    '|', String(radial.esFragmento).padStart(11),
    '|', (comp.completitud_estimada.toFixed(1) + '%').padStart(11),
    '|', comp.tipo_fragmento
  );
}
console.log('\nEsperado si el estimador fuese correcto: 100 / 50 / 25 / 100.');
