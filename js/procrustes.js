// MAO Plus — Módulo de Análisis Procrustes (PS)
// ============================================================================
// MÓDULO: ANÁLISIS DE PROCRUSTES
// Implementa PS Parcial (pairwise) y PS Completa / GPA (Generalized Procrustes
// Analysis) sobre contornos reales de objetos de la colección activa.
//
// Algoritmos formales:
//   · resampleByArc     — N semi-landmarks equidistantes en longitud de arco
//   · svd2x2            — SVD analítica cerrada para la matriz de covarianza 2×2
//   · centrarYNormalizar — traslación al centroide, escala por CS_k = √Σ||xi||²
//   · psParcial         — registro óptimo A→B, distancia ρ = arccos(Σσ/(|A||B|))
//   · gpaIterativo      — consensus iterativo (GPA) con distancias al promedio
// ============================================================================
const ProcrustesModule = (() => {

  // ─── Estado interno ───────────────────────────────────────────────────────
  let _objetos   = [];        // objetos cargados de la colección
  let _selIds    = new Set(); // IDs seleccionados
  let _tabActiva = 'parcial'; // 'parcial' | 'gpa'
  const N_PUNTOS = 64;        // semi-landmarks por contorno

  // ─── Utilidades HTML ──────────────────────────────────────────────────────
  const $  = id  => document.getElementById(id);
  const esc = s  => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  // ──────────────────────────────────────────────────────────────────────────
  //  MATEMÁTICAS PROCRUSTES
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Remuestrea una polilínea cerrada (pts = [{x,y},...]) en N puntos
   * equidistantes según la longitud de arco (semi-landmarks formales).
   * @param {Array<{x:number,y:number}>} pts
   * @param {number} N
   * @returns {Array<{x:number,y:number}>}
   */

  /**
   * Normaliza el sentido de recorrido del contorno a CW en coordenadas
   * de pantalla (Y↓, área con signo positiva). Imprescindible para que
   * el anverso y el reverso (imagen especular) compartan el mismo
   * orden de semi-landmarks antes del registro Procrustes.
   * @param {Array<{x,y}>} pts
   * @returns {Array<{x,y}>}
   */
  function normalizeWinding(pts) {
    if (!pts || pts.length < 3) return pts || [];
    // Fórmula de Gauss (shoelace). Positivo → CW en Y-down (pantalla).
    let a = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    // Si negativo (CCW en pantalla), invertir para tener CW consistente.
    return a < 0 ? pts.slice().reverse() : pts.slice();
  }

  function resampleByArc(pts, N) {
    if (!pts || pts.length < 3) return pts || [];
    // Normalizar sentido de recorrido antes de cualquier cálculo de arco
    pts = normalizeWinding(pts);
    // Longitudes de arco acumuladas (polilínea cerrada)
    const n = pts.length;
    const arc = [0];
    for (let i = 1; i < n; i++) {
      const dx = pts[i].x - pts[i-1].x;
      const dy = pts[i].y - pts[i-1].y;
      arc.push(arc[i-1] + Math.sqrt(dx*dx + dy*dy));
    }
    // Cierre: último → primero
    const dx0 = pts[0].x - pts[n-1].x;
    const dy0 = pts[0].y - pts[n-1].y;
    const totalLen = arc[n-1] + Math.sqrt(dx0*dx0 + dy0*dy0);
    if (totalLen === 0) return pts.slice(0, N);

    // N puntos a intervalos iguales de arco
    const step = totalLen / N;
    const out = [];
    let j = 0;
    for (let i = 0; i < N; i++) {
      const target = i * step;
      while (j < n - 1 && arc[j+1] < target) j++;
      // Interpolación lineal entre pts[j] y pts[(j+1) % n]
      const a0 = arc[j];
      const a1 = j + 1 < n ? arc[j+1] : totalLen;
      const t  = a1 > a0 ? (target - a0) / (a1 - a0) : 0;
      const p0 = pts[j];
      const p1 = pts[(j + 1) % n];
      out.push({ x: p0.x + t * (p1.x - p0.x), y: p0.y + t * (p1.y - p0.y) });
    }
    return out;
  }

  /**
   * SVD analítica cerrada para una matriz 2×2 M = [[m00,m01],[m10,m11]].
   * Devuelve {U, S, V} tales que M = U·diag(S)·V^T.
   * Usado para encontrar la rotación óptima: R* = V·U^T.
   * @param {number[]} m — array [m00, m01, m10, m11]
   * @returns {{U:number[], S:number[], V:number[]}} matrices aplanadas 2×2
   */
  function svd2x2(m) {
    const [m00, m01, m10, m11] = m;
    // Ángulos via Jacobi
    const t1 = 0.5 * Math.atan2(m01 + m10, m00 - m11);
    const t2 = 0.5 * Math.atan2(m01 - m10, m00 + m11);
    const c1 = Math.cos(t1), s1 = Math.sin(t1);
    const c2 = Math.cos(t2), s2 = Math.sin(t2);
    // U = rot(t1+t2), V = rot(t2-t1) en convención estándar
    const ca = Math.cos(t1+t2), sa = Math.sin(t1+t2);
    const cb = Math.cos(t2-t1), sb = Math.sin(t2-t1);
    // Valores singulares
    const s0 = m00*c1*c2 + m11*s1*s2 + m01*s1*c2 + m10*c1*s2;
    const s_  = m00*s1*s2 + m11*c1*c2 - m01*c1*s2 - m10*s1*c2; // en general s0≥s_
    return {
      U: [ca, -sa, sa, ca],    // U  (2×2 aplanada row-major)
      S: [Math.abs(s0), Math.abs(s_)],
      V: [cb, -sb, sb, cb],    // V
      detSign: Math.sign(s0)   // para corrección de reflexión
    };
  }

  /**
   * Calcula el centroide (media) de una configuración de puntos.
   * @param {Array<{x,y}>} pts
   * @returns {{cx:number, cy:number}}
   */
  function centroide(pts) {
    let sx = 0, sy = 0;
    for (const p of pts) { sx += p.x; sy += p.y; }
    return { cx: sx / pts.length, cy: sy / pts.length };
  }

  /**
   * Centra y normaliza una configuración por su CS_k (Centroid Size).
   * CS_k = √(Σ||xi − x̄||²)
   * @param {Array<{x,y}>} pts
   * @returns {{pts:Array<{x,y}>, cs:number, cx:number, cy:number}}
   */
  function centrarYNormalizar(pts) {
    const { cx, cy } = centroide(pts);
    const cent = pts.map(p => ({ x: p.x - cx, y: p.y - cy }));
    const cs = Math.sqrt(cent.reduce((s, p) => s + p.x*p.x + p.y*p.y, 0));
    if (cs === 0) return { pts: cent, cs: 1, cx, cy };
    const norm = cent.map(p => ({ x: p.x / cs, y: p.y / cs }));
    return { pts: norm, cs, cx, cy };
  }

  /**
   * Rotación óptima de A para coincidir con B mediante SVD.
   * Ambas configuraciones deben estar ya centradas y normalizadas.
   * @param {Array<{x,y}>} A
   * @param {Array<{x,y}>} B
   * @returns {{Ar:Array<{x,y}>, sigma:number, R:number[]}} — A rotada, Σσ, R 2×2
   */
  function rotar(A, B) {
    // Matriz de covarianza cruzada M = A^T · B (2×2)
    let m00=0, m01=0, m10=0, m11=0;
    for (let i = 0; i < A.length; i++) {
      m00 += A[i].x * B[i].x;  m01 += A[i].x * B[i].y;
      m10 += A[i].y * B[i].x;  m11 += A[i].y * B[i].y;
    }
    const { U, S, V, detSign } = svd2x2([m00, m01, m10, m11]);
    // R* = V·U^T (con corrección de reflexión si det < 0)
    // V = [[v00,v01],[v10,v11]], U = [[u00,u01],[u10,u11]]
    // Corrección: si det(M) < 0, voltear última columna de V
    const [v00, v01, v10, v11] = V;
    const [u00, u01, u10, u11] = U;
    // det(V·U^T) debe ser +1
    const sign = detSign >= 0 ? 1 : -1;
    // R = V · diag(1,sign) · U^T
    const r00 =  v00*u00 + sign*v01*u01;
    const r01 = -v00*u10 - sign*v01*u11;
    const r10 =  v10*u00 + sign*v11*u01;
    const r11 = -v10*u10 - sign*v11*u11;
    const Ar = A.map(p => ({ x: r00*p.x + r01*p.y, y: r10*p.x + r11*p.y }));
    const sigma = S[0] + sign * S[1]; // Σσk (suma valores singulares ajustados)
    return { Ar, sigma, R: [r00, r01, r10, r11] };
  }

  /**
   * PS Parcial entre dos configuraciones de puntos brutos.
   * Pasos: resample → centrar+normalizar → rotar A sobre B.
   * @param {Array<{x,y}>} ptsA  puntos del contorno A (sin procesar)
   * @param {Array<{x,y}>} ptsB  puntos del contorno B
   * @param {number} N           número de semi-landmarks
   * @returns {{dist:number, csA:number, csB:number, aligned_A:Array, norm_B:Array, paused:boolean}}
   */
  function psParcial(ptsA, ptsB, N) {
    const rA = resampleByArc(ptsA, N);
    const rB = resampleByArc(ptsB, N);
    const { pts: nA, cs: csA } = centrarYNormalizar(rA);
    const { pts: nB, cs: csB } = centrarYNormalizar(rB);
    const { Ar, sigma } = rotar(nA, nB);
    // Distancia de Procrustes parcial: ρ = arccos(Σσ / (|A|·|B|))
    // Como nA y nB ya están normalizados (CS=1 después de normalizar), Σσ ≤ 1
    const clamped = Math.max(-1, Math.min(1, sigma));
    const dist = Math.acos(clamped); // ρ ∈ [0, π/2]
    return { dist, csA, csB, aligned_A: Ar, norm_B: nB };
  }

  /**
   * Forma media de un conjunto de configuraciones ya centradas y normalizadas.
   * @param {Array<Array<{x,y}>>} configs
   * @returns {Array<{x,y}>}
   */
  function shapeMean(configs) {
    const N = configs[0].length;
    const mean = Array.from({ length: N }, () => ({ x: 0, y: 0 }));
    for (const cfg of configs) {
      for (let i = 0; i < N; i++) {
        mean[i].x += cfg[i].x;
        mean[i].y += cfg[i].y;
      }
    }
    const k = configs.length;
    return mean.map(p => ({ x: p.x / k, y: p.y / k }));
  }

  /**
   * GPA iterativo (Generalized Procrustes Analysis).
   * @param {Array<Array<{x,y}>>} rawConfigs  — arrays de puntos brutos (sin procesar)
   * @param {number} N                        — semi-landmarks
   * @param {number} maxIter
   * @returns {{consensus:Array<{x,y}>, aligned:Array<Array<{x,y}>>, dists:number[], csAll:number[], iters:number}}
   */
  function gpaIterativo(rawConfigs, N, maxIter = 30) {
    // 1. Resample + centrar + normalizar todos
    const normalized = rawConfigs.map(pts => centrarYNormalizar(resampleByArc(pts, N)));
    let configs = normalized.map(r => r.pts);
    const csAll  = normalized.map(r => r.cs);

    let mean = shapeMean(configs);
    let prevSS = Infinity;
    let iters = 0;

    for (let iter = 0; iter < maxIter; iter++) {
      // 2. Normalizar la forma media
      const { pts: meanN } = centrarYNormalizar(mean);

      // 3. Rotar cada config sobre la media normalizada
      configs = configs.map(cfg => rotar(cfg, meanN).Ar);

      // 4. Nueva media
      mean = shapeMean(configs);

      // 5. Convergencia: suma de distancias al cuadrado
      const ss = configs.reduce((acc, cfg) => {
        const { pts: mnN2 } = centrarYNormalizar(mean);
        return acc + cfg.reduce((a, p, i) => {
          const dx = p.x - mnN2[i].x, dy = p.y - mnN2[i].y;
          return a + dx*dx + dy*dy;
        }, 0);
      }, 0);

      if (Math.abs(prevSS - ss) < 1e-10) { iters = iter + 1; break; }
      prevSS = ss;
      iters = iter + 1;
    }

    // 6. Calcular distancias individuales al consensus
    const { pts: consensus } = centrarYNormalizar(mean);
    const dists = configs.map(cfg => {
      const sigma = cfg.reduce((s, p, i) => s + p.x*consensus[i].x + p.y*consensus[i].y, 0);
      const clamped = Math.max(-1, Math.min(1, sigma));
      return Math.acos(clamped);
    });

    return { consensus, aligned: configs, dists, csAll, iters };
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  ACCESO A DATOS DE GEOMETRÍA
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Extrae los puntos del contorno real de un objeto de la colección.
   * Fallback: convex hull si no hay contorno.
   * @param {object} obj
   * @returns {Array<{x,y}>|null}
   */
  function getPuntos(obj) {
    // Contorno real (primera opción)
    const cr = obj.geometria?.contornoReal?.puntos;
    if (Array.isArray(cr) && cr.length >= 3) return cr;
    // Convex hull
    const ch = obj.geometria?.convexHull || obj.metricas?.convex_hull_points;
    if (Array.isArray(ch) && ch.length >= 3) return ch;
    return null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  CARGA DE OBJETOS (patrón idéntico al CMO)
  // ──────────────────────────────────────────────────────────────────────────

  async function cargar() {
    const pm = typeof projectManager !== 'undefined' ? projectManager : null;
    if (!pm?.activeProject) {
      if (typeof toast !== 'undefined') toast.error('No hay proyecto activo.');
      return false;
    }
    const refs = pm.activeProject.analyses || [];
    if (!refs.length) {
      if (typeof toast !== 'undefined') toast.warning('El proyecto no tiene análisis guardados.');
      return false;
    }
    _objetos = [];
    const fp = pm.activeProject.folderPath || '';
    for (const ref of refs) {
      const ruta = ref.rutaCompleta || (fp && ref.carpeta ? `${fp}/${ref.carpeta}` : null);
      if (!ruta) continue;
      try {
        const a = await pm.loadAnalysisFromDisk(ruta);
        if (a) {
          _objetos.push({
            id:       a.id || ref.id,
            nombre:   a.nombreObjeto || ref.nombreObjeto || ref.id,
            cara:     a.cara || 'Mono',
            fecha:    new Date(a.timestamp).toLocaleDateString('es-ES'),
            metricas: a.metricas || {},
            geometria: a.geometria || {},
          });
        }
      } catch(e) {
        console.warn('[PS] No se pudo cargar:', ruta, e.message);
      }
    }
    if (!_objetos.length) {
      if (typeof toast !== 'undefined')
        toast.warning('Sin análisis en disco. Guarda los análisis primero.');
      return false;
    }
    return true;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  RENDER: PANEL DE SELECCIÓN DE OBJETOS
  // ──────────────────────────────────────────────────────────────────────────

  function renderObjetos() {
    _selIds = new Set(_objetos.map(o => String(o.id)));
    const container = $('psListaObjetos');
    if (!container) return;

    // Agrupar por nombre, ordenar caras
    const grupos = {};
    for (const obj of _objetos) {
      const key = obj.nombre.trim().toLowerCase();
      if (!grupos[key]) grupos[key] = { nombre: obj.nombre, caras: [] };
      grupos[key].caras.push(obj);
    }
    const ORDEN = { 'A':0,'a':0,'B':1,'b':1,'Mono':2 };
    for (const g of Object.values(grupos)) {
      g.caras.sort((a, b) => (ORDEN[a.cara]??3) - (ORDEN[b.cara]??3));
    }
    const lista = Object.values(grupos);

    function buildRows(q) {
      let h = `
        <div class="cmo-sel-search-bar">
          <span class="cmo-sel-search-icon">🔍</span>
          <input type="text" id="psFiltroObjetos" class="cmo-sel-search-input"
            placeholder="Filtrar por nombre…" value="${esc(q)}" autocomplete="off">
          <span id="psCuentaTotal" class="cmo-sel-search-count"></span>
        </div>
        <div class="cmo-sel-col-header">
          <span></span><span>Nombre</span><span>Cara</span><span>Fecha</span>
        </div>
        <div class="cmo-sel-list">`;

      let visible = 0;
      for (const g of lista) {
        if (q && !g.nombre.toLowerCase().includes(q)) continue;
        visible++;
        if (g.caras.length === 1) {
          const obj = g.caras[0];
          const lbl = obj.cara !== 'Mono' ? obj.cara : 'Mono';
          const sel = _selIds.has(String(obj.id));
          h += `<label class="cmo-sel-row${sel?' sel':''}">
            <input type="checkbox" class="ps-chk-obj" data-id="${esc(String(obj.id))}"${sel?' checked':''}>
            <span class="cmo-sel-nombre">${esc(obj.nombre)}</span>
            <span class="cmo-cara-badge cmo-cara-${lbl}">${esc(lbl)}</span>
            <span class="cmo-sel-fecha">${esc(obj.fecha)}</span>
          </label>`;
        } else {
          const allIds  = g.caras.map(c => String(c.id));
          const allSel  = allIds.every(id => _selIds.has(id));
          const anySel  = allIds.some(id  => _selIds.has(id));
          h += `<div class="cmo-sel-group">
            <label class="cmo-sel-group-row">
              <input type="checkbox" class="ps-chk-par"
                data-ids="${esc(JSON.stringify(allIds))}"
                ${allSel?'checked':''} ${!allSel&&anySel?'data-indet="1"':''}>
              <span class="cmo-sel-group-name">${esc(g.nombre)}</span>
              <span class="cmo-sel-group-badge">${g.caras.length} caras</span>
            </label>`;
          for (const obj of g.caras) {
            const lbl = obj.cara !== 'Mono' ? obj.cara : 'Mono';
            const sel = _selIds.has(String(obj.id));
            h += `<label class="cmo-sel-row cmo-sel-child${sel?' sel':''}">
              <input type="checkbox" class="ps-chk-obj" data-id="${esc(String(obj.id))}"${sel?' checked':''}>
              <span class="cmo-sel-nombre cmo-sel-child-name">${esc(obj.nombre)}</span>
              <span class="cmo-cara-badge cmo-cara-${lbl}">${esc(lbl)}</span>
              <span class="cmo-sel-fecha">${esc(obj.fecha)}</span>
            </label>`;
          }
          h += `</div>`;
        }
      }
      if (!visible) h += `<div class="cmo-sel-empty">Sin resultados para «${esc(q)}»</div>`;
      h += `</div>`;
      requestAnimationFrame(() => {
        const el = $('psCuentaTotal');
        if (el) el.textContent = `${lista.length} objeto${lista.length!==1?'s':''}`;
      });
      return h;
    }

    function bindChk() {
      container.querySelectorAll('.ps-chk-obj').forEach(chk => {
        chk.addEventListener('change', () => {
          if (chk.checked) _selIds.add(chk.dataset.id);
          else _selIds.delete(chk.dataset.id);
          const grp = chk.closest('.cmo-sel-group');
          if (grp) {
            const par = grp.querySelector('.ps-chk-par');
            const all = [...grp.querySelectorAll('.ps-chk-obj')];
            const cnt = all.filter(c => c.checked).length;
            if (par) { par.checked = cnt===all.length; par.indeterminate = cnt>0 && cnt<all.length; }
          }
          chk.closest('label')?.classList.toggle('sel', chk.checked);
          actualizarContador();
        });
      });
      container.querySelectorAll('.ps-chk-par').forEach(chk => {
        chk.addEventListener('change', () => {
          const grp = chk.closest('.cmo-sel-group');
          grp.querySelectorAll('.ps-chk-obj').forEach(c => {
            c.checked = chk.checked;
            chk.checked ? _selIds.add(c.dataset.id) : _selIds.delete(c.dataset.id);
            c.closest('label')?.classList.toggle('sel', chk.checked);
          });
          chk.indeterminate = false;
          actualizarContador();
        });
      });
      const filtro = $('psFiltroObjetos');
      if (filtro) {
        filtro.addEventListener('input', () => {
          container.innerHTML = buildRows(filtro.value.trim().toLowerCase());
          bindChk();
        });
      }
    }

    container.innerHTML = buildRows('');
    bindChk();
  }

  function actualizarContador() {
    const el = $('psCuentaSeleccionados');
    if (el) el.textContent = `${_selIds.size} seleccionado${_selIds.size!==1?'s':''}`;
    const btn = $('psEjecutarBtn');
    if (btn) btn.disabled = _selIds.size < 2;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  CANVAS HELPERS
  // ──────────────────────────────────────────────────────────────────────────
  const CX = 240, CY = 240, CR = 200; // centro y radio del área de dibujo (canvas 480×480)

  /**
   * Escala puntos normalizados (rango ≈[-1,1]) al canvas.
   * @param {Array<{x,y}>} pts  — ya centrados y normalizados
   * @param {number} scale      — factor de escala visual (px por unidad)
   */
  function toCanvas(pts, scale) {
    return pts.map(p => ({ x: CX + p.x * scale, y: CY - p.y * scale }));
  }

  /**
   * Dibuja una polilínea cerrada en el canvas context.
   */
  function drawShape(ctx, pts, color, lineWidth, fill, fillAlpha) {
    if (!pts || pts.length < 2) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    if (fill) {
      ctx.globalAlpha = fillAlpha || 0.12;
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth || 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  PALETA DE COLORES (hasta 20 objetos)
  // ──────────────────────────────────────────────────────────────────────────
  const PALETA = [
    '#3182ce','#e53e3e','#38a169','#d69e2e','#805ad5',
    '#dd6b20','#2b6cb0','#c53030','#276749','#b7791f',
    '#6b46c1','#c05621','#2c7a7b','#9b2c2c','#553c9a',
    '#744210','#1a365d','#822727','#1c4532','#5f370e',
  ];

  // ──────────────────────────────────────────────────────────────────────────
  //  CLASIFICACIÓN DE SELECCIÓN (especular / comparación / mixto)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Analiza el array de objetos seleccionados y determina el tipo de análisis:
   *   'especular'   — todos forman pares A↔B del mismo nombre de objeto
   *   'comparacion' — todos son objetos distintos (o Mono sin par)
   *   'mixto'       — combinación de pares bifaciales + objetos independientes
   */
  function clasificarSeleccion(objs) {
    const grupos = {};
    for (const obj of objs) {
      const key = obj.nombre.trim().toLowerCase();
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(obj);
    }
    const paresBifaciales = [];
    const objetosIndep    = [];
    for (const arr of Object.values(grupos)) {
      const objA = arr.find(o => (o.cara || '').toUpperCase() === 'A');
      const objB = arr.find(o => (o.cara || '').toUpperCase() === 'B');
      if (objA && objB) {
        paresBifaciales.push({ nombre: arr[0].nombre, objA, objB });
        // Caras distintas de A/B (e.g. Mono) del mismo nombre → independientes
        arr.filter(o => { const c=(o.cara||'').toUpperCase(); return c!=='A'&&c!=='B'; })
           .forEach(o => objetosIndep.push(o));
      } else {
        arr.forEach(o => objetosIndep.push(o));
      }
    }
    let modo, etiqueta, descripcion, iconoModo;
    if (paresBifaciales.length > 0 && objetosIndep.length === 0) {
      modo = 'especular'; iconoModo = '\uD83D\uDD00';
      etiqueta    = 'An\u00e1lisis de Simetr\u00eda Bilateral';
      descripcion = 'Se detectaron <strong>' + paresBifaciales.length + ' par' + (paresBifaciales.length>1?'es bifaciales':' bifacial') + '</strong>. Cada par (Anverso&nbsp;\u2194&nbsp;Reverso) corresponde al mismo objeto; \u03c1 mide la <em>asimetr\u00eda bilateral</em> de su forma.';
    } else if (paresBifaciales.length === 0) {
      modo = 'comparacion'; iconoModo = '\uD83D\uDCD0';
      etiqueta    = 'Comparaci\u00f3n Morfol\u00f3gica entre Objetos';
      descripcion = 'Se comparan <strong>' + objs.length + ' objetos independientes</strong>. La distancia&nbsp;\u03c1 cuantifica la <em>disimilitud de forma</em> entre objetos distintos.';
    } else {
      modo = 'mixto'; iconoModo = '\uD83D\uDD01';
      etiqueta    = 'An\u00e1lisis Mixto';
      descripcion = 'Se detectaron <strong>' + paresBifaciales.length + ' par' + (paresBifaciales.length>1?'es bifaciales':' bifacial') + '</strong> y <strong>' + objetosIndep.length + ' objeto' + (objetosIndep.length>1?'s independientes':' independiente') + '</strong>. Los pares miden simetr\u00eda bilateral; el resto, similitud morfol\u00f3gica.';
    }
    // Construir bifacialSet (\u00edndices en el array objs recibido)
    const bifacialSet = new Set();
    for (const bf of paresBifaciales) {
      const iA = objs.indexOf(bf.objA), iB = objs.indexOf(bf.objB);
      if (iA >= 0 && iB >= 0) { bifacialSet.add(iA+'_'+iB); bifacialSet.add(iB+'_'+iA); }
    }
    return { paresBifaciales, objetosIndep, modo, etiqueta, descripcion, iconoModo, bifacialSet };
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  TAB: PS PARCIAL
  // ──────────────────────────────────────────────────────────────────────────

  function ejecutarParcial(selObj) {
    const cont = $('psParcialContenido');
    if (!cont) return;

    if (selObj.length < 2) {
      cont.innerHTML = `<p class="ps-aviso">Selecciona al menos 2 objetos para el análisis parcial.</p>`;
      return;
    }

    // Verificar que todos tienen contorno
    const conPuntos = selObj.filter(o => getPuntos(o) !== null);
    if (conPuntos.length < 2) {
      cont.innerHTML = `<p class="ps-aviso ps-aviso-error">Menos de 2 objetos tienen datos de contorno accesibles (geometria.contornoReal.puntos o geometria.convexHull). Guarda un análisis completo primero.</p>`;
      return;
    }
    if (conPuntos.length < selObj.length) {
      const sinDatos = selObj.filter(o => getPuntos(o) === null).map(o => esc(o.nombre)).join(', ');
      cont.innerHTML = `<div class="ps-aviso ps-aviso-warn">Los siguientes objetos no tienen datos de contorno y se omitirán: ${sinDatos}</div>`;
    }

    const n = conPuntos.length;

    // ─── Calcular matrices pairwise ─────────────────────────────────────────
    // dist[i][j] y csA[i][j]
    const distMat = Array.from({length:n}, () => new Array(n).fill(0));
    const resultados = [];  // [{i, j, dist, csA, csB}]

    for (let i = 0; i < n; i++) {
      for (let j = i+1; j < n; j++) {
        const pA = getPuntos(conPuntos[i]);
        const pB = getPuntos(conPuntos[j]);
        const r = psParcial(pA, pB, N_PUNTOS);
        distMat[i][j] = r.dist;
        distMat[j][i] = r.dist;
        resultados.push({ i, j, dist: r.dist, csA: r.csA, csB: r.csB });
      }
    }

    // ─── Clasificar selección (especular / comparación / mixto) ─────────────
    const clsf = clasificarSeleccion(conPuntos);
    const { paresBifaciales, modo, etiqueta, descripcion, iconoModo } = clsf;
    // Enriquecer paresBifaciales con índices reales en conPuntos y distancias
    const bifacialSet = new Set();
    for (const bf of paresBifaciales) {
      bf.i = conPuntos.indexOf(bf.objA);
      bf.j = conPuntos.indexOf(bf.objB);
      bf.dist = (bf.i >= 0 && bf.j >= 0) ? distMat[bf.i][bf.j] : 0;
      if (bf.i >= 0 && bf.j >= 0) {
        bifacialSet.add(bf.i+'_'+bf.j);
        bifacialSet.add(bf.j+'_'+bf.i);
      }
    }
    // ISB (Índice de Simetría Bilateral): mapeo lineal ρ → [0, 100%]
    const isb = rho => Math.max(0, (1 - rho / (Math.PI / 2)) * 100);

    // ─── Par de referencia para el canvas ────────────────────────────────────
    // Para modo especular: mostrar el primer par bifacial en el canvas
    const par0 = (modo === 'especular' && paresBifaciales.length > 0 &&
                  paresBifaciales[0].i >= 0 && paresBifaciales[0].j >= 0)
      ? { i: paresBifaciales[0].i, j: paresBifaciales[0].j }
      : resultados[0];

    // ─── Render HTML ────────────────────────────────────────────────────────
    let html = `
      <!-- Banner de modo de análisis -->
      <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;margin-bottom:14px;
        border-radius:7px;border-left:4px solid ${modo==='especular'?'#3182ce':modo==='comparacion'?'#38a169':'#d69e2e'};
        background:${modo==='especular'?'#ebf4ff':modo==='comparacion'?'#f0fff4':'#fffaf0'};">
        <span style="font-size:20px;line-height:1;flex-shrink:0;">${iconoModo}</span>
        <div>
          <div style="font-weight:700;font-size:13px;margin-bottom:3px;">${esc(etiqueta)}</div>
          <div style="font-size:11px;color:#4a5568;line-height:1.4;">${descripcion}</div>
        </div>
      </div>

      <!-- Panel de descripción del método -->
      <div class="ps-desc-panel">
        <div class="ps-desc-title">&#9671; PS Parcial — Método</div>
        <ol class="ps-desc-steps">
          <li><strong>Winding</strong>: normalización del sentido de recorrido del contorno (CW en pantalla), corrigiendo la inversión especular entre caras A&#8596;B.</li>
          <li><strong>Remuestreo por arco</strong>: cada contorno se convierte en <strong>${N_PUNTOS} semi-landmarks</strong> equidistantes en longitud de arco.</li>
          <li><strong>Centrado + escala</strong>: traslación al centroide y normalización por CS<sub>k</sub> = &radic;(&Sigma;&#8214;x<sub>i</sub>&#8214;&sup2;).</li>
          <li><strong>Rotación óptima</strong>: SVD 2&times;2 de A<sup>T</sup>B &rarr; R* = VU<sup>T</sup> (con corrección de reflexión).</li>
          <li><strong>Distancia &rho;</strong>: &rho; = arccos(&Sigma;&sigma;<sub>k</sub>) &isin; [0,&nbsp;&pi;/2]. ${modo==='especular'?'Mide <em>asimetr\u00eda bilateral</em> — bajo = alta simetr\u00eda.':'Mide <em>disimilitud morfol\u00f3gica</em> — bajo = formas similares.'}</li>
          ${modo!=='comparacion'?'<li><strong>ISB</strong>: \u00cdndice de Simetr\u00eda Bilateral = (1 \u2212 \u03c1/(&pi;/2)) \u00d7 100%. 100%&nbsp;=&nbsp;simetr\u00eda perfecta.</li>':''}
        </ol>
        <div class="ps-desc-note">&#9432; El tama\u00f1o (CS<sub>k</sub>) se excluye del an\u00e1lisis \u2014 solo se compara la <em>forma pura</em>.</div>
      </div>

      <div class="ps-layout-2col">
        <!-- Canvas de alineación del primer par -->
        <div class="ps-canvas-wrap">
          <div class="ps-canvas-title">${modo==='especular' ? 'Superposici\u00f3n bifacial: <em>' + esc(conPuntos[par0.i]?.nombre||'') + '</em> &middot; A &#8596; B' : 'Vista de alineaci\u00f3n: <em>' + esc(conPuntos[par0.i]?.nombre||'') + '</em> &rarr; <em>' + esc(conPuntos[par0.j]?.nombre||'') + '</em>'}</div>
          <canvas id="psParcialCanvas" width="480" height="480"></canvas>
          <div class="ps-canvas-legend" id="psParcialLeyenda"></div>
        </div>

        <!-- Resumen chip cards -->
        <div class="ps-stats-col">
          ${(() => {
            resultados.sort((a,b) => a.dist - b.dist);
            if (modo === 'especular' && paresBifaciales.length > 0) {
              const bfV = paresBifaciales.filter(bf => bf.i>=0 && bf.j>=0);
              const isbMed = bfV.length ? bfV.reduce((s,bf)=>s+isb(bf.dist),0)/bfV.length : 0;
              const bfMax = bfV.length ? bfV.reduce((a,b)=>isb(a.dist)>isb(b.dist)?a:b, bfV[0]) : null;
              const bfMin = bfV.length ? bfV.reduce((a,b)=>isb(a.dist)<isb(b.dist)?a:b, bfV[0]) : null;
              return (
              '<div class="ps-chip ps-chip-green">'+
              '<span class="ps-chip-label">&#8596; M\u00e1s sim\u00e9trico</span>'+
              '<span class="ps-chip-val">'+(bfMax?esc(bfMax.nombre):'\u2014')+'</span>'+
              '<span class="ps-chip-sub">ISB = '+(bfMax?isb(bfMax.dist).toFixed(1):'0')+'% &nbsp;|&nbsp; &rho; = '+(bfMax?bfMax.dist.toFixed(4):'0')+' rad</span>'+
              '</div>'+
              '<div class="ps-chip ps-chip-red">'+
              '<span class="ps-chip-label">&#8596; Menos sim\u00e9trico</span>'+
              '<span class="ps-chip-val">'+(bfMin?esc(bfMin.nombre):'\u2014')+'</span>'+
              '<span class="ps-chip-sub">ISB = '+(bfMin?isb(bfMin.dist).toFixed(1):'0')+'% &nbsp;|&nbsp; &rho; = '+(bfMin?bfMin.dist.toFixed(4):'0')+' rad</span>'+
              '</div>'+
              '<div class="ps-chip ps-chip-gray">'+
              '<span class="ps-chip-label">ISB medio del conjunto</span>'+
              '<span class="ps-chip-val">'+isbMed.toFixed(1)+'%</span>'+
              '<span class="ps-chip-sub">'+bfV.length+' par'+(bfV.length!==1?'es bifaciales':' bifacial')+' analizados</span>'+
              '</div>'
              );
            } else {
              const media = resultados.reduce((s,r)=>s+r.dist,0)/resultados.length;
              return (
              '<div class="ps-chip ps-chip-green">'+
              '<span class="ps-chip-label">Par m\u00e1s similar</span>'+
              '<span class="ps-chip-val">'+esc(conPuntos[resultados[0].i].nombre)+' &#8596; '+esc(conPuntos[resultados[0].j].nombre)+'</span>'+
              '<span class="ps-chip-sub">&rho; = '+resultados[0].dist.toFixed(4)+' rad</span>'+
              '</div>'+
              '<div class="ps-chip ps-chip-red">'+
              '<span class="ps-chip-label">Par m\u00e1s diferente</span>'+
              '<span class="ps-chip-val">'+esc(conPuntos[resultados[resultados.length-1].i].nombre)+' &#8596; '+esc(conPuntos[resultados[resultados.length-1].j].nombre)+'</span>'+
              '<span class="ps-chip-sub">&rho; = '+resultados[resultados.length-1].dist.toFixed(4)+' rad</span>'+
              '</div>'+
              '<div class="ps-chip ps-chip-gray">'+
              '<span class="ps-chip-label">&rho; media (todos los pares)</span>'+
              '<span class="ps-chip-val">'+media.toFixed(4)+' rad</span>'+
              '<span class="ps-chip-sub">'+resultados.length+' pares comparados</span>'+
              '</div>'
              );
            }
          })()}
        </div>
      </div>

      ${ paresBifaciales.filter(bf=>bf.i>=0&&bf.j>=0).length ? (
      '<div class="ps-matrix-title" style="margin-top:20px;">'+(modo==='especular'?'\uD83D\uDD00 Simetr\u00eda bilateral \u2014 Anverso \u2194 Reverso':'&#9670; Pares bifaciales en la selecci\u00f3n')+'</div>'+
      '<table class="ps-ranking-table" style="margin-bottom:12px;">'+
      '<thead><tr><th>Objeto</th><th style="text-align:center">A</th><th style="text-align:center">B</th><th>&rho; (rad)</th><th>ISB (%)</th><th>Interpretaci\u00f3n</th></tr></thead>'+
      '<tbody>'+
      paresBifaciales.filter(bf=>bf.i>=0&&bf.j>=0).map(bf => {
        const isbVal = isb(bf.dist);
        const nivel = isbVal>=94 ? '&#128994; Alta simetr\u00eda bilateral'
                    : isbVal>=84 ? '&#128993; Simetr\u00eda moderada'
                    : isbVal>=65 ? '&#128992; Asimetr\u00eda notable'
                    :              '&#128308; Asimetr\u00eda significativa';
        const isbColor = isbVal>=84?'#276749':isbVal>=65?'#744210':'#9b2c2c';
        return '<tr style="background:#fffbeb;">'+
          '<td style="font-weight:600">'+esc(bf.nombre)+'</td>'+
          '<td style="text-align:center"><span class="cmo-cara-badge cmo-cara-A">A</span></td>'+
          '<td style="text-align:center"><span class="cmo-cara-badge cmo-cara-B">B</span></td>'+
          '<td class="ps-rank-dist">'+bf.dist.toFixed(4)+'</td>'+
          '<td class="ps-rank-dist" style="font-weight:700;color:'+isbColor+'">'+isbVal.toFixed(1)+'%</td>'+
          '<td style="font-size:11px">'+nivel+'</td>'+
          '</tr>';
      }).join('')+
      '</tbody></table>'+
      '<div class="ps-desc-note" style="margin-bottom:16px;">&#9432; <strong>ISB</strong> = (1&nbsp;&minus;&nbsp;&rho;/(&pi;/2))&nbsp;&times;&nbsp;100%. 100% = simetr\u00eda perfecta. La normalizaci\u00f3n de <em>winding</em> y la correcci\u00f3n de reflexi\u00f3n SVD compensan el espejo A&nbsp;&#8596;&nbsp;B.</div>'
      ) : '' }

      <!-- Matriz de distancias -->
      <div class="ps-matrix-title">Matriz de distancias Procrustes (&rho;)${modo!=='comparacion'?' \u2014 celdas bifaciales incluyen ISB':''}</div>
      <div class="ps-table-scroll">
        <table class="ps-dist-table">
          <thead><tr>
            <th class="ps-th-corner"></th>
            ${conPuntos.map((o,i) => `<th><span class="ps-obj-dot" style="background:${PALETA[i%PALETA.length]}"></span>${esc(o.nombre)}${o.cara&&o.cara!=='Mono'?` <span class="cmo-cara-badge cmo-cara-${o.cara}">${esc(o.cara)}</span>`:''}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${conPuntos.map((rowObj,i) => `<tr>
              <td class="ps-th-row"><span class="ps-obj-dot" style="background:${PALETA[i%PALETA.length]}"></span>${esc(rowObj.nombre)}${rowObj.cara&&rowObj.cara!=='Mono'?` <span class="cmo-cara-badge cmo-cara-${rowObj.cara}">${esc(rowObj.cara)}</span>`:''}</td>
              ${conPuntos.map((_, j) => {
                if (i === j) return `<td class="ps-cell-diag">—</td>`;
                const v = distMat[i][j];
                const vmax = Math.max(...resultados.map(r=>r.dist));
                const vmin = Math.min(...resultados.map(r=>r.dist));
                const t = vmax > vmin ? (v - vmin)/(vmax - vmin) : 0;
                const r = Math.round(t * 200);
                const g = Math.round((1-t) * 180);
                const esBifacial = bifacialSet.has(i+'_'+j);
                const extraStyle = esBifacial ? 'outline:2px solid #d69e2e;outline-offset:-2px;font-weight:700;' : '';
                const isbLabel = (esBifacial && modo !== 'comparacion') ? ' ('+isb(v).toFixed(0)+'%)' : '';
                const titulo = esBifacial ? 'ISB='+isb(v).toFixed(1)+'% \u00b7 '+esc(rowObj.nombre)+' \u2194 '+esc(conPuntos[j].nombre) : esc(rowObj.nombre)+' \u2194 '+esc(conPuntos[j].nombre);
                return '<td class="ps-cell-val'+(esBifacial?' ps-cell-bifacial':'')+'" style="background:rgba('+r+','+g+',80,0.25);'+extraStyle+'" title="'+titulo+'">'+v.toFixed(4)+isbLabel+(esBifacial?' \u2736':'')+'</td>';
              }).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;

    cont.innerHTML = html;

    // ─── Dibujar canvas ─────────────────────────────────────────────────────
    requestAnimationFrame(() => {
      const canvas = $('psParcialCanvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0,0,480,480);
      // Fondo
      ctx.fillStyle = '#f7fafc';
      ctx.fillRect(0,0,480,480);
      // Grilla
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 0.5;
      for (let g = 0; g <= 480; g += 60) {
        ctx.beginPath(); ctx.moveTo(g,0); ctx.lineTo(g,480); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0,g); ctx.lineTo(480,g); ctx.stroke();
      }
      // Cruz central
      ctx.strokeStyle = '#cbd5e0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(CX,CY-CR); ctx.lineTo(CX,CY+CR); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(CX-CR,CY); ctx.lineTo(CX+CR,CY); ctx.stroke();

      // Dibujar todos los objetos alineados (todos vs primero)
      const refPts = getPuntos(conPuntos[0]);
      const { pts: refNorm } = centrarYNormalizar(resampleByArc(refPts, N_PUNTOS));

      const leyendaEl = $('psParcialLeyenda');
      let leyHtml = '';

      for (let i = 0; i < conPuntos.length; i++) {
        const pts = getPuntos(conPuntos[i]);
        const { pts: norm } = centrarYNormalizar(resampleByArc(pts, N_PUNTOS));
        const { Ar } = rotar(norm, refNorm);
        const canv = toCanvas(Ar, CR * 0.95);
        drawShape(ctx, canv, PALETA[i%PALETA.length], i===0?2:1.5, true, 0.10);
        leyHtml += `<span class="ps-ley-item"><span class="ps-ley-dot" style="background:${PALETA[i%PALETA.length]}"></span>${esc(conPuntos[i].nombre)}</span>`;
      }
      if (leyendaEl) leyendaEl.innerHTML = leyHtml;
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  TAB: PS GPA (ANÁLISIS GENERALIZADO)
  // ──────────────────────────────────────────────────────────────────────────

  function ejecutarGPA(selObj) {
    const cont = $('psGPAContenido');
    if (!cont) return;

    if (selObj.length < 3) {
      cont.innerHTML = `<p class="ps-aviso">El GPA requiere al menos 3 objetos para calcular un consensus significativo.</p>`;
      return;
    }

    const conPuntos = selObj.filter(o => getPuntos(o) !== null);
    if (conPuntos.length < 3) {
      cont.innerHTML = `<p class="ps-aviso ps-aviso-error">Se necesitan al menos 3 objetos con datos de contorno para el GPA.</p>`;
      return;
    }

    const rawConfigs = conPuntos.map(o => getPuntos(o));
    const { consensus, aligned, dists, csAll, iters } = gpaIterativo(rawConfigs, N_PUNTOS);
    const n = conPuntos.length;

    // Ordenar por distancia al consensus (de menor a mayor)
    const ranking = dists.map((d,i) => ({ i, d })).sort((a,b) => a.d-b.d);

    // Clasificar selección para contextualizar el GPA
    const gpaClsf = clasificarSeleccion(conPuntos);

    let html = `
      <!-- Banner de modo GPA -->
      <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;margin-bottom:14px;
        border-radius:7px;border-left:4px solid ${gpaClsf.modo==='especular'?'#3182ce':gpaClsf.modo==='comparacion'?'#38a169':'#d69e2e'};
        background:${gpaClsf.modo==='especular'?'#ebf4ff':gpaClsf.modo==='comparacion'?'#f0fff4':'#fffaf0'};">
        <span style="font-size:20px;line-height:1;flex-shrink:0;">${gpaClsf.iconoModo}</span>
        <div>
          <div style="font-weight:700;font-size:13px;margin-bottom:3px;">${esc(gpaClsf.etiqueta)}</div>
          <div style="font-size:11px;color:#4a5568;line-height:1.4;">${gpaClsf.descripcion}${gpaClsf.modo==='especular'?' El consensus GPA representa la <em>forma media bilateral</em> del grupo.':''}</div>
        </div>
      </div>

      <!-- Panel de descripción del método -->
      <div class="ps-desc-panel">
        <div class="ps-desc-title">&#9671; PS Completa / GPA — Método</div>
        <ol class="ps-desc-steps">
          <li><strong>Remuestreo por arco</strong>: ${N_PUNTOS} semi-landmarks equidistantes en cada contorno.</li>
          <li><strong>Pre-normalización</strong>: centrado + escala por CS<sub>k</sub> para cada objeto.</li>
          <li><strong>Consensus iterativo</strong>: se calcula la forma media, todos los objetos se rotan sobre ella, se repite hasta convergencia (Δss &lt; 10⁻¹⁰). Converge en <strong>${iters} iteraciones</strong>.</li>
          <li><strong>Forma media (consensus)</strong>: promedio de todas las configuraciones alineadas.</li>
          <li><strong>Distancia al consensus</strong>: ρ<sub>i</sub> = arccos(Σσ<sub>k</sub>) para cada objeto respecto al consensus final.</li>
        </ol>
        <div class="ps-desc-note">&#9432; El GPA minimiza la suma total de distancias al cuadrado (DRSS total) de forma simultánea. A diferencia del PS Parcial (pairwise), el consensus captura la <em>forma promedio del conjunto completo</em>.</div>
      </div>

      <div class="ps-layout-2col">
        <!-- Canvas consensus -->
        <div class="ps-canvas-wrap">
          <div class="ps-canvas-title">Formas alineadas al consensus (GPA)</div>
          <canvas id="psGPACanvas" width="480" height="480"></canvas>
          <div class="ps-canvas-legend" id="psGPALeyenda"></div>
        </div>

        <!-- Ranking de objetos por distancia al consensus -->
        <div class="ps-stats-col">
          <div class="ps-ranking-title">Ranking — distancia al consensus (ρ)</div>
          <table class="ps-ranking-table">
            <thead><tr><th>#</th><th>Objeto</th><th>ρ</th><th>CS</th></tr></thead>
            <tbody>
              ${ranking.map((r,rank) => `
                <tr>
                  <td class="ps-rank-num">${rank+1}</td>
                  <td><span class="ps-obj-dot" style="background:${PALETA[r.i%PALETA.length]}"></span>${esc(conPuntos[r.i].nombre)}</td>
                  <td class="ps-rank-dist">${r.d.toFixed(4)}</td>
                  <td class="ps-rank-cs">${csAll[r.i].toFixed(1)} px</td>
                </tr>`).join('')}
            </tbody>
          </table>
          <div class="ps-desc-note" style="margin-top:10px;">
            CS = Centroid Size (px) — tamaño del objeto antes de normalizar.<br>
            El GPA excluye el tamaño; solo compara <em>forma pura</em>.
          </div>
        </div>
      </div>

      <!-- Variación de forma: mapa de deformación -->
      <div class="ps-matrix-title">Dispersión de semi-landmarks respecto al consensus</div>
      <canvas id="psDeformCanvas" width="480" height="480" style="display:block;margin:0 auto 16px;border:1px solid #e2e8f0;border-radius:6px;"></canvas>
      <p style="font-size:11px;color:#718096;text-align:center;margin-top:-10px;">
        Puntos grises = consensus. Puntos coloreados = semi-landmark de cada objeto alineado. Líneas = variación respecto al consensus.
      </p>
    `;

    cont.innerHTML = html;

    // ─── Dibujar canvas GPA ─────────────────────────────────────────────────
    requestAnimationFrame(() => {
      // Canvas de formas superpuestas
      const canvas = $('psGPACanvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0,0,480,480);
        ctx.fillStyle = '#f7fafc'; ctx.fillRect(0,0,480,480);
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 0.5;
        for (let g = 0; g <= 480; g += 60) {
          ctx.beginPath(); ctx.moveTo(g,0); ctx.lineTo(g,480); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0,g); ctx.lineTo(480,g); ctx.stroke();
        }
        ctx.strokeStyle = '#cbd5e0'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(CX,CY-CR); ctx.lineTo(CX,CY+CR); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(CX-CR,CY); ctx.lineTo(CX+CR,CY); ctx.stroke();

        const leyendaEl = $('psGPALeyenda');
        let leyHtml = '';

        // Dibujar cada forma alineada
        for (let i = 0; i < n; i++) {
          const canv = toCanvas(aligned[i], CR * 0.95);
          drawShape(ctx, canv, PALETA[i%PALETA.length], 1.5, true, 0.08);
          leyHtml += `<span class="ps-ley-item"><span class="ps-ley-dot" style="background:${PALETA[i%PALETA.length]}"></span>${esc(conPuntos[i].nombre)}</span>`;
        }
        // Consensus encima (línea gruesa blanca/negra)
        const consensusCanv = toCanvas(consensus, CR * 0.95);
        drawShape(ctx, consensusCanv, '#000', 2.5, false);
        drawShape(ctx, consensusCanv, '#fff', 1.0, false);
        leyHtml += `<span class="ps-ley-item"><span class="ps-ley-dot" style="background:#000;border:1px solid #999"></span><em>Consensus</em></span>`;
        if (leyendaEl) leyendaEl.innerHTML = leyHtml;
      }

      // Canvas de dispersión de landmarks
      const dc = $('psDeformCanvas');
      if (dc) {
        const ctx = dc.getContext('2d');
        ctx.clearRect(0,0,480,480);
        ctx.fillStyle = '#f7fafc'; ctx.fillRect(0,0,480,480);
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 0.5;
        for (let g = 0; g <= 480; g += 60) {
          ctx.beginPath(); ctx.moveTo(g,0); ctx.lineTo(g,480); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0,g); ctx.lineTo(480,g); ctx.stroke();
        }
        // Líneas de variación: desde consensus, para cada objeto
        const sc = CR * 0.95;
        for (let i = 0; i < n; i++) {
          ctx.strokeStyle = PALETA[i%PALETA.length] + '80'; // ~50% alpha
          ctx.lineWidth = 0.8;
          for (let k = 0; k < N_PUNTOS; k++) {
            const cx_ = CX + consensus[k].x * sc;
            const cy_ = CY - consensus[k].y * sc;
            const px_ = CX + aligned[i][k].x * sc;
            const py_ = CY - aligned[i][k].y * sc;
            ctx.beginPath(); ctx.moveTo(cx_, cy_); ctx.lineTo(px_, py_); ctx.stroke();
          }
        }
        // Puntos del consensus
        ctx.fillStyle = '#718096';
        for (const p of consensus) {
          ctx.beginPath();
          ctx.arc(CX + p.x*sc, CY - p.y*sc, 2.5, 0, Math.PI*2);
          ctx.fill();
        }
        // Puntos de cada objeto alineado
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = PALETA[i%PALETA.length];
          for (const p of aligned[i]) {
            ctx.beginPath();
            ctx.arc(CX + p.x*sc, CY - p.y*sc, 2, 0, Math.PI*2);
            ctx.fill();
          }
        }
      }
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  EJECUCIÓN PRINCIPAL CON PROGRESO
  // ──────────────────────────────────────────────────────────────────────────

  function ejecutar() {
    const selObj = _objetos.filter(o => _selIds.has(String(o.id)));
    const n = selObj.length;
    if (n < 2) return;

    // Clasificar para personalizar los pasos
    const clsf = clasificarSeleccion(selObj.filter(o => getPuntos(o) !== null));
    const conGPA = selObj.filter(o => getPuntos(o) !== null).length >= 3;

    const pasos = [
      { id: 'prep',     title: 'Preparando configuraciones',
        detail: `${n} objeto${n !== 1 ? 's' : ''} seleccionado${n !== 1 ? 's' : ''}` },
      { id: 'winding',  title: 'Normalización de sentido (winding)',
        detail: 'Unificando orientación de contornos A ↔ B' },
      { id: 'resample', title: 'Remuestreo por arco',
        detail: `${N_PUNTOS} semi-landmarks por contorno` },
      { id: 'parcial',  title: clsf.modo === 'especular'
          ? 'Calculando simetría bilateral (PS Parcial)'
          : 'Calculando distancias Procrustes (PS Parcial)',
        detail: `${Math.round(n*(n-1)/2)} par${n*(n-1)/2 !== 1 ? 'es' : ''} a comparar` },
      ...(conGPA ? [{ id: 'gpa', title: 'Análisis GPA — consensus iterativo',
        detail: `Convergencia Δss < 10⁻¹⁰ · máx. 30 iteraciones` }] : []),
      { id: 'render',   title: 'Generando visualización',
        detail: 'Canvas, matrices y gráficos' },
    ];

    const tiempoEst = 2 + Math.ceil(n * n * 0.12) + (conGPA ? 3 : 0);

    // ── Verificar disponibilidad del sistema de progreso ────────────────────
    const hasProgress = typeof startDetailedProgress === 'function' &&
                        typeof updateDetailedProgress === 'function' &&
                        typeof endDetailedProgress    === 'function';

    if (hasProgress) startDetailedProgress('Análisis Procrustes (PS)', pasos, tiempoEst);

    const tick = (id, detail) => {
      if (hasProgress && typeof isProgressCancelled === 'function' && isProgressCancelled()) {
        throw new Error('cancelled');
      }
      if (hasProgress) updateDetailedProgress(id, detail || undefined);
    };

    // Usar setTimeout para ceder el hilo y permitir que el overlay se pinte
    setTimeout(() => {
      try {
        tick('prep');

        setTimeout(() => {
          try {
            tick('winding');

            setTimeout(() => {
              try {
                tick('resample');

                setTimeout(() => {
                  try {
                    tick('parcial', `Procesando ${Math.round(n*(n-1)/2)} pares…`);
                    ejecutarParcial(selObj);

                    if (hasProgress && typeof completeCurrentStep === 'function') completeCurrentStep();

                    // GPA paso (puede tardar más con N grande)
                    const doGPA = () => {
                      try {
                        if (conGPA) {
                          tick('gpa', `${selObj.filter(o=>getPuntos(o)!==null).length} objetos → iterando…`);
                          ejecutarGPA(selObj);
                          if (hasProgress && typeof completeCurrentStep === 'function') completeCurrentStep();
                        }

                        // Render / navegación
                        setTimeout(() => {
                          try {
                            tick('render');
                            const step1 = $('psStep1Panel');
                            const step2 = $('psStep2Panel');
                            if (step1) step1.style.display = 'none';
                            if (step2) step2.style.display = 'block';
                            actualizarStepper(2);
                            switchTab(_tabActiva);

                            if (hasProgress) {
                              endDetailedProgress(true,
                                clsf.modo === 'especular'
                                  ? `Simetría bilateral calculada — ${n} objetos analizados`
                                  : `Análisis PS completado — ${n} objetos`
                              );
                            }
                          } catch(e) {
                            if (e.message !== 'cancelled' && hasProgress)
                              endDetailedProgress(false, 'Error al renderizar resultados');
                          }
                        }, 80);

                      } catch(e) {
                        if (e.message !== 'cancelled' && hasProgress)
                          endDetailedProgress(false, 'Error en GPA');
                      }
                    };

                    // Pequeña pausa antes del GPA para que la barra se actualice
                    setTimeout(doGPA, 60);

                  } catch(e) {
                    if (e.message !== 'cancelled' && hasProgress)
                      endDetailedProgress(false, 'Error en PS Parcial');
                  }
                }, 60);
              } catch(e) {
                if (e.message !== 'cancelled' && hasProgress)
                  endDetailedProgress(false, 'Error en remuestreo');
              }
            }, 60);
          } catch(e) {
            if (e.message !== 'cancelled' && hasProgress)
              endDetailedProgress(false, 'Error en normalización');
          }
        }, 60);
      } catch(e) {
        if (e.message !== 'cancelled' && hasProgress)
          endDetailedProgress(false, 'Error al preparar el análisis');
      }
    }, 80);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  TABS
  // ──────────────────────────────────────────────────────────────────────────

  function switchTab(tab) {
    _tabActiva = tab;
    document.querySelectorAll('.ps-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.ps-tab-pane').forEach(p => p.classList.toggle('active', p.id === `psTab_${tab}`));
  }

  function bindTabs() {
    document.querySelectorAll('.ps-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  STEPPER VISUAL
  // ──────────────────────────────────────────────────────────────────────────

  function actualizarStepper(paso) {
    const s1 = $('psStep1');
    const s2 = $('psStep2');
    if (!s1 || !s2) return;
    s1.classList.toggle('active', paso === 1);
    s1.classList.toggle('done',   paso > 1);
    s2.classList.toggle('active', paso === 2);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  APERTURA DEL MODAL
  // ──────────────────────────────────────────────────────────────────────────

  async function abrir() {
    const modal = $('psModal');
    if (!modal) return;

    // Resetear estado visual
    const step1 = $('psStep1Panel');
    const step2 = $('psStep2Panel');
    if (step1) step1.style.display = 'block';
    if (step2) step2.style.display = 'none';
    actualizarStepper(1);

    const btnEj = $('psEjecutarBtn');
    if (btnEj) { btnEj.disabled = true; btnEj.textContent = 'Cargando…'; }

    // Mostrar modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Cargar objetos
    const ok = await cargar();
    if (ok) {
      renderObjetos();
      actualizarContador();
      if (btnEj) { btnEj.disabled = _selIds.size < 2; btnEj.textContent = 'Ejecutar Análisis PS'; }
    } else {
      if (btnEj) { btnEj.textContent = 'Sin datos'; }
    }
  }

  function cerrar() {
    const modal = $('psModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  INIT
  // ──────────────────────────────────────────────────────────────────────────

  function init() {
    const btnAbrir = $('abrirProcrustesBtn');
    if (btnAbrir) btnAbrir.addEventListener('click', abrir);

    const btnAbrir2 = $('sidebarAbrirProcrustesBtn');
    if (btnAbrir2) btnAbrir2.addEventListener('click', abrir);

    const btnCerrar = $('psCerrarBtn');
    if (btnCerrar) btnCerrar.addEventListener('click', cerrar);

    const modal = $('psModal');
    if (modal) {
      modal.addEventListener('click', e => {
        if (e.target === modal) cerrar();
      });
    }

    const btnEj = $('psEjecutarBtn');
    if (btnEj) btnEj.addEventListener('click', ejecutar);

    const btnVolver = $('psVolverBtn');
    if (btnVolver) btnVolver.addEventListener('click', () => {
      const step1 = $('psStep1Panel');
      const step2 = $('psStep2Panel');
      if (step1) step1.style.display = 'block';
      if (step2) step2.style.display = 'none';
      actualizarStepper(1);
    });

    const btnSelTodos = $('psSelTodosBtn');
    if (btnSelTodos) btnSelTodos.addEventListener('click', () => {
      document.querySelectorAll('.ps-chk-obj').forEach(c => {
        c.checked = true; c.closest('label')?.classList.add('sel');
      });
      _selIds = new Set(_objetos.map(o => String(o.id)));
      actualizarContador();
    });

    const btnDesel = $('psDeselTodosBtn');
    if (btnDesel) btnDesel.addEventListener('click', () => {
      document.querySelectorAll('.ps-chk-obj').forEach(c => {
        c.checked = false; c.closest('label')?.classList.remove('sel');
      });
      _selIds.clear();
      actualizarContador();
    });

    bindTabs();
  }

  // Exponer init para llamarlo desde DOMContentLoaded
  return { init };

})();

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ProcrustesModule.init());
} else {
  ProcrustesModule.init();
}
