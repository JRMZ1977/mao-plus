# Inventario del glosario — F0

> Generado por `scripts/glosario_inventario.py`. **No editar a mano**: se regenera.

## Resumen

| Magnitud | Valor |
|---|---:|
| Categorías canónicas del manifiesto | 26 |
| Términos únicos a documentar | **280** |
| …con categoría canónica adjudicada | 203 |
| …huérfanos (emitidos sin categoría) | 77 |
| …publicados en el CSV | 184 |
| …sólo CSV (invisibles en la Tabla) | 57 |
| …sólo Tabla (ausentes del CSV) | 76 |
| …con fórmula ya escrita en `morphometric_registry.py` | 31 |
| …ya documentados en `glossary.js` | 88 |
| Filas del CSV | 217 |
| Secciones del CSV | 27 |

## Carga por categoría canónica

| Índice | Categoría | Términos | Pendientes |
|---|---|---:|---:|
| I | Detección del Objeto | 8 | 0 |
| II | Error Óptico Posicional | 30 | 14 |
| II-b | Incertidumbre Propagada por Métrica | 0 | 0 |
| III | Identificación y Clasificación | 1 | 1 |
| IV | Dimensiones Métricas del Objeto | 7 | 2 |
| V | Proporciones y Forma Global | 24 | 10 |
| VI | Análisis Radial y Regularidad del Contorno | 3 | 0 |
| VII | Rugosidad y Complejidad del Borde | 15 | 10 |
| VII-b | Curvatura | 8 | 0 |
| VIII | Envolvente Convexa (Convex Hull) | 11 | 5 |
| IX | Ejes, Orientación y Posición Espacial | 8 | 4 |
| IX-b | Simetría Bilateral | 3 | 0 |
| IX-c | Centroide y Posición Espacial | 4 | 4 |
| X | Geometría de Vértices | 8 | 8 |
| XI | Forma 3D Inferida | 5 | 5 |
| XII | Estado de Conservación y Fragmentación | 11 | 11 |
| XIII | Textura Óptica (GLCM) | 0 | 0 |
| XIV | Depuración Estadística de Contorno | 0 | 0 |
| XV | Perforaciones | 15 | 14 |
| XV-b | Horadaciones | 5 | 5 |
| XVI | Patrón de Agrupamiento | 4 | 4 |
| XVII | Características Geométricas Avanzadas | 11 | 3 |
| XVIII | Clasificación y Síntesis | 14 | 14 |
| XIX | Información Técnica / Metadatos | 8 | 7 |
| XX | Comparación Bifacial | 0 | 0 |
| XX-b | Análisis Comparativo Objeto–P/H | 0 | 0 |

## Puente CSV → manifiesto

Correspondencia **inferida por las claves de métrica que ambas superficies comparten**,
no declarada en ninguna parte del código. Es exactamente el mapa que hoy falta para
leer un CSV de MAO sin el código delante.

| Sección del CSV | Filas | Categoría canónica inferida |
|---|---:|---|
| Perforaciones | 27 | `XV` Perforaciones |
| Horadaciones | 26 | `XV-b` Horadaciones |
| Error e Incertidumbre Óptica | 13 | `II` Error Óptico Posicional |
| Dimensiones Básicas | 11 | `IV` Dimensiones Métricas del Objeto |
| Convex Hull | 11 | `VIII` Envolvente Convexa (Convex Hull) |
| Métricas Avanzadas | 10 | `XVII` Características Geométricas Avanzadas |
| Textura Óptica (GLCM) | 10 | `VII` Rugosidad y Complejidad del Borde |
| Índices de Forma | 9 | `V` Proporciones y Forma Global |
| Métricas Complementarias | 9 | `V` Proporciones y Forma Global |
| Ejes y Orientación | 8 | `II` Error Óptico Posicional |
| Curvatura | 8 | `VII-b` Curvatura |
| Vértices y Ángulos | 8 | `X` Geometría de Vértices |
| Clasificación | 8 | `XVIII` Clasificación y Síntesis |
| Fragmentación | 7 | `XII` Estado de Conservación y Fragmentación |
| Análisis Radial | 7 | `V` Proporciones y Forma Global |
| Detección | 6 | `I` Detección del Objeto |
| Propiedades del Contorno | 5 | `VII` Rugosidad y Complejidad del Borde |
| Forma 3D Inferida | 5 | `XI` Forma 3D Inferida |
| Clasificaciones | 5 | `V` Proporciones y Forma Global |
| Identificación | 4 | `XIX` Información Técnica / Metadatos |
| Centroide | 4 | `IX-c` Centroide y Posición Espacial |
| Patrón de Agrupamiento | 4 | `XVI` Patrón de Agrupamiento |
| Simetría | 3 | `IX-b` Simetría Bilateral |
| Depuración Estadística de Contorno | 3 | **sin correspondencia** |
| Metadatos | 3 | `XIX` Información Técnica / Metadatos |
| Síntesis Final | 2 | `XVIII` Clasificación y Síntesis |
| COMPARACIÓN MORFOLÓGICA | 1 | **sin correspondencia** |

## Hallazgos estructurales

Salieron al construir el inventario. Son defectos del código, no del script.

- **`XIV. Depuración Estadística de Contorno`** está declarada en el manifiesto pero ninguna función de la Tabla Completa la rinde.
- **`XX. Comparación Bifacial`** está declarada en el manifiesto pero ninguna función de la Tabla Completa la rinde.
- **`XX-b. Análisis Comparativo Objeto–P/H`** está declarada en el manifiesto pero ninguna función de la Tabla Completa la rinde.
- `generarSeccionIncertidumbrePropagada()` emite 2 secciones (`incertidumbre`, `error_optico`) desde un solo cuerpo: sus claves no se pueden repartir automáticamente y quedan atribuidas a todas.
- `generarSeccionPropiedadesContorno()` emite 2 secciones (`textura`, `contorno`) desde un solo cuerpo: sus claves no se pueden repartir automáticamente y quedan atribuidas a todas.
- `generarTablaComparativaDimensiones()` lee métricas pero no llama a `encabezadoDe()`: rotula a mano.
- `generarTablaComparativaForma()` lee métricas pero no llama a `encabezadoDe()`: rotula a mano.
- `generarTablaComparativaPH()` lee métricas pero no llama a `encabezadoDe()`: rotula a mano.

## Términos por categoría

### I. Detección del Objeto

| Clave | Ámbito | CSV | Fórmula (registry) | Documentada |
|---|---|---|---|---|
| `confidence_level` | objeto | — | — | sí |
| `detection_confidence` | objeto | — | — | sí |
| `detection_confidence_level` | objeto | Detección › Confianza de detección | — | sí |
| `detection_method` | objeto | Detección › Método de detección | — | sí |
| `detection_method_raw` | objeto | Detección › Modo crudo registrado | — | sí |
| `ia_enriquecido` | objeto | Detección › Enriquecido por IA | — | sí |
| `ia_segmentador` | objeto | Detección › Segmentador / motor | — | sí |
| `ia_threshold_method` | objeto | Detección › Umbralización (modo IA) | — | sí |

### II. Error Óptico Posicional

| Clave | Ámbito | CSV | Fórmula (registry) | Documentada |
|---|---|---|---|---|
| `angulo_optico_deg` | objeto | Error e Incertidumbre Óptica › Ángulo Óptico | — | sí |
| `area` | objeto | Dimensiones Básicas › Área | — | sí |
| `area_incertidumbre_abs` | objeto | — | — | no |
| `area_rango_max` | objeto | — | — | no |
| `area_rango_min` | objeto | — | — | no |
| `confianza_optica` | objeto | Error e Incertidumbre Óptica › Confianza Óptica | — | sí |
| `eje_mayor` | objeto | Ejes y Orientación › Eje Mayor | — | sí |
| `eje_mayor_incertidumbre_abs` | objeto | — | — | no |
| `eje_mayor_rango_max` | objeto | — | — | no |
| `eje_mayor_rango_min` | objeto | — | — | no |
| `eje_mayor_real_longitud` | objeto | Ejes y Orientación › Eje Mayor Real - Longitud | — | sí |
| `eje_menor` | objeto | Ejes y Orientación › Eje Menor | — | sí |
| `eje_menor_incertidumbre_abs` | objeto | — | — | no |
| `eje_menor_rango_max` | objeto | — | — | no |
| `eje_menor_rango_min` | objeto | — | — | no |
| `eje_menor_real_longitud` | objeto | Ejes y Orientación › Eje Menor Real - Longitud | — | sí |
| `enriched_at` | objeto | — | — | no |
| `error_distorsion_percent` | objeto | Error e Incertidumbre Óptica › Error Distorsión | — | sí |
| `error_optico_area_percent` | objeto | Error e Incertidumbre Óptica › Error Área | — | sí |
| `error_optico_lineal_percent` | objeto | Error e Incertidumbre Óptica › Error Lineal | — | sí |
| `error_perspectiva_percent` | objeto | Error e Incertidumbre Óptica › Error Perspectiva | — | sí |
| `fov_diagonal_deg` | objeto | Error e Incertidumbre Óptica › FOV Diagonal | — | sí |
| `k1_estimado` | objeto | Error e Incertidumbre Óptica › k1 Estimado | — | sí |
| `mao_version` | objeto | — | — | no |
| `nota_error_optico` | objeto | Error e Incertidumbre Óptica › Nota | — | sí |
| `perimeter` | objeto | Dimensiones Básicas › Perímetro | — | sí |
| `perimeter_incertidumbre_abs` | objeto | — | — | no |
| `perimeter_rango_max` | objeto | — | — | no |
| `perimeter_rango_min` | objeto | — | — | no |
| `posicion_radial_norm` | objeto | Error e Incertidumbre Óptica › Posición Radial Normalizada | — | sí |

### III. Identificación y Clasificación

| Clave | Ámbito | CSV | Fórmula (registry) | Documentada |
|---|---|---|---|---|
| `forma_detectada` | objeto | Clasificación › Forma Detectada<br>Síntesis Final › Clasificación Integrada | — | no |

### IV. Dimensiones Métricas del Objeto

| Clave | Ámbito | CSV | Fórmula (registry) | Documentada |
|---|---|---|---|---|
| `contour_points` | objeto | Dimensiones Básicas › Puntos del Contorno<br>Métricas Complementarias › Puntos del Contorno | — | sí |
| `feret_max` | objeto | Métricas Avanzadas › Diámetro Feret Máximo | — | sí |
| `feret_min` | objeto | Métricas Avanzadas › Diámetro Feret Mínimo | — | sí |
| `height` | objeto | Dimensiones Básicas › Alto (BB Ajustado) | — | sí |
| `hull_area` | objeto | — | — | no |
| `perimeter_hull` | objeto | — | — | no |
| `width` | objeto | Dimensiones Básicas › Ancho (BB Ajustado) | — | sí |

### V. Proporciones y Forma Global

| Clave | Ámbito | CSV | Fórmula (registry) | Documentada |
|---|---|---|---|---|
| `_clasificaciones_individuales` | objeto | — | — | no |
| `aspect_ratio` | objeto | — | `eje_mayor / eje_menor` | no |
| `aspect_ratio_original` | objeto | — | — | no |
| `aspect_ratio_tight` | objeto | Índices de Forma › Relación de Aspecto<br>Métricas Complementarias › Relación de Aspecto (valor) | — | sí |
| `circularity` | objeto | Índices de Forma › Circularidad | `4*pi*A / P^2` | sí |
| `compactness` | objeto | Índices de Forma › Compacidad | — | sí |
| `convexidad` | objeto | — | — | no |
| `convexity` | objeto | Convex Hull › Convexidad | — | sí |
| `elongation` | objeto | Índices de Forma › Elongación | `1 - eje_menor/eje_mayor` | sí |
| `excentricidad` | objeto | Índices de Forma › Excentricidad | `sqrt(1 - (eigenvalue_menor/eigenvalue_mayor))` | sí |
| `max_radius` | objeto | — | — | no |
| `min_radius` | objeto | — | — | no |
| `radio_maximo` | objeto | Análisis Radial › Radio Máximo | — | sí |
| `radio_minimo` | objeto | Análisis Radial › Radio Mínimo | — | sí |
| `ratio_radios` | objeto | Análisis Radial › Ratio de Radios | — | sí |
| `rectangularity` | objeto | Índices de Forma › Rectangularidad | — | sí |
| `regularidad_radial` | objeto | Análisis Radial › Regularidad Radial | — | sí |
| `shape_class_aspect` | objeto | Clasificaciones › Por Aspecto<br>Métricas Complementarias › Relación de Aspecto (interpretación) | — | no |
| `shape_class_circularity` | objeto | Clasificaciones › Por Circularidad<br>Métricas Complementarias › Circularidad (interpretación) | — | no |
| `shape_class_compactness` | objeto | Clasificaciones › Por Compacidad<br>Métricas Complementarias › Compacidad (interpretación) | — | no |
| `shape_factor` | objeto | Índices de Forma › Factor de Forma | — | sí |
| `shape_factor_fragmentado` | objeto | — | — | no |
| `solidity` | objeto | Índices de Forma › Solidez | `A / A_hull` | sí |
| `solidity_class` | objeto | Índices de Forma › Clasificación de Solidez | — | sí |

### VI. Análisis Radial y Regularidad del Contorno

| Clave | Ámbito | CSV | Fórmula (registry) | Documentada |
|---|---|---|---|---|
| `coeficiente_variacion_radial` | objeto | Análisis Radial › Coeficiente Variación | — | sí |
| `desviacion_radial` | objeto | Análisis Radial › Desviación Radial | — | sí |
| `radio_medio` | objeto | Análisis Radial › Radio Medio | — | sí |

### VII. Rugosidad y Complejidad del Borde

| Clave | Ámbito | CSV | Fórmula (registry) | Documentada |
|---|---|---|---|---|
| `contour_complexity_index` | objeto | Propiedades del Contorno › Índice de Complejidad | `P_real / (2*pi*sqrt(A/pi))` | sí |
| `contrast` | objeto | Textura Óptica (GLCM) › Contraste GLCM | — | no |
| `correlation` | objeto | Textura Óptica (GLCM) › Correlación | — | no |
| `dissimilarity` | objeto | Textura Óptica (GLCM) › Disimilaridad | — | no |
| `energy` | objeto | Textura Óptica (GLCM) › Energía | — | no |
| `entropia_superficie` | objeto | Textura Óptica (GLCM) › Entropía Superficie | `entropia de la distribucion de intensidades internas` | no |
| `entropy` | objeto | Textura Óptica (GLCM) › Entropía GLCM | — | no |
| `gradiente_medio` | objeto | Textura Óptica (GLCM) › Gradiente Medio | — | no |
| `homogeneity` | objeto | Textura Óptica (GLCM) › Homogeneidad | — | no |
| `rugosidad_clasificacion` | objeto | Propiedades del Contorno › Clasificación Rugosidad | — | sí |
| `rugosidad_contorno` | objeto | Propiedades del Contorno › Rugosidad | `CV de longitudes de segmento` | sí |
| `rugosidad_desviacion` | objeto | Propiedades del Contorno › Desviación Segmentos | — | sí |
| `rugosidad_longitud_segmento_media` | objeto | Propiedades del Contorno › Longitud Media Segmento | — | sí |
| `textura_interpretacion` | objeto | Textura Óptica (GLCM) › Interpretación | — | no |
| `varianza_interna` | objeto | Textura Óptica (GLCM) › Varianza Interna | `varianza de intensidades de los pixeles internos` | no |

### VII-b. Curvatura

| Clave | Ámbito | CSV | Fórmula (registry) | Documentada |
|---|---|---|---|---|
| `curvatura_clasificacion` | objeto | Curvatura › Clasificación Suavidad | — | sí |
| `curvatura_desviacion` | objeto | Curvatura › Desviación de Curvatura | — | sí |
| `curvatura_maxima` | objeto | Curvatura › Curvatura Máxima | — | sí |
| `curvatura_media` | objeto | Curvatura › Curvatura Media | — | sí |
| `curvatura_puntos_esquina` | objeto | Curvatura › Puntos de Esquina | — | sí |
| `curvatura_puntos_inflexion` | objeto | Curvatura › Puntos de Inflexión | — | sí |
| `energia_clasificacion` | objeto | Curvatura › Clasificación Energía | — | sí |
| `energia_curvatura` | objeto | Curvatura › Energía de Curvatura | — | sí |

### VIII. Envolvente Convexa (Convex Hull)

| Clave | Ámbito | CSV | Fórmula (registry) | Documentada |
|---|---|---|---|---|
| `area_px` | objeto | — | — | sí |
| `convex_hull_area` | objeto | — | — | sí |
| `convex_hull_perimeter` | objeto | — | — | sí |
| `convex_hull_points` | objeto | Convex Hull › Número de Puntos | — | sí |
| `convexidad_class` | objeto | — | — | no |
| `convexity_class` | objeto | Convex Hull › Clasificación Convexidad | — | sí |
| `eje_mayor_real_longitud_px` | objeto | — | — | no |
| `hull_height_px` | objeto | — | — | no |
| `hull_points` | objeto | — | — | no |
| `hull_width_px` | objeto | — | — | no |
| `perimeter_px` | objeto | — | — | sí |

### IX. Ejes, Orientación y Posición Espacial

| Clave | Ámbito | CSV | Fórmula (registry) | Documentada |
|---|---|---|---|---|
| `eje_mayor_real_p1` | objeto | — | — | no |
| `eje_mayor_real_p2` | objeto | — | — | no |
| `eje_menor_real_p1` | objeto | — | — | no |
| `eje_menor_real_p2` | objeto | — | — | no |
| `eje_principal_angulo` | objeto | Ejes y Orientación › Eje Principal - Ángulo | — | sí |
| `eje_principal_anisotropia` | objeto | Ejes y Orientación › Anisotropía | — | sí |
| `eje_principal_forma_dominante` | objeto | Ejes y Orientación › Forma Dominante | — | sí |
| `eje_principal_orientacion` | objeto | Ejes y Orientación › Eje Principal - Orientación | — | sí |

### IX-b. Simetría Bilateral

| Clave | Ámbito | CSV | Fórmula (registry) | Documentada |
|---|---|---|---|---|
| `simetria_bilateral` | objeto | Simetría › Simetría Bilateral | `indice [0,1] por reflejo sobre eje mayor` | sí |
| `simetria_clasificacion` | objeto | Simetría › Clasificación | — | sí |
| `simetria_distancia_asimetria` | objeto | Simetría › Distancia Asimetría | — | sí |

### IX-c. Centroide y Posición Espacial

| Clave | Ámbito | CSV | Fórmula (registry) | Documentada |
|---|---|---|---|---|
| `centroide_hull_x` | objeto | Centroide › Centroide X (Hull) | — | no |
| `centroide_hull_y` | objeto | Centroide › Centroide Y (Hull) | — | no |
| `centroide_x` | objeto | Centroide › Centroide X (Real) | — | no |
| `centroide_y` | objeto | Centroide › Centroide Y (Real) | — | no |

### X. Geometría de Vértices

| Clave | Ámbito | CSV | Fórmula (registry) | Documentada |
|---|---|---|---|---|
| `angulo_medio_vertices` | objeto | Vértices y Ángulos › Ángulo Medio | — | no |
| `angulo_predominante` | objeto | Vértices y Ángulos › Ángulo Predominante | — | no |
| `desviacion_angulos` | objeto | Vértices y Ángulos › Desviación Ángulos | — | no |
| `geometria_vertices` | objeto | Vértices y Ángulos › Geometría de Vértices | — | no |
| `num_angulos_agudos` | objeto | Vértices y Ángulos › Ángulos Agudos | — | no |
| `num_angulos_obtusos` | objeto | Vértices y Ángulos › Ángulos Obtusos | — | no |
| `num_angulos_rectos` | objeto | Vértices y Ángulos › Ángulos Rectos | — | no |
| `vertices_aproximados` | objeto | Vértices y Ángulos › Vértices Aproximados<br>Métricas Complementarias › Vértices Aproximados | — | no |

### XI. Forma 3D Inferida

| Clave | Ámbito | CSV | Fórmula (registry) | Documentada |
|---|---|---|---|---|
| `aplanamiento_inferido` | objeto | Forma 3D Inferida › Aplanamiento Inferido | — | no |
| `esfericidad` | objeto | Forma 3D Inferida › Esfericidad | — | no |
| `forma_3d_inferida` | objeto | Forma 3D Inferida › Forma 3D | — | no |
| `oblongacion` | objeto | Forma 3D Inferida › Oblongación | — | no |
| `oblongacion_clasificacion` | objeto | Forma 3D Inferida › Clasificación Oblongación | — | no |

### XII. Estado de Conservación y Fragmentación

| Clave | Ámbito | CSV | Fórmula (registry) | Documentada |
|---|---|---|---|---|
| `area_defecto` | objeto | — | — | no |
| `area_fragmentada` | objeto | Fragmentación › Área Fragmentada | — | no |
| `circularity_fragmentada` | objeto | — | — | no |
| `cobertura_angular` | objeto | — | — | no |
| `compactness_fragmentada` | objeto | — | — | no |
| `completitud_estimada` | objeto | Fragmentación › Completitud Estimada | — | no |
| `defect_area` | objeto | — | — | no |
| `perdida_area_fragmentacion_percent` | objeto | Fragmentación › Pérdida Área (%) | — | no |
| `perdida_perimetro_fragmentacion_percent` | objeto | Fragmentación › Pérdida Perímetro (%) | — | no |
| `perimeter_fragmentado` | objeto | Fragmentación › Perímetro Fragmentado | — | no |
| `tipo_fragmento` | objeto | — | — | no |

### XV. Perforaciones

| Clave | Ámbito | CSV | Fórmula (registry) | Documentada |
|---|---|---|---|---|
| `alto` | objeto | — | — | no |
| `ancho` | objeto | — | — | no |
| `area` | perforacion | Perforaciones › N - Área | — | no |
| `centroid` | objeto | — | — | no |
| `circularidad` | objeto | — | — | no |
| `compacidad` | objeto | — | — | no |
| `distanciaAlCentro` | perforacion | — | — | no |
| `feret_angulo_max` | objeto | Métricas Avanzadas › Ángulo Feret Máximo | — | no |
| `feret_angulo_min` | objeto | Métricas Avanzadas › Ángulo Feret Mínimo | — | no |
| `feret_ratio` | objeto | Métricas Avanzadas › Ratio de Feret | `feret_min / feret_max` | sí |
| `forma_confianza` | objeto | Clasificación › Confianza | — | no |
| `id` | perforacion | — | — | no |
| `metricas` | perforacion | — | — | no |
| `perimetro` | perforacion | Perforaciones › N - Perímetro | — | no |
| `solidez` | objeto | — | — | no |

### XV-b. Horadaciones

| Clave | Ámbito | CSV | Fórmula (registry) | Documentada |
|---|---|---|---|---|
| `area` | horadacion | Horadaciones › N - Área | — | no |
| `distanciaAlCentro` | horadacion | — | — | no |
| `id` | horadacion | — | — | no |
| `metricas` | horadacion | — | — | no |
| `perimetro` | horadacion | Horadaciones › N - Perímetro | — | no |

### XVI. Patrón de Agrupamiento

| Clave | Ámbito | CSV | Fórmula (registry) | Documentada |
|---|---|---|---|---|
| `patron_agrupamiento` | objeto | Patrón de Agrupamiento › Patrón Detectado | — | no |
| `patron_agrupamiento_confianza` | objeto | Patrón de Agrupamiento › Confianza | — | no |
| `patron_agrupamiento_detalles` | objeto | Patrón de Agrupamiento › Detalles | — | no |
| `patron_agrupamiento_patron` | objeto | Patrón de Agrupamiento › Patrón Específico | — | no |

### XVII. Características Geométricas Avanzadas

| Clave | Ámbito | CSV | Fórmula (registry) | Documentada |
|---|---|---|---|---|
| `clasificacion_estrellamiento` | objeto | — | — | no |
| `clasificacion_feret` | objeto | — | — | no |
| `clasificacion_lobularidad` | objeto | — | — | no |
| `estrellamiento_clasificacion` | objeto | Métricas Avanzadas › Clasificación Estrellamiento | — | sí |
| `feret_clasificacion` | objeto | Métricas Avanzadas › Clasificación Feret | — | sí |
| `feret_max_angle` | objeto | — | — | sí |
| `feret_min_angle` | objeto | — | — | sí |
| `indice_estrellamiento` | objeto | Métricas Avanzadas › Índice de Estrellamiento | — | sí |
| `indice_lobularidad` | objeto | Métricas Avanzadas › Índice de Lobularidad | — | sí |
| `max_feret_diameter` | objeto | — | — | sí |
| `min_feret_diameter` | objeto | — | — | sí |

### XVIII. Clasificación y Síntesis

| Clave | Ámbito | CSV | Fórmula (registry) | Documentada |
|---|---|---|---|---|
| `clasificacion_sintesis_final` | objeto | Síntesis Final › Clasificación Integrada<br>Síntesis Final › Descripción | — | no |
| `forma_categoria_base` | objeto | Clasificación › Categoría Base | — | no |
| `forma_detectada_meta` | objeto | — | — | no |
| `forma_detectada_tipologica` | objeto | — | — | no |
| `forma_geometrica_observada` | objeto | — | — | no |
| `forma_metodos_coincidentes` | objeto | Clasificación › Métodos Coincidentes | — | no |
| `forma_razon_tipologica` | objeto | — | — | no |
| `forma_razonamiento` | objeto | Clasificación › Razonamiento | — | no |
| `forma_requiere_reinterpretacion_tipologica` | objeto | — | — | no |
| `forma_tipologica_inferida` | objeto | — | — | no |
| `razon_tipologica` | objeto | — | — | no |
| `shape_class_complexity` | objeto | Clasificaciones › Por Complejidad | — | no |
| `shape_class_solidity` | objeto | Clasificaciones › Por Solidez | — | no |
| `tipologia` | objeto | — | — | no |

### XIX. Información Técnica / Metadatos

| Clave | Ámbito | CSV | Fórmula (registry) | Documentada |
|---|---|---|---|---|
| `analysis_method` | objeto | Metadatos › Método de Análisis | — | no |
| `analysis_timestamp` | objeto | Identificación › Timestamp | — | no |
| `bounding_box_efficiency` | objeto | — | — | no |
| `eccentricity` | objeto | — | — | no |
| `elongacion` | objeto | — | — | no |
| `porosidad` | objeto | Dimensiones Básicas › Porosidad (P/H sobre área bruta) | — | sí |
| `rectangularidad` | objeto | — | — | no |
| `shape_factor_real` | objeto | — | — | no |

### Huérfanos — sin categoría canónica (77)

Claves que alguna superficie emite pero que ninguna sección de la Tabla adjudica.
Cada una es, o bien una métrica sin hogar en el índice, o bien código muerto.

| Clave | Ámbito | CSV |
|---|---|---|
| `anisotropy` | objeto | — |
| `area_neta` | objeto | Dimensiones Básicas › Área Neta (P/H descontadas) |
| `aspect_ratio` | horadacion | Horadaciones › N - Relación de Aspecto |
| `aspect_ratio` | perforacion | Perforaciones › N - Relación de Aspecto |
| `aspect_ratio_resting` | objeto | — |
| `bifacial_homology_index` | objeto | — |
| `bounding_height` | objeto | Dimensiones Básicas › Alto (BB Original) |
| `bounding_width` | objeto | Dimensiones Básicas › Ancho (BB Original) |
| `centroid` | horadacion | Horadaciones › N - Centroide (X)<br>Horadaciones › N - Centroide (Y) |
| `centroid` | perforacion | Perforaciones › N - Centroide (X)<br>Perforaciones › N - Centroide (Y) |
| `circularity` | horadacion | Horadaciones › N - Circularidad |
| `circularity` | perforacion | Perforaciones › N - Circularidad |
| `circularity_proxy` | objeto | — |
| `circularity_real` | objeto | Métricas Complementarias › Circularidad (valor) |
| `compactness` | horadacion | Horadaciones › N - Compacidad |
| `compactness` | perforacion | Perforaciones › N - Compacidad |
| `compactness_3d` | objeto | — |
| `compactness_real` | objeto | Métricas Complementarias › Compacidad (valor) |
| `completitud_cobertura_grados` | objeto | Fragmentación › Cobertura Angular |
| `completitud_tipo_fragmento` | objeto | Fragmentación › Tipo de Fragmento |
| `contour_extraction_successful` | objeto | Metadatos › Extracción Exitosa |
| `convex_hull_volume` | objeto | — |
| `convexity` | horadacion | Horadaciones › N - Convexidad |
| `convexity` | perforacion | Perforaciones › N - Convexidad |
| `convexity_defects` | objeto | — |
| `convexity_perim` | objeto | — |
| `convexity_proxy` | objeto | — |
| `convexity_real` | objeto | Métricas Complementarias › Convexidad |
| `curvatura_local` | objeto | — |
| `efa_coefficients` | objeto | — |
| `eje_mayor` | horadacion | Horadaciones › N - Eje Mayor |
| `eje_mayor` | perforacion | Perforaciones › N - Eje Mayor |
| `eje_menor` | horadacion | Horadaciones › N - Eje Menor |
| `eje_menor` | perforacion | Perforaciones › N - Eje Menor |
| `excentricidad` | horadacion | Horadaciones › N - Excentricidad |
| `excentricidad` | perforacion | Perforaciones › N - Excentricidad |
| `forma_confianza_global` | objeto | Clasificación › Confianza Global |
| `forma_detectada` | horadacion | Horadaciones › N - Forma Detectada |
| `forma_detectada` | perforacion | Perforaciones › N - Forma Detectada |
| `forma_idealizada_tipo` | objeto | Clasificación › Forma Idealizada |
| `forma_idealizada_vertices` | objeto | Clasificación › Vértices Idealizados |
| `forma_razon` | objeto | Clasificación › Razonamiento |
| `fractal_dimension` | objeto | — |
| `glcm_contrast` | objeto | — |
| `glcm_energy` | objeto | — |
| `glcm_entropy` | objeto | — |
| `height` | horadacion | Horadaciones › N - Alto<br>Horadaciones › N - Dimensiones (W×H) |
| `height` | perforacion | Perforaciones › N - Alto<br>Perforaciones › N - Dimensiones (W×H) |
| `hull_area_px` | objeto | Convex Hull › Área |
| `hull_perimeter_px` | objeto | Convex Hull › Perímetro |
| `lobularidad_clasificacion` | objeto | Métricas Avanzadas › Clasificación Lobularidad |
| `numero_objeto` | objeto | Identificación › Número de Objeto |
| `object_id` | objeto | Identificación › ID del Objeto |
| `perimeter` | horadacion | Horadaciones › N - Perímetro |
| `perimeter` | perforacion | Perforaciones › N - Perímetro |
| `perimetro_neto` | objeto | Dimensiones Básicas › Perímetro Neto (incluye bordes de P/H) |
| `posicion_radial_px` | objeto | Error e Incertidumbre Óptica › Posición Radial |
| `radio_maximo` | horadacion | Horadaciones › N - Radio Máximo |
| `radio_maximo` | perforacion | Perforaciones › N - Radio Máximo |
| `radio_medio` | horadacion | Horadaciones › N - Radio Medio |
| `radio_medio` | perforacion | Perforaciones › N - Radio Medio |
| `radio_minimo` | horadacion | Horadaciones › N - Radio Mínimo |
| `radio_minimo` | perforacion | Perforaciones › N - Radio Mínimo |
| `ratio_radios` | horadacion | Horadaciones › N - Ratio de Radios |
| `ratio_radios` | perforacion | Perforaciones › N - Ratio de Radios |
| `regularidad_radial` | horadacion | Horadaciones › N - Regularidad Radial |
| `regularidad_radial` | perforacion | Perforaciones › N - Regularidad Radial |
| `scale_factor` | objeto | Metadatos › Factor de Escala |
| `solidity` | horadacion | Horadaciones › N - Solidez |
| `solidity` | perforacion | Perforaciones › N - Solidez |
| `sphericity_wadell` | objeto | — |
| `thickness_ratio` | objeto | — |
| `transverse_area_cv` | objeto | — |
| `transverse_thickness_cv` | objeto | — |
| `volume` | objeto | — |
| `width` | horadacion | Horadaciones › N - Ancho<br>Horadaciones › N - Dimensiones (W×H) |
| `width` | perforacion | Perforaciones › N - Ancho<br>Perforaciones › N - Dimensiones (W×H) |
