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

/** @typedef {{id:string, titulo:string, orden:number, indice:string, tipo:'estructural'|'factual'|'comparativa', desc?:string}} CategoriaSpec */

/**
 * ADR-017 · El campo `indice` es el numeral romano CANÓNICO de la sección. Antes
 * estaba escrito a mano dentro del HTML de cada generador, en cinco superficies
 * distintas y con cuatro numeraciones divergentes: la Tabla emitía II → VIII → III,
 * `XII-a` rotulaba dos secciones distintas, Simetría era `VI-b` en el módulo y
 * `XI-b` en la copia de analysis-core, y las P/H usaban arábigo (`20.`, `21.`).
 * Ahora el numeral vive AQUÍ y sólo aquí; las superficies lo piden con `encabezadoDe()`.
 *
 * El orden abre con la PROCEDENCIA del dato —cómo se detectó el objeto y con qué
 * incertidumbre óptica se midió— antes de cualquier métrica, para que el informe
 * declare sus condiciones de producción antes que sus resultados.
 */

/** @type {CategoriaSpec[]} */
export const CATEGORIAS = [
  { id: 'deteccion',        titulo: 'Detección del Objeto',                           orden: 1,  indice: 'I',      tipo: 'estructural', desc: 'método, confianza y parámetros del modo de detección' },
  { id: 'error_optico',     titulo: 'Error Óptico Posicional',                        orden: 2,  indice: 'II',     tipo: 'estructural' },
  { id: 'incertidumbre',    titulo: 'Incertidumbre Propagada por Métrica',            orden: 3,  indice: 'II-b',   tipo: 'estructural' },
  { id: 'identificacion',   titulo: 'Identificación y Clasificación',                 orden: 4,  indice: 'III',    tipo: 'estructural' },
  { id: 'dimensiones',      titulo: 'Dimensiones Métricas del Objeto',                orden: 5,  indice: 'IV',     tipo: 'estructural' },
  { id: 'indices_forma',    titulo: 'Proporciones y Forma Global',                    orden: 6,  indice: 'V',      tipo: 'estructural' },
  { id: 'radial',           titulo: 'Análisis Radial y Regularidad del Contorno',     orden: 7,  indice: 'VI',     tipo: 'estructural' },
  { id: 'contorno',         titulo: 'Rugosidad y Complejidad del Borde',              orden: 8,  indice: 'VII',    tipo: 'estructural' },
  { id: 'curvatura',        titulo: 'Curvatura',                                      orden: 9,  indice: 'VII-b',  tipo: 'estructural' },
  { id: 'convex_hull',      titulo: 'Envolvente Convexa (Convex Hull)',               orden: 10, indice: 'VIII',   tipo: 'estructural' },
  { id: 'ejes_orientacion', titulo: 'Ejes, Orientación y Posición Espacial',          orden: 11, indice: 'IX',     tipo: 'estructural' },
  { id: 'simetria',         titulo: 'Simetría Bilateral',                             orden: 12, indice: 'IX-b',   tipo: 'estructural' },
  { id: 'centroide',        titulo: 'Centroide y Posición Espacial',                  orden: 13, indice: 'IX-c',   tipo: 'estructural' },
  { id: 'vertices_angulos', titulo: 'Geometría de Vértices',                          orden: 14, indice: 'X',      tipo: 'estructural' },
  { id: 'forma_3d',         titulo: 'Forma 3D Inferida',                              orden: 15, indice: 'XI',     tipo: 'estructural' },
  { id: 'conservacion',     titulo: 'Estado de Conservación y Fragmentación',         orden: 16, indice: 'XII',    tipo: 'estructural' },
  { id: 'textura',          titulo: 'Textura Óptica (GLCM)',                          orden: 17, indice: 'XIII',   tipo: 'estructural' },
  { id: 'depuracion',       titulo: 'Depuración Estadística de Contorno',             orden: 18, indice: 'XIV',    tipo: 'estructural' },
  { id: 'perforaciones',    titulo: 'Perforaciones',                                  orden: 19, indice: 'XV',     tipo: 'factual' },
  { id: 'horadaciones',     titulo: 'Horadaciones',                                   orden: 20, indice: 'XV-b',   tipo: 'factual' },
  { id: 'patron',           titulo: 'Patrón de Agrupamiento',                         orden: 21, indice: 'XVI',    tipo: 'factual' },
  { id: 'avanzadas',        titulo: 'Características Geométricas Avanzadas',          orden: 22, indice: 'XVII',   tipo: 'estructural', desc: 'Feret, lobularidad, estrellamiento' },
  { id: 'clasificacion',    titulo: 'Clasificación y Síntesis',                       orden: 23, indice: 'XVIII',  tipo: 'estructural', desc: 'meta-clasificación + 6 métodos + síntesis' },
  { id: 'tecnica',          titulo: 'Información Técnica / Metadatos',                orden: 24, indice: 'XIX',    tipo: 'estructural' },
  // Categorías comparativas (condicionales por naturaleza, fuera del esqueleto estable):
  { id: 'bifacial',         titulo: 'Comparación Bifacial',                           orden: 25, indice: 'XX',     tipo: 'comparativa', desc: 'requiere la otra cara analizada' },
  { id: 'tabla_ph',         titulo: 'Análisis Comparativo Objeto–P/H',                orden: 26, indice: 'XX-b',   tipo: 'comparativa', desc: 'requiere P/H' },
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

/** Numeral romano canónico de una categoría (cadena vacía si el id no existe). */
export function indiceDe(id) {
  const c = porId(id);
  return c ? c.indice : '';
}

/**
 * Encabezado canónico listo para renderizar: `"II. Error Óptico Posicional"`.
 * Es la única forma en que una superficie debe construir el rótulo de una sección;
 * escribir el romano a mano es lo que produjo las cuatro numeraciones divergentes
 * que ADR-017 vino a unificar.
 */
export function encabezadoDe(id) {
  const c = porId(id);
  if (!c) return id;
  return `${c.indice}. ${c.titulo}`;
}

/**
 * Valida el manifiesto: ids únicos, `orden` contiguo desde 1, `indice` único y no
 * vacío, y `tipo` conocido. Devuelve [] si está sano, o la lista de problemas.
 * Lo consume el test de contrato; también sirve como autodiagnóstico en dev.
 */
export function validarManifiesto() {
  const problemas = [];
  const ids = new Set();
  const indices = new Set();
  const TIPOS = ['estructural', 'factual', 'comparativa'];

  CATEGORIAS.forEach((c, i) => {
    if (ids.has(c.id)) problemas.push(`id duplicado: ${c.id}`);
    ids.add(c.id);

    if (!c.indice) problemas.push(`indice vacío: ${c.id}`);
    else if (indices.has(c.indice)) problemas.push(`indice duplicado: ${c.indice} (${c.id})`);
    indices.add(c.indice);

    if (c.orden !== i + 1) problemas.push(`orden no contiguo en ${c.id}: ${c.orden} (esperado ${i + 1})`);
    if (TIPOS.indexOf(c.tipo) === -1) problemas.push(`tipo inválido en ${c.id}: ${c.tipo}`);
  });

  return problemas;
}
