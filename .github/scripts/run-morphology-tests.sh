#!/usr/bin/env bash
# Hook PostToolUse — MAO Morphology Analyst
# Ejecuta los tests de morfología/detección al editar módulos relevantes.

set -euo pipefail

# Leer stdin (JSON del evento)
INPUT=$(cat)

# Extraer el archivo editado (campo "path" del tool input)
EDITED_FILE=$(echo "$INPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
tool_input = data.get('tool_input', {})
# replace_string_in_file y create_file usan 'filePath'; edit_file usa 'path'
path = tool_input.get('filePath') or tool_input.get('path', '')
print(path)
" 2>/dev/null || echo "")

# Solo actuar si el archivo pertenece a los módulos morfológicos
MORPH_PATTERN="python/modules/(morphology|detection|contour|analysis|metrics)\.py"

if echo "$EDITED_FILE" | grep -qE "$MORPH_PATTERN"; then
  REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
  cd "$REPO_ROOT"

  echo "--- MAO Morphology Tests ---" >&2
  python3 -m pytest tests/test_detection.py tests/test_contour.py tests/test_metrics.py \
    python/tests/ \
    -x -q --tb=short 2>&1 | tail -30
fi

exit 0
