import { readFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { pipeline } from 'node:stream/promises';
import { problem } from './auth.mjs';

const catalogObjectPath = /^\/smartgym-catalog-private\/catalog\/media\/upload_[a-f0-9]{32}$/;
const poseObjectPath = /^\/smartgym-pose-private\/pose\/uploads\/[a-f0-9-]{36}$/;
const publicPath = /^\/api\/v1\/media\/[a-z][a-z0-9_]{0,79}\/[1-9][0-9]{0,9}$/;
const requestHeaders = ['content-type', 'content-length', 'range', 'if-none-match', 'x-amz-checksum-sha256'];
const responseHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'cache-control', 'content-disposition'];
let ca;

export async function handleMediaGateway(req, res, url, webOrigin) {
  const poseObject = poseObjectPath.test(url.pathname);
  const object = poseObject || catalogObjectPath.test(url.pathname);
  const storage = poseObject
    ? process.env.WEB_POSE_OBJECT_ORIGIN : process.env.WEB_CATALOG_OBJECT_ORIGIN;
  if (!storage || !webOrigin) return false;
  if (!object && !publicPath.test(url.pathname)) return false;
  if (req.headers.host !== new URL(webOrigin).host || req.url.split('?')[0] !== url.pathname ||
      (object && !url.searchParams.has('X-Amz-Signature')) || (!object && url.search) ||
      (req.method !== 'GET' && !(object && req.method === 'PUT'))) {
    problem(res, 400, 'BAD_REQUEST');
    return true;
  }
  if (req.method === 'PUT' && (req.headers.origin !== webOrigin ||
      !/^[1-9][0-9]{0,8}$/.test(req.headers['content-length'] ?? '') ||
      Number(req.headers['content-length']) > 200 * 1024 * 1024)) {
    problem(res, 403, 'ORIGIN_REJECTED');
    return true;
  }
  const headers = Object.fromEntries(requestHeaders.filter(name => req.headers[name] !== undefined).map(name => [name, req.headers[name]]));
  if (object) headers.host = req.headers.host;
  const target = new URL(req.url, object ? storage : process.env.CATALOG_URL);
  const tls = target.protocol === 'https:';
  const options = { method: req.method, headers, signal: AbortSignal.timeout(120000),
    ...(tls && object ? { ca: await (ca ??= readFile(process.env.WEB_OBJECT_STORAGE_CA_FILE)) } : {}) };
  try {
    await new Promise((resolve, reject) => {
      const upstream = (tls ? httpsRequest : httpRequest)(target, options, response => {
        const status = response.statusCode;
        if (status >= 300) {
          response.resume();
          problem(res, status >= 400 && status < 500 ? status : 503, 'MEDIA_UNAVAILABLE');
          resolve();
          return;
        }
        const filtered = Object.fromEntries(responseHeaders.filter(name => response.headers[name] !== undefined).map(name => [name, response.headers[name]]));
        res.writeHead(status, { ...filtered, 'x-content-type-options': 'nosniff', ...(object ? { 'cache-control': 'no-store' } : {}) });
        pipeline(response, res).then(resolve, reject);
      });
      upstream.once('error', reject);
      if (req.method === 'PUT') pipeline(req, upstream).catch(reject);
      else upstream.end();
    });
  } catch {
    if (!res.headersSent) problem(res, 503, 'MEDIA_UNAVAILABLE');
    else res.destroy();
  }
  return true;
}
