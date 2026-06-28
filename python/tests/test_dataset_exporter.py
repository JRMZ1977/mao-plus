"""
Tests ADR-014 — Dataset Exporter (COCO JSON + PNGs)
====================================================
Verifica que el exportador genera un ZIP válido con:
  • PNGs recortados con margen
  • annotations.json con schema COCO estándar + mao_attributes
  • metadata.json con stats de exportación
  • Filtro de confianza funciona (objetos bajo umbral se excluyen)
  • Contorno normalizado a coordenadas del recorte
  • Categoría tipológica mapeada correctamente
  • Métricas no serializables excluidas (sin NaN, sin dicts anidados)

Ejecutar:
    cd "MAO PLUS_PY_01"
    .venv/bin/python -m pytest python/tests/test_dataset_exporter.py -v
"""

import io
import json
import zipfile
import numpy as np
import cv2
import pytest

from python.modules.dataset_exporter import (
    build_coco_dataset,
    export_object_to_dataset,
    _build_category_map,
    _sanitize_metrics,
    DEFAULT_CATEGORIES,
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_image(w=400, h=300, color=(180, 180, 180)) -> np.ndarray:
    img = np.full((h, w, 3), color, dtype=np.uint8)
    return img


def _make_obj(
    obj_id="1",
    x=50, y=60, w=100, h=120,
    confidence=0.9,
    tipologia=None,
    contour=None,
    metricas=None,
) -> dict:
    if contour is None:
        # Rectángulo simple como contorno
        contour = [
            [x, y], [x + w, y], [x + w, y + h], [x, y + h]
        ]
    if metricas is None:
        metricas = {
            "area": 1200.0,
            "area_px": 1200.0,
            "perimeter": 140.0,
            "circularity": 0.77,
            "elongation": 1.2,
            "solidity": 0.95,
            "feret_ratio": 0.83,
            "rugosidad_contorno": 1.05,
            "simetria_bilateral": 0.88,
            "forma_detectada": "rectangular",
            # Campo excluible (dict anidado)
            "_contour_data": {"points": [[0, 0]], "metrics": {}},
            # NaN debe excluirse
            "valor_nan": float("nan"),
        }
    return {
        "id": obj_id,
        "bbox": {"x": x, "y": y, "width": w, "height": h},
        "contour_points": contour,
        "detection_confidence": confidence,
        "detection_method": "auto",
        "tipologia": tipologia,
        "metricas": metricas,
        "scale_px_mm": 0.05,
    }


def _load_zip(zip_bytes: bytes) -> zipfile.ZipFile:
    return zipfile.ZipFile(io.BytesIO(zip_bytes))


# ── Test 1: ZIP contiene los archivos esperados ───────────────────────────────

def test_zip_structure():
    img = _make_image()
    objs = [_make_obj("001"), _make_obj("002", x=200)]
    zip_bytes = build_coco_dataset(objs, img, dataset_name="test")

    zf = _load_zip(zip_bytes)
    names = set(zf.namelist())

    assert "annotations.json" in names
    assert "metadata.json" in names
    assert "images/obj_001.png" in names
    assert "images/obj_002.png" in names


# ── Test 2: Schema COCO válido ────────────────────────────────────────────────

def test_coco_schema_valid():
    img = _make_image()
    objs = [_make_obj("003")]
    zip_bytes = build_coco_dataset(objs, img, dataset_name="test_schema")

    zf = _load_zip(zip_bytes)
    coco = json.loads(zf.read("annotations.json"))

    assert "info" in coco
    assert "categories" in coco
    assert "images" in coco
    assert "annotations" in coco

    assert len(coco["images"]) == 1
    assert len(coco["annotations"]) == 1

    ann = coco["annotations"][0]
    assert "segmentation" in ann
    assert "bbox" in ann
    assert "area" in ann
    assert "iscrowd" in ann
    assert ann["iscrowd"] == 0
    assert "mao_attributes" in ann


# ── Test 3: mao_attributes contiene métricas y confianza ─────────────────────

def test_mao_attributes_content():
    img = _make_image()
    objs = [_make_obj("004", confidence=0.85, tipologia="raedera")]
    zip_bytes = build_coco_dataset(objs, img, dataset_name="test_attrs")

    zf = _load_zip(zip_bytes)
    coco = json.loads(zf.read("annotations.json"))
    ann = coco["annotations"][0]
    attrs = ann["mao_attributes"]

    assert abs(attrs["detection_confidence"] - 0.85) < 1e-6
    assert attrs["detection_method"] == "auto"
    assert attrs["tipologia"] == "raedera"
    assert "morphometrics" in attrs
    m = attrs["morphometrics"]
    assert "circularity" in m
    assert "elongation" in m
    # NaN y dicts anidados deben estar excluidos
    assert "valor_nan" not in m
    assert "_contour_data" not in m


# ── Test 4: Filtro de confianza ───────────────────────────────────────────────

def test_confidence_filter():
    img = _make_image()
    objs = [
        _make_obj("005", confidence=0.9),
        _make_obj("006", confidence=0.3, x=200),  # debe excluirse
        _make_obj("007", confidence=0.7, x=100, y=150),
    ]
    zip_bytes = build_coco_dataset(objs, img, dataset_name="test_filter", min_confidence=0.5)

    zf = _load_zip(zip_bytes)
    coco = json.loads(zf.read("annotations.json"))
    metadata = json.loads(zf.read("metadata.json"))

    assert len(coco["annotations"]) == 2
    assert metadata["exported_objects"] == 2
    assert metadata["skipped_by_confidence"] == 1
    assert "images/obj_006.png" not in set(zf.namelist())


# ── Test 5: Contorno relativo al recorte ─────────────────────────────────────

def test_contour_relative_to_crop():
    img = _make_image(w=400, h=300)
    x, y, w, h = 80, 70, 100, 80
    contour = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
    objs = [_make_obj("008", x=x, y=y, w=w, h=h, contour=contour)]
    zip_bytes = build_coco_dataset(objs, img, dataset_name="test_contour")

    zf = _load_zip(zip_bytes)
    coco = json.loads(zf.read("annotations.json"))
    ann = coco["annotations"][0]

    seg = ann["segmentation"][0]  # lista plana [x1,y1,x2,y2,...]
    assert len(seg) == 8  # 4 puntos × 2 coords

    # El primer punto del contorno (x,y) debe quedar en (MARGIN_PX, MARGIN_PX)
    from python.modules.dataset_exporter import MARGIN_PX
    assert abs(seg[0] - MARGIN_PX) < 1e-3
    assert abs(seg[1] - MARGIN_PX) < 1e-3


# ── Test 6: PNG recortado tiene las dimensiones correctas ─────────────────────

def test_crop_dimensions():
    img = _make_image(w=400, h=300)
    x, y, w, h = 50, 60, 100, 80
    objs = [_make_obj("009", x=x, y=y, w=w, h=h)]
    zip_bytes = build_coco_dataset(objs, img, dataset_name="test_crop")

    zf = _load_zip(zip_bytes)
    png_bytes = zf.read("images/obj_009.png")
    arr = np.frombuffer(png_bytes, np.uint8)
    crop = cv2.imdecode(arr, cv2.IMREAD_COLOR)

    from python.modules.dataset_exporter import MARGIN_PX
    expected_w = w + 2 * MARGIN_PX
    expected_h = h + 2 * MARGIN_PX
    assert crop.shape[1] == expected_w
    assert crop.shape[0] == expected_h


# ── Test 7: Categoría tipológica mapeada a category_id correcto ───────────────

def test_tipologia_category_mapping():
    img = _make_image()
    objs = [
        _make_obj("010", tipologia="raedera"),
        _make_obj("011", tipologia=None, x=200),
        _make_obj("012", tipologia="nueva_tipo", x=300),  # no estándar
    ]
    zip_bytes = build_coco_dataset(
        objs, img, dataset_name="test_cat", extra_categories=["nueva_tipo"]
    )

    zf = _load_zip(zip_bytes)
    coco = json.loads(zf.read("annotations.json"))
    cat_names = {c["id"]: c["name"] for c in coco["categories"]}

    anns = {a["mao_attributes"]["object_id"]: a for a in coco["annotations"]}
    assert cat_names[anns["010"]["category_id"]] == "raedera"
    assert cat_names[anns["011"]["category_id"]] == "sin_tipo"
    assert cat_names[anns["012"]["category_id"]] == "nueva_tipo"


# ── Test 8: Métricas no serializables excluidas por _sanitize_metrics ─────────

def test_sanitize_metrics():
    metricas = {
        "area": 100.5,
        "forma_detectada": "circular",
        "solidity": 0.9,
        "_contour_data": {"inner": True},
        "convex_hull_points": [[0, 0], [1, 1]],
        "nan_field": float("nan"),
        "lista_ok": [1.0, 2.0, 3.0],
        "lista_mixta": [1, "texto"],  # debe excluirse
    }
    result = _sanitize_metrics(metricas)

    assert "area" in result
    assert "forma_detectada" in result
    assert "solidity" in result
    assert "lista_ok" in result
    assert "_contour_data" not in result
    assert "convex_hull_points" not in result
    assert "nan_field" not in result
    assert "lista_mixta" not in result
