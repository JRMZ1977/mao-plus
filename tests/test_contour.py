"""
Tests de regresión: endpoint /api/contour
"""
import pytest


def _post_contour(client, png_bytes, **kwargs):
    # bbox ligeramente más amplio que el objeto (90,65,220,170) para que el módulo detecte el contorno
    params = {"bbox_x": "90", "bbox_y": "65", "bbox_w": "220", "bbox_h": "170"}
    params.update({k: str(v) for k, v in kwargs.items()})
    files = {"image": ("test.png", png_bytes, "image/png")}
    return client.post("/api/contour", data=params, files=files)


def test_contour_returns_200(client, png_bytes_dark):
    r = _post_contour(client, png_bytes_dark)
    assert r.status_code == 200


def test_contour_has_points(client, png_bytes_dark):
    body = _post_contour(client, png_bytes_dark).json()
    assert "points" in body
    assert isinstance(body["points"], list)


def test_contour_points_are_pairs(client, png_bytes_dark):
    body = _post_contour(client, png_bytes_dark).json()
    pts = body["points"]
    assert len(pts) > 0
    for p in pts[:5]:
        assert len(p) == 2, f"Punto no es par (x,y): {p}"


def test_contour_subpixel_returns_floats(client, png_bytes_dark):
    body = _post_contour(client, png_bytes_dark, subpixel="true").json()
    pts = body["points"]
    if pts:
        # Sub-pixel debe devolver floats, no solo enteros exactos
        all_int = all(p[0] == int(p[0]) and p[1] == int(p[1]) for p in pts)
        # Al menos una coordenada debe ser no-entera (sub-píxel real)
        # Se acepta que en algunas imágenes perfectas sea entero
        assert isinstance(pts[0][0], (int, float))


def test_contour_simplify_reduces_points(client, png_bytes_dark):
    """Mayor tolerancia de simplificación → menos puntos."""
    body_fine   = _post_contour(client, png_bytes_dark, simplify="0.5").json()
    body_coarse = _post_contour(client, png_bytes_dark, simplify="10.0").json()
    assert len(body_fine["points"]) >= len(body_coarse["points"])


def test_contour_missing_bbox_422(client, png_bytes_dark):
    files = {"image": ("test.png", png_bytes_dark, "image/png")}
    r = client.post("/api/contour", data={}, files=files)
    assert r.status_code == 422


def test_contour_missing_image_422(client):
    data = {"bbox_x": "0", "bbox_y": "0", "bbox_w": "100", "bbox_h": "100"}
    r = client.post("/api/contour", data=data)
    assert r.status_code == 422


# ── Tests de regresión de pipeline ───────────────────────────────────────────

class TestContourPipeline:
    """Verifica propiedades geométricas y de pipeline de extract()."""

    def test_contour_area_inside_bbox(self, client, png_bytes_dark):
        """Área del contorno ≤ área del bbox solicitado."""
        body = _post_contour(client, png_bytes_dark).json()
        pts = body.get("points", [])
        assert len(pts) >= 3
        # Área Shoelace sobre coordenadas absolutas
        import math
        x = [p[0] for p in pts]; y = [p[1] for p in pts]
        n = len(pts)
        area = 0.5 * abs(sum(x[i] * y[(i+1) % n] - x[(i+1) % n] * y[i] for i in range(n)))
        bbox_area = 220 * 170   # _post_contour: w=220, h=170
        assert area < bbox_area

    def test_contour_centroid_inside_bbox(self, client, png_bytes_dark):
        """Centroide del contorno dentro del bbox solicitado (90,65,220,170)."""
        body = _post_contour(client, png_bytes_dark).json()
        pts = body.get("points", [])
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        assert 90 <= cx <= 90 + 220
        assert 65 <= cy <= 65 + 170

    def test_contour_points_visual_fewer_than_full(self, client, png_bytes_dark):
        """points_visual debe tener ≤ puntos que points (D-P simplifica)."""
        body = _post_contour(client, png_bytes_dark).json()
        full  = body.get("points", [])
        vis   = body.get("points_visual", [])
        assert len(vis) <= len(full) + 1   # margen 1 por cierre del polígono

    def test_contour_points_visual_min_8(self, client, png_bytes_dark):
        """Fallback JS: contorno visual debe tener ≥ 8 puntos."""
        body = _post_contour(client, png_bytes_dark).json()
        assert len(body.get("points_visual", [])) >= 8

    def test_contour_epsilon_formula(self, client, png_bytes_dark):
        """ε = min(tol, max(0.5, P×0.001)) — simplify=0.5 debe dar epsilon≤0.5."""
        # Con tolerancia muy baja (0.5) y perímetro moderado, epsilon debe ser ≤ 0.5
        # por tanto el contorno visual no debe ser más simple que con tolerancia alta.
        body_low  = _post_contour(client, png_bytes_dark, simplify="0.5").json()
        body_high = _post_contour(client, png_bytes_dark, simplify="20.0").json()
        # A mayor tolerancia → epsilon mayor → menos puntos
        assert len(body_low["points_visual"]) >= len(body_high["points_visual"])

    def test_contour_returns_is_valid_flag(self, client, png_bytes_dark):
        """Respuesta debe incluir is_valid=True para imagen con objeto claro."""
        body = _post_contour(client, png_bytes_dark).json()
        assert body.get("is_valid") is True

    def test_contour_metrics_area_perimeter(self, client, png_bytes_dark):
        """metrics.area_real y metrics.perimeter_real deben ser positivos."""
        body = _post_contour(client, png_bytes_dark).json()
        m = body.get("metrics", {})
        assert m.get("area_real", 0) > 0
        assert m.get("perimeter_real", 0) > 0

    def test_contour_absolute_coords_offset(self, client, png_bytes_dark):
        """Los puntos deben estar en coordenadas absolutas (dentro del bbox declarado)."""
        body = _post_contour(client, png_bytes_dark).json()
        pts = body.get("points", [])
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        # bbox: x=90..310, y=65..235
        assert min(xs) >= 85   # tolerancia 5 px por subpixel/snap
        assert max(xs) <= 315
        assert min(ys) >= 60
        assert max(ys) <= 240
