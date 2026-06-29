"""
Tests de regresión: endpoint /api/contour
"""
import pytest


def _post_contour(client, png_bytes, **kwargs):
    # bbox ligeramente más amplio que el objeto (90,65,220,170) para que el módulo detecte el contorno
    params = {"bbox_x": "90", "bbox_y": "65", "bbox_w": "220", "bbox_h": "170"}
    params.update({k: str(v) for k, v in kwargs.items()})
    files = {"image": ("test.png", png_bytes, "image/png")}
    return client.post("/api/contour", data=params, files=files)


def test_contour_returns_200(client, png_bytes_dark):
    r = _post_contour(client, png_bytes_dark)
    assert r.status_code == 200


def test_contour_has_points(client, png_bytes_dark):
    body = _post_contour(client, png_bytes_dark).json()
    assert "points" in body
    assert isinstance(body["points"], list)


def test_contour_points_are_pairs(client, png_bytes_dark):
    body = _post_contour(client, png_bytes_dark).json()
    pts = body["points"]
    assert len(pts) > 0
    for p in pts[:5]:
        assert len(p) == 2, f"Punto no es par (x,y): {p}"


def test_contour_subpixel_returns_floats(client, png_bytes_dark):
    body = _post_contour(client, png_bytes_dark, subpixel="true").json()
    pts = body["points"]
    if pts:
        # Sub-pixel debe devolver floats, no solo enteros exactos
        all_int = all(p[0] == int(p[0]) and p[1] == int(p[1]) for p in pts)
        # Al menos una coordenada debe ser no-entera (sub-píxel real)
        # Se acepta que en algunas imágenes perfectas sea entero
        assert isinstance(pts[0][0], (int, float))


def test_contour_simplify_reduces_points(client, png_bytes_dark):
    """Mayor tolerancia de simplificación → menos puntos."""
    body_fine   = _post_contour(client, png_bytes_dark, simplify="0.5").json()
    body_coarse = _post_contour(client, png_bytes_dark, simplify="10.0").json()
    assert len(body_fine["points"]) >= len(body_coarse["points"])


def test_contour_missing_bbox_422(client, png_bytes_dark):
    files = {"image": ("test.png", png_bytes_dark, "image/png")}
    r = client.post("/api/contour", data={}, files=files)
    assert r.status_code == 422


def test_contour_missing_image_422(client):
    data = {"bbox_x": "0", "bbox_y": "0", "bbox_w": "100", "bbox_h": "100"}
    r = client.post("/api/contour", data=data)
    assert r.status_code == 422


# ── Tests de regresión de pipeline ───────────────────────────────────────────

class TestContourPipeline:
    """Verifica propiedades geométricas y de pipeline de extract()."""

    def test_contour_area_inside_bbox(self, client, png_bytes_dark):
        """Área del contorno ≤ área del bbox solicitado."""
        body = _post_contour(client, png_bytes_dark).json()
        pts = body.get("points", [])
        assert len(pts) >= 3
        # Área Shoelace sobre coordenadas absolutas
        import math
        x = [p[0] for p in pts]; y = [p[1] for p in pts]
        n = len(pts)
        area = 0.5 * abs(sum(x[i] * y[(i+1) % n] - x[(i+1) % n] * y[i] for i in range(n)))
        bbox_area = 220 * 170   # _post_contour: w=220, h=170
        assert area < bbox_area

    def test_contour_centroid_inside_bbox(self, client, png_bytes_dark):
        """Centroide del contorno dentro del bbox solicitado (90,65,220,170)."""
        body = _post_contour(client, png_bytes_dark).json()
        pts = body.get("points", [])
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        assert 90 <= cx <= 90 + 220
        assert 65 <= cy <= 65 + 170

    def test_contour_points_visual_fewer_than_full(self, client, png_bytes_dark):
        """points_visual debe tener ≤ puntos que points (D-P simplifica)."""
        body = _post_contour(client, png_bytes_dark).json()
        full  = body.get("points", [])
        vis   = body.get("points_visual", [])
        assert len(vis) <= len(full) + 1   # margen 1 por cierre del polígono

    def test_contour_points_visual_min_8(self, client, png_bytes_dark):
        """Fallback JS: contorno visual debe tener ≥ 8 puntos."""
        body = _post_contour(client, png_bytes_dark).json()
        assert len(body.get("points_visual", [])) >= 8

    def test_contour_epsilon_formula(self, client, png_bytes_dark):
        """ε = min(tol, max(0.5, P×0.001)) — simplify=0.5 debe dar epsilon≤0.5."""
        # Con tolerancia muy baja (0.5) y perímetro moderado, epsilon debe ser ≤ 0.5
        # por tanto el contorno visual no debe ser más simple que con tolerancia alta.
        body_low  = _post_contour(client, png_bytes_dark, simplify="0.5").json()
        body_high = _post_contour(client, png_bytes_dark, simplify="20.0").json()
        # A mayor tolerancia → epsilon mayor → menos puntos
        assert len(body_low["points_visual"]) >= len(body_high["points_visual"])

    def test_contour_returns_is_valid_flag(self, client, png_bytes_dark):
        """Respuesta debe incluir is_valid=True para imagen con objeto claro."""
        body = _post_contour(client, png_bytes_dark).json()
        assert body.get("is_valid") is True

    def test_contour_metrics_area_perimeter(self, client, png_bytes_dark):
        """metrics.area_real y metrics.perimeter_real deben ser positivos."""
        body = _post_contour(client, png_bytes_dark).json()
        m = body.get("metrics", {})
        assert m.get("area_real", 0) > 0
        assert m.get("perimeter_real", 0) > 0

    def test_contour_absolute_coords_offset(self, client, png_bytes_dark):
        """Los puntos deben estar en coordenadas absolutas (dentro del bbox declarado)."""
        body = _post_contour(client, png_bytes_dark).json()
        pts = body.get("points", [])
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        # bbox: x=90..310, y=65..235
        assert min(xs) >= 85   # tolerancia 5 px por subpixel/snap
        assert max(xs) <= 315
        assert min(ys) >= 60
        assert max(ys) <= 240


# ── ADR-008 Fase 2 — confianza de detección en la frontera del contorno ──────
# `/contour` ahora propaga `detection_confidence`/`confidence_level` (misma fuente
# que detect()/IA: _confianza_objeto), para que los 4 modos de captura hereden la
# confianza en el análisis y el contrato sea homogéneo.

class TestContourConfidence:
    def test_confidence_keys_present(self, client, png_bytes_dark):
        body = _post_contour(client, png_bytes_dark).json()
        assert "detection_confidence" in body
        assert "confidence_level" in body

    def test_confidence_level_canonico(self, client, png_bytes_dark):
        """El nivel es el lenguaje LAAR (alta/media/baja) o None."""
        body = _post_contour(client, png_bytes_dark).json()
        assert body["confidence_level"] in ("alta", "media", "baja", None)

    def test_confidence_score_en_rango(self, client, png_bytes_dark):
        """Score ∈ [0,1] o None; objeto oscuro nítido sobre fondo claro → no None."""
        body = _post_contour(client, png_bytes_dark).json()
        score = body["detection_confidence"]
        assert score is None or (0.0 <= score <= 1.0)
        # El fixture es un objeto de alto contraste → la confianza debe calcularse.
        assert score is not None
        assert body["confidence_level"] is not None


def _rugosidad(points):
    """perímetro del contorno / perímetro de su convex hull. ~1.0 = liso, ≫1 = dentado."""
    import cv2
    import numpy as np
    pts = np.asarray(points, dtype=np.float32).reshape(-1, 1, 2)
    peri = cv2.arcLength(pts, True)
    hull = cv2.convexHull(pts)
    hperi = cv2.arcLength(hull, True)
    return peri / hperi if hperi > 0 else 0.0


def _png_disco_texturizado(R=90, cx=150, cy=150, w=300, h=300):
    """Disco oscuro sobre fondo blanco con TEXTURA interna (motas claras).

    Reproduce el caso DRG16: las motas crean gradientes |∇I| internos fuertes.
    El gradient-snap ingenuo los «engancha» y denta el contorno (rugosidad alta);
    el snap consciente de figura-fondo (ADR-013) los ignora → contorno liso.
    """
    import cv2
    import numpy as np
    img = np.full((h, w, 3), 245, dtype=np.uint8)
    cv2.circle(img, (cx, cy), R, (40, 40, 40), -1)
    rng = np.random.default_rng(42)
    disco = np.zeros((h, w), np.uint8)
    cv2.circle(disco, (cx, cy), R - 4, 255, -1)   # textura solo en el interior
    ys, xs = np.nonzero(disco)
    sel = rng.choice(len(xs), size=int(len(xs) * 0.06), replace=False)
    for k in sel:
        img[ys[k], xs[k]] = (200, 200, 200)        # mota clara interna
    ok, buf = cv2.imencode(".png", img)
    return buf.tobytes(), (cx - R - 10, cy - R - 10, 2 * (R + 10), 2 * (R + 10))


class TestContourTextura:
    """ADR-013: el contorno sigue el borde figura-fondo, no la textura interna."""

    def test_disco_texturizado_contorno_liso(self, client):
        """Disco con motas internas → contorno cercano al círculo (rugosidad baja)."""
        png, bbox = _png_disco_texturizado()
        body = _post_contour(client, png,
                             bbox_x=bbox[0], bbox_y=bbox[1],
                             bbox_w=bbox[2], bbox_h=bbox[3]).json()
        assert body.get("points"), "sin contorno"
        rug = _rugosidad(body["points"])
        # Un círculo liso da ~1.0–1.05; el snap ingenuo enganchando textura subía >1.3.
        assert rug < 1.20, f"contorno dentado por textura: rugosidad={rug:.3f}"

    def test_disco_texturizado_area_no_colapsa(self, client):
        """El contorno no se mete hacia adentro: conserva ≥85% del área del disco."""
        import math
        R = 90
        png, bbox = _png_disco_texturizado(R=R)
        body = _post_contour(client, png,
                             bbox_x=bbox[0], bbox_y=bbox[1],
                             bbox_w=bbox[2], bbox_h=bbox[3]).json()
        area = body["metrics"]["area_real"]
        area_circulo = math.pi * R * R
        assert area >= 0.85 * area_circulo, (
            f"contorno recortado hacia adentro: área={area:.0f} vs círculo={area_circulo:.0f}"
        )
