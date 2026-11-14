import { Module } from '@nestjs/common';
import type { Database } from '../../database.js';
import { ExerciseLibraryController } from './exercise-library.controller.js';
import { ExerciseLibraryService } from './exercise-library.service.js';

export function createExerciseLibraryModule(database: Database) {
  @Module({ controllers: [ExerciseLibraryController], providers: [ExerciseLibraryService, { provide: 'DATABASE', useValue: database }] })
  class ExerciseLibraryModule {}

  return ExerciseLibraryModule;
}
