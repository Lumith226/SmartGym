import { Module, type DynamicModule } from '@nestjs/common';
import type { Database } from './database.js';
import type { MediaStorage } from './modules/media/media-types.js';
import { createCatalogHealthModule } from './modules/catalog-health.module.js';
import { createExerciseLibraryModule } from './modules/exercises/exercise-library.module.js';
import { createPublicMediaModule } from './modules/media/public-media.module.js';

@Module({})
export class CatalogPublicModule {
  static register(database: Database, storage?: MediaStorage): DynamicModule {
    return {
      module: CatalogPublicModule,
      imports: [
        createCatalogHealthModule(database),
        createExerciseLibraryModule(database),
        createPublicMediaModule(database, storage),
      ],
    };
  }
}
