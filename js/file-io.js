// MAO Plus — I/O de archivos de proyecto (.mao)

// ============================================================================
// 🆕 SISTEMA DE ARCHIVO DE PROYECTO (proyecto.mao)
// ============================================================================

/**
 * Generar archivo proyecto.mao al crear un nuevo proyecto
 * Este archivo permite reconocer carpetas de proyecto automáticamente
 */
async function generarArchivoProyecto(project) {
  try {
    console.log('📝 Generando archivo proyecto.mao...');
    console.log('🔍 Proyecto recibido:', {
      id: project.id,
      nombre: project.name,
      folderPath: project.folderPath,
      folderPathType: typeof project.folderPath
    });
    
    // Validar que folderPath sea un string válido
    if (!project.folderPath || typeof project.folderPath !== 'string') {
      console.error('❌ folderPath inválido:', project.folderPath);
      throw new Error('folderPath debe ser una cadena de texto válida');
    }
    
    const proyectoMAO = {
      version: '1.0.0',
      tipo: 'MAO_PLUS_PROJECT',
      metadata: {
        id: project.id,
        nombre: project.name,
        descripcion: project.description || '',
        rasgoComun: project.commonTrait || '',
        sitio: project.sitio || '',
        investigadorResponsable: project.investigadorResponsable || '',
        institucionResponsable: project.institucionResponsable || '',
        creado: project.createdAt,
        ultimaActualizacion: new Date().toISOString()
      },
      estadisticas: {
        totalAnalisis: 0,
        analisisCompletados: 0,
        formasDetectadas: {},
        perforacionesTotales: 0,
        horadacionesTotales: 0
      },
      analisis: [],
      configuracion: {
        formatoImagenes: 'PNG',
        resolucionCanvas: 3,
        guardarCSV: true,
        guardarJSON: true,
        guardarImagenes: true
      }
    };
    
    // 🆕 GENERAR NOMBRE DE ARCHIVO BASADO EN NOMBRE DEL PROYECTO
    const nombreSanitizado = project.name
      .trim()
      .replace(/[^a-z0-9áéíóúñ]/gi, '_')  // Reemplazar caracteres especiales por _
      .replace(/_+/g, '_')                 // Múltiples _ consecutivos → uno solo
      .toLowerCase();
    
    const fileName = `${nombreSanitizado}.mao`;
    const filePath = `${project.folderPath}/${fileName}`;
    console.log('💾 Guardando en:', filePath);
    
    const saveResult = await window.electronAPI.saveFile(
      filePath,
      JSON.stringify(proyectoMAO, null, 2)
    );
    
    if (saveResult.success) {
      console.log(`✅ Archivo ${fileName} creado: ${filePath}`);
      toast.success('Proyecto configurado correctamente');
    } else {
      console.error(`❌ Error creando ${fileName}:`, saveResult.error);
    }
    
  } catch (error) {
    console.error('❌ Error generando archivo proyecto:', error);
  }
}

/**
 * Actualizar archivo proyecto.mao cuando se guarda un nuevo análisis
 */
async function actualizarArchivoProyecto(project) {
  try {
    console.log('🔄 Actualizando archivo .mao del proyecto...');
    
    // Buscar el archivo .mao existente en la carpeta del proyecto
    const dirResult = await window.electronAPI.listDirectory(project.folderPath);
    let filePath = null;
    
    if (dirResult.success) {
      const maoFiles = dirResult.items.filter(item => 
        item.isFile && item.name.endsWith('.mao')
      );
      if (maoFiles.length > 0) {
        filePath = maoFiles[0].path;
        console.log(`📄 Archivo .mao encontrado: ${maoFiles[0].name}`);
      }
    }
    
    // Si no se encontró, generar nombre basado en nombre del proyecto
    if (!filePath) {
      const nombreSanitizado = project.name
        .trim()
        .replace(/[^a-z0-9áéíóúñ]/gi, '_')
        .replace(/_+/g, '_')
        .toLowerCase();
      filePath = `${project.folderPath}/${nombreSanitizado}.mao`;
      console.log(`📄 No se encontró .mao existente, usando: ${filePath}`);
    }
    
    // Cargar archivo existente o crear nuevo
    let proyectoMAO = null;
    const readResult = await window.electronAPI.readFile(filePath);
    
    if (readResult.success) {
      try {
        proyectoMAO = JSON.parse(readResult.content);
      } catch (parseErr) {
        console.error('❌ Error parseando archivo .mao, regenerando:', parseErr.message);
        await generarArchivoProyecto(project);
        return;
      }
    } else {
      // Si no existe, usar generarArchivoProyecto
      await generarArchivoProyecto(project);
      return;
    }
    
    // Actualizar metadata
    proyectoMAO.metadata.ultimaActualizacion = new Date().toISOString();
    proyectoMAO.metadata.nombre = project.name;
    proyectoMAO.metadata.descripcion = project.description || '';
    proyectoMAO.metadata.rasgoComun = project.commonTrait || '';
    
    // Cargar todos los análisis desde collection_index.json
    const indexPath = `${project.folderPath}/collection_index.json`;
    const indexResult = await window.electronAPI.readFile(indexPath);
    
    if (indexResult.success) {
      try {
        const collection = JSON.parse(indexResult.content);
        
        // Actualizar lista de análisis
        proyectoMAO.analisis = (collection.objetos || []).map(obj => ({
          id: obj.id,
          nombre: obj.nombreObjeto,
          carpeta: obj.carpeta,
          timestamp: obj.timestamp,
          modo: obj.modo,
          cara: obj.cara,
          forma: obj.metricasResumen?.clasificacionForma || 'sin_clasificar',
          perforaciones: obj.metricasResumen?.numPerforaciones || 0,
          horadaciones: obj.metricasResumen?.numHoradaciones || 0,
          completado: obj.completado
        }));
        
        // Actualizar estadísticas
        proyectoMAO.estadisticas.totalAnalisis = collection.totalObjetos || (collection.objetos || []).length;
        proyectoMAO.estadisticas.analisisCompletados = (collection.objetos || []).filter(o => o.completado).length;
        
        // Contar formas detectadas
        const formas = {};
        let totalPerforaciones = 0;
        let totalHoradaciones = 0;
        
        (collection.objetos || []).forEach(obj => {
          const forma = obj.metricasResumen?.clasificacionForma || 'sin_clasificar';
          formas[forma] = (formas[forma] || 0) + 1;
          totalPerforaciones += obj.metricasResumen?.numPerforaciones || 0;
          totalHoradaciones += obj.metricasResumen?.numHoradaciones || 0;
        });
        
        proyectoMAO.estadisticas.formasDetectadas = formas;
        proyectoMAO.estadisticas.perforacionesTotales = totalPerforaciones;
        proyectoMAO.estadisticas.horadacionesTotales = totalHoradaciones;
      } catch (collErr) {
        console.error('⚠️ Error procesando collection_index.json:', collErr.message);
      }
    }
    
    // Guardar archivo actualizado
    const saveResult = await window.electronAPI.saveFile(
      filePath,
      JSON.stringify(proyectoMAO, null, 2)
    );
    
    if (saveResult.success) {
      console.log(`✅ Archivo .mao actualizado: ${filePath}`);
    } else {
      console.error(`❌ Error actualizando archivo .mao:`, saveResult.error);
    }
    
  } catch (error) {
    console.error('❌ Error actualizando archivo proyecto:', error);
  }
}

/**
 * Cargar proyecto desde archivo proyecto.mao
 * @param {string} folderPath - Ruta de la carpeta que contiene proyecto.mao
 * @returns {Object} Datos del proyecto cargado
 */
async function cargarProyectoDesdeArchivo(folderPath) {
  try {
    console.log(`📂 Cargando proyecto desde: ${folderPath}`);
    
    // 🆕 BUSCAR ARCHIVO .mao EN LA CARPETA
    const dirResult = await window.electronAPI.listDirectory(folderPath);
    
    if (!dirResult.success) {
      throw new Error('No se pudo leer el contenido de la carpeta');
    }
    
    // Buscar archivos .mao
    const maoFiles = dirResult.items.filter(item => 
      item.isFile && item.name.endsWith('.mao')
    );
    
    if (maoFiles.length === 0) {
      throw new Error('No se encontró archivo .mao en esta carpeta');
    }
    
    // Usar el primer archivo .mao encontrado
    const maoFile = maoFiles[0];
    const filePath = maoFile.path;
    
    console.log(`📄 Archivo encontrado: ${maoFile.name}`);
    
    const readResult = await window.electronAPI.readFile(filePath);
    
    if (!readResult.success) {
      throw new Error('No se pudo leer el archivo .mao');
    }
    
    const proyectoMAO = JSON.parse(readResult.content);
    
    // Validar que sea un proyecto MAO válido
    if (proyectoMAO.tipo !== 'MAO_PLUS_PROJECT') {
      throw new Error('Archivo no es un proyecto MAO válido');
    }
    
    console.log(`✅ Proyecto cargado: ${proyectoMAO.metadata.nombre}`);
    console.log(`   - Total análisis: ${proyectoMAO.estadisticas.totalAnalisis}`);
    console.log(`   - Última actualización: ${proyectoMAO.metadata.ultimaActualizacion}`);
    
    return {
      success: true,
      proyecto: proyectoMAO,
      folderPath: folderPath
    };
    
  } catch (error) {
    console.error('❌ Error cargando proyecto:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ==================================================================================
// UI DEL SISTEMA DE PROYECTOS
// ==================================================================================

