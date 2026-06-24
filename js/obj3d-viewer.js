// MAO Plus — Visor OBJ 3D mejorado (caras sombreadas + wireframe + ejes)

(() => {
  const input = document.getElementById('obj3dInput');
  const loadBtn = document.getElementById('obj3dLoadBtn');
  const analyzeBtn = document.getElementById('obj3dAnalyzeBtn');
  const saveBtn = document.getElementById('obj3dSaveBtn');
  const saveJsonBtn = document.getElementById('obj3dSaveJsonBtn');
  const morphBtn = document.getElementById('obj3dMorphBtn');
  const resetViewBtn  = document.getElementById('obj3dResetViewBtn');
  const fitViewBtn     = document.getElementById('obj3dFitViewBtn');
  const zoomOutBtn     = document.getElementById('obj3dZoomOutBtn');
  const zoomInBtn      = document.getElementById('obj3dZoomInBtn');
  const zoomPctInput   = document.getElementById('obj3dZoomPct');
  const exportPngBtn    = document.getElementById('obj3dExportPngBtn');
  const exportDropBtn    = document.getElementById('obj3dExportDropBtn');
  const exportMenu       = document.getElementById('obj3dExportMenu');
  const setMorphAnchorBtn = document.getElementById('obj3dSetMorphAnchorBtn');
  const setContourZBtn = document.getElementById('obj3dSetContourZBtn');
  const statusEl = document.getElementById('obj3dStatus');
  const canvas = document.getElementById('obj3dCanvas');
  const basicInfoEl = document.getElementById('obj3dBasicInfo');
  const metricsEl        = document.getElementById('obj3dMetrics');
  const pipelineEl       = document.getElementById('obj3dMetrics-pipeline');
  const orientacionEl    = document.getElementById('obj3dMetrics-orientacion');
  const morfometriaEl    = document.getElementById('obj3dMetrics-morfometria');
  const hom2d3dEl        = document.getElementById('obj3dMetrics-hom2d3d');
  const maoplusEl        = document.getElementById('obj3dMetrics-maoplus');
  const pcaEl            = document.getElementById('obj3dMetrics-pcaprocrustes');
  const hom3dEl          = document.getElementById('obj3dMetrics-hom3d');
  const mao3dPanelEl = document.getElementById('obj3dMao3dPanel');
  const efaPanelEl   = document.getElementById('obj3dEfaPanel');
  const samplesInput   = document.getElementById('obj3dSamplesInput');
  const sectionsInput  = document.getElementById('obj3dSectionsInput');
  const normalizeSelect = document.getElementById('obj3dNormalizeSelect');
  const unitSelect = document.getElementById('obj3dUnitSelect');

  const showFacesCheck = document.getElementById('obj3dShowFaces');
  const showWireCheck = document.getElementById('obj3dShowWireframe');
  const showAxesCheck    = document.getElementById('obj3dShowAxes');
  const showPcaAxesCheck = document.getElementById('obj3dShowPcaAxes');
  const autoRotateCheck = document.getElementById('obj3dAutoRotate');
  const lightSlider = document.getElementById('obj3dLightSlider');
  const projectionSelect = document.getElementById('obj3dProjectionMode');
  const axesModeSelect = document.getElementById('obj3dAxesMode');
  const cullBackfacesCheck = document.getElementById('obj3dCullBackfaces');

  if (!input || !loadBtn || !analyzeBtn || !canvas) return;

  const ctx = canvas.getContext('2d');

  const state = {
    file: null,
    vertices: [],
    edges: [],
    triangles: [],
    faces: 0,
    bbox: null,
    center: { x: 0, y: 0, z: 0 },
    scale: 1,
    rotX: -0.45,
    rotY: 0.6,
    zoom: 1.5,
    // Textura
    uvs: [],              // [{u,v}] — coordenadas UV del OBJ
    triUVs: [],           // [[a,b,c]] — índices UV por triángulo (paralelo a triangles)
    vertexColors: [],     // [{r,g,b}] — colores de vértice si el OBJ los incluye
    textureImage: null,   // HTMLImageElement cargada
    textureName: null,    // nombre del archivo de textura
    showTexture: false,   // toggle del usuario
    showDepthColor: false,    // colorear superficie por distancia al centro de masa
    _cmDistances: null,       // { dists: Float32Array, dMin, dMax, range } — precomputado
    showRoughnessColor: false, // colorear superficie por varianza de normales locales (rugosidad geométrica)
    _normalVariance: null,     // { roughness: Float32Array, rMin, rMax, rRange } — precomputado
    dragging: false,
    lastX: 0,
    lastY: 0,
    autoRotate: false,
    rafId: null,
    showFaces: true,
    showWireframe: true,
    showAxes:    true,
    showPcaAxes: true,
    cullBackfaces: false,
    projectionMode: 'perspective',
    axesMode: 'model',
    pcaAxes: null,
    lastMetrics: null,
    lightPower: 0.72,
    lightDir: normalize3({ x: -0.45, y: 0.55, z: 0.7 }),
    // Nuevos: v2 morphological
    v2Data: null,
    canonicalRotation: null,
    faceMode: null,
    currentView: 'isometric',  // isometric | front | back | left | right | top | bottom
    rotationLocked: false,
    orientationMode: 'auto_visual',   // auto_visual | user_morphological_axis | contour_variance_normal
    orientationOverrideMode: null,
    metricsComputed: false,
    showContourOverlay: false,
    showTransverseSections: true,
    showCoronalSections: true,
    showFrontalSections: true,
    awaitingMorphAnchorPick: false,
    userMorphAnchor: null,
    userMorphAnchorIndex: null,
    unitLabel: 'u3d',
    mmPerUnit: 1.0,
    lastSaveGateReason: null,
  };

  // Evita arrastre de estado visual previo: el modo base es semántico/modelo.
  if (axesModeSelect) {
    axesModeSelect.value = 'model';
  }
  if (autoRotateCheck) {
    autoRotateCheck.checked = false;
  }
  if (setMorphAnchorBtn) {
    setMorphAnchorBtn.disabled = true;
    setMorphAnchorBtn.title = 'Disponible después de calcular métricas PCA';
  }
  if (setContourZBtn) {
    setContourZBtn.disabled = true;
    setContourZBtn.title = 'Disponible después de calcular métricas PCA';
  }

  function setOrientationOverrideControlsEnabled(enabled) {
    if (setMorphAnchorBtn) {
      setMorphAnchorBtn.disabled = !enabled;
      if (!enabled) {
        setMorphAnchorBtn.textContent = 'Ancla morfol.';
        setMorphAnchorBtn.classList.remove('btn-warning-inv', 'btn-success');
        setMorphAnchorBtn.classList.add('btn-muted');
        setMorphAnchorBtn.title = 'Disponible después de calcular métricas PCA';
      } else {
        _syncMorphAnchorBtn();
      }
    }
    if (setContourZBtn) {
      setContourZBtn.disabled = !enabled;
      setContourZBtn.title = enabled
        ? 'Usar Z como normal al plano de mínima varianza del contorno (override visual opcional)'
        : 'Disponible después de calcular métricas PCA';
    }
  }

  function _syncMorphAnchorBtn() {
    if (!setMorphAnchorBtn) return;
    setMorphAnchorBtn.classList.remove('btn-muted', 'btn-warning-inv', 'btn-success');
    if (state.userMorphAnchor) {
      setMorphAnchorBtn.textContent = 'Ancla \u2713 (quitar)';
      setMorphAnchorBtn.classList.add('btn-success');
      setMorphAnchorBtn.title = 'Ancla morfol\xF3gica activa \u2014 clic para eliminarla y restaurar orientaci\xF3n autom\xE1tica';
    } else if (state.awaitingMorphAnchorPick) {
      setMorphAnchorBtn.textContent = 'Cancelar';
      setMorphAnchorBtn.classList.add('btn-warning-inv');
      setMorphAnchorBtn.title = 'Clic para cancelar la selecci\xF3n del ancla';
    } else {
      setMorphAnchorBtn.textContent = 'Ancla morfol.';
      setMorphAnchorBtn.classList.add('btn-muted');
      setMorphAnchorBtn.title = 'Seleccionar punto para orientaci\xF3n morfol\xF3gica (override visual opcional)';
    }
  }

  // Referencia al botón de textura (se resuelve de forma lazy)
  function _getTextureBtn() {
    return document.getElementById('obj3dTextureBtn');
  }

  // Acepta tanto HTMLImageElement como HTMLCanvasElement (textura pre-escalada)
  function _isTexture(t) {
    return t instanceof HTMLImageElement || t instanceof HTMLCanvasElement;
  }

  // Pre-escala la textura a ≤ maxPx para no dibujar imágenes 4K por cada triángulo
  function _scaleTexture(src, maxPx) {
    maxPx = maxPx || 1024;
    const sw = src.naturalWidth  || src.width;
    const sh = src.naturalHeight || src.height;
    if (!sw || !sh || (sw <= maxPx && sh <= maxPx)) return src;
    const scale = maxPx / Math.max(sw, sh);
    const oc = document.createElement('canvas');
    oc.width  = Math.round(sw * scale);
    oc.height = Math.round(sh * scale);
    oc.getContext('2d').drawImage(src, 0, 0, oc.width, oc.height);
    return oc;
  }

  function _syncTextureBtn() {
    const btn  = document.getElementById('obj3dTextureBtn');
    const lbl  = document.getElementById('obj3dTextureLoadLabel');
    const hasSource = _isTexture(state.textureImage) || state.vertexColors.length > 0;

    // Label «Textura…» — siempre activo; cambia texto cuando hay textura cargada
    if (lbl) {
      if (hasSource && state.textureName) {
        const short = state.textureName.length > 18
          ? state.textureName.slice(0, 16) + '\u2026'
          : state.textureName;
        lbl.title = `Textura: ${state.textureName} — clic para cambiar`;
        lbl.firstChild.textContent = short + ' ';
      } else {
        lbl.title = 'Cargar imagen de textura (.jpg, .png\u2026)';
        lbl.firstChild.textContent = 'Textura\u2026 ';
      }
    }

    // Botón «Mostrar» — habilitado solo cuando hay textura
    if (!btn) return;
    btn.disabled = !hasSource;
    if (!hasSource) {
      btn.classList.remove('btn-success');
      btn.classList.add('btn-muted');
      btn.textContent = 'Mostrar';
      btn.title = 'Sin textura cargada';
      return;
    }
    if (state.showTexture) {
      btn.classList.remove('btn-muted');
      btn.classList.add('btn-success');
      btn.textContent = 'Mostrar \u2713';
      btn.title = 'Textura activa \u2014 clic para desactivar';
    } else {
      btn.classList.remove('btn-success');
      btn.classList.add('btn-muted');
      btn.textContent = 'Mostrar';
      btn.title = 'Activar visualización de textura';
    }
  }

  function _syncContourBtn() {
    const btn   = document.getElementById('obj3dContourBtn');
    const chips = document.getElementById('obj3dSectionChips');
    if (!btn) return;
    if (!state.metricsComputed) {
      btn.disabled = true;
      btn.classList.remove('btn-success');
      btn.classList.add('btn-muted');
      btn.textContent = 'Contornos';
      btn.title = 'Requiere análisis 3D para mostrar contornos canónicos';
      if (chips) chips.style.display = 'none';
      return;
    }
    btn.disabled = false;
    if (state.showContourOverlay) {
      btn.classList.remove('btn-muted');
      btn.classList.add('btn-success');
      btn.textContent = 'Contornos \u2713';
      btn.title = 'Contornos canónicos activos \u2014 clic para ocultar';
      if (chips) chips.style.display = 'flex';
    } else {
      btn.classList.remove('btn-success');
      btn.classList.add('btn-muted');
      btn.textContent = 'Contornos';
      btn.title = 'Mostrar contornos canónicos (envolvente convexa por vista)';
      if (chips) chips.style.display = 'none';
    }
    // Sync chips
    const _syncChip = (id, active) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('is-active', active);   // grupo segmentado .laar-btn-group
    };
    _syncChip('obj3dSecTransBtn', state.showTransverseSections);
    _syncChip('obj3dSecCorBtn',   state.showCoronalSections);
    _syncChip('obj3dSecFrBtn',    state.showFrontalSections);
  }

  function setStatus(msg, isError = false) {
    statusEl.textContent = msg;
    statusEl.style.color = isError ? '#b00020' : 'var(--gray-500)';
  }

  function updateSaveButtonState() {
    if (!saveBtn) return;
    const hasProject = !!window.projectManager?.activeProject;
    const hasMetrics = !!state.lastMetrics;
    const hasFile = !!state.file;
    const ident = getEffectiveIdentification();
    const hasIdent = !!ident;
    const enabled = hasProject && hasMetrics && hasFile && hasIdent;

    let reason = 'ready';
    if (!hasProject) reason = 'no_active_project';
    else if (!hasMetrics) reason = 'no_metrics';
    else if (!hasFile) reason = 'no_obj_file';
    else if (!hasIdent) reason = 'no_identification';

    saveBtn.disabled = !enabled;
    if (reason !== state.lastSaveGateReason) {
      state.lastSaveGateReason = reason;
      console.info('[OBJ3D][SAVE_GATE]', JSON.stringify({
        reason,
        enabled,
        hasProject,
        hasMetrics,
        hasFile,
        hasIdent,
        activeProject: window.projectManager?.activeProject?.name || null,
        identValue: ident?.valor || null,
        fileName: state.file?.name || null,
      }));
    }

    if (!hasProject) {
      saveBtn.title = 'Activa un proyecto para guardar el análisis 3D';
      return;
    }
    if (!hasMetrics) {
      saveBtn.title = 'Calcula el análisis 3D antes de guardar';
      return;
    }
    if (!hasFile) {
      saveBtn.title = 'Carga un archivo OBJ';
      return;
    }
    if (!hasIdent) {
      saveBtn.title = 'Sin identificación bloqueada: se usará ID automático desde archivo OBJ';
      return;
    }
    saveBtn.title = 'Guardar análisis 3D en el proyecto activo';
  }

  function updateIndependentSaveButtonState() {
    if (!saveJsonBtn) return;
    const hasMetrics = !!state.lastMetrics;
    const hasFile = !!state.file;
    const enabled = hasMetrics && hasFile;
    saveJsonBtn.disabled = !enabled;

    if (!hasFile) {
      saveJsonBtn.title = 'Carga un archivo OBJ para exportar JSON';
      return;
    }
    if (!hasMetrics) {
      saveJsonBtn.title = 'Calcula el análisis 3D antes de exportar JSON';
      return;
    }
    saveJsonBtn.title = 'Exportar paquete JSON 3D a una carpeta seleccionada';
  }

  function fmt(n, digits = 4) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return '-';
    return n.toFixed(digits);
  }

  function normalize3(v) {
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function mulRowVectorByMatrix3(v, m) {
    if (!Array.isArray(m) || m.length < 3) return v;
    const r0 = m[0] || [];
    const r1 = m[1] || [];
    const r2 = m[2] || [];
    const x = Number(v.x);
    const y = Number(v.y);
    const z = Number(v.z);
    return {
      x: x * Number(r0[0] ?? 1) + y * Number(r1[0] ?? 0) + z * Number(r2[0] ?? 0),
      y: x * Number(r0[1] ?? 0) + y * Number(r1[1] ?? 1) + z * Number(r2[1] ?? 0),
      z: x * Number(r0[2] ?? 0) + y * Number(r1[2] ?? 0) + z * Number(r2[2] ?? 1),
    };
  }

  function clearCanvas() {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#f7f9fb');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#ebeff3';
    ctx.lineWidth = 1;
    const step = 36;
    for (let x = 0; x <= canvas.width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  function parseObj(text) {
    const vertices = [];
    const uvCoords = [];       // vt u v
    const vertexColors = [];   // v x y z r g b
    const edges = new Set();
    const triangles = [];
    const triUVs = [];         // índices UV por triángulo, paralelo a triangles
    let faceCount = 0;
    let mtlFile = null;

    const lines = text.split(/\r?\n/);
    let hasAnyUV = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      if (line.startsWith('mtllib ')) {
        // Puede haber múltiples archivos; tomamos el primero
        const name = line.slice(7).trim();
        if (name && !mtlFile) mtlFile = name;

      } else if (line.startsWith('v ')) {
        const parts = line.slice(2).trim().split(/\s+/);
        if (parts.length < 3) continue;
        const x = Number(parts[0]);
        const y = Number(parts[1]);
        const z = Number(parts[2]);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        vertices.push({ x, y, z });
        // Vertex colors: "v x y z r g b" (valores 0-1 o 0-255)
        if (parts.length >= 6) {
          const r = Number(parts[3]);
          const g = Number(parts[4]);
          const b = Number(parts[5]);
          if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
            const scale = (r <= 1 && g <= 1 && b <= 1) ? 255 : 1;
            vertexColors.push({ r: Math.round(r * scale), g: Math.round(g * scale), b: Math.round(b * scale) });
          } else {
            vertexColors.push(null);
          }
        }

      } else if (line.startsWith('vt ')) {
        const parts = line.slice(3).trim().split(/\s+/);
        if (parts.length < 2) continue;
        const u = Number(parts[0]);
        const v = 1 - Number(parts[1]); // flip Y: OBJ origin bottom-left, Canvas top-left
        uvCoords.push(Number.isFinite(u) && Number.isFinite(v) ? { u, v } : { u: 0, v: 0 });

      } else if (line.startsWith('f ')) {
        const tokens = line.slice(2).trim().split(/\s+/);
        const vIdx = [];
        const uvIdx = [];
        for (const token of tokens) {
          const parts = token.split('/');
          const vi = Number(parts[0]);
          if (!Number.isInteger(vi) || vi === 0) continue;
          vIdx.push(vi > 0 ? vi - 1 : vertices.length + vi);
          const ui = parts.length > 1 && parts[1] !== '' ? Number(parts[1]) : 0;
          uvIdx.push(ui > 0 ? ui - 1 : (ui < 0 ? uvCoords.length + ui : -1));
        }

        if (vIdx.length < 3) continue;
        const hasUV = uvIdx.some((i) => i >= 0);
        if (hasUV) hasAnyUV = true;

        for (let j = 1; j < vIdx.length - 1; j++) {
          const a = vIdx[0],  b = vIdx[j],  c = vIdx[j + 1];
          const ua = uvIdx[0], ub = uvIdx[j], uc = uvIdx[j + 1];
          faceCount += 1;
          triangles.push([a, b, c]);
          triUVs.push(hasUV ? [ua, ub, uc] : null);

          const e1 = a < b ? `${a}_${b}` : `${b}_${a}`;
          const e2 = b < c ? `${b}_${c}` : `${c}_${b}`;
          const e3 = c < a ? `${c}_${a}` : `${a}_${c}`;
          edges.add(e1);
          edges.add(e2);
          edges.add(e3);
        }
      }
    }

    if (vertices.length === 0) {
      throw new Error('El archivo OBJ no contiene vértices válidos.');
    }

    const edgeList = Array.from(edges).map((e) => {
      const [a, b] = e.split('_').map(Number);
      return [a, b];
    });

    return {
      vertices,
      edges: edgeList,
      triangles,
      faceCount,
      uvCoords,
      triUVs: hasAnyUV ? triUVs : [],
      vertexColors: vertexColors.length === vertices.length ? vertexColors : [],
      mtlFile,
    };
  }

  function computeBounds(vertices) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const v of vertices) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
      if (v.z > maxZ) maxZ = v.z;
    }

    const dx = maxX - minX;
    const dy = maxY - minY;
    const dz = maxZ - minZ;
    const center = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      z: (minZ + maxZ) / 2,
    };

    const maxDim = Math.max(dx, dy, dz) || 1;

    return {
      minX,
      minY,
      minZ,
      maxX,
      maxY,
      maxZ,
      dx,
      dy,
      dz,
      center,
      maxDim,
    };
  }

  /**
   * Precomputa, para cada vértice, su distancia al centro de masa.
   * Almacena { dists, dMin, dMax, range } en state._cmDistances.
   * Llamar cada vez que cambian state.vertices o state.center.
   */
  function _precomputeCMDistances() {
    if (!state.vertices.length || !state.center) { state._cmDistances = null; return; }
    const { x: cx, y: cy, z: cz } = state.center;
    const n = state.vertices.length;
    const dists = new Float32Array(n);
    let dMin = Infinity, dMax = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = state.vertices[i];
      const d = Math.sqrt((v.x - cx) ** 2 + (v.y - cy) ** 2 + (v.z - cz) ** 2);
      dists[i] = d;
      if (d < dMin) dMin = d;
      if (d > dMax) dMax = d;
    }
    state._cmDistances = { dists, dMin, dMax, range: (dMax - dMin) || 1 };
  }

  /**
   * Gradiente jet: t=0 (azul, cerca del CM) → cian → verde → amarillo → t=1 (rojo, lejos).
   * Modulado por intensity para conservar el efecto de iluminación 3D.
   */
  function _depthColor(t, intensity) {
    const tt = Math.max(0, Math.min(1, t));
    let r, g, b;
    if (tt < 0.25) { const s = tt / 0.25;        r = 0;                    g = Math.round(s * 255);       b = 255; }
    else if (tt < 0.5)  { const s = (tt - 0.25) / 0.25; r = 0;                    g = 255;                      b = Math.round((1 - s) * 255); }
    else if (tt < 0.75) { const s = (tt - 0.5)  / 0.25; r = Math.round(s * 255);  g = 255;                      b = 0; }
    else                { const s = (tt - 0.75) / 0.25; r = 255;                  g = Math.round((1 - s) * 255); b = 0; }
    const f = Math.max(0.18, intensity);
    return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
  }

  /**
   * Colorbar en la esquina inferior-derecha del canvas 3D.
   * Muestra el rango [dMin … dMax] distancia al CM con el gradiente jet.
   */
  function _renderDepthColorbar() {
    const cm = state._cmDistances;
    if (!cm) return;
    const barW = 160, barH = 10;
    const bx   = canvas.width  - barW - 16;
    const by   = canvas.height - 24;
    ctx.save();
    // Fondo
    ctx.fillStyle = 'rgba(10,14,20,0.60)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx - 6, by - 16, barW + 12, barH + 22, 4);
    else ctx.rect(bx - 6, by - 16, barW + 12, barH + 22);
    ctx.fill();
    // Barra de color
    const grad = ctx.createLinearGradient(bx, 0, bx + barW, 0);
    for (let i = 0; i <= 10; i++) {
      const tt = i / 10;
      let r, g, b;
      if (tt < 0.25) { const s = tt / 0.25;        r = 0;   g = Math.round(s * 255);       b = 255; }
      else if (tt < 0.5)  { const s = (tt - 0.25) / 0.25; r = 0;   g = 255;                      b = Math.round((1 - s) * 255); }
      else if (tt < 0.75) { const s = (tt - 0.5)  / 0.25; r = Math.round(s * 255);  g = 255;  b = 0; }
      else                { const s = (tt - 0.75) / 0.25; r = 255; g = Math.round((1 - s) * 255); b = 0; }
      grad.addColorStop(tt, `rgb(${r},${g},${b})`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, barW, barH);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(bx, by, barW, barH);
    // Etiquetas
    const fmt = v => v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(3);
    ctx.font = '7.5px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ccc';
    ctx.textAlign = 'left';
    ctx.fillText(fmt(cm.dMin), bx, by + barH / 2);
    ctx.textAlign = 'right';
    ctx.fillText(fmt(cm.dMax), bx + barW, by + barH / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(180,180,180,0.8)';
    ctx.font = '7px system-ui, sans-serif';
    ctx.fillText('← Cerca CM · Lejos CM →', bx + barW / 2, by - 8);
    ctx.restore();
  }

  /**
   * Precomputa la varianza de normales locales por vértice — proxy de rugosidad geométrica.
   * Para cada vértice: normal media de sus caras adyacentes → desviación angular media.
   * Resultado en state._normalVariance: { roughness: Float32Array, rMin, rMax, rRange }.
   */
  function _precomputeNormalVariance() {
    const verts = state.vertices;
    const tris  = state.triangles;
    const nv = verts.length;
    const nf = tris.length;
    if (nv === 0 || nf === 0) { state._normalVariance = null; return; }

    // 1. Normales de cara
    const fn = new Float32Array(nf * 3);
    for (let f = 0; f < nf; f++) {
      const [ai, bi, ci] = tris[f];
      const va = verts[ai], vb = verts[bi], vc = verts[ci];
      const ux = vb.x - va.x, uy = vb.y - va.y, uz = vb.z - va.z;
      const wx = vc.x - va.x, wy = vc.y - va.y, wz = vc.z - va.z;
      let nx = uy * wz - uz * wy;
      let ny = uz * wx - ux * wz;
      let nz = ux * wy - uy * wx;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 0) { nx /= len; ny /= len; nz /= len; }
      fn[f * 3]     = nx;
      fn[f * 3 + 1] = ny;
      fn[f * 3 + 2] = nz;
    }

    // 2. Adyacencia vértice → caras (para cómputo de desviación)
    //    + adyacencia vértice → vértices (para suavizado laplaciano)
    const vadj  = new Array(nv);  // v → [índices de cara]
    const vvadj = new Array(nv);  // v → [índices de vértice vecino]
    for (let i = 0; i < nv; i++) { vadj[i] = []; vvadj[i] = new Set(); }
    for (let f = 0; f < nf; f++) {
      const [ai, bi, ci] = tris[f];
      vadj[ai].push(f); vadj[bi].push(f); vadj[ci].push(f);
      vvadj[ai].add(bi); vvadj[ai].add(ci);
      vvadj[bi].add(ai); vvadj[bi].add(ci);
      vvadj[ci].add(ai); vvadj[ci].add(bi);
    }
    // Convertir Sets a arrays para mejor rendimiento en bucles posteriores
    for (let i = 0; i < nv; i++) vvadj[i] = Array.from(vvadj[i]);

    // 3. Desviación angular respecto a la normal media de cada vértice
    const roughness = new Float32Array(nv);
    for (let v = 0; v < nv; v++) {
      const faces = vadj[v];
      const k = faces.length;
      if (k === 0) { roughness[v] = 0; continue; }
      let ax = 0, ay = 0, az = 0;
      for (const f of faces) { ax += fn[f*3]; ay += fn[f*3+1]; az += fn[f*3+2]; }
      const al = Math.sqrt(ax*ax + ay*ay + az*az);
      if (al > 0) { ax /= al; ay /= al; az /= al; }
      let dev = 0;
      for (const f of faces) {
        const d = ax * fn[f*3] + ay * fn[f*3+1] + az * fn[f*3+2];
        dev += 1 - Math.min(1, Math.abs(d));
      }
      roughness[v] = dev / k;
    }

    // 4. Suavizado laplaciano del campo escalar (5 iteraciones):
    //    promedia cada vértice con sus vecinos de 1-anillo → elimina ruido
    //    de alta frecuencia sin borrar diferencias morfológicamente significativas.
    let smooth = roughness;
    for (let iter = 0; iter < 5; iter++) {
      const tmp = new Float32Array(nv);
      for (let v = 0; v < nv; v++) {
        const nbrs = vvadj[v];
        const k2 = nbrs.length;
        if (k2 === 0) { tmp[v] = smooth[v]; continue; }
        let sum = smooth[v];
        for (const n of nbrs) sum += smooth[n];
        tmp[v] = sum / (k2 + 1);
      }
      smooth = tmp;
    }

    // 5. Rango por percentil p2–p98 (los outliers de costura ya se suavizaron)
    const sorted = Float32Array.from(smooth).sort();
    const rMin = sorted[Math.floor(nv * 0.02)];
    const rMax = sorted[Math.min(nv - 1, Math.floor(nv * 0.98))];
    state._normalVariance = { roughness: smooth, rMin, rMax, rRange: (rMax - rMin) || 1 };
  }

  /**
   * Colormap amarillo → violeta para rugosidad.
   * t=0 (liso/plano): amarillo brillante  →  t=1 (rugoso/arista): violeta oscuro.
   * Interpolación con smoothstep entre 5 anclajes para degradado continuo.
   * intensity: factor de iluminación Phong (rango [0,1]).
   */
  function _roughnessColor(t, intensity) {
    const stops = [
      [255, 240,  50],   // t=0.00  amarillo brillante (liso)
      [240, 120,  20],   // t=0.25  naranja
      [200,  30,  80],   // t=0.50  carmín
      [ 90,   5, 150],   // t=0.75  morado
      [ 20,   0,  60],   // t=1.00  violeta oscuro (rugoso)
    ];
    const seg  = Math.min(3, Math.floor(t * 4));
    const frac = t * 4 - seg;
    const s = frac * frac * (3 - 2 * frac);  // smoothstep
    const c0 = stops[seg], c1 = stops[seg + 1];
    const r = c0[0] + (c1[0] - c0[0]) * s;
    const g = c0[1] + (c1[1] - c0[1]) * s;
    const b = c0[2] + (c1[2] - c0[2]) * s;
    const f = Math.max(0.22, intensity);
    return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
  }

  /**
   * Colorbar de rugosidad — misma posición que la de profundidad (son modos mutuamente excluyentes).
   */
  function _renderRoughnessColorbar() {
    const nv = state._normalVariance;
    if (!nv) return;
    const barW = 160, barH = 10;
    const bx   = canvas.width  - barW - 16;
    const by   = canvas.height - 24;
    ctx.save();
    ctx.fillStyle = 'rgba(10,14,20,0.60)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx - 6, by - 16, barW + 12, barH + 22, 4);
    else ctx.rect(bx - 6, by - 16, barW + 12, barH + 22);
    ctx.fill();
    // Barra de color — mismos anclajes que _roughnessColor (amarillo → violeta)
    const grad = ctx.createLinearGradient(bx, 0, bx + barW, 0);
    const cbStops = [
      [0.00, '255,240, 50'],
      [0.25, '240,120, 20'],
      [0.50, '200, 30, 80'],
      [0.75, ' 90,  5,150'],
      [1.00, ' 20,  0, 60'],
    ];
    for (const [pos, rgb] of cbStops) grad.addColorStop(pos, `rgb(${rgb})`);
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, barW, barH);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(bx, by, barW, barH);
    ctx.font = '7.5px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ccc';
    ctx.textAlign = 'left';
    ctx.fillText('liso', bx, by + barH / 2);
    ctx.textAlign = 'right';
    ctx.fillText('rugoso', bx + barW, by + barH / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(180,180,180,0.8)';
    ctx.font = '7px system-ui, sans-serif';
    ctx.fillText('← Varianza de normales locales →', bx + barW / 2, by - 8);
    ctx.restore();
  }

  function rotatePoint(v) {
    let local = {
      x: v.x - state.center.x,
      y: v.y - state.center.y,
      z: v.z - state.center.z,
    };

    // Normalización canónica proveniente del backend (v2 o hybrid_v1)
    if (state.canonicalRotation) {
      local = mulRowVectorByMatrix3(local, state.canonicalRotation);
    }

    const cosY = Math.cos(state.rotY);
    const sinY = Math.sin(state.rotY);
    const x1 = local.x * cosY + local.z * sinY;
    const z1 = -local.x * sinY + local.z * cosY;

    const cosX = Math.cos(state.rotX);
    const sinX = Math.sin(state.rotX);
    const y2 = local.y * cosX - z1 * sinX;
    const z2 = local.y * sinX + z1 * cosX;

    return { x: x1, y: y2, z: z2 };
  }

  function rotateVector(v) {
    const cx = v.x;
    const cy = v.y;
    const cz = v.z;

    const cosY = Math.cos(state.rotY);
    const sinY = Math.sin(state.rotY);
    const x1 = cx * cosY + cz * sinY;
    const z1 = -cx * sinY + cz * cosY;

    const cosX = Math.cos(state.rotX);
    const sinX = Math.sin(state.rotX);
    const y2 = cy * cosX - z1 * sinX;
    const z2 = cy * sinX + z1 * cosX;

    return { x: x1, y: y2, z: z2 };
  }

  function projectPoint(vr) {
    const s = state.scale * state.zoom;

    if (state.projectionMode === 'orthographic') {
      return {
        x: canvas.width * 0.5 + vr.x * s,
        y: canvas.height * 0.5 - vr.y * s,
        z: vr.z,
      };
    }

    const focal = 670;
    const dist = 3.2;
    // z normalizado a las mismas unidades que dist (vr.z está en mm,
    // dist=3.2 está en unidades normalizadas → z*s ≈ 0.17 para z=15mm).
    // Sin normalizar: denom=18.6 → persp=36 (6× demasiado pequeño).
    const denom = Math.max(0.35, dist + vr.z * s);
    const persp = focal / denom;

    return {
      x: canvas.width * 0.5 + vr.x * persp * s,
      y: canvas.height * 0.5 - vr.y * persp * s,
      z: vr.z,
    };
  }

  // Proyección canónica: usa el mismo projectPoint (ya con z normalizado),
  // solo omite rotatePoint (canonical+centering) porque los contornos ya
  // vienen en espacio X_sem desde el backend.
  function _projectCanonicalPoint(v) {
    return projectPoint(rotateVector(v));
  }

  function renderAxes() {
    if (!state.bbox) return;

    const axisLen = state.bbox.maxDim * 0.55;
    const origin = rotatePoint(state.center);
    const o2 = projectPoint(origin);

    const drawAxis = (to3, color, label) => {
      const to2 = projectPoint(to3);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(o2.x, o2.y);
      ctx.lineTo(to2.x, to2.y);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = '11px sans-serif';
      ctx.fillText(label, to2.x + 4, to2.y - 4);
    };

    const canUsePcaAxes = state.axesMode === 'pca' &&
      Array.isArray(state.pcaAxes) &&
      state.pcaAxes.length === 3;

    if (canUsePcaAxes) {
      if (!state.showPcaAxes) return;  // toggle independiente para vectores PCA
      const specs = [
        { vec: state.pcaAxes[0], color: '#8e24aa', label: 'PC1' },
        { vec: state.pcaAxes[1], color: '#00897b', label: 'PC2' },
        { vec: state.pcaAxes[2], color: '#ef6c00', label: 'PC3' },
      ];

      specs.forEach(({ vec, color, label }) => {
        const vr = rotateVector({
          x: vec.x * axisLen,
          y: vec.y * axisLen,
          z: vec.z * axisLen,
        });
        drawAxis({ x: origin.x + vr.x, y: origin.y + vr.y, z: origin.z + vr.z }, color, label);
      });
      return;
    }

    if (!state.showAxes) return;  // toggle para ejes de referencia (X/Y/Z modelo)

    const xAxis = rotatePoint({ x: state.center.x + axisLen, y: state.center.y, z: state.center.z });
    const yAxis = rotatePoint({ x: state.center.x, y: state.center.y + axisLen, z: state.center.z });
    const zAxis = rotatePoint({ x: state.center.x, y: state.center.y, z: state.center.z + axisLen });

    drawAxis(xAxis, '#e53935', 'X');
    drawAxis(yAxis, '#2e7d32', 'Y');
    drawAxis(zAxis, '#1565c0', 'Z');
  }

  function extractPcaAxes(payload) {
    const p = payload?.obj3d || payload || {};
    const pcaPayload = p?.pca || p;
    const raw = pcaPayload?.principal_axes || pcaPayload?.eigenvectors;
    if (!Array.isArray(raw) || raw.length < 3) return null;

    const axes = raw.slice(0, 3).map((arr) => {
      if (!Array.isArray(arr) || arr.length < 3) return null;
      const x = Number(arr[0]);
      const y = Number(arr[1]);
      const z = Number(arr[2]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
      return normalize3({ x, y, z });
    });

    if (axes.some((a) => !a)) return null;
    return axes;
  }

  function getPipelineEvidence(payload) {
    const p = payload?.obj3d || payload || {};
    const trace = p?.pipeline_trace || {};
    const seg = p?.segmentation || {};
    const norm = p?.normalization || {};
    const hasV2Level = String(p?.analysis_level || '').toLowerCase().includes('v2');
    const segmentationDone = !!(seg?.patches_found >= 0);
    const facePairsDone = !!(seg?.face_pairs_detected >= 0);
    const normalizationDone = !!norm?.method;
    const pcaDone = !!(p?.pca || p?.principal_axes || p?.eigenvalues);

    return {
      hasV2Level,
      prePcaVerified: !!trace?.pre_pca_verified,
      segmentationDone,
      facePairsDone,
      normalizationDone,
      pcaDone,
      orderedSteps: Array.isArray(trace?.ordered_steps) ? trace.ordered_steps : [],
      executedMap: trace?.executed || {},
      method: norm?.method || '-',
      confidence: Number(norm?.confidence),
    };
  }

  function friendlyStepName(step) {
    const map = {
      segmentation_regular_surfaces: 'Segmentación de superficies regulares',
      face_pair_detection: 'Detección de pares de caras',
      normalization_by_faces: 'Normalización por caras dominantes',
      semantic_orientation_canonical: 'Orientación semántica canónica',
      pca_contextual: 'PCA contextualizado',
      morphometric_metrics: 'Cálculo de métricas morfométricas',
    };
    return map[step] || String(step || '-');
  }

  function isFormalCanonicalResult(obj3dPayload) {
    const canonicalMethod = String(obj3dPayload?.orientation_canonical?.method || '').toLowerCase();
    const formalFacesLocked = !!obj3dPayload?.orientation_canonical?.gravitational?.formal_faces_locked;
    return formalFacesLocked || canonicalMethod.includes('faces_dominant');
  }

  function shouldAutoApplyContourOverride(obj3dPayload) {
    if (!obj3dPayload) return false;
    if (isFormalCanonicalResult(obj3dPayload)) return false;

    const reproducible = !!obj3dPayload?.orientation_canonical?.reproducible;
    const reproScore = Number(obj3dPayload?.orientation_canonical?.reproducibility_score ?? 0);
    const currentMode = String(obj3dPayload?.orientation_mode || 'auto').toLowerCase();

    return currentMode === 'auto' && (!reproducible || reproScore < 0.9);
  }

  function renderFaces(rotated, projected) {
    if (!state.showFaces || !state.triangles.length) return;

    const useTexture = state.showTexture && _isTexture(state.textureImage);
    const useVertexColor = state.showTexture && !useTexture && state.vertexColors.length === state.vertices.length;

    const lightDir = normalize3({
      x: state.lightDir.x,
      y: state.lightDir.y,
      z: state.lightDir.z * Math.max(0.25, state.lightPower),
    });

    const tris = [];
    for (let ti = 0; ti < state.triangles.length; ti++) {
      const tri = state.triangles[ti];
      const [a, b, c] = tri;
      const ra = rotated[a], rb = rotated[b], rc = rotated[c];
      if (!ra || !rb || !rc) continue;

      const u = { x: rb.x - ra.x, y: rb.y - ra.y, z: rb.z - ra.z };
      const v = { x: rc.x - ra.x, y: rc.y - ra.y, z: rc.z - ra.z };
      const n = normalize3({
        x: u.y * v.z - u.z * v.y,
        y: u.z * v.x - u.x * v.z,
        z: u.x * v.y - u.y * v.x,
      });

      if (state.cullBackfaces && n.z <= 0) continue;

      const intensity = Math.max(0.12, Math.min(1, 0.22 + dot(n, lightDir) * state.lightPower));
      const avgZ = (ra.z + rb.z + rc.z) / 3;
      tris.push({ ti, tri, intensity, avgZ });
    }

    tris.sort((a, b) => b.avgZ - a.avgZ);

    const img = state.textureImage;
    const iw = img ? (img.naturalWidth  || img.width)  : 0;
    const ih = img ? (img.naturalHeight || img.height) : 0;

    for (const t of tris) {
      const [a, b, c] = t.tri;
      const pa = projected[a], pb = projected[b], pc = projected[c];
      if (!pa || !pb || !pc) continue;

      // ── Coloración por distancia al centro de masa (modo Profundidad) ──
      if (state.showDepthColor && state._cmDistances) {
        const cm = state._cmDistances;
        const ta = (cm.dists[a] - cm.dMin) / cm.range;
        const tb = (cm.dists[b] - cm.dMin) / cm.range;
        const tc = (cm.dists[c] - cm.dMin) / cm.range;
        ctx.fillStyle = _depthColor((ta + tb + tc) / 3, t.intensity);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.lineTo(pc.x, pc.y);
        ctx.closePath();
        ctx.fill();
        continue;
      }

      // ── Coloración por rugosidad geométrica (varianza de normales locales) ──
      if (state.showRoughnessColor && state._normalVariance) {
        const nr = state._normalVariance;
        const ta = Math.min(1, Math.max(0, (nr.roughness[a] - nr.rMin) / nr.rRange));
        const tb = Math.min(1, Math.max(0, (nr.roughness[b] - nr.rMin) / nr.rRange));
        const tc = Math.min(1, Math.max(0, (nr.roughness[c] - nr.rMin) / nr.rRange));
        // Gamma leído del selector (permite al usuario controlar contraste en tiempo real)
        const gamma = parseFloat(document.getElementById('obj3dRoughnessGamma')?.value ?? '1.0') || 1.0;
        const tAvg  = Math.pow((ta + tb + tc) / 3, gamma);
        const illum = 0.55 + t.intensity * 0.45;
        ctx.fillStyle = _roughnessColor(tAvg, illum);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.lineTo(pc.x, pc.y);
        ctx.closePath();
        ctx.fill();
        continue;
      }

      if (useTexture) {
        // ── UV-mapped texture ──────────────────────────────────────────
        const uvTri = state.triUVs[t.ti];
        const ua = uvTri && uvTri[0] >= 0 ? state.uvs[uvTri[0]] : null;
        const ub = uvTri && uvTri[1] >= 0 ? state.uvs[uvTri[1]] : null;
        const uc = uvTri && uvTri[2] >= 0 ? state.uvs[uvTri[2]] : null;

        if (ua && ub && uc) {
          const x0 = pa.x, y0 = pa.y, x1 = pb.x, y1 = pb.y, x2 = pc.x, y2 = pc.y;

          // Saltar microtriángulos (< 0.5 px²) → flat shading sin overhead de clip+drawImage
          const screenArea = 0.5 * Math.abs((x1-x0)*(y2-y0) - (x2-x0)*(y1-y0));
          if (screenArea < 0.5) {
            const shade = Math.round(64 + 150 * t.intensity);
            ctx.fillStyle = `rgb(${shade - 8},${shade + 10},${shade + 22})`;
            ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.lineTo(x2,y2); ctx.closePath(); ctx.fill();
            continue;
          }

          // Afín: mapear UV→screen usando setTransform
          const u0 = ua.u * iw, v0 = ua.v * ih;
          const u1 = ub.u * iw, v1 = ub.v * ih;
          const u2 = uc.u * iw, v2 = uc.v * ih;

          const du1 = u1 - u0, du2 = u2 - u0;
          const dv1 = v1 - v0, dv2 = v2 - v0;
          const det = du1 * dv2 - dv1 * du2;

          if (Math.abs(det) > 0.5) {
            const dx1 = x1 - x0, dx2 = x2 - x0;
            const dy1 = y1 - y0, dy2 = y2 - y0;
            const ma = (dx1 * dv2 - dx2 * dv1) / det;
            const mb = (dx2 * du1 - dx1 * du2) / det;
            const mc = x0 - ma * u0 - mb * v0;
            const md = (dy1 * dv2 - dy2 * dv1) / det;
            const me = (dy2 * du1 - dy1 * du2) / det;
            const mf = y0 - md * u0 - me * v0;

            // Recorte UV: solo dibujar el fragmento de textura de este triángulo
            const uMin = Math.min(ua.u, ub.u, uc.u);
            const vMin = Math.min(ua.v, ub.v, uc.v);
            const uMax = Math.max(ua.u, ub.u, uc.u);
            const vMax = Math.max(ua.v, ub.v, uc.v);
            const sx = Math.max(0, Math.floor(uMin * iw));
            const sy = Math.max(0, Math.floor(vMin * ih));
            const sw = Math.min(iw - sx, Math.ceil((uMax - uMin) * iw) + 2);
            const sh = Math.min(ih - sy, Math.ceil((vMax - vMin) * ih) + 2);

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2);
            ctx.closePath();
            ctx.clip();
            // Ajustar transform para el recorte UV
            ctx.transform(ma, md, mb, me, ma * sx + mb * sy + mc, md * sx + me * sy + mf);
            ctx.globalAlpha = Math.max(0.55, t.intensity * 0.72 + 0.28);
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
            ctx.globalAlpha = 1;
            ctx.restore();
          } else {
            // Triángulo degenerado — fallback a color plano
            const shade = Math.round(64 + 150 * t.intensity);
            ctx.fillStyle = `rgb(${shade - 8},${shade + 10},${shade + 22})`;
            ctx.beginPath();
            ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.lineTo(pc.x, pc.y);
            ctx.closePath();
            ctx.fill();
          }
          continue;
        }
        // Sin UV para este triángulo: caer en vertex-color o shading
      }

      if (useVertexColor) {
        // ── Vertex colors — promedio de los 3 vértices ─────────────────
        const ca = state.vertexColors[a], cb = state.vertexColors[b], cc = state.vertexColors[c];
        if (ca && cb && cc) {
          const r = Math.round(((ca.r + cb.r + cc.r) / 3) * t.intensity);
          const g = Math.round(((ca.g + cb.g + cc.g) / 3) * t.intensity);
          const bv = Math.round(((ca.b + cb.b + cc.b) / 3) * t.intensity);
          ctx.fillStyle = `rgb(${r},${g},${bv})`;
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.lineTo(pc.x, pc.y);
          ctx.closePath();
          ctx.fill();
          continue;
        }
      }

      // ── Flat shading (default) ─────────────────────────────────────
      const shade = Math.round(64 + 150 * t.intensity);
      ctx.fillStyle = `rgb(${shade - 8},${shade + 10},${shade + 22})`;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.lineTo(pc.x, pc.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function renderWireframe(projected) {
    if (!state.showWireframe || !state.edges.length) return;

    ctx.strokeStyle = '#244961';
    ctx.lineWidth = 0.85;
    ctx.globalAlpha = 0.8;

    for (const [a, b] of state.edges) {
      const pa = projected[a];
      const pb = projected[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  function renderAxesModeBadge() {
    const usingPca = state.axesMode === 'pca';
    const hasPca = Array.isArray(state.pcaAxes) && state.pcaAxes.length === 3;
    const formalLock = !!state.v2Data?.orientation_canonical?.gravitational?.formal_faces_locked;
    const longRule = state.v2Data?.orientation_canonical?.axis_definition?.longitudinal?.rule || '';

    const label = usingPca
      ? (hasPca ? 'Ejes: PCA (PC1-PC3)' : 'Ejes: PCA (pendiente)')
      : (formalLock && longRule === 'com_to_max_surface_limit'
          ? 'Ejes: Canónico XYZ (X=COM→Límite)'
          : 'Ejes: Modelo (XYZ)');

    const bg = usingPca
      ? (hasPca ? 'rgba(142, 36, 170, 0.92)' : 'rgba(142, 36, 170, 0.55)')
      : 'rgba(33, 33, 33, 0.68)';

    const fg = '#ffffff';
    ctx.save();
    ctx.font = '11px sans-serif';
    const padX = 8;
    const padY = 5;
    const textW = Math.ceil(ctx.measureText(label).width);
    const w = textW + padX * 2;
    const h = 22;
    const x = canvas.width - w - 12;
    const y = 12;

    ctx.fillStyle = bg;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = fg;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + padX, y + h / 2);
    ctx.restore();
  }

  /**
   * Gnomon de orientación 3D — esquina inferior-izquierda del canvas.
   * Tres flechas que rotan con el modelo: X (longitudinal / Distal),
   * Y (lateral / Der.), Z (normal cara / Anverso). Los semiejes que
   * apuntan hacia el espectador (nz ≥ 0) se dibujan sólidos encima;
   * los que se alejan quedan punteados y semitransparentes detrás.
   */
  function renderOrientationGnomon() {
    if (!state.vertices.length) return;

    const arm    = 52;                         // longitud de cada eje en px
    const margin = 80;
    const cx     = margin;
    const cy     = canvas.height - margin;

    // Ejes: vector unitario, color, etiqueta del extremo positivo
    const AXES = [
      { v: { x: 1, y: 0, z: 0 }, color: '#ff5252', label: 'Distal'  },
      { v: { x: 0, y: 1, z: 0 }, color: '#69f0ae', label: 'Der.'    },
      { v: { x: 0, y: 0, z: 1 }, color: '#40c4ff', label: 'Anverso' },
    ];

    // Proyección ortográfica local (arm px fijos, independiente de zoom/escala)
    const proj = AXES.map(a => {
      const rv = rotateVector(a.v);
      return {
        color: a.color,
        label: a.label,
        tx: cx + rv.x * arm,
        ty: cy - rv.y * arm,   // Y canvas invertida
        nz: rv.z,              // profundidad tras rotación
      };
    });

    ctx.save();

    // Disco de fondo
    ctx.beginPath();
    ctx.arc(cx, cy, arm + 22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10, 14, 20, 0.68)';
    ctx.fill();
    // Borde sutil
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Ordenar: ejes que se alejan (nz < 0) primero → quedan detrás
    const sorted = [...proj].sort((a, b) => a.nz - b.nz);

    sorted.forEach(({ color, label, tx, ty, nz }) => {
      const front     = nz >= 0;
      const alpha     = front ? 1.0 : 0.28;
      const lineWidth = front ? 3.0 : 1.5;
      const ang       = Math.atan2(ty - cy, tx - cx);
      const arrowS    = 9;

      ctx.globalAlpha = alpha;

      // Línea del eje
      ctx.strokeStyle = color;
      ctx.lineWidth   = lineWidth;
      ctx.setLineDash(front ? [] : [4, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);

      if (front) {
        // Punta de flecha
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - arrowS * Math.cos(ang - 0.38), ty - arrowS * Math.sin(ang - 0.38));
        ctx.lineTo(tx - arrowS * Math.cos(ang + 0.38), ty - arrowS * Math.sin(ang + 0.38));
        ctx.closePath();
        ctx.fill();

        // Sombra de texto para contraste
        const lx = tx + Math.cos(ang) * 7;
        const ly = ty + Math.sin(ang) * 7;
        ctx.font          = 'bold 10px system-ui, sans-serif';
        ctx.textAlign     = Math.cos(ang) >= 0 ? 'left' : 'right';
        ctx.textBaseline  = Math.sin(ang) >= 0 ? 'top'  : 'bottom';
        ctx.fillStyle     = 'rgba(0,0,0,0.55)';
        ctx.fillText(label, lx + 1, ly + 1);
        ctx.fillStyle     = color;
        ctx.fillText(label, lx, ly);
      }
    });

    // Punto central
    ctx.globalAlpha = 1;
    ctx.fillStyle   = 'rgba(255,255,255,0.90)';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ── Overlay de contornos canónicos ─────────────────────────────────────────
  // Los contornos ya están en espacio canónico (mean-centrados, orientados).
  // Para proyectarlos solo aplicamos rotY + rotX (rotateVector), sin centro ni
  // canonicalRotation (que ya está incorporada en los coords del backend).

  function _drawContour(pts3d, color, lineWidth, dash, alpha) {
    if (!pts3d || pts3d.length < 3) return;
    const projected = pts3d.map(v => _projectCanonicalPoint(v));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(projected[0].x, projected[0].y);
    for (let i = 1; i < projected.length; i++) {
      ctx.lineTo(projected[i].x, projected[i].y);
    }
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dash || []);
    ctx.globalAlpha = alpha != null ? alpha : 0.8;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function renderCanonicalContourOverlay() {
    if (!state.showContourOverlay || !state.metricsComputed || !state.v2Data) return;

    const mao2d     = state.v2Data.mao2d_adapted || {};
    const planes    = (mao2d.oriented_2d || {}).planes || {};
    const canonCtrs = mao2d.canonical_contours || {};
    const fb        = canonCtrs.front_back || {};

    // Secciones: morphology_canonical es la fuente canónica (misma que el panel MAO Plus)
    // mao2d_adapted.canonical_contours.transverse_sections puede estar vacío por
    // problemas de serialización; morphology_canonical siempre tiene los datos.
    const _mcSecs = state.v2Data.morphology_canonical?.transverse_sections;
    const _maoSecs = canonCtrs.transverse_sections;
    const sections = (Array.isArray(_mcSecs) && _mcSecs.length > 0)
                       ? _mcSecs
                       : (Array.isArray(_maoSecs) && _maoSecs.length > 0 ? _maoSecs : []);

    const view = state.currentView;

    // ── 1. Contornos de las caras A/B (plano XY) — visibles en front/back ────
    const frontPts = fb.front?.contour_xy || [];
    const backPts  = fb.back?.contour_xy  || [];
    if (frontPts.length >= 3)
      _drawContour(frontPts.map(([x, y]) => ({ x, y, z: 0 })),
                   '#1565c0', view === 'front' ? 2.0 : 0.8,
                   view === 'front' ? [5, 3] : [2, 4], view === 'front' ? 0.85 : 0.35);
    if (backPts.length >= 3)
      _drawContour(backPts.map(([x, y]) => ({ x, y, z: 0 })),
                   '#1b5e20', view === 'back' ? 2.0 : 0.8,
                   view === 'back'  ? [5, 3] : [2, 4], view === 'back'  ? 0.85 : 0.35);

    // ── 2. Perfil lateral XZ (mirar a lo largo de Y) ─────────────────────────
    const latPts = planes.lateral_xz?.contour || [];
    if (latPts.length >= 3)
      _drawContour(latPts.map(([x, z]) => ({ x, y: 0, z })),
                   '#bf360c',
                   (view === 'top' || view === 'bottom') ? 2.0 : 0.8,
                   (view === 'top' || view === 'bottom') ? [5, 3] : [2, 4],
                   (view === 'top' || view === 'bottom') ? 0.85 : 0.35);

    // ── 3. Sección global YZ (mirar a lo largo de X) ─────────────────────────
    const transPts = planes.transversal_yz?.contour || [];
    if (transPts.length >= 3)
      _drawContour(transPts.map(([y, z]) => ({ x: 0, y, z })),
                   '#6a1b9a',
                   (view === 'left' || view === 'right') ? 2.0 : 0.8,
                   (view === 'left' || view === 'right') ? [5, 3] : [2, 4],
                   (view === 'left' || view === 'right') ? 0.85 : 0.35);

    // ── 4. Cortes transversales YZ en sus posiciones X reales (TODAS las vistas)
    // Cada corte es un polígono en el plano YZ situado en x = x_center.
    //   · top/bottom → anillos claramente separados a lo largo del eje X (más informativos)
    //   · front/back → elipses en posiciones x distintas del canvas
    //   · left/right → contornos superpuestos (misma proyección YZ)
    if (sections.length > 0 && state.showTransverseSections) {
      const isTop   = (view === 'top'   || view === 'bottom');
      const isFront = (view === 'front' || view === 'back');
      const isSide  = (view === 'left'  || view === 'right');

      sections.forEach((sec, idx) => {
        // Preferir contour_3d (coordenadas canónicas completas, siempre ortogonal
        // a los ejes PCA del objeto) sobre contour_yz (compatibilidad legada).
        const xc = typeof sec.x_center === 'number' ? sec.x_center : 0;
        const pts3d = (Array.isArray(sec.contour_3d) && sec.contour_3d.length >= 3)
          ? sec.contour_3d.map(([cx, cy, cz]) => ({ x: cx, y: cy, z: cz }))
          : (sec.contour_yz || []).map(([y, z]) => ({ x: xc, y, z }));

        if (pts3d.length < 3) return;
        const t  = sections.length > 1 ? idx / (sections.length - 1) : 0.5;

        // Gradiente naranja (#e65100) → azul (#0277bd)
        const r = Math.round(230 - t * 228);
        const g = Math.round(101 + t * 18);
        const b = Math.round(0   + t * 189);
        const color = `rgb(${r},${g},${b})`;

        const proj = pts3d.map(v => _projectCanonicalPoint(v));

        // Grosor y opacidad según vista
        const lw    = isTop ? 1.8 : isFront ? 1.4 : 1.0;
        const alpha = isTop ? 0.85 : isFront ? 0.7 : 0.5;

        // Horadaciones: en contour_3d los huecos siguen en formato [y,z]+xc (compat)
        const _holesYZ = sec.holes_yz || [];
        const _holesProjYZ = _holesYZ
          .filter(h => h.length >= 3)
          .map(h => h.map(([y, z]) => _projectCanonicalPoint({ x: xc, y, z })));

        // Relleno semitransparente con recorte de horadaciones (evenodd)
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(proj[0].x, proj[0].y);
        for (let i = 1; i < proj.length; i++) ctx.lineTo(proj[i].x, proj[i].y);
        ctx.closePath();
        _holesProjYZ.forEach(hP => {
          ctx.moveTo(hP[0].x, hP[0].y);
          for (let i = 1; i < hP.length; i++) ctx.lineTo(hP[i].x, hP[i].y);
          ctx.closePath();
        });
        ctx.fillStyle = color;
        ctx.globalAlpha = isTop ? 0.12 : isFront ? 0.08 : 0.05;
        ctx.fill('evenodd');
        ctx.restore();

        // Contorno
        _drawContour(pts3d, color, lw, isTop ? [4, 2] : isFront ? [3, 2] : [2, 3], alpha);

        // Piezas exteriores (fragmentos del mismo objeto — mismo color, ligeramente más fino)
        const _extYZ = sec.exterior_pieces_yz || [];
        _extYZ.forEach(piece => {
          if (piece.length < 3) return;
          const pPts3d = piece.map(([y, z]) => ({ x: xc, y, z }));
          // Relleno igual que outer
          const pProj = pPts3d.map(v => _projectCanonicalPoint(v));
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(pProj[0].x, pProj[0].y);
          for (let i = 1; i < pProj.length; i++) ctx.lineTo(pProj[i].x, pProj[i].y);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.globalAlpha = isTop ? 0.12 : isFront ? 0.08 : 0.05;
          ctx.fill();
          ctx.restore();
          _drawContour(pPts3d, color, lw * 0.8, isTop ? [4, 2] : isFront ? [3, 2] : [2, 3], alpha);
        });
        // Horadaciones/perforaciones de la sección transversal
        _holesYZ.forEach(hole => {
          if (hole.length < 3) return;
          const hPts3d = hole.map(([y, z]) => ({ x: xc, y, z }));
          _drawContour(hPts3d, '#e53935', 1.2, [3, 3], alpha * 0.9);
        });
      });
    }

    // ── 5. Cortes coronales XZ en sus posiciones Y reales
    // Cada corte es un plano horizontal a y = y_center; contorno en plano XZ.
    //   · front/back → bandas horizontales bien separadas (más informativas)
    //   · left/right → elipses en posiciones y distintas
    //   · top/bottom → contornos superpuestos (misma proyección XZ)
    const _mcCorSecs = state.v2Data.morphology_canonical?.coronal_sections;
    const coronalSections = Array.isArray(_mcCorSecs) && _mcCorSecs.length > 0 ? _mcCorSecs : [];

    if (coronalSections.length > 0 && state.showCoronalSections) {
      const isTop   = (view === 'top'   || view === 'bottom');
      const isFront = (view === 'front' || view === 'back');
      const isSide  = (view === 'left'  || view === 'right');

      coronalSections.forEach((sec, idx) => {
        const yc = typeof sec.y_center === 'number' ? sec.y_center : 0;
        const pts3d = (Array.isArray(sec.contour_3d) && sec.contour_3d.length >= 3)
          ? sec.contour_3d.map(([cx, cy, cz]) => ({ x: cx, y: cy, z: cz }))
          : (sec.contour_xz || []).map(([x, z]) => ({ x, y: yc, z }));
        if (pts3d.length < 3) return;
        const t  = coronalSections.length > 1 ? idx / (coronalSections.length - 1) : 0.5;

        // Gradiente verde (#2e7d32) → violeta (#6a1b9a)
        const r = Math.round(46  + t * 60);
        const g = Math.round(125 - t * 98);
        const b = Math.round(50  + t * 104);
        const color = `rgb(${r},${g},${b})`;

        const proj  = pts3d.map(v => _projectCanonicalPoint(v));

        const lw    = isFront ? 1.8 : isSide ? 1.4 : 1.0;
        const alpha = isFront ? 0.85 : isSide ? 0.7 : 0.5;

        // Horadaciones en formato legado [x,z]+yc (compat)
        const _holesXZ = sec.holes_xz || [];
        const _holesProjXZ = _holesXZ
          .filter(h => h.length >= 3)
          .map(h => h.map(([x, z]) => _projectCanonicalPoint({ x, y: yc, z })));

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(proj[0].x, proj[0].y);
        for (let i = 1; i < proj.length; i++) ctx.lineTo(proj[i].x, proj[i].y);
        ctx.closePath();
        _holesProjXZ.forEach(hP => {
          ctx.moveTo(hP[0].x, hP[0].y);
          for (let i = 1; i < hP.length; i++) ctx.lineTo(hP[i].x, hP[i].y);
          ctx.closePath();
        });
        ctx.fillStyle = color;
        ctx.globalAlpha = isFront ? 0.12 : isSide ? 0.08 : 0.05;
        ctx.fill('evenodd');
        ctx.restore();

        _drawContour(pts3d, color, lw, isFront ? [4, 2] : isSide ? [3, 2] : [2, 3], alpha);

        // Piezas exteriores de la sección coronal
        const _extXZ = sec.exterior_pieces_xz || [];
        _extXZ.forEach(piece => {
          if (piece.length < 3) return;
          const pPts3d = piece.map(([x, z]) => ({ x, y: yc, z }));
          const pProj = pPts3d.map(v => _projectCanonicalPoint(v));
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(pProj[0].x, pProj[0].y);
          for (let i = 1; i < pProj.length; i++) ctx.lineTo(pProj[i].x, pProj[i].y);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.globalAlpha = isFront ? 0.12 : isSide ? 0.08 : 0.05;
          ctx.fill();
          ctx.restore();
          _drawContour(pPts3d, color, lw * 0.8, isFront ? [4, 2] : isSide ? [3, 2] : [2, 3], alpha);
        });
        // Horadaciones/perforaciones de la sección coronal
        _holesXZ.forEach(hole => {
          if (hole.length < 3) return;
          const hPts3d = hole.map(([x, z]) => ({ x, y: yc, z }));
          _drawContour(hPts3d, '#e53935', 1.2, [3, 3], alpha * 0.9);
        });
      });
    }

    // ── 6. Cortes frontales XY en sus posiciones Z reales
    // Cada corte es un plano a z = z_center; contorno en plano XY.
    //   · front/back → silueta de la pieza a cada profundidad Z (más informativo)
    //   · top/bottom → elipses a distintas profundidades
    //   · left/right → líneas a distintos Z
    const _mcFrSecs = state.v2Data.morphology_canonical?.frontal_sections;
    const frontalSections = Array.isArray(_mcFrSecs) && _mcFrSecs.length > 0 ? _mcFrSecs : [];

    if (frontalSections.length > 0 && state.showFrontalSections) {
      const isTop   = (view === 'top'   || view === 'bottom');
      const isFront = (view === 'front' || view === 'back');

      frontalSections.forEach((sec, idx) => {
        const zc = typeof sec.z_center === 'number' ? sec.z_center : 0;
        const pts3d = (Array.isArray(sec.contour_3d) && sec.contour_3d.length >= 3)
          ? sec.contour_3d.map(([cx, cy, cz]) => ({ x: cx, y: cy, z: cz }))
          : (sec.contour_xy || []).map(([x, y]) => ({ x, y, z: zc }));
        if (pts3d.length < 3) return;
        const t  = frontalSections.length > 1 ? idx / (frontalSections.length - 1) : 0.5;

        // Gradiente dorado (#c27c1e) → pizarra azul (#2e98b9) — igual que frontalColor del panel
        const r = Math.round(194 - t * 148);
        const g = Math.round(124 + t * 28);
        const b = Math.round(30  + t * 155);
        const color = `rgb(${r},${g},${b})`;

        const proj  = pts3d.map(v => _projectCanonicalPoint(v));

        const lw    = isFront ? 1.8 : isTop ? 1.4 : 1.0;
        const alpha = isFront ? 0.85 : isTop ? 0.7 : 0.5;

        // Horadaciones: recoger antes del fill para recorte evenodd
        const _holesXY = sec.holes_xy || [];
        const _holesProjXY = _holesXY
          .filter(h => h.length >= 3)
          .map(h => h.map(([x, y]) => _projectCanonicalPoint({ x, y, z: zc })));

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(proj[0].x, proj[0].y);
        for (let i = 1; i < proj.length; i++) ctx.lineTo(proj[i].x, proj[i].y);
        ctx.closePath();
        _holesProjXY.forEach(hP => {
          ctx.moveTo(hP[0].x, hP[0].y);
          for (let i = 1; i < hP.length; i++) ctx.lineTo(hP[i].x, hP[i].y);
          ctx.closePath();
        });
        ctx.fillStyle = color;
        ctx.globalAlpha = isFront ? 0.12 : isTop ? 0.08 : 0.05;
        ctx.fill('evenodd');
        ctx.restore();

        _drawContour(pts3d, color, lw, isFront ? [4, 2] : isTop ? [3, 2] : [2, 3], alpha);

        // Piezas exteriores de la sección frontal
        const _extXY = sec.exterior_pieces_xy || [];
        _extXY.forEach(piece => {
          if (piece.length < 3) return;
          const pPts3d = piece.map(([x, y]) => ({ x, y, z: zc }));
          const pProj = pPts3d.map(v => _projectCanonicalPoint(v));
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(pProj[0].x, pProj[0].y);
          for (let i = 1; i < pProj.length; i++) ctx.lineTo(pProj[i].x, pProj[i].y);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.globalAlpha = isFront ? 0.12 : isTop ? 0.08 : 0.05;
          ctx.fill();
          ctx.restore();
          _drawContour(pPts3d, color, lw * 0.8, isFront ? [4, 2] : isTop ? [3, 2] : [2, 3], alpha);
        });
        // Horadaciones/perforaciones de la sección frontal
        _holesXY.forEach(hole => {
          if (hole.length < 3) return;
          const hPts3d = hole.map(([x, y]) => ({ x, y, z: zc }));
          _drawContour(hPts3d, '#e53935', 1.2, [3, 3], alpha * 0.9);
        });
      });
    }

    if (sections.length > 0 || coronalSections.length > 0 || frontalSections.length > 0) {
      ctx.save();
      ctx.font = '10px sans-serif';
      ctx.fillStyle = 'rgba(100,100,100,0.8)';
      ctx.globalAlpha = 0.7;
      const legendParts = [];
      if (sections.length > 0)        legendParts.push(`${sections.length} transv.`);
      if (coronalSections.length > 0) legendParts.push(`${coronalSections.length} cor.`);
      if (frontalSections.length > 0) legendParts.push(`${frontalSections.length} front.`);
      ctx.fillText(legendParts.join(' · '), 8, canvas.height - 8);
      ctx.restore();
    }
  }
  // ── fin overlay ────────────────────────────────────────────────────────────

  function render() {
    clearCanvas();

    if (!state.vertices.length) {
      ctx.fillStyle = '#55606a';
      ctx.font = '13px sans-serif';
      ctx.fillText('Cargue un archivo OBJ para visualizar el modelo.', 16, 24);
      return;
    }

    const rotated = state.vertices.map(rotatePoint);
    const projected = rotated.map(projectPoint);

    renderFaces(rotated, projected);
    renderWireframe(projected);

    if (state.userMorphAnchorIndex !== null && projected[state.userMorphAnchorIndex]) {
      const p = projected[state.userMorphAnchorIndex];
      ctx.save();
      ctx.strokeStyle = '#ff8f00';
      ctx.fillStyle = '#ffca28';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#5d4037';
      ctx.fillText('Ancla morfol.', p.x + 10, p.y - 8);
      ctx.restore();
    }

    renderAxes();
    renderAxesModeBadge();
    renderOrientationGnomon();
    if (state.showDepthColor    && state._cmDistances)   _renderDepthColorbar();
    if (state.showRoughnessColor && state._normalVariance) _renderRoughnessColorbar();
    renderCanonicalContourOverlay();

    ctx.fillStyle = '#3f4c58';
    ctx.font = '11px sans-serif';
    ctx.fillText(`Vertices: ${state.vertices.length.toLocaleString()} | Caras: ${state.faces.toLocaleString()} | Aristas: ${state.edges.length.toLocaleString()}`, 12, 18);

    // Sincroniza el input de zoom con el estado actual
    if (zoomPctInput && document.activeElement !== zoomPctInput) {
      zoomPctInput.value = Math.round(state.zoom * 100);
    }
  }

  function fitView() {
    if (!state.bbox) return;
    const targetPx = Math.min(canvas.width, canvas.height) * 0.43;
    if (state.projectionMode === 'orthographic') {
      state.scale = targetPx / state.bbox.maxDim;
    } else {
      const focal = 670;
      const dist = 3.2;
      const perspFactor = focal / dist;
      state.scale = targetPx / (state.bbox.maxDim * perspFactor);
    }
    state.zoom = 1.4;
  }

  function resetView() {
    const formalLock = !!state.v2Data?.orientation_canonical?.gravitational?.formal_faces_locked;
    if (formalLock) {
      applyPredefinedView('front');
      return;
    }
    applyPredefinedView('isometric');
  }

  function normalizeViewName(rawViewName) {
    const key = String(rawViewName || '').trim().toLowerCase();
    const aliases = {
      f: 'front',
      front: 'front',
      frontal: 'front',
      b: 'back',
      back: 'back',
      rear: 'back',
      l: 'left',
      left: 'left',
      r: 'right',
      right: 'right',
      t: 'top',
      top: 'top',
      u: 'top',
      bot: 'bottom',
      bottom: 'bottom',
      down: 'bottom',
      d: 'bottom',
      iso: 'isometric',
      isometric: 'isometric',
    };
    return aliases[key] || 'isometric';
  }

  function describeViewSemantics(viewName) {
    const map = {
      front:     'Cara — Anverso activo (+Z canónico): cara A / dorsal, longitud × anchura.',
      back:      'Cara — Reverso activo (−Z canónico): cara B / ventral, longitud × anchura.',
      top:       'Perfil I activo (+Y→−Y): perfil completo longitud × espesor — forma del borde y curvatura, sin corte.',
      bottom:    'Perfil D activo (−Y→+Y): perfil completo desde el lado opuesto, longitud × espesor, sin corte.',
      left:      'Sección Distal activa (+X): sección transversal desde la punta / filo — anchura × espesor.',
      right:     'Sección Proximal activa (−X): sección transversal desde el talón / base — anchura × espesor.',
      isometric: 'Vista Iso activa — exploración libre: arrastre para orbitar, rueda para zoom.',
    };
    return map[viewName] || 'Vista actualizada.';
  }

  function getAutomaticCanonicalView(obj3dPayload) {
    const canonical = obj3dPayload?.orientation_canonical || {};
    const mao2d = obj3dPayload?.mao2d_adapted || {};
    const frontBackPlane = mao2d?.front_back_reference?.plane;
    const formalFacesLocked = !!canonical?.gravitational?.formal_faces_locked;
    const orientationMethod = String(canonical?.method || '').toLowerCase();

    // Regla principal del sistema: FRONT/BACK son las caras de orientación.
    if (formalFacesLocked || frontBackPlane === 'frontal_xy' || orientationMethod.includes('faces_dominant')) {
      return 'front';
    }

    // Incluso cuando el cálculo base usa auto_visual o contorno,
    // la presentación primaria debe conservar FRONT como lectura esperada.
    return 'front';
  }

  function renderMaoPlusMorphologyModule(canonicalMorph) {
    const cm = canonicalMorph || {};
    const status = String(cm?.status || 'no_data');
    const idx = cm?.mao_plus_indices || {};
    const quality = cm?.quality || {};
    const sections = Array.isArray(cm?.transverse_sections) ? cm.transverse_sections : [];
    const sectionPreview = sections.slice(0, 6);

    const rowHtml = sectionPreview.length
      ? sectionPreview.map((s) => {
          const m = s?.metrics || {};
          const d = s?.section_dims || {};
          return `<tr>
            <td style="padding:4px 6px;border-bottom:1px solid #eceff1;">${Number.isFinite(Number(s?.index)) ? Number(s.index) : '-'}</td>
            <td style="padding:4px 6px;border-bottom:1px solid #eceff1;">${fmt(s?.x_relative, 3)}</td>
            <td style="padding:4px 6px;border-bottom:1px solid #eceff1;">${fmt(m?.area, 4)}</td>
            <td style="padding:4px 6px;border-bottom:1px solid #eceff1;">${fmt(d?.thickness_z, 4)}</td>
            <td style="padding:4px 6px;border-bottom:1px solid #eceff1;">${Number.isFinite(Number(s?.point_count)) ? Number(s.point_count) : 0}</td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="5" style="padding:6px 6px;color:#78909c;">Sin secciones válidas.</td></tr>`;

    const qualityRatio = Number(quality?.valid_ratio);
    const qualityBadge = Number.isFinite(qualityRatio)
      ? (qualityRatio >= 0.75 ? '✅ cobertura alta' : (qualityRatio >= 0.5 ? '⚠️ cobertura media' : '❗ cobertura baja'))
      : '—';

    return [
      `<section class="obj3d-section-card">`,
      `<div class="obj3d-section-top">`,
      `<div>`,
      `<div class="obj3d-section-title">Módulo MAO Plus · morfología canónica</div>`,
      `<div class="obj3d-section-subtitle">Lectura equivalente a MAO Plus monofacial/bifacial, pero homologada sobre objeto 3D.</div>`,
      `</div>`,
      `<div class="obj3d-chip-row">`,
      `<span class="obj3d-chip ${qualityRatio >= 0.75 ? 'obj3d-chip--green' : qualityRatio >= 0.5 ? 'obj3d-chip--amber' : 'obj3d-chip--red'}">${qualityBadge}</span>`,
      `<span class="obj3d-chip obj3d-chip--slate">estado ${status}</span>`,
      `</div>`,
      `</div>`,
      `<div class="obj3d-grid-3">`,
      `<div class="obj3d-mini-card"><div class="obj3d-mini-label">Homología bifacial</div><div class="obj3d-mini-value">${fmt(idx?.bifacial_homology_index, 4)}</div><div class="obj3d-mini-meta">índice principal MAO 3D</div></div>`,
      `<div class="obj3d-mini-card"><div class="obj3d-mini-label">CV área</div><div class="obj3d-mini-value">${fmt(idx?.transverse_area_cv, 4)}</div><div class="obj3d-mini-meta">variación longitudinal</div></div>`,
      `<div class="obj3d-mini-card"><div class="obj3d-mini-label">CV espesor</div><div class="obj3d-mini-value">${fmt(idx?.transverse_thickness_cv, 4)}</div><div class="obj3d-mini-meta">regularidad de secciones</div></div>`,
      `</div>`,
      `<div class="obj3d-table-wrap" style="margin-top:8px;">`,
      `<table class="obj3d-table">`,
      `<thead><tr><th>#</th><th>x_rel</th><th>área</th><th>espesor_z</th><th>pts</th></tr></thead>`,
      `<tbody>${rowHtml}</tbody>`,
      `</table>`,
      `</div>`,
      `${sections.length > sectionPreview.length ? `<div class="obj3d-note">Mostrando ${sectionPreview.length} de ${sections.length} secciones transversales válidas.</div>` : ''}`,
      `</section>`,
    ].join('');
  }

  function renderPcaSequentialModule(pcaSequential) {
    const ps = pcaSequential || {};
    const overall = ps?.overall || {};
    const axes = ps?.axes || {};

    const axisOrder = ['pc1', 'pc2', 'pc3'];
    const rows = axisOrder.map((ax) => {
      const a = axes?.[ax] || {};
      const s = a?.summary || {};
      const p = a?.procrustes || {};
      return `<tr>
        <td style="padding:4px 6px;border-bottom:1px solid #eceff1;"><strong>${ax.toUpperCase()}</strong></td>
        <td style="padding:4px 6px;border-bottom:1px solid #eceff1;">${a?.status || '-'}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #eceff1;">${Number.isFinite(Number(s?.count)) ? Number(s.count) : 0}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #eceff1;">${fmt(p?.mean_similarity, 4)}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #eceff1;">${p?.consistency_level || '-'}</td>
      </tr>`;
    }).join('');

    return [
      `<section class="obj3d-section-card">`,
      `<div class="obj3d-section-top">`,
      `<div>`,
      `<div class="obj3d-section-title">Secuencial PCA + Procrustes</div>`,
      `<div class="obj3d-section-subtitle">Evalúa estabilidad de forma entre secciones consecutivas en PC1, PC2 y PC3.</div>`,
      `</div>`,
      `<div class="obj3d-chip-row"><span class="obj3d-chip obj3d-chip--blue">${overall?.consistency_level || '-'}</span></div>`,
      `</div>`,
      `<div class="obj3d-grid-2">`,
      `<div class="obj3d-mini-card"><div class="obj3d-mini-label">Similitud global</div><div class="obj3d-mini-value">${fmt(overall?.mean_procrustes_similarity, 4)}</div><div class="obj3d-mini-meta">media Procrustes entre secciones</div></div>`,
      `<div class="obj3d-mini-card"><div class="obj3d-mini-label">Ejes con datos</div><div class="obj3d-mini-value">${Number.isFinite(Number(overall?.axes_with_data)) ? Number(overall.axes_with_data) : 0}/3</div><div class="obj3d-mini-meta">cobertura secuencial útil</div></div>`,
      `</div>`,
      `<div class="obj3d-table-wrap" style="margin-top:8px;">`,
      `<table class="obj3d-table">`,
      `<thead><tr><th>eje</th><th>estado</th><th>secciones</th><th>simil.</th><th>nivel</th></tr></thead>`,
      `<tbody>${rows}</tbody>`,
      `</table>`,
      `</div>`,
      `</section>`,
    ].join('');
  }

  function renderHomologation3DModule(homologation3d) {
    const h = homologation3d || {};
    const hs = h?.homologation || {};
    const sig = h?.signature || {};
    const quality = h?.quality || {};

    return [
      `<section class="obj3d-section-card">`,
      `<div class="obj3d-section-top">`,
      `<div>`,
      `<div class="obj3d-section-title">Homologación 3D</div>`,
      `<div class="obj3d-section-subtitle">Firma comparable para contraste inter-objeto, como en MAO Plus pero sobre semántica 3D.</div>`,
      `</div>`,
      `<div class="obj3d-chip-row">`,
      `<span class="obj3d-chip ${hs?.is_comparable ? 'obj3d-chip--green' : 'obj3d-chip--amber'}">${hs?.is_comparable ? 'comparable' : 'a revisar'}</span>`,
      `<span class="obj3d-chip obj3d-chip--blue">${hs?.level || '-'}</span>`,
      `</div>`,
      `</div>`,
      `<div class="obj3d-grid-2">`,
      `<div class="obj3d-mini-card"><div class="obj3d-mini-label">Modelo</div><div class="obj3d-mini-value">${h?.model || '-'}</div><div class="obj3d-mini-meta">versión de homologación</div></div>`,
      `<div class="obj3d-mini-card"><div class="obj3d-mini-label">Score homologación</div><div class="obj3d-mini-value">${fmt(hs?.score, 4)}</div><div class="obj3d-mini-meta">nivel ${hs?.level || '-'}</div><div class="obj3d-score-track"><div class="obj3d-score-fill ${hs?.score >= 0.85 ? 'obj3d-score-fill--green' : hs?.score >= 0.7 ? 'obj3d-score-fill--blue' : hs?.score >= 0.5 ? 'obj3d-score-fill--amber' : 'obj3d-score-fill--red'}" style="width:${Math.max(0, Math.min(100, Number(hs?.score || 0) * 100))}%;"></div></div></div>`,
      `</div>`,
      `<div class="obj3d-grid-3" style="margin-top:8px;">`,
      `<div class="obj3d-mini-card"><div class="obj3d-mini-label">Firma bifacial</div><div class="obj3d-mini-value">${fmt(sig?.bifacial_homology, 3)}</div></div>`,
      `<div class="obj3d-mini-card"><div class="obj3d-mini-label">Coherencia 2D↔3D</div><div class="obj3d-mini-value">${fmt(sig?.coherence_2d_3d, 3)}</div></div>`,
      `<div class="obj3d-mini-card"><div class="obj3d-mini-label">Procrustes PCA</div><div class="obj3d-mini-value">${fmt(sig?.procrustes_pca_seq, 3)}</div></div>`,
      `</div>`,
      `<div class="obj3d-note">Calidad de homologación: secciones ${Number.isFinite(Number(quality?.valid_sections)) ? Number(quality.valid_sections) : 0}/${Number.isFinite(Number(quality?.requested_sections)) ? Number(quality.requested_sections) : 0} · ratio ${fmt(quality?.valid_ratio, 3)}.</div>`,
      `</section>`,
    ].join('');
  }

  function getToneClassFromScore(score, good = 0.8, medium = 0.6) {
    const n = Number(score);
    if (!Number.isFinite(n)) return 'obj3d-pill--slate';
    if (n >= good) return 'obj3d-pill--green';
    if (n >= medium) return 'obj3d-pill--blue';
    if (n >= 0.4) return 'obj3d-pill--amber';
    return 'obj3d-pill--red';
  }

  function getToneClassFromBoolean(flag) {
    return flag ? 'obj3d-pill--green' : 'obj3d-pill--amber';
  }

  function applyPredefinedView(viewName) {
    /**
     * Aplica rotaciones predefinidas según la orientación canónica detectada.
     * Las vistas están definidas respecto al sistema canónico (X, Y, Z).
     */
    fitView();
    const normalizedView = normalizeViewName(viewName);
    state.currentView = normalizedView;

    // Si tenemos rotación canónica, aplicarla como base
    // Luego componer con la vista predefinida
    switch (normalizedView) {
      case 'front':
        // Frontal canónica: cara B (+Z) hacia el observador.
        // Convención del visor: mayor Z proyectado = más cerca de cámara.
        state.rotX = 0;
        state.rotY = 0;
        break;
      case 'back':
        // Trasera canónica: cara A (-Z) hacia el observador.
        state.rotX = 0;
        state.rotY = Math.PI;
        break;
      case 'left':
        // Lateral izquierdo: mirando hacia +X
        state.rotX = 0;
        state.rotY = Math.PI / 2;
        break;
      case 'right':
        // Lateral derecho: mirando hacia -X
        state.rotX = 0;
        state.rotY = -Math.PI / 2;
        break;
      case 'top':
        // Superior: cámara sobre +Y mirando hacia -Y
        state.rotX = -Math.PI / 2;
        state.rotY = 0;
        break;
      case 'bottom':
        // Inferior: cámara bajo -Y mirando hacia +Y
        state.rotX = Math.PI / 2;
        state.rotY = 0;
        break;
      case 'isometric':
      default:
        state.rotX = -0.45;
        state.rotY = 0.6;
        break;
    }
    // Retroalimentación visual: resaltar botón de vista activo
    document.querySelectorAll('.obj3d-view-btn').forEach(function(btn) {
      const isActive = btn.dataset.view === normalizedView;
      btn.classList.toggle('btn-view-active', isActive);
      btn.classList.toggle('btn-muted', !isActive);
    });

    const noCanonical = !state.metricsComputed && normalizedView !== 'isometric';
    const statusMsg = describeViewSemantics(normalizedView) +
      (noCanonical ? ' \u26a0 Sin orientación canónica — calcule métricas PCA primero.' : '');
    setStatus(statusMsg);
    render();
  }

  function updateBasicInfo() {
    if (!state.bbox) {
      basicInfoEl.textContent = 'Sin datos cargados.';
      return;
    }

    const b = state.bbox;
    basicInfoEl.innerHTML = [
      `<div><strong>Vértices:</strong> ${state.vertices.length.toLocaleString()}</div>`,
      `<div><strong>Caras:</strong> ${state.faces.toLocaleString()}</div>`,
      `<div><strong>Aristas únicas:</strong> ${state.edges.length.toLocaleString()}</div>`,
      `<div><strong>BBox Δ:</strong> (${fmt(b.dx, 3)}, ${fmt(b.dy, 3)}, ${fmt(b.dz, 3)}) ${state.unitLabel || 'u3d'}</div>`,
      `<div><strong>Unidad:</strong> ${state.unitLabel || 'u3d'}${(state.mmPerUnit && state.mmPerUnit !== 1.0) ? ' (\xD7' + state.mmPerUnit + ')' : ''}</div>`,
      `<div><strong>Proyección:</strong> ${state.projectionMode === 'orthographic' ? 'ortográfica' : 'perspectiva'}</div>`,
      `<div><strong>Ejes:</strong> ${state.axesMode === 'pca' ? (state.pcaAxes ? 'PCA (PC1-PC3)' : 'PCA (pendiente de cálculo)') : 'modelo XYZ'}</div>`,
      `<div><strong>Vista:</strong> ${state.showFaces ? 'caras' : ''}${state.showFaces && state.showWireframe ? ' + ' : ''}${state.showWireframe ? 'wireframe' : ''}</div>`,
    ].join('');
  }

  function exportCanvasPng() {
    if (!state.vertices.length) {
      setStatus('No hay modelo 3D para exportar.', true);
      return;
    }

    try {
      const ident = getAssignedIdentification();
      const fileBase = ident?.valor
        ? sanitizeLike2D(ident.valor)
        : (getObj3dFileBaseName() || 'obj3d');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${fileBase}_visor3d_${stamp}.png`;
      const dataUrl = canvas.toDataURL('image/png');

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setStatus(`PNG exportado: ${filename}`);
    } catch (err) {
      console.error('[OBJ3D] Error exportando PNG:', err);
      setStatus('No se pudo exportar PNG del visor.', true);
    }
  }

  function getAssignedIdentification() {
    const getId = window._maoGetIdentificacion;
    if (typeof getId !== 'function') return null;
    const ident = getId();
    if (!ident || !ident.bloqueada || !ident.valor) return null;
    return ident;
  }

  function getEffectiveIdentification() {
    const assigned = getAssignedIdentification();
    if (assigned) return assigned;

    const base = getObj3dFileBaseName();
    if (!base) return null;
    const autoName = sanitizeLike2D(base) || 'objeto3d';
    return {
      tipo: 'auto_obj3d',
      bloqueada: true,
      valor: autoName,
      nombre: autoName,
      autoGenerada: true,
    };
  }

  function sanitizeLike2D(value) {
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function getObj3dFileBaseName() {
    return state.file?.name ? state.file.name.replace(/\.[^.]+$/, '') : '';
  }

  window._maoGetObj3dFileBaseName = getObj3dFileBaseName;

  function toSafeNumber(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function buildObj3dHomologatedRecord({ includeImages = true, timestamp = null } = {}) {
    if (!state.file || !state.bbox) return null;
    const ident = getEffectiveIdentification();
    if (!ident) return { error: 'identificacion' };

    const nowIso = timestamp || new Date().toISOString();
    const idObjeto = sanitizeLike2D(ident.valor) || 'objeto3d';

    // ── Usar FRONT/BACK si disponible (homologación pura 2D) ───────────
    const frontBackData = state.front_back_homologated_data;
    if (frontBackData && frontBackData.status === 'ok') {
      const carAnverso = frontBackData.cara_anverso || {};
      const carReverso = frontBackData.cara_reverso || {};
      const bifacialIdx = frontBackData.bifacial_index || 0;

      // Extraer 55 métricas de ambas caras
      const metricasCompat = {
        // Información bifacial
        cara_anverso: { ...carAnverso },
        cara_reverso: { ...carReverso },
        bifacial_index: bifacialIdx,
        
        // Métricas 2D principales (promedio de caras)
        forma_detectada: carAnverso.forma_detectada || 'obj3d_bifacial',
        area: toSafeNumber(carAnverso.area, 0),
        perimeter: toSafeNumber(carAnverso.perimeter, 0),
        circularity: (toSafeNumber(carAnverso.circularity, 0) + toSafeNumber(carReverso.circularity, 0)) / 2,
        solidity: (toSafeNumber(carAnverso.solidity, 0) + toSafeNumber(carReverso.solidity, 0)) / 2,
        elongation: (toSafeNumber(carAnverso.elongation, 0) + toSafeNumber(carReverso.elongation, 0)) / 2,
        aspect_ratio: toSafeNumber(carAnverso.aspect_ratio_tight, 0),
        rectangularity: toSafeNumber(carAnverso.rectangularity, 0),
        compactness: toSafeNumber(carAnverso.compactness, 0),
        
        // Convex hull
        convex_hull_area: toSafeNumber(carAnverso.convex_hull_area, 0),
        convex_hull_perimeter: toSafeNumber(carAnverso.convex_hull_perimeter, 0),
        
        // Ejes
        excentricidad: toSafeNumber(carAnverso.excentricidad, 0),
        eje_mayor: toSafeNumber(carAnverso.eje_mayor, 0),
        eje_menor: toSafeNumber(carAnverso.eje_menor, 0),
        angulo_eje_principal: toSafeNumber(carAnverso.angulo_eje_principal, 0),
        
        // Simetría bilateral (frontal-reverso)
        simetria_bilateral: bifacialIdx,
        
        // Curvatura y rugosidad
        curvatura_media: toSafeNumber(carAnverso.curvatura_media, 0),
        curvatura_maxima: toSafeNumber(carAnverso.curvatura_maxima, 0),
        rugosidad_contorno: toSafeNumber(carAnverso.rugosidad_contorno, 0),
        
        // Feret
        feret_max: toSafeNumber(carAnverso.feret_max, 0),
        feret_min: toSafeNumber(carAnverso.feret_min, 0),
        feret_ratio: toSafeNumber(carAnverso.feret_ratio, 0),
        
        // Radios
        radio_maximo: toSafeNumber(carAnverso.radio_maximo, 0),
        radio_minimo: toSafeNumber(carAnverso.radio_minimo, 0),
        radio_medio: toSafeNumber(carAnverso.radio_medio, 0),
        
        // Índices derivados
        indice_estrellamiento: toSafeNumber(carAnverso.indice_estrellamiento, 0),
        indice_lobularidad: toSafeNumber(carAnverso.indice_lobularidad, 0),
        fractal_dimension: toSafeNumber(carAnverso.fractal_dimension, 0),
        
        // Clasificación
        forma_categoria: carAnverso.forma_categoria || 'Irregular',
        homologacion_metodo: 'front_back_projection_xy_55_metricas',
        analysis_method: 'OBJ3D + FRONT/BACK 2D HOMOLOGATED',
        analysis_timestamp: nowIso,
      };

      const base = {
        id: idObjeto,
        nombreObjeto: ident.valor,
        numeroObjeto: null,
        cara: null,
        modo: 'obj3d',
        tipoAnalisis: 'obj3d_bifacial_homologated',
        timestamp: nowIso,
        homologacion_guardado: {
          schema: 'mao_plus.storage.bifacial_homologated.v1',
          source_mode: 'obj3d',
          target_mode: '2d_compatible_bifacial',
          method: 'front_back_metrics_homologation',
          metricas_por_cara: 55,
        },
        identificacion: {
          tipo: ident.tipo || 'campos',
          nombre: ident.valor,
          valor: ident.valor,
          cara: null,
        },
        escala: state.mmPerUnit || 1,
        unidades: state.unitLabel || 'u3d',
        metricas: metricasCompat,
        perforaciones: [],
        horadaciones: [],
        elementosGeometricos: {
          contorno: {
            anverso: frontBackData.cara_anverso?.contour_points || [],
            reverso: frontBackData.cara_reverso?.contour_points || [],
          },
          convexHull: {},
          boundingBox: {
            minX: state.bbox.minX,
            minY: state.bbox.minY,
            maxX: state.bbox.maxX,
            maxY: state.bbox.maxY,
            minZ: state.bbox.minZ,
            maxZ: state.bbox.maxZ,
          },
          centroides: {
            centroideHull: [state.center.x, state.center.y, state.center.z],
          },
          ejes: {},
          radios: {},
        },
        obj3d: {
          archivo: state.file.name,
          vertices: state.vertices.length,
          aristas: state.edges.length,
          caras: state.faces,
          bbox: state.bbox,
          bifacial_data: frontBackData,
          backend_result: state.lastMetrics,
        },
      };

      if (!includeImages) return base;

      const canvasSnapshot = canvas.toDataURL('image/png');
      return {
        ...base,
        imagenRecortada: canvasSnapshot,
        canvasImgenes: {
          morphological: canvasSnapshot,
        },
        imagenes: {
          recortada: canvasSnapshot,
        },
      };
    }

    // ── Fallback: Usar datos PCA 3D originales (si front-back no disponible) ───
    const p = state.lastMetrics?.obj3d || state.lastMetrics || {};
    const comparatorReady = state.lastMetrics?.comparator_ready || null;
    const eigen = Array.isArray(p.eigenvalues) ? p.eigenvalues : [];
    const faces = p.faces || {};
    const bif = faces.bifacial_index || {};
    const orient = p.orientation || {};

    const metricasCompat = {
      forma_detectada: 'obj3d_pca',
      area: toSafeNumber(p.bbox_volume, 0),
      perimeter: 0,
      circularity: toSafeNumber(p.sphericity, 0),
      solidity: 1,
      // Sin homologación FRONT/BACK no hay elongación 2D estricta; evitar mezclar con linealidad PCA.
      elongation: 0,
      aspect_ratio: state.bbox.dy > 0 ? toSafeNumber(state.bbox.dx / state.bbox.dy, 0) : 0,
      bbox_volume: toSafeNumber(p.bbox_volume, 0),
      linearity: toSafeNumber(p.linearity, 0),
      planarity: toSafeNumber(p.planarity, 0),
      sphericity: toSafeNumber(p.sphericity, 0),
      anisotropy: toSafeNumber(p.anisotropy, 0),
      eigen_1: toSafeNumber(eigen[0], 0),
      eigen_2: toSafeNumber(eigen[1], 0),
      eigen_3: toSafeNumber(eigen[2], 0),
      analysis_level: p.analysis_level || 'pca',
      mode_3d: faces.mode || 'indeterminado',
      bifacial_index: toSafeNumber(bif.value, 0),
      orientation_confidence: toSafeNumber(orient.confidence, 0),
      analysis_method: 'OBJ3D + PCA',
      analysis_timestamp: nowIso,
      ...(comparatorReady?.metricas || {}),
    };

    const base = {
      id: idObjeto,
      nombreObjeto: ident.valor,
      numeroObjeto: null,
      cara: null,
      modo: 'obj3d',
      tipoAnalisis: 'obj3d',
      timestamp: nowIso,
      homologacion_guardado: {
        schema: 'mao_plus.storage.homologated.v1',
        source_mode: 'obj3d',
        target_mode: '2d_compatible',
        method: 'obj3d_homologation_adapter',
      },
      identificacion: {
        tipo: ident.tipo || 'campos',
        nombre: ident.valor,
        valor: ident.valor,
        cara: null,
      },
      escala: state.mmPerUnit || 1,
      unidades: state.unitLabel || 'u3d',
      metricas: metricasCompat,
      perforaciones: [],
      horadaciones: [],
      elementosGeometricos: {
        contorno: {},
        convexHull: {},
        boundingBox: {
          minX: state.bbox.minX,
          minY: state.bbox.minY,
          maxX: state.bbox.maxX,
          maxY: state.bbox.maxY,
          minZ: state.bbox.minZ,
          maxZ: state.bbox.maxZ,
        },
        centroides: {
          centroideHull: [state.center.x, state.center.y, state.center.z],
        },
        ejes: {},
        radios: {},
      },
      obj3d: {
        archivo: state.file.name,
        vertices: state.vertices.length,
        aristas: state.edges.length,
        caras: state.faces,
        bbox: state.bbox,
        faces,
        orientation: orient,
        shape_variables: p.shape_variables || null,
        quality_flags: p.quality_flags || [],
        pca: p,
        comparator_ready: comparatorReady,
        backend_result: state.lastMetrics,
      },
    };

    if (!includeImages) return base;

    const canvasSnapshot = canvas.toDataURL('image/png');
    return {
      ...base,
      imagenRecortada: canvasSnapshot,
      canvasImgenes: {
        morphological: canvasSnapshot,
      },
      imagenes: {
        recortada: canvasSnapshot,
      },
    };
  }

  function toStoragePayload() {
    return buildObj3dHomologatedRecord({ includeImages: true });
  }

  /**
   * Genera 2 tarjetas separadas (anverso + reverso) si hay datos bifaciales.
   * Retorna array de 2 objetos con IDs únicos, o null si no hay bifaciales.
   */
  function buildObj3dDualRecords() {
    if (!state.front_back_homologated_data || state.front_back_homologated_data.status !== 'ok') {
      return null;  // No bifacial data
    }

    const frontBackData = state.front_back_homologated_data;
    const carAnverso = frontBackData.cara_anverso || {};
    const carReverso = frontBackData.cara_reverso || {};
    const bifacialIdx = frontBackData.bifacial_index || 0;
    const ident = getEffectiveIdentification();
    const nowIso = new Date().toISOString();
    const baseId = sanitizeLike2D(ident?.valor) || 'objeto3d';

    // Función auxiliar para crear tarjeta individual
    const buildCardForFace = (faceLabel, faceData, faceIndex) => {
      const cardId = `${baseId}_${faceLabel.toLowerCase()}`;
      const canvasSnapshot = canvas?.toDataURL('image/png') || '';
      // Usar la imagen rasterizada de la cara (si la devolvió el server) para que
      // anverso y reverso tengan thumbnails distintos y sirvan de fuente de imagen
      // en mostrarAnalisisMorfologico sin necesitar imageCaraA/B del pipeline 2D.
      const faceImgUrl = faceData.face_image_base64
        ? `data:image/png;base64,${faceData.face_image_base64}`
        : canvasSnapshot;

      return {
        id: cardId,
        nombreObjeto: `${ident?.valor || 'Objeto3D'} - ${faceLabel}`,
        numeroObjeto: null,
        cara: faceLabel,
        modo: 'obj3d',
        tipoAnalisis: 'obj3d_bifacial_carta_individual',
        timestamp: nowIso,
        homologacion_guardado: {
          schema: 'mao_plus.storage.bifacial_carta_individual.v1',
          source_mode: 'obj3d_bifacial',
          target_mode: '2d_compatible_bifacial_individual',
          method: 'front_back_extraction_individual_card',
          cara_index: faceIndex,  // 0=anverso, 1=reverso
          bifacial_index: bifacialIdx,
          paired_with: faceIndex === 0 ? `${baseId}_reverso` : `${baseId}_anverso`,
          metricas_por_cara: 55,
        },
        identificacion: {
          tipo: ident?.tipo || 'campos',
          nombre: `${ident?.valor || 'Objeto3D'} - ${faceLabel}`,
          valor: `${ident?.valor || 'Objeto3D'} - ${faceLabel}`,
          cara: faceLabel,
        },
        escala: state.mmPerUnit || 1,
        unidades: state.unitLabel || 'u3d',
        metricas: { ...faceData },
        perforaciones: [],
        horadaciones: [],
        elementosGeometricos: {
          contorno: {
            puntos: faceData.contour_points || [],
            [faceLabel.toLowerCase()]: faceData.contour_points || [],
          },
          convexHull: {},
          boundingBox: {
            minX: state.bbox?.minX || 0,
            minY: state.bbox?.minY || 0,
            maxX: state.bbox?.maxX || 0,
            maxY: state.bbox?.maxY || 0,
            minZ: state.bbox?.minZ || 0,
            maxZ: state.bbox?.maxZ || 0,
          },
          centroides: {
            centroideHull: [state.center?.x || 0, state.center?.y || 0, state.center?.z || 0],
          },
          ejes: {},
          radios: {},
        },
        obj3d: {
          archivo: state.file.name,
          vertices: state.vertices?.length || 0,
          aristas: state.edges?.length || 0,
          caras: state.faces || 0,
          bbox: state.bbox,
          face_label: faceLabel,
          bifacial_parent: baseId,
          bifacial_index: bifacialIdx,
          backend_result: state.lastMetrics,
        },
        imagenRecortada: faceImgUrl,
        canvasImgenes: {
          morphological: faceImgUrl,
        },
        imagenes: {
          recortada: faceImgUrl,
        },
      };
    };

    return [
      buildCardForFace('ANVERSO', carAnverso, 0),
      buildCardForFace('REVERSO', carReverso, 1),
    ];
  }

  function makeSafeSlug(value, fallback = 'objeto3d') {
    const slug = String(value || '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    return slug || fallback;
  }

  function makeFileStamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }

  function getLastObj3dJsonExportDir() {
    try {
      return localStorage.getItem('mao.obj3d.lastJsonExportDir') || null;
    } catch {
      return null;
    }
  }

  function setLastObj3dJsonExportDir(dirPath) {
    if (!dirPath) return;
    try {
      localStorage.setItem('mao.obj3d.lastJsonExportDir', String(dirPath));
    } catch {
      // Sin persistencia disponible; continuar sin bloquear exportación.
    }
  }

  function joinPath(base, child) {
    if (!base) return child;
    const useBackslash = base.includes('\\') && !base.includes('/');
    const sep = useBackslash ? '\\' : '/';
    return `${String(base).replace(/[\\/]+$/, '')}${sep}${String(child).replace(/^[\\/]+/, '')}`;
  }

  function buildObj3dJsonExportPackage() {
    if (!state.file || !state.lastMetrics) return null;
    const effectiveId = getEffectiveIdentification();
    const payload = buildObj3dHomologatedRecord({ includeImages: false });
    if (!payload || payload.error) return null;

    return {
      schema: 'mao_plus.obj3d.export.v1',
      exported_at: new Date().toISOString(),
      source: {
        app: 'MAO Plus',
        module: 'obj3d-viewer',
        analysis_type: 'obj3d',
      },
      object: {
        file_name: state.file.name,
        identification: effectiveId || null,
      },
      viewer: {
        unit_label: state.unitLabel || 'u3d',
        mm_per_unit: state.mmPerUnit || 1,
        samples_requested: Number(samplesInput?.value || 20000),
        normalize_mode: normalizeSelect?.value || 'none',
      },
      metrics: state.lastMetrics,
      comparator_ready: state.lastMetrics?.comparator_ready || null,
      storage_payload: payload,
    };
  }

  /**
   * Genera 2 paquetes de exportación separados si hay datos bifaciales.
   * Retorna array [anversoPackage, reversoPackage] o null si no hay bifaciales.
   */
  function buildObj3dDualExportPackages() {
    if (!state.front_back_homologated_data || state.front_back_homologated_data.status !== 'ok') {
      return null;  // No bifacial data
    }

    const frontBackData = state.front_back_homologated_data;
    const dualRecords = buildObj3dDualRecords();
    if (!dualRecords || dualRecords.length !== 2) return null;

    const effectiveId = getEffectiveIdentification();
    const buildPackageForCard = (card, faceLabel) => ({
      schema: 'mao_plus.obj3d.bifacial.export.v1',
      exported_at: new Date().toISOString(),
      source: {
        app: 'MAO Plus',
        module: 'obj3d-viewer',
        analysis_type: 'obj3d_bifacial_dual',
        face: faceLabel,
      },
      object: {
        file_name: state.file.name,
        identification: effectiveId || null,
      },
      viewer: {
        unit_label: state.unitLabel || 'u3d',
        mm_per_unit: state.mmPerUnit || 1,
        samples_requested: Number(samplesInput?.value || 20000),
        normalize_mode: normalizeSelect?.value || 'none',
      },
      bifacial_info: {
        face_label: faceLabel,
        bifacial_index: frontBackData.bifacial_index,
        paired_with: faceLabel === 'ANVERSO' ? 'REVERSO' : 'ANVERSO',
      },
      metrics: state.lastMetrics,
      comparator_ready: state.lastMetrics?.comparator_ready || null,
      storage_payload: card,
    });

    return [
      buildPackageForCard(dualRecords[0], 'ANVERSO'),
      buildPackageForCard(dualRecords[1], 'REVERSO'),
    ];
  }

  function buildObj3dMetricasCsv(metricas = {}) {
    const rows = [
      'metrica,valor',
    ];
    Object.entries(metricas || {}).forEach(([k, v]) => {
      if (typeof v === 'object') return;
      const key = String(k).replace(/[\n\r,]/g, '_');
      const val = String(v ?? '').replace(/[\n\r,]/g, ' ');
      rows.push(`${key},${val}`);
    });
    return rows.join('\n');
  }

  function buildObj3dCompatArtifacts(exportPackage, analysisId, analysisTimestamp) {
    const payload = exportPackage?.storage_payload || {};
    const metricasObjeto = payload?.metricas || {};

    // ── Usar datos bifaciales si disponibles ───────────────────────────
    let metricsSource = 'pca_3d';
    if (state.front_back_homologated_data && state.front_back_homologated_data.status === 'ok') {
      metricsSource = 'front_back_bifacial_homologated';
    }

    const metadata = {
      id: analysisId,
      nombreObjeto: payload?.nombreObjeto || payload?.identificacion?.valor || payload?.obj3d?.archivo || 'Objeto3D',
      timestamp: analysisTimestamp,
      numeroObjeto: payload?.numeroObjeto || null,
      proyecto: {
        id: 'export_obj3d',
        nombre: 'Exportacion OBJ3D',
        descripcion: 'Coleccion exportada desde visor 3D',
        sitio: '',
        investigadorResponsable: '',
        institucionResponsable: ''
      },
      identificacion: {
        ...(payload?.identificacion || {}),
        cara: metricsSource === 'front_back_bifacial_homologated' ? 'BIFACIAL' : '3D',
        numeroObjeto: payload?.numeroObjeto || null,
      },
      configuracion: {
        escala: payload?.escala || 1,
        unidades: payload?.unidades || 'u3d',
        modo: 'obj3d',
        metricsSource: metricsSource,
        parametros_captura: {},
      },
      procesamiento: {
        versionMAO: '1.2.0',
        fecha: analysisTimestamp,
        homologationMethod: metricsSource,
      },
      archivos: {
        metadata: 'metadata.json',
        metricas: 'metricas.json',
        metricasCSV: 'metricas.csv',
        geometria: 'geometria.json',
        trazados: 'trazados.json',
        imagenes: 'imagenes/',
        imagenesJSON: 'imagenes/imagenes.json',
      },
    };

    // ── Generar metricas.json con soporte dual ───────────────────────────
    let metricasObjFormatted = metricasObjeto;
    if (metricsSource === 'front_back_bifacial_homologated' && state.front_back_homologated_data) {
      const bifacialData = state.front_back_homologated_data;
      const carAnverso = bifacialData.cara_anverso || {};
      const carReverso = bifacialData.cara_reverso || {};
      
      metricasObjFormatted = {
        modo: 'bifacial',
        bifacial_index: bifacialData.bifacial_index,
        
        // Cara anverso (55 métricas)
        cara_anverso: {
          label: 'FRONT',
          area: carAnverso.area,
          perimeter: carAnverso.perimeter,
          circularity: carAnverso.circularity,
          solidez: carAnverso.solidity,
          elongation: carAnverso.elongation,
          aspect_ratio: carAnverso.aspect_ratio_tight,
          compactness: carAnverso.compactness,
          rectangularity: carAnverso.rectangularity,
          excentricidad: carAnverso.excentricidad,
          eje_mayor: carAnverso.eje_mayor,
          eje_menor: carAnverso.eje_menor,
          feret_max: carAnverso.feret_max,
          feret_min: carAnverso.feret_min,
          radio_maximo: carAnverso.radio_maximo,
          radio_minimo: carAnverso.radio_minimo,
          curvatura_media: carAnverso.curvatura_media,
          rugosidad: carAnverso.rugosidad_contorno,
          forma_detectada: carAnverso.forma_detectada,
          ...(carAnverso || {}),  // Incluir todas las métricas
        },
        
        // Cara reverso (55 métricas)
        cara_reverso: {
          label: 'BACK',
          area: carReverso.area,
          perimeter: carReverso.perimeter,
          circularity: carReverso.circularity,
          solidez: carReverso.solidity,
          elongation: carReverso.elongation,
          aspect_ratio: carReverso.aspect_ratio_tight,
          compactness: carReverso.compactness,
          rectangularity: carReverso.rectangularity,
          excentricidad: carReverso.excentricidad,
          eje_mayor: carReverso.eje_mayor,
          eje_menor: carReverso.eje_menor,
          feret_max: carReverso.feret_max,
          feret_min: carReverso.feret_min,
          radio_maximo: carReverso.radio_maximo,
          radio_minimo: carReverso.radio_minimo,
          curvatura_media: carReverso.curvatura_media,
          rugosidad: carReverso.rugosidad_contorno,
          forma_detectada: carReverso.forma_detectada,
          ...(carReverso || {}),  // Incluir todas las métricas
        },
        
        // Resúmenes
        promedios: {
          circularity: (toSafeNumber(carAnverso.circularity, 0) + toSafeNumber(carReverso.circularity, 0)) / 2,
          solidez: (toSafeNumber(carAnverso.solidity, 0) + toSafeNumber(carReverso.solidity, 0)) / 2,
          elongation: (toSafeNumber(carAnverso.elongation, 0) + toSafeNumber(carReverso.elongation, 0)) / 2,
          eje_mayor: (toSafeNumber(carAnverso.eje_mayor, 0) + toSafeNumber(carReverso.eje_mayor, 0)) / 2,
        }
      };
    }

    // Estadísticas robustas para modo bifacial: promedio anverso/reverso.
    let statsArea = toSafeNumber(metricasObjeto?.area, 0);
    let statsPerimeter = toSafeNumber(metricasObjeto?.perimeter, 0);
    let statsSolidez = toSafeNumber(metricasObjeto?.solidity, 0);

    if (metricsSource === 'front_back_bifacial_homologated' && state.front_back_homologated_data) {
      const carAnverso = state.front_back_homologated_data.cara_anverso || {};
      const carReverso = state.front_back_homologated_data.cara_reverso || {};
      statsArea = (toSafeNumber(carAnverso.area, 0) + toSafeNumber(carReverso.area, 0)) / 2;
      statsPerimeter = (toSafeNumber(carAnverso.perimeter, 0) + toSafeNumber(carReverso.perimeter, 0)) / 2;
      statsSolidez = (toSafeNumber(carAnverso.solidity, 0) + toSafeNumber(carReverso.solidity, 0)) / 2;
    }

    const metricas = {
      objeto: metricasObjFormatted,
      perforaciones: payload?.perforaciones || [],
      horadaciones: payload?.horadaciones || [],
      estadisticas: {
        totalPerforaciones: Array.isArray(payload?.perforaciones) ? payload.perforaciones.length : 0,
        totalHoradaciones: Array.isArray(payload?.horadaciones) ? payload.horadaciones.length : 0,
        areaTotal: statsArea,
        areaReal: statsArea,
        areaNeta: statsArea,
        perimetroNeto: statsPerimeter,
        solidez: statsSolidez,
        porosidad: toSafeNumber(metricasObjeto?.porosidad, 0),
      },
    };

    // ── Geometria con contornos bifaciales si disponibles ───────────────
    let contornosGeometria = payload?.elementosGeometricos?.contorno || {};
    if (metricsSource === 'front_back_bifacial_homologated' && state.front_back_homologated_data) {
      contornosGeometria = {
        anverso: state.front_back_homologated_data.cara_anverso?.contour_points || [],
        reverso: state.front_back_homologated_data.cara_reverso?.contour_points || [],
      };
    }

    const geometria = {
      contornoReal: contornosGeometria,
      convexHull: payload?.elementosGeometricos?.convexHull || {},
      boundingBox: payload?.elementosGeometricos?.boundingBox || {},
      centroides: payload?.elementosGeometricos?.centroides || {},
      ejes: payload?.elementosGeometricos?.ejes || {},
      radios: payload?.elementosGeometricos?.radios || {},
      trazosCanvas: payload?.trazosCanvas || { perforaciones: [], horadaciones: [] },
      perforaciones: payload?.elementosGeometricos?.perforaciones || [],
      horadaciones: payload?.elementosGeometricos?.horadaciones || [],
      escala: {
        factor: payload?.escala || 1,
        unidades: payload?.unidades || 'u3d',
      },
    };

    const trazados = {
      trazosCanvas: payload?.trazosCanvas || { perforaciones: [], horadaciones: [] },
      canvasImgenes: payload?.canvasImgenes || {},
      imagenes: payload?.imagenes || {},
    };

    const imagenesJson = {
      recortada: payload?.imagenRecortada || payload?.imagenes?.recortada || null,
      morfologica: payload?.canvasImgenes?.morphological || payload?.imagenes?.morfologica || null,
      idealizada: payload?.canvasImgenes?.idealized || payload?.imagenes?.idealizada || null,
      esquematica: payload?.canvasImgenes?.schematic || payload?.imagenes?.esquematica || null,
    };

    const imagenesMetadata = {
      totalImagenes: Object.values(imagenesJson).filter(Boolean).length,
      fecha: analysisTimestamp,
      imagenes: {
        objetoRecortado: imagenesJson.recortada ? 'objeto_recortado.png' : null,
        analisisMorfologico: imagenesJson.morfologica ? 'analisis_morfologico.png' : null,
        formaIdealizada: imagenesJson.idealizada ? 'forma_idealizada.png' : null,
        esquemaMorfometrico: imagenesJson.esquematica ? 'esquema_morfometrico.png' : null,
        base64JSON: 'imagenes.json',
      },
    };

    return {
      metadata,
      metricas,
      geometria,
      trazados,
      imagenesJson,
      imagenesMetadata,
      metricasCsv: buildObj3dMetricasCsv(metricasObjeto),
    };
  }

  async function updateCollectionIndexCompat(baseFolderPath, entry, api) {
    const indexPath = joinPath(baseFolderPath, 'collection_index.json');
    let collection = null;

    const readResult = await api.readFile(indexPath);
    if (readResult?.success) {
      try {
        collection = JSON.parse(readResult.content);
      } catch {
        collection = null;
      }
    }

    if (!collection || typeof collection !== 'object') {
      collection = {
        proyectoId: 'export_obj3d',
        nombre: 'Exportacion OBJ3D',
        descripcion: 'Coleccion compatible CMO generada desde MAO Plus 3D',
        rasgoComun: '',
        totalObjetos: 0,
        ultimaActualizacion: new Date().toISOString(),
        objetos: [],
      };
    }

    if (!Array.isArray(collection.objetos)) collection.objetos = [];
    const idx = collection.objetos.findIndex(o => o && o.carpeta === entry.carpeta);
    if (idx >= 0) collection.objetos[idx] = entry;
    else collection.objetos.push(entry);

    collection.totalObjetos = collection.objetos.length;
    collection.ultimaActualizacion = new Date().toISOString();
    collection.objetos.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

    const writeResult = await api.saveFile(indexPath, JSON.stringify(collection, null, 2));
    if (!writeResult?.success) {
      throw new Error(writeResult?.error || 'No se pudo actualizar collection_index.json');
    }
  }

  async function saveObj3dJsonIndependent() {
    if (!state.file) {
      setStatus('Carga un archivo OBJ antes de exportar JSON.', true);
      return;
    }
    if (!state.lastMetrics) {
      setStatus('Calcula el análisis 3D antes de exportar JSON.', true);
      if (window.toast?.warning) window.toast.warning('Primero calcula el análisis 3D.');
      return;
    }

    const api = window.electronAPI;
    if (!api || typeof api.selectFolder !== 'function' || typeof api.ensureFolder !== 'function' || typeof api.saveFile !== 'function') {
      setStatus('Exportación JSON 3D no disponible en este entorno.', true);
      if (window.toast?.error) window.toast.error('No se encontró API de archivos para exportar JSON.');
      return;
    }

    const exportPackage = buildObj3dJsonExportPackage();
    if (!exportPackage) {
      setStatus('No hay datos de análisis 3D suficientes para exportar.', true);
      return;
    }

    const ident = getEffectiveIdentification();
    const exportIso = new Date().toISOString();
    const stamp = makeFileStamp();
    const objectSlug = makeSafeSlug(ident?.valor || getObj3dFileBaseName() || 'objeto3d');
    const exportFolderName = `${objectSlug}_analisis3d_${stamp}`;
    const analysisId = `${objectSlug}_${stamp}`;

    try {
      saveJsonBtn && (saveJsonBtn.disabled = true);
      setStatus('Selecciona la carpeta del proyecto/colección para exportar en formato CMO...');

      const preferredFolder = getLastObj3dJsonExportDir();
      const selectedBaseFolder = await api.selectFolder(preferredFolder ? { defaultPath: preferredFolder } : {});
      if (!selectedBaseFolder) {
        setStatus('Exportación JSON cancelada por el usuario.');
        return;
      }
      setLastObj3dJsonExportDir(selectedBaseFolder);

      const exportFolderPath = joinPath(selectedBaseFolder, exportFolderName);
      const ensureResult = await api.ensureFolder(exportFolderPath);
      if (!ensureResult?.success) {
        throw new Error(ensureResult?.error || 'No se pudo crear la carpeta de exportación');
      }

      const fullJsonPath = joinPath(exportFolderPath, 'analisis_obj3d_completo.json');
      const summaryJsonPath = joinPath(exportFolderPath, 'resumen_metricas_obj3d.json');
      const metadataPath = joinPath(exportFolderPath, 'metadata.json');
      const metricasPath = joinPath(exportFolderPath, 'metricas.json');
      const geometriaPath = joinPath(exportFolderPath, 'geometria.json');
      const trazadosPath = joinPath(exportFolderPath, 'trazados.json');
      const metricasCsvPath = joinPath(exportFolderPath, 'metricas.csv');
      const imagesFolderPath = joinPath(exportFolderPath, 'imagenes');
      const imagesMetaPath = joinPath(imagesFolderPath, 'metadata.json');
      const imagesJsonPath = joinPath(imagesFolderPath, 'imagenes.json');
      const imageRecortadaPath = joinPath(imagesFolderPath, 'objeto_recortado.png');

      const compat = buildObj3dCompatArtifacts(exportPackage, analysisId, exportIso);

      const fullWrite = await api.saveFile(fullJsonPath, JSON.stringify(exportPackage, null, 2));
      if (!fullWrite?.success) {
        throw new Error(fullWrite?.error || 'No se pudo guardar analisis_obj3d_completo.json');
      }

      const summary = {
        schema: 'mao_plus.obj3d.summary.v1',
        exported_at: exportPackage.exported_at,
        object_name: ident?.valor || state.file.name,
        file_name: state.file.name,
        mode_3d: exportPackage?.metrics?.obj3d?.faces?.mode || null,
        analysis_level: exportPackage?.metrics?.obj3d?.analysis_level || null,
        key_metrics: {
          bbox_volume: exportPackage?.metrics?.obj3d?.bbox_volume ?? null,
          linearity: exportPackage?.metrics?.obj3d?.linearity ?? null,
          planarity: exportPackage?.metrics?.obj3d?.planarity ?? null,
          sphericity: exportPackage?.metrics?.obj3d?.sphericity ?? null,
          anisotropy: exportPackage?.metrics?.obj3d?.anisotropy ?? null,
          bifacial_index: exportPackage?.metrics?.obj3d?.faces?.bifacial_index?.value ?? null,
        },
      };

      const summaryWrite = await api.saveFile(summaryJsonPath, JSON.stringify(summary, null, 2));
      if (!summaryWrite?.success) {
        throw new Error(summaryWrite?.error || 'No se pudo guardar resumen_metricas_obj3d.json');
      }

      const metadataWrite = await api.saveFile(metadataPath, JSON.stringify(compat.metadata, null, 2));
      if (!metadataWrite?.success) {
        throw new Error(metadataWrite?.error || 'No se pudo guardar metadata.json');
      }

      const metricasWrite = await api.saveFile(metricasPath, JSON.stringify(compat.metricas, null, 2));
      if (!metricasWrite?.success) {
        throw new Error(metricasWrite?.error || 'No se pudo guardar metricas.json');
      }

      const geometriaWrite = await api.saveFile(geometriaPath, JSON.stringify(compat.geometria, null, 2));
      if (!geometriaWrite?.success) {
        throw new Error(geometriaWrite?.error || 'No se pudo guardar geometria.json');
      }

      const trazadosWrite = await api.saveFile(trazadosPath, JSON.stringify(compat.trazados, null, 2));
      if (!trazadosWrite?.success) {
        throw new Error(trazadosWrite?.error || 'No se pudo guardar trazados.json');
      }

      const csvWrite = await api.saveFile(metricasCsvPath, compat.metricasCsv);
      if (!csvWrite?.success) {
        throw new Error(csvWrite?.error || 'No se pudo guardar metricas.csv');
      }

      const ensureImages = await api.ensureFolder(imagesFolderPath);
      if (!ensureImages?.success) {
        throw new Error(ensureImages?.error || 'No se pudo crear carpeta imagenes');
      }

      const imagesMetaWrite = await api.saveFile(imagesMetaPath, JSON.stringify(compat.imagenesMetadata, null, 2));
      if (!imagesMetaWrite?.success) {
        throw new Error(imagesMetaWrite?.error || 'No se pudo guardar imagenes/metadata.json');
      }

      const imagesJsonWrite = await api.saveFile(imagesJsonPath, JSON.stringify(compat.imagenesJson, null, 2));
      if (!imagesJsonWrite?.success) {
        throw new Error(imagesJsonWrite?.error || 'No se pudo guardar imagenes/imagenes.json');
      }

      if (compat.imagenesJson.recortada) {
        const recortadaWrite = await api.saveFile(imageRecortadaPath, compat.imagenesJson.recortada);
        if (!recortadaWrite?.success) {
          throw new Error(recortadaWrite?.error || 'No se pudo guardar imagenes/objeto_recortado.png');
        }
      }

      const metricasCompat = compat?.metricas || {};
      const areaResumen = Number(metricasCompat?.area) || exportPackage?.metrics?.obj3d?.bbox_volume || 0;
      const perimetroResumen = Number(metricasCompat?.perimeter) || exportPackage?.metrics?.obj3d?.perimeter || 0;
      const circularidadResumen = Number(metricasCompat?.circularity) || 0;
      const elongacionResumen = Number(metricasCompat?.elongation) || 0;
      const aspectRatioResumen = Number(metricasCompat?.aspect_ratio || metricasCompat?.aspect_ratio_tight) || 0;
      const usaHomologacionBifacial = !!(state.front_back_homologated_data && state.front_back_homologated_data.status === 'ok');

      const collectionEntry = {
        id: analysisId,
        nombreObjeto: ident?.valor || state.file.name,
        carpeta: exportFolderName,
        timestamp: exportIso,
        modo: 'obj3d',
        cara: '3D',
        metricasResumen: {
          area: areaResumen,
          perimetro: perimetroResumen,
          circularidad: circularidadResumen,
          elongacion: elongacionResumen,
          aspectRatio: aspectRatioResumen,
          clasificacionForma: metricasCompat?.forma_detectada || 'obj3d_pca',
          numPerforaciones: 0,
          numHoradaciones: 0,
          porosidad: 0,
          medidaEtiqueta: usaHomologacionBifacial ? 'Área homologada FRONT/BACK' : 'Volumen BBox',
          medidaUnidad: usaHomologacionBifacial ? 'mm²' : `${state.unitLabel || 'u3d'}³`,
        },
        thumbnail: `${exportFolderName}/imagenes/thumbnail.png`,
        thumbnailPath: `${exportFolderPath}/imagenes/objeto_recortado.png`,
        completado: true,
      };

      await updateCollectionIndexCompat(selectedBaseFolder, collectionEntry, api);

      setStatus(`Exportación 3D compatible CMO completada: ${exportFolderPath}`);
      if (window.toast?.success) {
        window.toast.success('Exportación 3D compatible CMO completada correctamente.');
      }
      console.info('[OBJ3D][JSON_EXPORT]', JSON.stringify({
        baseFolder: selectedBaseFolder,
        folder: exportFolderPath,
        files: [
          'analisis_obj3d_completo.json',
          'resumen_metricas_obj3d.json',
          'metadata.json',
          'metricas.json',
          'geometria.json',
          'trazados.json',
          'metricas.csv',
          'imagenes/imagenes.json',
          'imagenes/metadata.json',
        ],
        object: ident?.valor || state.file.name,
      }));
    } catch (err) {
      console.error('[OBJ3D] Error exportando JSON 3D:', err);
      setStatus(`Error al exportar JSON 3D: ${err?.message || 'desconocido'}`, true);
      if (window.toast?.error) window.toast.error('No se pudo exportar el paquete JSON 3D.');
    } finally {
      updateIndependentSaveButtonState();
    }
  }

  async function saveObj3dAnalysis() {
    const pm = window.projectManager;
    if (!pm || typeof pm.addAnalysis !== 'function') {
      setStatus('No hay gestor de proyectos disponible para guardar.', true);
      return;
    }

    if (!pm.activeProject) {
      if (window.toast?.warning) window.toast.warning('Activa un proyecto antes de guardar el análisis 3D.');
      setStatus('Sin proyecto activo. Activa uno y vuelve a guardar.', true);
      return;
    }

    if (!state.lastMetrics) {
      if (window.toast?.warning) window.toast.warning('Calcula métricas PCA antes de guardar.');
      setStatus('Calcula métricas PCA antes de guardar el análisis 3D.', true);
      return;
    }

    const payload = toStoragePayload();
    if (!payload) {
      setStatus('No hay datos 3D suficientes para guardar.', true);
      return;
    }

    if (payload.error === 'identificacion') {
      if (window.toast?.warning) {
        window.toast.warning('Asigna y bloquea la "Identificación del Objeto" antes de guardar el análisis 3D.');
      }
      setStatus('Falta identificación bloqueada. Ve a "Identificación del Objeto".', true);
      return;
    }

    try {
      saveBtn && (saveBtn.disabled = true);
      const dualRecords = buildObj3dDualRecords();
      if (Array.isArray(dualRecords) && dualRecords.length === 2) {
        setStatus('Guardando análisis bifacial en proyecto (2 tarjetas)...');
        await pm.addAnalysis(dualRecords[0]);
        await pm.addAnalysis(dualRecords[1]);
        setStatus(`Análisis bifacial guardado en proyecto: ${pm.activeProject.name} (2 tarjetas)`);
        if (window.toast?.success) window.toast.success('Análisis bifacial guardado correctamente (anverso + reverso).');
      } else {
        setStatus('Guardando análisis 3D en proyecto...');
        await pm.addAnalysis(payload);
        setStatus(`Análisis 3D guardado en proyecto: ${pm.activeProject.name}`);
        if (window.toast?.success) window.toast.success('Análisis 3D guardado correctamente en el proyecto activo.');
      }
    } catch (err) {
      console.error('[OBJ3D] Error guardando análisis 3D:', err);
      setStatus(`Error al guardar análisis 3D: ${err?.message || 'desconocido'}`, true);
    } finally {
      updateSaveButtonState();
    }
  }

  function renderMetrics(res) {
    const p = res?.obj3d || res || {};
    const pca = p?.pca || p;
    const mao2d = p?.mao2d_adapted || {};
    const oriented2d = mao2d?.oriented_2d || {};
    const orientedPlanes = oriented2d?.planes || {};
    const frontBackRef = mao2d?.front_back_reference || {};
    const canonicalMorph = p?.morphology_canonical || {};
    const fbBalance = canonicalMorph?.front_back?.bifacial_balance || {};
    const transverseSummary = canonicalMorph?.transverse_summary || {};
    const pcaSequential = p?.pca_sequential_morphometry || {};
    const coherence = p?.coherence_mao_plus || mao2d?.coherence_2d_3d || {};
    const coherenceComp = coherence?.components || {};
    const homologation3d = p?.homologation_3d || mao2d?.homologation_3d || {};
    const e = pca?.eigenvalues || [];
    const seg = p?.segmentation || {};
    const morph = p?.morphometry || {};
    const facesData = p?.faces || {};
    const faceAssign = facesData?.assignment || {};
    const faceSemantic = facesData?.semantic || {};
    const norm = p?.normalization || {};
    const canonical = p?.orientation_canonical || {};
    const axisDef = canonical?.axis_definition || {};
    const longAxis = axisDef?.longitudinal || {};
    const morphPlane = longAxis?.morphological_plane || {};
    const orientationModeLabel = p?.orientation_mode || state.orientationMode || 'auto';
    const longRule = longAxis?.rule || '-';
    const hasMorphPlane = !!(morphPlane && (morphPlane?.equation || morphPlane?.name));
    const morphPlaneName = morphPlane?.name || 'mass_cut_plane_x_axis';
    const morphPlaneEquation = morphPlane?.equation || 'n·(x-COM)=0';
    const morphPlaneContains = Array.isArray(morphPlane?.contains)
      ? morphPlane.contains.join(', ')
      : '';
    const facesCanon = canonical?.faces || {};
    const edgesCanon = canonical?.edges || {};
    const ev = getPipelineEvidence(res);
    const grav = canonical?.gravitational || {};
    const dims = canonical?.dimensions || {};
    const ordered = ev?.orderedSteps || [];
    const executedMap = ev?.executedMap || {};

    const timelineHtml = ordered.length
      ? ordered.map((s, i) => {
          const done = !!executedMap?.[s];
          return `<div class="obj3d-timeline-item"><span class="obj3d-timeline-icon">${done ? '✅' : '⚠️'}</span><span class="obj3d-timeline-text">${i + 1}. ${friendlyStepName(s)}</span></div>`;
        }).join('')
      : `<div class="obj3d-note">No hay traza detallada de pasos en esta respuesta.</div>`;

    const ok = '✅';
    const no = '⚠️';
    const prePcaBadge = ev.prePcaVerified || (ev.segmentationDone && ev.facePairsDone && ev.normalizationDone)
      ? `${ok} Verificado`
      : `${no} No verificable`;

    const maoPlusModuleHtml = renderMaoPlusMorphologyModule(canonicalMorph);
    const pcaSequentialHtml = renderPcaSequentialModule(pcaSequential);
    const homologation3dHtml = renderHomologation3DModule(homologation3d);

    const heroScore = Number(homologation3d?.homologation?.score ?? coherence?.score ?? canonical?.reproducibility_score);

    // ── Pestaña «Métricas»: hero card con KPIs resumen ───────────────────
    metricsEl.innerHTML = [
      `<div class="obj3d-metrics-shell">`,
      `<section class="obj3d-hero-card">`,
      `<div class="obj3d-hero-top">`,
      `<div>`,
      `<div class="obj3d-hero-title">Lectura morfológica 3D tipo MAO Plus</div>`,
      `<div class="obj3d-hero-subtitle">Visualización homologada para objetos 3D con orientación canónica, coherencia 2D↔3D y firma inter-objeto.</div>`,
      `</div>`,
      `<div class="obj3d-pill-row">`,
      `<span class="obj3d-pill obj3d-pill--blue">${p?.analysis_level ?? '-'}</span>`,
      `<span class="obj3d-pill ${facesData?.mode === 'bifacial' ? 'obj3d-pill--green' : 'obj3d-pill--amber'}">${facesData?.mode ?? '-'}</span>`,
      `<span class="obj3d-pill ${getToneClassFromBoolean(canonical?.reproducible)}">${canonical?.reproducible ? 'reproducible' : 'revisar orientación'}</span>`,
      `</div>`,
      `</div>`,
      `<div class="obj3d-kpi-grid">`,
      `<div class="obj3d-kpi-card"><div class="obj3d-kpi-label">Score homologación</div><div class="obj3d-kpi-value">${fmt(homologation3d?.homologation?.score, 4)}</div><div class="obj3d-kpi-meta">${homologation3d?.homologation?.level || 'sin nivel'} · comparable ${homologation3d?.homologation?.is_comparable ? 'sí' : 'no'}</div></div>`,
      `<div class="obj3d-kpi-card"><div class="obj3d-kpi-label">Coherencia 2D↔3D</div><div class="obj3d-kpi-value">${fmt(coherence?.score, 4)}</div><div class="obj3d-kpi-meta">${coherence?.level || 'sin lectura'} · Anverso/Reverso (FRONT/BACK) como referencia</div></div>`,
      `<div class="obj3d-kpi-card"><div class="obj3d-kpi-label">Homología bifacial</div><div class="obj3d-kpi-value">${fmt(canonicalMorph?.mao_plus_indices?.bifacial_homology_index, 4)}</div><div class="obj3d-kpi-meta">balance canónico entre Cara A y Cara B</div></div>`,
      `<div class="obj3d-kpi-card"><div class="obj3d-kpi-label">Procrustes secuencial</div><div class="obj3d-kpi-value">${fmt(pcaSequential?.overall?.mean_procrustes_similarity, 4)}</div><div class="obj3d-kpi-meta">consistencia ${pcaSequential?.overall?.consistency_level || '-'}</div><div class="obj3d-score-track"><div class="obj3d-score-fill ${heroScore >= 0.85 ? 'obj3d-score-fill--green' : heroScore >= 0.7 ? 'obj3d-score-fill--blue' : heroScore >= 0.5 ? 'obj3d-score-fill--amber' : 'obj3d-score-fill--red'}" style="width:${Math.max(0, Math.min(100, Number(heroScore || 0) * 100))}%;"></div></div></div>`,
      `</div>`,
      `</section>`,
      `</div>`,
    ].join('');

    // ── Pestaña «Pipeline morfológico» ───────────────────────────────────
    if (pipelineEl) pipelineEl.innerHTML = [
      `<div class="obj3d-metrics-shell">`,
      `<section class="obj3d-section-card">`,
      `<div class="obj3d-section-top">`,
      `<div>`,
      `<div class="obj3d-section-title">Pipeline morfológico</div>`,
      `<div class="obj3d-section-subtitle">Segmentación → caras → normalización → orientación semántica → PCA → morfometría.</div>`,
      `</div>`,
      `<div class="obj3d-chip-row">`,
      `<span class="obj3d-chip ${ev.hasV2Level ? 'obj3d-chip--blue' : 'obj3d-chip--amber'}">${ev.hasV2Level ? 'flujo v2 activo' : 'flujo v2 no confirmado'}</span>`,
      `<span class="obj3d-chip ${prePcaBadge.includes('✅') ? 'obj3d-chip--green' : 'obj3d-chip--amber'}">${prePcaBadge}</span>`,
      `</div>`,
      `</div>`,
      `<div class="obj3d-timeline">${timelineHtml}</div>`,
      `<div class="obj3d-note">Método de normalización: <strong>${ev.method}</strong> · confianza <strong>${fmt(ev.confidence, 2)}</strong> · criterio de caras <strong>${faceSemantic?.criterion || 'n/a'}</strong>.</div>`,
      `</section>`,
      `</div>`,
    ].join('');

    // ── Pestaña «Orientación canónica» ───────────────────────────────────
    if (orientacionEl) orientacionEl.innerHTML = [
      `<div class="obj3d-metrics-shell">`,
      `<section class="obj3d-section-card">`,
      `<div class="obj3d-section-top">`,
      `<div>`,
      `<div class="obj3d-section-title">Orientación canónica</div>`,
      `<div class="obj3d-section-subtitle">La semántica Anverso/Reverso (FRONT/BACK) gobierna la lectura principal del objeto.</div>`,
      `</div>`,
      `<div class="obj3d-chip-row">`,
      `<span class="obj3d-chip obj3d-chip--slate">${orientationModeLabel}</span>`,
      `<span class="obj3d-chip ${grav?.formal_faces_locked ? 'obj3d-chip--green' : 'obj3d-chip--amber'}">${grav?.formal_faces_locked ? 'caras formales bloqueadas' : 'caras formales no bloqueadas'}</span>`,
      `<span class="obj3d-chip ${getToneClassFromScore(canonical?.reproducibility_score, 0.9, 0.75)}">reproducibilidad ${fmt(canonical?.reproducibility_score, 2)}</span>`,
      `</div>`,
      `</div>`,
      `<div class="obj3d-definition-list">`,
      `<div class="obj3d-definition-item"><div class="obj3d-definition-term">Método</div><div class="obj3d-definition-desc">${canonical?.method || '-'} · regla longitudinal <strong>${longRule}</strong></div></div>`,
      `${hasMorphPlane ? `<div class="obj3d-definition-item"><div class="obj3d-definition-term">Plano activo</div><div class="obj3d-definition-desc"><strong>${morphPlaneName}</strong> (${morphPlaneEquation})${morphPlaneContains ? ` · contiene ${morphPlaneContains}` : ''}</div></div>` : ''}`,
      `<div class="obj3d-definition-item"><div class="obj3d-definition-term">Extensiones</div><div class="obj3d-definition-desc">Longitudinal ${fmt(axisDef?.longitudinal?.extent, 4)} · transversal ${fmt(axisDef?.transversal?.extent, 4)} · dorsoventral ${fmt(axisDef?.dorsoventral?.extent, 4)}</div></div>`,
      `<div class="obj3d-definition-item"><div class="obj3d-definition-term">Caras</div><div class="obj3d-definition-desc">Cara A ${facesCanon?.A?.patch_id ?? '-'} · Cara B ${facesCanon?.B?.patch_id ?? '-'} · frente/reverso ${faceAssign?.front ?? '-'} / ${faceAssign?.reverse ?? '-'}</div></div>`,
      `<div class="obj3d-definition-item"><div class="obj3d-definition-term">Bordes</div><div class="obj3d-definition-desc">Proximal ${fmt(edgesCanon?.proximal?.x_value, 4)} · distal ${fmt(edgesCanon?.distal?.x_value, 4)}</div></div>`,
      `${grav?.resting_stability_score !== undefined ? `<div class="obj3d-definition-item"><div class="obj3d-definition-term">Estabilidad</div><div class="obj3d-definition-desc">Score ${fmt(grav?.resting_stability_score, 3)} · margen ${fmt(grav?.stability_margin, 2)}</div></div>` : ''}`,
      `${dims?.ancho !== undefined ? `<div class="obj3d-definition-item"><div class="obj3d-definition-term">Dimensiones reposo</div><div class="obj3d-definition-desc">Ancho ${fmt(dims?.ancho, 4)} · alto ${fmt(dims?.alto, 4)} · espesor ${fmt(dims?.espesor, 4)}</div></div>` : ''}`,
      `</div>`,
      `</section>`,
      `</div>`,
    ].join('');

    // ── Pestaña «Morfometría base» ────────────────────────────────────────
    if (morfometriaEl) morfometriaEl.innerHTML = [
      `<div class="obj3d-metrics-shell">`,
      `<section class="obj3d-section-card">`,
      `<div class="obj3d-section-top">`,
      `<div>`,
      `<div class="obj3d-section-title">Morfometría base</div>`,
      `<div class="obj3d-section-subtitle">Variables estructurales que sostienen la lectura MAO Plus 3D.</div>`,
      `</div>`,
      `<div class="obj3d-chip-row"><span class="obj3d-chip obj3d-chip--slate">PCA contextualizado</span></div>`,
      `</div>`,
      `<div class="obj3d-grid-2">`,
      `<div class="obj3d-mini-card"><div class="obj3d-mini-label">Espesor</div><div class="obj3d-mini-value">${fmt(morph?.thickness_ratio, 4)}</div><div class="obj3d-mini-meta">ratio dorsoventral</div></div>`,
      `<div class="obj3d-mini-card"><div class="obj3d-mini-label">Anisotropía</div><div class="obj3d-mini-value">${fmt(morph?.anisotropy, 4)}</div><div class="obj3d-mini-meta">direccionalidad global</div></div>`,
      `<div class="obj3d-mini-card"><div class="obj3d-mini-label">Planaridad</div><div class="obj3d-mini-value">${fmt(morph?.planarity, 4)}</div><div class="obj3d-mini-meta">acercamiento a plano</div></div>`,
      `<div class="obj3d-mini-card"><div class="obj3d-mini-label">Elongación</div><div class="obj3d-mini-value">${fmt(morph?.elongation, 4)}</div><div class="obj3d-mini-meta">desarrollo longitudinal</div></div>`,
      `</div>`,
      `<div class="obj3d-note">Autovalores PCA λ: [${e.map((v) => fmt(v, 6)).join(', ')}] · linealidad ${fmt(pca?.linearity, 4)} · esfericidad ${fmt(pca?.sphericity, 4)}.</div>`,
      `<div class="obj3d-note">Extensiones PCA: [${(Array.isArray(pca?.pca_extents) ? pca.pca_extents : []).map((v) => fmt(v, 3)).join(', ')}] ${state.unitLabel || 'u3d'} · \xE1rea sup. ${Number.isFinite(Number(p?.surface_area)) ? fmt(p.surface_area, 2) + ' ' + (state.unitLabel === 'mm' ? 'mm\xB2' : 'u3d\xB2') : '-'}${p?.volume != null ? ' · vol. ' + fmt(p.volume, 2) + ' ' + (state.unitLabel === 'mm' ? 'mm\xB3' : 'u3d\xB3') : ''}.</div>`,
      `</section>`,
      `</div>`,
    ].join('');

    // ── Pestaña «Homologación 2D↔3D» ─────────────────────────────────────
    if (hom2d3dEl) hom2d3dEl.innerHTML = [
      `<div class="obj3d-metrics-shell">`,
      `<section class="obj3d-section-card">`,
      `<div class="obj3d-section-top">`,
      `<div>`,
      `<div class="obj3d-section-title">Homologación 2D orientada ↔ 3D</div>`,
      `<div class="obj3d-section-subtitle">Puente entre la lógica MAO Plus 2D y la semántica canónica 3D.</div>`,
      `</div>`,
      `<div class="obj3d-chip-row">`,
      `<span class="obj3d-chip obj3d-chip--blue">${frontBackRef?.plane || oriented2d?.reference_plane || 'frontal_xy'}</span>`,
      `<span class="obj3d-chip ${getToneClassFromScore(coherence?.score, 0.85, 0.65)}">${coherence?.level || 'sin lectura'}</span>`,
      `</div>`,
      `</div>`,
      `<div class="obj3d-grid-3">`,
      `<div class="obj3d-mini-card"><div class="obj3d-mini-label">Área 2D ref.</div><div class="obj3d-mini-value">${fmt(frontBackRef?.area_2d, 4)}</div><div class="obj3d-mini-meta">plano ANVERSO/REVERSO (FRONT/BACK)</div></div>`,
      `<div class="obj3d-mini-card"><div class="obj3d-mini-label">Perímetro 2D ref.</div><div class="obj3d-mini-value">${fmt(frontBackRef?.perimeter_2d, 4)}</div><div class="obj3d-mini-meta">lectura homologada</div></div>`,
      `<div class="obj3d-mini-card"><div class="obj3d-mini-label">Circularidad / AR</div><div class="obj3d-mini-value">${fmt(frontBackRef?.circularity_2d, 4)} / ${fmt(frontBackRef?.aspect_ratio_2d, 4)}</div><div class="obj3d-mini-meta">perfil de referencia</div></div>`,
      `</div>`,
      `<div class="obj3d-definition-list" style="margin-top:8px;">`,
      `<div class="obj3d-definition-item"><div class="obj3d-definition-term">Balance Anverso/Reverso (FRONT/BACK)</div><div class="obj3d-definition-desc">Área ${fmt(fbBalance?.area_balance, 4)} · perímetro ${fmt(fbBalance?.perimeter_balance, 4)}</div></div>`,
      `<div class="obj3d-definition-item"><div class="obj3d-definition-term">Secciones transversales</div><div class="obj3d-definition-desc">${Number.isFinite(Number(transverseSummary?.count)) ? Number(transverseSummary.count) : 0} secciones · área media ${fmt(transverseSummary?.mean_area, 4)} · espesor Z ${fmt(transverseSummary?.mean_thickness_z, 4)} · circ. ${fmt(transverseSummary?.mean_circularity, 3)} · solidez ${fmt(transverseSummary?.mean_solidity, 3)} · elong. ${fmt(transverseSummary?.mean_elongation, 3)}</div></div>`,
      `<div class="obj3d-definition-item"><div class="obj3d-definition-term">Componentes de coherencia</div><div class="obj3d-definition-desc">Bifacial ${fmt(coherenceComp?.bifacial_homology, 3)} · longitudinal ${fmt(coherenceComp?.longitudinal_stability, 3)} · forma ${fmt(coherenceComp?.shape_consistency, 3)} · espesor ${fmt(coherenceComp?.thickness_consistency, 3)}</div></div>`,
      `${orientedPlanes?.lateral_xz ? `<div class="obj3d-definition-item"><div class="obj3d-definition-term">LATERAL IZQ./DER. (XZ)</div><div class="obj3d-definition-desc">Área ${fmt(orientedPlanes.lateral_xz?.area, 4)} · AR ${fmt(orientedPlanes.lateral_xz?.aspect_ratio, 4)}</div></div>` : ''}`,
      `${orientedPlanes?.transversal_yz ? `<div class="obj3d-definition-item"><div class="obj3d-definition-term">TRANSVERSAL SUP./INF. (YZ)</div><div class="obj3d-definition-desc">Área ${fmt(orientedPlanes.transversal_yz?.area, 4)} · AR ${fmt(orientedPlanes.transversal_yz?.aspect_ratio, 4)}</div></div>` : ''}`,
      `</div>`,
      `</section>`,
      `</div>`,
    ].join('');

    // ── Pestañas MAO Plus · PCA·Procrustes · Hom. 3D ─────────────────────
    if (maoplusEl)   maoplusEl.innerHTML   = `<div class="obj3d-metrics-shell">${maoPlusModuleHtml}</div>`;
    if (pcaEl)       pcaEl.innerHTML       = `<div class="obj3d-metrics-shell">${pcaSequentialHtml}</div>`;
    if (hom3dEl)     hom3dEl.innerHTML     = `<div class="obj3d-metrics-shell">${homologation3dHtml}</div>`;

    // ── Índices MAO-3D Seccionales → panel propio ─────────────────────────
    if (mao3dPanelEl) {
      const i3d = canonicalMorph?.mao3d_indices || {};
      if (!Object.keys(i3d).length) {
        mao3dPanelEl.innerHTML = '<span style="font-size:10px;color:var(--gray-500);">Sin datos de índices seccionales.</span>';
      } else {
        // Barra unipolar [lo, hi] con codificación por color
        const renderBar = (v, lo, hi) => {
          const pct = Math.max(0, Math.min(100, ((Number(v) - lo) / (hi - lo + 1e-9)) * 100));
          const cls = pct >= 70 ? 'obj3d-score-fill--green' : pct >= 40 ? 'obj3d-score-fill--blue' : 'obj3d-score-fill--amber';
          return `<div class="obj3d-score-track"><div class="obj3d-score-fill ${cls}" style="width:${pct.toFixed(1)}%;"></div></div>`;
        };
        // Barra bipolar [-1, +1]: azul hacia la derecha del centro, ámbar hacia la izquierda
        const renderBarBipolar = (v) => {
          const c = Math.max(-1, Math.min(1, Number(v)));
          const from  = (Math.min(50, 50 + c * 50)).toFixed(1);
          const width = (Math.abs(c) * 50).toFixed(1);
          const bg    = c >= 0 ? 'var(--blue-500,#1e88e5)' : '#f57c00';
          return `<div class="obj3d-score-track" style="position:relative;">
            <div style="position:absolute;left:${from}%;width:${width}%;height:100%;background:${bg};opacity:0.75;border-radius:2px;"></div>
            <div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:rgba(80,80,80,0.25);"></div>
          </div>`;
        };
        // Separador de grupo
        const grpHeader = (label) =>
          `<div style="font-size:8px;font-weight:700;color:var(--gray-400,#9e9e9e);text-transform:uppercase;letter-spacing:0.07em;padding:6px 0 2px;margin-top:2px;border-top:1px solid var(--gray-150,#f0f0f0);">${label}</div>`;
        const row = (label, key, lo, hi, hint, bipolar = false) =>
          `<div class="obj3d-mao3d-row">
             <div class="obj3d-mao3d-key">${key}</div>
             <div class="obj3d-mao3d-label">${label}</div>
             <div class="obj3d-mao3d-val">${fmt(i3d[key], 4)}</div>
             ${bipolar ? renderBarBipolar(i3d[key]) : renderBar(i3d[key], lo, hi)}
             <div class="obj3d-mao3d-hint">${hint}</div>
           </div>`;

        // Sparkline mejorado: perfil de área + espesor a lo largo del eje X
        const _sprof   = canonicalMorph?.section_profiles || {};
        const _sArea   = _sprof.area_normalized      || [];
        const _sThick  = _sprof.thickness_normalized || [];
        const _sXrel   = _sprof.x_relative           || [];
        let sparkHtml  = '';
        if (_sArea.length >= 3) {
          const W = 260, H = 80;
          const PAD_L = 4, PAD_R = 6, PAD_T = 4, PAD_B = 18; // espacio para eje X
          const cW = W - PAD_L - PAD_R;   // ancho del área de contenido
          const cH = H - PAD_T - PAD_B;   // alto del área de contenido
          const n  = _sArea.length;

          // Helper: convierte valor [0,1] a coordenadas SVG
          const px = (xrel, i) => PAD_L + ((xrel !== undefined ? xrel : i / (n - 1)) * cW);
          const py = (v) => PAD_T + (1 - Math.max(0, Math.min(1, v))) * cH;

          // ── Serie área (azul, fill) ─────────────────────────────────────
          const areaLineStr = _sArea.map((a, i) => `${px(_sXrel[i], i).toFixed(1)},${py(a).toFixed(1)}`).join(' ');
          const x0 = px(_sXrel[0], 0), xN = px(_sXrel[n - 1], n - 1);
          const yBase = PAD_T + cH;
          const areaPolyStr = `${x0.toFixed(1)},${yBase.toFixed(1)} ${areaLineStr} ${xN.toFixed(1)},${yBase.toFixed(1)}`;

          // ── Serie espesor (ámbar, dashed) ──────────────────────────────
          let thickLineHtml = '';
          if (_sThick.length === n) {
            const thickStr = _sThick.map((t, i) => `${px(_sXrel[i], i).toFixed(1)},${py(t).toFixed(1)}`).join(' ');
            thickLineHtml = `<polyline points="${thickStr}" fill="none" stroke="#fb8c00" stroke-width="1.2" stroke-dasharray="3,2" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>`;
          }

          // ── Marcador en el máximo de área ──────────────────────────────
          const maxIdx  = _sArea.indexOf(Math.max(..._sArea));
          const mxPx    = px(_sXrel[maxIdx], maxIdx);
          const mxPy    = py(_sArea[maxIdx]);
          const markerHtml = `<circle cx="${mxPx.toFixed(1)}" cy="${mxPy.toFixed(1)}" r="3" fill="#1e88e5" stroke="#fff" stroke-width="1"/>`;

          // ── Grid horizontal en 0%, 50%, 100% ──────────────────────────
          const gridHtml = [0.5].map(v => {
            const gy = py(v);
            return `<line x1="${PAD_L}" y1="${gy.toFixed(1)}" x2="${W - PAD_R}" y2="${gy.toFixed(1)}" stroke="var(--gray-200,#eee)" stroke-width="0.7" stroke-dasharray="2,3"/>`;
          }).join('');

          // ── Ticks y etiquetas en eje X ─────────────────────────────────
          const ticks = [0, 0.25, 0.5, 0.75, 1.0];
          const ticksHtml = ticks.map(t => {
            const tx = PAD_L + t * cW;
            const lbl = t === 0 ? 'P' : t === 1 ? 'D' : (t * 100).toFixed(0) + '%';
            const bold = (t === 0 || t === 1) ? 'font-weight:700;' : '';
            return `<line x1="${tx.toFixed(1)}" y1="${yBase.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${(yBase + 3).toFixed(1)}" stroke="var(--gray-400,#9e9e9e)" stroke-width="0.8"/>
                    <text x="${tx.toFixed(1)}" y="${(yBase + 9).toFixed(1)}" text-anchor="middle" font-size="6.5" fill="var(--gray-500,#757575)" style="${bold}">${lbl}</text>`;
          }).join('');

          // ── Leyenda mini ───────────────────────────────────────────────
          const legendHtml = `
            <div style="display:flex;gap:10px;margin-top:3px;align-items:center;">
              <span style="display:flex;align-items:center;gap:3px;font-size:7.5px;color:var(--gray-500);">
                <svg width="14" height="6"><polyline points="0,5 14,5" stroke="#1e88e5" stroke-width="1.5"/></svg>área
              </span>
              ${_sThick.length === n ? `<span style="display:flex;align-items:center;gap:3px;font-size:7.5px;color:var(--gray-500);">
                <svg width="14" height="6"><polyline points="0,5 14,5" stroke="#fb8c00" stroke-width="1.2" stroke-dasharray="3,2"/></svg>espesor
              </span>` : ''}
              <span style="display:flex;align-items:center;gap:3px;font-size:7.5px;color:var(--gray-500);">
                <svg width="8" height="8"><circle cx="4" cy="4" r="3" fill="#1e88e5" stroke="#fff" stroke-width="1"/></svg>máx.área
              </span>
            </div>`;

          sparkHtml = `
            <div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--gray-150,#f0f0f0);">
              <div style="font-size:8px;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">Perfil de área transversal (proximal → distal)</div>
              <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block;overflow:visible;">
                ${gridHtml}
                <polygon points="${areaPolyStr}" fill="var(--blue-100,#e3f2fd)" opacity="0.55"/>
                <polyline points="${areaLineStr}" fill="none" stroke="var(--blue-500,#1e88e5)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
                ${thickLineHtml}
                ${markerHtml}
                ${ticksHtml}
              </svg>
              ${legendHtml}
            </div>`;
        }

        mao3dPanelEl.innerHTML = [
          `<div class="obj3d-metrics-shell">`,
          `<section class="obj3d-section-card">`,
          `<div class="obj3d-section-top">`,
          `<div class="obj3d-section-subtitle">Síntesis morfológica derivada de ${transverseSummary?.count ?? 0} secciones transversales YZ.</div>`,
          `<div class="obj3d-chip-row">`,
          `<span class="obj3d-chip obj3d-chip--blue">análisis seccional</span>`,
          `<span class="obj3d-chip obj3d-chip--slate">análogo MAO 2D</span>`,
          `</div>`,
          `</div>`,
          `<div class="obj3d-mao3d-table">`,
          grpHeader('Forma de corte'),
          row('Aplanamiento',     'IAS', 0, 1,   'espesor/ancho · <1 = tabular'),
          row('Forma circular',   'IFC', 0, 1,   'circularidad media · 1 = circular'),
          row('Elongación',       'IFE', 1, 5,   'eje mayor/menor · 1 = equant'),
          row('Convexidad',       'ICS', 0, 1,   'solidez media · <1 = cóncavo/retocado'),
          row('Rugosidad',        'IFR', 1, 2,   'P_real/P_hull · 1 = liso, >1 = irregular'),
          grpHeader('Distribución volumétrica'),
          row('Regularidad',      'IRS', 0, 1,   '1 − CV_área · 1 = cilíndrico'),
          row('Constricción',     'IC',  0, 1,   '1 − A_min/A_max · 0 = sin estrangulamiento'),
          row('Tendencia reduc.', 'ITR', -1, 1,  '> 0 ensancha distal · < 0 afina distal', true),
          row('Polaridad P→D',    'IPD', -1, 1,  '> 0 prox > dist (lasca) · < 0 apical', true),
          grpHeader('Simetría'),
          row('Simetría long.',   'ISL', -1, 1,  'corr. perfil ↔ espejo · +1 = simétrico', true),
          `</div>`,
          sparkHtml,
          `</section>`,
          `</div>`,
        ].join('');
      }
    }

    // ── EFA Seccional → panel propio ──────────────────────────────────────
    if (efaPanelEl) {
      const efa    = canonicalMorph?.efa_seccional    || {};
      const efa3d  = canonicalMorph?.efa_3d_integrado || {};
      if (!efa?.available) {
        efaPanelEl.innerHTML = '<span style="font-size:10px;color:var(--gray-500);">EFA no disponible para este objeto.</span>';
      } else {
        const ps       = efa.power_spectrum_mean  || [];
        const vex      = efa.variance_explained   || [];
        const h95      = efa.harmonics_for_95pct  ?? '-';
        const nh       = efa.n_harmonics          ?? '-';
        const ns       = efa.n_sections_used      ?? '-';
        const stability = efa.harmonic_stability  || [];
        const mtxShape = efa.coeff_matrix_shape   || [0, 0];
        const recon    = efa.mean_reconstructed   || [];

        // ── Espectro de potencia media (barras azules) ─────────────────
        const psMax = Math.max(...ps.map(Number), 1e-9);
        const psBar = ps.slice(0, Math.min(ps.length, 10)).map((v, k) => {
          const pct = Math.min(100, (Number(v) / psMax) * 100);
          return `<div class="obj3d-efa-bar-wrap" title="k=${k+1} · PS=${Number(v).toFixed(4)} · var=${Number(vex[k]||0).toFixed(1)}%">
                    <div class="obj3d-efa-bar-fill" style="height:${pct.toFixed(1)}%;"></div>
                    <div class="obj3d-efa-bar-label">${k+1}</div>
                  </div>`;
        }).join('');

        // ── Estabilidad armónica (barras verde/ámbar) ──────────────────
        let stabilityHtml = '';
        if (stability.length > 0) {
          const stBars = stability.slice(0, Math.min(stability.length, 10)).map((v, k) => {
            const pct  = Math.min(100, Math.max(0, Number(v) * 100));
            const clr  = pct >= 70 ? '#4caf50' : pct >= 40 ? '#42a5f5' : '#ffa726';
            return `<div class="obj3d-efa-bar-wrap" title="k=${k+1} · estabilidad=${pct.toFixed(0)}%">
                      <div class="obj3d-efa-bar-fill" style="height:${pct.toFixed(1)}%;background:${clr};"></div>
                      <div class="obj3d-efa-bar-label">${k+1}</div>
                    </div>`;
          }).join('');
          stabilityHtml = `<div style="margin-top:6px;padding-top:5px;border-top:1px solid var(--gray-150,#f0f0f0);">
            <div style="font-size:8px;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;">Estabilidad armónica entre secciones (1 − CV)</div>
            <div class="obj3d-efa-spectrum">${stBars}</div>
          </div>`;
        }

        // ── Forma media reconstruida (SVG) ─────────────────────────────
        let reconSvgHtml = '';
        if (recon.length >= 3) {
          const W2 = 200, H2 = 160;
          const rxs = recon.map(p => Number(p[0] ?? p.x ?? 0));
          const rys = recon.map(p => Number(p[1] ?? p.y ?? 0));
          const minX = Math.min(...rxs), maxX = Math.max(...rxs);
          const minY = Math.min(...rys), maxY = Math.max(...rys);
          const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
          const scaleR = Math.min((W2 - 24) / rangeX, (H2 - 24) / rangeY);
          const cx0 = (minX + maxX) / 2, cy0 = (minY + maxY) / 2;
          const rpts = recon.map(p => {
            const px = W2 / 2 + (Number(p[0] ?? 0) - cx0) * scaleR;
            const py = H2 / 2 - (Number(p[1] ?? 0) - cy0) * scaleR;
            return `${px.toFixed(1)},${py.toFixed(1)}`;
          }).join(' ');
          reconSvgHtml = `<div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--gray-150,#f0f0f0);">
            <div style="font-size:8px;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">Forma media reconstruida (EFD)</div>
            <svg viewBox="0 0 ${W2} ${H2}" style="width:100%;max-height:120px;background:var(--gray-50,#fafafa);border-radius:4px;border:1px solid var(--gray-200,#eee);display:block;">
              <polygon points="${rpts}" fill="var(--blue-100,#e3f2fd)" fill-opacity="0.65" stroke="var(--blue-500,#1e88e5)" stroke-width="1.5" stroke-linejoin="round"/>
            </svg>
          </div>`;
        }

        // ── Textos auxiliares ──────────────────────────────────────────
        const c0 = (efa.mean_coefficients || [])[0] || [];
        const c0str = c0.length ? `[${c0.map(v => Number(v).toFixed(4)).join(', ')}]` : '-';
        const coeffJson  = JSON.stringify(efa.mean_coefficients || []);
        const sigJson    = JSON.stringify(efa.signature        || []);

        efaPanelEl.innerHTML = [
          `<div class="obj3d-metrics-shell">`,
          `<section class="obj3d-section-card">`,
          `<div class="obj3d-section-top">`,
          `<div class="obj3d-section-subtitle">Descriptores de Fourier elípticos (Kuhl &amp; Giardina 1982) sobre ${ns} secciones transversales YZ.</div>`,
          `<div class="obj3d-chip-row">`,
          `<span class="obj3d-chip obj3d-chip--blue">${nh} armónicos</span>`,
          `<span class="obj3d-chip obj3d-chip--green">95% varianza en ${h95}</span>`,
          `<span class="obj3d-chip obj3d-chip--slate">inter-objeto</span>`,
          `</div>`,
          `</div>`,
          `<div class="obj3d-definition-list">`,
          `<div class="obj3d-definition-item"><div class="obj3d-definition-term">Secciones usadas</div><div class="obj3d-definition-desc">${ns} de ${transverseSummary?.count ?? 0} transversales</div></div>`,
          `<div class="obj3d-definition-item"><div class="obj3d-definition-term">Armónico 1 (media)</div><div class="obj3d-definition-desc font-mono">${c0str}</div></div>`,
          `<div class="obj3d-definition-item"><div class="obj3d-definition-term">Varianza acumulada</div><div class="obj3d-definition-desc">${vex.slice(0,5).map((v,k)=>`k${k+1}: ${Number(v).toFixed(1)}%`).join(' · ')}</div></div>`,
          `<div class="obj3d-definition-item"><div class="obj3d-definition-term">Matriz de datos</div><div class="obj3d-definition-desc font-mono">${mtxShape[0]} × ${mtxShape[1]} (secciones × coeficientes)</div></div>`,
          `</div>`,
          `<div class="obj3d-efa-spectrum" title="Espectro de potencia media (armónicos 1-${Math.min(10, ps.length)})">${psBar}</div>`,
          stabilityHtml,
          reconSvgHtml,
          `<div class="obj3d-definition-item" style="margin-top:8px;">`,
          `<div class="obj3d-definition-term">Exportar descriptores</div>`,
          `<div class="obj3d-definition-desc" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">`,
          `<button class="obj3d-copy-btn" onclick="navigator.clipboard.writeText(${JSON.stringify(sigJson)}).then(()=>{this.textContent='¡Copiada!';setTimeout(()=>{this.textContent='Copiar Firma'},1500)})" title="Vector firma plano (nh×4): huella morfológica del objeto para PCA/GMM">Copiar Firma</button>`,
          `<button class="obj3d-copy-btn" onclick="navigator.clipboard.writeText(${JSON.stringify(coeffJson)}).then(()=>{this.textContent='¡Copiado!';setTimeout(()=>{this.textContent='Copiar JSON'},1500)})" title="Coeficientes medios como matriz JSON para efa.compare()">Copiar JSON</button>`,
          `<span class="obj3d-efa-hint">Firma = vector (${mtxShape[1] || '—'}) para PCA · JSON = efa.compare()</span>`,
          `</div>`,
          `</div>`,
          `</section>`,
          // ── EFA 3D Integrado (descriptor multi-eje) ───────────────────
          (() => {
            if (!efa3d?.available) return '';
            const dim   = efa3d.descriptor_dim   ?? '—';
            const nh3   = efa3d.n_harmonics       ?? '—';
            const axes  = efa3d.axes_available    ?? 0;
            const npa   = efa3d.n_sections_per_axis || {};
            const sig3  = efa3d.signature_3d      || [];
            const norm3 = efa3d.signature_norm    ?? '—';
            const sig3Json = JSON.stringify(sig3);
            // Formas reconstruidas por eje
            const reconYZ = efa3d.recon_yz || [];
            const reconXZ = efa3d.recon_xz || [];
            const reconXY = efa3d.recon_xy || [];
            // Mini barras de magnitud por eje (primeros 8 coefs de cada eje)
            const sliceN = nh3 * 4;
            const vt = (efa3d.mean_yz || []).slice(0, 8);
            const vc = (efa3d.mean_xz || []).slice(0, 8);
            const vf = (efa3d.mean_xy || []).slice(0, 8);
            const maxV = Math.max(...[...vt, ...vc, ...vf].map(Math.abs), 1e-9);
            const axisBars = (arr, color, label) => {
              const bars = arr.map((v, k) => {
                const pct = Math.min(100, (Math.abs(Number(v)) / maxV) * 100);
                return `<div class="obj3d-efa-bar-wrap" title="${label} c${k+1}=${Number(v).toFixed(4)}">
                          <div class="obj3d-efa-bar-fill" style="height:${pct.toFixed(1)}%;background:${color};"></div>
                          <div class="obj3d-efa-bar-label">${k+1}</div>
                        </div>`;
              }).join('');
              return `<div style="font-size:8px;color:var(--gray-400);margin-bottom:1px;">${label}</div>
                      <div class="obj3d-efa-spectrum" style="margin-bottom:3px;">${bars}</div>`;
            };
            return [
              `<section class="obj3d-section-card" style="margin-top:8px;border-top:2px solid var(--blue-200,#bbdefb);padding-top:8px;">`,
              `<div class="obj3d-section-top">`,
              `<div class="obj3d-section-title" style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--blue-700,#1565c0);font-weight:700;">EFA 3D Integrado — Descriptor Multi-eje</div>`,
              `<div class="obj3d-section-subtitle">Equivalente arqueológico al mapeo esférico (SPHARM): cobertura espacial desde ${axes} planos ortogonales.</div>`,
              `<div class="obj3d-chip-row">`,
              `<span class="obj3d-chip obj3d-chip--blue">dim ${dim}</span>`,
              `<span class="obj3d-chip obj3d-chip--slate">${axes} ejes · ${nh3} armónicos</span>`,
              `</div>`,
              `</div>`,
              `<div class="obj3d-definition-list">`,
              `<div class="obj3d-definition-item"><div class="obj3d-definition-term">Secciones por eje</div><div class="obj3d-definition-desc">YZ: ${npa.transverse_yz ?? 0} · XZ: ${npa.coronal_xz ?? 0} · XY: ${npa.frontal_xy ?? 0}</div></div>`,
              `<div class="obj3d-definition-item"><div class="obj3d-definition-term">Norma del descriptor</div><div class="obj3d-definition-desc font-mono">${Number(norm3).toFixed(4)}</div></div>`,
              `<div class="obj3d-definition-item"><div class="obj3d-definition-term">Vector firma 3D</div><div class="obj3d-definition-desc font-mono">(${dim},) listo para PCA/clustering</div></div>`,
              `</div>`,
              axisBars(vt, '#42a5f5', 'YZ (transversal)'),
              axisBars(vc, '#66bb6a', 'XZ (coronal)'),
              axisBars(vf, '#ffa726', 'XY (frontal)'),
              // ── Formas medias reconstruidas (3 SVGs) ───────────────────────
              (() => {
                const W = 130, H = 110;
                const makeSvg = (pts, stroke, fill, label) => {
                  if (!pts || pts.length < 3) return '';
                  const xs = pts.map(p => Number(p[0] ?? 0));
                  const ys = pts.map(p => Number(p[1] ?? 0));
                  const minX = Math.min(...xs), maxX = Math.max(...xs);
                  const minY = Math.min(...ys), maxY = Math.max(...ys);
                  const rX = maxX - minX || 1, rY = maxY - minY || 1;
                  const sc = Math.min((W - 18) / rX, (H - 26) / rY);
                  const cx0 = (minX + maxX) / 2, cy0 = (minY + maxY) / 2;
                  const poly = pts.map(p => {
                    const px = W / 2 + (Number(p[0] ?? 0) - cx0) * sc;
                    const py = (H - 14) / 2 + 8 - (Number(p[1] ?? 0) - cy0) * sc;
                    return `${px.toFixed(1)},${py.toFixed(1)}`;
                  }).join(' ');
                  return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
                    <svg viewBox="0 0 ${W} ${H}" style="width:${W}px;height:${H}px;max-width:100%;background:var(--gray-50,#fafafa);border-radius:4px;border:1px solid var(--gray-200,#eee);display:block;">
                      <polygon points="${poly}" fill="${fill}" fill-opacity="0.55" stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round"/>
                    </svg>
                    <div style="font-size:7.5px;color:var(--gray-400);text-transform:uppercase;letter-spacing:.05em;">${label}</div>
                  </div>`;
                };
                const svgYZ = makeSvg(reconYZ, '#1e88e5', '#bbdefb', 'YZ · transversal');
                const svgXZ = makeSvg(reconXZ, '#43a047', '#c8e6c9', 'XZ · coronal');
                const svgXY = makeSvg(reconXY, '#fb8c00', '#ffe0b2', 'XY · frontal');
                if (!svgYZ && !svgXZ && !svgXY) return '';
                return `<div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--gray-150,#f0f0f0);">
                  <div style="font-size:8px;color:var(--gray-400);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px;">Formas medias reconstruidas (EFD ${nh3} arm.)</div>
                  <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">${svgYZ}${svgXZ}${svgXY}</div>
                </div>`;
              })(),
              `<div style="margin-top:6px;">`,
              `<button class="obj3d-copy-btn" onclick="navigator.clipboard.writeText(${JSON.stringify(sig3Json)}).then(()=>{this.textContent='¡Copiado!';setTimeout(()=>{this.textContent='Copiar Firma 3D'},1500)})" title="Vector unificado (3×nh×4) para comparación inter-objeto">Copiar Firma 3D</button>`,
              `<span class="obj3d-efa-hint" style="margin-left:6px;">Vector (${dim},) = concat(YZ, XZ, XY)</span>`,
              `</div>`,
              `</section>`,
            ].join('');
          })(),
          `</div>`,
        ].join('');
      }
    }
  }

  function ensureAnimation() {
    if (!state.autoRotate || state.rafId) return;

    const tick = () => {
      if (!state.autoRotate) {
        state.rafId = null;
        return;
      }
      if (!state.dragging) state.rotY += 0.01;
      render();
      state.rafId = requestAnimationFrame(tick);
    };

    state.rafId = requestAnimationFrame(tick);
  }

  /**
   * Intenta cargar la textura a partir del .mtl referenciado en el OBJ.
   * Retorna un HTMLImageElement listo o null si no se puede cargar.
   */
  async function loadMtlAndTexture(mtlFileName) {
    try {
      const api = window.electronAPI;
      if (!api || typeof api.readFile !== 'function') return null;
      // Ruta del directorio donde está el .obj
      const objPath = state.file?.path;
      if (!objPath) return null;
      const sep = objPath.includes('\\') ? '\\' : '/';
      const dir = objPath.substring(0, objPath.lastIndexOf(sep) + 1);

      // Leer el .mtl
      const mtlPath = dir + mtlFileName;
      const mtlText = await api.readFile(mtlPath, 'utf8').catch(() => null);
      if (!mtlText) return null;

      // Buscar map_Kd (textura difusa) — tomar la primera aparición
      let textureName = null;
      for (const line of mtlText.split(/\r?\n/)) {
        const m = line.trim().match(/^map_Kd\s+(.+)/i);
        if (m) { textureName = m[1].trim(); break; }
      }
      if (!textureName) return null;

      // Normalizar separadores por si el .mtl usa rutas Windows
      textureName = textureName.replace(/\\/g, sep);
      const textureBasename = textureName.split(sep).pop();

      // Directorio del MTL (puede ser un subdirectorio del OBJ)
      const mtlFileNorm = mtlFileName.replace(/\\/g, sep);
      const mtlDir = mtlFileNorm.includes(sep)
        ? dir + mtlFileNorm.substring(0, mtlFileNorm.lastIndexOf(sep) + 1)
        : dir;

      // Intentar las rutas más probables en orden
      const candidates = [
        mtlDir + textureName,      // relativa al .mtl (correcto según spec OBJ/MTL)
        dir + textureName,         // relativa al .obj
        dir + textureBasename,     // solo nombre de archivo junto al .obj
        mtlDir + textureBasename,  // solo nombre de archivo junto al .mtl
      ];

      let imgBytes = null;
      let resolvedTexName = textureBasename;
      for (const candidate of candidates) {
        imgBytes = await api.readFile(candidate, 'base64').catch(() => null);
        if (imgBytes) { resolvedTexName = textureBasename; break; }
      }
      if (!imgBytes) return null;
      textureName = resolvedTexName;

      const ext = textureName.split('.').pop().toLowerCase();
      const mime = ext === 'png' ? 'image/png'
                 : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                 : 'image/png';

      return await new Promise((resolve) => {
        const img = new Image();
        img.onload  = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = `data:${mime};base64,${imgBytes}`;
      }).then((img) => {
        if (img) {
          state.textureName = textureName.split(sep).pop();
          return _scaleTexture(img, 1024);
        }
        return null;
      });
    } catch (e) {
      console.warn('[OBJ3D] loadMtlAndTexture error:', e);
      return null;
    }
  }

  async function loadObjAndRender() {
    if (!state.file) {
      setStatus('Seleccione un archivo .obj primero.', true);
      return;
    }

    try {
      setStatus('Cargando y parseando OBJ...');
      const text = await state.file.text();
      const parsed = parseObj(text);

      state.vertices = parsed.vertices;
      state.edges = parsed.edges;
      state.triangles = parsed.triangles;
      state.faces = parsed.faceCount;
      state.uvs = parsed.uvCoords;
      state.triUVs = parsed.triUVs;
      state.vertexColors = parsed.vertexColors;
      state.textureImage = null;
      state.textureName = null;
      state.bbox = computeBounds(parsed.vertices);
      state.center = state.bbox.center;
      _precomputeCMDistances();
      _precomputeNormalVariance();
      state.showDepthColor = false;
      const _dcBtn = document.getElementById('obj3dDepthColorBtn');
      if (_dcBtn) { _dcBtn.classList.remove('btn-success'); _dcBtn.classList.add('btn-muted'); }
      state.showRoughnessColor = false;
      const _rnBtn = document.getElementById('obj3dRoughnessBtn');
      if (_rnBtn) { _rnBtn.classList.remove('btn-success'); _rnBtn.classList.add('btn-muted'); }
      state.pcaAxes = null;
      state.lastMetrics = null;
      state.v2Data = null;
      state.rotationLocked = false;
      state.orientationMode = 'auto_visual';
      state.orientationOverrideMode = null;
      state.metricsComputed = false;
      state.showContourOverlay = false;
      _syncContourBtn();
      _syncContour2dControls();
      const c2dPanel = _c2dPanel();
      if (c2dPanel) c2dPanel.innerHTML = 'Selecciona un contorno y pulsa «Analizar 2D» para obtener las métricas morfométricas completas del corte o proyección.';
      state.awaitingMorphAnchorPick = false;
      state.userMorphAnchor = null;
      state.userMorphAnchorIndex = null;
      setOrientationOverrideControlsEnabled(false);
      state.autoRotate = false;
      if (autoRotateCheck) autoRotateCheck.checked = false;
      if (state.rafId) {
        cancelAnimationFrame(state.rafId);
        state.rafId = null;
      }

      fitView();
      render();
      updateBasicInfo();
      analyzeBtn.disabled = false;
      updateSaveButtonState();
      updateIndependentSaveButtonState();

      // Intentar cargar textura de forma asíncrona (no bloquea la UI)
      const hasUV = parsed.triUVs.length > 0;
      const hasVertexColor = parsed.vertexColors.length > 0;
      const hasMtl = !!parsed.mtlFile;

      if (hasMtl && hasUV) {
        setStatus('Objeto 3D cargado. Cargando textura...');
        const img = await loadMtlAndTexture(parsed.mtlFile);
        state.textureImage = img;
        if (img) {
          // Activar textura automáticamente al cargar
          state.showTexture = true;
          _syncTextureBtn();
          render();
          setStatus(`Objeto 3D cargado con textura "${state.textureName}". UVs: ${state.uvs.length.toLocaleString()}.`);
        } else {
          setStatus('Objeto 3D cargado. Textura referenciada en .mtl no encontrada — usando sombreado estándar.');
        }
      } else if (hasVertexColor) {
        state.showTexture = true;
        _syncTextureBtn();
        render();
        setStatus(`Objeto 3D cargado con colores de vértice (${state.vertices.length.toLocaleString()} vértices).`);
      } else {
        setStatus('Objeto 3D cargado. Sin textura detectada — usando sombreado estándar.');
      }

      updateBasicInfo();
    } catch (err) {
      console.error('[OBJ3D] Error cargando OBJ:', err);
      setStatus(`Error al cargar OBJ: ${err?.message || 'desconocido'}`, true);
      analyzeBtn.disabled = true;
    }
  }

  async function fetchFrontBackHomologation() {
    if (!state.file) return null;
    try {
      const fd = new FormData();
      fd.append('obj_file', state.file);
      fd.append('mm_per_unit', String(state.mmPerUnit || 1.0));

      // Enviar contornos ya calculados (orientación correcta del análisis actual)
      // para evitar que el servidor re-analice con 'auto' y obtenga una orientación diferente.
      const frontBack = state.lastMetrics?.obj3d?.morphology_canonical?.front_back;
      const _fCxy = frontBack?.front?.contour_xy;
      const _bCxy = frontBack?.back?.contour_xy;
      console.info('[OBJ3D] fetchFrontBackHomologation — contour_xy front:', _fCxy?.length ?? 'N/A',
                   'back:', _bCxy?.length ?? 'N/A');
      if (Array.isArray(_fCxy) && _fCxy.length >= 3 && Array.isArray(_bCxy) && _bCxy.length >= 3) {
        fd.append('front_contour_json', JSON.stringify(_fCxy));
        fd.append('back_contour_json',  JSON.stringify(_bCxy));
        fd.append('precomputed_bifacial_index', String(frontBack.bifacial_balance?.area_balance ?? 0));
        console.info('[OBJ3D] Usando contornos pre-calculados (Ruta A).');
      } else {
        console.warn('[OBJ3D] Contornos pre-calculados no disponibles — usando Ruta B (re-análisis servidor).');
      }
      const resp = await fetch('http://localhost:8765/api/obj3d/front-back-metrics-homologated', {
        method: 'POST',
        body: fd,
        signal: AbortSignal.timeout(60000),
      });
      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '(no body)');
        console.warn('[OBJ3D] Front-back homologation falló:', resp.status, resp.statusText, errBody);
        return null;
      }
      const data = await resp.json();
      if (data?.status === 'ok') {
        state.front_back_homologated_data = data;
        if (morphBtn) morphBtn.disabled = !(data && data.status === 'ok');
        console.info('[OBJ3D] Front-back homologation completada:', data);
        return data;
      }
      return null;
    } catch (err) {
      console.warn('[OBJ3D] Error fetching front-back homologation:', err.message);
      return null;
    }
  }

  async function analyzeObj3d({ preserveOverride = false } = {}) {
    if (!state.file) {
      setStatus('No hay archivo OBJ cargado para análisis.', true);
      return;
    }

    const nSamples = Math.max(1000, Math.min(200000, Number(samplesInput.value) || 20000));
    let nSections = Math.max(9, Math.min(33, parseInt(sectionsInput?.value || '9', 10)));
    if (nSections % 2 === 0) nSections = nSections + 1 <= 33 ? nSections + 1 : nSections - 1;
    const normalizeMode = normalizeSelect.value || 'none';
    const rawUnit = unitSelect?.value || '0';
    const mmPerUnit = rawUnit === '0' ? 1.0 : (parseFloat(rawUnit) || 1.0);
    const unitLabel = rawUnit === '0' ? 'u3d' : 'mm';
    state.unitLabel = unitLabel;
    state.mmPerUnit = mmPerUnit;
    const requestOrientationMode = preserveOverride
      ? (state.orientationOverrideMode || 'auto_visual')
      : 'auto_visual';
    const requestAnchor = requestOrientationMode === 'user_morphological_axis'
      ? state.userMorphAnchor
      : null;

    if (!preserveOverride) {
      state.orientationOverrideMode = null;
      state.orientationMode = 'auto_visual';
      state.awaitingMorphAnchorPick = false;
      state.userMorphAnchor = null;
      state.userMorphAnchorIndex = null;
      canvas.style.cursor = 'grab';
    }

    metricsEl.textContent = 'Calculando morfometría 3D (segmentación → caras → orientación → PCA)...';

    try {
      const bridge = window.PythonBridge;
      if (!bridge || !bridge.obj3d || typeof bridge.obj3d.metrics !== 'function') {
        metricsEl.innerHTML = '<div>PythonBridge no disponible. Solo se muestra la visualización local.</div>';
        setStatus('Visor activo, pero sin backend disponible.', true);
        return;
      }

      let result = await bridge.obj3d.metrics(state.file, {
        nSamples,
        nSections,
        normalizeMode,
        analysisLevel: 'v2',  // ← USAR v2: arquitectura correcta
        orientationMode: requestOrientationMode,
        userMorphAnchor: requestAnchor,
        mmPerUnit,
        comparatorReady: true,
      });

      if (!result) {
        metricsEl.innerHTML = '<div>Backend v2 no activo (servidor Python no disponible).</div>';
        setStatus('Servidor Python no disponible. Visualización local activa.', true);
        return;
      }

      if (result?.detail && typeof result.detail === 'string') {
        const fallback = await bridge.obj3d.metrics(state.file, {
          nSamples,
          normalizeMode,
          analysisLevel: 'hybrid_v1',
          orientationMode: 'auto',
          userMorphAnchor: null,
          mmPerUnit,
          comparatorReady: true,
        });
        if (fallback?.obj3d) {
          result = fallback;
          setStatus('v2 no disponible para esta malla; se aplicó fallback hybrid_v1 para habilitar guardado.', true);
        } else {
          throw new Error(result.detail);
        }
      }

      let autoAppliedMode = requestOrientationMode;
      if (!preserveOverride && shouldAutoApplyContourOverride(result?.obj3d)) {
        metricsEl.textContent = 'Ajustando visualización automáticamente según contorno canónico...';
        const contourResult = await bridge.obj3d.metrics(state.file, {
          nSamples,
          normalizeMode,
          analysisLevel: 'v2',
          orientationMode: 'contour_variance_normal',
          userMorphAnchor: null,
          mmPerUnit,
        });
        if (contourResult?.obj3d) {
          result = contourResult;
          autoAppliedMode = 'contour_variance_normal';
        }
      }

      state.v2Data = result?.obj3d;
      state.orientationMode = state.v2Data?.orientation_mode || requestOrientationMode;
      state.faceMode = state.v2Data?.morphometry?.face_mode || state.v2Data?.faces?.mode || 'indeterminado';
      state.canonicalRotation =
        state.v2Data?.orientation_canonical?.canonical_pose?.rotation_matrix_world ||
        state.v2Data?.normalization?.rotation_matrix ||
        state.v2Data?.orientation?.canonical_transform?.rotation ||
        null;

      // Alinear origen visual con el centro canónico (COM/fallback del backend)
      // para que ejes y geometría compartan exactamente el mismo pivote.
      const backendCenter = state.v2Data?.normalization?.center;
      if (Array.isArray(backendCenter) && backendCenter.length >= 3) {
        const cx = Number(backendCenter[0]);
        const cy = Number(backendCenter[1]);
        const cz = Number(backendCenter[2]);
        if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(cz)) {
          state.center = { x: cx, y: cy, z: cz };
          _precomputeCMDistances();
        }
      }

      state.pcaAxes = extractPcaAxes(result);
      state.lastMetrics = result;
      state.metricsComputed = true;
      _syncContourBtn();
      _syncContour2dControls();
      _syncExportDropBtn();
      setOrientationOverrideControlsEnabled(true);

      // Generar homologación bifacial (FRONT/BACK) en segundo plano
      metricsEl.textContent = 'Generando homologación bifacial (caras canónicas)...';
      try {
        await fetchFrontBackHomologation();
      } catch (err) {
        console.warn('[OBJ3D] Homologación bifacial no disponible:', err.message);
        // No es fatal — continúa con el análisis 3D puro
      }
      metricsEl.textContent = '';


      // Coherencia visual-semántica: en v2 canónico por caras formales,
      // mostrar ejes del modelo (XYZ) por defecto y no PCA.
      const canonicalMethod = String(state.v2Data?.orientation_canonical?.method || '').toLowerCase();
      const formalFacesLocked = !!state.v2Data?.orientation_canonical?.gravitational?.formal_faces_locked;
      const isFormalCanonical = formalFacesLocked || canonicalMethod.includes('faces_dominant');
      if (isFormalCanonical) {
        state.axesMode = 'model';
        if (axesModeSelect) axesModeSelect.value = 'model';

        // Evita lectura espacial ambigua (ángulo lateral) en piezas canónicas:
        // la referencia formal debe mostrarse frontal y ortográfica.
        state.projectionMode = 'orthographic';
        if (projectionSelect) projectionSelect.value = 'orthographic';

        // Bloqueo de rotación para conservar pose canónica estable en pantalla.
        state.rotationLocked = true;
        state.autoRotate = false;
        if (autoRotateCheck) autoRotateCheck.checked = false;
        if (state.rafId) {
          cancelAnimationFrame(state.rafId);
          state.rafId = null;
        }
      } else {
        state.rotationLocked = false;
      }

      renderMetrics(result);
      updateBasicInfo();

      // Navegar al panel de Análisis 3D en el sidebar al completar el análisis
      if (typeof window.maoActivatePanel === 'function') {
        window.maoActivatePanel('sectionAnalisis3D');
      }
      
      // Aplicar SIEMPRE la vista canónica esperada automáticamente.
      // Los botones quedan como navegación complementaria, no como requisito.
      const autoView = getAutomaticCanonicalView(state.v2Data);
      applyPredefinedView(autoView);

      render();
      updateSaveButtonState();
      updateIndependentSaveButtonState();
      const ev = getPipelineEvidence(result);
      if (!ev.hasV2Level) {
        setStatus('Advertencia: respuesta sin nivel v2. No se puede verificar pipeline pre-PCA en este servidor.', true);
      } else {
        const rule = state.v2Data?.orientation_canonical?.axis_definition?.longitudinal?.rule || '-';
        const modeNote = !preserveOverride
          ? 'Orientación esperada y vista canónica aplicadas automáticamente (ancla morfológica y Z contorno evaluados por el sistema).'
          : `Override visual aplicado: ${requestOrientationMode}.`;
        setStatus(`Análisis v2 completo: ${state.faceMode} (${state.v2Data?.segmentation?.patches_found || 0} parches, ${state.v2Data?.segmentation?.face_pairs_detected || 0} pares). Eje X: ${rule}. ${modeNote}`);
      }
    } catch (err) {
      console.error('[OBJ3D] Error solicitando análisis v2:', err);
      metricsEl.innerHTML = `<div>Error en v2: ${err?.message || 'desconocido'}</div>`;
      setStatus('Falló el análisis v2 en backend. Revisa el servidor Python.', true);
      updateSaveButtonState();
      updateIndependentSaveButtonState();
    }
  }

  // Eventos UI
  input.addEventListener('change', () => {
    const file = input.files && input.files[0] ? input.files[0] : null;
    state.file = file;
    loadBtn.disabled = !file;
    analyzeBtn.disabled = true;
    metricsEl.textContent = 'No calculadas.';
    state.lastMetrics = null;
    state.metricsComputed = false;
    updateSaveButtonState();
    updateIndependentSaveButtonState();

    window.dispatchEvent(new CustomEvent('mao:obj3d-file-changed', {
      detail: { fileName: file?.name || null, fileBaseName: getObj3dFileBaseName() || null }
    }));

    if (file) {
      setStatus(`Archivo seleccionado: ${file.name}`);
    } else {
      setStatus('Seleccione un archivo .obj para iniciar.');
    }
  });

  loadBtn.addEventListener('click', () => {
    loadObjAndRender().catch((err) => {
      console.error(err);
      setStatus('Error inesperado al cargar OBJ.', true);
    });
  });

  analyzeBtn.addEventListener('click', () => {
    analyzeObj3d({ preserveOverride: false }).catch((err) => {
      console.error(err);
      setStatus('Error inesperado al calcular métricas.', true);
    });
  });

  saveBtn?.addEventListener('click', () => {
    saveObj3dAnalysis().catch((err) => {
      console.error(err);
      setStatus('Error inesperado al guardar análisis 3D.', true);
    });
  });

  saveJsonBtn?.addEventListener('click', () => {
    saveObj3dJsonIndependent().catch((err) => {
      console.error(err);
      setStatus('Error inesperado al exportar JSON 3D.', true);
    });
  });

  morphBtn?.addEventListener('click', async () => {
    // Si los datos bifaciales no están listos (ej. fallo silencioso de red), los obtiene ahora.
    if (!state.front_back_homologated_data || state.front_back_homologated_data.status !== 'ok') {
      setStatus('Obteniendo datos de caras canónicas...', false);
      await fetchFrontBackHomologation();
    }
    const dualRecords = buildObj3dDualRecords();
    if (!Array.isArray(dualRecords) || dualRecords.length !== 2) {
      setStatus('No se pudieron obtener los datos bifaciales. Verifica que el servidor esté activo.', true);
      return;
    }
    if (typeof window.inyectarObjetosDesdeObj3d !== 'function') {
      setStatus('Error: pipeline morfológico 2D no disponible.', true);
      return;
    }
    window.inyectarObjetosDesdeObj3d(dualRecords);
    setStatus('Tarjetas morfológicas generadas (anverso + reverso). Desplázate al área de objetos para analizarlos.', false);
    if (window.toast?.success) window.toast.success('Tarjetas de contorno 3D generadas. Abre el análisis en cada tarjeta.');
  });

  // Cambios de proyecto/identificación ocurren fuera de este módulo.
  // Sincronizamos el estado del botón de guardado con baja frecuencia.
  setInterval(updateSaveButtonState, 1200);
  setInterval(() => {
    // Tarjetas morfológicas disponibles en cuanto Z Contorno se ha ejecutado con éxito.
    if (morphBtn) morphBtn.disabled = !(state.metricsComputed && state.orientationOverrideMode === 'contour_variance_normal');
  }, 1200);
  setInterval(updateIndependentSaveButtonState, 1200);

  // Helper de diagnóstico manual desde DevTools.
  window._obj3dSaveDiagnostics = function () {
    const ident = getEffectiveIdentification();
    return {
      hasProject: !!window.projectManager?.activeProject,
      activeProject: window.projectManager?.activeProject?.name || null,
      hasMetrics: !!state.lastMetrics,
      hasFile: !!state.file,
      fileName: state.file?.name || null,
      hasIdentification: !!ident,
      identification: ident || null,
      buttonDisabled: !!saveBtn?.disabled,
      buttonTitle: saveBtn?.title || null,
      lastSaveGateReason: state.lastSaveGateReason,
      independentJsonSaveDisabled: !!saveJsonBtn?.disabled,
      independentJsonSaveTitle: saveJsonBtn?.title || null,
    };
  };

  // ── Controles de zoom ─────────────────────────────────────────────────────
  function _applyZoomPct(pct) {
    const v = parseFloat(pct);
    if (!isFinite(v)) return;
    state.zoom = Math.max(0.10, Math.min(8.0, v / 100));
    render();
  }

  zoomOutBtn?.addEventListener('click', () => {
    state.zoom = Math.max(0.10, state.zoom / 1.15);
    render();
  });

  zoomInBtn?.addEventListener('click', () => {
    state.zoom = Math.min(8.0, state.zoom * 1.15);
    render();
  });

  zoomPctInput?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { _applyZoomPct(zoomPctInput.value); zoomPctInput.blur(); }
  });

  zoomPctInput?.addEventListener('change', () => {
    _applyZoomPct(zoomPctInput.value);
  });

  // Evita scroll accidental de la página al usar la rueda sobre el input de zoom
  zoomPctInput?.addEventListener('wheel', (ev) => { ev.preventDefault(); }, { passive: false });

  resetViewBtn?.addEventListener('click', () => {
    resetView();
  });

  fitViewBtn?.addEventListener('click', () => {
    fitView();
    render();
  });

  exportPngBtn?.addEventListener('click', () => {
    exportCanvasPng();
  });

  // ── Exportar 3D dropdown ────────────────────────────────────────────────
  // Toggle visibilidad del menú
  exportDropBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!exportMenu) return;
    const open = exportMenu.style.display !== 'none';
    exportMenu.style.display = open ? 'none' : 'block';
  });

  // Cerrar el menú al hacer clic fuera
  document.addEventListener('click', (e) => {
    if (exportMenu && !exportMenu.contains(e.target) && e.target !== exportDropBtn) {
      exportMenu.style.display = 'none';
    }
  });

  // Ítems del menú de exportación
  exportMenu?.addEventListener('click', async (e) => {
    const item = e.target.closest('.obj3d-export-item');
    if (!item) return;
    exportMenu.style.display = 'none';
    const fmt = item.dataset.fmt;
    const exp = window.Obj3dExport;
    if (!exp) { window.toast?.error('Módulo de exportación 3D no disponible.'); return; }

    if (fmt === 'csv')       { exp.exportCSV(state.lastMetrics); }
    else if (fmt === 'png')  { exp.exportCanvasPNG(); }
    else if (fmt === 'svg')  { exp.exportSVG(state.lastMetrics); }
    else if (fmt === 'pdf')  { await exp.exportPDF(state.lastMetrics); }
    else if (fmt === 'panel-png') {
      // Captura la pestaña activa del panel Datos 3D
      const activeTab = document.querySelector('.obj3d-dp-tab--active');
      const paneId = activeTab?.dataset?.pane || 'resumen';
      await exp.exportPanelPNG(paneId);
    }
  });

  // Habilitar/deshabilitar el botón de exportación según estado
  function _syncExportDropBtn() {
    if (!exportDropBtn) return;
    exportDropBtn.disabled = !state.lastMetrics;
  }

  // Exponer helpers de nombre de archivo al módulo Obj3dExport
  window._obj3dGetFileBaseName = () => getObj3dFileBaseName?.() || null;
  window._obj3dGetAssignedIdentification = () => getAssignedIdentification?.() || null;

  function _pickNearestVertex(canvasX, canvasY) {
    if (!state.vertices.length) return null;
    const rotated = state.vertices.map(rotatePoint);
    const projected = rotated.map(projectPoint);
    let bestIdx = -1;
    let bestD2 = Infinity;
    for (let i = 0; i < projected.length; i++) {
      const p = projected[i];
      if (!p) continue;
      const dx = p.x - canvasX;
      const dy = p.y - canvasY;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestIdx = i;
      }
    }
    if (bestIdx < 0 || bestD2 > 26 * 26) return null;
    return {
      index: bestIdx,
      point: state.vertices[bestIdx],
      dist2: bestD2,
    };
  }

  setMorphAnchorBtn?.addEventListener('click', () => {
    if (!state.vertices.length) {
      setStatus('Carga un OBJ antes de definir el ancla morfol\xF3gica.', true);
      return;
    }
    if (!state.metricsComputed) {
      setStatus('Calcula m\xE9tricas PCA primero; luego puedes aplicar ancla morfol\xF3gica como override visual.', true);
      return;
    }
    // Ancla activa → limpiar y re-analizar sin override
    if (state.userMorphAnchor) {
      state.userMorphAnchor = null;
      state.userMorphAnchorIndex = null;
      state.awaitingMorphAnchorPick = false;
      state.orientationOverrideMode = null;
      canvas.style.cursor = 'grab';
      _syncMorphAnchorBtn();
      setStatus('Ancla morfol\xF3gica eliminada. Recalculando orientaci\xF3n autom\xE1tica...');
      analyzeObj3d({ preserveOverride: false }).catch((err) => {
        console.error(err);
        setStatus('No se pudo recalcular sin ancla morfol\xF3gica.', true);
      });
      return;
    }
    // En modo de selecci\xF3n → cancelar
    if (state.awaitingMorphAnchorPick) {
      state.awaitingMorphAnchorPick = false;
      canvas.style.cursor = 'grab';
      _syncMorphAnchorBtn();
      setStatus('Selecci\xF3n de ancla morfol\xF3gica cancelada.');
      return;
    }
    // Normal → entrar en modo de selecci\xF3n
    state.awaitingMorphAnchorPick = true;
    state.orientationOverrideMode = 'user_morphological_axis';
    canvas.style.cursor = 'crosshair';
    _syncMorphAnchorBtn();
    setStatus('Haz clic sobre el objeto para fijar el punto de orientaci\xF3n morfol\xF3gica (override visual sobre la orientaci\xF3n autom\xE1tica).');
  });

  setContourZBtn?.addEventListener('click', () => {
    if (!state.vertices.length) {
      setStatus('Carga un OBJ antes de activar Z por varianza de contorno.', true);
      return;
    }
    if (!state.metricsComputed) {
      setStatus('Calcula métricas PCA primero; luego puedes aplicar Z contorno como override visual.', true);
      return;
    }

    state.awaitingMorphAnchorPick = false;
    state.orientationOverrideMode = 'contour_variance_normal';
    canvas.style.cursor = 'grab';
    setStatus('Modo Z contorno activado como override visual. Recalculando orientación...');

    analyzeObj3d({ preserveOverride: true }).catch((err) => {
      console.error(err);
      setStatus('No se pudo recalcular en modo Z contorno.', true);
    });
  });

  showFacesCheck?.addEventListener('change', () => {
    state.showFaces = !!showFacesCheck.checked;
    updateBasicInfo();
    render();
  });

  showWireCheck?.addEventListener('change', () => {
    state.showWireframe = !!showWireCheck.checked;
    updateBasicInfo();
    render();
  });

  showAxesCheck?.addEventListener('change', () => {
    state.showAxes = !!showAxesCheck.checked;
    render();
  });

  showPcaAxesCheck?.addEventListener('change', () => {
    state.showPcaAxes = !!showPcaAxesCheck.checked;
    render();
  });

  autoRotateCheck?.addEventListener('change', () => {
    if (state.rotationLocked) {
      state.autoRotate = false;
      autoRotateCheck.checked = false;
      setStatus('Rotación automática desactivada: pose canónica bloqueada por caras formales.');
      render();
      return;
    }
    state.autoRotate = !!autoRotateCheck.checked;
    ensureAnimation();
    if (!state.autoRotate) render();
  });

  cullBackfacesCheck?.addEventListener('change', () => {
    state.cullBackfaces = !!cullBackfacesCheck.checked;
    render();
  });

  document.getElementById('obj3dRoughnessGamma')?.addEventListener('change', () => render());

  projectionSelect?.addEventListener('change', () => {
    state.projectionMode = projectionSelect.value === 'orthographic' ? 'orthographic' : 'perspective';
    updateBasicInfo();
    render();
  });

  axesModeSelect?.addEventListener('change', () => {
    if (state.rotationLocked && axesModeSelect.value === 'pca') {
      state.axesMode = 'model';
      axesModeSelect.value = 'model';
      setStatus('Modo PCA desactivado: en pose canónica bloqueada se usan ejes del modelo (XYZ).');
      updateBasicInfo();
      render();
      return;
    }
    state.axesMode = axesModeSelect.value === 'pca' ? 'pca' : 'model';
    if (state.axesMode === 'pca' && !state.pcaAxes) {
      setStatus('Modo ejes PCA activo. Calcula métricas PCA para visualizar PC1-PC3.');
    }
    updateBasicInfo();
    render();
  });

  lightSlider?.addEventListener('input', () => {
    state.lightPower = Math.max(0, Math.min(1, Number(lightSlider.value) / 100));
    render();
  });

  // Toggle «Mostrar» — activa/desactiva textura ya cargada
  document.addEventListener('click', (ev) => {
    if (ev.target && ev.target.id === 'obj3dTextureBtn') {
      const hasSource = _isTexture(state.textureImage) || state.vertexColors.length > 0;
      if (!hasSource) return;
      state.showTexture = !state.showTexture;
      _syncTextureBtn();
      render();
    }

    if (ev.target && ev.target.id === 'obj3dDepthColorBtn') {
      if (!state.vertices.length) return;
      state.showDepthColor = !state.showDepthColor;
      if (state.showDepthColor) {
        state.showRoughnessColor = false;
        const _rn = document.getElementById('obj3dRoughnessBtn');
        if (_rn) { _rn.classList.remove('btn-success'); _rn.classList.add('btn-muted'); }
        const _rg = document.getElementById('obj3dRoughnessGamma');
        if (_rg) _rg.style.display = 'none';
      }
      ev.target.classList.toggle('btn-success', state.showDepthColor);
      ev.target.classList.toggle('btn-muted',   !state.showDepthColor);
      render();
    }

    if (ev.target && ev.target.id === 'obj3dRoughnessBtn') {
      if (!state.vertices.length) return;
      state.showRoughnessColor = !state.showRoughnessColor;
      if (state.showRoughnessColor) {
        state.showDepthColor = false;
        const _dc = document.getElementById('obj3dDepthColorBtn');
        if (_dc) { _dc.classList.remove('btn-success'); _dc.classList.add('btn-muted'); }
      }
      // Mostrar u ocultar el selector gamma según el estado del modo
      const _rg = document.getElementById('obj3dRoughnessGamma');
      if (_rg) _rg.style.display = state.showRoughnessColor ? 'inline-block' : 'none';
      ev.target.classList.toggle('btn-success', state.showRoughnessColor);
      ev.target.classList.toggle('btn-muted',   !state.showRoughnessColor);
      render();
    }

    // Toggle «Contornos» — activa/desactiva overlay de contornos canónicos
    if (ev.target && ev.target.id === 'obj3dContourBtn') {
      if (!state.metricsComputed) return;
      state.showContourOverlay = !state.showContourOverlay;
      _syncContourBtn();
      render();
    }

    // Chips de tipo de sección
    if (ev.target && ev.target.id === 'obj3dSecTransBtn') {
      state.showTransverseSections = !state.showTransverseSections;
      _syncContourBtn();
      render();
    }
    if (ev.target && ev.target.id === 'obj3dSecCorBtn') {
      state.showCoronalSections = !state.showCoronalSections;
      _syncContourBtn();
      render();
    }
    if (ev.target && ev.target.id === 'obj3dSecFrBtn') {
      state.showFrontalSections = !state.showFrontalSections;
      _syncContourBtn();
      render();
    }
  });

  // Selector de archivo de textura — carga manual
  document.addEventListener('change', (ev) => {
    if (ev.target && ev.target.id === 'obj3dTextureInput') {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
          state.textureImage = _scaleTexture(img, 1024);
          state.textureName  = file.name;
          state.showTexture  = true;
          _syncTextureBtn();
          render();
        };
        img.onerror = function () {
          setStatus('No se pudo cargar la imagen de textura.', true);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
      // Permitir reseleccionar el mismo archivo
      ev.target.value = '';
    }
  });

  // Interacción canvas
  canvas.addEventListener('mousedown', (ev) => {
    if (state.awaitingMorphAnchorPick) {
      const rect = canvas.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;
      const pick = _pickNearestVertex(px, py);
      if (!pick) {
        setStatus('No se encontró vértice cercano. Intenta hacer clic más cerca del contorno.', true);
        return;
      }

      state.userMorphAnchorIndex = pick.index;
      state.userMorphAnchor = { x: Number(pick.point.x), y: Number(pick.point.y), z: Number(pick.point.z) };
      state.awaitingMorphAnchorPick = false;
      canvas.style.cursor = 'grab';
      _syncMorphAnchorBtn();
      render();
      setStatus('Ancla morfol\xF3gica fijada como override visual. Recalculando orientaci\xF3n...');
      analyzeObj3d({ preserveOverride: true }).catch((err) => {
        console.error(err);
        setStatus('No se pudo recalcular con ancla morfológica.', true);
      });
      return;
    }

    if (state.rotationLocked) {
      setStatus('Vista canónica bloqueada: usa FRONT/BACK como referencia principal; LEFT/RIGHT/TOP/BOT son complementarias.');
      return;
    }
    state.dragging = true;
    state.lastX = ev.clientX;
    state.lastY = ev.clientY;
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('mouseup', () => {
    state.dragging = false;
    canvas.style.cursor = 'grab';
  });

  canvas.addEventListener('mousemove', (ev) => {
    if (!state.dragging) return;
    const dx = ev.clientX - state.lastX;
    const dy = ev.clientY - state.lastY;
    state.lastX = ev.clientX;
    state.lastY = ev.clientY;

    state.rotY += dx * 0.008;
    state.rotX += dy * 0.008;
    render();
  });

  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const k = ev.deltaY < 0 ? 1.08 : 0.92;
    state.zoom = Math.max(0.2, Math.min(8, state.zoom * k));
    render();
  }, { passive: false });

  canvas.addEventListener('dblclick', () => {
    fitView();
    render();
  });

  window.addEventListener('keydown', (ev) => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

    if (ev.key === 'r' || ev.key === 'R') {
      resetView();
    }
  });

  // Listener para cambiar vista predefinida (desde botones HTML)
  window.addEventListener('obj3d:apply-view', (ev) => {
    const viewName = ev.detail?.view;
    if (viewName) {
      applyPredefinedView(viewName);
    }
  });

  // ── Análisis Contorno ────────────────────────────────────────────────────

  const _c2dPanel = () => document.getElementById('obj3dContour2dPanel');

  /** Limpia o reconstruye el bloque "Análisis Contorno" según el estado actual */
  function _syncContour2dControls() {
    const panel = _c2dPanel();
    if (!panel) return;
    if (!state.metricsComputed || !state.v2Data) {
      panel.innerHTML = '<span style="font-size:10px;color:var(--gray-500);">Ejecuta el análisis 3D para explorar los contornos canónicos.</span>';
      return;
    }
    _renderContourList();
  }

  /** Construye la tabla-resumen con todos los contornos y sus métricas básicas */
  function _renderContourList() {
    const panel = _c2dPanel();
    if (!panel || !state.v2Data) return;

    const mao2d    = state.v2Data.mao2d_adapted || {};
    const planes   = (mao2d.oriented_2d || {}).planes || {};
    const fb       = (mao2d.canonical_contours || {}).front_back || {};
    const _mc      = state.v2Data.morphology_canonical;
    const _mcSecs  = Array.isArray(_mc?.transverse_sections) ? _mc.transverse_sections : null;
    const _maoSecs = (mao2d.canonical_contours || {}).transverse_sections;
    const rawSections = _mcSecs || (Array.isArray(_maoSecs) ? _maoSecs : null) || [];
    console.debug('[Análisis Contorno] mc:', _mc ? Object.keys(_mc) : 'null',
      '| transv:', _mcSecs?.length ?? 'N/A', '| mao:', Array.isArray(_maoSecs) ? _maoSecs.length : 'N/A');
    const rawCoronalSections  = Array.isArray(_mc?.coronal_sections)  ? _mc.coronal_sections  : [];
    const rawFrontalSections  = Array.isArray(_mc?.frontal_sections)  ? _mc.frontal_sections  : [];

    const fmtN = (v, d = 3) => {
      if (typeof v !== 'number' || !isFinite(v)) return '—';
      if (Math.abs(v) > 0 && Math.abs(v) < 0.001) return v.toExponential(2);
      return v.toFixed(d);
    };

    // ── Helpers de color ──────────────────────────────────────────────────────
    const dotColors = { front:'#1565c0', back:'#1b5e20', lateral_xz:'#bf360c', transversal_yz:'#6a1b9a' };
    const transvColor = t => {
      const r = Math.round(230 - t*228), g = Math.round(101 + t*18), b = Math.round(t*189);
      return `rgb(${r},${g},${b})`;
    };
    const coronalColor = t => {
      const r = Math.round(46 + t*60), g = Math.round(125 - t*98), b = Math.round(50 + t*104);
      return `rgb(${r},${g},${b})`;
    };
    const frontalColor = t => {
      const r = Math.round(194 - t*148), g = Math.round(124 + t*28), b = Math.round(30 + t*155);
      return `rgb(${r},${g},${b})`;
    };
    const swatch = (color, round = false) =>
      `<span style="display:inline-block;width:8px;height:8px;border-radius:${round?'50%':'1px'};
       background:${color};margin-right:4px;flex-shrink:0;vertical-align:middle;"></span>`;

    // ── Filas: clic = selección persistente · hover = visual CSS ─────────────
    const row = (key, label, color, area, round = false, group = '') =>
      `<tr class="c2d-row${group ? ` c2d-g-${group}` : ''}" data-c2d-key="${key}" style="cursor:pointer;transition:background .12s;"
          onmouseenter="if(!this.dataset.selected)this.style.background='var(--gray-100,#f5f5f5)'"
          onmouseleave="if(!this.dataset.selected)this.style.background=''">
        <td style="padding:4px 8px;white-space:nowrap;max-width:155px;overflow:hidden;text-overflow:ellipsis;">
          ${swatch(color, round)}<span style="font-size:9px;">${label}</span>
        </td>
        <td style="padding:4px 8px 4px 0;text-align:right;font-variant-numeric:tabular-nums;font-size:9px;color:var(--gray-500);">
          ${fmtN(area, 4)}
        </td>
      </tr>`;

    const noSections = rawSections.length === 0
      ? `<tr><td colspan="2" style="padding:4px 8px;font-size:9px;color:#b00020;">
           Sin cortes · mc:${_mcSecs?.length ?? '—'} mao:${Array.isArray(_maoSecs)?_maoSecs.length:'—'}
         </td></tr>`
      : '';

    const hdr = (t, groupKey) =>
      `<tr class="c2d-group-hdr" data-c2d-toggle="${groupKey}"
           style="cursor:pointer;user-select:none;">
        <td colspan="2" style="padding:5px 8px 3px;font-size:9px;font-weight:700;
          color:var(--gray-500);background:var(--gray-50,#fafafa);
          text-transform:uppercase;letter-spacing:.04em;
          border-bottom:1px solid var(--border-color,#e0e0e0);">
          <span data-c2d-arrow="${groupKey}"
                style="display:inline-block;font-size:8px;margin-right:3px;
                       transition:transform .15s;">▾</span>${t}
        </td>
      </tr>`;

    const projRows = [
      row('front',          'Cara A (anv.)',    dotColors.front,          fb.front?.metrics_xy?.area,  true,  'principal'),
      row('back',           'Cara B (rev.)',    dotColors.back,           fb.back?.metrics_xy?.area,   true,  'principal'),
      row('lateral_xz',    'Perfil XZ',        dotColors.lateral_xz,     planes.lateral_xz?.area,     true,  'principal'),
      row('transversal_yz','Sección global YZ', dotColors.transversal_yz, planes.transversal_yz?.area, true,  'principal'),
    ].join('');

    const secRows = rawSections.map((s, i) => {
      const t = rawSections.length > 1 ? i / (rawSections.length - 1) : 0.5;
      const pct = isFinite(+s.x_relative) ? Math.round(+s.x_relative * 100) : i * 12;
      return row(`section_${i}`, `#${i+1} · ${pct}%`, transvColor(t), s.metrics?.area, false, 'transversal');
    }).join('');

    const coronalRows = rawCoronalSections.map((s, i) => {
      const t = rawCoronalSections.length > 1 ? i / (rawCoronalSections.length - 1) : 0.5;
      const pct = isFinite(+s.y_relative) ? Math.round(+s.y_relative * 100) : i * 12;
      return row(`coronal_${i}`, `#${i+1} · ${pct}%`, coronalColor(t), s.metrics?.area, false, 'coronal');
    }).join('');

    const frontalRows = rawFrontalSections.map((s, i) => {
      const t = rawFrontalSections.length > 1 ? i / (rawFrontalSections.length - 1) : 0.5;
      const pct = isFinite(+s.z_relative) ? Math.round(+s.z_relative * 100) : i * 12;
      return row(`frontal_${i}`, `#${i+1} · ${pct}% prof.`, frontalColor(t), s.metrics?.area, false, 'frontal');
    }).join('');

    // ── Layout: lista fija izquierda + panel detalle derecho ─────────────────
    panel.innerHTML = `
      <div style="display:flex;gap:0;border:1px solid var(--border-color);border-radius:6px;
                  overflow:hidden;background:var(--bg-primary,#fff);">

        <!-- LISTA (fija 170px, scroll independiente) -->
        <div class="c2d-list-col"
             style="flex:0 0 170px;
                    border-right:1px solid var(--border-color);
                    overflow-y:auto;overflow-x:hidden;
                    max-height:460px;">
          <table style="width:100%;border-collapse:collapse;">
            <colgroup><col><col style="width:48px;"></colgroup>
            <thead>
              <tr style="position:sticky;top:0;z-index:1;border-bottom:1px solid var(--border-color);
                         background:var(--gray-50,#fafafa);">
                <th style="padding:4px 8px;text-align:left;font-size:8.5px;font-weight:600;
                            color:var(--gray-500);letter-spacing:.04em;">CONTORNO</th>
                <th style="padding:4px 8px 4px 0;text-align:right;font-size:8.5px;font-weight:600;
                            color:var(--gray-500);letter-spacing:.04em;">ÁREA</th>
              </tr>
            </thead>
            <tbody>
              ${hdr('Contornos principales', 'principal')}
              ${projRows}
              ${hdr(`Transversales YZ · ${rawSections.length}`, 'transversal')}
              ${noSections}${secRows}
              ${hdr(`Coronales XZ · ${rawCoronalSections.length}`, 'coronal')}
              ${coronalRows}
              ${hdr(`Frontales XY · ${rawFrontalSections.length}`, 'frontal')}
              ${frontalRows}
            </tbody>
          </table>
        </div>

        <!-- PANEL DETALLE (flex:1) -->
        <div style="flex:1;min-width:0;padding:10px 12px;
                    background:var(--bg-primary,#fff);">

          <!-- Placeholder vacío -->
          <div id="obj3dContourDetailEmpty"
               style="display:flex;align-items:center;justify-content:center;
                      min-height:140px;color:var(--gray-400);font-size:11px;
                      text-align:center;line-height:1.7;">
            Haz clic en un contorno<br>de la lista para explorar
          </div>

          <!-- Contenido (oculto hasta selección) -->
          <div id="obj3dContourDetailContent" style="display:none;">

            <!-- Título + botón ampliar -->
            <div style="display:flex;align-items:center;justify-content:space-between;
                        padding-bottom:6px;margin-bottom:8px;
                        border-bottom:1px solid var(--border-color);">
              <span id="obj3dContourDetailTitle"
                    style="font-weight:700;font-size:11px;color:var(--gray-800);"></span>
              <button id="obj3dZoomOpenBtn" title="Abrir vista ampliada con zoom"
                      style="padding:1px 8px;font-size:9px;
                             border:1px solid var(--border-color);border-radius:4px;
                             background:transparent;cursor:pointer;
                             color:var(--gray-600);
                             transition:background .12s;">⊕ Ampliar</button>
            </div>

            <!-- Canvas + métricas rápidas (apilados: canvas arriba, métricas abajo) -->
            <div style="margin-bottom:9px;">
              <canvas id="obj3dContourPreviewCanvas" width="440" height="260"
                style="display:block;width:100%;max-width:440px;height:260px;
                       border:1px solid var(--border-color);border-radius:4px;
                       background:var(--bg-secondary,#f8f9fa);"></canvas>
              <div id="obj3dContourPreviewMeta"
                   style="margin-top:7px;font-size:9.5px;line-height:1.7;
                          color:var(--gray-700);"></div>
            </div>

            <!-- Botón Calcular -->
            <button id="obj3dCalcFullMetricsBtn"
              style="width:100%;padding:5px 8px;font-size:10px;text-align:left;cursor:pointer;
                     background:var(--gray-100,#f5f5f5);color:var(--gray-700);
                     border:1px solid var(--border-color);border-radius:4px;margin-bottom:4px;">
              ▶ Calcular métricas completas
            </button>

            <!-- Botón Análisis Morfológico (puente 2D↔3D) -->
            <button id="obj3dMorphAnalysisBtn"
              style="width:100%;padding:6px 8px;font-size:10px;font-weight:700;
                     text-align:center;cursor:pointer;letter-spacing:.04em;
                     background:linear-gradient(135deg,#1565c0,#0d47a1);color:#fff;
                     border:none;border-radius:4px;margin-bottom:2px;">
              🔬 ANÁLISIS MORFOLÓGICO
            </button>

            <!-- Resultado API -->
            <div id="obj3dContour2dDetail" style="display:none;font-size:9px;"></div>

          </div>
        </div>

      </div>
    `;

    // Clic en fila → selección persistente (canvas + métricas)
    // Clic en cabecera de grupo → colapsar / expandir
    const listCol = panel.querySelector('.c2d-list-col');
    if (listCol) {
      listCol.addEventListener('click', ev => {
        const r = ev.target.closest('.c2d-row');
        if (r?.dataset?.c2dKey) { _selectContour(r.dataset.c2dKey); return; }

        const hdrEl = ev.target.closest('[data-c2d-toggle]');
        if (hdrEl) {
          const g = hdrEl.dataset.c2dToggle;
          const rows = listCol.querySelectorAll(`.c2d-g-${g}`);
          const arrow = listCol.querySelector(`[data-c2d-arrow="${g}"]`);
          const isCollapsed = rows.length > 0 && rows[0].style.display === 'none';
          rows.forEach(tr => { tr.style.display = isCollapsed ? '' : 'none'; });
          if (arrow) arrow.style.transform = isCollapsed ? '' : 'rotate(-90deg)';
        }
      });
    }

    // Botón Calcular → llama a la API con la selección activa
    const calcBtn = panel.querySelector('#obj3dCalcFullMetricsBtn');
    if (calcBtn) {
      calcBtn.addEventListener('click', () => {
        if (state._c2dSelectedKey) _runContour2dAnalysis(state._c2dSelectedKey);
      });
    }

    // Botón Análisis Morfológico → modal completo (puente 2D↔3D)
    const morphBtn = panel.querySelector('#obj3dMorphAnalysisBtn');
    if (morphBtn) {
      morphBtn.addEventListener('click', () => {
        if (state._c2dSelectedKey) _openMorphAnalysisModal(state._c2dSelectedKey);
      });
    }

    // Botón Ampliar → abre modal de zoom
    const zoomBtn = panel.querySelector('#obj3dZoomOpenBtn');
    if (zoomBtn) {
      zoomBtn.addEventListener('click', () => {
        if (state._c2dSelectedKey) _openContourZoomModal(state._c2dSelectedKey);
      });
    }
  }

  /** Devuelve las métricas básicas de un contorno por su clave */
  function _getContourMetricsForKey(key) {
    if (!state.v2Data) return null;
    const mao2d  = state.v2Data.mao2d_adapted || {};
    const planes = (mao2d.oriented_2d || {}).planes || {};
    const fb     = (mao2d.canonical_contours || {}).front_back || {};
    const _mc    = state.v2Data.morphology_canonical;
    if (key === 'front')          return { ...fb.front?.metrics_xy };
    if (key === 'back')           return { ...fb.back?.metrics_xy };
    if (key === 'lateral_xz')    return { ...planes.lateral_xz };
    if (key === 'transversal_yz')return { ...planes.transversal_yz };
    if (key.startsWith('section_')) {
      const idx = parseInt(key.replace('section_', ''), 10);
      const secs = Array.isArray(_mc?.transverse_sections) ? _mc.transverse_sections : [];
      const s = secs[idx]; if (!s) return null;
      const d = s.section_dims || {};
      return { ...s.metrics,
        _dims: `W:${(d.width_y||0).toFixed(3)}  T:${(d.thickness_z||0).toFixed(3)}` };
    }
    if (key.startsWith('coronal_')) {
      const idx = parseInt(key.replace('coronal_', ''), 10);
      const cors = Array.isArray(_mc?.coronal_sections) ? _mc.coronal_sections : [];
      const s = cors[idx]; if (!s) return null;
      const d = s.section_dims || {};
      return { ...s.metrics,
        _dims: `L:${(d.length_x||0).toFixed(3)}  T:${(d.thickness_z||0).toFixed(3)}` };
    }
    if (key.startsWith('frontal_')) {
      const idx = parseInt(key.replace('frontal_', ''), 10);
      const frs = Array.isArray(_mc?.frontal_sections) ? _mc.frontal_sections : [];
      const s = frs[idx]; if (!s) return null;
      const d = s.section_dims || {};
      return { ...s.metrics,
        _dims: `L:${(d.length_x||0).toFixed(3)}  W:${(d.width_y||0).toFixed(3)}` };
    }
    return null;
  }

  /** Selecciona un contorno: fija resaltado en lista + canvas + métricas rápidas */
  function _selectContour(key) {
    state._c2dSelectedKey = key;

    // Fija el resaltado en la lista
    document.querySelectorAll('.c2d-row').forEach(r => {
      const sel = r.dataset.c2dKey === key;
      r.style.background  = sel ? 'var(--blue-50,#e3f2fd)' : '';
      r.dataset.selected  = sel ? '1' : '';
    });

    // Muestra panel de detalle, oculta placeholder
    const empty   = document.getElementById('obj3dContourDetailEmpty');
    const content = document.getElementById('obj3dContourDetailContent');
    if (empty)   empty.style.display   = 'none';
    if (content) content.style.display = 'block';

    // Actualiza título
    const entry   = _getSelectedContourPoints(key);
    const titleEl = document.getElementById('obj3dContourDetailTitle');
    if (titleEl && entry) titleEl.textContent = entry.label;

    // Limpia resultado anterior de API y resetea botones
    const detailEl = document.getElementById('obj3dContour2dDetail');
    if (detailEl) { detailEl.style.display = 'none'; detailEl.innerHTML = ''; }
    const calcBtn  = document.getElementById('obj3dCalcFullMetricsBtn');
    if (calcBtn)  { calcBtn.disabled = false; calcBtn.textContent = '▶ Calcular métricas completas'; }
    const morphBtn = document.getElementById('obj3dMorphAnalysisBtn');
    if (morphBtn) { morphBtn.disabled = false; morphBtn.textContent = '🔬 ANÁLISIS MORFOLÓGICO'; }

    // Dibuja contorno + métricas rápidas en el panel detalle
    _drawContourPreview(key);
  }

  /** Devuelve la escala global común (px por unidad) basada en el contorno más grande
   *  disponible, para que todos los contornos se dibujen a la misma escala física. */
  function _getGlobalContourScale(W, H, pad) {
    const mc = state.v2Data?.morphology_canonical;
    const allKeys = ['front', 'back', 'lateral_xz', 'transversal_yz'];
    if (mc) {
      (mc.transverse_sections || []).forEach((_, i) => allKeys.push(`section_${i}`));
      (mc.coronal_sections    || []).forEach((_, i) => allKeys.push(`coronal_${i}`));
      (mc.frontal_sections    || []).forEach((_, i) => allKeys.push(`frontal_${i}`));
    }
    let globalMax = 0;
    for (const k of allKeys) {
      const e = _getSelectedContourPoints(k);
      if (!e || e.pts.length < 3) continue;
      let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
      for (const [u, v] of e.pts) {
        if (u < minU) minU = u; if (u > maxU) maxU = u;
        if (v < minV) minV = v; if (v > maxV) maxV = v;
      }
      globalMax = Math.max(globalMax, maxU - minU, maxV - minV);
    }
    if (globalMax <= 0) return null;
    return Math.min((W - 2 * pad) / globalMax, (H - 2 * pad) / globalMax);
  }

  /**
   * Etiquetas de orientación para cada tipo de contorno.
   * Marco canónico MAO: X=longitudinal (prox↔dist),
   *                        Y=lateral (izq↔der),
   *                        Z=normal a la cara (reverso Z− ↔ anverso Z+).
   * En canvas: der = U mayor, arriba = V mayor (V está invertido desde y-pantalla).
   *   Transversal YZ → U=Y, V=Z   | Coronal XZ → U=X, V=Z | Frontal XY → U=X, V=Y
   */
  function _getContourOrientLabels(key) {
    if (key.startsWith('section_') || key === 'transversal_yz') {
      // Sección YZ: U=Y (lateral), V=Z (cara)
      return { t: 'Anverso', b: 'Reverso', l: 'Izq.', r: 'Der.' };
    }
    if (key.startsWith('coronal_') || key === 'lateral_xz') {
      // Sección XZ: U=X (longitudinal), V=Z (cara)
      return { t: 'Anverso', b: 'Reverso', l: 'Proximal', r: 'Distal' };
    }
    if (key.startsWith('frontal_')) {
      // Sección XY: U=X (longitudinal), V=Y (lateral)
      return { t: 'Lat. +Y', b: 'Lat. −Y', l: 'Proximal', r: 'Distal' };
    }
    if (key === 'front') {
      // Cara A proyectada en XY: vista desde +Z (anverso)
      return { t: '+Y', b: '−Y', l: '−X', r: '+X', note: 'Vista Cara A (Anverso)' };
    }
    if (key === 'back') {
      // Cara B proyectada en XY: vista desde −Z (reverso) → X espejado
      return { t: '+Y', b: '−Y', l: '+X', r: '−X', note: 'Vista Cara B (Reverso)' };
    }
    return null;
  }

  /** Dibuja el contorno en el canvas y actualiza la tabla de métricas rápidas */
  function _drawContourPreview(key, overrideCanvas, viewState, suppressMeta) {
    const cv   = overrideCanvas || document.getElementById('obj3dContourPreviewCanvas');
    const meta = document.getElementById('obj3dContourPreviewMeta');
    if (!cv) return;

    const entry = _getSelectedContourPoints(key);
    const ctx2  = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx2.clearRect(0, 0, W, H);
    ctx2.fillStyle = '#f8f9fa';
    ctx2.fillRect(0, 0, W, H);

    if (!entry || entry.pts.length < 3) {
      if (meta) meta.innerHTML = '<span style="color:var(--gray-400);">Sin datos.</span>';
      return;
    }

    const pts = entry.pts;

    // Cargar horadaciones + piezas exteriores para bounds y dibujo
    const _mc_pre = state.v2Data?.morphology_canonical;
    let _holes2d_pre = null;
    if (key.startsWith('section_')) {
      const _hidx = parseInt(key.replace('section_', ''), 10);
      const _sec = _mc_pre?.transverse_sections?.[_hidx];
      _holes2d_pre = [...(_sec?.holes_yz || []), ...(_sec?.exterior_pieces_yz || [])];
    } else if (key.startsWith('coronal_')) {
      const _hidx = parseInt(key.replace('coronal_', ''), 10);
      const _sec = _mc_pre?.coronal_sections?.[_hidx];
      _holes2d_pre = [...(_sec?.holes_xz || []), ...(_sec?.exterior_pieces_xz || [])];
    } else if (key.startsWith('frontal_')) {
      const _hidx = parseInt(key.replace('frontal_', ''), 10);
      const _sec = _mc_pre?.frontal_sections?.[_hidx];
      _holes2d_pre = [...(_sec?.holes_xy || []), ...(_sec?.exterior_pieces_xy || [])];
    }

    // Bounds desde TODOS los loops (outer + piezas/horadaciones)
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    const _allLoops = [pts, ...(Array.isArray(_holes2d_pre) ? _holes2d_pre.filter(h => h.length >= 3) : [])];
    for (const loop of _allLoops) {
      for (const [u, v] of loop) {
        if (u < minU) minU = u; if (u > maxU) maxU = u;
        if (v < minV) minV = v; if (v > maxV) maxV = v;
      }
    }
    const rangeU = maxU - minU || 1e-9;
    const rangeV = maxV - minV || 1e-9;
    const pad = 20;
    // Escala global: todos los contornos usan el mismo px/unidad para
    // que las diferencias de tamaño sean visualmente correctas.
    const _baseScale = _getGlobalContourScale(W, H, pad)
                    || Math.min((W - 2*pad) / rangeU, (H - 2*pad) / rangeV);
    const _baseOffU  = pad + ((W - 2*pad) - rangeU * _baseScale) / 2;
    const _baseOffV  = pad + ((H - 2*pad) - rangeV * _baseScale) / 2;
    // viewState permite zoom/pan externo (modal); si no se pasa, vista ajustada al canvas.
    const scale = viewState?.scale ?? _baseScale;
    const offU  = viewState?.offU  ?? _baseOffU;
    const offV  = viewState?.offV  ?? _baseOffV;
    const toXY = ([u, v]) => ({
      x: offU + (u - minU) * scale,
      y: H - (offV + (v - minV) * scale),   // flip V → Y hacia arriba
    });

    // Color según tipo de clave
    let color = '#1565c0';
    const _mc = state.v2Data?.morphology_canonical;
    if (key === 'back')               color = '#1b5e20';
    else if (key === 'lateral_xz')    color = '#bf360c';
    else if (key === 'transversal_yz')color = '#6a1b9a';
    else if (key.startsWith('section_')) {
      const idx = parseInt(key.replace('section_', ''), 10);
      const n   = Math.max(1, (Array.isArray(_mc?.transverse_sections) ? _mc.transverse_sections.length : 1) - 1);
      const t   = idx / n;
      color = `rgb(${Math.round(230-t*228)},${Math.round(101+t*18)},${Math.round(t*189)})`;
    } else if (key.startsWith('coronal_')) {
      const idx = parseInt(key.replace('coronal_', ''), 10);
      const n   = Math.max(1, (Array.isArray(_mc?.coronal_sections) ? _mc.coronal_sections.length : 1) - 1);
      const t   = idx / n;
      color = `rgb(${Math.round(46+t*60)},${Math.round(125-t*98)},${Math.round(50+t*104)})`;
    } else if (key.startsWith('frontal_')) {
      // Gradiente cara frontal (dorado/cálido) → cara posterior (azul pizarra)
      const idx = parseInt(key.replace('frontal_', ''), 10);
      const n   = Math.max(1, (Array.isArray(_mc?.frontal_sections) ? _mc.frontal_sections.length : 1) - 1);
      const t   = idx / n;
      color = `rgb(${Math.round(194-t*148)},${Math.round(124+t*28)},${Math.round(30+t*155)})`;
    }

    // Ejes de referencia
    const cx = offU + (maxU + minU) / 2 * scale - minU * scale;
    const cy = H - (offV + (maxV + minV) / 2 * scale - minV * scale);
    ctx2.strokeStyle = 'rgba(160,160,160,0.35)';
    ctx2.lineWidth = 0.5;
    ctx2.setLineDash([3, 3]);
    ctx2.beginPath();
    ctx2.moveTo(cx, pad/2); ctx2.lineTo(cx, H - pad/2);
    ctx2.moveTo(pad/2, cy); ctx2.lineTo(W - pad/2, cy);
    ctx2.stroke();
    ctx2.setLineDash([]);

    // Clasificar loops: anidados (horadación real) vs separados (pieza del objeto)
    // Un loop es horadación real sólo si su centroide cae DENTRO del outer contour.
    const _ptInPoly = ([px, py], poly) => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi)
          inside = !inside;
      }
      return inside;
    };
    const _centroid2d = arr => {
      const [su, sv] = arr.reduce(([a, b], [u, v]) => [a + u, b + v], [0, 0]);
      return [su / arr.length, sv / arr.length];
    };
    const _trueHoles = [];   // loops DENTRO del outer → vacío real
    const _pieces    = [];   // loops FUERA del outer → parte del objeto
    if (Array.isArray(_holes2d_pre)) {
      _holes2d_pre.forEach(hole => {
        if (hole.length < 3) return;
        (_ptInPoly(_centroid2d(hole), pts) ? _trueHoles : _pieces).push(hole);
      });
    }

    const mapped = pts.map(toXY);

    // ── Ghost: envolvente convexa de sección compuesta ────────────────────
    // Para secciones con piezas separadas (bifacial, fragmentos): dibuja el
    // hull convexo de TODAS las piezas combinadas.  El espacio entre el hull
    // y los rellenos reales es la zona "vacía" que permite inferir lleno/vacío.
    if (_pieces.length > 0) {
      const _allPts = [...mapped, ..._pieces.flatMap(p => p.map(toXY))];
      // Jarvis March (gift wrapping) — O(nh), válido para ~80-250 puntos
      const _hull = (() => {
        const p = _allPts, n = p.length;
        if (n < 3) return p;
        let s = 0;
        for (let i = 1; i < n; i++) if (p[i].x < p[s].x) s = i;
        const h = [];
        let cur = s;
        do {
          h.push(p[cur]);
          let nxt = (cur + 1) % n;
          for (let i = 0; i < n; i++) {
            const cross = (p[nxt].x - p[cur].x) * (p[i].y - p[cur].y)
                        - (p[nxt].y - p[cur].y) * (p[i].x - p[cur].x);
            if (cross < 0) nxt = i;
          }
          cur = nxt;
        } while (cur !== s && h.length <= n + 1);
        return h;
      })();

      if (_hull.length >= 3) {
        ctx2.beginPath();
        ctx2.moveTo(_hull[0].x, _hull[0].y);
        for (let i = 1; i < _hull.length; i++) ctx2.lineTo(_hull[i].x, _hull[i].y);
        ctx2.closePath();
        ctx2.fillStyle = color;
        ctx2.globalAlpha = 0.07;
        ctx2.fill();
        ctx2.globalAlpha = 1;
        ctx2.strokeStyle = color;
        ctx2.lineWidth = 0.7;
        ctx2.setLineDash([3, 5]);
        ctx2.globalAlpha = 0.30;
        ctx2.stroke();
        ctx2.setLineDash([]);
        ctx2.globalAlpha = 1;
      }
    }

    // Solo cuando hay perforaciones reales: muestra el outer sin huecos para
    // que el usuario pueda inferir la relación lleno/vacío (lleno = ghost,
    // vacío = la zona que queda entre el ghost y el relleno con evenodd).
    if (_trueHoles.length > 0) {
      ctx2.beginPath();
      ctx2.moveTo(mapped[0].x, mapped[0].y);
      for (let i = 1; i < mapped.length; i++) ctx2.lineTo(mapped[i].x, mapped[i].y);
      ctx2.closePath();
      // Relleno fantasma muy sutil
      ctx2.fillStyle = color;
      ctx2.globalAlpha = 0.07;
      ctx2.fill();
      ctx2.globalAlpha = 1;
      // Borde punteado sutil para marcar el límite del contorno pleno
      ctx2.strokeStyle = color;
      ctx2.lineWidth = 0.7;
      ctx2.setLineDash([3, 5]);
      ctx2.globalAlpha = 0.30;
      ctx2.stroke();
      ctx2.setLineDash([]);
      ctx2.globalAlpha = 1;
    }

    // ── Relleno ────────────────────────────────────────────────────────────
    // Outer + horadaciones reales (evenodd → los loops anidados crean hueco)
    ctx2.beginPath();
    ctx2.moveTo(mapped[0].x, mapped[0].y);
    for (let i = 1; i < mapped.length; i++) ctx2.lineTo(mapped[i].x, mapped[i].y);
    ctx2.closePath();
    _trueHoles.forEach(hole => {
      const hm = hole.map(toXY);
      ctx2.moveTo(hm[0].x, hm[0].y);
      for (let i = 1; i < hm.length; i++) ctx2.lineTo(hm[i].x, hm[i].y);
      ctx2.closePath();
    });
    // Cuando hay piezas separadas se fuerza la misma opacidad que las piezas;
    // para igualar el aspecto visual se sube ligeramente la alpha del ghost a 0.
    const _fillAlpha = _pieces.length > 0 ? 0.30 : 0.18;
    ctx2.fillStyle = color;
    ctx2.globalAlpha = _fillAlpha;
    ctx2.fill('evenodd');
    ctx2.globalAlpha = 1;

    // Piezas separadas: mismo fill que el outer → aspecto uniforme
    _pieces.forEach(piece => {
      const pm = piece.map(toXY);
      ctx2.beginPath();
      ctx2.moveTo(pm[0].x, pm[0].y);
      for (let i = 1; i < pm.length; i++) ctx2.lineTo(pm[i].x, pm[i].y);
      ctx2.closePath();
      ctx2.fillStyle = color;
      ctx2.globalAlpha = _fillAlpha;
      ctx2.fill();
      ctx2.globalAlpha = 1;
    });

    // ── Contornos ──────────────────────────────────────────────────────────
    // Outer: línea sólida
    ctx2.beginPath();
    ctx2.moveTo(mapped[0].x, mapped[0].y);
    for (let i = 1; i < mapped.length; i++) ctx2.lineTo(mapped[i].x, mapped[i].y);
    ctx2.closePath();
    ctx2.strokeStyle = color;
    ctx2.lineWidth = 1.8;
    ctx2.setLineDash([]);
    ctx2.stroke();

    // Piezas separadas: línea sólida (mismo color y grosor que el outer)
    _pieces.forEach(piece => {
      const pm = piece.map(toXY);
      ctx2.beginPath();
      ctx2.moveTo(pm[0].x, pm[0].y);
      for (let i = 1; i < pm.length; i++) ctx2.lineTo(pm[i].x, pm[i].y);
      ctx2.closePath();
      ctx2.strokeStyle = color;
      ctx2.lineWidth = 1.8;
      ctx2.setLineDash([]);
      ctx2.stroke();
    });

    // ── Etiquetas "Pieza N": badge rectangular café con texto blanco ───────
    if (_pieces.length > 0) {
      const LABEL_BG   = '#5D3A1A';   // marrón/café oscuro
      const LABEL_FG   = '#ffffff';
      const LABEL_FONT = 'bold 10px system-ui, sans-serif';
      const PAD_X = 6, PAD_Y = 3;

      const _centXY2 = arr => {
        let sx = 0, sy = 0;
        arr.forEach(p => { sx += p.x; sy += p.y; });
        return { x: sx / arr.length, y: sy / arr.length };
      };

      // Bounding box de un array de {x,y}
      const _bboxXY = arr => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        arr.forEach(p => {
          if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        });
        return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
      };

      // Dibuja etiqueta: si cabe dentro de la pieza → centrada; si no → encima del bbox
      const _drawPieceLabel2 = (pts, text) => {
        ctx2.save();
        ctx2.font = LABEL_FONT;
        const tw = ctx2.measureText(text).width;
        const bw = tw + PAD_X * 2;
        const bh = 16;

        const ctr  = _centXY2(pts);
        const bbox = _bboxXY(pts);
        const GAP  = 3;  // píxeles entre etiqueta y borde superior de la pieza

        // Siempre encima del bbox de la pieza, centrado horizontalmente en el centroide
        let bx2 = ctr.x - bw / 2;
        let by2 = bbox.minY - bh - GAP;

        // clamp dentro del canvas
        bx2 = Math.max(2, Math.min(W - bw - 2, bx2));
        by2 = Math.max(2, Math.min(H - bh - 2, by2));

        // fondo opaco sin sombra (más limpio)
        ctx2.globalAlpha = 1;
        ctx2.fillStyle = LABEL_BG;
        ctx2.fillRect(bx2, by2, bw, bh);

        // borde blanco muy fino para separar del relleno
        ctx2.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx2.lineWidth = 0.8;
        ctx2.strokeRect(bx2, by2, bw, bh);

        // texto
        ctx2.fillStyle = LABEL_FG;
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        ctx2.fillText(text, bx2 + bw / 2, by2 + bh / 2);
        ctx2.restore();
      };

      _drawPieceLabel2(mapped, 'P1');
      _pieces.forEach((piece, pi) => {
        const pm = piece.map(toXY);
        _drawPieceLabel2(pm, `P${pi + 2}`);
      });
    }

    // Horadaciones reales (loops anidados): punteado rojo — son vacíos dentro del objeto
    _trueHoles.forEach(hole => {
      const hm = hole.map(toXY);
      ctx2.beginPath();
      ctx2.moveTo(hm[0].x, hm[0].y);
      for (let i = 1; i < hm.length; i++) ctx2.lineTo(hm[i].x, hm[i].y);
      ctx2.closePath();
      ctx2.strokeStyle = '#e53935';
      ctx2.lineWidth = 1.2;
      ctx2.setLineDash([3, 3]);
      ctx2.stroke();
      ctx2.setLineDash([]);
    });

    // Barra de escala (en mm si hay factor de conversión, en unidades si no)
    const mmPerUnit = Number(
      state.v2Data?.normalization?.mm_per_unit ||
      state.v2Data?.normalization?.scale       ||
      state.v2Data?.scale_info?.mm_per_unit    || 0);
    {
      // Eje más largo del contorno actual (para elegir longitud de barra)
      const physMax = Math.max(rangeU, rangeV) * (mmPerUnit > 0 ? mmPerUnit : 1);
      let barVal = 5;
      if      (physMax > 150) barVal = 50;
      else if (physMax >  80) barVal = 20;
      else if (physMax >  30) barVal = 10;
      else if (physMax <   5) barVal = 1;
      const barPx    = (barVal / (mmPerUnit > 0 ? mmPerUnit : 1)) * scale;
      const barLabel = mmPerUnit > 0 ? `${barVal} mm` : `${barVal} u`;
      const bx = W - barPx - 6;
      const by = H - 10;
      ctx2.strokeStyle = 'rgba(50,50,50,0.6)';
      ctx2.lineWidth   = 1.5;
      ctx2.setLineDash([]);
      ctx2.beginPath();
      ctx2.moveTo(bx,        by); ctx2.lineTo(bx + barPx, by);
      ctx2.moveTo(bx,        by - 3); ctx2.lineTo(bx,        by + 3);
      ctx2.moveTo(bx + barPx,by - 3); ctx2.lineTo(bx + barPx,by + 3);
      ctx2.stroke();
      ctx2.font = '7.5px sans-serif';
      ctx2.fillStyle = 'rgba(50,50,50,0.6)';
      ctx2.textAlign = 'center';
      ctx2.fillText(barLabel, bx + barPx / 2, by - 5);
      ctx2.textAlign = 'left';
    }

    // ── Leyenda de orientación (brújula de ejes) ────────────────────────────
    {
      const _ol = _getContourOrientLabels(key);
      if (_ol) {
        ctx2.save();
        ctx2.font = '7px system-ui, sans-serif';
        ctx2.textBaseline = 'middle';
        ctx2.textAlign    = 'left';

        // Construir filas del cuadro:
        //   fila 1: ↑ <top>
        //   fila 2: ↓ <bottom>
        //   fila 3: ← <left> · <right> →
        const rows = [];
        if (_ol.t) rows.push(`↑ ${_ol.t}`);
        if (_ol.b) rows.push(`↓ ${_ol.b}`);
        if (_ol.l && _ol.r) rows.push(`← ${_ol.l} · ${_ol.r} →`);
        if (_ol.note) rows.push(_ol.note);

        const lineH = 10;
        const boxW  = Math.max(...rows.map(r => ctx2.measureText(r).width)) + 10;
        const boxH  = rows.length * lineH + 6;
        const bx = 5, by2 = 5;

        // Fondo semi-transparente
        ctx2.fillStyle = 'rgba(20,20,20,0.52)';
        if (ctx2.roundRect) ctx2.roundRect(bx, by2, boxW, boxH, 3);
        else ctx2.rect(bx, by2, boxW, boxH);
        ctx2.fill();

        // Texto con color por dirección
        rows.forEach((row, i) => {
          const isAnv = row.startsWith('↑');
          const isRev = row.startsWith('↓');
          ctx2.fillStyle = isAnv ? '#ffb74d'
                         : isRev ? '#81d4fa'
                         : '#ffffff';
          ctx2.fillText(row, bx + 5, by2 + 3 + lineH * i + lineH / 2);
        });

        ctx2.restore();
      }
    }

    // Métricas rápidas: contorno exterior + panel gemelo para cada horadación
    if (meta) {
      const m = _getContourMetricsForKey(key) || {};
      const fmtN2 = (v, d = 3) => {
        if (typeof v !== 'number' || !isFinite(v)) return '—';
        if (Math.abs(v) > 0 && Math.abs(v) < 0.001) return v.toExponential(2);
        return v.toFixed(d);
      };
      const lk = t => `<td style="padding:3px 10px 3px 0;color:var(--gray-500);white-space:nowrap;font-size:9.5px;">${t}</td>`;
      const lv = v => `<td style="padding:3px 16px 3px 0;font-weight:500;font-variant-numeric:tabular-nums;font-size:9.5px;">${v}</td>`;

      // ── Métricas individuales de P1 (outer contour) para tarjeta Pieza 1 ──
      // Se cargan antes del bloque hasMultiPieces para poder usarlas en la tarjeta P1.
      const _mcPre = state.v2Data?.morphology_canonical;
      let _p1m = {};
      let _extPiecesMetPre = null;
      if (_mcPre) {
        let _sPre = null;
        if (key.startsWith('section_'))
          _sPre = _mcPre.transverse_sections?.[parseInt(key.replace('section_', ''), 10)];
        else if (key.startsWith('coronal_'))
          _sPre = _mcPre.coronal_sections?.[parseInt(key.replace('coronal_', ''), 10)];
        else if (key.startsWith('frontal_'))
          _sPre = _mcPre.frontal_sections?.[parseInt(key.replace('frontal_', ''), 10)];
        if (_sPre) {
          // Métricas de P1 desde outer_metrics_* (campo nuevo, requiere reanálisis)
          _p1m = _sPre.outer_metrics_yz || _sPre.outer_metrics_xz || _sPre.outer_metrics_xy || {};
          // Piezas extra (P2, P3…) para derivar área P1 = compuesta − Σ extras
          _extPiecesMetPre = _sPre.exterior_pieces_yz_metrics
                          || _sPre.exterior_pieces_xz_metrics
                          || _sPre.exterior_pieces_xy_metrics
                          || null;
        }
      }
      // Área P1 individual: compuesta − Σ áreas de piezas extra.
      // Funciona tanto con datos nuevos (outer_metrics_*) como datos sin ese campo.
      const _extSum = Array.isArray(_extPiecesMetPre)
        ? _extPiecesMetPre.reduce((acc, p) => acc + (p.area || 0), 0) : 0;
      const _p1AreaDerived = (m.area > 0 && _extSum > 0)
        ? Math.max(0, m.area - _extSum) : null;
      // _p1AreaDerived tiene prioridad: es el valor correcto para área individual de P1
      if (_p1AreaDerived != null) _p1m = { ..._p1m, area: _p1AreaDerived };

      // ── Encabezado: nota compuesta si hay múltiples piezas
      const hasMultiPieces = m._composite && m.n_pieces >= 2;
      const sectionLabel = hasMultiPieces
        ? `◻ Sección · <span style="color:var(--blue-600,#1565c0);font-weight:600;">${m.n_pieces} piezas</span> <span style="font-weight:400;color:var(--gray-500);">(métricas compuestas)</span>`
        : '◻ Sección';
      let metaHtml = `
        <div style="font-size:8.5px;font-weight:600;color:var(--gray-600);margin-bottom:2px;">${sectionLabel}</div>
        <table style="width:100%;border-collapse:collapse;">
          <tr>${lk('Área')}${lv(fmtN2(m.area,4))}${lk('Circ.')}${lv(fmtN2(m.circularity,3))}</tr>
          <tr>${lk('AR')}${lv(fmtN2(m.aspect_ratio??m.aspect_ratio_tight,3))}${lk('Solidez')}${lv(fmtN2(m.solidity,3))}</tr>
          <tr>${lk('Elong.')}${lv(fmtN2(m.elongation,3))}${lk('Feret↑')}${lv(fmtN2(m.feret_max,3))}</tr>
          <tr>${lk('Feret↓')}${lv(fmtN2(m.feret_min,3))}${m._dims
            ? `<td colspan="2" style="padding:3px 0;font-size:8.5px;color:var(--gray-500);">${m._dims}</td>`
            : '<td></td><td></td>'}</tr>
        </table>`;

      // Cuando hay múltiples piezas, mostrar bloque explícito de "Pieza 1"
      // con las métricas individuales del outer contour (outer_metrics_yz/xz/xy)
      if (hasMultiPieces) {
        metaHtml += `
          <div style="margin-top:6px;padding:5px 8px;
                      background:linear-gradient(90deg,rgba(21,101,192,0.08),transparent);
                      border-left:3px solid ${color};border-radius:0 3px 3px 0;">
            <div style="font-size:8.5px;font-weight:700;color:${color};margin-bottom:3px;">
              ◈ Pieza 1 <span style="background:${color};color:#fff;
                                    font-size:7.5px;padding:1px 5px;border-radius:8px;
                                    margin-left:4px;font-weight:600;">P1</span>
              <span style="font-weight:400;color:var(--gray-500);font-size:8px;">
                 (contorno principal)
              </span>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              <tr>${lk('Área')}${lv(fmtN2(_p1m.area??m.area,4))}${lk('Circ.')}${lv(fmtN2(_p1m.circularity??m.circularity,3))}</tr>
              <tr>${lk('Feret↑')}${lv(fmtN2(_p1m.feret_max??m.feret_max,3))}${lk('Feret↓')}${lv(fmtN2(_p1m.feret_min??m.feret_min,3))}</tr>
              <tr>${lk('AR')}${lv(fmtN2(_p1m.aspect_ratio??m.aspect_ratio??m.aspect_ratio_tight,3))}${lk('Perímetro')}${lv(fmtN2(_p1m.perimeter??m.perimeter,4))}</tr>
            </table>
          </div>`;
      }

      // ── Lleno / Vacío: sección compuesta (piezas vs envolvente convexa) ──
      // solidity_compuesta = Σ área_piezas / hull_convexo → misma semántica
      if (m._composite && m.hull_area > 0) {
        const solidFr = Math.min(1, Math.max(0.01, m.solidity ?? 1));
        const voidFr  = Math.max(0.01, 1 - solidFr);
        const pctS    = (solidFr * 100).toFixed(1);
        const pctV    = (voidFr  * 100).toFixed(1);
        const aVoid   = Math.max(0, (m.hull_area ?? 0) - (m.area ?? 0));
        metaHtml += `
          <div style="margin-top:6px;padding-top:5px;border-top:1px dashed #888;">
            <div style="font-size:8.5px;font-weight:600;color:var(--gray-600);margin-bottom:4px;">▧ Lleno / Vacío (envolvente)</div>
            <div style="display:flex;height:6px;border-radius:3px;overflow:hidden;margin-bottom:5px;border:1px solid #ddd;gap:1px;">
              <div style="flex:${solidFr};background:${color};opacity:0.55;" title="Material ${pctS}%"></div>
              <div style="flex:${voidFr};background:#e0e0e0;" title="Vacío entre piezas ${pctV}%"></div>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              <tr>${lk('Á. material')}${lv(fmtN2(m.area,4))}${lk('Á. hull')}${lv(fmtN2(m.hull_area,4))}</tr>
              <tr>${lk('% Material')}${lv(pctS + ' %')}${lk('Á. vacía')}${lv(fmtN2(aVoid,4))}</tr>
            </table>
          </div>`;
      }

      // ── Métricas lleno/vacío: sección con perforaciones ──────────────────
      // Solo cuando el servidor devuelve n_perforations (calculado por _enrich_with_void_metrics)
      if (m.n_perforations > 0) {
        const pctFill = ((m.fill_ratio ?? 1) * 100).toFixed(1);
        const pctVoid = ((m.void_ratio ?? 0) * 100).toFixed(1);
        const fr = Math.max(0.01, m.fill_ratio ?? 1);
        const vr = Math.max(0.01, m.void_ratio ?? 0);
        metaHtml += `
          <div style="margin-top:6px;padding-top:5px;border-top:1px dashed #888;">
            <div style="font-size:8.5px;font-weight:600;color:var(--gray-600);margin-bottom:4px;">▧ Lleno / Vacío</div>
            <div style="display:flex;height:6px;border-radius:3px;overflow:hidden;margin-bottom:5px;border:1px solid #ddd;gap:1px;">
              <div style="flex:${fr};background:${color};opacity:0.55;" title="Sólido ${pctFill}%"></div>
              <div style="flex:${vr};background:#e0e0e0;" title="Vacío ${pctVoid}%"></div>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              <tr>${lk('Á. sólida')}${lv(fmtN2(m.area_solid,4))}${lk('Á. vacía')}${lv(fmtN2(m.area_void,4))}</tr>
              <tr>${lk('% Lleno')}${lv(pctFill + ' %')}${lk('Circ.∅')}${lv(fmtN2(m.circularity_solid,3))}</tr>
            </table>
          </div>`;
      }

      // ── Piezas exteriores (fragmentos de la misma sección)
      const _mc2m = state.v2Data?.morphology_canonical;
      let _piecesMet = null;
      let _holesMet  = null;
      if (key.startsWith('section_')) {
        const _hmi = parseInt(key.replace('section_', ''), 10);
        _piecesMet = _mc2m?.transverse_sections?.[_hmi]?.exterior_pieces_yz_metrics || null;
        _holesMet  = _mc2m?.transverse_sections?.[_hmi]?.holes_yz_metrics || null;
      } else if (key.startsWith('coronal_')) {
        const _hmi = parseInt(key.replace('coronal_', ''), 10);
        _piecesMet = _mc2m?.coronal_sections?.[_hmi]?.exterior_pieces_xz_metrics || null;
        _holesMet  = _mc2m?.coronal_sections?.[_hmi]?.holes_xz_metrics || null;
      } else if (key.startsWith('frontal_')) {
        const _hmi = parseInt(key.replace('frontal_', ''), 10);
        _piecesMet = _mc2m?.frontal_sections?.[_hmi]?.exterior_pieces_xy_metrics || null;
        _holesMet  = _mc2m?.frontal_sections?.[_hmi]?.holes_xy_metrics || null;
      }
      if (Array.isArray(_piecesMet) && _piecesMet.length > 0) {
        _piecesMet.forEach((pm, pi) => {
          const pieceNum = pi + 2;
          metaHtml += `
            <div style="margin-top:7px;padding:5px 8px;
                        background:linear-gradient(90deg,rgba(21,101,192,0.06),transparent);
                        border-left:3px solid #1565c0;border-radius:0 3px 3px 0;">
              <div style="font-size:8.5px;font-weight:700;color:#1565c0;margin-bottom:3px;">
                ◈ Pieza ${pieceNum}
                <span style="background:#1565c0;color:#fff;
                             font-size:7.5px;padding:1px 5px;border-radius:8px;
                             margin-left:4px;font-weight:600;">P${pieceNum}</span>
              </div>
              <table style="width:100%;border-collapse:collapse;">
                <tr>${lk('Área')}${lv(fmtN2(pm.area,4))}${lk('Circ.')}${lv(fmtN2(pm.circularity,3))}</tr>
                <tr>${lk('AR')}${lv(fmtN2(pm.aspect_ratio,3))}${lk('Feret↑')}${lv(fmtN2(pm.feret_max,3))}</tr>
                <tr>${lk('Feret↓')}${lv(fmtN2(pm.feret_min,3))}${lk('Perímetro')}${lv(fmtN2(pm.perimeter,4))}</tr>
              </table>
            </div>`;
        });
      }
      // ── Perforaciones reales (loops anidados dentro del outer)
      if (Array.isArray(_holesMet) && _holesMet.length > 0) {
        _holesMet.forEach((hm, hi) => {
          metaHtml += `
            <div style="margin-top:7px;padding-top:5px;border-top:1px dashed #e53935;">
              <div style="font-size:8.5px;font-weight:600;color:#e53935;margin-bottom:2px;">⊙ Perforación ${hi + 1}</div>
              <table style="width:100%;border-collapse:collapse;">
                <tr>${lk('Área')}${lv(fmtN2(hm.area,4))}${lk('Circ.')}${lv(fmtN2(hm.circularity,3))}</tr>
                <tr>${lk('AR')}${lv(fmtN2(hm.aspect_ratio,3))}${lk('Feret↑')}${lv(fmtN2(hm.feret_max,3))}</tr>
                <tr>${lk('Feret↓')}${lv(fmtN2(hm.feret_min,3))}${lk('Perímetro')}${lv(fmtN2(hm.perimeter,4))}</tr>
              </table>
            </div>`;
        });
      }

      if (!suppressMeta) meta.innerHTML = metaHtml;
    }
    return {
      _baseScale, _baseOffU, _baseOffV,
      scale, offU, offV,
      minU, minV, maxU, maxV, rangeU, rangeV,
      W, H,
    };
  }

  /** Modal de zoom interactivo para el contorno activo */
  function _openContourZoomModal(key) {
    const modal  = document.getElementById('obj3dZoomModal');
    const cv     = document.getElementById('obj3dZoomCanvas');
    const titleEl = document.getElementById('obj3dZoomTitle');
    const zoomLbl = document.getElementById('obj3dZoomLevel');
    if (!modal || !cv) return;

    const entry = _getSelectedContourPoints ? null : null; // se llama después
    const W = 880, H = 520;
    cv.width = W; cv.height = H;

    // Render inicial → devuelve estado base (scale, offsets, bounds)
    const vs = _drawContourPreview(key, cv, undefined, true);
    if (!vs) { modal.style.display = 'flex'; return; }

    let scale = vs._baseScale, offU = vs._baseOffU, offV = vs._baseOffV;

    // Actualiza título
    const _entry = _getSelectedContourPoints(key);
    if (titleEl) titleEl.textContent = _entry?.label || key;

    function redraw() {
      _drawContourPreview(key, cv, { scale, offU, offV }, true);
      if (zoomLbl) {
        const z = scale / vs._baseScale;
        zoomLbl.textContent = z >= 10 ? z.toFixed(0) + '×' : z.toFixed(1) + '×';
      }
      // Actualizar botón activo
      modal.querySelectorAll('.obj3d-zp').forEach(b => {
        const zf = parseFloat(b.dataset.zf);
        const cur = scale / vs._baseScale;
        b.classList.toggle('active', Math.abs(zf - cur) < 0.05);
      });
    }

    // ── Zoom a factor predefinido (centrado en el canvas) ─────────────────
    function setZoom(factor) {
      const newScale = vs._baseScale * factor;
      const cx = W / 2, cy = H / 2;
      offU = cx - (cx - offU) * (newScale / scale);
      offV = (H - cy) - ((H - cy) - offV) * (newScale / scale);
      scale = newScale;
      redraw();
    }

    // Handlers de botones preset
    modal.querySelectorAll('.obj3d-zp').forEach(b => {
      b.addEventListener('click', () => setZoom(parseFloat(b.dataset.zf)));
    });

    modal.style.display = 'flex';
    redraw(); // actualiza estado inicial (botón 1× activo)

    // ── Zoom con rueda ────────────────────────────────────────────────────
    function onWheel(e) {
      e.preventDefault();
      const factor   = e.deltaY < 0 ? 1.18 : 1 / 1.18;
      const newScale = Math.max(vs._baseScale * 0.85,
                                Math.min(vs._baseScale * 40, scale * factor));
      const rect  = cv.getBoundingClientRect();
      const cx    = (e.clientX - rect.left) / rect.width  * W;
      const cy    = (e.clientY - rect.top)  / rect.height * H;
      // Zoom centrado en la posición del cursor
      offU = cx - (cx - offU) * (newScale / scale);
      offV = (H - cy) - ((H - cy) - offV) * (newScale / scale);
      scale = newScale;
      redraw();
    }

    // ── Pan (arrastrar) ───────────────────────────────────────────────────
    let _drag = false, _dsx = 0, _dsy = 0, _du0 = 0, _dv0 = 0;
    function onMouseDown(e) {
      if (e.button !== 0) return;
      _drag = true;
      _dsx = e.clientX; _dsy = e.clientY;
      _du0 = offU; _dv0 = offV;
      cv.style.cursor = 'grabbing';
    }
    function onMouseMove(e) {
      if (!_drag) return;
      const rect = cv.getBoundingClientRect();
      offU = _du0 + (e.clientX - _dsx) / rect.width  * W;
      offV = _dv0 - (e.clientY - _dsy) / rect.height * H;
      redraw();
    }
    function onMouseUp() { _drag = false; cv.style.cursor = 'crosshair'; }

    // ── Doble clic: resetear vista ─────────────────────────────────────
    function onDblClick() {
      scale = vs._baseScale; offU = vs._baseOffU; offV = vs._baseOffV;
      redraw();
    }

    cv.addEventListener('wheel',      onWheel,     { passive: false });
    cv.addEventListener('mousedown',  onMouseDown);
    cv.addEventListener('mousemove',  onMouseMove);
    cv.addEventListener('mouseup',    onMouseUp);
    cv.addEventListener('mouseleave', onMouseUp);
    cv.addEventListener('dblclick',   onDblClick);

    // ── Cerrar ─────────────────────────────────────────────────────────
    const closeBtn = document.getElementById('obj3dZoomClose');
    function cleanup() {
      modal.style.display = 'none';
      cv.removeEventListener('wheel',      onWheel);
      cv.removeEventListener('mousedown',  onMouseDown);
      cv.removeEventListener('mousemove',  onMouseMove);
      cv.removeEventListener('mouseup',    onMouseUp);
      cv.removeEventListener('mouseleave', onMouseUp);
      cv.removeEventListener('dblclick',   onDblClick);
      if (closeBtn) closeBtn.removeEventListener('click', cleanup);
      modal.removeEventListener('click', onBackdrop);
    }
    function onBackdrop(e) { if (e.target === modal) cleanup(); }
    if (closeBtn) closeBtn.addEventListener('click', cleanup);
    modal.addEventListener('click', onBackdrop);
  }

  /** Extrae los puntos del contorno a partir de su clave */
  function _getSelectedContourPoints(key) {
    if (!key || !state.v2Data) return null;

    const mao2d    = state.v2Data.mao2d_adapted || {};
    const planes   = (mao2d.oriented_2d || {}).planes || {};
    const fb       = (mao2d.canonical_contours || {}).front_back || {};
    // Secciones: preferir morphology_canonical (fuente original con contour_yz)
    const _mc2 = state.v2Data.morphology_canonical;
    const _maoSecs2 = (mao2d.canonical_contours || {}).transverse_sections;
    const c2dSections = (Array.isArray(_mc2?.transverse_sections) ? _mc2.transverse_sections : null)
                     || (Array.isArray(_maoSecs2) ? _maoSecs2 : null)
                     || [];
    const c2dCoronals = Array.isArray(_mc2?.coronal_sections) ? _mc2.coronal_sections : [];

    if (key === 'front')          return { pts: fb.front?.contour_xy || [],         label: 'Cara A (anverso)' };
    if (key === 'back')           return { pts: fb.back?.contour_xy  || [],         label: 'Cara B (reverso)' };
    if (key === 'lateral_xz')     return { pts: planes.lateral_xz?.contour || [],   label: 'Perfil lateral XZ' };
    if (key === 'transversal_yz') return { pts: planes.transversal_yz?.contour || [],label: 'Sección global YZ' };
    if (key.startsWith('section_')) {
      const idx = parseInt(key.replace('section_', ''), 10);
      const sec = c2dSections[idx];
      return sec
        ? { pts: sec.contour_yz || [], label: `Secc. transversal ${idx + 1} · ${Math.round((sec.x_relative || 0) * 100)}%` }
        : null;
    }
    if (key.startsWith('coronal_')) {
      const idx = parseInt(key.replace('coronal_', ''), 10);
      const sec = c2dCoronals[idx];
      return sec
        ? { pts: sec.contour_xz || [], label: `Secc. coronal ${idx + 1} · ${Math.round((sec.y_relative || 0) * 100)}%` }
        : null;
    }
    if (key.startsWith('frontal_')) {
      const idx = parseInt(key.replace('frontal_', ''), 10);
      const frs = Array.isArray(_mc2?.frontal_sections) ? _mc2.frontal_sections : [];
      const sec = frs[idx];
      return sec
        ? { pts: sec.contour_xy || [], label: `Secc. frontal ${idx + 1} · ${Math.round((sec.z_relative || 0) * 100)}% prof.` }
        : null;
    }
    return null;
  }

  /** Llama a /api/obj3d/contour-analyze y muestra el análisis detallado */
  async function _runContour2dAnalysis(key) {
    const entry    = _getSelectedContourPoints(key);
    const detailEl = document.getElementById('obj3dContour2dDetail');
    const calcBtn  = document.getElementById('obj3dCalcFullMetricsBtn');
    if (!detailEl) return;

    if (!entry || entry.pts.length < 3) {
      detailEl.style.display = 'block';
      detailEl.innerHTML = '<span style="color:#b00020;font-size:9px;">Sin datos de contorno.</span>';
      return;
    }

    if (calcBtn) { calcBtn.disabled = true; calcBtn.textContent = 'Calculando…'; }
    detailEl.style.display = 'block';
    detailEl.innerHTML = '<span style="color:var(--gray-500);font-size:9px;">Calculando métricas completas…</span>';

    const mmPerUnit = Number(
      state.v2Data?.normalization?.mm_per_unit ||
      state.v2Data?.normalization?.scale ||
      state.v2Data?.scale_info?.mm_per_unit || 1.0
    );

    try {
      const fd = new FormData();
      fd.append('contour_json', JSON.stringify(entry.pts));
      fd.append('mm_per_unit',  String(mmPerUnit));
      fd.append('label',        entry.label);

      const resp = await fetch('http://localhost:8765/api/obj3d/contour-analyze', { method: 'POST', body: fd });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      _renderContour2dResult(await resp.json(), entry.label);
      if (calcBtn) { calcBtn.disabled = false; calcBtn.textContent = '↺ Recalcular métricas'; }
    } catch (e) {
      detailEl.innerHTML = `<span style="color:#b00020;font-size:9px;">Error: ${e.message}</span>`;
      if (calcBtn) { calcBtn.disabled = false; calcBtn.textContent = '▶ Calcular métricas completas'; }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ANÁLISIS MORFOLÓGICO 2D — MODAL DE CONTORNO CANÓNICO (puente 3D → 2D)
  // ──────────────────────────────────────────────────────────────────────────

  /** Devuelve las piezas exteriores (loops separados) de una clave de sección
   *  en el espacio de coordenadas canónicas [[u,v],...]. */
  function _getSectionExteriorPieces(key) {
    const mc = state.v2Data?.morphology_canonical;
    if (!mc) return [];
    if (key.startsWith('section_')) {
      const idx = parseInt(key.replace('section_', ''), 10);
      return mc.transverse_sections?.[idx]?.exterior_pieces_yz || [];
    }
    if (key.startsWith('coronal_')) {
      const idx = parseInt(key.replace('coronal_', ''), 10);
      return mc.coronal_sections?.[idx]?.exterior_pieces_xz || [];
    }
    if (key.startsWith('frontal_')) {
      const idx = parseInt(key.replace('frontal_', ''), 10);
      return mc.frontal_sections?.[idx]?.exterior_pieces_xy || [];
    }
    return [];
  }

  /** Devuelve los agujeros (true holes) de la sección identificada por key.
   *  Retorna un array de contornos, cada contorno = [[u,v],...]. */
  function _getSectionHoles(key) {
    const mc = state.v2Data?.morphology_canonical;
    if (!mc) return [];
    if (key.startsWith('section_')) {
      const idx = parseInt(key.replace('section_', ''), 10);
      return mc.transverse_sections?.[idx]?.holes_yz || [];
    }
    if (key.startsWith('coronal_')) {
      const idx = parseInt(key.replace('coronal_', ''), 10);
      return mc.coronal_sections?.[idx]?.holes_xz || [];
    }
    if (key.startsWith('frontal_')) {
      const idx = parseInt(key.replace('frontal_', ''), 10);
      return mc.frontal_sections?.[idx]?.holes_xy || [];
    }
    return [];
  }

  /** Envolvente convexa (Jarvis March) sobre puntos [[x,y],...].
   *  Devuelve un nuevo array ordenado que cierra el hull. */
  function _convexHull2D(pts) {
    const n = pts.length;
    if (n < 3) return pts.slice();
    let s = 0;
    for (let i = 1; i < n; i++) if (pts[i][0] < pts[s][0]) s = i;
    const h = [];
    let cur = s;
    do {
      h.push(pts[cur]);
      let nxt = (cur + 1) % n;
      for (let i = 0; i < n; i++) {
        const cross = (pts[nxt][0] - pts[cur][0]) * (pts[i][1] - pts[cur][1])
                    - (pts[nxt][1] - pts[cur][1]) * (pts[i][0] - pts[cur][0]);
        if (cross < 0) nxt = i;
      }
      cur = nxt;
    } while (cur !== s && h.length <= n + 1);
    return h;
  }

  async function _openMorphAnalysisModal(key) {
    const modal    = document.getElementById('obj3dMorphAnalysisModal');
    const body     = document.getElementById('obj3dMorphAnalysisBody');
    const subtitle = document.getElementById('obj3dMorphAnalysisSubtitle');
    const closeBtn = document.getElementById('obj3dMorphAnalysisClose');
    if (!modal || !body) return;

    const entry = _getSelectedContourPoints(key);
    if (!entry || entry.pts.length < 3) {
      if (body) body.innerHTML = '<div style="color:#b00020;padding:20px;">Sin datos de contorno.</div>';
      modal.style.display = 'flex';
      return;
    }

    if (closeBtn && !closeBtn._morphListenerAdded) {
      closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
      closeBtn._morphListenerAdded = true;
    }
    if (!modal._backdropListenerAdded) {
      modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
      modal._backdropListenerAdded = true;
    }

    // ── Cuando hay piezas separadas, enviar todos los puntos combinados al
    //    servidor para que Python (scipy QHull) calcule el hull — mismo
    //    método que usa el panel, válido para cualquier tipología. ─────────
    const extPieces = _getSectionExteriorPieces(key);
    let analysisPoints = entry.pts;
    let isEnvelope = false;
    if (extPieces.length > 0) {
      analysisPoints = [...entry.pts, ...extPieces.flatMap(p => p)];
      isEnvelope = true;
    }

    const analysisLabel = isEnvelope
      ? `${entry.label} [envolvente · ${extPieces.length + 1} piezas]`
      : entry.label;

    // ── Detectar perforaciones (true holes) de esta sección ──────────────
    const holes = _getSectionHoles(key);

    if (subtitle) subtitle.textContent = analysisLabel;
    const holesInfo = holes.length > 0
      ? ` + <strong>${holes.length} perforación${holes.length > 1 ? 'es' : ''}</strong>`
      : '';
    body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;
                  gap:12px;padding:60px 0;color:var(--gray-500);">
        <span style="font-size:20px;">⏳</span>
        <span style="font-size:13px;">Calculando análisis morfológico${isEnvelope ? ' (envolvente)' : ''}${holesInfo ? '…' : '…'}</span>
      </div>`;
    modal.style.display = 'flex';

    const morphBtn = document.getElementById('obj3dMorphAnalysisBtn');
    if (morphBtn) { morphBtn.disabled = true; morphBtn.textContent = '⏳ Calculando…'; }

    const mmPerUnit = Number(
      state.v2Data?.normalization?.mm_per_unit ||
      state.v2Data?.normalization?.scale ||
      state.v2Data?.scale_info?.mm_per_unit || 1.0
    );

    // Helper: centroide aritmético de [[x,y],...]
    function _centroid2D(pts) {
      const n = pts.length;
      if (!n) return [0, 0];
      let sx = 0, sy = 0;
      for (const [x, y] of pts) { sx += x; sy += y; }
      return [sx / n, sy / n];
    }
    const mainCentroid = _centroid2D(analysisPoints);

    try {
      const fd = new FormData();
      fd.append('contour_json', JSON.stringify(analysisPoints));
      fd.append('mm_per_unit',  String(mmPerUnit));
      fd.append('label',        analysisLabel);
      // ── Piezas separadas (envolvente · N piezas): el helper Python las
      //    rasteriza individualmente y evita las líneas fantasma que se
      //    producen al concatenar piezas en un único polígono.
      if (isEnvelope) {
        const pieces = [entry.pts, ...extPieces];
        fd.append('pieces_json', JSON.stringify(pieces));
      }
      // ── Perforaciones: el helper las sustrae visualmente del relleno.
      if (holes.length > 0) {
        fd.append('holes_json', JSON.stringify(holes));
      }

      // ── Lanzar análisis principal + perforaciones en paralelo ────────
      const holeForms = holes.map((holePts, hi) => {
        const hfd = new FormData();
        hfd.append('contour_json', JSON.stringify(holePts));
        hfd.append('mm_per_unit',  String(mmPerUnit));
        hfd.append('label',        `${analysisLabel} · Perforación ${hi + 1}`);
        return hfd;
      });

      const [mainSettled, ...holeSettled] = await Promise.allSettled([
        fetch('http://localhost:8765/api/obj3d/contour-analyze', { method: 'POST', body: fd })
          .then(r => r.ok ? r.json() : r.text().then(t => Promise.reject(`HTTP ${r.status}: ${t}`))),
        ...holeForms.map(hfd =>
          fetch('http://localhost:8765/api/obj3d/contour-analyze', { method: 'POST', body: hfd })
            .then(r => r.ok ? r.json() : r.text().then(t => Promise.reject(`HTTP ${r.status}: ${t}`)))
        )
      ]);

      if (mainSettled.status === 'rejected') throw new Error(mainSettled.reason);
      const data = mainSettled.value;

      // ── Construir array de perforaciones analizadas ──────────────────
      const holeAnalyses = holes.map((holePts, hi) => {
        const settled = holeSettled[hi];
        if (!settled || settled.status !== 'fulfilled') return null;
        const holeData = settled.value;
        const holeCentroid = _centroid2D(holePts);
        const dx = holeCentroid[0] - mainCentroid[0];
        const dy = holeCentroid[1] - mainCentroid[1];
        const distUnits = Math.sqrt(dx * dx + dy * dy);
        return {
          id: hi + 1,
          metricas: holeData.metricas || {},
          distanciaAlCentro: mmPerUnit > 0 && mmPerUnit !== 1 ? distUnits * mmPerUnit : distUnits,
          preview_b64: holeData.preview_b64 || '',
        };
      }).filter(h => h !== null);

      _renderMorphAnalysisModal(data, entry.label, key, mmPerUnit, entry,
                                { isEnvelope, nPieces: extPieces.length + 1,
                                  hullPoints: analysisPoints.length,
                                  holeAnalyses });
      if (morphBtn) { morphBtn.disabled = false; morphBtn.textContent = '🔬 ANÁLISIS MORFOLÓGICO'; }
    } catch (e) {
      body.innerHTML = `
        <div style="color:#b00020;padding:30px;font-size:12px;">
          <strong>Error al calcular el análisis morfológico:</strong><br>${e.message}
        </div>`;
      if (morphBtn) { morphBtn.disabled = false; morphBtn.textContent = '🔬 ANÁLISIS MORFOLÓGICO'; }
    }
  }

  function _renderMorphAnalysisModal(data, label, key, mmPerUnit, entry, opts) {
    const body = document.getElementById('obj3dMorphAnalysisBody');
    if (!body) return;

    const isEnvelope  = opts?.isEnvelope  || false;
    const nPieces     = opts?.nPieces     || 1;
    const hullPts     = opts?.hullPoints  || 0;
    const holeAnalyses = opts?.holeAnalyses || [];

    const m       = data.metricas  || {};
    const bb      = data.bbox_units || {};
    const prevB64 = data.preview_b64 || '';

    const faceLabel = key === 'front' ? 'Cara A (Anverso)'
                    : key === 'back'  ? 'Cara B (Reverso)'
                    : label;
    const faceColor = key === 'front' ? '#1565c0'
                    : key === 'back'  ? '#1b5e20'
                    : '#555';

    let metricsHtml = '';
    if (typeof window.generarTablaMetricasCompleta === 'function') {
      const objMeta = {
        id:   `3D_${key.toUpperCase()}${isEnvelope ? '_ENV' : ''}`,
        cara: key === 'front' ? 'A' : key === 'back' ? 'B' : null,
        // Perforaciones: cada hole analizado como perforación 2D
        perforaciones: holeAnalyses.map(h => ({
          id: h.id,
          metricas: h.metricas,
          distanciaAlCentro: h.distanciaAlCentro,
        })),
      };
      try {
        metricsHtml = window.generarTablaMetricasCompleta(objMeta, m);
      } catch (e2) {
        metricsHtml = `<div style="color:#b00020;font-size:11px;">Error generando tabla: ${e2.message}</div>`;
      }
    } else {
      metricsHtml = _buildCompactMorphMetricsHtml(m, faceColor);
    }

    const fbData = (state.v2Data?.mao2d_adapted?.canonical_contours?.front_back || {})[key] || {};
    const mxy    = fbData.metrics_xy || {};
    const areaXY  = mxy.area        != null ? Number(mxy.area).toFixed(4)        : '—';
    const perimXY = mxy.perimeter   != null ? Number(mxy.perimeter).toFixed(4)   : '—';
    const circXY  = mxy.circularity != null ? Number(mxy.circularity).toFixed(3) : '—';

    // Banner de envolvente convexa (solo cuando hay múltiples piezas)
    const envelopeBanner = isEnvelope ? `
      <div style="margin-bottom:14px;padding:10px 14px;border-radius:7px;
                  background:linear-gradient(135deg,#fff3e0,#ffe0b2);
                  border:1px solid #ff9800;display:flex;align-items:flex-start;gap:10px;">
        <span style="font-size:18px;line-height:1;">⬡</span>
        <div style="font-size:10px;color:#e65100;line-height:1.6;">
          <div style="font-weight:700;font-size:11px;margin-bottom:2px;">
            Análisis sobre contorno envolvente (${nPieces} piezas)
          </div>
          <div>La sección está formada por <strong>${nPieces} piezas separadas</strong>.
               El análisis morfológico se ejecuta sobre la
               <strong>envolvente convexa</strong> que circunscribe todas las piezas
               (${hullPts} vértices del hull).</div>
          <div style="margin-top:4px;color:#bf360c;">
            Las métricas reflejan la <em>forma global</em> del conjunto, no la de
            cada fragmento individual.
          </div>
        </div>
      </div>` : '';

    const refHtml = `
      <div style="margin-bottom:16px;padding:12px 16px;border-radius:8px;
                  background:#e8f4fd;border-left:4px solid ${faceColor};">
        <div style="font-size:11px;font-weight:700;color:${faceColor};margin-bottom:6px;">
          🔗 Puente 2D ↔ 3D — ${faceLabel}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:20px;font-size:10px;color:#333;">
          <div><span style="color:#666;">Origen:</span>
               <strong>Contorno ${isEnvelope ? 'envolvente de' : 'canónico del'} modelo 3D</strong></div>
          <div><span style="color:#666;">Análisis:</span> <strong>Pipeline 2D completo (metrics.py)</strong></div>
          ${mmPerUnit > 0 && mmPerUnit !== 1
            ? `<div><span style="color:#666;">Escala:</span> <strong>${mmPerUnit} mm/u</strong></div>` : ''}
          ${!isEnvelope ? `
          <div><span style="color:#666;">Área (3D):</span> <strong>${areaXY} u²</strong></div>
          <div><span style="color:#666;">Perímetro (3D):</span> <strong>${perimXY} u</strong></div>
          <div><span style="color:#666;">Circularidad (3D):</span> <strong>${circXY}</strong></div>` : ''}
        </div>
        ${(() => {
          // Trazabilidad: punto de medición real vs entrada
          const tr   = data.analysis_trace || null;
          const mode = data.analysis_mode  || null;
          if (!tr && !mode) return '';
          const modeLbl = mode === 'envelope_hull'
            ? `<span style="color:#e65100;">envolvente convexa (hull)</span>`
            : `<span style="color:#1976d2;">contorno real</span>`;
          const nIn  = tr?.n_input_points  ?? '—';
          const nMet = tr?.n_metric_points ?? '—';
          const pa   = tr?.parity_error_area_pct;
          const pp   = tr?.parity_error_perimeter_pct;
          const paStr = (typeof pa === 'number') ? `${pa.toFixed(3)}%` : '—';
          const ppStr = (typeof pp === 'number') ? `${pp.toFixed(3)}%` : '—';
          const parityNote = (mode === 'envelope_hull')
            ? `<span style="color:#999;" title="En modo envolvente, paridad refleja diferencia geométrica esperada (hull vs piezas), no error numérico.">(esperado en modo envolvente)</span>`
            : '';
          return `
          <div style="margin-top:8px;padding-top:8px;border-top:1px dashed ${faceColor}40;
                      display:flex;flex-wrap:wrap;gap:18px;font-size:9.5px;color:#555;">
            <div><span style="color:#666;">Modo de medición:</span> <strong>${modeLbl}</strong></div>
            <div><span style="color:#666;">Pts. entrada → métrica:</span> <strong>${nIn} → ${nMet}</strong></div>
            <div><span style="color:#666;">Paridad área:</span> <strong>${paStr}</strong> ${parityNote}</div>
            <div><span style="color:#666;">Paridad perímetro:</span> <strong>${ppStr}</strong></div>
          </div>`;
        })()}
      </div>`;

    // ── Fallback compact: añadir sección de perforaciones si no hay generarTabla
    if (typeof window.generarTablaMetricasCompleta !== 'function' && holeAnalyses.length > 0) {
      metricsHtml += _buildCompactHolesHtml(holeAnalyses, mmPerUnit);
    }

    // ── Miniaturas de perforaciones en columna izquierda ─────────────────
    const holesPreviewHtml = holeAnalyses.length === 0 ? '' : `
      <div style="margin-top:12px;">
        <div style="font-size:9px;font-weight:700;color:#c62828;margin-bottom:5px;
                    padding-bottom:3px;border-bottom:2px solid #e53935;">
          ⊙ ${holeAnalyses.length} Perforación${holeAnalyses.length > 1 ? 'es' : ''} detectada${holeAnalyses.length > 1 ? 's' : ''}
        </div>
        ${holeAnalyses.map(h => `
          <div style="margin-bottom:10px;">
            <div style="font-size:8.5px;font-weight:700;color:#e53935;margin-bottom:3px;">
              Perf. ${h.id}
            </div>
            ${h.preview_b64
              ? `<img src="data:image/png;base64,${h.preview_b64}"
                      style="width:140px;height:140px;object-fit:contain;
                             border:1px solid #e53935;border-radius:5px;display:block;"
                      alt="Perforación ${h.id}">`
              : `<div style="width:140px;height:80px;background:#fff3f3;
                             border:1px solid #e53935;border-radius:5px;
                             display:flex;align-items:center;justify-content:center;
                             font-size:9px;color:#e53935;">Sin preview</div>`}
            <div style="margin-top:4px;font-size:8px;color:#555;line-height:1.7;">
              <div><b>Área:</b> ${(h.metricas.area || 0).toFixed(3)} ${h.metricas.area_unit || 'u²'}</div>
              <div><b>Circ.:</b> ${(h.metricas.circularity || 0).toFixed(3)}</div>
              <div><b>Dist. centro:</b> ${h.distanciaAlCentro.toFixed(3)} ${mmPerUnit > 0 && mmPerUnit !== 1 ? 'mm' : 'u'}</div>
            </div>
          </div>
        `).join('')}
      </div>`;

    body.innerHTML = `
      <div style="font-size:11px;font-weight:700;color:${faceColor};
                  margin-bottom:6px;padding-bottom:4px;
                  border-bottom:2px solid ${faceColor};">
        ${faceLabel}${isEnvelope ? ' · envolvente' : ''}
      </div>

      <!-- ── Canvas de geometría (full-width arriba) ─────────────────── -->
      <div style="position:relative;width:100%;background:#f8f9fa;
                  border:1px solid #ddd;border-radius:7px;overflow:hidden;
                  margin-bottom:10px;">
        <canvas id="obj3dMorphModalPreviewCanvas" width="900" height="420"
                style="display:block;width:100%;height:auto;
                       max-height:480px;"></canvas>
        <div style="position:absolute;top:6px;right:8px;font-size:9px;
                    color:#666;background:rgba(255,255,255,0.85);
                    padding:2px 6px;border-radius:4px;">
          ${(bb.width||0).toFixed(3)} × ${(bb.height||0).toFixed(3)} u
          ${mmPerUnit > 0 && mmPerUnit !== 1 ? ` · ${mmPerUnit} mm/u` : ''}
          ${isEnvelope ? ` · ${nPieces} piezas · hull ${hullPts} vért.` : ''}
        </div>
      </div>

      <!-- ── Sección colapsable: Capas de overlays geométricos ───────── -->
      <details id="obj3dMorphLayersDetails"
               style="margin-bottom:14px;border:1px solid #e0e0e0;
                      border-radius:6px;background:#fafafa;">
        <summary style="cursor:pointer;padding:7px 12px;font-size:11px;
                        font-weight:600;color:#444;user-select:none;">
          Capas ▾
        </summary>
        <div id="obj3dMorphLayersGrid"
             style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
                    gap:5px 14px;padding:10px 14px;font-size:10px;">
        </div>
      </details>

      <!-- ── Banner de envolvente, puente 2D↔3D, métricas y perforaciones ── -->
      <div>
        ${envelopeBanner}
        ${refHtml}
        ${holesPreviewHtml ? `<div style="margin-bottom:10px;">${holesPreviewHtml}</div>` : ''}
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          ${metricsHtml}
        </div>
      </div>`;

    // ── Pintar canvas y overlays ────────────────────────────────────────
    // El canvas vectorial es uniforme (envelope o single-piece). Esto
    // evita la línea fantasma del PNG con sub-loops concatenados y nos
    // permite superponer los overlays geométricos en la misma proyección.
    try {
      const _cv = document.getElementById('obj3dMorphModalPreviewCanvas');
      if (_cv && typeof _drawContourPreview === 'function') {
        const projection = _drawContourPreview(key, _cv, null, true);
        const geom       = data?.geometry_overlays;
        const overlaysAPI = window.MAO_Obj3dMorphOverlays;

        if (projection && geom && overlaysAPI) {
          // Estado persistente de capas (por sesión del modal)
          if (!state._morphOverlayLayers) {
            state._morphOverlayLayers = overlaysAPI.defaultLayers();
          }
          const layers = state._morphOverlayLayers;

          const ctx2 = _cv.getContext('2d');
          overlaysAPI.draw(ctx2, geom, projection, layers);

          // Poblar checkboxes de capas
          const grid = document.getElementById('obj3dMorphLayersGrid');
          if (grid) {
            grid.innerHTML = overlaysAPI.LAYER_DEFS.map(def => {
              const checked = layers[def.id] !== false ? 'checked' : '';
              return `
                <label style="display:flex;align-items:center;gap:6px;
                              cursor:pointer;line-height:1.4;">
                  <input type="checkbox" data-layer="${def.id}" ${checked}
                         style="accent-color:${def.color};margin:0;">
                  <span style="display:inline-block;width:14px;height:3px;
                               background:${def.color};border-radius:2px;"></span>
                  <span style="color:#333;">${def.label}</span>
                </label>`;
            }).join('');

            grid.querySelectorAll('input[type="checkbox"][data-layer]')
              .forEach(cb => {
                cb.addEventListener('change', () => {
                  layers[cb.dataset.layer] = cb.checked;
                  // Re-pintar: limpiar y volver a dibujar contorno + overlays
                  const proj2 = _drawContourPreview(key, _cv, null, true);
                  if (proj2) overlaysAPI.draw(ctx2, geom, proj2, layers);
                });
              });
          }
        } else if (projection) {
          // Sin overlays: al menos garantizar que se pinte el contorno
        }
      }
    } catch (_e) {
      console.warn('[obj3d-morph-canvas] error pintando overlays:', _e);
    }
  }

  function _buildCompactMorphMetricsHtml(m, color) {
    const fN = (v, d = 3) => (typeof v === 'number' && Number.isFinite(v)) ? v.toFixed(d) : '—';
    const unit  = m.area_unit      || 'u²';
    const punit = m.perimeter_unit || 'u';

    const grupos = [
      { titulo: 'I. Dimensiones', filas: [
          ['Área real',    `${fN(m.area,4)} ${unit}`,         'Á. hull',      `${fN(m.hull_area,4)} ${unit}`],
          ['Perímetro',    `${fN(m.perimeter,4)} ${punit}`,   'P. hull',      `${fN(m.perimeter_hull,4)} ${punit}`],
          ['Feret máx.',   `${fN(m.feret_max,4)} ${punit}`,  'Feret mín.',   `${fN(m.feret_min,4)} ${punit}`],
      ]},
      { titulo: 'II. Forma e Índices', filas: [
          ['Circularidad', fN(m.circularity),                 'Compacidad',   fN(m.compacidad_isoperimetrica)],
          ['Solidez',      fN(m.solidez),                     'Elongación',   fN(m.elongation)],
          ['AR (ceñido)',  fN(m.aspect_ratio_tight),          'Rectangularid',fN(m.rectangularity)],
          ['Lobularidad',  fN(m.indice_lobularidad),          'Excentricidad',fN(m.excentricidad)],
      ]},
      { titulo: 'III. Contorno', filas: [
          ['Rugosidad',    fN(m.rugosidad),                   'Dim. fractal', fN(m.fractal_dimension)],
          ['Curv. media',  fN(m.curvatura_media),             'E. curvatura', fN(m.curvatura_energia)],
      ]},
      { titulo: 'IV. Simetría y Orientación', filas: [
          ['Simetría bil.',fN(m.simetria_bilateral),          'Clasif.',       m.simetria_clasificacion||'—'],
          ['Eje mayor',    `${fN(m.eje_mayor,4)} ${punit}`,  'Eje menor',    `${fN(m.eje_menor,4)} ${punit}`],
          ['Orientación',  `${fN(m.orientacion_grados,1)}°`, '',             ''],
      ]},
    ];

    const thStyle = `background:${color};color:#fff;padding:8px 12px;font-size:11px;font-weight:600;border-radius:4px 4px 0 0;`;
    const tdK = 'padding:5px 10px;font-size:10px;color:#555;border:1px solid #e0e0e0;white-space:nowrap;';
    const tdV = 'padding:5px 10px;font-size:10px;font-weight:600;color:#222;border:1px solid #e0e0e0;font-variant-numeric:tabular-nums;';

    return grupos.map(g => `
      <div style="margin-bottom:16px;">
        <div style="${thStyle}">${g.titulo}</div>
        <table style="width:100%;border-collapse:collapse;"><tbody>
          ${g.filas.map(([k1,v1,k2,v2]) => `
            <tr>
              <td style="${tdK}">${k1}</td><td style="${tdV}">${v1}</td>
              ${k2 ? `<td style="${tdK}">${k2}</td><td style="${tdV}">${v2}</td>` : '<td colspan="2" style="border:1px solid #e0e0e0;"></td>'}
            </tr>`).join('')}
        </tbody></table>
      </div>`).join('');
  }

  /** Fallback compacto para mostrar métricas de perforaciones cuando
   *  generarTablaMetricasCompleta no está disponible. */
  function _buildCompactHolesHtml(holeAnalyses, mmPerUnit) {
    if (!holeAnalyses || holeAnalyses.length === 0) return '';
    const fN = (v, d = 3) => (typeof v === 'number' && Number.isFinite(v)) ? v.toFixed(d) : '—';
    const scaleLabel = mmPerUnit > 0 && mmPerUnit !== 1 ? 'mm' : 'u';
    const tdK = 'padding:4px 8px;font-size:10px;color:#555;border:1px solid #e0e0e0;';
    const tdV = 'padding:4px 8px;font-size:10px;font-weight:600;color:#222;border:1px solid #e0e0e0;font-variant-numeric:tabular-nums;';
    const thS = 'background:#c62828;color:#fff;padding:8px 12px;font-size:11px;font-weight:600;border-radius:4px 4px 0 0;';

    return `
      <div style="margin-top:20px;">
        <div style="${thS}">⊙ Perforaciones — ${holeAnalyses.length} detectada${holeAnalyses.length > 1 ? 's' : ''}</div>
        ${holeAnalyses.map(h => {
          const m = h.metricas || {};
          const unit  = m.area_unit      || 'u²';
          const punit = m.perimeter_unit || 'u';
          return `
            <div style="margin-top:10px;border-left:4px solid #e53935;padding-left:8px;">
              <div style="font-size:10px;font-weight:700;color:#e53935;margin-bottom:4px;">
                Perforación ${h.id}
              </div>
              <table style="width:100%;border-collapse:collapse;"><tbody>
                <tr><td style="${tdK}">Área</td><td style="${tdV}">${fN(m.area,3)} ${unit}</td>
                    <td style="${tdK}">Perímetro</td><td style="${tdV}">${fN(m.perimeter,3)} ${punit}</td></tr>
                <tr><td style="${tdK}">Circularidad</td><td style="${tdV}">${fN(m.circularity)}</td>
                    <td style="${tdK}">Solidez</td><td style="${tdV}">${fN(m.solidity)}</td></tr>
                <tr><td style="${tdK}">Feret máx.</td><td style="${tdV}">${fN(m.feret_max)} ${punit}</td>
                    <td style="${tdK}">Feret mín.</td><td style="${tdV}">${fN(m.feret_min)} ${punit}</td></tr>
                <tr><td style="${tdK}">Dist. centro</td><td style="${tdV}">${fN(h.distanciaAlCentro)} ${scaleLabel}</td>
                    <td style="${tdK}">Excentricidad</td><td style="${tdV}">${fN(m.excentricidad)}</td></tr>
              </tbody></table>
            </div>`;
        }).join('')}
      </div>`;
  }

  /** Renderiza el detalle de métricas 2D completas en el panel detalle derecho */
  function _renderContour2dResult(data, label) {
    const detailEl = document.getElementById('obj3dContour2dDetail');
    if (!detailEl) return;

    const m  = data.metricas || {};
    const bb = data.bbox_units || {};

    const fmtM = (v, d = 3) => (typeof v === 'number' && Number.isFinite(v)) ? v.toFixed(d) : (v ?? '—');

    // 13 métricas en tabla de 2 pares por fila (4 columnas)
    const pairs = [
      ['Área',          `${fmtM(m.area,3)} ${m.area_unit||'u²'}`,    'Perímetro',      `${fmtM(m.perimeter,3)} ${m.perimeter_unit||'u'}`],
      ['Circularidad',  fmtM(m.circularity),                  'Relación de aspecto (AR)', fmtM(m.aspect_ratio_tight??m.aspect_ratio_original)],
      ['Solidez',       fmtM(m.solidity),                     'Elongación',     fmtM(m.elongation)],
      ['Feret máx.',    `${fmtM(m.feret_max,3)} ${m.perimeter_unit||'u'}`, 'Feret mín.',     `${fmtM(m.feret_min,3)} ${m.perimeter_unit||'u'}`],
      ['Simetría bil.',fmtM(m.simetria_bilateral),              'Excentricidad', fmtM(m.excentricidad)],
      ['Rectangularidad',fmtM(m.rectangularity),              'Lobularidad',  fmtM(m.indice_lobularidad)],
      ['Dim. fractal',  fmtM(m.fractal_dimension),            '',             ''],
    ];
    const lk2 = t => `<td style="padding:2px 6px 2px 0;color:var(--gray-500);white-space:nowrap;font-size:9.5px;">${t}</td>`;
    const lv2 = v => `<td style="padding:2px 18px 2px 0;font-weight:500;font-variant-numeric:tabular-nums;font-size:9.5px;">${v}</td>`;
    const tableRows = pairs.map(([k1,v1,k2,v2]) =>
      `<tr>${lk2(k1)}${lv2(v1)}${lk2(k2)}${lv2(v2)}</tr>`
    ).join('');

    detailEl.innerHTML = `
      <div style="padding-top:8px;border-top:1px solid var(--border-color);">
        <div style="font-weight:700;font-size:10px;color:var(--gray-700);margin-bottom:5px;display:flex;align-items:baseline;gap:10px;">
          Métricas completas
          ${bb.width!=null?`<span style="font-weight:400;font-size:8.5px;color:var(--gray-400);">BBox: ${fmtM(bb.width,3)}×${fmtM(bb.height,3)} u</span>`:''}
        </div>
        <table style="width:100%;border-collapse:collapse;"><tbody>${tableRows}</tbody></table>
        ${(m.forma_clasificada||m.simetria_clasificacion)
          ? `<div style="margin-top:5px;display:flex;gap:16px;font-size:9px;color:var(--gray-600);">
               ${m.forma_clasificada?`<span>Forma: <strong>${m.forma_clasificada}</strong></span>`:''}
               ${m.simetria_clasificacion?`<span>Simetría: ${m.simetria_clasificacion}</span>`:''}
             </div>` : ''}
      </div>
    `;
  }

  // Estado inicial
  clearCanvas();
  updateSaveButtonState();
  updateIndependentSaveButtonState();
})();

// Funciones globales para controles UI
window._obj3dApplyView = function(viewName) {
  // Esta función es llamada por botones en HTML
  window.dispatchEvent(new CustomEvent('obj3d:apply-view', { detail: { view: viewName } }));
};
