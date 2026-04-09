"""
MAO Plus — Módulo: Pipeline completo de análisis
=================================================
Estado: IMPLEMENTADO (IMPLEMENTED = True)

Orquesta los módulos individuales en un único endpoint:
  detect → contour → metrics [→ texture] [→ color]

Replica el flujo de analizarObjetoMorfologicamente() — analysis-core.js ~L10812
sin la lógica de renderizado de UI (que permanece en JS).
"""

IMPLEMENTED = True

from python.modules import detection, contour, metrics


async def full_pipeline(
    image_bytes: bytes,
    scale_px_mm: float = 1.0,
    run_texture: bool = False,
    run_color: bool = False,
) -> dict:
    """
    Pipeline completo: detect → contour → metrics [→ texture] [→ color].

    Replica el flujo de analizarObjetoMorfologicamente() (~L10812) sin UI:
      1. detection.detect()  — bounding boxes de todos los objetos
      2. contour.extract()   — contorno sub-píxel por objeto
      3. metrics.calculate() — 124 indicadores morfométricos
      4. metrics.texture()   — GLCM (si run_texture=True)
      5. detection.color()   — análisis RGB/LAB (si run_color=True)

    Retorna
    -------
    {
      "status": "ok" | "no_objects" | "error",
      "count": n,
      "scale_px_mm": float,
      "objects": [
        {
          "id": int,
          "bbox": {x, y, width, height},
          "area_px": float,
          "contour": [...],          # puntos del contorno
          "metricas": {...},         # 124 indicadores
          "textura": {...},          # vacío si run_texture=False
          "color": {...},            # vacío si run_color=False
          "error": str | None,       # si el objeto falló en algún paso
        },
        ...
      ]
    }
    """
    # ── 1. Detección ───────────────────────────────────────────────────────
    try:
        det_result = await detection.detect(
            image_bytes=image_bytes,
            threshold=0.5,
            min_area=100,
            max_objects=50,
        )
    except Exception as exc:
        return {"status": "error", "message": str(exc), "objects": [], "count": 0}

    detected_objects = det_result.get("objects", [])
    if not detected_objects:
        return {
            "status": "no_objects",
            "message": "No se detectaron objetos en la imagen",
            "objects": [],
            "count": 0,
            "scale_px_mm": scale_px_mm,
        }

    # ── 2‑5. Por objeto: contorno → métricas → [textura] → [color] ─────────
    objects_out = []
    for obj in detected_objects:
        result: dict = {
            "id":      obj.get("id"),
            "bbox":    obj.get("bbox"),
            "area_px": obj.get("area_px"),
            "contour": None,
            "metricas": {},
            "textura": {},
            "color": {},
            "error": None,
        }

        # 2. Contorno
        bbox = obj.get("bbox") or {}
        try:
            ctour = await contour.extract(
                image_bytes=image_bytes,
                bbox=(
                    int(bbox.get("x", 0)),
                    int(bbox.get("y", 0)),
                    int(bbox.get("w", bbox.get("width", 0))),
                    int(bbox.get("h", bbox.get("height", 0))),
                ),
                subpixel=True,
                simplify_tolerance=2.0,
            )
        except Exception as exc:
            result["error"] = f"contour: {exc}"
            objects_out.append(result)
            continue

        contour_pts = ctour.get("points") or []
        result["contour"] = contour_pts

        # 3. Métricas (requiere al menos 3 puntos de contorno)
        if len(contour_pts) >= 3:
            try:
                mets = await metrics.calculate(
                    image_bytes=image_bytes,
                    contour_points=contour_pts,
                    scale_px_mm=scale_px_mm,
                )
                result["metricas"] = mets.get("metricas", {})
            except Exception as exc:
                result["error"] = f"metrics: {exc}"

        # 4. Textura GLCM (opcional)
        if run_texture:
            try:
                tex = await metrics.texture(image_bytes=image_bytes)
                result["textura"] = tex
            except Exception as exc:
                result["textura"] = {"error": str(exc)}

        # 5. Color (opcional)
        if run_color:
            try:
                col = await detection.color(image_bytes=image_bytes)
                result["color"] = col
            except Exception as exc:
                result["color"] = {"error": str(exc)}

        objects_out.append(result)

    return {
        "status": "ok",
        "count": len(objects_out),
        "scale_px_mm": scale_px_mm,
        "objects": objects_out,
    }
