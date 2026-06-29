/**
 * MAO Plus — Python Bridge
 * ========================
 * Capa de comunicación entre el frontend JS y el servidor FastAPI Python.
 *
 * Diseño:
 *   - TRANSPARENTE: si el servidor no está disponible, la app sigue
 *     funcionando con el motor JS completo (sin errores, sin avisos molestos).
 *   - PROGRESIVO: cada endpoint está controlado por un flag de capacidad
 *     que el servidor devuelve en /api/capabilities.
 *   - NO REEMPLAZA nada aún: todos los métodos retornan null en Fase 2,
 *     indicando al código llamador que use la ruta JS.
 *
 * Uso desde analysis-core.js (ejemplo futuro, Fase 3):
 *   const result = await PythonBridge.contour.extract(imageData, bbox);
 *   if (result) {
 *     // usar resultado Python
 *   } else {
 *     // fallback: usar extraerContornoReal() JS
 *   }
 */

const PythonBridge = (() => {

  // ── Configuración ──────────────────────────────────────────────────────────
  const BASE_URL        = 'http://127.0.0.1:8765/api';
  const TIMEOUT_MS      = 5000;    // timeout de conexión al servidor
  const TIMEOUT_MS_LONG = 45_000;  // timeout para operaciones lentas (SAM, descarga)
  const HEALTH_TTL      = 30_000;  // re-verificar estado cada 30 s

  // ── Estado interno ─────────────────────────────────────────────────────────
  let _serverAvailable = false;
  let _capabilities    = {};

  // ── Utilidades de red ──────────────────────────────────────────────────────

  /**
   * fetch con timeout configurable.
   * Retorna null si la llamada falla por red/timeout.
   * Lanza Error (con .status y .detail) si el servidor responde con HTTP ≥ 400,
   * permitiendo al llamador mostrar el mensaje real del backend.
   */
  async function _fetch(path, options = {}) {
    const timeoutMs = options._timeout ?? TIMEOUT_MS;
    delete options._timeout;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(`${BASE_URL}${path}`, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) {
        let detail = '';
        try { const b = await resp.json(); detail = b.detail || b.message || ''; } catch {}
        const err = new Error(`HTTP ${resp.status}${detail ? ': ' + detail : ''}`);
        err.status = resp.status;
        err.detail = detail;
        throw err;
      }
      return await resp.json();
    } catch (err) {
      clearTimeout(timer);
      // Re-lanzar errores HTTP que vienen del bloque anterior
      if (err.status !== undefined) throw err;
      // Error de red/timeout: si el servidor estaba disponible Y no estamos ya
      // dentro de un health check (evita cascadas), disparar uno inmediato para
      // detectar caída y conmutar a modo reintento rápido sin esperar _slowTimer.
      if (_serverAvailable && !_inHealthCheck) {
        console.warn('[PythonBridge] Error de conexión:', err.message);
        Promise.resolve().then(() => _healthCheck().catch(() => {}));
      }
      return null;
    }
  }

  /**
   * Construye FormData desde un objeto plano.
   * Soporta valores string, number, boolean y Blob/File.
   */
  function _formData(fields = {}) {
    const fd = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value === null || value === undefined) continue;
      if (value instanceof Blob || value instanceof File) {
        fd.append(key, value);
      } else {
        fd.append(key, String(value));
      }
    }
    return fd;
  }

  /**
   * Convierte dataURL o ImageData a Blob para enviar al servidor.
   */
  function _dataURLtoBlob(dataURL) {
    const [header, b64] = dataURL.split(',');
    const mime = header.match(/:(.*?);/)[1];
    const binary = atob(b64);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  // ── Health check adaptativo ────────────────────────────────────────────────

  // Cuando el servidor no está disponible, reintenta cada RETRY_MS.
  // Cuando está conectado, verifica cada HEALTH_TTL ms.
  // Esto garantiza que la app detecta el servidor aunque tarde 3-5s en arrancar.
  const RETRY_MS          = 3_000;
  const HEALTH_FAIL_LIMIT = 2;    // fallos consecutivos necesarios para declarar desconexión
  let _retryTimer    = null;      // timer del modo reintento rápido
  let _slowTimer     = null;      // timer del modo verificación lenta
  let _checking      = false;     // evita llamadas solapadas
  let _failCount     = 0;         // fallos consecutivos del health check
  let _inHealthCheck = false;     // evita que _fetch dispare más health checks desde dentro

  async function _healthCheck() {
    if (_checking) return;
    _checking      = true;
    _inHealthCheck = true;   // bloquea que _fetch dispare health checks anidados
    try {
      let data = null;
      try { data = await _fetch('/health', { method: 'GET' }); } catch { /* red o HTTP error */ }

      if (data && data.status === 'ok') {
        // ── Servidor disponible: reset contador de fallos ──────────────────
        _failCount = 0;
        const wasUnavailable = !_serverAvailable;
        if (!_serverAvailable) {
          console.log(
            `%c[MAO Plus] Servidor Python disponible v${data.version}`,
            'color: #28a745; font-weight: bold;'
          );
          console.log('[PythonBridge] Módulos activos:', data.modules);
        }
        _serverAvailable = true;

        // Cargar capacidades (fallo aquí no es crítico ni dispara más checks)
        try {
          const caps = await _fetch('/capabilities', { method: 'GET' });
          if (caps) {
            _capabilities = caps;
            const active = Object.entries(caps).filter(([, v]) => v).map(([k]) => k);
            if (active.length > 0) {
              console.log('[PythonBridge] Módulos Python activos:', active.join(', ') || '—');
            }
          }
        } catch { /* capabilities no críticas */ }

        // Pasar a modo lento: dejar de reintentar rápido
        _stopRetry();
        if (!_slowTimer) {
          _slowTimer = setInterval(() => _healthCheck().catch(() => {}), HEALTH_TTL);
        }
        if (wasUnavailable) {
          try { _notifyStatus({ state: 'ready', health: data }); } catch {}
        }
      } else {
        // ── Fallo: incrementar contador ────────────────────────────────────
        _failCount++;
        if (_failCount < HEALTH_FAIL_LIMIT) {
          // Fallo transitorio: no declarar desconexión todavía
          console.warn(
            `[PythonBridge] Health check fallido (${_failCount}/${HEALTH_FAIL_LIMIT}) — aguardando siguiente intento`
          );
        } else {
          // Fallos consecutivos suficientes: declarar desconexión
          const wasAvailable = _serverAvailable;
          if (_serverAvailable) {
            console.warn('[PythonBridge] Servidor Python desconectado — usando motor JS completo');
            // Invalidar caché de SAM: el servidor puede reiniciar con otro modo
            _samStatusCache = null; _samStatusTime = 0;
          }
          _serverAvailable = false;
          _capabilities    = {};

          // Pasar a modo reintento rápido
          _stopSlow();
          if (!_retryTimer) {
            _retryTimer = setInterval(() => _healthCheck().catch(() => {}), RETRY_MS);
          }
          if (wasAvailable) {
            try { _notifyStatus({ state: 'down' }); } catch {}
          }
        }
      }
    } finally {
      _inHealthCheck = false;
      _checking      = false;
    }
  }

  function _stopRetry() {
    if (_retryTimer) { clearInterval(_retryTimer); _retryTimer = null; }
  }
  function _stopSlow() {
    if (_slowTimer) { clearInterval(_slowTimer); _slowTimer = null; }
  }

  // Primer intento inmediato al cargar la página
  _healthCheck().catch(() => {});

  // ── API pública ────────────────────────────────────────────────────────────

  /**
   * Estado del servidor (solo lectura desde el exterior).
   */
  function isAvailable() { return _serverAvailable; }
  function getCapabilities() { return { ..._capabilities }; }
  function isModuleActive(name) { return !!_capabilities[name]; }

  // ── Subsistema de suscriptores de estado ──────────────────────────────────
  const _statusSubscribers = new Set();

  /** Notifica a todos los suscriptores con el estado actual. */
  function _notifyStatus(extra = {}) {
    const snap = {
      available: _serverAvailable,
      capabilities: { ..._capabilities },
      failCount: _failCount,
      ...extra,
    };
    for (const cb of _statusSubscribers) {
      try { cb(snap); } catch {}
    }
  }

  /**
   * Suscribirse a cambios de disponibilidad del backend. Devuelve función
   * `unsubscribe()`. El callback recibe `{available, capabilities, failCount,
   *  state?, restarts?, lastError?}`.
   */
  function onStatusChange(cb) {
    if (typeof cb !== 'function') return () => {};
    _statusSubscribers.add(cb);
    // Disparar inmediatamente con el estado actual
    try { cb({ available: _serverAvailable, capabilities: { ..._capabilities }, failCount: _failCount }); } catch {}
    return () => _statusSubscribers.delete(cb);
  }

  /**
   * Espera a que el backend esté listo, hasta `timeoutMs`. Útil antes de
   * ejecutar operaciones críticas que requieren Python.
   * Resuelve `true` si está disponible, `false` si expira.
   */
  async function ensureReady({ timeoutMs = 8000, pollMs = 250 } = {}) {
    if (_serverAvailable) return true;
    // Disparar un health check inmediato fuera del ciclo
    _healthCheck().catch(() => {});
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (_serverAvailable) return true;
      await new Promise((r) => setTimeout(r, pollMs));
    }
    return _serverAvailable;
  }

  // Puente con Electron: si está disponible electronAPI.onBackendStatus,
  // re-emitir los eventos del main a los suscriptores JS.
  try {
    if (typeof window !== 'undefined' && window.electronAPI &&
        typeof window.electronAPI.onBackendStatus === 'function') {
      window.electronAPI.onBackendStatus((payload) => {
        // Si Electron dice 'ready' adelantamos health check para refrescar
        // capabilities sin esperar al próximo tick.
        if (payload && payload.state === 'ready' && !_serverAvailable) {
          _healthCheck().catch(() => {});
        }
        _notifyStatus(payload || {});
      });
    }
  } catch { /* electronAPI no disponible en entorno test */ }

  // ── Subsistemas ────────────────────────────────────────────────────────────

  /**
   * Módulo de detección de objetos.
   * Retorna null si no está implementado → usar detectObjectsAutomatically() JS.
   */
  const detection = {
    async detect(imageDataURL, { threshold = 0.5, minArea = 100, maxObjects = 50, separateTouching = false, roiMode = false } = {}) {
      if (!_serverAvailable || !isModuleActive('detection')) return null;
      const blob = _dataURLtoBlob(imageDataURL);
      return _fetch('/detect', {
        method: 'POST',
        _timeout: separateTouching ? 30_000 : undefined,
        body: _formData({
          image: blob,
          threshold,
          min_area: minArea,
          max_objects: maxObjects,
          separate_touching: separateTouching,
          // roi_mode (ADR-012): ROI recortado a mano → el núcleo desactiva las
          // heurísticas de imagen completa (recorte de borde, dominancia, reorden).
          roi_mode: roiMode,
        }),
      });
    },

    async edges(imageDataURL, { method = 'canny', threshold1 = 50, threshold2 = 150 } = {}) {
      if (!_serverAvailable || !isModuleActive('detection')) return null;
      const blob = _dataURLtoBlob(imageDataURL);
      return _fetch('/edges', {
        method: 'POST',
        body: _formData({ image: blob, method, threshold1, threshold2 }),
      });
    },

    async color(imageDataURL, maskDataURL = null, colorSpace = 'rgb') {
      if (!_serverAvailable || !isModuleActive('detection')) return null;
      const fields = { image: _dataURLtoBlob(imageDataURL), space: colorSpace };
      if (maskDataURL) fields.mask = _dataURLtoBlob(maskDataURL);
      return _fetch('/color', { method: 'POST', body: _formData(fields) });
    },
  };

  /**
   * Módulo de extracción de contorno.
   * Retorna null si no está implementado → usar extraerContornoReal() JS.
   */
  const contour = {
    async extract(imageDataURL, bbox, { subpixel = true, simplify = 2.0 } = {}) {
      if (!_serverAvailable || !isModuleActive('contour')) return null;
      return _fetch('/contour', {
        method: 'POST',
        body: _formData({
          image:    _dataURLtoBlob(imageDataURL),
          bbox_x:   bbox.x,
          bbox_y:   bbox.y,
          bbox_w:   bbox.w,
          bbox_h:   bbox.h,
          subpixel,
          simplify,
        }),
      });
    },
  };

  /**
   * Módulo de métricas morfométricas.
   * Retorna null si no está implementado → usar calcularMetricasDesdeContorno() JS.
   */
  const metrics = {
    async calculate(imageDataURL, contourPoints, scalePxMm = 1.0) {
      if (!_serverAvailable || !isModuleActive('metrics')) return null;
      return _fetch('/metrics', {
        method: 'POST',
        body: _formData({
          image:        _dataURLtoBlob(imageDataURL),
          contour_json: JSON.stringify(contourPoints),
          scale_px_mm:  scalePxMm,
        }),
      });
    },

    async texture(imageDataURL, maskDataURL = null, options = {}) {
      if (!_serverAvailable || !isModuleActive('metrics')) return null;
      const fields = {
        image:     _dataURLtoBlob(imageDataURL),
        distances: (options.distances || [1, 2, 4]).join(','),
        angles:    (options.angles    || [0, 45, 90, 135]).join(','),
      };
      if (maskDataURL) fields.mask = _dataURLtoBlob(maskDataURL);
      return _fetch('/texture', { method: 'POST', body: _formData(fields) });
    },
  };

  /**
   * Módulo EFA (Elliptic Fourier Analysis).
   * Retorna null si no está implementado o el servidor no está disponible.
   */
  const efa = {
    async calculate(contourPoints, { nHarmonics = 20, scalePxMm = 1.0, normalize = true } = {}) {
      if (!_serverAvailable || !isModuleActive('efa')) return null;
      if (!Array.isArray(contourPoints) || contourPoints.length < 8) return null;
      return _fetch('/efa', {
        method: 'POST',
        body: _formData({
          contour_json: JSON.stringify(contourPoints),
          n_harmonics: nHarmonics,
          scale_px_mm: scalePxMm,
          normalize,
        }),
      });
    },

    async compare(coeffsA, coeffsB) {
      if (!_serverAvailable || !isModuleActive('efa')) return null;
      if (!Array.isArray(coeffsA) || !Array.isArray(coeffsB)) return null;
      return _fetch('/efa/compare', {
        method: 'POST',
        body: _formData({
          coeffs_a_json: JSON.stringify(coeffsA),
          coeffs_b_json: JSON.stringify(coeffsB),
        }),
      });
    },
  };

  /**
   * Módulo de morfometría 3D (.obj) orientada por PCA.
   * Retorna null si no está implementado → fallback local/JS.
   */
  const obj3d = {
    async metrics(
      objFile,
      {
        nSamples = 20000,
        nSections = 9,
        normalizeMode = 'none',
        analysisLevel = 'hybrid_v1',
        orientationMode = 'auto',
        userMorphAnchor = null,
        mmPerUnit = 1.0,
        comparatorReady = false,
      } = {}
    ) {
      if (!_serverAvailable || !isModuleActive('obj3d')) return null;
      if (!(objFile instanceof Blob || objFile instanceof File)) return null;
      const fields = {
        obj_file: objFile,
        n_samples: nSamples,
        n_sections: nSections,
        normalize_mode: normalizeMode,
        analysis_level: analysisLevel,
        orientation_mode: orientationMode,
        mm_per_unit: Number.isFinite(Number(mmPerUnit)) && Number(mmPerUnit) > 0 ? Number(mmPerUnit) : 1.0,
        comparator_ready: !!comparatorReady,
      };

      if (userMorphAnchor && Number.isFinite(Number(userMorphAnchor.x)) && Number.isFinite(Number(userMorphAnchor.y)) && Number.isFinite(Number(userMorphAnchor.z))) {
        fields.user_anchor_x = Number(userMorphAnchor.x);
        fields.user_anchor_y = Number(userMorphAnchor.y);
        fields.user_anchor_z = Number(userMorphAnchor.z);
      }

      return _fetch('/obj3d/metrics', {
        method: 'POST',
        _timeout: TIMEOUT_MS_LONG,
        body: _formData(fields),
      });
    },
  };

  /**
   * Módulo de operaciones morfológicas.
   * Retorna null si no está implementado → usar dilatarMascara(), etc. JS.
   */
  const morphology = {
    async apply(maskDataURL, operation, { iterations = 1, kernelSize = 3 } = {}) {
      if (!_serverAvailable || !isModuleActive('morphology')) return null;
      return _fetch('/morphology', {
        method: 'POST',
        body: _formData({
          image:       _dataURLtoBlob(maskDataURL),
          operation,
          iterations,
          kernel_size: kernelSize,
        }),
      });
    },
  };

  /**
   * Módulo de cálculo de escala y error óptico posicional (Sección IX).
   * Retorna null si no está implementado → usar calcularEscala() JS.
   *
   * calculate(params, imageDataURL?)
   *   params: { focalMm, distanciaMm, sensorWMm?, sensorHMm?,
   *             imgWPx?, imgHPx?, objCentroideX?, objCentroideY? }
   *   imageDataURL: opcional — si se pasa, el servidor extrae EXIF automáticamente
   *
   * Retorna: { scale_px_mm, px_per_mm, campo_vision_w_mm, campo_vision_h_mm,
   *            metodo, exif?, sensor_identificado?, error_optico }
   */
  const scale = {
    async calculate(params = {}, imageDataURL = null) {
      if (!_serverAvailable || !isModuleActive('scale')) return null;
      const fields = {};
      
      // Convertir y validar cada parámetro
      const focalMm = params.focalMm != null ? parseFloat(params.focalMm) : null;
      const distanciaMm = params.distanciaMm != null ? parseFloat(params.distanciaMm) : null;
      const sensorWMm = params.sensorWMm != null ? parseFloat(params.sensorWMm) : null;
      const sensorHMm = params.sensorHMm != null ? parseFloat(params.sensorHMm) : null;
      const imgWPx = params.imgWPx != null ? parseInt(params.imgWPx, 10) : null;
      const imgHPx = params.imgHPx != null ? parseInt(params.imgHPx, 10) : null;
      const objCentroideX = params.objCentroideX != null ? parseFloat(params.objCentroideX) : null;
      const objCentroideY = params.objCentroideY != null ? parseFloat(params.objCentroideY) : null;
      
      if (focalMm != null && !isNaN(focalMm))       fields.focal_mm        = focalMm;
      if (distanciaMm != null && !isNaN(distanciaMm)) fields.distancia_mm = distanciaMm;
      if (focalMm != null && !isNaN(focalMm))       fields.focal_mm        = focalMm;
      if (distanciaMm != null && !isNaN(distanciaMm)) fields.distancia_mm = distanciaMm;
      if (sensorWMm != null && !isNaN(sensorWMm))   fields.sensor_w_mm     = sensorWMm;
      if (sensorHMm != null && !isNaN(sensorHMm))   fields.sensor_h_mm     = sensorHMm;
      if (imgWPx != null && !isNaN(imgWPx))         fields.img_w_px        = imgWPx;
      if (imgHPx != null && !isNaN(imgHPx))         fields.img_h_px        = imgHPx;
      if (objCentroideX != null && !isNaN(objCentroideX)) fields.obj_centroide_x = objCentroideX;
      if (objCentroideY != null && !isNaN(objCentroideY)) fields.obj_centroide_y = objCentroideY;
      if (imageDataURL)               fields.image          = _dataURLtoBlob(imageDataURL);

      // Verificar que hay parámetros suficientes antes de enviar.
      // Sin imagen EXIF se necesitan al menos focal_mm + distancia_mm + sensor_w_mm + img_w_px.
      // Si no hay imagen y faltan esos campos, devolver null (fallback a JS) sin hacer la petición.
      const hasImage  = !!imageDataURL;
      const hasBasic  = fields.focal_mm != null && fields.distancia_mm != null
                     && fields.sensor_w_mm != null && fields.img_w_px != null;
      
      console.log('🔍 [PythonBridge.scale] Parámetros procesados:');
      console.log('  hasImage:', hasImage, '(imagen adjunta)');
      console.log('  hasBasic:', hasBasic, '(mín. focal_mm + distancia_mm + sensor_w_mm + img_w_px)');
      console.log('  —— Valores individuales ——');
      console.log('  focal_mm:', fields.focal_mm, '(tipo:', typeof fields.focal_mm + ')');
      console.log('  distancia_mm:', fields.distancia_mm, '(tipo:', typeof fields.distancia_mm + ')');
      console.log('  sensor_w_mm:', fields.sensor_w_mm, '(tipo:', typeof fields.sensor_w_mm + ')');
      console.log('  img_w_px:', fields.img_w_px, '(tipo:', typeof fields.img_w_px + ')');
      console.log('  img_h_px:', fields.img_h_px, '(tipo:', typeof fields.img_h_px + ')');
      console.log('  sensor_h_mm:', fields.sensor_h_mm, '(tipo:', typeof fields.sensor_h_mm + ')');
      console.log('  obj_centroide_x:', fields.obj_centroide_x);
      console.log('  obj_centroide_y:', fields.obj_centroide_y);
      console.log('  image:', fields.image ? '✓ Blob presente' : '✗ Sin imagen');
      
      if (!hasImage && !hasBasic) {
        console.warn('❌ [PythonBridge.scale] Parámetros insuficientes, fallback a JS');
        console.warn('   ↳ Necesita imagen O mínimo: focal_mm, distancia_mm, sensor_w_mm, img_w_px');
        return null;
      }

      return _fetch('/scale', { method: 'POST', body: _formData(fields) });
    },
  };

  /**
   * Módulo comparador (PCA + estadísticos).
   * Retorna null si no está implementado → usar renderPCA(), etc. JS.
   */
  const comparator = {
    async pca(objects, { nComponents = 2, nClusters = 0, keys = null } = {}) {
      if (!_serverAvailable || !isModuleActive('comparator')) return null;
      const body = {
        objects_json: JSON.stringify(objects),
        n_components: nComponents,
        n_clusters:   nClusters,
      };
      if (keys && keys.length) body.keys_json = JSON.stringify(keys);
      return _fetch('/pca', { method: 'POST', body: _formData(body) });
    },

    async statistics(objects, keys) {
      if (!_serverAvailable || !isModuleActive('comparator')) return null;
      return _fetch('/statistics', {
        method: 'POST',
        body: _formData({
          objects_json: JSON.stringify(objects),
          keys_json:    JSON.stringify(keys),
        }),
      });
    },
  };

  /**
   * Módulo P/H — métricas de perforaciones y horadaciones.
   * Retorna null si no disponible → usar calcularMetricasPerforacion() JS.
   */
  const ph = {
    async processMetrics(trazados, scalePxMm = 1.0) {
      if (!_serverAvailable || !isModuleActive('ph')) return null;
      // Restructurar array plano [{tipo,puntos},...] al formato esperado por /api/ph_metrics
      const perforaciones = trazados
        .filter(t => t.tipo === 'perforacion')
        .map((t, i) => ({ id: i + 1, puntos: t.puntos }));
      const horadaciones = trazados
        .filter(t => t.tipo === 'horadacion')
        .map((t, i) => ({ id: i + 1, puntos: t.puntos }));
      return _fetch('/ph_metrics', {
        method: 'POST',
        body: _formData({
          ph_json:     JSON.stringify({ perforaciones, horadaciones }),
          scale_px_mm: scalePxMm,
        }),
      });
    },

    /**
     * Detecta el contorno de una P/H por flood fill desde un punto semilla.
     * @param {string} imageDataURL  - Canvas P/H exportado como dataURL PNG
     * @param {number} seedX         - Coordenada X en el canvas (después de corrección CSS→canvas)
     * @param {number} seedY         - Coordenada Y en el canvas
     * @param {number} [tolerance]   - Tolerancia de color para flood fill (0-255, default 30)
     * @returns {Promise<{status,points,area_px,bbox,centroid}|null>}
     */
    async detectAtPoint(imageDataURL, seedX, seedY, tolerance = 30) {
      if (!_serverAvailable) return null;
      return _fetch('/ph/detect-at-point', {
        method: 'POST',
        body: _formData({
          image:     _dataURLtoBlob(imageDataURL),
          seed_x:    Math.round(seedX),
          seed_y:    Math.round(seedY),
          tolerance,
        }),
      });
    },

    /**
     * Detecta múltiples candidatos P/H en una sola request backend.
     * @param {string} imageDataURL
     * @param {Array<{x:number,y:number}|[number,number]>} seeds
     * @param {{tolerance?:number,minAreaPx?:number,maxAreaRatio?:number,maxCandidates?:number}} [opts]
     */
    async detectAuto(imageDataURL, seeds, opts = {}) {
      if (!_serverAvailable) return null;
      const {
        tolerance = 26,
        minAreaPx = 24,
        maxAreaRatio = 0.35,
        maxCandidates = 24,
      } = opts || {};
      return _fetch('/ph/detect-auto', {
        method: 'POST',
        body: _formData({
          image: _dataURLtoBlob(imageDataURL),
          seeds_json: JSON.stringify(Array.isArray(seeds) ? seeds : []),
          tolerance,
          min_area_px: minAreaPx,
          max_area_ratio: maxAreaRatio,
          max_candidates: maxCandidates,
        }),
      });
    },
  };

  /**
   * Comparación bifacial (cara A vs cara B).
   * Retorna null si no disponible → usar JS local.
   */
  const bifacial = {
    async compare(caraAObjects, caraBObjects) {
      if (!_serverAvailable || !isModuleActive('comparator')) return null;
      return _fetch('/bifacial', {
        method: 'POST',
        body: _formData({
          cara_a_json: JSON.stringify(caraAObjects),
          cara_b_json: JSON.stringify(caraBObjects),
        }),
      });
    },
  };

  /**
   * Módulo clasificador tipológico arqueológico (Fase 2 IA).
   * Retorna null si el servidor no está disponible → no bloqueante.
   */
  const classifier = {
    /**
     * Clasifica un artefacto según sus métricas morfométricas.
     * @param {Object} metricsDict  - Objeto metricas con forma_detectada, circularity, etc.
     * @returns {Promise<{tipo, subtipo, confianza, descripcion, color, icono}|null>}
     */
    async classify(metricsDict) {
      if (!_serverAvailable || !isModuleActive('classifier')) return null;
      if (!metricsDict || typeof metricsDict !== 'object') return null;

      // Preparar contorno compacto para que backend pueda calcular EFA
      // sin transferir objetos pesados de geometría.
      let _contourForEfa = null;
      const _candidates = [
        metricsDict._contour_points_for_efa,
        metricsDict.contour_points,
        metricsDict._contour_data?.points,
        metricsDict._contour_data?.points_visual,
      ];
      for (const cand of _candidates) {
        if (Array.isArray(cand) && cand.length >= 8) {
          _contourForEfa = cand;
          break;
        }
      }

      // Submuestreo defensivo para mantener payload estable.
      if (Array.isArray(_contourForEfa) && _contourForEfa.length > 256) {
        const step = _contourForEfa.length / 256;
        const reduced = [];
        for (let i = 0; i < 256; i++) {
          reduced.push(_contourForEfa[Math.floor(i * step)]);
        }
        _contourForEfa = reduced;
      }

      // Filtrar campos pesados que no son necesarios para la clasificación:
      // arrays densos de puntos (puntos_contorno, radios, etc.), base64 y strings largos.
      const _slim = {};
      for (const [k, v] of Object.entries(metricsDict)) {
        if (k === '_contour_data' || k === 'contour_points') continue;
        if (Array.isArray(v) && v.length > 50) continue;        // arrays densos
        if (typeof v === 'string' && v.startsWith('data:')) continue; // base64
        if (typeof v === 'string' && v.length > 2000) continue;       // strings grandes
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          // sub-objetos: incluir solo si tienen propiedades numéricas (ej: tipologia previa)
          const subKeys = Object.keys(v);
          if (subKeys.length > 20) continue;
        }
        _slim[k] = v;
      }

      if (Array.isArray(_contourForEfa) && _contourForEfa.length >= 8) {
        _slim._contour_points_for_efa = _contourForEfa;
      }

      return _fetch('/classify', {
        method: 'POST',
        _timeout: 10_000,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics_json: JSON.stringify(_slim) }),
      });
    },
  };

  /**
   * Módulo SAM (MobileSAM ONNX) — segmentación asistida por IA.
   * Endpoints: GET /api/sam/status · POST /api/sam/download · POST /api/sam-contour
   */
  let _samStatusCache = null;
  let _samStatusTime  = 0;
  const _SAM_STATUS_TTL = 60_000; // 60 segundos

  const sam = {
    /** Estado de los modelos ONNX. Cacheado 60 s para no saturar el hot path. */
    async status() {
      if (!_serverAvailable) return { ready: false, message: 'Servidor no disponible' };
      if (_samStatusCache && (Date.now() - _samStatusTime) < _SAM_STATUS_TTL) {
        return _samStatusCache;
      }
      const result = await _fetch('/sam/status', { method: 'GET' });
      if (result) { _samStatusCache = result; _samStatusTime = Date.now(); }
      return result;
    },
    /** Invalida el caché de status (útil tras download() o cambio de modo). */
    invalidateStatusCache() { _samStatusCache = null; _samStatusTime = 0; },

    /**
     * Descarga los modelos MobileSAM ONNX (~54 MB).
     * Llamar UNA vez antes de usar extractContour con useIA=true.
     */
    async download() {
      if (!_serverAvailable) throw new Error('Servidor no disponible');
      const res = await _fetch('/sam/download', { method: 'POST', body: new FormData(), _timeout: TIMEOUT_MS_LONG });
      sam.invalidateStatusCache();   // el modo puede haber cambiado a mobilesam_onnx
      return res;
    },

    /**
     * Extrae contorno usando SAM o GrabCut AI como segmentador primario.
     * Misma firma y retorno que contour.extract().
     * image      : imageDataURL completa (imagen entera, no recortada)
     * bbox       : { x, y, w, h } en coordenadas absolutas de la imagen
     */
    async extractContour(imageDataURL, bbox, { subpixel = true, simplify = 2.0 } = {}) {
      if (!_serverAvailable) return null;
      return _fetch('/sam-contour', {
        method: 'POST',
        _timeout: TIMEOUT_MS_LONG,
        body: _formData({
          image:    _dataURLtoBlob(imageDataURL),
          bbox_x:   bbox.x,
          bbox_y:   bbox.y,
          bbox_w:   bbox.w,
          bbox_h:   bbox.h,
          subpixel,
          simplify,
        }),
      });
    },
  };

  /**
   * Pipeline completo (cuando todos los módulos estén activos).
   */
  const pipeline = {
    async analyze(imageDataURL, { scalePxMm = 1.0, runTexture = false, runColor = false } = {}) {
      if (!_serverAvailable) return null;
      return _fetch('/analyze', {
        method: 'POST',
        body: _formData({
          image:       _dataURLtoBlob(imageDataURL),
          scale_px_mm: scalePxMm,
          run_texture: runTexture,
          run_color:   runColor,
        }),
      });
    },
  };

  /**
   * Módulo de persistencia de archivos (Fase C).
   * Reemplaza electronAPI cuando no hay Electron.
   * Todos los métodos operan sobre rutas absolutas del sistema local.
   *
   * Interfaz compatible con electronAPI:
   *   ensureFolder(path)           → {success, path}
   *   saveFile(path, content, enc) → {success, path, size}
   *   readFile(path, enc)          → {success, content, path}
   *   listFolder(path)             → {success, entries:[{name,path,is_dir,size}]}
   */
  const persistence = {
    async ensureFolder(path) {
      if (!_serverAvailable) return { success: false, error: 'Servidor no disponible' };
      return _fetch('/fs/mkdir', {
        method: 'POST',
        body: _formData({ path }),
      });
    },

    async saveFile(path, content, encoding = 'text') {
      if (!_serverAvailable) return { success: false, error: 'Servidor no disponible' };
      return _fetch('/fs/write', {
        method: 'POST',
        body: _formData({ path, content, encoding }),
      });
    },

    async readFile(path, encoding = 'text') {
      if (!_serverAvailable) return { success: false, error: 'Servidor no disponible' };
      // GET con query params
      const url = `${BASE_URL}/fs/read?path=${encodeURIComponent(path)}&encoding=${encoding}`;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        return await res.json();
      } catch (e) {
        return { success: false, error: e.message };
      }
    },

    async listFolder(path) {
      if (!_serverAvailable) return { success: false, error: 'Servidor no disponible' };
      const url = `${BASE_URL}/fs/list?path=${encodeURIComponent(path)}`;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        return await res.json();
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
  };

  // ── Inicialización ─────────────────────────────────────────────────────────
  // Primer health check en background — no bloquea la carga de la app
  _healthCheck().catch(() => {});

  // ── Exposición pública ─────────────────────────────────────────────────────
  return {
    isAvailable,
    getCapabilities,
    isModuleActive,
    ensureReady,
    onStatusChange,
    detection,
    contour,
    metrics,
    efa,
    obj3d,
    morphology,
    scale,
    comparator,
    persistence,
    ph,
    bifacial,
    pipeline,
    sam,
    classifier,
    // Solo para debug en consola
    _debug: () => ({
      serverAvailable: _serverAvailable,
      capabilities:    _capabilities,
      retrying:        !!_retryTimer,
    }),
  };

})();

// Exponer globalmente para uso desde analysis-core.js y comparator.js
window.PythonBridge = PythonBridge;
