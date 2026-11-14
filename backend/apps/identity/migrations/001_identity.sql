CREATE TABLE identity_migrations(version integer PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE users(
  id uuid PRIMARY KEY, email text NOT NULL, email_normalized text NOT NULL UNIQUE,
  display_name text NOT NULL CHECK(length(btrim(display_name)) BETWEEN 1 AND 120),
  time_zone text NOT NULL DEFAULT 'Asia/Bangkok', role text NOT NULL DEFAULT 'USER' CHECK(role IN ('USER','ADMIN')),
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACTIVE','DISABLED')),
  email_verified_at timestamptz, version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  CHECK(email_normalized=lower(email_normalized)), CHECK(status<>'ACTIVE' OR email_verified_at IS NOT NULL)
);
CREATE INDEX users_status_role ON users(status,role);
CREATE TABLE credentials(
  user_id uuid PRIMARY KEY REFERENCES users(id), password_hash text NOT NULL,
  password_changed_at timestamptz NOT NULL, credential_version integer NOT NULL DEFAULT 1 CHECK(credential_version>0)
);
CREATE TABLE sessions(
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), secret_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL, created_at timestamptz NOT NULL,
  revoked_at timestamptz, credential_version integer NOT NULL,
  CHECK(expires_at>created_at), CHECK(last_seen_at>=created_at)
);
CREATE INDEX sessions_owner_active ON sessions(user_id,expires_at) WHERE revoked_at IS NULL;
CREATE TABLE email_actions(
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), purpose text NOT NULL CHECK(purpose IN ('VERIFY_EMAIL','RESET_PASSWORD')),
  token_hash text NOT NULL UNIQUE, encrypted_delivery_secret text, expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL, used_at timestamptz, superseded_at timestamptz,
  CHECK(expires_at>created_at), CHECK((used_at IS NULL AND superseded_at IS NULL) OR encrypted_delivery_secret IS NULL)
);
CREATE INDEX email_actions_owner_purpose ON email_actions(user_id,purpose);
CREATE INDEX email_actions_expiry ON email_actions(expires_at) WHERE encrypted_delivery_secret IS NOT NULL;
CREATE TABLE outbox_events(
  event_id uuid PRIMARY KEY, type text NOT NULL, schema_version integer NOT NULL,
  aggregate_id uuid NOT NULL, aggregate_version integer NOT NULL, occurred_at timestamptz NOT NULL,
  correlation_id uuid NOT NULL, payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PUBLISHED')),
  attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL, published_at timestamptz
);
CREATE INDEX identity_outbox_pending ON outbox_events(available_at) WHERE status='PENDING';
CREATE TABLE identity_audit(
  id uuid PRIMARY KEY, actor_id uuid, target_user_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL, outcome text NOT NULL, version integer NOT NULL, at timestamptz NOT NULL, correlation_id uuid NOT NULL
);
CREATE INDEX identity_audit_target ON identity_audit(target_user_id,at);
CREATE TABLE identity_rate_limits(
  bucket_hash text PRIMARY KEY, window_started_at timestamptz NOT NULL, hits integer NOT NULL CHECK(hits>0)
);
CREATE INDEX identity_rate_limits_expiry ON identity_rate_limits(window_started_at);
