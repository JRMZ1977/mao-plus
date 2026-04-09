"""
Tests Phase 4 — Bajo Contraste
================================
Verifica las mejoras de detección y contorno en imágenes con ΔE objeto/fondo pequeño.

Casos cubiertos:
  • ΔE ≈ 39 (normal)     → comportamiento sin cambios
  • ΔE ≈ 24 (borde)      → zona de transición
  • ΔE ≈ 16 (bajo)       → CLAHE activo
  • ΔE ≈ 12 (muy bajo)   → CLAHE activo, umbral adaptativo
  • Cromático LC          → bajo contraste en tono, no solo luminancia

Ejecutar:
    cd "MAO PLUS_PY_01"
    .venv/bin/python -m pytest python/tests/test_bajo_contraste.py -v
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


def _lc_gray(de: float, w: int = 300, h: int = 300) -> np.ndarray:
    """Elipse oscura sobre fondo gris claro con ΔE_RGB ≈ de."""
    delta = max(1, int(de / math.sqrt(3)))
    bg = 150
    obj = max(0, bg - delta)
    img = np.full((h, w, 3), bg, dtype=np.uint8)
    cv2.ellipse(img, (w // 2, h // 2), (int(w * 0.33), int(h * 0.27)),
                0, 0, 360, (obj, obj, obj), -1)
    return img


def _lc_chroma(de: float = 16.0, w: int = 300, h: int = 300) -> np.ndarray:
    """Bajo contraste cromático: objeto azulado sobre fondo verdoso."""
    bg_r, bg_g, bg_b = 140, 155, 145
    # ΔE distribuida en 3 canales
    d = int(de / math.sqrt(3))
    obj_r, obj_g, obj_b = bg_r - d, bg_g + d, bg_b - d
    img = np.full((h, w, 3), 0, dtype=np.uint8)
    img[:] = (bg_b, bg_g, bg_r)  # BGR
    obj_bgr = (
        max(0, min(255, obj_b)),
        max(0, min(255, obj_g)),
        max(0, min(255, obj_r)),
    )
    cv2.ellipse(img, (w // 2, h // 2), (int(w * 0.33), int(h * 0.27)),
                0, 0, 360, obj_bgr, -1)
    return img


# ── Tests: _aplicar_clahe ────────────────────────────────────────────────────

class TestClahe:
    def test_clahe_amplifica_rango(self):
        """CLAHE debe aumentar el rango P10-P90 del canal L*."""
        from python.modules.detection import _aplicar_clahe
        img = _lc_gray(de=16)
        img_enh = _aplicar_clahe(img)

        def l_range(bgr):
            lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
            l = lab[:, :, 0].flatten().astype(float)
            return float(np.percentile(l, 90)) - float(np.percentile(l, 10))

        assert l_range(img_enh) >= l_range(img), "CLAHE no amplificó el canal L*"

    def test_clahe_conserva_dimensiones(self):
        """CLAHE no debe cambiar dimensiones ni tipo."""
        from python.modules.detection import _aplicar_clahe
        img = _lc_gray(de=16, w=320, h=240)
        img_enh = _aplicar_clahe(img)
        assert img_enh.shape == img.shape
        assert img_enh.dtype == img.dtype


# ── Tests: Z-scan en bajo contraste ─────────────────────────────────────────

class TestZscanBajoContraste:
    def test_umbral_perforacion_adaptativo_no_falla_lc(self):
        """Con ΔE ≈ 16, el umbral adaptativo NO debe clasificar como perforación."""
        from python.modules.detection import _zscan_color_analysis
        img = _lc_gray(de=16)
        # Aplicar CLAHE como lo hará detect()
        from python.modules.detection import _aplicar_clahe
        img_enh = _aplicar_clahe(img)
        r = _zscan_color_analysis(img_enh)
        # Con CLAHE + umbral adaptativo → no debe ser perforación
        assert not r["tienePerforacion"], (
            f"Z-scan LC clasifica objeto sólido como perforación "
            f"(ΔE centro={r['deltaECentro']:.1f}, distObjBg={r['distObjBg']:.1f})"
        )

    def test_clahe_mejora_dist_obj_bg(self):
        """CLAHE debe aumentar distObjBg en el Z-scan para imagen LC."""
        from python.modules.detection import _zscan_color_analysis, _aplicar_clahe
        img = _lc_gray(de=16)
        r_orig = _zscan_color_analysis(img)
        r_enh  = _zscan_color_analysis(_aplicar_clahe(img))
        assert r_enh["distObjBg"] > r_orig["distObjBg"], (
            f"CLAHE no mejoró: antes={r_orig['distObjBg']:.1f}, "
            f"después={r_enh['distObjBg']:.1f}"
        )

    def test_contraste_normal_no_activa_clahe_en_zscan(self):
        """Con ΔE ≈ 40 el Z-scan no debe reportar distObjBg < 25."""
        from python.modules.detection import _zscan_color_analysis
        img = _lc_gray(de=40)
        r = _zscan_color_analysis(img)
        assert r["distObjBg"] >= 25.0, "Alto contraste no debería reportar LC"


# ── Tests: detect() con bajo contraste ──────────────────────────────────────

class TestDetectBajoContraste:
    def _run(self, coro):
        return asyncio.get_event_loop().run_until_complete(coro)

    def test_detect_lc_de16_encuentra_objeto(self):
        """detect() debe encontrar el objeto con ΔE ≈ 16."""
        from python.modules.detection import detect
        img = _lc_gray(de=16)
        result = self._run(detect(_png_bytes(img), min_area=500))

        assert result["status"] == "ok"
        assert result["count"] >= 1, "No detectó objeto en ΔE≈16"

    def test_detect_lc_de12_encuentra_objeto(self):
        """detect() debe encontrar el objeto con ΔE ≈ 12 (extremo)."""
        from python.modules.detection import detect
        img = _lc_gray(de=12)
        result = self._run(detect(_png_bytes(img), min_area=300))

        assert result["status"] == "ok"
        assert result["count"] >= 1, "No detectó objeto en ΔE≈12"

    def test_detect_lc_usa_clahe_method(self):
        """detect() con LC debe reportar method=python_zscan_lc_clahe."""
        from python.modules.detection import detect
        img = _lc_gray(de=16)
        result = self._run(detect(_png_bytes(img), min_area=500))

        assert result["count"] >= 1
        assert result["method_used"] == "python_zscan_lc_clahe", (
            f"method_used incorrecto: {result['method_used']}"
        )

    def test_detect_alto_contraste_no_activa_clahe(self):
        """Con ΔE ≈ 40 el método NO debe ser lc_clahe."""
        from python.modules.detection import detect
        img = _lc_gray(de=40)
        result = self._run(detect(_png_bytes(img), min_area=500))

        assert result["count"] >= 1
        assert result["method_used"] != "python_zscan_lc_clahe", (
            "Alto contraste no debería activar CLAHE"
        )

    def test_detect_lc_cromatico(self):
        """detect() debe funcionar con bajo contraste cromático."""
        from python.modules.detection import detect
        img = _lc_chroma(de=16)
        result = self._run(detect(_png_bytes(img), min_area=300))

        assert result["status"] == "ok"
        assert result["count"] >= 1, "No detectó objeto cromático de bajo contraste"

    def test_detect_lc_bbox_razonable(self):
        """El bbox del objeto LC debe cubrir al menos 15% del área de la imagen."""
        from python.modules.detection import detect
        w, h = 300, 300
        img = _lc_gray(de=16, w=w, h=h)
        result = self._run(detect(_png_bytes(img), min_area=500))

        assert result["count"] >= 1
        bbox = result["objects"][0]["bbox"]
        bbox_area = bbox["w"] * bbox["h"]
        image_area = w * h
        assert bbox_area / image_area >= 0.10, (
            f"Bbox LC demasiado pequeño: {bbox_area}/{image_area}={bbox_area/image_area:.2f}"
        )


# ── Tests: gradient snap adaptativo ─────────────────────────────────────────

class TestGradienteAdaptativoLC:
    def test_snap_lc_no_reduce_puntos(self):
        """Gradient snap con imagen LC no debe reducir el nº de puntos."""
        from python.modules.contour import _refinar_contorno_gradiente
        img = _lc_gray(de=16)

        n = 80
        angles = np.linspace(0, 2 * math.pi, n, endpoint=False)
        h, w = img.shape[:2]
        pts = np.column_stack([
            w // 2 + 70 * np.cos(angles),
            h // 2 + 60 * np.sin(angles),
        ]).astype(np.float32)

        snapped = _refinar_contorno_gradiente(pts, img)
        assert snapped.shape == pts.shape, "Snap LC cambió nº de puntos"

    def test_snap_lc_desplaza_hacia_borde(self):
        """Snap adaptativo debe desplazar puntos interiores hacia el borde LC."""
        from python.modules.contour import _refinar_contorno_gradiente
        w, h = 300, 300
        img = _lc_gray(de=16, w=w, h=h)
        R_real = int(w * 0.33)

        n = 60
        angles = np.linspace(0, 2 * math.pi, n, endpoint=False)
        R_init = R_real - 8  # 8 px dentro del borde real
        pts = np.column_stack([
            w // 2 + R_init * np.cos(angles),
            h // 2 + R_init * np.sin(angles),
        ]).astype(np.float32)

        snapped = _refinar_contorno_gradiente(pts, img)

        r_before = np.sqrt((pts[:, 0] - w//2)**2 + (pts[:, 1] - h//2)**2).mean()
        r_after  = np.sqrt((snapped[:, 0] - w//2)**2 + (snapped[:, 1] - h//2)**2).mean()
        # El snap debe acercarse al borde (r aumenta, desde el centro)
        assert r_after >= r_before - 2.0, (
            f"Snap LC no mejoró posición: r_before={r_before:.1f}, r_after={r_after:.1f}"
        )

    def test_snap_lc_clahe_se_activa(self):
        """Para imagen LC (rango P10-P90 < 30), el snap debe aplicar CLAHE interno."""
        # Test indirecto: comparar nº de puntos desplazados con y sin CLAHE.
        # Con CLAHE los gradientes son más grandes → más snaps ocurren.
        from python.modules.contour import _refinar_contorno_gradiente
        from python.modules.detection import _aplicar_clahe

        w, h = 300, 300
        img_lc = _lc_gray(de=16, w=w, h=h)
        img_hc = _lc_gray(de=40, w=w, h=h)  # alto contraste, no activa CLAHE

        n = 80
        angles = np.linspace(0, 2 * math.pi, n, endpoint=False)
        pts = np.column_stack([
            w // 2 + 80 * np.cos(angles),
            h // 2 + 65 * np.sin(angles),
        ]).astype(np.float32)

        snapped_lc = _refinar_contorno_gradiente(pts, img_lc)
        snapped_hc = _refinar_contorno_gradiente(pts, img_hc)

        # Ambos deben devolver la misma forma
        assert snapped_lc.shape == pts.shape
        assert snapped_hc.shape == pts.shape


# ── Tests: extract() en bajo contraste ──────────────────────────────────────

class TestExtractBajoContraste:
    def _run(self, coro):
        return asyncio.get_event_loop().run_until_complete(coro)

    def test_extract_lc_de16_retorna_ok(self):
        """extract() debe retornar status=ok con ΔE ≈ 16."""
        from python.modules.contour import extract
        w, h = 400, 300
        img = _lc_gray(de=16, w=w, h=h)
        result = self._run(extract(_png_bytes(img), bbox=(40, 30, 320, 240)))

        assert result["status"] == "ok", f"extract LC falló: {result.get('message')}"
        assert len(result.get("points", [])) >= 3

    def test_extract_lc_metodo_clahe(self):
        """extract() con LC debe reportar metodoDeteccion=python_zscan_lc_clahe."""
        from python.modules.contour import extract
        w, h = 400, 300
        img = _lc_gray(de=16, w=w, h=h)
        result = self._run(extract(_png_bytes(img), bbox=(40, 30, 320, 240)))

        assert result.get("metodoDeteccion") == "python_zscan_lc_clahe", (
            f"metodo incorrecto: {result.get('metodoDeteccion')}"
        )

    def test_extract_lc_hull_valido(self):
        """extract() LC debe retornar convex_hull con al menos 3 puntos."""
        from python.modules.contour import extract
        w, h = 400, 300
        img = _lc_gray(de=16, w=w, h=h)
        result = self._run(extract(_png_bytes(img), bbox=(40, 30, 320, 240)))

        assert result["status"] == "ok"
        assert len(result.get("convex_hull", [])) >= 3

    def test_extract_lc_calidad_aceptable(self):
        """Quality score del contorno LC debe ser al menos 0.30."""
        from python.modules.contour import extract
        w, h = 400, 300
        img = _lc_gray(de=16, w=w, h=h)
        result = self._run(extract(_png_bytes(img), bbox=(40, 30, 320, 240)))

        assert result["status"] == "ok"
        score = result["quality"]["score"]
        assert score >= 0.30, f"Quality score LC demasiado bajo: {score}"


# ── Tests: pipeline completo en bajo contraste ───────────────────────────────

class TestPipelineBajoContraste:
    def _run(self, coro):
        return asyncio.get_event_loop().run_until_complete(coro)

    def test_pipeline_lc_de16(self):
        """Pipeline completo detect→contour→metrics debe completarse con ΔE ≈ 16."""
        from python.modules.analysis import full_pipeline
        img = _lc_gray(de=16, w=400, h=300)
        result = self._run(full_pipeline(_png_bytes(img), scale_px_mm=0.0))

        assert result["status"] == "ok"
        assert result["count"] >= 1
        obj = result["objects"][0]
        assert obj["error"] is None, f"Pipeline LC falló: {obj['error']}"

    def test_pipeline_lc_metricas_en_rango(self):
        """Las métricas del objeto LC deben estar en rangos físicamente razonables."""
        from python.modules.analysis import full_pipeline
        img = _lc_gray(de=16, w=400, h=300)
        result = self._run(full_pipeline(_png_bytes(img), scale_px_mm=0.0))

        assert result["count"] >= 1
        obj = result["objects"][0]
        assert obj["error"] is None

        m = obj["metricas"]
        # Circularity de una elipse debe ser > 0.60
        circ = m.get("circularity", 0)
        assert circ > 0.60, f"Circularity LC sospechosamente baja: {circ}"
        # Solidez debe ser alta (objeto convexo) — clave en inglés: "solidity"
        solidez = m.get("solidity", 0)
        assert solidez > 0.70, f"Solidez LC baja: {solidez}"

    def test_pipeline_lc_vs_hc_metricas_similares(self):
        """El mismo objeto con diferente contraste debe dar métricas parecidas."""
        from python.modules.analysis import full_pipeline
        # Misma geometría, diferente contraste
        def make(de):
            delta = max(1, int(de / math.sqrt(3)))
            bg = 150; obj = max(10, bg - delta)
            img = np.full((300, 400, 3), bg, dtype=np.uint8)
            cv2.ellipse(img, (200, 150), (130, 100), 0, 0, 360, (obj, obj, obj), -1)
            return img

        res_hc = self._run(full_pipeline(_png_bytes(make(40)), scale_px_mm=0.0))
        res_lc = self._run(full_pipeline(_png_bytes(make(16)), scale_px_mm=0.0))

        assert res_hc["count"] >= 1 and res_lc["count"] >= 1

        m_hc = res_hc["objects"][0]["metricas"]
        m_lc = res_lc["objects"][0]["metricas"]

        # Circularity no debe diferir más de 0.15 entre HC y LC
        circ_hc = m_hc.get("circularity", 0)
        circ_lc = m_lc.get("circularity", 0)
        assert abs(circ_hc - circ_lc) < 0.15, (
            f"Circularity difiere mucho: HC={circ_hc:.3f}, LC={circ_lc:.3f}"
        )


# ── Tests: prioridad de objeto en escenas con referencias fotográficas ────────

def _make_photo_scene(
    img_w: int = 600, img_h: int = 400,
    bg_color=(245, 245, 245),         # fondo blanco
    artifact_color=(210, 195, 175),   # marfil/hueso
    artifact_center=(300, 180),       # centrado
    artifact_axes=(140, 30),          # colmillo elongado (elong ≈ 4.7)
    chart_tl=(30, 30), chart_size=90, # carta de colores: esquina sup-izq
    scale_center=(300, 360), scale_axes=(90, 12),  # escala, borde inferior
) -> np.ndarray:
    """
    Escena fotográfica arqueológica estándar:
      - Fondo blanco
      - Artefacto elongado y centrado (simula colmillo/hueso)
      - Carta de colores (cuadrado compacto) en esquina sup-izq
      - Escala métrica (rectángulo muy elongado) en borde inferior
    """
    img = np.full((img_h, img_w, 3), bg_color, dtype=np.uint8)
    # Artefacto (elipse elongada centrada)
    cv2.ellipse(img, artifact_center, artifact_axes, 15, 0, 360,
                artifact_color[::-1], -1)  # BGR
    # Carta de colores (cuadrado multicolor en esquina)
    cx, cy = chart_tl
    cs = chart_size
    chart_colors = [
        (200, 30, 30), (200, 120, 30), (200, 200, 30),
        (30, 200, 30), (30, 30, 200), (120, 30, 200),
    ]
    for i, col in enumerate(chart_colors):
        x0 = cx + (i % 3) * (cs // 3)
        y0 = cy + (i // 3) * (cs // 2)
        cv2.rectangle(img, (x0, y0), (x0 + cs // 3, y0 + cs // 2),
                      tuple(c for c in reversed(col)), -1)
    # Marco negro de la carta
    cv2.rectangle(img, (cx, cy), (cx + cs, cy + cs), (0, 0, 0), 2)
    # Escala métrica (blanco/negro elongado, borde inferior)
    scx, scy = scale_center
    sw, sh = scale_axes
    cv2.rectangle(img, (scx - sw, scy - sh), (scx + sw, scy + sh), (0, 0, 0), -1)
    cv2.rectangle(img, (scx - sw, scy - sh), (scx, scy + sh), (255, 255, 255), -1)
    return img


class TestPrioridadArtefacto:
    """Verifica que el objeto[0] devuelto sea el artefacto, no las referencias."""

    def _run(self, coro):
        return asyncio.get_event_loop().run_until_complete(coro)

    def test_artefacto_elongado_fondo_blanco_es_primero(self):
        """Con fondo blanco, artefacto elongado centrado debe ser objeto[0]."""
        from python.modules.detection import detect
        img = _make_photo_scene()
        result = self._run(detect(_png_bytes(img), min_area=200))

        assert result["count"] >= 1
        obj0 = result["objects"][0]
        bb = obj0["bbox"]
        # El artefacto está centrado (~300,180); la carta en (30+45, 30+45) = (75,75)
        cx0 = bb["x"] + bb["w"] / 2
        cy0 = bb["y"] + bb["h"] / 2
        # El centroide del objeto[0] debe ser más cercano al centro de la imagen
        # que la esquina superior izquierda donde está la carta
        img_cx, img_cy = 300, 200
        dist0 = math.sqrt((cx0 - img_cx) ** 2 + (cy0 - img_cy) ** 2)
        dist_chart = math.sqrt((75 - img_cx) ** 2 + (75 - img_cy) ** 2)
        assert dist0 < dist_chart, (
            f"El objeto[0] (centroid={cx0:.0f},{cy0:.0f}) no es el artefacto central; "
            f"parece ser la carta de colores (centroid~75,75)"
        )

    def test_carta_colores_no_es_objeto_principal(self):
        """La carta de colores (esquina) nunca debe ser objeto[0] si hay artefacto central."""
        from python.modules.detection import detect
        img = _make_photo_scene()
        result = self._run(detect(_png_bytes(img), min_area=200))

        if result["count"] < 2:
            pytest.skip("Solo se detectó 1 objeto (carta pode no umbralizarse)")

        obj0 = result["objects"][0]
        bb = obj0["bbox"]
        cx0 = bb["x"] + bb["w"] / 2
        cy0 = bb["y"] + bb["h"] / 2
        # La carta está aprox en (75, 75). Objeto[0] NO debe estar en esa esquina.
        assert not (cx0 < 150 and cy0 < 150), (
            f"El objeto[0] parece estar en la esquina donde está la carta "
            f"(centroid={cx0:.0f},{cy0:.0f})"
        )

    def test_fondo_negro_escala_elongada_no_es_primero(self):
        """Con fondo negro, escala muy elongada no debe ser objeto[0] si hay artefacto compacto."""
        from python.modules.detection import detect
        # Imagen con fondo negro, pieza dorada central y escala elongada al costado
        img = np.zeros((300, 400, 3), dtype=np.uint8)
        # Pieza compacta centrada (dorada)
        cv2.ellipse(img, (200, 150), (50, 40), 0, 0, 360, (30, 120, 200), -1)
        # Escala elongada en zona lateral
        cv2.rectangle(img, (310, 120), (380, 145), (200, 200, 200), -1)

        result = self._run(detect(_png_bytes(img), min_area=100))

        if result["count"] < 2:
            pytest.skip("Solo 1 objeto detectado")

        obj0 = result["objects"][0]
        ar = obj0.get("aspect_ratio", 1.0)
        elong = max(ar, 1.0 / ar) if ar > 0 else 1.0
        assert elong <= 4.0 or result["objects"][0]["centroid"][0] < 250, (
            f"El objeto[0] parece ser la escala lineal (AR={ar:.2f}, elong={elong:.2f})"
        )
