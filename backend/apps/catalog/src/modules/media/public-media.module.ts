import { Module } from '@nestjs/common';
import type { Database } from '../../database.js';
import type { MediaStorage } from './media-types.js';
import { PublicMediaController } from './public-media.controller.js';

export function createPublicMediaModule(database: Database, storage?: MediaStorage) {
  @Module({ controllers: [PublicMediaController], providers: [{ provide: 'DATABASE', useValue: database }, { provide: 'MEDIA_STORAGE', useValue: storage ?? null }] })
  class PublicMediaModule {}

  return PublicMediaModule;
}
