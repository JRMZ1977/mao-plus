#!/usr/bin/env python3
"""
ADR-017 F4 — calibración del emparejamiento de plantillas contra corpus REAL.

El banco sintético (`adr017_banco_umbrales.py`) caracteriza el método sobre formas
de completitud EXACTAMENTE conocida. Eso es necesario y no es suficiente: dice cómo
se comporta el algoritmo, no si su respuesta coincide con la de un arqueólogo
mirando la pieza. Esta herramienta cierra esa mitad.

    Corpus de referencia: La Draga (DRG), fondo de cabaña 19-15.

USO — dos pasadas, y el orden IMPORTA
─────────────────────────────────────
1) Inventario y plantilla de registro (el observador aún no ha visto nada del
   programa):

     python tools/adr017_calibracion_draga.py --corpus "/ruta/DRG_19-15" --inventario

   Recorre la carpeta, lista las imágenes legibles y escribe
   `verdad_observador.csv` con una fila por pieza y las columnas a rellenar A MANO.

2) Tras rellenar el CSV, la evaluación:

     python tools/adr017_calibracion_draga.py --corpus "/ruta/DRG_19-15" --evaluar

   Corre el pipeline real (detección → contorno → emparejamiento) y compara con la
   verdad del observador. Emite un informe Markdown con ICC, Bland-Altman y κ.

POR QUÉ EN ESE ORDEN — el inventario NO escribe la respuesta de la máquina en el
CSV, a propósito. Si el observador ve primero lo que dijo el programa, su juicio
deja de ser independiente y el acuerdo medido queda inflado: no se estaría midiendo
concordancia sino anclaje. Es el mismo cuidado que exige cualquier estudio de
fiabilidad inter-observador.

ESTADÍSTICOS Y POR QUÉ ESTOS
────────────────────────────
· ICC(2,1), efectos aleatorios de dos vías, acuerdo ABSOLUTO, medida individual
  (Shrout & Fleiss 1979, caso 2; McGraw & Wong 1996, tabla 4). Se usa acuerdo
  absoluto y no consistencia porque aquí un sesgo sistemático SÍ es un error: no
  queremos «correlaciona bien» sino «da el mismo número». Bandas de lectura de
  Koo & Li (2016): <0,50 pobre · 0,50-0,75 moderado · 0,75-0,90 bueno · >0,90
  excelente.
· Bland-Altman (Bland & Altman 1986): un coeficiente de correlación alto convive
  con un sesgo grande; lo que interesa al usuario es «¿cuánto puede desviarse esta
  medición de la mía?», que son los límites de acuerdo. Se añade la comprobación
  de sesgo PROPORCIONAL (regresión de la diferencia sobre la media, Bland & Altman
  1999): el banco sintético ya avisó de que la elipse fragmentaria se sobreestima
  más cuanto menos arco queda.
· κ de Cohen (1960) para el tipo de plantilla, que es nominal, no continuo.
· Tasa de rechazo: con qué frecuencia el programa dice «sin plantilla» donde el
  observador sí ve una forma ideal. Es el coste real de los umbrales calibrados en
  F4 sobre piezas reales, que es justo lo que el banco sintético NO puede saber.

Este archivo no modifica nada del corpus: sólo lee.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import math
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from python.modules import contour, detection, shape_template  # noqa: E402

EXT_IMAGEN = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp"}
# RAW de cámara: no los lee cv2 directamente. Se listan aparte para que el usuario
# sepa que existen y que la calibración usó el derivado JPG, no el RAW.
EXT_RAW = {".cr2", ".cr3", ".nef", ".arw", ".dng", ".raf", ".orf"}

CSV_VERDAD = "verdad_observador.csv"
CAMPOS = ["pieza", "archivo", "objeto", "forma_ideal",
          "completitud_observada_pct", "seguridad_observador", "notas"]

REPERTORIO = ["circulo", "elipse"]   # vía analítica; --repertorio para ampliarlo


# ── Descubrimiento del corpus ───────────────────────────────────────────────

def inventariar(raiz: Path):
    imgs, raws = [], []
    for p in sorted(raiz.rglob("*")):
        if not p.is_file() or p.name.startswith("."):
            continue
        ext = p.suffix.lower()
        if ext in EXT_IMAGEN:
            imgs.append(p)
        elif ext in EXT_RAW:
            raws.append(p)
    return imgs, raws


def _id_pieza(p: Path, raiz: Path) -> str:
    rel = p.relative_to(raiz)
    return str(rel.with_suffix("")).replace("/", "·")


# ── Pipeline real de MAO ────────────────────────────────────────────────────

async def _contorno_de(ruta: Path, indice_objeto: int):
    """detección → contorno, exactamente el mismo camino que usa la aplicación."""
    datos = ruta.read_bytes()
    det = await detection.detect(datos, separate_touching=True)
    objs = det.get("objects", [])
    if not objs:
        return None, "la detección no encontró objetos"
    if indice_objeto >= len(objs):
        return None, f"sólo se detectaron {len(objs)} objeto(s)"
    o = objs[indice_objeto]
    b = o["bbox"]
    ext = await contour.extract(datos, (b["x"], b["y"], b["w"], b["h"]))
    pts = ext.get("points") or []
    if len(pts) < 12:
        return None, f"contorno insuficiente ({len(pts)} puntos)"
    return pts, None


async def _emparejar(pts, repertorio):
    return await shape_template.match(pts, templates=repertorio)


# ── Estadísticos de concordancia ────────────────────────────────────────────

def icc21(a, b):
    """ICC(2,1) — acuerdo absoluto, medida individual. n sujetos × k=2 jueces.

    Shrout & Fleiss (1979) caso 2; forma computacional de McGraw & Wong (1996).
    Devuelve (icc, ic95) con el intervalo por F cuando scipy esté disponible.
    """
    n, k = len(a), 2
    if n < 3:
        return None, None
    filas = [(x, y) for x, y in zip(a, b)]
    gran = sum(x + y for x, y in filas) / (n * k)
    med_fila = [(x + y) / k for x, y in filas]
    med_col = [sum(x for x, _ in filas) / n, sum(y for _, y in filas) / n]

    ss_fila = k * sum((m - gran) ** 2 for m in med_fila)
    ss_col = n * sum((m - gran) ** 2 for m in med_col)
    ss_tot = sum((v - gran) ** 2 for f in filas for v in f)
    ss_err = ss_tot - ss_fila - ss_col

    ms_fila = ss_fila / (n - 1)
    ms_col = ss_col / (k - 1)
    ms_err = ss_err / ((n - 1) * (k - 1))

    den = ms_fila + (k - 1) * ms_err + k * (ms_col - ms_err) / n
    if den <= 0:
        return None, None
    icc = (ms_fila - ms_err) / den

    ic = None
    try:
        from scipy import stats
        if ms_err <= 0:
            # Acuerdo perfecto: F es infinito y el intervalo por F queda indefinido
            # (sale 0/0). Se informa el punto sin intervalo en vez de un NaN.
            raise ZeroDivisionError
        fv = ms_fila / ms_err
        df1, df2 = n - 1, (n - 1) * (k - 1)
        fl = fv / stats.f.ppf(0.975, df1, df2)
        fu = fv * stats.f.ppf(0.975, df2, df1)
        ic = ((fl - 1) / (fl + k - 1), (fu - 1) / (fu + k - 1))
    except Exception:
        pass
    return icc, ic


def bland_altman(maquina, observador):
    """Sesgo, límites de acuerdo y comprobación de sesgo proporcional."""
    d = [m - o for m, o in zip(maquina, observador)]
    prom = [(m + o) / 2 for m, o in zip(maquina, observador)]
    n = len(d)
    sesgo = statistics.fmean(d)
    sd = statistics.stdev(d) if n > 1 else 0.0
    try:
        from scipy import stats
        t = stats.t.ppf(0.975, n - 1)
    except Exception:
        t = 1.96
    ee = sd / math.sqrt(n) if n else 0.0
    res = {"n": n, "sesgo": sesgo, "sd": sd,
           "loa": (sesgo - 1.96 * sd, sesgo + 1.96 * sd),
           "ic_sesgo": (sesgo - t * ee, sesgo + t * ee)}
    # Sesgo proporcional: ¿la diferencia crece con la magnitud? (B&A 1999).
    # Se exigen DOS cosas para dar la alarma, y por separado: que la pendiente sea
    # significativa (con el valor t que corresponde a n, no un 2 fijo) y que la
    # DERIVA que implica a lo largo del corpus sea grande. Con pocas piezas y
    # residuos diminutos una pendiente de −0,026 pp/pp sale «significativa» y no
    # significa nada: avisaría de un problema inexistente.
    if n >= 10 and len(set(prom)) > 1:
        mx = statistics.fmean(prom)
        my = statistics.fmean(d)
        sxx = sum((x - mx) ** 2 for x in prom)
        sxy = sum((x - mx) * (y - my) for x, y in zip(prom, d))
        pend = sxy / sxx if sxx else 0.0
        resid = [y - (my + pend * (x - mx)) for x, y in zip(prom, d)]
        se_pend = (math.sqrt(sum(r * r for r in resid) / (n - 2) / sxx)
                   if n > 2 and sxx else 0.0)
        deriva = abs(pend) * (max(prom) - min(prom))
        # se_pend == 0 es ajuste PERFECTO, o sea el caso más significativo posible;
        # tratarlo como «no significativo» (dividir por cero y rendirse) invertía
        # justo el veredicto en el caso más claro.
        sig_estad = (abs(pend) > 1e-12 if se_pend <= 0
                     else abs(pend / se_pend) > t)
        res["pendiente"] = pend
        res["deriva"] = deriva
        res["pendiente_significativa"] = sig_estad and deriva >= 5.0
    return res


def kappa_cohen(a, b):
    """κ nominal sobre el tipo de plantilla."""
    cats = sorted(set(a) | set(b))
    n = len(a)
    if n == 0 or len(cats) < 2:
        return None
    obs = sum(1 for x, y in zip(a, b) if x == y) / n
    esp = sum((a.count(c) / n) * (b.count(c) / n) for c in cats)
    return (obs - esp) / (1 - esp) if esp < 1 else None


# ── Modos ───────────────────────────────────────────────────────────────────

def modo_inventario(raiz: Path, indice_objeto: int):
    imgs, raws = inventariar(raiz)
    print(f"Corpus: {raiz}")
    print(f"  {len(imgs)} imagen(es) legible(s) · {len(raws)} RAW (no legibles por cv2)")
    if raws:
        print("  RAW encontrados (la calibración usará el derivado JPG si existe):")
        for p in raws[:5]:
            print(f"    {p.name}")
        if len(raws) > 5:
            print(f"    … y {len(raws) - 5} más")
    if not imgs:
        print("\nNo hay imágenes legibles. ¿Es la carpeta correcta?")
        return 1

    destino = raiz / CSV_VERDAD
    if destino.exists():
        print(f"\n{destino} ya existe — NO se sobrescribe.")
        print("Bórrelo a mano si quiere regenerarlo (perdería lo ya anotado).")
        return 1
    with destino.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=CAMPOS)
        w.writeheader()
        for p in imgs:
            w.writerow({"pieza": _id_pieza(p, raiz), "archivo": str(p.relative_to(raiz)),
                        "objeto": indice_objeto, "forma_ideal": "",
                        "completitud_observada_pct": "", "seguridad_observador": "",
                        "notas": ""})
    print(f"\nEscrito: {destino}")
    print("""
Rellene a mano, SIN mirar antes lo que dice el programa:

  forma_ideal                 circulo | elipse | ninguna     (ninguna = la pieza no
                              deriva de una forma ideal; en lítica es el caso normal
                              y es una respuesta válida, no un hueco)
  completitud_observada_pct   0-100, su estimación del porcentaje conservado de esa
                              forma. Déjelo vacío si forma_ideal = ninguna.
  seguridad_observador        alta | media | baja  (permite repetir el análisis sólo
                              con las piezas de lectura segura)
  objeto                      índice del objeto dentro de la foto (0 = el primero que
                              detecta MAO). Cámbielo si la foto trae escala o carta de
                              color y el artefacto no es el primero.

Luego:  python tools/adr017_calibracion_draga.py --corpus "…" --evaluar
""")
    return 0


async def modo_evaluar(raiz: Path, salida: Path, repertorio, solo_seguras: bool):
    origen = raiz / CSV_VERDAD
    if not origen.exists():
        print(f"Falta {origen}. Corra primero con --inventario.")
        return 1
    with origen.open(encoding="utf-8-sig") as fh:
        filas = [r for r in csv.DictReader(fh)]

    anotadas = [r for r in filas if (r.get("forma_ideal") or "").strip()]
    if not anotadas:
        print(f"{origen} no tiene ninguna fila anotada todavía.")
        return 1
    if solo_seguras:
        anotadas = [r for r in anotadas
                    if (r.get("seguridad_observador") or "").strip().lower() == "alta"]
        if not anotadas:
            print("Ninguna fila con seguridad_observador = alta.")
            return 1

    print(f"Evaluando {len(anotadas)} pieza(s) anotada(s)…")
    res = []
    for i, r in enumerate(anotadas, 1):
        ruta = raiz / r["archivo"]
        etiqueta = r["pieza"]
        print(f"  [{i}/{len(anotadas)}] {etiqueta}", flush=True)
        fila = {"pieza": etiqueta,
                "obs_forma": (r["forma_ideal"] or "").strip().lower(),
                "obs_comp": _num(r.get("completitud_observada_pct")),
                "maq_forma": "error", "maq_comp": None, "nota": ""}
        try:
            idx = int(float(r.get("objeto") or 0))
            pts, err = await _contorno_de(ruta, idx)
            if err:
                fila["nota"] = err
            else:
                m = await _emparejar(pts, repertorio)
                fila["maq_forma"] = m.get("plantilla_tipo") or "ninguna"
                fila["maq_comp"] = m.get("plantilla_completitud")
                fila["nota"] = m.get("motivo_rechazo") or ""
        except Exception as exc:                      # noqa: BLE001 — una pieza mala
            fila["nota"] = f"{type(exc).__name__}: {exc}"   # no puede tumbar la corrida
        res.append(fila)

    informe = _redactar(res, raiz, repertorio, solo_seguras)
    salida.write_text(informe, encoding="utf-8")
    print("\n" + informe)
    print(f"\nInforme escrito en: {salida}")
    return 0


def _num(v):
    try:
        return float(str(v).strip().replace(",", "."))
    except (TypeError, ValueError):
        return None


def _redactar(res, raiz, repertorio, solo_seguras):
    n = len(res)
    errores = [r for r in res if r["maq_forma"] == "error"]
    # Concordancia nominal: «ninguna» normalizado en ambos lados.
    norm = lambda s: s if s in ("circulo", "elipse") else "ninguna"   # noqa: E731
    obs_f = [norm(r["obs_forma"]) for r in res if r["maq_forma"] != "error"]
    maq_f = [norm(r["maq_forma"]) for r in res if r["maq_forma"] != "error"]
    acierto = (sum(1 for a, b in zip(obs_f, maq_f) if a == b) / len(obs_f)
               if obs_f else 0.0)
    k = kappa_cohen(obs_f, maq_f)

    # Pares con número en AMBOS lados: lo único sobre lo que cabe medir acuerdo.
    pares = [(r["maq_comp"], r["obs_comp"]) for r in res
             if r["maq_comp"] is not None and r["obs_comp"] is not None]
    # Rechazos donde el observador SÍ veía forma: el coste de los umbrales.
    rechazo_con_forma = [r for r in res
                         if r["maq_forma"] == "ninguna" and norm(r["obs_forma"]) != "ninguna"]
    # Y el error contrario: plantilla donde el observador no ve ninguna.
    falso_positivo = [r for r in res
                      if r["maq_forma"] in ("circulo", "elipse")
                      and norm(r["obs_forma"]) == "ninguna"]

    L = []
    A = L.append
    A("# ADR-017 F4 — calibración contra corpus real\n")
    A(f"Corpus: `{raiz}`  ")
    A(f"Repertorio evaluado: {', '.join(repertorio)}  ")
    A(f"Umbrales en vigor: círculo {shape_template._MIN_ARCO_FRACCION['circulo']:.2f} · "
      f"elipse {shape_template._MIN_ARCO_FRACCION['elipse']:.2f} · "
      f"completitud mínima {shape_template._MIN_COMPLETITUD:.2f}  ")
    if solo_seguras:
        A("Filtrado a piezas con `seguridad_observador = alta`.  ")
    A(f"\nPiezas anotadas: **{n}** · con fallo de pipeline: {len(errores)}\n")

    A("## 1. ¿Acierta el TIPO de forma?\n")
    A(f"- Coincidencia exacta: **{acierto*100:.0f} %** ({len(obs_f)} piezas)")
    A(f"- κ de Cohen: **{k:.2f}**" if k is not None else "- κ de Cohen: no calculable")
    A(f"- El programa rechaza donde el observador SÍ ve forma: "
      f"**{len(rechazo_con_forma)}** pieza(s)")
    A(f"- El programa propone forma donde el observador no ve ninguna: "
      f"**{len(falso_positivo)}** pieza(s)\n")
    if rechazo_con_forma:
        A("Rechazos a revisar (son el coste directo de los umbrales de F4):\n")
        for r in rechazo_con_forma[:15]:
            A(f"  - `{r['pieza']}` — observador: {r['obs_forma']} "
              f"{r['obs_comp'] if r['obs_comp'] is not None else ''} · motivo: {r['nota']}")
        A("")

    A("## 2. ¿Coincide el NÚMERO de completitud?\n")
    if len(pares) < 3:
        A(f"Sólo {len(pares)} pieza(s) con número en ambos lados: insuficiente para "
          "ICC o Bland-Altman. Se necesitan al menos 3, y para un intervalo de "
          "confianza útil bastantes más.\n")
    else:
        maq = [p[0] for p in pares]
        obs = [p[1] for p in pares]
        icc, ic = icc21(maq, obs)
        ba = bland_altman(maq, obs)
        errs = [abs(m - o) for m, o in pares]
        A(f"Pares comparables: **{len(pares)}**\n")
        if icc is not None:
            txt = f"**{icc:.3f}**"
            if ic:
                txt += f" (IC 95 % {ic[0]:.3f} – {ic[1]:.3f})"
            A(f"- **ICC(2,1)**, acuerdo absoluto: {txt} — {_leer_icc(icc)}")
        A(f"- **Sesgo** (máquina − observador): **{ba['sesgo']:+.1f} pp** "
          f"(IC 95 % {ba['ic_sesgo'][0]:+.1f} a {ba['ic_sesgo'][1]:+.1f})")
        A(f"- **Límites de acuerdo** (Bland-Altman): "
          f"{ba['loa'][0]:+.1f} a {ba['loa'][1]:+.1f} pp")
        A(f"- Error absoluto medio: **{statistics.fmean(errs):.1f} pp** · "
          f"máximo: **{max(errs):.1f} pp**")
        if "pendiente" in ba:
            A(f"- Sesgo proporcional: pendiente {ba['pendiente']:+.3f} pp/pp "
              f"→ {ba['deriva']:.1f} pp de deriva a lo largo del corpus"
              + (" — **relevante**: el desacuerdo depende de la magnitud"
                 if ba["pendiente_significativa"] else " — no relevante"))
        else:
            A("- Sesgo proporcional: no se evalúa con menos de 10 pares "
              "(con tan pocos, el contraste no tiene potencia y da falsas alarmas)")
        A("")
        A("> El sesgo importa más que la correlación: un ICC alto convive con un "
          "desplazamiento sistemático. Si los límites de acuerdo son más anchos de lo "
          "que la interpretación arqueológica tolera, el número no sirve para esa "
          "interpretación aunque correlacione bien.\n")

    A("## 3. Tabla pieza a pieza\n")
    A("| pieza | observador | máquina | dif (pp) | nota |")
    A("|---|---|---|---|---|")
    for r in res:
        o = f"{r['obs_forma']} {r['obs_comp']:.0f} %" if r["obs_comp"] is not None \
            else r["obs_forma"]
        m = (f"{r['maq_forma']} {r['maq_comp']:.1f} %" if r["maq_comp"] is not None
             else r["maq_forma"])
        d = (f"{r['maq_comp'] - r['obs_comp']:+.1f}"
             if (r["maq_comp"] is not None and r["obs_comp"] is not None) else "—")
        nota = r["nota"] if len(r["nota"]) <= 70 else r["nota"][:69] + "…"
        A(f"| {r['pieza']} | {o} | {m} | {d} | {nota} |")
    A("")
    A("---")
    A("Generado por `tools/adr017_calibracion_draga.py` (ADR-017 F4).")
    return "\n".join(L)


def _leer_icc(v):
    """Bandas de Koo & Li (2016), que son convención, no ley de la naturaleza."""
    if v < 0.50:
        return "concordancia POBRE"
    if v < 0.75:
        return "concordancia moderada"
    if v < 0.90:
        return "concordancia buena"
    return "concordancia excelente"


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--corpus", required=True, help="carpeta del corpus (p. ej. DRG_19-15)")
    ap.add_argument("--inventario", action="store_true",
                    help="listar el corpus y crear la plantilla de verdad-observador")
    ap.add_argument("--evaluar", action="store_true",
                    help="comparar el pipeline real contra la verdad ya anotada")
    ap.add_argument("--objeto", type=int, default=0,
                    help="índice del objeto por foto para el inventario (0 = el primero)")
    ap.add_argument("--repertorio", default=",".join(REPERTORIO),
                    help="plantillas a evaluar, separadas por comas")
    ap.add_argument("--solo-seguras", action="store_true",
                    help="usar sólo las piezas con seguridad_observador = alta")
    ap.add_argument("--salida", default=None, help="ruta del informe Markdown")
    args = ap.parse_args()

    raiz = Path(args.corpus).expanduser()
    if not raiz.is_dir():
        print(f"No existe la carpeta: {raiz}")
        return 2
    if args.inventario == args.evaluar:
        print("Elija exactamente uno: --inventario o --evaluar.")
        return 2

    if args.inventario:
        return modo_inventario(raiz, args.objeto)

    salida = Path(args.salida).expanduser() if args.salida else raiz / "calibracion_adr017.md"
    rep = [t.strip() for t in args.repertorio.split(",") if t.strip()]
    return asyncio.run(modo_evaluar(raiz, salida, rep, args.solo_seguras))


if __name__ == "__main__":
    sys.exit(main())
