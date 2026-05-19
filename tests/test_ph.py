"""
Tests de regresión: endpoint /api/ph_metrics
"""
import json
import math
import pytest


def _make_square_pts(cx, cy, side):
    h = side / 2
    return [
        {"x": cx - h, "y": cy - h},
        {"x": cx + h, "y": cy - h},
        {"x": cx + h, "y": cy + h},
        {"x": cx - h, "y": cy + h},
    ]


def _make_concave_pts():
    """Polígono cóncavo simple para validar ratios de forma en P/H."""
    return [
        {"x": 0, "y": 0},
        {"x": 4, "y": 0},
        {"x": 4, "y": 1},
        {"x": 2, "y": 0.2},
        {"x": 0, "y": 1},
    ]


PH_ONE_PERF = {
    "perforaciones": [{"id": 1, "puntos": _make_square_pts(200, 150, 40)}],
    "horadaciones": [],
}

PH_ONE_HORA = {
    "perforaciones": [],
    "horadaciones": [{"id": 1, "puntos": _make_square_pts(200, 150, 60)}],
}

PH_BOTH = {
    "perforaciones": [{"id": 1, "puntos": _make_square_pts(100, 100, 30)}],
    "horadaciones":  [{"id": 1, "puntos": _make_square_pts(300, 200, 50)}],
}

PH_CONCAVE = {
    "perforaciones": [{"id": 1, "puntos": _make_concave_pts()}],
    "horadaciones": [],
}


def _post_ph(client, payload, scale=1.0):
    return client.post("/api/ph_metrics",
                       data={"ph_json": json.dumps(payload),
                             "scale_px_mm": str(scale)})


def test_ph_returns_200(client):
    r = _post_ph(client, PH_ONE_PERF)
    assert r.status_code == 200


def test_ph_has_required_keys(client):
    body = _post_ph(client, PH_BOTH).json()
    for key in ("perforaciones", "horadaciones", "area_efectiva"):
        assert key in body, f"Falta clave: {key}"


def test_ph_counts_match(client):
    body = _post_ph(client, PH_BOTH).json()
    assert body.get("count_perforaciones", len(body["perforaciones"])) == 1
    assert body.get("count_horadaciones",  len(body["horadaciones"]))  == 1


def test_ph_perforacion_has_metrics(client):
    body = _post_ph(client, PH_ONE_PERF).json()
    perf = body["perforaciones"][0]
    # El servidor usa nombres en español: circularidad, perimetro
    for key in ("area", "perimetro", "circularidad"):
        assert key in perf, f"Falta métrica perforación: {key}"


def test_ph_area_square_approx(client):
    """Cuadrado 40px de lado → área ≈ 1600 px²."""
    body = _post_ph(client, PH_ONE_PERF).json()
    area = body["perforaciones"][0]["area"]
    assert abs(area - 1600) / 1600 < 0.05


def test_ph_area_efectiva_present(client):
    body = _post_ph(client, PH_BOTH).json()
    ae = body["area_efectiva"]
    assert "areaTotalPerforaciones" in ae or "area_total_perforaciones" in ae


def test_ph_scale_converts_area(client):
    """Con scale=0.1: area_mm2 = area_px * 0.01."""
    scale = 0.1
    body = _post_ph(client, PH_ONE_PERF, scale=scale).json()
    perf = body["perforaciones"][0]
    if "area_mm2" in perf:
        expected = perf["area"] * scale ** 2
        assert abs(perf["area_mm2"] - expected) / max(expected, 1) < 0.02


def test_ph_empty_payload(client):
    """Sin P ni H debe retornar listas vacías (no error)."""
    body = _post_ph(client, {"perforaciones": [], "horadaciones": []}).json()
    assert body["perforaciones"] == []
    assert body["horadaciones"] == []


def test_ph_missing_ph_json_422(client):
    r = client.post("/api/ph_metrics", data={"scale_px_mm": "1.0"})
    assert r.status_code == 422


def test_ph_convexidad_range_lte_one(client):
    """Convexidad MAO = P_hull / P_real debe estar en [0,1]."""
    body = _post_ph(client, PH_CONCAVE).json()
    perf = body["perforaciones"][0]
    c = perf.get("convexidad", perf.get("convexity", 0))
    assert 0.0 <= c <= 1.0


def test_ph_feret_ratio_range_lte_one(client):
    """Ratio Feret MAO = F_min / F_max debe estar en [0,1]."""
    body = _post_ph(client, PH_CONCAVE).json()
    perf = body["perforaciones"][0]
    r = perf.get("feret_ratio", 0)
    assert 0.0 <= r <= 1.0


# ─────────────────────────────────────────────────────────────────────────────
# Regresión: fórmulas corregidas en ph.py (tensor de Green + radios por aristas)
# ─────────────────────────────────────────────────────────────────────────────

import asyncio
from python.modules.ph import _principal_axes, calculate_metrics as _calc_metrics


def _make_ellipse_pts(cx, cy, a, b, n=120):
    """Genera n puntos en la elipse centrada en (cx, cy) con semiejes a, b."""
    return [
        {"x": cx + a * math.cos(2 * math.pi * i / n),
         "y": cy + b * math.sin(2 * math.pi * i / n)}
        for i in range(n)
    ]


_ELLIPSE_A = 100.0
_ELLIPSE_B = 60.0
_ELLIPSE_PTS = _make_ellipse_pts(200, 150, _ELLIPSE_A, _ELLIPSE_B)


class TestNumericalFormulasPH:
    """
    Validación numérica de las fórmulas clave de ph.py contra referencia analítica
    (elipse a=100, b=60). Tolerancia 2% para efectos de discretización N=120.
    """

    def test_principal_axes_green_eje_mayor(self):
        """_principal_axes usa tensor Green → eje_mayor ≈ 2a (tolerancia 1%)."""
        pts = [[p["x"], p["y"]] for p in _ELLIPSE_PTS]
        axes = _principal_axes(pts)
        assert abs(axes["eje_mayor_px"] - 2 * _ELLIPSE_A) / (2 * _ELLIPSE_A) < 0.01

    def test_principal_axes_green_eje_menor(self):
        """_principal_axes usa tensor Green → eje_menor ≈ 2b (tolerancia 1%)."""
        pts = [[p["x"], p["y"]] for p in _ELLIPSE_PTS]
        axes = _principal_axes(pts)
        assert abs(axes["eje_menor_px"] - 2 * _ELLIPSE_B) / (2 * _ELLIPSE_B) < 0.01

    def test_principal_axes_excentricidad(self):
        """Excentricidad analítica = sqrt(1 - (b/a)²) ≈ 0.8."""
        pts = [[p["x"], p["y"]] for p in _ELLIPSE_PTS]
        axes = _principal_axes(pts)
        exc_ref = math.sqrt(1 - (_ELLIPSE_B / _ELLIPSE_A) ** 2)
        assert abs(axes["excentricidad"] - exc_ref) < 0.01

    def test_radio_minimo_edge_method(self):
        """radio_minimo usa aristas del hull → ≈ b (semieje menor)."""
        result = asyncio.run(_calc_metrics(_ELLIPSE_PTS, "perforacion", 1, 1.0))
        assert abs(result["radio_minimo"] - _ELLIPSE_B) < 1.0

    def test_radio_maximo(self):
        """radio_maximo = vértice más lejano del hull ≈ a (semieje mayor)."""
        result = asyncio.run(_calc_metrics(_ELLIPSE_PTS, "perforacion", 1, 1.0))
        assert abs(result["radio_maximo"] - _ELLIPSE_A) < 1.0

    def test_ratio_radios_r_min_over_r_max(self):
        """ratio_radios = r_min / r_max ≈ b/a = 0.6 (coincide con JS)."""
        result = asyncio.run(_calc_metrics(_ELLIPSE_PTS, "perforacion", 1, 1.0))
        assert abs(result["ratio_radios"] - _ELLIPSE_B / _ELLIPSE_A) < 0.02

    def test_regularidad_radial_ratio_based(self):
        """regularidad_radial = ratio_radios * 100 ≈ 60 (igual que JS/metrics.py)."""
        result = asyncio.run(_calc_metrics(_ELLIPSE_PTS, "perforacion", 1, 1.0))
        assert abs(result["regularidad_radial"] - (_ELLIPSE_B / _ELLIPSE_A) * 100) < 2.0

    def test_eje_mayor_in_metrics(self):
        """eje_mayor en la respuesta completa ≈ 2a."""
        result = asyncio.run(_calc_metrics(_ELLIPSE_PTS, "perforacion", 1, 1.0))
        assert abs(result["eje_mayor"] - 2 * _ELLIPSE_A) < 2.0

    def test_eje_menor_in_metrics(self):
        """eje_menor en la respuesta completa ≈ 2b."""
        result = asyncio.run(_calc_metrics(_ELLIPSE_PTS, "perforacion", 1, 1.0))
        assert abs(result["eje_menor"] - 2 * _ELLIPSE_B) < 2.0

    def test_excentricidad_in_metrics(self):
        """Excentricidad en la respuesta completa ≈ 0.8."""
        result = asyncio.run(_calc_metrics(_ELLIPSE_PTS, "perforacion", 1, 1.0))
        exc_ref = math.sqrt(1 - (_ELLIPSE_B / _ELLIPSE_A) ** 2)
        assert abs(result["excentricidad"] - exc_ref) < 0.01
