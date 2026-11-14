import { Body, CanActivate, Controller, Get, Headers, HttpCode, Module, Param, Post, Req, Res, SetMetadata, UseGuards, type Type } from '@nestjs/common';
import type { UploadInput } from './storage.js';
import { reject } from '../../contract.js';
import { PoseJobs } from './jobs.js';
import { body, id, key, type Request, type Response } from '../pose-http.js';

export function createPoseJobsModule(jobs: PoseJobs, enabled: boolean, Guard: Type<CanActivate>) {
  @Controller()
  @UseGuards(Guard)
  class PoseJobsController {
    @Post('api/v1/pose/uploads')
    reserve(@Req() req: Request, @Body() value: unknown, @Headers('idempotency-key') operationKey: unknown) {
      if (!enabled) reject(503, 'POSE_UPLOAD_DISABLED');
      return jobs.reserve(req.actor, body<UploadInput>('PoseUploadRequest', value), key(operationKey));
    }

    @Post('api/v1/pose/jobs') @HttpCode(202)
    async create(@Req() req: Request, @Body() value: unknown, @Headers('idempotency-key') operationKey: unknown,
      @Res({ passthrough: true }) res: Response) {
      if (!enabled) reject(503, 'POSE_UPLOAD_DISABLED');
      const result = await jobs.create(req.actor, body('PoseJobCreate', value), key(operationKey));
      res.setHeader('Location', '/api/v1/pose/jobs/' + result.id); return result;
    }

    @Get('api/v1/pose/jobs/:id') get(@Req() req: Request, @Param('id') value: string) { return jobs.get(req.actor, id(value)); }

    @Post('api/v1/pose/jobs/:id/cancel') @HttpCode(200)
    cancel(@Req() req: Request, @Param('id') value: string, @Body() valueBody: unknown) {
      if (valueBody != null && (typeof valueBody !== 'object' || Array.isArray(valueBody) || Object.keys(valueBody).length)) reject(422, 'VALIDATION_ERROR');
      return jobs.cancel(req.actor, id(value));
    }

    @Get('internal/v1/pose/results/:id') @SetMetadata('pose-caller', 'progress') summary(@Req() req: Request, @Param('id') value: string) { return jobs.result(req.actor, id(value), false); }

    @Get('internal/v1/pose/results/:id/raw') raw(@Req() req: Request, @Param('id') value: string) { return jobs.result(req.actor, id(value), true); }

    @Get('api/v1/pose/results/:id') getResult(@Req() req: Request, @Param('id') value: string) { return jobs.result(req.actor, id(value), false); }
  }

  @Module({ controllers: [PoseJobsController], providers: [Guard] })
  class PoseJobsModule {}

  return PoseJobsModule;
}
