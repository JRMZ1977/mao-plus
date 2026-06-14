/**
 * utility-helpers.js
 * Utility and helper functions extracted from analysis-core.js
 *
 * These functions require the following globals from analysis-core.js:
 * - canvas (HTMLCanvasElement)
 * - image (HTMLImageElement)
 * - zoom (number)
 * - offsetX, offsetY (numbers for pan)
 * - isManualSelectionMode (boolean)
 * - window.manualModeScale (object with scale, offsetX, offsetY)
 * - window.deteccionBifacialActiva (object or null)
 * - objects (array)
 * - lastDetectionStats (object)
 * - DEBUG_LOGS (object with logging flags)
 * - objectCountDisplay (HTMLElement)
 * - contourCache (Map)
 * - PERFORMANCE_CONFIG (object with cache settings)
 * - statusDiv (HTMLElement)
 * - canvas-related global variables (DOM elements)
 * - localStorage (for config persistence)
 * - exifr (external library for metadata)
 * - sensorSizes (object with sensor database)
 * - UI elements: cameraModelInput, focalInput, apertureInput, sensorWidthInput, sensorHeightInput
 */

// Internal state object — synchronizes with analysis-core.js globals
let viewState = {
  // Canvas state
  zoom: 0.5,
  offsetX: 0,
  offsetY: 0,
  image: null,
  canvas: null,
  // DOM elements
  zoomInput: null,
  zoomLevelDisplay: null,
  statusDiv: null,
  objectCountDisplay: null,
  // Global objects/arrays
  objects: [],
  contourCache: new Map(),
  lastDetectionStats: {},
  // Flags
  isManualSelectionMode: false,
  // Config objects
  PERFORMANCE_CONFIG: {},
  DEBUG_LOGS: {},
  // Callbacks
  redraw: null,
  redrawCanvas: null
};

export function initializeViewState(state) {
  viewState = { ...viewState, ...state };
}

export function getViewState() {
  return viewState;
}

// =====================================================================================
// COORDINATE CONVERSION FUNCTIONS
// =====================================================================================

/**
 * Convert canvas coordinates to image coordinates
 * Handles both normal mode (with zoom/pan) and manual selection mode
 */
export function canvasToImageCoords(canvasX, canvasY) {
  if (!viewState.image) {
    console.warn('Warning: canvasToImageCoords: No image loaded');
    return { x: 0, y: 0 };
  }

  if (viewState.isManualSelectionMode && window.manualModeScale) {
    const scale = window.manualModeScale.scale;
    const offsetX = window.manualModeScale.offsetX;
    const offsetY = window.manualModeScale.offsetY;

    const imageX = (canvasX - offsetX) / scale;
    const imageY = (canvasY - offsetY) / scale;

    return {
      x: Math.max(0, Math.min(imageX, viewState.image.naturalWidth - 1)),
      y: Math.max(0, Math.min(imageY, viewState.image.naturalHeight - 1))
    };

  } else if (viewState.isManualSelectionMode && !window.manualModeScale) {
    console.error('Error: Manual mode active but window.manualModeScale NOT configured!');
    return { x: 0, y: 0 };

  } else {
    const imgDisplayWidth = viewState.image.naturalWidth * viewState.zoom;
    const imgDisplayHeight = viewState.image.naturalHeight * viewState.zoom;

    const imgX = (viewState.canvas.width - imgDisplayWidth) / 2 + viewState.offsetX * viewState.zoom;
    const imgY = (viewState.canvas.height - imgDisplayHeight) / 2 + viewState.offsetY * viewState.zoom;

    const imageX = (canvasX - imgX) / viewState.zoom;
    const imageY = (canvasY - imgY) / viewState.zoom;

    return {
      x: Math.max(0, Math.min(imageX, viewState.image.naturalWidth - 1)),
      y: Math.max(0, Math.min(imageY, viewState.image.naturalHeight - 1))
    };
  }
}

/**
 * Convert image coordinates to canvas coordinates
 * Handles both normal mode (with zoom/pan) and manual selection mode
 */
export function imageToCanvasCoords(imageX, imageY) {
  if (!viewState.image) return { x: 0, y: 0 };

  if (viewState.isManualSelectionMode && window.manualModeScale) {
    const scale = window.manualModeScale.scale;
    const offsetX = window.manualModeScale.offsetX;
    const offsetY = window.manualModeScale.offsetY;

    return {
      x: offsetX + imageX * scale,
      y: offsetY + imageY * scale
    };

  } else {
    const imgDisplayWidth = viewState.image.naturalWidth * viewState.zoom;
    const imgDisplayHeight = viewState.image.naturalHeight * viewState.zoom;

    const imgCanvasX = (viewState.canvas.width - imgDisplayWidth) / 2 + viewState.offsetX * viewState.zoom;
    const imgCanvasY = (viewState.canvas.height - imgDisplayHeight) / 2 + viewState.offsetY * viewState.zoom;

    return {
      x: imgCanvasX + imageX * viewState.zoom,
      y: imgCanvasY + imageY * viewState.zoom
    };
  }
}

// =====================================================================================
// PERFORATION CANVAS COORDINATE CONVERSION FUNCTIONS
// =====================================================================================

/**
 * Convertir coordenadas del canvas ampliado a coordenadas de imagen
 * SIMPLIFICADO para escala 1:1 - solo suma el offset
 */
export function perforationCanvasToImageCoords(canvasX, canvasY) {
  // Con zoom=1, la conversión es simple: sumar el offset
  const imgX = canvasX + perforationCanvasOffsetX;
  const imgY = canvasY + perforationCanvasOffsetY;

  console.log(`🔄 Canvas (${canvasX.toFixed(1)}, ${canvasY.toFixed(1)}) → Imagen (${imgX.toFixed(1)}, ${imgY.toFixed(1)})`);

  return { x: imgX, y: imgY };
}

/**
 * Convertir coordenadas de imagen a coordenadas del canvas ampliado
 * SIMPLIFICADO para escala 1:1 - solo resta el offset
 */
export function imageToPerforationCanvasCoords(imgX, imgY) {
  // Con zoom=1, la conversión es simple: restar el offset
  const canvasX = imgX - perforationCanvasOffsetX;
  const canvasY = imgY - perforationCanvasOffsetY;

  return { x: canvasX, y: canvasY };
}

/**
 * Aplicar zoom visual al canvas de perforaciones
 * Usa CSS transform para escalar visualmente sin cambiar el canvas interno
 */
export function aplicarZoomPerforationCanvas(zoomLevel) {
  if (!perforationCanvas) return;

  // Guardar nivel de zoom actual (en window: este módulo strict no puede asignar
  // a la global suelta del IIFE; analysis-core la espeja a window al abrir el modal).
  window.perforationZoomLevel = zoomLevel;

  // Aplicar transform CSS para zoom visual
  perforationCanvas.style.transform = `scale(${zoomLevel})`;

  // Ajustar el contenedor para el scroll
  const container = document.getElementById('perforationCanvasScrollContainer');
  if (container) {
    // Calcular nuevas dimensiones aparentes
    const apparentWidth = perforationCanvas.width * zoomLevel;
    const apparentHeight = perforationCanvas.height * zoomLevel;

    // Agregar padding para centrar mejor
    container.style.padding = `${apparentHeight * 0.1}px ${apparentWidth * 0.1}px`;
  }

  console.log(`🔍 Zoom aplicado: ${zoomLevel}x`);

  // Actualizar display de dimensiones
  const dimensionsSpan = document.getElementById('perforationCanvasDimensions');
  if (dimensionsSpan) {
    dimensionsSpan.textContent = `${perforationCanvas.width}×${perforationCanvas.height}px (zoom ${zoomLevel}x)`;
  }
}

// =====================================================================================
// DISPLAY UPDATE FUNCTIONS
// =====================================================================================

/**
 * Update display information about detected objects
 */
export function updateDisplays() {
  let displayText = `Objects detected: ${viewState.objects.length}`;

  if (viewState.objects.length > 0 && viewState.lastDetectionStats.filtered > 0) {
    displayText += ` (${viewState.lastDetectionStats.filtered} filtered < ${viewState.lastDetectionStats.minArea}px)`;
  }

  const objetosConContorno = viewState.objects.filter(obj => obj.contornoReal);
  if (objetosConContorno.length > 0) {
    displayText += `| ${objetosConContorno.length} with real contours`;
  }

  if (viewState.objectCountDisplay) {
    viewState.objectCountDisplay.textContent = displayText;
    viewState.objectCountDisplay.style.color = viewState.objects.length > 0 ? '#555' : '#666';
  }

  if (typeof actualizarEstadisticas === 'function') {
    actualizarEstadisticas();
  }
}

// =====================================================================================
// STATUS AND MESSAGE FUNCTIONS
// =====================================================================================

/**
 * Set status message in status display
 */
export function setStatus(msg, isError=false) {
  if (!viewState.statusDiv) return;
  viewState.statusDiv.textContent = msg;
  viewState.statusDiv.style.color = isError ? '#777' : '#555';
}

// =====================================================================================
// CONTOUR CACHE FUNCTIONS
// =====================================================================================

/**
 * Generate a unique cache key for a contour based on object properties
 */
export function generateCacheKey(obj) {
  const checksum = `${obj.minX}_${obj.minY}_${obj.width}_${obj.height}_${obj.area}`;
  return checksum;
}

/**
 * Retrieve a cached contour for an object
 */
export function getCachedContour(obj) {
  if (!viewState.PERFORMANCE_CONFIG?.CACHE_ENABLED) return null;

  const key = generateCacheKey(obj);
  if (viewState.contourCache.has(key)) {
    console.log(`Contour retrieved from cache for object ${obj.id}`);
    return viewState.contourCache.get(key);
  }
  return null;
}

/**
 * Store a contour in cache with LRU eviction if needed
 */
export function setCachedContour(obj, contourData) {
  if (!viewState.PERFORMANCE_CONFIG?.CACHE_ENABLED) return;

  if (viewState.contourCache.size >= (viewState.PERFORMANCE_CONFIG?.MAX_CACHE_SIZE || 100)) {
    const firstKey = viewState.contourCache.keys().next().value;
    viewState.contourCache.delete(firstKey);
    console.log('Contour cache cleared (LRU)');
  }

  const key = generateCacheKey(obj);
  viewState.contourCache.set(key, contourData);
  console.log(`Contour stored in cache for object ${obj.id}`);
}

/**
 * Clear the entire contour cache
 */
export function clearContourCache() {
  viewState.contourCache.clear();
  console.log('Contour cache completely cleared');
}

// =====================================================================================
// NUMBER FORMATTING UTILITIES
// =====================================================================================

/**
 * Safe conversion to fixed decimal places
 */
export function safeToFixed(value, decimals = 4, defaultValue = 'N/A') {
  if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
    return value.toFixed(decimals);
  }
  return defaultValue;
}

// METADATA LOADING AND PROCESSING: las funciones cargarMetadatos / procesarMetadatos
// NO se exportan desde este módulo porque referencian variables del IIFE de
// analysis-core.js (cameraModelInput, sensorSizes, setStatus…). Las versiones
// correctas viven dentro del IIFE (analysis-core.js:~13355 y ~13451).
// Ver CLAUDE.md sección "Gotcha Permanente".

// =====================================================================================
// IMAGE FILE VALIDATION
// =====================================================================================

/**
 * Read the first N bytes of a file
 */
export function readFileHeader(file, bytesToRead) {
  return new Promise((resolve, reject) => {
    const slice = file.slice(0, bytesToRead);
    const reader = new FileReader();

    reader.onload = () => {
      const buffer = reader.result;
      resolve(new Uint8Array(buffer));
    };

    reader.onerror = reject;
    reader.readAsArrayBuffer(slice);
  });
}


/**
 * Validate image file header (JPEG, PNG, RAW formats)
 */
export function validateImageHeader(bytes, mimeType, fileName = '') {
  const view = new DataView(bytes.buffer);
  const extension = fileName ? fileName.split('.').pop().toLowerCase() : '';

  switch (mimeType) {
    case 'image/jpeg':
    case 'image/jpg':
      return bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;

    case 'image/png':
      return bytes[0] === 0x89 && bytes[1] === 0x50 &&
             bytes[2] === 0x4E && bytes[3] === 0x47;

    case 'image/x-canon-cr2':
      return validateRAWHeader(bytes, mimeType, extension);

    case 'application/octet-stream':
      if (extension === 'cr2') {
        return validateRAWHeader(bytes, 'image/x-canon-cr2', extension);
      }
      return validateRAWHeader(bytes, 'generic-raw', extension);

    default:
      return validateRAWHeader(bytes, mimeType, extension);
  }
}

/**
 * Validate RAW format file headers
 */
function validateRAWHeader(bytes, mimeType, extension = '') {
  if (bytes.length < 16) return true;

  const view = new DataView(bytes.buffer);

  if (mimeType === 'image/x-nikon-nef' || checkBytePattern(bytes, 'nef')) {
    return (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A) ||
           (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00);
  }

  if (mimeType === 'image/x-canon-cr2' || extension === 'cr2' || checkBytePattern(bytes, 'cr2')) {
    const isTIFF = (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A) ||
                   (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00);

    if (isTIFF) return true;

    for (let i = 0; i < bytes.length - 1; i++) {
      if (bytes[i] === 0x43 && bytes[i + 1] === 0x52) {
        return true;
      }
    }

    if (extension === 'cr2' || mimeType === 'image/x-canon-cr2') {
      return true;
    }

    return false;
  }

  if (checkBytePattern(bytes, 'cr3')) {
    return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70 &&
           bytes[8] === 0x63 && bytes[9] === 0x72 && bytes[10] === 0x78;
  }

  if (mimeType === 'image/x-sony-arw' || checkBytePattern(bytes, 'arw')) {
    return (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A) ||
           (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00);
  }

  if (mimeType === 'image/x-adobe-dng' || checkBytePattern(bytes, 'dng')) {
    return (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A) ||
           (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00);
  }

  if (checkBytePattern(bytes, 'orf')) {
    return (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A) ||
           (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00);
  }

  if (checkBytePattern(bytes, 'raf')) {
    const fujiSignature = [0x46, 0x55, 0x4A, 0x49, 0x46, 0x49, 0x4C, 0x4D];
    return fujiSignature.every((byte, index) => bytes[index] === byte);
  }

  const rawExtensions = ['nef', 'cr2', 'cr3', 'arw', 'orf', 'raf', 'dng', 'rw2', 'pef', 'srw', '3fr', 'fff', 'erf', 'mef', 'mos', 'crw', 'x3f', 'rwl', 'iiq'];
  return rawExtensions.includes(extension);
}

/**
 * Helper function to check byte patterns
 */
function checkBytePattern(bytes, format) {
  const patterns = {
    'nef': { bytes: [0x49, 0x49, 0x2A] },
    'cr2': { bytes: [0x49, 0x49, 0x2A] },
    'cr3': { bytes: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70] },
    'arw': { bytes: [0x49, 0x49, 0x2A] },
    'orf': { bytes: [0x49, 0x49, 0x2A] },
    'raf': { bytes: [0x46, 0x55, 0x4A, 0x49, 0x46, 0x49, 0x4C, 0x4D] },
    'dng': { bytes: [0x49, 0x49, 0x2A] }
  };

  const pattern = patterns[format];
  if (!pattern) return false;

  return pattern.bytes.every((byte, index) => bytes[index] === byte);
}

/**
 * Detect RAW file format from file extension
 */
function detectarFormatoRAW(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  const rawFormats = ['nef', 'cr2', 'cr3', 'arw', 'orf', 'raf', 'dng', 'rw2', 'pef', 'srw', '3fr', 'fff', 'erf', 'mef', 'mos', 'crw', 'x3f', 'rwl', 'iiq'];
  return rawFormats.includes(extension) ? extension : 'jpg';
}

// =====================================================================================
// ZOOM AND VIEW FUNCTIONS
// =====================================================================================

/**
 * Reset view to initial zoom and pan state
 */
export function resetView() {
  viewState.zoom = 0.5;
  viewState.offsetX = 0;
  viewState.offsetY = 0;
  updateZoomDisplay();
  return { zoom: viewState.zoom, offsetX: viewState.offsetX, offsetY: viewState.offsetY };
}

/**
 * Set zoom from percentage value
 */
export function setZoomFromPercent(percent) {
  const newZoom = Math.max(0.1, Math.min(5.0, percent / 100));
  viewState.zoom = newZoom;
  updateZoomDisplay();
  if (viewState.redraw) requestAnimationFrame(() => viewState.redraw());
}

/**
 * Update zoom display UI
 */
function updateZoomDisplay() {
  if (!viewState.zoomLevelDisplay || !viewState.zoomInput) return;
  const zoomPercent = (viewState.zoom*100).toFixed(0);
  viewState.zoomLevelDisplay.textContent = `${zoomPercent}%`;
  viewState.zoomInput.value = zoomPercent;
}

/**
 * Redraw canvas (alias for redraw function)
 */
export function redrawCanvas() {
  if (viewState.redraw) viewState.redraw();
}

// =====================================================================================
// CONFIGURATION PERSISTENCE
// =====================================================================================

/**
 * Save camera and scale configuration to localStorage
 */
export function guardarConfiguracion(cameraModelInput, focalInput, apertureInput, sensorWidthInput, sensorHeightInput, distanciaInput) {
  localStorage.setItem('cameraModel', cameraModelInput.value);
  localStorage.setItem('focalLength', focalInput.value);
  localStorage.setItem('aperture', apertureInput.value);
  localStorage.setItem('sensorWidth', sensorWidthInput.value);
  localStorage.setItem('sensorHeight', sensorHeightInput.value);
  localStorage.setItem('distancia', distanciaInput.value);
}

/**
 * Load camera and scale configuration from localStorage
 */
export function cargarConfiguracion(cameraModelInput, focalInput, apertureInput, sensorWidthInput, sensorHeightInput, distanciaInput, image, setStatus) {
  const savedModel = localStorage.getItem('cameraModel');
  const savedFocal = localStorage.getItem('focalLength');
  const savedAperture = localStorage.getItem('aperture');
  const savedSensorWidth = localStorage.getItem('sensorWidth');
  const savedSensorHeight = localStorage.getItem('sensorHeight');
  const savedDistancia = localStorage.getItem('distancia');

  if(savedModel) cameraModelInput.value = savedModel;
  if(savedFocal) focalInput.value = savedFocal;
  if(savedAperture) apertureInput.value = savedAperture;
  if(savedSensorWidth) sensorWidthInput.value = savedSensorWidth;
  if(savedSensorHeight) sensorHeightInput.value = savedSensorHeight;
  if(savedDistancia) distanciaInput.value = savedDistancia;

  if(savedSensorWidth && savedFocal && savedDistancia && image) {
    setStatus('Previous data restored. Use "Calculate Scale" to proceed.', false);
  }
}
