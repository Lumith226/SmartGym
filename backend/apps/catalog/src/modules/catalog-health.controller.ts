import { Controller, Get, Inject } from '@nestjs/common';
import type { Database } from '../database.js';

@Controller()
export class CatalogHealthController {
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
