#!/usr/bin/env python3
"""
ADR-017 F4 — banco de sensibilidad de los umbrales de aceptación.

Los valores por defecto de `shape_template` (soporte mínimo 0,30 círculo / 0,45
elipse; completitud mínima 0,15) salieron de unos pocos casos durante F1/F2. Este
banco los somete a un barrido sistemático y mide qué cuesta moverlos, para que
dejen de ser criterio y pasen a estar justificados con datos.

⚠ CORPUS SINTÉTICO. Esto NO es la calibración con piezas reales que pide el gate
de F4: no hay verdad-terreno de un observador humano. Es el paso previo —
caracterizar el comportamiento del método sobre formas de completitud EXACTAMENTE
conocida, cosa que un corpus real nunca da— y el marco donde encajarán los datos
de La Draga cuando existan (ver `docs/VALIDACION-PLANTILLAS.md`).

Diseño: los umbrales se aplican DESPUÉS del ajuste (`shape_template.py:584-587`),
así que se ajusta UNA vez por forma y el barrido es post-hoc y exacto — no una
aproximación por remuestreo.

Uso:  python tools/adr017_banco_umbrales.py [--rapido]
"""

from __future__ import annotations

import argparse
import asyncio
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from python.modules import shape_template as st   # noqa: E402

CENTRO = (300.0, 300.0)
R = 100.0

# Completitudes verdaderas a muestrear. Se cruza la envolvente declarada (25 %)
# y la zona de degeneración (15 %) para ver dónde está de verdad la frontera.
COMPLETITUDES = [100, 90, 75, 60, 50, 40, 30, 25, 20, 15, 12.5, 10]
RUIDOS = [0.5, 1.2, 2.5]          # px — de contorno limpio a segmentación pobre

ENVOLVENTE_MIN = 25.0             # dentro: debe aceptar y acertar
DEGENERADO_MAX = 15.0             # debajo: debe rechazar


# ── Generación de formas ────────────────────────────────────────────────────

def _densificar(poly, paso=1.5):
    out = []
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        d = math.hypot(x2 - x1, y2 - y1)
        n = max(1, round(d / paso))
        for k in range(n):
            out.append([x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n])
    return out


def _ruido(pts, s):
    """Ruido DETERMINISTA: el banco es reproducible ejecución tras ejecución."""
    return [[x + math.sin(i * 2.3) * s, y + math.cos(i * 1.7) * s]
            for i, (x, y) in enumerate(pts)]


def _sector_circulo(frac, ruido):
    """Sector de disco cerrado por el centro — silueta de un fragmento real."""
    ang = 2 * math.pi * frac / 100.0
    n = max(40, int(600 * frac / 100.0))
    arco = [[CENTRO[0] + R * math.cos(ang * i / n),
             CENTRO[1] + R * math.sin(ang * i / n)] for i in range(n + 1)]
    poly = arco if frac >= 100 else arco + [list(CENTRO)]
    if frac >= 100:
        poly = poly[:-1]
    return _ruido(_densificar(poly), ruido)


def _sector_elipse(frac, ruido, a=120.0, b=60.0, th=0.4):
    ang = 2 * math.pi * frac / 100.0
    n = max(40, int(600 * frac / 100.0))
    co, si = math.cos(th), math.sin(th)
    arco = []
    for i in range(n + 1):
        t = ang * i / n
        px, py = a * math.cos(t), b * math.sin(t)
        arco.append([CENTRO[0] + px * co - py * si, CENTRO[1] + px * si + py * co])
    poly = arco if frac >= 100 else arco + [list(CENTRO)]
    if frac >= 100:
        poly = poly[:-1]
    return _ruido(_densificar(poly), ruido)


def _controles_negativos(ruido):
    """Formas SIN círculo ni elipse subyacente: aceptarlas sería un falso positivo."""
    ctrl = {}
    for et, w, h in [("rect_1_1", 160, 160), ("rect_2_1", 200, 100), ("rect_4_1", 240, 60)]:
        ctrl[et] = _ruido(_densificar([
            [CENTRO[0] - w / 2, CENTRO[1] - h / 2], [CENTRO[0] + w / 2, CENTRO[1] - h / 2],
            [CENTRO[0] + w / 2, CENTRO[1] + h / 2], [CENTRO[0] - w / 2, CENTRO[1] + h / 2],
        ]), ruido)
    # Estrella de 5 puntas: muy cóncava, ninguna cónica la explica.
    est = []
    for i in range(10):
        rr = R if i % 2 == 0 else R * 0.45
        a = 2 * math.pi * i / 10
        est.append([CENTRO[0] + rr * math.cos(a), CENTRO[1] + rr * math.sin(a)])
    ctrl["estrella"] = _ruido(_densificar(est), ruido)
    # Blob irregular (suma de armónicos): forma orgánica sin plantilla.
    blob = []
    for i in range(240):
        a = 2 * math.pi * i / 240
        rr = R * (1 + 0.18 * math.sin(3 * a) + 0.11 * math.cos(5 * a + 1.2))
        blob.append([CENTRO[0] + rr * math.cos(a), CENTRO[1] + rr * math.sin(a)])
    ctrl["blob"] = _ruido(_densificar(blob), ruido)
    return ctrl


# ── Ajuste (una vez por forma) ──────────────────────────────────────────────

def _match(pts):
    """Umbrales PERMISIVOS: se quieren los números crudos de cada candidato."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(
            st.match(pts, templates=["circulo", "elipse"],
                     min_arco_fraccion={"circulo": 0.0, "elipse": 0.0})
        )
    finally:
        loop.close()


def construir_banco(rapido=False):
    ruidos = [1.2] if rapido else RUIDOS
    comps = [100, 75, 50, 25, 15, 10] if rapido else COMPLETITUDES
    filas = []
    for fam, gen in (("circulo", _sector_circulo), ("elipse", _sector_elipse)):
        for frac in comps:
            for rz in ruidos:
                r = _match(gen(frac, rz))
                for c in r.get("candidatos", []):
                    if "completitud" not in c:
                        continue
                    filas.append({
                        "familia": fam, "verdad": float(frac), "ruido": rz,
                        "tipo": c["tipo"], "completitud": c["completitud"],
                        "arco": c["arco_fraccion"], "residuo": c["residuo_rms"],
                        "negativo": False,
                    })
    for rz in ruidos:
        for et, pts in _controles_negativos(rz).items():
            r = _match(pts)
            for c in r.get("candidatos", []):
                if "completitud" not in c:
                    continue
                filas.append({
                    "familia": et, "verdad": None, "ruido": rz,
                    "tipo": c["tipo"], "completitud": c["completitud"],
                    "arco": c["arco_fraccion"], "residuo": c["residuo_rms"],
                    "negativo": True,
                })
    return filas


# ── Barrido post-hoc de umbrales ────────────────────────────────────────────

def evaluar(filas, arco_c, arco_e, comp_min):
    """Aplica un juego de umbrales al banco ya ajustado y mide su coste."""
    def acepta(f):
        umbral = arco_c if f["tipo"] == "circulo" else arco_e
        return f["arco"] > umbral and f["completitud"] >= comp_min * 100

    # Dentro de la envolvente: ¿se acepta la plantilla CORRECTA, y con qué error?
    dentro = [f for f in filas if not f["negativo"] and f["verdad"] >= ENVOLVENTE_MIN]
    claves = sorted({(f["familia"], f["verdad"], f["ruido"]) for f in dentro})
    aceptadas, errores = 0, []
    for k in claves:
        cands = [f for f in dentro
                 if (f["familia"], f["verdad"], f["ruido"]) == k and acepta(f)]
        if not cands:
            continue
        mejor = min(cands, key=lambda f: f["residuo"])
        aceptadas += 1
        errores.append(abs(mejor["completitud"] - k[1]))
    tasa_ok = aceptadas / len(claves) if claves else 0.0
    mae = sum(errores) / len(errores) if errores else float("nan")
    # El error MÁXIMO es el que delata el modo degenerado: un círculo pequeño
    # encajado en parte del arco da un MAE bajo (son pocos casos) y un disparate
    # de 30 pp en el número que acaba en el CSV. Sin esta columna, F4 habría
    # aceptado unos umbrales que el banco parecía avalar.
    peor = max(errores) if errores else float("nan")

    # Por debajo de la degeneración: aceptar es INVENTAR.
    degen = [f for f in filas if not f["negativo"] and f["verdad"] <= DEGENERADO_MAX]
    k_deg = sorted({(f["familia"], f["verdad"], f["ruido"]) for f in degen})
    falsos_deg = sum(
        1 for k in k_deg
        if any(acepta(f) for f in degen if (f["familia"], f["verdad"], f["ruido"]) == k)
    )
    tasa_deg = falsos_deg / len(k_deg) if k_deg else 0.0

    # Controles negativos: aceptar es un FALSO POSITIVO de forma.
    neg = [f for f in filas if f["negativo"]]
    k_neg = sorted({(f["familia"], f["ruido"]) for f in neg})
    falsos_neg = sum(
        1 for k in k_neg
        if any(acepta(f) for f in neg if (f["familia"], f["ruido"]) == k)
    )
    tasa_neg = falsos_neg / len(k_neg) if k_neg else 0.0

    return {"cobertura": tasa_ok, "mae": mae, "peor": peor,
            "falso_degenerado": tasa_deg, "falso_negativo": tasa_neg}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rapido", action="store_true", help="menos formas (humo)")
    args = ap.parse_args()

    print("Construyendo el banco (ajuste único por forma)…", flush=True)
    filas = construir_banco(args.rapido)
    formas = len({(f["familia"], f["verdad"], f["ruido"]) for f in filas})
    print(f"  {formas} formas · {len(filas)} candidatos ajustados\n")

    print("BARRIDO DE UMBRALES")
    print(f"{'arco_c':>7} {'arco_e':>7} {'comp':>6} | {'cobertura':>10} {'MAE(pp)':>8} "
          f"{'PEOR(pp)':>9} {'falso<15%':>10} {'falso neg':>10}")
    print("-" * 82)
    rejilla = []
    for arco_c in (0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50):
        for arco_e in (0.35, 0.40, 0.45, 0.50, 0.55, 0.60):
            for comp_min in (0.10, 0.15, 0.20):
                m = evaluar(filas, arco_c, arco_e, comp_min)
                rejilla.append(((arco_c, arco_e, comp_min), m))

    # Se muestran los defectos actuales y los vecinos, no las 75 filas.
    actual = (st._MIN_ARCO_FRACCION["circulo"],
              st._MIN_ARCO_FRACCION["elipse"],
              st._MIN_COMPLETITUD)
    for params, m in rejilla:
        vecino = all(abs(a - b) < 0.06 for a, b in zip(params, actual))
        if not vecino:
            continue
        marca = "  ← ACTUAL" if params == actual else ""
        print(f"{params[0]:>7.2f} {params[1]:>7.2f} {params[2]:>6.2f} | "
              f"{m['cobertura']*100:>9.0f}% {m['mae']:>8.2f} {m['peor']:>9.1f} "
              f"{m['falso_degenerado']*100:>9.0f}% {m['falso_negativo']*100:>9.0f}%{marca}")

    # ¿Hay algún juego estrictamente mejor que el actual? «Mejor» incluye el error
    # MÁXIMO: cubrir un caso más no compensa publicar un número disparatado.
    act = dict(rejilla)[actual]
    mejores = [
        (p, m) for p, m in rejilla
        if m["falso_negativo"] <= act["falso_negativo"]
        and m["falso_degenerado"] <= act["falso_degenerado"]
        and m["cobertura"] >= act["cobertura"]
        and m["peor"] <= act["peor"] + 0.05
        and (m["mae"] < act["mae"] - 0.05 or m["cobertura"] > act["cobertura"] + 0.01)
    ]
    print("\nVEREDICTO")
    if not mejores:
        print(f"  Ningún juego DOMINA al actual ({actual[0]:.2f} / {actual[1]:.2f} / "
              f"{actual[2]:.2f}): no existe uno que a la vez cubra más, acierte más,")
        print("  no empeore el error máximo y no acepte más falsos. Los valores por")
        print("  defecto quedan justificados por el banco.")
    else:
        print(f"  {len(mejores)} juego(s) dominan al actual. Candidatos:")
        for p, m in mejores[:5]:
            print(f"    arco_c={p[0]:.2f} arco_e={p[1]:.2f} comp={p[2]:.2f} → "
                  f"cobertura {m['cobertura']*100:.0f}% · MAE {m['mae']:.2f} pp · "
                  f"peor {m['peor']:.1f} pp · falsos {m['falso_negativo']*100:.0f}%")

    print("\n⚠ Corpus SINTÉTICO. La calibración contra piezas reales con verdad-terreno")
    print("  de observador sigue pendiente — ver docs/VALIDACION-PLANTILLAS.md.")


if __name__ == "__main__":
    main()
