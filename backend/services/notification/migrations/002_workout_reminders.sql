ALTER TABLE delivery_jobs DROP CONSTRAINT delivery_jobs_channel_check;
ALTER TABLE delivery_jobs DROP CONSTRAINT delivery_jobs_purpose_check;
ALTER TABLE delivery_jobs DROP CONSTRAINT delivery_jobs_source_version_check;
ALTER TABLE delivery_jobs DROP CONSTRAINT delivery_jobs_source_ref_key;
ALTER TABLE delivery_jobs ADD COLUMN owner_user_id uuid;
ALTER TABLE delivery_jobs ADD CHECK(channel IN('EMAIL','IN_APP'));
ALTER TABLE delivery_jobs ADD CHECK(purpose IN('VERIFY_EMAIL','RESET_PASSWORD','WORKOUT_REMINDER'));
ALTER TABLE delivery_jobs ADD CHECK(source_version>0);
ALTER TABLE delivery_jobs ADD CHECK((purpose='WORKOUT_REMINDER' AND owner_user_id IS NOT NULL) OR
  (purpose IN('VERIFY_EMAIL','RESET_PASSWORD') AND owner_user_id IS NULL AND channel='EMAIL' AND source_version=1));
CREATE UNIQUE INDEX security_delivery_source ON delivery_jobs(source_ref) WHERE purpose IN('VERIFY_EMAIL','RESET_PASSWORD');
CREATE INDEX reminder_owner_jobs ON delivery_jobs(owner_user_id,source_ref) WHERE purpose='WORKOUT_REMINDER';
CREATE TABLE notification_preferences(
  user_id uuid PRIMARY KEY, reminder_in_app_enabled boolean NOT NULL DEFAULT true,
  reminder_email_enabled boolean NOT NULL DEFAULT false, lead_minutes integer NOT NULL DEFAULT 60 CHECK(lead_minutes BETWEEN 5 AND 1440),
  version integer NOT NULL DEFAULT 1 CHECK(version>0)
);
CREATE TABLE occurrence_projection(
  occurrence_id uuid PRIMARY KEY,owner_user_id uuid NOT NULL,version integer NOT NULL CHECK(version>0),
  status text NOT NULL CHECK(status IN('SCHEDULED','CANCELED')),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,
  time_zone text NOT NULL,updated_at timestamptz NOT NULL,CHECK(ends_at>starts_at)
);
CREATE INDEX notification_future_occurrences ON occurrence_projection(owner_user_id,starts_at) WHERE status='SCHEDULED';
CREATE TABLE notifications(
  id uuid PRIMARY KEY,user_id uuid NOT NULL,kind text NOT NULL CHECK(kind='WORKOUT_REMINDER'),
  occurrence_id uuid NOT NULL REFERENCES occurrence_projection(occurrence_id),source_ref uuid NOT NULL,source_version integer NOT NULL,
  render_data jsonb NOT NULL,created_at timestamptz NOT NULL,read_at timestamptz,
  UNIQUE(user_id,kind,source_ref,source_version),CHECK(source_ref=occurrence_id)
);
CREATE INDEX notifications_owner_page ON notifications(user_id,created_at DESC,id DESC);
CREATE INDEX notifications_owner_unread ON notifications(user_id,created_at DESC,id DESC) WHERE read_at IS NULL;
