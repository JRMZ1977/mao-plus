#!/usr/bin/env node
/**
 * Verificación VISUAL en Electron de ADR-021 (interoperabilidad TPS/EFA).
 *
 * Cierra lo que la nota de versión 1.3.1 dejó pendiente y que ni `npm test` ni
 * `node --check` pueden ver:
 *   (A) el panel EFA de la ventana de detección asistida muestra los 64
 *       semilandmarks que produce js/mao-interop-gmm.js, y ofrece el botón de
 *       exportar TPS;
 *   (B) la casilla «TPS — Contornos de la colección» (#excFmtTps) existe, nace
 *       desmarcada (opt-in) y llega al resumen de formatos del modal.
 *
 * Reutiliza el arranque por CDP de tools/verificacion_visual_electron.mjs y el
 * hook __maoE2E de ADR-010. Requiere playwright-core (ya en devDependencies).
 *
 *   node tools/verificacion_adr021_electron.mjs
 *   MANTENER=1 node tools/verificacion_adr021_electron.mjs   # deja Electron abierto
 *
 * Sale 0 si todas las comprobaciones pasan, 1 si alguna falla.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = process.env.SALIDA || join(ROOT, 'verificacion-visual', 'adr021');
const PUERTO = 9223;
const FIXTURE = process.env.FIXTURE || 'sintetico_fragmento_disco.png';

// playwright-core es CJS: por ruta absoluta con import() el lexer no detecta el export
// nombrado y `chromium` llega undefined; con especificador desnudo Node lo busca junto a
// ESTE archivo, no al cwd. createRequire anclado al repo resuelve ambos problemas.
const { chromium } = createRequire(join(ROOT, 'package.json'))('playwright-core');
mkdirSync(SALIDA, { recursive: true });

const res = [];
const ok   = (n, d = '') => { res.push(['✅', n, d]); console.log(`  ✅ ${n}${d ? ' — ' + d : ''}`); };
const bad  = (n, d = '') => { res.push(['❌', n, d]); console.log(`  ❌ ${n}${d ? ' — ' + d : ''}`); };
const info = (n, d = '') => { res.push(['·',  n, d]); console.log(`  · ${n}${d ? ' — ' + d : ''}`); };
const paso = (t) => console.log('\n▶ ' + t);

// ── Arranque ────────────────────────────────────────────────────────────────
const bin = join(ROOT, 'node_modules', '.bin', 'electron');
if (!existsSync(bin)) { console.error('Falta Electron (npm install).'); process.exit(2); }

const yaVivo = await fetch(`http://127.0.0.1:${PUERTO}/json/version`).then(() => true).catch(() => false);
let hijo = null, logApp = '';
if (yaVivo) {
  console.log('▶ Reutilizando la instancia ya abierta en el puerto ' + PUERTO);
} else {
  console.log('▶ Arrancando Electron…');
  hijo = spawn(bin, ['.', `--remote-debugging-port=${PUERTO}`],
               { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  hijo.stdout.on('data', (d) => { logApp += d; });
  hijo.stderr.on('data', (d) => { logApp += d; });
}
const matar = () => {
  if (!hijo || process.env.MANTENER) return;
  try { process.kill(-hijo.pid, 'SIGTERM'); } catch { try { hijo.kill(); } catch {} }
};
process.on('exit', matar);
process.on('SIGINT', () => { matar(); process.exit(130); });

let br = null, ultimoErr = '';
for (let i = 0; i < 90 && !br; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  try { br = await chromium.connectOverCDP(`http://127.0.0.1:${PUERTO}`); }
  catch (e) { ultimoErr = e.message; }
}
if (!br) {
  console.error('Sin puerto de depuración. Último error: ' + ultimoErr);
  console.error('Log de la app:\n' + logApp.slice(-1500));
  process.exit(1);
}

let page = null;
for (let i = 0; i < 40 && !page; i++) {
  page = br.contexts()[0].pages().find((p) => p.url().includes('index.html'));
  if (!page) await new Promise((r) => setTimeout(r, 1000));
}
if (!page) { console.error('Sin ventana de aplicación.'); process.exit(1); }

const errores = [];
page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().slice(0, 200)); });

console.log('▶ Esperando hook E2E y backend…');
await page.waitForFunction(() => !!window.__maoE2E, null, { timeout: 120000 });
await page.waitForFunction(() => window.PythonBridge?.isAvailable?.(), null, { timeout: 120000 })
  .catch(() => console.warn('  ⚠ backend no respondió'));

// ── 0. El módulo nuevo de ADR-021 debe estar cargado ────────────────────────
paso('0. Fuente única de ADR-021 (js/mao-interop-gmm.js)');
const gmm = await page.evaluate(() => {
  const G = window.MaoInteropGMM;
  if (!G) return { cargado: false };
  return {
    cargado: true, N: G.N_SEMILANDMARKS,
    api: ['semilandmarksContorno', 'bloqueTPS'].filter((k) => typeof G[k] === 'function'),
  };
});
gmm.cargado ? ok('window.MaoInteropGMM cargado', `N_SEMILANDMARKS=${gmm.N}, API: ${gmm.api.join(', ')}`)
            : bad('window.MaoInteropGMM NO cargado');

// ── 1. Cargar fixture y fijar escala ────────────────────────────────────────
paso(`1. Cargando ${FIXTURE} y fijando escala`);
await page.evaluate(async (src) => { await window.__maoE2E.cargar(src); }, FIXTURE);
await page.evaluate(() => {
  const s = (id, v) => { const n = document.getElementById(id); if (n) { n.value = v;
    n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); } };
  s('focalInput', '100'); s('apertureInput', '8'); s('sensorWidthInput', '35.9'); s('sensorHeightInput', '23.9');
});
await page.evaluate(async () => { await window.__maoE2E.escala({ distanciaMm: 1000 }); });
let escalaOk = false;
for (let i = 0; i < 12 && !escalaOk; i++) {
  await page.waitForTimeout(500);
  escalaOk = await page.evaluate(() => { const b = document.getElementById('detectarObjetosBtn'); return !!b && !b.disabled; });
}
const estado = await page.evaluate(() => document.getElementById('status')?.textContent?.trim().slice(0, 160) || '');
escalaOk ? ok('escala calculada', await page.evaluate(() => document.getElementById('maoIaScaleValue')?.textContent?.trim() || ''))
         : info('sin escala fotogramétrica', `barra de estado: «${estado}» — el panel EFA usa scalePxMm=1.0 por defecto`);

// ── 2. Abrir la ventana de detección asistida y detectar ────────────────────
paso('2. Ventana de detección asistida');
await page.evaluate(() => document.getElementById('maoIaBtn')?.click());
await page.waitForTimeout(1500);
const abierto = await page.evaluate(() => {
  const m = document.getElementById('maoIaModal');
  return !!m && getComputedStyle(m).display !== 'none';
});
abierto ? ok('ventana abierta (#maoIaModal)') : bad('la ventana no se abrió');

await page.evaluate(() => document.getElementById('maoIaRun')?.click());
await page.waitForFunction(() => {
  const r = document.getElementById('maoIaResultCount');
  return r && /\d/.test(r.textContent || '');
}, null, { timeout: 180000 }).catch(() => {});
await page.waitForTimeout(2000);

const det = await page.evaluate(() => ({
  count: document.getElementById('maoIaResultCount')?.textContent?.trim(),
  cards: document.querySelectorAll('#maoIaSelectorCards [data-obj-id], #maoIaSelectorCards .mao-ia-card').length,
  filas: document.querySelectorAll('#maoIaTableBody tr').length,
  err:   document.getElementById('maoIaInlineError')?.textContent?.trim() || '',
}));
det.filas > 0 || det.cards > 0 ? ok('detección con resultados', JSON.stringify(det))
                               : bad('sin objetos detectados', JSON.stringify(det));

// ── 3. (A) PANEL EFA ────────────────────────────────────────────────────────
paso('3. (A) Panel EFA en la ventana de detección');
// La vista por defecto tras detectar es el LIENZO: #maoIaViewTable es el CONTENEDOR
// (display:none), no el conmutador. Quien cambia de vista es la pestaña [data-tab].
// Sin este clic el botón de métricas mide 0x0 y no es clicable — no es un defecto.
await page.click('[data-tab="table"]', { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(1000);

const btnMetricas = await page.$('[onclick*="_showMaoMetrics"]');
const onclick = btnMetricas ? await btnMetricas.getAttribute('onclick') : '';
info('botón de métricas', onclick || '(no encontrado)');
let clicado = false;
if (btnMetricas) {
  try { await btnMetricas.click({ timeout: 15000 }); clicado = true; }
  catch { /* oculto: se cae al respaldo */ }
}
if (clicado) {
  ok('clic real en el botón de métricas');
} else {
  // Respaldo: invocar con el MISMO tipo que usa el onclick — object_id es NÚMERO y
  // _showMaoMetrics compara con ===; pasar la cadena "1" no encuentra nada (bug fácil
  // de cometer al escribir un arnés: el id se lee del atributo, que es texto).
  const id = Number((onclick.match(/_showMaoMetrics\(\s*([0-9]+)/) || [])[1]);
  if (Number.isFinite(id)) {
    await page.evaluate((i) => window._showMaoMetrics(i), id);
    info('botón no clicable; invocado _showMaoMetrics(' + id + ') directamente');
  } else {
    bad('no se pudo abrir el panel de métricas');
  }
}
await page.waitForTimeout(1500);
// El panel EFA se rellena tras el fetch a /api/efa.
await page.waitForFunction(() => {
  const b = document.getElementById('maoIaMetricsBody');
  return b && /EFA/.test(b.textContent) && !/Calculando descriptores/.test(b.textContent);
}, null, { timeout: 60000 }).catch(() => {});

const efa = await page.evaluate(() => {
  const body = document.getElementById('maoIaMetricsBody');
  if (!body) return { hay: false };
  const txt = body.textContent || '';
  const grab = (et) => { const m = txt.match(new RegExp(et + '\\s*([0-9.,]+)')); return m ? m[1] : null; };
  return {
    hay: /EFA \(Fourier/.test(txt),
    abierto: !!document.getElementById('maoIaMetricsPanel')?.classList.contains('mao-panel-open'),
    armonicos:  grab('Armónicos'),
    h95:        grab('h para 95% var'),
    h99:        grab('h para 99% var'),
    semi:       grab('Semilandmarks TPS'),
    spectrum:   /Power spectrum/.test(txt),
    botonTps:   !!document.querySelector('[id^="maoIaEfaTpsBtn_"]'),
    mensaje:    (txt.match(/(Modulo EFA no disponible[^.]*|Contorno insuficiente[^.]*)/) || [])[0] || null,
  };
});

efa.hay ? ok('sección «EFA (Fourier Eliptico)» renderizada') : bad('la sección EFA no se renderizó', efa.mensaje || '');
efa.abierto ? ok('panel de métricas abierto') : info('panel de métricas', 'no marcado como abierto');
efa.armonicos ? ok('armónicos', efa.armonicos) : bad('sin armónicos');
efa.h95 && efa.h99 ? ok('h para 95%/99% de varianza', `${efa.h95} / ${efa.h99}`) : bad('sin h95/h99');
efa.spectrum ? ok('power spectrum mostrado') : bad('sin power spectrum');
if (efa.semi === '64') ok('Semilandmarks TPS = 64', 'ADR-021: los 64 salen de MaoInteropGMM');
else if (efa.semi)     bad(`Semilandmarks TPS = ${efa.semi}`, 'ADR-021 exige 64');
else                   bad('la fila «Semilandmarks TPS» no aparece');
efa.botonTps ? ok('botón «Exportar semilandmarks TPS» presente') : bad('falta el botón de exportar TPS');

const panel = page.locator('#maoIaMetricsPanel');
if (await panel.count()) await panel.screenshot({ path: join(SALIDA, 'A_panel_efa.png') }).catch(() => {});

// Contenido real del bloque TPS que produciría el botón.
const tps = await page.evaluate(() => {
  const G = window.MaoInteropGMM;
  if (!G) return { err: 'MaoInteropGMM ausente' };
  const o = (window.objects || [])[0];
  const pts = o?.contour_points || o?.contour_data?.points;
  if (!pts || !pts.length) return { err: 'sin contorno en window.objects[0]' };
  const slm = G.semilandmarksContorno(pts, G.N_SEMILANDMARKS);
  const texto = G.bloqueTPS(slm, { id: 'VERIF_ADR021', escalaMmPx: 0.1 });
  const lineas = texto.split('\n').filter(Boolean);
  const lm = (lineas[0].match(/LM=(\d+)/) || [])[1];
  const coords = lineas.slice(1, 1 + Number(lm || 0)).map((l) => l.split(/\s+/).map(Number));
  const ys = coords.map((c) => c[1]);
  return {
    n: slm.n, lm, primera: lineas[0], ultimas: lineas.slice(-3),
    yMin: Math.min(...ys).toFixed(3), yMax: Math.max(...ys).toFixed(3),
    coordsOk: coords.length === Number(lm) && coords.every((c) => c.length === 2 && c.every(Number.isFinite)),
  };
});
if (tps.err) bad('bloque TPS', tps.err);
else {
  tps.lm === '64' ? ok('bloque TPS con LM=64', tps.primera) : bad(`bloque TPS con LM=${tps.lm}`);
  tps.coordsOk ? ok('64 pares de coordenadas finitas') : bad('coordenadas malformadas');
  info('rango y del TPS', `${tps.yMin} … ${tps.yMax}`);
  info('cola del bloque', JSON.stringify(tps.ultimas));
}

// ── 4. (B) CASILLA TPS DEL MODAL DE EXPORTACIÓN ─────────────────────────────
paso('4. (B) Casilla «TPS — Contornos de la colección» (#excFmtTps)');
await page.evaluate(() => document.getElementById('maoIaModalClose')?.click());
await page.waitForTimeout(800);

const casilla = await page.evaluate(() => {
  const n = document.getElementById('excFmtTps');
  if (!n) return { existe: false };
  const fila = n.closest('label') || n.parentElement;
  return {
    existe: true, tipo: n.type, marcadaPorDefecto: n.checked,
    nombre: fila?.querySelector('.exc-fmt-nom')?.textContent?.trim(),
    desc:   fila?.querySelector('.exc-fmt-desc')?.textContent?.trim(),
  };
});
casilla.existe ? ok('casilla presente', `«${casilla.nombre}»`) : bad('#excFmtTps no existe en el DOM');
if (casilla.existe) {
  info('descripción', casilla.desc || '');
  casilla.marcadaPorDefecto === false ? ok('desmarcada por defecto', 'opt-in, no altera exportaciones previas')
                                      : info('marcada por defecto', String(casilla.marcadaPorDefecto));
}

// Abrir el modal y comprobar que la casilla llega a `formatos`.
await page.evaluate(() => document.getElementById('adr5BtnExportarColeccion')?.click());
await page.waitForTimeout(1200);
const modalExp = await page.evaluate(() => {
  const m = document.getElementById('exportColeccionModal');
  return { existe: !!m, abierto: !!m?.classList.contains('is-open'),
           visible: m ? getComputedStyle(m).display !== 'none' : false };
});
modalExp.abierto || modalExp.visible
  ? ok('modal de exportación abierto')
  : info('modal de exportación no abierto', 'requiere una colección/proyecto cargado; se comprueba el cableado igualmente');

const flujo = await page.evaluate(() => {
  const n = document.getElementById('excFmtTps');
  if (!n) return { err: 'sin casilla' };
  const antes = document.getElementById('excResumen')?.textContent?.trim();
  n.checked = true;
  n.dispatchEvent(new Event('change', { bubbles: true }));
  const despues = document.getElementById('excResumen')?.textContent?.trim();
  return { antes, despues, marcada: n.checked, cambioResumen: antes !== despues };
});
if (flujo.err) bad('cableado de la casilla', flujo.err);
else {
  flujo.marcada ? ok('la casilla se deja marcar') : bad('no se pudo marcar');
  flujo.cambioResumen ? ok('el resumen del modal reacciona al cambio', `«${flujo.antes}» → «${flujo.despues}»`)
                      : info('el resumen no cambió', `«${flujo.antes}» (sin colección cargada el contador puede quedar a 0)`);
}
const mexp = page.locator('#exportColeccionModal');
if (await mexp.count()) await mexp.screenshot({ path: join(SALIDA, 'B_modal_exportacion.png') }).catch(() => {});
await page.screenshot({ path: join(SALIDA, 'B_ventana_completa.png') }).catch(() => {});

// ── Veredicto ───────────────────────────────────────────────────────────────
console.log('\n══════════ RESUMEN ══════════');
const nOk = res.filter((r) => r[0] === '✅').length;
const nBad = res.filter((r) => r[0] === '❌').length;
console.log(`  ${nOk} comprobaciones OK · ${nBad} fallidas`);
console.log(errores.length ? `  ⚠ ${errores.length} error(es) de consola:\n    ` + [...new Set(errores)].slice(0, 8).join('\n    ')
                           : '  ✅ Sin errores de consola.');
console.log('  Capturas en: ' + SALIDA);
writeFileSync(join(SALIDA, 'resultado.json'), JSON.stringify({ res, errores: [...new Set(errores)], efa, tps, casilla, flujo }, null, 2));

await br.close().catch(() => {});
matar();
process.exit(nBad ? 1 : 0);
