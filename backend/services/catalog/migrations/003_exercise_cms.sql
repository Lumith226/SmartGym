ALTER TABLE exercises ADD COLUMN edit_version integer NOT NULL DEFAULT 1 CHECK (edit_version > 0);
ALTER TABLE exercises ADD COLUMN current_draft_version integer;
ALTER TABLE exercises ADD COLUMN published_from_version integer;
ALTER TABLE exercises ADD COLUMN created_by uuid;
ALTER TABLE exercises ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE exercises ADD FOREIGN KEY (id,current_draft_version) REFERENCES exercise_revisions(exercise_id,version);
ALTER TABLE exercises ADD FOREIGN KEY (id,published_from_version) REFERENCES exercise_revisions(exercise_id,version);
ALTER TABLE exercise_revisions ADD COLUMN author uuid;
ALTER TABLE exercise_revisions ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE publication_revisions ADD COLUMN exercise_id text REFERENCES exercises(id);
ALTER TABLE publication_revisions ADD COLUMN entity_version integer;
ALTER TABLE publication_revisions ADD COLUMN action text;
ALTER TABLE publication_revisions ADD COLUMN actor uuid;

CREATE TABLE catalog_audit (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id uuid NOT NULL UNIQUE,
  actor_id uuid NOT NULL,
  content_type text NOT NULL,
  content_id text NOT NULL,
  action text NOT NULL,
  revision text NOT NULL,
  before_version integer,
  after_version integer NOT NULL,
  reason text,
  correlation_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX catalog_audit_entity ON catalog_audit(content_type,content_id,sequence DESC);
CREATE INDEX catalog_audit_actor ON catalog_audit(actor_id,sequence DESC);
CREATE FUNCTION prevent_catalog_audit_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Catalog audit is append-only';
END;
$$;
CREATE TRIGGER catalog_audit_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON catalog_audit
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_catalog_audit_changes();

CREATE TABLE outbox_events (
  event_id uuid PRIMARY KEY,
  type text NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  aggregate_id text NOT NULL DEFAULT 'catalog',
  aggregate_version bigint NOT NULL UNIQUE REFERENCES publication_revisions(aggregate_version),
  occurred_at timestamptz NOT NULL,
  correlation_id uuid NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PUBLISHED')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX catalog_outbox_pending ON outbox_events(available_at) WHERE status='PENDING';

CREATE TABLE idempotency_keys (
  owner_user_id uuid NOT NULL,
  operation text NOT NULL,
  key text NOT NULL,
  request_fingerprint text NOT NULL,
  response jsonb,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  PRIMARY KEY (owner_user_id,operation,key)
);
CREATE INDEX catalog_idempotency_expiry ON idempotency_keys(expires_at);
