import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { Database } from './database.js';
import type { MediaStorage } from './modules/media/media-types.js';
import { ProblemFilter } from './catalog-problem-filter.js';
import { CatalogPublicModule } from './app.module.js';

export { ProblemFilter } from './catalog-problem-filter.js';

export async function createApp(database: Database, storage?: MediaStorage) {
  const appModule = CatalogPublicModule.register(database, storage);

  const app = await NestFactory.create(appModule, { logger: false });
  app.useGlobalFilters(new ProblemFilter());
  return app;
}
