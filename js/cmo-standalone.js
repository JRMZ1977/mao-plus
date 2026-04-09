// MAO Plus — Inicialización CMO standalone (ventana hija Electron)
(function cmoStandaloneInit() {
  if (new URLSearchParams(window.location.search).get('cmo') !== '1') return;

  // ── RECONSTRUIR electronAPI PARA VENTANA HIJA ─────────────────────────────
  // setWindowOpenHandler crea la ventana hija y le aplica el preload, pero en
  // Electron 28 la propagación de window.electronAPI al hijo no siempre funciona.
  // Como nodeIntegration:true está activo en la ventana hija, podemos usar
  // require('fs') directamente desde scripts de página.
  // Estrategia: primero respetar el preload (que lo configura correctamente),
  // y solo como fallback usar window.opener o require() directo.
  (function buildElectronAPI() {

    // ── Estrategia 0 (PRIORITARIA): el preload ya configuró electronAPI ──────────────
    // preload.js corre en la ventana hija antes que cualquier script de página;
    // si readFile ya es función, no hay nada que reconstruir ni sobrescribir.
    if (window.electronAPI && typeof window.electronAPI.readFile === 'function') {
      console.log('[CMO] ✅ electronAPI disponible (preload) — no se modifica');
      return;
    }
    console.warn('[CMO] ⚠️ electronAPI no disponible del preload, probando alternativas…');

    // ── Estrategia 1: tomar el API de la ventana que nos abrió (window.opener) ──────
    // NOTA: en Electron con procesos de renderer separados el proxy cross-process
    // puede ser inestable; solo se usa si el readFile del opener funciona localmente.
    try {
      const opener = window.opener;
      if (opener && opener.electronAPI && typeof opener.electronAPI.readFile === 'function') {
        window.electronAPI = opener.electronAPI;
        console.log('[CMO] electronAPI tomado de window.opener (ventana principal)');
        return;
      }
    } catch (e) {
      console.warn('[CMO] window.opener no accesible:', e.message);
    }

    // ── Estrategia 2: construir desde Node.js (nodeIntegration:true) ─────────────────
    try {
      // Electron expone require tanto como global como en window
      const _req = (typeof window.require === 'function' ? window.require
                  : typeof require    === 'function' ? require : null);
      if (!_req) throw new Error('require no disponible');

      const _fs   = _req('fs').promises;
      const _path = _req('path');
      let _ipc = null;
      try { _ipc = _req('electron').ipcRenderer; } catch (_) { /* diálogos nativos opcionales */ }

      window.electronAPI = {
        readFile: async (fp, enc = 'utf8') => {
          try {
            if (/\.(png|jpg|jpeg)$/i.test(fp)) {
              const buf = await _fs.readFile(fp);
              const b64  = buf.toString('base64');
              const mime = fp.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
              return { success: true, content: `data:${mime};base64,${b64}` };
            }
            const content = await _fs.readFile(fp, enc);
            return { success: true, content };
          } catch (e) {
            if (e.code !== 'ENOENT') console.error('[CMO] readFile error:', e.message);
            return { success: false, error: e.message };
          }
        },
        saveFile: async (fp, data) => {
          try {
            if (typeof data === 'string' && data.startsWith('data:')) {
              const m = data.match(/^data:[^;]+;base64,(.+)$/);
              if (m) { await _fs.writeFile(fp, Buffer.from(m[1], 'base64')); return { success: true }; }
            }
            await _fs.writeFile(fp, data, 'utf8');
            return { success: true };
          } catch (e) { return { success: false, error: e.message }; }
        },
        ensureFolder: async (fp) => {
          try { await _fs.mkdir(fp, { recursive: true }); return { success: true }; }
          catch (e) { return { success: false, error: e.message }; }
        },
        folderExists: async (fp) => { try { return (await _fs.stat(fp)).isDirectory(); } catch { return false; } },
        fileExists:   async (fp) => { try { return (await _fs.stat(fp)).isFile();      } catch { return false; } },
        listDirectory: async (dp) => {
          try {
            const entries = await _fs.readdir(dp, { withFileTypes: true });
            return { success: true, items: entries.map(e => ({
              name: e.name, isDirectory: e.isDirectory(), isFile: e.isFile(),
              path: _path.join(dp, e.name)
            })) };
          } catch (e) { return { success: false, error: e.message }; }
        },
        getStats: async (fp) => {
          try {
            const s = await _fs.stat(fp);
            return { success: true, stats: { isFile: s.isFile(), isDirectory: s.isDirectory(), size: s.size, created: s.birthtime, modified: s.mtime } };
          } catch (e) { return { success: false, error: e.message }; }
        },
        selectFolder:       async () => _ipc ? _ipc.invoke('select-folder') : { canceled: true },
        showSaveDialog:     async (fn, fmt) => _ipc ? _ipc.invoke('show-save-dialog', { filename: fn, format: fmt }) : { canceled: true },
        saveFileWithDialog: async (fn, d, fmt) => _ipc ? _ipc.invoke('save-file', { filename: fn, content: d, format: fmt }) : { success: false, error: 'IPC no disponible' },
        openComparadorWindow: async () => {},
      };
      console.log('[CMO] electronAPI construido via Node.js require()' + (_ipc ? ' + ipcRenderer' : ''));
    } catch (e) {
      console.error('[CMO] No se pudo construir electronAPI:', e.message);
    }
  })();

  window.addEventListener('DOMContentLoaded', () => {
    // Cambiar título de la ventana
    document.title = 'MAO Plus — Comparador Multi-Objeto';

    // Extraer la sección CMO del árbol y hacerla hija directa de body
    // (necesario para que el CSS body.cmo-standalone > * pueda ocultarla selectivamente)
    const cmoSection = document.getElementById('comparadorMultiObjetoSection');
    if (cmoSection) {
      document.body.appendChild(cmoSection);
    }

    // Activar modo standalone (oculta toda la UI principal vía CSS)
    document.body.classList.add('cmo-standalone');

    // Auto-lanzar la carga de datos: esperar a que projectManager esté listo
    (async function autoLaunch() {
      const msgEl = document.getElementById('cmoStandaloneMsg');
      const setMsg = (html, cls) => {
        if (!msgEl) return;
        msgEl.className = cls;
        msgEl.innerHTML = html;
      };

      setMsg('⏳ Iniciando carga de datos del proyecto…', 'smsg-loading');

      // Esperar a que projectManager esté definido (hasta 8 s)
      let retries = 0;
      while (typeof projectManager === 'undefined' && retries++ < 80) {
        await new Promise(r => setTimeout(r, 100));
      }
      if (typeof projectManager === 'undefined') {
        setMsg('❌ Error interno: projectManager no disponible. Reinicia la aplicación.', 'smsg-error');
        return;
      }

      // Si viene un pid en la URL, forzar ese proyecto como activo
      const pid = new URLSearchParams(window.location.search).get('pid');
      if (pid && (!projectManager.activeProject || projectManager.activeProject.id !== pid)) {
        const proj = projectManager.projects.find(p => p.id === pid);
        if (proj) {
          projectManager.activeProject = proj;
          console.log('[CMO standalone] Proyecto forzado desde URL:', proj.name || proj.nombre || pid);
        }
      }

      // Verificar estado antes de proceder
      if (!projectManager.activeProject) {
        const np = projectManager.projects.length;
        setMsg(
          `❌ Sin proyecto activo. Proyectos en memoria: ${np}. ` +
          `Abre el proyecto en la ventana principal y vuelve a abrir el Comparador.`,
          'smsg-error'
        );
        return;
      }

      const proj = projectManager.activeProject;
      const refs  = proj.analyses || [];
      const nDisk = refs.filter(r => r.rutaCompleta || r.carpeta).length;

      if (!refs.length) {
        setMsg(
          `⚠ El proyecto "${proj.name || proj.id}" no tiene análisis registrados todavía.`,
          'smsg-warn'
        );
        return;
      }

      setMsg(
        `⏳ Cargando ${nDisk} de ${refs.length} análisis del proyecto "<b>${proj.name || proj.id}</b>"…`,
        'smsg-loading'
      );

      // Dar un tick para que init() haya registrado el handler del botón
      await new Promise(r => setTimeout(r, 300));
      const btn = document.getElementById('abrirComparadorBtn');
      if (btn && !btn.disabled) btn.click();

      // Esperar resultado: sondear la lista de objetos (hasta 6 s)
      let loaded = false;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 200));
        const lista = document.getElementById('cmoListaObjetos');
        if (lista && lista.children.length > 0) { loaded = true; break; }
      }

      if (loaded) {
        // Ocultar barra de estado: la UI ya muestra los datos
        setMsg('', '');
        msgEl.style.display = 'none';
      } else {
        setMsg(
          `⚠ No se encontraron análisis con datos en disco. ` +
          `El proyecto "<b>${proj.name || proj.id}</b>" registra ${refs.length} análisis, ` +
          `${nDisk} con ruta de disco guardada. ` +
          `<button onclick="document.getElementById('abrirComparadorBtn').click()">Reintentar</button>`,
          'smsg-warn'
        );
      }
    })();
  });
})();
