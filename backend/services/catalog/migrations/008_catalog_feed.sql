ALTER TABLE publication_revisions ADD COLUMN reason text CHECK(reason IN('ARCHIVED','WITHDRAWN'));
UPDATE publication_revisions p SET reason=o.payload->'data'->>'reason' FROM outbox_events o
  WHERE o.aggregate_version=p.aggregate_version AND p.action='catalog.exercise.unpublished.v1'
    AND o.payload->'data'->>'reason' IN('ARCHIVED','WITHDRAWN');
UPDATE publication_revisions SET reason='ARCHIVED' WHERE action='catalog.exercise.unpublished.v1' AND reason IS NULL;
ALTER TABLE outbox_events ADD COLUMN lease_token uuid,ADD COLUMN lease_until timestamptz,ADD COLUMN error_code text;
ALTER TABLE outbox_events ADD CONSTRAINT catalog_outbox_lease_pair CHECK((lease_token IS NULL)=(lease_until IS NULL));
CREATE INDEX catalog_outbox_lease ON outbox_events(lease_until) WHERE status='PENDING';
CREATE TABLE catalog_feed_snapshots(
  revision text PRIMARY KEY REFERENCES publication_revisions(revision),
  publication jsonb NOT NULL CHECK(jsonb_typeof(publication)='object'),
  sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days'
);
CREATE TRIGGER catalog_feed_immutable BEFORE UPDATE ON catalog_feed_snapshots
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_catalog_audit_changes();
