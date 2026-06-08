# 🔬 AUDITORÍA QUIRÚRGICA UI/UX — MAO Plus
## Sistema de Pestañas LAAR (Laboratorio de Análisis Arqueológico)

**Fecha:** 2025-06-08  
**Alcance:** Implementación, accesibilidad, coherencia visual y flujo de usuario  
**Estado Actual:** ⚠️ **PARCIALMENTE IMPLEMENTADO**

---

## 📋 RESUMEN EJECUTIVO

El sistema LAAR está **estructuralmente correcto pero INCOMPLETO**:
- ✅ Tabbar visible y funcional (32px, con progreso)
- ✅ Estilos CSS completamente definidos (846 líneas)
- ✅ Lógica de router robusta (Strangler Fig pattern)
- ❌ **Controla <2% del contenido (8 de 636+ elementos)**
- ❌ **7 sistemas de tabs alternativos coexisten (conflicto visual)**
- ❌ **Paletas CSS inconsistentes (!important overrides)**

**Riesgo sin remediación:** Confusión de usuarios, navegación inesperada, accesibilidad deficiente.

---

## 📁 ÍNDICE DE ARCHIVOS

### Archivos de Código (26 total)

#### Frontend JavaScript
- `js/mao-tab-router.js` ← **NEW LAAR system** (487 líneas)
- `js/analysis-core.js` ← IIFE bridge + 10 módulos ES6
- `js/comparator.js` (statistics → `.cmo-tab-btn`)
- `js/mao-ia.js` (legacy → `.mao-ia-tab`)
- `js/canvas-zoom.js`, `js/procrustes.js`, `js/export-manager.js`
- 3D visualization: `js/obj3d-*.js` (4 archivos)
- UI utilities: `js/theme.js`, `js/tooltips.js`, `js/sidebar-nav.js`

#### Frontend Styles
- `css/main.css` (paleta anterior: grises cálidos)
- `css/mao-tabs-laar.css` **← NEW LAAR** (846 líneas, sobreescrituras !important)

#### HTML
- `index.html` (4464 líneas, monolítico)

#### Backend
- `python/server.py` (FastAPI)
- 13 módulos de análisis

### Archivos de Documentación
- `GUIA_METRICAS_MAO.html`
- `FORMULAS_METRICAS_MAO.html`
- `PRINCIPIOS_MORFOMETRIA_MAO.html`
- `GLOSARIO_TERMINOS_MAO.html`
- `ANALISIS_3D_MAO.html`

### Módulos ES6 (Phase 2)
```
js/modules/
├── geometry-primitives.js
├── contour-quality.js
├── morphometric-metrics.js
├── utility-helpers.js
├── shape-classification.js
├── contour-extraction.js
├── classification-engine.js
├── metrics-orchestrator.js
├── visualization-export.js
├── tabla-metricas-completa.js
└── bifacial-analysis.js
```

---

## 🏗️ ARQUITECTURA: SISTEMA DE TABS LAAR

### Nivel 1: CSS (mao-tabs-laar.css)

#### ✅ Fortalezas
- Paleta consolidada (grises Tailwind + azul slate)
- Variables CSS bien nombradas (--laar-white, --laar-g100, --laar-b500)
- Componentes documentados:
  - `.mao-tabbar` (32px flex container)
  - `.mao-tab` (tab button con indicator)
  - `.tab-badge`, `.tab-progress` (elementos de estado)
  - `.mao-pane`, `.mao-workspace` (content containers)
- Transiciones smooth (100ms ease)

#### ⚠️ Advertencias
- Líneas 23-82: Sobreescrituras con `!important`
  ```css
  --primary: var(--laar-b500) !important;  /* Redefine main.css */
  --sidebar-bg: var(--laar-g100) !important;
  --text-primary: var(--laar-g900) !important;
  ```
- Líneas 87-97: Oculta sidebar entero con `display: none !important`
  ```css
  #maoSidebar, .sidebar, [id*="sidebar"] { display: none !important; }
  ```

### Nivel 2: Lógica (mao-tab-router.js)

#### ✅ Fortalezas
- **Strangler Fig pattern**: No toca lógica existente, solo controla visibilidad
- **Configuración declarativa** (TABS array, líneas 41-85):
  ```javascript
  var TABS = [
    { id: 'proyecto', label: 'Proyecto', icon: '①', sections: [...] },
    { id: 'captura', label: 'Captura', icon: '②', sections: [...] },
    { id: 'analisis', label: 'Análisis', icon: '③', sections: [...] },
    { id: 'resultados', label: 'Resultados', icon: '④', sections: [...] }
  ];
  ```
- **API robusta** (`window.maoTabRouter`):
  - `go(tabId)` — navegar
  - `markDone(tabId)`, `lock(tabId)`, `setBadge(tabId, count)`
  - `getState()` — obtener estado
- **Accesibilidad**: `role="tab"`, `aria-selected`, `aria-disabled`
- **Teclado**:
  - `Alt+← / →` para navegar
  - `Alt+1…4` para ir directo a tab

#### ❌ Problemas Críticos

**PRIORIDAD 1: Mapeo incompleto (cobertura <2%)**
```javascript
// Líneas 46-84: Solo 8 IDs mapeados
sections: [
  'fieldsetGestionProyectos',
  'sectionIdentificacion',
  'sectionModo',
  'sectionImagen',
  'sectionEscala',
  'canvasMonofacial',
  'canvasBifacial',
  'bifacialComparisonsSection'
]
// Faltan: ~628 otras secciones del HTML
```

**PRIORIDAD 2: Inline styles conflictúan con CSS**
```javascript
// Líneas 115-138: estilos duplicados
bar.style.display = 'flex';
bar.style.height = '32px';
bar.style.backgroundColor = '#E5E7EB';
// ← Ya definido en CSS, causa especificidad confusa
```

### Nivel 3: HTML (index.html)

#### ❌ Problemas Críticos

**PRIORIDAD 3: Duplicación de 7 sistemas de tabs**

| Sistema | Ubicación | Clase | ARIA | CSS | Estado |
|---------|-----------|-------|------|-----|--------|
| **LAAR** | Flujo principal | `.mao-tab` | ✅ | ✅ | Nuevo |
| CMO | Statistics | `.cmo-tab-btn` | ❌ | Inline | Legacy |
| Bifacial | Análisis bifacial | `.bifacial-tab` | ❌ | Inline | Legacy |
| MAO-IA | Fichas análisis | `.mao-ia-tab` | ❌ | Inline | Legacy |
| Procrustes | Overlay forma | `.ps-tab-btn` | ❌ | Inline | Legacy |
| Analysis | Viewer | `.analysis-tab` | ❌ | Inline | Legacy |
| Genérico | Varias | `.tab-btn` | ❌ | Inline | Legacy |

Ejemplos de conflictos:

**CMO tabs (comparator.js)**
```html
<!-- Línea 1644 -->
<button class="cmo-tab-btn active" data-tab="tabla" style="...inline...">
  &#128202; Tabla
</button>
```

**Bifacial tabs**
```html
<!-- Línea 2051 -->
<button class="bifacial-tab active" data-tab="tabla" 
  style="flex: 1; padding: 12px; background: white; ...">
  Tabla
</button>
```

**MAO-IA tabs**
```html
<!-- Línea 3651 -->
<button class="mao-ia-tab" data-tab="canvas" 
  style="padding:4px 12px;border:none;...background:#6f42c1;...">
  Contornos
</button>
```

---

## 🔍 DIAGNÓSTICO DETALLADO

### 1. Visibilidad del Tabbar LAAR

| Aspecto | Estado | Detalles |
|---------|--------|----------|
| Presente en DOM | ✅ | Inyectado después de header (línea ~30 de router) |
| Renderizado | ✅ | 32px, flex, grises LAAR visibles |
| Accesible | ⚠️ | `role="tab"`, pero otros tabs sin ARIA |
| **Control de contenido** | ❌ | **8 secciones mapeadas de 636+** |

### 2. Coherencia Visual

#### Conflicto de Paletas

**Paleta LAAR (mao-tabs-laar.css)**
```
Blanco dominante:   #FFFFFF
Grises Tailwind:    #F3F4F6 → #111827
Acento único:       slate-blue #2563EB
```

**Paleta anterior (main.css, aún activa)**
```
Grises cálidos, oranges, purples
Variables: --primary, --accent, etc.
Sobreescrita por !important en LAAR
```

#### Resulta en:
- Botones en tabbar: azul correcto
- Botones en panels: ¿gris o acento?
- Badges: color incorrecto a veces
- Indicadores: mezcla de paletas

### 3. Accesibilidad

#### ✅ ARIA en LAAR tabs
```html
<div class="mao-tab" role="tab" aria-selected="false">
```

#### ❌ Falta en otros elementos
- `.cmo-tab-btn` sin `role="tab"`
- `.bifacial-tab` sin `aria-selected`
- `.tab-indicator` sin `aria-label` (solo visual)
- `.tab-badge` sin `aria-label` (no anunciado: "2 advertencias")
- Campos sin `tabindex` consistente

#### ❌ Lectores de pantalla
- ✅ Tab activo anunciado
- ❌ Badge ("2 advertencias") no anunciado
- ❌ Indicator color no anunciado
- ❌ Otros 7 sistemas de tabs ignorados por AT

### 4. Integración con Flujos Existentes

#### Eventos esperados (bindMaoEvents, líneas 410-462)
```javascript
document.addEventListener('mao:detection:done', function () {
  router.markDone('captura');
  router.go('analisis');
});
```

#### ⚠️ Pero:
- ¿Quién dispara `mao:detection:done`?
- ¿Desde qué archivo?
- No está claramente acoplado

#### Resultado:
- Si no se disparan eventos → tabs no avanzan automáticamente
- Usuario debe hacer click manualmente en cada tab

### 5. Performance

#### Display:none excesivo
```javascript
// showSectionsFor() oculta todas las demás secciones
allSections.forEach(function (sid) {
  var el = document.getElementById(sid);
  if (el) {
    el.style.display = 'none';  // ← Causa reflow
  }
});
```

#### Impacto
- Cada navegación → 600+ elementos pasan display: block → none
- Layout thrashing en cada cambio de tab
- Especialmente malo en máquinas lentas

---

## 🚨 HALLAZGOS CRÍTICOS (Priorizado)

### 🔴 PRIORIDAD 1: Mapeo Incompleto de Secciones

**Archivo:** `js/mao-tab-router.js` (líneas 46-84)

**Problema:**
```javascript
sections: [
  'fieldsetGestionProyectos',     // ← 1
  'sectionIdentificacion',        // ← 2
  'sectionModo',                  // ← 3
  'sectionImagen',                // ← 4
  'sectionEscala',                // ← 5
  'canvasMonofacial',             // ← 6
  'canvasBifacial',               // ← 7
  'bifacialComparisonsSection'    // ← 8
  // Faltan ~628 secciones más
]
```

**Impacto:**
- Las 628+ otras secciones nunca se ocultarán/mostrarán
- Usuario navega tab pero ve contenido de otro tab
- Navegación rota

**Solución requerida:**
- Escanear `index.html` para ALL `id=` attributes
- Agrupar por tab lógico (Proyecto, Captura, Análisis, Resultados)
- Reemplazar TABS array completo

**Esfuerzo:** 2-4 horas (requiere lectura de 4464 líneas de HTML)

---

### 🔴 PRIORIDAD 2: Conflicto de Estilos CSS

**Archivos:** `css/main.css` + `css/mao-tabs-laar.css`

**Problema:**
```css
/* main.css */
:root {
  --primary: var(--someOlderColor);
  --sidebar-bg: var(--warmGray);
}

/* mao-tabs-laar.css (líneas 73-82) */
:root {
  --primary: var(--laar-b500) !important;      /* ← override */
  --sidebar-bg: var(--laar-g100) !important;
  --accent: var(--laar-b500) !important;
  --text-primary: var(--laar-g900) !important;
  --text-secondary: var(--laar-g500) !important;
  --border-color: var(--laar-g200) !important;
}
```

**Impacto:**
- Botones fuera del tabbar: color impredecible
- UI de legacy (statistics, procrustes) con paleta antigua
- Transición visual desigual

**Solución requerida:**
- Opción A: Eliminar main.css (refactor completo)
- Opción B: Refactorizar CSS order (eliminar !important)
- Opción C: Crear `css/laar-bridge.css` para compatibilidad

**Esfuerzo:** 4-8 horas

---

### 🔴 PRIORIDAD 3: Duplicación de 7 Sistemas de Tabs

**Localizaciones:**
- `.cmo-tab-btn` → `comparator.js`
- `.bifacial-tab` → `analysis-core.js`
- `.mao-ia-tab` → `mao-ia.js`
- `.ps-tab-btn` → `procrustes.js`
- `.analysis-tab` → viewers
- `.tab-btn` → varios
- `.mao-tab` → LAAR (nuevo)

**Problema:**
- Cada módulo gestiona sus propios tabs
- Inconsistencia visual (estilos inline)
- Mantenimiento fragmentado
- ARIA solo en LAAR

**Impacto:**
- Confusión visual para usuarios
- Código técnico deuda
- Accesibilidad deficiente

**Solución requerida:**
- Migración gradual de `.cmo-tab-btn` → `.mao-tab`
- Refactorizar comparator.js para usar .mao-pane
- Similar para bifacial, mao-ia, procrustes

**Esfuerzo:** 1-2 días (módulo por módulo)

---

### 🟡 PRIORIDAD 4: Display:none Excesivo

**Archivo:** `js/mao-tab-router.js` (línea 202)

**Problema:**
```javascript
function showSectionsFor(tabId) {
  var allSections = [];
  TABS.forEach(function (tab) {
    tab.sections.forEach(function (sid) {
      if (allSections.indexOf(sid) === -1) allSections.push(sid);
    });
  });

  allSections.forEach(function (sid) {
    var el = document.getElementById(sid);
    if (el) {
      el.style.display = 'none';  // ← REFLOW TRIGGER
    }
  });
}
```

**Impacto:**
- Cada cambio de tab → reflow de 600+ elementos
- Especialmente malo en máquinas lentas
- Usuarios ven "parpadeo" visual

**Solución requerida:**
- Cambiar a `visibility: hidden` o `aria-hidden="true"`
- O usar `transform: scaleY(0)` + contenedor overflow
- Medir performance antes/después

**Esfuerzo:** 1-2 horas

---

### 🟡 PRIORIDAD 5: ARIA Incompleto

**Problemas específicos:**

1. **Tab indicator sin aria-label**
   ```html
   <span class="tab-indicator" style="..."></span>
   <!-- No anunciado: "Estado: pendiente" -->
   ```

2. **Badge sin aria-label**
   ```html
   <span class="tab-badge">2</span>
   <!-- No anunciado: "2 advertencias" -->
   ```

3. **Otros 6 sistemas de tabs sin ARIA**
   - `.cmo-tab-btn` sin `role="tab"`
   - `.bifacial-tab` sin `aria-selected`
   - etc.

4. **Botones sin `aria-label` descriptivo**

**Solución requerida:**
- Agregar aria-label a indicators
- Agregar aria-label numérico a badges
- Refactorizar otros tabs para ARIA
- Prueba con NVDA/JAWS

**Esfuerzo:** 2-4 horas

---

## 📊 MÉTRICAS DETECTADAS

### Cobertura de Tabanización
```
Pestañas LAAR definidas:        4 (proyecto, captura, análisis, resultados)
Elementos HTML en index.html:   636+
Elementos bajo control TABS:    ~8
Cobertura actual:              <2%
```

### Complejidad Visual
```
Sistemas de tabs alternativos:  7
Paletas de colores activas:     2 (LAAR + anterior)
Conflictos CSS:                 5+ (!important overrides)
Inline styles redundantes:      ~40 (en botones de tabs)
```

### Accesibilidad
```
ARIA en LAAR tabs:              ✅ (role, aria-selected, aria-disabled)
ARIA en legacy tabs:            ❌ (0%)
ARIA en indicators:             ❌ (0%)
ARIA en badges:                 ❌ (0%)
Keyboard navigation (LAAR):     ✅ (Alt+←→, Alt+1-4)
Keyboard navigation (legacy):   ❌ (no sistematizado)
```

---

## 🔧 PLAN DE REMEDIACIÓN

### FASE 1: Mapeo Completo (2-4 horas)
- [ ] Extraer todos los `id=` del HTML
- [ ] Agrupar por tab lógico (Proyecto/Captura/Análisis/Resultados)
- [ ] Actualizar TABS.sections array
- [ ] Prueba: cada tab oculta/muestra el contenido correcto

### FASE 2: Consolidación CSS (4-8 horas)
- [ ] Auditar variables en main.css vs mao-tabs-laar.css
- [ ] Eliminar !important de mao-tabs-laar.css
- [ ] Remover inline styles de router (líneas 115-138)
- [ ] Validar con DevTools: computed styles correctos

### FASE 3: Migración de Tabs Legacy (1-2 días)
- [ ] Migrar .cmo-tab-btn → .mao-tab (statisticsPanel)
- [ ] Migrar .bifacial-tab → .mao-tab (bifacialComparison)
- [ ] Migrar .mao-ia-tab → .mao-tab (fichas IA)
- [ ] Auditar otros 4 sistemas

### FASE 4: Accesibilidad ARIA (2-4 horas)
- [ ] Agregar aria-label a tab-indicator
- [ ] Agregar aria-label a tab-badge
- [ ] Refactorizar otros tabs con ARIA
- [ ] Prueba con NVDA/JAWS

### FASE 5: Performance (1-2 horas)
- [ ] Cambiar display:none por visibility:hidden
- [ ] Medir reflow antes/después (DevTools)
- [ ] Optimizar selectores CSS

---

## 📋 EVALUACIÓN: Coherencia entre Módulos

### Módulos ES6 (Phase 2)
```
✅ 10 módulos con patrón viewState (utility-helpers, geometry-primitives, etc.)
✅ Dependency order respetado (Layer 0 → Layer 2)
✅ Sin scope loss (referenciado en CLAUDE.md)
❌ No integrados con tab router (no conocen tabs)
```

### Módulos Legacy (index.html)
```
❌ Código procedural monolítico (4464 líneas)
❌ Acoplamiento fuerte con IDs de HTML
❌ Cada sección asume visibilidad global
⚠️  No sincronización con tab router
```

### Integración analysis-core.js
```
analysis-core.js (IIFE bridge):
├── Inicia 10 módulos ES6
├── Dispara eventos (mao:detection:done, mao:analysis:done)
├── Pero: No sincroniza con tabs visibles
└── Resultado: Tabs pueden estar ocultos cuando lógica ejecuta
```

---

## ✅ Checklist de Validación Post-Remediación

### Funcionalidad
- [ ] Cada tab oculta/muestra sus secciones correctamente
- [ ] No hay "contenido fantasma" de otros tabs visibles
- [ ] Navegación: click en tab → secciones sincronizadas

### Visual
- [ ] Paleta LAAR coherente en todos los elementos
- [ ] No hay colores mixtos (antigua + nueva)
- [ ] Todos los tabs tienen el mismo look & feel
- [ ] Transiciones smooth (100ms)

### Accesibilidad
- [ ] NVDA anunciaa: tab nombre + estado + badge count
- [ ] Teclado: Tab, Enter, Alt+←→ funcionan
- [ ] Focus visible en todos los tabs
- [ ] Indicadores anunciados para lectores de pantalla

### Performance
- [ ] Cambio de tab < 16ms (60fps)
- [ ] Reflow medido y optimizado
- [ ] DevTools: no layout thrashing

---

## 📝 Conclusión

**ESTADO ACTUAL:** ⚠️ **PARCIALMENTE IMPLEMENTADO**

El sistema LAAR está bien diseñado pero incompleto. Requiere:

1. **Mapeo exhaustivo** de 628+ secciones HTML (CRÍTICO)
2. **Consolidación CSS** para eliminar conflictos de paleta
3. **Migración gradual** de 7 sistemas de tabs a LAAR
4. **Auditoría ARIA** para accesibilidad completa
5. **Optimización** de performance (display:none → visibility:hidden)

Sin estos cambios, usuarios enfrentarán:
- Confusión por múltiples estilos de tabs
- Navegación inesperada
- Accesibilidad deficiente
- Layout thrashing en cambios de tab

**Próximos pasos recomendados:**
1. Completar TABS.sections (FASE 1)
2. Consolidar CSS (FASE 2)
3. Migrar tabs legacy (FASE 3)
4. Accesibilidad + Performance (FASES 4-5)

---

**Generado por:** Auditoría Quirúrgica de UI/UX  
**Alcance:** Sistema de Pestañas LAAR  
**Referencia:** mao-tab-router.js, mao-tabs-laar.css, index.html  
