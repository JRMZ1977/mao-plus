/**
 * MAO Plus — Capa de destino de exportación  (mao-export-destino.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Redirige los exportables de un análisis desde el diálogo nativo «uno a uno»
 * hacia una carpeta de resultados, hermana de la carpeta del análisis:
 *
 *   <proyecto>/
 *   ├── QP1_U1_N1_E1_01_ca/              ← datos del análisis (project-manager.js)
 *   └── resultados/
 *       ├── QP1_U1_N1_E1_01_ca/          ← exportables de esa cara
 *       └── QP1_U1_N1_E1_01__bifacial/   ← exportables del par
 *
 * Diseño (docs/AUDITORIA-EXPORTACION-20260912.md §7):
 *   · Con `activo === null` el comportamiento es IDÉNTICO al anterior: cada punto
 *     de guardado cae a su diálogo nativo de siempre. Reversibilidad total.
 *   · No reimplementa ninguna generación: los exportadores siguen construyendo su
 *     contenido igual, sólo cambia el último paso.
 *   · Sin IPC nuevo: usa `ensureFolder` + `saveFile` del adaptador FS existente
 *     (electronAPI en Electron, PythonBridge.persistence en navegador).
 *
 * Patrón ya probado en el repo: `saveObj3dJsonIndependent()` (obj3d-viewer.js).
 */

window.MaoExportDestino = (function () {
  'use strict';

  /** @type {{carpeta:string, descriptor:Object, escritos:Array, omitidos:Array, _dirs:Set<string>}|null} */
  let _activo = null;

  const MIME = {
    csv:  'text/csv;charset=utf-8',
    tps:  'text/plain;charset=utf-8',
    txt:  'text/plain;charset=utf-8',
    json: 'application/json',
    svg:  'image/svg+xml;charset=utf-8',
    png:  'image/png',
    jpeg: 'image/jpeg',
    pdf:  'application/pdf',
    html: 'text/html;charset=utf-8',
  };

  function _slug(v) {
    return String(v || '').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_') || 'sin_id';
  }

  function _log(...a) { if (window._MAO_DEBUG) console.log('[destino]', ...a); }

  /** Adaptador FS: electronAPI → PythonBridge. Reutiliza el de project-manager.js. */
  function _fs() {
    return (typeof _getFsAdapter === 'function') ? _getFsAdapter() : null;
  }

  /** Carpeta del proyecto activo, o null. */
  function _carpetaProyecto() {
    const pm = window.projectManager || (typeof projectManager !== 'undefined' ? projectManager : null);
    return pm?.activeProject?.folderPath || null;
  }

  /**
   * Ruta de la carpeta de resultados para un descriptor.
   * @param {{tipo:'cara'|'bifacial', id:string}} descriptor
   * @param {string} [carpetaProyecto] fuerza la raíz (si no, el proyecto activo)
   * @returns {string|null}
   */
  function resolver(descriptor, carpetaProyecto) {
    const raiz = carpetaProyecto || _carpetaProyecto();
    if (!raiz) return null;
    const id = _slug(descriptor?.id);
    const nombre = descriptor?.tipo === 'bifacial' ? `${id}__bifacial` : id;
    return `${raiz}/resultados/${nombre}`;
  }

  /**
   * Abre un destino: crea `<proyecto>/resultados/<nombre>/` y lo fija como activo.
   * Si no hay proyecto activo pide carpeta al usuario (mismo patrón que obj3d).
   * @returns {Promise<{success:boolean, carpeta?:string, error?:string}>}
   */
  async function abrir(descriptor) {
    if (_activo) return { success: false, error: 'Ya hay una exportación en curso' };
    const fs = _fs();
    if (!fs) return { success: false, error: 'Sin sistema de archivos disponible (requiere Electron o servidor Python)' };

    let raiz = _carpetaProyecto();
    if (!raiz && window.electronAPI?.selectFolder) {
      raiz = await window.electronAPI.selectFolder({});
      if (!raiz) return { success: false, error: 'cancelado' };
    }
    if (!raiz) return { success: false, error: 'No hay proyecto activo ni carpeta seleccionable' };

    const carpeta = resolver(descriptor, raiz);
    for (const dir of [`${raiz}/resultados`, carpeta]) {
      const r = await fs.ensureFolder(dir);
      if (!r?.success) return { success: false, error: `No se pudo crear ${dir}: ${r?.error || 'desconocido'}` };
    }

    _activo = { carpeta, descriptor, escritos: [], omitidos: [], _dirs: new Set([carpeta]) };
    _log('abierto', carpeta);
    return { success: true, carpeta };
  }

  /** Convierte Blob/ArrayBuffer a data URL base64; deja pasar strings tal cual. */
  async function _normalizar(contenido, formato) {
    if (typeof contenido === 'string') return contenido;
    const mime = MIME[formato] || 'application/octet-stream';
    let ab = contenido;
    if (contenido instanceof Blob) ab = await contenido.arrayBuffer();
    const u8 = new Uint8Array(ab);
    let bin = '';
    const CH = 0x8000; // trocear: btoa revienta con arrays muy grandes
    for (let i = 0; i < u8.length; i += CH) {
      bin += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    }
    return `data:${mime.split(';')[0]};base64,${btoa(bin)}`;
  }

  /**
   * Escribe un archivo dentro del destino activo.
   * `rutaRelativa` puede llevar subcarpetas ('landmarks/contorno.tps'): se crean.
   * @returns {Promise<{success:boolean, path?:string, error?:string}>}
   */
  async function escribir(rutaRelativa, contenido, formato) {
    if (!_activo) return { success: false, error: 'Sin destino activo' };
    const fs = _fs();
    if (!fs) return { success: false, error: 'Sin sistema de archivos' };

    const rel = String(rutaRelativa).replace(/^\/+/, '');
    const destino = `${_activo.carpeta}/${rel}`;

    // fs-save-file NO crea directorios padre (main.js): asegurarlos aquí.
    const corte = rel.lastIndexOf('/');
    if (corte > 0) {
      const dir = `${_activo.carpeta}/${rel.slice(0, corte)}`;
      if (!_activo._dirs.has(dir)) {
        const r = await fs.ensureFolder(dir);
        if (!r?.success) return { success: false, error: `No se pudo crear ${dir}: ${r?.error}` };
        _activo._dirs.add(dir);
      }
    }

    try {
      const payload = await _normalizar(contenido, formato);
      const r = await fs.saveFile(destino, payload);
      if (!r?.success) {
        _activo.omitidos.push({ archivo: rel, motivo: r?.error || 'error al escribir' });
        return { success: false, error: r?.error };
      }
      _activo.escritos.push({ archivo: rel, formato: formato || null });
      _log('escrito', rel);
      return { success: true, path: destino };
    } catch (e) {
      _activo.omitidos.push({ archivo: rel, motivo: e.message });
      return { success: false, error: e.message };
    }
  }

  /**
   * Registra un artefacto NO generado y por qué. Es la diferencia entre una
   * exportación y una exportación auditable: sin esto, una carpeta incompleta
   * (backend EFA caído, P/H sin confirmar…) pasa inadvertida (§9.7).
   */
  function omitir(archivo, motivo) {
    if (_activo) _activo.omitidos.push({ archivo, motivo: String(motivo || 'sin motivo') });
  }

  /**
   * Cierra el destino escribiendo `manifiesto.json` con lo generado y lo omitido.
   * @returns {Promise<{carpeta:string, escritos:Array, omitidos:Array}>}
   */
  async function cerrar(extra = {}) {
    if (!_activo) return { carpeta: null, escritos: [], omitidos: [] };
    const resumen = {
      carpeta: _activo.carpeta,
      escritos: _activo.escritos.slice(),
      omitidos: _activo.omitidos.slice(),
    };
    const manifiesto = {
      version: '1.0.0',
      tipo: 'MAO_EXPORT_MANIFEST',
      generadoEn: new Date().toISOString(),
      descriptor: _activo.descriptor,
      ...extra,
      archivos: resumen.escritos,
      omitidos: resumen.omitidos,
      totales: { generados: resumen.escritos.length, omitidos: resumen.omitidos.length },
    };
    try {
      const fs = _fs();
      if (fs) await fs.saveFile(`${_activo.carpeta}/manifiesto.json`, JSON.stringify(manifiesto, null, 2));
    } catch (e) {
      console.warn('[destino] no se pudo escribir manifiesto.json:', e.message);
    }
    _log('cerrado', resumen.carpeta, `${resumen.escritos.length} escritos / ${resumen.omitidos.length} omitidos`);
    _activo = null;
    return resumen;
  }

  /** Aborta sin escribir manifiesto (para errores duros). */
  function abortar() { _activo = null; }

  return {
    get activo() { return _activo; },
    resolver, abrir, escribir, omitir, cerrar, abortar,
  };
})();

console.log('✅ MaoExportDestino inicializado');
