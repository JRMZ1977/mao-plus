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

/**
 * Solidez = A_real / A_hull. Rótulo NEUTRAL: describe cuánto de su envolvente
 * convexa ocupa la pieza, NO diagnostica fractura.
 *
 * ADR-018 · los rótulos anteriores («Moderadamente fragmentado», «Muy
 * fragmentado», «Extremadamente fragmentado») emitían un juicio tafonómico que
 * la medición no sostiene: la solidez baja tanto por una fractura como por una
 * morfología naturalmente cóncava —una lasca con escotadura sale «fragmentada»
 * sin estarlo— y contradecía a «XII. Estado de Conservación», que sí mide
 * fragmentación a partir del área perdida. Es la misma corrección que ADR-016 #6
 * aplicó a la rugosidad; la solidez había quedado fuera de aquella pasada.
 *
 * Umbrales SIN CAMBIOS (0.95 / 0.85 / 0.70 / 0.50): solo cambia el texto.
 */
export function clasificarSolidez(solidez) {
  if (solidez >= 0.95) return 'Sin concavidades (ocupa su envolvente)';
  if (solidez >= 0.85) return 'Concavidades leves';
  if (solidez >= 0.70) return 'Concavidades moderadas';
  if (solidez >= 0.50) return 'Concavidades marcadas';
  return 'Contorno muy entrante (área muy inferior a su envolvente)';
}

// ==========================================================================================
// DERIVADOS DE PRESENTACIÓN (Stage B) — cómputos que estaban DUPLICADOS inline en las 3
// superficies de render (PDF tabla-metricas-completa, CSV project-manager, CSV analysis-core).
// Fuente única para que un ajuste (p. ej. la fórmula de conversión px→mm) no haya que replicarlo.
// ==========================================================================================

/**
 * Área NETA y sus acompañantes (ADR-018).
 *
 * El motor calcula `area_neta`, `perimetro_neto` y `porosidad` cuando la pieza
 * tiene P/H confirmados, y los persiste — pero NINGUNA superficie de lectura los
 * publicaba: ni el CSV monofacial ni la Tabla Completa. El lector veía sólo
 * `area` (bruta) junto a un «Área Total Efectiva Perforaciones» en otra sección,
 * y tenía que restar a mano sin saber si esa resta era la operación correcta.
 *
 * Invariante de ADR-009 que esto hace visible: **el área neta sólo descuenta P/H
 * CONFIRMADOS**. Un candidato detectado y no confirmado no altera el área, así
 * que bruta y neta coinciden — y eso hay que poder distinguirlo de «esta pieza no
 * tiene huecos», que es otra cosa.
 *
 * El área neta vive en DOS sitios según la ruta que la escribió: `metricas.area_neta`
 * (sincronización de P/H, lo que leen CSV, Tabla y PDF) y `obj.area_neta` (ruta de
 * exportación, lo que leía el panel). Se aceptan ambos —primero el de métricas—
 * porque una superficie que consulte sólo uno muestra «sin P/H» en piezas que sí
 * los tienen, según por dónde se hubieran guardado.
 *
 * @param {Object} metricas  dict de métricas.
 * @param {Object} [obj]     objeto de análisis, si la superficie lo tiene a mano.
 * @returns {{bruta:number, neta:number, calculada:boolean, descontado:number,
 *            perimetroNeto:?number, porosidad:?number, unidad:string}}
 *   `calculada` es false cuando el motor nunca computó un área neta (sin P/H
 *   confirmados). En ese caso `neta === bruta`, que es cierto, no un relleno.
 */
export function areaNetaDerivados(metricas, obj) {
  const m = metricas || {};
  const o = obj || {};
  const bruta = parseFloat(m.area) || 0;
  const cruda = Number.isFinite(parseFloat(m.area_neta))
    ? parseFloat(m.area_neta)
    : parseFloat(o.area_neta);
  // Se acepta sólo si es coherente: un área neta mayor que la bruta significa
  // que viene de otra escala o de un cálculo desfasado, y publicarla engañaría.
  const calculada = Number.isFinite(cruda) && cruda >= 0 && cruda <= bruta;
  const neta = calculada ? cruda : bruta;
  const periNeto = parseFloat(m.perimetro_neto);
  const poros = parseFloat(m.porosidad);
  return {
    bruta,
    neta,
    calculada,
    descontado: Math.max(0, bruta - neta),
    perimetroNeto: Number.isFinite(periNeto) ? periNeto : null,
    porosidad: Number.isFinite(poros) ? poros : null,
    unidad: m.area_unit || 'mm²',
  };
}

/**
 * Nota de una línea sobre el área neta, para acompañar al valor allí donde se
 * publique. Sin ella, «Área neta = Área» se lee como redundancia en vez de como
 * la afirmación que es: no hay P/H confirmados que descontar.
 */
export function notaAreaNeta(metricas, obj) {
  const d = areaNetaDerivados(metricas, obj);
  if (!d.calculada) {
    // Un `area_neta` presente pero rechazado NO es lo mismo que no tenerlo: hubo
    // un cálculo y salió incoherente (otra escala, o desfasado). Decir «sin P/H»
    // en ese caso ocultaría el problema en vez de señalarlo.
    const _m = metricas || {}, _o = obj || {};
    const cruda = Number.isFinite(parseFloat(_m.area_neta))
      ? parseFloat(_m.area_neta)
      : parseFloat(_o.area_neta);
    if (Number.isFinite(cruda)) {
      return 'Área neta almacenada incoherente con la bruta — se muestra la bruta';
    }
    return 'Sin P/H confirmados: el área neta coincide con la bruta';
  }
  if (d.descontado <= 0) return 'P/H confirmados sin área descontable';
  return `Descuenta ${d.descontado.toFixed(3)} ${d.unidad} de P/H confirmados`;
}

/**
 * Devuelve un conversor px→mm para dimensiones de bounding box (ADR-016 #1).
 * La ruta de detección asistida a veces deja width/height/bounding_* en px aunque área/Feret estén en mm.
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
 * Completitud por plantilla CONFIRMADA (ADR-017 F3) — lector ÚNICO para toda superficie.
 *
 * Sólo lee `metricas.plantilla_*`, que escribe la ratificación humana
 * (`mao-analysis-organizer.js::sincronizarMetricasPlantilla`); el candidato vive en
 * `obj.plantillaCandidata` y no llega nunca aquí (invariante ADR-009: la tabla es
 * registro, no conjetura). Sin confirmación → `null`, que cada superficie rinde como
 * «Sin evaluar»: jamás un 100 % fabricado (ADR-017 F0).
 *
 * @returns {{tipo:string, completitud:number}|null}
 */
export function completitudPlantilla(metricas) {
  const m = metricas || {};
  if (m.plantilla_completitud === null || m.plantilla_completitud === undefined || m.plantilla_completitud === '') return null;
  const pct = Number(m.plantilla_completitud);
  if (!Number.isFinite(pct)) return null;
  return { tipo: m.plantilla_tipo || 'plantilla', completitud: pct };
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
    difAreaPct: Number.isFinite(dA) ? dA : (parseFloat(metricas.concavidad_area_percent ?? metricas.perdida_area_fragmentacion_percent) || 0),
    difPerimetroPct: Number.isFinite(dP) ? dP : (parseFloat(metricas.concavidad_perimetro_percent) || 0),
  };
}
