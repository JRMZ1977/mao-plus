"""
Repertorio canónico morfométrico 2D↔3D (ADR-006).
Única fuente de verdad: ningún consumidor (comparador, coherencia, tabla-metricas)
debe hardcodear nombres de clave; todos leen de aquí.

Invariante rector — solo adimensionales en el núcleo:
  Una métrica es de nivel H (homóloga directa, núcleo) solo si es invariante
  ante traslación + rotación + escala, Y adimensional.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Optional, Tuple


@dataclass(frozen=True)
class MetricSpec:
    id: str                         # id canónico estable (snake_case)
    nombre: str                     # etiqueta legible (UI / tabla)
    formula: str                    # expresión de referencia (documental)
    nivel: str                      # "H" | "P" | "3D" | "2D"
    modalidad: Tuple[str, ...]      # ("2d","3d_section","3d_projection","3d_native")
    invariante: bool                # ante traslación + rotación + escala
    adimensional: bool              # normalizada a escala (sin unidad de longitud/área)
    homologo: Optional[str]         # id del par homólogo (solo nivel "P")
    unidad: str                     # "adimensional" | "mm" | "mm2" | "grados" | ...
    fuente_2d: Optional[str]        # clave real en metrics.py / efa.py
    fuente_3d: Optional[str]        # clave real en obj3d_v2.py
    # Para nivel P: clave en el dict frontal_ref de _compute_crossdimensional_mao_coherence.
    # Convenio: si None, se deriva como f"{homologo}_2d" cuando hay frontal_ref.
    frontal_ref_key: Optional[str] = None
    # Escala de similaridad para _exp_similarity en la coherencia cross-dim.
    coherence_scale: Optional[float] = None


# ─────────────────────────────────────────────────────────────────────────────
# NIVEL H — Homólogas directas (núcleo canónico)
# Misma fórmula adimensional, calculada idéntica en 2D y sobre secciones/
# proyecciones 3D. Invariantes ante traslación + rotación + escala.
# ─────────────────────────────────────────────────────────────────────────────
_H: list[MetricSpec] = [
    MetricSpec(
        id="circularity", nombre="Circularidad",
        formula="4*pi*A / P^2", nivel="H",
        modalidad=("2d", "3d_section", "3d_projection"),
        invariante=True, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d="circularity", fuente_3d=None,
    ),
    MetricSpec(
        id="solidity", nombre="Solidez",
        formula="A / A_hull", nivel="H",
        modalidad=("2d", "3d_section"),
        invariante=True, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d="solidity", fuente_3d=None,
    ),
    MetricSpec(
        id="convexity_perim", nombre="Convexidad de perímetro",
        formula="P_hull / P_real", nivel="H",
        modalidad=("2d", "3d_section"),
        invariante=True, adimensional=True, homologo=None,
        unidad="adimensional",
        # En /api/metrics la clave plana es "convexity"; en obj3d_v2 es "convexity_perim".
        fuente_2d="convexity", fuente_3d="convexity_perim",
    ),
    MetricSpec(
        id="elongation", nombre="Elongación",
        formula="1 - eje_menor/eje_mayor", nivel="H",
        modalidad=("2d", "3d_section"),
        invariante=True, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d="elongation", fuente_3d=None,
    ),
    MetricSpec(
        id="aspect_ratio", nombre="Relación de aspecto",
        formula="eje_mayor / eje_menor", nivel="H",
        modalidad=("2d", "3d_section", "3d_projection"),
        invariante=True, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d="aspect_ratio_tight", fuente_3d=None,
    ),
    MetricSpec(
        id="contour_complexity_index", nombre="Índice de complejidad del contorno",
        formula="P_real / (2*pi*sqrt(A/pi))", nivel="H",
        modalidad=("2d", "3d_section"),
        invariante=True, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d="contour_complexity_index", fuente_3d=None,
    ),
    MetricSpec(
        id="feret_ratio", nombre="Ratio de Feret",
        formula="feret_min / feret_max", nivel="H",
        modalidad=("2d", "3d_section"),
        invariante=True, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d="feret_ratio", fuente_3d=None,
    ),
    MetricSpec(
        id="efa_coefficients", nombre="Coeficientes EFA normalizados",
        formula="EFD normalizado (a,b,c,d)*N armonicos tras rotacion psi",
        nivel="H",
        modalidad=("2d", "3d_section"),
        invariante=True, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d="efa.coefficients", fuente_3d=None,
    ),
    MetricSpec(
        id="excentricidad", nombre="Excentricidad",
        formula="sqrt(1 - (eigenvalue_menor/eigenvalue_mayor))",
        nivel="H",
        modalidad=("2d", "3d_section"),
        invariante=True, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d="excentricidad", fuente_3d=None,
    ),
    MetricSpec(
        id="simetria_bilateral", nombre="Simetría bilateral",
        formula="indice [0,1] por reflejo sobre eje mayor",
        nivel="H",
        modalidad=("2d", "3d_section"),
        invariante=True, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d="simetria_bilateral", fuente_3d=None,
    ),
]

# ─────────────────────────────────────────────────────────────────────────────
# NIVEL P — Proxy / análogo (homología aproximada)
# Métrica 3D-nativa con homólogo 2D aproximado.
# Usadas por _compute_crossdimensional_mao_coherence.
# ─────────────────────────────────────────────────────────────────────────────
_P: list[MetricSpec] = [
    MetricSpec(
        id="circularity_proxy", nombre="Circularidad (proxy PCA)",
        formula="lambda_3 / lambda_1 (esfericidad PCA)",
        nivel="P",
        modalidad=("3d_native",),
        invariante=True, adimensional=True, homologo="circularity",
        unidad="adimensional",
        fuente_2d=None, fuente_3d="circularity_proxy",
        frontal_ref_key="circularity_2d", coherence_scale=0.15,
    ),
    MetricSpec(
        id="thickness_ratio", nombre="Ratio de espesor (PCA)",
        formula="ext_z / max(ext_x, ext_y)",
        nivel="P",
        modalidad=("3d_native",),
        invariante=True, adimensional=True, homologo="aspect_ratio",
        unidad="adimensional",
        fuente_2d=None, fuente_3d="thickness_ratio",
        # La contraparte 2D se deriva de dims (ancho, alto) + mean_thickness_z —
        # no vive en frontal_ref, así que frontal_ref_key=None.
        frontal_ref_key=None, coherence_scale=0.10,
    ),
    MetricSpec(
        id="convexity_proxy", nombre="Convexidad (proxy 3D)",
        formula="1 - planarity (eigenvalores PCA)",
        nivel="P",
        modalidad=("3d_native",),
        invariante=True, adimensional=True, homologo="convexity_perim",
        unidad="adimensional",
        fuente_2d=None, fuente_3d="convexity_proxy",
        frontal_ref_key=None, coherence_scale=0.15,
    ),
    MetricSpec(
        id="aspect_ratio_resting", nombre="Relación de aspecto en reposo (3D)",
        formula="max(ancho, alto) / min(ancho, alto) en posicion de reposo PCA",
        nivel="P",
        modalidad=("3d_native",),
        invariante=True, adimensional=True, homologo="aspect_ratio",
        unidad="adimensional",
        fuente_2d=None, fuente_3d="aspect_ratio_resting",
        frontal_ref_key="aspect_ratio_2d", coherence_scale=0.35,
    ),
]

# ─────────────────────────────────────────────────────────────────────────────
# NIVEL 3D — Exclusivas 3D (sin homólogo 2D estable)
# ─────────────────────────────────────────────────────────────────────────────
_3D: list[MetricSpec] = [
    MetricSpec(
        id="volume", nombre="Volumen",
        formula="integral malla watertight",
        nivel="3D",
        modalidad=("3d_native",),
        invariante=False, adimensional=False, homologo=None,
        unidad="mm3",
        fuente_2d=None, fuente_3d="volume",
    ),
    MetricSpec(
        id="convex_hull_volume", nombre="Volumen del casco convexo",
        formula="volumen de la envolvente convexa",
        nivel="3D",
        modalidad=("3d_native",),
        invariante=False, adimensional=False, homologo=None,
        unidad="mm3",
        fuente_2d=None, fuente_3d="convex_hull_volume",
    ),
    MetricSpec(
        id="sphericity_wadell", nombre="Esfericidad de Wadell",
        formula="(pi^(1/3) * (6V)^(2/3)) / A_superficie",
        nivel="3D",
        modalidad=("3d_native",),
        invariante=True, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d=None, fuente_3d="sphericity_wadell",
    ),
    MetricSpec(
        id="compactness_3d", nombre="Compacidad 3D",
        formula="36*pi*V^2 / A^3",
        nivel="3D",
        modalidad=("3d_native",),
        invariante=True, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d=None, fuente_3d="compactness_3d",
    ),
    MetricSpec(
        id="anisotropy", nombre="Anisotropía (3D)",
        formula="linearity + planarity (eigenvalores PCA)",
        nivel="3D",
        modalidad=("3d_native",),
        invariante=True, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d=None, fuente_3d="anisotropy",
    ),
    MetricSpec(
        id="bifacial_homology_index", nombre="Índice de homología bifacial",
        formula="homologia cara A/B (rasgo MAO-plus)",
        nivel="3D",
        modalidad=("3d_native",),
        invariante=True, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d=None, fuente_3d="bifacial_homology_index",
    ),
    MetricSpec(
        id="transverse_area_cv", nombre="CV de área transversal",
        formula="std(area_secciones) / mean(area_secciones)",
        nivel="3D",
        modalidad=("3d_native",),
        invariante=True, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d=None, fuente_3d="transverse_area_cv",
    ),
    MetricSpec(
        id="transverse_thickness_cv", nombre="CV de espesor transversal",
        formula="std(espesor_secciones) / mean(espesor_secciones)",
        nivel="3D",
        modalidad=("3d_native",),
        invariante=True, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d=None, fuente_3d="transverse_thickness_cv",
    ),
]

# ─────────────────────────────────────────────────────────────────────────────
# NIVEL 2D — Exclusivas 2D (dependen del raster / píxel)
# ─────────────────────────────────────────────────────────────────────────────
_2D: list[MetricSpec] = [
    MetricSpec(
        id="glcm_contrast", nombre="Contraste GLCM",
        formula="GLCM textura — contraste (endpoint /api/texture, no /api/metrics)",
        nivel="2D",
        modalidad=("2d",),
        invariante=False, adimensional=True, homologo=None,
        unidad="adimensional",
        # GLCM vive en el endpoint separado /api/texture, respuesta anidada "glcm.contrast".
        # No es una clave plana de /api/metrics → fuente_2d usa prefijo "texture." como
        # señal para consumidores y tests de contrato.
        fuente_2d="texture.glcm.contrast", fuente_3d=None,
    ),
    MetricSpec(
        id="glcm_energy", nombre="Energía GLCM",
        formula="GLCM textura — energía (endpoint /api/texture)",
        nivel="2D",
        modalidad=("2d",),
        invariante=False, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d="texture.glcm.energy", fuente_3d=None,
    ),
    MetricSpec(
        id="glcm_entropy", nombre="Entropía GLCM",
        formula="GLCM textura — entropía (endpoint /api/texture)",
        nivel="2D",
        modalidad=("2d",),
        invariante=False, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d="texture.glcm.entropy", fuente_3d=None,
    ),
    MetricSpec(
        id="fractal_dimension", nombre="Dimensión fractal",
        formula="box-counting del contorno",
        nivel="2D",
        modalidad=("2d",),
        invariante=False, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d="fractal_dimension", fuente_3d=None,
    ),
    MetricSpec(
        id="convexity_defects", nombre="Defectos de convexidad",
        formula="concavidades en px respecto al hull",
        nivel="2D",
        modalidad=("2d",),
        invariante=False, adimensional=False, homologo=None,
        unidad="px",
        fuente_2d="convexity_defects", fuente_3d=None,
    ),
    MetricSpec(
        id="rugosidad_contorno", nombre="Rugosidad del contorno",
        formula="CV de longitudes de segmento",
        nivel="2D",
        modalidad=("2d",),
        invariante=False, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d="rugosidad_contorno", fuente_3d=None,
    ),
    MetricSpec(
        id="curvatura_local", nombre="Curvatura local Menger",
        formula="curvatura media de segmentos",
        nivel="2D",
        modalidad=("2d",),
        invariante=False, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d="curvatura_media", fuente_3d=None,
    ),
    MetricSpec(
        id="varianza_interna", nombre="Varianza interna",
        formula="varianza de intensidades de los pixeles internos",
        nivel="2D",
        modalidad=("2d",),
        invariante=False, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d="varianza_interna", fuente_3d=None,
    ),
    MetricSpec(
        id="entropia_superficie", nombre="Entropía de superficie",
        formula="entropia de la distribucion de intensidades internas",
        nivel="2D",
        modalidad=("2d",),
        invariante=False, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d="entropia_superficie", fuente_3d=None,
    ),
]

# ─────────────────────────────────────────────────────────────────────────────
# REGISTRO UNIFICADO
# ─────────────────────────────────────────────────────────────────────────────
REGISTRY: dict[str, MetricSpec] = {
    m.id: m for m in (_H + _P + _3D + _2D)
}


def nucleo_canonico() -> list[str]:
    """IDs del núcleo H: invariantes y adimensionales — comparables 1:1."""
    return [m.id for m in REGISTRY.values()
            if m.nivel == "H" and m.invariante and m.adimensional]


def pares_homologos() -> list[tuple[str, str]]:
    """(proxy_3d_id, homologo_2d_id) para la coherencia cross-dimensional."""
    return [(m.id, m.homologo) for m in REGISTRY.values()
            if m.nivel == "P" and m.homologo and m.homologo in REGISTRY]


def pares_homologos_coherencia() -> list[MetricSpec]:
    """Especificaciones P con coherence_scale definido — input del comparador."""
    return [m for m in REGISTRY.values()
            if m.nivel == "P" and m.coherence_scale is not None]
