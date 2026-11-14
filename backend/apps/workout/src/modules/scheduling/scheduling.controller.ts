import { Body, CanActivate, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Put, Query, Req, Res, UseGuards, type Type } from '@nestjs/common';
import { type WorkoutRequest } from '../../auth.js';
import { reject, valid } from '../../contract.js';
import { Schedules } from './schedules.service.js';
import { validateSchedule, type ScheduleInput } from './schedule-time.js';
import { ScheduleChanges, type OccurrenceChange } from './schedule-changes.service.js';
import { id, match, type Response } from '../workout-http.js';

export function createWorkoutSchedulingControllers(schedules: Schedules, changes: ScheduleChanges, OwnerGuard: Type<CanActivate>, ProgressGuard: Type<CanActivate>) {
  @Controller('api/v1/workout-schedules')
  @UseGuards(OwnerGuard)
  class ControllerSchedules {
    @Get() list(@Req() req: WorkoutRequest, @Query() query: Record<string, unknown>) { return schedules.list(req.actor!, query); }
    @Get(':id') async get(@Req() req: WorkoutRequest, @Param('id') value: string, @Res({ passthrough: true }) res: Response) {
      const result = await schedules.get(req.actor!, id(value));
      res.setHeader('ETag', '"v' + result.version + '"'); return result;
    }
    @Post()
    @HttpCode(201)
    async create(@Req() req: WorkoutRequest, @Headers('idempotency-key') key: unknown, @Body() value: unknown, @Res({ passthrough: true }) res: Response) {
      if (typeof key !== 'string' || !/^[A-Za-z0-9._-]{16,128}$/.test(key)) reject(400, 'INVALID_IDEMPOTENCY_KEY');
      if (!valid('WorkoutScheduleCreate', value)) reject(422, 'VALIDATION_ERROR');
      const input = value as ScheduleInput;
      validateSchedule(input);
      const result = await schedules.create(req.actor!, key, input);
      res.setHeader('ETag', '"v' + result.version + '"'); res.setHeader('Location', '/api/v1/workout-schedules/' + result.id);
      return result;
    }
    @Put(':id') async update(@Req() req: WorkoutRequest, @Param('id') value: string, @Headers('if-match') etag: unknown,
      @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
      const target = id(value), version = match(etag);
      if (!valid('WorkoutScheduleCreate', body)) reject(422, 'VALIDATION_ERROR');
      const input = body as ScheduleInput;
      validateSchedule(input);
      const result = await changes.update(req.actor!, target, version, input);
      res.setHeader('ETag', '"v' + result.version + '"'); return result;
    }
    @Delete(':id')
    @HttpCode(204)
    cancel(@Req() req: WorkoutRequest, @Param('id') value: string, @Headers('if-match') etag: unknown) {
      return changes.cancel(req.actor!, id(value), match(etag));
    }
  }

  @Controller('api/v1/workout-occurrences')
  @UseGuards(OwnerGuard)
  class ControllerOccurrences {
    @Get() list(@Req() req: WorkoutRequest, @Query() query: Record<string, unknown>) { return schedules.occurrences(req.actor!, query); }
    @Get(':id') async get(@Req() req: WorkoutRequest, @Param('id') value: string, @Res({ passthrough: true }) res: Response) {
      const result = await schedules.occurrence(req.actor!, id(value));
      res.setHeader('ETag', '"v' + result.version + '"'); return result;
    }
    @Patch(':id') async reschedule(@Req() req: WorkoutRequest, @Param('id') value: string, @Headers('if-match') etag: unknown,
      @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
      const target = id(value), version = match(etag);
      if (!valid('WorkoutOccurrenceChange', body)) reject(422, 'VALIDATION_ERROR');
      const result = (await changes.changeOccurrence(req.actor!, target, version, body as OccurrenceChange))!;
      res.setHeader('ETag', '"v' + result.version + '"'); return result;
    }
    @Post(':id/cancel')
    @HttpCode(204)
    cancel(@Req() req: WorkoutRequest, @Param('id') value: string, @Headers('if-match') etag: unknown) {
      return changes.changeOccurrence(req.actor!, id(value), match(etag));
    }
  }

  @Controller('internal/v1/workout/occurrences')
  @UseGuards(ProgressGuard)
  class ProgressOccurrences {
    @Get(':id') get(@Req()req:WorkoutRequest,@Param('id')value:string,@Query()query:Record<string,unknown>){
      if(Object.keys(query).length)reject(400,'BAD_REQUEST');return schedules.occurrence(req.actor!,id(value));
    }
  }

  return { ControllerSchedules, ControllerOccurrences, ProgressOccurrences };
}
