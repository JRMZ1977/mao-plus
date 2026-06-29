/* ─── MAO IA Modal — controlador v2 ──────────────────────────────────────────
   Layout en dos columnas (controles | preview+resultados).
   Tabs: Contornos (canvas con zoom) / Tabla / Fichas.
   Selector de cara bifacial, estado de servidor, escala activa.
   Exportación CSV (via electronAPI) y copia JSON (clipboard).
   Usa getters expuestos por analysis-core.js para acceder vars del IIFE.
──────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const PYTHON_URL = 'http://127.0.0.1:8765';

  // ── Refs DOM: botón de acceso ────────────────────────────────────────────
  const maoIaBtn = document.getElementById('maoIaBtn');
  const modal    = document.getElementById('maoIaModal');
  if (!maoIaBtn || !modal) return;

  // ── Refs DOM: panel izquierdo ────────────────────────────────────────────
  const btnClose      = document.getElementById('maoIaModalClose');
  const btnCancel     = document.getElementById('maoIaModalCancel');
  const btnRun        = document.getElementById('maoIaRun');
  const serverStatus  = document.getElementById('maoIaServerStatus');
  const faceSelector  = document.getElementById('maoIaFaceSelector');
  const faceBtnA      = document.getElementById('maoIaFaceBtnA');
  const faceBtnB      = document.getElementById('maoIaFaceBtnB');
  const imageInfoEl   = document.getElementById('maoIaImageInfo');
  const scaleInfoEl   = document.getElementById('maoIaScaleInfo');
  const scaleValueEl  = document.getElementById('maoIaScaleValue');
  const selThreshold  = document.getElementById('maoIaThreshold');
  const manualRow     = document.getElementById('maoIaManualRow');
  const sliderThresh  = document.getElementById('maoIaThreshSlider');
  const dispThresh    = document.getElementById('maoIaThreshDisplay');
  const sliderArea    = document.getElementById('maoIaAreaSlider');
  const dispArea      = document.getElementById('maoIaAreaDisplay');
  const sliderBlur    = document.getElementById('maoIaBlurSlider');
  const dispBlur      = document.getElementById('maoIaBlurDisplay');
  const sliderMax     = document.getElementById('maoIaMaxSlider');
  const dispMax       = document.getElementById('maoIaMaxDisplay');
  const chkInvert     = document.getElementById('maoIaInvert');
  const chkHull       = document.getElementById('maoIaHull');
  const chkClahe      = document.getElementById('maoIaClahe');
  const claheControls = document.getElementById('maoIaClaheControls');
  const sliderClip    = document.getElementById('maoIaClipSlider');
  const dispClip      = document.getElementById('maoIaClipDisplay');
  const sliderTile    = document.getElementById('maoIaTileSlider');
  const dispTile      = document.getElementById('maoIaTileDisplay');

  // ── Refs DOM: panel derecho ──────────────────────────────────────────────
  const placeholderEl  = document.getElementById('maoIaPlaceholder');
  const resultsPanel   = document.getElementById('maoIaResults');
  const resultTitle    = document.getElementById('maoIaResultTitle');
  const resultCount    = document.getElementById('maoIaResultCount');
  const tabs           = document.querySelectorAll('.mao-ia-tab');
  const exportCSVBtn   = document.getElementById('maoIaExportCSV');
  const copyJSONBtn    = document.getElementById('maoIaCopyJSON');
  const selectorWrap   = document.getElementById('maoIaSelector');
  const selectorCards  = document.getElementById('maoIaSelectorCards');
  const btnAllOn       = document.getElementById('maoIaBtnAllOn');
  const btnAllOff      = document.getElementById('maoIaBtnAllOff');
  const viewCanvas     = document.getElementById('maoIaViewCanvas');
  const zoomOutBtn     = document.getElementById('maoIaZoomOut');
  const zoomLevelEl    = document.getElementById('maoIaZoomLevel');
  const zoomInBtn      = document.getElementById('maoIaZoomIn');
  const zoomFitBtn     = document.getElementById('maoIaZoomFit');
  const zoom100Btn     = document.getElementById('maoIaZoom100');
  const toggleBgBtn    = document.getElementById('maoIaToggleBg');
  const bgLegendEl     = document.getElementById('maoIaBgLegend');
  const centerFocusBtn = document.getElementById('maoIaCenterFocus');
  const focusLegendEl  = document.getElementById('maoIaFocusLegend');
  const canvasWrap     = document.getElementById('maoIaCanvasWrap');
  const cnvContornos   = document.getElementById('maoIaCanvas');
  const cnvLegend      = document.getElementById('maoIaCanvasLegend');
  const viewTable      = document.getElementById('maoIaViewTable');
  const tableBody      = document.getElementById('maoIaTableBody');
  const viewCards      = document.getElementById('maoIaViewCards');
  const resultBody     = document.getElementById('maoIaResultBody');
  const progressDiv    = document.getElementById('maoIaProgress');
  const fsBtn          = document.getElementById('maoIaFullscreen');
  const modalInner     = document.getElementById('maoIaModalInner');

  // ── Refs DOM: zona de selección de región de interés ─────────────────────────
  const selCanvas    = document.getElementById('maoIaSelCanvas');
  const selWrap      = document.getElementById('maoIaSelWrap');
  const selNoImg     = document.getElementById('maoIaSelNoImg');
  const selInfo      = document.getElementById('maoIaSelInfo');
  const selClearBtn  = document.getElementById('maoIaSelClear');
  const autoParamsEl = document.getElementById('maoIaAutoParams');
  const autoParamsTxt= document.getElementById('maoIaAutoParamsText');
  const applyAutoBtn = document.getElementById('maoIaApplyAuto');
  const inlineError  = document.getElementById('maoIaInlineError');
  const newSelBtn    = document.getElementById('maoIaNewSel');

  // ── Refs DOM: panel de refinamiento por objeto ───────────────────────────
  const detailPanel        = document.getElementById('maoIaDetailPanel');
  const detailTitle        = document.getElementById('maoIaDetailTitle');
  const detailClose        = document.getElementById('maoIaDetailClose');
  const detailCanvas       = document.getElementById('maoIaDetailCanvas');
  const detailSpinner      = document.getElementById('maoIaDetailSpinner');
  const detailThreshold    = document.getElementById('maoIaDetailThreshold');
  const detailManualRow    = document.getElementById('maoIaDetailManualRow');
  const detailThreshSlider = document.getElementById('maoIaDetailThreshSlider');
  const detailThreshDisp   = document.getElementById('maoIaDetailThreshDisplay');
  const detailBlurSlider   = document.getElementById('maoIaDetailBlurSlider');
  const detailBlurDisp     = document.getElementById('maoIaDetailBlurDisplay');
  const detailInvert       = document.getElementById('maoIaDetailInvert');
  const detailClahe        = document.getElementById('maoIaDetailClahe');
  const detailRunBtn       = document.getElementById('maoIaDetailRun');

  // ── Refs DOM: panel lateral de métricas ─────────────────────────────────
  const metricsPanel      = document.getElementById('maoIaMetricsPanel');
  const metricsModalTitle = document.getElementById('maoIaMetricsTitle');
  const metricsModalBody  = document.getElementById('maoIaMetricsBody');
  const metricsModalClose = document.getElementById('maoIaMetricsClose');
  const metricsSearchEl   = document.getElementById('maoIaMetricsSearch');

  // ── Estado interno ───────────────────────────────────────────────────────
  let maoIaVisible       = new Set();
  let maoIaLastObjects   = [];
  let maoIaObjectsByFace = { A: [], B: [] };  // resultados persistentes por cara
  let selectedFace       = 'A';
  let serverHealthy      = false;            // flag de salud del servidor

  // ── #3: cancelación + cronómetro del análisis ────────────────────────────
  let _iaAbortController = null;
  let _iaElapsedTimer    = null;

  // ── #1: orden + filtro de la tabla por confianza/columna ─────────────────
  let _iaTableSortKey = null;   // null = orden natural (área desc del backend)
  let _iaTableSortDir = 1;      // 1 asc · -1 desc
  let _iaConfFilter   = false;  // true = solo objetos de baja confianza

  // ── Confianza de detección: lenguaje canónico LAAR (ADR-005 · ADR-007) ────
  // Fuente: backend mao_ia_analyzer → _confianza_objeto (contraste de borde +
  // extent). Color = estado real: alta→ok · media→none · baja→wa.
  function _confLevel(obj) {
    return (obj && (obj.confidence_level || obj._confidenceLvl)) || null;
  }
  function _confScore(obj) {
    const s = obj && (obj.detection_confidence != null
      ? obj.detection_confidence : obj._confidence);
    return typeof s === 'number' ? s : null;
  }
  function _confMod(lvl) {
    return lvl === 'alta' ? 'ok' : (lvl === 'baja' ? 'wa' : 'none');
  }
  function _confTxtShort(lvl) {
    return lvl === 'alta' ? 'Alta' : lvl === 'media' ? 'Media'
         : lvl === 'baja' ? 'Baja' : '—';
  }
  function _confTitle(obj) {
    const s = _confScore(obj);
    return s != null ? 'Confianza de detección: ' + Math.round(s * 100) + '%'
                     : 'Confianza de detección automática';
  }
  /** Chip DOM canónico (selector). small=true para pills compactos. */
  function _makeConfChip(obj, small) {
    const lvl = _confLevel(obj);
    if (!lvl) return null;
    const chip = document.createElement('span');
    const MO   = window.MaoOrganizer;
    const txt  = lvl === 'baja' ? 'Revisar' : _confTxtShort(lvl);
    if (MO && MO.setChip) MO.setChip(chip, _confMod(lvl), txt);
    else { chip.className = 'laar-chip laar-chip--' + _confMod(lvl); chip.textContent = txt; }
    chip.title = _confTitle(obj);
    if (small) { chip.style.fontSize = '8.5px'; chip.style.padding = '1px 6px'; }
    return chip;
  }
  /** Chip como string HTML (para renderTable, que construye HTML). */
  function _confChipHTML(obj) {
    const lvl = _confLevel(obj);
    if (!lvl) return '<span style="color:#cbd5e0;">—</span>';
    const t = _confTitle(obj).replace(/"/g, '&quot;');
    return '<span class="laar-chip laar-chip--' + _confMod(lvl) + '" ' +
           'style="font-size:9px;padding:1px 7px;" title="' + t + '">' +
           _confTxtShort(lvl) + '</span>';
  }
  /** Conteos por nivel para resumen y toolbar de triage. */
  function _confCounts(objects) {
    const c = { alta: 0, media: 0, baja: 0, sin: 0 };
    (objects || []).forEach(o => {
      const l = _confLevel(o);
      if (l === 'alta' || l === 'media' || l === 'baja') c[l]++; else c.sin++;
    });
    return c;
  }

  // ── #3: overlay de progreso con cronómetro de tiempo transcurrido ────────
  function _startElapsed() {
    const el = document.getElementById('maoIaProgressElapsed');
    const t0 = performance.now();
    if (el) el.textContent = '0.0 s';
    _stopElapsed();
    _iaElapsedTimer = setInterval(() => {
      if (el) el.textContent = ((performance.now() - t0) / 1000).toFixed(1) + ' s';
    }, 200);
  }
  function _stopElapsed() {
    if (_iaElapsedTimer) { clearInterval(_iaElapsedTimer); _iaElapsedTimer = null; }
  }

  // ── SISTEMA DE REINTENTOS AUTOMÁTICO PARA EL SERVIDOR ───────────────────
  // Si el servidor no responde al cargar la app, reintenta automáticamente
  // cada segundo sin bloquear la UI. Permite que el usuario inicie análisis
  // cuando el servidor finalmente esté listo.
  async function ensureServerHealth(maxRetries = 30, intervalMs = 1000) {
    if (serverHealthy) return true;

    console.log('[MAO IA] Verificando salud del servidor...');
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(PYTHON_URL + '/api/health', { 
          signal: AbortSignal.timeout(1500),
          cache: 'no-store'
        });
        if (res.ok) {
          serverHealthy = true;
          console.log(`[MAO IA] ✓ Servidor listo (intento ${attempt}/${maxRetries})`);
          if (serverStatus) serverStatus.textContent = '🟢 Servidor listo';
          if (serverStatus) serverStatus.style.color = '#28a745';
          return true;
        }
      } catch (err) {
        // Servidor aún no responde — esperar e intentar de nuevo
        if (attempt === 1) {
          console.log('[MAO IA] Servidor no responde — esperando...');
          if (serverStatus) serverStatus.textContent = '🟡 Conectando...';
          if (serverStatus) serverStatus.style.color = '#ffc107';
        }
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, intervalMs));
        }
      }
    }

    console.warn('[MAO IA] ❌ Servidor no disponible tras', maxRetries, 'reintentos');
    if (serverStatus) serverStatus.textContent = '🔴 Servidor no disponible';
    if (serverStatus) serverStatus.style.color = '#dc3545';
    return false;
  }

  // Llamar al inicio de modal para verificar servidor
  async function updateServerStatus() {
    const healthy = await ensureServerHealth(30, 1000);
    return healthy;
  }

  // Verificar estado del servidor cuando el usuario abre el modal
  maoIaBtn && maoIaBtn.addEventListener('click', async () => {
    await updateServerStatus();
  });
  let iaZoom           = 1.0;
  let iaBgVisible      = true;   // true = con fotografía, false = solo contornos
  let iaFocusedId      = null;   // object_id del contorno activo (selección por clic)
  let iaCanvasNativeW  = 0;
  let iaCanvasNativeH  = 0;
  const IAZ_STEP = 0.25, IAZ_MIN = 0.10, IAZ_MAX = 6.0;

  // Estado de la selección de región de interés
  let _selROI         = null;   // {x,y,w,h} en píxeles nativos de la imagen
  let _selDragging    = false;
  let _selDragCnvX    = 0;      // inicio del drag en coordenadas del selCanvas
  let _selDragCnvY    = 0;
  let _selDispScale   = 1;      // escala canvas-px / imagen-px (letterbox)
  let _selOffX        = 0;      // offset X del letterbox en selCanvas
  let _selOffY        = 0;
  let _selCropOriginX = 0;      // origen del ROI en imagen (para offset de coords)
  let _selCropOriginY = 0;
  let _selAutoSugg    = null;   // {method, value} de la última sugerencia auto

  const IAColors = ['#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f',
                    '#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac'];
  function iaColor(id) { return IAColors[(id - 1) % IAColors.length]; }

  // ── Acceso a vars del IIFE de analysis-core.js ───────────────────────────
  function callGetter(name) {
    return typeof window[name] === 'function' ? window[name]() : null;
  }
  function getActiveImage() {
    const modo = callGetter('_maoGetModo') || 'monofacial';
    if (modo === 'bifacial') {
      const a = callGetter('_maoGetImageCaraA');
      const b = callGetter('_maoGetImageCaraB');
      if (selectedFace === 'B' && b) return b;
      if (selectedFace === 'A' && a) return a;
      return a || b;
    }
    return callGetter('_maoGetImage');
  }

  // ── Habilitar botón de acceso ──────────────────────────────────────────
  setInterval(() => {
    try {
      const hasImg = callGetter('_maoGetImage')      !== null ||
                     callGetter('_maoGetImageCaraA') !== null ||
                     callGetter('_maoGetImageCaraB') !== null;
      maoIaBtn.disabled      = !hasImg;
      maoIaBtn.style.opacity = hasImg ? '1' : '0.5';
    } catch (e) {}
  }, 800);

  // ── Sliders ──────────────────────────────────────────────────────────────
  sliderThresh.addEventListener('input', () => { dispThresh.textContent = sliderThresh.value; });
  sliderArea.addEventListener('input',   () => { dispArea.textContent   = sliderArea.value;   });
  sliderBlur.addEventListener('input',   () => { dispBlur.textContent   = sliderBlur.value;   });
  sliderMax.addEventListener('input',    () => { dispMax.textContent    = sliderMax.value;    });
  sliderClip.addEventListener('input',   () => { dispClip.textContent   = sliderClip.value;   });
  sliderTile.addEventListener('input',   () => { dispTile.textContent   = sliderTile.value;   });
  selThreshold.addEventListener('change', () => {
    const isAuto = selThreshold.value === 'auto';
    manualRow.style.display = selThreshold.value === 'manual' ? 'block' : 'none';
    // ADR-012 F3: en modo 'auto' (núcleo OpenCV) la estrategia de umbral/preproceso
    // la decide el núcleo → los controles de umbral/blur/invert/CLAHE no aplican
    // (min_area y max_objects sí). Se desactivan para no confundir.
    [sliderThresh, sliderBlur, chkInvert, chkClahe, sliderClip, sliderTile]
      .forEach(el => { if (el) el.disabled = isAuto; });
  });
  // Estado inicial coherente con el default 'auto'.
  selThreshold.dispatchEvent(new Event('change'));
  chkClahe.addEventListener('change', () => {
    claheControls.style.display = chkClahe.checked ? 'block' : 'none';
  });

  // ── Selector de cara bifacial ────────────────────────────────────────────
  function setSelectedFace(face) {
    selectedFace = face;
    [faceBtnA, faceBtnB].forEach(btn => {
      if (!btn) return;
      const active = (face === 'A' ? faceBtnA : faceBtnB) === btn;
      btn.style.background = active ? '#6f42c1' : '#fff';
      btn.style.color      = active ? '#fff'    : '#a0aec0';
      btn.style.border     = active ? '1.5px solid #6f42c1' : '1.5px solid #e2e8f0';
    });
    updateImageInfo();
    clearSelection();
    requestAnimationFrame(drawSelCanvas);
    // Restaurar resultados de la cara seleccionada (si existen)
    const faceObjects = maoIaObjectsByFace[face] || [];
    if (faceObjects.length > 0) {
      maoIaLastObjects = faceObjects;
      maoIaVisible     = new Set(faceObjects.map(o => o.object_id));
      // #1 — reinicia orden/filtro al restaurar la otra cara.
      _iaTableSortKey = null; _iaTableSortDir = 1; _iaConfFilter = false;
      const _cfb = document.getElementById('maoIaConfFilter');
      if (_cfb) _cfb.checked = false;
      _updateSortIndicators();
      buildMaoSelector(faceObjects);
      renderTable(faceObjects);
      renderCards(faceObjects);
      _renderConfSummary(faceObjects);
      _updateConfFilterCount();
      if (resultsPanel) resultsPanel.style.display = 'flex';
      if (placeholderEl) placeholderEl.style.display = 'none';
      setTimeout(() => { fitZoomToWrap(); drawContoursCanvas(faceObjects); }, 50);
    } else {
      // Sin análisis para esta cara: limpiar UI
      maoIaLastObjects = [];
      maoIaVisible     = new Set();
      _renderConfSummary([]);
      hideDetailPanel();
      if (resultsPanel) resultsPanel.style.display = 'none';
      if (placeholderEl) placeholderEl.style.display = 'flex';
      if (selectorWrap) selectorWrap.style.display = 'none';
      if (cnvContornos) {
        cnvContornos.style.display = 'none';
        const ctx = cnvContornos.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, cnvContornos.width, cnvContornos.height);
      }
    }
    _updateFaceBadges();
  }
  faceBtnA && faceBtnA.addEventListener('click', () => setSelectedFace('A'));
  faceBtnB && faceBtnB.addEventListener('click', () => setSelectedFace('B'));

  /** Actualiza el indicador visual (punto verde) en los botones de cara */
  function _updateFaceBadges() {
    [['A', faceBtnA], ['B', faceBtnB]].forEach(([face, btn]) => {
      if (!btn) return;
      const objs  = maoIaObjectsByFace[face] || [];
      const count = objs.length;
      const badge = count > 0
        ? ' <span style="display:inline-flex;align-items:center;justify-content:center;' +
          'min-width:16px;height:16px;padding:0 4px;border-radius:8px;' +
          'background:#48bb78;color:#fff;font-size:9px;font-weight:700;' +
          'vertical-align:middle;margin-left:3px;flex-shrink:0;">' + count + '</span>'
        : '';
      btn.innerHTML  = 'Cara ' + face + badge;
      btn.title      = count > 0
        ? 'Cara ' + face + ' — ' + count + ' objeto(s) analizado(s). Clic para ver.'
        : 'Cara ' + face;
    });
  }

  function updateImageInfo() {
    if (!imageInfoEl) return;
    try {
      const modo = callGetter('_maoGetModo') || 'monofacial';
      const img  = getActiveImage();
      if (!img) { imageInfoEl.textContent = 'Sin imagen'; return; }
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      const lbl = modo === 'bifacial' ? '<b>Cara ' + selectedFace + '</b> \u2014 ' : '';
      imageInfoEl.innerHTML = lbl + w + ' \xd7 ' + h + ' px';
    } catch (e) { imageInfoEl.textContent = 'Sin imagen'; }
  }

  // ── Zona de selección ROI ────────────────────────────────────────────────

  /** Dibuja la imagen en selCanvas con el rectángulo de ROI superpuesto */
  function drawSelCanvas() {
    if (!selCanvas || !selWrap) return;
    const wW = selWrap.clientWidth  || selWrap.offsetWidth;
    const wH = selWrap.clientHeight || selWrap.offsetHeight;
    if (!wW || !wH) { requestAnimationFrame(drawSelCanvas); return; }
    selCanvas.width  = wW;
    selCanvas.height = wH;
    const ctx = selCanvas.getContext('2d');
    ctx.clearRect(0, 0, wW, wH);
    const img = getActiveImage();
    if (!img) {
      if (selNoImg) selNoImg.style.display = 'flex';
      return;
    }
    if (selNoImg) selNoImg.style.display = 'none';
    const iw = img.naturalWidth  || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    // Letterbox: ajustar imagen manteniendo aspecto
    const scale = Math.min(wW / iw, wH / ih);
    const dw = Math.round(iw * scale), dh = Math.round(ih * scale);
    _selDispScale = scale;
    _selOffX = Math.round((wW - dw) / 2);
    _selOffY = Math.round((wH - dh) / 2);
    ctx.drawImage(img, _selOffX, _selOffY, dw, dh);
    if (_selROI) {
      // Oscurecer zona fuera del ROI
      ctx.fillStyle = 'rgba(0,0,0,0.52)';
      ctx.fillRect(_selOffX, _selOffY, dw, dh);
      // Ventana activa: limpiar y redibujar imagen solo en esa zona
      const rx = _selOffX + Math.round(_selROI.x * scale);
      const ry = _selOffY + Math.round(_selROI.y * scale);
      const rw = Math.round(_selROI.w * scale);
      const rh = Math.round(_selROI.h * scale);
      ctx.clearRect(rx, ry, rw, rh);
      ctx.drawImage(img, _selROI.x, _selROI.y, _selROI.w, _selROI.h, rx, ry, rw, rh);
      // Marco punteado morado
      ctx.strokeStyle = '#6f42c1';
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
      ctx.setLineDash([]);
      // Esquinas blancas
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 2.5;
      const CS = 9;
      [[rx, ry], [rx + rw, ry], [rx, ry + rh], [rx + rw, ry + rh]].forEach(([cx2, cy2]) => {
        const dx = cx2 === rx ? 1 : -1, dy = cy2 === ry ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(cx2, cy2 + dy * CS); ctx.lineTo(cx2, cy2); ctx.lineTo(cx2 + dx * CS, cy2);
        ctx.stroke();
      });
      // Etiqueta con dimensiones
      const lbl = _selROI.w + ' × ' + _selROI.h + ' px';
      ctx.font = 'bold 9px monospace';
      const lblW = ctx.measureText(lbl).width + 10;
      ctx.fillStyle = 'rgba(111,66,193,0.88)';
      ctx.fillRect(rx, Math.max(0, ry - 17), lblW, 16);
      ctx.fillStyle = '#fff';
      ctx.fillText(lbl, rx + 5, Math.max(11, ry - 4));
    } else if (_selDragging) {
      // Rect de arrastre en tiempo real (sin ROI guardado aún)
    }
  }

  /** Convierte coordenadas del selCanvas a píxeles nativos de la imagen */
  function _cnvToImage(canvasX, canvasY) {
    return {
      ix: Math.round((canvasX - _selOffX) / _selDispScale),
      iy: Math.round((canvasY - _selOffY) / _selDispScale),
    };
  }

  /** Limpia la selección de ROI y actualiza UI */
  function clearSelection() {
    _selROI = null;
    _selAutoSugg = null;
    if (selInfo)      selInfo.style.display      = 'none';
    if (selClearBtn)  selClearBtn.style.display  = 'none';
    if (autoParamsEl) autoParamsEl.style.display = 'none';
    if (inlineError)  inlineError.style.display  = 'none';
    drawSelCanvas();
  }

  /** Analiza píxeles del ROI y sugiere método de umbral óptimo */
  function analyzeROIPixels(roi) {
    try {
      const img = getActiveImage();
      if (!img) return;
      const tmp = document.createElement('canvas');
      tmp.width = roi.w; tmp.height = roi.h;
      tmp.getContext('2d').drawImage(img, roi.x, roi.y, roi.w, roi.h, 0, 0, roi.w, roi.h);
      const pix   = tmp.getContext('2d').getImageData(0, 0, roi.w, roi.h).data;
      const total = roi.w * roi.h;
      const hist  = new Uint32Array(256);
      let sum = 0;
      for (let i = 0; i < pix.length; i += 4) {
        const g = Math.round(0.299 * pix[i] + 0.587 * pix[i + 1] + 0.114 * pix[i + 2]);
        hist[g]++; sum += g;
      }
      const mean = sum / total;
      let sumSq = 0;
      for (let v = 0; v < 256; v++) sumSq += v * v * hist[v];
      const std = Math.sqrt(Math.max(0, sumSq / total - mean * mean));
      // Otsu en JS para sugerencia de umbral
      let sB = 0, wB = 0, maxV = 0, otsuT = 127;
      for (let t = 0; t < 256; t++) {
        wB += hist[t]; if (!wB) continue;
        const wF = total - wB; if (!wF) break;
        sB += t * hist[t];
        const mB = sB / wB, mF = (sum - sB) / wF;
        const v = wB * wF * (mB - mF) ** 2;
        if (v > maxV) { maxV = v; otsuT = t; }
      }
      let method, value, note;
      if (std < 18)       { method = 'adaptive'; value = otsuT; note = 'Adaptativo (contraste bajo, σ=' + std.toFixed(0) + ')'; }
      else if (std >= 35) { method = 'otsu';     value = otsuT; note = 'Otsu automático (umbral estimado ' + otsuT + ')'; }
      else                { method = 'manual';   value = otsuT; note = 'Manual sugerido (t=' + otsuT + ', σ=' + std.toFixed(0) + ')'; }
      _selAutoSugg = { method, value };
      if (autoParamsEl)  autoParamsEl.style.display = 'flex';
      if (autoParamsTxt) autoParamsTxt.textContent  = note;
    } catch (e) { console.warn('analyzeROIPixels:', e); }
  }

  // Eventos de selección rubber-band sobre selCanvas
  if (selCanvas) {
    selCanvas.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      const r = selCanvas.getBoundingClientRect();
      const ratio = selCanvas.width / (r.width || 1);
      _selDragCnvX = (e.clientX - r.left) * ratio;
      _selDragCnvY = (e.clientY - r.top)  * ratio;
      _selDragging = true;
      _selROI = null;
      if (selInfo)      selInfo.style.display      = 'none';
      if (selClearBtn)  selClearBtn.style.display  = 'none';
      if (autoParamsEl) autoParamsEl.style.display = 'none';
      if (inlineError)  inlineError.style.display  = 'none';
    });

    selCanvas.addEventListener('mousemove', e => {
      if (!_selDragging) return;
      const r = selCanvas.getBoundingClientRect();
      const ratio = selCanvas.width / (r.width || 1);
      const curX = (e.clientX - r.left) * ratio;
      const curY = (e.clientY - r.top)  * ratio;
      const p1 = _cnvToImage(Math.min(_selDragCnvX, curX), Math.min(_selDragCnvY, curY));
      const p2 = _cnvToImage(Math.max(_selDragCnvX, curX), Math.max(_selDragCnvY, curY));
      const img = getActiveImage();
      const iw  = img ? (img.naturalWidth  || img.width)  : 9999;
      const ih  = img ? (img.naturalHeight || img.height) : 9999;
      const x = Math.max(0, Math.min(p1.ix, iw - 1));
      const y = Math.max(0, Math.min(p1.iy, ih - 1));
      const w = Math.min(iw - x, Math.max(1, p2.ix - p1.ix));
      const h = Math.min(ih - y, Math.max(1, p2.iy - p1.iy));
      _selROI = { x, y, w, h };
      drawSelCanvas();
    });

    const finishDrag = () => {
      if (!_selDragging) return;
      _selDragging = false;
      if (_selROI && _selROI.w > 20 && _selROI.h > 20) {
        if (selInfo)     { selInfo.style.display     = 'inline-flex'; }
        if (selClearBtn) { selClearBtn.style.display = 'inline-block'; }
        analyzeROIPixels(_selROI);
      } else {
        _selROI = null;
        drawSelCanvas();
      }
    };
    selCanvas.addEventListener('mouseup',    finishDrag);
    selCanvas.addEventListener('mouseleave', finishDrag);
  }

  selClearBtn && selClearBtn.addEventListener('click', clearSelection);

  applyAutoBtn && applyAutoBtn.addEventListener('click', () => {
    if (!_selAutoSugg) return;
    if (selThreshold) {
      selThreshold.value = _selAutoSugg.method;
      selThreshold.dispatchEvent(new Event('change'));
    }
    if (_selAutoSugg.method === 'manual' && sliderThresh) {
      sliderThresh.value = _selAutoSugg.value;
      if (dispThresh) dispThresh.textContent = _selAutoSugg.value;
    }
    applyAutoBtn.textContent = '✓ Aplicado';
    setTimeout(() => { applyAutoBtn.textContent = 'Aplicar'; }, 1500);
  });

  // ── Reset al estado inicial (sin resultados) ─────────────────────────────
  function _resetAnalysisState(all = false) {
    if (all) {
      maoIaObjectsByFace = { A: [], B: [] };
    } else {
      // Solo limpiar la cara activa
      maoIaObjectsByFace[selectedFace] = [];
    }
    maoIaLastObjects = [];
    maoIaVisible     = new Set();
    hideDetailPanel();
    clearSelection();
    if (resultsPanel) resultsPanel.style.display = 'none';
    if (placeholderEl) placeholderEl.style.display = 'flex';
    if (selectorWrap) selectorWrap.style.display = 'none';
    if (cnvContornos) cnvContornos.style.display = 'none';
    _updateFaceBadges();
  }

  newSelBtn && newSelBtn.addEventListener('click', () => {
    _resetAnalysisState(false); // solo limpiar cara activa
  });
  // ── Abrir modal ──────────────────────────────────────────────────────────
  maoIaBtn.addEventListener('click', () => {
    const modo = callGetter('_maoGetModo') || 'monofacial';
    const hasA = callGetter('_maoGetImageCaraA') !== null;
    const hasB = callGetter('_maoGetImageCaraB') !== null;
    if (faceSelector) {
      faceSelector.style.display = modo === 'bifacial' ? 'block' : 'none';
      if (faceBtnA) { faceBtnA.disabled = !hasA; faceBtnA.style.opacity = hasA ? '1' : '0.4'; }
      if (faceBtnB) { faceBtnB.disabled = !hasB; faceBtnB.style.opacity = hasB ? '1' : '0.4'; }
      if (modo === 'bifacial') setSelectedFace(hasA ? 'A' : 'B');
    }
    const sc = callGetter('_maoGetScale');
    const noScaleWarnEl = document.getElementById('maoIaNoScaleWarn');
    if (scaleInfoEl && scaleValueEl) {
      if (sc) {
        scaleValueEl.textContent  = Number(sc).toFixed(5) + ' mm/px';
        scaleInfoEl.style.display = 'block';
        if (noScaleWarnEl) noScaleWarnEl.style.display = 'none';
      } else {
        scaleInfoEl.style.display = 'none';
        if (noScaleWarnEl) noScaleWarnEl.style.display = 'block';
      }
    }
    updateImageInfo();
    // Restaurar resultados de la cara activa si existen (no limpiar al reabrir)
    const savedObjects = maoIaObjectsByFace[selectedFace] || [];
    if (savedObjects.length > 0) {
      maoIaLastObjects = savedObjects;
      maoIaVisible     = new Set(savedObjects.map(o => o.object_id));
      buildMaoSelector(savedObjects);
      renderTable(savedObjects);
      renderCards(savedObjects);
      if (resultsPanel) resultsPanel.style.display = 'flex';
      if (placeholderEl) placeholderEl.style.display = 'none';
    } else {
      // Sin datos para esta cara: estado limpio listo para analizar
      maoIaLastObjects = [];
      maoIaVisible     = new Set();
      if (resultsPanel) resultsPanel.style.display = 'none';
      if (placeholderEl) placeholderEl.style.display = 'flex';
      if (selectorWrap) selectorWrap.style.display = 'none';
      if (cnvContornos) cnvContornos.style.display = 'none';
    }
    _updateFaceBadges();
    modal.style.display = 'flex';
    updateToggleBgUI();
    requestAnimationFrame(drawSelCanvas);
    checkServer();
  });

  // ── Cerrar modal ─────────────────────────────────────────────────────────
  function closeModal() {
    _closeMetricsPanel();
    // Ocultar el modal PRIMERO para que el botón responda de inmediato
    if (document.fullscreenElement) {
      document.exitFullscreen().finally(() => {
        modal.style.display = 'none';
        _syncFacesAfterClose();
      });
    } else {
      modal.style.display = 'none';
      // Diferir la re-sync al siguiente tick para no bloquear el cierre visual
      setTimeout(_syncFacesAfterClose, 0);
    }
  }

  /** Re-sincroniza objetos de TODAS las caras al análisis principal.
   *  Se ejecuta después de que el modal ya se ha ocultado. */
  function _syncFacesAfterClose() {
    if (typeof window.inyectarObjetosDesdeIA !== 'function') return;
    try {
      const esBifacial = callGetter('_maoGetModo') === 'bifacial';
      ['A', 'B'].forEach(f => {
        const objs = maoIaObjectsByFace[f];
        if (objs && objs.length) {
          window.inyectarObjetosDesdeIA(objs, esBifacial ? f : null);
        }
      });
    } catch (e) {
      console.warn('[AIA closeModal] Error en re-sync de tarjetas:', e);
    }
  }
  [btnClose, btnCancel].forEach(b => b && b.addEventListener('click', closeModal));
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  // ── Tabs ─────────────────────────────────────────────────────────────────
  function switchTab(which) {
    tabs.forEach(tab => {
      const active = tab.dataset.tab === which;
      tab.style.background = active ? '#6f42c1' : 'transparent';
      tab.style.color      = active ? '#fff'    : '#718096';
    });
    viewCanvas.style.display = which === 'canvas' ? 'flex'  : 'none';
    viewTable.style.display  = which === 'table'  ? 'flex'  : 'none';
    viewCards.style.display  = which === 'cards'  ? 'block' : 'none';
  }
  tabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));

  // ── Pantalla completa ────────────────────────────────────────────────────
  let _iaFullscreen = false;

  function _syncFsBtn(isFs) {
    if (!fsBtn) return;
    if (isFs) {
      fsBtn.innerHTML = '&#x22A1;';   // ⊡ — restaurar
      fsBtn.title     = 'Restaurar tamaño';
    } else {
      fsBtn.innerHTML = '&#x26F6;';   // ⛶ — pantalla completa
      fsBtn.title     = 'Pantalla completa';
    }
  }

  /** Fallback CSS para entornos sin soporte de Fullscreen API */
  function _cssFullscreen(on) {
    _iaFullscreen = on;
    if (modalInner) {
      if (on) {
        modalInner.style.maxWidth     = 'none';
        modalInner.style.maxHeight    = 'none';
        modalInner.style.borderRadius = '0';
        modal.style.padding           = '0';
      } else {
        modalInner.style.maxWidth     = '1200px';
        modalInner.style.maxHeight    = '94vh';
        modalInner.style.borderRadius = '12px';
        modal.style.padding           = '1.5vh 1.5vw';
      }
    }
    _syncFsBtn(on);
    requestAnimationFrame(() => {
      if (maoIaLastObjects.length) { fitZoomToWrap(); drawContoursCanvas(maoIaLastObjects); }
    });
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      const target = modalInner || modal;
      target.requestFullscreen().catch(err => {
        console.warn('[MAO-IA] requestFullscreen:', err.message);
        _cssFullscreen(true);
      });
    } else {
      document.exitFullscreen();
    }
  }

  document.addEventListener('fullscreenchange', () => {
    const isFs = !!document.fullscreenElement;
    _iaFullscreen = isFs;
    _syncFsBtn(isFs);
    requestAnimationFrame(() => {
      if (maoIaLastObjects.length) { fitZoomToWrap(); drawContoursCanvas(maoIaLastObjects); }
    });
  });

  fsBtn && fsBtn.addEventListener('click', toggleFullscreen);

  // ── Atajos de teclado del modal ──────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (!modal || modal.style.display === 'none') return;
    // Ignorar si el foco está en un input/textarea/select
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    switch (e.key) {
      case '+': case '=':
        e.preventDefault(); applyZoom(iaZoom + IAZ_STEP); break;
      case '-': case '_':
        e.preventDefault(); applyZoom(iaZoom - IAZ_STEP); break;
      case '0':
        e.preventDefault(); applyZoom(1.0); break;
      case 'f': case 'F':
        e.preventDefault(); fitZoomToWrap(); drawContoursCanvas(maoIaLastObjects); break;
      case 'b': case 'B':
        // Toggle fotografía de fondo
        e.preventDefault();
        iaBgVisible = !iaBgVisible;
        updateToggleBgUI();
        drawContoursCanvas(maoIaLastObjects);
        break;
      case 'Escape':
        if (_iaFullscreen) {
          document.exitFullscreen().catch(() => { _cssFullscreen(false); });
        } else {
          modal.style.display = 'none';
        }
        break;
    }
  });

  // ── Zoom ─────────────────────────────────────────────────────────────────
  /** Calcula el zoom de ajuste considerando AMBAS dimensiones del wrap */
  function fitZoomToWrap() {
    if (!canvasWrap || !iaCanvasNativeW || !iaCanvasNativeH) return;
    const PAD   = 28;
    const wrapW = Math.max(50, canvasWrap.clientWidth  - PAD);
    const wrapH = Math.max(50, canvasWrap.clientHeight - PAD);
    applyZoom(Math.min(wrapW / iaCanvasNativeW, wrapH / iaCanvasNativeH));
  }

  function applyZoom(zoom) {
    iaZoom = Math.min(IAZ_MAX, Math.max(IAZ_MIN, zoom));
    if (zoomLevelEl) zoomLevelEl.textContent = Math.round(iaZoom * 100) + '%';
    // Requiere ambas dimensiones nativas inicializadas (drawContoursCanvas las fija)
    if (cnvContornos && iaCanvasNativeW && iaCanvasNativeH) {
      // Fijamos AMBAS dimensiones CSS para evitar deformaciones por flex-shrink
      const cssW = Math.round(iaCanvasNativeW * iaZoom);
      const cssH = Math.round(iaCanvasNativeH * iaZoom);
      cnvContornos.style.width  = cssW + 'px';
      cnvContornos.style.height = cssH + 'px';
    } else if (cnvContornos && maoIaLastObjects.length) {
      // Canvas todavía no inicializado pero hay objetos: dibujar primero
      drawContoursCanvas(maoIaLastObjects);
    }
  }
  zoomInBtn  && zoomInBtn.addEventListener('click',  () => applyZoom(iaZoom + IAZ_STEP));
  zoomOutBtn && zoomOutBtn.addEventListener('click',  () => applyZoom(iaZoom - IAZ_STEP));
  zoomFitBtn && zoomFitBtn.addEventListener('click',  fitZoomToWrap);
  zoom100Btn && zoom100Btn.addEventListener('click',  () => applyZoom(1.0));

  // ── Toggle fotografía de fondo ────────────────────────────────────────────
  function updateToggleBgUI() {
    if (!toggleBgBtn) return;
    if (iaBgVisible) {
      toggleBgBtn.textContent = '📷 Foto';
      toggleBgBtn.style.background = '#fff';
      toggleBgBtn.style.color      = '#2d3748';
      toggleBgBtn.style.border     = '1px solid #cbd5e0';
    } else {
      toggleBgBtn.textContent = '⬜ Sin foto';
      toggleBgBtn.style.background = '#1e1e2e';
      toggleBgBtn.style.color      = '#a0aec0';
      toggleBgBtn.style.border     = '1px solid #4a5568';
    }
    if (bgLegendEl) {
      bgLegendEl.textContent = iaBgVisible ? '📷 Con fotografía' : '⬜ Solo contornos';
    }
  }

  toggleBgBtn && toggleBgBtn.addEventListener('click', () => {
    iaBgVisible = !iaBgVisible;
    updateToggleBgUI();
    drawContoursCanvas(maoIaLastObjects);
  });

  // Zoom automático a un objeto específico ──────────────────────────────────
  function zoomToObject(obj) {
    if (!canvasWrap || !iaCanvasNativeW) return;
    const img = getActiveImage();
    if (!img) return;
    const iw = img.naturalWidth || img.width;
    const baseScale = iaCanvasNativeW / iw;
    // Bbox del objeto en coordenadas nativas del canvas
    const bx = (obj.bbox_x || 0) * baseScale;
    const by = (obj.bbox_y || 0) * baseScale;
    const bw = Math.max(20, (obj.bbox_w || obj.width  || 60) * baseScale);
    const bh = Math.max(20, (obj.bbox_h || obj.height || 60) * baseScale);
    // Área visible disponible (descontar padding interno 12px × 2)
    const PAD   = 28;
    const wrapW = Math.max(100, canvasWrap.clientWidth  - PAD);
    const wrapH = Math.max(100, canvasWrap.clientHeight - PAD);
    // Zoom que encuadra el objeto con margen del 15 % en ambos ejes
    const newZoom = Math.min(IAZ_MAX, Math.max(IAZ_MIN,
      Math.min(wrapW / bw, wrapH / bh) * 0.85));
    applyZoom(newZoom);
    drawContoursCanvas(maoIaLastObjects);
    // Diferir el scroll al siguiente frame para que el layout reflejen el nuevo
    // tamaño CSS del canvas antes de calcular scrollLeft/scrollTop
    requestAnimationFrame(() => {
      // Centrar scroll: el centro del objeto en coords CSS del canvas
      const objCX = (bx + bw / 2) * newZoom + CANVAS_PAD;
      const objCY = (by + bh / 2) * newZoom + CANVAS_PAD;
      canvasWrap.scrollLeft = Math.max(0, objCX - canvasWrap.clientWidth  / 2);
      canvasWrap.scrollTop  = Math.max(0, objCY - canvasWrap.clientHeight / 2);
    });
  }
  // Zoom con scroll anclado al cursor ─────────────────────────────────────
  // Constante que coincide con el padding:12px de #maoIaCanvasWrap
  const CANVAS_PAD = 12;

  cnvContornos && cnvContornos.addEventListener('wheel', e => {
    e.preventDefault();
    if (!canvasWrap || !iaCanvasNativeW || !iaCanvasNativeH) {
      applyZoom(iaZoom + (e.deltaY < 0 ? IAZ_STEP : -IAZ_STEP));
      return;
    }

    // Normalizar deltaY (lines → px, pages → px)
    const rawDelta = e.deltaY * (e.deltaMode === 1 ? 30 : e.deltaMode === 2 ? 500 : 1);

    // Posición del cursor relativa al área visible del wrap
    const wrapRect  = canvasWrap.getBoundingClientRect();
    const mouseX    = e.clientX - wrapRect.left;   // en CSS px dentro del wrap
    const mouseY    = e.clientY - wrapRect.top;

    // ── Convertir cursor a coordenadas NATIVAS del canvas (antes del zoom) ──
    // En el espacio de scroll: canvas empieza en CANVAS_PAD
    // scrollLeft + mouseX - CANVAS_PAD = posición CSS dentro del canvas
    // Dividir por iaZoom → coordenada nativa (0..iaCanvasNativeW)
    const canvasX = (canvasWrap.scrollLeft + mouseX - CANVAS_PAD) / iaZoom;
    const canvasY = (canvasWrap.scrollTop  + mouseY - CANVAS_PAD) / iaZoom;

    // ── Aplicar nuevo zoom ───────────────────────────────────────────────────
    // Zoom continuo-suave basado en magnitud del delta (evita saltos discretos)
    const ZOOM_SENSITIVITY = 0.003;
    const zoomFactor = Math.pow(2, -rawDelta * ZOOM_SENSITIVITY);
    applyZoom(iaZoom * zoomFactor);

    // ── Reposicionar scroll para que el punto nativo quede bajo el cursor ────
    // canvasX * iaZoom (nuevo) = posición CSS del punto dentro del canvas
    // + CANVAS_PAD              = posición en espacio de scroll
    // - mouseX                  = scrollLeft necesario
    canvasWrap.scrollLeft = Math.max(0, canvasX * iaZoom + CANVAS_PAD - mouseX);
    canvasWrap.scrollTop  = Math.max(0, canvasY * iaZoom + CANVAS_PAD - mouseY);
  }, { passive: false });

  // ── Estado del servidor ──────────────────────────────────────────────────
  async function checkServer() {
    if (!serverStatus) return;
    const dot = document.getElementById('maoIaStatusDot');
    try {
      const r = await fetch(PYTHON_URL + '/api/health', { signal: AbortSignal.timeout(2000) });
      if (r.ok) {
        serverStatus.textContent      = '\u25cf Servidor Python activo';
        serverStatus.style.background = 'rgba(39,103,57,0.3)';
        serverStatus.style.color      = '#a7f3d0';
        if (dot) { dot.style.background = '#48bb78'; dot.title = 'Servidor Python activo'; }
      } else throw new Error();
    } catch {
      serverStatus.textContent      = '\u25cb Servidor no disponible';
      serverStatus.style.background = 'rgba(155,44,44,0.3)';
      serverStatus.style.color      = '#fed7d7';
      if (dot) { dot.style.background = '#fc8181'; dot.title = 'Servidor Python no disponible'; }
    }
  }

  // ── Obtener imagen como Blob ─────────────────────────────────────────────
  function getCurrentImageBlob() {
    return new Promise((resolve, reject) => {
      try {
        const img = getActiveImage();
        if (!img) { reject(new Error('No hay imagen cargada')); return; }
        const tmp = document.createElement('canvas');
        tmp.width  = img.naturalWidth  || img.width;
        tmp.height = img.naturalHeight || img.height;
        tmp.getContext('2d').drawImage(img, 0, 0);
        tmp.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('No se pudo obtener la imagen'));
        }, 'image/jpeg', 0.95);
      } catch (e) { reject(e); }
    });
  }

  // ── Spinner ──────────────────────────────────────────────────────────────
  function showSpinner(on) {
    if (progressDiv) progressDiv.style.display = on ? 'flex' : 'none';
  }

  // ── Ejecutar análisis ─────────────────────────────────────────────────────
  btnRun.addEventListener('click', async () => {
    // ✓ Verificar que el servidor esté listo
    showSpinner(true);
    if (inlineError) {
      inlineError.style.display = 'none';
      inlineError.textContent = '';
    }
    
    console.log('[MAO IA] Verificando disponibilidad del servidor...');
    const serverReady = await ensureServerHealth(5, 500); // 5 intentos rápidos = máx 2.5s
    
    if (!serverReady) {
      showSpinner(false);
      if (inlineError) {
        inlineError.textContent = '🔴 Servidor Python no disponible. Reinicia la aplicación.';
        inlineError.style.display = 'block';
      }
      btnRun.disabled = false;
      btnRun.textContent = '\u25b6\u2002 Ejecutar análisis';
      return;
    }

    btnRun.disabled    = true;
    btnRun.textContent = 'Analizando\u2026';
    iaFocusedId = null; _syncCenterBtn();
    if (placeholderEl) placeholderEl.style.display = 'none';
    resultsPanel.style.display = 'none';
    // #3 — análisis cancelable + cronómetro. Sustituye el AbortSignal.timeout
    // fijo (no cancelable) por un AbortController propio, con un timeout duro
    // de respaldo de 120 s que aborta con motivo 'timeout'.
    _iaAbortController = new AbortController();
    const _killTimer = setTimeout(() => {
      if (_iaAbortController) _iaAbortController.abort('timeout');
    }, 120_000);
    _startElapsed();
    try {
      // Obtener imagen activa y recortar según ROI (si existe)
      const _img = getActiveImage();
      if (!_img) throw new Error('Sin imagen cargada');
      const _iw = _img.naturalWidth  || _img.width;
      const _ih = _img.naturalHeight || _img.height;
      const _roi = _selROI || { x: 0, y: 0, w: _iw, h: _ih };
      _selCropOriginX = _roi.x;
      _selCropOriginY = _roi.y;
      const blob = await new Promise((res, rej) => {
        const tmp = document.createElement('canvas');
        tmp.width  = _roi.w;
        tmp.height = _roi.h;
        tmp.getContext('2d').drawImage(_img, _roi.x, _roi.y, _roi.w, _roi.h, 0, 0, _roi.w, _roi.h);
        tmp.toBlob(b => b ? res(b) : rej(new Error('toBlob falló')), 'image/jpeg', 0.95);
      });
      const fd   = new FormData();
      fd.append('image',            blob, 'imagen.jpg');
      fd.append('threshold_method', selThreshold.value);
      fd.append('threshold_value',  sliderThresh.value);
      fd.append('min_area',         sliderArea.value);
      fd.append('blur_kernel',      sliderBlur.value);
      fd.append('invert',           chkInvert.checked ? 'true' : 'false');
      fd.append('use_clahe',        chkClahe.checked  ? 'true' : 'false');
      fd.append('clahe_clip',       sliderClip.value);
      fd.append('clahe_tile',       sliderTile.value);
      fd.append('max_objects',      sliderMax.value);
      const resp = await fetch(PYTHON_URL + '/api/mao-ia', { method: 'POST', body: fd, signal: _iaAbortController.signal });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      // Desplazar coordenadas si se usó ROI
      if (_selCropOriginX || _selCropOriginY) {
        (data.objects || []).forEach(obj => {
          if (obj.bbox_x       != null) obj.bbox_x       += _selCropOriginX;
          if (obj.bbox_y       != null) obj.bbox_y       += _selCropOriginY;
          if (obj.centroid_x   != null) obj.centroid_x   += _selCropOriginX;
          if (obj.centroid_y   != null) obj.centroid_y   += _selCropOriginY;
          if (obj.centroide_x  != null) obj.centroide_x  += _selCropOriginX;
          if (obj.centroide_y  != null) obj.centroide_y  += _selCropOriginY;
          if (obj.hull_centroid_x != null) obj.hull_centroid_x += _selCropOriginX;
          if (obj.hull_centroid_y != null) obj.hull_centroid_y += _selCropOriginY;
          if (Array.isArray(obj.contour_points))
            obj.contour_points = obj.contour_points.map(([x, y]) => [x + _selCropOriginX, y + _selCropOriginY]);
          if (Array.isArray(obj.hull_points))
            obj.hull_points = obj.hull_points.map(([x, y]) => [x + _selCropOriginX, y + _selCropOriginY]);
          // Campos de métricas Python que también necesitan el offset ROI
          if (obj.centroide_hull_x != null) obj.centroide_hull_x += _selCropOriginX;
          if (obj.centroide_hull_y != null) obj.centroide_hull_y += _selCropOriginY;
          if (Array.isArray(obj.punto_radio_maximo))
            obj.punto_radio_maximo = [obj.punto_radio_maximo[0] + _selCropOriginX, obj.punto_radio_maximo[1] + _selCropOriginY];
          if (Array.isArray(obj.punto_radio_minimo))
            obj.punto_radio_minimo = [obj.punto_radio_minimo[0] + _selCropOriginX, obj.punto_radio_minimo[1] + _selCropOriginY];
        });
      }
      renderResults(data);
    } catch (err) {
      showSpinner(false);
      const aborted = !!(err && err.name === 'AbortError');
      const reason  = _iaAbortController && _iaAbortController.signal.reason;
      if (inlineError) {
        inlineError.textContent  = aborted
          ? (reason === 'user'
              ? 'Análisis cancelado.'
              : '⏱️ El análisis superó el tiempo límite (120 s). Reduce el área (ROI) o el número máximo de objetos.')
          : '⚠️ Error al analizar: ' + err.message;
        inlineError.style.display = 'block';
      }
      if (placeholderEl) placeholderEl.style.display = 'flex';
    } finally {
      clearTimeout(_killTimer);
      _stopElapsed();
      _iaAbortController = null;
      btnRun.disabled    = false;
      btnRun.textContent = '\u25b6\u2002 Ejecutar an\xe1lisis';
    }
  });

  // #3 — botón Cancelar del overlay de progreso.
  const _progressCancelBtn = document.getElementById('maoIaProgressCancel');
  _progressCancelBtn && _progressCancelBtn.addEventListener('click', () => {
    if (_iaAbortController) _iaAbortController.abort('user');
  });

  // #1 — orden por columna (clic en cabecera de la tabla). renderTable y
  // _updateSortIndicators son declaraciones hoisteadas; el listener solo se
  // dispara tras el primer análisis, cuando ya hay objetos.
  (function _wireTableSort() {
    if (!viewTable) return;
    const thead = viewTable.querySelector('thead');
    if (!thead) return;
    thead.addEventListener('click', e => {
      const th = e.target.closest('th[data-sort]');
      if (!th || !maoIaLastObjects.length) return;
      const key = th.getAttribute('data-sort');
      if (_iaTableSortKey === key) _iaTableSortDir = -_iaTableSortDir;
      else { _iaTableSortKey = key; _iaTableSortDir = (key === 'conf' ? 1 : -1); }
      _updateSortIndicators();
      renderTable(maoIaLastObjects);
    });
  })();

  // #1 — filtro de triage «solo baja confianza».
  const _confFilterChk = document.getElementById('maoIaConfFilter');
  _confFilterChk && _confFilterChk.addEventListener('change', () => {
    _iaConfFilter = !!_confFilterChk.checked;
    renderTable(maoIaLastObjects);
  });

  // ── Exportar CSV ─────────────────────────────────────────────────────────
  exportCSVBtn && exportCSVBtn.addEventListener('click', async () => {
    if (!maoIaLastObjects.length) return;
    const cols = [
      ['object_id','ID'],['label','Etiqueta'],
      ['confidence_level','Confianza_nivel'],['detection_confidence','Confianza_score'],
      ['area_px','Area_px2'],['perimeter_px','Perimetro_px'],
      ['centroide_x','Cx'],['centroide_y','Cy'],
      ['circularity','Circularidad'],['solidity','Solidez'],
      ['excentricidad','Excentricidad'],['equivalent_diameter','Diam_equiv_px'],
      ['aspect_ratio','Relacion_aspecto_AR'],['compactness','Compacidad'],
      ['elongation','Elongacion'],['forma_detectada','Forma'],
      ['convex_hull_area','Hull_area_px2'],
    ];
    const header = cols.map(([, h]) => h).join(',');
    const rows   = maoIaLastObjects.map(obj =>
      cols.map(([k]) => {
        const v = obj[k];
        if (v == null) return '';
        if (typeof v === 'string') return '"' + v + '"';
        return typeof v === 'number' ? Number(v).toFixed(4) : String(v);
      }).join(',')
    );
    const csv = header + '\n' + rows.join('\n');
    try {
      if (window.electronAPI && window.electronAPI.saveFileWithDialog) {
        await window.electronAPI.saveFileWithDialog('MAO_IA_resultados.csv', csv, 'csv');
      } else {
        await navigator.clipboard.writeText(csv);
        exportCSVBtn.textContent = '\u2713 Copiado';
        setTimeout(() => { exportCSVBtn.textContent = '\u2b07 CSV'; }, 2000);
      }
    } catch (e) {}
  });

  // ── Copiar JSON ──────────────────────────────────────────────────────────
  copyJSONBtn && copyJSONBtn.addEventListener('click', async () => {
    if (!maoIaLastObjects.length) return;
    const SKIP = new Set(['contour_points','hull_points','convexity_defects']);
    const clean = maoIaLastObjects.map(o =>
      Object.fromEntries(Object.entries(o).filter(([k]) => !SKIP.has(k)))
    );
    try {
      await navigator.clipboard.writeText(JSON.stringify(clean, null, 2));
      copyJSONBtn.textContent = '\u2713 Copiado';
      setTimeout(() => { copyJSONBtn.textContent = '{} JSON'; }, 2000);
    } catch (e) {}
  });

  // ── Selector de objetos ──────────────────────────────────────────────────
  function buildMaoSelector(objects) {
    if (!selectorCards) return;
    selectorCards.innerHTML = '';
    objects.forEach(obj => {
      const color = iaColor(obj.object_id);
      const card  = document.createElement('div');
      card.dataset.id = obj.object_id;
      card.title = (obj.label || '#' + obj.object_id) + ' — ' + Math.round(obj.area_px || obj.area) + ' px²';
      card.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:20px;border:1.5px solid ' + color + ';cursor:pointer;font-size:10px;user-select:none;';
      card.innerHTML =
        '<span style="width:8px;height:8px;border-radius:50%;background:' + color + ';flex-shrink:0;"></span>' +
        '<span style="font-weight:700;color:' + color + ';">#' + obj.object_id + '</span>' +
        '<span style="color:#a0aec0;font-size:9px;">' + Math.round(obj.area_px || obj.area) + 'px²</span>';
      // #1 — chip de confianza compacto solo para objetos que merecen revisión
      // (media/baja); los de alta confianza no añaden ruido visual.
      const _cLvl = _confLevel(obj);
      if (_cLvl === 'media' || _cLvl === 'baja') {
        const _cChip = _makeConfChip(obj, true);
        if (_cChip) card.appendChild(_cChip);
      }
      card.addEventListener('click', () => {
        const id = obj.object_id;
        const yaAislado = maoIaVisible.size === 1 && maoIaVisible.has(id);
        if (yaAislado) {
          // Segundo clic en el mismo objeto: restaurar visibilidad de todos
          maoIaLastObjects.forEach(o => maoIaVisible.add(o.object_id));
          selectorCards.querySelectorAll('[data-id]').forEach(c => {
            c.style.opacity = '1'; c.style.borderStyle = 'solid';
          });
          hideDetailPanel();
          drawContoursCanvas(maoIaLastObjects);
          fitZoomToWrap();
        } else {
          // Primer clic: aislar objeto, cambiar al canvas y hacer zoom
          maoIaVisible.clear();
          maoIaVisible.add(id);
          selectorCards.querySelectorAll('[data-id]').forEach(c => {
            const isThis = c.dataset.id == id;
            c.style.opacity     = isThis ? '1'      : '0.3';
            c.style.borderStyle = isThis ? 'solid'  : 'dashed';
          });
          // Activar tab canvas para que los contornos sean visibles
          switchTab('canvas');
          drawContoursCanvas(maoIaLastObjects);
          // Mostrar panel de refinamiento
          showDetailPanel(obj);
          // Centrar y hacer zoom al objeto
          setTimeout(() => zoomToObject(obj), 30); // pequeño delay para que el DOM se actualice
        }
      });
      selectorCards.appendChild(card);
    });
    if (selectorWrap) selectorWrap.style.display = 'block';
    btnAllOn && (btnAllOn.onclick = () => {
      objects.forEach(o => {
        maoIaVisible.add(o.object_id);
        const c = selectorCards.querySelector('[data-id="' + o.object_id + '"]');
        if (c) { c.style.opacity = '1'; c.style.borderStyle = 'solid'; }
      });
      drawContoursCanvas(maoIaLastObjects);
    });
    btnAllOff && (btnAllOff.onclick = () => {
      maoIaVisible.clear();
      selectorCards.querySelectorAll('div[data-id]').forEach(c => {
        c.style.opacity = '0.3'; c.style.borderStyle = 'dashed';
      });
      drawContoursCanvas(maoIaLastObjects);
    });
  }

  // ── Dibujar contornos en canvas ──────────────────────────────────────────
  function drawContoursCanvas(objects) {
    try {
      const img = getActiveImage();
      if (!img || !cnvContornos) return;
      const iw = img.naturalWidth  || img.width;
      const ih = img.naturalHeight || img.height;
      if (!iw || !ih) return;
      const showHull  = chkHull ? chkHull.checked : true;
      const MAX_W     = 700;
      const baseScale = MAX_W / iw;
      iaCanvasNativeW        = MAX_W;
      iaCanvasNativeH        = Math.round(ih * baseScale);
      cnvContornos.width     = iaCanvasNativeW;
      cnvContornos.height    = iaCanvasNativeH;
      cnvContornos.style.width  = Math.round(iaCanvasNativeW * iaZoom) + 'px';
      cnvContornos.style.height = Math.round(iaCanvasNativeH * iaZoom) + 'px';
      if (zoomLevelEl) zoomLevelEl.textContent = Math.round(iaZoom * 100) + '%';
      const ctx = cnvContornos.getContext('2d');

      if (iaBgVisible) {
        // ── MODO CON FOTOGRAFÍA ────────────────────────────────────────────
        ctx.drawImage(img, 0, 0, iaCanvasNativeW, iaCanvasNativeH);
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(0, 0, iaCanvasNativeW, iaCanvasNativeH);
      } else {
        // ── MODO SIN FOTOGRAFÍA: fondo oscuro neutro ───────────────────────
        ctx.fillStyle = '#1e1e2e';
        ctx.fillRect(0, 0, iaCanvasNativeW, iaCanvasNativeH);
        // Cuadrícula tenue para referencia espacial
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth   = 0.5;
        const GRID = 40;
        for (let gx = 0; gx <= iaCanvasNativeW; gx += GRID) {
          ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, iaCanvasNativeH); ctx.stroke();
        }
        for (let gy = 0; gy <= iaCanvasNativeH; gy += GRID) {
          ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(iaCanvasNativeW, gy); ctx.stroke();
        }
      }

      const sx = baseScale, sy = baseScale;
      // Factor de opacidad de relleno: más visible sin foto
      const fillAlpha = iaBgVisible ? '2a' : '55';

      for (const obj of objects) {
        if (maoIaVisible.size > 0 && !maoIaVisible.has(obj.object_id)) continue;
        const c = iaColor(obj.object_id);
        if (obj.contour_points && obj.contour_points.length > 2) {
          ctx.beginPath();
          ctx.moveTo(obj.contour_points[0][0] * sx, obj.contour_points[0][1] * sy);
          for (const [px, py] of obj.contour_points.slice(1)) ctx.lineTo(px * sx, py * sy);
          ctx.closePath();
          ctx.fillStyle   = c + fillAlpha; ctx.fill();
          ctx.strokeStyle = c;
          ctx.lineWidth   = iaBgVisible ? 1.5 : 2.0;
          ctx.setLineDash([]); ctx.stroke();
        }
        if (showHull && obj.hull_points && obj.hull_points.length > 2) {
          ctx.beginPath();
          ctx.moveTo(obj.hull_points[0][0] * sx, obj.hull_points[0][1] * sy);
          for (const [px, py] of obj.hull_points.slice(1)) ctx.lineTo(px * sx, py * sy);
          ctx.closePath();
          ctx.strokeStyle = '#f6820d';
          ctx.lineWidth   = iaBgVisible ? 1.8 : 2.2;
          ctx.setLineDash([5, 3]); ctx.stroke();
          ctx.setLineDash([]);
        }
        if (obj.centroid_x != null) {
          const cx = obj.centroid_x * sx, cy = obj.centroid_y * sy, arm = 8, r = 4;
          const shadowColor = iaBgVisible ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.7)';
          ctx.strokeStyle = shadowColor; ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(cx - arm, cy); ctx.lineTo(cx + arm, cy);
          ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy + arm);
          ctx.stroke();
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = c; ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(cx - arm, cy); ctx.lineTo(cx + arm, cy);
          ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy + arm);
          ctx.stroke();
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        }
        if (showHull && obj.hull_centroid_x != null) {
          const hx = obj.hull_centroid_x * sx, hy = obj.hull_centroid_y * sy, d = 5;
          const shadowColor = iaBgVisible ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.7)';
          ctx.strokeStyle = shadowColor; ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(hx, hy - d); ctx.lineTo(hx + d, hy);
          ctx.lineTo(hx, hy + d); ctx.lineTo(hx - d, hy);
          ctx.closePath(); ctx.stroke();
          ctx.strokeStyle = '#f6820d'; ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(hx, hy - d); ctx.lineTo(hx + d, hy);
          ctx.lineTo(hx, hy + d); ctx.lineTo(hx - d, hy);
          ctx.closePath(); ctx.stroke();
        }
        if (obj.label && obj.bbox_x != null) {
          const lx = obj.bbox_x * sx, ly = Math.max(obj.bbox_y * sy - 3, 12);
          ctx.font = 'bold 11px sans-serif';
          // Sombra más opaca en modo sin foto para legibilidad
          ctx.fillStyle = iaBgVisible ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.85)';
          ctx.fillText(obj.label, lx + 3, ly + 1);
          ctx.fillStyle = c;
          ctx.fillText(obj.label, lx + 2, ly);
        }
      }
      // ── Anillo de foco sobre el contorno activo ─────────────────────────
      if (iaFocusedId != null) {
        const fobj = objects.find(o => o.object_id === iaFocusedId);
        if (fobj && fobj.contour_points && fobj.contour_points.length > 2) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(fobj.contour_points[0][0] * sx, fobj.contour_points[0][1] * sy);
          for (const [px, py] of fobj.contour_points.slice(1)) ctx.lineTo(px * sx, py * sy);
          ctx.closePath();
          // Halo exterior
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur  = 16;
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth   = 3;
          ctx.setLineDash([]);
          ctx.stroke();
          // Borde interno blanco fino para contraste
          ctx.shadowBlur  = 0;
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth   = 1.2;
          ctx.stroke();
          ctx.restore();
        }
        if (focusLegendEl) focusLegendEl.style.display = '';
      } else {
        if (focusLegendEl) focusLegendEl.style.display = 'none';
      }

      cnvContornos.style.display = 'block';
      if (cnvLegend) {
        cnvLegend.style.display = 'flex';
        cnvLegend.querySelectorAll('.mao-hull-legend').forEach(el => {
          el.style.display = showHull ? '' : 'none';
        });
      }
      // Actualizar el color del canvas wrap según el modo
      if (canvasWrap) {
        canvasWrap.style.background = iaBgVisible ? '#1e1e2e' : '#0d0d1a';
      }
    } catch (e) { console.warn('maoIa canvas error:', e); }
  }

  chkHull && chkHull.addEventListener('change', () => drawContoursCanvas(maoIaLastObjects));

  // ── Selección de contorno por clic en canvas ────────────────────────────────

  /** Ray-casting point-in-polygon (coordenadas nativas del canvas ya escaladas) */
  function _pointInPolygon(pts, px, py) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1];
      const xj = pts[j][0], yj = pts[j][1];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
        inside = !inside;
    }
    return inside;
  }

  /** Devuelve el objeto cuyo contorno fue tocado en coordenadas nativas del canvas */
  function _hitTestCanvas(nativeX, nativeY) {
    if (!maoIaLastObjects.length || !iaCanvasNativeW) return null;
    const img = getActiveImage();
    if (!img) return null;
    const iw = img.naturalWidth || img.width;
    const baseScale = iaCanvasNativeW / iw;
    for (let i = maoIaLastObjects.length - 1; i >= 0; i--) {
      const obj = maoIaLastObjects[i];
      if (maoIaVisible.size > 0 && !maoIaVisible.has(obj.object_id)) continue;
      const bx = (obj.bbox_x || 0) * baseScale;
      const by = (obj.bbox_y || 0) * baseScale;
      const bw = Math.max(1, (obj.bbox_w || 0) * baseScale);
      const bh = Math.max(1, (obj.bbox_h || 0) * baseScale);
      if (nativeX < bx || nativeX > bx + bw || nativeY < by || nativeY > by + bh) continue;
      if (obj.contour_points && obj.contour_points.length > 2) {
        const scaled = obj.contour_points.map(([px, py]) => [px * baseScale, py * baseScale]);
        if (_pointInPolygon(scaled, nativeX, nativeY)) return obj;
      } else {
        return obj; // solo bbox
      }
    }
    return null;
  }

  /** Activa/desactiva el botón ⋙ Centrar según si hay foco */
  function _syncCenterBtn() {
    if (!centerFocusBtn) return;
    const active = iaFocusedId != null;
    centerFocusBtn.style.opacity       = active ? '1'       : '0.4';
    centerFocusBtn.style.pointerEvents = active ? 'auto'    : 'none';
    centerFocusBtn.style.background    = active ? '#fff9e6' : '#fff';
    centerFocusBtn.style.borderColor   = active ? '#f59e0b' : '#cbd5e0';
    centerFocusBtn.style.color         = active ? '#92600a' : '#2d3748';
  }

  /** Fija el contorno activo y hace zoom al mismo */
  function _setFocused(obj) {
    iaFocusedId = obj ? obj.object_id : null;
    _syncCenterBtn();
    drawContoursCanvas(maoIaLastObjects);
    if (obj) zoomToObject(obj);
    // Resaltar card del selector
    if (selectorCards) {
      selectorCards.querySelectorAll('[data-id]').forEach(c => {
        c.style.outline = (obj && c.dataset.id == obj.object_id) ? '2px solid #f59e0b' : '';
      });
    }
  }

  // Clic en canvas: detectar contorno y centrar
  cnvContornos && cnvContornos.addEventListener('click', e => {
    if (!maoIaLastObjects.length || !iaCanvasNativeW) return;
    const rect  = cnvContornos.getBoundingClientRect();
    const nativeX = (e.clientX - rect.left)  / iaZoom;
    const nativeY = (e.clientY - rect.top)   / iaZoom;
    const hit = _hitTestCanvas(nativeX, nativeY);
    _setFocused(hit || null);
  });

  // Cursor: pointer al pasar sobre un contorno, crosshair en zona vacía
  cnvContornos && cnvContornos.addEventListener('mousemove', e => {
    if (!maoIaLastObjects.length || !iaCanvasNativeW) return;
    const rect  = cnvContornos.getBoundingClientRect();
    const nativeX = (e.clientX - rect.left)  / iaZoom;
    const nativeY = (e.clientY - rect.top)   / iaZoom;
    cnvContornos.style.cursor = _hitTestCanvas(nativeX, nativeY) ? 'pointer' : 'crosshair';
  });
  cnvContornos && cnvContornos.addEventListener('mouseleave', () => {
    if (cnvContornos) cnvContornos.style.cursor = 'grab';
  });

  // Botón Centrar
  centerFocusBtn && centerFocusBtn.addEventListener('click', () => {
    if (iaFocusedId == null) return;
    const obj = maoIaLastObjects.find(o => o.object_id === iaFocusedId);
    if (obj) zoomToObject(obj);
  });

  // ── Panel de refinamiento por objeto ─────────────────────────────────────
  let _detailObj = null;

  detailThreshold && detailThreshold.addEventListener('change', () => {
    if (detailManualRow)
      detailManualRow.style.display = detailThreshold.value === 'manual' ? 'flex' : 'none';
  });
  detailThreshSlider && detailThreshSlider.addEventListener('input', () => {
    if (detailThreshDisp) detailThreshDisp.textContent = detailThreshSlider.value;
  });
  detailBlurSlider && detailBlurSlider.addEventListener('input', () => {
    if (detailBlurDisp) detailBlurDisp.textContent = detailBlurSlider.value;
  });

  /** Blob del recorte del bbox del objeto (+ padding) con coordenadas de origen adjuntas */
  function getDetailCropBlob(obj, padFrac) {
    return new Promise((resolve, reject) => {
      try {
        const img = getActiveImage();
        if (!img) { reject(new Error('Sin imagen')); return; }
        padFrac = padFrac || 0.15;
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        const bx   = obj.bbox_x || 0;
        const by   = obj.bbox_y || 0;
        const bw   = obj.bbox_w || 60;
        const bh   = obj.bbox_h || 60;
        const padX = Math.round(bw * padFrac);
        const padY = Math.round(bh * padFrac);
        const cropX = Math.max(0, bx - padX);
        const cropY = Math.max(0, by - padY);
        const cropW = Math.min(iw - cropX, bw + 2 * padX);
        const cropH = Math.min(ih - cropY, bh + 2 * padY);
        const tmp = document.createElement('canvas');
        tmp.width  = cropW;
        tmp.height = cropH;
        tmp.getContext('2d').drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        tmp.toBlob(blob => {
          if (blob) { blob._cropX = cropX; blob._cropY = cropY; resolve(blob); }
          else reject(new Error('toBlob falló'));
        }, 'image/jpeg', 0.95);
      } catch (e) { reject(e); }
    });
  }

  /** Dibuja en detailCanvas el recorte del objeto con el contorno superpuesto */
  function drawDetailCanvas(obj) {
    if (!detailCanvas || !obj) return;
    try {
      const img = getActiveImage();
      if (!img) return;
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      const padFrac = 0.15;
      const bx   = obj.bbox_x || 0,  by   = obj.bbox_y || 0;
      const bw   = obj.bbox_w || 60, bh   = obj.bbox_h || 60;
      const padX = Math.round(bw * padFrac), padY = Math.round(bh * padFrac);
      const cropX = Math.max(0, bx - padX),  cropY = Math.max(0, by - padY);
      const cropW = Math.min(iw - cropX, bw + 2 * padX);
      const cropH = Math.min(ih - cropY, bh + 2 * padY);
      const maxW  = 190;
      const scale = Math.min(1, maxW / cropW);
      const dw = Math.round(cropW * scale);
      const dh = Math.round(cropH * scale);
      detailCanvas.width  = dw;
      detailCanvas.height = dh;
      const ctx = detailCanvas.getContext('2d');
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, dw, dh);
      const col = iaColor(obj.object_id);
      const sx = scale, sy = scale;
      if (obj.contour_points && obj.contour_points.length > 2) {
        ctx.beginPath();
        ctx.moveTo((obj.contour_points[0][0] - cropX) * sx, (obj.contour_points[0][1] - cropY) * sy);
        for (const [px, py] of obj.contour_points.slice(1))
          ctx.lineTo((px - cropX) * sx, (py - cropY) * sy);
        ctx.closePath();
        ctx.fillStyle = col + '2a'; ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.stroke();
      }
      if (obj.hull_points && chkHull && chkHull.checked && obj.hull_points.length > 2) {
        ctx.beginPath();
        ctx.moveTo((obj.hull_points[0][0] - cropX) * sx, (obj.hull_points[0][1] - cropY) * sy);
        for (const [px, py] of obj.hull_points.slice(1))
          ctx.lineTo((px - cropX) * sx, (py - cropY) * sy);
        ctx.closePath();
        ctx.strokeStyle = '#f6820d'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (obj.centroid_x != null) {
        const cx = (obj.centroid_x - cropX) * sx, cy = (obj.centroid_y - cropY) * sy, arm = 6;
        ctx.strokeStyle = col; ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx - arm, cy); ctx.lineTo(cx + arm, cy);
        ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy + arm);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.stroke();
      }
    } catch (e) { console.warn('drawDetailCanvas:', e); }
  }

  /** Muestra el panel de refinamiento para un objeto */
  function showDetailPanel(obj) {
    if (!detailPanel) return;
    _detailObj = obj;
    // Sincronizar controles con los del panel principal
    if (detailThreshold && selThreshold) detailThreshold.value = selThreshold.value;
    const thMode = detailThreshold ? detailThreshold.value : 'manual';
    if (detailManualRow) detailManualRow.style.display = thMode === 'manual' ? 'flex' : 'none';
    if (detailThreshSlider && sliderThresh) {
      detailThreshSlider.value = sliderThresh.value;
      if (detailThreshDisp) detailThreshDisp.textContent = sliderThresh.value;
    }
    if (detailBlurSlider && sliderBlur) {
      detailBlurSlider.value = sliderBlur.value;
      if (detailBlurDisp) detailBlurDisp.textContent = sliderBlur.value;
    }
    if (detailInvert && chkInvert) detailInvert.checked = chkInvert.checked;
    if (detailClahe  && chkClahe)  detailClahe.checked  = chkClahe.checked;
    const col = iaColor(obj.object_id);
    if (detailTitle)
      detailTitle.innerHTML = 'Refinamiento &middot; <span style="color:' + col + ';">' +
        (obj.label || '#' + obj.object_id) + '</span>';
    detailPanel.style.display = 'block';
    drawDetailCanvas(obj);
  }

  /** Oculta el panel de refinamiento */
  function hideDetailPanel() {
    if (detailPanel) detailPanel.style.display = 'none';
    _detailObj = null;
  }

  // Botón cerrar: oculta el panel y restaura visibilidad total
  detailClose && detailClose.addEventListener('click', () => {
    hideDetailPanel();
    if (maoIaVisible.size === 1) {
      maoIaLastObjects.forEach(o => maoIaVisible.add(o.object_id));
      selectorCards && selectorCards.querySelectorAll('[data-id]').forEach(c => {
        c.style.opacity = '1'; c.style.borderStyle = 'solid';
      });
      drawContoursCanvas(maoIaLastObjects);
      fitZoomToWrap();
    }
  });

  // ── Re-detectar contorno del objeto aislado ──────────────────────────────
  detailRunBtn && detailRunBtn.addEventListener('click', async () => {
    if (!_detailObj) return;
    const obj = _detailObj;
    detailRunBtn.disabled = true;
    if (detailSpinner) detailSpinner.style.display = 'flex';
    try {
      const blob  = await getDetailCropBlob(obj, 0.15);
      const cropX = blob._cropX || 0;
      const cropY = blob._cropY || 0;
      const fd = new FormData();
      fd.append('image',            blob, 'crop.jpg');
      fd.append('threshold_method', detailThreshold ? detailThreshold.value : 'manual');
      fd.append('threshold_value',  detailThreshSlider ? detailThreshSlider.value : '127');
      fd.append('min_area',         '50');
      fd.append('blur_kernel',      detailBlurSlider ? detailBlurSlider.value : '7');
      fd.append('invert',           detailInvert && detailInvert.checked ? 'true' : 'false');
      fd.append('use_clahe',        detailClahe  && detailClahe.checked  ? 'true' : 'false');
      fd.append('clahe_clip',       sliderClip ? sliderClip.value : '2');
      fd.append('clahe_tile',       sliderTile ? sliderTile.value : '8');
      fd.append('max_objects',      '1');
      const resp = await fetch(PYTHON_URL + '/api/mao-ia', { method: 'POST', body: fd, signal: AbortSignal.timeout(120_000) });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      if (!data.objects || !data.objects.length) throw new Error('Sin objetos detectados con esos parámetros');
      const fresh = data.objects[0];
      // Trasladar coordenadas al espacio de la imagen completa
      fresh.bbox_x = (fresh.bbox_x || 0) + cropX;
      fresh.bbox_y = (fresh.bbox_y || 0) + cropY;
      if (fresh.centroid_x      != null) fresh.centroid_x      += cropX;
      if (fresh.centroid_y      != null) fresh.centroid_y      += cropY;
      if (fresh.centroide_x     != null) fresh.centroide_x     += cropX;
      if (fresh.centroide_y     != null) fresh.centroide_y     += cropY;
      if (fresh.hull_centroid_x != null) fresh.hull_centroid_x += cropX;
      if (fresh.hull_centroid_y != null) fresh.hull_centroid_y += cropY;
      if (Array.isArray(fresh.contour_points))
        fresh.contour_points = fresh.contour_points.map(([x, y]) => [x + cropX, y + cropY]);
      if (Array.isArray(fresh.hull_points))
        fresh.hull_points = fresh.hull_points.map(([x, y]) => [x + cropX, y + cropY]);
      if (fresh.centroide_hull_x != null) fresh.centroide_hull_x += cropX;
      if (fresh.centroide_hull_y != null) fresh.centroide_hull_y += cropY;
      if (Array.isArray(fresh.punto_radio_maximo))
        fresh.punto_radio_maximo = [fresh.punto_radio_maximo[0] + cropX, fresh.punto_radio_maximo[1] + cropY];
      if (Array.isArray(fresh.punto_radio_minimo))
        fresh.punto_radio_minimo = [fresh.punto_radio_minimo[0] + cropX, fresh.punto_radio_minimo[1] + cropY];
      // Conservar identidad del objeto original
      fresh.object_id = obj.object_id;
      fresh.label     = obj.label || fresh.label;
      // Actualizar en el array global y redibujar
      const idx = maoIaLastObjects.findIndex(o => o.object_id === obj.object_id);
      if (idx >= 0) maoIaLastObjects[idx] = fresh;
      _detailObj = fresh;
      drawDetailCanvas(fresh);
      drawContoursCanvas(maoIaLastObjects);
      renderTable(maoIaLastObjects);
      renderCards(maoIaLastObjects);
    } catch (err) {
      toast.error('Re-detección fallida: ' + err.message);
    } finally {
      detailRunBtn.disabled = false;
      if (detailSpinner) detailSpinner.style.display = 'none';
    }
  });
  // \u2500\u2500 #1: orden + filtro de triage de la tabla \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function _sortVal(obj, key) {
    switch (key) {
      case 'id':        return obj.object_id;
      case 'conf':      return _confScore(obj);
      case 'area':      return obj.area_px != null ? obj.area_px : obj.area;
      case 'perimeter': return obj.perimeter_px != null ? obj.perimeter_px : obj.perimeter;
      case 'cx':        return obj.centroide_x != null ? obj.centroide_x : obj.centroid_x;
      case 'cy':        return obj.centroide_y != null ? obj.centroide_y : obj.centroid_y;
      case 'circ':      return obj.circularity;
      case 'solidity':  return obj.solidity;
      case 'exc':       return obj.excentricidad;
      case 'eqd':       return obj.equivalent_diameter;
      case 'forma':     return obj.forma_detectada_mostrada || obj.forma_detectada || '';
      default:          return null;
    }
  }
  function _tableViewObjects() {
    let arr = maoIaLastObjects.slice();
    if (_iaConfFilter) arr = arr.filter(o => _confLevel(o) === 'baja');
    if (_iaTableSortKey) {
      const k = _iaTableSortKey, dir = _iaTableSortDir;
      arr.sort((a, b) => {
        let va = _sortVal(a, k), vb = _sortVal(b, k);
        if (typeof va === 'string' || typeof vb === 'string') {
          return dir * String(va == null ? '' : va).localeCompare(String(vb == null ? '' : vb));
        }
        if (va == null) va = -Infinity;
        if (vb == null) vb = -Infinity;
        return dir * (va - vb);
      });
    }
    return arr;
  }
  function _updateSortIndicators() {
    if (!viewTable) return;
    viewTable.querySelectorAll('th[data-sort]').forEach(th => {
      const base = th.getAttribute('data-label') ||
                   th.textContent.replace(/\s*[\u25b2\u25bc]\s*$/, '').trim();
      th.setAttribute('data-label', base);
      const active = th.getAttribute('data-sort') === _iaTableSortKey;
      th.innerHTML = base + (active ? (_iaTableSortDir === 1 ? ' \u25b2' : ' \u25bc') : '');
    });
  }
  function _renderConfSummary(objects) {
    const el = document.getElementById('maoIaConfSummary');
    if (!el) return;
    const c = _confCounts(objects);
    if (!objects || !objects.length || (c.alta + c.media + c.baja) === 0) {
      el.style.display = 'none'; el.innerHTML = ''; return;
    }
    el.style.display = 'inline-flex';
    el.innerHTML = '';
    const MO = window.MaoOrganizer;
    const mk = (mod, txt) => {
      const s = document.createElement('span');
      if (MO && MO.setChip) MO.setChip(s, mod, txt);
      else { s.className = 'laar-chip laar-chip--' + mod; s.textContent = txt; }
      s.style.fontSize = '8.5px'; s.style.padding = '1px 7px';
      return s;
    };
    if (c.alta)  el.appendChild(mk('ok',   c.alta + ' alta'));
    if (c.media) el.appendChild(mk('none', c.media + ' media'));
    if (c.baja)  el.appendChild(mk('wa',   c.baja + ' baja \u00b7 revisar'));
  }
  function _updateConfFilterCount() {
    const el = document.getElementById('maoIaConfFilterCount');
    if (!el) return;
    const c = _confCounts(maoIaLastObjects);
    el.textContent = c.baja
      ? (c.baja + ' de ' + maoIaLastObjects.length + ' por revisar')
      : 'Sin objetos de baja confianza';
  }

  function renderTable(objects) {
    if (!tableBody) return;
    const fmt = (v, d) => { d = d == null ? 2 : d; return v == null ? '\u2014' : Number(v).toFixed(d); };
    const view = _tableViewObjects();           // #1 — orden + filtro de triage
    if (!view.length && _iaConfFilter) {
      tableBody.innerHTML = '<tr><td colspan="12" style="padding:14px;text-align:center;color:#718096;">Ning\u00fan objeto de baja confianza. Desactiva el filtro para ver todos.</td></tr>';
      _updateSortIndicators();
      return;
    }
    tableBody.innerHTML = view.map(function(obj, i) {
      const color = iaColor(obj.object_id);
      const bg    = i % 2 ? '#faf9ff' : '#fff';
      const circ  = Number(obj.circularity || 0);
      const circW = Math.round(circ * 100);
      const formaMostrada = obj.forma_detectada_mostrada ||
        ((obj.forma_tipologica_inferida && obj.forma_requiere_reinterpretacion_tipologica)
          ? (obj.forma_tipologica_inferida || obj.forma_detectada_tipologica)
          : obj.forma_detectada);
      const forma = formaMostrada
        ? '<span style="font-size:9px;background:' + color + '18;color:' + color + ';border:1px solid ' + color + '40;border-radius:10px;padding:1px 7px;font-weight:600;">' + formaMostrada + '</span>'
        : '\u2014';
      return '<tr style="background:' + bg + ';border-bottom:1px solid #f0edff;">' +
        '<td style="padding:6px 10px;white-space:nowrap;">' +
          '<span style="display:inline-flex;align-items:center;gap:5px;">' +
            '<span style="width:9px;height:9px;border-radius:50%;background:' + color + ';display:inline-block;flex-shrink:0;"></span>' +
            '<span style="font-weight:700;color:' + color + ';">' + (obj.label || '#' + obj.object_id) + '</span>' +
          '</span>' +
        '</td>' +
        '<td style="padding:6px 10px;white-space:nowrap;">' + _confChipHTML(obj) + '</td>' +
        '<td style="padding:6px 10px;text-align:right;font-weight:600;">' + fmt(obj.area_px || obj.area, 0) + '</td>' +
        '<td style="padding:6px 10px;text-align:right;">' + fmt(obj.perimeter_px || obj.perimeter, 1) + '</td>' +
        '<td style="padding:6px 10px;text-align:right;">' + fmt(obj.centroide_x != null ? obj.centroide_x : obj.centroid_x, 1) + '</td>' +
        '<td style="padding:6px 10px;text-align:right;">' + fmt(obj.centroide_y != null ? obj.centroide_y : obj.centroid_y, 1) + '</td>' +
        '<td style="padding:6px 10px;text-align:right;">' +
          '<span style="display:inline-flex;align-items:center;gap:4px;">' +
            '<span>' + fmt(circ, 3) + '</span>' +
            '<span style="flex:1;height:4px;background:#e2e8f0;border-radius:2px;overflow:hidden;min-width:28px;display:inline-block;">' +
              '<span style="display:block;height:100%;width:' + circW + '%;background:' + color + ';border-radius:2px;"></span>' +
            '</span>' +
          '</span>' +
        '</td>' +
        '<td style="padding:6px 10px;text-align:right;">' + fmt(obj.solidity, 3) + '</td>' +
        '<td style="padding:6px 10px;text-align:right;">' + fmt(obj.excentricidad, 3) + '</td>' +
        '<td style="padding:6px 10px;text-align:right;">' + fmt(obj.equivalent_diameter, 1) + '</td>' +
        '<td style="padding:6px 10px;">' + forma + '</td>' +
        '<td style="padding:6px 10px;">' +
          '<button onclick="window._showMaoMetrics(' + obj.object_id + ')" ' +
            'style="font-size:9px;padding:2px 8px;background:#6f42c1;color:#fff;border:none;border-radius:4px;cursor:pointer;white-space:nowrap;margin-right:4px;">' +
            'Ver +' +
          '</button>' +
          '<button onclick="window._usarEnAnalisisMorfologico(' + obj.object_id + ', this)" ' +
            'style="font-size:9px;padding:2px 8px;background:#2b6cb0;color:#fff;border:none;border-radius:4px;cursor:pointer;white-space:nowrap;">' +
            '\u2713 Generar tarjeta' +
          '</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  // ── Renderizar fichas ─────────────────────────────────────────────────────
  function renderCards(objects) {
    if (!resultBody) return;
    const fmt = (v, d) => { d = d == null ? 2 : d; return v == null ? '\u2014' : Number(v).toFixed(d); };
    resultBody.innerHTML = objects.map(obj => {
      const color    = iaColor(obj.object_id);
      const def      = obj.convexity_defects || {};
      const nDef     = def.num_defectos || 0;
      const defColor = nDef === 0 ? '#276749' : nDef < 3 ? '#744210' : '#9b2c2c';
      const circPct  = Math.round((obj.circularity || 0) * 100);
      const formaMostrada = obj.forma_detectada_mostrada ||
        ((obj.forma_tipologica_inferida && obj.forma_requiere_reinterpretacion_tipologica)
          ? (obj.forma_tipologica_inferida || obj.forma_detectada_tipologica)
          : obj.forma_detectada);
      const formaTag = formaMostrada
        ? '<span style="font-size:9px;background:' + color + '18;color:' + color + ';border:1px solid ' + color + '40;border-radius:10px;padding:1px 7px;font-weight:600;">' + formaMostrada + '</span>'
        : '';
      const cx = obj.centroide_x != null ? obj.centroide_x : obj.centroid_x;
      const cy = obj.centroide_y != null ? obj.centroide_y : obj.centroid_y;
      return '<div style="border:1.5px solid ' + color + '30;border-left:3px solid ' + color + ';border-radius:6px;padding:8px 10px;margin-bottom:7px;background:#fafafa;">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">' +
          '<span style="width:9px;height:9px;border-radius:50%;background:' + color + ';flex-shrink:0;display:inline-block;"></span>' +
          '<span style="font-weight:700;color:' + color + ';font-size:11px;">' + (obj.label || '#' + obj.object_id) + '</span>' +
          formaTag +
          '<span style="font-size:9px;color:#a0aec0;margin-left:auto;">' + (obj.contour_points ? obj.contour_points.length + ' pts' : '') + '</span>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;font-size:10px;">' +
          '<span style="color:#718096;">Área</span><span style="font-weight:600;">' + fmt(obj.area_px || obj.area, 0) + ' px²</span>' +
          '<span style="color:#718096;">Perímetro</span><span style="font-weight:600;">' + fmt(obj.perimeter_px || obj.perimeter, 1) + '</span>' +
          '<span style="color:#718096;">Centroide</span><span style="font-weight:600;">(' + fmt(cx, 1) + ', ' + fmt(cy, 1) + ')</span>' +
          '<span style="color:#718096;">Circularidad</span>' +
          '<span style="font-weight:600;display:flex;align-items:center;gap:3px;">' +
            fmt(obj.circularity, 3) +
            '<span style="flex:1;height:4px;background:#e2e8f0;border-radius:2px;overflow:hidden;min-width:30px;">' +
              '<span style="display:block;height:100%;width:' + circPct + '%;background:' + color + ';border-radius:2px;"></span>' +
            '</span>' +
          '</span>' +
          '<span style="color:#718096;">Solidez</span><span style="font-weight:600;">' + fmt(obj.solidity, 3) + '</span>' +
          '<span style="color:#718096;">Excentricidad</span><span style="font-weight:600;">' + fmt(obj.excentricidad, 3) + '</span>' +
          '<span style="color:#718096;">Feret ratio</span><span style="font-weight:600;">' + fmt(obj.feret_ratio, 3) + '</span>' +
          '<span style="color:#718096;">Simetría bil.</span><span style="font-weight:600;">' + fmt(obj.simetria_bilateral, 3) + '</span>' +
          '<span style="color:#718096;">Def. conv.</span>' +
          '<span style="font-weight:600;color:' + defColor + ';">' + nDef +
            '<span style="font-weight:400;color:#a0aec0;"> (max ' + (def.profundidad_max_px || 0) + ' px)</span>' +
          '</span>' +
        '</div>' +
        '<div style="margin-top:6px;display:flex;gap:5px;justify-content:flex-end;">' +
          '<button onclick="window._showMaoMetrics(' + obj.object_id + ')" ' +
            'style="font-size:9px;padding:3px 10px;background:#6f42c1;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600;">' +
            'Ver métricas (' + (obj._metricsCount || '…') + ')' +
          '</button>' +
          '<button onclick="window._usarEnAnalisisMorfologico(' + obj.object_id + ', this)" ' +
            'style="font-size:9px;padding:3px 10px;background:#2b6cb0;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:700;letter-spacing:0.2px;">' +
            '\u2713 Generar tarjeta de objeto' +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }
  // ── Exportar objeto al análisis morfológico principal ──────────────────
  async function exportarAAnalisisMorfologico(id) {
    const maoObj = maoIaLastObjects.find(o => o.object_id === id);
    if (!maoObj) return;
    if (typeof window.mostrarAnalisisMorfologico !== 'function') {
      toast.error('El módulo de análisis morfológico no está disponible en esta pantalla.');
      return;
    }

    const imagen     = getActiveImage();
    const scalePxMm  = callGetter('_maoGetScale');   // mm/px ó null
    const modo       = callGetter('_maoGetModo') || 'monofacial';

    // ── Nombre heredado desde "Identificación del objeto" ────────────────────
    const identif    = callGetter('_maoGetIdentificacion');
    // Sólo usar el nombre si la identificación está bloqueada (el usuario pulsó "Asignar")
    const nombreBase = (identif && identif.bloqueada && identif.valor) ? identif.valor : null;
    const numPad     = String(id).padStart(3, '0');
    // Sanitizar: sustituir caracteres problemáticos en el ID de archivo/DOM
    const nombreSafe = nombreBase ? nombreBase.replace(/[^a-zA-Z0-9À-ÿ._-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') : null;
    // En bifacial, incluir la cara en el ID para que Cara A y Cara B
    // no colisionen en el array `objects` ni en la deduplicación de tarjetas.
    const caraSufx   = modo === 'bifacial' ? ('_Cara' + selectedFace) : '';
    const objId      = (nombreSafe ? nombreSafe + '_IA_' + numPad : 'IAobj_' + numPad) + caraSufx;
    const objLabel   = (nombreBase ? nombreBase + ' — obj. IA #' + id : (maoObj.label || 'Obj. IA #' + id))
                       + (modo === 'bifacial' ? ' (Cara ' + selectedFace + ')' : '');

    // ── bbox ─────────────────────────────────────────────────────────────────
    const bx = Math.round(maoObj.bbox_x || 0);
    const by = Math.round(maoObj.bbox_y || 0);
    const bw = Math.round(maoObj.bbox_w || maoObj.width  || 100);
    const bh = Math.round(maoObj.bbox_h || maoObj.height || 100);

    // ── centroide ─────────────────────────────────────────────────────────────
    // Prioridad: campos de _morpho_from_contour (centroid_x/hull_centroid_x) que sí reciben
    // el offset ROI, sobre los campos de metrics.calculate (centroide_x/centroide_hull_x)
    // que pueden llegar en coordenadas relativas al crop si se usó ROI.
    const cx  = maoObj.centroid_x    != null ? maoObj.centroid_x    : (maoObj.centroide_x  != null ? maoObj.centroide_x  : 0);
    const cy  = maoObj.centroid_y    != null ? maoObj.centroid_y    : (maoObj.centroide_y  != null ? maoObj.centroide_y  : 0);
    const hcx = maoObj.hull_centroid_x || maoObj.centroide_hull_x || cx;
    const hcy = maoObj.hull_centroid_y || maoObj.centroide_hull_y || cy;

    // ── escala ────────────────────────────────────────────────────────────────
    const s   = scalePxMm;
    const aU  = s ? 'mm\u00b2' : 'px\u00b2';
    const pU  = s ? 'mm'       : 'px';

    // Áreas: hull = forma completa, fragmentada = contorno real
    // metrics.calculate() (sc=0) → area_px=hull, area_fragmentada_px=fragmento real
    const hullAreaPx  = maoObj.area_px || maoObj.area || (bw * bh);
    const fragAreaPx  = maoObj.area_fragmentada_px || maoObj.area_fragmentada || hullAreaPx;
    const perimHullPx = maoObj.perimeter_px || maoObj.perimeter || 0;
    const perimFragPx = maoObj.perimeter_fragmentado_px || maoObj.perimeter_fragmentado || perimHullPx;

    const areaComp   = s ? hullAreaPx  * s * s : hullAreaPx;   // forma completa (hull)
    const areaFrag   = s ? fragAreaPx  * s * s : fragAreaPx;   // fragmento real
    const perim      = s ? perimHullPx * s     : perimHullPx;  // perímetro hull
    const perimFrag  = s ? perimFragPx * s     : perimFragPx;  // perímetro fragmento

    const convScale  = (v, d) => v == null ? null : +Number(s ? v * s : v).toFixed(d);

    // ── solidez clase ──────────────────────────────────────────────────────────
    const sol      = maoObj.solidity || 0;
    const solClass = maoObj.solidity_class ||
      (sol >= 0.90 ? 'Completo' : sol >= 0.75 ? 'Casi completo' :
       sol >= 0.55 ? 'Parcial'  : 'Muy fragmentado');

    // ── circularidad → clase ──────────────────────────────────────────────────
    const cir      = maoObj.circularity || 0;
    const cirClass = cir >= 0.90 ? 'Circular' : cir >= 0.70 ? 'Subcircular' :
                     cir >= 0.50 ? 'Elipsoidal' : cir >= 0.30 ? 'Irregular' : 'Muy irregular';

    // ── objeto compatible con mostrarAnalisisMorfologico ──────────────────────
    const objMorf = {
      id:              objId,
      nombreObjeto:    objLabel,
      numeroObjeto:    id,
      cara:            modo === 'bifacial' ? selectedFace : null,
      tipo:            modo,
      minX: bx, minY: by, width: bw, height: bh,
      area:            hullAreaPx,
      contour_points:  maoObj.contour_points  || [],
      has_real_contour: !!(maoObj.contour_points && maoObj.contour_points.length > 2),
      // Convertir hull_points de Python (absolutas) a coordenadas RELATIVAS al bbox.
      // El código de dibujo morfológico / esquemático asume coords relativas cuando
      // _hullIsAbsolute no está definido (hullOffset = 0 en esos paths).
      convexHull: (maoObj.hull_points && maoObj.hull_points.length >= 3)
        ? maoObj.hull_points.map(([x, y]) => [x - bx, y - by])
        : null,
      // _hullIsAbsolute NO se define → el dibujo usa coords relativas tal cual (sin sumar offset)
      perforaciones:   [],
      horadaciones:    [],
      // El contorno AIA ya es el contorno definitivo (red neuronal);
      // marca para que analizarObjetoMorfologicamente NO lo re-extraiga con /api/contour.
      _samSegmented:   true,
    };

    // Campos que se excluyen del pass-through porque los sobreescribimos con conversión.
    // Python llama metrics.calculate() con scale_px_mm=0 → los campos SIN sufijo _px
    // coinciden en valor con los que tienen _px (ambos en píxeles). Los excluimos todos
    // para recalcularlos con la escala real del proyecto.
    const SKIP_PASSTHROUGH = new Set([
      'contour_points','hull_points','convexity_defects','_metricsCount',
      // centroide (ambas convenciones de nombre)
      'centroid_x','centroid_y','hull_centroid_x','hull_centroid_y',
      'centroide_x','centroide_y','centroide_hull_x','centroide_hull_y',
      // área/perímetro
      'area','perimeter','area_fragmentada','perimeter_fragmentado',
      'area_px','perimeter_px','area_fragmentada_px','perimeter_fragmentado_px',
      'area_unit','perimeter_unit',
      // bounding box en mm (con sc=0 están en px, los dejamos sólo en las _px del pass-through)
      'width','height',
      // ejes: todas las variantes
      'eje_mayor','eje_menor',
      'eje_mayor_px','eje_menor_px',
      'eje_mayor_real_longitud','eje_menor_real_longitud',
      'eje_mayor_real_longitud_px','eje_menor_real_longitud_px',
      // radios: todas las variantes
      'radio_maximo','radio_minimo','radio_medio','desviacion_radial',
      'radio_maximo_px','radio_minimo_px','radio_medio_px','desviacion_radial_px',
      // Feret (mismo patrón: _px en px, sin _px igual con sc=0)
      'feret_max','feret_min','feret_max_px','feret_min_px',
      // rugosidad con unidades de longitud
      'rugosidad_longitud_segmento_media','rugosidad_desviacion',
      'rugosidad_longitud_segmento_media_px','rugosidad_desviacion_px',
      // simetría bilateral (distancia en mm/px)
      'simetria_distancia_asimetria','simetria_distancia_asimetria_px',
      // campos de clasificación que recalculamos
      'solidity_class','shape_class_circularity','completitud_tipo_fragmento',
      // identificación interna
      'object_id','analysis_method','contour_extraction_successful','_contour_data',
    ]);

    // ── métricas compatibles ──────────────────────────────────────────────────
    // El spread va PRIMERO (valores px brutos como base), luego las conversiones
    // sobreescriben los campos que requieren transformación a mm.
    const metricas = {
      // 1) Pass-through: resto de campos raw del objeto MAO IA
      ...Object.fromEntries(
        Object.entries(maoObj).filter(([k]) => !SKIP_PASSTHROUGH.has(k))
      ),

      // 2) Identificación (fija, sobreescribe si el pass-through trajo algo)
      object_id:                    objLabel,
      analysis_method:              'MAO IA \u2014 Detecci\u00f3n autom\u00e1tica',
      contour_extraction_successful: objMorf.has_real_contour,

      // 3) Dimensiones convertidas a mm (si hay escala) — forma completa = Hull
      area:          s ? +areaComp.toFixed(4) : Math.round(hullAreaPx),
      area_unit:     aU,
      area_px:       Math.round(hullAreaPx),
      perimeter:     s ? +perim.toFixed(3) : +perimHullPx.toFixed(1),
      perimeter_unit: pU,
      perimeter_px:  +perimHullPx.toFixed(1),
      area_fragmentada_px:    Math.round(fragAreaPx),
      perimeter_fragmentado_px: +perimFragPx.toFixed(1),
      // Bounding box en mm (la UI puede usarlos; en px quedan en tight_bounding_*)
      width:  s ? +(bw * s).toFixed(3) : bw,
      height: s ? +(bh * s).toFixed(3) : bh,
      // Ejes: Python entrega _px en píxeles (sc=0). Usamos _px como fuente canónica.
      eje_mayor_px:               +(maoObj.eje_mayor_px || 0).toFixed(1),
      eje_menor_px:               +(maoObj.eje_menor_px || 0).toFixed(1),
      eje_mayor:                  convScale(maoObj.eje_mayor_px, 3),
      eje_menor:                  convScale(maoObj.eje_menor_px, 3),
      eje_mayor_real_longitud:    convScale(maoObj.eje_mayor_px, 3),
      eje_menor_real_longitud:    convScale(maoObj.eje_menor_px, 3),
      eje_mayor_real_longitud_px: +(maoObj.eje_mayor_px || 0).toFixed(1),
      eje_menor_real_longitud_px: +(maoObj.eje_menor_px || 0).toFixed(1),

      // 4) Centroide (coordenadas absolutas en px, no se convierten a mm)
      centroide_x:      +cx.toFixed(1),
      centroide_y:      +cy.toFixed(1),
      centroide_hull_x: +hcx.toFixed(1),
      centroide_hull_y: +hcy.toFixed(1),

      // 5) Radios: se calculan JS-side (igual que detección manual) usando hull y centroide
      // correctamente corregidos con offset ROI, y se usan como fuente primaria.
      // Fall-back: valores de Python si el cálculo JS no está disponible.
      ...(() => {
        const _hull  = maoObj.hull_points    && maoObj.hull_points.length    >= 3 ? maoObj.hull_points    : null;
        const _cpts  = maoObj.contour_points && maoObj.contour_points.length >= 3 ? maoObj.contour_points : null;
        if (_hull && typeof window.calcularRadiosExtremos === 'function') {
          try {
            const _r = window.calcularRadiosExtremos(_hull, [hcx, hcy], _cpts || _hull);
            if (_r && _r.radio_maximo > 0) {
              const rmx = +(_r.radio_maximo).toFixed(2);
              const rmn = +(_r.radio_minimo).toFixed(2);
              const rmd = +(_r.radio_medio).toFixed(2);
              const rdv = +(_r.desviacion_radial).toFixed(2);
              return {
                radio_maximo_px: rmx, radio_minimo_px: rmn, radio_medio_px: rmd, desviacion_radial_px: rdv,
                radio_maximo: s ? +(rmx * s).toFixed(3) : rmx,
                radio_minimo: s ? +(rmn * s).toFixed(3) : rmn,
                radio_medio:  s ? +(rmd * s).toFixed(3) : rmd,
                desviacion_radial: s ? +(rdv * s).toFixed(3) : rdv,
                ratio_radios:              +(_r.ratio_radios).toFixed(4),
                regularidad_radial:        +(_r.regularidad_radial).toFixed(2),
                coeficiente_variacion_radial: +(_r.coeficiente_variacion_radial).toFixed(2),
                punto_radio_maximo: _r.punto_radio_maximo || null,
                punto_radio_minimo: _r.punto_radio_minimo || null,
              };
            }
          } catch (_e) { /* fall through to Python values */ }
        }
        // Fall-back: valores de la primera llamada Python (AIA con sc=0)
        return {
          radio_maximo_px:  +(maoObj.radio_maximo_px  || maoObj.radio_maximo  || 0).toFixed(2),
          radio_minimo_px:  +(maoObj.radio_minimo_px  || maoObj.radio_minimo  || 0).toFixed(2),
          radio_medio_px:   +(maoObj.radio_medio_px   || maoObj.radio_medio   || 0).toFixed(2),
          desviacion_radial_px: +(maoObj.desviacion_radial_px || maoObj.desviacion_radial || 0).toFixed(2),
          radio_maximo:     convScale(maoObj.radio_maximo_px  || maoObj.radio_maximo,  3) ?? 0,
          radio_minimo:     convScale(maoObj.radio_minimo_px  || maoObj.radio_minimo,  3) ?? 0,
          radio_medio:      convScale(maoObj.radio_medio_px   || maoObj.radio_medio,   3) ?? 0,
          desviacion_radial: convScale(maoObj.desviacion_radial_px || maoObj.desviacion_radial, 3) ?? 0,
          ratio_radios:             maoObj.ratio_radios              ?? 0,
          regularidad_radial:       maoObj.regularidad_radial        ?? 0,
          coeficiente_variacion_radial: maoObj.coeficiente_variacion_radial ?? 0,
          punto_radio_maximo: maoObj.punto_radio_maximo || null,
          punto_radio_minimo: maoObj.punto_radio_minimo || null,
        };
      })(),

      // Alias de lectura rápida (no ejes; se cubren antes)

      // 5b) Feret: _px en píxeles (sc=0), sin _px igual valor → convertir con escala
      feret_max_px:  +(maoObj.feret_max_px || maoObj.feret_max || 0).toFixed(2),
      feret_min_px:  +(maoObj.feret_min_px || maoObj.feret_min || 0).toFixed(2),
      feret_max:     convScale(maoObj.feret_max_px || maoObj.feret_max, 3),
      feret_min:     convScale(maoObj.feret_min_px || maoObj.feret_min, 3),

      // 5c) Rugosidad y simetría con unidades de longitud
      rugosidad_longitud_segmento_media_px: +(maoObj.rugosidad_longitud_segmento_media_px || maoObj.rugosidad_longitud_segmento_media || 0).toFixed(2),
      rugosidad_desviacion_px:              +(maoObj.rugosidad_desviacion_px || maoObj.rugosidad_desviacion || 0).toFixed(2),
      rugosidad_longitud_segmento_media: convScale(maoObj.rugosidad_longitud_segmento_media_px || maoObj.rugosidad_longitud_segmento_media, 3),
      rugosidad_desviacion:              convScale(maoObj.rugosidad_desviacion_px || maoObj.rugosidad_desviacion, 3),
      simetria_distancia_asimetria_px:   +(maoObj.simetria_distancia_asimetria_px || maoObj.simetria_distancia_asimetria || 0).toFixed(2),
      simetria_distancia_asimetria:      convScale(maoObj.simetria_distancia_asimetria_px || maoObj.simetria_distancia_asimetria, 3),

      // 6) Estado de conservación
      solidity:           sol,
      solidity_class:     solClass,
      area_fragmentada:   s ? +areaFrag.toFixed(4) : Math.round(fragAreaPx),
      perimeter_fragmentado: s ? +perimFrag.toFixed(3) : +perimFragPx.toFixed(1),
      perdida_area_fragmentacion_percent:      maoObj.perdida_area_fragmentacion_percent      || null,
      perdida_perimetro_fragmentacion_percent: maoObj.perdida_perimetro_fragmentacion_percent || null,
      completitud_estimada:      maoObj.completitud_estimada || null,
      completitud_tipo_fragmento: maoObj.completitud_estimada
        ? (maoObj.completitud_estimada > 80 ? 'Completo/casi completo' :
           maoObj.completitud_estimada > 50 ? 'Parcial' : 'Fragmento')
        : null,

      // 7) Clasificación geométrica
      forma_detectada:         maoObj.forma_detectada || 'Desconocida',
      circularity:             cir,
      shape_class_circularity: cirClass,

      // 8) Datos internos de canvas (coordenadas absolutas en px)
      _contour_data: objMorf.has_real_contour ? {
        points: maoObj.contour_points,
        metrics: {
          // Campos completos necesarios para los canvas de trazado
          area_real:             maoObj.area_fragmentada_px || maoObj.area_px || maoObj.area || (bw * bh),
          perimeter_real:        maoObj.perimeter_fragmentado_px || maoObj.perimeter_px || maoObj.perimeter || 0,
          convex_hull_area:      maoObj.convex_hull_area || maoObj.area_px || maoObj.area || (bw * bh),
          convex_hull_perimeter: maoObj.convex_hull_perimeter || maoObj.perimeter_px || maoObj.perimeter || 0,
          convex_hull:           maoObj.hull_points || [],
          centroid:              [cx,  cy],
          centroid_hull:         [hcx, hcy],
          tight_bounding_box: { width: bw, height: bh, minX: bx, minY: by, area: bw * bh },
        },
      } : null,

      // 9) Puntos de extremo de ejes (necesarios para dibujarlos en el canvas morfológico).
      // Cuando llegan del pipeline IA faltan eje_mayor_p1_recortado et al.; se recalculan aquí
      // usando calcularEjePrincipal() expuesto desde analysis-core.js.
      ...(() => {
        if (!objMorf.has_real_contour) return {};
        if (typeof window.calcularEjePrincipal !== 'function') return {};
        try {
          const ejePrincipalData = window.calcularEjePrincipal(
            maoObj.contour_points,
            [hcx, hcy]  // hull centroid (ROI-safe) en lugar del centroide regular
          );
          return {
            eje_mayor_p1_recortado: ejePrincipalData.eje_mayor_p1_recortado,
            eje_mayor_p2_recortado: ejePrincipalData.eje_mayor_p2_recortado,
            eje_menor_p1_recortado: ejePrincipalData.eje_menor_p1_recortado,
            eje_menor_p2_recortado: ejePrincipalData.eje_menor_p2_recortado,
            // Completar también puntos extremos sin recortar
            eje_mayor_p1: ejePrincipalData.eje_mayor_p1,
            eje_mayor_p2: ejePrincipalData.eje_mayor_p2,
            eje_menor_p1: ejePrincipalData.eje_menor_p1,
            eje_menor_p2: ejePrincipalData.eje_menor_p2,
            // Alias usados por generarCanvasEsquematico
            punto_eje_mayor_1: ejePrincipalData.eje_mayor_p1_recortado || ejePrincipalData.eje_mayor_p1,
            punto_eje_mayor_2: ejePrincipalData.eje_mayor_p2_recortado || ejePrincipalData.eje_mayor_p2,
            punto_eje_menor_1: ejePrincipalData.eje_menor_p1_recortado || ejePrincipalData.eje_menor_p1,
            punto_eje_menor_2: ejePrincipalData.eje_menor_p2_recortado || ejePrincipalData.eje_menor_p2,
          };
        } catch (e) { return {}; }
      })(),

      // 9) Información técnica (siempre visible en el panel)
      scale_factor:          s ? String(s) : 'No configurada',
      original_bounding_box: `${bx},${by} ${bw}\u00d7${bh}`,
      analysis_timestamp:    new Date().toISOString(),

      // 10) Campos de la rama fallback (por si contour_extraction_successful acaba siendo false)
      bounding_area_px:   Math.round(bw * bh),
      bounding_area_mm2:  s ? +((bw * bh) * s * s).toFixed(4) : null,
      circularity_approx: +cir.toFixed(4),

      // 11) Contorno depurado / vista esquemática — disponibles desde datos AIA
      // _forma_idealizada es la estructura que usa analysis-core para renderizar
      // el canvas "Contorno Depurado" (idealizedShapeCanvas). El contorno de AIA
      // ya es un contorno limpio detectado por la red, equivalente al depurado.
      _forma_idealizada:  (maoObj.contour_points && maoObj.contour_points.length >= 3) ? {
        nombre:  maoObj.forma_detectada || 'Contorno IA',
        color:   '#007bff',
        vertices: maoObj.contour_points,
        parametros: {
          puntos_originales:       maoObj.contour_points.length,
          artefactos_eliminados:   0,
          puntos_simplificados:    maoObj.contour_points.length,
          reduccion_porcentaje:    '0.0',
          continuidad_promedio:    '1.000',
          umbral_continuidad:      '— (contorno IA)',
          vertices_significativos: maoObj.contour_points.length,
          epsilon_usado:           0,
          ancho:                   bw,
          alto:                    bh,
        },
      } : null,
    };

    // Fallback de completitud para convergencia Manual/IA:
    // si IA no devuelve completitud_estimada pero sí pérdida de área,
    // derivar completitud = 100 - pérdida y tipificar el fragmento.
    const _compActual = parseFloat(metricas.completitud_estimada);
    if (isNaN(_compActual)) {
      const _lossArea = parseFloat(metricas.perdida_area_fragmentacion_percent);
      if (!isNaN(_lossArea)) {
        const _compDer = Math.max(0, Math.min(100, 100 - _lossArea));
        metricas.completitud_estimada = +_compDer.toFixed(2);
        if (!metricas.completitud_tipo_fragmento) {
          metricas.completitud_tipo_fragmento = _compDer > 80
            ? 'Completo/casi completo'
            : (_compDer > 50 ? 'Parcial' : 'Fragmento');
        }
      }
    }

    // ── 🔭 CALCULAR ERROR ÓPTICO POSICIONAL EN FLUJO IA ─────────────────────
    // Este cálculo FALTABA en el flujo IA (solo existía en análisis manual).
    // Sin este paso, la sección IX (Error Óptico) no se renderizaba en fichas de IA.
    try {
      // Parámetros de cámara: PRIMERO los que usó la escala (fuente canónica =
      // window.escalaParamsOpticos, fijada en calcularEscala/Hibrida). Garantiza los
      // MISMOS datos que la escala — el camino híbrido RAW no escribe #focalInput, por
      // eso la IA leía focal=0. Respaldo: inputs y localStorage.
      const _ep = window.escalaParamsOpticos || {};
      const focalVal = _ep.focalMM ||
                       parseFloat(document.getElementById('focalInput')?.value) ||
                       parseFloat(localStorage.getItem('focalLength') || '') || 0;
      const swVal    = _ep.sensorW ||
                       parseFloat(document.getElementById('sensorWidthInput')?.value) ||
                       parseFloat(localStorage.getItem('sensorWidth') || '') || 0;
      const shVal    = _ep.sensorH ||
                       parseFloat(document.getElementById('sensorHeightInput')?.value) ||
                       parseFloat(localStorage.getItem('sensorHeight') || '') || 0;
      const distVal  = _ep.distanciaObjMM ||
                       parseFloat(document.getElementById('distanciaInput')?.value) ||
                       parseFloat(localStorage.getItem('distancia') || '') || 0;

      // Dimensiones de imagen: las de la escala, o desde la imagen activa
      let imgW = _ep.imgW || 0, imgH = _ep.imgH || 0;
      const modo = callGetter('_maoGetModo') || 'monofacial';
      const imgActiva = getActiveImage();
      if (!imgW && imgActiva) {
        imgW = imgActiva.naturalWidth  || imgActiva.width  || 0;
        imgH = imgActiva.naturalHeight || imgActiva.height || 0;
      }
      
      // Centroide desde contorno real (prefer hull centroid for ROI safety)
      const cxObj = hcx || cx;
      const cyObj = hcy || cy;
      
      // Log de parámetros para debugging
      console.log(`[IA→ErrorOptico] Parámetros: focal=${focalVal}mm | sensor=${swVal}×${shVal}mm | dist=${distVal}mm | img=${imgW}×${imgH}px | centro=(${cxObj.toFixed(0)},${cyObj.toFixed(0)})`);
      
      const errorOptico = window.estimarErrorOptico && typeof window.estimarErrorOptico === 'function'
        ? window.estimarErrorOptico({
            objCentroide: { x: cxObj, y: cyObj },
            imgW: imgW, imgH: imgH,
            focalMM: focalVal,
            sensorW: swVal,
            sensorH: shVal,
            distanciaObjMM: distVal
          })
        : null;
      if (errorOptico) {
        // Asignar campos de error óptico a métricas para renderización posterior
        metricas.error_optico_lineal_percent  = errorOptico.error_lineal_percent;
        metricas.error_optico_area_percent    = errorOptico.error_area_percent;
        metricas.error_perspectiva_percent    = errorOptico.error_perspectiva_percent;
        metricas.error_distorsion_percent     = errorOptico.error_distorsion_percent;
        metricas.posicion_radial_norm         = errorOptico.posicion_radial_norm;
        metricas.posicion_radial_px           = errorOptico.posicion_radial_px;
        metricas.angulo_optico_deg            = errorOptico.angulo_optico_deg;
        metricas.k1_estimado                  = errorOptico.k1_estimado;
        metricas.fov_diagonal_deg             = errorOptico.fovDiagDeg;
        metricas.confianza_optica             = errorOptico.confianza_optica;
        metricas.nota_error_optico            = errorOptico.nota;
        // Aplicar incertidumbre a métricas inmediatamente
        if (typeof window.aplicarIncertidumbreOptica === 'function') {
          window.aplicarIncertidumbreOptica(metricas, errorOptico);
        }
        console.log(`[IA→ErrorOptico] ✓ Calculado: ±${errorOptico.error_lineal_percent}% lineal | ±${errorOptico.error_area_percent}% área | ${errorOptico.confianza_optica}`);
      } else if (focalVal === 0 || swVal === 0 || distVal === 0) {
        console.log(`[IA→ErrorOptico] ⚠️ Parámetros de cámara incompletos - error óptico NO calculado`);
      }
    } catch (eoErr) {
      console.warn('[IA→ErrorOptico] ❌ No se pudo calcular error óptico:', eoErr.message);
    }

    // ── Cerrar modal inmediatamente para dar feedback visual al usuario ───────
    // DESACTIVADO: el modal debe permanecer abierto para que el usuario pueda
    // generar tarjetas de múltiples objetos (ambas caras) sin perder el contexto.
    // El usuario cierra el modal manualmente con el botón ✕ o la tecla Escape.
    // modal.style.display = 'none';

    // ── Enriquecer métricas con el pipeline estándar Python (igual que análisis manual) ────
    // Llama a /api/metrics con la escala real del proyecto, obteniendo los 124+ indicadores
    // morfométricos, GLCM de textura e incertidumbre posicional, igual que la detección manual.
    let metricasFinal = JSON.parse(JSON.stringify(metricas)); // fallback: copia profunda de metricas (incluye error_optico)
    try {
      const _bridgeOk = window.PythonBridge &&
                        PythonBridge.isModuleActive('metrics') &&
                        objMorf.has_real_contour &&
                        maoObj.contour_points && maoObj.contour_points.length >= 3;
      if (_bridgeOk) {
        // Recortar imagen al bbox del objeto para pasarla a /api/metrics y /api/texture
        let cropDataURL = null;
        if (imagen) {
          const tmpC = document.createElement('canvas');
          tmpC.width = bw; tmpC.height = bh;
          tmpC.getContext('2d').drawImage(imagen, bx, by, bw, bh, 0, 0, bw, bh);
          cropDataURL = tmpC.toDataURL('image/png');
        }

        const [pyMetsRes, pyTexRes] = await Promise.allSettled([
          PythonBridge.metrics.calculate(
            cropDataURL,
            maoObj.contour_points, // coords absolutas — Python las usa directamente
            s || 1.0               // mm/px real del proyecto
          ),
          cropDataURL ? PythonBridge.metrics.texture(cropDataURL) : Promise.resolve(null),
        ]);

        if (pyMetsRes.status === 'fulfilled' && pyMetsRes.value?.metricas &&
            Object.keys(pyMetsRes.value.metricas).length > 0) {

          const pyM = pyMetsRes.value.metricas;

          // Fusionar: Python da todos los indicadores correctamente convertidos a mm.
          // Preservamos sólo los campos de contexto IA que Python no conoce.
          metricasFinal = {
            ...pyM,                          // 124+ indicadores de Python (mm correctos)

            // ── Metadatos IA (sobreescriben los de Python) ──────────────────
            object_id:                    metricas.object_id,
            analysis_method:              metricas.analysis_method,
            contour_extraction_successful: metricas.contour_extraction_successful,
            area_unit:                    metricas.area_unit,
            perimeter_unit:               metricas.perimeter_unit,
            scale_factor:                 metricas.scale_factor,
            original_bounding_box:        metricas.original_bounding_box,
            analysis_timestamp:           metricas.analysis_timestamp,

            // ── Error óptico posicional (Sección IX): calculado en JS (estimarErrorOptico),
            //    Python NO lo conoce. Sin preservarlo aquí, la fusión `...pyM` lo descartaba
            //    y la re-aplicación posterior (lee metricasFinal.error_optico_*) recibía NaN
            //    → se saltaba → Sección IX quedaba vacía en fichas IA. (validación científica)
            error_optico_lineal_percent:  metricas.error_optico_lineal_percent,
            error_optico_area_percent:    metricas.error_optico_area_percent,
            error_perspectiva_percent:    metricas.error_perspectiva_percent,
            error_distorsion_percent:     metricas.error_distorsion_percent,
            posicion_radial_norm:         metricas.posicion_radial_norm,
            posicion_radial_px:           metricas.posicion_radial_px,
            angulo_optico_deg:            metricas.angulo_optico_deg,
            k1_estimado:                  metricas.k1_estimado,
            fov_diagonal_deg:             metricas.fov_diagonal_deg,
            confianza_optica:             metricas.confianza_optica,
            nota_error_optico:            metricas.nota_error_optico,

            // ── _contour_data completo con coords absolutas (necesario para los canvas de trazado) ──
            _contour_data: objMorf.has_real_contour ? {
              points: maoObj.contour_points,
              metrics: {
                area_real:             parseFloat(pyM.area_fragmentada_px) || parseFloat(pyM.area_px) || fragAreaPx,
                perimeter_real:        parseFloat(pyM.perimeter_fragmentado_px) || parseFloat(pyM.perimeter_px) || perimFragPx,
                convex_hull_area:      parseFloat(pyM.convex_hull_area) || parseFloat(pyM.area_px) || hullAreaPx,
                convex_hull_perimeter: parseFloat(pyM.convex_hull_perimeter) || parseFloat(pyM.perimeter_px) || perimHullPx,
                convex_hull:           pyM.convex_hull_points ||
                                       (maoObj.hull_points && maoObj.hull_points.length >= 3 ? maoObj.hull_points : []),
                centroid:              [cx, cy],
                centroid_hull:         [hcx, hcy],
                tight_bounding_box: { width: bw, height: bh, minX: bx, minY: by, area: bw * bh },
              },
            } : metricas._contour_data,

            // ── Centroide absoluto (usamos siempre los valores ROI-safe de JS) ──────────
            centroide_x:      metricas.centroide_x,
            centroide_y:      metricas.centroide_y,
            centroide_hull_x: metricas.centroide_hull_x,
            centroide_hull_y: metricas.centroide_hull_y,

            // ── Radios: siempre sobreescribir con los valores JS-side (consistentes con
            //    hull y centroide ROI-safe). Python puede devolver coords inconsistentes
            //    si usa el crop de imagen con contorno en coords absolutas. ────────────
            radio_maximo:     metricas.radio_maximo,
            radio_minimo:     metricas.radio_minimo,
            radio_medio:      metricas.radio_medio,
            radio_maximo_px:  metricas.radio_maximo_px,
            radio_minimo_px:  metricas.radio_minimo_px,
            radio_medio_px:   metricas.radio_medio_px,
            desviacion_radial: metricas.desviacion_radial,
            desviacion_radial_px: metricas.desviacion_radial_px,
            ratio_radios:     metricas.ratio_radios,
            regularidad_radial: metricas.regularidad_radial,
            coeficiente_variacion_radial: metricas.coeficiente_variacion_radial,
            // puntos de radios en coords absolutas (coherentes con hull_points ROI-safe)
            punto_radio_maximo: metricas.punto_radio_maximo,
            punto_radio_minimo: metricas.punto_radio_minimo,

            // ── Puntos de ejes para dibujo (Python no los devuelve) ──────────
            eje_mayor_p1_recortado: metricas.eje_mayor_p1_recortado,
            eje_mayor_p2_recortado: metricas.eje_mayor_p2_recortado,
            eje_menor_p1_recortado: metricas.eje_menor_p1_recortado,
            eje_menor_p2_recortado: metricas.eje_menor_p2_recortado,
            eje_mayor_p1: metricas.eje_mayor_p1,
            eje_mayor_p2: metricas.eje_mayor_p2,
            eje_menor_p1: metricas.eje_menor_p1,
            eje_menor_p2: metricas.eje_menor_p2,
            // Aliases para el canvas esquemático
            punto_eje_mayor_1: metricas.punto_eje_mayor_1,
            punto_eje_mayor_2: metricas.punto_eje_mayor_2,
            punto_eje_menor_1: metricas.punto_eje_menor_1,
            punto_eje_menor_2: metricas.punto_eje_menor_2,

            // ── Contorno depurado/idealizado (canvas de forma depurada) ──────
            _forma_idealizada: metricas._forma_idealizada,

            // ── Clasificaciones específicas IA (forma, fragmentación) ─────────
            forma_detectada:              metricas.forma_detectada,
            solidity_class:               metricas.solidity_class,
            shape_class_circularity:      metricas.shape_class_circularity,
            completitud_estimada:         metricas.completitud_estimada,
            completitud_tipo_fragmento:   metricas.completitud_tipo_fragmento,
            perdida_area_fragmentacion_percent:      metricas.perdida_area_fragmentacion_percent,
            perdida_perimetro_fragmentacion_percent: metricas.perdida_perimetro_fragmentacion_percent,
            bounding_area_px:             metricas.bounding_area_px,
            bounding_area_mm2:            metricas.bounding_area_mm2,

            // ── Normalizar convex_hull_points: Python devuelve lista-de-puntos,
            //    el resto del código JS espera un número (cantidad) ─────────────
            convex_hull_points: Array.isArray(pyM.convex_hull_points)
              ? pyM.convex_hull_points.length
              : (pyM.convex_hull_points || null),

            // ── 🔭 INCLUIR CAMPOS DE ERROR ÓPTICO POSICIONAL ─────────────────────
            // CRÍTICO: Estos campos se calculan al inicio en `metricas` pero NO se 
            // incluían en metricasFinal, causando que la Sección IX no se renderice.
            // Se preservan TODOS los campos para que la renderización sea completa.
            error_optico_lineal_percent:  metricas.error_optico_lineal_percent,
            error_optico_area_percent:    metricas.error_optico_area_percent,
            error_perspectiva_percent:    metricas.error_perspectiva_percent,
            error_distorsion_percent:     metricas.error_distorsion_percent,
            posicion_radial_norm:         metricas.posicion_radial_norm,
            posicion_radial_px:           metricas.posicion_radial_px,
            angulo_optico_deg:            metricas.angulo_optico_deg,
            k1_estimado:                  metricas.k1_estimado,
            fov_diagonal_deg:             metricas.fov_diagonal_deg,
            confianza_optica:             metricas.confianza_optica,
            nota_error_optico:            metricas.nota_error_optico,
          };

          // Fusionar GLCM de textura si llegó
          if (pyTexRes.status === 'fulfilled' && pyTexRes.value?.glcm) {
            Object.assign(metricasFinal, pyTexRes.value.glcm);
            if (pyTexRes.value.interpretation)
              metricasFinal.textura_interpretacion = pyTexRes.value.interpretation;
          }

          // ── PRESERVAR Y RE-APLICAR INCERTIDUMBRE ÓPTICA DESPUÉS DE FUSIÓN PYTHON ────
          // La fusión sobreescribe area/perimeter/etc. con los valores Python finales,
          // por lo que la incertidumbre calculada sobre valores JS previos se vuelve obsoleta.
          // Se reconstruyen los rangos (min/max) con los valores finales Python.
          // IMPORTANTE: Preservar TODOS los campos de error óptico (no solo porcentajes)
          // para que la sección IX se renderice correctamente en fichas.
          if (typeof window.aplicarIncertidumbreOptica === 'function') {
            const _eL = parseFloat(metricasFinal.error_optico_lineal_percent);
            const _eA = parseFloat(metricasFinal.error_optico_area_percent);
            const _ePerspectiva = parseFloat(metricasFinal.error_perspectiva_percent);
            const _eDistorsion = parseFloat(metricasFinal.error_distorsion_percent);
            const _posRadial = parseFloat(metricasFinal.posicion_radial_norm);
            const _anguloOptico = parseFloat(metricasFinal.angulo_optico_deg);
            
            if (!isNaN(_eL) && !isNaN(_eA) && (_eL > 0 || _eA > 0)) {
              // Reconstruir objeto errorOptico con todos los campos
              const errorOpticoCompleto = {
                error_lineal_percent: _eL,
                error_area_percent: _eA,
                error_perspectiva_percent: !isNaN(_ePerspectiva) ? _ePerspectiva : 0,
                error_distorsion_percent: !isNaN(_eDistorsion) ? _eDistorsion : 0,
                posicion_radial_norm: !isNaN(_posRadial) ? _posRadial : 0,
                angulo_optico_deg: !isNaN(_anguloOptico) ? _anguloOptico : 0,
                k1_estimado: metricasFinal.k1_estimado || 0,
                fovDiagDeg: metricasFinal.fov_diagonal_deg || 0,
                confianza_optica: metricasFinal.confianza_optica || 'Sin datos',
                nota: metricasFinal.nota_error_optico || ''
              };
              // Re-aplicar con objeto completo (no solo recalcular ranges)
              window.aplicarIncertidumbreOptica(metricasFinal, errorOpticoCompleto);
              console.log(`[IA→ErrorOptico/Final] Re-aplicado tras Python: ±${_eL}% | ${metricasFinal.confianza_optica}`);
            }
          }

          console.log('[IA→Morf] Métricas Python fusionadas:',
            Object.keys(pyM).length, 'indicadores, escala:', s, 'mm/px');
        }
      }
    } catch (err) {
      console.warn('[IA→Morf] PythonBridge.metrics falló, usando métricas JS:', err.message);
    }

    // ── Clasificación tipológica Python (reglas + EFA) en flujo IA ─────────
    // No sustituye la meta-clasificación geométrica JS; la complementa.
    if (window.PythonBridge && PythonBridge.isAvailable()) {
      try {
        const _tipologia = await PythonBridge.classifier.classify(metricasFinal);
        if (_tipologia && _tipologia.tipo) {
          metricasFinal.tipologia           = _tipologia;
          metricasFinal.tipo_artefacto      = _tipologia.tipo;
          metricasFinal.subtipo_artefacto   = _tipologia.subtipo || '';
          metricasFinal.confianza_tipologia = _tipologia.confianza || 0;
          console.log(`[IA Fase 2] Tipología IA: ${_tipologia.tipo} (${(_tipologia.confianza * 100).toFixed(0)}%)`);
        }
      } catch (_eTip) {
        console.warn('[IA Fase 2] classify falló en modo IA:', _eTip.message);
      }
    }

    // ── Meta-clasificación JS: mismo árbol de votación ponderada que el análisis manual ──
    // Ejecutar simplificarAFormaRegular → distribucionRadialAngular → metaClasificarForma
    // garantiza que fragmentación, completitud y categoría base se calculen con
    // las mismas matemáticas en ambos modos, eliminando la divergencia de etiquetas.
    const aplicarFallbackTipologicoIA = (m) => {
      const rr = parseFloat(m.ratio_radios);
      const cc = parseFloat(m.circularity || m.circularity_real);
      const ss = parseFloat(m.solidity || m.solidez);
      const cp = parseFloat(m.completitud_estimada);
      const esFrag = !isNaN(cp) ? cp < 95 : (ss < 0.92);
      const geoBase = m.forma_geometrica_observada || m.forma_detectada_meta || m.forma_detectada || '';
      const tipBase = m.forma_tipologica_inferida || m.forma_detectada_tipologica || geoBase;
      const tipNoReint = !tipBase || tipBase === geoBase || /\boval\b/i.test(tipBase);
      const toroideSevero =
        esFrag &&
        !isNaN(rr) && rr < 0.50 &&
        !isNaN(cc) && cc >= 0.74 && cc < 0.88 &&
        !isNaN(ss) && ss >= 0.45 && ss < 0.75;

      if (!toroideSevero || !tipNoReint) return false;

      const pct = Number.isFinite(cp) ? Math.round(cp) : null;
      const tip = pct != null ? `Fragmento Media Luna (${pct}% completo)` : 'Fragmento Media Luna';
      m.forma_geometrica_observada = geoBase;
      m.forma_tipologica_inferida = tip;
      m.forma_detectada_tipologica = tip;
      m.forma_requiere_reinterpretacion_tipologica = true;
      m.forma_razon_tipologica = m.forma_razon_tipologica ||
        `Fallback IA: lectura lunar por Rmin/Rmax=${rr.toFixed(3)}, circ=${cc.toFixed(3)}, solidez=${ss.toFixed(3)}.`;
      return true;
    };
    if (typeof window.metaClasificarFormaIA === 'function' &&
        metricasFinal._contour_data?.points?.length >= 3) {
      try {
        const _mc = window.metaClasificarFormaIA(metricasFinal);
        const _formaFinal = _mc.clasificacion_final;
        if (_formaFinal && _formaFinal !== 'Forma Indeterminada') {
          metricasFinal.forma_detectada_meta       = _formaFinal;
          metricasFinal.forma_confianza_global     = (_mc.confianza_global * 100).toFixed(1);
          metricasFinal.forma_razonamiento         = _mc.razonamiento?.join(' | ') || '';
          metricasFinal.forma_metodos_coincidentes = `${_mc.metodos_coincidentes}/${_mc.total_metodos}`;
          metricasFinal.forma_geometrica_observada = _mc.forma_geometrica_observada || _formaFinal;
          metricasFinal.forma_tipologica_inferida  = _mc.forma_tipologica_inferida || metricasFinal.forma_geometrica_observada;
          metricasFinal.forma_razon_tipologica     = _mc.razon_tipologica || '';
          metricasFinal.forma_requiere_reinterpretacion_tipologica = !!_mc.requiere_reinterpretacion_tipologica;
          metricasFinal.forma_detectada_tipologica = metricasFinal.forma_tipologica_inferida;
          const _formaMostrada = (metricasFinal.forma_tipologica_inferida && metricasFinal.forma_requiere_reinterpretacion_tipologica)
            ? metricasFinal.forma_tipologica_inferida
            : _formaFinal;
          metricasFinal.forma_detectada = _formaMostrada;
          metricasFinal.forma_detectada_mostrada = _formaMostrada;
          if (!metricasFinal.forma_categoria_base && _mc.categoria_base)
            metricasFinal.forma_categoria_base = _mc.categoria_base;
          console.log('[IA→Meta] forma unificada por árbol JS:', _formaFinal,
            '(conf:', metricasFinal.forma_confianza_global + '%)');
          if (typeof window._maoLog === 'function') window._maoLog(`[IA] meta-clasif="${_formaFinal}" tipologia="${metricasFinal.forma_tipologica_inferida || _formaFinal}" reinterpretada=${!!metricasFinal.forma_requiere_reinterpretacion_tipologica} conf=${metricasFinal.forma_confianza_global}% metodos=${metricasFinal.forma_metodos_coincidentes} completitud=${metricasFinal.completitud_estimada ?? 'n/a'}`);
        }
      } catch (_emc) {
        console.warn('[IA→Meta] metaClasificarFormaIA falló:', _emc.message);
      }
    }

    // Red de seguridad para discrepancias de cache/render en IA.
    aplicarFallbackTipologicoIA(metricasFinal);

    const _tipologiaEfaLabel = metricasFinal.tipo_artefacto
      ? `${metricasFinal.tipo_artefacto}${metricasFinal.subtipo_artefacto ? ` (${metricasFinal.subtipo_artefacto})` : ''}`
      : '';

    // Si el árbol JS no reinterpretó tipológicamente la forma, conservar la
    // forma geométrica como principal pero exponer la lectura tipológica EFA.
    if (_tipologiaEfaLabel && !metricasFinal.forma_requiere_reinterpretacion_tipologica) {
      metricasFinal.forma_tipologia_asistida_efa = true;
      metricasFinal.forma_tipologica_inferida = _tipologiaEfaLabel;
      metricasFinal.forma_detectada_tipologica = _tipologiaEfaLabel;
      if (!metricasFinal.forma_razon_tipologica ||
          /sin reinterpretación tipológica adicional/i.test(metricasFinal.forma_razon_tipologica)) {
        metricasFinal.forma_razon_tipologica = `Tipología asistida por clasificador EFA: ${_tipologiaEfaLabel}. La forma geométrica observada se conserva como salida principal.`;
      }
    }

    const _canonIA = (typeof window.aplicarReglaCanonicaInterpretacion === 'function')
      ? window.aplicarReglaCanonicaInterpretacion(metricasFinal)
      : null;
    const _formaMostradaIA = _canonIA?.forma_detectada_mostrada ||
      ((metricasFinal.forma_tipologica_inferida && metricasFinal.forma_requiere_reinterpretacion_tipologica)
        ? metricasFinal.forma_tipologica_inferida
        : (metricasFinal.forma_detectada_meta || metricasFinal.forma_detectada));
    metricasFinal.forma_detectada = _formaMostradaIA;
    metricasFinal.forma_detectada_mostrada = _formaMostradaIA;

    // Sincronizar el objeto del modal IA para que tabla/fichas reflejen la misma salida.
    maoObj.forma_geometrica_observada = metricasFinal.forma_geometrica_observada || maoObj.forma_geometrica_observada;
    maoObj.forma_tipologia_asistida_efa = !!metricasFinal.forma_tipologia_asistida_efa;
    maoObj.forma_tipologica_inferida = metricasFinal.forma_tipologica_inferida || maoObj.forma_tipologica_inferida;
    maoObj.forma_detectada_tipologica = metricasFinal.forma_detectada_tipologica || maoObj.forma_detectada_tipologica;
    maoObj.forma_requiere_reinterpretacion_tipologica = !!metricasFinal.forma_requiere_reinterpretacion_tipologica;
    maoObj.forma_razon_tipologica = metricasFinal.forma_razon_tipologica || maoObj.forma_razon_tipologica;
    maoObj.forma_detectada_mostrada = _formaMostradaIA;
    maoObj.forma_detectada = _formaMostradaIA;

    const emitirMonitorAnalisisIA = (objMonitor, metricasMonitor) => {
      // ADR-008 Fase 3 — mismo builder canónico que auto/manual (C7). objMonitor
      // trae `_fromIA` → el builder resuelve modo/método 'ia' sin hardcodear.
      const payload = (window.MaoDeteccion && window.MaoDeteccion.buildMonitorAnalisis)
        ? window.MaoDeteccion.buildMonitorAnalisis(objMonitor, metricasMonitor)
        : { objeto: objMonitor.id || objMonitor.nombreObjeto || null, modo: 'ia', timestamp: new Date().toISOString() };
      console.info(`[MONITOR_ANALISIS] ${JSON.stringify(payload)}`);
    };

    // 🔭 ERROR ÓPTICO POSICIONAL — función AUTÓNOMA y agnóstica del modo, sobre el
    //    objeto FINAL (tras toda fusión Python/clasificación). Es la MISMA función que
    //    usa cualquier modo: el error óptico depende solo de (ópticas de la imagen) ×
    //    (centroide del objeto), no del método de detección. Garantiza la Sección IX en
    //    fichas IA sin merge-drop ni lógica duplicada.
    if (typeof window.aplicarErrorOpticoPosicional === 'function') {
      const _okEO = window.aplicarErrorOpticoPosicional(metricasFinal, { x: hcx || cx, y: hcy || cy });
      console.log(`[IA→Card] Error óptico (autónomo): ${_okEO ? 'OK ±' + metricasFinal.error_optico_lineal_percent + '%' : 'sin datos — ' + (metricasFinal.nota_error_optico || '')}`);
    }

    // ── Crear tarjeta en panel de resultados ────────────────────────────────
    try {
      // 🔭 DEBUG: Verificar que error_optico llegó a metricasFinal antes de mostrar
      console.log(`[IA→Card] Error óptico en metricasFinal:`, {
        error_optico_lineal_percent: metricasFinal.error_optico_lineal_percent,
        error_optico_area_percent: metricasFinal.error_optico_area_percent,
        confianza_optica: metricasFinal.confianza_optica,
        posicion_radial_norm: metricasFinal.posicion_radial_norm,
        angulo_optico_deg: metricasFinal.angulo_optico_deg,
      });

      emitirMonitorAnalisisIA(objMorf, metricasFinal);
      if (typeof window.mostrarCardObjetoIA === 'function') {
        // Flujo normal: crear tarjeta en la grilla, igual que otros modos de análisis
        window.mostrarCardObjetoIA(objMorf, metricasFinal, imagen);
      } else {
        // Fallback si analysis-core aún no expuso la función
        window.mostrarAnalisisMorfologico(objMorf, metricasFinal, imagen);
      }
      // Notificar al usuario con un toast — el modal sigue abierto para la otra cara
      const nombreTarjeta = objMorf.id || objMorf.nombreObjeto || ('#' + id);
      toast.success('Tarjeta generada: ' + nombreTarjeta + '. Cierra el modal cuando termines.');
    } catch (err) {
      console.error('Error al exportar a análisis morfológico:', err);
      toast.error('Error al cargar el análisis morfológico: ' + err.message);
    }
  }
  // ── Renderizar todos los tabs ─────────────────────────────────────────────
  function renderResults(data) {
    showSpinner(false);
    hideDetailPanel();
    maoIaLastObjects = data.objects || [];
    // Persistir resultados de esta cara para que no se pierdan al cambiar de cara
    maoIaObjectsByFace[selectedFace] = maoIaLastObjects;
    _updateFaceBadges();
    maoIaVisible     = new Set(maoIaLastObjects.map(o => o.object_id));

    // #1 — reinicia orden/filtro de triage en cada nuevo análisis.
    _iaTableSortKey = null; _iaTableSortDir = 1; _iaConfFilter = false;
    const _cf = document.getElementById('maoIaConfFilter');
    if (_cf) _cf.checked = false;
    _updateSortIndicators();

    const INTERNAL = new Set(['object_id','label','contour_points','hull_points',
      'convexity_defects','centroid_x','centroid_y','hull_centroid_x','hull_centroid_y',
      'bbox_x','bbox_y','bbox_w','bbox_h','centroide','_metrics_error','_metricsCount']);
    maoIaLastObjects.forEach(obj => {
      obj._metricsCount = Object.keys(obj).filter(k => !INTERNAL.has(k)).length;
    });

    window._showMaoMetrics = id => {
      const obj = maoIaLastObjects.find(o => o.object_id === id);
      if (obj) showMaoMetrics(obj);
    };

    window._usarEnAnalisisMorfologico = async function(id, btn) {
      const origLabel = btn ? btn.innerHTML : null;
      if (btn) { btn.disabled = true; btn.textContent = '\u23f3 Procesando…'; }
      try {
        await exportarAAnalisisMorfologico(id);
      } finally {
        if (btn && origLabel) { btn.disabled = false; btn.innerHTML = origLabel; }
      }
    };

    if (resultTitle) resultTitle.textContent = 'Objetos detectados';
    if (resultCount) resultCount.textContent = data.count + ' obj';

    resultsPanel.style.display = 'flex';
    if (placeholderEl) placeholderEl.style.display = 'none';

    if (!maoIaLastObjects.length) {
      if (resultBody) resultBody.innerHTML =
        '<div style="color:#718096;padding:16px 0;text-align:center;">No se detectaron objetos con estos parámetros.</div>';
      if (selectorWrap) selectorWrap.style.display = 'none';
      if (cnvContornos) cnvContornos.style.display = 'none';
      _renderConfSummary([]);
      switchTab('cards');
      return;
    }

    buildMaoSelector(maoIaLastObjects);
    renderTable(maoIaLastObjects);
    renderCards(maoIaLastObjects);
    switchTab('canvas');
    _renderConfSummary(maoIaLastObjects);   // #1 — resumen de confianza (chips)
    _updateConfFilterCount();

    // ── Inyectar en el flujo de tarjetas morfológicas principal ──────────
    // Genera las tarjetas de objeto en la vista de análisis morfológico,
    // igual que tras detección automática o manual, para acceso completo.
    if (typeof window.inyectarObjetosDesdeIA === 'function') {
      const cara = callGetter('_maoGetModo') === 'bifacial' ? selectedFace : null;
      window.inyectarObjetosDesdeIA(maoIaLastObjects, cara);
    }

    setTimeout(() => {
      const img = getActiveImage();
      if (img && canvasWrap && canvasWrap.clientWidth) {
        const iw = img.naturalWidth || img.width;
        iaCanvasNativeW = 700;
        iaCanvasNativeH = Math.round((img.naturalHeight || img.height) * (700 / iw));
        const fit = (canvasWrap.clientWidth - 28) / iaCanvasNativeW;
        iaZoom = Math.min(fit, 1.0);
      }
      drawContoursCanvas(maoIaLastObjects);
    }, 80);
  }

  // ── Panel lateral: métricas completas ────────────────────────────────────
  function _openMetricsPanel() {
    if (metricsPanel) metricsPanel.classList.add('mao-panel-open');
  }
  function _closeMetricsPanel() {
    if (metricsPanel) metricsPanel.classList.remove('mao-panel-open');
  }

  metricsModalClose && metricsModalClose.addEventListener('click', _closeMetricsPanel);

  // Cerrar con Escape (sólo si el panel está abierto)
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && metricsPanel && metricsPanel.classList.contains('mao-panel-open')) {
      e.stopPropagation();
      _closeMetricsPanel();
    }
  }, { capture: true });

  // Filtro de búsqueda en tiempo real
  metricsSearchEl && metricsSearchEl.addEventListener('input', () => {
    const q = metricsSearchEl.value.trim().toLowerCase();
    if (!metricsModalBody) return;
    metricsModalBody.querySelectorAll('.mao-mgroup').forEach(group => {
      let visible = 0;
      group.querySelectorAll('.mao-mrow').forEach(row => {
        const match = !q || row.dataset.key.includes(q) || row.dataset.label.includes(q);
        row.classList.toggle('mao-metrics-row-hidden', !match);
        if (match) visible++;
      });
      group.classList.toggle('mao-metrics-group-hidden', visible === 0);
    });
  });

  function _normalizeEfaContourPoints(points = []) {
    if (!Array.isArray(points)) return [];
    return points
      .map((p) => {
        if (Array.isArray(p) && p.length >= 2) return [Number(p[0]), Number(p[1])];
        if (p && typeof p === 'object' && p.x != null && p.y != null) return [Number(p.x), Number(p.y)];
        return null;
      })
      .filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  }

  function _resampleByArcForLandmarks(pts, nSamples) {
    if (!Array.isArray(pts) || pts.length < 3) return [];
    const n = pts.length;
    const arc = [0];
    for (let i = 1; i < n; i++) {
      const dx = pts[i][0] - pts[i - 1][0];
      const dy = pts[i][1] - pts[i - 1][1];
      arc.push(arc[i - 1] + Math.hypot(dx, dy));
    }
    const dx0 = pts[0][0] - pts[n - 1][0];
    const dy0 = pts[0][1] - pts[n - 1][1];
    const totalLen = arc[n - 1] + Math.hypot(dx0, dy0);
    if (totalLen <= 0) return [];

    const step = totalLen / nSamples;
    const out = [];
    let j = 0;
    for (let i = 0; i < nSamples; i++) {
      const target = i * step;
      while (j < n - 1 && arc[j + 1] < target) j++;
      const a0 = arc[j];
      const a1 = j + 1 < n ? arc[j + 1] : totalLen;
      const t = a1 > a0 ? (target - a0) / (a1 - a0) : 0;
      const p0 = pts[j];
      const p1 = pts[(j + 1) % n];
      out.push([p0[0] + t * (p1[0] - p0[0]), p0[1] + t * (p1[1] - p0[1])]);
    }
    return out;
  }

  function _generateSemiAutoLandmarks(points, nLandmarks = 32) {
    const pts = _normalizeEfaContourPoints(points);
    if (pts.length < 8) return [];
    return _resampleByArcForLandmarks(pts, nLandmarks);
  }

  function _buildTpsText(landmarks, obj) {
    const lines = [];
    lines.push(`LM=${landmarks.length}`);
    landmarks.forEach((p) => lines.push(`${Number(p[0]).toFixed(6)} ${Number(p[1]).toFixed(6)}`));
    lines.push(`ID=${String(obj?.id || `IA_OBJ_${obj?.object_id || 'X'}`)}`);
    lines.push('COMMENT=MAO Plus IA semi-landmarks (arc-length)');
    return lines.join('\n') + '\n';
  }

  async function _appendMaoEfaPanel(obj) {
    if (!metricsModalBody) return;

    const section = document.createElement('div');
    section.className = 'mao-mgroup';
    section.style.marginBottom = '10px';
    section.innerHTML =
      '<div style="font-weight:700;font-size:10px;color:#0d4f9a;border-bottom:1.5px solid #0d4f9a30;padding-bottom:2px;margin-bottom:3px;">EFA (Fourier Eliptico)</div>' +
      '<div style="font-size:10px;color:#64748b;padding:4px 6px;">Calculando descriptores...</div>';
    metricsModalBody.appendChild(section);

    const bridgeOk = window.PythonBridge && PythonBridge.isModuleActive('efa') && PythonBridge.efa;
    if (!bridgeOk) {
      section.innerHTML =
        '<div style="font-weight:700;font-size:10px;color:#0d4f9a;border-bottom:1.5px solid #0d4f9a30;padding-bottom:2px;margin-bottom:3px;">EFA (Fourier Eliptico)</div>' +
        '<div style="font-size:10px;color:#64748b;padding:4px 6px;">Modulo EFA no disponible en backend.</div>';
      return;
    }

    const points = _normalizeEfaContourPoints(obj?.contour_points || obj?.points || obj?._contour_data?.points);
    if (points.length < 8) {
      section.innerHTML =
        '<div style="font-weight:700;font-size:10px;color:#0d4f9a;border-bottom:1.5px solid #0d4f9a30;padding-bottom:2px;margin-bottom:3px;">EFA (Fourier Eliptico)</div>' +
        '<div style="font-size:10px;color:#b45309;padding:4px 6px;">Contorno insuficiente (minimo 8 puntos).</div>';
      return;
    }

    try {
      const scalePxMm = Number(callGetter('_maoGetScale') || 1.0) || 1.0;
      const efa = await PythonBridge.efa.calculate(points, {
        nHarmonics: 20,
        scalePxMm,
        normalize: true,
      });

      if (!efa || efa.status !== 'ok') {
        throw new Error(efa?.message || 'Respuesta invalida');
      }

      obj._efa_data = efa;
      const landmarks = _generateSemiAutoLandmarks(points, 32);
      obj._landmarks_semiauto = landmarks;
      const ps = Array.isArray(efa.power_spectrum) ? efa.power_spectrum.slice(0, 5).map(v => Number(v).toFixed(4)).join(', ') : 'N/A';
      const btnId = `maoIaEfaTpsBtn_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      section.innerHTML =
        '<div style="font-weight:700;font-size:10px;color:#0d4f9a;border-bottom:1.5px solid #0d4f9a30;padding-bottom:2px;margin-bottom:3px;">EFA (Fourier Eliptico)</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:10px;">' +
          '<tr><td style="padding:2px 6px;color:#718096;">Armónicos</td><td style="padding:2px 6px;text-align:right;font-weight:600;">' + efa.n_harmonics + '</td></tr>' +
          '<tr><td style="padding:2px 6px;color:#718096;">h para 95% var</td><td style="padding:2px 6px;text-align:right;font-weight:600;">' + efa.harmonics_for_95pct + '</td></tr>' +
          '<tr><td style="padding:2px 6px;color:#718096;">h para 99% var</td><td style="padding:2px 6px;text-align:right;font-weight:600;">' + efa.harmonics_for_99pct + '</td></tr>' +
          '<tr><td style="padding:2px 6px;color:#718096;">Landmarks semi-auto</td><td style="padding:2px 6px;text-align:right;font-weight:600;">' + landmarks.length + '</td></tr>' +
        '</table>' +
        '<div style="margin-top:4px;padding:4px 6px;background:#f8fbff;border:1px solid #dbeafe;border-radius:4px;font-size:9px;color:#334155;line-height:1.4;">' +
          '<b>Power spectrum (1..5):</b> ' + ps +
        '</div>' +
        '<button id="' + btnId + '" style="margin-top:6px;padding:5px 8px;border:1px solid #0d6efd;background:#fff;color:#0d6efd;border-radius:5px;cursor:pointer;font-size:10px;font-weight:600;">Exportar landmarks TPS</button>';

      const tpsBtn = document.getElementById(btnId);
      if (tpsBtn) {
        tpsBtn.addEventListener('click', () => {
          const text = _buildTpsText(landmarks, obj);
          const fileBase = String(obj?.id || `ia_obj_${obj?.object_id || 'x'}`).replace(/[^a-zA-Z0-9_-]/g, '_');
          const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `${fileBase}_landmarks.tps`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(link.href);
        });
      }
    } catch (err) {
      section.innerHTML =
        '<div style="font-weight:700;font-size:10px;color:#0d4f9a;border-bottom:1.5px solid #0d4f9a30;padding-bottom:2px;margin-bottom:3px;">EFA (Fourier Eliptico)</div>' +
        '<div style="font-size:10px;color:#b91c1c;padding:4px 6px;">Error EFA: ' + String(err?.message || err) + '</div>';
    }
  }

  function showMaoMetrics(obj) {
    const color = iaColor(obj.object_id);
    metricsModalTitle.innerHTML =
      '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + color + ';margin-right:6px;vertical-align:middle;flex-shrink:0;"></span>' +
      '#' + obj.object_id + ' — ' + (obj.label || 'objeto');

    if (metricsSearchEl) metricsSearchEl.value = '';

    // ── Skeleton mientras se construye el HTML ───────────────────────────
    metricsModalBody.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:8px;padding-top:4px;">' +
        [1,2,3,4].map(() =>
          '<div style="height:12px;background:#f0edff;border-radius:3px;animation:mao-ia-spin 1s linear infinite;opacity:0.6;"></div>'
        ).join('') +
      '</div>';
    _openMetricsPanel();

    // ── Renderizar contenido en diferido para no bloquear el hilo UI ─────
    setTimeout(() => {
      const groups = [
        { title: 'Geometría', keys: [
          ['area_px','Área (px²)'],['area','Área (unidad)'],['area_unit','Área unidad'],
          ['perimeter_px','Perímetro (px)'],['perimeter','Perímetro (unidad)'],['perimeter_unit','Perím. unidad'],
          ['area_fragmentada_px','Área fragmentada (px²)'],['area_fragmentada','Área fragmentada'],
          ['perimeter_fragmentado_px','Perím. fragmentado (px)'],['perimeter_fragmentado','Perím. fragmentado'],
          ['perdida_area_fragmentacion_percent','Pérdida área frag. (%)'],
          ['perdida_perimetro_fragmentacion_percent','Pérdida perím. frag. (%)'],
          ['width','Ancho'],['height','Alto'],
          ['tight_bounding_width_px','Ancho bbox ajust.'],['tight_bounding_height_px','Alto bbox ajust.'],
          ['tight_bounding_area_px','Área bbox ajust.'],
          ['equivalent_diameter','Diámetro equiv. (px)'],
          ['contour_points','Puntos contorno'],
        ]},
        { title: 'Centroide & Hull', keys: [
          ['centroide_x','Centroide X'],['centroide_y','Centroide Y'],
          ['centroide_hull_x','Centroide hull X'],['centroide_hull_y','Centroide hull Y'],
          ['convex_hull_area','Hull área (px²)'],['convex_hull_perimeter','Hull perímetro (px)'],
          ['convex_hull_point_count','Hull puntos'],
        ]},
        { title: 'Forma', keys: [
          ['circularity','Circularidad'],['circularity_fragmentada','Circ. fragmentada'],
          ['solidity','Solidez'],['solidity_class','Solidez clase'],
          ['compactness','Compacidad'],['rectangularity','Rectangularidad'],
          ['shape_factor','Factor forma'],['bounding_box_efficiency','Efic. bbox'],
          ['elongation','Elongación'],['extent','Extensión'],
          ['aspect_ratio','Relación de aspecto (AR)'],['aspect_ratio_tight','Relación de aspecto (AR) ajust.'],
          ['aspect_ratio_original','Relación de aspecto (AR) original'],
          ['contour_complexity_index','Índice compl. contorno'],
        ]},
        { title: 'Ejes e Inercia', keys: [
          ['eje_mayor_px','Eje mayor (px)'],['eje_menor_px','Eje menor (px)'],
          ['ratio_ejes','Ratio ejes'],
          ['angulo_eje_principal','Ángulo eje princ. (°)'],
          ['eje_principal_orientacion','Orientación eje'],
          ['excentricidad','Excentricidad'],
        ]},
        { title: 'Feret', keys: [
          ['feret_max','Feret máx (px)'],['feret_min','Feret mín (px)'],
          ['feret_ratio','Feret ratio'],
          ['feret_angulo_max','Ángulo Feret máx (°)'],
          ['feret_angulo_min','Ángulo Feret mín (°)'],
        ]},
        { title: 'Radios', keys: [
          ['radio_maximo','Radio máx (px)'],['radio_minimo','Radio mín (px)'],
          ['radio_medio','Radio medio (px)'],
          ['desviacion_radial','Desv. radial (px)'],
          ['ratio_radios','Ratio radios'],['regularidad_radial','Regularidad radial'],
        ]},
        { title: 'Textura y Curvatura', keys: [
          ['rugosidad_contorno','Rugosidad contorno'],
          ['curvatura_media','Curvatura media'],
          ['curvatura_maxima','Curvatura máx'],
          ['curvatura_desviacion','Curvatura desv.'],
          ['varianza_interna','Varianza interna (σ²)'],
          ['entropia_superficie','Entropía superficie'],
          ['gradiente_medio','Gradiente medio'],
        ]},
        { title: 'Vértices', keys: [
          ['vertices_aproximados','Vértices aprox.'],
          ['geometria_vertices','Geometría vértices'],
          ['num_angulos_agudos','Ángulos agudos'],
          ['num_angulos_rectos','Ángulos rectos'],
          ['num_angulos_obtusos','Ángulos obtusos'],
        ]},
        { title: 'Convexidad', keys: [
          ['convexity_class','Clase convexidad'],
          ['convexity_defects_class','Clase def. convexidad'],
          ['indice_lobularidad','Índice lobularidad'],
          ['indice_estrellamiento','Índice estrellamiento'],
        ]},
        { title: 'Clasificación', keys: [
          ['forma_detectada','Forma detectada'],
          ['forma_detectada_mostrada','Forma mostrada'],
          ['forma_geometrica_observada','Forma geométrica observada'],
          ['forma_tipologica_inferida','Interpretación tipológica'],
          ['forma_detectada_tipologica','Forma tipológica (alias)'],
          ['forma_requiere_reinterpretacion_tipologica','Reinterpretación tipológica'],
          ['forma_razon_tipologica','Razón tipológica'],
          ['completitud_estimada','Completitud estim.'],
          ['simetria_bilateral','Simetría bilateral'],
        ]},
      ];

      const fmtV = v => {
        if (v == null) return '<span style="color:#a0aec0;">—</span>';
        if (typeof v === 'object') return '<span style="color:#718096;font-style:italic;">' + JSON.stringify(v).slice(0, 55) + '</span>';
        if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4);
        return String(v);
      };

      const frag = document.createDocumentFragment();

      if (obj._metrics_error) {
        const errDiv = document.createElement('div');
        errDiv.style.cssText = 'color:#e53e3e;padding:7px;background:#fff5f5;border-radius:5px;margin-bottom:8px;font-size:10px;';
        errDiv.innerHTML = '<b>Error:</b> ' + obj._metrics_error;
        frag.appendChild(errDiv);
      }

      const knownKeys = new Set(groups.flatMap(g => g.keys.map(([k]) => k)));

      for (const g of groups) {
        const rows = g.keys.filter(([k]) => obj[k] != null);
        if (!rows.length) continue;

        const groupDiv = document.createElement('div');
        groupDiv.className = 'mao-mgroup';
        groupDiv.style.marginBottom = '10px';

        const header = document.createElement('div');
        header.style.cssText = 'font-weight:700;font-size:10px;color:' + color + ';border-bottom:1.5px solid ' + color + '30;padding-bottom:2px;margin-bottom:3px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;';
        header.innerHTML = g.title + ' <span style="font-size:9px;color:#a0aec0;">(' + rows.length + ')</span>';

        const table = document.createElement('table');
        table.style.cssText = 'width:100%;border-collapse:collapse;font-size:10px;';

        // Colapso de sección al clic en header
        header.addEventListener('click', () => {
          table.style.display = table.style.display === 'none' ? '' : 'none';
        });

        for (const [k, label] of rows) {
          const tr = document.createElement('tr');
          tr.className = 'mao-mrow';
          tr.dataset.key   = k.toLowerCase();
          tr.dataset.label = label.toLowerCase();
          tr.innerHTML =
            '<td style="padding:2px 6px;color:#718096;white-space:nowrap;">' + label + '</td>' +
            '<td style="padding:2px 6px;font-weight:600;text-align:right;cursor:pointer;" title="Clic para copiar">' + fmtV(obj[k]) + '</td>';
          // Clic en valor → copiar
          tr.querySelector('td:last-child').addEventListener('click', () => {
            const val = String(obj[k] ?? '');
            navigator.clipboard.writeText(val).catch(() => {});
            const td = tr.querySelector('td:last-child');
            const orig = td.innerHTML;
            td.innerHTML = '<span style="color:#276749;">✓</span>';
            setTimeout(() => { td.innerHTML = orig; }, 1200);
          });
          table.appendChild(tr);
        }

        groupDiv.appendChild(header);
        groupDiv.appendChild(table);
        frag.appendChild(groupDiv);
      }

      // Métricas extras no conocidas
      const extraEntries = Object.entries(obj).filter(([k]) =>
        !knownKeys.has(k) &&
        !['object_id','label','contour_points','hull_points','convexity_defects',
          'centroid_x','centroid_y','hull_centroid_x','hull_centroid_y',
          'bbox_x','bbox_y','bbox_w','bbox_h','centroide','_metrics_error','_metricsCount'].includes(k)
      );
      if (extraEntries.length) {
        const extraDiv = document.createElement('div');
        extraDiv.className = 'mao-mgroup';
        extraDiv.style.marginBottom = '10px';
        const eh = document.createElement('div');
        eh.style.cssText = 'font-weight:700;font-size:10px;color:#718096;border-bottom:1.5px solid #e2e8f0;padding-bottom:2px;margin-bottom:3px;';
        eh.textContent = 'Otras métricas';
        const et = document.createElement('table');
        et.style.cssText = 'width:100%;border-collapse:collapse;font-size:10px;';
        for (const [k, v] of extraEntries) {
          const tr = document.createElement('tr');
          tr.className = 'mao-mrow';
          tr.dataset.key   = k.toLowerCase();
          tr.dataset.label = k.toLowerCase();
          tr.innerHTML =
            '<td style="padding:2px 6px;color:#718096;">' + k + '</td>' +
            '<td style="padding:2px 6px;font-weight:600;text-align:right;">' + fmtV(v) + '</td>';
          et.appendChild(tr);
        }
        extraDiv.appendChild(eh);
        extraDiv.appendChild(et);
        frag.appendChild(extraDiv);
      }

      metricsModalBody.innerHTML = '';
      metricsModalBody.appendChild(frag);
      _appendMaoEfaPanel(obj).catch((e) => {
        console.warn('[MAO-IA] Error al renderizar panel EFA:', e?.message || e);
      });
    }, 0); // setTimeout 0 — cede el hilo antes de construir el DOM
  }

  // ── Exponer checkServer: polling permanente del dot en el stepper ─────────
  window._maoCheckPythonServer = checkServer;
  setInterval(checkServer, 30000); // actualizar cada 30 s
  // Chequeo inicial al cargar la página (después de que el DOM esté listo)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkServer);
  } else {
    setTimeout(checkServer, 800);
  }

})();
