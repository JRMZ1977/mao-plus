/**
 * MAO Plus — Export Manager
 * Gestor unificado para exportación de imágenes (PNG/JPEG) y vectoriales (SVG)
 * Proporciona métodos mejorados con:
 * - Resolución configurable para PNG/JPEG
 * - SVG con capas organizadas y metadatos
 * - Compresión inteligente
 * - Batch export
 */

const ExportManager = (() => {

  function _escapeXml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
  
  const config = {
    pngQuality: 1.0,  // 0-1
    jpegQuality: 0.95, // 0-1
    svgPrecision: 2,   // decimales para coordenadas SVG
    dpi: 300,          // para cálculo de resolución
    defaultFormat: 'svg' // 'svg', 'png', 'jpeg'
  };

  /**
   * 📥 Exportar a PNG (rasterizado con alta calidad)
   * @param {Object} obj - Objeto analizado con metricas
   * @param {Object} options - {quality, scale, format}
   */
  async function exportToPNG(obj, options = {}) {
    const opts = { ...config, ...options };
    
    if (!obj || !obj.metricas) {
      console.error('❌ Objeto inválido para exportar');
      return false;
    }

    console.log('🖼️  Iniciando exportación a PNG:', {
      objeto: obj.nombre,
      quality: opts.pngQuality,
      dpi: opts.dpi
    });

    try {
      // Paso 1: Crear canvas con geometría
      const canvas = await _buildGeometryCanvas(obj, opts);
      if (!canvas) throw new Error('No se pudo generar canvas');

      // Paso 2: Convertir a blob e descargar
      const blob = await _canvasToBlob(canvas, 'image/png');
      _downloadFile(blob, `${obj.nombre}_morfologia.png`);

      console.log('✅ PNG exportado exitosamente');
      return true;

    } catch (err) {
      console.error('❌ Error exportando PNG:', err);
      return false;
    }
  }

  /**
   * 📥 Exportar a JPEG (compresión con calidad configurable)
   */
  async function exportToJPEG(obj, options = {}) {
    const opts = { quality: config.jpegQuality, ...options };
    
    try {
      const canvas = await _buildGeometryCanvas(obj, opts);
      if (!canvas) throw new Error('No se pudo generar canvas');

      const blob = await _canvasToBlob(canvas, 'image/jpeg', opts.quality);
      _downloadFile(blob, `${obj.nombre}_morfologia.jpg`);

      console.log('✅ JPEG exportado exitosamente');
      return true;
    } catch (err) {
      console.error('❌ Error exportando JPEG:', err);
      return false;
    }
  }

  /**
   * 📥 Exportar a SVG (vectorial con capas organizadas)
   */
  async function exportToSVG(obj, options = {}) {
    const opts = { precision: config.svgPrecision, ...options };

    if (!obj || !obj.metricas) {
      console.error('❌ Objeto inválido para exportar SVG');
      return false;
    }

    try {
      const svgContent = _buildSVGContent(obj, opts);
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      _downloadFile(blob, `${obj.nombre}_morfologia.svg`);

      console.log('✅ SVG exportado exitosamente');
      return true;
    } catch (err) {
      console.error('❌ Error exportando SVG:', err);
      return false;
    }
  }

  /**
   * 📥 Exportar en múltiples formatos simultáneamente
   */
  async function exportAll(obj, formats = ['svg', 'png']) {
    const results = {};
    
    for (const fmt of formats) {
      if (fmt === 'svg') {
        results.svg = await exportToSVG(obj);
      } else if (fmt === 'png') {
        results.png = await exportToPNG(obj);
      } else if (fmt === 'jpeg') {
        results.jpeg = await exportToJPEG(obj);
      }
    }

    console.log('📦 Exportación múltiple completada:', results);
    return results;
  }

  /**
   * 🎨 Construir canvas con geometría del objeto
   * @private
   */
  async function _buildGeometryCanvas(obj, opts = {}) {
    const m = obj.metricas || {};
    const width = obj.width || 800;
    const height = obj.height || 600;

    // Crear canvas con escala para alta resolución
    const scale = (opts.dpi || 300) / 72; // 72 DPI default screen
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('No se pudo obtener contexto 2D');

    // Fondo blanco
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.scale(scale, scale);

    // Dibujar elementos geométricos
    const minX = obj.minX || 0;
    const minY = obj.minY || 0;

    // 1. Contorno real (verde)
    if (m._contour_data?.points && m._contour_data.points.length > 0) {
      _drawPolygon(ctx, m._contour_data.points, minX, minY, '#00cc00', 2);
    }

    // 2. Convex Hull (naranja)
    if (obj.convexHull && obj.convexHull.length > 0) {
      _drawPolygon(ctx, obj.convexHull, minX, minY, '#ff9900', 1.5);
    }

    // 3. Bounding Box (gris)
    if (obj.width && obj.height) {
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 1;
      ctx.strokeRect(0 - minX, 0 - minY, obj.width, obj.height);
    }

    // 4. Centroides y ejes
    _drawCentroids(ctx, m, minX, minY);
    _drawAxes(ctx, m, minX, minY);

    // 5. Perforaciones y horadaciones
    if (obj.perforaciones && obj.perforaciones.length > 0) {
      obj.perforaciones.forEach(p => {
        _drawPolygon(ctx, p.puntos || [], minX, minY, '#0066cc', 2);
      });
    }

    if (obj.horadaciones && obj.horadaciones.length > 0) {
      obj.horadaciones.forEach(h => {
        _drawPolygon(ctx, h.puntos || [], minX, minY, '#28a745', 2);
      });
    }

    return canvas;
  }

  /**
   * 🖌️ Dibujar polígono
   * @private
   */
  function _drawPolygon(ctx, puntos, minX, minY, color, lineWidth) {
    if (!puntos || puntos.length === 0) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();

    const p0 = puntos[0];
    const x0 = (typeof p0 === 'object' ? p0.x : p0[0]) - minX;
    const y0 = (typeof p0 === 'object' ? p0.y : p0[1]) - minY;
    ctx.moveTo(x0, y0);

    for (let i = 1; i < puntos.length; i++) {
      const p = puntos[i];
      const x = (typeof p === 'object' ? p.x : p[0]) - minX;
      const y = (typeof p === 'object' ? p.y : p[1]) - minY;
      ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.stroke();
  }

  /**
   * 🎯 Dibujar centroides
   * @private
   */
  function _drawCentroids(ctx, m, minX, minY) {
    // Centroide del hull
    if (m._contour_data?.metrics?.centroid_hull) {
      const c = m._contour_data.metrics.centroid_hull;
      const [x, y] = Array.isArray(c) ? c : [c.x, c.y];
      _drawPoint(ctx, x - minX, y - minY, '#ff6600', 5);
    }

    // Centroide real
    if (m._contour_data?.metrics?.centroid_real) {
      const c = m._contour_data.metrics.centroid_real;
      const [x, y] = Array.isArray(c) ? c : [c.x, c.y];
      _drawPoint(ctx, x - minX, y - minY, '#ffff00', 3);
    }
  }

  /**
   * 📏 Dibujar ejes principales
   * @private
   */
  function _drawAxes(ctx, m, minX, minY) {
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);

    // Eje mayor (rojo)
    if (m.eje_mayor_p1_recortado && m.eje_mayor_p2_recortado) {
      const [x1, y1] = m.eje_mayor_p1_recortado;
      const [x2, y2] = m.eje_mayor_p2_recortado;
      ctx.strokeStyle = '#ff0000';
      ctx.beginPath();
      ctx.moveTo(x1 - minX, y1 - minY);
      ctx.lineTo(x2 - minX, y2 - minY);
      ctx.stroke();
    }

    // Eje menor (verde)
    if (m.eje_menor_p1_recortado && m.eje_menor_p2_recortado) {
      const [x1, y1] = m.eje_menor_p1_recortado;
      const [x2, y2] = m.eje_menor_p2_recortado;
      ctx.strokeStyle = '#00ff00';
      ctx.beginPath();
      ctx.moveTo(x1 - minX, y1 - minY);
      ctx.lineTo(x2 - minX, y2 - minY);
      ctx.stroke();
    }

    ctx.setLineDash([]);
  }

  /**
   * 🔵 Dibujar punto
   * @private
   */
  function _drawPoint(ctx, x, y, color, radius) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  /**
   * 🖼️  Canvas a blob
   * @private
   */
  function _canvasToBlob(canvas, mimeType = 'image/png', quality = 1) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(resolve, mimeType, quality);
    });
  }

  /**
   * 📋 Construir contenido SVG
   * @private
   */
  function _buildSVGContent(obj, opts = {}) {
    const m = obj.metricas || {};
    const width = obj.width || 800;
    const height = obj.height || 600;
    const minX = obj.minX || 0;
    const minY = obj.minY || 0;

    // Factor de escala
    const factor = obj.escala || 1;
    const widthMM = (width * factor).toFixed(2);
    const heightMM = (height * factor).toFixed(2);

    let svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n`;
    svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMM}mm" height="${heightMM}mm" `;
    svg += `viewBox="0 0 ${width} ${height}">\n`;
    svg += `<defs>\n`;
    svg += `  <style>\n`;
    svg += `    .contorno { stroke: #00cc00; stroke-width: 2; fill: none; }\n`;
    svg += `    .hull { stroke: #ff9900; stroke-width: 1.5; fill: none; }\n`;
    svg += `    .eje { stroke-width: 2.5; fill: none; stroke-dasharray: 10,5; }\n`;
    svg += `    .centroide { fill: #ffff00; stroke: #000; stroke-width: 0.5; }\n`;
    svg += `  </style>\n`;
    svg += `</defs>\n`;

    // Metadatos
    svg += `<metadata>\n`;
    svg += `  <objeto_aprox>\n`;
    svg += `    <nombre>${_escapeXml(obj.nombre || 'Objeto')}</nombre>\n`;
    svg += `    <tipo>${_escapeXml(obj.tipo || 'monofacial')}</tipo>\n`;
    svg += `    <cara>${_escapeXml(obj.cara || '-')}</cara>\n`;
    svg += `    <fecha>${new Date().toISOString()}</fecha>\n`;
    svg += `    <escala factor="${factor}">${factor} mm/px</escala>\n`;
    svg += `    <dimensiones ancho="${width}px" alto="${height}px" ancho_real="${widthMM}mm" alto_real="${heightMM}mm" />\n`;
    svg += `  </objeto_aprox>\n`;
    svg += `</metadata>\n`;

    // Grupo de geometría
    svg += `<g id="geometria">\n`;

    // Contorno real
    if (m._contour_data?.points && m._contour_data.points.length > 0) {
      const pathData = _pointsToPath(m._contour_data.points, minX, minY, true, opts.precision);
      svg += `  <path class="contorno" d="${pathData}" id="contorno"/>\n`;
    }

    // Convex Hull
    if (obj.convexHull && obj.convexHull.length > 0) {
      const pathData = _pointsToPath(obj.convexHull, minX, minY, true, opts.precision);
      svg += `  <path class="hull" d="${pathData}" id="hull"/>\n`;
    }

    // Ejes
    if (m.eje_mayor_p1_recortado && m.eje_mayor_p2_recortado) {
      const [x1, y1] = m.eje_mayor_p1_recortado;
      const [x2, y2] = m.eje_mayor_p2_recortado;
      svg += `  <line class="eje" style="stroke: #ff0000;" x1="${(x1-minX).toFixed(opts.precision)}" y1="${(y1-minY).toFixed(opts.precision)}" `;
      svg += `x2="${(x2-minX).toFixed(opts.precision)}" y2="${(y2-minY).toFixed(opts.precision)}" id="eje_mayor"/>\n`;
    }

    if (m.eje_menor_p1_recortado && m.eje_menor_p2_recortado) {
      const [x1, y1] = m.eje_menor_p1_recortado;
      const [x2, y2] = m.eje_menor_p2_recortado;
      svg += `  <line class="eje" style="stroke: #00ff00;" x1="${(x1-minX).toFixed(opts.precision)}" y1="${(y1-minY).toFixed(opts.precision)}" `;
      svg += `x2="${(x2-minX).toFixed(opts.precision)}" y2="${(y2-minY).toFixed(opts.precision)}" id="eje_menor"/>\n`;
    }

    svg += `</g>\n`;
    svg += `</svg>`;

    return svg;
  }

  /**
   * 📍 Convertir puntos a path SVG
   * @private
   */
  function _pointsToPath(puntos, minX, minY, closed = true, precision = 2) {
    if (!puntos || puntos.length === 0) return '';

    const p0 = puntos[0];
    const x0 = (typeof p0 === 'object' ? p0.x : p0[0]) - minX;
    const y0 = (typeof p0 === 'object' ? p0.y : p0[1]) - minY;
    let path = `M ${x0.toFixed(precision)} ${y0.toFixed(precision)}`;

    for (let i = 1; i < puntos.length; i++) {
      const p = puntos[i];
      const x = (typeof p === 'object' ? p.x : p[0]) - minX;
      const y = (typeof p === 'object' ? p.y : p[1]) - minY;
      path += ` L ${x.toFixed(precision)} ${y.toFixed(precision)}`;
    }

    if (closed) path += ' Z';
    return path;
  }

  /**
   * 💾 Descargar archivo
   * @private
   */
  function _downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Exposición pública
  return {
    exportToPNG,
    exportToJPEG,
    exportToSVG,
    exportAll,
    setConfig: (newConfig) => Object.assign(config, newConfig),
    getConfig: () => ({ ...config })
  };

})();

// Exponer globalmente
window.ExportManager = ExportManager;
console.log('✅ ExportManager inicializado');
