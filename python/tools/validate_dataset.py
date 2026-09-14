#!/usr/bin/env python3
"""
MAO Plus — Validador de Dataset ML (ADR-014)
=============================================
Verifica la integridad de un dataset exportado con el formato COCO + mao_attributes.

Uso:
    python python/tools/validate_dataset.py datasets/mi_coleccion/
    python python/tools/validate_dataset.py datasets/mi_coleccion/ --strict
    python python/tools/validate_dataset.py datasets/mi_coleccion/ --json-report

Niveles de resultado por anotación:
    OK      — todo válido
    WARN    — dato inusual pero tolerable (p.ej. métrica en rango límite)
    ERROR   — dato inválido que rompe el schema o la coherencia
"""

import argparse
import json
import math
import os
import sys
import zipfile

# ── Rangos esperados para métricas clave ─────────────────────────────────────
_METRIC_RANGES = {
    "circularity":        (0.0, 1.0),
    "solidity":           (0.0, 1.0),
    "elongation":         (0.0, 50.0),
    "feret_ratio":        (0.0, 1.0),
    "rugosidad_contorno": (1.0, 20.0),
    "simetria_bilateral": (0.0, 1.0),
    "area":               (0.0, 1e9),
    "area_px":            (0.0, 1e9),
    "perimeter":          (0.0, 1e9),
}

_REQUIRED_COCO_KEYS = {"info", "categories", "images", "annotations"}
_REQUIRED_ANN_KEYS  = {"id", "image_id", "category_id", "segmentation", "bbox", "area", "iscrowd"}
_REQUIRED_IMG_KEYS  = {"id", "file_name", "width", "height"}
_REQUIRED_CAT_KEYS  = {"id", "name"}


def _load_zip_or_dir(path: str) -> tuple[dict, dict, dict[str, int]]:
    """
    Devuelve (coco_dict, metadata_dict, {file_name: size_bytes}).
    Acepta tanto un directorio expandido como un ZIP.
    """
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as zf:
            names = set(zf.namelist())
            if "annotations.json" not in names:
                raise FileNotFoundError("El ZIP no contiene annotations.json")
            coco = json.loads(zf.read("annotations.json"))
            meta = json.loads(zf.read("metadata.json")) if "metadata.json" in names else {}
            sizes = {
                n.replace("images/", ""): zf.getinfo(n).file_size
                for n in names if n.startswith("images/") and not n.endswith("/")
            }
    else:
        ann_path = os.path.join(path, "annotations.json")
        if not os.path.exists(ann_path):
            raise FileNotFoundError(f"No se encontró annotations.json en {path}")
        with open(ann_path, encoding="utf-8") as f:
            coco = json.load(f)
        meta_path = os.path.join(path, "metadata.json")
        meta = json.load(open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else {}
        img_dir = os.path.join(path, "images")
        sizes = {}
        if os.path.isdir(img_dir):
            for fn in os.listdir(img_dir):
                sizes[fn] = os.path.getsize(os.path.join(img_dir, fn))

    return coco, meta, sizes


def _check(results: list, level: str, ann_id, msg: str):
    results.append({"level": level, "ann_id": ann_id, "msg": msg})


def validate(path: str, strict: bool = False) -> dict:
    """
    Retorna un dict con:
      ok, n_ok, n_warn, n_error, issues: list[{level, ann_id, msg}]
    """
    issues: list[dict] = []

    # ── Cargar ────────────────────────────────────────────────────────────────
    try:
        coco, meta, img_sizes = _load_zip_or_dir(path)
    except Exception as e:
        return {"ok": False, "n_ok": 0, "n_warn": 0, "n_error": 1,
                "issues": [{"level": "ERROR", "ann_id": None, "msg": str(e)}]}

    # ── Schema COCO top-level ──────────────────────────────────────────────────
    missing_top = _REQUIRED_COCO_KEYS - set(coco.keys())
    if missing_top:
        _check(issues, "ERROR", None, f"Faltan secciones COCO: {missing_top}")
        return {"ok": False, "n_ok": 0, "n_warn": 0, "n_error": 1, "issues": issues}

    # ── IDs consistentes ──────────────────────────────────────────────────────
    img_ids   = {img["id"] for img in coco["images"]}
    cat_ids   = {cat["id"] for cat in coco["categories"]}
    ann_ids   = set()

    for img in coco["images"]:
        missing = _REQUIRED_IMG_KEYS - set(img.keys())
        if missing:
            _check(issues, "ERROR", None, f"Imagen id={img.get('id')} faltan campos: {missing}")

    for cat in coco["categories"]:
        missing = _REQUIRED_CAT_KEYS - set(cat.keys())
        if missing:
            _check(issues, "ERROR", None, f"Categoría id={cat.get('id')} faltan campos: {missing}")

    # ── Anotaciones ───────────────────────────────────────────────────────────
    for ann in coco["annotations"]:
        aid = ann.get("id")

        if aid in ann_ids:
            _check(issues, "ERROR", aid, "ID de anotación duplicado")
        ann_ids.add(aid)

        missing = _REQUIRED_ANN_KEYS - set(ann.keys())
        if missing:
            _check(issues, "ERROR", aid, f"Faltan campos COCO: {missing}")
            continue

        # image_id referencia válida
        if ann["image_id"] not in img_ids:
            _check(issues, "ERROR", aid, f"image_id={ann['image_id']} no existe en images[]")

        # category_id referencia válida
        if ann["category_id"] not in cat_ids:
            _check(issues, "ERROR", aid, f"category_id={ann['category_id']} no existe en categories[]")

        # bbox formato COCO [x, y, w, h]
        bbox = ann.get("bbox", [])
        if not (isinstance(bbox, list) and len(bbox) == 4 and all(isinstance(v, (int, float)) for v in bbox)):
            _check(issues, "ERROR", aid, f"bbox inválido: {bbox}")
        elif bbox[2] <= 0 or bbox[3] <= 0:
            _check(issues, "WARN", aid, f"bbox con dimensión ≤0: w={bbox[2]}, h={bbox[3]}")

        # area > 0
        if ann.get("area", 0) <= 0:
            _check(issues, "WARN", aid, f"area={ann.get('area')} ≤ 0")

        # segmentation: lista de listas con número par de coords
        seg = ann.get("segmentation", [])
        if seg:
            for poly in seg:
                if not isinstance(poly, list):
                    _check(issues, "ERROR", aid, "segmentation contiene elemento no-lista")
                elif len(poly) % 2 != 0:
                    _check(issues, "ERROR", aid, f"segmentation polygon con coord impar ({len(poly)} valores)")
                elif len(poly) < 6 and strict:
                    _check(issues, "WARN", aid, f"segmentation polygon con <3 puntos ({len(poly)//2})")

                # Contorno dentro de las dimensiones de la imagen
                img_entry = next((i for i in coco["images"] if i["id"] == ann.get("image_id")), None)
                if img_entry and poly:
                    iw, ih = img_entry.get("width", 0), img_entry.get("height", 0)
                    xs = poly[0::2]
                    ys = poly[1::2]
                    if xs and (min(xs) < -1 or max(xs) > iw + 1):
                        _check(issues, "WARN", aid,
                               f"contorno fuera de imagen en X: [{min(xs):.1f}, {max(xs):.1f}] vs width={iw}")
                    if ys and (min(ys) < -1 or max(ys) > ih + 1):
                        _check(issues, "WARN", aid,
                               f"contorno fuera de imagen en Y: [{min(ys):.1f}, {max(ys):.1f}] vs height={ih}")

        # mao_attributes
        attrs = ann.get("mao_attributes")
        if attrs is None:
            _check(issues, "WARN" if not strict else "ERROR", aid, "Falta mao_attributes")
        else:
            conf = attrs.get("detection_confidence", None)
            if conf is None:
                _check(issues, "WARN", aid, "mao_attributes sin detection_confidence")
            elif not (0.0 <= conf <= 1.0):
                _check(issues, "ERROR", aid, f"detection_confidence={conf} fuera de [0,1]")

            morpho = attrs.get("morphometrics", {})
            for metric, (lo, hi) in _METRIC_RANGES.items():
                val = morpho.get(metric)
                if val is None:
                    continue
                if isinstance(val, float) and math.isnan(val):
                    _check(issues, "ERROR", aid, f"morphometrics.{metric} es NaN")
                elif not (lo <= val <= hi):
                    _check(issues, "WARN", aid,
                           f"morphometrics.{metric}={val:.4f} fuera de rango esperado [{lo}, {hi}]")

        # PNG existe en images/
        img_entry = next((i for i in coco["images"] if i["id"] == ann.get("image_id")), None)
        if img_entry:
            fn = img_entry.get("file_name", "")
            if fn not in img_sizes:
                _check(issues, "ERROR", aid, f"PNG no encontrado: images/{fn}")
            elif img_sizes[fn] == 0:
                _check(issues, "ERROR", aid, f"PNG vacío (0 bytes): images/{fn}")

    # ── Resumen ───────────────────────────────────────────────────────────────
    n_total = len(coco.get("annotations", []))
    n_error = sum(1 for i in issues if i["level"] == "ERROR")
    n_warn  = sum(1 for i in issues if i["level"] == "WARN")
    n_ok    = n_total - len({i["ann_id"] for i in issues if i["ann_id"] is not None})

    return {
        "ok": n_error == 0,
        "n_total": n_total,
        "n_ok": max(0, n_ok),
        "n_warn": n_warn,
        "n_error": n_error,
        "issues": issues,
        "metadata": meta,
    }


def _print_report(result: dict, verbose: bool = False):
    m = result.get("metadata", {})
    print(f"\n{'─'*60}")
    print(f"  MAO Dataset Validator — ADR-014")
    if m.get("dataset_name"):
        print(f"  Colección : {m['dataset_name']}")
    if m.get("created_at"):
        print(f"  Fecha     : {m['created_at']}")
    print(f"  Anotaciones: {result.get('n_total', '?')}  |  "
          f"OK: {result['n_ok']}  |  "
          f"WARN: {result['n_warn']}  |  "
          f"ERROR: {result['n_error']}")
    print(f"{'─'*60}")

    for issue in result["issues"]:
        prefix = "⚠  WARN " if issue["level"] == "WARN" else "✗ ERROR"
        ann_label = f"[ann #{issue['ann_id']}] " if issue["ann_id"] is not None else ""
        print(f"  {prefix}  {ann_label}{issue['msg']}")

    if not result["issues"]:
        print("  ✓ Sin problemas detectados")

    print(f"{'─'*60}")
    print(f"  Resultado: {'✓ VÁLIDO' if result['ok'] else '✗ INVÁLIDO'}\n")


def main():
    parser = argparse.ArgumentParser(
        description="Valida la integridad de un dataset MAO (COCO + mao_attributes)"
    )
    parser.add_argument("path", help="Ruta al directorio del dataset o al ZIP exportado")
    parser.add_argument("--strict", action="store_true",
                        help="Tratar warnings como errores; exigir mao_attributes en todas las anotaciones")
    parser.add_argument("--json-report", action="store_true",
                        help="Imprimir el reporte en JSON en lugar de texto")
    args = parser.parse_args()

    result = validate(args.path, strict=args.strict)

    if args.json_report:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        _print_report(result, verbose=True)

    sys.exit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
