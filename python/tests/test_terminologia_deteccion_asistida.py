"""
Terminología del modo de detección — «detección asistida» (ADR-022).

La interfaz llamaba «IA» (también «MAO IA», «MAO_IA», «AIA», «Analizar con IA»)
al modo en que el operador fija los parámetros de umbralización y revisa objeto a
objeto. La sigla tuvo tres lecturas incompatibles —«inteligencia artificial» en
las guías, «Identificación Automatizada» en ADR-018, «Imagen Asistida» para su
autor— y un lector hispanohablante la lee siempre como la primera, aunque ningún
modo de detección de MAO Plus use un modelo entrenado. ADR-022 la retiró: el modo
se llama «detección asistida».

Estas pruebas impiden que la sigla vuelva a lo que ve una persona. Recorren las
superficies donde nace el texto visible —el HTML de la interfaz, las cadenas de
JS y de Python, las guías y el glosario generado— y exigen que las formas
retiradas no aparezcan USADAS. Mencionarlas entre comillas angulares («IA») es
legítimo: es como el glosario y las notas de renombrado explican la historia.

Lo que NO se prohíbe, a propósito: los identificadores internos en minúscula
(`mao-ia.js`, `/api/mao-ia`, el enum `ia`, las claves `ia_*`, `maoIa*`). Son
datos persistidos en los proyectos y contratos entre frontend y backend; no los
lee el usuario. Los comentarios de código tampoco se vigilan: documentan la
historia del cambio.
"""
from __future__ import annotations

import ast
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

# Formas retiradas, en mayúsculas exactas: la sigla y sus variantes, «GrabCut
# AI», la expansión que fijó ADR-018 y las frases que atribuían el modo a la
# inteligencia artificial. El lookbehind excluye `ANALYSIS_SOURCE.IA` y similares.
RETIRADAS = re.compile(
    r"(?<![\w.$])(?:IA|AIA|AI)(?![\w])"
    r"|MAO[ _-]?IA"
    r"|Identificaci[oó]n [Aa]utomatizada"
    r"|(?:asistid[oa]|detecci[oó]n|segmentaci[oó]n|an[aá]lisis)(?: asistid[oa])? "
    r"(?:por|con) (?:la )?[Ii]nteligencia [Aa]rtificial"
)
# Citar una forma retirada entre comillas angulares es mencionarla, no usarla.
CITA = re.compile(r"«[^«»\n]*»")


def _usos(texto: str) -> list[str]:
    return [m.group(0) for m in RETIRADAS.finditer(CITA.sub("", texto))]


# ═══════════════════════════════════════════════════════════════════════════════
# Extractores de texto
# ═══════════════════════════════════════════════════════════════════════════════

_REGEX_PREVIO = set("(,=:[!&|?{};+-*%<>~^")
_REGEX_PALABRA = {"return", "typeof", "case", "in", "of", "delete", "void",
                  "throw", "new", "else", "do", "yield", "await"}


def _cadenas_js(src: str) -> list[str]:
    """
    Literales de cadena y de plantilla de un fuente JS, sin comentarios.

    Léxico mínimo: distingue comentarios, cadenas, plantillas (con `${…}`
    anidados, que pueden contener otras plantillas) y literales de expresión
    regular, que es lo necesario para no confundir el contenido de un comentario
    o de una regex con texto que llega al usuario.
    """
    out: list[str] = []
    n = len(src)

    def regex(i: int) -> int:
        i += 1
        en_clase = False
        while i < n:
            c = src[i]
            if c == "\\":
                i += 2
                continue
            if c == "\n":
                return i
            if en_clase:
                en_clase = c != "]"
            elif c == "[":
                en_clase = True
            elif c == "/":
                i += 1
                while i < n and src[i].isalpha():
                    i += 1
                return i
            i += 1
        return i

    def cadena(i: int, q: str) -> int:
        j, buf = i + 1, []
        while j < n:
            c = src[j]
            if c == "\\":
                buf.append(src[j:j + 2])
                j += 2
                continue
            if c == q:
                j += 1
                break
            if c == "\n":
                break
            buf.append(c)
            j += 1
        out.append("".join(buf))
        return j

    def plantilla(i: int) -> int:
        j, buf = i + 1, []
        while j < n:
            c = src[j]
            if c == "\\":
                buf.append(src[j:j + 2])
                j += 2
                continue
            if c == "`":
                j += 1
                break
            if c == "$" and j + 1 < n and src[j + 1] == "{":
                j = lexico(j + 2, hasta_llave=True)
                buf.append(" ")
                continue
            buf.append(c)
            j += 1
        out.append("".join(buf))
        return j

    def lexico(i: int, hasta_llave: bool = False) -> int:
        prof, previo, palabra = 0, "", ""
        while i < n:
            c = src[i]
            if c in " \t\r\n":
                i += 1
                continue
            if c == "/" and src.startswith("//", i):
                j = src.find("\n", i)
                i = n if j < 0 else j
                continue
            if c == "/" and src.startswith("/*", i):
                j = src.find("*/", i + 2)
                i = n if j < 0 else j + 2
                continue
            if c in "'\"":
                i, previo, palabra = cadena(i, c), "a", ""
                continue
            if c == "`":
                i, previo, palabra = plantilla(i), "a", ""
                continue
            if c == "/":
                if previo == "" or previo in _REGEX_PREVIO or palabra in _REGEX_PALABRA:
                    i, previo, palabra = regex(i), "a", ""
                else:
                    i, previo, palabra = i + 1, "/", ""
                continue
            if hasta_llave:
                if c == "{":
                    prof += 1
                elif c == "}":
                    if prof == 0:
                        return i + 1
                    prof -= 1
            if c.isalnum() or c in "_$":
                j = i
                while j < n and (src[j].isalnum() or src[j] in "_$"):
                    j += 1
                palabra, previo, i = src[i:j], "a", j
                continue
            previo, palabra = c, ""
            i += 1
        return i

    lexico(0)
    return out


def _cadenas_py(src: str) -> list[str]:
    """Constantes de texto de un módulo Python, salvo docstrings."""
    arbol = ast.parse(src)
    docstrings = set()
    for nodo in ast.walk(arbol):
        if isinstance(nodo, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            cuerpo = nodo.body
            if (cuerpo and isinstance(cuerpo[0], ast.Expr)
                    and isinstance(cuerpo[0].value, ast.Constant)
                    and isinstance(cuerpo[0].value.value, str)):
                docstrings.add(id(cuerpo[0].value))
    return [n.value for n in ast.walk(arbol)
            if isinstance(n, ast.Constant) and isinstance(n.value, str)
            and id(n) not in docstrings]


class _TextoVisible(HTMLParser):
    """Texto que ve una persona: nodos de texto, atributos legibles y cadenas de <script>."""

    ATRIBUTOS = {"title", "placeholder", "aria-label", "alt", "label"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.textos: list[tuple[int, str]] = []
        self._en = None          # 'script' | 'style' | None
        self._script: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._en, self._script = tag, []
        for k, v in attrs:
            if k in self.ATRIBUTOS and v:
                self.textos.append((self.getpos()[0], v))

    def handle_endtag(self, tag):
        if tag == self._en:
            if tag == "script":
                for s in _cadenas_js("".join(self._script)):
                    self.textos.append((self.getpos()[0], s))
            self._en = None

    def handle_data(self, data):
        if self._en == "script":
            self._script.append(data)
        elif self._en is None and data.strip():
            self.textos.append((self.getpos()[0], data))


def _visible_html(ruta: Path) -> list[tuple[int, str]]:
    p = _TextoVisible()
    p.feed(ruta.read_text(encoding="utf-8"))
    return p.textos


def _rel(p: Path) -> str:
    return str(p.relative_to(ROOT))


# ═══════════════════════════════════════════════════════════════════════════════
# El extractor JS no debe ver comentarios ni regex (si los viera, esta prueba
# daría falsos positivos en cuanto alguien documentara la historia del cambio).
# ═══════════════════════════════════════════════════════════════════════════════

def test_el_extractor_js_separa_cadenas_de_comentarios_y_regex():
    src = (
        "// antes «Analizar con IA» y también IA a secas\n"
        "/* bloque: MAO IA */\n"
        "const a = 'Detección asistida', b = /IA|'x'/i.test(s) ? 1 : 2 / 3;\n"
        "const t = `Paso ${n > 1 ? `varios ${'IA'}` : 'uno'} listo`;\n"
    )
    cadenas = _cadenas_js(src)
    assert "Detección asistida" in cadenas
    assert "IA" in cadenas, "la cadena anidada en una plantilla debe extraerse"
    assert all("MAO IA" not in c and "a secas" not in c for c in cadenas), (
        f"El extractor tomó texto de un comentario: {cadenas}"
    )
    assert not any("'x'" in c for c in cadenas), f"El extractor tomó una regex por cadena: {cadenas}"


# ═══════════════════════════════════════════════════════════════════════════════
# Superficies vigiladas
# ═══════════════════════════════════════════════════════════════════════════════

def test_la_interfaz_no_usa_la_sigla_retirada():
    """
    `index.html`: texto de los nodos, atributos que se leen (title, placeholder,
    aria-label, alt, label) y cadenas de sus <script> en línea. Los ids históricos
    (`maoIaBtn`, `stepIA`…) no son texto visible y no se miran.
    """
    ruta = ROOT / "index.html"
    fallos = [f"index.html:{linea} «{u}» en: {texto.strip()[:90]!r}"
              for linea, texto in _visible_html(ruta) for u in _usos(texto)]
    assert not fallos, "La interfaz volvió a usar la sigla retirada:\n  " + "\n  ".join(fallos)


def test_las_cadenas_de_js_no_usan_la_sigla_retirada():
    """
    Toda cadena de `js/` puede acabar en pantalla, en un aviso, en el CSV, en el
    PDF o en la consola del renderer. Se revisan todas, sin distinguir: es más
    simple que decidir cuáles llegan al usuario, y los avisos de consola también
    los lee una persona.
    """
    fallos = []
    for ruta in sorted((ROOT / "js").rglob("*.js")):
        for s in _cadenas_js(ruta.read_text(encoding="utf-8")):
            for u in _usos(s):
                fallos.append(f"{_rel(ruta)}: «{u}» en {s.strip()[:90]!r}")
    assert not fallos, "Cadenas de JS con la sigla retirada:\n  " + "\n  ".join(fallos)


def test_las_cadenas_de_python_no_usan_la_sigla_retirada():
    """
    Mensajes del backend que llegan a la interfaz (detalles de HTTPException,
    notas de estado del segmentador) y valores que se persisten. Los docstrings
    quedan fuera: documentan el origen histórico del módulo.
    """
    rutas = [ROOT / "python" / "server.py", *sorted((ROOT / "python" / "modules").glob("*.py"))]
    fallos = []
    for ruta in rutas:
        for s in _cadenas_py(ruta.read_text(encoding="utf-8")):
            for u in _usos(s):
                fallos.append(f"{_rel(ruta)}: «{u}» en {s.strip()[:90]!r}")
    assert not fallos, "Cadenas de Python con la sigla retirada:\n  " + "\n  ".join(fallos)


def test_las_guias_y_el_glosario_no_usan_la_sigla_retirada():
    """
    Las guías de `docs/guias/` y el glosario generado son lo que lee quien usa la
    aplicación o evalúa una publicación que la cita. Allí la confusión costaba
    más: una de ellas describía el modo como «segmentación por modelo SAM/YOLO».
    """
    rutas = [ROOT / "GLOSARIO_METRICAS_MAO.html", *sorted((ROOT / "docs" / "guias").glob("*.html"))]
    fallos = [f"{_rel(r)}:{linea} «{u}» en: {texto.strip()[:90]!r}"
              for r in rutas for linea, texto in _visible_html(r) for u in _usos(texto)]
    assert not fallos, "Documentación con la sigla retirada:\n  " + "\n  ".join(fallos)


def test_la_interfaz_nombra_el_modo():
    """
    La prueba negativa no basta: un rótulo borrado también la pasa. El paso del
    stepper y la cabecera de la ventana tienen que decir «Detección asistida».
    """
    textos = [t.strip() for _, t in _visible_html(ROOT / "index.html")]
    assert textos.count("Detección asistida") >= 2, (
        "El paso del stepper y la cabecera de la ventana deberían rotularse "
        f"«Detección asistida»; apariciones exactas: {textos.count('Detección asistida')}"
    )
