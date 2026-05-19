"""
MAO Plus — Tests de paridad: contorno mm ↔ raster canónico (Fase 1)
====================================================================
Verifica que `rasterize_canonical_contour()` produce un raster cuyas
métricas (área, perímetro) se mantienen dentro de tolerancias respecto
al contorno de entrada en mm, para el dpi recomendado de 20 px/mm.

Casos cubiertos:
  - Cuadrado axis-aligned (caso trivial)
  - Rectángulo alargado (aspect ratio alto)
  - Polígono regular (octógono) — sensible a stair-stepping
  - Círculo discretizado (N alto) — sensible al perímetro
  - Polígono cóncavo (forma de L) — verifica que hull ≠ contorno
  - Polígono con un agujero (perforación) — área debe descontar agujero

Tolerancias por defecto (dpi=20 px/mm):
  - Área: ≤ 3 %  (sesgo half-open de fillPoly relevante en objetos finos)
  - Perímetro: ≤ 4 %  (medido sobre contorno simplificado Douglas-Peucker)
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from python.modules.obj3d_canonical_raster import (
    IMPLEMENTED,
    rasterize_canonical_contour,
    _polygon_area_shoelace,
    _polygon_perimeter,
    _convex_hull_xy,
)


DPI_DEFAULT = 20.0
TOL_AREA_PCT = 3.0
TOL_PERIM_PCT = 4.0


def _square_mm(side: float = 10.0) -> list:
    return [[0.0, 0.0], [side, 0.0], [side, side], [0.0, side]]


def _rectangle_mm(w: float = 30.0, h: float = 5.0) -> list:
    return [[0.0, 0.0], [w, 0.0], [w, h], [0.0, h]]


def _regular_polygon_mm(n: int, radius: float = 10.0, cx: float = 12.0, cy: float = 12.0) -> list:
    pts = []
    for i in range(n):
        ang = 2 * math.pi * i / n
        pts.append([cx + radius * math.cos(ang), cy + radius * math.sin(ang)])
    return pts


def _l_shape_mm() -> list:
    # Forma de L: 20×20 menos un cuadrado 10×10 en la esquina sup. derecha
    return [
        [0.0, 0.0], [20.0, 0.0], [20.0, 10.0],
        [10.0, 10.0], [10.0, 20.0], [0.0, 20.0],
    ]


# ── Test de smoke ────────────────────────────────────────────────────────────

def test_module_implemented():
    assert IMPLEMENTED is True


def test_invalid_inputs():
    with pytest.raises(ValueError):
        rasterize_canonical_contour([[0, 0], [1, 0]], dpi=DPI_DEFAULT)
    with pytest.raises(ValueError):
        rasterize_canonical_contour(_square_mm(), dpi=0)
    with pytest.raises(ValueError):
        rasterize_canonical_contour(_square_mm(), dpi=-1)


# ── Tests de paridad ─────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "name,pts,expected_area,expected_perim",
    [
        ("square_10",   _square_mm(10.0),        100.0,           40.0),
        ("square_25",   _square_mm(25.0),        625.0,          100.0),
        ("rect_30x5",   _rectangle_mm(30.0, 5.0), 150.0,           70.0),
        ("rect_50x2",   _rectangle_mm(50.0, 2.0), 100.0,          104.0),
    ],
)
def test_parity_rectilinear(name, pts, expected_area, expected_perim):
    """Polígonos axis-aligned: paridad casi exacta."""
    res = rasterize_canonical_contour(pts, dpi=DPI_DEFAULT, stroke_width=0)
    # Sanity: el área/perímetro de entrada coincide con el esperado analítico
    assert res["area_mm2_input"] == pytest.approx(expected_area, rel=1e-6)
    assert res["perimeter_mm_input"] == pytest.approx(expected_perim, rel=1e-6)
    # Paridad con raster
    assert res["parity_error_area_pct"] <= TOL_AREA_PCT, (
        f"[{name}] área: {res['area_mm2_raster']:.3f} vs {expected_area:.3f} "
        f"err {res['parity_error_area_pct']:.2f}% > {TOL_AREA_PCT}%"
    )
    assert res["parity_error_perimeter_pct"] <= TOL_PERIM_PCT, (
        f"[{name}] perím: {res['perimeter_mm_raster']:.3f} vs {expected_perim:.3f} "
        f"err {res['parity_error_perimeter_pct']:.2f}% > {TOL_PERIM_PCT}%"
    )


@pytest.mark.parametrize("n_sides", [8, 16, 32, 64])
def test_parity_regular_polygon(n_sides):
    """Polígonos regulares: el perímetro tolera más por stair-stepping."""
    pts = _regular_polygon_mm(n_sides, radius=10.0)
    res = rasterize_canonical_contour(pts, dpi=DPI_DEFAULT, stroke_width=0)
    assert res["parity_error_area_pct"] <= TOL_AREA_PCT, (
        f"n={n_sides} área err {res['parity_error_area_pct']:.2f}%"
    )
    assert res["parity_error_perimeter_pct"] <= TOL_PERIM_PCT, (
        f"n={n_sides} perím err {res['parity_error_perimeter_pct']:.2f}%"
    )


def test_parity_circle_high_resolution():
    """Círculo aproximado con N=128 vértices, r=15 mm."""
    pts = _regular_polygon_mm(128, radius=15.0, cx=18.0, cy=18.0)
    res = rasterize_canonical_contour(pts, dpi=DPI_DEFAULT, stroke_width=0)

    # Área teórica del polígono regular inscrito ≈ π r² para N grande
    area_teorica = math.pi * 15.0 ** 2
    # Tolerancia ampliada porque el polígono ya es aproximación de círculo
    assert abs(res["area_mm2_input"] - area_teorica) / area_teorica < 0.01
    assert res["parity_error_area_pct"] <= TOL_AREA_PCT
    assert res["parity_error_perimeter_pct"] <= TOL_PERIM_PCT


def test_concave_l_shape_area_vs_hull():
    """Forma cóncava: área < área del convex hull. Paridad mantenida."""
    pts = _l_shape_mm()
    res = rasterize_canonical_contour(pts, dpi=DPI_DEFAULT, stroke_width=0)

    # Área esperada: 20×20 - 10×10 = 300
    assert res["area_mm2_input"] == pytest.approx(300.0, rel=1e-6)
    assert res["parity_error_area_pct"] <= TOL_AREA_PCT

    # Convex hull en mm debería tener mayor área que el contorno (es cóncavo).
    # El hull de la L = pentágono (0,0)(20,0)(20,10)(10,20)(0,20) → área 350,
    # estrictamente menor que el bbox (400) y mayor que el contorno cóncavo (300).
    pts_mm = np.asarray(pts, dtype=np.float64)
    hull_mm = _convex_hull_xy(pts_mm)
    area_hull_mm2 = _polygon_area_shoelace(hull_mm)
    assert area_hull_mm2 > res["area_mm2_input"]
    assert area_hull_mm2 == pytest.approx(350.0, rel=1e-6)


def test_hole_subtracts_area():
    """Polígono con un agujero: área raster ≈ área exterior - área agujero."""
    outer = _square_mm(20.0)             # 400 mm²
    hole = [[5.0, 5.0], [10.0, 5.0], [10.0, 10.0], [5.0, 10.0]]  # 25 mm²
    res = rasterize_canonical_contour(
        outer, dpi=DPI_DEFAULT, holes_mm=[hole], stroke_width=0
    )
    # area_mm2_input es Shoelace del exterior (no descuenta agujero por diseño:
    # representa el polígono "lleno"). El raster sí descuenta el agujero.
    assert res["area_mm2_input"] == pytest.approx(400.0, rel=1e-6)
    area_neta_esperada = 400.0 - 25.0
    err_pct = abs(res["area_mm2_raster"] - area_neta_esperada) / area_neta_esperada * 100.0
    assert err_pct <= TOL_AREA_PCT, (
        f"área raster con agujero {res['area_mm2_raster']:.3f} vs {area_neta_esperada:.3f} "
        f"err {err_pct:.2f}%"
    )
    # Bbox confirma que se registró el agujero
    assert len(res["holes_px"]) == 1
    assert len(res["holes_px"][0]) == 4


# ── Tests de estructura ──────────────────────────────────────────────────────

def test_output_structure_complete():
    res = rasterize_canonical_contour(_square_mm(10.0), dpi=DPI_DEFAULT)
    expected_keys = {
        "contour_points_px", "convex_hull_px", "holes_px",
        "bbox_px", "image_png_bytes", "image_b64", "image_size",
        "scale_mm_per_px", "dpi", "padding_px",
        "area_mm2_input", "perimeter_mm_input",
        "area_mm2_raster", "perimeter_mm_raster",
        "parity_error_area_pct", "parity_error_perimeter_pct",
    }
    assert expected_keys.issubset(res.keys())
    assert res["dpi"] == DPI_DEFAULT
    assert res["scale_mm_per_px"] == pytest.approx(1.0 / DPI_DEFAULT)
    assert res["image_png_bytes"][:8] == b"\x89PNG\r\n\x1a\n"
    assert len(res["contour_points_px"]) == 4
    # Hull de un cuadrado convexo = mismo número de puntos
    assert len(res["convex_hull_px"]) == 4


def test_bbox_matches_input_span():
    pts = _rectangle_mm(30.0, 10.0)
    res = rasterize_canonical_contour(pts, dpi=DPI_DEFAULT, padding_px=10)
    bbox = res["bbox_px"]
    # span en mm * dpi = ancho en px (sin padding)
    assert bbox["width"] == pytest.approx(30.0 * DPI_DEFAULT, abs=1)
    assert bbox["height"] == pytest.approx(10.0 * DPI_DEFAULT, abs=1)
    assert bbox["minX"] == 10
    assert bbox["minY"] == 10


def test_dpi_scales_inversely_with_scale():
    pts = _square_mm(10.0)
    res10 = rasterize_canonical_contour(pts, dpi=10.0, stroke_width=0)
    res20 = rasterize_canonical_contour(pts, dpi=20.0, stroke_width=0)
    res40 = rasterize_canonical_contour(pts, dpi=40.0, stroke_width=0)
    assert res10["scale_mm_per_px"] == pytest.approx(0.1)
    assert res20["scale_mm_per_px"] == pytest.approx(0.05)
    assert res40["scale_mm_per_px"] == pytest.approx(0.025)
    # Mayor dpi → menor error de paridad (refinamiento esperado)
    assert res40["parity_error_area_pct"] <= res10["parity_error_area_pct"] + 1e-6
