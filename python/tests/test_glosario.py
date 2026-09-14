"""
Contrato del glosario canónico (`js/modules/glossary.js`).

Un glosario sin enforcement se desincroniza del código en la siguiente sesión: se
renombra una columna del CSV, se mueve una métrica de sección, y la definición
sigue ahí describiendo algo que ya no existe. Estas pruebas son lo que hace que
el glosario siga siendo verdadero — el mismo papel que cumple
`test_coherencia_entrega.py` para el manifiesto de categorías.

Lo que NO se comprueba aquí, deliberadamente: que la adjudicación de categoría
del glosario coincida con la que infiere `scripts/glosario_inventario.py`. El
inventario OBSERVA qué emite el código, con una heurística; el glosario ADJUDICA
qué significa cada magnitud, con criterio. Que difieran es información sobre el
código, no un fallo del glosario.
"""
from __future__ import annotations

import importlib.util
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
GLOSSARY = ROOT / "js" / "modules" / "glossary.js"
INVENTARIO = ROOT / "scripts" / "glosario_inventario.py"

pytestmark = pytest.mark.skipif(
    shutil.which("node") is None,
    reason="node no disponible; el glosario es un módulo ES y se lee ejecutándolo",
)


def _node(script: str):
    """Ejecuta un módulo ES en node y devuelve el JSON que imprime."""
    r = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT, capture_output=True, text=True, timeout=60,
    )
    if r.returncode != 0:
        pytest.fail(f"node falló:\n{r.stderr}")
    return json.loads(r.stdout)


@pytest.fixture(scope="module")
def glosario():
    return _node("""
      const G = await import('./js/modules/glossary.js');
      const M = await import('./js/modules/category-manifest.js');
      console.log(JSON.stringify({
        terminos: G.TERMINOS,
        convenciones: G.CONVENCIONES,
        referencias: Object.keys(G.REFERENCIAS),
        problemas: G.validarGlosario(M.CATEGORIAS.map(c => c.id)),
        cobertura: G.cobertura(),
        categorias: M.CATEGORIAS.map(c => c.id),
      }));
    """)


@pytest.fixture(scope="module")
def inventario():
    """Reusa el parser del inventario para saber qué emite REALMENTE el CSV."""
    spec = importlib.util.spec_from_file_location("glosario_inventario", INVENTARIO)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_glosario_es_coherente_consigo_mismo(glosario):
    """
    Sin duplicados, sin campos obligatorios vacíos, sin referencias bibliográficas
    inexistentes, sin dos términos disputándose una misma columna del CSV, y con
    toda `categoria` existente en el manifiesto. Es `validarGlosario()` en su
    modo estricto — el mismo autodiagnóstico que expone el módulo.
    """
    assert glosario["problemas"] == [], (
        "El glosario no valida contra el manifiesto:\n  "
        + "\n  ".join(glosario["problemas"])
    )


def test_toda_columna_csv_declarada_existe_de_verdad(glosario, inventario):
    """
    EL PUENTE. Cada término que dice publicarse en una columna del CSV debe
    nombrar una columna que el generador emita de verdad. Es la prueba que
    detecta el fallo más probable: alguien renombra un rótulo del CSV y el
    glosario queda apuntando a una columna fantasma.

    ADR-011 congeló el esquema del CSV precisamente porque hay scripts externos
    que dependen de esos nombres. Esta prueba convierte ese acuerdo en algo
    verificable en vez de en una nota al pie.
    """
    emitidas = {
        (f["seccion_csv"], f["campo_csv"]) for f in inventario.leer_csv()
    }
    declaradas = {
        (t["csv"][0], t["csv"][1]): t["clave"]
        for t in glosario["terminos"] if t["csv"]
    }

    fantasma = {col: clave for col, clave in declaradas.items() if col not in emitidas}
    assert not fantasma, (
        "Columnas del CSV declaradas por el glosario que el generador NO emite "
        "(¿se renombró el rótulo en extraerMetricasCompletasConPHSimple?):\n  "
        + "\n  ".join(f"«{s} › {c}» declarada por `{k}`" for (s, c), k in fantasma.items())
    )


def test_nivel_declarado_coincide_con_el_registry(glosario, inventario):
    """
    Los términos que se declaran del núcleo canónico (nivel H, P, 2D o 3D) deben
    figurar con ESE nivel en `morphometric_registry.py`. Sin esta prueba el
    glosario puede afirmar que una métrica es invariante y adimensional —el
    contrato del nivel H— cuando el registry dice otra cosa.
    """
    registry = inventario.leer_registry()
    desajustes = []
    for t in glosario["terminos"]:
        if not t.get("nivel"):
            continue
        # El id del registry es el canónico; el glosario documenta la clave de
        # salida, que a veces difiere (`convexity` ↔ `convexity_perim`). La `nota`
        # del término debe declarar esa correspondencia.
        spec = registry.get(t["clave"])
        if spec is None:
            continue  # alias documentado; lo cubre test_los_alias_estan_declarados
        if spec["nivel"] != t["nivel"]:
            desajustes.append(
                f"`{t['clave']}`: glosario dice nivel {t['nivel']}, "
                f"registry dice {spec['nivel']}"
            )
    assert not desajustes, "Nivel divergente entre glosario y registry:\n  " + "\n  ".join(desajustes)


def test_los_alias_estan_declarados_como_tales(glosario):
    """
    MAO emite varias claves que son el mismo número por dos nombres
    (`feret_max` / `max_feret_diameter`, `detection_confidence_level` /
    `confidence_level`). Un glosario que las documente como magnitudes distintas
    induce a creer que hay dos mediciones. Toda entrada cuyo nombre diga «alias»
    debe decirlo también en `nota`, que es el campo que se rinde en el informe.
    """
    incoherentes = [
        t["clave"] for t in glosario["terminos"]
        if "alias" in t["nombre"].lower() and "alias" not in (t.get("nota") or "").lower()
    ]
    assert not incoherentes, (
        "Términos rotulados como alias sin declararlo en `nota`: " + ", ".join(incoherentes)
    )


def test_las_fuentes_apuntan_a_archivos_existentes(glosario):
    """
    El campo `fuente` es la trazabilidad de la definición: dice qué función
    calcula el número. Si el archivo ya no existe, la definición dejó de ser
    verificable y probablemente también dejó de ser cierta.
    """
    rotas = []
    for t in glosario["terminos"]:
        archivo = t["fuente"].split("::")[0]
        if not (ROOT / archivo).exists():
            rotas.append(f"`{t['clave']}` → {archivo}")
    assert not rotas, "Términos cuya `fuente` apunta a un archivo inexistente:\n  " + "\n  ".join(rotas)


def test_cobertura_declarada_del_alcance_f1_f2(glosario):
    """
    Guard de alcance: F1+F2 cubre procedencia, incertidumbre y núcleo
    morfométrico. Si una de esas categorías se queda sin términos, es que una
    edición las borró — el glosario nunca debe RETROCEDER en cobertura.

    Las categorías de F3-F4 (P/H, bifacial, textura, clasificación…) no se
    exigen aquí: se añaden a esta lista al cerrarse cada fase.
    """
    esperadas = {
        "deteccion", "error_optico", "incertidumbre", "dimensiones",
        "indices_forma", "radial", "contorno", "curvatura", "convex_hull",
        "ejes_orientacion", "simetria", "avanzadas",
    }
    faltan = esperadas - set(glosario["cobertura"])
    assert not faltan, f"Categorías de F1+F2 que se quedaron sin términos: {sorted(faltan)}"


def test_toda_referencia_bibliografica_se_usa(glosario):
    """
    Bibliografía sin citar es bibliografía decorativa. Si una referencia deja de
    usarse, o se borra o se documenta por qué está.
    """
    usadas = {r for t in glosario["terminos"] for r in (t.get("ref") or [])}
    huerfanas = set(glosario["referencias"]) - usadas
    assert not huerfanas, (
        f"Referencias declaradas pero no citadas por ningún término: {sorted(huerfanas)}"
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Convenciones de nomenclatura (ADR-018)
# ═══════════════════════════════════════════════════════════════════════════════

DETECCION_SECTION = ROOT / "js" / "modules" / "detection-section.js"


def test_la_sigla_ia_se_declara_como_identificacion_automatizada(glosario):
    """
    En MAO Plus «IA» significa **Identificación Automatizada**, no «inteligencia
    artificial». La sigla nombra QUÉ hace el modo de detección —aislar la pieza
    sin trazado ni encuadre del operador—, no con qué técnica lo hace; ese dato
    va aparte, en `ia_segmentador`.

    Sin esta convención declarada, un lector atribuye a un modelo entrenado
    mediciones que a menudo produjo la umbralización clásica de OpenCV, y
    desconfía de resultados tan deterministas como los del modo automático.
    """
    conv = {c["id"]: c for c in glosario["convenciones"]}
    assert "sigla_ia" in conv, (
        "Falta la convención `sigla_ia` en glossary.js: la sigla IA volvería a "
        "quedar sin expandir en el anexo del informe."
    )
    assert conv["sigla_ia"]["termino"] == "IA"
    assert conv["sigla_ia"]["expansion"] == "Identificación Automatizada", (
        f"La expansión de IA cambió a «{conv['sigla_ia']['expansion']}»"
    )


def test_el_rotulo_del_modo_ia_expande_la_sigla():
    """
    El rótulo que ve el usuario en el informe, la Tabla y el CSV sale de
    `METODO_LABEL` en detection-section.js. Si vuelve a decir sólo «IA», la
    convención queda declarada en el glosario pero ausente donde importa.

    Es una etiqueta de PRESENTACIÓN: la clave canónica es el enum `ia` (ADR-008)
    y nada compara contra este texto, así que desarrollarla no rompe consumidores.
    """
    txt = DETECCION_SECTION.read_text(encoding="utf-8")
    m = re.search(r"^\s*ia:\s*'([^']+)'", txt, re.M)
    assert m, "No se encontró la etiqueta del modo `ia` en METODO_LABEL"
    assert "Identificación Automatizada" in m.group(1), (
        f"El rótulo del modo IA volvió a no expandir la sigla: «{m.group(1)}»"
    )


def test_las_convenciones_declaradas_no_retroceden(glosario):
    """
    Guard de cobertura, hermano de `test_cobertura_declarada_del_alcance_f1_f2`.
    Cada convención nació de una ambigüedad verificada en el código —ocho campos
    llamados «confianza», tres sistemas de ejes, seis áreas—. Borrar una no
    resuelve la ambigüedad: la devuelve al estado en que nadie la había mirado.

    Ampliar la lista es lo esperado; encogerla, no.
    """
    esperadas = {
        "sigla_ia", "sigla_aia", "confianza_calificada",
        "procedencia_deteccion_vs_analisis", "simetria_ambito", "eje_sistema",
        "area_variante", "rotulos_miden_no_diagnostican", "caras_a_b",
        "perforacion_horadacion",
    }
    presentes = {c["id"] for c in glosario["convenciones"]}
    faltan = esperadas - presentes
    assert not faltan, f"Convenciones que desaparecieron del glosario: {sorted(faltan)}"


def test_toda_convencion_declara_si_es_sigla_o_regla(glosario):
    """
    `sigla` se rinde como «A = B»; `regla`, como enunciado de uso. Sin el campo,
    el anexo imprime cosas como «Confianza = siempre calificada», que se lee como
    si «siempre calificada» fuese la expansión de un acrónimo.
    """
    sin_tipo = [c["id"] for c in glosario["convenciones"]
                if c.get("tipo") not in ("sigla", "regla")]
    assert not sin_tipo, f"Convenciones sin `tipo` válido: {sin_tipo}"
