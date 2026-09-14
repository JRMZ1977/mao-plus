/**
 * C3 enforcement: static contract check for window.* surface in analysis-core.js.
 *
 * Verifies that all Tier-1 API and critical cross-file contracts are still
 * assigned to window.* after any refactoring. Intended to catch regressions
 * like "accidentally made a window.X assignment unreachable inside an if-block"
 * or "removed the assignment entirely".
 *
 * Usage:  node tests/test_window_contracts.js
 * Exit 0 = all contracts present; Exit 1 = one or more missing.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CORE_PATH = path.join(__dirname, '..', 'js', 'analysis-core.js');

/**
 * Fronteras de contrato de la EXPORTACIÓN POR LOTE.
 *
 * projectManager.enrichCollection gatea cada productor con
 * `typeof window.X === 'function'`. Si el productor deja de ser global, el gate
 * queda falso y el formato se omite EN SILENCIO — que es exactamente lo que pasó
 * en ADR-017 F1: el refactor bc9cdc9 pasó `generarHTMLReporteParaBatch` de
 * `window.…` a `const` local y el PDF del lote desapareció sin dejar rastro
 * durante meses. Por eso estos nombres se verifican por archivo.
 */
const BATCH_EXPORT_CONTRACTS = [
  { file: ['js', 'analysis-core.js'], names: ['generarHTMLReporteParaBatch'] },
  { file: ['js', 'collection.js'],    names: ['generarSVGMorfologicoParaLote',
                                              'construirGeometryDataMorfologico'] },
];

// --- contract definitions ---

const TIER1 = [
  'estimarErrorOptico',
  'aplicarIncertidumbreOptica',
  'calcularEjePrincipal',
  'aplicarReglaCanonicaInterpretacion',
  'metaClasificarFormaIA',
  'mostrarAnalisisMorfologico',
  'generarTablaMetricasCompleta',
  'inyectarObjetosDesdeIA',
  'detectarObjetos',
  'analizarObjetoMorfologicamente',
];

// Cross-file contracts: assigned in analysis-core, read by other JS files.
// These are the ones where losing the assignment would silently break another module.
const CROSS_FILE_CRITICAL = [
  'canvas',
  'ctx',
  'escalaCorregida',
  'currentAnalyzedObject',
  'currentAnalysisData',
  'currentAnalysisPath',
  'currentAnalysisId',
  'saveFileWithDialog',
  'generarCSVMetricasDesdeObjeto',
  '_maoGetImage',
  '_maoGetScale',
  '_maoGetIdentificacion',
  '_maoGetModo',
  '_maoLog',
  'calcularAreaEfectivaPH',
  'confirmarCandidatoPH',
  'descartarCandidatoPH',
  'inyectarObjetosDesdeObj3d',
  'mostrarCardObjetoIA',
  'aplicarErrorOpticoPosicional',
  'calcularEscala',
];

// Contract layer namespaces
const CONTRACT_NAMESPACES = [
  '__maoE2E',
  '__maoLoadTestFixture',
];

// --- check ---

/** Quita comentarios (de bloque y de línea), preservando literales de cadena. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); // el [^:] evita cortar en http://
}

/** Además vacía los literales de cadena, para que un log no simule un contrato. */
function stripStrings(src) {
  return src
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

function check(src) {
  const results = [];
  // Sin comentarios el regex ya no puede darse por satisfecho con un comentario
  // que mencione `window.canvas = …` (era el caso: el contrato de `canvas` pasaba
  // gracias a una línea de comentario tras corregirse el código real).
  const codigo = stripComments(src);
  const codigoSinCadenas = stripStrings(codigo);

  function checkName(name, category) {
    const n = escapeRe(name);
    // Satisfecho por CUALQUIERA de las dos formas de publicar el contrato:
    //  (a) asignación directa      →  window.NAME = …
    //  (b) getter vivo del puente  →  NAME: () => NAME  en bridgeIIFEStateToModules(),
    //      o un Object.defineProperty(window, 'NAME', …) explícito. Es la forma
    //      correcta para el estado que el IIFE reasigna (canvas/ctx): sobre un
    //      accessor sin setter, `window.NAME = …` lanza TypeError en modo estricto.
    const asignacion = new RegExp(`window\\.${n}\\s*=[^=]`).test(codigoSinCadenas);
    const puenteMapa = new RegExp(`\\b${n}\\s*:\\s*\\(\\)\\s*=>\\s*${n}\\b`).test(codigoSinCadenas);
    const puenteProp = new RegExp(`defineProperty\\(\\s*window\\s*,\\s*['"\`]${n}['"\`]`).test(codigo);
    results.push({ name, category, present: asignacion || puenteMapa || puenteProp });
  }

  TIER1.forEach(n => checkName(n, 'TIER-1'));
  CROSS_FILE_CRITICAL.forEach(n => checkName(n, 'cross-file'));
  CONTRACT_NAMESPACES.forEach(n => checkName(n, 'contract'));

  return results;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- run ---

const src = fs.readFileSync(CORE_PATH, 'utf8');
const results = check(src);

// Fronteras de la exportación por lote, en sus archivos respectivos.
for (const { file, names } of BATCH_EXPORT_CONTRACTS) {
  const rutaArchivo = path.join(__dirname, '..', ...file);
  const fuente = fs.readFileSync(rutaArchivo, 'utf8');
  const codigo = stripStrings(stripComments(fuente));
  for (const name of names) {
    const presente = new RegExp(`window\\.${escapeRe(name)}\\s*=[^=]`).test(codigo);
    results.push({ name, category: `lote:${file[file.length - 1]}`, present: presente });
  }
}

let pass = 0, fail = 0;
const failures = [];

for (const r of results) {
  if (r.present) {
    pass++;
  } else {
    fail++;
    failures.push(r);
  }
}

const total = results.length;
console.log(`\nMAO window.* contract check — analysis-core.js + fronteras de lote`);
console.log('='.repeat(50));

if (fail === 0) {
  console.log(`✅  PASS  ${total}/${total} contracts present`);
  console.log();
} else {
  console.log(`❌  FAIL  ${pass}/${total} contracts present — ${fail} missing:\n`);
  for (const r of failures) {
    console.log(`  MISSING [${r.category}]  window.${r.name}`);
  }
  console.log();
  process.exit(1);
}
