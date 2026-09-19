/**
 * tests/test_efa_tps_export.js — exportación TPS / EFA (contorno y P/H)
 *
 * Sin dependencias externas:  node tests/test_efa_tps_export.js   (o: npm run test:js)
 *
 * Extrae del IIFE de js/analysis-core.js las funciones PURAS de generación
 * (_resolverEscalaMmPx, _generarTextoTPSLandmarks, _generarCsvEFA) y las ejecuta
 * con stubs de su closure (`scale`, `resolverNombreFotografia`, `window` con el
 * helper real js/mao-interop-gmm.js). Prueba el código que realmente se envía,
 * no una copia — si alguien renombra o mueve esas funciones, el test falla en vez
 * de pasar en vacío.
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
 *
 * Y el convenio de los coeficientes (ADR-021, 2026-09-18): el CSV exportaba los
 * del convenio INTERNO de MAO, desfasado 90° respecto de Kuhl & Giardina (1982),
 * bajo columnas `a_norm…d_raw` sin decirlo. Las secciones G y H contrastan las
 * columnas `*_kg` contra una implementación de K&G escrita aquí, aparte del helper.
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(RAIZ, 'js', 'analysis-core.js'), 'utf8');
const RUTA_HELPER = path.join(RAIZ, 'js', 'mao-interop-gmm.js');
const helper = fs.existsSync(RUTA_HELPER) ? require(RUTA_HELPER) : null;
// En la app el helper lee `window.MAO_VERSION` (js/mao-version.js); en Node, su global.
globalThis.MAO_VERSION = '9.9.9';

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
  new Function('scale', 'resolverNombreFotografia', 'window',
    `${cuerpo}\nreturn { _resolverEscalaMmPx, _generarTextoTPSLandmarks, _generarCsvEFA };`
  )(scaleValor, () => nombreFoto, { MaoInteropGMM: helper });

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
  return { filas, get: (k) => m.get(k) || { valor: undefined, nota: '' } };
};
/** Tabla del CSV EFA como objetos {columna: número|''}. */
const tablaDe = (csv) => {
  const lineas = csv.split('\n\n')[0].trim().split('\n');
  const cab = lineas[0].split(',');
  return {
    cab,
    filas: lineas.slice(1).map((l) => {
      const v = l.split(',');
      return Object.fromEntries(cab.map((c, i) => [c, v[i] === '' ? '' : Number(v[i])]));
    }),
  };
};

let fallos = 0;
const ok = (cond, msg) => { console.log((cond ? '  OK   ' : '  FALLO') + '  ' + msg); if (!cond) fallos++; };

// Sin el helper (código anterior a ADR-021) las funciones viejas no lo necesitan:
// el test sigue y falla por el CONTENIDO del CSV, no por un archivo que falta.
if (!helper) console.log('  (js/mao-interop-gmm.js no existe: se prueban las funciones anteriores)');

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
  ok(!/curvatura/.test(tps), 'ya no anuncia landmarks de curvatura (ADR-021)');
}

console.log('\n=== B · TPS SIN escala ==========================================');
{
  const S = sandbox(null, '');
  const tps = S._generarTextoTPSLandmarks(lm, { id: 'OBJ_X' }, { _efa_data: { ...efa, scale_px_mm: 0 } });
  console.log(tps.split('\n').map(l => '      ' + l).join('\n'));
  ok(!tps.includes('SCALE='), 'NO inventa SCALE=1.0 cuando no hay escala');
  ok(tps.includes('SIN ESCALA'), 'deja constancia explicita de que va en pixeles');
  ok(!tps.includes('IMAGE='), 'omite IMAGE= si no hay fotografia resuelta');
  ok(tps.split('\n').filter(l => l.startsWith('COMMENT=')).length === 1, 'un solo COMMENT= (antes eran dos)');
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

const CABECERA = 'harmonic,a_norm_kg,b_norm_kg,c_norm_kg,d_norm_kg,a_raw_kg,b_raw_kg,c_raw_kg,d_raw_kg,' +
  'power_spectrum,variance_acum_pct,a_norm_mao,b_norm_mao,c_norm_mao,d_norm_mao';

console.log('\n=== D · CSV EFA completo (defecto b + convenio ADR-021) ==========');
{
  const S = sandbox(0.042123, '');
  const csv = S._generarCsvEFA(efa, 'QP1_U1_N1_E1_01_ca_P1');
  console.log(csv.split('\n').map(l => '      ' + l).join('\n'));
  const tabla = csv.split('\n\n')[0].trim().split('\n');
  ok(tabla.length === 4, 'tabla = cabecera + 3 armonicos');
  ok(tabla[0] === CABECERA, 'cabecera: 9 columnas K&G primero, las internas rotuladas *_mao');
  ok(tabla.every(f => f.split(',').length === 15), 'todas las filas de la tabla con 15 columnas');
  const T = tablaDe(csv);
  const f1 = T.filas[0];
  // crudos MAO (120.5, 3.2, -1.1, 60.2) → K&G (−b, a, −d, c)
  ok([f1.a_raw_kg, f1.b_raw_kg, f1.c_raw_kg, f1.d_raw_kg].join('|') === '-3.2|120.5|-60.2|-1.1',
    'crudos K&G = conversión exacta de los crudos MAO (−b, a, −d, c)');
  ok(f1.a_norm_kg === 1 && Math.abs(f1.b_norm_kg) < 1e-12 && Math.abs(f1.c_norm_kg) < 1e-12 && f1.d_norm_kg > 0,
    'normalizados K&G: 1er armónico canónico (1, 0, 0, d1)');
  ok([f1.a_norm_mao, f1.b_norm_mao, f1.c_norm_mao, f1.d_norm_mao].join('|') === '1|0|0|0.5',
    'las columnas *_mao conservan el descriptor interno tal cual');
  ok(f1.power_spectrum === 1.118 && f1.variance_acum_pct === 98.9, 'espectro y varianza en su sitio');

  const M = metaDe(csv);
  ok(M.get('scale_factor').valor === '120.512345', 'scale_factor presente -> normalizacion reversible');
  ok(M.get('theta_1_deg_mao').valor === '12.3456' && M.get('psi_1_deg_mao').valor === '-4.5',
    'theta/psi del convenio MAO rotulados como tales');
  ok(M.get('theta_1_deg_kg').valor !== '' && M.get('psi_1_deg_kg').valor !== '', 'theta/psi del convenio K&G presentes');
  ok(M.get('Escala_mm_px').valor === '0.042123', 'escala mm/px presente');
  ok(M.get('dc_a').valor === '1024.5' && M.get('dc_c').valor === '768.25', 'componentes DC presentes');
  ok(M.get('Fuente').valor === 'QP1_U1_N1_E1_01_ca_P1', 'fuente identificada en los metadatos');
  ok(/NO es el semieje mayor del objeto/.test(M.get('scale_factor').nota), 'la nota de scale_factor advierte que no es el semieje del objeto');
  ok(M.get('Convenio_kg').valor === 'Kuhl & Giardina (1982)' && /pyefd/.test(M.get('Convenio_kg').nota),
    'el convenio de las columnas *_kg está nombrado');
  ok(/derivado/.test(M.get('Origen_kg').valor), 'origen de los K&G declarado (derivado: análisis sin campos *_kg)');
  ok(/NO cargar en Momocs ni pyefd/.test(M.get('Columnas_mao').nota), 'advierte que *_mao no es intercambiable');
  ok(M.get('Version_MAO').valor === '9.9.9', 'versión que generó el archivo');
}

console.log('\n=== E · CSV EFA degradado (backend sin raw/dc) ==================');
{
  const S = sandbox(null, '');
  const csv = S._generarCsvEFA({ coefficients: [[1, 2, 3, 4]] }, 'x');
  const tabla = csv.split('\n\n')[0].trim().split('\n');
  ok(tabla[1] === '1,,,,,,,,,,,1,2,3,4', 'sin crudos no hay K&G posible: quedan vacíos, sin inventar');
  ok(tabla[1].split(',').length === 15, 'mantiene 15 columnas');
  ok(metaDe(csv).get('Escala_mm_px').valor === '', 'escala vacia cuando no hay');
  ok(metaDe(csv).get('Origen_kg').valor === 'no disponible', 'y lo declara: K&G no disponible');
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
  const campos = M.filas.slice(1).map(c => c[1]);
  ok(new Set(campos).size === campos.length, 'cada Campo aparece una vez (lectura por clave sin ambigüedad)');
}

// ── Referencia INDEPENDIENTE de Kuhl & Giardina (1982) ──────────────────────
// Ecs. 6-7 sobre el polígono cerrado (t = 0 en el primer punto) y normalización
// de §4 (θ₁, ψ₁, |a₁|), como pyefd. Escrita aquí: no usa nada del helper.
function refEfdKG(P, orden) {
  const C = P.concat([P[0]]);
  const t = [0];
  for (let i = 1; i < C.length; i++) t.push(t[i - 1] + Math.hypot(C[i][0] - C[i - 1][0], C[i][1] - C[i - 1][1]));
  const T = t[t.length - 1];
  const out = [];
  for (let k = 1; k <= orden; k++) {
    const K = T / (2 * k * k * Math.PI * Math.PI);
    let a = 0, b = 0, c = 0, d = 0;
    for (let i = 1; i < C.length; i++) {
      const dt = t[i] - t[i - 1];
      const vx = (C[i][0] - C[i - 1][0]) / dt, vy = (C[i][1] - C[i - 1][1]) / dt;
      const p1 = (2 * Math.PI * k * t[i]) / T, p0 = (2 * Math.PI * k * t[i - 1]) / T;
      a += vx * (Math.cos(p1) - Math.cos(p0)); b += vx * (Math.sin(p1) - Math.sin(p0));
      c += vy * (Math.cos(p1) - Math.cos(p0)); d += vy * (Math.sin(p1) - Math.sin(p0));
    }
    out.push([K * a, K * b, K * c, K * d]);
  }
  return out;
}
function refNormalizarKG(coef) {
  const [a1, b1, c1, d1] = coef[0];
  const th = 0.5 * Math.atan2(2 * (a1 * b1 + c1 * d1), a1 ** 2 - b1 ** 2 + c1 ** 2 - d1 ** 2);
  const mul = (M, R) => [[M[0][0] * R[0][0] + M[0][1] * R[1][0], M[0][0] * R[0][1] + M[0][1] * R[1][1]],
                         [M[1][0] * R[0][0] + M[1][1] * R[1][0], M[1][0] * R[0][1] + M[1][1] * R[1][1]]];
  const rot = (x) => [[Math.cos(x), -Math.sin(x)], [Math.sin(x), Math.cos(x)]];
  let Ms = coef.map(([a, b, c, d], i) => mul([[a, b], [c, d]], rot((i + 1) * th)));
  const psi = Math.atan2(Ms[0][1][0], Ms[0][0][0]);
  Ms = Ms.map((M) => mul(rot(-psi), M));
  const e = Math.abs(Ms[0][0][0]);
  return Ms.map((M) => [M[0][0] / e, M[0][1] / e, M[1][0] / e, M[1][1] / e]);
}
const maxRel = (A, B) => {
  // Una tabla vacía o de otra longitud NO es «error 0»: no pasa en vacío.
  if (!A.length || A.length !== B.length) return Infinity;
  let m = 0, esc = 1;
  B.forEach(r => r.forEach(v => { esc = Math.max(esc, Math.abs(v)); }));
  A.forEach((r, i) => r.forEach((v, j) => { m = Math.max(m, Math.abs(v - B[i][j])); }));
  return m / esc;
};
const colsKG = (T, pref) => T.filas.map(f => ['a', 'b', 'c', 'd'].map(x => f[`${x}_${pref}_kg`]));

// Contorno de prueba: forma con armónicos pares y asimetría, en mm (0,05 mm/px).
const CONTORNO = [];
for (let i = 0; i < 240; i++) {
  const t = (2 * Math.PI * i) / 240;
  const r = 100 * (1 + 0.30 * Math.cos(3 * t) + 0.12 * Math.sin(4 * t) + 0.08 * Math.cos(2 * t + 0.5));
  CONTORNO.push([0.05 * (300 + r * Math.cos(t)), 0.05 * (260 + r * Math.sin(t))]);
}
const REF_CRUDOS = refEfdKG(CONTORNO, 12);
const REF_NORM = refNormalizarKG(REF_CRUDOS);
// Inversa documentada en efa.py: a_MAO = b_KG, b_MAO = −a_KG, c_MAO = d_KG, d_MAO = −c_KG
const MAO_CRUDOS = REF_CRUDOS.map(([a, b, c, d]) => [b, -a, d, -c]);

console.log('\n=== G · columnas *_kg frente a una referencia de K&G (test b) ====');
{
  const S = sandbox(0.05, '');
  // (1) análisis de 1.3.1: el backend ya trae los campos *_kg → se copian tal cual
  const nuevo = {
    coefficients: REF_NORM, coefficients_raw: MAO_CRUDOS,
    coefficients_kg: REF_NORM, coefficients_raw_kg: REF_CRUDOS,
    normalization_kg: { theta_1_deg: 1, psi_1_deg: 2, scale_factor: 3 },
    coefficient_convention: { coefficients: 'mao', coefficients_raw: 'mao',
      coefficients_kg: 'kuhl_giardina_1982', coefficients_raw_kg: 'kuhl_giardina_1982' },
  };
  const T1 = tablaDe(S._generarCsvEFA(nuevo, 'x'));
  ok(maxRel(colsKG(T1, 'raw'), REF_CRUDOS) === 0 && maxRel(colsKG(T1, 'norm'), REF_NORM) === 0,
    'backend con *_kg: el CSV los reproduce bit a bit (sin redondeo)');

  // (2) análisis anterior: sólo crudos MAO sin redondear → derivados en el helper
  const T2 = tablaDe(S._generarCsvEFA({ coefficients: [], coefficients_raw: MAO_CRUDOS }, 'x'));
  const e2c = maxRel(colsKG(T2, 'raw'), REF_CRUDOS), e2n = maxRel(colsKG(T2, 'norm'), REF_NORM);
  ok(e2c < 1e-12 && e2n < 1e-10, `derivados de crudos MAO: crudos ${e2c.toExponential(1)} · normalizados ${e2n.toExponential(1)} (< 1e-10)`);

  // (3) como los guarda de verdad el backend: crudos MAO redondeados a 8 decimales
  const redondeados = MAO_CRUDOS.map(r => r.map(v => Math.round(v * 1e8) / 1e8));
  const T3 = tablaDe(S._generarCsvEFA({ coefficients: [], coefficients_raw: redondeados }, 'x'));
  const e3 = maxRel(colsKG(T3, 'norm'), REF_NORM);
  ok(e3 < 1e-7, `con crudos redondeados a 1e-8 (análisis guardados): ${e3.toExponential(1)} (< 1e-7)`);

  // (4) el defecto: los normalizados internos NO son los de K&G
  const eInt = maxRel(REF_NORM.map((_, i) => nuevo.coefficients_raw[i]), REF_CRUDOS);
  ok(eInt > 0.5, `los crudos del convenio MAO difieren de K&G (${eInt.toFixed(2)}): por eso no bastaba con renombrar`);
}

console.log('\n=== H · convenio en el JSON (efaConConvenio) ====================');
if (!helper) ok(false, 'efaConConvenio requiere js/mao-interop-gmm.js (ADR-021)');
else {
  const j = helper.efaConConvenio({ coefficients: REF_NORM, coefficients_raw: MAO_CRUDOS, n_harmonics: 12 });
  ok(j.coefficient_convention.coefficients === 'mao' && j.coefficient_convention.coefficients_kg === 'kuhl_giardina_1982',
    'declara el convenio de cada campo');
  ok(maxRel(j.coefficients_raw_kg, REF_CRUDOS) < 1e-12 && j.coefficients_kg_origen === 'derivado_de_coefficients_raw',
    'completa los *_kg de un análisis antiguo y dice que son derivados');
  ok(j.coefficients === REF_NORM, 'no toca los campos del convenio interno');
  ok(helper.efaConConvenio(null) === null, 'null → null');
}

console.log('\n' + (fallos === 0 ? 'RESULTADO: todas las comprobaciones pasan' : `RESULTADO: ${fallos} FALLOS`));
process.exit(fallos === 0 ? 0 : 1);
