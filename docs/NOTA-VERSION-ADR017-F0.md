# Nota de versión — ADR-017 F0: retirada del estimador de completitud

**Fecha:** 2026-09-12 · **Alcance:** métricas exportadas a CSV, PDF, panel y comparador.
**Tipo de cambio:** 🟠 **rompe continuidad de valores exportados.** Un CSV o PDF generado
antes de esta versión NO es comparable columna a columna con uno posterior.
**ADR:** `docs/ADR-017-emparejamiento-plantillas-completitud.md` (§1, §5, §6).

---

## Por qué

MAO emitía cuatro estimadores de fragmentación. Ninguno medía lo que su nombre decía:

- **`completitud_estimada` (JS)** combinaba la **cobertura angular** del contorno alrededor
  del centroide del propio objeto con `área/área_bbox`. La cobertura angular es una señal
  **degenerada**: todo contorno cerrado de `cv2.findContours` cuyo centroide caiga dentro
  rodea 360° por construcción — el fragmento también. Un disco entero, medio disco y un
  cuarto de disco daban **91,3 % / 91,3 % / 91,0 %**, los tres «Casi completo».
  El segundo término es el **extent**, no la convexidad que decía ser; como el extent de un
  círculo es π/4 = 78,5 %, **toda pieza redonda íntegra se reportaba como fragmento**.
- **`completitud_estimada` (Python)** era distinta: `0,4·convexidad + 0,6·solidez`. La
  medición es fiel, pero describe **convexidad**, no integridad.
- **`perdida_area_fragmentacion_percent`** es `(1 − solidez)·100`: **concavidad**, no pérdida.
  Una pieza lunada, denticulada o anular íntegra es cóncava por manufactura.
- **`perdida_perimetro_fragmentacion_percent`** tenía el **signo invertido**: como
  `P_hull ≤ P_real` siempre, la expresión era **≤ 0 por construcción**.

Sobre esa base, dos rutas del código (flujo IA y flujo manual) **inyectaban** la etiqueta
`Fragmento X (N% completo)` cuando `perdida_area > 1 %` —es decir, con casi cualquier
contorno real— derivando el porcentaje como `100 − concavidad`. Es el mecanismo exacto que
rotuló una cuenta circular íntegra de La Draga como «fracturada» (hallazgo **ADR-016 #6**).

**Principio aplicado** (precedente JFRR 2026-07-02, ADR-016 #6): *se conserva la medición
fiel y se retira el rótulo que diagnostica de más.* Donde no hay dato, ahora se dice
«Sin evaluar» en vez de fabricar un 100 %.

## Mapeo de claves

| Clave anterior | Ahora | Valor |
|---|---|---|
| `completitud_estimada` (JS) | **retirada** | — |
| `completitud_metodo_angular` | **retirada** | — |
| `completitud_metodo_convexidad` (= `A/A_bbox`) | **`extent`** | mismo número, en fracción (0–1) |
| `completitud_es_fragmento` · `completitud_tipo_fragmento` · `completitud_cobertura_grados` | **retiradas** | — |
| `completitud_estimada` (Python) | **`indice_convexidad_percent`** | **mismo número** |
| `perdida_area_fragmentacion_percent` | **`concavidad_area_percent`** | **mismo número**; el nombre viejo sigue emitiéndose como **alias deprecado** |
| `perdida_perimetro_fragmentacion_percent` | **`concavidad_perimetro_percent`** | **valor distinto**: signo corregido a `(P_real − P_hull)/P_hull` |

Rótulos visibles: «Pérdida de Área por Fragmentación» → «Concavidad de área»;
«Pérdida de Perímetro por Fragmentación» → «Exceso de perímetro sobre el hull»;
sección «VIII. Estado de conservación y fragmentación» → «VIII. Concavidad del contorno
y estado de conservación».

## Qué verá distinto quien use la app

1. **Ninguna pieza se rotula «Fragmento» automáticamente.** Los nombres de forma pierden el
   prefijo `Fragmento …` y el sufijo `(N% completo)`. Una cuenta circular íntegra ahora se
   clasifica **«Circular»**, no «Fragmento Oval (91 % completo)».
2. **La fila «Completitud» dice «Sin evaluar»** en panel, tabla, PDF y CSV, con la nota
   «requiere ajuste de plantilla (ADR-017 F1)». No es un fallo: es la ausencia de dato
   dicha en voz alta.
3. **Dos reglas de clasificación quedan inertes** hasta F1, porque su compuerta era el flag
   fabricado: la reinterpretación de «zona curvilínea frontera» (Irregular → Oval/Elipsoidal)
   y el resaltado en rojo de la columna de completitud. La lógica se conserva en su sitio.
4. **El índice de similitud bifacial cambia ligeramente**: su dimensión «estado de
   conservación» ya no compara completitudes fabricadas (que valían 0 en ambas caras y
   puntuaban como «idénticas»), sino `indice_convexidad_percent`.

## Compatibilidad de proyectos guardados

- Los proyectos guardados con claves antiguas **siguen cargando**: `comparator.js` mapea
  `completitud_estimada → indice_convexidad_percent` y `perdida_area_* → concavidad_area_*`
  como alias de lectura.
- El alias `perdida_area_fragmentacion_percent` se seguirá **emitiendo** una versión más y
  luego se retirará.
- Las claves `completitud_*` **no** se mapean: no medían completitud, así que traducirlas
  habría propagado el error.

## Qué repone F1

`plantilla_completitud` — la fracción de la forma ideal preservada, obtenida ajustando una
plantilla al **margen original** del contorno y midiendo la cobertura alrededor del **centro
ajustado**, no del centroide del fragmento. Prototipo verificado: exacto hasta un 25 % de
forma preservada, y por debajo del 15 % rechaza la plantilla en vez de inventar
(`node tools/adr017_proto_plantilla.mjs`).

## Verificación de esta entrega

```bash
node tools/adr017_gate_f0.mjs     # gate de no regresión — 13/13 ✓
```

`node --check` limpio en los 11 archivos JS tocados y `py_compile` en los 2 de Python.
La suite Python completa **no** se ejecutó en el entorno donde se preparó el cambio (sin
`numpy`/`cv2`/`pytest`); la lógica del nuevo `test_claves_retiradas_en_f0_no_regresan` se
reprodujo a mano y pasa. **Pendiente: correr la suite y verificar panel/PDF/CSV en Electron**
(lección transversal del repo: `node -c` y el health check no ven layout ni valores de runtime).
