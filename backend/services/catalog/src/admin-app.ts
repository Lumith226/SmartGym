import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AdminConfig } from './modules/admin/admin-auth.js';
import { AdminCatalog } from './modules/exercises/admin-catalog.js';
import { AdminSupport } from './modules/content/admin-support.js';
import { AdminMedia } from './modules/media/admin-media.js';
import { AdminImports } from './modules/transfers/admin-imports.js';
import type { loadMediaConfig } from './modules/media/media-storage.js';
import type { Database } from './database.js';
import { ProblemFilter } from './catalog-problem-filter.js';
import { CatalogFeed } from './modules/feed/feed.js';
import { createAdminGuard } from './modules/admin/admin-guard.js';
import type { ResponseHeaders } from './modules/admin/admin-http.js';
import { createCatalogTransfersModule } from './modules/transfers/catalog-transfers.module.js';
import { createAdminExercisesModule } from './modules/exercises/admin-exercises.module.js';
import { createAdminContentModule } from './modules/content/admin-content.module.js';
import { createAdminRevisionsModule } from './modules/revisions/admin-revisions.module.js';
import { createAdminMediaModule } from './modules/media/admin-media.module.js';
import { createCatalogReferencesModule } from './modules/exercises/catalog-references.module.js';
import { createCatalogFeedModule } from './modules/feed/catalog-feed.module.js';

export async function createAdminApp(database: Database, config: AdminConfig, mediaConfig?: ReturnType<typeof loadMediaConfig>) {
  const catalog = new AdminCatalog(database, mediaConfig?.publicOrigin);
  const support = new AdminSupport(database);
  const imports = new AdminImports(database, process.env.CATALOG_IMPORT_REGISTRY_FILE);
  const feed = new CatalogFeed(database);
  const media = mediaConfig ? new AdminMedia(database, mediaConfig.storage, mediaConfig.prefix) : undefined;
  const adminGuard = createAdminGuard(config);

  @Module({
    imports: [
      createCatalogTransfersModule(imports, adminGuard),
      createAdminExercisesModule(catalog, adminGuard),
      createAdminContentModule(support, adminGuard),
      createAdminRevisionsModule(catalog, support, adminGuard),
      createAdminMediaModule(media, adminGuard),
      createCatalogReferencesModule(database, config),
      createCatalogFeedModule(feed, config),
    ],
  })
  class AdminModule {}

  const httpsOptions = { ...config.tls, requestCert: true, rejectUnauthorized: true, minVersion: 'TLSv1.2' as const };
  const app = await NestFactory.create<NestExpressApplication>(AdminModule, { logger: false, bodyParser: false, httpsOptions });
  app.use((_req: unknown, res: ResponseHeaders, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.useBodyParser('json', { limit: '512kb' });
  app.useGlobalFilters(new ProblemFilter());
  return app;
}
