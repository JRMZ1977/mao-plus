/**
 * Regresión del clasificador radial-angular (js/modules/shape-classification.js).
 *
 * Cubre los dos defectos corregidos el 2026-07-31, ambos invisibles para `node -c`
 * y para la suite Python (es código JS puro, sin backend):
 *
 *   1. Entrada dispersa (CONVEX HULL de 4-8 vértices, que es lo que le pasa
 *      simplificarAFormaRegular en el PASO 7): los 4 vértices de un rectángulo
 *      equidistan del centroide → uniformidad 1.000 → "Circular", y los huecos
 *      angulares entre vértices consecutivos fabricaban un "Fragmento (81% completo)"
 *      inexistente. Ahora se remuestrea el polígono antes del análisis polar.
 *   2. Discriminante elipsoidal/poligonal: la concentración de los 3 mayores cambios
 *      radiales está calibrada para ≤3 esquinas; con 4+ cualquier polígono caía en
 *      "Elipsoidal". Ahora se exige ≤2 máximos radiales para elipsoidal.
 *
 * Uso:  node tests/test_shape_classification.mjs
 * Exit 0 = todo pasa; 1 = alguna regresión.
 */

import * as SC from '../js/modules/shape-classification.js';
import * as CE from '../js/modules/classification-engine.js';

// ── helpers de geometría ─────────────────────────────────────────────────────

/** Remuestrea un polígono cerrado a ~n puntos equiespaciados. */
function densificar(vertices, n = 400) {
  const salida = [];
  let perimetro = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    perimetro += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const paso = perimetro / n;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let d = 0; d < L; d += paso) {
      salida.push([a[0] + (b[0] - a[0]) * d / L, a[1] + (b[1] - a[1]) * d / L]);
    }
  }
  return salida;
}

const rectangulo = (w, h, cx = 450, cy = 320) =>
  [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];

const elipse = (a, b, rot = 0, n = 400, cx = 450, cy = 320) =>
  Array.from({ length: n }, (_, i) => {
    const t = (i / n) * 2 * Math.PI;
    const x = a * Math.cos(t), y = b * Math.sin(t);
    return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)];
  });

function analizar(puntos) {
  const cx = puntos.reduce((s, p) => s + p[0], 0) / puntos.length;
  const cy = puntos.reduce((s, p) => s + p[1], 0) / puntos.length;
  return SC.analizarDistribucionRadialAngular(puntos, [cx, cy]);
}

// ── casos ────────────────────────────────────────────────────────────────────
// familiaEsperada: prefijo que debe tener geometriaInferida
// picos: número de máximos radiales esperados (null = no se comprueba)

const CASOS = [
  // Contornos densos (camino normal: contorno real de OpenCV)
  { nombre: 'rectángulo 200×140 denso', puntos: densificar(rectangulo(200, 140)), familia: 'Poligonal', picos: 4 },
  { nombre: 'cuadrado 160×160 denso',   puntos: densificar(rectangulo(160, 160)), familia: 'Poligonal', picos: 4 },
  { nombre: 'trapecio denso',           puntos: densificar([[350, 200], [500, 200], [530, 420], [320, 420]]), familia: 'Poligonal', picos: 4 },
  { nombre: 'triángulo denso',          puntos: densificar([[450, 200], [550, 420], [350, 420]]), familia: 'Poligonal', picos: 3 },
  { nombre: 'círculo r=80',             puntos: elipse(80, 80),          familia: 'Circular',   picos: 0 },
  { nombre: 'elipse 110×60',            puntos: elipse(110, 60),         familia: 'Elipsoidal', picos: 2 },
  { nombre: 'elipse 110×60 rotada 30°', puntos: elipse(110, 60, Math.PI / 6), familia: 'Elipsoidal', picos: 2 },

  // Entrada dispersa: el CONVEX HULL, que es lo que recibe en el pipeline real
  { nombre: 'hull rectángulo (4 pts)',  puntos: rectangulo(200, 140),    familia: 'Poligonal', picos: 4 },
  { nombre: 'hull trapecio (4 pts)',    puntos: [[350, 200], [500, 200], [530, 420], [320, 420]], familia: 'Poligonal', picos: 4 },
  { nombre: 'hull círculo (16 pts)',    puntos: elipse(80, 80, 0, 16),   familia: 'Circular',  picos: 0 },
];

// ── ejecución ────────────────────────────────────────────────────────────────

let pasan = 0;
const fallos = [];

console.log('\nMAO — regresión del clasificador radial-angular');
console.log('='.repeat(62));

for (const caso of CASOS) {
  const d = analizar(caso.puntos);
  const geo = String(d.geometriaInferida);
  const errores = [];

  if (!geo.startsWith(caso.familia)) errores.push(`familia "${geo}" ≠ "${caso.familia}"`);
  if (caso.picos != null && d.numPicosRadiales !== caso.picos) {
    errores.push(`picos ${d.numPicosRadiales} ≠ ${caso.picos}`);
  }
  // Ninguna de estas formas está fracturada: el contorno cubre los 360°.
  if (d.esFragmento) errores.push('marcada como fragmento (falso positivo)');

  if (errores.length) fallos.push(`  ✗ ${caso.nombre}: ${errores.join(' · ')}`);
  else { pasan++; console.log(`  ✓ ${caso.nombre.padEnd(30)} → ${geo} (picos=${d.numPicosRadiales})`); }
}

// Invariante clave: hull disperso y contorno denso de la MISMA forma deben coincidir.
{
  const disperso = analizar(rectangulo(200, 140));
  const denso    = analizar(densificar(rectangulo(200, 140)));
  if (disperso.geometriaInferida !== denso.geometriaInferida) {
    fallos.push(`  ✗ coherencia hull/contorno: "${disperso.geometriaInferida}" ≠ "${denso.geometriaInferida}"`);
  } else { pasan++; console.log(`  ✓ ${'coherencia hull ↔ contorno denso'.padEnd(30)} → ${denso.geometriaInferida}`); }
}

// ── meta-clasificación: jerarquía de evidencias ─────────────────────────────
// La clasificación del backend (22 clases: recuento estable de lados, rectángulo
// mínimo, concavidades, ajuste elíptico) debe pesar MÁS que la radial-angular,
// que solo distingue 4 familias sobre el convex hull. Con los pesos anteriores
// (radial 3.0 vs backend 1.5) la evidencia gruesa ganaba siempre: sobre formas de
// verdad conocida el backend acertaba 15/17 y la salida final 2/17.
{
  const casosMeta = [
    { nombre: 'rectángulo: backend vs radial «circular»', backend: 'Rectangular',
      radial: 'Forma Circular', esperado: /rectangul/i },
    { nombre: 'trapecio: backend vs radial «poligonal»',  backend: 'Trapezoidal',
      radial: 'Forma Poligonal', esperado: /trapezoid/i },
    { nombre: 'lunar: backend vs radial «elipsoidal»',    backend: 'Lunar',
      radial: 'Forma Elipsoidal', esperado: /lunar/i },
  ];
  for (const c of casosMeta) {
    const metricas = {
      forma_detectada: c.backend, circularity: 0.76, solidity: 0.98, excentricidad: 0.71,
      aspect_ratio_tight: 1.43, num_angulos_rectos: 4, simetria_bilateral: 0.9,
      convexidad: 0.98, completitud_estimada: 100,
      _forma_idealizada: { nombre: c.radial, distribucionRadialAngular: { geometriaInferida: c.radial, confianzaGeometria: 0.85, esFragmento: false } },
    };
    let final = '';
    try { final = CE.metaClasificarForma(metricas, {}).clasificacion_final || ''; }
    catch (e) { final = 'ERROR: ' + e.message; }
    if (c.esperado.test(final)) { pasan++; console.log(`  ✓ ${c.nombre.padEnd(30)} → ${final}`); }
    else fallos.push(`  ✗ ${c.nombre}: la radial se impuso → "${final}"`);
  }

  // La familia la pone la evidencia fina: antes el rótulo entero venía de la radial
  // («Fragmento Circular» sobre una pieza rectangular).
  // ADR-017 F0: la clasificación tampoco publica «Fragmento … (N% completo)». Esa
  // completitud salía de una cobertura angular degenerada (disco entero, medio y
  // cuarto daban ~91 %); sin ajuste de plantilla, es_fragmento/completitud quedan
  // DESCONOCIDOS (null), nunca fabricados. La completitud real la da /api/shape-match.
  const mFrag = {
    forma_detectada: 'Rectangular', circularity: 0.76, solidity: 0.88, excentricidad: 0.71,
    aspect_ratio_tight: 1.43, num_angulos_rectos: 4, convexidad: 0.95, completitud_estimada: 81,
    _forma_idealizada: { nombre: 'Fragmento Circular (81% completo)', distribucionRadialAngular: { geometriaInferida: 'Circular', confianzaGeometria: 0.85, esFragmento: true } },
  };
  let resFrag = {};
  try { resFrag = CE.metaClasificarForma(mFrag, {}) || {}; }
  catch (e) { resFrag = { clasificacion_final: 'ERROR: ' + e.message }; }
  const finalFrag = resFrag.clasificacion_final || '';
  if (/rectang/i.test(finalFrag) && !/circular/i.test(finalFrag) && !/% completo/i.test(finalFrag)
      && resFrag.es_fragmento === null && resFrag.completitud === null) {
    pasan++; console.log(`  ✓ ${'fragmento: familia fina, sin % fabricado'.padEnd(30)} → ${finalFrag}`);
  } else {
    fallos.push(`  ✗ fragmento: debía dar la familia del backend sin completitud fabricada → "${finalFrag}" (es_fragmento=${resFrag.es_fragmento}, completitud=${resFrag.completitud})`);
  }
}

console.log('='.repeat(62));
if (fallos.length) {
  console.log(`❌  FAIL  ${pasan}/${pasan + fallos.length}\n${fallos.join('\n')}\n`);
  process.exit(1);
}
console.log(`✅  PASS  ${pasan}/${pasan} casos\n`);
