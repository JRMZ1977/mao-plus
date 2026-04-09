// MAO Plus — Sistema de indicadores de progreso

// ==================================================================================
// DECLARAR VARIABLES GLOBALES NECESARIAS
// ==================================================================================
let progressTracker = null;  // Rastreador de progreso global

// ==================================================================================
// SISTEMA DE INDICADORES DE PROGRESO MEJORADO
// ==================================================================================

function startDetailedProgress(title, steps, estimatedTime = 10000) {
  progressTracker = {
    active: false,
    overlay: null,
    startTime: null,
    steps: [],
    totalProgress: 0,
    estimatedTime: null,
    cancelled: false
  };

  progressTracker.active = true;
  progressTracker.startTime = Date.now();
  progressTracker.steps = steps.map(step => ({...step, status: 'pending'}));
  progressTracker.currentStepIndex = -1;
  progressTracker.totalProgress = 0;
  progressTracker.estimatedTime = estimatedTime;
  progressTracker.cancelled = false;
  
  if (!progressTracker.overlay) {
    progressTracker.overlay = document.createElement('div');
    progressTracker.overlay.className = 'progress-overlay-container';
    document.body.appendChild(progressTracker.overlay);
  }
  
  progressTracker.overlay.innerHTML = `
    <div class="progress-modal">
      <div class="progress-modal-header">
        <div class="progress-modal-icon">&#x1F504;</div>
        <div class="progress-modal-title">
          <h3 id="progressTitle">${title}</h3>
          <p id="progressSubtitle">Preparando...</p>
        </div>
      </div>
      
      <div class="progress-bar-container">
        <div class="progress-bar" id="progressBar" style="width: 0%"></div>
      </div>
      
      <div class="progress-percentage" id="progressPercentage">0%</div>
      
      <ul class="progress-steps" id="progressStepsList"></ul>
      
      <div class="progress-footer">
        <div class="progress-time" id="progressTime">
          <strong>Tiempo transcurrido:</strong> 0s
        </div>
        <button class="progress-cancel-btn" id="progressCancelBtn">
          Cancelar
        </button>
      </div>
    </div>
  `;
  
  const cancelBtn = document.getElementById('progressCancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (confirm('¿Estas seguro de cancelar este proceso?')) {
        progressTracker.cancelled = true;
        endDetailedProgress(false, 'Proceso cancelado por el usuario');
      }
    });
  }
  
  if (progressTracker.overlay) {
    progressTracker.overlay.style.display = 'flex';
    progressTracker.overlay.style.animation = 'fadeInOverlay 0.3s ease forwards';
  }
  
  renderProgressSteps();
  updateProgressTime();
}

function updateDetailedProgress(stepId, detail = null) {
  if (!progressTracker.active || progressTracker.cancelled) return;
  
  const stepIndex = progressTracker.steps.findIndex(s => s.id === stepId);
  if (stepIndex === -1) return;
  
  for (let i = 0; i <= stepIndex; i++) {
    if (progressTracker.steps[i].status !== 'completed') {
      progressTracker.steps[i].status = i === stepIndex ? 'in-progress' : 'completed';
    }
  }
  
  if (detail && stepIndex < progressTracker.steps.length) {
    progressTracker.steps[stepIndex].detail = detail;
  }
  
  progressTracker.currentStepIndex = stepIndex;
  
  const completedSteps = progressTracker.steps.filter(s => s.status === 'completed').length;
  progressTracker.totalProgress = Math.round((completedSteps / progressTracker.steps.length) * 100);
  
  const progressBar = document.getElementById('progressBar');
  const progressPercentage = document.getElementById('progressPercentage');
  const progressSubtitle = document.getElementById('progressSubtitle');
  
  if (progressBar) progressBar.style.width = `${progressTracker.totalProgress}%`;
  if (progressPercentage) progressPercentage.textContent = `${progressTracker.totalProgress}%`;
  if (progressSubtitle && stepIndex >= 0) {
    progressSubtitle.textContent = progressTracker.steps[stepIndex].title;
  }
  
  renderProgressSteps();
}

function completeCurrentStep() {
  if (!progressTracker.active || progressTracker.currentStepIndex === -1) return;
  
  progressTracker.steps[progressTracker.currentStepIndex].status = 'completed';
  
  const nextIndex = progressTracker.currentStepIndex + 1;
  if (nextIndex < progressTracker.steps.length) {
    progressTracker.steps[nextIndex].status = 'in-progress';
    progressTracker.currentStepIndex = nextIndex;
    
    const progressSubtitle = document.getElementById('progressSubtitle');
    if (progressSubtitle) {
      progressSubtitle.textContent = progressTracker.steps[nextIndex].title;
    }
  }
  
  const completedSteps = progressTracker.steps.filter(s => s.status === 'completed').length;
  progressTracker.totalProgress = Math.round((completedSteps / progressTracker.steps.length) * 100);
  
  const progressBar = document.getElementById('progressBar');
  const progressPercentage = document.getElementById('progressPercentage');
  
  if (progressBar) progressBar.style.width = `${progressTracker.totalProgress}%`;
  if (progressPercentage) progressPercentage.textContent = `${progressTracker.totalProgress}%`;
  
  renderProgressSteps();
}

function renderProgressSteps() {
  const stepsList = document.getElementById('progressStepsList');
  if (!stepsList) return;
  
  stepsList.innerHTML = progressTracker.steps.map(step => {
    let icon = '&#x23F3;';
    if (step.status === 'completed') icon = '&#x2705;';
    else if (step.status === 'in-progress') icon = '&#x1F504;';
    else icon = '&#x23F9;';
    
    return `
      <li class="progress-step ${step.status}">
        <div class="progress-step-icon">${icon}</div>
        <div class="progress-step-text">
          <div class="step-title">${step.title}</div>
          ${step.detail ? `<div class="step-detail">${step.detail}</div>` : ''}
        </div>
      </li>
    `;
  }).join('');
}

function updateProgressTime() {
  if (!progressTracker.active) return;
  
  const elapsed = Math.floor((Date.now() - progressTracker.startTime) / 1000);
  const progressTime = document.getElementById('progressTime');
  
  if (progressTime) {
    let timeText = `<strong>Tiempo transcurrido:</strong> ${elapsed}s`;
    
    if (progressTracker.estimatedTime && elapsed < progressTracker.estimatedTime) {
      const remaining = progressTracker.estimatedTime - elapsed;
      timeText += ` | <strong>Tiempo estimado restante:</strong> ~${remaining}s`;
    }
    
    progressTime.innerHTML = timeText;
  }
  
  setTimeout(updateProgressTime, 1000);
}

function endDetailedProgress(success = true, message = null) {
  if (!progressTracker.active) return;
  
  progressTracker.active = false;
  
  if (success) {
    progressTracker.steps.forEach(step => step.status = 'completed');
    progressTracker.totalProgress = 100;
    
    const progressBar = document.getElementById('progressBar');
    const progressPercentage = document.getElementById('progressPercentage');
    const progressSubtitle = document.getElementById('progressSubtitle');
    
    if (progressBar) progressBar.style.width = '100%';
    if (progressPercentage) progressPercentage.textContent = '100%';
    if (progressSubtitle) progressSubtitle.textContent = message || 'Proceso completado!';
    
    renderProgressSteps();
    
    setTimeout(() => {
      if (progressTracker.overlay) {
        progressTracker.overlay.style.animation = 'fadeInOverlay 0.3s ease reverse';
        setTimeout(() => {
          if (progressTracker.overlay && progressTracker.overlay.parentNode) {
            progressTracker.overlay.parentNode.removeChild(progressTracker.overlay);
          }
          progressTracker.overlay = null;
        }, 300);
      }
      
      if (message) toast.success(message);
    }, 1000);
  } else {
    if (progressTracker.overlay && progressTracker.overlay.parentNode) {
      progressTracker.overlay.style.animation = 'fadeInOverlay 0.3s ease reverse';
      setTimeout(() => {
        if (progressTracker.overlay && progressTracker.overlay.parentNode) {
          progressTracker.overlay.parentNode.removeChild(progressTracker.overlay);
        }
        progressTracker.overlay = null;
      }, 300);
    }
    
    if (message) {
      if (progressTracker.cancelled) {
        toast.warning(message);
      } else {
        toast.error(message);
      }
    }
  }
}

function isProgressCancelled() {
  return progressTracker.cancelled;
}

// ==================================================================================
// SISTEMA DE GESTION DE PROYECTOS
// ==================================================================================

