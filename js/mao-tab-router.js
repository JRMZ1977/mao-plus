/**
 * MAO-plus — Tab Router LAAR
 * js/mao-tab-router.js
 *
 * Reemplaza la navegación por sidebar-scroll por pestañas de flujo.
 * Compatible con el index.html existente (4460 líneas): solo controla
 * display:block/none de secciones — NO toca IDs, funciones, ni módulos
 * externos (python-bridge.js, mao-ia.js, export-manager.js).
 *
 * ARQUITECTURA:
 *   Selector de secciones → array TABS → tab-router inyecta el tabbar
 *   al inicio de #mainContent → controla visibilidad
 *
 * PATRÓN:
 *   Strangler Fig (Fowler, 2004): envuelve la navegación existente
 *   sin tocar la lógica de negocio. La sidebar puede desactivarse con
 *   CSS (display:none en mao-tabs-laar.css) sin romper nada.
 *
 * USO:
 *   <script src="js/mao-tab-router.js" defer></script>
 *   (cargar después de que el DOM esté listo)
 *
 * CONFIGURACIÓN ÚNICA: editar el array TABS más abajo.
 */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════════
     CONFIGURACIÓN DE PESTAÑAS
     Mapea cada pestaña a los IDs de las secciones del DOM que contiene.

     id         → identificador único de la pestaña (se usa para data-tab)
     label      → texto visible (se muestra en uppercase por CSS)
     icon       → texto/emoji/número para el tab-dot (opcional)
     sections   → array de IDs del DOM que esta pestaña hace visibles.
                  El resto se oculta. Ajustados a los IDs reales de index.html.
     locked     → si true, la pestaña no es clickeable hasta que se habilite
                  (llamar router.unlock('id') para habilitarla)
  ═══════════════════════════════════════════════════════════════════════ */
  var TABS = [
    {
      id       : 'proyecto',
      label    : 'Proyecto',
      icon     : '①',
      sections : [
        'adr3ProyectoHeader',          // Cabecera de chips tri-estado (ADR-003 F2)
        'fieldsetGestionProyectos',   // Gestión de proyectos
        'sectionFlujo',                // §2 Flujo de trabajo: 2D/3D + mono/bifacial (ADR-003 F2)
        'sectionModo',                 // Anidado en sectionFlujo; listado para que el
                                       // re-afirmado DOMContentLoaded lo rescate de la nav legacy
        'sectionIdentificacion',       // Identificación del objeto
        'adr3ProyectoFooter'           // CTA «Continuar a Captura» con guard suave (ADR-003 F3)
      ],
      locked   : false
    },
    {
      id       : 'captura',
      label    : 'Captura',
      icon     : '②',
      sections : [
        'adr4CapturaHeader',          // Cabecera de chips de estado (ADR-004 F2)
        'sectionImagen',              // Carga de imagen(es) JPG/RAW
        'sectionObj3D',               // Flujo OBJ 3D (visible solo en modo 3D)
        'sectionEscala',              // Configuración, escala y detección
        'canvasMonofacial',           // Canvas principal modo monofacial
        'canvasBifacial',             // Canvas dual modo bifacial
        'individualObjectsContainer', // Objetos individualizados
        'nuevoAnalisisBtnContainer'   // Botón reset espacio de trabajo
      ],
      locked   : false
    },
    {
      id       : 'analisis',
      label    : 'Análisis',
      icon     : '③',
      sections : [
        'sectionAnalisis3D',               // Descriptores morfológicos 3D
        'morphologicalAnalysisContainer',  // Panel maestro de resultados 2D
        'bifacialComparisonsSection',      // Comparación bifacial
        /* 'sidebarResultCard' retirado de Análisis (ADR-002 Fase 2): la
           cabecera #adr2Header del organizador lo absorbe. Sigue listado en
           Resultados. El nodo permanece en el DOM (oculto), así el botón
           «Tabla completa ›» de la cabecera puede delegarle el click. */
        'sidebarActionsSection'            // Perforaciones + exportar + nuevo análisis (reubicado)
      ],
      /* Guard de prerrequisito (ADR-001 · Opción A): se desbloquea con
         mao:detection:done. Evita llegar a Análisis con panel vacío. */
      locked   : true
    },
    {
      id       : 'resultados',
      label    : 'Resultados',
      icon     : '④',
      sections : [
        'adr5ResultadosHeader',         // Cabecera de chips de estado (ADR-005 Resultados)
        'resultadosPanel',              // Panel maestro de resultados
        'comparadorMultiObjetoSection', // Comparador multi-objeto (CMO)
        'sidebarResultCard',            // Resumen de resultado (reubicado del sidebar)
        'sidebarActionsSection'         // Perforaciones + exportar + nuevo análisis (reubicado)
      ],
      locked   : false
    }
  ];

  /* Flat list of all section IDs across all tabs — deduplicated, computed once */
  var ALL_SECTIONS = (function () {
    var acc = [];
    TABS.forEach(function (tab) {
      tab.sections.forEach(function (sid) {
        if (acc.indexOf(sid) === -1) acc.push(sid);
      });
    });
    return acc;
  }());

  /* ═══════════════════════════════════════════════════════════════════════
     ESTADO INTERNO
  ═══════════════════════════════════════════════════════════════════════ */
  var state = {
    active   : 'proyecto',
    done     : [],          // ids de pestañas completadas
    badges   : {},          // { id: numero } para badges de advertencia
    locked   : []           // ids de pestañas bloqueadas
  };

  var tabEls      = {}; // { tabId: button element } — reset + populated by buildTabBar
  var progressSegs = {}; // { tabId: segment element } — reset + populated by buildTabBar

  /* Inicializar locks desde TABS */
  TABS.forEach(function (tab) {
    if (tab.locked) state.locked.push(tab.id);
  });

  /* ═══════════════════════════════════════════════════════════════════════
     REUBICAR CONTROLES HUÉRFANOS DEL SIDEBAR
     El sidebar (#maoSidebar) se oculta porque las pestañas reemplazan la
     navegación. Pero el resumen de resultado y la sección de acciones
     (Perforaciones, Exportar CSV/PDF/SVG/PNG, Nuevo Análisis) vivían dentro
     del sidebar y quedaban inaccesibles. Se mueven al contenedor de contenido
     (preservando IDs y listeners) y se registran en las pestañas Análisis y
     Resultados (ver TABS). Mover el nodo conserva su cableado legacy
     (sidebar-nav.js delega los clicks a los botones reales ocultos).
  ═══════════════════════════════════════════════════════════════════════ */
  function relocateOrphanedControls() {
    var host = (
      document.querySelector('.mao-main .container') ||
      document.getElementById('mainContent') ||
      document.querySelector('main') ||
      document.body
    );
    if (!host) return;

    /* ── Sacar el panel morfológico de #resultadosPanel ──────────────────────
       El contenedor maestro #morphologicalAnalysisContainer (Métricas + EFA +
       Contorno depurado + Vista esquemática + canvas esquemático) pertenece a la
       pestaña Análisis, pero estaba físicamente ANIDADO dentro de #resultadosPanel
       (sección de la pestaña Resultados). Al activar Análisis, el router des-ocultaba
       el hijo, pero su padre #resultadosPanel recibía .mao-panel--hidden
       (display:none !important) → el panel colapsaba a 0px de alto y quedaba invisible
       (solo se veían las tarjetas sidebar reubicadas más abajo). Lo movemos a ser
       HERMANO de #resultadosPanel para que el router lo controle de forma
       independiente. Idempotente (HMR-safe): solo mueve si aún está anidado. */
    var morph = document.getElementById('morphologicalAnalysisContainer');
    var resPanel = document.getElementById('resultadosPanel');
    if (morph && resPanel && morph.parentElement === resPanel && resPanel.parentElement) {
      resPanel.parentElement.insertBefore(morph, resPanel);
    }

    ['sidebarResultCard', 'sidebarActionsSection'].forEach(function (id) {
      var node = document.getElementById(id);
      if (node && node.parentElement !== host) {
        host.appendChild(node);
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     TECLADO DEL TABLIST (patrón ARIA: flechas mueven foco y activan)
  ═══════════════════════════════════════════════════════════════════════ */
  function firstUnlockedFrom(startIdx, dir) {
    var n = TABS.length;
    for (var i = 0; i < n; i++) {
      var idx = ((startIdx + dir * i) % n + n) % n;
      if (state.locked.indexOf(TABS[idx].id) === -1) return idx;
    }
    return -1;
  }

  function handleTabKeydown(e, tabId) {
    var idx = TABS.findIndex(function (t) { return t.id === tabId; });
    if (idx === -1) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (state.locked.indexOf(tabId) === -1) router.go(tabId);
      return;
    }

    var target = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = firstUnlockedFrom(idx + 1, 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = firstUnlockedFrom(idx - 1, -1);
    else if (e.key === 'Home') target = firstUnlockedFrom(0, 1);
    else if (e.key === 'End') target = firstUnlockedFrom(TABS.length - 1, -1);
    else return;

    e.preventDefault();
    if (target === -1) return;
    router.go(TABS[target].id);
    var el = document.getElementById('maoTab-' + TABS[target].id);
    if (el) el.focus();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CONSTRUIR TABBAR
     Inyecta <div id="maoTabBar"> antes del contenedor de secciones.
  ═══════════════════════════════════════════════════════════════════════ */
  function buildTabBar() {
    /* Evitar doble inyección — eliminar anterior si existe (para HMR) */
    var existing = document.getElementById('maoTabBar');
    if (existing) existing.remove();
    if (document.getElementById('maoTabBar')) return;
    tabEls = {}; progressSegs = {};

    var bar = document.createElement('div');
    bar.id = 'maoTabBar';
    bar.className = 'mao-tabbar';
    /* Estilos provienen de css/mao-tabs-laar.css (.mao-tabbar). No se usan
       estilos inline: anulaban las reglas de hover/done/indicador del CSS. */
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-label', 'Flujo de trabajo MAO');

    TABS.forEach(function (tab) {
      var el = document.createElement('div');
      el.className = 'mao-tab';
      el.id = 'maoTab-' + tab.id;
      el.setAttribute('data-tab', tab.id);
      el.setAttribute('role', 'tab');
      el.setAttribute('aria-selected', 'false');
      el.setAttribute('tabindex', '-1');   // roving tabindex (lo ajusta updateTabBarUI)
      if (tab.sections && tab.sections.length) {
        el.setAttribute('aria-controls', tab.sections.join(' '));
      }

      if (state.locked.indexOf(tab.id) !== -1) {
        el.classList.add('mao-tab--locked');
        el.setAttribute('aria-disabled', 'true');
      }

      var indicator = document.createElement('span');
      indicator.className = 'tab-indicator';

      var iconSpan = document.createElement('span');
      iconSpan.className = 'tab-icon';
      iconSpan.setAttribute('aria-hidden', 'true');
      iconSpan.textContent = tab.icon || '';

      var labelSpan = document.createElement('span');
      labelSpan.className = 'tab-label';
      labelSpan.textContent = tab.label;

      el.appendChild(indicator);
      el.appendChild(iconSpan);
      el.appendChild(document.createTextNode(' '));
      el.appendChild(labelSpan);

      el.addEventListener('click', function () {
        if (state.locked.indexOf(tab.id) === -1) {
          router.go(tab.id);
        }
      });

      el.addEventListener('keydown', function (e) {
        handleTabKeydown(e, tab.id);
      });

      bar.appendChild(el);
      tabEls[tab.id] = el;
    });

    /* Barra de progreso */
    var prog = document.createElement('div');
    prog.className = 'tab-progress';
    prog.id = 'maoTabProgress';
    TABS.forEach(function (tab) {
      var seg = document.createElement('div');
      seg.className = 'tab-progress-seg';
      seg.setAttribute('data-progress-tab', tab.id);
      prog.appendChild(seg);
      progressSegs[tab.id] = seg;
    });
    var progLabel = document.createElement('span');
    progLabel.className = 'tab-progress-label';
    progLabel.id = 'maoProgressLabel';
    prog.appendChild(progLabel);
    bar.appendChild(prog);

    /* Insertar en el contenedor host correcto (donde están los fieldsets) */
    var host = (
      document.querySelector('.mao-main .container') ||  // ← Ubicación correcta de fieldsets
      document.getElementById('mainContent') ||
      document.getElementById('content') ||
      document.querySelector('main') ||
      document.body
    );

    if (host && host.firstChild) {
      host.insertBefore(bar, host.firstChild);
    } else if (host) {
      host.appendChild(bar);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     VISIBILIDAD AUTORITATIVA DE SECCIONES
     La navegación legacy (sidebar-nav.js / object-dimension-mode.js) oculta
     paneles con la clase .mao-panel--hidden, definida en main.css como
     `display:none !important`. Si el router mostrara secciones solo con
     `style.display = ''`, NO podría vencer a ese !important y las secciones de
     la pestaña activa quedarían ocultas. Además la navegación legacy corre en
     DOMContentLoaded (después del router, que es `defer`) y re-oculta.
     Por eso el router usa la MISMA clase:
       - ocultar  → añade .mao-panel--hidden (gana a cualquier style.display)
       - mostrar  → quita la clase y limpia el inline (vuelve al display natural)
  ═══════════════════════════════════════════════════════════════════════ */
  var HIDDEN_CLASS = 'mao-panel--hidden';
  function setSectionVisible(el, show) {
    if (!el) return;
    if (show) {
      el.classList.remove(HIDDEN_CLASS);
      el.style.display = '';
    } else {
      el.classList.add(HIDDEN_CLASS);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     MOSTRAR / OCULTAR SECCIONES
  ═══════════════════════════════════════════════════════════════════════ */
  function showSectionsFor(tabId) {
    /* Ocultar todas (vía .mao-panel--hidden, ver setSectionVisible). No se
       manipula la clase genérica 'active' (la usa la lógica legacy). */
    ALL_SECTIONS.forEach(function (sid) {
      setSectionVisible(document.getElementById(sid), false);
    });

    /* Mostrar las de la pestaña activa */
    var activeTab = TABS.find(function (t) { return t.id === tabId; });
    if (!activeTab) return;

    activeTab.sections.forEach(function (sid) {
      var el = document.getElementById(sid);
      if (el) {
        setSectionVisible(el, true);
        /* Relación ARIA pestaña↔panel */
        el.setAttribute('role', 'tabpanel');
        el.setAttribute('aria-labelledby', 'maoTab-' + tabId);
      }
    });

    /* Corrección según modo activo (2D/3D · monofacial/bifacial) */
    applyModeVisibility(tabId);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     VISIBILIDAD SEGÚN MODO
     El show-pass de showSectionsFor revela TODAS las secciones de la pestaña,
     pero canvasMonofacial/canvasBifacial y las secciones 3D son mutuamente
     excluyentes según el modo. Lee el estado real desde los radios del DOM
     (fuente de verdad) y oculta lo que no corresponde, evitando que aparezcan
     ambos canvas a la vez o secciones 3D en modo 2D.
  ═══════════════════════════════════════════════════════════════════════ */
  function readMode() {
    var r3d = document.getElementById('objectDimension3D');
    var rbi = document.getElementById('modoBifacial');
    return {
      is3D       : !!(r3d && r3d.checked),
      isBifacial : !!(rbi && rbi.checked)
    };
  }

  function setDisp(id, show) {
    setSectionVisible(document.getElementById(id), show);
  }

  function applyModeVisibility(tabId) {
    var m = readMode();
    if (tabId === 'proyecto') {
      /* mono/bifacial solo aplica al flujo 2D. El show-pass limpia el inline
         display que object-dimension-mode.js puso, así que se re-deriva aquí
         desde los radios (ADR-003 F2; corrige además el caso pre-existente). */
      setDisp('sectionModo', !m.is3D);
    } else if (tabId === 'captura') {
      setDisp('sectionObj3D', m.is3D);
      if (m.is3D) {
        setDisp('canvasMonofacial', false);
        setDisp('canvasBifacial', false);
      } else {
        setDisp('canvasMonofacial', !m.isBifacial);
        setDisp('canvasBifacial', m.isBifacial);
      }
    } else if (tabId === 'analisis') {
      setDisp('sectionAnalisis3D', m.is3D);
      if (m.is3D) {
        setDisp('morphologicalAnalysisContainer', false);
        setDisp('bifacialComparisonsSection', false);
      } else if (!m.isBifacial) {
        setDisp('bifacialComparisonsSection', false);
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ACTUALIZAR VISUAL DEL TABBAR
  ═══════════════════════════════════════════════════════════════════════ */
  function updateTabBarUI() {
    TABS.forEach(function (tab) {
      var el = tabEls[tab.id];
      if (!el) return;

      /* Limpiar clases de estado */
      el.classList.remove('mao-tab--active', 'active', 'mao-tab--done', 'done', 'mao-tab--locked', 'locked');
      el.setAttribute('aria-selected', 'false');
      /* Roving tabindex: solo la pestaña activa es tabulable */
      el.setAttribute('tabindex', tab.id === state.active ? '0' : '-1');

      if (state.locked.indexOf(tab.id) !== -1) {
        el.classList.add('mao-tab--locked', 'locked');
        el.setAttribute('aria-disabled', 'true');
      } else if (tab.id === state.active) {
        el.classList.add('mao-tab--active', 'active');
        el.setAttribute('aria-selected', 'true');
      } else if (state.done.indexOf(tab.id) !== -1) {
        el.classList.add('mao-tab--done', 'done');
      }

      /* Badge numérico */
      var existing = el.querySelector('.tab-badge');
      if (existing) existing.remove();
      if (state.badges[tab.id]) {
        var badge = document.createElement('span');
        badge.className = 'tab-badge';
        badge.textContent = state.badges[tab.id];
        el.appendChild(badge);
      }
    });

    updateProgressBar();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     BARRA DE PROGRESO
  ═══════════════════════════════════════════════════════════════════════ */
  function updateProgressBar() {
    var doneCount = 0;
    TABS.forEach(function (tab, idx) {
      var seg = progressSegs[tab.id];
      if (!seg) return;

      seg.classList.remove(
        'tab-progress-seg--done',
        'tab-progress-seg--active',
        'tab-progress-seg--locked'
      );

      if (state.done.indexOf(tab.id) !== -1) {
        seg.classList.add('tab-progress-seg--done');
        doneCount++;
      } else if (tab.id === state.active) {
        seg.classList.add('tab-progress-seg--active');
      } else if (state.locked.indexOf(tab.id) !== -1) {
        seg.classList.add('tab-progress-seg--locked');
      }
    });

    var label = document.getElementById('maoProgressLabel');
    if (label) {
      var current = TABS.findIndex(function (t) { return t.id === state.active; }) + 1;
      label.textContent = current + '/' + TABS.length;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     API PÚBLICA — window.maoTabRouter
  ═══════════════════════════════════════════════════════════════════════ */
  var router = {

    /**
     * Navegar a una pestaña por id.
     * @param {string} tabId
     */
    go: function (tabId) {
      if (state.locked.indexOf(tabId) !== -1) {
        console.warn('[MAO Tab Router] Pestaña bloqueada:', tabId);
        return;
      }
      var exists = TABS.some(function (t) { return t.id === tabId; });
      if (!exists) {
        console.warn('[MAO Tab Router] Pestaña no encontrada:', tabId);
        return;
      }
      state.active = tabId;
      showSectionsFor(tabId);
      updateTabBarUI();
      /* Persistir estado en sessionStorage */
      try {
        sessionStorage.setItem('maoTabState', JSON.stringify(state));
      } catch (e) {
        console.warn('[MAO Tab Router] No se pudo guardar estado:', e);
      }
      document.dispatchEvent(new CustomEvent('mao:tab:change', { detail: { tab: tabId } }));
    },

    /**
     * Marcar una pestaña como completada (punto verde).
     * @param {string} tabId
     */
    markDone: function (tabId) {
      if (state.done.indexOf(tabId) === -1) state.done.push(tabId);
      updateTabBarUI();
    },

    /**
     * Quitar la marca de completado.
     * @param {string} tabId
     */
    unmarkDone: function (tabId) {
      state.done = state.done.filter(function (id) { return id !== tabId; });
      updateTabBarUI();
    },

    /**
     * Bloquear una pestaña (no clickeable).
     * @param {string} tabId
     */
    lock: function (tabId) {
      if (state.locked.indexOf(tabId) === -1) state.locked.push(tabId);
      updateTabBarUI();
    },

    /**
     * Desbloquear una pestaña.
     * @param {string} tabId
     */
    unlock: function (tabId) {
      state.locked = state.locked.filter(function (id) { return id !== tabId; });
      updateTabBarUI();
    },

    /**
     * Poner un badge numérico en una pestaña (0 = quitar).
     * @param {string} tabId
     * @param {number} count
     */
    setBadge: function (tabId, count) {
      if (count === 0) {
        delete state.badges[tabId];
      } else {
        state.badges[tabId] = count;
      }
      updateTabBarUI();
    },

    /**
     * Avanzar automáticamente a la siguiente pestaña y marcar la actual como done.
     */
    next: function () {
      var current = TABS.findIndex(function (t) { return t.id === state.active; });
      if (current === -1 || current >= TABS.length - 1) return;
      router.markDone(state.active);
      router.go(TABS[current + 1].id);
    },

    /**
     * Retroceder a la pestaña anterior.
     */
    prev: function () {
      var current = TABS.findIndex(function (t) { return t.id === state.active; });
      if (current <= 0) return;
      router.go(TABS[current - 1].id);
    },

    /**
     * Obtener el estado actual del router.
     * @returns {object}
     */
    getState: function () {
      return {
        active : state.active,
        done   : state.done.slice(),
        locked : state.locked.slice(),
        badges : Object.assign({}, state.badges)
      };
    },

    /**
     * Inicialización manual (llamar si el script no usa defer).
     */
    init: function () {
      relocateOrphanedControls();
      buildTabBar();
      showSectionsFor(state.active);
      updateTabBarUI();
    }
  };

  /* ═══════════════════════════════════════════════════════════════════════
     INTEGRACIÓN CON EL FLUJO EXISTENTE DE MAO
     Escucha eventos que ya dispara el código de index.html y avanza
     las pestañas automáticamente cuando corresponde.
  ═══════════════════════════════════════════════════════════════════════ */
  function bindMaoEvents() {

    /* Detección finalizada → completar Captura y DESBLOQUEAR Análisis
       (ADR-001 · guard). unlock va ANTES de go(): go() rechaza pestañas
       bloqueadas. Avance suave: solo saltar a Análisis si el usuario sigue
       en Captura (no arrancarlo de otra pestaña). */
    document.addEventListener('mao:detection:done', function () {
      router.markDone('captura');
      router.unlock('analisis');
      if (state.active === 'captura') router.go('analisis');
    });

    /* Análisis morfológico renderizado → completar Análisis y DESBLOQUEAR
       Resultados (ADR-001 · guard). NO se navega: el panel morfológico vive
       en la propia pestaña Análisis, así que saltar a Resultados arrancaría
       al usuario del resultado que acaba de producir. */
    document.addEventListener('mao:analysis:done', function () {
      router.markDone('analisis');
      router.unlock('resultados');
    });

    /* Cuando se guarda el proyecto → marcar Proyecto como done */
    document.addEventListener('mao:project:saved', function () {
      router.markDone('proyecto');
    });

    /* Re-aplicar visibilidad cuando cambia el modo (2D/3D · mono/bifacial)
       mientras el usuario está en una pestaña afectada. */
    window.addEventListener('mao:object-dimension-changed', function () {
      showSectionsFor(state.active);
    });
    ['modoMonofacial', 'modoBifacial'].forEach(function (id) {
      var radio = document.getElementById(id);
      if (radio) {
        radio.addEventListener('change', function () {
          showSectionsFor(state.active);
        });
      }
    });

    /* Compatibilidad con el sistema de notificaciones antiguo si existía */
    document.addEventListener('stepCompleted', function (e) {
      if (!e.detail) return;
      var step = e.detail.step;
      if (step === 'deteccion') {
        router.markDone('captura');
        router.unlock('analisis');
      }
      if (step === 'analisis') {
        router.markDone('analisis');
        router.unlock('resultados');
      }
    });

    /* Teclado: ← → para navegar entre pestañas */
    document.addEventListener('keydown', function (e) {
      /* No activar si el foco está en un input */
      var tag = document.activeElement ? document.activeElement.tagName : '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); router.next(); }
      if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); router.prev(); }

      /* Alt+1…4 para ir directo */
      if (e.altKey && e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        var idx = parseInt(e.key, 10) - 1;
        if (TABS[idx]) router.go(TABS[idx].id);
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ARRANQUE
  ═══════════════════════════════════════════════════════════════════════ */
  function boot() {
    /* Restaurar estado de sessionStorage si existe (para reload sin perder estado) */
    var saved = sessionStorage.getItem('maoTabState');
    if (saved) {
      try {
        Object.assign(state, JSON.parse(saved));
      } catch (e) {
        console.warn('[MAO Tab Router] No se pudo restaurar estado:', e);
      }
    }

    /* Re-derivar guards desde el progreso restaurado (ADR-001): si un paso
       ya se completó en una sesión previa, la pestaña que habilita debe quedar
       accesible (caso: recargar / reabrir un proyecto ya avanzado). */
    if (state.done.indexOf('captura') !== -1) {
      state.locked = state.locked.filter(function (id) { return id !== 'analisis'; });
    }
    if (state.done.indexOf('analisis') !== -1) {
      state.locked = state.locked.filter(function (id) { return id !== 'resultados'; });
    }

    /* Si la pestaña activa restaurada quedó bloqueada, caer a la primera
       desbloqueada (evita mostrar una pestaña a la que no se podría navegar). */
    if (state.locked.indexOf(state.active) !== -1) {
      var safeIdx = firstUnlockedFrom(0, 1);
      state.active = safeIdx === -1 ? 'proyecto' : TABS[safeIdx].id;
    }

    relocateOrphanedControls();
    buildTabBar();
    showSectionsFor(state.active);
    updateTabBarUI();
    bindMaoEvents();
    console.info('[MAO Tab Router] Inicializado. Pestaña activa:', state.active);
    console.info('[MAO Tab Router] API disponible en: window.maoTabRouter');
    console.info('[MAO Tab Router] Atajos: Alt+← Alt+→ · Alt+1…4');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    /* Script `defer`: readyState ya es 'interactive' aquí, así que boot() corre
       ANTES de que se dispare DOMContentLoaded. La navegación legacy
       (sidebar-nav.js, object-dimension-mode.js) corre EN DOMContentLoaded y
       re-oculta las secciones de la pestaña activa con .mao-panel--hidden.
       Registrar el re-afirmado ahora (antes de que DCL dispare) lo coloca como
       ÚLTIMO listener → el router gana el estado inicial. */
    boot();
    document.addEventListener('DOMContentLoaded', function () {
      showSectionsFor(state.active);
      updateTabBarUI();
    });
  }

  /* Exponer API pública */
  window.maoTabRouter = router;

})();
