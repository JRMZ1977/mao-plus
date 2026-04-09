// MAO Plus — Sistema de tooltips y datos de métricas
const tooltipData = {
  // ========================================================================
  // MÉTRICAS BÁSICAS
  // ========================================================================
  area: 'Superficie total del objeto medida en píxeles cuadrados o mm². Calculada a partir del Convex Hull que representa la forma completa.',
  perimetro: 'Longitud total del contorno del objeto medida en píxeles o mm. Suma de todas las distancias entre puntos consecutivos del contorno.',
  circularidad: 'Mide qué tan circular es el objeto (1.0 = círculo perfecto, <0.8 = muy alargado o irregular). Fórmula: 4π × Área / Perímetro²',
  
  // ========================================================================
  // DIMENSIONES Y EJES
  // ========================================================================
  eje_mayor: 'Dimensión máxima del objeto medida a lo largo del eje principal de elongación.',
  eje_menor: 'Dimensión mínima del objeto medida perpendicular al eje mayor.',
  centroide: 'Centro geométrico del objeto. Punto de balance si el objeto fuera una lámina de densidad uniforme.',
  excentricidad: 'Qué tan elíptico es el objeto (0 = circular, 1 = lineal). Mide cuánto se desvía de ser un círculo perfecto.',
  
  // ========================================================================
  // RADIOS Y ANÁLISIS RADIAL
  // ========================================================================
  radio_maximo: 'Distancia más larga desde el centroide del Convex Hull hasta cualquier punto del contorno. Indica la extensión máxima del objeto.',
  radio_minimo: 'Distancia más corta desde el centroide del Convex Hull hasta el contorno. Indica la parte más cercana al centro.',
  radio_medio: 'Promedio de todos los radios desde el centroide hasta el contorno. Representa el tamaño típico del objeto.',
  ratio_radios: 'Relación Radio Mínimo / Radio Máximo. Valores cercanos a 1.0 indican formas muy regulares/circulares.',
  
  // ========================================================================
  // FORMA Y CLASIFICACIÓN
  // ========================================================================
  convexidad: 'Relación entre el perímetro del envolvente convexo y el perímetro real. Valores <0.9 indican concavidades pronunciadas.',
  solidez: 'Proporción del área del envolvente convexo ocupada por el objeto. Valores altos (>0.9) indican formas sin perforaciones ni concavidades.',
  compacidad: 'Medida de cuán compacto es el objeto. Fórmula: √(Área/π) / Radio. Valores bajos indican formas irregulares con protuberancias.',
  aspecto: 'Relación entre eje mayor y eje menor. Indica elongación del objeto. Valores >2 = muy alargado, <1.5 = redondeado.',
  
  // ========================================================================
  // CONVEX HULL
  // ========================================================================
  convex_hull: 'Envolvente convexa: polígono convexo más pequeño que contiene todos los puntos del objeto. Representa la forma original completa.',
  vertices_convexos: 'Número de vértices (puntos) que definen el Convex Hull. Menos vértices = forma más simple/suave.',
  
  // ========================================================================
  // MÉTRICAS GEOMÉTRICAS AVANZADAS
  // ========================================================================
  estrellamiento: 'Índice que mide cuán "estrellada" es la forma. Valores altos (>0.5) indican protuberancias pronunciadas o puntas marcadas.',
  lobularidad: 'Detecta lóbulos o protuberancias suaves en el contorno. Valores >1.2 indican expansiones laterales o apéndices redondeados.',
  energia_curvatura: 'Suma de cuadrados de curvaturas. Valores altos (>0.05) indican contorno muy sinuoso con cambios bruscos de dirección.',
  
  // ========================================================================
  // DIÁMETRO DE FERET
  // ========================================================================
  feret_max: 'Ancho máximo del objeto medido con calibrador rotatorio en todas las orientaciones. Medición robusta independiente de la orientación.',
  feret_min: 'Ancho mínimo del objeto en la orientación más estrecha. Útil para clasificar formas alargadas vs redondeadas.',
  feret_ratio: 'Relación Feret Mínimo / Feret Máximo. Valores cercanos a 1.0 = forma equidimensional, <0.5 = muy alargada.',
  
  // ========================================================================
  // ÁNGULOS Y VÉRTICES
  // ========================================================================
  vertices_aproximados: 'Número estimado de vértices o esquinas significativas en el contorno del objeto.',
  angulo_medio: 'Promedio de los ángulos internos en los vértices detectados. Indica la geometría predominante.',
  angulo_predominante: 'Ángulo que aparece con mayor frecuencia en los vértices. Útil para identificar patrones geométricos.',
  geometria_vertices: 'Clasificación geométrica basada en los ángulos predominantes: triangular, cuadrangular, pentagonal, etc.',
  
  // ========================================================================
  // CONTORNO Y COMPLEJIDAD
  // ========================================================================
  contour_complexity: 'Índice de complejidad del contorno. Mide cuán irregular o intrincado es el borde del objeto.',
  rugosidad: 'Medida de la irregularidad del contorno. Valores altos indican bordes dentados o corrugados.',
  puntos_contorno: 'Número total de puntos que definen el contorno del objeto. Más puntos = contorno más detallado.',
  
  // ========================================================================
  // SIMETRÍA Y CURVATURA
  // ========================================================================
  simetria_bilateral: 'Grado de simetría respecto a un eje central. 100% = perfectamente simétrico, <50% = muy asimétrico.',
  curvatura_media: 'Promedio de la curvatura en todos los puntos del contorno. Indica cuán curvo es el objeto en general.',
  puntos_inflexion: 'Número de puntos donde la curvatura cambia de signo (de cóncavo a convexo o viceversa). Indica cambios de dirección.',
  
  // ========================================================================
  // BOUNDING BOX
  // ========================================================================
  bounding_box: 'Rectángulo más pequeño que encierra completamente el objeto, alineado con los ejes de coordenadas.',
  bounding_efficiency: 'Proporción del bounding box ocupada por el objeto. Valores bajos (<0.6) indican mucho espacio vacío.',
  
  // ========================================================================
  // BIFACIAL - MÉTRICAS COMPARATIVAS
  // ========================================================================
  simetriaArea: 'Similitud de área entre ambas caras. 100% = áreas idénticas, <80% = diferencia significativa.',
  simetriaPosicional: 'Alineación espacial de perforaciones entre caras A y B. Mide si están en posiciones correspondientes.',
  reflejoEspecular: 'Grado de simetría especular entre anverso y reverso. Evalúa si una cara es reflejo de la otra.',
  
  // ========================================================================
  // PERFORACIONES Y HORADACIONES
  // ========================================================================
  perforaciones: 'Orificios completos que atraviesan el objeto de lado a lado. Detectadas automáticamente por análisis de contorno.',
  horadaciones: 'Depresiones o cavidades que no perforan completamente el objeto. Profundidad < grosor del material.',

  // ========================================================================
  // DIMENSIONES Y PROPORCIONES BÁSICAS
  // ========================================================================
  area_fragmentada: 'Área real del contorno del objeto, excluyendo huecos internos y fragmentaciones. Diferencia respecto al área del Hull indica pérdida de material.',
  perimeter_fragmentado: 'Longitud real del contorno fragmentado. Un valor alto respecto al perímetro del Hull indica bordes fracturados o irregulares.',
  perdida_area_fragmentacion_percent: '% de área perdida respecto al Convex Hull. 0% = objeto intacto; valores altos indican fragmentación severa o presencia de perforaciones.',
  perdida_perimetro_fragmentacion_percent: '% de pérdida de perímetro respecto al Hull convexo. Refleja complejidad adicional del contorno por fracturas o concavidades.',
  width: 'Ancho del rectángulo ajustado al contorno real (tight bounding box). Más preciso que el bounding box original para objetos rotados.',
  height: 'Alto del rectángulo ajustado al contorno real (tight bounding box).',
  bounding_width: 'Ancho del rectángulo envolvente alineado a los ejes de la imagen (bounding box original).',
  bounding_height: 'Alto del rectángulo envolvente alineado a los ejes de la imagen.',
  bounding_box_efficiency: 'Fracción del bounding box ocupada por el área real del objeto [0–1]. Valores bajos (<0.6) indican objetos muy elongados o con orientación diagonal. Fórmula: Área_real / (ancho_BB × alto_BB).',

  // ========================================================================
  // ÍNDICES ADIMENSIONALES DE FORMA
  // ========================================================================
  circularity_fragmentada: 'Circularidad calculada sobre el contorno real fragmentado (no el Hull). Más sensible a fracturas, huecos y bordes irregulares que la circularidad estándar.',
  compactness: 'Compacidad del Hull convexo. Mide qué fracción del círculo equivalente es ocupada por el objeto. Fórmula: A / (π × r²), donde r = radio del círculo de igual área. Valores → 1 = forma compacta.',
  compactness_fragmentada: 'Compacidad calculada sobre el contorno real. Penaliza concavidades y fragmentaciones que la versión del Hull ignora.',
  rectangularity: 'Fracción del tight bounding box ocupada por el área del Hull. Valores cercanos a 1 indican formas rectangulares. Fórmula: A_Hull / A_BB_tight.',
  rectangularity_fragmentada: 'Rectangularidad del contorno real respecto al tight bounding box.',
  elongation: 'Medida de cuán alargado es el objeto. Fórmula: 1 − (eje_menor / eje_mayor). 0 = equidimensional, → 1 = muy elongado.',
  shape_factor: 'Factor de forma de Wadell (P² / 4πA). 1.0 = círculo perfecto; valores mayores indican mayor complejidad o irregularidad del contorno.',
  shape_factor_fragmentado: 'Factor de forma calculado sobre el contorno real fragmentado.',
  contour_complexity_index: 'Índice de complejidad del contorno. Fórmula: P_real / (2π × √(A_real/π)), es decir, la razón entre el perímetro real y el perímetro de un círculo de igual área. 1.0 = círculo simple; valores > 2 indican contornos muy complejos.',

  // ========================================================================
  // CONVEXIDAD
  // ========================================================================
  convexity: 'Convexidad del contorno [0–1]. Fórmula: P_hull / P_real. Valores < 0.9 indican concavidades, entrantes o bordes dentados pronunciados.',
  convexity_class: 'Clasificación cualitativa de la convexidad: Totalmente convexo (≥0.97), Mayormente convexo (≥0.92), Moderadamente cóncavo (≥0.80), Muy cóncavo (≥0.65), Extremadamente cóncavo/fragmentado (<0.65).',

  // ========================================================================
  // EJES Y ORIENTACIÓN
  // ========================================================================
  eje_principal_angulo: 'Ángulo del eje mayor de inercia del objeto medido en grados (0–180°). Indica la orientación principal de elongación del objeto respecto al eje horizontal.',
  eje_principal_orientacion: 'Clasificación verbal de la orientación del eje principal: horizontal, vertical, diagonal, etc.',
  eje_principal_anisotropia: 'Grado de diferencia entre eje mayor y eje menor [0–1]. 0 = forma equidimensional (círculo/cuadrado); → 1 = extremadamente elongado.',
  eje_principal_forma_dominante: 'Forma dominante inferida a partir del análisis del eje principal.',
  eje_mayor_real_longitud: 'Longitud del eje mayor real del objeto, calculado a partir del contorno (no la elipse ajustada). En mm si hay escala calibrada.',
  eje_menor_real_longitud: 'Longitud del eje menor real del objeto. En mm si hay escala calibrada.',

  // ========================================================================
  // CENTROIDES
  // ========================================================================
  centroide_x: 'Coordenada X (horizontal) del centroide del contorno real del objeto, en píxeles desde el origen (esquina superior izquierda de la imagen).',
  centroide_y: 'Coordenada Y (vertical) del centroide del contorno real del objeto, en píxeles.',
  centroide_hull_x: 'Coordenada X del centroide del Convex Hull. Puede diferir del centroide real si el objeto está fragmentado.',
  centroide_hull_y: 'Coordenada Y del centroide del Convex Hull.',

  // ========================================================================
  // RADIOS MORFOLÓGICOS
  // ========================================================================
  regularidad_radial: 'Índice de regularidad de los radios [0–1]. Mide cuán homogénea es la distribución de distancias desde el centroide hasta el contorno. 1 = objeto perfectamente circular.',
  coeficiente_variacion_radial: 'Coeficiente de variación (desviación/media) de los radios. Valores bajos = forma uniforme; valores altos = protuberancias o asimetrías marcadas.',
  desviacion_radial: 'Desviación estándar de los radios medidos desde el centroide hacia el contorno. Indica cuánto varía la "anchura" del objeto en distintas direcciones.',

  // ========================================================================
  // DIÁMETRO DE FERET
  // ========================================================================
  feret_angulo_max: 'Ángulo (en grados) en el que se mide el diámetro de Feret máximo. Indica la dirección de mayor extensión del objeto.',
  feret_angulo_min: 'Ángulo en el que se mide el diámetro de Feret mínimo. Indica la dirección de menor extensión.',
  feret_clasificacion: 'Clasificación de elongación según el ratio de Feret: Casi circular (>0.90), Moderadamente elongado (>0.70), Muy elongado (>0.50), Extremadamente elongado (≤0.50).',

  // ========================================================================
  // ÁNGULOS Y VÉRTICES
  // ========================================================================
  angulo_medio_vertices: 'Promedio de los ángulos internos en los vértices detectados del contorno simplificado. 60° ≈ triangular; 90° ≈ rectangular; 120° ≈ hexagonal.',
  angulo_predominante: 'Ángulo interno que aparece con mayor frecuencia entre los vértices del contorno. Útil para identificar el patrón geométrico dominante.',
  desviacion_angulos: 'Desviación estándar de los ángulos en vértices. Valores bajos indican ángulos uniformes (polígono regular); valores altos indican geometría irregular.',
  num_angulos_agudos: 'Cantidad de vértices con ángulo interno < 89°. Un número alto indica forma puntiaguda o estrellada.',
  num_angulos_rectos: 'Cantidad de vértices con ángulo interno entre 89° y 91°. ≥ 4 ángulos rectos confirma geometría rectangular/cuadrangular.',
  num_angulos_obtusos: 'Cantidad de vértices con ángulo interno > 91°. Predominan en formas hexagonales, circulares o muy redondeadas.',
  geometria_vertices: 'Clasificación geométrica inferida de la distribución de ángulos en vértices: Triangular, Rectangular/Cuadrangular, Pentagonal, Hexagonal, Regular/Uniforme, Puntiagudo/Estrellado, Irregular/Orgánico.',

  // ========================================================================
  // SIMETRÍA
  // ========================================================================
  simetria_clasificacion: 'Clasificación cualitativa de simetría bilateral: Alta simetría (≥0.85), Moderada (≥0.70), Baja (<0.70), Asimétrico.',
  simetria_distancia_asimetria: 'Distancia promedio entre puntos simétricos del contorno respecto al eje de simetría. Valores menores = más simétrico. En mm si hay escala calibrada.',

  // ========================================================================
  // CURVATURA (MENGER)
  // ========================================================================
  curvatura_media: 'Curvatura de Menger promedio del contorno. k = 4·Area(triángulo) / (d₀₁·d₁₂·d₂₀). Valores altos indican contornos curvos y sinuosos.',
  curvatura_maxima: 'Curvatura máxima encontrada en algún punto del contorno. Indica el punto de mayor curvatura o esquina más pronunciada.',
  curvatura_desviacion: 'Desviación estándar de la curvatura en todos los puntos del contorno. Umbral para clasificar suavidad: <0.005 = muy suave (circular/elíptico).',
  curvatura_puntos_inflexion: 'Número de puntos donde la curvatura supera la media + 2σ. Indica cambios de dirección significativos (inflexiones).',
  curvatura_puntos_esquina: 'Número de puntos donde la curvatura supera la media + 3σ. Indica esquinas pronunciadas o quiebres abruptos del contorno.',
  curvatura_clasificacion: 'Clasificación de suavidad del contorno basada en la desviación de la curvatura de Menger: Muy suave (circular/elíptico) | Suave | Moderado | Irregular | Muy irregular.',
  energia_curvatura: 'Suma de los cuadrados de las curvaturas en todos los puntos del contorno (integral discreta de k²). Valores bajos indican contornos suaves; valores altos, contornos sinuosos o angulosos.',
  energia_clasificacion: 'Clasificación de la energía de curvatura: Muy suave (<0.001), Ligeramente sinuoso (<0.01), Moderadamente sinuoso (<0.05), Muy sinuoso (≥0.05).',

  // ========================================================================
  // RUGOSIDAD DEL CONTORNO
  // ========================================================================
  rugosidad_contorno: 'Rugosidad del contorno = coeficiente de variación de las longitudes de los segmentos consecutivos del contorno. 0 = segmentos perfectamente iguales (polígono regular); valores altos = bordes irregulares o dentados.',
  rugosidad_clasificacion: 'Clasificación de rugosidad: Muy suave (<0.05), Suave (<0.15), Moderado (<0.30), Rugoso (<0.50), Muy rugoso (≥0.50).',
  rugosidad_longitud_segmento_media: 'Longitud promedio de los segmentos del contorno. Depende del nivel de detalle con que se extrajo el contorno.',
  rugosidad_desviacion: 'Desviación estándar de las longitudes de los segmentos del contorno. Mayor valor = mayor irregularidad local del borde.',

  // ========================================================================
  // ESTRELLAMIENTO Y LOBULARIDAD
  // ========================================================================
  indice_estrellamiento: 'Índice que mide la presencia de protuberancias o puntas en el contorno. Calculado como variación normalizada de la función de radio en frecuencias altas. Valores > 0.3 indican formas estrelladas o muy irregulares.',
  estrellamiento_clasificacion: 'Clasificación de estrellamiento: Redondeado/Regular (<0.15), Ligeramente estrellado (<0.30), Moderadamente estrellado (<0.50), Muy estrellado (≥0.50).',
  indice_lobularidad: 'Índice que detecta lóbulos suaves o expansiones laterales. Mide la variación de radio en frecuencias intermedias. Valores > 1.2 indican lóbulos o apéndices redondeados.',
  lobularidad_clasificacion: 'Clasificación de lobularidad: Circular/Suave (<0.10), Ligeramente lobulado (<0.25), Moderadamente lobulado (<0.50), Muy lobulado (≥0.50).',

  // ========================================================================
  // CONVEX HULL — MÉTRICAS DETALLADAS
  // ========================================================================
  hull_circularity: 'Circularidad del Convex Hull (4π·A_hull / P_hull²). Indica cuán circular es la forma completa del objeto sin huecos ni fragmentos.',
  hull_aspect_ratio: 'Relación de aspecto (ancho/alto) del rectángulo envolvente del Hull convexo.',
  hull_area_difference_percent: '% de diferencia de área entre el Hull convexo y el contorno real. 0% = objeto sólido convexo; valores > 5% indican concavidades o fracturas significativas.',
  hull_perimeter_difference_percent: '% de diferencia de perímetro entre el Hull convexo y el contorno real. Indica cuánto contorno "extra" tienen los bordes reales respecto a la forma idealizada.',

  // ========================================================================
  // CLASIFICACIONES MÚLTIPLES DE FORMA
  // ========================================================================
  shape_class_circularity: 'Clasificación de forma basada en la circularidad del Hull: Circular (≥0.85), Subcircular (≥0.70), Subelíptica (≥0.55), Alargada (≥0.40), Muy alargada/irregular (<0.40).',
  shape_class_compactness: 'Clasificación basada en compacidad: Muy compacta (≥0.90), Compacta (≥0.75), Moderadamente compacta (≥0.60), Dispersa (≥0.45), Muy dispersa/irregular (<0.45).',
  shape_class_aspect: 'Clasificación de la relación de aspecto: Cuadrada/Equidimensional (AR 0.9–1.1), Rectangular moderada (AR 0.7–0.9 o 1.1–1.5), Alargada horizontal (AR >1.5), Alargada vertical (AR <0.7).',
  shape_class_complexity: 'Clasificación de complejidad del contorno: Forma simple (ICI <1.1), Forma moderada (<1.5), Forma compleja (<2.0), Forma muy compleja/irregular (≥2.0).',
  shape_class_solidity: 'Clasificación de solidez: Muy sólida (≥0.97), Sólida (≥0.92), Moderadamente sólida (≥0.80), Poco sólida (≥0.65), Muy irregular/fragmentada (<0.65).',
  forma_detectada: 'Forma geométrica detectada mediante meta-clasificación por votación ponderada entre 6 métodos independientes (radial-angular, ángulos de vértices, simetría, circularidad, complejidad y curvatura). Resultado final con mayor confianza.',
  forma_confianza_global: 'Confianza global de la clasificación de forma [0–100%]. Combina la confianza ponderada de los métodos que coinciden y el factor de consenso entre métodos.',
  forma_metodos_coincidentes: 'Número de métodos de clasificación que coincidieron en la categoría ganadora, sobre el total de métodos válidos (ej. "4/5").',
  forma_razonamiento: 'Justificación textual del proceso de meta-clasificación, describiendo qué evidencias determinaron la forma detectada.',
  forma_categoria_base: 'Categoría geométrica base ganadora de la votación antes de aplicar reglas de resolución de conflictos: Circular, Triangular, Cuadrangular, Pentagonal, Hexagonal, Poligonal, Irregular.',

  // ========================================================================
  // COMPLETITUD Y FRAGMENTACIÓN
  // ========================================================================
  completitud_estimada: '% de completitud del objeto estimado combinando dos métodos: cobertura angular del contorno y ratio de convexidad. 100% = objeto completo; <80% = fragmento significativo.',
  completitud_es_fragmento: 'Indicador booleano de si el objeto se considera un fragmento (completitud estimada < umbral configurable).',
  completitud_cobertura_grados: 'Ángulos barridos por el contorno real desde el centroide [0–360°]. Un objeto completo cubre los 360°; un fragmento tiene sectores vacíos.',
  completitud_tipo_fragmento: 'Tipo de fragmento detectado según la geometría de la zona faltante: lateral, esquina, borde, etc.',

  // ========================================================================
  // FORMA 3D INFERIDA (desde proyección 2D)
  // ========================================================================
  esfericidad: 'Esfericidad inferida desde la proyección 2D [0–1]. Estimada a partir de circularidad y solidez. No es una medida directa: requiere asumir isotropía del objeto.',
  oblongacion: 'Oblongación inferida [0–1]: relación entre los ejes de una elipse ajustada al Hull. 0 = esfera/círculo, → 1 = cilindro muy alargado.',
  oblongacion_clasificacion: 'Clasificación de oblongación: Equidimensional, Ligeramente oblongo, Moderadamente oblongo, Muy oblongo.',
  aplanamiento_inferido: 'Aplanamiento inferido del objeto en tercera dimensión. Estimado asumiendo que el espesor es proporcional a la raíz del área. Valor orientativo, no empírico.',

  // ========================================================================
  // INCERTIDUMBRE ÓPTICA POSICIONAL
  // ========================================================================
  error_optico_lineal_percent: 'Error lineal estimado por la posición del objeto en la imagen respecto al centro óptico [±%]. Causado por distorsión radial del lente y perspectiva geométrica. Afecta longitudes y perímetros.',
  error_optico_area_percent: 'Error en área estimado por la posición óptica [±%]. Aproximadamente el doble del error lineal al propagar el error al cuadrado.',
  error_perspectiva_percent: 'Componente de error atribuible a la geometría de perspectiva (ángulo de incidencia sobre el plano del objeto). Aumenta con la distancia al centro de la imagen.',
  error_distorsion_percent: 'Componente de error atribuible a la distorsión radial del lente. Estimado mediante un modelo simplificado a partir de la distancia focal y el tamaño del sensor.',
  posicion_radial_norm: 'Posición radial normalizada del centroide del objeto en la imagen [0–1]. 0 = centro óptico (mínimo error), 1 = borde de la imagen (máximo error).',
  angulo_optico_deg: 'Ángulo entre el rayo óptico al centroide y el eje óptico central del lente [°]. Ángulos mayores generan mayor distorsión y error de perspectiva.',
  k1_estimado: 'Coeficiente de distorsión radial k₁ estimado sin calibración formal. Derivado de la focal y el sensor usando un modelo simplificado (incertidumbre propia del modelo ±30%).',
  fov_diagonal_deg: 'Campo de visión diagonal del lente estimado a partir de la focal y el tamaño de sensor [°].',
  confianza_optica: 'Nivel de confianza del estimado de error óptico según los parámetros disponibles: Alta, Media, Baja, Muy baja.'
};

function initTooltips() {
  document.querySelectorAll('[data-metric]').forEach(el => {
    const metric = el.dataset.metric;
    if (tooltipData[metric]) {
      el.classList.add('has-tooltip');
      el.setAttribute('data-tooltip', tooltipData[metric]);
    }
  });
}

// ============================================================================
// 📊 DASHBOARD DE MÉTRICAS - Constructor
// ============================================================================

// ============================================================================
// CÓDIGO PRINCIPAL DE MAO PLUS
