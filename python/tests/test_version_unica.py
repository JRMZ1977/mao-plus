"""
Versión de la aplicación y identidad de los módulos ESM — enforcement de la v1.3.

1. La versión se sella en cada resultado (metadato del proyecto, CSV, PDF). Con la
   matemática del motor cambiada entre versiones, un número sin la versión que lo
   calculó no es trazable. Vivía escrita a mano en seis sitios; ahora hay UNA fuente
   (`js/mao-version.js`) y debe coincidir con `package.json`.
2. En ESM la query string forma parte de la identidad del módulo: importar
   `utility-helpers.js?v=…` en un sitio y `./utility-helpers.js` en otro crea dos
   instancias con estado separado.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_la_version_del_renderer_es_la_del_paquete():
    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    js = (ROOT / "js" / "mao-version.js").read_text(encoding="utf-8")
    m = re.search(r"window\.MAO_VERSION\s*=\s*'([^']+)'", js)
    assert m and m.group(1) == pkg, f"mao-version.js={m and m.group(1)} ≠ package.json={pkg}"


def test_ningun_productor_escribe_la_version_a_mano():
    culpables = []
    for f in (ROOT / "js").glob("*.js"):
        for i, linea in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            if re.search(r"versionMAO:\s*'\d+\.\d+", linea) or re.search(r"MAO_VERSION\s*=\s*'\d", linea) and f.name != "mao-version.js":
                culpables.append(f"{f.name}:{i}")
    assert not culpables, f"versión escrita a mano en productores: {culpables}"


def test_mao_version_se_carga_antes_que_sus_consumidores():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    i = html.index("js/mao-version.js")
    for consumidor in ("js/project-manager.js", "js/analysis-core.js", "js/obj3d-viewer.js"):
        assert i < html.index(consumidor), f"{consumidor} se carga antes que mao-version.js"


def test_los_imports_esm_no_llevan_query():
    malos = []
    for f in [ROOT / "js" / "analysis-core.js", *(ROOT / "js" / "modules").glob("*.js")]:
        for i, linea in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            if re.search(r"^\s*import\b.*from\s+'[^']+\?[^']*'", linea):
                malos.append(f"{f.name}:{i}")
    assert not malos, f"import ESM con query (duplica la instancia del módulo): {malos}"
