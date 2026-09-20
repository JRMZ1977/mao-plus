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
    # Concavidad frente al hull (ADR-017 F0 — antes rotulada «pérdida por
    # fragmentación»). El nombre viejo sigue emitiéndose como alias deprecado,
    # así que sólo puede leerse ACOMPAÑADO de la clave canónica.
    "concavidad_area":    {"canonical": "concavidad_area_percent",
                           "forbidden": ["perdida_area_fragmentacion_percent"]},
    "concavidad_perim":   {"canonical": "concavidad_perimetro_percent", "forbidden": []},
    "indice_convexidad":  {"canonical": "indice_convexidad_percent",    "forbidden": []},
}

# ADR-017 F0 — claves RETIRADAS: medían cobertura angular degenerada (≈360° en
# todo contorno cerrado) o extent rebautizado, no completitud. Ninguna superficie
# debe volver a leerlas ni el backend a emitirlas. Vuelven en F1 bajo
# `plantilla_completitud`, calculada por ajuste de plantilla al margen original.
RETIRADAS_F0 = [
    "completitud_estimada",
    "completitud_es_fragmento",
    "completitud_metodo_angular",
    "completitud_metodo_convexidad",
    "completitud_tipo_fragmento",
    "completitud_cobertura_grados",
    "perdida_perimetro_fragmentacion_percent",
]


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
    ADR-016 #1 (regresión): la ruta de detección asistida entrega width/height en px aunque área/Feret estén
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
        # ADR-018 — la solidez se suma al enforcement. Tenía TRES escaleras:
        # metrics.py, analysis-core.js y mao-ia.js (esta última con umbrales
        # propios 0.90/0.75/0.55), así que la misma pieza recibía rótulos
        # distintos según la vía por la que se analizara.
        "Sin concavidades (ocupa su envolvente)",
        "Contorno muy entrante (área muy inferior a su envolvente)",
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


# ═══════════════════════════════════════════════════════════════════════════════
# ADR-019 — el índice canónico vive en el manifiesto, y sólo ahí
# ═══════════════════════════════════════════════════════════════════════════════

MANIFEST = ROOT / "js" / "modules" / "category-manifest.js"

# Entradas del manifiesto, extraídas del literal `{ id: '…', titulo: '…', orden: N, indice: '…', tipo: '…' }`.
_ENTRY_RE = re.compile(
    r"\{\s*id:\s*'(?P<id>[a-z0-9_]+)',\s*"
    r"titulo:\s*'(?P<titulo>[^']*)',\s*"
    r"orden:\s*(?P<orden>\d+),\s*"
    r"indice:\s*'(?P<indice>[^']*)',\s*"
    r"tipo:\s*'(?P<tipo>[a-z]+)'"
)


def _manifest_entries():
    txt = MANIFEST.read_text(encoding="utf-8")
    entries = [m.groupdict() for m in _ENTRY_RE.finditer(txt)]
    assert entries, "No se pudo parsear ninguna entrada de category-manifest.js"
    return entries


def test_manifiesto_indice_contiguo_y_unico():
    """
    ADR-019: el manifiesto es la fuente ÚNICA de orden e índice. Ids únicos, `orden`
    contiguo desde 1 (el array ES el orden de render) e `indice` romano único y no
    vacío. Sin esto reaparecen las colisiones que motivaron el ADR: `XII-a` rotulando
    dos secciones distintas y la Tabla emitiendo II → VIII → III.
    """
    entries = _manifest_entries()

    ids = [e["id"] for e in entries]
    assert len(ids) == len(set(ids)), f"ids duplicados en el manifiesto: {ids}"

    indices = [e["indice"] for e in entries]
    assert all(indices), "hay entradas con `indice` vacío"
    assert len(indices) == len(set(indices)), (
        "índices romanos duplicados: "
        + str([i for i in indices if indices.count(i) > 1])
    )

    ordenes = [int(e["orden"]) for e in entries]
    assert ordenes == list(range(1, len(entries) + 1)), (
        f"`orden` no es contiguo desde 1: {ordenes}"
    )

    tipos = {e["tipo"] for e in entries}
    assert tipos <= {"estructural", "factual", "comparativa"}, f"tipos inválidos: {tipos}"


def test_manifiesto_abre_con_procedencia():
    """
    ADR-019 (decisión JFRR): el informe declara sus condiciones de producción antes que
    sus resultados. Detección primero, error óptico e incertidumbre inmediatamente
    después, y sólo entonces las métricas morfométricas.
    """
    entries = _manifest_entries()
    assert [e["id"] for e in entries[:3]] == ["deteccion", "error_optico", "incertidumbre"], (
        "El manifiesto ya no abre con la procedencia (detección → error óptico → "
        f"incertidumbre); abre con {[e['id'] for e in entries[:3]]}"
    )


def test_las_comparativas_van_al_final():
    """
    Las categorías `comparativa` son condicionales por naturaleza (requieren otra cara
    o P/H). Si se intercalan entre las estructurales, el índice deja de ser contiguo
    en cuanto una falta. Deben ocupar la cola.
    """
    entries = _manifest_entries()
    tipos = [e["tipo"] for e in entries]
    primera_comparativa = tipos.index("comparativa") if "comparativa" in tipos else len(tipos)
    assert all(t == "comparativa" for t in tipos[primera_comparativa:]), (
        "Hay categorías estructurales/factuales DESPUÉS de una comparativa: "
        f"{[e['id'] for e in entries[primera_comparativa:] if e['tipo'] != 'comparativa']}"
    )


def test_ninguna_superficie_hardcodea_el_indice_romano():
    """
    El enforcement que da sentido a todo lo anterior: si una superficie vuelve a
    escribir el numeral a mano en su HTML, el manifiesto deja de ser la fuente única y
    el índice se desincroniza en silencio (que es exactamente lo que pasó entre
    `tabla-metricas-completa.js` y la copia de `analysis-core.js`).

    Detecta el patrón de rótulo de sección: un romano seguido de punto y de un título
    en mayúsculas dentro de un literal de plantilla.
    """
    import glob

    # `>` o inicio de línea, romano, punto, espacio, y un título que empieza en mayúscula.
    patron = re.compile(
        r"(?:^|>)\s*(?P<num>[IVX]{1,6}(?:-[A-Za-z])?)\.\s+(?P<tit>[A-ZÁÉÍÓÚÑ][^<\n{$]{4,60})",
        re.MULTILINE,
    )

    offenders = []
    for jsfile in sorted(glob.glob(str(ROOT / "js" / "**" / "*.js"), recursive=True)):
        name = Path(jsfile).name
        if name == "category-manifest.js" or "node_modules" in jsfile:
            continue
        txt = Path(jsfile).read_text(encoding="utf-8", errors="ignore")
        for m in patron.finditer(txt):
            linea = txt[: m.start()].count("\n") + 1
            offenders.append(f"{name}:{linea} → '{m.group('num')}. {m.group('tit').strip()}'")

    assert not offenders, (
        "Índice romano hardcodeado fuera de category-manifest.js (ADR-019). "
        "Usar `CategoryManifest.encabezadoDe(id)`:\n  " + "\n  ".join(offenders)
    )


# ═══════════════════════════════════════════════════════════════════════════════
# ADR-018 — rótulos que miden, y área neta publicada
# ═══════════════════════════════════════════════════════════════════════════════

def test_los_rotulos_de_solidez_no_diagnostican_fragmentacion():
    """
    La solidez es A_real / A_hull: mide cuánto de su envolvente convexa ocupa la
    pieza. Baja igual por una fractura que por una morfología naturalmente
    cóncava, así que rotularla «fragmentado» emite un juicio tafonómico que la
    medición no sostiene — y contradice a «XII. Estado de Conservación», que sí
    mide fragmentación a partir del área perdida.

    Es la misma corrección que ADR-016 #6 aplicó a la rugosidad; la solidez había
    quedado fuera de aquella pasada.
    """
    import glob

    fuentes = [ROOT / "python" / "modules" / "metrics.py"]
    fuentes += [Path(f) for f in glob.glob(str(ROOT / "js" / "**" / "*.js"), recursive=True)
                if "node_modules" not in f]

    # Se busca una ASIGNACIÓN de un rótulo con «fragmentad», no una mención. La
    # prosa que explica esta misma corrección —el glosario, este archivo— nombra
    # los rótulos viejos legítimamente; marcarla sería ruido que acaba haciendo
    # que se desactive la prueba.
    asignacion = re.compile(
        r"""solidity_class["']?\]?\s*[:=]\s*["'][^"']*fragmentad""",
        re.IGNORECASE,
    )
    ofensores = []
    for f in fuentes:
        for i, linea in enumerate(f.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
            if asignacion.search(linea):
                ofensores.append(f"{f.relative_to(ROOT)}:{i}  {linea.strip()[:90]}")

    assert not ofensores, (
        "`solidity_class` vuelve a diagnosticar fragmentación (ADR-018):\n  "
        + "\n  ".join(ofensores)
    )


def test_paridad_textual_de_la_escalera_de_solidez():
    """
    El backend mantiene su copia en Python con el MISMO texto que el frontend
    (la consolidación cross-lenguaje completa no es práctica; se mantiene
    paridad). Si divergen, la misma pieza sale rotulada de dos maneras según qué
    superficie la renderice.
    """
    py = (ROOT / "python" / "modules" / "metrics.py").read_text(encoding="utf-8")
    js = (ROOT / "js" / "modules" / "metric-presenter.js").read_text(encoding="utf-8")

    bloque_py = py[py.index('if solidez >= 0.95'):][:800]
    etiquetas_py = re.findall(r'm\["solidity_class"\] = "([^"]+)"', bloque_py)

    bloque_js = js[js.index('export function clasificarSolidez'):][:800]
    etiquetas_js = re.findall(r"return '([^']+)'", bloque_js)

    assert etiquetas_py, "No se pudo leer la escalera de solidez de metrics.py"
    assert etiquetas_py == etiquetas_js, (
        f"Escalera de solidez divergente.\n  Python: {etiquetas_py}\n  JS    : {etiquetas_js}"
    )


def test_el_area_neta_se_publica_junto_a_la_bruta():
    """
    `area_neta` se calculaba y persistía desde hacía tiempo, pero NINGUNA salida
    de lectura la publicaba: el CSV daba el área bruta en «Dimensiones Básicas» y
    los totales de P/H en otra sección, dejando al lector una resta que ni
    siquiera era obviamente la correcta.

    Se exige que vayan JUNTAS en la misma sección: separarlas es lo que hacía
    invisible la distinción entre superficie ocupada y materia efectiva.
    """
    core = (ROOT / "js" / "analysis-core.js").read_text(encoding="utf-8")
    tabla = (ROOT / "js" / "modules" / "tabla-metricas-completa.js").read_text(encoding="utf-8")

    assert "Dimensiones Básicas,Área Neta" in core, (
        "El CSV dejó de publicar el área neta en «Dimensiones Básicas» (ADR-018)"
    )
    assert "Dimensiones Básicas,Área Neta - Nota" in core, (
        "Falta la nota del área neta. Sin ella, «neta = bruta» es ambiguo: no "
        "distingue «la pieza no tiene huecos» de «los tiene sin confirmar»."
    )
    assert "areaNetaDerivados" in tabla, (
        "La Tabla Completa dejó de rendir el área neta (ADR-018)"
    )


# Las SEIS superficies que muestran o exportan el área neta. Se listan explícitas
# para que añadir una nueva obligue a decidir conscientemente si debe entrar aquí.
SUPERFICIES_AREA_NETA = [
    "js/analysis-core.js",                      # CSV monofacial + PDF integral
    "js/modules/tabla-metricas-completa.js",    # Tabla Completa
    "js/modules/visualization-export.js",       # panel de análisis (2 sitios)
    "js/project-manager.js",                    # metricas.csv archivado por pieza
]


def test_el_area_neta_se_deriva_en_un_solo_sitio():
    """
    El derivado canónico es `MetricPresenter.areaNetaDerivados()`. Que cada
    superficie decida por su cuenta cuándo un `area_neta` almacenado es fiable
    reproduce la clase de deriva que ADR-016 vino a cerrar — y aquí importa
    especialmente, porque el criterio de rechazo (neta > bruta ⇒ dato de otra
    escala) es una decisión, no una obviedad.

    Llegó a haber SEIS derivaciones independientes del mismo criterio: CSV, Tabla,
    PDF, dos en el panel y la del propio motor.
    """
    faltan = [
        a for a in SUPERFICIES_AREA_NETA
        if "areaNetaDerivados" not in (ROOT / a).read_text(encoding="utf-8")
    ]
    assert not faltan, (
        "Superficies que muestran área neta sin el derivado canónico:\n  "
        + "\n  ".join(faltan)
    )


def test_el_area_neta_llega_a_todos_los_descargables():
    """
    El área neta se calculaba y persistía desde hacía tiempo; el defecto era de
    PUBLICACIÓN. Cerrarlo en una salida y no en las demás deja al lector
    comparando un informe que la trae con otro que no.

    `metricas.csv` es el caso que más pesaba: lo escribe project-manager en la
    carpeta de cada análisis, así que es el archivo que queda archivado por pieza.
    """
    core = (ROOT / "js" / "analysis-core.js").read_text(encoding="utf-8")
    proy = (ROOT / "js" / "project-manager.js").read_text(encoding="utf-8")

    assert "Dimensiones Básicas,Área Neta" in core, "El CSV monofacial dejó de publicar el área neta"
    assert "02_Dimensiones,Area Neta" in proy, (
        "`metricas.csv` (el archivado por pieza) dejó de publicar el área neta"
    )
    assert "Área neta (mm²) — P/H confirmadas descontadas" in core, (
        "El PDF integral dejó de publicar el área neta en su sección de dimensiones"
    )


def test_el_derivado_consulta_los_dos_hogares_del_area_neta():
    """
    El área neta se guarda en `metricas.area_neta` (sincronización de P/H) o en
    `obj.area_neta` (ruta de exportación), según qué código la escribiera. Una
    superficie que consulte sólo uno muestra «sin P/H confirmados» en piezas que
    sí los tienen — el panel leía únicamente `obj`, y el resto únicamente
    `metricas`.
    """
    mp = (ROOT / "js" / "modules" / "metric-presenter.js").read_text(encoding="utf-8")
    bloque = mp[mp.index("export function areaNetaDerivados"):][:900]
    assert "m.area_neta" in bloque and "o.area_neta" in bloque, (
        "`areaNetaDerivados` dejó de consultar los dos sitios donde puede vivir "
        "el área neta (metricas.area_neta y obj.area_neta)"
    )


def test_claves_retiradas_en_f0_no_regresan():
    """
    ADR-017 F0: las claves de «completitud» medían otra cosa (cobertura angular
    degenerada + extent), y toda pieza redonda íntegra salía «fragmento» — causa
    raíz de ADR-016 #6. Este test impide que vuelvan, al backend o a cualquier
    superficie de entrega.

    Se permite el alias de lectura `perdida_area_fragmentacion_percent` (mismo
    número que `concavidad_area_percent`, deprecado para no romper proyectos ya
    guardados); ese caso lo cubre el contrato de arriba, no esta lista.
    """
    emitidas = _backend_emitted_keys()
    regresadas = sorted(set(RETIRADAS_F0) & emitidas)
    assert not regresadas, (
        f"metrics.py volvió a emitir claves retiradas en ADR-017 F0: {regresadas}"
    )

    violaciones = []
    for sname, spath in SURFACES.items():
        if not spath.exists():
            continue
        for i, line in enumerate(spath.read_text(encoding="utf-8").splitlines(), 1):
            desnuda = line.strip()
            if desnuda.startswith("//") or desnuda.startswith("*"):
                continue   # comentarios explicativos del propio ADR
            for clave in RETIRADAS_F0:
                if re.search(r"(?:metricas|m)\." + re.escape(clave) + r"\b", line):
                    violaciones.append(f"{sname} ({spath.name}:{i}): lee '{clave}'")
    assert not violaciones, (
        "Superficies que leen claves retiradas en ADR-017 F0:\n  " + "\n  ".join(violaciones)
    )
