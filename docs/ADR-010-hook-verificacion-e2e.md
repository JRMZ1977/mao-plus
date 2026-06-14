# ADR-010 — Hook de verificación E2E (`window.__maoE2E`)

**Fecha:** 2026-06-14  
**Estado:** Implementado  
**Sesión:** "revisando el historial de conversaciones" (auditoría + implementación)

---

## Contexto

Los ADR-003, 004, 005, 007, 008 y 009 dejaron pendiente la verificación visual en Electron con archivos reales. La causa raíz es un único límite técnico: los `<input type=file>` no se pueden poblar por script, así que ninguna rutina automatizada puede ejercer el flujo cargar→escalar→detectar→analizar. Todas las verificaciones se marcaron como «pendientes manuales».

Este ADR resuelve la raíz: un hook dev-only que inyecta una imagen en el **mismo code-path** del file input mediante `DataTransfer` + `dispatchEvent('change')`, sin reimplementar la lógica de los listeners.

---

## Decisiones

| # | Decisión | Alternativa descartada | Razón |
|---|----------|----------------------|-------|
| D1 | `DataTransfer` + `dispatchEvent` (handler real) | Reimplementar el pipeline en el hook | Fidelidad máxima; el handler existente ya valida, carga, extrae EXIF y actualiza estado |
| D2 | Gate `getIsDev()` por IPC | Flag en `localStorage` | `isDev = !app.isPackaged` es autoritativo; el renderer no puede derivarlo sin IPC |
| D3 | Fixture sintético commiteado (`assets/fixtures/`) | Solo imágenes reales del usuario | Determinista, self-contained, repetible; la geometría conocida permite aserciones |
| D4 | `app://mao/assets/fixtures/` para servir fixtures | IPC para leer el fixture | El handler `app://` ya existe y sirve archivos bajo `APP_DIR`; sin plumbing nuevo |
| D5 | IPC `electronAPI.readFile` para rutas absolutas | Ninguno (ya existía) | El handler `fs-read-file` ya devuelve `data:image/...;base64,...` para .png/.jpg |

---

## Implementación

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `main.js` | `ipcMain.handle('mao:is-dev', () => isDev)` — gate dev |
| `preload.js` | `getIsDev: () => ipcRenderer.invoke('mao:is-dev')` en `electronAPI` |
| `js/analysis-core.js` | `window.__maoE2E` + `window.__maoLoadTestFixture` al final de `init()`, gated |
| `tools/gen_fixture.py` | Generador de fixtures sintéticos (ejecutar una vez, commitear el PNG) |
| `assets/fixtures/*.png` | 3 fixtures generados: `sintetico_escala_objeto_ph.png`, `sintetico_caraA.png`, `sintetico_caraB.png` |
| `index.html` | Bump `analysis-core.js?v=20260614h` |

### Geometría de `sintetico_escala_objeto_ph.png`
- Canvas 800×600, fondo gris 180.
- Cuadrado de escala blanco 20×20 px en (30,30).
- Objeto oscuro (RGB 60,55,50) rect 200×140 px centrado en (450,320).
- Hueco interior: elipse blanca 44×32 px centrada en (450,320) → candidato P/H para ADR-009.

---

## API

```js
// Desde la consola del renderer (DevTools) o una skill:

// Ver ayuda completa
window.__maoE2E.help()

// Flujo completo: cargar → escala → detectar
await window.__maoE2E.flujoCompleto('sintetico_escala_objeto_ph.png')

// Pasos individuales
await window.__maoE2E.cargar('sintetico_escala_objeto_ph.png')
await window.__maoE2E.escala({ distanciaMm: 1000 })
await window.__maoE2E.detectar()

// Imagen real del usuario (vía IPC readFile)
await window.__maoE2E.cargar('/Users/me/fotos/pieza001.jpg')

// Bifacial
await window.__maoE2E.cargar('sintetico_caraA.png', { modo: 'bifacial', cara: 'A' })
await window.__maoE2E.cargar('sintetico_caraB.png', { modo: 'bifacial', cara: 'B' })
```

**En producción** (`isDev=false`): `window.__maoE2E === undefined`, `window.__maoLoadTestFixture === undefined`.

---

## Checklist de verificación (cierra los pendientes de ADR-003/004/005/007/008/009)

Ejecutar en DevTools tras `npm start` (matar+relanzar, no Cmd+R):

```
await window.__maoE2E.flujoCompleto('sintetico_escala_objeto_ph.png')
```

Luego verificar visualmente:

- [ ] **ADR-004** Chips Imagen→ok / Escala→ok / Objetos→ok en pestaña Captura
- [ ] **ADR-003** Auto-ID poblado en pestaña Proyecto
- [ ] **ADR-009** Chip «N candidatas — confirmar» + modal con confirmar/tipar/descartar
- [ ] **ADR-005** Lenguaje `.laar-chip` en todas las pestañas (Proyecto, Captura, Análisis)
- [ ] **ADR-007** Triage de confianza en el batch de análisis
- [ ] **ADR-008** CSV con Confianza_nivel/Confianza_score al exportar
- [ ] **Modal IA (2026-06-13)** Orden/filtro por confianza + cancelación con cronómetro

Para P/H en profundidad:
```
// Tras flujoCompleto, abrir el modal de P/H y confirmar el candidato detectado
// El área neta debe recalcularse con la elipse excluida
```

---

## Reproducir fixtures

```bash
.venv/bin/python tools/gen_fixture.py
# → assets/fixtures/sintetico_escala_objeto_ph.png
# → assets/fixtures/sintetico_caraA.png
# → assets/fixtures/sintetico_caraB.png
```
