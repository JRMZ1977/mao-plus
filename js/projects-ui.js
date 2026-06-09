// MAO Plus — UI del panel de proyectos
function initProjectsUI() {
  const openProjectsBtn = document.getElementById('openProjectsBtn');
  const projectsPanel = document.getElementById('projectsPanel');
  const closeProjectsPanel = document.getElementById('closeProjectsPanel');
  const createProjectBtn = document.getElementById('createProjectBtn');
  const projectModalOverlay = document.getElementById('projectModalOverlay');
  const cancelProjectBtn = document.getElementById('cancelProjectBtn');
  const saveProjectBtn = document.getElementById('saveProjectBtn');
  const projectForm = document.getElementById('projectForm');
  const activeProjectIndicator = document.getElementById('activeProjectIndicator');
  
  // 🆕 NUEVOS ELEMENTOS DE LA INTERFAZ PRINCIPAL
  const btnGestionarProyectos = document.getElementById('btnGestionarProyectos');
  const btnCrearProyectoRapido = document.getElementById('btnCrearProyectoRapido');
  const btnCambiarProyecto = document.getElementById('btnCambiarProyecto');
  const proyectoActivoIndicador = document.getElementById('proyectoActivoIndicador');
  const sinProyectoIndicador = document.getElementById('sinProyectoIndicador');
  const proyectoActivoNombre = document.getElementById('proyectoActivoNombre');
  const proyectoActivoInfo = document.getElementById('proyectoActivoInfo');
  
  // 🔍 DEBUGGING: Verificar elementos del modal
  console.log('🔍 Verificación de elementos del modal:');
  console.log('  - projectModalOverlay:', projectModalOverlay ? '✅ Encontrado' : '❌ NO encontrado');
  console.log('  - saveProjectBtn:', saveProjectBtn ? '✅ Encontrado' : '❌ NO encontrado');
  console.log('  - cancelProjectBtn:', cancelProjectBtn ? '✅ Encontrado' : '❌ NO encontrado');
  console.log('  - projectForm:', projectForm ? '✅ Encontrado' : '❌ NO encontrado');
  
  let editingProjectId = null;
  let selectedFolderPath = null;
  
  // Selector de carpeta del proyecto
  const selectProjectFolderBtn = document.getElementById('selectProjectFolderBtn');
  const projectFolderPath = document.getElementById('projectFolderPath');
  
  if (selectProjectFolderBtn && window.electronAPI && window.electronAPI.selectFolder) {
    selectProjectFolderBtn.addEventListener('click', async () => {
      try {
        console.log('🔍 Ejecutando selectFolder...');
        const folderPath = await window.electronAPI.selectFolder();
        console.log('📁 Resultado de selectFolder:', {
          value: folderPath,
          type: typeof folderPath,
          isString: typeof folderPath === 'string'
        });
        
        if (folderPath) {
          selectedFolderPath = folderPath;
          projectFolderPath.value = selectedFolderPath;
          console.log('✅ selectedFolderPath actualizado:', selectedFolderPath);
          toast.success('Carpeta seleccionada correctamente');
        } else {
          console.warn('⚠️ folderPath es null o undefined');
        }
      } catch (error) {
        console.error('Error seleccionando carpeta:', error);
        toast.error('Error al seleccionar carpeta');
      }
    });
  }
  
  // 🆕 BOTÓN: GESTIONAR PROYECTOS (abre panel lateral)
  if (btnGestionarProyectos) {
    btnGestionarProyectos.addEventListener('click', () => {
      projectsPanel.classList.add('active');
      renderProjectsList();
    });
  }
  
  // 🆕 BOTÓN: CREAR NUEVO PROYECTO (modal directo)
  if (btnCrearProyectoRapido) {
    btnCrearProyectoRapido.addEventListener('click', () => {
      editingProjectId = null;
      selectedFolderPath = null;
      document.getElementById('projectModalTitle').textContent = 'Crear Nuevo Proyecto';
      document.getElementById('projectName').value = '';
      document.getElementById('projectDescription').value = '';
      document.getElementById('projectCommonTrait').value = '';
      document.getElementById('projectFolderPath').value = '';
      projectModalOverlay.classList.add('active');
    });
  }
  
  // 🆕 BOTÓN: CAMBIAR PROYECTO (abre panel)
  if (btnCambiarProyecto) {
    btnCambiarProyecto.addEventListener('click', () => {
      projectsPanel.classList.add('active');
      renderProjectsList();
    });
  }
  
  // 🆕 BOTÓN: ABRIR CARPETA DE ANÁLISIS
  const btnAbrirCarpetaAnalisis = document.getElementById('btnAbrirCarpetaAnalisis');
  if (btnAbrirCarpetaAnalisis) {
    btnAbrirCarpetaAnalisis.addEventListener('click', async () => {
      const abrirFn = window.abrirCarpetaAnalisis;
      if (typeof abrirFn === 'function') {
        await abrirFn();
      } else {
        console.error('❌ abrirCarpetaAnalisis no está disponible en window');
        toast.error('La función para abrir carpeta no está disponible todavía. Recarga la aplicación.');
      }
    });
  }

  // 🆕 BOTÓN: IMPORTAR PROYECTO DESDE JSON
  const btnImportarProyecto = document.getElementById('btnImportarProyecto');
  const importProjectFileInput = document.getElementById('importProjectFileInput');
  if (btnImportarProyecto && importProjectFileInput) {
    btnImportarProyecto.addEventListener('click', () => {
      importProjectFileInput.value = '';
      importProjectFileInput.click();
    });
    importProjectFileInput.addEventListener('change', () => {
      const file = importProjectFileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const imported = projectManager.importProject(e.target.result);
        if (imported) {
          renderProjectsList();
          updateActiveProjectIndicator();
        }
      };
      reader.readAsText(file);
    });
  }
  
  // Abrir panel de proyectos (botón antiguo, mantener compatibilidad)
  if (openProjectsBtn) {
    openProjectsBtn.addEventListener('click', () => {
      projectsPanel.classList.add('active');
      renderProjectsList();
    });
  }
  
  // Cerrar panel de proyectos
  if (closeProjectsPanel) {
    closeProjectsPanel.addEventListener('click', () => {
      projectsPanel.classList.remove('active');
    });
  }
  
  // Abrir modal para crear proyecto
  if (createProjectBtn) {
    createProjectBtn.addEventListener('click', () => {
      editingProjectId = null;
      selectedFolderPath = null;
      document.getElementById('projectModalTitle').textContent = 'Crear Nuevo Proyecto';
      document.getElementById('projectName').value = '';
      document.getElementById('projectDescription').value = '';
      document.getElementById('projectCommonTrait').value = '';
      document.getElementById('projectSite').value = '';
      document.getElementById('projectResearcher').value = '';
      document.getElementById('projectInstitution').value = '';
      document.getElementById('projectFolderPath').value = '';
      projectModalOverlay.classList.add('active');
    });
  }
  
  // Cerrar modal
  if (cancelProjectBtn) {
    cancelProjectBtn.addEventListener('click', () => {
      projectModalOverlay.classList.remove('active');
    });
  }
  
  // Cerrar modal al hacer clic en el overlay
  if (projectModalOverlay) {
    projectModalOverlay.addEventListener('click', (e) => {
      if (e.target === projectModalOverlay) {
        projectModalOverlay.classList.remove('active');
      }
    });
  }
  
  // Guardar proyecto
  if (saveProjectBtn) {
    saveProjectBtn.addEventListener('click', () => {
      console.log('🔵 Botón Guardar Proyecto clickeado');
      
      const name = document.getElementById('projectName').value.trim();
      const description = document.getElementById('projectDescription').value.trim();
      const commonTrait = document.getElementById('projectCommonTrait').value.trim();
      
      // Obtener folderPath y asegurar que sea string
      let folderPath = selectedFolderPath || document.getElementById('projectFolderPath').value.trim();
      
      // Si folderPath es un objeto, intentar extraer la ruta correcta o rechazarlo
      if (typeof folderPath === 'object' && folderPath !== null) {
        console.error('❌ folderPath es un objeto:', folderPath);
        // Intentar extraer si es un objeto con propiedad 'path' o similar
        if (folderPath.path && typeof folderPath.path === 'string') {
          folderPath = folderPath.path;
          console.log('✅ Extraída ruta de objeto:', folderPath);
        } else if (folderPath.filePaths && Array.isArray(folderPath.filePaths) && folderPath.filePaths[0]) {
          folderPath = folderPath.filePaths[0];
          console.log('✅ Extraída ruta de filePaths:', folderPath);
        } else {
          toast.error('Error: Carpeta seleccionada no válida. Por favor selecciona nuevamente.');
          console.error('⚠️ No se pudo extraer ruta del objeto:', folderPath);
          return;
        }
      }
      
      const sitio = document.getElementById('projectSite').value.trim();
      const investigadorResponsable = document.getElementById('projectResearcher').value.trim();
      const institucionResponsable = document.getElementById('projectInstitution').value.trim();
      
      console.log('📋 Datos del formulario:', { 
        name, 
        description, 
        commonTrait, 
        folderPath, 
        folderPathType: typeof folderPath,
        selectedFolderPath,
        selectedFolderPathType: typeof selectedFolderPath,
        inputValue: document.getElementById('projectFolderPath').value,
        sitio, 
        investigadorResponsable, 
        institucionResponsable 
      });
      
      if (!name) {
        toast.warning('Por favor ingresa un nombre para el proyecto');
        return;
      }
      
      if (!commonTrait) {
        toast.warning('Por favor ingresa una característica común');
        return;
      }
      
      if (!folderPath || folderPath === '' || typeof folderPath !== 'string') {
        toast.warning('Por favor selecciona una carpeta válida para el proyecto');
        console.warn('⚠️ Validación falló: folderPath vacío, null o no es string');
        return;
      }
      
      console.log('✅ Validación exitosa, guardando proyecto...');
      
      if (editingProjectId) {
        projectManager.updateProject(editingProjectId, { name, description, commonTrait, folderPath, sitio, investigadorResponsable, institucionResponsable });
        toast.success('Proyecto actualizado correctamente');
      } else {
        projectManager.createProject(name, description, commonTrait, folderPath, sitio, investigadorResponsable, institucionResponsable);
        toast.success('Proyecto creado correctamente');
      }
      
      console.log('✅ Proyecto guardado, cerrando modal...');

      // ── LAAR Tab Router: proyecto guardado ──
      document.dispatchEvent(new CustomEvent('mao:project:saved'));

      projectModalOverlay.classList.remove('active');
      renderProjectsList();
      updateActiveProjectIndicator();
    });
  } else {
    console.error('❌ No se encontró el botón saveProjectBtn');
  }
  
  // Renderizar lista de proyectos
  function renderProjectsList() {
    const container = document.getElementById('projectsPanelContent');
    const projects = projectManager.getAllProjects();
    
    if (projects.length === 0) {
      container.innerHTML = `
        <div class="projects-empty-state">
          <div class="projects-empty-icon"></div>
          <div class="projects-empty-text">No hay proyectos creados</div>
          <p style="font-size: 13px; color: var(--text-tertiary); margin-top: 8px;">
            Crea tu primer proyecto para organizar tus análisis morfométricos
          </p>
        </div>
      `;
      return;
    }
    
    const projectsHTML = projects.map(project => {
      const isActive = projectManager.activeProject && projectManager.activeProject.id === project.id;
      const analysesCount = project.analyses ? project.analyses.length : 0;
      const apsCount = project.apsAnalyses ? project.apsAnalyses.length : 0;
      const date = new Date(project.createdAt).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      
      return `
        <div class="project-card ${isActive ? 'active' : ''}" data-project-id="${project.id}">
          <div class="project-card-header">
            <div>
              <h4 class="project-card-title">${project.name}</h4>
              <div class="project-card-date">${date}</div>
            </div>
            <div class="project-card-actions">
              <button class="project-action-btn explore-collection-btn" data-project-id="${project.id}" title="Explorar colección de análisis">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              </button>
              <button class="project-action-btn edit-project-btn" data-project-id="${project.id}" title="Editar proyecto">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
              </button>
              <button class="project-action-btn export-project-btn" data-project-id="${project.id}" title="Exportar proyecto">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
              <button class="project-action-btn delete-project-btn" data-project-id="${project.id}" title="Eliminar proyecto">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              </button>
            </div>
          </div>
          ${project.description ? `<p class="project-card-description">${project.description}</p>` : ''}
          <div class="project-card-stats">
            <div class="project-stat">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              <span class="project-stat-value" data-project-count="${project.id}">${analysesCount}</span>
              <span>análisis</span>
            </div>
            ${apsCount > 0 ? `
            <div class="project-stat" title="Análisis Procrustes (PS/GPA) guardados">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="5" cy="10" r="2.5"/><circle cx="15" cy="5" r="2.5"/><circle cx="15" cy="15" r="2.5"/><path d="M7.3 9.2L12.7 6.3M7.3 10.8L12.7 13.7"/></svg>
              <span class="project-stat-value">${apsCount}</span>
              <span>Procrustes</span>
            </div>` : ''}
            <div class="project-stat">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
              <span>${project.commonTrait}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    container.innerHTML = `<div class="projects-list">${projectsHTML}</div>`;
    
    // Actualizar conteos reales desde disco (asíncrono)
    if (window.electronAPI) {
      projects.forEach(async (project) => {
        if (!project.folderPath) return;
        try {
          let realCount = 0;
          const indexPath = `${project.folderPath}/collection_index.json`;
          const indexResult = await window.electronAPI.readFile(indexPath);
          if (indexResult.success) {
            const collection = JSON.parse(indexResult.content);
            realCount = (collection.objetos || []).length;
          } else {
            const listResult = await window.electronAPI.listDirectory(project.folderPath);
            if (listResult.success) {
              const _SYS = new Set(['imagenes', 'img', 'images', 'thumbnails']);
              realCount = listResult.items.filter(i =>
                i.isDirectory && !i.name.startsWith('.') && !_SYS.has(i.name.toLowerCase())
              ).length;
            }
          }
          const countEl = document.querySelector(`[data-project-count="${project.id}"]`);
          if (countEl && realCount > 0) {
            countEl.textContent = realCount;
          }
        } catch (e) { /* no-op */ }
      });
    }
    
    // Event listeners para las tarjetas
    container.querySelectorAll('.project-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.project-action-btn')) {
          const projectId = card.dataset.projectId;
          if (projectManager.activeProject && projectManager.activeProject.id === projectId) {
            projectManager.deactivateProject();
          } else {
            projectManager.setActiveProject(projectId);
          }
          renderProjectsList();
          updateActiveProjectIndicator();
        }
      });
    });
    
    // Edit buttons
    container.querySelectorAll('.edit-project-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const projectId = btn.dataset.projectId;
        const project = projectManager.getProject(projectId);
        if (project) {
          editingProjectId = projectId;
          selectedFolderPath = project.folderPath || null;
          document.getElementById('projectModalTitle').textContent = 'Editar Proyecto';
          document.getElementById('projectName').value = project.name;
          document.getElementById('projectDescription').value = project.description || '';
          document.getElementById('projectCommonTrait').value = project.commonTrait;
          document.getElementById('projectSite').value = project.sitio || '';
          document.getElementById('projectResearcher').value = project.investigadorResponsable || '';
          document.getElementById('projectInstitution').value = project.institucionResponsable || '';
          document.getElementById('projectFolderPath').value = project.folderPath || '';
          projectModalOverlay.classList.add('active');
        }
      });
    });
    
    // 🆕 Explore collection buttons
    container.querySelectorAll('.explore-collection-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const projectId = btn.dataset.projectId;
        const openExplorerFn = window.openCollectionExplorer;
        if (typeof openExplorerFn === 'function') {
          await openExplorerFn(projectId);
        } else {
          console.error('❌ openCollectionExplorer no está disponible en window');
          toast.error('El explorador de colección no está disponible todavía. Recarga la aplicación.');
        }
      });
    });
    
    // Export buttons
    container.querySelectorAll('.export-project-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const projectId = btn.dataset.projectId;
        projectManager.exportProject(projectId);
      });
    });
    
    // Delete buttons
    container.querySelectorAll('.delete-project-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const projectId = btn.dataset.projectId;
        const project = projectManager.getProject(projectId);
        if (!project) return;
        _mostrarDialogoEliminarProyecto(project, projectId);
      });
    });
  }

  // Diálogo personalizado para eliminar proyecto (dos opciones)
  async function _mostrarDialogoEliminarProyecto(project, projectId) {
    const tieneCarpeta = project.folderPath && project.folderPath.trim() !== '';

    // Crear overlay modal
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;';

    const box = document.createElement('div');
    box.style.cssText = 'background:#1e1e2e;border:1px solid #444;border-radius:12px;padding:28px 32px;max-width:440px;width:90%;color:#e0e0e0;font-family:inherit;box-shadow:0 8px 32px rgba(0,0,0,.6);';

    box.innerHTML = `
      <h3 style="margin:0 0 10px;font-size:1.1rem;color:#fff;">Eliminar proyecto</h3>
      <p style="margin:0 0 20px;font-size:.9rem;line-height:1.5;color:#bbb;">
        ¿Cómo deseas eliminar el proyecto <strong style="color:#fff;">${project.name}</strong>?
      </p>
      ${tieneCarpeta ? `
      <div style="background:#2a1a1a;border:1px solid #7f3535;border-radius:8px;padding:12px 14px;margin-bottom:20px;font-size:.82rem;color:#e88;">
        <strong>⚠ Eliminar del gestor y de la carpeta</strong> moverá todos los archivos a la Papelera.<br>
        <span style="color:#aaa;margin-top:4px;display:block;">Carpeta: ${project.folderPath}</span>
      </div>` : ''}
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${tieneCarpeta ? `<button id="_mao_trash_all" style="padding:10px 16px;border-radius:8px;border:none;background:#c0392b;color:#fff;font-size:.9rem;cursor:pointer;text-align:left;">🗑 Eliminar del gestor <em>y</em> mover carpeta a la Papelera</button>` : ''}
        <button id="_mao_ref_only" style="padding:10px 16px;border-radius:8px;border:1px solid #555;background:#2d2d3d;color:#e0e0e0;font-size:.9rem;cursor:pointer;text-align:left;">✕ Solo eliminar del gestor (mantener archivos)</button>
        <button id="_mao_cancel" style="padding:8px 16px;border-radius:8px;border:1px solid #444;background:transparent;color:#999;font-size:.85rem;cursor:pointer;">Cancelar</button>
      </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const cerrar = () => document.body.removeChild(overlay);

    // Cancelar
    box.querySelector('#_mao_cancel').addEventListener('click', cerrar);
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) cerrar(); });

    // Solo referencia
    box.querySelector('#_mao_ref_only').addEventListener('click', () => {
      cerrar();
      projectManager.deleteProject(projectId);
      renderProjectsList();
      updateActiveProjectIndicator();
    });

    // Eliminar carpeta + referencia
    if (tieneCarpeta) {
      box.querySelector('#_mao_trash_all').addEventListener('click', async () => {
        cerrar();
        try {
          const result = await window.electronAPI.trashItem(project.folderPath);
          if (!result.success) {
            toast.error(`No se pudo mover la carpeta a la Papelera: ${result.error}`);
            return;
          }
        } catch (err) {
          toast.error(`Error al mover carpeta: ${err.message}`);
          return;
        }
        projectManager.deleteProject(projectId);
        renderProjectsList();
        updateActiveProjectIndicator();
      });
    }
  }
  
  // Actualizar indicador de proyecto activo
  function updateActiveProjectIndicator() {
    // Actualizar indicador en sección principal
    if (projectManager.activeProject) {
      const project = projectManager.activeProject;
      const localCount = project.analyses ? project.analyses.length : 0;
      const createdDate = new Date(project.createdAt).toLocaleDateString('es-ES');
      
      proyectoActivoNombre.textContent = project.name;
      // Mostrar inicialmente con conteo local
      proyectoActivoInfo.textContent = `${localCount} análisis realizados • Carpeta: ${project.folderPath || 'No especificada'} • Creado: ${createdDate}`;
      
      proyectoActivoIndicador.style.display = 'block';
      sinProyectoIndicador.style.display = 'none';
      
      // Consultar conteo real desde disco (asíncrono)
      if (project.folderPath && window.electronAPI) {
        (async () => {
          try {
            // Intentar leer collection_index.json
            const indexPath = `${project.folderPath}/collection_index.json`;
            const indexResult = await window.electronAPI.readFile(indexPath);
            let realCount = localCount;
            
            if (indexResult.success) {
              const collection = JSON.parse(indexResult.content);
              realCount = (collection.objetos || []).length;
            } else {
              // Si no hay índice, contar carpetas de análisis
              const listResult = await window.electronAPI.listDirectory(project.folderPath);
              if (listResult.success) {
                const _SYS2 = new Set(['imagenes', 'img', 'images', 'thumbnails']);
                realCount = listResult.items.filter(i =>
                  i.isDirectory && !i.name.startsWith('.') && !_SYS2.has(i.name.toLowerCase())
                ).length;
              }
            }
            
            // Actualizar UI con conteo real
            if (realCount !== localCount) {
              proyectoActivoInfo.textContent = `${realCount} análisis realizados • Carpeta: ${project.folderPath || 'No especificada'} • Creado: ${createdDate}`;
              
              // Sincronizar localStorage si difiere
              if (realCount > localCount && indexResult && indexResult.success) {
                try {
                  const collection = JSON.parse(indexResult.content);
                  project.analyses = (collection.objetos || []).map(obj => ({
                    id: obj.id,
                    timestamp: obj.timestamp,
                    nombreObjeto: obj.nombreObjeto,
                    cara: obj.cara,
                    modo: obj.modo,
                    carpeta: obj.carpeta
                  }));
                  projectManager.save();
                } catch (e) { /* no-op */ }
              }
            } else if (realCount > 0) {
              // Conteo coincide pero aseguramos mostrar el valor correcto
              proyectoActivoInfo.textContent = `${realCount} análisis realizados • Carpeta: ${project.folderPath || 'No especificada'} • Creado: ${createdDate}`;
            }
          } catch (e) {
            console.warn('⚠️ No se pudo obtener conteo real de análisis:', e.message);
          }
        })();
      }
    } else {
      proyectoActivoIndicador.style.display = 'none';
      sinProyectoIndicador.style.display = 'block';
    }
  }
  
  // Inicializar indicador
  updateActiveProjectIndicator();
  
  // 🆕 EXPONER FUNCIONES GLOBALMENTE para acceso desde otras partes del código
  window.updateActiveProjectIndicator = updateActiveProjectIndicator;
  window.renderProjectsList = renderProjectsList;
}

// Inicializar UI cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initProjectsUI);
} else {
  initProjectsUI();
}

// ==================================================================================
// NAVEGADOR DE COLECCIONES
// ==================================================================================

