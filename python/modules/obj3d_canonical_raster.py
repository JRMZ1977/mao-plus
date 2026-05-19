"""
MAO Plus — Módulo: Rasterización canónica 3D → 2D
==================================================
Fase 1 del plan de unificación 3D/2D.

Convierte un contorno canónico 3D (puntos en mm en un plano normalizado) en un
"objeto 2D sintético" compatible con el pipeline morfológico 2D existente:
imagen rasterizada PNG, contorno y convex hull en coordenadas de píxel, bbox y
escala mm/px conocida.

Diseño:
- Resolución virtual configurable (`dpi` = px/mm; recomendado 20).
- Padding fijo en píxeles alrededor del contorno (evita recortes en hull/borde).
- Origen del raster = (0,0) en la esquina superior izquierda del canvas.
- El contorno mm se traslada para que su mínimo (x,y) caiga en `padding_px`.
- Convex hull calculado con scipy QHull (mismo motor que `metrics.py`).
- Reporta área y perímetro tanto en mm de entrada como medidos sobre el raster,
  con error relativo (`parity_error_*_pct`) para validación de tolerancia.

Función principal:
  rasterize_canonical_contour(contour_mm, dpi=20, padding_px=10, holes_mm=None)
    -> dict con: contour_points_px, convex_hull_px, bbox_px, image_png_bytes,
                 image_b64, scale_mm_per_px, parity_*

Tests de paridad: tests/test_obj3d_canonical_raster.py
"""

from __future__ import annotations

import base64
import math
from typing import List, Optional, Sequence, Tuple

import cv2
import numpy as np

try:
    from scipy.spatial import ConvexHull as _CvxHull
    _HAS_SCIPY = True
except Exception:
    _HAS_SCIPY = False

IMPLEMENTED = True


# ── Helpers geométricos ──────────────────────────────────────────────────────

def _polygon_area_shoelace(pts: np.ndarray) -> float:
    """Área absoluta por Shoelace (funciona en cualquier unidad)."""
    if len(pts) < 3:
        return 0.0
    x = pts[:, 0].astype(np.float64)
    y = pts[:, 1].astype(np.float64)
    return 0.5 * abs(float(np.dot(x, np.roll(y, -1)) - np.dot(np.roll(x, -1), y)))


def _polygon_perimeter(pts: np.ndarray, closed: bool = True) -> float:
    """Perímetro euclídeo (cierra el polígono si closed=True)."""
    if len(pts) < 2:
        return 0.0
    diffs = np.diff(pts, axis=0).astype(np.float64)
    seg = float(np.sum(np.sqrt((diffs ** 2).sum(axis=1))))
    if closed and len(pts) >= 3:
        seg += float(math.hypot(pts[-1, 0] - pts[0, 0], pts[-1, 1] - pts[0, 1]))
    return seg


def _convex_hull_xy(pts: np.ndarray) -> np.ndarray:
    """Convex hull (ordenado CCW). Si scipy no está, usa cv2.convexHull."""
    if len(pts) < 3:
        return pts.copy()
    if _HAS_SCIPY:
        hull = _CvxHull(pts)
        return pts[hull.vertices].astype(np.float64)
    cv_hull = cv2.convexHull(pts.astype(np.float32))  # devuelve (N,1,2)
    return cv_hull.reshape(-1, 2).astype(np.float64)


# ── Función principal ───────────────────────────────────────────────────────

def rasterize_canonical_contour(
    contour_mm: Sequence[Sequence[float]],
    dpi: float = 20.0,
    padding_px: int = 10,
    holes_mm: Optional[Sequence[Sequence[Sequence[float]]]] = None,
    background: int = 255,
    fill: int = 180,
    stroke: int = 40,
    stroke_width: int = 1,
    pieces_mm: Optional[Sequence[Sequence[Sequence[float]]]] = None,
) -> dict:
    """
    Rasteriza un contorno canónico 3D (en mm) a un objeto 2D sintético.

    Parámetros
    ----------
    contour_mm : list[[x_mm, y_mm], ...]
        Contorno cerrado en coordenadas físicas (mm) sobre el plano canónico.
        Cuando hay múltiples piezas (ver `pieces_mm`), `contour_mm` debe ser
        la UNIÓN de todos los puntos — se usa para hull/bbox/paridad pero NO
        para dibujar (evita líneas fantasma entre piezas).
    dpi : float
        Resolución virtual en píxeles por mm. Recomendado: 20 px/mm.
    padding_px : int
        Margen en píxeles alrededor del bbox del contorno.
    holes_mm : list[list[[x_mm, y_mm], ...]] | None
        Lista opcional de agujeros (perforaciones) en mm, cada uno cerrado.
    background, fill, stroke : int
        Grises (0..255) para fondo, relleno del polígono y borde.
    stroke_width : int
        Grosor del trazo del contorno en píxeles.
    pieces_mm : list[list[[x_mm, y_mm], ...]] | None
        Lista opcional de polígonos separados (caso "envolvente · N piezas").
        Cuando se proporciona, cada pieza se rasteriza individualmente con
        su propio `fillPoly` y `drawContours`, evitando los trazos artificiales
        de cierre que producen al concatenar piezas en un único array.

    Retorna
    -------
    dict con:
      - contour_points_px : list[[x_px, y_px], ...]  (coords absolutas en raster)
      - convex_hull_px    : list[[x_px, y_px], ...]
      - holes_px          : list[list[[x_px, y_px], ...]]
      - bbox_px           : {minX, minY, width, height}      (en píxeles del raster)
      - image_png_bytes   : bytes  (PNG codificado)
      - image_b64         : str    (PNG en base64, sin prefijo data:)
      - image_size        : {width, height}
      - scale_mm_per_px   : float  (= 1 / dpi)
      - dpi               : float
      - padding_px        : int
      - area_mm2_input    : float  (Shoelace sobre contorno mm)
      - perimeter_mm_input: float
      - area_mm2_raster   : float  (medida sobre la máscara rasterizada)
      - perimeter_mm_raster: float (medida sobre el contorno re-extraído)
      - parity_error_area_pct      : float (|raster - input| / input * 100)
      - parity_error_perimeter_pct : float
    """
    if dpi <= 0:
        raise ValueError("dpi debe ser > 0")
    if padding_px < 0:
        raise ValueError("padding_px debe ser >= 0")

    pts_mm = np.asarray(contour_mm, dtype=np.float64)
    if pts_mm.ndim != 2 or pts_mm.shape[1] != 2 or len(pts_mm) < 3:
        raise ValueError("contour_mm debe ser [[x,y],...] con ≥3 puntos")

    # Normalizar origen → translación a (padding_px, padding_px)
    min_xy_mm = pts_mm.min(axis=0)
    max_xy_mm = pts_mm.max(axis=0)
    span_mm = max_xy_mm - min_xy_mm
    if span_mm[0] <= 0 or span_mm[1] <= 0:
        raise ValueError("contour_mm tiene span nulo en x o y")

    # Conversión a píxeles (float subpíxel, luego int32 para dibujo)
    pts_px_f = (pts_mm - min_xy_mm) * dpi + padding_px
    width_px = int(math.ceil(span_mm[0] * dpi)) + 2 * padding_px
    height_px = int(math.ceil(span_mm[1] * dpi)) + 2 * padding_px

    # Canvas en escala de grises
    img = np.full((height_px, width_px), background, dtype=np.uint8)

    # ── Preparar lista de polígonos a dibujar ─────────────────────────────
    # Si se proporcionan `pieces_mm`, cada pieza se rasteriza por separado
    # para evitar las líneas fantasma de cierre entre piezas distintas
    # (problema visual del modal "envolvente · N piezas"). En caso contrario,
    # se dibuja un único polígono con todos los puntos de `contour_mm`.
    pieces_px_int: List[np.ndarray] = []
    if pieces_mm:
        for piece in pieces_mm:
            p_arr = np.asarray(piece, dtype=np.float64)
            if p_arr.ndim != 2 or p_arr.shape[1] != 2 or len(p_arr) < 3:
                continue
            p_px_f = (p_arr - min_xy_mm) * dpi + padding_px
            pieces_px_int.append(p_px_f.astype(np.int32).reshape(-1, 1, 2))

    pts_int = pts_px_f.astype(np.int32).reshape(-1, 1, 2)
    if pieces_px_int:
        for p_int in pieces_px_int:
            cv2.fillPoly(img, [p_int], int(fill))
    else:
        cv2.fillPoly(img, [pts_int], int(fill))

    # Agujeros: pintarlos del color del fondo (sustraen del relleno)
    holes_px_list: List[List[List[float]]] = []
    if holes_mm:
        for h_mm in holes_mm:
            h_arr = np.asarray(h_mm, dtype=np.float64)
            if h_arr.ndim != 2 or h_arr.shape[1] != 2 or len(h_arr) < 3:
                continue
            h_px_f = (h_arr - min_xy_mm) * dpi + padding_px
            h_int = h_px_f.astype(np.int32).reshape(-1, 1, 2)
            cv2.fillPoly(img, [h_int], int(background))
            holes_px_list.append(h_px_f.tolist())

    # Borde del contorno (mejora la robustez de cornerSubPix downstream)
    if stroke_width > 0:
        if pieces_px_int:
            for p_int in pieces_px_int:
                cv2.drawContours(img, [p_int], 0, int(stroke), int(stroke_width))
        else:
            cv2.drawContours(img, [pts_int], 0, int(stroke), int(stroke_width))

    # Convex hull en coordenadas de píxel (sobre los puntos en píxel float)
    hull_px = _convex_hull_xy(pts_px_f)

    # ── Métricas de paridad ──
    # Entrada (referencia): Shoelace sobre los puntos en mm
    # Caso envolvente (pieces_mm): la unión cruda de puntos no es un polígono
    # coherente; la referencia geométrica correcta es el convex hull (en mm).
    if pieces_mm:
        hull_mm = _convex_hull_xy(pts_mm)
        if len(hull_mm) >= 3:
            area_input_mm2 = _polygon_area_shoelace(hull_mm)
            perim_input_mm = _polygon_perimeter(hull_mm, closed=True)
        else:
            area_input_mm2 = _polygon_area_shoelace(pts_mm)
            perim_input_mm = _polygon_perimeter(pts_mm, closed=True)
    else:
        area_input_mm2 = _polygon_area_shoelace(pts_mm)
        perim_input_mm = _polygon_perimeter(pts_mm, closed=True)

    # Medida sobre el raster: contar píxeles de relleno (área) y re-extraer
    # contorno externo (perímetro). Esto valida que la rasterización no
    # degrada el polígono más allá de la tolerancia esperada.
    fill_mask = (img == int(fill)).astype(np.uint8) * 255
    area_raster_px = int(np.count_nonzero(fill_mask))
    area_raster_mm2 = area_raster_px / (dpi * dpi)

    # Cierre morfológico ligero (1 px) para reabsorber el borde del trazo
    # que pinta sobre el relleno y resta área.
    if stroke_width > 0:
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (stroke_width + 2, stroke_width + 2))
        closed = cv2.morphologyEx(fill_mask, cv2.MORPH_CLOSE, kernel)
        area_raster_px = int(np.count_nonzero(closed))
        area_raster_mm2 = area_raster_px / (dpi * dpi)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    else:
        contours, _ = cv2.findContours(fill_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)

    perim_raster_mm = 0.0
    if contours:
        biggest = max(contours, key=cv2.contourArea)
        # cv2.arcLength sobre contornos 8-conectados sobreestima el perímetro
        # por escaleras diagonales (√2 vs 1). Suavizamos con Douglas-Peucker
        # con epsilon ≈ 0.5 px (subpíxel) — mismo enfoque que contour.py.
        epsilon = max(0.5, 0.005 * cv2.arcLength(biggest, True))
        simplified = cv2.approxPolyDP(biggest, epsilon, True)
        perim_raster_px = float(cv2.arcLength(simplified, True))
        perim_raster_mm = perim_raster_px / dpi

    parity_err_area = (
        abs(area_raster_mm2 - area_input_mm2) / area_input_mm2 * 100.0
        if area_input_mm2 > 0 else float("nan")
    )
    parity_err_perim = (
        abs(perim_raster_mm - perim_input_mm) / perim_input_mm * 100.0
        if perim_input_mm > 0 else float("nan")
    )

    # Encode PNG
    ok, buf = cv2.imencode(".png", img)
    if not ok:
        raise RuntimeError("cv2.imencode falló al generar PNG")
    image_bytes = buf.tobytes()

    return {
        "contour_points_px": pts_px_f.tolist(),
        "convex_hull_px": hull_px.tolist(),
        "holes_px": holes_px_list,
        "bbox_px": {
            "minX": int(padding_px),
            "minY": int(padding_px),
            "width": int(width_px - 2 * padding_px),
            "height": int(height_px - 2 * padding_px),
        },
        "image_png_bytes": image_bytes,
        "image_b64": base64.b64encode(image_bytes).decode("ascii"),
        "image_size": {"width": int(width_px), "height": int(height_px)},
        "scale_mm_per_px": float(1.0 / dpi),
        "dpi": float(dpi),
        "padding_px": int(padding_px),
        "area_mm2_input": float(area_input_mm2),
        "perimeter_mm_input": float(perim_input_mm),
        "area_mm2_raster": float(area_raster_mm2),
        "perimeter_mm_raster": float(perim_raster_mm),
        "parity_error_area_pct": float(parity_err_area),
        "parity_error_perimeter_pct": float(parity_err_perim),
    }
