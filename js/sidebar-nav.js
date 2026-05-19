/**
 * sidebar-nav.js — Coordinación del sidebar con el flujo de análisis MAO
 *
 * Funcionalidades:
 *  1. Click en nav item → scroll suave + marcar activo
 *  2. IntersectionObserver → resaltar item activo al hacer scroll
 *  3. Status dots: ● gris = sin empezar, ● verde = completado, ● ámbar = siguiente paso
 *  4. Contexto del objeto activo (nombre/ID arqueológico) en el bloque de proyecto
 *  5. Chip de modo (Monofacial / Bifacial A·B) reactivo al selector de modo
 *  6. Badge de análisis: N análisis guardados en el proyecto activo
 *  7. Botón Exportar: deshabilitado hasta que existan resultados morfológicos
 *
 * NO modifica analysis-core.js. Observa el DOM desde fuera.
 */
(function () {
  'use strict';

  // ── IDs DOM clave ─────────────────────────────────────────────────────────
  const IDS = {
    scaleBtn:    'calcularEscalaBtn',
    detectBtn:   'detectarObjetosBtn',
    morphCont:   'morphologicalAnalysisContainer',
    edgeCont:    'edgeAnalysisContainer',
    metricsCont: 'metricsTableContainer',
    compareCont: 'comparadorMultiObjetoSection',
    identificacionAsignada: 'identificacionAsignada',
    valorId:     'valorIdentificacionAsignada',
    modoMono:    'modoMonofacial',
    modoBifacial:'modoBifacial',
    // sidebar elements
    proyectoNombre: 'sidebarProyectoNombre',
    objetoActual:   'sidebarObjetoActual',
    analisisBadge:  'sidebarAnalisisBadge',
    modeBar:        'sidebarModeBar',
    modeChip:       'sidebarModeChip',
    modeHint:       'sidebarModeHint',
    exportBtn:      null, // se cachea en init
  };

  const FILE_INPUT_IDS = [
    'jpgInput', 'rawInput',
    'jpgInputCaraA', 'rawInputCaraA',
    'jpgInputCaraB', 'rawInputCaraB',
  ];

  // Secciones del documento en orden de flujo (para IntersectionObserver)
  const SECTION_IDS = [
    'fieldsetGestionProyectos',
    'sectionIdentificacion',
    'sectionModo',
    'sectionImagen',
    'sectionEscala',
    'morphologicalAnalysisContainer',
    'edgeAnalysisContainer',
    'metricsTableContainer',
    'comparadorMultiObjetoSection',
  ];

  // ── Estado interno ────────────────────────────────────────────────────────
  const state = {
    imagenCargada:     false,
    escalaCalculada:   false,
    objetosDetectados: false,
    morfResultados:    false,
    edgeResultados:    false,
    metricsResultados: false,
    proyectoActivo:    false,
    objetoNombre:      '',
    modo:              'monofacial', // 'monofacial' | 'bifacial'
    caraActiva:        null,          // null | 'A' | 'B'
    nAnalisis:         0,
  };

  // ── Mapa de paneles: targetId → secciones a mostrar (el resto se oculta) ─────
  // Solo morfología es el tab activo; bordes y métricas son legacy y no se exponen en UI
  const RESULT_TABS = ['morphologicalAnalysisContainer'];

  const PANEL_MAP = {
    fieldsetGestionProyectos:       ['fieldsetGestionProyectos'],
    sectionIdentificacion:          ['sectionIdentificacion'],
    sectionModo:                    ['sectionModo'],
    sectionImagen:                  ['sectionImagen'],
    sectionEscala:                  ['sectionEscala'],
    sectionCanvas:                  ['sectionEscala'],   // alias → mismo bloque
    morphologicalAnalysisContainer: ['resultadosPanel'],
    comparadorMultiObjetoSection:   ['comparadorMultiObjetoSection'],
    sectionAnalisis3D:              ['sectionAnalisis3D'],  // paneles de análisis 3D
  };

  // IDs de todos los paneles gestionados por activatePanel (únicos, nivel raíz)
  const ALL_PANEL_IDS = [
    'fieldsetGestionProyectos', 'sectionIdentificacion', 'sectionModo',
    'sectionImagen', 'sectionEscala',
    'resultadosPanel',
    'comparadorMultiObjetoSection',
    'sectionAnalisis3D',
  ];

  let _activePanel = 'fieldsetGestionProyectos';
  let _activeTab   = 'morphologicalAnalysisContainer';

  // Activa un tab dentro del panel maestro de resultados
  function activateTab(tabId) {
    if (!RESULT_TABS.includes(tabId)) return;
    _activeTab = tabId;

    RESULT_TABS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === tabId) {
        el.classList.remove('res-hidden');
      } else {
        el.classList.add('res-hidden');
      }
    });

    // Marcar botón de tab activo
    document.querySelectorAll('.res-tab[data-tab]').forEach(btn => {
      const isActive = btn.dataset.tab === tabId;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  function activatePanel(targetId) {
    const toShow = new Set(PANEL_MAP[targetId] ?? [targetId]);
    ALL_PANEL_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (toShow.has(id)) {
        el.classList.remove('mao-panel--hidden');
      } else {
        el.classList.add('mao-panel--hidden');
      }
    });
    _activePanel = PANEL_MAP[targetId]?.[0] ?? targetId;

    // Si el destino es un tab de resultados, activarlo también
    if (RESULT_TABS.includes(targetId)) {
      activateTab(targetId);
    }
  }

  // Referencia al botón de exportar de la card
  let _exportBtn = null;

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. BOTONES DE ACCIÓN DEL SIDEBAR (proxies → botones ocultos del panel)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Conecta los botones del sidebar con sus contrapartes ocultas en el panel.
   * analysis-core.js registra listeners en los IDs originales; los botones del
   * sidebar simplemente delegan el click para no duplicar lógica.
   */
  function setupSidebarActions() {
    const pairs = [
      ['sidebarPerforacionesBtn',        'trazarPerforacionesBtn'],
      ['sidebarAbrirComparadorBtn',       'abrirComparadorBtn'],
      ['sidebarExportCSVBtn',             'exportarAnalisisCompletoBtn'],
      ['sidebarExportPDFBtn',             'exportarPDFIntegralBtn'],
      ['sidebarExportSVGBtn',             'exportarSVGVectorialBtn'],
      ['sidebarExportBifacialCSVBtn',     'exportarComparacionBifacialCSVBtn'],
      ['sidebarExportBifacialPDFBtn',     'exportarComparacionBifacialPDFBtn'],
      ['sidebarNuevoAnalisisBtn',           'nuevoAnalisisBtn'],
    ];
    pairs.forEach(([sidebarId, targetId]) => {
      const sBtn = document.getElementById(sidebarId);
      const tBtn = document.getElementById(targetId);
      if (sBtn && tBtn) {
        sBtn.addEventListener('click', () => tBtn.click());
      }
    });
  }

  /** Muestra u oculta la sección de acciones del sidebar según si hay resultados. */
  function updateActionsSection() {
    const section = document.getElementById('sidebarActionsSection');
    if (!section) return;
    const hasResults = state.morfResultados || !!window.currentAnalyzedObject?.metricas;
    section.hidden = !hasResults;

    // Mostrar grupo bifacial solo cuando la sección de comparación bifacial esté visible
    const bifacialGroup = document.getElementById('sidebarExportBifacialGroup');
    if (bifacialGroup) {
      const bifacialSection = document.getElementById('bifacialComparisonsSection');
      const bifacialVisible = bifacialSection && bifacialSection.style.display !== 'none'
        && bifacialSection.style.display !== '';
      bifacialGroup.hidden = !bifacialVisible;
    }
  }

  /** Sincroniza zoom Cara A ↔ B cuando #syncZoomAB está marcado. */
  function setupBifacialZoomSync() {
    const syncCheck = document.getElementById('syncZoomAB');
    const inA = document.getElementById('zoomInputCaraA');
    const inB = document.getElementById('zoomInputCaraB');
    if (!syncCheck || !inA || !inB) return;
    let syncing = false;
    inA.addEventListener('input', function () {
      if (syncing || !syncCheck.checked) return;
      syncing = true;
      inB.value = inA.value;
      inB.dispatchEvent(new Event('input'));
      syncing = false;
    });
    inB.addEventListener('input', function () {
      if (syncing || !syncCheck.checked) return;
      syncing = true;
      inA.value = inB.value;
      inA.dispatchEvent(new Event('input'));
      syncing = false;
    });
  }

  /** Actualiza el badge con el número de objetos individualizados. */
  function setupIndividualObjCounter() {
    const grid = document.getElementById('individualObjectsGrid');
    const badge = document.getElementById('individualObjCount');
    if (!grid || !badge) return;
    function update() {
      const n = grid.children.length;
      badge.textContent = n;
      badge.hidden = n === 0;
    }
    new MutationObserver(update).observe(grid, { childList: true });
  }

  /** Actualiza el breadcrumb del contenedor morfológico al abrir grupos a/b/c. */
  function setupMorfBreadcrumb() {
    const bcGroup = document.getElementById('morfBcGroup');
    const bcLabel = document.getElementById('morfBcGroupLabel');
    if (!bcGroup || !bcLabel) return;
    const labels = {
      morphGroupA: 'a) Métricas',
      morphGroupB: 'b) Contorno Dep.',
      morphGroupC: 'c) Vista Esquem.',
    };
    ['morphGroupA', 'morphGroupB', 'morphGroupC'].forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('toggle', function () {
        if (this.open) {
          bcLabel.textContent = labels[id];
          bcGroup.hidden = false;
        } else {
          const anyOpen = ['morphGroupA', 'morphGroupB', 'morphGroupC'].some(function (gid) {
            const g = document.getElementById(gid);
            return g && g.open && gid !== id;
          });
          if (!anyOpen) bcGroup.hidden = true;
        }
      });
    });
    // Estado inicial: si morphGroupA está abierto al cargar
    const groupA = document.getElementById('morphGroupA');
    if (groupA && groupA.open) {
      bcLabel.textContent = labels.morphGroupA;
      bcGroup.hidden = false;
    }
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────────────────────────────
  function init() {
    _exportBtn = document.querySelector('.sidebar-card-btn');

    setupClickNav();
    setupResultTabs();
    injectStatusDots();
    setupStatusObservers();
    setupModeObserver();
    setupIdentificacionObserver();
    setupResultCardObserver();
    setupSidebarActions();
    setupBifacialZoomSync();
    setupIndividualObjCounter();
    setupMorfBreadcrumb();
    activatePanel('fieldsetGestionProyectos');
    activateTab('morphologicalAnalysisContainer');

    scheduleStatusUpdate(200);
    scheduleStatusUpdate(1000);
  }

  // Connects click events on the result tabs bar (.res-tab buttons in HTML)
  function setupResultTabs() {
    document.querySelectorAll('.res-tab[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. CLICK NAV → PANEL SWITCHER
  // ═══════════════════════════════════════════════════════════════════════════
  function setupClickNav() {
    const selector = '.mao-nav-item[data-target], .mao-nav-subitem[data-target], .sidebar-card-btn[data-target]';
    document.querySelectorAll(selector).forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        activatePanel(targetId);
        if (btn.classList.contains('mao-nav-item') || btn.classList.contains('mao-nav-subitem')) {
          setActiveItem(btn);
        }
        // Si tiene data-morph-group: asegurar visibilidad, enfocar grupo y scroll
        const groupId = btn.dataset.morphGroup;
        if (groupId) {
          const morphCont = document.getElementById('morphologicalAnalysisContainer');
          if (morphCont && morphCont.style.display === 'none') {
            morphCont.style.display = 'block';
          }
          ['morphGroupA', 'morphGroupB', 'morphGroupC'].forEach(gid => {
            const g = document.getElementById(gid);
            if (g) g.open = (gid === groupId);
          });
          const group = document.getElementById(groupId);
          if (group) {
            setTimeout(() => group.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
          }
        }
        // Si tiene data-scroll-to: navegar al sub-panel dentro de la sección
        const scrollToId = btn.dataset.scrollTo;
        if (scrollToId) {
          const target = document.getElementById(scrollToId + '-anchor') ||
                         document.getElementById(scrollToId);
          if (target) {
            setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
          }
        }
      });
    });
  }

  function setActiveItem(activeBtn) {
    document.querySelectorAll('.mao-nav-item.is-active, .mao-nav-subitem.is-active')
      .forEach(el => el.classList.remove('is-active'));
    activeBtn.classList.add('is-active');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. SCROLL SYNC — IntersectionObserver
  // ═══════════════════════════════════════════════════════════════════════════
  function setupScrollSync() {
    const targets = SECTION_IDS.map(id => document.getElementById(id)).filter(Boolean);
    if (!targets.length) return;

    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length > 0) {
        const btn = document.querySelector(
          `.mao-nav-item[data-target="${visible[0].target.id}"], .mao-nav-subitem[data-target="${visible[0].target.id}"]`
        );
        if (btn) setActiveItem(btn);
      }
    }, { rootMargin: '-8% 0px -70% 0px', threshold: 0 });

    targets.forEach(el => observer.observe(el));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. STATUS DOTS  (gris → ámbar [siguiente] → verde [completo])
  // ═══════════════════════════════════════════════════════════════════════════

  // Orden secuencial de pasos del flujo (para determinar "siguiente pendiente")
  const FLOW_STEPS = [
    { targetId: 'fieldsetGestionProyectos', check: () => state.proyectoActivo },
    { targetId: 'sectionImagen',            check: () => state.imagenCargada   },
    { targetId: 'sectionEscala',            check: () => state.escalaCalculada },
    { targetId: 'sectionCanvas',            check: () => state.objetosDetectados },
    { targetId: 'morphologicalAnalysisContainer', check: () => state.morfResultados },
    { targetId: 'edgeAnalysisContainer',    check: () => state.edgeResultados  },
    { targetId: 'metricsTableContainer',    check: () => state.metricsResultados },
  ];

  // SVG paths compartidos para los tres estados del indicador
  const _NS_SVG = {
    // Check: trazo limpio tipo Feather
    check: '<polyline points="2,6 5,9.5 10,2.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    // Flecha derecha: guía al siguiente paso
    arrow: '<polyline points="3.5,2.5 8.5,5.5 3.5,8.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    // Arco giratorio: proceso en curso
    spin:  '<path d="M9,5.5 A3.5,3.5 0 1,1 8.8,2" stroke-width="2" stroke-linecap="round" fill="none"/>',
  };

  function _makeSvg(pathClass, pathData) {
    return `<svg class="${pathClass}" viewBox="0 0 12 12" fill="none" stroke="currentColor" ` +
           `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${pathData}</svg>`;
  }

  function injectStatusDots() {
    FLOW_STEPS.forEach(({ targetId }) => {
      const btn = navBtnFor(targetId);
      if (btn && !btn.querySelector('.nav-status')) {
        const dot = document.createElement('span');
        dot.className = 'nav-status';
        dot.setAttribute('aria-hidden', 'true');
        dot.innerHTML =
          _makeSvg('ns-check', _NS_SVG.check) +
          _makeSvg('ns-arrow', _NS_SVG.arrow) +
          _makeSvg('ns-spin',  _NS_SVG.spin);
        btn.appendChild(dot);
      }
    });
  }

  function updateStatusDots() {
    // Encontrar el primer paso incompleto (= siguiente acción)
    const nextPendingIdx = FLOW_STEPS.findIndex(s => !s.check());

    FLOW_STEPS.forEach(({ targetId, check }, idx) => {
      const btn = navBtnFor(targetId);
      const dot = btn?.querySelector('.nav-status');
      if (!dot) return;

      if (check()) {
        dot.className = 'nav-status nav-status--done';
      } else if (idx === nextPendingIdx) {
        dot.className = 'nav-status nav-status--next';   // ámbar pulsante
      } else {
        dot.className = 'nav-status';   // gris neutro
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. BLOQUE DE CONTEXTO (objeto, modo, badge)
  // ═══════════════════════════════════════════════════════════════════════════

  function updateContextBlock() {
    // — Nombre del objeto activo —
    const objEl = document.getElementById(IDS.objetoActual);
    if (objEl) {
      if (state.objetoNombre) {
        objEl.textContent = state.objetoNombre;
        objEl.classList.add('has-object');
      } else {
        objEl.textContent = 'Sin objeto';
        objEl.classList.remove('has-object');
      }
    }

    // — Badge de análisis —
    const badgeEl = document.getElementById(IDS.analisisBadge);
    if (badgeEl) {
      const n = state.nAnalisis;
      badgeEl.textContent = n > 99 ? '99+' : String(n);
      badgeEl.title = `${n} análisis guardado${n !== 1 ? 's' : ''} en este proyecto`;
      n > 0 ? badgeEl.classList.add('has-analyses') : badgeEl.classList.remove('has-analyses');
    }

    // — Contador de colección (texto legible) —
    const colEl = document.getElementById('sidebarColeccionCount');
    if (colEl) {
      const n = state.nAnalisis;
      if (n > 0) {
        colEl.textContent = `${n} objeto${n !== 1 ? 's' : ''} en colección`;
        colEl.classList.add('has-items');
      } else {
        colEl.textContent = 'Sin colección';
        colEl.classList.remove('has-items');
      }
    }

    // — Chip de modo —
    const chipEl = document.getElementById(IDS.modeChip);
    const hintEl = document.getElementById(IDS.modeHint);
    if (chipEl) {
      chipEl.className = 'sidebar-mode-chip';   // reset
      if (state.modo === 'bifacial') {
        if (state.caraActiva === 'A') {
          chipEl.textContent = 'Bifacial · A';
          chipEl.classList.add('mode-bifacial-a');
          if (hintEl) hintEl.textContent = 'Anverso activo';
        } else if (state.caraActiva === 'B') {
          chipEl.textContent = 'Bifacial · B';
          chipEl.classList.add('mode-bifacial-b');
          if (hintEl) hintEl.textContent = 'Reverso activo';
        } else {
          chipEl.textContent = 'Bifacial';
          chipEl.classList.add('mode-bifacial');
          if (hintEl) hintEl.textContent = '2 caras';
        }
      } else {
        chipEl.textContent = 'Monofacial';
        if (hintEl) hintEl.textContent = 'Cara única';
      }
    }

    // — Botón exportar: deshabilitado si aún no hay resultados —
    if (_exportBtn) {
      const tieneResultados = state.morfResultados || state.edgeResultados || state.metricsResultados;
      _exportBtn.disabled = !tieneResultados;
      _exportBtn.style.opacity = tieneResultados ? '1' : '0.45';
      _exportBtn.style.cursor  = tieneResultados ? 'pointer' : 'not-allowed';
      _exportBtn.title = tieneResultados
        ? 'Exportar el análisis activo en PDF, CSV o imagen'
        : 'Completa el análisis morfológico para exportar';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. OBSERVADORES DE ESTADO
  // ═══════════════════════════════════════════════════════════════════════════

  function setupStatusObservers() {
    // File inputs → imagen cargada
    FILE_INPUT_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        if (el.files?.length > 0) { state.imagenCargada = true; updateAllStatus(); }
      });
    });

    // MutationObserver en botones clave y contenedores de resultado
    observeElement(IDS.scaleBtn, updateAllStatus);
    observeElement(IDS.detectBtn, updateAllStatus);
    observeElement(IDS.morphCont, updateAllStatus);
    observeElement(IDS.edgeCont, updateAllStatus);
    observeElement(IDS.metricsCont, updateAllStatus);
    // Observar el indicador de identificación asignada
    observeElement(IDS.identificacionAsignada, () => {
      evaluateState();
      updateContextBlock();
    });

    // Poll liviano cada 3s para projectManager (estado en memoria no genera mutaciones)
    setInterval(updateAllStatus, 3000);
  }

  function setupModeObserver() {
    const mono = document.getElementById(IDS.modoMono);
    const bifa = document.getElementById(IDS.modoBifacial);
    [mono, bifa].filter(Boolean).forEach(radio => {
      radio.addEventListener('change', () => {
        evaluateState();
        updateContextBlock();
      });
    });

    // También observar window.deteccionBifacialActiva mediante poll (controlado por analysis-core)
    setInterval(() => {
      const cara = window.deteccionBifacialActiva?.cara ?? null;
      if (cara !== state.caraActiva) {
        state.caraActiva = cara;
        updateContextBlock();
      }
    }, 800);
  }

  function setupIdentificacionObserver() {
    const el = document.getElementById(IDS.valorId);
    if (!el) return;
    new MutationObserver(() => {
      state.objetoNombre = (el.textContent || '').trim().replace(/^[-–]$/, '');
      updateContextBlock();
    }).observe(el, { childList: true, characterData: true, subtree: true });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. MINI-FICHA DE RESULTADOS EN SIDEBAR
  // ═══════════════════════════════════════════════════════════════════════════

  // Referencia al último objeto analizado (para evitar re-renders innecesarios)
  let _lastObjRef = null;

  function setText(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  function updateResultCard() {
    const card = document.getElementById('sidebarResultCard');
    if (!card) return;

    const cur = window.currentAnalyzedObject;
    if (!cur || !cur.metricas) {
      card.hidden = true;
      _lastObjRef = null;
      const _vMBtnH = document.getElementById('sidebarVerMetricasBtn');
      if (_vMBtnH) _vMBtnH.hidden = true;
      return;
    }

    // Evitar re-render si el objeto no cambió
    if (cur === _lastObjRef) return;
    _lastObjRef = cur;

    const m = cur.metricas;

    // ── Forma detectada + confianza ──
    const forma = m.forma_detectada || m.clasificacionForma || 'Indeterminada';
    const rawConf = m.forma_confianza ?? 0;
    const confPct = Math.round(parseFloat(rawConf) > 1 ? parseFloat(rawConf) : parseFloat(rawConf) * 100);

    setText('srcForma', forma);
    const confEl = document.getElementById('srcConfianza');
    if (confEl) {
      confEl.textContent = `${confPct}%`;
      confEl.className = 'src-confianza' + (confPct < 60 ? ' low' : '');
    }

    // ── Calidad de contorno ──
    const rawQuality = m.quality ?? m.calidad ?? 1;
    const quality = parseFloat(rawQuality);
    const qualityPct = Math.round(quality > 1 ? quality : quality * 100);

    const alertEl = document.getElementById('srcAlert');
    if (alertEl) alertEl.hidden = qualityPct >= 60;

    // ── Dimensiones ──
    const fmtMm = (v, dec) => v != null ? `${parseFloat(v).toFixed(dec)}` : null;
    const area  = fmtMm(m.area, 1);
    const perim = fmtMm(m.perimeter ?? m.perimetro, 1);
    const w     = fmtMm(m.width, 1);
    const h     = fmtMm(m.height, 1);

    setText('srcArea',  area  != null ? `${area} mm²` : '—');
    setText('srcPerim', perim != null ? `${perim} mm`  : '—');
    setText('srcWH',    (w && h) ? `${w}×${h}` : '—');

    // ── Barra de calidad (semáforo) ──
    const qBar = document.getElementById('srcQualityBar');
    if (qBar) {
      qBar.style.width = `${qualityPct}%`;
      qBar.className = 'src-bar-fill ' + (
        qualityPct >= 75 ? 'quality-high' :
        qualityPct >= 50 ? 'quality-mid'  : 'quality-low'
      );
    }
    setText('srcQualityVal', `${qualityPct}%`);

    // ── Barra de simetría bilateral ──
    const simRow = document.getElementById('srcSimRow');
    const simRaw = m.simetria_bilateral ?? m.simetria ?? null;
    if (simRaw != null && simRow) {
      const simPct = Math.round(parseFloat(simRaw) > 1 ? parseFloat(simRaw) : parseFloat(simRaw) * 100);
      simRow.hidden = false;
      const sBar = document.getElementById('srcSimBar');
      if (sBar) sBar.style.width = `${simPct}%`;
      setText('srcSimVal', `${simPct}%`);
    } else if (simRow) {
      simRow.hidden = true;
    }

    // Mostrar card y botón de métricas
    card.hidden = false;
    const _vMBtn = document.getElementById('sidebarVerMetricasBtn');
    if (_vMBtn) _vMBtn.hidden = false;

    // ── Tipología arqueológica (Fase 2 IA) ──
    const tipRow = document.getElementById('srcTipologiaRow');
    if (tipRow) {
      const tip = m.tipologia;
      if (tip && tip.tipo && tip.tipo !== 'Indeterminado') {
        const confTipPct = Math.round((tip.confianza || 0) * 100);
        const elIcono = document.getElementById('srcTipologiaIcono');
        const elTipo  = document.getElementById('srcTipologiaTipo');
        const elConf  = document.getElementById('srcTipologiaConf');
        if (elIcono) elIcono.textContent = tip.icono || '🔩';
        if (elTipo)  elTipo.textContent  = tip.subtipo ? `${tip.tipo} — ${tip.subtipo}` : tip.tipo;
        if (elConf)  elConf.textContent  = `${confTipPct}%`;
        // Color dinámico si el backend lo provee
        if (tip.color && tipRow) {
          tipRow.style.background   = tip.color.bg     || '';
          tipRow.style.borderColor  = tip.color.border || '';
          if (elTipo) elTipo.style.color = tip.color.text || '';
        }
        tipRow.hidden = false;
      } else {
        tipRow.hidden = true;
      }
    }
  }

  function setupResultCardObserver() {
    // MutationObserver en el contenedor morfológico: dispara cuando analysis-core inyecta resultados
    const morphCont = document.getElementById(IDS.morphCont);
    if (morphCont) {
      new MutationObserver(() => setTimeout(() => { updateResultCard(); updateActionsSection(); }, 150))
        .observe(morphCont, { childList: true, subtree: false });
    }
    // Poll de respaldo cada 2s (window.currentAnalyzedObject no genera mutaciones DOM)
    setInterval(() => { updateResultCard(); updateActionsSection(); }, 2000);

    // ── Botón "Ver métricas completas" en sidebarResultCard ──────────────────
    const verMetricasBtn = document.getElementById('sidebarVerMetricasBtn');
    if (verMetricasBtn) {
      verMetricasBtn.addEventListener('click', () => {
        const cur = window.currentAnalyzedObject;
        if (!cur || !cur.metricas) return;
        if (typeof window._maoAbrirMetricas === 'function') {
          window._maoAbrirMetricas(cur, cur.metricas);
        }
      });
    }
  }

  // ── Evaluación completa del estado desde el DOM ───────────────────────────
  function evaluateState() {
    // Proyecto activo
    try { state.proyectoActivo = !!projectManager?.activeProject; }
    catch (_) { state.proyectoActivo = false; }

    // N análisis en proyecto
    try {
      state.nAnalisis = projectManager?.activeProject?.analyses?.length ?? 0;
    } catch (_) { state.nAnalisis = 0; }

    // Imagen cargada
    const scaleBtn = document.getElementById(IDS.scaleBtn);
    if (!state.imagenCargada && scaleBtn) state.imagenCargada = !scaleBtn.disabled;

    // Escala calculada
    if (scaleBtn) {
      const bg  = scaleBtn.style.background || '';
      const txt = scaleBtn.textContent || '';
      state.escalaCalculada = bg.includes('28a745') || txt.includes('Lista');
    }

    // Objetos detectados
    const detectBtn = document.getElementById(IDS.detectBtn);
    if (detectBtn) {
      const bg  = detectBtn.style.background || '';
      const txt = detectBtn.textContent || '';
      state.objetosDetectados = bg.includes('17a2b8') || txt.includes('Detectado') || txt.includes('Seleccionar');
    }

    // Resultados
    const morphCont = document.getElementById(IDS.morphCont);
    if (morphCont) {
      state.morfResultados = morphCont.style.display === 'block' ||
        (morphCont.style.display !== 'none' && morphCont.innerHTML.trim().length > 100);
    }
    const edgeCont = document.getElementById(IDS.edgeCont);
    if (edgeCont) state.edgeResultados = edgeCont.style.display !== 'none' && edgeCont.innerHTML.trim().length > 100;

    const metricsCont = document.getElementById(IDS.metricsCont);
    if (metricsCont) state.metricsResultados = metricsCont.style.display !== 'none' && metricsCont.innerHTML.trim().length > 100;

    // Modo de análisis
    const modoBifacialEl = document.getElementById(IDS.modoBifacial);
    state.modo = modoBifacialEl?.checked ? 'bifacial' : 'monofacial';

    // Cara activa (controlada por analysis-core via window.deteccionBifacialActiva)
    state.caraActiva = window.deteccionBifacialActiva?.cara ?? null;

    // Objeto activo
    const valorEl = document.getElementById(IDS.valorId);
    if (valorEl) {
      const txt = (valorEl.textContent || '').trim();
      state.objetoNombre = (txt === '-' || txt === '–') ? '' : txt;
    }
  }

  // ── Actualización coordinada de toda la UI del sidebar ───────────────────
  function updateAllStatus() {
    evaluateState();
    updateStatusDots();
    updateContextBlock();
    updateResultCard();
    updateActionsSection();
  }

  function scheduleStatusUpdate(ms) { setTimeout(updateAllStatus, ms); }

  function observeElement(elId, callback) {
    const el = document.getElementById(elId);
    if (!el) return;
    new MutationObserver(callback).observe(el, {
      attributes: true,
      attributeFilter: ['style', 'disabled'],
      childList: true,
      subtree: false,
    });
  }

  function navBtnFor(targetId) {
    return document.querySelector(
      `.mao-nav-item[data-target="${targetId}"], .mao-nav-subitem[data-target="${targetId}"]`
    );
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exponer activatePanel para uso desde otros módulos (ej. mao-ia.js)
  window.maoActivatePanel = activatePanel;

  // ── Modo 2D / 3D: mostrar u ocultar el ítem “Análisis 3D” en sidebar ──
  // Escucha el evento global que lanza object-dimension-mode.js al cambiar modo.
  window.addEventListener('mao:object-dimension-changed', function (e) {
    const is3d = e?.detail?.mode === '3d';
    const navBtn      = document.getElementById('navAnalisis3DBtn');
    const navSubs     = document.getElementById('navAnalisis3DSubitems');
    if (navBtn)  navBtn.style.display  = is3d ? '' : 'none';
    if (navSubs) navSubs.style.display = is3d ? '' : 'none';
    // Al salir de 3D, si el panel activo era el de análisis 3D, redirigir
    if (!is3d && _activePanel === 'sectionAnalisis3D') {
      activatePanel('sectionImagen');
    }
  });

})();

(function () {
  'use strict';

  // ── IDs de elementos clave para inferir el estado del flujo ─────────────
  const IDS = {
    scaleBtn:   'calcularEscalaBtn',
    detectBtn:  'detectarObjetosBtn',
    morphCont:  'morphologicalAnalysisContainer',
    edgeCont:   'edgeAnalysisContainer',
    metricsCont:'metricsTableContainer',
    compareCont:'comparadorMultiObjetoSection',
  };

  const FILE_INPUT_IDS = [
    'jpgInput', 'rawInput',
    'jpgInputCaraA', 'rawInputCaraA',
    'jpgInputCaraB', 'rawInputCaraB',
  ];

  // Secciones del documento en orden de flujo (para IntersectionObserver)
  const SECTION_IDS = [
    'fieldsetGestionProyectos',
    'sectionIdentificacion',
    'sectionModo',
    'sectionImagen',
    'sectionEscala',
    'morphologicalAnalysisContainer',
    'edgeAnalysisContainer',
    'metricsTableContainer',
    'comparadorMultiObjetoSection',
  ];

  // ── Estado interno ────────────────────────────────────────────────────────
  const state = {
    imagenCargada:     false,
    escalaCalculada:   false,
    objetosDetectados: false,
    morfResultados:    false,
    edgeResultados:    false,
    metricsResultados: false,
    proyectoActivo:    false,
  };

  // ── Puntos de entrada ─────────────────────────────────────────────────────
  function init() {
    setupClickNav();
    setupScrollSync();
    injectStatusDots();
    setupStatusObservers();
    // Evaluación inicial (estado persistido en localStorage)
    scheduleStatusUpdate(200);
    scheduleStatusUpdate(1000); // 2ª pasada por si analysis-core terminó de init
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. CLICK NAV → SCROLL + ACTIVO
  // ═══════════════════════════════════════════════════════════════════════════
  function setupClickNav() {
    const selector = '.mao-nav-item[data-target], .mao-nav-subitem[data-target], .sidebar-card-btn[data-target]';
    document.querySelectorAll(selector).forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const el = document.getElementById(targetId);
        if (!el) return;

        // Scroll suave con offset del header sticky
        const headerH = parseInt(getComputedStyle(document.documentElement)
          .getPropertyValue('--header-height') || '52', 10);
        const rect = el.getBoundingClientRect();
        const scrollTop = window.pageYOffset + rect.top - headerH - 12; // 12px de aire
        window.scrollTo({ top: scrollTop, behavior: 'smooth' });

        // Solo marcar activo en nav items/subitems (no en card btn)
        if (btn.classList.contains('mao-nav-item') || btn.classList.contains('mao-nav-subitem')) {
          setActiveItem(btn);
        }

        // Si tiene data-morph-group: asegurar visibilidad, enfocar grupo y scroll
        const groupId = btn.dataset.morphGroup;
        if (groupId) {
          const morphCont = document.getElementById('morphologicalAnalysisContainer');
          if (morphCont && morphCont.style.display === 'none') {
            morphCont.style.display = 'block';
          }
          ['morphGroupA', 'morphGroupB', 'morphGroupC'].forEach(gid => {
            const g = document.getElementById(gid);
            if (g) g.open = (gid === groupId);
          });
          const group = document.getElementById(groupId);
          if (group) {
            setTimeout(() => group.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
          }
        }
      });
    });
  }

  function setActiveItem(activeBtn) {
    document.querySelectorAll('.mao-nav-item.is-active, .mao-nav-subitem.is-active').forEach(el => {
      el.classList.remove('is-active');
    });
    activeBtn.classList.add('is-active');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. SCROLL SYNC — IntersectionObserver
  // ═══════════════════════════════════════════════════════════════════════════
  function setupScrollSync() {
    const targets = SECTION_IDS
      .map(id => document.getElementById(id))
      .filter(Boolean);

    if (!targets.length) return;

    // Threshold: la sección activa es la que ocupa la franja superior del viewport
    const observer = new IntersectionObserver(entries => {
      // Recogemos todas las secciones actualmente visibles en la franja
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => {
        // La más cercana al tope del viewport
        return a.boundingClientRect.top - b.boundingClientRect.top;
      });
      if (visible.length > 0) {
        highlightNavForSection(visible[0].target.id);
      }
    }, {
      rootMargin: '-8% 0px -70% 0px', // activa la sección en la franja superior ~22%
      threshold: 0,
    });

    targets.forEach(el => observer.observe(el));
  }

  function highlightNavForSection(sectionId) {
    const btn = document.querySelector(
      `.mao-nav-item[data-target="${sectionId}"], .mao-nav-subitem[data-target="${sectionId}"]`
    );
    if (btn) setActiveItem(btn);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. STATUS DOTS — indicadores visuales del estado del flujo
  // ═══════════════════════════════════════════════════════════════════════════

  // Mapa: data-target del nav item → función que devuelve true si el paso está completo
  function statusMap() {
    return {
      'fieldsetGestionProyectos': () => state.proyectoActivo,
      'sectionImagen':            () => state.imagenCargada,
      'sectionEscala':            () => state.escalaCalculada,
      'sectionCanvas':            () => state.objetosDetectados,
      'morphologicalAnalysisContainer': () => state.morfResultados,
      'edgeAnalysisContainer':    () => state.edgeResultados,
      'metricsTableContainer':    () => state.metricsResultados,
    };
  }

  function injectStatusDots() {
    Object.keys(statusMap()).forEach(targetId => {
      const btn = navBtnFor(targetId);
      if (btn && !btn.querySelector('.nav-status')) {
        const dot = document.createElement('span');
        dot.className = 'nav-status';
        dot.setAttribute('aria-hidden', 'true');
        btn.appendChild(dot);
      }
    });
  }

  function scheduleStatusUpdate(ms) {
    setTimeout(updateAllStatus, ms);
  }

  function updateAllStatus() {
    // Actualizar estado desde el DOM
    evaluateState();

    const map = statusMap();
    Object.entries(map).forEach(([targetId, checkFn]) => {
      const btn  = navBtnFor(targetId);
      const dot  = btn?.querySelector('.nav-status');
      if (!dot) return;

      const done  = checkFn();
      dot.className = 'nav-status' + (done ? ' nav-status--done' : '');
    });
  }

  /** Lee el DOM para actualizar el objeto `state` */
  function evaluateState() {
    // Proyecto activo
    try {
      state.proyectoActivo = !!projectManager?.activeProject;
    } catch (_) {
      state.proyectoActivo = false;
    }

    // Imagen cargada: el file input tiene archivo o el btn de escala ya no está deshabilitado
    const scaleBtn = document.getElementById(IDS.scaleBtn);
    if (!state.imagenCargada && scaleBtn) {
      state.imagenCargada = !scaleBtn.disabled;
    }

    // Escala calculada: el botón muestra "Lista" o fondo verde
    if (scaleBtn) {
      const bg   = scaleBtn.style.background || '';
      const txt  = scaleBtn.textContent || '';
      state.escalaCalculada = bg.includes('28a745') || txt.includes('Lista') || txt.includes('Bifacial Lista');
    }

    // Objetos detectados: btn de detección cambia de color a teal (#17a2b8)
    const detectBtn = document.getElementById(IDS.detectBtn);
    if (detectBtn) {
      const bg  = detectBtn.style.background || '';
      const txt = detectBtn.textContent || '';
      state.objetosDetectados = bg.includes('17a2b8') || txt.includes('Detectado') || txt.includes('Seleccionar');
    }

    // Resultados morfológicos: el contenedor está visible
    const morphCont = document.getElementById(IDS.morphCont);
    if (morphCont) {
      state.morfResultados = morphCont.style.display === 'block' || (
        morphCont.style.display !== 'none' && morphCont.innerHTML.trim().length > 100
      );
    }

    // Bordes y métricas (generalmente aparecen junto al morfológico)
    const edgeCont = document.getElementById(IDS.edgeCont);
    if (edgeCont) {
      state.edgeResultados = edgeCont.style.display !== 'none' && edgeCont.innerHTML.trim().length > 100;
    }

    const metricsCont = document.getElementById(IDS.metricsCont);
    if (metricsCont) {
      state.metricsResultados = metricsCont.style.display !== 'none' && metricsCont.innerHTML.trim().length > 100;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. OBSERVADORES — MutationObserver en elementos clave
  // ═══════════════════════════════════════════════════════════════════════════
  function setupStatusObservers() {
    // File inputs → imagen cargada
    FILE_INPUT_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        if (el.files && el.files.length > 0) {
          state.imagenCargada = true;
          updateAllStatus();
        }
      });
    });

    // Observar atributo style del botón de escala
    observeAttribute(IDS.scaleBtn, updateAllStatus);

    // Observar atributo style + textContent del botón de detección
    observeAttribute(IDS.detectBtn, updateAllStatus);

    // Observar display del contenedor morfológico (cambios de style)
    observeAttribute(IDS.morphCont, updateAllStatus);
    observeAttribute(IDS.edgeCont, updateAllStatus);
    observeAttribute(IDS.metricsCont, updateAllStatus);

    // El poll periódico lo maneja la IIFE principal (sidebar-nav.js, primera sección).
    // No se registra un segundo setInterval para evitar que ambos IIFEs sobreescriban
    // los dots con lógica inconsistente cada 3 segundos.
  }

  /**
   * MutationObserver sobre el atributo 'style' de un elemento.
   * También observa cambios de childList (para detectar innerHTML inyectado).
   */
  function observeAttribute(elId, callback) {
    const el = document.getElementById(elId);
    if (!el) return;
    new MutationObserver(callback).observe(el, {
      attributes:    true,
      attributeFilter: ['style', 'disabled'],
      childList:     true,
      subtree:       false,
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function navBtnFor(targetId) {
    return document.querySelector(
      `.mao-nav-item[data-target="${targetId}"], .mao-nav-subitem[data-target="${targetId}"]`
    );
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
