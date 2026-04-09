#!/usr/bin/env bash
# ============================================================================
# MAO Plus — Iniciador del servidor Python
# ============================================================================
# Uso:
#   ./start_server.sh           → lanza en modo desarrollo (--reload)
#   ./start_server.sh prod      → lanza en modo producción (sin reload)
#   ./start_server.sh stop      → detiene el servidor si está corriendo
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PATH="$SCRIPT_DIR/.venv"
PYTHON="$VENV_PATH/bin/python"
PID_FILE="$SCRIPT_DIR/.mao_server.pid"
LOG_FILE="$SCRIPT_DIR/.mao_server.log"
HOST="127.0.0.1"
PORT="8765"

# ── Colores ──────────────────────────────────────────────────────────────────
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"

log()  { echo -e "${GREEN}[MAO Server]${NC} $*"; }
warn() { echo -e "${YELLOW}[MAO Server]${NC} $*"; }
err()  { echo -e "${RED}[MAO Server]${NC} $*" >&2; }

# ── Verificar entorno ────────────────────────────────────────────────────────
if [[ ! -f "$PYTHON" ]]; then
    err "Entorno virtual no encontrado en $VENV_PATH"
    err "Ejecuta primero: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

# ── Subcomandos ──────────────────────────────────────────────────────────────

stop_server() {
    # 1. Primero matar cualquier proceso que ocupe el puerto (más fiable)
    #    Esto cubre procesos huérfanos cuyo PID no coincide con el PID file.
    local stale_pids
    stale_pids=$(lsof -ti TCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
    if [[ -n "$stale_pids" ]]; then
        echo "$stale_pids" | xargs kill -9 2>/dev/null || true
        warn "Procesos huérfanos en puerto $PORT eliminados: $stale_pids"
    fi
    # 2. Limpiar PID file haya o no proceso asociado
    if [[ -f "$PID_FILE" ]]; then
        local pid
        pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            log "Servidor detenido (PID $pid)"
        fi
        rm -f "$PID_FILE"
    fi
}

status_server() {
    if [[ -f "$PID_FILE" ]]; then
        local pid
        pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            log "Servidor corriendo (PID $pid) → http://${HOST}:${PORT}"
            log "Documentación: http://${HOST}:${PORT}/docs"
        else
            warn "PID $pid ya no está corriendo (limpiando)"
            rm -f "$PID_FILE"
        fi
    else
        warn "Servidor no está corriendo"
    fi
}

# ── Argumento ────────────────────────────────────────────────────────────────
MODE="${1:-dev}"

case "$MODE" in
    stop)
        stop_server
        exit 0
        ;;
    status)
        status_server
        exit 0
        ;;
    prod)
        log "Iniciando servidor en modo PRODUCCIÓN..."
        RELOAD_FLAG=""
        LOG_LEVEL="warning"
        ;;
    dev|*)
        log "Iniciando servidor en modo DESARROLLO (--reload activo)..."
        RELOAD_FLAG="--reload"
        LOG_LEVEL="info"
        ;;
esac

# ── Detener instancia previa si existe ───────────────────────────────────────
stop_server 2>/dev/null || true
# Dar tiempo al SO para liberar el socket tras kill -9
sleep 0.5

# ── Lanzar servidor ──────────────────────────────────────────────────────────
cd "$SCRIPT_DIR"

log "URL: http://${HOST}:${PORT}"
log "Docs: http://${HOST}:${PORT}/docs"
log "Log: $LOG_FILE"
log "Detener: ./start_server.sh stop"
echo ""

# Modo dev: en foreground para ver logs en tiempo real
if [[ "$MODE" == "dev" ]]; then
    exec "$PYTHON" -m uvicorn python.server:app \
        --host "$HOST" \
        --port "$PORT" \
        --log-level "$LOG_LEVEL" \
        $RELOAD_FLAG
else
    # Modo producción: en background
    "$PYTHON" -m uvicorn python.server:app \
        --host "$HOST" \
        --port "$PORT" \
        --log-level "$LOG_LEVEL" \
        >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    log "Servidor iniciado en background (PID $(cat "$PID_FILE"))"
fi
