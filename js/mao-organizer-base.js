/**
 * MAO Organizer Base — ADR-005 · Fase 2 (capa compartida de los organizers LAAR)
 * ─────────────────────────────────────────────────────────────────────────────
 * Helpers comunes que ADR-002/003/004 habían copiado en cada organizador de
 * pestaña (setChip, modoFlujo, isVisible, el baile de boot, toast, log). Aquí
 * viven una sola vez como `window.MaoOrganizer`. Lo consumen:
 *   - js/mao-proyecto-organizer.js
 *   - js/mao-captura-organizer.js
 *   - js/mao-analysis-organizer.js
 *
 * ⚠ DEPENDENCIA DURA: este <script> debe cargar ANTES que los tres organizers en
 * index.html. Comentar este archivo SIN comentar los organizers los rompería
 * (ReferenceError de MaoOrganizer). Reversibilidad Strangler Fig: para desactivar
 * una pestaña, comentar SU organizer, no esta base.
 *
 * No inventa estado de negocio: solo presentación y utilidades de DOM.
 */
(function () {
  'use strict';

  /* Chip tri-estado canónico (CSS .laar-chip* de ADR-005). state ∈ 'ok'|'wa'|'none'.
     La geometría densa de la cabecera de Análisis la aporta el override CSS
     `#adr2Header .laar-chip` / `.adr2-ph-card .laar-chip`; no hace falta variante. */
  function setChip(el, state, txt) {
    if (!el) return;
    el.className = 'laar-chip laar-chip--' + state;
    el.textContent = txt;
  }

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function isVisible(node) {
    return !!(node && node.style.display !== 'none' &&
              getComputedStyle(node).display !== 'none');
  }

  /* Modo de trabajo: lee los radios legacy (mismos IDs que el router; no agrava
     la deuda F4 de ADR-001). */
  function readMode() {
    var r3d = $('objectDimension3D');
    var rbi = $('modoBifacial');
    return {
      is3D       : !!(r3d && r3d.checked),
      isBifacial : !!(rbi && rbi.checked)
    };
  }
  function modoFlujo() {
    var m = readMode();
    if (m.is3D) return '3D';
    return '2D · ' + (m.isBifacial ? 'Bifacial' : 'Monofacial');
  }

  /* Toast tolerante: usa el sistema global `toast` si existe, si no, no-op. */
  function toast(kind, msg) {
    var t = window.toast;
    if (t && typeof t[kind] === 'function') t[kind](msg);
  }

  /* Baile readyState unificado: corre `boot` cuando el DOM esté listo. Si ya está
     listo, lo corre ya y (opcional) registra `onReadyAgain` para un re-leído tras
     el init legacy (projects-ui/analysis-core corren en DOMContentLoaded). */
  function bootWhenReady(boot, onReadyAgain) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
      if (typeof onReadyAgain === 'function') {
        document.addEventListener('DOMContentLoaded', onReadyAgain);
      }
    }
  }

  function log(tag, msg) { console.log('[' + tag + '] ' + msg); }

  window.MaoOrganizer = {
    $: $,
    el: el,
    setChip: setChip,
    isVisible: isVisible,
    readMode: readMode,
    modoFlujo: modoFlujo,
    toast: toast,
    bootWhenReady: bootWhenReady,
    log: log
  };
})();
