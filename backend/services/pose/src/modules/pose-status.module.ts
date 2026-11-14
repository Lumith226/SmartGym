import { CanActivate, Controller, Get, Module, Query, SetMetadata, UseGuards, type Type } from '@nestjs/common';
import type { Database } from '../database.js';
import type { Storage } from './analysis/storage.js';
import { modelOf, models, reject } from '../contract.js';
import type { EngineHttp } from '../engine.js';

export function createPoseStatusModule(db: Database, storage: Storage, consent: string, enabled: boolean, engine: EngineHttp | undefined, Guard: Type<CanActivate>) {
  @Controller()
  @UseGuards(Guard)
  class PoseStatusController {
    @Get('health/live') @SetMetadata('pose-caller', 'service') live() { return { status: 'live' }; }

    @Get('health/ready') @SetMetadata('pose-caller', 'service') async ready() {
      if (!(await db.query('SELECT 1 FROM pose_migrations WHERE version=2')).rows.length) reject(503, 'SCHEMA_NOT_READY');
      await storage.ready(); return { status: 'ready' };
    }

    @Get('api/v1/pose/capabilities') @SetMetadata('pose-caller', 'service') capabilities(@Query() query: Record<string, unknown>) {
      if (Object.keys(query).some(k => k !== 'exerciseId') || (query.exerciseId !== undefined && typeof query.exerciseId !== 'string')) reject(400, 'BAD_REQUEST');
      const selected = query.exerciseId === undefined ? models : [modelOf(query.exerciseId as string)];
      return { consentVersion: consent, items: selected.map(m => ({ exerciseId: m.catalogId, modelVersion: 'ST-GCNpp-V4', uploadEnabled: enabled,
        liveEnabled: !!engine, uploadRepCounting: false, liveRepCounting: !!engine, formFeedback: true,
        limitations: ['Whole-video V4 chưa có số rep.'] })) };
    }
  }

  @Module({ controllers: [PoseStatusController], providers: [Guard] })
  class PoseStatusModule {}

  return PoseStatusModule;
}
