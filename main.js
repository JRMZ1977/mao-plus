const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path   = require('path');
const { spawn } = require('child_process');
const http   = require('http');
const fs     = require('fs');
const fsP    = fs.promises;     // versión async — usada por los handlers IPC de fs

let mainWindow;
let comparadorWindow = null;
let pyServer = null;          // proceso hijo uvicorn
let pyServerReady = false;    // true cuando /api/health responde OK

// Última carpeta de exportación usada (para recordar entre exportaciones)
let lastExportDir = null;

// Configuración para permitir recursos externos (CDN)
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');

// ============================================================================
// SERVIDOR PYTHON — arranque y apagado
// ============================================================================

// Directorio base de la aplicación
const APP_DIR     = __dirname;
const PYTHON_BIN  = path.join(APP_DIR, '.venv', 'bin', 'python');
const SERVER_HOST = '127.0.0.1';
const SERVER_PORT = 8765;
const HEALTH_URL  = `http://${SERVER_HOST}:${SERVER_PORT}/api/health`;

/**
 * Lanza uvicorn como proceso hijo.
 * Si el .venv no existe (distribución sin Python bundleado),
 * el frontend continúa solo con el motor JS.
 */
function startPythonServer() {
  if (!fs.existsSync(PYTHON_BIN)) {
    console.log('[MAO Python] .venv no encontrado — modo solo-JS activo');
    return;
  }

  console.log(`[MAO Python] Iniciando uvicorn en ${SERVER_HOST}:${SERVER_PORT}...`);

  pyServer = spawn(
    PYTHON_BIN,
    [
      '-m', 'uvicorn', 'python.server:app',
      '--host', SERVER_HOST,
      '--port', String(SERVER_PORT),
      '--log-level', 'warning',
    ],
    {
      cwd: APP_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Evitar que el proceso hijo herede la terminal de Electron
      detached: false,
    }
  );

  pyServer.stdout.on('data', (d) => console.log('[uvicorn]', d.toString().trim()));
  pyServer.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    // uvicorn escribe INFO en stderr — filtrar spam
    if (!msg.includes('INFO:') || msg.includes('ERROR:')) {
      console.warn('[uvicorn]', msg);
    }
  });

  pyServer.on('error', (err) => console.error('[MAO Python] No se pudo iniciar uvicorn:', err.message));
  pyServer.on('exit',  (code, sig) => {
    console.log(`[MAO Python] Proceso terminó (código ${code}, señal ${sig})`);
    pyServer = null;
    pyServerReady = false;
  });
}

/**
 * Detiene el servidor Python de forma ordenada.
 * Espera hasta maxWait ms antes de SIGKILL.
 */
function stopPythonServer(maxWait = 3000) {
  return new Promise((resolve) => {
    if (!pyServer) return resolve();
    const timer = setTimeout(() => { pyServer && pyServer.kill('SIGKILL'); resolve(); }, maxWait);
    pyServer.once('exit', () => { clearTimeout(timer); resolve(); });
    pyServer.kill('SIGTERM');
  });
}

/**
 * Sondea /api/health cada 300 ms hasta maxRetries veces.
 * Resuelve con true si el servidor respondió, false si agotó reintentos.
 */
function waitForServer(maxRetries = 20, intervalMs = 300) {
  return new Promise((resolve) => {
    let tries = 0;

    const check = () => {
      const req = http.get(HEALTH_URL, (res) => {
        if (res.statusCode === 200) {
          pyServerReady = true;
          console.log('[MAO Python] Servidor listo ✓');
          resolve(true);
        } else {
          retry();
        }
        res.resume(); // consumir respuesta para liberar socket
      });
      req.on('error', retry);
      req.setTimeout(200, () => { req.destroy(); retry(); });
    };

    const retry = () => {
      tries++;
      if (tries >= maxRetries) {
        console.warn('[MAO Python] Servidor no respondió — modo solo-JS');
        resolve(false);
      } else {
        setTimeout(check, intervalMs);
      }
    };

    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // false mientras CORS con file:// → http://127.0.0.1:8765 se valida
      sandbox: false       // false hasta confirmar compatibilidad completa en sandbox
    },
    title: 'MAO Plus - Morfometría Arqueológica de Objetos',
    titleBarStyle: 'hiddenInset', // Estilo macOS moderno
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#f5f5f5'
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Manejar apertura de ventana del Comparador (window.open desde el renderer)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('cmo=1')) {
      if (comparadorWindow && !comparadorWindow.isDestroyed()) {
        // Ya existe: dar foco en lugar de duplicar
        setTimeout(() => comparadorWindow.focus(), 100);
        return { action: 'deny' };
      }
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1300,
          height: 880,
          minWidth: 960,
          minHeight: 640,
          title: 'MAO Plus — Comparador Multi-Objeto',
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 15, y: 15 },
          backgroundColor: '#f7fafc',
          webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false,
            sandbox: false
          }
        }
      };
    }
    return { action: 'deny' };
  });

  // Guardar referencia a la ventana del Comparador cuando se crea
  mainWindow.webContents.on('did-create-window', (win) => {
    if (win.webContents.getURL().includes('cmo=1') ||
        win.getTitle().includes('Comparador')) {
      comparadorWindow = win;
      win.on('closed', () => { comparadorWindow = null; });
    }
  });

  // Crear menú de aplicación
  createApplicationMenu();

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// ============================================================================
// MENÚ NATIVO DE APLICACIÓN
// ============================================================================
function createApplicationMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // Menú de aplicación (solo macOS)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { 
          label: 'Acerca de MAO Plus',
          click: () => mainWindow.webContents.send('menu-action', 'about')
        },
        { type: 'separator' },
        { 
          label: 'Preferencias...',
          accelerator: 'Cmd+,',
          click: () => mainWindow.webContents.send('menu-action', 'preferences')
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),

    // Menú Archivo
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Nuevo Proyecto',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('menu-action', 'new-project')
        },
        {
          label: 'Abrir Proyecto',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow.webContents.send('menu-action', 'open-project')
        },
        {
          label: 'Editar Proyecto',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow.webContents.send('menu-action', 'edit-project')
        },
        { type: 'separator' },
        {
          label: 'Ver Colección',
          accelerator: 'CmdOrCtrl+L',
          click: () => mainWindow.webContents.send('menu-action', 'view-collection')
        },
        { type: 'separator' },
        ...(!isMac ? [
          { type: 'separator' },
          { role: 'quit' }
        ] : [])
      ]
    },

    // Menú Editar
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Deshacer' },
        { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar Todo' }
      ]
    },

    // Menú Vista
    {
      label: 'Vista',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'toggleDevTools', label: 'Herramientas de Desarrollo' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla Completa' }
      ]
    },

    // Menú Ventana
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize', label: 'Minimizar' },
        { role: 'zoom', label: 'Ampliar' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front', label: 'Traer Todo al Frente' }
        ] : [
          { role: 'close', label: 'Cerrar' }
        ])
      ]
    },

    // Menú Ayuda
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Tutorial',
          accelerator: 'F1',
          click: () => mainWindow.webContents.send('menu-action', 'help-tutorial')
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Handler para seleccionar carpeta
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Seleccionar carpeta del proyecto',
    buttonLabel: 'Seleccionar',
    message: 'Elige la carpeta donde se guardarán los archivos del proyecto'
  });
  
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  
  return result.filePaths[0];
});

// ============================================================================
// Handler para mostrar diálogo de guardado y devolver la ruta elegida
// ============================================================================
ipcMain.handle('show-save-dialog', async (event, { filename, format = 'csv' }) => {
  try {
    const ext = format === 'pdf' ? '.pdf' : format === 'svg' ? '.svg' : format === 'html' ? '.html' : '.csv';
    const filters = format === 'pdf'
      ? [{ name: 'PDF Files', extensions: ['pdf'] }]
      : format === 'svg'
        ? [{ name: 'SVG Vectorial', extensions: ['svg'] }]
        : format === 'html'
          ? [{ name: 'HTML Files', extensions: ['html'] }]
          : [{ name: 'CSV Files', extensions: ['csv'] }];

    let nombreFinal = filename;
    if (!nombreFinal.endsWith(ext)) nombreFinal = filename + ext;

    const baseDir = lastExportDir || path.join(require('os').homedir(), 'Downloads');

    const result = await dialog.showSaveDialog(mainWindow, {
      title: `Guardar ${format.toUpperCase()}`,
      defaultPath: path.join(baseDir, nombreFinal),
      filters,
      buttonLabel: 'Guardar',
      message: `Elige dónde guardar el archivo ${format.toUpperCase()}`
    });

    if (!result.canceled && result.filePath) {
      lastExportDir = path.dirname(result.filePath);
    }

    return { canceled: result.canceled, filePath: result.filePath || null };
  } catch (error) {
    console.error('Error en show-save-dialog:', error);
    return { canceled: true, error: error.message };
  }
});

// ============================================================================
// Handler legado para guardar archivos (PDF, CSV, etc) — usado como fallback
// ============================================================================
ipcMain.handle('save-file', async (event, { filename, content, format = 'csv' }) => {
  try {
    const fsl = require('fs').promises;
    
    let extension = '.csv';
    let filters = [{ name: 'CSV Files', extensions: ['csv'] }];
    
    if (format === 'pdf') {
      extension = '.pdf';
      filters = [{ name: 'PDF Files', extensions: ['pdf'] }];
    } else if (format === 'html') {
      extension = '.html';
      filters = [{ name: 'HTML Files', extensions: ['html'] }];
    }
    
    let nombreFinal = filename;
    if (!nombreFinal.endsWith(extension)) nombreFinal = filename + extension;
    
    const baseDir = lastExportDir || path.join(require('os').homedir(), 'Downloads');
    
    const result = await dialog.showSaveDialog(mainWindow, {
      title: `Guardar ${format.toUpperCase()}`,
      defaultPath: path.join(baseDir, nombreFinal),
      filters,
      buttonLabel: 'Guardar',
      message: `Elige dónde guardar el archivo ${format.toUpperCase()}`
    });
    
    if (result.canceled) {
      return { success: false, message: 'Guardado cancelado por el usuario' };
    }
    
    const filepath = result.filePath;
    lastExportDir = path.dirname(filepath);
    
    if (typeof content === 'string' && content.startsWith('__b64_pdf__')) {
      await fsl.writeFile(filepath, Buffer.from(content.slice(11), 'base64'));
    } else if (Buffer.isBuffer(content)) {
      await fsl.writeFile(filepath, content);
    } else if (content instanceof ArrayBuffer || content instanceof Uint8Array) {
      await fsl.writeFile(filepath, Buffer.from(content));
    } else if (content && content.type === 'Buffer' && Array.isArray(content.data)) {
      await fsl.writeFile(filepath, Buffer.from(content.data));
    } else if (typeof content === 'string') {
      await fsl.writeFile(filepath, content, 'utf-8');
    } else {
      return { success: false, message: 'Formato de contenido no válido' };
    }
    
    return {
      success: true,
      filepath,
      message: `Archivo guardado correctamente: ${path.basename(filepath)}`
    };
  } catch (error) {
    console.error('Error guardando archivo:', error);
    return { success: false, message: `Error al guardar archivo: ${error.message}` };
  }
});

// ============================================================================
// Handler para abrir la ventana del Comparador Multi-Objeto
// ============================================================================
ipcMain.handle('open-comparador-window', async () => {
  if (comparadorWindow && !comparadorWindow.isDestroyed()) {
    comparadorWindow.focus();
    return { success: true, alreadyOpen: true };
  }
  return { success: true, alreadyOpen: false };
});

// ============================================================================
// FS OPS via IPC — capa segura que reemplaza Node.js directo en el renderer
// ============================================================================

ipcMain.handle('fs-save-file', async (_, { filePath, content }) => {
  try {
    if (typeof content === 'string' && content.startsWith('data:')) {
      const m = content.match(/^data:[^;]+;base64,(.+)$/);
      if (m) {
        await fsP.writeFile(filePath, Buffer.from(m[1], 'base64'));
        return { success: true, path: filePath };
      }
    }
    await fsP.writeFile(filePath, content, 'utf8');
    return { success: true, path: filePath };
  } catch (error) {
    console.error('fs-save-file:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs-read-file', async (_, { filePath, encoding = 'utf8' }) => {
  try {
    if (/\.(png|jpe?g)$/i.test(filePath)) {
      const buf  = await fsP.readFile(filePath);
      const ext  = path.extname(filePath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
      return { success: true, content: `data:${mime};base64,${buf.toString('base64')}` };
    }
    const content = await fsP.readFile(filePath, encoding);
    return { success: true, content };
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('fs-read-file:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs-folder-exists', async (_, { folderPath }) => {
  try {
    const stats = await fsP.stat(folderPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
});

ipcMain.handle('fs-ensure-folder', async (_, { folderPath }) => {
  try {
    await fsP.mkdir(folderPath, { recursive: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs-list-directory', async (_, { dirPath }) => {
  try {
    const entries = await fsP.readdir(dirPath, { withFileTypes: true });
    return {
      success: true,
      items: entries.map(e => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        isFile: e.isFile(),
        path: path.join(dirPath, e.name)
      }))
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs-file-exists', async (_, { filePath }) => {
  try {
    const stats = await fsP.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
});

ipcMain.handle('fs-get-stats', async (_, { itemPath }) => {
  try {
    const stats = await fsP.stat(itemPath);
    return {
      success: true,
      stats: {
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs-scan-for-analysis', async (_, { rootPath, maxDepth = 5 }) => {
  const foundAnalyses = [];

  async function scanDirectory(dirPath, currentDepth = 0) {
    if (currentDepth > maxDepth) return;
    try {
      const entries = await fsP.readdir(dirPath, { withFileTypes: true });
      const hasMetadata  = entries.some(e => e.isFile() && e.name === 'metadata.json');
      const hasMetricas  = entries.some(e => e.isFile() && e.name === 'metricas.json');
      const hasGeometria = entries.some(e => e.isFile() && e.name === 'geometria.json');
      const hasImages    = entries.some(e => e.isDirectory() && e.name === 'imagenes');

      if (hasMetadata && hasMetricas && hasGeometria && hasImages) {
        try {
          const metadata = JSON.parse(await fsP.readFile(path.join(dirPath, 'metadata.json'), 'utf8'));
          foundAnalyses.push({
            path: dirPath, folderName: path.basename(dirPath),
            metadata, found: new Date().toISOString(), valid: true
          });
        } catch {
          foundAnalyses.push({
            path: dirPath, folderName: path.basename(dirPath),
            valid: false, error: 'Error leyendo metadata.json'
          });
        }
      }

      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await scanDirectory(path.join(dirPath, entry.name), currentDepth + 1);
        }
      }
    } catch (error) {
      console.error(`fs-scan-for-analysis [${dirPath}]:`, error.message);
    }
  }

  try {
    await scanDirectory(rootPath);
    return { success: true, analyses: foundAnalyses, totalFound: foundAnalyses.length };
  } catch (error) {
    return { success: false, error: error.message, analyses: [] };
  }
});

ipcMain.handle('fs-validate-analysis', async (_, { analysisPath }) => {
  const requiredFiles  = ['metadata.json', 'metricas.json', 'geometria.json'];
  const requiredImages = [
    'imagenes/original.png', 'imagenes/objeto_recortado.png', 'imagenes/contorno_real.png',
    'imagenes/convex_hull.png', 'imagenes/ejes_principales.png', 'imagenes/radios.png',
    'imagenes/analisis_completo.png', 'imagenes/thumbnail.png'
  ];
  const validation = {
    valid: true, missingFiles: [], missingImages: [], corruptedFiles: [], details: {}
  };

  for (const file of requiredFiles) {
    const filePath = path.join(analysisPath, file);
    try {
      JSON.parse(await fsP.readFile(filePath, 'utf8'));
      validation.details[file] = 'OK';
    } catch (error) {
      validation.valid = false;
      if (error.code === 'ENOENT') {
        validation.missingFiles.push(file);
        validation.details[file] = 'MISSING';
      } else {
        validation.corruptedFiles.push(file);
        validation.details[file] = 'CORRUPTED';
      }
    }
  }

  for (const img of requiredImages) {
    const imgPath = path.join(analysisPath, img);
    try {
      await fsP.access(imgPath);
      validation.details[img] = 'OK';
    } catch {
      validation.missingImages.push(img);
      validation.details[img] = 'MISSING';
    }
  }

  return { success: true, validation };
});

app.whenReady().then(async () => {
  // 1. Arrancar servidor Python (no bloquea si falla)
  startPythonServer();

  // 2. Esperar a que responda (máx ~6 s) antes de mostrar la ventana
  if (pyServer) {
    await waitForServer(20, 300);
  }

  // 3. Crear la ventana principal
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Apagar Python antes de que Electron cierre el proceso
app.on('before-quit', async (event) => {
  if (pyServer) {
    event.preventDefault();
    await stopPythonServer();
    app.exit(0);
  }
});

// ============================================================================
// IPC: estado del servidor Python
// ============================================================================
ipcMain.handle('python-server-status', () => ({
  running: pyServer !== null,
  ready:   pyServerReady,
  url:     `http://${SERVER_HOST}:${SERVER_PORT}`,
}));

// ============================================================================
// IPC: mover carpeta / archivo a la Papelera del sistema
// ============================================================================
ipcMain.handle('fs-trash-item', async (_, { itemPath }) => {
  try {
    await shell.trashItem(itemPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
