"""
MAO Plus — Módulo: Análisis de estandarización (ADR-015 C3)
============================================================
Cuantifica la estandarización técnica de conjuntos de objetos arqueológicos
mediante CV + intervalos de confianza bootstrap.

Contexto:
  La estandarización es el índice de control técnico del artesano — colecciones
  de ornamentos de La Draga con alta estandarización → proceso tecnológico
  controlado. MAO Plus ya produce el vector de forma; este módulo añade
  el análisis estadístico necesario para el artículo PROTEC.

Funciones principales:
  standardize_collection(objects, metrics)  → CV + IC bootstrap por morfotipo
  contrast_groups(group_a, group_b, metric) → contraste de estandarización
  estandarizacion_report(...)               → reporte completo para paper

Referencia: CV como índice de estandarización en estudios de tecnología lítica:
  Shott 1994, Dibble 1995, Andrefsky 1998.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from python.modules.validation_stats import (
    bootstrap_ci,
    coefficient_of_variation,
    standardization_report,
)

IMPLEMENTED = True


# ────────────────────────────────────────────────────────────────────────────
# Normalización de objetos → vectores de métricas
# ────────────────────────────────────────────────────────────────────────────

def extract_metric_values(
    objects: list[dict],
    metric: str,
    group_field: str | None = None,
) -> dict[str, list[float]] | list[float]:
    """
    Extrae los valores de una métrica de una lista de objetos MAO.

    Parámetros
    ----------
    objects     : lista de dicts con métricas (formato de salida de /api/analyze)
    metric      : clave de la métrica a extraer (p. ej. "area_mm2", "circularity")
    group_field : si se especifica, agrupa por ese campo (p. ej. "morfotipo", "tipologia")

    Retorna
    -------
    Si group_field es None: lista de valores (float).
    Si group_field se especifica: {grupo: [val1, val2, ...]}
    """
    if group_field is None:
        values = []
        for obj in objects:
            m = obj.get("metricas", obj)
            v = m.get(metric)
            if v is not None:
                try:
                    values.append(float(v))
                except (TypeError, ValueError):
                    pass
        return values

    groups: dict[str, list[float]] = {}
    for obj in objects:
        m = obj.get("metricas", obj)
        v = m.get(metric)
        g = obj.get(group_field, "sin_grupo")
        if v is None:
            continue
        try:
            fv = float(v)
        except (TypeError, ValueError):
            continue
        groups.setdefault(str(g), []).append(fv)
    return groups


def standardize_collection(
    objects: list[dict],
    metrics: list[str],
    group_field: str = "morfotipo",
    n_boot: int = 2000,
    seed: int = 42,
) -> dict[str, Any]:
    """
    Análisis de estandarización para una colección de objetos.

    Para cada métrica y grupo morfotipo calcula:
      - CV (%) + IC bootstrap al 95%
      - Interpretación (alta/moderada/baja estandarización)

    Parámetros
    ----------
    objects    : lista de dicts de objetos con campos "metricas" + group_field
    metrics    : lista de métricas a analizar
    group_field: campo de agrupación (p. ej. "morfotipo", "tipologia")
    n_boot     : número de remuestras bootstrap
    seed       : semilla para reproducibilidad

    Retorna
    -------
    {
      "metric_name": {  # un bloque por cada métrica
        "groups": {"morfotipo_A": {...}, ...},
        "mean_cv_across_groups": float,
        "interpretation": str,
      },
      ...
    }
    """
    result = {}
    for metric in metrics:
        groups = extract_metric_values(objects, metric, group_field=group_field)
        if not isinstance(groups, dict):
            groups = {"total": groups}

        # Filtrar grupos con < 2 valores
        groups_valid = {k: v for k, v in groups.items() if len(v) >= 2}
        if not groups_valid:
            result[metric] = {"error": "datos insuficientes (< 2 por grupo)"}
            continue

        result[metric] = standardization_report(
            groups_valid,
            metric_name=metric,
            n_boot=n_boot,
            seed=seed,
        )
    return result


def contrast_groups(
    group_a: list[float],
    group_b: list[float],
    metric: str = "metric",
    n_boot: int = 2000,
    seed: int = 42,
) -> dict[str, Any]:
    """
    Contraste de estandarización entre dos grupos.

    Calcula el CV de cada grupo y compara sus IC bootstrap para determinar si
    los IC se solapan (no conclusivo) o están separados (diferencia significativa
    en términos de estandarización).

    Parámetros
    ----------
    group_a, group_b : valores de la métrica en los dos grupos
    metric           : nombre descriptivo de la métrica

    Retorna
    -------
    {
      "metric": str,
      "group_a": {cv, ic_lower, ic_upper},
      "group_b": {cv, ic_lower, ic_upper},
      "overlap": bool,          # True si los IC del CV se solapan
      "delta_cv": float,        # diferencia de CV (A − B)
      "interpretation": str,
    }
    """
    ci_a = bootstrap_ci(group_a, stat="cv_pct", n_boot=n_boot, seed=seed)
    ci_b = bootstrap_ci(group_b, stat="cv_pct", n_boot=n_boot, seed=seed + 1)

    cv_a = ci_a["estimate"]
    cv_b = ci_b["estimate"]

    # Solapamiento de IC
    overlap = not (ci_a["ci_upper"] < ci_b["ci_lower"] or
                   ci_b["ci_upper"] < ci_a["ci_lower"])

    delta = cv_a - cv_b
    if overlap:
        interp = "diferencia no conclusiva (IC solapados)"
    elif delta > 0:
        interp = f"grupo A menos estandarizado (CV +{delta:.1f}% respecto a B)"
    else:
        interp = f"grupo B menos estandarizado (CV +{-delta:.1f}% respecto a A)"

    return {
        "metric": metric,
        "group_a": {
            "cv_pct": round(cv_a, 3),
            "ci_lower": ci_a["ci_lower"],
            "ci_upper": ci_a["ci_upper"],
            "n": len(group_a),
        },
        "group_b": {
            "cv_pct": round(cv_b, 3),
            "ci_lower": ci_b["ci_lower"],
            "ci_upper": ci_b["ci_upper"],
            "n": len(group_b),
        },
        "overlap": overlap,
        "delta_cv": round(delta, 3),
        "interpretation": interp,
    }


def estandarizacion_report(
    collection_by_group: dict[str, list[dict]],
    metrics: list[str],
    n_boot: int = 2000,
    seed: int = 42,
) -> dict[str, Any]:
    """
    Reporte completo de estandarización — entrada directa para el paper PROTEC.

    Parámetros
    ----------
    collection_by_group : {"morfotipo_A": [obj1, obj2, ...], "morfotipo_B": [...]}
                          cada objeto tiene campo "metricas" con las claves requeridas
    metrics             : métricas a analizar
    n_boot, seed        : parámetros bootstrap

    Retorna
    -------
    {
      "summary": [{metric, group, n, cv_pct, ci_lower, ci_upper, interpretation}],
      "contrasts": [{metric, group_a, group_b, delta_cv, overlap, interpretation}],
    }
    """
    summary_rows = []
    contrast_rows = []

    for metric in metrics:
        # Recopilar valores por grupo
        groups_vals: dict[str, list[float]] = {}
        for group_name, objs in collection_by_group.items():
            vals = extract_metric_values(objs, metric)
            if len(vals) >= 2:
                groups_vals[group_name] = vals

        if not groups_vals:
            continue

        # CV + IC por grupo
        for group_name, vals in groups_vals.items():
            cv_r = coefficient_of_variation(vals)
            ci = bootstrap_ci(vals, stat="cv_pct", n_boot=n_boot, seed=seed)
            summary_rows.append({
                "metric": metric,
                "group": group_name,
                "n": cv_r["n"],
                "mean": cv_r["mean"],
                "std": cv_r["std"],
                "cv_pct": cv_r["cv_pct"],
                "ci_lower": ci["ci_lower"],
                "ci_upper": ci["ci_upper"],
                "interpretation": _cv_interpretation(cv_r["cv_pct"]),
            })

        # Contrastes por pares
        group_names = list(groups_vals.keys())
        for i in range(len(group_names)):
            for j in range(i + 1, len(group_names)):
                na, nb = group_names[i], group_names[j]
                contrast = contrast_groups(
                    groups_vals[na], groups_vals[nb],
                    metric=metric, n_boot=n_boot, seed=seed,
                )
                contrast_rows.append({
                    "metric": metric,
                    "group_a": na,
                    "group_b": nb,
                    **{k: v for k, v in contrast.items() if k not in ("metric", "group_a", "group_b")},
                })

    return {"summary": summary_rows, "contrasts": contrast_rows}


def _cv_interpretation(cv_pct: float) -> str:
    if cv_pct < 10:
        return "alta estandarización"
    if cv_pct < 20:
        return "estandarización moderada"
    return "baja estandarización"
