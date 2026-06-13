"""
Tests — Confianza de detección por objeto en el pipeline MAO_IA
================================================================
Verifica que detect_with_mao_ia() propaga `detection_confidence` (score ∈ [0,1])
y `confidence_level` ('alta'|'media'|'baja') por cada objeto, igual que detect().

El nivel alimenta el chip LAAR del modal de detección IA (ADR-007 §D2):
alta→ok · media→none · baja→wa.

Ejecutar:
    cd "MAO PLUS_PY_01"
    .venv/bin/python -m pytest python/tests/test_mao_ia_confidence.py -v
"""

import asyncio
import numpy as np
import cv2
import pytest


# ── Helpers ──────────────────────────────────────────────────────────────────

def _png_bytes(img_bgr: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", img_bgr)
    assert ok
    return buf.tobytes()


def _alto_contraste(w: int = 320, h: int = 320) -> np.ndarray:
    """Objeto negro sólido sobre fondo blanco → confianza alta esperada."""
    img = np.full((h, w, 3), 245, dtype=np.uint8)
    cv2.ellipse(img, (w // 2, h // 2), (int(w * 0.30), int(h * 0.26)),
                0, 0, 360, (20, 20, 20), -1)
    return img


def _bajo_contraste(w: int = 320, h: int = 320, delta: int = 10) -> np.ndarray:
    """Objeto apenas distinto del fondo → confianza baja esperada."""
    bg = 150
    obj = bg - delta
    img = np.full((h, w, 3), bg, dtype=np.uint8)
    cv2.ellipse(img, (w // 2, h // 2), (int(w * 0.30), int(h * 0.26)),
                0, 0, 360, (obj, obj, obj), -1)
    return img


class TestMaoIaConfianza:
    def _run(self, coro):
        # Loop propio por llamada: aísla del estado global de asyncio. Otros
        # archivos de la suite usan asyncio.run(), que al salir hace
        # set_event_loop(None) y deja get_event_loop() rompiendo en Py3.9.
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(coro)
        finally:
            loop.close()

    def test_campos_presentes_y_en_rango(self):
        """Cada objeto debe traer detection_confidence ∈ [0,1] y un nivel válido."""
        from python.modules.mao_ia_analyzer import detect_with_mao_ia
        img = _alto_contraste()
        result = self._run(detect_with_mao_ia(
            _png_bytes(img), threshold_method="otsu", min_area=500))

        assert result["status"] == "ok"
        assert result["count"] >= 1, "No detectó ningún objeto"
        for obj in result["objects"]:
            assert "detection_confidence" in obj
            assert "confidence_level" in obj
            score = obj["detection_confidence"]
            assert score is not None, "score nulo en alto contraste"
            assert 0.0 <= score <= 1.0, f"score fuera de rango: {score}"
            assert obj["confidence_level"] in ("alta", "media", "baja")

    def test_alto_contraste_confianza_alta(self):
        """Objeto sólido sobre fondo blanco → nivel 'alta'."""
        from python.modules.mao_ia_analyzer import detect_with_mao_ia
        img = _alto_contraste()
        result = self._run(detect_with_mao_ia(
            _png_bytes(img), threshold_method="otsu", min_area=500))
        obj = max(result["objects"], key=lambda o: o.get("area", 0))
        assert obj["confidence_level"] == "alta", (
            f"esperaba alta, score={obj['detection_confidence']}")

    def test_score_alto_supera_a_bajo(self):
        """El contraste alto debe puntuar por encima del contraste muy bajo."""
        from python.modules.mao_ia_analyzer import detect_with_mao_ia
        hi = self._run(detect_with_mao_ia(
            _png_bytes(_alto_contraste()), threshold_method="otsu", min_area=500))
        lo = self._run(detect_with_mao_ia(
            _png_bytes(_bajo_contraste(delta=10)),
            threshold_method="adaptive", min_area=500))
        hi_obj = max(hi["objects"], key=lambda o: o.get("area", 0))
        # En bajo contraste puede no detectar nada; si detecta, su score < alto.
        if lo["count"] >= 1:
            lo_obj = max(lo["objects"], key=lambda o: o.get("area", 0))
            assert hi_obj["detection_confidence"] >= lo_obj["detection_confidence"]
