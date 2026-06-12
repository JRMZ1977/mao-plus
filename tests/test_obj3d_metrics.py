"""
Tests de regresión para métricas 3D de obj3d_v2:

1. _procrustes_disparity_2d — rango dinámico de la similitud (M² = SUMA, no media).
   Antes del fix (2026-06-12) la disparidad se dividía por N=64 y `similarity`
   saturaba en [0.95, 1] (un círculo y un cuadrado salían 0.999). Estos tests
   fijan que ahora la similitud discrimina formas distintas.

2. _max_pairwise_distance / Feret 3D máximo — cálculo EXACTO sin submuestreo.
   Antes se submuestreaba el hull a 600 vértices aleatorios ANTES de buscar la
   distancia máxima, lo que podía descartar los dos extremos y subestimar el
   diámetro de forma grosera (200 → 6.8 en una nube patológica).
"""
import math

import numpy as np
import pytest

from python.modules.obj3d_v2 import (
    _procrustes_disparity_2d,
    _resample_closed_contour,
    _max_pairwise_distance,
    _compute_paridad_2d_metrics,
)


# ── Generadores de contornos 2D ──────────────────────────────────────────────

def _circle(n=64, r=1.0):
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    return np.column_stack([r * np.cos(t), r * np.sin(t)])


def _ellipse(a, b, n=64):
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    return np.column_stack([a * np.cos(t), b * np.sin(t)])


def _square(n=64):
    s = np.linspace(0, 4, n, endpoint=False)
    pts = []
    for u in s:
        if u < 1:   pts.append([-1 + 2 * u, -1])
        elif u < 2: pts.append([1, -1 + 2 * (u - 1)])
        elif u < 3: pts.append([1 - 2 * (u - 2), 1])
        else:       pts.append([-1, 1 - 2 * (u - 3)])
    return np.array(pts, dtype=np.float64)


def _rs(shape):
    return _resample_closed_contour(shape, n_samples=64)


# ── 1. Rango dinámico de Procrustes ──────────────────────────────────────────

class TestProcrustesDynamicRange:

    def test_identical_shapes_similarity_one(self):
        c = _rs(_circle())
        r = _procrustes_disparity_2d(c, c)
        assert r is not None
        assert r["disparity"] < 1e-9
        assert r["similarity"] > 0.999

    def test_disparity_is_sum_bounded_0_2(self):
        """M² de Procrustes (suma sobre configs de norma unidad) ∈ [0, 2]."""
        r = _procrustes_disparity_2d(_rs(_circle()), _rs(_ellipse(5.0, 0.3)))
        assert r is not None
        assert 0.0 <= r["disparity"] <= 2.0 + 1e-6

    def test_circle_vs_square_below_saturation(self):
        """REGRESIÓN: círculo vs cuadrado ya NO debe salir ~0.999 (saturado)."""
        r = _procrustes_disparity_2d(_rs(_circle()), _rs(_square()))
        assert r is not None
        assert r["similarity"] < 0.95, r["similarity"]

    def test_elongated_ellipse_clearly_dissimilar(self):
        """Un círculo y una elipse muy alargada deben separarse con holgura."""
        r = _procrustes_disparity_2d(_rs(_circle()), _rs(_ellipse(6.0, 0.25)))
        assert r is not None
        assert r["similarity"] < 0.6, r["similarity"]

    def test_similarity_monotonic_with_elongation(self):
        """A mayor elongación respecto al círculo, menor similitud (estricto)."""
        c = _rs(_circle())
        sims = []
        for a, b in [(1.0, 1.0), (1.5, 0.8), (3.0, 0.5), (6.0, 0.25)]:
            r = _procrustes_disparity_2d(c, _rs(_ellipse(a, b)))
            sims.append(r["similarity"])
        assert all(sims[i] > sims[i + 1] for i in range(len(sims) - 1)), sims

    def test_similarity_in_unit_range(self):
        for shp in (_square(), _ellipse(3.0, 0.5), _circle(r=2.0)):
            r = _procrustes_disparity_2d(_rs(_circle()), _rs(shp))
            assert 0.0 <= r["similarity"] <= 1.0 + 1e-9


# ── 2. Diámetro exacto (Feret 3D máximo) ─────────────────────────────────────

class TestMaxPairwiseDistance:

    def test_matches_bruteforce_small(self):
        rng = np.random.default_rng(7)
        V = rng.normal(size=(120, 3))
        diff = V[:, None, :] - V[None, :, :]
        brute = float(np.sqrt((diff ** 2).sum(axis=2)).max())
        assert abs(_max_pairwise_distance(V) - brute) < 1e-9

    def test_captures_extremes_in_large_cluster(self):
        """REGRESIÓN: 2 extremos a ±100 entre 5000 puntos agrupados → diámetro=200.

        El submuestreo aleatorio antiguo descartaba los extremos (daba ~6.8)."""
        rng = np.random.default_rng(1)
        core = rng.normal(0, 1, (5000, 3))
        extremes = np.array([[100.0, 0, 0], [-100.0, 0, 0]])
        V = np.vstack([core, extremes])
        d = _max_pairwise_distance(V)
        assert abs(d - 200.0) < 1e-6, d

    def test_chunk_size_invariant(self):
        rng = np.random.default_rng(3)
        V = rng.normal(size=(700, 3)) * 10.0
        d_small = _max_pairwise_distance(V, chunk=64)
        d_big = _max_pairwise_distance(V, chunk=4096)
        assert abs(d_small - d_big) < 1e-9

    def test_degenerate_inputs(self):
        assert _max_pairwise_distance(np.empty((0, 3))) == 0.0
        assert _max_pairwise_distance(np.array([[1.0, 2.0, 3.0]])) == 0.0


# ── 3. Feret 3D sobre malla real (trimesh) ───────────────────────────────────

trimesh = pytest.importorskip("trimesh")


class TestFeret3DOnMesh:

    def test_box_space_diagonal(self):
        """Feret máximo de una caja = su diagonal espacial √(a²+b²+c²)."""
        a, b, c = 4.0, 3.0, 2.0
        mesh = trimesh.creation.box(extents=[a, b, c])
        out = _compute_paridad_2d_metrics(mesh)
        diag = math.sqrt(a * a + b * b + c * c)
        assert out["feret_3d_max"] is not None
        assert abs(out["feret_3d_max"] - diag) < 1e-6, out["feret_3d_max"]

    def test_box_volumetric_formulas(self):
        """Caja watertight: solidez 3D = 1; Wadell y compacidad 3D ∈ (0,1)."""
        a, b, c = 4.0, 3.0, 2.0
        mesh = trimesh.creation.box(extents=[a, b, c])
        out = _compute_paridad_2d_metrics(mesh)
        assert out["is_watertight"] is True
        assert abs(out["solidity_3d"] - 1.0) < 1e-6           # caja = su propio hull
        assert 0.0 < out["sphericity_wadell"] < 1.0
        assert 0.0 < out["compactness_3d"] <= 1.0 + 1e-9

    def test_sphere_feret_near_diameter(self):
        """Esfera teselada (>600 vértices de hull): Feret máx ≈ 2·r sin submuestreo."""
        r = 5.0
        mesh = trimesh.creation.icosphere(subdivisions=4, radius=r)  # 2562 vértices
        assert mesh.vertices.shape[0] > 600
        out = _compute_paridad_2d_metrics(mesh)
        assert out["feret_3d_max"] is not None
        assert 1.95 * r <= out["feret_3d_max"] <= 2.0 * r + 1e-6, out["feret_3d_max"]

    def test_sphere_wadell_near_one(self):
        """La esfericidad de Wadell de una esfera ≈ 1."""
        mesh = trimesh.creation.icosphere(subdivisions=4, radius=5.0)
        out = _compute_paridad_2d_metrics(mesh)
        assert out["sphericity_wadell"] is not None
        assert out["sphericity_wadell"] > 0.99
