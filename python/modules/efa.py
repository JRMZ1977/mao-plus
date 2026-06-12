"""
MAO Plus — Módulo: Elliptic Fourier Analysis (EFA)
===================================================
Implementa descriptores de Fourier elípticos (EFD) para análisis de contornos
arqueológicos. Compatible con literatura GMM (Kuhl & Giardina 1982).

Referencia canónica:
  Kuhl, F.P. & Giardina, C.R. (1982). Elliptic Fourier features of a closed contour.
  Computer Graphics and Image Processing, 18(3), 236–258.

Invariancias aplicadas (modo 'normalized', por defecto):
  - Traslación   : el contorno se centra antes de calcular
  - Escala       : coeficientes normalizados al primer armónico
  - Rotación     : alineación al semieje mayor del 1er armónico (SEMA)
  - Reflexión    : opcional, activo por defecto para comparación inter-colección

Salida por armónico k:
  an, bn, cn, dn  — coeficientes elípticos (equivalentes a Re/Im de la
                    transformada de Fourier del contorno 2D parametrizado)

Funciones exportadas:
  calculate(contour_points, n_harmonics, scale_px_mm, normalize)
  reconstruct(coeffs, n_points)
  distance_matrix(coeffs_list)
"""

import math
import numpy as np
from typing import Any

IMPLEMENTED = True

# ── Constantes ─────────────────────────────────────────────────────────────
_DEFAULT_HARMONICS = 20   # Estándar para morfometría arqueológica (≈ 99% de varianza)
_MIN_POINTS        = 8    # Mínimo de puntos para un EFA estable


# ── Función núcleo: coeficientes EFD ────────────────────────────────────────

def _efd_raw(pts: np.ndarray, n_harmonics: int) -> np.ndarray:
    """
    Calcula coeficientes EFD sin normalizar.

    Parametrización por longitud de arco acumulada (igual a pyefd internamente).
    Retorna array shape (n_harmonics, 4): [an, bn, cn, dn] por armónico.

    Basado en: Kuhl & Giardina (1982) ecuaciones 9-12.
    """
    # Deltas x, y entre puntos consecutivos (contorno cerrado)
    n = len(pts)
    dx = np.diff(pts[:, 0], append=pts[0, 0])
    dy = np.diff(pts[:, 1], append=pts[0, 1])

    # Longitudes de segmento dt[i] = |P[i+1] - P[i]|
    dt = np.sqrt(dx ** 2 + dy ** 2)
    dt = np.where(dt < 1e-10, 1e-10, dt)   # evitar división por cero

    # Tiempo acumulado T (longitud de arco total) y t[i] (tiempo en cada nodo)
    T = float(dt.sum())
    t = np.zeros(n + 1)
    t[1:] = np.cumsum(dt)                  # t[0]=0, t[n]=T

    coeffs = np.zeros((n_harmonics, 4))

    for k in range(1, n_harmonics + 1):
        w = 2.0 * math.pi * k / T

        # Factores coseno/seno para cada segmento (integrales de Kuhl & Giardina)
        tp  = t[:-1]          # t[i]
        tn  = t[1:]           # t[i+1]
        cos_n = np.cos(w * tn)
        cos_p = np.cos(w * tp)
        sin_n = np.sin(w * tn)
        sin_p = np.sin(w * tp)

        # Integral de dx/dt * cos(wt) dt  →  an
        an = (T / (2.0 * math.pi ** 2 * k ** 2)) * np.sum(
            (dx / dt) * (sin_n - sin_p)
        )
        # Integral de dx/dt * sin(wt) dt  →  bn
        bn = -(T / (2.0 * math.pi ** 2 * k ** 2)) * np.sum(
            (dx / dt) * (cos_n - cos_p)
        )
        # Integral de dy/dt * cos(wt) dt  →  cn
        cn = (T / (2.0 * math.pi ** 2 * k ** 2)) * np.sum(
            (dy / dt) * (sin_n - sin_p)
        )
        # Integral de dy/dt * sin(wt) dt  →  dn
        dn = -(T / (2.0 * math.pi ** 2 * k ** 2)) * np.sum(
            (dy / dt) * (cos_n - cos_p)
        )

        coeffs[k - 1] = [an, bn, cn, dn]

    return coeffs


def _normalize_coeffs(coeffs: np.ndarray) -> tuple[np.ndarray, dict]:
    """
    Normaliza EFD para invariancia a escala, rotación y reflexión
    siguiendo el procedimiento estándar (Kuhl & Giardina 1982, sec. 4).

    Parámetros de normalización devueltos para trazabilidad:
      theta_1  : ángulo de alineación al semieje mayor del 1er armónico
      psi_1    : rotación de referencia en el plano de la forma
      scale    : factor de escala = semieje mayor del 1er armónico
    """
    c = coeffs.copy()
    n = len(c)

    # ── 1. Rotación de FASE θ₁ — invariancia al punto de inicio ───────────────
    # θ₁ orienta la PARAMETRIZACIÓN al semieje mayor del 1er armónico (equivale
    # a la matriz V de la SVD de M₁=[[a1,b1],[c1,d1]]). Cada armónico k rota k·θ₁.
    a1, b1, c1, d1 = c[0]
    theta_1 = 0.5 * math.atan2(
        2.0 * (a1 * b1 + c1 * d1),
        a1 ** 2 - b1 ** 2 + c1 ** 2 - d1 ** 2
    )
    for k in range(1, n + 1):
        idx = k - 1
        a, b, cc_, d = c[idx]
        angle = k * theta_1
        cos_a = math.cos(angle); sin_a = math.sin(angle)
        c[idx] = [
            a * cos_a + b * sin_a,
           -a * sin_a + b * cos_a,
            cc_ * cos_a + d * sin_a,
           -cc_ * sin_a + d * cos_a,
        ]

    # ── 2. Rotación ESPACIAL ψ₁ — invariancia a la orientación en el plano ────
    # Tras θ₁ el 1er armónico = [[a1',b1'],[c1',d1']]; su semieje mayor apunta a
    # ψ₁ = atan2(c1', a1') EN EL PLANO. Se rota TODA la forma por −ψ₁ (matriz U
    # de la SVD), llevando el semieje mayor al eje X. SIN este paso la EFA NO es
    # invariante a la rotación de la pieza (Kuhl & Giardina 1982, sec. 4).
    a1p, _b1p, c1p, _d1p = c[0]
    psi_1 = math.atan2(c1p, a1p)
    cos_p = math.cos(psi_1); sin_p = math.sin(psi_1)
    for idx in range(n):
        a, b, cc_, d = c[idx]
        # R(−ψ₁) · [[a, b], [cc_, d]]   con R(−ψ) = [[cosψ, sinψ], [−sinψ, cosψ]]
        c[idx] = [
            cos_p * a + sin_p * cc_,
            cos_p * b + sin_p * d,
           -sin_p * a + cos_p * cc_,
           -sin_p * b + cos_p * d,
        ]

    # ── 3. Escala — normalizar por el semieje mayor del 1er armónico ──────────
    # Tras ψ₁: c[0] = [E1, 0, 0, d1''] → E1 = √(a1''²+c1''²) (c1''≈0).
    E1_sq = c[0][0] ** 2 + c[0][2] ** 2
    E1    = math.sqrt(E1_sq) if E1_sq > 1e-20 else 1.0
    c /= E1

    # ── 4. Reflexión — convenio de quiralidad d1 ≥ 0 ─────────────────────────
    # Una reflexión sobre el eje mayor (o invertir el sentido de recorrido del
    # contorno) cambia el signo de d1. Forzar d1 ≥ 0 colapsa ambos casos en una
    # forma canónica única. (Sustituye al antiguo criterio c1≥0, que tras la
    # rotación espacial ψ₁ quedaba siempre en c1≈0 y no discriminaba nada.)
    if c[0][3] < 0:
        c[:, 2] *= -1.0   # negar componentes-y (cn, dn) de todos los armónicos
        c[:, 3] *= -1.0

    return c, {
        "theta_1_deg":   round(math.degrees(theta_1), 4),
        "psi_1_deg":     round(math.degrees(psi_1), 4),
        "scale_factor":  round(float(E1), 6),
    }


def _reconstruct_contour(coeffs: np.ndarray, n_points: int = 256,
                         dc: tuple[float, float] = (0.0, 0.0)) -> list[list[float]]:
    """
    Reconstruye contorno a partir de coeficientes EFD.
    dc: offset DC (centroide) para posicionar correctamente el contorno.
    """
    t = np.linspace(0, 1, n_points, endpoint=False)
    x = np.full(n_points, dc[0])
    y = np.full(n_points, dc[1])

    n = len(coeffs)
    for k in range(1, n + 1):
        a, b, c_, d = coeffs[k - 1]
        angle = 2.0 * math.pi * k * t
        x += a * np.cos(angle) + b * np.sin(angle)
        y += c_ * np.cos(angle) + d * np.sin(angle)

    return [[round(float(xi), 4), round(float(yi), 4)] for xi, yi in zip(x, y)]


def _power_spectrum(coeffs: np.ndarray) -> list[float]:
    """
    Espectro de potencia por armónico: sqrt(an²+bn²+cn²+dn²).
    Útil para determinar n_harmonics necesarios y para comparación de formas.
    """
    return [round(float(np.sqrt(np.sum(row ** 2))), 6) for row in coeffs]


def _variance_explained(coeffs: np.ndarray) -> list[float]:
    """
    Varianza acumulada explicada por los primeros k armónicos (%).
    Equivale a qué fracción de la forma está capturada.
    """
    ps = np.array([np.sum(row ** 2) for row in coeffs])
    total = ps.sum()
    if total < 1e-20:
        return [0.0] * len(ps)
    cumsum = np.cumsum(ps)
    return [round(float(v / total * 100), 2) for v in cumsum]


def _dc_components(pts: np.ndarray) -> tuple[float, float]:
    """
    Componentes DC: offset para centrar la reconstrucción en el centroide del contorno.
    Fórmulas de Kuhl & Giardina (1982), ecuaciones 6-8.
    """
    n = len(pts)
    dx = np.diff(pts[:, 0], append=pts[0, 0])
    dy = np.diff(pts[:, 1], append=pts[0, 1])
    dt = np.sqrt(dx ** 2 + dy ** 2)
    dt = np.where(dt < 1e-10, 1e-10, dt)
    T  = float(dt.sum())

    t_prev = np.zeros(n)
    t_prev[1:] = np.cumsum(dt[:-1])

    a0 = (1.0 / T) * np.sum(
        (dx / (2.0 * dt)) * (dt ** 2) + pts[:, 0] * dt
    )
    c0 = (1.0 / T) * np.sum(
        (dy / (2.0 * dt)) * (dt ** 2) + pts[:, 1] * dt
    )
    return float(a0), float(c0)


# ── API pública ─────────────────────────────────────────────────────────────

async def calculate(
    contour_points: list,
    n_harmonics: int = _DEFAULT_HARMONICS,
    scale_px_mm: float = 1.0,
    normalize: bool = True,
) -> dict[str, Any]:
    """
    Calcula descriptores EFD para un contorno arqueológico.

    Parámetros
    ----------
    contour_points : list de [x, y] en píxeles (coordenadas absolutas)
    n_harmonics    : número de armónicos (default 20; para publicación usar ≥ 10)
    scale_px_mm    : factor de escala px→mm; si >1 se convierten las coords antes
    normalize      : si True, aplica normalización canónica (invariante a escala,
                     rotación y reflexión) — obligatorio para comparación GMM

    Retorno
    -------
    {
      "status": "ok",
      "n_harmonics": int,
      "n_points_input": int,
      "coefficients": [[an, bn, cn, dn], ...],   # shape (n_harmonics, 4)
      "coefficients_raw": [[...], ...],           # sin normalizar (para debug)
      "normalization": {theta_1_deg, psi_1_deg, scale_factor},
      "power_spectrum": [float, ...],             # por armónico
      "variance_explained": [float, ...],         # % acumulado por armónico
      "harmonics_for_95pct": int,                 # armónicos para ≥ 95% varianza
      "harmonics_for_99pct": int,
      "contour_reconstructed": [[x,y], ...],      # 256 puntos (para visualización)
      "dc": [a0, c0],                             # offset centroide
      "scale_px_mm": float,
    }
    """
    pts = np.array(contour_points, dtype=np.float64)
    if pts.ndim != 2 or pts.shape[1] != 2:
        return {"status": "error", "message": "contour_points debe ser lista de [x, y]"}
    if len(pts) < _MIN_POINTS:
        return {
            "status": "error",
            "message": f"Contorno insuficiente: {len(pts)} puntos (mínimo {_MIN_POINTS})"
        }

    # Aplicar escala si px_mm > 0
    if scale_px_mm > 0 and scale_px_mm != 1.0:
        pts = pts * scale_px_mm

    # Clamp n_harmonics
    max_harmonics = len(pts) // 2
    n_harmonics   = max(1, min(n_harmonics, max_harmonics))

    # Componentes DC (centroide de la forma)
    dc_a, dc_c = _dc_components(pts)

    # Coeficientes crudos
    raw_coeffs = _efd_raw(pts, n_harmonics)

    # Normalización
    if normalize:
        norm_coeffs, norm_params = _normalize_coeffs(raw_coeffs)
    else:
        norm_coeffs = raw_coeffs.copy()
        norm_params = {"theta_1_deg": 0.0, "psi_1_deg": 0.0, "scale_factor": 1.0}

    # Espectro y varianza
    ps  = _power_spectrum(norm_coeffs)
    var = _variance_explained(norm_coeffs)

    # Armónicos para 95% y 99%
    h95 = h99 = n_harmonics
    for i, v in enumerate(var):
        if v >= 95.0 and h95 == n_harmonics:
            h95 = i + 1
        if v >= 99.0 and h99 == n_harmonics:
            h99 = i + 1
            break

    # Reconstrucción para visualización (solo con coefs normalizados)
    reconstructed = _reconstruct_contour(norm_coeffs, n_points=256)

    return {
        "status":           "ok",
        "n_harmonics":      n_harmonics,
        "n_points_input":   len(pts),
        "coefficients":     [[round(float(v), 8) for v in row] for row in norm_coeffs],
        "coefficients_raw": [[round(float(v), 8) for v in row] for row in raw_coeffs],
        "normalization":    norm_params,
        "power_spectrum":   ps,
        "variance_explained": var,
        "harmonics_for_95pct": h95,
        "harmonics_for_99pct": h99,
        "contour_reconstructed": reconstructed,
        "dc":               [round(dc_a, 4), round(dc_c, 4)],
        "scale_px_mm":      scale_px_mm,
    }


async def compare(
    coeffs_a: list,
    coeffs_b: list,
) -> dict[str, Any]:
    """
    Calcula distancia morfométrica entre dos conjuntos de coeficientes EFD.

    Distancias implementadas:
      - Euclidiana en espacio EFD (D_efd): suma de cuadrados de diferencias
      - Distancia de potencia espectral (D_ps): diferencia en espectros
      - Similitud normalizada (S_norm ∈ [0,1]): 1 = idéntico

    Los coeficientes deben estar ya normalizados (salida de /api/efa con
    normalize=True) y con el mismo n_harmonics para comparación válida.
    """
    a = np.array(coeffs_a, dtype=np.float64)
    b = np.array(coeffs_b, dtype=np.float64)

    n = min(len(a), len(b))
    if n == 0:
        return {"status": "error", "message": "Coeficientes vacíos"}

    a = a[:n]; b = b[:n]

    # Distancia euclídea en espacio EFD
    d_efd = float(np.sqrt(np.sum((a - b) ** 2)))

    # Distancia en espectro de potencia
    ps_a = np.sqrt(np.sum(a ** 2, axis=1))
    ps_b = np.sqrt(np.sum(b ** 2, axis=1))
    d_ps = float(np.sqrt(np.sum((ps_a - ps_b) ** 2)))

    # Similitud: 1 / (1 + d_efd)
    s_norm = round(1.0 / (1.0 + d_efd), 4)

    return {
        "status":      "ok",
        "n_harmonics_compared": n,
        "d_efd":       round(d_efd, 6),
        "d_ps":        round(d_ps, 6),
        "similarity":  s_norm,
        "interpretation": (
            "Formas muy similares" if s_norm >= 0.90 else
            "Formas similares"     if s_norm >= 0.75 else
            "Formas moderadamente distintas" if s_norm >= 0.50 else
            "Formas distintas"
        ),
    }
