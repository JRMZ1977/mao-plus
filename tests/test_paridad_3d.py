"""Tests para la paridad 2D ↔ 3D: descriptores derivados del convex hull,
esfericidad de Wadell, compacidad, Feret 3D y dimensión fractal box-counting.
"""
import math

import pytest

trimesh = pytest.importorskip("trimesh")

from python.modules.obj3d_v2 import _compute_paridad_2d_metrics


def test_paridad_cubo_unitario():
    cube = trimesh.creation.box(extents=[1.0, 1.0, 1.0])
    m = _compute_paridad_2d_metrics(cube)
    # Sólido convexo y watertight ⇒ solidez y convexidad = 1
    assert m["solidity_3d"] == pytest.approx(1.0, abs=1e-6)
    assert m["convexity_3d"] == pytest.approx(1.0, abs=1e-6)
    # Esfericidad de Wadell de un cubo unitario = π^(1/3)·6^(2/3) / 6 ≈ 0.806
    assert m["sphericity_wadell"] == pytest.approx(0.8059959, abs=1e-3)
    # Diámetro equivalente = (6/π)^(1/3) ≈ 1.2407
    assert m["equivalent_diameter_3d"] == pytest.approx((6.0 / math.pi) ** (1.0 / 3.0), abs=1e-4)
    # Aspect ratio 1:1:1
    assert m["aspect_ratio_3d_max_min"] == pytest.approx(1.0, abs=1e-6)
    # Feret max del cubo = diagonal = √3
    assert m["feret_3d_max"] == pytest.approx(math.sqrt(3.0), abs=1e-3)
    # Feret min del cubo = lado = 1
    assert m["feret_3d_min"] == pytest.approx(1.0, abs=1e-3)


def test_paridad_esfera_unitaria():
    sph = trimesh.creation.icosphere(subdivisions=4, radius=1.0)
    m = _compute_paridad_2d_metrics(sph)
    # Esfera ⇒ esfericidad de Wadell ≈ 1 (con teselado fino casi exacto)
    assert m["sphericity_wadell"] == pytest.approx(1.0, abs=2e-2)
    # Compacidad 3D adimensional de una esfera = 1
    assert m["compactness_3d"] == pytest.approx(1.0, abs=5e-2)
    # Aspect ratio cercano a 1
    assert m["aspect_ratio_3d_max_min"] == pytest.approx(1.0, abs=1e-2)


def test_paridad_caja_alargada_aspect_ratio():
    box = trimesh.creation.box(extents=[4.0, 2.0, 1.0])
    m = _compute_paridad_2d_metrics(box)
    assert m["aspect_ratio_3d_max_min"] == pytest.approx(4.0, abs=1e-6)
    assert m["aspect_ratio_3d_max_mid"] == pytest.approx(2.0, abs=1e-6)
    # Convex hull de una caja = la propia caja ⇒ solidez = 1
    assert m["solidity_3d"] == pytest.approx(1.0, abs=1e-6)


def test_paridad_fractal_en_rango_fisico():
    cube = trimesh.creation.box(extents=[1.0, 1.0, 1.0])
    m = _compute_paridad_2d_metrics(cube)
    fd = m["fractal_dimension_3d"]
    assert fd is not None
    # voxelized voxeliza la cáscara; para una superficie embebida en 3D
    # la dimensión box-counting está cerca de 2, dentro de [1, 3].
    assert 1.0 <= fd <= 3.0
    assert m["fractal_method"] == "voxel_box_counting_3scales"


def test_paridad_keys_completas():
    cube = trimesh.creation.box(extents=[1.0, 1.0, 1.0])
    m = _compute_paridad_2d_metrics(cube)
    expected = {
        "convex_hull_area", "convex_hull_volume",
        "solidity_3d", "convexity_3d",
        "sphericity_wadell", "compactness_3d", "equivalent_diameter_3d",
        "feret_3d_max", "feret_3d_min", "feret_3d_ratio",
        "aspect_ratio_3d_max_min", "aspect_ratio_3d_max_mid",
        "fractal_dimension_3d", "fractal_method", "is_watertight",
    }
    assert expected.issubset(set(m.keys()))
