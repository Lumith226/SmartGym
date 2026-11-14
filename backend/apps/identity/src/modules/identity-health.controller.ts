import { Controller, Get, Inject } from '@nestjs/common';
import { Identity } from './accounts/identity.service.js';

@Controller()
export class IdentityHealthController {
  constructor(@Inject('IDENTITY') private readonly identity: Identity) {}

  @Get('health/live') live() { return { status: 'alive' }; }

  @Get('health/ready') async ready() {
  const result = await this.identity.database.query('SELECT version FROM identity_migrations WHERE version=3');
  if (!result.rows.length) throw new Error('Migration not applied');
  return { status: 'ready' };
}
}
