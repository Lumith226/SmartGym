import { CanActivate, Controller, Get, Query, Req, UseGuards, type Type } from '@nestjs/common';
import { type ProgressRequest } from '../../auth.js';
import { Summaries } from './summary.service.js';

export function createProgressSummaryControllers(summaries: Summaries, OwnerGuard: Type<CanActivate>) {
  @Controller('api/v1/progress')
  @UseGuards(OwnerGuard)
  class ProgressSummaryController {
    @Get('summary')get(@Req()req:ProgressRequest,@Query()query:Record<string,unknown>){return summaries.get(req.actor!,query);}
  }

  return { ProgressSummaryController };
}
