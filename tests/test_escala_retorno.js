/**
 * Escala — `calcularEscala()` debe DEVOLVER la escala que calcula.
 *
 * Regresión hallada al verificar en Electron el menú «Exportar colección…» (1.3.0):
 * la función fijaba la variable `scale` pero solo devolvía valor en la rama de
 * corrección manual. Sus usuarios la leen como valor —`calcularEscala() || 1`— en
 * geometria.json (`escala.factorConversion`), en `distanciaAlCentro` de cada P/H y en
 * `scale_factor_mm_per_px` de la exportación JSON. Con `undefined` todos guardaban
 * 1 mm/px, y el SVG del lote declaraba 261 mm para una pieza de 117 mm.
 *
 * Extrae la función REAL de analysis-core.js y la ejecuta en un sandbox `vm` con las
 * variables del IIFE que lee.
 *
 * Uso:  node tests/test_escala_retorno.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'analysis-core.js'), 'utf8');

function extraerFuncion(nombre) {
  const firma = `function ${nombre}(`;
  const inicio = SRC.indexOf(firma);
  if (inicio === -1) throw new Error(`no se encontró ${firma}`);
  if (SRC.indexOf(firma, inicio + 1) !== -1) throw new Error(`${firma} está declarada más de una vez`);
  let profundidad = 0;
  for (let i = SRC.indexOf('{', inicio); i < SRC.length; i++) {
    if (SRC[i] === '{') profundidad++;
    else if (SRC[i] === '}' && --profundidad === 0) return SRC.slice(inicio, i + 1);
  }
  throw new Error(`llaves sin cerrar en ${nombre}`);
}

const noop = () => {};
function contexto(extra = {}) {
  const ctx = vm.createContext({
    console: { log: noop, warn: noop, error: noop },
    window: {},
    scale: null,
    modoAnalisis: 'monofacial',
    image: {}, imageWidth: 800, imageHeight: 600,
    imageCaraA: null, imageCaraB: null,
    imageWidthCaraA: 0, imageHeightCaraA: 0, imageWidthCaraB: 0, imageHeightCaraB: 0,
    anchoImagen: 0, altoImagen: 0,
    archivosComplementarios: { vinculados: false },
    focalInput: { value: '100' }, distanciaInput: { value: '1000' },
    sensorWidthInput: { value: '35.9' }, sensorHeightInput: { value: '23.9' },
    scaleDisplay: {},
    UtilityHelpers: { setStatus: noop },
    MetricsOrchestrator: { estimarErrorOptico: () => null },
    objects: [],
    setTimeout: noop, requestAnimationFrame: noop, redraw: noop, actualizarObjetosIndividuales: noop,
    calcularEscalaHibrida: function () { ctx.scale = 0.3; },
    ...extra,
  });
  vm.runInContext(extraerFuncion('calcularEscala'), ctx);
  return ctx;
}

const resultados = [];
const check = (nombre, ok, detalle = '') => resultados.push([nombre, Boolean(ok), detalle]);

// A · monofacial: escala = (sensor / ancho) · (distancia / focal) = 35,9/800 · 10
{
  const ctx = contexto();
  const r = vm.runInContext('calcularEscala()', ctx);
  check('A · devuelve la escala calculada (0,44875 mm/px)', Math.abs(r - 0.44875) < 1e-12, `devolvió ${r}`);
  check('A · lo devuelto coincide con la variable `scale`', r === ctx.scale, `scale=${ctx.scale}`);
  check('A · `calcularEscala() || 1` ya no cae a 1', (r || 1) !== 1);
}
// B · híbrido JPG+RAW: delega y devuelve lo que la híbrida fijó
{
  const ctx = contexto({ archivosComplementarios: { vinculados: true } });
  const r = vm.runInContext('calcularEscala()', ctx);
  check('B · ruta híbrida devuelve la escala fijada por calcularEscalaHibrida', r === 0.3, `devolvió ${r}`);
}
// C · corrección manual activa: sigue devolviendo la escala corregida
{
  const ctx = contexto({ scale: 0.25, window: { escalaCorregida: { activa: true, factorCorreccion: 1.02 } } });
  const r = vm.runInContext('calcularEscala()', ctx);
  check('C · corrección manual activa devuelve la escala corregida', r === 0.25, `devolvió ${r}`);
}
// D · faltan parámetros: no inventa una escala
{
  const ctx = contexto({ focalInput: { value: '' } });
  const r = vm.runInContext('calcularEscala()', ctx);
  check('D · sin focal no devuelve escala', !r && ctx.scale === null, `devolvió ${r}`);
}

let fallos = 0;
for (const [nombre, ok, detalle] of resultados) {
  console.log(`${ok ? '✓' : '✗'} ${nombre}${ok ? '' : ' — ' + detalle}`);
  if (!ok) fallos++;
}
if (fallos) {
  console.log(`RESULTADO: ${fallos} de ${resultados.length} comprobaciones fallan`);
  process.exit(1);
}
console.log(`RESULTADO: todas las comprobaciones pasan (${resultados.length})`);
