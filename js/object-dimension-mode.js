// MAO Plus — Selector global de flujo 2D/3D
// -----------------------------------------------------------------------------
// Define el modo de trabajo ANTES de la identificación del objeto y ajusta la UI.

(() => {
  const STORAGE_KEY = 'mao.objectDimensionMode';

  const r2d = document.getElementById('objectDimension2D');
  const r3d = document.getElementById('objectDimension3D');
  const status = document.getElementById('objectDimensionStatus');

  const secIdent = document.getElementById('sectionIdentificacion');
  const secModo = document.getElementById('sectionModo');
  const secImagen = document.getElementById('sectionImagen');
  const secEscala = document.getElementById('sectionEscala');
  const secObj3d = document.getElementById('sectionObj3D');
  const secResultados = document.getElementById('resultadosPanel');
  const canvas2dArea = document.getElementById('canvasMonofacial');
  const canvas2dScaleLine = document.getElementById('canvas2dScaleLine');

  const navModo = document.querySelector('.mao-nav-item[data-target="sectionModo"]');
  const navImagenParent = document.querySelector('.mao-nav-item[data-target="sectionImagen"]');
  const navObj3dSub = document.querySelector('.mao-nav-subitem[data-target="sectionObj3D"]');
  const navEscalaSub = document.querySelector('.mao-nav-subitem[data-target="sectionEscala"]');
  const navCanvasSub = document.querySelector('.mao-nav-subitem[data-target="sectionCanvas"]');

  if (!r2d || !r3d || !secIdent) return;

  const state = {
    mode: '2d',
    originalNavImagenLabel: null,
    originalNavImagenTarget: null,
  };

  function setDisplay(el, show) {
    if (!el) return;
    el.style.display = show ? '' : 'none';
  }

  function setNavItemDisplay(el, show) {
    if (!el) return;
    el.style.display = show ? '' : 'none';
  }

  function normalizeMode(value) {
    return value === '3d' ? '3d' : '2d';
  }

  function applyMode(mode, { persist = true } = {}) {
    state.mode = normalizeMode(mode);

    // Exponer estado global para otros módulos
    window.maoObjectDimensionMode = state.mode;
    window._maoGetObjectDimension = () => state.mode;
    document.body.dataset.maoObjectDimension = state.mode;

    const is3d = state.mode === '3d';

    // Flujo principal
    setDisplay(secModo, !is3d);
    setDisplay(secImagen, !is3d);
    setDisplay(secEscala, !is3d);
    setDisplay(secObj3d, is3d);
    // Canvas 2D y línea de escala: innecesarios en modo 3D
    setDisplay(canvas2dArea, !is3d);
    setDisplay(canvas2dScaleLine, !is3d);

    // Evitar ruido de resultados 2D al entrar en 3D
    if (is3d) {
      setDisplay(secResultados, false);
    }

    // Sidebar: adaptar navegación al modo
    setNavItemDisplay(navModo, !is3d);

    if (navImagenParent) {
      if (!state.originalNavImagenLabel) {
        const span = navImagenParent.querySelector('span');
        state.originalNavImagenLabel = span ? span.textContent : 'Imagen';
      }
      if (!state.originalNavImagenTarget) {
        state.originalNavImagenTarget = navImagenParent.dataset.target || 'sectionImagen';
      }

      const span = navImagenParent.querySelector('span');
      if (is3d) {
        navImagenParent.dataset.target = 'sectionObj3D';
        if (span) span.textContent = 'Objeto 3D';
      } else {
        navImagenParent.dataset.target = state.originalNavImagenTarget;
        if (span) span.textContent = state.originalNavImagenLabel;
      }
    }

    setNavItemDisplay(navEscalaSub, !is3d);
    setNavItemDisplay(navCanvasSub, !is3d);
    setNavItemDisplay(navObj3dSub, is3d);

    // Estado visual en selector
    if (status) {
      status.textContent = `Modo actual: ${is3d ? '3D' : '2D'}`;
    }

    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, state.mode); } catch (_) {}
    }

    // Notificar a otros módulos
    window.dispatchEvent(new CustomEvent('mao:object-dimension-changed', {
      detail: { mode: state.mode },
    }));

    // Navegación sugerida según modo
    if (typeof window.maoActivatePanel === 'function') {
      window.maoActivatePanel(is3d ? 'sectionObj3D' : 'sectionImagen');
    }
  }

  function init() {
    let saved = '2d';
    try { saved = normalizeMode(localStorage.getItem(STORAGE_KEY) || '2d'); } catch (_) {}

    if (saved === '3d') {
      r3d.checked = true;
    } else {
      r2d.checked = true;
    }

    applyMode(saved, { persist: false });

    r2d.addEventListener('change', () => {
      if (r2d.checked) applyMode('2d');
    });

    r3d.addEventListener('change', () => {
      if (r3d.checked) applyMode('3d');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
