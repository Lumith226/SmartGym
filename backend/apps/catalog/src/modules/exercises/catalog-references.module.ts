import { Module, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { AdminConfig, AdminRequest } from '../admin/admin-auth.js';
import { reject } from '../admin/admin-contract.js';
import type { Database } from '../../database.js';
import { createCatalogReferencesControllers } from './catalog-references.controller.js';

export function createCatalogReferencesModule(database: Database, config: AdminConfig) {
  class RefsGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest<AdminRequest>();
      if (!req.socket.encrypted || !req.socket.authorized) reject(401, 'SERVICE_UNAUTHENTICATED');
      if (!config.refFingerprints?.includes(req.socket.getPeerCertificate().fingerprint256)) reject(403, 'SERVICE_FORBIDDEN');
      return true;
    }
  }

  const { ReferenceController } = createCatalogReferencesControllers(database, RefsGuard);

  @Module({ controllers: [ReferenceController], providers: [RefsGuard] })
  class CatalogReferencesModule {}

  return CatalogReferencesModule;
}
