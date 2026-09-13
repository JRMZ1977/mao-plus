"""
ADR-017 F3 — enforcement del CABLEADO.

F1 y F2 construyeron la capacidad (módulo + endpoint + 33 tests). F3 la conecta.
El riesgo propio de una fase de cableado no es matemático sino de desconexión:
que el backend sepa calcular algo que nadie le pide, o que la UI muestre un dato
que el CSV no exporta. Esos huecos no los detecta ningún test de cálculo.

Test ESTÁTICO (lee los .js como texto, no ejecuta JS ni levanta el backend),
misma disciplina que `test_coherencia_entrega.py`.

Cubre el gate del ADR:
  · claves en el registro canónico ADR-006,
  · el bridge llama al endpoint real,
  · los 4 estados del chip existen,
  · confirmar/descartar PERSISTE (escritura y lectura del caché de análisis),
  · el CSV exporta lo confirmado — y SÓLO lo confirmado.
"""

import re
from pathlib import Path

from python.modules import morphometric_registry as registry

ROOT = Path(__file__).resolve().parents[2]

BRIDGE     = ROOT / "js" / "python-bridge.js"
ORGANIZER  = ROOT / "js" / "mao-analysis-organizer.js"
CONTRATO   = ROOT / "js" / "mao-deteccion-contract.js"
CORE       = ROOT / "js" / "analysis-core.js"
CSV        = ROOT / "js" / "project-manager.js"
INDEX      = ROOT / "index.html"

CLAVES_CANONICAS = [
    "plantilla_tipo",
    "plantilla_completitud",
    "plantilla_arco_fraccion",
    "plantilla_residuo_rms",
    "plantilla_confianza",
]


def _txt(p: Path) -> str:
    return p.read_text(encoding="utf-8")


# ── Registro canónico (ADR-006) ─────────────────────────────────────────────

def test_claves_en_el_registro_canonico():
    """Sin esto, el comparador y la tabla vuelven a hardcodear nombres (deriva ADR-011)."""
    faltan = [k for k in CLAVES_CANONICAS if k not in registry.REGISTRY]
    assert not faltan, f"claves ADR-017 ausentes del registro canónico: {faltan}"


def test_las_claves_declaran_su_endpoint_propio():
    """
    `fuente_2d` con prefijo `shape_match.` es la señal de que NO viven en
    /api/metrics: el emparejamiento se invoca bajo demanda (~200 ms/plantilla).
    Mismo convenio que `texture.` para GLCM.
    """
    for k in CLAVES_CANONICAS:
        fuente = registry.REGISTRY[k].fuente_2d
        assert fuente and fuente.startswith("shape_match."), (
            f"{k}: fuente_2d = {fuente!r}; se esperaba el prefijo 'shape_match.'"
        )


# ── Bridge → endpoint ───────────────────────────────────────────────────────

def test_el_bridge_llama_al_endpoint_real():
    s = _txt(BRIDGE)
    assert "'/shape-match'" in s, "el bridge no llama a /api/shape-match"
    assert "'/shape-match/templates'" in s, "falta el listado del repertorio"
    assert re.search(r"^\s*shapeTemplate,\s*$", s, re.M), (
        "shapeTemplate no se exporta en el objeto PythonBridge"
    )


def test_el_bridge_no_dispara_el_emparejamiento_sin_backend():
    """Degradación limpia: sin módulo Python activo devuelve null, no revienta."""
    s = _txt(BRIDGE)
    bloque = s[s.index("const shapeTemplate"):s.index("const efa = {")]
    assert "isModuleActive('shape_template')" in bloque


# ── Los cuatro estados del chip ─────────────────────────────────────────────

def test_los_cuatro_estados_existen():
    """
    Gate del ADR: chip en los 4 estados. Que `sin-plantilla` sea un estado propio
    —y no un fallo— es el punto: en lítica NO tener forma ideal subyacente es el
    caso normal, no un error (ADR-017 §7).
    """
    s = _txt(ORGANIZER)
    for estado in ("confirmada", "candidata", "sin-plantilla", "sin-evaluar"):
        assert f"'{estado}'" in s, f"falta el estado '{estado}' en formaEstado/formaChip"
    assert "function formaEstado" in s
    assert "function formaChip" in s


def test_cada_estado_tiene_su_clase_de_chip():
    """El color del chip es ESTADO, no decoración (lenguaje canónico ADR-005)."""
    s = _txt(ORGANIZER)
    bloque = s[s.index("function formaChip"):s.index("var _evaluando")]
    for cls in ("laar-chip--ok", "laar-chip--wa", "laar-chip--none"):
        assert cls in bloque, f"formaChip no usa {cls}"


def test_los_dos_chips_de_la_cabecera_usan_selectores_acotados():
    """
    La cabecera tiene DOS `.laar-chip` (P/H y forma) y `set()` resuelve con
    querySelector: un selector sin acotar escribiría siempre en el primero.
    """
    s = _txt(ORGANIZER)
    assert "'.adr2-h-ph .laar-chip'" in s, "el chip de P/H quedó sin acotar"
    assert "'.adr2-h-plantilla .laar-chip'" in s, "el chip de forma quedó sin acotar"
    assert "set('.laar-chip'," not in s, "queda un selector de chip sin acotar"


# ── Persistencia de la decisión humana ──────────────────────────────────────

def test_la_decision_se_escribe_y_se_relee_del_cache():
    """
    Gate del ADR: «confirmar/descartar persiste». Sin las dos mitades, la
    confirmación se perdería en el siguiente render y habría que volver a pagar
    los ~200 ms del emparejamiento.
    """
    s = _txt(CORE)
    assert "plantillaConfirmada: obj.plantillaConfirmada" in s, "no se ESCRIBE en el caché"
    assert "obj.plantillaConfirmada = metricasCached.plantillaConfirmada" in s, (
        "no se RELEE del caché"
    )
    assert "obj.plantillaCandidata = metricasCached.plantillaCandidata" in s
    assert "metricasCached.plantillaEvaluada" in s


def test_el_contrato_distingue_hipotesis_de_hecho():
    """
    Mismo principio que ADR-009 con P/H: el candidato y lo confirmado son campos
    distintos. Confundirlos sería leer una conjetura como medición.
    """
    s = _txt(CONTRATO)
    assert "plantilla_confirmada:" in s
    assert "plantilla_evaluada:" in s
    assert "obj.plantillaConfirmada" in s


# ── Superficie de exportación ───────────────────────────────────────────────

def test_el_csv_exporta_lo_confirmado():
    s = _txt(CSV)
    assert "metricas.plantilla_tipo" in s, "el CSV no exporta la plantilla confirmada"
    assert "metricas.plantilla_completitud" in s


def test_el_csv_no_exporta_candidatos_sin_confirmar():
    """
    Invariante ADR-009/ADR-017: el CSV es un registro, no una conjetura. Sólo el
    usuario puede convertir un candidato en dato, y `sincronizarMetricasPlantilla`
    es el único punto donde eso ocurre.
    """
    assert "plantillaCandidata" not in _txt(CSV), (
        "el CSV está leyendo el candidato sin confirmar"
    )
    org = _txt(ORGANIZER)
    bloque = org[org.index("function sincronizarMetricasPlantilla"):]
    bloque = bloque[:bloque.index("function buildSecForma")]
    assert "obj.plantillaConfirmada" in bloque
    assert "plantillaCandidata" not in bloque, (
        "la sincronización a métricas está leyendo el candidato, no lo confirmado"
    )


# ── Caché del navegador ─────────────────────────────────────────────────────

def test_cache_bust_de_los_archivos_tocados():
    """
    Gotcha permanente del repo: el `file://` cachea entre relanzamientos. Un JS
    editado sin bump de `?v=` simplemente no se carga (CLAUDE.md).
    """
    s = _txt(INDEX)
    for archivo in ("analysis-core.js", "project-manager.js",
                    "mao-analysis-organizer.js", "mao-deteccion-contract.js",
                    "python-bridge.js"):
        assert re.search(re.escape(archivo) + r"\?v=\d{8}[a-z]", s), (
            f"{archivo} se referencia sin cache-bust `?v=`"
        )


# ── Contratos con el resto del código (la clase de bug propia del cableado) ──

def test_usa_los_campos_de_contorno_que_existen_de_verdad():
    """
    Los nombres de campo son el fallo típico de una fase de cableado: se escriben
    de memoria, nadie los ejecuta, y el botón queda muerto en silencio. Los
    canónicos los fija `analysis-core.js` al cachear el contorno.
    """
    org = _txt(ORGANIZER)
    core = _txt(CORE)
    assert "obj.contour_data && obj.contour_data.points" in org
    assert "obj.contour_data = contornoData" in core, (
        "cambió el campo canónico del contorno en analysis-core.js"
    )
    assert "obj.contour_points = contornoData" in core
    # Nombres que NO existen y que es fácil escribir por inercia.
    for inventado in ("obj.contorno.points", "obj.contourPoints", "obj.puntos_contorno"):
        assert inventado not in org, f"{inventado} no existe en el modelo de objeto"


def test_las_llamadas_a_toast_respetan_la_firma():
    """
    `MaoOrganizer.toast(kind, msg)` — con los argumentos invertidos no lanza: hace
    `window.toast[mensaje]`, que no es función, y el aviso se pierde en silencio.
    Los tipos válidos son los de `window.toast`.
    """
    org = _txt(ORGANIZER)
    llamadas = re.findall(r"MO\.toast\(\s*('[^']*')", org)
    assert llamadas, "no se encontraron llamadas a MO.toast"
    validos = {"'success'", "'error'", "'warning'", "'info'"}
    malas = [c for c in llamadas if c not in validos]
    assert not malas, f"primer argumento de MO.toast debe ser el TIPO, no el mensaje: {malas}"

