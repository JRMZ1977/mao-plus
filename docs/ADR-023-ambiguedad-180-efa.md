# ADR-023 — Resolver la ambigüedad de 180° de la normalización EFA (O-28): elección intrínseca del extremo del eje mayor

**Estado:** 🟡 **Propuesto — abierto el 2026-09-20.** Pendiente de decisión JFRR en §6. Nada implementado.
**Contexto previo:** O-28 (`MEMORIA-MATEMATICA-MAO-PLUS.md` §6.3 y catálogo §13.2) · ADR-021 §1.3(a) y
§2.4, que lo detectó y lo dejó fuera de alcance a propósito · `NOTA-VERSION-1.3.1.md` §4.
**Impacto previsto:** 🔴 **cambia el descriptor interno.** Exige nota de versión propia y recálculo:
descriptores viejos y nuevos **no se mezclan**.

---

## 1. Problema

### 1.1 Qué es la ambigüedad

El paso (1) de la normalización de Kuhl & Giardina alinea el inicio de la parametrización con el
semieje mayor de la elipse del primer armónico mediante una fase θ₁
(`python/modules/efa.py::_normalize_coeffs`):

```python
theta_1 = 0.5 * math.atan2(2.0 * (a1 * b1 + c1 * d1),
                           a1 ** 2 - b1 ** 2 + c1 ** 2 - d1 ** 2)
```

El factor `0.5` deja θ₁ definido **módulo π**: θ₁ y θ₁+π alinean el inicio con los **dos** extremos
del semieje mayor, y cuál devuelve el `atan2` depende de los propios `a1…d1`, que a su vez dependen
de **dónde empieza el contorno** —es decir, de la rotación de la fotografía—. Cambiar de extremo
multiplica el armónico *k* por (−1)^(k+1): **los armónicos pares cambian de signo; los impares no.**

Medido sobre la forma trilobulada de los tests: la misma pieza con otro punto de inicio da
`d_EFD` = 0,589, similitud 0,629 — que el sistema rotula «formas moderadamente distintas».

No es un defecto privativo de MAO: **pyefd y Momocs comparten la misma normalización** y el mismo
comportamiento. Con los `*_kg` de ADR-021 la distancia sale idéntica.

### 1.2 Por qué la suite no podía verlo

Existe `tests/test_efa.py::TestEFAInvariances::test_invariance_start_point`, que es exactamente la
prueba que debía cazarlo. Construye el contorno con `_ellipse(phase=…)`, y **una elipse sólo tiene
armónicos impares**: el test es estructuralmente ciego al defecto. No podía fallar. Cualquier
corrección que no arregle también el test deja el agujero abierto.

### 1.3 Radio de impacto, medido sobre el código (no asumido)

| Consumidor | Usa | ¿Afectado? |
|---|---|---|
| `efa.compare` → `d_EFD`, similitud (APS, Procrustes) | normalizados (`efa.py:505`) | **Sí** |
| `obj3d_v2` `mean_coefficients` / `std_coefficients` de secciones (`obj3d_v2.py:2085`) | promedia normalizados **entre secciones** | **Sí — y hoy ya produce medias mal formadas** cuando dos secciones caen en ramas distintas: los armónicos pares se cancelan |
| `morphometric_registry` › `efa_coefficients` (`fuente_2d="efa.coefficients"`) | normalizados | **Sí** (valor publicado como métrica) |
| `dataset_exporter` › `efa_coefficients` del dataset ML | normalizados | **Sí** (valores ya escritos cambian) |
| Análisis guardados: `metricas.json` › `_efa_data.coefficients` | normalizados | **Sí**, persistido en disco |
| Exportaciones `*_kg` de ADR-021 | normalizados de K&G | **No se tocan a propósito** — §2.3 |
| `power_spectrum`, `variance_explained`, clasificación por firma espectral | normas por armónico | **No** (independientes del signo) |
| `coefficients_raw` / `coefficients_raw_kg` | crudos | **No** — el defecto vive en la normalización |
| **Bancos de plantillas EFA** (`shape_template.registrar_plantilla_efa`) | **crudos** | **No, con la implementación actual** — ver aviso abajo |

> ⚠ **Corrección de alcance respecto de ADR-021 §2.4.** Aquel ADR listó «los bancos de plantillas»
> entre lo que habría que recalcular. Verificado ahora contra el código: `registrar_plantilla_efa`
> reconstruye desde **coeficientes crudos** (`coefficients_raw` / `coefficients_raw_kg`, así lo dice
> su docstring y así lo usan sus únicos llamadores, que están en los tests), y la curva reconstruida
> desde crudos es la misma cualquiera que sea el punto de inicio. **Además no hay ningún banco EFA
> persistido en el repositorio ni en disco**: el `_REPERTORIO` de plantillas es analítico. El coste de
> migración es, por tanto, bastante menor del que ADR-021 temía. Un banco importado en forma
> **normalizada** (p. ej. desde Momocs) sí quedaría afectado, y §2.4 lo cubre.

---

## 2. Decisión propuesta

**Elegir el extremo por un criterio intrínseco a la forma, no por el punto de inicio del contorno.**

### 2.1 El criterio: asimetría — ya implementado y validado en el proyecto

No hay que inventarlo: ADR-021 ya resolvió esta misma ambigüedad para los semilandmarks TPS, y está
en producción y verificado en Electron (`js/mao-interop-gmm.js::semilandmarksContorno`, paso 4):

1. Calcular el **tercer momento estandarizado** (asimetría) del contorno a lo largo del eje mayor,
   exacto por segmento, con el centroide ponderado por longitud de arco.
2. Tomar el extremo hacia el que esa asimetría es **positiva** — la cola larga de la distribución.
3. Si la asimetría del eje mayor es menor que `PESO_EJE_MENOR` (0,25) veces la del menor —forma en «D»,
   como un disco partido, casi simétrica respecto del eje mayor— decide el **eje menor**.
4. Si ambas están por debajo de `ASIMETRIA_NULA` (1e-3), la forma es simétrica y el extremo es indecidible:
   se declara, no se finge (ver §2.5).

Es invariante a traslación, rotación, escala, punto de inicio y sentido de recorrido — que es
exactamente lo que la normalización prometía y no cumplía.

**Ventaja secundaria, y no menor:** el descriptor interno y el TPS pasarían a compartir el mismo
origen de parametrización. Hoy divergen, y eso hace que un GPA sobre los semilandmarks y una
comparación por `d_EFD` no estén hablando de la misma alineación.

### 2.2 ⚠ Decisión abierta A — de dónde sale la asimetría

`_normalize_coeffs` recibe **sólo coeficientes**; el criterio de ADR-021 se calcula sobre **puntos de
contorno**. Hay que elegir, y no es cosmético:

| | (a) Desde el contorno | (b) Desde la reconstrucción |
|---|---|---|
| Cómo | `calculate` pasa el contorno a la normalización | sintetizar la curva con `_reconstruct_contour` y medir la asimetría ahí |
| Coste | menor, reutiliza el código JS casi tal cual | una reconstrucción extra por normalización |
| Límite | `reconstruct()` y `compare()` normalizan **sin** contorno disponible → quedarían sin canonizar | ninguno: el criterio es función del descriptor |
| Efecto | el descriptor no se puede canonizar a partir de sí mismo | un banco importado de Momocs **también** se canoniza |
| Fidelidad | asimetría de la forma real | asimetría de la forma truncada a *n* armónicos (determinista, pero depende de *n*) |

**Recomiendo (b).** El criterio debe ser una propiedad del descriptor, no de su procedencia; si no,
la canonización no es aplicable a coeficientes que llegan de fuera, que es justo el caso que ADR-021
abrió al aceptar bancos externos. La dependencia de *n* se acota fijando el número de armónicos de la
síntesis del criterio (p. ej. los mismos que se normalizan) y declarándolo.

### 2.3 Lo que NO cambia

- **Las exportaciones `*_kg` conservan la ambigüedad.** Decisión de ADR-021 §2.4 y sigue vigente: son
  los coeficientes de pyefd/Momocs y deben comportarse como allí. Quien los lleve a Momocs se
  encontrará lo mismo, que es lo correcto. ADR-023 **no debe** canonizarlos.
- **Crudos, espectro de potencia y varianza explicada**, intactos.
- **Los pasos (2) ψ₁, (3) escala y (4) quiralidad d₁≥0** de `_normalize_coeffs`, intactos. Esto sólo
  desambigua el paso (1).

### 2.4 Versionado: viejos y nuevos no se mezclan

- Versión **1.4.0** (cambia el descriptor; 🔴 en la nota de versión).
- `normalization` gana un campo declarativo —p. ej. `criterio_extremo: "asimetria" | "atan2"`— para
  que todo descriptor guardado diga con qué regla nació. Sin eso la no-mezcla es inauditable.
- `efa.compare` **rechaza** (o al menos avisa) comparar descriptores con `criterio_extremo` distinto.
  Hoy compara en silencio, que es cómo O-28 pasó inadvertido.
- La guardia `test_el_descriptor_interno_de_mao_no_cambia` (`test_efa_kuhl_giardina.py:318`) fija los
  valores de 1.3.0 y **fallará por diseño**. No se borra: se **reescribe** como guardia de 1.4.0, y el
  commit debe mostrar el diff de valores como evidencia del cambio, no esconderlo.

### 2.5 ⚠ Decisión abierta B — formas simétricas

Cuando la asimetría no alcanza el umbral, el extremo es genuinamente indecidible (un círculo no tiene
«arriba»). ADR-021 lo resuelve **declarándolo**: `inicio.estable = false` y un `ATENCION` en el
`COMMENT=` del TPS. Para el descriptor hay que decidir qué se hace:

1. Declararlo y seguir (`extremo_estable: false` en `normalization`) — coherente con ADR-021.
2. Declararlo y además **degradar la comparación**: `compare` marca el par como no fiable.
3. Desempatar con un criterio secundario determinista (p. ej. el 4º momento).

Recomiendo **1 + 2**: la misma línea de «el sistema propone, el humano dispone» de ADR-009.

---

## 3. Implementación propuesta (por fases, reversible hasta F3)

| Fase | Qué | Archivos |
|---|---|---|
| **F0** | Test que **reproduce** O-28 y falla hoy: forma con armónicos pares (trilobulada), dos puntos de inicio, `d_EFD` debe ser ≈0 | `tests/test_efa.py` |
| **F1** | `_criterio_extremo()` en Python, portado de `mao-interop-gmm.js` paso 4, con los mismos umbrales; **sin cablear** | `python/modules/efa.py` |
| **F2** | Paridad JS↔Python del criterio sobre los mismos contornos (los de 24 rotaciones de ADR-021) | `python/tests/` |
| **F3** | Cablear en `_normalize_coeffs` paso (1) tras decidir §2.2; `criterio_extremo` en `normalization` | `efa.py` |
| **F4** | `compare` rechaza mezcla de criterios; reescribir la guardia 1.3.0 → 1.4.0 | `efa.py`, `test_efa_kuhl_giardina.py` |
| **F5** | Arreglar `test_invariance_start_point` para que use una forma con armónicos pares | `tests/test_efa.py` |
| **F6** | Migración de análisis guardados y nota de versión 1.4.0 | `project-manager.js`, `docs/` |

**La migración ya tiene vehículo:** «Recalcular métricas antes de exportar» (`excRecalcular` →
`enrichCollection`) recomputa el EFA y reescribe `metricas.json`. No hace falta construir nada nuevo;
sí decidir si el recálculo se **fuerza** al abrir un proyecto de 1.3.x o se deja a mano (§6).

---

## 4. Verificación exigida

- **F0 debe fallar antes de F3 y pasar después.** Un ADR que cambia el descriptor sin un test que
  falle primero no ha demostrado nada.
- Invariancias que deben seguir en pie: rotación (5·10⁻¹⁶), escala, traslación, reflexión canónica.
- **Contornos reales de OpenCV**, no sólo sintéticos: las 24 rotaciones rasterizadas que ADR-021 ya
  usa, midiendo `d_EFD` entre rotaciones de la misma pieza (hoy hasta 0,589; debe caer al ruido).
- Paridad con el TPS: el inicio elegido por el descriptor y el del semilandmark 1 deben coincidir.
- `*_kg` **sin cambios** — la guardia de paridad con pyefd/Momocs de ADR-021 debe seguir verde.
- Suite completa y `npm test` en verde; verificación visual en Electron sólo si cambia algo de la
  interfaz (previsiblemente no).

## 5. Reversibilidad

Hasta F2 es aditivo puro. F3 es el punto de no retorno para los **valores**, no para el código: el
criterio queda tras una bandera (`criterio_extremo`), de modo que volver a `atan2` es cambiar un
valor por defecto. Lo que no se revierte solo son los `metricas.json` ya reescritos por la migración
— de ahí que F6 vaya al final y con nota de versión.

## 6. Decisiones que requieren confirmación antes de empezar

1. **§2.2** — ¿criterio desde el contorno (a) o desde la reconstrucción (b, recomendada)?
2. **§2.5** — formas simétricas: ¿declarar (1), declarar + degradar comparación (2, recomendada) o
   desempate secundario (3)?
3. **§3 F6** — ¿el recálculo de análisis de 1.3.x se fuerza al abrirlos, o queda a mano?
4. **Alcance de `obj3d_v2`** — las medias de coeficientes entre secciones están mal formadas hoy por
   esta misma causa. ¿Entra en este ADR o va a uno propio?
5. **Momento** — ADR-020 (O-1, fórmula de escala) también está reservado y también toca valores. ¿Se
   abordan juntos en una 1.4.0, o por separado?
