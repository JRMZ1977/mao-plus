"""
Tests ADR-009 — Detección seedless de huecos internos (candidatos P/H)
======================================================================
Verifica que `contour.extract` emite `ph_candidates` (huecos internos detectados
sin semillas) y que `detection.detect_holes` cumple el contrato:

  • objeto con N huecos conocidos → N candidatos, áreas y centroides aproximados
  • coordenadas ABSOLUTAS (ROI + offset del bbox), no relativas al ROI
  • objeto sólido sin huecos → 0 candidatos (sin falsos positivos)
  • cada candidato: tipo="candidato" (neutro), confianza ∈ [0,1] + nivel LAAR
  • los candidatos NO se convierten en perforaciones/horadaciones (solo sugieren)

Ejecutar:
    cd "MAO PLUS_PY_01"
    .venv/bin/python -m pytest python/tests/test_ph_candidates.py -v
"""

import asyncio
import math
import numpy as np
import cv2
import pytest


# ── Helpers ──────────────────────────────────────────────────────────────────

def _png_bytes(img_bgr: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", img_bgr)
    assert ok
    return buf.tobytes()


def _obj_con_huecos(holes, w=400, h=400, center=(200, 200), radius=120,
                    obj_val=45, bg_val=255):
    """
    Objeto oscuro circular sobre fondo blanco con `holes` huecos (círculos del
    color del fondo) punzados dentro. `holes` = [(cx, cy, r), ...] en coords
    absolutas de la imagen completa. Retorna (img_bgr, bbox).
    """
    img = np.full((h, w, 3), bg_val, dtype=np.uint8)
    cv2.circle(img, center, radius, (obj_val, obj_val, obj_val), -1)
    for (hx, hy, hr) in holes:
        cv2.circle(img, (hx, hy), hr, (bg_val, bg_val, bg_val), -1)
    bbox = (center[0] - radius, center[1] - radius, 2 * radius, 2 * radius)
    return img, bbox


def _run(coro):
    # Loop propio por llamada: aísla del estado global de asyncio (gotcha del
    # proyecto: asyncio.run en otros tests deja set_event_loop(None) y rompe
    # get_event_loop() en Py3.9). Ver CLAUDE.md.
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ── Tests: detect_holes (unidad) ─────────────────────────────────────────────

class TestDetectHoles:
    def test_dos_huecos_detectados(self):
        from python.modules.detection import detect_holes
        # ROI 240×240 (objeto que llena el ROI): círculo + 2 huecos en coords ROI
        mask = np.zeros((240, 240), np.uint8)
        cv2.circle(mask, (120, 120), 118, 255, -1)
        cv2.circle(mask, (120, 80), 18, 0, -1)    # hueco 1 (área ≈ 1018)
        cv2.circle(mask, (90, 150), 12, 0, -1)    # hueco 2 (área ≈ 452)
        cands = detect_holes(mask, offset_xy=(0, 0))
        assert len(cands) == 2, f"esperaba 2 huecos, obtuvo {len(cands)}"
        # ordenados por área desc → el primero es el grande
        assert cands[0]["area_px"] > cands[1]["area_px"]
        assert abs(cands[0]["area_px"] - math.pi * 18 ** 2) < math.pi * 18 ** 2 * 0.25

    def test_objeto_solido_sin_falsos_positivos(self):
        from python.modules.detection import detect_holes
        mask = np.zeros((240, 240), np.uint8)
        cv2.circle(mask, (120, 120), 118, 255, -1)
        cands = detect_holes(mask, offset_xy=(0, 0))
        assert cands == [], f"objeto sólido no debe producir candidatos: {cands}"

    def test_offset_coordenadas_absolutas(self):
        from python.modules.detection import detect_holes
        mask = np.zeros((240, 240), np.uint8)
        cv2.circle(mask, (120, 120), 118, 255, -1)
        cv2.circle(mask, (120, 120), 20, 0, -1)   # hueco centrado
        off = (80, 80)
        cands = detect_holes(mask, offset_xy=off)
        assert len(cands) == 1
        cx, cy = cands[0]["centroid"]
        # centro del hueco (120,120) + offset (80,80) = (200,200)
        assert abs(cx - 200) < 4 and abs(cy - 200) < 4, f"centroid no es absoluto: {(cx, cy)}"
        # todos los puntos también desplazados
        assert all(p[0] >= off[0] and p[1] >= off[1] for p in cands[0]["points"])

    def test_contrato_de_campos(self):
        from python.modules.detection import detect_holes
        mask = np.zeros((240, 240), np.uint8)
        cv2.circle(mask, (120, 120), 118, 255, -1)
        cv2.circle(mask, (120, 120), 22, 0, -1)
        roi = np.full((240, 240, 3), 45, np.uint8)   # objeto oscuro
        cv2.circle(roi, (120, 120), 22, (240, 240, 240), -1)  # hueco claro
        cands = detect_holes(mask, offset_xy=(0, 0), roi_bgr=roi)
        c = cands[0]
        assert c["tipo"] == "candidato"
        assert 0.0 <= c["detection_confidence"] <= 1.0
        assert c["confidence_level"] in ("alta", "media", "baja")
        for k in ("points", "area_px", "bbox", "centroid", "perimeter_px", "circularity"):
            assert k in c, f"falta campo {k}"
        assert {"x", "y", "w", "h"} <= set(c["bbox"].keys())

    def test_filtra_huecos_minusculos(self):
        from python.modules.detection import detect_holes
        mask = np.zeros((240, 240), np.uint8)
        cv2.circle(mask, (120, 120), 118, 255, -1)
        cv2.circle(mask, (120, 120), 2, 0, -1)    # hueco de ~12 px² < min_area
        cands = detect_holes(mask, offset_xy=(0, 0))
        assert cands == [], "huecos por debajo del área mínima deben descartarse"


# ── Tests: contour.extract end-to-end ────────────────────────────────────────

class TestContourExtractPHCandidates:
    def test_extract_emite_ph_candidates(self):
        from python.modules import contour
        img, bbox = _obj_con_huecos([(200, 160, 18), (170, 230, 12)])
        res = _run(contour.extract(_png_bytes(img), bbox))
        assert res["status"] == "ok"
        assert "ph_candidates" in res
        cands = res["ph_candidates"]
        assert len(cands) == 2, f"esperaba 2 candidatos, obtuvo {len(cands)}: {cands}"
        # coords absolutas: el hueco grande está cerca de (200,160)
        grande = max(cands, key=lambda c: c["area_px"])
        cx, cy = grande["centroid"]
        assert abs(cx - 200) < 8 and abs(cy - 160) < 8, f"centroid: {(cx, cy)}"

    def test_extract_objeto_solido_sin_candidatos(self):
        from python.modules import contour
        img, bbox = _obj_con_huecos([])
        res = _run(contour.extract(_png_bytes(img), bbox))
        assert res["status"] == "ok"
        assert res["ph_candidates"] == [], f"sólido no debe tener candidatos: {res['ph_candidates']}"

    def test_candidatos_no_son_perforaciones(self):
        """Contrato ADR-009: los candidatos son sugerencias, no P/H confirmados."""
        from python.modules import contour
        img, bbox = _obj_con_huecos([(200, 160, 20)])
        res = _run(contour.extract(_png_bytes(img), bbox))
        # extract no emite perforaciones/horadaciones: esos los puebla la confirmación
        assert "perforaciones" not in res and "horadaciones" not in res
        assert all(c["tipo"] == "candidato" for c in res["ph_candidates"])
