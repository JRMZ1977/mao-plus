#!/usr/bin/env node
/**
 * Verificación VISUAL de la aplicación real, con capturas.
 *
 * Arranca Electron, lo conduce por el puerto de depuración (CDP) usando el hook
 * `__maoE2E` de ADR-010 y guarda capturas del lienzo y de la tarjeta §6. Sirve
 * para lo que `node --check` y la suite no ven: que una capa se DIBUJE, que un
 * botón EXISTA y que el estado fluya de la acción a la pantalla.
 *
 * Nació para cerrar ADR-017 F5 y en su primera pasada encontró dos defectos que
 * llevaban fases sin detectarse (ver `docs/VERIFICACION-VISUAL-ELECTRON.md`).
 *
 * USO — con una fotografía real:
 *
 *   node tools/verificacion_visual_electron.mjs \
 *        --imagen "/Users/tu/Documents/…/DRG_19-15/DRG_19-15_042.jpg"
 *
 * Con un fixture sintético del repo (nombre corto, sin ruta):
 *
 *   node tools/verificacion_visual_electron.mjs --imagen sintetico_fragmento_disco.png \
 *        --focal 100 --sensor 35.9x23.9 --apertura 8
 *
 * ⚠ La imagen debe estar DENTRO del directorio de usuario: `main.js` rechaza
 *   rutas fuera de `os.homedir()` (guard deliberado, no lo toque).
 *
 * ⚠ Una foto de cámara trae EXIF y la escala sale sola. Un CR3 no —exifr no
 *   implementa el formato de Canon— y entonces hacen falta `--focal`,
 *   `--sensor` y `--apertura`, igual que pide la propia barra de estado.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';
import { platform } from 'node:process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.error('Falta playwright-core. Instálelo con:  npm install -D playwright-core');
  process.exit(2);
}

// ── Argumentos ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const arg = (n, def = null) => {
  const i = args.indexOf('--' + n);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const flag = (n) => args.includes('--' + n);

const imagen = arg('imagen');
if (!imagen || flag('help')) {
  console.log(`Uso: node tools/verificacion_visual_electron.mjs --imagen <ruta|fixture> [opciones]

  --imagen <x>      ruta absoluta a una foto, o el nombre de un fixture del repo
  --salida <dir>    dónde dejar las capturas (por defecto ./verificacion-visual)
  --objeto <n>      índice del objeto a analizar (0 = el primero). Útil cuando la
                    foto trae escala o carta de color además de la pieza
  --focal <mm>      datos de cámara a mano, para imágenes sin EXIF legible (CR3)
  --sensor <AxB>    p. ej. 35.9x23.9
  --apertura <f>
  --distancia <mm>  distancia cámara-objeto (por defecto 1000)
  --plantillas <a,b> repertorio a probar (por defecto el del botón)
  --puerto <n>      puerto de depuración (por defecto 9222)
  --mantener        no cerrar Electron al terminar, para inspeccionar a mano`);
  process.exit(imagen ? 0 : 2);
}

const SALIDA = resolve(arg('salida', join(ROOT, 'verificacion-visual')));
const PUERTO = Number(arg('puerto', '9222'));
const OBJETO = Number(arg('objeto', '0'));
const DIST = Number(arg('distancia', '1000'));
const FOCAL = arg('focal');
const APERTURA = arg('apertura');
const SENSOR = arg('sensor');
const PLANTILLAS = arg('plantillas');
const esRuta = imagen.startsWith('/') || imagen.startsWith('~');

if (esRuta && !existsSync(imagen.replace('~', process.env.HOME || '~'))) {
  console.error(`No existe la imagen: ${imagen}`);
  process.exit(2);
}
mkdirSync(SALIDA, { recursive: true });

// ── Arranque de Electron ────────────────────────────────────────────────────

const bin = join(ROOT, 'node_modules', '.bin', 'electron');
if (!existsSync(bin)) {
  console.error('Falta Electron. Ejecute `npm install` en la raíz del repositorio.');
  process.exit(2);
}
const flags = ['.', `--remote-debugging-port=${PUERTO}`];
// En un servidor sin pantalla hace falta un X virtual; en macOS no.
const sinPantalla = platform === 'linux' && !process.env.DISPLAY;
if (sinPantalla) flags.push('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage');

console.log(`▶ Arrancando Electron${sinPantalla ? ' (Xvfb)' : ''}…`);
// `detached` crea un GRUPO de procesos propio. Hace falta porque con xvfb-run
// Electron es un NIETO: matar al padre deja al nieto vivo, el proceso de node no
// puede terminar y la herramienta se queda colgada tras hacer su trabajo.
const opciones = { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true };
const hijo = sinPantalla
  ? spawn('xvfb-run', ['-a', '--server-args=-screen 0 1680x1050x24', bin, ...flags], opciones)
  : spawn(bin, flags, opciones);

let logApp = '';
hijo.stdout.on('data', (d) => { logApp += d; });
hijo.stderr.on('data', (d) => { logApp += d; });

const matarApp = () => {
  if (flag('mantener')) return;
  try { process.kill(-hijo.pid, 'SIGTERM'); } catch { try { hijo.kill(); } catch { /* ya no está */ } }
};
process.on('exit', matarApp);
process.on('SIGINT', () => { matarApp(); process.exit(130); });

// ── Espera a que el puerto de depuración responda ──────────────────────────

let br = null;
for (let i = 0; i < 90 && !br; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  try { br = await chromium.connectOverCDP(`http://127.0.0.1:${PUERTO}`); } catch { /* aún no */ }
}
if (!br) {
  console.error('Electron no expuso el puerto de depuración. Log:\n' + logApp.slice(-1500));
  process.exit(1);
}

const ctx = br.contexts()[0];
let page = ctx.pages().find((p) => p.url().includes('index.html'));
for (let i = 0; i < 30 && !page; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  page = br.contexts()[0].pages().find((p) => p.url().includes('index.html'));
}
if (!page) { console.error('No se encontró la ventana de la aplicación.'); process.exit(1); }

const errores = [];
page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().slice(0, 160)); });

console.log('▶ Esperando al hook de verificación (ADR-010) y al backend…');
await page.waitForFunction(() => !!window.__maoE2E && !!window.__maoForma, null, { timeout: 120000 });
await page.waitForFunction(
  () => window.PythonBridge && window.PythonBridge.isAvailable && window.PythonBridge.isAvailable(),
  null, { timeout: 120000 }).catch(() => console.warn('  ⚠ el backend Python no respondió; se seguirá igualmente'));

// ── Flujo ───────────────────────────────────────────────────────────────────

const paso = (t) => console.log('▶ ' + t);

paso(`Cargando ${basename(imagen)}…`);
await page.evaluate(async (src) => { await window.__maoE2E.cargar(src); }, imagen);

// Datos de cámara: sólo si se piden a mano. Con EXIF la carga ya los rellenó.
if (FOCAL || SENSOR || APERTURA) {
  const [sw, sh] = (SENSOR || 'x').split('x');
  await page.evaluate((v) => {
    const s = (id, val) => {
      const n = document.getElementById(id);
      if (!n || val === null || val === undefined || val === '') return;
      n.value = val;
      n.dispatchEvent(new Event('input', { bubbles: true }));
      n.dispatchEvent(new Event('change', { bubbles: true }));
    };
    s('focalInput', v.focal); s('apertureInput', v.apertura);
    s('sensorWidthInput', v.sw); s('sensorHeightInput', v.sh);
  }, { focal: FOCAL, apertura: APERTURA, sw, sh });
}

paso('Calculando escala…');
await page.evaluate(async (d) => { await window.__maoE2E.escala({ distanciaMm: d }); }, DIST);
// La condición real es que el botón de detectar quede habilitado, no lo que diga
// la barra de estado: el cálculo es asíncrono y el mensaje anterior sigue ahí un
// instante. Leerlo demasiado pronto daba un falso «sin escala».
let escalaOk = false;
for (let i = 0; i < 12 && !escalaOk; i++) {
  await page.waitForTimeout(500);
  escalaOk = await page.evaluate(() => {
    const b = document.getElementById('detectarObjetosBtn');
    return !!b && !b.disabled;
  });
}
console.log('   ' + await page.evaluate(() =>
  document.getElementById('status')?.textContent?.trim().slice(0, 120)));
if (!escalaOk) {
  console.error('\n✖ Sin escala no se puede detectar: el botón sigue deshabilitado.');
  console.error('  Si la imagen no trae EXIF legible (CR3), repita con --focal, --sensor y --apertura.');
  process.exit(1);
}

paso('Identificando y detectando…');
await page.evaluate(async () => {
  await window.__maoE2E.identificar('VERIF_VISUAL');
  await window.__maoE2E.detectar();
  await window.__maoE2E.analizar();
});

const objs = await page.evaluate(() => (window.objects || []).map((o, i) => ({
  i, area: Math.round(o.area || 0), conf: o.detection_confidence,
  nivel: o.confidence_level, contorno: (o.contour_points || []).length,
})));
console.log('   objetos detectados:', JSON.stringify(objs));
if (!objs.length) { console.error('✖ Sin objetos. ¿Fondo poco contrastado?'); process.exit(1); }
if (OBJETO >= objs.length) { console.error(`✖ No hay objeto ${OBJETO}.`); process.exit(1); }

paso(`Abriendo el análisis del objeto ${OBJETO}…`);
await page.evaluate((i) => {
  const o = window.objects[i];
  window.mostrarAnalisisMorfologico(o, o.analisisCached && o.analisisCached.metricas);
  window.maoTabRouter.unlock('analisis');
  window.maoTabRouter.go('captura');           // el lienzo vive en ② Captura
}, OBJETO);
await page.waitForTimeout(1000);

const lienzo = page.locator('#canvas');
await lienzo.screenshot({ path: join(SALIDA, '1_sin_plantilla.png') });

paso('Emparejando la plantilla…');
await page.evaluate(async (rep) => {
  const cao = window.currentAnalyzedObject;
  const pts = (cao.obj.contour_data && cao.obj.contour_data.points) || cao.obj.contour_points;
  const opts = rep ? { templates: rep.split(',') } : undefined;
  const r = await window.PythonBridge.shapeTemplate.match(pts, opts);
  cao.obj.plantillaEvaluada = true;
  cao.obj.plantillaCandidata = r || null;
  cao.obj.plantillaDescartada = false;
  document.dispatchEvent(new CustomEvent('mao:plantilla-overlay:toggle', { detail: { visible: true } }));
}, PLANTILLAS);
await page.waitForTimeout(1500);

const r = await page.evaluate(() => {
  const c = window.currentAnalyzedObject.obj.plantillaCandidata || {};
  const pres = c.plantilla_contorno_presente || [];
  return {
    tipo: c.plantilla_tipo, completitud: c.plantilla_completitud,
    arco_fraccion: c.plantilla_arco_fraccion, residuo_rms: c.plantilla_residuo_rms,
    confianza: c.plantilla_confianza_nivel, metodo: c.plantilla_metodo,
    puntos_polilinea: (c.plantilla_contorno || []).length,
    puntos_respaldados: pres.filter(Boolean).length,
    motivo_rechazo: c.motivo_rechazo,
    alternativas: (c.candidatos || []).filter((x) => x.aceptada)
      .map((x) => `${x.tipo} ${Number(x.completitud).toFixed(0)}%`),
  };
});
console.log('\n── RESULTADO ───────────────────────────────────────────────');
for (const [k, v] of Object.entries(r)) console.log(`  ${k.padEnd(19)} ${JSON.stringify(v)}`);
if (r.puntos_polilinea && r.puntos_respaldados !== undefined) {
  const dibujado = (r.puntos_respaldados / r.puntos_polilinea) * 100;
  console.log(`  ${'→ dibujo vs dato'.padEnd(19)} ${dibujado.toFixed(1)} % respaldado en la ` +
              `polilínea frente a ${r.completitud} % de completitud`);
}
console.log('────────────────────────────────────────────────────────────\n');

await lienzo.screenshot({ path: join(SALIDA, '2_con_plantilla.png') });
for (let i = 0; i < 4; i++) { await page.click('#zoomInBtn'); await page.waitForTimeout(200); }
await page.waitForTimeout(600);
await lienzo.screenshot({ path: join(SALIDA, '3_con_plantilla_zoom.png') });
await page.click('#resetZoom').catch(() => {});

paso('Capturando la tarjeta §6…');
await page.evaluate(() => {
  window.maoTabRouter.go('analisis');
  const s = document.querySelector('details[data-sec="sec6"]');
  if (s) { s.open = true; s.scrollIntoView(); }
});
await page.waitForTimeout(1200);
const sec = page.locator('details[data-sec="sec6"]');
if (await sec.count()) await sec.screenshot({ path: join(SALIDA, '4_tarjeta.png') });

console.log('Capturas en:', SALIDA);
console.log(errores.length ? `⚠ ${errores.length} error(es) de consola:\n  ` + errores.slice(0, 8).join('\n  ')
                           : '✅ Sin errores de consola.');
if (flag('mantener')) {
  console.log('(--mantener: Electron sigue abierto para inspección manual)');
} else {
  await br.close().catch(() => {});
  matarApp();
  process.exit(errores.length ? 0 : 0);   // el trabajo ya está hecho; no esperar al nieto
}
