/**
 * MAO Resultados Organizer — ADR-005 (pestaña Resultados)
 * ─────────────────────────────────────────────────────────────────────────────
 * Da vida a la cabecera de chips (#adr5ResultadosHeader) de la pestaña
 * Resultados: Objeto · Análisis · Exportado. NO toca la lógica de análisis
 * (analysis-core.js): solo observa señales que el flujo ya produce.
 *
 * Señales que consume:
 *  - mao:analysis:done  → chip Análisis → ok; chip Objeto → nombre del objeto
 *  - mao:objects:changed → resetear si cambia la selección de objeto
 *  - clicks en botones de exportación → chip Exportado → ok
 *  - click en #nuevoAnalisisBtn → resetear todos los chips
 *
 * Patrón Strangler Fig: script independiente, defer, reversible comentando su
 * <script> en index.html.
 */
(function () {
  'use strict';

  var MO = window.MaoOrganizer;
  if (!MO) { console.warn('[Resultados] MaoOrganizer no disponible'); return; }
  var $ = MO.$;

  /* ── Chips ──────────────────────────────────────────────────────────────── */

  function updateObjetoChip() {
    var chip = $('adr5ChipObjeto');
    if (!chip) return;
    /* Intentar leer el nombre del objeto activo desde el identificador del IIFE.
       El IIFE expone window.currentAnalysisId cuando hay análisis activo. */
    var id = window.currentAnalysisId || '';
    if (id) {
      MO.setChip(chip, 'ok', id);
    } else {
      /* Fallback: leer el breadcrumb del panel morfológico si está visible */
      var bc = document.getElementById('morfBcGroupLabel');
      var label = bc ? (bc.textContent || '').trim() : '';
      if (label) MO.setChip(chip, 'ok', label);
      else       MO.setChip(chip, 'none', '—');
    }
  }

  function setAnalisisDone() {
    var chip = $('adr5ChipAnalisis');
    if (chip) MO.setChip(chip, 'ok', 'Completado');
    updateObjetoChip();
  }

  function setExportadoDone(formato) {
    var chip = $('adr5ChipExportado');
    if (chip) MO.setChip(chip, 'ok', formato || 'Exportado');
  }

  function resetChips() {
    var co = $('adr5ChipObjeto');
    var ca = $('adr5ChipAnalisis');
    var ce = $('adr5ChipExportado');
    if (co) MO.setChip(co, 'none', '—');
    if (ca) MO.setChip(ca, 'none', '—');
    if (ce) MO.setChip(ce, 'none', '—');
  }

  /* ── Cableado de señales ─────────────────────────────────────────────────── */

  /* ── Botón «Ver Colección» en cabecera ──────────────────────────────────── */

  function onVerColeccion() {
    var panel = document.getElementById('projectsPanel');
    if (panel) {
      panel.classList.add('active');
      if (typeof window.renderProjectsList === 'function') window.renderProjectsList();
    } else {
      var legacyBtn = document.getElementById('btnGestionarProyectos');
      if (legacyBtn) legacyBtn.click();
    }
  }

  function onAbrirCMO() {
    /* Delega en el botón oculto que comparator.js ya cableó con window.open */
    var btn = document.getElementById('abrirComparadorBtn');
    if (btn) btn.click();
  }

  function onAbrirProcrustes() {
    /* sidebarAbrirProcrustesBtn está cableado directamente por procrustes.js */
    var btn = document.getElementById('sidebarAbrirProcrustesBtn');
    if (btn) btn.click();
  }

  /* ── Enriquecimiento retroactivo de métricas por lote ───────────────────── */

  var _enrichRunning = false;

  function _showProgress(visible) {
    var bar = document.getElementById('enrichProgressBar');
    if (bar) bar.style.display = visible ? 'flex' : 'none';
  }

  function _setProgress(done, total, label) {
    var fill  = document.getElementById('enrichProgressFill');
    var lbl   = document.getElementById('enrichProgressLabel');
    var pct   = total > 0 ? Math.round(done / total * 100) : 0;
    if (fill) fill.style.width = pct + '%';
    if (lbl)  lbl.textContent  = label || (done + ' / ' + total);
  }

  function _setEnrichBtn(disabled) {
    // Ambos botones disparan el mismo motor por lote: mientras uno corre, los dos
    // quedan inhabilitados.
    ['adr5BtnEnriquecer', 'adr5BtnExportarColeccion'].forEach(function (id) {
      var btn = document.getElementById(id);
      if (!btn) return;
      btn.disabled = disabled;
      btn.style.opacity = disabled ? '0.5' : '';
      btn.style.cursor  = disabled ? 'not-allowed' : '';
    });
  }

  /**
   * Resuelve a qué proyecto apuntan las acciones por lote.
   * Compartido por «Actualizar colección» y «Exportar colección…».
   *
   * @returns {{projectId: (string|null), folderPath: (string|null), project: (Object|null)}}
   */
  function _resolverProyecto() {
    var pm = window.projectManager;

    // Derivar projectId — 3 fuentes en orden de prioridad:
    // 1. activeProject (seteado al abrir colección o al activar proyecto)
    // 2. currentCollection.proyectoId (colección cargada en el explorer)
    // 3. Si hay un único proyecto registrado con folderPath, usarlo automáticamente
    var projectId = (pm && pm.activeProject && pm.activeProject.id) ||
                    (window.currentCollection && window.currentCollection.proyectoId);

    // Fuente 3: único proyecto con folderPath en projectManager
    if (!projectId && pm && pm.projects) {
      var conCarpeta = pm.projects.filter(function (p) { return p.folderPath; });
      if (conCarpeta.length === 1) {
        projectId = conCarpeta[0].id;
        pm.setActiveProject(projectId);
      }
    }

    // Fuente 4: currentCollection con folderPath directo (proyecto externo sin proyectoId)
    var overrideFolderPath = null;
    if (!projectId && window.currentCollection && window.currentCollection.folderPath) {
      overrideFolderPath = window.currentCollection.folderPath;
    }

    var project = (projectId && pm && typeof pm.getProject === 'function')
      ? pm.getProject(projectId) : null;

    return { projectId: projectId || null, folderPath: overrideFolderPath, project: project };
  }

  function onEnriquecerColeccion() {
    if (_enrichRunning) return;
    var r = _resolverProyecto();

    if (!r.projectId && !r.folderPath) {
      if (window.toast) window.toast.warning('Abre primero la colección de un proyecto usando "Ver Colección".');
      return;
    }
    _enrichRunning = true;
    _setEnrichBtn(true);
    _showProgress(true);
    _setProgress(0, 1, 'Cargando colección…');
    document.dispatchEvent(new CustomEvent('mao:enrich:request', {
      detail: {
        projectId: r.projectId,
        folderPath: r.folderPath,   // para proyectos externos sin proyectoId
        options: {}
      }
    }));
  }

  /* Etiqueta por fase del lote. `guardado` cierra el objeto; el resto son etapas. */
  var _FASE_ETIQUETA = { efa: 'EFA', pdf: 'PDF', png: 'PNG', svg: 'SVG' };

  function onEnrichProgress(e) {
    var d = e && e.detail || {};
    var nom = d.nombreObjeto || '';
    var label;
    if (d.fase === 'guardado') {
      label = d.done + ' / ' + d.total + ' — ' + nom;
    } else if (_FASE_ETIQUETA[d.fase]) {
      label = _FASE_ETIQUETA[d.fase] + ' ' + d.done + ' / ' + d.total + ' — ' + nom;
    } else {
      label = 'Leyendo ' + (d.done + 1) + ' / ' + d.total + '…';
    }
    _setProgress(d.done || 0, d.total || 1, label);
  }

  /** Nombres cortos de los formatos realmente escritos, para el mensaje final. */
  function _formatosEscritos(fmt) {
    if (!fmt) return [];
    var etiquetas = { pdf: 'PDF', csvColeccion: 'CSV', efa: 'EFA', png: 'PNG', svg: 'SVG' };
    var out = [];
    for (var k in etiquetas) if (fmt[k]) out.push(etiquetas[k]);
    return out;
  }

  function onEnrichComplete(e) {
    _enrichRunning = false;
    _setEnrichBtn(false);
    var d = e && e.detail || {};
    // `recalculado === false` ⇒ fue una exportación pura, nada se reescribió en disco.
    var esExportacion = d.recalculado === false;
    var verbo = esExportacion ? 'exportados' : 'actualizados';

    _setProgress(d.total || 0, d.total || 0, '✓ ' + (d.enriched || 0) + ' ' + verbo +
      (d.skipped ? ' · ' + d.skipped + ' omitidos' : ''));

    var exportDir = d.exportDir || null;
    var fmts      = _formatosEscritos(d.formatos);

    if (window.toast) {
      var msg = (d.enriched || 0) + (esExportacion ? ' objetos exportados' : ' análisis actualizados');
      if (d.skipped) msg += ' · ' + d.skipped + ' omitidos';
      if (exportDir && fmts.length) msg += ' · ' + fmts.join(' + ');
      window.toast.success(msg);
    }

    /* Chip «Exportado» de la cabecera */
    if (exportDir && fmts.length) {
      var chipExp = $('adr5ChipExportado');
      if (chipExp) MO.setChip(chipExp, 'ok', fmts.join(' + '));
    }

    // Mostrar botón "Abrir exportados" si la carpeta existe
    if (exportDir && window.electronAPI && window.electronAPI.openFolder) {
      var bar = document.getElementById('enrichProgressBar');
      if (bar) {
        var btnAbrir = document.createElement('button');
        btnAbrir.className = 'laar-btn laar-btn--sm';
        btnAbrir.textContent = '📂 Abrir exportados';
        btnAbrir.style.marginTop = '6px';
        btnAbrir.onclick = function () {
          window.electronAPI.openFolder(exportDir);
        };
        // Reemplazar si ya existe uno previo
        var prev = bar.querySelector('.btn-abrir-exportados');
        if (prev) prev.remove();
        btnAbrir.classList.add('btn-abrir-exportados');
        bar.appendChild(btnAbrir);
      }
    }
  }

  function onEnrichCsvReady(e) {
    var d = e && e.detail || {};
    if (!d.csvContent || !d.csvName) return;
    try {
      var blob = new Blob([d.csvContent], { type: 'text/csv;charset=utf-8;' });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href     = url;
      a.download = d.csvName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 3000);
      if (window.toast) window.toast.success('CSV colección descargado: ' + d.csvName);
      /* Marcar chip Exportado */
      var ce = document.getElementById('adr5ChipExportado');
      if (ce && window.MaoOrganizer) window.MaoOrganizer.setChip(ce, 'ok', 'CSV colección');
    } catch (err) {
      console.warn('[Enrich] Error descargando CSV:', err && err.message);
    }
  }

  function onEnrichError(e) {
    _enrichRunning = false;
    _setEnrichBtn(false);
    var msg = (e && e.detail && e.detail.message) || 'Error desconocido';
    _setProgress(0, 1, '✗ ' + msg);
    if (window.toast) window.toast.error('Error al actualizar colección: ' + msg);
  }

  /* ── Modal «Exportar colección» ──────────────────────────────────────────
     Exportación por lote configurable. Comparte motor con «Actualizar colección»
     (projectManager.enrichCollection vía el evento mao:enrich:request); lo que
     cambia son las `options`: selección de objetos, formatos y destino, y
     `recalcular:false` para exportar sin recomputar. ───────────────────────── */

  var _excColeccion = null;   // colección cargada para el modal
  var _excDestino   = null;   // destino elegido por el usuario (null = por defecto)
  var _excCtx       = null;   // { projectId, folderPath, project }

  function _excFecha() {
    return new Date().toISOString().slice(0, 10);
  }

  function _excDirDefecto() {
    var base = (_excCtx && _excCtx.project && _excCtx.project.folderPath) ||
               (_excCtx && _excCtx.folderPath) || '';
    return base ? (base + '/_exportados/' + _excFecha()) : '';
  }

  function _excSetDestino(dir) {
    _excDestino = dir || null;
    var out = document.getElementById('excDestinoPath');
    if (!out) return;
    var mostrado = _excDestino || _excDirDefecto() || '—';
    out.textContent = mostrado;
    out.title = mostrado;
  }

  function _excFormatos() {
    var chk = function (id) {
      var n = document.getElementById(id);
      return !!(n && n.checked);
    };
    return {
      pdf         : chk('excFmtPdf'),
      csvColeccion: chk('excFmtCsv'),
      efa         : chk('excFmtEfa'),
      png         : chk('excFmtPng'),
      svg         : chk('excFmtSvg')
    };
  }

  function _excSeleccion() {
    var nodos = document.querySelectorAll('#excListaObjetos input[type="checkbox"]:checked');
    var out = [];
    for (var i = 0; i < nodos.length; i++) out.push(nodos[i].value);
    return out;
  }

  function _excActualizarResumen() {
    var sel   = _excSeleccion();
    var fmt   = _excFormatos();
    var nFmt  = 0;
    for (var k in fmt) if (fmt[k]) nFmt++;

    var resumen = document.getElementById('excResumen');
    var btn     = document.getElementById('excExportar');
    var listo   = sel.length > 0 && nFmt > 0;

    if (resumen) {
      if (!sel.length)      resumen.textContent = 'Selecciona al menos un objeto';
      else if (!nFmt)       resumen.textContent = 'Selecciona al menos un formato';
      else resumen.textContent = sel.length + (sel.length === 1 ? ' objeto' : ' objetos') +
                                 ' · ' + nFmt + (nFmt === 1 ? ' formato' : ' formatos');
    }
    if (btn) btn.disabled = !listo;
  }

  function _excRenderLista(objetos) {
    var cont = document.getElementById('excListaObjetos');
    if (!cont) return;
    cont.textContent = '';

    if (!objetos || !objetos.length) {
      var vacio = document.createElement('div');
      vacio.className = 'exc-vacio';
      vacio.textContent = 'La colección está vacía.';
      cont.appendChild(vacio);
      return;
    }

    objetos.forEach(function (o) {
      var row = document.createElement('label');
      row.className = 'exc-obj-row';

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = o.carpeta;
      cb.checked = true;
      cb.addEventListener('change', _excActualizarResumen);

      var nom = document.createElement('span');
      nom.className = 'exc-obj-name';
      nom.textContent = o.nombreObjeto || o.carpeta;
      nom.title = o.carpeta;

      var meta = document.createElement('span');
      meta.className = 'exc-obj-meta';
      var partes = [];
      if (o.cara && o.cara !== 'Mono') partes.push('cara ' + o.cara);
      if (o.timestamp) partes.push(String(o.timestamp).slice(0, 10));
      meta.textContent = partes.join(' · ');

      row.appendChild(cb);
      row.appendChild(nom);
      row.appendChild(meta);
      cont.appendChild(row);
    });
  }

  /** Carga la colección del proyecto resuelto, con los mismos fallbacks que enrichCollection. */
  function _excCargarColeccion(ctx) {
    var pm = window.projectManager;
    if (!pm) return Promise.resolve(null);

    var p = Promise.resolve(null);
    if (ctx.projectId && typeof pm.loadProjectCollection === 'function') {
      p = pm.loadProjectCollection(ctx.projectId);
    }
    return p.then(function (col) {
      if (col) return col;
      var fp = (ctx.project && ctx.project.folderPath) || ctx.folderPath;
      if (window.currentCollection && window.currentCollection.folderPath === fp) {
        return window.currentCollection;
      }
      if (typeof pm.rebuildCollectionIndex === 'function') {
        var proj = ctx.project || { id: ctx.projectId, name: '', folderPath: fp };
        return pm.rebuildCollectionIndex(proj);
      }
      return null;
    }).catch(function (err) {
      console.warn('[Exportar colección] No se pudo cargar la colección:', err && err.message);
      return null;
    });
  }

  function _excAbrir() {
    if (_enrichRunning) {
      if (window.toast) window.toast.warning('Hay una exportación en curso.');
      return;
    }
    var ctx = _resolverProyecto();
    if (!ctx.projectId && !ctx.folderPath) {
      if (window.toast) window.toast.warning('Abre primero la colección de un proyecto usando "Ver Colección".');
      return;
    }
    _excCtx = ctx;

    var modal = document.getElementById('exportColeccionModal');
    if (!modal) return;
    modal.classList.add('is-open');

    var cont = document.getElementById('excListaObjetos');
    if (cont) {
      cont.textContent = '';
      var cargando = document.createElement('div');
      cargando.className = 'exc-vacio';
      cargando.textContent = 'Cargando colección…';
      cont.appendChild(cargando);
    }
    _excSetDestino(null);
    _excActualizarResumen();

    _excCargarColeccion(ctx).then(function (col) {
      _excColeccion = col;
      _excRenderLista(col && col.objetos);
      _excActualizarResumen();
    });
  }

  function _excCerrar() {
    var modal = document.getElementById('exportColeccionModal');
    if (modal) modal.classList.remove('is-open');
  }

  function _excMarcarTodos(valor) {
    var nodos = document.querySelectorAll('#excListaObjetos input[type="checkbox"]');
    for (var i = 0; i < nodos.length; i++) nodos[i].checked = valor;
    _excActualizarResumen();
  }

  function _excElegirCarpeta() {
    if (!window.electronAPI || typeof window.electronAPI.selectFolder !== 'function') {
      if (window.toast) window.toast.warning('El selector de carpeta no está disponible en esta ventana.');
      return;
    }
    var base = _excDestino || _excDirDefecto();
    window.electronAPI.selectFolder({ defaultPath: base }).then(function (dir) {
      if (dir) _excSetDestino(dir);
    }).catch(function (err) {
      console.warn('[Exportar colección] selectFolder:', err && err.message);
    });
  }

  function _excExportar() {
    var sel = _excSeleccion();
    var fmt = _excFormatos();
    if (!sel.length) return;

    var total = (_excColeccion && _excColeccion.objetos) ? _excColeccion.objetos.length : 0;
    // Si están todos marcados, no enviamos lista: enrichCollection procesa la colección entera.
    var objetos = (total && sel.length === total) ? null : sel;

    var recalcNode = document.getElementById('excRecalcular');
    var recalcular = !!(recalcNode && recalcNode.checked);

    _excCerrar();

    _enrichRunning = true;
    _setEnrichBtn(true);
    _showProgress(true);
    _setProgress(0, 1, 'Preparando exportación…');

    document.dispatchEvent(new CustomEvent('mao:enrich:request', {
      detail: {
        projectId : _excCtx ? _excCtx.projectId : null,
        folderPath: _excCtx ? _excCtx.folderPath : null,
        options   : {
          objetos   : objetos,
          formatos  : fmt,
          exportDir : _excDestino || null,
          recalcular: recalcular
        }
      }
    }));
  }

  function bindModalExportacion() {
    var on = function (id, ev, fn) {
      var n = document.getElementById(id);
      if (n) n.addEventListener(ev, fn);
    };
    on('adr5BtnExportarColeccion', 'click', _excAbrir);
    on('excCerrar',          'click', _excCerrar);
    on('excCancelar',        'click', _excCerrar);
    on('excExportar',        'click', _excExportar);
    on('excSelTodos',        'click', function () { _excMarcarTodos(true);  });
    on('excSelNinguno',      'click', function () { _excMarcarTodos(false); });
    on('excElegirCarpeta',   'click', _excElegirCarpeta);
    on('excDestinoDefecto',  'click', function () { _excSetDestino(null); });

    ['excFmtPdf', 'excFmtCsv', 'excFmtEfa', 'excFmtPng', 'excFmtSvg'].forEach(function (id) {
      on(id, 'change', _excActualizarResumen);
    });

    /* Cerrar al clicar el fondo o con Escape */
    var modal = document.getElementById('exportColeccionModal');
    if (modal) {
      modal.addEventListener('click', function (e) { if (e.target === modal) _excCerrar(); });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var m = document.getElementById('exportColeccionModal');
      if (m && m.classList.contains('is-open')) _excCerrar();
    });
  }

  /* ── Cableado de señales ─────────────────────────────────────────────────── */

  function bindEvents() {
    /* Botón Ver Colección */
    var btnCol = document.getElementById('adr5BtnVerColeccion');
    if (btnCol) btnCol.addEventListener('click', onVerColeccion);

    /* Botón CMO */
    var btnCMO = document.getElementById('adr5BtnAbrirCMO');
    if (btnCMO) btnCMO.addEventListener('click', onAbrirCMO);

    /* Botón Procrustes */
    var btnPS = document.getElementById('adr5BtnAbrirProcrustes');
    if (btnPS) btnPS.addEventListener('click', onAbrirProcrustes);

    /* Botón Actualizar colección */
    var btnEnrich = document.getElementById('adr5BtnEnriquecer');
    if (btnEnrich) btnEnrich.addEventListener('click', onEnriquecerColeccion);

    /* Modal «Exportar colección…» */
    bindModalExportacion();

    /* Cerrar barra de progreso manualmente */
    var btnClose = document.getElementById('enrichProgressClose');
    if (btnClose) btnClose.addEventListener('click', function () { _showProgress(false); });

    /* Eventos de progreso / resultado del enriquecimiento */
    document.addEventListener('mao:enrich:progress',   onEnrichProgress);
    document.addEventListener('mao:enrich:complete',   onEnrichComplete);
    document.addEventListener('mao:enrich:error',      onEnrichError);
    document.addEventListener('mao:enrich:csv-ready',  onEnrichCsvReady);

    /* Análisis completado */
    document.addEventListener('mao:analysis:done', setAnalisisDone);

    /* Nuevo análisis / reset */
    var btnNuevo = document.getElementById('nuevoAnalisisBtn');
    if (btnNuevo) btnNuevo.addEventListener('click', resetChips);

    /* Cambio de objeto seleccionado → reset de análisis y exportado */
    document.addEventListener('mao:objects:changed', function () {
      var ca = $('adr5ChipAnalisis');
      var ce = $('adr5ChipExportado');
      if (ca) MO.setChip(ca, 'none', '—');
      if (ce) MO.setChip(ce, 'none', '—');
      updateObjetoChip();
    });

    /* Botones de exportación — marcar chip Exportado al click */
    var exportBtns = [
      { id: 'exportCSVBtn',               label: 'CSV' },
      { id: 'exportPDFBtn',               label: 'PDF' },
      { id: 'exportarAnalisisCompletoBtn', label: 'CSV completo' },
      { id: 'exportarMetricasModalBtn',   label: 'CSV métricas' },
      { id: 'exportarPDFIntegralBtn',     label: 'PDF integral' },
      { id: 'exportarSVGVectorialBtn',    label: 'SVG' },
      { id: 'exportarPNGMorfologicoBtn',  label: 'PNG' },
    ];
    exportBtns.forEach(function (b) {
      var btn = document.getElementById(b.id);
      if (btn) btn.addEventListener('click', function () { setExportadoDone(b.label); });
    });
  }

  MO.bootWhenReady(bindEvents);

  /* ── Exportación Dataset ML (ADR-014) ────────────────────────────────────── */

  (function () {
    var ENDPOINT = 'http://127.0.0.1:8765/api/dataset/export';

    /* Construye la lista de objetos analizados que tienen métricas */
    function _collectAnalyzedObjects() {
      var objs = window.objects || [];
      return objs.filter(function (o) {
        return o && o.metricas && Object.keys(o.metricas).length > 0;
      }).map(function (o) {
        return {
          id: String(o.id || o.numeroObjeto || ''),
          bbox: { x: o.minX || 0, y: o.minY || 0, width: o.width || 0, height: o.height || 0 },
          contour_points: o.contour_points || [],
          // ADR-019: el default 1.0 marcaba como PERFECTO todo objeto sin confianza
          // medida, y el filtro `min_confidence` del exportador los dejaba pasar
          // siempre. Un dato ausente se declara ausente, no se inventa.
          detection_confidence: o.detectionConfidence ?? o.detection_confidence ?? null,
          detection_method: o.detectionMethod || 'unknown',
          tipologia: o.tipologia || null,
          metricas: o.metricas || {},
          scale_px_mm: window.currentScalePxMm || 0,
        };
      });
    }

    /* Convierte la imagen activa a base64 */
    function _imageToBase64() {
      var canvas = document.createElement('canvas');
      var img = window.image || window._imagenActivaMorfologico;
      if (!img) return null;
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      var dataUrl = canvas.toDataURL('image/png');
      return dataUrl.replace(/^data:image\/png;base64,/, '');
    }

    /* Muestra el modal de configuración */
    function _showExportModal() {
      var existing = document.getElementById('maoDatasetModal');
      if (existing) { existing.style.display = 'flex'; return; }

      var objs = _collectAnalyzedObjects();
      var defaultName = (window.currentFileName || 'coleccion').replace(/\.[^.]+$/, '');

      var modal = document.createElement('div');
      modal.id = 'maoDatasetModal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5)';
      modal.innerHTML = [
        '<div style="background:var(--laar-bg,#fff);border-radius:8px;padding:24px;width:380px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.25)">',
        '  <h3 style="margin:0 0 16px;font-size:15px;font-weight:600">Exportar dataset ML</h3>',
        '  <label style="display:block;margin-bottom:12px;font-size:13px">',
        '    Nombre de la colección',
        '    <input id="dsName" type="text" value="' + defaultName + '"',
        '      style="display:block;width:100%;margin-top:4px;padding:6px 8px;border:1px solid var(--laar-border,#ccc);border-radius:4px;font-size:13px;box-sizing:border-box">',
        '  </label>',
        '  <label style="display:block;margin-bottom:12px;font-size:13px">',
        '    Confianza mínima: <span id="dsConfVal">0.50</span>',
        '    <input id="dsConf" type="range" min="0" max="1" step="0.05" value="0.5"',
        '      style="display:block;width:100%;margin-top:4px">',
        '  </label>',
        '  <label style="display:block;margin-bottom:16px;font-size:13px">',
        '    <input id="dsTipoOnly" type="checkbox"> Solo objetos con tipología asignada',
        '  </label>',
        '  <p id="dsPreview" style="font-size:12px;color:var(--laar-muted,#666);margin:0 0 16px">',
        '    ' + objs.length + ' objetos disponibles',
        '  </p>',
        '  <div style="display:flex;gap:8px;justify-content:flex-end">',
        '    <button id="dsCancelBtn" class="laar-btn" style="min-width:80px">Cancelar</button>',
        '    <button id="dsExportBtn" class="laar-btn laar-btn--primary" style="min-width:120px">Exportar ZIP</button>',
        '  </div>',
        '  <p id="dsStatus" style="font-size:12px;margin:12px 0 0;min-height:18px"></p>',
        '</div>',
      ].join('');

      document.body.appendChild(modal);

      /* Actualizar preview al mover el slider */
      var slider = document.getElementById('dsConf');
      var confVal = document.getElementById('dsConfVal');
      var preview = document.getElementById('dsPreview');
      var tipoOnly = document.getElementById('dsTipoOnly');

      function updatePreview() {
        var minConf = parseFloat(slider.value);
        confVal.textContent = minConf.toFixed(2);
        var filtered = objs.filter(function (o) {
          if ((o.detection_confidence || 1) < minConf) return false;
          if (tipoOnly.checked && !o.tipologia) return false;
          return true;
        });
        preview.textContent = filtered.length + ' de ' + objs.length + ' objetos se exportarán';
      }
      slider.addEventListener('input', updatePreview);
      tipoOnly.addEventListener('change', updatePreview);
      updatePreview();

      document.getElementById('dsCancelBtn').addEventListener('click', function () {
        modal.style.display = 'none';
      });

      document.getElementById('dsExportBtn').addEventListener('click', function () {
        _doExport(modal, objs);
      });

      modal.addEventListener('click', function (e) {
        if (e.target === modal) modal.style.display = 'none';
      });
    }

    /* Ejecuta la exportación */
    function _doExport(modal, objs) {
      var name = (document.getElementById('dsName').value || 'mao_dataset').trim();
      var minConf = parseFloat(document.getElementById('dsConf').value);
      var tipoOnly = document.getElementById('dsTipoOnly').checked;
      var status = document.getElementById('dsStatus');
      var btn = document.getElementById('dsExportBtn');

      var filtered = objs.filter(function (o) {
        if (!tipoOnly) return true;
        return !!o.tipologia;
      });

      var imgB64 = _imageToBase64();
      if (!imgB64) {
        status.textContent = 'Error: no hay imagen activa.';
        return;
      }

      btn.disabled = true;
      status.textContent = 'Exportando…';

      var zipName = name + '_' + new Date().toISOString().slice(0, 10) + '.zip';

      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imgB64,
          objects: filtered,
          scale_px_mm: window.currentScalePxMm || 0,
          dataset_name: name,
          min_confidence: minConf,
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.status !== 'ok') throw new Error(data.detail || 'Error desconocido');

          var bytes = Uint8Array.from(atob(data.zip_b64), function (c) { return c.charCodeAt(0); });
          var blob = new Blob([bytes], { type: 'application/zip' });

          /* 1 — Descarga del navegador (siempre) */
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = zipName;
          a.click();
          setTimeout(function () { URL.revokeObjectURL(url); }, 5000);

          /* 2 — Guardar en carpeta del análisis vía Electron (si disponible) */
          if (window.electronAPI && window.electronAPI.showSaveDialog) {
            status.textContent = 'Elige dónde guardar en disco…';
            window.electronAPI.showSaveDialog(zipName, 'zip')
              .then(function (result) {
                if (result.canceled || !result.filePath) {
                  status.textContent = '✓ ' + data.exported_objects + ' objetos exportados (solo Descargas).';
                  setExportadoDone('Dataset ML');
                  btn.disabled = false;
                  return;
                }
                /* Convertir blob a base64 para electronAPI.saveFile */
                var reader = new FileReader();
                reader.onload = function () {
                  var b64 = reader.result.replace(/^data:[^;]+;base64,/, '');
                  window.electronAPI.saveFile(result.filePath, b64)
                    .then(function () {
                      status.textContent = '✓ ' + data.exported_objects + ' objetos exportados — guardado en:\n' + result.filePath;
                      setExportadoDone('Dataset ML');
                      btn.disabled = false;
                    })
                    .catch(function (err) {
                      status.textContent = '✓ Descargado. Error al guardar en disco: ' + err.message;
                      btn.disabled = false;
                    });
                };
                reader.readAsDataURL(blob);
              })
              .catch(function () {
                status.textContent = '✓ ' + data.exported_objects + ' objetos exportados (solo Descargas).';
                setExportadoDone('Dataset ML');
                btn.disabled = false;
              });
          } else {
            status.textContent = '✓ ' + data.exported_objects + ' objetos exportados.';
            setExportadoDone('Dataset ML');
            btn.disabled = false;
          }
        })
        .catch(function (err) {
          status.textContent = 'Error: ' + err.message;
          btn.disabled = false;
        });
    }

    /* Inyectar botón «Exportar dataset ML» junto a los demás botones de exportación */
    function _injectButton() {
      if (document.getElementById('exportDatasetMLBtn')) return;

      /* Buscar el contenedor de botones de exportación */
      var container = document.getElementById('sidebarResultCard')
        || document.getElementById('sidebarActionsSection')
        || document.querySelector('.mao-result-actions')
        || document.querySelector('#resultadosPanel .mao-panel__body');

      if (!container) return;

      var btn = document.createElement('button');
      btn.id = 'exportDatasetMLBtn';
      btn.className = 'laar-btn';
      btn.textContent = 'Exportar dataset ML';
      btn.title = 'Genera un ZIP con PNGs + anotaciones COCO para entrenar modelos ML';
      btn.style.cssText = 'margin-top:8px;width:100%';
      btn.addEventListener('click', _showExportModal);

      container.appendChild(btn);
    }

    /* Activar cuando haya análisis completo */
    document.addEventListener('mao:analysis:done', function () {
      MO.bootWhenReady(_injectButton);
    });
    /* También intentar al cargar por si ya hay análisis en sessionStorage */
    MO.bootWhenReady(_injectButton);
  }());

})();
