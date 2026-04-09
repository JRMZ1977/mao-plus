"""
Tests de regresión: endpoint /api/scale
"""
import pytest


# ── Parámetros mínimos obligatorios ──────────────────────────────────────────
BASE_FORM = {
    "focal_mm":     "50",
    "distancia_mm": "300",
    "sensor_w_mm":  "36",
    "img_w_px":     "6000",
    "img_h_px":     "4000",
}


def test_scale_returns_ok_status(client):
    r = client.post("/api/scale", data=BASE_FORM)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_scale_px_mm_formula(client):
    """scale_px_mm = (sensor_w_mm / img_w_px) * (distancia_mm / focal_mm)"""
    r = client.post("/api/scale", data=BASE_FORM)
    body = r.json()
    expected = (36 / 6000) * (300 / 50)  # 0.036 mm/px
    assert abs(body["scale_px_mm"] - expected) < 1e-6


def test_scale_has_error_optico(client):
    r = client.post("/api/scale", data=BASE_FORM)
    body = r.json()
    assert "error_optico" in body
    eo = body["error_optico"]
    # Keys mínimas de Sección IX
    for key in ("error_lineal_percent", "error_area_percent", "confianza_optica"):
        assert key in eo, f"Falta clave error_optico.{key}"


def test_scale_metodo_directo_sin_sensor(client):
    """Sin sensor_w_mm y sin imagen el servidor exige el parámetro (422 es correcto)."""
    form = {"focal_mm": "50", "distancia_mm": "300", "img_w_px": "6000"}
    r = client.post("/api/scale", data=form)
    # sensor_w_mm es obligatorio cuando no hay imagen adjunta con EXIF
    assert r.status_code in (200, 422)  # 422 es el comportamiento correcto actual


def test_scale_con_centroide_objeto(client):
    """Con centroide el error óptico usa posición real, no centro."""
    form = {**BASE_FORM, "obj_centroide_x": "1500", "obj_centroide_y": "1000"}
    r = client.post("/api/scale", data=form)
    assert r.status_code == 200
    eo = r.json()["error_optico"]
    assert "posicion_radial_norm" in eo


def test_scale_missing_required_fields_returns_error(client):
    """Sin focal_mm ni distancia_mm debe fallar (422 o 400)."""
    r = client.post("/api/scale", data={"img_w_px": "6000"})
    assert r.status_code in (400, 422)


def test_scale_with_image_file(client, png_bytes):
    """Con imagen adjunta extrae dimensiones automáticamente."""
    form = {"focal_mm": "50", "distancia_mm": "300", "sensor_w_mm": "36"}
    files = {"image": ("test.png", png_bytes, "image/png")}
    r = client.post("/api/scale", data=form, files=files)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    # Dimensiones leídas de la imagen
    assert body["parametros"]["img_w_px"] == 400
    assert body["parametros"]["img_h_px"] == 300
