import { CanActivate, Module, type Type } from '@nestjs/common';
import { Schedules } from './schedules.service.js';
import { ScheduleChanges } from './schedule-changes.service.js';
import { createWorkoutSchedulingControllers } from './scheduling.controller.js';

export function createWorkoutSchedulingModule(schedules: Schedules, changes: ScheduleChanges, OwnerGuard: Type<CanActivate>, ProgressGuard: Type<CanActivate>) {
  const { ControllerSchedules, ControllerOccurrences, ProgressOccurrences } = createWorkoutSchedulingControllers(schedules, changes, OwnerGuard, ProgressGuard);

  @Module({ controllers: [ControllerSchedules, ControllerOccurrences, ProgressOccurrences], providers: [OwnerGuard, ProgressGuard] })
  class WorkoutSchedulingModule {}

  return WorkoutSchedulingModule;
}
