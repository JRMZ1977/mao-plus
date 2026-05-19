"""
MAO Plus — Módulo: Clasificación tipológica (reglas + evidencia EFA)
=====================================================================

Estado: IMPLEMENTADO (IMPLEMENTED = True)

Objetivo:
  - Clasificar tipología arqueológica usando métricas morfométricas existentes.
  - Mejorar la identificación de forma cuando hay contorno disponible mediante EFA.

Entrada esperada:
  - Dict de métricas (salida de /api/metrics o equivalente JS).
  - Opcional: _contour_points_for_efa = [[x,y], ...] para recalcular EFA en backend.
  - Opcional: _efa_data ya calculado en frontend.

Salida principal:
  {
    "tipo": str,
    "subtipo": str,
    "confianza": float [0,1],
    "descripcion": str,
    "color": str,
    "icono": str,
    "evidencias": {...}
  }
"""

from __future__ import annotations

from typing import Any

from python.modules import efa

IMPLEMENTED = True


def _to_float(v: Any, default: float = 0.0) -> float:
    try:
        out = float(v)
        if out != out:  # NaN
            return default
        return out
    except Exception:
        return default


def _clip01(v: float) -> float:
    return max(0.0, min(1.0, float(v)))


def _round(v: float, d: int = 4) -> float:
    return round(float(v), d)


def _safe_points(raw: Any, max_points: int = 256) -> list[list[float]]:
    """Normaliza y submuestrea puntos de contorno para EFA."""
    if not isinstance(raw, list):
        return []

    pts: list[list[float]] = []
    for p in raw:
        if isinstance(p, (list, tuple)) and len(p) >= 2:
            x = _to_float(p[0], default=float("nan"))
            y = _to_float(p[1], default=float("nan"))
            if x == x and y == y:
                pts.append([x, y])
        elif isinstance(p, dict) and "x" in p and "y" in p:
            x = _to_float(p.get("x"), default=float("nan"))
            y = _to_float(p.get("y"), default=float("nan"))
            if x == x and y == y:
                pts.append([x, y])

    n = len(pts)
    if n <= max_points:
        return pts

    step = n / max_points
    out: list[list[float]] = []
    i = 0.0
    while int(i) < n and len(out) < max_points:
        out.append(pts[int(i)])
        i += step
    return out


def _extract_contour_points(metrics: dict[str, Any]) -> list[list[float]]:
    """Obtiene puntos de contorno desde varios formatos que usa MAO Plus."""
    direct = _safe_points(metrics.get("_contour_points_for_efa"))
    if len(direct) >= 8:
        return direct

    direct2 = _safe_points(metrics.get("contour_points"))
    if len(direct2) >= 8:
        return direct2

    cdata = metrics.get("_contour_data")
    if isinstance(cdata, dict):
        pts = _safe_points(cdata.get("points"))
        if len(pts) >= 8:
            return pts
        pts2 = _safe_points(cdata.get("points_visual"))
        if len(pts2) >= 8:
            return pts2

    return []


def _shape_baseline(metrics: dict[str, Any]) -> tuple[str, str, float, dict[str, Any]]:
    """
    Baseline morfométrico usando campos existentes en metrics.py.
    Retorna: tipo, subtipo, score_base, evidencia.
    """
    forma = str(metrics.get("forma_detectada") or "Irregular")
    f_conf = _clip01(_to_float(metrics.get("forma_confianza"), 0.35))

    circularity = _to_float(metrics.get("circularity"), 0.0)
    solidity = _to_float(metrics.get("solidity"), 0.0)
    feret_ratio = _to_float(metrics.get("feret_ratio"), 1.0)
    rug = _to_float(metrics.get("rugosidad_contorno"), 0.0)

    # Reglas pragmáticas y conservadoras para tipo/subtipo.
    if forma in {"Lanceolada", "Triangular", "Amigdaloide"}:
        tipo = "Punta de proyectil"
        subtipo = forma
    elif forma in {"Laminar", "Lunar"}:
        tipo = "Lamina litica"
        subtipo = "Regular" if forma == "Laminar" else "Retocada"
    elif forma in {"Circular", "Subcircular", "Anular/Perforado"}:
        tipo = "Raspador"
        subtipo = "Discoide" if circularity >= 0.78 else "Semicircular"
    elif forma in {"Rectangular", "Trapezoidal", "Cuadrangular", "Romboidal", "Pentagonal", "Hexagonal", "Poligonal"}:
        tipo = "Nucleo"
        subtipo = "Discoide" if circularity >= 0.7 else "Informal"
    elif forma in {"Elipsoidal", "Lobulado", "Estrellado", "Irregular redondeado", "Irregular"}:
        tipo = "Lasca"
        subtipo = "Tabular" if feret_ratio >= 1.8 else "Irregular"
    else:
        tipo = "Indeterminado"
        subtipo = forma

    # Score base usa confianza de forma + estabilidad geométrica general.
    geometric_stability = _clip01((solidity * 0.45) + (circularity * 0.35) + (_clip01(1.0 - rug) * 0.20))
    score_base = _clip01((f_conf * 0.70) + (geometric_stability * 0.30))

    ev = {
        "forma_detectada": forma,
        "forma_confianza": _round(f_conf, 4),
        "circularity": _round(circularity, 4),
        "solidity": _round(solidity, 4),
        "feret_ratio": _round(feret_ratio, 4),
        "rugosidad_contorno": _round(rug, 4),
        "score_base": _round(score_base, 4),
    }
    return tipo, subtipo, score_base, ev


def _infer_efa_signature(efa_data: dict[str, Any]) -> dict[str, Any]:
    """Deriva rasgos de firma EFA para reforzar la identificación."""
    ps = efa_data.get("power_spectrum") or []
    if not isinstance(ps, list) or len(ps) < 3:
        return {
            "available": False,
            "shape_hint": "none",
            "confidence": 0.0,
            "hf_ratio": None,
            "h95": None,
            "h99": None,
        }

    p = [max(0.0, _to_float(v, 0.0)) for v in ps]
    total = sum(p)
    if total <= 1e-9:
        return {
            "available": False,
            "shape_hint": "none",
            "confidence": 0.0,
            "hf_ratio": None,
            "h95": None,
            "h99": None,
        }

    p1 = p[0]
    p2 = p[1] if len(p) > 1 else 0.0
    hf = sum(p[4:]) if len(p) > 4 else 0.0
    hf_ratio = hf / total
    primary_ratio = (p1 + p2) / total
    h95 = int(_to_float(efa_data.get("harmonics_for_95pct"), len(p)))
    h99 = int(_to_float(efa_data.get("harmonics_for_99pct"), len(p)))

    # Heurística:
    # - hf bajo y h95 bajo: forma suave/curvilínea.
    # - hf alto o h95 alto: forma compleja/angulosa/irregular.
    if hf_ratio <= 0.18 and h95 <= 4:
        hint = "smooth"
        conf = _clip01(0.65 + (0.18 - hf_ratio) * 1.2)
    elif hf_ratio >= 0.34 or h95 >= 8:
        hint = "angular"
        conf = _clip01(0.65 + (hf_ratio - 0.34) * 1.2)
    else:
        hint = "mixed"
        conf = 0.55

    return {
        "available": True,
        "shape_hint": hint,
        "confidence": _round(conf, 4),
        "hf_ratio": _round(hf_ratio, 6),
        "primary_ratio": _round(primary_ratio, 6),
        "h95": h95,
        "h99": h99,
    }


def _fuse_with_efa(tipo: str, subtipo: str, base_score: float, efa_sig: dict[str, Any]) -> tuple[str, str, float, str]:
    """Fusiona baseline con evidencia EFA sin cambios bruscos de clase."""
    if not efa_sig.get("available"):
        return tipo, subtipo, base_score, "sin evidencia EFA"

    hint = efa_sig.get("shape_hint")
    efe_conf = _to_float(efa_sig.get("confidence"), 0.0)
    adjusted = base_score
    rationale = []

    if hint == "smooth":
        if tipo in {"Punta de proyectil", "Lamina litica", "Raspador"}:
            adjusted = _clip01(base_score + 0.08 * efe_conf)
            rationale.append("EFA sugiere contorno suave y consistente con clase curvilinea")
        elif tipo in {"Nucleo"}:
            adjusted = _clip01(base_score - 0.06 * efe_conf)
            rationale.append("EFA sugiere menor angularidad que la esperada para nucleo")
    elif hint == "angular":
        if tipo in {"Nucleo", "Lasca"}:
            adjusted = _clip01(base_score + 0.08 * efe_conf)
            rationale.append("EFA sugiere mayor complejidad angular compatible con la clase")
        elif tipo in {"Raspador"}:
            adjusted = _clip01(base_score - 0.07 * efe_conf)
            rationale.append("EFA detecta complejidad alta para una morfologia de raspador")
    else:
        adjusted = _clip01(base_score + 0.02)
        rationale.append("EFA mixto: ajuste conservador de confianza")

    if not rationale:
        rationale.append("EFA no cambia la clase, solo mantiene consistencia")

    return tipo, subtipo, adjusted, "; ".join(rationale)


def _style(tipo: str) -> tuple[str, str]:
    colors = {
        "Punta de proyectil": "#b91c1c",
        "Bifaz": "#7c3aed",
        "Lamina litica": "#0369a1",
        "Raspador": "#0f766e",
        "Perforador": "#166534",
        "Cuchillo litico": "#1d4ed8",
        "Lasca": "#a16207",
        "Nucleo": "#374151",
        "Guijarro": "#6b7280",
        "Indeterminado": "#64748b",
    }
    icons = {
        "Punta de proyectil": "▲",
        "Bifaz": "◆",
        "Lamina litica": "▭",
        "Raspador": "◔",
        "Perforador": "◉",
        "Cuchillo litico": "⟋",
        "Lasca": "◌",
        "Nucleo": "⬢",
        "Guijarro": "●",
        "Indeterminado": "?",
    }
    return colors.get(tipo, "#64748b"), icons.get(tipo, "?")


async def classify_async(metrics: dict[str, Any]) -> dict[str, Any]:
    """Clasificación tipológica con mejora opcional de identificación por EFA."""
    if not isinstance(metrics, dict):
        return {
            "status": "error",
            "message": "Se esperaba un objeto de métricas",
        }

    tipo, subtipo, score_base, ev_base = _shape_baseline(metrics)

    # 1) Reusar EFA ya calculado si viene desde frontend
    efa_data = metrics.get("_efa_data") if isinstance(metrics.get("_efa_data"), dict) else None

    # 2) Si no viene EFA, intentar calcularlo desde contorno comprimido
    if not efa_data:
        pts = _extract_contour_points(metrics)
        if len(pts) >= 8:
            scale = _to_float(metrics.get("scale_px_mm"), 1.0)
            try:
                efa_res = await efa.calculate(
                    contour_points=pts,
                    n_harmonics=20,
                    scale_px_mm=scale if scale > 0 else 1.0,
                    normalize=True,
                )
                if isinstance(efa_res, dict) and efa_res.get("status") == "ok":
                    efa_data = efa_res
            except Exception:
                efa_data = None

    efa_sig = _infer_efa_signature(efa_data or {})
    tipo_f, subtipo_f, score_f, rationale = _fuse_with_efa(tipo, subtipo, score_base, efa_sig)

    color, icon = _style(tipo_f)

    return {
        "status": "ok",
        "tipo": tipo_f,
        "subtipo": subtipo_f,
        "confianza": _round(score_f, 4),
        "descripcion": f"{tipo_f} ({subtipo_f}) — {rationale}",
        "color": color,
        "icono": icon,
        "evidencias": {
            "baseline": ev_base,
            "efa": efa_sig,
        },
    }
