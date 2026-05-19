/**
 * obj3d-morph-canvas.js
 * Overlays geométricos sobre el canvas vectorial del modal de análisis
 * morfológico 3D. Consume `geometry_overlays` (unidades del modelo) del
 * endpoint /api/obj3d/contour-analyze y los proyecta al canvas usando la
 * misma transformación que `_drawContourPreview` (obj3d-viewer.js).
 *
 * Coordenadas de entrada: unidades del modelo 3D (mismo sistema que el
 * contorno canónico XY). La proyección coincide con la del preview:
 *   x = offU + (u - minU) * scale
 *   y = H   - (offV + (v - minV) * scale)
 *
 * API pública (en window.MAO_Obj3dMorphOverlays):
 *   - defaultPalette()  → paleta de colores (paridad con canvas 2D)
 *   - defaultLayers()   → estado por defecto de capas (todas activas)
 *   - LAYER_DEFS        → metadata de capas para construir UI de toggles
 *   - draw(ctx, geom, projection, layerStates)
 */
(function () {
  'use strict';

  // Paleta con paridad cromática respecto al canvas 2D (analysis-core.js).
  const PALETTE = {
    convex_hull:        '#ff8800',  // naranja (canvas 2D L1487)
    centroid:           '#00bcd4',  // cian — centroide CR (Shoelace)
    centroid_hull:      '#e91e63',  // magenta — centroide del hull
    axis_major:         '#e53935',  // rojo
    axis_minor:         '#1e88e5',  // azul
    feret_max:          '#43a047',  // verde
    feret_min:          '#8bc34a',  // verde claro
    radius_max:         '#c62828',  // rojo oscuro
    radius_min:         '#2e7d32',  // verde oscuro
    inscribed_circle:   '#9c27b0',  // morado
    circumscribed_circle: '#f57c00', // naranja oscuro
    bbox_oriented:      '#607d8b',  // gris azulado
    analysis_contour:   '#1976d2',  // azul fuerte — contorno métrico real
  };

  // Metadata de capas para construir UI de toggles ("Capas ▾").
  // El orden define el orden de dibujo: las primeras quedan al fondo.
  const LAYER_DEFS = [
    { id: 'analysis_contour',     label: 'Contorno métrico',    color: PALETTE.analysis_contour },
    { id: 'convex_hull',          label: 'Convex hull',         color: PALETTE.convex_hull },
    { id: 'bbox_oriented',        label: 'BBox orientado',      color: PALETTE.bbox_oriented },
    { id: 'circumscribed_circle', label: 'Círculo circunscrito',color: PALETTE.circumscribed_circle },
    { id: 'inscribed_circle',     label: 'Círculo inscrito',    color: PALETTE.inscribed_circle },
    { id: 'axis_major',           label: 'Eje mayor',           color: PALETTE.axis_major },
    { id: 'axis_minor',           label: 'Eje menor',           color: PALETTE.axis_minor },
    { id: 'feret_max',            label: 'Feret máx.',          color: PALETTE.feret_max },
    { id: 'feret_min',            label: 'Feret mín.',          color: PALETTE.feret_min },
    { id: 'radius_max',           label: 'Radio máx.',          color: PALETTE.radius_max },
    { id: 'radius_min',           label: 'Radio mín.',          color: PALETTE.radius_min },
    { id: 'centroid_hull',        label: 'Centroide hull',      color: PALETTE.centroid_hull },
    { id: 'centroid',             label: 'Centroide CR',        color: PALETTE.centroid },
  ];

  function defaultPalette() { return Object.assign({}, PALETTE); }

  function defaultLayers() {
    const o = {};
    for (const def of LAYER_DEFS) o[def.id] = true;
    return o;
  }

  function _makeProjector(projection) {
    const { scale, offU, offV, minU, minV, H } = projection;
    return function toXY(p) {
      return {
        x: offU + (p[0] - minU) * scale,
        y: H    - (offV + (p[1] - minV) * scale),
      };
    };
  }

  function _drawDot(ctx, x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function _drawSegment(ctx, p1, p2, color, dashed) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    if (dashed) ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  }

  function _drawCircle(ctx, cx, cy, r_px, color, dashed) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    if (dashed) ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, r_px, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function _drawPolygon(ctx, pts_canvas, color, dashed, closed) {
    if (!pts_canvas || pts_canvas.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    if (dashed) ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(pts_canvas[0].x, pts_canvas[0].y);
    for (let i = 1; i < pts_canvas.length; i++) ctx.lineTo(pts_canvas[i].x, pts_canvas[i].y);
    if (closed !== false) ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Dibuja todos los overlays activos sobre el contexto.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} geom  — geometry_overlays del endpoint (unidades modelo)
   * @param {Object} projection — {scale, offU, offV, minU, minV, H}
   * @param {Object} [layerStates] — {layer_id: bool}
   */
  function draw(ctx, geom, projection, layerStates) {
    if (!ctx || !geom || !projection) return;
    if (geom._error) return;
    const layers = layerStates || defaultLayers();
    const toXY   = _makeProjector(projection);
    const scale  = projection.scale;

    // 0. Contorno métrico (lo que realmente se midió: polígono real o hull)
    if (layers.analysis_contour && Array.isArray(geom.analysis_contour) && geom.analysis_contour.length >= 3) {
      _drawPolygon(ctx, geom.analysis_contour.map(toXY), PALETTE.analysis_contour, false, true);
    }

    // 1. Convex hull (al fondo)
    if (layers.convex_hull && Array.isArray(geom.convex_hull) && geom.convex_hull.length >= 3) {
      _drawPolygon(ctx, geom.convex_hull.map(toXY), PALETTE.convex_hull, true, true);
    }

    // 2. BBox orientado
    if (layers.bbox_oriented && Array.isArray(geom.bbox_oriented) && geom.bbox_oriented.length === 4) {
      _drawPolygon(ctx, geom.bbox_oriented.map(toXY), PALETTE.bbox_oriented, true, true);
    }

    // 3. Círculo circunscrito
    if (layers.circumscribed_circle && geom.circumscribed_circle?.center) {
      const c = toXY(geom.circumscribed_circle.center);
      _drawCircle(ctx, c.x, c.y, geom.circumscribed_circle.radius * scale,
                  PALETTE.circumscribed_circle, true);
    }

    // 4. Círculo inscrito
    if (layers.inscribed_circle && geom.inscribed_circle?.center) {
      const c = toXY(geom.inscribed_circle.center);
      _drawCircle(ctx, c.x, c.y, geom.inscribed_circle.radius * scale,
                  PALETTE.inscribed_circle, false);
    }

    // 5. Ejes mayor/menor
    if (layers.axis_major && Array.isArray(geom.axis_major) && geom.axis_major.length === 2) {
      _drawSegment(ctx, toXY(geom.axis_major[0]), toXY(geom.axis_major[1]),
                   PALETTE.axis_major, false);
    }
    if (layers.axis_minor && Array.isArray(geom.axis_minor) && geom.axis_minor.length === 2) {
      _drawSegment(ctx, toXY(geom.axis_minor[0]), toXY(geom.axis_minor[1]),
                   PALETTE.axis_minor, false);
    }

    // 6. Feret max/min (segmentos)
    if (layers.feret_max && Array.isArray(geom.feret_max_segment) && geom.feret_max_segment.length === 2) {
      _drawSegment(ctx, toXY(geom.feret_max_segment[0]), toXY(geom.feret_max_segment[1]),
                   PALETTE.feret_max, false);
    }
    if (layers.feret_min && Array.isArray(geom.feret_min_segment) && geom.feret_min_segment.length === 2) {
      _drawSegment(ctx, toXY(geom.feret_min_segment[0]), toXY(geom.feret_min_segment[1]),
                   PALETTE.feret_min, false);
    }

    // 7. Radios max/min (segmentos desde centroide_hull)
    if (layers.radius_max && Array.isArray(geom.radius_max_segment) && geom.radius_max_segment.length === 2) {
      _drawSegment(ctx, toXY(geom.radius_max_segment[0]), toXY(geom.radius_max_segment[1]),
                   PALETTE.radius_max, true);
    }
    if (layers.radius_min && Array.isArray(geom.radius_min_segment) && geom.radius_min_segment.length === 2) {
      _drawSegment(ctx, toXY(geom.radius_min_segment[0]), toXY(geom.radius_min_segment[1]),
                   PALETTE.radius_min, true);
    }

    // 8. Centroides (encima de todo)
    if (layers.centroid_hull && Array.isArray(geom.centroid_hull) && geom.centroid_hull.length === 2) {
      const p = toXY(geom.centroid_hull);
      _drawDot(ctx, p.x, p.y, 4.5, PALETTE.centroid_hull);
    }
    if (layers.centroid && Array.isArray(geom.centroid) && geom.centroid.length === 2) {
      const p = toXY(geom.centroid);
      _drawDot(ctx, p.x, p.y, 3.2, PALETTE.centroid);
    }
  }

  // ─── Exportar API ───────────────────────────────────────────────────
  window.MAO_Obj3dMorphOverlays = {
    PALETTE: Object.freeze(PALETTE),
    LAYER_DEFS,
    defaultPalette,
    defaultLayers,
    draw,
  };
})();
