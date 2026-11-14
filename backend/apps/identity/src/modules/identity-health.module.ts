import { Module } from '@nestjs/common';
import { Identity } from './accounts/identity.service.js';
import { IdentityHealthController } from './identity-health.controller.js';

export function createIdentityHealthModule(identity: Identity) {
  @Module({ controllers: [IdentityHealthController], providers: [{ provide: 'IDENTITY', useValue: identity }] })
  class IdentityHealthModule {}

  return IdentityHealthModule;
}
