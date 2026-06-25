# ADR-013 — Separación figura-fondo primaria; separación de instancias subordinada y no destructiva

- **Estado:** 🟡 **Aprobado + Fase 1 implementada (2026-06-25)** · pendiente verificación visual en
  Electron. **Fase 2 (replicabilidad del contorno) aprobada — implementación pendiente.** Refina
  (no contradice) ADR-012.
- **Decisión JFRR:** la separación **figura-fondo** (objeto vs fondo) es la tarea **primaria** del
  núcleo de detección y debe **siempre** producir un contorno cerrado del objeto dominante. La
  separación de **instancias** (objetos pegados / watershed) es **secundaria**, condicionada por
  evidencia y **no destructiva**: nunca puede dejar al objeto por debajo de un contorno recuperable.

## Problema

Toda la matemática de MAO (área, perímetro, circularidad, EFA, Procrustes, métricas 3D) cuelga de
**un contorno cerrado del objeto**. La detección, por tanto, no es «encontrar objetos» sino
**garantizar el contorno figura-fondo del objeto dominante**.

En ADR-012 (detección monolítica) la separación de instancias —`_separate_touching_watershed`,
activada por `separate_touching` y, tras ADR-012 F3, también en los modos manuales del modal IA—
quedó **enredada** con la separación figura-fondo. Cuando el watershed se equivoca, **destruye** el
contorno en vez de degradar con gracia.

**Evidencia (imagen real `DRG16_NC1263_875_a_242.JPG`, artefacto anular de piedra):**

| Camino | Objetos |
|---|---|
| Otsu **plano** (pre-F3, `findContours RETR_EXTERNAL`) | **1** ✅ |
| Otsu **+ watershed** (línea 399, F3) | **8** ❌ (objeto único fragmentado en arcos) |
| Núcleo **Auto** (GrabCut) | 3 (sin fragmentar el objeto) |

Ablación: la **máscara Otsu cruda tenía 24 componentes y 73 huecos internos** (textura de la piedra).
El watershed siembra un marcador por cada máximo de la transformada de distancia → con esa textura
genera **máximos espurios** y parte el objeto. El umbral Otsu **no** es el culpable (plano = 1
objeto); el culpable es alimentar al watershed una **máscara sucia**. El Auto aguanta porque GrabCut
produce una máscara **limpia y sólida** → picos de distancia únicos.

## Premisa → invariante

> **Invariante del contorno.** La detección **siempre** devuelve ≥1 contorno cerrado válido del
> objeto dominante del ROI. La separación de instancias puede **añadir** fronteras, pero **nunca**
> reducir el resultado por debajo de un contorno recuperable, y la **unión** de las piezas debe
> reconstruir la máscara figura-fondo.

## Decisión — dos etapas, jerarquía explícita

1. **Etapa 1 · Figura-fondo (PRIMARIA, siempre).** Núcleo canónico de ADR-012 (Z-scan/CLAHE/GrabCut)
   → máscara → `MORPH_CLOSE` + relleno de huecos (los huecos reales se snapshotean **antes** para
   P/H, ADR-009) → `RETR_EXTERNAL` → contorno. Cascada de respaldo modelo → umbral → bordes; baja
   confianza se **reporta** (sistema de confianza ADR-007/008), nunca se devuelve «0 contornos en
   silencio».
2. **Etapa 2 · Separación de instancias (SECUNDARIA, condicionada, no destructiva).** El watershed
   solo divide con **evidencia** (≥2 picos de distancia bien separados sobre máscara **limpia**) y de
   forma **no destructiva** (la unión de piezas reconstruye la máscara de la etapa 1). Si la división
   no es plausible, se conserva el contorno único.

## Puntos de entrada de detección (priors), no métodos rivales

**Pregunta JFRR (2026-06-25):** ¿hace falta mantener la detección **manual** o basta con la **IA**,
que es «más completa»? La pregunta tiene una premisa que esta sección corrige.

**Tras ADR-012, «manual» e «IA» no son métodos de detección distintos: son la misma máquina.** Los
cuatro modos (automático, manual de área, IA, componente) enrutan al **mismo núcleo OpenCV**. La «IA»
**no detecta mejor** — lo único genuinamente neuronal es **SAM**. La ventaja del modal IA es de
**UI/flujo** (parámetros, confianza, tabla, export), no de inteligencia de detección. De hecho, la
sobre-segmentación que motivó este ADR vivía **dentro** del modal IA (rama Otsu): «más completo»
también trajo «más maneras de configurarlo mal».

**El eje que sí importa para la premisa es: imagen completa (automático) vs acotado (ROI/manual).** La
separación figura-fondo robusta a menudo **necesita el prior espacial humano** («el objeto está
AQUÍ»). El caso `DRG16` lo demostró: sobre la imagen completa (artefacto + regla + sombras) la
detección se confundía; con un **ROI** alrededor del artefacto → **1 contorno limpio (8→1)**. El
ROI/manual **no es redundante con la IA**: es el prior que **hace cumplir el invariante del contorno**.

### Decisión

| Se conserva | Razón |
|---|---|
| **Capacidad manual / ROI** | Prior espacial **esencial** para el invariante del contorno |
| **Modo automático** (imagen completa) | Caso rápido con un solo objeto limpio |
| **SAM** | Único prior genuinamente neuronal (complementario) |

| Se consolida / retira | Razón |
|---|---|
| Motores de segmentación duplicados | Ya unificados por ADR-012 (un núcleo) |
| Sub-modo «clic por componente» | Ya es fallback JS; redundante con el watershed de etapa 2 |
| **Superficies de UI** (3 botones para 1 motor) | Reducir a menos puntos de entrada |

- **No es «solo IA».** Es **un banco de trabajo único que incluye el modo manual/ROI dentro**, con
  **«Auto (núcleo OpenCV)» como default en todo punto de entrada** (Otsu solo como ajuste avanzado).
  Si el modal IA ya tiene ROI + núcleo + confianza + export, puede ser ese banco; entonces el modo
  manual **no desaparece, se absorbe**.
- **Resumen:** se unifica el **motor** (uno) y la **jerarquía** (figura-fondo > instancias); se
  conservan los **priors** (imagen completa, ROI manual, SAM) porque cada uno es una forma distinta de
  **garantizar el contorno correcto**. El mapeo concreto botón-a-botón se ejecuta junto al plan de
  simplificación de botones (UI), no en esta fase de núcleo.

## Fase 1 — implementado

### F1 · Máscara de siembra limpia en `_separate_touching_watershed` ([detection.py](../python/modules/detection.py))
Antes de la transformada de distancia se construye una **máscara de siembra** = `MORPH_CLOSE`
(kernel ∝ √min_area, acotado 3–15) + **relleno de huecos** (`RETR_EXTERNAL` sólido, nuevo helper
`_fill_holes`) + **descarte de componentes < `min_area`** (specks de textura). Las semillas, el
umbral relativo (0.5·max local) y el fondo seguro se calculan sobre esa máscara limpia. El **reparto
final** intersecta cada cuenca con la **máscara ORIGINAL** (`& bin_mask`), preservando huecos P/H y
los píxeles exactos. Guards conservados: `n_seeds ≤ 2 → None`, filtro por `min_area`, `n_objs ≤ 1 →
None`. Efecto: una máscara texturada de objeto único colapsa a **1 componente sólido → 1 pico → no
divide**; dos objetos genuinamente pegados conservan **2 picos → divide en 2**.

## Verificación
- **Imagen real** (artefacto anular, Otsu+CLAHE+invert del usuario): **8 → 1** objeto.
- **`sintetico_pegados.png`** (2 discos en contacto): sigue separando en **2**.
- **Auto/núcleo** (máscara GrabCut ya limpia): sin cambio (limpiar una máscara limpia ≈ no-op).
- Suite `pytest tests/ python/tests/` sin regresiones.

## Reversibilidad
Aditivo y acotado a `_separate_touching_watershed`. Revertir = restaurar el cuerpo previo de la
función (la máscara cruda) — no toca el núcleo figura-fondo ni los llamadores.

## Fase 2 — Replicabilidad del contorno (aprobada · implementación pendiente)

La etapa de contorno (`contour.extract`) es el punto **más crítico** de la premisa: de ahí salen
área, perímetro, circularidad, EFA y todas las métricas. Para la ciencia de MAO, lo decisivo no es
que el contorno «ajuste bonito» una vez, sino que sea **reproducible**. La inflación/ruido del borde
es un **síntoma**; el invariante es la replicabilidad.

### Invariante de replicabilidad del contorno

> Para un mismo objeto, la extracción del contorno debe ser:
> - **(a) Determinista** — mismo input → contorno **byte-idéntico** (sin azar).
> - **(b) Invariante al ROI/modo** — automático, manual, IA y distintos encuadres del ROI →
>   **mismo contorno dentro de tolerancia**.
> - **(c) Persistente** — el contorno guardado es la **fuente de verdad**; reabrir/reanalizar no
>   recalcula uno distinto en silencio.

### Evidencia empírica (imagen real `DRG16_NC1263_875_b_243.JPG`, anillo oscuro sobre blanco)

| Prueba | Resultado |
|---|---|
| `contour.extract` × 3 (mismo input) | ✅ **Determinista** (hash idéntico `7a5f067fdf`) |
| `cv2.grabCut` × 3 (mismo crop) | ⚠️ **NO determinista** (232102 / 232109 / 232483 px) |
| Mismo objeto, ROI ±desplazado | ⚠️ área **227k → 258k → 277k** (**±20 %**) |

Dos lecturas: (1) el método actual ya es determinista corrida-a-corrida; (2) el **enemigo real de la
replicabilidad es la dependencia del ROI** — `_build_binary_mask` estima fondo/umbral desde el
**contenido del recorte**, así que más margen blanco = más penumbra incluida = contorno distinto.
Auto vs manual vs dos trazados manuales → contornos distintos del **mismo** objeto.

### Decisión

1. **GrabCut queda excluido del camino de contorno** por ser no-determinista (rompería el invariante
   (a)). Si en el futuro se necesitara su calidad, solo con semilla fija y verificación de
   determinismo. La inflación se corrige por otra vía, no con GrabCut.
2. **Segmentación invariante al ROI:** el umbral/decisión figura-fondo debe basarse en una
   **referencia estable** (color de fondo global del Z-scan o punto-blanco fijo), **no en los
   márgenes del recorte** → mismo objeto = misma máscara, independiente del encuadre.
3. **Persistencia:** el contorno extraído y guardado en el análisis es la fuente de verdad; la caché
   lo conserva y la reapertura lo reutiliza (no recomputa).

### Enforcement — tests como gate (no opcional)

La implementación **no se da por buena** sin estos tests verdes:
- **Determinismo:** `extract` N veces sobre el mismo input → contorno byte-idéntico.
- **Invariancia al ROI:** mismo objeto con N encuadres (±margen) → área del contorno dentro de
  **tolerancia ≤ 2 %** (hoy ±20 %).
- **Invariancia de modo:** mismo objeto vía automático / manual / IA → mismo contorno (≤ 2 %).
- **No-regresión:** suite completa + ajuste medido en **varios tipos de objeto** (claro/oscuro,
  fondo blanco/cromático) — `contour.extract` alimenta TODAS las métricas, así que cambiarlo altera
  resultados existentes; la verificación multi-imagen es obligatoria.

> **Nota de riesgo:** a diferencia de la Fase 1 (acotada al watershed, aditiva), la Fase 2 toca el
> módulo **math-critical** `contour.extract`. Implementar solo con los tests anteriores como gate.

### Intento 1 (2026-06-25) — REVERTIDO (sirve de guía para el definitivo)

Se reemplazó la rama de fondo blanco de `_build_binary_mask` (`white_thresh = max(brillo_min-15,
220)`) por un **umbral por valle de Otsu** sobre gris. Resultado parcial:
- ✅ **Funcionó para oscuro-sobre-blanco** (`b_243`): invariancia ROI **±11 % → 0.5 %**, determinista,
  ajuste al borde (área ≈ verdad). La dirección del fix es correcta.
- ❌ **Rompió 25 tests** (288→263). Defecto **real** (no expectativa obsoleta): el Otsu+clamp
  clasifica mal **objeto claro sobre blanco** (centro de la elipse sintética → fondo). Y, al ser
  `_build_binary_mask` la **primitiva compartida**, el cambio se propagó a detect(), **P/H candidates**
  (`mask_raw_holes`) y **confianza** → regresiones.

**Requisitos refinados para el intento definitivo (sesión dedicada):**
1. **Unificar claro y oscuro sobre blanco** — el método debe ubicar bien el valle en ambos (Otsu solo
   con clamp no basta para el claro).
2. **Aislar el blast radius** — la primitiva compartida arrastra P/H + confianza + detect. Evaluar
   aplicar la lógica ROI-invariante **solo en la etapa de contorno** o contabilizar el ripple.
3. **Actualizar fixtures sintéticos** — los tests codifican la forma de máscara actual; el método
   mejorado cambia legítimamente esas máscaras → re-baselinar con verificación visual.
4. **GrabCut fallback de `contour.extract` (línea ~399) también viola el determinismo** — descubierto
   al verificar: `a_242` pasa por `python_grabcut` y da contorno **distinto en cada corrida** (3
   hashes ≠). El invariante (a) exige reemplazarlo por un fallback determinista o sembrar GrabCut.

## Relación con otros ADR
- **ADR-012** (detección monolítica): ADR-013 **no** lo contradice; fija la **jerarquía** dentro del
  núcleo único (figura-fondo > instancias).
- **ADR-009** (P/H primaria): los huecos reales se preservan; el relleno es solo para la **siembra**
  de instancias, no para el contorno ni para `detect_holes`.
- **ADR-007/008** (confianza): la cascada de respaldo reporta baja confianza en vez de fallar mudo.
