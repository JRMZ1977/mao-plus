// MAO Plus — Visor OBJ 3D mejorado (caras sombreadas + wireframe + ejes)

(() => {
  const input = document.getElementById('obj3dInput');
  const loadBtn = document.getElementById('obj3dLoadBtn');
  const analyzeBtn = document.getElementById('obj3dAnalyzeBtn');
  const saveBtn = document.getElementById('obj3dSaveBtn');
  const resetViewBtn = document.getElementById('obj3dResetViewBtn');
  const fitViewBtn = document.getElementById('obj3dFitViewBtn');
  const exportPngBtn = document.getElementById('obj3dExportPngBtn');
  const setMorphAnchorBtn = document.getElementById('obj3dSetMorphAnchorBtn');
  const setContourZBtn = document.getElementById('obj3dSetContourZBtn');
  const statusEl = document.getElementById('obj3dStatus');
  const canvas = document.getElementById('obj3dCanvas');
  const basicInfoEl = document.getElementById('obj3dBasicInfo');
  const metricsEl = document.getElementById('obj3dMetrics');
  const samplesInput = document.getElementById('obj3dSamplesInput');
  const normalizeSelect = document.getElementById('obj3dNormalizeSelect');

  const showFacesCheck = document.getElementById('obj3dShowFaces');
  const showWireCheck = document.getElementById('obj3dShowWireframe');
  const showAxesCheck = document.getElementById('obj3dShowAxes');
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
    dragging: false,
    lastX: 0,
    lastY: 0,
    autoRotate: false,
    rafId: null,
    showFaces: true,
    showWireframe: true,
    showAxes: true,
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
    awaitingMorphAnchorPick: false,
    userMorphAnchor: null,
    userMorphAnchorIndex: null,
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
      setMorphAnchorBtn.title = enabled
        ? 'Seleccionar punto para orientación morfológica (override visual opcional)'
        : 'Disponible después de calcular métricas PCA';
    }
    if (setContourZBtn) {
      setContourZBtn.disabled = !enabled;
      setContourZBtn.title = enabled
        ? 'Usar Z como normal al plano de mínima varianza del contorno (override visual opcional)'
        : 'Disponible después de calcular métricas PCA';
    }
  }

  function setStatus(msg, isError = false) {
    statusEl.textContent = msg;
    statusEl.style.color = isError ? '#b00020' : 'var(--gray-500)';
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
    const edges = new Set();
    const triangles = [];
    let faceCount = 0;

    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      if (line.startsWith('v ')) {
        const parts = line.slice(2).trim().split(/\s+/);
        if (parts.length < 3) continue;
        const x = Number(parts[0]);
        const y = Number(parts[1]);
        const z = Number(parts[2]);
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
          vertices.push({ x, y, z });
        }
      } else if (line.startsWith('f ')) {
        const tokens = line.slice(2).trim().split(/\s+/);
        const idx = tokens
          .map((t) => t.split('/')[0])
          .map((s) => Number(s))
          .filter((n) => Number.isInteger(n) && n !== 0)
          .map((n) => (n > 0 ? n - 1 : vertices.length + n));

        if (idx.length < 3) continue;

        for (let j = 1; j < idx.length - 1; j++) {
          const a = idx[0];
          const b = idx[j];
          const c = idx[j + 1];
          faceCount += 1;
          triangles.push([a, b, c]);

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

    return { vertices, edges: edgeList, triangles, faceCount };
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
    const denom = Math.max(0.35, dist + vr.z);
    const persp = focal / denom;

    return {
      x: canvas.width * 0.5 + vr.x * persp * s,
      y: canvas.height * 0.5 - vr.y * persp * s,
      z: vr.z,
    };
  }

  function renderAxes() {
    if (!state.showAxes || !state.bbox) return;

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

    const lightDir = normalize3({
      x: state.lightDir.x,
      y: state.lightDir.y,
      z: state.lightDir.z * Math.max(0.25, state.lightPower),
    });

    const tris = [];
    for (const tri of state.triangles) {
      const [a, b, c] = tri;
      const ra = rotated[a];
      const rb = rotated[b];
      const rc = rotated[c];
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
      tris.push({ tri, intensity, avgZ });
    }

    tris.sort((a, b) => b.avgZ - a.avgZ);

    for (const t of tris) {
      const [a, b, c] = t.tri;
      const pa = projected[a];
      const pb = projected[b];
      const pc = projected[c];
      if (!pa || !pb || !pc) continue;

      const shade = Math.round(64 + 150 * t.intensity);
      ctx.fillStyle = `rgb(${shade - 8}, ${shade + 10}, ${shade + 22})`;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.lineTo(pc.x, pc.y);
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

    ctx.fillStyle = '#3f4c58';
    ctx.font = '11px sans-serif';
    ctx.fillText(`Vertices: ${state.vertices.length.toLocaleString()} | Caras: ${state.faces.toLocaleString()} | Aristas: ${state.edges.length.toLocaleString()}`, 12, 18);
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

    state.rotX = -0.45;
    state.rotY = 0.6;
    fitView();
    state.currentView = 'isometric';
    render();
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
      front: 'FRONT activo (cara B/anverso como referencia principal).',
      back: 'BACK activo (cara A/reverso como referencia principal).',
      left: 'LEFT activo (vista complementaria lateral desde referencia FRONT/BACK).',
      right: 'RIGHT activo (vista complementaria lateral desde referencia FRONT/BACK).',
      top: 'TOP activo (vista complementaria superior desde referencia FRONT/BACK).',
      bottom: 'BOT activo (vista complementaria inferior desde referencia FRONT/BACK).',
      isometric: 'Vista isométrica activa (solo exploración).',
    };
    return map[viewName] || 'Vista canónica actualizada.';
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
      : `<tr><td colspan="5" style="padding:6px 6px;color:#78909c;">Sin cortes válidos.</td></tr>`;

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
      `${sections.length > sectionPreview.length ? `<div class="obj3d-note">Mostrando ${sectionPreview.length} de ${sections.length} cortes transversales válidos.</div>` : ''}`,
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
      `<div class="obj3d-section-subtitle">Evalúa estabilidad de forma entre cortes consecutivos en PC1, PC2 y PC3.</div>`,
      `</div>`,
      `<div class="obj3d-chip-row"><span class="obj3d-chip obj3d-chip--blue">${overall?.consistency_level || '-'}</span></div>`,
      `</div>`,
      `<div class="obj3d-grid-2">`,
      `<div class="obj3d-mini-card"><div class="obj3d-mini-label">Similitud global</div><div class="obj3d-mini-value">${fmt(overall?.mean_procrustes_similarity, 4)}</div><div class="obj3d-mini-meta">media Procrustes entre cortes</div></div>`,
      `<div class="obj3d-mini-card"><div class="obj3d-mini-label">Ejes con datos</div><div class="obj3d-mini-value">${Number.isFinite(Number(overall?.axes_with_data)) ? Number(overall.axes_with_data) : 0}/3</div><div class="obj3d-mini-meta">cobertura secuencial útil</div></div>`,
      `</div>`,
      `<div class="obj3d-table-wrap" style="margin-top:8px;">`,
      `<table class="obj3d-table">`,
      `<thead><tr><th>eje</th><th>estado</th><th>cortes</th><th>simil.</th><th>nivel</th></tr></thead>`,
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
    setStatus(describeViewSemantics(normalizedView));
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
      `<div><strong>BBox Δ:</strong> (${fmt(b.dx, 3)}, ${fmt(b.dy, 3)}, ${fmt(b.dz, 3)})</div>`,
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

  function toStoragePayload() {
    if (!state.file || !state.bbox) return null;
    const ident = getAssignedIdentification();
    if (!ident) return { error: 'identificacion' };

    const nowIso = new Date().toISOString();
    const idObjeto = sanitizeLike2D(ident.valor) || 'objeto3d';

    const p = state.lastMetrics?.obj3d || state.lastMetrics || {};
    const eigen = Array.isArray(p.eigenvalues) ? p.eigenvalues : [];
    const faces = p.faces || {};
    const bif = faces.bifacial_index || {};
    const orient = p.orientation || {};

    // Métricas base para compatibilidad con pipeline 2D (campos mínimos + bloque 3D)
    const metricasCompat = {
      forma_detectada: 'obj3d_pca',
      area: toSafeNumber(p.bbox_volume, 0),
      perimeter: 0,
      circularity: toSafeNumber(p.sphericity, 0),
      solidity: 1,
      elongation: toSafeNumber(p.linearity, 0),
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
    };

    const canvasSnapshot = canvas.toDataURL('image/png');

    return {
      id: idObjeto,
      nombreObjeto: ident.valor,
      numeroObjeto: null,
      cara: null,
      modo: 'obj3d',
      tipoAnalisis: 'obj3d',
      timestamp: nowIso,
      identificacion: {
        tipo: ident.tipo || 'campos',
        nombre: ident.valor,
        valor: ident.valor,
        cara: null,
      },
      escala: 1,
      unidades: 'u3d',
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
      },
      imagenRecortada: canvasSnapshot,
      canvasImgenes: {
        morphological: canvasSnapshot,
      },
      imagenes: {
        recortada: canvasSnapshot,
      },
    };
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
      setStatus('Guardando análisis 3D en proyecto...');
      await pm.addAnalysis(payload);
      setStatus(`Análisis 3D guardado en proyecto: ${pm.activeProject.name}`);
      if (window.toast?.success) window.toast.success('Análisis 3D guardado correctamente en el proyecto activo.');
    } catch (err) {
      console.error('[OBJ3D] Error guardando análisis 3D:', err);
      setStatus(`Error al guardar análisis 3D: ${err?.message || 'desconocido'}`, true);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
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
      `<div class="obj3d-kpi-card"><div class="obj3d-kpi-label">Coherencia 2D↔3D</div><div class="obj3d-kpi-value">${fmt(coherence?.score, 4)}</div><div class="obj3d-kpi-meta">${coherence?.level || 'sin lectura'} · FRONT/BACK como referencia</div></div>`,
      `<div class="obj3d-kpi-card"><div class="obj3d-kpi-label">Homología bifacial</div><div class="obj3d-kpi-value">${fmt(canonicalMorph?.mao_plus_indices?.bifacial_homology_index, 4)}</div><div class="obj3d-kpi-meta">balance canónico entre Cara A y Cara B</div></div>`,
      `<div class="obj3d-kpi-card"><div class="obj3d-kpi-label">Procrustes secuencial</div><div class="obj3d-kpi-value">${fmt(pcaSequential?.overall?.mean_procrustes_similarity, 4)}</div><div class="obj3d-kpi-meta">consistencia ${pcaSequential?.overall?.consistency_level || '-'}</div><div class="obj3d-score-track"><div class="obj3d-score-fill ${heroScore >= 0.85 ? 'obj3d-score-fill--green' : heroScore >= 0.7 ? 'obj3d-score-fill--blue' : heroScore >= 0.5 ? 'obj3d-score-fill--amber' : 'obj3d-score-fill--red'}" style="width:${Math.max(0, Math.min(100, Number(heroScore || 0) * 100))}%;"></div></div></div>`,
      `</div>`,
      `</section>`,

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

      `<section class="obj3d-section-card">`,
      `<div class="obj3d-section-top">`,
      `<div>`,
      `<div class="obj3d-section-title">Orientación canónica</div>`,
      `<div class="obj3d-section-subtitle">La semántica FRONT/BACK gobierna la lectura principal del objeto.</div>`,
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
      `</section>`,

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
      `<div class="obj3d-mini-card"><div class="obj3d-mini-label">Área 2D ref.</div><div class="obj3d-mini-value">${fmt(frontBackRef?.area_2d, 4)}</div><div class="obj3d-mini-meta">plano FRONT/BACK</div></div>`,
      `<div class="obj3d-mini-card"><div class="obj3d-mini-label">Perímetro 2D ref.</div><div class="obj3d-mini-value">${fmt(frontBackRef?.perimeter_2d, 4)}</div><div class="obj3d-mini-meta">lectura homologada</div></div>`,
      `<div class="obj3d-mini-card"><div class="obj3d-mini-label">Circularidad / AR</div><div class="obj3d-mini-value">${fmt(frontBackRef?.circularity_2d, 4)} / ${fmt(frontBackRef?.aspect_ratio_2d, 4)}</div><div class="obj3d-mini-meta">perfil de referencia</div></div>`,
      `</div>`,
      `<div class="obj3d-definition-list" style="margin-top:8px;">`,
      `<div class="obj3d-definition-item"><div class="obj3d-definition-term">Balance FRONT/BACK</div><div class="obj3d-definition-desc">Área ${fmt(fbBalance?.area_balance, 4)} · perímetro ${fmt(fbBalance?.perimeter_balance, 4)}</div></div>`,
      `<div class="obj3d-definition-item"><div class="obj3d-definition-term">Cortes transversales</div><div class="obj3d-definition-desc">${Number.isFinite(Number(transverseSummary?.count)) ? Number(transverseSummary.count) : 0} cortes · área media ${fmt(transverseSummary?.mean_area, 4)} · espesor Z ${fmt(transverseSummary?.mean_thickness_z, 4)}</div></div>`,
      `<div class="obj3d-definition-item"><div class="obj3d-definition-term">Componentes de coherencia</div><div class="obj3d-definition-desc">Bifacial ${fmt(coherenceComp?.bifacial_homology, 3)} · longitudinal ${fmt(coherenceComp?.longitudinal_stability, 3)} · forma ${fmt(coherenceComp?.shape_consistency, 3)} · espesor ${fmt(coherenceComp?.thickness_consistency, 3)}</div></div>`,
      `${orientedPlanes?.lateral_xz ? `<div class="obj3d-definition-item"><div class="obj3d-definition-term">LEFT/RIGHT (XZ)</div><div class="obj3d-definition-desc">Área ${fmt(orientedPlanes.lateral_xz?.area, 4)} · AR ${fmt(orientedPlanes.lateral_xz?.aspect_ratio, 4)}</div></div>` : ''}`,
      `${orientedPlanes?.transversal_yz ? `<div class="obj3d-definition-item"><div class="obj3d-definition-term">TOP/BOT (YZ)</div><div class="obj3d-definition-desc">Área ${fmt(orientedPlanes.transversal_yz?.area, 4)} · AR ${fmt(orientedPlanes.transversal_yz?.aspect_ratio, 4)}</div></div>` : ''}`,
      `</div>`,
      `</section>`,

      maoPlusModuleHtml,
      pcaSequentialHtml,
      homologation3dHtml,
      `</div>`,
    ].join('');
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
      state.bbox = computeBounds(parsed.vertices);
      state.center = state.bbox.center;
      state.pcaAxes = null;
      state.lastMetrics = null;
      state.v2Data = null;
      state.rotationLocked = false;
      state.orientationMode = 'auto_visual';
      state.orientationOverrideMode = null;
      state.metricsComputed = false;
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
      if (saveBtn) saveBtn.disabled = true;

      setStatus('Objeto 3D cargado correctamente. Usa los toggles para ajustar la visualización.');
    } catch (err) {
      console.error('[OBJ3D] Error cargando OBJ:', err);
      setStatus(`Error al cargar OBJ: ${err?.message || 'desconocido'}`, true);
      analyzeBtn.disabled = true;
    }
  }

  async function analyzeObj3d({ preserveOverride = false } = {}) {
    if (!state.file) {
      setStatus('No hay archivo OBJ cargado para análisis.', true);
      return;
    }

    const nSamples = Math.max(1000, Math.min(200000, Number(samplesInput.value) || 20000));
    const normalizeMode = normalizeSelect.value || 'none';
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
        normalizeMode,
        analysisLevel: 'v2',  // ← USAR v2: arquitectura correcta
        orientationMode: requestOrientationMode,
        userMorphAnchor: requestAnchor,
      });

      if (!result) {
        metricsEl.innerHTML = '<div>Backend v2 no activo (servidor Python no disponible).</div>';
        setStatus('Servidor Python no disponible. Visualización local activa.', true);
        return;
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
        }
      }

      state.pcaAxes = extractPcaAxes(result);
      state.lastMetrics = result;
      state.metricsComputed = true;
      setOrientationOverrideControlsEnabled(true);

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
      
      // Aplicar SIEMPRE la vista canónica esperada automáticamente.
      // Los botones quedan como navegación complementaria, no como requisito.
      const autoView = getAutomaticCanonicalView(state.v2Data);
      applyPredefinedView(autoView);

      render();
      if (saveBtn) saveBtn.disabled = false;
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
    }
  }

  // Eventos UI
  input.addEventListener('change', () => {
    const file = input.files && input.files[0] ? input.files[0] : null;
    state.file = file;
    loadBtn.disabled = !file;
    analyzeBtn.disabled = true;
    metricsEl.textContent = 'No calculadas.';
    if (saveBtn) saveBtn.disabled = true;

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
      setStatus('Carga un OBJ antes de definir el ancla morfológica.', true);
      return;
    }
    if (!state.metricsComputed) {
      setStatus('Calcula métricas PCA primero; luego puedes aplicar ancla morfológica como override visual.', true);
      return;
    }
    state.awaitingMorphAnchorPick = true;
    state.orientationOverrideMode = 'user_morphological_axis';
    canvas.style.cursor = 'crosshair';
    setStatus('Haz clic sobre el objeto para fijar el punto de orientación morfológica (override visual sobre la orientación automática).');
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
      render();
      setStatus('Ancla morfológica fijada como override visual. Recalculando orientación...');
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

  // Estado inicial
  clearCanvas();
})();

// Funciones globales para controles UI
window._obj3dApplyView = function(viewName) {
  // Esta función es llamada por botones en HTML
  window.dispatchEvent(new CustomEvent('obj3d:apply-view', { detail: { view: viewName } }));
};
