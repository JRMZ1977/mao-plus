/**
 * CATEGORY MANIFEST — Taxonomía canónica de categorías del análisis morfológico
 * ==========================================================================
 * ADR-011. Fuente ÚNICA de verdad del conjunto, orden y nombre de las
 * categorías que se consignan en las cuatro salidas:
 *   - Panel de Análisis  (mostrarAnalisisMorfologico → visualization-export.js)
 *   - Tabla Completa      (generarTablaMetricasCompleta → tabla-metricas-completa.js)
 *   - CSV de descarga     (extraerMetricasCompletasConPHSimple → analysis-core.js)
 *   - PDF integral        (generarReportePDFIntegral → analysis-core.js)
 *
 * Regla de coherencia (decisión JFRR — esqueleto estable + P/H siempre):
 *   · 'estructural' y 'factual' → se rinden SIEMPRE, en este orden y con este
 *     título, con marcador "sin datos" cuando sus campos no existen. No dependen
 *     del modo de detección ni de acciones secundarias.
 *   · 'comparativa' → condicional por naturaleza (requiere otra cara o P/H).
 *
 * Sin dependencias (igual que morphometric_registry.py en el backend, ADR-006).
 * Los campos por categoría (clave en `metricas`, label, unidad) se cablean por
 * fase en cada generador; este manifiesto fija el CONTRATO de presencia/orden/nombre.
 * ==========================================================================
 */

/** @typedef {{id:string, titulo:string, orden:number, tipo:'estructural'|'factual'|'comparativa', desc?:string}} CategoriaSpec */

/** @type {CategoriaSpec[]} */
export const CATEGORIAS = [
  { id: 'identificacion',   titulo: 'Identificación y Clasificación',                 orden: 1,  tipo: 'estructural' },
  { id: 'dimensiones',      titulo: 'Dimensiones Básicas',                            orden: 2,  tipo: 'estructural' },
  { id: 'ejes_orientacion', titulo: 'Ejes y Orientación',                             orden: 3,  tipo: 'estructural' },
  { id: 'radial',           titulo: 'Análisis Radial',                                orden: 4,  tipo: 'estructural' },
  { id: 'indices_forma',    titulo: 'Índices de Forma',                               orden: 5,  tipo: 'estructural' },
  { id: 'conservacion',     titulo: 'Estado de Conservación y Fragmentación',         orden: 6,  tipo: 'estructural' },
  { id: 'simetria',         titulo: 'Simetría',                                       orden: 7,  tipo: 'estructural' },
  { id: 'curvatura',        titulo: 'Curvatura',                                      orden: 8,  tipo: 'estructural' },
  { id: 'contorno',         titulo: 'Propiedades del Contorno',                       orden: 9,  tipo: 'estructural' },
  { id: 'convex_hull',      titulo: 'Convex Hull',                                    orden: 10, tipo: 'estructural' },
  { id: 'vertices_angulos', titulo: 'Vértices y Ángulos',                             orden: 11, tipo: 'estructural' },
  { id: 'avanzadas',        titulo: 'Métricas Avanzadas',                             orden: 12, tipo: 'estructural', desc: 'Feret, lobularidad, estrellamiento' },
  { id: 'centroide',        titulo: 'Centroide',                                      orden: 13, tipo: 'estructural' },
  { id: 'forma_3d',         titulo: 'Forma 3D Inferida',                              orden: 14, tipo: 'estructural' },
  { id: 'textura',          titulo: 'Textura Óptica (GLCM)',                          orden: 15, tipo: 'estructural' },
  { id: 'error_optico',     titulo: 'Error e Incertidumbre Óptica',                   orden: 16, tipo: 'estructural' },
  { id: 'depuracion',       titulo: 'Depuración Estadística de Contorno',             orden: 17, tipo: 'estructural' },
  { id: 'clasificacion',    titulo: 'Clasificación y Síntesis',                       orden: 18, tipo: 'estructural', desc: 'meta-clasificación + 6 métodos + síntesis' },
  { id: 'perforaciones',    titulo: 'Perforaciones',                                  orden: 19, tipo: 'factual' },
  { id: 'horadaciones',     titulo: 'Horadaciones',                                   orden: 20, tipo: 'factual' },
  { id: 'patron',           titulo: 'Patrón de Agrupamiento',                         orden: 21, tipo: 'factual' },
  { id: 'tecnica',          titulo: 'Información Técnica / Metadatos',                 orden: 22, tipo: 'estructural' },
  // Categorías comparativas (condicionales por naturaleza, fuera del esqueleto estable):
  { id: 'bifacial',         titulo: 'Comparación Bifacial',                           orden: 23, tipo: 'comparativa', desc: 'requiere la otra cara analizada' },
  { id: 'tabla_ph',         titulo: 'Tabla Comparativa por Perforación/Horadación',   orden: 24, tipo: 'comparativa', desc: 'requiere P/H' },
];

/** Categorías que SIEMPRE se rinden (esqueleto estable), en orden canónico. */
export function categoriasSiempre() {
  return CATEGORIAS.filter(c => c.tipo === 'estructural' || c.tipo === 'factual');
}

/** Categorías condicionales por naturaleza. */
export function categoriasComparativas() {
  return CATEGORIAS.filter(c => c.tipo === 'comparativa');
}

/** Lookup por id. */
export function porId(id) {
  return CATEGORIAS.find(c => c.id === id) || null;
}

/** Título canónico de una categoría por id (o el propio id si no existe). */
export function tituloDe(id) {
  const c = porId(id);
  return c ? c.titulo : id;
}
