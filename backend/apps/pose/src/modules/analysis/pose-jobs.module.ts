import { CanActivate, Module, type Type } from '@nestjs/common';
import { PoseJobs } from './pose-jobs.service.js';
import { createPoseJobsControllers } from './pose-jobs.controller.js';

export function createPoseJobsModule(jobs: PoseJobs, enabled: boolean, Guard: Type<CanActivate>) {
  const { PoseJobsController } = createPoseJobsControllers(jobs, enabled, Guard);

  @Module({ controllers: [PoseJobsController], providers: [Guard] })
  class PoseJobsModule {}

  return PoseJobsModule;
}
