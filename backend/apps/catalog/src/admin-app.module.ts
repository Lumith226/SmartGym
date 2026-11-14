import { Module, type CanActivate, type DynamicModule, type Type } from '@nestjs/common';
import type { AdminConfig } from './modules/admin/admin-auth.js';
import type { AdminCatalog } from './modules/exercises/admin-catalog.service.js';
import type { AdminSupport } from './modules/content/admin-support.service.js';
import type { AdminMedia } from './modules/media/admin-media.service.js';
import type { AdminImports } from './modules/transfers/admin-imports.service.js';
import type { Database } from './database.js';
import type { CatalogFeed } from './modules/feed/catalog-feed.service.js';
import { createCatalogTransfersModule } from './modules/transfers/catalog-transfers.module.js';
import { createAdminExercisesModule } from './modules/exercises/admin-exercises.module.js';
import { createAdminContentModule } from './modules/content/admin-content.module.js';
import { createAdminRevisionsModule } from './modules/revisions/admin-revisions.module.js';
import { createAdminMediaModule } from './modules/media/admin-media.module.js';
import { createCatalogReferencesModule } from './modules/exercises/catalog-references.module.js';
import { createCatalogFeedModule } from './modules/feed/catalog-feed.module.js';
import { createPoseExerciseLinksModule } from './modules/exercises/pose-exercise-links.module.js';

@Module({})
export class AdminModule {
  static register(database: Database, catalog: AdminCatalog, support: AdminSupport, media: AdminMedia | undefined, imports: AdminImports, feed: CatalogFeed, adminGuard: Type<CanActivate>, config: AdminConfig): DynamicModule {
    return {
      module: AdminModule,
      imports: [
        createCatalogTransfersModule(imports, adminGuard),
        createAdminExercisesModule(catalog, adminGuard),
        createPoseExerciseLinksModule(database, adminGuard),
        createAdminContentModule(support, adminGuard),
        createAdminRevisionsModule(catalog, support, adminGuard),
        createAdminMediaModule(media, adminGuard),
        createCatalogReferencesModule(database, config),
        createCatalogFeedModule(feed, config),
      ],
    };
  }
}
