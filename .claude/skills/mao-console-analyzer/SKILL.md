---
name: mao-console-analyzer
description: >
  Captura automáticamente TODOS los errores de Electron (renderer + main process),
  incluyendo ReferenceError, TypeError en tiempo real via IPC listener.
  Categoriza por severidad, propone causas raíz y correcciones automáticas.
  MEJORA v2: Detección real de errores de RUNTIME, no solo parse-time.
---

# MAO Console Analyzer v2 (mejorado)

## Propósito
Capturar, categorizar y analizar TODOS los errores de la aplicación,
con detección en tiempo real de ReferenceError, TypeError y otros errores de runtime.

## Arquitectura Mejorada v2

El renderer ahora envía errores via IPC al main process:

```
Renderer Error → preload.js listener → IPC send → main.js listener → .mao_renderer_errors.log
```

Esto permite detectar errores que SOLO aparecen en runtime, como ReferenceError.

## Pasos de Ejecución

### PASO 1: Verificar Electron

```bash
pgrep -f "electron ." > /dev/null && echo "✅ Electron corriendo"
```

### PASO 2: Verificar error reporter en preload.js

```bash
grep -q "window.addEventListener('error'" preload.js && echo "✅ Reporter activo"
```

### PASO 3: Leer errores del renderer

```bash
# Log generado automáticamente por IPC listener
if [ -f "/tmp/.mao_renderer_errors.log" ]; then
  cat "/tmp/.mao_renderer_errors.log"
else
  echo "✅ Sin errores del renderer capturados"
fi
```

### PASO 4: Leer errores del main process

```bash
cat /tmp/mao-main.log | grep -iE "ERROR|WARN|error" || echo "✅ Sin errores en main"
```

### PASO 5-8: Consolidar, analizar, proponer fixes

Patrones detectados automáticamente:
- ReferenceError → sugerir agregar parámetro
- TypeError → verificar export/import
- Cannot find module → verificar ruta

### PASO 9: Inspección de DOM/CSS en runtime (bugs silenciosos de layout)

Algunos bugs NO lanzan error (no aparecen en logs ni IPC): layout roto, elementos
ocultos, CSS que no aplica. `node -c` y el health check tampoco los ven. Para
detectarlos, inspecciona el DOM real desde el main process volcando a stdout:

```js
// Insertar temporal en main.js (did-finish-load) y revertir tras verificar:
mainWindow.webContents.executeJavaScript(`(()=>{
  var el = document.getElementById('ELEMENTO_SOSPECHOSO');
  var r = el ? el.getBoundingClientRect() : null;
  return JSON.stringify({
    existe: !!el,
    rect: r && { x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height) },
    display: el && getComputedStyle(el).display,
    zIndex: el && getComputedStyle(el).zIndex,
    tapadoPor: el && r ? (document.elementFromPoint(r.x+r.width/2, r.y+r.height/2)||{}).id : null
  });
})()`).then(r => console.log('[DIAG]', r));
```

Esto es MÁS FIABLE que la consola de DevTools (que, acoplada, queda cortada en
pantalla). Para saber qué reglas CSS ganan, iterar `document.styleSheets` y probar
`el.matches(rule.selectorText)`.

**⚠️ Caché de CSS `file://`**: Electron sirve versiones cacheadas del CSS entre
relanzamientos. Si un cambio de CSS "no aplica", probablemente no se recargó: bump
el `?v=` del `<link>` en `index.html` (o limpia caché) antes de concluir nada.

## Diferencias v1 → v2

| Aspecto | v1 | v2 |
|---------|----|----|
| ReferenceError detection | ❌ No | ✅ Sí |
| Runtime errors | ❌ No | ✅ Sí |
| IPC capture | ❌ No | ✅ Sí |
| Bugs de layout/CSS (silenciosos) | ❌ No | ✅ Sí (PASO 9, inspección de DOM) |

## Lecciones Aprendidas (Evaluación Fases 1-5)

### Validación Exitosa Post-Deployment
Este skill fue validado en fases 3 (Runtime Monitoring) durante una evaluación comprensiva:
- **Fase 3 Result**: ✅ PASS - Capturó correctamente 0 ReferenceErrors post-fix
- **Fase 4 Result**: ✅ PASS - Boot metrics: 2831ms, 6.7% variación
- **Fase 5 Result**: ✅ PASS - Resilience: Watchdog, fallbacks, port conflict resolution

### Patrón de Errores Cascada Detectado
Durante refactoring de módulos ES6, se identificó un patrón de errores en cascada:
- **Problema**: Funciones extraídas perdieron acceso a 14 variables globales
- **Manifestación**: ReferenceError en zoom, statusDiv, contourCache, objects, etc.
- **Solución**: viewState pattern centralizado
- **Rol del Skill**: mao-console-analyzer v2 fue crítico para IDENTIFICAR este patrón

### Recomendaciones para Futuras Extracciones
1. **Ejecutar ANTES de extraer**:
   - Usar mao-launch para validar estado actual (SyntaxError, backend, Tier 1 API)

2. **Ejecutar DESPUÉS de extraer**:
   - Usar mao-console-analyzer inmediatamente para detectar ReferenceError/TypeError
   - Buscar patrones: múltiples errores de la misma variable sugieren loss of scope

3. **Si se detecta cascada**:
   - Crear viewState object en módulo extraído
   - Exportar initializeViewState() para sincronización
   - Pasar todas las variables globales usadas como parte del state

### Mejoras Futuras Posibles
- [ ] Agregar patrón matcher para detectar "loss of scope" automáticamente
- [ ] Sugerir viewState pattern en mensaje de correción
- [ ] Integrar con mao-launch para reporte unificado

