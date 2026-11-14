import { Module, type CanActivate, type DynamicModule, type Type } from '@nestjs/common';
import type { Database } from './database.js';
import type { Logs } from './modules/logs/logs.service.js';
import type { Summaries } from './modules/summary/summary.service.js';
import { createProgressLogsModule } from './modules/logs/logs.module.js';
import { createProgressSummaryModule } from './modules/summary/summary.module.js';
import { createProgressHealthModule } from './modules/progress-health.module.js';

@Module({})
export class ProgressModule {
  static register(db: Database, logs: Logs, summaries: Summaries, OwnerGuard: Type<CanActivate>, ProbeGuard: Type<CanActivate>): DynamicModule {
    return {
      module: ProgressModule,
      imports: [
        createProgressHealthModule(db, ProbeGuard),
        createProgressLogsModule(logs, OwnerGuard),
        createProgressSummaryModule(summaries, OwnerGuard),
      ],
    };
  }
}
