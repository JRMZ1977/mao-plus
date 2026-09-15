/**
 * ADR-017 F0 — GATE de no regresión.
 *
 * Antes de F0 este script era la SONDA que documentaba el defecto: llamaba a
 * `analizarDistribucionRadialAngular` + `calcularCompletitudFragmento` con formas
 * sintéticas de completitud conocida y obtenía, para un disco entero, medio disco
 * y un cuarto de disco, la misma respuesta: 91,3 % / 91,3 % / 91,0 %, los tres
 * «Casi completo (fragmento menor)». La causa: la cobertura angular se medía
 * alrededor del centroide del propio fragmento, y todo contorno cerrado de
 * cv2.findContours cuyo centroide caiga dentro rodea 360° por construcción.
 * (Los números originales viven en el git log y en el ADR §1.1.)
 *
 * Tras F0 verifica lo contrario: que el estimador degenerado NO ha vuelto y que
 * la medición fiel que lo sustituye se comporta como debe.
 *
 * Uso:  node tools/adr017_gate_f0.mjs    →  sale con código 1 si algo regresó
 * Ver:  docs/ADR-017-emparejamiento-plantillas-completitud.md §1 y §6
 */

import * as ShapeClassification from '../js/modules/shape-classification.js';
import * as MorphometricMetrics from '../js/modules/morphometric-metrics.js';

let fallos = 0;
const ok   = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { console.log(`  ✗ ${m}`); fallos++; };
const chequeo = (cond, m) => cond ? ok(m) : fail(m);

// ── Geometría de prueba ─────────────────────────────────────────────────────
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

const circuloCompleto = densificar(arco(0, 2 * Math.PI, 400).slice(0, -1));
const medioCirculo    = densificar(arco(0, Math.PI, 200));
const rectangulo      = densificar([[200, 250], [400, 250], [400, 350], [200, 350]]);

// ── 1. El estimador degenerado no ha vuelto ────────────────────────────────
console.log('\n1. Claves degeneradas retiradas del contrato');
const radial = ShapeClassification.analizarDistribucionRadialAngular(
  circuloCompleto, centroidePoligono(circuloCompleto));

for (const clave of ['esFragmento', 'porcentajeCompletitud', 'coberturaAngular', 'coberturaGrados']) {
  chequeo(!(clave in radial), `analizarDistribucionRadialAngular no expone '${clave}'`);
}
chequeo(Array.isArray(radial.gaps), 'conserva `gaps` (concavidad real, medición fiel)');
chequeo(typeof radial.uniformidadRadial === 'number', 'conserva `uniformidadRadial`');
chequeo(!/Fragmento/i.test(radial.geometriaInferida || ''),
  `un círculo íntegro no se rotula «Fragmento» (geometriaInferida="${radial.geometriaInferida}")`);

chequeo(typeof MorphometricMetrics.calcularCompletitudFragmento === 'undefined',
  'calcularCompletitudFragmento ya no se exporta');

// ── 2. La medición fiel que lo sustituye ───────────────────────────────────
console.log('\n2. Extent (A/A_bbox) — medición fiel bajo su nombre correcto');
const extCirculo = MorphometricMetrics.calcularExtentContorno(circuloCompleto);
const extRect    = MorphometricMetrics.calcularExtentContorno(rectangulo);
const extMedio   = MorphometricMetrics.calcularExtentContorno(medioCirculo);

chequeo(Math.abs(extCirculo.extent - Math.PI / 4) < 0.01,
  `círculo → extent ${extCirculo.extent.toFixed(4)} ≈ π/4 = 0,7854 (y NO «91 % completo»)`);
chequeo(Math.abs(extRect.extent - 1.0) < 0.01,
  `rectángulo → extent ${extRect.extent.toFixed(4)} ≈ 1,0`);
chequeo(Math.abs(extMedio.extent - Math.PI / 4) < 0.02,
  `medio disco → extent ${extMedio.extent.toFixed(4)} — el extent NO distingue completitud, ` +
  `y por eso ya no se usa para inferirla`);

const vacio = MorphometricMetrics.calcularExtentContorno([]);
chequeo(vacio.extent === null, 'sin contorno → extent null (no un 100 fabricado)');

// ── 3. Ningún valor de completitud fabricado ───────────────────────────────
console.log('\n3. Sin completitud fabricada');
chequeo(!('completitud_estimada' in extCirculo) && !('tipo_fragmento' in extCirculo),
  'el retorno no incluye completitud_estimada ni tipo_fragmento');

console.log(fallos === 0
  ? '\n✅ GATE F0 OK — el estimador degenerado no ha regresado.\n'
  : `\n❌ GATE F0: ${fallos} comprobación(es) fallida(s).\n`);
process.exit(fallos === 0 ? 0 : 1);
