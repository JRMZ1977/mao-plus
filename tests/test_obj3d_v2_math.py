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


def test_crossdimensional_coherence_score_registry_numerical_parity() -> None:
    """Regresión ADR-006 Fase 3: el score de coherencia es numéricamente idéntico
    antes y después del refactor que lee escalas/claves del registro morfométrico."""
    mao2d = {
        "front_back_reference": {
            "circularity_2d": 0.75,
            "aspect_ratio_2d": 1.6,
        }
    }
    can_morph = {
        "mao_plus_indices": {
            "bifacial_homology_index": 0.65,
            "transverse_area_cv": 0.12,
            "transverse_thickness_cv": 0.08,
        },
        "transverse_summary": {"mean_thickness_z": 3.0},
    }
    morph = {"circularity_proxy": 0.70, "thickness_ratio": 0.25}
    sem_or = {"dimensions": {"ancho": 12.0, "alto": 9.0, "espesor": 3.0}}

    r = _compute_crossdimensional_mao_coherence(
        mao2d_adapted=mao2d,
        canonical_morphology=can_morph,
        morphometry=morph,
        semantic_orientation=sem_or,
    )

    # Valores de referencia calculados a mano con las fórmulas originales:
    #   h_bif  = 0.65;  long_stab = 1 - 0.5*(0.12+0.08) = 0.9
    #   circ:  exp(-|0.75-0.70|/0.15) ≈ 0.7165
    #   thk:   thk_sections=3/(12)=0.25; exp(-|0.25-0.25|/0.10)=1.0
    #   ar:    ar_rest=12/9≈1.333; exp(-|1.6-1.333|/0.35)≈0.4651
    #   score = 0.30*0.65 + 0.20*0.9 + 0.20*0.7165 + 0.15*1.0 + 0.15*0.4651
    #         ≈ 0.195 + 0.18 + 0.1433 + 0.15 + 0.0698 ≈ 0.738
    import math as _math
    expected = (
        0.30 * 0.65
        + 0.20 * 0.9
        + 0.20 * _math.exp(-abs(0.75 - 0.70) / 0.15)
        + 0.15 * _math.exp(-abs(0.25 - 0.25) / 0.10)
        + 0.15 * _math.exp(-abs(1.6 - 12.0 / 9.0) / 0.35)
    )
    assert abs(r["score"] - expected) < 1e-6, (
        f"Regresión de score: esperado {expected:.6f}, obtenido {r['score']:.6f}"
    )


def test_composite_sections_keep_normalized_elongation_semantics() -> None:
    """En secciones compuestas, elongation debe permanecer normalizada [0,1]."""
    loop_a = _ellipse_points(a=10.0, b=6.0, n=220)
    loop_b = _ellipse_points(a=3.0, b=2.0, n=180) + np.array([30.0, 0.0])

    m = _composite_section_metrics([loop_a, loop_b])

    assert 0.0 <= float(m["elongation"]) <= 1.0
    assert float(m["aspect_ratio"]) >= 1.0
    assert abs(float(m["elongation"]) - float(1.0 - (1.0 / float(m["aspect_ratio"])))) < 0.01
