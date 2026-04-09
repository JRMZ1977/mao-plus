#!/usr/bin/env python3
"""
MAO Plus — Fase 1: Modularización
Extrae CSS y JS del monolítico index.html hacia archivos separados.
Genera un index.html limpio que referencia los módulos.

Uso: python3 modularize.py
"""

import os, shutil, sys

BASE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(BASE, 'index.html')

# ── Directorios destino ─────────────────────────────────────────────────────
CSS_DIR = os.path.join(BASE, 'css')
JS_DIR  = os.path.join(BASE, 'js')
os.makedirs(CSS_DIR, exist_ok=True)
os.makedirs(JS_DIR,  exist_ok=True)

# ── Leer fuente ─────────────────────────────────────────────────────────────
print(f"Leyendo {SRC} ...")
with open(SRC, 'r', encoding='utf-8') as f:
    lines = f.readlines()       # lista de cadenas con \n al final
total = len(lines)
print(f"Total líneas: {total}")

# Helper: extraer rango 1-based incluyendo ambos extremos
def extract(line_start, line_end):
    """Devuelve líneas [line_start..line_end] (1-based, inclusivo)."""
    return lines[line_start - 1 : line_end]

def write_file(path, content_lines, header=None):
    with open(path, 'w', encoding='utf-8') as f:
        if header:
            f.write(header + '\n')
        f.writelines(content_lines)
    kb = os.path.getsize(path) / 1024
    print(f"  ✓ {os.path.relpath(path, BASE):<45} {kb:7.1f} KB  ({len(content_lines)} líneas)")

# ============================================================================
# 1. CSS → css/main.css
#    <style> abre línea 22; contenido 23-4602; </style> línea 4603
# ============================================================================
print("\n[1] Extrayendo CSS ...")
css_lines = extract(23, 4602)
header_css = (
    "/*\n"
    " * MAO Plus — Estilos principales\n"
    " * Extraído de index.html en Fase 1 de modularización\n"
    " */\n"
)
write_file(os.path.join(CSS_DIR, 'main.css'), css_lines, header_css)

# ============================================================================
# 2. JavaScript — bloque principal <script> líneas 6512-64663
#    (el contenido real empieza en 6513; </script> en 64663)
# ============================================================================
print("\n[2] Extrayendo módulos JavaScript del bloque principal ...")

# 2.1 toast.js  —  lines 6513..6577
write_file(
    os.path.join(JS_DIR, 'toast.js'),
    extract(6513, 6577),
    '// MAO Plus — Toast Manager'
)

# 2.2 progress.js  —  lines 6578..6825
write_file(
    os.path.join(JS_DIR, 'progress.js'),
    extract(6578, 6825),
    '// MAO Plus — Sistema de indicadores de progreso'
)

# 2.3 project-manager.js  —  lines 6826..8805
write_file(
    os.path.join(JS_DIR, 'project-manager.js'),
    extract(6826, 8805),
    '// MAO Plus — Gestión de Proyectos (ProjectManager)'
)

# 2.4 file-io.js  —  lines 8806..9075
write_file(
    os.path.join(JS_DIR, 'file-io.js'),
    extract(8806, 9075),
    '// MAO Plus — I/O de archivos de proyecto (.mao)'
)

# 2.5 projects-ui.js  —  lines 9076..9555
write_file(
    os.path.join(JS_DIR, 'projects-ui.js'),
    extract(9076, 9555),
    '// MAO Plus — UI del panel de proyectos'
)

# 2.6 collection.js  —  lines 9556..13065
write_file(
    os.path.join(JS_DIR, 'collection.js'),
    extract(9556, 13065),
    '// MAO Plus — Explorador de colecciones y visor de análisis'
)

# 2.7 tooltips.js  —  lines 13066..13335
write_file(
    os.path.join(JS_DIR, 'tooltips.js'),
    extract(13066, 13335),
    '// MAO Plus — Sistema de tooltips y datos de métricas'
)

# 2.8 analysis-core.js  —  lines 13336..64402  (IIFE principal)
write_file(
    os.path.join(JS_DIR, 'analysis-core.js'),
    extract(13336, 64402),
    '// MAO Plus — Motor de análisis morfométrico (IIFE principal)'
)

# 2.9 theme.js  —  lines 64403..64438
write_file(
    os.path.join(JS_DIR, 'theme.js'),
    extract(64403, 64438),
    '// MAO Plus — Sistema de modo oscuro'
)

# 2.10 diagnostics.js  —  lines 64439..64662  (antes del </script>)
write_file(
    os.path.join(JS_DIR, 'diagnostics.js'),
    extract(64439, 64662),
    '// MAO Plus — Funciones de diagnóstico de consola'
)

# ============================================================================
# 3. welcome.js — segundo <script> block: líneas 64714-64748
#    contenido 64715..64747
# ============================================================================
print("\n[3] Extrayendo welcome.js ...")
write_file(
    os.path.join(JS_DIR, 'welcome.js'),
    extract(64715, 64747),
    '// MAO Plus — Sistema de bienvenida / guía de inicio'
)

# ============================================================================
# 4. comparator.js — tercer <script> block: líneas 65251-70204
#    contenido 65252..70203
# ============================================================================
print("\n[4] Extrayendo comparator.js ...")
write_file(
    os.path.join(JS_DIR, 'comparator.js'),
    extract(65252, 70203),
    '// MAO Plus — Comparador Multi-Objeto (CMO)'
)

# ============================================================================
# 5. cmo-standalone.js — cuarto <script> block: líneas 70209-70417
#    contenido 70210..70416
# ============================================================================
print("\n[5] Extrayendo cmo-standalone.js ...")
write_file(
    os.path.join(JS_DIR, 'cmo-standalone.js'),
    extract(70210, 70416),
    '// MAO Plus — Inicialización CMO standalone (ventana hija Electron)'
)

# ============================================================================
# 6. Construir el nuevo index.html
# ============================================================================
print("\n[6] Construyendo nuevo index.html ...")

# Secciones HTML que se conservan intactas:
#   head base (lines 1-21) + </head> replaced by link tag
#   body HTML (lines 4605-6503)
#   script libs (lines 6504-6511)
#   --- JS modules (external) ---
#   modal HTML (lines 64664-64713)
#   bienvenida welcome (external js/welcome.js)
#   projects + collection HTML (lines 64749-65250)
#   --- comparator.js ---
#   inter-script HTML (lines 70205-70208) if any
#   --- cmo-standalone.js ---
#   </body> (line 70419)

def get_lines(start, end):
    return ''.join(extract(start, end))

new_html = []

# 6.1 <head> opening to closing comment (lines 1-22, inclusive)
new_html.append(get_lines(1, 22))

# 6.2 Replace <style>...</style> with <link>
new_html.append('  <link rel="stylesheet" href="css/main.css">\n')

# 6.3 </head> (line 4604)
new_html.append(get_lines(4604, 4604))

# 6.4 <body> + HTML structure (lines 4605-6503)
new_html.append(get_lines(4605, 6503))

# 6.5 Libraries (keep as-is: lines 6504-6511)
new_html.append(get_lines(6504, 6511))

# 6.6 Inject JS modules en lugar del bloque <script> (6512-64663)
new_html.append('\n  <!-- ================================================================\n')
new_html.append('       MAO Plus — Módulos JavaScript (Fase 1 - Modularización)\n')
new_html.append('       ================================================================ -->\n')
modules = [
    'js/toast.js',
    'js/progress.js',
    'js/project-manager.js',
    'js/file-io.js',
    'js/projects-ui.js',
    'js/collection.js',
    'js/tooltips.js',
    'js/analysis-core.js',
    'js/theme.js',
    'js/diagnostics.js',
]
for m in modules:
    new_html.append(f'  <script src="{m}"></script>\n')

# 6.7 Modal HTML (lines 64664-64713)
new_html.append('\n')
new_html.append(get_lines(64664, 64713))

# 6.8 welcome.js (replaces <script> block at 64714-64748)
new_html.append('\n  <script src="js/welcome.js"></script>\n')

# 6.9 Projects + collection HTML (lines 64749-65250)
new_html.append(get_lines(64749, 65250))

# 6.10 comparator.js (replaces <script> block at 65251-70204)
new_html.append('\n  <script src="js/comparator.js"></script>\n')

# 6.11 Any HTML between script blocks (lines 70205-70208)
between = get_lines(70205, 70208).strip()
if between:
    new_html.append('\n' + get_lines(70205, 70208))

# 6.12 cmo-standalone.js (replaces <script> block at 70209-70417)
new_html.append('\n  <script src="js/cmo-standalone.js"></script>\n')

# 6.13 Closing tags (lines 70418-70419)
new_html.append(get_lines(70418, total))

# Write index.html
new_index_path = os.path.join(BASE, 'index.html')

# Backup primero
backup_path = os.path.join(BASE, 'index.html.backup')
if not os.path.exists(backup_path):
    shutil.copy2(SRC, backup_path)
    print(f"\n  Backup creado: index.html.backup")

with open(new_index_path, 'w', encoding='utf-8') as f:
    f.writelines(new_html)

new_size = os.path.getsize(new_index_path)
orig_size = os.path.getsize(backup_path)
print(f"  ✓ index.html  {new_size/1024:.1f} KB  (original: {orig_size/1024:.1f} KB)")

# ============================================================================
# 7. Resumen
# ============================================================================
print("\n" + "="*60)
print("FASE 1 COMPLETADA — Estructura generada:")
print("="*60)
for root, dirs, files in os.walk(BASE):
    dirs[:] = [d for d in sorted(dirs) if d not in ('libs',) and not d.startswith('.')]
    level = root.replace(BASE, '').count(os.sep)
    indent = '  ' * level
    folder = os.path.basename(root)
    if root != BASE:
        print(f"{indent}{folder}/")
    subindent = '  ' * (level + 1)
    for fn in sorted(files):
        if fn.endswith(('.html', '.css', '.js')) and fn != 'modularize.py':
            fp = os.path.join(root, fn)
            kb = os.path.getsize(fp) / 1024
            print(f"{subindent}{fn:<45} {kb:7.1f} KB")
print()
print("Archivos raíz:")
for fn in sorted(os.listdir(BASE)):
    fp = os.path.join(BASE, fn)
    if os.path.isfile(fp) and fn.endswith(('.html', '.py')):
        kb = os.path.getsize(fp) / 1024
        print(f"  {fn:<45} {kb:7.1f} KB")
