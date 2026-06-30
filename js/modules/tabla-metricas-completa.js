/**
 * TABLA DE MÉTRICAS COMPLETA MODULE - tabla-metricas-completa.js
 * ==========================================================================
 *
 * Extracted from analysis-core.js (lines 19667-22399, ~2,719 lines)
 * Module handles complete metrics table generation with all morphological sections
 *
 * PUBLIC FUNCTIONS:
 * - generarTablaMetricasCompleta(obj, metricas)
 * - contarMetricas(metricas, obj)
 *
 * SECTION GENERATORS (26 functions):
 * - generarSeccionDimensiones
 * - generarSeccionFragmentacion
 * - generarSeccionIndicesForma
 * - generarSeccionMetricasMorfologicas
 * - generarSeccionOrientacion
 * - generarSeccionSimetria
 * - generarSeccionPerforaciones
 * - generarSeccionHoradaciones
 * - generarSeccionComparacionBifacial
 * - generarSeccionEstadoConservacion
 * - generarSeccionErrorOptico
 * - generarSeccionEjesOrientacion
 * - generarSeccionAnalisisRadial
 * - generarSeccionPropiedadesContorno
 * - generarSeccionCurvatura
 * - generarSeccionConvexHull
 * - generarSeccionMetricasAvanzadas
 * - generarSeccionClasificacionesIndividuales
 * - generarSeccionVerticesAngulos
 * - generarSeccionForma3D
 * - generarSeccionCentroide
 * - generarSeccionClasificacion
 * - generarSeccionPatronAgrupamiento
 * - generarSeccionSintesisFinal
 * - generarSeccionClasificaciones
 * - generarSeccionMetricasComplementarias
 *
 * ==========================================================================
 */

/**
 * Confianza global de la clasificación, normalizada a un porcentaje 0–100.
 *
 * Canónicamente `forma_confianza_global` ya es un string porcentaje (0–100) y
 * `forma_confianza` es una fracción (0–1). Pero algunas rutas (objeto cacheado
 * / reimportado) dejan `forma_confianza_global` ausente y `forma_confianza` en
 * escala 0–100; el patrón previo `forma_confianza_global || (forma_confianza*100)`
 * entonces multiplicaba ×100 un valor que ya era porcentaje → "6560%".
 * Aquí preferimos el campo canónico, escalamos la fracción solo si es ≤1, y
 * clampamos a [0,100] para que el display nunca supere 100%.
 *
 * @param {Object} metricas
 * @returns {string} porcentaje con un decimal, p.ej. "65.6"
 */
function confianzaGlobalPorcentaje(metricas) {
  let pct = parseFloat(metricas.forma_confianza_global);
  if (!Number.isFinite(pct)) {
    const c = parseFloat(metricas.forma_confianza) || 0;
    pct = c <= 1 ? c * 100 : c;  // 0–1 → %, o ya viene en %
  }
  return Math.max(0, Math.min(100, pct)).toFixed(1);
}

// ============================================================================
// COMPOSITE FUNCTION: TABLA DE MÉTRICAS COMPLETA
// ============================================================================

/**
 * Genera el HTML de la tabla de métricas completa con todas las secciones
 * Orquesta todas las secciones generadoras en una visualización coherente
 *
 * @param {Object} obj - Objeto analizado
 * @param {Object} metricas - Métricas calculadas
 * @returns {string} - HTML de la tabla completa
 */
export function generarTablaMetricasCompleta(obj, metricas) {
  // Estilos para la tabla HTML
  const estiloTabla = `
    width: 100%;
    border-collapse: collapse;
    margin: 20px 0;
    font-family: 'Arial', sans-serif;
    font-size: 14px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  `;

  const estiloTh = `
    background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
    color: white;
    padding: 12px;
    text-align: left;
    font-weight: 700;
    border: 1px solid #2c3e50;
  `;

  const estiloTd = `
    padding: 10px 12px;
    border: 1px solid #ddd;
    text-align: left;
  `;

  // Encabezado de la tabla
  let html = `
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; margin-bottom: 0;">
      <h2 style="margin: 0; font-size: 24px; font-weight: 700;">ANÁLISIS COMPLETO DE MÉTRICAS MORFOLÓGICAS</h2>
      <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 13px;">Tabla integral de todas las métricas de ${obj.id || `OBJ_${obj.numeroObjeto || '??'}`}</p>
    </div>
  `;

  // SECCIÓN I: IDENTIFICACIÓN Y CLASIFICACIÓN
  html += `
    <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #667eea;">
      I. IDENTIFICACIÓN Y CLASIFICACIÓN
    </h3>
    <table style="${estiloTabla}">
      <thead>
        <tr>
          <th style="${estiloTh}; width: 40%;">Propiedad</th>
          <th style="${estiloTh}; width: 60%;">Valor</th>
        </tr>
      </thead>
      <tbody>
        <tr style="background: #f8f9fa;">
          <td style="${estiloTd}; font-weight: 600;">ID Objeto</td>
          <td style="${estiloTd};">${obj.id || 'N/A'}</td>
        </tr>
        <tr>
          <td style="${estiloTd}; font-weight: 600;">Número de Objeto</td>
          <td style="${estiloTd};">${obj.numeroObjeto || 'N/A'}</td>
        </tr>
        <tr style="background: #f8f9fa;">
          <td style="${estiloTd}; font-weight: 600;">Cara (Bifacial)</td>
          <td style="${estiloTd};">${obj.cara || 'Monofacial'}</td>
        </tr>
        <tr>
          <td style="${estiloTd}; font-weight: 600;">Fotografía</td>
          <td style="${estiloTd}; font-size: 12px;">${obj.imagen || 'N/A'}</td>
        </tr>
        <tr style="background: #f8f9fa;">
          <td style="${estiloTd}; font-weight: 600;">Clasificación Detectada</td>
          <td style="${estiloTd}; font-weight: 600; color: #667eea;">${metricas.forma_detectada || 'No clasificada'}</td>
        </tr>
        <tr>
          <td style="${estiloTd}; font-weight: 600;">Confianza Global</td>
          <td style="${estiloTd}; font-weight: 600; color: #28a745;">${confianzaGlobalPorcentaje(metricas)}%</td>
        </tr>
      </tbody>
    </table>
  `;

  // Llamar a todas las secciones generadoras
  html += generarSeccionDimensiones(obj, metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionFragmentacion(metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionIndicesForma(metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionMetricasMorfologicas(metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionOrientacion(metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionSimetria(metricas, estiloTabla, estiloTh, estiloTd);

  // P/H: SIEMPRE presentes (coherencia con el panel — esqueleto estable).
  // Las funciones internas ya rinden "no detectadas" cuando el objeto no tiene
  // P/H, así que la categoría no depende de haber confirmado P/H (acción 2ª).
  html += generarSeccionPerforaciones(obj, metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionHoradaciones(obj, metricas, estiloTabla, estiloTh, estiloTd);

  // Sección bifacial si aplica
  if (obj.cara && (obj.cara === 'A' || obj.cara === 'B')) {
    html += generarSeccionComparacionBifacial(obj, metricas, estiloTabla, estiloTh, estiloTd);
  }

  html += generarSeccionEstadoConservacion(metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionErrorOptico(metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionIncertidumbrePropagada(metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionEjesOrientacion(metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionAnalisisRadial(metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionPropiedadesContorno(metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionCurvatura(metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionConvexHull(metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionMetricasAvanzadas(metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionClasificacionesIndividuales(metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionVerticesAngulos(metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionForma3D(metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionCentroide(metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionClasificacion(metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionPatronAgrupamiento(metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionSintesisFinal(metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionClasificaciones(metricas, estiloTabla, estiloTh, estiloTd);
  html += generarSeccionMetricasComplementarias(obj, metricas, estiloTabla, estiloTh, estiloTd);

  // Pie de página
  html += `
    <div style="background: #f8f9fa; padding: 15px; margin-top: 20px; border-top: 2px solid #ddd; font-size: 12px; color: #6c757d; border-radius: 0 0 8px 8px;">
      <strong>Total de Métricas:</strong> ${contarMetricas(metricas, obj)} métricas registradas<br>
      <strong>Generado:</strong> ${new Date().toLocaleString('es-ES')}<br>
      <strong>Sistema:</strong> MAO+ Morphometric Analysis Optimizer v3.0
    </div>
  `;

  return html;
}

// ============================================================================
// HELPER FUNCTION: Contar Métricas
// ============================================================================

export function contarMetricas(metricas, obj) {
  let count = 0;
  // Contar todas las propiedades de métricas (aproximación)
  count += Object.keys(metricas).length;
  // Agregar perforaciones y horadaciones
  if (obj.perforaciones) count += obj.perforaciones.length * 5; // 5 métricas por perforación
  if (obj.horadaciones) count += obj.horadaciones.length * 5; // 5 métricas por horadación
  return count;
}
function generarSeccionDimensiones(obj, metricas, estiloTabla, estiloTh, estiloTd) {
    // Área y perímetro del convex hull (forma canónica completa — estándar MAO)
    const area = parseFloat(metricas.hull_area || metricas.area) || 0;
    const perimetro = parseFloat(metricas.perimeter_hull || metricas.perimeter) || 0;
    // Dimensiones primarias: Feret caliper (invariante a orientación — estándar MAO)
    const feretMax = parseFloat(metricas.feret_max) || 0;
    const feretMin = parseFloat(metricas.feret_min) || 0;
    // Ejes de inercia (tensor de área — complementarios a Feret)
    const ejeMayor = parseFloat(metricas.eje_mayor) || 0;
    const ejeMenor = parseFloat(metricas.eje_menor) || 0;
    // BB del hull convexo (referencia geométrica orientada)
    const anchoBB = parseFloat(metricas.width) || 0;
    const altoBB  = parseFloat(metricas.height) || 0;
    const puntosContorno = metricas.contour_points || obj.contour_points?.length || 0;

    return `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #28a745;">
        II. DIMENSIONES MÉTRICAS DEL OBJETO
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Métrica</th>
            <th style="${estiloTh}; width: 30%;">Valor</th>
            <th style="${estiloTh}; width: 30%;">Unidad / Descripción</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Área</td>
            <td style="${estiloTd}; font-weight: 700; color: #28a745; font-size: 15px;">${area.toFixed(2)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">mm² — área convex hull (forma canónica completa)</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Perímetro</td>
            <td style="${estiloTd}; font-weight: 700; font-size: 15px;">${perimetro.toFixed(2)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">mm — perímetro convex hull</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Longitud máxima (Feret↑)</td>
            <td style="${estiloTd}; font-weight: 700; color: #0066cc; font-size: 15px;">${feretMax.toFixed(2)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">mm — diámetro caliper máximo (invariante a orientación)</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Anchura máxima (Feret↓)</td>
            <td style="${estiloTd}; font-weight: 700; color: #0066cc; font-size: 15px;">${feretMin.toFixed(2)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">mm — diámetro caliper mínimo (invariante a orientación)</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Eje Mayor (tensor inercia)</td>
            <td style="${estiloTd}; font-weight: 600;">${ejeMayor.toFixed(2)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">mm — proyección sobre eje principal</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Eje Menor (tensor inercia)</td>
            <td style="${estiloTd}; font-weight: 600;">${ejeMenor.toFixed(2)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">mm — proyección sobre eje secundario</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600; color: #888;">Ancho BB (hull)</td>
            <td style="${estiloTd}; color: #888;">${anchoBB.toFixed(2)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #aaa;">mm — bounding box convex hull (depende orientación)</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600; color: #888;">Alto BB (hull)</td>
            <td style="${estiloTd}; color: #888;">${altoBB.toFixed(2)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #aaa;">mm — bounding box convex hull (depende orientación)</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Puntos del Contorno</td>
            <td style="${estiloTd}; font-weight: 600; color: #0066cc;">${puntosContorno}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">puntos</td>
          </tr>
        </tbody>
      </table>
    `;
}

  /**
   * 3. FRAGMENTACIÓN
   */
function generarSeccionFragmentacion(metricas, estiloTabla, estiloTh, estiloTd) {
    const areaFragmentada = parseFloat(metricas.area_fragmentada) || 0;
    const perimetroFragmentado = parseFloat(metricas.perimeter_fragmentado) || 0;
    const perdidaArea = parseFloat(metricas.perdida_area_fragmentacion_percent) || 0;
    const perdidaPerimetro = parseFloat(metricas.perdida_perimetro_fragmentacion_percent) || 0;
    const completitud = parseFloat(metricas.completitud_estimada) || 100;
    const tipoFragmento = metricas.tipo_fragmento || 'Completo';
    const coberturaAngular = parseFloat(metricas.cobertura_angular) || 360;
    
    return `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #dc3545;">
        VIII. ESTADO DE CONSERVACIÓN Y FRAGMENTACIÓN
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Métrica</th>
            <th style="${estiloTh}; width: 30%;">Valor</th>
            <th style="${estiloTh}; width: 30%;">Unidad / Descripción</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Área Fragmentada</td>
            <td style="${estiloTd}; font-weight: 600;">${areaFragmentada.toFixed(2)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">mm²</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Perímetro Fragmentado</td>
            <td style="${estiloTd}; font-weight: 600;">${perimetroFragmentado.toFixed(2)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">mm</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Pérdida Área (%)</td>
            <td style="${estiloTd}; font-weight: 700; color: ${perdidaArea > 20 ? '#dc3545' : perdidaArea > 10 ? '#ffc107' : '#28a745'};">${perdidaArea.toFixed(2)}%</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Porcentaje de área perdida</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Pérdida Perímetro (%)</td>
            <td style="${estiloTd}; font-weight: 700; color: ${perdidaPerimetro > 20 ? '#dc3545' : perdidaPerimetro > 10 ? '#ffc107' : '#28a745'};">${perdidaPerimetro.toFixed(2)}%</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Porcentaje de perímetro afectado</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Completitud Estimada</td>
            <td style="${estiloTd}; font-weight: 700; color: ${completitud >= 90 ? '#28a745' : completitud >= 70 ? '#ffc107' : '#dc3545'}; font-size: 15px;">${completitud.toFixed(1)}%</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Estimación de integridad</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Tipo de Fragmento</td>
            <td style="${estiloTd}; font-weight: 700; color: #0066cc;">${tipoFragmento}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Categoría de fragmentación</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Cobertura Angular</td>
            <td style="${estiloTd}; font-weight: 600;">${coberturaAngular.toFixed(1)}°</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Ángulo cubierto del objeto</td>
          </tr>
        </tbody>
      </table>
    `;
}

  /**
   * 4. ÍNDICES DE FORMA
   */
function generarSeccionIndicesForma(metricas, estiloTabla, estiloTh, estiloTd) {
    const circularidad = parseFloat(metricas.circularity) || 0;
    const compacidad = parseFloat(metricas.compactness) || 0;
    const solidez = parseFloat(metricas.solidity) || 0;
    const clasificacionSolidez = metricas.solidity_class || 'N/A';
    const rectangularidad = parseFloat(metricas.rectangularity) || 0;
    const elongacion = parseFloat(metricas.elongation) || 0;
    const factorForma = parseFloat(metricas.shape_factor_fragmentado || metricas.shape_factor) || 0;
    const relacionAspecto = parseFloat(metricas.aspect_ratio_tight || metricas.aspect_ratio_original) || 0;
    const excentricidad = parseFloat(metricas.excentricidad) || 0;
    
    return `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #fd7e14;">
        III. PROPORCIONES Y FORMA GLOBAL
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Métrica</th>
            <th style="${estiloTh}; width: 30%;">Valor</th>
            <th style="${estiloTh}; width: 30%;">Interpretación</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Circularidad</td>
            <td style="${estiloTd}; font-weight: 700; font-size: 15px;">${circularidad.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">${metricas.shape_class_circularity || '1.0 = círculo perfecto'}</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Compacidad</td>
            <td style="${estiloTd}; font-weight: 700; font-size: 15px;">${compacidad.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">${metricas.shape_class_compactness || 'Relación área/perímetro²'}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Solidez</td>
            <td style="${estiloTd}; font-weight: 700; font-size: 15px;">${solidez.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Área/Convex Hull</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Clasificación de Solidez</td>
            <td style="${estiloTd}; font-weight: 700; color: #0066cc;">${clasificacionSolidez}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Estado de conservación</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Rectangularidad</td>
            <td style="${estiloTd}; font-weight: 600;">${rectangularidad.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Similitud con rectángulo</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Elongación</td>
            <td style="${estiloTd}; font-weight: 600;">${elongacion.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Grado de alargamiento</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Factor de Forma</td>
            <td style="${estiloTd}; font-weight: 600;">${factorForma.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">1.0 = círculo perfecto</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Relación de Aspecto</td>
            <td style="${estiloTd}; font-weight: 600;">${relacionAspecto.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Ratio largo/ancho</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Excentricidad</td>
            <td style="${estiloTd}; font-weight: 600;">${excentricidad.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Desviación de círculo (0-1)</td>
          </tr>
        </tbody>
      </table>
    `;
}

  // LAS FUNCIONES RESTANTES CONTINÚAN DESPUÉS...
  
function generarSeccionMetricasMorfologicas(metricas, estiloTabla, estiloTh, estiloTd) {
    // Convertir a número para evitar errores de toFixed()
    const circularidad = parseFloat(metricas.circularity) || 0;
    const convexidad = parseFloat(metricas.convexity || metricas.convexidad) || 0;
    const compacidad = parseFloat(metricas.compactness) || 0;
    const solidez = parseFloat(metricas.solidity) || 0;
    const elongacion = parseFloat(metricas.elongation) || 0;
    const excentricidad = parseFloat(metricas.eccentricity) || 0;
    const rectangularidad = parseFloat(metricas.rectangularity) || 0;
    const aspectRatio = parseFloat(metricas.aspect_ratio) || 0;
    const radioMaximo = parseFloat(metricas.radio_maximo || metricas.max_radius) || 0;
    const radioMinimo = parseFloat(metricas.radio_minimo || metricas.min_radius) || 0;
    const ratioRadios = parseFloat(metricas.ratio_radios) || 0;
    const regularidadRadial = parseFloat(metricas.regularidad_radial) || 0;
    
    return `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #fd7e14;">
        3. MÉTRICAS MORFOLÓGICAS PRINCIPALES
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Métrica</th>
            <th style="${estiloTh}; width: 30%;">Valor</th>
            <th style="${estiloTh}; width: 30%;">Interpretación</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Circularidad</td>
            <td style="${estiloTd}; font-weight: 600;">${circularidad.toFixed(3)} → ${metricas.shape_class_circularity || 'N/A'}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Cercanía a un círculo perfecto (1.0)</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Convexidad</td>
            <td style="${estiloTd}; font-weight: 600;">${convexidad.toFixed(3)} → ${metricas._clasificaciones_individuales?.convexidad || 'N/A'}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Irregularidad del contorno</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Compacidad</td>
            <td style="${estiloTd}">${compacidad.toFixed(3)} → ${metricas.shape_class_compactness || 'N/A'}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Relación área/perímetro</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Solidez</td>
            <td style="${estiloTd}">${solidez.toFixed(3)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Proporción del área en el hull convexo</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Elongación</td>
            <td style="${estiloTd}">${elongacion.toFixed(3)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Grado de alargamiento</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Excentricidad</td>
            <td style="${estiloTd}">${excentricidad.toFixed(3)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Desviación de la circularidad</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Rectangularidad</td>
            <td style="${estiloTd}">${rectangularidad.toFixed(3)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Cercanía a un rectángulo</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Relación de aspecto (AR)</td>
            <td style="${estiloTd}">${aspectRatio.toFixed(3)} → ${metricas.shape_class_aspect || 'N/A'}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Relación eje mayor/eje menor</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Radio Máximo</td>
            <td style="${estiloTd}">${radioMaximo.toFixed(2)} mm</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Distancia máxima desde el centroide</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Radio Mínimo</td>
            <td style="${estiloTd}">${radioMinimo.toFixed(2)} mm</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Distancia mínima desde el centroide</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Ratio de Radios</td>
            <td style="${estiloTd}">${ratioRadios.toFixed(3)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Relación radio mínimo/máximo</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Regularidad Radial</td>
            <td style="${estiloTd}">${regularidadRadial.toFixed(3)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Uniformidad de los radios</td>
          </tr>
        </tbody>
      </table>
    `;
}

function generarSeccionOrientacion(metricas, estiloTabla, estiloTh, estiloTd) {
    // Convertir a número para evitar errores de toFixed()
    const anguloEje = parseFloat(metricas.eje_principal_angulo) || 0;
    const anisotropia = parseFloat(metricas.eje_principal_anisotropia) || 0;
    
    return `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #6610f2;">
        4. ORIENTACIÓN Y EJES PRINCIPALES
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Métrica</th>
            <th style="${estiloTh}; width: 30%;">Valor</th>
            <th style="${estiloTh}; width: 30%;">Descripción</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Ángulo del Eje Principal</td>
            <td style="${estiloTd}; font-weight: 600; color: #dc3545;">${anguloEje.toFixed(1)}°</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Orientación del eje mayor</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Orientación</td>
            <td style="${estiloTd}">${metricas.eje_principal_orientacion || 'N/A'}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Clasificación direccional</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Anisotropía</td>
            <td style="${estiloTd}">${anisotropia.toFixed(3)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Grado de asimetría direccional</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Forma Dominante</td>
            <td style="${estiloTd}">${metricas.eje_principal_forma_dominante || 'N/A'}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Característica morfológica principal</td>
          </tr>
        </tbody>
      </table>
    `;
}

function generarSeccionPerforaciones(obj, metricas, estiloTabla, estiloTh, estiloTd) {
    if (!obj.perforaciones || obj.perforaciones.length === 0) {
        return `
            <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #0066cc;">
              20. PERFORACIONES (Orificios Pasantes)
            </h3>
            <div style="padding: 20px; background: #f0f2f5; border-left: 4px solid #0066cc; border-radius: 4px; text-align: center;">
              <strong>No se detectaron perforaciones en este objeto</strong>
            </div>
          `;
    }
    
    let html = `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #0066cc;">
        20. PERFORACIONES (Orificios Pasantes) - ${obj.perforaciones.length} detectada(s)
      </h3>
    `;
    
    // Generar tabla detallada para cada perforación
    obj.perforaciones.forEach((perf, idx) => {
      const m = perf.metricas || {};
      const perfId = perf.id || (idx + 1);
      
      // Extraer métricas
      const area = parseFloat(m.area || perf.area) || 0;
      const perimetro = parseFloat(m.perimeter || perf.perimetro) || 0;
      const ancho = parseFloat(m.width || m.ancho) || 0;
      const alto = parseFloat(m.height || m.alto) || 0;
      const centroideX = parseFloat(m.centroide_x || m.centroid?.[0]) || 0;
      const centroideY = parseFloat(m.centroide_y || m.centroid?.[1]) || 0;
      const radioMax = parseFloat(m.radio_maximo) || 0;
      const radioMin = parseFloat(m.radio_minimo) || 0;
      const radioMedio = parseFloat(m.radio_medio) || 0;
      const ratioRadios = parseFloat(m.ratio_radios) || 0;
      const regularidad = parseFloat(m.regularidad_radial) || 0;
      const ejeMayor = parseFloat(m.eje_mayor) || 0;
      const ejeMenor = parseFloat(m.eje_menor) || 0;
      const excentricidad = parseFloat(m.excentricidad) || 0;
      const circularidad = parseFloat(m.circularity || m.circularidad) || 0;
      const compacidad = parseFloat(m.compactness || m.compacidad) || 0;
      const solidez = parseFloat(m.solidity || m.solidez) || 0;
      const convexidad = parseFloat(m.convexity || m.convexidad) || 0;
      const aspectRatio = parseFloat(m.aspect_ratio) || 0;
      const distanciaCentro = parseFloat(perf.distanciaAlCentro) || 0;
      const desviacionRadialP = parseFloat(m.desviacion_radial) || 0;
      const coefVarRadialP = parseFloat(m.coeficiente_variacion_radial) || 0;
      const verticesAproxP = parseInt(m.vertices_aproximados) || 0;
      const formaDetP = m.forma_detectada || null;
      const confFormaP = parseFloat(m.forma_confianza) || 0;
      const shapeFactorP    = parseFloat(m.shape_factor)    || 0;
      const rectangularityP = parseFloat(m.rectangularity)  || 0;
      const elongationP     = parseFloat(m.elongation)      || 0;
      const feretMaxP       = parseFloat(m.feret_max)       || 0;
      const feretMinP       = parseFloat(m.feret_min)       || 0;
      const feretRatioP     = parseFloat(m.feret_ratio)     || 0;
      const feretAngMaxP    = parseFloat(m.feret_angulo_max)|| 0;
      const feretAngMinP    = parseFloat(m.feret_angulo_min)|| 0;
      
      html += `
        <h4 style="color: #0066cc; margin: 20px 0 10px 0; padding: 8px; background: #f0f2f5; border-left: 4px solid #0066cc;">
          Perforación P${perfId}
        </h4>
        <table style="${estiloTabla}">
          <thead>
            <tr>
              <th style="${estiloTh}; width: 40%;">Métrica</th>
              <th style="${estiloTh}; width: 30%;">Valor</th>
              <th style="${estiloTh}; width: 30%;">Unidad / Descripción</th>
            </tr>
          </thead>
          <tbody>
            <!-- DIMENSIONES BÁSICAS -->
            <tr style="background: #f0f2f5;">
              <td style="${estiloTd}; font-weight: 600;">Área${window.escalaCorregida?.activa ? '<span style="color: #28a745; font-size: 9px;">()</span>': ''}</td>
              <td style="${estiloTd}; font-weight: 600; color: #0066cc;">${area.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm²</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}; font-weight: 600;">Perímetro${window.escalaCorregida?.activa ? '<span style="color: #28a745; font-size: 9px;">()</span>': ''}</td>
              <td style="${estiloTd}; font-weight: 600;">${perimetro.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm</td>
            </tr>
            <tr>
              <td style="${estiloTd}">Ancho${window.escalaCorregida?.activa ? '<span style="color: #28a745; font-size: 9px;">()</span>': ''}</td>
              <td style="${estiloTd}">${ancho.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}">Alto${window.escalaCorregida?.activa ? '<span style="color: #28a745; font-size: 9px;">()</span>': ''}</td>
              <td style="${estiloTd}">${alto.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm</td>
            </tr>
            <tr>
              <td style="${estiloTd}">Dimensiones (W×H)${window.escalaCorregida?.activa ? '<span style="color: #28a745; font-size: 9px;">()</span>': ''}</td>
              <td style="${estiloTd}" colspan="2">${ancho.toFixed(2)} × ${alto.toFixed(2)} mm</td>
            </tr>
            
            <!-- CENTROIDE -->
            <tr style="background: #f0f2f5;">
              <td style="${estiloTd}; font-weight: 600;">Centroide (X)</td>
              <td style="${estiloTd}">${centroideX.toFixed(2)}</td>
              <td style="${estiloTd}; font-size: 12px;">px</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}; font-weight: 600;">Centroide (Y)</td>
              <td style="${estiloTd}">${centroideY.toFixed(2)}</td>
              <td style="${estiloTd}; font-size: 12px;">px</td>
            </tr>
            
            <!-- ANÁLISIS RADIAL -->
            <tr>
              <td style="${estiloTd}">Radio Máximo</td>
              <td style="${estiloTd}; color: #dc3545;">${radioMax.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}">Radio Mínimo</td>
              <td style="${estiloTd}; color: #28a745;">${radioMin.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm</td>
            </tr>
            <tr>
              <td style="${estiloTd}">Radio Medio</td>
              <td style="${estiloTd}">${radioMedio.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}">Ratio de Radios</td>
              <td style="${estiloTd}">${ratioRadios.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">Min/Max (1.0 = circular)</td>
            </tr>
            <tr>
              <td style="${estiloTd}">Regularidad Radial</td>
              <td style="${estiloTd}">${regularidad.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">Uniformidad</td>
            </tr>
            
            <!-- EJES -->
            <tr style="background: #f0f2f5;">
              <td style="${estiloTd}; font-weight: 600;">Eje Mayor</td>
              <td style="${estiloTd}; font-weight: 600;">${ejeMayor.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}; font-weight: 600;">Eje Menor</td>
              <td style="${estiloTd}; font-weight: 600;">${ejeMenor.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm</td>
            </tr>
            <tr>
              <td style="${estiloTd}">Excentricidad</td>
              <td style="${estiloTd}">${excentricidad.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">0.0 = círculo, 1.0 = línea</td>
            </tr>
            
            <!-- ÍNDICES DE FORMA -->
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}; font-weight: 600;">Circularidad</td>
              <td style="${estiloTd}; font-weight: 600; color: ${circularidad >= 0.9 ? '#28a745' : circularidad >= 0.7 ? '#17a2b8' : '#ffc107'};">${circularidad.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">1.0 = círculo perfecto</td>
            </tr>
            <tr>
              <td style="${estiloTd}">Compacidad</td>
              <td style="${estiloTd}">${compacidad.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">Relación área/perímetro²</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}">Solidez</td>
              <td style="${estiloTd}">${solidez.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">Área real / área hull</td>
            </tr>
            <tr>
              <td style="${estiloTd}">Convexidad</td>
              <td style="${estiloTd}">${convexidad.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">1.0 = totalmente convexo</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}">Relación de Aspecto</td>
              <td style="${estiloTd}">${aspectRatio.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">Ancho / Alto</td>
            </tr>
            <tr>
              <td style="${estiloTd}">Factor de Forma</td>
              <td style="${estiloTd}">${shapeFactorP.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">Perímetro² / (4π·Área) — 1.0 = círculo</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}">Rectangularidad</td>
              <td style="${estiloTd}">${rectangularityP.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">Área / Área-BB — 1.0 = rellena el bounding box</td>
            </tr>
            <tr>
              <td style="${estiloTd}">Elongación</td>
              <td style="${estiloTd}">${elongationP.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">0.0 = isométrica, 1.0 = muy elongada</td>
            </tr>

            <!-- DIÁMETROS DE FERET -->
            <tr style="background: #e3f2fd;">
              <td style="${estiloTd}; font-weight: 600;">Feret Máximo</td>
              <td style="${estiloTd}; font-weight: 600; color: #01579b;">${feretMaxP.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm — mayor dimensión en cualquier ángulo</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}; font-weight: 600;">Feret Mínimo</td>
              <td style="${estiloTd}; font-weight: 600; color: #01579b;">${feretMinP.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm — menor dimensión en cualquier ángulo</td>
            </tr>
            <tr>
              <td style="${estiloTd}">Ratio Feret</td>
              <td style="${estiloTd}">${feretRatioP.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">Mín/Máx — 1.0 = circular (isotrópico)</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}">Orientación Feret Máx.</td>
              <td style="${estiloTd}">${feretAngMaxP.toFixed(1)}</td>
              <td style="${estiloTd}; font-size: 12px;">° — dirección del eje mayor</td>
            </tr>
            <tr>
              <td style="${estiloTd}">Orientación Feret Mín.</td>
              <td style="${estiloTd}">${feretAngMinP.toFixed(1)}</td>
              <td style="${estiloTd}; font-size: 12px;">° — dirección del eje menor</td>
            </tr>

            <!-- UBICACIÓN -->
              <td style="${estiloTd}; font-weight: 600;">Distancia al Centro del Objeto</td>
              <td style="${estiloTd}; font-weight: 600; color: #0066cc;">${distanciaCentro.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm - desde centroide del objeto</td>
            </tr>
            
            <!-- ANÁLISIS RADIAL COMPLEMENTARIO -->
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}">Desviación Radial</td>
              <td style="${estiloTd}">${desviacionRadialP.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm — dispersión de radios desde centroide</td>
            </tr>
            <tr>
              <td style="${estiloTd}">CV Radial</td>
              <td style="${estiloTd}">${coefVarRadialP.toFixed(2)}</td>
              <td style="${estiloTd}; font-size: 12px;">% — heterogeneidad de forma (0 = perfectamente uniforme)</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}">Vértices Aproximados</td>
              <td style="${estiloTd}">${verticesAproxP}</td>
              <td style="${estiloTd}; font-size: 12px;">vértices del polígono trazado (Convex Hull)</td>
            </tr>
            ${formaDetP ? `<tr style="background: #e8f4fd;">
              <td style="${estiloTd}; font-weight: 600;">Forma Detectada</td>
              <td style="${estiloTd}; font-weight: 600; color: #0066cc;">${formaDetP}</td>
              <td style="${estiloTd}; font-size: 12px;">Confianza: ${(confFormaP * 100).toFixed(0)}%</td>
            </tr>` : ''}
          </tbody>
        </table>
      `;
    });
    
    // Resumen general — áreas efectivas sin double-counting por contención
    const _phefResumenP = calcularAreaEfectivaPH(obj.perforaciones || [], obj.horadaciones || []);
    const areaTotal = _phefResumenP.areaTotalPerforaciones;
    const areaObjeto = parseFloat(metricas.area) || 0;
    const porcentaje = areaObjeto > 0 ? (areaTotal / areaObjeto) * 100 : 0;
    const _notaContencionP = _phefResumenP.numContenidas > 0
      ? `<br>          • <strong>P contenidas en H (no sumadas):</strong> ${_phefResumenP.numContenidas}`
      : '';
    
    html += `
      <div style="margin-top: 20px; padding: 15px; background: #f0f2f5; border-left: 4px solid #0066cc; border-radius: 4px;">
        <strong style="font-size: 16px;">RESUMEN DE PERFORACIONES:</strong>
        <div style="margin-top: 10px; font-size: 14px;">
          • <strong>Total detectadas:</strong> ${obj.perforaciones.length}<br>
          • <strong>Área total efectiva:</strong> ${areaTotal.toFixed(3)} mm²${_notaContencionP}<br>
          • <strong>Porcentaje del objeto:</strong> ${porcentaje.toFixed(2)}%<br>
          • <strong>Área promedio:</strong> ${obj.perforaciones.length > 0 ? (areaTotal / obj.perforaciones.length).toFixed(3) : '0.000'} mm²
        </div>
      </div>
    `;
    
    return html;
}

  /**
   * 21. HORADACIONES (detalle completo de cada horadación)
   */
function generarSeccionHoradaciones(obj, metricas, estiloTabla, estiloTh, estiloTd) {
    if (!obj.horadaciones || obj.horadaciones.length === 0) {
      return `
        <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #28a745;">
          21. HORADACIONES (Concavidades Ciegas)
        </h3>
        <div style="padding: 20px; background: #d4edda; border-left: 4px solid #28a745; border-radius: 4px; text-align: center;">
          <strong>No se detectaron horadaciones en este objeto</strong>
        </div>
      `;
    }
    
    let html = `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #28a745;">
        21. HORADACIONES (Concavidades Ciegas) - ${obj.horadaciones.length} detectada(s)
      </h3>
    `;
    
    // Generar tabla detallada para cada horadación
    obj.horadaciones.forEach((horad, idx) => {
      const m = horad.metricas || {};
      const horadId = horad.id || (idx + 1);
      
      // Extraer métricas
      const area = parseFloat(m.area || horad.area) || 0;
      const perimetro = parseFloat(m.perimeter || horad.perimetro) || 0;
      const ancho = parseFloat(m.width || m.ancho) || 0;
      const alto = parseFloat(m.height || m.alto) || 0;
      const centroideX = parseFloat(m.centroide_x || m.centroid?.[0]) || 0;
      const centroideY = parseFloat(m.centroide_y || m.centroid?.[1]) || 0;
      const radioMax = parseFloat(m.radio_maximo) || 0;
      const radioMin = parseFloat(m.radio_minimo) || 0;
      const radioMedio = parseFloat(m.radio_medio) || 0;
      const ratioRadios = parseFloat(m.ratio_radios) || 0;
      const regularidad = parseFloat(m.regularidad_radial) || 0;
      const ejeMayor = parseFloat(m.eje_mayor) || 0;
      const ejeMenor = parseFloat(m.eje_menor) || 0;
      const excentricidad = parseFloat(m.excentricidad) || 0;
      const circularidad = parseFloat(m.circularity || m.circularidad) || 0;
      const compacidad = parseFloat(m.compactness || m.compacidad) || 0;
      const solidez = parseFloat(m.solidity || m.solidez) || 0;
      const convexidad = parseFloat(m.convexity || m.convexidad) || 0;
      const aspectRatio = parseFloat(m.aspect_ratio) || 0;
      const distanciaCentro = parseFloat(horad.distanciaAlCentro) || 0;
      const desviacionRadialH = parseFloat(m.desviacion_radial) || 0;
      const coefVarRadialH = parseFloat(m.coeficiente_variacion_radial) || 0;
      const verticesAproxH = parseInt(m.vertices_aproximados) || 0;
      const formaDetH = m.forma_detectada || null;
      const confFormaH = parseFloat(m.forma_confianza) || 0;
      const shapeFactorH    = parseFloat(m.shape_factor)    || 0;
      const rectangularityH = parseFloat(m.rectangularity)  || 0;
      const elongationH     = parseFloat(m.elongation)      || 0;
      const feretMaxH       = parseFloat(m.feret_max)       || 0;
      const feretMinH       = parseFloat(m.feret_min)       || 0;
      const feretRatioH     = parseFloat(m.feret_ratio)     || 0;
      const feretAngMaxH    = parseFloat(m.feret_angulo_max)|| 0;
      const feretAngMinH    = parseFloat(m.feret_angulo_min)|| 0;
      
      html += `
        <h4 style="color: #28a745; margin: 20px 0 10px 0; padding: 8px; background: #d4edda; border-left: 4px solid #28a745;">
          Horadación H${horadId}
        </h4>
        <table style="${estiloTabla}">
          <thead>
            <tr>
              <th style="${estiloTh}; width: 40%;">Métrica</th>
              <th style="${estiloTh}; width: 30%;">Valor</th>
              <th style="${estiloTh}; width: 30%;">Unidad / Descripción</th>
            </tr>
          </thead>
          <tbody>
            <!-- DIMENSIONES BÁSICAS -->
            <tr style="background: #d4edda;">
              <td style="${estiloTd}; font-weight: 600;">Área</td>
              <td style="${estiloTd}; font-weight: 600; color: #28a745;">${area.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm²</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}; font-weight: 600;">Perímetro</td>
              <td style="${estiloTd}; font-weight: 600;">${perimetro.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm</td>
            </tr>
            <tr>
              <td style="${estiloTd}">Ancho</td>
              <td style="${estiloTd}">${ancho.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}">Alto</td>
              <td style="${estiloTd}">${alto.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm</td>
            </tr>
            <tr>
              <td style="${estiloTd}">Dimensiones (W×H)</td>
              <td style="${estiloTd}" colspan="2">${ancho.toFixed(2)} × ${alto.toFixed(2)} mm</td>
            </tr>
            
            <!-- CENTROIDE -->
            <tr style="background: #d4edda;">
              <td style="${estiloTd}; font-weight: 600;">Centroide (X)</td>
              <td style="${estiloTd}">${centroideX.toFixed(2)}</td>
              <td style="${estiloTd}; font-size: 12px;">px</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}; font-weight: 600;">Centroide (Y)</td>
              <td style="${estiloTd}">${centroideY.toFixed(2)}</td>
              <td style="${estiloTd}; font-size: 12px;">px</td>
            </tr>
            
            <!-- ANÁLISIS RADIAL -->
            <tr>
              <td style="${estiloTd}">Radio Máximo</td>
              <td style="${estiloTd}; color: #dc3545;">${radioMax.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}">Radio Mínimo</td>
              <td style="${estiloTd}; color: #28a745;">${radioMin.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm</td>
            </tr>
            <tr>
              <td style="${estiloTd}">Radio Medio</td>
              <td style="${estiloTd}">${radioMedio.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}">Ratio de Radios</td>
              <td style="${estiloTd}">${ratioRadios.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">Min/Max (1.0 = circular)</td>
            </tr>
            <tr>
              <td style="${estiloTd}">Regularidad Radial</td>
              <td style="${estiloTd}">${regularidad.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">Uniformidad</td>
            </tr>
            
            <!-- EJES -->
            <tr style="background: #d4edda;">
              <td style="${estiloTd}; font-weight: 600;">Eje Mayor</td>
              <td style="${estiloTd}; font-weight: 600;">${ejeMayor.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}; font-weight: 600;">Eje Menor</td>
              <td style="${estiloTd}; font-weight: 600;">${ejeMenor.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm</td>
            </tr>
            <tr>
              <td style="${estiloTd}">Excentricidad</td>
              <td style="${estiloTd}">${excentricidad.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">0.0 = círculo, 1.0 = línea</td>
            </tr>
            
            <!-- ÍNDICES DE FORMA -->
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}; font-weight: 600;">Circularidad</td>
              <td style="${estiloTd}; font-weight: 600; color: ${circularidad >= 0.9 ? '#28a745' : circularidad >= 0.7 ? '#17a2b8' : '#ffc107'};">${circularidad.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">1.0 = círculo perfecto</td>
            </tr>
            <tr>
              <td style="${estiloTd}">Compacidad</td>
              <td style="${estiloTd}">${compacidad.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">Relación área/perímetro²</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}">Solidez</td>
              <td style="${estiloTd}">${solidez.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">Área real / área hull</td>
            </tr>
            <tr>
              <td style="${estiloTd}">Convexidad</td>
              <td style="${estiloTd}">${convexidad.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">1.0 = totalmente convexo</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}">Relación de Aspecto</td>
              <td style="${estiloTd}">${aspectRatio.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">Ancho / Alto</td>
            </tr>
            <tr>
              <td style="${estiloTd}">Factor de Forma</td>
              <td style="${estiloTd}">${shapeFactorH.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">Perímetro² / (4π·Área) — 1.0 = círculo</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}">Rectangularidad</td>
              <td style="${estiloTd}">${rectangularityH.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">Área / Área-BB — 1.0 = rellena el bounding box</td>
            </tr>
            <tr>
              <td style="${estiloTd}">Elongación</td>
              <td style="${estiloTd}">${elongationH.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">0.0 = isométrica, 1.0 = muy elongada</td>
            </tr>

            <!-- DIÁMETROS DE FERET -->
            <tr style="background: #e8f5e9;">
              <td style="${estiloTd}; font-weight: 600;">Feret Máximo</td>
              <td style="${estiloTd}; font-weight: 600; color: #1b5e20;">${feretMaxH.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm — mayor dimensión en cualquier ángulo</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}; font-weight: 600;">Feret Mínimo</td>
              <td style="${estiloTd}; font-weight: 600; color: #1b5e20;">${feretMinH.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm — menor dimensión en cualquier ángulo</td>
            </tr>
            <tr>
              <td style="${estiloTd}">Ratio Feret</td>
              <td style="${estiloTd}">${feretRatioH.toFixed(4)}</td>
              <td style="${estiloTd}; font-size: 12px;">Mín/Máx — 1.0 = circular (isotrópico)</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}">Orientación Feret Máx.</td>
              <td style="${estiloTd}">${feretAngMaxH.toFixed(1)}</td>
              <td style="${estiloTd}; font-size: 12px;">° — dirección del eje mayor</td>
            </tr>
            <tr>
              <td style="${estiloTd}">Orientación Feret Mín.</td>
              <td style="${estiloTd}">${feretAngMinH.toFixed(1)}</td>
              <td style="${estiloTd}; font-size: 12px;">° — dirección del eje menor</td>
            </tr>

            <!-- UBICACIÓN -->
              <td style="${estiloTd}; font-weight: 600;">Distancia al Centro del Objeto</td>
              <td style="${estiloTd}; font-weight: 600; color: #28a745;">${distanciaCentro.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm - desde centroide del objeto</td>
            </tr>
            
            <!-- ANÁLISIS RADIAL COMPLEMENTARIO -->
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}">Desviación Radial</td>
              <td style="${estiloTd}">${desviacionRadialH.toFixed(3)}</td>
              <td style="${estiloTd}; font-size: 12px;">mm — dispersión de radios desde centroide</td>
            </tr>
            <tr>
              <td style="${estiloTd}">CV Radial</td>
              <td style="${estiloTd}">${coefVarRadialH.toFixed(2)}</td>
              <td style="${estiloTd}; font-size: 12px;">% — heterogeneidad de forma (0 = perfectamente uniforme)</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="${estiloTd}">Vértices Aproximados</td>
              <td style="${estiloTd}">${verticesAproxH}</td>
              <td style="${estiloTd}; font-size: 12px;">vértices del polígono trazado (Convex Hull)</td>
            </tr>
            ${formaDetH ? `<tr style="background: #e8f5e9;">
              <td style="${estiloTd}; font-weight: 600;">Forma Detectada</td>
              <td style="${estiloTd}; font-weight: 600; color: #28a745;">${formaDetH}</td>
              <td style="${estiloTd}; font-size: 12px;">Confianza: ${(confFormaH * 100).toFixed(0)}%</td>
            </tr>` : ''}
          </tbody>
        </table>
      `;
    });
    
    // Resumen general horadaciones — el área de H siempre es el área del contenedor
    const _phefResumenH = calcularAreaEfectivaPH(obj.perforaciones || [], obj.horadaciones || []);
    const areaTotal = _phefResumenH.areaTotalHoradaciones;
    const areaObjeto = parseFloat(metricas.area) || 0;
    const porcentaje = areaObjeto > 0 ? (areaTotal / areaObjeto) * 100 : 0;
    const _notaContencionH = _phefResumenH.numContenidas > 0
      ? `<br>          • <strong>P inscritas dentro de H (incluidas en área H):</strong> ${_phefResumenH.numContenidas}`
      : '';
    
    html += `
      <div style="margin-top: 20px; padding: 15px; background: #d4edda; border-left: 4px solid #28a745; border-radius: 4px;">
        <strong style="font-size: 16px;">RESUMEN DE HORADACIONES:</strong>
        <div style="margin-top: 10px; font-size: 14px;">
          • <strong>Total detectadas:</strong> ${obj.horadaciones.length}<br>
          • <strong>Área total horadaciones:</strong> ${areaTotal.toFixed(3)} mm²${_notaContencionH}<br>
          • <strong>Porcentaje del objeto:</strong> ${porcentaje.toFixed(2)}%<br>
          • <strong>Área promedio:</strong> ${obj.horadaciones.length > 0 ? (areaTotal / obj.horadaciones.length).toFixed(3) : '0.000'} mm²
        </div>
      </div>
    `;
    
    return html;
}

  /**
   * 22. COMPARACIÓN BIFACIAL (Cara A vs Cara B)
   */
function generarSeccionComparacionBifacial(obj, metricas, estiloTabla, estiloTh, estiloTd) {
    console.log('🔄 Generando sección de comparación bifacial para:', obj.id);
    
    // Buscar la otra cara del mismo objeto
    const otraCara = obj.cara === 'A' ? 'B' : 'A';
    const otraCaraId = `OBJ_${obj.numeroObjeto}_${otraCara}`;
    
    // Buscar en el localStorage de colección
    const collectionManager = window.collectionManager;
    if (!collectionManager) {
      console.warn('⚠️ CollectionManager no disponible');
      return '';
    }
    
    // Obtener el proyecto actual
    const activeProject = collectionManager.getActiveProject();
    if (!activeProject || !activeProject.items) {
      console.warn('⚠️ No hay proyecto activo con items');
      return '';
    }
    
    // Buscar el objeto de la otra cara
    const otraCaraObj = activeProject.items.find(item => item.id === otraCaraId);
    
    if (!otraCaraObj || !otraCaraObj.metricas) {
      // No existe la otra cara o no ha sido analizada
      return `
        <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #ff9800;">
          22. COMPARACIÓN BIFACIAL
        </h3>
        <div style="padding: 20px; background: #fff3e0; border-left: 4px solid #ff9800; border-radius: 4px; text-align: center;">
          <strong>Análisis Bifacial Incompleto</strong>
          <p style="margin-top: 10px; color: #e65100;">
            Para ver la comparación bifacial, es necesario analizar ambas caras del objeto.<br>
            <strong>Cara actual:</strong>${obj.cara === 'A'? 'Anverso (Cara A)': 'Reverso (Cara B)'}<br>
            <strong>Falta analizar:</strong>${otraCara === 'A'? 'Anverso (Cara A)': 'Reverso (Cara B)'}
          </p>
        </div>
      `;
    }
    
    // Ambas caras están disponibles - generar comparación
    const caraA = obj.cara === 'A' ? obj : otraCaraObj;
    const caraB = obj.cara === 'B' ? obj : otraCaraObj;
    const metricasA = obj.cara === 'A' ? metricas : otraCaraObj.metricas;
    const metricasB = obj.cara === 'B' ? metricas : otraCaraObj.metricas;
    
    console.log('✅ Ambas caras encontradas, generando comparación completa');
    
    // HTML de la sección
    let html = `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #ff9800;">
        22. COMPARACIÓN BIFACIAL - Objeto ${obj.numeroObjeto}
      </h3>
      <div style="padding: 15px; background: linear-gradient(135deg, #f0f2f5 0%, #d4edda 100%); border-radius: 8px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-around; text-align: center;">
          <div>
            <strong>Cara A (Anverso)</strong>
          </div>
          <div style="font-size: 24px; align-self: center;">⟷</div>
          <div>
            <strong>Cara B (Reverso)</strong>
          </div>
        </div>
      </div>
    `;
    
    // Tabla comparativa de métricas principales
    html += generarTablaComparativaDimensiones(metricasA, metricasB, estiloTabla, estiloTh, estiloTd);
    html += generarTablaComparativaForma(metricasA, metricasB, estiloTabla, estiloTh, estiloTd);
    html += generarTablaComparativaPH(caraA, caraB, metricasA, metricasB, estiloTabla, estiloTh, estiloTd);
    
    return html;
}

  /**
   * Genera tabla comparativa de dimensiones básicas
   */
function generarTablaComparativaDimensiones(metricasA, metricasB, estiloTabla, estiloTh, estiloTd) {
    const calcularDif = (valA, valB) => {
      const dif = valB - valA;
      const pct = valA !== 0 ? (dif / valA) * 100 : 0;
      const color = Math.abs(pct) < 5 ? '#28a745' : Math.abs(pct) < 15 ? '#ffc107' : '#dc3545';
      const signo = dif > 0 ? '+' : '';
      return { dif, pct, color, signo };
    };
    
    const areaA = parseFloat(metricasA.area) || 0;
    const areaB = parseFloat(metricasB.area) || 0;
    const difArea = calcularDif(areaA, areaB);
    
    const perimetroA = parseFloat(metricasA.perimeter) || 0;
    const perimetroB = parseFloat(metricasB.perimeter) || 0;
    const difPerimetro = calcularDif(perimetroA, perimetroB);
    
    const anchoA = parseFloat(metricasA.width) || 0;
    const anchoB = parseFloat(metricasB.width) || 0;
    const difAncho = calcularDif(anchoA, anchoB);
    
    const altoA = parseFloat(metricasA.height) || 0;
    const altoB = parseFloat(metricasB.height) || 0;
    const difAlto = calcularDif(altoA, altoB);
    
    return `
      <h4 style="color: #ff9800; margin: 20px 0 10px 0; padding: 8px; background: #fff3e0; border-left: 4px solid #ff9800;">
        Comparación de Dimensiones
      </h4>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 25%;">Métrica</th>
            <th style="${estiloTh}; width: 20%;">Cara A</th>
            <th style="${estiloTh}; width: 20%;">Cara B</th>
            <th style="${estiloTh}; width: 15%;">Diferencia</th>
            <th style="${estiloTh}; width: 20%;">Interpretación</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Área</td>
            <td style="${estiloTd}; color: #0066cc;">${areaA.toFixed(2)} mm²</td>
            <td style="${estiloTd}; color: #28a745;">${areaB.toFixed(2)} mm²</td>
            <td style="${estiloTd}; color: ${difArea.color}; font-weight: 600;">${difArea.signo}${difArea.dif.toFixed(2)} mm² (${difArea.signo}${difArea.pct.toFixed(1)}%)</td>
            <td style="${estiloTd}; font-size: 11px;">${Math.abs(difArea.pct) < 5 ? 'Muy similar': Math.abs(difArea.pct) < 15 ? 'Diferencia moderada': 'Diferencia significativa'}</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Perímetro</td>
            <td style="${estiloTd}; color: #0066cc;">${perimetroA.toFixed(2)} mm</td>
            <td style="${estiloTd}; color: #28a745;">${perimetroB.toFixed(2)} mm</td>
            <td style="${estiloTd}; color: ${difPerimetro.color}; font-weight: 600;">${difPerimetro.signo}${difPerimetro.dif.toFixed(2)} mm (${difPerimetro.signo}${difPerimetro.pct.toFixed(1)}%)</td>
            <td style="${estiloTd}; font-size: 11px;">${Math.abs(difPerimetro.pct) < 5 ? 'Muy similar': Math.abs(difPerimetro.pct) < 15 ? 'Diferencia moderada': 'Diferencia significativa'}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Ancho</td>
            <td style="${estiloTd}; color: #0066cc;">${anchoA.toFixed(2)} mm</td>
            <td style="${estiloTd}; color: #28a745;">${anchoB.toFixed(2)} mm</td>
            <td style="${estiloTd}; color: ${difAncho.color}; font-weight: 600;">${difAncho.signo}${difAncho.dif.toFixed(2)} mm (${difAncho.signo}${difAncho.pct.toFixed(1)}%)</td>
            <td style="${estiloTd}; font-size: 11px;">${Math.abs(difAncho.pct) < 5 ? 'Muy similar': Math.abs(difAncho.pct) < 15 ? 'Diferencia moderada': 'Diferencia significativa'}</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Alto</td>
            <td style="${estiloTd}; color: #0066cc;">${altoA.toFixed(2)} mm</td>
            <td style="${estiloTd}; color: #28a745;">${altoB.toFixed(2)} mm</td>
            <td style="${estiloTd}; color: ${difAlto.color}; font-weight: 600;">${difAlto.signo}${difAlto.dif.toFixed(2)} mm (${difAlto.signo}${difAlto.pct.toFixed(1)}%)</td>
            <td style="${estiloTd}; font-size: 11px;">${Math.abs(difAlto.pct) < 5 ? 'Muy similar': Math.abs(difAlto.pct) < 15 ? 'Diferencia moderada': 'Diferencia significativa'}</td>
          </tr>
        </tbody>
      </table>
    `;
}

  /**
   * Genera tabla comparativa de índices de forma
   */
function generarTablaComparativaForma(metricasA, metricasB, estiloTabla, estiloTh, estiloTd) {
    const calcularDif = (valA, valB) => {
      const dif = valB - valA;
      const pct = valA !== 0 ? (dif / valA) * 100 : 0;
      const color = Math.abs(pct) < 5 ? '#28a745' : Math.abs(pct) < 15 ? '#ffc107' : '#dc3545';
      const signo = dif > 0 ? '+' : '';
      return { dif, pct, color, signo };
    };
    
    const circA = parseFloat(metricasA.circularity || metricasA.circularidad) || 0;
    const circB = parseFloat(metricasB.circularity || metricasB.circularidad) || 0;
    const difCirc = calcularDif(circA, circB);
    
    const compA = parseFloat(metricasA.compactness || metricasA.compacidad) || 0;
    const compB = parseFloat(metricasB.compactness || metricasB.compacidad) || 0;
    const difComp = calcularDif(compA, compB);
    
    const solA = parseFloat(metricasA.solidity || metricasA.solidez) || 0;
    const solB = parseFloat(metricasB.solidity || metricasB.solidez) || 0;
    const difSol = calcularDif(solA, solB);
    
    const formaA = metricasA.forma_detectada || 'N/A';
    const formaB = metricasB.forma_detectada || 'N/A';
    const formaIgual = formaA === formaB;
    
    return `
      <h4 style="color: #ff9800; margin: 20px 0 10px 0; padding: 8px; background: #fff3e0; border-left: 4px solid #ff9800;">
        Comparación de Forma
      </h4>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 25%;">Métrica</th>
            <th style="${estiloTh}; width: 20%;">Cara A</th>
            <th style="${estiloTh}; width: 20%;">Cara B</th>
            <th style="${estiloTh}; width: 15%;">Diferencia</th>
            <th style="${estiloTh}; width: 20%;">Interpretación</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Forma Detectada</td>
            <td style="${estiloTd}; color: #0066cc;">${formaA}</td>
            <td style="${estiloTd}; color: #28a745;">${formaB}</td>
            <td style="${estiloTd}; font-weight: 600;"colspan="2">${formaIgual ? 'Misma forma': 'Formas diferentes'}</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Circularidad</td>
            <td style="${estiloTd}; color: #0066cc;">${circA.toFixed(4)}</td>
            <td style="${estiloTd}; color: #28a745;">${circB.toFixed(4)}</td>
            <td style="${estiloTd}; color: ${difCirc.color}; font-weight: 600;">${difCirc.signo}${difCirc.dif.toFixed(4)} (${difCirc.signo}${difCirc.pct.toFixed(1)}%)</td>
            <td style="${estiloTd}; font-size: 11px;">${Math.abs(difCirc.pct) < 5 ? 'Muy similar': Math.abs(difCirc.pct) < 15 ? 'Diferencia moderada': 'Diferencia significativa'}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Compacidad</td>
            <td style="${estiloTd}; color: #0066cc;">${compA.toFixed(4)}</td>
            <td style="${estiloTd}; color: #28a745;">${compB.toFixed(4)}</td>
            <td style="${estiloTd}; color: ${difComp.color}; font-weight: 600;">${difComp.signo}${difComp.dif.toFixed(4)} (${difComp.signo}${difComp.pct.toFixed(1)}%)</td>
            <td style="${estiloTd}; font-size: 11px;">${Math.abs(difComp.pct) < 5 ? 'Muy similar': Math.abs(difComp.pct) < 15 ? 'Diferencia moderada': 'Diferencia significativa'}</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Solidez</td>
            <td style="${estiloTd}; color: #0066cc;">${solA.toFixed(4)}</td>
            <td style="${estiloTd}; color: #28a745;">${solB.toFixed(4)}</td>
            <td style="${estiloTd}; color: ${difSol.color}; font-weight: 600;">${difSol.signo}${difSol.dif.toFixed(4)} (${difSol.signo}${difSol.pct.toFixed(1)}%)</td>
            <td style="${estiloTd}; font-size: 11px;">${Math.abs(difSol.pct) < 5 ? 'Muy similar': Math.abs(difSol.pct) < 15 ? 'Diferencia moderada': 'Diferencia significativa'}</td>
          </tr>
        </tbody>
      </table>
    `;
}

  /**
   * Genera tabla comparativa de Perforaciones/Horadaciones
   */
function generarTablaComparativaPH(caraA, caraB, metricasA, metricasB, estiloTabla, estiloTh, estiloTd) {
    const numPerforacionesA = (caraA.perforaciones && caraA.perforaciones.length) || 0;
    const numPerforacionesB = (caraB.perforaciones && caraB.perforaciones.length) || 0;
    const numHoradacionesA = (caraA.horadaciones && caraA.horadaciones.length) || 0;
    const numHoradacionesB = (caraB.horadaciones && caraB.horadaciones.length) || 0;

    // Áreas efectivas con deduplicación por contención (p.ej. orificios cónicos)
    const _phefA = calcularAreaEfectivaPH(caraA.perforaciones || [], caraA.horadaciones || []);
    const _phefB = calcularAreaEfectivaPH(caraB.perforaciones || [], caraB.horadaciones || []);
    const areaPerforacionesA = _phefA.areaTotalPerforaciones;
    const areaPerforacionesB = _phefB.areaTotalPerforaciones;
    const areaHoradacionesA  = _phefA.areaTotalHoradaciones;
    const areaHoradacionesB  = _phefB.areaTotalHoradaciones;
    
    const porosidadA = parseFloat(metricasA.porosidad) || 0;
    const porosidadB = parseFloat(metricasB.porosidad) || 0;
    const difPorosidad = porosidadB - porosidadA;
    
    return `
      <h4 style="color: #ff9800; margin: 20px 0 10px 0; padding: 8px; background: #fff3e0; border-left: 4px solid #ff9800;">
        Comparación de Perforaciones y Horadaciones
      </h4>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 25%;">Métrica</th>
            <th style="${estiloTh}; width: 20%;">Cara A</th>
            <th style="${estiloTh}; width: 20%;">Cara B</th>
            <th style="${estiloTh}; width: 35%;">Comparación</th>
          </tr>
        </thead>
        <tbody>
          <!-- PERFORACIONES -->
          <tr style="background: #f0f2f5;">
            <td style="${estiloTd}; font-weight: 600;">Total Perforaciones</td>
            <td style="${estiloTd}; color: #0066cc; font-size: 16px; font-weight: 600;">${numPerforacionesA}</td>
            <td style="${estiloTd}; color: #28a745; font-size: 16px; font-weight: 600;">${numPerforacionesB}</td>
            <td style="${estiloTd}; font-size: 12px;">${numPerforacionesA === numPerforacionesB ? 'Mismo número': `Diferencia: ${Math.abs(numPerforacionesB - numPerforacionesA)} perforación(es)`}</td>
          </tr>
          <tr>
            <td style="${estiloTd}">Área Total P</td>
            <td style="${estiloTd}; color: #0066cc;">${areaPerforacionesA.toFixed(2)} mm²</td>
            <td style="${estiloTd}; color: #28a745;">${areaPerforacionesB.toFixed(2)} mm²</td>
            <td style="${estiloTd}; font-size: 12px;">Dif: ${(areaPerforacionesB - areaPerforacionesA).toFixed(2)} mm²</td>
          </tr>
          
          <!-- HORADACIONES -->
          <tr style="background: #d4edda;">
            <td style="${estiloTd}; font-weight: 600;">Total Horadaciones</td>
            <td style="${estiloTd}; color: #0066cc; font-size: 16px; font-weight: 600;">${numHoradacionesA}</td>
            <td style="${estiloTd}; color: #28a745; font-size: 16px; font-weight: 600;">${numHoradacionesB}</td>
            <td style="${estiloTd}; font-size: 12px;">${numHoradacionesA === numHoradacionesB ? 'Mismo número': `Diferencia: ${Math.abs(numHoradacionesB - numHoradacionesA)} horadación(es)`}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Área Total H</td>
            <td style="${estiloTd}; color: #0066cc;">${areaHoradacionesA.toFixed(2)} mm²</td>
            <td style="${estiloTd}; color: #28a745;">${areaHoradacionesB.toFixed(2)} mm²</td>
            <td style="${estiloTd}; font-size: 12px;">Dif: ${(areaHoradacionesB - areaHoradacionesA).toFixed(2)} mm²</td>
          </tr>
          
          <!-- POROSIDAD -->
          <tr style="background: #fff3e0;">
            <td style="${estiloTd}; font-weight: 600;">Porosidad Total</td>
            <td style="${estiloTd}; color: #0066cc; font-weight: 600;">${porosidadA.toFixed(2)}%</td>
            <td style="${estiloTd}; color: #28a745; font-weight: 600;">${porosidadB.toFixed(2)}%</td>
            <td style="${estiloTd}; font-size: 12px; font-weight: 600;">Dif: ${difPorosidad > 0 ? '+' : ''}${difPorosidad.toFixed(2)}%</td>
          </tr>
        </tbody>
      </table>
      
      <div style="margin-top: 15px; padding: 15px; background: linear-gradient(135deg, #f0f2f5 0%, #d4edda 100%); border-left: 4px solid #ff9800; border-radius: 4px;">
        <strong style="font-size: 14px;">RESUMEN COMPARATIVO P/H:</strong>
        <div style="margin-top: 10px; font-size: 13px;">
          • <strong>P/H Totales:</strong> Cara A: ${numPerforacionesA + numHoradacionesA} | Cara B: ${numPerforacionesB + numHoradacionesB}<br>
          • <strong>Simetría P/H:</strong>${(numPerforacionesA === numPerforacionesB && numHoradacionesA === numHoradacionesB) ? 'Distribución simétrica': 'Distribución asimétrica'}<br>
          • <strong>Interpretación:</strong> ${Math.abs(difPorosidad) < 2 ? 'Porosidad muy similar en ambas caras' : Math.abs(difPorosidad) < 5 ? 'Diferencia moderada de porosidad' : 'Diferencia significativa de porosidad'}
        </div>
      </div>
    `;
}

function generarSeccionEstadoConservacion(metricas, estiloTabla, estiloTh, estiloTd) {
    // Convertir a número para evitar errores de toFixed()
    const solidez = parseFloat(metricas.solidity) || 0;
    const areaDefecto = parseFloat(metricas.area_defecto || metricas.defect_area) || 0;
    const perdidaArea = parseFloat(metricas.perdida_area_fragmentacion_percent) || 0;
    const perdidaPerimetro = parseFloat(metricas.perdida_perimetro_fragmentacion_percent) || 0;
    const areaFragmentada = parseFloat(metricas.area_fragmentada) || 0;
    const perimetroFragmentado = parseFloat(metricas.perimeter_fragmentado) || 0;
    const circularidadFragmentada = parseFloat(metricas.circularity_fragmentada) || 0;
    const compacidadFragmentada = parseFloat(metricas.compactness_fragmentada) || 0;
    const solidityClass = metricas.solidity_class || 'No clasificado';
    
    return `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #dc3545;">
        VIII-b. Defectos y Análisis de Conservación
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Métrica</th>
            <th style="${estiloTh}; width: 30%;">Valor</th>
            <th style="${estiloTh}; width: 30%;">Descripción</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Solidez (Convex Hull)</td>
            <td style="${estiloTd}; font-weight: 600; color: ${solidez >= 0.95 ? '#28a745' : solidez >= 0.85 ? '#ffc107' : '#dc3545'};">${(solidez * 100).toFixed(1)}%</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Relación área/área convexa</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Clasificación de Solidez</td>
            <td style="${estiloTd}">${solidityClass}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Estado de conservación según solidez</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Área de Defecto (Hull - Real)</td>
            <td style="${estiloTd}">${areaDefecto.toFixed(2)} mm²</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Área faltante respecto al casco convexo</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Pérdida de Área (Fragmentación)</td>
            <td style="${estiloTd}; font-weight: 600; color: ${perdidaArea < 5 ? '#28a745' : perdidaArea < 15 ? '#ffc107' : '#dc3545'};">${perdidaArea.toFixed(2)}%</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Porcentaje de área perdida por fragmentación</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Pérdida de Perímetro (Fragmentación)</td>
            <td style="${estiloTd}; font-weight: 600; color: ${perdidaPerimetro < 5 ? '#28a745' : perdidaPerimetro < 15 ? '#ffc107' : '#dc3545'};">${perdidaPerimetro.toFixed(2)}%</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Porcentaje de perímetro afectado</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Área Fragmentada Estimada</td>
            <td style="${estiloTd}">${areaFragmentada.toFixed(2)} mm²</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Área total de fragmentos perdidos</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Perímetro Fragmentado Estimado</td>
            <td style="${estiloTd}">${perimetroFragmentado.toFixed(2)} mm</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Perímetro de bordes fragmentados</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Circularidad Post-Fragmentación</td>
            <td style="${estiloTd}">${circularidadFragmentada.toFixed(3)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Circularidad con fragmentos restaurados</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Compacidad Post-Fragmentación</td>
            <td style="${estiloTd}">${compacidadFragmentada.toFixed(3)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Compacidad con fragmentos restaurados</td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top: 15px; padding: 12px; background: ${solidez >= 0.95 ? '#d4edda' : solidez >= 0.85 ? '#fff3cd' : '#f8d7da'}; border-left: 4px solid ${solidez >= 0.95 ? '#28a745' : solidez >= 0.85 ? '#ffc107' : '#dc3545'}; border-radius: 4px;">
        <strong>Evaluación:</strong>${solidez >= 0.95 ? 'Objeto en excelente estado de conservación': solidez >= 0.85 ? 'Objeto con fragmentación moderada': 'Objeto con fragmentación significativa'} • 
        Solidez: ${(solidez * 100).toFixed(1)}% • 
        Pérdida estimada: ${perdidaArea.toFixed(1)}% de área
      </div>
    `;
}

  /**
   * 9. ERROR ÓPTICO POSICIONAL (Sección IX)
   */
function generarSeccionErrorOptico(metricas, estiloTabla, estiloTh, estiloTd) {
    const errorLineal = parseFloat(metricas.error_optico_lineal_percent) || 0;
    const errorArea = parseFloat(metricas.error_optico_area_percent) || 0;
    const errorPerspectiva = parseFloat(metricas.error_perspectiva_percent) || 0;
    const errorDistorsion = parseFloat(metricas.error_distorsion_percent) || 0;
    const posicionRadial = parseFloat(metricas.posicion_radial_norm) || 0;
    const anguloOptico = parseFloat(metricas.angulo_optico_deg) || 0;
    const k1Estimado = parseFloat(metricas.k1_estimado) || 0;
    const fovDiagonal = parseFloat(metricas.fov_diagonal_deg) || 0;
    const confianzaOptica = metricas.confianza_optica || 'Sin datos';
    const notaErrorOptico = metricas.nota_error_optico || 'No disponible';
    
    const errorTotal = Math.sqrt(errorLineal ** 2 + errorArea ** 2);
    const confianzaColor = confianzaOptica.includes('Alta') ? '#28a745' : confianzaOptica.includes('Media') ? '#ffc107' : '#dc3545';
    
    return `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #f57c00;">
        IX. ERROR ÓPTICO POSICIONAL
      </h3>
      <div style="padding: 12px; background: #fff3e0; border-left: 4px solid #f57c00; border-radius: 4px; margin-bottom: 15px;">
        <strong>🔭 Análisis de incertidumbre óptica basado en parámetros de cámara</strong><br>
        <span style="font-size: 12px; color: #6c757d;">Estimación del error sistemático introducido por la geometría de captura (distorsión, perspectiva, aberraciones).</span>
      </div>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Parámetro</th>
            <th style="${estiloTh}; width: 30%;">Valor</th>
            <th style="${estiloTh}; width: 30%;">Interpretación</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #fff8e1;">
            <td style="${estiloTd}; font-weight: 700; color: #e65100;">Error Lineal</td>
            <td style="${estiloTd}; font-weight: 700; color: #e65100; font-size: 14px;">±${errorLineal.toFixed(2)}%</td>
            <td style="${estiloTd}; font-size: 12px;">Incertidumbre en distancias, perímetros, radios y Feret</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 700; color: #e65100;">Error en Área</td>
            <td style="${estiloTd}; font-weight: 700; color: #e65100; font-size: 14px;">±${errorArea.toFixed(2)}%</td>
            <td style="${estiloTd}; font-size: 12px;">Propagación cuadrática ≈ 2 × error lineal</td>
          </tr>
          <tr style="background: #fff8e1;">
            <td style="${estiloTd}; font-weight: 600;">Error de Perspectiva</td>
            <td style="${estiloTd}; font-weight: 600;">${errorPerspectiva.toFixed(2)}%</td>
            <td style="${estiloTd}; font-size: 12px;">Distorsión por ángulo oblicuo de captura</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Error de Distorsión Óptica</td>
            <td style="${estiloTd}; font-weight: 600;">${errorDistorsion.toFixed(2)}%</td>
            <td style="${estiloTd}; font-size: 12px;">Aberración de barril/pincushion de la lente</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Posición Radial (normalizada)</td>
            <td style="${estiloTd}; font-weight: 600;">${(posicionRadial * 100).toFixed(1)}%</td>
            <td style="${estiloTd}; font-size: 12px;">Distancia del centroid al eje óptico (0=centro, 1=borde)</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Ángulo Óptico</td>
            <td style="${estiloTd}; font-weight: 600;">${anguloOptico.toFixed(1)}°</td>
            <td style="${estiloTd}; font-size: 12px;">Ángulo del objeto respecto al eje óptico</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Coeficiente Radial (k₁)</td>
            <td style="${estiloTd}; font-weight: 600;">${k1Estimado.toFixed(6)}</td>
            <td style="${estiloTd}; font-size: 12px;">Parámetro de distorsión óptica del modelo de cámara</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">FOV Diagonal de Cámara</td>
            <td style="${estiloTd}; font-weight: 600;">${fovDiagonal.toFixed(1)}°</td>
            <td style="${estiloTd}; font-size: 12px;">Campo de visión diagonal estimado</td>
          </tr>
          <tr style="background: #fff8e1;">
            <td style="${estiloTd}; font-weight: 700; color: ${confianzaColor};">Confianza de la Estimación</td>
            <td style="${estiloTd}; font-weight: 700; color: ${confianzaColor}; font-size: 14px;">${confianzaOptica}</td>
            <td style="${estiloTd}; font-size: 12px;">Fiabilidad del modelo de error óptico</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Error Total Combinado</td>
            <td style="${estiloTd}; font-weight: 600; color: #d32f2f; font-size: 14px;">±${errorTotal.toFixed(2)}%</td>
            <td style="${estiloTd}; font-size: 12px;">Raíz cuadrática de error lineal + área</td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top: 15px; padding: 12px; background: #fff3e0; border-left: 4px solid #f57c00; border-radius: 4px;">
        <strong>📌 Nota del Análisis:</strong><br>
        <span style="font-size: 12px; color: #333;">${notaErrorOptico}</span>
      </div>
    `;
}

/**
 * IX-B. INCERTIDUMBRE PROPAGADA POR MÉTRICA
 * Rangos [min, max] derivados del error óptico posicional.
 * Solo se renderiza si hay campos de incertidumbre en las métricas.
 */
function generarSeccionIncertidumbrePropagada(metricas, estiloTabla, estiloTh, estiloTd) {
  const areaAbs  = parseFloat(metricas.area_incertidumbre_abs);
  const periAbs  = parseFloat(metricas.perimeter_incertidumbre_abs);
  const ejMajAbs = parseFloat(metricas.eje_mayor_incertidumbre_abs);
  const ejMinAbs = parseFloat(metricas.eje_menor_incertidumbre_abs);

  // Si no hay ningún campo de incertidumbre, no renderizar la sección
  if (isNaN(areaAbs) && isNaN(periAbs) && isNaN(ejMajAbs) && isNaN(ejMinAbs)) return '';

  const _f  = (v, d) => isNaN(parseFloat(v)) ? '—' : parseFloat(v).toFixed(d != null ? d : 3);
  const _rg = (min, val, max, unit) => {
    const lo = parseFloat(min), hi = parseFloat(max), v = parseFloat(val);
    if (isNaN(lo) || isNaN(hi)) return '—';
    const ok = !isNaN(v);
    return `<span style="color:#888;">${lo.toFixed(3)}</span> `
         + (ok ? `<strong>${v.toFixed(3)}</strong>` : '—')
         + ` <span style="color:#888;">${hi.toFixed(3)}</span> ${unit}`;
  };

  const enrAt   = metricas.enriched_at ? metricas.enriched_at.slice(0, 10) : null;
  const maoVer  = metricas.mao_version || null;
  const provTag = (enrAt || maoVer)
    ? `<span style="font-size:10px;background:#1565c0;color:#fff;padding:1px 6px;border-radius:3px;margin-left:8px;">
         enriquecido${enrAt ? ' · ' + enrAt : ''}${maoVer ? ' · v' + maoVer : ''}
       </span>`
    : '';

  return `
    <h3 style="color:#495057;margin:30px 0 15px 0;padding-bottom:8px;border-bottom:3px solid #1565c0;">
      IX-B. INCERTIDUMBRE PROPAGADA POR MÉTRICA${provTag}
    </h3>
    <div style="padding:12px;background:#e3f2fd;border-left:4px solid #1565c0;border-radius:4px;margin-bottom:15px;">
      <strong>📐 Rangos de confianza métrica a métrica</strong><br>
      <span style="font-size:12px;color:#546e7a;">
        Cada métrica lineal y de área se expresa como [mín · <strong>valor</strong> · máx] propagando
        el error óptico posicional de la sección IX. Los rangos son orientativos (modelo k₁ estimado ±30%).
      </span>
    </div>
    <table style="${estiloTabla}">
      <thead>
        <tr>
          <th style="${estiloTh};width:28%;">Métrica</th>
          <th style="${estiloTh};width:22%;">Valor central (mm / mm²)</th>
          <th style="${estiloTh};width:30%;">Rango [mín · valor · máx]</th>
          <th style="${estiloTh};width:20%;">± Incertidumbre</th>
        </tr>
      </thead>
      <tbody>
        <tr style="background:#e3f2fd;">
          <td style="${estiloTd};font-weight:700;color:#1565c0;">Área</td>
          <td style="${estiloTd};">${_f(metricas.area, 3)} mm²</td>
          <td style="${estiloTd};">${_rg(metricas.area_rango_min, metricas.area, metricas.area_rango_max, 'mm²')}</td>
          <td style="${estiloTd};font-weight:600;color:#d32f2f;">±${_f(areaAbs, 4)} mm²</td>
        </tr>
        <tr>
          <td style="${estiloTd};font-weight:700;color:#1565c0;">Perímetro</td>
          <td style="${estiloTd};">${_f(metricas.perimeter, 3)} mm</td>
          <td style="${estiloTd};">${_rg(metricas.perimeter_rango_min, metricas.perimeter, metricas.perimeter_rango_max, 'mm')}</td>
          <td style="${estiloTd};font-weight:600;color:#d32f2f;">±${_f(periAbs, 4)} mm</td>
        </tr>
        ${!isNaN(ejMajAbs) ? `
        <tr style="background:#e3f2fd;">
          <td style="${estiloTd};font-weight:700;color:#1565c0;">Eje Mayor</td>
          <td style="${estiloTd};">${_f(metricas.eje_mayor_real_longitud || metricas.eje_mayor, 3)} mm</td>
          <td style="${estiloTd};">${_rg(metricas.eje_mayor_rango_min, metricas.eje_mayor_real_longitud || metricas.eje_mayor, metricas.eje_mayor_rango_max, 'mm')}</td>
          <td style="${estiloTd};font-weight:600;color:#d32f2f;">±${_f(ejMajAbs, 4)} mm</td>
        </tr>` : ''}
        ${!isNaN(ejMinAbs) ? `
        <tr>
          <td style="${estiloTd};font-weight:700;color:#1565c0;">Eje Menor</td>
          <td style="${estiloTd};">${_f(metricas.eje_menor_real_longitud || metricas.eje_menor, 3)} mm</td>
          <td style="${estiloTd};">${_rg(metricas.eje_menor_rango_min, metricas.eje_menor_real_longitud || metricas.eje_menor, metricas.eje_menor_rango_max, 'mm')}</td>
          <td style="${estiloTd};font-weight:600;color:#d32f2f;">±${_f(ejMinAbs, 4)} mm</td>
        </tr>` : ''}
      </tbody>
    </table>
  `;
}

  /**
   * 5. EJES Y ORIENTACIÓN
   */
function generarSeccionEjesOrientacion(metricas, estiloTabla, estiloTh, estiloTd) {
    const ejeMayor = parseFloat(metricas.eje_mayor_real_longitud || metricas.eje_mayor) || 0;
    const ejeMenor = parseFloat(metricas.eje_menor_real_longitud || metricas.eje_menor) || 0;
    const anguloPrincipal = parseFloat(metricas.eje_principal_angulo) || 0;
    const orientacion = metricas.eje_principal_orientacion || 'N/A';
    const anisotropia = parseFloat(metricas.eje_principal_anisotropia) || 0;
    const formaDominante = metricas.eje_principal_forma_dominante || 'N/A';
    
    return `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #fd7e14;">
        VI. ORIENTACIÓN Y POSICIÓN ESPACIAL
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Métrica</th>
            <th style="${estiloTh}; width: 30%;">Valor</th>
            <th style="${estiloTh}; width: 30%;">Interpretación</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #fff3cd;">
            <td style="${estiloTd}; font-weight: 600;">Eje Mayor (Longitud)</td>
            <td style="${estiloTd}; font-weight: 600; color: #dc3545;">${ejeMayor.toFixed(2)} mm</td>
            <td style="${estiloTd}; font-size: 12px;">Dimensión máxima del objeto</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Eje Menor (Longitud)</td>
            <td style="${estiloTd}; color: #28a745;">${ejeMenor.toFixed(2)} mm</td>
            <td style="${estiloTd}; font-size: 12px;">Dimensión mínima del objeto</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Ángulo Principal</td>
            <td style="${estiloTd}; color: #0066cc;">${anguloPrincipal.toFixed(1)}°</td>
            <td style="${estiloTd}; font-size: 12px;">Orientación del eje mayor</td>
          </tr>
          <tr>
            <td style="${estiloTd}">Orientación</td>
            <td style="${estiloTd}">${orientacion}</td>
            <td style="${estiloTd}; font-size: 12px;">Clasificación direccional</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Anisotropía</td>
            <td style="${estiloTd}">${anisotropia.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px;">0.0 = perfectamente isotrópico</td>
          </tr>
          <tr>
            <td style="${estiloTd}">Forma Dominante</td>
            <td style="${estiloTd}">${formaDominante}</td>
            <td style="${estiloTd}; font-size: 12px;">Basado en relación de ejes</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Ejes Reales (p1)</td>
            <td style="${estiloTd}; font-size: 11px;" colspan="2">
              Mayor: [${metricas.eje_mayor_real_p1 ? `${metricas.eje_mayor_real_p1[0].toFixed(1)}, ${metricas.eje_mayor_real_p1[1].toFixed(1)}` : 'N/A'}] • 
              Menor: [${metricas.eje_menor_real_p1 ? `${metricas.eje_menor_real_p1[0].toFixed(1)}, ${metricas.eje_menor_real_p1[1].toFixed(1)}` : 'N/A'}]
            </td>
          </tr>
          <tr>
            <td style="${estiloTd}">Ejes Reales (p2)</td>
            <td style="${estiloTd}; font-size: 11px;" colspan="2">
              Mayor: [${metricas.eje_mayor_real_p2 ? `${metricas.eje_mayor_real_p2[0].toFixed(1)}, ${metricas.eje_mayor_real_p2[1].toFixed(1)}` : 'N/A'}] • 
              Menor: [${metricas.eje_menor_real_p2 ? `${metricas.eje_menor_real_p2[0].toFixed(1)}, ${metricas.eje_menor_real_p2[1].toFixed(1)}` : 'N/A'}]
            </td>
          </tr>
        </tbody>
      </table>
    `;
}

  /**
   * 6. ANÁLISIS RADIAL
   */
function generarSeccionAnalisisRadial(metricas, estiloTabla, estiloTh, estiloTd) {
    const radioMaximo = parseFloat(metricas.radio_maximo) || 0;
    const radioMinimo = parseFloat(metricas.radio_minimo) || 0;
    const radioMedio = parseFloat(metricas.radio_medio) || 0;
    const ratioRadios = parseFloat(metricas.ratio_radios) || 0;
    const regularidad = parseFloat(metricas.regularidad_radial) || 0;
    const desviacion = parseFloat(metricas.desviacion_radial) || 0;
    const coefVariacion = parseFloat(metricas.coeficiente_variacion_radial) || 0;
    
    // Clasificación de regularidad
    let claseRegularidad = 'Muy irregular';
    let colorRegularidad = '#dc3545';
    if (regularidad >= 0.9) {
      claseRegularidad = 'Muy regular';
      colorRegularidad = '#28a745';
    } else if (regularidad >= 0.75) {
      claseRegularidad = 'Regular';
      colorRegularidad = '#17a2b8';
    } else if (regularidad >= 0.5) {
      claseRegularidad = 'Moderadamente irregular';
      colorRegularidad = '#ffc107';
    }
    
    return `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #17a2b8;">
        IV. REGULARIDAD DEL CONTORNO
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Métrica</th>
            <th style="${estiloTh}; width: 30%;">Valor</th>
            <th style="${estiloTh}; width: 30%;">Interpretación</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #f8d7da;">
            <td style="${estiloTd}; font-weight: 600;">Radio Máximo</td>
            <td style="${estiloTd}; font-weight: 600; color: #dc3545;">${radioMaximo.toFixed(2)} mm</td>
            <td style="${estiloTd}; font-size: 12px;">Mayor distancia desde centroide</td>
          </tr>
          <tr style="background: #d4edda;">
            <td style="${estiloTd}; font-weight: 600;">Radio Mínimo</td>
            <td style="${estiloTd}; font-weight: 600; color: #28a745;">${radioMinimo.toFixed(2)} mm</td>
            <td style="${estiloTd}; font-size: 12px;">Menor distancia desde centroide</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Radio Medio</td>
            <td style="${estiloTd}">${radioMedio.toFixed(2)} mm</td>
            <td style="${estiloTd}; font-size: 12px;">Promedio de todas las distancias</td>
          </tr>
          <tr>
            <td style="${estiloTd}">Ratio de Radios</td>
            <td style="${estiloTd}">${ratioRadios.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px;">Min/Max (1.0 = perfectamente circular)</td>
          </tr>
          <tr style="background: ${regularidad >= 0.75 ? '#d4edda' : regularidad >= 0.5 ? '#fff3cd' : '#f8d7da'};">
            <td style="${estiloTd}; font-weight: 600;">Regularidad Radial</td>
            <td style="${estiloTd}; font-weight: 600; color: ${colorRegularidad};">${regularidad.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px;">${claseRegularidad}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Desviación Radial</td>
            <td style="${estiloTd}">${desviacion.toFixed(2)} mm</td>
            <td style="${estiloTd}; font-size: 12px;">Variabilidad de las distancias</td>
          </tr>
          <tr>
            <td style="${estiloTd}">Coef. de Variación</td>
            <td style="${estiloTd}">${coefVariacion.toFixed(2)}%</td>
            <td style="${estiloTd}; font-size: 12px;">CV < 15% indica forma regular</td>
          </tr>
        </tbody>
      </table>
    `;
}

  /**
   * 7. PROPIEDADES DEL CONTORNO
   */
function generarSeccionPropiedadesContorno(metricas, estiloTabla, estiloTh, estiloTd) {
    const rugosidad = parseFloat(metricas.rugosidad_contorno) || 0;
    const clasificacionRugosidad = metricas.rugosidad_clasificacion || 'No clasificada';
    const longitudMedia = parseFloat(metricas.rugosidad_longitud_segmento_media) || 0;
    const desviacion = parseFloat(metricas.rugosidad_desviacion) || 0;
    const complejidad = parseFloat(metricas.contour_complexity_index) || 0;

    // XIV — métricas de textura superficie (si están disponibles)
    const varianza    = metricas.varianza_interna     != null ? parseFloat(metricas.varianza_interna)    : null;
    const entropia    = metricas.entropia_superficie   != null ? parseFloat(metricas.entropia_superficie)  : null;
    const gradiente   = metricas.gradiente_medio       != null ? parseFloat(metricas.gradiente_medio)      : null;
    const tieneTextura = (varianza !== null || entropia !== null || gradiente !== null);

    // XIV-b — métricas GLCM (disponibles cuando viene desde AIA)
    const glcmContrast  = metricas.contrast      != null ? parseFloat(metricas.contrast)      : null;
    const glcmDissim    = metricas.dissimilarity  != null ? parseFloat(metricas.dissimilarity)  : null;
    const glcmHomog     = metricas.homogeneity    != null ? parseFloat(metricas.homogeneity)    : null;
    const glcmEnergy    = metricas.energy         != null ? parseFloat(metricas.energy)         : null;
    const glcmCorr      = metricas.correlation    != null ? parseFloat(metricas.correlation)    : null;
    const glcmEntropy   = metricas.entropy        != null ? parseFloat(metricas.entropy)        : null;
    const glcmInterp    = metricas.textura_interpretacion || null;
    const tieneGlcm     = (glcmContrast !== null || glcmHomog !== null);

    const filasGlcm = tieneGlcm ? `
          <tr>
            <td style="${estiloTd}; background:#ede7f6; font-weight:600; font-size:11px; color:#5c4d7d;" colspan="3">
              XIV-b. Textura GLCM (Grey-Level Co-occurrence Matrix)
            </td>
          </tr>
          ${glcmContrast !== null ? `
          <tr>
            <td style="${estiloTd}">Contraste GLCM</td>
            <td style="${estiloTd}; font-weight:600; color:#b71c1c;">${glcmContrast.toFixed(4)}</td>
            <td style="${estiloTd}; font-size:12px;">Variación local de intensidad</td>
          </tr>` : ''}
          ${glcmDissim !== null ? `
          <tr style="background:#f8f9fa;">
            <td style="${estiloTd}">Disimilaridad</td>
            <td style="${estiloTd}; font-weight:600;">${glcmDissim.toFixed(4)}</td>
            <td style="${estiloTd}; font-size:12px;">Diferencia entre pares de píxeles</td>
          </tr>` : ''}
          ${glcmHomog !== null ? `
          <tr>
            <td style="${estiloTd}">Homogeneidad</td>
            <td style="${estiloTd}; font-weight:600; color:#1b5e20;">${glcmHomog.toFixed(4)}</td>
            <td style="${estiloTd}; font-size:12px;">Uniformidad textural (1=homogéneo)</td>
          </tr>` : ''}
          ${glcmEnergy !== null ? `
          <tr style="background:#f8f9fa;">
            <td style="${estiloTd}">Energía GLCM (ASM)</td>
            <td style="${estiloTd}; font-weight:600; color:#0d47a1;">${glcmEnergy.toFixed(4)}</td>
            <td style="${estiloTd}; font-size:12px;">Uniformidad cuadrática (0–1)</td>
          </tr>` : ''}
          ${glcmCorr !== null ? `
          <tr>
            <td style="${estiloTd}">Correlación GLCM</td>
            <td style="${estiloTd}; font-weight:600; color:#004d40;">${glcmCorr.toFixed(4)}</td>
            <td style="${estiloTd}; font-size:12px;">Dependencia lineal entre píxeles</td>
          </tr>` : ''}
          ${glcmEntropy !== null ? `
          <tr style="background:#f8f9fa;">
            <td style="${estiloTd}">Entropía GLCM</td>
            <td style="${estiloTd}; font-weight:600; color:#33691e;">${glcmEntropy.toFixed(4)}</td>
            <td style="${estiloTd}; font-size:12px;">Desorden textural</td>
          </tr>` : ''}
          ${glcmInterp ? `
          <tr>
            <td style="${estiloTd}; background:#f3e5f5; font-style:italic;" colspan="3">
              Interpretación: ${glcmInterp}
            </td>
          </tr>` : ''}` : '';

    // Color según rugosidad
    let colorRugosidad = '#28a745';
    if (rugosidad > 0.15) colorRugosidad = '#dc3545';
    else if (rugosidad > 0.08) colorRugosidad = '#ffc107';

    // Filas de textura (XIV) — solo se muestran si existen
    const filasTextura = tieneTextura ? `
          <tr>
            <td style="${estiloTd}; background:#f0f4ff; font-weight:600; font-size:11px; color:#4a5568;" colspan="3">
              XIV. Textura de Superficie (métricas de luminancia interna)
            </td>
          </tr>
          ${varianza !== null ? `
          <tr>
            <td style="${estiloTd}">Varianza tonal σ²</td>
            <td style="${estiloTd}; font-weight:600; color:${varianza >= 400 ? '#dc3545' : '#28a745'};">${varianza.toFixed(2)}</td>
            <td style="${estiloTd}; font-size:12px;">σ²≥400 → textura heterogénea</td>
          </tr>` : ''}
          ${entropia !== null ? `
          <tr style="background:#f8f9fa;">
            <td style="${estiloTd}">Entropía superficial H</td>
            <td style="${estiloTd}; font-weight:600;">${entropia.toFixed(4)} bits</td>
            <td style="${estiloTd}; font-size:12px;">Mayor H → mayor diversidad tonal</td>
          </tr>` : ''}
          ${gradiente !== null ? `
          <tr>
            <td style="${estiloTd}">Gradiente medio Ḡ (Sobel)</td>
            <td style="${estiloTd}; font-weight:600;">${gradiente.toFixed(2)}</td>
            <td style="${estiloTd}; font-size:12px;">Bordes internos / transiciones tonales</td>
          </tr>` : ''}` : '';

    return `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #6f42c1;">
        V. RUGOSIDAD Y COMPLEJIDAD DEL BORDE
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Métrica</th>
            <th style="${estiloTh}; width: 30%;">Valor</th>
            <th style="${estiloTh}; width: 30%;">Interpretación</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: ${rugosidad > 0.15 ? '#f8d7da' : rugosidad > 0.08 ? '#fff3cd' : '#d4edda'};">
            <td style="${estiloTd}; font-weight: 600;">Rugosidad</td>
            <td style="${estiloTd}; font-weight: 600; color: ${colorRugosidad};">${rugosidad.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px;">Irregularidad del borde</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Clasificación Rugosidad</td>
            <td style="${estiloTd}" colspan="2">${clasificacionRugosidad}</td>
          </tr>
          <tr>
            <td style="${estiloTd}">Longitud Media de Segmento</td>
            <td style="${estiloTd}">${longitudMedia.toFixed(2)} mm</td>
            <td style="${estiloTd}; font-size: 12px;">Tamaño promedio de segmentos</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Desviación de Segmentos</td>
            <td style="${estiloTd}">${desviacion.toFixed(2)} mm</td>
            <td style="${estiloTd}; font-size: 12px;">Variabilidad en longitudes</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Índice de Complejidad</td>
            <td style="${estiloTd}; font-weight: 600;">${complejidad.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px;">1.0 = círculo, >2.0 = muy complejo</td>
          </tr>
          ${filasTextura}
          ${filasGlcm}
        </tbody>
      </table>
    `;
}

  /**
   * 8. CURVATURA
   */
function generarSeccionCurvatura(metricas, estiloTabla, estiloTh, estiloTd) {
    const curvaturaMed = parseFloat(metricas.curvatura_media) || 0;
    const curvaturaMax = parseFloat(metricas.curvatura_maxima) || 0;
    const desviacion = parseFloat(metricas.curvatura_desviacion) || 0;
    const puntosInflexion = parseInt(metricas.curvatura_puntos_inflexion) || 0;
    const puntosEsquina = parseInt(metricas.curvatura_puntos_esquina) || 0;
    const clasificacion = metricas.curvatura_clasificacion || 'No clasificada';
    const energia = parseFloat(metricas.energia_curvatura) || 0;
    const claseEnergia = metricas.energia_clasificacion || 'No clasificada';
    
    return `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #e83e8c;">
        V-b. Análisis de Curvatura
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Métrica</th>
            <th style="${estiloTh}; width: 30%;">Valor</th>
            <th style="${estiloTh}; width: 30%;">Interpretación</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Curvatura Media</td>
            <td style="${estiloTd}">${curvaturaMed.toFixed(6)}</td>
            <td style="${estiloTd}; font-size: 12px;">Promedio de curvatura local</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Curvatura Máxima</td>
            <td style="${estiloTd}; font-weight: 600; color: #dc3545;">${curvaturaMax.toFixed(6)}</td>
            <td style="${estiloTd}; font-size: 12px;">Punto de mayor curvatura</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Desviación de Curvatura</td>
            <td style="${estiloTd}">${desviacion.toFixed(6)}</td>
            <td style="${estiloTd}; font-size: 12px;">Variabilidad en curvatura</td>
          </tr>
          <tr>
            <td style="${estiloTd}">Puntos de Inflexión</td>
            <td style="${estiloTd}; color: #0066cc;">${puntosInflexion}</td>
            <td style="${estiloTd}; font-size: 12px;">Cambios de concavidad</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Puntos de Esquina</td>
            <td style="${estiloTd}; color: #fd7e14;">${puntosEsquina}</td>
            <td style="${estiloTd}; font-size: 12px;">Ángulos pronunciados</td>
          </tr>
          <tr>
            <td style="${estiloTd}">Clasificación Suavidad</td>
            <td style="${estiloTd}" colspan="2">${clasificacion}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Energía de Curvatura</td>
            <td style="${estiloTd}">${energia.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px;">Suma de curvaturas²</td>
          </tr>
          <tr>
            <td style="${estiloTd}">Clasificación Energía</td>
            <td style="${estiloTd}" colspan="2">${claseEnergia}</td>
          </tr>
        </tbody>
      </table>
    `;
}

  /**
   * 9. CONVEX HULL
   */
function generarSeccionConvexHull(metricas, estiloTabla, estiloTh, estiloTd) {
    // Factor mm/px derivado de los campos ya convertidos (misma fuente que usó el cálculo)
    const _ejeMM = parseFloat(metricas.eje_mayor_real_longitud)    || 0;
    const _ejePx = parseFloat(metricas.eje_mayor_real_longitud_px) || 0;
    const factorMM = (_ejeMM > 0 && _ejePx > 0) ? _ejeMM / _ejePx : 0;

    // Área y perímetro del hull: preferir campos ya convertidos a mm
    const areaHullMm  = parseFloat(metricas.area)      || 0;   // mm²  (= area_px × factor²)
    const perimHullMm = parseFloat(metricas.perimeter)  || 0;   // mm   (= perimeter_px × factor)
    const areaHullPx  = parseFloat(metricas.area_px)   || parseFloat(metricas.convex_hull_area)      || 0;
    const perimHullPx = parseFloat(metricas.perimeter_px) || parseFloat(metricas.convex_hull_perimeter) || 0;

    // Width/height del hull en mm (si hay factor disponible)
    const anchoHullPx = parseFloat(metricas.hull_width_px)  || 0;
    const altoHullPx  = parseFloat(metricas.hull_height_px) || 0;
    const anchoHull = factorMM > 0 ? anchoHullPx * factorMM : anchoHullPx;
    const altoHull  = factorMM > 0 ? altoHullPx  * factorMM : altoHullPx;
    const unidadDim = factorMM > 0 ? 'mm' : 'px';

    const circularidadHull = parseFloat(metricas.hull_circularity) || 0;
    const aspectRatioHull  = parseFloat(metricas.hull_aspect_ratio) || 0;
    const convexidad      = parseFloat(metricas.convexity) || parseFloat(metricas.convexidad) || 0;
    const claseConvexidad = metricas.convexity_class || metricas.convexidad_class || 'No clasificada';
    const difArea         = parseFloat(metricas.hull_area_difference_percent) || 0;
    const difPerimetro    = parseFloat(metricas.hull_perimeter_difference_percent) || 0;
    const puntosHull      = parseInt(metricas.hull_points || metricas.convex_hull_points) || 0;
    
    return `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #20c997;">
        IV-b. Envolvente Convexa (Convex Hull)
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Métrica</th>
            <th style="${estiloTh}; width: 30%;">Valor</th>
            <th style="${estiloTh}; width: 30%;">Interpretación</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #d1ecf1;">
            <td style="${estiloTd}; font-weight: 600;">Área del Hull</td>
            <td style="${estiloTd}; font-weight: 600;">${areaHullMm > 0 ? areaHullMm.toFixed(2) + ' mm²' : areaHullPx.toFixed(2) + ' px²'}</td>
            <td style="${estiloTd}; font-size: 12px;">Área de forma completa estimada${areaHullPx > 0 ? ` (${areaHullPx.toFixed(0)} px²)` : ''}</td>
          </tr>
          <tr>
            <td style="${estiloTd}">Perímetro del Hull</td>
            <td style="${estiloTd}">${perimHullMm > 0 ? perimHullMm.toFixed(2) + ' mm' : perimHullPx.toFixed(2) + ' px'}</td>
            <td style="${estiloTd}; font-size: 12px;">Perímetro envolvente${perimHullPx > 0 ? ` (${perimHullPx.toFixed(1)} px)` : ''}</td>
          </tr>
          ${anchoHullPx > 0 ? `
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Ancho del Hull</td>
            <td style="${estiloTd}">${anchoHull.toFixed(2)} ${unidadDim}</td>
            <td style="${estiloTd}; font-size: 12px;">Ancho mínimo envolvente</td>
          </tr>
          <tr>
            <td style="${estiloTd}">Alto del Hull</td>
            <td style="${estiloTd}">${altoHull.toFixed(2)} ${unidadDim}</td>
            <td style="${estiloTd}; font-size: 12px;">Alto mínimo envolvente</td>
          </tr>` : ''}
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Circularidad del Hull</td>
            <td style="${estiloTd}">${circularidadHull.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px;">1.0 = círculo perfecto</td>
          </tr>
          <tr>
            <td style="${estiloTd}">Aspect Ratio del Hull</td>
            <td style="${estiloTd}">${aspectRatioHull.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px;">Relación ancho/alto</td>
          </tr>
          <tr style="background: ${convexidad >= 0.95 ? '#d4edda' : convexidad >= 0.85 ? '#fff3cd' : '#f8d7da'};">
            <td style="${estiloTd}; font-weight: 600;">Convexidad</td>
            <td style="${estiloTd}; font-weight: 600; color: ${convexidad >= 0.95 ? '#28a745' : convexidad >= 0.85 ? '#ffc107' : '#dc3545'};">${convexidad.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px;">1.0 = totalmente convexo</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Clasificación</td>
            <td style="${estiloTd}" colspan="2">${claseConvexidad}</td>
          </tr>
          <tr>
            <td style="${estiloTd}">Diferencia de Área</td>
            <td style="${estiloTd}; color: ${difArea > 20 ? '#dc3545' : difArea > 10 ? '#ffc107' : '#28a745'};">${difArea.toFixed(1)}%</td>
            <td style="${estiloTd}; font-size: 12px;">Hull vs contorno real</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Diferencia de Perímetro</td>
            <td style="${estiloTd}; color: ${Math.abs(difPerimetro) > 20 ? '#dc3545' : Math.abs(difPerimetro) > 10 ? '#ffc107' : '#28a745'};">${difPerimetro.toFixed(1)}%</td>
            <td style="${estiloTd}; font-size: 12px;">Hull vs contorno real</td>
          </tr>
          <tr>
            <td style="${estiloTd}">Número de Puntos</td>
            <td style="${estiloTd}">${puntosHull}</td>
            <td style="${estiloTd}; font-size: 12px;">Vértices del hull convexo</td>
          </tr>
        </tbody>
      </table>
    `;
}

  /**
   * 10. SIMETRÍA
   */
function generarSeccionSimetria(metricas, estiloTabla, estiloTh, estiloTd) {
    const simetriaBilateral = parseFloat(metricas.simetria_bilateral) || 0;
    const clasificacion = metricas.simetria_clasificacion || 'No clasificada';
    const distanciaAsimetria = parseFloat(metricas.simetria_distancia_asimetria) || 0;
    
    // Color según nivel de simetría
    let colorSimetria = '#dc3545';
    let bgSimetria = '#f8d7da';
    if (simetriaBilateral >= 0.85) {
      colorSimetria = '#28a745';
      bgSimetria = '#d4edda';
    } else if (simetriaBilateral >= 0.70) {
      colorSimetria = '#17a2b8';
      bgSimetria = '#d1ecf1';
    } else if (simetriaBilateral >= 0.50) {
      colorSimetria = '#ffc107';
      bgSimetria = '#fff3cd';
    }
    
    return `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #6c757d;">
        VI-b. Simetría Bilateral
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Métrica</th>
            <th style="${estiloTh}; width: 30%;">Valor</th>
            <th style="${estiloTh}; width: 30%;">Interpretación</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: ${bgSimetria};">
            <td style="${estiloTd}; font-weight: 600;">Simetría Bilateral</td>
            <td style="${estiloTd}; font-weight: 600; color: ${colorSimetria};">${simetriaBilateral.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px;">1.0 = perfectamente simétrico</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Clasificación</td>
            <td style="${estiloTd}" colspan="2"><strong>${clasificacion}</strong></td>
          </tr>
          <tr>
            <td style="${estiloTd}">Distancia de Asimetría</td>
            <td style="${estiloTd}">${distanciaAsimetria.toFixed(2)} mm</td>
            <td style="${estiloTd}; font-size: 12px;">Desplazamiento del eje de simetría</td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top: 15px; padding: 12px; background: ${bgSimetria}; border-left: 4px solid ${colorSimetria}; border-radius: 4px;">
        <strong>Interpretación:</strong> ${
          simetriaBilateral >= 0.85 ? 'Objeto con excelente simetría bilateral':
          simetriaBilateral >= 0.70 ? 'Objeto con buena simetría':
          simetriaBilateral >= 0.50 ? 'Objeto con simetría moderada':
          'Objeto asimétrico o irregular'
        }
      </div>
    `;
}

  /**
   * 11. MÉTRICAS AVANZADAS (renombrado de Características Avanzadas)
   */
function generarSeccionMetricasAvanzadas(metricas, estiloTabla, estiloTh, estiloTd) {
    // Convertir a número para evitar errores de toFixed()
    const radioMaximo = parseFloat(metricas.radio_maximo || metricas.max_radius) || 0;
    const radioMinimo = parseFloat(metricas.radio_minimo || metricas.min_radius) || 0;
    const radioMedio = parseFloat(metricas.radio_medio) || 0;
    const ratioRadios = parseFloat(metricas.ratio_radios) || 0;
    const regularidadRadial = parseFloat(metricas.regularidad_radial) || 0;
    
    // ⭐ MÉTRICAS FUNDAMENTALES: Estrellamiento
    const indiceEstrellamiento = parseFloat(metricas.indice_estrellamiento) || 0;
    const clasificacionEstrellamiento = metricas.clasificacion_estrellamiento || metricas.estrellamiento_clasificacion || 'No clasificado';
    
    // 🌊 MÉTRICAS FUNDAMENTALES: Lobularidad
    const indiceLobularidad = parseFloat(metricas.indice_lobularidad) || 0;
    const clasificacionLobularidad = metricas.clasificacion_lobularidad || 'No clasificada';
    
    // 📏 MÉTRICAS FUNDAMENTALES: Diámetros de Feret
    const feretMax = parseFloat(metricas.feret_max || metricas.max_feret_diameter) || 0;
    const feretMin = parseFloat(metricas.feret_min || metricas.min_feret_diameter) || 0;
    const feretRatio = parseFloat(metricas.feret_ratio) || (feretMin > 0 ? feretMax / feretMin : 0);
    const clasificacionFeret = metricas.clasificacion_feret || 'No clasificado';
    const feretMaxAngle = parseFloat(metricas.feret_max_angle) || 0;
    const feretMinAngle = parseFloat(metricas.feret_min_angle) || 0;
    
    return `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #6610f2;">
        XII-a. Características Geométricas Avanzadas
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Métrica</th>
            <th style="${estiloTh}; width: 30%;">Valor</th>
            <th style="${estiloTh}; width: 30%;">Descripción</th>
          </tr>
        </thead>
        <tbody>
          <!-- ANÁLISIS RADIAL -->
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Radio Máximo</td>
            <td style="${estiloTd}; font-weight: 600; color: #dc3545;">${radioMaximo.toFixed(2)} mm</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Distancia máxima centroide-contorno</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Radio Mínimo</td>
            <td style="${estiloTd}; font-weight: 600; color: #28a745;">${radioMinimo.toFixed(2)} mm</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Distancia mínima centroide-contorno</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Radio Medio</td>
            <td style="${estiloTd}">${radioMedio.toFixed(2)} mm</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Promedio de distancias al centroide</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Ratio de Radios (Max/Min)</td>
            <td style="${estiloTd}; font-weight: 600;">${ratioRadios.toFixed(3)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Variabilidad radial del contorno</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Regularidad Radial</td>
            <td style="${estiloTd}; font-weight: 600; color: ${regularidadRadial >= 0.9 ? '#28a745' : regularidadRadial >= 0.7 ? '#ffc107' : '#dc3545'};">${(regularidadRadial * 100).toFixed(1)}%</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Uniformidad de la distribución radial</td>
          </tr>
          
          <!-- ⭐ MÉTRICAS FUNDAMENTALES: ESTRELLAMIENTO -->
          <tr style="background: #fff3e0; border-left: 4px solid #ff9800;">
            <td style="${estiloTd}; font-weight: 700; color: #ef6c00;">⭐ Índice de Estrellamiento</td>
            <td style="${estiloTd}; font-weight: 700; color: #ef6c00; font-size: 15px;">${indiceEstrellamiento.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Medida de puntas/protuberancias</td>
          </tr>
          <tr style="background: #ffe0b2;">
            <td style="${estiloTd}; font-weight: 700; color: #e65100;">⭐ Clasificación Estrellamiento</td>
            <td style="${estiloTd}; font-weight: 700; color: #e65100; font-size: 14px;">${clasificacionEstrellamiento}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Categoría de morfología estelar</td>
          </tr>
          
          <!-- MÉTRICAS FUNDAMENTALES: LOBULARIDAD -->
          <tr style="background: #e1f5fe; border-left: 4px solid #0288d1;">
            <td style="${estiloTd}; font-weight: 700; color: #01579b;">Índice de Lobularidad</td>
            <td style="${estiloTd}; font-weight: 700; color: #01579b; font-size: 15px;">${indiceLobularidad.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Medida de lóbulos/ondulaciones</td>
          </tr>
          <tr style="background: #b3e5fc;">
            <td style="${estiloTd}; font-weight: 700; color: #006db3;">Clasificación Lobularidad</td>
            <td style="${estiloTd}; font-weight: 700; color: #006db3; font-size: 14px;">${clasificacionLobularidad}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Categoría de lobularidad</td>
          </tr>
          
          <!-- MÉTRICAS FUNDAMENTALES: DIÁMETROS DE FERET -->
          <tr style="background: #f3e5f5; border-left: 4px solid #9c27b0;">
            <td style="${estiloTd}; font-weight: 700; color: #6a1b9a;">Diámetro Feret Máximo</td>
            <td style="${estiloTd}; font-weight: 700; color: #6a1b9a; font-size: 15px;">${feretMax.toFixed(2)} mm</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Mayor distancia entre puntos paralelos</td>
          </tr>
          <tr style="background: #e1bee7;">
            <td style="${estiloTd}; font-weight: 700; color: #4a148c;">Diámetro Feret Mínimo</td>
            <td style="${estiloTd}; font-weight: 700; color: #4a148c; font-size: 15px;">${feretMin.toFixed(2)} mm</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Menor distancia entre puntos paralelos</td>
          </tr>
          <tr style="background: #f3e5f5;">
            <td style="${estiloTd}; font-weight: 700; color: #7b1fa2;">Ratio de Feret (Max/Min)</td>
            <td style="${estiloTd}; font-weight: 700; color: #7b1fa2; font-size: 15px;">${feretRatio.toFixed(3)}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Relación entre diámetros de Feret</td>
          </tr>
          <tr style="background: #e1bee7;">
            <td style="${estiloTd}; font-weight: 700; color: #8e24aa;">Clasificación Feret</td>
            <td style="${estiloTd}; font-weight: 700; color: #8e24aa; font-size: 14px;">${clasificacionFeret}</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Categoría según ratio Feret</td>
          </tr>
          <tr style="background: #f3e5f5;">
            <td style="${estiloTd}; font-weight: 600; color: #9c27b0;">Ángulo Feret Máximo</td>
            <td style="${estiloTd}; font-weight: 600; color: #9c27b0;">${feretMaxAngle.toFixed(1)}°</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Ángulo del diámetro Feret máximo</td>
          </tr>
          <tr style="background: #e1bee7;">
            <td style="${estiloTd}; font-weight: 600; color: #9c27b0;">Ángulo Feret Mínimo</td>
            <td style="${estiloTd}; font-weight: 600; color: #9c27b0;">${feretMinAngle.toFixed(1)}°</td>
            <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Ángulo del diámetro Feret mínimo</td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top: 15px; padding: 12px; background: #e8eaf6; border-left: 4px solid #6610f2; border-radius: 4px;">
        <strong>Resumen Morfológico Avanzado:</strong><br>
        • Radio máx/mín: ${ratioRadios.toFixed(2)} | Regularidad: ${(regularidadRadial * 100).toFixed(1)}%<br>
        • ⭐ Estrellamiento: ${clasificacionEstrellamiento} (${indiceEstrellamiento.toFixed(3)})<br>
        • Lobularidad: ${clasificacionLobularidad} (${indiceLobularidad.toFixed(3)})<br>
        • Feret: ${clasificacionFeret} | Max: ${feretMax.toFixed(2)} mm | Min: ${feretMin.toFixed(2)} mm | Ratio: ${feretRatio.toFixed(2)}
      </div>
    `;
}

function generarSeccionClasificacionesIndividuales(metricas, estiloTabla, estiloTh, estiloTd) {
    // ADR-011: robustez de esqueleto estable — si faltan las clasificaciones
    // individuales (según modo), la categoría se rinde igual con "Sin datos"
    // en vez de lanzar y tumbar TODA la tabla.
    const clasif = new Proxy(metricas._clasificaciones_individuales || {}, {
      get: (t, k) => (k in t ? t[k] : 'Sin datos')
    });
    return `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #17a2b8;">
        10. CLASIFICACIONES INDIVIDUALES (Métodos Componentes)
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Método</th>
            <th style="${estiloTh}; width: 60%;">Clasificación</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Radial-Angular (Hull + Distribución)</td>
            <td style="${estiloTd}; color: #4caf50; font-weight: 700;">${clasif.radial_angular}</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Ángulos en Vértices</td>
            <td style="${estiloTd}; color: #2196f3; font-weight: 700;">${clasif.angulos_vertices}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Simetría Bilateral</td>
            <td style="${estiloTd}; color: #9c27b0; font-weight: 700;">${clasif.simetria}</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Tradicional (Circularidad + Aspect)</td>
            <td style="${estiloTd}; color: #ff9800; font-weight: 700;">${clasif.tradicional}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Complejidad del Contorno</td>
            <td style="${estiloTd}; color: #607d8b; font-weight: 700;">${clasif.complejidad}</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Energía de Curvatura</td>
            <td style="${estiloTd}; color: #795548; font-weight: 700;">${clasif.curvatura}</td>
          </tr>
          <tr style="background: #fff3cd; border-left: 4px solid #ffc107;">
            <td style="${estiloTd}; font-weight: 600; font-style: italic;">Convexidad (Validador - No vota)</td>
            <td style="${estiloTd}; color: #e91e63; font-weight: 700; font-style: italic;">${clasif.convexidad}</td>
          </tr>
        </tbody>
      </table>
    `;
}

  /**
   * 12. VÉRTICES Y ÁNGULOS
   */
function generarSeccionVerticesAngulos(metricas, estiloTabla, estiloTh, estiloTd) {
    const numVertices = parseInt(metricas.vertices_aproximados) || 0;
    const anguloMedio = parseFloat(metricas.angulo_medio_vertices) || 0;
    const anguloPredominante = parseFloat(metricas.angulo_predominante) || 0;
    const desviacion = parseFloat(metricas.desviacion_angulos) || 0;
    const angulosRectos = parseInt(metricas.num_angulos_rectos) || 0;
    const angulosAgudos = parseInt(metricas.num_angulos_agudos) || 0;
    const angulosObtusos = parseInt(metricas.num_angulos_obtusos) || 0;
    const geometria = metricas.geometria_vertices || 'No clasificada';
    
    return `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #795548;">
        VII. GEOMETRÍA DE VÉRTICES
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Métrica</th>
            <th style="${estiloTh}; width: 30%;">Valor</th>
            <th style="${estiloTh}; width: 30%;">Interpretación</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #d7ccc8;">
            <td style="${estiloTd}; font-weight: 600;">Número de Vértices</td>
            <td style="${estiloTd}; font-weight: 600; color: #3e2723;">${numVertices}</td>
            <td style="${estiloTd}; font-size: 12px;">Vértices detectados en contorno</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Ángulo Medio</td>
            <td style="${estiloTd}">${anguloMedio.toFixed(1)}°</td>
            <td style="${estiloTd}; font-size: 12px;">Promedio de ángulos internos</td>
          </tr>
          <tr>
            <td style="${estiloTd}">Ángulo Predominante</td>
            <td style="${estiloTd}; color: #0066cc;">${anguloPredominante.toFixed(1)}°</td>
            <td style="${estiloTd}; font-size: 12px;">Ángulo más frecuente</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Desviación de Ángulos</td>
            <td style="${estiloTd}">${desviacion.toFixed(1)}°</td>
            <td style="${estiloTd}; font-size: 12px;">Variabilidad angular</td>
          </tr>
          <tr style="background: #d4edda;">
            <td style="${estiloTd}">Ángulos Rectos (85-95°)</td>
            <td style="${estiloTd}; color: #28a745;">${angulosRectos}</td>
            <td style="${estiloTd}; font-size: 12px;">Esquinas ortogonales</td>
          </tr>
          <tr style="background: #fff3cd;">
            <td style="${estiloTd}">Ángulos Agudos (&lt;85°)</td>
            <td style="${estiloTd}; color: #ffc107;">${angulosAgudos}</td>
            <td style="${estiloTd}; font-size: 12px;">Puntas afiladas</td>
          </tr>
          <tr style="background: #d1ecf1;">
            <td style="${estiloTd}">Ángulos Obtusos (&gt;95°)</td>
            <td style="${estiloTd}; color: #17a2b8;">${angulosObtusos}</td>
            <td style="${estiloTd}; font-size: 12px;">Esquinas redondeadas</td>
          </tr>
          <tr style="background: #e2e3e5;">
            <td style="${estiloTd}; font-weight: 600;">Geometría Inferida</td>
            <td style="${estiloTd}; font-weight: 600;" colspan="2">${geometria}</td>
          </tr>
        </tbody>
      </table>
    `;
}

  /**
   * 13. FORMA 3D INFERIDA
   */
function generarSeccionForma3D(metricas, estiloTabla, estiloTh, estiloTd) {
    const esfericidad = parseFloat(metricas.esfericidad) || 0;
    const forma3D = metricas.forma_3d_inferida || 'No clasificada';
    const oblongacion = parseFloat(metricas.oblongacion) || 0;
    const claseOblongacion = metricas.oblongacion_clasificacion || 'No clasificada';
    const aplanamiento = metricas.aplanamiento_inferido || 'No clasificado';
    
    return `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #607d8b;">
        III-b. Forma 3D Inferida
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Métrica</th>
            <th style="${estiloTh}; width: 30%;">Valor</th>
            <th style="${estiloTh}; width: 30%;">Interpretación</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #cfd8dc;">
            <td style="${estiloTd}; font-weight: 600;">Esfericidad</td>
            <td style="${estiloTd}; font-weight: 600;">${esfericidad.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px;">1.0 = esférico perfecto</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Forma 3D Inferida</td>
            <td style="${estiloTd}" colspan="2"><strong>${forma3D}</strong></td>
          </tr>
          <tr>
            <td style="${estiloTd}">Oblongación</td>
            <td style="${estiloTd}">${oblongacion.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px;">Grado de alargamiento 3D</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Clasificación Oblongación</td>
            <td style="${estiloTd}" colspan="2">${claseOblongacion}</td>
          </tr>
          <tr>
            <td style="${estiloTd}">Aplanamiento Inferido</td>
            <td style="${estiloTd}" colspan="2">${aplanamiento}</td>
          </tr>
        </tbody>
      </table>
    `;
}

  /**
   * 14. CENTROIDE
   */
function generarSeccionCentroide(metricas, estiloTabla, estiloTh, estiloTd) {
    const centroideX = parseFloat(metricas.centroide_x) || 0;
    const centroideY = parseFloat(metricas.centroide_y) || 0;
    const centroideHullX = parseFloat(metricas.centroide_hull_x) || centroideX;
    const centroideHullY = parseFloat(metricas.centroide_hull_y) || centroideY;

    // Factor mm/px para expresar coordenadas en mm (misma fuente que el resto del informe)
    const _ejeMM = parseFloat(metricas.eje_mayor_real_longitud)    || 0;
    const _ejePx = parseFloat(metricas.eje_mayor_real_longitud_px) || 0;
    const factorMM = (_ejeMM > 0 && _ejePx > 0) ? _ejeMM / _ejePx : 0;

    const fmtCoord = (px) => factorMM > 0
      ? `${(px * factorMM).toFixed(2)} mm <span style="color:#999;font-size:11px;">(${px.toFixed(0)} px)</span>`
      : `${px.toFixed(2)} px`;
    const fmtPar = (x, y) => factorMM > 0
      ? `${(x * factorMM).toFixed(2)}, ${(y * factorMM).toFixed(2)} mm`
      : `${x.toFixed(2)}, ${y.toFixed(2)} px`;

    return `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #9e9e9e;">
        VI-c. Centroide y Posición Espacial
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Métrica</th>
            <th style="${estiloTh}; width: 60%;" colspan="2">Valor</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #f5f5f5;">
            <td style="${estiloTd}; font-weight: 600;">Centroide Real (X, Y)</td>
            <td style="${estiloTd}; font-weight: 600;" colspan="2">${fmtPar(centroideX, centroideY)}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Centroide X</td>
            <td style="${estiloTd}" colspan="2">${fmtCoord(centroideX)}</td>
          </tr>
          <tr>
            <td style="${estiloTd}">Centroide Y</td>
            <td style="${estiloTd}" colspan="2">${fmtCoord(centroideY)}</td>
          </tr>
          <tr style="background: #e0e0e0;">
            <td style="${estiloTd}; font-weight: 600;">Centroide Hull (X, Y)</td>
            <td style="${estiloTd}; font-weight: 600;" colspan="2">${fmtPar(centroideHullX, centroideHullY)}</td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top: 10px; padding: 10px; background: #f5f5f5; border-radius: 4px; font-size: 12px; color: #666;">
        <strong>Nota:</strong> El centroide real es el centro de masa del contorno fragmentado.
        El centroide hull es el centro de la envolvente convexa (forma completa estimada).
        ${factorMM > 0 ? 'Coordenadas en mm desde la esquina superior-izquierda de la imagen.' : 'Coordenadas en píxeles de la imagen original.'}
      </div>
    `;
}

  /**
   * 15. CLASIFICACIÓN
   */
function generarSeccionClasificacion(metricas, estiloTabla, estiloTh, estiloTd) {
    const formaDetectada = metricas.forma_detectada || 'No clasificada';
    const formaMeta = metricas.forma_detectada_meta || formaDetectada;
    const formaGeometrica = metricas.forma_geometrica_observada || formaMeta;
    const formaTipologica = metricas.forma_tipologica_inferida || metricas.forma_detectada_tipologica || formaGeometrica;
    const razonTipologica = metricas.forma_razon_tipologica || metricas.razon_tipologica || '';
    const reinterpretacionTipologica = !!metricas.forma_requiere_reinterpretacion_tipologica || (formaTipologica && formaTipologica !== formaGeometrica);
    const categoriaBase = metricas.forma_categoria_base || 'N/A';
    const confianza = confianzaGlobalPorcentaje(metricas);
    const metodosCoincidentes = metricas.forma_metodos_coincidentes || 'N/A';
    const razonamiento = metricas.forma_razonamiento || 'No disponible';
    const claseCircularidad = metricas.shape_class_circularity || 'No clasificada';
    const claseAspect = metricas.shape_class_aspect || 'No clasificada';

    // ── Tipología arqueológica (Fase 2 IA) ──
    const tip = metricas.tipologia;
    let tipologiaHTML = '';
    if (tip && tip.tipo) {
      const tipConf = Math.round((tip.confianza || 0) * 100);
      const tipColor = tip.color?.bg || '#ede7f6';
      const tipBorder = tip.color?.border || '#673ab7';
      const tipText = tip.color?.text || '#4527a0';
      tipologiaHTML = `
      <h3 style="color: #4527a0; margin: 24px 0 12px 0; padding-bottom: 8px; border-bottom: 3px solid #4527a0;">
        XII-a. Tipología Arqueológica — IA Fase 2
      </h3>
      <div style="display:flex; align-items:center; gap:12px; padding:14px 16px; background:${tipColor}; border:2px solid ${tipBorder}; border-radius:8px; margin-bottom:14px;">
        <span style="font-size:28px; line-height:1;">${tip.icono || '🔩'}</span>
        <div style="flex:1;">
          <div style="font-size:16px; font-weight:800; color:${tipText};">${tip.tipo}</div>
          ${tip.subtipo ? `<div style="font-size:13px; color:${tipText}; opacity:0.85;">${tip.subtipo}</div>` : ''}
          <div style="font-size:11px; color:${tipText}; opacity:0.70; margin-top:4px;">${tip.descripcion || ''}</div>
        </div>
        <div style="text-align:right; min-width:52px;">
          <div style="font-size:20px; font-weight:800; color:${tipColor >= 70 ? '#28a745' : tipConf >= 50 ? '#f9a825' : '#e53935'}; color:${tipText};">${tipConf}%</div>
          <div style="font-size:10px; color:${tipText}; opacity:0.65;">confianza</div>
        </div>
      </div>`;
    }
    
    return `${tipologiaHTML}
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #673ab7;">
        XII-b. Clasificación Morfológica Detallada
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Métrica</th>
            <th style="${estiloTh}; width: 60%;" colspan="2">Valor</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #ede7f6;">
            <td style="${estiloTd}; font-weight: 700;">Forma Detectada (Meta-Clasificación)</td>
            <td style="${estiloTd}; font-weight: 700; color: #4527a0; font-size: 15px;" colspan="2">${formaMeta}</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Forma Geométrica Observada</td>
            <td style="${estiloTd}; font-weight: 600; color: #1b5e20;" colspan="2">${formaGeometrica}</td>
          </tr>
          <tr style="background: ${reinterpretacionTipologica ? '#fff8e1' : '#f8f9fa'};">
            <td style="${estiloTd}; font-weight: 600;">Interpretación Tipológica</td>
            <td style="${estiloTd}; font-weight: 700; color: ${reinterpretacionTipologica ? '#e65100' : '#455a64'};" colspan="2">${formaTipologica}</td>
          </tr>
          ${razonTipologica ? `
          <tr>
            <td style="${estiloTd};">Razón Tipológica</td>
            <td style="${estiloTd}; font-size: 12px; line-height: 1.45;" colspan="2">${razonTipologica}</td>
          </tr>
          ` : ''}
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Categoría Base</td>
            <td style="${estiloTd}" colspan="2">${categoriaBase}</td>
          </tr>
          <tr>
            <td style="${estiloTd}; font-weight: 600;">Confianza Global</td>
            <td style="${estiloTd}; font-weight: 600; color: ${confianza >= 70 ? '#28a745' : confianza >= 50 ? '#ffc107' : '#dc3545'};" colspan="2">${confianza}%</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Métodos Coincidentes</td>
            <td style="${estiloTd}" colspan="2">${metodosCoincidentes}</td>
          </tr>
          <tr>
            <td style="${estiloTd}">Clasificación por Circularidad</td>
            <td style="${estiloTd}" colspan="2">${claseCircularidad}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Clasificación por Aspect Ratio</td>
            <td style="${estiloTd}" colspan="2">${claseAspect}</td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top: 15px; padding: 12px; background: #ede7f6; border-left: 4px solid #673ab7; border-radius: 4px;">
        <strong>Razonamiento:</strong> ${razonamiento}
      </div>
    `;
}

  /**
   * 16. PATRÓN DE AGRUPAMIENTO
   */
function generarSeccionPatronAgrupamiento(metricas, estiloTabla, estiloTh, estiloTd) {
    const patron = metricas.patron_agrupamiento || 'Sin perforaciones/horadaciones';
    const patronDetalle = metricas.patron_agrupamiento_patron || 'N/A';
    const detalles = metricas.patron_agrupamiento_detalles || 'No disponible';
    
    // ✅ MEJORADO: Interpretar correctamente la confianza
    const confianzaRaw = parseFloat(metricas.patron_agrupamiento_confianza);
    let confianzaTexto = 'N/A';
    let confianzaColor = '#6c757d';
    let confianzaDescripcion = '';
    
    if (confianzaRaw > 0) {
      confianzaTexto = `${confianzaRaw}%`;
      confianzaDescripcion = 'Certeza del análisis de distribución';
      
      // Color según nivel de confianza
      if (confianzaRaw >= 80) {
        confianzaColor = '#28a745'; // Verde - Alta confianza
      } else if (confianzaRaw >= 60) {
        confianzaColor = '#17a2b8'; // Azul - Confianza moderada
      } else {
        confianzaColor = '#ffc107'; // Amarillo - Confianza baja
      }
    } else {
      confianzaDescripcion = 'No aplicable (sin P/H detectadas)';
    }
    
    return `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #00bcd4;">
        XI. ANÁLISIS COMPARATIVO OBJETO–P/H
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Métrica</th>
            <th style="${estiloTh}; width: 30%;">Valor</th>
            <th style="${estiloTh}; width: 30%;">Descripción</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #b2ebf2;">
            <td style="${estiloTd}; font-weight: 700;">Patrón Detectado</td>
            <td style="${estiloTd}; font-weight: 700; color: #006064; font-size: 14px;" colspan="2">${patron}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Tipo de Patrón</td>
            <td style="${estiloTd}" colspan="2">${patronDetalle}</td>
          </tr>
          <tr>
            <td style="${estiloTd}">Detalles</td>
            <td style="${estiloTd}; font-size: 12px;" colspan="2">${detalles}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Confianza del Análisis</td>
            <td style="${estiloTd}; font-weight: 600; color: ${confianzaColor}; font-size: 16px;">${confianzaTexto}</td>
            <td style="${estiloTd}; font-size: 11px; color: #6c757d;">${confianzaDescripcion}</td>
          </tr>
        </tbody>
      </table>
      ${confianzaRaw > 0 ? `
      <div style="margin-top: 15px; padding: 12px; background: #e0f7fa; border-left: 4px solid #00bcd4; border-radius: 4px;">
        <strong style="font-size: 13px;">ℹ Sobre la Confianza:</strong>
        <div style="margin-top: 8px; font-size: 12px; color: #006064;">
          La <strong>confianza</strong> indica qué tan bien definido está el patrón de distribución espacial.
          Valores altos (≥80%) indican patrones claros como distribución circular regular.
          Valores moderados (60-79%) indican patrones menos uniformes o irregulares.
        </div>
      </div>
      ` : ''}
    `;
}

  /**
   * 17. SÍNTESIS FINAL
   */
function generarSeccionSintesisFinal(metricas, estiloTabla, estiloTh, estiloTd) {
    const sintesis = metricas.clasificacion_sintesis_final || metricas.forma_detectada || 'No clasificada';
    const patron = metricas.patron_agrupamiento || 'Sin patrón P/H';
    
    return `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #ff5722;">
        XII-d. Síntesis Final Integrada
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Clasificación</th>
            <th style="${estiloTh}; width: 60%;" colspan="2">Resultado</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #ffccbc;">
            <td style="${estiloTd}; font-weight: 700;">Clasificación Integrada</td>
            <td style="${estiloTd}; font-weight: 700; color: #bf360c; font-size: 16px;" colspan="2">${sintesis}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Combina</td>
            <td style="${estiloTd}" colspan="2">Forma geométrica + Patrón de P/H</td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top: 15px; padding: 15px; background: #ffccbc; border-left: 4px solid #ff5722; border-radius: 4px;">
        <strong style="font-size: 16px;">RESULTADO FINAL:</strong>
        <div style="margin-top: 10px; font-size: 14px;">
          <strong>Forma:</strong> ${metricas.forma_detectada || 'No clasificada'}<br>
          ${(metricas.forma_tipologica_inferida || metricas.forma_detectada_tipologica) ? `<strong>Interpretación Tipológica:</strong> ${metricas.forma_tipologica_inferida || metricas.forma_detectada_tipologica}<br>` : ''}
          <strong>Patrón:</strong> ${patron}<br>
          <strong>Síntesis:</strong> <span style="color: #bf360c; font-weight: 700;">${sintesis}</span>
        </div>
      </div>
    `;
}

  /**
   * 18. CLASIFICACIONES COMPLEMENTARIAS
   */
function generarSeccionClasificaciones(metricas, estiloTabla, estiloTh, estiloTd) {
    const claseCompacidad = metricas.shape_class_compactness || 'No clasificada';
    const claseSolidez = metricas.shape_class_solidity || metricas.solidity_class || 'No clasificada';
    const claseComplejidad = metricas.shape_class_complexity || 'No clasificada';
    const claseConvexidad = metricas.convexity_class || 'No clasificada';
    const claseFragmentacion = metricas.tipo_fragmento || 'No clasificado';
    
    return `
      <h3 style="color: #495057; margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #3f51b5;">
        XII-c. Clasificaciones Complementarias
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Clasificación</th>
            <th style="${estiloTh}; width: 60%;" colspan="2">Resultado</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #c5cae9;">
            <td style="${estiloTd}">Por Compacidad</td>
            <td style="${estiloTd}" colspan="2">${claseCompacidad}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Por Solidez</td>
            <td style="${estiloTd}" colspan="2">${claseSolidez}</td>
          </tr>
          <tr style="background: #c5cae9;">
            <td style="${estiloTd}">Por Complejidad</td>
            <td style="${estiloTd}" colspan="2">${claseComplejidad}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Por Convexidad</td>
            <td style="${estiloTd}" colspan="2">${claseConvexidad}</td>
          </tr>
          <tr style="background: #c5cae9;">
            <td style="${estiloTd}">Por Fragmentación</td>
            <td style="${estiloTd}" colspan="2">${claseFragmentacion}</td>
          </tr>
        </tbody>
      </table>
    `;
}

  /**
   * 19. MÉTRICAS COMPLEMENTARIAS
   */
function generarSeccionMetricasComplementarias(obj, metricas, estiloTabla, estiloTh, estiloTd) {
    const shapeFactor = parseFloat(metricas.shape_factor_real || metricas.shape_factor) || 0;
    const excentricidad = parseFloat(metricas.excentricidad || metricas.eccentricity) || 0;
    const bbEfficiency = parseFloat(metricas.bounding_box_efficiency) || 0;
    const rectangularidad = parseFloat(metricas.rectangularity || metricas.rectangularidad) || 0;
    const elongacion = parseFloat(metricas.elongation || metricas.elongacion) || 0;
    const porosidad = parseFloat(metricas.porosidad) || 0;
    
    // Leer directamente del objeto: undefined = no evaluado, [] = evaluado ninguna
    const numPerforaciones = (obj.perforaciones && obj.perforaciones.length) || 0;
    const numHoradaciones = (obj.horadaciones && obj.horadaciones.length) || 0;
    const metodoAnalisis = metricas.analysis_method || 'No especificado';
    const timestamp = metricas.analysis_timestamp || 'No disponible';

    // ADR-002 Fase 2: tri-estado P/H. «Sin evaluar» (undefined) NO es lo mismo
    // que «evaluado: ninguna» ([]). Antes ambos se renderizaban como 0/0.00%,
    // exportando un dato falso para piezas con P/H no evaluadas.
    const phEvaluado = Array.isArray(obj.perforaciones) || Array.isArray(obj.horadaciones);
    const phPendiente = '<span class="laar-chip laar-chip--wa laar-chip--lg">Sin evaluar</span>';
    const dispPerforaciones = phEvaluado ? numPerforaciones : phPendiente;
    const dispHoradaciones = phEvaluado ? numHoradaciones : phPendiente;
    
    return `
      <h3 style="color: var(--laar-g800, #374151); margin: 30px 0 15px 0; padding-bottom: 8px; border-bottom: 2px solid var(--laar-g200, #e5e7eb);">
        XI-b. Métricas de Distribución y Contexto P/H
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}; width: 40%;">Métrica</th>
            <th style="${estiloTh}; width: 30%;">Valor</th>
            <th style="${estiloTh}; width: 30%;">Interpretación</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #f3e5f5;">
            <td style="${estiloTd}">Shape Factor</td>
            <td style="${estiloTd}">${shapeFactor.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px;">1.0 = círculo perfecto</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Excentricidad</td>
            <td style="${estiloTd}">${excentricidad.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px;">0.0 = círculo, 1.0 = línea</td>
          </tr>
          <tr style="background: #f3e5f5;">
            <td style="${estiloTd}">Eficiencia Bounding Box</td>
            <td style="${estiloTd}">${bbEfficiency.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px;">Qué tan bien encaja en BB</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Rectangularidad</td>
            <td style="${estiloTd}">${rectangularidad.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px;">Similitud con rectángulo</td>
          </tr>
          <tr style="background: #f3e5f5;">
            <td style="${estiloTd}">Elongación</td>
            <td style="${estiloTd}">${elongacion.toFixed(4)}</td>
            <td style="${estiloTd}; font-size: 12px;">Grado de alargamiento</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Porosidad</td>
            <td style="${estiloTd}">${phEvaluado ? porosidad.toFixed(2) + '%' : phPendiente}</td>
            <td style="${estiloTd}; font-size: 12px;">${phEvaluado ? '% de área con P/H' : 'Pendiente de evaluación P/H'}</td>
          </tr>
          <tr style="background: #f3e5f5;">
            <td style="${estiloTd}; font-weight: 600;">Total Perforaciones</td>
            <td style="${estiloTd}; font-weight: 600; font-size: 18px;">${dispPerforaciones}</td>
            <td style="${estiloTd}; font-size: 12px;">${phEvaluado ? 'Orificios pasantes' : 'Pendiente de evaluación P/H'}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}; font-weight: 600;">Total Horadaciones</td>
            <td style="${estiloTd}; font-weight: 600; font-size: 18px;">${dispHoradaciones}</td>
            <td style="${estiloTd}; font-size: 12px;">${phEvaluado ? 'Concavidades ciegas' : 'Pendiente de evaluación P/H'}</td>
          </tr>
          <tr style="background: #f3e5f5;">
            <td style="${estiloTd}">Método de Análisis</td>
            <td style="${estiloTd}; font-size: 11px;" colspan="2">${metodoAnalisis}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="${estiloTd}">Timestamp</td>
            <td style="${estiloTd}; font-size: 11px;" colspan="2">${timestamp.substring(0, 19).replace('T', ' ')}</td>
          </tr>
        </tbody>
      </table>
    `;
}

// contarMetricas ya exportada en línea 186 — duplicado eliminado

