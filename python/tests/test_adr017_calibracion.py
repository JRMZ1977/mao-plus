"""
ADR-017 F4 — gate de `tools/adr017_calibracion_draga.py`.

La herramienta de calibración se ejecuta en la máquina del usuario, sobre un corpus
que este repositorio no contiene, y su salida se va a citar en un informe
arqueológico. Dos razones para que sus estadísticos estén probados aquí:

  1. Un ICC mal implementado no se nota: devuelve un número plausible entre 0 y 1.
  2. Si falla allí, falla lejos de aquí y sin nadie que lo diagnostique.

Los contrastes de abajo son PROPIEDADES conocidas de cada estadístico, no valores
copiados de mi propia implementación (eso no probaría nada).
"""

import importlib.util
import math
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location(
    "adr017_calibracion", ROOT / "tools" / "adr017_calibracion_draga.py")
cal = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cal)


# ── ICC(2,1), acuerdo absoluto ──────────────────────────────────────────────

def test_icc_acuerdo_perfecto_es_uno():
    v = [10.0, 25.0, 40.0, 55.0, 70.0, 85.0]
    icc, _ = cal.icc21(v, list(v))
    assert icc == pytest.approx(1.0, abs=1e-9)


def test_icc_castiga_el_sesgo_constante():
    """La propiedad que DEFINE el acuerdo absoluto frente a la consistencia.

    Con un desplazamiento fijo la correlación de Pearson sigue valiendo 1: los dos
    jueces ordenan igual. El ICC de acuerdo absoluto tiene que bajar, porque los
    números NO son los mismos. Si esta prueba pasara con 1.0 estaríamos publicando
    una consistencia disfrazada de concordancia.
    """
    obs = [10.0, 25.0, 40.0, 55.0, 70.0, 85.0]
    maq = [x + 12.0 for x in obs]
    icc, _ = cal.icc21(maq, obs)
    assert icc is not None
    assert icc < 0.95, f"un sesgo de 12 pp no puede dar ICC {icc:.3f}"


def test_el_ic_del_icc_contiene_su_punto_con_sesgo_entre_jueces():
    """Antes el IC era el de consistencia: con sesgo, ICC(2,1)=0,71 y el «IC95»
    salía [0,91; 0,99]. Ahora es el de McGraw & Wong caso 2A."""
    import random
    rnd = random.Random(5)
    verdad = [rnd.gauss(100, 6) for _ in range(15)]
    obs = [v + rnd.gauss(0, 1.0) for v in verdad]
    maq = [v * 1.05 + rnd.gauss(0, 1.0) for v in verdad]
    icc, ic = cal.icc21(maq, obs)
    assert ic is not None
    assert ic[0] <= icc <= ic[1], (icc, ic)


def test_icc_es_simetrico_entre_jueces():
    a = [12.0, 30.0, 48.0, 61.0, 77.0, 90.0]
    b = [15.0, 28.0, 52.0, 58.0, 80.0, 86.0]
    assert cal.icc21(a, b)[0] == pytest.approx(cal.icc21(b, a)[0], abs=1e-9)


def test_icc_baja_con_el_ruido():
    base = [10.0, 25.0, 40.0, 55.0, 70.0, 85.0, 95.0]
    poco = [x + (2 if i % 2 else -2) for i, x in enumerate(base)]
    mucho = [x + (20 if i % 2 else -20) for i, x in enumerate(base)]
    assert cal.icc21(poco, base)[0] > cal.icc21(mucho, base)[0]


def test_icc_no_se_calcula_con_menos_de_tres_piezas():
    assert cal.icc21([50.0, 60.0], [52.0, 58.0]) == (None, None)


# ── Bland-Altman ────────────────────────────────────────────────────────────

def test_bland_altman_sesgo_y_limites():
    obs = [20.0, 40.0, 60.0, 80.0]
    maq = [25.0, 45.0, 65.0, 85.0]          # +5 pp exactos
    ba = cal.bland_altman(maq, obs)
    assert ba["sesgo"] == pytest.approx(5.0)
    assert ba["sd"] == pytest.approx(0.0, abs=1e-9)
    assert ba["loa"][0] == pytest.approx(5.0) and ba["loa"][1] == pytest.approx(5.0)


def test_los_limites_de_acuerdo_encierran_las_diferencias():
    obs = [12.0, 30.0, 45.0, 58.0, 70.0, 88.0, 95.0, 33.0]
    maq = [14.0, 27.0, 50.0, 55.0, 74.0, 85.0, 99.0, 36.0]
    ba = cal.bland_altman(maq, obs)
    difs = [m - o for m, o in zip(maq, obs)]
    dentro = sum(1 for d in difs if ba["loa"][0] <= d <= ba["loa"][1])
    assert dentro >= len(difs) - 1, "los LoA deben cubrir ~95 % de las diferencias"


def test_no_se_alarma_de_sesgo_proporcional_con_pocas_piezas():
    """Corregido en F4 tras verlo en el banco de humo.

    Con 5 pares y residuos diminutos, el contraste t sobre la pendiente marcaba
    «significativa» una pendiente de −0,026 pp/pp: un aviso de problema donde no
    hay ninguno. Por debajo de 10 pares no se informa; por encima hace falta
    además que la DERIVA implicada sea apreciable.
    """
    obs = [100.0, 75.0, 50.0, 100.0, 50.0]
    maq = [100.0, 75.1, 51.5, 100.0, 51.0]
    assert "pendiente" not in cal.bland_altman(maq, obs)


def test_detecta_un_sesgo_proporcional_de_verdad():
    """Sobreestimación creciente al disminuir la completitud: el patrón que el
    banco sintético encontró en la elipse fragmentaria."""
    obs = [float(v) for v in range(10, 101, 6)]
    maq = [o + (100 - o) * 0.25 for o in obs]     # deriva grande y monótona
    ba = cal.bland_altman(maq, obs)
    assert ba["pendiente_significativa"], ba
    assert ba["deriva"] > 5.0


# ── κ de Cohen ──────────────────────────────────────────────────────────────

def test_kappa_perfecto_y_kappa_nulo():
    a = ["circulo", "elipse", "ninguna", "circulo", "ninguna", "elipse"]
    assert cal.kappa_cohen(a, list(a)) == pytest.approx(1.0)
    # Mitad y mitad intercambiando dos categorías equiprobables → κ ≈ 0.
    x = ["circulo", "elipse"] * 6
    y = ["circulo", "elipse", "elipse", "circulo"] * 3
    assert abs(cal.kappa_cohen(x, y)) < 0.35


def test_kappa_no_confunde_acierto_con_acuerdo():
    """80 % de aciertos con una categoría dominante es κ bajo: es lo que aporta κ
    sobre el porcentaje bruto, y la razón de publicar los dos."""
    a = ["ninguna"] * 9 + ["circulo"]
    b = ["ninguna"] * 8 + ["circulo", "ninguna"]
    k = cal.kappa_cohen(a, b)
    assert k is not None and k < 0.7


# ── El informe ──────────────────────────────────────────────────────────────

def _fila(pieza, of, oc, mf, mc, nota=""):
    return {"pieza": pieza, "obs_forma": of, "obs_comp": oc,
            "maq_forma": mf, "maq_comp": mc, "nota": nota}


def test_el_informe_nombra_el_coste_de_los_umbrales():
    """Lo que el banco sintético NO puede medir: cuántas piezas con forma ideal
    visible quedan fuera por el umbral. Debe salir señalado, no diluido."""
    res = [
        _fila("A", "circulo", 80.0, "circulo", 79.0),
        _fila("B", "elipse", 40.0, "ninguna", None, "poco arco sobre la plantilla"),
        _fila("C", "ninguna", None, "ninguna", None),
    ]
    txt = cal._redactar(res, Path("/corpus"), ["circulo", "elipse"], False)
    assert "rechaza donde el observador SÍ ve forma" in txt
    assert "**1** pieza(s)" in txt
    assert "`B`" in txt, "la pieza rechazada debe aparecer listada para revisarla"


def test_el_informe_no_inventa_estadisticos_sin_datos():
    res = [_fila("A", "ninguna", None, "ninguna", None)]
    txt = cal._redactar(res, Path("/corpus"), ["circulo"], False)
    assert "insuficiente para" in txt
    assert "ICC(2,1)**," not in txt


def test_el_informe_deja_ver_los_umbrales_usados():
    """Un informe de calibración sin los umbrales con los que se corrió no es
    reproducible: el mismo corpus da otro resultado tras recalibrar."""
    txt = cal._redactar([_fila("A", "circulo", 90.0, "circulo", 91.0)],
                        Path("/corpus"), ["circulo"], False)
    assert "Umbrales en vigor" in txt
    assert "0.40" in txt and "0.50" in txt


def test_los_errores_de_pipeline_no_contaminan_la_concordancia():
    """Una foto que el pipeline no puede procesar no es un desacuerdo del método:
    contarla como fallo de tipo falsearía κ hacia abajo."""
    res = [
        _fila("A", "circulo", 80.0, "circulo", 81.0),
        _fila("B", "circulo", 60.0, "error", None, "FileNotFoundError"),
    ]
    txt = cal._redactar(res, Path("/corpus"), ["circulo"], False)
    assert "con fallo de pipeline: 1" in txt
    assert "Coincidencia exacta: **100 %** (1 piezas)" in txt


# ── Descubrimiento del corpus ───────────────────────────────────────────────

def test_inventario_separa_raw_de_legible(tmp_path):
    (tmp_path / "sub").mkdir()
    for n in ("a.JPG", "sub/b.png", "c.CR3", "d.txt", ".oculta.jpg"):
        (tmp_path / n).write_bytes(b"x")
    imgs, raws = cal.inventariar(tmp_path)
    assert sorted(p.name for p in imgs) == ["a.JPG", "b.png"]
    assert [p.name for p in raws] == ["c.CR3"]


def test_el_identificador_de_pieza_sobrevive_a_las_subcarpetas(tmp_path):
    p = tmp_path / "nivel1" / "DRG_19-15_042.jpg"
    p.parent.mkdir()
    p.write_bytes(b"x")
    assert cal._id_pieza(p, tmp_path) == "nivel1·DRG_19-15_042"


def test_lee_numeros_con_coma_decimal():
    """El CSV lo rellena una persona en un Excel en español: 62,5 es lo normal."""
    assert cal._num("62,5") == 62.5
    assert cal._num(" 40 ") == 40.0
    assert cal._num("") is None and cal._num(None) is None


def test_las_bandas_del_icc_son_las_publicadas():
    """Koo & Li (2016). Son convención citable, no un criterio inventado aquí."""
    assert "POBRE" in cal._leer_icc(0.40)
    assert "moderada" in cal._leer_icc(0.60)
    assert "buena" in cal._leer_icc(0.80)
    assert "excelente" in cal._leer_icc(0.95)
    assert not math.isnan(0.0)
