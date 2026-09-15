"""
ADR-015 A2 — Reproducibilidad (ICC)
=====================================
Protocolo de reproducibilidad inter-corrida para las métricas de MAO Plus.

Estrategia: mismo objeto (contorno fijo) medido N veces → varianza puramente de
implementación/numérica. Para objetos con perturbación leve → ICC entre "observadores".

Gate ADR-015 A2:
  - ICC ≥ 0.90 ("excelente") para métricas dimensionales puras en corridas idénticas
  - Varianza método << varianza objeto (en batería multi-objeto)
  - Script reproducible (seed fijo)
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from python.modules.validation_stats import icc, reproducibility_summary


# ────────────────────────────────────────────────────────────────────────────
# Generadores compartidos con test_validation_accuracy
# ────────────────────────────────────────────────────────────────────────────

def _circle_contour(cx, cy, r, n=200):
    angles = np.linspace(0, 2 * math.pi, n, endpoint=False)
    return [[cx + r * math.cos(a), cy + r * math.sin(a)] for a in angles]


def _ellipse_contour(cx, cy, a, b, n=200):
    angles = np.linspace(0, 2 * math.pi, n, endpoint=False)
    return [[cx + a * math.cos(ang), cy + b * math.sin(ang)] for ang in angles]


def _compute_metrics(contour, scale_px_mm=0.10):
    import asyncio
    import io
    from python.modules.metrics import calculate as metrics_calculate

    contour_list = [list(p) for p in contour] if hasattr(contour[0], '__iter__') else contour

    contour_np = np.array(contour_list, dtype=np.float32)
    bx = int(contour_np[:, 0].min())
    by = int(contour_np[:, 1].min())
    w = int(contour_np[:, 0].max()) + 10
    h = int(contour_np[:, 1].max()) + 10
    dummy_image = np.ones((max(h, 50), max(w, 50), 3), dtype=np.uint8) * 200

    import cv2
    ok, buf = cv2.imencode(".png", dummy_image)
    image_bytes = bytes(buf)

    loop = asyncio.new_event_loop()
    try:
        result = loop.run_until_complete(
            metrics_calculate(image_bytes, contour_list, scale_px_mm=scale_px_mm)
        )
    finally:
        loop.close()

    return result.get("metricas", result)


def _perturbed_contour(contour, noise_px=0.5, seed=0):
    """Contorno con ruido gaussiano leve (simula digitalización por observador distinto)."""
    rng = np.random.default_rng(seed)
    arr = np.array(contour, dtype=float)
    arr += rng.normal(0, noise_px, arr.shape)
    return arr.tolist()


# ────────────────────────────────────────────────────────────────────────────
# Batería de objetos para ICC
# ────────────────────────────────────────────────────────────────────────────

OBJECTS = [
    # (tipo, params)
    ("circle", {"r": 50}),
    ("circle", {"r": 80}),
    ("circle", {"r": 100}),
    ("ellipse", {"a": 100, "b": 60}),
    ("ellipse", {"a": 80, "b": 40}),
    ("ellipse", {"a": 90, "b": 70}),
]

N_RATERS = 5       # "observadores" / corridas (perturbaciones distintas)
NOISE_PX = 0.3     # ruido leve ≈ 0.3 px ≈ 0.03 mm con scale 0.10
SCALE = 0.10


def _measure_object_n_times(obj_spec: dict, n: int, noise_px: float) -> dict[str, list[float]]:
    """Retorna {metrica: [medicion_1, ..., medicion_n]}."""
    tipo = obj_spec.get("tipo", "circle")
    params = {k: v for k, v in obj_spec.items() if k != "tipo"}

    if tipo == "circle":
        base = _circle_contour(200, 200, params["r"], n=300)
    else:
        base = _ellipse_contour(200, 200, params["a"], params["b"], n=300)

    metrics_per_rater: list[dict] = []
    for seed in range(n):
        contour = _perturbed_contour(base, noise_px=noise_px, seed=seed)
        m = _compute_metrics(contour, scale_px_mm=SCALE)
        metrics_per_rater.append(m)

    # Transponer: {metrica: [val_rater1, val_rater2, ...]}
    keys = ["area", "perimeter", "circularity", "elongation", "solidity"]
    result = {}
    for key in keys:
        vals = []
        for m in metrics_per_rater:
            v = m.get(key)
            if v is not None:
                try:
                    vals.append(float(v))
                except (TypeError, ValueError):
                    pass
        if len(vals) == n:
            result[key] = vals
    return result


# ────────────────────────────────────────────────────────────────────────────
# Tests de reproducibilidad (ICC)
# ────────────────────────────────────────────────────────────────────────────

class TestICCFunctions:
    """Tests unitarios del módulo icc()."""

    def test_icc_mediciones_identicas_es_uno(self):
        """Si todos los observadores dan el mismo valor, ICC = 1."""
        data = [[5.0, 5.0, 5.0], [10.0, 10.0, 10.0], [7.0, 7.0, 7.0]]
        result = icc(data)
        assert result["icc"] == pytest.approx(1.0, abs=1e-6)

    def test_icc_sin_varianza_entre_sujetos(self):
        """Si todos los sujetos son iguales, ICC tiende a 0 o negativo."""
        # Todos sujetos con mismos valores → no hay varianza "entre sujetos"
        data = [[5.0, 5.0, 5.0], [5.0, 5.0, 5.0], [5.0, 5.0, 5.0]]
        result = icc(data)
        # ICC(2,1) = 0 cuando varianza entre sujetos = varianza error
        assert result["icc"] <= 0.1  # puede ser cercano a 0 o negativo

    def test_icc_rango_valido(self):
        """ICC siempre ∈ [-1, 1]."""
        rng = np.random.default_rng(0)
        data = rng.normal(0, 1, (8, 3)).tolist()
        result = icc(data)
        assert -1.0 <= result["icc"] <= 1.0

    def test_icc_interpretaciones(self):
        from python.modules.validation_stats import _icc_interpretation
        assert _icc_interpretation(0.95) == "excelente"
        assert _icc_interpretation(0.80) == "bueno"
        assert _icc_interpretation(0.60) == "moderado"
        assert _icc_interpretation(0.30) == "pobre"

    def test_icc_reproduce_la_tabla_2_de_shrout_y_fleiss(self):
        """
        Referencia publicada (Shrout & Fleiss 1979, Tabla 2: 6 sujetos × 4 jueces):
        ICC(2,1) = 0,29 · ICC(3,1) = 0,71. El módulo devolvía 0,71 bajo el nombre
        ICC(2,1): calculaba consistencia, no acuerdo absoluto.
        """
        sf = [[9, 2, 5, 8], [6, 1, 3, 2], [8, 4, 6, 8], [7, 1, 2, 6], [10, 5, 6, 9], [6, 2, 4, 7]]
        r = icc(sf)
        assert r["icc"] == pytest.approx(0.29, abs=0.005)
        assert r["icc_absoluto"] == pytest.approx(0.2898, abs=1e-3)
        assert r["icc_consistencia"] == pytest.approx(0.7148, abs=1e-3)
        assert icc(sf, model="consistencia")["icc"] == pytest.approx(0.71, abs=0.005)

    def test_icc_absoluto_penaliza_el_sesgo_entre_observadores(self):
        """
        Cuentas estandarizadas (CV ≈ 6 %) y un 2º observador que mide un 5 % más.
        La consistencia sigue alta porque ambos ordenan igual; el acuerdo absoluto
        tiene que caer. Es exactamente el fallo que A2 debe detectar.
        """
        rng = np.random.default_rng(7)
        verdad = rng.normal(100, 6, 15)
        obs1 = verdad + rng.normal(0, 1.0, 15)
        obs2 = verdad * 1.05 + rng.normal(0, 1.0, 15)
        r = icc([[a, b] for a, b in zip(obs1, obs2)])
        assert r["icc_consistencia"] > 0.9
        assert r["icc_absoluto"] < r["icc_consistencia"] - 0.15
        assert r["interpretation"] != "excelente"

    def test_ic_del_icc_absoluto_contiene_su_punto(self):
        """El IC de McGraw & Wong 2A. Con la fórmula de consistencia, un sesgo entre
        observadores dejaba el propio ICC(2,1) FUERA de su intervalo."""
        rng = np.random.default_rng(11)
        s_ = rng.normal(100, 6, 20)
        a = s_ + rng.normal(0, 1.5, 20)
        b = s_ + 4.0 + rng.normal(0, 1.5, 20)
        r = icc([[x, y] for x, y in zip(a, b)])
        assert r["ic"] is not None
        assert r["ic"][0] <= r["icc"] <= r["ic"][1], r

    def test_icc_error_una_repeticion(self):
        with pytest.raises(ValueError):
            icc([[5.0], [6.0], [7.0]])

    def test_reproducibility_summary_formato(self):
        data = {
            "area": [[10.0, 10.1, 9.9], [20.0, 20.1, 19.9], [15.0, 15.0, 15.1]],
            "perimeter": [[5.0, 5.1, 4.9], [8.0, 8.1, 7.9], [6.0, 6.1, 5.9]],
        }
        summary = reproducibility_summary(data)
        assert len(summary) == 2
        for row in summary:
            assert "metric" in row
            assert "icc" in row
            assert "interpretation" in row


class TestReproducibilidadArea:
    """A2: ICC del área en mediciones con perturbación leve."""

    def test_icc_area_excelente(self):
        """Área debe tener ICC ≥ 0.90 ('excelente') con ruido de ±0.3 px."""
        # Mediciones repetidas de múltiples objetos
        all_measurements = []  # [[r1_obj1, r2_obj1, ...], [r1_obj2, ...], ...]

        for spec in OBJECTS:
            tipo = spec[0]
            params = spec[1]
            obj_spec = {"tipo": tipo, **params}
            measurements = _measure_object_n_times(obj_spec, N_RATERS, NOISE_PX)
            if "area" in measurements:
                all_measurements.append(measurements["area"])

        assert len(all_measurements) >= 4, "Se necesitan ≥4 objetos para ICC"

        result = icc(all_measurements)
        assert result["icc"] >= 0.90, (
            f"ICC área = {result['icc']:.3f} < 0.90 (excelente)"
        )

    def test_icc_circularity_bueno_o_mejor(self):
        """Circularidad debe tener ICC ≥ 0.75 con ruido de ±0.3 px."""
        all_measurements = []
        for spec in OBJECTS:
            tipo = spec[0]
            params = spec[1]
            obj_spec = {"tipo": tipo, **params}
            measurements = _measure_object_n_times(obj_spec, N_RATERS, NOISE_PX)
            if "circularity" in measurements:
                all_measurements.append(measurements["circularity"])

        if not all_measurements:
            pytest.skip("circularity no disponible en métricas")

        result = icc(all_measurements)
        assert result["icc"] >= 0.75, (
            f"ICC circularidad = {result['icc']:.3f} < 0.75"
        )

    def test_varianza_metodo_vs_objeto(self):
        """La varianza entre objetos debe dominar sobre la varianza del método."""
        areas_per_object = []
        for spec in OBJECTS:
            tipo = spec[0]
            params = spec[1]
            obj_spec = {"tipo": tipo, **params}
            measurements = _measure_object_n_times(obj_spec, N_RATERS, NOISE_PX)
            if "area" in measurements:
                areas_per_object.append(measurements["area"])

        if not areas_per_object:
            pytest.skip("No hay datos de área")

        # Varianza dentro de cada objeto (varianza del método)
        within_vars = [np.var(obj_areas, ddof=1) for obj_areas in areas_per_object
                       if len(obj_areas) > 1]
        # Varianza de las medias por objeto (varianza entre objetos)
        obj_means = [np.mean(obj_areas) for obj_areas in areas_per_object]
        between_var = float(np.var(obj_means, ddof=1)) if len(obj_means) > 1 else 0

        mean_within = float(np.mean(within_vars)) if within_vars else 0

        assert between_var > mean_within, (
            f"Varianza entre objetos ({between_var:.2f}) < varianza método ({mean_within:.2f})"
        )
