# Plan de mejoras MAO Plus — tablero de seguimiento

> **Especificación técnica completa:** `docs/ADR-015-plan-mejoras-matematicas.md`.
> Este documento es el **tablero vivo**: prioridades, secuencia y estado por mejora.
> Premisa: *superar brechas frente a las herramientas de referencia + optimizar las capacidades
> matemáticas*. Origen: auditoría de posicionamiento 2026-07-01 (`docs/APORTE-MAO-PROTEC2025.md`).

## Diagnóstico de partida

MAO cumple el estándar científico **de motor** (y va por delante en 2 criterios: presupuesto de
error óptico por medición + homología canónica 2D↔3D). Las brechas son **(1) de certificación**
(validación empírica no publicada) y **(2) de profundización matemática** (modelo óptico no
calibrado, presupuesto de error incompleto, morfoespacio externalizado, simetría por diferencia de
métricas). El plan ataca ambas de forma aditiva y gated por tests.

## Tablero

| # | Mejora | Brecha / optimización | Prioridad | Fase | Estado |
|---|--------|-----------------------|-----------|------|--------|
| A1 | Validación de exactitud (Bland‑Altman, LoA) | Certificación (Eje 2) | 🔴 Crítico | F1 | ✅ Implementado (`test_validation_accuracy.py`, `validation_stats.py`) |
| A2 | Reproducibilidad inter/intra‑observador (ICC) | Certificación (Eje 2) | 🔴 Crítico | F1 | ✅ Implementado (`test_reproducibility.py`, ICC(2,1) en `validation_stats.py`) |
| C3 | Cuantificar estandarización (CV + bootstrap) | Aporte del paper | 🔴 Paper | F1 | ✅ Implementado (`standardization.py`, `test_standardization.py`) |
| B1 | Calibrar modelo óptico (Zhang → sin ±30%) | Optimiza diferenciador estrella | 🟠 Alto | F2 | ✅ Implementado (`optical_calibration.py` + 19 tests, commit `217aaba`) |
| B2 | Término de relieve/paralaje | 3ª fuente del budget | 🟠 Alto | F2 | ⬜ Pendiente |
| B3 | Propagar incertidumbre de escala | Budget completo (RSS 3 fuentes) | 🟠 Alto | F2 | ⬜ Pendiente |
| D1 | Simetría bilateral formal (Klingenberg) | Upgrade bifacial | 🟠 Alto | F2 | ⬜ Pendiente |
| D3 | Corte de armónicos EFA por varianza | Rigor reportado | 🟡 Medio | F2 | ⬜ Pendiente |
| C1 | Morfoespacio integrado (PCA/CVA) | Mayor brecha vs Momocs | 🟠 Alto | F3 | ⬜ Pendiente |
| C2 | Selección de métricas independientes (VIF) | Pool con multicolinealidad | 🟡 Medio | F3 | ⬜ Pendiente |
| D2 | Pose 3D robusta + mallas no‑watertight | Límites 3D conocidos | 🟡 Medio | F3 | ⬜ Pendiente |
| E1 | GM por landmarks (opcional) | Paradigma ausente | 🟢 Largo plazo | F4 | ⬜ Diferido |

Leyenda estado: ⬜ Pendiente · 🟡 En curso · ✅ Implementado · ⏸ Diferido.

## Secuencia recomendada

1. **F1 — Certificación (habilita PROTEC 2025):** `A1 + A2 + C3`. Son protocolos de validación, no
   reescrituras: convierten "motor a nivel de estándar" en "estándar demostrado" y aportan el
   análisis de estandarización de las cuentas de La Draga.
2. **F2 — Optimización del núcleo:** `B1 + B2 + B3` completan y calibran el presupuesto de
   incertidumbre; `D1` eleva el bifacial a descomposición simétrico/asimétrico; `D3` casi gratis.
   **Adelantar B1 y D1** ya en F1 si el paper los necesita (refuerzan el argumento de control técnico
   sobre ornamentos).
3. **F3 — Brechas analíticas:** `C1` (elimina la dependencia de R/Momocs) → precedido por `C2`; `D2`.
4. **F4 — Paradigma (opcional):** `E1`, solo si se decide competir en GM por landmarks.

## Nota de coherencia

Casi todo es **aditivo sobre lo ya existente**: `variance_explained` ya está (D3), el pool métrico
ya está (C1/C2), el módulo óptico ya está (B1/B2/B3). No hay reescrituras de riesgo; es
profundización. Registrar avances aquí **y** en `docs/ESTADO-ADRS.md` (fila ADR-015).

## Backlog del análisis Procrustes (sin priorizar)

Ideas propuestas el 2026-04-13 para `js/procrustes.js` que no se implementaron y no forman parte de
ADR-015. De aquella lista ya están en el código el filtrado de outliers, la puntuación del
alineamiento, la exportación CSV/JSON, la energía de flexión TPS y el PCA de formas. Origen:
`artefactos/MEJORAS_ANALISIS_PS.md` (retirado; el detalle queda en el respaldo físico de la carpeta).

| Idea | Qué aportaría |
|------|---------------|
| Semilandmarks con resolución adaptativa | Elegir N según la complejidad del contorno: remuestrear a 16, 32, 64… y parar cuando la varianza explicada deja de crecer |
| Vectores de deformación | Flechas A→B por semilandmark (magnitud y ángulo) para ver en qué regiones difieren las formas |
| Rejilla de deformación TPS | Interpolar la deformación a todo el plano y dibujarla como rejilla deformada (hoy la TPS solo da la energía de flexión) |
| Intervalo bootstrap de la distancia de Procrustes | ρ con intervalo al 95 % por remuestreo con reemplazo, para distinguir diferencia real de azar |
| Matriz de rotación visualizada | Ejes rotados en el lienzo con ángulo, reflexión y det(R) del alineamiento |
| Histograma de residuos | Distribución de los errores de alineamiento: media, desviación, asimetría y curtosis |
| Tabla comparativa del par | ρ, ISB, tamaño relativo, rotación, reflexión, calidad y solapamiento, lado a lado |
| Guardar el estado del análisis | Versión, parámetros (N, normalización), semilla y entradas, para repetir el análisis exacto |
| Caché de cálculos intermedios | No recalcular remuestreo y normalización si los puntos y N no cambiaron |
| GPA en un Web Worker | Que las iteraciones del GPA no bloqueen la interfaz |

`D1` (Klingenberg) y `E1` (GM por landmarks) también trabajan sobre superposición Procrustes:
conviene revisar este backlog al abordarlos.
