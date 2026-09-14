#!/usr/bin/env node
/**
 * ADR-017 F5 — gate FUNCIONAL de la superposición de plantilla en el lienzo.
 *
 * Lo visual de esta capa no se puede verificar en un contenedor: hace falta
 * Electron. Lo que SÍ se puede verificar aquí es su geometría, que es donde de
 * verdad puede estar el error: qué tramos se dibujan continuos, cuáles
 * discontinuos, y si el polígono cierra. Un `node --check` no ve nada de eso.
 *
 * Método: se extrae el código REAL de `dibujarPlantillasIdeales` y su ayudante
 * desde `js/analysis-core.js` —no una copia, que se desincronizaría— y se
 * ejecuta contra un `ctx` de mentira que registra cada llamada de dibujo.
 *
 * Uso:  node tools/adr017_gate_overlay.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'js', 'analysis-core.js'), 'utf8');

/* ── Extracción del código real ─────────────────────────────────────────── */

function extraer(nombre) {
  const ini = SRC.indexOf(`function ${nombre}(`);
  if (ini < 0) throw new Error(`no se encontró function ${nombre}(`);
  let prof = 0, visto = false;
  for (let i = ini; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '{') { prof++; visto = true; }
    else if (c === '}') { prof--; if (visto && prof === 0) return SRC.slice(ini, i + 1); }
  }
  throw new Error(`no se pudo cerrar function ${nombre}`);
}

const COLOR = (SRC.match(/PLANTILLA_COLOR\s*=\s*'(#[0-9a-fA-F]{6})'/) || [])[1];

/* ── Lienzo de mentira ──────────────────────────────────────────────────── */

function nuevoCtx() {
  const reg = { trazos: [], actual: null, dash: [], alpha: 1, ancho: 0, color: null,
                pila: [], restauraciones: 0 };
  return {
    reg,
    set strokeStyle(v) { reg.color = v; }, get strokeStyle() { return reg.color; },
    set globalAlpha(v) { reg.alpha = v; }, get globalAlpha() { return reg.alpha; },
    set lineWidth(v) { reg.ancho = v; },  get lineWidth() { return reg.ancho; },
    save() { reg.pila.push([reg.dash, reg.alpha, reg.ancho, reg.color]); },
    restore() {
      reg.restauraciones++;
      const p = reg.pila.pop();
      if (p) { [reg.dash, reg.alpha, reg.ancho, reg.color] = p; }
    },
    setLineDash(d) { reg.dash = d; },
    beginPath() { reg.actual = { dash: reg.dash.slice(), pts: [], alpha: reg.alpha,
                                 ancho: reg.ancho, color: reg.color }; },
    moveTo(x, y) { reg.actual.pts.push([x, y]); },
    lineTo(x, y) { reg.actual.pts.push([x, y]); },
    stroke() { if (reg.actual) reg.trazos.push(reg.actual); },
  };
}

/* ── Ejecución del código extraído en un entorno controlado ─────────────── */

function correr(objetos, { zoom = 1, manual = false, visible = true } = {}) {
  const ctx = nuevoCtx();
  const fabrica = new Function(
    'ctx', 'objects', 'zoom', 'isManualSelectionMode', 'UtilityHelpers',
    'mostrarPlantillaIdeal', 'PLANTILLA_COLOR',
    `${extraer('plantillaDibujable')}
     ${extraer('dibujarPlantillasIdeales')}
     return dibujarPlantillasIdeales;`
  );
  fabrica(ctx, objetos, zoom, manual,
          { imageToCanvasCoords: (x, y) => ({ x: x * 2 + 10, y: y * 2 + 20 }) },
          visible, COLOR)();
  return ctx.reg;
}

/* ── Formas de prueba ───────────────────────────────────────────────────── */

function circulo(n = 64, r = 100, cx = 300, cy = 300) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return p;
}
/** Máscara con `huecos` tramos ausentes contiguos, repartidos. */
function mascara(n, tramos) {
  const m = new Array(n).fill(true);
  tramos.forEach(([a, b]) => { for (let i = a; i < b; i++) m[i % n] = false; });
  return m;
}

const objCandidata = (pts, pres) => ({
  plantillaCandidata: { plantilla_tipo: 'circulo', plantilla_completitud: 75,
                        plantilla_contorno: pts, plantilla_contorno_presente: pres },
});
const objConfirmada = (pts, pres) => ({
  plantillaConfirmada: { tipo: 'circulo', completitud: 75,
                         contorno: pts, contorno_presente: pres },
});

/* ── Comprobaciones ─────────────────────────────────────────────────────── */

let ok = 0, fallos = [];
const check = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log(`  ✅ ${nombre}`); }
  else { fallos.push(nombre); console.log(`  ❌ ${nombre} ${detalle}`); }
};

console.log('ADR-017 F5 — gate de la superposición de plantilla\n');

// 1. Nada que dibujar en los casos en que no debe dibujarse nada.
check('sin plantilla no dibuja', correr([{}]).trazos.length === 0);
check('candidata DESCARTADA no dibuja',
      correr([{ ...objCandidata(circulo(), null), plantillaDescartada: true }]).trazos.length === 0);
check('«ninguna» no dibuja',
      correr([{ plantillaCandidata: { plantilla_tipo: 'ninguna', plantilla_contorno: circulo() } }])
        .trazos.length === 0);
check('la casilla apagada no dibuja',
      correr([objCandidata(circulo(), null)], { visible: false }).trazos.length === 0);

// 2. Forma íntegra → un solo trazo continuo y cerrado.
{
  const n = 64;
  const r = correr([objCandidata(circulo(n), mascara(n, []))]);
  check('íntegra = 1 trazo', r.trazos.length === 1, `(${r.trazos.length})`);
  const t = r.trazos[0];
  check('íntegra sin discontinuo', t.dash.length === 0, `dash=${JSON.stringify(t.dash)}`);
  check('el polígono CIERRA', t.pts.length === n + 1 &&
        t.pts[0][0] === t.pts[n][0] && t.pts[0][1] === t.pts[n][1],
        `(${t.pts.length} pts de ${n + 1})`);
}

// 3. Un hueco → exactamente dos tramos: uno continuo y uno discontinuo, y el
//    discontinuo cubre los segmentos marcados como ausentes.
{
  const n = 64;
  const pres = mascara(n, [[20, 36]]);           // 16 puntos ausentes
  const r = correr([objCandidata(circulo(n), pres)]);
  const cont = r.trazos.filter((t) => t.dash.length === 0);
  const disc = r.trazos.filter((t) => t.dash.length > 0);
  // Un solo hueco ⇒ un solo tramo de hipótesis. La parte respaldada sale en DOS
  // trazos porque el hueco no toca la costura del array: el recorrido empieza en
  // el punto 0, que está dentro de la zona respaldada, y ésta queda partida en
  // «antes del hueco» y «después». Los dos se juntan en el punto 0 y se ven como
  // una sola línea; exigir uno solo sería exigir que el bucle empezara en el
  // hueco, cosa que no aporta nada.
  check('un hueco = un solo tramo de hipótesis', disc.length === 1, `(${disc.length})`);
  check('el resto queda continuo', cont.length === 2, `(${cont.length})`);
  // Segmentos sin respaldo: 19..35. Un segmento cuenta como medido sólo si SUS
  // DOS extremos lo están, así que los dos de la frontera (19 y 35) entran en la
  // hipótesis → 17 segmentos = 18 puntos.
  check('el discontinuo cubre el hueco MÁS su frontera',
        disc[0].pts.length === 18,
        `(${disc[0] ? disc[0].pts.length : 0} pts, esperados 18)`);
  const total = r.trazos.reduce((s, t) => s + t.pts.length - 1, 0);
  check('entre los dos tramos se dibujan los n segmentos', total === n, `(${total})`);
}

// 4. Dos huecos → tres o cuatro tramos, con dos discontinuos.
{
  const n = 64;
  const r = correr([objCandidata(circulo(n), mascara(n, [[10, 20], [40, 50]]))]);
  const disc = r.trazos.filter((t) => t.dash.length > 0);
  check('dos huecos = dos tramos discontinuos', disc.length === 2, `(${disc.length})`);
}

// 5. Estado visual: confirmada más marcada que candidata, y ambas en violeta.
{
  const n = 32;
  const c = correr([objCandidata(circulo(n), mascara(n, []))]).trazos[0];
  const f = correr([objConfirmada(circulo(n), mascara(n, []))]).trazos[0];
  check('confirmada más gruesa que candidata', f.ancho > c.ancho, `(${f.ancho} vs ${c.ancho})`);
  check('candidata más tenue', c.alpha < f.alpha, `(${c.alpha} vs ${f.alpha})`);
  check('color violeta declarado', c.color === COLOR && COLOR, `(${c.color})`);
}

// 6. Lo CONFIRMADO manda sobre el candidato vivo.
{
  const a = circulo(32, 100), b = circulo(32, 50);
  const r = correr([{ ...objCandidata(a, null), ...objConfirmada(b, null) }]);
  const radio = Math.hypot(r.trazos[0].pts[0][0] - 300, r.trazos[0].pts[0][1] - 300);
  check('confirmada gana a candidata', Math.abs(radio - 50) < 1e-6, `(r=${radio})`);
}

// 7. El zoom no engorda el trazo, y el modo manual usa la conversión de coords.
{
  const n = 16;
  const z1 = correr([objCandidata(circulo(n), null)], { zoom: 1 }).trazos[0];
  const z4 = correr([objCandidata(circulo(n), null)], { zoom: 4 }).trazos[0];
  check('el grosor compensa el zoom', Math.abs(z4.ancho * 4 - z1.ancho) < 1e-9,
        `(${z4.ancho} vs ${z1.ancho})`);
  const man = correr([objCandidata(circulo(n), null)], { manual: true }).trazos[0];
  const esperado = [circulo(n)[0][0] * 2 + 10, circulo(n)[0][1] * 2 + 20];
  check('modo manual convierte a coords de lienzo',
        Math.abs(man.pts[0][0] - esperado[0]) < 1e-9, `(${man.pts[0]})`);
}

// 8. El estado del lienzo se devuelve: un save() por objeto y su restore().
{
  const r = correr([objCandidata(circulo(16), null), objCandidata(circulo(16), null)]);
  check('cada objeto restaura el estado del lienzo',
        r.restauraciones === 2 && r.pila.length === 0, `(${r.restauraciones})`);
}

// 9. Máscara de longitud incoherente → se degrada a continuo, no revienta.
{
  const r = correr([objCandidata(circulo(32), [true, false])]);
  check('máscara incoherente no rompe el dibujo',
        r.trazos.length === 1 && r.trazos[0].dash.length === 0);
}

console.log(`\n${ok} comprobaciones OK` + (fallos.length ? `, ${fallos.length} FALLIDAS` : ''));
if (fallos.length) { fallos.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
