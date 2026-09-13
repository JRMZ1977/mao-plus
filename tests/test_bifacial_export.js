/**
 * tests/test_bifacial_export.js — exportables de la comparación bifacial
 *
 * Sin dependencias externas:  node tests/test_bifacial_export.js  (o: npm run test:bifacial)
 *
 * Extrae del IIFE de js/analysis-core.js las funciones PURAS implicadas y las
 * ejecuta con stubs de su closure. Prueba el código que realmente se envía.
 *
 * Cubre los dos defectos corregidos el 2026-09-12
 * (docs/AUDITORIA-EXPORTACION-20260912.md §8.5):
 *   a) el IMC se calculaba, se pintaba en #imcSummaryCard y NO llegaba a ningún
 *      archivo: el único exportador que lo escribía era `exportarComparacionBifacial()`,
 *      código muerto sin callers.
 *   b) CSV y PDF nombraban el archivo con `obtenerIdentificacionActual()` — la
 *      identificación viva del formulario, no la del par exportado — y el CSV de
 *      ambas caras usaba `caraA.id`, dejando el sufijo `_ca` en un archivo del par.
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(RAIZ, 'js', 'analysis-core.js'), 'utf8');

function extraer(nombre) {
  const marca = `  function ${nombre}(`;
  const i = src.indexOf(marca);
  if (i < 0) throw new Error('no encontrada: ' + nombre);
  const resto = src.slice(i);
  return resto.slice(0, resto.indexOf('\n  }\n') + 4);
}
const cuerpo = ['_csvEscapeValue', '_csvRow', '_baseNombreParBifacial', '_generarBloqueCsvIMC', '_baseNombreAnalisis']
  .map(extraer).join('\n');

const sandbox = (identViva) =>
  new Function('obtenerIdentificacionActual', 'window',
    `${cuerpo}\nreturn { _baseNombreParBifacial, _generarBloqueCsvIMC, _csvRow, _baseNombreAnalisis };`
  )(() => identViva, {});

const parseCsv = (linea) => {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (q) {
      if (ch === '"' && linea[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out;
};

let fallos = 0;
const ok = (cond, msg) => { console.log((cond ? '  OK   ' : '  FALLO') + '  ' + msg); if (!cond) fallos++; };

const A = { id: 'QP1_U1_N1_E1_01_ca', cara: 'A' };
const B = { id: 'QP1_U1_N1_E1_01_cb', cara: 'B' };
const IMC = {
  global: 0.9234, dimensional: 0.95, forma: 0.91, radial: 0.88,
  contorno: 0.85, conservacion: 0.97, ci: 0.96, cms: 0.89,
  nivel: 'Alta',
  divergentes: [{ nombre: 'Rugosidad', dif: '24.3' }, { nombre: 'Lobularidad', dif: '21.0' }],
};

console.log('\n=== A · nombre derivado del PAR, no del estado vivo (defecto b) ==');
{
  // La identificación viva apunta a OTRO objeto: el escenario que producía el bug.
  const S = sandbox({ valor: 'OTRO_OBJETO_99' });
  const base = S._baseNombreParBifacial(A, B, 3);
  ok(base === 'QP1_U1_N1_E1_01', `id del par sin sufijo de cara -> ${base}`);
  ok(!base.endsWith('_ca') && !base.endsWith('_cb'), 'no arrastra el sufijo de cara');
  ok(!base.includes('OTRO_OBJETO'), 'NO usa la identificacion viva del formulario');
  ok(S._baseNombreParBifacial({ id: 'X_01_CB' }, null, 1) === 'X_01', 'sufijo de cara en mayusculas tambien se quita');
  ok(S._baseNombreParBifacial(null, B, 3) === 'QP1_U1_N1_E1_01', 'cae a la cara B si A no tiene id');
}

console.log('\n=== B · respaldos cuando no hay id de cara =====================');
{
  ok(sandbox({ valor: 'ID Manual/01' })._baseNombreParBifacial({}, {}, 7) === 'ID_Manual_01',
     'sin id de cara usa la identificacion viva y la sanea');
  ok(sandbox(null)._baseNombreParBifacial({}, {}, 7) === 'OBJ_7',
     'sin id ni identificacion cae a OBJ_<numero>');
  ok(sandbox(null)._baseNombreParBifacial(null, null, undefined) === 'OBJ_X',
     'sin nada devuelve un nombre valido, no "undefined"');
  const raro = sandbox(null)._baseNombreParBifacial({ id: 'a b,c"d/e_ca' }, null, 1);
  ok(!/[^a-zA-Z0-9_-]/.test(raro), `saneado seguro para sistema de archivos -> ${raro}`);
}

console.log('\n=== C · el IMC llega al CSV (defecto a) ========================');
{
  const S = sandbox(null);
  const bloque = S._generarBloqueCsvIMC(IMC);
  console.log(bloque.split('\n').map(l => '      ' + l).join('\n'));
  const filas = bloque.trim().split('\n').slice(1).map(parseCsv);  // saltar "# ..."
  const M = new Map(filas.slice(1).map(c => [c[0], c]));

  ok(bloque.startsWith('# COHERENCIA MORFOMÉTRICA INTEGRAL (IMC)'), 'bloque rotulado');
  ok(filas[0].join(',') === 'Indicador,Valor,Peso,Descripción', 'cabecera de 4 columnas');
  ok(filas.every(c => c.length === 4), 'todas las filas con 4 columnas');
  ok(M.get('IMC Global')[1] === '92.3%', 'IMC global en porcentaje');
  ok(M.get('Nivel de coherencia')[1] === 'Alta', 'nivel interpretativo presente');
  ok(M.get('Coherencia Identitaria (CI)')[1] === '96.0%', 'CI presente');
  ok(M.get('Coherencia de Superficie (CMS)')[1] === '89.0%', 'CMS presente');
  ['Dimensional (tamaño)', 'Forma (descriptores)', 'Radial (perfil)', 'Contorno (textura)', 'Conservación']
    .forEach(k => ok(M.has(k), `sub-score presente: ${k}`));
  ok(M.get('Dimensional (tamaño)')[2] === '30%', 'peso del sub-score documentado');
  const div = M.get('Rasgos divergentes (Δ>20%)');
  ok(div && div[1] === 'Rugosidad Δ24.3% | Lobularidad Δ21.0%', 'rasgos divergentes enumerados');
  ok(div.length === 4, 'la fila de divergentes no rompe columnas pese al "|" y los "%"');
}

console.log('\n=== D · degradados del IMC ====================================');
{
  const S = sandbox(null);
  const sinImc = S._generarBloqueCsvIMC(null);
  ok(sinImc.includes('No disponible'), 'sin IMC deja constancia explicita');
  ok(!sinImc.includes('0.0%') && !sinImc.includes('N/D%'), 'no finge un IMC de cero');
  ok(sinImc.trim().split('\n').slice(1).map(parseCsv).every(c => c.length === 4), 'degradado mantiene 4 columnas');

  const parcial = S._generarBloqueCsvIMC({ global: 0.5, nivel: null, divergentes: [] });
  const M = new Map(parcial.trim().split('\n').slice(2).map(parseCsv).map(c => [c[0], c]));
  ok(M.get('Radial (perfil)')[1] === 'N/D', 'sub-scores ausentes -> N/D, no "NaN%"');
  ok(M.get('Nivel de coherencia')[1] === 'N/D', 'nivel ausente -> N/D');
  ok(M.get('Rasgos divergentes (Δ>20%)')[1] === 'Ninguno', 'lista vacia se declara, no se omite');
  ok(!parcial.includes('NaN') && !parcial.includes('undefined'), 'sin NaN ni undefined');
}

console.log('\n=== E · los tres exportables comparten la misma base ===========');
{
  // Reproduce cómo cada sitio compone su nombre final tras el fix.
  const S = sandbox({ valor: 'OTRO_OBJETO_99' });
  const base = S._baseNombreParBifacial(A, B, 3);
  const nombres = {
    csvComparacion: `${base}_comparacion`,
    pdfBifacial:    `${base}_bifacial`,
    csvAmbasCaras:  `${base}_bifacial`,
  };
  console.log('      ' + JSON.stringify(nombres, null, 2).split('\n').join('\n      '));
  ok(Object.values(nombres).every(n => n.startsWith('QP1_U1_N1_E1_01')),
     'los tres cuelgan del mismo id de par');
  ok(!Object.values(nombres).some(n => /_c[ab]_/.test(n)),
     'ninguno arrastra el sufijo de cara');
}

console.log('\n=== G · nombre canónico por análisis (unificación) ==============');
{
  const S = sandbox({ valor: 'QP1_U1_N1_E1_01' });
  ok(S._baseNombreAnalisis({ id: 1 }) === 'QP1_U1_N1_E1_01',
     'monofacial con id NUMÉRICO usa el ID arqueológico, no "1"');
  ok(S._baseNombreAnalisis({ id: 1, cara: 'A' }) === 'QP1_U1_N1_E1_01_ca', 'cara A → sufijo _ca');
  ok(S._baseNombreAnalisis({ id: 7, cara: 'B' }) === 'QP1_U1_N1_E1_01_cb', 'cara B → sufijo _cb');

  const Sya = sandbox({ valor: 'QP1_U1_N1_E1_01_ca' });
  ok(Sya._baseNombreAnalisis({ cara: 'A' }) === 'QP1_U1_N1_E1_01_ca',
     'no duplica el sufijo si la identificación ya lo trae');

  const Ssin = sandbox(null);
  ok(Ssin._baseNombreAnalisis({ id: 'OBJ_ABC' }) === 'OBJ_ABC', 'sin identificación cae a obj.id');
  ok(Ssin._baseNombreAnalisis({ id: 1 }) === '1', 'id numérico se saneia a cadena sin romper');
  ok(Ssin._baseNombreAnalisis({ numeroObjeto: 3 }) === 'OBJ_3', 'sin id cae a OBJ_<numero>');
  ok(Ssin._baseNombreAnalisis({}) === 'OBJ_X', 'sin nada devuelve un nombre válido, no "undefined"');
  ok(!/[^a-zA-Z0-9_-]/.test(sandbox({ valor: 'a b/c:d' })._baseNombreAnalisis({})),
     'saneado seguro para sistema de archivos');

  // La unificación: los cuatro formatos + la carpeta cuelgan de la MISMA base
  const base = S._baseNombreAnalisis({ id: 1, cara: 'A' });
  const nombres = [`${base}_analisis.csv`, `${base}_geometria.svg`, `${base}_morfologia.png`, `${base}_integral.pdf`];
  console.log('      ' + nombres.join('\n      '));
  ok(nombres.every(n => n.startsWith('QP1_U1_N1_E1_01_ca')), 'los 4 formatos comparten prefijo');
  ok(!nombres.some(n => /^\d/.test(n)), 'ninguno empieza por el id numérico');
}

console.log('\n' + (fallos === 0 ? 'RESULTADO: todas las comprobaciones pasan' : `RESULTADO: ${fallos} FALLOS`));
process.exit(fallos === 0 ? 0 : 1);
