import { Module, type CanActivate, type Type } from '@nestjs/common';
import { AdminCatalog } from '../exercises/admin-catalog.service.js';
import { AdminSupport } from '../content/admin-support.service.js';
import { createAdminRevisionsControllers } from './admin-revisions.controller.js';

export function createAdminRevisionsModule(catalog: AdminCatalog, support: AdminSupport, AdminGuard: Type<CanActivate>) {
  const { AdminRevisionsController } = createAdminRevisionsControllers(AdminGuard);

  @Module({ controllers: [AdminRevisionsController], providers: [AdminGuard, { provide: AdminCatalog, useValue: catalog }, { provide: AdminSupport, useValue: support }] })
  class AdminRevisionsModule {}

  return AdminRevisionsModule;
}
