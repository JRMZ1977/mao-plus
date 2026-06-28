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

  function bindEvents() {
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
