// MAO Plus — Sistema de bienvenida / guía de inicio
    /**
     * 📖 SISTEMA DE BIENVENIDA / GUÍA DE INICIO SIMPLE
     * Panel que explica el proceso en 3 pasos de forma clara y directa
     */
    
    function mostrarBienvenida() {
      const panel = document.getElementById('panelBienvenida');
      if (panel) {
        panel.classList.remove('hidden');
      }
    }
    
    function cerrarBienvenida() {
      const panel = document.getElementById('panelBienvenida');
      if (panel) {
        panel.classList.add('hidden');
      }
    }
    
    function guardarPreferenciaBienvenida() {
      const checkbox = document.getElementById('noMostrarMas');
      if (checkbox && checkbox.checked) {
        localStorage.setItem('mao_no_mostrar_bienvenida', 'true');
      } else {
        localStorage.removeItem('mao_no_mostrar_bienvenida');
      }
    }
    
    /**
     * El panel NO se muestra automáticamente.
     * Solo se abre cuando el usuario hace click en el botón 📖
     */
    // Auto-start deshabilitado para no interferir con la UI de MAO
