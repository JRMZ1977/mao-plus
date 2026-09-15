# Plan Fase A — Industrialización de la distribución (macOS)

> **Objetivo único:** que `MAO Plus.dmg` funcione **completo** (backend incluido) en un Mac Apple
> Silicon que **nunca tuvo Python**. Hoy no ocurre: `PYTHON_BIN` apunta a `.venv/bin/python` (excluido
> del bundle) y cae al `python` del PATH; en una máquina ajena la app arranca en **modo JS-only**.
> **Deriva de:** `docs/auditorias/AUDITORIA-ESTADO-APP-20260622.md` (D1, D5; retirada, última versión en `8b608da`) + roadmap 2026-06-18.

## Estado de implementación (2026-06-22)
**A1–A4 implementados y verificados técnicamente.** DMG generado: `dist/MAO Plus-1.2.0-arm64.dmg`
(**254 MB**). Runtime embebido **432 MB** (podado desde 931 MB). Verificado: backend embebido sirve
`/api/health` 200 con los 13 módulos **desde las rutas exactas de producción** (cwd=`Contents/Resources`,
intérprete del bundle); intérprete **autocontenido** (`otool -L` solo enlaza `@executable_path/../lib/`,
`sys.prefix` dentro del `.app` → no depende del Python del host). **Único pendiente:** instalar el DMG en
un Mac arm64 físicamente limpio y correr el flujo de UI completo (criterio de aceptación A4, paso manual).

## Decisiones congeladas (2026-06-22)
- **Arquitectura: solo `arm64`.** Se cambia el target del DMG de `[x64, arm64]` a `[arm64]`. Reutiliza
  el ecosistema arm64 actual; los Macs Intel quedan fuera (audiencia interna).
- **Firma: ad-hoc, sin notarización** (no hay Apple Developer ID). El usuario hace una acción de
  primer arranque (quitar quarantine). Sin coste, aceptable para distribución interna.

## Hechos de partida (verificados en código, 2026-06-22)
- `main.js:102` → `const PYTHON_BIN = path.join(APP_DIR, '.venv', 'bin', 'python')`. No distingue
  `app.isPackaged`.
- `.venv/bin/python3 → /Library/Developer/CommandLineTools/usr/bin/python3` (**symlink al sistema**:
  el venv NO es relocatable; bundlearlo tal cual deja un symlink colgante).
- `.venv` pesa **931 MB**, pero el runtime real **no importa** `torch` (306M), `polars` (116M),
  `matplotlib` (19M), `sympy` (28M), `pandas`, ni `ultralytics` (solo el exporter offline de SAM).
  Pruned ≈ **400 MB**.
- Python **3.9.6** (mantener 3.9 evita el gotcha del event-loop asyncio ya documentado).
- `build/` **no existe** → los entitlements que referencia `package.json` faltarían en un build con
  `hardenedRuntime: true`.
- Modelos SAM (`mobile_sam_*.onnx`) **no descargados** → SAM es feature opcional, **no bloquea** Fase A.
- `electron-builder 24.13.3`.

---

## A1 — Embeber un Python relocatable y pruned  *(núcleo, ~1 sem)*

**Enfoque:** runtime CPython **relocatable** (no el venv del sistema) + deps de runtime instaladas
dentro + poda, empaquetado como `extraResources` de electron-builder. `main.js` lo resuelve cuando
`app.isPackaged`.

### A1.1 Construir el runtime embebible
Script reproducible `scripts/build-runtime.sh` (nuevo):
1. Descargar **python-build-standalone** CPython 3.9 arm64 (`aarch64-apple-darwin`, variante
   `install_only`) → árbol `runtime/` autocontenido (intérprete + libs, sin symlinks al sistema).
2. `runtime/bin/python3 -m pip install -r requirements-runtime.txt` (ver A1.2).
3. **Poda** (reduce ~931→~400 MB): borrar `torch`, `polars*`, `matplotlib`, `sympy`, `pandas`,
   `ultralytics`, `pip`, `setuptools`, `*.dist-info` de paquetes podados, `**/tests`, `**/__pycache__`,
   `**/*.pyc`. Verificación post-poda: `runtime/bin/python3 -c "import cv2,numpy,scipy,skimage,shapely,trimesh,onnxruntime,fastapi,uvicorn,sklearn,PIL"` debe salir 0.

### A1.2 Crear `requirements-runtime.txt` (solo runtime)
Subconjunto exacto de `requirements.txt` **sin** las líneas del exporter/Fase-3+:
`fastapi, uvicorn[standard], python-multipart, opencv-python-headless, numpy, pillow,
scikit-image, imageio, shapely, trimesh, scipy, scikit-learn, onnxruntime, python-dotenv, pyyaml`.
(`scikit-learn` **se incluye**: `comparator.py` lo importa de forma perezosa para PCA/KMeans/silhouette.
`ultralytics`/`torch` **se excluyen**: 0 imports en runtime.)

### A1.3 Cablear `main.js` para usar el runtime embebido
```js
// main.js (reemplaza la línea 102)
const PYTHON_BIN = app.isPackaged
  ? path.join(process.resourcesPath, 'python-runtime', 'bin', 'python3')
  : path.join(APP_DIR, '.venv', 'bin', 'python');
```
- `APP_DIR`/`cwd` del spawn: en empaquetado, el código Python (`python/`) viaja dentro del `app.asar`
  o como recurso; uvicorn se lanza con `python.server:app`. Verificar que `PYTHONPATH`/`cwd` apunten a
  la raíz que contiene el paquete `python/` (hoy `cwd: APP_DIR`). En empaquetado, **desempacar**
  `python/**` (es código que se ejecuta fuera de Node) vía `asarUnpack` o moverlo a `extraResources`,
  y ajustar el `cwd` del spawn en consecuencia.
- El fallback al `python` del PATH (main.js:190) **se conserva** como red de seguridad (modo JS-only),
  pero deja de ser la ruta normal.

### A1.4 electron-builder: `extraResources`
En `package.json > build`:
```jsonc
"mac": { "target": [{ "target": "dmg", "arch": ["arm64"] }], ... },
"extraResources": [ { "from": "runtime", "to": "python-runtime" } ]
```
Quitar `x64` del array `arch`. El runtime queda en `MAO Plus.app/Contents/Resources/python-runtime/`.

### Gotchas A1
- **El venv actual NO sirve para bundlear** (symlink al sistema) — de ahí python-build-standalone.
- **Validación de librerías + hardenedRuntime:** un app endurecido rechaza `.so`/`.dylib` ad-hoc o sin
  firmar (cv2/scipy/onnxruntime traen decenas). → ver A2: se **desactiva `hardenedRuntime`** (sin
  notarización no aporta nada) o se añade `com.apple.security.cs.disable-library-validation`.
- **No subir `runtime/` a git** (≈400 MB): añadir `runtime/` a `.gitignore`; se genera con el script.

---

## A2 — Firma ad-hoc + primer arranque (Gatekeeper)  *(~1 día)*

Sin Developer ID, la vía gratuita:
1. **Saltar firma / ad-hoc** en `package.json > build.mac`: `"identity": null` (electron-builder no
   intenta firmar con una identidad inexistente) **y** `"hardenedRuntime": false`. Quitar las dos
   líneas `entitlements*` (apuntan a `build/` inexistente).
2. **Instrucción de primer arranque** (documentar en README + nota de release):
   `xattr -dr com.apple.quarantine "/Applications/MAO Plus.app"`  *(o clic derecho → Abrir la 1ª vez)*.
3. Opcional futuro: si más adelante hay Developer ID, reactivar `hardenedRuntime` + entitlements +
   `notarize` (queda como nota en Fase D, no se hace ahora).

---

## A3 — Sacar el entorno de iCloud  *(~½ día, higiene de dev)*

Ataca la raíz de la evicción de `cv2.abi3.so` (proyecto en `~/Documents` = iCloud). **No afecta al app
empaquetado** (que lleva su propio runtime); es salud del entorno de desarrollo.
- **Opción recomendada:** mover el repo completo fuera de iCloud (p. ej. `~/Developer/MAO_PLUS_PY_01`).
  Elimina la evicción de raíz y el warmup deja de ser necesario (se conserva por seguridad).
- **Opción mínima:** mantener el repo, pero recrear `.venv` en una ruta no-iCloud (p. ej.
  `~/.venvs/maoplus`) y actualizar el `PYTHON_BIN` de **dev** + `start_server.sh`.
- Documentar la ubicación canónica en `README_DEVELOPMENT.md`.

---

## A4 — Reconstruir, verificar en máquina limpia, congelar  *(~2 días)*

1. **Bump de versión** (`package.json` 1.2.0 → 1.3.0) y **cache-bust** si hubo toques de front.
2. **Build end-to-end:** `scripts/build-runtime.sh && npm run package`. Documentar el comando único
   en `README_DEVELOPMENT.md`.
3. **Prueba de fuego (criterio de aceptación de la Fase):** instalar el DMG en un **Mac arm64 sin
   Python** (o un usuario macOS limpio / segundo equipo) y verificar:
   - [ ] La app abre tras el paso de quarantine.
   - [ ] `GET /api/health` → **200** (badge de backend en verde, **no** modo JS-only).
   - [ ] **Análisis real end-to-end** con `assets/fixtures/sintetico_escala_objeto_ph.png`:
         detección → contorno → métricas → CSV. (El hook `window.__maoE2E.flujoCompleto(...)` de
         ADR-010 sirve para automatizar esta aserción.)
   - [ ] Comparador (ruta sklearn) no rompe.
   - [ ] Cerrar la app termina el proceso Python (sin uvicorn huérfano en :8765).
4. **Tamaño esperado del DMG:** ~250–320 MB (hoy 121 MB sin Python + ~400 MB pruned, comprimido).

---

## Criterios de aceptación de la Fase A
1. DMG **arm64** que en un Mac sin Python: arranca, backend 200, análisis completo funciona.
2. Build **reproducible** desde un script versionado (`scripts/build-runtime.sh` + `npm run package`).
3. `.venv` de dev **fuera de iCloud**; sin evicciones de cv2 en una sesión de trabajo normal.
4. `requirements-runtime.txt` refleja exactamente lo que se embebe; sin `torch`/`polars`/etc.
5. Suite Python sigue **288 passed / 2 skipped**; el embebido no altera la lógica.

## Riesgos y mitigaciones
| Riesgo | Prob. | Mitigación |
|--------|:-----:|------------|
| `.so` nativas no cargan en app endurecido | Media | `hardenedRuntime: false` (A2) — sin notarización no cuesta nada |
| `cwd`/PYTHONPATH del spawn roto en empaquetado | Media | Desempacar `python/**` a recurso; probar en A4 con app real, no `npm start` |
| python-build-standalone 3.9 indisponible/edge | Baja | Alternativa: 3.11 (revalidar gotcha asyncio) o `relocatable venv` con `--copies` + `install_name_tool` |
| Modelos SAM ausentes confunden al usuario | Baja | SAM es opcional; el panel de estado SAM (commit 4aad5a6) ya comunica «no descargado» |
| DMG grande (~300 MB) | Baja | Aceptable para interno; la poda ya recortó 530 MB |

## Secuencia y estimación
**A1 (núcleo, ~1 sem) → A2 (~1 día) → A3 (~½ día, paralelizable) → A4 (~2 días).** Total **~2 semanas**.
Ruta crítica: A1.1–A1.3 (runtime + cableado de `main.js`). A2/A3 son cortos. A4 es el portón de calidad.

## Artefactos nuevos que produce la Fase A
- `scripts/build-runtime.sh` — descarga + instala + poda el runtime embebible.
- `requirements-runtime.txt` — deps de runtime (subconjunto de `requirements.txt`).
- `runtime/` — árbol Python embebible (gitignored, generado).
- Cambios en `main.js` (PYTHON_BIN por `app.isPackaged`) y `package.json` (arch arm64, extraResources,
  identity/hardenedRuntime).
- Nota de instalación (quarantine) en `README_DEVELOPMENT.md`.
