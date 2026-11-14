import { CanActivate, Module, type Type } from '@nestjs/common';
import { Plans } from './plans.service.js';
import { createWorkoutPlansControllers } from './plans.controller.js';

export function createWorkoutPlansModule(plans: Plans, OwnerGuard: Type<CanActivate>) {
  const { ControllerPlans } = createWorkoutPlansControllers(plans, OwnerGuard);

  @Module({ controllers: [ControllerPlans], providers: [OwnerGuard] })
  class WorkoutPlansModule {}

  return WorkoutPlansModule;
}
