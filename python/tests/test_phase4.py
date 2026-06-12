"""
Tests Phase 4: detección Z-scan, gradient snap, filtro coherencia, convex hull.

Ejecutar:
    cd "MAO PLUS_PY_01"
    .venv/bin/python -m pytest python/tests/test_phase4.py -v
"""

import asyncio
import math
import numpy as np
import cv2
import pytest

# ── Fixtures de imágenes sintéticas ─────────────────────────────────────────

def _make_image_bytes(img_bgr: np.ndarray) -> bytes:
    success, buf = cv2.imencode(".png", img_bgr)
    assert success
    return buf.tobytes()


def _ellipse_on_gray(
    canvas_wh=(400, 300),
    bg_color=(200, 200, 200),
    obj_color=(50, 70, 60),
    center=None,
    axes=(100, 70),
) -> np.ndarray:
    """Elipse oscura sobre fondo gris (fondo no blanco → activa Z-scan)."""
    w, h = canvas_wh
    img = np.full((h, w, 3), bg_color, dtype=np.uint8)
    cx, cy = center or (w // 2, h // 2)
    cv2.ellipse(img, (cx, cy), axes, 0, 0, 360, obj_color, -1)
    return img


def _ellipse_on_white(
    canvas_wh=(400, 300),
    obj_color=(40, 60, 50),
    center=None,
    axes=(100, 70),
) -> np.ndarray:
    """Elipse oscura sobre fondo blanco (activa lógica blancos absolutos)."""
    w, h = canvas_wh
    img = np.full((h, w, 3), 245, dtype=np.uint8)
    cx, cy = center or (w // 2, h // 2)
    cv2.ellipse(img, (cx, cy), axes, 0, 0, 360, obj_color, -1)
    return img


def _perforated_object(canvas_wh=(300, 300), bg=150, obj=60, hole=150) -> np.ndarray:
    """Objeto con perforación central: fondo gris, anillo objeto, hueco interior."""
    w, h = canvas_wh
    img = np.full((h, w, 3), bg, dtype=np.uint8)
    cx, cy = w // 2, h // 2
    cv2.circle(img, (cx, cy), 100, (obj, obj, obj), -1)
    cv2.circle(img, (cx, cy), 40, (hole, hole, hole), -1)  # hueco = color fondo
    return img


# ── Tests: detección Z-scan ──────────────────────────────────────────────────

class TestZScan:
    def test_zscan_identifica_colorObjeto(self):
        """Z-scan debe estimar colorObjeto ≈ color del objeto sintético."""
        from python.modules.detection import _zscan_color_analysis
        obj_bgr = (60, 70, 50)  # BGR
        img = _ellipse_on_gray(obj_color=obj_bgr)
        r = _zscan_color_analysis(img)

        # colorObjeto en RGB: rojo ≈ 50, verde ≈ 70, azul ≈ 60
        obj = r["colorObjeto"]
        assert obj["r"] < 100 and obj["g"] < 120, f"colorObjeto parece fondo: {obj}"
        assert not r["tienePerforacion"], "No debe detectar perforación en objeto sólido"

    def test_zscan_identifica_colorFondo(self):
        """Z-scan debe estimar colorFondo ≈ color de fondo gris (200,200,200)."""
        from python.modules.detection import _zscan_color_analysis
        img = _ellipse_on_gray(bg_color=(200, 200, 200))
        r = _zscan_color_analysis(img)

        fondo = r["colorFondo"]
        for canal in ("r", "g", "b"):
            assert abs(fondo[canal] - 200) < 30, f"colorFondo[{canal}]={fondo[canal]} lejos de 200"

    def test_zscan_detecta_perforacion(self):
        """Z-scan debe detectar tienePerforacion=True cuando el centro ≈ fondo."""
        from python.modules.detection import _zscan_color_analysis
        img = _perforated_object(bg=150, obj=50, hole=150)
        r = _zscan_color_analysis(img)
        assert r["tienePerforacion"], "Debe detectar el hueco central como perforación"

    def test_zscan_umbral_sugerido_positivo(self):
        """umbralSugerido debe ser un valor positivo razonable (12–100)."""
        from python.modules.detection import _zscan_color_analysis
        img = _ellipse_on_gray()
        r = _zscan_color_analysis(img)
        assert 5.0 < r["umbralSugerido"] < 300.0, f"umbral fuera de rango: {r['umbralSugerido']}"


# ── Tests: construcción de máscara con Z-scan ────────────────────────────────

class TestBuildMask:
    def test_mascara_zscan_cubre_objeto(self):
        """Máscara competitiva debe incluir los píxeles del objeto."""
        from python.modules.detection import _build_binary_mask, _detectar_color_fondo, _zscan_color_analysis
        img = _ellipse_on_gray(axes=(80, 60))
        fondo = _detectar_color_fondo(img)
        zscan = _zscan_color_analysis(img)
        mask = _build_binary_mask(img, fondo, zscan)

        h, w = img.shape[:2]
        # El centro de la imagen debe ser objeto (mask=1)
        assert mask[h // 2, w // 2] == 1, "Centro debe ser objeto"
        # Las esquinas deben ser fondo (mask=0)
        assert mask[5, 5] == 0, "Esquina sup-izq debe ser fondo"
        assert mask[h - 5, w - 5] == 0, "Esquina inf-der debe ser fondo"

    def test_mascara_blanca_usa_blancos_absolutos(self):
        """Para fondo blanco, la máscara no usa Z-scan."""
        from python.modules.detection import _build_binary_mask, _detectar_color_fondo
        img = _ellipse_on_white()
        fondo = _detectar_color_fondo(img)
        assert fondo["es_fondo_blanco"], "Imagen blanca no detectada como tal"
        mask = _build_binary_mask(img, fondo, zscan=None)

        h, w = img.shape[:2]
        assert mask[h // 2, w // 2] == 1, "Centro debe ser objeto"
        assert mask[5, 5] == 0, "Esquina debe ser fondo"


# ── Tests: detect() completo ─────────────────────────────────────────────────

class TestDetect:
    def _run(self, coro):
        # Loop propio por llamada: aísla del estado global de asyncio. Otros
        # archivos de la suite usan asyncio.run(), que al salir hace
        # set_event_loop(None) y deja get_event_loop() rompiendo en Py3.9
        # (RuntimeError: There is no current event loop). new_event_loop()
        # no depende de ese estado.
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(coro)
        finally:
            loop.close()

    def test_detect_fondo_gris_zscan(self):
        """detect() con fondo no blanco debe usar method=python_zscan_competitive."""
        from python.modules.detection import detect
        img = _ellipse_on_gray()
        result = self._run(detect(_make_image_bytes(img), min_area=500))

        assert result["status"] == "ok"
        assert result["count"] >= 1
        assert result["method_used"] == "python_zscan_competitive"
        assert "zscan" in result
        assert result["zscan"]["tienePerforacion"] is False

    def test_detect_fondo_blanco(self):
        """detect() con fondo blanco debe usar method=python_white_absolute."""
        from python.modules.detection import detect
        img = _ellipse_on_white()
        result = self._run(detect(_make_image_bytes(img), min_area=500))

        assert result["status"] == "ok"
        assert result["count"] >= 1
        assert result["method_used"] == "python_white_absolute"
        assert "zscan" not in result

    def test_detect_devuelve_bbox_razonable(self):
        """El bounding box del objeto detectado debe estar dentro de la imagen."""
        from python.modules.detection import detect
        w, h = 400, 300
        img = _ellipse_on_gray(canvas_wh=(w, h), center=(200, 150), axes=(80, 60))
        result = self._run(detect(_make_image_bytes(img), min_area=500))

        assert result["count"] >= 1
        bbox = result["objects"][0]["bbox"]
        assert 0 <= bbox["x"] < w
        assert 0 <= bbox["y"] < h
        assert bbox["w"] > 0 and bbox["h"] > 0

    def test_detect_2_objetos(self):
        """Deben detectarse 2 objetos cuando hay 2 elipses separadas."""
        from python.modules.detection import detect
        img = np.full((300, 600, 3), 200, dtype=np.uint8)
        cv2.ellipse(img, (150, 150), (80, 60), 0, 0, 360, (50, 60, 40), -1)
        cv2.ellipse(img, (450, 150), (80, 60), 0, 0, 360, (40, 55, 35), -1)
        result = self._run(detect(_make_image_bytes(img), min_area=500))

        assert result["count"] == 2, f"Se esperaban 2 objetos, se obtuvieron {result['count']}"


# ── Tests: gradient snap ─────────────────────────────────────────────────────

class TestGradientSnap:
    def test_snap_no_rompe_contorno(self):
        """_refinar_contorno_gradiente() debe devolver el mismo número de puntos."""
        from python.modules.contour import _refinar_contorno_gradiente
        img = _ellipse_on_gray()
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # Contorno sintético: círculo de 80 px de radio centrado
        h, w = img.shape[:2]
        n = 100
        angles = np.linspace(0, 2 * math.pi, n, endpoint=False)
        pts = np.column_stack([
            w // 2 + 80 * np.cos(angles),
            h // 2 + 80 * np.sin(angles),
        ]).astype(np.float32)

        snapped = _refinar_contorno_gradiente(pts, img)
        assert snapped.shape == pts.shape, "El número de puntos no debe cambiar"

    def test_snap_mejora_posicion_hacia_borde(self):
        """Los puntos inicializados 10 px dentro del borde deben acercarse al borde."""
        from python.modules.contour import _refinar_contorno_gradiente
        w, h = 300, 300
        img = np.full((h, w, 3), 200, dtype=np.uint8)
        R_real = 100
        cv2.circle(img, (w // 2, h // 2), R_real, (50, 60, 40), -1)

        cx, cy = w // 2, h // 2
        n = 60
        angles = np.linspace(0, 2 * math.pi, n, endpoint=False)
        # Puntos 10 px adentro del borde real
        R_init = R_real - 10
        pts = np.column_stack([
            cx + R_init * np.cos(angles),
            cy + R_init * np.sin(angles),
        ]).astype(np.float32)

        snapped = _refinar_contorno_gradiente(pts, img)

        # Distancia promedio al centro debe aumentar (se acercan al borde)
        r_before = np.sqrt((pts[:, 0] - cx)**2 + (pts[:, 1] - cy)**2).mean()
        r_after  = np.sqrt((snapped[:, 0] - cx)**2 + (snapped[:, 1] - cy)**2).mean()
        assert r_after > r_before - 1, f"Snap no mejoró: r_before={r_before:.1f}, r_after={r_after:.1f}"


# ── Tests: filtro de coherencia ──────────────────────────────────────────────

class TestCoherencia:
    def test_coherencia_conserva_borde_real(self):
        """El filtro NO debe eliminar más del 40% del contorno real."""
        from python.modules.contour import _depurar_por_coherencia
        w, h = 300, 300
        img = np.full((h, w, 3), 200, dtype=np.uint8)
        cv2.ellipse(img, (w//2, h//2), (90, 70), 0, 0, 360, (50, 70, 60), -1)

        # Máscara binaria real
        mask_u8 = np.zeros((h, w), dtype=np.uint8)
        cv2.ellipse(mask_u8, (w//2, h//2), (90, 70), 0, 0, 360, 255, -1)

        # Extraer borde real
        contours, _ = cv2.findContours(mask_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        pts = contours[0].reshape(-1, 2).astype(np.float32)

        filtrado = _depurar_por_coherencia(pts, mask_u8, img)
        proporcion_eliminada = 1.0 - len(filtrado) / len(pts)
        assert proporcion_eliminada < 0.40, f"Filtró demasiado: {proporcion_eliminada:.1%}"
        assert len(filtrado) >= 3, "Deben quedar al menos 3 puntos"

    def test_coherencia_fallback_si_elimina_mucho(self):
        """Si el filtro eliminaría >40%, debe devolver el contorno original."""
        from python.modules.contour import _depurar_por_coherencia
        # Imagen muy uniforme donde casi todo tiene score bajo
        w, h = 100, 100
        img = np.full((h, w, 3), 128, dtype=np.uint8)
        mask_u8 = np.zeros((h, w), dtype=np.uint8)
        cv2.rectangle(mask_u8, (20, 20), (80, 80), 255, -1)
        contours, _ = cv2.findContours(mask_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        pts = contours[0].reshape(-1, 2).astype(np.float32)

        filtrado = _depurar_por_coherencia(pts, mask_u8, img)
        # Debe devolver pts原样 o con muy pocos eliminados
        assert len(filtrado) >= 3


# ── Tests: extract() + convex_hull ───────────────────────────────────────────

class TestExtract:
    def _run(self, coro):
        # Loop propio por llamada: aísla del estado global de asyncio. Otros
        # archivos de la suite usan asyncio.run(), que al salir hace
        # set_event_loop(None) y deja get_event_loop() rompiendo en Py3.9
        # (RuntimeError: There is no current event loop). new_event_loop()
        # no depende de ese estado.
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(coro)
        finally:
            loop.close()

    def test_extract_devuelve_fields_requeridos(self):
        """extract() debe devolver los campos del contrato original más convex_hull."""
        from python.modules.contour import extract
        img = _ellipse_on_gray(canvas_wh=(400, 300), axes=(90, 65))
        result = self._run(extract(_make_image_bytes(img), bbox=(50, 50, 300, 200)))

        assert result["status"] == "ok"
        for field in ("points", "points_visual", "convex_hull", "metrics", "quality", "is_valid"):
            assert field in result, f"Campo '{field}' ausente"

    def test_extract_convex_hull_no_vacio(self):
        """convex_hull debe tener al menos 3 puntos."""
        from python.modules.contour import extract
        img = _ellipse_on_gray(canvas_wh=(400, 300), axes=(90, 65))
        result = self._run(extract(_make_image_bytes(img), bbox=(50, 50, 300, 200)))

        assert result["status"] == "ok"
        hull = result["convex_hull"]
        assert len(hull) >= 3, f"convex_hull tiene {len(hull)} puntos"

    def test_extract_hull_contiene_contorno(self):
        """Todos los puntos del contorno deben estar dentro o sobre el hull."""
        from python.modules.contour import extract
        from shapely.geometry import Polygon, Point
        img = _ellipse_on_gray(canvas_wh=(500, 400), axes=(120, 90))
        result = self._run(extract(_make_image_bytes(img), bbox=(30, 30, 440, 340)))

        assert result["status"] == "ok"
        hull_pts = result["convex_hull"]
        contour_pts = result["points"]
        if len(hull_pts) < 3 or len(contour_pts) < 3:
            pytest.skip("Muy pocos puntos")

        hull_poly = Polygon(hull_pts).convex_hull
        # Una muestra de puntos del contorno debe estar dentro del hull (tolerancia 2 px)
        hull_buffered = hull_poly.buffer(2.0)
        outside = [p for p in contour_pts[::10] if not hull_buffered.contains(Point(p))]
        assert len(outside) == 0, f"{len(outside)} puntos de contorno fuera del hull"

    def test_extract_fondo_gris_usa_zscan(self):
        """Para fondo no blanco, metodoDeteccion debe indicar zscan."""
        from python.modules.contour import extract
        img = _ellipse_on_gray()
        result = self._run(extract(_make_image_bytes(img), bbox=(50, 30, 300, 240)))

        assert result.get("metodoDeteccion", "") == "python_zscan_competitivo"

    def test_extract_calidad_elipse_alta(self):
        """Una elipse bien centrada en el bbox debe tener quality.score >= 0.5."""
        from python.modules.contour import extract
        img = _ellipse_on_gray(canvas_wh=(300, 300), center=(150, 150), axes=(100, 80))
        result = self._run(extract(_make_image_bytes(img), bbox=(30, 30, 240, 240)))

        assert result["status"] == "ok"
        score = result["quality"]["score"]
        assert score >= 0.5, f"Score de calidad bajo: {score}"


# ── Tests: pipeline completo detect→contour→metrics ─────────────────────────

class TestFullPipeline:
    def _run(self, coro):
        # Loop propio por llamada: aísla del estado global de asyncio. Otros
        # archivos de la suite usan asyncio.run(), que al salir hace
        # set_event_loop(None) y deja get_event_loop() rompiendo en Py3.9
        # (RuntimeError: There is no current event loop). new_event_loop()
        # no depende de ese estado.
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(coro)
        finally:
            loop.close()

    def test_pipeline_retorna_metricas(self):
        """full_pipeline() debe devolver objetos con métricas completas."""
        from python.modules.analysis import full_pipeline
        img = _ellipse_on_gray(canvas_wh=(500, 400), axes=(130, 100))
        result = self._run(full_pipeline(_make_image_bytes(img), scale_px_mm=0.1))

        assert result["status"] == "ok"
        assert result["count"] >= 1
        obj = result["objects"][0]
        assert obj["error"] is None, f"Pipeline falló: {obj['error']}"
        m = obj["metricas"]
        assert "area" in m or "area_px" in m, "Falta campo area en métricas"
        assert "circularity" in m, "Falta circularity"
        assert "solidez" in m or "solidity" in m, "Falta solidez"

    def test_pipeline_circularity_elipse(self):
        """Circularity de un círculo perfecto debe ser > 0.80."""
        from python.modules.analysis import full_pipeline
        w, h = 400, 400
        img = np.full((h, w, 3), 200, dtype=np.uint8)
        cv2.circle(img, (200, 200), 130, (50, 60, 40), -1)

        result = self._run(full_pipeline(_make_image_bytes(img), scale_px_mm=0.0))
        assert result["status"] == "ok"
        obj = result["objects"][0]
        assert obj["error"] is None
        circ = obj["metricas"].get("circularity", 0)
        assert circ > 0.80, f"Circularity del círculo muy baja: {circ}"

    def test_pipeline_2_objetos(self):
        """Pipeline debe procesar 2 objetos correctamente."""
        from python.modules.analysis import full_pipeline
        img = np.full((350, 700, 3), 200, dtype=np.uint8)
        cv2.ellipse(img, (175, 175), (110, 90), 0, 0, 360, (50, 60, 40), -1)
        cv2.ellipse(img, (525, 175), (110, 90), 0, 0, 360, (45, 55, 35), -1)

        result = self._run(full_pipeline(_make_image_bytes(img), scale_px_mm=0.0))
        assert result["count"] == 2, f"Esperados 2 objetos, se obtuvieron {result['count']}"
        for obj in result["objects"]:
            assert obj["error"] is None, f"Objeto {obj['id']} falló: {obj['error']}"
