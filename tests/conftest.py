"""
MAO Plus — Fixtures compartidas para la suite de regresión (Phase D).
"""
import io
import math
import tempfile
import pytest
import numpy as np
from PIL import Image as PilImage
from fastapi.testclient import TestClient

from python.server import app


# ─── Cliente de test ─────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def client():
    """TestClient de FastAPI reutilizable en toda la sesión."""
    with TestClient(app) as c:
        yield c


# ─── Imágenes sintéticas ─────────────────────────────────────────────────────

def _make_png(w: int = 400, h: int = 300, bg: int = 200,
              obj_color: tuple = (50, 50, 50)) -> bytes:
    """PNG gris con un rectángulo oscuro centrado (objeto mock)."""
    arr = np.full((h, w, 3), bg, dtype=np.uint8)
    # Recuadro centrado al 50 %
    y0 = h // 4; y1 = 3 * h // 4
    x0 = w // 4; x1 = 3 * w // 4
    arr[y0:y1, x0:x1] = obj_color
    buf = io.BytesIO()
    PilImage.fromarray(arr).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(scope="session")
def png_bytes():
    return _make_png()


@pytest.fixture(scope="session")
def png_bytes_dark():
    """Imagen de alto contraste (fondo claro, objeto muy oscuro) para detección y contorno."""
    return _make_png(bg=240, obj_color=(20, 20, 20))


@pytest.fixture(scope="session")
def png_bytes_white_bg():
    """Fondo casi blanco (brillo_min ≥ 230) con objeto oscuro — dispara modo white_absolute."""
    return _make_png(bg=245, obj_color=(30, 30, 30))


@pytest.fixture(scope="session")
def png_bytes_chromatic_bg():
    """Fondo verde cromático con objeto marrón — dispara modo Z-scan."""
    arr = np.full((300, 400, 3), (50, 180, 50), dtype=np.uint8)   # verde
    arr[75:225, 100:300] = (120, 70, 30)                            # marrón
    buf = io.BytesIO()
    PilImage.fromarray(arr).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(scope="session")
def png_bytes_low_contrast():
    """Bajo contraste (fondo gris 150, objeto gris 120) — dispara CLAHE."""
    return _make_png(bg=150, obj_color=(120, 120, 120))


# ─── Contorno elipse sintético ─────────────────────────────────────────────

def _ellipse_points(cx=200.0, cy=150.0, a=100.0, b=60.0, n=80) -> list:
    """Puntos (x, y) de una elipse centrada en (cx, cy)."""
    angles = [2 * math.pi * i / n for i in range(n)]
    return [[cx + a * math.cos(t), cy + b * math.sin(t)] for t in angles]


@pytest.fixture(scope="session")
def ellipse_pts():
    return _ellipse_points()


@pytest.fixture(scope="session")
def circle_pts():
    """Círculo ≈ elipse con a=b."""
    return _ellipse_points(a=80, b=80, n=100)


# ─── Directorio temporal ──────────────────────────────────────────────────────

@pytest.fixture
def tmp_dir():
    with tempfile.TemporaryDirectory() as d:
        yield d
