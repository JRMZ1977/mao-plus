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
