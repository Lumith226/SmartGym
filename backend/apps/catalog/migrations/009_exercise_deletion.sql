-- Keep historical revisions, slugs and audit records while removing archived exercises from the CMS.
ALTER TABLE exercises ADD COLUMN deleted_at timestamptz;
ALTER TABLE exercises ADD CONSTRAINT deleted_exercise_is_archived CHECK (
  deleted_at IS NULL OR (lifecycle = 'ARCHIVED' AND current_published_version IS NULL)
);
