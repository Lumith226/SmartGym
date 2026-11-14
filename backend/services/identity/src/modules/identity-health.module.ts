import { Controller, Get, Module, Inject } from '@nestjs/common';
import { Identity } from './accounts/identity.js';

export function createIdentityHealthModule(identity: Identity) {
  @Controller()
  class IdentityHealthController {
    constructor(@Inject('IDENTITY') private readonly identity: Identity) {}

    @Get('health/live') live() { return { status: 'alive' }; }

    @Get('health/ready') async ready() {
    const result = await this.identity.database.query('SELECT version FROM identity_migrations WHERE version=3');
    if (!result.rows.length) throw new Error('Migration not applied');
    return { status: 'ready' };
  }
  }

  @Module({ controllers: [IdentityHealthController], providers: [{ provide: 'IDENTITY', useValue: identity }] })
  class IdentityHealthModule {}

  return IdentityHealthModule;
}
