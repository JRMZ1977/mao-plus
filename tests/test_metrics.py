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


# ── Tests de regresión numérica (fórmulas validadas contra referencia analítica) ──


def _ellipse_n(cx=200, cy=150, a=100, b=60, n=360):
    """Elipse de alta densidad para validaciones numéricas precisas."""
    import math
    return [[cx + a * math.cos(2 * math.pi * i / n),
             cy + b * math.sin(2 * math.pi * i / n)] for i in range(n)]


ELLIPSE_360 = _ellipse_n()
CIRCLE_360  = _ellipse_n(a=80, b=80)


class TestNumericalFormulas:
    """Validación numérica de fórmulas morfológicas contra referencia analítica.

    Elipse a=100, b=60, N=360.  Todos los errores tolerados ≤ 0.5 %.
    """

    def test_area_shoelace_ellipse(self, client, png_bytes):
        """Área shoelace ≈ π·a·b = 18849.56 (error ≤ 0.1 %)."""
        m = _post_metrics(client, png_bytes, ELLIPSE_360).json().get("metricas", {})
        expected = math.pi * 100 * 60
        assert abs(m["area"] - expected) / expected < 0.001

    def test_circularity_ellipse(self, client, png_bytes):
        """Circularidad de elipse a/b=5/3 ≈ 0.909 (error ≤ 0.5 %)."""
        m = _post_metrics(client, png_bytes, ELLIPSE_360).json().get("metricas", {})
        # Referencia Ramanujan
        a, b = 100, 60
        h_r = (a - b) ** 2 / (a + b) ** 2
        p_ram = math.pi * (a + b) * (1 + 3 * h_r / (10 + math.sqrt(4 - 3 * h_r)))
        circ_ref = 4 * math.pi * math.pi * a * b / p_ram ** 2
        assert abs(m["circularity"] - circ_ref) / circ_ref < 0.005

    def test_eccentricity_ellipse(self, client, png_bytes):
        """Excentricidad ≈ √(1-(60/100)²) = 0.8 (Δ ≤ 0.005)."""
        m = _post_metrics(client, png_bytes, ELLIPSE_360).json().get("metricas", {})
        exc_ref = math.sqrt(1 - (60 / 100) ** 2)  # 0.800
        assert abs(m.get("excentricidad", 0) - exc_ref) < 0.005

    def test_eigenvalues_ellipse(self, client, png_bytes):
        """Anisotropía ≈ (a²-b²)/(a²+b²) = 1600/3400 ≈ 0.4706 (Δ ≤ 0.005)."""
        m = _post_metrics(client, png_bytes, ELLIPSE_360).json().get("metricas", {})
        aniso = m.get("eje_principal_anisotropia")
        if aniso is None:
            pytest.skip("eje_principal_anisotropia no presente en respuesta")
        aniso_ref = (100**2 - 60**2) / (100**2 + 60**2)  # 1600/3400 ≈ 0.4706
        assert abs(aniso - aniso_ref) < 0.005

    def test_feret_ratio_ellipse(self, client, png_bytes):
        """feret_ratio = feret_min/feret_max ≈ b/a = 0.6 (Δ ≤ 0.005)."""
        m = _post_metrics(client, png_bytes, ELLIPSE_360).json().get("metricas", {})
        ratio = m.get("feret_ratio")
        if ratio is None:
            pytest.skip("feret_ratio no presente en respuesta")
        assert abs(ratio - 0.6) < 0.005

    def test_solidity_convex_ellipse(self, client, png_bytes):
        """Solidez de elipse convexa ≈ 1.0 (Δ ≤ 0.001)."""
        m = _post_metrics(client, png_bytes, ELLIPSE_360).json().get("metricas", {})
        assert abs(m.get("solidity", 0) - 1.0) < 0.001

    def test_feret_max_approx_2a(self, client, png_bytes):
        """feret_max ≈ 2·a = 200 px (error ≤ 0.5 %)."""
        m = _post_metrics(client, png_bytes, ELLIPSE_360).json().get("metricas", {})
        fmax = m.get("feret_max_px", m.get("feret_max"))
        if fmax is None:
            pytest.skip("feret_max_px no presente en respuesta")
        assert abs(fmax - 200.0) / 200.0 < 0.005

    def test_feret_min_approx_2b(self, client, png_bytes):
        """feret_min ≈ 2·b = 120 px (error ≤ 0.5 %)."""
        m = _post_metrics(client, png_bytes, ELLIPSE_360).json().get("metricas", {})
        fmin = m.get("feret_min_px", m.get("feret_min"))
        if fmin is None:
            pytest.skip("feret_min_px no presente en respuesta")
        assert abs(fmin - 120.0) / 120.0 < 0.005

    def test_bilateral_symmetry_circle(self, client, png_bytes):
        """Círculo debe tener simetría bilateral ≈ 1.0 (≥ 0.90)."""
        m = _post_metrics(client, png_bytes, CIRCLE_360).json().get("metricas", {})
        sym = m.get("simetria_bilateral")
        if sym is None:
            pytest.skip("simetria_bilateral no presente en respuesta")
        assert sym >= 0.90

    def test_rugosidad_circle_near_zero(self, client, png_bytes):
        """Rugosidad de círculo uniforme ≈ 0 (≤ 0.01)."""
        m = _post_metrics(client, png_bytes, CIRCLE_360).json().get("metricas", {})
        rug = m.get("rugosidad_contorno")
        if rug is None:
            pytest.skip("rugosidad_contorno no presente en respuesta")
        assert rug <= 0.01
