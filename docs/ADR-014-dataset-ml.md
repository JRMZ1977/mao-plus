# ADR-014 — Sistema de Etiquetado para Entrenamiento ML

**Estado:** Implementado  
**Fecha:** 2026-06-29  
**Autor:** JFRR + Claude Code

---

## Contexto y decisión

MAO calcula métricas morfométricas de alta precisión arqueológica y extrae contornos sub-píxel de cada objeto detectado. Este ADR implementa un sistema de exportación que convierte esos datos en datasets para entrenar modelos ML.

**Formato elegido: COCO JSON + PNGs**  
Compatible con Roboflow, Detectron2, LabelMe y SAM fine-tuning.

### Targets de entrenamiento

| Target | Descripción |
|--------|-------------|
| **Regresión** | imagen → vector de métricas morfométricas |
| **Clasificación** | imagen → categoría tipológica (asignada por el usuario) |
| **Segmentación** | imagen → máscara de contorno (polygon COCO) |

---

## Arquitectura

### Estructura del ZIP exportado

```
{nombre_coleccion}_{fecha}.zip
  images/
    obj_{id}.png          ← recorte PNG con margen 10px
  annotations.json        ← COCO JSON estándar + mao_attributes
  metadata.json           ← escala, filtros, stats de exportación
```

### Schema COCO extendido (campo `mao_attributes`)

```json
{
  "id": 1,
  "image_id": 1,
  "category_id": 1,
  "segmentation": [[x1,y1, x2,y2, ...]],
  "bbox": [x_min, y_min, width, height],
  "area": 45620.5,
  "iscrowd": 0,
  "mao_attributes": {
    "detection_confidence": 0.87,
    "detection_method": "auto",
    "tipologia": "raedera",
    "scale_px_mm": 0.05,
    "object_id": "obj_003",
    "morphometrics": {
      "circularity": 0.73,
      "elongation": 1.45,
      "rugosidad_contorno": 1.089,
      "simetria_bilateral": 0.78,
      "feret_ratio": 0.62,
      "efa_coefficients": [...],
      "...": "~50 métricas adicionales"
    }
  }
}
```

---

## Archivos implementados

| Archivo | Tipo | Descripción |
|---------|------|-------------|
| `python/modules/dataset_exporter.py` | NUEVO | Módulo core: recorte PNG + COCO JSON |
| `python/server.py` | MOD | Endpoint `POST /api/dataset/export` |
| `python/tests/test_dataset_exporter.py` | NUEVO | 8 tests unitarios |
| `js/mao-resultados-organizer.js` | MOD | UI modal «Exportar dataset ML» |
| `js/analysis-core.js` | MOD | Selector tipología en tarjetas de objetos |
| `python/tools/validate_dataset.py` | NUEVO | Validador CLI de integridad |
| `docs/ADR-014-dataset-ml.md` | NUEVO | Este documento |

---

## Decisiones de diseño

**Confianza como filtro QA:** Objetos con `detection_confidence < umbral` (configurable, default 0.5) se excluyen del dataset. Garantiza que el modelo aprende de segmentaciones limpias.

**Tipología opcional:** El campo `tipologia` en `mao_attributes` es `null` si el usuario no lo asignó. La exportación no se bloquea. Esto permite datasets de regresión (métricas) sin necesidad de etiquetado tipológico.

**Contorno relativo al recorte:** Los puntos del `segmentation` polygon están en coordenadas relativas al PNG recortado (origen en la esquina superior izquierda del crop), no en coordenadas de la imagen original.

**Métricas serializables:** Se excluyen automáticamente: campos con NaN, dicts anidados (`_contour_data`), listas mixtas (str+int). Solo se exportan float/int/str/bool y listas de números.

**`category_id=1` = sin_tipo:** La categoría 1 siempre es `sin_tipo`. Los IDs de otras categorías dependen del orden de `DEFAULT_CATEGORIES` en `dataset_exporter.py`.

---

## Flujo de uso

1. Cargar imagen → detectar objetos → analizar morfología
2. *(Opcional)* Asignar tipología por tarjeta en la pestaña Análisis
3. Pestaña Resultados → **Exportar dataset ML**
4. Configurar nombre, umbral de confianza, filtro por tipología
5. Confirmar → descarga ZIP
6. Validar: `python python/tools/validate_dataset.py ruta/al/zip.zip`

---

## Verificación

```bash
# Tests unitarios (8 tests)
.venv/bin/python -m pytest python/tests/test_dataset_exporter.py -v

# Suite completa sin regresiones
.venv/bin/python -m pytest tests/ python/tests/ -q

# Validador sobre un ZIP exportado
python python/tools/validate_dataset.py datasets/mi_coleccion.zip

# Validador en modo estricto (warnings = errores)
python python/tools/validate_dataset.py datasets/mi_coleccion/ --strict

# Reporte JSON (para integración CI)
python python/tools/validate_dataset.py datasets/mi_coleccion/ --json-report
```

---

## Invariantes

- El ZIP se genera **en memoria** (no escribe archivos temporales al disco del servidor)
- El dataset NO altera los datos del objeto en MAO — es solo exportación
- Los candidatos P/H no confirmados NO se incluyen en el dataset
- El campo `tipologia` en el objeto JS (`obj.tipologia`) persiste durante la sesión pero **no** se guarda en `sessionStorage` automáticamente — es un campo de etiquetado efímero

---

## Deuda técnica conocida

- La tipología no persiste al recargar la app (no se guarda en `analisisCached`). Mejora futura: serializar `obj.tipologia` en el caché de análisis.
- Categorías tipológicas hardcoded en `DEFAULT_CATEGORIES`. Mejora futura: lista configurable en `settings.json`.
- No hay batch-export de múltiples imágenes en una sola operación. Caso de uso futuro para colecciones grandes.
