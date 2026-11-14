import { CanActivate, Controller, Get, Module, UseGuards, type Type } from '@nestjs/common';
import { reject } from '../contract.js';
import type { Database } from '../database.js';

export function createWorkoutHealthModule(db: Database, ProbeGuard: Type<CanActivate>) {
  @Controller('health')
  @UseGuards(ProbeGuard)
  class Health {
    @Get('live') live() { return { status: 'alive' }; }
    @Get('ready') async ready() {
      const result = await db.query('SELECT 1 FROM workout_migrations WHERE version=3');
      if (!result.rows.length) reject(503, 'MIGRATION_REQUIRED');
      return { status: 'ready' };
    }
  }

  @Module({ controllers: [Health], providers: [ProbeGuard] })
  class WorkoutHealthModule {}

  return WorkoutHealthModule;
}
