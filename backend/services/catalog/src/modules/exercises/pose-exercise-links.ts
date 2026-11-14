import { Body, Controller, Get, Module, Put, Req, UseGuards, type CanActivate, type Type } from '@nestjs/common';
import type { Database, SqlClient } from '../../database.js';
import type { AdminRequest } from '../admin/admin-auth.js';
import { reject } from '../admin/admin-contract.js';
import { bodyOf } from '../admin/admin-http.js';

export async function listPoseLinks(db: SqlClient, publicOnly: boolean) {
  const { rows } = await db.query<{ poseId: string; exerciseId: string | null; nameVi: string; slug: string; published: boolean; enabled: boolean }>(
    `SELECT l.pose_id AS "poseId", l.exercise_id AS "exerciseId",
            COALESCE(r.document->>'nameVi', '') AS "nameVi",
            COALESCE(r.document->>'slug', '') AS slug,
            COALESCE(e.lifecycle = 'PUBLISHED', false) AS published,
            COALESCE(l.enabled, true) AS enabled
     FROM catalog_pose_exercise_links l
     LEFT JOIN exercises e ON e.id = l.exercise_id AND e.deleted_at IS NULL
     LEFT JOIN LATERAL (
       SELECT document FROM exercise_revisions
       WHERE exercise_id = e.id
       ORDER BY (version = e.current_published_version) DESC NULLS LAST, version DESC LIMIT 1
     ) r ON true
     ORDER BY l.pose_id`,
  );
  return { items: rows };
}

export function createPoseExerciseLinksModule(db: Database, AdminGuard: Type<CanActivate>) {
  @Controller('api/v1/admin/pose-exercise-links')
  @UseGuards(AdminGuard)
  class PoseLinksController {
    @Get()
    list() { return listPoseLinks(db, false); }

    @Put()
    async set(@Req() request: AdminRequest, @Body() body: unknown) {
      const { poseId, exerciseId, enabled } = bodyOf<{ poseId: string; exerciseId?: string | null; enabled?: boolean }>('PoseExerciseLinkUpdate', body);
      return db.transaction(async client => {
        // Đảm bảo bản ghi tồn tại
        await client.query(
          `INSERT INTO catalog_pose_exercise_links(pose_id, enabled, updated_by)
           VALUES($1, true, $2) ON CONFLICT (pose_id) DO NOTHING`,
          [poseId, request.actor],
        );

        if (enabled !== undefined) {
          await client.query(
            `UPDATE catalog_pose_exercise_links
             SET enabled = $2, updated_by = $3, updated_at = now()
             WHERE pose_id = $1`,
            [poseId, enabled, request.actor],
          );
        }

        if (exerciseId !== undefined) {
          if (exerciseId === null) {
            await client.query(
              `UPDATE catalog_pose_exercise_links
               SET exercise_id = NULL, updated_by = $2, updated_at = now()
               WHERE pose_id = $1`,
              [poseId, request.actor],
            );
          } else {
            const target = await client.query(
              "SELECT id FROM exercises WHERE id=$1 AND lifecycle='PUBLISHED' AND deleted_at IS NULL FOR UPDATE", [exerciseId],
            );
            if (!target.rows.length) reject(409, 'POSE_LINK_EXERCISE_NOT_PUBLIC');
            try {
              await client.query(
                `UPDATE catalog_pose_exercise_links
                 SET exercise_id = $2, updated_by = $3, updated_at = now()
                 WHERE pose_id = $1`,
                [poseId, exerciseId, request.actor],
              );
            } catch (error) {
              if ((error as { code?: string; constraint?: string })?.code === '23505' &&
                  (error as { constraint?: string }).constraint === 'catalog_pose_exercise_links_exercise_id_key') {
                reject(409, 'POSE_LINK_EXERCISE_IN_USE');
              }
              throw error;
            }
          }
        }

        return listPoseLinks(client, false);
      });
    }
  }
  @Module({ controllers: [PoseLinksController], providers: [AdminGuard] })
  class PoseExerciseLinksModule {}
  return PoseExerciseLinksModule;
}
