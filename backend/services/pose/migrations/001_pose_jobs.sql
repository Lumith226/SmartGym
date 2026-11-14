CREATE TABLE pose_migrations(version integer PRIMARY KEY,checksum text NOT NULL);
CREATE TABLE pose_uploads(
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,object_key text NOT NULL UNIQUE,object_version text,
 sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 104857600),
 mime text NOT NULL CHECK(mime IN ('video/mp4','video/webm')),consent_version text NOT NULL,
 put_expires_at timestamptz NOT NULL,raw_expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz,cleanup_token uuid,cleanup_until timestamptz
);
CREATE TABLE pose_jobs(
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,upload_id uuid NOT NULL UNIQUE REFERENCES pose_uploads(id),
 exercise_id text NOT NULL,model_sha256 text NOT NULL,config_version text NOT NULL,consent_version text NOT NULL,
 status text NOT NULL CHECK(status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELED')),
 attempts integer NOT NULL DEFAULT 0,claim_token uuid,lease_until timestamptz,dispatched_at timestamptz,
 available_at timestamptz NOT NULL DEFAULT now(),error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,
 CHECK((status='RUNNING')=(claim_token IS NOT NULL)), CHECK((claim_token IS NULL)=(lease_until IS NULL))
);
CREATE INDEX pose_queue ON pose_jobs(available_at,created_at) WHERE status='QUEUED';
CREATE INDEX pose_owner ON pose_jobs(owner_id,created_at);
CREATE TABLE pose_dedupe(
 owner_id uuid NOT NULL,source_sha256 text NOT NULL,exercise_id text NOT NULL,model_sha256 text NOT NULL,consent_version text NOT NULL,
 job_id uuid NOT NULL REFERENCES pose_jobs(id),expires_at timestamptz NOT NULL,
 PRIMARY KEY(owner_id,source_sha256,exercise_id,model_sha256,consent_version)
);
CREATE TABLE pose_results(
 id uuid PRIMARY KEY,job_id uuid NOT NULL UNIQUE REFERENCES pose_jobs(id),owner_id uuid NOT NULL,
 summary jsonb NOT NULL,raw_model_result jsonb NOT NULL,source_sha256 text NOT NULL,model_sha256 text NOT NULL,
 schema_version text NOT NULL,completed_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL
);
CREATE FUNCTION pose_result_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Pose results are immutable'; END; $$;
CREATE TRIGGER pose_result_immutable BEFORE UPDATE ON pose_results FOR EACH STATEMENT EXECUTE FUNCTION pose_result_immutable();
CREATE TABLE pose_idempotency(
 owner_id uuid NOT NULL,operation text NOT NULL,key text NOT NULL,fingerprint text NOT NULL,response jsonb,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',PRIMARY KEY(owner_id,operation,key)
);
