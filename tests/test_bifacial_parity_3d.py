"""
Fase 5: Tests de paridad bifacial 3D.

Verifican que el motor canónico de raster (`rasterize_canonical_contour`)
combinado con el módulo `metrics.calculate` produce resultados consistentes
y estables tanto entre:
  - El helper directo (camino tarjetas Ruta B, pipeline 2D con `_canonicalRaster`).
  - El endpoint refactorizado `/api/obj3d/contour-analyze` (camino modal Ruta A,
    refactorizado en Fase 4 para delegar en el helper).

Y a través de las dos caras de un objeto bifacial sintético (anverso/reverso
idénticos → métricas idénticas; reverso reflejado → invariantes preservadas).
"""

import asyncio
import json
import math
from typing import List, Sequence

import numpy as np
import pytest
from fastapi.testclient import TestClient

from python.modules.obj3d_canonical_raster import rasterize_canonical_contour
from python.modules import metrics as metrics_mod
from python.server import app


# ─── Tolerancias ────────────────────────────────────────────────────────────
TOL_REL_METRIC      = 1e-9   # helper directo == endpoint (deben coincidir bit a bit)
TOL_PARITY_AREA_PCT = 3.0    # paridad raster vs input (helper)
TOL_PARITY_PERIM_PCT = 4.0
TOL_BIFACIAL_IDENT  = 1e-9   # cara anverso == cara reverso (mismo contorno)
TOL_MIRROR_INVAR    = 1e-9   # área/perímetro invariantes ante reflexión


# ─── Helpers de geometría ───────────────────────────────────────────────────

def _square_mm(side: float) -> List[List[float]]:
    return [[0.0, 0.0], [side, 0.0], [side, side], [0.0, side]]


def _regular_polygon_mm(n: int, r: float, cx: float = 0.0, cy: float = 0.0) -> List[List[float]]:
    return [
        [cx + r * math.cos(2 * math.pi * i / n),
         cy + r * math.sin(2 * math.pi * i / n)]
        for i in range(n)
    ]


def _mirror_x(pts: Sequence[Sequence[float]]) -> List[List[float]]:
    """Refleja sobre el eje vertical (x → -x). Invierte orientación."""
    xs = [p[0] for p in pts]
    cx_max = max(xs)
    return [[cx_max - p[0], p[1]] for p in pts]


# ─── Fixtures ───────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture(scope="module")
def event_loop():
    """Loop dedicado para llamadas async a `metrics.calculate`."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# ─── Tests ──────────────────────────────────────────────────────────────────

class TestHelperParity:
    """El helper canónico debe rasterizar dentro de las tolerancias de paridad."""

    @pytest.mark.parametrize("pts,case", [
        (_square_mm(20.0),                 "square_20"),
        (_square_mm(40.0),                 "square_40"),
        (_regular_polygon_mm(16, 15.0),    "hexadecagon_r15"),
        (_regular_polygon_mm(64, 25.0),    "circle_r25_n64"),
    ])
    def test_raster_parity(self, pts, case):
        raster = rasterize_canonical_contour(pts, dpi=20, padding_px=10)
        assert raster["parity_error_area_pct"]      < TOL_PARITY_AREA_PCT,  case
        assert raster["parity_error_perimeter_pct"] < TOL_PARITY_PERIM_PCT, case


class TestEndpointHelperEquivalence:
    """El endpoint refactorizado (Fase 4) debe coincidir con el helper directo."""

    def test_square_25mm(self, client, event_loop):
        pts = _square_mm(25.0)

        # Camino A — helper directo + metrics.calculate
        raster = rasterize_canonical_contour(pts, dpi=20, padding_px=10,
                                             background=248, fill=200,
                                             stroke=40, stroke_width=1)
        result_helper = event_loop.run_until_complete(
            metrics_mod.calculate(
                image_bytes=raster["image_png_bytes"],
                contour_points=raster["contour_points_px"],
                scale_px_mm=raster["scale_mm_per_px"],
            )
        )
        mets_helper = result_helper["metricas"]

        # Camino B — endpoint refactorizado
        r = client.post("/api/obj3d/contour-analyze", data={
            "contour_json": json.dumps(pts),
            "mm_per_unit":  "1.0",
            "label":        "parity_25",
        })
        assert r.status_code == 200, r.text
        mets_endpoint = r.json()["metricas"]

        # Comparar el conjunto de claves comunes que son numéricas escalares
        common = set(mets_helper) & set(mets_endpoint)
        scalar_keys = [
            k for k in common
            if isinstance(mets_helper[k],   (int, float))
            and isinstance(mets_endpoint[k], (int, float))
            and not isinstance(mets_helper[k], bool)
        ]
        assert len(scalar_keys) > 20, "Debe haber > 20 métricas escalares comunes"

        mismatches = []
        for k in scalar_keys:
            a = float(mets_helper[k])
            b = float(mets_endpoint[k])
            denom = max(abs(a), abs(b), 1e-12)
            if abs(a - b) / denom > TOL_REL_METRIC:
                mismatches.append((k, a, b))
        assert not mismatches, f"Métricas divergentes helper vs endpoint: {mismatches[:5]}"


class TestBifacialIdentity:
    """Anverso y reverso con contornos idénticos → métricas idénticas."""

    def test_identical_faces(self, client):
        pts = _regular_polygon_mm(32, 18.0)

        r_anv = client.post("/api/obj3d/contour-analyze", data={
            "contour_json": json.dumps(pts), "mm_per_unit": "1.0", "label": "anv",
        })
        r_rev = client.post("/api/obj3d/contour-analyze", data={
            "contour_json": json.dumps(pts), "mm_per_unit": "1.0", "label": "rev",
        })
        assert r_anv.status_code == 200 and r_rev.status_code == 200

        m_anv = r_anv.json()["metricas"]
        m_rev = r_rev.json()["metricas"]
        for k in set(m_anv) & set(m_rev):
            a, b = m_anv[k], m_rev[k]
            if isinstance(a, (int, float)) and isinstance(b, (int, float)) \
               and not isinstance(a, bool):
                denom = max(abs(float(a)), abs(float(b)), 1e-12)
                assert abs(float(a) - float(b)) / denom <= TOL_BIFACIAL_IDENT, (
                    f"Métrica '{k}' diverge entre caras idénticas: {a} vs {b}"
                )


class TestBifacialMirrorInvariants:
    """Reverso = anverso reflejado → área, perímetro y compacidad invariantes."""

    def test_mirror_preserves_scalars(self, client):
        pts_anv = _regular_polygon_mm(16, 12.0)
        pts_rev = _mirror_x(pts_anv)

        r_anv = client.post("/api/obj3d/contour-analyze", data={
            "contour_json": json.dumps(pts_anv), "mm_per_unit": "1.0", "label": "anv",
        })
        r_rev = client.post("/api/obj3d/contour-analyze", data={
            "contour_json": json.dumps(pts_rev), "mm_per_unit": "1.0", "label": "rev_mirror",
        })
        assert r_anv.status_code == 200 and r_rev.status_code == 200

        m_anv = r_anv.json()["metricas"]
        m_rev = r_rev.json()["metricas"]

        # Métricas escalares que deben ser estrictamente invariantes ante reflexión
        invariant_keys = [
            "area_mm2", "perimetro_mm",
            "area_px", "perimetro_px",
            "indiceCompacidad", "indiceCircularidad",
            "indiceRectangularidad",
        ]
        for k in invariant_keys:
            if k not in m_anv or k not in m_rev:
                continue
            a = float(m_anv[k]); b = float(m_rev[k])
            denom = max(abs(a), abs(b), 1e-12)
            assert abs(a - b) / denom <= TOL_MIRROR_INVAR, (
                f"Invariante '{k}' rota tras reflexión: {a} vs {b}"
            )


class TestUnitConversion:
    """`mm_per_unit` debe escalar área proporcionalmente al cuadrado del factor."""

    def test_mm_per_unit_scales_area(self, client):
        pts = _square_mm(10.0)   # 10×10 unidades OBJ
        r1 = client.post("/api/obj3d/contour-analyze", data={
            "contour_json": json.dumps(pts), "mm_per_unit": "1.0", "label": "u1",
        })
        r2 = client.post("/api/obj3d/contour-analyze", data={
            "contour_json": json.dumps(pts), "mm_per_unit": "2.0", "label": "u2",
        })
        assert r1.status_code == 200 and r2.status_code == 200

        a1 = r1.json()["_raster_diagnostics"]["area_mm2_input"]
        a2 = r2.json()["_raster_diagnostics"]["area_mm2_input"]
        # mm_per_unit duplicado → área en mm² × 4
        ratio = a2 / a1
        assert abs(ratio - 4.0) < 1e-9, f"Esperado ratio=4 (mm/u doble), obtenido {ratio}"
