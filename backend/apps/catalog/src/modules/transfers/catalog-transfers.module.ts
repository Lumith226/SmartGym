import { Module, type CanActivate, type Type } from '@nestjs/common';
import { AdminImports } from './admin-imports.service.js';
import { createCatalogTransfersControllers } from './catalog-transfers.controller.js';

export function createCatalogTransfersModule(imports: AdminImports, AdminGuard: Type<CanActivate>) {
  const { CatalogTransfersController } = createCatalogTransfersControllers(imports, AdminGuard);

  @Module({ controllers: [CatalogTransfersController], providers: [AdminGuard, { provide: AdminImports, useValue: imports }] })
  class CatalogTransfersModule {}

  return CatalogTransfersModule;
}
