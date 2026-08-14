#!/usr/bin/env node
/**
 * MAO Plus — verificación ESM estricta de los módulos del frontend.
 *
 * POR QUÉ EXISTE
 * `node --check` (o `node -c`) parsea el archivo como **script clásico**, y ese modo es
 * más permisivo que el de módulo. El caso comprobado que se le escapa:
 *
 *     function f() { return 1; }
 *     function f() { return 2; }     // node -c: PASA · como módulo: SyntaxError
 *
 * Dos `function` declarations homónimas son legales en modo script y son un error en
 * modo módulo. Chrome carga `analysis-core.js` con `type="module"`, así que las rechaza
 * y deja la app en blanco sin más pista que un error en consola. Ya ocurrió al menos una
 * vez (`1445610`: «eliminar const generarTablaComparativa duplicada que rompía el módulo
 * ES»). Es además la forma exacta que tomaría un error al limpiar las copias duplicadas
 * de `analysis-core.js`, así que este chequeo es la red del refactor pendiente.
 *
 * Este script hace lo único que reproduce ese modo: un `import()` dinámico real. Node
 * parsea el módulo completo —y sus dependencias— con las reglas de módulo, así que el
 * SyntaxError sale aquí, en CI, y no en la pantalla del usuario.
 *
 * QUÉ CUENTA COMO FALLO
 * Solo `SyntaxError`. Los módulos del renderer tocan `document`, `window` y `canvas`, que
 * en Node no existen: un `ReferenceError` significa que el módulo **parseó bien** y murió
 * al ejecutarse, que es lo esperado fuera del navegador. Distinguirlos es el punto.
 *
 * Uso:  node scripts/check-esm.mjs        (desde la raíz del repo)
 */

import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const MODULES_DIR = path.join(ROOT, 'js', 'modules');
const EXTRA = [path.join(ROOT, 'js', 'analysis-core.js')];

// Node avisa de que estos .js no declaran tipo y los reparsea como ESM. Es exactamente
// lo que queremos; el aviso solo ensucia la salida.
process.removeAllListeners('warning');

const targets = [
  ...(await readdir(MODULES_DIR)).filter(f => f.endsWith('.js')).sort()
    .map(f => path.join(MODULES_DIR, f)),
  ...EXTRA,
];

let syntaxErrors = 0;
const results = [];

for (const file of targets) {
  const rel = path.relative(ROOT, file);
  try {
    await import(pathToFileURL(file).href);
    results.push(['ok', rel, 'importado']);
  } catch (err) {
    if (err instanceof SyntaxError) {
      syntaxErrors++;
      results.push(['fail', rel, `SyntaxError: ${err.message}`]);
    } else {
      // Parseó bien; falló al ejecutar por falta de DOM. Correcto fuera del navegador.
      results.push(['ok', rel, `parseado (${err.constructor.name} en ejecución, esperado)`]);
    }
  }
}

console.log('\nMAO — verificación ESM estricta (import dinámico real)');
console.log('='.repeat(60));
for (const [status, rel, detail] of results) {
  console.log(`${status === 'ok' ? '  ok  ' : '  FAIL'} ${rel.padEnd(42)} ${detail}`);
}
console.log('='.repeat(60));

if (syntaxErrors > 0) {
  console.error(`\n❌  FAIL  ${syntaxErrors} módulo(s) con SyntaxError en modo ESM.`);
  console.error('    Chrome los rechazará igual: la app arrancaría en blanco.\n');
  process.exit(1);
}

console.log(`\n✅  PASS  ${targets.length}/${targets.length} módulos parsean como ESM\n`);
