import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import 'reflect-metadata';
import { CanActivate, Catch, ExceptionFilter, ExecutionContext, HttpException, type ArgumentsHost } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Database } from './database.js';
import type { Storage } from './modules/analysis/storage.js';
import { authenticate, type AuthConfig } from './auth.js';
import { reject } from './contract.js';
import { PoseJobs } from './modules/analysis/pose-jobs.service.js';
import { randomUUID } from 'node:crypto';
import type { EngineHttp } from './engine.js';
import { LiveStore } from './modules/live/live-store.js';
import { attachPoseLive } from './modules/live/live-stream.js';
import type { Request, Response } from './modules/pose-http.js';
import { PoseModule } from './app.module.js';

const selfProbeFingerprint = process.env.SMARTGYM_SELF_PROBE === 'true'
  ? new X509Certificate(readFileSync('/run/secrets/client.crt')).fingerprint256 : undefined;

@Catch()
class Problems implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 503;
    const payload = error instanceof HttpException ? error.getResponse() : null;
    const code = payload && typeof payload === 'object' && 'code' in payload ? payload.code : status >= 500 ? 'POSE_UNAVAILABLE' : 'REQUEST_REJECTED';
    res.status(status).json({ type: 'about:blank', title: 'Yêu cầu Pose chưa thể hoàn tất', status, code, requestId: randomUUID() });
  }
}

export async function createPoseApp(db: Database, storage: Storage, auth: AuthConfig, consent: string, enabled = false, prefix = 'pose/uploads', engine?: EngineHttp) {
  const jobs = new PoseJobs(db, storage, consent, prefix);
  const live = new LiveStore(db, consent);
  const reflector = new Reflector();
  class Guard implements CanActivate {
    async canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest<Request>();
      const caller = reflector.get<'bff' | 'progress' | 'service'>('pose-caller', context.getHandler()) ?? 'bff';
      if (caller === 'service') {
        if (process.env.SMARTGYM_SELF_PROBE === 'true' && req.socket.authorized && req.socket.remoteAddress === '127.0.0.1' && req.socket.getPeerCertificate().fingerprint256 === selfProbeFingerprint && req.url?.startsWith('/health/')) return true;
        if (!req.socket.authorized || ![...auth.bffFingerprints, ...auth.progressFingerprints].includes(req.socket.getPeerCertificate().fingerprint256)) reject(403, 'SERVICE_FORBIDDEN');
      } else req.actor = await authenticate(req, auth, caller);
      return true;
    }
  }

  const appModule = PoseModule.register(db, storage, consent, enabled, engine, Guard, jobs, live);

  const httpsOptions = { ...auth.tls, requestCert: true, rejectUnauthorized: true, minVersion: 'TLSv1.2' as const };
  const app = await NestFactory.create<NestExpressApplication>(appModule, { logger: false, bodyParser: false, httpsOptions });
  app.use((_req: unknown, res: Response, next: () => void) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
  app.useBodyParser('json', { limit: '16kb' });
  app.useGlobalFilters(new Problems());
  const stopLive = attachPoseLive(app.getHttpServer(), live, auth, engine);
  app.getHttpServer().once('close', stopLive);
  return { app, stopLive };
}
