"""Integración endpoint 3D homologado FRONT/BACK con dependencias mockeadas."""

import python.server as server


def test_obj3d_front_back_homologation_endpoint_contract(client, monkeypatch):
    calls = {"faces": []}

    async def _mock_analyze(*, obj_bytes, n_samples, normalize_mode, analysis_level, orientation_mode, user_anchor):
        del obj_bytes, n_samples, normalize_mode, orientation_mode, user_anchor
        assert analysis_level == "v2"
        # Estructura real devuelta por analyze_v2: obj3d.morphology_canonical.front_back
        return {
            "status": "ok",
            "obj3d": {
                "morphology_canonical": {
                    "front_back": {
                        "front": {
                            "contour_xy": [[0.0, 0.0], [3.0, 0.0], [1.5, 2.0]],
                        },
                        "back": {
                            "contour_xy": [[0.0, 0.0], [2.0, 0.0], [1.0, 1.5]],
                        },
                        "bifacial_balance": {
                            "area_balance": 0.82,
                        },
                    }
                }
            },
        }

    async def _mock_metrics_calculate(image_bytes, contour_points, scale_px_mm):
        del image_bytes, scale_px_mm
        calls["faces"].append(len(contour_points))
        return {
            "metricas": {
                "circularity": 0.75,
                "elongation": 0.31,
                "aspect_ratio_tight": 1.42,
            }
        }

    monkeypatch.setattr(server.modules.obj3d, "analyze", _mock_analyze)
    monkeypatch.setattr(server.modules.metrics, "calculate", _mock_metrics_calculate)

    files = {"obj_file": ("pieza.obj", b"v 0 0 0\n", "text/plain")}
    data = {"mm_per_unit": "1.25"}

    r = client.post("/api/obj3d/front-back-metrics-homologated", files=files, data=data)
    assert r.status_code == 200

    body = r.json()
    assert body["status"] == "ok"
    assert body["modelo"] == "mao_plus_3d_bifacial_homologation_v1"
    assert body["homologacion_metodo"] == "front_back_projection_xy"
    assert abs(float(body["bifacial_index"]) - 0.82) < 1e-9
    assert abs(float(body["mm_per_unit"]) - 1.25) < 1e-9

    assert body["cara_anverso"]["label"] == "FRONT"
    assert body["cara_reverso"]["label"] == "BACK"
    assert "contour_points" in body["cara_anverso"]
    assert "contour_points" in body["cara_reverso"]
    assert "circularity" in body["cara_anverso"]
    assert "elongation" in body["cara_reverso"]

    assert len(calls["faces"]) == 2

