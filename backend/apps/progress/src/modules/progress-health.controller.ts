import { CanActivate, Controller, Get, UseGuards, type Type } from '@nestjs/common';
import type { Database } from '../database.js';
import { reject } from '../contract.js';

export function createProgressHealthControllers(db: Database, ProbeGuard: Type<CanActivate>) {
  @Controller('health') @UseGuards(ProbeGuard)
  class Health{
    @Get('live')live(){return {status:'alive'};}
    @Get('ready')async ready(){if(!(await db.query('SELECT 1 FROM progress_migrations WHERE version=1')).rows.length)reject(503,'MIGRATION_REQUIRED');return {status:'ready'};}
  }

  return { Health };
}
