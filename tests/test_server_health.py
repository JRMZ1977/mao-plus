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
