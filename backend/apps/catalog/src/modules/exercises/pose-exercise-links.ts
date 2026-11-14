import type { SqlClient } from '../../database.js';

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
