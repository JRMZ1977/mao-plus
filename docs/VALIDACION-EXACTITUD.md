# Validación de Exactitud y Reproducibilidad — MAO Plus
## Protocolo ADR-015 F1 (A1 + A2 + C3)

**Fecha de protocolo:** 2026-09-12  
**Versión MAO:** `analysis-core.js?v=20260912e`, `python/modules/metrics.py`  
**Suite:** 392 passed / 4 skipped (7 pre-existentes `test_comparator.py` por `sklearn` no instalado)

---

## A1 — Exactitud (Trueness) — Análisis Bland-Altman

### Objeto de medición

Objetos sintéticos con verdad geométrica conocida exactamente:
- **Círculos**: 5 especificaciones (r = 2.5–10 mm, distintas escalas px/mm)
- **Elipses**: 5 especificaciones (ejes a/b distintos, relaciones 2:1 a 3:1)

Los valores de referencia son fórmulas analíticas:
- Área: `A = π·r²` (círculo) o `A = π·a·b` (elipse)
- Perímetro: `P = 2πr` (círculo) o Ramanujan (elipse, error < 10⁻⁷)
- Circularidad: `C = 4πA/P²` → 1.0 exacto para círculo perfecto

### Resultados (sintéticos, n=5 por tipo)

| Métrica | Tipo | MAE% | Sesgo% | LoA inferior | LoA superior | ≥90% en LoA |
|---------|------|-------|--------|--------------|--------------|-------------|
| Área | Círculos | < 1% | < 0.5% | — | — | ✅ |
| Área | Elipses | < 1% | < 0.5% | — | — | ✅ |
| Perímetro | Círculos | < 1% | < 0.5% | — | — | ✅ |
| Perímetro | Elipses | < 1% | < 0.5% | — | — | ✅ |
| Circularidad | Círculos | < 1% | < 0.1% | — | — | ✅ |

**Todos los tests con umbral MAE < 5% pasan. Gate A1: ✅**

### Limitaciones del protocolo sintético

- Los objetos son contornos vectoriales perfectos, no imágenes reales.
- Para un reporte publicable, reproducir con piezas físicas calibradas  
  (regla micrométrica de sección circular conocida fotografiada a distintas distancias).
- La discretización del contorno introduce error sistemático bajo (< 0.5%) 
  que desaparece con n de puntos alto (≥ 200 puntos).

### Interpretación

El motor de métricas de MAO Plus produce valores dentro del **umbral metrológico de < 5% MAE** 
en área, perímetro y circularidad para objetos de geometría conocida. El sesgo sistemático 
es < 0.5% en área, lo que indica que la fórmula Shoelace (área del contorno) y la conversión 
px → mm (scale_px_mm) son correctas.

---

## A2 — Reproducibilidad (ICC)

### Protocolo

- **n objetos**: 6 (3 círculos + 3 elipses de distintos tamaños)
- **n repeticiones** por objeto: 5 (perturbaciones gaussianas ±0.3 px, ≈ ±0.03 mm a escala 0.10)
- **Modelo ICC**: ICC(2,1) two-way mixed, absolute agreement (Shrout & Fleiss tipo 2)
- El ruido ±0.3 px simula la digitalización manual por observadores distintos o la variabilidad  
  de la segmentación automática entre corridas con GrabCut desactivado (ADR-013 F2)

### Resultados

| Métrica | ICC | Interpretación | n_sujetos | n_raters |
|---------|-----|---------------|-----------|----------|
| Área | ≥ 0.90 | Excelente | 6 | 5 |
| Circularidad | ≥ 0.75 | Bueno o mejor | 6 | 5 |

**Gate A2: ✅** — varianza entre objetos >> varianza del método.

### Evidencia de ausencia de sesgo por varianza del método

Test de separación de varianzas: la varianza **entre** objetos (diferente tamaño/forma) 
supera la varianza **dentro** de cada objeto (repeticiones del mismo), lo que indica que 
el método es consistente y la fuente de variación dominante es el objeto real, no el método.

---

## C3 — Cuantificación de Estandarización (CV + Bootstrap)

### Módulo implementado

`python/modules/standardization.py` — funciones principales:

| Función | Descripción |
|---------|-------------|
| `coefficient_of_variation(values)` | CV (%) con n, media, std |
| `bootstrap_ci(values, stat, n_boot, seed)` | IC bootstrap por percentil (reproducible) |
| `standardization_report(groups, ...)` | CV + IC por morfotipo |
| `contrast_groups(group_a, group_b)` | Contraste IC entre dos morfotipos |
| `estandarizacion_report(collection_by_group, metrics)` | Reporte completo para paper |

### Interpretación del CV

| CV (%) | Interpretación |
|--------|---------------|
| < 10% | Alta estandarización (proceso controlado) |
| 10–20% | Estandarización moderada |
| > 20% | Baja estandarización (alta variabilidad) |

### Escenario La Draga (simulación)

Datos sintéticos que reproducen el caso arqueológico del artículo PROTEC:
- **Cuentas discoidales** (n=35): diámetro ≈ 8mm, σ ≈ 0.5mm → **CV ≈ 6%** (alta estandarización)
- **Fragmentos sin forma controlada** (n=30): distribución uniforme → **CV > 25%** (baja estandarización)

Los IC bootstrap al 95% están bien delimitados y no se solapan entre grupos.  
El contraste es estadísticamente conclusivo (IC del CV separados).

**Gate C3: ✅** — CV + IC bootstrap correctos sobre datos con dispersión conocida; contraste entre grupos detectado.

---

## Reproducibilidad del protocolo

Todos los tests usan `seed` fijo (42 por defecto) para las remuestras bootstrap y los  
generadores de contornos. La salida es idéntica en cualquier máquina con el mismo Python.

```bash
# Ejecutar suite de validación completa
PYTHONPATH=. python3 -m pytest python/tests/test_validation_accuracy.py \
                                 python/tests/test_reproducibility.py \
                                 python/tests/test_standardization.py -v
```

---

## Próximos pasos (para certificación publicable)

1. **A1 con objetos físicos**: fotografiar piezas de geometría conocida (p. ej. calibres circulares  
   de joyería/pedrería) con la misma cámara y configuración que las colecciones arqueológicas.  
   Documentar sesgo y LoA por métrica en este mismo fichero.

2. **A2 inter-observador real**: que dos investigadores digiten el mismo conjunto de objetos  
   de forma independiente. Calcular ICC con los contornos reales.

3. **C3 sobre La Draga**: aplicar `estandarizacion_report` al dataset real de cuentas de calaíta  
   una vez que el motor morfométrico haya procesado la colección completa.
