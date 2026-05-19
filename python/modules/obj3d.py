"""
MAO Plus — Módulo: Morfometría 3D (.obj) basada en PCA
=========================================================

Analiza mallas 3D en formato OBJ y calcula métricas morfométricas orientadas
por Componentes Principales (PCA), robustas a rotación global.

Métricas principales:
  - eigenvalues (λ1 ≥ λ2 ≥ λ3)
  - explained_variance_ratio
  - linearity, planarity, sphericity, elongation
  - extents sobre ejes PCA
  - área superficial y volumen (si malla cerrada)
"""

from __future__ import annotations

import io
import math
from typing import Any

import numpy as np
from fastapi import HTTPException

try:
    from python.modules import obj3d_v2
    V2_AVAILABLE = True
except ImportError:
    V2_AVAILABLE = False

IMPLEMENTED = True


def _ensure_trimesh():
    """Import diferido para permitir que el servidor arranque aunque falte dependencia."""
    try:
        import trimesh  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise HTTPException(
            status_code=500,
            detail=(
                "El módulo obj3d requiere 'trimesh'. "
                "Instale dependencias Python y reinicie el servidor."
            ),
        ) from exc
    return trimesh


def _normalize_points(points: np.ndarray, mode: str) -> tuple[np.ndarray, float]:
    """
    Normaliza escala de la nube de puntos según el modo indicado.

    Retorna (points_normalizados, factor_escala_aplicado).
    """
    mode = (mode or "none").lower()
    if mode in ("none", "no", "off"):
        return points, 1.0

    eps = 1e-12
    X = points.copy()

    if mode in ("bbox", "bboxdiag", "bbox_diagonal"):
        bmin = X.min(axis=0)
        bmax = X.max(axis=0)
        diag = float(np.linalg.norm(bmax - bmin))
        scale = max(diag, eps)
        return X / scale, scale

    if mode in ("std", "sigma"):
        s = float(np.std(X))
        scale = max(s, eps)
        return X / scale, scale

    raise HTTPException(
        status_code=422,
        detail="normalize_mode inválido. Use: none, bboxdiag o std.",
    )


def _pca_metrics(points: np.ndarray) -> dict[str, Any]:
    """Calcula PCA 3D y métricas morfológicas derivadas."""
    if points.shape[0] < 10:
        raise HTTPException(
            status_code=422,
            detail="Nube de puntos insuficiente para PCA 3D (mínimo 10 puntos).",
        )

    X = points - points.mean(axis=0, keepdims=True)
    cov = np.cov(X.T)

    eigvals, eigvecs = np.linalg.eigh(cov)  # ascendente
    order = np.argsort(eigvals)[::-1]
    eigvals = eigvals[order]
    eigvecs = eigvecs[:, order]

    eps = 1e-12
    l1, l2, l3 = [float(v + eps) for v in eigvals]
    lsum = l1 + l2 + l3

    Y = X @ eigvecs
    ext = Y.max(axis=0) - Y.min(axis=0)

    return {
        "eigenvalues": [l1, l2, l3],
        "explained_variance_ratio": [l1 / lsum, l2 / lsum, l3 / lsum],
        "linearity": (l1 - l2) / l1,
        "planarity": (l2 - l3) / l1,
        "sphericity": l3 / l1,
        "elongation": l1 / l2,
        "principal_axes": eigvecs.tolist(),  # columnas: PC1, PC2, PC3
        "pca_extents": [float(ext[0]), float(ext[1]), float(ext[2])],
    }


def _safe_hist_symmetry(values: np.ndarray, bins: int = 32) -> float:
    """
    Simetría 1D por comparación de histogramas entre semiejes opuestos.

    Retorna score en [0,1], donde 1 es máxima simetría especular.
    """
    if values.size < 50:
        return 0.5

    pos = values[values >= 0.0]
    neg = -values[values < 0.0]  # espejo
    if pos.size < 10 or neg.size < 10:
        return 0.5

    vmax = float(max(np.max(pos), np.max(neg), 1e-9))
    hpos, _ = np.histogram(pos, bins=bins, range=(0.0, vmax), density=True)
    hneg, _ = np.histogram(neg, bins=bins, range=(0.0, vmax), density=True)

    l1 = float(np.sum(np.abs(hpos - hneg)))
    # Distancia L1 de densidades discretas; normalizar de forma conservadora.
    score = 1.0 - min(1.0, 0.5 * l1)
    return float(max(0.0, min(1.0, score)))


def _canonicalize_orientation(
    points: np.ndarray,
    principal_axes: np.ndarray,
    eigenvalues: list[float],
) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    """
    Construye un marco canónico reproducible a partir de PCA.

    PCA define dirección, pero aquí resolvemos signos (±) y mano derecha.
    """
    eps = 1e-12
    X = points - points.mean(axis=0, keepdims=True)

    # Base PCA inicial (columnas)
    R = principal_axes.copy()
    Y = X @ R

    # Regla S1: +E1 hacia mayor "masa" proyectada
    p1 = Y[:, 0]
    mass_pos = float(np.sum(np.abs(p1[p1 >= 0.0])))
    mass_neg = float(np.sum(np.abs(p1[p1 < 0.0])))
    s1_applied = False
    if mass_neg > mass_pos:
        R[:, 0] *= -1.0
        s1_applied = True

    # Recalcular con posible flip en E1
    Y = X @ R

    # Regla S2: +E3 hacia semiesfera con menor rugosidad (proxy robusto)
    p3 = Y[:, 2]
    pos_mask = p3 >= 0.0
    neg_mask = ~pos_mask
    rough_pos = float(np.std(p3[pos_mask])) if np.any(pos_mask) else math.inf
    rough_neg = float(np.std(p3[neg_mask])) if np.any(neg_mask) else math.inf
    s2_applied = False
    if rough_neg < rough_pos:
        R[:, 2] *= -1.0
        s2_applied = True

    # Forzar base ortonormal diestra: E2 = E3 x E1
    e1 = R[:, 0]
    e3 = R[:, 2]
    e2 = np.cross(e3, e1)
    n2 = float(np.linalg.norm(e2))
    if n2 > eps:
        e2 = e2 / n2
    else:
        e2 = R[:, 1]

    R_fix = np.column_stack([e1, e2, e3])
    Xc = X @ R_fix

    l1, l2, l3 = [float(v) for v in eigenvalues]
    gap12 = (l1 - l2) / max(l1, eps)
    gap23 = (l2 - l3) / max(l1, eps)
    axis_separation = max(0.0, min(1.0, 0.6 * gap12 + 0.4 * gap23))

    balance = abs(mass_pos - mass_neg) / max(mass_pos + mass_neg, eps)
    sign_stability = max(0.0, min(1.0, 0.5 + 0.5 * balance))

    orientation_confidence = float(max(0.0, min(1.0, 0.7 * axis_separation + 0.3 * sign_stability)))

    meta = {
        "sign_rules": {
            "rule_s1_flip_e1": bool(s1_applied),
            "rule_s2_flip_e3": bool(s2_applied),
            "mass_pos_e1": mass_pos,
            "mass_neg_e1": mass_neg,
            "rough_pos_e3": rough_pos if np.isfinite(rough_pos) else None,
            "rough_neg_e3": rough_neg if np.isfinite(rough_neg) else None,
        },
        "orientation_confidence": orientation_confidence,
    }

    return Xc, R_fix, meta


def _compute_shape_variables(
    canonical_points: np.ndarray,
    pca: dict[str, Any],
) -> dict[str, Any]:
    """Deriva variables globales de forma para decisión mono/bi."""
    eps = 1e-12
    ext_x, ext_y, ext_z = [float(v) for v in pca["pca_extents"]]
    l1, l2, l3 = [float(v) for v in pca["eigenvalues"]]

    max_xy = max(ext_x, ext_y, eps)
    thickness_ratio = ext_z / max_xy
    anisotropy = (l1 - l3) / max(l1, eps)

    # Rugosidad proxy en eje de espesor canónico
    z = canonical_points[:, 2]
    zmad = float(np.median(np.abs(z - np.median(z))))
    roughness_mean = float(np.mean(np.abs(z))) / max(ext_z, eps)
    roughness_std = float(np.std(z)) / max(ext_z, eps)
    roughness_mad = zmad / max(ext_z, eps)

    symmetry_yz = _safe_hist_symmetry(canonical_points[:, 0])
    symmetry_xz = _safe_hist_symmetry(canonical_points[:, 1])
    mirror_error = float(max(0.0, 1.0 - 0.5 * (symmetry_yz + symmetry_xz)))

    return {
        "extents": {
            "x": ext_x,
            "y": ext_y,
            "z": ext_z,
        },
        "thickness_ratio": float(thickness_ratio),
        "anisotropy": float(anisotropy),
        "roughness_mean": float(roughness_mean),
        "roughness_std": float(roughness_std),
        "roughness_mad": float(roughness_mad),
        "symmetry": {
            "yz": float(symmetry_yz),
            "xz": float(symmetry_xz),
            "mirror_error": float(mirror_error),
        },
    }


def _compute_bifacial_decision(
    canonical_points: np.ndarray,
    shape_vars: dict[str, Any],
) -> dict[str, Any]:
    """
    Decisión inicial mono/bi usando hemisuperficies en eje canónico Z.

    Esta versión evita segmentación pesada y sirve como base operacional (hybrid_v1).
    """
    eps = 1e-12
    z = canonical_points[:, 2]
    pos = z >= 0.0
    neg = ~pos

    n_pos = int(np.sum(pos))
    n_neg = int(np.sum(neg))
    n_tot = max(1, n_pos + n_neg)

    area_pos = n_pos / n_tot
    area_neg = n_neg / n_tot

    mean_pos = float(np.mean(z[pos])) if n_pos > 0 else 0.0
    mean_neg = float(np.mean(z[neg])) if n_neg > 0 else 0.0
    sep = abs(mean_pos - mean_neg)
    ext_z = max(float(shape_vars["extents"]["z"]), eps)

    s_opposition = float(max(0.0, min(1.0, sep / ext_z)))
    s_area_balance = float(max(0.0, min(1.0, 1.0 - abs(area_pos - area_neg))))
    mirror_similarity = float(max(0.0, min(1.0, 1.0 - float(shape_vars["symmetry"]["mirror_error"]))))

    # Menor rugosidad relativa => mayor regularidad
    regular_surface = float(max(0.0, min(1.0, 1.0 - min(1.0, float(shape_vars["roughness_mean"])))))

    w1, w2, w3, w4 = 0.35, 0.25, 0.25, 0.15
    i_bif = float(w1 * s_opposition + w2 * s_area_balance + w3 * mirror_similarity + w4 * regular_surface)

    if i_bif >= 0.70:
        mode = "bifacial"
    elif i_bif >= 0.45:
        mode = "indeterminado"
    else:
        mode = "monofacial"

    candidate_a = {
        "id": "A",
        "hemisphere": "z_positive",
        "area_ratio": float(area_pos),
        "mean_depth": float(mean_pos),
        "points": n_pos,
    }
    candidate_b = {
        "id": "B",
        "hemisphere": "z_negative",
        "area_ratio": float(area_neg),
        "mean_depth": float(mean_neg),
        "points": n_neg,
    }

    if area_pos >= area_neg:
        primary = "A"
    else:
        primary = "B"

    assignment = {
        "A": "A" if mode == "bifacial" else None,
        "B": "B" if mode == "bifacial" else None,
        "primary": primary,
    }

    return {
        "mode": mode,
        "bifacial_index": {
            "value": i_bif,
            "components": {
                "opposition": s_opposition,
                "area_balance": s_area_balance,
                "mirror_similarity": mirror_similarity,
                "regular_surface": regular_surface,
            },
        },
        "candidates": [candidate_a, candidate_b],
        "assignment": assignment,
    }


def _build_quality_flags(
    pca: dict[str, Any],
    orientation_confidence: float,
    sampled_points: int,
) -> list[str]:
    """Genera flags de calidad para uso en UI/colección."""
    flags: list[str] = []
    l1, l2, l3 = [float(v) for v in pca["eigenvalues"]]
    eps = 1e-12
    if sampled_points < 5000:
        flags.append("low_sampling_density")
    if (l1 - l2) / max(l1, eps) < 0.05:
        flags.append("weak_primary_axis")
    if (l2 - l3) / max(l1, eps) < 0.03:
        flags.append("weak_secondary_axis")
    if orientation_confidence < 0.45:
        flags.append("low_orientation_confidence")
    return flags


async def analyze(
    obj_bytes: bytes,
    n_samples: int = 20000,
    n_sections: int = 9,
    normalize_mode: str = "none",
    analysis_level: str = "pca",
    orientation_mode: str = "auto",
    user_anchor: tuple[float | None, float | None, float | None] | None = None,
    mm_per_unit: float = 1.0,
) -> dict[str, Any]:
    """
    Analiza una malla OBJ y retorna métricas morfométricas.

    Parámetros
    ----------
    obj_bytes       : bytes del archivo .obj
    n_samples       : número de puntos de muestreo superficial
    normalize_mode  : normalización de escala (none|bboxdiag|std)
    analysis_level  : 'pca' | 'hybrid_v1' (PCA primero) | 'v2' (caras primero, arquitectura correcta)
    mm_per_unit     : factor de conversión de unidades OBJ a milímetros
                      (1.0=mm, 10.0=cm, 1000.0=m, 25.4=pulgadas)
    """
    
    level = (analysis_level or "pca").strip().lower()
    
    # Delegación a v2 si se pide arquitectura correcta
    if level == "v2" and V2_AVAILABLE:
        result = await obj3d_v2.analyze_v2(
            obj_bytes,
            n_samples=n_samples,
            n_sections=n_sections,
            normalize_mode=normalize_mode,
            orientation_mode=orientation_mode,
            user_anchor=user_anchor,
        )
        # ── Conversión de unidades a milímetros (sobre resultado v2) ────────
        f = float(mm_per_unit)
        if f > 0.0 and f != 1.0:
            f2, f3 = f * f, f * f * f
            p = result.get("obj3d", {})
            if "bounds_min" in p:
                p["bounds_min"] = [v * f for v in p["bounds_min"]]
            if "bounds_max" in p:
                p["bounds_max"] = [v * f for v in p["bounds_max"]]
            if "centroid" in p:
                p["centroid"] = [v * f for v in p["centroid"]]
            if "surface_area" in p:
                p["surface_area"] = p["surface_area"] * f2
            if p.get("volume") is not None:
                p["volume"] = p["volume"] * f3
            # pca_extents dentro del bloque pca, si existe
            pca_block = p.get("pca", {})
            if isinstance(pca_block, dict) and "pca_extents" in pca_block:
                norm_lower = (normalize_mode or "none").strip().lower()
                if norm_lower in ("none", "no", "off"):
                    pca_block["pca_extents"] = [v * f for v in pca_block["pca_extents"]]
        result.setdefault("obj3d", {})["mm_per_unit"] = f
        return result
    elif level == "v2" and not V2_AVAILABLE:
        raise HTTPException(
            status_code=422,
            detail="Módulo obj3d_v2 no disponible. Intente con analysis_level='pca' o 'hybrid_v1'.",
        )
    trimesh = _ensure_trimesh()

    if not obj_bytes:
        raise HTTPException(status_code=400, detail="Archivo OBJ vacío.")

    if n_samples < 500:
        raise HTTPException(status_code=422, detail="n_samples debe ser ≥ 500.")

    try:
        mesh = trimesh.load(io.BytesIO(obj_bytes), file_type="obj", force="mesh")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"No se pudo leer el OBJ: {exc}") from exc

    if mesh is None or mesh.is_empty:
        raise HTTPException(status_code=422, detail="Malla OBJ vacía o inválida.")

    # Si viniera una Scene, intentar concatenar
    if isinstance(mesh, trimesh.Scene):
        try:
            mesh = trimesh.util.concatenate(tuple(mesh.geometry.values()))
        except Exception as exc:
            raise HTTPException(status_code=422, detail="No se pudo convertir Scene a malla.") from exc

    if mesh.vertices is None or len(mesh.vertices) < 3:
        raise HTTPException(status_code=422, detail="OBJ sin geometría de vértices suficiente.")

    try:
        points, _ = trimesh.sample.sample_surface(mesh, int(n_samples))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"No se pudo muestrear superficie: {exc}") from exc

    points = np.asarray(points, dtype=np.float64)
    points, applied_scale = _normalize_points(points, normalize_mode)

    pca = _pca_metrics(points)

    bounds = mesh.bounds if mesh.bounds is not None else np.array([[0, 0, 0], [0, 0, 0]], dtype=float)

    obj_payload: dict[str, Any] = {
        "num_vertices": int(len(mesh.vertices)),
        "num_faces": int(len(mesh.faces)) if mesh.faces is not None else 0,
        "surface_area": float(mesh.area),
        "volume": float(mesh.volume) if bool(getattr(mesh, "is_watertight", False)) else None,
        "is_watertight": bool(getattr(mesh, "is_watertight", False)),
        "centroid": [float(x) for x in mesh.centroid.tolist()],
        "bounds_min": [float(x) for x in bounds[0].tolist()],
        "bounds_max": [float(x) for x in bounds[1].tolist()],
        "sampled_points": int(points.shape[0]),
        "normalize_mode": normalize_mode,
        "normalize_scale": float(applied_scale),
        **pca,
    }

    # ── Conversión de unidades a milímetros ──────────────────────────────────
    f = float(mm_per_unit)
    if f != 1.0 and f > 0.0:
        f2 = f * f
        f3 = f2 * f
        obj_payload["bounds_min"] = [v * f for v in obj_payload["bounds_min"]]
        obj_payload["bounds_max"] = [v * f for v in obj_payload["bounds_max"]]
        obj_payload["centroid"] = [v * f for v in obj_payload["centroid"]]
        obj_payload["surface_area"] = obj_payload["surface_area"] * f2
        if obj_payload["volume"] is not None:
            obj_payload["volume"] = obj_payload["volume"] * f3
        # pca_extents solo si no se normalizó (en ese caso ya son adimensionales)
        norm_lower = normalize_mode.lower() if normalize_mode else "none"
        if norm_lower in ("none", "no", "off"):
            obj_payload["pca_extents"] = [v * f for v in obj_payload["pca_extents"]]
    obj_payload["mm_per_unit"] = f

    if level in ("hybrid", "hybrid_v1"):
        axes_np = np.asarray(pca["principal_axes"], dtype=np.float64)
        eigvals = [float(v) for v in pca["eigenvalues"]]
        canonical_points, rot_fix, orientation_meta = _canonicalize_orientation(
            points=points,
            principal_axes=axes_np,
            eigenvalues=eigvals,
        )
        shape_vars = _compute_shape_variables(canonical_points=canonical_points, pca=pca)
        faces = _compute_bifacial_decision(canonical_points=canonical_points, shape_vars=shape_vars)
        quality_flags = _build_quality_flags(
            pca=pca,
            orientation_confidence=float(orientation_meta["orientation_confidence"]),
            sampled_points=int(points.shape[0]),
        )

        obj_payload.update(
            {
                "analysis_level": "hybrid_v1",
                "orientation": {
                    "canonical_transform": {
                        "center": [float(v) for v in points.mean(axis=0).tolist()],
                        "rotation": [[float(v) for v in row] for row in rot_fix.tolist()],
                    },
                    "sign_rules": orientation_meta["sign_rules"],
                    "confidence": float(orientation_meta["orientation_confidence"]),
                },
                "shape_variables": shape_vars,
                "faces": faces,
                "quality_flags": quality_flags,
            }
        )
    elif level not in ("pca", "hybrid_v1"):
        raise HTTPException(
            status_code=422,
            detail="analysis_level inválido. Use: 'pca', 'hybrid_v1' o 'v2'.",
        )
    else:
        obj_payload["analysis_level"] = "pca"

    return {
        "status": "ok",
        "obj3d": obj_payload,
    }


def flatten_3d_for_comparator(
    result_3d: dict[str, Any],
    object_id: str | None = None,
) -> dict[str, Any]:
    """
    Adapta salida de análisis 3D al formato esperado por comparator.pca/statistics.

    Soporta tanto salida legacy (pca/hybrid_v1) como salida v2.
    """
    if not isinstance(result_3d, dict):
        return {
            "id": object_id or "obj3d_object",
            "nombre": object_id or "obj3d_object",
            "source": "obj3d",
            "metricas": {},
        }

    root = result_3d.get("obj3d") if isinstance(result_3d.get("obj3d"), dict) else result_3d
    if not isinstance(root, dict):
        root = {}

    metricas: dict[str, float] = {}

    # v2: firma homologada + índices MAO3D
    hom3d = root.get("homologation_3d") if isinstance(root.get("homologation_3d"), dict) else {}
    sig = hom3d.get("signature") if isinstance(hom3d.get("signature"), dict) else {}
    canonical = root.get("morphology_canonical") if isinstance(root.get("morphology_canonical"), dict) else {}
    idx3d = canonical.get("mao3d_indices") if isinstance(canonical.get("mao3d_indices"), dict) else {}

    for bucket in (sig, idx3d):
        for k, v in bucket.items():
            try:
                fv = float(v)
                if math.isfinite(fv):
                    metricas[str(k)] = fv
            except Exception:
                continue

    # Legacy: PCA + shape_variables + bifacial index
    for key in (
        "linearity",
        "planarity",
        "sphericity",
        "elongation",
        "surface_area",
        "volume",
    ):
        if key in root:
            try:
                fv = float(root[key])
                if math.isfinite(fv):
                    metricas[key] = fv
            except Exception:
                pass

    shape_vars = root.get("shape_variables") if isinstance(root.get("shape_variables"), dict) else {}
    for key in (
        "thickness_ratio",
        "anisotropy",
        "roughness_mean",
        "roughness_std",
        "roughness_mad",
    ):
        if key in shape_vars:
            try:
                fv = float(shape_vars[key])
                if math.isfinite(fv):
                    metricas[key] = fv
            except Exception:
                pass

    faces = root.get("faces") if isinstance(root.get("faces"), dict) else {}
    bifacial = faces.get("bifacial_index") if isinstance(faces.get("bifacial_index"), dict) else {}
    if "value" in bifacial:
        try:
            fv = float(bifacial["value"])
            if math.isfinite(fv):
                metricas["bifacial_index"] = fv
        except Exception:
            pass

    obj_name = object_id or str(root.get("analysis_level") or "obj3d_object")
    return {
        "id": object_id or "obj3d_object",
        "nombre": obj_name,
        "source": "obj3d",
        "metricas": metricas,
    }
