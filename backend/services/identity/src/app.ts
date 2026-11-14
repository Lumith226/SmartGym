import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import 'reflect-metadata';
import { Module, Catch, HttpException, ArgumentsHost, ExceptionFilter, CanActivate, ExecutionContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { TLSSocket } from 'node:tls';
import { randomUUID } from 'node:crypto';
import { Config, validateConfig } from './config.js';
import { Database } from './database.js';
import { Identity, denied } from './modules/accounts/identity.js';
import { requestContext, correlationId } from './request-context.js';
import { createAccountsModule } from './modules/accounts/accounts.module.js';
import { createIdentityHealthModule } from './modules/identity-health.module.js';

const selfProbeFingerprint = process.env.SMARTGYM_SELF_PROBE === 'true'
  ? new X509Certificate(readFileSync('/run/secrets/client.crt')).fingerprint256 : undefined;

interface Request { method: string; path: string; headers: Record<string, string | string[] | undefined>; socket: TLSSocket }
interface Response { setHeader(name: string, value: string): void; getHeader?(name: string): number | string | string[] | undefined }

@Catch()
class ProblemFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    let status = error instanceof HttpException ? error.getStatus() : 503;
    // Express JSON parser errors are safe to classify; never return their raw body/message.
    if (!(error instanceof HttpException) && error && typeof error === 'object' && 'type' in error &&
      ['entity.parse.failed','entity.too.large'].includes(String(error.type))) status = 400;
    const data = error instanceof HttpException ? error.getResponse() : null;
    const code = data && typeof data === 'object' && 'code' in data ? String(data.code) :
      status === 503 ? 'SERVICE_UNAVAILABLE' : status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST';
    const response = host.switchToHttp().getResponse();
    response.setHeader('Cache-Control', 'no-store');
    if (status === 429) response.setHeader('Retry-After', '900');
    if (status === 503) response.setHeader('Retry-After', '1');
    response.status(status).type('application/problem+json').json({ type: 'about:blank', title: status === 503 ? 'Identity tạm thời không khả dụng' : 'Không thể thực hiện yêu cầu',
      status, code, requestId: correlationId() });
  }
}
class ServiceGuard implements CanActivate {
  constructor(private readonly config: Config) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.socket.encrypted || !request.socket.authorized) denied('UNAUTHENTICATED_SERVICE', 401);
    if (/^\/health\/(live|ready)$/.test(request.path)) { if (process.env.SMARTGYM_SELF_PROBE === 'true' && request.socket.authorized && request.socket.remoteAddress === '127.0.0.1' && request.socket.getPeerCertificate().fingerprint256 === selfProbeFingerprint) return true; }
    const fingerprint = request.socket.getPeerCertificate().fingerprint256;
    const caller = Object.entries(this.config.callers).find(([, fingerprints]) => fingerprints.includes(fingerprint))?.[0];
    if (!caller) denied('SERVICE_FORBIDDEN', 403);
    const path = request.path, operation = request.method + ' ' + path;
    const bffOperations = [
      'POST /api/v1/auth/register', 'POST /api/v1/auth/verification-requests', 'POST /api/v1/auth/password-reset-requests',
      'POST /api/v1/auth/verify-email', 'POST /api/v1/auth/password-reset', 'POST /api/v1/auth/login', 'POST /api/v1/auth/logout',
      'GET /api/v1/me', 'PATCH /api/v1/me', 'POST /internal/v1/identity/sessions/introspect', 'POST /internal/v1/identity/google-login',
    ];
    const permitted = ['GET /health/live','GET /health/ready','GET /internal/v1/identity/jwks'].includes(operation) ||
      (caller === 'bff' && bffOperations.includes(operation)) ||
      (caller === 'notification' && request.method === 'GET' && (
        /^\/internal\/v1\/identity\/email-deliveries\/[^/]+$/.test(path) || /^\/internal\/v1\/identity\/users\/[^/]+\/notification-contact$/.test(path)));
    if (!permitted) denied('SERVICE_FORBIDDEN', 403);
    if (path.startsWith('/api/') && request.method !== 'GET' &&
      (request.headers.origin !== this.config.webOrigin || request.headers['x-smartgym-csrf'] !== '1')) denied('CSRF_REJECTED', 403);
    return true;
  }
}

export async function createApp(database: Database, supplied: Config, now?: () => Date) {
  const config = validateConfig(supplied), identity = new Identity(database, { keys: config.keys, webOrigin: config.webOrigin, now });
  await identity.initialize();

  @Module({
    imports: [
      createIdentityHealthModule(identity),
      createAccountsModule(identity),
    ],
  })
  class IdentityModule {}

  const httpsOptions = { ...config.tls, requestCert: true, rejectUnauthorized: true, minVersion: 'TLSv1.2' as const };
  const app = await NestFactory.create<NestExpressApplication>(IdentityModule, { logger: false, bodyParser: false, httpsOptions });
  app.use((_req: unknown, res: Response, next: () => void) => {
    const id = String(res.getHeader?.('X-Request-ID') ?? randomUUID()); res.setHeader('X-Request-ID', id); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    requestContext.run(id, next);
  });
  app.useBodyParser('json', { limit: '16kb', strict: true });
  app.useGlobalGuards(new ServiceGuard(config)); app.useGlobalFilters(new ProblemFilter());
  return { app, identity };
}
