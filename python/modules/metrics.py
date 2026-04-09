"""
MAO Plus — Módulo: Cálculo de métricas morfométricas
======================================================
Implementa las mismas métricas que calcularMetricasMorfologicas() JS
siguiendo idénticamente las fórmulas y nombres de clave del código original.

Métricas implementadas (30 grupos, ~55 indicadores):
  Básicas   : área, perímetro, centroide, bounding box, aspect ratio
  Forma     : circularidad, compacidad, rectangularidad, elongación, solidez
  Convex    : convex hull área/perímetro, pérdida por fragmentación
  Ejes      : excentricidad, eje mayor/menor, orientación (tensor de inercia de área)
  Avanzadas : simetría bilateral, curvatura Menger, rugosidad, Feret, radios extremos
  Índices   : estrellamiento, lobularidad, energía de curvatura
  Ángulos   : distribución de ángulos internos en vértices simplificados
  Textura   : varianza tonal, entropía de histograma, gradiente Sobel + GLCM

Funciones JS equivalentes:
  calcularMetricasMorfologicas()    analysis-core.js ~L9362
  calcularMetricasContorno()        analysis-core.js ~L4724
  calcularExcentricidad()           analysis-core.js ~L5653
  calcularSimetriaBilateral()       analysis-core.js ~L5760
  calcularCurvaturaLocal()          analysis-core.js ~L5858
  calcularRugosidadContorno()       analysis-core.js ~L5950
  calcularEjePrincipal()            analysis-core.js ~L6458
  calcularDiametroFeret()           analysis-core.js ~L6602
  calcularRadiosExtremos()          analysis-core.js ~L6364
  calcularTexturaSuperficie()       analysis-core.js ~L6025
"""

import math
import numpy as np
import cv2
from scipy.spatial import ConvexHull
from fastapi import HTTPException

from python.modules.mao_ia_analyzer import convexity_defects_from_contour

IMPLEMENTED = True

# ── Constantes matemáticas (iguales a las del JS) ─────────────────────────
_PI      = math.pi
_TWO_PI  = 2 * math.pi
_FOUR_PI = 4 * math.pi


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS GEOMÉTRICOS  (equivalentes exactos a las funciones JS)
# ══════════════════════════════════════════════════════════════════════════════

def _to_array(points: list) -> np.ndarray:
    """Convierte lista de puntos [{x,y} o [x,y]] a ndarray float64 (N,2)."""
    result = []
    for p in points:
        if isinstance(p, dict):
            result.append([float(p["x"]), float(p["y"])])
        else:
            result.append([float(p[0]), float(p[1])])
    return np.array(result, dtype=np.float64)


def _area_shoelace(pts: np.ndarray) -> float:
    """Área por fórmula de Shoelace (Green). Idéntico a calcularAreaShoelace() JS."""
    n = len(pts)
    if n < 3:
        return 0.0
    x, y = pts[:, 0], pts[:, 1]
    return 0.5 * abs(float(np.dot(x, np.roll(y, -1)) - np.dot(np.roll(x, -1), y)))


def _perimeter(pts: np.ndarray) -> float:
    """Perímetro euclídeo cerrado. Idéntico al bucle JS."""
    diffs = np.diff(np.vstack([pts, pts[[0]]]), axis=0).astype(np.float64)
    return float(np.sum(np.sqrt((diffs ** 2).sum(axis=1))))


def _centroid_shoelace(pts: np.ndarray):
    """
    Centroide Shoelace área-ponderado.
    Idéntico a la fórmula de Green usada en calcularMetricasContorno() JS.
    """
    n = len(pts)
    cx = cy = sa = 0.0
    for i in range(n):
        j = (i + 1) % n
        cross = pts[i, 0] * pts[j, 1] - pts[j, 0] * pts[i, 1]
        sa += cross
        cx += (pts[i, 0] + pts[j, 0]) * cross
        cy += (pts[i, 1] + pts[j, 1]) * cross
    sa /= 2.0
    if abs(sa) > 1e-10:
        return cx / (6 * sa), cy / (6 * sa)
    return float(pts[:, 0].mean()), float(pts[:, 1].mean())


def _convex_hull_metrics(pts: np.ndarray):
    """
    Convex hull vía scipy.ConvexHull.
    Retorna (hull_pts: ndarray, hull_area: float, hull_perimeter: float).
    """
    if len(pts) < 3:
        return pts.copy(), _area_shoelace(pts), _perimeter(pts)
    try:
        hull = ConvexHull(pts)
        # hull.vertices está en orden antihorario; añadimos punto de cierre
        hull_pts = pts[hull.vertices]
        hull_area = float(hull.volume)   # en 2D, .volume = área
        hull_perim = _perimeter(hull_pts)
        return hull_pts, hull_area, hull_perim
    except Exception:
        return pts.copy(), _area_shoelace(pts), _perimeter(pts)


def _tight_bbox(pts: np.ndarray) -> dict:
    min_x = float(pts[:, 0].min()); max_x = float(pts[:, 0].max())
    min_y = float(pts[:, 1].min()); max_y = float(pts[:, 1].max())
    w = max_x - min_x; h = max_y - min_y
    return {"minX": min_x, "maxX": max_x, "minY": min_y, "maxY": max_y,
            "width": w, "height": h, "area": w * h}


# ── Momentos de inercia de área vía Green's theorem (idéntico al JS) ─────
def _inertia_eigenvalues(pts: np.ndarray, cx: float, cy: float):
    """
    Devuelve (lam1, lam2, angulo_rad) donde lam1 ≥ lam2.
    Replicación exacta de calcularExcentricidad() / calcularEjePrincipal() JS.
    """
    n = len(pts)
    sxx = syy = sxy = sa = 0.0
    for i in range(n):
        j = (i + 1) % n
        xi = pts[i, 0] - cx; yi = pts[i, 1] - cy
        xj = pts[j, 0] - cx; yj = pts[j, 1] - cy
        cross = xi * yj - xj * yi
        sa   += cross
        sxx  += (xi*xi + xi*xj + xj*xj) * cross
        syy  += (yi*yi + yi*yj + yj*yj) * cross
        sxy  += (2*xi*yi + 2*xj*yj + xi*yj + xj*yi) * cross

    if abs(sa) > 1e-10:
        sxx /= (6 * sa); syy /= (6 * sa); sxy /= (12 * sa)
    else:
        dx = pts[:, 0] - cx; dy = pts[:, 1] - cy
        sxx = float((dx * dx).mean())
        syy = float((dy * dy).mean())
        sxy = float((dx * dy).mean())

    trace = sxx + syy
    det   = sxx * syy - sxy * sxy
    disc  = max(0.0, trace * trace - 4 * det)
    lam1  = (trace + math.sqrt(disc)) / 2
    lam2  = (trace - math.sqrt(disc)) / 2
    ang   = math.atan2(lam1 - sxx, sxy) if abs(sxy) > 1e-10 else (0.0 if sxx > syy else _PI / 2)
    return lam1, lam2, ang


def _excentricidad(pts: np.ndarray, cx: float, cy: float) -> dict:
    """
    Tensor de inercia de área, eigenvalores → excentricidad.
    Idéntico a calcularExcentricidad() JS.
    """
    lam1, lam2, ang = _inertia_eigenvalues(pts, cx, cy)
    cos_a = math.cos(ang); sin_a = math.sin(ang)
    dx = pts[:, 0] - cx; dy = pts[:, 1] - cy
    p1 =  dx * cos_a + dy * sin_a
    p2 = -dx * sin_a + dy * cos_a
    eje_mayor = float(p1.max() - p1.min())
    eje_menor = float(p2.max() - p2.min())
    exc = math.sqrt(max(0.0, 1 - (eje_menor / eje_mayor) ** 2)) if eje_mayor > 0 else 0.0
    ang_deg = math.degrees(ang) % 180
    return {"excentricidad": min(exc, 1.0), "eje_mayor": eje_mayor,
            "eje_menor": eje_menor, "angulo_eje_principal": ang_deg,
            "eigenvalue_mayor": lam1, "eigenvalue_menor": lam2}


# ── Simetría bilateral (Hausdorff modificado, idéntico al JS) ─────────────
def _simetria_bilateral(pts: np.ndarray, cx: float, cy: float, angulo_eje: float) -> dict:
    """
    Rotar al eje principal, dividir izq/der, reflejar, Hausdorff promedio.
    Idéntico a calcularSimetriaBilateral() JS.
    """
    n = len(pts)
    if n < 10:
        return {"simetria_bilateral": 0.0, "distancia_asimetria_px": 0.0,
                "clasificacion_simetria": "Insuficientes puntos", "radio_referencia_px": 0.0}

    theta = math.radians(90 - angulo_eje)
    cos_t = math.cos(theta); sin_t = math.sin(theta)
    dx = pts[:, 0] - cx; dy = pts[:, 1] - cy
    rx = cx + dx * cos_t - dy * sin_t
    ry = cy + dx * sin_t + dy * cos_t
    pts_rot = np.column_stack([rx, ry])

    izq = pts_rot[pts_rot[:, 0] < cx]
    der = pts_rot[pts_rot[:, 0] >= cx]
    if len(izq) < 3 or len(der) < 3:
        return {"simetria_bilateral": 0.0, "distancia_asimetria_px": 0.0,
                "clasificacion_simetria": "Contorno no divisible", "radio_referencia_px": 0.0}

    der_ref = np.column_stack([2 * cx - der[:, 0], der[:, 1]])

    suma = 0.0
    for pi in izq:
        dists = np.sqrt(((der_ref - pi) ** 2).sum(axis=1))
        suma += float(dists.min())
    dist_asim = suma / len(izq)

    dists_r = np.sqrt((pts[:, 0] - cx) ** 2 + (pts[:, 1] - cy) ** 2)
    radio_medio = float(dists_r.mean())

    indice = max(0.0, min(1.0, 1.0 - dist_asim / radio_medio)) if radio_medio > 0 else 0.0

    if indice >= 0.95:    cls = "Altamente simétrico"
    elif indice >= 0.85:  cls = "Simetría buena"
    elif indice >= 0.70:  cls = "Simetría moderada"
    elif indice >= 0.50:  cls = "Levemente asimétrico"
    else:                 cls = "Asimétrico"

    return {"simetria_bilateral": indice, "distancia_asimetria_px": dist_asim,
            "clasificacion_simetria": cls, "radio_referencia_px": radio_medio}


# ── Curvatura de Menger (idéntico al JS) ─────────────────────────────────
def _curvatura_local(pts: np.ndarray) -> dict:
    """
    k_i = 4 * area(P_{i-1}, P_i, P_{i+1}) / (d01 * d12 * d20).
    Idéntico a calcularCurvaturaLocal() JS.
    """
    n = len(pts)
    if n < 5:
        return {"curvatura_media": 0.0, "curvatura_maxima": 0.0,
                "desviacion_curvatura": 0.0, "puntos_inflexion": 0,
                "puntos_esquina": 0, "clasificacion_suavidad": "Insuficientes puntos",
                "_curvaturas": []}
    curvaturas = []
    for i in range(1, n - 1):
        p0, p1, p2 = pts[i-1], pts[i], pts[i+1]
        area = abs((p1[0]-p0[0])*(p2[1]-p0[1]) - (p2[0]-p0[0])*(p1[1]-p0[1])) / 2
        d01  = math.hypot(p1[0]-p0[0], p1[1]-p0[1])
        d12  = math.hypot(p2[0]-p1[0], p2[1]-p1[1])
        d20  = math.hypot(p0[0]-p2[0], p0[1]-p2[1])
        if d01 > 0 and d12 > 0 and d20 > 0:
            curvaturas.append((4 * area) / (d01 * d12 * d20))

    if not curvaturas:
        return {"curvatura_media": 0.0, "curvatura_maxima": 0.0,
                "desviacion_curvatura": 0.0, "puntos_inflexion": 0,
                "puntos_esquina": 0, "clasificacion_suavidad": "Sin curvatura calculable",
                "_curvaturas": []}

    arr  = np.array(curvaturas)
    media = float(arr.mean()); maxima = float(arr.max()); desv = float(arr.std())
    n_inf = int((arr > media + 2 * desv).sum())
    n_esq = int((arr > media + 3 * desv).sum())

    if desv < 0.005:    cls = "Muy suave (circular/elíptico)"
    elif desv < 0.02:   cls = "Suave (bordes redondeados)"
    elif desv < 0.05:   cls = "Moderado (algunas inflexiones)"
    elif desv < 0.10:   cls = "Irregular (múltiples inflexiones)"
    else:               cls = "Muy irregular (esquinas pronunciadas)"

    return {"curvatura_media": media, "curvatura_maxima": maxima,
            "desviacion_curvatura": desv, "puntos_inflexion": n_inf,
            "puntos_esquina": n_esq, "clasificacion_suavidad": cls,
            "_curvaturas": curvaturas}


# ── Rugosidad del contorno — CV de segmentos (idéntico al JS) ─────────────
def _rugosidad(pts: np.ndarray) -> dict:
    segs = np.sqrt(np.sum(np.diff(np.vstack([pts, pts[[0]]]), axis=0) ** 2, axis=1))
    segs = segs[segs > 0]
    if len(segs) == 0:
        return {"rugosidad": 0.0, "longitud_segmento_media_px": 0.0,
                "desviacion_segmentos_px": 0.0, "clasificacion_rugosidad": "Sin segmentos"}
    media = float(segs.mean()); desv = float(segs.std())
    rug = desv / media if media > 0 else 0.0

    if rug < 0.05:    cls = "Muy suave (pulido/regular)"
    elif rug < 0.15:  cls = "Suave (ligera irregularidad)"
    elif rug < 0.30:  cls = "Moderado (irregular)"
    elif rug < 0.50:  cls = "Rugoso (muy irregular)"
    else:             cls = "Muy rugoso (fracturado/erosionado)"

    return {"rugosidad": rug, "longitud_segmento_media_px": media,
            "desviacion_segmentos_px": desv, "clasificacion_rugosidad": cls}


# ── Diámetro de Feret — barrido 90 ángulos (idéntico al JS) ──────────────
def _feret(pts: np.ndarray) -> dict:
    """
    Caliper diameter muestreando 90 ángulos (paso 2°, igual que JS).
    """
    n_ang = 90; delta = _PI / n_ang
    feret_max = 0.0; feret_min = math.inf
    ang_max = 0.0; ang_min = 0.0
    for i in range(n_ang):
        ang  = i * delta
        proy = pts[:, 0] * math.cos(ang) + pts[:, 1] * math.sin(ang)
        diam = float(proy.max() - proy.min())
        if diam > feret_max:   feret_max = diam; ang_max = math.degrees(ang)
        if diam < feret_min:   feret_min = diam; ang_min = math.degrees(ang)

    ratio = feret_min / feret_max if feret_max > 0 else 0.0
    if ratio > 0.9:    cls = "Casi circular"
    elif ratio > 0.7:  cls = "Moderadamente elongado"
    elif ratio > 0.5:  cls = "Muy elongado"
    else:              cls = "Extremadamente elongado"

    return {"feret_max": feret_max, "feret_min": feret_min, "feret_ratio": ratio,
            "angulo_feret_max": ang_max, "angulo_feret_min": ang_min,
            "feret_clasificacion": cls}


# ── Radios extremos desde centroide (idéntico al JS) ─────────────────────
def _radios_extremos(hull_pts: np.ndarray, cx: float, cy: float,
                     full_pts: np.ndarray) -> dict:
    """
    Rmax = vértice más alejado del hull.
    Rmin = distancia perp. mínima centroide ↔ aristas del hull.
    Estadísticas sobre el contorno completo (no solo el hull).
    Idéntico a calcularRadiosExtremos() JS.
    """
    if len(hull_pts) < 3:
        return {"radio_maximo": 0.0, "radio_minimo": 0.0, "radio_medio": 0.0,
                "ratio_radios": 0.0, "regularidad_radial": 0.0,
                "desviacion_radial": 0.0, "coeficiente_variacion_radial": 0.0}

    dx = hull_pts[:, 0] - cx; dy = hull_pts[:, 1] - cy
    radio_max = float(np.sqrt(dx**2 + dy**2).max())

    n = len(hull_pts); radio_min = math.inf
    for i in range(n):
        ax = hull_pts[i, 0] - cx;  ay = hull_pts[i, 1] - cy
        bx = hull_pts[(i+1) % n, 0] - cx; by = hull_pts[(i+1) % n, 1] - cy
        abx = bx - ax; aby = by - ay; ab2 = abx**2 + aby**2
        if ab2 < 1e-12:
            nearx, neary = ax, ay
        else:
            t = max(0.0, min(1.0, -(ax*abx + ay*aby) / ab2))
            nearx = ax + t * abx; neary = ay + t * aby
        d = math.sqrt(nearx**2 + neary**2)
        if d < radio_min: radio_min = d

    pts_s  = full_pts if len(full_pts) >= 3 else hull_pts
    dists  = np.sqrt((pts_s[:, 0] - cx)**2 + (pts_s[:, 1] - cy)**2)
    media  = float(dists.mean()); desv = float(dists.std())
    cv     = (desv / media * 100) if media > 0 else 0.0
    ratio  = radio_min / radio_max if radio_max > 0 else 0.0
    reg    = ratio * 100

    return {"radio_maximo": radio_max, "radio_minimo": radio_min,
            "radio_medio": media, "ratio_radios": ratio,
            "regularidad_radial": reg, "desviacion_radial": desv,
            "coeficiente_variacion_radial": cv}


# ── Vértices aproximados y ángulos internos ───────────────────────────────
def _aproximar_vertices(pts: np.ndarray) -> dict:
    arc = _perimeter(pts); epsilon = max(0.5, arc * 0.001)
    cnt = pts.reshape(-1, 1, 2).astype(np.float32)
    approx = cv2.approxPolyDP(cnt, epsilon, True)
    verts = approx.reshape(-1, 2)
    return {"count": len(verts), "points": verts.astype(float).tolist()}


def _angulos_vertices(pts: np.ndarray) -> dict:
    n = len(pts)
    if n < 3:
        return {"angulo_medio": 0.0, "angulo_predominante": 0.0,
                "desviacion_angulos": 0.0, "num_angulos_rectos": 0,
                "num_angulos_agudos": 0, "num_angulos_obtusos": 0}
    angulos = []
    for i in range(n):
        A = pts[(i-1) % n]; B = pts[i]; C = pts[(i+1) % n]
        v1 = A - B; v2 = C - B
        n1 = np.linalg.norm(v1); n2 = np.linalg.norm(v2)
        if n1 > 0 and n2 > 0:
            ca = np.clip(np.dot(v1, v2) / (n1 * n2), -1.0, 1.0)
            angulos.append(math.degrees(math.acos(ca)))

    if not angulos:
        return {"angulo_medio": 0.0, "angulo_predominante": 0.0,
                "desviacion_angulos": 0.0, "num_angulos_rectos": 0,
                "num_angulos_agudos": 0, "num_angulos_obtusos": 0}
    arr = np.array(angulos)
    media = float(arr.mean()); desv = float(arr.std())
    hist, edges = np.histogram(arr, bins=range(0, 181, 10))
    pred = float(edges[int(hist.argmax())] + 5)
    return {"angulo_medio": media, "angulo_predominante": pred,
            "desviacion_angulos": desv,
            "num_angulos_rectos": int(((arr >= 80) & (arr <= 100)).sum()),
            "num_angulos_agudos": int((arr < 80).sum()),
            "num_angulos_obtusos": int((arr > 100).sum())}


# ── Textura interna básica ────────────────────────────────────────────────
def _textura_superficie(img_source, pts: np.ndarray) -> dict:
    """Acepta ``bytes`` (se decodifican) o un ndarray BGR ya decodificado."""
    nulos = {"varianza_interna": None, "entropia_superficie": None, "gradiente_medio": None}
    if isinstance(img_source, np.ndarray):
        img = img_source
    elif img_source:
        arr = np.frombuffer(img_source, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    else:
        return nulos
    if img is None:
        return nulos
    h, w = img.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.fillPoly(mask, [pts.astype(np.int32).reshape(-1, 1, 2)], 255)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    pixs = gray[mask > 0]
    if len(pixs) < 10:
        return nulos
    varianza = float(pixs.var())
    hist, _  = np.histogram(pixs, bins=256, range=(0, 256), density=True)
    entropia = float(-np.sum(hist * np.log2(hist + 1e-10)))
    sx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    sy = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    grad_medio = float(np.sqrt(sx**2 + sy**2)[mask > 0].mean())
    return {"varianza_interna": round(varianza, 4),
            "entropia_superficie": round(entropia, 4),
            "gradiente_medio": round(grad_medio, 4)}


def _r(v, d=4):
    """Redondear de forma segura y garantizar tipo Python nativo."""
    try:
        return round(float(v), d)
    except Exception:
        return None


def _fractal_dimension(pts: np.ndarray) -> float:
    """
    Dimensión fractal por box-counting (§VIII PRINCIPIOS_MORFOMETRIA_MAO).
    D = -d·log(N) / d·log(ε), calculada por regresión lineal sobre 7 escalas.
    Rango esperado: [1.0, 2.0]. Contorno suave ≈ 1.0; muy irregular ≈ 1.5+.
    """
    if len(pts) < 5:
        return 1.0
    GRID = 256
    min_xy = pts.min(axis=0)
    max_xy = pts.max(axis=0)
    rng = max_xy - min_xy
    rng = np.where(rng < 1e-6, 1.0, rng)
    pts_norm = (pts - min_xy) / rng * (GRID - 1)

    # Rasterizar el contorno (borde, no relleno) por interpolación lineal
    pixels: set = set()
    n = len(pts_norm)
    for i in range(n):
        x0, y0 = pts_norm[i]
        x1, y1 = pts_norm[(i + 1) % n]
        steps = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for t in range(steps + 1):
            frac = t / steps if steps > 0 else 0.0
            px = int(round(x0 + frac * (x1 - x0)))
            py = int(round(y0 + frac * (y1 - y0)))
            pixels.add((px, py))

    if not pixels:
        return 1.0
    px_arr = np.array(list(pixels), dtype=np.int32)

    # Box-counting en escalas 2^1 … 2^7
    log_eps_inv: list = []
    log_n: list = []
    for k in range(1, 8):
        eps = 1 << k          # 2, 4, 8, 16, 32, 64, 128
        if eps >= GRID:
            break
        boxes = set(zip(px_arr[:, 0] >> k, px_arr[:, 1] >> k))
        N = len(boxes)
        if N > 0:
            log_eps_inv.append(math.log(GRID / eps))
            log_n.append(math.log(N))

    if len(log_eps_inv) < 3:
        return 1.0

    # Regresión lineal log(N) = D·log(GRID/ε) + c
    le = np.array(log_eps_inv); ln = np.array(log_n)
    mean_e = le.mean(); mean_n = ln.mean()
    denom = float(np.dot(le - mean_e, le - mean_e))
    if denom < 1e-12:
        return 1.0
    D = float(np.dot(le - mean_e, ln - mean_n) / denom)
    return round(max(1.0, min(2.0, D)), 4)


# ══════════════════════════════════════════════════════════════════════════════
# FUNCIÓN PÚBLICA PRINCIPAL
# ══════════════════════════════════════════════════════════════════════════════

async def calculate(
    image_bytes: bytes,
    contour_points: list,
    scale_px_mm: float = 1.0,
    img_bgr: "np.ndarray | None" = None,
) -> dict:
    """
    Calcula el conjunto completo (~55 indicadores) de métricas morfométricas.

    Parámetros:
      contour_points : puntos del contorno [[x,y],...] o [{x,y},...]
      scale_px_mm    : factor px → mm (0 o None → usar px)
      img_bgr        : imagen BGR ya decodificada (evita re-decode cuando se
                       llama en bucle desde detect_with_mao_ia). Si None se
                       usa image_bytes.

    Retorna:
      { "status": "ok", "metricas": { ...todos los indicadores... }, "scale_px_mm": float }
    """
    if len(contour_points) < 3:
        raise HTTPException(status_code=400, detail="Se necesitan al menos 3 puntos de contorno.")

    pts = _to_array(contour_points)
    sc  = scale_px_mm if scale_px_mm and scale_px_mm > 0 else 0.0
    m   = {}

    # ── 1. Geometría base del contorno real (= "fragmentado" en JS) ────────
    area_real  = _area_shoelace(pts)
    perim_real = _perimeter(pts)

    # ── 2. Convex hull ─────────────────────────────────────────────────────
    hull_pts, hull_area, hull_perim = _convex_hull_metrics(pts)

    # ── 2b. Centroide del Convex Hull — referencia posicional principal ────
    # Usado para ejes de inercia, orientación y radios extremos (igual que JS).
    # El centroide de un polígono convexo siempre cae dentro de él → no requiere
    # la validación pointPolygonTest que aplica al CR fragmentado.
    if len(hull_pts) >= 3:
        cxh, cyh = _centroid_shoelace(hull_pts)
    else:
        cxh, cyh = float(pts[:, 0].mean()), float(pts[:, 1].mean())

    # ── 3. Centroide Shoelace área-ponderado (CR — contorno real/fragmentado) ─
    cx, cy = _centroid_shoelace(pts)
    # Validar que el centroide esté dentro del hull convexo.
    # Si el contorno tiene auto-intersecciones (por gradient snap incorrecto),
    # la fórmula de Shoelace puede devolver un centroide fuera del polígono,
    # lo que distorsiona completamente radio_min, radio_max y todas las métricas
    # de radios. Fallback robusto: media aritmética de los puntos del contorno.
    if len(hull_pts) >= 3:
        _hull_cnt = hull_pts.reshape(-1, 1, 2).astype(np.float32)
        if cv2.pointPolygonTest(_hull_cnt, (float(cx), float(cy)), False) < 0:
            cx = float(pts[:, 0].mean())
            cy = float(pts[:, 1].mean())
    m["centroide_x"] = _r(cx, 2); m["centroide_y"] = _r(cy, 2)
    m["centroide"]   = [_r(cx, 2), _r(cy, 2)]

    # ── 4. Bounding box ajustado ───────────────────────────────────────────
    bbox = _tight_bbox(pts)
    m["tight_bounding_width_px"]  = _r(bbox["width"])
    m["tight_bounding_height_px"] = _r(bbox["height"])
    m["tight_bounding_area_px"]   = _r(bbox["area"])

    # ── 5. Área y perímetro principales (Hull = forma completa) ───────────
    m["area_px"]                  = _r(hull_area)
    m["perimeter_px"]             = _r(hull_perim)
    m["area_fragmentada_px"]      = _r(area_real)
    m["perimeter_fragmentado_px"] = _r(perim_real)
    m["contour_points"]           = len(pts)

    if hull_area > 0:
        m["perdida_area_fragmentacion_percent"]      = _r((hull_area - area_real) / hull_area * 100, 1)
        m["perdida_perimetro_fragmentacion_percent"] = _r((hull_perim - perim_real) / hull_perim * 100, 1) if hull_perim > 0 else 0.0

    # ── 6. Conversión a mm ────────────────────────────────────────────────
    if sc > 0:
        m["area"]               = _r(hull_area * sc * sc, 3); m["area_unit"]      = "mm²"
        m["perimeter"]          = _r(hull_perim * sc, 3);     m["perimeter_unit"] = "mm"
        m["area_fragmentada"]   = _r(area_real * sc * sc, 3)
        m["perimeter_fragmentado"] = _r(perim_real * sc, 3)
        m["width"]              = _r(bbox["width"] * sc, 3)
        m["height"]             = _r(bbox["height"] * sc, 3)
    else:
        m["area"]               = _r(hull_area);   m["area_unit"]      = "px²"
        m["perimeter"]          = _r(hull_perim);  m["perimeter_unit"] = "px"
        m["area_fragmentada"]   = _r(area_real)
        m["perimeter_fragmentado"] = _r(perim_real)
        m["width"]              = _r(bbox["width"])
        m["height"]             = _r(bbox["height"])

    # ── 7. Aspect ratio ───────────────────────────────────────────────────
    tw = bbox["width"]; th = bbox["height"]
    ar = _r(tw / th if th > 0 else 1.0, 4)
    m["aspect_ratio_tight"] = ar; m["aspect_ratio_original"] = ar

    # ── 8. Circularidad 4πA/P² (Hull y fragmentado) ───────────────────────
    circ  = (_FOUR_PI * hull_area) / (hull_perim ** 2) if hull_perim > 0 else 0.0
    circF = (_FOUR_PI * area_real) / (perim_real ** 2) if perim_real > 0 else 0.0
    m["circularity"]            = _r(circ, 4)
    m["circularity_fragmentada"]= _r(circF, 4)

    # ── 9. Compacidad A / (π·r²) donde r = P/(2π) ─────────────────────────
    def _compac(a, p):
        r = p / _TWO_PI
        return a / (_PI * r * r) if r > 0 else 0.0
    m["compactness"]            = _r(_compac(hull_area, hull_perim), 4)
    m["compactness_fragmentada"]= _r(_compac(area_real, perim_real), 4)

    # ── 10. Rectangularidad A / A_bbox ───────────────────────────────────
    m["rectangularity"]            = _r(hull_area / bbox["area"], 4) if bbox["area"] > 0 else None
    m["rectangularity_fragmentada"]= _r(area_real / bbox["area"], 4) if bbox["area"] > 0 else None

    # ── 11. Solidez A_real / A_hull ───────────────────────────────────────
    solidez = area_real / hull_area if hull_area > 0 else 1.0
    m["solidity"] = _r(solidez, 4)
    if solidez >= 0.95:    m["solidity_class"] = "Completamente sólido/intacto"
    elif solidez >= 0.85:  m["solidity_class"] = "Mayormente completo"
    elif solidez >= 0.70:  m["solidity_class"] = "Moderadamente fragmentado"
    elif solidez >= 0.50:  m["solidity_class"] = "Muy fragmentado"
    else:                  m["solidity_class"] = "Extremadamente fragmentado"

    # ── 12. Factor de forma P² / (4πA) y bounding box efficiency ─────────
    m["shape_factor"]            = _r(hull_perim**2 / (_FOUR_PI * hull_area), 4) if hull_area > 0 else None
    m["shape_factor_fragmentado"]= _r(perim_real**2 / (_FOUR_PI * area_real), 4) if area_real > 0 else None
    m["bounding_box_efficiency"] = _r(area_real / bbox["area"], 4) if bbox["area"] > 0 else None

    # Complejidad del contorno = P / (2π · √(A/π))
    r_ce = math.sqrt(area_real / _PI) if area_real > 0 else 0.0
    m["contour_complexity_index"] = _r(perim_real / (_TWO_PI * r_ce), 4) if r_ce > 0 else None

    # ── 13. Excentricidad y ejes de inercia ───────────────────────────────
    # Usa centroide CH: los ejes representan la forma completa estimada (igual que JS).
    exc = _excentricidad(pts, cxh, cyh)
    m["excentricidad"]         = _r(exc["excentricidad"], 4)
    m["eje_mayor_px"]          = _r(exc["eje_mayor"])
    m["eje_menor_px"]          = _r(exc["eje_menor"])
    m["eje_mayor"]             = _r(exc["eje_mayor"] * sc if sc > 0 else exc["eje_mayor"], 2)
    m["eje_menor"]             = _r(exc["eje_menor"] * sc if sc > 0 else exc["eje_menor"], 2)
    m["angulo_eje_principal"]  = _r(exc["angulo_eje_principal"], 2)

    # Elongación 1 − eje_menor/eje_mayor
    if exc["eje_mayor"] > 0:
        elon = abs(1 - exc["eje_menor"] / exc["eje_mayor"])
    else:
        mn = min(tw, th); mx = max(tw, th)
        elon = abs(1 - mn / mx) if mx > 0 else 0.0
    m["elongation"] = _r(elon, 4)

    # ── 14. Eje principal (orientación, anisotropía) ───────────────────────
    ang = exc["angulo_eje_principal"]
    m["eje_principal_angulo"] = _r(ang, 2)
    if ang < 15 or ang > 165:          m["eje_principal_orientacion"] = "Horizontal"
    elif 75 < ang < 105:               m["eje_principal_orientacion"] = "Vertical"
    elif 15 <= ang <= 75:              m["eje_principal_orientacion"] = "Diagonal NE-SO"
    else:                              m["eje_principal_orientacion"] = "Diagonal NO-SE"

    lam1 = exc["eigenvalue_mayor"]; lam2 = exc["eigenvalue_menor"]
    aniso = (lam1 - lam2) / (lam1 + lam2) if (lam1 + lam2) > 0 else 0.0
    m["eje_principal_anisotropia"] = _r(aniso, 4)
    if aniso < 0.2:    m["eje_principal_forma_dominante"] = "Isótropa (circular/cuadrada)"
    elif aniso < 0.5:  m["eje_principal_forma_dominante"] = "Moderadamente alargada"
    elif aniso < 0.8:  m["eje_principal_forma_dominante"] = "Alargada"
    else:              m["eje_principal_forma_dominante"] = "Muy alargada (lineal)"

    m["eje_mayor_real_longitud_px"] = _r(exc["eje_mayor"])
    m["eje_menor_real_longitud_px"] = _r(exc["eje_menor"])
    m["eje_mayor_real_longitud"]    = _r(exc["eje_mayor"] * sc if sc > 0 else exc["eje_mayor"], 2)
    m["eje_menor_real_longitud"]    = _r(exc["eje_menor"] * sc if sc > 0 else exc["eje_menor"], 2)

    # ── Descriptores derivados de eigenvalores (§IV PRINCIPIOS_MORFOMETRIA_MAO) ──
    if lam2 > 1e-10 and lam1 > 0:
        m["elongacion_inercia"]      = _r(math.sqrt(lam1 / lam2), 4)
        m["excentricidad_eliptica"]  = _r(math.sqrt(max(0.0, 1.0 - lam2 / lam1)), 4)
        m["isotropia_inercial"]      = _r(lam2 / lam1, 4)
    else:
        m["elongacion_inercia"]      = None
        m["excentricidad_eliptica"]  = None if lam1 <= 1e-10 else 1.0
        m["isotropia_inercial"]      = None
    # radio de giro mayor: √(lam1) — lam1 ya es momento normalizado (Ixx/A), por tanto √(lam1) = k₁ en px
    m["radio_giro_mayor_px"]     = _r(math.sqrt(max(0.0, lam1)), 4)
    m["radio_giro_mayor"]        = _r(math.sqrt(max(0.0, lam1)) * sc if sc > 0 else math.sqrt(max(0.0, lam1)), 4)

    # ── 15. Vértices aproximados ──────────────────────────────────────────
    verts = _aproximar_vertices(pts)
    m["vertices_aproximados"] = verts["count"]
    m["vertices_coords"]      = verts["points"]

    # ── 17. Simetría bilateral ─────────────────────────────────────────────
    sim = _simetria_bilateral(pts, cx, cy, ang)
    m["simetria_bilateral"]              = _r(sim["simetria_bilateral"], 4)
    m["simetria_clasificacion"]          = sim["clasificacion_simetria"]
    m["simetria_distancia_asimetria_px"] = _r(sim["distancia_asimetria_px"], 2)
    m["simetria_distancia_asimetria"]    = _r(
        sim["distancia_asimetria_px"] * sc if sc > 0 else sim["distancia_asimetria_px"], 2)

    # ── 18. Curvatura local Menger ─────────────────────────────────────────
    curv = _curvatura_local(pts)
    m["curvatura_media"]           = _r(curv["curvatura_media"], 6)
    m["curvatura_maxima"]          = _r(curv["curvatura_maxima"], 6)
    m["curvatura_desviacion"]      = _r(curv["desviacion_curvatura"], 6)
    m["curvatura_puntos_inflexion"]= curv["puntos_inflexion"]
    m["curvatura_puntos_esquina"]  = curv["puntos_esquina"]
    m["curvatura_clasificacion"]   = curv["clasificacion_suavidad"]

    # ── 19. Rugosidad (CV de segmentos) ───────────────────────────────────
    rug = _rugosidad(pts)
    m["rugosidad_contorno"]                  = _r(rug["rugosidad"], 4)
    m["rugosidad_longitud_segmento_media_px"]= _r(rug["longitud_segmento_media_px"], 2)
    m["rugosidad_desviacion_px"]             = _r(rug["desviacion_segmentos_px"], 2)
    m["rugosidad_longitud_segmento_media"]   = _r(
        rug["longitud_segmento_media_px"] * sc if sc > 0 else rug["longitud_segmento_media_px"], 2)
    m["rugosidad_desviacion"]                = _r(
        rug["desviacion_segmentos_px"] * sc if sc > 0 else rug["desviacion_segmentos_px"], 2)
    m["rugosidad_clasificacion"] = rug["clasificacion_rugosidad"]

    # ── §VIII — Dimensión fractal box-counting ────────────────────────────
    m["fractal_dimension"] = _fractal_dimension(pts)

    # ── 20. Radios extremos ───────────────────────────────────────────────
    # Usa centroide CH como referencia radial (coherente con CGEO y con JS).
    rad = _radios_extremos(hull_pts, cxh, cyh, pts)
    m["radio_maximo_px"]              = _r(rad["radio_maximo"])
    m["radio_minimo_px"]              = _r(rad["radio_minimo"])
    m["radio_medio_px"]               = _r(rad["radio_medio"])
    m["desviacion_radial_px"]         = _r(rad["desviacion_radial"])
    m["radio_maximo"]          = _r(rad["radio_maximo"] * sc if sc > 0 else rad["radio_maximo"], 2)
    m["radio_minimo"]          = _r(rad["radio_minimo"] * sc if sc > 0 else rad["radio_minimo"], 2)
    m["radio_medio"]           = _r(rad["radio_medio"]  * sc if sc > 0 else rad["radio_medio"], 2)
    m["desviacion_radial"]     = _r(rad["desviacion_radial"] * sc if sc > 0 else rad["desviacion_radial"], 2)
    m["ratio_radios"]                 = _r(rad["ratio_radios"], 4)
    m["regularidad_radial"]           = _r(rad["regularidad_radial"], 2)
    m["coeficiente_variacion_radial"] = _r(rad["coeficiente_variacion_radial"], 2)

    # ── 21. Índice de estrellamiento (Rmax−Rmin)/Rmean ───────────────────
    if rad["radio_medio"] > 0:
        est = (rad["radio_maximo"] - rad["radio_minimo"]) / rad["radio_medio"]
        m["indice_estrellamiento"] = _r(est, 4)
        if est > 0.6:    m["estrellamiento_clasificacion"] = "Muy estrellado"
        elif est > 0.4:  m["estrellamiento_clasificacion"] = "Moderadamente estrellado"
        elif est > 0.2:  m["estrellamiento_clasificacion"] = "Ligeramente estrellado"
        else:            m["estrellamiento_clasificacion"] = "Redondeado/Regular"
    else:
        m["indice_estrellamiento"] = 0.0;  m["estrellamiento_clasificacion"] = "No calculado"

    # ── 22. Índice de lobularidad P_hull / (2π√(A_hull/π)) ───────────────
    radio_equiv_hull = math.sqrt(hull_area / _PI) if hull_area > 0 else 1.0
    perim_circ_equiv = _TWO_PI * radio_equiv_hull
    lob = hull_perim / perim_circ_equiv if perim_circ_equiv > 0 else 1.0
    m["indice_lobularidad"] = _r(lob, 4)
    if lob > 1.3:    m["lobularidad_clasificacion"] = "Muy lobulado"
    elif lob > 1.15: m["lobularidad_clasificacion"] = "Moderadamente lobulado"
    elif lob > 1.05: m["lobularidad_clasificacion"] = "Ligeramente lobulado"
    else:            m["lobularidad_clasificacion"] = "Circular/Suave"

    # ── 23. Energía de curvatura mean(k²) ────────────────────────────────
    crvs = curv["_curvaturas"]
    if crvs:
        en_curv = sum(k * k for k in crvs) / len(crvs)
        m["energia_curvatura"] = _r(en_curv, 4)
        if en_curv > 0.1:     m["energia_clasificacion"] = "Muy sinuoso"
        elif en_curv > 0.05:  m["energia_clasificacion"] = "Moderadamente sinuoso"
        elif en_curv > 0.01:  m["energia_clasificacion"] = "Ligeramente sinuoso"
        else:                  m["energia_clasificacion"] = "Muy suave"
    else:
        m["energia_curvatura"] = 0.0;  m["energia_clasificacion"] = "No calculado"

    # ── 24. Feret (sobre el hull) ─────────────────────────────────────────
    fer = _feret(hull_pts if len(hull_pts) >= 3 else pts)
    m["feret_max_px"]    = _r(fer["feret_max"])
    m["feret_min_px"]    = _r(fer["feret_min"])
    m["feret_max"]       = _r(fer["feret_max"] * sc if sc > 0 else fer["feret_max"], 2)
    m["feret_min"]       = _r(fer["feret_min"] * sc if sc > 0 else fer["feret_min"], 2)
    m["feret_ratio"]     = _r(fer["feret_ratio"], 4)
    m["feret_angulo_max"]= _r(fer["angulo_feret_max"], 1)
    m["feret_angulo_min"]= _r(fer["angulo_feret_min"], 1)
    m["feret_clasificacion"] = fer["feret_clasificacion"]

    # ── 25. Ángulos internos en vértices ───────────────────────────────────
    ang_pts = np.array(verts["points"], dtype=np.float64) if verts["count"] >= 3 else pts
    ang_data = _angulos_vertices(ang_pts)
    m["angulo_medio_vertices"]  = _r(ang_data["angulo_medio"], 1)
    m["angulo_predominante"]    = _r(ang_data["angulo_predominante"], 1)
    m["desviacion_angulos"]     = _r(ang_data["desviacion_angulos"], 1)
    m["num_angulos_rectos"]     = ang_data["num_angulos_rectos"]
    m["num_angulos_agudos"]     = ang_data["num_angulos_agudos"]
    m["num_angulos_obtusos"]    = ang_data["num_angulos_obtusos"]
    nr = ang_data["num_angulos_rectos"]
    if nr >= 4:                                 m["geometria_vertices"] = "Rectangular/Cuadrangular"
    elif 2 <= nr < 4:                           m["geometria_vertices"] = "Trapezoidal/Triangular"
    elif ang_data["angulo_medio"] > 150:        m["geometria_vertices"] = "Suavemente curvado"
    else:                                       m["geometria_vertices"] = "Polígono irregular"

    # ── 16. Clasificación automática de forma (taxonomía extendida) ──────────
    # Ejecutada aquí para tener acceso completo a: indice_estrellamiento (paso 21),
    # indice_lobularidad (paso 22), curvatura (paso 18), rugosidad (paso 19)
    # y ángulos internos de vértices (paso 25).
    def _clasificar():
        ar_v   = ar or 1.0
        sol    = solidez
        lob    = m.get("indice_lobularidad", 1.0) or 1.0
        est    = m.get("indice_estrellamiento", 0.0) or 0.0
        perd   = m.get("perdida_area_fragmentacion_percent", 0.0) or 0.0
        exc_v  = exc.get("excentricidad", 0.0)
        rec_v  = m.get("rectangularity") or 0.0
        n_rect = ang_data.get("num_angulos_rectos", 0)
        n_ag   = ang_data.get("num_angulos_agudos", 0)
        n_ob   = ang_data.get("num_angulos_obtusos", 0)
        elon_v = elon
        circF  = m.get("circularity_fragmentada", 1.0) or 1.0

        # Vértices con epsilon grueso (3% del perímetro) → clasificación poligonal
        arc_len  = _perimeter(pts)
        eps_c    = max(4.0, arc_len * 0.03)
        approx_c = cv2.approxPolyDP(
            pts.reshape(-1, 1, 2).astype(np.float32), eps_c, True
        )
        nv = len(approx_c)

        # 1. Lunar: toroide incompleto (le falta una sección del anillo)
        #    — va ANTES de Anular porque comparte sol<0.55 y perd>25%
        #    Distinción clave vs Anular: el arco abierto traza borde exterior +
        #    borde interior → circF muy bajo (<0.35). Un anillo completo procesado
        #    como contorno exterior tiene circF alto.
        if sol < 0.65 and perd > 8.0 and circF < 0.35 and circ > 0.55:
            return "Lunar", _r(max(0.3, (1.0 - sol) * 0.8), 3)

        # 2. Anular/Perforado: anillo completo (hueco topológico interior)
        if sol < 0.55 and (perd or 0) > 25.0:
            return "Anular/Perforado", _r(min(1.0 - sol + 0.1, 1.0), 3)

        # 3. Circular: alta circularidad + compacto + no elongado
        if circ > 0.90 and sol > 0.88 and elon_v < 0.25:
            return "Circular", _r(circ, 3)

        # 4. Subcircular: casi circular con ligera irregularidad
        if circ > 0.78 and exc_v < 0.45 and sol > 0.82 and elon_v < 0.35:
            return "Subcircular", _r((circ + sol) / 2, 3)

        # 5. Amigdaloide: óvalo/almendrada — contorno curvo, muy convexo, AR moderado
        #    Guía §I: arNorm 0.53-0.85 → ar 1.18-1.89; exc ≈ 0.50-0.88; sol ≥ 0.83
        #    nv > 4 excluye rombos y trapecios (polígonos de 4 vértices con misma exc/sol)
        if sol >= 0.83 and 0.50 <= exc_v < 0.88 and circ > 0.60 and ar_v <= 2.0 and nv > 4:
            return "Amigdaloide", _r((sol + circ) / 2, 3)

        # 6. Laminar: aspect ratio > 3 — va antes de checks de vértices
        #    porque una elipse muy elongada puede reducirse a nv=4 con epsilon 3%
        if ar_v > 3.0:
            return "Laminar", _r(min(ar_v / 6.0, 1.0), 3)

        # 7. Lanceolada: hoja o punta lanceolada (elongada, ar 1.7-3.0)
        #    Guía §I: arNorm 0.28-0.55 → ar 1.8-3.5; circ 0.46-0.76; sol ≥ 0.66
        if 1.7 < ar_v <= 3.0 and 0.46 <= circ < 0.78 and sol >= 0.66:
            return "Lanceolada", _r((sol + circ) / 2, 3)

        # 8. Triangular: 3 vértices estrictos (bordes rectos)
        #    O 4 vértices con circ baja y ángulos agudos dominantes
        if nv == 3 or (nv == 4 and circ < 0.65 and n_ag >= 2):
            return "Triangular", _r(min(sol, 0.95), 3)

        # 9. Rectangular: 4 vértices + ≥3 ángulos rectos + buena rectangularidad
        if nv == 4 and n_rect >= 3 and rec_v > 0.65:
            return "Rectangular", _r((sol + rec_v) / 2, 3)

        # 10. Trapezoidal: 4 vértices + 2 ángulos rectos (trapecio)
        #     Guía §I: 2-3 ángulos rectos en hull simplificado
        if nv == 4 and n_rect == 2 and sol > 0.70:
            return "Trapezoidal", _r(sol * 0.9, 3)

        # 11. Romboidal: 4 vértices + 0 rectos + ≥2 agudos + ≥1 obtuso
        #     Guía §I: 0 ángulos rectos + ≥2 agudos + ≥2 obtusos
        if nv == 4 and n_rect == 0 and n_ag >= 2 and n_ob >= 1 and sol > 0.70:
            return "Romboidal", _r(sol * 0.85, 3)

        # 12. Cuadrangular: 4 vértices (fallback general — rombos, trapecios no captados)
        if nv == 4 and sol > 0.70:
            return "Cuadrangular", _r(sol * 0.9, 3)

        # 13. Pentagonal: 5 vértices compactos
        if nv == 5 and sol > 0.72:
            return "Pentagonal", _r(sol, 3)

        # 14. Hexagonal: 6 vértices compactos
        if nv == 6 and sol > 0.75:
            return "Hexagonal", _r(sol, 3)

        # 15. Elipsoidal (después de polígonos y curvilíneos arqueológicos)
        if circ > 0.50 and 0.25 < exc_v < 0.90 and ar_v < 3.5 and sol > 0.80:
            return "Elipsoidal", _r(circ * 0.5 + min(exc_v / 0.8, 1.0) * 0.5, 3)

        # 18. Poligonal: 7-14 vértices con buena solidez y circularity
        if 7 <= nv <= 14 and sol > 0.72 and circ > 0.45:
            return "Poligonal", _r(min(sol * circ + 0.1, 1.0), 3)

        # 19. Estrellado: proyecciones radiales (compacto, no elongado, baja circ)
        if est > 0.50 and lob > 1.15 and elon_v < 0.45 and circ < 0.70:
            return "Estrellado", _r(min(est / 0.70, 1.0), 3)

        # 20. Lobulado: borde con lóbulos (bilobulado, trilobulado, etc.)
        if lob > 1.20 and sol > 0.58:
            return "Lobulado", _r(min((lob - 1.0) * 4.0, 1.0), 3)

        # 21. Irregular redondeado: circularity media con buena solidez
        if 0.42 < circ <= 0.78 and sol > 0.65:
            return "Irregular redondeado", _r(circ, 3)

        # 22. Irregular: fallback general
        return "Irregular", _r(max(0.15, sol * 0.45), 3)

    f_nombre, f_conf = _clasificar()
    m["forma_detectada"] = f_nombre
    m["forma_confianza"] = _r(f_conf, 3)
    m["forma_categoria"] = {
        # Curvilíneas
        "Circular":             "Curvilíneo",
        "Subcircular":          "Curvilíneo",
        "Elipsoidal":           "Curvilíneo",
        "Laminar":              "Curvilíneo",
        "Lanceolada":           "Curvilíneo",
        "Amigdaloide":          "Curvilíneo",
        "Lunar":                "Curvilíneo",
        "Lobulado":             "Curvilíneo",
        # Poligonales
        "Triangular":           "Poligonal",
        "Rectangular":          "Poligonal",
        "Cuadrangular":         "Poligonal",
        "Trapezoidal":          "Poligonal",
        "Romboidal":            "Poligonal",
        "Pentagonal":           "Poligonal",
        "Hexagonal":            "Poligonal",
        "Poligonal":            "Poligonal",
        # Radial
        "Estrellado":           "Radial",
        # Topológico
        "Anular/Perforado":     "Topológico",
        # Irregular
        "Irregular redondeado": "Irregular",
        "Irregular":            "Irregular",
    }.get(f_nombre, "Irregular")

    # ── 26. Convex hull — campos de compatibilidad con el bridge JS ────────
    m["convex_hull_area"]      = _r(hull_area)
    m["convex_hull_perimeter"] = _r(hull_perim)
    m["convex_hull_points"]    = hull_pts.astype(float).tolist()

    # ── 27. Textura básica (varianza/entropía/Sobel) ───────────────────────
    # Usa img_bgr si se pasó pre-decodificada (evita decode redundante en bucle)
    tex = _textura_superficie(img_bgr if img_bgr is not None else image_bytes, pts)
    m["varianza_interna"]    = tex["varianza_interna"]
    m["entropia_superficie"] = tex["entropia_superficie"]
    m["gradiente_medio"]     = tex["gradiente_medio"]

    # ── 28. Convexidad P_hull/P_real + clase ─────────────────────────────
    # Guía §III: convexity = P_Hull / P_real
    conv = hull_perim / perim_real if perim_real > 0 else 1.0
    m["convexity"]      = _r(min(conv, 1.0), 4)   # nunca >1 (hull ≤ real)
    m["convexity_real"] = _r(min(conv, 1.0), 4)
    if conv >= 0.97:    m["convexity_class"] = "Totalmente convexo"
    elif conv >= 0.92:  m["convexity_class"] = "Mayormente convexo"
    elif conv >= 0.80:  m["convexity_class"] = "Moderadamente cóncavo"
    elif conv >= 0.65:  m["convexity_class"] = "Muy cóncavo"
    else:               m["convexity_class"] = "Extremadamente cóncavo"

    # ── 29. Clasificaciones textuales de los índices (Guía §III-V) ────────
    # shape_class_circularity
    c = circ
    if c >= 0.85:    m["shape_class_circularity"] = "Circular"
    elif c >= 0.70:  m["shape_class_circularity"] = "Subcircular"
    elif c >= 0.55:  m["shape_class_circularity"] = "Subelíptica"
    elif c >= 0.40:  m["shape_class_circularity"] = "Alargada"
    else:            m["shape_class_circularity"] = "Muy alargada/irregular"

    # shape_class_compactness
    cp = m.get("compactness") or 0
    if cp >= 0.90:   m["shape_class_compactness"] = "Muy compacta"
    elif cp >= 0.75: m["shape_class_compactness"] = "Compacta"
    elif cp >= 0.60: m["shape_class_compactness"] = "Moderadamente compacta"
    elif cp >= 0.45: m["shape_class_compactness"] = "Dispersa"
    else:            m["shape_class_compactness"] = "Muy dispersa"

    # shape_class_aspect
    ar_v = m.get("aspect_ratio_tight") or 1.0
    if 0.9 <= ar_v <= 1.1:   m["shape_class_aspect"] = "Cuadrada/Equidimensional"
    elif ar_v <= 1.5:         m["shape_class_aspect"] = "Rectangular moderada"
    elif ar_v <= 3.0:         m["shape_class_aspect"] = "Alargada horizontal"
    else:                     m["shape_class_aspect"] = "Extremadamente alargada"

    # shape_class_complexity  (ICI = contour_complexity_index)
    ici = m.get("contour_complexity_index") or 1.0
    if ici < 1.1:    m["shape_class_complexity"] = "Simple"
    elif ici < 1.5:  m["shape_class_complexity"] = "Moderada"
    elif ici < 2.0:  m["shape_class_complexity"] = "Compleja"
    else:            m["shape_class_complexity"] = "Muy compleja/irregular"

    # ── 30. Centroide del Convex Hull (Guía §VI) ──────────────────────────
    # cxh/cyh calculado en paso 2b — solo almacenar.
    m["centroide_hull_x"] = _r(cxh, 2)
    m["centroide_hull_y"] = _r(cyh, 2)

    # ── 31. Puntos de radio máximo y mínimo (Guía §II) ───────────────────
    # Usa centroide CH — coherente con _radios_extremos (paso 20).
    # Radio máximo: vértice del hull más alejado del centroide CH
    dx_h = hull_pts[:, 0] - cxh; dy_h = hull_pts[:, 1] - cyh
    idx_max = int(np.argmax(dx_h**2 + dy_h**2))
    m["punto_radio_maximo"] = [_r(hull_pts[idx_max, 0], 2), _r(hull_pts[idx_max, 1], 2)]

    # Radio mínimo: punto del contorno completo más cercano al centroide CH
    dx_f = pts[:, 0] - cxh; dy_f = pts[:, 1] - cyh
    idx_min = int(np.argmin(dx_f**2 + dy_f**2))
    m["punto_radio_minimo"] = [_r(pts[idx_min, 0], 2), _r(pts[idx_min, 1], 2)]

    # ── 32. Aliases bounding box (Guía §II: bounding_width/height) ────────
    m["bounding_width"]  = m["width"]
    m["bounding_height"] = m["height"]

    # ── 33. Completitud estimada (Guía §VIII) ─────────────────────────────
    # Estimación simple por convexidad: 100% = objeto convexo/completo
    completitud_conv = min(conv, 1.0) * 100
    # Estimación por solidez: qué proporción del hull está presente
    completitud_solid = solidez * 100
    # Media ponderada (convexidad peso 0.4, solidez peso 0.6)
    completitud = _r(0.4 * completitud_conv + 0.6 * completitud_solid, 1)
    m["completitud_estimada"] = completitud
    m["completitud_metodo_convexidad"] = _r(completitud_conv, 1)
    # Es fragmento si completitud < 85%
    m["completitud_es_fragmento"] = bool((completitud or 100) < 85.0)

    # ── 34. Defectos de convexidad MAO_IA (Guía §VIII ampliado) ──────────
    # cv2.convexityDefects(): concavidades del contorno respecto al convex hull.
    # Clave para: perforaciones/horadaciones, fragmentación, retoque bifácial.
    try:
        cd = convexity_defects_from_contour(contour_points)
        m["convexity_defects"] = cd
        # Clasificación sintética por número y profundidad de defectos
        n_def  = cd.get("num_defectos", 0)
        d_max  = cd.get("profundidad_max_px", 0.0)
        # §X — Profundidad media promovida a campo de primer nivel
        m["profundidad_media_px"] = _r(cd.get("profundidad_media_px", 0.0), 2)
        # §X — Fracción de arco cóncavo: f_cx = arco_cóncavo_total / P_frag
        arco_total = cd.get("arco_concavo_total_px", 0.0)
        m["fraccion_arco_concavo"] = _r(arco_total / perim_real, 4) if perim_real > 0 else 0.0
        if n_def == 0:
            m["convexity_defects_class"] = "Sin concavidades"
        elif n_def <= 2 and d_max < 20:
            m["convexity_defects_class"] = "Concavidades menores"
        elif n_def <= 5 or d_max < 50:
            m["convexity_defects_class"] = "Concavidades moderadas (posible horadación)"
        else:
            m["convexity_defects_class"] = "Concavidades profundas múltiples"
    except Exception:
        m["convexity_defects"] = None
        m["convexity_defects_class"] = None
        m["profundidad_media_px"] = None
        m["fraccion_arco_concavo"] = None

    return {"status": "ok", "metricas": m, "scale_px_mm": sc}


# ── Textura GLCM (endpoint /texture) ────────────────────────────────────

async def texture(
    image_bytes: bytes,
    mask_bytes: "bytes | None" = None,
    distances: "list | None" = None,
    angles: "list | None" = None,
) -> dict:
    """
    Análisis de textura GLCM con scikit-image.
    Incluye: contrast, dissimilarity, homogeneity, energy, correlation, entropy.
    Cae a métricas básicas si scikit-image no está disponible.
    """
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="No se pudo decodificar la imagen.")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    mask_bool = None
    if mask_bytes:
        marr = np.frombuffer(mask_bytes, dtype=np.uint8)
        mimg = cv2.imdecode(marr, cv2.IMREAD_GRAYSCALE)
        if mimg is not None and mimg.shape == gray.shape:
            mask_bool = mimg > 127

    try:
        from skimage.feature import graycomatrix, graycoprops
        dists    = distances or [1, 2, 4]
        angles_r = [math.radians(a) for a in (angles or [0, 45, 90, 135])]
        roi      = np.where(mask_bool, gray, 0).astype(np.uint8) if mask_bool is not None else gray
        glcm     = graycomatrix(roi, distances=dists, angles=angles_r,
                                levels=256, symmetric=True, normed=True)
        contrast    = float(graycoprops(glcm, "contrast").mean())
        dissim      = float(graycoprops(glcm, "dissimilarity").mean())
        homogeneity = float(graycoprops(glcm, "homogeneity").mean())
        energy      = float(graycoprops(glcm, "energy").mean())
        correlation = float(graycoprops(glcm, "correlation").mean())
        entropy     = float(-np.sum(glcm * np.log2(glcm + 1e-10)))

        if homogeneity > 0.7 and energy > 0.5:
            interp = "Superficie lisa — alta elaboración"
        elif contrast > 50:
            interp = "Superficie muy irregular — bordes de talla marcados"
        elif entropy > 5:
            interp = "Superficie compleja — múltiples texturas"
        else:
            interp = "Superficie moderadamente texturizada"

        return {
            "status": "ok",
            "glcm": {"contrast": _r(contrast, 4), "dissimilarity": _r(dissim, 4),
                     "homogeneity": _r(homogeneity, 4), "energy": _r(energy, 4),
                     "correlation": _r(correlation, 4), "entropy": _r(entropy, 4)},
            "interpretation": interp,
        }
    except ImportError:
        pix = gray[mask_bool] if mask_bool is not None else gray.flatten()
        return {
            "status": "ok_basic",
            "message": "scikit-image no disponible; métricas básicas",
            "glcm": {"varianza": _r(float(pix.var()), 4),
                     "media": _r(float(pix.mean()), 4)},
        }
