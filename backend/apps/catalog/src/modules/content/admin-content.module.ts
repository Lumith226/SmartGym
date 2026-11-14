import { Module, type CanActivate, type Type } from '@nestjs/common';
import { AdminSupport } from './admin-support.service.js';
import { createAdminContentControllers } from './admin-content.controller.js';

export function createAdminContentModule(support: AdminSupport, AdminGuard: Type<CanActivate>) {
  const { AdminContentController } = createAdminContentControllers(AdminGuard);

  @Module({ controllers: [AdminContentController], providers: [AdminGuard, { provide: AdminSupport, useValue: support }] })
  class AdminContentModule {}

  return AdminContentModule;
}
