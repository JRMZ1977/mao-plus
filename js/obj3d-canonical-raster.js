/**
 * MAO Plus — Rasterización canónica 3D → 2D (cliente)
 * =====================================================
 * Espejo JavaScript del módulo Python `obj3d_canonical_raster.py`.
 *
 * Convierte un contorno canónico (puntos en mm) en una "imagen 2D sintética"
 * + estructuras compatibles con el pipeline morfológico 2D estándar
 * (analizarObjetoMorfologicamente / calcularMetricasMorfologicas).
 *
 * Diseño:
 *  - Resolución virtual `dpi` (px/mm), recomendado 20.
 *  - Origen del raster en (0,0); el bbox del contorno se traslada a (padding_px, padding_px).
 *  - Convex hull radial (estable con eje Y invertido; mismo motor que el resto del code 2D).
 *  - Imagen PNG generada con OffscreenCanvas + Path2D filled polygon.
 *  - Métricas de paridad mm↔raster reportadas como diagnóstico opcional.
 *
 * Contrato de unidades (CRÍTICO):
 *  - ENTRADA: `contour_mm` SIEMPRE en milímetros. Si el caller tiene puntos en
 *    unidades OBJ, debe pre-multiplicar por `mm_per_unit` antes de invocar.
 *  - SALIDA: `scale_mm_per_px = 1 / dpi`. El pipeline 2D consumirá los
 *    `contour_points_px` directamente y recuperará mm vía `escalaPixelesPorMM`.
 */

(function () {
  'use strict';

  function _polygonAreaShoelace(pts) {
    if (!pts || pts.length < 3) return 0;
    let s = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % n];
      s += x1 * y2 - x2 * y1;
    }
    return Math.abs(s) / 2;
  }

  function _polygonPerimeter(pts, closed) {
    if (!pts || pts.length < 2) return 0;
    let s = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = pts[i + 1][0] - pts[i][0];
      const dy = pts[i + 1][1] - pts[i][1];
      s += Math.hypot(dx, dy);
    }
    if (closed && pts.length >= 3) {
      const dx = pts[0][0] - pts[pts.length - 1][0];
      const dy = pts[0][1] - pts[pts.length - 1][1];
      s += Math.hypot(dx, dy);
    }
    return s;
  }

  /**
   * Convex hull radial alrededor del centroide. Estable cualquiera sea
   * la orientación del eje Y; igual algoritmo que `calcularConvexHullRadial`
   * expuesto por analysis-core.js (usado como fallback si no está disponible).
   */
  function _convexHullRadial(pts) {
    if (!pts || pts.length < 3) return (pts || []).slice();
    if (typeof window.calcularConvexHullRadial === 'function') {
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const hull = window.calcularConvexHullRadial(pts, cx, cy);
      if (hull && hull.length >= 3) return hull;
    }
    // Fallback: monotone chain (Andrew)
    const sorted = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (O, A, B) => (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
    const lower = [];
    for (const p of sorted) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      const p = sorted[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    upper.pop(); lower.pop();
    return lower.concat(upper);
  }

  /**
   * Rasteriza un contorno canónico (mm) a un objeto 2D sintético.
   *
   * @param {Array<[number,number]>} contour_mm  Contorno en milímetros (≥3 puntos)
   * @param {object} [opts]
   * @param {number} [opts.dpi=20]               Resolución virtual (px/mm)
   * @param {number} [opts.padding_px=10]        Margen alrededor del bbox
   * @param {Array<Array<[number,number]>>} [opts.holes_mm=[]]  Agujeros/perforaciones en mm
   * @param {number} [opts.background=255]       Gris fondo (0..255)
   * @param {number} [opts.fill=180]             Gris relleno
   * @param {number} [opts.stroke=40]            Gris borde
   * @param {number} [opts.stroke_width=1]       Grosor borde (px); 0 = sin borde
   * @returns {object} {
   *   contour_points_px, convex_hull_px, holes_px,
   *   bbox_px:{minX,minY,width,height},
   *   image_size:{width,height}, image_data_url,
   *   scale_mm_per_px, dpi, padding_px,
   *   area_mm2_input, perimeter_mm_input
   * }
   */
  function obj3dToCanonicalRaster(contour_mm, opts) {
    const o = Object.assign({
      dpi: 20,
      padding_px: 10,
      holes_mm: [],
      background: 255,
      fill: 180,
      stroke: 40,
      stroke_width: 1,
    }, opts || {});

    if (!Array.isArray(contour_mm) || contour_mm.length < 3) {
      throw new Error('contour_mm debe ser [[x,y],...] con ≥3 puntos');
    }
    if (!(o.dpi > 0)) throw new Error('dpi debe ser > 0');
    if (o.padding_px < 0) throw new Error('padding_px debe ser >= 0');

    // Normalizar puntos (acepta [x,y] o {x,y})
    const pts_mm = contour_mm.map(p => Array.isArray(p) ? [+p[0], +p[1]] : [+p.x, +p.y]);

    let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
    for (const [x, y] of pts_mm) {
      if (x < xMin) xMin = x;
      if (y < yMin) yMin = y;
      if (x > xMax) xMax = x;
      if (y > yMax) yMax = y;
    }
    const span_x = xMax - xMin;
    const span_y = yMax - yMin;
    if (!(span_x > 0) || !(span_y > 0)) {
      throw new Error('contour_mm tiene span nulo en x o y');
    }

    const dpi = o.dpi;
    const pad = o.padding_px | 0;

    // Conversión mm → px (subpíxel float)
    const pts_px = pts_mm.map(([x, y]) => [(x - xMin) * dpi + pad, (y - yMin) * dpi + pad]);

    const width_px  = Math.ceil(span_x * dpi) + 2 * pad;
    const height_px = Math.ceil(span_y * dpi) + 2 * pad;

    // Canvas (OffscreenCanvas si disponible; fallback a <canvas>)
    const canvas = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(width_px, height_px)
      : Object.assign(document.createElement('canvas'), { width: width_px, height: height_px });
    const ctx = canvas.getContext('2d');

    // Fondo
    ctx.fillStyle = `rgb(${o.background},${o.background},${o.background})`;
    ctx.fillRect(0, 0, width_px, height_px);

    // Polígono relleno
    ctx.fillStyle = `rgb(${o.fill},${o.fill},${o.fill})`;
    ctx.beginPath();
    ctx.moveTo(pts_px[0][0], pts_px[0][1]);
    for (let i = 1; i < pts_px.length; i++) ctx.lineTo(pts_px[i][0], pts_px[i][1]);
    ctx.closePath();
    ctx.fill('evenodd');

    // Agujeros (perforaciones): pintar del color del fondo
    const holes_px_out = [];
    if (Array.isArray(o.holes_mm) && o.holes_mm.length > 0) {
      ctx.fillStyle = `rgb(${o.background},${o.background},${o.background})`;
      for (const h of o.holes_mm) {
        if (!Array.isArray(h) || h.length < 3) continue;
        const h_px = h.map(p => {
          const x = Array.isArray(p) ? +p[0] : +p.x;
          const y = Array.isArray(p) ? +p[1] : +p.y;
          return [(x - xMin) * dpi + pad, (y - yMin) * dpi + pad];
        });
        ctx.beginPath();
        ctx.moveTo(h_px[0][0], h_px[0][1]);
        for (let i = 1; i < h_px.length; i++) ctx.lineTo(h_px[i][0], h_px[i][1]);
        ctx.closePath();
        ctx.fill();
        holes_px_out.push(h_px);
      }
    }

    // Borde
    if (o.stroke_width > 0) {
      ctx.strokeStyle = `rgb(${o.stroke},${o.stroke},${o.stroke})`;
      ctx.lineWidth = o.stroke_width;
      ctx.beginPath();
      ctx.moveTo(pts_px[0][0], pts_px[0][1]);
      for (let i = 1; i < pts_px.length; i++) ctx.lineTo(pts_px[i][0], pts_px[i][1]);
      ctx.closePath();
      ctx.stroke();
    }

    // Convex hull en coords px
    const hull_px = _convexHullRadial(pts_px);

    // DataURL (PNG). OffscreenCanvas no expone toDataURL; usamos <canvas> en ese caso.
    let dataUrl = null;
    if (typeof canvas.toDataURL === 'function') {
      dataUrl = canvas.toDataURL('image/png');
    } else {
      // OffscreenCanvas → mirror a un <canvas> visible en memoria
      const mirror = document.createElement('canvas');
      mirror.width = width_px;
      mirror.height = height_px;
      mirror.getContext('2d').drawImage(canvas, 0, 0);
      dataUrl = mirror.toDataURL('image/png');
    }

    return {
      contour_points_px: pts_px,
      convex_hull_px:    hull_px,
      holes_px:          holes_px_out,
      bbox_px: {
        minX:  pad,
        minY:  pad,
        width:  width_px - 2 * pad,
        height: height_px - 2 * pad,
      },
      image_size:      { width: width_px, height: height_px },
      image_data_url:  dataUrl,
      scale_mm_per_px: 1.0 / dpi,
      dpi:             dpi,
      padding_px:      pad,
      area_mm2_input:      _polygonAreaShoelace(pts_mm),
      perimeter_mm_input:  _polygonPerimeter(pts_mm, true),
    };
  }

  // Exportar al namespace global
  window.obj3dToCanonicalRaster = obj3dToCanonicalRaster;

  // Flag por defecto: deshabilitado hasta validación end-to-end (Fase 2)
  if (typeof window.OBJ3D_USE_CANONICAL_RASTER === 'undefined') {
    window.OBJ3D_USE_CANONICAL_RASTER = false;
  }
})();
