/**
 * Exportación por lote — pruebas de integración.
 *
 * Cubre las opciones de `projectManager.enrichCollection` que alimentan el modal
 * «Exportar colección…» (selección de objetos, formatos, destino, recalcular) y
 * la generación de SVG por lote de collection.js.
 *
 * Carga los scripts clásicos reales (collection.js, project-manager.js) en un
 * sandbox `vm` con stubs mínimos de DOM y un sistema de archivos en memoria: lo
 * que se verifica es QUÉ ARCHIVOS se escriben con cada combinación de opciones.
 *
 * Por qué existe: la exportación por lote falla en silencio con facilidad —
 * ADR-019 F1 documenta cómo el PDF del lote desapareció durante meses porque un
 * productor dejó de ser global y el gate del consumidor quedó falso. Aquí la
 * ausencia de un archivo esperado rompe la suite.
 *
 * Uso:  node tests/test_export_lote.js
 */

'use strict';

const fs   = require('fs');
const vm   = require('vm');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const noop = () => {};

// ── Sistema de archivos en memoria ──────────────────────────────────────────
const FS     = new Map();   // ruta → contenido
const DIRS   = new Set();
const COPIAS = [];

const CUADRADO = [[100, 100], [300, 100], [300, 260], [100, 260]];

function sembrarProyecto(base, objetos) {
  DIRS.add(base);
  objetos.forEach((o, i) => {
    const f = `${base}/${o.carpeta}`;
    DIRS.add(f);
    FS.set(`${f}/metadata.json`, JSON.stringify({
      id: o.carpeta,
      timestamp: '2026-08-01T10:00:00Z',
      nombreObjeto: o.nombreObjeto,
      configuracion: { modo: 'monofacial', escala: 0.1, unidades: 'mm', parametros_captura: {} },
      identificacion: { cara: 'Mono' },
    }));
    FS.set(`${f}/metricas.json`, JSON.stringify({
      objeto: {
        area: 320 + i, perimeter: 72, circularity: 0.77, forma_detectada: 'Rectangular',
        eje_mayor_real_longitud: 20, eje_mayor_real_longitud_px: 200,
        _contour_data: { points: CUADRADO, metrics: { convex_hull: CUADRADO } },
        _efa_data: {
          coefficients: [[1, 0, 0, 1], [0.1, 0, 0, 0.1]],
          // crudos del convenio interno de MAO (análisis anterior a ADR-021)
          coefficients_raw: [[0, -100, 80, 0], [0, -10, 8, 0]],
          power_spectrum: [1, 0.01], n_harmonics: 2,
        },
      },
      perforaciones: [], horadaciones: [], estadisticas: {},
    }));
    FS.set(`${f}/geometria.json`, JSON.stringify({
      contornoReal: { puntos: CUADRADO },
      convexHull:   { puntos: CUADRADO },
      boundingBox:  { minX: 100, minY: 100, maxX: 300, maxY: 260, width: 200, height: 160 },
      centroides: {}, ejes: {}, radios: {},
      escala: { factorConversion: 0.1, factor: 0.1, unidades: 'mm' },
    }));
    FS.set(`${f}/imagenes/analisis_morfologico.png`, 'PNG-morf');
    FS.set(`${f}/imagenes/esquema_morfometrico.png`, 'PNG-esqu');
    FS.set(`${f}/imagenes/forma_idealizada.png`,     'PNG-ideal');
  });
}

const electronAPI = {
  ensureFolder: async (p)      => { DIRS.add(p); return { success: true }; },
  folderExists: async (p)      => DIRS.has(p),
  saveFile:     async (p, c)   => { FS.set(p, c); return { success: true }; },
  writeFile:    async (p, c)   => { FS.set(p, c); return { success: true }; },
  readFile:     async (p)      => (FS.has(p) ? { success: true, content: FS.get(p) }
                                             : { success: false, error: 'ENOENT' }),
  copyFile:     async (s, d)   => {
    if (!FS.has(s)) return { success: false, error: 'ENOENT' };
    FS.set(d, FS.get(s)); COPIAS.push([s, d]); return { success: true };
  },
  generatePDFFromHTML: async (html, out) => { FS.set(out, '%PDF ' + html.length); return { success: true }; },
  openFolder: noop,
};

// ── Sandbox con stubs de DOM ────────────────────────────────────────────────
const elemStub = new Proxy({}, {
  get: (t, k) => (k === 'style' ? {} : (k === 'classList' ? { add: noop, remove: noop } : noop)),
  set: () => true,
});

function crearSandbox() {
  const sandbox = {
    console: { log: noop, warn: noop, error: console.error, info: noop },
    document: {
      readyState: 'complete',
      getElementById: () => null,
      querySelector:  () => null,
      querySelectorAll: () => [],
      createElement:  () => elemStub,
      addEventListener: noop,
      dispatchEvent: noop,
      body: elemStub,
    },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    CustomEvent: class { constructor(n, o) { this.type = n; this.detail = o && o.detail; } },
    Blob: class { constructor(p) { this._t = p.join(''); } async text() { return this._t; } },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: noop },
    setTimeout, clearTimeout,
    electronAPI,
    _maoLog: noop,
    // Sin parámetros ópticos en las fixtures, enrichCollection toma la rama
    // «parámetros insuficientes» — suficiente para lo que aquí se verifica.
    estimarErrorOptico: () => null,
    toast: { success: noop, error: noop, warning: noop, info: noop },
    // exportGeometryToSVG referencia `projectManager` como global desnudo: el `?.`
    // no protege de un identificador no declarado. En la app lo crea
    // project-manager.js, que carga antes que collection.js.
    projectManager: { activeProject: { name: 'Sitio X' }, projects: [] },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  // mao-interop-gmm.js (ADR-021) se carga antes, como en index.html. Si falta
  // (código anterior) se sigue: los casos fallan por lo que escriben, no por esto.
  for (const rel of ['js/mao-interop-gmm.js', 'js/collection.js', 'js/project-manager.js']) {
    if (!fs.existsSync(path.join(RAIZ, rel))) { console.log('  (falta ' + rel + ')'); continue; }
    const src = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
    vm.runInContext(src, sandbox, { filename: rel });
  }
  return sandbox;
}

// ── Aserciones ──────────────────────────────────────────────────────────────
let ok = 0, ko = 0;
const fallos = [];
function t(nombre, fn) {
  try { fn(); ok++; console.log('  ✅', nombre); }
  catch (e) { ko++; fallos.push(nombre); console.log('  ❌', nombre, '→', e.message); }
}

(async () => {
  console.log('\nMAO exportación por lote');
  console.log('='.repeat(50));

  const sandbox = crearSandbox();
  const win = sandbox.window;

  // ── A. SVG por lote (collection.js) ───────────────────────────────────────
  console.log('\n  SVG por lote');

  t('los contratos de lote están expuestos en window', () => {
    for (const n of ['generarSVGMorfologicoParaLote', 'construirGeometryDataMorfologico']) {
      if (typeof win[n] !== 'function') throw new Error('falta window.' + n);
    }
  });

  const ref = { carpeta: 'OBJ_001', nombreObjeto: 'Punta 1', cara: 'Mono', modo: 'monofacial' };
  const metricas = {
    eje_mayor_real_longitud: 20, eje_mayor_real_longitud_px: 200,
    _contour_data: { points: CUADRADO, metrics: { convex_hull: CUADRADO } },
  };
  const doc = { objeto: metricas, perforaciones: [], horadaciones: [] };
  const geometria = {
    contornoReal: { puntos: CUADRADO }, convexHull: { puntos: CUADRADO },
    boundingBox: { minX: 100, minY: 100, maxX: 300, maxY: 260, width: 200, height: 160 },
    centroides: {}, ejes: {}, radios: {},
    escala: { factorConversion: 0.1, factor: 0.1, unidades: 'mm' },
  };

  const svgGeo = await win.generarSVGMorfologicoParaLote(ref, metricas, doc, geometria);
  t('genera SVG bien formado desde geometria.json', () => {
    if (typeof svgGeo !== 'string') throw new Error('no devolvió string');
    if (!svgGeo.includes('<svg') || !svgGeo.trimEnd().endsWith('</svg>')) throw new Error('SVG mal formado');
  });
  t('el SVG lleva el nombre del objeto y traza el contorno', () => {
    if (!svgGeo.includes('Punta 1')) throw new Error('sin nombre de objeto');
    if (!/<path/.test(svgGeo)) throw new Error('sin <path> de contorno');
  });
  t('declara dimensiones físicas en mm (escala 10:1)', () => {
    if (!/width="[\d.]+mm"/.test(svgGeo)) throw new Error('sin width en mm');
  });

  // geometria.json tal como lo guardaba la app hasta 1.3.0: `factorConversion: 1`
  // (calcularEscala() no devolvía valor). Medido en Electron: 261 mm declarados para
  // una pieza de 117 mm. El factor válido es el de las métricas: 20 mm / 200 px.
  const geometriaEscala1 = { ...geometria, escala: { factorConversion: 1, pixelesPorMM: 1, unidadMedida: 'mm' } };
  const svgEsc1 = await win.generarSVGMorfologicoParaLote(ref, metricas, doc, geometriaEscala1);
  t('con escala 1 guardada en geometria.json manda el factor de las métricas', () => {
    const w = (svgEsc1.match(/width="([\d.]+)mm"/) || [])[1];
    // 200 px × 0,1 mm/px = 20 mm reales → 200 mm en el documento 10:1 (no 2000)
    if (Number(w) !== 200) throw new Error(`width=${w}mm, esperado 200mm`);
    if (!/Objeto real: 20 × 16 mm/.test(svgEsc1)) throw new Error('la descripción no declara 20 × 16 mm');
  });

  const svgRecon = await win.generarSVGMorfologicoParaLote(ref, metricas, doc, null);
  t('sin geometria.json reconstruye desde metricas.json', () => {
    // Regresión: al extraer construirGeometryDataMorfologico se perdieron las
    // variables contornoPuntos/convexHullPuntos del scope del llamador.
    if (typeof svgRecon !== 'string' || !svgRecon.includes('<path')) {
      throw new Error('la reconstrucción no produjo trazado');
    }
  });
  const svgVacio = await win.generarSVGMorfologicoParaLote(ref, {}, { objeto: {} }, null);
  t('objeto sin geometría → null (no lanza)', () => {
    if (svgVacio !== null) throw new Error('esperaba null, devolvió ' + typeof svgVacio);
  });
  t('no deja residuo en window.currentGeometryData', () => {
    if (win.currentGeometryData !== undefined) throw new Error('currentGeometryData quedó seteado');
  });

  // ── B. enrichCollection: opciones ─────────────────────────────────────────
  console.log('\n  enrichCollection — opciones de exportación');

  // El reporte HTML del PDF vive en analysis-core (módulo ES, no cargable aquí).
  // Se stubbea: lo que se verifica es el cableado del lote, no el informe.
  win.generarHTMLReporteParaBatch = async (r) => `<html>${r.carpeta}</html>`;

  const BASE = '/proy/Sitio X';
  const OBJS = [
    { carpeta: 'OBJ_001', nombreObjeto: 'Punta 1' },
    { carpeta: 'OBJ_002', nombreObjeto: 'Raedera 2' },
  ];
  sembrarProyecto(BASE, OBJS);

  const pm = win.projectManager;
  const project = { id: 'p1', name: 'Sitio X', folderPath: BASE };
  pm.projects = [project];
  pm.getProject = (id) => (id === 'p1' ? project : null);
  pm.loadProjectCollection = async () => ({
    nombre: 'Sitio X', folderPath: BASE,
    objetos: OBJS.map(o => ({ ...o, cara: 'Mono', modo: 'monofacial', timestamp: '2026-08-01T10:00:00Z' })),
  });
  pm.updateProjectSummaryCSV = async () => {};

  const rutas = () => [...FS.keys()].filter(p => p.includes('_exportados') || p.startsWith('/destino'));
  const hay   = (frag) => rutas().some(p => p.includes(frag));
  const reset = () => { for (const k of rutas()) FS.delete(k); COPIAS.length = 0; };

  // B1 — compatibilidad: `options = {}` es lo que envía «Actualizar colección»
  let r = await pm.enrichCollection('p1', {});
  t('options={} escribe PDF, EFA y CSV de colección', () => {
    if (!hay('_reporte_MAO.pdf'))  throw new Error('sin PDF');
    if (!hay('_efa_contorno.csv')) throw new Error('sin EFA');
    if (!hay('_enriquecido_'))     throw new Error('sin CSV colección');
  });
  t('options={} NO activa PNG, SVG ni TPS (comportamiento previo intacto)', () => {
    if (hay('_morfologico.png') || hay('_geometria.svg') || hay('.tps')) {
      throw new Error('un formato nuevo se activó por defecto');
    }
  });
  t('el CSV EFA de la colección sale en el convenio de Kuhl & Giardina (ADR-021)', () => {
    const k = rutas().find(p => p.endsWith('OBJ_001_efa_contorno.csv'));
    const c = FS.get(k) || '';
    if (!c.startsWith('harmonic,a_norm_kg,b_norm_kg,c_norm_kg,d_norm_kg,a_raw_kg')) {
      throw new Error('cabecera: ' + c.split('\n')[0]);
    }
    // crudos MAO (0,−100,80,0) → K&G (−b, a, −d, c) = (100, 0, 0, 80)
    const f1 = c.split('\n')[1].split(',');
    if (f1.slice(5, 9).join('|') !== '100|0|0|80') throw new Error('crudos K&G: ' + f1.slice(5, 9).join('|'));
    if (!/Kuhl & Giardina \(1982\)/.test(c)) throw new Error('sin convenio declarado');
    if (/Método: Kuhl/.test(c)) throw new Error('sigue el rótulo viejo sobre coeficientes MAO');
  });
  t('options={} recalcula y sella metricas.json', () => {
    const d = JSON.parse(FS.get(`${BASE}/OBJ_001/metricas.json`));
    if (!d.objeto.enriched_at) throw new Error('sin enriched_at');
  });

  // B2 — formatos
  reset();
  await pm.enrichCollection('p1', {
    formatos: { pdf: false, csvColeccion: false, efa: false, png: true, svg: true },
  });
  t('formatos {png,svg} copia los 3 renders por objeto', () => {
    if (!hay('_morfologico.png')) throw new Error('sin PNG');
    if (COPIAS.length !== 6) throw new Error('copias=' + COPIAS.length + ', esperaba 6');
  });
  t('formatos {png,svg} escribe un SVG válido', () => {
    const k = rutas().find(p => p.endsWith('.svg'));
    if (!k) throw new Error('sin SVG');
    const c = FS.get(k);
    if (!c.includes('<svg') || !c.trimEnd().endsWith('</svg>')) throw new Error('SVG mal formado');
  });
  t('formatos {png,svg} no escribe los formatos no pedidos', () => {
    if (hay('.pdf') || hay('_efa_') || hay('_enriquecido_')) throw new Error('escribió un formato no pedido');
  });

  // B3 — selección de objetos
  reset();
  r = await pm.enrichCollection('p1', {
    objetos: ['OBJ_002'], formatos: { pdf: true, csvColeccion: false, efa: false },
  });
  t('objetos:[OBJ_002] procesa solo ese objeto', () => {
    if (r.total !== 1)  throw new Error('total=' + r.total);
    if (hay('OBJ_001')) throw new Error('procesó un objeto no seleccionado');
    if (!hay('OBJ_002')) throw new Error('no procesó el seleccionado');
  });
  const rBad = await pm.enrichCollection('p1', { objetos: ['NO_EXISTE'] });
  t('selección que no existe → 0 procesados, sin excepción', () => {
    if (rBad.total !== 0 || rBad.enriched !== 0) throw new Error(JSON.stringify(rBad));
  });

  // B4 — destino explícito
  reset();
  r = await pm.enrichCollection('p1', {
    exportDir: '/destino/elegido', formatos: { pdf: true, csvColeccion: false, efa: false },
  });
  t('exportDir manda sobre la carpeta por defecto', () => {
    if (!FS.has('/destino/elegido/OBJ_001_reporte_MAO.pdf')) throw new Error('no escribió en el destino elegido');
    if (r.exportDir !== '/destino/elegido') throw new Error('exportDir devuelto: ' + r.exportDir);
  });

  // B5 — exportación pura
  reset();
  const antes = FS.get(`${BASE}/OBJ_001/metricas.json`);
  r = await pm.enrichCollection('p1', {
    recalcular: false, formatos: { pdf: true, csvColeccion: true, efa: false },
  });
  t('recalcular:false no reescribe metricas.json', () => {
    if (FS.get(`${BASE}/OBJ_001/metricas.json`) !== antes) throw new Error('metricas.json fue modificado');
  });
  t('recalcular:false sí exporta', () => {
    if (!hay('_reporte_MAO.pdf')) throw new Error('sin PDF');
  });
  t('recalcular:false se refleja en el retorno y en el nombre del CSV', () => {
    if (r.recalculado !== false) throw new Error('recalculado=' + r.recalculado);
    if (!hay('_exportado_')) throw new Error('el CSV no usa el sufijo _exportado_');
  });
  t('el retorno informa qué formatos se escribieron', () => {
    if (!r.formatos || r.formatos.pdf !== true || r.formatos.efa !== false) {
      throw new Error('formatos=' + JSON.stringify(r.formatos));
    }
  });

  // B6 — TPS de colección (ADR-021): un espécimen (contorno) por pieza
  reset();
  r = await pm.enrichCollection('p1', {
    recalcular: false, formatos: { pdf: false, csvColeccion: false, efa: false, tps: true },
  });
  const rutaTps = rutas().find(p => p.endsWith('_contornos_semilandmarks.tps'));
  t('formatos {tps} escribe el TPS de colección y curveslide.csv', () => {
    if (!rutaTps) throw new Error('sin TPS de colección: ' + rutas().join(', '));
    if (!hay('curveslide.csv')) throw new Error('sin curveslide.csv');
  });
  t('el TPS de colección tiene un espécimen por pieza, todos con el mismo N', () => {
    const tps = FS.get(rutaTps) || '';
    const lms = [...tps.matchAll(/^LM=(\d+)$/gm)].map(m => m[1]);
    if (lms.length !== 2) throw new Error('especímenes=' + lms.length);
    if (new Set(lms).size !== 1 || lms[0] !== String(win.MaoInteropGMM.N_SEMILANDMARKS)) throw new Error('LM=' + lms.join('/'));
    if (!/ID=OBJ_001/.test(tps) || !/ID=OBJ_002/.test(tps)) throw new Error('faltan ID=');
  });
  t('SCALE= sale de las métricas (20 mm / 200 px), no del 1 de geometria.json', () => {
    const tps = FS.get(rutaTps) || '';
    if ((tps.match(/^SCALE=0\.10000000$/gm) || []).length !== 2) throw new Error('SCALE: ' + (tps.match(/^SCALE=.*$/gm) || []).join(' '));
  });
  t('curveslide.csv describe una curva cerrada de N puntos (el 1 fijo, como geomorph)', () => {
    const cs = (FS.get(rutas().find(p => p.endsWith('curveslide.csv'))) || '').trim().split('\n');
    const N = win.MaoInteropGMM.N_SEMILANDMARKS;
    if (cs[0] !== 'before,slide,after' || cs.length !== N || cs[1] !== '1,2,3' || cs[N - 1] !== `${N - 1},${N},1`) {
      throw new Error(cs.slice(0, 2).join(' / ') + ' … ' + cs[cs.length - 1]);
    }
  });

  // B7 — EFA retroactivo: las opciones del puente se llaman nHarmonics/scalePxMm
  const BASE2 = '/proy/Sitio Y';
  sembrarProyecto(BASE2, [{ carpeta: 'OBJ_SIN_EFA', nombreObjeto: 'Lasca' }]);
  const docSinEfa = JSON.parse(FS.get(`${BASE2}/OBJ_SIN_EFA/metricas.json`));
  delete docSinEfa.objeto._efa_data;
  // el EFA retroactivo exige ≥ 8 puntos: dodecágono en vez del cuadrado del fixture
  docSinEfa.objeto._contour_data.points = Array.from({ length: 12 }, (_, i) =>
    [200 + 80 * Math.cos(Math.PI * i / 6), 180 + 80 * Math.sin(Math.PI * i / 6)]);
  FS.set(`${BASE2}/OBJ_SIN_EFA/metricas.json`, JSON.stringify(docSinEfa));
  const project2 = { id: 'p2', name: 'Sitio Y', folderPath: BASE2 };
  pm.projects = [project, project2];
  pm.getProject = (id) => ({ p1: project, p2: project2 })[id] || null;
  pm.loadProjectCollection = async (id) => (id === 'p2'
    ? { nombre: 'Sitio Y', folderPath: BASE2,
        objetos: [{ carpeta: 'OBJ_SIN_EFA', nombreObjeto: 'Lasca', cara: 'Mono', modo: 'monofacial', timestamp: '2026-08-01T10:00:00Z' }] }
    : { nombre: 'Sitio X', folderPath: BASE,
        objetos: OBJS.map(o => ({ ...o, cara: 'Mono', modo: 'monofacial', timestamp: '2026-08-01T10:00:00Z' })) });
  const opcionesEfa = [];
  win.PythonBridge = { efa: { calculate: async (pts, op) => { opcionesEfa.push(op); return { status: 'ok', coefficients: [[1, 0, 0, 1]] }; } } };
  await pm.enrichCollection('p2', { formatos: { pdf: false, csvColeccion: false, efa: true } });
  t('EFA retroactivo con 20 armónicos y la escala del análisis (antes: opciones ignoradas → px y «1 mm/px»)', () => {
    const op = opcionesEfa[0];
    if (!op) throw new Error('no se pidió el EFA retroactivo');
    if (op.nHarmonics !== 20 || op.scalePxMm !== 0.1) throw new Error('opciones=' + JSON.stringify(op));
  });
  delete win.PythonBridge;

  // ── Resultado ─────────────────────────────────────────────────────────────
  const total = ok + ko;
  console.log();
  if (ko === 0) {
    console.log(`✅  PASS  ${total}/${total} casos`);
    console.log();
  } else {
    console.log(`❌  FAIL  ${ok}/${total} casos — ${ko} fallidos:\n`);
    fallos.forEach(f => console.log('  ' + f));
    console.log();
    process.exit(1);
  }
})().catch(err => {
  console.error('\n❌ El harness abortó:', err && err.stack);
  process.exit(1);
});
