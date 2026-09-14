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

  var MO = window.MaoOrganizer;          /* base compartida (ADR-005) */
  var $ = MO.$, el = MO.el;

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

  /* ── Estado P/H (ADR-002 §C + ADR-009: candidatos seedless) ──────────────────
     Cuatro estados, por prioridad:
       · hallazgos    → hay P/H CONFIRMADOS (nP+nH>0).
       · candidatos   → sin confirmados pero la detección seedless propuso huecos
                        (obj.phCandidatos): sugerencias a confirmar (ADR-009).
       · sin-ph       → evaluado, cero real (decisión humana, sin candidatos vivos).
       · sin-evaluar  → ni evaluado ni candidatos.
     OJO: NO se usa `evaluado` como prioridad sobre candidatos, porque varios flujos
     (objetos IA, export) inicializan perforaciones/horadaciones a `[]` aunque el
     humano no haya decidido nada → `evaluado` no es señal fiable de «ya decidió».
     El «no nag» se preserva porque confirmar→hallazgos, descartar y finalizar limpian
     obj.phCandidatos (→ cae a sin-ph/sin-evaluar). */
  function phEstado(obj) {
    var p = obj ? obj.perforaciones : undefined;
    var h = obj ? obj.horadaciones : undefined;
    var evaluado = Array.isArray(p) || Array.isArray(h);
    var nP = Array.isArray(p) ? p.length : 0;
    var nH = Array.isArray(h) ? h.length : 0;
    var nC = (obj && Array.isArray(obj.phCandidatos)) ? obj.phCandidatos.length : 0;
    var key;
    if (nP + nH > 0)   key = 'hallazgos';
    else if (nC > 0)   key = 'candidatos';
    else if (evaluado) key = 'sin-ph';
    else               key = 'sin-evaluar';
    return { key: key, nP: nP, nH: nH, nC: nC };
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

  /* `el(tag, cls, text)` ahora viene de MaoOrganizer (aliasado arriba). */

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
      phBox.appendChild(el('span', 'laar-chip'));
      var phBtn = el('button', 'adr2-btn-ph');
      phBtn.type = 'button';
      phBtn.addEventListener('click', lanzarModalPH);
      phBox.appendChild(phBtn);
      hdr.appendChild(phBox);
      /* ADR-017 F3 — chip de completitud, hermano del de P/H. Lleva contenedor
         propio porque `set()` resuelve con querySelector y, con dos `.laar-chip`
         en la cabecera, un selector sin acotar escribiría siempre en el primero. */
      var formaBox = el('span', 'adr2-h-plantilla');
      formaBox.appendChild(el('span', 'laar-chip'));
      hdr.appendChild(formaBox);
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
    if (st.key === 'sin-evaluar') { chipTxt = 'P/H: sin evaluar';  chipCls = 'laar-chip laar-chip--wa'; }
    else if (st.key === 'candidatos') {
      chipTxt = 'P/H: ' + st.nC + ' candidata' + (st.nC === 1 ? '' : 's') + ' — confirmar';
      chipCls = 'laar-chip laar-chip--wa';
    }
    else if (st.key === 'hallazgos') {
      chipTxt = 'P/H: ' + st.nP + ' perforacion' + (st.nP === 1 ? '' : 'es') +
                ' · ' + st.nH + ' horadacion' + (st.nH === 1 ? '' : 'es');
      chipCls = 'laar-chip laar-chip--ok';
    } else { chipTxt = 'P/H: evaluado · sin P/H'; chipCls = 'laar-chip laar-chip--none'; }
    var btnTxt = st.key === 'sin-evaluar' ? 'Evaluar P/H'
               : st.key === 'candidatos'  ? 'Revisar P/H'
               : 'Editar P/H';

    /* setIfChanged: evita mutaciones (y re-disparos de observers) en vano */
    var set = function (sel, prop, val) {
      var n = hdr.querySelector(sel);
      if (n && n[prop] !== val) n[prop] = val;
    };
    var fst = formaEstado(obj);
    var fchip = formaChip(fst);

    set('.adr2-h-id', 'textContent', idTxt);
    set('.adr2-h-forma', 'textContent', formaTxt);
    /* Selectores ACOTADOS: hay dos `.laar-chip` en la cabecera (P/H y forma). */
    set('.adr2-h-ph .laar-chip', 'textContent', chipTxt);
    set('.adr2-h-ph .laar-chip', 'className', chipCls);
    set('.adr2-btn-ph', 'textContent', btnTxt);
    set('.adr2-h-plantilla .laar-chip', 'textContent', fchip.txt.trim());
    set('.adr2-h-plantilla .laar-chip', 'className', fchip.cls);
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
        card.getAttribute('data-nph') === (st.nP + '/' + st.nH) &&
        card.getAttribute('data-nc') === String(st.nC)) {
      return; /* sin cambios → sin mutación → sin bucle de observer */
    }
    if (card) card.remove();
    card = el('div', 'adr2-ph-card');
    card.setAttribute('data-estado', st.key);
    card.setAttribute('data-nph', st.nP + '/' + st.nH);
    card.setAttribute('data-nc', String(st.nC));

    if (st.key === 'sin-evaluar') {
      card.appendChild(el('span', 'laar-chip laar-chip--lg laar-chip--wa', 'Sin evaluar'));
      card.appendChild(el('p', 'adr2-ph-note',
        'La detección de P/H infiere sobre las métricas del objeto (porosidad, ' +
        'patrón de agrupamiento, ratios de área, listado EFA). Hasta evaluarla, ' +
        'esas métricas son provisionales.'));
      var b1 = el('button', 'adr2-btn-ph', 'Evaluar P/H');
      b1.type = 'button'; b1.addEventListener('click', lanzarModalPH);
      card.appendChild(b1);
    } else if (st.key === 'candidatos') {
      card.appendChild(el('span', 'laar-chip laar-chip--lg laar-chip--wa',
        st.nC + ' candidata' + (st.nC === 1 ? '' : 's')));
      card.appendChild(el('p', 'adr2-ph-note',
        'La detección automática propuso ' + st.nC + ' hueco' + (st.nC === 1 ? '' : 's') +
        ' interno' + (st.nC === 1 ? '' : 's') + ' como posible' + (st.nC === 1 ? '' : 's') +
        ' P/H. Son sugerencias: no alteran el área neta ni ninguna métrica hasta que ' +
        'las revises, asignes tipo (perforación u horadación) y confirmes.'));
      var bc = el('button', 'adr2-btn-ph', 'Revisar P/H');
      bc.type = 'button'; bc.addEventListener('click', lanzarModalPH);
      card.appendChild(bc);
    } else if (st.key === 'hallazgos') {
      card.appendChild(el('span', 'laar-chip laar-chip--ok',
        st.nP + ' perforaciones · ' + st.nH + ' horadaciones'));
      var b2 = el('button', 'adr2-btn-ph', 'Editar P/H');
      b2.type = 'button'; b2.addEventListener('click', lanzarModalPH);
      card.appendChild(b2);
    } else {
      card.appendChild(el('span', 'laar-chip laar-chip--lg laar-chip--none', 'Evaluado · sin P/H'));
      card.appendChild(el('p', 'adr2-ph-note',
        'Se evaluó y no se identificaron perforaciones ni horadaciones: ' +
        'el cero es un cero real.'));
      var b3 = el('button', 'adr2-btn-ph', 'Editar P/H');
      b3.type = 'button'; b3.addEventListener('click', lanzarModalPH);
      card.appendChild(b3);
    }
    body.insertBefore(card, body.firstChild);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ADR-017 F3 — COMPLETITUD POR PLANTILLA IDEAL
     ═══════════════════════════════════════════════════════════════════════
     Mismo patrón que P/H (ADR-009): la detección PROPONE, el humano DISPONE.
     Cuatro estados, ninguno de los cuales afirma nada por ausencia de dato:

       · confirmada    → un humano ratificó la plantilla            (chip --ok)
       · candidata     → hay hipótesis sin ratificar                (chip --wa)
       · sin-plantilla → se evaluó y NO hay forma ideal subyacente  (chip --none)
                         (el caso NORMAL en lítica: ADR-017 §7)
       · sin-evaluar   → todavía no se pidió el emparejamiento      (chip --wa)

     Campos en el objeto (espejo de obj.phCandidatos):
       obj.plantillaEvaluada  — ya se corrió el emparejamiento
       obj.plantillaCandidata — respuesta cruda de /api/shape-match
       obj.plantillaConfirmada / obj.plantillaDescartada — decisión humana

     ⚠ El emparejamiento cuesta ~200 ms por plantilla, así que se lanza SÓLO
     por acción del usuario y con el repertorio acotado — nunca en el bucle de
     análisis (nota de rendimiento de ADR-017 §6.3). */

  /* Repertorio por defecto del botón. Acotado a propósito: las dos analíticas
     (baratas y exactas) más las poligonales de uso arqueológico frecuente. */
  var PLANTILLAS_POR_DEFECTO = ['circulo', 'elipse', 'triangulo', 'cuadrado', 'hexagono'];

  function formaEstado(obj) {
    if (!obj) return { key: 'sin-evaluar' };
    if (obj.plantillaConfirmada) {
      return { key: 'confirmada', dato: obj.plantillaConfirmada };
    }
    var c = obj.plantillaCandidata;
    var hayCandidata = !!(c && c.plantilla_tipo && c.plantilla_tipo !== 'ninguna');
    if (hayCandidata && !obj.plantillaDescartada) {
      return { key: 'candidata', dato: c };
    }
    if (obj.plantillaEvaluada) {
      return { key: 'sin-plantilla', dato: c || null };
    }
    return { key: 'sin-evaluar' };
  }

  /** Texto del chip por estado. Sentence case (ADR-005 D3). */
  function formaChip(st) {
    if (st.key === 'confirmada') {
      var d = st.dato;
      return { txt: 'Forma: ' + d.tipo + ' · ' + Number(d.completitud).toFixed(0) + ' % ',
               cls: 'laar-chip laar-chip--ok' };
    }
    if (st.key === 'candidata') {
      return { txt: 'Forma: ' + st.dato.plantilla_tipo + ' ' +
                    Number(st.dato.plantilla_completitud).toFixed(0) + ' % — confirmar',
               cls: 'laar-chip laar-chip--wa' };
    }
    if (st.key === 'sin-plantilla') {
      return { txt: 'Forma: sin plantilla', cls: 'laar-chip laar-chip--none' };
    }
    return { txt: 'Forma: sin evaluar', cls: 'laar-chip laar-chip--wa' };
  }

  /* Visibilidad de la superposición en el lienzo. Vive aquí porque la casilla se
     reconstruye con la tarjeta en cada render: sin este estado, cada rebuild la
     devolvería a «marcada» y desharía la elección del usuario. El lienzo
     (`analysis-core.js`) tiene su propio flag y ambos se sincronizan por evento,
     el mismo camino que `mao:batch-analyze:request`. */
  var _overlayVisible = true;

  function pintarLienzo() {
    document.dispatchEvent(new CustomEvent('mao:plantilla-overlay:toggle', {
      detail: { visible: _overlayVisible },
    }));
  }

  var _evaluando = false;

  /** Lanza el emparejamiento contra el backend y guarda el CANDIDATO. */
  function evaluarPlantilla(btn) {
    var cao = window.currentAnalyzedObject;
    var obj = cao && cao.obj;
    if (!obj || _evaluando) return;
    var pb = window.PythonBridge;
    if (!pb || !pb.shapeTemplate) {
      MO.toast('warning', 'El emparejamiento de formas requiere el motor Python activo.');
      return;
    }
    // Campos CANÓNICOS del objeto (verificados en analysis-core.js:10053-10057):
    //   obj.contour_data.points → contorno REAL en coords absolutas
    //   obj.contour_points      → puede ser `points_visual`, simplificado para dibujo
    // Se prefiere el real: el ajuste de plantilla es geométrico, y un contorno
    // simplificado sesga el residuo y la cobertura.
    var pts = (obj.contour_data && obj.contour_data.points) || obj.contour_points;
    if (!Array.isArray(pts) || pts.length < 12) {
      MO.toast('warning', 'Sin contorno suficiente para emparejar una plantilla.');
      return;
    }
    _evaluando = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Evaluando…'; }
    pb.shapeTemplate.match(pts, { templates: PLANTILLAS_POR_DEFECTO })
      .then(function (r) {
        obj.plantillaEvaluada = true;
        obj.plantillaCandidata = r || null;
        obj.plantillaDescartada = false;
        if (r && r.plantilla_tipo && r.plantilla_tipo !== 'ninguna') {
          MO.toast('success', 'Candidata: ' + r.plantilla_tipo + ' al ' +
                   Number(r.plantilla_completitud).toFixed(0) + ' %. Confírmala o descártala.');
        } else {
          MO.toast('info', 'Sin forma ideal subyacente — es el caso normal en lítica.');
        }
      })
      .catch(function (e) {
        // No se marca `plantillaEvaluada`: un fallo de red no es «se evaluó y no hay».
        MO.toast('error', 'No se pudo emparejar: ' + (e && e.message ? e.message : e));
      })
      .then(function () { _evaluando = false; pintarLienzo(); schedule(); });
  }

  function confirmarPlantilla() {
    var cao = window.currentAnalyzedObject;
    var obj = cao && cao.obj;
    var c = obj && obj.plantillaCandidata;
    if (!obj || !c) return;
    obj.plantillaConfirmada = {
      tipo: c.plantilla_tipo,
      completitud: c.plantilla_completitud,
      arco_fraccion: c.plantilla_arco_fraccion,
      residuo_rms: c.plantilla_residuo_rms,
      confianza: c.plantilla_confianza,
      confianza_nivel: c.plantilla_confianza_nivel,
      metodo: c.plantilla_metodo,
      parametros: c.plantilla_parametros,
      // La decisión se lleva SU copia del contorno y de la máscara. Leerlos del
      // candidato al dibujar sería frágil: una reevaluación con otro repertorio
      // dejaría lo confirmado dibujado con la forma de otra plantilla.
      contorno: c.plantilla_contorno || null,
      contorno_presente: c.plantilla_contorno_presente || null,
      confirmada_en: new Date().toISOString(),
    };
    obj.plantillaDescartada = false;
    if (cao.metricas) sincronizarMetricasPlantilla(cao.metricas, obj);
    MO.toast('success', 'Completitud confirmada.');
    pintarLienzo();
    schedule();
  }

  function descartarPlantilla() {
    var cao = window.currentAnalyzedObject;
    var obj = cao && cao.obj;
    if (!obj) return;
    obj.plantillaDescartada = true;
    obj.plantillaConfirmada = null;
    if (cao.metricas) sincronizarMetricasPlantilla(cao.metricas, obj);
    MO.toast('info', 'Candidata descartada: la pieza queda sin forma ideal asignada.');
    pintarLienzo();   // la forma descartada tiene que DESAPARECER del lienzo
    schedule();
  }

  /** Vuelca la decisión humana a `metricas` con las claves canónicas ADR-006.
      Sólo lo CONFIRMADO viaja al CSV/PDF: el candidato es una hipótesis. */
  function sincronizarMetricasPlantilla(metricas, obj) {
    var d = obj.plantillaConfirmada;
    if (!d) {
      delete metricas.plantilla_tipo;
      delete metricas.plantilla_completitud;
      delete metricas.plantilla_arco_fraccion;
      delete metricas.plantilla_residuo_rms;
      delete metricas.plantilla_confianza;
      delete metricas.plantilla_confianza_nivel;
      return;
    }
    metricas.plantilla_tipo            = d.tipo;
    metricas.plantilla_completitud     = d.completitud;
    metricas.plantilla_arco_fraccion   = d.arco_fraccion;
    metricas.plantilla_residuo_rms     = d.residuo_rms;
    metricas.plantilla_confianza       = d.confianza;
    metricas.plantilla_confianza_nivel = d.confianza_nivel;
  }

  /** Casilla de visibilidad + leyenda del convenio de trazo del lienzo.
      La leyenda no es adorno: sin ella, el tramo discontinuo se lee como «otra
      línea más» en vez de como «esto la plantilla lo está reconstruyendo». */
  function controlSuperposicion() {
    var wrap = el('div', 'adr2-forma-overlay');
    var lab = el('label', 'adr2-ph-note');
    var chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = _overlayVisible;
    chk.addEventListener('change', function () {
      _overlayVisible = chk.checked;
      pintarLienzo();
    });
    lab.appendChild(chk);
    lab.appendChild(document.createTextNode(' Superponer la plantilla en el lienzo'));
    wrap.appendChild(lab);
    wrap.appendChild(el('p', 'adr2-ph-note',
      'Trazo continuo = el tramo que el fragmento respalda. Discontinuo = el que ' +
      'la plantilla reconstruye, y que por tanto no es una medición.'));
    return wrap;
  }

  /* ── §6 Estado de conservación: tarjeta de completitud ──────────────────── */
  function buildSecForma(root) {
    var obj = window.currentAnalyzedObject && window.currentAnalyzedObject.obj;
    var st = formaEstado(obj);
    var sec = root.querySelector(':scope > details[data-sec="sec6"]');
    if (!sec) {
      sec = makeSection('sec6');
      root.appendChild(sec);
    }
    var body = sec.querySelector(':scope > .adr2-body');
    if (!body) return;
    var card = body.querySelector(':scope > .adr2-forma-card');
    var firma = st.key + '|' + (st.dato ? (st.dato.plantilla_tipo || st.dato.tipo) : '') + '|' +
                (st.dato ? (st.dato.plantilla_completitud != null
                            ? st.dato.plantilla_completitud : st.dato.completitud) : '');
    if (card && card.getAttribute('data-firma') === firma) return;   /* sin cambios → sin mutación */
    if (card) card.remove();

    card = el('div', 'adr2-ph-card adr2-forma-card');
    card.setAttribute('data-firma', firma);
    var chip = formaChip(st);
    card.appendChild(el('span', chip.cls + ' laar-chip--lg', chip.txt.trim()));

    if (st.key === 'sin-evaluar') {
      card.appendChild(el('p', 'adr2-ph-note',
        'Se puede estimar si la pieza está completa o es el fragmento de una forma ' +
        'mayor, ajustando una plantilla ideal al margen original del contorno. ' +
        'No se calcula solo: cuesta ~200 ms por plantilla.'));
      var bEval = el('button', 'adr2-btn-ph', 'Evaluar completitud');
      bEval.type = 'button';
      bEval.addEventListener('click', function () { evaluarPlantilla(bEval); });
      card.appendChild(bEval);

    } else if (st.key === 'candidata') {
      var d = st.dato;
      card.appendChild(el('p', 'adr2-ph-note',
        'La plantilla «' + d.plantilla_tipo + '» explica el ' +
        Math.round((d.plantilla_arco_fraccion || 0) * 100) + ' % del contorno, con un ' +
        Number(d.plantilla_completitud).toFixed(0) + ' % de la forma preservado ' +
        '(confianza ' + (d.plantilla_confianza_nivel || '—') + '). Es una SUGERENCIA: ' +
        'no altera ninguna métrica hasta que la confirmes. En lítica la fractura se ' +
        'diagnostica por la cara ventral —talón, bulbo, ondas—, no por la silueta.'));
      var otras = (d.candidatos || []).filter(function (c) {
        return c.aceptada && c.tipo !== d.plantilla_tipo;
      });
      if (otras.length) {
        card.appendChild(el('p', 'adr2-ph-note',
          'Lectura alternativa compatible: ' + otras.map(function (c) {
            return c.tipo + ' al ' + Number(c.completitud).toFixed(0) + ' %';
          }).join(' · ') + '. Una misma silueta puede encajar en más de una forma ideal.'));
      }
      var bOk = el('button', 'adr2-btn-ph', 'Confirmar');
      bOk.type = 'button'; bOk.addEventListener('click', confirmarPlantilla);
      card.appendChild(bOk);
      var bNo = el('button', 'adr2-btn-ph', 'Descartar');
      bNo.type = 'button'; bNo.addEventListener('click', descartarPlantilla);
      card.appendChild(bNo);
      if (d.plantilla_contorno) card.appendChild(controlSuperposicion());

    } else if (st.key === 'confirmada') {
      var dc = st.dato;
      card.appendChild(el('p', 'adr2-ph-note',
        'Confirmado: ' + dc.tipo + ' con el ' + Number(dc.completitud).toFixed(0) +
        ' % de la forma preservado. Esta decisión sí viaja al CSV y al reporte.'));
      var bRe = el('button', 'adr2-btn-ph', 'Revisar');
      bRe.type = 'button'; bRe.addEventListener('click', descartarPlantilla);
      card.appendChild(bRe);
      if (dc.contorno) card.appendChild(controlSuperposicion());

    } else {   /* sin-plantilla */
      var motivo = (st.dato && st.dato.motivo_rechazo) || '';
      card.appendChild(el('p', 'adr2-ph-note',
        'Se evaluó y no hay forma ideal subyacente que sostenga una estimación de ' +
        'completitud. Es el caso normal en lítica, y es un resultado, no un fallo.' +
        (motivo ? ' Detalle: ' + motivo : '')));
      var bRe2 = el('button', 'adr2-btn-ph', 'Reevaluar');
      bRe2.type = 'button';
      bRe2.addEventListener('click', function () {
        if (obj) { obj.plantillaEvaluada = false; obj.plantillaDescartada = false; }
        evaluarPlantilla(bRe2);
      });
      card.appendChild(bRe2);
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

  /* ── Fase 3: lienzo unificado con conmutador de vistas ──────────────────────
     Relocaliza los grupos B (Contorno depurado) y C (Vista esquemática) a la
     celda del lienzo (#morphologicalCanvasContainer) y los presenta como vistas
     conmutables junto al canvas «Real». Seguro: los renderers dibujan sobre los
     <canvas> por ID (no reconstruyen la celda) y solo fuerzan `.open=true` en
     B/C — controlamos la visibilidad por `display` del grupo, no por `open`. */
  function setCanvasView(view) {
    var cell = $('morphologicalCanvasContainer');
    if (!cell) return;
    ['real', 'contorno', 'esquema'].forEach(function (v) {
      /* .adr2-cview distingue las VISTAS de los botones del conmutador (ambos
         llevan data-view); sin la clase, querySelector matchearía el botón. */
      var node = cell.querySelector('.adr2-cview[data-view="' + v + '"]');
      if (node) node.style.display = (v === view) ? '' : 'none';
    });
    var seg = $('adr2CanvasSeg');
    if (seg) Array.prototype.forEach.call(seg.children, function (b) {
      b.classList.toggle('adr2-seg-btn--active', b.getAttribute('data-view') === view);
    });
  }

  function unifyCanvas() {
    var cell = $('morphologicalCanvasContainer');
    var gB = $('morphGroupB');
    var gC = $('morphGroupC');
    if (!cell || !gB || !gC) return;

    /* 1) Envolver el contenido «Real» actual (título + canvas + leyenda) una vez */
    var real = $('adr2ViewReal');
    if (!real) {
      real = el('div', 'adr2-view adr2-cview'); real.id = 'adr2ViewReal';
      real.setAttribute('data-view', 'real');
      while (cell.firstChild) real.appendChild(cell.firstChild);
      cell.appendChild(real);
    }

    /* 2) Relocalizar B y C a la celda como vistas (idempotente) */
    if (gB.parentElement !== cell) {
      gB.classList.add('adr2-cview'); gB.setAttribute('data-view', 'contorno'); cell.appendChild(gB);
    }
    if (gC.parentElement !== cell) {
      gC.classList.add('adr2-cview'); gC.setAttribute('data-view', 'esquema'); cell.appendChild(gC);
    }

    /* 3) Conmutador segmentado (una vez) */
    var seg = $('adr2CanvasSeg');
    if (!seg) {
      seg = el('div', 'adr2-seg'); seg.id = 'adr2CanvasSeg';
      [['real', 'Real'], ['contorno', 'Contorno depurado'], ['esquema', 'Esquemática']]
        .forEach(function (v) {
          var b = el('button', 'adr2-seg-btn', v[1]);
          b.type = 'button'; b.setAttribute('data-view', v[0]);
          b.addEventListener('click', function () { setCanvasView(v[0]); });
          seg.appendChild(b);
        });
      cell.insertBefore(seg, cell.firstChild);
      setCanvasView('real');
    }
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

    unifyCanvas();   /* Fase 3: vistas del lienzo (Real/Contorno/Esquemática) */

    if (!mm.childNodes.length) return;
    var root = partition(mm);
    if (root) { buildSecPH(root); buildSecForma(root); }
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
    MO.log('ADR2', 'Analysis Organizer activo (Fase 2: jerarquía §1–§8 + chip P/H)');
  }

  /* Superficie mínima para el hook E2E de ADR-010 y para depurar desde consola.
     No es API pública: la UI real son los botones de la tarjeta. */
  window.__maoForma = {
    estado: formaEstado,
    evaluar: function () { evaluarPlantilla(null); },
    confirmar: confirmarPlantilla,
    descartar: descartarPlantilla,
    /* Superposición (ADR-010: verificable desde la consola de Electron, que es
       el único sitio donde se puede comprobar que esto se DIBUJA). */
    overlay: function (v) {
      if (typeof v === 'boolean') _overlayVisible = v;
      pintarLienzo();
      return _overlayVisible;
    },
  };

  MO.bootWhenReady(boot);
})();
