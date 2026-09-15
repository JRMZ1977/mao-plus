"""
MAO Plus — Emparejamiento con plantillas de forma ideal (ADR-017 F1 + F2)
=========================================================================
Infiere si un contorno es una pieza COMPLETA o el FRAGMENTO de una forma mayor,
ajustando una plantilla ideal al **margen original** del contorno y midiendo qué
fracción de esa plantilla quedó preservada.

Dos vías, mismo contrato de salida:

  **F1 · analítica** (círculo, elipse) — ajuste algebraico en forma cerrada bajo
  RANSAC. Exacta y barata, pero sólo sirve para formas con ecuación.

  **F2 · ICP sobre repertorio** (cualquier forma) — emparejamiento por ICP
  recortado contra un repertorio de plantillas: polígonos paramétricos y, sobre
  todo, formas reconstruidas desde un banco de coeficientes **EFA**
  (`registrar_plantilla_efa`). Es el puente que cierra la pregunta original del
  ADR: el repertorio EFA aporta las formas, el ICP hace el encaje parcial que la
  distancia EFA no puede hacer (§2 del ADR). Gate: reproduce lo que la vía
  analítica calcula en cerrado para círculo y elipse.

Doc: `docs/ADR-017-emparejamiento-plantillas-completitud.md` (§3 arquitectura,
§4 envolvente operativa, §5 contrato de salida, §7 invariante arqueológico).

Las tres etapas del ADR:

  E1 — segmentar el contorno en «margen original» vs «borde de fractura».
       Criterio: CONTIGÜIDAD. El margen preservado de un fragmento es UN arco
       contiguo del contorno; la fractura es el resto. Puntuar el modelo por la
       LONGITUD DEL TRAMO CONTIGUO de inliers (no por número de inliers) separa
       la fractura sin necesidad de umbrales de rectitud, que resultaron
       frágiles ante el ruido de contorno (ADR-017 §3, E1).

  E2 — ajuste robusto de la plantilla SOLO al margen original.
       RANSAC con **tolerancia absoluta** (proporcional a la diagonal del
       objeto, nunca al radio candidato: una tolerancia relativa al radio premia
       círculos gigantes ≈ recta, que declaran inlier a todo el contorno) y
       **cota de radio**.

  E3 — completitud = fracción de la LONGITUD DE ARCO de la plantilla ajustada
       que el margen preservado cubre, medida alrededor del **centro ajustado**
       y NO del centroide del fragmento. Ese error de referencia era el defecto
       que F0 retiró: el centroide de un fragmento no es el de su forma
       original, y alrededor de él todo contorno cerrado barre 360°.

Invariante arqueológico (ADR-017 §7): esto PROPONE un candidato, no dictamina.
En lítica la fractura se diagnostica por atributos de la cara ventral —talón,
bulbo, ondas, terminación—, no por la silueta (Inizan et al. 1999; Andrefsky
2005). Un objeto sin forma ideal subyacente devuelve `plantilla_tipo: "ninguna"`,
nunca una plantilla forzada.

Determinismo: el RANSAC usa una semilla fija (`_SEED`) y el ICP no usa RNG en
absoluto (arranques de rotación equiespaciados), así que dos ejecuciones sobre el
mismo contorno dan el mismo resultado — requisito de replicabilidad del repo
(ADR-013 F2), con test que lo verifica por ambas vías.

Ambigüedad de forma (medida, no teórica): un mismo fragmento puede ser
consistente con más de una forma ideal. Medio hexágono regular ES un triángulo
equilátero truncado, y el módulo lo reporta correctamente por partida doble
(50 % de un hexágono · 67 % de un triángulo). Por eso `match` publica TODOS los
candidatos con su ajuste, y el veredicto lo confirma un humano.

Referencias
-----------
Fischler & Bolles (1981) Random Sample Consensus. CACM 24(6): 381-395.
Kåsa, I. (1976) A circle fitting procedure and its error analysis.
    IEEE Trans. Instrum. Meas. 25(1): 8-14.
Halíř, R. & Flusser, J. (1998) Numerically stable direct least squares fitting
    of ellipses. Proc. WSCG'98: 125-132.  (variante estable de Fitzgibbon,
    Pilu & Fisher (1999) IEEE TPAMI 21(5): 476-480)
Orton & Hughes (2013) Pottery in Archaeology, 2ª ed. — EVEs: cada fragmento
    puntuado como fracción de la forma completa; análogo canónico de E3.
"""

from __future__ import annotations

import math
from typing import Any, Optional

import numpy as np

IMPLEMENTED = True

# ── Constantes ──────────────────────────────────────────────────────────────
_MIN_PUNTOS        = 12      # mínimo para intentar un ajuste con sentido
_TOL_REL_DIAG      = 0.02    # tolerancia de inlier = 2 % de la diagonal del objeto
_R_MAX_DIAG        = 3.0     # un «círculo» de radio > 3·diagonal es una recta
_GAP_MIN_DEG       = 8.0     # hueco angular mínimo para contar como ausencia
# Soporte mínimo del perímetro sobre la plantilla para aceptarla. La elipse exige
# MÁS que el círculo porque tiene 5 grados de libertad frente a 3: con poco arco
# queda subdeterminada y se amolda a un borde de fractura (verificado en banco:
# con un umbral común de 0.30 aceptaba un rectángulo y un sector de 45°).
#
# Valores calibrados en F4 con `tools/adr017_banco_umbrales.py` (87 formas de
# completitud exacta conocida + 15 controles negativos). Subir el círculo de 0,30
# a 0,40 y la elipse de 0,45 a 0,50 NO sacrifica ninguna medición correcta: los
# cinco casos que dejan de aceptarse venían con error de 5,4 · 10,0 · 11,3 · 15,8
# y 31,6 pp — todos el mismo modo degenerado (un círculo pequeño encajado en parte
# del arco). A cambio caen a cero los falsos positivos de forma y las aceptaciones
# por debajo del 15 % de completitud. Detalle en `docs/VALIDACION-PLANTILLAS.md`.
# Son el valor POR DEFECTO, no una constante: `match(min_arco_fraccion=…)` los
# sobrescribe, que es lo que permitirá recalibrarlos contra corpus real.
# El anillo explica DOS arcos, así que su soporte natural es mayor: pedirle lo
# mismo que al círculo sería pedirle menos. El 0,60 sale del banco, no del
# criterio: con 0,55 se aceptaba el 11 % de las formas por debajo del 15 % de
# completitud, y subirlo a 0,60 lo lleva a cero SIN coste — misma cobertura
# (92 %), mismo error medio (0,96 pp) y mismo error máximo (6,3 pp).
_MIN_ARCO_FRACCION = {"circulo": 0.40, "elipse": 0.50, "anillo": 0.60}
_MIN_COMPLETITUD   = 0.15    # por debajo, el ajuste degenera → rechazo (ADR-017 §4)
_UMBRAL_COMPLETO   = 0.93    # cobertura por encima de la cual se declara completo
_RANSAC_ITERS      = 600
_SEED              = 20260913
_N_GRID_ARCO       = 2048    # muestras para la longitud de arco de la plantilla
# Muestras de la polilínea que se publica para DIBUJAR la plantilla. No participa
# en ningún cálculo —la completitud se mide sobre `_N_GRID_ARCO`—; sólo fija el
# peso del JSON que viaja al lienzo. 128 puntos bastan para que un círculo de
# 200 px de radio se vea liso (error de cuerda < 0,1 px).
_N_CONTORNO        = 128
# La elipse tiene 2 parámetros más que el círculo y SIEMPRE ajusta al menos igual
# de bien; sólo se prefiere si mejora el residuo con margen.
_MARGEN_ELIPSE     = 0.80
_RATIO_EJES_CIRCULO = 0.95   # b/a por encima de esto ⇒ la elipse ES un círculo
_RATIO_EJES_MIN     = 0.15   # b/a por debajo de esto ⇒ la elipse ES una recta
# ── Plantilla ANILLO (corona circular: cuenta perforada, arandela, brazalete) ──
# r/R es la razón entre la perforación y el margen exterior.
_ANILLO_RATIO_MIN   = 0.15   # por debajo, el hueco es un alfiler: la pieza ES un disco
_ANILLO_RATIO_MAX   = 0.85   # por encima, el aro es un alambre y los dos círculos
                             # caen dentro de la tolerancia uno del otro
_ANILLO_SOPORTE_INT = 0.10   # arco interior contiguo mínimo, en fracción del
                             # perímetro del fragmento: sin borde de perforación
                             # preservado no hay anillo que reconocer
# El anillo explica MÁS contorno que el círculo por construcción (dos arcos en
# vez de uno). Para preferirlo no basta con que empate: tiene que explicar
# bastante más, o cualquier fragmento de disco con una muesca pasaría por anillo.
_MARGEN_ANILLO      = 0.15


# ── Utilidades geométricas ──────────────────────────────────────────────────

def _diagonal(pts: np.ndarray) -> float:
    """Diagonal del bounding box — escala de referencia del objeto."""
    dx = float(pts[:, 0].max() - pts[:, 0].min())
    dy = float(pts[:, 1].max() - pts[:, 1].min())
    return math.hypot(dx, dy)


def _largos_segmento(pts: np.ndarray) -> np.ndarray:
    """Longitud de cada segmento del contorno cerrado (len == len(pts))."""
    sig = np.roll(pts, -1, axis=0)
    return np.hypot(sig[:, 0] - pts[:, 0], sig[:, 1] - pts[:, 1])


def _tramo_contiguo_mas_largo(inliers: np.ndarray, largos: np.ndarray) -> tuple[int, int, float]:
    """
    Tramo CÍCLICO contiguo de inliers con mayor longitud de arco.

    Es el corazón de E1: el margen original preservado es un arco contiguo; los
    bordes de fractura son el resto. Devuelve (i0, i1, longitud) con i1 exclusivo
    e índices posiblemente > n (el consumidor aplica `% n`).
    """
    n = len(inliers)
    if not inliers.any():
        return 0, 0, 0.0
    if inliers.all():
        return 0, n, float(largos.sum())

    # Vectorizado: se duplica el array para que una racha que cruza el origen
    # aparezca como una sola, y las longitudes salen de una suma acumulada.
    # (La versión con bucles Python costaba ~0.5 s por objeto dentro del RANSAC.)
    inl2 = np.concatenate([inliers, inliers])
    S = np.concatenate([[0.0], np.cumsum(np.concatenate([largos, largos]))])
    bordes = np.diff(np.concatenate([[0], inl2.astype(np.int8), [0]]))
    inicios = np.nonzero(bordes == 1)[0]
    finales = np.nonzero(bordes == -1)[0]          # exclusivo
    if inicios.size == 0:
        return 0, 0, 0.0
    finales = np.minimum(finales, inicios + n)     # una racha no da más de una vuelta
    # Longitud del tramo [i, j) = suma de los segmentos que unen sus puntos.
    largos_tramo = np.where(finales > inicios + 1, S[finales - 1] - S[inicios], 0.0)
    k = int(np.argmax(largos_tramo))
    return int(inicios[k]), int(finales[k]), float(largos_tramo[k])


# ── E2a · Ajuste algebraico de círculo (Kåsa 1976) ──────────────────────────

def _ajuste_circulo(pts: np.ndarray) -> Optional[dict]:
    """
    Minimiza Σ(x² + y² + Dx + Ey + F)² — lineal en (D, E, F).
    Devuelve {"cx", "cy", "r"} o None si el sistema es degenerado.
    """
    if len(pts) < 3:
        return None
    x = pts[:, 0]
    y = pts[:, 1]
    z = x * x + y * y
    A = np.column_stack([x, y, np.ones_like(x)])
    try:
        sol, *_ = np.linalg.lstsq(A, -z, rcond=None)
    except np.linalg.LinAlgError:
        return None
    D, E, F = (float(v) for v in sol)
    cx, cy = -D / 2.0, -E / 2.0
    r2 = cx * cx + cy * cy - F
    if not np.isfinite(r2) or r2 <= 0:
        return None
    return {"cx": cx, "cy": cy, "r": math.sqrt(r2)}


# ── E2b · Ajuste directo de elipse (Halíř & Flusser 1998) ───────────────────

def _ajuste_elipse(pts: np.ndarray) -> Optional[dict]:
    """
    Ajuste directo por mínimos cuadrados con restricción 4AC − B² = 1, en la
    variante numéricamente estable de Halíř & Flusser (1998) sobre el método de
    Fitzgibbon et al. (1999). Garantiza que la cónica resultante es una elipse.

    Devuelve {"cx","cy","a","b","theta"} con a ≥ b (semiejes) y theta en radianes,
    o None si no converge a una elipse.
    """
    if len(pts) < 5:
        return None
    # Centrar y escalar mejora el condicionamiento (el resultado se des-escala).
    c0 = pts.mean(axis=0)
    esc = float(np.abs(pts - c0).max())
    if esc <= 0:
        return None
    q = (pts - c0) / esc
    x = q[:, 0:1]
    y = q[:, 1:2]

    D1 = np.hstack([x * x, x * y, y * y])          # parte cuadrática
    D2 = np.hstack([x, y, np.ones_like(x)])        # parte lineal
    S1 = D1.T @ D1
    S2 = D1.T @ D2
    S3 = D2.T @ D2
    try:
        T = -np.linalg.solve(S3, S2.T)
    except np.linalg.LinAlgError:
        return None
    M = S1 + S2 @ T
    # Pre-multiplicar por C⁻¹ de la restricción 4AC − B² = 1
    M = np.array([M[2] / 2.0, -M[1], M[0] / 2.0])
    try:
        _, evecs = np.linalg.eig(M)
    except np.linalg.LinAlgError:
        return None
    # `np.linalg.eig` puede devolver autovectores COMPLEJOS; comparar complejos
    # con `>` depende de la versión de numpy (de aviso a TypeError). Parte real
    # explícita: la restricción 4AC − B² > 0 es una condición sobre reales.
    cond = np.real(4.0 * evecs[0] * evecs[2] - evecs[1] ** 2)
    idx = np.nonzero(cond > 0)[0]
    if idx.size == 0:
        return None
    a1 = np.real(evecs[:, idx[0]])
    coef = np.concatenate([a1, (T @ a1).ravel()])
    par = _conica_a_elipse(coef)
    if par is None:
        return None
    # Des-escalar al marco original
    return {
        "cx": par["cx"] * esc + float(c0[0]),
        "cy": par["cy"] * esc + float(c0[1]),
        "a":  par["a"] * esc,
        "b":  par["b"] * esc,
        "theta": par["theta"],
    }


def _conica_a_elipse(coef: np.ndarray) -> Optional[dict]:
    """
    Cónica A x² + B xy + C y² + D x + E y + F = 0  →  (centro, semiejes, rotación).
    Requiere discriminante B² − 4AC < 0 (elipse).
    """
    A, B, C, D, E, F = (float(v) for v in coef)
    den = B * B - 4.0 * A * C
    if den >= 0 or not np.isfinite(den):
        return None
    cx = (2.0 * C * D - B * E) / den
    cy = (2.0 * A * E - B * D) / den
    raiz = math.sqrt((A - C) ** 2 + B * B)
    num = 2.0 * (A * E * E + C * D * D - B * D * E + den * F)
    t1 = num * (A + C + raiz)
    t2 = num * (A + C - raiz)
    if t1 < 0 or t2 < 0:
        return None
    ax1 = -math.sqrt(t1) / den
    ax2 = -math.sqrt(t2) / den
    if not (np.isfinite(ax1) and np.isfinite(ax2)) or ax1 <= 0 or ax2 <= 0:
        return None
    # Orientación del semieje MAYOR
    if B == 0.0:
        theta = 0.0 if A <= C else math.pi / 2.0
    else:
        theta = math.atan2(C - A - raiz, B)
    a, b = max(ax1, ax2), min(ax1, ax2)
    if ax2 > ax1:                      # el mayor era el segundo ⇒ girar 90°
        theta += math.pi / 2.0
    return {"cx": cx, "cy": cy, "a": a, "b": b, "theta": theta}


# ── Parametrización y distancia por tipo de plantilla ───────────────────────

def _param(pts: np.ndarray, tipo: str, m: dict) -> np.ndarray:
    """
    Parámetro de la plantilla para cada punto, en [0, 2π):
      círculo → ángulo polar respecto al centro ajustado
      elipse  → anomalía excéntrica (el ángulo t de (a·cos t, b·sen t))
    """
    if tipo == "circulo":
        t = np.arctan2(pts[:, 1] - m["cy"], pts[:, 0] - m["cx"])
    else:
        co, si = math.cos(m["theta"]), math.sin(m["theta"])
        dx = pts[:, 0] - m["cx"]
        dy = pts[:, 1] - m["cy"]
        u = (dx * co + dy * si) / m["a"]
        v = (-dx * si + dy * co) / m["b"]
        t = np.arctan2(v, u)
    return np.mod(t, 2.0 * math.pi)


def _puntos_plantilla(t: np.ndarray, tipo: str, m: dict) -> np.ndarray:
    """Puntos de la plantilla en el parámetro t."""
    if tipo == "circulo":
        return np.column_stack([m["cx"] + m["r"] * np.cos(t),
                                m["cy"] + m["r"] * np.sin(t)])
    co, si = math.cos(m["theta"]), math.sin(m["theta"])
    px = m["a"] * np.cos(t)
    py = m["b"] * np.sin(t)
    return np.column_stack([m["cx"] + px * co - py * si,
                            m["cy"] + px * si + py * co])


def _distancias(pts: np.ndarray, tipo: str, m: dict) -> np.ndarray:
    """
    Distancia de cada punto a la plantilla.

    Círculo: exacta (| |p − c| − r |).
    Elipse: distancia al punto de la elipse con la misma anomalía excéntrica
    proyectada. Es la aproximación estándar —exacta para círculos y para puntos
    sobre los ejes— y basta a la tolerancia de trabajo (2 % de la diagonal); la
    distancia exacta a una elipse exige resolver un cuártico por punto.
    """
    if tipo == "circulo":
        d = np.hypot(pts[:, 0] - m["cx"], pts[:, 1] - m["cy"]) - m["r"]
        return np.abs(d)
    proy = _puntos_plantilla(_param(pts, tipo, m), tipo, m)
    return np.hypot(pts[:, 0] - proy[:, 0], pts[:, 1] - proy[:, 1])


def _arco_acumulado(tipo: str, m: dict) -> tuple[np.ndarray, np.ndarray, float]:
    """
    Longitud de arco acumulada S(t) de la plantilla sobre una rejilla de t.
    Permite medir la completitud en LONGITUD DE ARCO y no en parámetro, que para
    una elipse no son proporcionales. Para un círculo ambas coinciden.
    """
    t = np.linspace(0.0, 2.0 * math.pi, _N_GRID_ARCO + 1)
    p = _puntos_plantilla(t, tipo, m)
    d = np.hypot(np.diff(p[:, 0]), np.diff(p[:, 1]))
    S = np.concatenate([[0.0], np.cumsum(d)])
    return t, S, float(S[-1])


def _completitud(t_arco: np.ndarray, tipo: str, m: dict,
                 gap_min_deg: float) -> tuple[float, list, list]:
    """
    E3 — fracción de la longitud de arco de la plantilla cubierta por el margen
    preservado. Se mide por HUECOS (saltos de parámetro mayores que `gap_min`),
    no por binning, que es sensible a la densidad de puntos del contorno.

    Devuelve también los intervalos ausentes SIN envolver `(t0, t1)` —con `t1`
    posiblemente > 2π cuando el hueco cruza el origen—. `huecos` los publica ya
    redondeados y envueltos para el contrato; reconstruir el envolvimiento desde
    esos grados sería una fuente de error evitable, y el lienzo necesita saber
    exactamente qué tramo NO está respaldado por el fragmento.
    """
    if len(t_arco) < 3:
        return 0.0, [], []
    t_grid, S, L = _arco_acumulado(tipo, m)
    if L <= 0:
        return 0.0, [], []

    t = np.sort(t_arco)
    gap_min = math.radians(gap_min_deg)
    huecos = []
    ausentes = []
    faltante = 0.0
    for i in range(len(t)):
        t0 = t[i]
        t1 = t[(i + 1) % len(t)] + (2.0 * math.pi if i == len(t) - 1 else 0.0)
        if (t1 - t0) <= gap_min:
            continue
        # Longitud de arco del hueco, interpolando S sobre la rejilla.
        s0 = float(np.interp(t0, t_grid, S))
        s1 = float(np.interp(t1 if t1 <= 2 * math.pi else 2 * math.pi, t_grid, S))
        tramo = s1 - s0
        if t1 > 2 * math.pi:                       # el hueco cruza el origen
            tramo += float(np.interp(t1 - 2 * math.pi, t_grid, S))
        faltante += max(0.0, tramo)
        huecos.append({
            "inicio_deg": round(math.degrees(t0), 2),
            "fin_deg":    round(math.degrees(t1 % (2 * math.pi)), 2),
        })
        ausentes.append((float(t0), float(t1)))
    return max(0.0, min(1.0, 1.0 - faltante / L)), huecos, ausentes


def _contorno_anillo(m: dict, ausentes: tuple) -> tuple:
    """
    Polilínea del anillo: DOS circunferencias, y el índice de componente que las
    separa. Sin ese índice el lienzo uniría el último punto del círculo exterior
    con el primero del interior y dibujaría un radio que no existe.
    """
    a_ext, a_int = ausentes
    p_ext, pres_ext = _contorno_con_presencia(
        "circulo", {"cx": m["cx"], "cy": m["cy"], "r": m["R"]}, a_ext)
    p_int, pres_int = _contorno_con_presencia(
        "circulo", {"cx": m["cx"], "cy": m["cy"], "r": m["r"]}, a_int)
    comp = np.concatenate([np.zeros(len(p_ext), dtype=int),
                           np.ones(len(p_int), dtype=int)])
    return (np.concatenate([p_ext, p_int]),
            np.concatenate([pres_ext, pres_int]), comp)


def _contorno_con_presencia(tipo: str, m: dict,
                            ausentes: list) -> tuple[np.ndarray, np.ndarray]:
    """
    Polilínea de la plantilla ajustada (coords absolutas) + máscara punto a punto
    de «este tramo lo respalda el fragmento».

    La máscara es lo que hace honesta la superposición: sin ella, el lienzo
    dibujaría la forma ideal entera con el mismo trazo y el tramo inventado sería
    indistinguible del medido. Con ella, la parte ausente se dibuja discontinua
    —el mismo convenio que los candidatos de P/H en ADR-009: línea discontinua =
    hipótesis—. Un tramo sin hueco declarado (salto ≤ `gap_min_deg`) cuenta como
    presente, exactamente igual que en el cómputo de la completitud: lo que se ve
    es lo que se mide.
    """
    t = np.linspace(0.0, 2.0 * math.pi, _N_CONTORNO, endpoint=False)
    pts = _puntos_plantilla(t, tipo, m)
    presente = np.ones(_N_CONTORNO, dtype=bool)
    for t0, t1 in ausentes:
        dentro = (t >= t0) & (t <= t1)
        if t1 > 2.0 * math.pi:                     # el hueco cruza el origen
            dentro |= (t <= t1 - 2.0 * math.pi)
        presente &= ~dentro
    return pts, presente


# ── E1 + E2 · Ajuste robusto con puntuación por tramo contiguo ──────────────

def _ajustar(pts: np.ndarray, tipo: str, iters: int, seed: int) -> Optional[dict]:
    """
    RANSAC puntuado por LONGITUD DEL TRAMO CONTIGUO de inliers.

    La contigüidad es lo que separa el margen original de los bordes de fractura
    sin umbral de rectitud (ADR-017 §3, E1). Determinista: semilla fija.
    """
    n = len(pts)
    diag = _diagonal(pts)
    if diag <= 0:
        return None
    tol = _TOL_REL_DIAG * diag
    r_max = _R_MAX_DIAG * diag
    largos = _largos_segmento(pts)
    perimetro = float(largos.sum())
    ajusta = _ajuste_circulo if tipo == "circulo" else _ajuste_elipse
    k = 3 if tipo == "circulo" else 5
    rng = np.random.default_rng(seed)

    def valido(m: Optional[dict]) -> bool:
        if m is None:
            return False
        if tipo == "circulo":
            return np.isfinite(m["r"]) and 0 < m["r"] <= r_max
        if not (np.isfinite(m["a"]) and np.isfinite(m["b"])
                and 0 < m["a"] <= r_max and m["b"] > 0):
            return False
        # Tope de elongación: una elipse con b/a → 0 ES un segmento de recta, y
        # ajusta cualquier borde de fractura. Es el análogo elíptico del «círculo
        # gigante ≈ recta» que ya acota `r_max`; sin él, un rectángulo o el radio
        # de un sector se aceptaban como plantilla (verificado en banco).
        return (m["b"] / m["a"]) >= _RATIO_EJES_MIN

    def evaluar(m: dict) -> tuple[int, int, float]:
        inl = _distancias(pts, tipo, m) < tol
        return _tramo_contiguo_mas_largo(inl, largos)

    mejor_m, mejor_tramo = None, (0, 0, 0.0)
    for _ in range(iters):
        # Muestra de k puntos BIEN SEPARADOS a lo largo del contorno: tríos casi
        # colineales (vecinos) producen círculos degenerados.
        i0 = int(rng.integers(n))
        idx = [(i0 + int(n * (j / k + 0.12 * float(rng.random())))) % n for j in range(k)]
        m = ajusta(pts[idx])
        if not valido(m):
            continue
        tramo = evaluar(m)
        if tramo[2] > mejor_tramo[2]:
            mejor_m, mejor_tramo = m, tramo
            if tramo[2] >= 0.98 * perimetro:
                break     # el modelo ya explica casi todo el contorno

    if mejor_m is None:
        return None

    # Refinamiento: re-ajustar sobre el tramo contiguo hasta que deje de crecer.
    m, tramo = mejor_m, mejor_tramo
    for _ in range(4):
        sub = pts[[t % n for t in range(tramo[0], tramo[1])]]
        if len(sub) < k:
            break
        cand = ajusta(sub)
        if not valido(cand):
            break
        t2 = evaluar(cand)
        if t2[2] <= tramo[2] * 0.98:
            break          # sin mejora: conservar el par (modelo, tramo) COHERENTE
        # Modelo y tramo se actualizan JUNTOS. Actualizar sólo el modelo dejaba el
        # arco medido contra un modelo distinto del que lo produjo, y entonces el
        # «arco de inliers» contenía puntos a más de la tolerancia.
        m, tramo = cand, t2

    arco = pts[[t % n for t in range(tramo[0], tramo[1])]]
    if len(arco) < 3:
        return None
    res = _distancias(arco, tipo, m)
    return {
        "modelo": m,
        "arco": arco,
        "arco_fraccion": (tramo[2] / perimetro) if perimetro > 0 else 0.0,
        "residuo_rms": float(np.sqrt(np.mean(res ** 2))),
        "tolerancia_px": tol,
    }


# ── E2 · Plantilla ANILLO: dos circunferencias concéntricas ─────────────────

def _ajustar_anillo(pts: np.ndarray, iters: int, seed: int) -> Optional[dict]:
    """
    Corona circular — el margen exterior de la pieza y el borde de la perforación.

    Es la forma que pide el material: una cuenta anular rota por el orificio deja
    un contorno con DOS arcos de radios distintos, y la plantilla círculo sólo
    puede explicar uno de ellos. El otro cuenta como borde de fractura y hunde el
    soporte por debajo del umbral.

    Dos decisiones que conviene no deshacer sin releer esto:

    · **Concéntricas.** La forma ideal de una cuenta anular lo es. Dejar el
      segundo centro suelto le permitiría amoldarse a cualquier borde de
      fractura; una perforación de verdad descentrada sale entonces con más
      residuo y menos inliers, que es exactamente como debe verse.
    · **Vía analítica, no repertorio ICP.** El ICP sólo dispone de una SEMEJANZA
      (Umeyama 1991: rotación, escala y traslación). La razón `r/R` de un anillo
      es un parámetro de FORMA, no de escala: una plantilla anular fija sólo
      emparejaría piezas con esa razón exacta. Aquí `r/R` se estima del contorno.

    El círculo exterior sale del ajuste robusto de siempre (E1 + E2 por
    contigüidad). El interior se busca sobre la distancia radial al centro ya
    ajustado, y se elige con el MISMO criterio de contigüidad: el borde de la
    perforación es un arco contiguo, la fractura no.
    """
    fit_ext = _ajustar(pts, "circulo", iters, seed)
    if fit_ext is None:
        return None
    m0 = fit_ext["modelo"]
    cx, cy, R = m0["cx"], m0["cy"], m0["r"]

    diag = _diagonal(pts)
    tol = _TOL_REL_DIAG * diag
    if R <= 0 or tol <= 0:
        return None
    largos = _largos_segmento(pts)
    perim = float(largos.sum())
    if perim <= 0:
        return None

    d = np.hypot(pts[:, 0] - cx, pts[:, 1] - cy)
    banda = (d > _ANILLO_RATIO_MIN * R) & (d < R - 2.0 * tol)
    if int(banda.sum()) < _MIN_PUNTOS:
        return None          # no hay margen interior que buscar: es un disco

    # Candidatos a radio interior por histograma de la distancia radial (ancho de
    # bin = tolerancia). El borde de la perforación es un cúmulo estrecho; la
    # fractura, que cruza el anillo, se reparte por toda la banda. Se evalúan las
    # cimas más pobladas con el criterio de CONTIGÜIDAD, no por número de puntos:
    # es lo que distingue un arco real de una nube dispersa de puntos de fractura.
    lo, hi = float(d[banda].min()), float(d[banda].max())
    nbins = max(4, int(math.ceil((hi - lo) / max(tol, 1e-6))))
    cuentas, bordes = np.histogram(d[banda], bins=nbins, range=(lo, hi))
    centros = 0.5 * (bordes[:-1] + bordes[1:])
    orden = np.argsort(cuentas)[::-1][:5]        # las 5 cimas más pobladas

    mejor_r, mejor_tramo = None, (0, 0, 0.0)
    for i in orden:
        if cuentas[i] == 0:
            continue
        r_cand = float(centros[i])
        inl = np.abs(d - r_cand) < tol
        tramo = _tramo_contiguo_mas_largo(inl, largos)
        if tramo[2] > mejor_tramo[2]:
            mejor_r, mejor_tramo = r_cand, tramo
    if mejor_r is None or mejor_tramo[2] <= 0:
        return None

    # Refinamiento: el radio es la media de las distancias del propio arco.
    n = len(pts)
    idx_int = [t % n for t in range(mejor_tramo[0], mejor_tramo[1])]
    if len(idx_int) < 3:
        return None
    r_int = float(np.mean(d[idx_int]))

    ratio = r_int / R
    if not (_ANILLO_RATIO_MIN <= ratio <= _ANILLO_RATIO_MAX):
        return None
    if (mejor_tramo[2] / perim) < _ANILLO_SOPORTE_INT:
        return None

    # Arco exterior: el que ya encontró el ajuste robusto.
    inl_ext = np.abs(d - R) < tol
    tramo_ext = _tramo_contiguo_mas_largo(inl_ext, largos)
    idx_ext = [t % n for t in range(tramo_ext[0], tramo_ext[1])]
    if len(idx_ext) < 3:
        return None

    modelo = {"cx": float(cx), "cy": float(cy), "R": float(R), "r": float(r_int),
              "ratio_r_R": round(ratio, 4)}
    m_ext = {"cx": cx, "cy": cy, "r": R}
    m_int = {"cx": cx, "cy": cy, "r": r_int}

    # Completitud: cobertura de la longitud de arco de LAS DOS circunferencias,
    # ponderada por su propio perímetro (el exterior pesa más porque mide más).
    c_ext, h_ext, a_ext = _completitud(_param(pts[idx_ext], "circulo", m_ext),
                                       "circulo", m_ext, _GAP_MIN_DEG)
    c_int, h_int, a_int = _completitud(_param(pts[idx_int], "circulo", m_int),
                                       "circulo", m_int, _GAP_MIN_DEG)
    comp = (c_ext * R + c_int * r_int) / (R + r_int)

    res = np.concatenate([np.abs(d[idx_ext] - R), np.abs(d[idx_int] - r_int)])
    huecos = ([{**h, "circulo": "externo"} for h in h_ext]
              + [{**h, "circulo": "interno"} for h in h_int])

    return {
        "modelo": modelo,
        "arco": np.concatenate([pts[idx_ext], pts[idx_int]]),
        # Soporte = los DOS arcos sobre el perímetro del fragmento. Es la
        # generalización natural del criterio de una sola circunferencia, y la
        # razón por la que el anillo merece un umbral propio (explica más).
        "arco_fraccion": (tramo_ext[2] + mejor_tramo[2]) / perim,
        "residuo_rms": float(np.sqrt(np.mean(res ** 2))),
        "tolerancia_px": tol,
        "completitud": comp,
        "huecos": huecos,
        "ausentes": (a_ext, a_int),
        "completitud_externa": c_ext,
        "completitud_interna": c_int,
    }


# ── Confianza (lenguaje canónico LAAR · ADR-007) ────────────────────────────

def _confianza(arco_fraccion: float, residuo_rms: float, diag: float) -> dict:
    """
    Confianza del emparejamiento ∈ [0,1], con los mismos cortes que el resto del
    repo (`detection._confianza_objeto`): alta ≥ 0.66 · media ≥ 0.40 · baja.

      • soporte  — cuánto del contorno explica la plantilla (arco_fraccion).
      • ajuste   — residuo RMS normalizado a la tolerancia de trabajo.
    """
    soporte = max(0.0, min(1.0, arco_fraccion / 0.8))
    tol = _TOL_REL_DIAG * diag
    ajuste = max(0.0, min(1.0, 1.0 - (residuo_rms / tol))) if tol > 0 else 0.0
    score = round(0.55 * soporte + 0.45 * ajuste, 3)
    level = "alta" if score >= 0.66 else "media" if score >= 0.40 else "baja"
    return {"score": score, "level": level}


# ── API pública ─────────────────────────────────────────────────────────────

async def match(
    contour_points: list,
    templates: Optional[list] = None,
    scale_px_mm: float = 1.0,
    gap_min_deg: float = _GAP_MIN_DEG,
    min_arco_fraccion: Optional[dict] = None,
    ransac_iters: int = _RANSAC_ITERS,
    seed: int = _SEED,
    forzar_icp: bool = False,
    permitir_reflexion: bool = False,
) -> dict[str, Any]:
    """
    Empareja un contorno con las plantillas ideales pedidas y estima completitud.

    Parámetros
    ----------
    contour_points     lista de [x, y] en píxeles (coordenadas absolutas)
    templates          nombres de plantilla; None = ("circulo", "elipse").
                       Analíticas: `circulo`, `elipse` y `anillo` (corona
                       circular — cuenta perforada rota por el orificio).
                       Además, cualquier nombre del repertorio F2
                       (`plantillas_disponibles()`): triangulo, cuadrado,
                       rectangulo_2_1, pentagono, hexagono… y las registradas
                       desde coeficientes EFA con `registrar_plantilla_efa`.
    forzar_icp         encamina también círculo y elipse por el ICP del repertorio
                       (usado por el gate de paridad analítica↔ICP del ADR)
    permitir_reflexion permite que el emparejamiento use una reflexión; por
                       defecto no: una forma y su espejo no son la misma pieza
    scale_px_mm        factor px→mm; si > 0 el residuo se reporta también en mm
    gap_min_deg        hueco angular mínimo que cuenta como ausencia (default 8°)
    min_arco_fraccion  dict {tipo: fracción} — soporte mínimo del perímetro sobre
                       la plantilla para aceptarla (default: círculo 0.40, elipse
                       0.50, calibrados en F4 sobre banco sintético; ver
                       `docs/VALIDACION-PLANTILLAS.md`). Por debajo se RECHAZA en
                       vez de inventar: es la envolvente operativa de ADR-017 §4.

    Retorno (contrato ADR-017 §5)
    -----------------------------
    {
      "status": "ok",
      "plantilla_tipo": "circulo"|"elipse"|"ninguna",
      "plantilla_completitud": float 0-100 | None,   # % de la forma ideal preservado
      "plantilla_arco_fraccion": float 0-1 | None,
      "plantilla_residuo_rms": float | None,         # px (y mm si hay escala)
      "plantilla_parametros": dict | None,           # coords ABSOLUTAS
      "plantilla_confianza": float 0-1 | None,
      "plantilla_confianza_nivel": "alta"|"media"|"baja" | None,
      "plantilla_metodo": str,
      "es_fragmento_candidato": bool | None,         # CANDIDATO, no hecho (ADR-009)
      "huecos": [...],
      "plantilla_contorno": [[x, y], ...] | None,    # polilínea a dibujar, ABSOLUTA
      "plantilla_contorno_presente": [bool, ...],    # paralelo: True = lo respalda
      "candidatos": [ ... ],                         # todas las plantillas probadas
      "motivo_rechazo": str | None,
    }

    `es_fragmento_candidato` es una SUGERENCIA a confirmar por el usuario. En
    lítica la fractura no se dictamina desde la silueta 2D (ADR-017 §7).
    """
    vacio = {
        "status": "ok",
        "plantilla_tipo": "ninguna",
        "plantilla_completitud": None,
        "plantilla_arco_fraccion": None,
        "plantilla_residuo_rms": None,
        "plantilla_parametros": None,
        "plantilla_confianza": None,
        "plantilla_confianza_nivel": None,
        "plantilla_metodo": "ninguno",
        "es_fragmento_candidato": None,
        "huecos": [],
        "plantilla_contorno": None,
        "plantilla_contorno_presente": None,
        "plantilla_contorno_componente": None,
        "candidatos": [],
        "motivo_rechazo": None,
    }

    # El frontend guarda contornos en dos formatos ([x, y] del backend y {x, y} del
    # motor JS). Sin normalizar, np.asarray lanzaba TypeError con el segundo y el
    # botón terminaba diciendo «sin forma ideal» por un fallo de formato.
    if isinstance(contour_points, (list, tuple)) and contour_points and isinstance(contour_points[0], dict):
        contour_points = [[p.get("x"), p.get("y")] for p in contour_points]
    pts = np.asarray(contour_points, dtype=np.float64)
    if pts.ndim != 2 or pts.shape[1] != 2:
        return {"status": "error", "message": "contour_points debe ser lista de [x, y]"}
    if len(pts) < _MIN_PUNTOS:
        return {**vacio, "motivo_rechazo":
                f"contorno insuficiente: {len(pts)} puntos (mínimo {_MIN_PUNTOS})"}

    tipos = list(templates) if templates else ["circulo", "elipse"]
    analiticas = ("circulo", "elipse", "anillo")
    validos = set(analiticas) | set(_REPERTORIO)
    desconocidos = [t for t in tipos if t not in validos]
    if desconocidos:
        return {"status": "error",
                "message": f"plantillas no soportadas: {desconocidos} "
                           f"(disponibles: {', '.join(sorted(validos))})"}

    umbrales = dict(_MIN_ARCO_FRACCION)
    if isinstance(min_arco_fraccion, dict):
        umbrales.update(min_arco_fraccion)

    diag = _diagonal(pts)
    candidatos = []
    for tipo in tipos:
        via_icp = forzar_icp or tipo not in analiticas
        if via_icp:
            nombre_rep = {"circulo": "circulo_icp", "elipse": "elipse_2_1"}.get(tipo, tipo)
            fit = _emparejar_icp(pts, nombre_rep, permitir_reflexion)
            if fit is None:
                candidatos.append({"tipo": tipo, "aceptada": False,
                                   "motivo": "sin emparejamiento ICP válido"})
                continue
            comp, huecos = fit["completitud"], fit["huecos"]
        elif tipo == "anillo":
            fit = _ajustar_anillo(pts, ransac_iters, seed)
            if fit is None:
                candidatos.append({"tipo": tipo, "aceptada": False,
                                   "motivo": "sin dos circunferencias concéntricas "
                                             "(¿la perforación no está preservada?)"})
                continue
            comp, huecos = fit["completitud"], fit["huecos"]
            cont, pres, compo = _contorno_anillo(fit["modelo"], fit["ausentes"])
            fit["contorno_plantilla"] = cont
            fit["contorno_presente"] = pres
            fit["contorno_componente"] = compo
        else:
            fit = _ajustar(pts, tipo, ransac_iters, seed)
            if fit is None:
                candidatos.append({"tipo": tipo, "aceptada": False,
                                   "motivo": "sin ajuste válido"})
                continue
            comp, huecos, ausentes = _completitud(
                _param(fit["arco"], tipo, fit["modelo"]),
                tipo, fit["modelo"], gap_min_deg)
            # La vía analítica también publica su polilínea. Hasta F4 sólo la
            # emitía el ICP, así que `plantilla_contorno` salía None justo para
            # círculo y elipse —las dos plantillas por defecto del botón— y la
            # superposición del lienzo no tenía nada que dibujar.
            cont, pres = _contorno_con_presencia(tipo, fit["modelo"], ausentes)
            fit["contorno_plantilla"] = cont
            fit["contorno_presente"] = pres
        # `umbrales` parte SIEMPRE de _MIN_ARCO_FRACCION, que cubre las dos
        # plantillas analíticas → el defecto sólo lo toma el repertorio ICP.
        # (Antes había aquí un 0,30 suelto que quedaba desfasado al recalibrar.)
        min_arco = umbrales.get(tipo, _MIN_ARCO_ICP)
        soporte_ok = fit["arco_fraccion"] > min_arco
        comp_ok = comp >= _MIN_COMPLETITUD
        aceptada = soporte_ok and comp_ok
        if soporte_ok and not comp_ok:
            motivo = (f"cobertura de la plantilla {comp*100:.0f} % < "
                      f"{_MIN_COMPLETITUD*100:.0f} %: el ajuste degenera con tan poco arco")
        elif not soporte_ok:
            motivo = (f"sólo el {fit['arco_fraccion']*100:.0f} % del perímetro cae sobre "
                      f"la plantilla (mínimo {min_arco*100:.0f} %)")
        else:
            motivo = None
        candidatos.append({
            "tipo": tipo,
            "aceptada": aceptada,
            "motivo": motivo,
            "completitud": round(comp * 100, 2),
            "arco_fraccion": round(fit["arco_fraccion"], 4),
            "residuo_rms": round(fit["residuo_rms"], 4),
            "modelo": {k: (round(float(v), 4) if isinstance(v, (int, float))
                            and not isinstance(v, bool) else v)
                       for k, v in fit["modelo"].items()},
            "huecos": huecos,
            "metodo": "icp_repertorio" if via_icp else f"ransac_{tipo}_contiguo",
            "_fit": fit,
        })

    aceptados = [c for c in candidatos if c["aceptada"]]
    if not aceptados:
        motivos = "; ".join(f"{c['tipo']}: {c.get('motivo') or 'no aceptada'}"
                            for c in candidatos)
        return {**vacio,
                "candidatos": [{k: v for k, v in c.items() if k != "_fit"}
                               for c in candidatos],
                "motivo_rechazo": f"ninguna plantilla supera el umbral — {motivos}"}

    # Elección entre plantillas. La elipse tiene 2 parámetros más y siempre ajusta
    # al menos igual de bien, así que sólo gana si mejora el residuo CON MARGEN, y
    # nunca cuando su relación de ejes la hace indistinguible de un círculo.
    # Paso 1 — círculo vs elipse ANALÍTICAS son modelos anidados: la elipse tiene
    # 2 parámetros más y siempre ajusta al menos igual de bien, así que sólo gana
    # con margen y nunca si su relación de ejes la hace un círculo.
    por_tipo = {c["tipo"]: c for c in aceptados}
    descartados_por_anidamiento = set()
    ci, el = por_tipo.get("circulo"), por_tipo.get("elipse")
    if ci and el and "b" in el["_fit"]["modelo"]:
        mm = el["_fit"]["modelo"]
        ratio = mm["b"] / mm["a"] if mm["a"] > 0 else 1.0
        gana_elipse = (ratio < _RATIO_EJES_CIRCULO
                       and el["residuo_rms"] < _MARGEN_ELIPSE * ci["residuo_rms"])
        descartados_por_anidamiento.add("elipse" if not gana_elipse else "circulo")

    # Paso 1 bis — círculo vs ANILLO. Aquí el eje NO es el residuo sino el
    # SOPORTE: el anillo no ajusta mejor cada punto, explica MÁS puntos (dos
    # arcos en vez de uno). En un fragmento de cuenta anular el círculo se queda
    # con el margen exterior y manda el borde de la perforación al saco de la
    # fractura; el anillo da cuenta de los dos. Por eso gana sólo si explica
    # bastante más contorno: si empata, la forma simple se queda (navaja de
    # Occam), que es el mismo criterio con que la elipse tiene que ganarle al
    # círculo, aplicado al eje donde este modelo aporta de verdad.
    an = por_tipo.get("anillo")
    if ci and an:
        gana_anillo = an["arco_fraccion"] > ci["arco_fraccion"] + _MARGEN_ANILLO
        descartados_por_anidamiento.add("anillo" if not gana_anillo else "circulo")

    # Paso 2 — el resto del repertorio no son modelos anidados entre sí, así que
    # compiten por bondad de ajuste directa (residuo RMS en píxeles).
    finalistas = [c for c in aceptados if c["tipo"] not in descartados_por_anidamiento]
    elegido = min(finalistas, key=lambda c: c["residuo_rms"])

    fit = elegido["_fit"]
    conf = _confianza(fit["arco_fraccion"], fit["residuo_rms"], diag)
    completitud = elegido["completitud"]

    params = {k: round(float(v), 4) for k, v in fit["modelo"].items()}
    if scale_px_mm and scale_px_mm > 0 and scale_px_mm != 1.0:
        params["_escala_px_mm"] = scale_px_mm
        params["residuo_rms_mm"] = round(fit["residuo_rms"] * scale_px_mm, 4)

    return {
        "status": "ok",
        "plantilla_tipo": elegido["tipo"],
        "plantilla_completitud": completitud,
        "plantilla_arco_fraccion": elegido["arco_fraccion"],
        "plantilla_residuo_rms": elegido["residuo_rms"],
        "plantilla_parametros": params,
        "plantilla_confianza": conf["score"],
        "plantilla_confianza_nivel": conf["level"],
        "plantilla_metodo": elegido["metodo"],
        # CANDIDATO a confirmar (ADR-009 / ADR-017 §7), no un hecho.
        "es_fragmento_candidato": bool(completitud < _UMBRAL_COMPLETO * 100),
        "huecos": elegido["huecos"],
        # Contorno de la plantilla ajustada, en coordenadas absolutas y submuestreado
        # (lo consume la superficie visual de F3 para dibujar la forma inferida).
        "plantilla_contorno": (
            [[round(float(x), 2), round(float(y), 2)]
             for x, y in fit["contorno_plantilla"]]
            if "contorno_plantilla" in fit else None
        ),
        # Paralelo punto a punto al anterior: True donde el margen preservado
        # respalda ese tramo, False donde la plantilla lo está RECONSTRUYENDO.
        # Sin esta máscara el lienzo dibujaría lo medido y lo inferido con el
        # mismo trazo, que es exactamente el vicio que ADR-017 F0 vino a retirar.
        "plantilla_contorno_presente": (
            [bool(v) for v in fit["contorno_presente"]]
            if "contorno_presente" in fit else None
        ),
        # Índice de COMPONENTE, también paralelo. Sólo lo emite el anillo, que
        # son dos curvas cerradas: sin él el lienzo uniría el final de una con el
        # principio de la otra y dibujaría un radio inexistente. Ausente = una
        # sola componente, que es el caso de todas las demás plantillas.
        "plantilla_contorno_componente": (
            [int(v) for v in fit["contorno_componente"]]
            if "contorno_componente" in fit else None
        ),
        "candidatos": [{k: v for k, v in c.items() if k != "_fit"} for c in candidatos],
        "motivo_rechazo": None,
        "umbral_completo_pct": _UMBRAL_COMPLETO * 100,
        "n_points_input": int(len(pts)),
        "seed": seed,
    }


# ═══════════════════════════════════════════════════════════════════════════
# F2 · REPERTORIO DE PLANTILLAS ARBITRARIAS + EMPAREJAMIENTO POR ICP RECORTADO
# ═══════════════════════════════════════════════════════════════════════════
# F1 resuelve círculo y elipse con ajuste algebraico, que es exacto y barato pero
# sólo sirve para formas con ecuación cerrada. F2 generaliza a un REPERTORIO
# arbitrario —triángulo, cuadrado, polígonos, y cualquier forma reconstruida
# desde un banco de coeficientes EFA— emparejando por **ICP recortado**.
#
# Por qué ICP y no distancia EFA (ADR-017 §2): la EFA es un descriptor GLOBAL de
# curva cerrada normalizado al primer armónico *del fragmento*, así que un
# fragmento y su forma original caen en puntos arbitrariamente distintos del
# morfoespacio. No existe encaje parcial en el espacio EFD. El repertorio EFA
# entra aquí como BIBLIOTECA DE PLANTILLAS (vía `efa.reconstruct`), y el motor
# de emparejamiento es el ICP. Wilczek et al. (2021) llegaron a la misma
# conclusión comparando cuatro métodos sobre cerámica: ICP fue el mejor, y el
# único que además funciona con fragmentos sin el rasgo diagnóstico.
#
# Referencias
# -----------
# Besl, P.J. & McKay, N.D. (1992) A method for registration of 3-D shapes.
#     IEEE TPAMI 14(2): 239-256.  — ICP.
# Chetverikov, D., Svirko, D., Stepanov, D. & Krsek, P. (2002) The Trimmed
#     Iterative Closest Point algorithm. Proc. ICPR'02, vol. 3: 545-548.
#     doi:10.1109/ICPR.2002.1047997  — TrICP: LTS en todas las fases; aplicable
#     a solapamientos POR DEBAJO DEL 50 %, que es exactamente el caso fragmento.
# Umeyama, S. (1991) Least-squares estimation of transformation parameters
#     between two point patterns. IEEE TPAMI 13(4): 376-380. doi:10.1109/34.88573
#     — solución cerrada de la similitud; su aporte sobre Arun (1987) y Horn
#     (1987) es precisamente NO devolver una reflexión cuando los datos están
#     corrompidos, control que aquí importa (una forma y su espejo no son la
#     misma pieza salvo que se decida lo contrario).
# Wilczek, J., Monna, F. et al. (2021) A computer tool to identify best matches
#     for pottery fragments. J. Archaeol. Sci.: Reports 37: 102891.

_N_PLANTILLA      = 360     # puntos por plantilla del repertorio
_ICP_ITERS        = 30
_ICP_ITERS_GRUESO = 5       # iteraciones del rastreo grueso (rotación × recorte)
_ICP_ITERS_MEDIO  = 12      # iteraciones del barrido de recortes (sólo para ordenar)
_ICP_REFINAR      = 3       # arranques que pasan a la fase fina
_ICP_ROTACIONES   = 12      # arranques iniciales, equiespaciados (sin RNG)
_ICP_XI           = (0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00)   # recortes (fase fina)
# El rastreo grueso NO barre los siete: dos representativos —uno de solapamiento
# bajo y otro completo— bastan para fijar la rotación, y el coste baja de ~195 ms
# a ~60 ms por plantilla. Lo que NO puede faltar es el recorte bajo: sin él, un
# fragmento al 50 % pierde su propia plantilla (medido en banco).
_ICP_XI_GRUESO    = (0.50, 1.00)
_ICP_LAMBDA       = 2.0     # exponente de la función objetivo de TrICP
_ICP_SUBMUESTRA   = 160     # puntos del fragmento usados durante el ICP
_GAP_MIN_ARCO     = 0.02    # hueco mínimo, como fracción del perímetro plantilla
_MIN_ARCO_ICP     = 0.45    # soporte mínimo para aceptar una plantilla del ICP


# ── Generadores del repertorio ─────────────────────────────────────────────

def _remuestrear_cerrado(vertices: np.ndarray, n: int) -> np.ndarray:
    """Remuestrea un polígono cerrado a `n` puntos equiespaciados en arco."""
    v = np.vstack([vertices, vertices[:1]])
    d = np.hypot(np.diff(v[:, 0]), np.diff(v[:, 1]))
    s = np.concatenate([[0.0], np.cumsum(d)])
    objetivo = np.linspace(0.0, s[-1], n, endpoint=False)
    return np.column_stack([np.interp(objetivo, s, v[:, 0]),
                            np.interp(objetivo, s, v[:, 1])])


def _normalizar(pts: np.ndarray) -> tuple[np.ndarray, np.ndarray, float]:
    """Centroide al origen y radio RMS = 1. Devuelve (normalizado, centro, escala)."""
    c = pts.mean(axis=0)
    q = pts - c
    s = float(np.sqrt((q ** 2).sum(axis=1).mean()))
    if s <= 0:
        return q, c, 1.0
    return q / s, c, s


def _poligono_regular(n_lados: int) -> np.ndarray:
    ang = np.linspace(0.0, 2.0 * math.pi, n_lados, endpoint=False)
    return _remuestrear_cerrado(np.column_stack([np.cos(ang), np.sin(ang)]), _N_PLANTILLA)


def _rectangulo(ratio: float) -> np.ndarray:
    a, b = 1.0, 1.0 / max(ratio, 1e-6)
    v = np.array([[-a, -b], [a, -b], [a, b], [-a, b]], dtype=np.float64)
    return _remuestrear_cerrado(v, _N_PLANTILLA)


def _elipse_param(ratio: float) -> np.ndarray:
    t = np.linspace(0.0, 2.0 * math.pi, _N_PLANTILLA, endpoint=False)
    return np.column_stack([np.cos(t), np.sin(t) / max(ratio, 1e-6)])


# Repertorio base. Cada entrada es un callable sin argumentos → contorno cerrado.
_REPERTORIO: "dict[str, Any]" = {
    "circulo_icp":    lambda: _poligono_regular(_N_PLANTILLA),
    "elipse_2_1":     lambda: _elipse_param(2.0),
    "triangulo":      lambda: _poligono_regular(3),
    "cuadrado":       lambda: _poligono_regular(4),
    "rectangulo_2_1": lambda: _rectangulo(2.0),
    "pentagono":      lambda: _poligono_regular(5),
    "hexagono":       lambda: _poligono_regular(6),
}


def registrar_plantilla_efa(nombre: str, coeficientes: list,
                            n_points: int = _N_PLANTILLA) -> None:
    """
    Añade al repertorio una plantilla reconstruida desde coeficientes EFA.

    Es el puente que pedía ADR-017 §2: un banco de descriptores EFA —el
    «repertorio de formas ideales» de la pregunta original— se convierte en las
    plantillas contra las que el ICP empareja fragmentos. La EFA aporta las
    formas; el ICP hace el encaje parcial que la EFA no puede hacer.
    """
    from python.modules import efa as _efa
    contorno = np.asarray(_efa.reconstruct(coeficientes, n_points=n_points),
                          dtype=np.float64)
    _REPERTORIO[nombre] = lambda c=contorno: c.copy()


def plantillas_disponibles() -> list:
    """
    Todas las plantillas que `match()` acepta, en orden estable.

    Incluye las ANALÍTICAS (`circulo`, `elipse`, `anillo`) además del repertorio
    ICP: antes devolvía sólo el repertorio, de modo que un selector construido a
    partir de esta lista omitía justamente las tres que el botón usa por defecto.
    """
    return sorted(set(_REPERTORIO) | {"circulo", "elipse", "anillo"})


# ── Transformada de similitud en forma cerrada (Umeyama 1991) ──────────────

def _umeyama(X: np.ndarray, Y: np.ndarray, permitir_reflexion: bool = False):
    """
    (c, R, t) que minimiza ||c·R·X + t − Y||². Umeyama (1991), teorema 1.

    La corrección por `det(U)·det(V)` es el aporte del artículo sobre Arun (1987)
    y Horn (1987): sin ella, con datos corrompidos la SVD puede devolver una
    REFLEXIÓN en vez de una rotación. Aquí eso importa — una forma y su espejo no
    son la misma pieza — así que la reflexión se permite sólo si se pide.
    """
    n = len(X)
    mu_x, mu_y = X.mean(axis=0), Y.mean(axis=0)
    Xc, Yc = X - mu_x, Y - mu_y
    Sigma = (Yc.T @ Xc) / n
    U, D, Vt = np.linalg.svd(Sigma)
    S = np.eye(2)
    if not permitir_reflexion and (np.linalg.det(U) * np.linalg.det(Vt) < 0):
        S[1, 1] = -1.0
    R = U @ S @ Vt
    var_x = float((Xc ** 2).sum() / n)
    c = float(np.trace(np.diag(D) @ S) / var_x) if var_x > 1e-12 else 1.0
    t = mu_y - c * (R @ mu_x)
    return c, R, t


# ── ICP recortado (TrICP) ──────────────────────────────────────────────────

def _icp_recortado(frag: np.ndarray, kd, plantilla: np.ndarray, xi: float,
                   init, iters: int, permitir_reflexion: bool) -> dict:
    """
    Una corrida de TrICP con transformada de similitud, desde una pose inicial.

    En cada iteración: correspondencias por punto más cercano → se conserva la
    fracción `xi` de MENOR distancia (least trimmed squares) → se re-estima la
    similitud con Umeyama sobre ese subconjunto. Los puntos recortados son, en un
    fragmento, el borde de fractura: no tienen homólogo en la plantilla.

    Devuelve la pose final y el objetivo de Chetverikov et al. (2002)
    `psi = MSE_recortado / xi^(1+λ)`, que penaliza recortes agresivos y permite
    comparar ajustes con distinta fracción de solapamiento.
    """
    c, R, t = init
    k = max(5, int(round(xi * len(frag))))
    d = np.empty(len(frag))
    orden = np.arange(k)
    for _ in range(iters):
        P = c * (frag @ R.T) + t
        d, idx = kd.query(P)
        orden = np.argpartition(d, k - 1)[:k] if k < len(d) else np.arange(len(d))
        c_n, R_n, t_n = _umeyama(frag[orden], plantilla[idx[orden]], permitir_reflexion)
        if not (np.isfinite(c_n) and np.isfinite(R_n).all() and np.isfinite(t_n).all()):
            break
        desplazamiento = abs(c_n - c) + float(np.abs(R_n - R).sum() + np.abs(t_n - t).sum())
        c, R, t = c_n, R_n, t_n
        if desplazamiento < 1e-9:
            break
    P = c * (frag @ R.T) + t
    d, _ = kd.query(P)
    orden = np.argpartition(d, k - 1)[:k] if k < len(d) else np.arange(len(d))
    mse = float((d[orden] ** 2).mean())
    return {"c": c, "R": R, "t": t, "xi": xi, "mse": mse,
            "psi": mse / (xi ** (1.0 + _ICP_LAMBDA))}


def _emparejar_icp(pts: np.ndarray, nombre: str, permitir_reflexion: bool,
                   gap_min_arco: float = _GAP_MIN_ARCO) -> Optional[dict]:
    """
    Empareja un contorno contra una plantilla del repertorio y estima completitud.

    Generaliza E3 a formas sin ecuación cerrada: la cobertura se mide sobre la
    LONGITUD DE ARCO de la plantilla, usando la posición de arco del punto de
    plantilla más cercano a cada punto conservado del fragmento. Para un círculo
    esto coincide con la cobertura angular de F1 — de ahí la paridad exigida por
    el gate del ADR.
    """
    from scipy.spatial import cKDTree

    gen = _REPERTORIO.get(nombre)
    if gen is None:
        return None
    plantilla_raw = np.asarray(gen(), dtype=np.float64)
    if len(plantilla_raw) < 8 or len(pts) < _MIN_PUNTOS:
        return None

    q, q_c, q_s = _normalizar(plantilla_raw)
    f, f_c, f_s = _normalizar(pts)
    kd = cKDTree(q)

    # Submuestreo del fragmento SOLO para el ICP (la cobertura usa el contorno
    # completo). Equiespaciado en índice: barato y determinista.
    paso = max(1, len(f) // _ICP_SUBMUESTRA)
    f_icp = f[::paso]

    # Fase 1 — rastreo grueso sobre (rotación × recorte), pocas iteraciones.
    #
    # El recorte entra DESDE EL PRINCIPIO, como en TrICP. Una fase gruesa sin
    # recortar (ξ=1) parece más simple pero falla justo en el caso que importa:
    # con un fragmento al 50 %, el 40 % del contorno es borde de fractura y
    # arrastra la pose inicial; la fase fina ya no se recupera. Medido en banco:
    # un sector de hexágono al 50 % RECHAZABA su propia plantilla (arco 0,035)
    # mientras aceptaba un triángulo espurio.
    quiralidades = (False, True) if permitir_reflexion else (False,)
    gruesos = []
    for espejo in quiralidades:
        f0 = f_icp * np.array([1.0, -1.0]) if espejo else f_icp
        for j in range(_ICP_ROTACIONES):
            a = 2.0 * math.pi * j / _ICP_ROTACIONES
            R0 = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])
            for xi in _ICP_XI_GRUESO:
                r = _icp_recortado(f0, kd, q, xi, (1.0, R0, np.zeros(2)),
                                   _ICP_ITERS_GRUESO, permitir_reflexion)
                gruesos.append((r["psi"], j, xi, espejo, r))
    if not gruesos:
        return None

    # Fase 2 — refinar sólo los mejores arranques; gana el menor psi (TrICP).
    gruesos.sort(key=lambda g: g[0])
    finos = []
    for _, _, _, espejo_g, r0 in gruesos[:_ICP_REFINAR]:
        f0 = f_icp * np.array([1.0, -1.0]) if espejo_g else f_icp
        for xi in _ICP_XI:
            r = _icp_recortado(f0, kd, q, xi, (r0["c"], r0["R"], r0["t"]),
                               _ICP_ITERS_MEDIO, permitir_reflexion)
            finos.append((r["psi"], espejo_g, r))
    finos.sort(key=lambda x: x[0])
    _, espejo, r_medio = finos[0]

    # Pulido final sólo del ganador: el barrido de recortes no necesita converger,
    # sólo ordenar; converger 21 veces era el grueso del coste.
    f0 = f_icp * np.array([1.0, -1.0]) if espejo else f_icp
    mejor = _icp_recortado(f0, kd, q, r_medio["xi"],
                           (r_medio["c"], r_medio["R"], r_medio["t"]),
                           _ICP_ITERS, permitir_reflexion)

    # Plantilla llevada a COORDENADAS DE IMAGEN: se invierte la transformada y se
    # deshace la normalización del fragmento. Así el residuo sale en píxeles y los
    # parámetros publicados son absolutos, igual que en F1.
    q_en_frag = ((q - mejor["t"]) @ mejor["R"]) / max(mejor["c"], 1e-12)
    if espejo:
        q_en_frag = q_en_frag * np.array([1.0, -1.0])
    plantilla_img = q_en_frag * f_s + f_c

    # Margen original = puntos dentro de la TOLERANCIA ABSOLUTA, no el conjunto
    # recortado por ξ. ξ es un parámetro INTERNO del TrICP (gobierna la búsqueda
    # de la pose); usarlo también para reportar rompía las dos cosas medidas en
    # banco: el recorte escoge los k globalmente más cercanos, que quedan
    # ENTREVERADOS a lo largo del contorno, así que el tramo contiguo salía
    # ridículo (0,11 en un disco al 75 % bien ajustado, residuo 0,9 → rechazado);
    # y cuando ξ salía alto incluía el borde de fractura en el residuo (10,5 px
    # en un hexágono correctamente emparejado). Con la tolerancia absoluta el
    # criterio es además el MISMO que el de la vía analítica, que es lo que hace
    # comparables ambas rutas.
    kd_img = cKDTree(plantilla_img)
    d_img, idx_img = kd_img.query(pts)
    tol = _TOL_REL_DIAG * _diagonal(pts)
    conservados = np.nonzero(d_img < tol)[0]
    if len(conservados) < 3:
        return None
    residuo_rms = float(np.sqrt((d_img[conservados] ** 2).mean()))

    # Cobertura sobre la longitud de arco de la plantilla (generalización de E3).
    largos_q = _largos_segmento(plantilla_img)
    S = np.concatenate([[0.0], np.cumsum(largos_q)])
    L = float(S[-1])
    if L <= 0:
        return None
    s_cub = np.sort(S[idx_img[conservados]])
    gap_min = gap_min_arco * L
    faltante, huecos, ausentes = 0.0, [], []
    for i in range(len(s_cub)):
        s0 = s_cub[i]
        s1 = s_cub[i + 1] if i < len(s_cub) - 1 else s_cub[0] + L
        if (s1 - s0) > gap_min:
            faltante += (s1 - s0)
            huecos.append({"inicio_frac": round(s0 / L, 4),
                           "fin_frac": round((s1 % L) / L, 4)})
            ausentes.append((float(s0), float(s1)))
    completitud = max(0.0, min(1.0, 1.0 - faltante / L))

    # Polilínea a dibujar + máscara de «respaldado por el fragmento». Aquí el
    # parámetro es longitud de arco, no el ángulo de la vía analítica: por eso la
    # máscara se construye en cada rama con su propio convenio y no se reconstruye
    # después a partir de los huecos ya redondeados.
    paso = max(1, len(plantilla_img) // _N_CONTORNO)
    idx_c = np.arange(0, len(plantilla_img), paso)
    s_c = S[idx_c]
    presente_c = np.ones(len(idx_c), dtype=bool)
    for s0, s1 in ausentes:
        dentro = (s_c >= s0) & (s_c <= s1)
        if s1 > L:                                  # el hueco cruza el origen
            dentro |= (s_c <= s1 - L)
        presente_c &= ~dentro

    # Soporte: fracción del PERÍMETRO DEL FRAGMENTO explicada por la plantilla,
    # medida como tramo contiguo — mismo criterio E1 que la vía analítica.
    largos_f = _largos_segmento(pts)
    inliers = np.zeros(len(pts), dtype=bool)
    inliers[conservados] = True
    _, _, largo_tramo = _tramo_contiguo_mas_largo(inliers, largos_f)
    perim_f = float(largos_f.sum())

    a_ejes = float(np.abs(q_en_frag).max() * f_s)
    return {
        "modelo": {
            "cx": float(plantilla_img[:, 0].mean()),
            "cy": float(plantilla_img[:, 1].mean()),
            "escala_px": a_ejes,
            "rotacion_deg": math.degrees(math.atan2(mejor["R"][1, 0], mejor["R"][0, 0])),
            "reflexion": bool(espejo),
        },
        "arco": pts[conservados],
        "arco_fraccion": (largo_tramo / perim_f) if perim_f > 0 else 0.0,
        "residuo_rms": residuo_rms,
        "completitud": completitud,
        "huecos": huecos,
        "xi": mejor["xi"],
        "psi": mejor["psi"],
        "contorno_plantilla": plantilla_img[idx_c],
        "contorno_presente": presente_c,
    }
