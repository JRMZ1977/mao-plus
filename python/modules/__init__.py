"""
MAO Plus — Paquete de módulos Python
Registra qué módulos están implementados y cuáles son stubs.
"""

from python.modules import contour, metrics, morphology, detection, analysis, comparator, scale, ph, persistence, mao_ia_analyzer

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
}


def available_modules() -> list:
    """Módulos cargados correctamente."""
    ok = []
    for name, mod in _MODULES.items():
        try:
            _ = mod.__name__
            ok.append(name)
        except Exception:
            pass
    return ok


def get_capabilities() -> dict:
    """
    Describe el estado de implementación de cada módulo.
    El frontend JS usa esto para decidir qué llamadas enrutar a Python.
    """
    caps = {}
    for name, mod in _MODULES.items():
        caps[name] = getattr(mod, "IMPLEMENTED", False)
    return caps
