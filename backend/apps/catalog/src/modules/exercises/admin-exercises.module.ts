import { Module, type CanActivate, type Type } from '@nestjs/common';
import { AdminCatalog } from './admin-catalog.service.js';
import { createAdminExercisesControllers } from './admin-exercises.controller.js';

export function createAdminExercisesModule(catalog: AdminCatalog, AdminGuard: Type<CanActivate>) {
  const { AdminExercisesController } = createAdminExercisesControllers(AdminGuard);

  @Module({ controllers: [AdminExercisesController], providers: [AdminGuard, { provide: AdminCatalog, useValue: catalog }] })
  class AdminExercisesModule {}

  return AdminExercisesModule;
}
