"""
MAO Plus — Módulo: Métricas de Perforaciones / Horadaciones
============================================================
Estado: IMPLEMENTADO (IMPLEMENTED = True)

Funciones JS que replica:
  - calcularMetricasPerforacion()  analysis-core.js ~L46719
  - calcularAreaEfectivaPH()       analysis-core.js ~L46978
  - calcularAnalisisComparativo()  analysis-core.js ~L47086  (parte no-UI)

Dado un array de puntos de un polígono trazado manualmente, calcula:
  área (mm²), perímetro (mm), centroide Shoelace, bounding box,
  convex hull, radios extremos, métricas de forma (circularity, compactness,
  solidity, convexity, elongation), ejes principales (PCA), Feret.

El trazado en sí (modal de canvas) permanece en JS. Python recibe la
geometría ya trazada y devuelve las métricas computadas.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from shapely.geometry import Polygon as ShapelyPolygon
from shapely.validation import make_valid

from . import metrics as _metrics_mod

IMPLEMENTED = True


# ─────────────────────────────────────────────────────────────────────────────
# Utilidades geométricas internas
# ─────────────────────────────────────────────────────────────────────────────

def _normalize_points(pts: list) -> list[list[float]]:
    """Acepta [{x,y}...] o [[x,y]...] → [[float, float]...]."""
    result = []
    for p in pts:
        if isinstance(p, dict):
            result.append([float(p.get("x", p.get("0", 0))), float(p.get("y", p.get("1", 0)))])
        else:
            result.append([float(p[0]), float(p[1])])
    return result


def _shoelace_area(pts: list[list[float]]) -> float:
    """Área de Shoelace (positiva)."""
    n = len(pts)
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += pts[i][0] * pts[j][1]
        area -= pts[j][0] * pts[i][1]
    return abs(area) / 2.0


def _shoelace_centroid(pts: list[list[float]]) -> list[float]:
    """Centroide ponderado por área (fórmula de Green)."""
    n = len(pts)
    cx = cy = sa = 0.0
    for i in range(n):
        j = (i + 1) % n
        cross = pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
        sa += cross
        cx += (pts[i][0] + pts[j][0]) * cross
        cy += (pts[i][1] + pts[j][1]) * cross
    sa /= 2.0
    if abs(sa) > 1e-10:
        return [cx / (6 * sa), cy / (6 * sa)]
    return [sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n]


def _polygon_perimeter(pts: list[list[float]]) -> float:
    n = len(pts)
    return sum(
        math.hypot(pts[(i + 1) % n][0] - pts[i][0], pts[(i + 1) % n][1] - pts[i][1])
        for i in range(n)
    )


def _convex_hull_pts(pts: list[list[float]]) -> list[list[float]]:
    """Convex hull usando shapely; fallback a lista completa."""
    try:
        poly = ShapelyPolygon(pts)
        if not poly.is_valid:
            poly = make_valid(poly)
        hull = poly.convex_hull
        if hull.geom_type == "Polygon":
            return [list(c) for c in hull.exterior.coords[:-1]]
        elif hull.geom_type == "LineString":
            return [list(c) for c in hull.coords]
    except Exception:
        pass
    return pts


def _feret_diameters(hull_pts: list[list[float]], step: int = 2
                     ) -> tuple[float, float, float, float, float]:
    """
    Diámetros de Feret por barrido angular (igual que JS).
    Retorna (feret_max, feret_min, ratio, angulo_max, angulo_min).
    """
    feret_max = 0.0
    feret_min = float("inf")
    angle_max = angle_min = 0
    for angle_deg in range(0, 180, step):
        rad = math.radians(angle_deg)
        cos_a, sin_a = math.cos(rad), math.sin(rad)
        projs = [p[0] * cos_a + p[1] * sin_a for p in hull_pts]
        diameter = max(projs) - min(projs)
        if diameter > feret_max:
            feret_max, angle_max = diameter, angle_deg
        if diameter < feret_min:
            feret_min, angle_min = diameter, angle_deg
    # Fórmula MAO (FORMULAS_METRICAS_MAO): ratio = F_min / F_max ∈ [0, 1]
    ratio = feret_min / feret_max if feret_max > 0 else 0.0
    return feret_max, feret_min, ratio, float(angle_max), float(angle_min)


def _principal_axes(pts: list[list[float]]) -> dict:
    """
    Ejes principales usando tensor de inercia de área (teorema de Green).
    Idéntico a calcularExcentricidad() JS y _inertia_eigenvalues() de metrics.py.
    """
    arr = np.array(pts, dtype=float)
    cx = float(arr[:, 0].mean()); cy = float(arr[:, 1].mean())
    n = len(arr)
    sxx = syy = sxy = sa = 0.0
    for i in range(n):
        j = (i + 1) % n
        xi = arr[i, 0] - cx; yi = arr[i, 1] - cy
        xj = arr[j, 0] - cx; yj = arr[j, 1] - cy
        c = xi * yj - xj * yi
        sa += c
        sxx += (xi * xi + xi * xj + xj * xj) * c
        syy += (yi * yi + yi * yj + yj * yj) * c
        sxy += (2 * xi * yi + 2 * xj * yj + xi * yj + xj * yi) * c
    if abs(sa) > 1e-10:
        sxx /= (6 * sa); syy /= (6 * sa); sxy /= (12 * sa)
    tr = sxx + syy; det = sxx * syy - sxy * sxy
    disc = max(0.0, tr * tr - 4 * det)
    lam1 = (tr + math.sqrt(disc)) / 2
    ang = math.atan2(lam1 - sxx, sxy) if abs(sxy) > 1e-10 else 0.0
    cos_a = math.cos(ang); sin_a = math.sin(ang)
    dx_ = arr[:, 0] - cx; dy_ = arr[:, 1] - cy
    p1 = dx_ * cos_a + dy_ * sin_a
    p2 = -dx_ * sin_a + dy_ * cos_a
    eje_mayor_px = float(p1.max() - p1.min())
    eje_menor_px = float(p2.max() - p2.min())
    excentricidad = (
        math.sqrt(max(0.0, 1 - (eje_menor_px / eje_mayor_px) ** 2))
        if eje_mayor_px > 0 else 0.0
    )
    return {
        "eje_mayor_px": eje_mayor_px,
        "eje_menor_px": eje_menor_px,
        "excentricidad": excentricidad,
        "angulo_eje": math.degrees(ang),
    }


def _classify_shape(circularity: float, regularidad: float, aspect_ratio: float) -> tuple[str, float]:
    """Replica la clasificación de forma de calcularMetricasPerforacion() JS."""
    if circularity > 0.85 and regularidad > 80:
        return "Circular", min(circularity, regularidad / 100)
    if aspect_ratio < 1.3 and regularidad > 70:
        return "Subcircular", 0.70
    if aspect_ratio > 3.0:
        return "Alargada", 0.80
    if aspect_ratio > 1.5 and circularity < 0.7:
        return "Elíptica", 0.75
    return "Irregular", 0.50


# ─────────────────────────────────────────────────────────────────────────────
# API pública
# ─────────────────────────────────────────────────────────────────────────────

async def calculate_metrics(puntos: list, tipo: str, ph_id: Any, scale_px_mm: float = 1.0) -> dict | None:
    """
    Calcula métricas completas para un polígono de perforación u horadación.

    Replica: calcularMetricasPerforacion() — analysis-core.js ~L46719

    Parámetros
    ----------
    puntos      : lista de puntos [{x,y}] o [[x,y]]
    tipo        : "perforacion" | "horadacion"
    ph_id       : identificador del P/H (cualquier valor serializable)
    scale_px_mm : escala px → mm (global del análisis)

    Retorna dict con todas las métricas o None si hay < 3 puntos.
    """
    pts = _normalize_points(puntos)
    if len(pts) < 3:
        return None

    scale2 = scale_px_mm * scale_px_mm

    # 1. Área y perímetro
    area_px    = _shoelace_area(pts)
    area_mm2   = area_px * scale2
    perim_px   = _polygon_perimeter(pts)
    perim_mm   = perim_px * scale_px_mm

    # 2. Centroide
    centroid = _shoelace_centroid(pts)
    cx, cy   = centroid

    # 3. Bounding box
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    w_px, h_px = max_x - min_x, max_y - min_y
    w_mm, h_mm = w_px * scale_px_mm, h_px * scale_px_mm

    # 4. Convex hull
    hull_pts    = _convex_hull_pts(pts)
    hull_area_px  = _shoelace_area(hull_pts)
    hull_area_mm2 = hull_area_px * scale2
    hull_perim_px = _polygon_perimeter(hull_pts)

    # 5. Radios desde centroide — idéntico a calcularRadiosExtremos() JS / _radios_extremos() metrics.py
    #    r_max: vértice del hull más alejado del centroide
    #    r_min: distancia perp. mínima centroide ↔ aristas del hull (geométricamente exacto)
    #    estadísticas: sobre el contorno completo (pts), no solo vértices del hull
    _hn = len(hull_pts)
    r_max_px = max(math.hypot(p[0] - cx, p[1] - cy) for p in hull_pts) if hull_pts else 0.0
    r_min_px = math.inf
    for _i in range(_hn):
        _ax = hull_pts[_i][0] - cx;       _ay = hull_pts[_i][1] - cy
        _bx = hull_pts[(_i + 1) % _hn][0] - cx; _by = hull_pts[(_i + 1) % _hn][1] - cy
        _abx = _bx - _ax; _aby = _by - _ay; _ab2 = _abx ** 2 + _aby ** 2
        if _ab2 < 1e-12:
            _t = 0.0
        else:
            _t = max(0.0, min(1.0, -(_ax * _abx + _ay * _aby) / _ab2))
        _nx = _ax + _t * _abx; _ny = _ay + _t * _aby
        _d = math.sqrt(_nx ** 2 + _ny ** 2)
        if _d < r_min_px:
            r_min_px = _d
    if r_min_px == math.inf:
        r_min_px = 0.0
    # Estadísticas sobre contorno completo (igual que JS usa fullContour)
    _pts_s = pts if len(pts) >= 3 else hull_pts
    _dists = [math.hypot(p[0] - cx, p[1] - cy) for p in _pts_s]
    r_med_px = sum(_dists) / len(_dists) if _dists else 0.0
    r_std_px = math.sqrt(sum((d - r_med_px) ** 2 for d in _dists) / len(_dists)) if _dists else 0.0
    cv_radios = (r_std_px / r_med_px * 100) if r_med_px > 0 else 0.0
    # ratio_radios = r_min/r_max (igual que JS) y regularidad = ratio * 100
    ratio_radios = r_min_px / r_max_px if r_max_px > 0 else 0.0
    regularidad = ratio_radios * 100

    # 6. Métricas de forma (adimensionales, en px)
    circularity  = min((4 * math.pi * area_px) / (perim_px ** 2), 1.0) if perim_px > 0 else 0.0
    compactness  = (perim_px ** 2) / area_px                          if area_px > 0        else 0.0
    solidity     = area_px / hull_area_px                             if hull_area_px > 0   else 0.0
    aspect_ratio = max(w_px, h_px) / min(w_px, h_px)                 if min(w_px, h_px) > 0 else 1.0
    # Fórmula MAO (FORMULAS_METRICAS_MAO): convexidad = P_hull / P_real ∈ [0, 1]
    convexity    = hull_perim_px / perim_px                           if perim_px > 0  else 0.0
    elongation   = abs(1 - min(w_px, h_px) / max(w_px, h_px))        if max(w_px, h_px) > 0 else 0.0
    shape_factor = (perim_px ** 2) / (4 * math.pi * area_px)         if area_px > 0        else 0.0
    rectangularity = area_px / (w_px * h_px)                         if (w_px * h_px) > 0  else 0.0

    # 7. Ejes principales (PCA de momentos de área)
    axes = _principal_axes(pts)
    eje_mayor_mm = axes["eje_mayor_px"] * scale_px_mm
    eje_menor_mm = axes["eje_menor_px"] * scale_px_mm

    # 8. Diámetros de Feret
    f_max_px, f_min_px, f_ratio, f_ang_max, f_ang_min = _feret_diameters(hull_pts)

    # 9. Clasificación de forma — taxonomía extendida de 15 clases (metrics.py)
    _full = await _metrics_mod.calculate(b"", pts, scale_px_mm)
    _m    = _full.get("metricas") or _full
    forma     = _m.get("forma_detectada", "Irregular")
    confianza = _m.get("forma_confianza", 0.5)
    forma_cat = _m.get("forma_categoria", "Irregular")

    return {
        "tipo": tipo,
        "id": ph_id,
        # — dimensiones reales —
        "area": round(area_mm2, 4),
        "area_px": round(area_px, 2),
        "perimetro": round(perim_mm, 4),
        "perimetro_px": round(perim_px, 2),
        "centroide": [round(cx, 2), round(cy, 2)],
        "bounding_box": {
            "x": round(min_x, 2), "y": round(min_y, 2),
            "width_px": round(w_px, 2), "height_px": round(h_px, 2),
            "width_mm": round(w_mm, 4), "height_mm": round(h_mm, 4),
        },
        # — hull —
        "convex_hull_area": round(hull_area_mm2, 4),
        "hull_points": [[round(p[0], 2), round(p[1], 2)] for p in hull_pts],
        # — radios —
        "radio_maximo": round(r_max_px * scale_px_mm, 4),
        "radio_minimo": round(r_min_px * scale_px_mm, 4),
        "radio_medio": round(r_med_px * scale_px_mm, 4),
        "ratio_radios": round(ratio_radios, 4),
        "desviacion_radial": round(r_std_px * scale_px_mm, 4),
        "coeficiente_variacion_radial": round(cv_radios, 2),
        "regularidad_radial": round(regularidad, 2),
        # — forma (adimensional) —
        "circularidad": round(circularity, 6),
        "compacidad": round(compactness, 4),
        "solidez": round(solidity, 6),
        "convexidad": round(convexity, 6),
        "elongacion": round(elongation, 6),
        "factor_forma": round(shape_factor, 6),
        "rectangularidad": round(rectangularity, 6),
        "aspect_ratio": round(aspect_ratio, 4),
        # — ejes principales —
        "eje_mayor": round(eje_mayor_mm, 4),
        "eje_menor": round(eje_menor_mm, 4),
        "excentricidad": round(axes["excentricidad"], 6),
        "angulo_eje": round(axes["angulo_eje"], 2),
        # — Feret —
        "feret_max": round(f_max_px * scale_px_mm, 4),
        "feret_min": round(f_min_px * scale_px_mm, 4),
        "feret_ratio": round(f_ratio, 4),
        "feret_angulo_max": round(f_ang_max, 1),
        "feret_angulo_min": round(f_ang_min, 1),
        # — clasificación —
        "forma_detectada": forma,
        "confianza_forma": round(confianza, 3),
        "forma_categoria": forma_cat,
    }


def calculate_effective_area(
    perforaciones: list[dict],
    horadaciones: list[dict],
    scale_px_mm: float = 1.0,
) -> dict:
    """
    Calcula el área efectiva de P/H, detectando perforaciones contenidas
    dentro de horadaciones (ray casting) y excluyéndolas del área neta.

    Replica: calcularAreaEfectivaPH() — analysis-core.js ~L46978

    Entradas: arrays del objeto JS {puntos/contorno, metricas?, id, ...}
    Salida : mismas claves que la función JS
             (areaTotalPerforaciones, areaTotalHoradaciones, areaTotalPH,
              areaBrutaPerforaciones, numContenidas, relaciones)
    """
    scale2 = scale_px_mm * scale_px_mm

    def _get_area(ph: dict) -> float:
        # Prioridad 1: metricas.area ya en mm²
        mets = ph.get("metricas") or {}
        if "area" in mets:
            return float(mets["area"])
        # Prioridad 2: metricas.area_real en px² → convertir
        if "area_real" in mets:
            return float(mets["area_real"]) * scale2
        # Prioridad 3: ph.area numérico
        raw_area = ph.get("area")
        if raw_area is not None and not isinstance(raw_area, dict):
            try:
                return float(raw_area)
            except (TypeError, ValueError):
                pass
        # Prioridad 4: Shoelace desde puntos
        pts_raw = ph.get("puntos") or ph.get("contorno") or ph.get("poligonoTrazado") or []
        if len(pts_raw) >= 3:
            pts = _normalize_points(pts_raw)
            return _shoelace_area(pts) * scale2
        return 0.0

    def _ray_cast(px: float, py: float, poly: list[list[float]]) -> bool:
        inside = False
        n = len(poly)
        j = n - 1
        for i in range(n):
            xi, yi = poly[i]
            xj, yj = poly[j]
            if ((yi > py) != (yj > py)) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
                inside = not inside
            j = i
        return inside

    idx_contenidas: set[int] = set()
    relaciones: list[dict] = []

    if perforaciones and horadaciones:
        for pi, p in enumerate(perforaciones):
            pts_p_raw = p.get("puntos") or p.get("contorno") or []
            if len(pts_p_raw) < 3:
                continue
            pts_p = _normalize_points(pts_p_raw)
            cent = _shoelace_centroid(pts_p)
            area_p = _get_area(p)

            for h in horadaciones:
                pts_h_raw = h.get("puntos") or h.get("contorno") or []
                if len(pts_h_raw) < 3:
                    continue
                pts_h   = _normalize_points(pts_h_raw)
                area_h  = _get_area(h)
                if area_p >= area_h:            # contenido < contenedor
                    continue
                if _ray_cast(cent[0], cent[1], pts_h):
                    idx_contenidas.add(pi)
                    relaciones.append({
                        "perforacion_id": p.get("id", pi),
                        "horadacion_id": h.get("id"),
                    })

    area_ef_perf = sum(
        _get_area(p) for i, p in enumerate(perforaciones)
        if i not in idx_contenidas
    )
    area_bruta_perf = sum(_get_area(p) for p in perforaciones)
    area_total_hor  = sum(_get_area(h) for h in horadaciones)

    return {
        "areaTotalPerforaciones": round(area_ef_perf, 4),
        "areaTotalHoradaciones": round(area_total_hor, 4),
        "areaTotalPH": round(area_ef_perf + area_total_hor, 4),
        "areaBrutaPerforaciones": round(area_bruta_perf, 4),
        "areaBrutaHoradaciones": round(area_total_hor, 4),
        "numContenidas": len(idx_contenidas),
        "relaciones": relaciones,
    }


async def process_batch(
    perforaciones: list[dict],
    horadaciones: list[dict],
    scale_px_mm: float = 1.0,
) -> dict:
    """
    Procesa un array completo de perforaciones + horadaciones:
      - Calcula métricas individuales de cada P/H
      - Calcula área efectiva (con detección de P contenidas en H)

    Parámetros
    ----------
    perforaciones : [{puntos, id, ...}, ...]
    horadaciones  : [{puntos, id, ...}, ...]
    scale_px_mm   : escala global del análisis

    Retorna
    -------
    {
      "perforaciones": [metricas_calculadas, ...],
      "horadaciones" : [metricas_calculadas, ...],
      "area_efectiva": {...},   ← calcularAreaEfectivaPH output
      "count_perforaciones": n,
      "count_horadaciones" : n,
    }
    """
    perfs_out = []
    for ph in perforaciones:
        pts_raw = ph.get("puntos") or ph.get("contorno") or ph.get("poligonoTrazado") or []
        mets = await calculate_metrics(pts_raw, "perforacion", ph.get("id", 0), scale_px_mm)
        if mets:
            # Preservar campos originales no computables
            for field in ("id", "tipo", "color", "nombre"):
                if field in ph and field not in mets:
                    mets[field] = ph[field]
            perfs_out.append(mets)

    hors_out = []
    for ph in horadaciones:
        pts_raw = ph.get("puntos") or ph.get("contorno") or ph.get("poligonoTrazado") or []
        mets = await calculate_metrics(pts_raw, "horadacion", ph.get("id", 0), scale_px_mm)
        if mets:
            for field in ("id", "tipo", "color", "nombre"):
                if field in ph and field not in mets:
                    mets[field] = ph[field]
            hors_out.append(mets)

    # Pasar las listas enriquecidas (con .area ya en mm²) al cálculo de área efectiva
    # Construir versiones enriquecidas que calculate_effective_area sepa leer
    perfs_enriched = [
        {**p_orig, "metricas": {"area": m["area"]}}
        for p_orig, m in zip(perforaciones, perfs_out)
        if m
    ]
    hors_enriched = [
        {**h_orig, "metricas": {"area": m["area"]}}
        for h_orig, m in zip(horadaciones, hors_out)
        if m
    ]

    area_efectiva = calculate_effective_area(perfs_enriched, hors_enriched, scale_px_mm)

    return {
        "perforaciones": perfs_out,
        "horadaciones": hors_out,
        "area_efectiva": area_efectiva,
        "count_perforaciones": len(perfs_out),
        "count_horadaciones": len(hors_out),
    }
