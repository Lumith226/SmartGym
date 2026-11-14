ALTER TABLE catalog_audit ADD COLUMN source_version integer CHECK (source_version > 0);
CREATE INDEX catalog_audit_revision ON catalog_audit(content_type,content_id,after_version,sequence DESC);

CREATE FUNCTION prevent_exercise_revision_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Exercise revisions are append-only';
END;
$$;
CREATE TRIGGER exercise_revisions_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON exercise_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_exercise_revision_changes();
