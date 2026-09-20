"""
Contrato de procedencia del ANÁLISIS — `analysis_source` (ADR-018).

Distinta de la procedencia de DETECCIÓN (`detection_method`, ADR-008): aquélla
dice cómo se aisló la pieza del fondo, ésta dice de dónde salieron sus métricas
—contorno real, aproximación por caja envolvente, modal de Identificación
Automatizada o malla 3D—. Confundirlas hace leer como medición lo que es una
estimación por bounding box.

Por qué existen estas pruebas: `analysis_method` es texto libre y ocho sitios lo
escriben con ocho cadenas distintas, mientras dos lo comparaban por IGUALDAD.
Una de esas comparaciones ya estaba muerta — `analysis-core.js` buscaba
«Bounding Box (Fallback)» exacto y el escritor emite «Bounding Box (Fallback)
[APROXIMADO]»; el sufijo se añadió sin actualizar al lector, así que el contador
de objetos sin contorno valía 0 siempre y toda pieza se reportaba como medida
sobre contorno real. El fallo es de nomenclatura, no de lógica: un campo legible
usado como enum. Estas pruebas fijan la separación.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
CONTRATO = ROOT / "js" / "mao-deteccion-contract.js"

# Los archivos que escriben o leen `analysis_method`.
FUENTES = [
    ROOT / "js" / "analysis-core.js",
    ROOT / "js" / "collection.js",
    ROOT / "js" / "mao-ia.js",
    ROOT / "js" / "obj3d-viewer.js",
    ROOT / "js" / "modules" / "metrics-orchestrator.js",
]

# Escritura de `analysis_method` con literal, sea `= '...'` o `: '...'`.
_ESCRITURA_RE = re.compile(
    r"analysis_method\s*[:=]\s*(?P<q>['\"`])(?P<valor>(?:(?!(?P=q)).)+)(?P=q)"
)
# Comparación por igualdad contra un literal — el antipatrón que causó el fallo.
_IGUALDAD_RE = re.compile(r"analysis_method\s*={2,3}\s*['\"`]")

pytestmark = pytest.mark.skipif(
    shutil.which("node") is None,
    reason="node no disponible; el contrato se lee ejecutándolo",
)


def _contrato():
    r = subprocess.run(
        ["node", "-e",
         "const C=require('./js/mao-deteccion-contract.js');"
         "console.log(JSON.stringify({"
         "  enum: C.ANALYSIS_SOURCE,"
         "  casos: ['Bounding Box (Fallback) [APROXIMADO]','Bounding Box (Fallback)',"
         "          'Contorno Real Extraído [REAL]','Contorno Real Extraído [Python]',"
         "          'MAO IA — Detección automática','Detección asistida','OBJ3D + PCA',"
         "          'OBJ3D + FRONT/BACK 2D HOMOLOGATED','MAO 3D — Cara A']"
         "         .map(t => [t, C.fuenteAnalisis({analysis_method:t})]),"
         "  precedencia: C.fuenteAnalisis({analysis_source:'ia', analysis_method:'OBJ3D + PCA'}),"
         "  vacio: C.fuenteAnalisis({}),"
         "  nulo: C.fuenteAnalisis(null),"
         "}));"],
        cwd=ROOT, capture_output=True, text=True, timeout=60,
    )
    if r.returncode != 0:
        pytest.fail(f"node falló:\n{r.stderr}")
    return json.loads(r.stdout)


def test_todo_escritor_de_analysis_method_sella_tambien_el_enum():
    """
    LA PRUEBA QUE IMPORTA. Si un sitio escribe la cadena legible pero no el enum,
    los lectores vuelven a depender del texto y reaparece el fallo — con la
    diferencia de que ahora fallaría en silencio para una sola ruta, que es peor
    que fallar para todas.

    Se comprueba por proximidad: el `analysis_source` debe estar dentro de las 5
    líneas siguientes a su `analysis_method`, que es lo que garantiza que van
    juntos en el mismo literal o bloque de asignación.
    """
    huerfanos = []
    for f in FUENTES:
        lineas = f.read_text(encoding="utf-8").splitlines()
        for i, linea in enumerate(lineas):
            if not _ESCRITURA_RE.search(linea):
                continue
            vecindad = "\n".join(lineas[i:i + 6])
            if "analysis_source" not in vecindad:
                huerfanos.append(f"{f.relative_to(ROOT)}:{i + 1}  {linea.strip()[:80]}")

    assert not huerfanos, (
        "Escriben `analysis_method` sin sellar `analysis_source` (ADR-018):\n  "
        + "\n  ".join(huerfanos)
    )


def test_ningun_sitio_compara_analysis_method_por_igualdad():
    """
    El antipatrón exacto que produjo el fallo. Comparar un campo de texto libre
    por igualdad es frágil ante cualquier sufijo añadido río arriba, y el fallo
    resultante es mudo: no lanza, simplemente deja de coincidir. La comparación
    va contra el enum, o por subcadena si hay que tolerar datos en disco.
    """
    ofensores = []
    for f in FUENTES:
        for i, linea in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            if _IGUALDAD_RE.search(linea):
                ofensores.append(f"{f.relative_to(ROOT)}:{i}  {linea.strip()[:90]}")

    assert not ofensores, (
        "Comparan `analysis_method` por igualdad contra un literal. Usar "
        "`MaoDeteccion.fuenteAnalisis()` / `esFallbackBBox()` / `esAnalisisIA()`:\n  "
        + "\n  ".join(ofensores)
    )


def test_los_valores_escritos_son_miembros_del_enum():
    """
    Los escritores ponen el literal del enum en línea, para no acoplar módulos ES
    al orden de carga del contrato clásico. Esta prueba es lo que mantiene ese
    literal honesto: si alguien inventa un valor nuevo, salta aquí.
    """
    validos = set(_contrato()["enum"].values())
    invalidos = []
    for f in FUENTES:
        texto = f.read_text(encoding="utf-8")
        for m in re.finditer(r"analysis_source\s*[:=]\s*(['\"])([a-z_]+)\1", texto):
            if m.group(2) not in validos:
                invalidos.append(f"{f.relative_to(ROOT)}: '{m.group(2)}'")

    assert not invalidos, (
        f"Valores de `analysis_source` fuera del enum {sorted(validos)}:\n  "
        + "\n  ".join(invalidos)
    )


def test_las_cadenas_legacy_siguen_resolviendo():
    """
    Hay análisis guardados en disco desde antes de ADR-018: no tienen
    `analysis_source` y su única procedencia es la cadena legible. La derivación
    por subcadena debe seguir reconociéndolas, o abrir un proyecto viejo perdería
    la distinción entre medición y aproximación.

    Incluye «Bounding Box (Fallback)» SIN sufijo — la cadena que el lector
    esperaba y nadie escribía nunca — y las dos cadenas del modo asistido: la
    vigente («Detección asistida», ADR-022) y la que llevan los análisis
    guardados antes del cambio de nombre («MAO IA — Detección automática»).
    """
    c = _contrato()
    esperado = {
        "Bounding Box (Fallback) [APROXIMADO]": "bbox_fallback",
        "Bounding Box (Fallback)": "bbox_fallback",
        "Contorno Real Extraído [REAL]": "contorno_real",
        "Contorno Real Extraído [Python]": "contorno_real",
        "MAO IA — Detección automática": "ia",
        "Detección asistida": "ia",
        "OBJ3D + PCA": "obj3d",
        "OBJ3D + FRONT/BACK 2D HOMOLOGATED": "obj3d",
        "MAO 3D — Cara A": "obj3d",
    }
    obtenido = dict(c["casos"])
    fallos = [f"«{k}» → {obtenido.get(k)!r}, se esperaba {v!r}"
              for k, v in esperado.items() if obtenido.get(k) != v]
    assert not fallos, "Cadenas legacy que dejaron de resolver:\n  " + "\n  ".join(fallos)


def test_el_enum_tiene_precedencia_y_la_ausencia_no_inventa():
    """
    Dos invariantes del derivador: `analysis_source` manda sobre la cadena (es el
    dato canónico), y sin ninguno de los dos devuelve null en vez de adivinar.
    Inventar una procedencia sería peor que no tenerla: haría pasar por medición
    algo cuyo origen se desconoce.
    """
    c = _contrato()
    assert c["precedencia"] == "ia", (
        f"El enum no tuvo precedencia sobre la cadena: {c['precedencia']!r}"
    )
    assert c["vacio"] is None, f"Métricas sin procedencia devolvieron {c['vacio']!r}"
    assert c["nulo"] is None, f"Entrada nula devolvió {c['nulo']!r}"
