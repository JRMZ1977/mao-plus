"""
ADR-017 F1-F4 — gate de `python/modules/shape_template.py`.

Verifica la envolvente operativa DECLARADA en el ADR §4 sobre formas sintéticas
de completitud conocida:

  • exacto (error ≤ 3 puntos porcentuales) entre el 25 % y el 100 % preservado,
  • RECHAZA por debajo de ~15 % en vez de inventar un número,
  • RECHAZA la plantilla equivocada (un rectángulo no es un círculo ni una elipse),
  • el centro se recupera aunque el fragmento no lo contenga — el defecto que F0
    retiró era precisamente medir alrededor del centroide del fragmento.

Los casos de abajo usan contornos poco ruidosos. Eso **no** basta para afirmar la
segunda viñeta en general: el banco sistemático de F4 (87 formas × 3 niveles de
ruido) demostró que con los umbrales de F1 se aceptaba el 22 % de las formas por
debajo del 15 %. El suelo real depende del ruido de contorno, y quien lo mide es
`tools/adr017_banco_umbrales.py` — ver `docs/VALIDACION-PLANTILLAS.md` §2.5. La
última sección de este archivo fija lo que aquel banco dejó calibrado.

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
    """Un nombre fuera del repertorio es error explícito, no silencio.

    (Antes de F2 este test usaba «triangulo»; el repertorio ICP la incorporó,
    así que ahora se comprueba con un nombre que de verdad no existe.)
    """
    loop = asyncio.new_event_loop()
    try:
        r = loop.run_until_complete(
            st.match(_ruido(_densificar(_arco(0, 2 * math.pi, 600)[:-1])),
                     templates=["dodecaedro_estrellado"])
        )
    finally:
        loop.close()
    assert r["status"] == "error"
    assert "dodecaedro_estrellado" in r["message"]


# ════════════════════════════════════════════════════════════════════════════
# F2 — repertorio arbitrario + ICP recortado
# ════════════════════════════════════════════════════════════════════════════

def _poligono(n_lados, r=R_VERDADERO, frac=1.0):
    """Polígono regular; con frac<1 devuelve un sector cerrado por el centro."""
    v = [[CENTRO[0] + r * math.cos(2 * math.pi * i / n_lados),
          CENTRO[1] + r * math.sin(2 * math.pi * i / n_lados)] for i in range(n_lados)]
    if frac >= 1.0:
        return _ruido(_densificar(v))
    k = max(2, int(round(n_lados * frac)) + 1)
    return _ruido(_densificar(v[:k] + [list(CENTRO)]))


def _acepta(r, tipo):
    """Candidato aceptado con ese nombre, o None."""
    for c in r["candidatos"]:
        if c["tipo"] == tipo and c["aceptada"]:
            return c
    return None


# ── Gate del ADR: paridad vía analítica ↔ vía ICP ───────────────────────────

@pytest.mark.parametrize("nombre,pts_factory,tpl", [
    ("círculo íntegro", lambda: _ruido(_densificar(_arco(0, 2 * math.pi, 600)[:-1])), "circulo"),
    ("disco 50 %",      lambda: _ruido(_densificar(_arco(0, math.pi, 300))),          "circulo"),
    ("disco 75 %",      lambda: _sector(0.75),                                        "circulo"),
    ("elipse íntegra",  lambda: _ruido(_densificar(_elipse(120, 60, 0.4, 0, 2 * math.pi, 600)[:-1])), "elipse"),
])
def test_paridad_analitico_vs_icp(nombre, pts_factory, tpl):
    """
    Gate F2 del ADR: el ICP genérico debe reproducir lo que la vía analítica
    calcula en forma cerrada. Si divergieran, una de las dos estaría mal.
    """
    pts = pts_factory()
    a = _correr(pts, templates=[tpl])
    b = _correr(pts, templates=[tpl], forzar_icp=True)
    assert a["plantilla_tipo"] == tpl and b["plantilla_tipo"] == tpl, (
        f"{nombre}: analítico={a['plantilla_tipo']} icp={b['plantilla_tipo']}"
    )
    assert abs(a["plantilla_completitud"] - b["plantilla_completitud"]) <= 3.0, (
        f"{nombre}: analítico {a['plantilla_completitud']:.1f} % vs "
        f"ICP {b['plantilla_completitud']:.1f} %"
    )


# ── Plantillas poligonales del repertorio ───────────────────────────────────

@pytest.mark.parametrize("n_lados,esperada", [(3, "triangulo"), (4, "cuadrado"), (6, "hexagono")])
def test_poligono_integro_elige_su_plantilla(n_lados, esperada):
    r = _correr(_poligono(n_lados),
                templates=["triangulo", "cuadrado", "hexagono", "circulo_icp"])
    assert r["plantilla_tipo"] == esperada, r["candidatos"]
    assert r["plantilla_completitud"] >= 97.0
    assert r["es_fragmento_candidato"] is False
    assert r["plantilla_metodo"] == "icp_repertorio"


def test_fragmento_poligonal_recupera_su_plantilla():
    """
    Medio hexágono: la plantilla `hexagono` debe aparecer ACEPTADA con
    completitud ≈ 50 %.

    NO se exige que gane. Un medio hexágono regular es, exactamente, un triángulo
    equilátero de lado 2r al que le falta la punta: sus 5r de perímetro incluyen
    4r que yacen sobre ese triángulo (66,7 % de sus 6r). Ambas lecturas —«50 % de
    un hexágono» y «67 % de un triángulo»— son geométricamente ciertas. Por eso
    el módulo publica TODOS los candidatos y el veredicto lo confirma un humano
    (ADR-009 / ADR-017 §7): la ambigüedad es de la forma, no del método.
    """
    r = _correr(_poligono(6, frac=0.5),
                templates=["triangulo", "cuadrado", "hexagono", "circulo_icp"])
    hexa = _acepta(r, "hexagono")
    assert hexa is not None, f"el hexágono no se recuperó: {r['candidatos']}"
    assert abs(hexa["completitud"] - 50.0) <= 6.0, hexa
    tri = _acepta(r, "triangulo")
    assert tri is not None and abs(tri["completitud"] - 66.7) <= 6.0, (
        "la lectura alternativa (triángulo truncado) también debe estar expuesta"
    )


# ── El puente EFA → repertorio (ADR-017 §2) ─────────────────────────────────

def test_repertorio_alimentado_por_efa():
    """
    El repertorio EFA de la pregunta original, funcionando: un banco de
    coeficientes se convierte en plantillas y el ICP hace el encaje que la
    distancia EFA no puede hacer.
    """
    from python.modules import efa

    coefs = [[1.0, 0.0, 0.0, 1.0], [0.0, 0.0, 0.0, 0.0], [0.25, 0.0, 0.0, -0.25]]
    st.registrar_plantilla_efa("_test_trilobulada", coefs)
    assert "_test_trilobulada" in st.plantillas_disponibles()

    base = efa.reconstruct(coefs, n_points=400)
    pts = _ruido([[CENTRO[0] + x * 100, CENTRO[1] + y * 100] for x, y in base], s=0.8)
    r = _correr(pts, templates=["_test_trilobulada", "circulo_icp"])
    assert r["plantilla_tipo"] == "_test_trilobulada", r["candidatos"]
    assert r["plantilla_completitud"] >= 95.0
    assert r["es_fragmento_candidato"] is False


def test_efa_reconstruct_es_la_inversa_de_calculate():
    """`reconstruct` estaba documentada en la cabecera de efa.py pero no existía."""
    from python.modules import efa

    c = efa.reconstruct([[1.0, 0.0, 0.0, 1.0]], n_points=64)   # 1 armónico = círculo
    assert len(c) == 64
    radios = [math.hypot(x, y) for x, y in c]
    # Tolerancia 1e-3, no 1e-6: `_reconstruct_contour` redondea las coordenadas a
    # 4 decimales por diseño (salida JSON-able), así que el radio oscila ~1e-4.
    assert max(radios) - min(radios) < 1e-3, "un armónico [1,0,0,1] debe dar el círculo unidad"
    assert abs(sum(radios) / len(radios) - 1.0) < 1e-3

    with pytest.raises(ValueError):
        efa.reconstruct([[1.0, 0.0]], n_points=32)             # forma inválida
    with pytest.raises(ValueError):
        efa.reconstruct([[1.0, 0.0, 0.0, 1.0]], n_points=2)    # muy pocos puntos


# ── Contrato y determinismo de la vía ICP ───────────────────────────────────

def test_icp_es_determinista():
    """Sin RNG: arranques equiespaciados fijos. Requisito ADR-013 F2."""
    pts = _poligono(6, frac=0.6)
    a = _correr(pts, templates=["hexagono"])
    b = _correr(pts, templates=["hexagono"])
    assert a["plantilla_completitud"] == b["plantilla_completitud"]
    assert a["plantilla_parametros"] == b["plantilla_parametros"]


def test_icp_publica_el_contorno_de_la_plantilla():
    """F3 necesita la forma inferida para dibujarla sobre la pieza."""
    r = _correr(_poligono(6), templates=["hexagono"])
    cont = r["plantilla_contorno"]
    assert cont and len(cont) >= 32
    assert all(len(p) == 2 for p in cont)
    xs = [p[0] for p in cont]
    assert min(xs) < CENTRO[0] < max(xs), "debe estar en coordenadas absolutas"


def test_plantillas_disponibles_es_estable():
    d = st.plantillas_disponibles()
    assert d == sorted(d)
    for esperada in ("triangulo", "cuadrado", "hexagono", "circulo_icp", "elipse_2_1"):
        assert esperada in d


def test_icp_tambien_rechaza_la_plantilla_equivocada():
    """La generalización no debilita el rechazo: un círculo no es un triángulo."""
    pts = _ruido(_densificar(_arco(0, 2 * math.pi, 600)[:-1]))
    r = _correr(pts, templates=["triangulo", "cuadrado"])
    assert r["plantilla_tipo"] == "ninguna", r["candidatos"]


# ── F4 · Los umbrales calibrados (banco `tools/adr017_banco_umbrales.py`) ────
#
# Los tres casos de abajo son los que MOVIERON los umbrales por defecto en F4.
# Con los valores de F1 (círculo 0,30 · elipse 0,45) los tres pasaban el filtro y
# publicaban un número inventado. No son casos hipotéticos: salieron del banco.

def _blob(ruido=0.5):
    """Forma orgánica sin cónica subyacente (suma de armónicos).

    Es el control negativo que con soporte 0,30 se aceptaba como «círculo al
    39,5 %»: el peor error posible, porque no hay ninguna forma ideal que
    recuperar y aun así se publicaba una completitud.
    """
    pts = []
    for i in range(240):
        a = 2 * math.pi * i / 240
        rr = R_VERDADERO * (1 + 0.18 * math.sin(3 * a) + 0.11 * math.cos(5 * a + 1.2))
        pts.append([CENTRO[0] + rr * math.cos(a), CENTRO[1] + rr * math.sin(a)])
    return _ruido(_densificar(pts), ruido)


def test_una_forma_organica_no_recibe_plantilla():
    r = _correr(_blob())
    assert r["plantilla_tipo"] == "ninguna", (
        f"aceptó '{r['plantilla_tipo']}' al {r['plantilla_completitud']} % sobre una "
        f"forma sin cónica subyacente (falso positivo que F4 eliminó)"
    )


def test_el_modo_degenerado_no_publica_un_numero_disparatado():
    """Sector de elipse al 50 % con segmentación pobre (ruido 2,5 px).

    Modo de fallo caracterizado en F4: con poco soporte gana un círculo PEQUEÑO
    encajado en un trozo del arco, que reporta ~18 % de completitud sobre una
    pieza que conserva el 50 % — 31,6 pp de error en el número que acaba en el
    CSV. El residuo no lo delata (es el mismo que el de un ajuste bueno con ese
    ruido); sólo lo delata la fracción de arco, que es lo que filtra el umbral.
    """
    pts = _ruido(_densificar(_elipse(120, 60, 0.4, 0, math.pi, 300) + [list(CENTRO)]), 2.5)
    r = _correr(pts)
    if r["plantilla_tipo"] != "ninguna":
        assert abs(r["plantilla_completitud"] - 50.0) <= 10.0, (
            f"publicó {r['plantilla_completitud']} % sobre una forma que conserva el "
            f"50 %: es el modo degenerado, debe rechazarse antes que mentir"
        )


def test_los_umbrales_no_bajan_de_lo_calibrado():
    """Guard de no-regresión de la calibración F4.

    No fija un número mágico: fija el SUELO que el banco avaló. Bajarlo reabre
    el modo degenerado de arriba (los 5 casos que se dejaron de aceptar traían
    errores de 5,4 · 10,0 · 11,3 · 15,8 y 31,6 pp). Subirlo está permitido —
    cuesta cobertura, no exactitud. Protocolo: `docs/VALIDACION-PLANTILLAS.md`.
    """
    assert st._MIN_ARCO_FRACCION["circulo"] >= 0.40
    assert st._MIN_ARCO_FRACCION["elipse"] >= 0.50
    assert st._MIN_COMPLETITUD >= 0.15
