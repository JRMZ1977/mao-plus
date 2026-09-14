"""
MAO Plus — Dataset Exporter (ADR-014)
Genera datasets COCO JSON + PNGs recortados para entrenamiento ML.

Los datos morfométricos calculados por MAO (métricas, contorno, confianza)
se almacenan como `mao_attributes` en cada anotación COCO.
"""

import base64
import io
import json
import os
import zipfile
from datetime import datetime
from typing import Any, Optional

import cv2
import numpy as np

MARGIN_PX = 10  # margen alrededor del bbox en el recorte PNG

# Categorías tipológicas iniciales (id 1 = sin_tipo siempre primero)
DEFAULT_CATEGORIES = [
    "sin_tipo",
    "lasca",
    "raedera",
    "raedera_lateral",
    "raedera_transversal",
    "punta",
    "perforador",
    "raspador",
    "buril",
    "bifaz",
    "nucleo",
    "fragmento",
]

# Métricas que NO son numéricas o son redundantes para el dataset
_SKIP_METRIC_KEYS = {
    "_contour_data",
    "convex_hull_points",
    "vertices_coords",
    "eje_mayor_p1_recortado",
    "eje_mayor_p2_recortado",
    "punto_radio_maximo",
    "punto_radio_minimo",
    "centroide",
}


def _build_category_map(extra_categories: Optional[list[str]] = None) -> list[dict]:
    cats = list(DEFAULT_CATEGORIES)
    if extra_categories:
        for c in extra_categories:
            if c not in cats:
                cats.append(c)
    return [{"id": i + 1, "name": c, "supercategory": "litico"} for i, c in enumerate(cats)]


def _category_id(name: Optional[str], cat_map: list[dict]) -> int:
    if not name:
        return 1  # sin_tipo
    for c in cat_map:
        if c["name"] == name.lower().replace(" ", "_"):
            return c["id"]
    return 1


def _sanitize_metrics(metricas: dict) -> dict:
    """Devuelve solo métricas serializables a JSON (float/int/str/bool/list simple)."""
    out = {}
    for k, v in metricas.items():
        if k in _SKIP_METRIC_KEYS:
            continue
        if isinstance(v, (int, float, str, bool)) and not (isinstance(v, float) and (v != v)):  # nan check
            out[k] = v
        elif isinstance(v, list) and all(isinstance(x, (int, float)) for x in v):
            out[k] = v
    return out


def export_object_to_dataset(
    obj_data: dict,
    image_np: np.ndarray,
    ann_id: int,
    img_id: int,
    cat_map: list[dict],
) -> tuple[dict, dict, bytes]:
    """
    Genera la anotación COCO + la imagen PNG recortada para un objeto.

    Args:
        obj_data: dict con campos bbox (x,y,w,h), contour_points, metricas,
                  detection_confidence, detection_method, tipologia (opcional).
        image_np: imagen completa en numpy (BGR o RGB).
        ann_id: ID único para esta anotación COCO.
        img_id: ID único para la imagen COCO.
        cat_map: lista de categorías COCO.

    Returns:
        (coco_image_dict, coco_annotation_dict, png_bytes)
    """
    bbox = obj_data.get("bbox", {})
    x = int(bbox.get("x", obj_data.get("minX", 0)))
    y = int(bbox.get("y", obj_data.get("minY", 0)))
    w = int(bbox.get("width", obj_data.get("width", 0)))
    h = int(bbox.get("height", obj_data.get("height", 0)))

    img_h, img_w = image_np.shape[:2]

    # Bbox con margen, recortado a los límites de la imagen
    x0 = max(0, x - MARGIN_PX)
    y0 = max(0, y - MARGIN_PX)
    x1 = min(img_w, x + w + MARGIN_PX)
    y1 = min(img_h, y + h + MARGIN_PX)

    crop = image_np[y0:y1, x0:x1]
    crop_h, crop_w = crop.shape[:2]

    # Codificar PNG
    success, buf = cv2.imencode(".png", crop)
    png_bytes = buf.tobytes() if success else b""

    # Contorno relativo al recorte (coordenadas absolutas → relativas al crop)
    contour_points = obj_data.get("contour_points", [])
    seg_flat: list[float] = []
    for pt in contour_points:
        if isinstance(pt, (list, tuple)) and len(pt) >= 2:
            seg_flat.append(float(pt[0]) - x0)
            seg_flat.append(float(pt[1]) - y0)
        elif isinstance(pt, dict):
            seg_flat.append(float(pt.get("x", 0)) - x0)
            seg_flat.append(float(pt.get("y", 0)) - y0)

    # Área COCO = área del contorno en el recorte (usa shoelace si hay puntos)
    coco_area = float(obj_data.get("metricas", {}).get("area_px", w * h))

    # Bbox COCO [x_min, y_min, width, height] relativo al recorte
    coco_bbox = [float(x - x0), float(y - y0), float(w), float(h)]

    obj_id = str(obj_data.get("id", img_id))
    file_name = f"obj_{obj_id.replace('/', '_')}.png"

    coco_image = {
        "id": img_id,
        "file_name": file_name,
        "width": crop_w,
        "height": crop_h,
    }

    tipologia = obj_data.get("tipologia") or None
    cat_id = _category_id(tipologia, cat_map)

    metricas_raw = obj_data.get("metricas", {})
    metricas_clean = _sanitize_metrics(metricas_raw)

    # EFA coefficients se guardan como lista plana si existen
    efa = obj_data.get("efa_coefficients") or metricas_raw.get("efa_coefficients")
    if efa:
        metricas_clean["efa_coefficients"] = efa if isinstance(efa, list) else list(efa)

    coco_annotation = {
        "id": ann_id,
        "image_id": img_id,
        "category_id": cat_id,
        "segmentation": [seg_flat] if seg_flat else [],
        "bbox": coco_bbox,
        "area": coco_area,
        "iscrowd": 0,
        "mao_attributes": {
            "detection_confidence": float(obj_data.get("detection_confidence", 0.0)),
            "detection_method": str(obj_data.get("detection_method", "unknown")),
            "morphometrics": metricas_clean,
            "tipologia": tipologia,
            "scale_px_mm": float(obj_data.get("scale_px_mm", 0.0)),
            "object_id": obj_id,
        },
    }

    return coco_image, coco_annotation, png_bytes


def build_coco_dataset(
    objects_list: list[dict],
    image_np: np.ndarray,
    dataset_name: str,
    min_confidence: float = 0.5,
    scale_px_mm: float = 0.0,
    extra_categories: Optional[list[str]] = None,
) -> bytes:
    """
    Construye un ZIP en memoria con images/ + annotations.json + metadata.json.

    Args:
        objects_list: lista de dicts de objetos analizados.
        image_np: imagen original en numpy.
        dataset_name: nombre de la colección (para metadata).
        min_confidence: umbral mínimo de confianza para incluir un objeto.
        scale_px_mm: factor de escala px→mm de la sesión.
        extra_categories: categorías tipológicas adicionales.

    Returns:
        bytes del ZIP.
    """
    cat_map = _build_category_map(extra_categories)

    coco_images = []
    coco_annotations = []
    skipped = 0
    ann_id = 1
    img_id = 1
    png_files: list[tuple[str, bytes]] = []

    for obj in objects_list:
        conf = float(obj.get("detection_confidence", 1.0))
        if conf < min_confidence:
            skipped += 1
            continue

        # Propagar scale_px_mm si el objeto no lo tiene
        if "scale_px_mm" not in obj:
            obj = {**obj, "scale_px_mm": scale_px_mm}

        coco_img, coco_ann, png_bytes = export_object_to_dataset(
            obj_data=obj,
            image_np=image_np,
            ann_id=ann_id,
            img_id=img_id,
            cat_map=cat_map,
        )
        coco_images.append(coco_img)
        coco_annotations.append(coco_ann)
        png_files.append((f"images/{coco_img['file_name']}", png_bytes))
        ann_id += 1
        img_id += 1

    now = datetime.utcnow().isoformat() + "Z"

    coco_json = {
        "info": {
            "description": f"MAO Dataset — {dataset_name}",
            "version": "1.0",
            "date_created": now,
            "contributor": "MAO Plus",
            "schema": "COCO + mao_attributes (ADR-014)",
        },
        "licenses": [],
        "categories": cat_map,
        "images": coco_images,
        "annotations": coco_annotations,
    }

    metadata = {
        "dataset_name": dataset_name,
        "created_at": now,
        "schema_version": "1.0",
        "scale_px_mm": scale_px_mm,
        "min_confidence_filter": min_confidence,
        "total_objects": len(objects_list),
        "exported_objects": len(coco_annotations),
        "skipped_by_confidence": skipped,
        "image_shape": list(image_np.shape),
        "categories": [c["name"] for c in cat_map],
    }

    # Empaquetar ZIP en memoria
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path, data in png_files:
            zf.writestr(path, data)
        zf.writestr("annotations.json", json.dumps(coco_json, ensure_ascii=False, indent=2))
        zf.writestr("metadata.json", json.dumps(metadata, ensure_ascii=False, indent=2))

    return buf.getvalue()
