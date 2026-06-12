/**
 * MAO Proyecto Organizer — ADR-003 · Fases 2-3 (jerarquía + CTA con guard)
 * ─────────────────────────────────────────────────────────────────────────────
 * Da vida a la cabecera de chips tri-estado (#adr3ProyectoHeader) y al pie con
 * CTA (#adr3ProyectoFooter) de la pestaña Proyecto, sin tocar la lógica legacy
 * de proyectos (projects-ui.js / project-manager.js) ni el sistema de
 * identificación (analysis-core.js). Patrón Strangler Fig como
 * mao-tab-router.js / mao-analysis-organizer.js: script independiente, defer,
 * reversible comentando su <script> en index.html.
 *
 * Señales que consume (no inventa estado propio salvo el del chip ID):
 *  - Proyecto: estado autoritativo en el DOM legacy (#proyectoActivoIndicador
 *    visible = activo; #proyectoActivoNombre = nombre). Se observa con
 *    MutationObserver + se re-lee en `mao:project:saved`.
 *  - ID: eventos `mao:identification:assigned` / `:cleared` (emitidos por
 *    analysis-core.js) + estado del radio Opción C para el caso «auto pendiente».
 *  - Flujo: radios 2D/3D y mono/bifacial + evento `mao:object-dimension-changed`.
 *
 * Acciones:
 *  - #adr3BtnProyecto → delega en #btnGestionarProyectos (crear/activar).
 *  - #adr3BtnContinuar → guard suave (proyecto / ID) → window.maoTabRouter.go('captura').
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* Estado del chip ID: lo mantiene el organizador a partir de eventos. */
  var idState = { asignada: false, valor: '' };

  function _toast(kind, msg) {
    if (typeof toast !== 'undefined' && toast[kind]) toast[kind](msg);
  }

  /* ── Helpers de estado ────────────────────────────────────────────────────── */
  function proyectoActivo() {
    var ind = $('proyectoActivoIndicador');
    return !!(ind && ind.style.display !== 'none' &&
              getComputedStyle(ind).display !== 'none');
  }
  function nombreProyecto() {
    var n = $('proyectoActivoNombre');
    return n ? (n.textContent || '').trim() : '';
  }
  function opcionCSeleccionada() {
    var r = $('modoIdFotografia');
    return !!(r && r.checked);
  }
  function modoFlujo() {
    var r3d = $('objectDimension3D');
    var rbi = $('modoBifacial');
    if (r3d && r3d.checked) return '3D';
    return '2D · ' + ((rbi && rbi.checked) ? 'Bifacial' : 'Monofacial');
  }

  /* ── Pintado de chips ─────────────────────────────────────────────────────── */
  function setChip(el, cls, txt) {
    if (!el) return;
    el.className = 'adr3-chip ' + cls;
    el.textContent = txt;
  }

  function updateProyectoChip() {
    var chip = $('adr3ChipProyecto');
    var btn = $('adr3BtnProyecto');
    if (proyectoActivo()) {
      setChip(chip, 'adr3-chip--ok', nombreProyecto() || 'Proyecto activo');
      if (btn) btn.style.display = 'none';
    } else {
      setChip(chip, 'adr3-chip--wa', 'Sin proyecto');
      if (btn) btn.style.display = '';
    }
  }

  function updateIdChip() {
    var chip = $('adr3ChipId');
    if (idState.asignada) {
      setChip(chip, 'adr3-chip--ok', idState.valor || 'Asignada');
    } else if (opcionCSeleccionada()) {
      setChip(chip, 'adr3-chip--none', 'Auto al cargar imágenes');
    } else {
      setChip(chip, 'adr3-chip--wa', 'Sin asignar');
    }
  }

  function updateFlujoChip() {
    setChip($('adr3ChipFlujo'), 'adr3-chip--none', modoFlujo());
  }

  function updateAll() {
    updateProyectoChip();
    updateIdChip();
    updateFlujoChip();
  }

  /* ── Guard suave del CTA «Continuar a Captura» ────────────────────────────── */
  function onContinuar() {
    /* 1) Proyecto: integridad de guardado (análogo al «cero real» de P/H). */
    if (!proyectoActivo()) {
      var seguir = window.confirm(
        '¿Continuar sin proyecto activo?\n\n' +
        'Los análisis solo se guardarán en el navegador, no en una carpeta de ' +
        'tu computadora.\n\n' +
        'Aceptar = continuar de todos modos · Cancelar = crear/activar un proyecto');
      if (!seguir) { var g = $('btnGestionarProyectos'); if (g) g.click(); return; }
    }

    /* 2) Identificación. Opción C sin asignar aún es un estado LEGÍTIMO: se
       informará y se auto-asignará al cargar las imágenes (ADR-003 §C/§D). */
    if (!idState.asignada) {
      if (opcionCSeleccionada()) {
        _toast('info', 'La identificación se asignará automáticamente al cargar las imágenes.');
      } else {
        var seguirId = window.confirm(
          '¿Continuar sin identificación asignada?\n\n' +
          'Podrás asignarla luego, pero las exportaciones la requieren.');
        if (!seguirId) return;
      }
    }

    if (window.maoTabRouter && typeof window.maoTabRouter.go === 'function') {
      window.maoTabRouter.go('captura');
    } else {
      console.warn('[ADR3] maoTabRouter no disponible');
    }
  }

  /* ── Cableado ─────────────────────────────────────────────────────────────── */
  function bind() {
    var btnProy = $('adr3BtnProyecto');
    if (btnProy) btnProy.addEventListener('click', function () {
      var g = $('btnGestionarProyectos'); if (g) g.click();
    });

    var btnCont = $('adr3BtnContinuar');
    if (btnCont) btnCont.addEventListener('click', onContinuar);

    /* Proyecto: observar el indicador legacy (display lo controla projects-ui). */
    ['proyectoActivoIndicador', 'sinProyectoIndicador', 'proyectoActivoNombre']
      .forEach(function (id) {
        var el = $(id);
        if (el) new MutationObserver(updateProyectoChip)
          .observe(el, { attributes: true, attributeFilter: ['style'], childList: true, characterData: true, subtree: true });
      });
    document.addEventListener('mao:project:saved', updateProyectoChip);

    /* ID: eventos emitidos por analysis-core.js. */
    document.addEventListener('mao:identification:assigned', function (e) {
      idState.asignada = true;
      idState.valor = (e && e.detail && e.detail.valor) ? e.detail.valor : '';
      updateIdChip();
    });
    document.addEventListener('mao:identification:cleared', function () {
      idState.asignada = false;
      idState.valor = '';
      updateIdChip();
    });
    ['modoIdNombre', 'modoIdCampos', 'modoIdFotografia'].forEach(function (id) {
      var r = $(id);
      if (r) r.addEventListener('change', updateIdChip);
    });

    /* Flujo: 2D/3D + mono/bifacial. */
    window.addEventListener('mao:object-dimension-changed', updateFlujoChip);
    ['modoMonofacial', 'modoBifacial', 'objectDimension2D', 'objectDimension3D']
      .forEach(function (id) {
        var r = $(id);
        if (r) r.addEventListener('change', updateFlujoChip);
      });
  }

  function boot() {
    if (!$('adr3ProyectoHeader')) return;   /* pestaña Proyecto ausente → no-op */
    bind();
    updateAll();
    /* projects-ui.js corre su init en DOMContentLoaded; re-leer tras él. */
    setTimeout(updateAll, 0);
    console.log('[ADR3] Proyecto Organizer activo (Fases 2-3: chips + CTA con guard)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
    document.addEventListener('DOMContentLoaded', updateAll);
  }
})();
