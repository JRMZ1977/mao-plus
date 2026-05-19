"""
MAO Plus — Paquete de módulos Python
Registra qué módulos están implementados y cuáles son stubs.
"""

from python.modules import contour, metrics, morphology, detection, analysis, comparator, scale, ph, persistence, mao_ia_analyzer, obj3d, efa

try:
    from python.modules import classifier
except ImportError:
    classifier = None

# ── Registro de capacidades ─────────────────────────────────────────────────

_MODULES = {
    "detection":       detection,
    "contour":         contour,
    "metrics":         metrics,
    "morphology":      morphology,
    "analysis":        analysis,
    "comparator":      comparator,
    "scale":           scale,
    "ph":              ph,
    "persistence":     persistence,
    "mao_ia_analyzer": mao_ia_analyzer,
    "obj3d":           obj3d,
    "efa":             efa,
    "classifier":      classifier,
}


def available_modules() -> list:
    """Módulos cargados correctamente."""
    ok = []
    for name, mod in _MODULES.items():
        try:
            if mod is None:
                continue
            _ = mod.__name__
            ok.append(name)
        except Exception:
            pass
    return ok


# ── Registro de módulos que fallaron al importar (re-intento aislado) ──────
_FAILED: dict = {}


def _scan_failed_modules() -> None:
    """Re-importa cada módulo opcional en aislamiento para capturar errores
    de importación sin romper el arranque del servidor. Pobla _FAILED con
    pares {nombre: 'TipoError: mensaje'}."""
    import importlib
    candidates = (
        "detection", "contour", "metrics", "morphology", "analysis",
        "comparator", "scale", "ph", "persistence",
        "mao_ia_analyzer", "obj3d", "efa", "classifier",
    )
    _FAILED.clear()
    for name in candidates:
        try:
            importlib.import_module(f"python.modules.{name}")
        except Exception as e:  # noqa: BLE001
            _FAILED[name] = f"{type(e).__name__}: {e}"


_scan_failed_modules()


def failed_modules() -> dict:
    """Devuelve los módulos que fallaron al importar y su mensaje."""
    return dict(_FAILED)


def get_capabilities() -> dict:
    """
    Describe el estado de implementación de cada módulo.
    El frontend JS usa esto para decidir qué llamadas enrutar a Python.
    """
    caps = {}
    for name, mod in _MODULES.items():
        if mod is None:
            caps[name] = False
            continue
        caps[name] = getattr(mod, "IMPLEMENTED", False)
    return caps
