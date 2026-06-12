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
 * Reusa las clases de chip LAAR de ADR-003 (.adr3-chip / --ok / --wa / --none).
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
    if (!txt || /sin imagen/i.test(txt)) {
      MO.setChip(chip, 'none', '—');
    } else {
      MO.setChip(chip, 'ok', txt);
    }
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
  }

  function boot() {
    if (!$('adr4CapturaHeader')) return;   /* pestaña Captura ausente → no-op */
    bind();
    updateAll();
    /* analysis-core corre su init en DOMContentLoaded; re-leer tras él. */
    setTimeout(updateAll, 0);
    MO.log('ADR4', 'Captura Organizer activo (Fase 2: chips Imagen/Escala/Objetos/Flujo)');
  }

  MO.bootWhenReady(boot, updateAll);
})();
