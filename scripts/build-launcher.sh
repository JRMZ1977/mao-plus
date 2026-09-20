#!/usr/bin/env bash
#
# MAO Plus — construye e instala el lanzador.
#
#   scripts/build-launcher.sh              → instala en /Applications/MAO Plus.app
#   scripts/build-launcher.sh --destino D  → lo deja en D (para probar sin tocar nada)
#
# Compila scripts/mao-launcher.applescript inyectándole la ruta de ESTE
# repositorio, de modo que el applet la conozca aunque viva en /Applications.
# El código que arranca es siempre el del repo: no se copia nada dentro del
# bundle, y por eso el lanzador nunca se queda viejo.
#
# Si en el destino hay una app que NO es este lanzador, se MUEVE A LA PAPELERA en
# vez de borrarse: un bundle empaquetado no se puede reconstruir si su runtime/ ya
# no está. Si es una compilación previa de este mismo lanzador se reemplaza sin
# más, para que recompilar no llene la Papelera de copias de 5 MB. La marca que
# los distingue es MAOLauncherKind en el Info.plist.
#
# Para un bundle autónomo y distribuible: npm run package (necesita runtime/
# regenerado con scripts/build-runtime.sh).

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO/scripts/mao-launcher.applescript"
ICON_SRC="$REPO/icon.png"
DESTINO="/Applications/MAO Plus.app"

while [ $# -gt 0 ]; do
  case "$1" in
    --destino) DESTINO="$2"; shift 2 ;;
    *) echo "error: opción desconocida: $1" >&2; exit 2 ;;
  esac
done

command -v osacompile >/dev/null || { echo "error: falta osacompile (solo macOS)." >&2; exit 1; }
[ -f "$SRC" ] || { echo "error: no encuentro $SRC" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# La ruta del repo se inyecta aquí: el applet no lleva rutas escritas a mano.
echo "→ Inyectando la ruta del repositorio: $REPO"
sed "s|@@REPO@@|$REPO|" "$SRC" > "$TMP/mao-launcher.applescript"
grep -q '@@REPO@@' "$TMP/mao-launcher.applescript" && { echo "error: la sustitución falló." >&2; exit 1; }

echo "→ Compilando applet"
osacompile -o "$TMP/MAO Plus.app" "$TMP/mao-launcher.applescript"

if [ -f "$ICON_SRC" ] && command -v iconutil >/dev/null; then
  echo "→ Generando icono desde icon.png"
  ICONSET="$TMP/MAO.iconset"; mkdir -p "$ICONSET"
  for size in 16 32 128 256 512; do
    sips -z "$size" "$size" "$ICON_SRC" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
    sips -z "$((size * 2))" "$((size * 2))" "$ICON_SRC" \
      --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
  done
  iconutil -c icns "$ICONSET" -o "$TMP/MAO.icns"
  cp "$TMP/MAO.icns" "$TMP/MAO Plus.app/Contents/Resources/applet.icns"
else
  echo "  (aviso: sin icon.png o sin iconutil — queda el icono por defecto)"
fi

# Nombre visible y versión, tomada de package.json para que el Finder no mienta.
VERSION="$(node -p "require('$REPO/package.json').version" 2>/dev/null || echo '')"
PLIST="$TMP/MAO Plus.app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleName 'MAO Plus'" "$PLIST" >/dev/null 2>&1 || true
# Marca que identifica a este lanzador frente a un bundle de electron-builder.
/usr/libexec/PlistBuddy -c "Add :MAOLauncherKind string 'repo-launcher'" "$PLIST" >/dev/null 2>&1 \
  || /usr/libexec/PlistBuddy -c "Set :MAOLauncherKind 'repo-launcher'" "$PLIST" >/dev/null 2>&1 || true
if [ -n "$VERSION" ]; then
  /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString '$VERSION'" "$PLIST" >/dev/null 2>&1 \
    || /usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string '$VERSION'" "$PLIST" >/dev/null 2>&1 || true
  echo "→ Versión declarada: $VERSION (de package.json)"
fi

# Instalación. Lo que hubiera antes va a la Papelera, con marca de tiempo para
# no pisar un rescate anterior.
if [ -e "$DESTINO" ]; then
  MARCA="$(/usr/libexec/PlistBuddy -c "Print :MAOLauncherKind" "$DESTINO/Contents/Info.plist" 2>/dev/null || true)"
  if [ "$MARCA" = "repo-launcher" ]; then
    echo "→ Reemplazando una compilación previa de este lanzador"
    rm -rf "$DESTINO"
  else
    PAPELERA="$HOME/.Trash/$(basename "$DESTINO" .app) — reemplazado $(date '+%Y-%m-%d %H%M%S').app"
    echo "→ En el destino hay otra app; la muevo a la Papelera (no la borro):"
    echo "   $PAPELERA"
    mv "$DESTINO" "$PAPELERA"
  fi
fi

mkdir -p "$(dirname "$DESTINO")"
cp -R "$TMP/MAO Plus.app" "$DESTINO"
touch "$DESTINO"          # refresca la caché de iconos del Finder

echo "✓ Instalado en: $DESTINO"
echo "  Arranca el código de: $REPO"
