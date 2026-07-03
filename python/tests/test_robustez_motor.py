"""
test_robustez_motor.py — Robustez del motor matemático ante geometría degenerada.

Premisa: la robustez debe NACER en el motor (no solo en la entrega). Este harness
alimenta geometría PATOLÓGICA a los endpoints reales del motor y exige, para cada caso:

  1. Nunca un 500 incontrolado. Válido: 200 (computó a salvo) o 4xx (rechazo limpio).
  2. Ningún NaN/Inf en las salidas numéricas (las guardas de denominador funcionan).
  3. Determinismo (misma entrada → misma salida).

Vía FastAPI TestClient (igual que el resto de la suite) → ejercita el path de producción.
Cubre metrics · efa · scale · ph_metrics, y `classifier.py` (que estaba SIN test) por
llamada directa con el patrón de aislamiento de event-loop (asyncio.new_event_loop por
llamada — ver gotcha en CLAUDE.md).
"""
import asyncio
import io
import json
import math

import numpy as np
import pytest
from PIL import Image as PilImage
from fastapi.testclient import TestClient

from python.modules import classifier
from python.server import app


@pytest.fixture(scope="module")
def client():
    """TestClient local (el conftest con `client` vive en tests/, no en python/tests/)."""
    with TestClient(app) as c:
        yield c


# ── utilidades ───────────────────────────────────────────────────────────────
def _png(w: int = 64, h: int = 64, bg: int = 200) -> bytes:
    arr = np.full((h, w, 3), bg, dtype=np.uint8)
    arr[16:48, 16:48] = 40
    b = io.BytesIO()
    PilImage.fromarray(arr).save(b, format="PNG")
    return b.getvalue()


def _finite_bad(obj, path="") -> list:
    """Rutas de todo valor float NO finito (NaN/Inf) en una estructura anidada."""
    bad = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            bad += _finite_bad(v, f"{path}.{k}")
    elif isinstance(obj, (list, tuple)):
        for i, v in enumerate(obj):
            bad += _finite_bad(v, f"{path}[{i}]")
    elif isinstance(obj, float):
        if not math.isfinite(obj):
            bad.append(f"{path}={obj}")
    return bad


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ── geometrías degeneradas ───────────────────────────────────────────────────
DEGEN = {
    "square":    [[0, 0], [10, 0], [10, 10], [0, 10]],              # baseline
    "collinear": [[0, 0], [5, 0], [10, 0], [15, 0]],               # área = 0
    "tiny":      [[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01]],     # sub-píxel
    "huge":      [[0, 0], [1e6, 0], [1e6, 1e6], [0, 1e6]],         # fuera de imagen
    "octagon":   [[math.cos(2 * math.pi * i / 8) * 10 + 20,
                   math.sin(2 * math.pi * i / 8) * 10 + 20] for i in range(8)],
    "near_dup":  [[3, 3], [3, 3], [3.0001, 3], [3, 3.0001]],       # perímetro ≈ 0
}


# ── metrics ──────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("name", list(DEGEN))
def test_metrics_nunca_crashea_ni_propaga_nan(client, name):
    r = client.post(
        "/api/metrics",
        files={"image": ("t.png", _png(), "image/png")},
        data={"contour_json": json.dumps(DEGEN[name]), "scale_px_mm": "0.05"},
    )
    assert r.status_code in (200, 400, 422), f"[{name}] crash incontrolado {r.status_code}"
    if r.status_code == 200:
        bad = _finite_bad(r.json())
        assert not bad, f"[{name}] NaN/Inf en métricas: {bad[:8]}"


def test_metrics_menos_de_3_puntos_rechaza_limpio(client):
    r = client.post(
        "/api/metrics",
        files={"image": ("t.png", _png(), "image/png")},
        data={"contour_json": json.dumps([[0, 0], [1, 1]]), "scale_px_mm": "1.0"},
    )
    assert r.status_code in (400, 422), f"esperado rechazo controlado, fue {r.status_code}"


def test_metrics_determinista(client):
    img = _png()
    data = {"contour_json": json.dumps(DEGEN["octagon"]), "scale_px_mm": "0.05"}
    r1 = client.post("/api/metrics", files={"image": ("t.png", img, "image/png")}, data=data)
    r2 = client.post("/api/metrics", files={"image": ("t.png", img, "image/png")}, data=data)
    assert r1.status_code == r2.status_code == 200
    assert r1.json()["metricas"] == r2.json()["metricas"]


# ── EFA ──────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("name", list(DEGEN))
def test_efa_nunca_crashea_ni_propaga_nan(client, name):
    r = client.post(
        "/api/efa",
        data={"contour_json": json.dumps(DEGEN[name]), "n_harmonics": "10", "scale_px_mm": "1.0"},
    )
    assert r.status_code in (200, 400, 422), f"[{name}] crash incontrolado {r.status_code}"
    if r.status_code == 200:
        bad = _finite_bad(r.json())
        assert not bad, f"[{name}] NaN/Inf en EFA: {bad[:8]}"


# ── scale + error óptico ─────────────────────────────────────────────────────
@pytest.mark.parametrize("focal,sensor", [("0", "36"), ("50", "0"), ("50", "36")])
def test_scale_params_degenerados_no_propagan_inf(client, focal, sensor):
    """focal=0 o sensor=0 no deben producir Inf en el modelo de error óptico."""
    r = client.post("/api/scale", data={
        "focal_mm": focal, "distancia_mm": "300", "sensor_w_mm": sensor, "sensor_h_mm": sensor,
        "img_w_px": "6000", "img_h_px": "4000", "obj_centroide_x": "5900", "obj_centroide_y": "3900",
    })
    assert r.status_code in (200, 400, 422), f"crash incontrolado {r.status_code}"
    if r.status_code == 200:
        bad = _finite_bad(r.json())
        assert not bad, f"scale(focal={focal},sensor={sensor}) propaga Inf/NaN: {bad}"


# ── P/H ──────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("name", ["square", "collinear", "near_dup"])
def test_ph_metrics_degenerado(client, name):
    ph = {"perforaciones": [{"puntos": DEGEN[name], "id": 1}], "horadaciones": []}
    r = client.post("/api/ph_metrics", data={"ph_json": json.dumps(ph), "scale_px_mm": "0.05"})
    assert r.status_code in (200, 400, 422), f"[{name}] crash incontrolado {r.status_code}"
    if r.status_code == 200:
        assert not _finite_bad(r.json())


# ── classifier (estaba SIN test) ─────────────────────────────────────────────
@pytest.mark.parametrize("metrics", [
    {},                                        # dict vacío
    {"circularity": float("nan")},             # NaN de entrada
    {"area": 0, "perimeter": 0},               # geometría nula
    {"circularity": 0.95, "solidity": 0.98, "aspect_ratio": 1.0},  # válido
])
def test_classifier_metricas_degeneradas(metrics):
    res = _run(classifier.classify_async(metrics))
    assert isinstance(res, dict), "classify_async debe devolver dict siempre"
    assert not _finite_bad(res), f"classify propaga NaN/Inf con {metrics}"
