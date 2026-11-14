CREATE TABLE notification_migrations(version integer PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE inbox_events(
  consumer text NOT NULL, event_id uuid NOT NULL, payload_hash text NOT NULL,
  received_at timestamptz NOT NULL, processed_at timestamptz NOT NULL, outcome text NOT NULL,
  PRIMARY KEY(consumer,event_id)
);
CREATE TABLE delivery_jobs(
  id uuid PRIMARY KEY, channel text NOT NULL CHECK(channel='EMAIL'), purpose text NOT NULL CHECK(purpose IN('VERIFY_EMAIL','RESET_PASSWORD')),
  source_ref uuid NOT NULL, source_version integer NOT NULL CHECK(source_version=1), expires_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL, status text NOT NULL CHECK(status IN('PENDING','CLAIMED','SENDING','RETRY','SENT','FAILED','CANCELED','UNKNOWN')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5), lease_token uuid, lease_until timestamptz,
  provider_ref text, provider_idempotency_key text NOT NULL UNIQUE, error_code text,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  UNIQUE(channel,purpose,source_ref,source_version), UNIQUE(source_ref),
  CHECK((lease_token IS NULL)=(lease_until IS NULL)),
  CHECK((status IN('CLAIMED','SENDING'))=(lease_token IS NOT NULL))
);
CREATE INDEX notification_jobs_due ON delivery_jobs(due_at) WHERE status IN('PENDING','RETRY');
CREATE INDEX notification_job_leases ON delivery_jobs(lease_until) WHERE status IN('CLAIMED','SENDING');
CREATE TABLE delivery_attempts(
  id uuid PRIMARY KEY, delivery_job_id uuid NOT NULL REFERENCES delivery_jobs(id),attempt_no integer NOT NULL,
  at timestamptz NOT NULL,outcome text NOT NULL,provider_receipt text,
  UNIQUE(delivery_job_id,attempt_no)
);
CREATE TABLE delivery_resolutions(
  id uuid PRIMARY KEY,delivery_job_id uuid NOT NULL REFERENCES delivery_jobs(id),actor_ref text NOT NULL,
  decision text NOT NULL CHECK(decision IN('CONFIRMED_SENT','CONFIRMED_NOT_SENT')),evidence_ref text NOT NULL,
  at timestamptz NOT NULL
);
