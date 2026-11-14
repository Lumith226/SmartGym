import { CanActivate, Module, type Type } from '@nestjs/common';
import { Summaries } from './summary.service.js';
import { createProgressSummaryControllers } from './summary.controller.js';

export function createProgressSummaryModule(summaries: Summaries, OwnerGuard: Type<CanActivate>) {
  const { ProgressSummaryController } = createProgressSummaryControllers(summaries, OwnerGuard);

  @Module({ controllers: [ProgressSummaryController], providers: [OwnerGuard] })
  class ProgressSummaryModule {}

  return ProgressSummaryModule;
}
