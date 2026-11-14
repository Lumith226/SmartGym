import { readFile } from 'node:fs/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import contracts from '../data/chat-contracts.json' with { type: 'json' };
import {
  AuthError,
  assertionForSession,
  sessionCookie,
} from './identity-client.mjs';
import { problem, readJson, requireSameOrigin } from './auth.mjs';
import { loadPoseLiveConfig } from './pose-live.mjs';
const ajv = new Ajv2020({ strict: false });
addFormats(ajv);
ajv.addSchema({ $id: 'web-chat', $defs: contracts.schemas });
const valid = (name, value) => ajv.getSchema('web-chat#/$defs/' + name)(value);
const fail = (status = 503, code = 'RAG_UNAVAILABLE') =>
  new AuthError(status, code);
const unsafeText =
  /(?<![A-Za-z0-9+.-])[A-Za-z]:[\\/]|(?:\/run\/secrets|\/home\/|\/tmp\/)|Bearer\s+\S+|(?:api[_-]?key|password|token)\s*[:=]\s*\S+/i;
const text = (v, max = 3000) => {
  if (typeof v !== 'string' || v.length > max || unsafeText.test(v))
    throw fail();
  return v;
};
const pick = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k]]));
function within(work, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(fail(504, 'RAG_TIMEOUT'));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve()
      .then(work)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}
export async function loadChatConfig() {
  if (process.env.BFF_RAG_ENABLED !== 'true') throw fail(503, 'RAG_DISABLED');
  const origin = process.env.BFF_RAG_ORIGIN,
    url = origin && URL.parse(origin),
    revision = process.env.BFF_RAG_RUNTIME_REVISION;
  if (
    !url ||
    url.origin !== origin ||
    url.protocol !== 'https:' ||
    !/^[a-f0-9]{16}$/.test(revision ?? '')
  )
    throw fail();
  const [key, cert, ca, secret, registryText] = await Promise.all([
    ...['KEY', 'CERT', 'CA'].map((k) =>
      readFile(process.env['BFF_RAG_TLS_' + k + '_FILE'], 'utf8'),
    ),
    readFile(process.env.BFF_RAG_TOKEN_FILE, 'utf8'),
    readFile(process.env.BFF_RAG_SOURCES_FILE, 'utf8'),
  ]);
  const token = secret.trim();
  if (token.length < 32 || token.length > 4096 || /\s/.test(token))
    throw fail();
  const registry = JSON.parse(registryText);
  if (!Array.isArray(registry) || registry.length > 10000) throw fail();
  const sources = new Map();
  for (const row of registry) {
    if (
      !row ||
      typeof row.id !== 'string' ||
      !row.id.length ||
      row.id.length > 300 ||
      /^(?:ex_|catalog:)/i.test(row.id) ||
      sources.has(row.id) ||
      row.rightsStatus !== 'APPROVED' ||
      !['BOOK', 'HTML', 'NOTE'].includes(row.kind) ||
      !Array.isArray(row.allowedOrigins)
    )
      throw fail();
    for (const origin of row.allowedOrigins) {
      const u = URL.parse(origin);
      if (
        !u ||
        u.protocol !== 'https:' ||
        u.origin !== origin ||
        u.username ||
        u.password ||
        u.hostname === 'localhost' ||
        !u.hostname.includes('.') ||
        isIP(u.hostname.replace(/^\[|\]$/g, ''))
      )
        throw fail();
    }
    sources.set(row.id, { origins: new Set(row.allowedOrigins) });
  }
  return { origin, tls: { key, cert, ca }, token, revision, sources };
}
function call(
  config,
  path,
  {
    method = 'GET',
    body,
    authorization,
    signal,
    limit = 2097152,
    timeout = 45000,
    privateResponse = false,
  } = {},
) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  if (payload && Buffer.byteLength(payload) > 8388608)
    throw fail(422, 'CHAT_RECORDS_TOO_LARGE');
  return new Promise((resolve, reject) => {
    const req = request(
      new URL(path, config.origin),
      {
        ...config.tls,
        method,
        agent: false,
        signal: AbortSignal.any(
          [signal, AbortSignal.timeout(timeout)].filter(Boolean),
        ),
        headers: {
          accept: 'application/json',
          authorization: authorization ?? 'Bearer ' + config.token,
          ...(payload
            ? {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        let size = 0;
        const chunks = [];
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > limit) req.destroy(fail());
          else chunks.push(chunk);
        });
        res.on('error', () => reject(fail()));
        res.on('end', () => {
          try {
            if (
              !/^application\/(?:json|problem\+json)(?:;|$)/i.test(
                res.headers['content-type'] ?? '',
              ) ||
              (privateResponse && res.headers['cache-control'] !== 'no-store')
            )
              throw fail();
            resolve({
              status: res.statusCode,
              body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
            });
          } catch {
            reject(fail());
          }
        });
      },
    );
    req.on('error', () => reject(fail()));
    req.end(payload);
  });
}
function project(output, task, config) {
  if (
    !output ||
    output.task !== task ||
    !Array.isArray(output.references) ||
    !Array.isArray(output.evidence) ||
    !Array.isArray(output.citations) ||
    !Array.isArray(output.user_notices) ||
    !output.session ||
    typeof output.session !== 'object'
  )
    throw fail();
  if (
    output.references.length > 50 ||
    output.evidence.length > 500 ||
    output.citations.length > 50 ||
    output.user_notices.length > 50
  )
    throw fail();
  const evidence = new Map();
  for (const e of output.evidence) {
    if (!e || typeof e.chunk_id !== 'string' || evidence.has(e.chunk_id))
      throw fail();
    evidence.set(e.chunk_id, e);
  }
  const cited = [...new Set(output.citations)];
  if (
    cited.some((c) => typeof c !== 'string') ||
    output.references.length !== cited.length
  )
    throw fail();
  const references = output.references.map((r, i) => {
    if (r.number !== i + 1 || r.chunk_id !== cited[i]) throw fail();
    const e = evidence.get(r.chunk_id),
      source = e && config.sources.get(e.source_id);
    if (!source) throw fail(503, 'RAG_SOURCE_NOT_APPROVED');
    let safeUrl = null;
    if (typeof e.url === 'string') {
      const u = URL.parse(e.url);
      if (
        u?.protocol === 'https:' &&
        !u.username &&
        !u.password &&
        source.origins.has(u.origin)
      )
        safeUrl = u.href;
    }
    return {
      number: r.number,
      namespace: 'kb',
      chunk_id: text(e.chunk_id, 300),
      source_id: text(e.source_id, 300),
      title: text(e.title, 500),
      publisher: text(e.publisher, 500),
      url: safeUrl,
      pdf_page: e.pdf_page ?? null,
      section: e.section == null ? null : text(e.section, 500),
      excerpt: text(e.text, 250000).slice(0, 800),
    };
  });
  const s = output.session;
  if (
    s.penalty_total != null ||
    s.scoring_policy != null ||
    (s.penalty_ledger?.length ?? 0) > 0
  )
    throw fail();
  const list = (key, keys, max) => {
    const rows = s[key] ?? [];
    if (!Array.isArray(rows) || rows.length > max) throw fail();
    return rows.map((row) => {
      if (!row || typeof row !== 'object') throw fail();
      return pick(row, keys);
    });
  };
  const result = {
    reply: text(output.reply, 32000),
    task,
    status: output.status,
    generation_used: output.generation_used,
    generation_mode: text(output.generation_mode, 100),
    kb_version: text(output.kb_version, 300),
    model_version: text(output.model_version, 300),
    references,
    user_notices: output.user_notices
      .filter((v) => typeof v === 'string' && !unsafeText.test(v))
      .map((v) => text(v)),
    session: {
      observations: list(
        'observations',
        [
          'observation_id',
          'exercise_code',
          'unit',
          'observation_status',
          'simulated',
          'labels',
        ],
        50,
      ),
      units: list(
        'units',
        [
          'observation_id',
          'exercise_code',
          'scope',
          'usable',
          'simulated',
          'error_labels',
        ],
        50,
      ),
      errors: list(
        'errors',
        ['exercise_code', 'label_key', 'name_vi', 'observed_units'],
        83,
      ),
      penalty_total: null,
      scoring_policy: null,
      practice_suggestions: list(
        'practice_suggestions',
        [
          'exercise_code',
          'activity',
          'focus_label',
          'observed_units',
          'cue',
          'criterion_id',
          'citations',
        ],
        83,
      ),
    },
  };
  if (
    !valid('ChatAnswer', result) ||
    JSON.stringify(result).includes(config.token) ||
    unsafeText.test(JSON.stringify(result.session))
  )
    throw fail();
  return result;
}
export function createChatHandler({
  configuration = loadChatConfig,
  assertion = assertionForSession,
  poseConfiguration = loadPoseLiveConfig,
  deadlineMs = 90000,
  clock = () => Date.now(),
} = {}) {
  const limits = new Map();
  let active = 0;
  function claim(key) {
    const now = clock();
    for (const [k, v] of limits)
      if (v.until <= now && !v.active) limits.delete(k);
    let v = limits.get(key);
    if (!v) {
      if (limits.size >= 10000) throw fail(429, 'RATE_LIMITED');
      v = { count: 0, until: now + 60000, active: false };
      limits.set(key, v);
    }
    if (v.until <= now) {
      v.count = 0;
      v.until = now + 60000;
    }
    if (v.active || v.count >= 5) throw fail(429, 'RATE_LIMITED');
    v.count++;
    v.active = true;
    return () => {
      v.active = false;
    };
  }
  return async function handleChat(req, res, webOrigin) {
    let release,
      slot = false;
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), deadlineMs);
    const disconnected = () => controller.abort();
    res.once('close', disconnected);
    try {
      requireSameOrigin(req, webOrigin);
      if (req.url.length > 8192) throw fail(400, 'BAD_REQUEST');
      const url = new URL(req.url, webOrigin);
      if (req.method !== 'POST' || url.pathname !== '/api/v1/chat')
        throw fail(404, 'NOT_FOUND');
      if (url.search) throw fail(400, 'BAD_REQUEST');
      if (
        req.headers['content-type']?.split(';')[0].trim() !== 'application/json'
      )
        throw fail(400, 'BAD_REQUEST');
      const input = await readJson(req, 131072);
      if (!valid('ChatRequest', input) || !input.message.trim())
        throw fail(422, 'VALIDATION_ERROR');
      if (active >= 2) throw fail(429, 'RATE_LIMITED');
      active++;
      slot = true;
      const ids = input.poseResultIds ?? [],
        personal = input.task !== 'knowledge' || ids.length > 0;
      let principal;
      if (personal || sessionCookie(req.headers.cookie ?? ''))
        principal = await within(
          () => assertion(req.headers.cookie ?? ''),
          controller.signal,
        );
      const key = principal
        ? 'owner:' + principal.userId
        : 'ip:' + req.socket.remoteAddress;
      release = claim(key);
      const signal = controller.signal,
        config = await within(configuration, signal);
      signal.throwIfAborted();
      const health = await call(config, '/health', {
        signal,
        timeout: 5000,
        limit: 16384,
      });
      if (health.status !== 200 || health.body?.kb_ready !== true)
        throw fail(503, 'RAG_NOT_READY');
      if (health.body.runtime_revision !== config.revision)
        throw fail(503, 'RAG_RUNTIME_MISMATCH');
      const records = [];
      let resultExpiry = Infinity;
      if (ids.length) {
        const pose = await within(poseConfiguration, signal);
        if (!pose) throw fail(503, 'POSE_UNAVAILABLE');
        for (const id of ids) {
          const raw = await call(
            pose,
            '/internal/v1/pose/results/' + id + '/raw',
            {
              authorization: 'Bearer ' + principal.accessToken,
              signal,
              timeout: 5000,
              privateResponse: true,
              limit: 131072,
            },
          );
          if ([401, 403, 404, 410].includes(raw.status))
            throw fail(
              raw.status,
              raw.status === 410
                ? 'RESULT_EXPIRED'
                : raw.status === 404
                  ? 'NOT_FOUND'
                  : 'UNAUTHENTICATED',
            );
          if (raw.status === 422 && raw.body?.code === 'NO_RAW_OBSERVATION')
            throw fail(422, 'NO_RAW_OBSERVATION');
          if (
            raw.status !== 200 ||
            !valid('PoseRawResultEnvelope', raw.body) ||
            raw.body.result.id !== id
          )
            throw fail(503, 'POSE_UNAVAILABLE');
          const e = raw.body,
            r = e.rawModelResult,
            m = contracts.models.find(
              (m) =>
                m.catalogId === e.result.exerciseId &&
                m.exercise === r.exercise,
            );
          if (Date.parse(e.result.expiresAt) <= clock())
            throw fail(410, 'RESULT_EXPIRED');
          if (
            !m ||
            m.sha256 !== e.modelSha256 ||
            r.model_provenance.model_sha256 !== m.sha256 ||
            r.schema_version !== m.schemaVersion ||
            e.sourceId !==
              'sha256:' +
                (r.source.video_sha256 ?? r.source.live_session_sha256) ||
            (e.result.source === 'VIDEO') !== Boolean(r.source.video_sha256)
          )
            throw fail(503, 'POSE_UNAVAILABLE');
          resultExpiry = Math.min(resultExpiry, Date.parse(e.result.expiresAt));
          records.push({
            observation_id: id,
            source_id: e.sourceId,
            model_result: r,
            simulated: false,
          });
        }
      }
      const payload = {
        message: input.message,
        task: input.task,
        records,
        rules: [],
        scoring_policy: null,
        conversation: input.conversation ?? [],
        generate: true,
        video_context: {
          state: records.length ? 'analyzed' : (input.videoState ?? 'none'),
          source_id: records[0]?.source_id ?? null,
        },
      };
      const upstream = await call(config, '/v1/chatbot', {
        method: 'POST',
        body: payload,
        signal,
        timeout: deadlineMs,
      });
      signal.throwIfAborted();
      if (upstream.status !== 200)
        throw fail(
          503,
          upstream.status === 503 ? 'RAG_NOT_READY' : 'RAG_UNAVAILABLE',
        );
      const policy = await within(configuration, signal);
      if (
        policy.origin !== config.origin ||
        policy.revision !== config.revision
      )
        throw fail(503, 'RAG_RUNTIME_MISMATCH');
      const result = project(upstream.body, input.task, policy);
      if (principal) {
        const current = await within(
          () => assertion(req.headers.cookie ?? ''),
          signal,
        );
        if (current.userId !== principal.userId)
          throw fail(401, 'UNAUTHENTICATED');
      }
      if (resultExpiry <= clock()) throw fail(410, 'RESULT_EXPIRED');
      signal.throwIfAborted();
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
      });
      res.end(JSON.stringify(result));
    } catch (error) {
      if (!res.destroyed && !res.headersSent) {
        const safe = controller.signal.aborted
          ? fail(504, 'RAG_TIMEOUT')
          : error instanceof AuthError
            ? error
            : fail();
        if (safe.status === 429) res.setHeader('Retry-After', '60');
        problem(res, safe.status, safe.code);
      }
    } finally {
      clearTimeout(timer);
      res.off('close', disconnected);
      release?.();
      if (slot) active--;
    }
  };
}
const configuredDeadline = Number(process.env.BFF_RAG_DEADLINE_MS ?? 90000);
const deadlineMs =
  Number.isSafeInteger(configuredDeadline) &&
  configuredDeadline >= 5000 &&
  configuredDeadline <= 240000
    ? configuredDeadline
    : 90000;
export const handleChat = createChatHandler({ deadlineMs });
