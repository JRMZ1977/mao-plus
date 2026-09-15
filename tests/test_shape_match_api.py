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


def test_endpoint_usa_los_umbrales_calibrados_del_modulo(client):
    """
    ADR-017 F4 recalibró el soporte mínimo (círculo 0,30 → 0,40; elipse 0,45 → 0,50),
    pero el endpoint declaraba 0,30/0,45 como valor por defecto del formulario y los
    pasaba SIEMPRE: la app, que sólo habla con el endpoint, nunca usó la calibración.
    Un arco con soporte entre ambos umbrales separa las dos conductas.
    """
    import asyncio
    import json
    from python.modules import shape_template as st
    import numpy as np
    # Medio disco con borde de fractura largo y en zigzag: soporte ≈ 0,32 sobre el
    # círculo — entre el umbral antiguo (0,30, lo acepta) y el calibrado (0,40, lo
    # rechaza). Es el «modo degenerado» que F4 retiró.
    t = np.linspace(0, math.pi, 200)
    arco = np.stack([150 * np.cos(t), 150 * np.sin(t)], 1)
    a, b = arco[-1], arco[0]
    m = np.linspace(0, 1, 20)[1:-1]
    nrm = np.array([-(b - a)[1], (b - a)[0]]) / np.linalg.norm(b - a)
    zig = a[None] + (b - a)[None] * m[:, None] + nrm[None] * (35 * np.where(np.arange(len(m)) % 2 == 0, 1, -1))[:, None]
    pts = _ruido(_densificar((np.vstack([arco, zig]) + 300).tolist()))
    loop = asyncio.new_event_loop()
    try:
        modulo = loop.run_until_complete(st.match(pts))
        antiguo = loop.run_until_complete(st.match(pts, min_arco_fraccion={"circulo": 0.30, "elipse": 0.45}))
    finally:
        loop.close()
    api = client.post("/api/shape-match", data={"contour_json": json.dumps(pts)}).json()
    assert modulo["plantilla_tipo"] != antiguo["plantilla_tipo"] or \
        modulo["plantilla_completitud"] != antiguo["plantilla_completitud"], \
        "el caso de prueba no separa umbrales calibrados de antiguos"
    assert api["plantilla_tipo"] == modulo["plantilla_tipo"]
    assert api["plantilla_completitud"] == modulo["plantilla_completitud"]


def test_endpoint_acepta_contornos_en_formato_objeto(client):
    """El motor JS guarda contornos como {x, y}; antes np.asarray lanzaba TypeError y
    el botón decía «sin forma ideal» por un fallo de formato."""
    import json
    pts = _ruido(_densificar(_arco(0, math.pi, 300)))
    como_obj = [{"x": x, "y": y} for x, y in pts]
    a = client.post("/api/shape-match", data={"contour_json": json.dumps(pts)}).json()
    b = client.post("/api/shape-match", data={"contour_json": json.dumps(como_obj)})
    assert b.status_code == 200
    assert b.json()["plantilla_completitud"] == a["plantilla_completitud"]
