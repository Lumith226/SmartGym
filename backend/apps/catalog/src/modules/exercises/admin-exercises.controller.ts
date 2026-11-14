import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Patch, Post, Query, Req, Res, UseGuards, type CanActivate, type Type } from '@nestjs/common';
import type { AdminRequest } from '../admin/admin-auth.js';
import { AdminCatalog, type Draft } from './admin-catalog.service.js';
import { reject } from '../admin/admin-contract.js';
import { bodyOf, exerciseId, idempotencyKey, matchVersion, noBody, reasonOf, respond, type ResponseHeaders } from '../admin/admin-http.js';

export function createAdminExercisesControllers(AdminGuard: Type<CanActivate>) {
  @Controller('api/v1/admin')
  @UseGuards(AdminGuard)
  class AdminExercisesController {
    constructor(@Inject(AdminCatalog) private readonly catalog: AdminCatalog) {}

    @Get('exercises')
    list(@Query() query: Record<string, unknown>) { return this.catalog.list(query); }

    @Get('stats')
    stats(@Query() query: Record<string, unknown>) {
      if (Object.keys(query).length) reject(400, 'BAD_REQUEST');
      return this.catalog.stats();
    }

    @Post('exercises')
    async create(@Req() req: AdminRequest, @Body() body: unknown, @Headers('idempotency-key') key: unknown,
      @Res({ passthrough: true }) res: ResponseHeaders) {
      const result = await this.catalog.create(bodyOf<Draft>('ExerciseDraftCreate', body), req.actor!, idempotencyKey(key));
      res.setHeader('Location', '/api/v1/admin/exercises/' + result.detail.id);
      return respond(res, result);
    }

    @Get('exercises/:id')
    async get(@Param('id') id: string, @Res({ passthrough: true }) res: ResponseHeaders) {
      return respond(res, await this.catalog.get(exerciseId(id)));
    }

    @Patch('exercises/:id')
    async update(@Req() req: AdminRequest, @Param('id') id: string, @Body() body: unknown,
      @Headers('if-match') match: unknown, @Res({ passthrough: true }) res: ResponseHeaders) {
      return respond(res, await this.catalog.update(exerciseId(id), bodyOf<Partial<Draft>>('ExerciseDraftUpdate', body), req.actor!, matchVersion(match)));
    }

    @Post('exercises/:id/publish')
    @HttpCode(200)
    async publish(@Req() req: AdminRequest, @Param('id') id: string, @Body() body: unknown,
      @Headers('if-match') match: unknown, @Headers('idempotency-key') key: unknown, @Res({ passthrough: true }) res: ResponseHeaders) {
      noBody(body);
      return respond(res, await this.catalog.publish(exerciseId(id), req.actor!, matchVersion(match), idempotencyKey(key)));
    }

    @Post('exercises/:id/unpublish')
    @HttpCode(200)
    async unpublish(@Req() req: AdminRequest, @Param('id') id: string, @Body() body: unknown,
      @Headers('if-match') match: unknown, @Headers('idempotency-key') key: unknown, @Res({ passthrough: true }) res: ResponseHeaders) {
      const { reason } = bodyOf<{ reason: string }>('CmsArchiveReason', body);
      return respond(res, await this.catalog.unpublish(exerciseId(id), req.actor!, matchVersion(match), idempotencyKey(key), reasonOf(reason)));
    }

    @Delete('exercises/:id')
    @HttpCode(200)
    deleteArchived(@Req() req: AdminRequest, @Param('id') id: string, @Body() body: unknown,
      @Headers('if-match') match: unknown, @Headers('idempotency-key') key: unknown) {
      noBody(body);
      return this.catalog.deleteArchived(exerciseId(id), req.actor!, matchVersion(match), idempotencyKey(key));
    }

    @Post('exercises/:id/restore')
    @HttpCode(200)
    async restore(@Req() req: AdminRequest, @Param('id') id: string, @Body() body: unknown,
      @Headers('if-match') match: unknown, @Headers('idempotency-key') key: unknown, @Res({ passthrough: true }) res: ResponseHeaders) {
      noBody(body);
      return respond(res, await this.catalog.restore(exerciseId(id), req.actor!, matchVersion(match), idempotencyKey(key)));
    }

    @Get('catalog-audit')
    audit(@Query() query: Record<string, unknown>) { return this.catalog.listAudit(query); }

    @Get('exercise-audit')
    exerciseAudit(@Query() query: Record<string, unknown>) { return this.catalog.listExerciseAudit(query); }
  }

  return { AdminExercisesController };
}
