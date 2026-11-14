import { Module } from '@nestjs/common';
import type { Database } from '../database.js';
import { CatalogHealthController } from './catalog-health.controller.js';

export function createCatalogHealthModule(database: Database) {
  @Module({ controllers: [CatalogHealthController], providers: [{ provide: 'DATABASE', useValue: database }] })
  class CatalogHealthModule {}

  return CatalogHealthModule;
}
