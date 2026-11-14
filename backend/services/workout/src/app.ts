import 'reflect-metadata';
import { CanActivate, Catch, ExceptionFilter, ExecutionContext, HttpException, Module, type ArgumentsHost } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { authenticate, type AuthConfig, type WorkoutRequest } from './auth.js';
import { reject } from './contract.js';
import type { Database } from './database.js';
import type { CatalogClient } from './modules/plans/catalog-client.js';
import { Plans } from './modules/plans/plans.js';
import { Schedules } from './modules/scheduling/schedules.js';
import { ScheduleChanges } from './modules/scheduling/schedule-changes.js';
import type { Response } from './modules/workout-http.js';
import { createWorkoutPlansModule } from './modules/plans/plans.module.js';
import { createWorkoutSchedulingModule } from './modules/scheduling/scheduling.module.js';
import { createWorkoutHealthModule } from './modules/workout-health.module.js';

@Catch()
class Problems implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const invalidJson = error && typeof error === 'object' && 'type' in error && ['entity.parse.failed', 'entity.too.large'].includes(String(error.type));
    const status = error instanceof HttpException ? error.getStatus() : invalidJson ? 400 : 503;
    const payload = error instanceof HttpException ? error.getResponse() : undefined;
    const code = payload && typeof payload === 'object' && 'code' in payload ? payload.code : status >= 500 ? 'WORKOUT_UNAVAILABLE' : 'BAD_REQUEST';
    res.status(status).json({ type: 'about:blank', title: 'Chưa thể xử lý chương trình tập', status, code, requestId: randomUUID(),
      ...(payload && typeof payload === 'object' && 'detail' in payload && typeof payload.detail === 'string' ? { detail: payload.detail } : {}) });
  }
}

export async function createWorkoutApp(db: Database, auth: AuthConfig, catalog: CatalogClient, now = () => new Date()) {
  const plans = new Plans(db, catalog);
  const schedules = new Schedules(db, now);
  const changes = new ScheduleChanges(db, now);
  class OwnerGuard implements CanActivate {
    async canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest<WorkoutRequest>();
      req.actor = await authenticate(req, auth);
      return true;
    }
  }
  class ProbeGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest<WorkoutRequest>();
      if (!req.socket.authorized || !auth.bffFingerprints.includes(req.socket.getPeerCertificate().fingerprint256)) reject(403, 'SERVICE_FORBIDDEN');
      return true;
    }
  }
  class ProgressGuard implements CanActivate {
    async canActivate(context:ExecutionContext){const req=context.switchToHttp().getRequest<WorkoutRequest>();req.actor=await authenticate(req,auth,'progress');return true;}
  }

  @Module({
    imports: [
      createWorkoutPlansModule(plans, OwnerGuard),
      createWorkoutSchedulingModule(schedules, changes, OwnerGuard, ProgressGuard),
      createWorkoutHealthModule(db, ProbeGuard),
    ],
  })
  class WorkoutModule {}

  const httpsOptions = { ...auth.tls, requestCert: true, rejectUnauthorized: true, minVersion: 'TLSv1.2' as const };
  const app = await NestFactory.create<NestExpressApplication>(WorkoutModule, { logger: false, bodyParser: false, httpsOptions });
  app.use((_req: unknown, res: Response, next: () => void) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
  app.useBodyParser('json', { limit: '64kb' });
  app.useGlobalFilters(new Problems());
  return app;
}
