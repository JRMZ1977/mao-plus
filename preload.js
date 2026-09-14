// Preload script para MAO Plus — contextBridge edition
// contextIsolation: true  +  nodeIntegration: false
// Node.js NO está disponible en el renderer; todas las ops de fs van por IPC.

const { contextBridge, ipcRenderer } = require('electron');

console.log('🔧 Preload iniciado');
console.log('🌍 Context Isolation:', process.contextIsolated);

// ── Información de la plataforma (solo-lectura) ───────────────────────────────
contextBridge.exposeInMainWorld('electronInfo', {
  platform: process.platform,
  appDir:   __dirname,          // ruta absoluta de la app — para construir app:// URLs
  versions: {
    node:     process.versions.node,
    chrome:   process.versions.chrome,
    electron: process.versions.electron
  }
});

// ── API principal para el renderer ───────────────────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {

  // —— Selector de carpeta ————————————————————————————————————————————————————
  selectFolder: (options = {}) =>
    ipcRenderer.invoke('select-folder', options),

  // —— Operaciones de sistema de archivos (IPC → main process) ————————————————
  saveFile: (filePath, content) =>
    ipcRenderer.invoke('fs-save-file', { filePath, content }),

  // writeFile: alias de saveFile (compatibilidad con project-manager.js)
  writeFile: (filePath, content) =>
    ipcRenderer.invoke('fs-save-file', { filePath, content }),

  readFile: (filePath, encoding) =>
    ipcRenderer.invoke('fs-read-file', { filePath, encoding }),

  copyFile: (src, dst) =>
    ipcRenderer.invoke('fs-copy-file', { src, dst }),


  folderExists: (folderPath) =>
    ipcRenderer.invoke('fs-folder-exists', { folderPath }),

  ensureFolder: (folderPath) =>
    ipcRenderer.invoke('fs-ensure-folder', { folderPath }),

  listDirectory: (dirPath) =>
    ipcRenderer.invoke('fs-list-directory', { dirPath }),

  fileExists: (filePath) =>
    ipcRenderer.invoke('fs-file-exists', { filePath }),

  getThumbnailDataUrl: (filePath) =>
    ipcRenderer.invoke('fs-thumbnail-data-url', { filePath }),

  generatePDFFromHTML: (htmlContent, outputPath) =>
    ipcRenderer.invoke('generate-pdf-from-html', { htmlContent, outputPath }),

  openFolder: (folderPath) =>
    ipcRenderer.invoke('shell-open-path', { folderPath }),

  ensureFolder: (folderPath) =>
    ipcRenderer.invoke('fs-ensure-folder', { folderPath }),

  getStats: (itemPath) =>
    ipcRenderer.invoke('fs-get-stats', { itemPath }),

  scanForAnalysis: (rootPath, maxDepth) =>
    ipcRenderer.invoke('fs-scan-for-analysis', { rootPath, maxDepth }),

  validateAnalysis: (analysisPath) =>
    ipcRenderer.invoke('fs-validate-analysis', { analysisPath }),

  trashItem: (itemPath) =>
    ipcRenderer.invoke('fs-trash-item', { itemPath }),

  // —— Diálogos nativos ————————————————————————————————————————————————————————
  showSaveDialog: (filename, format) =>
    ipcRenderer.invoke('show-save-dialog', { filename, format }),

  saveFileWithDialog: (filename, content, format) =>
    ipcRenderer.invoke('save-file', { filename, content, format }),

  // —— Ventana Comparador ——————————————————————————————————————————————————————
  openComparadorWindow: () =>
    ipcRenderer.invoke('open-comparador-window'),

  // —— Estado servidor Python ——————————————————————————————————————————————————
  getPythonServerStatus: () =>
    ipcRenderer.invoke('python-server-status'),

  // —— Estado del backend para badge UI ————————————————————————————————————————
  getBackendStatus: () =>
    ipcRenderer.invoke('mao:backend-status:get'),

  /** Suscripción a cambios de estado del backend. Devuelve `unsubscribe()`. */
  onBackendStatus: (cb) => {
    if (typeof cb !== 'function') return () => {};
    const handler = (_evt, payload) => { try { cb(payload); } catch {} };
    ipcRenderer.on('mao:backend-status', handler);
    return () => ipcRenderer.removeListener('mao:backend-status', handler);
  },

  /** Gate dev-only — ADR-010 E2E hook */
  getIsDev: () =>
    ipcRenderer.invoke('mao:is-dev'),

  /** Get boot metrics for Fase 4 evaluation */
  getBootMetrics: () =>
    ipcRenderer.invoke('get-boot-metrics'),

  /** Send boot metrics to main process */
  reportBootMetrics: (metrics) =>
    ipcRenderer.send('report-boot-metrics', metrics),
});

console.log('📱 Plataforma:', process.platform);
console.log('✅ Preload completado — contextBridge activo');

// ── Error Reporter para mao-console-analyzer ────────────────────────────────
// Captura errores del renderer y los envía al main process
(() => {
  const errors = [];
  const maxErrors = 100;
  
  // Capturar errores no manejados
  window.addEventListener('error', (event) => {
    const errorData = {
      type: 'error',
      timestamp: new Date().toISOString(),
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      name: event.error?.name || 'Error',
      stack: event.error?.stack || ''
    };
    errors.push(errorData);
    if (errors.length > maxErrors) errors.shift();
    ipcRenderer.send('renderer-error-occurred', errorData);
  });
  
  // Capturar promesas rechazadas sin captura
  window.addEventListener('unhandledrejection', (event) => {
    const errorData = {
      type: 'unhandledRejection',
      timestamp: new Date().toISOString(),
      message: event.reason?.message || String(event.reason),
      name: event.reason?.name || 'UnhandledPromiseRejection',
      stack: event.reason?.stack || ''
    };
    errors.push(errorData);
    if (errors.length > maxErrors) errors.shift();
    ipcRenderer.send('renderer-error-occurred', errorData);
  });
  
  // Exponer API para acceder a errores capturados
  contextBridge.exposeInMainWorld('rendererErrors', {
    getErrors: () => errors,
    clearErrors: () => errors.length = 0
  });

  console.log('🔴 Error reporter activo — capturando errores del renderer');
})();

// ── Router de Pestañas LAAR ───────────────────────────────────────────────────
// NO se expone vía contextBridge: el router (js/mao-tab-router.js) corre en el
// main world del renderer y define window.maoTabRouter directamente. Exponerlo
// aquí creaba una propiedad de solo-lectura que el router no podía sobreescribir
// (TypeError "Cannot assign to read only property 'maoTabRouter'") y cuyos
// métodos eran auto-referenciales. El relay IPC se eliminó porque main.js nunca
// emite mao:detection:done / mao:analysis:done / mao:project:saved; esos eventos
// se disparan ahora en el propio renderer (ver js/mao-tab-router.js).
