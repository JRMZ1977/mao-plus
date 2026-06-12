"""
Tests de regresión: endpoint /api/efa (descriptores de Fourier elípticos).

Blinda las cuatro invariancias canónicas de Kuhl & Giardina (1982) sobre los
coeficientes NORMALIZADOS, además de la forma canónica del 1er armónico y
propiedades del espectro de potencia / varianza.

Contexto: hasta 2026-06-12, `_normalize_coeffs` omitía la rotación espacial ψ
y la EFA NO era invariante a la rotación de la pieza (Δmax ≈ 0.64 a 40°), pese a
documentarla. Estos tests fijan el comportamiento correcto (Δ ≈ 0).
"""
import json
import math
import numpy as np
import pytest


# ── Generadores de contornos sintéticos ─────────────────────────────────────

def _ellipse(a=120.0, b=70.0, n=200, cx=300.0, cy=300.0, phase=0.0):
    return [[cx + a * math.cos(2 * math.pi * i / n + phase),
             cy + b * math.sin(2 * math.pi * i / n + phase)] for i in range(n)]


def _rotate(points, deg, about=(300.0, 300.0)):
    th = math.radians(deg)
    c, s = math.cos(th), math.sin(th)
    ox, oy = about
    out = []
    for x, y in points:
        dx, dy = x - ox, y - oy
        out.append([ox + dx * c - dy * s, oy + dx * s + dy * c])
    return out


def _post_efa(client, contour, n_harmonics=15, scale=1.0, normalize=True):
    data = {
        "contour_json": json.dumps(contour),
        "n_harmonics": str(n_harmonics),
        "scale_px_mm": str(scale),
        "normalize": "true" if normalize else "false",
    }
    return client.post("/api/efa", data=data)


def _coeffs(client, contour, **kw):
    body = _post_efa(client, contour, **kw).json()
    assert body.get("status") == "ok", body
    return np.array(body["coefficients"], dtype=np.float64), body


# ── Smoke ────────────────────────────────────────────────────────────────────

def test_efa_returns_200(client):
    assert _post_efa(client, _ellipse()).status_code == 200


def test_efa_core_keys(client):
    body = _post_efa(client, _ellipse()).json()
    for k in ("coefficients", "coefficients_raw", "normalization",
              "power_spectrum", "variance_explained",
              "harmonics_for_95pct", "harmonics_for_99pct"):
        assert k in body, f"Falta clave EFA: {k}"


def test_efa_min_points_rejected(client):
    """Menos de _MIN_POINTS (8) → status error, no crash."""
    body = _post_efa(client, _ellipse(n=5)).json()
    assert body.get("status") == "error"


# ── Invariancias (el corazón de la corrección) ───────────────────────────────

class TestEFAInvariances:
    """Los coeficientes normalizados deben ser invariantes a traslación, escala,
    rotación de la pieza y punto de inicio del contorno."""

    TOL = 1e-3   # holgura numérica para muestreo discreto del contorno

    def test_invariance_rotation(self, client):
        """Rotar la pieza no debe cambiar los coeficientes (REGRESIÓN del fix ψ)."""
        base = _ellipse()
        c0, _ = _coeffs(client, base)
        for deg in (15, 40, 90, 137):
            cr, _ = _coeffs(client, _rotate(base, deg))
            dmax = float(np.abs(c0 - cr).max())
            assert dmax < self.TOL, f"rotación {deg}° rompe invariancia: Δmax={dmax:.5f}"

    def test_invariance_translation(self, client):
        c0, _ = _coeffs(client, _ellipse(cx=300, cy=300))
        ct, _ = _coeffs(client, _ellipse(cx=50, cy=900))
        assert float(np.abs(c0 - ct).max()) < self.TOL

    def test_invariance_scale(self, client):
        """Escalar la geometría 2× no debe cambiar los coeficientes normalizados."""
        c_small, _ = _coeffs(client, _ellipse(a=80, b=60))
        c_big, _   = _coeffs(client, _ellipse(a=160, b=120))
        assert float(np.abs(c_small - c_big).max()) < self.TOL

    def test_invariance_start_point(self, client):
        """Cambiar el punto de inicio del contorno (fase) no debe importar."""
        c0, _ = _coeffs(client, _ellipse(phase=0.0))
        cp, _ = _coeffs(client, _ellipse(phase=1.3))
        assert float(np.abs(c0 - cp).max()) < self.TOL

    def test_invariance_scale_param(self, client):
        """scale_px_mm escala la geometría por igual → normalizados invariantes."""
        c1, _ = _coeffs(client, _ellipse(), scale=1.0)
        c2, _ = _coeffs(client, _ellipse(), scale=0.05)
        assert float(np.abs(c1 - c2).max()) < self.TOL


# ── Forma canónica del 1er armónico ──────────────────────────────────────────

class TestEFACanonicalForm:

    def test_first_harmonic_canonical(self, client):
        """Tras normalizar: 1er armónico = [1, 0, 0, d1] con d1 ≥ 0."""
        c, _ = _coeffs(client, _ellipse(a=120, b=70))
        a1, b1, c1, d1 = c[0]
        assert abs(a1 - 1.0) < 1e-3, f"a1={a1}"
        assert abs(b1) < 1e-3, f"b1={b1}"
        assert abs(c1) < 1e-3, f"c1={c1}"
        assert d1 >= -1e-9, f"d1 debe ser ≥ 0 (quiralidad): d1={d1}"

    def test_first_harmonic_minor_axis_bounded_and_monotonic(self, client):
        """d1 (eje menor del 1er armónico normalizado) ∈ (0,1] y decrece con la
        elongación: círculo → d1≈1; elipse alargada → d1 pequeño.

        Nota: d1 NO es b/a — la parametrización por longitud de arco distorsiona
        la relación de semiejes (es la firma EFD, no la geometría directa)."""
        d1_circle, _ = _coeffs(client, _ellipse(a=80, b=80))
        d1_circle = d1_circle[0][3]
        d1_mid, _ = _coeffs(client, _ellipse(a=120, b=70))
        d1_mid = d1_mid[0][3]
        d1_long, _ = _coeffs(client, _ellipse(a=160, b=40))
        d1_long = d1_long[0][3]
        for v in (d1_circle, d1_mid, d1_long):
            assert 0.0 < v <= 1.0 + 1e-9, f"d1 fuera de (0,1]: {v}"
        assert d1_circle > d1_mid > d1_long, (d1_circle, d1_mid, d1_long)
        assert abs(d1_circle - 1.0) < 1e-3   # círculo → eje menor = mayor

    def test_reflection_canonicalized(self, client):
        """Una pieza y su espejo (y→−y) convergen a la misma forma canónica."""
        base = _ellipse(a=120, b=70)
        mirror = [[x, 600.0 - y] for x, y in base]   # espejo sobre y=300
        c0, _ = _coeffs(client, base)
        cm, _ = _coeffs(client, mirror)
        assert float(np.abs(c0 - cm).max()) < 1e-3


# ── Espectro de potencia y varianza ──────────────────────────────────────────

class TestEFASpectrum:

    def test_circle_one_harmonic(self, client):
        """Un círculo concentra ~100% de la varianza en el 1er armónico."""
        _, body = _coeffs(client, _ellipse(a=80, b=80, n=200))
        assert body["variance_explained"][0] >= 99.0
        assert body["harmonics_for_99pct"] == 1

    def test_power_spectrum_rotation_invariant(self, client):
        """El espectro de potencia ya era invariante; debe seguir siéndolo."""
        _, b0 = _coeffs(client, _ellipse())
        _, br = _coeffs(client, _rotate(_ellipse(), 33))
        ps0 = np.array(b0["power_spectrum"]); psr = np.array(br["power_spectrum"])
        assert float(np.abs(ps0 - psr).max()) < 1e-3

    def test_variance_monotonic_nondecreasing(self, client):
        """La varianza acumulada por armónico es monótona no decreciente y ≤100."""
        _, body = _coeffs(client, _ellipse(a=120, b=70))
        var = body["variance_explained"]
        assert all(var[i] <= var[i + 1] + 1e-6 for i in range(len(var) - 1))
        assert var[-1] <= 100.0 + 1e-6

    def test_harmonics_clamped_to_nyquist(self, client):
        """n_harmonics se acota a len(pts)//2 (Nyquist)."""
        body = _post_efa(client, _ellipse(n=20), n_harmonics=50).json()
        assert body["n_harmonics"] <= 10


# ── Endpoint /api/efa/compare ────────────────────────────────────────────────

class TestEFACompare:

    def _compare(self, client, ca, cb):
        data = {"coeffs_a_json": json.dumps(ca.tolist()),
                "coeffs_b_json": json.dumps(cb.tolist())}
        body = client.post("/api/efa/compare", data=data).json()
        assert body.get("status") == "ok", body
        return body

    def test_identical_shapes_max_similarity(self, client):
        c, _ = _coeffs(client, _ellipse())
        body = self._compare(client, c, c)
        assert body["d_efd"] < 1e-6
        assert body["similarity"] >= 0.999

    def test_rotated_shapes_are_similar(self, client):
        """Tras el fix, una pieza rotada debe seguir siendo casi idéntica."""
        c0, _ = _coeffs(client, _ellipse())
        cr, _ = _coeffs(client, _rotate(_ellipse(), 50))
        body = self._compare(client, c0, cr)
        assert body["d_efd"] < 1e-2, f"d_efd={body['d_efd']}"
        assert body["similarity"] >= 0.98

    def test_different_shapes_lower_similarity(self, client):
        c_round, _ = _coeffs(client, _ellipse(a=80, b=78))   # casi circular
        c_long, _  = _coeffs(client, _ellipse(a=160, b=40))  # muy alargada
        body = self._compare(client, c_round, c_long)
        assert body["similarity"] < 0.95
