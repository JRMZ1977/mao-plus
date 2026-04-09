"""
MAO Plus — Configuración del servidor Python
"""

# Puerto del servidor FastAPI local
SERVER_PORT = 8765
SERVER_HOST = "127.0.0.1"
SERVER_URL  = f"http://{SERVER_HOST}:{SERVER_PORT}"

# Versión de la API
API_VERSION = "2.0.0"
API_PREFIX  = "/api"

# Límites de procesamiento
MAX_IMAGE_SIZE_MB = 50
MAX_CONTOUR_POINTS = 10_000

# Calidad de exportación
IMAGE_EXPORT_QUALITY = 95      # JPEG quality (0-100)

# CORS — localhost + Electron (file://)
# Electron envía Origin: null en peticiones desde file://.
# allow_origins=["*"] es seguro aquí porque el servidor solo escucha en 127.0.0.1.
ALLOWED_ORIGINS = ["*"]
