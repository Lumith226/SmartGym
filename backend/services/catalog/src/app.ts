import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Database } from './database.js';
import type { MediaStorage } from './modules/media/media-types.js';
import { ProblemFilter } from './catalog-problem-filter.js';
import { createCatalogHealthModule } from './modules/catalog-health.module.js';
import { createExerciseLibraryModule } from './modules/exercises/exercise-library.module.js';
import { createPublicMediaModule } from './modules/media/public-media.module.js';

export { ProblemFilter } from './catalog-problem-filter.js';

export async function createApp(database: Database, storage?: MediaStorage) {
  @Module({
    imports: [
      createCatalogHealthModule(database),
      createExerciseLibraryModule(database),
      createPublicMediaModule(database, storage),
    ],
  })
  class CatalogPublicModule {}

  const app = await NestFactory.create(CatalogPublicModule, { logger: false });
  app.useGlobalFilters(new ProblemFilter());
  return app;
}
