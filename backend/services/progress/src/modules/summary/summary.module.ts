import { CanActivate, Controller, Get, Module, Query, Req, UseGuards, type Type } from '@nestjs/common';
import { type ProgressRequest } from '../../auth.js';
import { Summaries } from './summary.js';

export function createProgressSummaryModule(summaries: Summaries, OwnerGuard: Type<CanActivate>) {
  @Controller('api/v1/progress')
  @UseGuards(OwnerGuard)
  class ProgressSummaryController {
    @Get('summary')get(@Req()req:ProgressRequest,@Query()query:Record<string,unknown>){return summaries.get(req.actor!,query);}
  }

  @Module({ controllers: [ProgressSummaryController], providers: [OwnerGuard] })
  class ProgressSummaryModule {}

  return ProgressSummaryModule;
}
