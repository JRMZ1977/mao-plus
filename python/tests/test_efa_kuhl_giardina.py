"""
ADR-021 · Coeficientes EFA en el convenio de Kuhl & Giardina (1982).

`/api/efa` publicaba los coeficientes sólo en el convenio interno de MAO, desfasado
90° respecto de K&G (cabecera de python/modules/efa.py). Cargados en Momocs o pyefd
describen OTRA curva. Desde ADR-021 la respuesta añade `coefficients_raw_kg`,
`coefficients_kg`, `normalization_kg` y `coefficient_convention`, que son los que
exportan los CSV.

Se contrasta contra referencias INDEPENDIENTES del módulo, no contra sí mismo:
  · `_ref_efd_kg` / `_ref_normalizar_kg`: las ecuaciones de K&G (1982, ecs. 6-7 y
    §4) escritas aquí en forma vectorizada, con los convenios de pyefd (contorno
    cerrado repitiendo el primer punto, t=0 en él; normalización por θ₁, ψ₁ y
    |a₁|, sin canonizar la quiralidad). No importa nada de efa.py.
  · `pyefd`, si está instalado (no lo está en el .venv del proyecto). Se añade a
    la lista de referencias; no se omite ningún test si falta.
  · La DEFINICIÓN: con coeficientes de K&G la serie canónica
    x(t) = A0 + Σ[a·cos(2πkt/T) + b·sin(2πkt/T)] reconstruye el contorno. Es lo
    que distingue un convenio de otro, sin depender de ninguna implementación.

Sobre el código anterior a ADR-021 fallan todos salvo la guardia del descriptor
interno, que existe para demostrar que éste NO cambia.
"""
import asyncio
import json
import math

import numpy as np
import pytest
from fastapi.testclient import TestClient

from python.modules import efa
from python.server import app

try:                                    # referencia externa opcional
    import pyefd as _pyefd              # type: ignore
except ImportError:                     # pragma: no cover - depende del entorno
    _pyefd = None


# ── Referencia independiente: Kuhl & Giardina (1982) ────────────────────────

def _ref_efd_kg(cerrado: np.ndarray, orden: int) -> np.ndarray:
    """Ecs. 6-7 de K&G sobre un polígono cerrado (último punto = primero)."""
    d = np.diff(cerrado, axis=0)
    dt = np.hypot(d[:, 0], d[:, 1])
    t = np.concatenate([[0.0], np.cumsum(dt)])
    T = t[-1]
    k = np.arange(1, orden + 1, dtype=np.float64)
    fase = 2.0 * np.pi * np.outer(k, t) / T
    dcos = np.cos(fase[:, 1:]) - np.cos(fase[:, :-1])
    dsin = np.sin(fase[:, 1:]) - np.sin(fase[:, :-1])
    const = T / (2.0 * np.pi ** 2 * k ** 2)
    vx, vy = d[:, 0] / dt, d[:, 1] / dt
    return np.stack([const * (dcos @ vx), const * (dsin @ vx),
                     const * (dcos @ vy), const * (dsin @ vy)], axis=1)


def _rot(ang: float) -> np.ndarray:
    return np.array([[math.cos(ang), -math.sin(ang)],
                     [math.sin(ang),  math.cos(ang)]])


def _ref_normalizar_kg(coef: np.ndarray) -> np.ndarray:
    """K&G §4: fase θ₁ al semieje mayor, giro −ψ₁ al eje x, escala por |a₁|."""
    coef = np.asarray(coef, dtype=np.float64)
    a1, b1, c1, d1 = coef[0]
    th = 0.5 * math.atan2(2 * (a1 * b1 + c1 * d1), a1 ** 2 - b1 ** 2 + c1 ** 2 - d1 ** 2)
    M = [coef[i].reshape(2, 2) @ _rot((i + 1) * th) for i in range(len(coef))]
    psi = math.atan2(M[0][1, 0], M[0][0, 0])
    M = [_rot(-psi) @ m for m in M]
    escala = abs(M[0][0, 0])
    return np.array([m.ravel() for m in M]) / escala


REFERENCIAS = [("kuhl_giardina_transcrito", _ref_efd_kg, _ref_normalizar_kg)]
if _pyefd is not None:                  # pragma: no cover - depende del entorno
    REFERENCIAS.append((
        "pyefd",
        lambda c, n: _pyefd.elliptic_fourier_descriptors(c, order=n),
        lambda c: _pyefd.normalize_efd(np.array(c, dtype=np.float64)),
    ))


# ── Formas de prueba (con armónicos pares y asimetría, no sólo elipses) ─────

def _polar(r_de_t, n=240, cx=300.0, cy=260.0):
    t = 2 * np.pi * np.arange(n) / n
    r = r_de_t(t)
    return np.stack([cx + r * np.cos(t), cy + r * np.sin(t)], axis=1)


FORMAS = {
    "trilobulada": lambda: _polar(lambda t: 100 * (1 + 0.30 * np.cos(3 * t) + 0.12 * np.sin(4 * t)
                                                  + 0.08 * np.cos(2 * t + 0.5))),
    "huevo":       lambda: _polar(lambda t: 90 * (1 + 0.22 * np.cos(t) + 0.10 * np.cos(2 * t + 0.4)
                                                 + 0.05 * np.sin(5 * t)), n=310),
    "elipse":      lambda: np.stack([300 + 140 * np.cos(2 * np.pi * np.arange(200) / 200),
                                     260 + 60 * np.sin(2 * np.pi * np.arange(200) / 200)], axis=1),
    # polígono trazado a mano: pocos vértices y muestreo muy irregular
    "poligono":    lambda: np.array([[120, 80], [180, 70], [260, 95], [300, 150], [290, 230],
                                     [240, 270], [170, 262], [125, 230], [98, 170], [104, 118],
                                     [111, 96]], dtype=np.float64),
}

VARIANTES = {
    "tal_cual":       lambda P: P,
    "inicio_movido":  lambda P: np.roll(P, -len(P) // 3, axis=0),
    "sentido_inverso": lambda P: P[::-1].copy(),
}


def _calcular(P, n_harmonics=20, escala=0.05, normalize=True):
    """`efa.calculate` con loop propio (gotcha asyncio de CLAUDE.md)."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(efa.calculate(
            np.asarray(P).tolist(), n_harmonics=n_harmonics,
            scale_px_mm=escala, normalize=normalize))
    finally:
        loop.close()


def _cerrado_escalado(P, escala):
    """El contorno exactamente como lo ve `calculate`, cerrado para la referencia."""
    P = np.asarray(P, dtype=np.float64)
    if escala > 0 and escala != 1.0:
        P = P * escala
    return np.vstack([P, P[:1]])


def _cerca(a, b, rel=1e-10):
    a, b = np.asarray(a, dtype=np.float64), np.asarray(b, dtype=np.float64)
    assert a.shape == b.shape, (a.shape, b.shape)
    tol = rel * max(1.0, float(np.abs(b).max()))
    err = float(np.abs(a - b).max())
    assert err <= tol, f"max |Δ| = {err:.3e} > {tol:.1e}"


CASOS = [(f, v, e) for f in FORMAS for v in VARIANTES for e in (0.05, 0.0)]


# ── 1. Crudos: iguales a la referencia ───────────────────────────────────────

@pytest.mark.parametrize("ref", REFERENCIAS, ids=[r[0] for r in REFERENCIAS])
@pytest.mark.parametrize("forma,variante,escala", CASOS)
def test_crudos_kg_coinciden_con_la_referencia(ref, forma, variante, escala):
    P = VARIANTES[variante](FORMAS[forma]())
    res = _calcular(P, escala=escala)
    n = res["n_harmonics"]
    esperado = ref[1](_cerrado_escalado(P, escala), n)
    _cerca(res["coefficients_raw_kg"], esperado)


# ── 2. Normalizados: iguales a la normalización de K&G de la referencia ─────

@pytest.mark.parametrize("ref", REFERENCIAS, ids=[r[0] for r in REFERENCIAS])
@pytest.mark.parametrize("forma,variante,escala", CASOS)
def test_normalizados_kg_coinciden_con_la_referencia(ref, forma, variante, escala):
    P = VARIANTES[variante](FORMAS[forma]())
    res = _calcular(P, escala=escala)
    esperado = ref[2](ref[1](_cerrado_escalado(P, escala), res["n_harmonics"]))
    _cerca(res["coefficients_kg"], esperado)


def test_normalizacion_kg_no_canoniza_la_quiralidad():
    """Como pyefd y Momocs: invertir el sentido de recorrido cambia el signo de d₁.
    El descriptor interno de MAO sí lo canoniza (d₁ ≥ 0) y lo sigue haciendo."""
    P = FORMAS["huevo"]()
    d_directo = _calcular(P)["coefficients_kg"][0][3]
    d_inverso = _calcular(P[::-1].copy())["coefficients_kg"][0][3]
    assert d_directo * d_inverso < 0
    assert _calcular(P[::-1].copy())["coefficients"][0][3] >= 0


# ── 3. La definición: la serie canónica reconstruye el contorno ─────────────

def _remuestrear_arco(P, m):
    """m puntos a fracciones iguales de longitud de arco, desde P[0]."""
    C = np.vstack([P, P[:1]])
    s = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(C, axis=0).T))])
    obj = s[-1] * np.arange(m) / m
    return np.stack([np.interp(obj, s, C[:, 0]), np.interp(obj, s, C[:, 1])], axis=1)


def test_la_serie_canonica_de_kg_reconstruye_el_contorno():
    P = FORMAS["trilobulada"]()
    # muestreo denso: la truncación a 40 armónicos es entonces el único error
    P = _polar(lambda t: 100 * (1 + 0.30 * np.cos(3 * t) + 0.12 * np.sin(4 * t)
                                + 0.08 * np.cos(2 * t + 0.5)), n=2400)
    res = _calcular(P, n_harmonics=40, escala=0.0)
    ref = _remuestrear_arco(P, 360)
    tam = float(np.ptp(P, axis=0).max())

    rec_kg = np.array(efa.reconstruct(res["coefficients_raw_kg"], n_points=360,
                                      dc=res["dc"], convenio=efa.CONVENIO_KG))
    err_kg = float(np.abs(rec_kg - ref).max()) / tam
    assert err_kg < 2e-3, f"la serie de K&G no reproduce el contorno: {err_kg:.2e}"

    # Y el mismo juego leído con otro convenio NO lo reproduce: el test discrimina.
    rec_mal = np.array(efa.reconstruct(res["coefficients_raw_kg"], n_points=360,
                                       dc=res["dc"], convenio=efa.CONVENIO_MAO))
    assert float(np.abs(rec_mal - ref).max()) / tam > 0.05


def test_reconstruct_da_la_misma_curva_en_ambos_convenios():
    res = _calcular(FORMAS["huevo"](), escala=0.05)
    mao = np.array(efa.reconstruct(res["coefficients_raw"], n_points=128, dc=res["dc"]))
    kg = np.array(efa.reconstruct(res["coefficients_raw_kg"], n_points=128, dc=res["dc"],
                                  convenio=efa.CONVENIO_KG))
    assert float(np.abs(mao - kg).max()) < 1e-3   # redondeo a 4 decimales + crudos a 8


def test_una_plantilla_se_registra_desde_un_banco_en_el_convenio_kg():
    """ADR-017 F2 registra plantillas desde bancos EFA; uno exportado de Momocs o
    pyefd viene en K&G y debe dar la MISMA curva que el banco equivalente de MAO."""
    from python.modules import shape_template as st
    res = _calcular(FORMAS["huevo"](), escala=0.0)
    try:
        st.registrar_plantilla_efa("_adr021_mao", res["coefficients_raw"], n_points=128)
        st.registrar_plantilla_efa("_adr021_kg", res["coefficients_raw_kg"], n_points=128,
                                   convenio=efa.CONVENIO_KG)
        mao = st._REPERTORIO["_adr021_mao"]()
        kg = st._REPERTORIO["_adr021_kg"]()
        assert float(np.abs(mao - kg).max()) < 1e-3
    finally:
        st._REPERTORIO.pop("_adr021_mao", None)   # el repertorio es global
        st._REPERTORIO.pop("_adr021_kg", None)


def test_reconstruct_rechaza_un_convenio_desconocido():
    with pytest.raises(ValueError):
        efa.reconstruct([[1, 0, 0, 1]], n_points=16, convenio="momocs")


# ── 4. Contrato de la respuesta ──────────────────────────────────────────────

@pytest.fixture(scope="module")
def cliente():
    with TestClient(app) as c:
        yield c


def test_el_endpoint_declara_el_convenio_de_cada_campo(cliente):
    P = FORMAS["trilobulada"]()
    body = cliente.post("/api/efa", data={
        "contour_json": json.dumps(P.tolist()), "n_harmonics": "12",
        "scale_px_mm": "0.05", "normalize": "true"}).json()
    assert body["status"] == "ok"
    assert body["coefficient_convention"] == {
        "coefficients": "mao", "coefficients_raw": "mao",
        "coefficients_kg": "kuhl_giardina_1982", "coefficients_raw_kg": "kuhl_giardina_1982",
    }
    for campo in ("coefficients_kg", "coefficients_raw_kg"):
        assert np.asarray(body[campo]).shape == (12, 4)
    assert set(body["normalization_kg"]) == {"theta_1_deg", "psi_1_deg", "scale_factor"}
    # el tamaño (semieje mayor del 1er armónico) no depende del convenio
    assert body["normalization_kg"]["scale_factor"] == pytest.approx(
        body["normalization"]["scale_factor"], rel=1e-6)
    # y por el JSON viajan sin redondear (la paridad no la limita el formato)
    esperado = _ref_efd_kg(_cerrado_escalado(P, 0.05), 12)
    _cerca(body["coefficients_raw_kg"], esperado)


def test_espectro_y_varianza_son_los_mismos_en_ambos_convenios():
    res = _calcular(FORMAS["huevo"]())
    ps_kg = np.sqrt((np.asarray(res["coefficients_kg"]) ** 2).sum(axis=1))
    assert np.allclose(ps_kg, res["power_spectrum"], atol=1e-6)


def test_sin_normalizar_los_kg_son_los_crudos():
    res = _calcular(FORMAS["poligono"](), normalize=False)
    _cerca(res["coefficients_kg"], res["coefficients_raw_kg"], rel=0)


# ── 5. Guardia: el descriptor INTERNO no cambia ──────────────────────────────
# Valores tomados del código de 1.3.0 (fe84b9d) ANTES de ADR-021, para la forma
# trilobulada con 8 armónicos y 0,05 mm/px. ADR-021 no puede mover las
# distancias d_EFD, el comparador ni las métricas: si esto falla, sí lo hizo.

_INTERNO_1_3_0 = {
    "coefficients": [
        [1.0, 0.0, -0.0, 0.8784312],
        [0.06017889, -0.09962314, -0.08624157, -0.21283141],
        [-0.0163062, 0.02510998, -0.01950581, -0.07237139],
        [-0.08533648, 0.04782144, -0.05908173, -0.08313364],
        [0.0003774, -0.02342904, -0.0133871, -0.02277256],
        [0.01162953, -0.00144559, -0.00320757, 0.00132321],
        [-0.00401579, -0.00123273, -0.00513806, -0.00367017],
        [0.00078425, -0.00770668, -0.00968648, -0.00026656],
    ],
    "coefficients_raw": [
        [0.69271213, -5.37102444, 4.78314086, 1.00630864],
        [-0.13269762, -0.89707792, -0.82067216, -0.70368777],
        [-0.05788889, -0.10404802, 0.33730103, -0.26027249],
        [0.37478287, -0.41123756, 0.43579576, 0.31689098],
        [-0.09575821, 0.13216746, -0.00209913, 0.10398412],
        [0.02651868, -0.04809849, -0.01314586, 0.03602227],
        [-0.02167329, -0.02429893, -0.01061887, -0.0235544],
        [0.04247467, -0.00160387, 0.00219931, -0.0530259],
    ],
    "normalization": {"theta_1_deg": 80.711, "psi_1_deg": 161.2121, "scale_factor": 5.480811},
    "power_spectrum": [1.33103, 0.257451, 0.080712, 0.141319, 0.035311, 0.012222, 0.007584, 0.012406],
    "dc": [15.1309, 15.4713],
}


def _trilobulada_1_3_0():
    """El generador EXACTO con el que se tomaron los valores de arriba."""
    pts = []
    for i in range(240):
        t = 2 * math.pi * i / 240
        r = 100.0 * (1 + 0.30 * math.cos(3 * t) + 0.12 * math.sin(4 * t) + 0.08 * math.cos(2 * t + 0.5))
        pts.append([300.0 + r * math.cos(t), 300.0 + r * math.sin(t)])
    return pts


def test_el_descriptor_interno_de_mao_no_cambia():
    res = _calcular(_trilobulada_1_3_0(), n_harmonics=8, escala=0.05)
    # Los campos van redondeados (8 decimales los coeficientes, 6 el espectro, 4 el
    # DC): se tolera una unidad en el último decimal, nada más.
    for campo, tol in (("coefficients", 2e-8), ("coefficients_raw", 2e-8),
                       ("power_spectrum", 2e-6), ("dc", 2e-4)):
        assert np.allclose(res[campo], _INTERNO_1_3_0[campo], rtol=0, atol=tol), campo
    for clave, tol in (("theta_1_deg", 2e-4), ("psi_1_deg", 2e-4), ("scale_factor", 2e-6)):
        assert res["normalization"][clave] == pytest.approx(
            _INTERNO_1_3_0["normalization"][clave], abs=tol), clave
