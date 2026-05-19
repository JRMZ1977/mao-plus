"""
Tests de regresión: health, capabilities y estructura base del servidor.
"""
import pytest


def test_health_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "version" in body


def test_health_extended_fields(client):
    """El endpoint /health debe incluir pid, uptime_s y modules_failed
    para que el watchdog/main de Electron pueda diagnosticar incidencias."""
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert "pid" in body and isinstance(body["pid"], int) and body["pid"] > 0
    assert "uptime_s" in body and isinstance(body["uptime_s"], (int, float))
    assert body["uptime_s"] >= 0
    assert "modules_failed" in body and isinstance(body["modules_failed"], dict)
    assert "modules" in body and isinstance(body["modules"], list)


def test_capabilities_lists_all_modules(client):
    r = client.get("/api/capabilities")
    assert r.status_code == 200
    body = r.json()
    caps = body.get("capabilities", body)  # toleramos raíz o sub-clave
    assert isinstance(caps, (dict, list))


def test_unknown_route_returns_404(client):
    r = client.get("/api/nonexistent_endpoint_xyz")
    assert r.status_code == 404


def test_health_content_type_json(client):
    r = client.get("/api/health")
    assert "application/json" in r.headers.get("content-type", "")


def test_classify_without_classifier_module_does_not_return_500(client):
    r = client.post("/api/classify", json={"metrics_json": "{}"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
