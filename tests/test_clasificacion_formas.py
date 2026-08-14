"""
Reconocimiento de forma con VERDAD CONOCIDA.

Genera formas sintéticas de clase conocida y comprueba que `metrics.calculate`
las clasifica bien. Antes de este banco no había ninguna medida de exactitud del
clasificador: se ajustaba a ojo sobre piezas sueltas. La medición inicial dio
38% de aciertos exactos; las tres causas encontradas están cubiertas aquí:

  1. NO era invariante a la rotación: `aspect_ratio_tight` y `rectangularity`
     salían del bounding box alineado a los ejes de la imagen, así que la misma
     pieza girada cambiaba de clase (un laminar a 33° → «Cuadrangular»).
     Ahora la clasificación usa el rectángulo mínimo (`_min_area_rect`).
  2. ORDEN del árbol: las reglas curvilíneas (Circular/Subcircular) iban antes
     que el recuento de lados y capturaban cualquier polígono compacto — un
     cuadrado salía «Subcircular» y un hexágono «Circular».
  3. Recuento de lados con epsilon fijo (3% del perímetro), que funde vértices
     en polígonos de 5+ lados. Ahora se elige por estabilidad multi-escala.
"""
import math
import asyncio
import zlib

import numpy as np
import cv2
import pytest

from python.modules import metrics as M


# ── generadores de forma (contorno denso, centrado en el origen) ────────────

def _poly(vertices, n=600):
    salida, per = [], 0.0
    for i in range(len(vertices)):
        a, b = vertices[i], vertices[(i + 1) % len(vertices)]
        per += math.hypot(b[0] - a[0], b[1] - a[1])
    paso = per / n
    for i in range(len(vertices)):
        a, b = vertices[i], vertices[(i + 1) % len(vertices)]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        d = 0.0
        while d < L:
            salida.append((a[0] + (b[0] - a[0]) * d / L, a[1] + (b[1] - a[1]) * d / L))
            d += paso
    return salida


def _param(f, n=600):
    return [f(2 * math.pi * i / n) for i in range(n)]


def _contorno_de_mascara(dibujar, tam=600):
    """Rasteriza y extrae el contorno con findContours, como hace la app."""
    lienzo = np.zeros((tam, tam), dtype=np.uint8)
    dibujar(lienzo, tam // 2)
    cs, _ = cv2.findContours(lienzo, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=cv2.contourArea).reshape(-1, 2).astype(float)
    return [(x - tam // 2, y - tam // 2) for x, y in c]


def _rectangulo(w=200, h=140):
    return _poly([(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)])


def _ngono(n, r=100):
    return _poly([(r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n)) for k in range(n)])


def _elipse(a=110, b=62):
    return _param(lambda t: (a * math.cos(t), b * math.sin(t)))


def _lunar(R=110, r=92, dx=55):
    def dib(im, c):
        cv2.circle(im, (c, c), R, 255, -1)
        cv2.circle(im, (c + dx, c), r, 0, -1)
    return _contorno_de_mascara(dib)


def _estrellado(n=5, R=110, r=48):
    v = []
    for k in range(2 * n):
        rad = R if k % 2 == 0 else r
        a = math.pi / 2 + k * math.pi / n
        v.append((rad * math.cos(a), rad * math.sin(a)))
    return _poly(v, 800)


def _lobulado(n=3, R=95, amp=0.26):
    return _param(lambda t: (R * (1 + amp * math.cos(n * t)) * math.cos(t),
                             R * (1 + amp * math.cos(n * t)) * math.sin(t)))


def _lanceolada(a=140, b=62):
    def f(t):
        s = math.sin(t)
        return (a * math.cos(t), b * math.copysign(abs(s) ** 0.62, s))
    return _param(f)


# nombre → (generador, clase esperada, clases aceptables)
FORMAS = {
    "circulo":     (lambda: _param(lambda t: (100 * math.cos(t), 100 * math.sin(t))), "Circular", {"Circular", "Subcircular"}),
    "elipse":      (_elipse, "Elipsoidal", {"Elipsoidal", "Oval"}),
    "rectangulo":  (_rectangulo, "Rectangular", {"Rectangular", "Cuadrangular"}),
    "cuadrado":    (lambda: _rectangulo(160, 160), "Cuadrangular", {"Cuadrangular", "Rectangular"}),
    "triangulo":   (lambda: _ngono(3, 115), "Triangular", {"Triangular"}),
    "trapecio":    (lambda: _poly([(-47.5, -100), (47.5, -100), (115, 100), (-115, 100)]), "Trapezoidal", {"Trapezoidal", "Cuadrangular"}),
    "rombo":       (lambda: _poly([(0, -60), (90, 0), (0, 60), (-90, 0)]), "Romboidal", {"Romboidal", "Cuadrangular"}),
    "pentagono":   (lambda: _ngono(5), "Pentagonal", {"Pentagonal"}),
    "hexagono":    (lambda: _ngono(6), "Hexagonal", {"Hexagonal"}),
    "laminar":     (lambda: _elipse(200, 40), "Laminar", {"Laminar"}),
    "lanceolada":  (_lanceolada, "Lanceolada", {"Lanceolada", "Amigdaloide"}),
    "lunar":       (_lunar, "Lunar", {"Lunar"}),
    "estrellado":  (_estrellado, "Estrellado", {"Estrellado", "Lobulado"}),
    "lobulado":    (_lobulado, "Lobulado", {"Lobulado", "Estrellado"}),
}

# variantes limpias: sin ruido de contorno (rotación y escala no deben afectar)
VARIANTES_LIMPIAS = [("base", 0, 1.0), ("rot17", 17, 1.0), ("rot33", 33, 1.0),
                     ("rot60", 60, 1.0), ("peq", 0, 0.55), ("gr", 0, 1.35)]


def _transformar(pts, rot_deg=0.0, escala=1.0, ruido=0.0, cx=450, cy=350, semilla=0):
    rng = np.random.default_rng(semilla)
    t = math.radians(rot_deg)
    radio = max(math.hypot(x, y) for x, y in pts) or 1.0
    salida = []
    for x, y in pts:
        x, y = x * escala, y * escala
        xr = x * math.cos(t) - y * math.sin(t)
        yr = x * math.sin(t) + y * math.cos(t)
        if ruido:
            n = rng.normal(0, ruido * radio * escala, 2)
            xr, yr = xr + n[0], yr + n[1]
        salida.append([cx + xr, cy + yr])
    return salida


def _clasificar(pts):
    img = np.full((700, 900, 3), 180, dtype=np.uint8)
    cv2.fillPoly(img, [np.array(pts, dtype=np.int32)], (60, 55, 50))
    ok, buf = cv2.imencode(".png", img)
    res = asyncio.run(M.calculate(buf.tobytes(),
                                  [[float(x), float(y)] for x, y in pts],
                                  scale_px_mm=0.0, img_bgr=img))
    return res["metricas"]


# ── pruebas ─────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("nombre", list(FORMAS))
def test_forma_limpia_se_reconoce(nombre):
    """
    Sin ruido de contorno la clase debe ser correcta en toda rotación y escala.
    Se admiten los sinónimos legítimos de la taxonomía (un cuadrado clasificado
    «Rectangular» no es un error: es un rectángulo).
    """
    gen, esperado, acepta = FORMAS[nombre]
    base = gen()
    fallos = []
    for vn, rot, esc in VARIANTES_LIMPIAS:
        m = _clasificar(_transformar(base, rot, esc))
        obtenido = m.get("forma_detectada")
        if obtenido not in acepta:
            fallos.append(f"{vn}: {obtenido}")
    assert not fallos, f"{nombre} (esperado {esperado}) falló en → {', '.join(fallos)}"


@pytest.mark.parametrize("nombre", ["rectangulo", "laminar", "trapecio", "elipse", "hexagono"])
def test_invariancia_a_la_rotacion(nombre):
    """
    La misma pieza girada no puede cambiar de clase ni de proporciones.
    Con el bounding box alineado a los ejes, un laminar a 33° se clasificaba
    «Cuadrangular» y su aspect ratio pasaba de 5.0 a 2.4.
    """
    gen, _, _ = FORMAS[nombre]
    base = gen()
    ref = _clasificar(_transformar(base, 0, 1.0))
    for rot in (17, 33, 60, 90):
        m = _clasificar(_transformar(base, rot, 1.0))
        assert m["forma_detectada"] == ref["forma_detectada"], (
            f"{nombre}: {ref['forma_detectada']} → {m['forma_detectada']} al girar {rot}°")
        assert m["aspect_ratio_min_rect"] == pytest.approx(ref["aspect_ratio_min_rect"], rel=0.05), (
            f"{nombre}: aspect ratio no invariante al girar {rot}°")


def test_exactitud_global_con_ruido():
    """
    Con ruido de contorno la clasificación se degrada, pero debe mantenerse por
    encima del umbral medido tras el arreglo (era 38% exactas en total).
    """
    total = aciertos = aceptables = 0
    for nombre, (gen, esperado, acepta) in FORMAS.items():
        base = gen()
        for vn, rot, ruido in [("ruido05", 0, 0.005), ("ruido15", 23, 0.015)]:
            m = _clasificar(_transformar(base, rot, 1.0, ruido,
                                         semilla=zlib.crc32((nombre + vn).encode())))
            obtenido = m.get("forma_detectada")
            total += 1
            aciertos += obtenido == esperado
            aceptables += obtenido in acepta
    # Umbrales por debajo de lo medido (64% exactas / 68% aceptables sobre este
    # subconjunto, que es el más duro: solo variantes con ruido). Son una reja
    # contra regresiones, no el techo alcanzable.
    assert aciertos / total >= 0.55, f"exactas {aciertos}/{total}"
    assert aceptables / total >= 0.60, f"aceptables {aceptables}/{total}"


def test_topologia_distingue_hueco_de_mordida():
    """
    El centroide del hull dentro/fuera del material separa anillo de creciente:
    ambos tienen solidez baja y circularidad fragmentada baja, y antes caían en
    la misma regla.
    """
    luna = _clasificar(_transformar(_lunar(), 0, 1.0))
    assert luna["centroide_hull_en_material"] < 0.0
    assert luna["forma_detectada"] == "Lunar"

    solido = _clasificar(_transformar(_rectangulo(), 0, 1.0))
    assert solido["centroide_hull_en_material"] > 0.0


def test_concavidades_resisten_el_ruido():
    """
    convexityDefects sobre el contorno crudo se rompía en los dos sentidos: una
    estrella ruidosa daba 0 concavidades (excepción por puntos duplicados) y una
    luna ruidosa 28 (cada temblor era una mordida). Se simplifica antes de medir.
    """
    for ruido in (0.0, 0.005, 0.015):
        m = _clasificar(_transformar(_estrellado(), 0, 1.0, ruido, semilla=7))
        assert m["concavidades_significativas"] == 5, (
            f"estrella de 5 puntas con ruido {ruido} → {m['concavidades_significativas']} concavidades")

    for ruido in (0.0, 0.005):
        m = _clasificar(_transformar(_lunar(), 0, 1.0, ruido, semilla=7))
        assert m["concavidades_significativas"] == 1, (
            f"creciente con ruido {ruido} → {m['concavidades_significativas']} concavidades")
