// Preload script para MAO Plus — contextBridge edition
// contextIsolation: true  +  nodeIntegration: false
// Node.js NO está disponible en el renderer; todas las ops de fs van por IPC.

const { contextBridge, ipcRenderer } = require('electron');

console.log('🔧 Preload iniciado');
console.log('🌍 Context Isolation:', process.contextIsolated);

// ── Información de la plataforma (solo-lectura) ───────────────────────────────
contextBridge.exposeInMainWorld('electronInfo', {
  platform: process.platform,
  versions: {
    node:     process.versions.node,
    chrome:   process.versions.chrome,
    electron: process.versions.electron
  }
});

// ── API principal para el renderer ───────────────────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {

  // —— Selector de carpeta ————————————————————————————————————————————————————
  selectFolder: () =>
    ipcRenderer.invoke('select-folder'),

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
});

console.log('📱 Plataforma:', process.platform);
console.log('✅ Preload completado — contextBridge activo');
