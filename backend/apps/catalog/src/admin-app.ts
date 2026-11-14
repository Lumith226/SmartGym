import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AdminConfig } from './modules/admin/admin-auth.js';
import { AdminCatalog } from './modules/exercises/admin-catalog.service.js';
import { AdminSupport } from './modules/content/admin-support.service.js';
import { AdminMedia } from './modules/media/admin-media.service.js';
import { AdminImports } from './modules/transfers/admin-imports.service.js';
import type { loadMediaConfig } from './modules/media/media-storage.js';
import type { Database } from './database.js';
import { ProblemFilter } from './catalog-problem-filter.js';
import { CatalogFeed } from './modules/feed/catalog-feed.service.js';
import { createAdminGuard } from './modules/admin/admin-guard.js';
import type { ResponseHeaders } from './modules/admin/admin-http.js';
import { AdminModule } from './admin-app.module.js';

export async function createAdminApp(database: Database, config: AdminConfig, mediaConfig?: ReturnType<typeof loadMediaConfig>) {
  const catalog = new AdminCatalog(database, mediaConfig?.publicOrigin);
  const support = new AdminSupport(database);
  const imports = new AdminImports(database, process.env.CATALOG_IMPORT_REGISTRY_FILE);
  const feed = new CatalogFeed(database);
  const media = mediaConfig ? new AdminMedia(database, mediaConfig.storage, mediaConfig.prefix) : undefined;
  const adminGuard = createAdminGuard(config);

  const appModule = AdminModule.register(database, catalog, support, media, imports, feed, adminGuard, config);

  const httpsOptions = { ...config.tls, requestCert: true, rejectUnauthorized: true, minVersion: 'TLSv1.2' as const };
  const app = await NestFactory.create<NestExpressApplication>(appModule, { logger: false, bodyParser: false, httpsOptions });
  app.use((_req: unknown, res: ResponseHeaders, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.useBodyParser('json', { limit: '512kb' });
  app.useGlobalFilters(new ProblemFilter());
  return app;
}
