import { Controller, Get, Module, Inject } from '@nestjs/common';
import type { Database } from '../database.js';

export function createCatalogHealthModule(database: Database) {
  @Controller()
  class CatalogHealthController {
    constructor(@Inject('DATABASE') private readonly database: Database) {}

    @Get('health/live')
    live() { return { status: 'alive' }; }

    @Get('health/ready')
    async ready() {
      const result = await this.database.query('SELECT version FROM catalog_migrations WHERE version=11');
      if (!result.rows.length) throw new Error('Migration not applied');
      return { status: 'ready' };
    }
  }

  @Module({ controllers: [CatalogHealthController], providers: [{ provide: 'DATABASE', useValue: database }] })
  class CatalogHealthModule {}

  return CatalogHealthModule;
}
