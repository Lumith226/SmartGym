import { CanActivate, Module, type Type } from '@nestjs/common';
import type { Database } from '../database.js';
import type { Storage } from './analysis/storage.js';
import type { EngineHttp } from '../engine.js';
import { createPoseStatusControllers } from './pose-status.controller.js';

export function createPoseStatusModule(db: Database, storage: Storage, consent: string, enabled: boolean, engine: EngineHttp | undefined, Guard: Type<CanActivate>) {
  const { PoseStatusController } = createPoseStatusControllers(db, storage, consent, enabled, engine, Guard);

  @Module({ controllers: [PoseStatusController], providers: [Guard] })
  class PoseStatusModule {}

  return PoseStatusModule;
}
