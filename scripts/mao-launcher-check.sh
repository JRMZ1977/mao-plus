#!/usr/bin/env bash
#
# MAO Plus — comprobación de estado posterior al arranque.
#
#   scripts/mao-launcher-check.sh <ruta-del-repo>
#
# Lo invoca el lanzador EN SEGUNDO PLANO, después de arrancar Electron, para que
# el arranque no espere a la red. No modifica el repositorio NUNCA: ni pull, ni
# checkout, ni stash. Solo mira y avisa.
#
# Avisa SOLO cuando hay algo que decir (origin por delante, rama que no es main,
# árbol sucio). Si todo está en orden guarda silencio: una notificación en cada
# arranque es ruido, y el ruido se acaba ignorando.
#
# Vive fuera del applet a propósito: así se puede editar sin recompilarlo.

set -uo pipefail

REPO="${1:-}"
LOG="${MAO_LAUNCH_LOG:-/tmp/mao_launch.log}"
ESPERA_FETCH="${MAO_FETCH_TIMEOUT:-15}"

[ -n "$REPO" ] && [ -d "$REPO/.git" ] || exit 0
cd "$REPO" || exit 0

registrar() { printf '%s\n' "$*" >> "$LOG" 2>/dev/null || true; }

avisar() {                      # avisar <subtítulo> <mensaje>
  /usr/bin/osascript -e "display notification \"$2\" with title \"MAO Plus\" subtitle \"$1\"" \
    >/dev/null 2>&1 || true
}

rama=$(git branch --show-current 2>/dev/null)
[ -n "$rama" ] || rama="HEAD suelto en $(git rev-parse --short HEAD 2>/dev/null)"
# --untracked-files=no a propósito: los archivos sin seguimiento suelen ser trabajo
# deliberadamente fuera del control de versiones (borradores, PDFs). Avisar de ellos
# en cada arranque sería el ruido que este script trata de evitar.
sucios=$(git status --porcelain --untracked-files=no 2>/dev/null | wc -l | tr -d ' ')

# `git fetch` puede colgarse si la red no responde y no acepta un timeout propio.
# Se lanza con un perro guardián que lo mata: el aviso puede faltar, el arranque no.
git fetch --quiet origin main >/dev/null 2>&1 &
fpid=$!
( sleep "$ESPERA_FETCH"; kill "$fpid" ) >/dev/null 2>&1 &
wpid=$!
disown "$wpid" 2>/dev/null || true   # sin esto bash anuncia «Terminated» al matarlo
wait "$fpid" 2>/dev/null
kill "$wpid" >/dev/null 2>&1

detras=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
delante=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)

registrar "== estado: rama=$rama sucios=$sucios detrás=$detras delante=$delante"

avisos=()
[ "${detras:-0}" -gt 0 ]  && avisos+=("origin/main va $detras commit(s) por delante — git pull cuando quieras")
[ "$rama" != "main" ]     && avisos+=("estás en «$rama», no en main")
[ "${sucios:-0}" -gt 0 ]  && avisos+=("$sucios archivo(s) con cambios sin commitear")

if [ ${#avisos[@]} -gt 0 ]; then
  sub="$rama"
  [ "${detras:-0}" -gt 0 ] && sub="$rama · $detras por detrás"
  msg=$(printf '%s. ' "${avisos[@]}")
  avisar "$sub" "${msg%. }"
  registrar "== aviso emitido: ${msg%. }"
else
  registrar "== sin avisos: al día y limpio"
fi
