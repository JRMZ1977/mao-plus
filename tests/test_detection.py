"""
Tests de regresión: endpoint /api/detect
"""
import pytest


def _post_detect(client, png_bytes, **kwargs):
    files = {"image": ("test.png", png_bytes, "image/png")}
    data  = {k: str(v) for k, v in kwargs.items()}
    return client.post("/api/detect", data=data, files=files)


def test_detect_returns_200(client, png_bytes_dark):
    r = _post_detect(client, png_bytes_dark)
    assert r.status_code == 200


def test_detect_has_objects_key(client, png_bytes_dark):
    body = _post_detect(client, png_bytes_dark).json()
    assert "objects" in body


def test_detect_objects_is_list(client, png_bytes_dark):
    body = _post_detect(client, png_bytes_dark).json()
    assert isinstance(body["objects"], list)


def test_detect_finds_object_in_synthetic_image(client, png_bytes_dark):
    """La imagen tiene un cuadrado oscuro central: debe detectar ≥1 objeto."""
    body = _post_detect(client, png_bytes_dark, min_area=500).json()
    assert len(body["objects"]) >= 1


def test_detect_object_has_bbox(client, png_bytes_dark):
    body = _post_detect(client, png_bytes_dark, min_area=500).json()
    if body["objects"]:
        obj = body["objects"][0]
        # bbox puede estar anidado {'bbox': {'x',...}} o plano {'x':...,'width':...}
        has_nested = "bbox" in obj and isinstance(obj["bbox"], dict)
        has_flat    = all(k in obj for k in ("x", "y", "width", "height"))
        assert has_nested or has_flat, f"Sin estructura bbox reconocida: {list(obj.keys())}"


def test_detect_object_has_area(client, png_bytes_dark):
    body = _post_detect(client, png_bytes_dark, min_area=100).json()
    if body["objects"]:
        assert "area" in body["objects"][0]


def test_detect_max_objects_limit(client, png_bytes_dark):
    body = _post_detect(client, png_bytes_dark, max_objects=1).json()
    assert len(body["objects"]) <= 1


def test_detect_high_threshold_fewer_objects(client, png_bytes_dark):
    """Umbral mayor → menos objetos detectados."""
    low  = _post_detect(client, png_bytes_dark, threshold=0.1).json()
    high = _post_detect(client, png_bytes_dark, threshold=0.9).json()
    assert len(low["objects"]) >= len(high["objects"])


def test_detect_missing_image_422(client):
    r = client.post("/api/detect", data={"threshold": "0.5"})
    assert r.status_code == 422
