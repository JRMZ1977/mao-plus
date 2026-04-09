"""
MAO Plus — Módulo: Detección de instancias con YOLOv8n (Fase 1 IA)
===================================================================
Implementa un pipeline de detección de objetos arqueológicos usando
YOLOv8n como detector de instancias, resolviendo la limitación principal
del módulo detection.py: incapacidad de separar objetos pegados/solapados.

Pipeline:
  Imagen → YOLOv8n (bboxes por instancia) → GrabCut/SAM por ROI
         → contorno fino → descriptores morfológicos MAO_IA

El modelo se descarga automáticamente (~6 MB) en el primer uso desde
la caché de ultralytics. No requiere GPU: funciona bien en CPU ARM (M1/M2/M3).

Estrategia de fallback (degradación elegante):
  1. YOLOv8n disponible + confianza ≥ conf_threshold  → detección YOLO
  2. YOLOv8n no disponible o sin detecciones útiles    → detection.py clásico
  3. Sin ningún resultado                               → HTTPException 422

Funciones públicas:
  detect_yolo()   — async, equivalente a detection.detect() pero con YOLO
  status_yolo()   — dict con estado del módulo (modelo disponible, versión)
"""

import math
import logging
from typing import Optional
import numpy as np
import cv2
from fastapi import HTTPException

from python.modules.detection import (
    _bytes_to_cv,
    _detectar_color_fondo,
    _excluir_franja_borde,
    _grabcut_mask,
    _aplicar_clahe,
    _zscan_color_analysis,
    _build_binary_mask,
)
from python.modules.mao_ia_analyzer import _morpho_from_contour

_log = logging.getLogger("mao.yolo_detector")

# ── Estado global del modelo (carga lazy, singleton) ─────────────────────────
_yolo_model = None
_yolo_available: Optional[bool] = None   # None = aún no intentado
_YOLO_MODEL_NAME = "yolov8n.pt"       # nano ≈ 6 MB; funciona bien en CPU


def _load_yolo():
    """
    Carga YOLOv8n en memoria (singleton).
    El modelo se descarga automáticamente si no existe en caché.
    Retorna True si el modelo cargó, False si hay error.
    """
    global _yolo_model, _yolo_available
    if _yolo_available is not None:
        return _yolo_available
    try:
        from ultralytics import YOLO
        _yolo_model = YOLO(_YOLO_MODEL_NAME)
        _yolo_available = True
        _log.info("[YOLODetector] Modelo %s cargado correctamente.", _YOLO_MODEL_NAME)
    except Exception as exc:
        _yolo_model = None
        _yolo_available = False
        _log.warning("[YOLODetector] No se pudo cargar YOLOv8n: %s", exc)
    return _yolo_available


def status_yolo() -> dict:
    """
    Retorna el estado actual del módulo YOLO.
    Llamado por GET /api/detect-yolo/status
    """
    _load_yolo()
    return {
        "yolo_available": bool(_yolo_available),
        "model": _YOLO_MODEL_NAME,
        "fallback": "detection.py clásico (Z-scan + GrabCut)",
        "note": (
            "YOLOv8n activo — detección de instancias separadas"
            if _yolo_available
            else "YOLOv8n no disponible — usando detection.py clásico"
        ),
    }


# ── Helpers ──────────────────────────────────────────────────────────────────

def _iou(boxA: tuple, boxB: tuple) -> float:
    """Intersection-over-Union entre dos bboxes (x, y, w, h)."""
    ax1, ay1 = boxA[0], boxA[1]
    ax2, ay2 = ax1 + boxA[2], ay1 + boxA[3]
    bx1, by1 = boxB[0], boxB[1]
    bx2, by2 = bx1 + boxB[2], by1 + boxB[3]

    inter_x1 = max(ax1, bx1); inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2); inter_y2 = min(ay2, by2)
    if inter_x2 <= inter_x1 or inter_y2 <= inter_y1:
        return 0.0
    inter_area = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)
    union_area = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter_area
    return inter_area / union_area if union_area > 0 else 0.0


def _nms_bboxes(bboxes: list, iou_thresh: float = 0.45) -> list:
    """
    Non-Maximum Suppression sobre lista de bboxes.
    bboxes: lista de dicts con 'bbox', 'confidence'.
    Retorna lista filtrada, ordenada por confianza descendente.
    """
    if not bboxes:
        return []
    sorted_boxes = sorted(bboxes, key=lambda b: b["confidence"], reverse=True)
    kept = []
    suppressed = set()
    for i, box in enumerate(sorted_boxes):
        if i in suppressed:
            continue
        kept.append(box)
        for j in range(i + 1, len(sorted_boxes)):
            if j in suppressed:
                continue
            if _iou(box["bbox"], sorted_boxes[j]["bbox"]) > iou_thresh:
                suppressed.add(j)
    return kept


def _run_yolo_on_image(img_bgr: np.ndarray, conf: float, max_objects: int) -> list:
    """
    Ejecuta YOLOv8n sobre la imagen y retorna lista de bboxes detectados.

    Estrategia de detección:
    - YOLOv8n está entrenado en COCO (80 clases genéricas).
    - Para objetos arqueológicos sobre fondos uniformes, YOLOv8n detecta
      bien objetos que ocupan >5% del área de imagen, incluso sin fine-tuning.
    - Se filtran solo detecciones con conf ≥ umbral, luego NMS.
    - Si el número de detecciones YOLO es 0 o todas son de muy baja confianza,
      el llamador activará el fallback a detection.py.

    Retorna: lista de dicts {bbox: (x,y,w,h), confidence: float, class_id: int}
    """
    results = _yolo_model.predict(
        img_bgr,
        conf=conf,
        iou=0.45,
        max_det=max_objects,
        verbose=False,
        device="cpu",   # fuerza CPU para compatibilidad macOS ARM sin MPS
    )

    detections = []
    if not results:
        return detections

    for result in results:
        if result.boxes is None:
            continue
        for box in result.boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
            w_box = x2 - x1
            h_box = y2 - y1
            if w_box < 10 or h_box < 10:
                continue
            detections.append({
                "bbox":       (x1, y1, w_box, h_box),
                "confidence": float(box.conf[0]),
                "class_id":   int(box.cls[0]),
            })

    return _nms_bboxes(detections)


def _segment_roi(img_bgr: np.ndarray, bbox: tuple, use_grabcut: bool = True) -> np.ndarray:
    """
    Segmenta el objeto dentro del bbox usando GrabCut para obtener máscara fina.
    Retorna máscara binaria del tamaño de img_bgr (0=fondo, 255=objeto).
    """
    x, y, w, h = bbox
    img_h, img_w = img_bgr.shape[:2]

    # Añadir margen de contexto (20%) para que GrabCut tenga bordes claros
    margin_x = max(10, int(w * 0.20))
    margin_y = max(10, int(h * 0.20))
    rx1 = max(0, x - margin_x)
    ry1 = max(0, y - margin_y)
    rx2 = min(img_w, x + w + margin_x)
    ry2 = min(img_h, y + h + margin_y)

    roi = img_bgr[ry1:ry2, rx1:rx2]
    if roi.size == 0:
        full_mask = np.zeros((img_h, img_w), dtype=np.uint8)
        full_mask[y:y+h, x:x+w] = 255
        return full_mask

    if use_grabcut:
        gc_mask = _grabcut_mask(roi)
    else:
        # Alternativa rápida: umbral Otsu sobre ROI en gris
        gray_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        _, binary = cv2.threshold(gray_roi, 0, 1, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        gc_mask = binary.astype(np.uint8)

    # Proyectar máscara ROI al canvas completo
    full_mask = np.zeros((img_h, img_w), dtype=np.uint8)
    full_mask[ry1:ry2, rx1:rx2] = (gc_mask * 255).astype(np.uint8)
    return full_mask


def _extract_object_from_mask(
    img_bgr: np.ndarray,
    full_mask: np.ndarray,
    bbox: tuple,
    min_area: int,
    obj_index: int,
) -> "dict | None":
    """
    Dado img_bgr y máscara binaria, extrae métricas del objeto mayor dentro del bbox.
    Retorna dict compatible con el formato de detection.detect() o None si no hay objeto.
    """
    x, y, w, h = bbox
    roi_mask = full_mask[y:y+h, x:x+w]

    contours, _ = cv2.findContours(roi_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    # Tomar el contorno de mayor área dentro del bbox
    cnt = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(cnt)
    if area < min_area:
        return None

    # Ajustar coordenadas del contorno al canvas completo
    cnt_global = cnt + np.array([[[x, y]]])

    # Bounding box real del contorno
    bx, by, bw, bh = cv2.boundingRect(cnt_global)

    # Centroide
    M = cv2.moments(cnt_global)
    if M["m00"] <= 0:
        cx, cy = bx + bw // 2, by + bh // 2
    else:
        cx = M["m10"] / M["m00"]
        cy = M["m01"] / M["m00"]

    # Perímetro y aspecto
    perimeter = cv2.arcLength(cnt_global, True)
    aspect_ratio = bw / bh if bh > 0 else 1.0

    # Descriptores MAO_IA
    morph = _morpho_from_contour(cnt_global, obj_index)

    return {
        "id":           f"PY_{obj_index + 1:02d}",
        "bbox":         {"x": bx, "y": by, "w": bw, "h": bh},
        "area":         float(area),
        "perimeter":    float(perimeter),
        "centroid":     [float(cx), float(cy)],
        "aspect_ratio": float(aspect_ratio),
        "width":        bw,
        "height":       bh,
        "detection_method": "yolov8n",
        "mao_ia": {
            "circularity":         morph["circularity"],
            "solidity":            morph["solidity"],
            "equivalent_diameter": morph["equivalent_diameter"],
            "extent":              morph["extent"],
            "aspect_ratio":        morph["aspect_ratio"],
            "convexity_defects":   morph["convexity_defects"],
        },
    }


# ── Función pública principal ─────────────────────────────────────────────────

async def detect_yolo(
    image_bytes: bytes,
    conf_threshold: float = 0.20,
    min_area: int = 100,
    max_objects: int = 50,
    use_grabcut: bool = True,
    fallback_classical: bool = True,
) -> dict:
    """
    Detecta objetos arqueológicos en la imagen usando YOLOv8n.

    Flujo:
      1. YOLOv8n → bboxes de instancias (separa objetos pegados)
      2. GrabCut por ROI → máscara fina de cada objeto
      3. Extracción de contorno y descriptores MAO_IA
      4. Si YOLO no disponible o sin detecciones → fallback a detection.py

    Parámetros:
      conf_threshold   — confianza mínima YOLO (0.0–1.0). 0.20 apto para
                         objetos arqueológicos sobre fondo plano.
      min_area         — área mínima en píxeles para considerar un objeto.
      max_objects      — límite de objetos a retornar.
      use_grabcut      — usar GrabCut para afinar la máscara por ROI.
      fallback_classical — si True, usa detection.py cuando YOLO falla.

    Retorna:
      {"objects": [...], "count": int, "method": "yolov8n"|"classical"|"hybrid"}
    """
    # ── Decodificar imagen ────────────────────────────────────────────────────
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise HTTPException(status_code=400, detail="No se pudo decodificar la imagen.")

    img_h, img_w = img_bgr.shape[:2]

    # ── Intentar detección con YOLO ───────────────────────────────────────────
    yolo_ok = _load_yolo()
    yolo_detections = []

    if yolo_ok:
        try:
            yolo_detections = _run_yolo_on_image(img_bgr, conf=conf_threshold, max_objects=max_objects)
            _log.info("[YOLODetector] %d detecciones YOLO (conf≥%.2f)", len(yolo_detections), conf_threshold)
        except Exception as exc:
            _log.warning("[YOLODetector] Error en inferencia YOLO: %s", exc)
            yolo_detections = []

    # ── Si YOLO detectó objetos: refinar con GrabCut ──────────────────────────
    if yolo_detections:
        objects = []
        for i, det in enumerate(yolo_detections[:max_objects]):
            bbox = det["bbox"]
            try:
                full_mask = _segment_roi(img_bgr, bbox, use_grabcut=use_grabcut)
                obj = _extract_object_from_mask(img_bgr, full_mask, bbox, min_area, i)
                if obj is not None:
                    obj["yolo_confidence"] = det["confidence"]
                    obj["yolo_class_id"]   = det["class_id"]
                    objects.append(obj)
            except Exception as exc:
                _log.warning("[YOLODetector] Error procesando bbox %s: %s", bbox, exc)

        if objects:
            return {
                "objects": objects,
                "count":   len(objects),
                "method":  "yolov8n+grabcut" if use_grabcut else "yolov8n",
                "yolo_raw_detections": len(yolo_detections),
            }

    # ── Fallback: detection.py clásico ───────────────────────────────────────
    if not fallback_classical:
        return {"objects": [], "count": 0, "method": "yolov8n_no_detections"}

    _log.info("[YOLODetector] Sin detecciones YOLO — usando detection.py clásico.")

    from python.modules.detection import detect as detect_classical
    result = await detect_classical(
        image_bytes=image_bytes,
        threshold=0.5,
        min_area=min_area,
        max_objects=max_objects,
    )

    # Marcar los objetos como detectados por método clásico
    for obj in result.get("objects", []):
        obj["detection_method"] = "classical_zscan"

    result["method"] = "classical_fallback"
    return result
