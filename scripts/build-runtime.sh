#!/usr/bin/env bash
# =============================================================================
# MAO Plus — Fase A · A1.1
# Construye el runtime Python EMBEBIBLE (relocatable + pruned) para el DMG arm64.
#
#   Salida:   ./runtime/   (CPython autocontenido + deps de runtime, ~400 MB)
#   Lo consume: package.json > build.extraResources  →  Contents/Resources/python-runtime
#   main.js (prod) lanza:  Resources/python-runtime/bin/python3 -m uvicorn python.server:app
#
# Uso:
#   bash scripts/build-runtime.sh           # construye runtime/ desde cero
#   PY_VERSION=3.9.23 PBS_RELEASE=20250612 bash scripts/build-runtime.sh   # fija versiones
#
# Requisitos: curl, tar.  NO requiere el .venv del proyecto (es independiente).
# =============================================================================
set -euo pipefail

# ── Configuración (decisión Fase A: solo arm64, Python 3.9) ──────────────────
PY_VERSION="${PY_VERSION:-3.9.23}"          # mantener 3.9 (evita el gotcha asyncio Py3.9)
PBS_RELEASE="${PBS_RELEASE:-20250612}"      # tag de release de python-build-standalone
ARCH="aarch64-apple-darwin"                 # Apple Silicon
PROJ_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$PROJ_DIR/runtime"
REQ_FILE="$PROJ_DIR/requirements-runtime.txt"
TARBALL="cpython-${PY_VERSION}+${PBS_RELEASE}-${ARCH}-install_only.tar.gz"
URL="https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_RELEASE}/${TARBALL}"

log() { printf '\033[1;34m[build-runtime]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[build-runtime] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[ -f "$REQ_FILE" ] || err "No existe $REQ_FILE"

# ── 1. Descargar CPython relocatable ─────────────────────────────────────────
log "Descargando CPython ${PY_VERSION} (${ARCH}) desde python-build-standalone…"
rm -rf "$RUNTIME_DIR" 2>/dev/null || true   # solo el runtime previo; NUNCA tocar $PROJ_DIR/python (es el backend)
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fL --retry 3 -o "$TMP/$TARBALL" "$URL" \
  || err "Descarga fallida. Verifica PY_VERSION/PBS_RELEASE en https://github.com/astral-sh/python-build-standalone/releases"

# ── 2. Extraer a runtime/ ────────────────────────────────────────────────────
log "Extrayendo…"
tar -xzf "$TMP/$TARBALL" -C "$TMP"          # crea $TMP/python/
mv "$TMP/python" "$RUNTIME_DIR"
PYBIN="$RUNTIME_DIR/bin/python3"
[ -x "$PYBIN" ] || err "No se encontró el intérprete en $PYBIN tras extraer"
log "Intérprete: $("$PYBIN" --version 2>&1)  ·  $("$PYBIN" -c 'import platform;print(platform.machine())')"

# ── 3. Instalar deps de runtime ──────────────────────────────────────────────
log "Instalando dependencias de runtime (requirements-runtime.txt)…"
"$PYBIN" -m pip install --upgrade pip >/dev/null
"$PYBIN" -m pip install --no-cache-dir -r "$REQ_FILE"

# ── 4. Poda (≈931→~400 MB) ───────────────────────────────────────────────────
log "Podando lo no usado en runtime…"
SP="$(echo "$RUNTIME_DIR"/lib/python3.*/site-packages)"   # deriva la versión real (no hardcodear)
[ -d "$SP" ] || err "No se encontró site-packages en $SP"
# Paquetes con 0 imports en runtime (verificado en auditoría):
for pkg in torch torchvision torchgen functorch polars matplotlib mpl_toolkits \
           sympy pandas ultralytics pip setuptools pkg_resources _distutils_hack wheel; do
  rm -rf "$SP/${pkg}" "$SP/${pkg}"-*.dist-info "$SP/${pkg}".py 2>/dev/null || true
done
rm -rf "$SP"/_polars_runtime* "$SP"/nvidia* 2>/dev/null || true
# .pth huérfano de setuptools (referencia a _distutils_hack ya podado → warning en cada arranque):
rm -f "$SP"/distutils-precedence.pth 2>/dev/null || true
# Tests/cachés dentro de los paquetes que SÍ se quedan:
find "$SP" -type d \( -name tests -o -name test \) -prune -exec rm -rf {} + 2>/dev/null || true
find "$RUNTIME_DIR" -type d -name '__pycache__' -prune -exec rm -rf {} + 2>/dev/null || true
find "$RUNTIME_DIR" -type f -name '*.pyc' -delete 2>/dev/null || true
# Stdlib innecesaria para un backend headless:
rm -rf "$RUNTIME_DIR/lib/python3.9/test" \
       "$RUNTIME_DIR/lib/python3.9/idlelib" \
       "$RUNTIME_DIR/lib/python3.9/ensurepip" 2>/dev/null || true

# ── 5. Verificación de integridad ────────────────────────────────────────────
log "Verificando que el runtime importa todo lo necesario…"
"$PYBIN" -c "import cv2, numpy, scipy, skimage, shapely, trimesh, onnxruntime, fastapi, uvicorn, sklearn, PIL, yaml; print('  imports OK')" \
  || err "El runtime podado no puede importar una dependencia de runtime — revisa la poda."

log "Tamaño final: $(du -sh "$RUNTIME_DIR" | cut -f1)"
log "✅ runtime/ listo. Siguiente: npm run package  (genera el DMG arm64)."
