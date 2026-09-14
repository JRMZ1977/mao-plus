"""
test_estandar_matematico.py — Verificación del ESTÁNDAR MATEMÁTICO de MAO como
herramienta de morfometría (exactitud + invarianza).

Distinto de la robustez (¿se rompe?): aquí verificamos que el motor calcula el
número CORRECTO según la morfometría, en dos ejes:

  PARTE A — EXACTITUD (known-answer): formas con valor analítico de libro
    · círculo   → circularidad 1, feret_ratio 1, solidez 1, excentricidad 0
    · cuadrado  → circularidad π/4 ≈ 0.7854, solidez 1
    · elipse    → área π·a·b, feret_max 2a, feret_min 2b, feret_ratio b/a
  PARTE B — INVARIANZA (propiedad definitoria del descriptor morfométrico):
    los adimensionales NO deben cambiar ante traslación, rotación y escala
    (ADR-006 lo promete; aquí se verifica para metrics.py, no solo EFA).

Vía TestClient (path real). Tolerancias holgadas por la discretización del contorno.
"""
import io
import json
import math

import numpy as np
import pytest
from PIL import Image as PilImage
from fastapi.testclient import TestClient

from python.server import app

TOL = 0.03  # 3 % — cubre discretización del polígono + hull


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def big_png():
    arr = np.full((1500, 2000, 3), 210, dtype=np.uint8)
    arr[600:900, 600:900] = 40  # objeto oscuro para textura
    b = io.BytesIO()
    PilImage.fromarray(arr).save(b, format="PNG")
    return b.getvalue()


# ── generadores de formas ────────────────────────────────────────────────────
def _ellipse(cx, cy, a, b, n=180):
    return [[cx + a * math.cos(2 * math.pi * i / n),
             cy + b * math.sin(2 * math.pi * i / n)] for i in range(n)]


def _square(cx, cy, s, n_side=50):
    h = s / 2
    pts, corners = [], [(-h, -h), (h, -h), (h, h), (-h, h)]
    for k in range(4):
        x0, y0 = corners[k]
        x1, y1 = corners[(k + 1) % 4]
        for j in range(n_side):
            t = j / n_side
            pts.append([cx + x0 + (x1 - x0) * t, cy + y0 + (y1 - y0) * t])
    return pts


def _rect(cx, cy, w, h, n_side=60):
    hw, hh = w / 2, h / 2
    pts, corners = [], [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
    for k in range(4):
        x0, y0 = corners[k]
        x1, y1 = corners[(k + 1) % 4]
        for j in range(n_side):
            t = j / n_side
            pts.append([cx + x0 + (x1 - x0) * t, cy + y0 + (y1 - y0) * t])
    return pts


def _metrics(client, png, contour, scale=1.0):
    r = client.post("/api/metrics",
                    files={"image": ("t.png", png, "image/png")},
                    data={"contour_json": json.dumps(contour), "scale_px_mm": str(scale)})
    assert r.status_code == 200, f"metrics devolvió {r.status_code}"
    return r.json()["metricas"]


# ═══ PARTE A — EXACTITUD (known-answer) ══════════════════════════════════════
def test_circulo_valores_de_libro(client, big_png):
    m = _metrics(client, big_png, _ellipse(750, 750, 120, 120, n=360))
    assert abs(m["circularity"] - 1.0) < TOL,        f"circularidad {m['circularity']}"
    assert abs(m["feret_ratio"] - 1.0) < TOL,        f"feret_ratio {m['feret_ratio']}"
    assert abs(m["solidity"] - 1.0) < TOL,           f"solidez {m['solidity']}"
    assert abs(m.get("excentricidad", 0)) < 0.15,    f"excentricidad {m.get('excentricidad')}"


def test_cuadrado_circularidad_pi_cuartos(client, big_png):
    m = _metrics(client, big_png, _square(750, 750, 240))
    esperado = math.pi / 4  # 0.7854
    assert abs(m["circularity"] - esperado) < 0.04,  f"circularidad cuadrado {m['circularity']} vs {esperado:.4f}"
    assert abs(m["solidity"] - 1.0) < TOL,           f"solidez {m['solidity']}"


def test_elipse_area_y_feret_analiticos(client, big_png):
    a, b = 150, 75
    m = _metrics(client, big_png, _ellipse(750, 600, a, b, n=240))
    area_esp = math.pi * a * b
    assert abs(m["area"] - area_esp) / area_esp < TOL,           f"área {m['area']} vs {area_esp:.1f}"
    assert abs(m["feret_max"] - 2 * a) / (2 * a) < TOL,          f"feret_max {m['feret_max']} vs {2*a}"
    assert abs(m["feret_min"] - 2 * b) / (2 * b) < TOL,          f"feret_min {m['feret_min']} vs {2*b}"
    assert abs(m["feret_ratio"] - b / a) < TOL,                  f"feret_ratio {m['feret_ratio']} vs {b/a}"


def test_escala_area_cuadratica_perimetro_lineal(client, big_png):
    """area(mm²)=area(px²)·s² ; perimeter(mm)=perimeter(px)·s (estándar dimensional)."""
    pts = _ellipse(750, 600, 150, 75, n=240)
    px = _metrics(client, big_png, pts, scale=1.0)
    mm = _metrics(client, big_png, pts, scale=0.1)
    assert abs(mm["area"] - px["area"] * 0.1 ** 2) / (px["area"] * 0.01) < TOL
    assert abs(mm["perimeter"] - px["perimeter"] * 0.1) / (px["perimeter"] * 0.1) < TOL


def test_circulo_perimetro_regularidad_simetria(client, big_png):
    """Círculo: perímetro 2πr, regularidad radial ≈100 (0-100), compacidad/convexidad/simetría 1."""
    r = 120
    m = _metrics(client, big_png, _ellipse(750, 750, r, r, n=360))
    assert abs(m["perimeter"] - 2 * math.pi * r) / (2 * math.pi * r) < TOL, f"perímetro {m['perimeter']}"
    assert m["regularidad_radial"] > 98, f"regularidad círculo {m['regularidad_radial']} (esperado ≈100)"
    assert abs(m["compactness"] - 1.0) < TOL
    assert abs(m["convexity"] - 1.0) < TOL
    assert m["simetria_bilateral"] > 0.98, f"simetría círculo {m['simetria_bilateral']}"


def test_elipse_elongacion(client, big_png):
    """elongación = 1 − eje_menor/eje_mayor ; elipse a/b=2 → 0.5 (métrica del paper)."""
    m = _metrics(client, big_png, _ellipse(750, 600, 150, 75, n=240))
    assert abs(m["elongation"] - 0.5) < 0.03, f"elongación {m['elongation']} vs 0.5"


def test_rectangulo_valores_de_libro(client, big_png):
    w, h = 200, 100
    m = _metrics(client, big_png, _rect(750, 600, w, h))
    assert abs(m["area"] - w * h) / (w * h) < TOL, f"área rect {m['area']} vs {w*h}"
    assert abs(m["solidity"] - 1.0) < TOL, f"solidez rect {m['solidity']}"
    assert m["simetria_bilateral"] > 0.98, f"simetría rect {m['simetria_bilateral']}"


def test_cross_validacion_vs_skimage_regionprops(client, big_png):
    """
    Conformancia con la implementación de REFERENCIA del campo (scikit-image regionprops):
    MAO (desde contorno) debe concordar con regionprops (desde ráster) en excentricidad y solidez.
    """
    import cv2
    from skimage.measure import label, regionprops

    a, b = 150, 75
    pts = _ellipse(420, 320, a, b, n=360)
    m = _metrics(client, big_png, pts)

    mask = np.zeros((640, 840), dtype=np.uint8)
    poly = np.array([[int(round(x)), int(round(y))] for x, y in pts], dtype=np.int32)
    cv2.fillPoly(mask, [poly], 1)
    prop = regionprops(label(mask))[0]

    assert abs(m["excentricidad"] - prop.eccentricity) < 0.03, \
        f"excentricidad MAO={m['excentricidad']:.4f} vs skimage={prop.eccentricity:.4f}"
    assert abs(m["solidity"] - prop.solidity) < 0.03, \
        f"solidez MAO={m['solidity']:.4f} vs skimage={prop.solidity:.4f}"


# ═══ PARTE B — INVARIANZA (traslación / rotación / escala) ════════════════════
# Adimensionales que DEBEN ser invariantes a las tres transformaciones.
_INVARIANTES = ["circularity", "solidity", "convexity", "excentricidad",
                "feret_ratio", "elongation", "compactness",
                "regularidad_radial", "simetria_bilateral"]
# aspect_ratio_tight depende de la orientación (bbox alineado a ejes) → se excluye de ROTACIÓN.

_BASE = _ellipse(750, 600, 150, 75, n=200)


def _transladar(pts, dx, dy):
    return [[x + dx, y + dy] for x, y in pts]


def _rotar(pts, deg, cx=750, cy=600):
    r = math.radians(deg)
    c, s = math.cos(r), math.sin(r)
    return [[cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c] for x, y in pts]


def _escalar(pts, k, cx=750, cy=600):
    return [[cx + (x - cx) * k, cy + (y - cy) * k] for x, y in pts]


def _comparar_invariantes(base, otra, claves, tol, ctx):
    fallos = []
    for k in claves:
        if k not in base or k not in otra:
            continue
        vb, vo = base[k], otra[k]
        denom = max(abs(vb), 1e-6)
        if abs(vo - vb) / denom > tol:
            fallos.append(f"{k}: base={vb:.5f} {ctx}={vo:.5f} (Δ={abs(vo-vb)/denom*100:.1f}%)")
    return fallos


def test_invarianza_traslacion(client, big_png):
    base = _metrics(client, big_png, _BASE)
    tras = _metrics(client, big_png, _transladar(_BASE, 300, -150))
    fallos = _comparar_invariantes(base, tras, _INVARIANTES + ["aspect_ratio_tight"], TOL, "traslada")
    assert not fallos, "No invariante a traslación:\n  " + "\n  ".join(fallos)


def test_invarianza_rotacion(client, big_png):
    base = _metrics(client, big_png, _BASE)
    rot = _metrics(client, big_png, _rotar(_BASE, 37))
    # aspect_ratio_tight NO es invariante a rotación (bbox alineado a ejes) → excluido.
    fallos = _comparar_invariantes(base, rot, _INVARIANTES, TOL, "rota37")
    assert not fallos, "No invariante a rotación:\n  " + "\n  ".join(fallos)


def test_invarianza_escala(client, big_png):
    base = _metrics(client, big_png, _BASE)
    esc = _metrics(client, big_png, _escalar(_BASE, 2.0))
    fallos = _comparar_invariantes(base, esc, _INVARIANTES + ["aspect_ratio_tight"], TOL, "x2")
    assert not fallos, "No invariante a escala:\n  " + "\n  ".join(fallos)
    # Y las dimensionales deben escalar correctamente (área k², perímetro k):
    assert abs(esc["area"] - base["area"] * 4) / (base["area"] * 4) < TOL, "área no escala k²"
    assert abs(esc["perimeter"] - base["perimeter"] * 2) / (base["perimeter"] * 2) < TOL, "perímetro no escala k"
