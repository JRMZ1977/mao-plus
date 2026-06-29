const { app, BrowserWindow, ipcMain, dialog, Menu, shell, protocol } = require('electron');
const path   = require('path');
const os     = require('os');
const { spawn } = require('child_process');
const http   = require('http');
const fs     = require('fs');
const fsP    = fs.promises;     // versión async — usada por los handlers IPC de fs

let mainWindow;
let comparadorWindow = null;
let pyServer = null;          // proceso hijo uvicorn
let pyServerReady = false;    // true cuando /api/health responde OK
let pyHasBeenReady = false;   // true tras el PRIMER health OK (gracia anti kill-loop en cold-start)
let pyServerManaged = false;  // true si Electron lanzó este proceso y debe apagarlo
let pyRestartCount  = 0;      // número de reinicios automáticos en esta sesión
let pyLastError     = null;   // último mensaje de error del backend
let pyIsQuitting    = false;  // true cuando el usuario está cerrando la app
let pyWatchdogTimer = null;   // interval del watchdog activo
let pyHealthFailCount = 0;    // fallos consecutivos del watchdog

const PY_MAX_RESTARTS       = 3;
const PY_RESTART_DELAYS_MS  = [2000, 5000, 10000];
const PY_WATCHDOG_INTERVAL  = 15_000;
const PY_WATCHDOG_FAIL_LIMIT = 2;

// Última carpeta de exportación usada (para recordar entre exportaciones)
let lastExportDir = null;

// Modo desarrollo: true cuando la app NO está empaquetada (electron-builder).
// Usar este flag para habilitar herramientas de depuración y bypass de seguridad
// que NO deben estar activos en producción.
const isDev = !app.isPackaged;

// ── Boot Metrics Instrumentation ──────────────────────────────────────────
// Recolectar timestamps para evaluar performance post-factorización
const bootMetrics = {
  t_app_start: Date.now(),
  t_electron_ready: null,
  t_python_spawn: null,
  t_python_health_ok: null,
  t_window_created: null,
  t_renderer_ready: null,
  t_total_boot: null
};

// ── Seguridad: webSecurity ────────────────────────────────────────────────
// La app carga desde el esquema custom `app://` (registrado abajo con
// protocol.registerSchemesAsPrivileged + protocol.handle). El backend en
// http://127.0.0.1:8765 tiene CORSMiddleware con allow_origins=["*"], por lo
// que webSecurity:true es seguro. No se necesita el bypass OutOfBlinkCors.

// ── Esquema custom `app://` ────────────────────────────────────────────────
// Servir la app desde un esquema standard propio (app://mao/...) en lugar de
// file://. Motivo: cargar ~30 <script> desde file:// en paralelo dispara de
// forma intermitente `net::ERR_FAILED` en arranque en frío (bug de concurrencia
// del esquema file:// en Chromium), lo que a veces impedía que cargara
// js/mao-tab-router.js → la barra de pestañas LAAR no aparecía. Un esquema
// `standard` pasa por el manejador de protocolo de Electron y no sufre ese bug.
// registerSchemesAsPrivileged DEBE llamarse antes de 'ready'.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

// Tipos MIME para el manejador de protocolo app://
const APP_MIME = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.mjs':  'text/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.map':  'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf',
  '.wasm': 'application/wasm',
  '.txt':  'text/plain'
};

// ============================================================================
// SERVIDOR PYTHON — arranque y apagado
// ============================================================================

// Directorio base de la aplicación
const APP_DIR     = __dirname;
// Resolución del runtime Python (Fase A — distribución):
//   dev  → el .venv del repo (su intérprete es un symlink al Python del sistema)
//   prod → CPython relocatable embebido en Contents/Resources/python-runtime
const PYTHON_BIN  = app.isPackaged
  ? path.join(process.resourcesPath, 'python-runtime', 'bin', 'python3')
  : path.join(APP_DIR, '.venv', 'bin', 'python');
// Directorio de trabajo del backend: la raíz que contiene el paquete `python/`.
//   dev  → APP_DIR (repo)
//   prod → Contents/Resources (python/ viaja como extraResources, fuera del asar,
//          porque un subproceso no puede importar desde dentro de app.asar)
const PY_CWD      = app.isPackaged ? process.resourcesPath : APP_DIR;
const SERVER_HOST = '127.0.0.1';
const SERVER_PORT = 8765;
const HEALTH_URL  = `http://${SERVER_HOST}:${SERVER_PORT}/api/health`;

/**
 * Emite el estado actual del backend a todas las ventanas suscritas.
 * Estados: 'starting' | 'ready' | 'down' | 'restarting'
 */
function emitBackendStatus(state, extra = {}) {
  const payload = {
    state,
    ready:    pyServerReady,
    managed:  pyServerManaged,
    pid:      pyServer ? pyServer.pid : null,
    restarts: pyRestartCount,
    lastError: pyLastError,
    url:      `http://${SERVER_HOST}:${SERVER_PORT}`,
    ...extra,
  };
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win && !win.isDestroyed() && win.webContents) {
        win.webContents.send('mao:backend-status', payload);
      }
    }
  } catch { /* renderer no listo aún */ }
}

function checkServerHealthOnce(timeoutMs = 400) {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, (res) => {
      const ok = res.statusCode === 200;
      if (ok) { pyServerReady = true; pyHasBeenReady = true; }
      res.resume();
      resolve(ok);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Lanza uvicorn como proceso hijo.
 * Si el .venv no existe (distribución sin Python bundleado),
 * el frontend continúa solo con el motor JS.
 */
async function checkServerBelongsToMAOPlus() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          // MAO PLUS usa versión 2.0.x y tiene módulo 'obj3d'
          const mods = json.modules || [];
          resolve(mods.includes('obj3d') || (json.version || '').startsWith('2.0'));
        } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(600, () => { req.destroy(); resolve(false); });
  });
}

async function startPythonServer() {
  if (await checkServerHealthOnce()) {
    if (await checkServerBelongsToMAOPlus()) {
      console.log('[MAO Python] Backend MAO PLUS ya activo en 127.0.0.1:8765 — reutilizando');
      pyServer = null;
      pyServerManaged = false;
      pyServerReady = true;
      pyHasBeenReady = true;
      return;
    }
    console.log('[MAO Python] Puerto 8765 ocupado por otro proceso (no MAO PLUS) — matando y relanzando');
    require('child_process').execSync('pkill -f "uvicorn.*8765" 2>/dev/null || true');
    await new Promise(r => setTimeout(r, 1500));
  }

  if (!fs.existsSync(PYTHON_BIN)) {
    console.log('[MAO Python] .venv no encontrado en:', PYTHON_BIN);
    console.log('[MAO Python] Intentando con "python" del PATH...');
    
    // Fallback: usar python del PATH si .venv no existe
    pyServer = spawn(
      'python',
      [
        '-m', 'uvicorn', 'python.server:app',
        '--host', SERVER_HOST,
        '--port', String(SERVER_PORT),
        '--log-level', 'warning',
      ],
      {
        cwd: PY_CWD,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      }
    );

    if (!pyServer) {
      console.log('[MAO Python] Python del PATH tampoco disponible — modo solo-JS');
      return;
    }
    
    pyServerManaged = true;
  } else {
    // Warmup: pre-cargar cv2 antes de lanzar uvicorn para evitar que iCloud
    // interrumpa la carga de cv2.abi3.so durante el arranque del servidor.
    await new Promise(resolve => {
      const warm = spawn(PYTHON_BIN, ['-c', 'import cv2, numpy'], { cwd: PY_CWD, stdio: 'ignore' });
      warm.on('close', resolve);
      warm.on('error', resolve); // si falla, continuar igualmente
    });

    console.log(`[MAO Python] Iniciando uvicorn en ${SERVER_HOST}:${SERVER_PORT} con ${PYTHON_BIN}...`);

    pyServer = spawn(
      PYTHON_BIN,
      [
        '-m', 'uvicorn', 'python.server:app',
        '--host', SERVER_HOST,
        '--port', String(SERVER_PORT),
        '--log-level', 'warning',
      ],
      {
        cwd: PY_CWD,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      }
    );
    pyServerManaged = true;
  }

  if (!pyServer) return;

  pyServer.stdout.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) console.log('[uvicorn stdout]', msg);
  });
  
  pyServer.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) {
      if (msg.includes('ERROR:') || msg.includes('CRITICAL:')) {
        console.error('[uvicorn ERROR]', msg);
      } else if (!msg.includes('INFO:')) {
        console.warn('[uvicorn]', msg);
      }
    }
  });

  pyServer.on('error', (err) => {
    console.error('[MAO Python] Error al iniciar uvicorn:', err.message, err.code);
    pyLastError = `${err.code || 'ERR'}: ${err.message}`;
    pyServer = null;
    pyServerManaged = false;
    emitBackendStatus('down', { reason: 'spawn_error' });
  });
  
  pyServer.on('exit', async (code, sig) => {
    console.log(`[MAO Python] Proceso uvicorn terminó (código ${code}, señal ${sig})`);
    const wasManaged = pyServerManaged;
    pyServer = null;
    pyServerManaged = false;
    pyServerReady = false;

    const backendStillAlive = await checkServerHealthOnce();
    pyServerReady = backendStillAlive;
    if (backendStillAlive) {
      console.log('[MAO Python] Backend externo sigue disponible tras la salida del proceso hijo');
      emitBackendStatus('ready', { reason: 'external_backend' });
      return;
    }

    emitBackendStatus('down', { exitCode: code, signal: sig });

    // Auto-restart si la app NO se está cerrando y el exit no fue limpio
    if (!pyIsQuitting && wasManaged && code !== 0) {
      if (pyRestartCount < PY_MAX_RESTARTS) {
        const delay = PY_RESTART_DELAYS_MS[pyRestartCount] || 10_000;
        pyRestartCount++;
        pyLastError = `Exit code ${code} (signal ${sig})`;
        console.warn(`[MAO Python] ⚠️ Auto-restart ${pyRestartCount}/${PY_MAX_RESTARTS} en ${delay} ms...`);
        emitBackendStatus('restarting', { delayMs: delay, attempt: pyRestartCount });
        setTimeout(() => {
          if (!pyIsQuitting) {
            startPythonServer().then(() => waitForServer(20, 300)).then((ok) => {
              if (ok) emitBackendStatus('ready', { reason: 'restart_ok' });
            }).catch((e) => {
              pyLastError = String(e && e.message || e);
              emitBackendStatus('down', { reason: 'restart_failed' });
            });
          }
        }, delay);
      } else {
        console.error(`[MAO Python] ❌ Límite de auto-restarts alcanzado (${PY_MAX_RESTARTS}). Backend en modo solo-JS.`);
        emitBackendStatus('down', { reason: 'restart_limit_reached' });
      }
    }
  });
}

/**
 * Detiene el servidor Python de forma ordenada.
 * Espera hasta maxWait ms antes de SIGKILL.
 */
function stopPythonServer(maxWait = 3000) {
  pyIsQuitting = true;
  if (pyWatchdogTimer) { clearInterval(pyWatchdogTimer); pyWatchdogTimer = null; }
  return new Promise((resolve) => {
    if (!pyServer || !pyServerManaged) return resolve();
    const timer = setTimeout(() => { pyServer && pyServer.kill('SIGKILL'); resolve(); }, maxWait);
    pyServer.once('exit', () => { clearTimeout(timer); resolve(); });
    pyServer.kill('SIGTERM');
  });
}

/**
 * Watchdog activo: cada PY_WATCHDOG_INTERVAL verifica el health del backend
 * gestionado. Si falla PY_WATCHDOG_FAIL_LIMIT veces consecutivas, mata y
 * relanza el proceso. Si el backend no es gestionado (externo) no actúa.
 */
function startWatchdog() {
  if (pyWatchdogTimer) return;
  pyWatchdogTimer = setInterval(async () => {
    if (pyIsQuitting) return;
    if (!pyServerManaged && !pyServer) return; // no gestionamos este backend
    const alive = await checkServerHealthOnce(800);
    if (alive) {
      pyHasBeenReady = true;
      if (pyHealthFailCount > 0) {
        pyHealthFailCount = 0;
        emitBackendStatus('ready', { reason: 'watchdog_recovered' });
      }
      return;
    }
    // Gracia de arranque en frío: si el backend NUNCA ha respondido aún, está
    // importando (cv2/trimesh/onnxruntime desde iCloud tarda ~55s). NO lo matamos:
    // hacerlo crearía un kill-loop que impide que termine de importar.
    if (!pyHasBeenReady) {
      console.log('[MAO Watchdog] backend aún importando (sin primer health OK) — esperando, no se reinicia');
      return;
    }
    pyHealthFailCount++;
    console.warn(`[MAO Watchdog] health KO (${pyHealthFailCount}/${PY_WATCHDOG_FAIL_LIMIT})`);
    if (pyHealthFailCount >= PY_WATCHDOG_FAIL_LIMIT) {
      pyHealthFailCount = 0;
      if (pyServer && pyServerManaged) {
        console.warn('[MAO Watchdog] ⚠️ Backend no responde — forzando restart');
        pyLastError = 'watchdog: health-check timeout';
        emitBackendStatus('restarting', { reason: 'watchdog' });
        try { pyServer.kill('SIGTERM'); } catch {}
        // El handler 'exit' encadenará el auto-restart.
      }
    }
  }, PY_WATCHDOG_INTERVAL);
}

/**
 * Sondea /api/health cada N ms hasta maxRetries veces.
 * Resuelve con true si el servidor respondió, false si agotó reintentos.
 * MEJORADO: Manejo robusto de errors y timeouts.
 */
function waitForServer(maxRetries = 30, intervalMs = 300) {
  return new Promise((resolve) => {
    let tries = 0;
    const MAX_WAIT_TOTAL_MS = maxRetries * intervalMs; // mostrar al usuario
    
    console.log(`[MAO Python] Esperando servidor... (máx ${MAX_WAIT_TOTAL_MS}ms, ${maxRetries} reintentos)`);

    const check = () => {
      const req = http.get(HEALTH_URL, (res) => {
        if (res.statusCode === 200) {
          pyServerReady = true;
          pyHasBeenReady = true;
          bootMetrics.t_python_health_ok = Date.now();
          console.log('[MAO Python] Servidor listo ✓ (respondió en', tries * intervalMs, 'ms)');
          resolve(true);
        } else {
          console.log(`[MAO Python] Intento ${tries + 1}: HTTP ${res.statusCode} — reintentando...`);
          retry();
        }
        res.resume();
      });
      
      req.on('error', (err) => {
        if (tries < 3) {
          // Los primeros intentos son silenciosos (el servidor está arrancando)
          console.log(`[MAO Python] Intento ${tries + 1}: sin respuesta — reintentando...`);
        } else if (tries % 5 === 0) {
          // Cada 5 intentos mostrar detalles
          console.log(`[MAO Python] Intento ${tries + 1}: ${err.code} — reintentando...`);
        }
        retry();
      });
      
      req.setTimeout(200, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      tries++;
      if (tries >= maxRetries) {
        console.warn(`[MAO Python] Servidor no respondió después de ${MAX_WAIT_TOTAL_MS}ms — modo solo-JS`);
        resolve(false);
      } else {
        setTimeout(check, intervalMs);
      }
    };

    check();
  });
}

function attachRendererMonitor(win, label = 'main') {
  if (!win || !win.webContents) return;
  win.webContents.on('console-message', (_event, level, message) => {
    if (typeof message !== 'string' || !message.startsWith('[MONITOR_ANALISIS]')) return;
    const prefix = `[Renderer:${label}]`;
    if (level >= 2) {
      console.warn(prefix, message);
    } else {
      console.log(prefix, message);
    }
  });
}

function createWindow() {
  bootMetrics.t_window_created = Date.now();
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    // LAAR: barra nativa oculta pero conservando los controles de ventana
    // (semáforos macOS). Antes era `frame: false` + `titleBarStyle: 'hidden'`,
    // lo que eliminaba minimizar/maximizar/cerrar sin reemplazo en el header.
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 12 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: false       // false hasta confirmar compatibilidad completa en sandbox
    },
    title: 'MAO Plus - Morfometría Arqueológica de Objetos',
    backgroundColor: '#f5f5f5'
  });

  mainWindow.loadURL('app://mao/index.html');
  attachRendererMonitor(mainWindow, 'main');

  /* Deshabilitar zoom nativo — LAAR usa alturas fijas en px para tabbar */
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setZoomLevel(0);
    mainWindow.webContents.setVisualZoomLevelLimits(1, 1);

    // Sonda dev-only reutilizable (ADR-010): ejecuta JS en el renderer y vuelca el
    // resultado JSON a stdout. Inerte salvo que se defina MAO_PROBE_FILE o MAO_PROBE_JS.
    //   MAO_PROBE_FILE=/tmp/probe.js MAO_PROBE_QUIT=1 MAO_PROBE_DELAY=9000 npm start
    if (isDev && (process.env.MAO_PROBE_FILE || process.env.MAO_PROBE_JS)) {
      const code = process.env.MAO_PROBE_FILE
        ? fs.readFileSync(process.env.MAO_PROBE_FILE, 'utf8')
        : process.env.MAO_PROBE_JS;
      const delayMs = Number(process.env.MAO_PROBE_DELAY || 9000);
      setTimeout(() => {
        mainWindow.webContents.executeJavaScript(code, true)
          .then((r) => console.log('[MAO_PROBE]', JSON.stringify(r)))
          .catch((e) => console.log('[MAO_PROBE_ERR]', e && e.message))
          .finally(() => { if (process.env.MAO_PROBE_QUIT === '1') setTimeout(() => app.quit(), 800); });
      }, delayMs);
    }
  });

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
            webSecurity: true,
            sandbox: false
          }
        }
      };
    }
    return { action: 'deny' };
  });

  // Guardar referencia a la ventana del Comparador cuando se crea
  mainWindow.webContents.on('did-create-window', (win) => {
    attachRendererMonitor(win, 'child');
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
ipcMain.handle('select-folder', async (_, options = {}) => {
  const preferredPath = (options && typeof options.defaultPath === 'string' && options.defaultPath.trim())
    ? options.defaultPath
    : null;
  const baseDir = preferredPath || lastExportDir || path.join(require('os').homedir(), 'Downloads');

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Seleccionar carpeta del proyecto',
    buttonLabel: 'Seleccionar',
    message: 'Elige la carpeta donde se guardarán los archivos del proyecto',
    defaultPath: baseDir,
  });
  
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }

  lastExportDir = result.filePaths[0];
  
  return result.filePaths[0];
});

// ============================================================================
// Handler para mostrar diálogo de guardado y devolver la ruta elegida
// ============================================================================
ipcMain.handle('show-save-dialog', async (event, { filename, format = 'csv' }) => {
  try {
    const ext = format === 'pdf'  ? '.pdf'
               : format === 'svg' ? '.svg'
               : format === 'png' ? '.png'
               : format === 'html' ? '.html'
               : format === 'zip' ? '.zip'
               : '.csv';

    const filters = format === 'pdf'  ? [{ name: 'PDF Files',     extensions: ['pdf'] }]
                  : format === 'svg'  ? [{ name: 'SVG Vectorial', extensions: ['svg'] }]
                  : format === 'png'  ? [{ name: 'PNG Images',     extensions: ['png'] }]
                  : format === 'html' ? [{ name: 'HTML Files',     extensions: ['html'] }]
                  : format === 'zip'  ? [{ name: 'ZIP Archive',    extensions: ['zip'] }]
                  :                    [{ name: 'CSV Files',       extensions: ['csv'] }];

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
    } else if (format === 'png') {
      extension = '.png';
      filters = [{ name: 'PNG Images', extensions: ['png'] }];
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
    
    // Data URL base64 (ej: "data:image/png;base64,..." o "data:application/pdf;base64,...")
    if (typeof content === 'string' && /^data:[^;]+;base64,/.test(content)) {
      const b64 = content.split(',')[1];
      await fsl.writeFile(filepath, Buffer.from(b64, 'base64'));
    } else if (typeof content === 'string' && content.startsWith('__b64_pdf__')) {
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

/**
 * Valida que la ruta resuelta esté dentro del directorio de usuario (os.homedir()).
 * Lanza Error si la ruta está fuera, es vacía, o no es string.
 */
function _assertSafePath(p) {
  if (!p || typeof p !== 'string') throw new Error('Ruta inválida');
  const resolved = path.resolve(p);
  const home     = os.homedir();
  if (resolved !== home && !resolved.startsWith(home + path.sep)) {
    throw new Error(`Ruta no permitida fuera del directorio de usuario: ${resolved}`);
  }
}

ipcMain.handle('fs-save-file', async (_, { filePath, content }) => {
  try {
    _assertSafePath(filePath);
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

ipcMain.handle('fs-copy-file', async (_, { src, dst }) => {
  try {
    _assertSafePath(src);
    _assertSafePath(dst);
    await fsP.copyFile(src, dst);
    return { success: true, dst };
  } catch (error) {
    console.error('fs-copy-file:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs-read-file', async (_, { filePath, encoding = 'utf8' }) => {
  try {
    _assertSafePath(filePath);
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
    _assertSafePath(folderPath);
    const stats = await fsP.stat(folderPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
});

ipcMain.handle('fs-ensure-folder', async (_, { folderPath }) => {
  try {
    _assertSafePath(folderPath);
    await fsP.mkdir(folderPath, { recursive: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs-list-directory', async (_, { dirPath }) => {
  try {
    _assertSafePath(dirPath);
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

// Devuelve una imagen de ruta absoluta como data URL base64 (para miniaturas fuera de APP_DIR).
ipcMain.handle('fs-thumbnail-data-url', async (_, { filePath }) => {
  try {
    const data = await fsP.readFile(filePath);
    const ext  = path.extname(filePath).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
               : ext === '.png' ? 'image/png'
               : ext === '.webp' ? 'image/webp' : 'image/png';
    return `data:${mime};base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
});

ipcMain.handle('fs-file-exists', async (_, { filePath }) => {
  try {
    _assertSafePath(filePath);
    const stats = await fsP.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
});

ipcMain.handle('fs-get-stats', async (_, { itemPath }) => {
  try {
    _assertSafePath(itemPath);
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
    _assertSafePath(rootPath);
    await scanDirectory(rootPath);
    return { success: true, analyses: foundAnalyses, totalFound: foundAnalyses.length };
  } catch (error) {
    return { success: false, error: error.message, analyses: [] };
  }
});

ipcMain.handle('fs-validate-analysis', async (_, { analysisPath }) => {
  _assertSafePath(analysisPath);
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
  bootMetrics.t_electron_ready = Date.now();

  // 0. Registrar el manejador del esquema app:// (sirve archivos locales bajo
  //    APP_DIR de forma fiable, sin el bug de concurrencia de file://).
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      let rel = decodeURIComponent(url.pathname);
      if (!rel || rel === '/') rel = '/index.html';
      const filePath = path.normalize(path.join(APP_DIR, rel));
      // Anti path-traversal: el archivo debe quedar dentro de APP_DIR
      if (filePath !== APP_DIR && !filePath.startsWith(APP_DIR + path.sep)) {
        return new Response('Forbidden', { status: 403 });
      }
      const data = await fsP.readFile(filePath);
      const ext  = path.extname(filePath).toLowerCase();
      const type = APP_MIME[ext] || 'application/octet-stream';
      // no-cache: el documento de entrada index.html se carga sin `?v=` busteable;
      // sin esto Chromium cachea app://mao/index.html y los cambios de markup no se
      // ven al relanzar (raíz del "gotcha de caché" del proyecto). Sirviendo desde
      // disco local, revalidar no tiene costo perceptible.
      return new Response(data, { status: 200, headers: { 'Content-Type': type, 'Cache-Control': 'no-cache' } });
    } catch (e) {
      return new Response('Not Found: ' + (e && e.message), { status: 404 });
    }
  });

  // 1. Arrancar servidor Python
  console.log('[MAO Boot] ▶ Iniciando booteo de aplicación...');
  emitBackendStatus('starting');
  bootMetrics.t_python_spawn = Date.now();
  await startPythonServer();

  // 2. Crear la ventana de INMEDIATO — no bloquear el arranque esperando al backend.
  //    En arranque en frío el import (cv2/trimesh/onnxruntime desde iCloud) tarda ~55s;
  //    bloquear aquí dejaría la app sin ventana ~1 min. La UI arranca en estado
  //    'starting' (emitido arriba) y transiciona a 'ready' cuando el backend conecta
  //    (backend-status-badge y PythonBridge escuchan mao:backend-status).
  createWindow();

  // 3. Watchdog activo, con gracia de cold-start (no reinicia un backend que aún no
  //    respondió por primera vez — ver startWatchdog/pyHasBeenReady).
  startWatchdog();

  // 4. Esperar el health en SEGUNDO PLANO con margen para el cold-start (~120 s) y
  //    emitir el estado final cuando resuelva (sin bloquear la ventana).
  console.log('[MAO Boot] ⏳ Esperando servidor Python en segundo plano...');
  waitForServer(240, 500).then((serverReady) => {
    if (serverReady) {
      console.log('[MAO Boot] ✓ Backend Python operativo');
      emitBackendStatus('ready', { reason: 'boot_ok' });
    } else {
      console.warn('[MAO Boot] ⚠️ Backend no respondió en 120 s — modo solo-JS (el watchdog seguirá vigilando)');
      emitBackendStatus('down', { reason: 'boot_timeout' });
    }
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Apagar Python antes de que Electron cierre el proceso
app.on('before-quit', async (event) => {
  pyIsQuitting = true;
  if (pyServer && pyServerManaged) {
    event.preventDefault();
    await stopPythonServer();
    app.exit(0);
  }
});

// ============================================================================
// IPC: estado del servidor Python
// ============================================================================
ipcMain.handle('python-server-status', () => ({
  running:  pyServerReady || pyServer !== null,
  ready:    pyServerReady,
  managed:  pyServerManaged,
  pid:      pyServer ? pyServer.pid : null,
  restarts: pyRestartCount,
  lastError: pyLastError,
  url:      `http://${SERVER_HOST}:${SERVER_PORT}`,
}));

// Snapshot de estado para el badge UI (canal sincrónico ligero vía invoke).
ipcMain.handle('mao:backend-status:get', () => ({
  state:    pyServerReady ? 'ready' : (pyServer ? 'starting' : 'down'),
  ready:    pyServerReady,
  managed:  pyServerManaged,
  pid:      pyServer ? pyServer.pid : null,
  restarts: pyRestartCount,
  lastError: pyLastError,
  url:      `http://${SERVER_HOST}:${SERVER_PORT}`,
}));

// Gate dev-only para el hook de verificación E2E (ADR-010). El renderer no
// conoce isDev; lo consulta por aquí para instalar window.__maoE2E solo en dev.
ipcMain.handle('mao:is-dev', () => isDev);

// Boot metrics para Fase 4 de evaluación
ipcMain.handle('get-boot-metrics', () => bootMetrics);
ipcMain.on('report-boot-metrics', (event, metrics) => {
  console.log('[METRICS]', JSON.stringify(metrics));
});

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

// ── Captura de errores del renderer (para mao-console-analyzer) ──────────────
const rendererErrorLog = path.join(APP_DIR, ".mao_renderer_errors.log");
const rendererErrors = [];

ipcMain.on("renderer-error-occurred", (event, errorData) => {
  rendererErrors.push(errorData);
  if (rendererErrors.length > 500) rendererErrors.shift();
  
  const logLine = `[${errorData.timestamp}] ${errorData.type}: ${errorData.name} — ${errorData.message}\n`;
  try {
    fs.appendFileSync(rendererErrorLog, logLine);
  } catch (e) {
    console.error("Error writing renderer error log:", e.message);
  }
  
  if (errorData.type === "error" || errorData.type === "unhandledRejection") {
    console.error("[Renderer Error Captured]", errorData.name, "—", errorData.message);
  }
});

ipcMain.handle("get-renderer-errors", () => rendererErrors);
ipcMain.handle("clear-renderer-errors", () => {
  rendererErrors.length = 0;
  return { cleared: true };
});
