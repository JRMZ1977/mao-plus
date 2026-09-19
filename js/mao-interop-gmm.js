/**
 * js/mao-interop-gmm.js — interoperabilidad con la morfometría geométrica (ADR-021)
 *
 * Fuente ÚNICA, en el renderer, de lo que MAO exporta para otros programas de
 * morfometría (Momocs, pyefd, geomorph, tpsRelw). Antes había tres generadores de
 * TPS y tres de CSV EFA, cada uno con su convenio. Dos defectos lo motivaron:
 *
 *  1. EFA · los CSV exportaban los coeficientes en el convenio INTERNO de MAO, que
 *     está desfasado 90° respecto de Kuhl & Giardina (1982) — ver la cabecera de
 *     python/modules/efa.py. Cargados en Momocs o pyefd describen otra curva. Aquí
 *     se exportan en el convenio de K&G: los calcula el backend
 *     (`coefficients_kg`, `coefficients_raw_kg`) y, para análisis guardados antes
 *     de ADR-021, se DERIVAN de los crudos de MAO (conversión exacta) y se
 *     renormalizan con la normalización de K&G §4, la misma de pyefd y Momocs.
 *
 *  2. TPS · los «landmarks semi-automáticos» eran 22 puntos equidistantes desde
 *     el primer punto del contorno más 10 de curvatura máxima AÑADIDOS AL FINAL:
 *     el punto i de un espécimen no correspondía al punto i de otro, y un GPA
 *     emparejaba puntos no homólogos. Ahora son N semilandmarks equidistantes en
 *     longitud de arco, en orden de contorno, con sentido y punto de inicio
 *     reproducibles; los de curvatura quedan como ayuda visual opcional.
 *
 * Script clásico sin dependencias: lo usan analysis-core.js (módulo ES),
 * project-manager.js, comparator.js, procrustes.js y mao-ia.js a través de
 * `window.MaoInteropGMM`. En Node se exporta por `module.exports` para los tests.
 */
(function (raiz) {
  'use strict';

  // ── Constantes ─────────────────────────────────────────────────────────────

  /** Semilandmarks por contorno en el TPS. FIJO: todos los especímenes igual. */
  const N_SEMILANDMARKS = 64;

  /** Nombres de convenio, idénticos a los de `coefficient_convention` del backend. */
  const CONVENIO = Object.freeze({ MAO: 'mao', KG: 'kuhl_giardina_1982' });

  /** Por debajo, la asimetría (3er momento estandarizado) se trata como nula. */
  const ASIMETRIA_NULA = 1e-3;
  /**
   * Por debajo, el extremo elegido puede cambiar con el ruido del contorno. Medido
   * con contornos de OpenCV rasterizados a 24 rotaciones: el ruido de la asimetría
   * de una forma exactamente simétrica es ≤ 0,003 con ~500 px de diámetro y
   * ~0,01 con ~100 px.
   */
  const ASIMETRIA_FIRME = 0.02;
  /**
   * El eje mayor decide salvo que su asimetría sea menor que esta fracción de la
   * del eje menor. Sin esto, una forma en «D» (medio disco: simétrica respecto del
   * eje menor) elegiría el extremo por el ruido.
   */
  const PESO_EJE_MENOR = 0.25;
  /** Por encima (semieje menor / mayor del 1er armónico), θ₁ está mal condicionado. */
  const RAZON_EJES_CIRCULAR = 0.95;

  const _version = () => String(raiz.MAO_VERSION || '');

  // ── Utilidades ─────────────────────────────────────────────────────────────

  /** [[x,y]|{x,y}] → [[x,y]] finitos, sin duplicados consecutivos ni cierre explícito. */
  function normalizarPuntos(puntos) {
    if (!Array.isArray(puntos)) return [];
    const out = [];
    for (const p of puntos) {
      let x = NaN, y = NaN;
      if (Array.isArray(p) && p.length >= 2) { x = Number(p[0]); y = Number(p[1]); }
      else if (p && typeof p === 'object') { x = Number(p.x); y = Number(p.y); }
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const u = out[out.length - 1];
      if (u && u[0] === x && u[1] === y) continue;
      out.push([x, y]);
    }
    if (out.length > 1) {
      const a = out[0], z = out[out.length - 1];
      if (a[0] === z[0] && a[1] === z[1]) out.pop();
    }
    return out;
  }

  function _esMatriz4(m) {
    return Array.isArray(m) && m.length > 0 && m.every(
      (r) => Array.isArray(r) && r.length >= 4 && r.slice(0, 4).every((v) => Number.isFinite(Number(v))));
  }

  const _grados = (rad) => (rad * 180) / Math.PI;

  // ── EFA · convenio de Kuhl & Giardina ─────────────────────────────────────

  /**
   * Crudos del convenio MAO → crudos de Kuhl & Giardina.
   * a_KG = −b_MAO · b_KG = a_MAO · c_KG = −d_MAO · d_KG = c_MAO. Exacta (sin
   * aritmética). NO sirve para coeficientes normalizados: la rama de θ₁ difiere
   * entre convenios, así que éstos se renormalizan desde los crudos convertidos.
   */
  function kgDesdeMao(coefMao) {
    return coefMao.map((r) => [
      -Number(r[1]) + 0, Number(r[0]) + 0, -Number(r[3]) + 0, Number(r[2]) + 0,
    ]);
  }

  /**
   * Normalización de Kuhl & Giardina (1982, §4) tal como la implementan
   * `pyefd.normalize_efd(size_invariant=True)` y `Momocs::efourier_norm`:
   * fase θ₁ al semieje mayor del 1er armónico, giro −ψ₁ que lo lleva al eje x y
   * división por |a₁|. Sin canonizar la quiralidad (d₁ conserva su signo).
   */
  function normalizarKG(crudos) {
    const c = crudos.map((r) => r.slice(0, 4).map(Number));
    const [a1, b1, c1, d1] = c[0];
    const th = 0.5 * Math.atan2(2 * (a1 * b1 + c1 * d1), a1 * a1 - b1 * b1 + c1 * c1 - d1 * d1);
    const fase = c.map(([a, b, cc, d], i) => {
      const co = Math.cos((i + 1) * th), si = Math.sin((i + 1) * th);
      return [a * co + b * si, -a * si + b * co, cc * co + d * si, -cc * si + d * co];
    });
    const psi = Math.atan2(fase[0][2], fase[0][0]);
    const cp = Math.cos(psi), sp = Math.sin(psi);
    const giro = fase.map(([a, b, cc, d]) => [
      cp * a + sp * cc, cp * b + sp * d, -sp * a + cp * cc, -sp * b + cp * d,
    ]);
    const escala = Math.abs(giro[0][0]);
    return {
      coeficientes: escala > 0 ? giro.map((r) => r.map((v) => v / escala)) : giro,
      normalizacion: { theta_1_deg: _grados(th), psi_1_deg: _grados(psi), scale_factor: escala },
    };
  }

  /**
   * Coeficientes de un `efaData` (respuesta de /api/efa o `_efa_data` guardado)
   * en el convenio de Kuhl & Giardina, o `null` si no se pueden obtener.
   *
   * origen 'backend'  → calculados por efa.py (ADR-021), sin redondear.
   * origen 'derivado' → análisis anterior a ADR-021: convertidos desde
   *                     `coefficients_raw` (MAO, redondeados a 8 decimales) y
   *                     renormalizados aquí. Exactos salvo ese redondeo.
   * `null`            → sin crudos no hay conversión posible: los normalizados de
   *                     MAO no se pueden pasar a K&G sin saber la rama de θ₁.
   */
  function efaKuhlGiardina(efaData) {
    if (!efaData || typeof efaData !== 'object') return null;
    const conv = efaData.coefficient_convention || {};
    if (_esMatriz4(efaData.coefficients_kg) && _esMatriz4(efaData.coefficients_raw_kg) &&
        conv.coefficients_kg === CONVENIO.KG && conv.coefficients_raw_kg === CONVENIO.KG) {
      const nk = efaData.normalization_kg || {};
      return {
        crudos: efaData.coefficients_raw_kg.map((r) => r.slice(0, 4).map(Number)),
        normalizados: efaData.coefficients_kg.map((r) => r.slice(0, 4).map(Number)),
        normalizacion: {
          theta_1_deg: nk.theta_1_deg, psi_1_deg: nk.psi_1_deg, scale_factor: nk.scale_factor,
        },
        origen: 'backend',
      };
    }
    if (_esMatriz4(efaData.coefficients_raw) &&
        (conv.coefficients_raw === undefined || conv.coefficients_raw === CONVENIO.MAO)) {
      const crudos = kgDesdeMao(efaData.coefficients_raw);
      const n = normalizarKG(crudos);
      return { crudos, normalizados: n.coeficientes, normalizacion: n.normalizacion, origen: 'derivado' };
    }
    return null;
  }

  /**
   * Copia de `efaData` con los campos de K&G y la declaración de convenio
   * completados, para los JSON que se escriben a disco. No toca los de MAO.
   */
  function efaConConvenio(efaData) {
    if (!efaData || typeof efaData !== 'object') return efaData ?? null;
    const kg = efaKuhlGiardina(efaData);
    const out = { ...efaData };
    const conv = { ...(efaData.coefficient_convention || {}) };
    if (Array.isArray(efaData.coefficients)) conv.coefficients = conv.coefficients || CONVENIO.MAO;
    if (Array.isArray(efaData.coefficients_raw)) conv.coefficients_raw = conv.coefficients_raw || CONVENIO.MAO;
    if (kg) {
      out.coefficients_kg = kg.normalizados;
      out.coefficients_raw_kg = kg.crudos;
      out.normalization_kg = kg.normalizacion;
      conv.coefficients_kg = CONVENIO.KG;
      conv.coefficients_raw_kg = CONVENIO.KG;
      if (kg.origen === 'derivado') out.coefficients_kg_origen = 'derivado_de_coefficients_raw';
    }
    out.coefficient_convention = conv;
    return out;
  }

  /**
   * CSV de un análisis EFA. Tabla primero y bloque de metadatos después de una
   * línea en blanco (`read.csv(..., nrows = n)` / `pandas.read_csv(nrows=n)`).
   *
   * Las 9 primeras columnas son las intercambiables (Kuhl & Giardina):
   *   a_norm_kg…d_norm_kg = pyefd.elliptic_fourier_descriptors(..., normalize=True)
   *                         y Momocs efourier(norm = TRUE)
   *   a_raw_kg…d_raw_kg   = sin normalizar, t=0 en el primer punto del contorno
   * Las `*_mao` son el descriptor interno de MAO (el de d_EFD y el comparador) y
   * NO deben cargarse en Momocs/pyefd. El sufijo va en el nombre de columna a
   * propósito: un script que leía `a_norm` falla en vez de mezclar convenios.
   *
   * @param {Object} efaData respuesta de /api/efa o `_efa_data` guardado
   * @param {string} fuente  identificador de la fuente (contorno, P1, H1…)
   * @returns {string}
   */
  function csvEFA(efaData, fuente = '') {
    const e = efaData || {};
    const mao = Array.isArray(e.coefficients) ? e.coefficients : [];
    const kg = efaKuhlGiardina(e);
    const ps = Array.isArray(e.power_spectrum) ? e.power_spectrum : [];
    const varAc = Array.isArray(e.variance_explained) ? e.variance_explained : [];
    const nFilas = Math.max(mao.length, kg ? kg.normalizados.length : 0);

    const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) ? '' : String(Number(v));
    const txt = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const fila4 = (m, i) => (Array.isArray(m) && Array.isArray(m[i]) ? m[i].slice(0, 4) : [])
      .concat(['', '', '', '']).slice(0, 4).map(num);

    const lineas = ['harmonic,a_norm_kg,b_norm_kg,c_norm_kg,d_norm_kg,a_raw_kg,b_raw_kg,c_raw_kg,d_raw_kg,' +
      'power_spectrum,variance_acum_pct,a_norm_mao,b_norm_mao,c_norm_mao,d_norm_mao'];
    for (let i = 0; i < nFilas; i++) {
      lineas.push([
        i + 1,
        ...fila4(kg && kg.normalizados, i),
        ...fila4(kg && kg.crudos, i),
        num(ps[i]), num(varAc[i]),
        ...fila4(mao, i),
      ].join(','));
    }

    const n = e.normalization || {};
    const nk = (kg && kg.normalizacion) || {};
    const dc = Array.isArray(e.dc) ? e.dc : [];
    const esc = Number(e.scale_px_mm);
    const fila = (seccion, campo, valor, nota) => `${seccion},${campo},${txt(valor)},${txt(nota)}`;
    const origenKg = !kg ? 'no disponible'
      : (kg.origen === 'backend' ? 'backend (efa.py, sin redondear)' : 'derivado de coefficients_raw');

    const meta = [
      'Seccion,Campo,Valor,Nota',
      fila('EFA_Metadatos', 'Fuente', fuente, 'Contorno al que corresponden los coeficientes'),
      fila('EFA_Metadatos', 'Armonicos', num(e.n_harmonics), 'Numero de armonicos calculados'),
      fila('EFA_Metadatos', 'Puntos_contorno', num(e.n_points_input), 'Puntos de entrada del contorno'),
      fila('EFA_Metadatos', 'Armonicos_95pct', num(e.harmonics_for_95pct),
        'Armonicos necesarios para explicar el 95% de la varianza'),
      fila('EFA_Metadatos', 'Armonicos_99pct', num(e.harmonics_for_99pct),
        'Armonicos necesarios para explicar el 99% de la varianza'),
      fila('EFA_Metadatos', 'Escala_mm_px', (Number.isFinite(esc) && esc > 0) ? esc : '',
        'mm/px aplicados al contorno ANTES del EFD; vacio = sin escala configurada'),
      fila('EFA_Metadatos', 'Version_MAO', _version(), 'Version de MAO Plus que genero el archivo'),

      fila('EFA_Convenio', 'Convenio_kg', 'Kuhl & Giardina (1982)',
        'Columnas *_kg: x(t)=A0+sum_k[a_k cos(2 pi k t/T)+b_k sin(2 pi k t/T)], y(t)=C0+sum_k[c_k cos+d_k sin], ' +
        't = longitud de arco. Mismo convenio que pyefd y Momocs: se cargan directamente'),
      fila('EFA_Convenio', 'Origen_kg', origenKg, kg && kg.origen === 'derivado'
        ? 'Analisis anterior a MAO 1.3.1: convertidos de los crudos MAO (redondeados a 1e-8) y renormalizados'
        : (kg ? 'Calculados por el backend con el contorno del analisis'
          : 'El analisis guardado no trae coeficientes crudos: recalcule el EFA para obtenerlos')),
      fila('EFA_Convenio', 'Normalizacion_kg',
        'K&G 1982 sec. 4: fase theta1, giro -psi1, escala |a1|',
        'Identica a pyefd.normalize_efd(size_invariant=True) y a Momocs efourier(norm=TRUE). ' +
        'Sin canonizar la quiralidad: d1 < 0 si el contorno se recorre en sentido horario en el sistema de la imagen'),
      fila('EFA_Convenio', 'Crudos_kg', 't=0 en el primer punto del contorno',
        'Iguales a pyefd.elliptic_fourier_descriptors(contorno cerrado repitiendo el primer punto, normalize=False)'),
      fila('EFA_Convenio', 'Columnas_mao', 'descriptor interno de MAO',
        'a_norm_mao..d_norm_mao son los que usa MAO para d_EFD y el comparador. Desfasados 90 grados respecto de ' +
        'K&G y con quiralidad canonizada (d1>=0): NO cargar en Momocs ni pyefd'),
      fila('EFA_Convenio', 'Ambiguedad_180', 'propia de la normalizacion de K&G',
        'theta1 solo esta definido modulo 180 grados: segun el punto de inicio del contorno, los armonicos PARES ' +
        'normalizados pueden cambiar de signo (tambien en pyefd y Momocs). Para comparar especimenes alinee el ' +
        'punto de inicio o use los crudos. Espectro y varianza no se ven afectados'),
      fila('EFA_Coordenadas', 'Sistema', 'imagen: origen arriba-izquierda, y hacia abajo',
        'Unidades del contorno: mm si Escala_mm_px no esta vacio; si no, pixeles'),

      fila('EFA_Normalizacion', 'scale_factor', num(n.scale_factor !== undefined ? n.scale_factor : nk.scale_factor),
        'TAMANO: semieje mayor del PRIMER ARMONICO tras alinear la orientacion, en las unidades del contorno ' +
        '(mm si Escala_mm_px no esta vacio). Igual en ambos convenios. Multiplicar los coeficientes normalizados ' +
        'por el restituye la magnitud. NO es el semieje mayor del objeto: la razon entre ambos varia con la elongacion'),
      fila('EFA_Normalizacion', 'theta_1_deg_kg', num(nk.theta_1_deg),
        'Fase eliminada en el convenio K&G (grados): alinea el inicio con el semieje mayor del 1er armonico'),
      fila('EFA_Normalizacion', 'psi_1_deg_kg', num(nk.psi_1_deg),
        'Rotacion en el plano eliminada en el convenio K&G (grados)'),
      fila('EFA_Normalizacion', 'theta_1_deg_mao', num(n.theta_1_deg),
        'Fase eliminada en el convenio interno de MAO (grados; difiere de la K&G en +-90)'),
      fila('EFA_Normalizacion', 'psi_1_deg_mao', num(n.psi_1_deg),
        'Rotacion en el plano eliminada en el convenio interno de MAO (grados)'),
      fila('EFA_Normalizacion', 'convenio_quiralidad_mao', 'd1>=0',
        'Solo columnas *_mao: si d1<0 se niegan cn y dn de todos los armonicos, despues del escalado'),

      fila('EFA_DC', 'dc_a', num(dc[0]),
        'A0 de K&G: centroide del contorno (longitud de arco) en X = locus de pyefd.reconstruct_contour'),
      fila('EFA_DC', 'dc_c', num(dc[1]), 'C0 de K&G: centroide del contorno (longitud de arco) en Y'),
    ];

    return `${lineas.join('\n')}\n\n${meta.join('\n')}\n`;
  }

  // ── TPS · semilandmarks de contorno ───────────────────────────────────────

  function _buscarSegmento(S, s) {
    let lo = 0, hi = S.length - 2;          // S[0]=0 … S[m]=T; segmentos 0..m-1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (S[mid] <= s) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  /**
   * N semilandmarks equidistantes en longitud de arco sobre un contorno cerrado,
   * con correspondencia reproducible entre especímenes:
   *
   *  · SENTIDO: antihorario en pantalla (área con signo negativa en coordenadas de
   *    imagen, y hacia abajo). Un contorno horario se invierte.
   *  · INICIO: el punto del contorno donde empieza la parametrización normalizada
   *    de la EFA — la fase θ₁ de Kuhl & Giardina (1982), que alinea el inicio con
   *    un extremo del semieje mayor de la elipse del 1er armónico. θ₁ sólo está
   *    definida módulo π (dos extremos); el extremo se elige por la ASIMETRÍA del
   *    contorno: el del lado hacia el que el tercer momento estandarizado a lo
   *    largo del eje mayor es positivo (la cola larga de la distribución). Si esa
   *    asimetría es menor que un cuarto de la del eje menor —forma en «D», casi
   *    simétrica respecto del eje menor, como medio disco— decide el eje menor,
   *    con la orientación fijada por el sentido de recorrido.
   *  · Todo es invariante a traslación, rotación, escala, punto de inicio del
   *    contorno de entrada y sentido de recorrido.
   *
   * Son semilandmarks DESLIZANTES (Bookstein 1997; Gunz & Mitteroecker 2013): su
   * posición a lo largo de la curva es arbitraria y debe optimizarse en el GPA
   * (geomorph::gpagen con `curves`, ver `curveslideCerrado`). El primero —el
   * inicio reproducible— queda fijo como punto construido (tipo III).
   *
   * `inicio.estable = false` avisa de que el inicio puede no reproducirse entre
   * fotografías de la misma pieza: 1er armónico casi circular (θ₁ mal
   * condicionada) o forma casi simétrica (el extremo lo decide el ruido).
   *
   * @param {Array} puntos contorno [[x,y]] o [{x,y}] (píxeles de imagen)
   * @param {number} [n=N_SEMILANDMARKS]
   * @returns {{puntos:Array, n:number, sentido:string, recorridoInvertido:boolean,
   *            inicio:Object, perimetro:number, metodo:string, motivo?:string}}
   */
  function semilandmarksContorno(puntos, n = N_SEMILANDMARKS) {
    const N = Math.max(3, Math.floor(Number(n)) || N_SEMILANDMARKS);
    const vacio = (motivo) => ({ puntos: [], n: 0, motivo, metodo: 'semilandmarks_equidistantes' });
    const P0 = normalizarPuntos(puntos);
    if (P0.length < 3) return vacio('contorno con menos de 3 puntos distintos');

    // 1 · Sentido
    const m = P0.length;
    let area2 = 0;
    for (let i = 0; i < m; i++) {
      const p = P0[i], q = P0[(i + 1) % m];
      area2 += p[0] * q[1] - q[0] * p[1];
    }
    if (!(Math.abs(area2) > 1e-9)) return vacio('contorno degenerado (area nula)');
    const invertido = area2 > 0;            // imagen (y hacia abajo): >0 ⇔ horario en pantalla
    const P = invertido ? P0.slice().reverse() : P0;

    // 2 · Longitud de arco
    const L = new Array(m);
    const S = new Array(m + 1);
    S[0] = 0;
    for (let i = 0; i < m; i++) {
      const p = P[i], q = P[(i + 1) % m];
      L[i] = Math.hypot(q[0] - p[0], q[1] - p[1]);
      S[i + 1] = S[i] + L[i];
    }
    const T = S[m];

    // 3 · Primer armónico de Kuhl & Giardina (ecs. 6-7, t = 0 en P[0]) y θ₁
    let a1 = 0, b1 = 0, c1 = 0, d1 = 0;
    for (let i = 0; i < m; i++) {
      if (!(L[i] > 0)) continue;
      const p = P[i], q = P[(i + 1) % m];
      const f0 = (2 * Math.PI * S[i]) / T, f1 = (2 * Math.PI * S[i + 1]) / T;
      const vx = (q[0] - p[0]) / L[i], vy = (q[1] - p[1]) / L[i];
      const dcos = Math.cos(f1) - Math.cos(f0), dsin = Math.sin(f1) - Math.sin(f0);
      a1 += vx * dcos; b1 += vx * dsin; c1 += vy * dcos; d1 += vy * dsin;
    }
    const K = T / (2 * Math.PI * Math.PI);
    a1 *= K; b1 *= K; c1 *= K; d1 *= K;
    const theta1 = 0.5 * Math.atan2(2 * (a1 * b1 + c1 * d1), a1 * a1 - b1 * b1 + c1 * c1 - d1 * d1);
    const co = Math.cos(theta1), si = Math.sin(theta1);
    const ux = a1 * co + b1 * si, uy = c1 * co + d1 * si;        // semieje mayor en la fase θ₁
    const semiMayor = Math.hypot(ux, uy);
    const semiMenor = Math.hypot(-a1 * si + b1 * co, -c1 * si + d1 * co);
    const razonEjes = semiMayor > 0 ? semiMenor / semiMayor : 1;

    // 4 · Qué extremo del eje mayor: asimetría (3er momento, exacto por segmento)
    let cx = 0, cy = 0;
    for (let i = 0; i < m; i++) {
      const p = P[i], q = P[(i + 1) % m];
      cx += (L[i] * (p[0] + q[0])) / 2;
      cy += (L[i] * (p[1] + q[1])) / 2;
    }
    cx /= T; cy /= T;
    const eu = semiMayor > 0 ? [ux / semiMayor, uy / semiMayor] : [1, 0];
    const ev = [-eu[1], eu[0]];
    const asimetria = (w) => {
      let m2 = 0, m3 = 0;
      for (let i = 0; i < m; i++) {
        const p = P[i], q = P[(i + 1) % m];
        const g0 = (p[0] - cx) * w[0] + (p[1] - cy) * w[1];
        const g1 = (q[0] - cx) * w[0] + (q[1] - cy) * w[1];
        m2 += (L[i] * (g0 * g0 + g0 * g1 + g1 * g1)) / 3;
        m3 += (L[i] * (g0 + g1) * (g0 * g0 + g1 * g1)) / 4;
      }
      m2 /= T; m3 /= T;
      return m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0;
    };
    const gu = asimetria(eu), gv = asimetria(ev);
    const au = Math.abs(gu), av = Math.abs(gv);
    let signo = 1, criterio = 'simetrica', g = Math.max(au, av);
    if (au >= ASIMETRIA_NULA || av >= ASIMETRIA_NULA) {
      if (au >= PESO_EJE_MENOR * av) { signo = Math.sign(gu); criterio = 'eje_mayor'; g = au; }
      else { signo = Math.sign(gv); criterio = 'eje_menor'; g = av; }
    }
    // Si los dos ejes señalan extremos distintos con pesos parecidos, el ruido
    // puede mover la decisión de un criterio al otro entre dos tomas de la pieza.
    const votosCoinciden = Math.sign(gu) === Math.sign(gv) || au < ASIMETRIA_NULA || av < ASIMETRIA_NULA;
    const dominioClaro = au >= 2 * PESO_EJE_MENOR * av || au <= 0.5 * PESO_EJE_MENOR * av;

    const sA = (((theta1 / (2 * Math.PI)) * T) % T + T) % T;       // extremo en la fase θ₁
    const s0 = signo > 0 ? sA : (sA + T / 2) % T;

    // 5 · N puntos equidistantes desde el inicio, en el sentido normalizado
    const out = [];
    for (let k = 0; k < N; k++) {
      let s = s0 + (k * T) / N;
      if (s >= T) s -= T;
      const i = _buscarSegmento(S, s);
      const t = L[i] > 0 ? (s - S[i]) / L[i] : 0;
      const p = P[i], q = P[(i + 1) % m];
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }

    const avisos = [];
    if (razonEjes > RAZON_EJES_CIRCULAR) avisos.push(`primer armonico casi circular (b/a=${razonEjes.toFixed(3)})`);
    if (g < ASIMETRIA_FIRME) avisos.push(`forma casi simetrica (asimetria=${g.toFixed(3)})`);
    if (!votosCoinciden && !dominioClaro) {
      avisos.push(`eje mayor y menor senalan extremos opuestos con asimetrias parecidas (${au.toFixed(3)} / ${av.toFixed(3)})`);
    }
    return {
      puntos: out,
      n: N,
      sentido: 'antihorario_en_pantalla',
      recorridoInvertido: invertido,
      inicio: {
        fraccionArco: s0 / T,
        criterio,
        asimetria: g,
        razonEjes,
        estable: avisos.length === 0,
        avisos,
      },
      perimetro: T,
      metodo: 'semilandmarks_equidistantes',
    };
  }

  /**
   * Matriz de deslizamiento para geomorph::gpagen(A, curves = …) de una curva
   * CERRADA de n semilandmarks, con el convenio que documenta geomorph para curvas
   * cerradas —define.sliders(c(1:n, 1))—: el punto 1 (el inicio reproducible)
   * queda FIJO y deslizan 2…n, cada uno entre su anterior y su siguiente, con
   * cierre (n−1, n, 1). Mismo archivo «curveslide.csv» que escribe esa función.
   * Sin un punto fijo, toda la curva podría deslizar en bloque sobre sí misma.
   */
  function curveslideCerrado(n = N_SEMILANDMARKS) {
    const filas = ['before,slide,after'];
    for (let i = 2; i <= n; i++) filas.push(`${i - 1},${i},${i === n ? 1 : i + 1}`);
    return filas.join('\n') + '\n';
  }

  /**
   * Bloque TPS (Rohlf) de un espécimen. Orden: LM= · coordenadas · IMAGE= · ID= ·
   * SCALE= · COMMENT= (una sola línea, ASCII).
   *
   * Coordenadas en PÍXELES de imagen, que es la convención del formato; `SCALE=`
   * es el multiplicador a mm que aplican tpsRelw y geomorph::readland.tps() —éste
   * sólo si TODOS los especímenes del archivo la traen—. Sin escala NO se emite
   * SCALE= (1.0 afirmaría falsamente 1 mm/px). readland.tps ignora COMMENT=.
   *
   * @param {Object|Array} entrada resultado de `semilandmarksContorno` o una lista de puntos
   * @param {{id?:string, imagen?:string, escalaMmPx?:number|null, curveslide?:string}} [op]
   */
  function bloqueTPS(entrada, op = {}) {
    const esSlm = !!(entrada && !Array.isArray(entrada) && Array.isArray(entrada.puntos));
    const pts = esSlm ? entrada.puntos : (Array.isArray(entrada) ? entrada : []);
    const lineas = [`LM=${pts.length}`];
    for (const p of pts) lineas.push(`${Number(p[0]).toFixed(6)} ${Number(p[1]).toFixed(6)}`);
    if (op.imagen) lineas.push(`IMAGE=${op.imagen}`);
    lineas.push(`ID=${String(op.id || 'OBJ_X')}`);
    const esc = Number(op.escalaMmPx);
    const conEscala = Number.isFinite(esc) && esc > 0;
    if (conEscala) lineas.push(`SCALE=${esc.toFixed(8)}`);

    const partes = [`MAO Plus ${_version()}`.trim()];
    if (esSlm) {
      const ini = entrada.inicio || {};
      partes.push(`${entrada.n} semilandmarks deslizantes equidistantes en longitud de arco sobre el contorno cerrado`);
      partes.push('inicio: extremo del semieje mayor del 1er armonico EFA (fase theta1 de Kuhl-Giardina 1982) ' +
        `elegido por la asimetria del contorno (${ini.criterio || '?'}, g=${Number(ini.asimetria || 0).toFixed(3)})`);
      if (ini.estable === false && Array.isArray(ini.avisos) && ini.avisos.length) {
        partes.push(`ATENCION inicio poco determinado: ${ini.avisos.join('; ')}`);
      }
      partes.push('sentido antihorario en pantalla');
      partes.push('deslizantes todos salvo el 1 (inicio, fijo): ' +
        `${op.curveslide || `geomorph::define.sliders(c(1:${entrada.n},1))`}`);
    } else {
      partes.push('puntos del contorno');
    }
    partes.push('coordenadas en pixeles de imagen, origen arriba-izquierda, y hacia abajo');
    if (!conEscala) partes.push('SIN ESCALA - coordenadas en pixeles de imagen, no convertibles a mm');
    lineas.push(`COMMENT=${partes.join(' | ')}`);
    return lineas.join('\n') + '\n';
  }

  // ── Ayuda visual (NO para GPA): puntos de curvatura máxima ───────────────

  function _curvaturaMenger(p0, p1, p2) {
    const area2 = Math.abs((p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]));
    const den = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) *
      Math.hypot(p0[0] - p2[0], p0[1] - p2[1]);
    return den > 1e-12 ? (2 * area2) / den : 0;
  }

  /**
   * Los k puntos de mayor curvatura de Menger, separados entre sí, en orden de
   * contorno. Es lo que antes se AÑADÍA al final de los landmarks del TPS.
   * Dependen de cada espécimen (número, posición y orden): son una ayuda para
   * mirar el contorno, NO puntos homólogos — no se exportan en el TPS.
   */
  function puntosCurvaturaMaxima(puntos, k = 10) {
    const pts = normalizarPuntos(puntos);
    const n = pts.length;
    if (n < 8 || !(k > 0)) return [];
    const salto = Math.max(1, Math.floor(n / 120));
    const puntuacion = [];
    for (let i = 0; i < n; i++) {
      puntuacion.push({ i, c: _curvaturaMenger(pts[(i - salto + n) % n], pts[i], pts[(i + salto) % n]) });
    }
    puntuacion.sort((a, b) => b.c - a.c);
    const minSep = Math.max(3, Math.floor(n / Math.max(12, k * 2)));
    const elegidos = [];
    for (const s of puntuacion) {
      if (elegidos.length >= k) break;
      if (!elegidos.some((e) => Math.min(Math.abs(s.i - e.i), n - Math.abs(s.i - e.i)) < minSep)) elegidos.push(s);
    }
    return elegidos.sort((a, b) => a.i - b.i).map((e) => ({ indice: e.i, x: pts[e.i][0], y: pts[e.i][1], curvatura: e.c }));
  }

  /** CSV de la ayuda visual, rotulado para que nadie lo tome por landmarks. */
  function csvCurvaturaVisual(puntos, k = 10) {
    const filas = puntosCurvaturaMaxima(puntos, k);
    return [
      'indice_contorno,x_px,y_px,curvatura_menger_px-1',
      ...filas.map((f) => `${f.indice},${f.x},${f.y},${f.curvatura}`),
      '',
      '"AYUDA VISUAL - NO SON LANDMARKS: puntos de curvatura maxima, distintos en numero, posicion y orden en cada ' +
        'especimen. No usar en GPA; para morfometria use el TPS de semilandmarks."',
      '',
    ].join('\n');
  }

  const api = Object.freeze({
    N_SEMILANDMARKS,
    CONVENIO,
    normalizarPuntos,
    kgDesdeMao,
    normalizarKG,
    efaKuhlGiardina,
    efaConConvenio,
    csvEFA,
    semilandmarksContorno,
    curveslideCerrado,
    bloqueTPS,
    puntosCurvaturaMaxima,
    csvCurvaturaVisual,
  });

  raiz.MaoInteropGMM = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
