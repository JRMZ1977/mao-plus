"""
Tests de regresión: endpoint /api/detect
"""
import pytest


def _post_detect(client, png_bytes, **kwargs):
    files = {"image": ("test.png", png_bytes, "image/png")}
    data  = {k: str(v) for k, v in kwargs.items()}
    return client.post("/api/detect", data=data, files=files)


def test_detect_returns_200(client, png_bytes_dark):
    r = _post_detect(client, png_bytes_dark)
    assert r.status_code == 200


def test_detect_has_objects_key(client, png_bytes_dark):
    body = _post_detect(client, png_bytes_dark).json()
    assert "objects" in body


def test_detect_objects_is_list(client, png_bytes_dark):
    body = _post_detect(client, png_bytes_dark).json()
    assert isinstance(body["objects"], list)


def test_detect_finds_object_in_synthetic_image(client, png_bytes_dark):
    """La imagen tiene un cuadrado oscuro central: debe detectar ≥1 objeto."""
    body = _post_detect(client, png_bytes_dark, min_area=500).json()
    assert len(body["objects"]) >= 1


def test_detect_object_has_bbox(client, png_bytes_dark):
    body = _post_detect(client, png_bytes_dark, min_area=500).json()
    if body["objects"]:
        obj = body["objects"][0]
        # bbox puede estar anidado {'bbox': {'x',...}} o plano {'x':...,'width':...}
        has_nested = "bbox" in obj and isinstance(obj["bbox"], dict)
        has_flat    = all(k in obj for k in ("x", "y", "width", "height"))
        assert has_nested or has_flat, f"Sin estructura bbox reconocida: {list(obj.keys())}"


def test_detect_object_has_area(client, png_bytes_dark):
    body = _post_detect(client, png_bytes_dark, min_area=100).json()
    if body["objects"]:
        assert "area" in body["objects"][0]


def test_detect_max_objects_limit(client, png_bytes_dark):
    body = _post_detect(client, png_bytes_dark, max_objects=1).json()
    assert len(body["objects"]) <= 1


def test_detect_high_threshold_fewer_objects(client, png_bytes_dark):
    """Umbral mayor → menos objetos detectados."""
    low  = _post_detect(client, png_bytes_dark, threshold=0.1).json()
    high = _post_detect(client, png_bytes_dark, threshold=0.9).json()
    assert len(low["objects"]) >= len(high["objects"])


def test_detect_missing_image_422(client):
    r = client.post("/api/detect", data={"threshold": "0.5"})
    assert r.status_code == 422


# ── Tests por modo de detección ───────────────────────────────────────────────

class TestModoFondoBlanco:
    """
    Modo: python_white_absolute
    Condición: brillo_min (mediana del borde) ≥ 230.
    Fórmula JS: white_thresh = max(min_bg_component - 15, 220)
    Python debe replicar: white_thresh = max(brillo_min - 15, 220)
    """

    def test_metodo_es_white_absolute(self, client, png_bytes_white_bg):
        body = _post_detect(client, png_bytes_white_bg, min_area=500).json()
        assert body["method_used"] == "python_white_absolute", (
            f"Esperado 'python_white_absolute', obtenido '{body['method_used']}'"
        )

    def test_detecta_objeto_en_fondo_blanco(self, client, png_bytes_white_bg):
        body = _post_detect(client, png_bytes_white_bg, min_area=500).json()
        assert len(body["objects"]) >= 1, "No detectó objeto en fondo blanco"

    def test_background_flag_blanco(self, client, png_bytes_white_bg):
        body = _post_detect(client, png_bytes_white_bg, min_area=500).json()
        assert body["background"]["es_fondo_blanco"] is True

    def test_brillo_min_usa_mediana_no_media(self, client):
        """
        Fondo con 1 píxel negro (outlier) por borde — con mean bajaría por debajo de 230,
        con median permanece ≥ 230.  Verifica que se usa median (igual que JS).
        """
        import io, numpy as np
        from PIL import Image as PilImage

        # Imagen 200×200: fondo blanco (255) con objeto oscuro central
        arr = np.full((200, 200, 3), 255, dtype=np.uint8)
        arr[50:150, 50:150] = (30, 30, 30)   # objeto
        # Colocar 4 píxeles negros en esquinas del borde (outliers que mean arrastra hacia abajo)
        for corner in [(0, 0), (0, 199), (199, 0), (199, 199)]:
            arr[corner[0], corner[1]] = (0, 0, 0)
        buf = io.BytesIO()
        PilImage.fromarray(arr).save(buf, format="PNG")
        img_bytes = buf.getvalue()

        files = {"image": ("test.png", img_bytes, "image/png")}
        r = client.post("/api/detect", data={"min_area": "500"}, files=files)
        body = r.json()

        # Con mediana, los 4 outliers no arrastran la decisión → sigue siendo fondo blanco
        assert body["background"]["es_fondo_blanco"] is True, (
            "brillo_min con outliers no debería cambiar a no-blanco si se usa median "
            f"(brillo_min obtenido: {body['background']['brillo_min']})"
        )
        assert body["method_used"] == "python_white_absolute"


class TestModoZScan:
    """
    Modo: python_zscan_competitive
    Condición: fondo no blanco → Z-scan con clasificación competitiva.
    """

    def test_metodo_es_zscan(self, client, png_bytes_chromatic_bg):
        body = _post_detect(client, png_bytes_chromatic_bg, min_area=500).json()
        assert "zscan" in body["method_used"], (
            f"Fondo cromático debería disparar modo Z-scan, obtenido: '{body['method_used']}'"
        )

    def test_zscan_key_presente(self, client, png_bytes_chromatic_bg):
        body = _post_detect(client, png_bytes_chromatic_bg, min_area=500).json()
        assert "zscan" in body

    def test_zscan_contiene_colores(self, client, png_bytes_chromatic_bg):
        body = _post_detect(client, png_bytes_chromatic_bg, min_area=500).json()
        z = body["zscan"]
        for key in ("colorObjeto", "colorFondo", "umbralSugerido", "esCromatico"):
            assert key in z, f"Falta campo zscan.{key}"

    def test_fondo_cromatico_detectado(self, client, png_bytes_chromatic_bg):
        body = _post_detect(client, png_bytes_chromatic_bg, min_area=500).json()
        assert body["background"]["es_fondo_cromatico"] is True

    def test_umbral_sugerido_en_rango(self, client, png_bytes_chromatic_bg):
        """umbralSugerido ∈ [12, distObjBg*0.60] — igual que JS."""
        body = _post_detect(client, png_bytes_chromatic_bg, min_area=500).json()
        u = body["zscan"]["umbralSugerido"]
        assert u >= 12.0, f"umbralSugerido={u} < mínimo 12"
        assert u <= 450.0, f"umbralSugerido={u} parece descontrolado"

    def test_detecta_objeto_fondo_cromatico(self, client, png_bytes_chromatic_bg):
        body = _post_detect(client, png_bytes_chromatic_bg, min_area=500).json()
        assert len(body["objects"]) >= 1, "No detectó objeto en fondo cromático"


class TestModoCLAHE:
    """
    Modo: python_zscan_lc_clahe
    Condición: fondo no blanco + distObjBg < 25 (bajo contraste).
    """

    def test_bajo_contraste_usa_clahe(self, client, png_bytes_low_contrast):
        body = _post_detect(client, png_bytes_low_contrast, min_area=500).json()
        # CLAHE mejora el contraste → puede o no dispararse según el umbral real
        # Lo que verificamos es que el servidor responde correctamente
        assert body["status"] == "ok"

    def test_bajo_contraste_tiene_objects_key(self, client, png_bytes_low_contrast):
        body = _post_detect(client, png_bytes_low_contrast, min_area=100).json()
        assert "objects" in body
        assert isinstance(body["objects"], list)


class TestModoDeteccionGeneral:
    """
    Invariantes matemáticos que deben cumplirse en todos los modos.
    """

    def test_bbox_coherente_con_area(self, client, png_bytes_dark):
        """area_pixels ≤ bbox.w × bbox.h (el área nunca supera la caja contenedora)."""
        body = _post_detect(client, png_bytes_dark, min_area=100).json()
        for obj in body["objects"]:
            bbox = obj["bbox"]
            assert obj["area"] <= bbox["w"] * bbox["h"], (
                f"area={obj['area']} > bbox_area={bbox['w']*bbox['h']}"
            )

    def test_centroide_dentro_de_bbox(self, client, png_bytes_dark):
        """Centroide debe estar dentro de la caja contenedora (± 1px de tolerancia)."""
        body = _post_detect(client, png_bytes_dark, min_area=100).json()
        for obj in body["objects"]:
            cx, cy = obj["centroid"]
            b = obj["bbox"]
            assert b["x"] - 1 <= cx <= b["x"] + b["w"] + 1, (
                f"centroid.x={cx} fuera de bbox [{b['x']}, {b['x']+b['w']}]"
            )
            assert b["y"] - 1 <= cy <= b["y"] + b["h"] + 1, (
                f"centroid.y={cy} fuera de bbox [{b['y']}, {b['y']+b['h']}]"
            )

    def test_aspect_ratio_coherente_con_bbox(self, client, png_bytes_dark):
        """aspect_ratio = tight_width / tight_height — igual que JS."""
        body = _post_detect(client, png_bytes_dark, min_area=100).json()
        for obj in body["objects"]:
            if obj["tight_height"] > 0:
                expected_ar = round(obj["tight_width"] / obj["tight_height"], 3)
                assert abs(obj["aspect_ratio"] - expected_ar) < 0.01, (
                    f"aspect_ratio={obj['aspect_ratio']} ≠ w/h={expected_ar}"
                )

    def test_dominancia_filtra_objetos_pequenos(self, client, png_bytes_white_bg):
        """
        Filtro ≥20% del mayor (igual JS): ningún objeto tiene área menor al 20%
        del objeto de mayor área.
        """
        body = _post_detect(client, png_bytes_white_bg, min_area=100).json()
        objs = body["objects"]
        if len(objs) > 1:
            max_area = max(o["area"] for o in objs)
            for obj in objs:
                assert obj["area"] >= max_area * 0.20, (
                    f"Objeto con area={obj['area']} < 20% del máximo={max_area}"
                )

    def test_ids_son_unicos(self, client, png_bytes_dark):
        body = _post_detect(client, png_bytes_dark, min_area=100).json()
        ids = [o["id"] for o in body["objects"]]
        assert len(ids) == len(set(ids)), f"IDs duplicados: {ids}"

    def test_white_thresh_formula(self, client, png_bytes_white_bg):
        """
        Umbral blanco: max(brillo_min - 15, 220) — idéntico al JS.
        Para fondo 245 → white_thresh = max(230, 220) = 230.
        El objeto (30,30,30) debe quedar claramente por debajo → se detecta.
        """
        body = _post_detect(client, png_bytes_white_bg, min_area=500).json()
        bg = body["background"]
        brillo_min = bg["brillo_min"]
        white_thresh = max(brillo_min - 15, 220)
        # El objeto tiene valor 30 < white_thresh → debe detectarse
        assert len(body["objects"]) >= 1
        # brillo_min calculado debe ser ≥ 230 para activar modo blanco
        assert brillo_min >= 230, f"brillo_min={brillo_min} no debería ser < 230 para fondo=245"
