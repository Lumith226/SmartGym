import { Module, type CanActivate, type Type } from '@nestjs/common';
import { AdminMedia } from './admin-media.service.js';
import { createAdminMediaControllers } from './admin-media.controller.js';

export function createAdminMediaModule(media: AdminMedia | undefined, AdminGuard: Type<CanActivate>) {
  const { AdminMediaController } = createAdminMediaControllers(AdminGuard);

  @Module({ controllers: [AdminMediaController], providers: [AdminGuard, { provide: AdminMedia, useValue: media ?? null }] })
  class AdminMediaModule {}

  return AdminMediaModule;
}
