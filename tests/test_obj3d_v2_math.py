import asyncio

import numpy as np

from python.modules import metrics
from python.modules.obj3d_v2 import (
    _composite_section_metrics,
    _compute_crossdimensional_mao_coherence,
    _section_morphometric_metrics_2d,
)


def _ellipse_points(a: float = 10.0, b: float = 6.0, n: int = 240) -> np.ndarray:
    t = np.linspace(0.0, 2.0 * np.pi, n, endpoint=False)
    return np.column_stack([a * np.cos(t), b * np.sin(t)])


def test_section_elongation_semantics_matches_metrics_module() -> None:
    """Secciones 3D deben usar elongation normalizada igual que metrics.py."""
    pts = _ellipse_points()

    async def _run() -> dict:
        out = await metrics.calculate(b"", pts.tolist(), 1.0)
        return out["metricas"]

    m2d = asyncio.run(_run())
    msec = _section_morphometric_metrics_2d(pts)

    assert abs(float(msec["elongation"]) - float(m2d["elongation"])) < 0.03
    assert abs(float(msec["aspect_ratio"]) - float(m2d["aspect_ratio_tight"])) < 0.03


def test_crossdimensional_coherence_missing_2d_fields_is_neutral() -> None:
    """Si faltan campos 2D, los componentes deben degradar a valor neutral (0.5)."""
    mao2d_adapted = {}
    canonical_morphology = {
        "mao_plus_indices": {
            "bifacial_homology_index": 0.8,
            "transverse_area_cv": 0.1,
            "transverse_thickness_cv": 0.1,
        },
        "transverse_summary": {"mean_thickness_z": 2.0},
    }
    morphometry = {"circularity_proxy": 0.8, "thickness_ratio": 0.3}
    semantic_orientation = {"dimensions": {"ancho": 10.0, "alto": 8.0, "espesor": 3.0}}

    r = _compute_crossdimensional_mao_coherence(
        mao2d_adapted=mao2d_adapted,
        canonical_morphology=canonical_morphology,
        morphometry=morphometry,
        semantic_orientation=semantic_orientation,
    )

    assert r["components"]["shape_consistency"] == 0.5
    assert r["components"]["aspect_consistency"] == 0.5


def test_composite_sections_keep_normalized_elongation_semantics() -> None:
    """En secciones compuestas, elongation debe permanecer normalizada [0,1]."""
    loop_a = _ellipse_points(a=10.0, b=6.0, n=220)
    loop_b = _ellipse_points(a=3.0, b=2.0, n=180) + np.array([30.0, 0.0])

    m = _composite_section_metrics([loop_a, loop_b])

    assert 0.0 <= float(m["elongation"]) <= 1.0
    assert float(m["aspect_ratio"]) >= 1.0
    assert abs(float(m["elongation"]) - float(1.0 - (1.0 / float(m["aspect_ratio"])))) < 0.01
