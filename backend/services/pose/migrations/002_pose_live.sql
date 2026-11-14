CREATE TABLE pose_live_sessions(
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,exercise_id text NOT NULL,model_sha256 text NOT NULL,
 config_version text NOT NULL,consent_version text NOT NULL,
 status text NOT NULL CHECK(status IN ('READY','ACTIVE','COMPLETED','FAILED','EXPIRED')),
 connection_token uuid,lease_until timestamptz,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,
 CHECK((status='ACTIVE')=(connection_token IS NOT NULL)),CHECK((connection_token IS NULL)=(lease_until IS NULL))
);
CREATE UNIQUE INDEX pose_live_owner_open ON pose_live_sessions(owner_id) WHERE status IN ('READY','ACTIVE');
CREATE INDEX pose_live_active_lease ON pose_live_sessions(lease_until) WHERE status='ACTIVE';
ALTER TABLE pose_results ALTER COLUMN job_id DROP NOT NULL, ALTER COLUMN raw_model_result DROP NOT NULL,
 ADD COLUMN live_session_id uuid UNIQUE REFERENCES pose_live_sessions(id),
 ADD CONSTRAINT pose_result_one_source CHECK ((job_id IS NULL) <> (live_session_id IS NULL)),
 ADD CONSTRAINT pose_upload_result_has_raw CHECK(job_id IS NULL OR raw_model_result IS NOT NULL);
