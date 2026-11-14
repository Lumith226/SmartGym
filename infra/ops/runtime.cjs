const { randomUUID } = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const { Server } = require('node:http');
const { Server: HttpsServer } = require('node:https');
const { ROOT_CONTEXT, context, trace, metrics } = require('@opentelemetry/api');
const telemetryEnabled = process.env.OTEL_SDK_DISABLED === 'false';
if (telemetryEnabled) require('@opentelemetry/auto-instrumentations-node/register');

const requestContext = new AsyncLocalStorage();
const service = process.env.OTEL_SERVICE_NAME || 'smartgym';
const write = process.stdout.write.bind(process.stdout);
const pending = [];
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const meter = metrics.getMeter('smartgym.runtime');
const internalHosts = new Set(['identity', 'catalog', 'workout', 'progress', 'notification', 'pose', 'pose-engine', 'rag']);
const outgoing = require('node:http').ClientRequest.prototype;
const end = outgoing.end;
outgoing.end = function (...args) {
  const id = requestContext.getStore()?.requestId;
  if (id && !this.headersSent && internalHosts.has(this.host)) this.setHeader('x-smartgym-request-id', id);
  return end.apply(this, args);
};
const requests = meter.createCounter('smartgym.http.requests');
const duration = meter.createHistogram('smartgym.http.duration', { unit: 's' });
meter.createObservableGauge('smartgym.process.rss', { unit: 'By' })
  .addCallback(observation => observation.observe(process.memoryUsage.rss(), { 'service.name': service }));
function log(level, entry) {
  const record = { timestamp: new Date().toISOString(), service, level, ...requestContext.getStore(), ...entry };
  const message = JSON.stringify(record);
  write(message + '\n');
  if (telemetryEnabled && endpoint && pending.length < 512) pending.push({
    timeUnixNano: String(BigInt(Date.now()) * 1000000n), severityText: level.toUpperCase(),
    body: { stringValue: message }, traceId: record.traceId,
    attributes: [{ key: 'level', value: { stringValue: level } }],
  });
}

if (telemetryEnabled && endpoint) {
  let exporting = false;
  setInterval(async () => {
    if (exporting || !pending.length) return;
    exporting = true;
    const logRecords = pending.splice(0);
    try {
      await context.with(ROOT_CONTEXT, () =>
        fetch(new URL('/v1/logs', endpoint), {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ resourceLogs: [{ resource: { attributes: [{ key: 'service.name',
            value: { stringValue: service } }] }, scopeLogs: [{ scope: { name: 'smartgym.runtime' }, logRecords }] }] }),
          signal: AbortSignal.timeout(2000),
        }));
    } catch {
      // The JSON lines remain available through the Docker logging driver.
    } finally { exporting = false; }
  }, 1000).unref();
}
for (const [method, level] of [['log', 'info'], ['info', 'info'], ['warn', 'warn'], ['error', 'error']]) {
  console[method] = (...args) => log(level, { message: typeof args[0] === 'string' ? args[0] : 'Application event',
    ...(typeof args[1]?.code === 'string' ? { errorCode: args[1].code } : {}) });
}

for (const prototype of [Server.prototype, HttpsServer.prototype]) {
  const emit = prototype.emit;
  prototype.emit = function (event, ...args) {
    if (event !== 'request') return emit.call(this, event, ...args);
    const [req, res] = args;
    const started = performance.now();
    const incoming = req.socket.authorized && req.headers['x-smartgym-request-id'];
    const requestId = typeof incoming === 'string' && /^[a-f0-9-]{36}$/.test(incoming) ? incoming : randomUUID();
    const traceId = trace.getSpan(context.active())?.spanContext().traceId;
    const fields = { requestId, ...(traceId ? { traceId } : {}) };
    res.setHeader('x-request-id', requestId);
    res.once('finish', () => {
      const elapsed = performance.now() - started;
      const attributes = { 'service.name': service, 'status.class': Math.floor(res.statusCode / 100) + 'xx' };
      requests.add(1, attributes);
      duration.record(elapsed / 1000, attributes);
      log(res.statusCode >= 500 ? 'error' : 'info', {
        ...fields, event: 'request_complete', method: req.method, status: res.statusCode,
        durationMs: Math.round(elapsed),
      });
    });
    return requestContext.run(fields, () => emit.call(this, event, ...args));
  };
}
