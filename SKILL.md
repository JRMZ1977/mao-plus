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

## Diferencias v1 → v2

| Aspecto | v1 | v2 |
|---------|----|----|
| ReferenceError detection | ❌ No | ✅ Sí |
| Runtime errors | ❌ No | ✅ Sí |
| IPC capture | ❌ No | ✅ Sí |

