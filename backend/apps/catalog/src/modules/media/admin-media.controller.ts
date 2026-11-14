import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Req, UseGuards, type CanActivate, type Type } from '@nestjs/common';
import type { AdminRequest } from '../admin/admin-auth.js';
import { AdminMedia, validateUpload } from './admin-media.service.js';
import { reject } from '../admin/admin-contract.js';
import type { UploadRequest } from './media-types.js';
import { bodyOf, exerciseId, idempotencyKey, noBody } from '../admin/admin-http.js';

export function createAdminMediaControllers(AdminGuard: Type<CanActivate>) {
  @Controller('api/v1/admin')
  @UseGuards(AdminGuard)
  class AdminMediaController {
    constructor(@Inject(AdminMedia) private readonly media: AdminMedia | null) {}

    private mediaApi() {
      if (!this.media) reject(503, 'CATALOG_MEDIA_UNAVAILABLE');
      return this.media;
    }

    @Post('media-uploads')
    createMediaUpload(@Req() req: AdminRequest, @Body() body: unknown, @Headers('idempotency-key') key: unknown) {
      validateUpload(body);
      return this.mediaApi().create(req.actor!, idempotencyKey(key), bodyOf<UploadRequest>('CmsMediaUploadRequest', body));
    }

    @Get('media-uploads/:id')
    getMediaUpload(@Req() req: AdminRequest, @Param('id') id: string) {
      return this.mediaApi().get(exerciseId(id), req.actor!);
    }

    @Post('media-uploads/:id/complete')
    @HttpCode(202)
    completeMediaUpload(@Req() req: AdminRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) {
      noBody(body);
      return this.mediaApi().complete(exerciseId(id), req.actor!, idempotencyKey(key));
    }

    @Get('media-uploads/:id/preview')
    previewMediaUpload(@Req() req: AdminRequest, @Param('id') id: string) {
      return this.mediaApi().preview(exerciseId(id), req.actor!);
    }
  }

  return { AdminMediaController };
}
