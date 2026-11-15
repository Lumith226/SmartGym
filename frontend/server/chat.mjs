// @ts-check
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
import { claimSharedChat, createCircuitBreaker } from './resilience.mjs';

/** @typedef {'knowledge' | 'score' | 'summary' | 'practice'} ChatTask */
/** @typedef {{message: string, task: ChatTask, provider?: 'ollama' | 'qwen' | 'gemini', poseResultIds?: string[], videoState?: 'none' | 'selected' | 'analyzing', conversation?: {role: 'user' | 'assistant', content: string}[]}} ChatRequest */
/** @typedef {{origin: string, tls: import('node:https').RequestOptions, token?: string}} UpstreamConfig */
/** @typedef {UpstreamConfig & {token: string, revision: string, sources: Map<string, {origins: Set<string>}>}} ChatConfig */
/** @typedef {{method?: string, body?: object, authorization?: string, signal?: AbortSignal, limit?: number, timeout?: number | null, privateResponse?: boolean}} UpstreamOptions */
/** @typedef {{status: number, body: unknown}} UpstreamResponse */
/** @typedef {{userId: string, accessToken: string}} Principal */
/** @typedef {{result: {id: string, exerciseId: string, expiresAt: string, source: 'VIDEO' | 'LIVE'}, sourceId: string, modelSha256: string, rawModelResult: {exercise: string, schema_version: string, model_provenance: {model_sha256: string}, source: {video_sha256?: string, live_session_sha256?: string}}}} PoseRawResultEnvelope */

const ajv = new Ajv2020({ strict: false });
addFormats(ajv);
ajv.addSchema({ $id: 'web-chat', $defs: contracts.schemas });
/** @param {keyof typeof contracts.schemas} name @param {unknown} value */
const valid = (name, value) =>
  ajv.getSchema('web-chat#/$defs/' + name)?.(value);
/** @param {unknown} value @returns {value is ChatRequest} */
const isChatRequest = (value) => valid('ChatRequest', value) === true;
/** @param {unknown} value @returns {value is PoseRawResultEnvelope} */
const isPoseResult = (value) => valid('PoseRawResultEnvelope', value) === true;
/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = (value) => value !== null && typeof value === 'object';
/** @param {unknown} value @returns {value is unknown[]} */
const isList = (value) => Array.isArray(value);
/** @param {unknown} value @param {string} key */
const field = (value, key) => (isRecord(value) ? value[key] : undefined);
const fail = (status = 503, code = 'RAG_UNAVAILABLE') =>
  new AuthError(status, code);
const unsafeText =
  /(?<![A-Za-z0-9+.-])[A-Za-z]:[\\/]|(?:\/run\/secrets|\/home\/|\/tmp\/)|Bearer\s+\S+|(?:api[_-]?key|password|token)\s*[:=]\s*\S+/i;
/** @param {unknown} v */
const text = (v, max = 3000) => {
  if (typeof v !== 'string' || v.length > max || unsafeText.test(v))
    throw fail();
  return v;
};
/** @param {Record<string, unknown>} row @param {string[]} keys */
const pick = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k]]));
/** @template T @param {() => T | PromiseLike<T>} work @param {AbortSignal} signal @returns {Promise<T>} */
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
/** @param {string | undefined} filename */
function readConfigFile(filename) {
  if (!filename) throw fail();
  return readFile(filename, 'utf8');
}

/** @returns {Promise<ChatConfig>} */
export async function loadChatConfig() {
  if (process.env.BFF_RAG_ENABLED !== 'true') throw fail(503, 'RAG_DISABLED');
  const origin = process.env.BFF_RAG_ORIGIN,
    url = origin && URL.parse(origin),
    revision = process.env.BFF_RAG_RUNTIME_REVISION;
  if (
    !origin ||
    !url ||
    url.origin !== origin ||
    url.protocol !== 'https:' ||
    !revision ||
    !/^[a-f0-9]{16}$/.test(revision)
  )
    throw fail();
  const [key, cert, ca, secret, registryText] = await Promise.all([
    ...['KEY', 'CERT', 'CA'].map((k) =>
      readConfigFile(process.env['BFF_RAG_TLS_' + k + '_FILE']),
    ),
    readConfigFile(process.env.BFF_RAG_TOKEN_FILE),
    readConfigFile(process.env.BFF_RAG_SOURCES_FILE),
  ]);
  const token = secret.trim();
  if (token.length < 32 || token.length > 4096 || /\s/.test(token))
    throw fail();
  /** @type {unknown} */
  const registry = JSON.parse(registryText);
  if (!isList(registry) || registry.length > 10000) throw fail();
  /** @type {ChatConfig['sources']} */
  const sources = new Map();
  for (const row of registry) {
    if (
      !isRecord(row) ||
      typeof row.id !== 'string' ||
      !row.id.length ||
      row.id.length > 300 ||
      /^(?:ex_|catalog:)/i.test(row.id) ||
      sources.has(row.id) ||
      row.rightsStatus !== 'APPROVED' ||
      typeof row.kind !== 'string' ||
      !['BOOK', 'HTML', 'NOTE'].includes(row.kind) ||
      !isList(row.allowedOrigins)
    )
      throw fail();
    const origins = new Set();
    for (const origin of row.allowedOrigins) {
      if (typeof origin !== 'string') throw fail();
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
      origins.add(origin);
    }
    sources.set(row.id, { origins });
  }
  return { origin, tls: { key, cert, ca }, token, revision, sources };
}
/** @param {UpstreamConfig} config @param {string} path @param {UpstreamOptions} [options] @returns {Promise<UpstreamResponse>} */
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
        signal: timeout === null ? signal : AbortSignal.any(
          signal
            ? [signal, AbortSignal.timeout(timeout)]
            : [AbortSignal.timeout(timeout)],
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
        /** @type {Buffer[]} */
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
              status: res.statusCode ?? 0,
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
/** @param {string} message */
function asksForSourceInventory(message) {
  const normalized = message
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const question = /^(?:(?:ban|smartgym|chatbot) )?(?:dang )?(?:co(?: (?:dung|su dung))?|dung|su dung) (?:nhung |cac )?(?:nguon(?: du lieu| tai lieu| tham khao)?|tai lieu) (?:nao|gi)(?: (?:vay|a|the))?$/;
  const list = /^(?:(?:hay|giup toi) )?liet ke (?:cac |nhung )?(?:nguon du lieu|(?:nguon(?: tai lieu| tham khao)?|tai lieu) (?:trong kho tri thuc|ban (?:dang )?(?:dung|su dung)|cua smartgym))$/;
  return question.test(normalized) || list.test(normalized);
}

/** @param {unknown} body @param {unknown} kbVersion @param {ChatConfig} config */
function sourceInventoryAnswer(body, kbVersion, config) {
  if (!isList(body)) throw fail();
  const sources = new Map();
  for (const row of body) {
    if (!isRecord(row) || typeof row.id !== 'string' || !config.sources.has(row.id) ||
      typeof row.chunks !== 'number' || !Number.isInteger(row.chunks) || row.chunks <= 0) continue;
    const title = text(row.title, 500).replace(/\s+/g, ' ').trim();
    const publisher = text(row.publisher, 500).replace(/\s+/g, ' ').trim();
    if (title) sources.set(row.id, publisher ? `${title} (${publisher})` : title);
  }
  const titles = [...sources.values()].slice(0, 25);
  const reply = titles.length
    ? [`Kho tri thức SmartGym hiện có ${sources.size} nguồn đã được lập chỉ mục và duyệt hiển thị.`,
      ...titles.map((title, index) => `${index + 1}. ${title}`),
      ...(sources.size > titles.length ? [`Đang hiển thị ${titles.length} nguồn đầu tiên.`] : []),
    ].join('\n\n')
    : 'Kho tri thức SmartGym hiện chưa có nguồn nào vừa được lập chỉ mục vừa được duyệt hiển thị.';
  return {
    reply, task: 'knowledge', status: 'grounded_guidance',
    generation_used: false, generation_mode: 'source_inventory',
    kb_version: kbVersion, model_version: 'none',
    references: [], evidence: [], citations: [], user_notices: [], session: {},
  };
}

/** @param {unknown} output @param {ChatTask} task @param {ChatConfig} config @param {string} [provider] */
function project(output, task, config, provider = 'ollama') {
  if (
    !isRecord(output) ||
    output.task !== task ||
    !isList(output.references) ||
    !isList(output.evidence) ||
    !isList(output.citations) ||
    !isList(output.user_notices) ||
    !isRecord(output.session)
  )
    throw fail();
  if (
    output.references.length > 50 ||
    output.evidence.length > 500 ||
    output.citations.length > 50 ||
    output.user_notices.length > 50
  )
    throw fail();
  /** @type {Map<string, Record<string, unknown>>} */
  const evidence = new Map();
  for (const e of output.evidence) {
    if (
      !isRecord(e) ||
      typeof e.chunk_id !== 'string' ||
      evidence.has(e.chunk_id)
    )
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
    if (
      !isRecord(r) ||
      r.number !== i + 1 ||
      typeof r.chunk_id !== 'string' ||
      r.chunk_id !== cited[i]
    )
      throw fail();
    const e = evidence.get(r.chunk_id),
      source =
        e && typeof e.source_id === 'string' && config.sources.get(e.source_id);
    if (!e || !source) throw fail(503, 'RAG_SOURCE_NOT_APPROVED');
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
    Number(
      typeof s.penalty_ledger === 'string'
        ? s.penalty_ledger.length
        : (field(s.penalty_ledger, 'length') ?? 0),
    ) > 0
  )
    throw fail();
  /** @param {string} key @param {string[]} keys @param {number} max */
  const list = (key, keys, max) => {
    const rows = s[key] ?? [];
    if (!isList(rows) || rows.length > max) throw fail();
    return rows.map((row) => {
      if (!isRecord(row)) throw fail();
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
    provider,
    model:
      provider === 'gemini'
        ? 'Gemini 2.5 Flash'
        : provider === 'qwen'
          ? 'Qwen 2.5'
          : text(output.model_version, 300) && text(output.model_version, 300) !== 'none'
            ? text(output.model_version, 300)
            : 'Ollama (Qwen 2.5)',
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
/** @param {{configuration?: () => Promise<ChatConfig>, assertion?: (cookie: string) => Promise<Principal>, poseConfiguration?: () => Promise<UpstreamConfig | null>, deadlineMs?: number, clock?: () => number}} [options] */
export function createChatHandler({
  configuration = loadChatConfig,
  assertion = assertionForSession,
  poseConfiguration = loadPoseLiveConfig,
  deadlineMs,
  clock = () => Date.now(),
} = {}) {
  /** @type {Map<string, {until: number, count: number, active: boolean}>} */
  const limits = new Map();
  const healthBreaker = createCircuitBreaker({ clock });
  const generationBreaker = createCircuitBreaker({ clock });
  let active = 0;
  /** @param {string} key */
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
  /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {string} webOrigin */
  return async function handleChat(req, res, webOrigin) {
    let release,
      slot = false;
    const controller = new AbortController(),
      timer = deadlineMs === undefined ? undefined : setTimeout(() => controller.abort(), deadlineMs);
    const disconnected = () => controller.abort();
    res.once('close', disconnected);
    try {
      requireSameOrigin(req, webOrigin);
      if (!req.url || req.url.length > 8192) throw fail(400, 'BAD_REQUEST');
      const url = new URL(req.url, webOrigin);
      if (url.pathname === '/api/v1/chat/ollama-runtime' &&
        (req.method === 'GET' || req.method === 'POST')) {
        if (url.search) throw fail(400, 'BAD_REQUEST');
        const config = await within(configuration, controller.signal);
        const response = await call(config, '/internal/v1/ollama/runtime', {
          method: req.method,
          signal: controller.signal,
          timeout: req.method === 'POST' ? 70000 : 5500,
          limit: 1024,
        });
        const state = field(response.body, 'state');
        if (response.status !== 200 || typeof state !== 'string' ||
          !['gpu', 'cpu', 'mixed', 'idle', 'checking', 'unavailable'].includes(state)) throw fail();
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ state }));
        return;
      }
      if (url.pathname === '/api/v1/chat' && req.method === 'GET') {
        if (url.search) throw fail(400, 'BAD_REQUEST');
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(
          JSON.stringify({
            qwenEnabled: process.env.SMARTGYM_QWEN_ENABLED === 'true',
            geminiEnabled: process.env.SMARTGYM_GEMINI_ENABLED === 'true',
          }),
        );
        return;
      }
      if (req.method !== 'POST' || url.pathname !== '/api/v1/chat')
        throw fail(404, 'NOT_FOUND');
      if (url.search) throw fail(400, 'BAD_REQUEST');
      if (
        req.headers['content-type']?.split(';')[0].trim() !== 'application/json'
      )
        throw fail(400, 'BAD_REQUEST');
      const input = await readJson(req, 131072);
      if (!isChatRequest(input) || !input.message.trim())
        throw fail(422, 'VALIDATION_ERROR');
      const cloud = input.provider === 'ollama' ? undefined : input.provider;
      const cloudCode = cloud?.toUpperCase();
      if (cloud) {
        if (process.env['SMARTGYM_' + cloudCode + '_ENABLED'] !== 'true')
          throw fail(503, cloudCode + '_DISABLED');
        if (input.task !== 'knowledge' || input.poseResultIds?.length ||
          input.conversation?.length || (input.videoState && input.videoState !== 'none'))
          throw fail(422, cloudCode + '_KNOWLEDGE_ONLY');
      }
      if (active >= 2) throw fail(429, 'RATE_LIMITED');
      active++;
      slot = true;
      const ids = input.poseResultIds ?? [],
        personal = input.task !== 'knowledge' || ids.length > 0;
      let principal;
      if (personal || sessionCookie(req.headers.cookie ?? '')) {
        try {
          principal = await within(
            () => assertion(req.headers.cookie ?? ''),
            controller.signal,
          );
        } catch (err) {
          if (personal) throw err;
          principal = undefined;
        }
      }
      const key = principal
        ? 'owner:' + principal.userId
        : 'ip:' + req.socket.remoteAddress;
      release = process.env.SMARTGYM_REDIS_URL
        ? await claimSharedChat(key)
        : claim(key);
      const signal = controller.signal,
        config = await within(configuration, signal);
      signal.throwIfAborted();
      const health = await healthBreaker(
        () =>
          call(config, '/health', {
            signal,
            timeout: 5000,
            limit: 16384,
          }),
        (response) =>
          response.status !== 200 || field(response.body, 'kb_ready') !== true,
        () => res.destroyed,
      );
      if (health.status !== 200 || field(health.body, 'kb_ready') !== true)
        throw fail(503, 'RAG_NOT_READY');
      if (field(health.body, 'runtime_revision') !== config.revision)
        throw fail(503, 'RAG_RUNTIME_MISMATCH');
      const records = [];
      let resultExpiry = Infinity;
      if (ids.length) {
        if (!principal) throw fail(401, 'UNAUTHENTICATED');
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
          if (
            raw.status === 422 &&
            field(raw.body, 'code') === 'NO_RAW_OBSERVATION'
          )
            throw fail(422, 'NO_RAW_OBSERVATION');
          if (
            raw.status !== 200 ||
            !isPoseResult(raw.body) ||
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
      const upstreamPath = cloud ? '/internal/v1/chatbot/' + cloud : '/v1/chatbot';
      const sourceInventory =
        input.task === 'knowledge' &&
        !ids.length &&
        (!input.videoState || input.videoState === 'none') &&
        asksForSourceInventory(input.message);
      const upstream = sourceInventory
        ? await call(config, '/v1/kb/sources', { signal, timeout: 5000 })
        : await generationBreaker(
            () =>
              call(config, upstreamPath, {
                method: 'POST',
                body: payload,
                signal,
                timeout: deadlineMs ?? null,
              }),
            (response) => response.status >= 500,
            () => res.destroyed,
          );
      signal.throwIfAborted();
      if (upstream.status !== 200)
        throw fail(
          503,
          cloud && !sourceInventory
            ? cloudCode + '_UNAVAILABLE'
            : upstream.status === 503
              ? 'RAG_NOT_READY'
              : 'RAG_UNAVAILABLE',
        );
      const policy = await within(configuration, signal);
      if (
        policy.origin !== config.origin ||
        policy.revision !== config.revision
      )
        throw fail(503, 'RAG_RUNTIME_MISMATCH');
      const answer = sourceInventory
        ? sourceInventoryAnswer(upstream.body, field(health.body, 'kb_version'), policy)
        : upstream.body;
      const result = project(answer, input.task, policy, cloud || 'ollama');
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
        problem(res, safe.status, safe.code, undefined);
      }
    } finally {
      clearTimeout(timer);
      res.off('close', disconnected);
      release?.();
      if (slot) active--;
    }
  };
}
export const handleChat = createChatHandler();
