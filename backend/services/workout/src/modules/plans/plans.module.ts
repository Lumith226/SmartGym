import { Body, CanActivate, Controller, Delete, Get, Headers, HttpCode, Module, Param, Post, Put, Query, Req, Res, UseGuards, type Type } from '@nestjs/common';
import { type WorkoutRequest } from '../../auth.js';
import { reject, valid } from '../../contract.js';
import { Plans, type PlanInput } from './plans.js';
import { id, match, type Response } from '../workout-http.js';

function input(value: unknown): PlanInput {
  if (!valid('WorkoutPlanCreate', value)) reject(422, 'VALIDATION_ERROR');
  const body = value as PlanInput;
  if (!body.name.trim() || body.name.includes('\u0000') || body.description?.includes('\u0000')) reject(422, 'VALIDATION_ERROR');
  return body;
}
export function createWorkoutPlansModule(plans: Plans, OwnerGuard: Type<CanActivate>) {
  @Controller('api/v1/workout-plans')
  @UseGuards(OwnerGuard)
  class ControllerPlans {
    @Get() list(@Req() req: WorkoutRequest, @Query() query: Record<string, unknown>) { return plans.list(req.actor!, query); }
    @Get(':id') async get(@Req() req: WorkoutRequest, @Param('id') value: string, @Res({ passthrough: true }) res: Response) {
      const result = await plans.get(req.actor!, id(value));
      res.setHeader('ETag', '"v' + result.version + '"');
      return result;
    }
    @Post()
    @HttpCode(201)
    async create(@Req() req: WorkoutRequest, @Headers('idempotency-key') key: unknown, @Body() value: unknown, @Res({ passthrough: true }) res: Response) {
      if (typeof key !== 'string' || !/^[A-Za-z0-9._-]{16,128}$/.test(key)) reject(400, 'INVALID_IDEMPOTENCY_KEY');
      const result = await plans.create(req.actor!, key, input(value));
      res.setHeader('ETag', '"v' + result.version + '"'); res.setHeader('Location', '/api/v1/workout-plans/' + result.id);
      return result;
    }
    @Put(':id') async update(@Req() req: WorkoutRequest, @Param('id') value: string, @Headers('if-match') etag: unknown,
      @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
      const result = await plans.update(req.actor!, id(value), match(etag), input(body));
      res.setHeader('ETag', '"v' + result.version + '"'); return result;
    }
    @Delete(':id')
    @HttpCode(204)
    archive(@Req() req: WorkoutRequest, @Param('id') value: string, @Headers('if-match') etag: unknown) {
      return plans.archive(req.actor!, id(value), match(etag));
    }
  }

  @Module({ controllers: [ControllerPlans], providers: [OwnerGuard] })
  class WorkoutPlansModule {}

  return WorkoutPlansModule;
}
