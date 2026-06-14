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

})();
