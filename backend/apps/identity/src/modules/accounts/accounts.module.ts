import { Module } from '@nestjs/common';
import { Identity } from './identity.service.js';
import { IdentityController } from './accounts.controller.js';

export function createAccountsModule(identity: Identity) {
  @Module({ controllers: [IdentityController], providers: [{ provide: 'IDENTITY', useValue: identity }] })
  class AccountsModule {}

  return AccountsModule;
}
