import { Module, type CanActivate, type DynamicModule, type Type } from '@nestjs/common';
import type { Database } from './database.js';
import type { Plans } from './modules/plans/plans.service.js';
import type { Schedules } from './modules/scheduling/schedules.service.js';
import type { ScheduleChanges } from './modules/scheduling/schedule-changes.service.js';
import { createWorkoutPlansModule } from './modules/plans/plans.module.js';
import { createWorkoutSchedulingModule } from './modules/scheduling/scheduling.module.js';
import { createWorkoutHealthModule } from './modules/workout-health.module.js';

@Module({})
export class WorkoutModule {
  static register(db: Database, plans: Plans, schedules: Schedules, changes: ScheduleChanges, OwnerGuard: Type<CanActivate>, ProgressGuard: Type<CanActivate>, ProbeGuard: Type<CanActivate>): DynamicModule {
    return {
      module: WorkoutModule,
      imports: [
        createWorkoutPlansModule(plans, OwnerGuard),
        createWorkoutSchedulingModule(schedules, changes, OwnerGuard, ProgressGuard),
        createWorkoutHealthModule(db, ProbeGuard),
      ],
    };
  }
}
