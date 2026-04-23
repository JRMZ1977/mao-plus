/**
 * canvas-zoom.js — Sistema de zoom + pan para canvas de análisis
 * v2.0 — Barra de controles con porcentaje, niveles snap y centrado
 *
 * API pública:
 *   const zc = attachCanvasZoom(canvas [, opts]);
 *   zc.reset()        — volver a 100% y reposicionar al origen
 *   zc.center()       — recentrar en el wrapper sin cambiar zoom
 *   zc.setZoom(n)     — establecer zoom (1.0 = 100%)
 *
 * Controles interactivos:
 *   − Rueda del ratón : zoom centrado en el cursor (snap opcional con Ctrl)
 *   − Arrastre        : panoramizar (pan)
 *   − Doble clic      : resetear zoom
 *   − Barra flotante  : [−] [porcentaje] [+] [⊙]
 *     · aparece al hacer hover sobre el contenedor
 *     · el porcentaje se resalta en azul cuando no es 100 %
 *     · [−]/[+] saltan al nivel predefinido inferior/superior
 *     · clic en el porcentaje → resetear
 *     · [⊙] → centrar sin cambiar zoom
 */

(function () {
  'use strict';

  // Niveles predefinidos de zoom (snap points)
  const SNAP = [0.25, 0.33, 0.5, 0.67, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0, 6.0, 8.0];

  function snapDown(s) {
    for (let i = SNAP.length - 1; i >= 0; i--) {
      if (SNAP[i] < s - 0.015) return SNAP[i];
    }
    return SNAP[0];
  }
  function snapUp(s) {
    for (let i = 0; i < SNAP.length; i++) {
      if (SNAP[i] > s + 0.015) return SNAP[i];
    }
    return SNAP[SNAP.length - 1];
  }
  function fmtPct(s) {
    const p = s * 100;
    return (Math.abs(p - Math.round(p)) < 0.05 ? Math.round(p).toString() : p.toFixed(1)) + '%';
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object}  [opts]
  * @param {number}  [opts.minScale=0.25]
  * @param {number}  [opts.maxScale=8]
  * @param {number}  [opts.step=0.08]   factor multiplicativo base por tick de rueda
  * @param {number}  [opts.wheelSensitivity=0.0018] sensibilidad para deltaY
  * @param {number}  [opts.panPadding=40] margen de pan para no perder el canvas
   * @returns {{ reset:function, center:function, setZoom:function }}
   */
  function attachCanvasZoom(canvas, opts = {}) {
    if (!canvas || canvas._zoomAttached) {
      return { reset: () => {}, center: () => {}, setZoom: () => {} };
    }
    canvas._zoomAttached = true;

    const MIN  = opts.minScale ?? 0.25;
    const MAX  = opts.maxScale ?? 8;
    const STEP = opts.step     ?? 0.08;
    const WHEEL_SENS = opts.wheelSensitivity ?? 0.0018;
    const PAN_PADDING = opts.panPadding ?? 40;

    // ── Estado ────────────────────────────────────────────────────────────────
    let scale    = 1;
    let tx = 0, ty = 0;
    let dragging = false;
    let lastX = 0, lastY = 0;
    let hideTimer = null;

    // ── Wrapper ───────────────────────────────────────────────────────────────
    const wrap =
      canvas.closest('.cmo-canvas-zoom-wrap') ||
      canvas.closest('.ps-canvas-viewport')   ||
      canvas.closest('.ps-canvas-wrap')       ||
      canvas.closest('.cmo-radar-canvas-wrap') ||
      canvas.parentElement;

    if (wrap) {
      wrap.style.overflow = 'hidden';
      wrap.style.position = 'relative';
    }

    // ── Barra de controles ─────────────────────────────────────────────────────
    let bar       = null;
    let pctBtn    = null;

    if (wrap) {
      bar = document.createElement('div');
      bar.className = 'cz-bar';
      bar.innerHTML = `
        <button class="cz-btn cz-minus" title="Reducir zoom [−]">−</button>
        <button class="cz-btn cz-pct"   title="Zoom actual — clic para resetear al 100%">100%</button>
        <button class="cz-btn cz-plus"  title="Ampliar zoom [+]">+</button>
        <span class="cz-sep"></span>
        <button class="cz-btn cz-fit"   title="Centrar canvas [⊙]">⊙</button>
      `;
      wrap.appendChild(bar);

      pctBtn = bar.querySelector('.cz-pct');

      bar.querySelector('.cz-minus').addEventListener('click', e => {
        e.stopPropagation();
        applyZoom(snapDown(scale), null);
      });
      bar.querySelector('.cz-plus').addEventListener('click', e => {
        e.stopPropagation();
        applyZoom(snapUp(scale), null);
      });
      pctBtn.addEventListener('click', e => { e.stopPropagation(); reset(); });
      bar.querySelector('.cz-fit').addEventListener('click', e => { e.stopPropagation(); center(); });

      // Mostrar barra al hacer hover sobre el wrapper
      const showBar  = () => { clearTimeout(hideTimer); bar.classList.add('cz-bar--visible'); };
      const schedHide = () => { hideTimer = setTimeout(() => bar.classList.remove('cz-bar--visible'), 1400); };

      wrap.addEventListener('mouseenter', showBar);
      wrap.addEventListener('mousemove',  showBar);
      wrap.addEventListener('mouseleave', schedHide);
      bar.addEventListener('mouseenter',  showBar);
      bar.addEventListener('mouseleave',  schedHide);
    }

    // ── applyTransform ─────────────────────────────────────────────────────────
    function clampPan() {
      if (!wrap) return;
      const ww = wrap.clientWidth  || wrap.offsetWidth || 0;
      const wh = wrap.clientHeight || wrap.offsetHeight || 0;
      const cw = canvas.width * scale;
      const ch = canvas.height * scale;

      if (cw <= ww) {
        tx = (ww - cw) / 2;
      } else {
        const minTx = ww - cw - PAN_PADDING;
        const maxTx = PAN_PADDING;
        tx = Math.max(minTx, Math.min(maxTx, tx));
      }

      if (ch <= wh) {
        ty = (wh - ch) / 2;
      } else {
        const minTy = wh - ch - PAN_PADDING;
        const maxTy = PAN_PADDING;
        ty = Math.max(minTy, Math.min(maxTy, ty));
      }
    }

    function applyTransform() {
      clampPan();
      canvas.style.transformOrigin = '0 0';
      canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      canvas.dataset.zoomScale = String(scale);
      canvas.dispatchEvent(new CustomEvent('canvaszoomchange', {
        detail: { scale, tx, ty, minScale: MIN, maxScale: MAX }
      }));

      if (pctBtn) {
        pctBtn.textContent = fmtPct(scale);
        const changed = Math.abs(scale - 1) > 1e-6 || Math.abs(tx) > 1e-6 || Math.abs(ty) > 1e-6;
        pctBtn.classList.toggle('cz-pct--changed', changed);
      }
      canvas.style.cursor = scale > 1 ? (dragging ? 'grabbing' : 'grab') : '';
    }

    /**
     * Cambia la escala. Si se facilita un pivot {mx,my} (coord. relativas al
     * canvas en px post-escala), el punto bajo el cursor permanece fijo.
     */
    function applyZoom(newScale, pivot) {
      newScale = Math.max(MIN, Math.min(MAX, newScale));
      if (newScale === scale) return;
      if (pivot) {
        const cx = (pivot.mx - tx) / scale;
        const cy = (pivot.my - ty) / scale;
        tx = pivot.mx - cx * newScale;
        ty = pivot.my - cy * newScale;
      }
      scale = newScale;
      applyTransform();
    }

    // ── reset / center ─────────────────────────────────────────────────────────
    function reset() {
      scale = 1; tx = 0; ty = 0;
      applyTransform();
    }

    function center() {
      if (!wrap) return;
      const ww = wrap.clientWidth  || wrap.offsetWidth;
      const wh = wrap.clientHeight || wrap.offsetHeight;
      const cw = canvas.width  * scale;
      const ch = canvas.height * scale;
      // Solo centrar si el canvas cabe; si es más grande que el wrapper, ir a (0,0)
      tx = cw < ww ? (ww - cw) / 2 : tx;
      ty = ch < wh ? (wh - ch) / 2 : ty;
      applyTransform();
    }

    // ── Rueda del ratón ────────────────────────────────────────────────────────
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      e.stopPropagation();
      const rect   = canvas.getBoundingClientRect();
      const mx     = e.clientX - rect.left;
      const my     = e.clientY - rect.top;

      // Zoom prudente: delta proporcional y acotado para rueda/trackpad
      const deltaAbs = Math.min(240, Math.abs(e.deltaY));
      const dynamicStep = Math.min(0.2, Math.max(0.03, STEP + deltaAbs * WHEEL_SENS));
      const factor = e.deltaY < 0 ? (1 + dynamicStep) : (1 / (1 + dynamicStep));

      // Ctrl/Cmd: modo de saltos discretos para mayor control fino
      if (e.ctrlKey || e.metaKey) {
        const target = e.deltaY < 0 ? snapUp(scale) : snapDown(scale);
        applyZoom(target, { mx, my });
      } else {
        applyZoom(scale * factor, { mx, my });
      }
    }, { passive: false });

    // ── Pan con arrastre ───────────────────────────────────────────────────────
    canvas.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.style.cursor = 'grabbing';
    });

    const _onMove = e => {
      if (!dragging) return;
      tx += e.clientX - lastX;
      ty += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      applyTransform();
    };
    const _onUp = () => {
      if (!dragging) return;
      dragging = false;
      canvas.style.cursor = scale > 1 ? 'grab' : '';
    };
    window.addEventListener('mousemove', _onMove, { passive: true });
    window.addEventListener('mouseup',   _onUp,   { passive: true });

    // ── Doble clic: reset ──────────────────────────────────────────────────────
    canvas.addEventListener('dblclick', reset);

    // ── Limpieza de listeners al destruir el canvas ────────────────────────────
    function detach() {
      window.removeEventListener('mousemove', _onMove);
      window.removeEventListener('mouseup',   _onUp);
      canvas._zoomAttached = false;
      if (hideTimer) clearTimeout(hideTimer);
      if (bar && bar.parentElement) bar.remove();
    }

    applyTransform();

    return { reset, center, setZoom: s => applyZoom(s, null), detach };
  }

  /**
   * Elimina los event listeners de window y el estado de zoom de un canvas.
   * Llamar antes de destruir o reutilizar el elemento canvas.
   * @param {HTMLCanvasElement} canvas
   */
  function detachCanvasZoom(canvas) {
    if (canvas && canvas._zoomDetach) canvas._zoomDetach();
  }

  window.attachCanvasZoom = function(canvas, opts) {
    const ctrl = attachCanvasZoom(canvas, opts);
    // Guardar referencia a detach en el propio elemento para acceso externo
    if (canvas) canvas._zoomDetach = ctrl.detach;
    return ctrl;
  };
  window.detachCanvasZoom = detachCanvasZoom;
})();
