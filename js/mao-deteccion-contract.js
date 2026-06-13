/* ===========================================================================
 * mao-deteccion-contract.js — ADR-008 · Fase 1 (contrato de salida de captura)
 * ---------------------------------------------------------------------------
 * Normaliza la FORMA de objeto que emiten los cuatro caminos de detección
 * (auto-backend `detection.detect`, auto-frontend `detectarObjetosHibrido`,
 * manual `detectarObjetosEnArea`, IA `mao_ia_analyzer`→`cardObj`) ANTES de que
 * crucen a `window.objects`. Único choke point cableado: el top de
 * `individualizarObjetos()` (el render que despacha `mao:objects:rendered`,
 * frontera de ADR-007).
 *
 * Principios (igual que ADR-005/007):
 *  · ADITIVO + ALIAS — solo se RELLENAN campos faltantes; nunca se sobrescribe
 *    un valor existente (salvo `detectionMethod`, que pasa a enum y preserva el
 *    crudo en `detectionMethodRaw`). Los consumidores legacy siguen funcionando.
 *  · `id` INTACTO — es clave de join viva (~17 `find(o=>o.id===obj.id)` +
 *    identidad persistida en collection.js). Reescribirlo rompería los joins, así
 *    que solo se añade `source_id`. El rewrite de `id` es una migración aparte.
 *  · SIN confianza — el cálculo/aliasing de confianza es Fase 2.
 *  · IDEMPOTENTE — re-normalizar es inocuo (todo se deriva determinísticamente).
 *  · NUNCA LANZA — el render es crítico; un objeto raro pasa intacto.
 *
 * Reversible: comentar su <script> en index.html deja los objetos con su forma
 * legacy. No es dependencia dura de nadie (el cableado va tras `if (window…)`).
 * =========================================================================== */
(function (root) {
  'use strict';

  var CONTRACT_VERSION = 1;

  /** Primer argumento que sea un número finito; si no hay, null. */
  function firstNum() {
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (typeof v === 'number' && isFinite(v)) return v;
    }
    return null;
  }

  /** C3 · `detectionMethod` crudo → enum canónico 'automatic'|'manual'|'ia'. */
  function modoCanonico(obj) {
    if (obj._fromIA === true || obj._samSegmented === true) return 'ia';
    var raw = obj.detectionMethodRaw != null ? obj.detectionMethodRaw
            : obj.detectionMethod    != null ? obj.detectionMethod
            : obj._detMethod         != null ? obj._detMethod
            : obj._source            != null ? obj._source
            : '';
    var s = String(raw).toLowerCase();
    if (s.indexOf('mao_ia') !== -1) return 'ia';
    if (s.indexOf('manual') !== -1 || s.indexOf('region_bfs') !== -1) return 'manual';
    if (obj.detectionArea) return 'manual';
    return 'automatic';
  }

  /**
   * Normaliza UN objeto de detección in place y lo devuelve.
   * Aditivo: solo rellena lo que falta. Nunca lanza.
   */
  function normalizar(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    try {
      // ── C3 · método canónico (preserva el crudo una sola vez) ──────────────
      if (obj.detectionMethodRaw == null) {
        obj.detectionMethodRaw =
            obj.detectionMethod != null ? obj.detectionMethod
          : obj._detMethod      != null ? obj._detMethod
          : obj._source         != null ? obj._source
          : null;
      }
      obj.detectionMethod = modoCanonico(obj);

      // ── C4 · bounding box canónico {x,y,w,h} + alias derivados ─────────────
      var b = (obj.bbox && typeof obj.bbox === 'object') ? obj.bbox : null;
      var x = firstNum(b && b.x, obj.minX, obj.bbox_x);
      var y = firstNum(b && b.y, obj.minY, obj.bbox_y);
      var w = firstNum(
        b && (b.w != null ? b.w : b.width), obj.width, obj.bbox_w,
        (typeof obj.maxX === 'number' && typeof obj.minX === 'number') ? obj.maxX - obj.minX : null
      );
      var h = firstNum(
        b && (b.h != null ? b.h : b.height), obj.height, obj.bbox_h,
        (typeof obj.maxY === 'number' && typeof obj.minY === 'number') ? obj.maxY - obj.minY : null
      );
      if (x != null && y != null && w != null && h != null) {
        obj.bbox = { x: x, y: y, w: w, h: h };
        if (obj.minX   == null) obj.minX   = x;
        if (obj.minY   == null) obj.minY   = y;
        if (obj.width  == null) obj.width  = w;
        if (obj.height == null) obj.height = h;
        if (obj.maxX   == null) obj.maxX   = x + w;
        if (obj.maxY   == null) obj.maxY   = y + h;
      }

      // ── C5 · área canónica `area_pixels` + alias ───────────────────────────
      var a = firstNum(obj.area, obj.area_pixels, obj.pixelCount);
      if (a != null) {
        if (obj.area_pixels == null) obj.area_pixels = a;
        if (obj.area        == null) obj.area        = a;
        if (obj.pixelCount  == null) obj.pixelCount  = a;
      }

      // ── C2 (mitad aditiva) · source_id preserva el id nativo; `id` intacto ─
      if (obj.source_id == null && obj.id != null) obj.source_id = obj.id;

      // ── C6 · pre-descriptores morfo bajo clave única (opcional) ────────────
      if (obj.morpho == null) {
        var m = obj.mao_ia || obj._maoIA || null;
        if (!m && (obj.circularity != null || obj.solidity != null)) {
          m = {
            circularity:         obj.circularity         != null ? obj.circularity         : null,
            solidity:            obj.solidity            != null ? obj.solidity            : null,
            extent:              obj.extent              != null ? obj.extent              : null,
            aspect_ratio:        obj.aspect_ratio        != null ? obj.aspect_ratio        : null,
            equivalent_diameter: obj.equivalent_diameter != null ? obj.equivalent_diameter : null
          };
        }
        if (m) obj.morpho = m;
      }

      // ── C1 · confianza: sincroniza canónico ↔ legacy ───────────────────────
      // La confianza la CALCULA Fase 2 en la frontera del contorno (`/contour`);
      // aquí solo se unifican los alias para que todo consumidor la vea venga del
      // campo que venga: triage lee `_confidenceLvl`, viz-export/CSV leen ambos.
      var cScore = obj.detection_confidence != null ? obj.detection_confidence
                 : obj._confidence          != null ? obj._confidence : null;
      var cLevel = obj.confidence_level != null ? obj.confidence_level
                 : obj._confidenceLvl   != null ? obj._confidenceLvl : null;
      if (cScore != null) {
        if (obj.detection_confidence == null) obj.detection_confidence = cScore;
        if (obj._confidence          == null) obj._confidence          = cScore;
      }
      if (cLevel != null) {
        if (obj.confidence_level == null) obj.confidence_level = cLevel;
        if (obj._confidenceLvl   == null) obj._confidenceLvl   = cLevel;
      }

      obj.__contrato = CONTRACT_VERSION;
    } catch (e) {
      // El render no debe romperse por un objeto atípico.
      if (root.console && console.warn) {
        console.warn('[MaoDeteccion] normalizar() omitido para un objeto:', e && e.message);
      }
    }
    return obj;
  }

  function _firstDef() {
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i] != null) return arguments[i];
    }
    return null;
  }

  // ── ADR-008 Fase 3 · guard de schema (dev) ─────────────────────────────────
  // Valida que un objeto NORMALIZADO cumple el contrato. Devuelve [] si OK, o la
  // lista de campos en falta/ inválidos. La confianza es opcional (null válido).
  var _guard = true;
  function validar(obj) {
    if (!obj || typeof obj !== 'object') return ['no-objeto'];
    var bad = [];
    if (obj.__contrato !== CONTRACT_VERSION) bad.push('sin-sello');
    if (['automatic', 'manual', 'ia'].indexOf(obj.detectionMethod) === -1)
      bad.push('detectionMethod=' + obj.detectionMethod);
    var b = obj.bbox;
    if (!b || typeof b.x !== 'number' || typeof b.y !== 'number' ||
        typeof b.w !== 'number' || typeof b.h !== 'number') bad.push('bbox');
    if (typeof obj.area_pixels !== 'number') bad.push('area_pixels');
    if (obj.source_id == null && obj.id == null) bad.push('source_id/id');
    if (obj.confidence_level != null &&
        ['alta', 'media', 'baja'].indexOf(obj.confidence_level) === -1)
      bad.push('confidence_level=' + obj.confidence_level);
    return bad;
  }

  /** Normaliza una lista in place; devuelve la misma referencia. */
  function normalizarLista(arr) {
    if (!Array.isArray(arr)) return arr;
    for (var i = 0; i < arr.length; i++) normalizar(arr[i]);
    // Guard de schema: silencioso si el contrato se cumple (0 violaciones).
    if (_guard) {
      var viol = [];
      for (var j = 0; j < arr.length; j++) {
        var probs = validar(arr[j]);
        if (probs.length) viol.push({ id: arr[j] && (arr[j].id || arr[j].source_id), problemas: probs });
      }
      if (viol.length && root.console && console.warn) {
        console.warn('[MAO_CONTRATO] ' + viol.length + ' objeto(s) violan el contrato:',
          JSON.stringify(viol));
      }
    }
    return arr;
  }

  // ── ADR-008 Fase 3 · telemetría unificada (C7) ─────────────────────────────
  // Schema ÚNICO de [MONITOR_ANALISIS] para los 3 modos (auto/manual/IA). Antes
  // vivía duplicado y divergente en analysis-core.js y mao-ia.js. Superset de
  // ambos + confianza de detección canónica + método canónico.
  function buildMonitorAnalisis(obj, m) {
    obj = obj || {}; m = m || {};
    var enumModo = modoCanonico(obj);
    return {
      objeto: obj.id || obj.nombreObjeto || null,
      cara: obj.cara || 'mono',
      modo: enumModo === 'automatic' ? 'automatico' : enumModo,
      metodoDeteccion: obj.detectionMethod || enumModo,
      detectionMethodRaw: obj.detectionMethodRaw || null,
      detection_confidence: _firstDef(obj.detection_confidence, obj._confidence),
      confidence_level: _firstDef(obj.confidence_level, obj._confidenceLvl),
      analysis_method: m.analysis_method || null,
      forma: m.forma_detectada || m.forma_detectada_meta || null,
      forma_meta: m.forma_detectada_meta || null,
      forma_geometrica: m.forma_geometrica_observada || m.forma_detectada || null,
      forma_tipologica: m.forma_tipologica_inferida || m.forma_detectada_tipologica || null,
      forma_tipologica_reinterpretada: !!m.forma_requiere_reinterpretacion_tipologica,
      razon_tipologica: m.forma_razon_tipologica || null,
      tipo_artefacto: m.tipo_artefacto || null,
      subtipo_artefacto: m.subtipo_artefacto || null,
      confianza_tipologia: m.confianza_tipologia != null ? m.confianza_tipologia : null,
      area_fragmentada_px: m.area_fragmentada_px != null ? m.area_fragmentada_px : null,
      area_px: m.area_px != null ? m.area_px : null,
      centroid_hull_x: m.centroide_hull_x != null ? m.centroide_hull_x : null,
      centroid_hull_y: m.centroide_hull_y != null ? m.centroide_hull_y : null,
      radio_maximo_px: m.radio_maximo_px != null ? m.radio_maximo_px : null,
      radio_minimo_px: m.radio_minimo_px != null ? m.radio_minimo_px : null,
      ratio_radios: m.ratio_radios != null ? m.ratio_radios : null,
      regularidad_radial: m.regularidad_radial != null ? m.regularidad_radial : null,
      circularity: m.circularity != null ? m.circularity : null,
      solidity: m.solidity != null ? m.solidity : null,
      timestamp: new Date().toISOString(),
    };
  }

  var api = {
    CONTRACT_VERSION: CONTRACT_VERSION,
    normalizar: normalizar,
    normalizarLista: normalizarLista,
    modoCanonico: modoCanonico,
    validar: validar,
    buildMonitorAnalisis: buildMonitorAnalisis,
    setGuard: function (v) { _guard = !!v; }
  };

  root.MaoDeteccion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // tests node
})(typeof window !== 'undefined' ? window : globalThis);
