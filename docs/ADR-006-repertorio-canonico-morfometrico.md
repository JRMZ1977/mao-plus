# ADR-006 — Repertorio canónico morfométrico 2D↔3D

- **Estado:** Propuesto (2026-06-12) · Fase 0 = este documento
- **Decisores:** JFRR (alcance) · Claude (diagnóstico y diseño)
- **Precedentes:** invariancia rotacional EFA + Procrustes/Feret 3D (commit `91e6307`) · `docs/ESPEC_METODO_HIBRIDO_OBJ3D_MAO.md` · `docs/DEVELOPER_GUIDE_SHARED_CONTRACT.md`
- **Ámbito:** backend Python (`python/modules/`). No toca UI, ni Tier 1 API, ni lógica de negocio. Aditivo y reversible.

---

## Contexto

MAO Plus calcula morfometría por dos vías que evolucionaron por separado:

- **2D** — `python/modules/metrics.py` (35 KB de indicadores de contorno) + `python/modules/efa.py` (descriptor elíptico de Fourier). Salida: `{"status","metricas": {...}, "scale_px_mm"}`.
- **3D** — `python/modules/obj3d_v2.py` (malla → secciones → proyecciones → índices MAO-plus).

El **puente ya existe**, pero **fragmentado e implícito**: hay al menos tres caminos de homologación solapados, y la comparación cross-dimensional compara claves **por strings literales hardcodeados** (p. ej. `frontal_ref["circularity_2d"]` vs `morphometry["circularity_proxy"]` en `_compute_crossdimensional_mao_coherence`). No existe un contrato único que declare **qué métrica es homóloga de cuál**, ni con qué grado de equivalencia.

### El puente actual (lo que ya está construido)

| Pieza | Archivo:línea | Qué hace |
|-------|---------------|----------|
| `_section_morphometric_metrics_2d` | `obj3d_v2.py:1129` | Corre el repertorio 2D sobre cortes transversales de la malla |
| `_section_efa` | `obj3d_v2.py:1265` | EFA sobre secciones (mismo descriptor que 2D) |
| `_projected_hull_metrics_2d` | `obj3d_v2.py:863` | Métricas 2D sobre la proyección canónica (envolvente) |
| `_make_morphometric_metrics` | `obj3d_v2.py:826` | Proxies 3D «compatibles con MAO 2D» (circularity_proxy, thickness_ratio…) |
| `_compute_oriented_mao2d_homologation` | `obj3d_v2.py:918` | Homóloga la lectura MAO-2D orientada |
| `_compute_crossdimensional_mao_coherence` | `obj3d_v2.py:2409` | Score [0,1] comparando circularidad/aspecto/espesor 2D vs proxies 3D |
| `flatten_3d_for_comparator` | `obj3d_v2.py:3767` | Aplana el 3D para el comparador 2D |
| `_procrustes_disparity_2d` | `obj3d_v2.py:2704` | Disparidad de forma entre contornos (front/back, sección/proyección) |

**Conclusión del diagnóstico:** el tráfico 2D↔3D ya circula. Lo que falta es **el contrato** — un repertorio canónico único que ambas vías declaren y que los consumidores (comparador, coherencia, tabla) lean en vez de hardcodear nombres. Este ADR es **ortogonal** a la maquinaria de cálculo: no cambia ninguna fórmula; (1) define el repertorio canónico y (2) lo materializa en un registro.

---

## Invariante rector — «solo adimensionales en el núcleo»

Una métrica solo pertenece al **núcleo canónico** (nivel H, abajo) si es **invariante** ante las tres transformaciones de pose y **adimensional** (o normalizada a escala):

| Transformación | Exigencia |
|----------------|-----------|
| **Traslación** | el valor no cambia al mover el objeto |
| **Rotación** (espacial ψ) | el valor no cambia al rotar el objeto/contorno |
| **Escala** | el valor no cambia con el tamaño (px, mm, o resolución de malla) |

Esta no es una regla nueva: es la **postura que el proyecto ya adoptó**. El commit `91e6307` corrigió justamente que la normalización EFA olvidaba la rotación espacial ψ (`efa.py`, `_normalize_coeffs`), y endureció Procrustes/Feret-3D para que la comparación de forma fuera invariante. El repertorio canónico **codifica** ese principio en vez de re-descubrirlo por métrica.

**Corolario operativo:**

- `area` (px² o mm²), `perimeter`, `feret_max` (longitud), `volume`, `mean_thickness_z` → **NO** son canónicos. Dependen de tamaño/escala. Viven en la capa de su modalidad como dimensiones brutas, útiles pero no comparables entre piezas ni entre dimensiones sin normalizar.
- `circularity = 4πA/P²`, `solidity = A/A_hull`, `elongation`, `aspect_ratio`, `convexity_perim = P_hull/P_real`, `sphericity_wadell`, `compactness_3d`, **coeficientes EFA normalizados**, `bifacial_homology_index` → **SÍ** son canónicos. Adimensionales e invariantes.
- Regla de oro: *si no es invariante y adimensional, no entra al núcleo H — se queda en la capa de su modalidad.*

---

## Los 4 niveles de homología (el repertorio)

El repertorio **no** es «la lista 2D fusionada con la lista 3D». Clasifica cada métrica por su **relación de homología** entre dimensiones:

### Nivel H — Homólogas directas (núcleo canónico)

Misma fórmula adimensional, calculada **idéntica** en 2D y sobre secciones/proyecciones 3D. Son el corazón comparable.

| `id` canónico | Fórmula | Clave 2D (`metrics.py`) | Origen 3D | Notas |
|---------------|---------|-------------------------|-----------|-------|
| `circularity` | 4πA / P² | `circularity` / `circularity_hull` (`metrics.py:605`) | `_section_*` / `_projected_hull_metrics_2d` | usar siempre la versión hull |
| `solidity` | A / A_hull | `solidity` (`metrics.py:623`) | secciones / proyección | |
| `convexity_perim` | P_hull / P_real | `convexity_perim` (sección) (`obj3d_v2.py:1254`) | secciones | Guía §III |
| `elongation` | f(eigenvalores inercia) | `elongation` (`metrics.py:655`) | secciones | invariante por construcción |
| `aspect_ratio` | eje_mayor / eje_menor | `aspect_ratio_tight` (`metrics.py:600`) | secciones / reposo | |
| `contour_complexity_index` | P_real / (2π·r_círculo_equiv) | `contour_complexity_index` (`metrics.py:637`) | secciones | |
| `feret_ratio` | feret_min / feret_max | `feret_ratio` (`metrics.py:308`) | secciones | el ratio es adimensional; `feret_max/min` brutos NO |
| `efa_coefficients` | EFD normalizado (a,b,c,d)×N armónicos | `efa.coefficients` (`efa.py:323`) | `_section_efa` | invariante tras ψ (commit `91e6307`) |
| `excentricidad` | f(eigenvalores) | `excentricidad` (`metrics.py:170`) | secciones | |
| `simetria_bilateral` | índice [0,1] | `simetria_bilateral` (`metrics.py:218`) | secciones | |

### Nivel P — Proxy / análogo (homología aproximada)

Métrica **3D-nativa con homólogo 2D aproximado** — relacionada, no idéntica. Hoy ya viven en `_make_morphometric_metrics` y se comparan en `_compute_crossdimensional_mao_coherence`.

| `id` 3D | Definición | Homólogo 2D | Comparador actual |
|---------|------------|-------------|-------------------|
| `circularity_proxy` | esfericidad PCA = λ₃/λ₁ (`obj3d_v2.py:844`) | `circularity` (frontal) | `shape_consistency` (`obj3d_v2.py:2458`) |
| `thickness_ratio` | ext_z / max(ext_x,ext_y) (`obj3d_v2.py:840`) | `aspect_ratio` / espesor 2D | `thickness_consistency` (`obj3d_v2.py:2467`) |
| `convexity_proxy` | 1 − planarity (`obj3d_v2.py:846`) | `convexity` (`metrics.py:963`) | — (candidato a añadir) |
| `aspect_ratio_resting` | mayor/menor en reposo (`obj3d_v2.py:2474`) | `aspect_ratio_2d` frontal | `aspect_consistency` (`obj3d_v2.py:2471`) |

> El registro debe marcar el `homologo` explícitamente y el `nivel="P"`, para que la coherencia cross-dimensional deje de comparar por strings literales.

### Nivel 3D — Exclusivas 3D (sin homólogo 2D)

| `id` | Definición | Clave (`obj3d_v2.py`) |
|------|------------|-----------------------|
| `volume` | volumen de malla watertight | `volume` |
| `convex_hull_volume` | volumen de la envolvente | `convex_hull_volume` (`:686/720`) |
| `sphericity_wadell` | (π^⅓·(6V)^⅔)/A_superficie | `sphericity_wadell` (`:689/736`) |
| `compactness_3d` | 36π·V²/A³ | `compactness_3d` (`:690/743`) |
| `anisotropy` | linearity + planarity | `anisotropy` (`:841`) |
| `bifacial_homology_index` | homología cara A/B (rasgo MAO-plus) | `bifacial_homology_index` (`:2307`) |
| `transverse_area_cv` · `transverse_thickness_cv` | estabilidad longitudinal de cortes | `:2310-2311` |

> `volume`, `mean_thickness_z`, `convex_hull_volume` son **dimensionales**: van en la capa 3D como magnitudes brutas, no en el núcleo. Sus formas adimensionales (`sphericity_wadell`, `compactness_3d`) **sí** son del registro.

### Nivel 2D — Exclusivas 2D (dependen del raster/píxel)

| `id` | Definición | Clave (`metrics.py`) |
|------|------------|----------------------|
| `glcm_*` | textura de superficie (contrast, energy, entropy…) | `glcm` (`:1118`) |
| `fractal_dimension` | dimensión fractal box-counting del contorno | `_fractal_dimension` (`:434`) |
| `convexity_defects` | concavidades en px respecto al hull | `convexity_defects` (`:1040`) |
| `curvatura_*`, `rugosidad`, `textura_superficie` | rasgos de borde/raster | `:261/284/421` |

> No tienen homólogo 3D estable porque dependen de muestreo de píxel; quedan como métricas de modalidad. (Un futuro ADR podría definir su análogo sobre la malla, pero queda **fuera** de este alcance.)

---

## Esquema del registro

**Una única fuente de verdad** — `python/modules/morphometric_registry.py` (o `morphometric_registry.json` cargado por ambos pipelines). Cada métrica se declara **una vez**:

```python
# python/modules/morphometric_registry.py
# Repertorio canónico morfométrico 2D↔3D (ADR-006).
# Única fuente de verdad: ningún consumidor (comparador, coherencia,
# tabla-metricas) debe hardcodear nombres de clave; todos leen de aquí.

from dataclasses import dataclass

@dataclass(frozen=True)
class MetricSpec:
    id: str                      # id canónico estable (snake_case)
    nombre: str                  # etiqueta legible (UI/tabla)
    formula: str                 # expresión de referencia (documental)
    nivel: str                   # "H" | "P" | "3D" | "2D"
    modalidad: tuple             # ("2d","3d_section","3d_projection","3d_native")
    invariante: bool             # traslación + rotación + escala
    adimensional: bool           # normalizada a escala
    homologo: "str | None"       # id del par (solo nivel "P")
    unidad: str                  # "adimensional" | "mm" | "mm2" | "grados" | ...
    fuente_2d: "str | None"      # clave en metrics.py/efa.py
    fuente_3d: "str | None"      # clave en obj3d_v2.py

REGISTRY: dict[str, MetricSpec] = {
    "circularity": MetricSpec(
        id="circularity", nombre="Circularidad",
        formula="4*pi*A / P^2", nivel="H",
        modalidad=("2d", "3d_section", "3d_projection"),
        invariante=True, adimensional=True, homologo=None,
        unidad="adimensional",
        fuente_2d="circularity", fuente_3d=None,  # 3D la recalcula vía _section_*
    ),
    "circularity_proxy": MetricSpec(
        id="circularity_proxy", nombre="Circularidad (proxy PCA)",
        formula="lambda_3 / lambda_1 (esfericidad PCA)", nivel="P",
        modalidad=("3d_native",),
        invariante=True, adimensional=True, homologo="circularity",
        unidad="adimensional",
        fuente_2d=None, fuente_3d="circularity_proxy",
    ),
    "volume": MetricSpec(
        id="volume", nombre="Volumen",
        formula="∫ malla watertight", nivel="3D",
        modalidad=("3d_native",),
        invariante=False, adimensional=False, homologo=None,  # dimensional ⇒ no núcleo
        unidad="mm3",
        fuente_2d=None, fuente_3d="volume",
    ),
    # ... resto de las cuatro tablas de arriba
}

def nucleo_canonico() -> list[str]:
    """IDs del núcleo H: invariantes y adimensionales — los únicos comparables 1:1."""
    return [m.id for m in REGISTRY.values()
            if m.nivel == "H" and m.invariante and m.adimensional]

def pares_homologos() -> list[tuple[str, str]]:
    """(proxy_3d, homologo_2d) para la coherencia cross-dimensional."""
    return [(m.id, m.homologo) for m in REGISTRY.values()
            if m.nivel == "P" and m.homologo]
```

**Validación arquitectónica** (un test asegura que el registro no miente):

- todo `nivel="H"` cumple `invariante and adimensional` (el invariante rector);
- todo `nivel="P"` tiene `homologo` y ese `homologo` existe en el registro;
- `fuente_2d`/`fuente_3d` apuntan a claves que el pipeline correspondiente realmente emite (test de contrato contra una salida real).

---

## Plan por fases (incremental, reversible, aditivo)

| Fase | Alcance | Riesgo | Verificación |
|------|---------|--------|--------------|
| **0 — Documento** | Este ADR. | Nulo | — |
| **1 — Registro** | `morphometric_registry.py` con niveles H y P completos (las dos primeras tablas), `nucleo_canonico()`, `pares_homologos()`. **No** se conecta a nada todavía. | Bajo | `pytest tests/test_morphometric_registry.py` (invariante rector + integridad de homólogos) |
| **2 — Contrato** | Completar niveles 3D y 2D. Test de contrato: cada `fuente_2d`/`fuente_3d` existe en una salida real de `metrics.py` / `obj3d_v2.py`. | Bajo | tests de contrato contra fixtures reales |
| **3 — Consumidores** | Refactor de `_compute_crossdimensional_mao_coherence` para leer `pares_homologos()` en vez de strings literales. Idem comparador/`tabla-metricas`. | Medio | suite completa (`pytest tests/`) sin regresión numérica |

Las fases 1-2 son **puramente aditivas** (un módulo nuevo + tests; nada existente cambia). La fase 3 es el único refactor de lógica viva y se hace métrica a métrica, validando que el score de coherencia no cambie de valor.

---

## Restricciones (reglas del proyecto)

- API Tier 1 intacta; sin cambios en `mao-ia.js`, `collection.js`.
- **No se modifica ninguna fórmula** de `metrics.py`, `efa.py` ni `obj3d_v2.py`: el registro **describe** lo que ya se calcula; no recalcula.
- Métricas dimensionales (`area`, `volume`, `feret_max`, `mean_thickness_z`…) **no** entran al núcleo H — el invariante rector lo prohíbe; se registran con `nivel="3D"/"2D"` y `adimensional=False`.
- Máquinas de estado de alto riesgo (Detección, Selección Manual, Modal de Perforación) no se tocan.
- Validación = `pytest tests/` sin regresión + tests nuevos del registro. Los cambios son backend puro: **no** requieren runtime visual en Electron.

## Consecuencias

- ✅ Una sola fuente de verdad: comparador, coherencia cross-dimensional y tabla dejan de hardcodear nombres de clave.
- ✅ El invariante rector queda **codificado y testeado**, no como convención implícita — alineado con el endurecimiento EFA/Procrustes del commit `91e6307`.
- ✅ Repertorio explícito de qué es comparable 1:1 (H), qué es aproximado (P) y qué es exclusivo de cada dimensión — base para futura estadística inter-pieza.
- ✅ La cuarta pestaña (Resultados) y el comparador heredan un contrato declarado en vez de descubrirlo leyendo tres funciones.
- ✅ Aditivo y reversible: borrar el módulo y revertir la fase 3 restaura el estado actual.
- ⚠ La fase 3 toca lógica viva (`_compute_crossdimensional_mao_coherence`): exige verificar que el score de coherencia es **numéricamente idéntico** antes/después del refactor (test de regresión por valor).
- ⚠ El registro debe mantenerse sincronizado: si un pipeline añade/renombra una clave, el test de contrato (fase 2) falla — esa es la red de seguridad, no un efecto colateral.
