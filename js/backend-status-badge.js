/**
 * MAO Plus — Backend Status Badge
 * =================================
 * Chip de cabecera que refleja el estado del backend Python (FastAPI).
 *
 * Estados:
 *   ready       → 🟢 conectado y operativo
 *   restarting  → 🟡 reiniciando tras crash o watchdog
 *   starting    → 🟡 arrancando (boot inicial)
 *   down        → 🔴 caído / modo solo-JS
 *   unknown     → ⚪ aún sin información
 *
 * Fuentes de estado (en orden de prioridad):
 *   1. window.electronAPI.onBackendStatus (eventos del proceso main)
 *   2. window.PythonBridge.onStatusChange (transiciones detectadas por el bridge JS)
 *   3. Snapshot inicial vía electronAPI.getBackendStatus() al cargar
 */
(function () {
  'use strict';

  const STATE_META = {
    ready:      { color: '#28a745', label: 'Backend OK' },
    starting:   { color: '#f9a825', label: 'Backend…' },
    restarting: { color: '#f9a825', label: 'Reiniciando…' },
    down:       { color: '#e53935', label: 'Backend caído' },
    unknown:    { color: '#9e9e9e', label: 'Backend…' },
  };

  let lastState = 'unknown';
  let lastSnapshot = {};

  function _el() { return document.getElementById('backendStatusBadge'); }

  function _formatTooltip(state, snap) {
    const lines = [`Estado: ${state}`];
    if (snap.pid)       lines.push(`PID: ${snap.pid}`);
    if (snap.url)       lines.push(`URL: ${snap.url}`);
    if (typeof snap.restarts === 'number') lines.push(`Reinicios: ${snap.restarts}`);
    if (snap.lastError) lines.push(`Último error: ${snap.lastError}`);
    if (snap.health && Array.isArray(snap.health.modules)) {
      lines.push(`Módulos: ${snap.health.modules.length}`);
    }
    if (snap.health && snap.health.modules_failed) {
      const failed = Object.keys(snap.health.modules_failed);
      if (failed.length) lines.push(`Fallidos: ${failed.join(', ')}`);
    }
    return lines.join('\n');
  }

  function render(state, snap = {}) {
    const badge = _el();
    if (!badge) return;
    const meta = STATE_META[state] || STATE_META.unknown;
    // Quitar todas las clases backend-badge--*
    badge.className = badge.className
      .split(/\s+/)
      .filter((c) => !c.startsWith('backend-badge--'))
      .concat(['backend-badge', `backend-badge--${state}`])
      .join(' ');
    const dot = badge.querySelector('.backend-badge-dot');
    const lbl = badge.querySelector('.backend-badge-label');
    if (dot) dot.style.background = meta.color;
    if (lbl) lbl.textContent = meta.label;
    badge.title = _formatTooltip(state, snap);
  }

  function update(state, snap = {}) {
    if (state) lastState = state;
    lastSnapshot = { ...lastSnapshot, ...snap };
    render(lastState, lastSnapshot);
  }

  function _stateFromBridge(payload) {
    if (payload.state) return payload.state;          // si viene del IPC main
    if (payload.available) return 'ready';
    return 'down';
  }

  function init() {
    render(lastState, {});

    // 1) IPC main (Electron)
    try {
      if (window.electronAPI && typeof window.electronAPI.onBackendStatus === 'function') {
        window.electronAPI.onBackendStatus((payload) => {
          if (!payload) return;
          update(payload.state || (payload.ready ? 'ready' : 'down'), payload);
        });
      }
      if (window.electronAPI && typeof window.electronAPI.getBackendStatus === 'function') {
        window.electronAPI.getBackendStatus().then((snap) => {
          if (snap) update(snap.state || (snap.ready ? 'ready' : 'down'), snap);
        }).catch(() => {});
      }
    } catch { /* no Electron */ }

    // 2) PythonBridge (motor JS)
    try {
      if (window.PythonBridge && typeof window.PythonBridge.onStatusChange === 'function') {
        window.PythonBridge.onStatusChange((payload) => {
          if (!payload) return;
          update(_stateFromBridge(payload), payload);
        });
      }
    } catch {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exponer para debug
  window.MAO_BackendBadge = { update, render, _state: () => ({ lastState, lastSnapshot }) };
})();
