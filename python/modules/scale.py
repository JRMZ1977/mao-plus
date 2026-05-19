"""
MAO Plus — Módulo: Cálculo de escala y error óptico posicional
==============================================================
Estado: IMPLEMENTADO (IMPLEMENTED = True)

Replica exactamente (con extensiones):
  calcularEscala()          analysis-core.js ~L11806
  calcularEscalaHibrida()   analysis-core.js ~L11940  (metadatos RAW)
  estimarErrorOptico()      analysis-core.js ~L11640
  aplicarIncertidumbreOptica() analysis-core.js ~L11760

Fórmula de escala base:
    scale_px_mm = (sensor_w_mm / img_w_px) * (distancia_mm / focal_mm)

    Donde:
      sensor_w_mm  — ancho físico del sensor en milímetros
      img_w_px     — ancho de la imagen en píxeles
      distancia_mm — distancia lente-objeto en milímetros
      focal_mm     — distancia focal del objetivo en milímetros

    Si los metadatos EXIF del archivo imagen contienen FocalLength y el
    modelo de cámara es conocido en la base de datos de sensores, el módulo
    puede calcular la escala sin que el usuario ingrese parámetros manuales.

Sección IX — Error óptico posicional:
    La posición radial del centroide del objeto en la imagen determina un
    error óptico combinado (distorsión radial + perspectiva) que se propaga
    como incertidumbre (±mm / ±mm²) a cada métrica dimensional.
"""

from __future__ import annotations

import io
import math
from typing import Optional

from fastapi import HTTPException

IMPLEMENTED = True

# ── Base de datos de sensores por modelo de cámara ──────────────────────────
# Replica y extiende sensoresRAW de calcularEscalaHibrida() — analysis-core.js ~L11985
# Formato: "make model" (minúsculas) → {"width": mm, "height": mm}

_SENSOR_DB: dict[str, dict] = {
    # Nikon full-frame
    "nikon d850":          {"width": 35.9, "height": 23.9},
    "nikon d780":          {"width": 35.9, "height": 23.9},
    "nikon d750":          {"width": 35.9, "height": 24.0},
    "nikon d700":          {"width": 36.0, "height": 23.9},
    "nikon d610":          {"width": 35.9, "height": 24.0},
    "nikon z9":            {"width": 35.9, "height": 23.9},
    "nikon z7ii":          {"width": 35.9, "height": 23.9},
    "nikon z7":            {"width": 35.9, "height": 23.9},
    "nikon z6ii":          {"width": 35.9, "height": 23.9},
    "nikon z6":            {"width": 35.9, "height": 23.9},
    # Nikon APS-C
    "nikon d7500":         {"width": 23.5, "height": 15.7},
    "nikon d5600":         {"width": 23.5, "height": 15.6},
    "nikon d5500":         {"width": 23.5, "height": 15.6},
    "nikon d3500":         {"width": 23.5, "height": 15.6},
    "nikon z50":           {"width": 23.5, "height": 15.7},
    "nikon zfc":           {"width": 23.5, "height": 15.7},
    "nikon z30":           {"width": 23.5, "height": 15.7},
    # Canon full-frame
    "canon eos r5":        {"width": 36.0, "height": 24.0},
    "canon eos r6":        {"width": 35.9, "height": 23.9},
    "canon eos r6 mark ii": {"width": 35.9, "height": 23.9},
    "canon eos r3":        {"width": 36.0, "height": 24.0},
    "canon eos 5d mark iv":{"width": 36.0, "height": 24.0},
    "canon eos 5ds":       {"width": 36.0, "height": 24.0},
    "canon eos 6d mark ii":{"width": 35.9, "height": 24.0},
    # Canon APS-C
    "canon eos 90d":       {"width": 22.3, "height": 14.8},
    "canon eos 80d":       {"width": 22.5, "height": 15.0},
    "canon eos r7":        {"width": 22.3, "height": 14.8},
    "canon eos r10":       {"width": 22.3, "height": 14.9},
    "canon eos m50 mark ii": {"width": 22.3, "height": 14.9},
    # Sony full-frame
    "sony ilce-7rm5":      {"width": 35.7, "height": 23.8},
    "sony ilce-7rm4":      {"width": 35.7, "height": 23.8},
    "sony ilce-7rm3":      {"width": 35.9, "height": 24.0},
    "sony ilce-7m4":       {"width": 35.6, "height": 23.8},
    "sony ilce-7m3":       {"width": 35.6, "height": 23.8},
    "sony ilce-a7riv":     {"width": 35.7, "height": 23.8},
    "sony ilce-a7rv":      {"width": 35.7, "height": 23.8},
    # Sony APS-C
    "sony ilce-6700":      {"width": 23.5, "height": 15.6},
    "sony ilce-6600":      {"width": 23.5, "height": 15.6},
    "sony ilce-6400":      {"width": 23.5, "height": 15.6},
    # Fujifilm APS-C
    "fujifilm x-t5":       {"width": 23.5, "height": 15.6},
    "fujifilm x-t4":       {"width": 23.5, "height": 15.6},
    "fujifilm x-t3":       {"width": 23.5, "height": 15.6},
    "fujifilm x-s10":      {"width": 23.5, "height": 15.6},
    # Olympus / OM System (Micro 4/3)
    "om system om-1":      {"width": 17.4, "height": 13.0},
    "olympus e-m1 mark iii": {"width": 17.4, "height": 13.0},
    "olympus e-m5 mark iii": {"width": 17.4, "height": 13.0},
    # Panasonic (Micro 4/3)
    "panasonic dc-g9":     {"width": 17.3, "height": 13.0},
    "panasonic dc-gh6":    {"width": 17.3, "height": 13.0},
    "panasonic dc-s5":     {"width": 35.6, "height": 23.8},
}


def _lookup_sensor(make: str, model: str) -> Optional[dict]:
    """
    Busca dimensiones del sensor en _SENSOR_DB.
    Intenta coincidencia exacta, luego búsqueda de subcadena.
    """
    key = f"{make} {model}".strip().lower()
    if key in _SENSOR_DB:
        return _SENSOR_DB[key]
    # Búsqueda parcial: el modelo puede incluir sufijos de firmware
    for db_key, dims in _SENSOR_DB.items():
        if db_key in key or key.startswith(db_key):
            return dims
    return None


def _extract_exif(image_bytes: bytes) -> dict:
    """
    Extrae metadatos EXIF relevantes de los bytes de imagen con piexif.
    Retorna dict con las claves disponibles:
      focal_mm, make, model, img_w_px, img_h_px, iso, fnumber, exposure_s
    """
    result: dict = {}
    try:
        import piexif
        exif = piexif.load(image_bytes)

        ifd0   = exif.get("0th", {})
        exif_d = exif.get("Exif", {})

        # Fabricante y modelo
        make_raw  = ifd0.get(piexif.ImageIFD.Make, b"")
        model_raw = ifd0.get(piexif.ImageIFD.Model, b"")
        if isinstance(make_raw, bytes):
            result["make"]  = make_raw.decode("utf-8", errors="replace").strip().rstrip("\x00")
        if isinstance(model_raw, bytes):
            result["model"] = model_raw.decode("utf-8", errors="replace").strip().rstrip("\x00")

        # Dimensiones
        w = ifd0.get(piexif.ImageIFD.ImageWidth) or exif_d.get(piexif.ExifIFD.PixelXDimension)
        h = ifd0.get(piexif.ImageIFD.ImageLength) or exif_d.get(piexif.ExifIFD.PixelYDimension)
        if w: result["img_w_px"] = int(w)
        if h: result["img_h_px"] = int(h)

        # Distancia focal (RATIONAL)
        fl = exif_d.get(piexif.ExifIFD.FocalLength)
        if fl and isinstance(fl, tuple) and fl[1]:
            result["focal_mm"] = fl[0] / fl[1]

        # FNumber
        fn = exif_d.get(piexif.ExifIFD.FNumber)
        if fn and isinstance(fn, tuple) and fn[1]:
            result["fnumber"] = fn[0] / fn[1]

        # ISO
        iso = exif_d.get(piexif.ExifIFD.ISOSpeedRatings)
        if iso:
            result["iso"] = int(iso)

        # Tiempo de exposición
        exp = exif_d.get(piexif.ExifIFD.ExposureTime)
        if exp and isinstance(exp, tuple) and exp[1]:
            result["exposure_s"] = exp[0] / exp[1]

    except Exception:
        # EXIF no disponible o imagen sin metadatos — no es error crítico
        pass

    # Fallback: dimensiones desde Pillow si piexif no las encontró
    if "img_w_px" not in result or "img_h_px" not in result:
        try:
            from PIL import Image as PilImage
            import io as _io
            with PilImage.open(_io.BytesIO(image_bytes)) as img:
                result["img_w_px"] = img.width
                result["img_h_px"] = img.height
        except Exception:
            pass

    return result


# ── Función principal de cálculo de escala ───────────────────────────────────

def calculate(
    focal_mm: Optional[float],
    distancia_mm: Optional[float],
    sensor_w_mm: Optional[float],
    sensor_h_mm: Optional[float],
    img_w_px: Optional[int],
    img_h_px: Optional[int],
    obj_centroide_x: Optional[float] = None,
    obj_centroide_y: Optional[float] = None,
    image_bytes: Optional[bytes] = None,
) -> dict:
    """
    Calcula la escala px→mm y el error óptico posicional.

    Parámetros mínimos obligatorios:
      focal_mm     — distancia focal del objetivo (mm)
      distancia_mm — distancia lente-objeto (mm)
      sensor_w_mm  — ancho del sensor (mm); se infiere de EXIF si es None
      img_w_px     — ancho de la imagen (px); se infiere de EXIF si es None

    Parámetros opcionales:
      sensor_h_mm      — alto del sensor (mm); si None → asume sensor cuadrado
      img_h_px         — alto de la imagen (px)
      obj_centroide_x  — coordenada X del centroide del objeto (px)
      obj_centroide_y  — coordenada Y del centroide del objeto (px)
      image_bytes      — bytes de imagen para extraer EXIF automáticamente

    Retorna dict con:
      scale_px_mm          — factor escala en mm/px
      px_per_mm            — resolución en px/mm (inverso)
      campo_vision_w_mm    — campo de visión horizontal (mm)
      campo_vision_h_mm    — campo de visión vertical (mm)
      metodo               — "manual" | "exif" | "hibrido"
      exif                 — metadatos extraídos (si image_bytes presente)
      sensor_identificado  — nombre de cámara si se encontró en la DB
      error_optico         — dict con campos de Sección IX (si centroide dado)
    """

    # ── 1. Extraer EXIF si se proporcionó imagen ──────────────────────────
    exif: dict = {}
    sensor_identificado: Optional[str] = None
    metodo = "manual"

    if image_bytes:
        exif = _extract_exif(image_bytes)
        metodo = "hibrido" if any(k in exif for k in ("focal_mm", "make")) else "manual"

        # Completar parámetros faltantes desde EXIF
        if not img_w_px and "img_w_px" in exif:
            img_w_px = exif["img_w_px"]
        if not img_h_px and "img_h_px" in exif:
            img_h_px = exif["img_h_px"]
        if not focal_mm and "focal_mm" in exif:
            focal_mm = exif["focal_mm"]
            metodo = "exif"

        # Sensor desde DB de cámaras
        if not sensor_w_mm and "make" in exif and "model" in exif:
            dims = _lookup_sensor(exif.get("make", ""), exif.get("model", ""))
            if dims:
                sensor_w_mm = dims["width"]
                if not sensor_h_mm:
                    sensor_h_mm = dims["height"]
                sensor_identificado = f"{exif.get('make', '')} {exif.get('model', '')}".strip()

    # ── 2. Validar parámetros mínimos ─────────────────────────────────────
    missing = []
    if not focal_mm:    missing.append("focal_mm")
    if not distancia_mm: missing.append("distancia_mm")
    if not sensor_w_mm: missing.append("sensor_w_mm")
    if not img_w_px:    missing.append("img_w_px")

    if missing:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "Faltan parámetros para el cálculo de escala",
                "faltantes": missing,
                "sugerencia": (
                    "Proporcione focal_mm, distancia_mm, sensor_w_mm e img_w_px "
                    "de forma manual o pase la imagen para extraer EXIF automáticamente."
                ),
            },
        )

    # ── 3. Fórmula base de escala ─────────────────────────────────────────
    # scale = (sensor_w_mm / img_w_px) * (distancia_mm / focal_mm)
    # Idéntica a JS: analysis-core.js ~L11894
    scale_px_mm = (sensor_w_mm / img_w_px) * (distancia_mm / focal_mm)
    px_per_mm   = 1.0 / scale_px_mm

    # ── 4. Campo de visión ────────────────────────────────────────────────
    campo_w = img_w_px * scale_px_mm
    campo_h = (img_h_px * scale_px_mm) if img_h_px else None

    result: dict = {
        "status":           "ok",
        "scale_px_mm":      round(scale_px_mm, 8),
        "px_per_mm":        round(px_per_mm, 4),
        "campo_vision_w_mm": round(campo_w, 2),
        "campo_vision_h_mm": round(campo_h, 2) if campo_h else None,
        "metodo":           metodo,
        "parametros": {
            "focal_mm":     focal_mm,
            "distancia_mm": distancia_mm,
            "sensor_w_mm":  sensor_w_mm,
            "sensor_h_mm":  sensor_h_mm,
            "img_w_px":     img_w_px,
            "img_h_px":     img_h_px,
        },
    }

    if sensor_identificado:
        result["sensor_identificado"] = sensor_identificado
    if exif:
        result["exif"] = exif

    # ── 5. Error óptico posicional (Sección IX) ───────────────────────────
    cx = obj_centroide_x if obj_centroide_x is not None else (img_w_px / 2)
    cy = obj_centroide_y if obj_centroide_y is not None else (img_h_px / 2 if img_h_px else img_w_px / 2)
    result["error_optico"] = _estimar_error_optico(
        cx=cx, cy=cy,
        img_w=img_w_px, img_h=img_h_px or img_w_px,
        focal_mm=focal_mm,
        sensor_w_mm=sensor_w_mm,
        sensor_h_mm=sensor_h_mm,
    )

    return result


# ── Sección IX: Error óptico posicional ─────────────────────────────────────

def _estimar_error_optico(
    cx: float, cy: float,
    img_w: int, img_h: int,
    focal_mm: float,
    sensor_w_mm: float,
    sensor_h_mm: Optional[float] = None,
) -> dict:
    """
    Replica exacta de estimarErrorOptico() — analysis-core.js ~L11640.

    Calcula el error óptico combinado (distorsión radial + perspectiva)
    para la posición radial del centroide del objeto en la imagen.

    Retorna dict con todos los campos de Sección IX del repertorio.
    """
    # Si sensor_h no se conoce, derivarlo por aspect ratio (píxeles cuadrados),
    # igual que JS: sensorH || sensorW * imgH / imgW  (analysis-core.js ~L12194)
    sh = sensor_h_mm if sensor_h_mm else sensor_w_mm * (img_h / img_w)

    # --- 1. FOV diagonal y coeficiente k1 (tabla empírica) ----------------
    diag_sensor = math.sqrt(sensor_w_mm ** 2 + sh ** 2)
    fov_diag_rad = 2 * math.atan(diag_sensor / (2 * focal_mm))
    fov_diag_deg = math.degrees(fov_diag_rad)

    # Tabla idéntica a JS: k1 negativo = distorsión barril
    if fov_diag_deg < 20:
        k1 = -0.0003   # Teleobjetivo muy largo (> 85 mm equiv)
    elif fov_diag_deg < 30:
        k1 = -0.0010   # Teleobjetivo
    elif fov_diag_deg < 45:
        k1 = -0.0035   # Normal-tele
    elif fov_diag_deg < 60:
        k1 = -0.0120   # Normal-gran angular
    elif fov_diag_deg < 75:
        k1 = -0.0400   # Gran angular
    elif fov_diag_deg < 90:
        k1 = -0.1000   # Gran angular severo
    else:
        k1 = -0.2200   # Ultra-gran angular / ojo de pez

    # --- 2. Posición radial normalizada del objeto -------------------------
    dx = cx - img_w / 2
    dy = cy - img_h / 2
    r_px   = math.sqrt(dx * dx + dy * dy)
    r_norm = r_px / (img_w / 2)    # 0=centro, 1=borde horizontal

    # --- 3. Error de distorsión radial ------------------------------------
    error_distorsion_pct = abs(k1) * r_norm * r_norm * 100

    # --- 4. Error de perspectiva (sobre plano plano) ----------------------
    x_sensor = dx * (sensor_w_mm / img_w)
    y_sensor = dy * (sh / img_h)
    r_sensor = math.sqrt(x_sensor ** 2 + y_sensor ** 2)
    theta    = math.atan2(r_sensor, focal_mm)     # ángulo eje óptico (rad)

    cos_theta         = math.cos(theta)
    error_persp_pct   = ((1.0 / (cos_theta * cos_theta)) - 1.0) * 100

    # --- 5. Error combinado DRSS (cuadratura) -----------------------------
    error_lineal_pct = math.sqrt(
        error_distorsion_pct ** 2 + error_persp_pct ** 2
    )
    error_area_pct = math.sqrt(
        (2 * error_distorsion_pct) ** 2 + (2 * error_persp_pct) ** 2
    )

    # --- 6. Categoría de confianza ----------------------------------------
    if error_lineal_pct < 0.5:
        confianza = "Muy Alta (< 0.5%)"
    elif error_lineal_pct < 1.5:
        confianza = "Alta (< 1.5%)"
    elif error_lineal_pct < 3.0:
        confianza = "Moderada (< 3%)"
    elif error_lineal_pct < 6.0:
        confianza = "Baja (< 6%)"
    else:
        confianza = "Muy Baja (> 6%)"

    return {
        # Modelo de lente
        "fov_diagonal_deg":          round(fov_diag_deg, 2),
        "k1_estimado":               round(k1, 6),
        # Posición del objeto
        "posicion_radial_norm":      round(r_norm, 4),
        "posicion_radial_px":        round(r_px, 1),
        "angulo_optico_deg":         round(math.degrees(theta), 3),
        # Errores individuales
        "error_distorsion_percent":  round(error_distorsion_pct, 4),
        "error_perspectiva_percent": round(error_persp_pct, 4),
        # Errores combinados (los que se reportan)
        "error_lineal_percent":      round(error_lineal_pct, 3),
        "error_area_percent":        round(error_area_pct, 3),
        # Clasificación
        "confianza_optica":          confianza,
        "nota_error_optico": (
            f"k1 estimado para FOV {fov_diag_deg:.1f}° "
            "(sin calibración de lente; incertidumbre del modelo ±30%)"
        ),
    }


# ── Propagación de incertidumbre óptica a métricas ───────────────────────────

def aplicar_incertidumbre_optica(metricas: dict, error_optico: dict) -> dict:
    """
    Replica aplicarIncertidumbreOptica() — analysis-core.js ~L11760.

    Añade a cada métrica dimensional:
      {k}_incertidumbre_abs  — ±valor absoluto (mm o mm²)
      {k}_rango_min          — valor mínimo probable
      {k}_rango_max          — valor máximo probable

    Solo afecta métricas en mm/mm²; las métricas adimensionales (ratios)
    no son afectadas porque el factor de escala se cancela.
    """
    if not error_optico or not metricas:
        return metricas

    e_l = error_optico.get("error_lineal_percent", 0.0) / 100.0
    e_a = error_optico.get("error_area_percent",   0.0) / 100.0

    if not e_l and not e_a:
        return metricas

    metricas_lineales = [
        "perimeter", "width", "height",
        "eje_mayor", "eje_menor",
        "radio_maximo", "radio_minimo", "radio_medio",
        "feret_max", "feret_min",
        "perimeter_fragmentado",
        "bounding_width", "bounding_height",
    ]
    metricas_area = [
        "area",
        "area_fragmentada",
    ]

    for k in metricas_lineales:
        v = metricas.get(k)
        if v is not None and isinstance(v, (int, float)) and math.isfinite(v):
            err = abs(v) * e_l
            metricas[f"{k}_incertidumbre_abs"] = round(err, 4)
            metricas[f"{k}_rango_min"]         = round(v - err, 4)
            metricas[f"{k}_rango_max"]         = round(v + err, 4)

    for k in metricas_area:
        v = metricas.get(k)
        if v is not None and isinstance(v, (int, float)) and math.isfinite(v):
            err = abs(v) * e_a
            metricas[f"{k}_incertidumbre_abs"] = round(err, 4)
            metricas[f"{k}_rango_min"]         = round(v - err, 4)
            metricas[f"{k}_rango_max"]         = round(v + err, 4)

    metricas["_incertidumbre_optica_aplicada"] = True
    metricas["_metricas_no_afectadas"] = (
        "circularity,compactness,rectangularity,elongation,shape_factor,"
        "solidity,aspect_ratio,excentricidad,convexity,symmetry_score"
    )
    return metricas
