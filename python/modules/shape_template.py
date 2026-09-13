"""
MAO Plus — Módulo: emparejamiento con plantillas de forma ideal (ADR-017 F1)
===========================================================================
Infiere si un contorno es una pieza COMPLETA o el FRAGMENTO de una forma mayor,
ajustando una plantilla ideal (círculo, elipse) al **margen original** del
contorno y midiendo qué fracción de esa plantilla quedó preservada.

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

Determinismo: el RANSAC usa una semilla fija (`_SEED`), así que dos ejecuciones
sobre el mismo contorno dan el mismo resultado — requisito de replicabilidad del
repo (ADR-013 F2).

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
_MIN_ARCO_FRACCION = {"circulo": 0.30, "elipse": 0.45}
_MIN_COMPLETITUD   = 0.15    # por debajo, el ajuste degenera → rechazo (ADR-017 §4)
_UMBRAL_COMPLETO   = 0.93    # cobertura por encima de la cual se declara completo
_RANSAC_ITERS      = 600
_SEED              = 20260913
_N_GRID_ARCO       = 2048    # muestras para la longitud de arco de la plantilla
# La elipse tiene 2 parámetros más que el círculo y SIEMPRE ajusta al menos igual
# de bien; sólo se prefiere si mejora el residuo con margen.
_MARGEN_ELIPSE     = 0.80
_RATIO_EJES_CIRCULO = 0.95   # b/a por encima de esto ⇒ la elipse ES un círculo
_RATIO_EJES_MIN     = 0.15   # b/a por debajo de esto ⇒ la elipse ES una recta


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
                 gap_min_deg: float) -> tuple[float, list]:
    """
    E3 — fracción de la longitud de arco de la plantilla cubierta por el margen
    preservado. Se mide por HUECOS (saltos de parámetro mayores que `gap_min`),
    no por binning, que es sensible a la densidad de puntos del contorno.
    """
    if len(t_arco) < 3:
        return 0.0, []
    t_grid, S, L = _arco_acumulado(tipo, m)
    if L <= 0:
        return 0.0, []

    t = np.sort(t_arco)
    gap_min = math.radians(gap_min_deg)
    huecos = []
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
    return max(0.0, min(1.0, 1.0 - faltante / L)), huecos


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
) -> dict[str, Any]:
    """
    Empareja un contorno con las plantillas ideales pedidas y estima completitud.

    Parámetros
    ----------
    contour_points     lista de [x, y] en píxeles (coordenadas absolutas)
    templates          subconjunto de ("circulo", "elipse"); None = todas
    scale_px_mm        factor px→mm; si > 0 el residuo se reporta también en mm
    gap_min_deg        hueco angular mínimo que cuenta como ausencia (default 8°)
    min_arco_fraccion  dict {tipo: fracción} — soporte mínimo del perímetro sobre
                       la plantilla para aceptarla (default: círculo 0.30, elipse
                       0.45). Por debajo se RECHAZA en vez de inventar: es la
                       envolvente operativa medida en ADR-017 §4.

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
        "candidatos": [],
        "motivo_rechazo": None,
    }

    pts = np.asarray(contour_points, dtype=np.float64)
    if pts.ndim != 2 or pts.shape[1] != 2:
        return {"status": "error", "message": "contour_points debe ser lista de [x, y]"}
    if len(pts) < _MIN_PUNTOS:
        return {**vacio, "motivo_rechazo":
                f"contorno insuficiente: {len(pts)} puntos (mínimo {_MIN_PUNTOS})"}

    tipos = list(templates) if templates else ["circulo", "elipse"]
    desconocidos = [t for t in tipos if t not in ("circulo", "elipse")]
    if desconocidos:
        return {"status": "error",
                "message": f"plantillas no soportadas en F1: {desconocidos} "
                           f"(disponibles: circulo, elipse)"}

    umbrales = dict(_MIN_ARCO_FRACCION)
    if isinstance(min_arco_fraccion, dict):
        umbrales.update(min_arco_fraccion)

    diag = _diagonal(pts)
    candidatos = []
    for tipo in tipos:
        fit = _ajustar(pts, tipo, ransac_iters, seed)
        if fit is None:
            candidatos.append({"tipo": tipo, "aceptada": False,
                               "motivo": "sin ajuste válido"})
            continue
        comp, huecos = _completitud(_param(fit["arco"], tipo, fit["modelo"]),
                                    tipo, fit["modelo"], gap_min_deg)
        min_arco = umbrales.get(tipo, 0.30)
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
            "modelo": {k: round(float(v), 4) for k, v in fit["modelo"].items()},
            "huecos": huecos,
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
    elegido = aceptados[0]
    por_tipo = {c["tipo"]: c for c in aceptados}
    if "circulo" in por_tipo and "elipse" in por_tipo:
        ci, el = por_tipo["circulo"], por_tipo["elipse"]
        mm = el["_fit"]["modelo"]
        ratio = mm["b"] / mm["a"] if mm["a"] > 0 else 1.0
        elegido = el if (ratio < _RATIO_EJES_CIRCULO
                         and el["residuo_rms"] < _MARGEN_ELIPSE * ci["residuo_rms"]) else ci
    elif len(aceptados) == 1:
        elegido = aceptados[0]

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
        "plantilla_metodo": f"ransac_{elegido['tipo']}_contiguo",
        # CANDIDATO a confirmar (ADR-009 / ADR-017 §7), no un hecho.
        "es_fragmento_candidato": bool(completitud < _UMBRAL_COMPLETO * 100),
        "huecos": elegido["huecos"],
        "candidatos": [{k: v for k, v in c.items() if k != "_fit"} for c in candidatos],
        "motivo_rechazo": None,
        "umbral_completo_pct": _UMBRAL_COMPLETO * 100,
        "n_points_input": int(len(pts)),
        "seed": seed,
    }
