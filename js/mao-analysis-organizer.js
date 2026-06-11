/**
 * MAO Analysis Organizer — ADR-002 · Fase 2 (Jerarquía + P/H)
 * ─────────────────────────────────────────────────────────────────────────────
 * Reorganiza el panel morfológico YA RENDERIZADO (#morphologicalMetrics) en
 * secciones jerárquicas §1–§8 (docs/ADR-002-pestana-analisis.md) sin tocar los
 * renderers legacy (mostrarAnalisisMorfologico × 2) ni el Perforation Modal.
 *
 * Patrón Strangler Fig (como mao-tab-router.js): script independiente, defer,
 * reversible comentando su <script> en index.html.
 *
 * Mecánica:
 *  - MutationObserver sobre #morphologicalMetrics: cada vez que un renderer
 *    hace innerHTML = …, particiona los nodos por sus encabezados <h5>/<h6>
 *    (textos estables en visualization-export.js) en <details> con orden
 *    visual vía CSS `order` (la columna se vuelve flex; los wrappers
 *    intermedios usan display:contents para que las secciones participen).
 *  - #efaMetricsPanel NO se mueve dentro de #morphologicalMetrics (el
 *    innerHTML de los renderers lo destruiría y renderPanelEFA perdería su
 *    target). Se envuelve in-situ como hermano y se ordena con CSS (§3).
 *  - Cabecera sticky (#adr2Header) con chip P/H tri-estado:
 *      · obj.perforaciones/horadaciones === undefined → «SIN EVALUAR» (ámbar)
 *      · array con elementos → «N perforaciones · M horadaciones» (ok)
 *      · array vacío → «Evaluado · sin P/H» (gris): el cero es un cero real.
 *    El botón Evaluar/Editar delega en #trazarPerforacionesBtn (listener
 *    legacy en analysis-core.js); no se replica lógica del modal.
 *  - Lee window.currentAnalyzedObject ({obj, metricas}) que ambos renderers
 *    sincronizan en cada render (visualization-export.js:1977).
 *
 * Degradación segura: si la estructura no es la esperada (h5 en padres
 * distintos, panel vacío), no particiona y deja el panel tal cual.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ── Definición de secciones (ADR-002 §A; orden aprobado P/H §2 · EFA §3) ── */
  var DEFS = {
    sec0: { title: 'Identificación y método',             order: 0, open: false },
    sec1: { title: '§1 · Clasificación',                  order: 1, open: true  },
    sec2: { title: '§2 · Perforaciones & Horadaciones',   order: 2, open: true  },
    /* §3 = EFA (wrapper aparte, ver ensureEfaWrapper)                order: 3 */
    sec4: { title: '§4 · Dimensiones y análisis radial',  order: 4, open: false },
    sec5: { title: '§5 · Forma y geometría',               order: 5, open: false },
    sec6: { title: '§6 · Estado de conservación',          order: 6, open: false },
    sec7: { title: '§7 · Textura óptica (GLCM)',           order: 7, open: false },
    sec8: { title: '§8 · Procesamiento y técnica',         order: 8, open: false },
    sec9: { title: 'Otras métricas',                       order: 9, open: false }
  };

  /* Encabezado (prefijo, en mayúsculas) → sección. Los h6 no listados NO
     parten sección (p. ej. «Análisis Radial» sigue dentro de §4). */
  var HEADING_MAP = [
    ['CLASIFICACIÓN GEOMÉTRICA',      'sec1'],
    ['RESUMEN DE PERFORACIONES',      'sec2'],
    ['RESUMEN DE HORADACIONES',       'sec2'],
    ['ANÁLISIS DE PATRÓN',            'sec2'],
    ['DIMENSIONES',                   'sec4'],
    ['MÉTRICAS COMPLEMENTARIAS',      'sec5'],
    ['CARACTERÍSTICAS MORFOMÉTRICAS', 'sec5'],
    ['CARACTERÍSTICAS GEOMÉTRICAS',   'sec5'],
    ['ESTADO DE CONSERV',             'sec6'],
    ['TEXTURA ÓPTICA',                'sec7'],
    ['DEPURACIÓN ESTADÍSTICA',        'sec8'],
    ['COMPARACIÓN BOUNDING',          'sec8'],
    ['INFORMACIÓN TÉCNICA',           'sec8']
  ];

  function headingTarget(node) {
    if (!node || node.nodeType !== 1) return null;
    var tag = node.tagName;
    if (tag !== 'H5' && tag !== 'H6') return null;
    var t = (node.textContent || '').trim().toUpperCase();
    for (var i = 0; i < HEADING_MAP.length; i++) {
      if (t.indexOf(HEADING_MAP[i][0]) === 0) return HEADING_MAP[i][1];
    }
    return tag === 'H5' ? 'sec9' : null;
  }

  /* ── Estado P/H tri-valuado (ADR-002 §C) ─────────────────────────────────── */
  function phEstado(obj) {
    var p = obj ? obj.perforaciones : undefined;
    var h = obj ? obj.horadaciones : undefined;
    var evaluado = Array.isArray(p) || Array.isArray(h);
    var nP = Array.isArray(p) ? p.length : 0;
    var nH = Array.isArray(h) ? h.length : 0;
    return {
      key: !evaluado ? 'sin-evaluar' : (nP + nH > 0 ? 'hallazgos' : 'sin-ph'),
      nP: nP, nH: nH
    };
  }

  function lanzarModalPH() {
    var btn = $('trazarPerforacionesBtn');
    if (btn) btn.click();
    else console.warn('[ADR2] trazarPerforacionesBtn no encontrado');
  }

  function abrirTablaCompleta() {
    var card = $('sidebarResultCard');
    if (!card) return;
    var btns = card.querySelectorAll('button, a');
    for (var i = 0; i < btns.length; i++) {
      if (/m[ée]tricas completas/i.test(btns[i].textContent || '')) {
        btns[i].click();
        return;
      }
    }
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ── Cabecera sticky de resultado ────────────────────────────────────────── */
  function buildHeader(container) {
    var cao = window.currentAnalyzedObject;
    if (!cao || !cao.obj) return;
    var obj = cao.obj, met = cao.metricas || {};

    var hdr = $('adr2Header');
    if (!hdr) {
      hdr = el('div', null); hdr.id = 'adr2Header';
      hdr.appendChild(el('span', 'adr2-h-id'));
      hdr.appendChild(el('span', 'adr2-h-forma'));
      var phBox = el('span', 'adr2-h-ph');
      phBox.appendChild(el('span', 'adr2-chip'));
      var phBtn = el('button', 'adr2-btn-ph');
      phBtn.type = 'button';
      phBtn.addEventListener('click', lanzarModalPH);
      phBox.appendChild(phBtn);
      hdr.appendChild(phBox);
      var tablaBtn = el('button', 'adr2-btn-tabla', 'Tabla completa ›');
      tablaBtn.type = 'button';
      tablaBtn.addEventListener('click', abrirTablaCompleta);
      hdr.appendChild(tablaBtn);
      var bc = container.querySelector('.morf-breadcrumb');
      if (bc && bc.nextSibling) container.insertBefore(hdr, bc.nextSibling);
      else container.insertBefore(hdr, container.firstChild);
    }

    var idTxt = String(obj.id || obj.identificador || '');
    var forma = met.clasificacion_final || met.forma_identificada || '';
    var conf  = Number(met.forma_confianza_global);
    var formaTxt = forma
      ? 'Forma: ' + forma + (isFinite(conf) ? ' · ' + conf.toFixed(1) + '%' : '')
      : '';

    var st = phEstado(obj);
    var chipTxt, chipCls;
    if (st.key === 'sin-evaluar') { chipTxt = 'P/H: sin evaluar';  chipCls = 'adr2-chip adr2-chip--wa'; }
    else if (st.key === 'hallazgos') {
      chipTxt = 'P/H: ' + st.nP + ' perforacion' + (st.nP === 1 ? '' : 'es') +
                ' · ' + st.nH + ' horadacion' + (st.nH === 1 ? '' : 'es');
      chipCls = 'adr2-chip adr2-chip--ok';
    } else { chipTxt = 'P/H: evaluado · sin P/H'; chipCls = 'adr2-chip adr2-chip--none'; }

    /* setIfChanged: evita mutaciones (y re-disparos de observers) en vano */
    var set = function (sel, prop, val) {
      var n = hdr.querySelector(sel);
      if (n && n[prop] !== val) n[prop] = val;
    };
    set('.adr2-h-id', 'textContent', idTxt);
    set('.adr2-h-forma', 'textContent', formaTxt);
    set('.adr2-chip', 'textContent', chipTxt);
    set('.adr2-chip', 'className', chipCls);
    set('.adr2-btn-ph', 'textContent', st.key === 'sin-evaluar' ? 'Evaluar P/H' : 'Editar P/H');
  }

  /* ── §2 P/H: tarjeta de estado (los «Resumen de…» renderizados se le unen) ── */
  function buildSecPH(root) {
    var obj = window.currentAnalyzedObject && window.currentAnalyzedObject.obj;
    var st = phEstado(obj);
    var sec = root.querySelector(':scope > details[data-sec="sec2"]');
    if (!sec) {
      sec = makeSection('sec2');
      root.appendChild(sec);
    }
    var body = sec.querySelector(':scope > .adr2-body');
    var card = body.querySelector(':scope > .adr2-ph-card');
    if (card && card.getAttribute('data-estado') === st.key &&
        card.getAttribute('data-nph') === (st.nP + '/' + st.nH)) {
      return; /* sin cambios → sin mutación → sin bucle de observer */
    }
    if (card) card.remove();
    card = el('div', 'adr2-ph-card');
    card.setAttribute('data-estado', st.key);
    card.setAttribute('data-nph', st.nP + '/' + st.nH);

    if (st.key === 'sin-evaluar') {
      card.appendChild(el('span', 'adr2-chip adr2-chip--wa', 'SIN EVALUAR'));
      card.appendChild(el('p', 'adr2-ph-note',
        'La detección de P/H infiere sobre las métricas del objeto (porosidad, ' +
        'patrón de agrupamiento, ratios de área, listado EFA). Hasta evaluarla, ' +
        'esas métricas son provisionales.'));
      var b1 = el('button', 'adr2-btn-ph', 'Evaluar P/H');
      b1.type = 'button'; b1.addEventListener('click', lanzarModalPH);
      card.appendChild(b1);
    } else if (st.key === 'hallazgos') {
      card.appendChild(el('span', 'adr2-chip adr2-chip--ok',
        st.nP + ' perforaciones · ' + st.nH + ' horadaciones'));
      var b2 = el('button', 'adr2-btn-ph', 'Editar P/H');
      b2.type = 'button'; b2.addEventListener('click', lanzarModalPH);
      card.appendChild(b2);
    } else {
      card.appendChild(el('span', 'adr2-chip adr2-chip--none', 'EVALUADO · SIN P/H'));
      card.appendChild(el('p', 'adr2-ph-note',
        'Se evaluó y no se identificaron perforaciones ni horadaciones: ' +
        'el cero es un cero real.'));
      var b3 = el('button', 'adr2-btn-ph', 'Editar P/H');
      b3.type = 'button'; b3.addEventListener('click', lanzarModalPH);
      card.appendChild(b3);
    }
    body.insertBefore(card, body.firstChild);
  }

  function makeSection(key) {
    var def = DEFS[key];
    var d = document.createElement('details');
    d.className = 'adr2-sec';
    d.setAttribute('data-sec', key);
    d.open = def.open;
    d.style.order = String(def.order);
    var s = el('summary', null, def.title);
    d.appendChild(s);
    d.appendChild(el('div', 'adr2-body'));
    return d;
  }

  /* ── Partición del contenido renderizado ─────────────────────────────────── */
  function findRoot(mm) {
    var h5s = mm.querySelectorAll('h5');
    if (h5s.length < 3) return null;            /* estructura inesperada → no tocar */
    var parent = h5s[0].parentElement;
    for (var i = 1; i < h5s.length; i++) {
      if (h5s[i].parentElement !== parent) return null;
    }
    return parent;
  }

  function partition(mm) {
    var root = findRoot(mm);
    if (!root) return null;

    /* Wrappers intermedios mm→root participan del flex de la columna */
    var n = root;
    while (n && n !== mm.parentElement) { n.classList.add('adr2-contents'); n = n.parentElement; }
    root.classList.remove('adr2-contents');
    root.classList.add('adr2-root');

    var stray = [];
    var kids = root.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.nodeType === 1 && k.classList && k.classList.contains('adr2-sec')) continue;
      stray.push(k);
    }
    if (!stray.length) return root;

    var cur = 'sec0';
    var buckets = {};
    stray.forEach(function (node) {
      var t = headingTarget(node);
      if (t) cur = t;
      (buckets[cur] = buckets[cur] || []).push(node);
    });
    Object.keys(buckets).forEach(function (key) {
      var sec = root.querySelector(':scope > details[data-sec="' + key + '"]');
      if (!sec) { sec = makeSection(key); root.appendChild(sec); }
      var body = sec.querySelector(':scope > .adr2-body');
      buckets[key].forEach(function (node) { body.appendChild(node); });
    });
    return root;
  }

  /* ── §3 EFA: wrapper hermano in-situ (no mover el panel — ver cabecera) ──── */
  function ensureEfaWrapper(col) {
    var panel = $('efaMetricsPanel');
    if (!panel || !col || panel.parentElement === null) return;
    var wrap = $('adr2SecEFA');
    if (!wrap) {
      wrap = document.createElement('details');
      wrap.id = 'adr2SecEFA';
      wrap.className = 'adr2-sec';
      wrap.open = true;
      wrap.style.order = '3';
      wrap.appendChild(el('summary', null, '§3 · EFA — Fourier elíptico'));
      var body = el('div', 'adr2-body');
      panel.parentElement.insertBefore(wrap, panel);
      body.appendChild(panel);
      wrap.appendChild(body);
    }
    var visible = panel.style.display !== 'none' && panel.childNodes.length > 0;
    var want = visible ? '' : 'none';
    if (wrap.style.display !== want) wrap.style.display = want;
  }

  /* ── Orquestación ────────────────────────────────────────────────────────── */
  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      try { organize(); } catch (e) { console.warn('[ADR2] organize falló:', e); }
    });
  }

  function organize() {
    var mm = $('morphologicalMetrics');
    var cont = $('morphologicalAnalysisContainer');
    if (!mm || !cont) return;

    cont.classList.add('adr2-on');   /* habilita el aplanado CSS del grupo legacy «a» */
    buildHeader(cont);

    var col = mm.parentElement;
    if (col) col.classList.add('adr2-col');
    ensureEfaWrapper(col);

    if (!mm.childNodes.length) return;
    var root = partition(mm);
    if (root) buildSecPH(root);
  }

  function boot() {
    var mm = $('morphologicalMetrics');
    if (!mm) return;
    new MutationObserver(schedule).observe(mm, { childList: true, subtree: false });
    var efa = $('efaMetricsPanel');
    if (efa) {
      new MutationObserver(schedule)
        .observe(efa, { childList: true, attributes: true, attributeFilter: ['style'] });
    }
    schedule();
    console.log('[ADR2] Analysis Organizer activo (Fase 2: jerarquía §1–§8 + chip P/H)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
