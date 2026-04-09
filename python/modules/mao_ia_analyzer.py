"""
mao_ia_analyzer.py
==================
Adaptación de MorphologicalAnalyzer (MAO_IA) para el servidor FastAPI de MAO Plus.

Diferencias respecto a morphological_analyzer.py (standalone):
  - Sin dependencias matplotlib/pyplot (servidor headless).
  - Retorna dicts directamente; no genera imágenes anotadas.
  - Expone compute_morpho_features() para enriquecer objetos ya detectados
    (usar con los bounding box que devuelve detection.py).
  - Expone convexity_defects_from_contour() para ser llamado desde metrics.py.

Funciones JS que complementa (lo que no cubren detection.py / metrics.py):
  - Descriptores rápidos por objeto sin extracción completa de contorno:
      circularity, solidity, equivalent_diameter, extent, aspect_ratio.
  - Defectos de convexidad: num_defectos, profundidad_max, profundidades.
"""

from __future__ import annotations

import math
from typing import List, Optional, Tuple

import cv2
import numpy as np

# ── Indicador de implementación (leído por modules/__init__.py) ──────────────
IMPLEMENTED = True

# ── Constante ────────────────────────────────────────────────────────────────
_MIN_CONTOUR_PX = 4   # mínimo para cv2.convexityDefects


# ============================================================================
# HELPERS INTERNOS
# ============================================================================

def _clahe_gray(gray: np.ndarray, clip_limit: float = 2.0, tile: int = 8) -> np.ndarray:
    """CLAHE sobre imagen en escala de grises (para bajo contraste)."""
    op = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(tile, tile))
    return op.apply(gray)


def _binary_mask(gray: np.ndarray, method: str, value: int, invert: bool) -> np.ndarray:
    """
    Umbralización → binaria limpia.
    method: 'otsu' | 'adaptive' | 'manual'
    """
    flag_bin = cv2.THRESH_BINARY_INV if invert else cv2.THRESH_BINARY

    if method == "otsu":
        _, binary = cv2.threshold(gray, 0, 255, flag_bin + cv2.THRESH_OTSU)
    elif method == "adaptive":
        binary = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            flag_bin, blockSize=11, C=2,
        )
    else:  # manual
        _, binary = cv2.threshold(gray, value, 255, flag_bin)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN,  kernel, iterations=1)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)
    return binary


def _morpho_from_contour(contour: np.ndarray, object_id: int) -> dict:
    """
    Calcula descriptores morfológicos básicos de MAO_IA a partir de un contorno OpenCV.
    No requiere imagen — solo el array (N,1,2) del contorno.
    """
    area      = float(cv2.contourArea(contour))
    perimeter = float(cv2.arcLength(contour, closed=True))

    # Centroide
    M = cv2.moments(contour)
    if M["m00"] > 0:
        cx = M["m10"] / M["m00"]
        cy = M["m01"] / M["m00"]
    else:
        pts = contour.reshape(-1, 2)
        cx, cy = float(pts[:, 0].mean()), float(pts[:, 1].mean())

    x, y, w, h = cv2.boundingRect(contour)

    # Circularity ≤ 1.0 (1.0 = círculo perfecto)
    circularity = min((4 * math.pi * area / (perimeter ** 2)) if perimeter > 0 else 0.0, 1.0)

    # Aspect ratio del bounding box
    aspect_ratio = round(w / h, 4) if h > 0 else 0.0

    # Extent: fracción del bbox cubierta por el contorno
    extent = round(area / (w * h), 4) if (w * h) > 0 else 0.0

    # Convex hull → solidity + puntos del polígono convexo
    hull   = cv2.convexHull(contour)
    hull_a = float(cv2.contourArea(hull))
    solidity = round(area / hull_a, 4) if hull_a > 0 else 0.0

    # Diámetro equivalente
    eq_diam = round(math.sqrt(4 * area / math.pi), 2)

    # Defectos de convexidad
    defects_info = _convexity_defects_raw(contour)

    # Contorno real simplificado → [[x,y], ...]  (Douglas-Peucker ε=1.5 px)
    approx = cv2.approxPolyDP(contour, epsilon=1.5, closed=True)
    contour_pts = approx.reshape(-1, 2).tolist()

    # Convex hull sobre el contorno simplificado → [[x,y], ...]
    hull_of_approx = cv2.convexHull(approx)
    hull_pts = hull_of_approx.reshape(-1, 2).tolist()

    # Centroide del convex hull
    hm = cv2.moments(hull_of_approx)
    if hm["m00"] != 0:
        hull_cx = round(hm["m10"] / hm["m00"], 2)
        hull_cy = round(hm["m01"] / hm["m00"], 2)
    else:
        hull_cx, hull_cy = round(cx, 2), round(cy, 2)

    return {
        "object_id":           object_id,
        "area":                round(area, 2),
        "perimeter":           round(perimeter, 2),
        "centroid_x":          round(cx, 2),
        "centroid_y":          round(cy, 2),
        "hull_centroid_x":     hull_cx,
        "hull_centroid_y":     hull_cy,
        "bbox_x": x, "bbox_y": y, "bbox_w": w, "bbox_h": h,
        "circularity":         round(circularity, 4),
        "aspect_ratio":        aspect_ratio,
        "extent":              extent,
        "solidity":            solidity,
        "equivalent_diameter": eq_diam,
        "convexity_defects":   defects_info,
        "contour_points":      contour_pts,   # contorno real simplificado
        "hull_points":         hull_pts,       # convex hull como polígono
    }


# ============================================================================
# FUNCIÓN PÚBLICA 1: defectos de convexidad desde un contorno existente
# ============================================================================

def _convexity_defects_raw(contour: np.ndarray, min_depth_px: float = 5.0) -> dict:
    """
    Calcula defectos de convexidad vía cv2.convexityDefects().

    Parámetros
    ----------
    contour : ndarray (N,1,2) int32
    min_depth_px : profundidad mínima en px para considerar un defecto.

    Retorna
    -------
    {
        "num_defectos": int,
        "profundidad_max_px": float,
        "profundidad_media_px": float,
        "defectos": [{"profundidad_px": float, "punto_far": [x, y]}, ...]
    }
    """
    _empty = {
        "num_defectos": 0,
        "profundidad_max_px": 0.0,
        "profundidad_media_px": 0.0,
        "defectos": [],
    }

    cnt = contour.reshape(-1, 1, 2)
    if len(cnt) < _MIN_CONTOUR_PX:
        return _empty

    # Asegurar int32 para la función nativa
    cnt_i32 = cnt.astype(np.int32)
    try:
        hull_idx = cv2.convexHull(cnt_i32, returnPoints=False)
        if hull_idx is None or len(hull_idx) < 3:
            return _empty
        defects = cv2.convexityDefects(cnt_i32, hull_idx)
    except cv2.error:
        return _empty

    if defects is None:
        return _empty

    defect_list = []
    pts_flat = cnt_i32.reshape(-1, 2)
    n_cnt = len(pts_flat)
    for d in defects:
        s_idx, e_idx, f_idx, depth_256 = d[0]
        depth = depth_256 / 256.0   # OpenCV almacena depth × 256
        if depth >= min_depth_px:
            far_pt = pts_flat[f_idx].tolist()
            # Longitud de arco cóncavo: suma de segmentos s_idx → e_idx en el contorno
            arc_px = 0.0
            idx = int(s_idx)
            end = int(e_idx)
            for _ in range(n_cnt + 1):
                j = (idx + 1) % n_cnt
                p1 = pts_flat[idx].astype(float)
                p2 = pts_flat[j].astype(float)
                arc_px += math.hypot(p2[0] - p1[0], p2[1] - p1[1])
                if idx == end:
                    break
                idx = j
            defect_list.append({
                "profundidad_px": round(depth, 2),
                "punto_far":      far_pt,
                "arco_px":        round(arc_px, 2),
            })

    profundidades = [d["profundidad_px"] for d in defect_list]
    arcos = [d["arco_px"] for d in defect_list]
    return {
        "num_defectos":           len(defect_list),
        "profundidad_max_px":     round(max(profundidades), 2) if profundidades else 0.0,
        "profundidad_media_px":   round(
            sum(profundidades) / len(profundidades), 2
        ) if profundidades else 0.0,
        "arco_concavo_total_px":  round(sum(arcos), 2),
        "defectos":               defect_list,
    }


def convexity_defects_from_contour(
    contour_points: list,
    min_depth_px: float = 5.0,
) -> dict:
    """
    Interfaz pública para metrics.py / server.py.

    contour_points : [[x,y], ...] o [{"x":…,"y":…}, ...]
    """
    pts = []
    for p in contour_points:
        if isinstance(p, dict):
            pts.append([int(p["x"]), int(p["y"])])
        else:
            pts.append([int(p[0]), int(p[1])])

    cnt = np.array(pts, dtype=np.int32).reshape(-1, 1, 2)
    return _convexity_defects_raw(cnt, min_depth_px=min_depth_px)


# ============================================================================
# FUNCIÓN PÚBLICA 2: análisis rápido de una ROI (bounding-box crop)
# ============================================================================

def compute_morpho_features(
    roi_bgr: np.ndarray,
    object_id: int = 0,
    threshold_method: str = "otsu",
    threshold_value: int = 127,
    min_area: float = 50.0,
    invert: bool = False,
    use_clahe: bool = False,
    clahe_clip: float = 2.0,
    clahe_tile: int = 8,
    blur_kernel: int = 5,
) -> Optional[dict]:
    """
    Ejecuta el pipeline MAO_IA sobre una ROI BGR y retorna los descriptores
    morfológicos del objeto principal detectado, o None si no hay objeto.

    Pensado para enriquecer los objetos detectados por detection.py sin
    necesidad de re-ejecutar el pipeline completo de MAO_plus_d.

    Parámetros
    ----------
    roi_bgr : ndarray BGR recortado alrededor del objeto (producto de detection.py)
    object_id : ID a asignar al resultado

    Retorna
    -------
    dict con los campos de _morpho_from_contour(), o None si el análisis falla.
    """
    if roi_bgr is None or roi_bgr.size == 0:
        return None

    # Preprocesamiento
    gray = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2GRAY)
    if use_clahe:
        gray = _clahe_gray(gray, clip_limit=clahe_clip, tile=clahe_tile)
    if blur_kernel > 1:
        kk = blur_kernel if blur_kernel % 2 == 1 else blur_kernel + 1
        gray = cv2.GaussianBlur(gray, (kk, kk), 0)

    binary = _binary_mask(gray, threshold_method, threshold_value, invert)

    # Contornos externos
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = [c for c in contours if cv2.contourArea(c) >= min_area]

    if not contours:
        return None

    # Objeto principal = mayor área
    main = max(contours, key=cv2.contourArea)
    return _morpho_from_contour(main, object_id)


# ============================================================================
# FUNCIÓN PÚBLICA 3: detección completa MAO_IA sobre imagen entera
# ============================================================================

async def detect_with_mao_ia(
    image_bytes: bytes,
    threshold_method: str = "otsu",
    threshold_value: int = 127,
    min_area: float = 200.0,
    blur_kernel: int = 5,
    invert: bool = False,
    use_clahe: bool = False,
    clahe_clip: float = 2.0,
    clahe_tile: int = 8,
    max_objects: int = 50,
) -> dict:
    """
    Ejecuta el pipeline completo MAO_IA sobre una imagen completa.

    Equivale a MorphologicalAnalyzer.analyze() del app standalone,
    pero retorna dicts sin generar imágenes anotadas.

    Parámetros
    ----------
    image_bytes      : bytes crudos de la imagen (JPEG / PNG / etc.)
    threshold_method : 'otsu' | 'adaptive' | 'manual'
    threshold_value  : umbral manual (0-255); ignorado en otsu/adaptive
    min_area         : área mínima en px² para considerar un objeto
    blur_kernel      : tamaño del kernel Gaussiano (impar, ≥1)
    invert           : invertir la binarización (fondo oscuro)
    use_clahe        : aplicar CLAHE antes del blur
    clahe_clip       : clip limit de CLAHE (0.5 – 8)
    clahe_tile       : tamaño de tile de CLAHE en px (2 – 32)
    max_objects      : límite de objetos a devolver

    Retorna
    -------
    {
        "status": "ok" | "error",
        "objects": [ {morpho features + bbox} ],
        "count": int,
        "params_used": { ... },
        "message": str (solo en error)
    }
    """
    import numpy as np_inner  # alias para evitar colisión de nombres

    # ── Decodificar imagen ────────────────────────────────────────────────────
    arr = np_inner.frombuffer(image_bytes, np_inner.uint8)
    img_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        return {"status": "error", "message": "No se pudo decodificar la imagen.",
                "objects": [], "count": 0}

    h, w = img_bgr.shape[:2]

    # ── Preprocesamiento ──────────────────────────────────────────────────────
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    if use_clahe:
        gray = _clahe_gray(gray, clip_limit=clahe_clip, tile=clahe_tile)

    if blur_kernel > 1:
        kk = blur_kernel if blur_kernel % 2 == 1 else blur_kernel + 1
        gray = cv2.GaussianBlur(gray, (kk, kk), 0)

    binary = _binary_mask(gray, threshold_method, threshold_value, invert)

    # ── Detección de contornos ────────────────────────────────────────────────
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = [c for c in contours if cv2.contourArea(c) >= min_area]

    if not contours:
        return {
            "status": "ok",
            "objects": [],
            "count": 0,
            "image_size": [w, h],
            "params_used": {
                "threshold_method": threshold_method,
                "threshold_value": threshold_value,
                "min_area": min_area,
                "blur_kernel": blur_kernel,
                "invert": invert,
                "use_clahe": use_clahe,
                "clahe_clip": clahe_clip,
                "clahe_tile": clahe_tile,
            },
        }

    # ── Ordenar por área (mayor primero) y limitar ────────────────────────────
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:max_objects]

    # ── Import perezoso para evitar dependencia circular ─────────────────────
    # metrics.py importa convexity_defects_from_contour() de este mismo módulo,
    # por lo que no se puede importar a nivel de módulo sin crear un ciclo.
    from python.modules import metrics as _metrics_mod  # noqa: PLC0415
    import asyncio as _asyncio  # noqa: PLC0415

    # ── Pre-decodificar imagen UNA SOLA VEZ para todos los objetos ───────────
    # Sin esto, _textura_superficie() decodificaba el JPEG N veces (una por objeto),
    # que es la principal causa de lentitud cuando hay múltiples objetos detectados.
    _img_bgr_shared = cv2.imdecode(
        np_inner.frombuffer(image_bytes, np_inner.uint8), cv2.IMREAD_COLOR
    )

    # ── Calcular descriptores por objeto (en paralelo vía asyncio.gather) ────
    async def _calc_obj(idx: int, cnt: np.ndarray) -> dict:
        obj_id = idx + 1
        feat = _morpho_from_contour(cnt, obj_id)
        feat["label"] = f"MAO_{obj_id:02d}"

        # Contorno crudo (sin approxPolyDP) → metrics.py aplica su propia simplificación
        raw_pts = cnt.reshape(-1, 2).tolist()
        # Preservar arrays de puntos: metrics.calculate() sobreescribe
        # "contour_points" con el conteo (int).
        _saved_contour_pts = feat.get("contour_points")
        _saved_hull_pts    = feat.get("hull_points")
        try:
            mres = await _metrics_mod.calculate(
                image_bytes=image_bytes,
                contour_points=raw_pts,
                scale_px_mm=0.0,
                img_bgr=_img_bgr_shared,   # ← imagen pre-decodificada compartida
            )
            feat.update(mres.get("metricas", {}))
        except Exception as _me:
            feat["_metrics_error"] = str(_me)
        # Restaurar arrays de puntos
        if _saved_contour_pts is not None:
            feat["contour_points"] = _saved_contour_pts
        if _saved_hull_pts is not None:
            feat["hull_points"] = _saved_hull_pts
        return feat

    objects = list(await _asyncio.gather(
        *[_calc_obj(i, c) for i, c in enumerate(contours)]
    ))

    return {
        "status": "ok",
        "objects": objects,
        "count": len(objects),
        "image_size": [w, h],
        "params_used": {
            "threshold_method": threshold_method,
            "threshold_value": threshold_value,
            "min_area": min_area,
            "blur_kernel": blur_kernel,
            "invert": invert,
            "use_clahe": use_clahe,
            "clahe_clip": clahe_clip,
            "clahe_tile": clahe_tile,
        },
    }
