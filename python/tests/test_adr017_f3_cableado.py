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


# ── F5 · Superposición en el lienzo ─────────────────────────────────────────
#
# Misma disciplina que arriba, y por la misma razón: nada de esto se ejecuta
# hasta que alguien carga una imagen, analiza un objeto y pulsa un botón. Un
# nombre de campo o de evento equivocado no da error: deja la capa muerta.

CSS = ROOT / "css" / "mao-tabs-laar.css"


def test_el_lienzo_llama_a_la_capa_de_plantilla():
    """Sin la llamada dentro de `redraw`, la función existe y no la ejecuta nadie."""
    s = _txt(CORE)
    assert "function dibujarPlantillasIdeales" in s
    cuerpo = s[s.index("function redraw(){"):]
    assert "dibujarPlantillasIdeales();" in cuerpo, (
        "`redraw` no invoca la superposición: la capa quedaría muerta"
    )


def test_la_capa_lee_los_campos_que_el_backend_publica():
    """
    Los nombres vienen del contrato de `shape_template.match()`. Escribirlos de
    memoria fue el fallo nº 1 de F3.
    """
    s = _txt(CORE)
    for campo in ("c.plantilla_contorno", "c.plantilla_contorno_presente",
                  "d.contorno", "d.contorno_presente"):
        assert campo in s, f"la capa del lienzo no lee {campo}"


def test_lo_confirmado_guarda_su_propio_contorno():
    """
    Si lo confirmado dependiera del candidato vivo, una reevaluación con otro
    repertorio dibujaría la decisión humana con la forma de OTRA plantilla.
    """
    s = _txt(ORGANIZER)
    bloque = s[s.index("function confirmarPlantilla"):s.index("function descartarPlantilla")]
    assert "contorno: c.plantilla_contorno" in bloque
    assert "contorno_presente: c.plantilla_contorno_presente" in bloque


def test_el_nombre_del_evento_coincide_en_los_dos_lados():
    """
    El organizer despacha y `analysis-core` escucha. Un nombre distinto en cada
    archivo no lanza: la casilla simplemente no haría nada, sin rastro en consola.
    """
    evento = "mao:plantilla-overlay:toggle"
    org, core = _txt(ORGANIZER), _txt(CORE)
    assert f"CustomEvent('{evento}'" in org, "el organizer no despacha el evento"
    assert f"addEventListener('{evento}'" in core, "el lienzo no escucha el evento"


def test_descartar_y_confirmar_repintan():
    """Una candidata descartada tiene que DESAPARECER del lienzo, no quedarse."""
    s = _txt(ORGANIZER)
    for fn, sig in (("function confirmarPlantilla", "function descartarPlantilla"),
                    ("function descartarPlantilla", "/** Vuelca la decisión")):
        bloque = s[s.index(fn):s.index(sig)]
        assert "pintarLienzo()" in bloque, f"{fn} no repinta el lienzo"


def test_el_violeta_es_el_mismo_en_css_y_en_js():
    """
    La leyenda de la tarjeta dibuja una muestra del color y el lienzo dibuja la
    plantilla: si se despegan, la leyenda estaría señalando otra cosa.
    """
    js = re.search(r"PLANTILLA_COLOR\s*=\s*'(#[0-9a-fA-F]{6})'", _txt(CORE))
    assert js, "no se encuentra PLANTILLA_COLOR en analysis-core.js"
    assert js.group(1).lower() in _txt(CSS).lower(), (
        f"el color {js.group(1)} del lienzo no aparece en la leyenda CSS"
    )


def test_la_superposicion_es_una_pasada_aparte():
    """
    Se dibuja DESPUÉS del bucle de objetos, no dentro de sus ramas. Es lo que
    hace que quitarla sea borrar una línea y no desenredar el ramaje de
    `contornoReal` vs `has_real_contour`.
    """
    s = _txt(CORE)
    cuerpo = s[s.index("function redraw(){"):]
    llamada = cuerpo.index("dibujarPlantillasIdeales();")
    cierre = cuerpo.index("console.log('No se detectaron objetos en la imagen')")
    assert llamada < cierre, "la llamada no está en el bloque de objetos de redraw"
    assert cuerpo.count("dibujarPlantillasIdeales();") == 1
    # La sangría distingue «tras el bucle» (8) de «dentro del bucle» (10): dentro
    # se redibujaría la capa entera una vez por objeto, con coste cuadrático.
    linea = next(l for l in cuerpo.splitlines() if "dibujarPlantillasIdeales();" in l)
    assert len(linea) - len(linea.lstrip()) == 8, (
        f"sangría {len(linea) - len(linea.lstrip())}: la llamada parece estar "
        f"dentro del bucle de objetos, no después"
    )


# ── F5 · Dos defectos que sólo apareció al correr la app de verdad ──────────

def test_las_tarjetas_se_pueden_reconstruir_mas_de_una_vez():
    """
    `partition()` reparte los <h5> por las secciones en la primera pasada. Desde
    entonces `findRoot` —que los exige HERMANOS— devolvía null, `organize` no
    llamaba a los constructores y §P/H y §6 quedaban congeladas en el estado con
    el que nacieron: pulsar «Evaluar completitud» cambiaba el chip de la cabecera
    (que se construye antes de esa compuerta) y la tarjeta seguía ofreciendo
    «Evaluar», sin «Confirmar». **El botón de confirmar no llegaba a existir.**

    Ningún test estático ni `node --check` lo veía: hizo falta pulsar el botón en
    Electron. El rescate es el marcador `.adr2-root` que deja la primera pasada.
    """
    s = _txt(ORGANIZER)
    bloque = s[s.index("function partition"):s.index("function ensureEfaWrapper")]
    assert "adr2-root" in bloque, (
        "partition() no tiene el rescate del root ya particionado: las tarjetas "
        "§P/H y §6 volverían a construirse una sola vez"
    )
    assert bloque.index("findRoot(mm)") < bloque.index("querySelector('.adr2-root')"), (
        "el camino normal (findRoot) debe intentarse primero; el marcador es el respaldo"
    )


def test_la_fila_de_completitud_no_esta_clavada():
    """
    La fila «Completitud» de la tabla legacy quedó con el texto fijo «Sin evaluar»
    desde F0 —cuando no había nada que mostrar— y nadie volvió a ella al cablear
    F3. La tarjeta §6 decía «70 %» y dos centímetros más abajo la tabla seguía
    diciendo «sin evaluar», en la misma pantalla.

    Integración v1.3 (2026-09-15): el duplicado IIFE que corrigió F5 vivía en
    `generarReporteMorfologico`, retirado como código muerto por la auditoría de
    exportación. Pero había MÁS productores vivos con «Sin evaluar» clavado —la
    sección de conservación del PDF batch (otra copia IIFE) y los dos CSV de
    descarga, monofacial y bifacial—. Ahora todos leen la plantilla confirmada a
    través de un lector ÚNICO, `MetricPresenter.completitudPlantilla`, y la copia
    IIFE de la sección se sustituye por la del módulo.
    """
    for archivo in (ROOT / "js" / "modules" / "visualization-export.js",
                    ROOT / "js" / "modules" / "tabla-metricas-completa.js"):
        assert "MetricPresenter.completitudPlantilla(" in _txt(archivo), (
            f"{archivo.name}: la fila de completitud no usa el lector único de la plantilla confirmada"
        )
    core = _txt(CORE)
    assert core.count("MetricPresenter.completitudPlantilla(") >= 2, (
        "analysis-core.js: los CSV monofacial y bifacial deben leer la plantilla confirmada"
    )
    assert not re.search(r"csvLines\s*\+=\s*`Conservación,Completitud,Sin evaluar", core), (
        "el CSV monofacial volvió a clavar «Sin evaluar» sin mirar la plantilla confirmada"
    )
    assert "'Completitud', 'Sin evaluar', 'Sin evaluar'" not in core, (
        "el CSV bifacial volvió a clavar «Sin evaluar» en las dos caras"
    )
    assert not re.search(r"^\s*function generarSeccionFragmentacion\(", core, re.M), (
        "reapareció la copia IIFE de generarSeccionFragmentacion (la del PDF batch debe ser la del módulo)"
    )
    # Y sigue existiendo el texto para cuando NO hay dato: nunca un 100 % fabricado.
    assert "Sin evaluar" in core


def test_solo_lo_confirmado_llega_a_la_fila():
    """
    Invariante ADR-009/ADR-017: la tabla es registro, no conjetura. La fila lee
    `metricas.plantilla_*`, y esas claves sólo las escribe la confirmación humana
    (`sincronizarMetricasPlantilla`), nunca el candidato. El lector único es el
    punto donde se hace cumplir.
    """
    mp = _txt(ROOT / "js" / "modules" / "metric-presenter.js")
    bloque = mp[mp.index("export function completitudPlantilla"):]
    bloque = bloque[:bloque.index("\n}\n")]
    assert "m.plantilla_completitud" in bloque, "el lector único no lee la clave confirmada"
    assert "plantillaCandidata" not in bloque and "candidat" not in bloque.split("*/")[-1], (
        "el lector único de completitud está mirando al candidato"
    )


def test_el_anillo_esta_en_el_repertorio_del_boton():
    """
    Una plantilla que el backend sabe ajustar pero que el botón no pide es una
    capacidad muerta — la lección de F3. `anillo` cubre cuentas perforadas,
    arandelas y brazaletes rotos por el orificio, que es material corriente.
    """
    s = _txt(ORGANIZER)
    bloque = s[s.index("PLANTILLAS_POR_DEFECTO"):s.index("function formaEstado")]
    assert "'anillo'" in bloque, "el botón no pide la plantilla anular"


def test_el_anillo_conserva_sus_dos_componentes_al_confirmar():
    """Sin el índice de componente, la decisión confirmada se dibujaría uniendo
    las dos circunferencias con un radio que no existe."""
    s = _txt(ORGANIZER)
    bloque = s[s.index("function confirmarPlantilla"):s.index("function descartarPlantilla")]
    assert "contorno_componente: c.plantilla_contorno_componente" in bloque
    assert "d.contorno_componente" in _txt(CORE), (
        "la capa del lienzo no lee el componente de lo confirmado"
    )
    assert "c.plantilla_contorno_componente" in _txt(CORE), (
        "la capa del lienzo no lee el componente del candidato"
    )


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



def test_un_null_del_puente_no_se_publica_como_sin_plantilla():
    """
    Verificación en Electron (integración v1.3): con un contorno en formato {x, y} el
    backend fallaba y el puente devolvía null; el organizer lo guardaba como resultado
    y decía «Sin forma ideal subyacente — es el caso normal en lítica». Un fallo
    técnico presentado como hallazgo morfológico.
    """
    s = _txt(ORGANIZER)
    bloque = s[s.index("function evaluarPlantilla"):s.index("function confirmarPlantilla")]
    i_null = bloque.index("if (!r)")
    i_eval = bloque.index("obj.plantillaEvaluada = true")
    assert i_null < i_eval, "el caso null debe cortar ANTES de marcar el objeto como evaluado"


def test_el_puente_normaliza_el_contorno_a_pares():
    s = _txt(BRIDGE)
    bloque = s[s.index("const shapeTemplate = {"):s.index("async templates()")]
    assert "[p.x, p.y]" in bloque, "shapeTemplate.match no normaliza contornos {x, y}"


def test_las_rutas_python_e_ia_no_pisan_el_contorno_canonico():
    """
    Las rutas Python y de detección asistida llamaban a calcularMetricasMorfologicas(obj) sólo para
    cosechar `_forma_idealizada`, y esa función reemplaza `obj.contour_points` por los
    vértices idealizados. En Electron: 713 puntos reales → 101 vértices, y el
    emparejamiento, el dibujo «Contorno Real» y la EFA leían el polígono idealizado.
    """
    core = _txt(CORE)
    ini = core.index("async function analizarObjetoMorfologicamente")
    fin = core.index("\n  }\n", core.index("guardarAnalisisEnCache(obj, metricas);", ini))
    cuerpo = core[ini:fin]
    assert "MetricsOrchestrator.calcularMetricasMorfologicas(obj" not in cuerpo.split("if (!metricas) metricas =")[0], (
        "una ruta Python/asistida vuelve a llamar al pipeline JS sobre `obj` sin proteger su contorno"
    )
    assert cuerpo.count("metricasJSSinPisarContorno(obj") >= 1
    assert core.count("metricasJSSinPisarContorno(obj") >= 2
    helper = core[core.index("function metricasJSSinPisarContorno"):]
    helper = helper[:helper.index("\n  }\n")]
    assert "finally" in helper and "contour_points" in core[core.index("const _CAMPOS_CONTORNO"):core.index("function metricasJSSinPisarContorno")]
