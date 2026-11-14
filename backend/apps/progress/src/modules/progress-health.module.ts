import { CanActivate, Module, type Type } from '@nestjs/common';
import type { Database } from '../database.js';
import { createProgressHealthControllers } from './progress-health.controller.js';

export function createProgressHealthModule(db: Database, ProbeGuard: Type<CanActivate>) {
  const { Health } = createProgressHealthControllers(db, ProbeGuard);

  @Module({ controllers: [Health], providers: [ProbeGuard] })
  class ProgressHealthModule {}

  return ProgressHealthModule;
}
