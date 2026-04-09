"""
MAO Plus — Módulo: Detección de objetos y bordes
=================================================
Implementa la lógica de detección siguiendo los mismos algoritmos que el JS:
  - Fondo blanco  (brilloMin ≥ 230): umbral estático por blancos absolutos
  - Fondo no blanco: umbral adaptativo Otsu + análisis de color de fondo
  - Contornos externos con cv2.findContours + filtrado por área mínima

Funciones JS que complementa:
  - detectObjectsAutomatically()          analysis-core.js ~L42072
  - detectarObjetosHibrido()             analysis-core.js ~L16456
  - detectarColorFondoAutomatico()        analysis-core.js ~L15457
"""

import base64
import math
import numpy as np
import cv2
from fastapi import HTTPException

from python.modules.mao_ia_analyzer import _morpho_from_contour

# ── Indicador de implementación (leído por modules/__init__.py) ─────────────
IMPLEMENTED = True


# ── Helpers internos ────────────────────────────────────────────────────────

def _bytes_to_cv(image_bytes: bytes) -> np.ndarray:
    """Convierte bytes de imagen a array OpenCV (BGR)."""
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="No se pudo decodificar la imagen.")
    return img


def _cv_to_bytes(img: np.ndarray, ext: str = ".png") -> bytes:
    """Convierte array OpenCV a bytes PNG/JPEG."""
    success, buffer = cv2.imencode(ext, img)
    if not success:
        raise HTTPException(status_code=500, detail="Error al codificar imagen de salida.")
    return buffer.tobytes()


def _cv_to_base64(img: np.ndarray, ext: str = ".png") -> str:
    """Convierte array OpenCV a string base64 para envío al frontend."""
    return "data:image/png;base64," + base64.b64encode(_cv_to_bytes(img, ext)).decode()


def _detectar_color_fondo(img_bgr: np.ndarray, border_width: int = 10) -> dict:
    """
    Detecta el color promedio del fondo muestreando los bordes de la imagen.
    Equivalente a detectarColorFondoAutomatico() JS (método bordes).
    """
    h, w = img_bgr.shape[:2]
    bw = min(border_width, h // 4, w // 4)

    top    = img_bgr[:bw, :].reshape(-1, 3)
    bottom = img_bgr[h - bw:, :].reshape(-1, 3)
    left   = img_bgr[:, :bw].reshape(-1, 3)
    right  = img_bgr[:, w - bw:].reshape(-1, 3)

    border_pixels = np.vstack([top, bottom, left, right]).astype(np.float32)
    mean = border_pixels.mean(axis=0)   # BGR
    std  = border_pixels.std(axis=0)

    # Convertir a RGB para compatibilidad con JS
    r, g, b = float(mean[2]), float(mean[1]), float(mean[0])
    sr, sg, sb = float(std[2]), float(std[1]), float(std[0])
    brillo_min = min(r, g, b)

    return {
        "r": r, "g": g, "b": b,
        "std_r": sr, "std_g": sg, "std_b": sb,
        "brillo_min": brillo_min,
        "es_fondo_blanco": brillo_min >= 230,
        "es_fondo_cromatico": (
            abs(r - g) > 30 or abs(g - b) > 30 or abs(r - b) > 30
        ),
    }


def _zscan_color_analysis(img_bgr: np.ndarray, cell_size: int = 3) -> dict:
    """
    Análisis de color Z-scan: muestrea el centro y la periferia para obtener
    colorObjeto vs colorFondo y calcular un umbral adaptativo de separación.

    Equivale a analizarRGBDesdeCentro() — analysis-core.js ~L1827

    Fases:
      A — Muestrea anillo periférico (~8% del lado menor) → colorFondo base.
      B — Muestrea parche central 5×5 → colorCentro.
          Si ΔE(centro, borde) < 22 → tienePerforacion = True.
      C — Grid de celdas cell_size² → estadísticas medias por celda.
      D — Bifurcación caso-normal / caso-perforación:
            normal → objeto = centro; BFS radial para separar fondo.
            perforación → buscar anillo con mayor (ΔE_centro × ΔE_borde).
      E — Clasificación competitiva por celda: obj vs fondo.
      F — Análisis del halo (celdas borde adyacentes a objeto) → umbralSugerido.

    Retorna: colorObjeto, colorFondo, umbralSugerido, esCromatico, tienePerforacion.
    """
    # ── Optimización: imágenes grandes se reducen a MAX_DIM para el análisis ─
    # El Z-scan sólo necesita detectar colores dominantes, no resolución completa.
    # Los bucles sobre radios de celdas son O(max_radio²) en Python puro.
    MAX_DIM = 800
    h, w = img_bgr.shape[:2]
    if max(h, w) > MAX_DIM:
        scale = MAX_DIM / max(h, w)
        img_bgr = cv2.resize(img_bgr, (int(w * scale), int(h * scale)),
                             interpolation=cv2.INTER_AREA)
    h, w = img_bgr.shape[:2]
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB).astype(np.float32)

    def _de(r1, g1, b1, r2, g2, b2):
        return math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)

    # ── Fase A: Muestreo de borde periférico ─────────────────────────────────
    border_px = max(4, min(int(min(w, h) * 0.08), 25))
    top    = img_rgb[:border_px, :].reshape(-1, 3)
    bottom = img_rgb[h - border_px:, :].reshape(-1, 3)
    left   = img_rgb[border_px:h - border_px, :border_px].reshape(-1, 3)
    right  = img_rgb[border_px:h - border_px, w - border_px:].reshape(-1, 3)
    border_arr = np.vstack([top, bottom, left, right])
    bb_r = float(np.median(border_arr[:, 0]))
    bb_g = float(np.median(border_arr[:, 1]))
    bb_b = float(np.median(border_arr[:, 2]))

    # ── Fase B: Color del parche central ─────────────────────────────────────
    seed_x, seed_y = w // 2, h // 2
    sr = 2
    center_patch = img_rgb[
        max(0, seed_y - sr): min(h, seed_y + sr + 1),
        max(0, seed_x - sr): min(w, seed_x + sr + 1),
    ].reshape(-1, 3)
    ctr_r = float(np.median(center_patch[:, 0]))
    ctr_g = float(np.median(center_patch[:, 1]))
    ctr_b = float(np.median(center_patch[:, 2]))

    delta_e_centro = _de(ctr_r, ctr_g, ctr_b, bb_r, bb_g, bb_b)

    # Umbral de perforación adaptativo al contraste real de la imagen.
    # En imágenes de bajo contraste el ΔE global es pequeño, por lo que el
    # umbral fijo de 22 (JS) clasifica incorrectamente objetos sólidos como
    # perforados. Se usa: umbral = max(5, min(22, std_global × 1.5))
    global_std = float(np.std(img_rgb))
    umbral_perforacion = max(5.0, min(22.0, global_std * 1.5))
    tiene_perforacion = delta_e_centro < umbral_perforacion

    # ── Fase C: Estadísticas por celda ───────────────────────────────────────
    cells_w = math.ceil(w / cell_size)
    cells_h = math.ceil(h / cell_size)
    pad_h = cells_h * cell_size - h
    pad_w = cells_w * cell_size - w
    padded = np.pad(img_rgb, ((0, pad_h), (0, pad_w), (0, 0)), mode="edge")
    # cell_stats[cy, cx] = [mean_r, mean_g, mean_b]
    cell_stats = padded.reshape(cells_h, cell_size, cells_w, cell_size, 3).mean(axis=(1, 3))

    seed_cx = seed_x // cell_size
    seed_cy = seed_y // cell_size
    max_radio = max(cells_w, cells_h)

    # Distancia de Chebyshev de cada celda al seed (sustituye _ring() Python)
    cy_idx, cx_idx = np.indices((cells_h, cells_w))
    dist_from_seed = np.maximum(np.abs(cx_idx - seed_cx), np.abs(cy_idx - seed_cy))

    # ── Fase D: Bifurcación (vectorizada) ────────────────────────────────────
    if not tiene_perforacion:
        # Caso normal: centro = objeto
        obj_r, obj_g, obj_b = ctr_r, ctr_g, ctr_b

        # ΔE de todas las celdas respecto al color objeto (una sola op. numpy)
        d_cells_obj = np.sqrt(
            (cell_stats[:, :, 0] - obj_r) ** 2 +
            (cell_stats[:, :, 1] - obj_g) ** 2 +
            (cell_stats[:, :, 2] - obj_b) ** 2
        )
        is_fondo_cell = d_cells_obj > 22.0

        radio_fin = max_radio
        for radio in range(1, max_radio):
            ring_mask = dist_from_seed == radio
            n_ring = int(ring_mask.sum())
            if n_ring == 0:
                continue
            n_fondo = int((ring_mask & is_fondo_cell).sum())
            if n_fondo / n_ring >= 0.78 and radio >= 2:
                radio_fin = radio
                break

        # Celdas de fondo: fuera del radio_fin (reemplaza doble loop)
        bg_mask = dist_from_seed > radio_fin
        if bg_mask.sum() >= 4:
            bg_r = float(np.median(cell_stats[bg_mask, 0]))
            bg_g = float(np.median(cell_stats[bg_mask, 1]))
            bg_b = float(np.median(cell_stats[bg_mask, 2]))
        else:
            bg_r, bg_g, bg_b = bb_r, bb_g, bb_b
    else:
        # Caso perforación: buscar anillo con mayor (ΔE_centro × ΔE_borde)
        bg_r, bg_g, bg_b = bb_r, bb_g, bb_b
        best_score = -1.0
        best_rgb = (128.0, 128.0, 128.0)
        for radio in range(1, max_radio):
            ring_mask = dist_from_seed == radio
            if not ring_mask.any():
                continue
            aR = float(cell_stats[ring_mask, 0].mean())
            aG = float(cell_stats[ring_mask, 1].mean())
            aB = float(cell_stats[ring_mask, 2].mean())
            score = _de(aR, aG, aB, ctr_r, ctr_g, ctr_b) * _de(aR, aG, aB, bb_r, bb_g, bb_b)
            if score > best_score:
                best_score = score
                best_rgb = (aR, aG, aB)
        obj_r, obj_g, obj_b = best_rgb

    # ── Fase E: Clasificación competitiva de celdas ───────────────────────────
    r_cells = cell_stats[:, :, 0]
    g_cells = cell_stats[:, :, 1]
    b_cells = cell_stats[:, :, 2]
    d_obj = np.sqrt((r_cells - obj_r) ** 2 + (g_cells - obj_g) ** 2 + (b_cells - obj_b) ** 2)
    d_bg  = np.sqrt((r_cells - bg_r)  ** 2 + (g_cells - bg_g)  ** 2 + (b_cells - bg_b)  ** 2)
    # 1 = objeto, 2 = fondo
    cell_class = np.where(d_obj <= d_bg, np.uint8(1), np.uint8(2))

    # ── Fase F: Halo lumínico → umbralSugerido (vectorizada) ─────────────────
    dist_obj_bg = _de(obj_r, obj_g, obj_b, bg_r, bg_g, bg_b)

    # Detectar halo: celdas fondo (class=2) adyacentes a alguna celda objeto.
    # Dilatamos la máscara de objeto 1 celda (conectividad 8) con cv2.dilate
    # sobre la grilla de celdas — reemplaza el doble loop Python.
    is_obj_grid = (cell_class == 1).astype(np.uint8)
    kernel_1 = np.ones((3, 3), np.uint8)
    obj_dilated = cv2.dilate(is_obj_grid, kernel_1, iterations=1)
    is_halo = (cell_class == 2) & (obj_dilated > 0)

    if is_halo.any():
        h_r = cell_stats[is_halo, 0]
        h_g = cell_stats[is_halo, 1]
        h_b = cell_stats[is_halo, 2]
        halo_deltas_arr = np.sqrt(
            (h_r - obj_r) ** 2 + (h_g - obj_g) ** 2 + (h_b - obj_b) ** 2
        )
        halo_deltas_arr.sort()
        if len(halo_deltas_arr) >= 6:
            idx_p = int(len(halo_deltas_arr) * 0.25)
            umbral_sugerido = max(12.0, min(dist_obj_bg * 0.60,
                                            float(halo_deltas_arr[idx_p]) * 0.85))
        else:
            umbral_sugerido = max(15.0, min(100.0, dist_obj_bg * 0.45))
    else:
        umbral_sugerido = max(15.0, min(100.0, dist_obj_bg * 0.45))

    es_cromatico = (
        abs(bg_r - bg_g) > 30 or abs(bg_g - bg_b) > 30 or abs(bg_r - bg_b) > 30
    )

    return {
        "colorObjeto":     {"r": obj_r, "g": obj_g, "b": obj_b},
        "colorFondo":      {"r": bg_r,  "g": bg_g,  "b": bg_b},
        "umbralSugerido":  umbral_sugerido,
        "esCromatico":     es_cromatico,
        "tienePerforacion": tiene_perforacion,
        "deltaECentro":    delta_e_centro,
        "distObjBg":       dist_obj_bg,
    }


def _aplicar_clahe(img_bgr: np.ndarray, clip_limit: float = 4.0,
                   tile_size: int = 4) -> np.ndarray:
    """
    Amplifica contraste local (CLAHE) en el canal L* de LAB.
    Preserva cromaticidad; no cambia dimensiones ni coordenadas.
    Útil cuando ΔE objeto/fondo < 25 (Z-scan incorrecto sin realce).
    """
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l_ch, a_ch, b_ch = cv2.split(lab)
    clahe_op = cv2.createCLAHE(clipLimit=clip_limit,
                                tileGridSize=(tile_size, tile_size))
    l_eq = clahe_op.apply(l_ch)
    return cv2.cvtColor(cv2.merge([l_eq, a_ch, b_ch]), cv2.COLOR_LAB2BGR)


def _build_binary_mask(img_bgr: np.ndarray, fondo: dict, zscan: "dict | None" = None) -> np.ndarray:
    """
    Crea máscara binaria objeto=1, fondo=0.
    Estrategia 1 (fondo blanco): umbral estático por blancos absolutos — igual JS.
    Estrategia 2 (Z-scan disponible): clasificación competitiva obj vs fondo.
    Estrategia 3 (fallback): umbral Otsu sobre canal de diferencia de color.
    """
    h, w = img_bgr.shape[:2]
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB).astype(np.float32)

    if fondo["es_fondo_blanco"]:
        # Caso 1 JS: blancos absolutos — umbral dinámico
        white_thresh = max(fondo["brillo_min"] - 15, 220)
        r, g, b = img_rgb[:, :, 0], img_rgb[:, :, 1], img_rgb[:, :, 2]
        mask = np.where(
            (r >= white_thresh) & (g >= white_thresh) & (b >= white_thresh),
            np.uint8(0), np.uint8(1)
        )
    elif zscan is not None:
        # Caso Z-scan: clasificación competitiva con margen de confianza
        # Píxeles en zona ambigua (|diff_bg − diff_obj| < margen) se asignan
        # a fondo para evitar falsos positivos en transiciones suaves de color.
        obj = zscan["colorObjeto"]
        bg  = zscan["colorFondo"]
        obj_arr = np.array([obj["r"], obj["g"], obj["b"]], dtype=np.float32)
        bg_arr  = np.array([bg["r"],  bg["g"],  bg["b"]],  dtype=np.float32)
        diff_obj = np.sqrt(((img_rgb - obj_arr) ** 2).sum(axis=2))
        diff_bg  = np.sqrt(((img_rgb - bg_arr)  ** 2).sum(axis=2))
        # Margen adaptativo: 8% de distObjBg (mín. 2 ΔE). Escala con el
        # contraste real de la escena; en alto contraste el margen es amplio,
        # en bajo contraste el mín. de 2 evita colapso de la clasificación.
        dist_obj_bg = float(zscan.get("distObjBg", 0.0))
        margen = max(2.0, dist_obj_bg * 0.08)
        # Pixel = objeto solo si está CLARAMENTE más cerca del color objeto
        mask_u8 = np.where(diff_bg - diff_obj >= margen, np.uint8(255), np.uint8(0))
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        mask_u8 = cv2.morphologyEx(mask_u8, cv2.MORPH_CLOSE, kernel, iterations=1)
        mask_u8 = cv2.morphologyEx(mask_u8, cv2.MORPH_OPEN,  kernel, iterations=1)
        mask = (mask_u8 > 0).astype(np.uint8)
    else:
        # Fallback Caso 2 JS: diferencia de color respecto al fondo + Otsu
        bg = np.array([fondo["r"], fondo["g"], fondo["b"]], dtype=np.float32)
        diff = np.abs(img_rgb - bg).mean(axis=2).astype(np.uint8)
        _, binary = cv2.threshold(diff, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)
        binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN,  kernel, iterations=1)
        mask = (binary > 0).astype(np.uint8)

    return mask


def _grabcut_mask(roi_bgr: np.ndarray, initial_mask_u8=None) -> np.ndarray:
    """
    Segmentación objeto/fondo con GrabCut (Gaussian Mixture Models + graph-cuts).

    Más robusto que el umbral de color cuando el Z-scan falla (fondo heterogéneo,
    objeto que llena casi todo el bbox, bajo contraste cromático).

    initial_mask_u8 : máscara binaria previa (uint8, 0=fondo, 255=objeto).
                      Si se provee → GC_INIT_WITH_MASK (refina la máscara).
                      Si None     → GC_INIT_WITH_RECT (bbox completo −2px).

    Retorna uint8 objeto=1, fondo=0.
    """
    h, w = roi_bgr.shape[:2]
    # GrabCut necesita al menos 20px en cada dimensión para GMM válido
    if h < 20 or w < 20:
        if initial_mask_u8 is not None:
            return (initial_mask_u8 > 0).astype(np.uint8)
        return np.ones((h, w), dtype=np.uint8)

    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)

    if initial_mask_u8 is not None:
        # Convertir binaria a etiquetas GrabCut:
        # objeto probable (GC_PR_FGD=3) y fondo probable (GC_PR_BGD=2)
        gc_mask = np.where(initial_mask_u8 > 0,
                           np.uint8(cv2.GC_PR_FGD),
                           np.uint8(cv2.GC_PR_BGD))
        try:
            cv2.grabCut(roi_bgr, gc_mask, (0, 0, w, h),
                        bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_MASK)
        except cv2.error:
            return (initial_mask_u8 > 0).astype(np.uint8)
    else:
        gc_mask = np.zeros((h, w), dtype=np.uint8)
        margin = max(2, int(min(h, w) * 0.01))
        rect = (margin, margin, w - 2 * margin, h - 2 * margin)
        try:
            cv2.grabCut(roi_bgr, gc_mask, rect,
                        bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)
        except cv2.error:
            return np.ones((h, w), dtype=np.uint8)

    # GC_FGD(1) y GC_PR_FGD(3) = objeto; GC_BGD(0) y GC_PR_BGD(2) = fondo
    mask = np.where(
        (gc_mask == cv2.GC_BGD) | (gc_mask == cv2.GC_PR_BGD),
        np.uint8(0), np.uint8(1)
    )
    return mask


def _excluir_franja_borde(mask: np.ndarray) -> np.ndarray:
    """Elimina artefactos de viñeteo en los bordes — igual que JS (0.5% del lado menor)."""
    h, w = mask.shape
    strip = max(3, int(min(h, w) * 0.005))
    mask[:strip, :] = 0
    mask[h - strip:, :] = 0
    mask[:, :strip] = 0
    mask[:, w - strip:] = 0
    return mask


# ── Detección de objetos ─────────────────────────────────────────────────────

async def detect(
    image_bytes: bytes,
    threshold: float = 0.5,
    min_area: int = 1000,
    max_objects: int = 50,
) -> dict:
    """
    Detecta objetos en la imagen usando OpenCV.

    Sigue la misma lógica de 3 estrategias que detectarObjetosHibrido() JS:
      - Fondo blanco (brillo ≥ 230): umbral estático por blancos absolutos
      - Fondo no blanco: diferencia de color respecto al fondo + Otsu
      - Filtrado por componentes conectados con área mínima

    Retorno:
      {
        "objects": [
          {
            "id": "OBJ_01",
            "bbox": {"x": int, "y": int, "w": int, "h": int},
            "area": int,
            "centroid": [cx, cy],
            "has_real_contour": false,
            "contour_pending": true,
            "detectionMethod": "python_automatic",
            "tight_width": int,
            "tight_height": int,
            "aspect_ratio": float
          }, ...
        ],
        "count": int,
        "method_used": str,
        "background": {...},
        "stats": {...}
      }
    """
    img = _bytes_to_cv(image_bytes)
    h, w = img.shape[:2]

    # 1. Detectar color de fondo (muestreo de bordes)
    fondo = _detectar_color_fondo(img)

    # 2. Z-scan para fondo no blanco: mejora la separación objeto/fondo
    zscan = None
    img_for_mask = img
    if not fondo["es_fondo_blanco"]:
        try:
            zscan = _zscan_color_analysis(img)
            fondo["r"] = zscan["colorFondo"]["r"]
            fondo["g"] = zscan["colorFondo"]["g"]
            fondo["b"] = zscan["colorFondo"]["b"]
            fondo["es_fondo_cromatico"] = zscan["esCromatico"]

            # Bajo contraste (distObjBg < 25): CLAHE siempre para mejorar
            # la máscara y reducir falsas perforaciones, aunque el ΔE final
            # no cambie en imágenes sintéticas sin textura.
            if zscan.get("distObjBg", 999.0) < 25.0:
                img_enhanced = _aplicar_clahe(img)
                try:
                    zscan_enh = _zscan_color_analysis(img_enhanced)
                    if zscan_enh.get("distObjBg", 0.0) >= zscan.get("distObjBg", 0.0):
                        zscan = zscan_enh
                        fondo["es_fondo_cromatico"] = zscan["esCromatico"]
                except Exception:
                    pass
                img_for_mask = img_enhanced  # siempre usar imagen realzada
        except Exception:
            zscan = None

    # 3. Construir máscara binaria (sobre imagen posiblemente realzada)
    mask = _build_binary_mask(img_for_mask, fondo, zscan)

    # 4. Excluir franja de borde (artefactos)
    mask = _excluir_franja_borde(mask)

    # 5. Operaciones morfológicas adicionales según tipo de fondo (igual JS)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    iters = 2 if fondo["es_fondo_cromatico"] else 1
    mask_uint8 = (mask * 255).astype(np.uint8)
    mask_uint8 = cv2.morphologyEx(mask_uint8, cv2.MORPH_CLOSE, kernel, iterations=iters)
    mask_uint8 = cv2.morphologyEx(mask_uint8, cv2.MORPH_OPEN,  kernel, iterations=iters)

    # 6. Encontrar componentes conectados
    num_labels, labels, stats_cv, centroids = cv2.connectedComponentsWithStats(
        mask_uint8, connectivity=8
    )

    # 7. Filtrar objetos: omitir etiqueta 0 (fondo), aplicar área mínima
    objects = []
    for i in range(1, num_labels):
        area = int(stats_cv[i, cv2.CC_STAT_AREA])
        if area < min_area:
            continue

        x = int(stats_cv[i, cv2.CC_STAT_LEFT])
        y = int(stats_cv[i, cv2.CC_STAT_TOP])
        bw = int(stats_cv[i, cv2.CC_STAT_WIDTH])
        bh = int(stats_cv[i, cv2.CC_STAT_HEIGHT])
        cx, cy = float(centroids[i][0]), float(centroids[i][1])

        objects.append({
            "id": None,          # se asigna abajo con índice final
            "bbox": {"x": x, "y": y, "w": bw, "h": bh},
            "minX": x, "minY": y,
            "width": bw, "height": bh,
            "area": area,
            "centroid": [round(cx, 1), round(cy, 1)],
            "has_real_contour": False,
            "contour_pending": True,
            "detectionMethod": "python_automatic",
            "tight_width": bw,
            "tight_height": bh,
            "aspect_ratio": round(bw / bh, 3) if bh > 0 else 1.0,
            "area_pixels": area,
        })

    # Ordenar por área descendente; filtrar dominancia (≥20% del mayor — igual JS)
    objects.sort(key=lambda o: o["area"], reverse=True)
    if len(objects) > 1:
        max_area = objects[0]["area"]
        objects = [o for o in objects if o["area"] >= max_area * 0.20]

    # Re-ordenar por relevancia arqueológica:
    # El artefacto de interés suele estar CENTRADO en la imagen.
    # Las referencias (carta de colores, escala métrica) se colocan en
    # esquinas o bordes → mayor distancia al centro.
    #
    # Criterios por prioridad (menor = mejor):
    #   0. Objeto en esquina + compacto (elong≤2, centroid >50% de semi-diag)
    #      → carta de colores cuadrada → penalizado
    #   1. Objeto en borde + muy elongado (elong>4, centroid >40% semi-diag)
    #      → escala métrica → penalizado
    #   2. Resto → ordenar por centralidad, luego area
    if len(objects) > 1:
        cx_img, cy_img = w / 2.0, h / 2.0
        semi_diag = math.sqrt(cx_img ** 2 + cy_img ** 2)

        def _priority_key(o):
            ocx, ocy = o["centroid"]
            dist_norm = math.sqrt((ocx - cx_img) ** 2 + (ocy - cy_img) ** 2) / semi_diag
            ar = o.get("aspect_ratio", 1.0)
            elong = max(ar, 1.0 / ar) if ar > 0 else 1.0
            # Carta de colores: compacta (elong≤2) Y en zona periférica
            if dist_norm > 0.50 and elong <= 2.0:
                tier = 2
            # Escala métrica: muy elongada Y en zona periférica
            elif dist_norm > 0.40 and elong > 4.0:
                tier = 1
            else:
                tier = 0
            return (tier, dist_norm, -o["area"])

        objects.sort(key=_priority_key)

    # Limitar y asignar IDs
    objects = objects[:max_objects]
    for idx, obj in enumerate(objects):
        obj["id"] = f"PY_{idx + 1:02d}"

    # ── Enriquecimiento MAO_IA: descriptores morfológicos rápidos por objeto ──
    # Se calculan sobre la máscara binaria (ya disponible), sin re-detectar.
    # Aporta: circularity, solidity, equivalent_diameter, extent.
    # No sustituye el análisis completo de contour.py + metrics.py.
    try:
        contours_all, _ = cv2.findContours(
            mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        # Mapear componente → contorno por centroide más cercano
        for obj in objects:
            ocx, ocy = obj["centroid"]
            best_cnt = None
            best_dist = float("inf")
            for cnt in contours_all:
                carea = cv2.contourArea(cnt)
                if carea < min_area * 0.5:
                    continue
                M = cv2.moments(cnt)
                if M["m00"] <= 0:
                    continue
                ccx = M["m10"] / M["m00"]
                ccy = M["m01"] / M["m00"]
                d = math.sqrt((ccx - ocx) ** 2 + (ccy - ocy) ** 2)
                if d < best_dist:
                    best_dist = d
                    best_cnt = cnt
            if best_cnt is not None and best_dist < max(obj.get("width", 50), 50):
                idx_obj = int(obj["id"].split("_")[1]) - 1
                morph = _morpho_from_contour(best_cnt, idx_obj)
                obj["mao_ia"] = {
                    "circularity":         morph["circularity"],
                    "solidity":            morph["solidity"],
                    "equivalent_diameter": morph["equivalent_diameter"],
                    "extent":              morph["extent"],
                    "aspect_ratio":        morph["aspect_ratio"],
                    "convexity_defects":   morph["convexity_defects"],
                }
    except Exception:
        pass   # fallback: los objetos se devuelven sin mao_ia

    used_clahe = img_for_mask is not img
    method = (
        "python_white_absolute"        if fondo["es_fondo_blanco"]
        else "python_zscan_lc_clahe"    if (zscan is not None and used_clahe)
        else "python_zscan_competitive" if zscan is not None
        else "python_adaptive_color"
    )

    result = {
        "status": "ok",
        "objects": objects,
        "count": len(objects),
        "method_used": method,
        "background": {
            "r": round(fondo["r"], 1),
            "g": round(fondo["g"], 1),
            "b": round(fondo["b"], 1),
            "brillo_min": round(fondo["brillo_min"], 1),
            "es_fondo_blanco": fondo["es_fondo_blanco"],
            "es_fondo_cromatico": fondo["es_fondo_cromatico"],
        },
        "stats": {
            "image_size": [w, h],
            "total_components": num_labels - 1,
            "filtered_by_area": (num_labels - 1) - len(objects),
            "min_area_threshold": min_area,
        },
    }
    if zscan is not None:
        result["zscan"] = {
            "colorObjeto":     zscan["colorObjeto"],
            "colorFondo":      zscan["colorFondo"],
            "umbralSugerido":  round(zscan["umbralSugerido"], 2),
            "esCromatico":     zscan["esCromatico"],
            "tienePerforacion": zscan["tienePerforacion"],
        }
    return result


async def edges(
    image_bytes: bytes,
    method: str = "sobel",
    threshold1: float = 50.0,
    threshold2: float = 150.0,
    sigma: float = 1.0,
) -> dict:
    """
    Detección de bordes.
    Modo 'sobel' (equivale a calcularGradientesSobel() JS).
    Modo 'canny' disponible como alternativa.
    """
    img = _bytes_to_cv(image_bytes)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    if method == "sobel":
        sx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        sy = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        mag = cv2.magnitude(sx, sy)
        dst = np.zeros_like(mag, dtype=np.uint8)
        mag_norm = cv2.normalize(mag, dst, 0, 255, cv2.NORM_MINMAX)
        edges_img = mag_norm.astype(np.uint8)
    else:
        blurred = cv2.GaussianBlur(gray, (0, 0), sigma)
        edges_img = cv2.Canny(blurred, threshold1, threshold2)

    return {
        "status": "ok",
        "method": method,
        "edges_base64": _cv_to_base64(edges_img),
    }


async def color(
    image_bytes: bytes,
    mask_bytes: "bytes | None" = None,
    color_space: str = "rgb",
) -> dict:
    """
    Análisis de color: estadísticas RGB + LAB + colores dominantes (K-Means k=5).
    Acepta máscara opcional (solo analizar píxeles del objeto).
    """
    img = _bytes_to_cv(image_bytes)
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32)
    img_lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)

    if mask_bytes is not None:
        mask_img = _bytes_to_cv(mask_bytes)
        gray_mask = cv2.cvtColor(mask_img, cv2.COLOR_BGR2GRAY)
        mask_bool = gray_mask > 127
    else:
        mask_bool = np.ones(img.shape[:2], dtype=bool)

    pixels_rgb = img_rgb[mask_bool]
    pixels_lab = img_lab[mask_bool]

    if len(pixels_rgb) == 0:
        return {"status": "error", "message": "Máscara sin píxeles válidos"}

    mean_rgb = pixels_rgb.mean(axis=0).tolist()
    mean_lab = pixels_lab.mean(axis=0).tolist()

    # K-Means colores dominantes
    k = min(5, len(pixels_rgb))
    pixels_f32 = pixels_rgb.astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    best_labels = np.zeros((len(pixels_f32), 1), dtype=np.int32)
    _, labels, centers = cv2.kmeans(
        pixels_f32, k, best_labels, criteria, 5, cv2.KMEANS_RANDOM_CENTERS
    )
    counts = np.bincount(labels.flatten(), minlength=k)
    total = counts.sum()
    dominant = [
        {
            "rgb": [round(float(c[0])), round(float(c[1])), round(float(c[2]))],
            "proportion": round(float(counts[i]) / total, 3),
        }
        for i, c in enumerate(centers)
    ]
    dominant.sort(key=lambda d: d["proportion"], reverse=True)

    fondo = _detectar_color_fondo(img)

    return {
        "status": "ok",
        "mean_rgb": [round(v, 1) for v in mean_rgb],
        "mean_lab": [round(v, 2) for v in mean_lab],
        "dominant_colors": dominant,
        "background_color": {
            "r": round(fondo["r"], 1),
            "g": round(fondo["g"], 1),
            "b": round(fondo["b"], 1),
        },
    }
