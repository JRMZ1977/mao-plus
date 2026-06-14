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

// =====================================================================================
// METADATA LOADING AND PROCESSING
// =====================================================================================

/**
 * Load metadata from image file using exifr
 * Supports both JPG and RAW formats
 */
export function cargarMetadatos(file) {
  const formatoRAW = detectarFormatoRAW(file);
  const esRAW = ['nef', 'cr2', 'cr3', 'arw', 'orf', 'raf', 'dng', 'rw2', 'pef', 'srw', '3fr', 'fff', 'erf', 'mef', 'mos', 'crw', 'x3f', 'rwl', 'iiq'].includes(formatoRAW);

  const configuracion = {
    tiff: true,
    ifd0: true,
    ifd1: true,
    exif: true,
    gps: true,
    interop: true,
    thumbnail: false,
    translateKeys: true,
    translateValues: true,
    reviveValues: true,
    sanitize: false,
    mergeOutput: true,
    pick: undefined
  };

  if(esRAW) {
    configuracion.chunked = false;
    configuracion.firstChunkSize = 131072;
    configuracion.chunkSize = 65536;
    configuracion.iptc = true;
    configuracion.icc = true;
    configuracion.jfif = false;
    configuracion.ihdr = false;
    configuracion.makerNote = true;
  }

  return exifr.parse(file, configuracion).then(data => {
    if(!data) {
      const tipoArchivo = esRAW ? formatoRAW.toUpperCase() : 'JPG';
      console.error('EXIFR could not extract metadata from:', file.name);
      throw new Error(`File ${tipoArchivo} without valid EXIF metadata`);
    }

    const tieneDatosMinimos = data.Model || data.Make || data.FocalLength || data.ImageWidth;

    if(!tieneDatosMinimos) {
      console.warn('File with empty or corrupt metadata');
      throw new Error(`Metadata ${esRAW ? formatoRAW.toUpperCase() : 'JPG'} empty or unreadable`);
    }

    return data;
  }).catch(error => {
    console.error(`Error processing ${esRAW ? formatoRAW.toUpperCase() : 'JPG'}:`, error);
    throw error;
  });
}

/**
 * Process extracted metadata and populate UI fields
 * Returns true if metadata is complete, false otherwise
 */
export function procesarMetadatos(exifData, esArchivoRAW = false) {
  if(!exifData) {
    const tipoArchivo = esArchivoRAW ? 'RAW' : 'JPG';
    setStatus(`Error: Could not process metadata from ${tipoArchivo} file`, true);
    return false;
  }

  let metadatosCompletos = true;
  let mensajesAdvertencia = [];
  let camposEncontrados = 0;

  let modeloDetectado = null;
  const campoModelo = exifData.Model || exifData.CameraModelName || exifData.UniqueCameraModel;
  const campoFabricante = exifData.Make || exifData.Manufacturer;

  if(campoModelo) {
    modeloDetectado = campoModelo.toUpperCase().trim();

    if(campoFabricante && !modeloDetectado.includes(campoFabricante.toUpperCase())) {
      modeloDetectado = `${campoFabricante.toUpperCase()} ${modeloDetectado}`;
    }

    cameraModelInput.value = modeloDetectado;
    camposEncontrados++;

    const sensorData = sensorSizes[modeloDetectado];
    if(sensorData) {
      sensorWidthInput.value = sensorData.width;
      sensorHeightInput.value = sensorData.height;
      setStatus(`Sensor recognized: ${sensorData.width}x${sensorData.height}mm`, false);
    } else {
      const fabricante = campoFabricante ? campoFabricante.toUpperCase().trim() : '';
      if(fabricante.includes('NIKON')) {
        sensorWidthInput.value = 23.5;
        sensorHeightInput.value = 15.6;
      } else if(fabricante.includes('CANON')) {
        sensorWidthInput.value = 22.3;
        sensorHeightInput.value = 14.9;
      } else if(fabricante.includes('SONY')) {
        sensorWidthInput.value = 23.5;
        sensorHeightInput.value = 15.6;
      } else {
        sensorWidthInput.value = 23.5;
        sensorHeightInput.value = 15.6;
      }

      mensajesAdvertencia.push(`Using default sensor for ${fabricante || 'unknown camera'}: ${sensorWidthInput.value}x${sensorHeightInput.value}mm`);
      sensorWidthInput.readOnly = false;
      sensorHeightInput.readOnly = false;
    }
  } else {
    const tipoArchivo = esArchivoRAW ? 'RAW' : 'JPG';
    mensajesAdvertencia.push(`Camera model not detected in ${tipoArchivo} metadata`);
  }

  const focalLength = exifData.FocalLength || exifData.FocalLengthIn35mmFormat || exifData.FocalLengthIn35mmFilm;
  if(focalLength && focalLength >= 4 && focalLength <= 1200) {
    focalInput.value = focalLength;
    camposEncontrados++;
  } else {
    if(focalLength) {
      mensajesAdvertencia.push(`Suspicious focal length: ${focalLength}mm - verify manually`);
      focalInput.value = focalLength;
      camposEncontrados++;
    } else {
      const tipoArchivo = esArchivoRAW ? 'RAW' : 'JPG';
      mensajesAdvertencia.push(`Focal length not found in ${tipoArchivo} metadata`);
    }
  }

  const apertura = exifData.FNumber || exifData.ApertureValue || exifData.MaxApertureValue;
  const aperturaMaxima = exifData.MaxApertureValue;

  if(apertura && apertura >= 1.0 && apertura <= 32) {
    apertureInput.value = apertura;
    camposEncontrados++;

    const apertureMaxInfo = document.getElementById('apertureMaxInfo');
    if(apertureMaxInfo) {
      if(aperturaMaxima && aperturaMaxima !== apertura && aperturaMaxima < apertura) {
        apertureMaxInfo.textContent = `(max. f/${aperturaMaxima})`;
        apertureMaxInfo.title = `Lens max aperture is f/${aperturaMaxima}, but captured at f/${apertura}`;
      } else {
        apertureMaxInfo.textContent = '';
      }
    }
  } else {
    if(apertura) {
      mensajesAdvertencia.push(`Suspicious aperture: f/${apertura} - verify manually`);
      apertureInput.value = apertura;
      camposEncontrados++;
    } else {
      const tipoArchivo = esArchivoRAW ? 'RAW' : 'JPG';
      mensajesAdvertencia.push(`Aperture not found in ${tipoArchivo} metadata`);
    }
  }

  metadatosCompletos = camposEncontrados >= 2;

  if(mensajesAdvertencia.length > 0) {
    const mensaje = mensajesAdvertencia.join('; ');
    const esErrorCritico = camposEncontrados === 0;

    if(esErrorCritico) {
      setStatus(`Error: ${mensaje}. Complete data manually.`, true);
      cameraModelInput.readOnly = false;
      focalInput.readOnly = false;
      apertureInput.readOnly = false;
      sensorWidthInput.readOnly = false;
      sensorHeightInput.readOnly = false;
    } else {
      setStatus(`Warnings: ${mensaje}`, false);
    }
  }

  setTimeout(() => {
    if(metadatosCompletos || camposEncontrados > 0) {
      const tipoArchivo = esArchivoRAW ? 'RAW' : 'JPG';
      const estadoCampos = camposEncontrados === 3 ? 'complete' : `partial (${camposEncontrados}/3)`;
      setStatus(`${tipoArchivo} metadata ${estadoCampos}. Enter distance and use "Calculate Scale".`, false);
    } else {
      setStatus(`Complete camera data manually to calculate scale.`, false);
    }
  }, 100);

  return metadatosCompletos;
}

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
