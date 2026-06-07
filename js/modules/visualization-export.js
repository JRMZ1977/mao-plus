/**
 * VISUALIZATION & EXPORT MODULE - visualization-export.js
 * ==========================================================================
 *
 * Extracted from analysis-core.js (lines 23116-26502, ~3,387 lines)
 * Module handles all visualization and export functionality for morphological analysis
 *
 * PUBLIC FUNCTIONS:
 * - mostrarAnalisisMorfologico(obj, metricas, imagenEspecifica)
 * - generarCanvasEsquematico(obj, metricas)
 * - exportarAnalisisMorfologico(obj, metricas)
 * - generarJSON(obj, metricas)
 * - validarCoherenciaPreexportacion(obj, metricas, modo)
 *
 * MODULE DEPENDENCIES:
 * - Morphometric Metrics Module (./morphometric-metrics.js)
 * - Classification Engine Module (./classification-engine.js)
 * - Contour Quality Module (./contour-quality.js)
 * - Geometry Primitives Module (./geometry-primitives.js)
 * - Utility Helpers Module (./utility-helpers.js)
 *
 * EXTERNAL LIBRARIES:
 * - html2canvas (Canvas to image conversion for PDF)
 * - jsPDF (PDF generation)
 *
 * DOM ELEMENTS ACCESSED:
 * - morphologicalCanvas, schematicCanvas, idealizedShapeCanvas
 * - morphologicalMetrics, morphologicalAnalysisContainer
 * - schematicCanvasContainer, idealizedShapeContainer
 * - Various form inputs (focalInput, sensorWidthInput, distanciaInput, etc.)
 *
 * GLOBAL WINDOW STATE:
 * - window.currentAnalyzedObject
 * - window._imagenActivaMorfologico
 * - window.maoActivatePanel
 * - window.escalaCorregida
 * - window.archivoRAWActual, window.archivoJPGActual
 * - Image references: imageCaraA, imageCaraB, image
 *
 * ==========================================================================
 */

// ============================================================================
// IMPORTS & DEPENDENCY MANAGEMENT
// ============================================================================
import * as MM from './morphometric-metrics.js';
import * as CE from './classification-engine.js';
import * as CQ from './contour-quality.js';
import * as GP from './geometry-primitives.js';
import * as UH from './utility-helpers.js';
import { generarTablaMetricasCompleta as _generarTablaMetricasCompleta } from './tabla-metricas-completa.js';

// ============================================================================
// PUBLIC API - ES6 EXPORT STATEMENTS (Functions extracted from analysis-core.js)
// ============================================================================

/**
 * Genera el HTML de la tabla de métricas completa - REEXPORTADA desde tabla-metricas-completa.js
 * Orquesta todas las secciones generadoras en una visualización coherente
 * @param {Object} obj - Objeto analizado
 * @param {Object} metricas - Métricas calculadas
 * @returns {string} - HTML de la tabla completa
 */
export const generarTablaMetricasCompleta = _generarTablaMetricasCompleta;
export function mostrarAnalisisMorfologico(obj, metricas, imagenEspecifica = null) {
    console.log(`📊 DEBUG mostrarAnalisisMorfologico - Iniciando visualización:`);
    console.log(`   - Objeto ID: ${obj?.id}`);
    console.log(`   - Dimensiones obj: ${obj?.width}x${obj?.height}`);
    console.log(`   - metricas recibidas:`, metricas);
    console.log(`   - has_real_contour: ${obj?.has_real_contour}`);
    console.log(`   - contour_points length: ${obj?.contour_points?.length || 0}`);
    console.log(`   - imagen específica recibida: ${!!imagenEspecifica}`);
    console.log(`   - cara del objeto: ${obj?.cara || 'mono'}`);
    
    // ============================================================================
    // 🔶 CALCULAR CONVEX HULL SI NO EXISTE
    // ============================================================================
    // Si el usuario va directo a análisis morfológico sin pasar por debug canvas,
    // el Convex Hull no estará calculado. Lo calculamos aquí.
    if (!obj.convexHull && obj.contour_points && obj.contour_points.length >= 3) {
      console.log(`🔶 Calculando Convex Hull (no existe en obj.convexHull)...`);
      
      // Función auxiliar para obtener coordenadas (soporta {x,y} y [x,y])
      const getX = (p) => p.x !== undefined ? p.x : p[0];
      const getY = (p) => p.y !== undefined ? p.y : p[1];
      
      // Convertir contorno a coordenadas relativas (0,0 = esquina superior izquierda del objeto)
      const contornoRelativo = obj.contour_points.map(p => {
        const x = getX(p) - obj.minX;
        const y = getY(p) - obj.minY;
        return [x, y];
      });
      
      // Calcular Convex Hull
      const convexHull = GeometryPrimitives.calcularConvexHull(contornoRelativo);
      
      if (convexHull && convexHull.length >= 3) {
        obj.convexHull = convexHull;
        console.log(`   ✅ Convex Hull calculado: ${convexHull.length} vértices`);
        console.log(`   📊 Reducción: ${((1 - convexHull.length / obj.contour_points.length) * 100).toFixed(1)}%`);
      } else {
        console.warn(`   ⚠️ No se pudo calcular Convex Hull`);
      }
    } else if (obj.convexHull) {
      console.log(`   ✅ Convex Hull ya existe: ${obj.convexHull.length} vértices`);
    }
    
    // Determinar qué imagen usar (prioridad: imagenEspecifica > imagen de cara > imagen global)
    const imagenAUsar = imagenEspecifica || 
                        (obj.cara === 'A' ? imageCaraA : (obj.cara === 'B' ? imageCaraB : image)) ||
                        image;
    
    // Exponer la imagen activa para que guardarAnalisisMorfologico pueda capturar el recorte
    window._imagenActivaMorfologico = imagenAUsar;
    
    console.log(`   ✅ Imagen a usar: ${imagenAUsar === imageCaraA ? 'Cara A' : (imagenAUsar === imageCaraB ? 'Cara B' : 'Global')}`);
    
    // Mostrar container de análisis morfológico y asegurar que el panel maestro sea visible.
    // IMPORTANTE: usar 'morphologicalAnalysisContainer' (no 'resultadosPanel') para que
    // activatePanel llame también a activateTab() y elimine la clase res-hidden que aplica
    // display:none !important — de lo contrario el container quedaría invisible aunque
    // resultadosPanel esté visible.
    if (typeof window.maoActivatePanel === 'function') {
      window.maoActivatePanel('morphologicalAnalysisContainer');
    }
    morphologicalAnalysisContainer.style.display = 'block';
    
    // Configurar canvas morfológico
    if (!morphologicalCtx) {
      morphologicalCtx = morphologicalCanvas.getContext('2d');
    }
    
    // ESCALADO DINÁMICO: Calcular dimensiones óptimas del canvas
    const containerElement = document.getElementById('morphologicalCanvasContainer');
    const maxCanvasWidth = containerElement ? (containerElement.offsetWidth - 40) : 600; // -40px para padding
    const maxCanvasHeight = 500; // Altura máxima disponible
    
    // Calcular la escala para ajustar el objeto al espacio disponible
    const scaleX = maxCanvasWidth / obj.width;
    const scaleY = maxCanvasHeight / obj.height;
    const scale = Math.min(scaleX, scaleY, 3); // Máximo 3x de ampliación, mínimo ajustado al contenedor
    
    // Dimensiones escaladas del canvas
    const scaledWidth = Math.floor(obj.width * scale);
    const scaledHeight = Math.floor(obj.height * scale);
    
    // Redimensionar canvas (tamaño interno permanece igual para precisión)
    morphologicalCanvas.width = obj.width;
    morphologicalCanvas.height = obj.height;
    
    // Aplicar tamaño CSS para visualización escalada
    morphologicalCanvas.style.width = `${scaledWidth}px`;
    morphologicalCanvas.style.height = `${scaledHeight}px`;
    
    // Actualizar indicador de escala
    const scaleInfoElement = document.getElementById('morphologicalScaleInfo');
    if (scaleInfoElement) {
      // Mostrar dimensiones en mm si hay factor de conversión disponible
      const m = obj.metricas || {};
      const ejeMM = m.eje_mayor_real_longitud || 0;
      const ejePx = m.eje_mayor_real_longitud_px || 0;
      const factorMM = (ejeMM > 0 && ejePx > 0) ? ejeMM / ejePx : null;
      if (factorMM) {
        const wMM = (obj.width * factorMM).toFixed(1);
        const hMM = (obj.height * factorMM).toFixed(1);
        scaleInfoElement.textContent = `${wMM}×${hMM} mm`;
      } else {
        scaleInfoElement.textContent = `${obj.width}×${obj.height}px • Escala: ${scale.toFixed(2)}x`;
      }
    }
    
    // Actualizar título con ID del objeto
    const objectTitleElement = document.getElementById('morphologicalObjectTitle');
    if (objectTitleElement) {
      const idObjeto = obj.id || `OBJ_${obj.numeroObjeto || '??'}`;
      
      // Agregar información de cara si es bifacial
      let tituloCompleto = `<strong style="color: #0066cc;">${idObjeto}</strong>`;
      if (obj.cara) {
        const caraIcono = obj.cara === 'A'? '': '';
        const caraNombre = obj.cara === 'A' ? 'Anverso' : 'Reverso';
        tituloCompleto += ` - <strong style="color: ${obj.cara === 'A' ? '#17a2b8' : '#28a745'};">${caraIcono} CARA ${obj.cara} (${caraNombre})</strong>`;
      }
      tituloCompleto += ` - Análisis Morfológico (Convex Hull)`;
      
      objectTitleElement.innerHTML = tituloCompleto;
    }
    
    console.log(`📐 Escalado Morfológico: ${obj.width}x${obj.height} -> ${scaledWidth}x${scaledHeight} (escala: ${scale.toFixed(2)}x)`);
    console.log(`🏷️ ID Objeto: ${obj.id || 'Sin ID'}`);
    
    // Dibujar el objeto en el canvas morfológico
    // Guard: verificar que la imagen esté completamente cargada; si no lo está,
    // desencadenar un reintento automático cuando termine de cargar.
    // Fallback para objetos 3D sin imagen 2D: permitir dibujo con fondo neutro.
    const _fromObj3dSinImagen = !imagenAUsar && !!obj._fromObj3d;
    const _imagenListaParaDibujar = _fromObj3dSinImagen || (imagenAUsar &&
      (imagenAUsar === window._tempImagenObjetoRecortado ||
       !(imagenAUsar instanceof HTMLImageElement) ||
       (imagenAUsar.complete && imagenAUsar.naturalWidth > 0)));

    if (!_imagenListaParaDibujar && imagenAUsar instanceof HTMLImageElement && !imagenAUsar.complete) {
      // La imagen existe pero todavía está cargando — programar reintento único
      console.warn(`⚠️ [mostrarAnalisis] Imagen aún no cargada para ${obj?.id}. Reintentar al completar carga.`);
      imagenAUsar.addEventListener('load', () => {
        VisualizationExport.mostrarAnalisisMorfologico(obj, metricas, imagenEspecifica);
      }, { once: true });
    }

    if (_imagenListaParaDibujar) {
      try {
        // Ajustar anchos de línea según el tamaño del objeto (para objetos pequeños, líneas más finas)
        const baseLineWidth = Math.max(1, Math.min(3, obj.width / 200));
        
        // Limpiar canvas
        morphologicalCtx.clearRect(0, 0, morphologicalCanvas.width, morphologicalCanvas.height);
        
        // Dibujar fondo blanco
        morphologicalCtx.fillStyle = '#ffffff';
        morphologicalCtx.fillRect(0, 0, morphologicalCanvas.width, morphologicalCanvas.height);
        
        // Dibujar el objeto recortado usando la imagen específica
        console.log(`🎨 DEBUG: Dibujando objeto en canvas morfológico:`);
        console.log(`   - Imagen a usar: ${imagenAUsar === imageCaraA ? 'imageCaraA' : (imagenAUsar === imageCaraB ? 'imageCaraB' : imagenAUsar === window._tempImagenObjetoRecortado ? 'IMAGEN RECORTADA' : 'image global')}`);
        console.log(`   - Dimensiones imagen: ${imagenAUsar?.width || 'N/A'}x${imagenAUsar?.height || 'N/A'}`);
        console.log(`   - obj.minX: ${obj.minX}, obj.minY: ${obj.minY}`);
        console.log(`   - obj.width: ${obj.width}, obj.height: ${obj.height}`);
        console.log(`   - obj.cara: ${obj.cara || 'mono'}`);
        console.log(`   - Canvas morfológico: ${morphologicalCanvas.width}x${morphologicalCanvas.height}`);
        
        // 🔧 DETECTAR SI ES IMAGEN RECORTADA o IMAGEN COMPLETA
        const esImagenRecortada = imagenAUsar === window._tempImagenObjetoRecortado;
        
        if (_fromObj3dSinImagen) {
          // Objeto 3D sin imagen 2D: fondo neutro para que el contorno sea visible
          console.log(`   🧱 Objeto 3D sin imagen 2D — dibujando fondo neutro`);
          morphologicalCtx.fillStyle = '#e9ecef';
          morphologicalCtx.fillRect(0, 0, obj.width, obj.height);
        } else if (esImagenRecortada) {
          // Es una imagen ya recortada del objeto - dibujar directamente sin offset
          console.log(`   📸 Usando imagen recortada - dibujando sin offsets`);
          morphologicalCtx.drawImage(
            imagenAUsar,
            0, 0, imagenAUsar.width, imagenAUsar.height,  // Fuente: toda la imagen
            0, 0, obj.width, obj.height                   // Destino: canvas completo
          );
        } else {
          // Es una imagen completa - recortar usando minX/minY
          console.log(`   🖼️ Usando imagen completa - recortando con offset (${obj.minX}, ${obj.minY})`);
          morphologicalCtx.drawImage(
            imagenAUsar,
            obj.minX, obj.minY, obj.width, obj.height,    // Fuente: recorte
            0, 0, obj.width, obj.height                   // Destino: canvas completo
          );
        }
        
        console.log(`   ✅ Objeto dibujado en canvas morfológico`);
        
        // Dibujar bounding box original
        morphologicalCtx.strokeStyle = '#ff0000';
        morphologicalCtx.lineWidth = baseLineWidth * 0.8;
        morphologicalCtx.strokeRect(0, 0, obj.width, obj.height);
        
        console.log(`🖼️ DEBUG Canvas Morfológico - Estado de métricas:`);
        console.log(`   - metricas existe: ${!!metricas}`);
        console.log(`   - metricas._contour_data existe: ${!!metricas._contour_data}`);
        if (metricas._contour_data) {
          console.log(`   - metricas._contour_data.points existe: ${!!metricas._contour_data.points}`);
          console.log(`   - Número de puntos: ${metricas._contour_data.points?.length || 0}`);
        }
        
        // Dibujar contorno real si está disponible
        if (metricas._contour_data && metricas._contour_data.points) {
          const contorno = metricas._contour_data.points;
          
          console.log(`🎨 DEBUG Canvas Morfológico - Dibujando contorno:`);
          console.log(`   - Puntos del contorno: ${contorno.length}`);
          console.log(`   - Tamaño canvas interno: ${morphologicalCanvas.width}x${morphologicalCanvas.height}`);
          console.log(`   - Tamaño canvas visual: ${scaledWidth}x${scaledHeight}`);
          console.log(`   - Tamaño objeto: ${obj.width}x${obj.height}`);
          console.log(`   - Offset objeto: (${obj.minX}, ${obj.minY})`);
          console.log(`   - Primer punto (absoluto):`, contorno[0]);
          console.log(`   - Último punto (absoluto):`, contorno[contorno.length - 1]);
          
          // Función auxiliar para obtener coordenadas (soporta {x,y} y [x,y])
          const getX = (p) => p.x !== undefined ? p.x : p[0];
          const getY = (p) => p.y !== undefined ? p.y : p[1];
          
          // CRÍTICO: Los puntos del contorno están en coordenadas ABSOLUTAS (respecto a la imagen completa)
          // Pero el canvas morfológico muestra solo el recorte del objeto (0,0 = esquina superior izquierda del objeto)
          // Por lo tanto, necesitamos RESTAR el offset (obj.minX, obj.minY) para convertir a coordenadas relativas
          
          morphologicalCtx.strokeStyle = '#00ff00';
          morphologicalCtx.lineWidth = baseLineWidth * 1.2;
          morphologicalCtx.beginPath();
          
          if (contorno.length > 0) {
            // Convertir primer punto a coordenadas relativas
            const x0 = getX(contorno[0]) - obj.minX;
            const y0 = getY(contorno[0]) - obj.minY;
            console.log(`   - Primer punto (relativo): (${x0}, ${y0})`);
            morphologicalCtx.moveTo(x0, y0);
            
            for (let i = 1; i < contorno.length; i++) {
              // Convertir cada punto a coordenadas relativas
              const xi = getX(contorno[i]) - obj.minX;
              const yi = getY(contorno[i]) - obj.minY;
              morphologicalCtx.lineTo(xi, yi);
            }
            morphologicalCtx.closePath();
            console.log(`   - Trazado completado con ${contorno.length} puntos (convertidos a coordenadas relativas)`);
          }
          morphologicalCtx.stroke();
          console.log(`✅ Contorno dibujado en canvas morfológico`);
          
          // ============================================================================
          // DIBUJAR CONVEX HULL (Envolvente Convexa) - NARANJA PUNTEADO
          // ============================================================================
          // Reutilizamos el Convex Hull ya calculado en el canvas de debug
          // Está almacenado en obj.convexHull (coordenadas ya en sistema del canvas)
          
          if (obj.convexHull && obj.convexHull.length >= 3) {
            const hull = obj.convexHull;
            
            console.log(`🔶 Dibujando Convex Hull en canvas morfológico (${hull.length} vértices)...`);
            console.log(`   📊 Origen: Reutilizando hull del canvas de debug (obj.convexHull)`);
            console.log(`   🎨 Canvas: ${morphologicalCanvas.width}x${morphologicalCanvas.height}`);
            console.log(`   🔍 Primer vértice: [${hull[0][0]}, ${hull[0][1]}]`);
            
            // Estilo: NARANJA PUNTEADO (mismo que debug)
            morphologicalCtx.strokeStyle = '#ff8800';  // Naranja brillante
            morphologicalCtx.lineWidth = baseLineWidth * 1.5;
            morphologicalCtx.setLineDash([8, 4]); // Línea punteada: 8px línea, 4px espacio
            morphologicalCtx.beginPath();
            
            // _hullIsAbsolute=true → coords absolutas de la imagen → restar minX/minY para el canvas relativo
            // _hullIsAbsolute no definido (cálculo JS debug) → coords ya relativas al bbox → usar directo
            const hullOffX = obj._hullIsAbsolute ? (obj.minX || 0) : 0;
            const hullOffY = obj._hullIsAbsolute ? (obj.minY || 0) : 0;
            morphologicalCtx.moveTo(hull[0][0] - hullOffX, hull[0][1] - hullOffY);
            
            for (let i = 1; i < hull.length; i++) {
              morphologicalCtx.lineTo(hull[i][0] - hullOffX, hull[i][1] - hullOffY);
            }
            morphologicalCtx.closePath();
            morphologicalCtx.stroke();
            morphologicalCtx.setLineDash([]); // Restaurar línea sólida
            
            console.log(`✅ Convex hull dibujado (${hull.length} vértices, naranja punteado)`);
          } else {
            console.warn(`⚠️ Convex hull NO disponible para dibujar en canvas morfológico`);
            console.warn(`   - obj.convexHull existe: ${!!obj.convexHull}`);
            console.warn(`   - obj.convexHull.length: ${obj.convexHull?.length || 0}`);
          }
          
          // ============================================================================
          // 🆕 DIBUJAR CENTROIDE DEL CONVEX HULL (FORMA COMPLETA ESTIMADA)
          // ============================================================================
          // IMPORTANTE: Se dibuja el centroide del Convex Hull, NO del contorno fragmentado
          // Razón: El Convex Hull representa la forma original completa del objeto antes 
          //        de fragmentarse, por lo que su centroide es más representativo de la
          //        geometría arqueológica original que el centroide del fragmento actual.
          //
          // Uso en métricas: Este centroide se usa como origen para:
          //   - Cálculo de radios máximo/mínimo
          //   - Trazado de ejes mayor/menor
          //   - Análisis de simetría y regularidad radial
          //   - Clasificación geométrica (circularidad, elongación, etc.)
          // ============================================================================
          
          // Dibujar CENTROIDE del Convex Hull (forma completa estimada) - NARANJA
          // Fuente prioritaria: _contour_data.metrics (análisis completo o AIA con hull calculado)
          // Fallback: centroide_hull_x/y (siempre disponible en objetos AIA e inyectados)
          const _cdm = metricas._contour_data?.metrics;
          const centroidHull = _cdm?.centroid_hull || _cdm?.centroid ||
            (metricas.centroide_hull_x != null
              ? [parseFloat(metricas.centroide_hull_x), parseFloat(metricas.centroide_hull_y)]
              : [parseFloat(metricas.centroide_x) || (obj.minX + obj.width / 2),
                 parseFloat(metricas.centroide_y) || (obj.minY + obj.height / 2)]);
          const centroidX = centroidHull[0] - obj.minX;
          const centroidY = centroidHull[1] - obj.minY;
          
          morphologicalCtx.fillStyle = '#ff6600'; // Naranja
          morphologicalCtx.beginPath();
          morphologicalCtx.arc(centroidX, centroidY, baseLineWidth * 2.5, 0, 2 * Math.PI);
          morphologicalCtx.fill();
          
          // Borde blanco para mejor contraste
          morphologicalCtx.strokeStyle = '#ffffff';
          morphologicalCtx.lineWidth = baseLineWidth * 0.6;
          morphologicalCtx.stroke();
          
          console.log(`✅ Centroide del Convex Hull (forma completa) dibujado en (${centroidX.toFixed(1)}, ${centroidY.toFixed(1)}) - NARANJA`);
          console.log(`   📊 Coordenadas absolutas: [${centroidHull[0].toFixed(2)}, ${centroidHull[1].toFixed(2)}]`);
          
          // ============================================================================
          // 🆕 DIBUJAR EJES MAYOR Y MENOR REALES (RECORTADOS DENTRO DEL CONTORNO)
          // ============================================================================
          
          if (metricas.eje_mayor_p1_recortado && metricas.eje_menor_p1_recortado) {
            // Dibujar EJE MAYOR (rojo) - solo dentro del contorno
            const ejeMayorP1X = metricas.eje_mayor_p1_recortado[0] - obj.minX;
            const ejeMayorP1Y = metricas.eje_mayor_p1_recortado[1] - obj.minY;
            const ejeMayorP2X = metricas.eje_mayor_p2_recortado[0] - obj.minX;
            const ejeMayorP2Y = metricas.eje_mayor_p2_recortado[1] - obj.minY;
            
            morphologicalCtx.strokeStyle = '#ff0000';
            morphologicalCtx.lineWidth = baseLineWidth * 1.2;
            morphologicalCtx.setLineDash([10, 5]);
            morphologicalCtx.beginPath();
            morphologicalCtx.moveTo(ejeMayorP1X, ejeMayorP1Y);
            morphologicalCtx.lineTo(ejeMayorP2X, ejeMayorP2Y);
            morphologicalCtx.stroke();
            morphologicalCtx.setLineDash([]);
            
            console.log(`✅ Eje MAYOR real dibujado (recortado): (${ejeMayorP1X.toFixed(1)}, ${ejeMayorP1Y.toFixed(1)}) → (${ejeMayorP2X.toFixed(1)}, ${ejeMayorP2Y.toFixed(1)})`);
            
            // Dibujar EJE MENOR (verde) - solo dentro del contorno
            const ejeMenorP1X = metricas.eje_menor_p1_recortado[0] - obj.minX;
            const ejeMenorP1Y = metricas.eje_menor_p1_recortado[1] - obj.minY;
            const ejeMenorP2X = metricas.eje_menor_p2_recortado[0] - obj.minX;
            const ejeMenorP2Y = metricas.eje_menor_p2_recortado[1] - obj.minY;
            
            morphologicalCtx.strokeStyle = '#00ff00';
            morphologicalCtx.lineWidth = baseLineWidth * 1.2;
            morphologicalCtx.setLineDash([10, 5]);
            morphologicalCtx.beginPath();
            morphologicalCtx.moveTo(ejeMenorP1X, ejeMenorP1Y);
            morphologicalCtx.lineTo(ejeMenorP2X, ejeMenorP2Y);
            morphologicalCtx.stroke();
            morphologicalCtx.setLineDash([]);
            
            console.log(`✅ Eje MENOR real dibujado (recortado): (${ejeMenorP1X.toFixed(1)}, ${ejeMenorP1Y.toFixed(1)}) → (${ejeMenorP2X.toFixed(1)}, ${ejeMenorP2Y.toFixed(1)})`);
          }
          
          // ============================================================================
          // 🆕 DIBUJAR RADIOS MÁXIMO Y MÍNIMO
          // ============================================================================
          
          if (metricas.punto_radio_maximo && metricas.punto_radio_minimo) {
            // Usar centroide del Convex Hull (forma completa) si está disponible
            const _cdmR = metricas._contour_data?.metrics;
            const centroidHull = _cdmR?.centroid_hull;
            const centroidReal = _cdmR?.centroid_real || _cdmR?.centroid;
            const centroidParaDibujo = centroidHull || centroidReal ||
              (metricas.centroide_hull_x != null
                ? [parseFloat(metricas.centroide_hull_x), parseFloat(metricas.centroide_hull_y)]
                : [parseFloat(metricas.centroide_x) || (obj.minX + obj.width / 2),
                   parseFloat(metricas.centroide_y) || (obj.minY + obj.height / 2)]);
            
            const centroidX = centroidParaDibujo[0] - obj.minX;
            const centroidY = centroidParaDibujo[1] - obj.minY;
            
            // Radio MÁXIMO (azul cielo)
            const puntoMaxX = metricas.punto_radio_maximo[0] - obj.minX;
            const puntoMaxY = metricas.punto_radio_maximo[1] - obj.minY;
            
            morphologicalCtx.strokeStyle = '#00bfff'; // Azul cielo (deep sky blue)
            morphologicalCtx.lineWidth = baseLineWidth * 1.2;
            morphologicalCtx.setLineDash([5, 3]);
            morphologicalCtx.beginPath();
            morphologicalCtx.moveTo(centroidX, centroidY);
            morphologicalCtx.lineTo(puntoMaxX, puntoMaxY);
            morphologicalCtx.stroke();
            
            // Marcar punto extremo del radio máximo
            morphologicalCtx.fillStyle = '#00bfff';
            morphologicalCtx.beginPath();
            morphologicalCtx.arc(puntoMaxX, puntoMaxY, baseLineWidth * 2, 0, 2 * Math.PI);
            morphologicalCtx.fill();
            morphologicalCtx.setLineDash([]);
            
            // Radio MÍNIMO (magenta/rosa)
            const puntoMinX = metricas.punto_radio_minimo[0] - obj.minX;
            const puntoMinY = metricas.punto_radio_minimo[1] - obj.minY;
            
            morphologicalCtx.strokeStyle = '#ff1493'; // Magenta/rosa (deep pink)
            morphologicalCtx.lineWidth = baseLineWidth * 1.2;
            morphologicalCtx.setLineDash([5, 3]);
            morphologicalCtx.beginPath();
            morphologicalCtx.moveTo(centroidX, centroidY);
            morphologicalCtx.lineTo(puntoMinX, puntoMinY);
            morphologicalCtx.stroke();
            
            // Marcar punto extremo del radio mínimo
            morphologicalCtx.fillStyle = '#ff1493';
            morphologicalCtx.beginPath();
            morphologicalCtx.arc(puntoMinX, puntoMinY, baseLineWidth * 2, 0, 2 * Math.PI);
            morphologicalCtx.fill();
            morphologicalCtx.setLineDash([]);
            
            console.log(`✅ Radio MÁXIMO dibujado (azul): ${metricas.radio_maximo} px`);
            console.log(`✅ Radio MÍNIMO dibujado (magenta): ${metricas.radio_minimo} px`);
          }
          
          console.log(`✅ Centroide, ejes y radios dibujados en canvas morfológico`);
        }
        
        console.log(`🖼️ Objeto ${obj.id} dibujado en canvas morfológico`);
      } catch (error) {
        console.error('Error dibujando objeto en canvas morfológico:', error);
      }
    } else if (!_imagenListaParaDibujar) {
      // Imagen no disponible — intentar restaurar canvas desde backup inmediatamente
      const _backupMorph = obj.canvasImgenes?.morphological ||
                           obj.analisisCached?.canvasData?.morphological;
      if (_backupMorph) {
        const _bkImg = new Image();
        _bkImg.onload = () => {
          morphologicalCtx.clearRect(0, 0, morphologicalCanvas.width, morphologicalCanvas.height);
          morphologicalCtx.drawImage(_bkImg, 0, 0,
            morphologicalCanvas.width, morphologicalCanvas.height);
          console.log(`📸 [mostrarAnalisis] Canvas morfológico restaurado desde backup para ${obj.id}`);
        };
        _bkImg.src = _backupMorph;
      }
    }
    
    // ============================================================================
    // 🆕 GENERAR HTML REORGANIZADO - CARACTERIZACIÓN MORFOMÉTRICA LÓGICA
    // Estructura sin duplicaciones y secuencia coherente
    // ============================================================================
    let metricsHTML = `
      <div class="morphological-metric">
        <span class="label">ID del Objeto:</span>
        <span class="value">${metricas.object_id}</span>
      </div>
      
      <div class="morphological-metric">
        <span class="label">Método de Análisis:</span>
        <span class="value" style="color: ${metricas.contour_extraction_successful ? '#28a745' : '#dc3545'};">
          ${metricas.analysis_method}
        </span>
      </div>
      
      <h5 style="color: #e65100; margin: 20px 0 10px 0; border-bottom: 2px solid #ff8800; padding-bottom: 5px; font-size: 1.1em;">DIMENSIONES BÁSICAS</h5>
        <div style="background: #fff3e0; padding: 8px; border-left: 4px solid #ff8800; border-radius: 4px; margin: 5px 0; font-size: 0.85em;">
          Medidas basadas en Convex Hull que representa la forma original completa (en ${metricas.area_unit === 'mm²' ? 'milímetros' : 'píxeles'}).
        </div>`;
      
    if (metricas.contour_extraction_successful) {
      metricsHTML += `
        <div class="morphological-metric has-tooltip" data-metric="area" style="background: #fff3e0; padding: 8px; border-radius: 4px; margin: 5px 0;">
          <span class="label">Área:</span>
          <span class="value" style="font-weight: bold; color: #e65100; font-size: 1.15em;">${metricas.area} ${metricas.area_unit}</span>
        </div>
        
        <div class="morphological-metric has-tooltip" data-metric="perimetro" style="background: #fff3e0; padding: 8px; border-radius: 4px; margin: 5px 0;">
          <span class="label">Perímetro:</span>
          <span class="value" style="font-weight: bold; color: #e65100; font-size: 1.15em;">${metricas.perimeter} ${metricas.perimeter_unit}</span>
        </div>
        
        <div class="morphological-metric">
          <span class="label">Eje Mayor / Eje Menor:</span>
          <span class="value">${metricas.eje_mayor_real_longitud || metricas.eje_mayor} / ${metricas.eje_menor_real_longitud || metricas.eje_menor} ${metricas.perimeter_unit}</span>
        </div>
        
        <div class="morphological-metric has-tooltip" data-metric="centroide">
          <span class="label">Centroide (Cx, Cy):</span>
          <span class="value">(${metricas.centroide_hull_x || metricas.centroide_x}, ${metricas.centroide_hull_y || metricas.centroide_y})</span>
        </div>
        
        <div class="morphological-metric has-tooltip" data-metric="excentricidad">
          <span class="label">Excentricidad:</span>
          <span class="value">${metricas.excentricidad}</span>
        </div>
        
        <!-- SECCIÓN DE RADIOS -->
        <div style="background: #f0f2f5; padding: 12px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #2196f3;">
          <h6 style="color: #1565c0; margin: 0 0 10px 0; font-size: 1.05em;">Análisis Radial (desde centroide del Convex Hull)</h6>
          
          <div class="morphological-metric has-tooltip" data-metric="radio_maximo">
            <span class="label">Radio Máximo:</span>
            <span class="value" style="color: #00bfff; font-weight: bold;">${metricas.radio_maximo ?? '—'} ${metricas.perimeter_unit}</span>
          </div>
          
          <div class="morphological-metric has-tooltip" data-metric="radio_minimo">
            <span class="label">Radio Mínimo:</span>
            <span class="value" style="color: #ff1493; font-weight: bold;">${metricas.radio_minimo ?? '—'} ${metricas.perimeter_unit}</span>
          </div>
          
          <div class="morphological-metric has-tooltip" data-metric="radio_medio">
            <span class="label">Radio Medio:</span>
            <span class="value">${metricas.radio_medio ?? '—'} ${metricas.perimeter_unit}</span>
          </div>
          
          <div class="morphological-metric has-tooltip" data-metric="ratio_radios" style="background: #fff; padding: 8px; border-radius: 4px; margin: 8px 0;">
            <span class="label">Ratio de Radios (Rmin/Rmax):</span>
            <span class="value" style="font-weight: bold; color: #1565c0;">${metricas.ratio_radios ?? '—'}</span>
          </div>
          
          <div class="morphological-metric">
            <span class="label">Regularidad Radial:</span>
            <span class="value">${metricas.regularidad_radial ?? '—'}% ${parseFloat(metricas.regularidad_radial) >= 90 ? '(Muy regular)' : parseFloat(metricas.regularidad_radial) >= 75 ? '(Regular)' : parseFloat(metricas.regularidad_radial) >= 60 ? '(Irregular)' : '(Muy irregular)'}</span>
          </div>
          
          <div class="morphological-metric">
            <span class="label">Desviación Radial:</span>
            <span class="value">${metricas.desviacion_radial ?? '—'} ${metricas.perimeter_unit}</span>
          </div>
          
          <div class="morphological-metric">
            <span class="label">Coeficiente de Variación:</span>
            <span class="value">${metricas.coeficiente_variacion_radial ?? '—'}%</span>
          </div>
          
          ${metricas.punto_radio_maximo && Array.isArray(metricas.punto_radio_maximo) && metricas.punto_radio_maximo.length >= 2 ? `
          <div class="morphological-metric" style="font-size: 0.85em; color: #666; margin-top: 8px;">
            <span class="label">Punto Radio Máximo (x, y):</span>
            <span class="value">${metricas.punto_radio_maximo[0].toFixed(1)}, ${metricas.punto_radio_maximo[1].toFixed(1)}</span>
          </div>
          ` : ''}
          
          ${metricas.punto_radio_minimo && Array.isArray(metricas.punto_radio_minimo) && metricas.punto_radio_minimo.length >= 2 ? `
          <div class="morphological-metric" style="font-size: 0.85em; color: #666;">
            <span class="label">Punto Radio Mínimo (x, y):</span>
            <span class="value">${metricas.punto_radio_minimo[0].toFixed(1)}, ${metricas.punto_radio_minimo[1].toFixed(1)}</span>
          </div>
          ` : ''}
        </div>
        
        <div style="font-size: 0.85em; color: #666; font-style: italic; margin: 5px 0; padding: 5px; background: #f5f5f5; border-radius: 3px;">
          ℹ Ejes y radios calculados desde centroide del Convex Hull (forma completa estimada)
        </div>
        
        <h5 style="color: #1565c0; margin: 20px 0 10px 0; border-bottom: 2px solid #2196f3; padding-bottom: 5px; font-size: 1.1em;">ESTADO DE CONSERVACIÓN</h5>
        
        <div class="morphological-metric" style="background: #f0f2f5; padding: 10px; border-radius: 4px; margin: 10px 0; border: 2px solid #2196f3;">
          <span class="label">Solidez (Completitud):</span>
          <span class="value" style="color: #1565c0; font-weight: bold; font-size: 1.1em;">${metricas.solidity} → <strong>${metricas.solidity_class}</strong></span>
        </div>`;
        
      if (metricas.perdida_area_fragmentacion_percent) {
        metricsHTML += `
        <div class="morphological-metric">
          <span class="label">Pérdida por Fragmentación:</span>
          <span class="value">Área: ${metricas.perdida_area_fragmentacion_percent}% | Perímetro: ${metricas.perdida_perimetro_fragmentacion_percent}%</span>
        </div>`;
      }
      
      metricsHTML += `
        <div class="morphological-metric">
          <span class="label">Área Fragmentada:</span>
          <span class="value">${metricas.area_fragmentada} ${metricas.area_unit}</span>
        </div>
        
        <div class="morphological-metric">
          <span class="label">Perímetro Fragmentado:</span>
          <span class="value">${metricas.perimeter_fragmentado} ${metricas.perimeter_unit}</span>
        </div>`;
      
      if (metricas.completitud_estimada) {
        metricsHTML += `
        <div class="morphological-metric" style="background: #f3e5f5; padding: 8px; border-radius: 4px; margin: 5px 0;">
          <span class="label">Completitud Estimada:</span>
          <span class="value" style="color: #6a1b9a; font-weight: bold;">${metricas.completitud_estimada}% → ${metricas.completitud_tipo_fragmento}</span>
        </div>`;
      }

      // Resolver campos mostrados con regla canónica compartida.
      const _canonRender = ClassificationEngine.aplicarReglaCanonicaInterpretacion(metricas);
      const _formaGeoRender = _canonRender.forma_geometrica_observada;
      const _formaTipRenderMostrada = _canonRender.forma_tipologica_inferida;
      const _formaMostradaRender = _canonRender.forma_detectada_mostrada;
      const _tieneReinterpretacionRender = _canonRender.forma_requiere_reinterpretacion_tipologica;
      
      metricsHTML += `
        
        <h5 style="color: #2d5a2d; margin: 20px 0 10px 0; border-bottom: 2px solid #4caf50; padding-bottom: 5px; font-size: 1.1em;">CLASIFICACIÓN GEOMÉTRICA (Meta-Clasificación)</h5>
        
        <!-- RESULTADO DE META-CLASIFICACIÓN -->
        <div class="morphological-metric" style="background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%); padding: 15px; border-radius: 8px; margin: 10px 0; border: 3px solid #4caf50; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="font-size: 0.85em; color: #1b5e20; margin-bottom: 5px; font-weight: 600;">
            ${_tieneReinterpretacionRender ? 'CLASIFICACIÓN MOSTRADA (Interpretación Tipológica):' : 'CLASIFICACIÓN DEFINITIVA (Síntesis de 6 Métodos):'}
          </div>
          <div style="color: ${_tieneReinterpretacionRender ? '#e65100' : '#2d5a2d'}; font-weight: bold; font-size: 1.3em; margin: 5px 0;">
            ${_formaMostradaRender}
          </div>
          <div style="font-size: 0.8em; color: #388e3c; margin-top: 5px;">
            ${metricas.forma_categoria_base ? `Categoría: ${metricas.forma_categoria_base}` : ''}
          </div>
          ${(_formaTipRenderMostrada || _tieneReinterpretacionRender) ? `
          <div style="font-size: 0.95em; color: ${_tieneReinterpretacionRender ? '#e65100' : '#455a64'}; margin-top: 10px; padding-top: 8px; border-top: 1px dashed #a5d6a7;">
            <strong>Interpretación Tipológica:</strong> ${_formaTipRenderMostrada || _formaMostradaRender}
          </div>` : ''}
        </div>
        
        <!-- MÉTRICAS DE CONFIANZA -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0;">
          <div class="morphological-metric" style="background: #fff3e0; padding: 8px; border-radius: 4px; border: 2px solid #ff9800;">
            <span class="label">Confianza Global:</span>
            <span class="value" style="color: #e65100; font-weight: bold; font-size: 1.1em;">
              ${metricas.forma_confianza_global || (parseFloat(metricas.forma_confianza) * 100).toFixed(1)}%
            </span>
          </div>
          
          <div class="morphological-metric" style="background: #f0f2f5; padding: 8px; border-radius: 4px; border: 2px solid #2196f3;">
            <span class="label">Consenso:</span>
            <span class="value" style="color: #1565c0; font-weight: bold;">
              ${metricas.forma_metodos_coincidentes || 'N/A'}
            </span>
          </div>
        </div>
        
        ${metricas._clasificaciones_individuales ? `
        <!-- CLASIFICACIONES INDIVIDUALES -->
        <div style="background: #f5f5f5; padding: 12px; border-radius: 6px; margin: 15px 0; border: 1px solid #ccc;">
          <div style="font-weight: bold; color: #555; margin-bottom: 8px; font-size: 0.9em;">
            Clasificaciones Individuales (6 Votantes + 1 Validador):
          </div>
          
          <div class="morphological-metric">
            <span class="label">Radial-Angular:</span>
            <span class="value" style="font-weight: 600; color: #4caf50;">${metricas._clasificaciones_individuales.radial_angular}</span>
          </div>
          
          <div class="morphological-metric">
            <span class="label">Ángulos en Vértices:</span>
            <span class="value" style="font-weight: 600; color: #2196f3;">${metricas._clasificaciones_individuales.angulos_vertices}</span>
          </div>
          
          <div class="morphological-metric">
            <span class="label">Simetría:</span>
            <span class="value" style="font-weight: 600; color: #9c27b0;">${metricas._clasificaciones_individuales.simetria}</span>
          </div>
          
          <div class="morphological-metric">
            <span class="label">Tradicional:</span>
            <span class="value" style="font-weight: 600; color: #ff9800;">${metricas._clasificaciones_individuales.tradicional}</span>
          </div>
          
          <div class="morphological-metric">
            <span class="label">Complejidad:</span>
            <span class="value" style="font-weight: 600; color: #607d8b;">${metricas._clasificaciones_individuales.complejidad}</span>
          </div>
          
          <div class="morphological-metric">
            <span class="label">Curvatura:</span>
            <span class="value" style="font-weight: 600; color: #795548;">${metricas._clasificaciones_individuales.curvatura}</span>
          </div>
          
          <div class="morphological-metric">
            <span class="label">Convexidad (Validador):</span>
            <span class="value" style="font-weight: 600; color: #e91e63; font-style: italic;">${metricas._clasificaciones_individuales.convexidad}</span>
          </div>
        </div>
        ` : ''}
        
        ${metricas.forma_razonamiento ? `
        <!-- RAZONAMIENTO DE LA DECISIÓN -->
        <div class="morphological-metric" style="background: #fafafa; padding: 10px; border-radius: 4px; border-left: 3px solid #2196f3; margin: 10px 0;">
          <span class="label">Razonamiento Completo:</span>
          <span class="value" style="font-size: 0.85em; line-height: 1.6; display: block; margin-top: 5px;">
            ${metricas.forma_razonamiento.split(' | ').map(r => `• ${r}`).join('<br>')}
          </span>
        </div>
        ` : ''}
        
        <!-- PATRÓN DE AGRUPAMIENTO (si existe) -->
        ${metricas.patron_agrupamiento ? `
        <div style="background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); padding: 15px; border-radius: 8px; margin: 15px 0; border: 3px solid #ff9800; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="font-size: 0.85em; color: #e65100; margin-bottom: 10px; font-weight: 600;">
            PATRÓN DE AGRUPAMIENTO (Perforaciones/Horadaciones):
          </div>
          
          <div class="morphological-metric">
            <span class="label">Patrón Detectado:</span>
            <span class="value" style="color: #ef6c00; font-weight: bold; font-size: 1.2em;">
              ${metricas.patron_agrupamiento}
            </span>
          </div>
          
          <div class="morphological-metric">
            <span class="label">Detalles del Patrón:</span>
            <span class="value" style="color: #f57c00; line-height: 1.5; display: block; margin-top: 5px;">
              ${metricas.patron_agrupamiento_detalles}
            </span>
          </div>
        </div>
        
        <!-- CLASIFICACIÓN SÍNTESIS FINAL (Integración) -->
        ${metricas.clasificacion_sintesis_final ? `
        <div style="background: linear-gradient(135deg, #e1f5fe 0%, #b3e5fc 100%); padding: 15px; border-radius: 8px; margin: 15px 0; border: 3px solid #0288d1; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="font-size: 0.85em; color: #01579b; margin-bottom: 10px; font-weight: 600;">
            CLASIFICACIÓN SÍNTESIS FINAL (Forma + Patrón):
          </div>
          
          <div class="morphological-metric">
            <span class="label">Clasificación Integrada:</span>
            <span class="value" style="color: #0277bd; font-weight: bold; font-size: 1.3em; line-height: 1.4; display: block; margin-top: 5px;">
              ${metricas.clasificacion_sintesis_final}
            </span>
          </div>
          
          <div style="font-size: 0.75em; color: #0288d1; margin-top: 8px; font-style: italic;">
            Esta clasificación integra la geometría del objeto con su patrón de perforaciones para una mejor interpretación arqueológica.
          </div>
        </div>
        ` : ''}
        ` : ''}
        
        <!-- MÉTRICAS COMPLEMENTARIAS -->
        <h6 style="color: #666; margin: 15px 0 8px 0; font-size: 0.95em;">Métricas Complementarias:</h6>
        
        <div class="morphological-metric has-tooltip" data-metric="circularidad">
          <span class="label">Circularidad:</span>
          <span class="value">${metricas.circularity} → <strong>${metricas.shape_class_circularity}</strong></span>
        </div>
        
        <div class="morphological-metric has-tooltip" data-metric="compacidad">
          <span class="label">Compacidad:</span>
          <span class="value">${metricas.compactness} → <strong>${metricas.shape_class_compactness}</strong></span>
        </div>
        
        <div class="morphological-metric has-tooltip" data-metric="aspecto">
          <span class="label">Relación de Aspecto:</span>
          <span class="value">${metricas.aspect_ratio_tight} → <strong>${metricas.shape_class_aspect}</strong></span>
        </div>
        
        <div class="morphological-metric has-tooltip" data-metric="solidez">
          <span class="label">Convexidad:</span>
          <span class="value">${metricas.convexity}</span>
        </div>
        
        <div class="morphological-metric has-tooltip" data-metric="vertices_aproximados">
          <span class="label">Vértices:</span>
          <span class="value">${metricas.vertices_aproximados}</span>
        </div>
        
        <div class="morphological-metric has-tooltip" data-metric="puntos_contorno">
          <span class="label">Puntos del Contorno:</span>
          <span class="value">${metricas.contour_points}</span>
        </div>`;
        
        // Agregar información de contorno depurado estadísticamente
        if (metricas._forma_idealizada) {
          const forma = metricas._forma_idealizada;
          const params = forma.parametros;
          metricsHTML += `
        
        <h5 style="color: #666; margin: 15px 0 10px 0; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Depuración Estadística de Contorno</h5>
        
        <div class="morphological-metric" style="background: ${forma.color}15; padding: 8px; border-radius: 4px; margin: 10px 0; border: 2px solid ${forma.color};">
          <span class="label">Forma Identificada:</span>
          <span class="value" style="color: ${forma.color}; font-weight: bold; font-size: 1.1em;">
            ${forma.nombre}
          </span>
        </div>
        
        <div class="morphological-metric">
          <span class="label">Puntos Detectados (Máscara):</span>
          <span class="value">${params.puntos_originales} puntos del borde</span>
        </div>
        
        <div class="morphological-metric" style="background: #fff3cd; padding: 6px; border-radius: 4px;">
          <span class="label">Artefactos Digitales Eliminados:</span>
          <span class="value" style="color: #856404; font-weight: bold;">${params.artefactos_eliminados} puntos (${((params.artefactos_eliminados/params.puntos_originales)*100).toFixed(1)}%)</span>
        </div>
        
        <div class="morphological-metric">
          <span class="label">Puntos Depurados (Geometría Real):</span>
          <span class="value">${params.puntos_simplificados} puntos (reducción total: ${params.reduccion_porcentaje}%)</span>
        </div>
        
        <div class="morphological-metric">
          <span class="label">Continuidad Geométrica Promedio:</span>
          <span class="value">${params.continuidad_promedio} (umbral: ${params.umbral_continuidad})</span>
        </div>
        
        <div class="morphological-metric">
          <span class="label">Vértices Geométricos Significativos:</span>
          <span class="value">${params.vertices_significativos} puntos de alta curvatura</span>
        </div>
        
        <div class="morphological-metric">
          <span class="label">Epsilon Adaptativo (Douglas-Peucker):</span>
          <span class="value">${params.epsilon_usado} px</span>
        </div>
        
        <div class="morphological-metric">
          <span class="label">Dimensiones Preservadas:</span>
          <span class="value">${params.ancho} × ${params.alto} px</span>
        </div>`;
        
        // Mostrar clasificación de forma idealizada si existe
        if (metricas.forma_idealizada_nombre) {
          metricsHTML += `
        
        <div class="morphological-metric" style="background: #e8f5e8; padding: 8px; border-radius: 4px; margin: 10px 0; border: 2px solid #4caf50;">
          <span class="label">Clasificación Geométrica Idealizada:</span>
          <span class="value" style="color: #2d5a2d; font-weight: bold;">${metricas.forma_idealizada_nombre}</span>
        </div>
        
        <div class="morphological-metric">
          <span class="label">Confianza de Clasificación:</span>
          <span class="value">${(parseFloat(metricas.forma_idealizada_confianza) * 100).toFixed(1)}%</span>
        </div>`;
        }
        
        metricsHTML += `
        
        <div style="margin-top: 10px; padding: 10px; background: #e8f4fd; border-left: 4px solid #007bff; border-radius: 4px; font-size: 0.9em; line-height: 1.6;">
          <strong>Metodología Estadística:</strong><br>
          <strong>1. Análisis de Continuidad:</strong> Identifica puntos que siguen la tendencia geométrica vs artefactos de píxeles.<br>
          <strong>2. Filtrado de Alta Frecuencia:</strong> Elimina ${params.artefactos_eliminados} puntos con baja continuidad (ruido de digitalización).<br>
          <strong>3. Suavizado Gaussiano:</strong> Atenúa micro-variaciones preservando vértices.<br>
          <strong>4. Detección de Curvatura:</strong> Identifica ${params.vertices_significativos} vértices geométricos significativos.<br>
          <strong>5. Simplificación Adaptativa:</strong> Douglas-Peucker con epsilon=${params.epsilon_usado} px.<br><br>
          <strong>Resultado:</strong>Contorno con <strong>${params.reduccion_porcentaje}% menos puntos</strong>pero 
          <strong>resolución geométrica preservada</strong>. NO es una forma abstracta idealizada, sino la 
          <strong>geometría real del objeto</strong> libre de artefactos de digitalización.
        </div>`;
        }
        
        metricsHTML += `
        
        <h5 style="color: #d4af37; margin: 20px 0 10px 0; border-bottom: 2px solid #d4af37; padding-bottom: 5px; font-size: 1.1em;">CARACTERÍSTICAS MORFOMÉTRICAS AVANZADAS</h5>
        
        <div style="background: #fff8dc; padding: 10px; border-left: 4px solid #d4af37; border-radius: 4px; margin: 10px 0; font-size: 0.9em;">
          <strong>Métricas para Análisis de Artefactos</strong><br>
          Sistema universal para cerámica, lítico, metales y otros materiales arqueológicos.
        </div>
        
        <div class="morphological-metric has-tooltip" data-metric="contour_complexity">
          <span class="label">Complejidad del Contorno:</span>
          <span class="value">${metricas.contour_complexity_index} → <strong>${metricas.shape_class_complexity}</strong></span>
        </div>
        
        <div class="morphological-metric has-tooltip" data-metric="bounding_efficiency">
          <span class="label">Eficiencia del Bounding Box:</span>
          <span class="value">${metricas.bounding_box_efficiency}</span>
        </div>
        
        <div class="morphological-metric has-tooltip" data-metric="simetria_bilateral">
          <span class="label">Simetría Bilateral:</span>
          <span class="value">${metricas.simetria_bilateral} → <strong>${metricas.simetria_clasificacion}</strong></span>
        </div>
        
        <div class="morphological-metric has-tooltip" data-metric="curvatura_media">
          <span class="label">Curvatura Media:</span>
          <span class="value">${metricas.curvatura_media} → <strong>${metricas.curvatura_clasificacion}</strong></span>
        </div>
        
        <div class="morphological-metric has-tooltip" data-metric="puntos_inflexion">
          <span class="label">Puntos de Inflexión:</span>
          <span class="value">${metricas.curvatura_puntos_inflexion} (esquinas: ${metricas.curvatura_puntos_esquina})</span>
        </div>
        
        <div class="morphological-metric has-tooltip" data-metric="rugosidad">
          <span class="label">Rugosidad:</span>
          <span class="value">${metricas.rugosidad_contorno} → <strong>${metricas.rugosidad_clasificacion}</strong></span>
        </div>`;
        
        // ============================================================================
        // 🆕 MÉTRICAS GEOMÉTRICAS AVANZADAS
        // ============================================================================
        
        metricsHTML += `
        
        <h5 style="color: #8b0000; margin: 20px 0 10px 0; border-bottom: 2px solid #dc143c; padding-bottom: 5px; font-size: 1.1em;">CARACTERÍSTICAS GEOMÉTRICAS AVANZADAS</h5>
        
        <div style="background: linear-gradient(135deg, #fff5f5 0%, #ffe6e6 100%); padding: 12px; border-left: 4px solid #dc143c; border-radius: 4px; margin: 10px 0; font-size: 0.9em;">
          <strong>Nuevas Métricas Morfológicas</strong><br>
          Análisis geométrico avanzado para caracterización detallada de artefactos arqueológicos.
        </div>
        
        <!-- ÍNDICE DE ESTRELLAMIENTO -->
        <div class="morphological-metric has-tooltip" data-metric="estrellamiento" style="background: ${parseFloat(metricas.indice_estrellamiento) > 0.4 ? '#fff3cd' : '#e8f5e9'}; padding: 10px; border-radius: 4px; margin: 10px 0; border: 2px solid ${parseFloat(metricas.indice_estrellamiento) > 0.4 ? '#ffc107' : '#4caf50'};">
          <span class="label" style="font-weight: bold;">Índice de Estrellamiento:</span>
          <span class="value" style="color: ${parseFloat(metricas.indice_estrellamiento) > 0.4 ? '#ff6f00' : '#2e7d32'}; font-weight: bold; font-size: 1.1em;">
            ${metricas.indice_estrellamiento} → <strong>${metricas.estrellamiento_clasificacion}</strong>
          </span>
        </div>
        
        <div style="margin: 5px 0 15px 20px; padding: 8px; background: #f5f5f5; border-left: 3px solid #999; border-radius: 3px; font-size: 0.85em;">
          <strong>Interpretación:</strong> Mide cuán "estrellada" es la forma. Valores altos (&gt;0.5) indican protuberancias pronunciadas o formas con puntas marcadas. Valores bajos (&lt;0.2) indican formas redondeadas o regulares.<br>
          <strong>Uso arqueológico:</strong> Identifica decoración con puntas, apéndices pronunciados, o morfologías angulosas intencionales.
        </div>
        
        <!-- ÍNDICE DE LOBULARIDAD -->
        <div class="morphological-metric has-tooltip" data-metric="lobularidad" style="background: ${parseFloat(metricas.indice_lobularidad) > 1.2 ? '#f0f2f5' : '#f3e5f5'}; padding: 10px; border-radius: 4px; margin: 10px 0; border: 2px solid ${parseFloat(metricas.indice_lobularidad) > 1.2 ? '#2196f3' : '#9c27b0'};">
          <span class="label" style="font-weight: bold;">Índice de Lobularidad:</span>
          <span class="value" style="color: ${parseFloat(metricas.indice_lobularidad) > 1.2 ? '#0d47a1' : '#4a148c'}; font-weight: bold; font-size: 1.1em;">
            ${metricas.indice_lobularidad} → <strong>${metricas.lobularidad_clasificacion}</strong>
          </span>
        </div>
        
        <div style="margin: 5px 0 15px 20px; padding: 8px; background: #f5f5f5; border-left: 3px solid #999; border-radius: 3px; font-size: 0.85em;">
          <strong>Interpretación:</strong> Detecta lóbulos o protuberancias suaves en el contorno. Basado en la relación perímetro del hull vs círculo equivalente.<br>
          <strong>Uso arqueológico:</strong> Identifica asas, vertedores, apéndices redondeados, o morfologías con expansiones laterales.
        </div>
        
        <!-- ENERGÍA DE CURVATURA -->
        <div class="morphological-metric has-tooltip" data-metric="energia_curvatura" style="background: ${parseFloat(metricas.energia_curvatura) > 0.05 ? '#ffebee' : '#e8f5e9'}; padding: 10px; border-radius: 4px; margin: 10px 0; border: 2px solid ${parseFloat(metricas.energia_curvatura) > 0.05 ? '#f44336' : '#4caf50'};">
          <span class="label" style="font-weight: bold;">Energía de Curvatura:</span>
          <span class="value" style="color: ${parseFloat(metricas.energia_curvatura) > 0.05 ? '#c62828' : '#2e7d32'}; font-weight: bold; font-size: 1.1em;">
            ${metricas.energia_curvatura} → <strong>${metricas.energia_clasificacion}</strong>
          </span>
        </div>
        
        <div style="margin: 5px 0 15px 20px; padding: 8px; background: #f5f5f5; border-left: 3px solid #999; border-radius: 3px; font-size: 0.85em;">
          <strong>Interpretación:</strong> Suma de cuadrados de curvaturas (Σκ²/n). Valores altos indican contorno muy sinuoso con cambios bruscos de dirección. Valores bajos indican trazos suaves.<br>
          <strong>Uso arqueológico:</strong> Evalúa calidad de manufactura, detecta decoración incisa/corrugada, o identifica formas orgánicas vs geométricas.
        </div>
        
        <!-- DIÁMETRO DE FERET -->
        <div style="background: linear-gradient(135deg, #e0f7fa 0%, #b2ebf2 100%); padding: 12px; border-radius: 6px; margin: 15px 0; border: 3px solid #00acc1;">
          <h6 style="color: #006064; margin: 0 0 10px 0; font-size: 1.05em;">Diámetro de Feret (Caliper Diameter)</h6>
          
          <div class="morphological-metric has-tooltip" data-metric="feret_max">
            <span class="label" style="color: #0277bd; font-weight: bold;">Feret Máximo:</span>
            <span class="value" style="color: #01579b; font-weight: bold; font-size: 1.1em;">${metricas.feret_max} ${metricas.perimeter_unit} (${metricas.feret_angulo_max}°)</span>
          </div>
          
          <div class="morphological-metric has-tooltip" data-metric="feret_min">
            <span class="label" style="color: #0277bd; font-weight: bold;">Feret Mínimo:</span>
            <span class="value" style="color: #01579b; font-weight: bold; font-size: 1.1em;">${metricas.feret_min} ${metricas.perimeter_unit} (${metricas.feret_angulo_min}°)</span>
          </div>
          
          <div class="morphological-metric has-tooltip" data-metric="feret_ratio" style="background: white; padding: 8px; border-radius: 4px; margin: 5px 0;">
            <span class="label">Ratio Feret (min/max):</span>
            <span class="value" style="font-weight: bold;">${metricas.feret_ratio} → <strong>${metricas.feret_clasificacion}</strong></span>
          </div>
          
          <div style="margin: 10px 0 0 0; padding: 8px; background: rgba(255,255,255,0.7); border-left: 3px solid #00838f; border-radius: 3px; font-size: 0.85em;">
            <strong>Interpretación:</strong>Ancho máximo y mínimo del objeto medido con calibrador rotatorio (todas las orientaciones). Medición robusta independiente de la orientación del artefacto.<br>
            <strong>Uso arqueológico:</strong>Medición estándar en morfometría, permite comparaciones con literatura, identifica elongación principal.
          </div>
        </div>
        
        <!-- ÁNGULOS EN VÉRTICES -->
        <div style="background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); padding: 12px; border-radius: 6px; margin: 15px 0; border: 3px solid #ff9800;">
          <h6 style="color: #e65100; margin: 0 0 10px 0; font-size: 1.05em;">Análisis de Ángulos en Vértices</h6>
          
          <div class="morphological-metric has-tooltip" data-metric="geometria_vertices" style="background: white; padding: 8px; border-radius: 4px; margin: 5px 0;">
            <span class="label">Geometría Detectada:</span>
            <span class="value" style="color: #e65100; font-weight: bold; font-size: 1.1em;">${metricas.geometria_vertices}</span>
          </div>
          
          <div class="morphological-metric has-tooltip" data-metric="angulo_medio">
            <span class="label">Ángulo Medio:</span>
            <span class="value">${metricas.angulo_medio_vertices}°</span>
          </div>
          
          <div class="morphological-metric has-tooltip" data-metric="angulo_predominante">
            <span class="label">Ángulo Predominante:</span>
            <span class="value" style="font-weight: bold; color: #f57c00;">${metricas.angulo_predominante}°</span>
          </div>
          
          <div class="morphological-metric">
            <span class="label">Desviación Estándar:</span>
            <span class="value">${metricas.desviacion_angulos}°</span>
          </div>
          
          <div class="morphological-metric">
            <span class="label">Ángulos Rectos (~90°):</span>
            <span class="value" style="font-weight: bold; color: #388e3c;">${metricas.num_angulos_rectos}</span>
          </div>
          
          <div class="morphological-metric">
            <span class="label">Ángulos Agudos (&lt;75°):</span>
            <span class="value" style="font-weight: bold; color: #1976d2;">${metricas.num_angulos_agudos}</span>
          </div>
          
          <div class="morphological-metric">
            <span class="label">Ángulos Obtusos (&gt;105°):</span>
            <span class="value" style="font-weight: bold; color: #d32f2f;">${metricas.num_angulos_obtusos}</span>
          </div>
          
          <div style="margin: 10px 0 0 0; padding: 8px; background: rgba(255,255,255,0.7); border-left: 3px solid #f57c00; border-radius: 3px; font-size: 0.85em;">
            <strong>Interpretación:</strong>Distribución de ángulos internos en los vértices detectados. Revela intencionalidad geométrica en la manufactura.<br>
            <strong>Uso arqueológico:</strong>Discrimina formas geométricas planificadas (triángulo, cuadrado, pentágono) vs formas orgánicas irregulares. Identifica tradiciones de manufactura geométrica vs libre.
          </div>
        </div>`;
        
        // ============================================================================
        // Eliminar secciones duplicadas de Convex Hull y Completitud
        // (ya están incluidas en las secciones principales arriba)
        // ============================================================================
        
        metricsHTML += `
        
        <h5 style="color: #666; margin: 15px 0 10px 0; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Comparación Bounding Box vs Real</h5>
        
        <div class="morphological-metric">
          <span class="label">Bounding Box Original:</span>
          <span class="value">${metricas.bounding_width_px}×${metricas.bounding_height_px} px</span>
        </div>
        
        <div class="morphological-metric">
          <span class="label">Bounding Box Ajustado:</span>
          <span class="value">${metricas.tight_bounding_width_px}×${metricas.tight_bounding_height_px} px</span>
        </div>`;
        
        if (metricas.convex_hull_area_mm2) {
          metricsHTML += `
            <div class="morphological-metric">
              <span class="label">Convex Hull:</span>
              <span class="value">${metricas.convex_hull_points} puntos, ${metricas.convex_hull_area_mm2} mm²</span>
            </div>`;
        }
    } else {
      // Mostrar métricas aproximadas cuando no se pudo extraer contorno
      metricsHTML += `
        <div class="morphological-metric" style="background: #fff3cd; padding: 8px; border-radius: 4px;">
          <span class="label"style="color: #856404;">Análisis Aproximado:</span>
          <span class="value" style="color: #856404;">Basado en bounding box únicamente</span>
        </div>
        
        <div class="morphological-metric">
          <span class="label">Área (aprox):</span>
          <span class="value">${metricas.bounding_area_px} px²${metricas.bounding_area_mm2 ? ` (${metricas.bounding_area_mm2} mm²)` : ''}</span>
        </div>
        
        <div class="morphological-metric">
          <span class="label">Circularidad (aprox):</span>
          <span class="value">${metricas.circularity_approx} → ${metricas.shape_class_circularity}</span>
        </div>`;
    }
      
    // ============================================================================
    // 🆕 MÉTRICAS ÓPTICAS GLCM (disponibles cuando el análisis viene desde AIA)
    // ============================================================================
    const _glcmContrast  = metricas.contrast      != null ? parseFloat(metricas.contrast)      : null;
    const _glcmDissim    = metricas.dissimilarity  != null ? parseFloat(metricas.dissimilarity)  : null;
    const _glcmHomog     = metricas.homogeneity    != null ? parseFloat(metricas.homogeneity)    : null;
    const _glcmEnergy    = metricas.energy         != null ? parseFloat(metricas.energy)         : null;
    const _glcmCorr      = metricas.correlation    != null ? parseFloat(metricas.correlation)    : null;
    const _glcmEntropy   = metricas.entropy        != null ? parseFloat(metricas.entropy)        : null;
    const _txVar         = metricas.varianza_interna     != null ? parseFloat(metricas.varianza_interna)    : null;
    const _txEnt         = metricas.entropia_superficie   != null ? parseFloat(metricas.entropia_superficie)  : null;
    const _txGrad        = metricas.gradiente_medio       != null ? parseFloat(metricas.gradiente_medio)      : null;
    const _glcmInterp    = metricas.textura_interpretacion || null;
    const _tieneGlcm     = _glcmContrast !== null || _glcmHomog !== null;
    const _tieneTexBasic = _txVar !== null || _txEnt !== null || _txGrad !== null;

    if (_tieneGlcm || _tieneTexBasic) {
      metricsHTML += `
        <h5 style="color: #5c4d7d; margin: 20px 0 10px 0; border-bottom: 2px solid #7e57c2; padding-bottom: 5px; font-size: 1.1em;">TEXTURA ÓPTICA (Análisis GLCM)</h5>
        
        <div style="background: linear-gradient(135deg, #f3e5f5 0%, #e8eaf6 100%); padding: 12px; border-left: 4px solid #7e57c2; border-radius: 4px; margin: 10px 0; font-size: 0.9em;">
          <strong>Métricas de co-ocurrencia de grises (Grey-Level Co-occurrence Matrix)</strong><br>
          Descriptores estadísticos de segundo orden para caracterización de textura superficial.
        </div>`;

      if (_tieneTexBasic) {
        metricsHTML += `
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin: 8px 0;">
          ${_txVar !== null ? `
          <div class="morphological-metric" style="background: #f3e5f5; padding: 8px; border-radius: 4px; text-align: center; border: 1px solid #ce93d8;">
            <div style="font-size: 0.75em; color: #7b1fa2; font-weight: 600; margin-bottom: 4px;">Varianza Interna (σ²)</div>
            <div style="font-size: 1.1em; font-weight: bold; color: #4a148c;">${_txVar.toFixed(2)}</div>
          </div>` : ''}
          ${_txEnt !== null ? `
          <div class="morphological-metric" style="background: #ede7f6; padding: 8px; border-radius: 4px; text-align: center; border: 1px solid #b39ddb;">
            <div style="font-size: 0.75em; color: #512da8; font-weight: 600; margin-bottom: 4px;">Entropía Superficie</div>
            <div style="font-size: 1.1em; font-weight: bold; color: #311b92;">${_txEnt.toFixed(4)}</div>
          </div>` : ''}
          ${_txGrad !== null ? `
          <div class="morphological-metric" style="background: #e8eaf6; padding: 8px; border-radius: 4px; text-align: center; border: 1px solid #9fa8da;">
            <div style="font-size: 0.75em; color: #283593; font-weight: 600; margin-bottom: 4px;">Gradiente Medio</div>
            <div style="font-size: 1.1em; font-weight: bold; color: #1a237e;">${_txGrad.toFixed(4)}</div>
          </div>` : ''}
        </div>`;
      }

      if (_tieneGlcm) {
        metricsHTML += `
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin: 8px 0;">
          ${_glcmContrast !== null ? `
          <div class="morphological-metric" style="background: #fce4ec; padding: 8px; border-radius: 4px; text-align: center; border: 1px solid #f48fb1;">
            <div style="font-size: 0.75em; color: #c62828; font-weight: 600; margin-bottom: 4px;">Contraste GLCM</div>
            <div style="font-size: 1.1em; font-weight: bold; color: #b71c1c;">${_glcmContrast.toFixed(4)}</div>
          </div>` : ''}
          ${_glcmDissim !== null ? `
          <div class="morphological-metric" style="background: #fff3e0; padding: 8px; border-radius: 4px; text-align: center; border: 1px solid #ffcc80;">
            <div style="font-size: 0.75em; color: #e65100; font-weight: 600; margin-bottom: 4px;">Disimilaridad</div>
            <div style="font-size: 1.1em; font-weight: bold; color: #bf360c;">${_glcmDissim.toFixed(4)}</div>
          </div>` : ''}
          ${_glcmHomog !== null ? `
          <div class="morphological-metric" style="background: #e8f5e9; padding: 8px; border-radius: 4px; text-align: center; border: 1px solid #a5d6a7;">
            <div style="font-size: 0.75em; color: #2e7d32; font-weight: 600; margin-bottom: 4px;">Homogeneidad</div>
            <div style="font-size: 1.1em; font-weight: bold; color: #1b5e20;">${_glcmHomog.toFixed(4)}</div>
          </div>` : ''}
          ${_glcmEnergy !== null ? `
          <div class="morphological-metric" style="background: #e3f2fd; padding: 8px; border-radius: 4px; text-align: center; border: 1px solid #90caf9;">
            <div style="font-size: 0.75em; color: #1565c0; font-weight: 600; margin-bottom: 4px;">Energía GLCM</div>
            <div style="font-size: 1.1em; font-weight: bold; color: #0d47a1;">${_glcmEnergy.toFixed(4)}</div>
          </div>` : ''}
          ${_glcmCorr !== null ? `
          <div class="morphological-metric" style="background: #e0f7fa; padding: 8px; border-radius: 4px; text-align: center; border: 1px solid #80deea;">
            <div style="font-size: 0.75em; color: #00695c; font-weight: 600; margin-bottom: 4px;">Correlación GLCM</div>
            <div style="font-size: 1.1em; font-weight: bold; color: #004d40;">${_glcmCorr.toFixed(4)}</div>
          </div>` : ''}
          ${_glcmEntropy !== null ? `
          <div class="morphological-metric" style="background: #f9fbe7; padding: 8px; border-radius: 4px; text-align: center; border: 1px solid #dce775;">
            <div style="font-size: 0.75em; color: #558b2f; font-weight: 600; margin-bottom: 4px;">Entropía GLCM</div>
            <div style="font-size: 1.1em; font-weight: bold; color: #33691e;">${_glcmEntropy.toFixed(4)}</div>
          </div>` : ''}
        </div>`;

        if (_glcmInterp) {
          metricsHTML += `
        <div style="margin: 10px 0; padding: 10px; background: #ede7f6; border-left: 4px solid #7e57c2; border-radius: 4px; font-size: 0.9em; line-height: 1.6;">
          <strong>Interpretación de Textura:</strong> ${_glcmInterp}
        </div>`;
        }
      }

      metricsHTML += `</div>`;
    }

    metricsHTML += `
      <h5 style="color: #666; margin: 15px 0 10px 0; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Información Técnica</h5>
      
      <div class="morphological-metric">
        <span class="label">Factor de Escala:</span>
        <span class="value">${metricas.scale_factor === 'No configurada' ? 'No configurada' : metricas.scale_factor + ' mm/px'}</span>
      </div>
      
      <div class="morphological-metric">
        <span class="label">Bounding Box Original:</span>
        <span class="value">${metricas.original_bounding_box}</span>
      </div>`;
      
    if (metricas.tight_bounding_box) {
      metricsHTML += `
        <div class="morphological-metric">
          <span class="label">Bounding Box Ajustado:</span>
          <span class="value">${metricas.tight_bounding_box}</span>
        </div>`;
    }
      
    metricsHTML += `
      <div class="morphological-metric">
        <span class="label">Análisis:</span>
        <span class="value">${new Date(metricas.analysis_timestamp).toLocaleString()}</span>
      </div>
    `;
    
    // ============================================================================
    // 🆕 TABLA COMPARATIVA: OBJETO + PERFORACIONES + HORADACIONES
    // ============================================================================
    const tienePerforaciones = obj.perforaciones && obj.perforaciones.length > 0;
    const tieneHoradaciones = obj.horadaciones && obj.horadaciones.length > 0;
    
    if (tienePerforaciones || tieneHoradaciones) {
      metricsHTML += `
        <h5 style="color: #495057; margin: 20px 0 10px 0; border-bottom: 3px solid #6c757d; padding-bottom: 5px; font-size: 1.15em;">
          � TABLA COMPARATIVA DE MÉTRICAS MORFOLÓGICAS
        </h5>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0; border: 2px solid #dee2e6; overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.85em; background: white;">
            <thead>
              <tr style="background: linear-gradient(135deg, #4a5568 0%, #2d3748 100%); color: white;">
                <th style="padding: 10px; text-align: left; border: 1px solid #dee2e6; position: sticky; left: 0; background: linear-gradient(135deg, #4a5568 0%, #2d3748 100%); z-index: 1;">
                  Métrica
                </th>
                <th style="padding: 10px; text-align: center; border: 1px solid #dee2e6; background: rgba(255,255,255,0.1);">
                  OBJETO<br><span style="font-size: 0.8em; font-weight: normal;">${metricas.object_id}</span>
                </th>`;
      
      // Columnas para perforaciones
      if (tienePerforaciones) {
        obj.perforaciones.forEach(perf => {
          metricsHTML += `
                <th style="padding: 10px; text-align: center; border: 1px solid #dee2e6; background: rgba(0, 102, 204, 0.2);">
                  P${perf.id}<br><span style="font-size: 0.8em; font-weight: normal;">${perf.metricas.forma_detectada}</span>
                </th>`;
        });
      }
      
      // Columnas para horadaciones
      if (tieneHoradaciones) {
        obj.horadaciones.forEach(hora => {
          metricsHTML += `
                <th style="padding: 10px; text-align: center; border: 1px solid #dee2e6; background: rgba(40, 167, 69, 0.2);">
                  H${hora.id}<br><span style="font-size: 0.8em; font-weight: normal;">${hora.metricas.forma_detectada}</span>
                </th>`;
        });
      }
      
      metricsHTML += `
              </tr>
            </thead>
            <tbody>`;
      
      // FUNCIÓN AUXILIAR: Crear fila de tabla
      const crearFila = (label, estiloLabel, obtenerValorObj, obtenerValorPerf, colorFondo = '#ffffff') => {
        let fila = `
              <tr style="background: ${colorFondo};">
                <td style="padding: 8px; font-weight: bold; border: 1px solid #dee2e6; position: sticky; left: 0; background: ${colorFondo}; ${estiloLabel}">
                  ${label}
                </td>
                <td style="padding: 8px; text-align: center; border: 1px solid #dee2e6;">
                  ${obtenerValorObj(metricas)}
                </td>`;
        
        if (tienePerforaciones) {
          obj.perforaciones.forEach(perf => {
            fila += `
                <td style="padding: 8px; text-align: center; border: 1px solid #dee2e6; background: rgba(0, 102, 204, 0.05);">
                  ${obtenerValorPerf(perf.metricas)}
                </td>`;
          });
        }
        
        if (tieneHoradaciones) {
          obj.horadaciones.forEach(hora => {
            fila += `
                <td style="padding: 8px; text-align: center; border: 1px solid #dee2e6; background: rgba(40, 167, 69, 0.05);">
                  ${obtenerValorPerf(hora.metricas)}
                </td>`;
          });
        }
        
        fila += `</tr>`;
        return fila;
      };
      
      // SECCIÓN: DIMENSIONES BÁSICAS
      metricsHTML += `
              <tr style="background: #e9ecef;">
                <td colspan="${2 + (tienePerforaciones ? obj.perforaciones.length : 0) + (tieneHoradaciones ? obj.horadaciones.length : 0)}" 
                    style="padding: 8px; font-weight: bold; text-align: center; border: 1px solid #dee2e6; color: #495057;">
                  DIMENSIONES BÁSICAS
                </td>
              </tr>`;
      
      metricsHTML += crearFila(
        'Área',
        'color: #e65100;',
        m => `${m.area} ${m.area_unit}`,
        m => `${m.area.toFixed(2)} mm²`,
        '#fff3e0'
      );

      if (tienePerforaciones || tieneHoradaciones) {
        // Área neta: área bruta (mm²) - Σ P/H (mm²) — sin aplicar scale² (ya está en mm²)
        const _phefAn = calcularAreaEfectivaPH(obj.perforaciones || [], obj.horadaciones || []);
        const _areaBrutaAN = parseFloat(metricas.area) || 0;
        const _aNetaAn = (typeof obj.area_neta === 'number' && obj.area_neta <= _areaBrutaAN)
          ? obj.area_neta
          : Math.max(0, _areaBrutaAN - _phefAn.areaTotalPH);
        metricsHTML += `
              <tr style="background: #e0f7fa;">
                <td style="border: 1px solid #ddd; padding: 6px 8px; padding-left: 15px; font-weight: bold; color: #006064; border-left: 4px solid #00bcd4;">★ Área Neta (efectiva)</td>
                <td colspan="${1 + (tienePerforaciones ? obj.perforaciones.length : 0) + (tieneHoradaciones ? obj.horadaciones.length : 0)}" style="border: 1px solid #ddd; padding: 6px; text-align: center; font-weight: bold; color: #006064;">${_aNetaAn.toFixed(3)} mm²</td>
              </tr>`;
      }

      metricsHTML += crearFila(
        'Perímetro',
        'color: #e65100;',
        m => `${m.perimeter} ${m.perimeter_unit}`,
        m => `${m.perimeter.toFixed(2)} mm`
      );

      if (tienePerforaciones || tieneHoradaciones) {
        // Perímetro neto: perímetro externo + Σ perímetros P/H
        const _scPAn = (typeof scale !== 'undefined' && scale > 0) ? scale : 1;
        const _gPerAn = (ph) => ph.metricas?.perimeter ? parseFloat(ph.metricas.perimeter)||0
          : ph.metricas?.perimeter_real ? (parseFloat(ph.metricas.perimeter_real)||0)*_scPAn
          : parseFloat(ph.perimetro)||0;
        const _pExtAn = parseFloat(metricas.perimeter || 0);
        const _pPHAn  = [...(obj.perforaciones||[]), ...(obj.horadaciones||[])].reduce((s,ph) => s+_gPerAn(ph), 0);
        const _pNetaAn = typeof obj.perimetro_neto === 'number' ? obj.perimetro_neto : (_pExtAn + _pPHAn);
        metricsHTML += `
              <tr style="background: #e8f5e9;">
                <td style="border: 1px solid #ddd; padding: 6px 8px; padding-left: 15px; font-weight: bold; color: #1b5e20; border-left: 4px solid #43a047;">★ Perímetro Neto (topológico)</td>
                <td colspan="${1 + (tienePerforaciones ? obj.perforaciones.length : 0) + (tieneHoradaciones ? obj.horadaciones.length : 0)}" style="border: 1px solid #ddd; padding: 6px; text-align: center; font-weight: bold; color: #1b5e20;">${_pNetaAn.toFixed(3)} mm</td>
              </tr>`;
      }

      metricsHTML += crearFila(
        'Dimensiones (W×H)',
        '',
        m => `${m.width} × ${m.height} ${m.perimeter_unit}`,
        m => `${m.width.toFixed(2)} × ${m.height.toFixed(2)} mm`
      );
      
      metricsHTML += crearFila(
        'Centroide (X, Y)',
        '',
        m => `(${m.centroide_hull_x || m.centroide_x}, ${m.centroide_hull_y || m.centroide_y})`,
        m => `(${m.centroid[0].toFixed(1)}, ${m.centroid[1].toFixed(1)})`
      );
      
      // SECCIÓN: ANÁLISIS RADIAL
      metricsHTML += `
              <tr style="background: #f0f2f5;">
                <td colspan="${2 + (tienePerforaciones ? obj.perforaciones.length : 0) + (tieneHoradaciones ? obj.horadaciones.length : 0)}" 
                    style="padding: 8px; font-weight: bold; text-align: center; border: 1px solid #dee2e6; color: #1565c0;">
                  � ANÁLISIS RADIAL
                </td>
              </tr>`;
      
      metricsHTML += crearFila(
        'Radio Máximo',
        'color: #00bfff;',
        m => `${m.radio_maximo} ${m.perimeter_unit}`,
        m => `${m.radio_maximo.toFixed(2)} mm`,
        '#f0f2f5'
      );
      
      metricsHTML += crearFila(
        'Radio Mínimo',
        'color: #ff1493;',
        m => `${m.radio_minimo} ${m.perimeter_unit}`,
        m => `${m.radio_minimo.toFixed(2)} mm`,
        '#f0f2f5'
      );
      
      metricsHTML += crearFila(
        'Radio Medio',
        '',
        m => `${m.radio_medio} ${m.perimeter_unit}`,
        m => `${m.radio_medio.toFixed(2)} mm`
      );
      
      metricsHTML += crearFila(
        'Ratio Radios',
        '',
        m => m.ratio_radios,
        m => m.ratio_radios.toFixed(3)
      );
      
      metricsHTML += crearFila(
        'Regularidad Radial',
        '',
        m => `${m.regularidad_radial}%`,
        m => `${m.regularidad_radial}%`
      );
      
      // SECCIÓN: EJES Y EXCENTRICIDAD
      metricsHTML += `
              <tr style="background: #f3e5f5;">
                <td colspan="${2 + (tienePerforaciones ? obj.perforaciones.length : 0) + (tieneHoradaciones ? obj.horadaciones.length : 0)}" 
                    style="padding: 8px; font-weight: bold; text-align: center; border: 1px solid #dee2e6; color: #6a1b9a;">
                  � EJES Y EXCENTRICIDAD
                </td>
              </tr>`;
      
      metricsHTML += crearFila(
        'Eje Mayor',
        'color: #ff0000;',
        m => `${m.eje_mayor_real_longitud || m.eje_mayor} ${m.perimeter_unit}`,
        m => `${m.eje_mayor.toFixed(2)} mm`,
        '#f3e5f5'
      );
      
      metricsHTML += crearFila(
        'Eje Menor',
        'color: #00ff00;',
        m => `${m.eje_menor_real_longitud || m.eje_menor} ${m.perimeter_unit}`,
        m => `${m.eje_menor.toFixed(2)} mm`,
        '#f3e5f5'
      );
      
      metricsHTML += crearFila(
        'Excentricidad',
        '',
        m => m.excentricidad,
        m => m.excentricidad.toFixed(4)
      );
      
      // SECCIÓN: MÉTRICAS DE FORMA
      metricsHTML += `
              <tr style="background: #e8f5e9;">
                <td colspan="${2 + (tienePerforaciones ? obj.perforaciones.length : 0) + (tieneHoradaciones ? obj.horadaciones.length : 0)}" 
                    style="padding: 8px; font-weight: bold; text-align: center; border: 1px solid #dee2e6; color: #2d5a2d;">
                  MÉTRICAS DE FORMA
                </td>
              </tr>`;
      
      metricsHTML += crearFila(
        'Forma Detectada',
        'color: #2d5a2d; font-weight: bold;',
        m => m.forma_detectada,
        m => `${m.forma_detectada} (${(m.forma_confianza * 100).toFixed(0)}%)`,
        '#e8f5e9'
      );
      
      metricsHTML += crearFila(
        'Circularidad',
        '',
        m => `${m.circularity} → ${m.shape_class_circularity}`,
        m => m.circularity.toFixed(4)
      );
      
      metricsHTML += crearFila(
        'Compacidad',
        '',
        m => `${m.compactness} → ${m.shape_class_compactness}`,
        m => m.compactness.toFixed(2)
      );
      
      metricsHTML += crearFila(
        'Solidez',
        '',
        m => `${m.solidity} → ${m.solidity_class}`,
        m => m.solidity.toFixed(4)
      );
      
      metricsHTML += crearFila(
        'Convexidad',
        '',
        m => m.convexity,
        m => m.convexity ? m.convexity.toFixed(4) : 'N/A'
      );
      
      metricsHTML += crearFila(
        'Relación Aspecto',
        '',
        m => `${m.aspect_ratio_tight} → ${m.shape_class_aspect}`,
        m => m.aspect_ratio.toFixed(2)
      );
      
      metricsHTML += `
            </tbody>
          </table>
          <div style="margin-top: 10px; padding: 8px; background: #fff3cd; border-radius: 4px; font-size: 0.85em; color: #856404;">
            <strong>Nota:</strong>Esta tabla permite comparar rápidamente las métricas del objeto principal con todas sus perforaciones y horadaciones identificadas.
          </div>
        </div>`;
      
      // ============================================================================
      // 🆕 ANÁLISIS COMPARATIVO AVANZADO
      // ============================================================================
      const analisisComparativo = calcularAnalisisComparativo(obj, metricas);
      
      // 💾 GUARDAR análisis comparativo en el objeto para reutilizarlo en el PDF
      obj.analisisComparativo = analisisComparativo;
      
      if (analisisComparativo) {
        metricsHTML += `
        <h5 style="color: #6a1b9a; margin: 25px 0 10px 0; border-bottom: 3px solid #9c27b0; padding-bottom: 5px; font-size: 1.15em;">
          ANÁLISIS COMPARATIVO AVANZADO
        </h5>`;

        // ── BLOQUE CRÍTICO: ÁREA NETA ─────────────────────────────────────────
        const _rp = analisisComparativo.ratios_proporciones || {};
        const _areaBruta = parseFloat(metricas.area) || 0;
        // Usar calcularAreaEfectivaPH para excluir P inscriptas en H (orificio cónico)
        // — mismo método que la Tabla Comparativa, evita doble-conteo P+H.
        const _phefBal   = calcularAreaEfectivaPH(obj.perforaciones || [], obj.horadaciones || []);
        const _areaPH    = _phefBal.areaTotalPH;
        // Derivar Área Neta siempre de Área Bruta − Área P/H para garantizar consistencia visual.
        // (Ambas columnas se calculan desde metricas.area = Convex Hull × escala²)
        const _areaNeta  = _areaBruta - _areaPH;
        const _pctPH     = _areaBruta > 0 ? ((_areaPH / _areaBruta) * 100).toFixed(1) : '0.0';
        const _pctNeta   = _areaBruta > 0 ? ((_areaNeta / _areaBruta) * 100).toFixed(1) : '100.0';
        const _fmtN      = v => (typeof v === 'number' ? v.toFixed(3) : 'N/A');
        metricsHTML += `
        <div style="background: linear-gradient(135deg, #1a3a4a 0%, #0d6e8d 100%); border-radius: 10px; margin: 12px 0; padding: 0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.25);">
          <div style="background: rgba(0,0,0,0.25); padding: 8px 15px;">
            <span style="color: #fff; font-weight: bold; font-size: 0.85em; letter-spacing: 1px;">⬟ BALANCE DE SUPERFICIES — VALOR CRÍTICO</span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1.6fr; gap: 0;">
            <div style="padding: 14px 16px; border-right: 1px solid rgba(255,255,255,0.15);">
              <div style="color: rgba(255,255,255,0.65); font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.5px;">Área Bruta</div>
              <div style="color: #fff; font-size: 1.25em; font-weight: bold; margin-top: 4px;">${_fmtN(_areaBruta)} mm²</div>
              <div style="color: rgba(255,255,255,0.5); font-size: 0.72em; margin-top: 2px;">Superficie total (Convex Hull)</div>
            </div>
            <div style="padding: 14px 16px; border-right: 1px solid rgba(255,255,255,0.15);">
              <div style="color: rgba(255,255,255,0.65); font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.5px;">Área P/H (descuento)</div>
              <div style="color: #ff8a65; font-size: 1.25em; font-weight: bold; margin-top: 4px;">− ${_fmtN(_areaPH)} mm²</div>
              <div style="color: rgba(255,255,255,0.5); font-size: 0.72em; margin-top: 2px;">${_pctPH}% del área bruta</div>
            </div>
            <div style="padding: 14px 16px; background: rgba(255,255,255,0.08);">
              <div style="color: #80deea; font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold;">▶ ÁREA NETA (efectiva)</div>
              <div style="color: #e0f7fa; font-size: 1.75em; font-weight: bold; margin-top: 4px; text-shadow: 0 0 12px rgba(128,222,234,0.5);">${_fmtN(_areaNeta)} mm²</div>
              <div style="color: rgba(255,255,255,0.6); font-size: 0.72em; margin-top: 2px;">${_pctNeta}% de superficie efectiva</div>
            </div>
          </div>
        </div>`;

        // RATIOS Y PROPORCIONES
        metricsHTML += `
        <div style="background: linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%); padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 5px solid #9c27b0;">
          <h6 style="color: #6a1b9a; margin: 0 0 10px 0; font-size: 1.05em;">RATIOS Y PROPORCIONES</h6>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 10px; font-size: 0.9em;">
            <div style="background: white; padding: 10px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <strong style="color: #0066cc;">Perforaciones:</strong><br>
              <span style="font-size: 1.3em; font-weight: bold; color: #0066cc;">${(+analisisComparativo.ratios_proporciones.ratio_area_perforaciones_objeto).toFixed(2)}%</span> del área total<br>
              <span style="font-size: 0.85em; color: #666;">Área total: ${(+analisisComparativo.ratios_proporciones.area_total_perforaciones).toFixed(2)} mm²</span><br>
              <span style="font-size: 0.85em; color: #666;">Promedio: ${(+analisisComparativo.ratios_proporciones.area_promedio_perforaciones).toFixed(2)} mm²</span><br>
              <span style="font-size: 0.85em; color: #666;">CV: ${analisisComparativo.ratios_proporciones.coef_variacion_perforaciones}%</span>
              ${analisisComparativo.ratios_proporciones.nota_contencion ? `<br><span style="font-size:0.8em;color:#a0522d;font-style:italic;">⚠️ ${analisisComparativo.ratios_proporciones.nota_contencion}</span>` : ''}
            </div>
            
            <div style="background: white; padding: 10px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <strong style="color: #28a745;">Horadaciones:</strong><br>
              <span style="font-size: 1.3em; font-weight: bold; color: #28a745;">${analisisComparativo.ratios_proporciones.ratio_area_horadaciones_objeto}%</span> del área total<br>
              <span style="font-size: 0.85em; color: #666;">Área total: ${analisisComparativo.ratios_proporciones.area_total_horadaciones} mm²</span><br>
              <span style="font-size: 0.85em; color: #666;">Promedio: ${analisisComparativo.ratios_proporciones.area_promedio_horadaciones} mm²</span><br>
              <span style="font-size: 0.85em; color: #666;">CV: ${analisisComparativo.ratios_proporciones.coef_variacion_horadaciones}%</span>
            </div>
            
            <div style="background: white; padding: 10px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <strong style="color: #6a1b9a;">Total Combinado:</strong><br>
              <span style="font-size: 1.3em; font-weight: bold; color: #6a1b9a;">${analisisComparativo.ratios_proporciones.ratio_area_total_ph_objeto}%</span> del área total<br>
              <span style="font-size: 0.85em; color: #666;">Área neta objeto: ${analisisComparativo.ratios_proporciones.area_neta_objeto} mm²</span><br>
              <span style="font-size: 0.85em; color: #666;">Total P/H: ${analisisComparativo.total_perforaciones_horadaciones}</span>
            </div>
          </div>
        </div>`;
        
        // SIMETRÍA Y DISTRIBUCIÓN ESPACIAL
        metricsHTML += `
        <div style="background: linear-gradient(135deg, #f0f2f5 0%, #bbdefb 100%); padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 5px solid #1976d2;">
          <h6 style="color: #1565c0; margin: 0 0 10px 0; font-size: 1.05em;">SIMETRÍA Y DISTRIBUCIÓN ESPACIAL</h6>
          <div style="background: white; padding: 12px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 10px;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; font-size: 0.9em;">
              <div><strong>Distancia Media:</strong> ${analisisComparativo.simetria_distribucion.distancia_media_al_centroide} mm</div>
              <div><strong>Distancia Máx:</strong> ${analisisComparativo.simetria_distribucion.distancia_maxima_al_centroide} mm</div>
              <div><strong>Distancia Mín:</strong> ${analisisComparativo.simetria_distribucion.distancia_minima_al_centroide} mm</div>
              <div><strong>Regularidad:</strong> <span style="color: ${analisisComparativo.simetria_distribucion.regularidad_espacial === 'Alta' ? '#28a745' : analisisComparativo.simetria_distribucion.regularidad_espacial === 'Media' ? '#ffc107' : '#dc3545'}; font-weight: bold;">${analisisComparativo.simetria_distribucion.regularidad_espacial}</span></div>
            </div>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div style="background: white; padding: 10px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <strong>Distribución Angular:</strong><br>
              <span style="font-size: 1.1em; color: #1565c0; font-weight: bold;">${
                analisisComparativo.simetria_distribucion.distribucion_angular === 'simétrica_radial' ? '⭐ Simétrica Radial' :
                analisisComparativo.simetria_distribucion.distribucion_angular === 'simétrica_bilateral'? 'Simétrica Bilateral':
                'Irregular'
              }</span>
            </div>
            
            <div style="background: white; padding: 10px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <strong>Patrón de Agrupamiento:</strong><br>
              <span style="font-size: 1.1em; color: #1565c0; font-weight: bold;">${
                analisisComparativo.simetria_distribucion.patron_clustering === 'anillo_uniforme' ? '⭕ Anillo Uniforme' :
                analisisComparativo.simetria_distribucion.patron_clustering === 'agrupado_variable'? 'Agrupado Variable':
                'Disperso'
              }</span>
            </div>
          </div>
          
          <div style="background: #fff; padding: 10px; border-radius: 6px; margin-top: 10px; max-height: 150px; overflow-y: auto; font-size: 0.85em;">
            <strong>Posiciones Detalladas:</strong><br>
            <table style="width: 100%; margin-top: 5px; font-size: 0.9em;">
              <tr style="background: #f0f0f0; font-weight: bold;">
                <td style="padding: 4px;">ID</td>
                <td style="padding: 4px;">Distancia (mm)</td>
                <td style="padding: 4px;">Ángulo (°)</td>
              </tr>
              ${analisisComparativo.simetria_distribucion.detalles_posiciones.map(d => `
                <tr>
                  <td style="padding: 4px;">${d.id}</td>
                  <td style="padding: 4px;">${d.distancia_mm}</td>
                  <td style="padding: 4px;">${d.angulo_grados}</td>
                </tr>
              `).join('')}
            </table>
          </div>
        </div>`;
        
        // CLASIFICACIÓN FUNCIONAL
        metricsHTML += `
        <div style="background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 5px solid #f57c00;">
          <h6 style="color: #e65100; margin: 0 0 10px 0; font-size: 1.05em;">CLASIFICACIÓN FUNCIONAL</h6>
          <div style="background: white; padding: 15px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 15px;">
              <div style="font-size: 1.4em; font-weight: bold; color: #f57c00; margin-bottom: 5px;">
                ${analisisComparativo.clasificacion_funcional.categoria.toUpperCase().replace(/_/g, ' ')}
              </div>
              <div style="font-size: 0.9em; color: #666;">
                Confianza: <span style="font-weight: bold; color: ${analisisComparativo.clasificacion_funcional.confianza > 0.7 ? '#28a745' : analisisComparativo.clasificacion_funcional.confianza > 0.5 ? '#ffc107' : '#dc3545'};">${(analisisComparativo.clasificacion_funcional.confianza * 100).toFixed(0)}%</span>
              </div>
            </div>
            
            <div style="padding: 10px; background: #f8f9fa; border-radius: 4px; margin-bottom: 10px; line-height: 1.6;">
              <strong>Interpretación:</strong><br>
              ${analisisComparativo.clasificacion_funcional.descripcion}
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9em;">
              <div style="background: #f8f9fa; padding: 8px; border-radius: 4px;">
                <strong>Técnica:</strong>${analisisComparativo.clasificacion_funcional.tecnica_manufactura}
              </div>
              <div style="background: #f8f9fa; padding: 8px; border-radius: 4px;">
                <strong>Desgaste:</strong>${analisisComparativo.clasificacion_funcional.patron_desgaste.replace(/_/g, '')}
              </div>
            </div>
          </div>
        </div>`;
        
        // COHERENCIA MORFOLÓGICA
        metricsHTML += `
        <div style="background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%); padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 5px solid #388e3c;">
          <h6 style="color: #2e7d32; margin: 0 0 10px 0; font-size: 1.05em;">COHERENCIA MORFOLÓGICA</h6>
          <div style="background: white; padding: 12px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 10px; font-size: 0.9em;">
              <div style="text-align: center; padding: 8px; background: #f1f8e9; border-radius: 4px;">
                <strong>Forma Objeto:</strong><br>
                <span style="font-size: 1.2em; color: #558b2f;">${analisisComparativo.coherencia_morfologica.forma_objeto}</span>
              </div>
              <div style="text-align: center; padding: 8px; background: #f1f8e9; border-radius: 4px;">
                <strong>Forma Predominante P/H:</strong><br>
                <span style="font-size: 1.2em; color: #558b2f;">${analisisComparativo.coherencia_morfologica.forma_predominante_perforaciones}</span>
              </div>
              <div style="text-align: center; padding: 8px; background: #f1f8e9; border-radius: 4px;">
                <strong>Coherencia:</strong><br>
                <span style="font-size: 1.2em; font-weight: bold; color: ${analisisComparativo.coherencia_morfologica.coherencia_formas === 'alta' ? '#28a745' : '#ffc107'};">${analisisComparativo.coherencia_morfologica.coherencia_formas.toUpperCase()}</span>
              </div>
            </div>
            
            <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; margin-bottom: 10px; font-size: 0.85em;">
              <strong>Distribución de Formas:</strong><br>
              ${Object.entries(analisisComparativo.coherencia_morfologica.distribucion_formas).map(([forma, count]) => 
                `<span style="display: inline-block; margin: 3px; padding: 3px 8px; background: #e0e0e0; border-radius: 3px;">${forma}: ${count}</span>`
              ).join('')}
            </div>
            
            <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; margin-bottom: 10px; font-size: 0.9em;">
              <strong>⭕ Análisis de Circularidad:</strong><br>
              Objeto: ${analisisComparativo.coherencia_morfologica.circularidad_objeto} | 
              P/H Media: ${analisisComparativo.coherencia_morfologica.circularidad_media_perforaciones} | 
              Diferencia: ${analisisComparativo.coherencia_morfologica.diferencia_circularidad}
            </div>
            
            <div style="padding: 10px; background: #e8f5e9; border-radius: 4px; line-height: 1.6; font-size: 0.9em; border-left: 3px solid #4caf50;">
              <strong>Interpretación:</strong><br>
              ${analisisComparativo.coherencia_morfologica.interpretacion}
            </div>
          </div>
        </div>`;
      }
    }
    
    // ============================================================================
    // 🆕 OPCIÓN B: MÉTRICAS DE RESUMEN DE PERFORACIONES Y HORADACIONES
    // ============================================================================
    
    // Verificar si hay perforaciones
    if (obj.perforaciones && obj.perforaciones.length > 0) {
      const _phefModal = calcularAreaEfectivaPH(obj.perforaciones || [], obj.horadaciones || []);
      // Para display: usar área BRUTA (suma medida de todas las P)
      // El área efectiva (sin P inscritas en H) se aplica sólo al cálculo del área neta del objeto
      const areaTotalPerforaciones = _phefModal.areaBrutaPerforaciones;
      const _notaContP = _phefModal.numContenidas > 0
        ? ` <small style="color:#888;font-size:10px;">(${_phefModal.numContenidas} inscrita(s) en H — área neta del objeto usa deduplicación)</small>` : '';
      
      // Calcular perímetro total de perforaciones
      const perimetroTotalPerforaciones = obj.perforaciones.reduce((total, perf) => {
        return total + (perf.metricas.perimeter || 0);
      }, 0);
      
      // Obtener unidades (usar las del objeto principal)
      const areaUnit = metricas.area_unit || 'mm²';
      const perimeterUnit = metricas.perimeter_unit || 'mm';
      
      metricsHTML += `
      
      <h5 style="color: #0066cc; margin: 20px 0 10px 0; border-bottom: 2px solid #0066cc; padding-bottom: 5px;">Resumen de Perforaciones</h5>
      
      <div class="morphological-metric" style="background: rgba(0, 102, 204, 0.1); padding: 10px; border-radius: 4px; margin: 5px 0; border-left: 4px solid #0066cc;">
        <span class="label">Número de Perforaciones:</span>
        <span class="value" style="font-weight: bold; color: #0066cc;">${obj.perforaciones.length}</span>
      </div>
      
      <div class="morphological-metric" style="background: rgba(0, 102, 204, 0.05); padding: 8px; border-radius: 4px; margin: 5px 0;">
        <span class="label">Área Total Perforaciones:</span>
        <span class="value">${areaTotalPerforaciones.toFixed(2)} ${areaUnit}${_notaContP}</span>
      </div>
      
      <div class="morphological-metric" style="background: rgba(0, 102, 204, 0.05); padding: 8px; border-radius: 4px; margin: 5px 0;">
        <span class="label">Perímetro Total Perforaciones:</span>
        <span class="value">${perimetroTotalPerforaciones.toFixed(2)} ${perimeterUnit}</span>
      </div>
      
      <div class="morphological-metric" style="background: rgba(0, 102, 204, 0.05); padding: 8px; border-radius: 4px; margin: 5px 0;">
        <span class="label">Área Promedio por Perforación:</span>
        <span class="value">${(areaTotalPerforaciones / obj.perforaciones.length).toFixed(2)} ${areaUnit}</span>
      </div>
      
      <div class="morphological-metric" style="background: rgba(0, 102, 204, 0.05); padding: 8px; border-radius: 4px; margin: 5px 0;">
        <span class="label">% Área Perforaciones vs Objeto:</span>
        <span class="value">${((areaTotalPerforaciones / metricas.area) * 100).toFixed(2)}%</span>
      </div>`;
    }
    
    // Verificar si hay horadaciones
    if (obj.horadaciones && obj.horadaciones.length > 0) {
      // Área efectiva horadaciones (siempre es el área del contenedor)
      const _phefModalH = calcularAreaEfectivaPH(obj.perforaciones || [], obj.horadaciones || []);
      const areaTotalHoradaciones = _phefModalH.areaTotalHoradaciones;
      
      // Calcular perímetro total de horadaciones
      const perimetroTotalHoradaciones = obj.horadaciones.reduce((total, hora) => {
        return total + (hora.metricas.perimeter || 0);
      }, 0);
      
      // Obtener unidades
      const areaUnit = metricas.area_unit || 'mm²';
      const perimeterUnit = metricas.perimeter_unit || 'mm';
      
      metricsHTML += `
      
      <h5 style="color: #28a745; margin: 20px 0 10px 0; border-bottom: 2px solid #28a745; padding-bottom: 5px;">Resumen de Horadaciones</h5>
      
      <div class="morphological-metric" style="background: rgba(40, 167, 69, 0.1); padding: 10px; border-radius: 4px; margin: 5px 0; border-left: 4px solid #28a745;">
        <span class="label">Número de Horadaciones:</span>
        <span class="value" style="font-weight: bold; color: #28a745;">${obj.horadaciones.length}</span>
      </div>
      
      <div class="morphological-metric" style="background: rgba(40, 167, 69, 0.05); padding: 8px; border-radius: 4px; margin: 5px 0;">
        <span class="label">Área Total Horadaciones:</span>
        <span class="value">${areaTotalHoradaciones.toFixed(2)} ${areaUnit}</span>
      </div>
      
      <div class="morphological-metric" style="background: rgba(40, 167, 69, 0.05); padding: 8px; border-radius: 4px; margin: 5px 0;">
        <span class="label">Perímetro Total Horadaciones:</span>
        <span class="value">${perimetroTotalHoradaciones.toFixed(2)} ${perimeterUnit}</span>
      </div>
      
      <div class="morphological-metric" style="background: rgba(40, 167, 69, 0.05); padding: 8px; border-radius: 4px; margin: 5px 0;">
        <span class="label">Área Promedio por Horadación:</span>
        <span class="value">${(areaTotalHoradaciones / obj.horadaciones.length).toFixed(2)} ${areaUnit}</span>
      </div>
      
      <div class="morphological-metric" style="background: rgba(40, 167, 69, 0.05); padding: 8px; border-radius: 4px; margin: 5px 0;">
        <span class="label">% Área Horadaciones vs Objeto:</span>
        <span class="value">${((areaTotalHoradaciones / metricas.area) * 100).toFixed(2)}%</span>
      </div>`;
    }
    
    // Verificar si hay patrón de agrupamiento (ya se muestra arriba pero lo agregamos como métrica exportable)
    if (metricas.patron_agrupamiento) {
      metricsHTML += `
      
      <h5 style="color: #ff9800; margin: 20px 0 10px 0; border-bottom: 2px solid #ff9800; padding-bottom: 5px;">Análisis de Patrón</h5>
      
      <div class="morphological-metric" style="background: rgba(255, 152, 0, 0.1); padding: 10px; border-radius: 4px; margin: 5px 0; border-left: 4px solid #ff9800;">
        <span class="label">Total P/H Detectadas:</span>
        <span class="value" style="font-weight: bold; color: #ff9800;">${(obj.perforaciones?.length || 0) + (obj.horadaciones?.length || 0)}</span>
      </div>`;
    }
    
    // ============================================================================
    // 🔭 ERROR ÓPTICO POSICIONAL
    // Aparece cuando el análisis calculó el modelo de distorsión+perspectiva.
    // El bloque es agnóstico al modo: funciona igual para monofacial y bifacial
    // porque `metricas` ya viene con los campos del objeto correcto.
    // ============================================================================
    if (metricas.error_optico_lineal_percent !== undefined) {
      const eL    = parseFloat(metricas.error_optico_lineal_percent  || 0);
      const eA    = parseFloat(metricas.error_optico_area_percent    || 0);
      const eDist = parseFloat(metricas.error_distorsion_percent     || 0);
      const ePerp = parseFloat(metricas.error_perspectiva_percent    || 0);
      const rNorm = parseFloat(metricas.posicion_radial_norm         || 0);
      const ang   = parseFloat(metricas.angulo_optico_deg            || 0);
      const fov   = parseFloat(metricas.fov_diagonal_deg             || 0);
      const k1    = metricas.k1_estimado ?? '—';
      const conf  = metricas.confianza_optica || '—';
      const nota  = metricas.nota_error_optico || 'k₁ estimado sin calibración formal de lente (incertidumbre del modelo ±30%)';

      // Color del badge de confianza (igual que en renderAnalysisMetadata)
      let colorConf = '#6c757d';
      if (eL < 0.5)       colorConf = '#28a745';
      else if (eL < 1.5)  colorConf = '#17a2b8';
      else if (eL < 3.0)  colorConf = '#ffc107';
      else if (eL < 6.0)  colorConf = '#fd7e14';
      else                colorConf = '#dc3545';

      // Incertidumbres absolutas de las métricas clave (si fueron propagadas)
      let filasIncert = '';
      if (metricas._incertidumbre_optica_aplicada) {
        const metrPares = [
          ['area',      metricas.area,      'mm²'],
          ['perimeter', metricas.perimeter, 'mm' ],
          ['width',     metricas.width,     'mm' ],
          ['height',    metricas.height,    'mm' ],
          ['eje_mayor', metricas.eje_mayor, 'mm' ],
          ['eje_menor', metricas.eje_menor, 'mm' ],
        ];
        filasIncert = metrPares.map(([k, v, u]) => {
          const e  = metricas[`${k}_incertidumbre_abs`];
          const mn = metricas[`${k}_rango_min`];
          const mx = metricas[`${k}_rango_max`];
          if (e === undefined || v === undefined) return '';
          const label = { area:'Área', perimeter:'Perímetro', width:'Ancho',
                          height:'Alto', eje_mayor:'Eje Mayor', eje_menor:'Eje Menor' }[k] || k;
          return `<tr>
            <td style="padding:4px 8px; font-size:12px; color:#495057;">${label}</td>
            <td style="padding:4px 8px; font-size:12px; text-align:right;">${parseFloat(v).toFixed(3)} ${u}</td>
            <td style="padding:4px 8px; font-size:12px; text-align:right; color:${colorConf}; font-weight:600;">± ${parseFloat(e).toFixed(4)} ${u}</td>
            <td style="padding:4px 8px; font-size:12px; text-align:right; color:#6c757d;">[${parseFloat(mn).toFixed(3)} – ${parseFloat(mx).toFixed(3)}]</td>
          </tr>`;
        }).join('');
      }

      metricsHTML += `
      <h5 style="color:#6f42c1; margin:20px 0 10px 0; border-bottom:2px solid #6f42c1; padding-bottom:5px;">Incertidumbre Óptica Posicional</h5>

      <div style="background:linear-gradient(135deg,#f3e5f5 0%,#e8eaf6 100%); border-left:5px solid #6f42c1; border-radius:8px; padding:14px; margin:6px 0;">

        <!-- Fila resumen -->
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
          <span style="background:${colorConf}; color:white; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:700;">${conf}</span>
          <span style="font-size:13px; color:#495057;">Error lineal: <strong style="color:${colorConf};">±${eL.toFixed(2)}%</strong></span>
          <span style="font-size:13px; color:#495057;">Error área: <strong style="color:${colorConf};">±${eA.toFixed(2)}%</strong></span>
          <span style="font-size:12px; background:#e9ecef; padding:3px 8px; border-radius:4px; color:#6c757d;">FOV ${fov.toFixed(1)}° | k₁=${k1}</span>
        </div>

        <!-- Componentes -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:10px;">
          <div style="background:white; border-radius:6px; padding:8px; box-shadow:0 1px 3px rgba(0,0,0,.08);">
            <div style="font-size:11px; color:#6c757d; margin-bottom:2px;">Distorsión radial (k₁)</div>
            <div style="font-size:15px; font-weight:700; color:#6f42c1;">±${eDist.toFixed(3)}%</div>
          </div>
          <div style="background:white; border-radius:6px; padding:8px; box-shadow:0 1px 3px rgba(0,0,0,.08);">
            <div style="font-size:11px; color:#6c757d; margin-bottom:2px;">Perspectiva (cos²θ)</div>
            <div style="font-size:15px; font-weight:700; color:#3f51b5;">±${ePerp.toFixed(3)}%</div>
          </div>
          <div style="background:white; border-radius:6px; padding:8px; box-shadow:0 1px 3px rgba(0,0,0,.08);">
            <div style="font-size:11px; color:#6c757d; margin-bottom:2px;">Posición radial</div>
            <div style="font-size:14px; font-weight:600;">${(rNorm * 100).toFixed(1)}% del radio</div>
            <div style="font-size:10px; color:#9e9e9e;">0%=centro · 100%=borde</div>
          </div>
          <div style="background:white; border-radius:6px; padding:8px; box-shadow:0 1px 3px rgba(0,0,0,.08);">
            <div style="font-size:11px; color:#6c757d; margin-bottom:2px;">Ángulo óptico</div>
            <div style="font-size:14px; font-weight:600;">${ang.toFixed(2)}°</div>
          </div>
        </div>

        ${filasIncert ? `
        <!-- Tabla de incertidumbres por métrica -->
        <div style="background:white; border-radius:6px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,.08); margin-bottom:8px;">
          <table style="width:100%; border-collapse:collapse; font-size:12px;">
            <thead>
              <tr style="background:#6f42c1; color:white;">
                <th style="padding:5px 8px; text-align:left; font-weight:600;">Métrica</th>
                <th style="padding:5px 8px; text-align:right; font-weight:600;">Valor</th>
                <th style="padding:5px 8px; text-align:right; font-weight:600;">Incertidumbre</th>
                <th style="padding:5px 8px; text-align:right; font-weight:600;">Rango posible</th>
              </tr>
            </thead>
            <tbody style="font-family:monospace;">
              ${filasIncert}
            </tbody>
          </table>
        </div>` : ''}

        <!-- Nota metodológica -->
        <div style="font-size:11px; color:#6c757d; background:#f8f9fa; padding:6px 10px; border-radius:4px; border-left:3px solid #adb5bd;">
          ${nota}
        </div>
        <div style="font-size:11px; color:#6c757d; margin-top:4px;">
          Métricas <em>no afectadas</em>(adimensionales): circularity · compactness · aspect_ratio · solidity · rectangularity · elongation
        </div>
      </div>`;
    }

    // Agregar botones de exportación (solo botones ocultos para futuro uso)
    metricsHTML += `
      <div style="display: none;">
        <button id="exportReportPDFBtn"></button>
        <button id="exportReportHTMLBtn"></button>
        <button id="exportAnalisisJSONBtn"></button>
        <button id="exportAnalisisCSVBtn"></button>
        <button id="verEstadoAnalisisBtn"></button>
      </div>
    `;
    
    // Mostrar métricas en el panel
    morphologicalMetrics.innerHTML = metricsHTML;
    currentAnalyzedObject = { obj, metricas, efaPromise: null };
    window.currentAnalyzedObject = currentAnalyzedObject; // Sincronizar con scope global
    currentAnalyzedObject.efaPromise = renderPanelEFA(obj, metricas);
    
    // ============================================================================
    // 🆕 INICIALIZAR TOOLTIPS - FASE 1 UI IMPROVEMENTS
    // ============================================================================
    initTooltips();
    console.log('✨ Tooltips inicializados en análisis morfológico');
    
    // 🔍 ASIGNAR TIPO DE OBJETO (para exportación PDF)
    if (!obj.tipo) {
      obj.tipo = obj.cara && (obj.cara === 'A' || obj.cara === 'B') ? 'bifacial' : 'monofacial';
      console.log(`🏷️ Tipo de objeto asignado: ${obj.tipo} (cara: ${obj.cara || 'mono'})`);
    }
    
    // Guardar referencia del objeto analizado
    currentAnalyzedObject.obj = obj;
    currentAnalyzedObject.metricas = metricas;
    window.currentAnalyzedObject = currentAnalyzedObject; // Sincronizar con scope global
    
    // ❌ LÓGICA DE BOTÓN BIFACIAL COMPLETO ELIMINADA - Ahora usa botón unificado
    
    /* ❌ EVENT LISTENER DEL BOTÓN DE GUARDADO ELIMINADO (UI-only cleanup)
    // 🆕 MOSTRAR BOTÓN DE GUARDADO EXPLÍCITO (solo para objetos bifaciales)
    const saveButtonContainer = document.getElementById('saveAnalysisButtonContainer');
    const saveButton = document.getElementById('saveAnalysisForComparisonBtn');
    const saveStatus = document.getElementById('saveAnalysisStatus');
    
    if (obj.numeroObjeto && obj.cara) {
      // Es un objeto bifacial - mostrar botón
      saveButtonContainer.style.display = 'block';
      saveStatus.style.display = 'block';
      
      // Actualizar texto del botón según la cara
      const caraIcono = obj.cara === 'A'? '': '';
      const caraTexto = obj.cara === 'A' ? 'Anverso (A)' : 'Reverso (B)';
      saveButton.innerHTML = `
        <span>Guardar Análisis Completo - ${obj.id}</span>
      `;
      
      // Verificar estado actual
      const objGuardado = analisisMorfologicos.objetos.find(
        o => o.numeroObjeto === obj.numeroObjeto && o.cara === obj.cara
      );
      
      const yaGuardado = objGuardado !== undefined;
      
      if (yaGuardado) {
        saveStatus.innerHTML = `Análisis de Cara ${obj.cara} ya guardado. Puedes actualizarlo con nuevas perforaciones/horadaciones.`;
        saveStatus.style.color = '#28a745';
      } else {
        saveStatus.innerHTML = `Análisis de Cara ${obj.cara} pendiente de guardado explícito.`;
        saveStatus.style.color = '#ffc107';
      }
      
      // Configurar evento del botón
      saveButton.onclick = async () => {
        // Re-guardar con datos actualizados (incluye P/H agregadas después del análisis inicial)
        // guardarEnDisco = true porque es un guardado manual explícito del usuario
        const resultado = await guardarAnalisisMorfologico(obj, true);
        
        if (resultado !== false) {
          saveStatus.innerHTML = `Análisis de Cara ${obj.cara} guardado exitosamente a las ${new Date().toLocaleTimeString()}`;
          saveStatus.style.color = '#28a745';
          
          // Actualizar visibilidad del botón de comparación
          if (obj.numeroObjeto) {
            actualizarVisibilidadBotonComparacion(obj.numeroObjeto);
          }
          
          // Feedback visual en el botón (ajustado para tamaño compacto)
          const originalBg = saveButton.style.background;
          saveButton.style.background = 'linear-gradient(135deg, #20c997 0%, #28a745 100%)';
          saveButton.innerHTML = `
            <span>Guardado Exitoso - ${caraIcono} ${caraTexto}</span>
          `;
          
          setTimeout(() => {
            saveButton.style.background = originalBg;
            saveButton.innerHTML = `
              <span>Guardar Análisis Completo - ${obj.id}</span>
            `;
          }, 2000);
          
          UtilityHelpers.setStatus(`Análisis guardado: ${obj.id} (Cara ${obj.cara}, Objeto ${obj.numeroObjeto})`, false);
        } else {
          saveStatus.innerHTML = `Error al guardar. Verifica que el análisis esté completo.`;
          saveStatus.style.color = '#dc3545';
          UtilityHelpers.setStatus(`Error al guardar análisis de Cara ${obj.cara}`, true);
        }
      };
      
      // Efecto hover (ajustado para botón compacto)
      saveButton.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-1px)';
        this.style.boxShadow = '0 4px 12px rgba(40, 167, 69, 0.5)';
      });
      saveButton.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0)';
        this.style.boxShadow = '0 2px 6px rgba(40, 167, 69, 0.3)';
      });
      
    } else {
      // No es bifacial - ocultar botón y status
      saveButtonContainer.style.display = 'none';
      saveStatus.style.display = 'none';
    }
    */
    
    // Scroll hacia la sección
    morphologicalAnalysisContainer.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
    
    // ============================================================================
    // VISUALIZACIÓN DE CONTORNO DEPURADO
    // ============================================================================
    if (metricas._forma_idealizada) {
      console.log(`🔺 Dibujando contorno depurado: ${metricas._forma_idealizada.nombre}`);
      
      const idealizedShapeContainer = document.getElementById('idealizedShapeContainer');
      const idealizedShapeCanvas = document.getElementById('idealizedShapeCanvas');
      const idealizedShapeParams = document.getElementById('idealizedShapeParams');
      
      // Mostrar el contenedor
      idealizedShapeContainer.style.display = 'block';
      const _grpB = document.getElementById('morphGroupB');
      if (_grpB) _grpB.open = true;
      
      // Inicializar contexto si es necesario
      if (!idealizedShapeCtx) {
        idealizedShapeCtx = idealizedShapeCanvas.getContext('2d');
      }
      
      // Limpiar canvas
      idealizedShapeCtx.clearRect(0, 0, idealizedShapeCanvas.width, idealizedShapeCanvas.height);
      idealizedShapeCtx.fillStyle = '#ffffff';
      idealizedShapeCtx.fillRect(0, 0, idealizedShapeCanvas.width, idealizedShapeCanvas.height);
      
      // Calcular escala para centrar y ajustar al canvas
      const forma = metricas._forma_idealizada;
      const params = forma.parametros;
      const canvasWidth = idealizedShapeCanvas.width;
      const canvasHeight = idealizedShapeCanvas.height;
      
      // Encontrar límites del objeto original
      const objWidth = obj.width;
      const objHeight = obj.height;
      
      // Calcular escala para que el objeto quepa con margen del 10%
      const escala = Math.min(
        (canvasWidth * 0.8) / objWidth,
        (canvasHeight * 0.8) / objHeight
      );
      
      // Calcular offset para centrar
      const offsetX = (canvasWidth - objWidth * escala) / 2;
      const offsetY = (canvasHeight - objHeight * escala) / 2;
      
      // Dibujar contorno depurado (CONTORNO REAL SIMPLIFICADO)
      idealizedShapeCtx.strokeStyle = forma.color || '#007bff';
      idealizedShapeCtx.lineWidth = 3;
      idealizedShapeCtx.fillStyle = forma.color ? forma.color + '15' : '#007bff15'; // Muy transparente
      idealizedShapeCtx.beginPath();
      
      if (forma.vertices && forma.vertices.length > 0) {
        // Convertir coordenadas de absolutas a relativas al objeto, luego escalar para el canvas
        const getX = (p) => p.x !== undefined ? p.x : p[0];
        const getY = (p) => p.y !== undefined ? p.y : p[1];
        
        const x0 = (getX(forma.vertices[0]) - obj.minX) * escala + offsetX;
        const y0 = (getY(forma.vertices[0]) - obj.minY) * escala + offsetY;
        
        idealizedShapeCtx.moveTo(x0, y0);
        
        for (let i = 1; i < forma.vertices.length; i++) {
          const xi = (getX(forma.vertices[i]) - obj.minX) * escala + offsetX;
          const yi = (getY(forma.vertices[i]) - obj.minY) * escala + offsetY;
          idealizedShapeCtx.lineTo(xi, yi);
        }
        
        idealizedShapeCtx.closePath();
        idealizedShapeCtx.fill();
        idealizedShapeCtx.stroke();
        
        console.log(`✅ Contorno depurado dibujado: ${forma.vertices.length} puntos`);
      }
      
      // ============================================================================
      // 🆕 DIBUJAR CENTROIDE DEL CONVEX HULL Y EJES
      // ============================================================================
      
      const _cdmI = metricas._contour_data?.metrics;
      const _centHullI = _cdmI?.centroid_hull || _cdmI?.centroid ||
        (metricas.centroide_hull_x != null
          ? [parseFloat(metricas.centroide_hull_x), parseFloat(metricas.centroide_hull_y)]
          : null);
      if (_centHullI) {
        
        // 1. Dibujar CENTROIDE del Convex Hull (forma completa estimada)
        const centroidHull = _centHullI;
        const centroidX = (centroidHull[0] - obj.minX) * escala + offsetX;
        const centroidY = (centroidHull[1] - obj.minY) * escala + offsetY;
        
        // Círculo naranja para centroide del Hull
        idealizedShapeCtx.fillStyle = '#ff6600';
        idealizedShapeCtx.beginPath();
        idealizedShapeCtx.arc(centroidX, centroidY, 6, 0, 2 * Math.PI);
        idealizedShapeCtx.fill();
        
        // Borde blanco para mejor contraste
        idealizedShapeCtx.strokeStyle = '#ffffff';
        idealizedShapeCtx.lineWidth = 2;
        idealizedShapeCtx.stroke();
        
        console.log(`✅ Centroide del Convex Hull dibujado - NARANJA`);
        
        // 2. Dibujar EJES MAYOR Y MENOR (RECORTADOS DENTRO DEL CONTORNO)
        if (metricas.eje_mayor_p1_recortado) {
          // Eje MAYOR (rojo) - solo dentro del contorno
          const ejeMayorP1X = (metricas.eje_mayor_p1_recortado[0] - obj.minX) * escala + offsetX;
          const ejeMayorP1Y = (metricas.eje_mayor_p1_recortado[1] - obj.minY) * escala + offsetY;
          const ejeMayorP2X = (metricas.eje_mayor_p2_recortado[0] - obj.minX) * escala + offsetX;
          const ejeMayorP2Y = (metricas.eje_mayor_p2_recortado[1] - obj.minY) * escala + offsetY;
            
            idealizedShapeCtx.strokeStyle = '#ff0000';
            idealizedShapeCtx.lineWidth = 3;
            idealizedShapeCtx.setLineDash([10, 5]);
            idealizedShapeCtx.beginPath();
            idealizedShapeCtx.moveTo(ejeMayorP1X, ejeMayorP1Y);
            idealizedShapeCtx.lineTo(ejeMayorP2X, ejeMayorP2Y);
            idealizedShapeCtx.stroke();
            
            // Eje MENOR (verde) - solo dentro del contorno
            const ejeMenorP1X = (metricas.eje_menor_p1_recortado[0] - obj.minX) * escala + offsetX;
            const ejeMenorP1Y = (metricas.eje_menor_p1_recortado[1] - obj.minY) * escala + offsetY;
            const ejeMenorP2X = (metricas.eje_menor_p2_recortado[0] - obj.minX) * escala + offsetX;
            const ejeMenorP2Y = (metricas.eje_menor_p2_recortado[1] - obj.minY) * escala + offsetY;
            
            idealizedShapeCtx.strokeStyle = '#00ff00';
            idealizedShapeCtx.lineWidth = 3;
            idealizedShapeCtx.setLineDash([10, 5]);
            idealizedShapeCtx.beginPath();
            idealizedShapeCtx.moveTo(ejeMenorP1X, ejeMenorP1Y);
            idealizedShapeCtx.lineTo(ejeMenorP2X, ejeMenorP2Y);
            idealizedShapeCtx.stroke();
            idealizedShapeCtx.setLineDash([]);
            
            console.log(`✅ Ejes MAYOR (rojo) y MENOR (verde) dibujados (recortados)`);
          }
          
          // 🆕 3. Dibujar RADIOS MÁXIMO Y MÍNIMO
          if (metricas.punto_radio_maximo && metricas.punto_radio_minimo) {
            // Radio MÁXIMO (azul cielo)
            const puntoMaxX = (metricas.punto_radio_maximo[0] - obj.minX) * escala + offsetX;
            const puntoMaxY = (metricas.punto_radio_maximo[1] - obj.minY) * escala + offsetY;
            
            idealizedShapeCtx.strokeStyle = '#00bfff';
            idealizedShapeCtx.lineWidth = 2;
            idealizedShapeCtx.setLineDash([5, 3]);
            idealizedShapeCtx.beginPath();
            idealizedShapeCtx.moveTo(centroidX, centroidY);
            idealizedShapeCtx.lineTo(puntoMaxX, puntoMaxY);
            idealizedShapeCtx.stroke();
            
            // Marcar punto extremo
            idealizedShapeCtx.fillStyle = '#00bfff';
            idealizedShapeCtx.beginPath();
            idealizedShapeCtx.arc(puntoMaxX, puntoMaxY, 5, 0, 2 * Math.PI);
            idealizedShapeCtx.fill();
            idealizedShapeCtx.setLineDash([]);
            
            // Radio MÍNIMO (magenta)
            const puntoMinX = (metricas.punto_radio_minimo[0] - obj.minX) * escala + offsetX;
            const puntoMinY = (metricas.punto_radio_minimo[1] - obj.minY) * escala + offsetY;
            
            idealizedShapeCtx.strokeStyle = '#ff1493';
            idealizedShapeCtx.lineWidth = 2;
            idealizedShapeCtx.setLineDash([5, 3]);
            idealizedShapeCtx.beginPath();
            idealizedShapeCtx.moveTo(centroidX, centroidY);
            idealizedShapeCtx.lineTo(puntoMinX, puntoMinY);
            idealizedShapeCtx.stroke();
            
            // Marcar punto extremo
            idealizedShapeCtx.fillStyle = '#ff1493';
            idealizedShapeCtx.beginPath();
            idealizedShapeCtx.arc(puntoMinX, puntoMinY, 5, 0, 2 * Math.PI);
            idealizedShapeCtx.fill();
            idealizedShapeCtx.setLineDash([]);
            
            console.log(`✅ Radios MÁXIMO (azul) y MÍNIMO (magenta) dibujados`);
          }
        
        // 4. Dibujar ejes de referencia X e Y (grises)
        idealizedShapeCtx.strokeStyle = '#cccccc';
        idealizedShapeCtx.lineWidth = 1;
        idealizedShapeCtx.setLineDash([3, 3]);
        
        // Eje X (horizontal)
        idealizedShapeCtx.beginPath();
        idealizedShapeCtx.moveTo(0, centroidY);
        idealizedShapeCtx.lineTo(canvasWidth, centroidY);
        idealizedShapeCtx.stroke();
        
        // Eje Y (vertical)
        idealizedShapeCtx.beginPath();
        idealizedShapeCtx.moveTo(centroidX, 0);
        idealizedShapeCtx.lineTo(centroidX, canvasHeight);
        idealizedShapeCtx.stroke();
        
        idealizedShapeCtx.setLineDash([]);
        
        console.log(`✅ Centroide y ejes dibujados en canvas idealizado`);
      }
      
      // Generar estadísticas de depuración
      let paramsHTML = `
        <div style="padding: 10px; background: ${forma.color}20; border-radius: 6px; margin-bottom: 10px;">
          <strong style="font-size: 1.2em; color: ${forma.color};">
            ${forma.nombre}
          </strong>
        </div>
        
        <div style="line-height: 1.8;">
          <strong>Procesamiento Estadístico:</strong><br><br>
          
          <strong>Puntos Detectados:</strong> ${params.puntos_originales}<br>
          <strong>Artefactos Eliminados:</strong> ${params.artefactos_eliminados} 
          <span style="color: #dc3545;">(${((params.artefactos_eliminados/params.puntos_originales)*100).toFixed(1)}%)</span><br>
          <strong>Puntos Filtrados:</strong> ${params.puntos_filtrados}<br>
          <strong>Puntos Finales:</strong> ${params.puntos_simplificados}
          <span style="color: #28a745;">(reducción ${params.reduccion_porcentaje}%)</span><br><br>
          
          <strong>Parámetros Algoritmo:</strong><br><br>
          <strong>Continuidad Promedio:</strong> ${params.continuidad_promedio}<br>
          <strong>Umbral Continuidad:</strong> ${params.umbral_continuidad}<br>
          <strong>Epsilon Adaptativo:</strong> ${params.epsilon_usado} px<br>
          <strong>Vértices Significativos:</strong> ${params.vertices_significativos}<br><br>
          
          <strong>Geometría Preservada:</strong><br><br>
          <strong>Dimensiones:</strong> ${params.ancho} × ${params.alto} px<br>
          <strong>Radio Equiv.:</strong> ${params.radio_equivalente} px<br>
          <strong>Área:</strong> ${params.area} px²<br>
          <strong>Perímetro:</strong> ${params.perimetro} px
        </div>
        
        <div style="margin-top: 15px; padding: 10px; background: #fff3cd; border-radius: 6px; font-size: 0.85em; border-left: 4px solid #ffc107; line-height: 1.6;">
          <strong>Pipeline de Depuración:</strong><br>
          1⃣ Análisis de continuidad geométrica<br>
          2⃣ Filtrado de ${params.artefactos_eliminados} artefactos de digitalización<br>
          3⃣ Suavizado Gaussiano (σ=windowSize/3)<br>
          4⃣ Detección de ${params.vertices_significativos} vértices significativos<br>
          5⃣ Simplificación Douglas-Peucker (ε=${params.epsilon_usado}px)<br><br>
          <strong style="color: #856404;">Resultado: Geometría real sin ruido pixel-a-pixel</strong>
        </div>
        
        <div style="margin-top: 10px; padding: 8px; background: #fff9e6; border-radius: 6px; font-size: 0.8em;">
          <strong>Visualización:</strong><br>
          <span style="color: ${forma.color};">█</span> Forma Simplificada<br>
          <span style="color: #ff6600;">●</span> Centroide<br>
          <span style="color: #666666;">--</span> Ejes X e Y
        </div>
      `;
      
      idealizedShapeParams.innerHTML = paramsHTML;
      
    } else {
      // Ocultar el contenedor si no hay forma idealizada
      const idealizedShapeContainer = document.getElementById('idealizedShapeContainer');
      if (idealizedShapeContainer) {
        idealizedShapeContainer.style.display = 'none';
        const _grpB2 = document.getElementById('morphGroupB');
        if (_grpB2) _grpB2.open = false;
      }
      console.log(`⚠️ No hay forma idealizada disponible para mostrar`);
    }
    
    // ============================================================================
    // 🆕 DIBUJAR PERFORACIONES Y HORADACIONES EN EL CANVAS MORFOLÓGICO
    // ============================================================================
    // Esto asegura que las perforaciones/horadaciones siempre sean visibles
    // en el canvas del objeto detectado una vez trazadas
    if (obj.perforaciones?.length > 0 || obj.horadaciones?.length > 0) {
      console.log(`🎨 Dibujando perforaciones/horadaciones en canvas morfológico...`);
      redibujarMorphologicalCanvasConPerforaciones(obj, metricas);
    }
    
    // ============================================================================
    // 🆕 GENERAR CANVAS ESQUEMÁTICO - VISTA MORFOMÉTRICA SIN IMAGEN
    // ============================================================================
    VisualizationExport.generarCanvasEsquematico(obj, metricas);
    
    // ============================================================================
    // 💾 AUTO-GUARDAR CANVAS EN OBJ — disponible para PDF sin acceder al DOM
    // Se ejecuta tras requestAnimationFrame para asegurar que el compositing
    // del canvas 2D esté completamente finalizado.
    // ============================================================================
    requestAnimationFrame(() => {
      // Restaurar el obj de detección original (puede ser distinto al que llegó si
      // mostrarAnalisisMorfologico fue llamado con un objParaRender desde objects[]).
      const _objTarget = (typeof objects !== 'undefined' && objects)
        ? (objects.find(o => o.id === obj.id) || obj)
        : obj;
      guardarCanvasEnObjeto(_objTarget);
    });

    console.log(`📊 Métricas morfológicas mostradas para objeto ${obj.id}`);
  }


export function generarCanvasEsquematico(obj, metricas) {
    console.log(`📐 Generando canvas esquemático para ${obj.id}...`);
    
    const schematicContainer = document.getElementById('schematicCanvasContainer');
    const schematicCanvas = document.getElementById('schematicCanvas');
    
    if (!schematicContainer || !schematicCanvas) {
      console.warn('⚠️ Canvas esquemático no encontrado en el DOM');
      return;
    }
    
    // Mostrar contenedor
    schematicContainer.style.display = 'block';
    const _grpC = document.getElementById('morphGroupC');
    if (_grpC) _grpC.open = true;
    
    // Configurar tamaño del canvas (mismo que morfológico para consistencia)
    const maxCanvasSize = 640;
    const scale = Math.min(maxCanvasSize / obj.width, maxCanvasSize / obj.height);
    const scaledWidth = Math.round(obj.width * scale);
    const scaledHeight = Math.round(obj.height * scale);
    
    schematicCanvas.width = obj.width;
    schematicCanvas.height = obj.height;
    schematicCanvas.style.width = `${scaledWidth}px`;
    schematicCanvas.style.height = `${scaledHeight}px`;
    
    const ctx = schematicCanvas.getContext('2d');
    
    // Limpiar canvas (fondo blanco)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, obj.width, obj.height);
    
    console.log(`   📏 Canvas: ${obj.width}×${obj.height}px → ${scaledWidth}×${scaledHeight}px (escala: ${scale.toFixed(2)}x)`);
    
    // Obtener configuración de capas visibles
    const config = {
      contorno: document.getElementById('schematic_contorno')?.checked ?? true,
      convexhull: document.getElementById('schematic_convexhull')?.checked ?? true,
      centroide: document.getElementById('schematic_centroide')?.checked ?? true,
      bbox: document.getElementById('schematic_bbox')?.checked ?? true,
      ejes: document.getElementById('schematic_ejes')?.checked ?? true,
      radios: document.getElementById('schematic_radios')?.checked ?? true,
      perforaciones: document.getElementById('schematic_perforaciones')?.checked ?? true,
      horadaciones: document.getElementById('schematic_horadaciones')?.checked ?? true,
      labels: document.getElementById('schematic_labels')?.checked ?? true
    };
    
    // Ajustar grosores de línea según tamaño del objeto (más discreto)
    const baseLineWidth = Math.max(0.5, Math.min(1.5, obj.width / 300));
    const thinLineWidth = baseLineWidth * 0.8;
    const mediumLineWidth = baseLineWidth * 1.2;
    const thickLineWidth = baseLineWidth * 1.5;
    
    // ============================================================================
    // CAPA 1: BOUNDING BOX (Rectángulo envolvente)
    // ============================================================================
    if (config.bbox) {
      ctx.strokeStyle = '#cccccc'; // Gris claro más discreto
      ctx.lineWidth = thinLineWidth;
      ctx.setLineDash([4, 4]); // Línea punteada sutil
      ctx.strokeRect(0, 0, obj.width, obj.height);
      ctx.setLineDash([]);
      console.log(`   ✅ Bounding Box dibujado`);
    }
    
    // ============================================================================
    // CAPA 2: CONVEX HULL (Forma completa estimada)
    // ============================================================================
    // Prioridad: obj.convexHull > metricas._contour_data.metrics.convex_hull
    const convexHullSource = obj.convexHull || metricas._contour_data?.metrics?.convex_hull;
    
    if (config.convexhull && convexHullSource && convexHullSource.length > 2) {
      console.log(`   🔶 Dibujando Convex Hull en canvas esquemático (${convexHullSource.length} vértices)...`);
      
      ctx.strokeStyle = '#ff8800'; // Naranja brillante (igual que otros canvas)
      ctx.lineWidth = mediumLineWidth;
      ctx.setLineDash([8, 4]); // Igual que debug y morfológico
      ctx.beginPath();
      
      // _hullIsAbsolute=true → coords absolutas → restar minX/minY para canvas relativo
      // _hullIsAbsolute no definido (cálculo JS) → coords ya relativas al bbox
      // metricas._contour_data.metrics.convex_hull → siempre absolutas
      const isRelative = obj.convexHull !== undefined && !obj._hullIsAbsolute;
      
      const firstPt = convexHullSource[0];
      const firstX = isRelative ? firstPt[0] : (firstPt[0] - obj.minX);
      const firstY = isRelative ? firstPt[1] : (firstPt[1] - obj.minY);
      ctx.moveTo(firstX, firstY);
      
      for (let i = 1; i < convexHullSource.length; i++) {
        const pt = convexHullSource[i];
        const ptX = isRelative ? pt[0] : (pt[0] - obj.minX);
        const ptY = isRelative ? pt[1] : (pt[1] - obj.minY);
        ctx.lineTo(ptX, ptY);
      }
      
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      console.log(`   ✅ Convex Hull dibujado en canvas esquemático (${convexHullSource.length} puntos, ${isRelative ? 'coords relativas' : 'coords absolutas'})`);
    } else {
      console.warn(`   ⚠️ Convex Hull NO disponible para canvas esquemático - obj.convexHull: ${!!obj.convexHull}, metricas: ${!!metricas._contour_data?.metrics?.convex_hull}`);
    }
    
    // ============================================================================
    // CAPA 3: CONTORNO REAL (Borde del objeto fragmentado)
    // ============================================================================
    if (config.contorno && metricas._contour_data?.points) {
      const contourPoints = metricas._contour_data.points;
      if (contourPoints && contourPoints.length > 2) {
        ctx.strokeStyle = '#2196f3'; // Azul profesional
        ctx.lineWidth = thickLineWidth;
        ctx.beginPath();
        
        const getX = (p) => p.x !== undefined ? p.x : p[0];
        const getY = (p) => p.y !== undefined ? p.y : p[1];
        
        const firstPt = contourPoints[0];
        ctx.moveTo(getX(firstPt) - obj.minX, getY(firstPt) - obj.minY);
        
        for (let i = 1; i < contourPoints.length; i++) {
          const pt = contourPoints[i];
          ctx.lineTo(getX(pt) - obj.minX, getY(pt) - obj.minY);
        }
        
        ctx.closePath();
        ctx.stroke();
        console.log(`   ✅ Contorno Real dibujado (${contourPoints.length} puntos)`);
      }
    }
    
    // ============================================================================
    // CAPA 4: CENTROIDE DEL CONVEX HULL
    // ============================================================================
    let centroidHullX, centroidHullY;
    if (metricas._contour_data?.metrics) {
      const centroidHull = metricas._contour_data.metrics.centroid_hull || 
                          metricas._contour_data.metrics.centroid;
      
      if (centroidHull && centroidHull.length >= 2) {
        centroidHullX = centroidHull[0] - obj.minX;
        centroidHullY = centroidHull[1] - obj.minY;
        
        if (config.centroide) {
          // Punto naranja más pequeño y discreto
          ctx.fillStyle = '#ff6600';
          ctx.beginPath();
          ctx.arc(centroidHullX, centroidHullY, 3, 0, 2 * Math.PI); // Reducido de 6 a 3
          ctx.fill();
          
          // Borde negro muy fino
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1;
          ctx.stroke();
          
          console.log(`   ✅ Centroide dibujado en (${centroidHullX.toFixed(1)}, ${centroidHullY.toFixed(1)})`);
        }
      }
    }
    
    // ============================================================================
    // CAPA 5: EJES PRINCIPALES (Mayor y Menor)
    // ============================================================================
    if (config.ejes && metricas.punto_eje_mayor_1 && metricas.punto_eje_mayor_2) {
      // EJE MAYOR (rojo discreto)
      const p1x = metricas.punto_eje_mayor_1[0] - obj.minX;
      const p1y = metricas.punto_eje_mayor_1[1] - obj.minY;
      const p2x = metricas.punto_eje_mayor_2[0] - obj.minX;
      const p2y = metricas.punto_eje_mayor_2[1] - obj.minY;
      
      ctx.strokeStyle = '#d32f2f'; // Rojo más suave
      ctx.lineWidth = mediumLineWidth;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(p1x, p1y);
      ctx.lineTo(p2x, p2y);
      ctx.stroke();
      
      // Marcar extremos (cuadrados más pequeños)
      ctx.fillStyle = '#d32f2f';
      ctx.fillRect(p1x - 2, p1y - 2, 4, 4); // Reducido de 6x6 a 4x4
      ctx.fillRect(p2x - 2, p2y - 2, 4, 4);
      
      console.log(`   ✅ Eje Mayor dibujado`);
    }
    
    if (config.ejes && metricas.punto_eje_menor_1 && metricas.punto_eje_menor_2) {
      // EJE MENOR (verde discreto)
      const p1x = metricas.punto_eje_menor_1[0] - obj.minX;
      const p1y = metricas.punto_eje_menor_1[1] - obj.minY;
      const p2x = metricas.punto_eje_menor_2[0] - obj.minX;
      const p2y = metricas.punto_eje_menor_2[1] - obj.minY;
      
      ctx.strokeStyle = '#388e3c'; // Verde más suave
      ctx.lineWidth = mediumLineWidth;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(p1x, p1y);
      ctx.lineTo(p2x, p2y);
      ctx.stroke();
      
      // Marcar extremos (cuadrados más pequeños)
      ctx.fillStyle = '#388e3c';
      ctx.fillRect(p1x - 2, p1y - 2, 4, 4); // Reducido de 6x6 a 4x4
      ctx.fillRect(p2x - 2, p2y - 2, 4, 4);
      
      ctx.setLineDash([]);
      console.log(`   ✅ Eje Menor dibujado`);
    }
    
    // ============================================================================
    // CAPA 6: RADIOS (Máximo y Mínimo)
    // ============================================================================
    if (config.radios && centroidHullX !== undefined && centroidHullY !== undefined) {
      // RADIO MÁXIMO (cian discreto)
      if (metricas.punto_radio_maximo) {
        const pMaxX = metricas.punto_radio_maximo[0] - obj.minX;
        const pMaxY = metricas.punto_radio_maximo[1] - obj.minY;
        
        ctx.strokeStyle = '#0097a7'; // Cian más oscuro
        ctx.lineWidth = thinLineWidth;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(centroidHullX, centroidHullY);
        ctx.lineTo(pMaxX, pMaxY);
        ctx.stroke();
        
        // Marcar punto extremo (más pequeño)
        ctx.fillStyle = '#0097a7';
        ctx.beginPath();
        ctx.arc(pMaxX, pMaxY, 2.5, 0, 2 * Math.PI); // Reducido de 4 a 2.5
        ctx.fill();
        
        console.log(`   ✅ Radio Máximo dibujado`);
      }
      
      // RADIO MÍNIMO (magenta discreto)
      if (metricas.punto_radio_minimo) {
        const pMinX = metricas.punto_radio_minimo[0] - obj.minX;
        const pMinY = metricas.punto_radio_minimo[1] - obj.minY;
        
        ctx.strokeStyle = '#c2185b'; // Magenta más oscuro
        ctx.lineWidth = thinLineWidth;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(centroidHullX, centroidHullY);
        ctx.lineTo(pMinX, pMinY);
        ctx.stroke();
        
        // Marcar punto extremo (más pequeño)
        ctx.fillStyle = '#c2185b';
        ctx.beginPath();
        ctx.arc(pMinX, pMinY, 2.5, 0, 2 * Math.PI); // Reducido de 4 a 2.5
        ctx.fill();
        
        ctx.setLineDash([]);
        console.log(`   ✅ Radio Mínimo dibujado`);
      }
    }
    
    // ============================================================================
    // 🆕 ANÁLISIS DE DISTRIBUCIÓN ESPACIAL: LÍNEAS DESDE CENTROIDE → P/H
    // ============================================================================
    // Estas líneas visualizan la distribución espacial de perforaciones/horadaciones
    // respecto al centroide del objeto, permitiendo analizar simetría y patrones
    // ============================================================================
    if (centroidHullX !== undefined && centroidHullY !== undefined) {
      const getX = (p) => p.x !== undefined ? p.x : p[0];
      const getY = (p) => p.y !== undefined ? p.y : p[1];
      
      // Líneas a PERFORACIONES (azul claro muy sutil)
      if (config.perforaciones && obj.perforaciones && obj.perforaciones.length > 0) {
        ctx.strokeStyle = 'rgba(100, 150, 200, 0.4)'; // Azul claro semi-transparente
        ctx.lineWidth = thinLineWidth * 0.8;
        ctx.setLineDash([3, 4]);
        
        obj.perforaciones.forEach(perf => {
          const centPerfX = (perf.metricas?.centroid?.[0] || perf.metricas?.centroid?.x || 0) - obj.minX;
          const centPerfY = (perf.metricas?.centroid?.[1] || perf.metricas?.centroid?.y || 0) - obj.minY;
          
          // Línea punteada desde centroide objeto → centroide perforación
          ctx.beginPath();
          ctx.moveTo(centroidHullX, centroidHullY);
          ctx.lineTo(centPerfX, centPerfY);
          ctx.stroke();
          
          // Marcar centroide de perforación (punto pequeño discreto)
          if (config.centroide) {
            ctx.fillStyle = '#1976d2'; // Azul oscuro
            ctx.beginPath();
            ctx.arc(centPerfX, centPerfY, 2, 0, 2 * Math.PI); // Muy pequeño
            ctx.fill();
            
            // Borde blanco muy fino para contraste
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
        
        ctx.setLineDash([]);
        console.log(`   ✅ Líneas de distribución espacial a perforaciones dibujadas`);
      }
      
      // Líneas a HORADACIONES (verde claro muy sutil)
      if (config.horadaciones && obj.horadaciones && obj.horadaciones.length > 0) {
        ctx.strokeStyle = 'rgba(100, 180, 100, 0.4)'; // Verde claro semi-transparente
        ctx.lineWidth = thinLineWidth * 0.8;
        ctx.setLineDash([3, 4]);
        
        obj.horadaciones.forEach(hora => {
          const centHoraX = (hora.metricas?.centroid?.[0] || hora.metricas?.centroid?.x || 0) - obj.minX;
          const centHoraY = (hora.metricas?.centroid?.[1] || hora.metricas?.centroid?.y || 0) - obj.minY;
          
          // Línea punteada desde centroide objeto → centroide horadación
          ctx.beginPath();
          ctx.moveTo(centroidHullX, centroidHullY);
          ctx.lineTo(centHoraX, centHoraY);
          ctx.stroke();
          
          // Marcar centroide de horadación (punto pequeño discreto)
          if (config.centroide) {
            ctx.fillStyle = '#388e3c'; // Verde oscuro
            ctx.beginPath();
            ctx.arc(centHoraX, centHoraY, 2, 0, 2 * Math.PI); // Muy pequeño
            ctx.fill();
            
            // Borde blanco muy fino para contraste
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
        
        ctx.setLineDash([]);
        console.log(`   ✅ Líneas de distribución espacial a horadaciones dibujadas`);
      }
    }
    
    // ============================================================================
    // CAPA 7: PERFORACIONES (Diseño discreto)
    // ============================================================================
    if (config.perforaciones && obj.perforaciones && obj.perforaciones.length > 0) {
      const getX = (p) => p.x !== undefined ? p.x : p[0];
      const getY = (p) => p.y !== undefined ? p.y : p[1];
      
      obj.perforaciones.forEach((perf, idx) => {
        const contorno = perf.contorno || perf.poligonoTrazado;
        if (!contorno || contorno.length === 0) return;
        
        const color = perf.color || { fill: '#0066cc33', stroke: '#0066cc' };
        
        // Dibujar relleno semi-transparente más sutil
        ctx.fillStyle = color.fill.replace('33', '20'); // Reducir opacidad de 20% a 12%
        ctx.beginPath();
        const firstPt = contorno[0];
        ctx.moveTo(getX(firstPt) - obj.minX, getY(firstPt) - obj.minY);
        for (let i = 1; i < contorno.length; i++) {
          const pt = contorno[i];
          ctx.lineTo(getX(pt) - obj.minX, getY(pt) - obj.minY);
        }
        ctx.closePath();
        ctx.fill();
        
        // Dibujar contorno más fino
        ctx.strokeStyle = color.stroke;
        ctx.lineWidth = mediumLineWidth;
        ctx.stroke();
        
        // Etiqueta si está habilitada (más pequeña y discreta)
        if (config.labels) {
          const centX = (perf.metricas?.centroid?.[0] || getX(firstPt)) - obj.minX;
          const centY = (perf.metricas?.centroid?.[1] || getY(firstPt)) - obj.minY;
          
          ctx.fillStyle = color.stroke;
          ctx.font = 'bold 10px Arial'; // Reducido de 12px a 10px
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`P${perf.id}`, centX, centY);
        }
      });
      
      console.log(`   ✅ ${obj.perforaciones.length} perforaciones dibujadas`);
    }
    
    // ============================================================================
    // CAPA 8: HORADACIONES (Diseño discreto)
    // ============================================================================
    if (config.horadaciones && obj.horadaciones && obj.horadaciones.length > 0) {
      const getX = (p) => p.x !== undefined ? p.x : p[0];
      const getY = (p) => p.y !== undefined ? p.y : p[1];
      
      obj.horadaciones.forEach((hora, idx) => {
        const contorno = hora.contorno || hora.poligonoTrazado;
        if (!contorno || contorno.length === 0) return;
        
        const color = hora.color || { fill: '#28a74533', stroke: '#28a745' };
        
        // Dibujar relleno semi-transparente más sutil
        ctx.fillStyle = color.fill.replace('33', '20'); // Reducir opacidad de 20% a 12%
        ctx.beginPath();
        const firstPt = contorno[0];
        ctx.moveTo(getX(firstPt) - obj.minX, getY(firstPt) - obj.minY);
        for (let i = 1; i < contorno.length; i++) {
          const pt = contorno[i];
          ctx.lineTo(getX(pt) - obj.minX, getY(pt) - obj.minY);
        }
        ctx.closePath();
        ctx.fill();
        
        // Dibujar contorno más fino
        ctx.strokeStyle = color.stroke;
        ctx.lineWidth = mediumLineWidth;
        ctx.stroke();
        
        // Etiqueta si está habilitada (más pequeña y discreta)
        if (config.labels) {
          const centX = (hora.metricas?.centroid?.[0] || getX(firstPt)) - obj.minX;
          const centY = (hora.metricas?.centroid?.[1] || getY(firstPt)) - obj.minY;
          
          ctx.fillStyle = color.stroke;
          ctx.font = 'bold 10px Arial'; // Reducido de 12px a 10px
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`H${hora.id}`, centX, centY);
        }
      });
      
      console.log(`   ✅ ${obj.horadaciones.length} horadaciones dibujadas`);
    }
    
    console.log(`✅ Canvas esquemático generado para ${obj.id}`);
  }


export function exportarAnalisisMorfologico(obj, metricas) {
    try {
      // Dimensiones de imagen según cara (accesibles en todo el scope de la función)
      let _iW = 0, _iH = 0;
      if (obj.cara === 'A') {
        _iW = window.imageWidthCaraA  || window.anchoImagen || window.imageWidth  || 0;
        _iH = window.imageHeightCaraA || window.altoImagen  || window.imageHeight || 0;
      } else if (obj.cara === 'B') {
        _iW = window.imageWidthCaraB  || window.anchoImagen || window.imageWidth  || 0;
        _iH = window.imageHeightCaraB || window.altoImagen  || window.imageHeight || 0;
      } else {
        _iW = window.anchoImagen || window.imageWidth  || 0;
        _iH = window.altoImagen  || window.imageHeight || 0;
      }

      // 🔍 INYECTAR ERROR ÓPTICO si no fue calculado previamente
      if (metricas.error_optico_lineal_percent === undefined) {
        try {
          const focalInput = document.getElementById('focalInput');
          const sensorInput = document.getElementById('sensorWidthInput');
          const distInput   = document.getElementById('distanciaInput');
          const focal  = focalInput  ? (parseFloat(focalInput.value)  || 50)   : 50;
          const sensor = sensorInput ? (parseFloat(sensorInput.value) || 36)   : 36;
          const dist   = distInput   ? (parseFloat(distInput.value)   || 1000) : 1000;
          let cx = 0, cy = 0;
          if (metricas.centroide_x !== undefined) {
            cx = parseFloat(metricas.centroide_x) || 0;
            cy = parseFloat(metricas.centroide_y) || 0;
          } else if (Array.isArray(metricas.centroide)) {
            cx = metricas.centroide[0] || 0;
            cy = metricas.centroide[1] || 0;
          } else if (typeof metricas.centroide === 'string') {
            const parts = metricas.centroide.split(',').map(s => parseFloat(s.trim()));
            cx = parts[0] || 0; cy = parts[1] || 0;
          } else {
            const bb = metricas.bounding_box
              ? metricas.bounding_box.replace(/[()]/g, '').split(',').map(Number)
              : [0, 0, 100, 100];
            cx = (bb[0] || 0) + (bb[2] || 100) / 2;
            cy = (bb[1] || 0) + (bb[3] || 100) / 2;
          }
          const eo = MetricsOrchestrator.estimarErrorOptico({
            objCentroide: { x: cx, y: cy },
            imgW: _iW, imgH: _iH,
            focalMM: focal, sensorW: sensor,
            distanciaObjMM: dist
          });
          if (eo) {
            metricas.error_optico_lineal_percent = eo.error_lineal_percent;
            metricas.error_optico_area_percent   = eo.error_area_percent;
            metricas.error_perspectiva_percent   = eo.error_perspectiva_percent;
            metricas.error_distorsion_percent    = eo.error_distorsion_percent;
            metricas.posicion_radial_norm        = eo.posicion_radial_norm;
            metricas.angulo_optico_deg           = eo.angulo_optico_deg;
            metricas.k1_estimado                 = eo.k1_estimado;
            metricas.fov_diagonal_deg            = eo.fovDiagDeg;
            metricas.confianza_optica            = eo.confianza_optica;
            metricas.nota_error_optico           = eo.nota;
            aplicarIncertidumbreOptica(metricas, eo);
          }
        } catch(e) { console.warn('Error óptico no disponible para CSV:', e); }
      }

      // Crear contenido del reporte
      const idArq = obj.id?.replace(/[^a-zA-Z0-9_-]/g, '_') || `obj_${obj.numeroObjeto}`;
      const filename = `${idArq}_analisis`;
      
      // Generar reporte en formato texto
      let reporte = `===============================================
REPORTE DE ANÁLISIS MORFOLÓGICO - MAO
===============================================

INFORMACIÓN GENERAL:
• ID del Objeto: ${metricas.object_id}
• Cara: ${obj.cara === 'A' ? 'Cara A — Anverso' : obj.cara === 'B' ? 'Cara B — Reverso' : 'Monofacial'}
• Fecha de Análisis: ${new Date(metricas.analysis_timestamp).toLocaleString()}
• Factor de Escala: ${metricas.scale_factor}${window.escalaCorregida?.activa ? ' (CORREGIDA)' : ''}
${window.escalaCorregida?.activa ? `• Corrección Aplicada:
  - Factor de corrección: ${window.escalaCorregida.factorCorreccion.toFixed(6)}
  - Escala original: ${window.escalaCorregida.escalaOriginal.toFixed(6)} mm/px
  - Error original: ${window.escalaCorregida.errorOriginal.toFixed(2)}%
  - Zona de verificación: ${window.escalaCorregida.zonaVerificacion.toFixed(1)}% del radio
  - Fecha de corrección: ${new Date(window.escalaCorregida.fecha).toLocaleString()}
` : ''}• Bounding Box: ${metricas.bounding_box}

DIMENSIONES BÁSICAS:
• Ancho: ${metricas.width_px} px${metricas.width_mm ? ` (${metricas.width_mm} mm)` : ''}
• Alto: ${metricas.height_px} px${metricas.height_mm ? ` (${metricas.height_mm} mm)` : ''}
• Área: ${metricas.area_px} px²${metricas.area_mm2 ? ` (${metricas.area_mm2} mm²)` : ''}
• Perímetro: ${metricas.perimeter_px} px${metricas.perimeter_mm ? ` (${metricas.perimeter_mm} mm)` : ''}

ANÁLISIS RADIAL (desde centroide del Convex Hull):
• Radio Máximo: ${metricas.radio_maximo} ${metricas.perimeter_unit}
• Radio Mínimo: ${metricas.radio_minimo} ${metricas.perimeter_unit}
• Radio Medio: ${metricas.radio_medio} ${metricas.perimeter_unit}
• Ratio de Radios (Rmin/Rmax): ${metricas.ratio_radios}
• Regularidad Radial: ${metricas.regularidad_radial}% ${parseFloat(metricas.regularidad_radial) >= 90 ? '(Muy regular)' : parseFloat(metricas.regularidad_radial) >= 75 ? '(Regular)' : parseFloat(metricas.regularidad_radial) >= 60 ? '(Irregular)' : '(Muy irregular)'}
• Desviación Radial: ${metricas.desviacion_radial} ${metricas.perimeter_unit}
• Coeficiente de Variación Radial: ${metricas.coeficiente_variacion_radial}%
${metricas.punto_radio_maximo ? `• Punto Radio Máximo (x,y): (${metricas.punto_radio_maximo[0].toFixed(1)}, ${metricas.punto_radio_maximo[1].toFixed(1)})` : ''}
${metricas.punto_radio_minimo ? `• Punto Radio Mínimo (x,y): (${metricas.punto_radio_minimo[0].toFixed(1)}, ${metricas.punto_radio_minimo[1].toFixed(1)})` : ''}

MÉTRICAS MORFOLÓGICAS BÁSICAS:
• Relación de Aspecto: ${metricas.aspect_ratio} → ${metricas.shape_class_aspect}
• Circularidad: ${metricas.circularity} → ${metricas.shape_class_circularity}
• Compacidad: ${metricas.compactness} → ${metricas.shape_class_compactness}
• Rectangularidad: ${metricas.rectangularity}
• Elongación: ${metricas.elongation}
• Factor de Forma: ${metricas.shape_factor}
• Solidez (aproximada): ${metricas.solidity_approx}
• Convexidad (aproximada): ${metricas.convexity_approx}
• Excentricidad: ${metricas.excentricidad} | Ejes: ${metricas.eje_mayor}×${metricas.eje_menor} px

MÉTRICAS ARQUEOLÓGICAS AVANZADAS:
• Simetría Bilateral: ${metricas.simetria_bilateral} → ${metricas.simetria_clasificacion}
• Distancia de Asimetría: ${metricas.simetria_distancia_asimetria_px} px
• Curvatura Media: ${metricas.curvatura_media} → ${metricas.curvatura_clasificacion}
• Curvatura Máxima: ${metricas.curvatura_maxima}
• Puntos de Inflexión: ${metricas.curvatura_puntos_inflexion} (Esquinas: ${metricas.curvatura_puntos_esquina})
• Rugosidad del Contorno: ${metricas.rugosidad_contorno} → ${metricas.rugosidad_clasificacion}
• Longitud Media de Segmentos: ${metricas.rugosidad_longitud_segmento_media_px} px
• Ángulo Eje Principal: ${metricas.eje_principal_angulo}° → ${metricas.eje_principal_orientacion}
• Longitud Eje Mayor Real: ${metricas.eje_mayor_real_longitud} px
• Longitud Eje Menor Real: ${metricas.eje_menor_real_longitud} px
• Anisotropía: ${metricas.eje_principal_anisotropia} → ${metricas.eje_principal_forma_dominante}
• Esfericidad: ${metricas.esfericidad} → ${metricas.forma_3d_inferida}
• Oblongación: ${metricas.oblongacion} → ${metricas.oblongacion_clasificacion}
• Aplanamiento Inferido: ${metricas.aplanamiento_inferido}
${metricas.completitud_estimada ? `• Completitud: ${metricas.completitud_estimada}% → ${metricas.completitud_tipo_fragmento}
• Cobertura Angular: ${metricas.completitud_cobertura_grados}°` : ''}

CARACTERÍSTICAS GEOMÉTRICAS AVANZADAS:
• Índice de Estrellamiento: ${metricas.indice_estrellamiento || '0.0000'} → ${metricas.estrellamiento_clasificacion || 'No calculado'}
• Índice de Lobularidad: ${metricas.indice_lobularidad || '0.0000'} → ${metricas.lobularidad_clasificacion || 'No calculado'}
• Energía de Curvatura: ${metricas.energia_curvatura || '0.0000'} → ${metricas.energia_clasificacion || 'No calculado'}
• Diámetro Feret Máximo: ${metricas.feret_max || '0.00'} ${metricas.perimeter_unit} (${metricas.feret_angulo_max || '0.0'}°)
• Diámetro Feret Mínimo: ${metricas.feret_min || '0.00'} ${metricas.perimeter_unit} (${metricas.feret_angulo_min || '0.0'}°)
• Ratio Feret: ${metricas.feret_ratio || '0.0000'} → ${metricas.feret_clasificacion || 'No calculado'}
• Geometría de Vértices: ${metricas.geometria_vertices || 'No calculado'}
• Ángulo Medio en Vértices: ${metricas.angulo_medio_vertices || '0.0'}°
• Ángulo Predominante: ${metricas.angulo_predominante || '0.0'}°
• Ángulos Rectos: ${metricas.num_angulos_rectos || 0} | Agudos: ${metricas.num_angulos_agudos || 0} | Obtusos: ${metricas.num_angulos_obtusos || 0}

CLASIFICACIÓN AUTOMÁTICA:
• Forma Detectada (Contorno Real): ${metricas.forma_detectada}
• Confianza: ${(parseFloat(metricas.forma_confianza) * 100).toFixed(1)}%${metricas.forma_idealizada_nombre ? `
• Forma Idealizada (Depurado): ${metricas.forma_idealizada_nombre}
• Confianza Idealizada: ${(parseFloat(metricas.forma_idealizada_confianza) * 100).toFixed(1)}%` : ''}
• Clasificación por Circularidad: ${metricas.shape_class_circularity}
• Clasificación por Aspecto: ${metricas.shape_class_aspect}  
• Clasificación por Compacidad: ${metricas.shape_class_compactness}

NOTAS TÉCNICAS:${metricas.error_optico_lineal_percent !== undefined ? `

INFORMACIÓN ÓPTICA:
• Archivo Fotografía : ${resolverNombreFotografia(obj) || 'N/A'}
• Archivo RAW : ${(window.archivoRAWActual?.archivo?.name) || (window.archivoRAWActual?.name) || 'N/A'}
• Modelo cámara : ${document.getElementById('cameraModel')?.value || 'N/A'}
• Focal : ${document.getElementById('focalInput')?.value || 'N/A'} mm
• Apertura : f/${document.getElementById('apertureInput')?.value || 'N/A'}
• Sensor : ${document.getElementById('sensorWidthInput')?.value || 'N/A'} × ${document.getElementById('sensorHeightInput')?.value || 'N/A'} mm
• Distancia objeto–cámara : ${document.getElementById('distanciaInput')?.value || 'N/A'} mm

INCERTIDUMBRE ÓPTICA POSICIONAL:
• Error Lineal: ±${metricas.error_optico_lineal_percent}% (incertidumbre en medidas mm)
• Error de Área: ±${metricas.error_optico_area_percent}% (incertidumbre en medidas mm²)
• Distorsión Radial: ±${metricas.error_distorsion_percent}%
• Error de Perspectiva: ±${metricas.error_perspectiva_percent}%
• Posición Radial Normalizada: ${metricas.posicion_radial_norm} (0=centro, 1=borde)
• Ángulo Óptico: ${metricas.angulo_optico_deg}°
• k1 Estimado: ${metricas.k1_estimado}
• FOV Diagonal: ${metricas.fov_diagonal_deg}°
• Confianza: ${metricas.confianza_optica}
${metricas._incertidumbre_optica_aplicada ? `• Área: ${metricas.area_mm2 || 'N/A'} mm² → rango [${metricas.area_rango_min || '?'} – ${metricas.area_rango_max || '?'}] mm²
• Perímetro: ${metricas.perimeter_mm || 'N/A'} mm → rango [${metricas.perimeter_rango_min || '?'} – ${metricas.perimeter_rango_max || '?'}] mm
• Ancho: ${metricas.width_mm || 'N/A'} mm → rango [${metricas.width_rango_min || '?'} – ${metricas.width_rango_max || '?'}] mm
• Alto: ${metricas.height_mm || 'N/A'} mm → rango [${metricas.height_rango_min || '?'} – ${metricas.height_rango_max || '?'}] mm
• Métricas NO afectadas (adimensionales): ${metricas._metricas_no_afectadas || 'circularidad compacidad rectangularidad elongación solidez'}` : ''}
${metricas.nota_error_optico ? `${metricas.nota_error_optico}`: ''}`: ''}

NOTAS TÉCNICAS:
- Las mediciones en mm dependen de la configuración correcta de la escala
- Los valores de convexidad y solidez son aproximaciones basadas en el bounding box
- Para análisis más precisos, considere usar técnicas de convex hull

===============================================
Generado por MAO Plus - Morfometría Arqueológica de Objetos
Desarrollado por Quipus / Juan Francisco Ramírez, 2025
===============================================`;

      // Crear y descargar archivo
      const blob = new Blob([reporte], { type: 'text/plain;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      
      // También generar CSV para análisis estadístico con TODAS las métricas arqueológicas
      const csvHeaders = [
        'ID', 'Cara', 'Ancho_px', 'Alto_px', 'Area_px', 'Perimetro_px', 'Ancho_mm', 'Alto_mm', 'Area_mm2', 'Perimetro_mm',
        'Relacion_Aspecto', 'Circularidad', 'Compacidad', 'Rectangularidad', 'Elongacion', 'Factor_Forma', 
        'Solidez', 'Convexidad', 'Excentricidad', 'Eje_Mayor_px', 'Eje_Menor_px',
        // Métricas arqueológicas avanzadas
        'Simetria_Bilateral', 'Simetria_Clasificacion', 'Distancia_Asimetria_px',
        'Curvatura_Media', 'Curvatura_Maxima', 'Curvatura_Clasificacion', 'Puntos_Inflexion', 'Puntos_Esquina',
        'Rugosidad_Contorno', 'Rugosidad_Clasificacion', 'Longitud_Segmento_Media_px', 'Rugosidad_Desviacion_px',
        'Angulo_Eje_Principal', 'Orientacion', 'Eje_Mayor_Real_Longitud_px', 'Eje_Menor_Real_Longitud_px',
        'Anisotropia', 'Forma_Dominante', 'Esfericidad', 'Forma_3D_Inferida', 'Oblongacion', 'Oblongacion_Clasificacion',
        'Aplanamiento_Inferido', 'Completitud_Estimada', 'Tipo_Fragmento', 'Cobertura_Angular_Grados',
        // Características geométricas avanzadas (nuevas)
        'Indice_Estrellamiento', 'Estrellamiento_Clasificacion',
        'Indice_Lobularidad', 'Lobularidad_Clasificacion',
        'Energia_Curvatura', 'Energia_Clasificacion',
        'Feret_Max', 'Feret_Min', 'Feret_Ratio', 'Feret_Angulo_Max', 'Feret_Angulo_Min', 'Feret_Clasificacion',
        'Geometria_Vertices', 'Angulo_Medio_Vertices', 'Angulo_Predominante', 'Desviacion_Angulos',
        'Num_Angulos_Rectos', 'Num_Angulos_Agudos', 'Num_Angulos_Obtusos',
        // Clasificaciones
        'Clasificacion_Circularidad', 'Clasificacion_Aspecto', 'Clasificacion_Compacidad',
        'Forma_Detectada', 'Confianza_Forma', 'Factor_Escala', 'Fecha_Analisis'
      ].join(',');
      
      const csvValues = [
        `"${metricas.object_id}"`,
        `"${obj.cara === 'A' ? 'A - Anverso' : obj.cara === 'B' ? 'B - Reverso' : 'Monofacial'}"`,
        metricas.width_px, metricas.height_px, metricas.area_px, metricas.perimeter_px,
        `"${metricas.width_mm || 'N/A'}"`, `"${metricas.alto_mm || 'N/A'}"`, `"${metricas.area_mm2 || 'N/A'}"`, `"${metricas.perimeter_mm || 'N/A'}"`,
        metricas.aspect_ratio, metricas.circularity, metricas.compactness, metricas.rectangularity, 
        metricas.elongation, metricas.shape_factor, metricas.solidity_approx, metricas.convexity_approx,
        metricas.excentricidad, metricas.eje_mayor, metricas.eje_menor,
        // Métricas arqueológicas
        metricas.simetria_bilateral || 'N/A', `"${metricas.simetria_clasificacion || 'N/A'}"`, metricas.simetria_distancia_asimetria_px || 'N/A',
        metricas.curvatura_media || 'N/A', metricas.curvatura_maxima || 'N/A', `"${metricas.curvatura_clasificacion || 'N/A'}"`,
        metricas.curvatura_puntos_inflexion || 'N/A', metricas.curvatura_puntos_esquina || 'N/A',
        metricas.rugosidad_contorno || 'N/A', `"${metricas.rugosidad_clasificacion || 'N/A'}"`,
        metricas.rugosidad_longitud_segmento_media_px || 'N/A', metricas.rugosidad_desviacion_px || 'N/A',
        metricas.eje_principal_angulo || 'N/A', `"${metricas.eje_principal_orientacion || 'N/A'}"`,
        metricas.eje_mayor_real_longitud || 'N/A', metricas.eje_menor_real_longitud || 'N/A',
        metricas.eje_principal_anisotropia || 'N/A', `"${metricas.eje_principal_forma_dominante || 'N/A'}"`,
        metricas.esfericidad || 'N/A', `"${metricas.forma_3d_inferida || 'N/A'}"`,
        metricas.oblongacion || 'N/A', `"${metricas.oblongacion_clasificacion || 'N/A'}"`,
        `"${metricas.aplanamiento_inferido || 'N/A'}"`,
        metricas.completitud_estimada || 'N/A', `"${metricas.completitud_tipo_fragmento || 'N/A'}"`, metricas.completitud_cobertura_grados || 'N/A',
        // Características geométricas avanzadas (nuevas)
        metricas.indice_estrellamiento || 'N/A', `"${metricas.estrellamiento_clasificacion || 'N/A'}"`,
        metricas.indice_lobularidad || 'N/A', `"${metricas.lobularidad_clasificacion || 'N/A'}"`,
        metricas.energia_curvatura || 'N/A', `"${metricas.energia_clasificacion || 'N/A'}"`,
        metricas.feret_max || 'N/A', metricas.feret_min || 'N/A', metricas.feret_ratio || 'N/A',
        metricas.feret_angulo_max || 'N/A', metricas.feret_angulo_min || 'N/A', `"${metricas.feret_clasificacion || 'N/A'}"`,
        `"${metricas.geometria_vertices || 'N/A'}"`, metricas.angulo_medio_vertices || 'N/A', metricas.angulo_predominante || 'N/A',
        metricas.desviacion_angulos || 'N/A', metricas.num_angulos_rectos || 0, metricas.num_angulos_agudos || 0, metricas.num_angulos_obtusos || 0,
        // Clasificaciones
        metricas.completitud_estimada || 'N/A', `"${metricas.completitud_tipo_fragmento || 'N/A'}"`, metricas.completitud_cobertura_grados || 'N/A',
        // Clasificaciones
        `"${metricas.shape_class_circularity}"`, `"${metricas.shape_class_aspect}"`, `"${metricas.shape_class_compactness}"`,
        `"${metricas.forma_detectada || 'N/A'}"`, metricas.forma_confianza || 'N/A',
        `"${metricas.scale_factor}"`, `"${metricas.analysis_timestamp}"`
      ].join(',');
      
      const csvContent = `${csvHeaders}\n${csvValues}`;
      
      // === BLOQUE INFORMACIÓN ÓPTICA ===
      // Sección dedicada con datos del lente, archivos y error óptico posicional.
      // Formato: Seccion,Campo,Valor,Unidad,Nota
      const fJPG   = archivoJPGActual ? archivoJPGActual.name : 'N/A';
      const fRAW   = (window.archivoRAWActual?.archivo?.name) || (typeof window.archivoRAWActual?.name === 'string' ? window.archivoRAWActual.name : null) || 'N/A';
      const fCamara  = document.getElementById('cameraModel')?.value || 'N/A';
      const fFocal   = document.getElementById('focalInput')?.value   || 'N/A';
      const fApert   = document.getElementById('apertureInput')?.value || 'N/A';
      const fSwMM    = document.getElementById('sensorWidthInput')?.value  || 'N/A';
      const fShMM    = document.getElementById('sensorHeightInput')?.value || 'N/A';
      const fDist    = document.getElementById('distanciaInput')?.value    || 'N/A';
      const fResFull = (_iW && _iH) ? `${_iW}×${_iH}` : (obj.cara === 'A' ? `${window.imageWidthCaraA||'?'}×${window.imageHeightCaraA||'?'}` : (obj.cara === 'B' ? `${window.imageWidthCaraB||'?'}×${window.imageHeightCaraB||'?'}` : `${window.anchoImagen||window.imageWidth||'?'}×${window.altoImagen||window.imageHeight||'?'}`));

      const opticaRows = [
        `Seccion,Campo,Valor,Unidad,Nota`,
        `Informacion_Optica,Archivo_JPG,"${fJPG}",,-`,
        `Informacion_Optica,Archivo_RAW,"${fRAW}",,-`,
        `Informacion_Optica,Modelo_Camara,"${fCamara}",,-`,
        `Informacion_Optica,Focal,${fFocal},mm,Longitud focal del lente`,
        `Informacion_Optica,Apertura,${fApert},f/,Apertura al momento de la captura`,
        `Informacion_Optica,Sensor_Ancho,${fSwMM},mm,-`,
        `Informacion_Optica,Sensor_Alto,${fShMM},mm,-`,
        `Informacion_Optica,Distancia_Objeto,${fDist},mm,Distancia cámara-objeto`,
        `Informacion_Optica,Resolucion_Imagen,${fResFull},px,-`,
      ];

      if (metricas.error_optico_lineal_percent !== undefined) {
        opticaRows.push(
          `Error_Optico_Posicional,Error_Lineal,${metricas.error_optico_lineal_percent},%,Incertidumbre en medidas lineales (mm)`,
          `Error_Optico_Posicional,Error_Area,${metricas.error_optico_area_percent},%,Incertidumbre en medidas de área (mm²)`,
          `Error_Optico_Posicional,Error_Distorsion,${metricas.error_distorsion_percent},%,Componente distorsión radial del lente`,
          `Error_Optico_Posicional,Error_Perspectiva,${metricas.error_perspectiva_percent},%,Componente perspectiva (objeto fuera del eje óptico)`,
          `Error_Optico_Posicional,Posicion_Radial_Norm,${metricas.posicion_radial_norm},,0=centro  1=borde horizontal`,
          `Error_Optico_Posicional,Angulo_Optico,${metricas.angulo_optico_deg},°,Ángulo del objeto respecto al eje óptico`,
          `Error_Optico_Posicional,k1_Estimado,${metricas.k1_estimado},,Coef. distorsión radial (empírico sin calibración)`,
          `Error_Optico_Posicional,FOV_Diagonal,${metricas.fov_diagonal_deg},°,Campo visual diagonal del lente`,
          `Error_Optico_Posicional,Confianza,"${metricas.confianza_optica || 'N/A'}",,Categoría de incertidumbre estimada`,
          `Error_Optico_Posicional,Nota,"${(metricas.nota_error_optico || '').replace(/"/g, "'")}",,Advertencia metodológica`
        );
      }

      if (metricas._incertidumbre_optica_aplicada) {
        opticaRows.push(`Incertidumbre_Propagada,NOTA,,,Rangos ± propagados del error óptico a cada métrica absoluta`);
        const metricasLinMM  = [['perimeter','mm'],['width','mm'],['height','mm'],['eje_mayor','mm'],['eje_menor','mm'],['feret_max','mm'],['feret_min','mm'],['radio_maximo','mm'],['radio_minimo','mm'],['radio_medio','mm']];
        const metricasAreaMM = [['area','mm²'],['area_fragmentada','mm²']];
        [...metricasAreaMM, ...metricasLinMM].forEach(([k, u]) => {
          const v  = metricas[k];
          const e  = metricas[`${k}_incertidumbre_abs`];
          const mn = metricas[`${k}_rango_min`];
          const mx = metricas[`${k}_rango_max`];
          if (v !== undefined && e !== undefined)
            opticaRows.push(`Incertidumbre_Propagada,${k},${v},${u},"±${e} ${u} | rango [${mn} – ${mx}] ${u}"`);
        });
        opticaRows.push(`Incertidumbre_Propagada,Metricas_No_Afectadas,"${metricas._metricas_no_afectadas || 'circularity compactness rectangularity elongation solidity'}",,Ratios adimensionales (el error de escala cancela)`);
      }

      const csvOptica  = opticaRows.join('\n');
      const csvFull    = `${csvContent}\n\n${csvOptica}`;

      const csvBlob = new Blob([csvFull], { type: 'text/csv;charset=utf-8' });
      const csvLink = document.createElement('a');
      csvLink.href = URL.createObjectURL(csvBlob);
      csvLink.download = `${filename}.csv`;
      document.body.appendChild(csvLink);
      csvLink.click();
      document.body.removeChild(csvLink);
      URL.revokeObjectURL(csvLink.href);
      
      UtilityHelpers.setStatus(`Análisis exportado: ${filename}.txt y ${filename}.csv`, false);
      console.log(`📁 Análisis morfológico exportado para objeto ${obj.id}`);
      
    } catch (error) {
      console.error('Error exportando análisis morfológico:', error);
      UtilityHelpers.setStatus(`Error en exportación: ${error.message}`, true);
    }
  }


export function generarJSON(obj, metricas) {
    const escala = calcularEscala();
    
    // Usar métricas contorno/hull con fallbacks — compatibles con objetos idealizados y no idealizados
    const ancho = parseFloat(metricas.tight_bounding_width_px || obj.width || 0);
    const alto = parseFloat(metricas.tight_bounding_height_px || obj.height || 0);
    const area = parseFloat(metricas.area_real_px || metricas.area_fragmentada_px || metricas.area_px || obj.area || 0);
    const perimetro = parseFloat(metricas.perimeter_real_px || metricas.perimeter_fragmentado_px || metricas.perimeter_px || (2 * (obj.width + obj.height)) || 0);
    
    return {
      "forma": metricas.forma_detectada || "Forma irregular",
      "centroide": [parseFloat(metricas.centroide_x), parseFloat(metricas.centroide_y)],
      "area": parseFloat(area.toFixed(2)),
      "perimetro": parseFloat(perimetro.toFixed(2)),
      "ancho": parseFloat(ancho.toFixed(1)),
      "alto": parseFloat(alto.toFixed(1)),
      "aspect_ratio": parseFloat(metricas.aspect_ratio_tight || metricas.aspect_ratio_original || (ancho/alto).toFixed(4)),
      "circularidad": parseFloat(metricas.circularity_real || metricas.circularity || 0),
      "excentricidad": parseFloat(metricas.excentricidad || 0),
      "vertices": parseInt(metricas.vertices_aproximados) || 0,
      "solidez": parseFloat(metricas.solidity_real || metricas.solidity || 0),
      "convexidad": parseFloat(metricas.convexity_real || metricas.convexity || 1.0),
      "compacidad": parseFloat(metricas.compactness_real || metricas.compactness || 0),
      
      // Áreas MAO desglosadas: Hull (estimada) / Real (contorno) / Neta (descontando P/H)
      "area_hull": parseFloat((metricas.area || 0).toFixed(3)),
      "area_real": parseFloat((metricas.area_fragmentada || metricas.area || 0).toFixed(3)),
      "area_neta": parseFloat((obj.area_neta || metricas.area_neta || metricas.area || 0).toFixed(3)),
      "perimetro_neto": parseFloat((obj.perimetro_neto || metricas.perimeter || 0).toFixed(3)),
      
      // Información adicional del análisis MAO
      "mao_metadata": {
        "object_id": metricas.object_id,
        "analysis_method": metricas.analysis_method,
        "confidence": parseFloat(metricas.forma_confianza),
        "classification_reason": metricas.forma_razon,
        "scale_factor_mm_per_px": escala || null,
        "scale_corrected": window.escalaCorregida?.activa || false,
        ...(window.escalaCorregida?.activa && {
          "scale_correction": {
            "correction_factor": window.escalaCorregida.factorCorreccion,
            "original_scale": window.escalaCorregida.escalaOriginal,
            "corrected_scale": window.escalaCorregida.escalaCorregida,
            "original_error_percent": window.escalaCorregida.errorOriginal,
            "verification_zone_percent": window.escalaCorregida.zonaVerificacion,
            "correction_date": window.escalaCorregida.fecha
          }
        }),
        "contour_points": parseInt(metricas.contour_points) || 0,
        "tight_bounding_box": {
          "width": ancho,
          "height": alto
        },
        "original_bounding_box": {
          "width": obj.width,
          "height": obj.height
        },
        "analysis_timestamp": metricas.analysis_timestamp,
        
        // Métricas en unidades métricas si hay escala
        ...(escala && {
          "dimensions_mm": {
            "width": parseFloat((ancho * escala).toFixed(2)),
            "height": parseFloat((alto * escala).toFixed(2)),
            "area": parseFloat((area * escala * escala).toFixed(2)),
            "perimeter": parseFloat((perimetro * escala).toFixed(2))
          }
        })
      },

      // ── Perforaciones — métricas morfológicas individuales ──────────────
      "perforaciones": (obj.perforaciones || []).map(function(perf, idx) {
        var pm = perf.metricas || {};
        return {
          "id":                     perf.id || (idx + 1),
          "area_mm2":               parseFloat(pm.area || perf.area) || 0,
          "perimetro_mm":           parseFloat(pm.perimeter || pm.perimetro || perf.perimetro) || 0,
          "ancho_mm":               parseFloat(pm.width) || 0,
          "alto_mm":                parseFloat(pm.height) || 0,
          "centroide_x":            parseFloat(pm.centroide_x || (pm.centroid && pm.centroid[0])) || 0,
          "centroide_y":            parseFloat(pm.centroide_y || (pm.centroid && pm.centroid[1])) || 0,
          "distancia_al_centro_mm": parseFloat(perf.distanciaAlCentro) || 0,
          "forma_detectada":        pm.forma_detectada || null,
          "forma_confianza":        parseFloat(pm.forma_confianza) || 0,
          "circularity":            pm.circularity  !== undefined ? parseFloat(pm.circularity)  : null,
          "compactness":            pm.compactness  !== undefined ? parseFloat(pm.compactness)  : null,
          "solidity":               pm.solidity     !== undefined ? parseFloat(pm.solidity)     : null,
          "convexity":              pm.convexity    !== undefined ? parseFloat(pm.convexity)    : null,
          "aspect_ratio":           pm.aspect_ratio !== undefined ? parseFloat(pm.aspect_ratio) : null,
          "excentricidad":          pm.excentricidad !== undefined ? parseFloat(pm.excentricidad) : null,
          "eje_mayor_mm":           pm.eje_mayor    !== undefined ? parseFloat(pm.eje_mayor)    : null,
          "eje_menor_mm":           pm.eje_menor    !== undefined ? parseFloat(pm.eje_menor)    : null,
          "radio_maximo_mm":        pm.radio_maximo !== undefined ? parseFloat(pm.radio_maximo) : null,
          "radio_minimo_mm":        pm.radio_minimo !== undefined ? parseFloat(pm.radio_minimo) : null,
          "regularidad_radial":     pm.regularidad_radial !== undefined ? parseFloat(pm.regularidad_radial) : null,
          "desviacion_radial_mm":   pm.desviacion_radial  !== undefined ? parseFloat(pm.desviacion_radial)  : null,
          "coef_variacion_radial":  pm.coeficiente_variacion_radial !== undefined ? parseFloat(pm.coeficiente_variacion_radial) : null,
          "vertices_aproximados":   parseInt(pm.vertices_aproximados) || 0,
          "shape_factor":           pm.shape_factor     !== undefined ? parseFloat(pm.shape_factor)     : null,
          "rectangularity":         pm.rectangularity   !== undefined ? parseFloat(pm.rectangularity)   : null,
          "elongation":             pm.elongation       !== undefined ? parseFloat(pm.elongation)       : null,
          "feret_max_mm":           pm.feret_max        !== undefined ? parseFloat(pm.feret_max)        : null,
          "feret_min_mm":           pm.feret_min        !== undefined ? parseFloat(pm.feret_min)        : null,
          "feret_ratio":            pm.feret_ratio      !== undefined ? parseFloat(pm.feret_ratio)      : null,
          "feret_angulo_max":       pm.feret_angulo_max !== undefined ? parseFloat(pm.feret_angulo_max) : null,
          "feret_angulo_min":       pm.feret_angulo_min !== undefined ? parseFloat(pm.feret_angulo_min) : null,
          "centroide_hull_x":       parseFloat(pm.centroide_hull_x || (pm.centroid && pm.centroid[0])) || 0,
          "centroide_hull_y":       parseFloat(pm.centroide_hull_y || (pm.centroid && pm.centroid[1])) || 0
        };
      }),

      // ── Horadaciones — métricas morfológicas individuales ───────────────
      "horadaciones": (obj.horadaciones || []).map(function(horad, idx) {
        var hm = horad.metricas || {};
        return {
          "id":                     horad.id || (idx + 1),
          "area_mm2":               parseFloat(hm.area || horad.area) || 0,
          "perimetro_mm":           parseFloat(hm.perimeter || hm.perimetro || horad.perimetro) || 0,
          "ancho_mm":               parseFloat(hm.width) || 0,
          "alto_mm":                parseFloat(hm.height) || 0,
          "centroide_x":            parseFloat(hm.centroide_x || (hm.centroid && hm.centroid[0])) || 0,
          "centroide_y":            parseFloat(hm.centroide_y || (hm.centroid && hm.centroid[1])) || 0,
          "distancia_al_centro_mm": parseFloat(horad.distanciaAlCentro) || 0,
          "forma_detectada":        hm.forma_detectada || null,
          "forma_confianza":        parseFloat(hm.forma_confianza) || 0,
          "circularity":            hm.circularity  !== undefined ? parseFloat(hm.circularity)  : null,
          "compactness":            hm.compactness  !== undefined ? parseFloat(hm.compactness)  : null,
          "solidity":               hm.solidity     !== undefined ? parseFloat(hm.solidity)     : null,
          "convexity":              hm.convexity    !== undefined ? parseFloat(hm.convexity)    : null,
          "aspect_ratio":           hm.aspect_ratio !== undefined ? parseFloat(hm.aspect_ratio) : null,
          "excentricidad":          hm.excentricidad !== undefined ? parseFloat(hm.excentricidad) : null,
          "eje_mayor_mm":           hm.eje_mayor    !== undefined ? parseFloat(hm.eje_mayor)    : null,
          "eje_menor_mm":           hm.eje_menor    !== undefined ? parseFloat(hm.eje_menor)    : null,
          "radio_maximo_mm":        hm.radio_maximo !== undefined ? parseFloat(hm.radio_maximo) : null,
          "radio_minimo_mm":        hm.radio_minimo !== undefined ? parseFloat(hm.radio_minimo) : null,
          "regularidad_radial":     hm.regularidad_radial !== undefined ? parseFloat(hm.regularidad_radial) : null,
          "desviacion_radial_mm":   hm.desviacion_radial  !== undefined ? parseFloat(hm.desviacion_radial)  : null,
          "coef_variacion_radial":  hm.coeficiente_variacion_radial !== undefined ? parseFloat(hm.coeficiente_variacion_radial) : null,
          "vertices_aproximados":   parseInt(hm.vertices_aproximados) || 0,
          "shape_factor":           hm.shape_factor     !== undefined ? parseFloat(hm.shape_factor)     : null,
          "rectangularity":         hm.rectangularity   !== undefined ? parseFloat(hm.rectangularity)   : null,
          "elongation":             hm.elongation       !== undefined ? parseFloat(hm.elongation)       : null,
          "feret_max_mm":           hm.feret_max        !== undefined ? parseFloat(hm.feret_max)        : null,
          "feret_min_mm":           hm.feret_min        !== undefined ? parseFloat(hm.feret_min)        : null,
          "feret_ratio":            hm.feret_ratio      !== undefined ? parseFloat(hm.feret_ratio)      : null,
          "feret_angulo_max":       hm.feret_angulo_max !== undefined ? parseFloat(hm.feret_angulo_max) : null,
          "feret_angulo_min":       hm.feret_angulo_min !== undefined ? parseFloat(hm.feret_angulo_min) : null,
          "centroide_hull_x":       parseFloat(hm.centroide_hull_x || (hm.centroid && hm.centroid[0])) || 0,
          "centroide_hull_y":       parseFloat(hm.centroide_hull_y || (hm.centroid && hm.centroid[1])) || 0
        };
      }),

      // ── Métricas agregadas P/H — totales y porcentajes sobre el objeto ─────
      "analisis_ph": (function() {
        var _nP = (obj.perforaciones || []).length;
        var _nH = (obj.horadaciones  || []).length;
        if (_nP === 0 && _nH === 0) return null;
        var _mPH  = obj.metricas || {};
        // Área bruta: suma de todas las P medidas (incluye P inscritas en H) — para display
        // Área efectiva: excluye P inscritas en H — para cálculo de área neta del objeto
        var _areaP = parseFloat(_mPH.area_perforaciones_bruta  != null ? _mPH.area_perforaciones_bruta  : (_mPH.area_perforaciones  || 0)) || 0;
        var _areaH = parseFloat(_mPH.area_horadaciones_bruta   != null ? _mPH.area_horadaciones_bruta   : (_mPH.area_horadaciones   || 0)) || 0;
        var _pctP  = parseFloat(_mPH.porcentaje_perforado) || 0;
        var _pctH  = parseFloat(_mPH.porcentaje_horadado)  || 0;
        return {
          "num_perforaciones":               _nP,
          "num_horadaciones":                _nH,
          "area_total_perforaciones_mm2":    parseFloat(_areaP.toFixed(4)),
          "area_efectiva_perforaciones_mm2": parseFloat((parseFloat(_mPH.area_perforaciones) || 0).toFixed(4)),
          "area_total_horadaciones_mm2":     parseFloat(_areaH.toFixed(4)),
          "porcentaje_perforado":            parseFloat(_pctP.toFixed(4)),
          "porcentaje_horadado":             parseFloat(_pctH.toFixed(4)),
          "porosidad_total_pct":             parseFloat((_pctP + _pctH).toFixed(4)),
          "area_neta_mm2":                   parseFloat((parseFloat(_mPH.area_neta != null ? _mPH.area_neta : (obj.area_neta || 0))) || 0).toFixed(4) * 1
        };
      })()
    };
  }


export async function validarCoherenciaPreexportacion(obj, metricas, modo = 'monofacial') {
    const validaciones = {
      modo: modo,
      errores: [],
      advertencias: [],
      metricas_validadas: 0,
      integridad: true,
      timestamp: new Date().toISOString()
    };
    
    console.log(`🔐 [VALIDACIÓN] Iniciando validación de coherencia (${modo})...`);
    
    try {
      // 1. VALIDAR DIMENSIONES BÁSICAS
      if (obj && obj.width > 0 && obj.height > 0 && metricas && metricas.area > 0 && metricas.perimeter > 0) {
        validaciones.metricas_validadas++;
        console.log(`   ✅ Dimensiones OK: ${obj.width}×${obj.height}px, Área=${metricas.area.toFixed(2)}`);
      } else {
        validaciones.errores.push("Dimensiones incompletas o inválidas");
        console.warn(`⚠️ Dimensiones faltantes o inválidas`);
      }
      
      // 2. VALIDAR PROPIEDADES GEOMÉTRICAS
      if (metricas.area && metricas.perimeter && metricas.width && metricas.height) {
        const maxArea = metricas.width * metricas.height;
        const ratio = metricas.area / maxArea;
        
        if (ratio > 1.1) {
          validaciones.errores.push(`Área inconsistente: ${metricas.area.toFixed(2)} >${maxArea.toFixed(2)}`);
        } else if (ratio > 0.99) {
          validaciones.advertencias.push(`Objeto ocupa casi 100% del bounding box (${(ratio*100).toFixed(1)}%)`);
        }
        validaciones.metricas_validadas++;
        console.log(`   ✅ Propiedades geométricas OK (Área=${metricas.area.toFixed(2)}, Perímetro=${metricas.perimeter.toFixed(2)})`);
      }
      
      // 3. VALIDAR RADIOS Y EJES
      if (metricas.radio_maximo && metricas.radio_minimo && typeof metricas.radio_maximo === 'number' && typeof metricas.radio_minimo === 'number') {
        if (metricas.radio_minimo > metricas.radio_maximo) {
          validaciones.errores.push(`Radios invertidos: Rmin=${Number(metricas.radio_minimo).toFixed(2)} >Rmax=${Number(metricas.radio_maximo).toFixed(2)}`);
        } else if (metricas.radio_minimo <= 0) {
          validaciones.errores.push(`Radio mínimo inválido: ${metricas.radio_minimo}`);
        }
        validaciones.metricas_validadas++;
        console.log(`   ✅ Radios OK: Rmax=${Number(metricas.radio_maximo).toFixed(2)}, Rmin=${Number(metricas.radio_minimo).toFixed(2)}`);
      } else if (metricas.radio_maximo || metricas.radio_minimo) {
        // Existen pero no son números válidos
        validaciones.advertencias.push(`Radios presentes pero formato inválido (Rmax=${metricas.radio_maximo}, Rmin=${metricas.radio_minimo})`);
      }
      
      // 4. VALIDAR SOLIDEZ/COMPLETITUD
      if (metricas.solidity !== undefined && typeof metricas.solidity === 'number') {
        if (metricas.solidity >= 0 && metricas.solidity <= 1) {
          console.log(`   ✅ Solidez OK: ${(metricas.solidity*100).toFixed(1)}%`);
          validaciones.metricas_validadas++;
        } else {
          validaciones.advertencias.push(`Solidez fuera de rango [0,1]: ${metricas.solidity}`);
        }
      } else if (metricas.solidity !== undefined) {
        validaciones.advertencias.push(`Solidez formato inválido: ${metricas.solidity}`);
      }
      
      // 5. VALIDAR FORMA DETECTADA
      if (!metricas.forma_detectada) {
        validaciones.advertencias.push(`Forma detectada no disponible`);
      } else {
        console.log(`   ✅ Forma detectada OK: "${metricas.forma_detectada}"`);
      }
      
      // 6. VALIDAR CONTEO P/H
      if (metricas.num_perforaciones !== undefined) {
        if (typeof metricas.num_perforaciones === 'number' && metricas.num_perforaciones >= 0) {
          if (metricas.num_perforaciones > 20) {
            validaciones.advertencias.push(`Número anormalmente alto de perforaciones: ${metricas.num_perforaciones}`);
          }
          console.log(`   ✅ Perforaciones OK: ${metricas.num_perforaciones}`);
        } else {
          validaciones.errores.push(`Número perforaciones inválido: ${metricas.num_perforaciones}`);
        }
      }
    } catch (error) {
      // Capturar errores sin fallar - la validación es permisiva
      validaciones.advertencias.push(`Error durante validación: ${error.message} (continuando...)`);
      console.warn('⚠️ Error en función de validación (no crítico):', error);
    }
    
    validaciones.integridad = validaciones.errores.length === 0;
    
    console.log(`🔐 ────────────────────────────────────────────`);
    console.log(`🔐 Validación (${modo}): Métricas=${validaciones.metricas_validadas}, Errores=${validaciones.errores.length}, Advertencias=${validaciones.advertencias.length}`);
    console.log(`🔐 Integridad: ${validaciones.integridad ? '✅ ACEPTADA' : '❌ RECHAZADA'}`);
    console.log(`🔐 ────────────────────────────────────────────`);
    
    if (validaciones.errores.length > 0) {
      console.error('❌ ERRORES CRÍTICOS:');
      validaciones.errores.forEach((e, i) => console.error(`   ${i+1}. ${e}`));
    }
    
    window.ultimaValidacionCoherencia = validaciones;
    return validaciones;
  }
