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

function check(src) {
  const results = [];

  function checkName(name, category) {
    // Must appear as:  window.NAME =   (assignment, not just read)
    const re = new RegExp(`window\\.${escapeRe(name)}\\s*=`);
    const present = re.test(src);
    results.push({ name, category, present });
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
console.log(`\nMAO window.* contract check — analysis-core.js`);
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
