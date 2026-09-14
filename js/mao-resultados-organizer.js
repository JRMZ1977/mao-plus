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
    var btn = document.getElementById('adr5BtnEnriquecer');
    if (!btn) return;
    btn.disabled = disabled;
    btn.style.opacity = disabled ? '0.5' : '';
    btn.style.cursor  = disabled ? 'not-allowed' : '';
  }

  function onEnriquecerColeccion() {
    if (_enrichRunning) return;
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

    if (!projectId && !overrideFolderPath) {
      if (window.toast) window.toast.warning('Abre primero la colección de un proyecto usando "Ver Colección".');
      return;
    }
    _enrichRunning = true;
    _setEnrichBtn(true);
    _showProgress(true);
    _setProgress(0, 1, 'Cargando colección…');
    document.dispatchEvent(new CustomEvent('mao:enrich:request', {
      detail: {
        projectId: projectId,
        folderPath: overrideFolderPath,   // para proyectos externos sin proyectoId
        options: {}
      }
    }));
  }

  function onEnrichProgress(e) {
    var d = e && e.detail || {};
    var label = d.fase === 'guardado'
      ? (d.done + ' / ' + d.total + ' — ' + (d.nombreObjeto || ''))
      : d.fase === 'efa'
      ? ('EFA ' + d.done + ' / ' + d.total + ' — ' + (d.nombreObjeto || ''))
      : d.fase === 'pdf'
      ? ('PDF ' + d.done + ' / ' + d.total + ' — ' + (d.nombreObjeto || ''))
      : ('Leyendo ' + (d.done + 1) + ' / ' + d.total + '…');
    _setProgress(d.done || 0, d.total || 1, label);
  }

  function onEnrichComplete(e) {
    _enrichRunning = false;
    _setEnrichBtn(false);
    var d = e && e.detail || {};
    _setProgress(d.total || 0, d.total || 0, '✓ ' + (d.enriched || 0) + ' actualizados' +
      (d.skipped ? ' · ' + d.skipped + ' omitidos' : ''));

    var exportDir = d.exportDir || null;

    if (window.toast) {
      var msg = (d.enriched || 0) + ' análisis actualizados';
      if (d.skipped) msg += ' · ' + d.skipped + ' omitidos';
      if (exportDir) msg += ' · PDFs y EFAs en _exportados/';
      window.toast.success(msg);
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
          detection_confidence: o.detectionConfidence || o.detection_confidence || 1.0,
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
