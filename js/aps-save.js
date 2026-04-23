// MAO Plus — Sistema de guardado de Análisis Procrustes (APS)
// Modela el mismo patrón de 3 capas que el análisis morfológico:
//   window._lastAPS  →  localStorage  →  disco

const APS_SAVE_DISPLAY_NAME = 'Análisis Procrustes (PS/GPA)';
const APS_SAVE_SHORT_NAME = 'Procrustes';

/**
 * Convierte texto a slug corto y estable para nombres de carpeta/archivo.
 * @param {string} text
 * @returns {string}
 */
function _slugify(text) {
  const raw = String(text || '').trim();
  if (!raw) return 'coleccion';
  return raw
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'coleccion';
}

/**
 * Formatea fecha ISO como YYYYMMDD_HHMMSS para nombres legibles/ordenables.
 * @param {string} iso
 * @returns {string}
 */
function _compactTimestamp(iso) {
  const d = iso ? new Date(iso) : new Date();
  const pad = n => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const yy   = String(yyyy).slice(-2);
  const mm   = pad(d.getMonth() + 1);
  const dd   = pad(d.getDate());
  const hh   = pad(d.getHours());
  const mi   = pad(d.getMinutes());
  return `${yy}${mm}${dd}${hh}${mi}`;
}

/**
 * Normaliza modo a una etiqueta muy corta (3 letras).
 * @param {string} modo
 * @returns {string}
 */
function _modeTag(modo) {
  const m = _slugify(modo || 'gpa');
  if (m.includes('espec')) return 'esp';
  if (m.includes('compar')) return 'cmp';
  if (m.includes('gpa')) return 'gpa';
  if (m.includes('mono')) return 'mon';
  if (m.includes('bifa') || m.includes('bi')) return 'bif';
  return m.slice(0, 3) || 'gpa';
}

/**
 * Construye base nominal para carpeta/archivos APS:
 * c_<coleccion>__psgpa_<modo3>_n<n>_<fecha10>_<id6>
 */
function _buildAPSBaseName(project, aps, id) {
  const collectionName = project?.commonTrait?.trim() || project?.name || 'coleccion';
  const col = _slugify(collectionName).slice(0, 14) || 'coleccion';
  const modo = _modeTag(aps?.modo || 'gpa');
  const n = aps?.objetos?.length || 0;
  const ts = _compactTimestamp(aps?.timestamp);
  const id6 = String(id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6) || 'id';
  return `c_${col}__psgpa_${modo}_n${n}_${ts}_${id6}`;
}

/**
 * Captura un canvas como data URL base64 (png).
 * Devuelve null si el canvas no existe o tiene dimensiones cero.
 * @param {string|HTMLCanvasElement} canvOrId
 * @returns {string|null}
 */
function _captureCanvas(canvOrId) {
  try {
    const c = typeof canvOrId === 'string'
      ? document.getElementById(canvOrId)
      : canvOrId;
    if (!c || !(c instanceof HTMLCanvasElement)) return null;
    if (c.width === 0 || c.height === 0) return null;
    return c.toDataURL('image/png');
  } catch (_) {
    return null;
  }
}

/**
 * Guarda el análisis APS activo en disco (carpeta del proyecto activo).
 * Requiere window._lastAPS poblado por procrustes.js.
 * Requiere window.projectManager con proyecto activo y folderPath configurado.
 *
 * Estructura generada:
 *   {projectFolder}/aps/{id_aps}/
 *     ├── metadata.json
 *     ├── aps_parcial.json
 *     ├── aps_gpa.json
 *     └── imagenes/
 *         ├── gpa_formas.png
 *         ├── gpa_deformacion.png
 *         ├── gpa_pca.png
 *         └── gpa_alometria.png
 */
async function guardarAnalisisAPS() {
  // ── 1. Validaciones previas ──────────────────────────────────────────────
  if (!window._lastAPS) {
    toast.warning(`No hay ${APS_SAVE_DISPLAY_NAME} disponible para guardar. Ejecuta primero el análisis.`);
    return false;
  }

  const pm = (typeof projectManager !== 'undefined' ? projectManager : window.projectManager);
  if (!pm || !pm.activeProject) {
    toast.warning('No hay proyecto activo. Activa un proyecto antes de guardar.');
    return false;
  }

  const project = pm.activeProject;
  if (!project.folderPath) {
    toast.warning('El proyecto activo no tiene carpeta configurada. El análisis solo se almacenará en memoria.');
    // Guardar en memoria aún así
    _persistirAPSEnMemoria(project);
    return true;
  }

  const _fs = _getFsAdapter();
  if (!_fs) {
    toast.error('No hay sistema de archivos disponible (requiere Electron o servidor Python).');
    return false;
  }

  // ── 2. Preparar ID y rutas ───────────────────────────────────────────────
  const aps = window._lastAPS;
  const id  = aps.id || (Date.now().toString() + Math.random().toString(36).substr(2, 9));
  aps.id    = id; // Fijar ID si no existía
  const baseName = _buildAPSBaseName(project, aps, id);
  const collectionSlug = _slugify(project?.commonTrait?.trim() || project?.name || 'coleccion');

  const apsFolder   = `${project.folderPath}/aps/${collectionSlug}/${baseName}`;
  const imgFolder   = `${apsFolder}/imagenes`;

  // ── 3. Mostrar spinner en el botón ──────────────────────────────────────
  const btn = document.getElementById('psGuardarAPSBtn');
  const originalText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando…'; }

  try {
    // ── 4. Crear carpetas ──────────────────────────────────────────────────
    const r1 = await _fs.ensureFolder(`${project.folderPath}/aps`);
    if (!r1.success) throw new Error(`No se pudo crear /aps: ${r1.error}`);

    const rCol = await _fs.ensureFolder(`${project.folderPath}/aps/${collectionSlug}`);
    if (!rCol.success) throw new Error(`No se pudo crear carpeta de colección APS: ${rCol.error}`);

    const r2 = await _fs.ensureFolder(apsFolder);
    if (!r2.success) throw new Error(`No se pudo crear carpeta APS: ${r2.error}`);

    const r3 = await _fs.ensureFolder(imgFolder);
    if (!r3.success) throw new Error(`No se pudo crear /imagenes: ${r3.error}`);

    // ── 5. metadata.json ──────────────────────────────────────────────────
    const metadata = {
      version: '1.0.0',
      tipo: 'MAO_APS_ANALYSIS',
      id,
      nombreBase: baseName,
      coleccionSlug: collectionSlug,
      timestamp: aps.timestamp,
      modo: aps.modo,
      N_landmarks: aps.N_landmarks || 64,
      objetos: aps.objetos || [],
      proyecto: {
        id: project.id,
        nombre: project.name,
        sitio: project.sitio || '',
        investigadorResponsable: project.investigadorResponsable || '',
        institucionResponsable: project.institucionResponsable || ''
      },
      resumenGPA: aps.gpa ? {
        n: aps.objetos?.length || 0,
        V_Procrustes: aps.gpa.procVar,
        rho_media:    aps.gpa.meanRho,
        iters:        aps.gpa.iters,
        converged:    aps.gpa.converged,
        allomRsq:     aps.gpa.allometry?.Rsq ?? null,
        allomPval:    aps.gpa.allometry?.pval ?? null,
        D2_Mahalanobis: aps.gpa.mahaD2?.D2 ?? null,
        Pillai:         aps.gpa.mahaD2?.pillai ?? null
      } : null,
      archivos: {
        metadata:   `${baseName}_metadata.json`,
        parcial:    `${baseName}_parcial.json`,
        gpa:        `${baseName}_gpa.json`,
        imagenes:   'imagenes/'
      }
    };

    const rm = await _fs.saveFile(`${apsFolder}/${baseName}_metadata.json`,
      JSON.stringify(metadata, null, 2));
    if (!rm.success) throw new Error(`Error guardando ${baseName}_metadata.json: ${rm.error}`);

    // ── 6. aps_parcial.json ──────────────────────────────────────────────
    const parcialData = {
      nombreBase: baseName,
      timestamp: aps.timestamp,
      modo: aps.modo,
      pares: aps.parcial || []
    };
    const rp = await _fs.saveFile(`${apsFolder}/${baseName}_parcial.json`,
      JSON.stringify(parcialData, null, 2));
    if (!rp.success) throw new Error(`Error guardando ${baseName}_parcial.json: ${rp.error}`);

    // ── 7. aps_gpa.json ───────────────────────────────────────────────────
    if (aps.gpa) {
      const gpaData = { nombreBase: baseName, ...aps.gpa };
      const rg = await _fs.saveFile(`${apsFolder}/${baseName}_gpa.json`,
        JSON.stringify(gpaData, null, 2));
      if (!rg.success) throw new Error(`Error guardando ${baseName}_gpa.json: ${rg.error}`);
    }

    // ── 8. Capturas de canvas ─────────────────────────────────────────────
    const canvasMap = {
      [`${baseName}_formas.png`]:      'psGPACanvas',
      [`${baseName}_deformacion.png`]: 'psDeformCanvas',
      [`${baseName}_pca.png`]:         'psGPAPCACanvas',
      [`${baseName}_alometria.png`]:   'psGPAAllomCanvas'
    };

    const imagenesGuardadas = {};
    for (const [fname, canvId] of Object.entries(canvasMap)) {
      const dataUrl = _captureCanvas(canvId);
      if (dataUrl) {
        const ri = await _fs.saveFile(`${imgFolder}/${fname}`, dataUrl);
        if (ri.success) imagenesGuardadas[fname] = `imagenes/${fname}`;
      }
    }

    // ── 9. Actualizar referencia en ProjectManager ────────────────────────
    const apsRef = {
      id,
      timestamp:  aps.timestamp,
      modo:       aps.modo,
      nObjetos:   aps.objetos?.length || 0,
      objetos:    (aps.objetos || []).map(o => o.nombre || o.id),
      nombreBase: baseName,
      carpeta:    `aps/${collectionSlug}/${baseName}`,
      rutaCompleta: apsFolder,
      resumen: metadata.resumenGPA
    };
    _persistirAPSEnMemoria(project, apsRef);

    // ── 10. Actualizar archivo .mao del proyecto ──────────────────────────
    if (typeof actualizarArchivoProyectoAPS === 'function') {
      await actualizarArchivoProyectoAPS(project, apsRef).catch(e =>
        console.warn('⚠️ No se pudo actualizar .mao con APS:', e.message)
      );
    }

    toast.success(`${APS_SAVE_SHORT_NAME} guardado correctamente (${aps.objetos?.length || 0} objetos)`);
    console.log(`✅ ${APS_SAVE_SHORT_NAME} guardado en: ${apsFolder}`);
    return true;

  } catch (err) {
    console.error('❌ Error guardando APS:', err);
    toast.error(`Error al guardar ${APS_SAVE_SHORT_NAME}: ${err.message}`);
    return false;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
  }
}

/**
 * Persiste la referencia APS en localStorage (vía ProjectManager).
 * Añade a project.apsAnalyses[] (array separado de analyses[]).
 */
function _persistirAPSEnMemoria(project, apsRef) {
  if (!Array.isArray(project.apsAnalyses)) project.apsAnalyses = [];

  if (apsRef) {
    // Evitar duplicados por id
    const idx = project.apsAnalyses.findIndex(a => a.id === apsRef.id);
    if (idx >= 0) {
      project.apsAnalyses[idx] = apsRef;
    } else {
      project.apsAnalyses.push(apsRef);
    }
  }

  project.updatedAt = new Date().toISOString();
  const _pm = (typeof projectManager !== 'undefined' ? projectManager : window.projectManager);
  if (_pm) _pm.save();
}

/**
 * Actualiza la sección apsAnalyses del archivo .mao del proyecto.
 * Se añade como campo independiente de analisis[] para no romper el flujo
 * de análisis morfológicos.
 */
async function actualizarArchivoProyectoAPS(project, apsRef) {
  if (!window.electronAPI) return; // Solo disponible en Electron
  if (!project.folderPath) return;

  const dirResult = await window.electronAPI.listDirectory(project.folderPath);
  if (!dirResult.success) return;

  const maoFiles = dirResult.items.filter(i => i.isFile && i.name.endsWith('.mao'));
  if (!maoFiles.length) return;

  const filePath  = maoFiles[0].path;
  const readResult = await window.electronAPI.readFile(filePath);
  if (!readResult.success) return;

  let proyectoMAO;
  try { proyectoMAO = JSON.parse(readResult.content); }
  catch (_) { return; }

  if (!Array.isArray(proyectoMAO.apsAnalyses)) proyectoMAO.apsAnalyses = [];

  const idx = proyectoMAO.apsAnalyses.findIndex(a => a.id === apsRef.id);
  if (idx >= 0) {
    proyectoMAO.apsAnalyses[idx] = apsRef;
  } else {
    proyectoMAO.apsAnalyses.push(apsRef);
  }
  proyectoMAO.metadata.ultimaActualizacion = new Date().toISOString();

  await window.electronAPI.saveFile(filePath, JSON.stringify(proyectoMAO, null, 2));
}

// ============================================================================
// Inicialización: conectar botón "Guardar APS" al abrir el modal
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // El botón puede no existir todavía si el modal se agrega dinámicamente;
  // usamos delegación en document.
  document.addEventListener('click', e => {
    if (e.target && e.target.id === 'psGuardarAPSBtn') {
      guardarAnalisisAPS();
    }
  });
});
