import { Body, Controller, Get, Headers, HttpCode, Inject, Module, Param, Post, Query, Req, Res, UseGuards, type CanActivate, type Type } from '@nestjs/common';
import type { AdminRequest } from '../admin/admin-auth.js';
import { AdminCatalog } from '../exercises/admin-catalog.js';
import { AdminSupport, supportType } from '../content/admin-support.js';
import { revisionVersion, type RevisionSelection } from './admin-revisions.js';
import { bodyOf, exerciseId, idempotencyKey, matchVersion, reasonOf, respond, type ResponseHeaders } from '../admin/admin-http.js';

export function createAdminRevisionsModule(catalog: AdminCatalog, support: AdminSupport, AdminGuard: Type<CanActivate>) {
  @Controller('api/v1/admin')
  @UseGuards(AdminGuard)
  class AdminRevisionsController {
    constructor(@Inject(AdminCatalog) private readonly catalog: AdminCatalog,
      @Inject(AdminSupport) private readonly support: AdminSupport) {}

    @Get('revisions/:type/:id')
    listRevisions(@Param('type') type: string, @Param('id') rawId: string, @Query() query: Record<string, unknown>) {
      const id = exerciseId(rawId);
      return type === 'exercise' ? this.catalog.listRevisions(id, query) : this.support.listRevisions(supportType(type), id, query);
    }

    @Get('revisions/:type/:id/:version')
    getRevision(@Param('type') type: string, @Param('id') rawId: string, @Param('version') rawVersion: string) {
      const id = exerciseId(rawId), version = revisionVersion(rawVersion);
      return type === 'exercise' ? this.catalog.getRevision(id, version) : this.support.getRevision(supportType(type), id, version);
    }

    @Post('revisions/:type/:id/restore')
    @HttpCode(200)
    async restoreRevision(@Req() req: AdminRequest, @Param('type') type: string, @Param('id') rawId: string, @Body() body: unknown,
      @Headers('if-match') match: unknown, @Headers('idempotency-key') key: unknown, @Res({ passthrough: true }) res: ResponseHeaders) {
      const { version, reason } = bodyOf<RevisionSelection>('CmsRestoreRevision', body);
      const selection = { version, reason: reasonOf(reason) };
      const id = exerciseId(rawId), expected = matchVersion(match), operationKey = idempotencyKey(key);
      const result = type === 'exercise' ? await this.catalog.restore(id, req.actor!, expected, operationKey, selection)
        : await this.support.restoreRevision(supportType(type), id, req.actor!, expected, operationKey, selection);
      return respond(res, result);
    }
  }

  @Module({ controllers: [AdminRevisionsController], providers: [AdminGuard, { provide: AdminCatalog, useValue: catalog }, { provide: AdminSupport, useValue: support }] })
  class AdminRevisionsModule {}

  return AdminRevisionsModule;
}
