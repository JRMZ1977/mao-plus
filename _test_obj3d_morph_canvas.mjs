/**
 * _test_obj3d_morph_canvas.mjs
 * Smoke test del módulo de overlays geométricos (Fase 4).
 *
 * Carga `js/obj3d-morph-canvas.js` en un sandbox VM, mockea canvas/ctx
 * y verifica:
 *   1. La API pública se expone correctamente.
 *   2. `draw()` no lanza errores con datos válidos.
 *   3. Cada capa activa produce las llamadas de dibujo esperadas.
 *   4. Capas desactivadas no producen llamadas.
 *
 * Ejecutar: node _test_obj3d_morph_canvas.mjs
 */

import { readFileSync } from 'fs';
import { createContext, runInContext } from 'vm';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SCRIPT = readFileSync(resolve(__dir, 'js/obj3d-morph-canvas.js'), 'utf-8');

// ─── Mock canvas/ctx que registra llamadas ─────────────────────────────────
function makeCtxMock() {
  const calls = [];
  const rec = (m, ...a) => calls.push([m, ...a]);
  return {
    calls,
    save:        () => rec('save'),
    restore:     () => rec('restore'),
    beginPath:   () => rec('beginPath'),
    closePath:   () => rec('closePath'),
    moveTo:      (x, y) => rec('moveTo', x, y),
    lineTo:      (x, y) => rec('lineTo', x, y),
    arc:         (x, y, r, a0, a1) => rec('arc', x, y, r, a0, a1),
    stroke:      () => rec('stroke'),
    fill:        () => rec('fill'),
    setLineDash: (a) => rec('setLineDash', a),
    set strokeStyle(v) { rec('set strokeStyle', v); this._stroke = v; },
    get strokeStyle()   { return this._stroke; },
    set fillStyle(v)   { rec('set fillStyle', v); this._fill = v; },
    get fillStyle()     { return this._fill; },
    set lineWidth(v)   { rec('set lineWidth', v); this._lw = v; },
    get lineWidth()     { return this._lw; },
  };
}

// ─── Cargar módulo en sandbox ───────────────────────────────────────────────
const sandbox = { window: {}, console };
sandbox.window.console = console;
createContext(sandbox);
runInContext(SCRIPT, sandbox);

const API = sandbox.window.MAO_Obj3dMorphOverlays;

// ─── Aserciones ─────────────────────────────────────────────────────────────
const checks = [];
function check(label, cond, detail = '') {
  checks.push({ label, ok: !!cond, detail });
  const tag = cond ? '✅' : '❌';
  console.log(`${tag} ${label}${detail ? '   — ' + detail : ''}`);
}

// 1. API expuesta
check('API expuesta en window.MAO_Obj3dMorphOverlays', !!API);
check('API.draw es función', typeof API?.draw === 'function');
check('API.defaultLayers es función', typeof API?.defaultLayers === 'function');
check('API.LAYER_DEFS es array con ≥10 capas', Array.isArray(API?.LAYER_DEFS) && API.LAYER_DEFS.length >= 10);
check('API.PALETTE tiene claves esperadas',
      API?.PALETTE?.convex_hull && API?.PALETTE?.axis_major && API?.PALETTE?.centroid_hull);
check('API.PALETTE incluye analysis_contour', !!API?.PALETTE?.analysis_contour);
check('LAYER_DEFS incluye analysis_contour',
      API?.LAYER_DEFS?.some(d => d.id === 'analysis_contour'));

// 2. defaultLayers() retorna todas activas
const layers = API.defaultLayers();
const allActive = API.LAYER_DEFS.every(d => layers[d.id] === true);
check('defaultLayers() activa todas las capas', allActive);

// 3. draw() con overlays completos sobre proyección sintética
const geom = {
  centroid:        [5, 5],
  centroid_hull:   [5, 5],
  axis_major:      [[0, 5], [10, 5]],
  axis_minor:      [[5, 0], [5, 10]],
  feret_max_segment: [[0, 0], [10, 10]],
  feret_min_segment: [[0, 10], [10, 0]],
  radius_max_point:  [10, 5],
  radius_min_point:  [5, 0],
  radius_max_segment: [[5, 5], [10, 5]],
  radius_min_segment: [[5, 5], [5, 0]],
  convex_hull:      [[0, 0], [10, 0], [10, 10], [0, 10]],
  bbox_oriented:    [[0, 0], [10, 0], [10, 10], [0, 10]],
  inscribed_circle:    { center: [5, 5], radius: 5 },
  circumscribed_circle:{ center: [5, 5], radius: 7.07 },
  analysis_contour: [[0, 0], [10, 0], [10, 10], [0, 10]],
};
const projection = {
  scale: 30, offU: 50, offV: 50,
  minU: 0, minV: 0, H: 400, W: 400,
};

let drewOk = true;
let ctxFull = makeCtxMock();
try {
  API.draw(ctxFull, geom, projection, API.defaultLayers());
} catch (e) {
  drewOk = false;
  console.error('draw() lanzó error:', e);
}
check('draw() con todas las capas activas no lanza', drewOk);

// 4. Llamadas esperadas: arc (círculos+puntos), moveTo/lineTo (segmentos/polígonos)
const arcCalls    = ctxFull.calls.filter(c => c[0] === 'arc').length;
const lineToCalls = ctxFull.calls.filter(c => c[0] === 'lineTo').length;
const setDashCalls = ctxFull.calls.filter(c => c[0] === 'setLineDash').length;
// Esperado: ≥4 arcs (2 círculos + 2 dots), ≥10 lineTo (segmentos + polígonos)
check(`>=4 arcs dibujados (círculos + centroides): ${arcCalls}`, arcCalls >= 4);
check(`>=10 lineTo dibujados (segmentos + polígonos): ${lineToCalls}`, lineToCalls >= 10);
check(`setLineDash invocado (capas punteadas): ${setDashCalls}`, setDashCalls >= 2);

// 5. Capas desactivadas → menos llamadas
const ctxNone = makeCtxMock();
const allOff = {};
for (const d of API.LAYER_DEFS) allOff[d.id] = false;
API.draw(ctxNone, geom, projection, allOff);
check(`Sin capas activas: 0 arcs (got ${ctxNone.calls.filter(c=>c[0]==='arc').length})`,
      ctxNone.calls.filter(c => c[0] === 'arc').length === 0);
check(`Sin capas activas: 0 lineTo (got ${ctxNone.calls.filter(c=>c[0]==='lineTo').length})`,
      ctxNone.calls.filter(c => c[0] === 'lineTo').length === 0);

// 6. Solo convex_hull activo
const ctxOnlyHull = makeCtxMock();
const onlyHull = { ...allOff, convex_hull: true };
API.draw(ctxOnlyHull, geom, projection, onlyHull);
check(`Solo hull: 0 arcs`,
      ctxOnlyHull.calls.filter(c => c[0] === 'arc').length === 0);
check(`Solo hull: ≥4 lineTo (polígono cerrado)`,
      ctxOnlyHull.calls.filter(c => c[0] === 'lineTo').length >= 3);

// 7. Robustez: geom con _error no debe lanzar
let safeErr = true;
try {
  API.draw(makeCtxMock(), { _error: 'overlay_failed: ...' }, projection, layers);
} catch (e) { safeErr = false; }
check('geom._error no lanza (retorna silenciosamente)', safeErr);

// 8. Robustez: geom incompleto (sin algunas capas) no lanza
let partialOk = true;
try {
  API.draw(makeCtxMock(), { centroid: [5, 5], convex_hull: [[0,0],[10,0],[10,10],[0,10]] },
           projection, layers);
} catch (e) { partialOk = false; }
check('geom parcial no lanza', partialOk);

// 9. Proyección: verificar fórmula básica vía intercepción de moveTo
const ctxProj = makeCtxMock();
API.draw(ctxProj, { convex_hull: [[0, 0], [10, 0], [10, 10], [0, 10]] },
         projection, { ...allOff, convex_hull: true });
// Primer moveTo debe ser proyección de (0,0):
//   x = offU + (0 - minU) * scale = 50 + 0 = 50
//   y = H - (offV + (0 - minV) * scale) = 400 - 50 = 350
const firstMove = ctxProj.calls.find(c => c[0] === 'moveTo');
check(`Proyección (0,0) → (50, 350): got (${firstMove?.[1]}, ${firstMove?.[2]})`,
      firstMove && Math.abs(firstMove[1] - 50) < 0.01 && Math.abs(firstMove[2] - 350) < 0.01);

// ─── Resumen final ──────────────────────────────────────────────────────────
const passed = checks.filter(c => c.ok).length;
const failed = checks.length - passed;
console.log(`\n${'─'.repeat(60)}`);
console.log(`Resultado: ${passed}/${checks.length} aserciones OK (${failed} fallidas)`);
if (failed > 0) process.exit(1);
