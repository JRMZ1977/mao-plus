/**
 * MAO Captura Organizer — ADR-004 · Fase 2 (cabecera de chips de estado)
 * ─────────────────────────────────────────────────────────────────────────────
 * Da vida a la cabecera de chips (#adr4CapturaHeader) de la pestaña Captura,
 * resumiendo de un vistazo Imagen · Escala · Objetos · Flujo. NO toca la lógica
 * de captura (analysis-core.js): solo observa señales que el flujo ya produce.
 * Patrón Strangler Fig como mao-proyecto-organizer.js: script independiente,
 * defer, reversible comentando su <script> en index.html.
 *
 * Señales que consume (no inventa estado de negocio):
 *  - Imagen: los <input type=file> de carga (mono jpg/raw, bifacial caras A/B,
 *    OBJ 3D). Lectura directa de `.files` — fiable y sin tocar handlers.
 *  - Escala: textContent de #scaleDisplay ('-' = sin calcular) + visibilidad de
 *    #scaleCorrectedIndicator. Observado con MutationObserver.
 *  - Objetos: #objectCount (texto) + evento `mao:detection:done`.
 *  - Flujo: radios 2D/3D y mono/bifacial + evento `mao:object-dimension-changed`.
 *  - Reset: click en #nuevoAnalisisBtn → chips a estado inicial.
 *
 * Pinta los chips con MO.setChip → lenguaje canónico .laar-chip (ADR-005).
 */
(function () {
  'use strict';

  var MO = window.MaoOrganizer;          /* base compartida (ADR-005) */
  var $ = MO.$;

  /* ── Helpers de estado (readMode/modoFlujo/isVisible viven en MaoOrganizer) ── */
  function fileName(id) {
    var inp = $(id);
    return (inp && inp.files && inp.files.length) ? (inp.files[0].name || '') : '';
  }
  function hasFile(id) { return fileName(id) !== ''; }

  /* ── Pintado de chips (geometría/colores canónicos .laar-chip de ADR-005) ──── */
  function updateImagenChip() {
    var chip = $('adr4ChipImagen');
    if (!chip) return;
    var m = MO.readMode();

    if (m.is3D) {
      var obj = fileName('obj3dInput');
      if (obj) MO.setChip(chip, 'ok', obj);
      else     MO.setChip(chip, 'wa', 'Sin cargar');
      return;
    }

    if (m.isBifacial) {
      var a = hasFile('jpgInputCaraA') || hasFile('rawInputCaraA');
      var b = hasFile('jpgInputCaraB') || hasFile('rawInputCaraB');
      if (a && b)      MO.setChip(chip, 'ok', 'A ✓ · B ✓');
      else if (a)      MO.setChip(chip, 'wa', 'A ✓ · B —');
      else if (b)      MO.setChip(chip, 'wa', 'A — · B ✓');
      else             MO.setChip(chip, 'wa', 'Sin cargar');
      return;
    }

    /* Monofacial 2D */
    var jpg = fileName('jpgInput');
    var raw = fileName('rawInput');
    if (jpg && raw)  MO.setChip(chip, 'ok', jpg + ' (+RAW)');
    else if (jpg)    MO.setChip(chip, 'ok', jpg);
    else if (raw)    MO.setChip(chip, 'ok', raw);
    else             MO.setChip(chip, 'wa', 'Sin cargar');
  }

  function updateEscalaChip() {
    var chip = $('adr4ChipEscala');
    if (!chip) return;
    var disp = $('scaleDisplay');
    var val = disp ? (disp.textContent || '').trim() : '';
    if (!val || val === '-') {
      MO.setChip(chip, 'wa', 'Sin calcular');
      return;
    }
    var corregida = MO.isVisible($('scaleCorrectedIndicator'));
    MO.setChip(chip, 'ok', val + ' mm/px' + (corregida ? ' · corregida' : ''));
  }

  function updateObjetosChip() {
    var chip = $('adr4ChipObjetos');
    if (!chip) return;
    var oc = $('objectCount');
    var txt = oc ? (oc.textContent || '').trim() : '';
    /* ADR-007 §D5 — desglosar referencias (carta de color/escala) si las hay. */
    var objs = window.objects || [];
    var refs = objs.filter(function (o) { return o && o._esReferencia; }).length;
    if (!txt || /sin imagen/i.test(txt)) {
      MO.setChip(chip, 'none', '—');
    } else if (refs > 0) {
      MO.setChip(chip, 'ok', txt + ' · ' + refs + ' ref');
    } else {
      MO.setChip(chip, 'ok', txt);
    }
  }

  /* ── Toolbar de triage del flujo captura→análisis (ADR-007 §D3) ──────────────
     PRESENTACIÓN; la lógica (filtro/batch/guard/referencias) vive en el core
     (analysis-core.js) y se invoca por eventos. Lee `window.objects` (expuesto
     por el IIFE). Dedupe (ADR-007 §D1): NO repite Escala ni conteo total — esos
     son de la cabecera; aquí solo el eje nuevo (confianza · referencias · batch). */
  var _batchProgress = null;

  function _resumenObjetos() {
    var objs = window.objects || [];
    var baja = 0, refs = 0, analizables = 0;
    objs.forEach(function (o) {
      if (o && o._esReferencia) { refs++; return; }
      analizables++;
      if (o && o._confidenceLvl === 'baja') baja++;
    });
    return { total: objs.length, baja: baja, refs: refs, analizables: analizables };
  }

  function renderTriageToolbar(soloRevisar) {
    var bar = $('individualObjectsToolbar');
    if (!bar) return;
    var objs = window.objects || [];
    if (!objs.length) { bar.style.display = 'none'; return; }
    var r = _resumenObjetos();
    bar.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px;';
    bar.textContent = '';

    /* Confianza (eje nuevo): filtro «solo revisar» si hay baja confianza. */
    if (r.baja > 0) {
      var filtro = MO.el('button');
      MO.setChip(filtro, 'wa', (soloRevisar ? '✓ ' : '') + r.baja + ' requieren revisión');
      filtro.style.cursor = 'pointer';
      filtro.title = 'Mostrar solo objetos de baja confianza';
      filtro.addEventListener('click', function () {
        document.dispatchEvent(new CustomEvent('mao:triage-filter:toggle'));
      });
      bar.appendChild(filtro);
    } else {
      var okc = MO.el('span');
      MO.setChip(okc, 'ok', 'Detección sin alertas');
      bar.appendChild(okc);
    }

    /* Referencias (E1): excluidas del análisis. */
    if (r.refs > 0) {
      var rc = MO.el('span');
      MO.setChip(rc, 'none', r.refs + ' referencia' + (r.refs > 1 ? 's' : ''));
      bar.appendChild(rc);
    }

    var spacer = MO.el('span'); spacer.style.flex = '1'; bar.appendChild(spacer);

    /* Batch (C1): la acción la ejecuta el core al recibir el evento. */
    var batch = MO.el('button', '', 'Analizar todos (' + r.analizables + ')');
    batch.id = 'analizarTodosBtn';
    batch.style.cssText = 'padding:6px 14px;font-size:13px;font-weight:500;color:#fff;background:#1565c0;border:none;border-radius:6px;cursor:pointer;';
    if (r.analizables === 0) { batch.disabled = true; batch.style.opacity = '.5'; batch.style.cursor = 'not-allowed'; }
    if (_batchProgress && _batchProgress.running) {
      batch.disabled = true;
      batch.textContent = 'Analizando ' + _batchProgress.done + '/' + _batchProgress.total + '…';
    }
    batch.addEventListener('click', function () {
      document.dispatchEvent(new CustomEvent('mao:batch-analyze:request'));
    });
    bar.appendChild(batch);
  }

  function onBatchProgress(ev) {
    _batchProgress = ev && ev.detail ? ev.detail : null;
    var btn = $('analizarTodosBtn');
    if (btn && _batchProgress && _batchProgress.running) {
      btn.disabled = true;
      btn.textContent = 'Analizando ' + _batchProgress.done + '/' + _batchProgress.total + '…';
    }
    /* running=false → el core re-renderiza el grid (mao:objects:rendered) y la toolbar. */
  }

  function updateFlujoChip() {
    MO.setChip($('adr4ChipFlujo'), 'none', MO.modoFlujo());
  }

  function updateAll() {
    updateImagenChip();
    updateEscalaChip();
    updateObjetosChip();
    updateFlujoChip();
  }

  function resetChips() {
    MO.setChip($('adr4ChipImagen'), 'wa', 'Sin cargar');
    MO.setChip($('adr4ChipEscala'), 'wa', 'Sin calcular');
    MO.setChip($('adr4ChipObjetos'), 'none', '—');
    updateFlujoChip();
  }

  /* ── Cableado ─────────────────────────────────────────────────────────────── */
  function bind() {
    /* Imagen: inputs de archivo (mono / bifacial / 3D). */
    ['jpgInput', 'rawInput',
     'jpgInputCaraA', 'rawInputCaraA', 'jpgInputCaraB', 'rawInputCaraB',
     'obj3dInput'].forEach(function (id) {
      var inp = $(id);
      if (inp) inp.addEventListener('change', updateImagenChip);
    });

    /* Escala: observar el display legacy (lo actualiza analysis-core). */
    var disp = $('scaleDisplay');
    if (disp) new MutationObserver(updateEscalaChip)
      .observe(disp, { childList: true, characterData: true, subtree: true });
    var corr = $('scaleCorrectedIndicator');
    if (corr) new MutationObserver(updateEscalaChip)
      .observe(corr, { attributes: true, attributeFilter: ['style'] });

    /* Objetos: observar el contador + evento de detección. */
    var oc = $('objectCount');
    if (oc) new MutationObserver(updateObjetosChip)
      .observe(oc, { childList: true, characterData: true, subtree: true });
    document.addEventListener('mao:detection:done', updateObjetosChip);

    /* Flujo: 2D/3D + mono/bifacial. El modo también cambia qué input de imagen
       aplica → re-evaluar también el chip Imagen. */
    function onModeChange() { updateFlujoChip(); updateImagenChip(); }
    window.addEventListener('mao:object-dimension-changed', onModeChange);
    ['modoMonofacial', 'modoBifacial', 'objectDimension2D', 'objectDimension3D']
      .forEach(function (id) {
        var r = $(id);
        if (r) r.addEventListener('change', onModeChange);
      });

    /* Reset del espacio de trabajo → chips a estado inicial. */
    var nuevo = $('nuevoAnalisisBtn');
    if (nuevo) nuevo.addEventListener('click', function () { setTimeout(resetChips, 0); });

    /* ADR-007 §D3 — toolbar de triage: el core señala cada re-render del grid y
       el progreso del batch; el cambio de set (referencias) actualiza el chip. */
    document.addEventListener('mao:objects:rendered', function (ev) {
      renderTriageToolbar(!!(ev && ev.detail && ev.detail.soloRevisar));
      updateObjetosChip();
    });
    document.addEventListener('mao:objects:changed', updateObjetosChip);
    document.addEventListener('mao:batch-analyze:progress', onBatchProgress);
  }

  function boot() {
    if (!$('adr4CapturaHeader')) return;   /* pestaña Captura ausente → no-op */
    bind();
    updateAll();
    renderTriageToolbar(false);   /* ADR-007 — por si ya hay objetos al bootear */
    /* analysis-core corre su init en DOMContentLoaded; re-leer tras él. */
    setTimeout(updateAll, 0);
    MO.log('ADR4', 'Captura Organizer activo (chips Imagen/Escala/Objetos/Flujo + toolbar triage ADR-007)');
  }

  MO.bootWhenReady(boot, updateAll);
})();
