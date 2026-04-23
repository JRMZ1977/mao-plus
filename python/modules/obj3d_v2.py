"""
MAO Plus — Módulo: Morfometría 3D (.obj) — Arquitectura v2 (Correcta)
=====================================================================

Flujo correcto (Iteración 2+):
  1. Segmentación de superficies regulares (por curvatura + coherencia)
  2. Identificación de caras candidatas (pares opuestos)
  3. Normalización espacial según caras encontradas (NO según PCA global)
  4. PCA contextualizado (solo sobre cara/forma definitiva)
  5. Métricas morfométricas compatibles con MAO 2D

Este módulo reemplaza el flujo anterior (hybrid_v1) que era "PCA primero".
"""

from __future__ import annotations

import io
import math
from typing import Any

import numpy as np
from fastapi import HTTPException

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


def _segment_regular_surfaces(
    mesh: Any,
    curvature_threshold: float = 0.1,
    normal_coherence_threshold: float = 0.85,
    min_patch_size: int = 100,
) -> list[dict[str, Any]]:
    """
    Segmenta la malla en parches de superficie regular.
    
    Criterios:
      - Curvatura media baja (superficie plana o suavemente curva)
      - Normales coherentes (altamente alineadas)
      - Tamaño mínimo
    
    Retorna lista de parches con atributos: área, normal_media, curvatura_media, bbox, centroide, vértices.
    """
    trimesh = _ensure_trimesh()
    eps = 1e-9
    
    # Calcular curvatura de Gauss en cada vértice (proxy robusto)
    try:
        principal_curvatures = mesh.principal_curvatures
        gaussian_curv = principal_curvatures[0] * principal_curvatures[1]
        mean_curv = 0.5 * (principal_curvatures[0] + principal_curvatures[1])
    except Exception:
        # Fallback: usar desviación estándar de normales por vértice
        vertex_normals = mesh.vertex_normals
        gaussian_curv = np.abs(np.linalg.norm(np.diff(vertex_normals[:10], axis=0), axis=1)).mean() * np.ones(len(mesh.vertices))
        mean_curv = gaussian_curv

    # Calcular coherencia de normales en vecindarios
    vertex_normals = mesh.vertex_normals
    adjacency = mesh.vertex_neighbors
    
    normal_coherence = np.ones(len(mesh.vertices))
    for v_idx in range(len(mesh.vertices)):
        neighbors = adjacency[v_idx]
        if len(neighbors) > 0:
            n_v = vertex_normals[v_idx]
            n_neighbors = vertex_normals[neighbors]
            dots = np.abs(np.dot(n_neighbors, n_v))
            normal_coherence[v_idx] = float(np.mean(dots))

    # Identificar vértices "regulares" (baja curvatura + normales coherentes)
    is_regular = (
        (np.abs(gaussian_curv) < curvature_threshold) &
        (normal_coherence > normal_coherence_threshold)
    )

    # Agrupar por conectividad (flood fill en vértices regulares)
    visited = np.zeros(len(mesh.vertices), dtype=bool)
    patches = []
    faces_idx = np.asarray(mesh.faces, dtype=np.int64)

    def _convex_hull_metrics_2d(points_uv: np.ndarray) -> tuple[float, float]:
        """
        Métricas envolventes 2D del parche proyectado (ignora vacíos internos).

        Se usa como proxy de "superficie formal completa" para evitar que
        huecos topológicos (p.ej. toroide) distorsionen la dominancia por área.

        Retorna:
          - area_gross_2d
          - perimeter_gross_2d
        """
        if points_uv.shape[0] < 3:
            return 0.0, 0.0
        try:
            from scipy.spatial import ConvexHull  # type: ignore

            hull = ConvexHull(points_uv)
            # En 2D: volume=área, area=perímetro
            return float(hull.volume), float(hull.area)
        except Exception:
            # Fallback robusto sin SciPy: caja envolvente en UV
            rng = points_uv.max(axis=0) - points_uv.min(axis=0)
            area_box = float(rng[0] * rng[1])
            perim_box = float(2.0 * (abs(rng[0]) + abs(rng[1])))
            return area_box, perim_box

    for start_v in np.where(is_regular)[0]:
        if visited[start_v]:
            continue

        # BFS sobre vértices regulares conectados
        queue = [start_v]
        patch_verts = []
        while queue:
            v = queue.pop(0)
            if visited[v]:
                continue
            visited[v] = True
            patch_verts.append(v)

            for neighbor in adjacency[v]:
                if not visited[neighbor] and is_regular[neighbor]:
                    queue.append(neighbor)

        if len(patch_verts) < min_patch_size:
            continue

        patch_verts = np.array(patch_verts, dtype=int)
        patch_pos = mesh.vertices[patch_verts]

        # Atributos del parche
        in_patch = np.zeros(len(mesh.vertices), dtype=bool)
        in_patch[patch_verts] = True
        patch_face_mask = np.all(in_patch[faces_idx], axis=1)
        patch_area = float(np.sum(mesh.area_faces[patch_face_mask]))
        patch_normal = np.mean(vertex_normals[patch_verts], axis=0)
        patch_normal = patch_normal / (np.linalg.norm(patch_normal) + eps)
        patch_curvature = float(np.mean(np.abs(gaussian_curv[patch_verts])))
        patch_bbox_min = patch_pos.min(axis=0)
        patch_bbox_max = patch_pos.max(axis=0)
        patch_centroid = patch_pos.mean(axis=0)

        # Horizontalidad intrínseca del parche:
        # - baja dispersión a lo largo de la normal (aproxima plano)
        # - alta extensión en el plano tangente
        centered = patch_pos - patch_centroid
        n = patch_normal
        normal_proj = centered @ n
        normal_std = float(np.std(normal_proj))

        # Planitud por coherencia de normales locales respecto a normal media.
        # 1.0 => muy coplanar; valores bajos => superficie curva/irregular.
        vnorm_patch = vertex_normals[patch_verts]
        normal_alignment = float(np.mean(np.abs(vnorm_patch @ n))) if len(vnorm_patch) else 0.0

        # Base local en plano tangente
        t1 = np.array([1.0, 0.0, 0.0])
        if abs(float(np.dot(t1, n))) > 0.9:
            t1 = np.array([0.0, 1.0, 0.0])
        t1 = t1 - np.dot(t1, n) * n
        t1 = t1 / (np.linalg.norm(t1) + eps)
        t2 = np.cross(n, t1)
        t2 = t2 / (np.linalg.norm(t2) + eps)
        uv = np.column_stack([centered @ t1, centered @ t2])
        uv_var = np.var(uv, axis=0)
        inplane_var = float(uv_var[0] + uv_var[1])
        gross_area, gross_perimeter = _convex_hull_metrics_2d(uv)
        # Área semántica formal: superficie "completa" del parche en su plano,
        # minimizando el efecto de huecos/voids internos en la lectura canónica.
        semantic_area = float(gross_area if gross_area > 0.0 else patch_area)

        # Score grande => superficie extensa, casi coplanar y con normales coherentes.
        base_h = inplane_var / (normal_std * normal_std + eps)
        horizontality_score = float(base_h * (normal_alignment ** 3))

        patches.append({
            "id": len(patches),
            "vertices": patch_verts.tolist(),
            "area": float(patch_area),
            "area_net": float(patch_area),
            "area_gross": float(gross_area),
            "perimeter_gross": float(gross_perimeter),
            "area_dominant": float(semantic_area),
            "normal": patch_normal.tolist(),
            "curvature_mean": patch_curvature,
            "bbox_min": patch_bbox_min.tolist(),
            "bbox_max": patch_bbox_max.tolist(),
            "centroid": patch_centroid.tolist(),
            "point_count": len(patch_verts),
            "normal_std": normal_std,
            "normal_alignment": normal_alignment,
            "inplane_var": inplane_var,
            "horizontality_score": horizontality_score,
        })

    return patches


def _detect_face_pairs(
    patches: list[dict[str, Any]],
    angle_threshold: float = 170.0,
    area_ratio_threshold: float = 0.7,
) -> list[tuple[int, int]]:
    """
    Detecta pares de parches que podrían ser caras opuestas.
    
    Criterios:
      - Normales casi-opuestas (ángulo ≈ 180°)
      - Áreas comparables
    
    Retorna lista de pares (idx_patch_a, idx_patch_b), ordenada por mejor score.
    """
    pairs_scored: list[tuple[float, int, int]] = []
    angle_thresh_rad = math.radians(angle_threshold)
    total_area = float(sum(float(p.get("area_dominant", p.get("area", 0.0))) for p in patches)) + 1e-9

    # Centro de masa superficial aproximado usando centroides de parches
    # ponderados por área dominante (superficie coherente/formal).
    patch_centroids = np.asarray(
        [np.asarray(p.get("centroid", [0.0, 0.0, 0.0]), dtype=np.float64) for p in patches],
        dtype=np.float64,
    )
    patch_weights = np.asarray(
        [float(p.get("area_dominant", p.get("area", 0.0))) for p in patches],
        dtype=np.float64,
    )
    wsum = float(np.sum(patch_weights)) + 1e-9
    com_surface = np.sum(patch_centroids * patch_weights[:, np.newaxis], axis=0) / wsum

    # Umbral dinámico para privilegiar superficies más "horizontales/canónicas"
    horiz_vals = [float(p.get("horizontality_score", 0.0)) for p in patches]
    h_ref = float(np.median(horiz_vals)) if len(horiz_vals) else 0.0

    for i, patch_a in enumerate(patches):
        for j, patch_b in enumerate(patches[i+1:], start=i+1):
            n_a = np.array(patch_a["normal"])
            n_b = np.array(patch_b["normal"])

            # Ángulo entre normales
            dot = float(np.dot(n_a, n_b))
            angle = math.acos(np.clip(dot, -1.0, 1.0))

            # Verificar casi-opuesto
            if abs(angle - math.pi) > angle_thresh_rad:
                continue

            # Verificar áreas comparables
            area_a = float(patch_a.get("area_dominant", patch_a.get("area", 0.0)))
            area_b = float(patch_b.get("area_dominant", patch_b.get("area", 0.0)))
            area_ratio = area_a / max(area_b, 1e-9)
            if area_ratio < area_ratio_threshold or area_ratio > (1.0 / area_ratio_threshold):
                continue

            # Filtrar pares con muy baja horizontalidad conjunta
            h_a = float(patch_a.get("horizontality_score", 0.0))
            h_b = float(patch_b.get("horizontality_score", 0.0))
            h_min = min(h_a, h_b)
            if h_ref > 0 and h_min < 0.65 * h_ref:
                continue

            # Priorización semántica:
            #   - oposición geométrica
            #   - balance entre caras
            #   - planitud
            #   - dominancia superficial (caras principales de la malla)
            #   - horizontalidad (aproximación a plano de reposo)
            #   - frontalidad óptica (máxima área formal con mínima profundidad)
            opposition_score = 1.0 - abs(math.pi - angle) / math.pi
            area_balance = min(area_ratio, 1.0 / max(area_ratio, 1e-9))
            curv_a = float(patch_a.get("curvature_mean", 1.0))
            curv_b = float(patch_b.get("curvature_mean", 1.0))
            flatness = 1.0 / (1.0 + 0.5 * (curv_a + curv_b))
            dominance = float((area_a + area_b) / total_area)
            # compresión robusta a [0,1)
            h_pair = h_min / (1.0 + h_min)

            # Coherencia planar de normales en el par
            a_align = float(patch_a.get("normal_alignment", 0.0))
            b_align = float(patch_b.get("normal_alignment", 0.0))
            planar_pair = max(0.0, min(1.0, 0.5 * (a_align + b_align)))

            # Frontalidad óptica:
            # pares con gran superficie formal y bajo espesor entre caras
            # tienden a proyectar "sombra mínima" y contorno más estable.
            c_a = np.asarray(patch_a.get("centroid", [0.0, 0.0, 0.0]), dtype=np.float64)
            c_b = np.asarray(patch_b.get("centroid", [0.0, 0.0, 0.0]), dtype=np.float64)
            n_pair = n_a - n_b
            n_pair = n_pair / (np.linalg.norm(n_pair) + 1e-9)
            sep = float(abs(np.dot(c_b - c_a, n_pair)))
            optical_raw = float((area_a + area_b) / (sep * sep + 1e-12))
            optical_frontality = float(optical_raw / (1.0 + optical_raw))

            # Criterio COM-horizontal-plane:
            # plano idealizado que pasa por COM y se despliega horizontalmente
            # hacia los límites del objeto (en el plano perpendicular a n_pair).
            rel = patch_centroids - com_surface
            proj_all = rel @ n_pair

            t1 = np.array([1.0, 0.0, 0.0], dtype=np.float64)
            if abs(float(np.dot(t1, n_pair))) > 0.9:
                t1 = np.array([0.0, 1.0, 0.0], dtype=np.float64)
            t1 = t1 - np.dot(t1, n_pair) * n_pair
            t1 = t1 / (np.linalg.norm(t1) + 1e-9)
            t2 = np.cross(n_pair, t1)
            t2 = t2 / (np.linalg.norm(t2) + 1e-9)

            u = rel @ t1
            v = rel @ t2
            radial = np.sqrt(u * u + v * v)
            horizontal_limit = float(np.quantile(radial, 0.90)) if radial.size else 0.0

            var = float(np.sum((proj_all ** 2) * patch_weights) / wsum)
            depth_com = math.sqrt(max(var, 0.0))
            slice_half = max(0.35 * depth_com, 1e-9)
            slice_mask = np.abs(proj_all) <= slice_half
            slice_coherence = float(np.sum(patch_weights[slice_mask]) / wsum) if np.any(slice_mask) else 0.0

            plane_raw = float((horizontal_limit * horizontal_limit) / (depth_com * depth_com + 1e-12))
            plane_score = float(plane_raw / (1.0 + plane_raw))
            com_shadow_score = float(0.7 * plane_score + 0.3 * slice_coherence)

            score = (
                0.20 * opposition_score +
                0.10 * area_balance +
                0.07 * flatness +
                0.12 * dominance +
                0.14 * h_pair +
                0.07 * planar_pair +
                0.15 * optical_frontality +
                0.15 * com_shadow_score
            )
            pairs_scored.append((float(score), i, j))

    pairs_scored.sort(key=lambda t: t[0], reverse=True)
    return [(i, j) for _, i, j in pairs_scored]


def _pick_front_reverse_by_patch_quality(
    patch_a: dict[str, Any],
    patch_b: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """
    Decide qué cara es "frente" y cuál "reverso" usando cualidades intrínsecas.

    Regla determinista (semántica de caras dominantes):
      1) mayor área = frente
      2) si empate, mayor horizontalidad = frente
      3) si empate, menor curvatura media (más plana) = frente
      4) si empate, menor id = frente (desempate estable)
    """
    curv_a = float(patch_a.get("curvature_mean", 1.0))
    curv_b = float(patch_b.get("curvature_mean", 1.0))
    area_a = float(patch_a.get("area_dominant", patch_a.get("area", 0.0)))
    area_b = float(patch_b.get("area_dominant", patch_b.get("area", 0.0)))
    horiz_a = float(patch_a.get("horizontality_score", 0.0))
    horiz_b = float(patch_b.get("horizontality_score", 0.0))
    id_a = int(patch_a.get("id", 0))
    id_b = int(patch_b.get("id", 0))

    align_a = float(patch_a.get("normal_alignment", 0.0))
    align_b = float(patch_b.get("normal_alignment", 0.0))

    if area_a > area_b + 1e-12:
        return patch_a, patch_b
    if area_b > area_a + 1e-12:
        return patch_b, patch_a

    if horiz_a > horiz_b + 1e-12:
        return patch_a, patch_b
    if horiz_b > horiz_a + 1e-12:
        return patch_b, patch_a

    if align_a > align_b + 1e-12:
        return patch_a, patch_b
    if align_b > align_a + 1e-12:
        return patch_b, patch_a

    if curv_a < curv_b - 1e-12:
        return patch_a, patch_b
    if curv_b < curv_a - 1e-12:
        return patch_b, patch_a

    return (patch_a, patch_b) if id_a <= id_b else (patch_b, patch_a)


def _normalize_by_faces(
    mesh: Any,
    face_pairs: list[tuple[int, int]],
    patches: list[dict[str, Any]],
) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    """
    Normaliza orientación según las caras detectadas.
    
        Si hay pares de caras, orienta eje canónico usando SOLO información de caras:
            - Z: normal principal frente→reverso (diferencia de normales opuestas)
            - X: componente principal en el plano de la cara frente
            - Y: completa base derecha

        Con esto, la orientación queda anclada a cualidades geométricas intrínsecas,
        no al encuadre espacial ni a signos arbitrarios del PCA.
    Si no, usa PCA global.
    
    Retorna (puntos_normalizados, matriz_rotación, metadatos).
    """
    eps = 1e-9
    mesh_verts = np.asarray(mesh.vertices, dtype=np.float64)
    # Origen geométrico: centro de masa físico cuando esté disponible,
    # fallback estable al centroide de vértices.
    center_mass = getattr(mesh, "center_mass", None)
    center = np.asarray(center_mass, dtype=np.float64) if center_mass is not None else mesh_verts.mean(axis=0)
    if center.shape != (3,) or not np.all(np.isfinite(center)):
        center = mesh_verts.mean(axis=0)
    X = mesh_verts - center

    if face_pairs:
        # Usar mejor par de caras (ya viene ordenado por score)
        i_a, i_b = face_pairs[0]
        patch_a = patches[i_a]
        patch_b = patches[i_b]
        front_patch, reverse_patch = _pick_front_reverse_by_patch_quality(patch_a, patch_b)

        n_front = np.asarray(front_patch["normal"], dtype=np.float64)
        n_reverse = np.asarray(reverse_patch["normal"], dtype=np.float64)

        # Eje Z: diferencia de normales opuestas (robusto ante cancelación n_a + n_b ≈ 0)
        z_vec = n_front - n_reverse
        if float(np.linalg.norm(z_vec)) <= eps:
            z_vec = n_front
        e3 = z_vec / (np.linalg.norm(z_vec) + eps)

        # Eje X: dirección principal dentro del plano de la cara frontal
        front_vidx = np.asarray(front_patch.get("vertices", []), dtype=np.int64)
        front_pts = mesh_verts[front_vidx] if front_vidx.size > 2 else mesh_verts
        front_ctr = front_pts.mean(axis=0)
        front_centered = front_pts - front_ctr
        cov_front = np.cov(front_centered.T)
        evf, evecf = np.linalg.eigh(cov_front)
        idx_main = int(np.argsort(evf)[::-1][0])
        x_raw = np.asarray(evecf[:, idx_main], dtype=np.float64)

        # Proyectar X al plano ortogonal a Z
        x_proj = x_raw - np.dot(x_raw, e3) * e3
        if float(np.linalg.norm(x_proj)) <= eps:
            # Fallback estable: usar eje global que menos se alinee con Z
            basis = np.eye(3)
            dots = [abs(float(np.dot(basis[k], e3))) for k in range(3)]
            b = basis[int(np.argmin(dots))]
            x_proj = b - np.dot(b, e3) * e3
        e1 = x_proj / (np.linalg.norm(x_proj) + eps)

        # Eje Y: completar base derecha
        e2 = np.cross(e3, e1)
        e2 = e2 / (np.linalg.norm(e2) + eps)

        # Re-ortogonalizar X para robustez numérica
        e1 = np.cross(e2, e3)
        e1 = e1 / (np.linalg.norm(e1) + eps)

        R = np.column_stack([e1, e2, e3])
        method = "by_intrinsic_faces"
        front_reverse_meta = {
            "front_patch_id": int(front_patch.get("id", i_a)),
            "reverse_patch_id": int(reverse_patch.get("id", i_b)),
            "front_curvature": float(front_patch.get("curvature_mean", 0.0)),
            "reverse_curvature": float(reverse_patch.get("curvature_mean", 0.0)),
            "front_area": float(front_patch.get("area", 0.0)),
            "reverse_area": float(reverse_patch.get("area", 0.0)),
            "front_area_net": float(front_patch.get("area_net", front_patch.get("area", 0.0))),
            "reverse_area_net": float(reverse_patch.get("area_net", reverse_patch.get("area", 0.0))),
            "front_area_gross": float(front_patch.get("area_gross", front_patch.get("area", 0.0))),
            "reverse_area_gross": float(reverse_patch.get("area_gross", reverse_patch.get("area", 0.0))),
            "front_perimeter_gross": float(front_patch.get("perimeter_gross", 0.0)),
            "reverse_perimeter_gross": float(reverse_patch.get("perimeter_gross", 0.0)),
            "front_area_dominant": float(front_patch.get("area_dominant", front_patch.get("area", 0.0))),
            "reverse_area_dominant": float(reverse_patch.get("area_dominant", reverse_patch.get("area", 0.0))),
            "front_horizontality": float(front_patch.get("horizontality_score", 0.0)),
            "reverse_horizontality": float(reverse_patch.get("horizontality_score", 0.0)),
        }

        # Diagnóstico óptico del par elegido (frontalidad/lateralidad)
        c_f = np.asarray(front_patch.get("centroid", [0.0, 0.0, 0.0]), dtype=np.float64)
        c_r = np.asarray(reverse_patch.get("centroid", [0.0, 0.0, 0.0]), dtype=np.float64)
        n_pair = n_front - n_reverse
        n_pair = n_pair / (np.linalg.norm(n_pair) + eps)
        pair_depth = float(abs(np.dot(c_r - c_f, n_pair)))
        pair_area_dom = float(
            front_patch.get("area_dominant", front_patch.get("area", 0.0)) +
            reverse_patch.get("area_dominant", reverse_patch.get("area", 0.0))
        )
        optical_raw = float(pair_area_dom / (pair_depth * pair_depth + eps))
        front_reverse_meta["optical_pair_depth"] = pair_depth
        front_reverse_meta["optical_pair_area_dominant"] = pair_area_dom
        front_reverse_meta["optical_frontality_score"] = float(optical_raw / (1.0 + optical_raw))

        # Diagnóstico COM-horizontal-plane con geometría completa del objeto:
        # corte en plano por COM y despliegue horizontal hacia límites.
        Xc = mesh_verts - center
        proj_n = Xc @ n_pair
        depth_rms = float(math.sqrt(max(float(np.mean(proj_n * proj_n)), 0.0)))

        # Base ortonormal del plano frontal
        t1 = np.array([1.0, 0.0, 0.0], dtype=np.float64)
        if abs(float(np.dot(t1, n_pair))) > 0.9:
            t1 = np.array([0.0, 1.0, 0.0], dtype=np.float64)
        t1 = t1 - np.dot(t1, n_pair) * n_pair
        t1 = t1 / (np.linalg.norm(t1) + eps)
        t2 = np.cross(n_pair, t1)
        t2 = t2 / (np.linalg.norm(t2) + eps)

        uv_all = np.column_stack([Xc @ t1, Xc @ t2])
        radial_all = np.sqrt(uv_all[:, 0] * uv_all[:, 0] + uv_all[:, 1] * uv_all[:, 1]) if uv_all.size else np.array([], dtype=np.float64)
        horizontal_radius_p95 = float(np.quantile(radial_all, 0.95)) if radial_all.size else 0.0
        u_span = float(np.quantile(uv_all[:, 0], 0.99) - np.quantile(uv_all[:, 0], 0.01)) if uv_all.shape[0] > 2 else 0.0
        v_span = float(np.quantile(uv_all[:, 1], 0.99) - np.quantile(uv_all[:, 1], 0.01)) if uv_all.shape[0] > 2 else 0.0

        slice_half = max(0.35 * depth_rms, eps)
        slice_mask = np.abs(proj_n) <= slice_half
        uv_slice = uv_all[slice_mask] if np.any(slice_mask) else np.empty((0, 2), dtype=np.float64)

        def _hull_area_2d(pts: np.ndarray) -> float:
            if pts.shape[0] < 3:
                return 0.0
            try:
                from scipy.spatial import ConvexHull  # type: ignore
                h = ConvexHull(pts)
                return float(h.volume)
            except Exception:
                rng = pts.max(axis=0) - pts.min(axis=0)
                return float(rng[0] * rng[1])

        shadow_area_full = _hull_area_2d(uv_all)
        shadow_area_slice = _hull_area_2d(uv_slice)
        shadow_slice_ratio = float(shadow_area_slice / (shadow_area_full + eps)) if shadow_area_full > 0 else 0.0
        plane_raw = float((horizontal_radius_p95 * horizontal_radius_p95) / (depth_rms * depth_rms + eps))
        plane_score = float(plane_raw / (1.0 + plane_raw))
        shadow_optimal_raw = float((0.7 * plane_score) + (0.3 * shadow_slice_ratio))
        shadow_optimal_score = float(shadow_optimal_raw / (1.0 + shadow_optimal_raw))

        front_reverse_meta["com_shadow_depth_rms"] = float(depth_rms)
        front_reverse_meta["com_horizontal_radius_p95"] = float(horizontal_radius_p95)
        front_reverse_meta["com_horizontal_span_u"] = float(u_span)
        front_reverse_meta["com_horizontal_span_v"] = float(v_span)
        front_reverse_meta["com_shadow_area_full"] = float(shadow_area_full)
        front_reverse_meta["com_shadow_area_slice"] = float(shadow_area_slice)
        front_reverse_meta["com_shadow_slice_ratio"] = float(shadow_slice_ratio)
        front_reverse_meta["com_horizontal_plane_score"] = float(plane_score)
        front_reverse_meta["com_shadow_optimal_score"] = float(shadow_optimal_score)
        front_reverse_meta["com_origin"] = [float(v) for v in center.tolist()]
        front_reverse_meta["com_origin_type"] = "center_mass_or_centroid_fallback"
        front_reverse_meta["optical_horizontal_plane"] = {
            "equation": "n·(x-COM)=0",
            "normal_world": [float(v) for v in n_pair.tolist()],
            "passes_through_com": True,
            "horizontal_limits": {
                "radius_p95": float(horizontal_radius_p95),
                "span_u": float(u_span),
                "span_v": float(v_span),
            },
        }
    else:
        # Fallback: PCA global
        cov = np.cov(X.T)
        eigvals, eigvecs = np.linalg.eigh(cov)
        order = np.argsort(eigvals)[::-1]
        eigvecs = eigvecs[:, order]
        R = eigvecs
        method = "pca_global"
        front_reverse_meta = {
            "front_patch_id": None,
            "reverse_patch_id": None,
        }

    X_norm = X @ R
    confidence = 0.97 if method == "by_intrinsic_faces" else 0.5

    return X_norm, R, {
        "method": method,
        "center": center.tolist(),
        "rotation_matrix": [[float(v) for v in row] for row in R.tolist()],
        "confidence": confidence,
        "face_pair_count": len(face_pairs),
        "front_reverse": front_reverse_meta,
        "front_is_positive_z": True,
    }


def _pca_contextual(
    canonical_points: np.ndarray,
    face_assignment: str = "primary",
) -> dict[str, Any]:
    """
    PCA contextualizado: se calcula sobre la forma ya normalizada.
    
    Si face_assignment=='A' o 'B', podría calcularse solo sobre esa cara.
    Por ahora, lo hacemos sobre toda la nube normalizada.
    """
    if canonical_points.shape[0] < 10:
        raise HTTPException(status_code=422, detail="Puntos insuficientes para PCA.")

    X = canonical_points - canonical_points.mean(axis=0, keepdims=True)
    cov = np.cov(X.T)
    eigvals, eigvecs = np.linalg.eigh(cov)
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
        "principal_axes": eigvecs.tolist(),
        "pca_extents": [float(ext[0]), float(ext[1]), float(ext[2])],
    }


def _make_morphometric_metrics(
    pca: dict[str, Any],
    shape: dict[str, Any],
    face_mode: str,
) -> dict[str, Any]:
    """
    Genera métricas morfométricas compatibles con MAO 2D.
    
    Estas métricas pueden ser usadas directamente en análisis bifacial y comparación.
    """
    ext_x, ext_y, ext_z = [float(v) for v in pca["pca_extents"]]
    l1, l2, l3 = [float(v) for v in pca["eigenvalues"]]

    max_xy = max(ext_x, ext_y, 1e-12)
    thickness_ratio = ext_z / max_xy
    anisotropy = pca["linearity"] + pca["planarity"]

    # Proxies de morfometría MAO (circularidad, solidez, etc. en 3D)
    circularity_proxy = pca["sphericity"]  # qué tan "redondo" en términos de eigenvalores
    elongation = pca["elongation"]
    convexity_proxy = max(0.0, 1.0 - pca["planarity"])  # si es plano, menos convexo

    return {
        "forma_detectada": "obj3d_v2_morphological",
        "thickness_ratio": float(thickness_ratio),
        "anisotropy": float(anisotropy),
        "circularity_proxy": float(circularity_proxy),
        "elongation": float(elongation),
        "convexity_proxy": float(convexity_proxy),
        "linearity": float(pca["linearity"]),
        "planarity": float(pca["planarity"]),
        "sphericity": float(pca["sphericity"]),
        "extents_canonical": {"x": ext_x, "y": ext_y, "z": ext_z},
        "face_mode": face_mode,
    }


def _projected_hull_metrics_2d(points2d: np.ndarray) -> dict[str, float | None]:
    """
    Métricas morfológicas 2D de una proyección canónica (envolvente convexa).

    Retorna área, perímetro, circularidad, aspect_ratio y rectangularidad
    en el sistema del plano proyectado.
    """
    eps = 1e-12
    uv = np.asarray(points2d, dtype=np.float64)
    if uv.shape[0] < 3:
        return {
            "area": 0.0,
            "perimeter": 0.0,
            "circularity": None,
            "aspect_ratio": None,
            "rectangularity": None,
        }

    # Área/perímetro por envolvente convexa
    try:
        from scipy.spatial import ConvexHull  # type: ignore

        hull = ConvexHull(uv)
        area = float(hull.volume)     # En 2D: volume = área
        perimeter = float(hull.area)  # En 2D: area = perímetro
    except Exception:
        # Fallback robusto si SciPy no está disponible
        rng = uv.max(axis=0) - uv.min(axis=0)
        area = float(rng[0] * rng[1])
        perimeter = float(2.0 * (abs(rng[0]) + abs(rng[1])))

    # Ejes principales del plano para aspect ratio
    uv_c = uv - uv.mean(axis=0, keepdims=True)
    cov2 = np.cov(uv_c.T)
    eigvals2, _ = np.linalg.eigh(cov2)
    eigvals2 = np.sort(np.maximum(eigvals2, 0.0))[::-1]
    major = math.sqrt(float(eigvals2[0]) + eps)
    minor = math.sqrt(float(eigvals2[1]) + eps)
    aspect_ratio = float(major / (minor + eps)) if major > 0 else None

    bbox_rng = uv.max(axis=0) - uv.min(axis=0)
    bbox_area = float((bbox_rng[0] * bbox_rng[1]) + eps)

    circularity = float((4.0 * math.pi * area) / (perimeter * perimeter + eps)) if area > 0.0 and perimeter > 0.0 else None
    rectangularity = float(area / bbox_area) if area > 0.0 else None

    return {
        "area": float(area),
        "perimeter": float(perimeter),
        "circularity": circularity,
        "aspect_ratio": aspect_ratio,
        "rectangularity": rectangularity,
    }


def _compute_oriented_mao2d_homologation(
    canonical_points: np.ndarray,
    semantic_orientation: dict[str, Any],
) -> dict[str, Any]:
    """
    Homologación 2D orientada por pose canónica.

    Proyecta la nube canónica sobre planos morfológicos estables:
      - frontal_xy: lectura FRONT/BACK (caras formales)
      - lateral_xz: lectura de espesor
      - transversal_yz: sección transversal
    """
    X = np.asarray(canonical_points, dtype=np.float64)
    if X.ndim != 2 or X.shape[1] != 3 or X.shape[0] < 3:
        return {
            "version": "mao2d_bridge_v3_oriented",
            "source": "canonical_pose_oriented_projections",
            "planes": {},
            "reference_plane": "frontal_xy",
        }

    frontal_xy = _projected_hull_metrics_2d(X[:, [0, 1]])
    lateral_xz = _projected_hull_metrics_2d(X[:, [0, 2]])
    transversal_yz = _projected_hull_metrics_2d(X[:, [1, 2]])

    dims = semantic_orientation.get("dimensions", {}) if isinstance(semantic_orientation, dict) else {}
    ancho = float(dims.get("ancho", 0.0) or 0.0)
    alto = float(dims.get("alto", 0.0) or 0.0)
    espesor = float(dims.get("espesor", 0.0) or 0.0)

    return {
        "version": "mao2d_bridge_v3_oriented",
        "source": "canonical_pose_oriented_projections",
        "reference_plane": "frontal_xy",
        "planes": {
            "frontal_xy": {
                "view_pair": "front_back",
                **frontal_xy,
            },
            "lateral_xz": {
                "view_pair": "left_right",
                **lateral_xz,
            },
            "transversal_yz": {
                "view_pair": "top_bottom",
                **transversal_yz,
            },
        },
        "dimensions_resting": {
            "ancho": ancho,
            "alto": alto,
            "espesor": espesor,
        },
    }


def _contour_points_from_projection(points2d: np.ndarray, max_points: int = 120) -> list[list[float]]:
    """
    Extrae un contorno 2D estable (envolvente convexa) para serialización.
    """
    uv = np.asarray(points2d, dtype=np.float64)
    if uv.shape[0] < 3:
        return []

    contour = None
    try:
        from scipy.spatial import ConvexHull  # type: ignore

        hull = ConvexHull(uv)
        contour = uv[hull.vertices]
    except Exception:
        # Fallback: rectángulo envolvente
        mn = uv.min(axis=0)
        mx = uv.max(axis=0)
        contour = np.array([
            [mn[0], mn[1]],
            [mx[0], mn[1]],
            [mx[0], mx[1]],
            [mn[0], mx[1]],
        ], dtype=np.float64)

    if contour.shape[0] > max_points:
        idx = np.linspace(0, contour.shape[0] - 1, max_points).astype(int)
        contour = contour[idx]

    return [[float(p[0]), float(p[1])] for p in contour]


def _compute_canonical_morphological_analysis(
    canonical_points: np.ndarray,
    semantic_orientation: dict[str, Any],
    n_sections: int = 9,
) -> dict[str, Any]:
    """
    Análisis morfométrico MAO_PLUS sobre objeto 3D ya orientado canónicamente.

    Premisa:
      - FRONT/BACK son homólogos a Cara A/B de lectura bifacial.
      - Se generan contornos 2D (proyección XY) para FRONT/BACK.
      - Se generan cortes transversales en eje longitudinal X y contornos YZ.
    """
    eps = 1e-12
    X = np.asarray(canonical_points, dtype=np.float64)
    if X.ndim != 2 or X.shape[1] != 3 or X.shape[0] < 10:
        return {
            "status": "insufficient_points",
            "reference": {"primary_views": ["front", "back"]},
            "front_back": {},
            "transverse_sections": [],
        }

    x = X[:, 0]
    y = X[:, 1]
    z = X[:, 2]

    # FRONT/BACK homólogos a Cara A/B (según convención canónica por Z)
    front_mask = z >= 0.0
    back_mask = ~front_mask

    front_xy = X[front_mask][:, [0, 1]] if np.any(front_mask) else np.empty((0, 2), dtype=np.float64)
    back_xy = X[back_mask][:, [0, 1]] if np.any(back_mask) else np.empty((0, 2), dtype=np.float64)

    front_metrics = _projected_hull_metrics_2d(front_xy) if front_xy.shape[0] >= 3 else _projected_hull_metrics_2d(np.empty((0, 2)))
    back_metrics = _projected_hull_metrics_2d(back_xy) if back_xy.shape[0] >= 3 else _projected_hull_metrics_2d(np.empty((0, 2)))

    front_contour = _contour_points_from_projection(front_xy)
    back_contour = _contour_points_from_projection(back_xy)

    area_front = float(front_metrics.get("area") or 0.0)
    area_back = float(back_metrics.get("area") or 0.0)
    per_front = float(front_metrics.get("perimeter") or 0.0)
    per_back = float(back_metrics.get("perimeter") or 0.0)

    front_back_balance = float(min(area_front, area_back) / (max(area_front, area_back) + eps)) if (area_front > 0 and area_back > 0) else 0.0
    front_back_perimeter_balance = float(min(per_front, per_back) / (max(per_front, per_back) + eps)) if (per_front > 0 and per_back > 0) else 0.0

    # Cortes transversales sobre eje longitudinal X
    x_min = float(np.min(x))
    x_max = float(np.max(x))
    x_extent = x_max - x_min
    section_half = max(0.03 * x_extent, eps)

    section_centers = np.linspace(x_min + 0.10 * x_extent, x_max - 0.10 * x_extent, max(3, int(n_sections)))
    sections: list[dict[str, Any]] = []

    for i, xc in enumerate(section_centers.tolist(), start=1):
        mask = np.abs(x - xc) <= section_half
        if int(np.sum(mask)) < 25:
            continue

        yz = X[mask][:, [1, 2]]
        sec_metrics = _projected_hull_metrics_2d(yz)
        sec_contour = _contour_points_from_projection(yz, max_points=80)

        y_span = float(np.max(yz[:, 0]) - np.min(yz[:, 0])) if yz.shape[0] else 0.0
        z_span = float(np.max(yz[:, 1]) - np.min(yz[:, 1])) if yz.shape[0] else 0.0

        sections.append({
            "index": i,
            "x_center": float(xc),
            "x_relative": float((xc - x_min) / (x_extent + eps)),
            "slice_half_width": float(section_half),
            "point_count": int(np.sum(mask)),
            "metrics": sec_metrics,
            "section_dims": {
                "width_y": y_span,
                "thickness_z": z_span,
            },
            "contour_yz": sec_contour,
        })

    section_areas = [float(s.get("metrics", {}).get("area") or 0.0) for s in sections]
    section_thickness = [float(s.get("section_dims", {}).get("thickness_z") or 0.0) for s in sections]
    section_x_rel = [float(s.get("x_relative") or 0.0) for s in sections]

    mean_section_area = float(np.mean(section_areas)) if sections else 0.0
    mean_section_thickness = float(np.mean(section_thickness)) if sections else 0.0
    mean_points_per_section = float(np.mean([float(s.get("point_count") or 0.0) for s in sections])) if sections else 0.0

    area_std = float(np.std(section_areas)) if section_areas else 0.0
    thick_std = float(np.std(section_thickness)) if section_thickness else 0.0
    area_cv = float(area_std / (mean_section_area + eps)) if mean_section_area > 0.0 else 0.0
    thickness_cv = float(thick_std / (mean_section_thickness + eps)) if mean_section_thickness > 0.0 else 0.0

    # Índice MAO_PLUS de homología bifacial: media armónica de balances
    # (penaliza fuertemente el peor balance entre área y perímetro).
    mao_plus_homology_index = 0.0
    if front_back_balance > 0.0 and front_back_perimeter_balance > 0.0:
        mao_plus_homology_index = float(
            2.0 * front_back_balance * front_back_perimeter_balance
            / (front_back_balance + front_back_perimeter_balance + eps)
        )

    requested_sections = max(3, int(n_sections))
    valid_sections = len(sections)
    valid_ratio = float(valid_sections / max(requested_sections, 1))

    area_max = float(np.max(section_areas)) if section_areas else 0.0
    thick_max = float(np.max(section_thickness)) if section_thickness else 0.0
    area_profile = [float(a / (area_max + eps)) for a in section_areas] if section_areas else []
    thickness_profile = [float(t / (thick_max + eps)) for t in section_thickness] if section_thickness else []

    long_rule = semantic_orientation.get("axis_definition", {}).get("longitudinal", {}).get("rule") if isinstance(semantic_orientation, dict) else None

    return {
        "status": "ok",
        "reference": {
            "primary_views": ["front", "back"],
            "equivalence": {
                "front": "cara_A_homologa",
                "back": "cara_B_homologa",
            },
            "longitudinal_rule": long_rule,
        },
        "front_back": {
            "front": {
                "point_count": int(np.sum(front_mask)),
                "metrics_xy": front_metrics,
                "contour_xy": front_contour,
            },
            "back": {
                "point_count": int(np.sum(back_mask)),
                "metrics_xy": back_metrics,
                "contour_xy": back_contour,
            },
            "bifacial_balance": {
                "area_balance": front_back_balance,
                "perimeter_balance": front_back_perimeter_balance,
            },
        },
        "transverse_sections": sections,
        "transverse_summary": {
            "count": len(sections),
            "mean_area": mean_section_area,
            "mean_thickness_z": mean_section_thickness,
        },
        "section_profiles": {
            "x_relative": section_x_rel,
            "area": section_areas,
            "thickness_z": section_thickness,
            "area_normalized": area_profile,
            "thickness_normalized": thickness_profile,
        },
        "mao_plus_indices": {
            "bifacial_homology_index": mao_plus_homology_index,
            "area_balance": front_back_balance,
            "perimeter_balance": front_back_perimeter_balance,
            "transverse_area_cv": area_cv,
            "transverse_thickness_cv": thickness_cv,
        },
        "quality": {
            "requested_sections": requested_sections,
            "valid_sections": valid_sections,
            "valid_ratio": valid_ratio,
            "mean_points_per_section": mean_points_per_section,
        },
    }


def _compute_crossdimensional_mao_coherence(
    mao2d_adapted: dict[str, Any],
    canonical_morphology: dict[str, Any],
    morphometry: dict[str, Any],
    semantic_orientation: dict[str, Any],
) -> dict[str, Any]:
    """
    Estima coherencia entre lectura MAO 2D (mono/bifacial) y morfometría 3D canónica.

    Devuelve un score global [0,1] y componentes interpretables.
    """
    eps = 1e-12

    def _to_f(v: Any, default: float = 0.0) -> float:
        try:
            n = float(v)
            return n if math.isfinite(n) else default
        except Exception:
            return default

    def _clip01(v: float) -> float:
        return float(max(0.0, min(1.0, v)))

    def _exp_similarity(a: float, b: float, scale: float) -> float:
        return _clip01(math.exp(-abs(a - b) / max(scale, eps)))

    frontal_ref = mao2d_adapted.get("front_back_reference", {}) if isinstance(mao2d_adapted, dict) else {}
    idx = canonical_morphology.get("mao_plus_indices", {}) if isinstance(canonical_morphology, dict) else {}
    t_summary = canonical_morphology.get("transverse_summary", {}) if isinstance(canonical_morphology, dict) else {}

    # 1) Coherencia bifacial (característica principal MAO-plus)
    h_bif = _to_f(idx.get("bifacial_homology_index"), 0.0)

    # 2) Estabilidad longitudinal de cortes (penaliza variación excesiva)
    cv_area = _to_f(idx.get("transverse_area_cv"), 0.0)
    cv_thk = _to_f(idx.get("transverse_thickness_cv"), 0.0)
    long_stability = _clip01(1.0 - min(1.0, 0.5 * (cv_area + cv_thk)))

    # 3) Consistencia de forma en plano frontal: circularidad 2D vs proxy 3D
    circ_2d = _to_f(frontal_ref.get("circularity_2d"), 0.0)
    circ_3d = _to_f(morphometry.get("circularity_proxy"), 0.0)
    shape_consistency = _exp_similarity(circ_2d, circ_3d, scale=0.15)

    # 4) Consistencia de espesor: ratio de espesor PCA vs secciones transversales
    dims = semantic_orientation.get("dimensions", {}) if isinstance(semantic_orientation, dict) else {}
    ancho = _to_f(dims.get("ancho"), 0.0)
    alto = _to_f(dims.get("alto"), 0.0)
    mean_thk = _to_f(t_summary.get("mean_thickness_z"), 0.0)
    thk_ratio_sections = mean_thk / max(max(ancho, alto), eps)
    thk_ratio_pca = _to_f(morphometry.get("thickness_ratio"), 0.0)
    thickness_consistency = _exp_similarity(thk_ratio_sections, thk_ratio_pca, scale=0.10)

    # 5) Consistencia de proporción frontal: AR frontal vs AR de reposo
    ar_2d = _to_f(frontal_ref.get("aspect_ratio_2d"), 0.0)
    major = max(ancho, alto)
    minor = max(min(ancho, alto), eps)
    ar_rest = major / minor if major > 0 else 0.0
    aspect_consistency = _exp_similarity(ar_2d, ar_rest, scale=0.35) if ar_2d > 0 and ar_rest > 0 else 0.0

    # Agregación ponderada
    weights = {
        "bifacial_homology": 0.30,
        "longitudinal_stability": 0.20,
        "shape_consistency": 0.20,
        "thickness_consistency": 0.15,
        "aspect_consistency": 0.15,
    }
    score = (
        weights["bifacial_homology"] * h_bif
        + weights["longitudinal_stability"] * long_stability
        + weights["shape_consistency"] * shape_consistency
        + weights["thickness_consistency"] * thickness_consistency
        + weights["aspect_consistency"] * aspect_consistency
    )
    score = _clip01(score)

    if score >= 0.85:
        level = "muy_alta"
    elif score >= 0.70:
        level = "alta"
    elif score >= 0.55:
        level = "media"
    else:
        level = "baja"

    return {
        "status": "ok",
        "score": score,
        "level": level,
        "components": {
            "bifacial_homology": h_bif,
            "longitudinal_stability": long_stability,
            "shape_consistency": shape_consistency,
            "thickness_consistency": thickness_consistency,
            "aspect_consistency": aspect_consistency,
        },
        "inputs": {
            "circularity_2d": circ_2d,
            "circularity_3d_proxy": circ_3d,
            "thickness_ratio_sections": thk_ratio_sections,
            "thickness_ratio_pca": thk_ratio_pca,
            "aspect_ratio_2d": ar_2d,
            "aspect_ratio_resting": ar_rest,
            "transverse_area_cv": cv_area,
            "transverse_thickness_cv": cv_thk,
        },
    }


def _compute_3d_homologation_mao_plus(
    semantic_orientation: dict[str, Any],
    canonical_morphology: dict[str, Any],
    pca_ctx: dict[str, Any],
    morphometry: dict[str, Any],
    coherence_mao_plus: dict[str, Any],
    pca_sequential: dict[str, Any],
) -> dict[str, Any]:
    """
    Homologación 3D tipo MAO-plus para el objeto detectado.

    Objetivo:
      - Crear una representación canónica y comparable entre objetos 3D.
      - Mantener trazabilidad con FRONT/BACK (cara A/B), cortes y PCA.
      - Generar una "firma" numérica utilizable en comparación inter-objeto.
    """
    eps = 1e-12

    dims = semantic_orientation.get("dimensions", {}) if isinstance(semantic_orientation, dict) else {}
    ancho = float(dims.get("ancho", 0.0) or 0.0)
    alto = float(dims.get("alto", 0.0) or 0.0)
    espesor = float(dims.get("espesor", 0.0) or 0.0)

    major = max(ancho, alto)
    minor = max(min(ancho, alto), eps)
    aspect_resting = float(major / minor) if major > 0.0 else 0.0
    thickness_resting = float(espesor / max(major, eps)) if major > 0.0 else 0.0

    idx = canonical_morphology.get("mao_plus_indices", {}) if isinstance(canonical_morphology, dict) else {}
    quality = canonical_morphology.get("quality", {}) if isinstance(canonical_morphology, dict) else {}
    front_back = canonical_morphology.get("front_back", {}) if isinstance(canonical_morphology, dict) else {}
    front_metrics = (front_back.get("front") or {}).get("metrics_xy", {}) if isinstance(front_back, dict) else {}
    back_metrics = (front_back.get("back") or {}).get("metrics_xy", {}) if isinstance(front_back, dict) else {}

    pca_seq_overall = pca_sequential.get("overall", {}) if isinstance(pca_sequential, dict) else {}
    coh_score = float(coherence_mao_plus.get("score", 0.0) or 0.0)
    pca_seq_sim = float(pca_seq_overall.get("mean_procrustes_similarity", 0.0) or 0.0)

    # Firma canónica homologada (vector compacto y comparable)
    signature = {
        "bifacial_homology": float(idx.get("bifacial_homology_index", 0.0) or 0.0),
        "area_balance": float(idx.get("area_balance", 0.0) or 0.0),
        "perimeter_balance": float(idx.get("perimeter_balance", 0.0) or 0.0),
        "transverse_area_cv": float(idx.get("transverse_area_cv", 0.0) or 0.0),
        "transverse_thickness_cv": float(idx.get("transverse_thickness_cv", 0.0) or 0.0),
        "circularity_front": float(front_metrics.get("circularity") or 0.0),
        "circularity_back": float(back_metrics.get("circularity") or 0.0),
        "aspect_resting": aspect_resting,
        "thickness_resting": thickness_resting,
        "linearity": float(morphometry.get("linearity", 0.0) or 0.0),
        "planarity": float(morphometry.get("planarity", 0.0) or 0.0),
        "sphericity": float(morphometry.get("sphericity", 0.0) or 0.0),
        "coherence_2d_3d": coh_score,
        "procrustes_pca_seq": pca_seq_sim,
    }

    signature_vector = [
        float(signature["bifacial_homology"]),
        float(signature["area_balance"]),
        float(signature["perimeter_balance"]),
        float(signature["transverse_area_cv"]),
        float(signature["transverse_thickness_cv"]),
        float(signature["circularity_front"]),
        float(signature["circularity_back"]),
        float(signature["aspect_resting"]),
        float(signature["thickness_resting"]),
        float(signature["linearity"]),
        float(signature["planarity"]),
        float(signature["sphericity"]),
        float(signature["coherence_2d_3d"]),
        float(signature["procrustes_pca_seq"]),
    ]

    requested_sections = int(quality.get("requested_sections", 0) or 0)
    valid_sections = int(quality.get("valid_sections", 0) or 0)
    valid_ratio = float(quality.get("valid_ratio", 0.0) or 0.0)

    # Puntaje global de homologación 3D
    global_score = (
        0.35 * float(signature["bifacial_homology"])
        + 0.25 * coh_score
        + 0.20 * pca_seq_sim
        + 0.20 * max(0.0, min(1.0, 1.0 - 0.5 * (signature["transverse_area_cv"] + signature["transverse_thickness_cv"])))
    )
    global_score = float(max(0.0, min(1.0, global_score)))

    if global_score >= 0.85:
        homologation_level = "muy_alta"
    elif global_score >= 0.70:
        homologation_level = "alta"
    elif global_score >= 0.55:
        homologation_level = "media"
    else:
        homologation_level = "baja"

    comparable = bool(
        valid_ratio >= 0.60
        and requested_sections > 0
        and valid_sections >= max(3, requested_sections // 2)
        and coh_score >= 0.45
    )

    longitudinal_rule = semantic_orientation.get("axis_definition", {}).get("longitudinal", {}).get("rule") if isinstance(semantic_orientation, dict) else None

    return {
        "status": "ok",
        "model": "mao_plus_3d_homologation_v1",
        "reference": {
            "canonical_faces": {
                "front": "cara_A_homologa",
                "back": "cara_B_homologa",
            },
            "longitudinal_rule": longitudinal_rule,
            "pca_frame": "current_oriented_state",
        },
        "signature": signature,
        "signature_vector": signature_vector,
        "quality": {
            "requested_sections": requested_sections,
            "valid_sections": valid_sections,
            "valid_ratio": valid_ratio,
            "coherence_2d_3d": coh_score,
            "pca_seq_procrustes": pca_seq_sim,
        },
        "homologation": {
            "score": global_score,
            "level": homologation_level,
            "is_comparable": comparable,
        },
        "provenance": {
            "inputs": [
                "orientation_canonical",
                "morphology_canonical",
                "pca_contextual",
                "morphometry",
                "coherence_mao_plus",
                "pca_sequential_morphometry",
            ],
        },
    }


def _resample_closed_contour(points2d: np.ndarray, n_samples: int = 64) -> np.ndarray:
    """
    Re-muestrea un contorno cerrado a N puntos equiespaciados por longitud de arco.
    """
    eps = 1e-12
    pts = np.asarray(points2d, dtype=np.float64)
    if pts.ndim != 2 or pts.shape[1] != 2 or pts.shape[0] < 3:
        return np.empty((0, 2), dtype=np.float64)

    if np.linalg.norm(pts[0] - pts[-1]) > eps:
        pts = np.vstack([pts, pts[0]])

    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    total = float(np.sum(seg))
    if total <= eps:
        return np.repeat(pts[:1], n_samples, axis=0)

    cum = np.concatenate([[0.0], np.cumsum(seg)])
    targets = np.linspace(0.0, total, n_samples, endpoint=False)
    out = np.zeros((n_samples, 2), dtype=np.float64)

    j = 0
    for i, t in enumerate(targets):
        while j < len(seg) - 1 and cum[j + 1] < t:
            j += 1
        t0 = cum[j]
        t1 = cum[j + 1]
        a = pts[j]
        b = pts[j + 1]
        alpha = 0.0 if (t1 - t0) <= eps else (t - t0) / (t1 - t0)
        out[i] = (1.0 - alpha) * a + alpha * b

    return out


def _procrustes_disparity_2d(a: np.ndarray, b: np.ndarray) -> dict[str, float] | None:
    """
    Distancia Procrustes 2D (sin reflexión) para dos contornos homologados.
    """
    eps = 1e-12
    A = np.asarray(a, dtype=np.float64)
    B = np.asarray(b, dtype=np.float64)
    if A.shape != B.shape or A.ndim != 2 or A.shape[1] != 2 or A.shape[0] < 6:
        return None

    A0 = A - A.mean(axis=0, keepdims=True)
    B0 = B - B.mean(axis=0, keepdims=True)

    nA = float(np.linalg.norm(A0))
    nB = float(np.linalg.norm(B0))
    if nA <= eps or nB <= eps:
        return None

    A0 /= nA
    B0 /= nB

    H = A0.T @ B0
    U, _, Vt = np.linalg.svd(H)
    R = U @ Vt
    if np.linalg.det(R) < 0:
        U[:, -1] *= -1.0
        R = U @ Vt

    A_aligned = A0 @ R
    disparity = float(np.mean(np.sum((A_aligned - B0) ** 2, axis=1)))
    similarity = float(math.exp(-6.0 * disparity))

    return {
        "disparity": disparity,
        "similarity": similarity,
    }


def _compute_pca_sequential_morphometry(
    canonical_points: np.ndarray,
    pca_ctx: dict[str, Any],
    n_sections: int = 11,
) -> dict[str, Any]:
    """
    Análisis morfométrico secuencial por ejes PCA en el estado de orientación actual.

    Para cada eje PCk:
      - realiza cortes secuenciales ortogonales al eje,
      - mide métricas 2D por sección,
      - estima consistencia de forma entre cortes mediante Procrustes 2D.
    """
    eps = 1e-12
    X = np.asarray(canonical_points, dtype=np.float64)
    axes = np.asarray(pca_ctx.get("principal_axes", []), dtype=np.float64)

    if X.ndim != 2 or X.shape[1] != 3 or X.shape[0] < 20 or axes.shape != (3, 3):
        return {
            "status": "insufficient_data",
            "axes": {},
            "overall": {},
        }

    Y = (X - X.mean(axis=0, keepdims=True)) @ axes
    axis_names = ["pc1", "pc2", "pc3"]
    axis_results: dict[str, Any] = {}
    overall_similarity: list[float] = []

    n_sections = max(5, int(n_sections))

    for k, name in enumerate(axis_names):
        coord = Y[:, k]
        c_min = float(np.min(coord))
        c_max = float(np.max(coord))
        extent = c_max - c_min
        if extent <= eps:
            axis_results[name] = {
                "status": "degenerate",
                "sections": [],
                "procrustes": {},
            }
            continue

        half = max(0.03 * extent, eps)
        centers = np.linspace(c_min + 0.10 * extent, c_max - 0.10 * extent, n_sections)
        others = [i for i in (0, 1, 2) if i != k]

        sections: list[dict[str, Any]] = []
        resampled_contours: list[np.ndarray] = []

        for i, cc in enumerate(centers.tolist(), start=1):
            mask = np.abs(coord - cc) <= half
            npts = int(np.sum(mask))
            if npts < 20:
                continue

            plane_pts = Y[mask][:, others]
            metrics2d = _projected_hull_metrics_2d(plane_pts)
            contour_list = _contour_points_from_projection(plane_pts, max_points=72)
            contour_np = np.asarray(contour_list, dtype=np.float64) if contour_list else np.empty((0, 2), dtype=np.float64)
            contour_rs = _resample_closed_contour(contour_np, n_samples=64) if contour_np.shape[0] >= 6 else np.empty((0, 2), dtype=np.float64)

            if contour_rs.shape[0] >= 16:
                resampled_contours.append(contour_rs)

            span_0 = float(np.max(plane_pts[:, 0]) - np.min(plane_pts[:, 0])) if plane_pts.shape[0] else 0.0
            span_1 = float(np.max(plane_pts[:, 1]) - np.min(plane_pts[:, 1])) if plane_pts.shape[0] else 0.0

            sections.append({
                "index": i,
                "axis": name,
                "coord_center": float(cc),
                "coord_relative": float((cc - c_min) / (extent + eps)),
                "slice_half_width": float(half),
                "point_count": npts,
                "metrics": metrics2d,
                "section_dims": {
                    "dim_1": span_0,
                    "dim_2": span_1,
                },
                "contour": contour_list,
            })

        pair_stats: list[dict[str, Any]] = []
        for i in range(len(resampled_contours) - 1):
            p = _procrustes_disparity_2d(resampled_contours[i], resampled_contours[i + 1])
            if p is None:
                continue
            pair_stats.append({"pair": [i, i + 1], **p})

        pair_similarity = [float(ps.get("similarity") or 0.0) for ps in pair_stats]
        mean_similarity = float(np.mean(pair_similarity)) if pair_similarity else 0.0
        mean_disparity = float(np.mean([float(ps.get("disparity") or 0.0) for ps in pair_stats])) if pair_stats else 0.0

        if pair_similarity:
            overall_similarity.append(mean_similarity)

        axis_results[name] = {
            "status": "ok" if sections else "insufficient_sections",
            "sections": sections,
            "summary": {
                "count": len(sections),
                "mean_area": float(np.mean([float(s.get("metrics", {}).get("area") or 0.0) for s in sections])) if sections else 0.0,
                "mean_dim_1": float(np.mean([float(s.get("section_dims", {}).get("dim_1") or 0.0) for s in sections])) if sections else 0.0,
                "mean_dim_2": float(np.mean([float(s.get("section_dims", {}).get("dim_2") or 0.0) for s in sections])) if sections else 0.0,
            },
            "procrustes": {
                "pairs": pair_stats,
                "mean_disparity": mean_disparity,
                "mean_similarity": mean_similarity,
                "consistency_level": (
                    "alta" if mean_similarity >= 0.80 else
                    "media" if mean_similarity >= 0.60 else
                    "baja"
                ) if pair_stats else "no_data",
            },
        }

    overall_mean_similarity = float(np.mean(overall_similarity)) if overall_similarity else 0.0
    overall_level = (
        "alta" if overall_mean_similarity >= 0.80 else
        "media" if overall_mean_similarity >= 0.60 else
        "baja"
    ) if overall_similarity else "no_data"

    return {
        "status": "ok",
        "reference": {
            "frame": "pca_in_current_canonical_orientation",
            "axes": axis_names,
            "n_sections_requested": n_sections,
        },
        "axes": axis_results,
        "overall": {
            "mean_procrustes_similarity": overall_mean_similarity,
            "consistency_level": overall_level,
            "axes_with_data": int(sum(1 for _n in axis_names if axis_results.get(_n, {}).get("status") == "ok")),
        },
    }


def _stable_resting_orientation(
    points: np.ndarray,
) -> tuple[np.ndarray, dict, list]:
    """
    Determina la orientación de reposo gravitacional estable del objeto.

    Premisas físicas:
      - ancho / alto / espesor → dimensiones en cada orientación candidata
      - superficie de contacto potencial → área de la huella proyectada en el plano de apoyo
      - estabilidad gravitacional → criterio de volcamiento: base grande + COM bajo
      - centro de masa → centroide de la nube de puntos

    Para cada una de las 6 orientaciones candidatas (±3 eigenvectores del tensor
    de inercia como ejes "arriba"), simula el objeto apoyado en un plano horizontal:

        stability_score = footprint_area / com_height²

    Mayor stability_score → posición de reposo más natural.

    Para un toroide/cuenta plana:
      - El eje dorsoventral (espesor) apunta "arriba" → footprint_area máxima
      - El eje longitudinal apunta "arriba" → footprint_area mínima
      → El dorsoventral siempre gana, independientemente de la distribución de puntos.
    """
    eps = 1e-12
    X = np.asarray(points, dtype=np.float64)
    centroid = X.mean(axis=0)
    Xc = X - centroid

    # Tensor de inercia (masa uniforme por punto)
    S = Xc.T @ Xc
    r_sq = float(np.trace(S))
    I_tensor = r_sq * np.eye(3) - S
    eigvals, eigvecs = np.linalg.eigh(I_tensor)  # orden ascendente: I_min, I_mid, I_max

    candidates = []
    labels = ["I_min(longitudinal)", "I_mid(transversal)", "I_max(dorsoventral)"]

    for k in range(3):
        for sign in (+1.0, -1.0):
            e_up = sign * eigvecs[:, k]
            e_up = e_up / (np.linalg.norm(e_up) + eps)

            # Alturas de cada punto a lo largo del eje "arriba"
            h = Xc @ e_up
            h_floor = float(np.min(h))              # nivel del suelo
            h_top   = float(np.max(h))
            h_range = h_top - h_floor

            # Altura del centro de masa sobre el plano de apoyo
            com_height = float(-h_floor)            # COM está en origen de Xc → h_com = 0 → dist al suelo = -h_floor

            # Base ortogonal en el plano de contacto
            if abs(e_up[0]) < 0.9:
                aux = np.array([1.0, 0.0, 0.0])
            else:
                aux = np.array([0.0, 1.0, 0.0])
            t1 = aux - np.dot(aux, e_up) * e_up
            t1 /= (np.linalg.norm(t1) + eps)
            t2 = np.cross(e_up, t1)
            t2 /= (np.linalg.norm(t2) + eps)

            # Proyección 2D del total del objeto (para dimensiones ancho/alto en plano)
            proj_all = np.column_stack([Xc @ t1, Xc @ t2])
            dims_plane = proj_all.max(axis=0) - proj_all.min(axis=0)

            # Puntos de contacto: franja inferior del 5 % de la altura total
            contact_thresh = h_floor + max(0.05 * h_range, eps)
            contact_pts = proj_all[h <= contact_thresh]

            if len(contact_pts) < 3:
                footprint_area = 0.0
            else:
                try:
                    from scipy.spatial import ConvexHull  # type: ignore
                    hull = ConvexHull(contact_pts)
                    footprint_area = float(hull.volume)   # en 2D: volume = área
                except Exception:
                    rng = contact_pts.max(axis=0) - contact_pts.min(axis=0)
                    footprint_area = float(rng[0] * rng[1])

            stability = footprint_area / (com_height ** 2) if com_height > eps else 0.0

            candidates.append({
                "axis_idx":          int(k),
                "sign":              int(sign),
                "inertia_label":     labels[k],
                "normal_up":         [float(v) for v in e_up.tolist()],
                "footprint_area":    float(footprint_area),
                "com_height":        float(com_height),
                "width_in_plane":    float(dims_plane[0]),
                "height_in_plane":   float(dims_plane[1]),
                "object_thickness":  float(h_range),
                "stability_score":   float(stability),
                "inertia_eigenvalue": float(eigvals[k]),
            })

    candidates.sort(key=lambda c: c["stability_score"], reverse=True)
    best = candidates[0]
    e_up_best = np.array(best["normal_up"])
    return e_up_best, best, candidates


def _compute_semantic_orientation(
    canonical_points: np.ndarray,
    rotation_matrix: np.ndarray,
    face_info: dict[str, Any],
    orientation_mode: str = "auto",
    user_anchor_point: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    """
    Orientación canónica completa por simulación de reposo gravitacional.

    Flujo:
      1. _stable_resting_orientation → eje dorsoventral (normal al plano de reposo)
      2. Reconciliar con cara frontal detectada (signo de +Z)
      3. Inercia 2D en plano de reposo → eje longitudinal / transversal
      4. Desambiguación proximal/distal por radio ρ en el plano
      5. Construir R_sem y proyectar

    Convención de salida:
      +X = distal,  −X = proximal
      +Z = cara A (anverso, mira hacia arriba en reposo),  −Z = cara B (reverso)
      +Y = transversal (regla mano derecha)
    """
    eps = 1e-12
    X  = np.asarray(canonical_points, dtype=np.float64)
    R  = np.asarray(rotation_matrix,  dtype=np.float64)

    if X.shape[0] < 20:
        return X, R, {"status": "insufficient_points", "reproducible": False}

    Xc = X - X.mean(axis=0, keepdims=True)

    # ── 1) Reposo gravitacional (diagnóstico) ──────────────────────────────────
    # Se calcula SIEMPRE para métricas de estabilidad, pero NO define el eje
    # dorsoventral cuando tenemos caras formales detectadas.
    e_up_gravity, best_candidate, all_candidates = _stable_resting_orientation(Xc)

    # ── 2) Eje dorsoventral: prioridad semántica de caras formales ─────────────
    # En el frame normalizado, _normalize_by_faces ya dejó cara A en +Z.
    z_ref = np.array([0.0, 0.0, 1.0])
    requested_mode = str(orientation_mode or "auto").strip().lower()
    has_formal_faces = (
        face_info.get("front_patch_id") is not None and
        face_info.get("reverse_patch_id") is not None
    )
    use_contour_variance_normal = (
        requested_mode == "contour_variance_normal"
        or (requested_mode == "auto_visual" and not has_formal_faces)
    )

    # Si el usuario solicita explícitamente normal por varianza del contorno,
    # usar la normal del plano de mejor ajuste (mínima varianza) como eje Z.
    if use_contour_variance_normal:
        cov_full = np.cov(Xc.T)
        evals_full, evecs_full = np.linalg.eigh(cov_full)
        idx_min = int(np.argmin(evals_full))
        e_dv = np.asarray(evecs_full[:, idx_min], dtype=np.float64)
        e_dv = e_dv / (np.linalg.norm(e_dv) + eps)
        if float(np.dot(e_dv, z_ref)) < 0.0:
            e_dv = -e_dv
        method = "contour_variance_normal"
    elif has_formal_faces:
        # Regla fuerte: el eje de caras domina la orientación.
        e_dv = z_ref.copy()
        method = "faces_dominant_gravity_validated"
    else:
        # Sin caras confiables, usar orientación gravitacional como fallback.
        e_dv = e_up_gravity
        if float(np.dot(e_dv, z_ref)) < 0.0:
            e_dv = -e_dv
        method = "gravitational_stability"

    has_formal_faces_locked = bool(has_formal_faces and not use_contour_variance_normal)

    # Qué tanto coincide la normal de reposo físico con la semántica de caras.
    dv_face_alignment = float(abs(np.dot(e_up_gravity, e_dv)))

    # ── 3) Eje en plano: límite máximo de superficie desde COM (regla canónica) ──
    #    Proyectar Xc sobre el plano perpendicular a e_dv
    h_dv = (Xc @ e_dv)[:, np.newaxis] * e_dv   # componente fuera del plano
    Xplane = Xc - h_dv                           # proyección sobre el plano

    # Base auxiliar del plano canónico
    t1 = np.array([1.0, 0.0, 0.0], dtype=np.float64)
    if abs(float(np.dot(t1, e_dv))) > 0.9:
        t1 = np.array([0.0, 1.0, 0.0], dtype=np.float64)
    t1 = t1 - np.dot(t1, e_dv) * e_dv
    t1 = t1 / (np.linalg.norm(t1) + eps)
    t2 = np.cross(e_dv, t1)
    t2 = t2 / (np.linalg.norm(t2) + eps)

    uv = np.column_stack([Xplane @ t1, Xplane @ t2])
    radial = np.sqrt(uv[:, 0] * uv[:, 0] + uv[:, 1] * uv[:, 1]) if uv.size else np.array([], dtype=np.float64)

    x_axis_rule = "inplane_inertia"
    user_axis_meta: dict[str, Any] | None = None

    # Modo primario por usuario: COM -> promedio de puntos equidistantes de contorno
    # en torno a la dirección elegida por el analista.
    auto_anchor_point = None
    if requested_mode == "auto_visual" and user_anchor_point is None and Xplane.shape[0] > 0:
        radial_auto = np.linalg.norm(Xplane, axis=1)
        idx_auto = int(np.argmax(radial_auto)) if radial_auto.size else -1
        if idx_auto >= 0:
            auto_anchor_point = Xplane[idx_auto]

    use_user_axis = bool(
        (requested_mode == "user_morphological_axis" and user_anchor_point is not None)
        or (requested_mode == "auto_visual" and auto_anchor_point is not None)
    )
    if use_user_axis:
        try:
            anchor_source = "user_selected"
            anchor_raw = user_anchor_point if requested_mode == "user_morphological_axis" else auto_anchor_point
            if requested_mode == "auto_visual":
                anchor_source = "auto_contour_extreme"
            ua = np.asarray(anchor_raw, dtype=np.float64).reshape(3)
            # Vector desde COM (origen de Xc) hacia ancla seleccionada
            ua_plane = ua - np.dot(ua, e_dv) * e_dv
            nua = float(np.linalg.norm(ua_plane))
            if nua > eps and uv.size:
                dir_u = ua_plane / nua
                dir_v = np.cross(e_dv, dir_u)
                dir_v = dir_v / (np.linalg.norm(dir_v) + eps)

                u_dir = Xplane @ dir_u
                v_dir = Xplane @ dir_v
                radial_dir = np.sqrt(u_dir * u_dir + v_dir * v_dir)
                theta = np.arctan2(v_dir, u_dir)
                theta_anchor = 0.0  # porque dir_u es el eje angular de referencia

                # Contorno proxy: banda externa radial + cono angular del ancla
                r_q = float(np.quantile(radial_dir, 0.90)) if radial_dir.size > 5 else float(np.max(radial_dir) if radial_dir.size else 0.0)
                cone_cos = math.cos(math.radians(35.0))
                ang_cos = np.cos(theta - theta_anchor)
                contour_mask = (radial_dir >= r_q) & (ang_cos >= cone_cos)

                if not np.any(contour_mask):
                    # Fallback: escoger extremos por proyección en la dirección del usuario
                    k = max(3, int(0.03 * len(u_dir)))
                    idx = np.argsort(u_dir)[-k:]
                    contour_pts = Xplane[idx]
                else:
                    contour_pts = Xplane[contour_mask]

                q_bar = np.mean(contour_pts, axis=0)
                q_bar = q_bar - np.dot(q_bar, e_dv) * e_dv
                nq = float(np.linalg.norm(q_bar))
                if nq > eps:
                    e_long = q_bar / nq
                    e_trans = np.cross(e_dv, e_long)
                    e_trans = e_trans / (np.linalg.norm(e_trans) + eps)
                    inplane_sep = float(np.quantile(radial_dir, 0.95) / (np.max(radial_dir) + eps)) if radial_dir.size > 5 else 0.0
                    x_axis_rule = "mass_cut_plane_x_axis"

                    # Plano morfológico de orientación espacial:
                    # pasa por COM (origen), contiene el eje de corte de masa (X)
                    # y el dorsoventral (Z). Su normal es el eje transversal (Y).
                    plane_normal = np.cross(e_long, e_dv)
                    plane_normal = plane_normal / (np.linalg.norm(plane_normal) + eps)

                    user_axis_meta = {
                        "anchor_source": anchor_source,
                        "anchor_point_canonical": [float(v) for v in ua.tolist()],
                        "mass_cut_axis_x": [float(v) for v in e_long.tolist()],
                        "equidistant_contour_mean": [float(v) for v in q_bar.tolist()],
                        "contour_radius_q90": float(r_q),
                        "contour_points_used": int(contour_pts.shape[0]),
                        "morphological_plane": {
                            "equation": "n·(x-COM)=0",
                            "normal": [float(v) for v in plane_normal.tolist()],
                            "passes_through_com": True,
                            "contains_axes": ["longitudinal_x", "dorsoventral_z"],
                        },
                    }
                else:
                    use_user_axis = False
            else:
                use_user_axis = False
        except Exception:
            use_user_axis = False

    if use_user_axis and x_axis_rule == "mass_cut_plane_x_axis":
        use_limit_axis = False
    else:
        use_user_axis = False
    use_limit_axis = bool((not use_user_axis) and has_formal_faces_locked and radial.size)
    if use_limit_axis:
        # Límite máximo de superficie en el plano horizontal canónico:
        # +X = vector COM -> punto extremo de mayor radio proyectado.
        r_max = float(np.max(radial))
        far_mask = radial >= max(0.995 * r_max, 0.0)
        far_uv = uv[far_mask] if np.any(far_mask) else uv
        # Desempate estable: mayor u, luego mayor v.
        if far_uv.shape[0] > 1:
            key = np.lexsort((far_uv[:, 1], far_uv[:, 0]))
            uv_pick = far_uv[key[-1]]
        else:
            uv_pick = far_uv[0]

        x_vec = uv_pick[0] * t1 + uv_pick[1] * t2
        if float(np.linalg.norm(x_vec)) > eps:
            e_long = x_vec / (np.linalg.norm(x_vec) + eps)
            e_trans = np.cross(e_dv, e_long)
            e_trans = e_trans / (np.linalg.norm(e_trans) + eps)
            inplane_sep = float(np.quantile(radial, 0.95) / (r_max + eps)) if radial.size > 5 else 0.0
            x_axis_rule = "com_to_max_surface_limit"
        else:
            use_limit_axis = False  # fuerza fallback por seguridad numérica

    if not use_limit_axis:
        # Fallback inercial en plano
        S3 = Xplane.T @ Xplane
        evals_p, evecs_p = np.linalg.eigh(S3)
        order_p = np.argsort(evals_p)[::-1]
        in_plane_axes = []
        for idx in order_p:
            v = evecs_p[:, idx]
            if abs(float(np.dot(v, e_dv))) < 0.98:
                in_plane_axes.append((evals_p[idx], v))
            if len(in_plane_axes) == 2:
                break

        if len(in_plane_axes) == 2:
            e_long = in_plane_axes[0][1].copy()
            e_trans = in_plane_axes[1][1].copy()
            inplane_sep = float(abs(in_plane_axes[0][0] - in_plane_axes[1][0]) /
                                max(abs(in_plane_axes[0][0]), eps))
        else:
            aux = np.array([1.0, 0.0, 0.0]) if abs(e_dv[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
            e_long = aux - np.dot(aux, e_dv) * e_dv
            e_long /= (np.linalg.norm(e_long) + eps)
            e_trans = np.cross(e_dv, e_long)
            e_trans /= (np.linalg.norm(e_trans) + eps)
            inplane_sep = 0.0

    # Ortogonalizar mediante cierre de base derecha
    e_trans = np.cross(e_dv, e_long)
    e_trans /= (np.linalg.norm(e_trans) + eps)
    e_long  = np.cross(e_trans, e_dv)
    e_long  /= (np.linalg.norm(e_long) + eps)

    # ── 4) Desambiguación proximal/distal ──────────────────────────────────────
    #    Si hay caras formales, +X ya está anclado a límite máximo (COM→límite).
    #    Si no, conservar regla de extremo con mayor radio ρ.
    proj_long  = Xc @ e_long
    proj_trans = Xc @ e_trans
    proj_dv_s  = Xc @ e_dv
    rho = np.sqrt(proj_trans ** 2 + proj_dv_s ** 2)

    q_lo = float(np.quantile(proj_long, 0.10))
    q_hi = float(np.quantile(proj_long, 0.90))
    rho_lo = float(np.mean(rho[proj_long <= q_lo]))
    rho_hi = float(np.mean(rho[proj_long >= q_hi]))
    distal_conf = abs(rho_hi - rho_lo) / max(max(rho_hi, rho_lo), eps)

    if (x_axis_rule not in ("com_to_max_surface_limit", "mass_cut_plane_x_axis")) and (rho_lo > rho_hi + eps):
        e_long  = -e_long
        e_trans = np.cross(e_dv, e_long)
        e_trans /= (np.linalg.norm(e_trans) + eps)
        e_long  = np.cross(e_trans, e_dv)
        e_long  /= (np.linalg.norm(e_long) + eps)
        proj_long = -proj_long

    # ── 5) Matriz canónica y proyección final ──────────────────────────────────
    R_sem = np.column_stack([e_long, e_trans, e_dv])
    if np.linalg.det(R_sem) < 0:
        e_trans = -e_trans
        R_sem   = np.column_stack([e_long, e_trans, e_dv])

    Xs = Xc @ R_sem

    x_min = float(np.min(Xs[:, 0]));  x_max = float(np.max(Xs[:, 0]))
    y_min = float(np.min(Xs[:, 1]));  y_max = float(np.max(Xs[:, 1]))
    z_min = float(np.min(Xs[:, 2]));  z_max = float(np.max(Xs[:, 2]))

    # ── 6) Métricas de reproducibilidad ───────────────────────────────────────
    stab_best  = float(best_candidate["stability_score"])
    stab_second = float(all_candidates[1]["stability_score"]) if len(all_candidates) > 1 else 0.0
    stab_sep   = (stab_best - stab_second) / max(stab_best, eps)
    reproducibility_score = float(max(0.0, min(1.0, 0.45 * stab_sep + 0.30 * max(inplane_sep, 0.0) + 0.25 * dv_face_alignment)))
    reproducible = bool((stab_sep > 0.05 and inplane_sep > 0.01) or (has_formal_faces_locked and dv_face_alignment > 0.70))

    front_id   = face_info.get("front_patch_id")
    reverse_id = face_info.get("reverse_patch_id")

    # ── Payload ────────────────────────────────────────────────────────────────
    orientation = {
        "status": "ok",
        "method": method,
        "reproducible": reproducible,
        "reproducibility_score": reproducibility_score,
        "gravitational": {
            "resting_footprint_area":   float(best_candidate["footprint_area"]),
            "resting_com_height":       float(best_candidate["com_height"]),
            "resting_stability_score":  stab_best,
            "stability_margin":         float(stab_sep),
            "dv_face_alignment":        dv_face_alignment,
            "inplane_separation":       float(inplane_sep),
            "distal_confidence":        float(distal_conf),
            "resting_face_is":          "A(anverso)" if float(np.dot(e_up_gravity, z_ref)) > 0 else "B(reverso)",
            "formal_faces_locked":      has_formal_faces_locked,
            "candidates": [
                {k: v for k, v in c.items() if k != "normal_up"}
                for c in all_candidates[:6]
            ],
        },
        "dimensions": {
            "ancho":   float(best_candidate["width_in_plane"]),
            "alto":    float(best_candidate["height_in_plane"]),
            "espesor": float(best_candidate["object_thickness"]),
        },
        "axis_definition": {
            "longitudinal": {
                "name": "eje_longitudinal_principal",
                "vector_world": [float(v) for v in e_long.tolist()],
                "extent": float(x_max - x_min),
                "rule": x_axis_rule,
                "morphological": user_axis_meta,
            },
            "transversal": {
                "name": "eje_transversal",
                "vector_world": [float(v) for v in e_trans.tolist()],
                "extent": float(y_max - y_min),
            },
            "dorsoventral": {
                "name": "eje_dorsoventral_espesor",
                "vector_world": [float(v) for v in e_dv.tolist()],
                "extent": float(z_max - z_min),
            },
        },
        "faces": {
            "A": {
                "label": "anverso",
                "patch_id": int(front_id) if front_id is not None else None,
                "is_positive_dorsoventral": True,
                "faces_up_in_rest": True,
            },
            "B": {
                "label": "reverso",
                "patch_id": int(reverse_id) if reverse_id is not None else None,
                "is_positive_dorsoventral": False,
                "faces_up_in_rest": False,
            },
            "has_intrinsic_assignment": front_id is not None and reverse_id is not None,
        },
        "edges": {
            "proximal": {
                "label": "proximal",
                "axis_direction": "-longitudinal",
                "x_value": x_min,
                "slice_threshold": float(np.quantile(Xs[:, 0], 0.10)),
            },
            "distal": {
                "label": "distal",
                "axis_direction": "+longitudinal",
                "x_value": x_max,
                "slice_threshold": float(np.quantile(Xs[:, 0], 0.90)),
            },
            "midpoint_x": float(0.5 * (x_min + x_max)),
        },
        "canonical_pose": {
            "center_world": [float(v) for v in X.mean(axis=0).tolist()],
            # R_world = R_norm @ R_sem: transforma coords mundo → sistema canónico
            "rotation_matrix_world": [[float(v) for v in row] for row in (R @ R_sem).tolist()],
            "convention": {
                "+X": "distal",
                "-X": "proximal",
                "+Z": "cara A (anverso) — mira arriba en reposo",
                "-Z": "cara B (reverso) — apoyada en superficie",
            },
        },
    }
    return Xs, R_sem, orientation


async def analyze_v2(
    obj_bytes: bytes,
    n_samples: int = 20000,
    normalize_mode: str = "none",
    orientation_mode: str = "auto",
    user_anchor: tuple[float | None, float | None, float | None] | None = None,
) -> dict[str, Any]:
    """
    Análisis morfométrico 3D (v2): Orden correcto.
    
    Flujo:
      1. Segmentación de superficies regulares
      2. Detección de pares de caras opuestas
      3. Normalización por caras (no por PCA global)
      4. PCA contextualizado
      5. Métricas morfométricas MAO-compatibles
    """
    trimesh = _ensure_trimesh()

    if not obj_bytes:
        raise HTTPException(status_code=400, detail="Archivo OBJ vacío.")

    try:
        mesh = trimesh.load(io.BytesIO(obj_bytes), file_type="obj", force="mesh")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"No se pudo leer OBJ: {exc}") from exc

    if mesh is None or mesh.is_empty:
        raise HTTPException(status_code=422, detail="Malla OBJ vacía o inválida.")

    if isinstance(mesh, trimesh.Scene):
        try:
            mesh = trimesh.util.concatenate(tuple(mesh.geometry.values()))
        except Exception as exc:
            raise HTTPException(status_code=422, detail="No se pudo convertir Scene a malla.") from exc

    if mesh.vertices is None or len(mesh.vertices) < 3:
        raise HTTPException(status_code=422, detail="OBJ sin geometría suficiente.")

    # FASE 1: Segmentación de superficies
    try:
        patches = _segment_regular_surfaces(
            mesh,
            curvature_threshold=0.15,
            normal_coherence_threshold=0.82,
            min_patch_size=50,
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Error en segmentación de superficies: {e}") from e

    # FASE 2: Detección de caras
    try:
        face_pairs = _detect_face_pairs(patches, angle_threshold=165.0, area_ratio_threshold=0.65)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Error en detección de caras: {e}") from e

    # Determinar modo: mono/bifacial según pares
    if len(face_pairs) >= 1:
        face_mode = "bifacial"
        primary_pair = face_pairs[0]
    elif len(patches) >= 1:
        face_mode = "monofacial"
        primary_pair = None
    else:
        face_mode = "indeterminado"
        primary_pair = None

    # FASE 3: Normalización por caras
    try:
        X_norm, R_norm, norm_meta = _normalize_by_faces(mesh, face_pairs, patches)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Error en normalización: {e}") from e

    # FASE 4: orientación semántica completa
    face_sem = norm_meta.get("front_reverse", {}) if isinstance(norm_meta, dict) else {}
    user_anchor_canonical = None
    try:
        if user_anchor is not None and len(user_anchor) == 3 and all(v is not None for v in user_anchor):
            ua_world = np.asarray([float(user_anchor[0]), float(user_anchor[1]), float(user_anchor[2])], dtype=np.float64)
            center = np.asarray(norm_meta.get("center", [0.0, 0.0, 0.0]), dtype=np.float64)
            rot = np.asarray(norm_meta.get("rotation_matrix", np.eye(3).tolist()), dtype=np.float64)
            if ua_world.shape == (3,) and center.shape == (3,) and rot.shape == (3, 3):
                user_anchor_canonical = (ua_world - center) @ rot
    except Exception:
        user_anchor_canonical = None

    try:
        X_sem, R_sem, semantic_orientation = _compute_semantic_orientation(
            X_norm,
            R_norm,
            face_sem,
            orientation_mode=orientation_mode,
            user_anchor_point=user_anchor_canonical,
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Error en orientación semántica: {e}") from e

    # FASE 5: PCA contextualizado en pose canónica
    try:
        pca_ctx = _pca_contextual(X_sem, face_assignment="primary")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Error en PCA contextual: {e}") from e

    # FASE 6: Métricas morfométricas
    metrics = _make_morphometric_metrics(pca_ctx, {}, face_mode)
    canonical_morphology = _compute_canonical_morphological_analysis(X_sem, semantic_orientation, n_sections=9)
    pca_sequential = _compute_pca_sequential_morphometry(X_sem, pca_ctx, n_sections=11)

    # Asignación explícita frente/reverso basada en normalización intrínseca
    front_reverse = norm_meta.get("front_reverse", {})
    front_id = front_reverse.get("front_patch_id")
    reverse_id = front_reverse.get("reverse_patch_id")
    lateral_ids = [
        int(p.get("id"))
        for p in patches
        if int(p.get("id")) not in {front_id, reverse_id}
    ]

    # Caras laterales: parches no horizontales relativos a las caras dominantes
    h_front = float(front_reverse.get("front_horizontality", 0.0))
    h_reverse = float(front_reverse.get("reverse_horizontality", 0.0))
    h_ref = max(min(h_front, h_reverse), 1e-9)
    lateral_rank = []
    for p in patches:
        pid = int(p.get("id"))
        if pid in {front_id, reverse_id}:
            continue
        h = float(p.get("horizontality_score", 0.0))
        lateral_rank.append({
            "patch_id": pid,
            "horizontality_ratio": float(h / h_ref),
            "area": float(p.get("area", 0.0)),
            "area_dominant": float(p.get("area_dominant", p.get("area", 0.0))),
            "area_gross": float(p.get("area_gross", p.get("area", 0.0))),
        })
    lateral_rank.sort(key=lambda x: (x["horizontality_ratio"], -x["area_dominant"]))

    faces_assignment = {
        "front": front_id,
        "reverse": reverse_id,
    }

    # Puente explícito MAO Plus 2D -> 3D (pre-PCA), homologado por orientación:
    # combina caras formales + proyecciones canónicas orientadas.
    front_area_dom = float(front_reverse.get("front_area_dominant", 0.0) or 0.0)
    front_perim_dom = float(front_reverse.get("front_perimeter_gross", 0.0) or 0.0)
    reverse_area_dom = float(front_reverse.get("reverse_area_dominant", 0.0) or 0.0)

    eps = 1e-12
    circularity_2d_proxy = (
        float((4.0 * math.pi * front_area_dom) / (front_perim_dom * front_perim_dom + eps))
        if front_area_dom > 0.0 and front_perim_dom > 0.0
        else None
    )

    dims_can = semantic_orientation.get("dimensions", {}) if isinstance(semantic_orientation, dict) else {}
    ancho = float(dims_can.get("ancho", 0.0) or 0.0)
    alto = float(dims_can.get("alto", 0.0) or 0.0)
    espesor = float(dims_can.get("espesor", 0.0) or 0.0)
    major_2d = max(ancho, alto)
    minor_2d = min(ancho, alto)
    aspect_ratio_2d = float(major_2d / (minor_2d + eps)) if major_2d > 0.0 else None

    # Calidad formal de cara dominante (proxy acotado):
    # relación entre área formal proyectada y área de superficie de malla.
    # Se mantiene en [0,1] para evitar interpretaciones inválidas.
    front_area_net = float(front_reverse.get("front_area_net", front_area_dom) or 0.0)
    solidity_raw = float(front_area_dom / (front_area_net + eps)) if front_area_net > 0.0 else None
    solidity_2d_proxy = (
        float(max(0.0, min(1.0, solidity_raw)))
        if solidity_raw is not None
        else None
    )

    bifacial_balance = (
        float(min(front_area_dom, reverse_area_dom) / (max(front_area_dom, reverse_area_dom) + eps))
        if (front_area_dom > 0.0 and reverse_area_dom > 0.0)
        else None
    )

    oriented_homologation = _compute_oriented_mao2d_homologation(X_sem, semantic_orientation)
    frontal_plane = oriented_homologation.get("planes", {}).get("frontal_xy", {})

    mao2d_adapted = {
        "version": "mao2d_bridge_v3_oriented",
        "source": "dominant_formal_surfaces_plus_canonical_projections_pre_pca",
        # Legacy / compatibilidad histórica
        "front_face_area_2d": front_area_dom,
        "front_face_perimeter_2d": front_perim_dom,
        "circularity_2d_proxy": circularity_2d_proxy,
        "aspect_ratio_2d_proxy": aspect_ratio_2d,
        "solidity_2d_raw": solidity_raw,
        "solidity_2d_proxy": solidity_2d_proxy,
        "bifacial_balance_proxy": bifacial_balance,
        # Homologación orientada por pose canónica
        "orientation_context": {
            "orientation_mode": str(orientation_mode or "auto"),
            "canonical_method": semantic_orientation.get("method"),
            "front_back_are_reference_faces": True,
            "longitudinal_rule": semantic_orientation.get("axis_definition", {}).get("longitudinal", {}).get("rule"),
        },
        "oriented_2d": oriented_homologation,
        "front_back_reference": {
            "plane": "frontal_xy",
            "area_2d": frontal_plane.get("area"),
            "perimeter_2d": frontal_plane.get("perimeter"),
            "circularity_2d": frontal_plane.get("circularity"),
            "aspect_ratio_2d": frontal_plane.get("aspect_ratio"),
        },
        "canonical_contours": {
            "front_back": canonical_morphology.get("front_back", {}),
            "transverse_summary": canonical_morphology.get("transverse_summary", {}),
        },
        "pca_sequential_summary": pca_sequential.get("overall", {}),
        "dimensions_resting": {
            "ancho": ancho,
            "alto": alto,
            "espesor": espesor,
        },
    }

    coherence_mao_plus = _compute_crossdimensional_mao_coherence(
        mao2d_adapted=mao2d_adapted,
        canonical_morphology=canonical_morphology,
        morphometry=metrics,
        semantic_orientation=semantic_orientation,
    )
    homologation_3d = _compute_3d_homologation_mao_plus(
        semantic_orientation=semantic_orientation,
        canonical_morphology=canonical_morphology,
        pca_ctx=pca_ctx,
        morphometry=metrics,
        coherence_mao_plus=coherence_mao_plus,
        pca_sequential=pca_sequential,
    )
    mao2d_adapted["coherence_2d_3d"] = coherence_mao_plus
    mao2d_adapted["homologation_3d"] = {
        "model": homologation_3d.get("model"),
        "score": homologation_3d.get("homologation", {}).get("score"),
        "level": homologation_3d.get("homologation", {}).get("level"),
        "is_comparable": homologation_3d.get("homologation", {}).get("is_comparable"),
    }

    bounds = mesh.bounds if mesh.bounds is not None else np.array([[0, 0, 0], [0, 0, 0]], dtype=float)

    return {
        "status": "ok",
        "obj3d": {
            "num_vertices": int(len(mesh.vertices)),
            "num_faces": int(len(mesh.faces)) if mesh.faces is not None else 0,
            "surface_area": float(mesh.area),
            "volume": float(mesh.volume) if bool(getattr(mesh, "is_watertight", False)) else None,
            "is_watertight": bool(getattr(mesh, "is_watertight", False)),
            "centroid": [float(x) for x in mesh.centroid.tolist()],
            "bounds_min": [float(x) for x in bounds[0].tolist()],
            "bounds_max": [float(x) for x in bounds[1].tolist()],
            "normalize_mode": normalize_mode,
            "analysis_level": "v2_morphological",
            "orientation_mode": str(orientation_mode or "auto"),
            "pipeline_trace": {
                "ordered_steps": [
                    "segmentation_regular_surfaces",
                    "face_pair_detection",
                    "normalization_by_faces",
                    "semantic_orientation_canonical",
                    "pca_contextual",
                    "morphometric_metrics",
                ],
                "pre_pca_verified": True,
                "executed": {
                    "segmentation_regular_surfaces": True,
                    "face_pair_detection": True,
                    "normalization_by_faces": True,
                    "semantic_orientation_canonical": True,
                    "pca_contextual": True,
                    "morphometric_metrics": True,
                },
            },
            "segmentation": {
                "patches_found": len(patches),
                "face_pairs_detected": len(face_pairs),
                "patches_summary": [
                    {
                        "id": p["id"],
                        "area": p["area"],
                        "area_dominant": p.get("area_dominant", p["area"]),
                        "area_gross": p.get("area_gross", p["area"]),
                        "curvature": p["curvature_mean"],
                        "point_count": p["point_count"],
                        "centroid": p["centroid"],
                    }
                    for p in patches[:10]  # primeros 10
                ],
            },
            "normalization": norm_meta,
            "orientation_canonical": semantic_orientation,
            "pca": pca_ctx,
            "morphometry": metrics,
            "morphology_canonical": canonical_morphology,
            "pca_sequential_morphometry": pca_sequential,
            "mao2d_adapted": mao2d_adapted,
            "coherence_mao_plus": coherence_mao_plus,
            "homologation_3d": homologation_3d,
            "faces": {
                "mode": face_mode,
                "pairs": primary_pair if primary_pair else None,
                "pair_count": len(face_pairs),
                "assignment": faces_assignment,
                "semantic": {
                    "front_label": "frente",
                    "reverse_label": "reverso",
                    "criterion": "dominant_formal_surfaces_com_horizontal_plane_pre_pca",
                    "dominance_metric": "area_semantic_projected_hull",
                    "optical_principle": "com_centered_horizontal_plane_to_object_limits",
                    "front_is_positive_z": True,
                    "A_label": "anverso",
                    "B_label": "reverso",
                    "lateral_label": "espesor",
                    "lateral_patch_ids": lateral_ids,
                    "lateral_rank": lateral_rank[:10],
                },
            },
        },
    }
