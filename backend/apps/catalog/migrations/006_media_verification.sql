ALTER TABLE media_uploads
  ADD COLUMN verified_at timestamptz,
  ADD COLUMN width integer CHECK (width > 0),
  ADD COLUMN height integer CHECK (height > 0),
  ADD COLUMN duration_ms integer CHECK (duration_ms BETWEEN 1 AND 120000),
  ADD COLUMN verify_after timestamptz,
  ADD COLUMN lease_token uuid,
  ADD COLUMN lease_until timestamptz,
  ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN cleanup_after timestamptz,
  ADD COLUMN purged_at timestamptz;

CREATE INDEX media_uploads_verify ON media_uploads(verify_after,id) WHERE status='VERIFYING';
CREATE INDEX media_uploads_cleanup ON media_uploads(expires_at,id) WHERE purged_at IS NULL;
CREATE INDEX support_revisions_upload ON support_revisions(upload_id) WHERE upload_id IS NOT NULL;

-- Metadata-only READY rows from before the verifier require byte-level verification.
UPDATE media_uploads SET status='VERIFYING',verify_after=now() WHERE status='READY';
