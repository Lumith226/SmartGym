import { Module, type DynamicModule } from '@nestjs/common';
import type { Identity } from './modules/accounts/identity.service.js';
import { createAccountsModule } from './modules/accounts/accounts.module.js';
import { createIdentityHealthModule } from './modules/identity-health.module.js';

@Module({})
export class IdentityModule {
  static register(identity: Identity): DynamicModule {
    return {
      module: IdentityModule,
      imports: [
        createIdentityHealthModule(identity),
        createAccountsModule(identity),
      ],
    };
  }
}
