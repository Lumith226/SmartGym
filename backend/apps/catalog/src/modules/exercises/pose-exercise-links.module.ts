import { Module, type CanActivate, type Type } from '@nestjs/common';
import type { Database } from '../../database.js';
import { createPoseExerciseLinksControllers } from './pose-exercise-links.controller.js';

export function createPoseExerciseLinksModule(db: Database, AdminGuard: Type<CanActivate>) {
  const { PoseLinksController } = createPoseExerciseLinksControllers(db, AdminGuard);

  @Module({ controllers: [PoseLinksController], providers: [AdminGuard] })
  class PoseExerciseLinksModule {}

  return PoseExerciseLinksModule;
}
