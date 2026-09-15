#!/usr/bin/env node
/**
 * Genera el glosario canónico como página HTML autónoma.
 *
 * La página es una SALIDA, no una fuente: se regenera desde `js/modules/glossary.js`
 * cada vez. Editarla a mano es exactamente el error que este diseño evita — los
 * cambios se perderían en la siguiente generación y, peor, divergirían de lo que
 * la app muestra en sus tooltips y en el anexo del informe.
 *
 * Uso:  node scripts/generar-glosario-html.mjs [destino.html]
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destino = process.argv[2] || path.join(ROOT, 'GLOSARIO_METRICAS_MAO.html');

const A = await import(path.join(ROOT, 'js/modules/glossary-annex.js'));
const { CATEGORIAS, encabezadoDe } = await import(path.join(ROOT, 'js/modules/category-manifest.js'));
const { porCategoria } = await import(path.join(ROOT, 'js/modules/glossary.js'));

const c = A.resumenCobertura();
const generado = new Date().toISOString().slice(0, 10);

const indice = CATEGORIAS
  .filter(cat => porCategoria(cat.id).length)
  .map(cat => `<li><a href="#cat-${cat.id}">${encabezadoDe(cat.id)}</a>
       <span class="n">${porCategoria(cat.id).length}</span></li>`)
  .join('\n');

const anexo = A.anexoGlosarioHTML({ anclas: true });

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Glosario de métricas — MAO Plus</title>
<style>
  :root { --tinta:#1f2933; --tenue:#616e7c; --linea:#d5d9de; --fondo:#fbfcfd; --acento:#2f6fed; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--fondo); color:var(--tinta);
         font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  .envoltorio { max-width: 940px; margin: 0 auto; padding: 32px 24px 80px; }
  header { border-bottom: 1px solid var(--linea); padding-bottom: 20px; margin-bottom: 24px; }
  h1 { font-size: 22px; margin: 0 0 6px; font-weight: 600; letter-spacing: -0.01em; }
  .sub { color: var(--tenue); font-size: 13px; margin: 0; }
  .cifras { display:flex; flex-wrap:wrap; gap:20px; margin-top:16px; }
  .cifra { font-size:12px; color:var(--tenue); }
  .cifra strong { display:block; font-size:20px; color:var(--tinta); font-weight:600; }
  .aviso { background:#fdf6e3; border-left:3px solid #d9a400; padding:10px 12px;
           border-radius:0 4px 4px 0; font-size:12.5px; margin:20px 0; color:#6b5400; }
  nav { border:0.5px solid var(--linea); border-radius:4px; background:#fff;
        padding:14px 18px; margin-bottom:28px; }
  nav h2 { font-size:13px; margin:0 0 10px; color:var(--tenue); font-weight:600;
           text-transform:uppercase; letter-spacing:0.04em; }
  nav ul { list-style:none; margin:0; padding:0; columns:2; column-gap:28px; }
  nav li { break-inside:avoid; margin-bottom:5px; font-size:12.5px; }
  nav a { color:var(--acento); text-decoration:none; }
  nav a:hover { text-decoration:underline; }
  nav .n { color:var(--tenue); font-size:11px; }
  h2.parte { font-size:16px; margin:44px 0 4px; padding-bottom:8px;
             border-bottom:2px solid var(--tinta); font-weight:600; }
  h2.parte + p { color:var(--tenue); font-size:12.5px; margin:0 0 8px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:0.92em; }
  table { background:#fff; }
  footer { margin-top:56px; padding-top:16px; border-top:1px solid var(--linea);
           color:var(--tenue); font-size:11.5px; }
  @media (max-width: 720px) { nav ul { columns:1; } }
</style>
</head>
<body>
<div class="envoltorio">

<header>
  <h1>Glosario de métricas — MAO Plus</h1>
  <p class="sub">Definiciones canónicas de las magnitudes morfométricas, ordenadas
     según el índice de los informes PDF y CSV.</p>
  <div class="cifras">
    <div class="cifra"><strong>${c.terminos}</strong>términos</div>
    <div class="cifra"><strong>${c.categorias}</strong>categorías</div>
    <div class="cifra"><strong>${c.conFormula}</strong>con fórmula</div>
    <div class="cifra"><strong>${c.conCSV}</strong>publicadas en el CSV</div>
    <div class="cifra"><strong>${c.conReferencia}</strong>con referencia</div>
  </div>
</header>

<div class="aviso">
  <strong>Documento generado.</strong> Sale de <code>js/modules/glossary.js</code> vía
  <code>scripts/generar-glosario-html.mjs</code>. No editar a mano: los cambios se
  perderían al regenerar y divergirían de lo que la app muestra en sus tooltips y
  en el anexo del informe. Las definiciones se corrigen en el módulo.
</div>

<nav>
  <h2>Índice</h2>
  <ul>
${indice}
  </ul>
</nav>

<h2 class="parte">Convenciones de nomenclatura</h2>
<p>Siglas de la interfaz que designan algo distinto de lo que su lectura habitual
   sugiere. Leerlas mal cambia a qué se atribuye el resultado.</p>
${A.convencionesHTML()}

<h2 class="parte">Parte I — Términos por sección del informe</h2>
<p>El orden es el canónico del manifiesto de categorías: abre con la procedencia
   del dato —cómo se detectó la pieza y con qué incertidumbre óptica se midió—
   antes de cualquier resultado.</p>
${anexo}

<h2 class="parte">Parte II — Diccionario de columnas del CSV</h2>
<p>El CSV conserva un esquema de rótulos propio, congelado a propósito para no
   romper los scripts que ya lo consumen. Esta tabla es la correspondencia entre
   ese esquema y el índice del informe.</p>
${A.diccionarioColumnasCSV()}

<h2 class="parte">Parte III — Referencias</h2>
<p>Origen conceptual de cada índice. Una cita indica que la magnitud pertenece a
   esa familia formal, no que el código replique ese trabajo.</p>
${A.bibliografiaHTML()}

<footer>
  MAO Plus · Glosario canónico de métricas morfométricas · generado el ${generado}<br>
  Fuente de las definiciones: <code>js/modules/glossary.js</code> ·
  Fuente del índice: <code>js/modules/category-manifest.js</code>
</footer>

</div>
</body>
</html>
`;

writeFileSync(destino, html, 'utf-8');
console.log(`✅  Glosario generado: ${path.relative(ROOT, destino)}`);
console.log(`    ${c.terminos} términos · ${c.categorias} categorías · ${c.conCSV} columnas de CSV documentadas`);
