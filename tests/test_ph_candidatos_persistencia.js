/**
 * P/H — persistencia de candidatos descartados (ADR-009).
 *
 * Regresión de la prueba manual del 2026-09-14 (objeto bifacial DRG18_NC1496_1609):
 * los candidatos se descartaban en el modal, pero metricas.json los guardaba igual
 * (cara A: 4, cara B: 3). La lista vive duplicada en el objeto y en sus métricas, y
 * solo se actualizaba la del objeto; el guardado copia `...obj.metricas`.
 *
 * Extrae de analysis-core.js las funciones REALES (fijarCandidatosPH y
 * sincronizarCandidatosPHEnObjeto) y las ejecuta en un sandbox `vm` con las variables
 * del IIFE que leen. Si alguien vuelve a actualizar una sola copia, esto falla.
 *
 * Uso:  node tests/test_ph_candidatos_persistencia.js
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

const ctx = vm.createContext({});
vm.runInContext(`${extraerFuncion('fijarCandidatosPH')}\n${extraerFuncion('sincronizarCandidatosPHEnObjeto')}`, ctx);

const resultados = [];
const check = (nombre, ok) => resultados.push([nombre, Boolean(ok)]);
const candidato = (n) => ({ tipo: 'candidato', points: [[n, n]] });
const trazado = (tipo, n) => ({ tipo, puntos: [{ x: n, y: n }], _confidence: 0.9, _confidenceLvl: 'alta' });

// Estado como en el flujo IA → «Abrir análisis (guardado)»: el objeto de `objects` y el
// del análisis son instancias DISTINTAS; el modal trabaja sobre una tercera (spread).
function preparar() {
  const cuatro = [1, 2, 3, 4].map(candidato);
  const original = {
    id: 'DRG18_CaraA', phCandidatos: cuatro,
    metricas: { area: 10, phCandidatos: cuatro },
    analisisCached: { metricas: { area: 10, phCandidatos: cuatro } },
  };
  const otraCara = { id: 'DRG18_CaraB', phCandidatos: [1, 2, 3].map(candidato), metricas: { phCandidatos: [1, 2, 3].map(candidato) } };
  const metricasCao = { area: 10, phCandidatos: cuatro };
  const cao = { obj: { id: 'DRG18_CaraA', phCandidatos: cuatro, metricas: metricasCao }, metricas: metricasCao };
  ctx.objects = [original, otraCara];
  ctx.currentAnalyzedObject = cao;
  ctx.selectedObjectForPerforation = { ...cao.obj, metricas: metricasCao };
  return { original, otraCara, cao, seleccionado: ctx.selectedObjectForPerforation };
}

const copias = ({ original, cao, seleccionado }) => ({
  'objeto del modal': seleccionado.phCandidatos,
  'objeto analizado': cao.obj.phCandidatos,
  'métricas del análisis': cao.metricas.phCandidatos,
  'objeto original': original.phCandidatos,
  'métricas del original': original.metricas.phCandidatos,
  'caché del original': original.analisisCached.metricas.phCandidatos,
  'lo que se guarda (…obj.metricas)': { ...cao.obj.metricas }.phCandidatos,
});

// A. Descartar 3 de 4: queda 1 candidato (más una perforación confirmada, que no cuenta).
let e = preparar();
ctx.trazadosPerforaciones = [trazado('candidato', 1), trazado('perforacion', 2)];
ctx.sincronizarCandidatosPHEnObjeto();
for (const [donde, lista] of Object.entries(copias(e))) check(`A · descartar 3 de 4 → ${donde} tiene 1`, lista && lista.length === 1);
check('A · no toca la otra cara (sigue con 3)', e.otraCara.phCandidatos.length === 3 && e.otraCara.metricas.phCandidatos.length === 3);

// B. Descartar todos y cerrar sin finalizar (tu caso): todas las copias quedan vacías.
e = preparar();
ctx.trazadosPerforaciones = [];
ctx.sincronizarCandidatosPHEnObjeto();
for (const [donde, lista] of Object.entries(copias(e))) check(`B · descartar todos → ${donde} vacío`, Array.isArray(lista) && lista.length === 0);

// C. «Finalizar» sin análisis ni objeto seleccionado: no debe lanzar.
ctx.currentAnalyzedObject = null;
ctx.selectedObjectForPerforation = null;
let lanzo = false;
try { ctx.fijarCandidatosPH([]); } catch (_) { lanzo = true; }
check('C · sin análisis abierto no lanza', !lanzo);

let fallos = 0;
for (const [nombre, ok] of resultados) {
  console.log(`${ok ? '✓' : '✗'} ${nombre}`);
  if (!ok) fallos++;
}
console.log('');
if (fallos) {
  console.log(`RESULTADO: ${fallos} comprobación(es) fallan`);
  process.exit(1);
}
console.log(`RESULTADO: todas las comprobaciones pasan (${resultados.length})`);
