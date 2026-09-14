#!/usr/bin/env python3
"""
F0 del glosario — inventario automático de términos (ADR-018).
===============================================================================
Cruza las cuatro fuentes que hoy definen, entre todas, qué mide MAO Plus:

  1. `js/modules/category-manifest.js`  — índice canónico (26 categorías, I → XX-b)
  2. `js/analysis-core.js`              — generador del CSV (esquema congelado, ADR-011)
  3. `js/modules/tabla-metricas-completa.js` — Tabla Completa (usa el índice canónico)
  4. `python/modules/morphometric_registry.py` — 31 MetricSpec con fórmula y unidad

…y contra `js/modules/glossary.js` (si existe) para medir cobertura.

Existe porque las dos taxonomías del informe son divergentes A PROPÓSITO: ADR-011
congeló los rótulos del CSV para no romper scripts downstream, mientras el panel,
la Tabla y el PDF migraron al índice canónico. El glosario es el puente entre
ambas, y este script dice exactamente cuántos tramos tiene ese puente.

Uso:
    python3 scripts/glosario_inventario.py            # informe a stdout
    python3 scripts/glosario_inventario.py --md FILE  # + informe markdown
    python3 scripts/glosario_inventario.py --json FILE

Sin dependencias fuera de la stdlib (igual que los módulos canónicos que lee).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

MANIFEST = ROOT / "js" / "modules" / "category-manifest.js"
CORE = ROOT / "js" / "analysis-core.js"
TABLA = ROOT / "js" / "modules" / "tabla-metricas-completa.js"
REGISTRY = ROOT / "python" / "modules" / "morphometric_registry.py"
DETECCION = ROOT / "js" / "modules" / "detection-section.js"
GLOSSARY = ROOT / "js" / "modules" / "glossary.js"


# ═══════════════════════════════════════════════════════════════════════════════
# 1. Manifiesto canónico — mismo regex que python/tests/test_coherencia_entrega.py
# ═══════════════════════════════════════════════════════════════════════════════

_MANIFEST_RE = re.compile(
    r"\{\s*id:\s*'(?P<id>[a-z0-9_]+)',\s*"
    r"titulo:\s*'(?P<titulo>[^']*)',\s*"
    r"orden:\s*(?P<orden>\d+),\s*"
    r"indice:\s*'(?P<indice>[^']*)',\s*"
    r"tipo:\s*'(?P<tipo>[a-z]+)'"
)


def leer_manifiesto() -> list[dict]:
    entries = [m.groupdict() for m in _MANIFEST_RE.finditer(MANIFEST.read_text(encoding="utf-8"))]
    if not entries:
        sys.exit(f"ERROR: no se pudo parsear ninguna entrada de {MANIFEST}")
    for e in entries:
        e["orden"] = int(e["orden"])
    return entries


# ═══════════════════════════════════════════════════════════════════════════════
# 2. CSV — `extraerMetricasCompletasConPHSimple` en analysis-core.js
# ═══════════════════════════════════════════════════════════════════════════════
#
# Cada fila se emite como un template literal de cuatro campos:
#     csvLines += `Categoría,Campo,${expr},unidad\n`;
# `expr` puede contener comas propias (`fmt(m.area, 3)`), así que NO se puede
# partir por comas a secas: hay que respetar la anidación de `${ … }`.

_CSV_LINE_RE = re.compile(r"csvLines \+= `(?P<row>(?:[^`\\]|\\.)*)`")

# Prefijo del identificador → ÁMBITO de la métrica. La distinción importa: `pm.area`
# no es la misma magnitud que `m.area` — una mide la perforación, la otra la pieza.
# Un glosario que las funda en una sola entrada miente sobre la unidad de análisis.
AMBITOS = {
    "m": "objeto", "metricas": "objeto", "metricasA": "objeto", "metricasB": "objeto",
    "pm": "perforacion", "perf": "perforacion",
    "hm": "horadacion", "horad": "horadacion", "hor": "horadacion",
    "comparacion": "bifacial", "comp": "bifacial", "distribucionPH": "bifacial",
}
_KEY_RE = re.compile(
    r"\b(" + "|".join(sorted(AMBITOS, key=len, reverse=True)) + r")\.([a-zA-Z_][a-zA-Z0-9_]*)"
)


def _claves_con_ambito(expr: str) -> list[str]:
    """Extrae `ambito:clave` de una expresión JS. `m.area` → `objeto:area`."""
    return sorted({f"{AMBITOS[p]}:{k}" for p, k in _KEY_RE.findall(expr)})


def _split_top_level(texto: str) -> list[str]:
    """Parte por comas que NO estén dentro de `${ … }` ni de paréntesis."""
    partes, buf, depth = [], [], 0
    i = 0
    while i < len(texto):
        c = texto[i]
        if texto.startswith("${", i):
            depth += 1
            buf.append("${")
            i += 2
            continue
        if c in "([":
            depth += 1
        elif c in ")]":
            depth -= 1
        elif c == "}" and depth > 0:
            depth -= 1
        elif c == "," and depth == 0:
            partes.append("".join(buf))
            buf = []
            i += 1
            continue
        buf.append(c)
        i += 1
    partes.append("".join(buf))
    return partes


def _rango_funcion(texto: str, nombre: str) -> tuple[int, int]:
    """(inicio, fin) en offsets de carácter del cuerpo de `function nombre(`."""
    m = re.search(rf"function {re.escape(nombre)}\s*\(", texto)
    if not m:
        sys.exit(f"ERROR: no se encontró la función {nombre}() en {CORE}")
    inicio = m.start()
    # La función cierra con `\n  }` al nivel de indentación del IIFE.
    fin = texto.find("\n  }", inicio)
    return inicio, (fin if fin != -1 else len(texto))


def leer_csv() -> list[dict]:
    texto = CORE.read_text(encoding="utf-8")
    ini, fin = _rango_funcion(texto, "extraerMetricasCompletasConPHSimple")
    cuerpo = texto[ini:fin]

    filas: list[dict] = []

    # Las filas de «Detección» no se escriben una a una: se emiten en bucle sobre
    # `DetectionSection.filasDeteccion(m)`, así que su nombre de columna aparece
    # aquí como `${f.label}`. Los rótulos son literales en detection-section.js;
    # se resuelven desde allí para que el puente CSV↔glosario sea real y no un
    # comodín. Sin esto, `Detección › Método de detección` parecería inexistente.
    if "DetectionSection.filasDeteccion" in cuerpo and DETECCION.exists():
        det = DETECCION.read_text(encoding="utf-8")
        bloque = det[det.find("const crudas = ["):]
        bloque = bloque[:bloque.find("];") + 1]
        for label, expr in re.findall(r"\['([^']+)',\s*([^\]]+)\]", bloque):
            filas.append({
                "seccion_csv": "Detección",
                "campo_csv": label,
                "claves": _claves_con_ambito(expr),
                "unidad": "-",
            })

    for m in _CSV_LINE_RE.finditer(cuerpo):
        campos = _split_top_level(m.group("row"))
        if len(campos) < 3:
            continue
        seccion, campo, valor = campos[0], campos[1], campos[2]
        unidad = campos[3].replace("\\n", "").strip() if len(campos) > 3 else ""
        # Cabecera del bloque P/H y separadores no son métricas.
        if not seccion.strip() or seccion.startswith("${"):
            continue
        # Fila-comodín del bucle de Detección: ya resuelta arriba, rótulo a rótulo.
        if seccion.strip() == "Detección" and "${f.label}" in campo:
            continue
        filas.append({
            "seccion_csv": seccion.strip(),
            # `${id} - Área` → el índice del P/H es variable; se normaliza a `N`.
            "campo_csv": re.sub(r"\$\{[^}]*\}", "N", campo).strip(),
            "claves": _claves_con_ambito(valor),
            "unidad": unidad,
        })
    return filas


# ═══════════════════════════════════════════════════════════════════════════════
# 3. Tabla Completa — atribuye cada `metricas.X` a la sección canónica que la rinde
# ═══════════════════════════════════════════════════════════════════════════════
#
# La atribución es POR FUNCIÓN, no por posición del encabezado. Partir el archivo
# en los marcadores `encabezadoDe('id')` produce un desfase sistemático de una
# sección, porque cada generador CALCULA sus variables antes de emitir su propio
# encabezado (p. ej. `generarSeccionErrorOptico` lee `error_optico_lineal_percent`
# en la línea 1600 y rotula en la 1620). Ese corrimiento adjudicaba «Dimensiones
# Básicas» a «I. Detección». Cada `function generarSeccionX()` es la unidad real.

_MARCADOR_RE = re.compile(r"(?:encabezadoDe|indiceDe)\('([a-z0-9_]+)'\)")
_FUNC_RE = re.compile(r"^(?:export )?function ([a-zA-Z_][a-zA-Z0-9_]*)\s*\(", re.M)


def leer_tabla() -> tuple[dict[str, set[str]], list[str], list[dict]]:
    """(categoría → claves con ámbito, funciones sin categoría, funciones ambiguas)."""
    texto = TABLA.read_text(encoding="utf-8")
    funcs = [(m.start(), m.group(1)) for m in _FUNC_RE.finditer(texto)]
    if not funcs:
        sys.exit(f"ERROR: no se encontró ninguna función de sección en {TABLA}")

    por_categoria: dict[str, set[str]] = defaultdict(set)
    sin_categoria: list[str] = []
    ambiguas: list[dict] = []
    for idx, (pos, nombre) in enumerate(funcs):
        fin = funcs[idx + 1][0] if idx + 1 < len(funcs) else len(texto)
        cuerpo = texto[pos:fin]
        marcadores = list(dict.fromkeys(_MARCADOR_RE.findall(cuerpo)))
        claves = _claves_con_ambito(cuerpo)
        if not marcadores:
            if claves and nombre.startswith(("generarSeccion", "generarTabla")):
                sin_categoria.append(nombre)
            continue
        # Una función que emite VARIAS secciones (p. ej. generarSeccionPropiedadesContorno
        # rinde textura-b, textura y contorno) no permite adjudicar por posición: sus
        # variables se calculan todas en el prólogo. Se atribuye a todas y se marca
        # AMBIGUA — sobre-incluir y avisar es preferible a repartir mal en silencio.
        for cat in marcadores:
            por_categoria[cat].update(claves)
        if len(marcadores) > 1:
            ambiguas.append({"funcion": nombre, "categorias": marcadores})

    # `I. Detección` no se rinde en la Tabla: se delega en detection-section.js.
    if DETECCION.exists():
        por_categoria["deteccion"].update(_claves_con_ambito(
            DETECCION.read_text(encoding="utf-8")))

    return por_categoria, sin_categoria, ambiguas


# ═══════════════════════════════════════════════════════════════════════════════
# 4. Registro morfométrico (ADR-006) — fórmula y unidad ya escritas, en Python
# ═══════════════════════════════════════════════════════════════════════════════

_SPEC_RE = re.compile(
    r'id="(?P<id>[a-z0-9_]+)",\s*nombre="(?P<nombre>[^"]*)",\s*'
    r'formula="(?P<formula>[^"]*)",?\s*'
    r'nivel="(?P<nivel>[HP2D3]+)"',
    re.S,
)
_UNIDAD_RE = re.compile(r'unidad="(?P<unidad>[^"]*)"')
_FUENTE2D_RE = re.compile(r'fuente_2d="(?P<f>[^"]*)"')


def leer_registry() -> dict[str, dict]:
    texto = REGISTRY.read_text(encoding="utf-8")
    bloques = texto.split("MetricSpec(")[1:]
    specs: dict[str, dict] = {}
    for b in bloques:
        m = _SPEC_RE.search(b)
        if not m:
            continue
        d = m.groupdict()
        u = _UNIDAD_RE.search(b)
        f = _FUENTE2D_RE.search(b)
        d["unidad"] = u.group("unidad") if u else ""
        d["fuente_2d"] = f.group("f") if f else ""
        specs[d["id"]] = d
    return specs


# ═══════════════════════════════════════════════════════════════════════════════
# 5. Glosario (si ya existe) — para medir cobertura incremental
# ═══════════════════════════════════════════════════════════════════════════════

# Se leen clave Y ámbito juntos: el universo del inventario está indexado por
# `ambito:clave`, y comparar contra claves desnudas daba cobertura 0 siempre.
_GLOSSARY_RE = re.compile(
    r"clave:\s*'(?P<clave>[a-zA-Z_{][a-zA-Z0-9_}]*)',\s*ambito:\s*'(?P<ambito>[a-z]+)'"
)

# Enlace clave ↔ columna del CSV declarado por el glosario. Hace falta porque 30
# de las filas del CSV toman su valor de un DERIVADO de presentación
# (`${fmt(_an.neta, 3)}`) y no de `m.<clave>`: el parseo estático no puede saber
# qué métrica hay detrás, pero el glosario sí lo declara. Sin este enlace, claves
# reales y publicadas —`area_neta`, `perimetro_neto`— quedaban fuera del universo
# y la cobertura se subestimaba en silencio.
_GLOSSARY_CSV_RE = re.compile(
    r"clave:\s*'(?P<clave>[a-zA-Z_][a-zA-Z0-9_]*)',\s*ambito:\s*'(?P<ambito>[a-z]+)'"
    r".*?csv:\s*\['(?P<seccion>[^']*)',\s*'(?P<campo>[^']*)'\]",
    re.S,
)


def leer_enlaces_glosario() -> dict[str, tuple[str, str]]:
    """`ambito:clave` → (sección, campo) del CSV, según lo declara el glosario."""
    if not GLOSSARY.exists():
        return {}
    txt = GLOSSARY.read_text(encoding="utf-8")
    enlaces = {}
    # Se acota a cada entrada para que el `.*?` no salte de un término al csv del
    # siguiente: se parte por el inicio de entrada y se busca dentro de cada trozo.
    for trozo in txt.split("\n  {\n"):
        m = _GLOSSARY_CSV_RE.search(trozo)
        if m:
            enlaces[f"{m['ambito']}:{m['clave']}"] = (m["seccion"], m["campo"])
    return enlaces


def leer_glosario() -> set[str]:
    if not GLOSSARY.exists():
        return set()
    return {f"{m['ambito']}:{m['clave']}"
            for m in _GLOSSARY_RE.finditer(GLOSSARY.read_text(encoding="utf-8"))}


# ═══════════════════════════════════════════════════════════════════════════════
# Cruce
# ═══════════════════════════════════════════════════════════════════════════════

def construir_inventario() -> dict:
    manifiesto = leer_manifiesto()
    cat_por_id = {c["id"]: c for c in manifiesto}
    filas_csv = leer_csv()
    tabla, funcs_sin_categoria, funcs_ambiguas = leer_tabla()
    registry = leer_registry()
    glosario = leer_glosario()
    enlaces_glosario = leer_enlaces_glosario()

    # Clave de métrica → categoría canónica, adjudicada por la Tabla.
    cat_de_clave: dict[str, str] = {}
    for cat, claves in tabla.items():
        for k in claves:
            # La primera sección que la rinde manda (orden canónico ascendente).
            if k not in cat_de_clave:
                cat_de_clave[k] = cat
            else:
                actual = cat_por_id.get(cat_de_clave[k], {}).get("orden", 999)
                nueva = cat_por_id.get(cat, {}).get("orden", 999)
                if nueva < actual:
                    cat_de_clave[k] = cat

    # Clave → pares CSV que la publican.
    csv_de_clave: dict[str, list[str]] = defaultdict(list)
    for f in filas_csv:
        for k in f["claves"]:
            csv_de_clave[k].append(f"{f['seccion_csv']} › {f['campo_csv']}")

    # Filas cuyo valor sale de un derivado de presentación: el enlace lo aporta el
    # glosario, que es quien lo declara. Solo se acepta si la columna EXISTE de
    # verdad en el CSV — el glosario documenta, no inventa columnas.
    columnas_reales = {(f["seccion_csv"], f["campo_csv"]) for f in filas_csv}
    derivadas = 0
    for k, col in enlaces_glosario.items():
        etiqueta = f"{col[0]} › {col[1]}"
        if col in columnas_reales and etiqueta not in csv_de_clave[k]:
            csv_de_clave[k].append(etiqueta)
            derivadas += 1

    universo = sorted(set(cat_de_clave) | set(csv_de_clave) | {f"objeto:{k}" for k in registry})

    terminos = []
    for k in universo:
        ambito, _, nombre_clave = k.partition(":")
        cat = cat_de_clave.get(k)
        # El registry (ADR-006) describe magnitudes de la PIEZA; no aplica a P/H.
        spec = registry.get(nombre_clave) if ambito == "objeto" else None
        terminos.append({
            "clave": nombre_clave,
            "ambito": ambito,
            "categoria": cat,
            "indice": cat_por_id.get(cat, {}).get("indice") if cat else None,
            "titulo_categoria": cat_por_id.get(cat, {}).get("titulo") if cat else None,
            "en_csv": csv_de_clave.get(k, []),
            "en_tabla": cat is not None,
            "registry": {
                "nombre": spec["nombre"], "formula": spec["formula"],
                "nivel": spec["nivel"], "unidad": spec["unidad"],
            } if spec else None,
            "documentada": k in glosario,
        })

    # Correspondencia CSV ↔ manifiesto, inferida por las claves que comparten.
    puente: dict[str, dict] = {}
    for f in filas_csv:
        cats = [cat_de_clave[k] for k in f["claves"] if k in cat_de_clave]
        entrada = puente.setdefault(f["seccion_csv"], {"filas": 0, "votos": defaultdict(int)})
        entrada["filas"] += 1
        for c in cats:
            entrada["votos"][c] += 1
    for sec, d in puente.items():
        votos = d.pop("votos")
        d["canonica"] = max(votos, key=votos.get) if votos else None
        d["evidencia"] = dict(sorted(votos.items(), key=lambda kv: -kv[1]))

    return {
        "manifiesto": manifiesto,
        "terminos": terminos,
        "funcs_sin_categoria": funcs_sin_categoria,
        "funcs_ambiguas": funcs_ambiguas,
        "categorias_sin_renderer": [c["id"] for c in manifiesto if c["id"] not in tabla],
        "filas_csv": filas_csv,
        "puente_csv": puente,
        "resumen": {
            "categorias_canonicas": len(manifiesto),
            "terminos_totales": len(terminos),
            "con_categoria": sum(1 for t in terminos if t["categoria"]),
            "sin_categoria": sum(1 for t in terminos if not t["categoria"]),
            "en_csv": sum(1 for t in terminos if t["en_csv"]),
            "solo_csv": sum(1 for t in terminos if t["en_csv"] and not t["en_tabla"]),
            "solo_tabla": sum(1 for t in terminos if t["en_tabla"] and not t["en_csv"]),
            "con_registry": sum(1 for t in terminos if t["registry"]),
            "documentados": sum(1 for t in terminos if t["documentada"]),
            "filas_csv": len(filas_csv),
            "secciones_csv": len({f["seccion_csv"] for f in filas_csv}),
            "filas_sin_clave_enlazable": sum(1 for f in filas_csv if not f["claves"]),
            "enlaces_aportados_por_el_glosario": derivadas,
            "funcs_sin_categoria": len(funcs_sin_categoria),
            "por_ambito": {a: sum(1 for t in terminos if t["ambito"] == a)
                           for a in sorted({t["ambito"] for t in terminos})},
        },
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Salidas
# ═══════════════════════════════════════════════════════════════════════════════

def informe_texto(inv: dict) -> str:
    r = inv["resumen"]
    out = [
        "INVENTARIO DEL GLOSARIO — F0",
        "=" * 62,
        f"Categorías canónicas (manifiesto) ....... {r['categorias_canonicas']:>4}",
        f"Términos únicos a documentar ............ {r['terminos_totales']:>4}",
        f"  · con categoría canónica adjudicada ... {r['con_categoria']:>4}",
        f"  · HUÉRFANOS (sin categoría) ........... {r['sin_categoria']:>4}",
        f"  · publicados en el CSV ................ {r['en_csv']:>4}",
        f"  · sólo CSV (no salen en la Tabla) ..... {r['solo_csv']:>4}",
        f"  · sólo Tabla (no salen en el CSV) ..... {r['solo_tabla']:>4}",
        f"  · con fórmula ya escrita (registry) ... {r['con_registry']:>4}",
        f"  · YA documentados en glossary.js ...... {r['documentados']:>4}",
        "",
        f"Filas del CSV ........................... {r['filas_csv']:>4}",
        f"Secciones del CSV ....................... {r['secciones_csv']:>4}",
        f"  · filas sin clave enlazable (derivadas)  {r['filas_sin_clave_enlazable']:>4}",
        f"  · enlaces recuperados vía glosario ..... {r['enlaces_aportados_por_el_glosario']:>4}",
        "",
        "CARGA POR CATEGORÍA CANÓNICA",
        "-" * 62,
    ]
    por_cat = defaultdict(list)
    for t in inv["terminos"]:
        por_cat[t["categoria"]].append(t)
    for c in inv["manifiesto"]:
        ts = por_cat.get(c["id"], [])
        pend = sum(1 for t in ts if not t["documentada"])
        out.append(f"  {c['indice']:>6}. {c['titulo'][:44]:<44} {len(ts):>3} términos ({pend} pendientes)")
    huerfanos = por_cat.get(None, [])
    if huerfanos:
        out += ["", f"HUÉRFANOS — emitidos sin categoría canónica ({len(huerfanos)})", "-" * 62]
        out.append("  " + ", ".join(f"{t['ambito']}:{t['clave']}" for t in huerfanos[:30]))
        if len(huerfanos) > 30:
            out.append(f"  … y {len(huerfanos) - 30} más")

    out += ["", "HALLAZGOS ESTRUCTURALES (del código, no del inventario)", "-" * 62]
    cat_por_id_h = {c["id"]: c for c in inv["manifiesto"]}
    for cid in inv["categorias_sin_renderer"]:
        c = cat_por_id_h[cid]
        out.append(f"  · «{c['indice']}. {c['titulo']}» está en el manifiesto pero NINGUNA")
        out.append(f"    función de la Tabla la rinde.")
    for a in inv["funcs_ambiguas"]:
        out.append(f"  · {a['funcion']}() emite {len(a['categorias'])} secciones "
                   f"({', '.join(a['categorias'])}): reparto de claves ambiguo.")
    for f in inv["funcs_sin_categoria"]:
        out.append(f"  · {f}() lee métricas pero no usa encabezadoDe(): rótulo hardcodeado.")

    out += ["", "PUENTE CSV → MANIFIESTO (inferido por claves compartidas)", "-" * 62]
    cat_por_id = {c["id"]: c for c in inv["manifiesto"]}
    for sec, d in sorted(inv["puente_csv"].items(), key=lambda kv: -kv[1]["filas"]):
        can = d["canonica"]
        etiqueta = f"{cat_por_id[can]['indice']}. {cat_por_id[can]['titulo']}" if can else "— SIN CORRESPONDENCIA —"
        out.append(f"  {sec[:34]:<34} ({d['filas']:>2} filas) → {etiqueta}")
    return "\n".join(out)


def informe_markdown(inv: dict) -> str:
    r = inv["resumen"]
    cat_por_id = {c["id"]: c for c in inv["manifiesto"]}
    por_cat = defaultdict(list)
    for t in inv["terminos"]:
        por_cat[t["categoria"]].append(t)

    L = [
        "# Inventario del glosario — F0",
        "",
        "> Generado por `scripts/glosario_inventario.py`. **No editar a mano**: se regenera.",
        "",
        "## Resumen",
        "",
        "| Magnitud | Valor |",
        "|---|---:|",
        f"| Categorías canónicas del manifiesto | {r['categorias_canonicas']} |",
        f"| Términos únicos a documentar | **{r['terminos_totales']}** |",
        f"| …con categoría canónica adjudicada | {r['con_categoria']} |",
        f"| …huérfanos (emitidos sin categoría) | {r['sin_categoria']} |",
        f"| …publicados en el CSV | {r['en_csv']} |",
        f"| …sólo CSV (invisibles en la Tabla) | {r['solo_csv']} |",
        f"| …sólo Tabla (ausentes del CSV) | {r['solo_tabla']} |",
        f"| …con fórmula ya escrita en `morphometric_registry.py` | {r['con_registry']} |",
        f"| …ya documentados en `glossary.js` | {r['documentados']} |",
        f"| Filas del CSV | {r['filas_csv']} |",
        f"| Secciones del CSV | {r['secciones_csv']} |",
        "",
        "## Carga por categoría canónica",
        "",
        "| Índice | Categoría | Términos | Pendientes |",
        "|---|---|---:|---:|",
    ]
    for c in inv["manifiesto"]:
        ts = por_cat.get(c["id"], [])
        pend = sum(1 for t in ts if not t["documentada"])
        L.append(f"| {c['indice']} | {c['titulo']} | {len(ts)} | {pend} |")

    L += [
        "",
        "## Puente CSV → manifiesto",
        "",
        "Correspondencia **inferida por las claves de métrica que ambas superficies comparten**,",
        "no declarada en ninguna parte del código. Es exactamente el mapa que hoy falta para",
        "leer un CSV de MAO sin el código delante.",
        "",
        "| Sección del CSV | Filas | Categoría canónica inferida |",
        "|---|---:|---|",
    ]
    for sec, d in sorted(inv["puente_csv"].items(), key=lambda kv: -kv[1]["filas"]):
        can = d["canonica"]
        etiqueta = f"`{cat_por_id[can]['indice']}` {cat_por_id[can]['titulo']}" if can else "**sin correspondencia**"
        L.append(f"| {sec} | {d['filas']} | {etiqueta} |")

    L += ["", "## Hallazgos estructurales", "",
          "Salieron al construir el inventario. Son defectos del código, no del script.", ""]
    for cid in inv["categorias_sin_renderer"]:
        c = cat_por_id[cid]
        L.append(f"- **`{c['indice']}. {c['titulo']}`** está declarada en el manifiesto pero "
                 "ninguna función de la Tabla Completa la rinde.")
    for a in inv["funcs_ambiguas"]:
        L.append(f"- `{a['funcion']}()` emite {len(a['categorias'])} secciones "
                 f"(`{'`, `'.join(a['categorias'])}`) desde un solo cuerpo: sus claves no se "
                 "pueden repartir automáticamente y quedan atribuidas a todas.")
    for f in inv["funcs_sin_categoria"]:
        L.append(f"- `{f}()` lee métricas pero no llama a `encabezadoDe()`: rotula a mano.")

    L += ["", "## Términos por categoría", ""]
    for c in inv["manifiesto"]:
        ts = sorted(por_cat.get(c["id"], []), key=lambda t: t["clave"])
        if not ts:
            continue
        L += [f"### {c['indice']}. {c['titulo']}", "",
              "| Clave | Ámbito | CSV | Fórmula (registry) | Documentada |",
              "|---|---|---|---|---|"]
        for t in ts:
            csv = "<br>".join(t["en_csv"]) if t["en_csv"] else "—"
            frm = f"`{t['registry']['formula']}`" if t["registry"] else "—"
            L.append(f"| `{t['clave']}` | {t['ambito']} | {csv} | {frm} | "
                     f"{'sí' if t['documentada'] else 'no'} |")
        L.append("")

    huerfanos = sorted(por_cat.get(None, []), key=lambda t: t["clave"])
    if huerfanos:
        L += [f"### Huérfanos — sin categoría canónica ({len(huerfanos)})", "",
              "Claves que alguna superficie emite pero que ninguna sección de la Tabla adjudica.",
              "Cada una es, o bien una métrica sin hogar en el índice, o bien código muerto.", "",
              "| Clave | Ámbito | CSV |", "|---|---|---|"]
        for t in huerfanos:
            L.append(f"| `{t['clave']}` | {t['ambito']} | "
                     f"{'<br>'.join(t['en_csv']) if t['en_csv'] else '—'} |")
        L.append("")
    return "\n".join(L)


def main() -> int:
    ap = argparse.ArgumentParser(description="Inventario F0 del glosario de MAO Plus")
    ap.add_argument("--md", metavar="FILE", help="escribe el informe markdown")
    ap.add_argument("--json", metavar="FILE", help="escribe el inventario en JSON")
    args = ap.parse_args()

    inv = construir_inventario()
    print(informe_texto(inv))

    if args.md:
        Path(args.md).write_text(informe_markdown(inv), encoding="utf-8")
        print(f"\n→ markdown: {args.md}")
    if args.json:
        Path(args.json).write_text(json.dumps(inv, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"→ json: {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
