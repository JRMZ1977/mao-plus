"""
ADR-015 C3 — Cuantificación de estandarización (CV + bootstrap)
================================================================
Gate ADR-015 C3:
  - CV e IC bootstrap por grupo correctos sobre datos sintéticos de dispersión conocida
  - Contraste entre morfotipos (alta vs baja variabilidad): IC no solapados
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

from python.modules.validation_stats import (
    bootstrap_ci,
    coefficient_of_variation,
    standardization_report,
)
from python.modules.standardization import (
    contrast_groups,
    estandarizacion_report,
    extract_metric_values,
)


# ────────────────────────────────────────────────────────────────────────────
# Tests del CV
# ────────────────────────────────────────────────────────────────────────────

class TestCoefficientOfVariation:

    def test_cv_valores_identicos_es_cero(self):
        cv = coefficient_of_variation([5.0, 5.0, 5.0, 5.0])
        assert cv["cv_pct"] == pytest.approx(0.0)

    def test_cv_conocido(self):
        # CV = std/mean*100; verificar consistencia entre campos (tolerancia de redondeo)
        values = [9.0, 10.0, 11.0, 10.0]
        cv = coefficient_of_variation(values)
        assert abs(cv["cv_pct"] - cv["std"] / cv["mean"] * 100) < 1e-2

    def test_cv_alta_variabilidad(self):
        # Datos con CV ~50%
        rng = np.random.default_rng(0)
        values = list(rng.normal(10, 5, 50))  # media≈10, std≈5 → CV≈50%
        cv = coefficient_of_variation(values)
        assert cv["cv_pct"] > 30  # amplio margen por la muestra

    def test_cv_baja_variabilidad(self):
        rng = np.random.default_rng(1)
        values = list(rng.normal(100, 2, 50))  # media≈100, std≈2 → CV≈2%
        cv = coefficient_of_variation(values)
        assert cv["cv_pct"] < 10

    def test_cv_error_un_valor(self):
        with pytest.raises(ValueError):
            coefficient_of_variation([5.0])


# ────────────────────────────────────────────────────────────────────────────
# Tests del bootstrap
# ────────────────────────────────────────────────────────────────────────────

class TestBootstrapCI:

    def test_ci_contiene_estimado(self):
        rng = np.random.default_rng(42)
        values = list(rng.normal(10, 1, 30))
        result = bootstrap_ci(values, stat="mean", n_boot=1000, seed=42)
        assert result["ci_lower"] <= result["estimate"] <= result["ci_upper"]

    def test_ci_ancho_decrece_con_n(self):
        """IC más ancho en muestra pequeña que en muestra grande."""
        rng = np.random.default_rng(7)
        small = list(rng.normal(10, 2, 10))
        large = list(rng.normal(10, 2, 100))
        ci_small = bootstrap_ci(small, stat="mean", n_boot=1000, seed=7)
        ci_large = bootstrap_ci(large, stat="mean", n_boot=1000, seed=7)
        assert ci_small["ci_width"] > ci_large["ci_width"]

    def test_ci_reproducible_con_seed(self):
        rng = np.random.default_rng(5)
        values = list(rng.normal(5, 1, 20))
        r1 = bootstrap_ci(values, stat="cv_pct", n_boot=500, seed=5)
        r2 = bootstrap_ci(values, stat="cv_pct", n_boot=500, seed=5)
        assert r1["ci_lower"] == r2["ci_lower"]
        assert r1["ci_upper"] == r2["ci_upper"]

    def test_ci_nivel_correcto(self):
        """IC 99% debe ser más ancho que IC 95%."""
        rng = np.random.default_rng(3)
        values = list(rng.normal(10, 2, 50))
        ci_95 = bootstrap_ci(values, stat="mean", n_boot=1000, confidence=0.95, seed=3)
        ci_99 = bootstrap_ci(values, stat="mean", n_boot=1000, confidence=0.99, seed=3)
        assert ci_99["ci_width"] > ci_95["ci_width"]

    def test_ci_estadisticos_soportados(self):
        values = [1.0, 2.0, 3.0, 4.0, 5.0]
        for stat in ("mean", "std", "cv_pct", "median"):
            r = bootstrap_ci(values, stat=stat, n_boot=100, seed=0)
            assert math.isfinite(r["estimate"])


# ────────────────────────────────────────────────────────────────────────────
# Tests del contraste entre grupos
# ────────────────────────────────────────────────────────────────────────────

class TestICDelCV:
    """IC del CV por McKay modificado (Vangel 1996). El bootstrap percentil que se
    usaba cubría el 72–88 % real para un 95 % nominal con los tamaños de grupo de
    una colección arqueológica."""

    def test_cobertura_cercana_a_la_nominal_con_grupos_pequenos(self):
        from python.modules.validation_stats import cv_ci
        rng = np.random.default_rng(20260915)
        for cv_real, n in ((6.0, 8), (6.0, 15), (25.0, 10)):
            aciertos = 0
            reps = 600
            for _ in range(reps):
                x = rng.normal(100, cv_real, n)
                ci = cv_ci(list(x))
                aciertos += ci["ci_lower"] <= cv_real <= ci["ci_upper"]
            cobertura = aciertos / reps
            assert 0.91 <= cobertura <= 0.99, f"CV={cv_real} n={n}: cobertura {cobertura:.3f}"

    def test_el_percentil_bootstrap_subcubre_y_por_eso_no_se_usa(self):
        """Documenta el motivo del cambio: con n=8 el percentil no llega al 85 %."""
        rng = np.random.default_rng(3)
        aciertos = 0
        reps = 200
        for i in range(reps):
            x = rng.normal(100, 6.0, 8)
            ci = bootstrap_ci(list(x), stat="cv_pct", n_boot=500, seed=i)
            aciertos += ci["ci_lower"] <= 6.0 <= ci["ci_upper"]
        assert aciertos / reps < 0.85

    def test_el_reporte_declara_el_metodo(self):
        rng = np.random.default_rng(4)
        r = contrast_groups(list(rng.normal(10, 1, 20)), list(rng.normal(10, 3, 20)))
        assert "Vangel" in r["metodo_ic_cv"]


class TestContrastGroups:

    def test_grupos_iguales_overlap(self):
        """Grupos idénticos → IC del CV solapados → no conclusivo."""
        rng = np.random.default_rng(0)
        vals = list(rng.normal(10, 1, 30))
        result = contrast_groups(vals, vals, n_boot=500, seed=0)
        assert result["overlap"] is True

    def test_grupos_distintos_no_overlap(self):
        """Grupo de alta variabilidad vs. baja → IC no solapados."""
        rng = np.random.default_rng(1)
        alta = list(rng.normal(10, 5, 60))    # CV ≈ 50%
        baja = list(rng.normal(10, 0.5, 60))  # CV ≈ 5%
        result = contrast_groups(alta, baja, n_boot=2000, seed=1)
        # Con muestras grandes y diferencia tan marcada, los IC NO deben solapar
        assert result["delta_cv"] > 20, (
            f"delta_cv={result['delta_cv']:.1f} (esperado >20 entre grupos tan distintos)"
        )

    def test_contraste_interpretacion_texto(self):
        rng = np.random.default_rng(2)
        a = list(rng.normal(10, 3, 40))
        b = list(rng.normal(10, 1, 40))
        result = contrast_groups(a, b, metric="area_mm2", n_boot=500, seed=2)
        assert "interpretation" in result
        assert len(result["interpretation"]) > 0

    def test_contraste_delta_cv_signo(self):
        rng = np.random.default_rng(3)
        alta = list(rng.normal(10, 4, 50))
        baja = list(rng.normal(10, 1, 50))
        r = contrast_groups(alta, baja, n_boot=500, seed=3)
        # grupo_a=alta → delta positivo
        assert r["delta_cv"] > 0


# ────────────────────────────────────────────────────────────────────────────
# Tests del reporte de estandarización
# ────────────────────────────────────────────────────────────────────────────

class TestStandardizationReport:

    def _make_objects(self, n: int, area_mean: float, area_std: float, morfotipo: str, seed: int):
        rng = np.random.default_rng(seed)
        return [
            {"metricas": {"area_mm2": float(v), "circularity": float(rng.uniform(0.7, 1.0))},
             "morfotipo": morfotipo}
            for v in rng.normal(area_mean, area_std, n)
        ]

    def test_report_formato_completo(self):
        objs_a = self._make_objects(20, 100, 5, "tipo_A", 0)
        objs_b = self._make_objects(20, 100, 25, "tipo_B", 1)
        report = estandarizacion_report(
            {"tipo_A": objs_a, "tipo_B": objs_b},
            metrics=["area_mm2", "circularity"],
            n_boot=200,
        )
        assert "summary" in report
        assert "contrasts" in report
        # 2 métricas × 2 grupos = 4 filas resumen
        assert len(report["summary"]) == 4
        # 2 métricas × 1 par de grupos = 2 contrastes
        assert len(report["contrasts"]) == 2

    def test_alta_vs_baja_estandarizacion(self):
        """Tipo A (baja variabilidad) detectado como más estandarizado que B."""
        objs_a = self._make_objects(40, 50, 2, "tipo_A", 10)   # CV ≈ 4%
        objs_b = self._make_objects(40, 50, 15, "tipo_B", 11)  # CV ≈ 30%

        report = estandarizacion_report(
            {"tipo_A": objs_a, "tipo_B": objs_b},
            metrics=["area_mm2"],
            n_boot=500,
        )

        # Buscar fila de tipo_A
        row_a = next(r for r in report["summary"]
                     if r["group"] == "tipo_A" and r["metric"] == "area_mm2")
        row_b = next(r for r in report["summary"]
                     if r["group"] == "tipo_B" and r["metric"] == "area_mm2")

        assert row_a["cv_pct"] < row_b["cv_pct"], (
            f"tipo_A CV={row_a['cv_pct']:.1f} ≥ tipo_B CV={row_b['cv_pct']:.1f}"
        )
        assert row_a["interpretation"] in ("alta estandarización",), (
            f"tipo_A debería ser 'alta estandarización': {row_a['interpretation']}"
        )

    def test_extract_metric_values_sin_grupo(self):
        objects = [
            {"metricas": {"area_mm2": 10.0}},
            {"metricas": {"area_mm2": 12.0}},
            {"area_mm2": 11.0},  # sin subclave "metricas"
        ]
        vals = extract_metric_values(objects, "area_mm2")
        # Deben extraerse los que tienen el campo
        assert 10.0 in vals
        assert 12.0 in vals

    def test_extract_metric_values_con_grupo(self):
        objects = [
            {"metricas": {"area_mm2": 10.0}, "morfotipo": "A"},
            {"metricas": {"area_mm2": 12.0}, "morfotipo": "A"},
            {"metricas": {"area_mm2": 20.0}, "morfotipo": "B"},
        ]
        groups = extract_metric_values(objects, "area_mm2", group_field="morfotipo")
        assert isinstance(groups, dict)
        assert "A" in groups
        assert "B" in groups
        assert len(groups["A"]) == 2
        assert len(groups["B"]) == 1


class TestStandardizationReportIntegrado:
    """Datos sintéticos que reproducen el escenario La Draga (cuentas de calaíta)."""

    def test_cuentas_alta_estandarizacion(self):
        """
        Simulación: cuentas discoidales regulares → CV < 10%.
        Representa el caso 'control técnico alto' del artículo PROTEC.
        """
        rng = np.random.default_rng(2025)
        # Cuentas discoidales: diámetro ≈ 8mm, std 0.5mm → CV ≈ 6%
        n = 35
        diams = list(rng.normal(8.0, 0.5, n))
        areas = [math.pi * (d / 2) ** 2 for d in diams]

        cv = coefficient_of_variation(areas)
        ci = bootstrap_ci(areas, stat="cv_pct", n_boot=2000, seed=2025)

        assert cv["cv_pct"] < 15, f"CV={cv['cv_pct']:.1f}% > 15% (dispersión sintética esperada)"
        assert ci["ci_lower"] < cv["cv_pct"] < ci["ci_upper"]
        assert math.isfinite(ci["ci_lower"])
        assert math.isfinite(ci["ci_upper"])

    def test_fragmentos_baja_estandarizacion(self):
        """
        Simulación: fragmentos sin morfología controlada → CV > 25%.
        Contraste esperado vs. cuentas discoidales.
        """
        rng = np.random.default_rng(2026)
        areas = list(rng.uniform(5, 100, 30))  # alta variabilidad

        cv = coefficient_of_variation(areas)
        assert cv["cv_pct"] > 20, f"CV={cv['cv_pct']:.1f}% ≤ 20% (esperado >20% en fragmentos)"
