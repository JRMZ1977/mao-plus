"""
ADR-013 F2 — Tests gate de replicabilidad del contorno.

Tres invariantes verificados:
  (a) Determinismo   — mismo input → contorno byte-idéntico entre corridas.
  (b) Invariancia ROI — mismo objeto con encuadres ±margen → área ≤ 2%.
  (c) No-regresión   — _build_binary_mask con white_thresh_override preserva
                       comportamiento para las estrategias Z-scan y Otsu-fallback.

Los fixtures se generan sintéticamente (sin fichero externo) para que el test
sea reproducible en CI sin depender del corpus real.
"""

import asyncio
import math
import hashlib
import numpy as np
import cv2
import pytest

# ── helpers ──────────────────────────────────────────────────────────────────

def _new_loop():
    loop = asyncio.new_event_loop()
    try:
        return loop
    except Exception:
        loop.close()
        raise

def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _img_to_bytes(img_bgr: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", img_bgr)
    assert ok
    return buf.tobytes()


def _make_image_dark_on_white(
    W: int = 400, H: int = 300,
    obj_cx: int = 200, obj_cy: int = 150,
    obj_rx: int = 80, obj_ry: int = 60,
    obj_gray: int = 60,
) -> np.ndarray:
    """Imagen sintética: elipse oscura sobre fondo blanco."""
    img = np.full((H, W, 3), 250, dtype=np.uint8)
    cv2.ellipse(img, (obj_cx, obj_cy), (obj_rx, obj_ry), 0, 0, 360, (obj_gray, obj_gray, obj_gray), -1)
    return img


def _make_image_bright_on_white(
    W: int = 400, H: int = 300,
    obj_cx: int = 200, obj_cy: int = 150,
    obj_rx: int = 80, obj_ry: int = 60,
    obj_gray: int = 180,
) -> np.ndarray:
    """Imagen sintética: elipse clara (pero <blanco) sobre fondo blanco."""
    img = np.full((H, W, 3), 250, dtype=np.uint8)
    cv2.ellipse(img, (obj_cx, obj_cy), (obj_rx, obj_ry), 0, 0, 360, (obj_gray, obj_gray, obj_gray), -1)
    return img


def _bbox_centered(img: np.ndarray, cx: int, cy: int, rx: int, ry: int, margin: int = 20):
    H, W = img.shape[:2]
    x = max(0, cx - rx - margin)
    y = max(0, cy - ry - margin)
    w = min(W - x, 2 * rx + 2 * margin)
    h = min(H - y, 2 * ry + 2 * margin)
    return (x, y, w, h)


def _contour_hash(result: dict) -> str:
    pts = result.get("points", [])
    raw = str([[round(p[0], 1), round(p[1], 1)] for p in pts])
    return hashlib.md5(raw.encode()).hexdigest()


def _area(result: dict) -> float:
    return result.get("metrics", {}).get("area_real", 0.0)


# ── imports del módulo bajo test ──────────────────────────────────────────────

from python.modules.contour import extract as contour_extract
from python.modules.detection import _build_binary_mask


# ══════════════════════════════════════════════════════════════════════════════
# Invariante (a) — Determinismo
# ══════════════════════════════════════════════════════════════════════════════

class TestDeterminismo:
    """Mismo input → contorno byte-idéntico en N corridas consecutivas."""

    def _run_n(self, img: np.ndarray, bbox: tuple, n: int = 5):
        img_bytes = _img_to_bytes(img)
        results = []
        for _ in range(n):
            r = _run(contour_extract(img_bytes, bbox, subpixel=True))
            results.append(r)
        return results

    def test_determinismo_oscuro_sobre_blanco(self):
        img = _make_image_dark_on_white()
        bbox = _bbox_centered(img, 200, 150, 80, 60, margin=30)
        results = self._run_n(img, bbox, n=5)
        assert all(r.get("is_valid") for r in results), "Algún resultado inválido"
        hashes = [_contour_hash(r) for r in results]
        assert len(set(hashes)) == 1, (
            f"Contorno no determinista: {len(set(hashes))} hashes distintos en 5 corridas"
        )

    def test_determinismo_claro_sobre_blanco(self):
        img = _make_image_bright_on_white()
        bbox = _bbox_centered(img, 200, 150, 80, 60, margin=30)
        results = self._run_n(img, bbox, n=5)
        hashes = [_contour_hash(r) for r in results]
        # Al menos los que son válidos deben ser idénticos entre sí
        valid = [(r, h) for r, h in zip(results, hashes) if r.get("is_valid")]
        if len(valid) >= 2:
            hs = [h for _, h in valid]
            assert len(set(hs)) == 1, (
                f"Contorno claro-sobre-blanco no determinista: {len(set(hs))} hashes distintos"
            )

    def test_determinismo_fondo_cromatico(self):
        """Fondo cromatico (no blanco) — también debe ser determinista."""
        img = np.full((300, 400, 3), (180, 200, 180), dtype=np.uint8)  # fondo verde pálido
        cv2.ellipse(img, (200, 150), (70, 50), 0, 0, 360, (50, 40, 30), -1)  # objeto oscuro
        bbox = _bbox_centered(img, 200, 150, 70, 50, margin=30)
        results = self._run_n(img, bbox, n=3)
        valid_hashes = [_contour_hash(r) for r in results if r.get("is_valid")]
        if len(valid_hashes) >= 2:
            assert len(set(valid_hashes)) == 1, "Contorno cromático no determinista"


# ══════════════════════════════════════════════════════════════════════════════
# Invariante (b) — Invariancia al ROI (tolerancia ≤ 2%)
# ══════════════════════════════════════════════════════════════════════════════

class TestInvarianciaROI:
    """Mismo objeto con encuadres distintos → variación de área ≤ 2%."""

    def _areas_por_margenes(self, img: np.ndarray, cx: int, cy: int, rx: int, ry: int, margenes):
        img_bytes = _img_to_bytes(img)
        areas = []
        for m in margenes:
            bbox = _bbox_centered(img, cx, cy, rx, ry, margin=m)
            r = _run(contour_extract(img_bytes, bbox, subpixel=True))
            if r.get("is_valid"):
                areas.append(_area(r))
        return areas

    def test_invariancia_roi_oscuro_blanco(self):
        img = _make_image_dark_on_white(obj_gray=60)
        margenes = [15, 25, 40, 60]
        areas = self._areas_por_margenes(img, 200, 150, 80, 60, margenes)
        assert len(areas) >= 3, "Menos de 3 encuadres válidos"
        variacion = (max(areas) - min(areas)) / max(areas)
        assert variacion <= 0.02, (
            f"Variación de área ROI {variacion*100:.1f}% > 2% "
            f"(áreas: {[round(a) for a in areas]})"
        )

    def test_invariancia_roi_oscuro_blanco_desplazado(self):
        """Encuadre desplazado lateralmente ±20px del centro."""
        img = _make_image_dark_on_white(obj_gray=60)
        img_bytes = _img_to_bytes(img)
        W, H = img.shape[1], img.shape[0]
        # 3 encuadres con mismo tamaño pero centrado distinto (±10px)
        areas = []
        for dx in (-10, 0, 10):
            bbox = _bbox_centered(img, 200 + dx, 150, 80, 60, margin=30)
            # ajustar para no salir de imagen
            x, y, bw, bh = bbox
            x = max(0, min(x, W - bw))
            r = _run(contour_extract(img_bytes, (x, y, bw, bh), subpixel=True))
            if r.get("is_valid"):
                areas.append(_area(r))
        if len(areas) >= 2:
            variacion = (max(areas) - min(areas)) / max(areas)
            assert variacion <= 0.02, (
                f"Variación con desplazamiento lateral: {variacion*100:.1f}% > 2%"
            )


# ══════════════════════════════════════════════════════════════════════════════
# Invariante (c) — No-regresión de _build_binary_mask con white_thresh_override
# ══════════════════════════════════════════════════════════════════════════════

class TestBuildBinaryMaskOverride:
    """white_thresh_override solo afecta la estrategia fondo-blanco; Z-scan y Otsu-fallback no cambian."""

    def _fondo_blanco(self):
        return {"es_fondo_blanco": True, "brillo_min": 240, "es_fondo_cromatico": False,
                "r": 240, "g": 240, "b": 240}

    def _fondo_cromatico(self):
        return {"es_fondo_blanco": False, "brillo_min": 100, "es_fondo_cromatico": True,
                "r": 180, "g": 200, "b": 180}

    def _img_dark_on_white(self) -> np.ndarray:
        img = np.full((100, 100, 3), 250, dtype=np.uint8)
        cv2.circle(img, (50, 50), 30, (50, 50, 50), -1)
        return img

    def test_override_produce_mask_razonable(self):
        img = self._img_dark_on_white()
        fondo = self._fondo_blanco()
        mask_std = _build_binary_mask(img, fondo)
        mask_ovr = _build_binary_mask(img, fondo, white_thresh_override=180.0)
        # Ambas deben tener objeto (no vacías)
        assert mask_std.sum() > 0
        assert mask_ovr.sum() > 0

    def test_override_no_afecta_zscan(self):
        """Con fondo cromático (zscan activo), white_thresh_override se ignora."""
        img = np.full((100, 100, 3), (180, 200, 180), dtype=np.uint8)
        cv2.circle(img, (50, 50), 30, (50, 40, 30), -1)
        fondo = self._fondo_cromatico()
        zscan = {
            "colorObjeto": {"r": 50, "g": 40, "b": 30},
            "colorFondo":  {"r": 180, "g": 200, "b": 180},
            "distObjBg": 200.0,
            "esCromatico": True,
        }
        mask_sin = _build_binary_mask(img, fondo, zscan)
        mask_con = _build_binary_mask(img, fondo, zscan, white_thresh_override=150.0)
        # Con zscan, override no debe cambiar el resultado
        np.testing.assert_array_equal(mask_sin, mask_con,
            err_msg="white_thresh_override alteró el resultado cuando zscan está activo")

    def test_override_none_preserva_comportamiento_original(self):
        img = self._img_dark_on_white()
        fondo = self._fondo_blanco()
        mask_none = _build_binary_mask(img, fondo, white_thresh_override=None)
        mask_std  = _build_binary_mask(img, fondo)
        np.testing.assert_array_equal(mask_none, mask_std)

    def test_override_mayor_umbral_objeto_mas_pequeno_o_igual(self):
        """Un umbral más bajo (más conservador) produce objeto ≤ umbral alto."""
        img = self._img_dark_on_white()
        fondo = self._fondo_blanco()
        # thresh=220 (original): clasifica como fondo todo >220 → objeto grande
        # thresh=150 (bajo): clasifica como fondo todo >150 → objeto más pequeño
        mask_220 = _build_binary_mask(img, fondo, white_thresh_override=220.0)
        mask_150 = _build_binary_mask(img, fondo, white_thresh_override=150.0)
        # Con umbral más bajo, se excluye más área de penumbra → objeto más pequeño o igual
        assert mask_150.sum() <= mask_220.sum(), (
            "Umbral más bajo debería producir objeto más pequeño o igual"
        )


# ══════════════════════════════════════════════════════════════════════════════
# Invariante adicional — Fallback determinista (sin GrabCut)
# ══════════════════════════════════════════════════════════════════════════════

class TestFallbackDeterminista:
    """El fallback determinista (inversión / Otsu-gris) no introduce no-determinismo."""

    def test_mascara_invertida_es_determinista(self):
        """Imagen que provoca cobertura >92% → inversión → debe ser determinista."""
        # Objeto muy grande (fondo pequeño) → cobertura alta → se invierte la máscara.
        # Usamos un objeto que cubre casi todo el ROI.
        img = np.full((200, 200, 3), 60, dtype=np.uint8)    # casi todo oscuro
        cv2.rectangle(img, (0, 0), (199, 199), (250, 250, 250), 15)  # marco blanco = fondo
        img_bytes = _img_to_bytes(img)
        bbox = (5, 5, 190, 190)
        results = [_run(contour_extract(img_bytes, bbox)) for _ in range(4)]
        valid = [r for r in results if r.get("is_valid")]
        if len(valid) >= 2:
            hashes = [_contour_hash(r) for r in valid]
            assert len(set(hashes)) == 1, "Fallback de inversión no es determinista"

    def test_mascara_vacia_fallback_otsu_determinista(self):
        """Imagen donde el umbral blanco no detecta nada → Otsu-gris → determinista."""
        # Objeto muy claro sobre fondo blanco → blancos_absolutos clasifica todo como fondo.
        # Usamos obj_gray=215: dentro del rango >220 → objeto casi invisible con thresh 220.
        img = _make_image_bright_on_white(obj_gray=215)
        img_bytes = _img_to_bytes(img)
        bbox = _bbox_centered(img, 200, 150, 80, 60, margin=20)
        results = [_run(contour_extract(img_bytes, bbox)) for _ in range(4)]
        valid_hashes = [_contour_hash(r) for r in results if r.get("is_valid")]
        if len(valid_hashes) >= 2:
            assert len(set(valid_hashes)) == 1, "Fallback Otsu-gris no es determinista"
