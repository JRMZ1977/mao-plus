# COHERENCIA-MODULOS.md — Mapa C0/C1 de la superficie `window.*`

> Generado: 2026-06-30. Fuente: `js/analysis-core.js` + 13 archivos consumidores.  
> Actualizar al añadir/eliminar `window.*` en analysis-core.js.

## Resumen ejecutivo

| Categoría | Cuenta | Acción |
|-----------|--------|--------|
| **Tier-1 API** (callers externos fijos) | 10 | Nunca tocar — contrato público |
| **Contract layer** (namespaces multi-módulo) | 3 | Mantener — `MaoOrganizer`, `MaoDeteccion`, `maoTabRouter` los usan |
| **Cross-file** (lectura/escritura desde otros .js) | 39 | Documentar contratos; migrar a MaoState progresivamente (C2) |
| **Dev/test only** | 8 | Guardar bajo `_MAO_DEBUG` en C2 |
| **Internal functions** (solo usado en analysis-core.js) | 14 | Candidatas a `function` local — eliminar de window.* en C2 |
| **State interno** (solo analysis-core.js) | 27 | Candidatos a local/MaoState en C2 |
| **TOTAL** | **101** | |

---

## Tier-1 API — NO TOCAR (10 funciones)

Estas 10 funciones son llamadas directamente desde `mao-ia.js` y `collection.js` (y otros callers legacy).  
**Invariante**: deben existir en `window.*` con estos nombres exactos. Ver `CLAUDE.md §Critical Constraint`.

```
window.analizarObjetoMorfologicamente    ← mao-ia.js, collection.js
window.aplicarIncertidumbreOptica        ← mao-ia.js
window.aplicarReglaCanonicaInterpretacion← mao-ia.js
window.calcularEjePrincipal             ← mao-ia.js
window.detectarObjetos                  ← (bootstrap / E2E hook)
window.estimarErrorOptico               ← mao-ia.js
window.generarTablaMetricasCompleta     ← collection.js
window.inyectarObjetosDesdeIA           ← mao-ia.js
window.metaClasificarFormaIA            ← mao-ia.js
window.mostrarAnalisisMorfologico       ← mao-ia.js, collection.js
```

---

## Contract layer — mantener como está (3 namespaces)

Expuestos por múltiples archivos y consumidos en cadena. Pertenecen a window por diseño.

```
window._MAO_DEBUG       ← toggle debug global (guardado por main process + preload)
window.__maoE2E         ← hook E2E: { cargar, escala, identificar, detectar, analizar, flujoCompleto }
window.__maoLoadTestFixture ← helper de fixtures para E2E/dev
```

---

## Cross-file (39) — contratos implícitos, sin refactorizar sin tests

Asignados en `analysis-core.js`, leídos/escritos desde otros archivos JS. Requieren documentar.

### Getters internos (expuestos para mao-ia.js)

```
window._maoGetIdentificacion    ← mao-ia.js, obj3d-viewer.js
window._maoGetImage             ← mao-ia.js (gate de habilitar el modal IA)
window._maoGetImageCaraA        ← mao-ia.js
window._maoGetImageCaraB        ← mao-ia.js
window._maoGetModo              ← mao-ia.js
window._maoGetObj3dFileBaseName ← obj3d-viewer.js
window._maoGetObjectDimension   ← (clasificado como state — es getter de función)
window._maoGetScale             ← mao-ia.js
window._maoLog                  ← mao-ia.js (logger con _MAO_DEBUG gate)
```

### Canvas + contexto (compartido por múltiples módulos)

```
window.canvas   ← mao-ia.js, collection.js, comparator.js, procrustes.js,
                   obj3d-viewer.js, mao-tab-router.js, mao-analysis-organizer.js,
                   mao-resultados-organizer.js, index.html
window.ctx      ← mao-ia.js, collection.js, comparator.js, procrustes.js,
                   obj3d-viewer.js, mao-resultados-organizer.js
```

### Escala + estado óptico

```
window.escalaCorregida       ← collection.js
window.escalaParamsOpticos   ← mao-ia.js
window.aplicarErrorOpticoPosicional ← mao-ia.js
window.calcularEscala        ← mao-ia.js
```

### Estado de análisis actual

```
window.currentAnalysisData    ← collection.js
window.currentAnalysisId      ← mao-resultados-organizer.js
window.currentAnalysisPath    ← collection.js
window.currentAnalyzedObject  ← collection.js, mao-analysis-organizer.js
```

### Acciones de proyecto/colección (consumidas por collection.js)

```
window.abrirCarpetaAnalisis      ← collection.js
window.abrirProyectoCompleto     ← collection.js
window.cargarAnalisisDesdeRuta   ← collection.js
window.cargarProyectoDesdeArchivo← collection.js
window.cerrarSelectorAnalisis    ← collection.js
window.currentAnalysisPath       ← collection.js
window.generarArchivoProyecto    ← collection.js (clasificada como state — es función)
window.generarCSVMetricasDesdeObjeto ← collection.js
window.inyectarObjetosDesdeObj3d ← obj3d-viewer.js
window.restaurarCanvasDesdeCache ← collection.js
window.seleccionarAnalisisDesdeRuta ← collection.js
```

### Trazado P/H (consumidas por index.html inline handlers)

```
window.activarModoTrazado    ← index.html
window.calcularAngulo        ← index.html
window.calcularDistancia     ← index.html
window.desactivarModoTrazado ← index.html
window.deshacerUltimoPunto   ← index.html
window.limpiarTrazos         ← index.html
window.perforationCanvas     ← index.html
window.confirmarCandidatoPH  ← (solo index.html/modal P/H)
window.descartarCandidatoPH  ← (solo index.html/modal P/H)
window.eliminarTrazado       ← index.html
```

### Varios cross-file

```
window.jspdf             ← index.html (cargado desde CDN, re-expuesto)
window.maoActivatePanel  ← obj3d-viewer.js
window.mostrarCardObjetoIA← mao-ia.js
window.saveFileWithDialog ← mao-ia.js, collection.js, comparator.js
window.actualizarArchivoProyecto ← collection.js (clasificada como state — función)
```

---

## Dev/test only (8) — guardar bajo `_MAO_DEBUG` en C2

Útiles para desarrollo pero no deben existir en producción.  
**Acción C2**: envolver en `if (window._MAO_DEBUG) { window.X = ... }`.

```
window.auditoriaSistemaMAO
window.demostrarDiferencias
window.generarImagenVirtualPrueba
window.probarGeneradorID
window.testAnalisisMorfologico
window.ultimaAuditoriaPDF
window.ultimaValidacionCoherencia
window.validarResultadosPrueba
```

---

## Internal functions en window (14) — candidatas a función local

Solo llamadas desde dentro del propio `analysis-core.js`. No tienen callers externos.  
**Riesgo**: si alguna se llama vía eval/string en index.html (p.ej. `onclick="X()"`) este análisis la perdería.  
**Acción C2**: verificar que no hay `onclick="X"` en index.html → quitar de window.*, dejar como function local.

```
window._maoAbrirMetricas
window.actualizarSeccionComparacionesBifaciales
window.actualizarTablaTrazos
window.actualizarVisibilidadBotonComparacion
window.cerrarComparacionBifacial
window.eliminarTrazo
window.generarAnalisisDetallado
window.generarComparacionBifacialSimple
window.generarGraficosComparativos
window.generarHTMLReporteParaBatch
window.generarInterpretacionArqueologica
window.generarTablaComparativa
window.mostrarComparacionBifacial
window.setupBifacialTabs
```

---

## State interno (27) — candidatos a variable local o MaoState

No-funciones asignadas a window.* que solo vive en analysis-core.js.  
**Acción C2**: mover a un namespace `window.MaoState = {}` explícito o a variables locales del IIFE.

```
window.OBJ3D_USE_CANONICAL_RASTER    — flag configuración 3D
window._autoAnalisisEnCurso          — semáforo async
window.archivoRAWActual              — metadata archivo RAW
window.bifacialHandlersA / B         — callbacks cara A/B
window.canvasBackup / ctxBackup      — backup estado canvas
window.datosVerificacion             — datos de verificación de escala
window.deteccionBifacialActiva       — flag modo bifacial activo
window.deteccionBifacialSecuencial   — flag secuencial A→B
window.distanciaVerificacionPx       — distancia px para verificación
window.gc                            — función GC manual
window.imageHeightMonofacialBackup   — dimensiones imagen monofacial backup
window.imageWidthMonofacialBackup
window.imagenMonofacialBackup
window.manualModeScale               — escala en modo manual
window.obj3dToCanonicalRaster        — función conversión 3D→raster
window.perforationCanvasOffsetX/Y    — offsets canvas perforación
window.perforationZoomLevel          — zoom nivel perforación
window.ultimaComparacionBifacial     — resultado última comparación
```

---

## Plan de refactorización (C2) — secuencia recomendada

> **Secuencia crítica: añadir tests C3 ANTES de tocar la superficie global** (lección ADR doc).

1. **C3 first**: escribir tests E2E en `tests/frontend/` que verifiquen los 10 Tier-1 + 3 cross-file críticos (canvas, ctx, escalaCorregida) siguen en window.* tras boot.
2. **C2a**: mover Dev/test (8) bajo `_MAO_DEBUG` — riesgo cero, no cambia contratos.
3. **C2b**: limpiar Internal functions (14) — verificar con grep index.html por `onclick="X"` antes de cada una.
4. **C2c**: mover State interno (27) a `window.MaoState = {}` — necesita grep de todos los callers.
5. **DEFER**: Cross-file y Tier-1 — no tocar hasta necesidad concreta justificada.
