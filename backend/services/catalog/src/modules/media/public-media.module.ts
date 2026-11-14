import { Controller, Get, Param, Req, Res, Module, Inject } from '@nestjs/common';
import type { Database } from '../../database.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { MediaStorage } from './media-types.js';
import { servePublicMedia } from './public-media.js';

export function createPublicMediaModule(database: Database, storage?: MediaStorage) {
  @Controller()
  class PublicMediaController {
    constructor(@Inject('DATABASE') private readonly database: Database,
      @Inject('MEDIA_STORAGE') private readonly storage: MediaStorage | null) {}

    @Get('api/v1/media/:id/:version')
    media(@Param('id') id: string, @Param('version') version: string, @Req() request: IncomingMessage, @Res() response: ServerResponse) {
      return servePublicMedia(this.database, this.storage ?? undefined, id, version, request, response);
    }
  }

  @Module({ controllers: [PublicMediaController], providers: [{ provide: 'DATABASE', useValue: database }, { provide: 'MEDIA_STORAGE', useValue: storage ?? null }] })
  class PublicMediaModule {}

  return PublicMediaModule;
}
