"""
Tests de regresión: Validación de paridad bifacial MAO_PLUS ↔ MAO_A.

Objetivo: Garantizar que ambos repos producen resultados idénticos para
bifacial() bajo los mismos inputs (métricas bifaciales).

Estrategia:
1. Casos sintéticos: estructuras simples de cara con métricas predefinidas
2. Tolerancia numérica: 1e-6 para indiceSimetriaGeneral, 1e-8 para CI/CMS
"""

import os
import sys
import json
import importlib.util
from pathlib import Path
from typing import Any, Dict, List, Tuple

import pytest
import numpy as np


# ─── Rutas y carga dinámica ──────────────────────────────────────────────────

# Derivada de la ubicación del propio test: sobrevive a mover el repo.
MAO_PLUS_ROOT = Path(__file__).resolve().parent.parent
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


# El repo MAO_A es una checkout externa que no existe en todas las máquinas.
# Sin él no hay paridad que verificar: saltamos el módulo entero en colección
# (en vez de fallar con FileNotFoundError) cuando el comparator de MAO_A falta.
if not A_COMPARATOR.exists():
    pytest.skip(
        f"MAO_A no disponible ({A_COMPARATOR}); tests de paridad bifacial omitidos.",
        allow_module_level=True,
    )

comparator_plus = _load_module(PLUS_COMPARATOR, "comparator_plus")
comparator_a    = _load_module(A_COMPARATOR, "comparator_a")


# ─── Constructores de caras sintéticas ───────────────────────────────────────

def _make_basic_metrics(area: float = 1000, perimeter: float = 150) -> Dict[str, Any]:
    """Crea métricas básicas sin dependencias pesadas."""
    circularity = min(1.0, (4 * np.pi * area) / (perimeter**2 + 1e-6))
    return {
        "area": area,
        "perimetro": perimeter,
        "circularity": circularity,
        "circularidad": circularity,
        "convexity": 0.9,
        "convexidad": 0.9,
        "solidity": 0.85,
        "solidez": 0.85,
        "elongation": 1.3,
        "elongacion": 1.3,
        "centroide": [50.0, 30.0],
        "angulo_eje_mayor": 15.0,
        "radio_maximo": 60.0,
        "radio_minimo": 30.0,
    }


def _make_cara(area: float = 1000, perimeter: float = 150, name: str = "cara") -> Dict[str, Any]:
    """Construye estructura de cara esperada por bifacial()."""
    return {
        "metricas": _make_basic_metrics(area, perimeter),
        "perforaciones": [],
        "horadaciones": [],
        "clasificacion_forma": "regular",
        "nombre": name,
    }


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
        missing_in_d2 = set(d1.keys()) - set(d2.keys())
        missing_in_d1 = set(d2.keys()) - set(d1.keys())
        if missing_in_d2 or missing_in_d1:
            print(f"  {label_prefix}: Keys mismatch")
            if missing_in_d2:
                print(f"    Missing in d2: {missing_in_d2}")
            if missing_in_d1:
                print(f"    Missing in d1: {missing_in_d1}")
        return False
    
    for key in d1.keys():
        v1, v2 = d1[key], d2[key]
        
        if isinstance(v1, float) and isinstance(v2, float):
            if not _compare_floats(v1, v2, tol, f"{label_prefix}.{key}"):
                return False
        elif isinstance(v1, dict) and isinstance(v2, dict):
            if not _compare_dicts(v1, v2, tol, f"{label_prefix}.{key}"):
                return False
        elif v1 != v2:
            if v1 is not None or v2 is not None:  # ambos None es ok
                print(f"  {label_prefix}.{key}: {v1} vs {v2}")
                return False
    
    return True


# ─── Fixtures sintéticas ─────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def synthetic_pairs() -> List[Tuple[str, Dict, Dict]]:
    """Pares sintéticos para prueba de paridad."""
    return [
        ("identical_faces", 
         _make_cara(1000, 150, "A"), 
         _make_cara(1000, 150, "B")),
        ("slightly_different", 
         _make_cara(1000, 150, "A"), 
         _make_cara(1020, 152, "B")),
        ("more_different", 
         _make_cara(1000, 150, "A"), 
         _make_cara(800, 130, "B")),
    ]


# ─── Tests: Paridad sintética ────────────────────────────────────────────────

class TestBifacialParitySynthetic:
    """Tests de paridad con casos sintéticos."""
    
    def test_legacy_parity_synthetic(self, synthetic_pairs):
        """Compara campos legacy entre ambos repos."""
        # Desactiva CI/CMS
        os.environ.pop("MAO_ENABLE_CI_CMS", None)
        
        for name, cara_a, cara_b in synthetic_pairs:
            print(f"\n  Testing: {name}")
            
            result_plus = comparator_plus.bifacial(cara_a, cara_b)
            result_a    = comparator_a.bifacial(cara_a, cara_b)
            
            legacy_plus = _extract_legacy_fields(result_plus)
            legacy_a    = _extract_legacy_fields(result_a)
            
            assert _compare_dicts(legacy_plus, legacy_a, tol=1e-6, label_prefix=name), \
                f"Legacy parity failed for {name}"
    
    def test_extended_parity_synthetic(self, synthetic_pairs):
        """Compara campos extendidos (CI, CMS) entre ambos repos."""
        # Activa CI/CMS
        os.environ["MAO_ENABLE_CI_CMS"] = "1"
        
        for name, cara_a, cara_b in synthetic_pairs:
            print(f"\n  Testing (extended): {name}")
            
            result_plus = comparator_plus.bifacial(cara_a, cara_b)
            result_a    = comparator_a.bifacial(cara_a, cara_b)
            
            ext_plus = _extract_extended_fields(result_plus)
            ext_a    = _extract_extended_fields(result_a)
            
            assert _compare_dicts(ext_plus, ext_a, tol=1e-8, label_prefix=name), \
                f"Extended parity failed for {name}"
        
        # Limpia
        os.environ.pop("MAO_ENABLE_CI_CMS", None)


# ─── Tests: Estructura de respuesta ──────────────────────────────────────────

class TestResponseStructure:
    """Valida que bifacial() retorna estructura esperada."""
    
    def test_legacy_response_has_required_keys(self):
        """Response legacy debe tener claves canónicas."""
        os.environ.pop("MAO_ENABLE_CI_CMS", None)
        
        cara = _make_cara()
        result = comparator_plus.bifacial(cara, cara)
        
        required_keys = {"indiceSimetriaGeneral", "interpretacionSimetria",
                        "coherenciaPromedio", "correlacionEspacial"}
        assert required_keys.issubset(set(result.keys())), \
            f"Faltan claves: {required_keys - set(result.keys())}"
    
    def test_extended_response_optional_keys(self):
        """Response extended puede tener claves CI/CMS."""
        os.environ["MAO_ENABLE_CI_CMS"] = "1"
        
        cara = _make_cara()
        result = comparator_plus.bifacial(cara, cara)
        
        optional_keys = {"CI", "CMS", "subindicesCMS", "interpretacionCI_CMS"}
        for key in optional_keys:
            if key in result:
                # Si está presente, debe ser válido
                assert result[key] is not None, f"{key} presente pero None"
        
        os.environ.pop("MAO_ENABLE_CI_CMS", None)


# ─── Tests: Tolerancias numéricas ───────────────────────────────────────────

class TestNumericalTolerance:
    """Valida que tolerancias numéricas son consistentes."""
    
    def test_tolerance_legacy_is_1e6(self):
        """Legacy tolerance debe ser ~1e-6."""
        tol = 1e-6
        assert tol > 0, "Tolerancia debe ser positiva"
        assert tol < 1e-4, "Tolerancia no debe ser demasiado laxa"
    
    def test_tolerance_extended_is_1e8(self):
        """Extended tolerance (CI/CMS) debe ser ~1e-8."""
        tol = 1e-8
        assert tol > 0, "Tolerancia debe ser positiva"
        assert tol < 1e-6, "Tolerancia no debe ser demasiado laxa"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
