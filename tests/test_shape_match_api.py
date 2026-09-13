"""
ADR-017 F1 — gate HTTP del endpoint `/api/shape-match`.

Vive aquí y no en `python/tests/` porque el fixture `client` (TestClient de
FastAPI) lo provee `tests/conftest.py`. El gate del MÓDULO está en
`python/tests/test_shape_template.py`.
"""

import json
import math

from python.tests.test_shape_template import (          # geometría sintética compartida
    _arco, _densificar, _elipse, _ruido,
)

def test_endpoint_shape_match(client):
    """El endpoint entrega el mismo contrato que el módulo."""
    import json
    pts = _ruido(_densificar(_arco(0, math.pi, 300)))      # medio disco
    r = client.post("/api/shape-match", data={"contour_json": json.dumps(pts)})
    assert r.status_code == 200
    d = r.json()
    assert d["plantilla_tipo"] == "circulo"
    assert abs(d["plantilla_completitud"] - 50.0) <= 3.0
    assert d["es_fragmento_candidato"] is True


def test_endpoint_rechaza_json_invalido(client):
    r = client.post("/api/shape-match", data={"contour_json": "{no-es-json"})
    assert r.status_code == 422


def test_endpoint_respeta_seleccion_de_plantillas(client):
    import json
    pts = _ruido(_densificar(_elipse(120, 60, 0.4, 0, 2 * math.pi, 600)[:-1]))
    r = client.post("/api/shape-match", data={
        "contour_json": json.dumps(pts),
        "templates_json": json.dumps(["circulo"]),      # sólo círculo
    })
    assert r.status_code == 200
    d = r.json()
    assert all(c["tipo"] == "circulo" for c in d["candidatos"])

def test_el_modulo_se_anuncia_en_capabilities(client):
    """
    El bridge sólo llama al endpoint si `isModuleActive('shape_template')`. Si el
    módulo no se anuncia en /api/capabilities, el guard devuelve null SIEMPRE y el
    botón queda muerto sin ningún error visible — el fallo más caro de diagnosticar.
    """
    caps = client.get("/api/capabilities").json()
    mods = caps.get("modules", caps)
    assert mods.get("shape_template") is True, (
        f"shape_template no se anuncia como activo: {mods.get('shape_template')!r}"
    )
