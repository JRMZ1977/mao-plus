/**
 * tests/test_efa_tps_export.js — exportación TPS / EFA (contorno y P/H)
 *
 * Sin dependencias externas:  node tests/test_efa_tps_export.js   (o: npm run test:js)
 *
 * Extrae del IIFE de js/analysis-core.js las funciones PURAS de generación
 * (_resolverEscalaMmPx, _generarTextoTPSLandmarks, _generarCsvEFA) y las ejecuta
 * con stubs de su closure (`scale`, `resolverNombreFotografia`). Prueba el código
 * que realmente se envía, no una copia — si alguien renombra o mueve esas
 * funciones, el test falla en vez de pasar en vacío.
 *
 * Cubre las tres regresiones corregidas el 2026-09-12
 * (docs/AUDITORIA-EXPORTACION-20260912.md §9.3):
 *   a) el TPS nunca emitía escala: `metricas.scale_px_mm` no lo escribe nadie,
 *      así que la condición era siempre falsa y los landmarks salían en píxeles
 *      sin ninguna anotación de escala.
 *   b) el CSV de EFA descartaba `coefficients_raw` y `normalization.scale_factor`,
 *      con lo que la normalización era irreversible (sin tamaño → sin alometría).
 *   c) el nombre de archivo se derivaba de la etiqueta de UI («Contorno principal»)
 *      en lugar de una clave estable («contorno»).
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
const cuerpo = ['_resolverEscalaMmPx', '_generarTextoTPSLandmarks', '_generarCsvEFA']
  .map(extraer).join('\n');

const sandbox = (scaleValor, nombreFoto) =>
  new Function('scale', 'resolverNombreFotografia',
    `${cuerpo}\nreturn { _resolverEscalaMmPx, _generarTextoTPSLandmarks, _generarCsvEFA };`
  )(scaleValor, () => nombreFoto);

// Parser CSV conforme a RFC4180 (comillas dobles escapadas)
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
const metaDe = (csv) => {
  const filas = csv.split('\n\n')[1].trim().split('\n').map(parseCsv);
  const m = new Map(filas.slice(1).map(c => [c[1], { valor: c[2], nota: c[3], cols: c.length }]));
  return { filas, get: (k) => m.get(k) };
};

let fallos = 0;
const ok = (cond, msg) => { console.log((cond ? '  OK   ' : '  FALLO') + '  ' + msg); if (!cond) fallos++; };

const lm = [[100.5, 200.25], [150, 260], [120, 300]];
const efa = {
  status: 'ok', n_harmonics: 3, n_points_input: 312,
  coefficients:     [[1, 0, 0, 0.5], [0.1, 0.02, -0.03, 0.04], [0.01, 0, 0.002, -0.001]],
  coefficients_raw: [[120.5, 3.2, -1.1, 60.2], [12.05, 2.4, -3.6, 4.8], [1.2, 0.1, 0.24, -0.12]],
  normalization: { theta_1_deg: 12.3456, psi_1_deg: -4.5, scale_factor: 120.512345 },
  power_spectrum: [1.118, 0.115, 0.0102],
  variance_explained: [98.9, 99.97, 100.0],
  harmonics_for_95pct: 1, harmonics_for_99pct: 2,
  dc: [1024.5, 768.25], scale_px_mm: 0.042123,
};

console.log('\n=== A · TPS con escala configurada (defecto a) ===================');
{
  const S = sandbox(0.042123, 'IMG_0042.JPG');
  const tps = S._generarTextoTPSLandmarks(lm, { id: 'QP1_U1_N1_E1_01_ca' }, { _efa_data: efa });
  console.log(tps.split('\n').map(l => '      ' + l).join('\n'));
  const L = tps.split('\n');
  ok(tps.includes('SCALE=0.04212300'), 'emite SCALE= con el factor mm/px');
  ok(tps.includes('IMAGE=IMG_0042.JPG'), 'emite IMAGE= con la fotografia');
  ok(tps.includes('ID=QP1_U1_N1_E1_01_ca'), 'emite ID=');
  ok(L[0] === 'LM=3', 'LM= es la primera linea');
  ok(!tps.includes('scale_px_mm'), 'ya no usa el COMMENT no estandar');
  ok(L.indexOf('IMAGE=IMG_0042.JPG') < L.indexOf('ID=QP1_U1_N1_E1_01_ca'), 'orden TPS: IMAGE antes de ID');
  ok(L.indexOf('ID=QP1_U1_N1_E1_01_ca') < L.indexOf('SCALE=0.04212300'), 'orden TPS: ID antes de SCALE');
}

console.log('\n=== B · TPS SIN escala ==========================================');
{
  const S = sandbox(null, '');
  const tps = S._generarTextoTPSLandmarks(lm, { id: 'OBJ_X' }, { _efa_data: { ...efa, scale_px_mm: 0 } });
  console.log(tps.split('\n').map(l => '      ' + l).join('\n'));
  ok(!tps.includes('SCALE='), 'NO inventa SCALE=1.0 cuando no hay escala');
  ok(tps.includes('SIN ESCALA'), 'deja constancia explicita de que va en pixeles');
  ok(!tps.includes('IMAGE='), 'omite IMAGE= si no hay fotografia resuelta');
}

console.log('\n=== C · prioridad de resolucion de escala =======================');
{
  const S = sandbox(0.99, '');
  ok(S._resolverEscalaMmPx({ _efa_data: { scale_px_mm: 0.05 } }) === 0.05, 'gana el factor usado por el backend');
  ok(S._resolverEscalaMmPx({ scale_px_mm: 0.07 }) === 0.07, 'clave legada como 2o recurso');
  ok(S._resolverEscalaMmPx({}) === 0.99, 'escala viva del IIFE como ultimo recurso');
  ok(S._resolverEscalaMmPx({ _efa_data: { scale_px_mm: 0 } }) === 0.99, 'el 0 del backend NO cuenta como escala');
  ok(sandbox(null, '')._resolverEscalaMmPx({}) === null, 'sin escala en ningun lado -> null');
}

console.log('\n=== D · CSV EFA completo (defecto b) ============================');
{
  const S = sandbox(0.042123, '');
  const csv = S._generarCsvEFA(efa, 'QP1_U1_N1_E1_01_ca_P1');
  console.log(csv.split('\n').map(l => '      ' + l).join('\n'));
  const tabla = csv.split('\n\n')[0].trim().split('\n');
  ok(tabla.length === 4, 'tabla = cabecera + 3 armonicos');
  ok(tabla[0] === 'harmonic,a_norm,b_norm,c_norm,d_norm,a_raw,b_raw,c_raw,d_raw,power_spectrum,variance_acum_pct', 'cabecera completa');
  ok(tabla[1] === '1,1,0,0,0.5,120.5,3.2,-1.1,60.2,1.118,98.9', 'fila 1 con coef. crudos + espectro + varianza');
  ok(tabla.every(f => f.split(',').length === 11), 'todas las filas de la tabla con 11 columnas');

  const M = metaDe(csv);
  ok(M.get('scale_factor').valor === '120.512345', 'scale_factor presente -> normalizacion reversible');
  ok(M.get('theta_1_deg').valor === '12.3456', 'theta_1_deg presente');
  ok(M.get('psi_1_deg').valor === '-4.5', 'psi_1_deg presente');
  ok(M.get('Escala_mm_px').valor === '0.042123', 'escala mm/px presente');
  ok(M.get('dc_a').valor === '1024.5' && M.get('dc_c').valor === '768.25', 'componentes DC presentes');
  ok(M.get('Fuente').valor === 'QP1_U1_N1_E1_01_ca_P1', 'fuente identificada en los metadatos');
  ok(/NO es el semieje mayor del objeto/.test(M.get('scale_factor').nota), 'la nota de scale_factor advierte que no es el semieje del objeto');
}

console.log('\n=== E · CSV EFA degradado (backend sin raw/dc) ==================');
{
  const S = sandbox(null, '');
  const csv = S._generarCsvEFA({ coefficients: [[1, 2, 3, 4]] }, 'x');
  const tabla = csv.split('\n\n')[0].trim().split('\n');
  ok(tabla[1] === '1,1,2,3,4,,,,,,', 'campos ausentes quedan vacios, sin "undefined"');
  ok(tabla[1].split(',').length === 11, 'mantiene 11 columnas');
  ok(metaDe(csv).get('Escala_mm_px').valor === '', 'escala vacia cuando no hay');
  ok(!csv.includes('undefined') && !csv.includes('NaN'), 'sin "undefined" ni "NaN" en todo el CSV');
}

console.log('\n=== F · integridad CSV del bloque de metadatos ==================');
{
  const S = sandbox(0.042123, '');
  const csv = S._generarCsvEFA(efa, 'QP1,con"comas"');
  const M = metaDe(csv);
  const anchos = M.filas.map(c => c.length);
  ok(anchos.every(a => a === 4), 'todas las filas de metadatos tienen 4 columnas -> ' + [...new Set(anchos)].join('/'));
  ok(/varia con la elongacion/.test(M.get('scale_factor').nota), 'la nota con comas y ":" sobrevive entera en su columna');
  ok(M.get('Fuente').valor === 'QP1,con"comas"', 'fuente con comas y comillas se recupera intacta');
}

console.log('\n' + (fallos === 0 ? 'RESULTADO: todas las comprobaciones pasan' : `RESULTADO: ${fallos} FALLOS`));
process.exit(fallos === 0 ? 0 : 1);
