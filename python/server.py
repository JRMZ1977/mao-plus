"""
MAO Plus — Servidor FastAPI
Fase 2: Infraestructura base. Los endpoints están definidos y documentados
pero delegan al motor JS existente hasta que se implemente cada módulo Python.

Arranque:
    uvicorn python.server:app --host 127.0.0.1 --port 8765 --reload

O desde Electron (main.js):
    const py = spawn(pythonPath, ['-m', 'uvicorn', 'python.server:app',
                     '--host', '127.0.0.1', '--port', '8765'])
"""

import asyncio
import base64
import logging
import math
import os
import time
from typing import Optional
import numpy as np

_BOOT_TIME = time.monotonic()

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse as StarletteJSONResponse, Response
from starlette.formparsers import MultiPartParser
import uvicorn

# Aumentar el límite por campo de python-multipart (default 1 MB).
# Los endpoints que envían JSON grande como Form() (classify, bifacial, pca, etc.)
# pueden superar el límite cuando las métricas incluyen puntos de contorno.
MultiPartParser.max_part_size = _MAX_FORM_FIELD_BYTES = 10 * 1024 * 1024  # 10 MB

from python.config import (
    SERVER_HOST, SERVER_PORT, API_VERSION, API_PREFIX, ALLOWED_ORIGINS,
    MAX_IMAGE_SIZE_MB,
)
from python import modules
from python.modules import sam_segmenter

_log = logging.getLogger("mao.server")

# Límite de payload en bytes (derivado de config)
_MAX_UPLOAD_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024


# ── Helper: leer UploadFile con validación de tamaño ────────────────────────
async def _read_image(upload: UploadFile) -> bytes:
    """Lee el archivo subido y rechaza si supera MAX_IMAGE_SIZE_MB."""
    data = await upload.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Imagen demasiado grande ({len(data)//1024//1024} MB). "
                   f"Máximo permitido: {MAX_IMAGE_SIZE_MB} MB.",
        )
    return data


# ── Aplicación ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="MAO Plus API",
    description="Backend Python para análisis morfométrico de objetos arqueológicos",
    version=API_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)


# ── Middleware: rechazar requests con Content-Length excesivo ────────────────
class MaxUploadSizeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > _MAX_UPLOAD_BYTES:
            return Response(
                content=f"Payload demasiado grande. Máximo: {MAX_IMAGE_SIZE_MB} MB.",
                status_code=413,
            )
        return await call_next(request)

app.add_middleware(MaxUploadSizeMiddleware)

# ── CORS (solo localhost + Electron) ─────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

# ── Exception handler para validación de Pydantic ──────────────────────────
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    """Mejora los mensajes de error de validación con información clara."""
    errors = exc.errors()
    detail = {
        "error": "Error de validación en los parámetros",
        "validation_errors": []
    }
    
    for error in errors:
        loc = '.'.join(str(x) for x in error['loc'][1:])  # Omitir 'body'
        detail["validation_errors"].append({
            "field": loc,
            "type": error['type'],
            "message": error['msg']
        })
    
    return StarletteJSONResponse(status_code=422, content=detail)

# ============================================================================
# RAÍZ / SALUD
# ============================================================================

@app.get(f"{API_PREFIX}/health")
async def health():
    """
    Verificación de estado. El frontend JS llama a este endpoint al iniciar
    para saber si el servidor Python está disponible.
    Si falla, la app continúa usando el motor JS completo (sin Python).
    """
    return {
        "status": "ok",
        "version": API_VERSION,
        "modules": modules.available_modules(),
        "modules_failed": modules.failed_modules(),
        "pid": os.getpid(),
        "uptime_s": round(time.monotonic() - _BOOT_TIME, 2),
    }


@app.get(f"{API_PREFIX}/capabilities")
async def capabilities():
    """
    Describe qué capacidades Python están activas. Permite al frontier
    JS decidir qué llamadas enrutar a Python vs. ejecutar localmente.
    """
    return modules.get_capabilities()


# ============================================================================
# MÓDULO: DETECCIÓN DE OBJETOS
# Reemplazará: detectObjectsAutomatically() en analysis-core.js
# Biblioteca candidata: OpenCV (cv2.findContours, watershed)
# ============================================================================

@app.post(f"{API_PREFIX}/detect")
async def detect_objects(
    image: UploadFile = File(...),
    threshold: float  = Form(default=0.5),
    min_area: int     = Form(default=100),
    max_objects: int  = Form(default=50),
):
    """
    Detecta objetos en una imagen usando OpenCV.

    Reemplaza: detectObjectsAutomatically() — analysis-core.js ~línea 55406
    Bibliotecas candidatas:
      - cv2.threshold + cv2.findContours  (actual, ya implementado en JS)
      - cv2.watershed                     (mejora: separa objetos pegados)
      - cv2.GrabCut                       (mejora: fondo no uniforme)

    Estado: IMPLEMENTADO (✅) — módulo detection.detect() funcional.
    """
    data = await _read_image(image)
    result = await modules.detection.detect(
        image_bytes=data,
        threshold=threshold,
        min_area=min_area,
        max_objects=max_objects,
    )
    return result


# ============================================================================
# MÓDULO: ANÁLISIS MAO_IA — detección con parámetros controlados por usuario
# Llama a detect_with_mao_ia() con pipeline completo: CLAHE → blur → umbral →
# findContours → descriptores morfológicos por objeto.
# ============================================================================

@app.post(f"{API_PREFIX}/mao-ia")
async def mao_ia_detect(
    image:             UploadFile = File(...),
    threshold_method:  str        = Form(default="otsu"),   # otsu|adaptive|manual
    threshold_value:   int        = Form(default=127),
    min_area:          float      = Form(default=200.0),
    blur_kernel:       int        = Form(default=5),
    invert:            bool       = Form(default=False),
    use_clahe:         bool       = Form(default=False),
    clahe_clip:        float      = Form(default=2.0),
    clahe_tile:        int        = Form(default=8),
    max_objects:       int        = Form(default=50),
):
    """
    Detección completa usando el pipeline MAO_IA con parámetros controlados.

    Permite al usuario ajustar umbralización, CLAHE y filtros desde la UI
    antes de lanzar el análisis. Equipara los controles del app MAO_IA
    standalone dentro del flujo de MAO Plus.

    Retorna la misma estructura que /api/detect + descriptor morfológico
    completo (circularity, solidity, extent, equivalent_diameter,
    convexity_defects) para cada objeto detectado.
    """
    from python.modules.mao_ia_analyzer import detect_with_mao_ia
    data = await _read_image(image)
    if threshold_method not in ("otsu", "adaptive", "manual"):
        raise HTTPException(status_code=422, detail=f"threshold_method inválido: '{threshold_method}'. Valores permitidos: otsu, adaptive, manual")
    result = await detect_with_mao_ia(
        image_bytes=data,
        threshold_method=threshold_method,
        threshold_value=threshold_value,
        min_area=min_area,
        blur_kernel=blur_kernel,
        invert=invert,
        use_clahe=use_clahe,
        clahe_clip=clahe_clip,
        clahe_tile=clahe_tile,
        max_objects=max_objects,
    )
    return result


# ============================================================================
# MÓDULO: EXTRACCIÓN DE CONTORNO
# Reemplazará: extraerContornoReal() — analysis-core.js
# Biblioteca candidata: OpenCV (cv2.findContours, cornerSubPix)
# ============================================================================

@app.post(f"{API_PREFIX}/contour")
async def extract_contour(
    image:    UploadFile = File(...),
    bbox_x:   int        = Form(...),
    bbox_y:   int        = Form(...),
    bbox_w:   int        = Form(...),
    bbox_h:   int        = Form(...),
    subpixel: bool       = Form(default=True),
    simplify: float      = Form(default=2.0),
):
    """
    Extrae contorno exacto del objeto dentro del bounding box.

    Reemplaza:
      - extraerContornoReal()         analysis-core.js ~línea 15808
      - trazarContornoMoore()         analysis-core.js ~línea 17851
      - refinarContornoSubPixel()     analysis-core.js ~línea 16917
      - simplificarContornoInteligente() analysis-core.js ~línea 18900

    Bibliotecas candidatas:
      - cv2.findContours (CHAIN_APPROX_NONE)    → contorno completo
      - cv2.cornerSubPix                         → refinamiento sub-píxel real
      - cv2.approxPolyDP (Douglas-Peucker)       → simplificación
      - shapely.Polygon                          → validación geometría

    Estado: IMPLEMENTADO (✅) — módulo contour.extract() funcional.
    """
    data = await _read_image(image)
    result = await modules.contour.extract(
        image_bytes=data,
        bbox=(bbox_x, bbox_y, bbox_w, bbox_h),
        subpixel=subpixel,
        simplify_tolerance=simplify,
    )
    return result


# ============================================================================
# MÓDULO: CÁLCULO DE MÉTRICAS
# Reemplazará: calcularMetricasDesdeContorno() — analysis-core.js
# Biblioteca candidata: shapely, scipy, cv2
# ============================================================================

@app.post(f"{API_PREFIX}/metrics")
async def calculate_metrics(
    image:         UploadFile = File(...),
    contour_json:  str        = Form(...),   # JSON: [[x,y], ...]
    scale_px_mm:   float      = Form(default=1.0),
):
    """
    Calcula ~108 métricas morfométricas a partir del contorno.

    Reemplaza (análisis-core.js):
      calcularMetricasMorfologicas()  ~L9362
      calcularMetricasContorno()      ~L4724  — Shoelace, convex hull, centroide
      calcularExcentricidad()         ~L5653  — tensor de inercia de área
      calcularSimetriaBilateral()     ~L5760  — Hausdorff rotado al eje mayor
      calcularCurvaturaLocal()        ~L5858  — curvatura de Menger
      calcularRugosidadContorno()     ~L5950  — CV de longitudes de segmento
      calcularEjePrincipal()          ~L6458  — eigenvalores del tensor de inercia
      calcularDiametroFeret()         ~L6602  — barrido 90 ángulos
      calcularRadiosExtremos()        ~L6364  — Rmax/Rmin desde centroide

    Grupos de métricas retornadas:
      área/perímetro (hull + fragmentado), circularidad, compacidad,
      rectangularidad, solidez, elongación, factor de forma, excentricidad,
      ejes de inercia, orientación, simetría bilateral, curvatura Menger,
      rugosidad (CV), radios extremos, estrellamiento, lobularidad,
      energía de curvatura, Feret, ángulos de vértices, textura básica.

    Estado: IMPLEMENTADO (IMPLEMENTED=True).
    """
    import json
    if not modules.metrics.IMPLEMENTED:
        return {"status": "not_implemented",
                "message": "Módulo de métricas no implementado; usar motor JS"}
    data   = await _read_image(image)
    points = json.loads(contour_json)
    result = await modules.metrics.calculate(
        image_bytes=data,
        contour_points=points,
        scale_px_mm=scale_px_mm,
    )
    return result


# ============================================================================
# MÓDULO: MORFOMETRÍA 3D (OBJ) + PCA
# ============================================================================

@app.post(f"{API_PREFIX}/obj3d/metrics")
async def calculate_obj3d_metrics(
    obj_file: UploadFile = File(...),
    n_samples: int = Form(default=20000),
    n_sections: int = Form(default=9),
    normalize_mode: str = Form(default="none"),
    analysis_level: str = Form(default="pca"),
    orientation_mode: str = Form(default="auto"),
    user_anchor_x: Optional[float] = Form(default=None),
    user_anchor_y: Optional[float] = Form(default=None),
    user_anchor_z: Optional[float] = Form(default=None),
    mm_per_unit: float = Form(default=1.0),
    comparator_ready: bool = Form(default=False),
):
    """
        Analiza una malla 3D en formato OBJ y calcula métricas morfométricas.

    Retorna:
            analysis_level='pca' (default):
                - eigenvalues / explained_variance_ratio
                - linearity / planarity / sphericity / elongation
                - extents en ejes PCA
                - área superficial y volumen (si watertight)

            analysis_level='hybrid_v1':
                - orientación canónica reproducible (PCA + reglas de signo)
                - variables de forma 3D
                - decisión inicial monofacial/bifacial
                - calidad del análisis (quality_flags)

            mm_per_unit: factor de conversión de unidades OBJ a mm
                (1.0=mm, 10.0=cm, 1000.0=m, 25.4=pulgadas)
    """
    if not getattr(modules, "obj3d", None):
        return {
            "status": "not_implemented",
            "message": "Módulo obj3d no disponible en este servidor.",
        }

    data = await obj_file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Archivo demasiado grande ({len(data)//1024//1024} MB). "
                f"Máximo permitido: {MAX_IMAGE_SIZE_MB} MB."
            ),
        )

    # Validar n_sections: impar, rango [9, 33]
    _ns = max(9, min(33, int(n_sections)))
    if _ns % 2 == 0:
        _ns = min(_ns + 1, 33)

    result = await modules.obj3d.analyze(
        obj_bytes=data,
        n_samples=n_samples,
        n_sections=_ns,
        normalize_mode=normalize_mode,
        analysis_level=analysis_level,
        orientation_mode=orientation_mode,
        user_anchor=(user_anchor_x, user_anchor_y, user_anchor_z),
        mm_per_unit=mm_per_unit,
    )

    if comparator_ready and isinstance(result, dict) and result.get("status") == "ok":
        try:
            adapter = getattr(modules.obj3d, "flatten_3d_for_comparator", None)
            if callable(adapter):
                result["comparator_ready"] = adapter(result)
        except Exception:
            result["comparator_ready"] = {"metricas": {}}

    return result


# ============================================================================
# ANÁLISIS 2D DE CONTORNO CANÓNICO (desde visor 3D)
# Convierte un contorno [[x,y],...] en unidades físicas en un objeto 2D
# analizable con el mismo pipeline de métricas que el modo objeto 2D.
# ============================================================================

@app.post(f"{API_PREFIX}/obj3d/contour-analyze")
async def analyze_canonical_contour(
    contour_json: str   = Form(...),   # JSON: [[x,y],...] en unidades OBJ
    mm_per_unit:  float = Form(default=1.0),
    label:        str   = Form(default="contorno_3d"),
    pieces_json:  Optional[str] = Form(default=None),  # JSON: [[[x,y],...], ...] piezas separadas
    holes_json:   Optional[str] = Form(default=None),  # JSON: [[[x,y],...], ...] perforaciones
):
    """
    Analiza un contorno canónico 3D→2D con el pipeline completo de métricas 2D.

    Recibe puntos [[x,y],...] en coordenadas OBJ (unidades físicas), rasteriza
    el polígono en un canvas PNG y llama a metrics.calculate() con la escala
    px→mm correcta.

    Retorna: { status, label, metricas, scale_px_mm, preview_b64, bbox_units }
    """
    import json, base64

    if not modules.metrics.IMPLEMENTED:
        raise HTTPException(status_code=501, detail="Módulo de métricas no implementado.")

    # ── Fase 4: motor de raster unificado ──────────────────────────────────
    # Antes este endpoint inlinaba su propia rasterización (CANVAS=400 fijo).
    # Ahora delega en `rasterize_canonical_contour` (Fase 1), el MISMO helper
    # que consume el pipeline 2D core cuando `obj._canonicalRaster=true`.
    # Resultado: paridad numérica garantizada entre modal Ruta A y tarjetas.
    from python.modules.obj3d_canonical_raster import rasterize_canonical_contour

    try:
        pts_raw = json.loads(contour_json)
    except Exception:
        raise HTTPException(status_code=400, detail="contour_json no es JSON válido.")

    if len(pts_raw) < 3:
        raise HTTPException(status_code=400, detail="Se necesitan al menos 3 puntos de contorno.")

    pts_arr = np.array(pts_raw, dtype=np.float64)
    if pts_arr.ndim != 2 or pts_arr.shape[1] != 2:
        raise HTTPException(status_code=400, detail="Contorno debe ser [[x,y],...] 2D.")

    # ── Convex hull para bbox (estándar morfológico MAO) ──────────────────
    try:
        from scipy.spatial import ConvexHull as _CvxHull
        _hull_idx = _CvxHull(pts_arr).vertices
        _hull_pts_arr = pts_arr[_hull_idx]
    except Exception:
        _hull_pts_arr = pts_arr

    # ── Conversión OBJ → mm (contrato del helper canónico) ────────────────
    pts_mm = (pts_arr * float(mm_per_unit)).tolist()

    # ── Piezas separadas (caso envolvente · N piezas) y perforaciones ────
    # Cuando el modal envía un envelope formado por varias piezas, debe
    # mandarlas también en `pieces_json` para que cada una se rasterice
    # como un polígono cerrado independiente (sin líneas fantasma entre
    # piezas). `contour_json` sigue siendo la UNIÓN de todos los puntos
    # (usada para hull, bbox y métricas).
    pieces_mm_list: Optional[list] = None
    if pieces_json:
        try:
            raw_pieces = json.loads(pieces_json)
            pieces_mm_list = [
                (np.asarray(p, dtype=np.float64) * float(mm_per_unit)).tolist()
                for p in raw_pieces
                if isinstance(p, list) and len(p) >= 3
            ] or None
        except Exception:
            raise HTTPException(status_code=400, detail="pieces_json no es JSON válido.")

    holes_mm_list: Optional[list] = None
    if holes_json:
        try:
            raw_holes = json.loads(holes_json)
            holes_mm_list = [
                (np.asarray(h, dtype=np.float64) * float(mm_per_unit)).tolist()
                for h in raw_holes
                if isinstance(h, list) and len(h) >= 3
            ] or None
        except Exception:
            raise HTTPException(status_code=400, detail="holes_json no es JSON válido.")

    # ── Rasterización canónica (DPI=20 px/mm, padding=10 px) ──────────────
    raster = rasterize_canonical_contour(
        contour_mm=pts_mm,
        dpi=20,
        padding_px=10,
        holes_mm=holes_mm_list,
        background=248,   # fondo gris claro (compatible con el preview previo)
        fill=200,         # relleno gris
        stroke=40,        # borde oscuro
        stroke_width=1,
        pieces_mm=pieces_mm_list,
    )

    image_bytes  = raster["image_png_bytes"]
    contour_px   = raster["contour_points_px"]
    hull_px      = raster["convex_hull_px"]
    scale_px_mm  = raster["scale_mm_per_px"]   # = 1/dpi = 0.05 mm/px

    # ── Contorno para análisis morfométrico ──────────────────────────────
    # Caso envolvente (N piezas): se analiza el CONVEX HULL como un único
    # contorno cerrado y coherente. Pasar la unión cruda de puntos a
    # `metrics.calculate` produciría perímetro y radios sin sentido
    # (los puntos no forman un polígono ordenado). Las piezas individuales
    # se mantienen en el dibujo del raster como representación visual fiel.
    if pieces_mm_list and len(hull_px) >= 3:
        analysis_contour_px = hull_px
    else:
        analysis_contour_px = contour_px

    result = await modules.metrics.calculate(
        image_bytes=image_bytes,
        contour_points=analysis_contour_px,
        scale_px_mm=scale_px_mm,
    )

    metricas = result.get("metricas", {})

    # ── Fase 1: Overlays geométricos en UNIDADES DEL MODELO ──────────────
    # Transformación inversa raster → unidades del modelo:
    #   px = (mm - min_xy_mm) * dpi + padding_px        (rasterizador)
    #   unit = (px - padding_px) / dpi / mm_per_unit + min_xy_unit
    # Longitudes:  len_unit = len_px / dpi / mm_per_unit
    # NOTA: el rasterizador NO aplica flip Y, así que las (x,y) devueltas
    # están en el mismo sistema que `pts_arr` (XY canónicas del modelo 3D).
    geometry_overlays: dict = {}
    try:
        import cv2 as _cv2_ov
        _dpi      = float(raster["dpi"])
        _pad_px   = float(raster["padding_px"])
        _mpu      = float(mm_per_unit) if mm_per_unit and mm_per_unit > 0 else 1.0
        _min_xy_u = pts_arr.min(axis=0)
        _min_x_u, _min_y_u = float(_min_xy_u[0]), float(_min_xy_u[1])

        def _p2u(px, py):
            return [
                (float(px) - _pad_px) / _dpi / _mpu + _min_x_u,
                (float(py) - _pad_px) / _dpi / _mpu + _min_y_u,
            ]

        def _len_u(length_px):
            return float(length_px) / _dpi / _mpu

        # Centroide CR (Shoelace, contorno real) — campo directo de metricas
        cx_px = float(metricas.get("centroide_x", 0.0))
        cy_px = float(metricas.get("centroide_y", 0.0))
        geometry_overlays["centroid"] = _p2u(cx_px, cy_px)

        # Centroide del Convex Hull — referencia para ejes y radios
        cxh_px = float(metricas.get("centroide_hull_x", cx_px))
        cyh_px = float(metricas.get("centroide_hull_y", cy_px))
        geometry_overlays["centroid_hull"] = _p2u(cxh_px, cyh_px)

        # Ejes mayor/menor reconstruidos desde (centroide_real, longitud, ángulo).
        # IMPORTANTE: eje_mayor_px / eje_menor_px se calculan en metrics.py
        # como (p_max − p_min) de las proyecciones de los puntos del contorno
        # sobre la dirección principal, RELATIVOS al centroide real (Shoelace)
        # — NO al centroide del hull. Por eso reproyectamos aquí los puntos
        # del contorno de análisis (en píxeles canónicos) sobre la dirección
        # y dibujamos el segmento desde min(proj) hasta max(proj). Así los
        # extremos rozan realmente los bordes del contorno en esa dirección.
        ang_deg = float(metricas.get("angulo_eje_principal", 0.0))
        ang_rad = math.radians(ang_deg)
        _cos_a, _sin_a = math.cos(ang_rad), math.sin(ang_rad)
        _ac_np = np.asarray(analysis_contour_px, dtype=np.float64)
        if len(_ac_np) >= 2:
            _dx_ac = _ac_np[:, 0] - cx_px
            _dy_ac = _ac_np[:, 1] - cy_px
            # Proyección sobre eje mayor (dir = (cos, sin))
            _p1 = _dx_ac * _cos_a + _dy_ac * _sin_a
            _p1_min, _p1_max = float(_p1.min()), float(_p1.max())
            geometry_overlays["axis_major"] = [
                _p2u(cx_px + _p1_min * _cos_a, cy_px + _p1_min * _sin_a),
                _p2u(cx_px + _p1_max * _cos_a, cy_px + _p1_max * _sin_a),
            ]
            # Proyección sobre eje menor (dir perpendicular = (-sin, cos))
            _p2 = -_dx_ac * _sin_a + _dy_ac * _cos_a
            _p2_min, _p2_max = float(_p2.min()), float(_p2.max())
            geometry_overlays["axis_minor"] = [
                _p2u(cx_px - _p2_min * _sin_a, cy_px + _p2_min * _cos_a),
                _p2u(cx_px - _p2_max * _sin_a, cy_px + _p2_max * _cos_a),
            ]

        # Puntos de radio máx/mín (campos directos de metricas)
        prm = metricas.get("punto_radio_maximo")
        if isinstance(prm, (list, tuple)) and len(prm) == 2:
            geometry_overlays["radius_max_point"] = _p2u(prm[0], prm[1])
            geometry_overlays["radius_max_segment"] = [
                geometry_overlays["centroid_hull"],
                geometry_overlays["radius_max_point"],
            ]
        prn = metricas.get("punto_radio_minimo")
        if isinstance(prn, (list, tuple)) and len(prn) == 2:
            geometry_overlays["radius_min_point"] = _p2u(prn[0], prn[1])
            geometry_overlays["radius_min_segment"] = [
                geometry_overlays["centroid_hull"],
                geometry_overlays["radius_min_point"],
            ]

        # Convex hull (en unidades del modelo)
        if len(hull_px) >= 3:
            geometry_overlays["convex_hull"] = [_p2u(p[0], p[1]) for p in hull_px]

        # Cálculos geométricos adicionales con OpenCV sobre el contorno de análisis
        _cnt_np = np.asarray(analysis_contour_px, dtype=np.float32).reshape(-1, 1, 2)
        if len(_cnt_np) >= 3:
            # Feret máximo: par de vértices del hull con mayor distancia
            if len(hull_px) >= 2:
                _hp = np.asarray(hull_px, dtype=np.float64)
                # Distancias pairwise (hull suele ser pequeño)
                _diff = _hp[:, None, :] - _hp[None, :, :]
                _d2   = (_diff ** 2).sum(axis=2)
                _i, _j = np.unravel_index(int(np.argmax(_d2)), _d2.shape)
                geometry_overlays["feret_max_segment"] = [
                    _p2u(_hp[_i, 0], _hp[_i, 1]),
                    _p2u(_hp[_j, 0], _hp[_j, 1]),
                ]

            # Bounding box orientado (minAreaRect) — 4 vértices
            _rect = _cv2_ov.minAreaRect(_cnt_np.astype(np.float32))
            _box  = _cv2_ov.boxPoints(_rect)  # (4,2) float32
            geometry_overlays["bbox_oriented"] = [_p2u(p[0], p[1]) for p in _box]

            # Feret mínimo: rotating calipers sobre el hull convexo.
            # Para cada arista del hull se mide el ancho perpendicular
            # (máx. distancia de cualquier vértice del hull a la línea de
            # la arista); el Feret min = mínimo de esos anchos. El segmento
            # se traza desde el vértice más lejano hasta el pie de su
            # proyección perpendicular sobre la arista correspondiente, de
            # modo que su longitud == Feret min y su dirección es
            # perpendicular a la dirección de medición.
            if len(hull_px) >= 3:
                _hp_rc = np.asarray(hull_px, dtype=np.float64)
                _N_rc  = len(_hp_rc)
                _best_w     = float("inf")
                _best_edge  = 0
                _best_far   = 0
                for _i_rc in range(_N_rc):
                    _p0 = _hp_rc[_i_rc]
                    _p1 = _hp_rc[(_i_rc + 1) % _N_rc]
                    _edge = _p1 - _p0
                    _el = float(np.linalg.norm(_edge))
                    if _el < 1e-9:
                        continue
                    # Normal unitaria a la arista
                    _n = np.array([-_edge[1], _edge[0]]) / _el
                    # Distancias signadas de cada vértice a la línea
                    _dists = (_hp_rc - _p0) @ _n
                    _w_rc  = float(np.max(np.abs(_dists)))
                    if _w_rc < _best_w:
                        _best_w    = _w_rc
                        _best_edge = _i_rc
                        _best_far  = int(np.argmax(np.abs(_dists)))
                if _best_w < float("inf"):
                    _p0 = _hp_rc[_best_edge]
                    _p1 = _hp_rc[(_best_edge + 1) % _N_rc]
                    _edge      = _p1 - _p0
                    _edge_unit = _edge / float(np.linalg.norm(_edge))
                    _P_far     = _hp_rc[_best_far]
                    _t_proj    = float((_P_far - _p0) @ _edge_unit)
                    _foot      = _p0 + _t_proj * _edge_unit
                    geometry_overlays["feret_min_segment"] = [
                        _p2u(_foot[0], _foot[1]),
                        _p2u(_P_far[0], _P_far[1]),
                    ]

            # Círculo circunscrito mínimo
            (_cc_x, _cc_y), _cc_r = _cv2_ov.minEnclosingCircle(_cnt_np.astype(np.float32))
            geometry_overlays["circumscribed_circle"] = {
                "center": _p2u(_cc_x, _cc_y),
                "radius": _len_u(_cc_r),
            }

            # Círculo inscrito máximo (distance transform sobre máscara binaria)
            try:
                _img_arr  = np.frombuffer(image_bytes, dtype=np.uint8)
                _img_gray = _cv2_ov.imdecode(_img_arr, _cv2_ov.IMREAD_GRAYSCALE)
                if _img_gray is not None:
                    # Máscara: interior del contorno relleno
                    _mask = np.zeros(_img_gray.shape, dtype=np.uint8)
                    _cv2_ov.drawContours(
                        _mask,
                        [_cnt_np.astype(np.int32)],
                        -1, 255, _cv2_ov.FILLED,
                    )
                    _dist = _cv2_ov.distanceTransform(_mask, _cv2_ov.DIST_L2, 5)
                    _, _max_v, _, _max_loc = _cv2_ov.minMaxLoc(_dist)
                    if _max_v > 0:
                        geometry_overlays["inscribed_circle"] = {
                            "center": _p2u(_max_loc[0], _max_loc[1]),
                            "radius": _len_u(_max_v),
                        }
            except Exception:
                pass
    except Exception as _ov_err:
        # No bloqueamos el análisis si los overlays fallan
        geometry_overlays = {"_error": f"overlay_build_failed: {type(_ov_err).__name__}: {_ov_err}"}

    # ── Contorno métrico en unidades del modelo (trazabilidad visual) ────
    # Devuelve el polígono que realmente se midió, en unidades del modelo.
    # Permite al cliente superponerlo como capa "Contorno métrico" sobre el
    # PNG y verificar la fidelidad raster→vector y/o distinguir hull vs
    # contorno real en modo envolvente.
    try:
        _dpi_ac    = float(raster["dpi"])
        _pad_ac    = float(raster["padding_px"])
        _mpu_ac    = float(mm_per_unit) if mm_per_unit and mm_per_unit > 0 else 1.0
        _min_xy_ac = pts_arr.min(axis=0)
        _mx_ac, _my_ac = float(_min_xy_ac[0]), float(_min_xy_ac[1])
        analysis_contour_units = [
            [(float(p[0]) - _pad_ac) / _dpi_ac / _mpu_ac + _mx_ac,
             (float(p[1]) - _pad_ac) / _dpi_ac / _mpu_ac + _my_ac]
            for p in analysis_contour_px
        ]
    except Exception:
        analysis_contour_units = []
    analysis_mode = "envelope_hull" if pieces_mm_list else "single_contour"
    analysis_trace = {
        "n_input_points":  int(len(pts_arr)),
        "n_metric_points": int(len(analysis_contour_px)),
        "n_pieces": len(pieces_mm_list) if pieces_mm_list else 1,
        "parity_error_area_pct":      raster["parity_error_area_pct"],
        "parity_error_perimeter_pct": raster["parity_error_perimeter_pct"],
    }
    # También exponemos el contorno métrico DENTRO de geometry_overlays
    # para que el módulo `obj3d-morph-canvas.js` pueda dibujarlo como una
    # capa más sin necesidad de recibir un objeto adicional.
    if isinstance(geometry_overlays, dict) and "_error" not in geometry_overlays:
        geometry_overlays["analysis_contour"] = analysis_contour_units

    return {
        "status": result.get("status", "ok"),
        "label":  label,
        "metricas": metricas,
        "scale_px_mm": scale_px_mm,
        "preview_b64": base64.b64encode(image_bytes).decode("ascii"),
        "geometry_overlays": geometry_overlays,
        "analysis_contour": analysis_contour_units,
        "analysis_mode": analysis_mode,
        "analysis_trace": analysis_trace,
        "bbox_units": {
            "x_min": float(_hull_pts_arr[:, 0].min()),
            "x_max": float(_hull_pts_arr[:, 0].max()),
            "y_min": float(_hull_pts_arr[:, 1].min()),
            "y_max": float(_hull_pts_arr[:, 1].max()),
            "width":  float(max(_hull_pts_arr[:, 0].max() - _hull_pts_arr[:, 0].min(), 1e-9)),
            "height": float(max(_hull_pts_arr[:, 1].max() - _hull_pts_arr[:, 1].min(), 1e-9)),
        },
        # Fase 4: diagnóstico de paridad raster vs input
        # NOTA: en modo envolvente (pieces_json con N≥2 piezas), `*_input`
        # refiere al CONVEX HULL (contorno analítico) y `*_raster` a la
        # suma de las piezas físicas dibujadas. Los `parity_error_*` no
        # representan error numérico sino la diferencia geométrica
        # esperada entre la envolvente y los fragmentos. Para validar
        # fidelidad del raster en modo envolvente comparar área de piezas
        # con suma de áreas Shoelace de cada pieza (no se reporta aquí).
        "_raster_diagnostics": {
            "dpi": raster["dpi"],
            "padding_px": raster["padding_px"],
            "area_mm2_input":  raster["area_mm2_input"],
            "area_mm2_raster": raster["area_mm2_raster"],
            "perimeter_mm_input":  raster["perimeter_mm_input"],
            "perimeter_mm_raster": raster["perimeter_mm_raster"],
            "parity_error_area_pct":      raster["parity_error_area_pct"],
            "parity_error_perimeter_pct": raster["parity_error_perimeter_pct"],
            "mode": "envelope_hull" if pieces_mm_list else "single_contour",
            "n_pieces": len(pieces_mm_list) if pieces_mm_list else 1,
            "parity_note": (
                "En modo envelope_hull, *_input = convex hull y *_raster = piezas físicas; "
                "los parity_error_* reflejan la separación geométrica esperada, no error de raster."
            ) if pieces_mm_list else "Paridad numérica raster vs contorno de entrada.",
        },
    }


# ============================================================================
# HOMOLOGACIÓN BIFACIAL: Genera 55 métricas 2D para caras FRONT/BACK canónicas
# ============================================================================

@app.post(f"{API_PREFIX}/obj3d/front-back-metrics-homologated")
async def front_back_metrics_homologated(
    obj_file:            UploadFile      = File(...),
    mm_per_unit:         float           = Form(default=1.0),
    front_contour_json:  Optional[str]   = Form(default=None),
    back_contour_json:   Optional[str]   = Form(default=None),
    precomputed_bifacial_index: Optional[float] = Form(default=None),
):
    """
    Homologación bifacial: Extrae caras FRONT/BACK canónicas desde OBJ 3D y
    aplica el motor completo de análisis 2D (55 métricas por cara).

    Si se proveen front_contour_json / back_contour_json (contornos XY ya
    calculados por el cliente con la orientación correcta), se omite la
    re-ejecución de analyze_v2 y se usan directamente.
    """
    import json, base64
    import cv2

    if not modules.obj3d.IMPLEMENTED or not modules.metrics.IMPLEMENTED:
        raise HTTPException(
            status_code=501,
            detail="Módulos obj3d o metrics no implementados."
        )

    # ── 1. Leer OBJ (para validar tamaño aunque no lo reanalicemos) ───
    data = await obj_file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Archivo demasiado grande ({len(data)//1024//1024} MB). Máximo: {MAX_IMAGE_SIZE_MB} MB."
        )

    # ── 2. Obtener contornos FRONT/BACK ────────────────────────────────
    # Ruta A: el cliente envía los contornos pre-calculados (orientación correcta)
    # Ruta B: fallback — analizar OBJ en el servidor con orientación 'auto'
    front_contour_xy: list = []
    back_contour_xy:  list = []
    bifacial_idx:     float = 0.0

    if front_contour_json and back_contour_json:
        # Ruta A — usar contornos pre-calculados
        try:
            front_contour_xy = json.loads(front_contour_json)
            back_contour_xy  = json.loads(back_contour_json)
            bifacial_idx     = float(precomputed_bifacial_index or 0.0)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Contornos JSON inválidos: {exc}") from exc
    else:
        # Ruta B — fallback: re-analizar OBJ
        try:
            result_analyze = await modules.obj3d.analyze(
                obj_bytes=data,
                n_samples=20000,
                normalize_mode="none",
                analysis_level="v2",
                orientation_mode="auto",
                user_anchor=None,
            )
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Error en análisis 3D: {exc}") from exc

        if result_analyze.get("status") != "ok":
            raise HTTPException(
                status_code=422,
                detail=f"Análisis 3D falló: {result_analyze.get('message', 'unknown')}"
            )

        _morph_can   = result_analyze.get("obj3d", {}).get("morphology_canonical", {})
        _front_back  = _morph_can.get("front_back", {})
        front_contour_xy = (_front_back.get("front") or {}).get("contour_xy", [])
        back_contour_xy  = (_front_back.get("back")  or {}).get("contour_xy", [])
        bifacial_idx     = float(
            (_front_back.get("bifacial_balance") or {}).get("area_balance", 0.0)
        )

    if not front_contour_xy or not back_contour_xy:
        raise HTTPException(
            status_code=422,
            detail="No se pudieron extraer contornos bifaciales (front/back)."
        )

    if len(front_contour_xy) < 3 or len(back_contour_xy) < 3:
        raise HTTPException(
            status_code=422,
            detail="Una o ambas caras están vacías. OBJ puede no ser bifacial."
        )
    
    # ── 3. Rasterizar y analizar FRONT ─────────────────────────────────
    async def _analyze_contour_face(contour_xy, face_label):
        """Rasteriza contorno y aplica metrics.calculate()."""
        pts_arr = np.array(contour_xy, dtype=np.float64)
        if pts_arr.shape[0] < 3:
            return None
        
        CANVAS = 400
        MARGIN = 24
        x_min, y_min = pts_arr.min(axis=0)
        x_max, y_max = pts_arr.max(axis=0)
        w_units = max(x_max - x_min, 1e-9)
        h_units = max(y_max - y_min, 1e-9)
        
        scale_to_px = CANVAS / max(w_units, h_units)
        pts_px = ((pts_arr - [x_min, y_min]) * scale_to_px + MARGIN).astype(np.float32)
        
        w_img = int(w_units * scale_to_px) + 2 * MARGIN
        h_img = int(h_units * scale_to_px) + 2 * MARGIN
        img_canvas = np.ones((h_img, w_img, 3), dtype=np.uint8) * 248
        
        pts_int = pts_px.astype(np.int32).reshape(-1, 1, 2)
        cv2.fillPoly(img_canvas, [pts_int], (200, 200, 200))
        cv2.drawContours(img_canvas, [pts_int], 0, (40, 40, 40), 2)
        
        _, buf = cv2.imencode(".png", img_canvas)
        image_bytes = buf.tobytes()
        
        scale_px_mm = (mm_per_unit / scale_to_px) if scale_to_px > 0 else mm_per_unit
        
        try:
            metrics_result = await modules.metrics.calculate(
                image_bytes=image_bytes,
                contour_points=pts_px.tolist(),
                scale_px_mm=scale_px_mm,
            )
            return {
                "metricas": metrics_result.get("metricas", {}),
                "contour_px": pts_px.tolist(),
                "image_base64": base64.b64encode(image_bytes).decode("ascii"),
            }
        except Exception as exc:
            logger.error(f"Error analizando cara {face_label}: {exc}")
            return None
    
    # ── 4. Analizar ambas caras en paralelo ────────────────────────────
    try:
        front_metricas, back_metricas = await asyncio.gather(
            _analyze_contour_face(front_contour_xy, "FRONT"),
            _analyze_contour_face(back_contour_xy, "BACK"),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Error en análisis de caras: {exc}"
        ) from exc
    
    if not front_metricas or not back_metricas:
        raise HTTPException(
            status_code=422,
            detail="Una o ambas caras no pudieron procesarse."
        )

    front_contour_px = front_metricas.get("contour_px", [])
    back_contour_px  = back_metricas.get("contour_px", [])
    front_metricas_dict = front_metricas.get("metricas", front_metricas)
    back_metricas_dict  = back_metricas.get("metricas", back_metricas)
    front_image_b64 = front_metricas.get("image_base64", "")
    back_image_b64  = back_metricas.get("image_base64", "")

    # ── 5. Retornar estructura homologada ──────────────────────────────
    return {
        "status": "ok",
        "modelo": "mao_plus_3d_bifacial_homologation_v1",
        "cara_anverso": {
            **front_metricas_dict,
            "label": "FRONT",
            "contour_points": front_contour_px,
            "face_image_base64": front_image_b64,
        },
        "cara_reverso": {
            **back_metricas_dict,
            "label": "BACK",
            "contour_points": back_contour_px,
            "face_image_base64": back_image_b64,
        },
        "bifacial_index": bifacial_idx,
        "homologacion_metodo": "front_back_projection_xy",
        "mm_per_unit": mm_per_unit,
    }


# Reemplazará: dilatarMascara, erosionarMascara, etc. — analysis-core.js
# Biblioteca candidata: OpenCV, scikit-image
# ============================================================================

@app.post(f"{API_PREFIX}/morphology")
async def morphological_op(
    image:      UploadFile = File(...),
    operation:  str        = Form(...),    # dilate|erode|open|close|smooth
    iterations: int        = Form(default=1),
    kernel_size: int       = Form(default=3),
    kernel_size_close: int = Form(default=0),   # 0 = usar kernel_size
    kernel_size_open:  int = Form(default=0),   # 0 = usar kernel_size
):
    """
    Operaciones morfológicas sobre máscara binaria.

    Reemplaza:
      - dilatarMascara()          analysis-core.js ~línea 16644
      - erosionarMascara()        analysis-core.js ~línea 16673
      - cerrarMascara()           analysis-core.js ~línea 16702
      - abrirMascara()            analysis-core.js ~línea 16716
      - suavizarMascaraMorfologica() analysis-core.js ~línea 16730

    Bibliotecas candidatas:
      - cv2.dilate / cv2.erode    → morfología clásica (GPU-ready)
      - cv2.morphologyEx          → open/close en una llamada
      - skimage.morphology        → alternativa más flexible

    Estado: IMPLEMENTADO (✅) — módulo morphology.apply() funcional.
    """
    if operation not in ("dilate", "erode", "open", "close", "smooth"):
        raise HTTPException(status_code=400, detail=f"Operación desconocida: {operation}")
    data = await _read_image(image)
    result = await modules.morphology.apply(
        image_bytes=data,
        operation=operation,
        iterations=iterations,
        kernel_size=kernel_size,
        kernel_size_close=kernel_size_close if kernel_size_close > 0 else None,
        kernel_size_open=kernel_size_open   if kernel_size_open  > 0 else None,
    )
    return result


# ============================================================================
# MÓDULO: DETECCIÓN DE BORDES
# Reemplazará: calcularGradientesSobel(), calcularGradientesSobelMultiUmbral()
# Biblioteca candidata: OpenCV
# ============================================================================

@app.post(f"{API_PREFIX}/edges")
async def detect_edges(
    image:     UploadFile = File(...),
    method:    str        = Form(default="canny"),   # canny|sobel|laplacian
    threshold1: float     = Form(default=50.0),
    threshold2: float     = Form(default=150.0),
    sigma:     float      = Form(default=1.0),
):
    """
    Detección de bordes sobre imagen de entrada.

    Reemplaza:
      - calcularGradientesSobel()           analysis-core.js ~línea 15736
      - calcularGradientesSobelMultiUmbral() analysis-core.js ~línea 15600

    Bibliotecas candidatas:
      - cv2.Canny          → bordes robustos (Canny óptimo)
      - cv2.Sobel          → gradientes X/Y separados
      - cv2.Laplacian      → detección de segundo orden
      - skimage.filters.sobel / canny → alternativas

    Estado: IMPLEMENTADO (✅) — módulo detection.edges() funcional.
    """
    data = await _read_image(image)
    if method not in ("canny", "sobel", "laplacian"):
        raise HTTPException(status_code=422, detail=f"method inválido: '{method}'. Valores permitidos: canny, sobel, laplacian")
    result = await modules.detection.edges(
        image_bytes=data,
        method=method,
        threshold1=threshold1,
        threshold2=threshold2,
        sigma=sigma,
    )
    return result


# ============================================================================
# MÓDULO: SEGMENTACIÓN IA (GrabCut AI + MobileSAM ONNX opcional)
# ============================================================================

@app.get(f"{API_PREFIX}/sam/status")
async def sam_status():
    """
    Estado del módulo de segmentación IA.

    Respuesta:
      {
        "ready":              bool,   # siempre True (GrabCut AI siempre activo)
        "mode":               str,    # "grabcut_ai" | "mobilesam_onnx"
        "grabcut_available":  bool,   # siempre True
        "onnxruntime":        bool,
        "encoder_downloaded": bool,
        "decoder_downloaded": bool,
        "encoder_size_mb":    float,
        "decoder_size_mb":    float,
        "models_dir":         str,
        "note":               str,
      }
    """
    return sam_segmenter.status()


@app.post(f"{API_PREFIX}/sam/download")
async def sam_download():
    """
    Inicia el pipeline de descarga/exportación de modelos MobileSAM ONNX.

    GrabCut AI ya está activo sin esta llamada.
    Esta llamada descarga mobile_sam.pt y genera instrucciones de exportación ONNX.
    Respuesta: {"ok": bool, "message": str, "grabcut_active": bool, ...}
    """
    result = sam_segmenter.download_models()
    return result


@app.post(f"{API_PREFIX}/sam-contour")
async def sam_contour(
    image:    UploadFile = File(...),
    bbox_x:   int        = Form(...),
    bbox_y:   int        = Form(...),
    bbox_w:   int        = Form(...),
    bbox_h:   int        = Form(...),
    subpixel: bool       = Form(default=True),
    simplify: float      = Form(default=2.0),
):
    """
    Extrae contorno usando GrabCut AI (siempre) o MobileSAM ONNX (si disponible).

    Idéntica firma que /api/contour. Retorna el mismo formato.
    No requiere descarga previa — GrabCut AI siempre está activo.

    Cuándo usar:
      - Cuando /api/contour falla (metodoDeteccion indica máscara degenerada)
      - Objetos con fondo heterogéneo o que llenan completamente su bbox
      - Modo "analizar con IA" activado desde la UI
    """
    from python.modules.detection import _bytes_to_cv

    data = await _read_image(image)

    # 1. Segmentación: GrabCut AI (siempre) o MobileSAM (si modelos disponibles)
    img_bgr = _bytes_to_cv(data)
    h_full_pre, w_full_pre = img_bgr.shape[:2]
    _log.info(
        "[sam-contour] bbox=(%d,%d,%dx%d) img=%dx%d payload=%dB",
        bbox_x, bbox_y, bbox_w, bbox_h, w_full_pre, h_full_pre, len(data),
    )
    try:
        mask_u8, metodo_seg = sam_segmenter.segment(img_bgr, bbox_x, bbox_y, bbox_w, bbox_h)
    except Exception as e:
        _log.error("[sam-contour] segmentación fallida: %s", e)
        raise HTTPException(status_code=500, detail=f"Error de segmentación IA: {e}")

    _log.info("[sam-contour] método=%s mask_shape=%s", metodo_seg, mask_u8.shape)

    # 2. Extraer contorno desde la máscara SAM (misma pipeline que /api/contour)
    import cv2
    import numpy as np
    from shapely.geometry import Polygon
    from python.modules.contour import (
        _area_poligono, _perimetro, _tight_bbox,
        _depurar_por_coherencia, _refinar_contorno_gradiente,
    )

    h_full, w_full = img_bgr.shape[:2]
    x  = max(0, int(bbox_x));  y  = max(0, int(bbox_y))
    bw = min(int(bbox_w), w_full - x);  bh = min(int(bbox_h), h_full - y)
    roi = img_bgr[y: y + bh, x: x + bw]

    # Asegurar que mask_u8 tenga el tamaño correcto del ROI
    if mask_u8.shape != (bh, bw):
        mask_u8 = cv2.resize(mask_u8, (bw, bh), interpolation=cv2.INTER_NEAREST)

    # La limpieza morfológica ya la aplica _grabcut_ai / el segmentador.
    # No repetirla aquí para no sobre-suavizar los bordes del contorno.
    coverage = float((mask_u8 > 0).sum()) / max(bw * bh, 1)
    _log.info("[sam-contour] cobertura=%.3f roi=%dx%d", coverage, bw, bh)
    contours, _ = cv2.findContours(mask_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        _log.warning("[sam-contour] findContours sin resultados (cobertura=%.3f)", coverage)
        raise HTTPException(status_code=422, detail="SAM no generó contorno válido.")

    main_cnt = max(contours, key=cv2.contourArea)
    pts_raw  = main_cnt.reshape(-1, 2).astype(np.float32)
    try:
        pts_raw = _depurar_por_coherencia(pts_raw, mask_u8, roi)
    except Exception:
        pass

    if len(pts_raw) < 3:
        raise HTTPException(status_code=422, detail="Contorno SAM insuficiente.")

    if subpixel and len(pts_raw) >= 4:
        gray_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        corners  = pts_raw.reshape(-1, 1, 2).astype(np.float32)
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.01)
        try:
            refined  = cv2.cornerSubPix(gray_roi, corners, (3, 3), (-1, -1), criteria)
            pts_raw  = refined.reshape(-1, 2).astype(np.float32)
        except cv2.error:
            pass

    try:
        pts_raw = _refinar_contorno_gradiente(pts_raw, roi, mask_u8=mask_u8)
    except Exception:
        pass

    arc_len  = float(np.sum(np.sqrt(np.sum(np.diff(pts_raw, axis=0).astype(np.float64)**2, axis=1))))
    epsilon  = max(simplify, arc_len * 0.001)
    approx   = cv2.approxPolyDP(pts_raw.reshape(-1, 1, 2).astype(np.float32), epsilon, True)

    pts_abs      = pts_raw.copy();  pts_abs[:, 0] += x;  pts_abs[:, 1] += y
    pts_vis_abs  = approx.reshape(-1, 2).copy()
    pts_vis_abs[:, 0] += x;  pts_vis_abs[:, 1] += y

    hull_pts_abs = None
    try:
        hull_idx     = cv2.convexHull(pts_abs.reshape(-1, 1, 2).astype(np.float32))
        hull_pts_abs = hull_idx.reshape(-1, 2)
    except Exception:
        hull_pts_abs = pts_abs

    is_valid = False
    try:
        poly = Polygon(pts_abs.tolist())
        if not poly.is_valid:
            poly = poly.buffer(0)
        is_valid = poly.is_valid and not poly.is_empty
    except Exception:
        pass

    area_real  = _area_poligono(pts_abs)
    perim_real = _perimetro(pts_abs)
    centroid   = pts_abs.mean(axis=0).tolist()
    tight_box  = _tight_bbox(pts_abs)
    bbox_area  = tight_box["area"] if tight_box["area"] > 0 else 1
    quality_score = min(1.0, area_real / bbox_area)
    quality_nivel = (
        "excelente" if quality_score >= 0.8 else
        "bueno"     if quality_score >= 0.6 else
        "regular"   if quality_score >= 0.4 else "bajo"
    )

    _log.info(
        "[sam-contour] OK pts=%d hull=%d quality=%s(%.2f) método=%s",
        len(pts_abs),
        len(hull_pts_abs) if hull_pts_abs is not None else 0,
        quality_nivel, quality_score, metodo_seg,
    )
    return {
        "status":        "ok",
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
        "width":           bw,
        "height":          bh,
        "metodoDeteccion": f"python_{metodo_seg}",
        "is_valid":        is_valid,
        "quality": {"score": round(quality_score, 3), "nivel": quality_nivel},
    }


# Reemplazará: calcularTexturaSuperficie() — analysis-core.js
# Biblioteca candidata: scikit-image (GLCM)
# ============================================================================

@app.post(f"{API_PREFIX}/texture")
async def analyze_texture(
    image:   UploadFile = File(...),
    mask:    UploadFile = File(None),
    distances: str      = Form(default="1,2,4"),   # CSV de distancias GLCM
    angles:    str      = Form(default="0,45,90,135"),
):
    """
    Análisis de textura GLCM de la superficie del objeto.

    Reemplaza/extiende:
      - calcularTexturaSuperficie()   analysis-core.js ~L6025

    Capacidad NUEVA (no disponible en JS):
      GLCM completo: contrast, dissimilarity, homogeneity, energy,
      correlation, entropy + interpretación arqueológica automática.
      Requiere scikit-image; cae a varianza/media si no está disponible.

    Estado: IMPLEMENTADO (IMPLEMENTED=True).
    """
    img_data  = await _read_image(image)
    mask_data = await mask.read() if mask else None
    dist_list  = [int(d.strip()) for d in distances.split(",")]
    angle_list = [float(a.strip()) for a in angles.split(",")]
    result = await modules.metrics.texture(
        image_bytes=img_data,
        mask_bytes=mask_data,
        distances=dist_list,
        angles=angle_list,
    )
    return result


# ============================================================================
# MÓDULO: ANÁLISIS DE COLOR / FONDO
# Reemplazará: analizarRGBDesdeCentro(), detectarColorFondoAutomatico()
# Biblioteca candidata: OpenCV, NumPy
# ============================================================================

@app.post(f"{API_PREFIX}/color")
async def analyze_color(
    image:   UploadFile = File(...),
    mask:    UploadFile = File(None),
    space:   str        = Form(default="rgb"),   # rgb|hsv|lab
):
    """
    Análisis de color de la superficie y detección automática de fondo.

    Reemplaza:
      - analizarRGBDesdeCentro()          analysis-core.js ~línea 15161
      - detectarColorFondoAutomatico()    analysis-core.js ~línea 15457

    Capacidad NUEVA:
      - Análisis en espacio CIE L*a*b* (perceptualmente uniforme)
      - Segmentación K-Means de color
      - Histograma de color por canal

    Bibliotecas candidatas:
      - cv2.cvtColor (BGR→HSV, BGR→LAB)
      - cv2.kmeans                        → agrupación de colores dominantes
      - numpy: estadísticas por canal

    Estado: IMPLEMENTADO (✅) — módulo detection.color() funcional.
    """
    img_data  = await _read_image(image)
    mask_data = await mask.read() if mask else None
    result = await modules.detection.color(
        image_bytes=img_data,
        mask_bytes=mask_data,
        color_space=space,
    )
    return result


# ============================================================================
# MÓDULO: PCA + ESTADÍSTICOS
# Reemplazará: renderPCA(), renderEstadisticos(), renderCorrelacion()
# Biblioteca candidata: scikit-learn, scipy
# ============================================================================

@app.post(f"{API_PREFIX}/pca")
async def pca_analysis(
    objects_json: str = Form(...),   # JSON: [{id, metricas: {...}}, ...]
    n_components: int = Form(default=2),
    n_clusters:   int = Form(default=0),   # 0 = auto (by silhouette)
):
    """
    Análisis de Componentes Principales sobre colección de objetos.

    Reemplaza:
      - renderPCA()           comparator.js ~línea 69292 (JS manual)
      - jacobiEigen()         comparator.js ~línea 69337 (propio!)
      - kMeans()              comparator.js ~línea 69386 (propio!)
      - silhouetteScore()     comparator.js ~línea 69441

    Mejoras sobre implementación JS:
      - sklearn.PCA: SVD numérico estable (vs. Jacobi iterativo)
      - sklearn.KMeans: convergencia garantizada (Lloyd's algorithm)
      - sklearn.metrics.silhouette_score: cálculo exacto

    Estado: IMPLEMENTADO (✅) — módulo comparator.pca() funcional.
    """
    import json
    objects = json.loads(objects_json)
    result  = await modules.comparator.pca(
        objects=objects,
        n_components=n_components,
        n_clusters=n_clusters,
    )
    return result


@app.post(f"{API_PREFIX}/statistics")
async def statistical_analysis(
    objects_json: str = Form(...),   # JSON: [{id, metricas: {...}}, ...]
    keys_json:    str = Form(...),   # JSON: ["area", "circularity", ...]
):
    """
    Estadísticos descriptivos y correlación para colección.

    Reemplaza:
      - renderEstadisticos()    comparator.js
      - renderCorrelacion()     comparator.js

    Estado: IMPLEMENTADO (✅) — módulo comparator.statistics() funcional.
    """
    import json
    objects = json.loads(objects_json)
    keys    = json.loads(keys_json)
    result  = await modules.comparator.statistics(objects=objects, keys=keys)
    return result


# ============================================================================
# MÓDULO: PIPELINE COMPLETO
# Endpoint de conveniencia que encadena detect → contour → metrics → texture
# ============================================================================

# ============================================================================
# MÓDULO: CÁLCULO DE ESCALA Y ERROR ÓPTICO POSICIONAL
# Replica: calcularEscala(), calcularEscalaHibrida(), estimarErrorOptico()
#          aplicarIncertidumbreOptica()  —  analysis-core.js ~L11806-11800
# ============================================================================

@app.post(f"{API_PREFIX}/scale")
async def calculate_scale(
    focal_mm:        Optional[float] = Form(default=None),
    distancia_mm:    Optional[float] = Form(default=None),
    sensor_w_mm:     Optional[float] = Form(default=None),
    sensor_h_mm:     Optional[float] = Form(default=None),
    img_w_px:        Optional[int]   = Form(default=None),
    img_h_px:        Optional[int]   = Form(default=None),
    obj_centroide_x: Optional[float] = Form(default=None),
    obj_centroide_y: Optional[float] = Form(default=None),
    image:           Optional[UploadFile] = File(default=None),
):
    """
    Calcula escala px→mm y error óptico posicional (Sección IX).

    Replica (analysis-core.js):
      calcularEscala()            ~L11806 — fórmula base
      calcularEscalaHibrida()     ~L11940 — metadatos EXIF/RAW
      estimarErrorOptico()        ~L11640 — Sección IX
      aplicarIncertidumbreOptica() ~L11760 — propagación de incertidumbre

    Fórmula:
        scale_px_mm = (sensor_w_mm / img_w_px) * (distancia_mm / focal_mm)

    Si se adjunta imagen (image), se extraen metadatos EXIF automáticamente:
      - focal_mm desde FocalLength EXIF
      - sensor_w/h_mm desde base de datos de 60+ cámaras (Make + Model EXIF)
      - img_w/h_px desde dimensiones reales de la imagen

    El campo error_optico retorna los 10 indicadores de Sección IX:
      error_lineal_percent, error_area_percent, error_perspectiva_percent,
      error_distorsion_percent, posicion_radial_norm, angulo_optico_deg,
      k1_estimado, fov_diagonal_deg, confianza_optica, nota_error_optico

    Estado: IMPLEMENTADO (IMPLEMENTED=True).
    """
    image_bytes = await _read_image(image) if image else None
    return modules.scale.calculate(
        focal_mm=focal_mm,
        distancia_mm=distancia_mm,
        sensor_w_mm=sensor_w_mm,
        sensor_h_mm=sensor_h_mm,
        img_w_px=img_w_px,
        img_h_px=img_h_px,
        obj_centroide_x=obj_centroide_x,
        obj_centroide_y=obj_centroide_y,
        image_bytes=image_bytes,
    )


@app.post(f"{API_PREFIX}/analyze")
async def full_analysis(
    image:       UploadFile = File(...),
    scale_px_mm: float      = Form(default=1.0),
    run_texture: bool        = Form(default=False),
    run_color:   bool        = Form(default=False),
):
    """
    Pipeline completo de análisis morfométrico. IMPLEMENTADO.

    Encadena internamente:
      1. /detect      → bounding boxes de objetos
      2. /contour     → contornos exactos (sub-píxel)
      3. /metrics     → 124 métricas morfométricas
      4. /texture     → GLCM (si run_texture=True)
      5. /color       → análisis de color (si run_color=True)

    Estado: IMPLEMENTADO (IMPLEMENTED=True en analysis.py).
    """
    data = await _read_image(image)
    result = await modules.analysis.full_pipeline(
        image_bytes=data,
        scale_px_mm=scale_px_mm,
        run_texture=run_texture,
        run_color=run_color,
    )
    return result


# ============================================================================
# MÓDULO: MÉTRICAS DE PERFORACIONES / HORADACIONES
# Replica: calcularMetricasPerforacion(), calcularAreaEfectivaPH()
#          analysis-core.js ~L46719 / ~L46978
# ============================================================================

@app.post(f"{API_PREFIX}/ph_metrics")
async def ph_metrics(
    ph_json:     str   = Form(...),   # JSON: {perforaciones:[{puntos,id,...}], horadaciones:[...]}
    scale_px_mm: float = Form(default=1.0),
):
    """
    Calcula métricas morfométricas para polígonos de P/H trazados en el canvas.

    El trazado (modal de canvas, punto a punto con zoom 2x) permanece en JS.
    Python recibe la geometría ya trazada y devuelve las métricas computadas.

    Replica (analysis-core.js):
      calcularMetricasPerforacion()  ~L46719 — área, perímetro, centroide,
        convex hull, radios, ejes principales, Feret, shape metrics.
      calcularAreaEfectivaPH()       ~L46978 — detección de P contenidas en H
        (ray casting), cálculo de área efectiva para área neta del objeto.

    Entrada (JSON):
      {
        "perforaciones": [{"id": 1, "puntos": [{"x":…,"y":…}, …]}, …],
        "horadaciones":  [{"id": 1, "puntos": [{"x":…,"y":…}, …]}, …]
      }

    Salida:
      {
        "perforaciones":        [metricas_por_perforacion, …],
        "horadaciones":         [metricas_por_horadacion, …],
        "area_efectiva":        {areaTotalPerforaciones, areaTotalHoradaciones,
                                 areaTotalPH, areaBrutaPerforaciones,
                                 numContenidas, relaciones},
        "count_perforaciones":  n,
        "count_horadaciones":   n,
      }

    Estado: IMPLEMENTADO (IMPLEMENTED=True en ph.py).
    """
    import json
    payload = json.loads(ph_json)
    perforaciones = payload.get("perforaciones", [])
    horadaciones  = payload.get("horadaciones", [])
    result = await modules.ph.process_batch(
        perforaciones=perforaciones,
        horadaciones=horadaciones,
        scale_px_mm=scale_px_mm,
    )
    return result


# ============================================================================
# MÓDULO: COMPARACIÓN BIFACIAL
# Replica: calcularComparacionBifacial() + analizarDistribucionPH()
#          analysis-core.js ~L35970
# ============================================================================

@app.post(f"{API_PREFIX}/bifacial")
async def bifacial_comparison(
    cara_a_json: str = Form(...),   # JSON: {metricas:{...}, perforaciones:[...], horadaciones:[...], clasificacion_forma:str}
    cara_b_json: str = Form(...),
):
    """
    Calcula el índice de simetría bifacial (Cara A anverso ↔ Cara B reverso).

    Replica (analysis-core.js):
      calcularComparacionBifacial()   ~L35970 — simetría de área, orientación,
        reflejo especular de ejes, similitud de forma (circularity, convexity,
        solidity, elongation), distribución espacial de P/H.
      analizarDistribucionPH()        ~L36120 — simetría posicional y especular
        de perforaciones/horadaciones entre las dos caras.

    Fórmula del índice general (pesos idénticos al original JS):
      ISG = 0.25·simetriaArea + 0.20·similitudCircularidad +
            0.20·similitudConvexidad + 0.15·alineacionEspacial +
            0.10·simetriaOrientacion + 0.10·simetriaEspecularPH

    Entrada (JSON por cara):
      {
        "metricas": { "area": mm², "perimetro": mm, "circularity": …,
                      "centroide": [x,y], "angulo_eje_mayor": deg,
                      "radio_maximo": mm, "radio_minimo": mm, … },
        "perforaciones": [{"centroide":[x,y], …}, …],
        "horadaciones":  [{"centroide":[x,y], …}, …],
        "clasificacion_forma": "Lanceolada" | … | null
      }

    Salida:
      indiceSimetriaGeneral, simetriaArea, simetriaPerimetro,
      similitudCircularidad/Convexidad/Solidez/Elongacion,
      alineacionEspacial, desplazamientoNormalizado,
      esReflejoEspecular, calidadReflejoAngular,
      distribucionPH: {simetriaEspecular, simetriaPosicional, descripcion},
      perforacionesA/B, horadacionesA/B, totalPH_A/B,
      clasificacionA/B, mismaClasificacion

    Estado: IMPLEMENTADO (en comparator.bifacial()).
    """
    import json
    cara_a = json.loads(cara_a_json)
    cara_b = json.loads(cara_b_json)
    return modules.comparator.bifacial(cara_a, cara_b)


# ============================================================================
# ============================================================================
# FASE 2 IA — CLASIFICACIÓN TIPOLÓGICA ARQUEOLÓGICA
# Módulo: classifier.py
# Clasifica objetos en tipos funcionales mediante reglas morfométricas.
# Input: métricas de /api/metrics. No requiere GPU ni datos de entrenamiento.
# ============================================================================

@app.post(f"{API_PREFIX}/classify")
async def classify_object(request: Request):
    """
    Clasificación tipológica arqueológica a partir de métricas morfométricas.

    Tipos detectados:
      Punta de proyectil (Lanceolada / Triangular / Foliácea)
      Bifaz             (Amigdaloide / Lanceolado / Oval)
      Lámina lítica     (Lámina regular / Lámina retocada)
      Raspador          (Frontal / Discoide / Semicircular)
      Perforador / Buril
      Cuchillo lítico   (Dorso / Bifacial)
      Lasca             (Irregular / Tabular / Decorticado)
      Núcleo            (Discoide / Informal / Agotado)
      Guijarro / Canto rodado
      Microlítico       (Indiferenciado)
      Indeterminado

    Acepta cuerpo JSON `{"metrics_json": "..."}` (objeto ya serializado)
    o alternativamente un objeto de métricas directamente `{...}`.
    """
    import json as _json

    # Intentar JSON body — acepta tanto {"metrics_json": "{...}"} como {metrics dict plano}
    body: dict = {}
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Cuerpo JSON inválido o ausente.")

    if not isinstance(body, dict):
        raise HTTPException(status_code=422, detail="Se esperaba un objeto JSON.")

    # Desempaquetar si viene con wrapper metrics_json
    raw = body.get("metrics_json")
    if raw is not None:
        try:
            m = _json.loads(raw) if isinstance(raw, str) else raw
        except _json.JSONDecodeError:
            raise HTTPException(status_code=422, detail="metrics_json no es JSON válido.")
    else:
        m = body

    if not isinstance(m, dict):
        raise HTTPException(status_code=422, detail="métricas deben ser un objeto JSON.")

    # Soportar tanto {"metricas": {...}} como el dict plano directamente
    if "metricas" in m:
        m = m["metricas"]

    classifier_mod = getattr(modules, "classifier", None)
    if classifier_mod is None or not hasattr(classifier_mod, "classify_async"):
        return {
            "status": "not_implemented",
            "message": "Módulo classifier no disponible en este servidor; se omite clasificación tipológica.",
        }

    return await classifier_mod.classify_async(m)


# ============================================================================
# FASE 1 IA — DETECCIÓN CON YOLOv8n
# Nuevo módulo: yolo_detector.py
# Resuelve: separación de objetos pegados/solapados
# Flujo: YOLOv8n (instancias) → GrabCut ROI (máscara fina) → contorno + MAO_IA
# ============================================================================

@app.get(f"{API_PREFIX}/detect-yolo/status")
async def detect_yolo_status():
    """
    Estado del módulo YOLO.

    Respuesta:
      {
        "yolo_available": bool,     # True cuando yolov8n.pt está en caché
        "model":          str,      # nombre del modelo (yolov8n.pt)
        "fallback":       str,      # descripción del fallback activo
        "note":           str,      # mensaje legible del estado
      }
    """
    from python.modules.yolo_detector import status_yolo
    return status_yolo()


@app.post(f"{API_PREFIX}/detect-yolo")
async def detect_objects_yolo(
    image:              UploadFile = File(...),
    conf_threshold:     float      = Form(default=0.20),
    min_area:           int        = Form(default=100),
    max_objects:        int        = Form(default=50),
    use_grabcut:        bool       = Form(default=True),
    fallback_classical: bool       = Form(default=True),
):
    """
    Detección de objetos arqueológicos usando YOLOv8n + GrabCut.

    Mejora sobre /api/detect:
      - Separa objetos pegados/solapados (instancia por instancia)
      - Confianza por objeto (yolo_confidence)
      - Máscara fina por GrabCut para cada bbox YOLO
      - Fallback automático a Z-scan + GrabCut clásico si YOLO falla

    Parámetros:
      conf_threshold    — confianza mínima YOLO (0.0–1.0). 0.20 recomendado
                          para objetos arqueológicos sobre fondo plano.
      min_area          — área mínima en píxeles.
      max_objects       — límite de objetos en la respuesta.
      use_grabcut       — refinar máscara de cada ROI con GrabCut (recomendado).
      fallback_classical — activar detección clásica si YOLO no detecta nada.

    Respuesta:
      {
        "objects": [
          {
            "id":               "PY_01",
            "bbox":             {"x", "y", "width", "height"},
            "area":             float,
            "perimeter":        float,
            "centroid":         [x, y],
            "aspect_ratio":     float,
            "detection_method": "yolov8n" | "classical_zscan",
            "yolo_confidence":  float,      # solo en detecciones YOLO
            "yolo_class_id":    int,        # clase COCO detectada
            "mao_ia": {
              "circularity", "solidity", "equivalent_diameter",
              "extent", "aspect_ratio", "convexity_defects"
            }
          }, ...
        ],
        "count":  int,
        "method": "yolov8n+grabcut" | "yolov8n" | "classical_fallback"
      }

    Reemplaza/extiende: detectObjectsAutomatically() — analysis-core.js ~L55406
    """
    from python.modules.yolo_detector import detect_yolo
    data = await _read_image(image)
    return await detect_yolo(
        image_bytes=data,
        conf_threshold=conf_threshold,
        min_area=min_area,
        max_objects=max_objects,
        use_grabcut=use_grabcut,
        fallback_classical=fallback_classical,
    )


# ============================================================================
# MÓDULO: EXPORTACIÓN CSV
# Serializa el dict de métricas de un objeto/análisis a texto CSV.
# Los datos ya están calculados en Python; este endpoint evita ensamblar
# el CSV en JS cuando se llama desde un contexto no-Electron.
# ============================================================================

@app.post(f"{API_PREFIX}/export/csv")
async def export_csv(
    data_json:    str = Form(...),   # JSON: [{id, metricas:{...}}, …] o {id, metricas:{...}}
    filename:     str = Form(default="mao_export.csv"),
    delimiter:    str = Form(default=","),
):
    """
    Genera un CSV con las métricas de uno o varios objetos.

    Acepta tanto un único objeto {id, metricas} como una lista [{id, metricas}, …].
    Las claves del CSV son todas las métricas numéricas presentes.

    Retorna el CSV como texto plano (Content-Type: text/csv).

    Estado: IMPLEMENTADO (generación Python pura, sin dependencias extra).
    """
    import json
    import io
    import csv
    from fastapi.responses import StreamingResponse

    raw = json.loads(data_json)
    objects = raw if isinstance(raw, list) else [raw]

    # Recopilar todas las claves presentes en cualquier objeto
    all_keys: list[str] = []
    seen: set[str] = set()
    for obj in objects:
        metricas = obj.get("metricas", obj)
        for k in metricas:
            if k not in seen:
                all_keys.append(k)
                seen.add(k)

    output = io.StringIO()
    writer = csv.writer(output, delimiter=delimiter)

    # Cabecera
    writer.writerow(["id"] + all_keys)

    # Filas
    for obj in objects:
        metricas = obj.get("metricas", obj)
        row = [obj.get("id", "")]
        for k in all_keys:
            val = metricas.get(k, "")
            row.append(val if val is not None else "")
        writer.writerow(row)

    csv_content = output.getvalue()
    output.close()

    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ============================================================================
# MÓDULO: PERSISTENCIA DE ARCHIVOS (Fase C)
# Reemplaza electronAPI.ensureFolder / saveFile / readFile cuando no hay Electron.
# Opera únicamente sobre rutas absolutas del sistema local (localhost).
# ============================================================================

@app.post(f"{API_PREFIX}/fs/mkdir")
async def fs_mkdir(
    path: str = Form(...),
):
    """
    Crea un directorio (y sus padres) si no existe.
    Equivalente a electronAPI.ensureFolder(path).

    Estado: IMPLEMENTADO (persistence.py).
    """
    return modules.persistence.ensure_folder(path)


@app.post(f"{API_PREFIX}/fs/write")
async def fs_write(
    path:     str  = Form(...),
    content:  str  = Form(...),
    encoding: str  = Form(default="text"),   # "text" | "base64"
):
    """
    Escribe un archivo en disco.

    encoding='text'   → content es string UTF-8 (JSON, CSV, SVG…)
    encoding='base64' → content es data URL o base64 puro (PNG, JPEG, PDF…)

    Equivalente a electronAPI.saveFile(path, content).
    Estado: IMPLEMENTADO (persistence.py).
    """
    return modules.persistence.save_file(path, content, encoding)


@app.get(f"{API_PREFIX}/fs/read")
async def fs_read(
    path:     str = Query(...),
    encoding: str = Query(default="text"),   # "text" | "base64"
):
    """
    Lee un archivo de disco.
    Devuelve el contenido en 'content' (string UTF-8 o data URL base64).

    Equivalente a electronAPI.readFile(path).
    Estado: IMPLEMENTADO (persistence.py).
    """
    return modules.persistence.read_file(path, encoding)


@app.get(f"{API_PREFIX}/fs/list")
async def fs_list(
    path: str = Query(...),
):
    """
    Lista el contenido de un directorio.
    Devuelve {'entries': [{name, path, is_dir, size}, …]}.

    Estado: IMPLEMENTADO (persistence.py).
    """
    return modules.persistence.list_folder(path)


def _ph_detect_from_seed(img, seed_x: int, seed_y: int, tolerance: int = 30) -> dict:
    """Detecta un contorno P/H desde un punto semilla sobre una imagen OpenCV."""
    import cv2 as _cv2

    h, w = img.shape[:2]
    if not (0 <= seed_x < w and 0 <= seed_y < h):
        return {
            "status": "error",
            "message": f"Punto ({seed_x},{seed_y}) fuera de imagen {w}×{h}",
        }

    # Flood fill desde la semilla en máscara separada.
    img_copy = img.copy()
    mask = np.zeros((h + 2, w + 2), np.uint8)
    tol = (tolerance, tolerance, tolerance)
    _cv2.floodFill(
        img_copy,
        mask,
        (seed_x, seed_y),
        (128, 128, 128),
        tol,
        tol,
        _cv2.FLOODFILL_MASK_ONLY | _cv2.FLOODFILL_FIXED_RANGE,
    )
    region = mask[1:-1, 1:-1]

    kernel = _cv2.getStructuringElement(_cv2.MORPH_ELLIPSE, (3, 3))
    region = _cv2.morphologyEx(region, _cv2.MORPH_CLOSE, kernel, iterations=2)
    region = _cv2.morphologyEx(region, _cv2.MORPH_OPEN, kernel, iterations=1)

    contours, _ = _cv2.findContours(region, _cv2.RETR_EXTERNAL, _cv2.CHAIN_APPROX_NONE)
    if not contours:
        return {
            "status": "error",
            "message": "No se encontró región conectada en ese punto.",
        }

    cnt = max(contours, key=_cv2.contourArea)
    area_px = float(_cv2.contourArea(cnt))
    if area_px < 16:
        return {
            "status": "error",
            "message": "Región demasiado pequeña (< 16 px²).",
        }

    perimeter_px = float(_cv2.arcLength(cnt, True))
    circularity = (4.0 * np.pi * area_px) / (perimeter_px * perimeter_px) if perimeter_px > 0 else 0.0

    epsilon = max(1.5, 0.004 * perimeter_px)
    approx = _cv2.approxPolyDP(cnt, epsilon, True)
    if len(approx) < 3:
        approx = cnt

    points = [[int(p[0][0]), int(p[0][1])] for p in approx]
    x, y, bw, bh = _cv2.boundingRect(cnt)
    M = _cv2.moments(cnt)
    cx = float(M["m10"] / M["m00"]) if M["m00"] != 0 else float(seed_x)
    cy = float(M["m01"] / M["m00"]) if M["m00"] != 0 else float(seed_y)

    return {
        "status": "ok",
        "points": points,
        "area_px": area_px,
        "bbox": {"x": x, "y": y, "w": bw, "h": bh},
        "centroid": [cx, cy],
        "perimeter_px": perimeter_px,
        "circularity": float(circularity),
    }


# ============================================================================
# MÓDULO: DETECCIÓN P/H POR PUNTO SEMILLA
# Detecta el contorno de una perforación/horadación a partir de un
# punto interno usando flood fill + findContours de OpenCV.
# ============================================================================

@app.post(f"{API_PREFIX}/ph/detect-at-point")
async def ph_detect_at_point(
    image:     UploadFile = File(...),
    seed_x:    int        = Form(...),
    seed_y:    int        = Form(...),
    tolerance: int        = Form(default=30),
):
    """
    Detecta el contorno de una P/H haciendo flood fill desde el punto semilla.
    La imagen recibida es el recorte del perforationCanvas (coordenadas canvas).

    Retorna:
      { status, points: [[x,y],...], area_px, bbox: {x,y,w,h}, centroid: [cx,cy] }
    """
    import numpy as np
    import cv2 as _cv2

    data = await _read_image(image)
    img_arr = np.frombuffer(data, np.uint8)
    img = _cv2.imdecode(img_arr, _cv2.IMREAD_COLOR)

    if img is None:
        return {"status": "error", "message": "No se pudo decodificar la imagen"}

    result = _ph_detect_from_seed(img, seed_x, seed_y, tolerance)
    if result.get("status") == "error" and "Intente" not in result.get("message", ""):
        result["message"] = f"{result['message']} Intente hacer clic más al centro de la P/H."
    return result


@app.post(f"{API_PREFIX}/ph/detect-auto")
async def ph_detect_auto(
    image: UploadFile = File(...),
    seeds_json: str = Form(...),
    tolerance: int = Form(default=26),
    min_area_px: float = Form(default=24.0),
    max_area_ratio: float = Form(default=0.35),
    max_candidates: int = Form(default=24),
):
    """
    Detección automática P/H por lote de semillas (una sola request).

    - seeds_json: lista de semillas [{x,y}] o [[x,y], ...] en coords de canvas.
    - Deduplica candidatos por cercanía de centroides y similitud de área.
    """
    import json
    import numpy as np
    import cv2 as _cv2

    data = await _read_image(image)
    img_arr = np.frombuffer(data, np.uint8)
    img = _cv2.imdecode(img_arr, _cv2.IMREAD_COLOR)
    if img is None:
        return {"status": "error", "message": "No se pudo decodificar la imagen"}

    h, w = img.shape[:2]
    area_canvas = float(max(1, w * h))
    area_max = area_canvas * max(0.01, float(max_area_ratio))

    try:
        raw_seeds = json.loads(seeds_json)
    except Exception:
        return {"status": "error", "message": "seeds_json inválido"}

    parsed_seeds = []
    for s in raw_seeds if isinstance(raw_seeds, list) else []:
        if isinstance(s, dict):
            sx = int(round(float(s.get("x", 0))))
            sy = int(round(float(s.get("y", 0))))
        elif isinstance(s, (list, tuple)) and len(s) >= 2:
            sx = int(round(float(s[0])))
            sy = int(round(float(s[1])))
        else:
            continue
        if 0 <= sx < w and 0 <= sy < h:
            parsed_seeds.append((sx, sy))

    if not parsed_seeds:
        return {"status": "error", "message": "No hay semillas válidas dentro de la imagen"}

    dedup = []  # [(cx, cy, area), ...]
    candidates = []
    max_eval = min(len(parsed_seeds), max(1, int(max_candidates)) * 6)

    for sx, sy in parsed_seeds[:max_eval]:
        if len(candidates) >= max_candidates:
            break

        det = _ph_detect_from_seed(img, sx, sy, tolerance)
        if det.get("status") != "ok":
            continue

        area_px = float(det.get("area_px", 0.0))
        if area_px < float(min_area_px) or area_px > area_max:
            continue

        cx, cy = det.get("centroid", [sx, sy])
        duplicated = False
        for dcx, dcy, da in dedup:
            d = float(np.hypot(cx - dcx, cy - dcy))
            ar = abs(da - area_px) / area_px if area_px > 0 else 1.0
            if d < 14.0 and ar < 0.35:
                duplicated = True
                break
        if duplicated:
            continue

        auto_tipo = "perforacion" if (area_px < area_canvas * 0.06 and float(det.get("circularity", 0.0)) > 0.55) else "horadacion"

        dedup.append((cx, cy, area_px))
        candidates.append({
            "points": det.get("points", []),
            "area_px": area_px,
            "bbox": det.get("bbox"),
            "centroid": det.get("centroid"),
            "circularity": float(det.get("circularity", 0.0)),
            "auto_tipo": auto_tipo,
        })

    return {
        "status": "ok",
        "candidates": candidates,
        "seeds_received": len(parsed_seeds),
        "seeds_evaluated": max_eval,
    }


# ============================================================================
# MÓDULO: ELLIPTIC FOURIER ANALYSIS (EFA)
# Descriptores de Fourier elípticos — puente hacia GMM/literatura arqueométrica
# Referencia: Kuhl & Giardina (1982). Computer Graphics and Image Processing.
# ============================================================================

@app.post(f"{API_PREFIX}/efa")
async def efa_analysis(
    contour_json: str   = Form(...),         # JSON: [[x,y], ...]
    n_harmonics:  int   = Form(default=20),  # 20 estándar para arqueología
    scale_px_mm:  float = Form(default=1.0),
    normalize:    bool  = Form(default=True),
):
    """
    Calcula descriptores EFD (Elliptic Fourier Descriptors) para un contorno.

    Los EFD son la representación estándar en Geometric Morphometrics (GMM)
    para análisis de contorno cerrado. Permiten comparar formas de artefactos
    arqueológicos con la literatura internacional (MorphoJ, momocs/R, etc.).

    Invariancias aplicadas cuando normalize=True:
      - Traslación   : centrado por offset DC
      - Escala       : normalizado al semieje mayor del 1er armónico
      - Rotación     : alineación SEMA (Kuhl & Giardina 1982, sec. 4)
      - Reflexión    : signo positivo en c1 normalizado

    Entrada:
      contour_json — JSON: [[x1,y1],[x2,y2],...] en píxeles (absolutos)
      n_harmonics  — número de armónicos (≥10 para publicación; 20 recomendado)
      scale_px_mm  — factor de escala; si > 1 las coords se convierten a mm
      normalize    — True para descriptores comparables entre objetos

    Salida:
      {
        "status":            "ok",
        "n_harmonics":       int,
        "n_points_input":    int,
        "coefficients":      [[an,bn,cn,dn], ...],   # normalizados
        "coefficients_raw":  [[an,bn,cn,dn], ...],   # sin normalizar
        "normalization":     {theta_1_deg, psi_1_deg, scale_factor},
        "power_spectrum":    [float, ...],
        "variance_explained": [float, ...],           # % acumulado por armónico
        "harmonics_for_95pct": int,
        "harmonics_for_99pct": int,
        "contour_reconstructed": [[x,y], ...],        # 256 pts para visualización
        "dc":                [a0, c0],
        "scale_px_mm":       float,
      }

    Estado: IMPLEMENTADO (efa.py, IMPLEMENTED=True).
    """
    import json
    pts = json.loads(contour_json)
    return await modules.efa.calculate(
        contour_points=pts,
        n_harmonics=n_harmonics,
        scale_px_mm=scale_px_mm,
        normalize=normalize,
    )


@app.post(f"{API_PREFIX}/efa/compare")
async def efa_compare(
    coeffs_a_json: str = Form(...),   # JSON: [[an,bn,cn,dn], ...]
    coeffs_b_json: str = Form(...),
):
    """
    Calcula la distancia morfométrica EFD entre dos conjuntos de coeficientes.

    Ambos conjuntos deben estar normalizados (normalize=True en /api/efa).

    Retorna:
      {
        "d_efd":        float,   # distancia euclídea en espacio EFD
        "d_ps":         float,   # distancia en espectro de potencia
        "similarity":   float,   # similitud normalizada [0,1]
        "interpretation": str,
      }

    Estado: IMPLEMENTADO (efa.py).
    """
    import json
    ca = json.loads(coeffs_a_json)
    cb = json.loads(coeffs_b_json)
    return await modules.efa.compare(ca, cb)


# ============================================================================
# DEBUG LOG ENDPOINT (monitoreo en tiempo real)
# ============================================================================

_DEBUG_LOG_PATH = "/tmp/mao_monitor.log"

@app.post(f"{API_PREFIX}/debug-log")
async def debug_log(request: Request):
    """Recibe un mensaje de texto del renderer y lo escribe en /tmp/mao_monitor.log."""
    try:
        body = await request.json()
        msg = str(body.get("msg", ""))
        with open(_DEBUG_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(msg + "\n")
    except Exception:
        pass
    return {"ok": True}


# ============================================================================
# ENTRYPOINT (desarrollo directo)
# ============================================================================

if __name__ == "__main__":
    uvicorn.run(
        "python.server:app",
        host=SERVER_HOST,
        port=SERVER_PORT,
        reload=True,
        log_level="info",
    )

