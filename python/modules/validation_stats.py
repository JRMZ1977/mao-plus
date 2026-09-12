"""
MAO Plus — Módulo: Estadísticas de validación metrológica
==========================================================
ADR-015 F1 (A1 + A2 + C3)

Implementa los análisis estadísticos necesarios para:

A1 — Validación de exactitud (trueness)
    bland_altman(measured, reference)  → sesgo, LoA, % error por métrica
    summary_accuracy(results)          → tabla resumen para VALIDACION-EXACTITUD.md

A2 — Reproducibilidad (ICC)
    icc(measurements)                  → ICC(2,1) modelo two-way mixed
    reproducibility_summary(repeated)  → descomposición de varianza

C3 — Estandarización (CV + bootstrap)
    coefficient_of_variation(values)   → CV (%)
    bootstrap_ci(values, stat, n_boot) → IC bootstrap por percentil
    standardization_report(groups)     → CV + IC por grupo morfotipo

Todas las funciones son puras (sin I/O, sin side effects). No requieren
sklearn ni scipy: solo numpy, para mantener la dependencia mínima.
Referencias:
  Bland & Altman 1986 (LoA); Shrout & Fleiss 1979 / McGraw & Wong 1996 (ICC);
  Efron & Tibshirani 1993 (bootstrap percentil).
"""

from __future__ import annotations

import math
import random
from typing import Any

import numpy as np


# ────────────────────────────────────────────────────────────────────────────
# A1 — Bland-Altman y exactitud
# ────────────────────────────────────────────────────────────────────────────

def bland_altman(
    measured: list[float],
    reference: list[float],
    confidence: float = 0.95,
) -> dict[str, Any]:
    """
    Análisis de Bland-Altman entre valores medidos y referencia.

    Parámetros
    ----------
    measured  : valores producidos por MAO
    reference : valores de referencia (verdad conocida)
    confidence: nivel de confianza para los LoA (defecto 95%)

    Retorna
    -------
    {
      "n": int,
      "bias": float,           # media de las diferencias (medido − referencia)
      "bias_pct": float,       # sesgo relativo (%)
      "sd_diff": float,        # desviación estándar de las diferencias
      "loa_lower": float,      # límite de acuerdo inferior
      "loa_upper": float,      # límite de acuerdo superior
      "mean_abs_error": float, # MAE absoluto
      "mean_abs_error_pct": float,  # MAE relativo (%)
      "max_abs_error": float,  # error máximo absoluto
      "max_abs_error_pct": float,   # error máximo relativo (%)
      "within_loa": int,       # número de pares dentro de los LoA
      "within_loa_pct": float, # porcentaje dentro de los LoA
    }
    """
    if len(measured) != len(reference):
        raise ValueError("measured y reference deben tener la misma longitud")
    if len(measured) < 2:
        raise ValueError("Se necesitan al menos 2 pares para Bland-Altman")

    m = np.asarray(measured, dtype=float)
    r = np.asarray(reference, dtype=float)

    diffs = m - r
    means = (m + r) / 2.0

    bias = float(np.mean(diffs))
    sd = float(np.std(diffs, ddof=1))

    # Factor z para el nivel de confianza (≈1.96 para 95%)
    z = _z_score(confidence)
    loa_lower = bias - z * sd
    loa_upper = bias + z * sd

    # Error relativo respecto al valor de referencia
    ref_mean = float(np.mean(np.abs(r)))
    bias_pct = (bias / ref_mean * 100) if ref_mean > 0 else float("nan")

    abs_errors = np.abs(diffs)
    mae = float(np.mean(abs_errors))
    mae_pct = (mae / ref_mean * 100) if ref_mean > 0 else float("nan")
    max_err = float(np.max(abs_errors))
    max_err_pct = (max_err / ref_mean * 100) if ref_mean > 0 else float("nan")

    within = int(np.sum((diffs >= loa_lower) & (diffs <= loa_upper)))

    return {
        "n": len(measured),
        "bias": round(bias, 6),
        "bias_pct": round(bias_pct, 3),
        "sd_diff": round(sd, 6),
        "loa_lower": round(loa_lower, 6),
        "loa_upper": round(loa_upper, 6),
        "mean_abs_error": round(mae, 6),
        "mean_abs_error_pct": round(mae_pct, 3),
        "max_abs_error": round(max_err, 6),
        "max_abs_error_pct": round(max_err_pct, 3),
        "within_loa": within,
        "within_loa_pct": round(within / len(measured) * 100, 1),
    }


def summary_accuracy(results: dict[str, dict]) -> list[dict]:
    """
    Tabla resumen de exactitud por métrica.

    Parámetros
    ----------
    results : {nombre_métrica: resultado bland_altman(...)}

    Retorna
    -------
    Lista de filas ordenadas por MAE% descendente:
    [{metric, n, bias_pct, mae_pct, max_pct, loa_lower, loa_upper, pass}, ...]
    donde `pass` = True si mae_pct < 5% (umbral de referencia metrológico).
    """
    rows = []
    for metric, ba in results.items():
        rows.append({
            "metric": metric,
            "n": ba["n"],
            "bias_pct": ba["bias_pct"],
            "mae_pct": ba["mean_abs_error_pct"],
            "max_pct": ba["max_abs_error_pct"],
            "loa_lower": ba["loa_lower"],
            "loa_upper": ba["loa_upper"],
            "pass": ba["mean_abs_error_pct"] < 5.0,
        })
    return sorted(rows, key=lambda x: x["mae_pct"], reverse=True)


# ────────────────────────────────────────────────────────────────────────────
# A2 — ICC (Coeficiente de Correlación Intraclase)
# ────────────────────────────────────────────────────────────────────────────

def icc(
    measurements: list[list[float]],
    model: str = "twoway_mixed_absolute",
) -> dict[str, Any]:
    """
    Coeficiente de Correlación Intraclase (ICC).

    Parámetros
    ----------
    measurements : lista de listas; cada sublista = mediciones de UN sujeto/objeto
                   (puede haber distinto número de repeticiones por sujeto)
    model        : "twoway_mixed_absolute" (ICC(2,1) absoluta, Shrout & Fleiss tipo 2)
                   Es el modelo estándar para reproducibilidad de un método específico.

    Retorna
    -------
    {
      "icc": float,        # valor ICC ∈ [-1, 1]
      "interpretation": str, # "excelente" / "bueno" / "moderado" / "pobre"
      "n_subjects": int,
      "n_raters": int,     # media de repeticiones por sujeto
      "ms_between": float, # cuadrado medio entre sujetos
      "ms_within": float,  # cuadrado medio dentro del sujeto
      "ms_error": float,   # cuadrado medio de error (two-way)
    }
    """
    # Requiere mismo número de repeticiones (k) por sujeto para two-way ANOVA
    # Si es variable, usar el mínimo
    k = min(len(row) for row in measurements)
    if k < 2:
        raise ValueError("Se necesitan ≥2 repeticiones por sujeto para ICC")

    data = np.array([row[:k] for row in measurements], dtype=float)
    n, k = data.shape  # n sujetos, k repeticiones

    grand_mean = data.mean()
    row_means = data.mean(axis=1)   # media por sujeto
    col_means = data.mean(axis=0)   # media por sesión/rater

    # Suma de cuadrados (ANOVA two-way sin interacción)
    ss_between = k * np.sum((row_means - grand_mean) ** 2)
    ss_col = n * np.sum((col_means - grand_mean) ** 2)
    ss_total = np.sum((data - grand_mean) ** 2)
    ss_error = ss_total - ss_between - ss_col

    df_between = n - 1
    df_col = k - 1
    df_error = (n - 1) * (k - 1)

    ms_between = ss_between / df_between if df_between > 0 else 0.0
    ms_error = ss_error / df_error if df_error > 0 else 0.0

    # ICC(2,1) absoluta: solo varianza del sujeto en numerador
    denom = ms_between + (k - 1) * ms_error
    icc_val = (ms_between - ms_error) / denom if denom > 0 else 0.0
    icc_val = max(-1.0, min(1.0, icc_val))

    return {
        "icc": round(icc_val, 4),
        "interpretation": _icc_interpretation(icc_val),
        "n_subjects": n,
        "n_raters": k,
        "ms_between": round(float(ms_between), 6),
        "ms_within": round(float(ss_error / max(1, n * (k - 1))), 6),
        "ms_error": round(float(ms_error), 6),
    }


def reproducibility_summary(
    repeated_results: dict[str, list[list[float]]],
) -> list[dict]:
    """
    ICC por métrica a partir de mediciones repetidas.

    Parámetros
    ----------
    repeated_results : {nombre_métrica: [[rep1_obj1, rep2_obj1,...], [rep1_obj2,...], ...]}

    Retorna
    -------
    [{metric, icc, interpretation, n_subjects, n_raters}, ...] ordenado por icc
    """
    rows = []
    for metric, data in repeated_results.items():
        try:
            result = icc(data)
            rows.append({
                "metric": metric,
                "icc": result["icc"],
                "interpretation": result["interpretation"],
                "n_subjects": result["n_subjects"],
                "n_raters": result["n_raters"],
            })
        except (ValueError, ZeroDivisionError) as exc:
            rows.append({"metric": metric, "icc": None, "error": str(exc)})
    return sorted(rows, key=lambda x: x.get("icc") or -999)


# ────────────────────────────────────────────────────────────────────────────
# C3 — CV + bootstrap (estandarización)
# ────────────────────────────────────────────────────────────────────────────

def coefficient_of_variation(values: list[float]) -> dict[str, float]:
    """
    Coeficiente de variación (CV%) para un conjunto de valores.

    CV = (desv. estándar / media) × 100

    Retorna
    -------
    {"mean": ..., "std": ..., "cv_pct": ..., "n": ...}
    """
    arr = np.asarray(values, dtype=float)
    n = len(arr)
    if n < 2:
        raise ValueError("Se necesitan ≥2 valores para el CV")
    mean = float(arr.mean())
    std = float(arr.std(ddof=1))
    cv = (std / mean * 100) if mean != 0 else float("nan")
    return {"n": n, "mean": round(mean, 6), "std": round(std, 6), "cv_pct": round(cv, 3)}


def bootstrap_ci(
    values: list[float],
    stat: str = "mean",
    n_boot: int = 2000,
    confidence: float = 0.95,
    seed: int = 42,
) -> dict[str, Any]:
    """
    Intervalo de confianza bootstrap por percentil.

    Parámetros
    ----------
    values     : muestra de datos
    stat       : estadístico a estimar ("mean", "std", "cv_pct", "median")
    n_boot     : número de remuestras (≥1000 recomendado)
    confidence : nivel de confianza (defecto 0.95)
    seed       : semilla para reproducibilidad

    Retorna
    -------
    {"estimate": float, "ci_lower": float, "ci_upper": float,
     "ci_width": float, "n": int, "n_boot": int, "confidence": float}
    """
    arr = np.asarray(values, dtype=float)
    n = len(arr)
    if n < 2:
        raise ValueError("Se necesitan ≥2 valores para bootstrap")

    rng = np.random.default_rng(seed)
    boot_stats = []
    for _ in range(n_boot):
        sample = rng.choice(arr, size=n, replace=True)
        boot_stats.append(_stat_fn(sample, stat))

    boot_stats = np.array(boot_stats)
    alpha = 1 - confidence
    lo = float(np.percentile(boot_stats, alpha / 2 * 100))
    hi = float(np.percentile(boot_stats, (1 - alpha / 2) * 100))
    est = _stat_fn(arr, stat)

    return {
        "estimate": round(est, 4),
        "ci_lower": round(lo, 4),
        "ci_upper": round(hi, 4),
        "ci_width": round(hi - lo, 4),
        "n": n,
        "n_boot": n_boot,
        "confidence": confidence,
        "stat": stat,
    }


def standardization_report(
    groups: dict[str, list[float]],
    metric_name: str = "metric",
    n_boot: int = 2000,
    seed: int = 42,
) -> dict[str, Any]:
    """
    Reporte de estandarización: CV + IC bootstrap por grupo morfotipo.

    Parámetros
    ----------
    groups      : {"morfotipo_A": [val1, val2, ...], "morfotipo_B": [...], ...}
    metric_name : nombre de la métrica analizada
    n_boot      : remuestras bootstrap
    seed        : semilla de reproducibilidad

    Retorna
    -------
    {
      "metric": str,
      "groups": {
        "nombre": {
          "n": int,
          "mean": float, "std": float, "cv_pct": float,
          "ci_mean_lower": float, "ci_mean_upper": float,
          "ci_cv_lower": float, "ci_cv_upper": float,
        }
      },
      "interpretation": str,  # "alta"/"moderada"/"baja" estandarización
    }
    """
    results = {}
    for name, vals in groups.items():
        cv_res = coefficient_of_variation(vals)
        ci_mean = bootstrap_ci(vals, stat="mean", n_boot=n_boot, seed=seed)
        ci_cv = bootstrap_ci(vals, stat="cv_pct", n_boot=n_boot, seed=seed)
        results[name] = {
            "n": cv_res["n"],
            "mean": cv_res["mean"],
            "std": cv_res["std"],
            "cv_pct": cv_res["cv_pct"],
            "ci_mean_lower": ci_mean["ci_lower"],
            "ci_mean_upper": ci_mean["ci_upper"],
            "ci_cv_lower": ci_cv["ci_lower"],
            "ci_cv_upper": ci_cv["ci_upper"],
        }

    # Interpretación global (CV promedio entre grupos)
    mean_cv = float(np.mean([v["cv_pct"] for v in results.values()]))
    if mean_cv < 10:
        interp = "alta estandarización (CV < 10%)"
    elif mean_cv < 20:
        interp = "estandarización moderada (CV 10–20%)"
    else:
        interp = "baja estandarización (CV > 20%)"

    return {
        "metric": metric_name,
        "groups": results,
        "mean_cv_across_groups": round(mean_cv, 3),
        "interpretation": interp,
    }


# ────────────────────────────────────────────────────────────────────────────
# Utilidades internas
# ────────────────────────────────────────────────────────────────────────────

def _z_score(confidence: float) -> float:
    """Aproximación de z para nivel de confianza (Beasley-Springer-Moro)."""
    # Tabla de valores comunes
    table = {0.90: 1.645, 0.95: 1.960, 0.99: 2.576}
    if confidence in table:
        return table[confidence]
    # Aproximación numérica simple
    p = (1 + confidence) / 2
    # Abramowitz & Stegun 26.2.17 inversa aproximada
    t = math.sqrt(-2 * math.log(1 - p))
    c = (2.515517 + 0.802853 * t + 0.010328 * t**2)
    d = (1 + 1.432788 * t + 0.189269 * t**2 + 0.001308 * t**3)
    return t - c / d


def _icc_interpretation(val: float) -> str:
    if val < 0.5:
        return "pobre"
    if val < 0.75:
        return "moderado"
    if val < 0.9:
        return "bueno"
    return "excelente"


def _stat_fn(arr: np.ndarray, stat: str) -> float:
    if stat == "mean":
        return float(arr.mean())
    if stat == "std":
        return float(arr.std(ddof=1)) if len(arr) > 1 else 0.0
    if stat == "cv_pct":
        m = arr.mean()
        return float(arr.std(ddof=1) / m * 100) if m != 0 else float("nan")
    if stat == "median":
        return float(np.median(arr))
    raise ValueError(f"Estadístico desconocido: {stat}")
