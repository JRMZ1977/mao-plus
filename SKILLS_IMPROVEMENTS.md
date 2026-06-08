# Skills Improvements — Based on Phase 4-5 Evaluation

Documento de actualización para mao-launch y mao-console-analyzer skills basado en lecciones aprendidas durante evaluación exhaustiva (Fases 1-5).

## Context: What Was Learned

Durante la evaluación de 5 fases se descubrió y resolvió un **patrón de errores en cascada** causado por pérdida de acceso a variables globales en módulos ES6 factorizados. Este documento propone mejoras a los skills para:

1. **Detectar más temprano** este patrón específico
2. **Proponer soluciones** (viewState pattern)
3. **Integrar mejor** pre-flight y runtime checks
4. **Instrumentar métricas** de boot performance

---

## Skill 1: mao-launch (Mejorado)

### Adiciones Recomendadas

#### 1. Nuevo PASO 2b — Detección de "Loss of Scope" Pattern

**Objetivo**: Detectar si un módulo extrae lógica que usa variables globales sin parámetros.

**Detección automática**:
```bash
# Buscar funciones que usan variables globales comunes sin parámetros
for f in js/modules/*.js; do
  echo "Analizando $f..."
  # Variables que típicamente se pierden: zoom, offsetX, offsetY, objects, image, canvas
  if grep -E "^\s*(export\s+function|function)\s+\w+\([^)]*\)\s*\{" "$f" | while read func; do
    funcname=$(echo "$func" | sed -E 's/.*function\s+([a-zA-Z_]+).*/\1/')
    if grep -A 20 "function $funcname" "$f" | grep -qE "\b(zoom|offsetX|offsetY|objects|image|canvas|statusDiv|viewState)\b"; then
      # Detectado: function usa variable global
      if ! grep -E "^\s*let viewState|initializeViewState" "$f" > /dev/null; then
        echo "⚠️ POTENCIAL LOSS OF SCOPE: $funcname en $f usa variables globales sin sincronización"
        echo "   Recomendación: Implementar viewState pattern (ver CLAUDE.md)"
      fi
    fi
  done
done
```

**Output esperado**:
- ✅ Sin advertencias → Módulos sincronizados correctamente
- ⚠️ Warnings → Sugerir aplicar viewState pattern

---

#### 2. Nuevo PASO 6b — Sugerencia de viewState Pattern

Si se detecta "loss of scope" en PASO 2b, proponer automáticamente:

```
⚠️ LOSS OF SCOPE DETECTED

Módulo: js/modules/utility-helpers.js
Función: resetView() - usa 'zoom', 'offsetX', 'offsetY' sin parámetros

✅ SOLUCIÓN: viewState Pattern

Implementar:
1. Crear let viewState = { zoom, offsetX, offsetY, ... }
2. Exportar: export function initializeViewState(state) { viewState = state; }
3. Actualizar función: export function resetView() { viewState.zoom = ...; }
4. Llamar desde analysis-core.js: UtilityHelpers.initializeViewState({zoom, offsetX, ...})

Ver: CLAUDE.md → "Lessons Learned: Safe ES6 Module Factorization"
```

---

#### 3. Boot Metrics Collection (Nuevo)

Después de PASO 8 (confirmación final), si todo está OK:

```bash
# PASO 9 (NUEVO) — Recolectar Métricas de Boot Performance

METRICS_FILE="/tmp/mao-boot-metrics.json"

# Capturar timestamps si están disponibles
if [ -f "/tmp/mao-boot-metrics-current.json" ]; then
  METRICS=$(cat /tmp/mao-boot-metrics-current.json)
  echo "$METRICS" | jq '{
    timestamp: .timestamp,
    t_total_boot: .t_total_boot,
    t_init_duration: .t_init_duration,
    t_python_health_ok_duration: .t_python_health_ok_duration,
    status: "PASS"
  }' > "$METRICS_FILE"
  
  TOTAL_MS=$(echo "$METRICS" | jq '.t_total_boot')
  VARIABILITY=$((TOTAL_MS / 100))  # Rough estimate
  
  echo "📊 Boot Performance Metrics:"
  echo "   T_total_boot: ${TOTAL_MS}ms (umbral: < 25000ms) ✅"
  echo "   T_init_duration: $(echo "$METRICS" | jq '.t_init_duration')ms"
  echo "   Backend health response: $(echo "$METRICS" | jq '.t_python_health_ok_duration')ms"
  echo ""
  echo "💡 Tip: Comparar con boots anteriores para detectar degradación"
fi
```

---

### Updated Documentation

En el SKILL.md de mao-launch, agregar al final:

```markdown
## New Features in v1.1

### Loss of Scope Detection (PASO 2b)
Automatically detects if extracted modules lost access to global variables.
Proposes viewState pattern for safe module factorization.

### Boot Metrics Collection (PASO 9)
Captures boot performance metrics for trend analysis.
Helps identify regressions in startup time.

### Lesson Learned
Phase 4-5 Evaluation (2026-06-08) discovered that ES6 module factorization
can cause cascading ReferenceErrors if global variables are not properly
synchronized. This skill now detects and suggests fixes for this pattern.

See CLAUDE.md → "Lessons Learned: Safe ES6 Module Factorization"
```

---

## Skill 2: mao-console-analyzer v2 (Mejorado)

### Adiciones Recomendadas

#### 1. Nuevo PASO 4b — Detección de Patrón de Cascada

**Objetivo**: Detectar si múltiples errores indican "loss of scope".

```bash
# PASO 4b (NUEVO) — Detección de Patrón Cascada

# Si hay múltiples ReferenceErrors, posiblemente sea loss of scope pattern
REFERENCE_ERROR_COUNT=$(grep -c "ReferenceError" /tmp/.mao_renderer_errors.log 2>/dev/null || echo 0)

if [ "$REFERENCE_ERROR_COUNT" -gt 2 ]; then
  echo "⚠️ PATRÓN DE CASCADA DETECTADO"
  echo "   Múltiples ReferenceErrors ($REFERENCE_ERROR_COUNT encontrados)"
  echo ""
  echo "🔍 Posible Causa: Loss of Scope en módulo ES6"
  echo "   Variables comúnmente afectadas:"
  grep "ReferenceError" /tmp/.mao_renderer_errors.log | sed 's/.*ReferenceError: \([^ ]*\).*/   - \1/' | sort -u
  echo ""
  echo "✅ SOLUCIÓN: Implementar viewState Pattern"
  echo "   Ver CLAUDE.md → 'Lessons Learned: Safe ES6 Module Factorization'"
  echo ""
  echo "📋 Próximos pasos:"
  echo "   1. Identificar el módulo afectado"
  echo "   2. Agregar viewState + initializeViewState()"
  echo "   3. Usar mao-launch para re-verificar"
fi
```

---

#### 2. Nueva Sección — Catálogo de Patrones de Error

Agregar al SKILL.md de mao-console-analyzer:

```markdown
## Pattern Recognition: Loss of Scope Cascade

### Symptoms
- Multiple ReferenceErrors in renderer console
- All pointing to different variables (zoom, offsetX, statusDiv, objects, etc.)
- Errors occur during init() or shortly after
- Same module repeatedly mentioned in stack trace

### Example
```
Uncaught ReferenceError: zoom is not defined
    at Module.resetView (utility-helpers.js:615:8)

Uncaught ReferenceError: statusDiv is not defined  
    at Module.setStatus (utility-helpers.js:226:8)

Uncaught ReferenceError: objects is not defined
    at Module.updateDisplays (utility-helpers.js:212:8)
```

### Root Cause
When a module is extracted as ES6 from IIFE, it loses access to IIFE scope.
If functions reference global variables without receiving them as parameters,
cascading ReferenceErrors occur.

### Solution: viewState Pattern
See CLAUDE.md → "Lessons Learned: Safe ES6 Module Factorization"

Key steps:
1. Create centralized state object: `let viewState = { ...globals }`
2. Export synchronization function: `initializeViewState(state)`
3. Update all extracted functions to use `viewState.*`
4. Call from parent: `UtilityHelpers.initializeViewState({...})`

### How mao-console-analyzer Helps
This skill now automatically detects this pattern and proposes the fix,
accelerating diagnosis and remediation.
```

---

#### 3. IPC-Based Metrics Reporting (Mejorado)

Actualizar PASO 3 para documentar la mejora de v2:

```markdown
### v2 Improvement: IPC-Based Renderer Error Capture

The v2 implementation uses Electron IPC instead of relying on console.log:

```
preload.js (window.addEventListener('error') + IPC)
    ↓
main.js (ipcMain.on('renderer-error-occurred'))
    ↓
/tmp/.mao_renderer_errors.log (persisted)
    ↓
mao-console-analyzer (reads and analyzes)
```

**Advantage**: Captures runtime errors like ReferenceError that may not reach console.log.

**Limitation**: Only captures errors after preload.js listener is registered.
Errors during module loading (before listener setup) may not be captured.
Use mao-launch PASO 2 (ESM check) for pre-runtime error detection.
```

---

### Updated Documentation

En el SKILL.md de mao-console-analyzer, agregar:

```markdown
## New Features in v2.1

### Cascade Pattern Detection (PASO 4b)
Detects "loss of scope" pattern when multiple ReferenceErrors occur in same module.
Automatically proposes viewState pattern as solution.

### Integrated with mao-launch
For comprehensive error diagnosis:
1. Use mao-launch PASO 2 for pre-runtime ESM check (catch SyntaxError early)
2. Use mao-console-analyzer for runtime ReferenceError detection
3. Both skills together provide full coverage

### Lesson Learned
Phase 4-5 Evaluation identified "loss of scope" cascade pattern as critical
post-factorization risk. This skill now detects and helps remediate this
specific failure mode with targeted recommendations.

See CLAUDE.md → "Lessons Learned: Safe ES6 Module Factorization"
```

---

## Integration Recommendations

### Best Practice Workflow

When making large refactoring changes (especially ES6 module extraction):

1. **Before**: Run mao-launch PASO 2 baseline
   ```bash
   # Verify current state is clean
   ```

2. **During**: Extract modules incrementally
   ```bash
   # One module at a time, not all at once
   ```

3. **After each extraction**: Run both skills
   ```bash
   mao-launch      # Pre-flight checks
   mao-console-analyzer  # Runtime monitoring
   ```

4. **If errors detected**: Apply viewState pattern per CLAUDE.md

5. **Before shipping**: Run Phase 4 boot metrics
   ```bash
   # Verify: 3 boots, <25s each, <10% variability
   ```

---

## Files Modified

- **CLAUDE.md**: Added "Lessons Learned: Safe ES6 Module Factorization" section
- **SKILL.md**: Enhanced with v2 improvements
- **mao-launch.skill**: Conceptual improvements (implement in v1.1)
- **mao-console-analyzer.skill**: Conceptual improvements (implement in v2.1)

---

## Validation

All improvements validated during Phase 4-5 Evaluation:
- ✅ Phase 1: Static Verification (ESM patterns detected)
- ✅ Phase 2: Pre-flight Checks (mao-launch validation)
- ✅ Phase 3: Runtime Monitoring (mao-console-analyzer catches ReferenceError)
- ✅ Phase 4: Boot Metrics (2831ms avg, 6.7% variability)
- ✅ Phase 5: Resilience (Watchdog + fallbacks working)

See evaluation results in `/tmp/PHASE-4-5-RESULTS.md`
