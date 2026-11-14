import { Body, Controller, Get, Headers, HttpCode, Inject, Module, Param, Patch, Post, Query, Req, Res, UseGuards, type CanActivate, type Type } from '@nestjs/common';
import type { AdminRequest } from '../admin/admin-auth.js';
import { AdminSupport, supportType, type SupportCreate, type SupportInput } from './admin-support.js';
import { reject } from '../admin/admin-contract.js';
import { bodyOf, exerciseId, idempotencyKey, matchVersion, noBody, reasonOf, respond, type ResponseHeaders } from '../admin/admin-http.js';

export function createAdminContentModule(support: AdminSupport, AdminGuard: Type<CanActivate>) {
  @Controller('api/v1/admin')
  @UseGuards(AdminGuard)
  class AdminContentController {
    constructor(@Inject(AdminSupport) private readonly support: AdminSupport) {}

    @Get('content/:type')
    listSupport(@Param('type') type: string, @Query() query: Record<string, unknown>) {
      return this.support.list(supportType(type), query);
    }

    @Post('content/:type')
    async createSupport(@Req() req: AdminRequest, @Param('type') type: string, @Body() body: unknown,
      @Headers('idempotency-key') key: unknown, @Res({ passthrough: true }) res: ResponseHeaders) {
      return respond(res, await this.support.create(supportType(type), bodyOf<SupportCreate>('CmsContentCreate', body), req.actor!, idempotencyKey(key)));
    }

    @Get('content/:type/:id')
    async getSupport(@Param('type') type: string, @Param('id') id: string, @Res({ passthrough: true }) res: ResponseHeaders) {
      return respond(res, await this.support.get(supportType(type), exerciseId(id)));
    }

    @Patch('content/:type/:id')
    async updateSupport(@Req() req: AdminRequest, @Param('type') type: string, @Param('id') id: string, @Body() body: unknown,
      @Headers('if-match') match: unknown, @Res({ passthrough: true }) res: ResponseHeaders) {
      return respond(res, await this.support.update(supportType(type), exerciseId(id), bodyOf<SupportInput>('CmsContentUpdate', body), req.actor!, matchVersion(match)));
    }

    @Post('content/:type/:id/:action')
    @HttpCode(200)
    async transitionSupport(@Req() req: AdminRequest, @Param('type') type: string, @Param('id') id: string,
      @Param('action') action: string, @Body() body: unknown, @Headers('if-match') match: unknown,
      @Headers('idempotency-key') key: unknown, @Res({ passthrough: true }) res: ResponseHeaders) {
      if (action !== 'publish' && action !== 'archive' && action !== 'restore') reject(404, 'NOT_FOUND');
      const command = { publish: 'PUBLISH', archive: 'ARCHIVE', restore: 'RESTORE' } as const;
      let reason: string | undefined;
      if (action === 'archive') {
        reason = reasonOf(bodyOf<{ reason: string }>('CmsArchiveReason', body).reason);
      } else noBody(body);
      return respond(res, await this.support.transition(supportType(type), exerciseId(id), command[action], req.actor!, matchVersion(match), idempotencyKey(key), reason));
    }
  }

  @Module({ controllers: [AdminContentController], providers: [AdminGuard, { provide: AdminSupport, useValue: support }] })
  class AdminContentModule {}

  return AdminContentModule;
}
