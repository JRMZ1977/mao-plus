#!/usr/bin/env bash
# =============================================================================
# MAO Plus — ejecuta la suite pytest con el intérprete correcto.
#
# POR QUÉ NO ES UN ONE-LINER
# El repo se trabaja con git worktrees (`.claude/worktrees/*`). En un worktree el
# cwd NO contiene `.venv/`: vive en el repo principal. Un `test -x .venv/bin/python`
# a secas falla ahí y cae a `python3` del sistema, que no tiene scikit-learn — y la
# suite reporta 7 fallos de `test_comparator.py` que no son fallos reales del código.
# Este script busca el venv también en la raíz del repo principal.
#
# Orden de preferencia:
#   1. $MAO_PYTHON            — override explícito
#   2. .venv/bin/python       — venv del directorio actual
#   3. <repo principal>/.venv/bin/python  — resuelto vía git-common-dir (worktrees)
#   4. python3                — el del PATH (caso CI, con el entorno ya preparado)
#
# Uso:  bash scripts/run-pytest.sh [args extra para pytest]
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

find_python() {
  if [ -n "${MAO_PYTHON:-}" ]; then echo "$MAO_PYTHON"; return; fi
  if [ -x ".venv/bin/python" ]; then echo ".venv/bin/python"; return; fi

  # En un worktree, --git-common-dir apunta al .git del repo principal.
  local common root
  if common=$(git rev-parse --git-common-dir 2>/dev/null); then
    root=$(cd "$(dirname "$common")" && pwd)
    if [ -x "$root/.venv/bin/python" ]; then echo "$root/.venv/bin/python"; return; fi
  fi

  echo "python3"
}

PY=$(find_python)

if ! "$PY" -c "import pytest" >/dev/null 2>&1; then
  echo "❌  '$PY' no tiene pytest instalado." >&2
  echo "    Prepara el entorno con:" >&2
  echo "      python3 -m venv .venv" >&2
  echo "      .venv/bin/python -m pip install -r requirements-runtime.txt -r requirements-dev.txt" >&2
  echo "    o apunta a otro intérprete con MAO_PYTHON=/ruta/a/python" >&2
  exit 1
fi

echo "→ pytest con: $PY  ($("$PY" -V 2>&1))"
exec "$PY" -m pytest tests/ python/tests/ -q "$@"
