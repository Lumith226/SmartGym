// Test-only instrumentation; loaded before the product JavaScript.
(() => {
  const b = window.__latency = {frames: [], fetches: [], errors: [], active: false, startAt: null};
  const pending = new Map();
  let captureAt = null, dimensions = null;
  const draw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function(source, ...args) {
    if (source instanceof HTMLVideoElement && source.id === 'preview' && b.active) {
      captureAt = performance.now(); dimensions = [this.canvas.width, this.canvas.height];
    }
    return draw.call(this, source, ...args);
  };
  document.addEventListener('click', event => {
    if (event.target.closest('#start-analysis') && !b.active) {
      b.startAt = performance.now(); b.active = true;
    }
  }, true);
  const NativeSocket = window.WebSocket;
  const nativeSend = NativeSocket.prototype.send;
  NativeSocket.prototype.send = function(data) {
    if (data instanceof Blob && b.active) {
      const sentAt = performance.now(), captured = captureAt, size = dimensions;
      data.arrayBuffer().then(buffer => {
        const n = new DataView(buffer).getUint32(0, true);
        const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, n)));
        pending.set(`${meta.generation}:${meta.frame_id}`, {sentAt, captureAt: captured, dimensions: size});
      }).catch(error => b.errors.push(String(error)));
    }
    return nativeSend.call(this, data);
  };
  window.WebSocket = class extends NativeSocket {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', event => {
        const arrivedAt = performance.now();
        let m; try { m = JSON.parse(event.data); } catch { return; }
        if (m.type === 'error') { b.errors.push(m.message); return; }
        if (m.type !== 'result' || !b.active) return;
        const p = pending.get(`${m.generation}:${m.frame_id}`);
        if (!p || p.captureAt == null) { b.errors.push('Missing capture/send pair'); return; }
        pending.delete(`${m.generation}:${m.frame_id}`);
        const scored = !!m.result?.label_results?.some(row => row.probability != null);
        const row = {
          frame_id: m.frame_id, exercise: m.exercise, elapsed_ms: p.captureAt - b.startAt,
          received_elapsed_ms: arrivedAt - b.startAt, dimensions: p.dimensions,
          capture_to_receive_ms: arrivedAt - p.captureAt,
          send_to_receive_ms: arrivedAt - p.sentAt,
          capture_to_send_ms: p.sentAt - p.captureAt,
          server_ms: m.metrics?.server_ms, pose_ms: m.metrics?.pose_ms,
          found: m.found, scored, status: m.result?.status,
          window_duration_s: m.result?.duration_seconds,
          prediction_signature: scored ? JSON.stringify([m.result.duration_seconds, m.result.probabilities]) : null,
          classifier_ms: scored ? m.result.latency_ms : null
        };
        b.frames.push(row);
        // The next animation callback after the message handler updates the DOM.
        // This is not photon/display-panel latency.
        requestAnimationFrame(() => {
          row.capture_to_dom_raf_ms = performance.now() - p.captureAt;
          row.dom_summary = document.querySelector('#summary-title')?.textContent;
        });
      });
    }
  };
  const nativeFetch = window.fetch;
  window.fetch = async (...args) => {
    const start = performance.now();
    const response = await nativeFetch(...args);
    if (String(args[0]).includes('/api/analyze-video')) {
      const row = {start, headers_ms: performance.now() - start, status: response.status};
      b.fetches.push(row);
      response.clone().json().then(value => {
        row.body_ms = performance.now() - start;
        row.server_elapsed_ms = value.elapsed_seconds == null ? null : value.elapsed_seconds * 1000;
        row.scored = !!value.result?.label_results?.some(x => x.probability != null);
      });
      const watch = () => {
        if (document.querySelector('#notice')?.textContent.includes('Đã phân tích toàn video'))
          requestAnimationFrame(() => { row.dom_raf_ms = performance.now() - start; });
        else setTimeout(watch, 10);
      };
      watch();
    }
    return response;
  };
})();
