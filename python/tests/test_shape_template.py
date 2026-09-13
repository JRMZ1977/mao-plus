"""
ADR-017 F1 — gate de `python/modules/shape_template.py`.

Verifica la envolvente operativa DECLARADA en el ADR §4 sobre formas sintéticas
de completitud conocida:

  • exacto (error ≤ 3 puntos porcentuales) entre el 25 % y el 100 % preservado,
  • RECHAZA por debajo de ~15 % en vez de inventar un número,
  • RECHAZA la plantilla equivocada (un rectángulo no es un círculo ni una elipse),
  • el centro se recupera aunque el fragmento no lo contenga — el defecto que F0
    retiró era precisamente medir alrededor del centroide del fragmento.

El módulo es math-critical: ningún cambio entra sin que estos números sigan saliendo.
"""

import asyncio
import math

import pytest

from python.modules import shape_template as st


# ── Utilidades de geometría sintética ───────────────────────────────────────

R_VERDADERO = 100.0
CENTRO = (300.0, 300.0)


def _densificar(poly, paso=1.5):
    """Remuestrea el polígono a paso ~constante, como hace cv2.findContours."""
    out = []
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        d = math.hypot(x2 - x1, y2 - y1)
        n = max(1, round(d / paso))
        for k in range(n):
            out.append([x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n])
    return out


def _ruido(pts, s=1.2):
    """Ruido DETERMINISTA (no aleatorio): los números del ADR son reproducibles."""
    return [[x + math.sin(i * 2.3) * s, y + math.cos(i * 1.7) * s]
            for i, (x, y) in enumerate(pts)]


def _arco(a0, a1, n, r=R_VERDADERO):
    return [[CENTRO[0] + r * math.cos(a0 + (a1 - a0) * i / n),
             CENTRO[1] + r * math.sin(a0 + (a1 - a0) * i / n)] for i in range(n + 1)]


def _elipse(a, b, th, t0, t1, n):
    co, si = math.cos(th), math.sin(th)
    out = []
    for i in range(n + 1):
        t = t0 + (t1 - t0) * i / n
        px, py = a * math.cos(t), b * math.sin(t)
        out.append([CENTRO[0] + px * co - py * si, CENTRO[1] + px * si + py * co])
    return out


def _sector(frac_vuelta, n=None):
    """Sector de disco: arco + los dos radios que lo cierran (como una silueta real)."""
    ang = 2 * math.pi * frac_vuelta
    n = n or max(40, int(600 * frac_vuelta))
    return _ruido(_densificar(_arco(0, ang, n) + [list(CENTRO)]))


def _correr(pts, **kw):
    """El módulo expone una corutina; cada test usa su PROPIO event loop.

    Gotcha del repo (CLAUDE.md): `asyncio.run` deja `set_event_loop(None)` y rompe
    a otros tests de la suite en Py3.9. Loop propio creado y cerrado aquí.
    """
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(st.match(pts, **kw))
    finally:
        loop.close()


# ── 1. Exactitud dentro de la envolvente declarada ──────────────────────────

@pytest.mark.parametrize("frac_esperada,pts_factory", [
    (100.0, lambda: _ruido(_densificar(_arco(0, 2 * math.pi, 600)[:-1]))),
    (75.0,  lambda: _sector(0.75)),
    (50.0,  lambda: _ruido(_densificar(_arco(0, math.pi, 300)))),
    (25.0,  lambda: _sector(0.25)),
])
def test_completitud_exacta_de_25_a_100(frac_esperada, pts_factory):
    """Error ≤ 3 puntos porcentuales entre el 25 % y el 100 % preservado (ADR §4)."""
    r = _correr(pts_factory())
    assert r["status"] == "ok"
    assert r["plantilla_tipo"] == "circulo", r.get("motivo_rechazo")
    obtenida = r["plantilla_completitud"]
    assert abs(obtenida - frac_esperada) <= 3.0, (
        f"completitud {obtenida:.1f} % vs verdad {frac_esperada:.1f} %"
    )


def test_circulo_integro_no_es_fragmento():
    """La regresión que motivó todo: una pieza redonda ÍNTEGRA no es un fragmento."""
    r = _correr(_ruido(_densificar(_arco(0, 2 * math.pi, 600)[:-1])))
    assert r["plantilla_tipo"] == "circulo"
    assert r["plantilla_completitud"] >= 97.0
    assert r["es_fragmento_candidato"] is False
    assert r["plantilla_confianza_nivel"] == "alta"


def test_el_centro_se_recupera_aunque_el_fragmento_no_lo_contenga():
    """
    Núcleo de la corrección F0→F1: la cobertura se mide alrededor del CENTRO
    AJUSTADO, no del centroide del fragmento. En un medio disco el centro real
    cae sobre la cuerda de fractura, lejos del centroide del fragmento.
    """
    r = _correr(_ruido(_densificar(_arco(0, math.pi, 300))))
    p = r["plantilla_parametros"]
    assert abs(p["cx"] - CENTRO[0]) <= 3.0
    assert abs(p["cy"] - CENTRO[1]) <= 3.0
    assert abs(p["r"] - R_VERDADERO) <= 3.0, f"radio {p['r']:.1f} vs {R_VERDADERO}"


# ── 2. Rechazo fuera de la envolvente ───────────────────────────────────────

def test_rechaza_por_debajo_del_15_por_ciento():
    """Con muy poco arco el ajuste degenera: se RECHAZA, no se inventa."""
    r = _correr(_sector(0.125))
    assert r["plantilla_tipo"] == "ninguna"
    assert r["plantilla_completitud"] is None
    assert r["es_fragmento_candidato"] is None
    assert r["motivo_rechazo"]


def test_rechaza_plantilla_equivocada():
    """Un rectángulo no es un círculo ni una elipse."""
    pts = _ruido(_densificar([[200, 250], [400, 250], [400, 350], [200, 350]]))
    r = _correr(pts)
    assert r["plantilla_tipo"] == "ninguna", (
        f"aceptó '{r['plantilla_tipo']}' con completitud {r['plantilla_completitud']}"
    )


def test_contorno_insuficiente_no_inventa():
    r = _correr([[0, 0], [1, 0], [1, 1], [0, 1]])
    assert r["plantilla_tipo"] == "ninguna"
    assert r["plantilla_completitud"] is None
    assert "insuficiente" in r["motivo_rechazo"]


# ── 3. Plantilla elipse ─────────────────────────────────────────────────────

def test_elipse_completa_se_reconoce_como_elipse():
    pts = _ruido(_densificar(_elipse(120, 60, 0.4, 0, 2 * math.pi, 600)[:-1]))
    r = _correr(pts)
    assert r["plantilla_tipo"] == "elipse", r.get("motivo_rechazo")
    assert r["plantilla_completitud"] >= 97.0
    assert r["es_fragmento_candidato"] is False
    p = r["plantilla_parametros"]
    assert abs(p["a"] - 120.0) <= 5.0 and abs(p["b"] - 60.0) <= 5.0


def test_media_elipse_da_la_mitad():
    pts = _ruido(_densificar(_elipse(120, 60, 0.4, 0, math.pi, 300)))
    r = _correr(pts)
    assert r["plantilla_tipo"] == "elipse", r.get("motivo_rechazo")
    assert abs(r["plantilla_completitud"] - 50.0) <= 3.0


def test_circulo_no_se_reinterpreta_como_elipse():
    """
    La elipse tiene 2 parámetros más y SIEMPRE ajusta al menos igual de bien.
    Un círculo debe seguir siendo círculo, no una elipse de ejes casi iguales.
    """
    r = _correr(_ruido(_densificar(_arco(0, 2 * math.pi, 600)[:-1])))
    assert r["plantilla_tipo"] == "circulo"


# ── 4. Contrato y determinismo ──────────────────────────────────────────────

def test_contrato_de_salida_completo():
    """Las claves del contrato ADR-017 §5 están siempre, aceptada o no."""
    claves = {
        "plantilla_tipo", "plantilla_completitud", "plantilla_arco_fraccion",
        "plantilla_residuo_rms", "plantilla_parametros", "plantilla_confianza",
        "plantilla_confianza_nivel", "plantilla_metodo", "es_fragmento_candidato",
    }
    for pts in (_ruido(_densificar(_arco(0, 2 * math.pi, 600)[:-1])), _sector(0.125)):
        r = _correr(pts)
        assert claves <= set(r), f"faltan {claves - set(r)}"


def test_es_determinista():
    """
    Misma entrada ⇒ misma salida. El RANSAC usa semilla fija; sin esto el módulo
    violaría la replicabilidad que exige ADR-013 F2.
    """
    pts = _sector(0.5)
    a, b = _correr(pts), _correr(pts)
    assert a["plantilla_completitud"] == b["plantilla_completitud"]
    assert a["plantilla_parametros"] == b["plantilla_parametros"]


def test_invariante_arqueologico_es_candidato_no_veredicto():
    """
    ADR-017 §7 — la silueta 2D no dictamina fractura. El campo se llama
    `es_fragmento_candidato` y vale None cuando no hay plantilla: nunca se
    afirma «pieza completa» por ausencia de evidencia.
    """
    r = _correr(_ruido(_densificar([[200, 250], [400, 250], [400, 350], [200, 350]])))
    assert r["es_fragmento_candidato"] is None
    assert "es_fragmento" not in r          # el flag categórico no existe


def test_plantilla_no_soportada_es_error_explicito():
    loop = asyncio.new_event_loop()
    try:
        r = loop.run_until_complete(
            st.match(_ruido(_densificar(_arco(0, 2 * math.pi, 600)[:-1])),
                     templates=["triangulo"])
        )
    finally:
        loop.close()
    assert r["status"] == "error"
    assert "triangulo" in r["message"]
