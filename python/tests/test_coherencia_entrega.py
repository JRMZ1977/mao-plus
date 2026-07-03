"""
Test de coherencia inter-superficie — enforcement de la auditoría 2026-07-01.

Verifica que cada superficie de entrega al usuario (panel, tabla/PDF, CSV) consuma
las métricas morfométricas de forma COHERENTE con la matemática del backend:

  1. por su CLAVE CANÓNICA (la que emite `python/modules/metrics.py`),
  2. sin depender de un alias NO canónico como ÚNICA fuente
     (el patrón exacto que causó el bug ADR-016 #2: `parseFloat(metricas.eccentricity) || 0`
      cuando el backend emite `excentricidad` → 0.000 espurio),
  3. sin CONVENCIÓN divergente para la misma clave
     (ADR-016 #3: `regularidad_radial` en escala 0-100 renderizada ×100 → 7156 %).

Es un test ESTÁTICO: lee los .js como texto, no ejecuta JS ni levanta el backend.
Es el enforcement que hoy no existía (category-manifest.js/ADR-011 no está cableado a
ningún renderer; no había ningún test que cruzara superficies). Cierra el hueco de
nivel de CAMPO que el manifiesto de ADR-011 deja explícitamente sin contratar.

Relacionado: ADR-011 (taxonomía canónica), ADR-016 (saneamiento del reporte),
docs/APORTE-MAO-PROTEC2025.md (rigor exigido al instrumento).
"""
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "python" / "modules" / "metrics.py"

# Superficies de entrega al usuario (los generadores que el usuario ve).
SURFACES = {
    "panel": ROOT / "js" / "modules" / "visualization-export.js",
    "tabla": ROOT / "js" / "modules" / "tabla-metricas-completa.js",
    "csv":   ROOT / "js" / "project-manager.js",
}

# Contrato canónico a nivel de CAMPO: clave que emite el backend + aliases que NO
# deben usarse como única fuente. (ADR-011 debería formalizar esto en un manifiesto
# compartido; por ahora vive aquí, junto al enforcement.)
CONTRACT = {
    # Índices de forma (adimensionales, núcleo H de ADR-006)
    "circularidad":       {"canonical": "circularity",        "forbidden": ["circularidad"]},
    "excentricidad":      {"canonical": "excentricidad",      "forbidden": ["eccentricity"]},
    "solidez":            {"canonical": "solidity",           "forbidden": ["solidez"]},
    "convexidad":         {"canonical": "convexity",          "forbidden": ["convexidad"]},
    "elongacion":         {"canonical": "elongation",         "forbidden": ["elongacion"]},
    "compacidad":         {"canonical": "compactness",        "forbidden": ["compacidad"]},
    # Regularidad y simetría
    "regularidad_radial": {"canonical": "regularidad_radial", "forbidden": []},
    "simetria_bilateral": {"canonical": "simetria_bilateral", "forbidden": ["symmetry_bilateral", "bilateral_symmetry"]},
    # Feret (dimensiones invariantes a orientación + ángulos + clasificación)
    "feret_max":          {"canonical": "feret_max",          "forbidden": ["max_feret_diameter"]},
    "feret_min":          {"canonical": "feret_min",          "forbidden": ["min_feret_diameter"]},
    "feret_angulo_max":   {"canonical": "feret_angulo_max",   "forbidden": ["feret_max_angle"]},
    "feret_angulo_min":   {"canonical": "feret_angulo_min",   "forbidden": ["feret_min_angle"]},
    "feret_clasificacion":{"canonical": "feret_clasificacion","forbidden": ["clasificacion_feret"]},
}


def _backend_emitted_keys():
    txt = BACKEND.read_text(encoding="utf-8")
    return set(re.findall(r'm\["([a-z_0-9]+)"\]', txt))


def test_claves_canonicas_las_emite_el_backend():
    """El contrato es honesto: cada clave canónica existe realmente en metrics.py."""
    keys = _backend_emitted_keys()
    faltan = sorted({spec["canonical"] for spec in CONTRACT.values()} - keys)
    assert not faltan, (
        f"Claves declaradas canónicas que metrics.py NO emite: {faltan}. "
        "El contrato apunta a claves inexistentes."
    )


def test_ninguna_superficie_lee_alias_no_canonico_como_unica_fuente():
    """
    ADR-016 #2: leer un alias no canónico SIN la clave canónica en la misma expresión
    produce 0 espurio (el backend nunca puebla ese alias). Se permite el alias solo
    como fallback (`metricas.canonical || metricas.alias`).
    """
    violaciones = []
    for sname, spath in SURFACES.items():
        if not spath.exists():
            continue
        lines = spath.read_text(encoding="utf-8").splitlines()
        for spec in CONTRACT.values():
            canonical = spec["canonical"]
            # La canónica cuenta como presente solo si se LEE con prefijo (metricas./m.),
            # no si su nombre aparece suelto como variable (p. ej. `const excentricidad =`),
            # que era un falso negativo.
            canon_read = re.compile(r'(?:metricas|m)\.' + re.escape(canonical) + r'\b')
            for alias in spec["forbidden"]:
                pat = re.compile(r'(?:metricas|m)\.' + re.escape(alias) + r'\b')
                for i, line in enumerate(lines, 1):
                    if pat.search(line) and not canon_read.search(line):
                        violaciones.append(
                            f"{sname} ({spath.name}:{i}): lee '{alias}' sin la clave "
                            f"canónica '{canonical}' → {line.strip()[:100]}"
                        )
    assert not violaciones, (
        "Lecturas solo-no-canónicas (clase del bug ADR-016 #2):\n  " + "\n  ".join(violaciones)
    )


def test_regularidad_radial_no_se_reescala_por_100():
    """
    ADR-016 #3: `regularidad_radial` ya está en escala 0-100. Multiplicarla por 100 al
    renderizar da 7156 %. La misma clave debe rendirse con la misma convención en todas
    las superficies.
    """
    pat = re.compile(r'regularidad(?:Radial)?\s*\*\s*100', re.IGNORECASE)
    violaciones = []
    for sname, spath in SURFACES.items():
        if not spath.exists():
            continue
        for i, line in enumerate(spath.read_text(encoding="utf-8").splitlines(), 1):
            if pat.search(line):
                violaciones.append(f"{sname} ({spath.name}:{i}): {line.strip()[:100]}")
    assert not violaciones, (
        "regularidad_radial reescalada ×100 (ADR-016 #3):\n  " + "\n  ".join(violaciones)
    )


def test_bounding_box_convierte_px_a_mm_en_el_reporte():
    """
    ADR-016 #1 (regresión): el path IA entrega width/height en px aunque área/Feret estén
    en mm. El reporte debe convertir el BB a mm — tras el fix estructural (Stage B) la
    conversión vive en la fuente única `metric-presenter.js` y el reporte la consume.
    """
    txt = SURFACES["tabla"].read_text(encoding="utf-8")
    assert "conversorBBaMm" in txt, (
        "El reporte no consume el conversor px→mm del BB (metric-presenter.conversorBBaMm); "
        "un BB en px rotulado 'mm' volvería a aparecer."
    )
    presenter = (ROOT / "js" / "modules" / "metric-presenter.js").read_text(encoding="utf-8")
    assert "export function conversorBBaMm" in presenter, (
        "conversorBBaMm no está en la fuente única metric-presenter.js."
    )


def test_rotulos_clasificacion_fuente_unica():
    """
    Fix estructural (ADR-016 2026-07-02): las escaleras de clasificación (rugosidad/curvatura)
    viven en UN solo módulo (`metric-presenter.js`). Si otra superficie re-hardcodea un rótulo,
    reaparece la duplicación que hizo que el rótulo #6 sobreviviera en 4 sitios. Enforce: los
    rótulos canónicos NO deben existir fuera de metric-presenter.js.
    """
    import glob

    labels = [
        "Muy rugoso (contorno de alta variabilidad)",
        "Rugoso (muy irregular)",
        "Muy variable (alta variación de curvatura local)",
    ]
    offenders = []
    for jsfile in glob.glob(str(ROOT / "js" / "**" / "*.js"), recursive=True):
        if "metric-presenter.js" in jsfile or "node_modules" in jsfile:
            continue
        txt = Path(jsfile).read_text(encoding="utf-8", errors="ignore")
        for lab in labels:
            if lab in txt:
                offenders.append(f"{Path(jsfile).name}: '{lab}'")
    assert not offenders, (
        "Rótulos de clasificación re-duplicados fuera de metric-presenter.js (deriva ADR-016):\n  "
        + "\n  ".join(offenders)
    )
