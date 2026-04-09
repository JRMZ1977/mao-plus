// MAO Plus — Explorador de colecciones y visor de análisis
let currentCollection = null;
let filteredObjects = [];

/**
 * Abrir explorador de colección
 */
async function openCollectionExplorer(projectId) {
  console.log('📂 openCollectionExplorer llamado con projectId:', projectId);
  
  const project = projectManager.getProject(projectId);
  
  if (!project) {
    console.error('❌ Proyecto no encontrado para ID:', projectId);
    console.log('📋 Proyectos disponibles:', projectManager.projects.map(p => ({ id: p.id, name: p.name })));
    toast.error('Proyecto no encontrado');
    return;
  }
  
  if (!project.folderPath) {
    console.error('❌ Proyecto sin folderPath:', project.name);
    toast.error('Este proyecto no tiene carpeta configurada');
    return;
  }
  
  console.log(`📂 Abriendo colección: "${project.name}" en ${project.folderPath}`);
  
  // Mostrar panel
  const collectionPanel = document.getElementById('collectionPanel');
  collectionPanel.classList.add('active');
  
  // Actualizar título
  document.getElementById('collectionPanelTitle').textContent = project.name;
  
  // Resetear filtros y búsqueda al abrir
  const searchInput = document.getElementById('collectionSearchInput');
  if (searchInput) searchInput.value = '';
  const clearBtn = document.getElementById('clearSearchBtn');
  if (clearBtn) clearBtn.style.display = 'none';
  const modoFilter = document.getElementById('collectionModoFilter');
  if (modoFilter) modoFilter.value = 'all';
  const sortBy = document.getElementById('collectionSortBy');
  if (sortBy) sortBy.value = 'timestamp-desc';
  
  // Mostrar estado de carga
  showCollectionLoadingState();
  
  try {
    // Cargar colección desde disco
    let collection = await projectManager.loadProjectCollection(projectId);
    
    if (!collection) {
      console.warn('⚠️ loadProjectCollection devolvió null, intentando rebuildCollectionIndex...');
      collection = await projectManager.rebuildCollectionIndex(project);
    }
    
    if (!collection) {
      showCollectionErrorState('No se pudo cargar la colección. Verifique que la carpeta del proyecto existe.');
      return;
    }
    
    console.log(`✅ Colección cargada: ${collection.totalObjetos} objetos, ${(collection.objetos || []).length} en array`);
    
    currentCollection = collection;
    filteredObjects = [...(collection.objetos || [])];
    
    // Actualizar subtítulo
    const totalObj = (collection.objetos || []).length;
    const subtitle = `${totalObj} objeto${totalObj !== 1 ? 's' : ''} • Última actualización: ${new Date(collection.ultimaActualizacion || Date.now()).toLocaleString('es-ES')}`;
    document.getElementById('collectionPanelSubtitle').textContent = subtitle;
    
    // Renderizar tabla
    renderCollectionTable();
    
    // Ocultar loading, mostrar contenido
    hideCollectionLoadingState();
    
    console.log(`✅ Colección renderizada exitosamente: ${filteredObjects.length} objetos mostrados`);
    
    // Sincronizar conteo de analyses en localStorage con el índice real del disco
    if (project.analyses.length !== totalObj) {
      console.log(`🔄 Sincronizando conteo: localStorage=${project.analyses.length} → disco=${totalObj}`);
      project.analyses = (collection.objetos || []).map(obj => ({
        id: obj.id,
        timestamp: obj.timestamp,
        nombreObjeto: obj.nombreObjeto,
        cara: obj.cara,
        modo: obj.modo,
        carpeta: obj.carpeta,
        rutaCompleta: obj.rutaCompleta || (project.folderPath && obj.carpeta ? `${project.folderPath}/${obj.carpeta}` : null)
      }));
      project.updatedAt = new Date().toISOString();
      projectManager.save();
    }
    
  } catch (error) {
    console.error('❌ Error abriendo colección:', error);
    console.error('   Stack:', error.stack);
    showCollectionErrorState(error.message || 'Error desconocido al cargar la colección');
  }
}

/**
 * Renderizar tabla de colección
 */
function renderCollectionTable() {
  console.log(`🎨 renderCollectionTable: ${filteredObjects.length} objetos a renderizar`);
  
  const tableBody = document.getElementById('collectionTableBody');
  
  if (!tableBody) {
    console.error('❌ No se encontró collectionTableBody en el DOM');
    return;
  }
  
  if (!filteredObjects || filteredObjects.length === 0) {
    console.log('📭 Sin objetos para mostrar — mostrando estado vacío');
    showCollectionEmptyState();
    return;
  }
  
  hideCollectionEmptyState();
  
  const rows = filteredObjects.map((obj, index) => {
    try {
    const fecha = new Date(obj.timestamp).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
    
    const modoBadge = obj.modo === 'bifacial' 
      ? '<span class="modo-badge bifacial">Bifacial</span>'
      : '<span class="modo-badge monofacial">Mono</span>';
    
    const shapeIcon = getShapeIcon(obj.metricasResumen?.clasificacionForma || 'sin_clasificar');
    
    // 🐛 FIX: Construir nombre con indicador de cara para objetos bifaciales
    let nombreCompleto = obj.nombreObjeto;
    if (obj.cara && (obj.cara === 'A' || obj.cara === 'B')) {
      const caraIcono = obj.cara === 'A'? '': '';
      const caraNombre = obj.cara === 'A' ? 'Cara A' : 'Cara B';
      nombreCompleto = `${nombreCompleto} <span style="color: ${obj.cara === 'A' ? '#0066cc' : '#28a745'}; font-weight: 600; font-size: 11px;">${caraIcono} ${caraNombre}</span>`;
    }
    
    // Validar y formatear métricas numéricas
    const area = parseFloat(obj.metricasResumen?.area) || 0;
    const circularidad = parseFloat(obj.metricasResumen?.circularidad) || 0;
    const perforaciones = parseInt(obj.metricasResumen?.numPerforaciones) || 0;
    const horadaciones = parseInt(obj.metricasResumen?.numHoradaciones) || 0;
    const phCount = `${perforaciones}/${horadaciones}`;
    
    return `
      <tr data-analysis-id="${obj.id}" data-carpeta="${obj.carpeta}">
        <td class="col-number">${index + 1}</td>
        <td class="col-name">${nombreCompleto}</td>
        <td class="col-date">${fecha}</td>
        <td class="col-modo">${modoBadge}</td>
        <td class="col-area">${area.toFixed(2)} mm²</td>
        <td class="col-circularity">${circularidad.toFixed(3)}</td>
        <td class="col-shape"><span class="shape-icon" title="${obj.metricasResumen?.clasificacionForma || 'sin_clasificar'}">${shapeIcon}</span></td>
        <td class="col-perforations">${phCount}</td>
        <td class="col-actions">
          <button class="row-action-btn view-analysis-btn" title="Ver detalles del an&#225;lisis">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Ver
          </button>
        </td>
      </tr>
    `;
    } catch (rowError) {
      console.error(`❌ Error renderizando fila ${index}:`, rowError, obj);
      return `<tr><td colspan="9" style="color: red;">Error en objeto ${index + 1}: ${obj?.nombreObjeto || 'desconocido'}</td></tr>`;
    }
  }).join('');
  
  tableBody.innerHTML = rows;
  
  // Event listeners para las filas (solo filas válidas con data-carpeta)
  tableBody.querySelectorAll('tr[data-carpeta]').forEach(row => {
    const viewBtn = row.querySelector('.view-analysis-btn');
    if (!viewBtn) return; // omitir filas de error sin botón
    
    viewBtn.addEventListener('click', async () => {
      await openAnalysisViewer(row.dataset.carpeta);
    });
  });
  
  // Actualizar stats
  updateCollectionStats();
}

/**
 * Abrir visualizador de análisis
 */
async function openAnalysisViewer(analysisFolderName) {
  if (!currentCollection) return;
  
  // 🆕 Soportar proyectos abiertos desde carpeta externa (sin projectManager)
  let analysisFolderPath;
  
  if (currentCollection.folderPath) {
    // Proyecto abierto desde carpeta externa
    analysisFolderPath = `${currentCollection.folderPath}/${analysisFolderName}`;
  } else {
    // Proyecto del projectManager
    const project = projectManager.getProject(currentCollection.proyectoId);
    if (!project) {
      toast.error('Proyecto no encontrado');
      return;
    }
    analysisFolderPath = `${project.folderPath}/${analysisFolderName}`;
  }
  
  console.log('📂 Abriendo análisis desde:', analysisFolderPath);
  
  // Verificar que la carpeta existe antes de mostrar el overlay
  const carpetaExiste = typeof window.electronAPI?.folderExists === 'function'
    ? await window.electronAPI.folderExists(analysisFolderPath)
    : true; // si no hay método, intentar y dejar que loadAnalysisFromDisk lo detecte
  
  if (!carpetaExiste) {
    toast.error(`El análisis "${analysisFolderName}" no existe en disco (guardado interrumpido). Se eliminará del índice.`);
    // Eliminar la fila correspondiente del panel
    const row = document.querySelector(`tr[data-carpeta="${analysisFolderName}"]`);
    if (row) row.remove();
    // Limpiar también del índice en memoria
    if (currentCollection && currentCollection.objetos) {
      currentCollection.objetos = currentCollection.objetos.filter(o => o.carpeta !== analysisFolderName);
      currentCollection.totalObjetos = currentCollection.objetos.length;
      updateCollectionStats();
    }
    return;
  }

  // Mostrar overlay
  const viewerOverlay = document.getElementById('analysisViewerOverlay');
  viewerOverlay.classList.add('active');
  
  // Cargar análisis desde disco
  const analysis = await projectManager.loadAnalysisFromDisk(analysisFolderPath);
  
  if (!analysis) {
    toast.error('Error al cargar análisis');
    viewerOverlay.classList.remove('active');
    return;
  }
  
  console.log('📊 Análisis cargado - estructura:', {
    nombreObjeto: analysis.nombreObjeto,
    tieneMetricas: !!analysis.metricas,
    tipoMetricas: typeof analysis.metricas,
    propiedadesMetricas: analysis.metricas ? Object.keys(analysis.metricas).slice(0, 10) : [],
    circularidad: {
      valor: analysis.metricas?.circularity,
      tipo: typeof analysis.metricas?.circularity,
      esNumero: !isNaN(parseFloat(analysis.metricas?.circularity))
    },
    perforaciones: analysis.perforaciones?.length || 0,
    horadaciones: analysis.horadaciones?.length || 0
  });
  
  // Guardar ruta del análisis actual para uso en otras tabs
  window.currentAnalysisPath = analysisFolderPath;
  window.currentAnalysisData = analysis;

  // ── Recálculo retroactivo de incertidumbre óptica posicional ──────────────────
  // Para análisis guardados antes de que se implementara esta métrica.
  if (analysis.metricas.error_optico_lineal_percent === undefined) {
    console.log('🔭 Análisis antiguo — intentando calcular error óptico retroactivamente...');
    try {
      // Preferir parámetros guardados en metadata.json; respaldo en localStorage
      const pc       = analysis.configuracion?.parametros_captura || {};
      const focalVal = pc.focal_mm     || parseFloat(localStorage.getItem('focalLength')  || document.getElementById('focalInput')?.value  || '') || 0;
      const swVal    = pc.sensor_w_mm  || parseFloat(localStorage.getItem('sensorWidth')  || document.getElementById('sensorWidthInput')?.value  || '') || 0;
      const shVal    = pc.sensor_h_mm  || parseFloat(localStorage.getItem('sensorHeight') || document.getElementById('sensorHeightInput')?.value || '') || null;
      const distVal  = pc.distancia_mm || parseFloat(localStorage.getItem('distancia')    || document.getElementById('distanciaInput')?.value  || '') || 0;
      const cxObj    = parseFloat(analysis.metricas.centroide_x);
      const cyObj    = parseFloat(analysis.metricas.centroide_y);

      if (focalVal > 0 && swVal > 0 && distVal > 0 && !isNaN(cxObj)) {
        // Usar dimensiones guardadas; si no hay, cargar original.png del disco
        let imgDims = (pc.img_w > 0 && pc.img_h > 0) ? { w: pc.img_w, h: pc.img_h } : null;
        if (!imgDims) {
          imgDims = await new Promise((resolve) => {
            const img = new Image();
            img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => resolve(null);
            img.src = analysis.imagenes?.original || `${analysisFolderPath}/imagenes/original.png`;
          });
        }

        if (imgDims && imgDims.w > 0 && imgDims.h > 0 && typeof window.estimarErrorOptico === 'function') {
          const errorOptico = window.estimarErrorOptico({
            objCentroide: { x: cxObj, y: cyObj },
            imgW: imgDims.w, imgH: imgDims.h,
            focalMM: focalVal, sensorW: swVal, sensorH: shVal,
            distanciaObjMM: distVal
          });
          if (errorOptico) {
            analysis.metricas.error_optico_lineal_percent  = errorOptico.error_lineal_percent;
            analysis.metricas.error_optico_area_percent    = errorOptico.error_area_percent;
            analysis.metricas.error_perspectiva_percent    = errorOptico.error_perspectiva_percent;
            analysis.metricas.error_distorsion_percent     = errorOptico.error_distorsion_percent;
            analysis.metricas.posicion_radial_norm         = errorOptico.posicion_radial_norm;
            analysis.metricas.angulo_optico_deg            = errorOptico.angulo_optico_deg;
            analysis.metricas.k1_estimado                  = errorOptico.k1_estimado;
            analysis.metricas.fov_diagonal_deg             = errorOptico.fovDiagDeg;
            analysis.metricas.confianza_optica             = errorOptico.confianza_optica;
            analysis.metricas.nota_error_optico            = errorOptico.nota;
            analysis.metricas._error_optico_retroactivo    = true;
            window.aplicarIncertidumbreOptica?.(analysis.metricas, errorOptico);
            console.log(`🔭 Error óptico retroactivo: ±${errorOptico.error_lineal_percent}% | ${errorOptico.confianza_optica}`);
          }
        } else if (!imgDims) {
          console.warn('🔭 No se pudo cargar imagen original para obtener dimensiones.');
        }
      } else {
        console.log('🔭 Sin parámetros ópticos disponibles (focal/sensor/distancia). Bloque de incertidumbre no se mostrará.');
      }
    } catch (eoRetroErr) {
      console.warn('⚠️ Error en recálculo retroactivo de incertidumbre óptica:', eoRetroErr);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Corrección retroactiva de area_neta para JSONs guardados con código anterior ──
  // (cuando había horadaciones que contenían perforaciones y se sumaba P+H por error)
  if (analysis.horadaciones?.length > 0 && typeof calcularAreaEfectivaPH === 'function') {
    const _areaBase = parseFloat(analysis.metricas?.area) || 0;
    const _phSoloH  = calcularAreaEfectivaPH([], analysis.horadaciones);
    const _aNetaSoloH = Math.max(0, _areaBase - _phSoloH.areaTotalHoradaciones);
    const _aNetaDisco = typeof analysis.metricas?.area_neta === 'number' ? analysis.metricas.area_neta : -Infinity;
    const _aNetaCorrecta = Math.max(_aNetaSoloH, _aNetaDisco);

    if (Math.abs(_aNetaCorrecta - _aNetaDisco) > 0.001) {
      console.log(`🔧 Corrigiendo area_neta retroactivamente: ${_aNetaDisco?.toFixed(3)} → ${_aNetaCorrecta.toFixed(3)} mm²`);
      const _phCompleto = calcularAreaEfectivaPH(analysis.perforaciones || [], analysis.horadaciones);
      analysis.metricas.area_neta    = _aNetaCorrecta;
      analysis.metricas.porosidad    = _areaBase > 0 ? ((_areaBase - _aNetaCorrecta) / _areaBase * 100) : 0;
      analysis.metricas.area_perforaciones = _phCompleto.areaTotalPerforaciones;
      analysis.metricas.area_perforaciones_bruta = _phCompleto.areaBrutaPerforaciones;
      analysis.metricas._area_neta_corregida_retroactivamente = true;

      // Persistir corrección en metricas.json en disco
      // IMPORTANTE: respetar la estructura { objeto, perforaciones, horadaciones, estadisticas }
      // que espera loadAnalysisFromDisk al leer metricas.objeto
      if (window.electronAPI?.saveFile && analysisFolderPath) {
        try {
          await window.electronAPI.saveFile(
            `${analysisFolderPath}/metricas.json`,
            JSON.stringify({
              objeto: analysis.metricas,
              perforaciones: analysis.perforaciones || [],
              horadaciones: analysis.horadaciones || [],
              estadisticas: analysis.estadisticas || {}
            }, null, 2)
          );
          console.log(`✅ metricas.json actualizado en disco con area_neta corregida`);
        } catch (saveErr) {
          console.warn(`⚠️ No se pudo persistir corrección en disco:`, saveErr.message);
        }
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // Actualizar título
  document.getElementById('analysisViewerTitle').textContent = analysis.nombreObjeto;
  document.getElementById('analysisViewerSubtitle').textContent = `${analysis.modo} • ${new Date(analysis.timestamp).toLocaleString('es-ES')}`;
  
  // Renderizar métricas
  renderAnalysisMetrics(analysis);
  
  // Renderizar metadatos
  renderAnalysisMetadata(analysis);
  
  // TODO: Renderizar otras tabs (geometría, imágenes)
}

/**
 * Cargar datos de geometría desde geometria.json
 */
async function loadGeometryData(analysisFolderPath) {
  try {
    const geometriaPath = `${analysisFolderPath}/geometria.json`;
    console.log('📐 Cargando geometria.json desde:', geometriaPath);
    
    const result = await window.electronAPI.readFile(geometriaPath);
    
    if (!result.success) {
      console.error('❌ Error al leer geometria.json:', result.error);
      return null;
    }
    
    const geometryData = JSON.parse(result.content);
    console.log('✅ Geometría cargada:', {
      contornoReal: geometryData.contornoReal?.puntos?.length || 0,
      convexHull: geometryData.convexHull?.puntos?.length || 0,
      perforaciones: geometryData.perforaciones?.length || 0,
      horadaciones: geometryData.horadaciones?.length || 0,
      ejes: !!geometryData.ejes,
      centroides: !!geometryData.centroides
    });
    
    return geometryData;
  } catch (error) {
    console.error('❌ Error al cargar geometría:', error);
    return null;
  }
}

/**
 * Renderizar geometría en el canvas del visualizador
 */
function renderGeometryCanvas(geometryData) {
  const canvas = document.getElementById('geometryCanvas');
  if (!canvas) {
    console.error('❌ Canvas de geometría no encontrado');
    return;
  }
  
  const ctx = canvas.getContext('2d');
  
  if (!geometryData) {
    console.error('❌ No hay datos de geometría para renderizar');
    // Mostrar mensaje en el canvas
    canvas.width = 700;
    canvas.height = 400;
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#6c757d';
    ctx.font = '16px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No se encontraron datos de geometría', canvas.width / 2, canvas.height / 2 - 20);
    ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('Este análisis puede ser de una versión anterior', canvas.width / 2, canvas.height / 2 + 20);
    return;
  }
  
  console.log('📐 Datos de geometría recibidos:', {
    contornoReal: geometryData.contornoReal?.puntos?.length || 0,
    convexHull: geometryData.convexHull?.puntos?.length || 0,
    perforaciones: geometryData.perforaciones?.length || 0,
    horadaciones: geometryData.horadaciones?.length || 0,
    boundingBox: geometryData.boundingBox
  });
  
  // Calcular dimensiones del canvas basadas en bounding box
  const bbox = geometryData.boundingBox || {};
  const objWidth = bbox.width || 800;
  const objHeight = bbox.height || 600;
  
  // Configurar tamaño del canvas con padding
  const maxCanvasSize = 700;
  const padding = 40; // Padding alrededor del objeto
  const availableWidth = maxCanvasSize - (padding * 2);
  const availableHeight = maxCanvasSize - (padding * 2);
  
  // Calcular escala para que el objeto quepa con padding (sin límite superior para permitir ampliación)
  const baseScale = Math.min(availableWidth / objWidth, availableHeight / objHeight);
  // Factor de zoom adicional para mejorar visualización (1.2x más grande)
  const zoomFactor = 1.2;
  const scale = baseScale * zoomFactor;
  const scaledWidth = objWidth * scale;
  const scaledHeight = objHeight * scale;
  
  // Tamaño final del canvas (cuadrado para mejor presentación)
  const canvasSize = Math.max(scaledWidth, scaledHeight) + (padding * 2);
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  
  // Calcular offset para centrar el objeto
  const offsetX = (canvasSize - scaledWidth) / 2;
  const offsetY = (canvasSize - scaledHeight) / 2;
  
  console.log(`📐 Canvas configurado:`, {
    canvasSize: `${canvasSize}x${canvasSize}px`,
    objetoEscalado: `${scaledWidth.toFixed(1)}x${scaledHeight.toFixed(1)}px`,
    escala: scale.toFixed(3),
    offset: `(${offsetX.toFixed(1)}, ${offsetY.toFixed(1)})`,
    padding: `${padding}px`
  });
  
  // Limpiar canvas con fondo blanco
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasSize, canvasSize);
  
  // Dibujar grid de fondo sutil (opcional, para referencia visual)
  ctx.strokeStyle = '#f0f0f0';
  ctx.lineWidth = 0.5;
  const gridSpacing = 50;
  for (let x = 0; x < canvasSize; x += gridSpacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasSize);
    ctx.stroke();
  }
  for (let y = 0; y < canvasSize; y += gridSpacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasSize, y);
    ctx.stroke();
  }
  
  // Estado de visibilidad (se controla con checkboxes)
  const visibility = window.geometryVisibility || {
    contour: true,
    hull: true,
    axes: true,
    centroids: true,
    radios: true,
    perforaciones: true,
    horadaciones: true
  };
  
  // Helper para transformar coordenadas (con centrado)
  const transform = (x, y) => ({
    x: ((x - (bbox.minX || 0)) * scale) + offsetX,
    y: ((y - (bbox.minY || 0)) * scale) + offsetY
  });
  
  // Helper para extraer coordenadas de diferentes formatos
  const getX = (p) => {
    if (p === null || p === undefined) return 0;
    if (typeof p === 'object' && p.x !== undefined) return p.x;
    if (Array.isArray(p)) return p[0];
    return 0;
  };
  
  const getY = (p) => {
    if (p === null || p === undefined) return 0;
    if (typeof p === 'object' && p.y !== undefined) return p.y;
    if (Array.isArray(p)) return p[1];
    return 0;
  };
  
  // 1. DIBUJAR CONVEX HULL (Naranja punteado)
  if (visibility.hull && geometryData.convexHull?.puntos?.length > 0) {
    try {
      const hull = geometryData.convexHull;
      ctx.strokeStyle = hull.color || '#ffa500';
      ctx.lineWidth = Math.max((hull.grosor || 2) * scale, 1);
      if (hull.punteado) {
        ctx.setLineDash(hull.punteado.map(d => d * scale));
      }
      ctx.beginPath();
      
      const p0 = hull.puntos[0];
      const start = transform(getX(p0), getY(p0));
      ctx.moveTo(start.x, start.y);
      
      for (let i = 1; i < hull.puntos.length; i++) {
        const p = hull.puntos[i];
        const point = transform(getX(p), getY(p));
        ctx.lineTo(point.x, point.y);
      }
      
      if (hull.cerrado !== false) ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      console.log(`🔶 Convex Hull dibujado: ${hull.puntos.length} puntos`);
    } catch (error) {
      console.error('❌ Error dibujando Convex Hull:', error);
    }
  }
  
  // 2. DIBUJAR CONTORNO REAL (Verde)
  if (visibility.contour && geometryData.contornoReal?.puntos?.length > 0) {
    try {
      const contorno = geometryData.contornoReal;
      ctx.strokeStyle = contorno.color || '#00ff00';
      ctx.lineWidth = Math.max((contorno.grosor || 2) * scale, 1);
      ctx.beginPath();
      
      const p0 = contorno.puntos[0];
      const start = transform(getX(p0), getY(p0));
      ctx.moveTo(start.x, start.y);
      
      for (let i = 1; i < contorno.puntos.length; i++) {
        const p = contorno.puntos[i];
        const point = transform(getX(p), getY(p));
        ctx.lineTo(point.x, point.y);
      }
      
      if (contorno.cerrado !== false) ctx.closePath();
      ctx.stroke();
      console.log(`✅ Contorno real dibujado: ${contorno.puntos.length} puntos`);
    } catch (error) {
      console.error('❌ Error dibujando Contorno:', error);
    }
  }
  
  // 3. DIBUJAR PERFORACIONES (Azul)
  if (visibility.perforaciones && geometryData.perforaciones?.length > 0) {
    try {
      geometryData.perforaciones.forEach((perf, idx) => {
        if (perf.puntos?.length > 0) {
          ctx.strokeStyle = perf.color || '#0066cc';
          ctx.lineWidth = Math.max((perf.grosor || 2) * scale, 1);
          ctx.beginPath();
          
          const p0 = perf.puntos[0];
          const start = transform(getX(p0), getY(p0));
          ctx.moveTo(start.x, start.y);
          
          for (let i = 1; i < perf.puntos.length; i++) {
            const p = perf.puntos[i];
            const point = transform(getX(p), getY(p));
            ctx.lineTo(point.x, point.y);
          }
          
          if (perf.cerrado !== false) ctx.closePath();
          ctx.stroke();
          
          // Dibujar centroide
          if (perf.centroide && visibility.centroids) {
            const c = transform(perf.centroide[0], perf.centroide[1]);
            ctx.fillStyle = perf.color || '#0066cc';
            ctx.beginPath();
            ctx.arc(c.x, c.y, Math.max(3 * scale, 2), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });
      console.log(`🔵 Perforaciones dibujadas: ${geometryData.perforaciones.length}`);
    } catch (error) {
      console.error('❌ Error dibujando Perforaciones:', error);
    }
  }
  
  // 4. DIBUJAR HORADACIONES (Verde)
  if (visibility.horadaciones && geometryData.horadaciones?.length > 0) {
    try {
      geometryData.horadaciones.forEach((horad, idx) => {
        if (horad.puntos?.length > 0) {
          ctx.strokeStyle = horad.color || '#28a745';
          ctx.lineWidth = Math.max((horad.grosor || 2) * scale, 1);
          ctx.beginPath();
          
          const p0 = horad.puntos[0];
          const start = transform(getX(p0), getY(p0));
          ctx.moveTo(start.x, start.y);
          
          for (let i = 1; i < horad.puntos.length; i++) {
            const p = horad.puntos[i];
            const point = transform(getX(p), getY(p));
            ctx.lineTo(point.x, point.y);
          }
          
          if (horad.cerrado !== false) ctx.closePath();
          ctx.stroke();
          
          // Dibujar centroide
          if (horad.centroide && visibility.centroids) {
            const c = transform(horad.centroide[0], horad.centroide[1]);
            ctx.fillStyle = horad.color || '#28a745';
            ctx.beginPath();
            ctx.arc(c.x, c.y, Math.max(3 * scale, 2), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });
      console.log(`🟢 Horadaciones dibujadas: ${geometryData.horadaciones.length}`);
    } catch (error) {
      console.error('❌ Error dibujando Horadaciones:', error);
    }
  }
  
  // 5. DIBUJAR CENTROIDES PRINCIPALES
  if (visibility.centroids && geometryData.centroides) {
    try {
      // Centroide Hull (principal)
      if (geometryData.centroides.centroideHull?.coordenadas) {
        const c = transform(
          geometryData.centroides.centroideHull.coordenadas[0],
          geometryData.centroides.centroideHull.coordenadas[1]
        );
        ctx.fillStyle = geometryData.centroides.centroideHull.color || '#ff6600';
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max((geometryData.centroides.centroideHull.radio || 5) * scale, 3), 0, Math.PI * 2);
        ctx.fill();
        
        // Borde blanco
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      
      // Centroide Real
      if (geometryData.centroides.centroideReal?.coordenadas) {
        const c = transform(
          geometryData.centroides.centroideReal.coordenadas[0],
          geometryData.centroides.centroideReal.coordenadas[1]
        );
        ctx.fillStyle = geometryData.centroides.centroideReal.color || '#ffff00';
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max((geometryData.centroides.centroideReal.radio || 3) * scale, 2), 0, Math.PI * 2);
        ctx.fill();
        
        // Borde blanco
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      console.log('🎯 Centroides dibujados');
    } catch (error) {
      console.error('❌ Error dibujando Centroides:', error);
    }
  }
  
  // 6. DIBUJAR EJES PRINCIPALES
  if (visibility.axes && geometryData.ejes) {
    try {
      // Eje Mayor (Rojo)
      if (geometryData.ejes.ejeMayor) {
        const eje = geometryData.ejes.ejeMayor;
        if (eje.p1 && eje.p2) {
          const p1 = transform(eje.p1[0], eje.p1[1]);
          const p2 = transform(eje.p2[0], eje.p2[1]);
          ctx.strokeStyle = eje.color || '#ff0000';
          ctx.lineWidth = Math.max((eje.grosor || 2.5) * scale, 1.5);
          if (eje.punteado) {
            ctx.setLineDash(eje.punteado.map(d => d * scale));
          }
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      
      // Eje Menor (Verde)
      if (geometryData.ejes.ejeMenor) {
        const eje = geometryData.ejes.ejeMenor;
        if (eje.p1 && eje.p2) {
          const p1 = transform(eje.p1[0], eje.p1[1]);
          const p2 = transform(eje.p2[0], eje.p2[1]);
          ctx.strokeStyle = eje.color || '#00ff00';
          ctx.lineWidth = Math.max((eje.grosor || 2.5) * scale, 1.5);
          if (eje.punteado) {
            ctx.setLineDash(eje.punteado.map(d => d * scale));
          }
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      console.log('📏 Ejes dibujados');
    } catch (error) {
      console.error('❌ Error dibujando Ejes:', error);
    }
  }
  
  // 7. DIBUJAR RADIOS EXTREMOS
  if (visibility.radios && geometryData.radios) {
    try {
      const centroHull = geometryData.centroides?.centroideHull?.coordenadas;
      if (centroHull) {
        // Radio Máximo (Azul cielo)
        if (geometryData.radios.radioMaximo?.puntoExtremo) {
          const c = transform(centroHull[0], centroHull[1]);
          const p = transform(
            geometryData.radios.radioMaximo.puntoExtremo[0],
            geometryData.radios.radioMaximo.puntoExtremo[1]
          );
          ctx.strokeStyle = geometryData.radios.radioMaximo.color || '#00bfff';
          ctx.lineWidth = Math.max((geometryData.radios.radioMaximo.grosor || 2) * scale, 1);
          if (geometryData.radios.radioMaximo.punteado) {
            ctx.setLineDash(geometryData.radios.radioMaximo.punteado.map(d => d * scale));
          }
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        
        // Radio Mínimo (Magenta)
        if (geometryData.radios.radioMinimo?.puntoExtremo) {
          const c = transform(centroHull[0], centroHull[1]);
          const p = transform(
            geometryData.radios.radioMinimo.puntoExtremo[0],
            geometryData.radios.radioMinimo.puntoExtremo[1]
          );
          ctx.strokeStyle = geometryData.radios.radioMinimo.color || '#ff1493';
          ctx.lineWidth = Math.max((geometryData.radios.radioMinimo.grosor || 2) * scale, 1);
          if (geometryData.radios.radioMinimo.punteado) {
            ctx.setLineDash(geometryData.radios.radioMinimo.punteado.map(d => d * scale));
          }
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      console.log('📐 Radios dibujados');
    } catch (error) {
      console.error('❌ Error dibujando Radios:', error);
    }
  }
  
  // 8. DIBUJAR INFORMACIÓN DE ESCALA Y DIMENSIONES
  try {
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#6c757d';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    // Información en esquina superior izquierda
    const infoX = 10;
    const infoY = 10;
    const lineHeight = 14;
    
    // Fondo semi-transparente para la info
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(infoX - 5, infoY - 5, 160, 75);
    ctx.strokeStyle = '#dee2e6';
    ctx.lineWidth = 1;
    ctx.strokeRect(infoX - 5, infoY - 5, 160, 75);
    
    // Texto de información
    ctx.fillStyle = '#495057';
    ctx.fillText(`Escala: ${scale.toFixed(4)}x`, infoX, infoY);
    ctx.fillText(`Dimensiones:`, infoX, infoY + lineHeight);
    ctx.fillText(`   Original: ${objWidth.toFixed(1)} × ${objHeight.toFixed(1)} px`, infoX, infoY + lineHeight * 2);
    ctx.fillText(`   Canvas: ${canvasSize} × ${canvasSize} px`, infoX, infoY + lineHeight * 3);
    
    if (geometryData.escala) {
      const escalaFactor = geometryData.escala.factorConversion || geometryData.escala.factor;
      if (escalaFactor) {
        ctx.fillText(`${escalaFactor.toFixed(4)} mm/px`, infoX, infoY + lineHeight * 4);
      }
    }
    
    // Barra de escala visual en la parte inferior
    const scaleBarWidth = 100;
    const scaleBarHeight = 3;
    const scaleBarX = canvasSize - scaleBarWidth - 20;
    const scaleBarY = canvasSize - 30;
    
    // Fondo de la barra
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(scaleBarX - 10, scaleBarY - 15, scaleBarWidth + 20, 35);
    ctx.strokeStyle = '#dee2e6';
    ctx.lineWidth = 1;
    ctx.strokeRect(scaleBarX - 10, scaleBarY - 15, scaleBarWidth + 20, 35);
    
    // Barra de escala
    ctx.fillStyle = '#495057';
    ctx.fillRect(scaleBarX, scaleBarY, scaleBarWidth, scaleBarHeight);
    
    // Marcadores de la barra
    ctx.strokeStyle = '#495057';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(scaleBarX, scaleBarY - 5);
    ctx.lineTo(scaleBarX, scaleBarY + scaleBarHeight + 5);
    ctx.moveTo(scaleBarX + scaleBarWidth, scaleBarY - 5);
    ctx.lineTo(scaleBarX + scaleBarWidth, scaleBarY + scaleBarHeight + 5);
    ctx.stroke();
    
    // Texto de la barra de escala
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#495057';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('100 px', scaleBarX + scaleBarWidth / 2, scaleBarY + scaleBarHeight + 7);
    
    console.log('📊 Información de escala añadida');
  } catch (error) {
    console.error('❌ Error dibujando información:', error);
  }
  
  console.log('✅ Geometría renderizada completamente');
}

/**
 * Exportar geometría a formato SVG vectorial
 */
async function exportGeometryToSVG() {
  if (!window.currentGeometryData || !window.currentAnalysisData) {
    toast.error('No hay geometría cargada para exportar');
    return;
  }
  
  const geometryData = window.currentGeometryData;
  const analysis = window.currentAnalysisData;
  
  console.log('📐 Exportando geometría a SVG...');
  
  // Calcular dimensiones del SVG basadas en bounding box
  const bbox = geometryData.boundingBox || {};
  const width = bbox.width || 800;
  const height = bbox.height || 600;
  const minX = bbox.minX || 0;
  const minY = bbox.minY || 0;

  // ── Factor de escala real (mm/px) ──────────────────────────────────────────
  // ViewBox se mantiene en píxeles; solo width/height del SVG se expresan en mm
  // Así todos los editores vectoriales (Inkscape, Illustrator, CAD) respetan la escala 1:1
  const escala = geometryData.escala || {};
  const factor = escala.factorConversion || escala.factor || 1; // mm/px
  const unidades = escala.unidades || 'mm';
  const widthMM = +(width  * factor).toFixed(3);
  const heightMM = +(height * factor).toFixed(3);
  const scalado = factor !== 1;
  console.log(`📏 Escala SVG: ${factor} mm/px → dimensiones reales ${widthMM}×${heightMM} ${unidades}`);
  // ──────────────────────────────────────────────────────────────────────────

  // Helper para extraer coordenadas
  const getX = (p) => {
    if (p === null || p === undefined) return 0;
    if (typeof p === 'object' && p.x !== undefined) return p.x;
    if (Array.isArray(p)) return p[0];
    return 0;
  };
  
  const getY = (p) => {
    if (p === null || p === undefined) return 0;
    if (typeof p === 'object' && p.y !== undefined) return p.y;
    if (Array.isArray(p)) return p[1];
    return 0;
  };
  
  // Convertir puntos a path SVG
  const pointsToPath = (puntos, closed = true) => {
    if (!puntos || puntos.length === 0) return '';
    
    const p0 = puntos[0];
    let path = `M ${getX(p0) - minX} ${getY(p0) - minY}`;
    
    for (let i = 1; i < puntos.length; i++) {
      const p = puntos[i];
      path += ` L ${getX(p) - minX} ${getY(p) - minY}`;
    }
    
    if (closed) path += ' Z';
    return path;
  };
  
  // Iniciar SVG
  // width/height en mm → escala física real; viewBox en px → coordenadas sin tocar
  let svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n`;
  svg += `<svg xmlns="http://www.w3.org/2000/svg" `;
  svg += `width="${widthMM}mm" height="${heightMM}mm" `;
  svg += `viewBox="0 0 ${width} ${height}">\n`;
  
  // ========================================================================
  // METADATOS DEL PROYECTO EN SVG
  // ========================================================================
  svg += `  <title>Análisis Morfológico - ${analysis.nombreObjeto || 'Objeto'}</title>\n`;
  svg += `  <desc>Exportado desde MAO Plus - ${new Date().toLocaleString('es-ES')}</desc>\n`;
  
  if (projectManager?.activeProject) {
    svg += `  <metadata>\n`;
    svg += `    <proyecto>\n`;
    svg += `      <nombre>${projectManager.activeProject.name || 'N/A'}</nombre>\n`;
    if (projectManager.activeProject.descripcion) {
      svg += `      <descripcion>${projectManager.activeProject.descripcion}</descripcion>\n`;
    }
    if (projectManager.activeProject.sitio) {
      svg += `      <sitio>${projectManager.activeProject.sitio}</sitio>\n`;
    }
    if (projectManager.activeProject.investigadorResponsable) {
      svg += `      <investigador>${projectManager.activeProject.investigadorResponsable}</investigador>\n`;
    }
    if (projectManager.activeProject.institucionResponsable) {
      svg += `      <institucion>${projectManager.activeProject.institucionResponsable}</institucion>\n`;
    }
    svg += `    </proyecto>\n`;
    svg += `  </metadata>\n`;
  }

  // Escala real embebida en desc
  svg += `  <desc>Escala: 1 px = ${factor} mm | Dimensiones reales: ${widthMM} × ${heightMM} ${unidades} | Exportado desde MAO Plus - ${new Date().toLocaleString('es-ES')}</desc>\n`;
  svg += `\n`;
  // ========================================================================

  
  // Fondo blanco (usa viewBox px, igual que el resto de la geometría)
  svg += `  <rect width="${width}" height="${height}" fill="white"/>\n\n`;
  
  // CAPA 1: Convex Hull (debajo de todo)
  if (geometryData.convexHull?.puntos?.length > 0) {
    const hull = geometryData.convexHull;
    const path = pointsToPath(hull.puntos, hull.cerrado !== false);
    const dashArray = hull.punteado ? hull.punteado.join(',') : 'none';
    svg += `  <!-- Convex Hull -->\n`;
    svg += `  <path d="${path}" `;
    svg += `fill="none" `;
    svg += `stroke="${hull.color || '#ffa500'}" `;
    svg += `stroke-width="${hull.grosor || 2}" `;
    svg += `stroke-dasharray="${dashArray}" `;
    svg += `stroke-linecap="round" stroke-linejoin="round"/>\n\n`;
  }
  
  // CAPA 2: Contorno Real
  if (geometryData.contornoReal?.puntos?.length > 0) {
    const contorno = geometryData.contornoReal;
    const path = pointsToPath(contorno.puntos, contorno.cerrado !== false);
    svg += `  <!-- Contorno Real -->\n`;
    svg += `  <path d="${path}" `;
    svg += `fill="none" `;
    svg += `stroke="${contorno.color || '#00ff00'}" `;
    svg += `stroke-width="${contorno.grosor || 2}" `;
    svg += `stroke-linecap="round" stroke-linejoin="round"/>\n\n`;
  }
  
  // CAPA 3: Perforaciones
  if (geometryData.perforaciones?.length > 0) {
    svg += `  <!-- Perforaciones -->\n`;
    svg += `  <g id="perforaciones">\n`;
    geometryData.perforaciones.forEach((perf, idx) => {
      if (perf.puntos?.length > 0) {
        const path = pointsToPath(perf.puntos, perf.cerrado !== false);
        svg += `    <path d="${path}" `;
        svg += `fill="none" `;
        svg += `stroke="${perf.color || '#0066cc'}" `;
        svg += `stroke-width="${perf.grosor || 2}" `;
        svg += `stroke-linecap="round" stroke-linejoin="round"/>\n`;
        
        // Centroide de perforación
        if (perf.centroide) {
          svg += `    <circle cx="${perf.centroide[0] - minX}" cy="${perf.centroide[1] - minY}" `;
          svg += `r="3" fill="${perf.color || '#0066cc'}"/>\n`;
        }
      }
    });
    svg += `  </g>\n\n`;
  }
  
  // CAPA 4: Horadaciones
  if (geometryData.horadaciones?.length > 0) {
    svg += `  <!-- Horadaciones -->\n`;
    svg += `  <g id="horadaciones">\n`;
    geometryData.horadaciones.forEach((horad, idx) => {
      if (horad.puntos?.length > 0) {
        const path = pointsToPath(horad.puntos, horad.cerrado !== false);
        svg += `    <path d="${path}" `;
        svg += `fill="none" `;
        svg += `stroke="${horad.color || '#28a745'}" `;
        svg += `stroke-width="${horad.grosor || 2}" `;
        svg += `stroke-linecap="round" stroke-linejoin="round"/>\n`;
        
        // Centroide de horadación
        if (horad.centroide) {
          svg += `    <circle cx="${horad.centroide[0] - minX}" cy="${horad.centroide[1] - minY}" `;
          svg += `r="3" fill="${horad.color || '#28a745'}"/>\n`;
        }
      }
    });
    svg += `  </g>\n\n`;
  }
  
  // CAPA 5: Ejes Principales
  if (geometryData.ejes) {
    svg += `  <!-- Ejes Principales -->\n`;
    svg += `  <g id="ejes">\n`;
    
    // Eje Mayor
    if (geometryData.ejes.ejeMayor?.p1 && geometryData.ejes.ejeMayor?.p2) {
      const eje = geometryData.ejes.ejeMayor;
      const dashArray = eje.punteado ? eje.punteado.join(',') : 'none';
      svg += `    <line x1="${eje.p1[0] - minX}" y1="${eje.p1[1] - minY}" `;
      svg += `x2="${eje.p2[0] - minX}" y2="${eje.p2[1] - minY}" `;
      svg += `stroke="${eje.color || '#ff0000'}" `;
      svg += `stroke-width="${eje.grosor || 2.5}" `;
      svg += `stroke-dasharray="${dashArray}" `;
      svg += `stroke-linecap="round"/>\n`;
    }
    
    // Eje Menor
    if (geometryData.ejes.ejeMenor?.p1 && geometryData.ejes.ejeMenor?.p2) {
      const eje = geometryData.ejes.ejeMenor;
      const dashArray = eje.punteado ? eje.punteado.join(',') : 'none';
      svg += `    <line x1="${eje.p1[0] - minX}" y1="${eje.p1[1] - minY}" `;
      svg += `x2="${eje.p2[0] - minX}" y2="${eje.p2[1] - minY}" `;
      svg += `stroke="${eje.color || '#00ff00'}" `;
      svg += `stroke-width="${eje.grosor || 2.5}" `;
      svg += `stroke-dasharray="${dashArray}" `;
      svg += `stroke-linecap="round"/>\n`;
    }
    svg += `  </g>\n\n`;
  }
  
  // CAPA 6: Radios Extremos
  if (geometryData.radios && geometryData.centroides?.centroideHull?.coordenadas) {
    const centroHull = geometryData.centroides.centroideHull.coordenadas;
    svg += `  <!-- Radios Extremos -->\n`;
    svg += `  <g id="radios">\n`;
    
    // Radio Máximo
    if (geometryData.radios.radioMaximo?.puntoExtremo) {
      const r = geometryData.radios.radioMaximo;
      const dashArray = r.punteado ? r.punteado.join(',') : 'none';
      svg += `    <line x1="${centroHull[0] - minX}" y1="${centroHull[1] - minY}" `;
      svg += `x2="${r.puntoExtremo[0] - minX}" y2="${r.puntoExtremo[1] - minY}" `;
      svg += `stroke="${r.color || '#00bfff'}" `;
      svg += `stroke-width="${r.grosor || 2}" `;
      svg += `stroke-dasharray="${dashArray}" `;
      svg += `stroke-linecap="round"/>\n`;
    }
    
    // Radio Mínimo
    if (geometryData.radios.radioMinimo?.puntoExtremo) {
      const r = geometryData.radios.radioMinimo;
      const dashArray = r.punteado ? r.punteado.join(',') : 'none';
      svg += `    <line x1="${centroHull[0] - minX}" y1="${centroHull[1] - minY}" `;
      svg += `x2="${r.puntoExtremo[0] - minX}" y2="${r.puntoExtremo[1] - minY}" `;
      svg += `stroke="${r.color || '#ff1493'}" `;
      svg += `stroke-width="${r.grosor || 2}" `;
      svg += `stroke-dasharray="${dashArray}" `;
      svg += `stroke-linecap="round"/>\n`;
    }
    svg += `  </g>\n\n`;
  }
  
  // CAPA 7: Centroides (al final para que estén visibles)
  if (geometryData.centroides) {
    svg += `  <!-- Centroides -->\n`;
    svg += `  <g id="centroides">\n`;
    
    // Centroide Hull
    if (geometryData.centroides.centroideHull?.coordenadas) {
      const c = geometryData.centroides.centroideHull;
      svg += `    <circle cx="${c.coordenadas[0] - minX}" cy="${c.coordenadas[1] - minY}" `;
      svg += `r="${c.radio || 5}" `;
      svg += `fill="${c.color || '#ff6600'}" `;
      svg += `stroke="white" stroke-width="2"/>\n`;
    }
    
    // Centroide Real
    if (geometryData.centroides.centroideReal?.coordenadas) {
      const c = geometryData.centroides.centroideReal;
      svg += `    <circle cx="${c.coordenadas[0] - minX}" cy="${c.coordenadas[1] - minY}" `;
      svg += `r="${c.radio || 3}" `;
      svg += `fill="${c.color || '#ffff00'}" `;
      svg += `stroke="white" stroke-width="1"/>\n`;
    }
    svg += `  </g>\n\n`;
  }
  
  // ── BARRA DE ESCALA VISUAL ────────────────────────────────────────────────
  // Elige un valor redondo de barra (en mm) proporcional al ancho del objeto
  const barTargetMM = (() => {
    const candidates = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500];
    const targetMM = widthMM * 0.18; // ~18% del ancho
    return candidates.reduce((a, b) => Math.abs(b - targetMM) < Math.abs(a - targetMM) ? b : a);
  })();
  const barLengthPx = barTargetMM / factor;          // longitud de la barra en coord px/viewBox
  const barY        = height - height * 0.04;         // 4% desde el borde inferior
  const barX        = width  - barLengthPx - width * 0.02; // margen derecho 2%
  const tickHeight  = height * 0.015;
  const fontSize    = Math.max(height * 0.025, 8);

  svg += `  <!-- Barra de escala -->
`;
  svg += `  <g id="barra-escala" opacity="0.85">
`;
  svg += `    <rect x="${barX.toFixed(1)}" y="${(barY - tickHeight * 0.5).toFixed(1)}" width="${barLengthPx.toFixed(1)}" height="${tickHeight.toFixed(1)}" fill="#222" rx="1"/>
`;
  svg += `    <line x1="${barX.toFixed(1)}" y1="${(barY - tickHeight).toFixed(1)}" x2="${barX.toFixed(1)}" y2="${(barY + tickHeight * 0.5).toFixed(1)}" stroke="#222" stroke-width="${(width * 0.003).toFixed(1)}"/>
`;
  svg += `    <line x1="${(barX + barLengthPx).toFixed(1)}" y1="${(barY - tickHeight).toFixed(1)}" x2="${(barX + barLengthPx).toFixed(1)}" y2="${(barY + tickHeight * 0.5).toFixed(1)}" stroke="#222" stroke-width="${(width * 0.003).toFixed(1)}"/>
`;
  svg += `    <text x="${(barX + barLengthPx / 2).toFixed(1)}" y="${(barY - tickHeight * 1.5).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize.toFixed(1)}" fill="#222">${barTargetMM} ${unidades}</text>
`;
  svg += `  </g>
\n`;
  // ──────────────────────────────────────────────────────────────────────────

  // Cerrar SVG
  svg += `</svg>`;
  
  // Guardar usando el mismo flujo de diálogo nativo que CSV y PDF
  const idArq = analysis.id?.replace(/[^a-zA-Z0-9_-]/g, '_');
  const nombreObjeto = analysis.nombreObjeto?.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'objeto';
  const filename = `${idArq || nombreObjeto}_geometria`;

  const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
  await window.saveFileWithDialog(filename, await svgBlob.text(), 'svg');

  console.log('✅ SVG exportado exitosamente');
  if (scalado) {
    toast.success(`SVG exportado a escala real: ${widthMM} × ${heightMM} ${unidades}`);
  } else {
    toast.success('Geometría exportada a SVG (sin factor de escala aplicado)');
  }
}

/**
 * Cargar imágenes del análisis
 */
async function loadAnalysisImages(analysisFolderPath) {
  try {
    const imagesFolder = `${analysisFolderPath}/imagenes`;
    console.log('🖼️ Cargando imágenes desde:', imagesFolder);
    
    const gallery = document.getElementById('imagesGallery');
    if (!gallery) {
      console.error('❌ Galería de imágenes no encontrada');
      return;
    }
    
    // Leer metadata de imágenes
    const metaPath = `${imagesFolder}/metadata.json`;
    const metaResult = await window.electronAPI.readFile(metaPath);
    
    if (!metaResult.success) {
      gallery.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-secondary);">
          <div style="font-size: 14px;">No se encontraron imágenes guardadas</div>
          <div style="font-size: 12px; margin-top: 8px;">Este análisis puede ser de una versión anterior</div>
        </div>
      `;
      return;
    }
    
    const metadata = JSON.parse(metaResult.content);
    const imagenes = metadata.imagenes || {};
    
    let imagenesEncontradas = 0;
    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; padding: 20px;">';
    
    // 1. OBJETO RECORTADO
    if (imagenes.objetoRecortado) {
      const imgPath = `${imagesFolder}/${imagenes.objetoRecortado}`;
      const imgResult = await window.electronAPI.readFile(imgPath);
      if (imgResult.success) {
        imagenesEncontradas++;
        html += `
          <div style="background: var(--bg-secondary); border-radius: var(--radius-md); padding: 15px; border: 1px solid var(--border-color); grid-column: 1 / -1;">
            <h4 style="margin: 0 0 12px 0; font-size: 13px; font-weight: 600; color: var(--text-primary);">
              Objeto Recortado
            </h4>
            <div style="background: white; border-radius: 4px; padding: 10px; text-align: center; max-height: 800px; overflow: auto;">
              <img src="${imgResult.content}" style="max-width: 100%; height: auto; border-radius: 4px; cursor: zoom-in;" 
                onclick="this.style.maxWidth = this.style.maxWidth === '100%' ? 'none' : '100%'; this.style.cursor = this.style.cursor === 'zoom-in' ? 'zoom-out' : 'zoom-in';"
                title="Click para ampliar/reducir">
            </div>
            <div style="display: flex; gap: 8px; margin-top: 12px;">
              <button onclick="downloadImage('${imgResult.content}', 'objeto_recortado.png')" 
                style="flex: 1; padding: 8px; background: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                ⬇ Descargar
              </button>
              <button onclick="navigator.clipboard.writeText('${imgResult.content}'); alert('Imagen copiada al portapapeles')" 
                style="flex: 1; padding: 8px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                Copiar
              </button>
            </div>
            <p style="margin: 8px 0 0 0; font-size: 11px; color: #6c757d; text-align: center;">
              Click en la imagen para ver en tamaño completo
            </p>
          </div>
        `;
      } else {
        console.warn('⚠️ objeto_recortado.png no se pudo leer:', imgResult.error);
      }
    }
    
    // 2. ANÁLISIS MORFOLÓGICO
    if (imagenes.analisisMorfologico) {
      const imgPath = `${imagesFolder}/${imagenes.analisisMorfologico}`;
      const imgResult = await window.electronAPI.readFile(imgPath);
      if (imgResult.success) {
        imagenesEncontradas++;
        html += `
          <div style="background: var(--bg-secondary); border-radius: var(--radius-md); padding: 15px; border: 1px solid var(--border-color); grid-column: 1 / -1;">
            <h4 style="margin: 0 0 12px 0; font-size: 13px; font-weight: 600; color: var(--text-primary);">
              Análisis Morfológico (Alta Resolución)
            </h4>
            <div style="background: white; border-radius: 4px; padding: 10px; text-align: center; max-height: 800px; overflow: auto;">
              <img src="${imgResult.content}" style="max-width: 100%; height: auto; border-radius: 4px; cursor: zoom-in;" 
                onclick="this.style.maxWidth = this.style.maxWidth === '100%' ? 'none' : '100%'; this.style.cursor = this.style.cursor === 'zoom-in' ? 'zoom-out' : 'zoom-in';"
                title="Click para ampliar/reducir">
            </div>
            <div style="display: flex; gap: 8px; margin-top: 12px;">
              <button onclick="downloadImage('${imgResult.content}', 'analisis_morfologico.png')" 
                style="flex: 1; padding: 8px; background: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                ⬇ Descargar Alta Resolución
              </button>
              <button onclick="navigator.clipboard.writeText('${imgResult.content}'); alert('Imagen copiada al portapapeles')" 
                style="flex: 1; padding: 8px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                Copiar
              </button>
            </div>
            <p style="margin: 8px 0 0 0; font-size: 11px; color: #6c757d; text-align: center;">
              Click en la imagen para ver en tamaño completo
            </p>
          </div>
        `;
      } else {
        console.warn('⚠️ analisis_morfologico.png no se pudo leer:', imgResult.error);
      }
    }
    
    html += '</div>';
    
    // Información adicional
    html += `
      <div style="padding: 20px; text-align: center; color: var(--text-secondary); font-size: 12px;">
        <div>Imágenes guardadas el ${new Date(metadata.fecha).toLocaleString('es-ES')}</div>
        <div style="margin-top: 4px;">Guardadas: ${metadata.totalImagenes} | Visualizadas: ${imagenesEncontradas}</div>
        ${imagenesEncontradas < metadata.totalImagenes ? '<div style="margin-top: 4px; color: #f0ad4e;">Algunas imágenes no se pudieron cargar</div>': ''}
      </div>
    `;
    
    gallery.innerHTML = html;
    console.log(`✅ ${imagenesEncontradas} de ${metadata.totalImagenes} imágenes visualizadas correctamente`);
  } catch (error) {
    console.error('❌ Error cargando imágenes:', error);
    const gallery = document.getElementById('imagesGallery');
    if (gallery) {
      gallery.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-secondary);">
          <div style="font-size: 14px;">Error al cargar imágenes</div>
          <div style="font-size: 12px; margin-top: 8px;">${error.message}</div>
        </div>
      `;
    }
  }
}

/**
 * Descargar imagen
 */
function downloadImage(dataURL, filename) {
  const link = document.createElement('a');
  link.href = dataURL;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  toast.success(`Imagen descargada: ${filename}`);
}

/**
 * Renderizar métricas en el visualizador de colecciones
 * Usa la función global generarTablaMetricasCompleta que tiene TODAS las 150+ métricas
 */
function renderAnalysisMetrics(analysis) {
  const metricsGrid = document.getElementById('metricsGrid');
  
  console.log('📊 Renderizando tabla COMPLETA de métricas (150+ propiedades)...');
  
  // Preparar objeto en el formato esperado
  const obj = {
    id: analysis.id || 'N/A',
    numeroObjeto: analysis.numeroObjeto || null,
    cara: analysis.cara || null,
    perforaciones: analysis.perforaciones || [],
    horadaciones: analysis.horadaciones || []
  };
  
  const metricas = analysis.metricas || {};
  
  console.log('  📦 Datos recibidos:', {
    totalPropiedadesMetricas: Object.keys(metricas).length,
    perforaciones: obj.perforaciones.length,
    horadaciones: obj.horadaciones.length,
    clasificacion: metricas.forma_detectada || 'N/A',
    algunasMetricas: Object.keys(metricas).slice(0, 10)
  });
  
  // Usar la función GLOBAL que tiene todas las métricas completas
  // Esta es la misma función que se usa en el análisis morfológico y PDF
  if (typeof window.generarTablaMetricasCompleta === 'function') {
    console.log('✅ Usando generarTablaMetricasCompleta (versión completa con 10 secciones)');
    metricsGrid.innerHTML = window.generarTablaMetricasCompleta(obj, metricas);
  } else {
    // Fallback si la función aún no está cargada (no debería pasar)
    console.warn('⚠️ window.generarTablaMetricasCompleta no disponible, usando versión simplificada');
    metricsGrid.innerHTML = generarTablaMetricasVisor(obj, metricas);
  }
  
  console.log('✅ Tabla de métricas completa renderizada');
}

/**
 * Renderizar metadatos en el visualizador de colecciones
 */
function renderAnalysisMetadata(analysis) {
  const metadataInfo = document.getElementById('metadataInfo');
  
  if (!metadataInfo) {
    console.error('❌ Contenedor de metadatos no encontrado');
    return;
  }
  
  console.log('📝 Renderizando metadatos del análisis...', analysis);
  
  const estiloCard = 'background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);';
  const estiloTitulo = 'color: #495057; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 3px solid #4a5568; font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 10px;';
  const estiloFila = 'display: flex; padding: 12px 0; border-bottom: 1px solid #f0f0f0;';
  const estiloLabel = 'width: 220px; color: #6c757d; font-weight: 600; font-size: 13px;';
  const estiloValor = 'flex: 1; color: #212529; font-size: 14px;';
  
  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  const formatNumber = (val, decimals = 2) => {
    const num = parseFloat(val);
    return isNaN(num) ? 'N/A' : num.toFixed(decimals);
  };
  
  let html = '<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif;">';
  
  // ============================================================
  // NIVEL 1: PROYECTO (Contexto principal)
  // ============================================================
  if (analysis.proyecto) {
    html += `
      <div style="${estiloCard}">
        <h3 style="${estiloTitulo}">
          <span></span>
          <span>PROYECTO</span>
        </h3>
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Nombre del Proyecto:</div>
          <div style="${estiloValor}"><strong>${analysis.proyecto.nombre || 'N/A'}</strong></div>
        </div>
        ${analysis.proyecto.descripcion ? `
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Descripción:</div>
          <div style="${estiloValor}">${analysis.proyecto.descripcion}</div>
        </div>` : ''}
        ${analysis.proyecto.sitio ? `
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Sitio Arqueológico:</div>
          <div style="${estiloValor}"><span style="color: #0066cc;"></span>${analysis.proyecto.sitio}</div>
        </div>` : ''}
        ${analysis.proyecto.investigadorResponsable ? `
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Investigador Responsable:</div>
          <div style="${estiloValor}"><span style="color: #28a745;"></span>${analysis.proyecto.investigadorResponsable}</div>
        </div>` : ''}
        ${analysis.proyecto.institucionResponsable ? `
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Institución Responsable:</div>
          <div style="${estiloValor}"><span style="color: #2d3748;"></span>${analysis.proyecto.institucionResponsable}</div>
        </div>` : ''}
        ${analysis.nombreFotografia ? `
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Fotografía del Objeto:</div>
          <div style="${estiloValor}"><span style="color: #fd7e14;"></span><code style="background: #f8f9fa; padding: 3px 8px; border-radius: 4px; font-size: 12px; color: #495057;">${analysis.nombreFotografia}</code></div>
        </div>` : ''}
      </div>
    `;
  }
  
  // ============================================================
  // NIVEL 2: IDENTIFICACIÓN DEL OBJETO
  // ============================================================
  html += `
    <div style="${estiloCard}">
      <h3 style="${estiloTitulo}">
        <span></span>
        <span>IDENTIFICACIÓN DEL OBJETO</span>
      </h3>
      <div style="${estiloFila}">
        <div style="${estiloLabel}">Nombre del Objeto:</div>
        <div style="${estiloValor}"><strong style="font-size: 15px; color: #212529;">${analysis.nombreObjeto || 'N/A'}</strong></div>
      </div>
      ${analysis.numeroObjeto ? `
      <div style="${estiloFila}">
        <div style="${estiloLabel}">Número de Objeto:</div>
        <div style="${estiloValor}"><strong>${analysis.numeroObjeto}</strong></div>
      </div>` : ''}
      ${analysis.cara && (analysis.cara === 'A' || analysis.cara === 'B') ? `
      <div style="${estiloFila}">
        <div style="${estiloLabel}">Cara Analizada:</div>
        <div style="${estiloValor}">${analysis.cara === 'A'? 'Cara A (Anverso)': 'Cara B (Reverso)'}</div>
      </div>` : ''}
      ${analysis.metricas?.forma_detectada ? `
      <div style="${estiloFila}">
        <div style="${estiloLabel}">Clasificación Morfológica:</div>
        <div style="${estiloValor}"><span style="background: linear-gradient(135deg, #4a5568 0%, #2d3748 100%); color: white; padding: 4px 12px; border-radius: 4px; font-weight: 600; font-size: 12px;">${analysis.metricas.forma_detectada.toUpperCase()}</span></div>
      </div>` : ''}
      <div style="${estiloFila}">
        <div style="${estiloLabel}">Modo de Análisis:</div>
        <div style="${estiloValor}">
          <span style="display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: 600; font-size: 12px; ${analysis.modo === 'bifacial' ? 'background: linear-gradient(135deg, #4a5568 0%, #2d3748 100%); color: white;' : 'background: #e9ecef; color: #495057;'}">
            ${analysis.modo === 'bifacial' ? 'BIFACIAL' : 'MONOFACIAL'}
          </span>
        </div>
      </div>
      <div style="${estiloFila}">
        <div style="${estiloLabel}">ID del Análisis:</div>
        <div style="${estiloValor}"><code style="background: #f8f9fa; padding: 4px 8px; border-radius: 4px; font-size: 11px; color: #6c757d;">${analysis.id || 'N/A'}</code></div>
      </div>
      <div style="${estiloFila}">
        <div style="${estiloLabel}">Fecha de Análisis:</div>
        <div style="${estiloValor}">${formatDate(analysis.timestamp)}</div>
      </div>
      ${(!analysis.proyecto && analysis.nombreFotografia) ? `
      <div style="${estiloFila}">
        <div style="${estiloLabel}">Fotografía del Objeto:</div>
        <div style="${estiloValor}"><span style="color: #fd7e14;"></span><code style="background: #f8f9fa; padding: 3px 8px; border-radius: 4px; font-size: 12px; color: #495057;">${analysis.nombreFotografia}</code></div>
      </div>` : ''}
    </div>
  `;
  
  // ============================================================
  // NIVEL 3: DIMENSIONES Y MÉTRICAS MORFOLÓGICAS
  // ============================================================
  if (analysis.metricas) {
    html += `
      <div style="${estiloCard}">
        <h3 style="${estiloTitulo}">
          <span></span>
          <span>DIMENSIONES Y MÉTRICAS MORFOLÓGICAS</span>
        </h3>
        ${analysis.metricas.area ? `
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Área:</div>
          <div style="${estiloValor}"><strong style="color: #0066cc;">${formatNumber(analysis.metricas.area, 2)} mm²</strong></div>
        </div>` : ''}
        ${analysis.metricas.perimeter ? `
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Perímetro:</div>
          <div style="${estiloValor}"><strong style="color: #0066cc;">${formatNumber(analysis.metricas.perimeter, 2)} mm</strong></div>
        </div>` : ''}
        ${analysis.metricas.major_axis_length ? `
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Eje Mayor:</div>
          <div style="${estiloValor}">${formatNumber(analysis.metricas.major_axis_length, 2)} mm</div>
        </div>` : ''}
        ${analysis.metricas.minor_axis_length ? `
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Eje Menor:</div>
          <div style="${estiloValor}">${formatNumber(analysis.metricas.minor_axis_length, 2)} mm</div>
        </div>` : ''}
        ${analysis.metricas.max_radius ? `
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Radio Máximo:</div>
          <div style="${estiloValor}">${formatNumber(analysis.metricas.max_radius, 2)} mm</div>
        </div>` : ''}
        ${analysis.metricas.min_radius ? `
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Radio Mínimo:</div>
          <div style="${estiloValor}">${formatNumber(analysis.metricas.min_radius, 2)} mm</div>
        </div>` : ''}
        ${analysis.metricas.circularity ? `
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Circularidad:</div>
          <div style="${estiloValor}">${formatNumber(analysis.metricas.circularity, 3)}</div>
        </div>` : ''}
        ${analysis.metricas.aspect_ratio ? `
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Relación de Aspecto:</div>
          <div style="${estiloValor}">${formatNumber(analysis.metricas.aspect_ratio, 3)}</div>
        </div>` : ''}
      </div>
    `;
  }
  
  // 4. PERFORACIONES Y HORADACIONES
  const numPerf = analysis.perforaciones?.length || 0;
  const numHorad = analysis.horadaciones?.length || 0;
  
  if (numPerf > 0 || numHorad > 0) {
    html += `
      <div style="${estiloCard}">
        <h3 style="${estiloTitulo}">
          <span></span>
          <span>PERFORACIONES Y HORADACIONES</span>
        </h3>
        ${numPerf > 0 ? `
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Número de Perforaciones:</div>
          <div style="${estiloValor}"><span style="background: #0066cc; color: white; padding: 4px 12px; border-radius: 4px; font-weight: 600; font-size: 12px;">${numPerf}</span></div>
        </div>
        ${analysis.metricas?.area_perforaciones ? `
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Área Total de Perforaciones:</div>
          <div style="${estiloValor}">${formatNumber(analysis.metricas.area_perforaciones, 2)} mm²</div>
        </div>` : ''}
        ${analysis.metricas?.porcentaje_perforado ? `
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Porcentaje Perforado:</div>
          <div style="${estiloValor}">${formatNumber(analysis.metricas.porcentaje_perforado, 2)}%</div>
        </div>` : ''}
        ` : ''}
        ${numHorad > 0 ? `
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Número de Horadaciones:</div>
          <div style="${estiloValor}"><span style="background: #28a745; color: white; padding: 4px 12px; border-radius: 4px; font-weight: 600; font-size: 12px;">${numHorad}</span></div>
        </div>
        ${analysis.metricas?.area_horadaciones ? `
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Área Total de Horadaciones:</div>
          <div style="${estiloValor}">${formatNumber(analysis.metricas.area_horadaciones, 2)} mm²</div>
        </div>` : ''}
        ${analysis.metricas?.porcentaje_horadado ? `
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Porcentaje Horadado:</div>
          <div style="${estiloValor}">${formatNumber(analysis.metricas.porcentaje_horadado, 2)}%</div>
        </div>` : ''}
        ` : ''}
      </div>
    `;
  }
  
  // 5. CONFIGURACIÓN
  html += `
    <div style="${estiloCard}">
      <h3 style="${estiloTitulo}">
        <span></span>
        <span>CONFIGURACIÓN TÉCNICA</span>
      </h3>
      <div style="${estiloFila}">
        <div style="${estiloLabel}">Escala:</div>
        <div style="${estiloValor}"><code style="background: #f8f9fa; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${formatNumber(analysis.escala || 1, 4)} px/mm</code></div>
      </div>
      <div style="${estiloFila}">
        <div style="${estiloLabel}">Unidades de Medida:</div>
        <div style="${estiloValor}">${analysis.unidades || 'mm'}</div>
      </div>
      <div style="${estiloFila}">
        <div style="${estiloLabel}">Versión MAO:</div>
        <div style="${estiloValor}"><code style="background: #f8f9fa; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${analysis.versionMAO || '1.2.0'}</code></div>
      </div>
    </div>
  `;
  
  // 6. PROCESAMIENTO
  html += `
    <div style="${estiloCard}">
      <h3 style="${estiloTitulo}">
        <span></span>
        <span>PROCESAMIENTO Y TRAZABILIDAD</span>
      </h3>
      <div style="${estiloFila}">
        <div style="${estiloLabel}">Fecha de Procesamiento:</div>
        <div style="${estiloValor}">${formatDate(analysis.timestamp)}</div>
      </div>
      ${analysis.carpetaOrigen ? `
      <div style="${estiloFila}">
        <div style="${estiloLabel}">Ubicación en Disco:</div>
        <div style="${estiloValor}"><code style="background: #f8f9fa; padding: 4px 8px; border-radius: 4px; font-size: 10px; color: #6c757d; word-break: break-all;">${analysis.carpetaOrigen}</code></div>
      </div>` : ''}
    </div>
  `;
  
  // 7. ARCHIVOS ASOCIADOS
  if (analysis.imagenes) {
    const imagenesDisponibles = Object.keys(analysis.imagenes).length;
    
    // Diccionario de descripciones de cada tipo de imagen
    const imagenesDescripciones = {
      original: 'Imagen original capturada',
      objetoRecortado: 'Objeto recortado (ROI)',
      contornoReal: 'Contorno real del objeto',
      convexHull: 'Envolvente convexa (Convex Hull)',
      ejesPrincipales: 'Ejes principales de orientación',
      radios: 'Análisis de radios morfológicos',
      perforaciones: 'Detección de perforaciones/huecos',
      analisisCompleto: 'Visualización completa del análisis',
      thumbnail: 'Miniatura para vista previa'
    };
    
    html += `
      <div style="${estiloCard}">
        <h3 style="${estiloTitulo}">
          <span></span>
          <span>ARCHIVOS ASOCIADOS</span>
        </h3>
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Archivos de Datos:</div>
          <div style="${estiloValor}">
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <code style="background: #f8f9fa; padding: 4px 8px; border-radius: 4px; font-size: 11px; color: #0066cc;">metadata.json</code>
              <code style="background: #f8f9fa; padding: 4px 8px; border-radius: 4px; font-size: 11px; color: #0066cc;">metricas.json</code>
              <code style="background: #f8f9fa; padding: 4px 8px; border-radius: 4px; font-size: 11px; color: #28a745;">metricas.csv</code>
              <code style="background: #f8f9fa; padding: 4px 8px; border-radius: 4px; font-size: 11px; color: #0066cc;">geometria.json</code>
            </div>
          </div>
        </div>
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Imágenes Generadas:</div>
          <div style="${estiloValor}"><span style="background: #2d3748; color: white; padding: 4px 12px; border-radius: 4px; font-weight: 600; font-size: 12px;">${imagenesDisponibles} tipos de visualización</span></div>
        </div>
    `;
    
    // Listar cada imagen con su descripción
    for (const [key, path] of Object.entries(analysis.imagenes)) {
      const descripcion = imagenesDescripciones[key] || 'Imagen del análisis';
      const nombreArchivo = path.split('/').pop();
      html += `
        <div style="${estiloFila}">
          <div style="${estiloLabel}"></div>
          <div style="${estiloValor}">
            <div style="display: flex; align-items: center; gap: 8px;">
              <code style="background: #f8f9fa; padding: 3px 8px; border-radius: 3px; font-size: 11px; color: #6610f2; min-width: 180px;">${nombreArchivo}</code>
              <span style="font-size: 12px; color: #6c757d;">→ ${descripcion}</span>
            </div>
          </div>
        </div>
      `;
    }
    
    html += `
      </div>
    `;
  }
  
  html += '</div>';
  
  // ============================================================
  // ERROR ÓPTICO POSICIONAL (solo si está disponible en las métricas)
  // ============================================================
  const m = analysis.metricas || {};
  if (m.error_optico_lineal_percent !== undefined) {
    const errorLineal = parseFloat(m.error_optico_lineal_percent);
    const colorConfianza = errorLineal < 0.5 ? '#28a745' :
                           errorLineal < 1.5 ? '#5cb85c' :
                           errorLineal < 3.0 ? '#f0ad4e' :
                           errorLineal < 6.0 ? '#d9534f' : '#c0392b';
    html += `
      <div style="${estiloCard}; border-left: 4px solid ${colorConfianza};">
        <h3 style="${estiloTitulo}">
          <span></span>
          <span>INCERTIDUMBRE ÓPTICA POSICIONAL</span>
          ${m._error_optico_retroactivo ? '<span style="background:#6c757d; color:white; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; margin-left:8px;">recalculado</span>' : ''}
          <span style="margin-left:auto; background:${colorConfianza}; color:white; padding:3px 10px; border-radius:4px; font-size:11px; font-weight:600;">${m.confianza_optica || ''}</span>
        </h3>
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Error lineal estimado:</div>
          <div style="${estiloValor}"><strong style="color:${colorConfianza}; font-size:16px;">±${errorLineal.toFixed(3)}%</strong></div>
        </div>
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Error en área estimado:</div>
          <div style="${estiloValor}"><strong style="color:${colorConfianza};">±${parseFloat(m.error_optico_area_percent || 0).toFixed(3)}%</strong></div>
        </div>
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Distorsión radial (k₁):</div>
          <div style="${estiloValor}">±${parseFloat(m.error_distorsion_percent || 0).toFixed(4)}%  <span style="color:#6c757d;font-size:12px;">(k₁ = ${m.k1_estimado})</span></div>
        </div>
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Error de perspectiva:</div>
          <div style="${estiloValor}">±${parseFloat(m.error_perspectiva_percent || 0).toFixed(4)}%</div>
        </div>
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Posición radial en imagen:</div>
          <div style="${estiloValor}">${parseFloat(m.posicion_radial_norm || 0).toFixed(3)} <span style="color:#6c757d;font-size:12px;">(0=centro · 1=borde)</span></div>
        </div>
        <div style="${estiloFila}">
          <div style="${estiloLabel}">Ángulo respecto al eje:</div>
          <div style="${estiloValor}">${parseFloat(m.angulo_optico_deg || 0).toFixed(3)}°</div>
        </div>
        <div style="${estiloFila}">
          <div style="${estiloLabel}">FOV diagonal del lente:</div>
          <div style="${estiloValor}">${m.fov_diagonal_deg}°</div>
        </div>
        <div style="${estiloFila}; border-bottom: none;">
          <div style="${estiloLabel}">Nota metodológica:</div>
          <div style="${estiloValor}; font-size:11px; color:#6c757d;">${m.nota_error_optico || 'k₁ estimado sin calibración formal de lente (incertidumbre del modelo ±30%)'}</div>
        </div>
      </div>
    `;
  } else {
    // ── Panel de disponibilidad de datos para incertidumbre óptica ──────────────
    const pc = analysis.configuracion?.parametros_captura || {};
    const isOldAnalysis = Object.keys(pc).length === 0;
    const hasCentroide  = !isNaN(parseFloat(m.centroide_x));

    const checks = [
      {
        label: 'Focal del lente',
        ok:    pc.focal_mm > 0,
        val:   pc.focal_mm > 0  ? `${pc.focal_mm} mm`  : null
      },
      {
        label: 'Ancho de sensor',
        ok:    pc.sensor_w_mm > 0,
        val:   pc.sensor_w_mm > 0 ? `${pc.sensor_w_mm} mm` : null
      },
      {
        label: 'Alto de sensor',
        ok:    pc.sensor_h_mm > 0,
        val:   pc.sensor_h_mm > 0 ? `${pc.sensor_h_mm} mm` : null
      },
      {
        label: 'Distancia al objeto',
        ok:    pc.distancia_mm > 0,
        val:   pc.distancia_mm > 0 ? `${pc.distancia_mm} mm` : null
      },
      {
        label: 'Dimensiones imagen',
        ok:    pc.img_w > 0 && pc.img_h > 0,
        val:   pc.img_w > 0 ? `${pc.img_w}×${pc.img_h} px` : null
      },
      {
        label: 'Centroide del objeto',
        ok:    hasCentroide,
        val:   hasCentroide ? `(${parseFloat(m.centroide_x).toFixed(1)}, ${parseFloat(m.centroide_y).toFixed(1)}) px` : null
      }
    ];

    const totalOk = checks.filter(c => c.ok).length;

    // Color y etiqueta del estado global
    const statusColor = isOldAnalysis ? '#6c757d'  :
                        totalOk === 6 ? '#5cb85c'  :
                        totalOk >= 4  ? '#f0ad4e'  : '#6c757d';
    const statusLabel = isOldAnalysis ? 'análisis previo'  :
                        totalOk === 6 ? 'datos completos'  :
                        totalOk >= 4  ? 'datos parciales'  : 'sin datos';

    const reason = isOldAnalysis
      ? 'Este análisis fue guardado antes de que la aplicación guardara los parámetros de captura óptica. Los análisis nuevos los incluirán automáticamente.'
      : totalOk < 4
        ? 'Faltan parámetros ópticos esenciales (focal, sensor, distancia). Completa la configuración de cámara antes de analizar para habilitar este bloque.'
        : 'Los parámetros guardados no fueron suficientes para completar el cálculo retroactivo en esta sesión.';

    html += `
      <div style="${estiloCard}; border-left: 4px solid #ced4da;">
        <h3 style="${estiloTitulo}">
          <span></span>
          <span style="color:#adb5bd;">INCERTIDUMBRE ÓPTICA POSICIONAL</span>
          <span style="margin-left:8px; background:${statusColor}; color:white; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; letter-spacing:0.4px;">${statusLabel}</span>
        </h3>
        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; margin: 4px 0 12px 0;">
          ${checks.map(c => `
            <div style="display:flex; align-items:flex-start; gap:8px; background:${c.ok ? '#f8fffe' : '#f8f9fa'}; border:1px solid ${c.ok ? '#c3e6cb' : '#e9ecef'}; border-radius:6px; padding:8px 10px;">
              <span style="color:${c.ok ? '#28a745' : '#ced4da'}; font-size:15px; flex-shrink:0; line-height:1.2;">${c.ok ? '✓' : '○'}</span>
              <div>
                <div style="font-size:10px; color:#6c757d; font-weight:600; text-transform:uppercase; letter-spacing:0.4px; margin-bottom:2px;">${c.label}</div>
                <div style="font-size:12px; color:${c.ok ? '#2d3748' : '#adb5bd'}; font-weight:${c.ok ? '600' : '400'};">
                  ${c.ok ? c.val : '—'}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        <div style="display:flex; align-items:flex-start; gap:8px; background:#f8f9fa; border-radius:6px; padding:9px 12px; border-left:3px solid #dee2e6;">
          <span style="color:#adb5bd; font-size:13px; flex-shrink:0;">ℹ</span>
          <span style="font-size:11px; color:#6c757d; line-height:1.5;">${reason}</span>
        </div>
      </div>
    `;
    // ─────────────────────────────────────────────────────────────────────────────
  }

  html += '<div style="height:1px;"></div></div>';
  
  metadataInfo.innerHTML = html;
  console.log('✅ Metadatos renderizados correctamente');
}

/**
 * Genera tabla completa de métricas para el visor de colecciones
 * Versión optimizada con todas las secciones necesarias
 */
function generarTablaMetricasVisor(obj, metricas) {
  const estiloTabla = 'width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);';
  const estiloTh = 'background: linear-gradient(135deg, #4a5568 0%, #2d3748 100%); color: white; padding: 12px; text-align: left; font-weight: 600; border: 1px solid #dee2e6;';
  const estiloTd = 'padding: 10px 12px; border: 1px solid #dee2e6;';
  
  const formatNumber = (val, decimals = 2) => {
    const num = parseFloat(val);
    return isNaN(num) ? 'N/A' : num.toFixed(decimals);
  };
  
  let html = '<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif;">';
  
  // 1. IDENTIFICACIÓN Y CLASIFICACIÓN
  html += `
    <h3 style="color: #495057; margin: 20px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #4a5568; font-size: 16px;">
      IDENTIFICACIÓN Y CLASIFICACIÓN
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
          <td style="${estiloTd}; font-weight: 600;">ID del Objeto</td>
          <td style="${estiloTd}; color: #0066cc; font-weight: 700;">${obj.id}</td>
          <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Identificador único</td>
        </tr>
        ${obj.numeroObjeto ? `
        <tr>
          <td style="${estiloTd}; font-weight: 600;">Número de Objeto</td>
          <td style="${estiloTd}">${obj.numeroObjeto}</td>
          <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Objeto bifacial</td>
        </tr>` : ''}
        ${obj.cara ? `
        <tr style="background: #f8f9fa;">
          <td style="${estiloTd}; font-weight: 600;">Cara</td>
          <td style="${estiloTd}">${obj.cara === 'A'? 'Anverso (A)': 'Reverso (B)'}</td>
          <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Cara del objeto</td>
        </tr>` : ''}
        <tr${!obj.cara && !obj.numeroObjeto ? ' style="background: #f8f9fa;"' : ''}>
          <td style="${estiloTd}; font-weight: 600;">Clasificación</td>
          <td style="${estiloTd}; color: #28a745; font-weight: 700;">${metricas.forma_detectada || 'No clasificado'}</td>
          <td style="${estiloTd}; font-size: 12px; color: #6c757d;">Forma geométrica detectada</td>
        </tr>
      </tbody>
    </table>
  `;
  
  // 2. DIMENSIONES BÁSICAS
  html += `
    <h3 style="color: #495057; margin: 20px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #4a5568; font-size: 16px;">
      � DIMENSIONES BÁSICAS
    </h3>
    <table style="${estiloTabla}">
      <thead>
        <tr>
          <th style="${estiloTh}">Métrica</th>
          <th style="${estiloTh}">Valor</th>
          <th style="${estiloTh}">Descripción</th>
        </tr>
      </thead>
      <tbody>
        <tr style="background: #f8f9fa;"><td style="${estiloTd}">Área</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.area, 2)} mm²</td><td style="${estiloTd}; font-size: 12px;">Superficie total del objeto</td></tr>
        <tr><td style="${estiloTd}">Perímetro</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.perimeter, 2)} mm</td><td style="${estiloTd}; font-size: 12px;">Longitud del contorno</td></tr>
        <tr style="background: #f8f9fa;"><td style="${estiloTd}">Ancho (W)</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.width, 2)} mm</td><td style="${estiloTd}; font-size: 12px;">Ancho del bbox</td></tr>
        <tr><td style="${estiloTd}">Alto (H)</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.height, 2)} mm</td><td style="${estiloTd}; font-size: 12px;">Alto del bbox</td></tr>
        <tr style="background: #f8f9fa;"><td style="${estiloTd}">Diámetro Máximo</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.max_diameter, 2)} mm</td><td style="${estiloTd}; font-size: 12px;">Mayor distancia entre puntos</td></tr>
        <tr><td style="${estiloTd}">Diámetro Mínimo</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.min_diameter, 2)} mm</td><td style="${estiloTd}; font-size: 12px;">Menor distancia perpendicular</td></tr>
      </tbody>
    </table>
  `;
  
  // 3. MÉTRICAS MORFOLÓGICAS
  html += `
    <h3 style="color: #495057; margin: 20px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #4a5568; font-size: 16px;">
      MÉTRICAS MORFOLÓGICAS
    </h3>
    <table style="${estiloTabla}">
      <thead>
        <tr>
          <th style="${estiloTh}">Métrica</th>
          <th style="${estiloTh}">Valor</th>
          <th style="${estiloTh}">Descripción</th>
        </tr>
      </thead>
      <tbody>
        <tr style="background: #f8f9fa;"><td style="${estiloTd}">Circularidad</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.circularity, 4)}</td><td style="${estiloTd}; font-size: 12px;">Proximidad a círculo perfecto (1.0 = círculo)</td></tr>
        <tr><td style="${estiloTd}">Compacidad</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.compactness, 4)}</td><td style="${estiloTd}; font-size: 12px;">Relación área/perímetro²</td></tr>
        <tr style="background: #f8f9fa;"><td style="${estiloTd}">Solidez</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.solidity, 4)}</td><td style="${estiloTd}; font-size: 12px;">Área/Área convexa</td></tr>
        <tr><td style="${estiloTd}">Convexidad</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.convexity, 4)}</td><td style="${estiloTd}; font-size: 12px;">Perímetro convexo/Perímetro</td></tr>
        <tr style="background: #f8f9fa;"><td style="${estiloTd}">Elongación</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.elongation, 4)}</td><td style="${estiloTd}; font-size: 12px;">Relación alto/ancho</td></tr>
        <tr><td style="${estiloTd}">Excentricidad</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.eccentricity, 4)}</td><td style="${estiloTd}; font-size: 12px;">Desviación de círculo (0-1)</td></tr>
        <tr style="background: #f8f9fa;"><td style="${estiloTd}">Rectangularidad</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.rectangularity, 4)}</td><td style="${estiloTd}; font-size: 12px;">Área/Área bbox</td></tr>
        <tr><td style="${estiloTd}">Asimetría</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.asymmetry, 4)}</td><td style="${estiloTd}; font-size: 12px;">Medida de asimetría</td></tr>
      </tbody>
    </table>
  `;
  
  // 4. ORIENTACIÓN
  html += `
    <h3 style="color: #495057; margin: 20px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #4a5568; font-size: 16px;">
      ORIENTACIÓN
    </h3>
    <table style="${estiloTabla}">
      <thead>
        <tr>
          <th style="${estiloTh}">Métrica</th>
          <th style="${estiloTh}">Valor</th>
          <th style="${estiloTh}">Descripción</th>
        </tr>
      </thead>
      <tbody>
        <tr style="background: #f8f9fa;"><td style="${estiloTd}">Ángulo Principal</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.orientation, 2)}°</td><td style="${estiloTd}; font-size: 12px;">Orientación del eje mayor</td></tr>
        <tr><td style="${estiloTd}">Eje Mayor</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.major_axis, 2)} mm</td><td style="${estiloTd}; font-size: 12px;">Longitud eje principal</td></tr>
        <tr style="background: #f8f9fa;"><td style="${estiloTd}">Eje Menor</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.minor_axis, 2)} mm</td><td style="${estiloTd}; font-size: 12px;">Longitud eje secundario</td></tr>
      </tbody>
    </table>
  `;
  
  // 5. SIMETRÍA
  if (metricas.symmetry_score !== undefined || metricas.symmetry_horizontal !== undefined) {
    html += `
      <h3 style="color: #495057; margin: 20px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #4a5568; font-size: 16px;">
        SIMETRÍA
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}">Métrica</th>
            <th style="${estiloTh}">Valor</th>
            <th style="${estiloTh}">Descripción</th>
          </tr>
        </thead>
        <tbody>
          ${metricas.symmetry_score !== undefined ? `<tr style="background: #f8f9fa;"><td style="${estiloTd}">Puntuación General</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.symmetry_score, 4)}</td><td style="${estiloTd}; font-size: 12px;">Simetría global</td></tr>` : ''}
          ${metricas.symmetry_horizontal !== undefined ? `<tr><td style="${estiloTd}">Simetría Horizontal</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.symmetry_horizontal, 4)}</td><td style="${estiloTd}; font-size: 12px;">Simetría eje horizontal</td></tr>` : ''}
          ${metricas.symmetry_vertical !== undefined ? `<tr style="background: #f8f9fa;"><td style="${estiloTd}">Simetría Vertical</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.symmetry_vertical, 4)}</td><td style="${estiloTd}; font-size: 12px;">Simetría eje vertical</td></tr>` : ''}
        </tbody>
      </table>
    `;
  }
  
  // 6. CARACTERÍSTICAS AVANZADAS
  html += `
    <h3 style="color: #495057; margin: 20px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #4a5568; font-size: 16px;">
      CARACTERÍSTICAS AVANZADAS
    </h3>
    <table style="${estiloTabla}">
      <thead>
        <tr>
          <th style="${estiloTh}">Métrica</th>
          <th style="${estiloTh}">Valor</th>
          <th style="${estiloTh}">Descripción</th>
        </tr>
      </thead>
      <tbody>
        <tr style="background: #f8f9fa;"><td style="${estiloTd}">Defectos de Convexidad</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.convexity_defects_count, 0)}</td><td style="${estiloTd}; font-size: 12px;">Número de concavidades</td></tr>
        <tr><td style="${estiloTd}">Profundidad Máx. Defecto</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.max_convexity_defect_depth, 2)} mm</td><td style="${estiloTd}; font-size: 12px;">Concavidad más profunda</td></tr>
        <tr style="background: #f8f9fa;"><td style="${estiloTd}">Rugosidad</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.roughness, 4)}</td><td style="${estiloTd}; font-size: 12px;">Irregularidad del contorno</td></tr>
        <tr><td style="${estiloTd}">Complejidad</td><td style="${estiloTd}; font-weight: 600;">${formatNumber(metricas.shape_complexity, 2)}</td><td style="${estiloTd}; font-size: 12px;">Complejidad de la forma</td></tr>
      </tbody>
    </table>
  `;
  
  // 7. PERFORACIONES
  if (obj.perforaciones && obj.perforaciones.length > 0) {
    html += `
      <h3 style="color: #495057; margin: 20px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #0066cc; font-size: 16px;">
        PERFORACIONES (${obj.perforaciones.length})
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}">ID</th>
            <th style="${estiloTh}">Área (mm²)</th>
            <th style="${estiloTh}">Perímetro (mm)</th>
            <th style="${estiloTh}">Circularidad</th>
            <th style="${estiloTh}">Diám. Máx (mm)</th>
            <th style="${estiloTh}">Diám. Mín (mm)</th>
          </tr>
        </thead>
        <tbody>
          ${obj.perforaciones.map((p, i) => `
            <tr style="${i % 2 === 0 ? 'background: #f8f9fa;' : ''}">
              <td style="${estiloTd}; font-weight: 600;">${p.id || i + 1}</td>
              <td style="${estiloTd}">${formatNumber(p.area || p.metricas?.area, 2)}</td>
              <td style="${estiloTd}">${formatNumber(p.perimetro || p.metricas?.perimeter, 2)}</td>
              <td style="${estiloTd}">${formatNumber(p.metricas?.circularity, 3)}</td>
              <td style="${estiloTd}">${formatNumber(p.metricas?.max_diameter, 2)}</td>
              <td style="${estiloTd}">${formatNumber(p.metricas?.min_diameter, 2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
  
  // 8. HORADACIONES
  if (obj.horadaciones && obj.horadaciones.length > 0) {
    html += `
      <h3 style="color: #495057; margin: 20px 0 15px 0; padding-bottom: 8px; border-bottom: 3px solid #28a745; font-size: 16px;">
        HORADACIONES (${obj.horadaciones.length})
      </h3>
      <table style="${estiloTabla}">
        <thead>
          <tr>
            <th style="${estiloTh}">ID</th>
            <th style="${estiloTh}">Área (mm²)</th>
            <th style="${estiloTh}">Perímetro (mm)</th>
            <th style="${estiloTh}">Circularidad</th>
            <th style="${estiloTh}">Diám. Máx (mm)</th>
            <th style="${estiloTh}">Diám. Mín (mm)</th>
          </tr>
        </thead>
        <tbody>
          ${obj.horadaciones.map((h, i) => `
            <tr style="${i % 2 === 0 ? 'background: #f8f9fa;' : ''}">
              <td style="${estiloTd}; font-weight: 600;">${h.id || i + 1}</td>
              <td style="${estiloTd}">${formatNumber(h.area || h.metricas?.area, 2)}</td>
              <td style="${estiloTd}">${formatNumber(h.perimetro || h.metricas?.perimeter, 2)}</td>
              <td style="${estiloTd}">${formatNumber(h.metricas?.circularity, 3)}</td>
              <td style="${estiloTd}">${formatNumber(h.metricas?.max_diameter, 2)}</td>
              <td style="${estiloTd}">${formatNumber(h.metricas?.min_diameter, 2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
  
  html += '</div>';
  return html;
}

/**
 * Cerrar panel de colección
 */
function closeCollectionPanel() {
  document.getElementById('collectionPanel').classList.remove('active');
  currentCollection = null;
  filteredObjects = [];
  
  // Resetear estados UI para siguiente apertura
  const loadingState = document.getElementById('collectionLoadingState');
  if (loadingState) loadingState.style.display = 'none';
  const emptyState = document.getElementById('collectionEmptyState');
  if (emptyState) emptyState.style.display = 'none';
  const errorState = document.getElementById('collectionErrorState');
  if (errorState) errorState.style.display = 'none';
  const table = document.querySelector('.collection-table');
  if (table) table.style.display = 'table';
  const tableBody = document.getElementById('collectionTableBody');
  if (tableBody) tableBody.innerHTML = '';
}

/**
 * Cerrar visualizador de análisis
 */
function closeAnalysisViewer() {
  document.getElementById('analysisViewerOverlay').classList.remove('active');
  // Limpiar flags de edición para que no afecten análisis futuros
  window.currentAnalysisPath = null;
  window.currentAnalysisData = null;
}

/**
 * 📥 Descargar CSV desde el visualizador de análisis guardado
 * Lee directamente metricas.csv del disco (ya fue guardado con el análisis)
 */
async function exportarCSVDesdeViewer() {
  if (!window.currentAnalysisPath) {
    toast.error('No hay análisis cargado');
    return;
  }
  const csvPath = `${window.currentAnalysisPath}/metricas.csv`;
  toast.info('Preparando descarga CSV...');
  try {
    const result = await window.electronAPI.readFile(csvPath);
    if (!result.success) {
      toast.error('No se encontró el archivo CSV del análisis');
      return;
    }
    const nombreObjeto = (window.currentAnalysisData?.nombreObjeto || 'analisis').replace(/[^a-z0-9]/gi, '_');
    const _idArqCsv = window.currentAnalysisData?.id?.replace(/[^a-zA-Z0-9_-]/g, '_') || nombreObjeto;
    const filename = `${_idArqCsv}_metricas`;
    if (window.electronAPI?.saveFileWithDialog) {
      const saveResult = await window.electronAPI.saveFileWithDialog(filename, result.content, 'csv');
      if (saveResult.success) {
        toast.success('CSV guardado correctamente');
      } else if (saveResult.message !== 'Guardado cancelado por el usuario') {
        toast.error(saveResult.message || 'Error al guardar CSV');
      }
    } else {
      // Fallback: descarga directa
      const blob = new Blob([result.content], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename + '.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('CSV descargado correctamente');
    }
  } catch (error) {
    console.error('Error exportando CSV desde viewer:', error);
    toast.error(`Error al exportar CSV: ${error.message}`);
  }
}

/**
 * 📄 Exportar PDF desde el visualizador de análisis guardado
 * Abre el análisis en el panel morfológico y luego dispara la exportación PDF
 */
async function exportarPDFDesdeViewer() {
  if (!window.currentAnalysisData || !window.currentAnalysisPath) {
    toast.error('No hay análisis cargado');
    return;
  }
  toast.info('Preparando exportación PDF... esto puede tardar unos segundos.');
  try {
    // Reconstruir el análisis en el panel morfológico (cierra el viewer y abre el panel)
    await abrirAnalisisMorfologicoDesdeGuardado();
    // Esperar a que el panel se renderice completamente antes de exportar
    await new Promise(resolve => setTimeout(resolve, 800));
    if (typeof exportarPDFIntegralCaraActiva === 'function') {
      await exportarPDFIntegralCaraActiva();
    } else {
      toast.error('Función de exportación PDF no disponible');
    }
  } catch (error) {
    console.error('Error exportando PDF desde viewer:', error);
    toast.error(`Error al exportar PDF: ${error.message}`);
  }
}

/**
 * 📐 Exportar geometría del análisis morfológico ACTIVO como SVG vectorial
 * Funciona desde el panel de análisis (monofacial/bifacial), incluyendo P/H
 */
async function exportarSVGMorfologicoActual() {
  const _cao = window.currentAnalyzedObject;
  if (!_cao || !_cao.obj) {
    toast.error('No hay análisis morfológico activo para exportar como SVG');
    return;
  }

  const obj = _cao.obj;
  const m = obj.metricas || {};

  // Los datos geométricos viven directamente en obj.metricas y obj.*
  const contornoPuntos = m._contour_data?.points || [];
  const convexHullPuntos = obj.convexHull || [];

  if (!contornoPuntos.length && !convexHullPuntos.length) {
    toast.warning('Sin datos geométricos disponibles. Asegúrate de haber ejecutado el análisis morfológico completo.');
    return;
  }

  // Construir geometryData compatible con exportGeometryToSVG desde propiedades de obj
  const geometryData = {
    contornoReal: {
      puntos: contornoPuntos,
      tipo: 'contorno_original',
      color: '#00ff00',
      grosor: 2,
      cerrado: true
    },
    convexHull: {
      puntos: convexHullPuntos,
      tipo: 'convex_hull',
      color: '#ffa500',
      grosor: 1.5,
      punteado: [8, 4],
      cerrado: true
    },
    boundingBox: {
      minX: obj.minX || 0,
      minY: obj.minY || 0,
      maxX: obj.maxX || 0,
      maxY: obj.maxY || 0,
      width: obj.width || 0,
      height: obj.height || 0
    },
    centroides: {
      centroideHull: {
        coordenadas: m._contour_data?.metrics?.centroid_hull || m.centroid || [0, 0],
        color: '#ff6600',
        radio: 5
      },
      centroideReal: {
        coordenadas: m._contour_data?.metrics?.centroid_real || m.centroid || [0, 0],
        color: '#ffff00',
        radio: 3
      }
    },
    ejes: {
      ejeMayor: {
        p1: m.eje_mayor_p1_recortado || null,
        p2: m.eje_mayor_p2_recortado || null,
        color: '#ff0000',
        grosor: 2.5,
        punteado: [10, 5]
      },
      ejeMenor: {
        p1: m.eje_menor_p1_recortado || null,
        p2: m.eje_menor_p2_recortado || null,
        color: '#00ff00',
        grosor: 2.5,
        punteado: [10, 5]
      }
    },
    radios: {
      radioMaximo: {
        puntoExtremo: m.punto_radio_maximo || null,
        color: '#00bfff',
        grosor: 2.5,
        punteado: [5, 3]
      },
      radioMinimo: {
        puntoExtremo: m.punto_radio_minimo || null,
        color: '#ff1493',
        grosor: 2.5,
        punteado: [5, 3]
      }
    },
    perforaciones: (obj.perforaciones || []).map((p, idx) => {
      const _cp = (m.centroid && p.puntos?.length) ? calcularCentroidePoligono(p.puntos) : null;
      return {
        id: p.id || idx + 1,
        puntos: p.puntos || [],
        // calcularCentroidePoligono devuelve {x,y}; el SVG necesita [x,y]
        centroide: _cp ? [_cp.x, _cp.y] : (Array.isArray(p.centroide) ? p.centroide : null),
        color: '#0066cc',
        grosor: 2,
        cerrado: true
      };
    }),
    horadaciones: (obj.horadaciones || []).map((h, idx) => {
      const _ch = h.puntos?.length ? calcularCentroidePoligono(h.puntos) : null;
      return {
        id: h.id || idx + 1,
        puntos: h.puntos || [],
        centroide: _ch ? [_ch.x, _ch.y] : (Array.isArray(h.centroide) ? h.centroide : null),
        color: '#28a745',
        grosor: 2,
        cerrado: true
      };
    }),
    escala: (() => {
      // Derivar factor desde las métricas ya calculadas del objeto (fuente más confiable)
      // Si eje_mayor tiene valores en mm y en px, el cociente es el factor exacto usado
      const _mm = obj.metricas?.eje_mayor_real_longitud || 0;
      const _px = obj.metricas?.eje_mayor_real_longitud_px || 0;
      const _factorMetricas = (_mm > 0 && _px > 0) ? _mm / _px : null;
      // Fallback: variable `scale` viva del closure (getter expuesto en window)
      const _factorScale = window.currentScale || null;
      const _factor = _factorMetricas || _factorScale || 1;
      console.log(`📏 Factor SVG: ${_factor} mm/px (fuente: ${_factorMetricas ? 'métricas obj' : _factorScale ? 'window.currentScale' : 'fallback=1'})`);
      return { factorConversion: _factor, factor: _factor, unidades: obj.unidad || 'mm' };
    })()
  };

  // Construir analysisData para metadatos SVG
  const analysisData = {
    nombreObjeto: obj.nombre || obj.id || 'Objeto',
    modo: obj.tipo || 'monofacial',
    cara: obj.cara || null
  };

  // Preservar estado del visor si estuviera activo
  const prevGeometry = window.currentGeometryData;
  const prevAnalysis = window.currentAnalysisData;

  window.currentGeometryData = geometryData;
  window.currentAnalysisData = analysisData;

  try {
    await exportGeometryToSVG();
  } finally {
    window.currentGeometryData = prevGeometry;
    window.currentAnalysisData = prevAnalysis;
  }
}

/**
 * 🆕 Abrir análisis morfológico desde datos guardados
 * Reconstruye el análisis completo en el panel morfológico principal
 */
async function abrirAnalisisMorfologicoDesdeGuardado() {
  if (!window.currentAnalysisData || !window.currentAnalysisPath) {
    toast.error('No hay análisis cargado');
    return;
  }
  
  const analysis = window.currentAnalysisData;
  
  console.log('📦 Abriendo análisis morfológico desde guardado:', analysis.nombreObjeto);
  
  try {
    // 1. Crear un objeto completo compatible con la estructura esperada
    const objReconstruido = {
      id: analysis.id || `recuperado_${Date.now()}`,
      nombreObjeto: analysis.nombreObjeto,
      cara: analysis.cara,
      numeroObjeto: analysis.numeroObjeto,
      tipo: analysis.tipo || (analysis.cara && (analysis.cara === 'A' || analysis.cara === 'B') ? 'bifacial' : 'monofacial'),
      escala: analysis.escala || analysis.metricas?.escala || analysis.metricas?.scale || null,
      unidad: analysis.unidad || analysis.metricas?.unidad || analysis.metricas?.unit || 'mm',
      proyecto: analysis.proyecto || projectManager?.activeProject || null,
      fecha: analysis.fecha || analysis.timestamp || analysis.createdAt || new Date().toISOString(),
      imagenRecortada: analysis.imagenes?.objetoRecortado || null,
      imagenes: {
        recortada: analysis.imagenes?.objetoRecortado || null,
        morfologica: analysis.imagenes?.morfologica || null,
      },
      
      // Dimensiones del bounding box
      width: analysis.geometria?.boundingBox?.width || 0,
      height: analysis.geometria?.boundingBox?.height || 0,
      minX: analysis.geometria?.boundingBox?.minX || 0,
      maxX: analysis.geometria?.boundingBox?.maxX || 0,
      minY: analysis.geometria?.boundingBox?.minY || 0,
      maxY: analysis.geometria?.boundingBox?.maxY || 0,
      area: analysis.metricas?.area || 0,
      
      // Contorno real
      has_real_contour: true,
      contour_points: analysis.geometria?.contornoReal?.puntos || [],
      
      // Métricas completas
      metricas: analysis.metricas,
      
      // 🔧 Perforaciones y horadaciones con estructura completa
      // IMPORTANTE: Preservar TODAS las métricas guardadas en disco para que la tabla comparativa funcione
      perforaciones: (analysis.perforaciones || []).map(p => {
        // Si tiene objeto metricas completo, usarlo directamente
        const metricasCompletas = p.metricas || {};
        
        // 🔄 MIGRACIÓN: proyectos guardados antes de v1.x no tienen shape_factor/Feret.
        // Si los puntos del polígono están guardados, recalculamos al vuelo.
        if (metricasCompletas.shape_factor == null) {
          const ptsMig   = p.puntos || p.contorno || p.contour_points || [];
          const scaleMig = parseFloat(analysis.escala || analysis.metricas?.scale || 1) || 1;
          if (ptsMig.length >= 3 && typeof calcularMetricasPerforacion === 'function') {
            try {
              const mig = calcularMetricasPerforacion(ptsMig, p.tipo || 'perforacion', p.id, scaleMig);
              ['shape_factor','rectangularity','elongation',
               'feret_max','feret_min','feret_ratio',
               'feret_angulo_max','feret_angulo_min'].forEach(k => {
                if (mig[k] != null) metricasCompletas[k] = mig[k];
              });
            } catch(e) { /* no bloquear apertura si falla la migración */ }
          }
        }
        
        // 🔄 MIGRACIÓN: Ruta B guarda area_real (px²) pero no area (mm²).
        // Si area no es un número válido (p.ej. es el objeto rect de selección), recalcular.
        if (typeof metricasCompletas.area !== 'number' || metricasCompletas.area <= 0) {
          const scaleMig = parseFloat(analysis.escala || analysis.metricas?.scale || 1) || 1;
          if (typeof metricasCompletas.area_real === 'number' && metricasCompletas.area_real > 0) {
            metricasCompletas.area     = parseFloat((metricasCompletas.area_real * scaleMig * scaleMig).toFixed(4));
            if (!(typeof metricasCompletas.perimeter === 'number' && metricasCompletas.perimeter > 0)) {
              metricasCompletas.perimeter = parseFloat(((metricasCompletas.perimeter_real || 0) * scaleMig).toFixed(4));
              metricasCompletas.perimetro = metricasCompletas.perimeter;
            }
          }
        }
        
        return {
          id: p.id,
          contorno: p.contorno || p.puntos || p.contour_points || [],
          area: (typeof p.area === 'number' ? p.area : null) || metricasCompletas.area || 0,
          perimetro: p.perimetro || metricasCompletas.perimeter || 0,
          circularidad: p.circularidad || metricasCompletas.circularity || 0,
          centroide: p.centroide || metricasCompletas.centroid || [0, 0],
          distanciaAlCentro: p.distanciaAlCentro || 0,
          
          // ✅ PRESERVAR OBJETO METRICAS COMPLETO (con todas las propiedades)
          metricas: {
            ...metricasCompletas,  // Todas las métricas guardadas
            // Asegurar propiedades básicas (nunca usar p.area si es objeto rect)
            area: metricasCompletas.area || (typeof p.area === 'number' ? p.area : 0),
            perimeter: metricasCompletas.perimeter || p.perimetro || 0,
            circularity: metricasCompletas.circularity || p.circularidad || 0,
            centroid: metricasCompletas.centroid || p.centroide || [0, 0],
            centroid_x: metricasCompletas.centroid_x || (p.centroide?.[0]) || 0,
            centroid_y: metricasCompletas.centroid_y || (p.centroide?.[1]) || 0,
            width: metricasCompletas.width || 0,
            height: metricasCompletas.height || 0,
            forma_detectada: metricasCompletas.forma_detectada || 'Circular',
            // Métricas radiales
            radio_max: metricasCompletas.radio_max || 0,
            radio_min: metricasCompletas.radio_min || 0,
            radio_mean: metricasCompletas.radio_mean || 0,
            radii_ratio: metricasCompletas.radii_ratio || 0
          },
          
          minX: p.minX || 0,
          maxX: p.maxX || 0,
          minY: p.minY || 0,
          maxY: p.maxY || 0
        };
      }),
      
      horadaciones: (analysis.horadaciones || []).map(h => {
        // Si tiene objeto metricas completo, usarlo directamente
        const metricasCompletas = h.metricas || {};
        
        // 🔄 MIGRACIÓN: proyectos guardados antes de v1.x no tienen shape_factor/Feret.
        // Si los puntos del polígono están guardados, recalculamos al vuelo.
        if (metricasCompletas.shape_factor == null) {
          const ptsMig   = h.puntos || h.contorno || h.contour_points || [];
          const scaleMig = parseFloat(analysis.escala || analysis.metricas?.scale || 1) || 1;
          if (ptsMig.length >= 3 && typeof calcularMetricasPerforacion === 'function') {
            try {
              const mig = calcularMetricasPerforacion(ptsMig, h.tipo || 'horadacion', h.id, scaleMig);
              ['shape_factor','rectangularity','elongation',
               'feret_max','feret_min','feret_ratio',
               'feret_angulo_max','feret_angulo_min'].forEach(k => {
                if (mig[k] != null) metricasCompletas[k] = mig[k];
              });
            } catch(e) { /* no bloquear apertura si falla la migración */ }
          }
        }
        
        // 🔄 MIGRACIÓN: Ruta B guarda area_real (px²) pero no area (mm²).
        // Si area no es un número válido (p.ej. es el objeto rect de selección), recalcular.
        if (typeof metricasCompletas.area !== 'number' || metricasCompletas.area <= 0) {
          const scaleMig = parseFloat(analysis.escala || analysis.metricas?.scale || 1) || 1;
          if (typeof metricasCompletas.area_real === 'number' && metricasCompletas.area_real > 0) {
            metricasCompletas.area     = parseFloat((metricasCompletas.area_real * scaleMig * scaleMig).toFixed(4));
            if (!(typeof metricasCompletas.perimeter === 'number' && metricasCompletas.perimeter > 0)) {
              metricasCompletas.perimeter = parseFloat(((metricasCompletas.perimeter_real || 0) * scaleMig).toFixed(4));
              metricasCompletas.perimetro = metricasCompletas.perimeter;
            }
          }
        }
        
        return {
          id: h.id,
          contorno: h.contorno || h.puntos || h.contour_points || [],
          area: (typeof h.area === 'number' ? h.area : null) || metricasCompletas.area || 0,
          perimetro: h.perimetro || metricasCompletas.perimeter || 0,
          circularidad: h.circularidad || metricasCompletas.circularity || 0,
          centroide: h.centroide || metricasCompletas.centroid || [0, 0],
          distanciaAlCentro: h.distanciaAlCentro || 0,
          
          // ✅ PRESERVAR OBJETO METRICAS COMPLETO (con todas las propiedades)
          metricas: {
            ...metricasCompletas,  // Todas las métricas guardadas
            // Asegurar propiedades básicas (nunca usar h.area si es objeto rect)
            area: metricasCompletas.area || (typeof h.area === 'number' ? h.area : 0),
            perimeter: metricasCompletas.perimeter || h.perimetro || 0,
            circularity: metricasCompletas.circularity || h.circularidad || 0,
            centroid: metricasCompletas.centroid || h.centroide || [0, 0],
            centroid_x: metricasCompletas.centroid_x || (h.centroide?.[0]) || 0,
            centroid_y: metricasCompletas.centroid_y || (h.centroide?.[1]) || 0,
            width: metricasCompletas.width || 0,
            height: metricasCompletas.height || 0,
            forma_detectada: metricasCompletas.forma_detectada || 'Circular',
            // Métricas radiales
            radio_max: metricasCompletas.radio_max || 0,
            radio_min: metricasCompletas.radio_min || 0,
            radio_mean: metricasCompletas.radio_mean || 0,
            radii_ratio: metricasCompletas.radii_ratio || 0
          },
          
          minX: h.minX || 0,
          maxX: h.maxX || 0,
          minY: h.minY || 0,
          maxY: h.maxY || 0
        };
      }),
      
      // Clasificación
      clasificacionForma: analysis.metricas?.clasificacionForma || 'sin_clasificar',
      
      // Convex Hull
      convexHull: analysis.geometria?.convexHull || null,
      
      // Elementos geométricos
      ejes: analysis.geometria?.ejes || {},
      centroides: analysis.geometria?.centroides || {},
      radios: analysis.geometria?.radios || {},
      
      // BoundingBox
      boundingBox: analysis.geometria?.boundingBox || {},

      // 🖼️ Canvas guardados — inyectados desde imagenes.json para que el PDF
      // los encuentre en obj.canvasImgenes sin acceder al DOM.
      canvasImgenes: analysis.canvasImgenes || {}
    };
    
    console.log(`📊 Objeto reconstruido:`, {
      id: objReconstruido.id,
      perforaciones: objReconstruido.perforaciones.length,
      horadaciones: objReconstruido.horadaciones.length,
      metricas: !!objReconstruido.metricas
    });
    
    // 🔍 DIAGNÓSTICO: Verificar que las métricas de P/H estén completas
    if (objReconstruido.perforaciones.length > 0) {
      const p0 = objReconstruido.perforaciones[0];
      console.log(`🔍 Diagnóstico Perforación P${p0.id}:`, {
        tieneMetricas: !!p0.metricas,
        propiedadesMetricas: Object.keys(p0.metricas || {}).length,
        ejemploMetricas: {
          area: p0.metricas?.area,
          perimeter: p0.metricas?.perimeter,
          circularity: p0.metricas?.circularity,
          forma_detectada: p0.metricas?.forma_detectada,
          radio_max: p0.metricas?.radio_max,
          centroid_x: p0.metricas?.centroid_x
        }
      });
    }
    
    if (objReconstruido.horadaciones.length > 0) {
      const h0 = objReconstruido.horadaciones[0];
      console.log(`🔍 Diagnóstico Horadación H${h0.id}:`, {
        tieneMetricas: !!h0.metricas,
        propiedadesMetricas: Object.keys(h0.metricas || {}).length,
        ejemploMetricas: {
          area: h0.metricas?.area,
          perimeter: h0.metricas?.perimeter,
          circularity: h0.metricas?.circularity,
          forma_detectada: h0.metricas?.forma_detectada,
          radio_max: h0.metricas?.radio_max,
          centroid_x: h0.metricas?.centroid_x
        }
      });
    }
    
    // 2. Guardar en caché con canvas desde imágenes guardadas
    console.log('💾 Preparando caché con imágenes guardadas...');
    
    // Cargar imágenes y crear canvas data
    const canvasData = await cargarCanvasDataDesdeImagenes(analysis);
    
    // 🔧 CRÍTICO: Incluir P/H en las métricas del caché (igual que guardarAnalisisEnCache)
    const metricasConPH = {
      ...analysis.metricas,
      perforaciones: objReconstruido.perforaciones, // P/H ya reconstruidas con métricas completas
      horadaciones: objReconstruido.horadaciones
    };
    
    objReconstruido.analisisCached = {
      metricas: metricasConPH, // Incluye P/H con todas sus métricas
      canvasData: canvasData,
      timestamp: analysis.timestamp,
      escalaUsada: analysis.escala || scale,
      escalaCorregida: false
    };
    
    console.log('✅ Caché creado:', {
      canvas: Object.keys(canvasData).length,
      perforaciones: metricasConPH.perforaciones.length,
      horadaciones: metricasConPH.horadaciones.length
    });
    
    // 3. FLUJO DIRECTO: Mostrar análisis sin depender de array objects
    console.log('🎯 Mostrando análisis morfológico directamente desde datos guardados...');
    
    // 🖼️ Cargar imagen del objeto recortado desde disco
    let imagenObjeto = null;
    if (analysis.imagenes?.objetoRecortado) {
      console.log('📸 Cargando imagen del objeto recortado desde disco...');
      try {
        const imgResult = await window.electronAPI.readFile(analysis.imagenes.objetoRecortado);
        if (imgResult.success) {
          // Crear elemento Image desde base64
          imagenObjeto = new Image();
          await new Promise((resolve, reject) => {
            imagenObjeto.onload = () => {
              console.log('✅ Imagen cargada:', {
                width: imagenObjeto.width,
                height: imagenObjeto.height,
                src: imgResult.content.substring(0, 50) + '...'
              });
              resolve();
            };
            imagenObjeto.onerror = (e) => {
              console.error('❌ Error cargando imagen:', e);
              reject(e);
            };
            imagenObjeto.src = imgResult.content;
          });
          
          // 🔧 CRÍTICO: Crear una imagen "sintética" que simule la estructura de image global
          // pero solo contenga el objeto recortado
          const imagenSintetica = new Image();
          imagenSintetica.width = objReconstruido.width;
          imagenSintetica.height = objReconstruido.height;
          imagenSintetica.src = imgResult.content;
          
          // Guardar referencia temporal en window para que mostrarAnalisisMorfologico pueda acceder
          window._tempImagenObjetoRecortado = imagenObjeto;
          
          console.log('✅ Imagen del objeto preparada');
        }
      } catch (error) {
        console.warn('⚠️ No se pudo cargar imagen del objeto:', error.message);
      }
    }
    
    // Cerrar modales primero
    closeAnalysisViewer();
    closeCollectionPanel();
    
    // Esperar a que el DOM se actualice antes de mostrar el análisis
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          // Mostrar análisis usando función global
          if (typeof window.mostrarAnalisisMorfologico === 'function') {
            // Pasar la imagen cargada desde disco
            window.mostrarAnalisisMorfologico(objReconstruido, metricasConPH, window._tempImagenObjetoRecortado);
            console.log('Análisis morfológico mostrado con imagen recortada');
          } else {
            throw new Error('Función mostrarAnalisisMorfologico no disponible en window');
          }
          
          // Restaurar canvas desde caché
          if (canvasData && Object.keys(canvasData).length > 0) {
            console.log('Restaurando canvas desde imágenes guardadas...');
            if (typeof window.restaurarCanvasDesdeCache === 'function') {
              window.restaurarCanvasDesdeCache(canvasData);
              console.log('Canvas restaurados');
            }
          }
          
          // Scroll al contenedor de análisis morfológico
          const morphContainer = document.getElementById('morphologicalAnalysisContainer');
          if (morphContainer) {
            morphContainer.style.display = 'block';
            setTimeout(() => {
              morphContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 300);
          }
          
          console.log(`Análisis morfológico recuperado y mostrado: ${analysis.nombreObjeto}`);
          resolve();
          
        } catch (error) {
          console.error('Error mostrando análisis:', error);
          toast.error(`Error al mostrar análisis: ${error.message}`);
          reject(error);
        }
      }, 100);
    });
    
    toast.success(`Análisis "${analysis.nombreObjeto}" cargado exitosamente`);
    
  } catch (error) {
    console.error('❌ Error abriendo análisis morfológico:', error);
    toast.error(`Error al abrir análisis: ${error.message}`);
  }
}

/**
 * 🆕 Cargar canvas data desde imágenes guardadas en disco
 */
async function cargarCanvasDataDesdeImagenes(analysis) {
  console.log('🖼️ Cargando canvas data desde imágenes...');
  
  const canvasData = {};
  const imagenes = analysis.imagenes || {};
  
  // Canvas morfológico (análisis completo)
  if (imagenes.analisisCompleto) {
    const result = await window.electronAPI.readFile(imagenes.analisisCompleto);
    if (result.success) {
      canvasData.morphological = result.content;
      console.log('  ✓ Canvas morfológico cargado');
    }
  }
  
  // Canvas idealizado (convex hull)
  if (imagenes.convexHull) {
    const result = await window.electronAPI.readFile(imagenes.convexHull);
    if (result.success) {
      canvasData.idealized = result.content;
      console.log('  ✓ Canvas idealizado cargado');
    }
  }
  
  // Canvas esquemático (ejes)
  if (imagenes.ejesPrincipales) {
    const result = await window.electronAPI.readFile(imagenes.ejesPrincipales);
    if (result.success) {
      canvasData.schematic = result.content;
      console.log('  ✓ Canvas esquemático cargado');
    }
  }
  
  return canvasData;
}

/**
 * 🆕 ABRIR CARPETA DE ANÁLISIS DESDE EL SISTEMA DE ARCHIVOS
 * Permite seleccionar una carpeta que contenga un análisis o proyecto
 * y abrirlo independientemente de la colección actual
 */
async function abrirCarpetaAnalisis() {
  console.log('📂 Iniciando apertura de carpeta de análisis...');
  
  try {
    // 1. Seleccionar carpeta usando el dialog de Electron
    const folderPath = await window.electronAPI.selectFolder();
    
    if (!folderPath) {
      console.log('❌ Usuario canceló la selección de carpeta');
      return;
    }
    
    console.log(`📁 Carpeta seleccionada: ${folderPath}`);
    toast.info('Analizando carpeta seleccionada...');
    
    // 2. 🆕 PRIMERO: Verificar si existe algún archivo .mao
    const dirResult = await window.electronAPI.listDirectory(folderPath);
    
    if (dirResult.success) {
      const maoFiles = dirResult.items.filter(item => 
        item.isFile && item.name.endsWith('.mao')
      );
      
      if (maoFiles.length > 0) {
        console.log(`✨ Detectado archivo ${maoFiles[0].name} - Cargando proyecto completo...`);
        await abrirProyectoCompleto(folderPath);
        return;
      }
    }
    
    // 3. Si no hay archivo .mao, buscar análisis individuales
    console.log('ℹ️ No se encontró archivo .mao, buscando análisis individuales...');
    toast.info('Escaneando análisis individuales...');
    
    const analysisFound = await window.electronAPI.scanForAnalysis(folderPath, 3);
    
    if (!analysisFound || analysisFound.length === 0) {
      console.warn('⚠️ No se encontraron análisis válidos en la carpeta');
      toast.warning('No se encontraron análisis morfológicos válidos en esta carpeta');
      return;
    }
    
    console.log(`✅ ${analysisFound.length} análisis encontrado(s)`);
    
    // 4. Si hay múltiples análisis, mostrar selector
    if (analysisFound.length > 1) {
      mostrarSelectorAnalisis(analysisFound);
    } else {
      // 5. Si hay solo uno, cargarlo directamente
      await cargarAnalisisDesdeRuta(analysisFound[0].path);
    }
    
  } catch (error) {
    console.error('❌ Error al abrir carpeta de análisis:', error);
    toast.error(`Error al abrir carpeta: ${error.message}`);
  }
}

/**
 * 🆕 ABRIR PROYECTO COMPLETO desde archivo proyecto.mao
 * Carga todos los análisis del proyecto y muestra el modal de colección
 */
async function abrirProyectoCompleto(folderPath) {
  try {
    console.log('📦 Abriendo proyecto completo desde:', folderPath);
    toast.info('Cargando proyecto...');
    
    // 1. Cargar archivo proyecto.mao
    const proyectoResult = await cargarProyectoDesdeArchivo(folderPath);
    
    if (!proyectoResult.success) {
      throw new Error(proyectoResult.error);
    }
    
    const proyectoMAO = proyectoResult.proyecto;
    
    console.log(`✅ Proyecto cargado: ${proyectoMAO.metadata.nombre}`);
    console.log(`   - Total análisis: ${proyectoMAO.estadisticas.totalAnalisis}`);
    
    // 🆕 REGISTRAR PROYECTO EN PROJECTMANAGER Y ACTIVARLO
    let registeredProject = projectManager.projects.find(p => p.folderPath === folderPath);
    
    if (!registeredProject) {
      console.log('📝 Registrando proyecto en projectManager...');
      registeredProject = {
        id: proyectoMAO.metadata.id,
        name: proyectoMAO.metadata.nombre,
        description: proyectoMAO.metadata.descripcion,
        commonTrait: proyectoMAO.metadata.rasgoComun,
        folderPath: folderPath,
        sitio: proyectoMAO.metadata.sitio || '',
        investigadorResponsable: proyectoMAO.metadata.investigadorResponsable || '',
        institucionResponsable: proyectoMAO.metadata.institucionResponsable || '',
        createdAt: proyectoMAO.metadata.creado,
        updatedAt: proyectoMAO.metadata.ultimaActualizacion,
        analyses: []
      };
      
      projectManager.projects.push(registeredProject);
      projectManager.save();
      console.log('✅ Proyecto registrado en projectManager');
    } else {
      console.log('🔄 Actualizando proyecto existente en projectManager...');
      registeredProject.name = proyectoMAO.metadata.nombre;
      registeredProject.description = proyectoMAO.metadata.descripcion;
      registeredProject.updatedAt = proyectoMAO.metadata.ultimaActualizacion;
      projectManager.save();
    }
    
    // Establecer como proyecto activo
    projectManager.setActiveProject(registeredProject.id);
    console.log(`🎯 Proyecto "${registeredProject.name}" establecido como activo`);
    
    // 2. Abrir panel y mostrar estado de carga
    const collectionPanel = document.getElementById('collectionPanel');
    if (!collectionPanel) {
      console.error('❌ No se encontró el panel de colección');
      toast.error('Error: Panel de colección no disponible');
      return;
    }
    
    collectionPanel.classList.add('active');
    document.getElementById('collectionPanelTitle').textContent = proyectoMAO.metadata.nombre;
    showCollectionLoadingState();
    
    // Resetear filtros y búsqueda
    const searchInput = document.getElementById('collectionSearchInput');
    if (searchInput) searchInput.value = '';
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    const modoFilter = document.getElementById('collectionModoFilter');
    if (modoFilter) modoFilter.value = 'all';
    const sortByEl = document.getElementById('collectionSortBy');
    if (sortByEl) sortByEl.value = 'timestamp-desc';
    
    // 3. Cargar índice de colección (con fallback a rebuild)
    let collectionObjetos = [];
    
    const indexPath = `${folderPath}/collection_index.json`;
    const indexResult = await window.electronAPI.readFile(indexPath);
    
    if (indexResult.success) {
      try {
        const collection = JSON.parse(indexResult.content);
        collectionObjetos = collection.objetos || [];
        console.log(`📚 Índice cargado: ${collectionObjetos.length} objetos`);
      } catch (parseErr) {
        console.error('❌ Error parseando collection_index.json:', parseErr.message);
      }
    } else {
      console.warn('⚠️ collection_index.json no encontrado');
    }
    
    // Si el índice está vacío o no existe, intentar reconstruir
    if (collectionObjetos.length === 0) {
      console.log('🔨 Reconstruyendo índice desde carpetas...');
      toast.info('Reconstruyendo índice de colección...');
      const rebuilt = await projectManager.rebuildCollectionIndex(registeredProject);
      if (rebuilt && rebuilt.objetos) {
        collectionObjetos = rebuilt.objetos;
        console.log(`✅ Índice reconstruido: ${collectionObjetos.length} objetos`);
      }
    }
    
    // Verificar que la cantidad coincida con las carpetas reales
    const listCheck = await window.electronAPI.listDirectory(folderPath);
    if (listCheck.success) {
      const _SYS = new Set(['imagenes', 'img', 'images', 'thumbnails']);
      const realFolders = listCheck.items.filter(i =>
        i.isDirectory && !i.name.startsWith('.') && !_SYS.has(i.name.toLowerCase())
      ).length;
      if (realFolders > collectionObjetos.length) {
        console.warn(`⚠️ Índice desactualizado: ${collectionObjetos.length} vs ${realFolders} carpetas — reconstruyendo`);
        const rebuilt = await projectManager.rebuildCollectionIndex(registeredProject);
        if (rebuilt && rebuilt.objetos) {
          collectionObjetos = rebuilt.objetos;
        }
      }
    }
    
    // 4. Construir estructura de colección para el modal
    const totalObj = collectionObjetos.length;
    
    window.currentCollection = {
      id: proyectoMAO.metadata.id,
      proyectoId: registeredProject.id,
      nombre: proyectoMAO.metadata.nombre,
      descripcion: proyectoMAO.metadata.descripcion,
      rasgoComun: proyectoMAO.metadata.rasgoComun,
      sitio: proyectoMAO.metadata.sitio || '',
      investigadorResponsable: proyectoMAO.metadata.investigadorResponsable || '',
      institucionResponsable: proyectoMAO.metadata.institucionResponsable || '',
      folderPath: folderPath,
      totalObjetos: totalObj,
      objetos: collectionObjetos,
      fechaCreacion: proyectoMAO.metadata.creado,
      ultimaActualizacion: proyectoMAO.metadata.ultimaActualizacion
    };
    
    // 5. Renderizar tabla
    const subtitle = `${totalObj} objeto${totalObj !== 1 ? 's' : ''} • Última actualización: ${new Date(proyectoMAO.metadata.ultimaActualizacion).toLocaleString('es-ES')}`;
    document.getElementById('collectionPanelSubtitle').textContent = subtitle;
    
    currentCollection = window.currentCollection;
    filteredObjects = [...collectionObjetos];
    renderCollectionTable();
    hideCollectionLoadingState();
    
    console.log(`✅ Colección renderizada: ${totalObj} objetos`);
    
    // 6. Actualizar UI
    if (typeof updateActiveProjectIndicator === 'function') {
      updateActiveProjectIndicator();
    }
    if (typeof renderProjectsList === 'function') {
      renderProjectsList();
    }
    
    // Sincronizar conteo de analyses en localStorage con el índice real
    if (registeredProject.analyses.length !== totalObj) {
      console.log(`🔄 Sincronizando conteo: localStorage=${registeredProject.analyses.length} → disco=${totalObj}`);
      // Rebuild analyses refs from collection objects
      registeredProject.analyses = collectionObjetos.map(obj => ({
        id: obj.id,
        timestamp: obj.timestamp,
        nombreObjeto: obj.nombreObjeto,
        cara: obj.cara,
        modo: obj.modo,
        carpeta: obj.carpeta,
        rutaCompleta: obj.rutaCompleta || (registeredProject.folderPath && obj.carpeta ? `${registeredProject.folderPath}/${obj.carpeta}` : null)
      }));
      registeredProject.updatedAt = new Date().toISOString();
      projectManager.save();
      // Re-render projects list to show updated count
      if (typeof renderProjectsList === 'function') {
        renderProjectsList();
      }
    }
    
    toast.success(`Proyecto "${proyectoMAO.metadata.nombre}" activado: ${totalObj} análisis`);
    
  } catch (error) {
    console.error('❌ Error abriendo proyecto completo:', error);
    console.error('   Stack:', error.stack);
    showCollectionErrorState(error.message || 'Error al abrir proyecto');
    toast.error(`Error al abrir proyecto: ${error.message}`);
  }
}

/**
 * 🆕 MOSTRAR SELECTOR DE ANÁLISIS cuando hay múltiples
 * en la carpeta seleccionada
 */
function mostrarSelectorAnalisis(analysisArray) {
  console.log(`📋 Mostrando selector con ${analysisArray.length} análisis`);
  
  // Crear modal de selección
  const modalHTML = `
    <div id="selectorAnalisisModal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px;">
      <div style="background: white; border-radius: 12px; max-width: 800px; width: 100%; max-height: 80vh; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.3); display: flex; flex-direction: column;">
        
        <!-- Header -->
        <div style="padding: 20px 30px; background: linear-gradient(135deg, #4a5568 0%, #2d3748 100%); color: white; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <h2 style="margin: 0 0 5px 0; font-size: 20px; font-weight: 700;">Seleccionar Análisis</h2>
            <p style="margin: 0; font-size: 13px; opacity: 0.9;">Se encontraron ${analysisArray.length} análisis en la carpeta seleccionada</p>
          </div>
          <button onclick="cerrarSelectorAnalisis()" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; font-size: 20px; display: flex; align-items: center; justify-content: center; transition: all 0.3s;">
            
          </button>
        </div>
        
        <!-- Lista de análisis -->
        <div style="flex: 1; overflow-y: auto; padding: 20px 30px;">
          <div style="display: grid; gap: 12px;">
            ${analysisArray.map((analysis, index) => {
              const metadata = analysis.metadata || {};
              const nombreObjeto = metadata.nombreObjeto || 'Sin nombre';
              const fecha = metadata.fechaAnalisis ? new Date(metadata.fechaAnalisis).toLocaleDateString('es-ES') : 'Fecha desconocida';
              const forma = metadata.forma_detectada || 'N/A';
              const folderName = analysis.folderName || analysis.path.split('/').pop();
              
              return `
                <div onclick="seleccionarAnalisisDesdeRuta('${analysis.path.replace(/'/g, "\\'")}', ${index})" style="border: 2px solid #e9ecef; border-radius: 8px; padding: 15px; cursor: pointer; transition: all 0.3s; background: white;">
                  <div style="display: flex; align-items: start; gap: 15px;">
                    <div style="flex: 1;">
                      <div style="font-size: 15px; font-weight: 700; color: #212529; margin-bottom: 5px;">${nombreObjeto}</div>
                      <div style="font-size: 12px; color: #6c757d; margin-bottom: 8px;">
                        ${folderName}
                      </div>
                      <div style="display: flex; gap: 12px; flex-wrap: wrap; font-size: 11px;">
                        <span style="background: #e7f3ff; color: #0066cc; padding: 4px 8px; border-radius: 4px;">${fecha}</span>
                        <span style="background: #e8f5e9; color: #28a745; padding: 4px 8px; border-radius: 4px;">${forma}</span>
                      </div>
                    </div>
                    <div style="color: #4a5568; font-size: 24px;">→</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        
        <!-- Footer -->
        <div style="padding: 15px 30px; background: #f8f9fa; border-top: 1px solid #dee2e6; display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 12px; color: #6c757d;">
            Haz clic en un análisis para abrirlo
          </div>
          <button onclick="cerrarSelectorAnalisis()" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px;">
            Cancelar
          </button>
        </div>
        
      </div>
    </div>
  `;
  
  // Agregar modal al DOM
  const modalContainer = document.createElement('div');
  modalContainer.innerHTML = modalHTML;
  document.body.appendChild(modalContainer);
  
  // Guardar referencia global para acceso desde onclick
  window._currentAnalysisArray = analysisArray;
}

/**
 * 🆕 SELECCIONAR UN ANÁLISIS ESPECÍFICO del selector
 */
async function seleccionarAnalisisDesdeRuta(rutaAnalisis, index) {
  console.log(`✅ Análisis seleccionado [${index}]: ${rutaAnalisis}`);
  cerrarSelectorAnalisis();
  await cargarAnalisisDesdeRuta(rutaAnalisis);
}

/**
 * 🆕 CERRAR SELECTOR DE ANÁLISIS
 */
function cerrarSelectorAnalisis() {
  const modal = document.getElementById('selectorAnalisisModal');
  if (modal) {
    modal.parentElement.remove();
  }
  window._currentAnalysisArray = null;
}

/**
 * 🆕 CARGAR ANÁLISIS DESDE UNA RUTA ESPECÍFICA
 * Lee los archivos de la carpeta y reconstruye el análisis completo
 */
async function cargarAnalisisDesdeRuta(rutaAnalisis) {
  console.log(`📥 Cargando análisis desde: ${rutaAnalisis}`);
  
  try {
    toast.info('Cargando análisis morfológico...');
    
    // 1. Leer archivos principales
    const metadataPath = `${rutaAnalisis}/metadata.json`;
    const metricasPath = `${rutaAnalisis}/metricas.json`;
    const geometriaPath = `${rutaAnalisis}/geometria.json`;
    
    console.log('📄 Leyendo archivos...');
    
    const [metadataResult, metricasResult, geometriaResult] = await Promise.all([
      window.electronAPI.readFile(metadataPath),
      window.electronAPI.readFile(metricasPath),
      window.electronAPI.readFile(geometriaPath)
    ]);
    
    if (!metadataResult.success || !metricasResult.success || !geometriaResult.success) {
      throw new Error('No se pudieron leer todos los archivos necesarios');
    }
    
    const metadata = JSON.parse(metadataResult.content);
    const metricas = JSON.parse(metricasResult.content);
    const geometria = JSON.parse(geometriaResult.content);
    
    console.log('✅ Archivos leídos correctamente');

    // ── Enriquecimiento automático para objetos AIA con métricas incompletas ──
    // Detecta proyectos guardados ANTES del fix de inyectarObjetosDesdeIA (< 40 campos).
    // Llama silenciosamente a Python /metrics y persiste metricas.json actualizado en disco
    // para que el CSV exportado contenga todos los campos desde esta apertura en adelante.
    {
      const _om   = metricas.objeto || {};
      const _isAIA    = _om.analysis_method === 'MAO IA — Detección automática';
      const _isLegacy = Object.keys(_om).length < 40;
      const _pts      = geometria.contornoReal?.puntos || [];
      if (_isAIA && _isLegacy && _pts.length >= 3 &&
          window.PythonBridge && PythonBridge.isModuleActive('metrics')) {
        try {
          console.log('[AIA-enrich] métricas incompletas detectadas — actualizando desde Python...');
          toast.info('Actualizando métricas del análisis AIA...', { duration: 3000 });
          const _imgResult = await window.electronAPI.readFile(
            `${rutaAnalisis}/imagenes/objetoRecortado.png`
          );
          if (_imgResult.success) {
            const _scale = parseFloat(_om.scale_factor) || 1.0;
            const _pyRes = await PythonBridge.metrics.calculate(
              _imgResult.content,   // dataURL devuelta por readFile
              _pts,
              _scale
            );
            if (_pyRes?.metricas && Object.keys(_pyRes.metricas).length > 10) {
              // Propagar campos nuevos; cubrir tanto ausentes (undefined) como null explícito
              const _s = _scale > 0 ? _scale : null;
              for (const [_k, _v] of Object.entries(_pyRes.metricas)) {
                if (_om[_k] == null && _v != null)
                  _om[_k] = _v;
              }
              // Radios en mm (solo si siguen sin valor después de la propagación)
              if (_s) {
                if (_om.radio_maximo_px && _om.radio_maximo == null)
                  _om.radio_maximo = +(_om.radio_maximo_px * _s).toFixed(3);
                if (_om.radio_minimo_px && _om.radio_minimo == null)
                  _om.radio_minimo = +(_om.radio_minimo_px * _s).toFixed(3);
                if (_om.radio_medio_px  && _om.radio_medio  == null)
                  _om.radio_medio  = +(_om.radio_medio_px  * _s).toFixed(3);
              }
              metricas.objeto = _om;
              // Persistir metricas.json enriquecido en disco
              window.electronAPI.saveFile(
                metricasPath,
                JSON.stringify(metricas, null, 2)
              ).catch(_e => console.warn('[AIA-enrich] No se pudo escribir metricas.json:', _e.message));
              console.log(`[AIA-enrich] métricas actualizadas: ${Object.keys(_om).length} campos`);
              toast.success('Métricas AIA actualizadas correctamente');
            }
          }
        } catch (_enrichErr) {
          // No bloquear la apertura del análisis si el enriquecimiento falla
          console.warn('[AIA-enrich] No se pudieron actualizar las métricas AIA:', _enrichErr.message);
        }
      }
    }

    // 2. Construir objeto de análisis (similar a window.currentAnalysisData)
    // Intentar cargar imagenes.json para reconstruir canvasImgenes
    let canvasImgenesCargadas = {};
    try {
      const imagenesJSONPath = `${rutaAnalisis}/imagenes/imagenes.json`;
      const imagenesJSONResult = await window.electronAPI.readFile(imagenesJSONPath);
      if (imagenesJSONResult.success) {
        const imagenesJSON = JSON.parse(imagenesJSONResult.content);
        canvasImgenesCargadas = {
          morphological: imagenesJSON.morfologica  || null,
          idealized:     imagenesJSON.idealizada   || null,
          schematic:     imagenesJSON.esquematica  || null
        };
        console.log('✅ canvasImgenes reconstruido desde imagenes.json',
          { morfologica: !!canvasImgenesCargadas.morphological,
            idealizada:  !!canvasImgenesCargadas.idealized,
            esquematica: !!canvasImgenesCargadas.schematic });
      }
    } catch (_eImg) {
      console.warn('[cargarAnalisis] No se pudo leer imagenes.json:', _eImg.message);
    }

    const analysis = {
      ...metadata,
      ...metricas,
      ...geometria,
      canvasImgenes: canvasImgenesCargadas,
      imagenes: {
        recortada:    `${rutaAnalisis}/imagenes/objeto_recortado.png`,
        morfologica:  `${rutaAnalisis}/imagenes/analisis_morfologico.png`,
        idealizada:   `${rutaAnalisis}/imagenes/forma_idealizada.png`,
        esquematica:  `${rutaAnalisis}/imagenes/esquema_morfometrico.png`
      }
    };
    
    console.log('📊 Análisis reconstruido:', analysis);
    
    // 3. Guardar en variable temporal (similar a currentAnalysisData)
    window._tempAnalysisData = analysis;
    
    // 4. Usar la función existente de apertura
    window.currentAnalysisData = analysis;
    await abrirAnalisisMorfologicoDesdeGuardado();
    
    toast.success(`Análisis "${analysis.nombreObjeto}" cargado desde carpeta`);
    
  } catch (error) {
    console.error('❌ Error cargando análisis desde ruta:', error);
    toast.error(`Error al cargar análisis: ${error.message}`);
  }
}

/**
 * Actualizar estadísticas del footer
 */
function updateCollectionStats() {
  if (!currentCollection) return;
  
  document.getElementById('collectionTotalItems').textContent = 
    `${currentCollection.totalObjetos} objeto${currentCollection.totalObjetos !== 1 ? 's' : ''}`;
  
  document.getElementById('collectionFilteredItems').textContent = 
    `${filteredObjects.length} mostrado${filteredObjects.length !== 1 ? 's' : ''}`;
}

/**
 * Filtrar y ordenar colección
 */
function filterAndSortCollection() {
  if (!currentCollection) return;
  
  const searchTerm = document.getElementById('collectionSearchInput').value.toLowerCase();
  const modoFilter = document.getElementById('collectionModoFilter').value;
  const sortBy = document.getElementById('collectionSortBy').value;
  
  // Filtrar
  filteredObjects = (currentCollection.objetos || []).filter(obj => {
    const matchesSearch = (obj.nombreObjeto || '').toLowerCase().includes(searchTerm);
    const matchesModo = modoFilter === 'all' || obj.modo === modoFilter;
    return matchesSearch && matchesModo;
  });
  
  // Ordenar
  filteredObjects.sort((a, b) => {
    switch (sortBy) {
      case 'timestamp-desc':
        return new Date(b.timestamp) - new Date(a.timestamp);
      case 'timestamp-asc':
        return new Date(a.timestamp) - new Date(b.timestamp);
      case 'name-asc':
        return a.nombreObjeto.localeCompare(b.nombreObjeto);
      case 'name-desc':
        return b.nombreObjeto.localeCompare(a.nombreObjeto);
      case 'area-desc':
        return (parseFloat(b.metricasResumen?.area) || 0) - (parseFloat(a.metricasResumen?.area) || 0);
      case 'area-asc':
        return (parseFloat(a.metricasResumen?.area) || 0) - (parseFloat(b.metricasResumen?.area) || 0);
      case 'circularity-desc':
        return (parseFloat(b.metricasResumen?.circularidad) || 0) - (parseFloat(a.metricasResumen?.circularidad) || 0);
      case 'perforations-desc':
        return (parseInt(b.metricasResumen?.numPerforaciones) || 0) - (parseInt(a.metricasResumen?.numPerforaciones) || 0);
      default:
        return 0;
    }
  });
  
  renderCollectionTable();
}

/**
 * Exportar colección completa como CSV
 */
async function exportarColeccionCSV() {
  if (!currentCollection || !(currentCollection.objetos?.length)) {
    toast.error('No hay objetos en la colección para exportar');
    return;
  }

  try {
    toast.info('Generando CSV de colección...');

    const headers = [
      'Nombre', 'Fecha', 'Modo', 'Cara',
      'Área (mm²)', 'Perímetro (mm)', 'Circularidad', 'Elongación', 'Aspect Ratio',
      'Forma Clasificada', 'Nº Perforaciones', 'Nº Horadaciones', 'Carpeta'
    ];

    const rows = [headers.join(',')];

    for (const obj of currentCollection.objetos) {
      const m = obj.metricasResumen || {};
      const row = [
        `"${(obj.nombreObjeto || '').replace(/"/g, '""')}"`,
        `"${obj.timestamp ? new Date(obj.timestamp).toLocaleString('es-ES') : ''}"`,
        obj.modo || '',
        obj.cara || '',
        m.area ?? '',
        m.perimetro ?? '',
        m.circularidad ?? '',
        m.elongacion ?? '',
        m.aspectRatio ?? '',
        `"${(m.clasificacionForma || '').replace(/"/g, '""')}"`,
        m.numPerforaciones ?? 0,
        m.numHoradaciones ?? 0,
        `"${(obj.carpeta || '').replace(/"/g, '""')}"`
      ];
      rows.push(row.join(','));
    }

    const csvContent = rows.join('\n');
    const filename = `coleccion_${(currentCollection.nombre || 'export').replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.csv`;

    // Intentar guardar con diálogo Electron; fallback a descarga de navegador
    if (window.electronAPI?.saveFileWithDialog) {
      const result = await window.electronAPI.saveFileWithDialog(filename, csvContent, 'csv');
      if (result?.success) {
        toast.success(`CSV exportado: ${result.filePath?.split('/').pop() || filename}`);
      } else if (result?.canceled) {
        // usuario canceló, no hacer nada
      } else {
        throw new Error(result?.error || 'Error desconocido');
      }
    } else {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href     = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success(`CSV exportado (${currentCollection.objetos.length} objetos)`);
    }

  } catch (error) {
    console.error('❌ Error exportando colección:', error);
    toast.error(`Error al exportar: ${error.message}`);
  }
}

/**
 * Actualizar índice de colección
 */
async function refreshCollectionIndex() {
  if (!currentCollection) return;
  
  // 🆕 Soportar proyectos abiertos desde carpeta externa
  let project;
  let folderPath;
  
  if (currentCollection.folderPath) {
    // Proyecto abierto desde carpeta externa - recargar desde disco
    folderPath = currentCollection.folderPath;
    console.log('🔄 Recargando índice desde carpeta externa:', folderPath);
    
    toast.info('Actualizando índice...');
    
    try {
      const indexPath = `${folderPath}/collection_index.json`;
      const indexResult = await window.electronAPI.readFile(indexPath);
      
      let collection;
      if (indexResult.success) {
        try {
          collection = JSON.parse(indexResult.content);
        } catch {
          collection = null;
        }
      }

      // Si no hay índice o está corrupto, reconstruir escaneando carpetas
      if (!collection || !(collection.objetos?.length)) {
        console.warn('⚠️ Índice externo ausente o vacío — reconstruyendo desde carpetas...');
        toast.info('Reconstruyendo índice...');
        // Crear proyecto temporal para rebuildCollectionIndex
        const tempProject = {
          id: currentCollection.proyectoId || 'external',
          name: currentCollection.nombre || 'Colección externa',
          folderPath: folderPath
        };
        const rebuilt = await projectManager.rebuildCollectionIndex(tempProject);
        if (!rebuilt) {
          toast.error('No se pudo reconstruir el índice');
          return;
        }
        collection = rebuilt;
      }
      
      // Actualizar currentCollection con nuevos datos
      currentCollection.objetos = collection.objetos;
      currentCollection.totalObjetos = collection.objetos.length;
      
      filteredObjects = [...collection.objetos];
      renderCollectionTable();
      
      toast.success(`Índice actualizado: ${collection.objetos.length} objetos`);
      
    } catch (error) {
      console.error('❌ Error actualizando índice:', error);
      toast.error('Error al actualizar índice');
    }
    
  } else {
    // Proyecto del projectManager
    project = projectManager.getProject(currentCollection.proyectoId);
    if (!project) return;
    
    toast.info('Actualizando índice...');
    
    const collection = await projectManager.rebuildCollectionIndex(project);
    
    if (collection) {
      currentCollection = collection;
      filteredObjects = [...collection.objetos];
      renderCollectionTable();
    }
  }
}

/**
 * Estados de UI
 */
function showCollectionLoadingState() {
  document.getElementById('collectionLoadingState').style.display = 'block';
  document.getElementById('collectionEmptyState').style.display = 'none';
  document.getElementById('collectionErrorState').style.display = 'none';
  const tbl = document.querySelector('.collection-table');
  if (tbl) tbl.style.display = 'none';
}

function hideCollectionLoadingState() {
  document.getElementById('collectionLoadingState').style.display = 'none';
  const tbl = document.querySelector('.collection-table');
  if (tbl) tbl.style.display = 'table';
}

function showCollectionEmptyState() {
  document.getElementById('collectionEmptyState').style.display = 'block';
  const tbl = document.querySelector('.collection-table');
  if (tbl) tbl.style.display = 'none';
}

function hideCollectionEmptyState() {
  document.getElementById('collectionEmptyState').style.display = 'none';
  const tbl = document.querySelector('.collection-table');
  if (tbl) tbl.style.display = 'table';
}

function showCollectionErrorState(message) {
  document.getElementById('collectionErrorState').style.display = 'block';
  document.getElementById('collectionErrorMessage').textContent = message;
  document.getElementById('collectionLoadingState').style.display = 'none';
  const tbl = document.querySelector('.collection-table');
  if (tbl) tbl.style.display = 'none';
}

/**
 * Obtener icono de forma
 */
function getShapeIcon(forma) {
  const icons = {
    'triangular':   '▲',
    'circular':     '●',
    'eliptica':     '⬭',
    'elipsoidal':   '⬭',
    'lanceolada':   '🍃',
    'amigdaloide':  '🏈',
    'piriforme':    '🍐',
    'cordiforme':   '♡',
    'laminar':      '▬',
    'lunar':        '☾',
    'rectangular':  '▬',
    'trapezoidal':  '⏢',
    'romboidal':    '◇',
    'poligonal':    '⬡',
    'irregular':    '◈',
    'convexa':      '◠',
    'concava':      '◡',
    'sin_clasificar': '◆'
  };
  
  return icons[forma] || icons['sin_clasificar'];
}

/**
 * Inicializar navegador de colecciones
 */
function initCollectionExplorer() {
  // Botón cerrar panel
  document.getElementById('closeCollectionPanel')?.addEventListener('click', closeCollectionPanel);
  
  // Búsqueda
  const searchInput = document.getElementById('collectionSearchInput');
  searchInput?.addEventListener('input', () => {
    const clearBtn = document.getElementById('clearSearchBtn');
    clearBtn.style.display = searchInput.value ? 'block' : 'none';
    filterAndSortCollection();
  });
  
  document.getElementById('clearSearchBtn')?.addEventListener('click', () => {
    searchInput.value = '';
    document.getElementById('clearSearchBtn').style.display = 'none';
    filterAndSortCollection();
  });
  
  // Filtros
  document.getElementById('collectionModoFilter')?.addEventListener('change', filterAndSortCollection);
  document.getElementById('collectionSortBy')?.addEventListener('change', filterAndSortCollection);
  
  // Acciones
  document.getElementById('refreshCollectionBtn')?.addEventListener('click', refreshCollectionIndex);
  document.getElementById('exportCollectionBtn')?.addEventListener('click', exportarColeccionCSV);
  
  // Botón reintentar carga (en estado de error)
  document.getElementById('retryLoadCollectionBtn')?.addEventListener('click', () => {
    if (currentCollection && currentCollection.proyectoId) {
      openCollectionExplorer(currentCollection.proyectoId);
    } else {
      refreshCollectionIndex();
    }
  });
  
  // Visualizador de análisis
  document.getElementById('closeAnalysisViewer')?.addEventListener('click', closeAnalysisViewer);
  document.getElementById('closeAnalysisViewerBtn')?.addEventListener('click', closeAnalysisViewer);
  document.getElementById('openMorphologicalAnalysisBtn')?.addEventListener('click', abrirAnalisisMorfologicoDesdeGuardado);
  document.getElementById('viewerExportCSVBtn')?.addEventListener('click', exportarCSVDesdeViewer);
  document.getElementById('viewerExportPDFBtn')?.addEventListener('click', exportarPDFDesdeViewer);
  
  // Tabs del visualizador
  document.querySelectorAll('.analysis-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      const tabName = tab.dataset.tab;
      
      // Actualizar tabs activos
      document.querySelectorAll('.analysis-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Actualizar paneles activos
      document.querySelectorAll('.analysis-tab-pane').forEach(pane => pane.classList.remove('active'));
      document.getElementById(`tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`).classList.add('active');
      
      // Cargar contenido específico de la tab
      if (tabName === 'visualization' && window.currentAnalysisPath) {
        console.log('📐 Cargando geometría e imágenes...');
        
        // Cargar geometría
        const geometryData = await loadGeometryData(window.currentAnalysisPath);
        if (geometryData) {
          renderGeometryCanvas(geometryData);
          window.currentGeometryData = geometryData;
          
          // Actualizar info del objeto
          const infoDiv = document.getElementById('geometryInfo');
          if (infoDiv && window.currentAnalysisData) {
            const analysis = window.currentAnalysisData;
            infoDiv.innerHTML = `
              <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--border-color);">
                <strong style="color: var(--text-primary);">Objeto:</strong><br>
                <span>${analysis.nombreObjeto || 'N/A'}</span>
              </div>
              <div style="margin-bottom: 8px;">
                <strong style="color: var(--text-primary);">Elementos:</strong><br>
                Contorno: ${geometryData.contornoReal?.puntos?.length || 0} pts<br>
                Hull: ${geometryData.convexHull?.puntos?.length || 0} pts<br>
                Perfora: ${geometryData.perforaciones?.length || 0}<br>
                Horad: ${geometryData.horadaciones?.length || 0}
              </div>
              ${geometryData.escala ? `
              <div>
                <strong style="color: var(--text-primary);">Escala:</strong><br>
                ${(geometryData.escala.factorConversion || geometryData.escala.factor || 1).toFixed(4)} mm/px
              </div>
              ` : ''}
            `;
          }
        }
        
        // Cargar imágenes en la misma vista
        console.log('🖼️ Cargando imágenes...');
        await loadAnalysisImages(window.currentAnalysisPath);
      }
    });
  });
  
  // Controles de visibilidad de geometría (checkboxes)
  const geometryControls = {
    toggleContour: document.getElementById('toggleContour'),
    toggleHull: document.getElementById('toggleHull'),
    toggleAxes: document.getElementById('toggleAxes'),
    toggleCentroids: document.getElementById('toggleCentroids'),
    toggleRadios: document.getElementById('toggleRadios'),
    togglePerforaciones: document.getElementById('togglePerforaciones'),
    toggleHoradaciones: document.getElementById('toggleHoradaciones')
  };
  
  // Inicializar estado de visibilidad
  window.geometryVisibility = {
    contour: true,
    hull: true,
    axes: true,
    centroids: true,
    radios: true,
    perforaciones: true,
    horadaciones: true
  };
  
  // Añadir eventos a checkboxes
  Object.keys(geometryControls).forEach(key => {
    const checkbox = geometryControls[key];
    if (checkbox) {
      const visibilityKey = key.replace('toggle', '').toLowerCase();
      checkbox.addEventListener('change', () => {
        window.geometryVisibility[visibilityKey] = checkbox.checked;
        if (window.currentGeometryData) {
          renderGeometryCanvas(window.currentGeometryData);
        }
      });
    }
  });
  
  // Botones de exportación en visualizador
  document.getElementById('exportAnalysisPDF')?.addEventListener('click', () => {
    toast.info('Exportación a PDF en desarrollo');
  });
  
  document.getElementById('exportAnalysisCSV')?.addEventListener('click', () => {
    toast.info('Exportación a CSV en desarrollo');
  });
}

// Inicializar al cargar
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCollectionExplorer);
} else {
  initCollectionExplorer();
}

// ==================================================================================
// SISTEMA DE TOOLTIPS - Helpers
// ==================================================================================

