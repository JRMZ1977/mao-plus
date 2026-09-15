/**
 * tests/test_export_destino.js — capa de destino de la exportación en lote
 *
 * Sin dependencias externas:  node tests/test_export_destino.js  (o: npm run test:js)
 *
 * Carga js/mao-export-destino.js en un `window` simulado con un adaptador FS
 * falso, de modo que se prueba el módulo REAL (rutas, creación de carpetas,
 * normalización de contenidos, manifiesto) sin tocar el disco.
 *
 * Invariante central: con `activo === null` la capa no debe hacer nada — los
 * puntos de guardado caen a su diálogo nativo de siempre (reversibilidad).
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '..');
const codigo = fs.readFileSync(path.join(RAIZ, 'js', 'mao-export-destino.js'), 'utf8');

let fallos = 0;
const ok = (c, m) => { console.log((c ? '  OK    ' : '  FALLO ') + m); if (!c) fallos++; };

/** Monta el módulo con un FS falso que registra las llamadas. */
function montar({ folderPath = '/proy/MiProyecto', fallaEn = null, sinFs = false } = {}) {
  const llamadas = { carpetas: [], archivos: [] };
  const adaptador = sinFs ? null : {
    _source: 'fake',
    ensureFolder: async (p) => { llamadas.carpetas.push(p); return { success: true }; },
    saveFile: async (p, c) => {
      llamadas.archivos.push({ path: p, len: typeof c === 'string' ? c.length : -1, contenido: c });
      return (fallaEn && p.endsWith(fallaEn)) ? { success: false, error: 'disco lleno' } : { success: true };
    },
    readFile: async () => ({ success: false }),
  };
  const ctx = {
    console: { log(){}, warn(){}, error(){} },
    Blob, btoa, Uint8Array, Set, Date, JSON, String, Number, Array, Object, Promise,
    _getFsAdapter: () => adaptador,
    projectManager: folderPath ? { activeProject: { folderPath } } : null,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(codigo, ctx);
  return { D: ctx.window.MaoExportDestino, llamadas };
}

console.log('\n=== A · inactivo por defecto (reversibilidad) ====================');
{
  const { D } = montar();
  ok(D.activo === null, 'arranca con activo === null → los guardados usan su diálogo');
  const r = { success: null };
  D.escribir('x.csv', 'a', 'csv').then(v => Object.assign(r, v));
  ok(true, 'escribir() sin destino no lanza');
}

console.log('\n=== B · resolución de rutas =====================================');
{
  const { D } = montar();
  ok(D.resolver({ tipo: 'cara', id: 'QP1_U1_N1_E1_01_ca' }) === '/proy/MiProyecto/resultados/QP1_U1_N1_E1_01_ca',
     'cara → resultados/<ID>');
  ok(D.resolver({ tipo: 'bifacial', id: 'QP1_U1_N1_E1_01' }) === '/proy/MiProyecto/resultados/QP1_U1_N1_E1_01__bifacial',
     'bifacial → resultados/<ID>__bifacial');
  ok(D.resolver({ tipo: 'cara', id: 'a b/c:d' }) === '/proy/MiProyecto/resultados/a_b_c_d',
     'saneado seguro para sistema de archivos');
  ok(D.resolver({ tipo: 'cara', id: '' }) === '/proy/MiProyecto/resultados/sin_id',
     'id vacío no produce ruta con doble barra');
  ok(montar({ folderPath: null }).D.resolver({ tipo: 'cara', id: 'x' }) === null,
     'sin proyecto activo → null');
}

console.log('\n=== C · apertura ================================================');
(async () => {
  {
    const { D, llamadas } = montar();
    const r = await D.abrir({ tipo: 'cara', id: 'OBJ_1' });
    ok(r.success && r.carpeta === '/proy/MiProyecto/resultados/OBJ_1', 'abre y devuelve la carpeta');
    ok(llamadas.carpetas.includes('/proy/MiProyecto/resultados'), 'crea resultados/');
    ok(llamadas.carpetas.includes('/proy/MiProyecto/resultados/OBJ_1'), 'crea la subcarpeta del objeto');
    ok(D.activo !== null, 'queda activo tras abrir');
    const r2 = await D.abrir({ tipo: 'cara', id: 'OTRO' });
    ok(!r2.success && /en curso/i.test(r2.error), 'rechaza una segunda apertura simultánea');
    await D.cerrar();
    ok(D.activo === null, 'cerrar() deja activo === null');
  }
  {
    const { D } = montar({ sinFs: true });
    const r = await D.abrir({ tipo: 'cara', id: 'X' });
    ok(!r.success && /archivos/i.test(r.error), 'sin adaptador FS informa en vez de romper');
  }

  console.log('\n=== D · escritura y subcarpetas =================================');
  {
    const { D, llamadas } = montar();
    await D.abrir({ tipo: 'cara', id: 'OBJ_1' });
    await D.escribir('OBJ_1_analisis.csv', 'a,b\n1,2\n', 'csv');
    await D.escribir('landmarks/contorno.tps', 'LM=3\n', 'tps');
    await D.escribir('landmarks/contorno_efa.csv', 'h\n', 'csv');

    const rutas = llamadas.archivos.map(a => a.path);
    ok(rutas.includes('/proy/MiProyecto/resultados/OBJ_1/OBJ_1_analisis.csv'), 'escribe en la carpeta del destino');
    ok(rutas.includes('/proy/MiProyecto/resultados/OBJ_1/landmarks/contorno.tps'), 'escribe dentro de subcarpeta');
    const creadas = llamadas.carpetas.filter(c => c.endsWith('/landmarks'));
    ok(creadas.length === 1, `crea landmarks/ UNA sola vez (fs-save-file no crea padres) — ${creadas.length}`);

    const res = await D.cerrar();
    ok(res.escritos.length === 3, 'registra los 3 archivos escritos');
  }

  console.log('\n=== E · contenidos binarios =====================================');
  {
    const { D, llamadas } = montar();
    await D.abrir({ tipo: 'cara', id: 'OBJ_1' });
    await D.escribir('r.pdf', new Blob([new Uint8Array([37, 80, 68, 70])]), 'pdf');
    await D.escribir('i.png', 'data:image/png;base64,AAAA', 'png');
    const pdf = llamadas.archivos.find(a => a.path.endsWith('r.pdf'));
    const png = llamadas.archivos.find(a => a.path.endsWith('i.png'));
    ok(/^data:application\/pdf;base64,/.test(pdf.contenido), 'Blob → data URL base64 (lo que acepta saveFile)');
    ok(pdf.contenido.endsWith(Buffer.from([37,80,68,70]).toString('base64')), 'los bytes del Blob se preservan');
    ok(png.contenido === 'data:image/png;base64,AAAA', 'una data URL ya formada pasa intacta');
    await D.cerrar();
  }

  console.log('\n=== F · manifiesto y auditabilidad ==============================');
  {
    const { D, llamadas } = montar({ fallaEn: 'roto.csv' });
    await D.abrir({ tipo: 'bifacial', id: 'QP1_01' });
    await D.escribir('bien.csv', 'x', 'csv');
    await D.escribir('roto.csv', 'x', 'csv');
    D.omitir('landmarks/', 'módulo EFA del backend Python inactivo');
    const res = await D.cerrar({ imc_global: 0.92 });

    const man = llamadas.archivos.find(a => a.path.endsWith('manifiesto.json'));
    ok(!!man, 'escribe manifiesto.json al cerrar');
    const j = JSON.parse(man.contenido);
    ok(j.tipo === 'MAO_EXPORT_MANIFEST', 'manifiesto tipado');
    ok(j.totales.generados === 1 && j.totales.omitidos === 2, `cuenta 1 generado / 2 omitidos — ${j.totales.generados}/${j.totales.omitidos}`);
    ok(j.omitidos.some(o => /EFA/.test(o.motivo)), 'conserva el motivo de la omisión explícita');
    ok(j.omitidos.some(o => /disco lleno/.test(o.motivo)), 'un fallo de escritura se registra como omitido');
    ok(j.imc_global === 0.92, 'los campos extra del orquestador llegan al manifiesto');
    ok(res.escritos.length === 1, 'el resumen devuelto coincide con el manifiesto');
  }

  console.log('\n' + (fallos === 0 ? 'RESULTADO: todas las comprobaciones pasan' : `RESULTADO: ${fallos} FALLOS`));
  process.exit(fallos === 0 ? 0 : 1);
})();
