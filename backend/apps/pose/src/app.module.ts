import { Module, type CanActivate, type DynamicModule, type Type } from '@nestjs/common';
import type { Database } from './database.js';
import type { Storage } from './modules/analysis/storage.js';
import type { PoseJobs } from './modules/analysis/pose-jobs.service.js';
import type { EngineHttp } from './engine.js';
import type { LiveStore } from './modules/live/live-store.js';
import { createPoseStatusModule } from './modules/pose-status.module.js';
import { createPoseJobsModule } from './modules/analysis/pose-jobs.module.js';
import { createPoseLiveModule } from './modules/live/pose-live.module.js';

@Module({})
export class PoseModule {
  static register(db: Database, storage: Storage, consent: string, enabled: boolean, engine: EngineHttp | undefined, Guard: Type<CanActivate>, jobs: PoseJobs, live: LiveStore): DynamicModule {
    return {
      module: PoseModule,
      imports: [
        createPoseStatusModule(db, storage, consent, enabled, engine, Guard),
        createPoseJobsModule(jobs, enabled, Guard),
        createPoseLiveModule(live, engine, Guard),
      ],
    };
  }
}
