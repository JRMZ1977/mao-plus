// MAO Plus — Gestión de Proyectos (ProjectManager)

/**
 * Selecciona el adaptador de sistema de archivos disponible.
 * Prioridad: electronAPI (Electron nativo) → PythonBridge.persistence (modo navegador).
 * @returns {{ _source: string, ensureFolder, saveFile, readFile } | null}
 */
function _getFsAdapter() {
  // Modo Electron: electronAPI nativa disponible
  if (window.electronAPI &&
      typeof window.electronAPI.ensureFolder === 'function' &&
      typeof window.electronAPI.saveFile === 'function') {
    return {
      _source: 'electronAPI',
      ensureFolder: (path) => window.electronAPI.ensureFolder(path),
      saveFile:     (path, content) => window.electronAPI.saveFile(path, content),
      readFile:     (path) => typeof window.electronAPI.readFile === 'function'
                              ? window.electronAPI.readFile(path)
                              : Promise.resolve({ success: false, error: 'readFile no disponible' }),
    };
  }
  // Modo navegador: Python bridge como capa de persistencia
  if (window.PythonBridge && PythonBridge.isAvailable() &&
      typeof PythonBridge.persistence?.ensureFolder === 'function') {
    return {
      _source: 'PythonBridge',
      ensureFolder: (path) => PythonBridge.persistence.ensureFolder(path),
      // Auto-detecta data URLs para enviar como base64
      saveFile: (path, content) => {
        const enc = (typeof content === 'string' && content.startsWith('data:'))
                    ? 'base64' : 'text';
        return PythonBridge.persistence.saveFile(path, content, enc);
      },
      readFile: (path) => PythonBridge.persistence.readFile(path),
    };
  }
  return null;
}

function _normalizeAnalysisMode(analysisData = {}) {
  const modo = String(analysisData?.modo || 'monofacial').toLowerCase();
  if (modo === 'obj3d') return 'obj3d';
  if (modo === 'bifacial') return 'bifacial';
  return 'monofacial';
}

function _normalizeAnalysisCara(analysisData = {}) {
  const modo = _normalizeAnalysisMode(analysisData);
  if (modo === 'obj3d') return '3D';
  const raw = String(analysisData?.cara || analysisData?.identificacion?.cara || '').toUpperCase();
  if (raw === 'A' || raw === 'B') return raw;
  return 'Mono';
}

function _extractAnalysisSummary(analysisData = {}) {
  const metricas = analysisData?.metricas || {};
  const modo = _normalizeAnalysisMode(analysisData);
  const volumen3d = Number(metricas?.bbox_volume);
  const area2d = Number(metricas?.area);
  const medidaPrincipal = modo === 'obj3d' && Number.isFinite(volumen3d)
    ? volumen3d
    : (Number.isFinite(area2d) ? area2d : 0);

  return {
    area: medidaPrincipal,
    perimetro: Number(metricas?.perimeter) || 0,
    circularidad: Number(metricas?.circularity) || 0,
    elongacion: Number(metricas?.elongation) || 0,
    aspectRatio: Number(metricas?.aspect_ratio) || 0,
    clasificacionForma: analysisData?.clasificacionForma || metricas?.forma_detectada || (modo === 'obj3d' ? 'obj3d_pca' : 'sin_clasificar'),
    numPerforaciones: (analysisData?.perforaciones || []).length,
    numHoradaciones: (analysisData?.horadaciones || []).length,
    porosidad: Number(metricas?.porosidad) || 0,
    medidaEtiqueta: modo === 'obj3d' ? 'Volumen BBox' : 'Área',
    medidaUnidad: modo === 'obj3d' ? (analysisData?.unidades || 'u3d') + '³' : 'mm²'
  };
}

function _buildMetricTraceability(modo = 'monofacial', metricas = {}, options = {}) {
  const metricKeys = Object.keys(metricas || {});
  const includesPH = Number(options?.numPerforaciones || 0) > 0 || Number(options?.numHoradaciones || 0) > 0;
  const includesCI_CMS = Number.isFinite(Number(metricas?.CI)) || Number.isFinite(Number(metricas?.CMS));

  const keyMetrics = [
    { key: 'area', section: 'II', source: 'metricas.objeto.area' },
    { key: 'perimeter', section: 'II', source: 'metricas.objeto.perimeter' },
    { key: 'circularity', section: 'III', source: 'metricas.objeto.circularity' },
    { key: 'solidity', section: 'III', source: 'metricas.objeto.solidity' },
    { key: 'regularidad_radial', section: 'IV', source: 'metricas.objeto.regularidad_radial' },
    { key: 'rugosidad_contorno', section: 'V', source: 'metricas.objeto.rugosidad_contorno' },
    { key: 'simetria_bilateral', section: 'VI', source: 'metricas.objeto.simetria_bilateral' },
    { key: 'feret_ratio', section: 'XII', source: 'metricas.objeto.feret_ratio' }
  ].map((item) => ({
    ...item,
    present: metricas?.[item.key] !== undefined && metricas?.[item.key] !== null
  }));

  const sections = ['II', 'III', 'IV', 'V', 'VI', 'VIII', 'XII'];
  if (modo === 'bifacial' || includesCI_CMS) sections.push('XIII');

  return {
    schemaVersion: '1.0.0',
    specDoc: 'FORMULAS_METRICAS_MAO.html',
    specSections: sections,
    generatedAt: new Date().toISOString(),
    mode: modo,
    summary: {
      metricasDetectadas: metricKeys.length,
      incluyePH: includesPH,
      incluyeCI_CMS: includesCI_CMS,
      fuentes: ['metadata.json', 'metricas.json', 'geometria.json']
    },
    keyMetrics
  };
}

function _buildCollectionTraceabilitySummary(objetos = []) {
  const modos = { monofacial: 0, bifacial: 0, obj3d: 0, otros: 0 };
  let incluyePH = false;
  let incluyeCI_CMS = false;

  for (const obj of objetos || []) {
    const modo = String(obj?.modo || 'monofacial').toLowerCase();
    if (modo === 'monofacial' || modo === 'bifacial' || modo === 'obj3d') modos[modo] += 1;
    else modos.otros += 1;

    const t = obj?.trazabilidadMetricas;
    if (t?.summary?.incluyePH) incluyePH = true;
    if (t?.summary?.incluyeCI_CMS) incluyeCI_CMS = true;
  }

  return {
    schemaVersion: '1.0.0',
    specDoc: 'FORMULAS_METRICAS_MAO.html',
    generatedAt: new Date().toISOString(),
    totalObjetos: (objetos || []).length,
    modos,
    incluyePH,
    incluyeCI_CMS,
    scope: ['II', 'III', 'IV', 'V', 'VI', 'VIII', 'XII'].concat(incluyeCI_CMS ? ['XIII'] : [])
  };
}

class ProjectManager {
  constructor() {
    this.projects = [];
    this.activeProject = null;
    this.storageKey = 'mao_plus_projects';
    this.activeProjectKey = 'mao_plus_active_project';
    this.load();
  }
  
  // Cargar proyectos desde localStorage
  load() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.projects = JSON.parse(stored);
      }
      
      const activeId = localStorage.getItem(this.activeProjectKey);
      if (activeId) {
        this.activeProject = this.projects.find(p => p.id === activeId) || null;
      }
      // Actualizar sidebar tras cargar estado persistido
      // (diferido: el DOM puede no estar listo si el constructor corre antes del DOMContentLoaded)
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this._updateSidebarName(), { once: true });
      } else {
        this._updateSidebarName();
      }
    } catch (error) {
      console.error('Error cargando proyectos:', error);
      toast.error('Error al cargar proyectos');
    }
  }
  
  // Guardar proyectos en localStorage
  save() {
    try {
      // Serializar sin campo 'data' por si alguna referencia lo tiene (defensa extra)
      const projectsLite = this.projects.map(p => ({
        ...p,
        analyses: (p.analyses || []).map(({ data, ...ref }) => ref),
        apsAnalyses: (p.apsAnalyses || [])
      }));
      localStorage.setItem(this.storageKey, JSON.stringify(projectsLite));
      if (this.activeProject) {
        localStorage.setItem(this.activeProjectKey, this.activeProject.id);
      } else {
        localStorage.removeItem(this.activeProjectKey);
      }
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.error('❌ localStorage lleno. Intentando limpiar datos pesados...');
        // Fallback: guardar solo estructura mínima sin analyses
        try {
          const projectsMin = this.projects.map(p => ({
            ...p,
            analyses: (p.analyses || []).map(({ data, ...ref }) => ref),
            apsAnalyses: (p.apsAnalyses || [])
          }));
          localStorage.setItem(this.storageKey, JSON.stringify(projectsMin));
          console.warn('⚠️ Guardado con datos mínimos por falta de espacio en localStorage');
        } catch (e2) {
          console.error('❌ Error crítico guardando proyectos:', e2);
          toast.error('Error crítico: no se pudo guardar el proyecto (almacenamiento lleno)');
        }
      } else {
        console.error('Error guardando proyectos:', error);
        toast.error('Error al guardar proyectos');
      }
    }
  }
  
  // Crear nuevo proyecto
  createProject(name, description, commonTrait, folderPath, sitio = '', investigadorResponsable = '', institucionResponsable = '') {
    // Validar y sanitizar folderPath
    const sanitizedFolderPath = typeof folderPath === 'string' ? folderPath.trim() : null;
    
    const project = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      name: name.trim(),
      description: description.trim(),
      commonTrait: commonTrait.trim(),
      folderPath: sanitizedFolderPath,
      sitio: sitio ? sitio.trim() : '',
      investigadorResponsable: investigadorResponsable ? investigadorResponsable.trim() : '',
      institucionResponsable: institucionResponsable ? institucionResponsable.trim() : '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      analyses: []
    };
    
    this.projects.push(project);
    this.save();
    
    // 🆕 GENERAR ARCHIVO proyecto.mao EN LA CARPETA DEL PROYECTO
    if (sanitizedFolderPath && window.electronAPI) {
      console.log('🔍 Generando proyecto.mao con folderPath:', sanitizedFolderPath);
      generarArchivoProyecto(project).catch(error => {
        console.error('Error generando archivo proyecto.mao:', error);
      });
    } else {
      console.warn('⚠️ No se generó proyecto.mao:', {
        folderPath: sanitizedFolderPath,
        electronAPI: !!window.electronAPI
      });
    }
    
    toast.success(`Proyecto "${name}" creado exitosamente`);
    return project;
  }
  
  // Actualizar proyecto
  updateProject(id, updates) {
    const project = this.projects.find(p => p.id === id);
    if (!project) {
      toast.error('Proyecto no encontrado');
      return null;
    }
    
    Object.assign(project, updates);
    project.updatedAt = new Date().toISOString();
    this.save();
    toast.success('Proyecto actualizado');
    return project;
  }
  
  // Eliminar proyecto
  deleteProject(id) {
    const index = this.projects.findIndex(p => p.id === id);
    if (index === -1) {
      toast.error('Proyecto no encontrado');
      return false;
    }
    
    const projectName = this.projects[index].name;
    this.projects.splice(index, 1);
    
    if (this.activeProject && this.activeProject.id === id) {
      this.activeProject = null;
    }
    
    this.save();
    toast.success(`Proyecto "${projectName}" eliminado`);
    return true;
  }
  
  // Establecer proyecto activo
  // Sincroniza el nombre de proyecto visible en el sidebar
  _updateSidebarName() {
    const el = document.getElementById('sidebarProyectoNombre');
    if (el) el.textContent = this.activeProject ? this.activeProject.name : 'Sin Proyecto';
  }

  setActiveProject(id) {
    const project = this.projects.find(p => p.id === id);
    if (!project) {
      toast.error('Proyecto no encontrado');
      return false;
    }
    
    this.activeProject = project;
    this.save();
    this._updateSidebarName();
    toast.info(`Proyecto "${project.name}" activado`);
    return true;
  }
  
  // Desactivar proyecto
  deactivateProject() {
    if (this.activeProject) {
      toast.info(`Proyecto "${this.activeProject.name}" desactivado`);
      this.activeProject = null;
      this.save();
      this._updateSidebarName();
    }
  }
  
  // Agregar análisis al proyecto activo
  async addAnalysis(analysisData) {
    if (!this.activeProject) {
      console.warn('⚠️ No hay proyecto activo');
      toast.warning('No hay proyecto activo. Por favor, activa un proyecto primero.');
      return false;
    }
    
    console.log('📝 Agregando análisis al proyecto:', this.activeProject.name);
    console.log('📁 Carpeta del proyecto:', this.activeProject.folderPath);
    
    // Objeto completo en memoria (incluye data pesada con imágenes base64)
    const analysis = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      data: analysisData
    };
    
    // Referencia ligera: solo metadatos esenciales → va a localStorage
    const analysisRef = {
      id: analysis.id,
      timestamp: analysis.timestamp,
      nombreObjeto: analysisData?.nombreObjeto || analysisData?.identificacion?.nombre || 'SinNombre',
      cara: _normalizeAnalysisCara(analysisData),
      modo: _normalizeAnalysisMode(analysisData),
      metricasResumen: _extractAnalysisSummary(analysisData),
      carpeta: null,
      rutaCompleta: null
    };
    
    this.activeProject.analyses.push(analysisRef);
    this.activeProject.updatedAt = new Date().toISOString();
    this.save();
    
    console.log(`✅ Referencia de análisis guardada en localStorage (Total: ${this.activeProject.analyses.length})`);
    
    // Si el proyecto tiene carpeta configurada, guardar archivos completos en disco
    if (this.activeProject.folderPath) {
      console.log('💾 Iniciando guardado en disco...');
      try {
        await this.saveAnalysisFiles(analysis);
        console.log('✅ Guardado en disco completado');
      } catch (error) {
        console.error('❌ Error al guardar en disco:', error);
        toast.error(`Error al guardar archivos: ${error.message}`);
      }
    } else {
      console.warn('⚠️ Proyecto sin carpeta configurada - solo guardado en memoria');
      toast.warning('Proyecto sin carpeta configurada. Los datos solo se guardan en memoria.');
    }
    
    toast.success(`Análisis agregado al proyecto "${this.activeProject.name}"`);
    return true;
  }
  
  // Guardar archivos del análisis en la carpeta del proyecto
  async saveAnalysisFiles(analysis) {
    console.log('🔍 saveAnalysisFiles iniciado');

    // VALIDACIÓN CRÍTICA 1: Proyecto activo
    if (!this.activeProject || !this.activeProject.folderPath) {
      console.error('❌ FALLO: Sin proyecto activo o carpeta');
      console.log('  - activeProject:', this.activeProject ? 'existe' : 'null');
      console.log('  - folderPath:', this.activeProject?.folderPath || 'null');
      throw new Error('No hay proyecto activo o carpeta configurada');
    }

    // ── Selección de adaptador FS: electronAPI (Electron) o PythonBridge (navegador) ──
    // _getFsAdapter() devuelve una interfaz unificada con ensureFolder / saveFile / readFile
    const _fs = _getFsAdapter();
    if (!_fs) {
      console.error('❌ Sin adaptador FS: ni electronAPI ni PythonBridge.persistence disponibles');
      throw new Error('Sin mecanismo de persistencia disponible (requiere Electron o servidor Python)');
    }
    console.log(`✅ Adaptador FS: ${_fs._source}`);

    console.log('✅ Validaciones pasadas: proyecto y adaptador FS OK');
    
    const projectFolder = this.activeProject.folderPath;
    const timestamp = new Date(analysis.timestamp).toISOString().replace(/[:.]/g, '-').split('T').join('_').split('Z')[0];
    const analysisNumber = String(this.activeProject.analyses.length).padStart(3, '0');
    const nombreObjeto = analysis.data?.nombreObjeto || analysis.data?.identificacion?.nombre || 'SinNombre';
    const nombreSanitizado = nombreObjeto.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
    
    // Nombre de carpeta: ID arqueológico del objeto (ej: QP1_U1_N1_E1_01_ca)
    const idArqueologico = analysis.data?.id?.replace(/[^a-zA-Z0-9_-]/g, '_');
    const analysisFolderName = idArqueologico || `${nombreSanitizado}_${analysisNumber}`;
    const analysisFolderPath = `${projectFolder}/${analysisFolderName}`;
    
    console.log(`💾 Guardando análisis completo en: ${analysisFolderPath}`);
    console.log(`  - Proyecto: ${this.activeProject.name}`);
    console.log(`  - Carpeta proyecto: ${projectFolder}`);
    console.log(`  - Nombre análisis: ${analysisFolderName}`);
    
    try {
      // 1. CREAR CARPETA DEL ANÁLISIS
      console.log('📁 Creando carpeta principal...');
      const folderResult = await _fs.ensureFolder(analysisFolderPath);
      if (!folderResult.success) {
        throw new Error(`No se pudo crear la carpeta: ${folderResult.error}`);
      }
      console.log('✅ Carpeta principal creada');
      
      console.log('📁 Creando subcarpeta imagenes...');
      const imagesFolderResult = await _fs.ensureFolder(`${analysisFolderPath}/imagenes`);
      if (!imagesFolderResult.success) {
        throw new Error(`No se pudo crear subcarpeta imagenes: ${imagesFolderResult.error}`);
      }
      console.log('✅ Subcarpeta imagenes creada');
      
      // 2. METADATA.JSON
      console.log('📝 Preparando metadata.json...');
      
      // 🐛 FIX: Asegurar que la cara se guarda correctamente
      const identificacionData = analysis.data?.identificacion || {};
      const numeroObjeto = analysis.data?.numeroObjeto || null;
      const cara = analysis.data?.cara || identificacionData.cara || null;
      
      console.log('🔍 DEBUG - Guardando metadata con:', {
        id: analysis.id,
        numeroObjeto,
        cara,
        analisisDataCara: analysis.data?.cara,
        identificacionCara: identificacionData.cara
      });
      
      const metadata = {
        id: analysis.id,
        nombreObjeto: nombreObjeto,
        timestamp: analysis.timestamp,
        numeroObjeto: numeroObjeto,
        proyecto: {
          id: this.activeProject.id,
          nombre: this.activeProject.name,
          descripcion: this.activeProject.description,
          sitio: this.activeProject.sitio || '',
          investigadorResponsable: this.activeProject.investigadorResponsable || '',
          institucionResponsable: this.activeProject.institucionResponsable || ''
        },
        identificacion: {
          ...identificacionData,
          cara: cara, // FIX: Asegurar que cara siempre se guarda
          numeroObjeto: numeroObjeto
        },
        configuracion: {
          escala: analysis.data?.escala || 1,
          unidades: analysis.data?.unidades || 'mm',
          modo: analysis.data?.modo || 'monofacial', // FIX: Usar el modo guardado, por defecto monofacial
          parametros_captura: analysis.data?.parametros_captura || {}
        },
        procesamiento: {
          versionMAO: '1.2.0',
          fecha: analysis.timestamp
        },
        archivos: {
          metadata: 'metadata.json',
          metricas: 'metricas.json',
          metricasCSV: 'metricas.csv',
          geometria: 'geometria.json',
          trazados: 'trazados.json',
          imagenes: 'imagenes/',
          imagenesJSON: 'imagenes/imagenes.json'
        }
      };
      
      console.log('💾 Guardando metadata.json...');
      const metadataPath = `${analysisFolderPath}/metadata.json`;
      console.log(`  Ruta: ${metadataPath}`);
      const metadataResult = await _fs.saveFile(
        metadataPath,
        JSON.stringify(metadata, null, 2)
      );
      if (!metadataResult.success) {
        throw new Error(`No se pudo guardar metadata.json: ${metadataResult.error}`);
      }
      console.log('✅ metadata.json guardado exitosamente');
      
      // 3. METRICAS.JSON (métricas completas del objeto y P/H)
      console.log('📝 Preparando metricas.json...');
      console.log(`  📊 Verificando datos recibidos:`, {
        tieneMetricas: !!analysis.data?.metricas,
        numPropiedadesMetricas: Object.keys(analysis.data?.metricas || {}).length,
        primerasMetricas: Object.keys(analysis.data?.metricas || {}).slice(0, 10),
        tienePerforaciones: !!analysis.data?.perforaciones,
        numPerforaciones: (analysis.data?.perforaciones || []).length,
        tieneHoradaciones: !!analysis.data?.horadaciones,
        numHoradaciones: (analysis.data?.horadaciones || []).length
      });
      
      const metricas = {
        objeto: analysis.data?.metricas || {},
        perforaciones: (analysis.data?.perforaciones || []).map(p => ({
          id: p.id,
          puntos: p.puntos || [], // AGREGADO: Guardar trazos completos
          area: p.area || p.metricas?.area || 0,
          perimetro: p.perimetro || p.metricas?.perimeter || 0,
          circularidad: p.metricas?.circularity || 0,
          centroide: p.centroide || p.metricas?.centroid || [0, 0],
          distanciaAlCentro: p.distanciaAlCentro || 0,
          metricas: p.metricas || {} // Métricas completas de cada perforación
        })),
        horadaciones: (analysis.data?.horadaciones || []).map(h => ({
          id: h.id,
          puntos: h.puntos || [], // AGREGADO: Guardar trazos completos
          area: h.area || h.metricas?.area || 0,
          perimetro: h.perimetro || h.metricas?.perimeter || 0,
          circularidad: h.metricas?.circularity || 0,
          centroide: h.centroide || h.metricas?.centroid || [0, 0],
          distanciaAlCentro: h.distanciaAlCentro || 0,
          metricas: h.metricas || {} // Métricas completas de cada horadación
        })),
        estadisticas: {
          totalPerforaciones: (analysis.data?.perforaciones || []).length,
          totalHoradaciones: (analysis.data?.horadaciones || []).length,
          areaTotal: analysis.data?.metricas?.area || 0,
          areaReal: analysis.data?.metricas?.area_fragmentada || 0,
          areaNeta: analysis.data?.metricas?.area_neta || analysis.data?.area_neta || 0,
          perimetroNeto: analysis.data?.perimetro_neto || 0,
          solidez: analysis.data?.metricas?.solidity || 0,
          porosidad: analysis.data?.metricas?.porosidad || 0
        }
      };
      
      // 📊 DIAGNÓSTICO: Verificar métricas antes de escribir a disco
      console.log('📊 DIAGNÓSTICO - Métricas ANTES de guardar en disco:', {
        totalPropiedades: Object.keys(metricas.objeto).length,
        primeras10: Object.keys(metricas.objeto).slice(0, 10),
        ultimas10: Object.keys(metricas.objeto).slice(-10),
        tieneCircularidad: metricas.objeto.circularity !== undefined,
        tieneArea: metricas.objeto.area !== undefined,
        tieneFormaDetectada: metricas.objeto.forma_detectada !== undefined,
        ejemploValores: {
          area: metricas.objeto.area,
          circularity: metricas.objeto.circularity,
          forma_detectada: metricas.objeto.forma_detectada,
          orientation: metricas.objeto.orientation,
          symmetry_score: metricas.objeto.symmetry_score
        }
      });
      
      console.log('💾 Guardando metricas.json...');
      console.log(`  Total perforaciones: ${metricas.estadisticas.totalPerforaciones}`);
      console.log(`  Total horadaciones: ${metricas.estadisticas.totalHoradaciones}`);
      const metricasPath = `${analysisFolderPath}/metricas.json`;
      const metricasResult = await _fs.saveFile(
        metricasPath,
        JSON.stringify(metricas, null, 2)
      );
      if (!metricasResult.success) {
        throw new Error(`No se pudo guardar metricas.json: ${metricasResult.error}`);
      }
      console.log('✅ metricas.json guardado exitosamente');
      
      // 4. METRICAS.CSV (formato tabular)
      console.log('📝 Preparando metricas.csv...');
      const csvContent = this.analysisToCSV(analysis.data);
      console.log(`  Tamaño CSV: ${csvContent.length} caracteres`);
      
      console.log('💾 Guardando metricas.csv...');
      const csvPath = `${analysisFolderPath}/metricas.csv`;
      const csvResult = await _fs.saveFile(
        csvPath,
        csvContent
      );
      if (!csvResult.success) {
        throw new Error(`No se pudo guardar metricas.csv: ${csvResult.error}`);
      }
      console.log('✅ metricas.csv guardado exitosamente');
      
      // 5. GEOMETRIA.JSON (coordenadas crudas para reanálisis)
      console.log('📝 Preparando geometria.json...');
      
      // 🔧 DEBUG: Verificar que contorno tiene datos antes de guardar
      const contornoParaGuardar = analysis.data?.elementosGeometricos?.contorno;
      if (contornoParaGuardar && (!contornoParaGuardar.puntos || contornoParaGuardar.puntos.length === 0)) {
        console.warn('⚠️ ALERTA: Contorno vacío detectado. Intentando usar _contour_data como fallback...');
        // Si el contorno guardado está vacío, intentar recuperar de _contour_data
        if (analysis.data?.metricas?._contour_data?.points) {
          console.log(`  ✅ Fallback: usando _contour_data (${analysis.data.metricas._contour_data.points.length} puntos)`);
          contornoParaGuardar.puntos = analysis.data.metricas._contour_data.points;
        }
      }
      
      const geometria = {
        contornoReal: analysis.data?.elementosGeometricos?.contorno || {},
        convexHull: analysis.data?.elementosGeometricos?.convexHull || {},
        boundingBox: analysis.data?.elementosGeometricos?.boundingBox || {},
        centroides: analysis.data?.elementosGeometricos?.centroides || {},
        ejes: analysis.data?.elementosGeometricos?.ejes || {},
        radios: analysis.data?.elementosGeometricos?.radios || {},
        trazosCanvas: analysis.data?.trazosCanvas || { perforaciones: [], horadaciones: [] },
        
        // 🆕 PERFORACIONES COMPLETAS (con toda la información geométrica)
        perforaciones: (analysis.data?.elementosGeometricos?.perforaciones || []).map(p => ({
          id: p.id,
          puntos: p.puntos || [],
          centroide: p.centroide || [0, 0],
          area: p.area || 0,
          perimetro: p.perimetro || 0,
          tipo: p.tipo || 'perforacion',
          color: p.color || '#0066cc',
          grosor: p.grosor || 2,
          cerrado: p.cerrado !== undefined ? p.cerrado : true,
          descripcion: p.descripcion || `Perforación ${p.id}`,
          metricas: p.metricas || null
        })),
        
        // 🆕 HORADACIONES COMPLETAS (con toda la información geométrica)
        horadaciones: (analysis.data?.elementosGeometricos?.horadaciones || []).map(h => ({
          id: h.id,
          puntos: h.puntos || [],
          centroide: h.centroide || [0, 0],
          area: h.area || 0,
          perimetro: h.perimetro || 0,
          tipo: h.tipo || 'horadacion',
          color: h.color || '#28a745',
          grosor: h.grosor || 2,
          cerrado: h.cerrado !== undefined ? h.cerrado : true,
          descripcion: h.descripcion || `Horadación ${h.id}`,
          metricas: h.metricas || null
        })),
        
        escala: analysis.data?.elementosGeometricos?.escala || {
          factor: analysis.data?.escala || 1,
          unidades: analysis.data?.unidades || 'mm'
        }
      };
      
      console.log('💾 Guardando geometria.json...');
      console.log('🔍 DEBUG - Contenido de geometria.json:', {
        contornoReal: geometria.contornoReal?.puntos?.length || 0,
        convexHull: geometria.convexHull?.puntos?.length || 0,
        perforaciones: geometria.perforaciones?.length || 0,
        horadaciones: geometria.horadaciones?.length || 0,
        ejes: {
          ejeMayor: !!geometria.ejes?.ejeMayor,
          ejeMenor: !!geometria.ejes?.ejeMenor
        },
        radios: {
          radioMaximo: !!geometria.radios?.radioMaximo,
          radioMinimo: !!geometria.radios?.radioMinimo
        },
        centroides: {
          centroideHull: !!geometria.centroides?.centroideHull,
          centroideReal: !!geometria.centroides?.centroideReal
        }
      });
      
      const geometriaPath = `${analysisFolderPath}/geometria.json`;
      const geometriaResult = await _fs.saveFile(
        geometriaPath,
        JSON.stringify(geometria, null, 2)
      );
      if (!geometriaResult.success) {
        throw new Error(`No se pudo guardar geometria.json: ${geometriaResult.error}`);
      }
      console.log('✅ geometria.json guardado exitosamente');

      // 6. TRAZADOS.JSON (trazados de P/H y capas de canvas)
      const trazadosData = {
        trazosCanvas: analysis.data?.trazosCanvas || { perforaciones: [], horadaciones: [] },
        canvasImgenes: analysis.data?.canvasImgenes || {},
        imagenes: analysis.data?.imagenes || {}
      };
      const trazadosPath = `${analysisFolderPath}/trazados.json`;
      const trazadosResult = await _fs.saveFile(
        trazadosPath,
        JSON.stringify(trazadosData, null, 2)
      );
      if (!trazadosResult.success) {
        throw new Error(`No se pudo guardar trazados.json: ${trazadosResult.error}`);
      }
      console.log('✅ trazados.json guardado exitosamente');
      
      // 6. 🆕 ACTUALIZAR ÍNDICE DE COLECCIÓN (mover antes de imágenes para asegurar registro)
      console.log('🗂️ Actualizando índice de colección...');
      try {
        await this.updateCollectionIndex(this.activeProject, analysis, analysisFolderName);
        console.log('✅ Índice de colección actualizado');
      } catch (indexError) {
        console.error('⚠️ Error actualizando índice (no crítico):', indexError.message);
      }
      
      // 7. GUARDAR IMÁGENES (si existen canvas disponibles)
      console.log('🖼️ Guardando imágenes...');
      await this.saveAnalysisImages(analysis, `${analysisFolderPath}/imagenes`);
      
      // 8. ACTUALIZAR RESUMEN.CSV DEL PROYECTO
      console.log('📊 Actualizando resumen del proyecto...');
      try {
        await this.updateProjectSummaryCSV();
        console.log('✅ Resumen actualizado');
      } catch (csvError) {
        console.error('⚠️ Error actualizando resumen CSV (no crítico):', csvError.message);
      }
      
      console.log(`\n✅✅✅ Análisis completo guardado exitosamente ✅✅✅`);
      console.log(`📂 Carpeta: ${analysisFolderName}`);
      console.log(`📍 Ruta completa: ${analysisFolderPath}`);
      
      toast.success(`Análisis guardado en carpeta: ${analysisFolderName}`);
      
      // Actualizar referencia ligera en localStorage con la ruta del disco
      const analysisIndex = this.activeProject.analyses.findIndex(a => a.id === analysis.id);
      if (analysisIndex >= 0) {
        this.activeProject.analyses[analysisIndex].carpeta = analysisFolderName;
        this.activeProject.analyses[analysisIndex].rutaCompleta = analysisFolderPath;
        // Asegurar que no haya data pesada en la referencia
        delete this.activeProject.analyses[analysisIndex].data;
        this.save();
        console.log('✅ Referencia actualizada en localStorage con ruta de disco');
      }
      
    } catch (error) {
      console.error('\n❌❌❌ ERROR GUARDANDO ARCHIVOS DEL ANÁLISIS ❌❌❌');
      console.error('Tipo de error:', error.name);
      console.error('Mensaje:', error.message);
      console.error('Stack:', error.stack);
      console.error('Análisis ID:', analysis.id);
      console.error('Proyecto:', this.activeProject?.name);
      console.error('Carpeta proyecto:', this.activeProject?.folderPath);
      
      toast.error(`Error al guardar: ${error.message}`);
      
      // Re-lanzar el error para que sea capturado por addAnalysis
      throw error;
    }
  }
  
  // Nueva función: Guardar imágenes del análisis
  async saveAnalysisImages(analysis, imagesFolderPath) {
    const _fs = _getFsAdapter();
    if (!_fs) {
      console.warn('⚠️ saveAnalysisImages: sin adaptador FS, imágenes no guardadas');
      return;
    }
    try {
      console.log('🖼️ Guardando imágenes del análisis...');
      console.log('📁 Ruta:', imagesFolderPath);
      
      // Crear carpeta de imágenes
      const dirResult = await _fs.ensureFolder(imagesFolderPath);
      if (!dirResult.success) {
        throw new Error(`Error creando carpeta de imágenes: ${dirResult.error}`);
      }
      console.log('✅ Carpeta de imágenes creada');
      
      const data = analysis.data || {};
      const imagenesGuardadas = data.imagenes || {};
      let imagesSaved = 0;
      
      // VERIFICAR DISPONIBILIDAD DE DATOS
      console.log('🔍 Verificando datos disponibles:', {
        tieneImagenRecortada: !!(data.imagenRecortada || imagenesGuardadas.recortada),
        tipoImagenRecortada: data.imagenRecortada ? typeof data.imagenRecortada : (imagenesGuardadas.recortada ? typeof imagenesGuardadas.recortada : 'undefined'),
        longitudImagenRecortada: (data.imagenRecortada || imagenesGuardadas.recortada) ? (data.imagenRecortada || imagenesGuardadas.recortada).length : 0,
        primeros100caracteres: (data.imagenRecortada || imagenesGuardadas.recortada) ? (data.imagenRecortada || imagenesGuardadas.recortada).substring(0, 100) : 'N/A',
        tieneMorphCanvas: !!document.getElementById('morphologicalCanvas'),
        tieneImagenMorfologica: !!imagenesGuardadas.morfologica
      });
      
      // 1. IMAGEN DEL OBJETO RECORTADO (la más importante)
      if (data.imagenRecortada || imagenesGuardadas.recortada) {
        console.log('💾 Intentando guardar objeto_recortado.png...');
        const imagenRecortadaFuente = data.imagenRecortada || imagenesGuardadas.recortada;
        console.log('  📊 Tamaño de imagen recortada:', imagenRecortadaFuente.length, 'caracteres');
        console.log('  📊 Comienza con:', imagenRecortadaFuente.substring(0, 50));
        
        const imgPath = `${imagesFolderPath}/objeto_recortado.png`;
        console.log('  📁 Ruta destino:', imgPath);
        const imgResult = await _fs.saveFile(imgPath, imagenRecortadaFuente);
        console.log('📤 Resultado guardado:', imgResult);
        if (imgResult.success) {
          imagesSaved++;
          console.log('  ✅ objeto_recortado.png guardado exitosamente');
          
          // 🆕 VERIFICAR QUE EL ARCHIVO SE GUARDÓ CORRECTAMENTE
          try {
            const verificacion = await _fs.readFile(imgPath);
            if (verificacion.success) {
              console.log('  ✅ VERIFICACIÓN: Archivo guardado y puede leerse');
              console.log('  📊 Tamaño archivo guardado:', verificacion.content.length, 'caracteres');
            } else {
              console.error('  ❌ VERIFICACIÓN FALLÓ: Archivo no se puede leer:', verificacion.error);
            }
          } catch (verifyError) {
            console.error('  ❌ Error verificando archivo:', verifyError);
          }
        } else {
          console.error('  ❌ Error guardando objeto_recortado.png:', imgResult.error);
        }
      } else {
        console.warn('  ⚠️ No hay imagenRecortada disponible en analysis.data');
      }
      
      // Fuente centralizada: canvasImgenes (rellenado por guardarCanvasEnObjeto en JS principal)
      // con fallback al DOM en vivo y luego a imagenesGuardadas del JSON del proyecto.
      const canvasImgenes = data.canvasImgenes || {};

      // Helper: guardar un dataURL como PNG; devuelve true si éxito
      const _savePng = async (rutaRelativa, dataURL) => {
        if (!dataURL) return false;
        const res = await _fs.saveFile(`${imagesFolderPath}/${rutaRelativa}`, dataURL);
        if (res.success) { imagesSaved++; console.log(`  ✅ ${rutaRelativa} guardado`); }
        else console.error(`  ❌ Error guardando ${rutaRelativa}:`, res.error);
        return res.success;
      };

      // Helper: capturar canvas DOM en alta resolución (factor 3×)
      const _captureCanvas = (id) => {
        const c = document.getElementById(id);
        if (!c || c.width === 0) return null;
        try {
          const hi = document.createElement('canvas');
          hi.width  = c.width  * 3;
          hi.height = c.height * 3;
          const ctx = hi.getContext('2d');
          ctx.imageSmoothingEnabled  = true;
          ctx.imageSmoothingQuality  = 'high';
          ctx.scale(3, 3);
          ctx.drawImage(c, 0, 0);
          return hi.toDataURL('image/png', 1.0);
        } catch(_e) { return null; }
      };

      // 2. CANVAS MORFOLÓGICO — con trazos P/H, contornos, ejes, radios
      const morphDataURL = canvasImgenes.morphological
        || imagenesGuardadas.morfologica
        || _captureCanvas('morphologicalCanvas');
      await _savePng('analisis_morfologico.png', morphDataURL);

      // 3. FORMA IDEALIZADA — contorno depurado / forma IA
      const idealDataURL = canvasImgenes.idealized
        || imagenesGuardadas.idealizada
        || _captureCanvas('idealizedShapeCanvas');
      await _savePng('forma_idealizada.png', idealDataURL);

      // 4. ESQUEMA MORFOMÉTRICO — ejes, centroides, radios sin imagen de fondo
      const schemDataURL = canvasImgenes.schematic
        || imagenesGuardadas.esquematica
        || _captureCanvas('schematicCanvas');
      await _savePng('esquema_morfometrico.png', schemDataURL);

      // 5. METADATA DE IMÁGENES
      console.log('💾 Guardando metadata.json...');
      const imagesMeta = {
        totalImagenes: imagesSaved,
        fecha: new Date().toISOString(),
        imagenes: {
          objetoRecortado:      (data.imagenRecortada || imagenesGuardadas.recortada) ? 'objeto_recortado.png'    : null,
          analisisMorfologico:  morphDataURL  ? 'analisis_morfologico.png' : null,
          formaIdealizada:      idealDataURL  ? 'forma_idealizada.png'     : null,
          esquemaMorfometrico:  schemDataURL  ? 'esquema_morfometrico.png' : null,
          base64JSON: 'imagenes.json'
        }
      };
      
      const metaResult = await _fs.saveFile(
        `${imagesFolderPath}/metadata.json`,
        JSON.stringify(imagesMeta, null, 2)
      );
      console.log('📤 Metadata guardado:', metaResult.success);

      // Guardar JSON con base64 para recuperación completa y para el PDF
      const imagenesJSONResult = await _fs.saveFile(
        `${imagesFolderPath}/imagenes.json`,
        JSON.stringify({
          recortada:    data.imagenRecortada || imagenesGuardadas.recortada || null,
          morfologica:  morphDataURL  || null,
          idealizada:   idealDataURL  || null,
          esquematica:  schemDataURL  || null
        }, null, 2)
      );
      console.log('📤 imagenes.json guardado:', imagenesJSONResult.success);

      console.log('✅ Proceso de guardado de imágenes completado');
      console.log('📊 Resumen final:', {
        carpeta: imagesFolderPath,
        imagenesGuardadas: imagesSaved
      });
      
      console.log(`✅ ${imagesSaved} imágenes guardadas exitosamente`);

      // 5. IMAGEN ORIGINAL (necesaria para recálculo retroactivo de error óptico)
      // Bifacial: seleccionar la imagen de la cara correcta; monofacial: window.image
      const caraAnalisis = analysis.data?.cara;
      const imagenFuenteGlobal = caraAnalisis === 'B' ? window.imageCaraB
                                : caraAnalisis === 'A' ? window.imageCaraA
                                : window.image || window.imageCaraA;
      if (imagenFuenteGlobal && imagenFuenteGlobal.naturalWidth > 0) {
        try {
          const origCanvas = document.createElement('canvas');
          origCanvas.width  = imagenFuenteGlobal.naturalWidth;
          origCanvas.height = imagenFuenteGlobal.naturalHeight;
          origCanvas.getContext('2d').drawImage(imagenFuenteGlobal, 0, 0);
          const origDataURL = origCanvas.toDataURL('image/png');
          const origResult  = await _fs.saveFile(`${imagesFolderPath}/original.png`, origDataURL);
          if (origResult.success) console.log('✅ original.png guardado');
          else console.warn('⚠️ No se pudo guardar original.png:', origResult.error);
        } catch (origErr) {
          console.warn('⚠️ Error al guardar original.png:', origErr.message);
        }
      } else {
        console.warn('⚠️ Sin imagen fuente disponible para guardar original.png');
      }

    } catch (error) {
      console.error('❌ Error guardando imágenes:', error);
      console.error('📍 Stack:', error.stack);
    }
  }
  
  // Nueva función: Actualizar resumen.csv del proyecto
  async updateProjectSummaryCSV() {
    if (!this.activeProject || !this.activeProject.folderPath) return;
    const _fs = _getFsAdapter();
    if (!_fs) return; // Sin adaptador, operación silenciosamente omitida
    
    try {
      const headers = [
        'ID',
        'Nombre',
        'Fecha',
        'Modo',
        'Cara',
        'MedidaPrincipal',
        'Unidad',
        'Perimetro',
        'Circularidad',
        'Elongacion',
        'Forma',
        'TotalPH',
        'Porosidad',
        'Carpeta'
      ];
      
      const rows = [headers.join(',')];
      
      for (const analysis of this.activeProject.analyses) {
        const data = analysis.data || {};
        const metricas = data.metricas || {};
        const resumen = analysis.metricasResumen || _extractAnalysisSummary(data);
        const row = [
          analysis.id,
          data.nombreObjeto || analysis.nombreObjeto || 'SinNombre',
          new Date(analysis.timestamp).toLocaleDateString('es-ES'),
          analysis.modo || _normalizeAnalysisMode(data),
          analysis.cara || _normalizeAnalysisCara(data),
          resumen.area || 0,
          resumen.medidaUnidad || 'mm²',
          resumen.perimetro || metricas.perimeter || 0,
          resumen.circularidad || metricas.circularity || 0,
          resumen.elongacion || metricas.elongation || 0,
          resumen.clasificacionForma || 'sin_clasificar',
          (resumen.numPerforaciones || 0) + (resumen.numHoradaciones || 0),
          resumen.porosidad || metricas.porosidad || 0,
          analysis.carpeta || 'N/A'
        ];
        rows.push(row.join(','));
      }
      
      const csvPath = `${this.activeProject.folderPath}/resumen.csv`;
      await _fs.saveFile(csvPath, rows.join('\n'));
      console.log('  ✅ resumen.csv actualizado');
    } catch (error) {
      console.warn('Error actualizando resumen.csv:', error);
    }
  }
  
  // Convertir análisis a formato CSV detallado
  analysisToCSV(data) {
    const rows = [];
    const metricas = data?.metricas || {};
    const objeto = data?.objeto || {};
    const perforaciones = data?.perforaciones || [];
    const horadaciones = data?.horadaciones || [];
    
    // ========================================================================
    // METADATOS DEL PROYECTO (si existe proyecto activo)
    // ========================================================================
    if (this.activeProject) {
      rows.push('# PROYECTO');
      rows.push(`Nombre del Proyecto,${this.activeProject.name || 'N/A'}`);
      if (this.activeProject.descripcion) {
        rows.push(`Descripcion,${this.activeProject.descripcion}`);
      }
      if (this.activeProject.sitio) {
        rows.push(`Sitio Arqueologico,${this.activeProject.sitio}`);
      }
      if (this.activeProject.investigadorResponsable) {
        rows.push(`Investigador Responsable,${this.activeProject.investigadorResponsable}`);
      }
      if (this.activeProject.institucionResponsable) {
        rows.push(`Institucion Responsable,${this.activeProject.institucionResponsable}`);
      }
      rows.push('');  // Línea en blanco separadora
    }
    
    // Encabezados de métricas
    rows.push('Categoria,Metrica,Valor,Unidad,Descripcion');
    
    // ========================================================================
    // I. (01) CLASIFICACIÓN MORFOLÓGICA
    // ========================================================================
    rows.push(`01_Clasificacion,ID del Objeto,${objeto.id || metricas.object_id || 'N/A'},,Identificador único`);
    rows.push(`01_Clasificacion,Numero Objeto,${objeto.numeroObjeto || metricas.numero_objeto || 'N/A'},,Número asignado`);
    if (objeto.cara) {
      rows.push(`01_Clasificacion,Cara,${objeto.cara === 'A' ? 'Anverso (A)' : 'Reverso (B)'},,Cara del objeto bifacial`);
    }
    rows.push(`01_Clasificacion,Meta-Clasificacion Geometrica,${metricas.forma_detectada || 'N/A'},,Síntesis de 6 métodos`);
    rows.push(`01_Clasificacion,Confianza Clasificacion,${metricas.forma_confianza_global || ((metricas.forma_confianza || 0) * 100).toFixed(1)},%,Nivel de certeza`);
    rows.push(`01_Clasificacion,Metodos Coincidentes,${metricas.forma_metodos_coincidentes || 'N/A'},,Métodos que coinciden`);
    rows.push(`01_Clasificacion,Categoria Base,${metricas.forma_categoria_base || 'N/A'},,Categoría morfológica`);
    // Confianza de DETECCIÓN (distinta de la clasificación de forma): fiabilidad
    // de la detección automática del objeto (contraste de borde + extent),
    // cableada desde detect() Python. N/A si vino de detección JS/manual/3D.
    {
      const _detConf = (typeof metricas.detection_confidence === 'number')
        ? metricas.detection_confidence
        : (typeof objeto._confidence === 'number' ? objeto._confidence : null);
      const _detLvl = metricas.detection_confidence_level || objeto._confidenceLvl || 'N/A';
      const _detConfPct = (_detConf != null) ? (_detConf * 100).toFixed(0) : 'N/A';
      rows.push(`01_Clasificacion,Confianza Deteccion,${_detConfPct},%,Fiabilidad de la deteccion automatica - nivel ${_detLvl}`);
    }
    if (metricas.patron_agrupamiento && metricas.patron_agrupamiento !== 'N/A') {
      rows.push(`01_Clasificacion,Patron Agrupamiento,${metricas.patron_agrupamiento},,${metricas.patron_agrupamiento_detalles || 'Patrón P/H'}`);
      rows.push(`01_Clasificacion,Sintesis Final,${metricas.clasificacion_sintesis_final || 'N/A'},,Clasificación integrada`);
    }
    
    // ========================================================================
    // II. (02) DIMENSIONES MÉTRICAS DEL OBJETO
    // ========================================================================
    rows.push(`02_Dimensiones,Area Total,${metricas.area || 0},mm²,Área total del objeto`);
    rows.push(`02_Dimensiones,Perimetro,${metricas.perimeter || 0},mm,Perímetro del contorno`);
    rows.push(`02_Dimensiones,Ancho BB Ajustado,${metricas.tight_width || metricas.width || 0},mm,Ancho del bounding box ajustado`);
    rows.push(`02_Dimensiones,Alto BB Ajustado,${metricas.tight_height || metricas.height || 0},mm,Alto del bounding box ajustado`);
    rows.push(`02_Dimensiones,Ancho BB Original,${metricas.bounding_width || 0},mm,Ancho del bounding box original`);
    rows.push(`02_Dimensiones,Alto BB Original,${metricas.bounding_height || 0},mm,Alto del bounding box original`);
    rows.push(`02_Dimensiones,Puntos Contorno,${metricas.contour_points || 0},,Resolución del contorno`);
    
    // ========================================================================
    // VIII. (08) ESTADO DE CONSERVACIÓN Y FRAGMENTACIÓN
    // ========================================================================
    rows.push(`08_Conservacion,Area Fragmentada,${metricas.area_fragmentada || 0},mm²,Área del contorno real`);
    rows.push(`08_Conservacion,Perimetro Fragmentado,${metricas.perimeter_fragmentado || 0},mm,Perímetro del contorno real`);
    rows.push(`08_Conservacion,Perdida Area,${metricas.perdida_area_fragmentacion_percent || 0},%,% de área perdida por fragmentación`);
    rows.push(`08_Conservacion,Perdida Perimetro,${metricas.perdida_perimetro_fragmentacion_percent || 0},%,% de perímetro perdido`);
    rows.push(`08_Conservacion,Completitud Estimada,${metricas.completitud_estimada || 0},%,Estimación de integridad`);
    rows.push(`08_Conservacion,Tipo Fragmento,${metricas.completitud_tipo_fragmento || 'N/A'},,Clasificación del fragmento`);
    rows.push(`08_Conservacion,Cobertura Angular,${metricas.completitud_cobertura_grados || 0},grados,Cobertura angular del contorno`);
    rows.push(`08_Conservacion,Circularidad s-Fragmentacion,${metricas.circularity_fragmentada || 0},,Circularidad sobre contorno real`);
    rows.push(`08_Conservacion,Compacidad s-Fragmentacion,${metricas.compactness_fragmentada || 0},,Compacidad sobre contorno real`);
    rows.push(`08_Conservacion,Rectangularidad s-Fragmentacion,${metricas.rectangularity_fragmentada || 0},,Rectangularidad sobre contorno real`);
    rows.push(`08_Conservacion,Factor Forma s-Fragmentacion,${metricas.shape_factor_fragmentado || 0},,Factor de forma sobre contorno real`);
    
    // ========================================================================
    // III. (03) PROPORCIONES Y FORMA GLOBAL
    // ========================================================================
    rows.push(`03_Proporciones,Circularidad,${metricas.circularity || 0},,1.0 = círculo perfecto`);
    rows.push(`03_Proporciones,Compacidad,${metricas.compactness || 0},,Relación área/perímetro²`);
    rows.push(`03_Proporciones,Solidez,${metricas.solidity || 0},,Área real / área hull`);
    rows.push(`03_Proporciones,Clasificacion Solidez,${metricas.solidity_class || 'N/A'},,Estado de conservación`);
    rows.push(`03_Proporciones,Rectangularidad,${metricas.rectangularity || 0},,Similitud con rectángulo`);
    rows.push(`03_Proporciones,Elongacion,${metricas.elongation || 0},,Grado de alargamiento`);
    rows.push(`03_Proporciones,Factor de Forma,${metricas.shape_factor || metricas.shape_factor_real || 0},,Perímetro² / (4π × área)`);
    rows.push(`03_Proporciones,Relacion de Aspecto (AR),${metricas.aspect_ratio || metricas.aspect_ratio_tight || 0},,Eje mayor / eje menor`);
    rows.push(`03_Proporciones,Excentricidad,${metricas.excentricidad || metricas.eccentricity || 0},,0.0 = círculo, 1.0 = línea`);
    
    // ========================================================================
    // VI. (06) ORIENTACIÓN Y POSICIÓN ESPACIAL
    // ========================================================================
    rows.push(`06_Orientacion,Eje Mayor Longitud,${metricas.eje_mayor_real_longitud || metricas.eje_mayor || 0},mm,Dimensión máxima`);
    rows.push(`06_Orientacion,Eje Menor Longitud,${metricas.eje_menor_real_longitud || metricas.eje_menor || 0},mm,Dimensión mínima`);
    rows.push(`06_Orientacion,Angulo Principal,${metricas.eje_principal_angulo || 0},grados,Orientación del eje mayor`);
    rows.push(`06_Orientacion,Orientacion,${metricas.eje_principal_orientacion || 'N/A'},,Clasificación direccional`);
    rows.push(`06_Orientacion,Anisotropia,${metricas.eje_principal_anisotropia || 0},,Grado de asimetría direccional`);
    rows.push(`06_Orientacion,Forma Dominante,${metricas.eje_principal_forma_dominante || 'N/A'},,Basado en relación de ejes`);
    
    // ========================================================================
    // IV. (04) REGULARIDAD DEL CONTORNO
    // ========================================================================
    rows.push(`04_Regularidad,Radio Maximo,${metricas.radio_maximo || 0},mm,Mayor distancia desde centroide`);
    rows.push(`04_Regularidad,Radio Minimo,${metricas.radio_minimo || 0},mm,Menor distancia desde centroide`);
    rows.push(`04_Regularidad,Radio Medio,${metricas.radio_medio || 0},mm,Promedio de distancias`);
    rows.push(`04_Regularidad,Ratio de Radios,${metricas.ratio_radios || 0},,Min/Max`);
    rows.push(`04_Regularidad,Regularidad Radial,${metricas.regularidad_radial || 0},,Uniformidad radial`);
    rows.push(`04_Regularidad,Desviacion Radial,${metricas.desviacion_radial || 0},mm,Variabilidad de distancias`);
    rows.push(`04_Regularidad,Coef Variacion,${metricas.coeficiente_variacion_radial || 0},%,CV radial`);
    
    // ========================================================================
    // V. (05) RUGOSIDAD Y COMPLEJIDAD DEL BORDE
    // ========================================================================
    rows.push(`05_Rugosidad,Rugosidad,${metricas.rugosidad_contorno || 0},,Irregularidad del borde`);
    rows.push(`05_Rugosidad,Clasificacion Rugosidad,${metricas.rugosidad_clasificacion || 'N/A'},,Categoría de rugosidad`);
    rows.push(`05_Rugosidad,Longitud Media Segmento,${metricas.rugosidad_longitud_segmento_media || 0},mm,Tamaño promedio segmentos`);
    rows.push(`05_Rugosidad,Desviacion Segmentos,${metricas.rugosidad_desviacion || 0},mm,Variabilidad en longitudes`);
    rows.push(`05_Rugosidad,Indice Complejidad,${metricas.contour_complexity_index || 0},,1.0 = círculo, >2.0 = muy complejo`);
    
    // ========================================================================
    // V-b. (05) ANÁLISIS DE CURVATURA
    // ========================================================================
    rows.push(`05_Rugosidad,Curvatura Media,${metricas.curvatura_media || 0},,Promedio de curvatura local`);
    rows.push(`05_Rugosidad,Curvatura Maxima,${metricas.curvatura_maxima || 0},,Punto de mayor curvatura`);
    rows.push(`05_Rugosidad,Desviacion Curvatura,${metricas.curvatura_desviacion || 0},,Variabilidad en curvatura`);
    rows.push(`05_Rugosidad,Puntos Inflexion,${metricas.curvatura_puntos_inflexion || 0},,Cambios de concavidad`);
    rows.push(`05_Rugosidad,Puntos Esquina,${metricas.curvatura_puntos_esquina || 0},,Ángulos pronunciados`);
    rows.push(`05_Rugosidad,Clasificacion Suavidad,${metricas.curvatura_clasificacion || 'N/A'},,Suavidad del contorno`);
    rows.push(`05_Rugosidad,Energia Curvatura,${metricas.energia_curvatura || 0},,Suma de curvaturas²`);
    rows.push(`05_Rugosidad,Clasificacion Energia,${metricas.energia_clasificacion || 'N/A'},,Nivel de sinuosidad`);

    // V-c. (05) TEXTURA DE SUPERFICIE — Sección XIV (píxeles internos)
    rows.push(`05_Rugosidad,Varianza Interna,${metricas.varianza_interna ?? 'N/D'},,Dispersión tonal interna — bajo=homogéneo/pulido, alto=heterogéneo/estriado`);
    rows.push(`05_Rugosidad,Entropia Superficie,${metricas.entropia_superficie ?? 'N/D'},,Complejidad tonal [bits] — bajo=uniforme, alto=diverso`);
    rows.push(`05_Rugosidad,Gradiente Medio,${metricas.gradiente_medio ?? 'N/D'},,Bordes internos (Sobel) — bajo=liso, alto=costillas/estrías`);
    // XV. Control de calidad del contorno
    rows.push(`05_Rugosidad,Contorno Refinado por Textura,${metricas._contorno_refinado_por_textura ? 'true' : 'false'},,Sec.XV: true=máscara refinada adaptativamente antes de extraer contorno`);
    
    // ========================================================================
    // IV-b. (04) ENVOLVENTE CONVEXA (CONVEX HULL)
    // ========================================================================
    rows.push(`04_Regularidad,Area Hull,${metricas.hull_area_px || metricas.convex_hull_area || 0},px²,Área envolvente convexa`);
    rows.push(`04_Regularidad,Perimetro Hull,${metricas.hull_perimeter_px || metricas.convex_hull_perimeter || 0},px,Perímetro envolvente`);
    rows.push(`04_Regularidad,Ancho Hull,${metricas.hull_width_px || 0},px,Ancho mínimo envolvente`);
    rows.push(`04_Regularidad,Alto Hull,${metricas.hull_height_px || 0},px,Alto mínimo envolvente`);
    rows.push(`04_Regularidad,Circularidad Hull,${metricas.hull_circularity || 0},,Circularidad del hull`);
    rows.push(`04_Regularidad,Relacion Aspecto Hull (AR),${metricas.hull_aspect_ratio || 0},,Relación eje mayor/eje menor del hull`);
    rows.push(`04_Regularidad,Convexidad,${metricas.convexity || metricas.convexidad || 0},,1.0 = totalmente convexo`);
    rows.push(`04_Regularidad,Clasificacion Convexidad,${metricas.convexity_class || metricas.convexidad_class || 'N/A'},,Estado de convexidad`);
    rows.push(`04_Regularidad,Diferencia Area,${metricas.hull_area_difference_percent || 0},%,Hull vs real`);
    rows.push(`04_Regularidad,Diferencia Perimetro,${metricas.hull_perimeter_difference_percent || 0},%,Hull vs real`);
    rows.push(`04_Regularidad,Numero Puntos Hull,${metricas.hull_points || metricas.convex_hull_points || 0},,Vértices del hull`);
    
    // ========================================================================
    // VI-b. (06) SIMETRÍA BILATERAL
    // ========================================================================
    rows.push(`06_Orientacion,Simetria Bilateral,${metricas.simetria_bilateral || 0},,1.0 = perfectamente simétrico`);
    rows.push(`06_Orientacion,Clasificacion Simetria,${metricas.simetria_clasificacion || 'N/A'},,Nivel de simetría`);
    rows.push(`06_Orientacion,Distancia Asimetria,${metricas.simetria_distancia_asimetria || 0},mm,Desplazamiento del eje`);
    
    // ========================================================================
    // XII-a. (12) CARACTERÍSTICAS GEOMÉTRICAS AVANZADAS (FERET, ESTRELLAMIENTO)
    // ========================================================================
    rows.push(`12_Sintesis,Indice Estrellamiento,${metricas.indice_estrellamiento || 0},,Medida de puntas/protuberancias`);
    rows.push(`12_Sintesis,Clasificacion Estrellamiento,${metricas.estrellamiento_clasificacion || metricas.clasificacion_estrellamiento || 'N/A'},,Categoría estrellamiento`);
    rows.push(`12_Sintesis,Indice Lobularidad,${metricas.indice_lobularidad || 0},,Medida de lóbulos/ondulaciones`);
    rows.push(`12_Sintesis,Clasificacion Lobularidad,${metricas.lobularidad_clasificacion || metricas.clasificacion_lobularidad || 'N/A'},,Categoría lobularidad`);
    rows.push(`12_Sintesis,Diametro Feret Maximo,${metricas.feret_max || 0},mm,Mayor distancia paralela`);
    rows.push(`12_Sintesis,Diametro Feret Minimo,${metricas.feret_min || 0},mm,Menor distancia paralela`);
    rows.push(`12_Sintesis,Ratio Feret,${metricas.feret_ratio || 0},,Relación Feret Max/Min`);
    rows.push(`12_Sintesis,Clasificacion Feret,${metricas.feret_clasificacion || metricas.clasificacion_feret || 'N/A'},,Categoría según ratio`);
    rows.push(`12_Sintesis,Angulo Feret Max,${metricas.feret_angulo_max || metricas.feret_max_angle || 0},grados,Ángulo diámetro máximo`);
    rows.push(`12_Sintesis,Angulo Feret Min,${metricas.feret_angulo_min || metricas.feret_min_angle || 0},grados,Ángulo diámetro mínimo`);
    
    // ========================================================================
    // VII. (07) GEOMETRÍA DE VÉRTICES
    // ========================================================================
    rows.push(`07_Vertices,Numero Vertices,${metricas.vertices_aproximados || 0},,Vértices detectados`);
    rows.push(`07_Vertices,Angulo Medio,${metricas.angulo_medio_vertices || 0},grados,Promedio ángulos internos`);
    rows.push(`07_Vertices,Angulo Predominante,${metricas.angulo_predominante || 0},grados,Ángulo más frecuente`);
    rows.push(`07_Vertices,Desviacion Angulos,${metricas.desviacion_angulos || 0},grados,Variabilidad angular`);
    rows.push(`07_Vertices,Angulos Rectos,${metricas.num_angulos_rectos || 0},,Esquinas 85-95°`);
    rows.push(`07_Vertices,Angulos Agudos,${metricas.num_angulos_agudos || 0},,Puntas <85°`);
    rows.push(`07_Vertices,Angulos Obtusos,${metricas.num_angulos_obtusos || 0},,Esquinas >95°`);
    rows.push(`07_Vertices,Geometria Inferida,${metricas.geometria_vertices || 'N/A'},,Basado en ángulos`);
    
    // ========================================================================
    // III-b. (03) FORMA 3D INFERIDA
    // ========================================================================
    rows.push(`03_Proporciones,Esfericidad,${metricas.esfericidad || 0},,1.0 = esférico perfecto`);
    rows.push(`03_Proporciones,Forma 3D Inferida,${metricas.forma_3d_inferida || 'N/A'},,Clasificación 3D`);
    rows.push(`03_Proporciones,Oblongacion,${metricas.oblongacion || 0},,Grado alargamiento 3D`);
    rows.push(`03_Proporciones,Clasificacion Oblongacion,${metricas.oblongacion_clasificacion || 'N/A'},,Categoría oblongación`);
    rows.push(`03_Proporciones,Aplanamiento Inferido,${metricas.aplanamiento_inferido || 'N/A'},,Grado de aplanamiento`);
    
    // ========================================================================
    // VI-c. (06) CENTROIDE Y POSICIÓN ESPACIAL
    // ========================================================================
    rows.push(`06_Orientacion,Centroide X,${metricas.centroide_x || 0},px,Coordenada X centro real`);
    rows.push(`06_Orientacion,Centroide Y,${metricas.centroide_y || 0},px,Coordenada Y centro real`);
    rows.push(`06_Orientacion,Centroide Hull X,${metricas.centroide_hull_x || 0},px,Coordenada X centro hull`);
    rows.push(`06_Orientacion,Centroide Hull Y,${metricas.centroide_hull_y || 0},px,Coordenada Y centro hull`);
    
    // ========================================================================
    // I-b. (01) CLASIFICACIÓN MORFOLÓGICA — DETALLE POR MÉTODO
    // ========================================================================
    rows.push(`01_Clasificacion,Forma Detectada Meta,${metricas.forma_detectada_meta || metricas.forma_detectada || 'N/A'},,Meta-clasificación final`);
    rows.push(`01_Clasificacion,Categoria Base (Metodos),${metricas.forma_categoria_base || 'N/A'},,Categoría general`);
    rows.push(`01_Clasificacion,Confianza Global,${metricas.forma_confianza_global || ((metricas.forma_confianza || 0) * 100).toFixed(1)},%,Certeza de clasificación`);
    rows.push(`01_Clasificacion,Metodos Coincidentes (Det),${metricas.forma_metodos_coincidentes || 'N/A'},,Consenso entre métodos`);
    rows.push(`01_Clasificacion,Clase Circularidad,${metricas.shape_class_circularity || 'N/A'},,Por circularidad`);
    rows.push(`01_Clasificacion,Clase Relacion Aspecto (AR),${metricas.shape_class_aspect || 'N/A'},,Por relación de aspecto`);
    
    // ========================================================================
    // XI. (11) ANÁLISIS COMPARATIVO OBJETO–P/H
    // ========================================================================
    if (metricas.patron_agrupamiento && metricas.patron_agrupamiento !== 'N/A') {
      rows.push(`11_ComparativoPH,Patron Detectado,${metricas.patron_agrupamiento},,Clasificación patrón P/H`);
      rows.push(`11_ComparativoPH,Tipo Patron,${metricas.patron_agrupamiento_patron || 'N/A'},,Tipo específico`);
      rows.push(`11_ComparativoPH,Detalles,${metricas.patron_agrupamiento_detalles || 'N/A'},,Información adicional`);
      rows.push(`11_ComparativoPH,Confianza,${metricas.patron_agrupamiento_confianza || 0},%,Certeza del patrón`);
    }
    
    // ========================================================================
    // XII-d. (12) SÍNTESIS FINAL INTEGRADA
    // ========================================================================
    rows.push(`12_Sintesis,Clasificacion Integrada,${metricas.clasificacion_sintesis_final || metricas.forma_detectada || 'N/A'},,Forma + Patrón P/H`);
    
    // ========================================================================
    // XII-c. (12) CLASIFICACIONES COMPLEMENTARIAS
    // ========================================================================
    rows.push(`12_Sintesis,Clase Compacidad,${metricas.shape_class_compactness || 'N/A'},,Por compacidad`);
    rows.push(`12_Sintesis,Clase Solidez,${metricas.shape_class_solidity || metricas.solidity_class || 'N/A'},,Por solidez`);
    rows.push(`12_Sintesis,Clase Complejidad,${metricas.shape_class_complexity || 'N/A'},,Por complejidad`);
    rows.push(`12_Sintesis,Clase Convexidad,${metricas.convexity_class || 'N/A'},,Por convexidad`);
    rows.push(`12_Sintesis,Clase Fragmentacion,${metricas.completitud_tipo_fragmento || metricas.tipo_fragmento || 'N/A'},,Por fragmentación`);
    
    // ========================================================================
    // XI-b. (11) MÉTRICAS DE DISTRIBUCIÓN Y CONTEXTO P/H
    // ========================================================================
    rows.push(`11_ComparativoPH,Shape Factor,${metricas.shape_factor_real || metricas.shape_factor || 0},,1.0 = círculo perfecto`);
    rows.push(`11_ComparativoPH,Excentricidad,${metricas.excentricidad || metricas.eccentricity || 0},,0.0 = círculo, 1.0 = línea`);
    rows.push(`11_ComparativoPH,Eficiencia BB,${metricas.bounding_box_efficiency || 0},,Ajuste en bounding box`);
    rows.push(`11_ComparativoPH,Rectangularidad,${metricas.rectangularity || 0},,Similitud rectángulo`);
    rows.push(`11_ComparativoPH,Elongacion,${metricas.elongation || 0},,Grado alargamiento`);
    rows.push(`11_ComparativoPH,Porosidad,${metricas.porosidad || 0},%,% área con P/H`);
    rows.push(`11_ComparativoPH,Total Perforaciones,${perforaciones.length},,Número perforaciones`);
    rows.push(`11_ComparativoPH,Total Horadaciones,${horadaciones.length},,Número horadaciones`);
    rows.push(`11_ComparativoPH,Metodo Analisis,${metricas.analysis_method || 'No especificado'},,Método usado`);
    rows.push(`11_ComparativoPH,Timestamp,${metricas.analysis_timestamp || 'N/A'},,Fecha y hora`);
    
    // ========================================================================
    // IX. (09) INCERTIDUMBRE ÓPTICA POSICIONAL (distorsión de lente)
    // ========================================================================
    if (metricas.error_optico_lineal_percent !== undefined) {
      rows.push(`09_Incertidumbre,Error Lineal (est.),${metricas.error_optico_lineal_percent},%,Incertidumbre en medidas lineales por posición en imagen`);
      rows.push(`09_Incertidumbre,Error Area (est.),${metricas.error_optico_area_percent},%,Incertidumbre en área por posición en imagen`);
      rows.push(`09_Incertidumbre,Error Distorsion,${metricas.error_distorsion_percent},%,Componente de distorsión radial del lente`);
      rows.push(`09_Incertidumbre,Error Perspectiva,${metricas.error_perspectiva_percent},%,Componente de perspectiva (objeto fuera del eje)`);
      rows.push(`09_Incertidumbre,Posicion Radial,${metricas.posicion_radial_norm},,0=centro de imagen 1=borde horizontal`);
      rows.push(`09_Incertidumbre,Angulo Optico,${metricas.angulo_optico_deg},grados,Ángulo real respecto al eje óptico`);
      rows.push(`09_Incertidumbre,k1 Estimado,${metricas.k1_estimado},,Coef. distorsion radial empirico (sin calibracion)`);
      rows.push(`09_Incertidumbre,FOV Diagonal,${metricas.fov_diagonal_deg},grados,Campo visual diagonal del lente`);
      rows.push(`09_Incertidumbre,Confianza Optica,${metricas.confianza_optica},,Categoria de incertidumbre optica`);
      rows.push(`09_Incertidumbre,Nota Metodologica,${metricas.nota_error_optico || ''},,Advertencia sobre el modelo estimado`);
    }

    // ========================================================================
    // IX-b. (09) INCERTIDUMBRES PROPAGADAS — bandas ± sobre cada métrica absoluta
    // ========================================================================
    // Generadas por aplicarIncertidumbreOptica(). Sólo aparecen si el error
    // óptico pudo calcularse. Las métricas dimensionless (ratios en px) NO
    // tienen incertidumbre óptica asociada — NO aparecen aquí.
    // ========================================================================
    if (metricas._incertidumbre_optica_aplicada) {
      const eL = metricas.error_optico_lineal_percent;
      const eA = metricas.error_optico_area_percent;
      rows.push(`09_Incertidumbre,NOTA,,,"Rangos ±: error óptico posicional. Lineales=${eL}%  Área=${eA}%. Ratios (circularity etc.) NO afectados."`);
      // Métricas de área (mm²)
      for (const k of ['area','area_fragmentada']) {
        const v = metricas[k];
        const e = metricas[`${k}_incertidumbre_abs`];
        if (v !== undefined && e !== undefined) {
          const mn = metricas[`${k}_rango_min`];
          const mx = metricas[`${k}_rango_max`];
          rows.push(`09_Incertidumbre,${k},${v},mm²,"±${e} mm² | rango [${mn} – ${mx}] mm²"`);
        }
      }
      // Métricas lineales (mm)
      for (const k of ['perimeter','width','height','eje_mayor','eje_menor','radio_maximo','radio_minimo','radio_medio','feret_max','feret_min','perimeter_fragmentado']) {
        const v = metricas[k];
        const e = metricas[`${k}_incertidumbre_abs`];
        if (v !== undefined && e !== undefined) {
          const mn = metricas[`${k}_rango_min`];
          const mx = metricas[`${k}_rango_max`];
          rows.push(`09_Incertidumbre,${k},${v},mm,"±${e} mm | rango [${mn} – ${mx}] mm"`);
        }
      }
      rows.push(`09_Incertidumbre,metricas_no_afectadas,${metricas._metricas_no_afectadas || 'circularity compactness rectangularity elongation solidity'},,Ratios puros (adimensionales) - error de escala cancela`);
    }
    
    // ========================================================================
    // 20. PERFORACIONES (detalle completo con 20 métricas por perforación)
    // ========================================================================
    if (perforaciones.length > 0) {
      perforaciones.forEach((p, idx) => {
        const id = p.id || (idx + 1);
        const m = p.metricas || {};
        
        // Dimensiones básicas
        rows.push(`20_Perforacion_P${id},1_Area,${parseFloat(m.area || p.area) || 0},mm²,Área de la perforación`);
        rows.push(`20_Perforacion_P${id},2_Perimetro,${parseFloat(m.perimeter || p.perimetro) || 0},mm,Perímetro`);
        rows.push(`20_Perforacion_P${id},3_Ancho,${parseFloat(m.width || m.ancho) || 0},mm,Ancho (bounding box)`);
        rows.push(`20_Perforacion_P${id},4_Alto,${parseFloat(m.height || m.alto) || 0},mm,Alto (bounding box)`);
        rows.push(`20_Perforacion_P${id},5_Dimensiones,${(parseFloat(m.width || m.ancho) || 0).toFixed(2)}x${(parseFloat(m.height || m.alto) || 0).toFixed(2)},mm,Ancho × Alto`);
        
        // Centroide
        rows.push(`20_Perforacion_P${id},6_Centroide_X,${parseFloat(m.centroide_x || m.centroid?.[0]) || 0},px,Coordenada X del centro`);
        rows.push(`20_Perforacion_P${id},7_Centroide_Y,${parseFloat(m.centroide_y || m.centroid?.[1]) || 0},px,Coordenada Y del centro`);
        
        // Análisis radial
        rows.push(`20_Perforacion_P${id},8_Radio_Maximo,${parseFloat(m.radio_maximo) || 0},mm,Radio máximo desde centroide`);
        rows.push(`20_Perforacion_P${id},9_Radio_Minimo,${parseFloat(m.radio_minimo) || 0},mm,Radio mínimo desde centroide`);
        rows.push(`20_Perforacion_P${id},10_Radio_Medio,${parseFloat(m.radio_medio) || 0},mm,Radio promedio`);
        rows.push(`20_Perforacion_P${id},11_Ratio_Radios,${parseFloat(m.ratio_radios) || 0},,Min/Max (1.0 = circular)`);
        rows.push(`20_Perforacion_P${id},12_Regularidad_Radial,${parseFloat(m.regularidad_radial) || 0},,Uniformidad de radios`);
        
        // Ejes
        rows.push(`20_Perforacion_P${id},13_Eje_Mayor,${parseFloat(m.eje_mayor) || 0},mm,Eje mayor de la elipse`);
        rows.push(`20_Perforacion_P${id},14_Eje_Menor,${parseFloat(m.eje_menor) || 0},mm,Eje menor de la elipse`);
        rows.push(`20_Perforacion_P${id},15_Excentricidad,${parseFloat(m.excentricidad) || 0},,0.0=círculo, 1.0=línea`);
        
        // Índices de forma
        rows.push(`20_Perforacion_P${id},16_Circularidad,${parseFloat(m.circularity || m.circularidad) || 0},,1.0 = círculo perfecto`);
        rows.push(`20_Perforacion_P${id},17_Compacidad,${parseFloat(m.compactness || m.compacidad) || 0},,Relación área/perímetro²`);
        rows.push(`20_Perforacion_P${id},18_Solidez,${parseFloat(m.solidity || m.solidez) || 0},,Área real / área hull`);
        rows.push(`20_Perforacion_P${id},19_Convexidad,${parseFloat(m.convexity || m.convexidad) || 0},,1.0 = totalmente convexo`);
        rows.push(`20_Perforacion_P${id},20_Relacion_Aspecto_AR,${parseFloat(m.aspect_ratio) || 0},,Eje mayor / eje menor`);
        
        // Ubicación
        rows.push(`20_Perforacion_P${id},21_Distancia_Centro,${parseFloat(p.distanciaAlCentro) || 0},mm,Distancia al centroide del objeto`);
        // Análisis complementario (disponible en Ruta A — trazado de polígono)
        rows.push(`20_Perforacion_P${id},22_Desviacion_Radial,${parseFloat(m.desviacion_radial) || 0},mm,Desviación estándar de los radios`);
        rows.push(`20_Perforacion_P${id},23_Coef_Variacion_Radial,${parseFloat(m.coeficiente_variacion_radial) || 0},%,CV radial — heterogeneidad de forma`);
        rows.push(`20_Perforacion_P${id},24_Vertices_Aprox,${parseInt(m.vertices_aproximados) || 0},,Vértices del polígono (hull)`);
        rows.push(`20_Perforacion_P${id},25_Forma_Detectada,${m.forma_detectada || '—'},,Clasificación morfológica automática`);
        rows.push(`20_Perforacion_P${id},26_Confianza_Forma,${parseFloat(m.forma_confianza) || 0},,Nivel de confianza 0–1`);
        rows.push(`20_Perforacion_P${id},27_Shape_Factor,${parseFloat(m.shape_factor) || 0},,Perímetro² / (4π·Área) — 1.0=círculo`);
        rows.push(`20_Perforacion_P${id},28_Rectangularidad,${parseFloat(m.rectangularity) || 0},,Área / Área-BB — 1.0=rellena bounding box`);
        rows.push(`20_Perforacion_P${id},29_Elongacion,${parseFloat(m.elongation) || 0},,0.0=isométrica, 1.0=muy elongada`);
        rows.push(`20_Perforacion_P${id},30_Feret_Max,${parseFloat(m.feret_max) || 0},mm,Diámetro de Feret máximo`);
        rows.push(`20_Perforacion_P${id},31_Feret_Min,${parseFloat(m.feret_min) || 0},mm,Diámetro de Feret mínimo`);
        rows.push(`20_Perforacion_P${id},32_Feret_Ratio,${parseFloat(m.feret_ratio) || 0},,Mín/Máx — 1.0=isotrópico`);
        rows.push(`20_Perforacion_P${id},33_Feret_Angulo_Max,${parseFloat(m.feret_angulo_max) || 0},°,Orientación eje mayor`);
        rows.push(`20_Perforacion_P${id},34_Feret_Angulo_Min,${parseFloat(m.feret_angulo_min) || 0},°,Orientación eje menor`);
      });
    }
    
    // ========================================================================
    // 21. HORADACIONES (detalle completo con 20 métricas por horadación)
    // ========================================================================
    if (horadaciones.length > 0) {
      horadaciones.forEach((h, idx) => {
        const id = h.id || (idx + 1);
        const m = h.metricas || {};
        
        // Dimensiones básicas
        rows.push(`21_Horadacion_H${id},1_Area,${parseFloat(m.area || h.area) || 0},mm²,Área de la horadación`);
        rows.push(`21_Horadacion_H${id},2_Perimetro,${parseFloat(m.perimeter || h.perimetro) || 0},mm,Perímetro`);
        rows.push(`21_Horadacion_H${id},3_Ancho,${parseFloat(m.width || m.ancho) || 0},mm,Ancho (bounding box)`);
        rows.push(`21_Horadacion_H${id},4_Alto,${parseFloat(m.height || m.alto) || 0},mm,Alto (bounding box)`);
        rows.push(`21_Horadacion_H${id},5_Dimensiones,${(parseFloat(m.width || m.ancho) || 0).toFixed(2)}x${(parseFloat(m.height || m.alto) || 0).toFixed(2)},mm,Ancho × Alto`);
        
        // Centroide
        rows.push(`21_Horadacion_H${id},6_Centroide_X,${parseFloat(m.centroide_x || m.centroid?.[0]) || 0},px,Coordenada X del centro`);
        rows.push(`21_Horadacion_H${id},7_Centroide_Y,${parseFloat(m.centroide_y || m.centroid?.[1]) || 0},px,Coordenada Y del centro`);
        
        // Análisis radial
        rows.push(`21_Horadacion_H${id},8_Radio_Maximo,${parseFloat(m.radio_maximo) || 0},mm,Radio máximo desde centroide`);
        rows.push(`21_Horadacion_H${id},9_Radio_Minimo,${parseFloat(m.radio_minimo) || 0},mm,Radio mínimo desde centroide`);
        rows.push(`21_Horadacion_H${id},10_Radio_Medio,${parseFloat(m.radio_medio) || 0},mm,Radio promedio`);
        rows.push(`21_Horadacion_H${id},11_Ratio_Radios,${parseFloat(m.ratio_radios) || 0},,Min/Max (1.0 = circular)`);
        rows.push(`21_Horadacion_H${id},12_Regularidad_Radial,${parseFloat(m.regularidad_radial) || 0},,Uniformidad de radios`);
        
        // Ejes
        rows.push(`21_Horadacion_H${id},13_Eje_Mayor,${parseFloat(m.eje_mayor) || 0},mm,Eje mayor de la elipse`);
        rows.push(`21_Horadacion_H${id},14_Eje_Menor,${parseFloat(m.eje_menor) || 0},mm,Eje menor de la elipse`);
        rows.push(`21_Horadacion_H${id},15_Excentricidad,${parseFloat(m.excentricidad) || 0},,0.0=círculo, 1.0=línea`);
        
        // Índices de forma
        rows.push(`21_Horadacion_H${id},16_Circularidad,${parseFloat(m.circularity || m.circularidad) || 0},,1.0 = círculo perfecto`);
        rows.push(`21_Horadacion_H${id},17_Compacidad,${parseFloat(m.compactness || m.compacidad) || 0},,Relación área/perímetro²`);
        rows.push(`21_Horadacion_H${id},18_Solidez,${parseFloat(m.solidity || m.solidez) || 0},,Área real / área hull`);
        rows.push(`21_Horadacion_H${id},19_Convexidad,${parseFloat(m.convexity || m.convexidad) || 0},,1.0 = totalmente convexo`);
        rows.push(`21_Horadacion_H${id},20_Relacion_Aspecto_AR,${parseFloat(m.aspect_ratio) || 0},,Eje mayor / eje menor`);
        
        // Ubicación
        rows.push(`21_Horadacion_H${id},21_Distancia_Centro,${parseFloat(h.distanciaAlCentro) || 0},mm,Distancia al centroide del objeto`);
        // Análisis complementario (disponible en Ruta A — trazado de polígono)
        rows.push(`21_Horadacion_H${id},22_Desviacion_Radial,${parseFloat(m.desviacion_radial) || 0},mm,Desviación estándar de los radios`);
        rows.push(`21_Horadacion_H${id},23_Coef_Variacion_Radial,${parseFloat(m.coeficiente_variacion_radial) || 0},%,CV radial — heterogeneidad de forma`);
        rows.push(`21_Horadacion_H${id},24_Vertices_Aprox,${parseInt(m.vertices_aproximados) || 0},,Vértices del polígono (hull)`);
        rows.push(`21_Horadacion_H${id},25_Forma_Detectada,${m.forma_detectada || '—'},,Clasificación morfológica automática`);
        rows.push(`21_Horadacion_H${id},26_Confianza_Forma,${parseFloat(m.forma_confianza) || 0},,Nivel de confianza 0–1`);
        rows.push(`21_Horadacion_H${id},27_Shape_Factor,${parseFloat(m.shape_factor) || 0},,Perímetro² / (4π·Área) — 1.0=círculo`);
        rows.push(`21_Horadacion_H${id},28_Rectangularidad,${parseFloat(m.rectangularity) || 0},,Área / Área-BB — 1.0=rellena bounding box`);
        rows.push(`21_Horadacion_H${id},29_Elongacion,${parseFloat(m.elongation) || 0},,0.0=isométrica, 1.0=muy elongada`);
        rows.push(`21_Horadacion_H${id},30_Feret_Max,${parseFloat(m.feret_max) || 0},mm,Diámetro de Feret máximo`);
        rows.push(`21_Horadacion_H${id},31_Feret_Min,${parseFloat(m.feret_min) || 0},mm,Diámetro de Feret mínimo`);
        rows.push(`21_Horadacion_H${id},32_Feret_Ratio,${parseFloat(m.feret_ratio) || 0},,Mín/Máx — 1.0=isotrópico`);
        rows.push(`21_Horadacion_H${id},33_Feret_Angulo_Max,${parseFloat(m.feret_angulo_max) || 0},°,Orientación eje mayor`);
        rows.push(`21_Horadacion_H${id},34_Feret_Angulo_Min,${parseFloat(m.feret_angulo_min) || 0},°,Orientación eje menor`);
      });
    }
    
    return rows.join('\n');
  }
  
  // Exportar proyecto como JSON
  async exportProject(id) {
    const project = this.projects.find(p => p.id === id);
    if (!project) {
      toast.error('Proyecto no encontrado');
      return;
    }
    const dataStr  = JSON.stringify(project, null, 2);
    const filename = `${project.name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
    if (window.electronAPI?.saveFileWithDialog) {
      const r = await window.electronAPI.saveFileWithDialog(filename, dataStr, 'json');
      if (r?.success) toast.success('Proyecto exportado correctamente');
      else if (!r?.canceled) toast.error('No se pudo guardar el proyecto.');
      return;
    }
    // Fallback navegador
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url      = URL.createObjectURL(dataBlob);
    const link     = document.createElement('a');
    link.href     = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast.success('Proyecto exportado correctamente');
  }
  
  // Importar proyecto desde JSON
  importProject(jsonData) {
    try {
      const project = JSON.parse(jsonData);
      
      // Validar estructura básica
      if (!project.name || !project.id) {
        throw new Error('Estructura de proyecto inválida');
      }
      
      // Generar nuevo ID para evitar conflictos
      project.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      project.importedAt = new Date().toISOString();
      
      this.projects.push(project);
      this.save();
      
      toast.success(`Proyecto "${project.name}" importado correctamente`);
      return project;
    } catch (error) {
      console.error('Error importando proyecto:', error);
      toast.error('Error al importar proyecto: archivo inválido');
      return null;
    }
  }
  
  // Obtener todos los proyectos
  getAllProjects() {
    return this.projects;
  }
  
  // Obtener proyecto por ID
  getProject(id) {
    return this.projects.find(p => p.id === id);
  }
  
  // ==================================================================================
  // SISTEMA DE RECUPERACIÓN DE COLECCIONES
  // ==================================================================================
  
  /**
   * Cargar análisis individual desde disco
   * @param {string} analysisFolderPath - Ruta completa a la carpeta del análisis
   * @returns {Object|null} Objeto de análisis reconstruido o null si hay error
   */
  async loadAnalysisFromDisk(analysisFolderPath) {
    try {
      console.log(`📂 Cargando análisis desde: ${analysisFolderPath}`);

      // Resolver electronAPI: ventana actual → ventana abriente → error
      const _api = window.electronAPI
        || (window.opener && window.opener.electronAPI)
        || null;
      if (!_api || typeof _api.readFile !== 'function') {
        throw new Error('electronAPI.readFile no disponible en esta ventana');
      }

      // 0. Verificar que la carpeta existe antes de intentar leer archivos
      if (typeof _api.folderExists === 'function') {
        const exists = await _api.folderExists(analysisFolderPath);
        if (!exists) {
          throw new Error(
            `La carpeta del análisis no existe en disco (posible guardado interrumpido): ${analysisFolderPath.split('/').pop()}`
          );
        }
      }

      // 1. Cargar los 4 archivos JSON principales
      const metadataResult = await _api.readFile(
        `${analysisFolderPath}/metadata.json`
      );
      if (!metadataResult.success) {
        throw new Error(`Error leyendo metadata.json: ${metadataResult.error}`);
      }
      
      const metricasResult = await _api.readFile(
        `${analysisFolderPath}/metricas.json`
      );
      if (!metricasResult.success) {
        throw new Error(`Error leyendo metricas.json: ${metricasResult.error}`);
      }
      
      const geometriaResult = await _api.readFile(
        `${analysisFolderPath}/geometria.json`
      );
      if (!geometriaResult.success) {
        throw new Error(`Error leyendo geometria.json: ${geometriaResult.error}`);
      }
      
      let metadata, metricas, geometria;
      try { metadata = JSON.parse(metadataResult.content); } catch { throw new Error('metadata.json corrupto o inválido'); }
      try { metricas  = JSON.parse(metricasResult.content);  } catch { throw new Error('metricas.json corrupto o inválido');  }
      try { geometria = JSON.parse(geometriaResult.content); } catch { throw new Error('geometria.json corrupto o inválido'); }

      // 📊 DIAGNÓSTICO: Verificar métricas cargadas desde disco
      console.log('📊 DIAGNÓSTICO - Métricas cargadas desde disco:', {
        totalPropiedades: Object.keys(metricas.objeto || {}).length,
        primeras10: Object.keys(metricas.objeto || {}).slice(0, 10),
        tieneCircularidad: metricas.objeto?.circularity !== undefined,
        tieneArea: metricas.objeto?.area !== undefined,
        tienePerimetro: metricas.objeto?.perimeter !== undefined,
        tieneFormaDetectada: metricas.objeto?.forma_detectada !== undefined,
        ejemploValores: {
          area: metricas.objeto?.area,
          circularity: metricas.objeto?.circularity,
          forma_detectada: metricas.objeto?.forma_detectada
        }
      });
      
      // 2. Reconstruir objeto completo de análisis
      const analysis = {
        id: metadata.id,
        timestamp: metadata.timestamp,
        nombreObjeto: metadata.nombreObjeto,
        modo: metadata.configuracion?.modo || 'monofacial',
        cara: metadata.identificacion?.cara || 'Mono',
        escala: metadata.configuracion?.escala || 1,
        unidades: metadata.configuracion?.unidades || 'mm',
        
        // MÉTRICAS COMPLETAS del objeto (150+ propiedades)
        metricas: metricas.objeto || {},
        
        // PERFORACIONES con métricas individuales
        perforaciones: metricas.perforaciones || [],
        horadaciones: metricas.horadaciones || [],
        
        // ESTADÍSTICAS agregadas
        estadisticas: metricas.estadisticas || {},
        
        // GEOMETRÍA para reconstruir visualización
        geometria: {
          contornoReal: geometria.contornoReal || {},
          convexHull: geometria.convexHull || {},
          ejes: geometria.ejes || {},
          centroides: geometria.centroides || {},
          boundingBox: geometria.boundingBox || {},
          radios: geometria.radios || {}
        },
        
        // RUTAS de imágenes (relativas a la carpeta del análisis)
        imagenes: {
          original: `${analysisFolderPath}/imagenes/original.png`,
          objetoRecortado: `${analysisFolderPath}/imagenes/objeto_recortado.png`,
          contornoReal: `${analysisFolderPath}/imagenes/contorno_real.png`,
          convexHull: `${analysisFolderPath}/imagenes/convex_hull.png`,
          ejesPrincipales: `${analysisFolderPath}/imagenes/ejes_principales.png`,
          radios: `${analysisFolderPath}/imagenes/radios.png`,
          perforaciones: `${analysisFolderPath}/imagenes/perforaciones.png`,
          analisisCompleto: `${analysisFolderPath}/imagenes/analisis_completo.png`,
          thumbnail: `${analysisFolderPath}/imagenes/thumbnail.png`
        },
        
        // Metadatos del proyecto
        proyecto: metadata.proyecto || {},
        
        // Configuración completa (incluye parametros_captura para recálculo retroactivo)
        configuracion: metadata.configuracion || {},
        
        // Info de procesamiento
        versionMAO: metadata.procesamiento?.versionMAO || '1.2.0',
        carpetaOrigen: analysisFolderPath
      };
      
      // 🔧 VALIDACIÓN: Verificar que contorno tenga puntos, si no usar convex hull
      if ((!analysis.geometria.contornoReal?.puntos || analysis.geometria.contornoReal.puntos.length === 0) &&
          analysis.geometria.convexHull?.puntos && analysis.geometria.convexHull.puntos.length >= 3) {
        console.warn(`⚠️ [${analysis.nombreObjeto}] Contorno vacío, usando Convex Hull como fallback para Procrustes`);
        // No modificar contornoReal directamente, Procrustes ya tiene fallback en getPuntos()
        // Pero registramos la situación para diagnosticar
        analysis.geometria._contornoVacio = true;
        analysis.geometria._usandoHullEnProcrustes = true;
      }
      
      console.log(`✅ Análisis cargado exitosamente: ${analysis.nombreObjeto}`);
      return analysis;
      
    } catch (error) {
      console.error('❌ Error cargando análisis desde disco:', error);
      console.error('   Detalles:', error.message);
      toast.error(`Error al cargar análisis: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Cargar índice de colección completa
   * @param {string} projectId - ID del proyecto
   * @returns {Object|null} Objeto de colección con lista de análisis o null
   */
  async loadProjectCollection(projectId) {
    const project = this.getProject(projectId);
    if (!project) {
      console.error('❌ loadProjectCollection: Proyecto no encontrado para ID:', projectId);
      toast.error('Proyecto no encontrado');
      return null;
    }
    
    if (!project.folderPath) {
      console.error('❌ loadProjectCollection: Proyecto sin folderPath:', project.name);
      toast.error('Proyecto sin carpeta configurada');
      return null;
    }
    
    try {
      console.log(`📚 Cargando colección del proyecto: ${project.name}`);
      console.log(`📂 Ruta del proyecto: ${project.folderPath}`);
      
      // 1. Verificar que la carpeta del proyecto existe
      const folderExists = await window.electronAPI.folderExists(project.folderPath);
      if (!folderExists) {
        console.error('❌ La carpeta del proyecto no existe:', project.folderPath);
        toast.error('La carpeta del proyecto no existe o fue movida');
        return null;
      }
      
      // 2. Contar carpetas de análisis reales en disco
      //    Incluye formatos nuevo (analisis_*) y antiguo (ID arqueológico directo)
      const listCheck = await window.electronAPI.listDirectory(project.folderPath);
      let realFolderCount = 0;
      const _CARPETAS_SISTEMA = new Set(['imagenes', 'img', 'images', 'thumbnails']);
      if (listCheck.success) {
        realFolderCount = listCheck.items.filter(i =>
          i.isDirectory &&
          !i.name.startsWith('.') &&
          !_CARPETAS_SISTEMA.has(i.name.toLowerCase())
        ).length;
        console.log(`📁 Carpetas candidatas a análisis en disco: ${realFolderCount}`);
      }
      
      // 3. Intentar cargar índice desde disco
      const indexPath = `${project.folderPath}/collection_index.json`;
      const indexResult = await window.electronAPI.readFile(indexPath);
      
      if (!indexResult.success) {
        console.warn('⚠️ Índice no encontrado en disco, reconstruyendo...');
        throw new Error('Índice no encontrado en disco');
      }
      
      let collection;
      try {
        collection = JSON.parse(indexResult.content);
      } catch (parseError) {
        console.error('❌ Error parseando collection_index.json:', parseError.message);
        throw new Error('Índice corrupto — reconstruyendo');
      }
      
      // 4. Validar integridad del índice
      const indexObjectCount = (collection.objetos || []).length;
      console.log(`📊 Índice: ${indexObjectCount} objetos | Disco: ${realFolderCount} carpetas`);
      
      // Si el índice está vacío pero hay carpetas, reconstruir
      if (indexObjectCount === 0 && realFolderCount > 0) {
        console.warn(`⚠️ Índice vacío pero hay ${realFolderCount} carpetas — reconstruyendo`);
        return await this.rebuildCollectionIndex(project);
      }
      
      // Si el índice tiene menos objetos que carpetas en disco, reconstruir
      if (indexObjectCount < realFolderCount) {
        console.warn(`⚠️ Índice desactualizado: ${indexObjectCount} objetos vs ${realFolderCount} carpetas — reconstruyendo`);
        toast.info('Índice desactualizado, reconstruyendo...');
        return await this.rebuildCollectionIndex(project);
      }
      
      // Si el índice tiene MÁS entradas que carpetas, hay entradas huérfanas (guardado interrumpido).
      // Filtrar en caliente sin reconstruir todo el índice.
      if (indexObjectCount > realFolderCount && listCheck.success) {
        const carpetasEnDisco = new Set(
          listCheck.items.filter(i =>
            i.isDirectory && !i.name.startsWith('.') && !_CARPETAS_SISTEMA.has(i.name.toLowerCase())
          ).map(i => i.name)
        );
        const antes = collection.objetos.length;
        collection.objetos = collection.objetos.filter(o => carpetasEnDisco.has(o.carpeta));
        collection.totalObjetos = collection.objetos.length;
        const huerfanas = antes - collection.objetos.length;
        if (huerfanas > 0) {
          console.warn(`🧹 ${huerfanas} entrada(s) huérfana(s) eliminadas del índice (carpeta no existe en disco)`);
          // Guardar índice limpio en disco
          const cleanedIndex = JSON.stringify(collection, null, 2);
          await window.electronAPI.saveFile(indexPath, cleanedIndex);
          toast.warning(`Se eliminaron ${huerfanas} análisis incompletos del índice (guardado interrumpido)`);
        }
      }

      // Compatibilidad: añadir trazabilidad faltante en índices anteriores
      let collectionNeedsSave = false;
      for (const obj of (collection.objetos || [])) {
        if (!obj.trazabilidadMetricas) {
          obj.trazabilidadMetricas = _buildMetricTraceability(obj.modo || 'monofacial', {}, {
            numPerforaciones: obj?.metricasResumen?.numPerforaciones || 0,
            numHoradaciones: obj?.metricasResumen?.numHoradaciones || 0
          });
          collectionNeedsSave = true;
        }
      }
      if (!collection.trazabilidadMetricas) {
        collection.trazabilidadMetricas = _buildCollectionTraceabilitySummary(collection.objetos || []);
        collectionNeedsSave = true;
      }
      if (collectionNeedsSave) {
        await window.electronAPI.saveFile(indexPath, JSON.stringify(collection, null, 2));
      }

      console.log(`✅ Colección cargada: ${collection.objetos.length} objetos`);
      toast.success(`Colección cargada: ${collection.objetos.length} objetos`);
      
      return collection;
      
    } catch (error) {
      // Si no existe índice, generarlo desde las carpetas existentes
      console.warn('⚠️ Error cargando índice, generando desde carpetas...', error.message);
      toast.info('Generando índice de colección...');
      
      return await this.rebuildCollectionIndex(project);
    }
  }
  
  /**
   * Reconstruir índice de colección escaneando todas las carpetas de análisis
   * @param {Object} project - Objeto del proyecto
   * @returns {Object|null} Objeto de colección generado o null
   */
  async rebuildCollectionIndex(project) {
    console.log('🔨 Reconstruyendo índice de colección...');
    
    try {
      // 1. Listar todas las carpetas en el directorio del proyecto
      console.log(`📂 Escaneando directorio: ${project.folderPath}`);
      const listResult = await window.electronAPI.listDirectory(project.folderPath);
      
      if (!listResult.success) {
        throw new Error(`Error listando directorio: ${listResult.error}`);
      }
      
      console.log(`📋 Items encontrados: ${listResult.items.length}`);
      
      // 2. Filtrar carpetas que podrían ser análisis:
      //    - El formato nuevo usa prefijo "analisis_"
      //    - El formato antiguo usa el ID arqueológico directamente (ej: DRG21_25069_01_ca)
      //    - Se incluyen TODAS las subcarpetas no ocultas (la presencia de metadata.json
      //      confirma si es un análisis; la lectura fallida descarta carpetas no-análisis)
      const CARPETAS_SISTEMA = new Set(['imagenes', 'img', 'images', 'thumbnails']);
      const analysisFolders = listResult.items.filter(item =>
        item.isDirectory &&
        !item.name.startsWith('.') &&
        !CARPETAS_SISTEMA.has(item.name.toLowerCase())
      );
      
      console.log(`📁 Encontradas ${analysisFolders.length} carpetas candidatas a análisis`);
      
      const objetos = [];
      
      // 3. Para cada carpeta, leer metadata.json y metricas.json
      for (const folder of analysisFolders) {
        try {
          const folderPath = folder.path;
          const folderName = folder.name;
          
          console.log(`  📖 Procesando: ${folderName}`);
          
          // Leer archivos
          const metadataResult = await window.electronAPI.readFile(`${folderPath}/metadata.json`);
          const metricasResult = await window.electronAPI.readFile(`${folderPath}/metricas.json`);
          
          if (!metadataResult.success) {
            console.warn(`    ⚠️ No se pudo leer metadata.json: ${metadataResult.error}`);
            continue;
          }
          
          if (!metricasResult.success) {
            console.warn(`    ⚠️ No se pudo leer metricas.json: ${metricasResult.error}`);
            continue;
          }
          
          let metadata, metricas;
          try { metadata = JSON.parse(metadataResult.content); } catch { console.warn(`    ⚠️ metadata.json corrupto en ${folderPath}, omitiendo.`); continue; }
          try { metricas  = JSON.parse(metricasResult.content);  } catch { console.warn(`    ⚠️ metricas.json corrupto en ${folderPath}, omitiendo.`);  continue; }
          
          console.log(`    📊 Métricas cargadas:`, {
            area: metricas.objeto?.area,
            circularidad: metricas.objeto?.circularity,
            perforaciones: metricas.estadisticas?.totalPerforaciones
          });
          
          // 4. Extraer métricas clave para el índice
          // Normalizar sufijo (Cara X) del nombre y derivar cara si es nula
          const _rawNombre = metadata.nombreObjeto || 'Sin Nombre';
          const _caraMeta = (metadata.identificacion?.cara || '').toUpperCase();
          const _modoAnalisis = metadata.configuracion?.modo || 'monofacial';
          const _caraFinal = _modoAnalisis === 'obj3d' ? '3D' : ((_caraMeta === 'A' || _caraMeta === 'B') ? _caraMeta : (() => {
            const _m = /\(\s*cara\s+([ab])\s*\)/i.exec(_rawNombre) ||
                       /\[\s*cara\s+([ab])\s*\]/i.exec(_rawNombre);
            return _m ? _m[1].toUpperCase() : 'Mono';
          })());
          const _nombreBase = _rawNombre.replace(/\s*[\[(]\s*cara\s+[ab]\s*[\])]\s*$/i, '').trim() || 'Sin Nombre';
          objetos.push({
            id: metadata.id,
            nombreObjeto: _nombreBase,
            carpeta: folderName,
            timestamp: metadata.timestamp,
            modo: _modoAnalisis,
            cara: _caraFinal,
            
            // Métricas RESUMEN (solo las más importantes, no todas las 150+)
            metricasResumen: {
              area: _modoAnalisis === 'obj3d' ? (metricas.objeto?.bbox_volume || metricas.objeto?.area || 0) : (metricas.objeto?.area || 0),
              perimetro: metricas.objeto?.perimeter || 0,
              circularidad: metricas.objeto?.circularity || 0,
              elongacion: metricas.objeto?.elongation || 0,
              aspectRatio: metricas.objeto?.aspect_ratio || 0,
              clasificacionForma: metricas.objeto?.forma_detectada || (_modoAnalisis === 'obj3d' ? 'obj3d_pca' : 'sin_clasificar'),
              numPerforaciones: metricas.estadisticas?.totalPerforaciones || 0,
              numHoradaciones: metricas.estadisticas?.totalHoradaciones || 0,
              porosidad: metricas.estadisticas?.porosidad || 0,
              medidaEtiqueta: _modoAnalisis === 'obj3d' ? 'Volumen BBox' : 'Área',
              medidaUnidad: _modoAnalisis === 'obj3d' ? ((metadata.configuracion?.unidades || 'u3d') + '³') : 'mm²'
            },

            trazabilidadMetricas: _buildMetricTraceability(_modoAnalisis, metricas.objeto || {}, {
              numPerforaciones: metricas.estadisticas?.totalPerforaciones || 0,
              numHoradaciones: metricas.estadisticas?.totalHoradaciones || 0
            }),
            
            thumbnail: `${folderName}/imagenes/thumbnail.png`,
            thumbnailPath: `${folderPath}/imagenes/objeto_recortado.png`,
            completado: true
          });
          
          console.log(`    ✅ ${metadata.nombreObjeto} agregado al índice`);
          
        } catch (error) {
          console.warn(`⚠️ Error procesando carpeta ${folder.name}:`, error.message);
          // Continuar con el siguiente
        }
      }
      
      // 5. Ordenar por timestamp (más reciente primero)
      objetos.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      // 6. Crear estructura de índice
      const collection = {
        proyectoId: project.id,
        nombre: project.name,
        descripcion: project.description || '',
        rasgoComun: project.commonTrait || '',
        totalObjetos: objetos.length,
        ultimaActualizacion: new Date().toISOString(),
        objetos: objetos,
        trazabilidadMetricas: _buildCollectionTraceabilitySummary(objetos)
      };
      
      // 7. Guardar índice en disco
      console.log('💾 Guardando índice de colección...');
      const saveResult = await window.electronAPI.saveFile(
        `${project.folderPath}/collection_index.json`,
        JSON.stringify(collection, null, 2)
      );
      
      if (!saveResult.success) {
        throw new Error(`Error guardando índice: ${saveResult.error}`);
      }
      
      console.log(`✅ Índice reconstruido exitosamente: ${objetos.length} objetos`);
      toast.success(`Índice actualizado: ${objetos.length} objetos en la colección`);
      
      return collection;
      
    } catch (error) {
      console.error('❌ Error reconstruyendo índice:', error);
      console.error('   Detalles:', error.message);
      toast.error(`Error al reconstruir índice: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Actualizar índice de colección al agregar un nuevo análisis
   * @param {Object} project - Objeto del proyecto
   * @param {Object} newAnalysis - Nuevo análisis agregado
   * @param {string} analysisFolderName - Nombre de la carpeta del análisis
   */
  async updateCollectionIndex(project, newAnalysis, analysisFolderName) {
    const _fs = _getFsAdapter();
    if (!_fs) {
      console.warn('⚠️ updateCollectionIndex: sin adaptador FS, índice no actualizado');
      return;
    }
    try {
      console.log('📇 Actualizando índice de colección...');
      
      // 1. Cargar índice actual (o crear nuevo si no existe)
      let collection = null;
      const indexPath = `${project.folderPath}/collection_index.json`;
      
      try {
        console.log(`📖 Buscando índice existente: ${indexPath}`);
        const readResult = await _fs.readFile(indexPath);
        
        if (readResult.success) {
          collection = JSON.parse(readResult.content);
          console.log(`✅ Índice cargado: ${collection.objetos?.length || 0} objetos existentes`);
        } else {
          // Error al leer (probablemente archivo no existe)
          console.log(`ℹ️ Índice no existe todavía (${readResult.error})`);
          throw new Error('Índice no existe');
        }
      } catch (error) {
        // Si no existe, crear estructura nueva
        console.log('🆕 Creando nuevo índice de colección (primera vez)');
        collection = {
          proyectoId: project.id,
          nombre: project.name,
          descripcion: project.description || '',
          rasgoComun: project.commonTrait || '',
          totalObjetos: 0,
          ultimaActualizacion: new Date().toISOString(),
          objetos: []
        };
      }
      
      // 2. Verificar si el análisis ya existe en el índice (evitar duplicados)
      const existingIndex = collection.objetos.findIndex(obj => obj.id === newAnalysis.id);
      
      const nuevoObjeto = {
        id: newAnalysis.id,
        nombreObjeto: newAnalysis.data?.nombreObjeto || 'Sin Nombre',
        carpeta: analysisFolderName,
        timestamp: newAnalysis.timestamp,
        modo: _normalizeAnalysisMode(newAnalysis.data),
        cara: _normalizeAnalysisCara(newAnalysis.data),
        metricasResumen: _extractAnalysisSummary(newAnalysis.data),
        trazabilidadMetricas: _buildMetricTraceability(_normalizeAnalysisMode(newAnalysis.data), newAnalysis.data?.metricas || {}, {
          numPerforaciones: (newAnalysis.data?.perforaciones || []).length,
          numHoradaciones: (newAnalysis.data?.horadaciones || []).length
        }),
        thumbnail: `${analysisFolderName}/imagenes/thumbnail.png`,
        completado: true
      };
      
      // 3. Agregar o actualizar en el índice
      if (existingIndex >= 0) {
        collection.objetos[existingIndex] = nuevoObjeto;
        console.log('🔄 Objeto actualizado en índice');
      } else {
        collection.objetos.push(nuevoObjeto);
        console.log('➕ Objeto agregado al índice');
      }
      
      // 4. Actualizar metadatos de la colección
      collection.totalObjetos = collection.objetos.length;
      collection.ultimaActualizacion = new Date().toISOString();
      collection.trazabilidadMetricas = _buildCollectionTraceabilitySummary(collection.objetos);
      
      // 5. Ordenar por timestamp (más reciente primero)
      collection.objetos.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      // 6. Guardar índice actualizado
      console.log('💾 Guardando índice actualizado...');
      const saveResult = await _fs.saveFile(
        `${project.folderPath}/collection_index.json`,
        JSON.stringify(collection, null, 2)
      );
      
      if (!saveResult.success) {
        throw new Error(`Error guardando índice: ${saveResult.error}`);
      }
      
      console.log(`✅ Índice actualizado exitosamente: ahora ${collection.totalObjetos} objetos`);
      
      // 🆕 TAMBIÉN ACTUALIZAR ARCHIVO proyecto.mao
      await actualizarArchivoProyecto(project);
      
    } catch (error) {
      console.error('❌ Error actualizando índice de colección:', error);
      console.error('   Detalles:', error.message);
      // No lanzar error, solo loguear (el guardado principal ya funcionó)
    }
  }
  
  // ============================================================================
  // SISTEMA DE RECUPERACIÓN Y GESTIÓN AVANZADA DE ANÁLISIS
  // ============================================================================
  
  /**
   * Escanear carpeta completa buscando todos los análisis guardados
   * @param {string} folderPath - Ruta de la carpeta a escanear
   * @returns {Object} Resultado del escaneo con lista de análisis encontrados
   */
  async scanForAllAnalysis(folderPath) {
    if (!window.electronAPI || !window.electronAPI.scanForAnalysis) {
      toast.error('Sistema de escaneo no disponible');
      return { success: false, analyses: [] };
    }
    
    console.log(`🔍 Escaneando carpeta: ${folderPath}`);
    toast.info('Escaneando análisis guardados...');
    
    try {
      const result = await window.electronAPI.scanForAnalysis(folderPath, 5);
      
      if (result.success) {
        console.log(`✅ Escaneo completado: ${result.totalFound} análisis encontrados`);
        toast.success(`Encontrados ${result.totalFound} análisis`);
        return result;
      } else {
        console.error('❌ Error en escaneo:', result.error);
        toast.error(`Error al escanear: ${result.error}`);
        return { success: false, analyses: [] };
      }
    } catch (error) {
      console.error('❌ Error escaneando análisis:', error);
      toast.error(`Error: ${error.message}`);
      return { success: false, analyses: [] };
    }
  }
  
  /**
   * Validar integridad de un análisis
   * @param {string} analysisPath - Ruta del análisis a validar
   * @returns {Object} Resultado de validación con detalles
   */
  async validateAnalysisIntegrity(analysisPath) {
    if (!window.electronAPI || !window.electronAPI.validateAnalysis) {
      return { success: false, validation: { valid: false, error: 'Sistema no disponible' } };
    }
    
    console.log(`🔍 Validando integridad: ${analysisPath}`);
    
    try {
      const result = await window.electronAPI.validateAnalysis(analysisPath);
      
      if (result.success) {
        const v = result.validation;
        console.log(`📋 Validación completada:`, {
          válido: v.valid,
          archivosFaltantes: v.missingFiles.length,
          archivosCorruptos: v.corruptedFiles.length,
          imágenesFaltantes: v.missingImages.length
        });
        return result;
      } else {
        console.error('❌ Error en validación:', result.error);
        return { success: false, validation: { valid: false, error: result.error } };
      }
    } catch (error) {
      console.error('❌ Error validando análisis:', error);
      return { success: false, validation: { valid: false, error: error.message } };
    }
  }
  
  /**
   * Recuperar análisis huérfano y asociarlo a un proyecto
   * @param {string} analysisPath - Ruta del análisis huérfano
   * @param {string} projectId - ID del proyecto al que asociar
   * @returns {boolean} true si se recuperó exitosamente
   */
  async recoverOrphanAnalysis(analysisPath, projectId) {
    const project = this.getProject(projectId);
    if (!project) {
      toast.error('Proyecto no encontrado');
      return false;
    }
    
    if (!project.folderPath) {
      toast.error('El proyecto debe tener una carpeta configurada');
      return false;
    }
    
    console.log(`🔄 Recuperando análisis huérfano desde: ${analysisPath}`);
    console.log(`📂 Destino: ${project.folderPath}`);
    
    try {
      // 1. Validar que el análisis sea válido
      const validation = await this.validateAnalysisIntegrity(analysisPath);
      if (!validation.success || !validation.validation.valid) {
        toast.error('El análisis no es válido o está corrupto');
        return false;
      }
      
      // 2. Cargar el análisis
      const analysis = await this.loadAnalysisFromDisk(analysisPath);
      if (!analysis) {
        toast.error('No se pudo cargar el análisis');
        return false;
      }
      
      // 3. Agregar al proyecto (esto creará una copia en la carpeta del proyecto)
      const originalActiveProject = this.activeProject;
      this.activeProject = project;
      
      const analysisWrapper = {
        id: analysis.id || (Date.now().toString() + Math.random().toString(36).substr(2, 9)),
        timestamp: analysis.timestamp || new Date().toISOString(),
        data: analysis
      };
      
      const success = await this.addAnalysis(analysis);
      
      this.activeProject = originalActiveProject;
      
      if (success) {
        console.log('✅ Análisis recuperado exitosamente');
        toast.success(`Análisis "${analysis.nombreObjeto}" recuperado y asociado al proyecto`);
        return true;
      } else {
        toast.error('Error al asociar el análisis al proyecto');
        return false;
      }
      
    } catch (error) {
      console.error('❌ Error recuperando análisis:', error);
      toast.error(`Error: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Obtener lista de todos los análisis en todos los proyectos
   * @returns {Array} Lista de objetos con información de análisis y proyecto
   */
  getAllAnalysesAcrossProjects() {
    const allAnalyses = [];
    
    for (const project of this.projects) {
      for (const analysis of project.analyses) {
        allAnalyses.push({
          analysisId: analysis.id,
          projectId: project.id,
          projectName: project.name,
          timestamp: analysis.timestamp,
          nombreObjeto: analysis.data?.nombreObjeto || 'Sin Nombre',
          modo: analysis.data?.modo || 'monofacial',
          folderPath: project.folderPath
        });
      }
    }
    
    // Ordenar por timestamp descendente
    allAnalyses.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return allAnalyses;
  }
  
  /**
   * Buscar análisis por criterios
   * @param {Object} criteria - Criterios de búsqueda { nombreObjeto, modo, projectId, dateFrom, dateTo }
   * @returns {Array} Lista de análisis que coinciden con los criterios
   */
  searchAnalyses(criteria) {
    const allAnalyses = this.getAllAnalysesAcrossProjects();
    
    return allAnalyses.filter(analysis => {
      // Filtro por nombre
      if (criteria.nombreObjeto) {
        const searchTerm = criteria.nombreObjeto.toLowerCase();
        if (!analysis.nombreObjeto.toLowerCase().includes(searchTerm)) {
          return false;
        }
      }
      
      // Filtro por modo
      if (criteria.modo && analysis.modo !== criteria.modo) {
        return false;
      }
      
      // Filtro por proyecto
      if (criteria.projectId && analysis.projectId !== criteria.projectId) {
        return false;
      }
      
      // Filtro por rango de fechas
      if (criteria.dateFrom) {
        const analysisDate = new Date(analysis.timestamp);
        const fromDate = new Date(criteria.dateFrom);
        if (analysisDate < fromDate) {
          return false;
        }
      }
      
      if (criteria.dateTo) {
        const analysisDate = new Date(analysis.timestamp);
        const toDate = new Date(criteria.dateTo);
        if (analysisDate > toDate) {
          return false;
        }
      }
      
      return true;
    });
  }

  /**
   * Copia (o mueve) un análisis de un proyecto a otro.
   *
   * @param {string}  carpeta       Subcarpeta del análisis dentro del proyecto origen
   * @param {string}  fromProjectId ID del proyecto origen
   * @param {string}  toProjectId   ID del proyecto destino
   * @param {boolean} move          Si true, elimina el origen después de copiar (mover)
   * @returns {Promise<true>}       Lanza Error ante cualquier fallo irrecuperable
   */
  async copyAnalysisBetweenProjects(carpeta, fromProjectId, toProjectId, move = false) {
    if (fromProjectId === toProjectId) throw new Error('El proyecto origen y destino son el mismo');

    const fromProject = this.getProject(fromProjectId);
    const toProject   = this.getProject(toProjectId);
    if (!fromProject?.folderPath) throw new Error('El proyecto origen no tiene carpeta configurada');
    if (!toProject?.folderPath)   throw new Error('El proyecto destino no tiene carpeta configurada');

    const _fs = _getFsAdapter();
    if (!_fs) throw new Error('Sin adaptador de sistema de archivos disponible');

    const srcBase = `${fromProject.folderPath}/${carpeta}`;
    const dstBase = `${toProject.folderPath}/${carpeta}`;

    // 1. Crear carpetas destino
    const mkRoot = await _fs.ensureFolder(dstBase);
    if (!mkRoot.success) throw new Error(`No se pudo crear carpeta destino: ${mkRoot.error}`);
    await _fs.ensureFolder(`${dstBase}/imagenes`);

    // 2. Helper: leer un archivo y escribirlo en destino
    const _copyFile = async (src, dst) => {
      const r = await _fs.readFile(src);
      if (!r.success) throw new Error(`Error leyendo ${src}: ${r.error}`);
      const w = await _fs.saveFile(dst, r.content);
      if (w && !w.success) throw new Error(`Error escribiendo ${dst}: ${w.error}`);
    };

    // 3. Archivos raíz del análisis
    for (const f of ['metadata.json', 'metricas.json', 'geometria.json', 'metricas.csv', 'trazados.json']) {
      try { await _copyFile(`${srcBase}/${f}`, `${dstBase}/${f}`); } catch { /* archivo opcional */ }
    }

    // 4. Archivos de imágenes (nombres conocidos + listado dinámico si está disponible)
    const KNOWN_IMGS = [
      'original.png', 'objeto_recortado.png', 'thumbnail.png',
      'analisis_morfologico.png', 'analisis_completo.png',
      'forma_idealizada.png', 'esquema_morfometrico.png',
      'contorno_real.png', 'convex_hull.png', 'ejes_principales.png', 'radios.png',
      'metadata.json', 'imagenes.json'
    ];
    for (const f of KNOWN_IMGS) {
      try { await _copyFile(`${srcBase}/imagenes/${f}`, `${dstBase}/imagenes/${f}`); } catch { /* no-op */ }
    }
    if (window.electronAPI?.listDirectory) {
      const ls = await window.electronAPI.listDirectory(`${srcBase}/imagenes`);
      if (ls.success) {
        for (const item of ls.items) {
          if (item.isFile && !KNOWN_IMGS.includes(item.name)) {
            try { await _copyFile(`${srcBase}/imagenes/${item.name}`, `${dstBase}/imagenes/${item.name}`); } catch { /* no-op */ }
          }
        }
      }
    }

    // 5. Obtener metadatos del objeto (índice origen → fallback metadata.json)
    let objetoEntry = null;
    const srcIndexPath = `${fromProject.folderPath}/collection_index.json`;
    const srcIdxRes = await _fs.readFile(srcIndexPath);
    if (srcIdxRes.success) {
      try {
        const srcIdx = JSON.parse(srcIdxRes.content);
        objetoEntry = (srcIdx.objetos || []).find(o => o.carpeta === carpeta) || null;
      } catch { /* no-op */ }
    }
    if (!objetoEntry) {
      const metaRes = await _fs.readFile(`${srcBase}/metadata.json`);
      if (metaRes.success) {
        try {
          const meta = JSON.parse(metaRes.content);
          objetoEntry = {
            id: meta.id,
            nombreObjeto: meta.nombreObjeto || meta.identificacion?.nombre || carpeta,
            carpeta,
            timestamp: meta.timestamp || new Date().toISOString(),
            modo: meta.configuracion?.modo || 'monofacial',
            cara: meta.identificacion?.cara || null,
            metricasResumen: {},
            completado: true
          };
        } catch { /* no-op */ }
      }
    }

    // 6. Actualizar collection_index.json del destino
    if (objetoEntry) {
      const dstIndexPath = `${toProject.folderPath}/collection_index.json`;
      const dstIdxRes = await _fs.readFile(dstIndexPath);
      let dstIndex = null;
      if (dstIdxRes.success) {
        try { dstIndex = JSON.parse(dstIdxRes.content); } catch { /* no-op */ }
      }
      if (!dstIndex) {
        dstIndex = {
          proyectoId: toProjectId, nombre: toProject.name,
          descripcion: toProject.description || '', rasgoComun: toProject.commonTrait || '',
          totalObjetos: 0, ultimaActualizacion: new Date().toISOString(), objetos: []
        };
      }
      if (!(dstIndex.objetos || []).some(o => o.carpeta === carpeta)) {
        dstIndex.objetos = [...(dstIndex.objetos || []), { ...objetoEntry, carpeta }];
        dstIndex.totalObjetos = dstIndex.objetos.length;
        dstIndex.ultimaActualizacion = new Date().toISOString();
        await _fs.saveFile(dstIndexPath, JSON.stringify(dstIndex, null, 2));
      }
      // Sincronizar con localStorage del destino
      if (!toProject.analyses.some(a => a.carpeta === carpeta)) {
        toProject.analyses.push({
          id: objetoEntry.id,
          timestamp: objetoEntry.timestamp,
          nombreObjeto: objetoEntry.nombreObjeto,
          cara: objetoEntry.cara,
          modo: objetoEntry.modo,
          carpeta
        });
        toProject.updatedAt = new Date().toISOString();
        this.save();
      }
    }

    // 7. Si es mover: limpiar origen
    if (move) {
      const srcIdxRes2 = await _fs.readFile(srcIndexPath);
      if (srcIdxRes2.success) {
        try {
          const srcIdx = JSON.parse(srcIdxRes2.content);
          srcIdx.objetos = (srcIdx.objetos || []).filter(o => o.carpeta !== carpeta);
          srcIdx.totalObjetos = srcIdx.objetos.length;
          srcIdx.ultimaActualizacion = new Date().toISOString();
          await _fs.saveFile(srcIndexPath, JSON.stringify(srcIdx, null, 2));
        } catch { /* no-op */ }
      }
      fromProject.analyses = fromProject.analyses.filter(a => a.carpeta !== carpeta);
      fromProject.updatedAt = new Date().toISOString();
      this.save();
      if (window.electronAPI?.trashItem) {
        await window.electronAPI.trashItem(srcBase);
      }
    }

    return true;
  }
}

// Instancia global
const projectManager = new ProjectManager();
