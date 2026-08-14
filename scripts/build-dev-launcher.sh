#!/usr/bin/env bash
#
# MAO Plus — construye el lanzador de desarrollo DENTRO del repositorio.
#
#   scripts/build-dev-launcher.sh      (o: npm run launcher)
#
# Produce "<repo>/MAO Plus (dev).app": un applet de AppleScript que arranca
# Electron contra esta copia de trabajo. El applet se auto-localiza (deduce el
# repo de su propia ubicacion), asi que no queda ninguna ruta hardcodeada.
#
# Es un lanzador de DESARROLLO. Para un bundle autonomo: npm run package.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO/scripts/mao-dev-launcher.applescript"
APP="$REPO/MAO Plus (dev).app"
ICON_SRC="$REPO/icon.png"

command -v osacompile >/dev/null || { echo "error: falta osacompile (solo macOS)." >&2; exit 1; }
[ -f "$SRC" ] || { echo "error: no encuentro $SRC" >&2; exit 1; }

echo "→ Compilando applet en: $APP"
rm -rf "$APP"
osacompile -o "$APP" "$SRC"

# Icono: se genera el .icns desde icon.png en un directorio temporal.
if [ -f "$ICON_SRC" ] && command -v iconutil >/dev/null; then
  echo "→ Generando icono desde icon.png"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  ICONSET="$TMP/MAO.iconset"
  mkdir -p "$ICONSET"
  for size in 16 32 128 256 512; do
    sips -z "$size" "$size" "$ICON_SRC" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
    sips -z "$((size * 2))" "$((size * 2))" "$ICON_SRC" \
      --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
  done
  iconutil -c icns "$ICONSET" -o "$TMP/MAO.icns"
  cp "$TMP/MAO.icns" "$APP/Contents/Resources/applet.icns"
else
  echo "  (aviso: sin icon.png o sin iconutil — el applet queda con el icono por defecto)"
fi

# Nombre visible en el Dock / Finder.
/usr/libexec/PlistBuddy -c "Set :CFBundleName 'MAO Plus (dev)'" \
  "$APP/Contents/Info.plist" >/dev/null 2>&1 || true

# Refresca la caché de iconos de Finder para el bundle recien escrito.
touch "$APP"

echo
echo "Listo. Para usarlo:"
echo "  open '$APP'                 # lanzar ahora"
echo "  arrastralo al Dock          # para anclarlo"
echo
echo "Requisitos que el applet verifica antes de arrancar:"
echo "  node_modules/.bin/electron  → npm install"
echo "  .venv/bin/python            → python3 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt"
echo "Log de arranque: /tmp/mao_launch.log"
