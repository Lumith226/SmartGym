import { readFile } from 'node:fs/promises';
import { request } from 'node:https';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import contract from '../data/admin-contracts.json' with { type: 'json' };
import { AuthError, adminAssertionForSession } from './identity-client.mjs';
import { problem, readJson, requireSameOrigin } from './auth.mjs';

const ajv = new Ajv2020({ strict: true });
addFormats(ajv);
ajv.addSchema({ $id: 'admin-contract', $defs: contract.schemas });
const validators = new Map(Object.keys(contract.schemas).map(name => [name, ajv.getSchema('admin-contract#/$defs/' + name)]));
const validate = (name, value) => validators.get(name)(value);
const operations = contract.operations.map(operation => ({
  ...operation,
  pattern: new RegExp('^' + operation.path.replace(/\{(\w+)\}/g, '(?<$1>[A-Za-z0-9._-]+)') + '$'),
  pathValid: ajv.compile({ type: 'object', properties: operation.pathParameters, required: Object.keys(operation.pathParameters) }),
  queryValid: ajv.compile({ type: 'object', properties: operation.queries, additionalProperties: false }),
  headerValid: ajv.compile({ type: 'object', properties: operation.headers, required: Object.keys(operation.headers) }),
}));
const publicCodes = new Set(['ADMIN_REQUIRED', 'UNAUTHENTICATED', 'NOT_FOUND', 'BAD_REQUEST', 'INVALID_CURSOR',
  'INVALID_ETAG', 'INVALID_IDEMPOTENCY_KEY', 'VALIDATION_ERROR', 'PRECONDITION_REQUIRED', 'VERSION_MISMATCH',
  'IDEMPOTENCY_CONFLICT', 'EXERCISE_ID_EXISTS', 'EXERCISE_ARCHIVED', 'SLUG_UNAVAILABLE', 'NO_PUBLISHABLE_DRAFT',
  'EXERCISE_NOT_PUBLISHED', 'EXERCISE_NOT_ARCHIVED', 'EXERCISE_CLASSIFICATION_REQUIRED', 'OVERLAPPING_MUSCLES', 'DUPLICATE_REFERENCE', 'MEDIA_NOT_APPROVED', 'INVALID_IMAGE_ROLES',
  'VARIANT_NOT_PUBLISHED', 'INVALID_TAXONOMY_REFERENCE', 'RATE_LIMITED', 'CONTENT_TYPE_MISMATCH',
  'INVALID_EXERCISE_REFERENCE', 'CONTENT_ID_EXISTS', 'CONTENT_ARCHIVED', 'CONTENT_IN_PUBLIC_USE', 'CONTENT_NOT_ARCHIVED',
  'REGION_KEY_UNAVAILABLE', 'MEDIA_SOURCE_INVALID', 'MEDIA_UPLOAD_NOT_READY', 'VARIANT_PARENT_IMMUTABLE',
  'IMPORT_PACKAGE_NOT_REGISTERED', 'IMPORT_MANIFEST_MISMATCH', 'IMPORT_NOT_READY', 'IMPORT_BASE_CHANGED',
  'CATALOG_IMPORT_NOT_CONFIGURED', 'CATALOG_IMPORT_PACKAGE_UNAVAILABLE', 'EXPORT_EXPIRED', 'EXPORT_WITHDRAWN', 'EXPORT_NOT_RETAINED',
  'MEDIA_UPLOAD_LIMIT', 'MEDIA_TOO_LARGE', 'MEDIA_TYPE_UNSUPPORTED', 'MEDIA_UPLOAD_REJECTED', 'UPLOAD_EXPIRED', 'MEDIA_RIGHTS_REVOKED']);
const etag = /^"v[1-9][0-9]{0,9}"$/;
const location = /^\/api\/v1\/admin\/exercises\/[a-z][a-z0-9_]{0,79}$/;
const unavailable = () => new AuthError(503, 'CATALOG_ADMIN_UNAVAILABLE');
const mediaUnavailable = () => new AuthError(503, 'CATALOG_MEDIA_UNAVAILABLE');
let configPromise;
function loadConfig() {
  return configPromise ??= (async () => {
    const origin = process.env.BFF_CATALOG_ADMIN_ORIGIN;
    if (!origin || new URL(origin).origin !== origin || new URL(origin).protocol !== 'https:') throw unavailable();
    const [key, cert, ca] = await Promise.all(['KEY', 'CERT', 'CA'].map(field => {
      const path = process.env['BFF_CATALOG_ADMIN_' + field + '_FILE'];
      if (!path) throw unavailable();
      return readFile(path, 'utf8');
    }));
    return { origin, tls: { key, cert, ca } };
  })();
}

function mediaOrigin() {
  const value = process.env.BFF_CATALOG_MEDIA_ORIGIN;
  const url = value && URL.parse(value);
  if (!url || url.origin !== value || !(url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === '127.0.0.1'))) throw mediaUnavailable();
  return value;
}
function validateMediaLink(data, input, origin) {
  const url = URL.parse(input ? data.putUrl : data.url);
  if (!url || url.origin !== origin || url.username || url.password || url.hash) throw mediaUnavailable();
  if (input) {
    const headers = data.requiredHeaders;
    if (Object.keys(headers).sort().join(',') !== 'content-type,if-none-match,x-amz-checksum-sha256' ||
        headers['content-type'] !== input.mime || headers['if-none-match'] !== '*' ||
        headers['x-amz-checksum-sha256'] !== Buffer.from(input.sha256, 'hex').toString('base64')) throw mediaUnavailable();
  }
}

function queryFor(operation, params) {
  const values = Object.create(null);
  for (const [name, value] of params) {
    if (!Object.hasOwn(operation.queries, name) || Object.hasOwn(values, name)) throw new AuthError(400, 'BAD_REQUEST');
    values[name] = operation.queries[name].type === 'integer' && /^[1-9][0-9]*$/.test(value) ? Number(value) : value;
  }
  if (!operation.queryValid(values)) throw new AuthError(400, 'BAD_REQUEST');
  return params.toString();
}
function matchesPath(operation, pathname) {
  const match = operation.pattern.exec(pathname);
  if (!match) return false;
  const values = Object.fromEntries(Object.entries(match.groups ?? {}).map(([name, value]) => [name,
    operation.pathParameters[name]?.type === 'integer' && /^[1-9][0-9]*$/.test(value) ? Number(value) : value,
  ]));
  return operation.pathValid(values);
}
function forward(config, path, method, token, headers, body, byteLimit) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request(new URL(path, config.origin), {
      ...config.tls, method, agent: false, signal: AbortSignal.timeout(7000),
      headers: {
        accept: 'application/json', authorization: 'Bearer ' + token, ...headers,
        ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }),
      },
    }, res => {
      const chunks = [];
      let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > byteLimit) req.destroy(unavailable());
        else chunks.push(chunk);
      });
      res.on('error', () => reject(unavailable()));
      res.on('end', () => {
        try {
          if (res.headers['cache-control'] !== 'no-store' ||
              !/^application\/(?:json|problem\+json)(?:;|$)/i.test(res.headers['content-type'] ?? '')) throw unavailable();
          resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')), headers: res.headers });
        } catch { reject(unavailable()); }
      });
    });
    req.on('error', () => reject(unavailable()));
    req.end(payload);
  });
}

export async function handleCatalogAdmin(req, res, webOrigin) {
  try {
    requireSameOrigin(req, webOrigin);
    const url = new URL(req.url, webOrigin);
    const operation = operations.find(candidate => candidate.method === req.method && matchesPath(candidate, url.pathname));
    if (!operation) throw new AuthError(404, 'NOT_FOUND');
    const token = await adminAssertionForSession(req.headers.cookie ?? '');
    const media = operation.output === 'CmsMediaGrant' || operation.output === 'CmsMediaPreview' ? mediaOrigin() : undefined;
    const query = queryFor(operation, url.searchParams);
    const headers = Object.fromEntries(Object.keys(operation.headers).filter(name => req.headers[name] !== undefined).map(name => [name, req.headers[name]]));
    if (operation.headers['if-match'] && headers['if-match'] === undefined) throw new AuthError(428, 'PRECONDITION_REQUIRED');
    if (!operation.headerValid(headers)) throw new AuthError(400, 'BAD_REQUEST');
    let body;
    if (req.method !== 'GET') {
      const hasBody = Number(req.headers['content-length']) > 0 || req.headers['transfer-encoding'];
      if (operation.input || hasBody) {
        if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new AuthError(400, 'BAD_REQUEST');
        body = await readJson(req, 512 * 1024);
        if (operation.input ? !validate(operation.input, body) : !body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).length) {
          throw new AuthError(422, 'VALIDATION_ERROR');
        }
      }
    }
    // Exercise and revision pages can contain complete drafts. Scale by their bounded page size.
    const hasDrafts = operation.output === 'ExerciseAdminDetailPage' || operation.output === 'CmsRevisionPage';
    const pageSize = hasDrafts ? Number(url.searchParams.get('limit') ?? 20) : operation.output === 'CmsExport' ? 16 : 1;
    const upstream = await forward(await loadConfig(), url.pathname + (query ? '?' + query : ''), req.method, token, headers, body, pageSize * 1024 * 1024);
    if (upstream.status !== operation.status) {
      if (!operation.errors.includes(upstream.status) || !validate('Problem', upstream.body)) throw unavailable();
      if (upstream.status === 429 && /^\d{1,5}$/.test(upstream.headers['retry-after'] ?? '')) res.setHeader('Retry-After', upstream.headers['retry-after']);
      throw new AuthError(upstream.status, publicCodes.has(upstream.body.code) ? upstream.body.code : 'CATALOG_ADMIN_UNAVAILABLE');
    }
    if (!validate(operation.output, upstream.body)) throw unavailable();
    if (media) validateMediaLink(upstream.body, operation.output === 'CmsMediaGrant' ? body : undefined, media);
    const responseHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
      'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' };
    if (operation.etag) {
      if (!etag.test(upstream.headers.etag ?? '')) throw unavailable();
      responseHeaders.ETag = upstream.headers.etag;
    }
    if (operation.location) {
      if (!location.test(upstream.headers.location ?? '') || upstream.headers.location !== operation.path + '/' + upstream.body.id) throw unavailable();
      responseHeaders.Location = upstream.headers.location;
    }
    res.writeHead(upstream.status, responseHeaders);
    res.end(JSON.stringify(upstream.body));
  } catch (error) {
    const safe = error instanceof AuthError ? error : unavailable();
    problem(res, safe.status, safe.code);
  }
}
