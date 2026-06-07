/**
 * bifacial-analysis.js — Análisis comparativo bifacial
 * ============================================================================
 * Funciones de matemáticas puras para el análisis de simetría especular entre
 * la Cara A (anverso) y la Cara B (reverso) de objetos líticos bifaciales.
 * Sin dependencias de DOM ni módulos externos.
 *
 * Funciones exportadas:
 *   - aplicarReflejoEspecular(punto, centroide)
 *   - calcularAngulo(vector)
 *   - normalizarAngulo(angulo)
 *   - calcularComparacionBifacial(caraA, caraB)
 *   - analizarDistribucionPH(caraA, caraB, centroideA, centroideB)
 */

/**
 * Aplicar transformación de reflejo especular (rotación 180° en abscisa)
 * La Cara B es el reverso de la Cara A, por lo tanto está reflejada espacialmente
 */
export function aplicarReflejoEspecular(punto, centroide) {
  // Reflejo horizontal respecto al centroide: x' = 2*cx - x, y' = y
  return [
    2 * centroide[0] - punto[0],
    punto[1]
  ];
}

/**
 * Calcular ángulo de un vector respecto al eje X
 */
export function calcularAngulo(vector) {
  return Math.atan2(vector[1], vector[0]) * (180 / Math.PI);
}

/**
 * Normalizar ángulo a rango [-180, 180]
 */
export function normalizarAngulo(angulo) {
  while (angulo > 180) angulo -= 360;
  while (angulo < -180) angulo += 360;
  return angulo;
}

/**
 * Calcular métricas de comparación bifacial
 * PUNTO ANCLA: Centroide del Convex Hull como referencia común
 * REFLEJO ESPECULAR: Cara B es el reverso reflejado de Cara A (rotación 180°)
 */
export function calcularComparacionBifacial(caraA, caraB) {
  // --------------------------------------------------------------------------
  // Helpers Sección XIII (CI/CMS)
  // --------------------------------------------------------------------------
  const similitudPar = (a, b) => {
    const va = Number(a) || 0;
    const vb = Number(b) || 0;
    const media = (va + vb) / 2;
    if (Math.abs(media) < 1e-12) return 1;
    return Math.max(0, 1 - Math.abs(va - vb) / Math.abs(media));
  };

  const promedioPonderado = (defs) => {
    let suma = 0;
    let pesos = 0;
    let usados = 0;
    const detalles = {};

    defs.forEach(({ aliases, peso }) => {
      const getVal = (m, names) => {
        for (const n of names) {
          const v = m?.[n];
          if (v !== undefined && v !== null && !Number.isNaN(Number(v))) return Number(v);
        }
        return 0;
      };

      const a = getVal(caraA.metricas || {}, aliases);
      const b = getVal(caraB.metricas || {}, aliases);
      if (a === 0 && b === 0) return; // faltante en ambas caras

      const s = similitudPar(a, b);
      detalles[aliases[0]] = Number(s.toFixed(4));
      suma += s * peso;
      pesos += peso;
      usados += 1;
    });

    if (usados < 2 || pesos <= 0) return { indice: null, detalles };
    return { indice: Math.max(0, Math.min(1, suma / pesos)), detalles };
  };

  // ============================================================================
  // 1️⃣ ANÁLISIS DE CENTROIDES (Punto Ancla Común)
  // ============================================================================

  // Extraer centroides del convex hull (punto de referencia más estable)
  const centroideA = caraA.metricas.centroide || [0, 0];
  const centroideB = caraB.metricas.centroide || [0, 0];

  // Calcular distancia entre centroides (desplazamiento espacial)
  const desplazamientoCentroides = Math.sqrt(
    Math.pow(centroideA[0] - centroideB[0], 2) +
    Math.pow(centroideA[1] - centroideB[1], 2)
  );

  // Normalizar desplazamiento respecto al tamaño del objeto
  const areaPromedio = (caraA.metricas.area + caraB.metricas.area) / 2;
  const radioEquivalente = Math.sqrt(areaPromedio / Math.PI);
  const desplazamientoNormalizado = desplazamientoCentroides / radioEquivalente;

  // ============================================================================
  // 2️⃣ ANÁLISIS DE REFLEJO ESPECULAR (Anverso ↔ Reverso)
  // ============================================================================

  // La Cara B es el reverso, por lo tanto está reflejada 180° en la abscisa
  // Comparamos si los ejes y distribución radial respetan esta simetría especular

  // Ángulo del eje mayor de cada cara (respecto al eje X)
  const anguloEjeMayorA = caraA.metricas.angulo_eje_mayor || 0;
  const anguloEjeMayorB = caraB.metricas.angulo_eje_mayor || 0;

  // Para reflejo horizontal, el ángulo reflejado es: θ' = -θ
  // Diferencia angular esperada por reflejo
  const anguloReflejadoEsperado = -anguloEjeMayorA;
  const diferenciaAngularConReflejo = Math.abs(normalizarAngulo(anguloEjeMayorB - anguloReflejadoEsperado));

  // Simetría de orientación (1.0 = perfecta simetría especular)
  // Si la diferencia es < 10°, es excelente; < 30° es buena; > 30° es pobre
  const simetriaOrientacion = Math.max(0, 1 - (diferenciaAngularConReflejo / 90));
  const calidadReflejoAngular = diferenciaAngularConReflejo < 10 ? 'Excelente' :
                                (diferenciaAngularConReflejo < 30 ? 'Buena' : 'Pobre');

  // Análisis de radios (máximo y mínimo desde centroide)
  // En un reflejo perfecto, los radios deberían ser idénticos
  const radioMaxA = caraA.metricas.radio_maximo || 0;
  const radioMaxB = caraB.metricas.radio_maximo || 0;
  const radioMinA = caraA.metricas.radio_minimo || 0;
  const radioMinB = caraB.metricas.radio_minimo || 0;

  const simetriaRadioMax = 1 - Math.abs(radioMaxA - radioMaxB) / Math.max(radioMaxA, radioMaxB);
  const simetriaRadioMin = 1 - Math.abs(radioMinA - radioMinB) / Math.max(radioMinA, radioMinB);

  // ============================================================================
  // 3️⃣ ANÁLISIS DE FORMA Y DIMENSIONES
  // ============================================================================

  const comparacion = {
    calculadoEn: new Date().toISOString(),

    // 🎯 CENTROIDES Y ALINEACIÓN ESPACIAL
    centroideA: centroideA,
    centroideB: centroideB,
    desplazamientoCentroides: desplazamientoCentroides,
    desplazamientoNormalizado: desplazamientoNormalizado,
    alineacionEspacial: desplazamientoNormalizado < 0.1 ? 'Excelente' :
                       (desplazamientoNormalizado < 0.3 ? 'Buena' : 'Pobre'),

    // 🔄 REFLEJO ESPECULAR (Anverso ↔ Reverso)
    anguloEjeMayorA: anguloEjeMayorA,
    anguloEjeMayorB: anguloEjeMayorB,
    anguloReflejadoEsperado: anguloReflejadoEsperado,
    diferenciaAngularConReflejo: diferenciaAngularConReflejo,
    simetriaOrientacion: simetriaOrientacion,
    calidadReflejoAngular: calidadReflejoAngular,
    simetriaRadioMaximo: simetriaRadioMax,
    simetriaRadioMinimo: simetriaRadioMin,
    esReflejoEspecular: diferenciaAngularConReflejo < 30 && simetriaRadioMax > 0.8 && simetriaRadioMin > 0.8,

    // Diferencias absolutas
    diferenciaArea: Math.abs(caraA.metricas.area - caraB.metricas.area),
    diferenciaPerimetro: Math.abs(caraA.metricas.perimetro - caraB.metricas.perimetro),

    // Ratios (mayor/menor)
    ratioArea: Math.max(caraA.metricas.area, caraB.metricas.area) /
               Math.min(caraA.metricas.area, caraB.metricas.area),
    ratioPerimetro: Math.max(caraA.metricas.perimetro, caraB.metricas.perimetro) /
                    Math.min(caraA.metricas.perimetro, caraB.metricas.perimetro),

    // Simetría (1 = perfecta simetría)
    simetriaArea: 1 - (Math.abs(caraA.metricas.area - caraB.metricas.area) /
                       Math.max(caraA.metricas.area, caraB.metricas.area)),
    simetriaPerimetro: 1 - (Math.abs(caraA.metricas.perimetro - caraB.metricas.perimetro) /
                            Math.max(caraA.metricas.perimetro, caraB.metricas.perimetro)),

    // Similitud de forma (promedio de métricas)
    // Nota: métricas morfológicas se almacenan en inglés (circularity, convexity, solidity, elongation)
    similitudCircularidad: 1 - Math.abs((parseFloat(caraA.metricas.circularity||caraA.metricas.circularidad)||0) - (parseFloat(caraB.metricas.circularity||caraB.metricas.circularidad)||0)),
    similitudConvexidad: 1 - Math.abs((parseFloat(caraA.metricas.convexity||caraA.metricas.convexidad)||0) - (parseFloat(caraB.metricas.convexity||caraB.metricas.convexidad)||0)),
    similitudSolidez: 1 - Math.abs((parseFloat(caraA.metricas.solidity||caraA.metricas.solidez)||0) - (parseFloat(caraB.metricas.solidity||caraB.metricas.solidez)||0)),
    similitudElongacion: 1 - Math.abs((parseFloat(caraA.metricas.elongation||caraA.metricas.elongacion)||0) - (parseFloat(caraB.metricas.elongation||caraB.metricas.elongacion)||0)),

    // ============================================================================
    // 3️⃣ ANÁLISIS DE PERFORACIONES/HORADACIONES RESPECTO AL CENTROIDE
    // ============================================================================

    // Clasificaciones
    mismaClasificacion: caraA.clasificacionForma === caraB.clasificacionForma,
    clasificacionA: caraA.clasificacionForma,
    clasificacionB: caraB.clasificacionForma,

    // Perforaciones y horadaciones
    perforacionesA: caraA.perforaciones.length,
    perforacionesB: caraB.perforaciones.length,
    horadacionesA: caraA.horadaciones.length,
    horadacionesB: caraB.horadaciones.length,

    totalPH_A: caraA.perforaciones.length + caraA.horadaciones.length,
    totalPH_B: caraB.perforaciones.length + caraB.horadaciones.length
  };

  // 🆕 Análisis de distribución de P/H respecto al centroide (con reflejo especular)
  const distribucionPH = analizarDistribucionPH(caraA, caraB, centroideA, centroideB);
  comparacion.distribucionPH = distribucionPH;

  // ============================================================================
  // 4️⃣ ÍNDICE DE SIMETRÍA BIFACIAL GENERAL
  // ============================================================================

  // Índice mejorado que considera:
  // - Simetría de forma (área, circularidad, convexidad)
  // - Alineación espacial (centroides)
  // - Reflejo especular (orientación de ejes)
  // - Distribución especular de P/H

  comparacion.indiceSimetriaGeneral = (
    comparacion.simetriaArea * 0.25 +                              // Tamaño
    comparacion.similitudCircularidad * 0.20 +                     // Forma circular
    comparacion.similitudConvexidad * 0.20 +                       // Forma convexa
    (1 - Math.min(desplazamientoNormalizado, 1)) * 0.15 +         // Alineación espacial
    simetriaOrientacion * 0.10 + // Reflejo angular
    distribucionPH.simetriaEspecular * 0.10 // Reflejo de P/H
  );

  // ============================================================================
  // 5️⃣ Sección XIII — Índices CI / CMS
  // ============================================================================
  const ciDefs = [
    { aliases: ['area'], peso: 3.0 },
    { aliases: ['perimetro', 'perimeter'], peso: 2.0 },
    { aliases: ['eje_mayor_real_longitud', 'eje_mayor', 'major_axis'], peso: 2.0 },
    { aliases: ['eje_menor_real_longitud', 'eje_menor', 'minor_axis'], peso: 1.5 },
    { aliases: ['feret_max', 'feret_maximo'], peso: 1.5 },
    { aliases: ['feret_min', 'feret_minimo'], peso: 1.0 }
  ];

  const formaDefs = [
    { aliases: ['circularity', 'circularidad'], peso: 1.0 },
    { aliases: ['solidity', 'solidez'], peso: 1.0 },
    { aliases: ['elongation', 'elongacion'], peso: 1.0 },
    { aliases: ['rectangularidad', 'rectangularity'], peso: 1.0 },
    { aliases: ['simetria_bilateral', 'symmetry_score'], peso: 1.0 },
    { aliases: ['convexity', 'convexidad'], peso: 1.0 },
    { aliases: ['excentricidad'], peso: 1.0 }
  ];

  const radialDefs = [
    { aliases: ['radio_medio'], peso: 1.0 },
    { aliases: ['ratio_radios'], peso: 1.0 },
    { aliases: ['coeficiente_variacion_radial'], peso: 1.0 },
    { aliases: ['regularidad_radial'], peso: 1.0 },
    { aliases: ['indice_estrellamiento', 'estrellamiento'], peso: 1.0 }
  ];

  const contornoDefs = [
    { aliases: ['rugosidad_borde', 'rugosidad_contorno', 'rugosidad'], peso: 1.0 },
    { aliases: ['ici'], peso: 1.0 },
    { aliases: ['curvatura_media'], peso: 1.0 },
    { aliases: ['varianza_tonal_interna', 'variabilidad_intensidad'], peso: 1.0 },
    { aliases: ['entropia_superficie'], peso: 1.0 },
    { aliases: ['gradiente_medio'], peso: 1.0 }
  ];

  const ciCalc = promedioPonderado(ciDefs);
  const formaCalc = promedioPonderado(formaDefs);
  const radialCalc = promedioPonderado(radialDefs);
  const contornoCalc = promedioPonderado(contornoDefs);

  const CI = ciCalc.indice;
  const I_forma = formaCalc.indice;
  const I_radial = radialCalc.indice;
  const I_contorno = contornoCalc.indice;
  const CMS = (I_forma != null && I_radial != null && I_contorno != null)
    ? (0.50 * I_forma + 0.30 * I_radial + 0.20 * I_contorno)
    : null;

  let interpretacionCI_CMS = {
    categoria: 'Datos insuficientes',
    descripcion: 'No hay métricas suficientes para evaluar CI/CMS.',
    diferenciacionNatural: false
  };

  if (CI != null && CMS != null) {
    if (CI >= 0.85 && CMS >= 0.85) {
      interpretacionCI_CMS = {
        categoria: 'Correspondencia máxima',
        descripcion: 'Caras prácticamente idénticas en dimensiones y morfología de superficie.',
        diferenciacionNatural: false
      };
    } else if (CI >= 0.78 && CMS >= 0.62) {
      interpretacionCI_CMS = {
        categoria: 'Correspondencia normal',
        descripcion: 'Caras compatibles del mismo objeto con variación esperable de manufactura.',
        diferenciacionNatural: false
      };
    } else if (CI >= 0.78 && CMS < 0.62) {
      interpretacionCI_CMS = {
        categoria: 'Diferenciación natural',
        descripcion: 'Dimensiones equivalentes con morfología superficial divergente.',
        diferenciacionNatural: true
      };
    } else if (CI < 0.60 && CMS < 0.60) {
      interpretacionCI_CMS = {
        categoria: 'No relacionados morfométricamente',
        descripcion: 'Baja coherencia dimensional y superficial entre caras.',
        diferenciacionNatural: false
      };
    } else {
      interpretacionCI_CMS = {
        categoria: 'Correspondencia baja o ambigua',
        descripcion: 'Patrón intermedio que requiere revisión contextual.',
        diferenciacionNatural: false
      };
    }
  }

  comparacion.CI = CI;
  comparacion.CMS = CMS;
  comparacion.subindicesCMS = { I_forma, I_radial, I_contorno };
  comparacion.similitudesCI = ciCalc.detalles;
  comparacion.similitudesCMS = {
    forma: formaCalc.detalles,
    radial: radialCalc.detalles,
    contorno: contornoCalc.detalles
  };
  comparacion.interpretacionCI_CMS = interpretacionCI_CMS;

  return comparacion;
}

/**
 * Analizar distribución de P/H respecto a los centroides
 * Considera el reflejo especular entre Cara A (anverso) y Cara B (reverso)
 */
export function analizarDistribucionPH(caraA, caraB, centroideA, centroideB) {
  const analisis = {
    simetriaPosicional: 0,
    simetriaEspecular: 0,
    descripcion: ''
  };

  // Si no hay P/H en ambas caras, retornar simétrico por defecto
  if (caraA.perforaciones.length === 0 && caraA.horadaciones.length === 0 &&
      caraB.perforaciones.length === 0 && caraB.horadaciones.length === 0) {
    analisis.simetriaPosicional = 1;
    analisis.simetriaEspecular = 1;
    analisis.descripcion = 'Sin perforaciones/horadaciones en ninguna cara';
    return analisis;
  }

  // Combinar P/H de cada cara
  const phA = [...caraA.perforaciones, ...caraA.horadaciones];
  const phB = [...caraB.perforaciones, ...caraB.horadaciones];

  // Calcular distancias promedio de P/H al centroide en cada cara
  const calcularDistanciaPromedio = (ph, centroide) => {
    if (ph.length === 0) return 0;

    const distancias = ph.map(p => {
      // Usar centroide resuelto del objeto P/H (prioridad: field .centroide, luego .metricas.centroid)
      const cent = p.centroide || p.metricas?.centroid || [0, 0];
      return Math.sqrt(
        Math.pow(cent[0] - centroide[0], 2) +
        Math.pow(cent[1] - centroide[1], 2)
      );
    });

    return distancias.reduce((sum, d) => sum + d, 0) / distancias.length;
  };

  const distPromA = calcularDistanciaPromedio(phA, centroideA);
  const distPromB = calcularDistanciaPromedio(phB, centroideB);

  // Calcular simetría posicional (similitud de distribución radial)
  if (distPromA === 0 && distPromB === 0) {
    analisis.simetriaPosicional = 1;
  } else {
    const maxDist = Math.max(distPromA, distPromB);
    analisis.simetriaPosicional = 1 - (Math.abs(distPromA - distPromB) / maxDist);
  }

  // 🔄 Análisis de reflejo especular de P/H
  // Para cada P/H en Cara A, buscar si existe su reflejo en Cara B
  if (phA.length > 0 && phB.length > 0) {
    let coincidenciasReflejadas = 0;
    const toleranciaReflejo = 0.15; // 15% de tolerancia en posición relativa

    phA.forEach(pA => {
      const centA = pA.centroide || [0, 0];

      // Calcular posición reflejada esperada (reflejo horizontal respecto al centroide)
      const posReflejadaEsperada = aplicarReflejoEspecular(centA, centroideA);

      // Buscar P/H en Cara B cercana a la posición reflejada
      const coincideReflejo = phB.some(pB => {
        const centB = pB.centroide || [0, 0];
        const distanciaAlReflejo = Math.sqrt(
          Math.pow(centB[0] - posReflejadaEsperada[0], 2) +
          Math.pow(centB[1] - posReflejadaEsperada[1], 2)
        );

        // Normalizar por tamaño del objeto
        const radioEquivalente = Math.sqrt((caraA.metricas.area + caraB.metricas.area) / (2 * Math.PI));
        const distanciaNormalizada = distanciaAlReflejo / radioEquivalente;

        return distanciaNormalizada < toleranciaReflejo;
      });

      if (coincideReflejo) coincidenciasReflejadas++;
    });

    analisis.simetriaEspecular = coincidenciasReflejadas / Math.max(phA.length, phB.length);
  } else {
    // Si solo una cara tiene P/H, no hay simetría especular
    analisis.simetriaEspecular = phA.length === 0 && phB.length === 0 ? 1 : 0;
  }

  // Generar descripción considerando ambos tipos de simetría
  const tieneReflejoEspecular = analisis.simetriaEspecular >= 0.7;
  const tieneDistribucionSimetrica = analisis.simetriaPosicional >= 0.8;

  if (tieneReflejoEspecular && tieneDistribucionSimetrica) {
    analisis.descripcion = 'Distribución especular perfecta: P/H reflejados simétricamente entre anverso y reverso';
  } else if (tieneReflejoEspecular) {
    analisis.descripcion = 'Reflejo especular confirmado, con variaciones en distancias radiales';
  } else if (tieneDistribucionSimetrica) {
    analisis.descripcion = 'Distribución radial simétrica, pero sin reflejo especular exacto';
  } else if (analisis.simetriaPosicional >= 0.6) {
    analisis.descripcion = 'Distribución moderadamente simétrica sin reflejo especular';
  } else {
    analisis.descripcion = 'Distribución asimétrica: P/H en posiciones no especulares entre caras';
  }

  analisis.distanciaPromedioA = distPromA;
  analisis.distanciaPromedioB = distPromB;
  analisis.coincidenciasReflejadas = Math.round(analisis.simetriaEspecular * Math.max(phA.length, phB.length));
  analisis.totalPH_A = phA.length;
  analisis.totalPH_B = phB.length;

  return analisis;
}

