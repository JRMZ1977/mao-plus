"""
MAO Plus — Módulo: Operaciones morfológicas
=============================================
Estado: IMPLEMENTADO (IMPLEMENTED = True)

Funciones JS que reemplaza:
  - dilatarMascara()              analysis-core.js ~L3310
  - erosionarMascara()            analysis-core.js ~L3339
  - cerrarMascara()               analysis-core.js ~L3368
  - abrirMascara()                analysis-core.js ~L3382
  - suavizarMascaraMorfologica()  analysis-core.js ~L3396

Ventaja sobre JS:
  JS usa loops manuales pixel-a-pixel con kernel 3×3 desenrollado.
  cv2.morphologyEx ejecuta en C++ con SIMD → misma semántica, ~50x más rápido.

Operación "smooth" replica suavizarMascaraMorfologica():
  Cierre morfológico (close) + apertura (open) → elimina huecos y ruido.
"""

import numpy as np
import cv2
import base64
from fastapi import HTTPException

IMPLEMENTED = True

# Tipos de kernel disponibles
KERNEL_SHAPES = {
    "rect":    cv2.MORPH_RECT,
    "ellipse": cv2.MORPH_ELLIPSE,
    "cross":   cv2.MORPH_CROSS,
}

# Operaciones morfológicas disponibles (excluye "smooth" — manejado aparte)
MORPH_OPS = {
    "dilate": cv2.MORPH_DILATE,
    "erode":  cv2.MORPH_ERODE,
    "open":   cv2.MORPH_OPEN,
    "close":  cv2.MORPH_CLOSE,
}


def _decode_mask(image_bytes: bytes) -> np.ndarray:
    """Decodifica imagen como máscara binaria (0 o 255)."""
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise HTTPException(status_code=400, detail="No se pudo decodificar la máscara.")
    _, mask = cv2.threshold(img, 127, 255, cv2.THRESH_BINARY)
    return mask


def _encode_mask(mask: np.ndarray) -> str:
    """Codifica máscara binaria como base64 PNG."""
    _, buffer = cv2.imencode(".png", mask)
    return "data:image/png;base64," + base64.b64encode(buffer).decode()


async def apply(
    image_bytes: bytes,
    operation: str,
    iterations: int = 1,
    kernel_size: int = 3,
    kernel_shape: str = "ellipse",
    kernel_size_close: "int | None" = None,
    kernel_size_open:  "int | None" = None,
) -> dict:
    """
    Aplica operación morfológica sobre máscara binaria.

    Operaciones disponibles:
      dilate  — dilatarMascara()  JS ~L3310  — expande regiones de objeto
      erode   — erosionarMascara() JS ~L3339 — contrae regiones de objeto
      open    — abrirMascara()    JS ~L3382  — erosión + dilatación (elimina ruido)
      close   — cerrarMascara()   JS ~L3368  — dilatación + erosión (cierra huecos)
      smooth  — suavizarMascaraMorfologica() JS ~L3396 — close + open combinados

    Parámetros exclusivos de smooth:
      kernel_size_close — kernel para el paso close (cierra huecos grandes).
                          Si se omite, usa kernel_size.
      kernel_size_open  — kernel para el paso open  (elimina ruido fino).
                          Si se omite, usa kernel_size.

    Retorna:
      mask_base64    — máscara resultante como data:image/png;base64,...
      pixels_changed — número de píxeles modificados respecto a máscara original
      pixels_before  — píxeles activos antes de la operación
      pixels_after   — píxeles activos después de la operación
    """
    mask = _decode_mask(image_bytes)
    kshape = KERNEL_SHAPES.get(kernel_shape, cv2.MORPH_ELLIPSE)
    ksize = max(3, kernel_size | 1)  # forzar impar y mínimo 3
    kernel = cv2.getStructuringElement(kshape, (ksize, ksize))

    pixels_before = int(np.count_nonzero(mask))

    # Valores de kernel_size_close/open que se reportarán al final
    kc_out = ksize
    ko_out = ksize

    if operation == "smooth":
        # Kernels independientes para close y open.
        # close con kernel grande cierra huecos amplios;
        # open con kernel pequeño elimina solo ruido fino.
        kc_out = max(3, (kernel_size_close if kernel_size_close is not None else kernel_size) | 1)
        ko_out = max(3, (kernel_size_open  if kernel_size_open  is not None else kernel_size) | 1)
        k_close = cv2.getStructuringElement(kshape, (kc_out, kc_out))
        k_open  = cv2.getStructuringElement(kshape, (ko_out, ko_out))
        result = cv2.morphologyEx(mask,   cv2.MORPH_CLOSE, k_close, iterations=iterations)
        result = cv2.morphologyEx(result, cv2.MORPH_OPEN,  k_open,  iterations=iterations)
    else:
        morph_type = MORPH_OPS.get(operation)
        if morph_type is None:
            raise HTTPException(status_code=400, detail=f"Operación desconocida: {operation}")
        result = cv2.morphologyEx(mask, morph_type, kernel, iterations=iterations)

    pixels_after   = int(np.count_nonzero(result))
    pixels_changed = int(np.sum(result != mask))

    return {
        "status":         "ok",
        "mask_base64":    _encode_mask(result),
        "operation":      operation,
        "iterations":     iterations,
        "kernel_size":    ksize,
        "kernel_shape":   kernel_shape,
        "kernel_size_close": kc_out,
        "kernel_size_open":  ko_out,
        "pixels_before":  pixels_before,
        "pixels_after":   pixels_after,
        "pixels_changed": pixels_changed,
        "change_percent": round(pixels_changed / max(mask.size, 1) * 100, 3),
    }
