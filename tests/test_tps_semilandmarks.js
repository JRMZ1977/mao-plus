/**
 * tests/test_tps_semilandmarks.js — correspondencia de puntos en el TPS (ADR-021)
 *
 * Sin dependencias:  node tests/test_tps_semilandmarks.js   (o: npm run test:js)
 *
 * El defecto: hasta 1.3.0 el TPS por defecto salía de `_generarLandmarksSemiAutomaticos`
 * (js/analysis-core.js): 22 puntos equidistantes desde pts[0] más 10 de curvatura
 * máxima AÑADIDOS AL FINAL, deduplicados y recortados a 32. El punto i de un
 * espécimen no correspondía al punto i de otro, y un GPA (tpsRelw,
 * geomorph::gpagen) emparejaba puntos no homólogos.
 *
 * Se prueba lo que le importa a un GPA: dos copias de la MISMA forma —girada,
 * escalada, trasladada, empezando en otro punto y recorrida al revés— deben dar
 * configuraciones con distancia de Procrustes ≈ 0.
 *
 * Generador bajo prueba: el de la exportación, `MaoInteropGMM.semilandmarksContorno`
 * (js/mao-interop-gmm.js). En el código anterior a ADR-021 ese archivo no existe y
 * se toma `_generarLandmarksSemiAutomaticos(pts, 32, 10)` del IIFE: así el test
 * falla por CORRESPONDENCIA, no por un nombre que falta.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const RUTA_HELPER = path.join(RAIZ, 'js', 'mao-interop-gmm.js');
const src = fs.readFileSync(path.join(RAIZ, 'js', 'analysis-core.js'), 'utf8');

let fallos = 0;
const ok = (cond, msg) => { console.log((cond ? '  OK   ' : '  FALLO') + '  ' + msg); if (!cond) fallos++; };
const pendientes = [];
const seccion = (titulo, fn) => {
  console.log(`\n=== ${titulo} ${'='.repeat(Math.max(0, 62 - titulo.length))}`);
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      pendientes.push(r.catch((e) => ok(false, `la sección «${titulo}» lanzó: ${e.message}`)));
    }
  } catch (e) { ok(false, `la sección lanzó: ${e.message}`); }
};

/** Cuerpo de una función de nivel IIFE (acepta `async function`). */
function extraer(nombre) {
  const m = new RegExp(`\\n  (?:async )?function ${nombre}\\(`).exec(src);
  if (!m) throw new Error('no encontrada en analysis-core.js: ' + nombre);
  const resto = src.slice(m.index + 1);
  return resto.slice(0, resto.indexOf('\n  }\n') + 4);
}

const G = fs.existsSync(RUTA_HELPER) ? require(RUTA_HELPER) : null;
const generadorExportacion = G
  ? (pts) => G.semilandmarksContorno(pts).puntos
  : (() => {
      const f = new Function(
        ['_normalizarPuntosEFA', '_resampleByArcEFA', '_curvaturaMengerAbs', '_generarLandmarksSemiAutomaticos']
          .map(extraer).join('\n') + '\nreturn _generarLandmarksSemiAutomaticos;')();
      return (pts) => f(pts, 32, 10).landmarks;
    })();
console.log(G ? 'Generador: MaoInteropGMM.semilandmarksContorno'
              : 'Generador: _generarLandmarksSemiAutomaticos (código anterior a ADR-021)');

// ── Geometría auxiliar ─────────────────────────────────────────────────────

function polar(n, r, cx = 300, cy = 260) {
  const P = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    P.push([cx + r(t) * Math.cos(t), cy + r(t) * Math.sin(t)]);
  }
  return P;
}
const trilobulada = (n = 300) => polar(n, (t) => 100 * (1 + 0.30 * Math.cos(3 * t) + 0.12 * Math.sin(4 * t)
  + 0.08 * Math.cos(2 * t + 0.5)));
const huevo = (n = 260) => polar(n, (t) => 90 * (1 + 0.22 * Math.cos(t) + 0.10 * Math.cos(2 * t + 0.4)));

/** Medio disco: simétrico respecto de su eje menor → el extremo lo decide el eje menor. */
function medioDisco(n = 240) {
  const P = [];
  for (let i = 0; i < n * 0.75; i++) { const t = Math.PI * i / (n * 0.75); P.push([300 + 150 * Math.cos(t), 260 - 150 * Math.sin(t)]); }
  for (let i = 0; i < n * 0.25; i++) P.push([150 + (300 * i) / (n * 0.25), 260]);
  return P;
}

/** Semejanza + otro punto de inicio + (opcional) sentido inverso. */
function copia(P, { ang = 0, s = 1, dx = 0, dy = 0, desplazar = 0, invertir = false }) {
  const c = Math.cos(ang), si = Math.sin(ang);
  let Q = P.map(([x, y]) => [dx + s * (c * x - si * y), dy + s * (si * x + c * y)]);
  Q = Q.slice(desplazar).concat(Q.slice(0, desplazar));
  return invertir ? Q.reverse() : Q;
}

/** Distancia de Procrustes (tamaño de centroide 1, giro óptimo SIN reflexión). */
function procrustes(A, B) {
  if (A.length !== B.length) return Infinity;
  const norm = (X) => {
    const mx = X.reduce((a, p) => a + p[0], 0) / X.length, my = X.reduce((a, p) => a + p[1], 0) / X.length;
    const Y = X.map((p) => [p[0] - mx, p[1] - my]);
    const cs = Math.sqrt(Y.reduce((a, p) => a + p[0] * p[0] + p[1] * p[1], 0));
    return Y.map((p) => [p[0] / cs, p[1] / cs]);
  };
  const a = norm(A), b = norm(B);
  let sxx = 0, sxy = 0;
  for (let i = 0; i < a.length; i++) {
    sxx += a[i][0] * b[i][0] + a[i][1] * b[i][1];
    sxy += a[i][0] * b[i][1] - a[i][1] * b[i][0];
  }
  const th = Math.atan2(sxy, sxx), c = Math.cos(th), s = Math.sin(th);
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    const x = c * a[i][0] - s * a[i][1], y = s * a[i][0] + c * a[i][1];
    d += (x - b[i][0]) ** 2 + (y - b[i][1]) ** 2;
  }
  return Math.sqrt(d);
}

const VARIANTES = [
  { ang: 0.65, s: 1.7, dx: 500, dy: -200, desplazar: 83 },
  { ang: 2.9, s: 0.4, dx: -40, dy: 900, desplazar: 151, invertir: true },
  { ang: -1.2, s: 3.1, dx: 12, dy: 7, desplazar: 7, invertir: true },
  { ang: Math.PI, s: 1, dx: 0, dy: 0, desplazar: 150 },          // media vuelta, medio contorno
];

// ── A · Correspondencia tras GPA: copias exactas ──────────────────────────
seccion('A · copias exactas de la misma forma (test a de ADR-021)', () => {
  for (const [nombre, forma] of [['trilobulada', trilobulada()], ['huevo', huevo()], ['medio disco', medioDisco()]]) {
    const base = generadorExportacion(forma);
    VARIANTES.forEach((v, k) => {
      const d = procrustes(base, generadorExportacion(copia(forma, v)));
      ok(d < 1e-9, `${nombre} · variante ${k + 1}${v.invertir ? ' (sentido inverso)' : ''}: d_Procrustes = ${d.toExponential(2)}`);
    });
  }
});

// ── B · Correspondencia con otro muestreo de la misma curva ───────────────
seccion('B · la misma curva muestreada con otros vértices', () => {
  const base = generadorExportacion(trilobulada(300));
  const otra = copia(trilobulada(437), { ang: 1.1, s: 2, dx: 50, dy: 50, desplazar: 200 });
  const d = procrustes(base, generadorExportacion(otra));
  ok(d < 1e-3, `437 vértices frente a 300, girada y con otro inicio: d = ${d.toExponential(2)}`);
  const dDistinta = procrustes(base, generadorExportacion(huevo()));
  ok(dDistinta > 0.05, `formas distintas siguen separadas (la medida discrimina): d = ${dDistinta.toFixed(3)}`);
});

// ── C · Número fijo de puntos ─────────────────────────────────────────────
seccion('C · el mismo número de puntos en todo espécimen', () => {
  const tamanos = [trilobulada(11), trilobulada(300), trilobulada(1600), medioDisco(40)]
    .map((P) => generadorExportacion(P).length);
  ok(new Set(tamanos).size === 1, `LM igual para contornos de 11, 300, 1600 y 40 vértices → ${tamanos.join('/')}`);
});

if (!G) {
  console.log('\n(js/mao-interop-gmm.js no existe: el resto de secciones prueba el helper de ADR-021)');
  ok(false, 'falta js/mao-interop-gmm.js (ADR-021)');
  console.log(`\nRESULTADO: ${fallos} FALLOS`);
  process.exit(1);
}

// ── D · Inicio y sentido documentados ─────────────────────────────────────
seccion('D · inicio y sentido reproducibles y declarados', () => {
  const r = G.semilandmarksContorno(trilobulada());
  ok(r.n === G.N_SEMILANDMARKS && r.puntos.length === r.n, `N fijo = ${G.N_SEMILANDMARKS}`);
  ok(r.sentido === 'antihorario_en_pantalla', 'sentido declarado');
  ok(r.inicio.criterio === 'eje_mayor' && r.inicio.estable === true, `forma asimétrica: criterio eje mayor, estable (g=${r.inicio.asimetria.toFixed(3)})`);
  // sentido: área con signo NEGATIVA en coordenadas de imagen (antihorario en pantalla)
  const P = r.puntos; let a2 = 0;
  for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
  ok(a2 < 0, 'los puntos salen en sentido antihorario en pantalla');
  const inv = G.semilandmarksContorno(trilobulada().reverse());
  ok(inv.recorridoInvertido !== r.recorridoInvertido, 'un contorno recorrido al revés se detecta y se invierte');

  const dm = G.semilandmarksContorno(medioDisco());
  ok(dm.inicio.criterio === 'eje_menor', `medio disco: decide el eje menor (forma en D) → ${dm.inicio.criterio}`);

  const circulo = G.semilandmarksContorno(polar(200, () => 100));
  ok(circulo.inicio.estable === false && /casi circular/.test(circulo.inicio.avisos.join(' ')),
    'círculo: el inicio se declara poco determinado (θ₁ mal condicionada)');

  const vacio = G.semilandmarksContorno([[0, 0], [1, 1], [2, 2]]);
  ok(vacio.n === 0 && /degenerado/.test(vacio.motivo), 'contorno sin área → sin puntos y con motivo');
});

// ── E · Formato TPS y matriz de deslizamiento ─────────────────────────────
seccion('E · bloque TPS y curveslide.csv', () => {
  const r = G.semilandmarksContorno(trilobulada());
  const tps = G.bloqueTPS(r, { id: 'QP1_U1_N1_E1_01', escalaMmPx: 0.05, curveslide: 'curveslide.csv' });
  const L = tps.trim().split('\n');
  ok(L[0] === `LM=${G.N_SEMILANDMARKS}`, 'LM= con el número fijo');
  ok(L.slice(1, 1 + G.N_SEMILANDMARKS).every((l) => /^-?\d+\.\d{6} -?\d+\.\d{6}$/.test(l)), 'coordenadas x y con 6 decimales');
  ok(L.filter((l) => l.startsWith('COMMENT=')).length === 1, 'un solo COMMENT= por espécimen');
  const com = L.find((l) => l.startsWith('COMMENT='));
  ok(/semilandmarks deslizantes/.test(com) && /theta1/.test(com) && /antihorario/.test(com), 'COMMENT documenta semilandmarks, inicio (θ₁) y sentido');
  ok(/curveslide\.csv/.test(com) && /1 \(inicio, fijo\)/.test(com), 'COMMENT cita la matriz de deslizamiento y el punto fijo');
  ok(/^[\x20-\x7e\n]*$/.test(tps), 'TPS sólo ASCII (lectores de tpsDig/tpsRelw)');
  ok(L.includes('SCALE=0.05000000') && L.includes('ID=QP1_U1_N1_E1_01'), 'ID= y SCALE=');

  const cs = G.curveslideCerrado(5).trim().split('\n');
  ok(cs[0] === 'before,slide,after', 'cabecera de geomorph::define.sliders');
  ok(cs.length === 5 && cs[1] === '1,2,3' && cs[4] === '4,5,1',
    'curva CERRADA como define.sliders(c(1:n,1)): el 1 (inicio) fijo, deslizan 2..n con cierre (4,5,1)');
  ok(!cs.slice(1).some((f) => f.split(',')[1] === '1'), 'el punto 1 no desliza');
});

// ── F · Ayuda visual de curvatura: fuera del TPS ──────────────────────────
seccion('F · puntos de curvatura: ayuda visual, no landmarks', () => {
  const csv = G.csvCurvaturaVisual(trilobulada(), 10);
  ok(/^indice_contorno,x_px,y_px,curvatura_menger/.test(csv), 'CSV propio, no TPS');
  ok(/NO SON LANDMARKS/.test(csv) && !/LM=/.test(csv), 'rotulado como ayuda visual y sin bloque TPS');
});

// ── G · El lote escribe un TPS por estructura (no mezcla contorno y P/H) ──
seccion('G · lote: un TPS por estructura + curveslide.csv', () => {
  const nombres = ['_normalizarPuntosEFA', '_obtenerPuntosContornoEFA', '_semilandmarksTPS',
    '_colectarFuentesEFAConfirmadas', '_semilandmarksDeFuente', '_resolverEscalaMmPx',
    '_generarTextoTPSLandmarks', '_generarCsvEFA', '_exportarLandmarksLote'];
  const fabricar = new Function('window', 'PythonBridge', 'scale', 'resolverNombreFotografia',
    nombres.map(extraer).join('\n') + '\nreturn _exportarLandmarksLote;');
  const exportar = fabricar({ MaoInteropGMM: G }, null, 0.05, () => 'IMG_1.JPG');

  const efa = (n) => ({ status: 'ok', n_harmonics: n, coefficients: [[1, 0, 0, 0.5]], coefficients_raw: [[3, 1, 2, 4]],
    normalization: { scale_factor: 3 }, scale_px_mm: 0.05 });
  const obj = {
    id: 'QP1_01',
    contour_points: trilobulada(),
    perforaciones: [{ id: 1, puntos: polar(40, () => 12, 310, 250), metricas: { _efa_data: efa(1), area: 4 } }],
    horadaciones: [],
  };
  const metricas = { _efa_data: efa(1), area: 300 };
  const escritos = new Map();
  const omitidos = [];
  const destino = {
    escribir: async (ruta, contenido) => { escritos.set(ruta, contenido); },
    omitir: (ruta, motivo) => omitidos.push(`${ruta}: ${motivo}`),
  };
  return exportar(obj, metricas, destino).then(() => {
    const rutas = [...escritos.keys()].sort();
    console.log('      escritos: ' + rutas.join(' · '));
    ok(escritos.has('landmarks/contorno.tps') && escritos.has('landmarks/P1.tps'), 'un TPS para el contorno y otro para P1');
    ok(escritos.has('landmarks/curveslide.csv'), 'curveslide.csv para geomorph');
    ok(!escritos.has('landmarks/landmarks.tps'), 'ya no hay landmarks.tps con contorno y P/H mezclados');
    const tpsMultiples = rutas.filter((r) => r.endsWith('.tps') && (escritos.get(r).match(/^LM=/gm) || []).length !== 1);
    ok(tpsMultiples.length === 0, 'cada TPS del lote contiene UN espécimen');
    ok((escritos.get('landmarks/P1.tps').match(/^LM=(\d+)/m) || [])[1] === String(G.N_SEMILANDMARKS), 'P1 con el mismo N');
    ok(escritos.has('landmarks/contorno_efa.csv') && escritos.has('landmarks/P1_efa.csv'), 'CSV EFA por estructura');
    ok(omitidos.length === 0, 'sin omisiones → ' + (omitidos.join(' | ') || 'ninguna'));
  });
});

Promise.all(pendientes).then(() => {
  console.log('\n' + (fallos === 0 ? 'RESULTADO: todas las comprobaciones pasan' : `RESULTADO: ${fallos} FALLOS`));
  process.exit(fallos === 0 ? 0 : 1);
});
