"""
MAO Plus — Módulo: Extracción de contorno
==========================================
Implementa la misma pipeline que extraerContornoReal() JS:

  1. Detectar color de fondo (bordes de la imagen)
  2. Construir máscara binaria (blancos absolutos o adaptativo Otsu)
  3. Operaciones morfológicas: cierre + apertura (igual que suavizarMascaraMorfologica JS)
  4. Extraer contorno externo con cv2.findContours(CHAIN_APPROX_NONE)
     → equivale a extraerContornoDesdeMascara() JS
  5. Refinamiento sub-píxel opcional con cv2.cornerSubPix
     → equivale a refinarContornoSubPixel() JS pero más preciso (nativo C++)
  6. Simplificación Douglas-Peucker con cv2.approxPolyDP
     → equivale a simplificarContornoInteligente() JS
  7. Validación geométrica con Shapely

Funciones JS que complementa:
  - extraerContornoReal()              analysis-core.js ~L2474
  - extraerContornoDesdeMascara()      analysis-core.js ~L17179
  - refinarContornoSubPixel()          analysis-core.js ~L16917
  - simplificarContornoInteligente()   analysis-core.js ~L18900
  - refinarContornoGradiente()         analysis-core.js ~L3440
"""

import math
import numpy as np
import cv2
from shapely.geometry import Polygon
from fastapi import HTTPException

from python.modules.detection import (
    _bytes_to_cv, _detectar_color_fondo, _build_binary_mask,
    _zscan_color_analysis, _aplicar_clahe, _grabcut_mask,
    _confianza_objeto,
)

IMPLEMENTED = True


# ── Helpers de geometría ──────────────────────────────────────────────────────

def _area_poligono(pts: np.ndarray) -> float:
    """Área por fórmula de Shoelace (mismo método que el JS)."""
    if len(pts) < 3:
        return 0.0
    x = pts[:, 0].astype(np.float64)
    y = pts[:, 1].astype(np.float64)
    return 0.5 * abs(np.dot(x, np.roll(y, -1)) - np.dot(np.roll(x, -1), y))


def _perimetro(pts: np.ndarray) -> float:
    """Perímetro euclídeo del contorno (puntos consecutivos)."""
    if len(pts) < 2:
        return 0.0
    diffs = np.diff(pts, axis=0).astype(np.float64)
    return float(np.sum(np.sqrt((diffs ** 2).sum(axis=1))))


def _tight_bbox(pts: np.ndarray) -> dict:
    """Bounding box ajustado al contorno (no al ROI)."""
    min_x, min_y = int(pts[:, 0].min()), int(pts[:, 1].min())
    max_x, max_y = int(pts[:, 0].max()), int(pts[:, 1].max())
    return {
        "minX": min_x, "minY": min_y,
        "maxX": max_x, "maxY": max_y,
        "width": max_x - min_x,
        "height": max_y - min_y,
        "area": (max_x - min_x) * (max_y - min_y),
    }


def _refinar_contorno_gradiente(pts: np.ndarray, roi_img: np.ndarray,
                                mask_u8=None) -> np.ndarray:
    """
    Gradient snap: desplaza cada punto del contorno hacia el máximo gradiente
    local a lo largo de la dirección normal al contorno.

    Equivale a refinarContornoGradiente() — analysis-core.js ~L3463

    Algoritmo:
      1. Calcula el mapa |∇I| Sobel en escala de grises sobre toda la ROI.
      2. Para cada punto P[i]:
         a. Tangente ≈ (P[i+1] − P[i−1]) / 2
         b. Normal exterior = tangente rotada +90°
         c. Muestrea |∇I| en t ∈ [−6, +6] px (pasos 0.5 px) con interpolación bilineal
         d. P[i] ← argmax |∇I|  si el gradiente máximo ≥ MIN_GRAD = 8
            y el punto resultante sigue dentro del objeto (mask_u8 > 0).
      3. Suavizado geométrico final: media ponderada (0.25, 0.5, 0.25) × 1 iteración

    mask_u8 : máscara objeto=255, fondo=0 (misma que se pasa a findContours).
              Si se provee, los snaps que caigan en fondo son descartados para
              evitar que gradientes de textura interna o de borde de fondo
              desplacen puntos fuera del objeto real.
    """
    SNAP_RANGE  = 6
    MIN_GRAD    = 8
    SMOOTH_ITER = 1

    h, w = roi_img.shape[:2]
    gray_u8 = cv2.cvtColor(roi_img, cv2.COLOR_BGR2GRAY)

    # Bajo contraste auto-detectado: rango P10–P90 < 30 → CLAHE antes de Sobel
    p_range = float(np.percentile(gray_u8, 90)) - float(np.percentile(gray_u8, 10))
    if p_range < 30.0:
        clahe_snap = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(4, 4))
        gray_u8 = clahe_snap.apply(gray_u8)

    gray = gray_u8.astype(np.float32)

    # Mapa de gradiente Sobel (BT.601 equiv. en escala de grises — mismo que JS)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    grad = np.sqrt(gx ** 2 + gy ** 2)

    # MIN_GRAD adaptativo: P10 de gradientes válidos (se ajusta al rango real)
    # En bajo contraste el gradiente máximo es pequeño; el fijo de 8 rechazaría todo.
    valid_grads = grad[grad > 1.0].flatten()
    effective_min_grad = (
        max(2.0, float(np.percentile(valid_grads, 10)))
        if len(valid_grads) > 200
        else float(MIN_GRAD)
    )

    def _grad_bilineal(fx, fy):
        """Interpolación bilineal de grad en coordenadas flotantes."""
        x0 = int(fx)
        y0 = int(fy)
        x1 = x0 + 1
        y1 = y0 + 1
        if x0 < 0 or y0 < 0 or x1 >= w or y1 >= h:
            return 0.0
        dx = fx - x0
        dy = fy - y0
        return (
            (1 - dy) * ((1 - dx) * float(grad[y0, x0]) + dx * float(grad[y0, x1]))
            + dy      * ((1 - dx) * float(grad[y1, x0]) + dx * float(grad[y1, x1]))
        )

    n = len(pts)
    snapped = pts.astype(np.float32).copy()

    for i in range(n):
        prev = pts[(i - 1) % n]
        curr = pts[i]
        next_ = pts[(i + 1) % n]

        # Tangente por diferencia central
        tx = float(next_[0] - prev[0])
        ty = float(next_[1] - prev[1])
        t_len = math.sqrt(tx * tx + ty * ty)
        if t_len < 1e-6:
            continue

        # Normal exterior (rotación +90°: apunta hacia el fondo)
        nx_n =  ty / t_len
        ny_n = -tx / t_len

        # Muestreo a lo largo de la normal en pasos de 0.5 px
        best_g = -1.0
        best_t = 0.0
        t_val = -SNAP_RANGE
        while t_val <= SNAP_RANGE:
            gv = _grad_bilineal(curr[0] + t_val * nx_n, curr[1] + t_val * ny_n)
            if gv > best_g:
                best_g = gv
                best_t = t_val
            t_val += 0.5

        if best_g >= effective_min_grad and abs(best_t) > 0.25:
            new_x = round((float(curr[0]) + best_t * nx_n) * 10.0) / 10.0
            new_y = round((float(curr[1]) + best_t * ny_n) * 10.0) / 10.0
            # Validar que el punto snapeado sigue dentro del objeto (no en fondo).
            # Evita que gradientes de textura interna o de borde de fondo empujen
            # puntos fuera del contorno real (causa de radio_max anómalo en Cara A).
            if mask_u8 is not None:
                mx_i = int(round(new_x)); my_i = int(round(new_y))
                if 0 <= mx_i < w and 0 <= my_i < h and mask_u8[my_i, mx_i] > 0:
                    snapped[i, 0] = new_x
                    snapped[i, 1] = new_y
                # Si el snap cae en fondo: mantiene posición original
            else:
                snapped[i, 0] = new_x
                snapped[i, 1] = new_y

    # Suavizado post-snap (media ponderada ventana 3, 1 iteración)
    result = snapped.copy()
    for _ in range(SMOOTH_ITER):
        smoothed = result.copy()
        for i in range(n):
            prev = result[(i - 1) % n]
            curr = result[i]
            next_ = result[(i + 1) % n]
            smoothed[i, 0] = prev[0] * 0.25 + curr[0] * 0.5 + next_[0] * 0.25
            smoothed[i, 1] = prev[1] * 0.25 + curr[1] * 0.5 + next_[1] * 0.25
        result = smoothed

    return result


def _depurar_por_coherencia(pts: np.ndarray, mask_u8: np.ndarray, roi_img: np.ndarray) -> np.ndarray:
    """
    Filtra puntos del contorno de baja confianza cromática y geométrica.

    Equivale a depurarContornoPorCoherencia() — analysis-core.js ~L4161

    Score combinado por punto (0–1):
      scoreColor (0.35):
        − Tiene vecinos exteriores (mask=0): scoreColor = min(1, ΔE_vs_fondo / 40)
        − Solo vecinos interiores (flotante): scoreColor = max(0, 1 − ΔE_interior / 150)
        − Totalmente aislado: score = 0
      scoreGeometrico (0.50): fracción de 8-vecinos que son también píxeles de borde
      scoreUniformidad (0.15): 1 − √(varianza_interior) / 50

    Umbral de corte: 0.20
    Fallback: si se elimina > 40% del contorno, devuelve el contorno original.
    """
    UMBRAL_CONFIANZA = 0.20

    h, w = roi_img.shape[:2]
    img_rgb = cv2.cvtColor(roi_img, cv2.COLOR_BGR2RGB).astype(np.float32)
    mask_f     = (mask_u8 > 0).astype(np.float32)
    not_mask_f = 1.0 - mask_f

    # ── Pre-computar sumas de vecindad 5×5 (excluyendo centro) ───────────────
    # filter2D con kernel uniforme 5×5 = suma de 25 píxeles.
    # Restando la contribución del centro obtenemos los 24 vecinos.
    K5 = np.ones((5, 5), np.float32)
    ext_count = cv2.filter2D(not_mask_f, cv2.CV_32F, K5) - not_mask_f
    int_count = cv2.filter2D(mask_f,     cv2.CV_32F, K5) - mask_f

    ext_sum  = np.empty((h, w, 3), dtype=np.float32)
    int_sum  = np.empty((h, w, 3), dtype=np.float32)
    int_sum2 = np.empty((h, w, 3), dtype=np.float32)
    for c in range(3):
        ch = img_rgb[:, :, c]
        ext_sum[:, :, c]  = cv2.filter2D(ch * not_mask_f, cv2.CV_32F, K5) - ch * not_mask_f
        int_sum[:, :, c]  = cv2.filter2D(ch * mask_f,     cv2.CV_32F, K5) - ch * mask_f
        int_sum2[:, :, c] = cv2.filter2D(ch * ch * mask_f, cv2.CV_32F, K5) - ch * ch * mask_f

    # ── Pre-computar mapa de píxeles de borde ────────────────────────────────
    # Píxel de borde = en máscara Y con al menos un vecino fuera de máscara.
    # Equivale a: mask AND NOT erode(mask).
    mask_bin = (mask_u8 > 0).astype(np.uint8)
    eroded   = cv2.erode(mask_bin, np.ones((3, 3), np.uint8), iterations=1)
    border_map = (mask_bin - eroded).astype(np.float32)  # 1=borde, 0=interior/fondo

    # ── Coordenadas de los puntos del contorno ────────────────────────────────
    xs = np.clip(np.round(pts[:, 0]).astype(np.int32), 0, w - 1)
    ys = np.clip(np.round(pts[:, 1]).astype(np.int32), 0, h - 1)

    ec = ext_count[ys, xs]
    ic = int_count[ys, xs]

    # ── scoreColor (vectorizado) ──────────────────────────────────────────────
    avg_ext    = ext_sum[ys, xs] / np.maximum(ec[:, None], 1.0)
    dist_fondo = np.sqrt(np.sum((img_rgb[ys, xs] - avg_ext) ** 2, axis=1))
    score_color_ext = np.minimum(1.0, dist_fondo / 40.0)

    avg_int  = int_sum[ys, xs] / np.maximum(ic[:, None], 1.0)
    dist_int = np.sqrt(np.sum((img_rgb[ys, xs] - avg_int) ** 2, axis=1))
    score_color_int = np.maximum(0.0, 1.0 - dist_int / 150.0)

    # Caso 1: vecinos exteriores → score_color_ext
    # Caso 2: solo interiores   → score_color_int
    # Caso 3: aislado           → 0.0
    score_color = np.where(ec > 0, score_color_ext,
                  np.where(ic > 0, score_color_int, 0.0))

    # ── scoreGeometrico (vectorizado) ─────────────────────────────────────────
    # Cuenta cuántos de los 8 vecinos inmediatos son píxeles de borde.
    offsets = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    border_count = np.zeros(len(pts), dtype=np.float32)
    for dy, dx in offsets:
        ny_n = np.clip(ys + dy, 0, h - 1)
        nx_n = np.clip(xs + dx, 0, w - 1)
        border_count += border_map[ny_n, nx_n]
    score_geo = border_count / 8.0

    # ── scoreUniformidad (vectorizado) ────────────────────────────────────────
    # Var = E[X²] − E[X]²  por canal; promediado entre R, G, B.
    e_x2      = int_sum2[ys, xs] / np.maximum(ic[:, None], 1.0)
    var_ch    = np.maximum(0.0, e_x2 - avg_int ** 2)
    var_total = var_ch.mean(axis=1)
    score_unif = np.where(ic > 1,
                          np.maximum(0.0, 1.0 - np.sqrt(var_total) / 50.0),
                          0.5)

    # ── Score final y filtrado ────────────────────────────────────────────────
    scores     = score_color * 0.35 + score_geo * 0.50 + score_unif * 0.15
    valid_mask = scores >= UMBRAL_CONFIANZA
    n_valid    = int(valid_mask.sum())
    n_elim     = len(pts) - n_valid

    # Fallback: si se eliminó más del 40% o quedan < 3 puntos, devuelve original
    if len(pts) == 0 or n_elim / len(pts) > 0.40 or n_valid < 3:
        return pts

    return pts[valid_mask]


# ── Extracción de contorno ────────────────────────────────────────────────────

async def extract(
    image_bytes: bytes,
    bbox: tuple,
    subpixel: bool = True,
    simplify_tolerance: float = 2.0,
) -> dict:
    """
    Extrae contorno exacto del objeto en la región bbox de la imagen.

    bbox: (x, y, w, h) — coordenadas absolutas de la imagen completa.

    Retorno compatible con extraerContornoReal() JS:
      {
        "points":          [[x, y], ...],   # contorno completo (coordenadas absolutas)
        "points_visual":   [[x, y], ...],   # versión simplificada (para canvas)
        "metrics": {
          "area_real":        float,         # área en píxeles del polígono
          "perimeter_real":   float,         # perímetro en píxeles
          "centroid":         [cx, cy],
          "tight_bounding_box": {...},
          "contour_points_count": int,
        },
        "width":  int,                       # ancho del ROI
        "height": int,                       # alto del ROI
        "metodoDeteccion": str,
        "is_valid": bool,
        "quality": {"score": float, "nivel": str},
      }
    """
    img_full = _bytes_to_cv(image_bytes)
    h_full, w_full = img_full.shape[:2]

    x, y, bw, bh = bbox
    x  = max(0, int(x))
    y  = max(0, int(y))
    bw = min(int(bw), w_full - x)
    bh = min(int(bh), h_full - y)

    if bw <= 0 or bh <= 0:
        raise HTTPException(status_code=400, detail="BBox fuera de la imagen.")

    # ── Paso 1: Recorte de la región de interés ──────────────────────────────
    roi = img_full[y: y + bh, x: x + bw]

    # ── Paso 2: Detectar fondo y construir máscara binaria ───────────────────
    # CRÍTICO: usar la imagen COMPLETA para detectar el tipo de fondo.
    # Si se usa el ROI (crop del objeto), una piedra que llene su bbox provoca
    # que los bordes del ROI sean la propia piedra (oscura) → brillo_min < 230
    # → es_fondo_blanco=False → Z-scan sin fondo visible → máscara invertida
    # → findContours retorna el perímetro de la imagen completa → radio_max anómalo.
    # img_full siempre tiene el fondo real en sus bordes exteriores.
    fondo = _detectar_color_fondo(img_full)

    # Para fondo no blanco, Z-scan sobre la imagen completa (colorFondo fiable)
    # y CLAHE sobre el ROI (mejora la máscara sin alterar las referencias de color).
    zscan_roi = None
    roi_for_mask = roi
    if not fondo["es_fondo_blanco"]:
        try:
            zscan_roi = _zscan_color_analysis(img_full)
            fondo["r"] = zscan_roi["colorFondo"]["r"]
            fondo["g"] = zscan_roi["colorFondo"]["g"]
            fondo["b"] = zscan_roi["colorFondo"]["b"]
            fondo["es_fondo_cromatico"] = zscan_roi["esCromatico"]

            # Bajo contraste (distObjBg < 25): CLAHE sobre el ROI mejora la
            # máscara binaria. Los colores referencia (img_full) no cambian.
            if zscan_roi.get("distObjBg", 999.0) < 25.0:
                roi_for_mask = _aplicar_clahe(roi)
        except Exception:
            zscan_roi = None

    mask = _build_binary_mask(roi_for_mask, fondo, zscan_roi)    # objeto=1, fondo=0
    mask_u8 = (mask * 255).astype(np.uint8)

    # ── Paso 3: Suavizado morfológico (equivale a suavizarMascaraMorfologica JS) ─
    # Cierre (cerrar huecos) + apertura (eliminar ruido) — misma lógica JS
    iters = 2 if fondo["es_fondo_cromatico"] else 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask_u8 = cv2.morphologyEx(mask_u8, cv2.MORPH_CLOSE, kernel, iterations=iters)
    mask_u8 = cv2.morphologyEx(mask_u8, cv2.MORPH_OPEN,  kernel, iterations=iters)

    # ── GrabCut fallback: cobertura anómala indica máscara invertida ─────────
    # Cobertura > 92%: máscara probablemente invertida (objeto=fondo detectado).
    # Cobertura < 4%:  máscara vacía (objeto no detectado).
    # GrabCut usa la máscara inicial como hint (GC_INIT_WITH_MASK) para refinar.
    _grabcut_usado = False
    roi_px = bw * bh
    if roi_px > 0:
        coverage = float((mask_u8 > 0).sum()) / roi_px
        if coverage > 0.92 or coverage < 0.04:
            try:
                gc_result = _grabcut_mask(roi, initial_mask_u8=mask_u8)
                gc_u8 = (gc_result * 255).astype(np.uint8)
                gc_coverage = float((gc_u8 > 0).sum()) / roi_px
                if 0.04 < gc_coverage < 0.92:
                    # GrabCut produjo cobertura razonable → limpiar y adoptar
                    gc_u8 = cv2.morphologyEx(gc_u8, cv2.MORPH_CLOSE, kernel, iterations=iters)
                    gc_u8 = cv2.morphologyEx(gc_u8, cv2.MORPH_OPEN,  kernel, iterations=iters)
                    mask_u8 = gc_u8
                    _grabcut_usado = True
            except Exception:
                pass  # fallback: continúa con la máscara original

    metodo = (
        "python_grabcut"               if _grabcut_usado
        else "python_blancos_absolutos" if fondo["es_fondo_blanco"]
        else "python_zscan_lc_clahe"   if (zscan_roi is not None and roi_for_mask is not roi)
        else "python_zscan_competitivo" if zscan_roi is not None
        else "python_adaptativo"
    )

    # ── Paso 4: Extracción de contorno exterior ──────────────────────────────
    # CHAIN_APPROX_NONE conserva TODOS los puntos del borde pix a pix,
    # equivalente a extraerContornoDesdeMascara() JS (trazado completo del borde)
    contours, _ = cv2.findContours(mask_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)

    if not contours:
        return {
            "status": "error",
            "message": "No se encontró contorno de objeto en la región indicada.",
            "is_valid": False,
        }

    # Tomar el contorno de mayor área (objeto principal)
    main_cnt = max(contours, key=cv2.contourArea)

    if len(main_cnt) < 3:
        return {
            "status": "error",
            "message": "Contorno insuficiente (< 3 puntos).",
            "is_valid": False,
        }

    # ── Paso 4b: Filtro de coherencia cromática ───────────────────────────────
    # Equivale a depurarContornoPorCoherencia() JS — elimina píxeles de borde
    # ruidosos (similares al fondo o aislados), conservando borde real.
    pts_raw = main_cnt.reshape(-1, 2).astype(np.float32)
    try:
        pts_raw = _depurar_por_coherencia(pts_raw, mask_u8, roi)
    except Exception:
        pass   # fallback: continúa con contorno sin filtrar

    if len(pts_raw) < 3:
        return {
            "status": "error",
            "message": "Contorno insuficiente tras filtro de coherencia.",
            "is_valid": False,
        }
    # Reformatear para compatibilidad con cornerSubPix
    main_cnt = pts_raw.reshape(-1, 1, 2).astype(np.float32)

    # ── Paso 5: Refinamiento sub-píxel (equivale a refinarContornoSubPixel JS) ─
    # cv2.cornerSubPix es la implementación nativa C++ — más precisa que el JS
    if subpixel and len(main_cnt) >= 4:
        gray_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        corners = main_cnt.astype(np.float32)
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.01)
        try:
            refined = cv2.cornerSubPix(gray_roi, corners, (3, 3), (-1, -1), criteria)
            main_cnt = refined.astype(np.float32)
        except cv2.error:
            pass   # fallback sin refinamiento sub-píxel

    # ── Paso 5b: Gradient snap (equivale a refinarContornoGradiente JS) ──────
    # Desplaza cada punto al máximo |∇I| a lo largo de la normal (±6 px).
    pts_snapped = main_cnt.reshape(-1, 2).astype(np.float32)
    try:
        pts_snapped = _refinar_contorno_gradiente(pts_snapped, roi, mask_u8=mask_u8)
    except Exception:
        pass   # fallback sin gradient snap

    main_cnt = pts_snapped.reshape(-1, 1, 2).astype(np.float32)

    # ── Paso 6: Simplificación Douglas-Peucker (para contorno visual) ────────
    # El contorno completo se usa para métricas; el simplificado solo para canvas
    pts_full = main_cnt.reshape(-1, 2)

    arc_len = float(np.sum(
        np.sqrt(np.sum(np.diff(pts_full, axis=0).astype(np.float64) ** 2, axis=1))
    ))
    # ε adaptativo igual que JS simplificarContornoInteligente():
    #   ε = min(tolerancia, max(0.5, perímetro × 0.001))
    # Antes se usaba max() en lugar de min() → simplificación más agresiva en
    # contornos grandes (perímetro > 2000 px). Corregido.
    epsilon = min(simplify_tolerance, max(0.5, arc_len * 0.001))
    approx = cv2.approxPolyDP(main_cnt.reshape(-1, 1, 2).astype(np.float32), epsilon, True)
    pts_visual = approx.reshape(-1, 2)

    # Fallback JS: si resultado < 8 puntos, submuestrear a ~100 puntos
    if len(pts_visual) < 8 and len(pts_full) >= 8:
        step = max(1, int(math.ceil(len(pts_full) / 100)))
        pts_visual = pts_full[::step]

    # ── Paso 7: Trasladar a coordenadas absolutas (igual JS: += minX, minY) ──
    pts_abs      = pts_full.copy()
    pts_abs[:, 0] += x
    pts_abs[:, 1] += y

    pts_vis_abs      = pts_visual.copy()
    pts_vis_abs[:, 0] += x
    pts_vis_abs[:, 1] += y

    # ── Paso 7b: Convex Hull en coordenadas absolutas ────────────────────────
    hull_pts_abs = None
    try:
        hull_idx = cv2.convexHull(pts_abs.reshape(-1, 1, 2).astype(np.float32), returnPoints=True)
        hull_pts_abs = hull_idx.reshape(-1, 2)
    except Exception:
        hull_pts_abs = pts_abs

    # ── Paso 8: Validación con Shapely ──────────────────────────────────────
    is_valid = False
    try:
        poly = Polygon(pts_abs.tolist())
        if not poly.is_valid:
            poly = poly.buffer(0)
        is_valid = poly.is_valid and not poly.is_empty
    except Exception:
        pass

    # ── Paso 9: Métricas geométricas (equivale a calcularMetricasContorno JS) ─
    area_real   = _area_poligono(pts_abs)
    perim_real  = _perimetro(pts_abs)
    centroid    = pts_abs.mean(axis=0).tolist()
    tight_box   = _tight_bbox(pts_abs)

    # Score de calidad: ratio área_polígono / área_bbox (igual que JS)
    bbox_area = tight_box["area"] if tight_box["area"] > 0 else 1
    quality_score = min(1.0, area_real / bbox_area)
    quality_nivel = (
        "excelente" if quality_score >= 0.8
        else "bueno"  if quality_score >= 0.6
        else "regular" if quality_score >= 0.4
        else "bajo"
    )

    # ── Confianza de detección por objeto (ADR-008 Fase 2) ───────────────────
    # El contorno es la frontera donde convergen los 4 modos de captura, así que
    # aquí la confianza es AUTORITATIVA y homogénea entre modos (manual y
    # auto-frontend, que no la calculan en detección, la heredan en el análisis).
    # Misma fuente que detect()/IA: `_confianza_objeto` sobre la máscara y el ROI
    # ya calculados (contraste de borde + extent). No añade round-trips: reusa el
    # de `/contour`. Calidad geométrica (arriba) ≠ confianza de detección.
    detection_confidence = None
    confidence_level = None
    try:
        roi_rgb = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB).astype(np.float32)
        area_filled = int((mask_u8 > 0).sum())
        _conf = _confianza_objeto(mask_u8, roi_rgb, area_filled, bw * bh)
        detection_confidence = _conf["score"]
        confidence_level = _conf["level"]
    except Exception:
        pass   # confianza opcional: el contrato admite null si no es calculable

    # ── Retorno compatible con extraerContornoReal() JS ──────────────────────
    return {
        "status": "ok",
        "detection_confidence": detection_confidence,
        "confidence_level":     confidence_level,
        "points":        [[round(float(p[0]), 2), round(float(p[1]), 2)] for p in pts_abs],
        "points_visual": [[round(float(p[0]), 2), round(float(p[1]), 2)] for p in pts_vis_abs],
        "convex_hull":   [[round(float(p[0]), 2), round(float(p[1]), 2)] for p in hull_pts_abs] if hull_pts_abs is not None else [],
        "metrics": {
            "area_real":            round(area_real, 2),
            "perimeter_real":       round(perim_real, 2),
            "centroid":             [round(centroid[0], 2), round(centroid[1], 2)],
            "tight_bounding_box":   tight_box,
            "contour_points_count": len(pts_abs),
        },
        "width":            bw,
        "height":           bh,
        "metodoDeteccion":  metodo,
        "is_valid":         is_valid,
        "quality": {
            "score": round(quality_score, 3),
            "nivel": quality_nivel,
        },
    }
