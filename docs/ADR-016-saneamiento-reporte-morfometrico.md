# ADR-016 — Saneamiento del reporte morfométrico (PDF/HTML)

**Estado:** Propuesto
**Fecha:** 2026-07-01
**Autor:** JFRR + Claude Code
**Relacionado:** ADR-011 (taxonomía canónica de categorías), ADR-006 (repertorio canónico),
ADR-007/008 (contrato de detección + confianza), ADR-015 B3 (propagación de incertidumbre),
`docs/APORTE-MAO-PROTEC2025.md`

---

## Contexto y decisión

Un reporte real ejecutado por la app (`CDF20_286_27_IA_001_CaraA_reporte_MAO.pdf`, MAO 1.2.0,
2026-06-30, colección UAB) fue auditado contra el estándar «a prueba de revisor» de
`APORTE-MAO-PROTEC2025.md`. **Estructuralmente cumple** (entrega el pool completo, error óptico con
propagación IX-B, EFA Kuhl-Giardina, simetría, P/H-siempre, conservación). Pero contiene **11
inconsistencias visibles** —una de unidades, varias de valores contradictorios/duplicados, y un
contrato de detección no propagado— que un revisor o coautor detectaría de inmediato, y una de las
cuales **contradice la tesis científica del artículo** (una cuenta circular clasificada como
«fracturada/erosionada»).

**Decisión:** sanear el generador del reporte de forma aditiva y verificable, atacando primero los
defectos que producen números erróneos y los que afectan el mensaje científico. **Raíz común
diagnosticada:** el renderer (`js/modules/tabla-metricas-completa.js`) lee claves de métrica que no
coinciden con las que emite el backend/contrato y cae silenciosamente a `|| 0` o a un **alias
divergente** — exactamente el problema que ADR-011 (manifiesto canónico) debía cerrar y que **no se
migró a este renderer** (F2–F6 de ADR-011 pendientes).

## Invariantes

- **Aditivo y reversible:** correcciones de mapeo/formato y unidades; sin tocar el cálculo de métricas.
- **Gated:** cada fix con su verificación; nunca renderizar `0`/`N/A` como si fuera un valor válido
  (preferir «Sin datos» explícito, contrato ADR-011).
- **Fuente única:** las claves de métrica deben resolverse vía el manifiesto canónico (ADR-011),
  no por aliases hardcodeados por sección.

---

## Inventario de hallazgos

Severidad: 🔴 número erróneo / vergonzoso en revisión · 🟠 inconsistencia o contrato no propagado ·
🟡 cosmético.

| # | Sev | Hallazgo (sección del PDF) | Causa raíz (archivo:línea) | Fix |
|---|-----|----------------------------|-----------------------------|-----|
| 1 | 🔴 | «Ancho BB 630.00 mm · Alto BB 496.00 mm» en objeto de 16 mm (Sec. II). Son **px** rotulados mm. **Se propaga a IX-B** (`width 630 mm ±0.16`) | `tabla-metricas-completa.js:227-228` toma `metricas.width/height` (px) y `:277` rotula «mm» | Convertir a mm con la escala (o usar `tight_*_mm`); corregir también la fuente de `width/height` que consume IX-B |
| 2 | 🔴 | Excentricidad **0.000** (Sec. I) vs **0.6005** (Sec. III) en el mismo reporte | Dos claves distintas: `:371` `metricas.excentricidad` vs `:445` `metricas.eccentricity` | Unificar a la clave canónica (ADR-011); una sola definición |
| 3 | 🔴 | Regularidad Radial **71.56** (Sec. IV) vs **7156.0 %** (Sec. XII-a) | Mismo `regularidad_radial` renderizado con dos convenciones (`:523` raw vs render ×100+«%») | Convención única; si es %, normalizar el valor fuente |
| 4 | 🔴 | «Circularidad del Hull **0.0000** · Aspect Ratio del Hull **0.0000**» (Sec. IV-b) | `:2097-2098` `metricas.hull_circularity/hull_aspect_ratio` inexistentes → `|| 0` | Mapear a la clave real o computar; si falta, «Sin datos», no `0` |
| 5 | 🟠 | «Método detección N/A · Confianza detección — (N/A)» en objeto **IA** (cabecera) | La cabecera no lee `detectionMethod`/`detection_confidence` del contrato ADR-007/008 | Consumir los campos del contrato en el generador de cabecera |
| 6 | 🟠 | Cuenta circular (circ 0.948, simetría 0.964) clasificada **«Muy rugoso (fracturado/erosionado)»**, «Muy sinuoso», «esquinas pronunciadas» (Sec. V, V-b). **Contradice la tesis del paper** | **NO es umbral: es definición de métrica.** `rugosidad = CV de longitudes de segmento` (`metrics.py:275`) mide la **no-uniformidad del muestreo** de puntos del contorno (72 pts mal distribuidos → CV 1.17), no la rugosidad física del borde → sensible al muestreo | Redefinir la métrica a una robusta al muestreo (p. ej. exceso de perímetro `P_real/P_hull` o desviación vs. contorno suavizado). Math-critical: **requiere tests + cambia un valor reportado** → pase propio, no parche de umbral |
| 7 | 🟠 | «Diferencia de Área 0.0 %» (Sec. IV-b) contra Solidez 0.980 / Convexidad 0.923 | Diferencia hull-contorno hardcodeada/no calculada | Derivar de `1 − solidez`; coherencia con solidez |
| 8 | 🟡 | Ángulos Feret **0.0°/0.0°** (Sec. XII-a) no calculados | Campos no poblados | Poblar o marcar «Sin datos» |
| 9 | 🟡 | «Pérdida Perímetro **−8.30 %**» (pérdida negativa, confuso) | Signo/etiqueta | Reetiquetar «variación de perímetro» o acotar a ≥0 |
| 10 | 🟡 | «Ejes Reales (p1/p2) [N/A]» (Sec. VI) en objeto 2D | Nivel P (proxy 3D) sin dato en 2D | Ocultar la fila si no aplica (no imprimir N/A) |
| 11 | 🟡 | Distancia de Asimetría **10.07 mm** en tensión con «excelente simetría» (Sec. XI-b) | Definición/escala del desplazamiento del eje | Revisar definición; contextualizar vs tamaño del objeto |

## Raíz común

Los hallazgos 1–4 (y en parte 7) comparten la **misma patología**: el renderer resuelve claves por
sección con aliases hardcodeados (`metricas.excentricidad` vs `metricas.eccentricity`,
`hull_circularity` inexistente, `width` en px sin convertir) y **enmascara el fallo con `|| 0`**. Es
la deriva taxonómica que ADR-011 diagnosticó entre panel/tabla/CSV/PDF. **Este ADR es, de facto, la
aplicación de ADR-011 (F2–F6) al reporte** + fixes de unidades/umbral que ADR-011 no cubría.

## Plan de fixes por fases

| Fase | Foco | Hallazgos |
|------|------|-----------|
| **F1** | Números erróneos + mensaje científico | 1 (unidades, contamina IX-B), 2, 3, 4, 6 |
| **F2** | Contrato e inconsistencias | 5 (detección/confianza), 7 |
| **F3** | Cosmético / ruido | 8, 9, 10, 11 |

**Arranque recomendado:** F1, empezando por **#1** (el bug de unidades ensucia la incertidumbre
óptica, que es el diferenciador estrella) y **#6** (que contradice la tesis del artículo).

## Estado de implementación

| Hallazgo | Estado | Detalle |
|----------|--------|---------|
| #1 unidades BB | ✅ Implementado | `tabla-metricas-completa.js:227` — convierte px→mm con factor `√(area/area_px)` si el BB empequeñece al Feret |
| #2 excentricidad dup | ✅ Implementado | `:456` — `metricas.eccentricity` → `excentricidad` (clave canónica) |
| #3 regularidad ×100 | ✅ Implementado | `:2322` y summary — quitado `*100`+`%`; umbrales de color a escala 0-100 |
| #4 hull 0.0000 | ✅ Implementado | circularidad calculada `4π·A/P²` en px; aspect = `aspect_ratio_tight` |
| #7 dif. área 0.0% | ✅ Implementado | mapeado a `perdida_area/perimetro_fragmentacion_percent` |
| #5 detección N/A | ⬜ Pendiente | Cabecera generada en otro path (batch de colección, `collection.js`/`comparator.js`, no en este renderer). Consumir `detectionMethod`/`detection_confidence` del contrato ADR-007/008 |
| #6 rugosidad | ✅ Resuelto **semánticamente** | **Decisión JFRR 2026-07-02: el fallo es semántico, no matemático.** La medición (CV de segmentos) es FIEL al objeto y NO se toca; solo se neutraliza el rótulo diagnóstico. `metrics.py:281` «Muy rugoso (fracturado/erosionado)» → «(contorno de alta variabilidad)»; `:259` «(esquinas pronunciadas)» → «(alta variación de curvatura local)». Motivo: «fracturado/erosionado» diagnosticaba daño y contradecía la sección de conservación («excelente estado»); una herramienta de morfometría mide fiel y no falsea ni sobre-interpreta el dato. **Descarta la redefinición de métrica** (habría alterado el número). Ningún test depende de los strings |
| #1/#4/#7 en CSV | ✅ Implementado | Mismos errores factuales (no semánticos) presentes en `project-manager.js` (superficie CSV): BB px→mm, hull circularidad calculada, dif. área → `perdida_area_fragmentacion_percent`. Verificado con datos reales DRG16: BB 547→5.43 mm, hull 0→0.994, dif 0→1.9%. Cache-bust `project-manager.js?v=20260701a` |
| #8 ángulos Feret 0.0° | ✅ Implementado | `:2283-2284` — leía `feret_max_angle`/`min` (inexistente) → `feret_angulo_max`/`min`. **Detectado por el test de coherencia** al extender el contrato |
| **+bug feret_clasificacion** | ✅ Implementado | `:2282` — leía `clasificacion_feret` (inexistente) → `feret_clasificacion`. Causaba «Clasificación Feret: No clasificado». **Detectado por el test** |
| #9–#11 | ⬜ Pendiente | F3 cosmético |

**Enforcement — test de coherencia inter-superficie:** `python/tests/test_coherencia_entrega.py`
(estático, lee los `.js` como texto). Contrato de campo con **13 métricas canónicas** (índices de
forma, feret, simetría, regularidad). Enforce: (a) la clave canónica existe en `metrics.py`;
(b) ninguna superficie lee un alias no-canónico como ÚNICA fuente (clase #2); (c) `regularidad_radial`
no se reescala ×100 (#3); (d) el BB se convierte px→mm (#1). Teeth verificado. **Al extender el
contrato encontró los bugs #8 y feret_clasificacion.** Es la red permanente que ADR-011 no cableó.

Verificación de lo implementado: `node -c` limpio sobre `tabla-metricas-completa.js`.
**Pendiente:** cache-bust `?v=` en `index.html` + regenerar el PDF del objeto de fixture en Electron.

## Gate de verificación

- **#1:** BB en mm coherente con eje mayor/Feret (mismo orden de magnitud); IX-B ya no muestra
  centenares de mm; test sobre el objeto de fixture.
- **#2/#3/#4:** un solo valor por métrica en todo el reporte; sin `0.0000` de relleno; cotejo
  cruzado panel↔tabla↔CSV↔PDF (contrato de coherencia ADR-011).
- **#6:** la cuenta de fixture (circular, regular) deja de clasificarse como «fracturada/sinuosa».
- Global: `node -c` limpio + suite ≥ 302/2 + verificación visual del PDF regenerado en Electron
  (lección transversal: `node -c`/health no ven el layout ni los números de runtime).
- **Cache-bust:** al editar `tabla-metricas-completa.js`, subir su `?v=` en `index.html`.
