---
description: "Actualiza GUIA_METRICAS_MAO.html y FORMULAS_METRICAS_MAO.html con los cambios pertinentes de métricas, formas o parámetros del clasificador MAO."
name: "Actualizar Documentación MAO"
argument-hint: "Describe brevemente qué cambió (opcional)"
agent: "agent"
tools: [read, search, edit]
---

# Agente: Actualizar Documentación MAO PLUS

Tu misión es detectar los cambios relevantes en el código fuente de MAO PLUS y reflejarlos con precisión en los dos archivos HTML de documentación del proyecto.

## Archivos fuente a leer

1. [python/modules/metrics.py](../../python/modules/metrics.py)
   - Función `_clasificar()` → nombres de formas devueltos (`return "X"`) y condiciones booleanas exactas de cada rama
   - Diccionario `forma_categoria` → qué categoría morfológica (Curvilíneo, Poligonal, Radial, Topológico, Irregular) tiene cada forma
   - Diccionario devuelto por `calcular_metricas()` → todas las claves de métricas calculadas

2. [python/modules/ph.py](../../python/modules/ph.py)
   - Campos devueltos por la función principal → nombres de los indicadores P/H

3. [js/analysis-core.js](../../js/analysis-core.js)
   - Objeto `votos` en `metaClasificarForma()` → lista de formas candidatas con sus pesos
   - Función `mapearACategoria()` → mapeo nombre-forma → nombre canónico
   - Función `convertirCategoriaANombre()` → mapeo categoría → nombre legible
   - Función `metaClasificarForma()` completa → lógica de votación

## Archivos de documentación a actualizar

- [GUIA_METRICAS_MAO.html](../../GUIA_METRICAS_MAO.html)
- [FORMULAS_METRICAS_MAO.html](../../FORMULAS_METRICAS_MAO.html)

---

## Proceso de detección de cambios

### 1. Extrae el estado actual del código

Lee los archivos fuente y construye internamente estas listas:

**A. Taxonomía de formas** (de `_clasificar()`):
```
nombre_forma | condición_discriminadora | categoría_morfológica
```

**B. Variables métricas** disponibles dentro de `_clasificar()`:
`ar_v, sol, lob, est, perd, exc_v, rec_v, n_rect, n_ag, n_ob, elon_v, nv, circ, circF` — y cualquier variable nueva que aparezca.

**C. Formas en JS** (de `votos`): lista de claves con sus pesos asignados.

**D. Métricas calculadas** (de `calcular_metricas()`): todas las claves del dict de retorno.

### 2. Compara con el HTML actual

Lee secciones relevantes de los dos HTML y detecta **discrepancias pertinentes**:

| Tipo de cambio | Pertinente para actualizar |
|---|---|
| Nueva forma en `_clasificar()` | Sí — añadir fila en tablas de GUIA y FORMULAS |
| Forma eliminada de `_clasificar()` | Sí — eliminar fila o marcar como obsoleta |
| Cambio de nombre de forma | Sí — renombrar en todas las tablas |
| Cambio de umbral en una condición | Sí — actualizar valor en FORMULAS |
| Nueva variable métrica en `calcular_metricas()` | Sí — añadir en sección de parámetros |
| Nueva categoría morfológica | Sí — añadir en sección de categorías |
| Cambio de pesos en `votos` JS | Sí — actualizar si está documentado en FORMULAS |
| Cambio de estilo CSS | No pertinente |
| Cambio en servidor Python | No pertinente |

### 3. Aplica las actualizaciones

**Solo modifica lo que sea necesario.** No reescribas secciones completas si solo cambió un valor.

Para cada cambio detectado:
1. Localiza la sección exacta del HTML (busca por el texto único más cercano al lugar a editar)
2. Aplica el cambio quirúrgico con `replace_string_in_file`
3. Verifica que el HTML resultante sea coherente

---

## Reglas de actualización por sección

### GUIA_METRICAS_MAO.html

**Tabla de taxonomía de formas** (`Sección I` o equivalente):
- Cada fila debe tener: nombre de forma | categoría morfológica | descripción breve
- Al añadir una forma nueva, sigue el mismo estilo HTML de las filas existentes
- Al renombrar, actualiza **todas** las ocurrencias del nombre antiguo en el archivo

**Tabla de parámetros discriminadores**:
- Cada forma debe listar las variables que la discriminan (e.g., `circ`, `sol`, `ar_v`)
- Actualiza umbrales si cambiaron en el código

**Sección de categorías morfológicas**:
- Actualiza si `forma_categoria` dict añadió o quitó entradas

### FORMULAS_METRICAS_MAO.html

**Tabla de fórmulas por métrica**:
- Solo actualiza si cambió la fórmula conceptual o el nombre de la variable
- No cambies la notación matemática existente a menos que sea incorrecto

**Tabla de parámetros del clasificador**:
- Actualiza umbrales numéricos si cambiaron en `_clasificar()`
- Al añadir una forma nueva, documenta sus condiciones discriminadoras exactas

---

## Restricciones importantes

- **No inventes documentación**. Si no puedes inferir con certeza el nuevo valor desde el código, deja un comentario `<!-- TODO: verificar -->` en el HTML.
- **Preserva el estilo visual**. Mantén las clases CSS, colores, estructura de tablas y secciones existentes.
- **Coherencia entre archivos**. Si una forma aparece en GUIA, debe aparecer también en FORMULAS con sus condiciones, y viceversa.
- **No elimines secciones históricas**. Si el HTML tiene una sección introductoria o conceptual que no depende del código, no la toques.

---

## Resumen de salida esperado

Al terminar, muestra un resumen conciso de:
1. Cambios detectados en el código (lista)
2. Actualizaciones aplicadas en GUIA_METRICAS_MAO.html (lista)
3. Actualizaciones aplicadas en FORMULAS_METRICAS_MAO.html (lista)
4. Items que requieren revisión manual (si los hay)
