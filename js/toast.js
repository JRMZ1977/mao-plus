// MAO Plus — Toast Manager
// ============================================================================
// 🔔 SISTEMA DE TOASTS - Notificaciones No Intrusivas
// ============================================================================

class ToastManager {
  constructor() {
    this.container = this.createContainer();
    document.body.appendChild(this.container);
  }
  
  createContainer() {
    const div = document.createElement('div');
    div.className = 'toast-container';
    return div;
  }
  
  show(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icons = {
      success: '',
      error: '',
      warning: '',
      info: 'ℹ'
    };
    
    toast.innerHTML = `
      <div class="toast-icon">${icons[type] || icons.info}</div>
      <div class="toast-message">${message}</div>
      <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    this.container.appendChild(toast);
    
    // Auto-cerrar después de la duración especificada
    if (duration > 0) {
      setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }
    
    return toast;
  }
  
  success(message, duration = 4000) {
    return this.show(message, 'success', duration);
  }
  
  error(message, duration = 5000) {
    return this.show(message, 'error', duration);
  }
  
  warning(message, duration = 4500) {
    return this.show(message, 'warning', duration);
  }
  
  info(message, duration = 4000) {
    return this.show(message, 'info', duration);
  }
}

// Crear instancia global
const toast = new ToastManager();
