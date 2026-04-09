// MAO Plus — Controles de Ventana Unificados
// =============================================================================
// Inyecta tres puntos de control estilo macOS (cerrar / colapsar / expandir)
// en el header de cada modal y panel de la aplicación.
//
// Configuración por modal:
//   closeId     — ID del botón de cierre existente; el dot rojo lo reutiliza
//                 y lo oculta visualmente (el handler original sigue activo).
//   headerSel   — Selector CSS del elemento donde se inyectan los dots.
//                 Si se omite, se calcula automáticamente como
//                 closeBtn.parentElement subiendo `levelsUp` niveles.
//   levelsUp    — Cuántos niveles de parentElement subir desde closeId
//                 para llegar al contenedor del header (default: 1).
//   innerSel    — Selector del elemento interno que se expande a fullscreen.
//   expand      — true si el modal soporta expansión a pantalla completa.
//   collapse    — true si el panel soporta colapso a solo header.
//   hideClose   — false para NO ocultar el botón de cierre original
//                 (default: true).
// =============================================================================

const MaoWindowControls = (() => {

  // ── Registro declarativo de todos los modales ────────────────────────────
  const REGISTRY = [
    // ── PS Parcial / GPA ────────────────────────────────────────────────
    {
      id:       'psModal',
      closeId:  'psCerrarBtn',
      levelsUp: 1,                       // psCerrarBtn está dentro del header flex
      innerSel: '#psModal > div',
      expand:   true,
      collapse: false,
    },
    // ── MAO IA ──────────────────────────────────────────────────────────
    {
      id:             'maoIaModal',
      closeId:        'maoIaModalClose',
      levelsUp:       1,                 // botón directo en la barra de cabecera
      innerSel:       '#maoIaModalInner',
      expand:         true,
      collapse:       false,
      extraHideIds:   ['maoIaFullscreen'], // ocultar también el botón ⛶ existente
      expandTriggerId: 'maoIaFullscreen',  // reutilizar su handler para expand
    },
    // ── Tabla Completa de Métricas ───────────────────────────────────────
    {
      id:       'modalTablaMetricas',
      closeId:  'cerrarModalTablaMetricas',
      levelsUp: 1,                       // botón en el div flex de la cabecera
      innerSel: '#modalTablaMetricas > div',
      expand:   true,
      collapse: false,
    },
    // ── Trazado de Perforaciones ─────────────────────────────────────────
    {
      id:       'perforationCanvasModal',
      closeId:  'closePerforationCanvasBtn',
      levelsUp: 2,                       // botón ← div.actions ← div.header
      innerSel: '#perforationCanvasContainer',
      expand:   true,
      collapse: false,
    },
    // ── Geometría Manual ────────────────────────────────────────────────
    {
      id:       'geometryManualModal',
      closeId:  'closeGeometryModalBtn',
      levelsUp: 2,                       // misma estructura que perforaciones
      innerSel: '#geometryManualContainer',
      expand:   true,
      collapse: false,
    },
    // ── Panel de Proyectos (slide-in lateral) ───────────────────────────
    {
      id:        'projectsPanel',
      closeId:   'closeProjectsPanel',
      levelsUp:  1,
      innerSel:  null,
      expand:    false,
      collapse:  true,
    },
    // ── Modal Crear / Editar Proyecto ───────────────────────────────────
    {
      id:        'projectModalOverlay',
      headerSel: '#projectModalOverlay .project-modal-header', // cancelBtn está en el footer
      closeId:   'cancelProjectBtn',
      hideClose: false,                  // cancelBtn es contextual; no ocultarlo
      innerSel:  '#projectModalOverlay .project-modal',
      expand:    false,
      collapse:  false,
    },
    // ── Panel de Colección ──────────────────────────────────────────────
    {
      id:       'collectionPanel',
      closeId:  'closeCollectionPanel',
      levelsUp: 1,
      innerSel: '#collectionPanel > div',
      expand:   true,
      collapse: true,
    },
    // ── Visor de Análisis ────────────────────────────────────────────────
    {
      id:       'analysisViewerOverlay',
      closeId:  'closeAnalysisViewer',
      levelsUp: 2,                       // botón ← div.actions ← .analysis-viewer-header
      innerSel: '#analysisViewerOverlay .analysis-viewer-modal',
      expand:   true,
      collapse: false,
    },
  ];

  // ── Estado interno ───────────────────────────────────────────────────────
  const _fsActive  = {};   // { modalId: bool } — fullscreen activo
  const _colActive = {};   // { modalId: bool } — colapsado activo

  // ── Helpers de DOM ──────────────────────────────────────────────────────

  function _dot(cssClass, title) {
    const btn = document.createElement('button');
    btn.type  = 'button';
    btn.className = `mao-win-dot ${cssClass}`;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    return btn;
  }

  function _findHeader(cfg) {
    // 1. Selector explícito (para projectModalOverlay, etc.)
    if (cfg.headerSel) return document.querySelector(cfg.headerSel);

    // 2. parentElement n veces desde el botón de cierre
    const closeBtn = cfg.closeId ? document.getElementById(cfg.closeId) : null;
    if (!closeBtn) return null;
    let el = closeBtn;
    const levels = cfg.levelsUp ?? 1;
    for (let i = 0; i < levels; i++) {
      if (!el.parentElement) return null;
      el = el.parentElement;
    }
    return el;
  }

  // ── Colapsar / restaurar paneles ────────────────────────────────────────

  function _toggleCollapse(cfg) {
    const root = document.getElementById(cfg.id);
    if (!root) return;
    _colActive[cfg.id] = !_colActive[cfg.id];
    root.classList.toggle('mao-modal--collapsed', _colActive[cfg.id]);
  }

  // ── Expandir / restaurar (fullscreen) ───────────────────────────────────

  function _toggleFullscreen(cfg, dotExpand) {
    // Si el modal tiene su propio botón de fullscreen, delegamos en él
    if (cfg.expandTriggerId) {
      const trig = document.getElementById(cfg.expandTriggerId);
      if (trig) { trig.click(); return; }
    }

    const inner = cfg.innerSel
      ? document.querySelector(cfg.innerSel)
      : document.getElementById(cfg.id);
    if (!inner) return;

    if (!_fsActive[cfg.id]) {
      // Guardar estilos inline actuales para poder restaurarlos
      cfg._savedStyles = {
        maxWidth:     inner.style.maxWidth,
        width:        inner.style.width,
        maxHeight:    inner.style.maxHeight,
        height:       inner.style.height,
        borderRadius: inner.style.borderRadius,
        margin:       inner.style.margin,
      };
      inner.classList.add('mao-modal--fullscreen');
      _fsActive[cfg.id] = true;
      dotExpand.title = 'Restaurar tamaño';
      dotExpand.setAttribute('aria-label', 'Restaurar tamaño');
    } else {
      inner.classList.remove('mao-modal--fullscreen');
      if (cfg._savedStyles) Object.assign(inner.style, cfg._savedStyles);
      _fsActive[cfg.id] = false;
      dotExpand.title = 'Expandir a pantalla completa';
      dotExpand.setAttribute('aria-label', 'Expandir a pantalla completa');
    }
  }

  // ── Construir los tres dots ──────────────────────────────────────────────

  function _buildControls(cfg) {
    const wrap = document.createElement('div');
    wrap.className = 'mao-win-controls';

    // ● Cerrar
    const dClose = _dot('mao-win-dot--close', 'Cerrar');
    dClose.addEventListener('click', e => {
      e.stopPropagation();
      const btn = document.getElementById(cfg.closeId);
      if (btn) btn.click();
    });

    // ● Colapsar
    const dCollapse = _dot(
      cfg.collapse ? 'mao-win-dot--minimize' : 'mao-win-dot--minimize mao-win-dot--off',
      cfg.collapse ? 'Colapsar' : ''
    );
    if (cfg.collapse) {
      dCollapse.addEventListener('click', e => {
        e.stopPropagation();
        _toggleCollapse(cfg);
        dCollapse.title = _colActive[cfg.id] ? 'Restaurar' : 'Colapsar';
      });
    }

    // ● Expandir
    const dExpand = _dot(
      cfg.expand ? 'mao-win-dot--expand' : 'mao-win-dot--expand mao-win-dot--off',
      cfg.expand ? 'Expandir a pantalla completa' : ''
    );
    if (cfg.expand) {
      dExpand.addEventListener('click', e => {
        e.stopPropagation();
        _toggleFullscreen(cfg, dExpand);
      });
    }

    wrap.append(dClose, dCollapse, dExpand);
    return wrap;
  }

  // ── Inyectar controles en un modal ──────────────────────────────────────

  function _inject(cfg) {
    const modalRoot = document.getElementById(cfg.id);
    if (!modalRoot) return;

    const header = _findHeader(cfg);
    if (!header) return;

    // Evitar doble inyección
    if (header.querySelector('.mao-win-controls')) return;

    const controls = _buildControls(cfg);
    header.insertBefore(controls, header.firstChild);

    // Ocultar botón(es) de cierre originales
    const shouldHide = cfg.hideClose !== false;
    if (shouldHide && cfg.closeId) {
      const orig = document.getElementById(cfg.closeId);
      if (orig) orig.style.display = 'none';
    }
    if (cfg.extraHideIds) {
      cfg.extraHideIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  function init() {
    for (const cfg of REGISTRY) _inject(cfg);
  }

  // Ejecutar después de que todos los módulos hayan bindado sus botones
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(init));
  } else {
    requestAnimationFrame(init);
  }

  return { init };

})();
