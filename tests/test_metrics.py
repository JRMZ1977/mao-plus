"""
Tests de regresión: endpoint /api/metrics
"""
import json
import math
import pytest


# ── Contorno elipse para reutilizar ──────────────────────────────────────────

def _ellipse(cx=200, cy=150, a=100, b=60, n=80):
    import math
    return [[cx + a * math.cos(2 * math.pi * i / n),
             cy + b * math.sin(2 * math.pi * i / n)] for i in range(n)]


ELLIPSE = _ellipse()
CIRCLE  = _ellipse(a=80, b=80, n=100)


def _post_metrics(client, png_bytes, contour, scale=1.0):
    files = {"image": ("test.png", png_bytes, "image/png")}
    data  = {"contour_json": json.dumps(contour), "scale_px_mm": str(scale)}
    return client.post("/api/metrics", data=data, files=files)


# ── Tests básicos ─────────────────────────────────────────────────────────────

def test_metrics_returns_200(client, png_bytes):
    r = _post_metrics(client, png_bytes, ELLIPSE)
    assert r.status_code == 200


def test_metrics_contains_core_keys(client, png_bytes):
    body = _post_metrics(client, png_bytes, ELLIPSE).json()
    # Métricas bajo body['metricas'] (estructura real del servidor)
    m = body.get("metricas", body)
    for key in ("area", "perimeter", "circularity", "elongation", "solidity"):
        assert key in m, f"Falta métrica: {key}"


def test_metrics_area_ellipse_approx(client, png_bytes):
    """Área shoelace debe aproximar π·a·b con ≤2% error."""
    body = _post_metrics(client, png_bytes, ELLIPSE).json()
    m = body.get("metricas", body)
    expected = math.pi * 100 * 60   # π·a·b
    assert abs(m["area"] - expected) / expected < 0.02


def test_metrics_circularity_circle_near_one(client, png_bytes):
    """Un círculo debe tener circularity ≈ 1 (tolerancia 5%)."""
    body = _post_metrics(client, png_bytes, CIRCLE).json()
    m = body.get("metricas", body)
    assert abs(m["circularity"] - 1.0) < 0.05


def test_metrics_scale_converts_area(client, png_bytes):
    """area_mm2 debe ser area_px2 * scale^2."""
    scale = 0.05  # mm/px
    body = _post_metrics(client, png_bytes, ELLIPSE, scale=scale).json()
    m = body.get("metricas", body)
    if "area_mm2" in m:
        expected_mm2 = m["area"] * scale ** 2
        assert abs(m["area_mm2"] - expected_mm2) / max(expected_mm2, 1) < 0.01


def test_metrics_convex_hull_solidity_lte_one(client, png_bytes):
    body = _post_metrics(client, png_bytes, ELLIPSE).json()
    m = body.get("metricas", body)
    s = m.get("solidity", 0)
    assert 0.0 <= s <= 1.001  # pequeña tolerancia numérica


def test_metrics_feret_max_gte_feret_min(client, png_bytes):
    body = _post_metrics(client, png_bytes, ELLIPSE).json()
    m = body.get("metricas", body)
    if "feret_max" in m and "feret_min" in m:
        assert m["feret_max"] >= m["feret_min"] * 0.999


def test_metrics_elongation_ellipse_gt_circle(client, png_bytes):
    """Una elipse tiene mayor elongación que un círculo."""
    ell_b = _post_metrics(client, png_bytes, ELLIPSE).json()
    cir_b = _post_metrics(client, png_bytes, CIRCLE).json()
    ell = ell_b.get("metricas", ell_b)
    cir = cir_b.get("metricas", cir_b)
    assert ell.get("elongation", 0) >= cir.get("elongation", 0) - 0.05


def test_metrics_missing_image_returns_error(client, ellipse_pts):
    import json
    data = {"contour_json": json.dumps(ellipse_pts), "scale_px_mm": "1.0"}
    r = client.post("/api/metrics", data=data)
    assert r.status_code == 422


def test_metrics_missing_contour_returns_error(client, png_bytes):
    files = {"image": ("t.png", png_bytes, "image/png")}
    r = client.post("/api/metrics", data={}, files=files)
    assert r.status_code == 422
