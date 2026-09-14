/**
 * METRIC PRESENTER — Fuente ÚNICA de los rótulos de clasificación morfométrica (frontend).
 * ==========================================================================================
 * Fix estructural (ADR-016 / auditoría de coherencia 2026-07-02): antes estas escaleras de
 * clasificación estaban DUPLICADAS en 3 archivos JS (`morphometric-metrics.js`,
 * `metrics-orchestrator.js`, `analysis-core.js`) — cada superficie de export tenía su copia y
 * cualquier cambio (p. ej. neutralizar «fracturado/erosionado») había que aplicarlo N veces, con
 * riesgo de deriva (umbrales o rótulos divergentes entre PDF, CSV y panel).
 *
 * Este módulo centraliza esos rótulos. Los 3 sitios los consumen desde aquí. El backend
 * (`python/modules/metrics.py`) mantiene su copia canónica en Python con el MISMO texto y umbrales
 * (consolidación cross-lenguaje completa no es práctica; se mantiene paridad textual).
 *
 * Invariantes:
 *   · Rótulos NEUTRALES: describen la medición, NO diagnostican daño/condición (decisión JFRR
 *     2026-07-02: el motor mide fiel; la interpretación taphonómica es del investigador).
 *   · Umbrales idénticos a los previos (behavior-preserving): rugosidad 0.05/0.15/0.30/0.50 ·
 *     curvatura 0.005/0.02/0.05/0.10.
 *
 * Sin dependencias (igual que category-manifest.js / morphometric_registry.py).
 * ==========================================================================================
 */

/** Rugosidad del contorno = CV de longitudes de segmento. Rótulo neutral (no diagnostica daño). */
export function clasificarRugosidad(rug) {
  if (rug < 0.05) return 'Muy suave (pulido/regular)';
  if (rug < 0.15) return 'Suave (ligera irregularidad)';
  if (rug < 0.30) return 'Moderado (irregular)';
  if (rug < 0.50) return 'Rugoso (muy irregular)';
  return 'Muy rugoso (contorno de alta variabilidad)';
}

/** Suavidad por desviación de curvatura local. Rótulo neutral (no diagnostica quiebre/daño). */
export function clasificarCurvatura(desviacionCurvatura) {
  if (desviacionCurvatura < 0.005) return 'Muy suave (circular/elíptico)';
  if (desviacionCurvatura < 0.02)  return 'Suave (bordes redondeados)';
  if (desviacionCurvatura < 0.05)  return 'Moderado (algunas inflexiones)';
  if (desviacionCurvatura < 0.10)  return 'Irregular (múltiples inflexiones)';
  return 'Muy variable (alta variación de curvatura local)';
}

// ==========================================================================================
// DERIVADOS DE PRESENTACIÓN (Stage B) — cómputos que estaban DUPLICADOS inline en las 3
// superficies de render (PDF tabla-metricas-completa, CSV project-manager, CSV analysis-core).
// Fuente única para que un ajuste (p. ej. la fórmula de conversión px→mm) no haya que replicarlo.
// ==========================================================================================

/**
 * Devuelve un conversor px→mm para dimensiones de bounding box (ADR-016 #1).
 * El path IA a veces deja width/height/bounding_* en px aunque área/Feret estén en mm.
 * Convierte con el factor √(area_mm/area_px) SOLO si el valor empequeñece al Feret (magnitud mm
 * garantizada); en caso contrario lo deja igual (objeto sin escala → px legítimo).
 */
export function conversorBBaMm(metricas) {
  const aMM = parseFloat(metricas.hull_area || metricas.area) || 0;
  const aPX = parseFloat(metricas.area_px) || 0;
  const ft  = parseFloat(metricas.feret_max) || 0;
  const f = (aMM > 0 && aPX > 0 && aMM < aPX) ? Math.sqrt(aMM / aPX) : 0;
  return (valor) => {
    const n = parseFloat(valor) || 0;
    return (f > 0 && ft > 0 && n > ft * 3) ? n * f : n;
  };
}

/**
 * Derivados del convex hull que el backend no siempre emite (ADR-016 #4/#7):
 *  - circularidad = 4π·A/P² (invariante a escala → calculado en px) si falta hull_circularity.
 *  - aspectRatio  = AR tight como sustituto.
 *  - difAreaPct / difPerimetroPct = pérdida por fragmentación (clave canónica) si faltan.
 */
export function hullDerivados(metricas) {
  const areaPx  = parseFloat(metricas.hull_area_px || metricas.convex_hull_area || metricas.area_px) || 0;
  const perimPx = parseFloat(metricas.hull_perimeter_px || metricas.convex_hull_perimeter || metricas.perimeter_px) || 0;
  let circ = parseFloat(metricas.hull_circularity) || 0;
  if (!(circ > 0) && areaPx > 0 && perimPx > 0) circ = (4 * Math.PI * areaPx) / (perimPx * perimPx);
  const ar = parseFloat(metricas.hull_aspect_ratio) || parseFloat(metricas.aspect_ratio_tight) || parseFloat(metricas.aspect_ratio) || 0;
  const dA = parseFloat(metricas.hull_area_difference_percent);
  const dP = parseFloat(metricas.hull_perimeter_difference_percent);
  return {
    circularidad: circ,
    aspectRatio: ar,
    difAreaPct: Number.isFinite(dA) ? dA : (parseFloat(metricas.perdida_area_fragmentacion_percent) || 0),
    difPerimetroPct: Number.isFinite(dP) ? dP : (parseFloat(metricas.perdida_perimetro_fragmentacion_percent) || 0),
  };
}
