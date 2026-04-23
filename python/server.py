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

import logging
from typing import Optional

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

    Estado: PENDIENTE — stub listo para implementación.
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

    Estado: PENDIENTE — stub listo para implementación.
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
    normalize_mode: str = Form(default="none"),
    analysis_level: str = Form(default="pca"),
    orientation_mode: str = Form(default="auto"),
    user_anchor_x: Optional[float] = Form(default=None),
    user_anchor_y: Optional[float] = Form(default=None),
    user_anchor_z: Optional[float] = Form(default=None),
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

    return await modules.obj3d.analyze(
        obj_bytes=data,
        n_samples=n_samples,
        normalize_mode=normalize_mode,
        analysis_level=analysis_level,
        orientation_mode=orientation_mode,
        user_anchor=(user_anchor_x, user_anchor_y, user_anchor_z),
    )


# ============================================================================
# MÓDULO: OPERACIONES MORFOLÓGICAS
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

    Estado: PENDIENTE — stub listo para implementación.
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

    Estado: PENDIENTE — stub listo para implementación.
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

    Estado: PENDIENTE — stub listo para implementación.
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

    Estado: PENDIENTE — stub listo para implementación.
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

    Estado: PENDIENTE — stub listo para implementación.
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
    return await modules.classifier.classify_async(m)


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

    h, w = img.shape[:2]

    if not (0 <= seed_x < w and 0 <= seed_y < h):
        return {"status": "error",
                "message": f"Punto ({seed_x},{seed_y}) fuera de imagen {w}×{h}"}

    # ── Flood fill desde el punto semilla ──────────────────────────────────
    img_copy = img.copy()
    mask = np.zeros((h + 2, w + 2), np.uint8)
    tol = (tolerance, tolerance, tolerance)
    _cv2.floodFill(
        img_copy, mask, (seed_x, seed_y), (128, 128, 128),
        tol, tol,
        _cv2.FLOODFILL_MASK_ONLY | _cv2.FLOODFILL_FIXED_RANGE,
    )
    region = mask[1:-1, 1:-1]          # quitar padding de floodFill

    # ── Limpieza morfológica ───────────────────────────────────────────────
    kernel = _cv2.getStructuringElement(_cv2.MORPH_ELLIPSE, (3, 3))
    region = _cv2.morphologyEx(region, _cv2.MORPH_CLOSE, kernel, iterations=2)
    region = _cv2.morphologyEx(region, _cv2.MORPH_OPEN,  kernel, iterations=1)

    # ── Extraer contorno ───────────────────────────────────────────────────
    contours, _ = _cv2.findContours(region, _cv2.RETR_EXTERNAL, _cv2.CHAIN_APPROX_NONE)
    if not contours:
        return {"status": "error",
                "message": "No se encontró región conectada en ese punto. "
                           "Intente hacer clic más al centro de la P/H."}

    cnt = max(contours, key=_cv2.contourArea)
    area_px = float(_cv2.contourArea(cnt))

    if area_px < 16:
        return {"status": "error",
                "message": "Región demasiado pequeña (< 16 px²). "
                           "Intente hacer clic más al centro de la P/H."}

    # ── Simplificación Douglas-Peucker ─────────────────────────────────────
    epsilon = max(1.5, 0.004 * _cv2.arcLength(cnt, True))
    approx  = _cv2.approxPolyDP(cnt, epsilon, True)
    if len(approx) < 3:
        approx = cnt          # fallback: contorno completo

    points = [[int(p[0][0]), int(p[0][1])] for p in approx]

    x, y, bw, bh = _cv2.boundingRect(cnt)
    M  = _cv2.moments(cnt)
    cx = float(M["m10"] / M["m00"]) if M["m00"] != 0 else float(seed_x)
    cy = float(M["m01"] / M["m00"]) if M["m00"] != 0 else float(seed_y)

    return {
        "status":   "ok",
        "points":   points,
        "area_px":  area_px,
        "bbox":     {"x": x, "y": y, "w": bw, "h": bh},
        "centroid": [cx, cy],
    }


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

