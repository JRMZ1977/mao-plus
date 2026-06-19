// MAO Plus — F2.3: estado de segmentación IA + preparación de MobileSAM ONNX.
// Muestra el motor activo (GrabCut AI vs MobileSAM ONNX) y permite preparar los
// modelos ONNX (descarga mobile_sam.pt + instrucciones de exportación). Reusa
// PythonBridge.sam (status/download). Reversible: comentar el <script> en index.html.
// Inerte si PythonBridge no está disponible (modo solo-JS).
(() => {
  const $ = (id) => document.getElementById(id);
  let _busy = false;

  function _renderStatus(st) {
    const badge = $('samModeBadge');
    const line = $('samStatusLine');
    const btn = $('samPrepareBtn');
    if (!badge) return;

    if (!st) {
      badge.className = 'laar-chip laar-chip--none';
      badge.textContent = 'No disponible';
      if (line) line.textContent = 'Backend de análisis no disponible (modo solo-JS).';
      if (btn) btn.disabled = true;
      return;
    }

    const onnx = st.mode === 'mobilesam_onnx';
    badge.className = 'laar-chip ' + (onnx ? 'laar-chip--ok' : 'laar-chip--none');
    badge.textContent = onnx ? 'MobileSAM ONNX' : 'GrabCut AI';

    if (line) {
      const parts = [
        'onnxruntime: ' + (st.onnxruntime ? 'sí' : 'no'),
        'encoder: ' + (st.encoder_downloaded ? `sí (${st.encoder_size_mb} MB)` : 'no'),
        'decoder: ' + (st.decoder_downloaded ? `sí (${st.decoder_size_mb} MB)` : 'no'),
      ];
      line.textContent = (st.note ? st.note + '  ·  ' : '') + parts.join('  ·  ');
    }

    // Si ya está en ONNX no hay nada que preparar; GrabCut siempre funciona sin descarga.
    if (btn) btn.disabled = onnx || _busy;
  }

  async function _refresh() {
    const PB = window.PythonBridge;
    if (!PB || !PB.sam || (typeof PB.isAvailable === 'function' && !PB.isAvailable())) {
      _renderStatus(null);
      return;
    }
    try {
      const st = await PB.sam.status();
      _renderStatus(st);
    } catch (_e) {
      _renderStatus(null);
    }
  }

  async function _prepare() {
    const PB = window.PythonBridge;
    const btn = $('samPrepareBtn');
    const out = $('samPrepareStatus');
    if (!PB || !PB.sam || _busy) return;

    _busy = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Preparando…'; }
    if (out) { out.style.display = 'block'; out.textContent = 'Descargando mobile_sam.pt y generando instrucciones de exportación… (puede tardar)'; }

    try {
      const res = await PB.sam.download();   // download() ya invalida el caché de status
      if (out) out.textContent = (res && res.message) ? res.message : 'Preparación completada.';
    } catch (e) {
      if (out) { out.style.display = 'block'; out.textContent = 'Error al preparar: ' + ((e && e.message) || e); }
    } finally {
      _busy = false;
      if (btn) btn.textContent = 'Preparar MobileSAM ONNX';
      await _refresh();   // re-evalúa modo + estado del botón
    }
  }

  function _init() {
    const btn = $('samPrepareBtn');
    if (btn) btn.addEventListener('click', _prepare);
    // Re-evaluar cuando el backend pase a 'ready' (arranque en frío).
    if (window.PythonBridge && typeof window.PythonBridge.onStatusChange === 'function') {
      window.PythonBridge.onStatusChange(() => _refresh());
    }
    _refresh();
    setTimeout(_refresh, 4000);   // reintento por si el bridge tarda en conectar
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();
