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
