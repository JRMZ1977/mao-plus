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

  /** Normaliza una lista in place; devuelve la misma referencia. */
  function normalizarLista(arr) {
    if (!Array.isArray(arr)) return arr;
    for (var i = 0; i < arr.length; i++) normalizar(arr[i]);
    return arr;
  }

  var api = {
    CONTRACT_VERSION: CONTRACT_VERSION,
    normalizar: normalizar,
    normalizarLista: normalizarLista,
    modoCanonico: modoCanonico
  };

  root.MaoDeteccion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // tests node
})(typeof window !== 'undefined' ? window : globalThis);
