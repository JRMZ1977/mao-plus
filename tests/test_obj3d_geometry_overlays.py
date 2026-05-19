"""
MAO Plus — Tests del endpoint /api/obj3d/contour-analyze :: geometry_overlays

Valida que la sección `geometry_overlays` devuelta por el endpoint
está bien formada, coherente con `bbox_units` y que las relaciones
geométricas básicas se cumplen (Fase 1+3).

Casos cubiertos:
  - Single piece (cuadrado): todas las capas presentes; centroides,
    círculo inscrito y bbox orientado coinciden con valores analíticos.
  - Envelope 2 piezas: centroide del hull coincide con centro geométrico;
    radios circunscrito > inscrito; bbox_oriented contiene a las piezas.
  - Coherencia bbox_units: todos los puntos de overlays dentro del bbox.
"""

from __future__ import annotations

import json
import math
import pytest


SINGLE_SQUARE = [[0, 0], [10, 0], [10, 10], [0, 10]]
TWO_SQUARES_ENV_UNION = [
    [0, 0], [4, 0], [4, 4], [0, 4],
    [6, 0], [10, 0], [10, 4], [6, 4],
]
TWO_SQUARES_PIECES = [
    [[0, 0], [4, 0], [4, 4], [0, 4]],
    [[6, 0], [10, 0], [10, 4], [6, 4]],
]


def _post_analyze(client, *, contour, pieces=None, mm_per_unit=1.0,
                  label="test"):
    data = {
        "contour_json": json.dumps(contour),
        "mm_per_unit":  str(mm_per_unit),
        "label":        label,
    }
    if pieces is not None:
        data["pieces_json"] = json.dumps(pieces)
    r = client.post("/api/obj3d/contour-analyze", data=data)
    assert r.status_code == 200, r.text
    return r.json()


def _all_overlay_points(geom):
    """Itera todos los puntos (u,v) presentes en cualquier capa."""
    keys_pt    = ("centroid", "centroid_hull",
                  "radius_max_point", "radius_min_point")
    keys_seg   = ("axis_major", "axis_minor",
                  "feret_max_segment", "feret_min_segment",
                  "radius_max_segment", "radius_min_segment")
    keys_poly  = ("convex_hull", "bbox_oriented")
    keys_circ  = ("inscribed_circle", "circumscribed_circle")
    for k in keys_pt:
        if k in geom: yield geom[k]
    for k in keys_seg:
        if k in geom:
            for p in geom[k]: yield p
    for k in keys_poly:
        if k in geom:
            for p in geom[k]: yield p
    for k in keys_circ:
        if k in geom and geom[k].get("center"):
            yield geom[k]["center"]


def test_geometry_overlays_single_square(client):
    """Cuadrado 10×10: overlays con valores analíticos predecibles."""
    res = _post_analyze(client, contour=SINGLE_SQUARE)
    geom = res.get("geometry_overlays")
    assert isinstance(geom, dict) and "_error" not in geom

    # Capas obligatorias presentes
    for k in ("centroid", "centroid_hull", "axis_major", "axis_minor",
              "feret_max_segment", "feret_min_segment",
              "radius_max_point", "radius_min_point",
              "radius_max_segment", "radius_min_segment",
              "convex_hull", "bbox_oriented",
              "circumscribed_circle", "inscribed_circle"):
        assert k in geom, f"Falta capa '{k}'"

    # Centroides en (5, 5)
    assert geom["centroid"][0]      == pytest.approx(5.0, abs=0.2)
    assert geom["centroid"][1]      == pytest.approx(5.0, abs=0.2)
    assert geom["centroid_hull"][0] == pytest.approx(5.0, abs=0.2)
    assert geom["centroid_hull"][1] == pytest.approx(5.0, abs=0.2)

    # Convex hull: 4 vértices
    assert len(geom["convex_hull"]) == 4

    # Bbox orientado: 4 vértices que cubren ~[0,10]×[0,10]
    assert len(geom["bbox_oriented"]) == 4
    bx = [p[0] for p in geom["bbox_oriented"]]
    by = [p[1] for p in geom["bbox_oriented"]]
    assert min(bx) == pytest.approx(0.0, abs=0.2)
    assert max(bx) == pytest.approx(10.0, abs=0.2)
    assert min(by) == pytest.approx(0.0, abs=0.2)
    assert max(by) == pytest.approx(10.0, abs=0.2)

    # Círculo inscrito ~ radio 5 (semilado del cuadrado)
    ins = geom["inscribed_circle"]
    assert ins["radius"] == pytest.approx(5.0, abs=0.15)

    # Círculo circunscrito ~ radio = √50 ≈ 7.07 (semidiagonal)
    cir = geom["circumscribed_circle"]
    assert cir["radius"] == pytest.approx(math.sqrt(50), abs=0.2)

    # Inscrito < circunscrito (invariante geométrico)
    assert ins["radius"] < cir["radius"]


def test_geometry_overlays_envelope_two_pieces(client):
    """Envelope 2 cuadrados 4×4 separados por gap (x∈[4,6])."""
    res = _post_analyze(client,
                        contour=TWO_SQUARES_ENV_UNION,
                        pieces=TWO_SQUARES_PIECES)
    geom = res.get("geometry_overlays")
    assert isinstance(geom, dict) and "_error" not in geom

    # Centro del hull (envolvente convexa = rectángulo 10×4) = (5, 2)
    assert geom["centroid_hull"][0] == pytest.approx(5.0, abs=0.2)
    assert geom["centroid_hull"][1] == pytest.approx(2.0, abs=0.2)

    # Eje mayor horizontal (long ≈ 10), ejes mayor extremos alineados en y=2
    ax = geom["axis_major"]
    assert ax[0][1] == pytest.approx(2.0, abs=0.3)
    assert ax[1][1] == pytest.approx(2.0, abs=0.3)
    # Longitud del eje mayor ≈ 10 u
    L = math.hypot(ax[1][0] - ax[0][0], ax[1][1] - ax[0][1])
    assert L == pytest.approx(10.0, abs=0.3)

    # Eje menor vertical (long ≈ 4)
    am = geom["axis_minor"]
    Lm = math.hypot(am[1][0] - am[0][0], am[1][1] - am[0][1])
    assert Lm == pytest.approx(4.0, abs=0.3)

    # Bbox orientado: contiene rectángulo 10×4
    bx = [p[0] for p in geom["bbox_oriented"]]
    by = [p[1] for p in geom["bbox_oriented"]]
    assert min(bx) == pytest.approx(0.0, abs=0.2)
    assert max(bx) == pytest.approx(10.0, abs=0.2)
    assert min(by) == pytest.approx(0.0, abs=0.2)
    assert max(by) == pytest.approx(4.0, abs=0.2)

    # Inscrito < circunscrito
    assert geom["inscribed_circle"]["radius"] < geom["circumscribed_circle"]["radius"]

    # Convex hull tiene 4 vértices (rectángulo envolvente)
    assert len(geom["convex_hull"]) == 4


def test_geometry_overlays_within_bbox_units(client):
    """Todos los puntos de overlays deben caer dentro del bbox del modelo,
    expandido por el margen del radio circunscrito (que puede salirse
    del hull en ese sentido)."""
    res = _post_analyze(client, contour=SINGLE_SQUARE)
    geom = res["geometry_overlays"]
    bb   = res["bbox_units"]

    # Margen tolerado = radio circunscrito (peor caso lícito)
    margin = geom["circumscribed_circle"]["radius"]
    for (x, y) in _all_overlay_points(geom):
        assert bb["x_min"] - margin - 0.1 <= x <= bb["x_max"] + margin + 0.1, \
            f"x={x} fuera de bbox+margen"
        assert bb["y_min"] - margin - 0.1 <= y <= bb["y_max"] + margin + 0.1, \
            f"y={y} fuera de bbox+margen"


def test_geometry_overlays_scale_with_mm_per_unit(client):
    """mm_per_unit no debe alterar las coordenadas devueltas (siempre en
    unidades del modelo)."""
    res_a = _post_analyze(client, contour=SINGLE_SQUARE, mm_per_unit=1.0)
    res_b = _post_analyze(client, contour=SINGLE_SQUARE, mm_per_unit=2.5)
    g_a, g_b = res_a["geometry_overlays"], res_b["geometry_overlays"]

    # Centroide en unidades del modelo: invariante ante mm_per_unit
    assert g_a["centroid_hull"][0] == pytest.approx(g_b["centroid_hull"][0], abs=0.05)
    assert g_a["centroid_hull"][1] == pytest.approx(g_b["centroid_hull"][1], abs=0.05)
    # Radio inscrito también invariante en unidades del modelo
    assert g_a["inscribed_circle"]["radius"] == pytest.approx(
        g_b["inscribed_circle"]["radius"], abs=0.05)


# ─── Feret max / min: longitudes correctas y no-colinealidad ─────────────────

def _seg_len(seg):
    return math.hypot(seg[1][0] - seg[0][0], seg[1][1] - seg[0][1])


def _seg_vec(seg):
    return (seg[1][0] - seg[0][0], seg[1][1] - seg[0][1])


def _abs_cross_unit(v1, v2):
    """|sin(theta)| entre dos vectores; 0 si son paralelos."""
    n1 = math.hypot(*v1) or 1.0
    n2 = math.hypot(*v2) or 1.0
    return abs(v1[0]*v2[1] - v1[1]*v2[0]) / (n1 * n2)


def test_feret_lengths_single_square(client):
    """Cuadrado 10×10: Feret max = diagonal (√200), Feret min = lado (10)."""
    geom = _post_analyze(client, contour=SINGLE_SQUARE)["geometry_overlays"]
    L_max = _seg_len(geom["feret_max_segment"])
    L_min = _seg_len(geom["feret_min_segment"])
    assert L_max == pytest.approx(math.sqrt(200), abs=0.5), \
        f"Feret max esperado ≈ 14.14, obtenido {L_max:.3f}"
    assert L_min == pytest.approx(10.0, abs=0.5), \
        f"Feret min esperado ≈ 10, obtenido {L_min:.3f}"
    assert L_min < L_max


def test_feret_lengths_envelope_rectangle(client):
    """Envolvente rect. 10×4: Feret max = diagonal (√116 ≈ 10.77),
    Feret min = lado corto (4)."""
    geom = _post_analyze(client,
                        contour=TWO_SQUARES_ENV_UNION,
                        pieces=TWO_SQUARES_PIECES)["geometry_overlays"]
    L_max = _seg_len(geom["feret_max_segment"])
    L_min = _seg_len(geom["feret_min_segment"])
    assert L_max == pytest.approx(math.sqrt(116), abs=0.5), \
        f"Feret max esperado ≈ 10.77, obtenido {L_max:.3f}"
    assert L_min == pytest.approx(4.0, abs=0.5), \
        f"Feret min esperado ≈ 4, obtenido {L_min:.3f}"
    assert L_min < L_max


def test_feret_segments_not_colinear(client):
    """Regresión: Feret max y Feret min NO deben ser paralelos (bug
    anterior los dibujaba sobre el mismo eje longitudinal)."""
    # Caso rectangular (más sensible al bug)
    geom = _post_analyze(client,
                        contour=TWO_SQUARES_ENV_UNION,
                        pieces=TWO_SQUARES_PIECES)["geometry_overlays"]
    v_max = _seg_vec(geom["feret_max_segment"])
    v_min = _seg_vec(geom["feret_min_segment"])
    # |sin(angle)| debe ser sustancial: rect 10×4 → ángulo entre diagonal y
    # vertical ≈ arctan(10/4) ≈ 68° → sin ≈ 0.93
    sin_t = _abs_cross_unit(v_max, v_min)
    assert sin_t > 0.5, \
        f"Feret max y min casi paralelos (|sin|={sin_t:.3f}); revisar cálculo"


# ─── Trazabilidad: analysis_contour, analysis_mode, analysis_trace ──────────

def test_analysis_contour_single_mode(client):
    """En modo single_contour, analysis_contour debe ser un polígono
    cerrado con valores cercanos al contorno de entrada."""
    res = _post_analyze(client, contour=SINGLE_SQUARE)
    assert res["analysis_mode"] == "single_contour"
    ac = res["analysis_contour"]
    assert isinstance(ac, list) and len(ac) >= 4
    xs = [p[0] for p in ac]
    ys = [p[1] for p in ac]
    # El contorno debe cubrir aprox [0,10]×[0,10] (con un pequeño margen
    # por la simplificación interna)
    assert min(xs) == pytest.approx(0.0, abs=0.5)
    assert max(xs) == pytest.approx(10.0, abs=0.5)
    assert min(ys) == pytest.approx(0.0, abs=0.5)
    assert max(ys) == pytest.approx(10.0, abs=0.5)

    # También debe estar replicado dentro de geometry_overlays para
    # consumo directo por el módulo de overlays
    assert res["geometry_overlays"]["analysis_contour"] == ac

    tr = res["analysis_trace"]
    assert tr["n_input_points"] == 4
    assert tr["n_metric_points"] >= 4
    assert tr["n_pieces"] == 1


def test_analysis_contour_envelope_mode(client):
    """En modo envelope_hull, analysis_contour debe coincidir con el hull
    convexo (el polígono realmente medido)."""
    res = _post_analyze(client,
                        contour=TWO_SQUARES_ENV_UNION,
                        pieces=TWO_SQUARES_PIECES)
    assert res["analysis_mode"] == "envelope_hull"
    ac   = res["analysis_contour"]
    hull = res["geometry_overlays"]["convex_hull"]
    # En modo envolvente, contorno métrico == hull
    assert len(ac) == len(hull)
    for (p_ac, p_hull) in zip(ac, hull):
        assert p_ac[0] == pytest.approx(p_hull[0], abs=0.05)
        assert p_ac[1] == pytest.approx(p_hull[1], abs=0.05)

    tr = res["analysis_trace"]
    assert tr["n_pieces"] == 2
    assert tr["n_input_points"] == 8  # 2 piezas × 4 pts


def test_analysis_trace_parity_fields_present(client):
    """analysis_trace debe contener los campos de paridad numérica."""
    res = _post_analyze(client, contour=SINGLE_SQUARE)
    tr = res["analysis_trace"]
    assert "parity_error_area_pct" in tr
    assert "parity_error_perimeter_pct" in tr
    assert isinstance(tr["parity_error_area_pct"], (int, float))
    assert isinstance(tr["parity_error_perimeter_pct"], (int, float))

