"""
ADR-015 A1 — Validación de exactitud (trueness)
================================================
Protocolo de validación Bland-Altman para las métricas dimensionales de MAO Plus.

Estrategia: objetos sintéticos con verdad geométrica conocida exactamente.
  - Círculos y elipses → área, perímetro, ejes, circularidad conocidos por fórmula
  - Pasados a través del motor de métricas (`python.modules.metrics`)
  - Comparación medido vs. referencia con análisis de Bland-Altman

Gate ADR-015 A1:
  - MAE% por métrica < 5% (umbral metrológico)
  - LoA documentados
  - Script reproducible (seed fijo, no depende de estado global)
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
import pytest

# Path setup
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from python.modules.validation_stats import bland_altman, summary_accuracy


# ────────────────────────────────────────────────────────────────────────────
# Generadores de contornos sintéticos con verdad conocida
# ────────────────────────────────────────────────────────────────────────────

def _circle_contour(cx: float, cy: float, r: float, n: int = 200) -> list[list[float]]:
    """Contorno de círculo con n puntos. Verdad: area=π·r², perim=2π·r."""
    angles = np.linspace(0, 2 * math.pi, n, endpoint=False)
    return [[cx + r * math.cos(a), cy + r * math.sin(a)] for a in angles]


def _ellipse_contour(cx: float, cy: float, a: float, b: float, n: int = 200) -> list[list[float]]:
    """Contorno de elipse. Verdad: area=π·a·b; perim ≈ Ramanujan."""
    angles = np.linspace(0, 2 * math.pi, n, endpoint=False)
    return [[cx + a * math.cos(ang), cy + b * math.sin(ang)] for ang in angles]


def _ramanujan_perimeter(a: float, b: float) -> float:
    """Aproximación de Ramanujan para el perímetro de una elipse (error < 1e-7)."""
    h = ((a - b) / (a + b)) ** 2
    return math.pi * (a + b) * (1 + 3 * h / (10 + math.sqrt(4 - 3 * h)))


# ────────────────────────────────────────────────────────────────────────────
# Métricas via el motor MAO
# ────────────────────────────────────────────────────────────────────────────

def _compute_metrics(contour: list[list[float]], scale_px_mm: float = 1.0) -> dict:
    """Llama al motor de métricas MAO sobre el contorno sintético."""
    import asyncio
    import cv2
    from python.modules.metrics import calculate as metrics_calculate

    contour_np = np.array(contour, dtype=np.float32)
    w = int(contour_np[:, 0].max()) + 10
    h = int(contour_np[:, 1].max()) + 10
    dummy_image = np.ones((max(h, 50), max(w, 50), 3), dtype=np.uint8) * 200

    ok, buf = cv2.imencode(".png", dummy_image)
    image_bytes = bytes(buf)

    loop = asyncio.new_event_loop()
    try:
        result = loop.run_until_complete(
            metrics_calculate(image_bytes, contour, scale_px_mm=scale_px_mm)
        )
    finally:
        loop.close()

    return result.get("metricas", result)


# ────────────────────────────────────────────────────────────────────────────
# Fixtures de objetos con verdad conocida
# ────────────────────────────────────────────────────────────────────────────

# Batería de círculos: varios radii para cubrir rangos de tamaño
CIRCLE_SPECS = [
    # (r_px, scale_px_mm) → r_mm = r_px * scale_px_mm
    (50, 0.10),   # r=5 mm
    (80, 0.10),   # r=8 mm
    (100, 0.10),  # r=10 mm
    (50, 0.05),   # r=2.5 mm
    (120, 0.08),  # r=9.6 mm
]

# Batería de elipses: distintas relaciones a/b
ELLIPSE_SPECS = [
    # (a_px, b_px, scale)
    (100, 60, 0.10),
    (80, 40, 0.10),
    (120, 80, 0.08),
    (90, 50, 0.10),
    (60, 30, 0.12),
]


def _circle_ground_truth(r_px: float, scale: float) -> dict[str, float]:
    r_mm = r_px * scale
    return {
        "area_mm2": math.pi * r_mm ** 2,
        "perimeter_mm": 2 * math.pi * r_mm,
        "circularity": 1.0,
        "elongation": 1.0,  # a=b → elongation≈1
    }


def _ellipse_ground_truth(a_px: float, b_px: float, scale: float) -> dict[str, float]:
    a_mm = a_px * scale
    b_mm = b_px * scale
    return {
        "area_mm2": math.pi * a_mm * b_mm,
        "perimeter_mm": _ramanujan_perimeter(a_mm, b_mm),
        "circularity": (4 * math.pi * math.pi * a_mm * b_mm) /
                       (_ramanujan_perimeter(a_mm, b_mm) ** 2),
    }


# ────────────────────────────────────────────────────────────────────────────
# Tests de exactitud por métrica — Bland-Altman
# ────────────────────────────────────────────────────────────────────────────

class TestExactitudArea:
    """A1: exactitud del área (mm²) sobre objetos sintéticos."""

    def test_area_circles_mae_bajo_5pct(self):
        measured, reference = [], []
        for r_px, scale in CIRCLE_SPECS:
            contour = _circle_contour(200, 200, r_px, n=500)
            m = _compute_metrics(contour, scale_px_mm=scale)
            area_mm = m.get("area")  # ya está en mm²
            measured.append(area_mm)
            reference.append(_circle_ground_truth(r_px, scale)["area_mm2"])

        ba = bland_altman(measured, reference)
        assert ba["mean_abs_error_pct"] < 5.0, (
            f"MAE área círculos {ba['mean_abs_error_pct']:.2f}% > 5%"
        )

    def test_area_ellipses_mae_bajo_5pct(self):
        measured, reference = [], []
        for a_px, b_px, scale in ELLIPSE_SPECS:
            contour = _ellipse_contour(200, 200, a_px, b_px, n=500)
            m = _compute_metrics(contour, scale_px_mm=scale)
            area_mm = m.get("area")  # ya en mm²
            measured.append(area_mm)
            reference.append(_ellipse_ground_truth(a_px, b_px, scale)["area_mm2"])

        ba = bland_altman(measured, reference)
        assert ba["mean_abs_error_pct"] < 5.0, (
            f"MAE área elipses {ba['mean_abs_error_pct']:.2f}% > 5%"
        )

    def test_area_circles_sesgo_bajo_2pct(self):
        """El sesgo sistemático en área debe ser < 2% (no solo el MAE)."""
        measured, reference = [], []
        for r_px, scale in CIRCLE_SPECS:
            contour = _circle_contour(200, 200, r_px, n=500)
            m = _compute_metrics(contour, scale_px_mm=scale)
            area_mm = m.get("area")  # ya en mm²
            measured.append(area_mm)
            reference.append(_circle_ground_truth(r_px, scale)["area_mm2"])

        ba = bland_altman(measured, reference)
        assert abs(ba["bias_pct"]) < 2.0, (
            f"Sesgo área círculos {ba['bias_pct']:.2f}% > ±2%"
        )


class TestExactitudPerimetro:
    """A1: exactitud del perímetro (mm) sobre objetos sintéticos."""

    def test_perimetro_circles_mae_bajo_5pct(self):
        measured, reference = [], []
        for r_px, scale in CIRCLE_SPECS:
            contour = _circle_contour(200, 200, r_px, n=500)
            m = _compute_metrics(contour, scale_px_mm=scale)
            perim_mm = m.get("perimeter")  # ya en mm
            measured.append(perim_mm)
            reference.append(_circle_ground_truth(r_px, scale)["perimeter_mm"])

        ba = bland_altman(measured, reference)
        assert ba["mean_abs_error_pct"] < 5.0, (
            f"MAE perímetro círculos {ba['mean_abs_error_pct']:.2f}% > 5%"
        )

    def test_perimetro_ellipses_mae_bajo_5pct(self):
        measured, reference = [], []
        for a_px, b_px, scale in ELLIPSE_SPECS:
            contour = _ellipse_contour(200, 200, a_px, b_px, n=500)
            m = _compute_metrics(contour, scale_px_mm=scale)
            perim_mm = m.get("perimeter")  # ya en mm
            measured.append(perim_mm)
            reference.append(_ellipse_ground_truth(a_px, b_px, scale)["perimeter_mm"])

        ba = bland_altman(measured, reference)
        assert ba["mean_abs_error_pct"] < 5.0, (
            f"MAE perímetro elipses {ba['mean_abs_error_pct']:.2f}% > 5%"
        )


class TestExactitudCircularidad:
    """A1: exactitud de la circularidad (adimensional) sobre círculos."""

    def test_circularidad_circle_near_one(self):
        """Círculo perfecto → circularidad ≈ 1.0 con MAE < 3%."""
        measured, reference = [], []
        for r_px, scale in CIRCLE_SPECS:
            contour = _circle_contour(200, 200, r_px, n=500)
            m = _compute_metrics(contour, scale_px_mm=scale)
            circ = m.get("circularity", 0)
            measured.append(circ)
            reference.append(1.0)

        ba = bland_altman(measured, reference)
        assert ba["mean_abs_error_pct"] < 3.0, (
            f"MAE circularidad círculos {ba['mean_abs_error_pct']:.2f}% > 3%"
        )


class TestExactitudLoA:
    """A1: Límites de Acuerdo (LoA) documentados para el reporte."""

    def test_loa_area_calculados(self):
        """Los LoA del área deben ser finitos y simétricos respecto al sesgo."""
        measured, reference = [], []
        for r_px, scale in CIRCLE_SPECS:
            contour = _circle_contour(200, 200, r_px, n=500)
            m = _compute_metrics(contour, scale_px_mm=scale)
            measured.append(m.get("area"))
            reference.append(_circle_ground_truth(r_px, scale)["area_mm2"])
        for a_px, b_px, scale in ELLIPSE_SPECS:
            contour = _ellipse_contour(200, 200, a_px, b_px, n=500)
            m = _compute_metrics(contour, scale_px_mm=scale)
            measured.append(m.get("area"))
            reference.append(_ellipse_ground_truth(a_px, b_px, scale)["area_mm2"])

        ba = bland_altman(measured, reference)
        assert math.isfinite(ba["loa_lower"]), "LoA inferior no finito"
        assert math.isfinite(ba["loa_upper"]), "LoA superior no finito"
        assert ba["loa_lower"] < ba["bias"] < ba["loa_upper"], (
            "El sesgo debe estar dentro de sus propios LoA"
        )
        assert ba["within_loa_pct"] >= 90.0, (
            f"Solo {ba['within_loa_pct']}% dentro de los LoA (esperado ≥90%)"
        )


# ────────────────────────────────────────────────────────────────────────────
# Tests de la propia función Bland-Altman
# ────────────────────────────────────────────────────────────────────────────

class TestBlandAltmanFunctions:
    """Tests unitarios del módulo validation_stats."""

    def test_sesgo_cero_en_mediciones_perfectas(self):
        values = [1.0, 2.0, 3.0, 4.0, 5.0]
        ba = bland_altman(values, values)
        assert ba["bias"] == pytest.approx(0.0)
        assert ba["mean_abs_error"] == pytest.approx(0.0)

    def test_sesgo_conocido(self):
        measured = [2.0, 3.0, 4.0, 5.0]
        reference = [1.0, 2.0, 3.0, 4.0]
        ba = bland_altman(measured, reference)
        assert ba["bias"] == pytest.approx(1.0)

    def test_loa_simetricos(self):
        import random
        rng = random.Random(42)
        ref = [rng.uniform(5, 15) for _ in range(20)]
        meas = [v + rng.gauss(0, 0.5) for v in ref]
        ba = bland_altman(meas, ref)
        half_width = ba["sd_diff"] * 1.96
        assert abs(ba["loa_upper"] - ba["bias"] - half_width) < 1e-4
        assert abs(ba["bias"] - ba["loa_lower"] - half_width) < 1e-4

    def test_summary_accuracy_ordenada_por_mae(self):
        results = {
            "area": bland_altman([1.0, 2.0], [1.1, 2.0]),
            "perimeter": bland_altman([1.0, 2.0], [1.0, 2.2]),
        }
        summary = summary_accuracy(results)
        assert len(summary) == 2
        # El de mayor error va primero
        assert summary[0]["mae_pct"] >= summary[1]["mae_pct"]

    def test_pass_flag_bajo_5pct(self):
        perfect = bland_altman([10.0, 20.0, 30.0], [10.0, 20.0, 30.0])
        assert perfect["mean_abs_error_pct"] == pytest.approx(0.0)
        summary = summary_accuracy({"test": perfect})
        assert summary[0]["pass"] is True

    def test_error_longitudes_distintas(self):
        with pytest.raises(ValueError):
            bland_altman([1.0, 2.0], [1.0])

    def test_error_muestra_unica(self):
        with pytest.raises(ValueError):
            bland_altman([1.0], [1.0])
