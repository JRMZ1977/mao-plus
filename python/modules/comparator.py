"""
MAO Plus — Módulo: Comparador estadístico y PCA
================================================
Estado: IMPLEMENTADO (IMPLEMENTED = True)

Funciones JS que reemplaza:
  - renderPCA()            comparator.js ~L69292
  - jacobiEigen()          comparator.js ~L69337  ← JS propio → sklearn SVD
  - standardize()          comparator.js ~L69309  ← replicado con StandardScaler
  - corrMatrix()           comparator.js ~L69324
  - kMeans()               comparator.js ~L69386  ← JS propio → sklearn.KMeans
  - silhouetteScore()      comparator.js ~L69441  ← JS propio → sklearn
  - bestKBySilhouette()    comparator.js ~L69463
  - mahalanobisDistances2D() comparator.js ~L69476
  - renderEstadisticos()   comparator.js
  - renderCorrelacion()    comparator.js

Ventaja sobre JS:
  JS implementa PCA con Jacobi iterativo, K-Means propio y silhouette manual.
  sklearn usa SVD (numéricamente estable), garantiza convergencia y es ~100x más rápido.
"""

from __future__ import annotations

import math
import os
from typing import Any

import numpy as np
import scipy.stats as st
from fastapi import HTTPException

IMPLEMENTED = True

# Umbral de distancia de Mahalanobis para considerar outlier.
# sqrt(chi²(2, 0.95)) = 2.448 → percentil 95% (nivel operativo)
# sqrt(chi²(2, 0.975)) = 2.716 → percentil 97.5% (nivel estricto)
_OUTLIER_THRESHOLD = 2.716  # percentil 97.5%, consistente con el nivel declarado

# ── Utilidades ──────────────────────────────────────────────────────────────

def _safe_round(val: Any, ndigits: int = 6) -> Any:
    """Redondea a ndigits si el valor es float finito; devuelve el valor original en caso contrario."""
    try:
        f = float(val)
        return round(f, ndigits) if math.isfinite(f) else val
    except (TypeError, ValueError):
        return val


def _build_matrix(objects: list[dict], keys: list[str]) -> np.ndarray:
    """Construye matriz numérica de métricas, usando NaN para valores ausentes."""
    rows = []
    for obj in objects:
        metricas = obj.get("metricas", obj)   # acepta {metricas:{...}} o {...}
        rows.append([
            float(metricas.get(k, math.nan))
            for k in keys
        ])
    return np.array(rows, dtype=float)


def _get_numeric_keys(objects: list[dict]) -> list[str]:
    """Extrae claves con valores numéricos finitos presentes en ≥50% de objetos."""
    if not objects:
        return []
    metricas0 = objects[0].get("metricas", objects[0])
    candidate_keys = [
        k for k, v in metricas0.items()
        if isinstance(v, (int, float)) and not isinstance(v, bool)
        and math.isfinite(float(v))
        and not k.startswith("_")
    ]
    n = len(objects)
    valid_keys = []
    for k in candidate_keys:
        count = sum(
            1 for obj in objects
            if isinstance(obj.get("metricas", obj).get(k), (int, float))
            and not isinstance(obj.get("metricas", obj).get(k), bool)
            and math.isfinite(float(obj.get("metricas", obj).get(k, math.nan)))
        )
        if count / n >= 0.5:
            valid_keys.append(k)
    # Excluir claves de incertidumbre y rangos (derivadas, no originales)
    excl_suffixes = ("_incertidumbre_abs", "_rango_min", "_rango_max")
    valid_keys = [k for k in valid_keys if not any(k.endswith(s) for s in excl_suffixes)]
    return valid_keys


def _impute_median(X: np.ndarray) -> np.ndarray:
    """Imputa NaN con la mediana de cada columna."""
    out = X.copy()
    for j in range(out.shape[1]):
        col = out[:, j]
        nan_mask = np.isnan(col)
        if nan_mask.any():
            median = float(np.nanmedian(col))
            col[nan_mask] = median
    return out


# ── PCA + K-Means ────────────────────────────────────────────────────────────

async def pca(
    objects: list[dict[str, Any]],
    n_components: int = 2,
    n_clusters: int = 0,
) -> dict:
    """
    PCA + K-Means + Silhouette sobre colección de objetos arqueológicos.

    Replica exactamente la lógica de renderPCA() — comparator.js ~L69292,
    pero usando sklearn en lugar de las implementaciones Jacobi/Lloyd propias de JS.

    Parámetros:
      objects      — lista de objetos con campo "metricas" {k: float, ...}
      n_components — dimensiones del espacio PCA de salida (default: 2)
      n_clusters   — número de clusters; 0 = auto por silhouette (default)

    Retorna:
      scores             — coordenadas PCA por objeto [[pc1, pc2], ...]
      loadings           — contribución de cada variable a cada PC
      explained_variance — proporción de varianza explicada por cada PC
      labels             — etiqueta de cluster por objeto
      n_clusters         — K usado finalmente
      silhouette         — puntuación de silhouette global [-1, 1]
      mahalanobis        — distancia de Mahalanobis por objeto
      outliers           — índices de posibles outliers (Mahal > umbral)
      feature_names      — nombres de métricas usadas
    """
    from sklearn.decomposition import PCA as SKPCA
    from sklearn.preprocessing import StandardScaler
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score

    if len(objects) < 2:
        raise HTTPException(status_code=422, detail="Se necesitan al menos 2 objetos para PCA.")

    keys = _get_numeric_keys(objects)
    if len(keys) < 2:
        raise HTTPException(status_code=422, detail="Se necesitan al menos 2 métricas numéricas.")

    X = _build_matrix(objects, keys)
    X = _impute_median(X)

    # Eliminar columnas con varianza cero (constantes → PCA singular)
    std_cols = X.std(axis=0)
    nonzero_mask = std_cols > 1e-10
    X = X[:, nonzero_mask]
    active_keys = [k for k, keep in zip(keys, nonzero_mask) if keep]

    if X.shape[1] < 2:
        raise HTTPException(status_code=422, detail="Demasiadas métricas constantes; no se puede calcular PCA.")

    # 1. Estandarizar — equivale a standardize() JS
    scaler = StandardScaler()
    Z = scaler.fit_transform(X)

    # 2. PCA — equivale a jacobiEigen() JS (pero SVD → numéricamente estable)
    n_comp = min(n_components, Z.shape[0] - 1, Z.shape[1])
    pca_model = SKPCA(n_components=n_comp)
    scores_nd = pca_model.fit_transform(Z)

    scores_2d = scores_nd[:, :2].tolist()
    explained = pca_model.explained_variance_ratio_.tolist()
    loadings  = pca_model.components_.tolist()   # shape: (n_comp, n_features)

    # 3. K-Means — equivale a kMeans() JS
    max_k = min(9, len(objects) - 1)
    labels_out = [0] * len(objects)
    final_k    = 1
    sil_score  = 0.0

    if max_k >= 2:
        work_data = scores_nd  # clustering en espacio PCA
        if n_clusters == 0:
            # Auto-determinar K por silhouette — equivale a bestKBySilhouette() JS
            best_k, best_sil = 2, -1.0
            for k in range(2, max_k + 1):
                km = KMeans(n_clusters=k, n_init=10, random_state=42)
                lbl = km.fit_predict(work_data)
                if len(set(lbl)) > 1:
                    sc = silhouette_score(work_data, lbl)
                    if sc > best_sil:
                        best_k, best_sil = k, sc
            n_clusters = best_k

        actual_k = min(n_clusters, max_k)
        km = KMeans(n_clusters=actual_k, n_init=10, random_state=42)
        labels_out = km.fit_predict(work_data).tolist()
        final_k    = actual_k
        if len(set(labels_out)) > 1:
            sil_score = float(silhouette_score(work_data, labels_out))

    # 4. Distancias de Mahalanobis — equivale a mahalanobisDistances2D() JS
    mah_distances = _mahalanobis_distances(Z)
    outlier_idx   = [i for i, d in enumerate(mah_distances) if d > _OUTLIER_THRESHOLD]

    return {
        "status":             "ok",
        "scores":             scores_2d,
        "loadings":           loadings,
        "explained_variance": explained,
        "labels":             labels_out,
        "n_clusters":         final_k,
        "silhouette":         round(sil_score, 4),
        "mahalanobis":        [round(d, 4) for d in mah_distances],
        "outliers":           outlier_idx,
        "feature_names":      active_keys,
        "n_objects":          len(objects),
        "n_features":         len(active_keys),
    }


def _mahalanobis_distances(Z: np.ndarray) -> list[float]:
    """
    Calcula distancias de Mahalanobis de cada punto respecto a la media del conjunto.
    Usa pseudo-inversa para robustez ante matrices singulares.
    Replica mahalanobisDistances2D() — comparator.js ~L69476.
    """
    mean = Z.mean(axis=0)
    try:
        cov    = np.cov(Z.T)
        inv_c  = np.linalg.pinv(cov)
        diffs  = Z - mean
        # d²_i = (z_i - mu)^T Σ^{-1} (z_i - mu)
        d2     = np.einsum("ij,jk,ik->i", diffs, inv_c, diffs)
        return [float(math.sqrt(max(0.0, v))) for v in d2]
    except np.linalg.LinAlgError:
        # Fallback: distancia euclídea normalizada
        norms = np.linalg.norm(Z - mean, axis=1)
        return norms.tolist()


# ── Estadísticos y correlación ───────────────────────────────────────────────

async def statistics(
    objects: list[dict[str, Any]],
    keys: list[str],
) -> dict:
    """
    Estadísticos descriptivos + matriz de correlación de Pearson con p-valores.

    Replica renderEstadisticos() y renderCorrelacion() — comparator.js.

    Parámetros:
      objects — lista de objetos con campo "metricas"
      keys    — lista de nombres de métricas a analizar

    Retorna:
      statistics       — {metric: {mean, median, std, min, max, q25, q75,
                                    skewness, kurtosis, cv, n}}
      correlation_matrix — [[float, ...], ...] (Pearson r)
      p_values           — [[float, ...], ...] (p-valor bilateral)
      feature_names      — nombres de claves analizadas
    """
    if not keys:
        keys = _get_numeric_keys(objects)
    if not keys:
        raise HTTPException(status_code=422, detail="No se encontraron métricas numéricas.")

    X = _build_matrix(objects, keys)

    stats_out: dict[str, dict] = {}
    for i, key in enumerate(keys):
        col = X[:, i]
        col_clean = col[np.isfinite(col)]
        if len(col_clean) < 2:
            stats_out[key] = {"n": int(len(col_clean)), "error": "datos insuficientes"}
            continue
        mean = float(np.mean(col_clean))
        std  = float(np.std(col_clean, ddof=1))
        stats_out[key] = {
            "mean":     _safe_round(mean, 6),
            "median":   _safe_round(float(np.median(col_clean)), 6),
            "std":      _safe_round(std, 6),
            "min":      _safe_round(float(np.min(col_clean)), 6),
            "max":      _safe_round(float(np.max(col_clean)), 6),
            "q25":      _safe_round(float(np.percentile(col_clean, 25)), 6),
            "q75":      _safe_round(float(np.percentile(col_clean, 75)), 6),
            "skewness": _safe_round(float(st.skew(col_clean)), 4),
            "kurtosis": _safe_round(float(st.kurtosis(col_clean)), 4),
            "cv":       _safe_round(abs(std / mean) if mean else 0.0, 4),
            "n":        int(len(col_clean)),
        }

    # Matriz de correlación — solo columnas sin NaN completos
    X_imp = _impute_median(X)
    n = len(keys)
    corr_mat = [[0.0] * n for _ in range(n)]
    pval_mat = [[1.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i == j:
                corr_mat[i][j] = 1.0
                pval_mat[i][j] = 0.0
            else:
                r, p = st.pearsonr(X_imp[:, i], X_imp[:, j])
                corr_mat[i][j] = round(float(r), 4) if math.isfinite(r) else 0.0
                pval_mat[i][j] = round(float(p), 4) if math.isfinite(p) else 1.0

    return {
        "status":             "ok",
        "statistics":         stats_out,
        "correlation_matrix": corr_mat,
        "p_values":           pval_mat,
        "feature_names":      keys,
        "n_objects":          len(objects),
    }


# ── Comparación bifacial ─────────────────────────────────────────────────────

def _normalize_angle(deg: float) -> float:
    """Normaliza ángulo al rango [−90, 90]."""
    while deg > 90:
        deg -= 180
    while deg < -90:
        deg += 180
    return abs(deg)


def _specular_reflect(point: list[float], centroid: list[float]) -> list[float]:
    """Reflejo horizontal respecto al centroide (anverso ↔ reverso)."""
    return [2 * centroid[0] - point[0], point[1]]


def bifacial(cara_a: dict, cara_b: dict) -> dict:
    """
    Calcula el índice de simetría bifacial entre dos caras de un objeto.

    Replica: calcularComparacionBifacial() + analizarDistribucionPH()
             analysis-core.js ~L35970 / ~L36120

    Parámetros
    ----------
    cara_a, cara_b : dicts con campos:
        metricas       — dict de métricas morfométricas (area, perimetro,
                         circularity/circularidad, convexity/convexidad,
                         solidity/solidez, elongation/elongacion,
                         centroide [x,y], angulo_eje_mayor,
                         radio_maximo, radio_minimo)
        perforaciones  — lista de P/H [{centroide:[x,y], ...}]
        horadaciones   — lista de P/H [{centroide:[x,y], ...}]
        clasificacion_forma — str (opcional)

    Retorna
    -------
    dict con:
        indiceSimetriaGeneral   — [0,1] índice global
        simetriaArea            — similitud de área (1 = idénticas)
        simetriaPerimetro       — similitud de perímetro
        similitud*              — métricas de forma (circularity, etc.)
        alineacionEspacial      — 'Excelente'|'Buena'|'Pobre'
        desplazamientoNormalizado — float
        reflejoEspecular        — bool
        distribucionPH          — {simetriaEspecular, simetriaPosicional, desc}
        perforacionesA/B, horadacionesA/B, totalPH_A/B
        clasificaciones, mismaClasificacion
    """
    m_a = cara_a.get("metricas", {})
    m_b = cara_b.get("metricas", {})

    # Paridad MAO_A por defecto: no exponer CI/CMS salvo modo extendido explícito.
    include_ci_cms = os.getenv("MAO_ENABLE_CI_CMS", "0").strip().lower() in {"1", "true", "yes", "on"}

    def _get(m: dict, *keys) -> float:
        for k in keys:
            v = m.get(k)
            if v is not None:
                try:
                    return float(v)
                except (TypeError, ValueError):
                    pass
        return 0.0

    def _sim_par_ci_cms(va: float, vb: float) -> float:
        """
        Similitud par formal de Sección XIII:
            s(a,b) = max(0, 1 - |a-b| / ((a+b)/2))
        """
        a = float(va)
        b = float(vb)
        mean_ab = (a + b) / 2.0
        if abs(mean_ab) < 1e-12:
            return 1.0
        return max(0.0, 1.0 - abs(a - b) / abs(mean_ab))

    def _weighted_similarity(
        metric_defs: list[tuple[tuple[str, ...], float]],
        *,
        min_pairs: int = 1,
    ) -> tuple[float | None, dict[str, float]]:
        """
        Calcula media ponderada de similitudes par sobre métricas disponibles.
        Retorna (indice, detalles_por_metrica).
        """
        weighted_sum = 0.0
        weight_sum = 0.0
        used_pairs = 0
        details: dict[str, float] = {}

        for aliases, weight in metric_defs:
            va = _get(m_a, *aliases)
            vb = _get(m_b, *aliases)
            # Ignorar pareja si ambos ausentes/cero reales para no sesgar por faltantes
            if va == 0.0 and vb == 0.0:
                continue
            sim = _sim_par_ci_cms(va, vb)
            key = aliases[0]
            details[key] = round(sim, 4)
            weighted_sum += sim * weight
            weight_sum += weight
            used_pairs += 1

        if used_pairs < min_pairs or weight_sum <= 0:
            return None, details

        return max(0.0, min(1.0, weighted_sum / weight_sum)), details

    # ── 1. Análisis de centroides ────────────────────────────────────────────
    cent_a = m_a.get("centroide") or m_a.get("centroid") or [0.0, 0.0]
    cent_b = m_b.get("centroide") or m_b.get("centroid") or [0.0, 0.0]

    desplazamiento = math.hypot(cent_a[0] - cent_b[0], cent_a[1] - cent_b[1])
    area_prom = (_get(m_a, "area") + _get(m_b, "area")) / 2
    radio_equiv = math.sqrt(area_prom / math.pi) if area_prom > 0 else 1.0
    desplaz_norm = desplazamiento / radio_equiv

    alineacion = (
        "Excelente" if desplaz_norm < 0.1
        else "Buena" if desplaz_norm < 0.3
        else "Pobre"
    )

    # ── 2. Reflejo especular de orientación (anverso ↔ reverso) ─────────────
    angulo_a = _get(m_a, "angulo_eje_mayor", "angulo_eje")
    angulo_b = _get(m_b, "angulo_eje_mayor", "angulo_eje")
    angulo_reflejado = -angulo_a
    dif_angular = _normalize_angle(angulo_b - angulo_reflejado)
    simetria_orient = max(0.0, 1.0 - dif_angular / 90.0)
    calidad_reflejo = (
        "Excelente" if dif_angular < 10
        else "Buena" if dif_angular < 30
        else "Pobre"
    )

    r_max_a = _get(m_a, "radio_maximo")
    r_max_b = _get(m_b, "radio_maximo")
    r_min_a = _get(m_a, "radio_minimo")
    r_min_b = _get(m_b, "radio_minimo")

    def _simetria_par(va: float, vb: float) -> float:
        denom = max(va, vb)
        return 1.0 - abs(va - vb) / denom if denom > 0 else 1.0

    sim_r_max = _simetria_par(r_max_a, r_max_b)
    sim_r_min = _simetria_par(r_min_a, r_min_b)

    es_reflejo = dif_angular < 30 and sim_r_max > 0.8 and sim_r_min > 0.8

    # ── 3. Similitudes de forma ──────────────────────────────────────────────
    area_a = _get(m_a, "area")
    area_b = _get(m_b, "area")
    perim_a = _get(m_a, "perimetro")
    perim_b = _get(m_b, "perimetro")

    sim_area   = _simetria_par(area_a, area_b)
    sim_perim  = _simetria_par(perim_a, perim_b)
    sim_circ   = max(0.0, min(1.0, 1.0 - abs(_get(m_a, "circularity", "circularidad") - _get(m_b, "circularity", "circularidad"))))
    sim_conv   = max(0.0, min(1.0, 1.0 - abs(_get(m_a, "convexity", "convexidad")    - _get(m_b, "convexity", "convexidad"))))
    sim_solid  = max(0.0, min(1.0, 1.0 - abs(_get(m_a, "solidity", "solidez")        - _get(m_b, "solidity", "solidez"))))
    sim_elong  = max(0.0, min(1.0, 1.0 - abs(_get(m_a, "elongation", "elongacion")   - _get(m_b, "elongation", "elongacion"))))

    # ── 4. Distribución especular de P/H ────────────────────────────────────
    perfs_a = cara_a.get("perforaciones") or []
    horads_a = cara_a.get("horadaciones") or []
    perfs_b = cara_b.get("perforaciones") or []
    horads_b = cara_b.get("horadaciones") or []

    ph_a = perfs_a + horads_a
    ph_b = perfs_b + horads_b

    def _centroide_ph(ph: dict) -> list[float]:
        c = ph.get("centroide") or ph.get("metricas", {}).get("centroide") or [0.0, 0.0]
        return [float(c[0]), float(c[1])]

    def _dist_promedio_al_centroide(phs: list, centroide: list) -> float:
        if not phs:
            return 0.0
        dists = [math.hypot(_centroide_ph(p)[0] - centroide[0], _centroide_ph(p)[1] - centroide[1]) for p in phs]
        return sum(dists) / len(dists)

    dist_prom_a = _dist_promedio_al_centroide(ph_a, cent_a)
    dist_prom_b = _dist_promedio_al_centroide(ph_b, cent_b)
    simetria_posicional = _simetria_par(dist_prom_a, dist_prom_b) if (dist_prom_a or dist_prom_b) else 1.0

    simetria_especular = 1.0
    tolerancia = 0.15
    if ph_a and ph_b:
        coincidencias = 0
        for p_a in ph_a:
            cent_pa = _centroide_ph(p_a)
            reflejado = _specular_reflect(cent_pa, cent_a)
            coincide = any(
                math.hypot(_centroide_ph(p_b)[0] - reflejado[0], _centroide_ph(p_b)[1] - reflejado[1])
                / radio_equiv < tolerancia
                for p_b in ph_b
            ) if radio_equiv > 0 else False
            if coincide:
                coincidencias += 1
        simetria_especular = coincidencias / max(len(ph_a), len(ph_b))
    elif not ph_a and not ph_b:
        simetria_especular = 1.0
    else:
        simetria_especular = 0.0

    ph_desc = (
        "Sin perforaciones/horadaciones en ninguna cara"
        if not ph_a and not ph_b
        else f"Cara A: {len(ph_a)} P/H, Cara B: {len(ph_b)} P/H"
    )

    # ── 5. Índice global de simetría bifacial ────────────────────────────────
    # Pesos idénticos a calcularComparacionBifacial() JS
    indice = (
        sim_area            * 0.25 +
        sim_circ            * 0.20 +
        sim_conv            * 0.20 +
        (1.0 - min(desplaz_norm, 1.0)) * 0.15 +
        simetria_orient     * 0.10 +
        simetria_especular  * 0.10
    )

    # ── 6. Sección XIII: CI / CMS (coherencia bifacial formal) ──────────────
    # CI: métricas dimensionales absolutas
    ci_defs = [
        (("area",), 3.0),
        (("perimetro", "perimeter"), 2.0),
        (("eje_mayor_real_longitud", "eje_mayor", "major_axis"), 2.0),
        (("eje_menor_real_longitud", "eje_menor", "minor_axis"), 1.5),
        (("feret_max", "feret_maximo"), 1.5),
        (("feret_min", "feret_minimo"), 1.0),
    ]
    ci, ci_details = _weighted_similarity(ci_defs, min_pairs=2)

    # CMS: subíndices (forma / radial / contorno)
    forma_defs = [
        (("circularity", "circularidad"), 1.0),
        (("solidity", "solidez"), 1.0),
        (("elongation", "elongacion"), 1.0),
        (("rectangularidad", "rectangularity"), 1.0),
        (("simetria_bilateral", "symmetry_score"), 1.0),
        (("convexity", "convexidad"), 1.0),
        (("excentricidad",), 1.0),
    ]
    radial_defs = [
        (("radio_medio",), 1.0),
        (("ratio_radios",), 1.0),
        (("coeficiente_variacion_radial",), 1.0),
        (("regularidad_radial",), 1.0),
        (("indice_estrellamiento", "estrellamiento"), 1.0),
    ]
    contorno_defs = [
        (("rugosidad_borde", "rugosidad_contorno", "rugosidad"), 1.0),
        (("ici",), 1.0),
        (("curvatura_media",), 1.0),
        (("varianza_tonal_interna", "variabilidad_intensidad"), 1.0),
        (("entropia_superficie",), 1.0),
        (("gradiente_medio",), 1.0),
    ]

    i_forma, i_forma_details = _weighted_similarity(forma_defs, min_pairs=2)
    i_radial, i_radial_details = _weighted_similarity(radial_defs, min_pairs=2)
    i_contorno, i_contorno_details = _weighted_similarity(contorno_defs, min_pairs=2)

    cms: float | None = None
    if i_forma is not None and i_radial is not None and i_contorno is not None:
        cms = 0.50 * i_forma + 0.30 * i_radial + 0.20 * i_contorno

    # Interpretación CI/CMS (Sección XIII)
    interpretacion_ci_cms = {
        "categoria": "Datos insuficientes",
        "descripcion": "No hay métricas suficientes para evaluar CI/CMS.",
        "diferenciacionNatural": False,
    }
    if ci is not None and cms is not None:
        if ci >= 0.85 and cms >= 0.85:
            interpretacion_ci_cms = {
                "categoria": "Correspondencia máxima",
                "descripcion": "Caras prácticamente idénticas en dimensiones y morfología de superficie.",
                "diferenciacionNatural": False,
            }
        elif ci >= 0.78 and cms >= 0.62:
            interpretacion_ci_cms = {
                "categoria": "Correspondencia normal",
                "descripcion": "Caras compatibles del mismo objeto con variación esperable de manufactura.",
                "diferenciacionNatural": False,
            }
        elif ci >= 0.78 and cms < 0.62:
            interpretacion_ci_cms = {
                "categoria": "Diferenciación natural",
                "descripcion": "Dimensiones equivalentes con morfología superficial divergente.",
                "diferenciacionNatural": True,
            }
        elif ci < 0.60 and cms < 0.60:
            interpretacion_ci_cms = {
                "categoria": "No relacionados morfométricamente",
                "descripcion": "Baja coherencia dimensional y superficial entre caras.",
                "diferenciacionNatural": False,
            }
        else:
            interpretacion_ci_cms = {
                "categoria": "Correspondencia baja o ambigua",
                "descripcion": "Patrón intermedio que requiere revisión contextual.",
                "diferenciacionNatural": False,
            }

    result = {
        "status": "ok",
        # — índice global —
        "indiceSimetriaGeneral":      round(indice, 4),
        # — claves legacy (compatibilidad de contrato) —
        "interpretacionSimetria":     None,
        "coherenciaPromedio":         None,
        "correlacionEspacial":        None,
        # — área y perímetro —
        "simetriaArea":               round(sim_area, 4),
        "simetriaPerimetro":          round(sim_perim, 4),
        "diferenciaArea":             round(abs(area_a - area_b), 4),
        "diferenciaPerimetro":        round(abs(perim_a - perim_b), 4),
        "ratioArea":                  round(max(area_a, area_b) / min(area_a, area_b), 4) if min(area_a, area_b) > 0 else None,
        # — forma —
        "similitudCircularidad":      round(max(0.0, sim_circ), 4),
        "similitudConvexidad":        round(max(0.0, sim_conv), 4),
        "similitudSolidez":           round(max(0.0, sim_solid), 4),
        "similitudElongacion":        round(max(0.0, sim_elong), 4),
        # — centroides y alineación —
        "centroideA":                 [round(float(v), 2) for v in cent_a],
        "centroideB":                 [round(float(v), 2) for v in cent_b],
        "desplazamientoCentroides":   round(desplazamiento, 4),
        "desplazamientoNormalizado":  round(desplaz_norm, 4),
        "alineacionEspacial":         alineacion,
        # — reflejo especular —
        "anguloEjeMayorA":            round(angulo_a, 2),
        "anguloEjeMayorB":            round(angulo_b, 2),
        "anguloReflejadoEsperado":    round(angulo_reflejado, 2),
        "diferenciaAngularConReflejo": round(dif_angular, 2),
        "simetriaOrientacion":        round(simetria_orient, 4),
        "calidadReflejoAngular":      calidad_reflejo,
        "simetriaRadioMaximo":        round(sim_r_max, 4),
        "simetriaRadioMinimo":        round(sim_r_min, 4),
        "esReflejoEspecular":         es_reflejo,
        # — distribución P/H —
        "distribucionPH": {
            "simetriaPosicional": round(simetria_posicional, 4),
            "simetriaEspecular":  round(simetria_especular, 4),
            "descripcion":        ph_desc,
        },
        # — conteos P/H —
        "perforacionesA": len(perfs_a),
        "perforacionesB": len(perfs_b),
        "horadacionesA":  len(horads_a),
        "horadacionesB":  len(horads_b),
        "totalPH_A":      len(ph_a),
        "totalPH_B":      len(ph_b),
        # — clasificaciones —
        "clasificacionA":      cara_a.get("clasificacion_forma") or cara_a.get("clasificacionForma"),
        "clasificacionB":      cara_b.get("clasificacion_forma") or cara_b.get("clasificacionForma"),
        "mismaClasificacion":  (
            cara_a.get("clasificacion_forma") == cara_b.get("clasificacion_forma")
        ),
    }

    if include_ci_cms:
        ci_cms_payload = {
            # — coherencia bifacial formal (Sección XIII) —
            "subindicesCMS": {
                "I_forma": round(i_forma, 4) if i_forma is not None else None,
                "I_radial": round(i_radial, 4) if i_radial is not None else None,
                "I_contorno": round(i_contorno, 4) if i_contorno is not None else None,
            },
            "similitudesCI": ci_details,
            "similitudesCMS": {
                "forma": i_forma_details,
                "radial": i_radial_details,
                "contorno": i_contorno_details,
            },
            "interpretacionCI_CMS": interpretacion_ci_cms,
        }
        if ci is not None:
            ci_cms_payload["CI"] = round(ci, 4)
        if cms is not None:
            ci_cms_payload["CMS"] = round(cms, 4)
        result.update(ci_cms_payload)

    return result
