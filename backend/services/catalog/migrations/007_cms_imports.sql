-- Keep bootstrap catalog_imports intact; CMS jobs are a separate audited workflow.
CREATE TABLE catalog_import_jobs (
  id text PRIMARY KEY,
  source_key text NOT NULL CHECK (source_key='SMARTGYM_KB'),
  source_revision text NOT NULL,
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('READY','REJECTED','APPLIED')),
  package jsonb NOT NULL,
  base_versions jsonb NOT NULL,
  base_digest text NOT NULL,
  accepted_count integer NOT NULL CHECK (accepted_count>=0),
  error_count integer NOT NULL CHECK (error_count>=0),
  report jsonb NOT NULL,
  edit_version integer NOT NULL DEFAULT 1 CHECK (edit_version>0),
  actor_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  UNIQUE(source_key,source_revision,manifest_sha256)
);
CREATE TABLE catalog_exports (
  revision text PRIMARY KEY REFERENCES publication_revisions(revision),
  publication jsonb NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days'
);
CREATE TRIGGER catalog_exports_immutable BEFORE UPDATE ON catalog_exports
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_catalog_audit_changes();
