import { Controller, Module, UseGuards, Body, Post, HttpCode, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { AdminConfig, AdminRequest } from '../admin/admin-auth.js';
import { reject } from '../admin/admin-contract.js';
import type { Database } from '../../database.js';
import { bodyOf } from '../admin/admin-http.js';

export function createCatalogReferencesModule(database: Database, config: AdminConfig) {
  class RefsGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest<AdminRequest>();
      if (!req.socket.encrypted || !req.socket.authorized) reject(401, 'SERVICE_UNAUTHENTICATED');
      if (!config.refFingerprints?.includes(req.socket.getPeerCertificate().fingerprint256)) reject(403, 'SERVICE_FORBIDDEN');
      return true;
    }
  }

  @Controller('internal/v1/catalog')
  @UseGuards(RefsGuard)
  class ReferenceController {
    @Post('exercise-refs')
    @HttpCode(200)
    async refs(@Body() value: unknown) {
      const { exerciseIds } = bodyOf<{ exerciseIds: string[] }>('ExerciseRefBatch', value);
      const { rows } = await database.query<{ id: string; name: string }>(`SELECT e.id,r.document->>'nameVi' AS name FROM exercises e
        JOIN exercise_revisions r ON r.exercise_id=e.id AND r.version=e.current_published_version
        WHERE e.id=ANY($1::text[]) AND e.lifecycle='PUBLISHED'`, [exerciseIds]);
      const found = new Map(rows.map(row => [row.id, row.name]));
      return { items: exerciseIds.map(exerciseId => ({ exerciseId, available: found.has(exerciseId),
        ...(found.has(exerciseId) ? { nameVi: found.get(exerciseId) } : {}) })) };
    }
  }

  @Module({ controllers: [ReferenceController], providers: [RefsGuard] })
  class CatalogReferencesModule {}

  return CatalogReferencesModule;
}
