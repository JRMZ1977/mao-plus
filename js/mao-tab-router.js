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
        'fieldsetGestionProyectos',
        'sectionIdentificacion',
        'sectionModo'
      ],
      locked   : false
    },
    {
      id       : 'captura',
      label    : 'Captura',
      icon     : '②',
      sections : [
        'sectionImagen',
        'sectionEscala',
        'canvasMonofacial',
        'canvasBifacial'
      ],
      locked   : false
    },
    {
      id       : 'analisis',
      label    : 'Análisis',
      icon     : '③',
      sections : [
        'sectionObj3D',
        'sectionAnalisis3D'
      ],
      locked   : false
    },
    {
      id       : 'resultados',
      label    : 'Resultados',
      icon     : '④',
      sections : [
        // Secciones de resultados/exportación (a mapear según index.html)
        'bifacialComparisonsSection'
      ],
      locked   : false
    }
  ];

  /* ═══════════════════════════════════════════════════════════════════════
     ESTADO INTERNO
  ═══════════════════════════════════════════════════════════════════════ */
  var state = {
    active   : 'proyecto',
    done     : [],          // ids de pestañas completadas
    badges   : {},          // { id: numero } para badges de advertencia
    locked   : []           // ids de pestañas bloqueadas
  };

  /* Inicializar locks desde TABS */
  TABS.forEach(function (tab) {
    if (tab.locked) state.locked.push(tab.id);
  });

  /* ═══════════════════════════════════════════════════════════════════════
     CONSTRUIR TABBAR
     Inyecta <div id="maoTabBar"> antes del contenedor de secciones.
  ═══════════════════════════════════════════════════════════════════════ */
  function buildTabBar() {
    /* Detectar el contenedor de contenido principal */
    var host = (
      document.querySelector('main.mao-main') ||
      document.querySelector('.mao-app-layout') ||
      document.getElementById('mainContent') ||
      document.getElementById('content') ||
      document.getElementById('appContent') ||
      document.querySelector('.main-content') ||
      document.querySelector('main') ||
      document.body
    );

    /* Evitar doble inyección */
    if (document.getElementById('maoTabBar')) return;

    var bar = document.createElement('div');
    bar.id = 'maoTabBar';
    bar.className = 'mao-tabbar';

    TABS.forEach(function (tab) {
      var el = document.createElement('div');
      el.className = 'mao-tab';
      el.setAttribute('data-tab', tab.id);
      el.setAttribute('role', 'tab');
      el.setAttribute('aria-selected', 'false');

      if (state.locked.indexOf(tab.id) !== -1) {
        el.classList.add('mao-tab--locked');
        el.setAttribute('aria-disabled', 'true');
      }

      el.innerHTML =
        '<span class="tab-indicator"></span>' +
        '<span class="tab-icon" style="font-style:normal">' + (tab.icon || '') + '</span> ' +
        '<span class="tab-label">' + tab.label + '</span>';

      el.addEventListener('click', function () {
        if (state.locked.indexOf(tab.id) === -1) {
          router.go(tab.id);
        }
      });

      bar.appendChild(el);
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
    });
    var progLabel = document.createElement('span');
    progLabel.className = 'tab-progress-label';
    progLabel.id = 'maoProgressLabel';
    prog.appendChild(progLabel);
    bar.appendChild(prog);

    /* Insertar antes del primer hijo del contenedor */
    if (host.firstChild) {
      host.insertBefore(bar, host.firstChild);
    } else {
      host.appendChild(bar);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     MOSTRAR / OCULTAR SECCIONES
  ═══════════════════════════════════════════════════════════════════════ */
  function showSectionsFor(tabId) {
    /* Recopilar todos los IDs de secciones de todas las pestañas */
    var allSections = [];
    TABS.forEach(function (tab) {
      tab.sections.forEach(function (sid) {
        if (allSections.indexOf(sid) === -1) allSections.push(sid);
      });
    });

    /* Ocultar todas */
    allSections.forEach(function (sid) {
      var el = document.getElementById(sid);
      if (el) {
        el.style.display = 'none';
        el.classList.remove('mao-pane--active', 'active');
      }
    });

    /* Mostrar las de la pestaña activa */
    var activeTab = TABS.find(function (t) { return t.id === tabId; });
    if (!activeTab) return;

    activeTab.sections.forEach(function (sid) {
      var el = document.getElementById(sid);
      if (el) {
        el.style.display = '';
        el.classList.add('mao-pane--active', 'active');
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ACTUALIZAR VISUAL DEL TABBAR
  ═══════════════════════════════════════════════════════════════════════ */
  function updateTabBarUI() {
    TABS.forEach(function (tab) {
      var el = document.querySelector('[data-tab="' + tab.id + '"]');
      if (!el) return;

      /* Limpiar clases de estado */
      el.classList.remove('mao-tab--active', 'active', 'mao-tab--done', 'done', 'mao-tab--locked', 'locked');
      el.setAttribute('aria-selected', 'false');

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
      var seg = document.querySelector('[data-progress-tab="' + tab.id + '"]');
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

    /* Cuando se asigna la escala → completar paso 1 (Captura) */
    document.addEventListener('mao:scale:set', function () {
      // No avanzar aún, solo registrar que hay progreso en Captura
    });

    /* Cuando la detección finaliza → completar Captura y avanzar a Análisis */
    document.addEventListener('mao:detection:done', function () {
      router.markDone('captura');
      router.go('analisis');
    });

    /* Cuando el análisis IA termina → completar Análisis y avanzar a Resultados */
    document.addEventListener('mao:analysis:done', function () {
      router.markDone('analisis');
      router.go('resultados');
    });

    /* Cuando se guarda el proyecto → marcar Proyecto como done */
    document.addEventListener('mao:project:saved', function () {
      router.markDone('proyecto');
    });

    /* Compatibilidad con el sistema de notificaciones antiguo si existía */
    document.addEventListener('stepCompleted', function (e) {
      if (!e.detail) return;
      var step = e.detail.step;
      if (step === 'escala' || step === 'deteccion') {
        if (step === 'deteccion') router.markDone('captura');
      }
      if (step === 'analisis') {
        router.markDone('analisis');
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
    boot();
  }

  /* Exponer API pública */
  window.maoTabRouter = router;

})();
