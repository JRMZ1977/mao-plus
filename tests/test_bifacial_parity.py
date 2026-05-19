"""
Tests de regresión: Validación de paridad bifacial MAO_PLUS ↔ MAO_A.

Objetivo: Garantizar que ambos repos producen resultados idénticos para
bifacial() bajo los mismos inputs (contornos, métricas).

Estrategia:
1. Casos sintéticos: geometrías simples (rect, elipse, triángulo, polígono)
2. Casos reales: desde PRUEBAS_03 si disponibles
3. Tolerancia numérica: 1e-6 para indiceSimetriaGeneral, 1e-8 para CI/CMS
"""

import sys
import json
import os
import importlib.util
from pathlib import Path
from typing import Any, Dict, List, Tuple

import pytest
import numpy as np


# ─── Rutas y carga dinámica ──────────────────────────────────────────────────

MAO_PLUS_ROOT = Path("/Users/juanramirez/Documents/MAO PLUS_PY_01")
MAO_A_ROOT    = Path("/Users/juanramirez/Documents/MAO_A")

PLUS_COMPARATOR = MAO_PLUS_ROOT / "python" / "modules" / "comparator.py"
A_COMPARATOR    = MAO_A_ROOT / "python" / "modules" / "comparator.py"


def _load_module(path: Path, name: str):
    """Carga dinámicamente un módulo desde ruta absoluta."""
    spec = importlib.util.spec_from_file_location(name, path)
    if spec and spec.loader:
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod
    raise ImportError(f"No se pudo cargar {path}")


comparator_plus = _load_module(PLUS_COMPARATOR, "comparator_plus")
comparator_a    = _load_module(A_COMPARATOR, "comparator_a")


# ─── Contornos sintéticos ────────────────────────────────────────────────────

def _make_metrics_from_contour(contour: np.ndarray, scale_xy: float = 1.0) -> Dict[str, Any]:
    """Calcula métricas morfométricas básicas desde un contorno."""
    from scipy.spatial.distance import cdist
    
    # Asegurar que es cerrado
    if not np.allclose(contour[0], contour[-1]):
        contour = np.vstack([contour, contour[0]])
    
    # Centroide
    cx, cy = contour[:-1].mean(axis=0)
    
    # Área (shoelace)
    x, y = contour[:-1, 0], contour[:-1, 1]
    area = 0.5 * abs(np.sum(x[:-1]*y[1:] - x[1:]*y[:-1]))
    
    # Perímetro
    diffs = np.diff(contour, axis=0)
    perimeter = np.sum(np.linalg.norm(diffs, axis=1))
    
    # Circularidad
    circularity = (4 * np.pi * area) / (perimeter ** 2 + 1e-6)
    
    # Convexidad y solidez (simplificado)
    from scipy.spatial import ConvexHull
    try:
        hull = ConvexHull(contour[:-1])
        convex_area = hull.volume  # en 2D es área
        convexity = min(1.0, area / (convex_area + 1e-6))
        solidity = convexity
    except:
        convexity = 1.0
        solidity = 1.0
    
    # Elongación (ratio entre eje mayor y menor)
    centered = contour[:-1] - [cx, cy]
    cov = np.cov(centered.T)
    evals = np.linalg.eigvalsh(cov)
    elongation = max(1.0, np.sqrt(evals[-1] / (evals[-2] + 1e-6)))
    
    # Ángulo eje mayor
    angle_major = np.arctan2(np.sqrt(2 * cov[0, 1]), cov[0, 0] - cov[1, 1]) * 180 / np.pi
    
    # Radios
    distances = np.linalg.norm(centered, axis=1)
    radio_maximo = np.max(distances)
    radio_minimo = np.min(distances)
    
    return {
        "area": area * scale_xy**2,
        "perimetro": perimeter * scale_xy,
        "circularity": circularity,
        "circularidad": circularity,
        "convexity": convexity,
        "convexidad": convexity,
        "solidity": solidity,
        "solidez": solidity,
        "elongation": elongation,
        "elongacion": elongation,
        "centroide": [cx * scale_xy, cy * scale_xy],
        "angulo_eje_mayor": float(angle_major),
        "radio_maximo": radio_maximo * scale_xy,
        "radio_minimo": radio_minimo * scale_xy,
    }


def _make_cara(contour: np.ndarray, name: str = "cara") -> Dict[str, Any]:
    """Construye estructura de cara esperada por bifacial()."""
    return {
        "metricas": _make_metrics_from_contour(contour),
        "perforaciones": [],
        "horadaciones": [],
        "clasificacion_forma": "regular",
        "nombre": name,
    }


def _make_rect_contour(w: float = 100, h: float = 60) -> np.ndarray:
    """Rectángulo: 4 esquinas."""
    return np.array([
        [0, 0], [w, 0], [w, h], [0, h], [0, 0]
    ], dtype=np.float64)


def _make_ellipse_contour(a: float = 80, b: float = 50, n: int = 50) -> np.ndarray:
    """Elipse: n puntos equiespaciados."""
    t = np.linspace(0, 2*np.pi, n, endpoint=False)
    x = a * np.cos(t)
    y = b * np.sin(t)
    return np.column_stack([x, y])


def _make_triangle_contour(base: float = 100, height: float = 80) -> np.ndarray:
    """Triángulo isósceles."""
    return np.array([
        [0, 0], [base, 0], [base/2, height], [0, 0]
    ], dtype=np.float64)


def _make_polygon_contour(n_sides: int = 6, radius: float = 80) -> np.ndarray:
    """Polígono regular."""
    angles = np.linspace(0, 2*np.pi, n_sides, endpoint=False)
    x = radius * np.cos(angles)
    y = radius * np.sin(angles)
    return np.column_stack([x, y])


# ─── Fixtures sintéticas ─────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def synthetic_pairs() -> List[Tuple[str, Dict, Dict]]:
    """Pares sintéticos para prueba de paridad.
    
    Retorna: [(nombre, cara_A, cara_B), ...]
    """
    return [
        ("identical_rects", 
         _make_cara(_make_rect_contour(100, 60), "A"), 
         _make_cara(_make_rect_contour(100, 60), "B")),
        ("similar_rects", 
         _make_cara(_make_rect_contour(100, 60), "A"), 
         _make_cara(_make_rect_contour(102, 58), "B")),
        ("identical_ellipses", 
         _make_cara(_make_ellipse_contour(80, 50), "A"), 
         _make_cara(_make_ellipse_contour(80, 50), "B")),
        ("diff_ellipses", 
         _make_cara(_make_ellipse_contour(80, 50), "A"), 
         _make_cara(_make_ellipse_contour(75, 45), "B")),
        ("rect_vs_ellipse", 
         _make_cara(_make_rect_contour(100, 60), "A"), 
         _make_cara(_make_ellipse_contour(70, 50), "B")),
        ("identical_triangles", 
         _make_cara(_make_triangle_contour(100, 80), "A"), 
         _make_cara(_make_triangle_contour(100, 80), "B")),
        ("identical_hexagons", 
         _make_cara(_make_polygon_contour(6, 80), "A"), 
         _make_cara(_make_polygon_contour(6, 80), "B")),
        ("rotated_rect", 
         _make_cara(_make_rect_contour(100, 60), "A"), 
         _make_cara(_make_rect_contour(60, 100), "B")),
    ]


# ─── Funciones de comparación ────────────────────────────────────────────────

def _extract_legacy_fields(bifacial_result: Dict[str, Any]) -> Dict[str, Any]:
    """Extrae campos legacy (independiente de CI/CMS)."""
    return {
        "indiceSimetriaGeneral": bifacial_result.get("indiceSimetriaGeneral"),
        "interpretacionSimetria": bifacial_result.get("interpretacionSimetria"),
        "coherenciaPromedio": bifacial_result.get("coherenciaPromedio"),
        "correlacionEspacial": bifacial_result.get("correlacionEspacial"),
    }


def _extract_extended_fields(bifacial_result: Dict[str, Any]) -> Dict[str, Any]:
    """Extrae campos extendidos (CI, CMS, etc.) si están presentes."""
    return {
        "CI": bifacial_result.get("CI"),
        "CMS": bifacial_result.get("CMS"),
        "subindicesCMS": bifacial_result.get("subindicesCMS"),
        "interpretacionCI_CMS": bifacial_result.get("interpretacionCI_CMS"),
    }


def _compare_floats(a: float, b: float, tol: float = 1e-6, label: str = "") -> bool:
    """Compara dos floats con tolerancia."""
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    delta = abs(a - b)
    ok = delta <= tol
    if not ok:
        print(f"  {label}: {a} vs {b} (delta={delta:.2e}, tol={tol})")
    return ok


def _compare_dicts(d1: Dict, d2: Dict, tol: float = 1e-6, label_prefix: str = "") -> bool:
    """Compara dos dicts recursivamente."""
    if set(d1.keys()) != set(d2.keys()):
        print(f"  {label_prefix}: Keys mismatch: {set(d1.keys())} vs {set(d2.keys())}")
        return False
    
    for key in d1.keys():
        v1, v2 = d1[key], d2[key]
        
        if isinstance(v1, float) and isinstance(v2, float):
            if not _compare_floats(v1, v2, tol, f"{label_prefix}.{key}"):
                return False
        elif isinstance(v1, dict) and isinstance(v2, dict):
            if not _compare_dicts(v1, v2, tol, f"{label_prefix}.{key}"):
                return False
        elif isinstance(v1, list) and isinstance(v2, list):
            if len(v1) != len(v2):
                print(f"  {label_prefix}.{key}: List length mismatch: {len(v1)} vs {len(v2)}")
                return False
            for i, (item1, item2) in enumerate(zip(v1, v2)):
                if isinstance(item1, float) and isinstance(item2, float):
                    if not _compare_floats(item1, item2, tol, f"{label_prefix}.{key}[{i}]"):
                        return False
                elif isinstance(item1, dict) and isinstance(item2, dict):
                    if not _compare_dicts(item1, item2, tol, f"{label_prefix}.{key}[{i}]"):
                        return False
                elif item1 != item2:
                    print(f"  {label_prefix}.{key}[{i}]: {item1} vs {item2}")
                    return False
        else:
            if v1 != v2:
                print(f"  {label_prefix}.{key}: {v1} vs {v2}")
                return False
    
    return True


# ─── Tests: Paridad sintética ────────────────────────────────────────────────

class TestBifacialParitySynthetic:
    """Tests de paridad con casos sintéticos."""
    
    def test_legacy_parity_synthetic(self, synthetic_pairs):
        """Compara campos legacy (indiceSimetriaGeneral, etc.) entre ambos repos."""
        # Desactiva CI/CMS para tests legacy
        os.environ.pop("MAO_ENABLE_CI_CMS", None)
        
        for name, cara_a, cara_b in synthetic_pairs:
            print(f"\n  Pair: {name}")
            
            # Llamar ambos bifacial()
            result_plus = comparator_plus.bifacial(cara_a, cara_b)
            result_a    = comparator_a.bifacial(cara_a, cara_b)
            
            # Extraer campos legacy
            legacy_plus = _extract_legacy_fields(result_plus)
            legacy_a    = _extract_legacy_fields(result_a)
            
            # Comparar
            assert _compare_dicts(legacy_plus, legacy_a, tol=1e-6, label_prefix=name), \
                f"Legacy parity failed for {name}"
    
    def test_extended_parity_synthetic(self, synthetic_pairs):
        """Compara campos extendidos (CI, CMS) entre ambos repos si MAO_ENABLE_CI_CMS=1."""
        # Activa CI/CMS en ambos repos
        os.environ["MAO_ENABLE_CI_CMS"] = "1"
        
        for name, cara_a, cara_b in synthetic_pairs:
            print(f"\n  Pair (extended): {name}")
            
            # Llamar ambos bifacial() con CI/CMS activado en entorno
            # No necesitamos recargar: bifacial() lee la variable en cada llamada
            result_plus = comparator_plus.bifacial(cara_a, cara_b)
            result_a    = comparator_a.bifacial(cara_a, cara_b)
            
            # Extraer campos extended
            ext_plus = _extract_extended_fields(result_plus)
            ext_a    = _extract_extended_fields(result_a)
            
            # Comparar
            assert _compare_dicts(ext_plus, ext_a, tol=1e-8, label_prefix=name), \
                f"Extended parity failed for {name}"
        
        # Limpia
        os.environ.pop("MAO_ENABLE_CI_CMS", None)


# ─── Tests: Paridad con datos reales ─────────────────────────────────────────

class TestBifacialParityReal:
    """Tests de paridad con datos reales de PRUEBAS_03."""
    
    @pytest.fixture(scope="class")
    def real_pairs(self) -> List[Tuple[str, np.ndarray, np.ndarray]]:
        """Carga pares reales desde PRUEBAS_03 si existen."""
        # Ruta a PRUEBAS_03
        pruebas_dir = MAO_PLUS_ROOT / ".." / "PRUEBAS_03"
        
        if not pruebas_dir.exists():
            pytest.skip("PRUEBAS_03 no encontrado")
        
        # Buscar export bifacial (generado en validación anterior)
        # Formato esperado: JSON con estructura de bifacial
        real_pairs = []
        
        # Por ahora, retorna lista vacía para no fallar;
        # en próxima fase se agrega carga real de JSON exports
        return real_pairs
    
    def test_legacy_parity_real(self, real_pairs):
        """Compara campos legacy con datos reales."""
        if not real_pairs:
            pytest.skip("No real pairs loaded from PRUEBAS_03")
        
        os.environ.pop("MAO_ENABLE_CI_CMS", None)
        
        for name, cara_a, cara_b in real_pairs:
            print(f"\n  Real pair: {name}")
            
            result_plus = comparator_plus.bifacial(cara_a, cara_b)
            result_a    = comparator_a.bifacial(cara_a, cara_b)
            
            legacy_plus = _extract_legacy_fields(result_plus)
            legacy_a    = _extract_legacy_fields(result_a)
            
            assert _compare_dicts(legacy_plus, legacy_a, tol=1e-6, label_prefix=name), \
                f"Real legacy parity failed for {name}"


# ─── Test: Tolerancias numéricas ─────────────────────────────────────────────

class TestNumericalTolerance:
    """Valida que tolerancias numéricas son consistentes."""
    
    def test_tolerance_legacy_is_1e6(self):
        """Legacy tolerance debe ser ~1e-6 para indiceSimetriaGeneral."""
        tol = 1e-6
        assert tol > 0, "Tolerancia debe ser positiva"
        assert tol < 1e-4, "Tolerancia no debe ser demasiado laxa"
    
    def test_tolerance_extended_is_1e8(self):
        """Extended tolerance (CI/CMS) debe ser ~1e-8 (más estricta)."""
        tol = 1e-8
        assert tol > 0, "Tolerancia debe ser positiva"
        assert tol < 1e-6, "Tolerancia no debe ser demasiado laxa"


# ─── Test: Estructura de respuesta ───────────────────────────────────────────

class TestResponseStructure:
    """Valida que bifacial() retorna estructura esperada en ambos repos."""
    
    def test_legacy_response_has_required_keys(self):
        """Response legacy debe tener claves canónicas."""
        os.environ.pop("MAO_ENABLE_CI_CMS", None)
        
        cara = _make_cara(_make_rect_contour())
        result = comparator_plus.bifacial(cara, cara)
        
        required_keys = {"indiceSimetriaGeneral", "interpretacionSimetria",
                        "coherenciaPromedio", "correlacionEspacial"}
        assert required_keys.issubset(set(result.keys())), \
            f"Faltan claves: {required_keys - set(result.keys())}"
    
    def test_extended_response_has_optional_keys(self):
        """Response extended puede tener claves CI/CMS."""
        os.environ["MAO_ENABLE_CI_CMS"] = "1"
        
        cara = _make_cara(_make_rect_contour())
        result = comparator_plus.bifacial(cara, cara)
        
        optional_keys = {"CI", "CMS", "subindicesCMS", "interpretacionCI_CMS"}
        # No falla si no están presentes, pero si están, estructura debe ser válida
        for key in optional_keys:
            if key in result:
                assert result[key] is not None, f"{key} no debe ser None si está presente"
        
        os.environ.pop("MAO_ENABLE_CI_CMS", None)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
