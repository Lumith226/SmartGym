import { Body, Controller, Get, Headers, HttpCode, Inject, Module, Param, Post, Req, Res, UseGuards, type CanActivate, type Type } from '@nestjs/common';
import type { AdminRequest } from '../admin/admin-auth.js';
import { AdminImports, type ImportRequest } from './admin-imports.js';
import { bodyOf, exerciseId, idempotencyKey, matchVersion, respond, type ResponseHeaders } from '../admin/admin-http.js';

export function createCatalogTransfersModule(imports: AdminImports, AdminGuard: Type<CanActivate>) {
  @Controller('api/v1/admin')
  @UseGuards(AdminGuard)
  class CatalogTransfersController {
    constructor(@Inject(AdminImports) private readonly imports: AdminImports) {}

    @Post('catalog-imports')
    @HttpCode(202)
    async createImport(@Req() req: AdminRequest, @Body() body: unknown, @Headers('idempotency-key') key: unknown,
      @Res({ passthrough: true }) res: ResponseHeaders) {
      return respond(res, await this.imports.create(bodyOf<ImportRequest>('CmsImportRequest', body), req.actor!, idempotencyKey(key)));
    }

    @Get('catalog-imports/:id')
    async getImport(@Param('id') id: string, @Res({ passthrough: true }) res: ResponseHeaders) {
      return respond(res, await this.imports.get(exerciseId(id)));
    }

    @Post('catalog-imports/:id/apply')
    @HttpCode(202)
    async applyImport(@Req() req: AdminRequest, @Param('id') id: string, @Body() body: unknown,
      @Headers('if-match') match: unknown, @Headers('idempotency-key') key: unknown,
      @Res({ passthrough: true }) res: ResponseHeaders) {
      bodyOf('CmsImportCommit', body);
      return respond(res, await this.imports.apply(exerciseId(id), req.actor!, matchVersion(match), idempotencyKey(key)));
    }

    @Get('catalog-exports/:revision')
    exportPublication(@Param('revision') revision: string) { return this.imports.export(revision); }
  }

  @Module({ controllers: [CatalogTransfersController], providers: [AdminGuard, { provide: AdminImports, useValue: imports }] })
  class CatalogTransfersModule {}

  return CatalogTransfersModule;
}
