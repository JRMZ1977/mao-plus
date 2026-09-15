/**
 * GLOSSARY ANNEX — Renderizador del glosario canónico
 * ==========================================================================
 * Convierte los datos de `glossary.js` en las superficies que los leen. NINGUNA
 * de ellas escribe definiciones por su cuenta: si una definición hay que
 * cambiarla, se cambia en `glossary.js` y las tres cambian a la vez.
 *
 *   · `convencionesHTML()`      — preámbulo de siglas y términos de interfaz.
 *   · `anexoGlosarioHTML()`     — anexo del informe, en orden canónico (I → XX-b).
 *   · `diccionarioColumnasCSV()`— tabla columna del CSV → definición. Es lo que
 *                                 hace legible un CSV de MAO sin el código delante.
 *   · `bibliografiaHTML()`      — referencias citadas, deduplicadas.
 *   · `tooltipDe()`             — texto plano para el `title=` de la Tabla Completa.
 *
 * El numeral romano de cada sección NO se escribe aquí: se pide a
 * `category-manifest.js` con `encabezadoDe()`, que es la única fuente del índice
 * (ADR-019, y hay un test que lo hace cumplir).
 * ==========================================================================
 */

import { CATEGORIAS, encabezadoDe, indiceDe } from './category-manifest.js';
import { TERMINOS, REFERENCIAS, CONVENCIONES, porCategoria, referenciasDe } from './glossary.js';

/** Escapa texto para insertarlo en HTML. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convierte los backticks de Markdown en `<code>`. Las definiciones citan claves
 * (`area_px`) y conviene que se distingan del texto corrido.
 */
function codigos(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

const EST = {
  seccion: 'margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #d5d9de; font-size: 15px; color: #1f2933;',
  termino: 'margin: 0 0 14px; padding: 12px 14px; border: 0.5px solid #d5d9de; border-radius: 4px; background: #fff;',
  nombre: 'font-weight: 600; color: #1f2933; font-size: 13.5px;',
  clave: 'font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; color: #52606d; background: #f5f7f9; padding: 1px 5px; border-radius: 3px;',
  meta: 'font-size: 11.5px; color: #616e7c; margin: 6px 0 0;',
  formula: 'font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #1f2933; background: #f5f7f9; padding: 6px 8px; border-radius: 3px; margin: 8px 0; overflow-x: auto;',
  cuerpo: 'font-size: 12.5px; color: #323f4b; line-height: 1.55; margin: 8px 0 0;',
  interp: 'font-size: 12.5px; color: #323f4b; line-height: 1.55; margin: 8px 0 0; padding-left: 10px; border-left: 2px solid #2f6fed;',
  nota: 'font-size: 11.5px; color: #8a6d00; background: #fdf6e3; border-left: 2px solid #d9a400; padding: 6px 8px; margin: 8px 0 0; border-radius: 0 3px 3px 0;',
  convencion: 'margin: 0 0 12px; padding: 14px 16px; border: 0.5px solid #d5d9de; border-left: 3px solid #2f6fed; border-radius: 0 4px 4px 0; background: #fff;',
  sigla: 'font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 15px; font-weight: 600; color: #2f6fed;',
  expansion: 'font-size: 14px; font-weight: 600; color: #1f2933;',
  tabla: 'width: 100%; border-collapse: collapse; font-size: 12px; margin: 10px 0;',
  th: 'text-align: left; padding: 6px 8px; border-bottom: 1px solid #cbd2d9; color: #52606d; font-weight: 600; white-space: nowrap;',
  td: 'padding: 6px 8px; border-bottom: 0.5px solid #e4e7eb; vertical-align: top; color: #323f4b;',
};

/** Una entrada del glosario, renderizada. */
function terminoHTML(t) {
  const bloques = [];

  bloques.push(
    `<div><span style="${EST.nombre}">${esc(t.nombre)}</span>` +
    `&nbsp;&nbsp;<span style="${EST.clave}">${esc(t.clave)}</span></div>`
  );

  const meta = [`Unidad: <strong>${esc(t.unidad)}</strong>`];
  if (t.rango) meta.push(`Rango: ${esc(t.rango)}`);
  if (t.nivel) meta.push(`Nivel ${esc(t.nivel)} del repertorio canónico`);
  if (t.csv) meta.push(`CSV: «${esc(t.csv[0])} › ${esc(t.csv[1])}»`);
  bloques.push(`<p style="${EST.meta}">${meta.join(' &nbsp;·&nbsp; ')}</p>`);

  if (t.formula) bloques.push(`<div style="${EST.formula}">${esc(t.formula)}</div>`);
  bloques.push(`<p style="${EST.cuerpo}">${codigos(t.definicion)}</p>`);
  bloques.push(`<p style="${EST.interp}">${codigos(t.interpretacion)}</p>`);
  if (t.nota) bloques.push(`<p style="${EST.nota}">${codigos(t.nota)}</p>`);

  const refs = referenciasDe(t);
  if (refs.length) {
    bloques.push(
      `<p style="${EST.meta}">Referencia: ${refs.map(r => esc(r)).join('<br>')}</p>`
    );
  }
  bloques.push(`<p style="${EST.meta}">Calculada en <code>${esc(t.fuente)}</code></p>`);

  return `<div style="${EST.termino}">${bloques.join('\n')}</div>`;
}

/**
 * Anexo completo, en el orden canónico del manifiesto. Solo se rinden las
 * categorías que tienen términos: un anexo con secciones vacías sugeriría que la
 * métrica no existe, cuando lo que pasa es que aún no está documentada.
 * @param {{soloCategorias?: string[], anclas?: boolean}} [opciones] `anclas`
 *        añade `id="cat-<id>"` a cada encabezado, para enlazar desde un índice.
 */
export function anexoGlosarioHTML(opciones = {}) {
  const filtro = opciones.soloCategorias || null;
  const anclas = !!opciones.anclas;
  const partes = [];

  for (const cat of CATEGORIAS) {
    if (filtro && !filtro.includes(cat.id)) continue;
    const ts = porCategoria(cat.id);
    if (!ts.length) continue;

    const id = anclas ? ` id="cat-${esc(cat.id)}"` : '';
    partes.push(`<h3${id} style="${EST.seccion}">${esc(encabezadoDe(cat.id))}</h3>`);
    if (cat.desc) {
      partes.push(`<p style="${EST.meta}">${esc(cat.desc)}</p>`);
    }
    partes.push(ts.map(terminoHTML).join('\n'));
  }

  return partes.join('\n');
}

/**
 * Preámbulo de convenciones: qué significa cada sigla de la interfaz. Va ANTES
 * de las métricas porque es la clave de lectura de todo lo que sigue — una sigla
 * mal expandida hace que el lector atribuya el resultado a otra cosa.
 */
export function convencionesHTML() {
  if (!CONVENCIONES.length) return '';
  return CONVENCIONES.map(c => {
    // Una sigla se lee «A = B»; una regla de uso, no. Rendirlas igual produce
    // rótulos absurdos del tipo «Confianza = siempre calificada».
    const nexo = c.tipo === 'sigla' ? '&nbsp;&nbsp;=&nbsp;&nbsp;' : '&nbsp;&nbsp;→&nbsp;&nbsp;';
    return `<div style="${EST.convencion}">` +
      `<div><span style="${EST.sigla}">${esc(c.termino)}</span>${nexo}` +
      `<span style="${EST.expansion}">${esc(c.expansion)}</span></div>` +
      `<p style="${EST.cuerpo}">${codigos(c.nota)}</p>` +
      `</div>`;
  }).join('\n');
}

/**
 * Diccionario de datos del CSV: para cada columna publicada, qué significa.
 * Ordenado por sección del CSV, que es como se lee un CSV — no por el índice
 * canónico, que es como se lee el informe. Las dos ordenaciones son legítimas y
 * responden a preguntas distintas.
 */
export function diccionarioColumnasCSV() {
  const conCSV = TERMINOS.filter(t => t.csv);
  const porSeccion = new Map();
  for (const t of conCSV) {
    if (!porSeccion.has(t.csv[0])) porSeccion.set(t.csv[0], []);
    porSeccion.get(t.csv[0]).push(t);
  }

  const partes = [];
  for (const [seccion, ts] of [...porSeccion.entries()].sort()) {
    partes.push(`<h3 style="${EST.seccion}">${esc(seccion)}</h3>`);
    partes.push(
      `<table style="${EST.tabla}"><thead><tr>` +
      `<th style="${EST.th}">Columna</th><th style="${EST.th}">Clave</th>` +
      `<th style="${EST.th}">Unidad</th><th style="${EST.th}">Sección del informe</th>` +
      `<th style="${EST.th}">Definición</th>` +
      `</tr></thead><tbody>` +
      ts.map(t =>
        `<tr><td style="${EST.td}">${esc(t.csv[1])}</td>` +
        `<td style="${EST.td}"><code>${esc(t.clave)}</code></td>` +
        `<td style="${EST.td}">${esc(t.unidad)}</td>` +
        `<td style="${EST.td}">${esc(indiceDe(t.categoria))}</td>` +
        `<td style="${EST.td}">${codigos(t.definicion)}</td></tr>`
      ).join('') +
      `</tbody></table>`
    );
  }
  return partes.join('\n');
}

/** Bibliografía citada, deduplicada y ordenada alfabéticamente. */
export function bibliografiaHTML() {
  const usadas = new Set();
  for (const t of TERMINOS) for (const r of (t.ref || [])) usadas.add(r);
  const items = [...usadas].map(k => REFERENCIAS[k]).filter(Boolean).sort();
  if (!items.length) return '';
  return `<ul style="${EST.cuerpo} padding-left: 20px;">` +
    items.map(r => `<li style="margin-bottom: 6px;">${esc(r)}</li>`).join('') +
    `</ul>`;
}

/**
 * Texto plano de una métrica, para el atributo `title=` de la Tabla Completa.
 * Sin HTML: el navegador lo muestra tal cual.
 * @returns {string} cadena vacía si la métrica no está documentada.
 */
export function tooltipDe(clave, ambito = 'objeto') {
  const t = TERMINOS.find(x => x.clave === clave && x.ambito === ambito);
  if (!t) return '';
  const partes = [`${t.nombre} (${t.unidad})`, t.definicion];
  if (t.formula) partes.push(`Fórmula: ${t.formula}`);
  if (t.rango) partes.push(`Rango: ${t.rango}`);
  if (t.nota) partes.push(`Nota: ${t.nota}`);
  return partes.join('\n\n').replace(/`/g, '');
}

/** Resumen de cobertura, para la cabecera del anexo. */
export function resumenCobertura() {
  const cats = new Set(TERMINOS.map(t => t.categoria));
  return {
    terminos: TERMINOS.length,
    convenciones: CONVENCIONES.length,
    categorias: cats.size,
    conFormula: TERMINOS.filter(t => t.formula).length,
    conCSV: TERMINOS.filter(t => t.csv).length,
    conReferencia: TERMINOS.filter(t => t.ref && t.ref.length).length,
  };
}
