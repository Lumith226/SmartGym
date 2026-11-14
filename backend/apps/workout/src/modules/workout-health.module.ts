import { CanActivate, Module, type Type } from '@nestjs/common';
import type { Database } from '../database.js';
import { createWorkoutHealthControllers } from './workout-health.controller.js';

export function createWorkoutHealthModule(db: Database, ProbeGuard: Type<CanActivate>) {
  const { Health } = createWorkoutHealthControllers(db, ProbeGuard);

  @Module({ controllers: [Health], providers: [ProbeGuard] })
  class WorkoutHealthModule {}

  return WorkoutHealthModule;
}
