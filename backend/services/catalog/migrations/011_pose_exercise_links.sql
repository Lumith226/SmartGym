CREATE TABLE catalog_pose_exercise_links (
  pose_id text PRIMARY KEY CHECK (pose_id ~ '^[a-z][a-z0-9_]{0,63}$'),
  exercise_id text NOT NULL UNIQUE REFERENCES exercises(id) ON DELETE CASCADE,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

WITH legacy(pose_id, catalog_id) AS (
  VALUES ('squat','bodyweight_squat'), ('push_up','push_up'),
         ('jump_jack','jumping_jacks'), ('situp','reverse_crunch')
)
INSERT INTO catalog_pose_exercise_links (pose_id, exercise_id)
SELECT legacy.pose_id, candidate.id
FROM legacy CROSS JOIN LATERAL (
  SELECT id FROM exercises
  WHERE id IN (legacy.catalog_id, 'repdb_' || legacy.catalog_id)
    AND lifecycle = 'PUBLISHED' AND deleted_at IS NULL
  ORDER BY (id = legacy.catalog_id) DESC
  LIMIT 1
) candidate;
