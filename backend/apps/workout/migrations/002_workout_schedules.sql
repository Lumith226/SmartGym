CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE workout_idempotency ADD COLUMN operation text NOT NULL DEFAULT 'plan:create';
ALTER TABLE workout_idempotency DROP CONSTRAINT workout_idempotency_pkey;
ALTER TABLE workout_idempotency ADD PRIMARY KEY(owner_user_id,operation,key);
CREATE TABLE workout_schedules(
 id uuid PRIMARY KEY,owner_user_id uuid NOT NULL,plan_id uuid NOT NULL REFERENCES workout_plans(id),
 mode text NOT NULL CHECK(mode IN ('ONCE','WEEKLY')),time_zone text NOT NULL,
 start_date date NOT NULL,end_date date,local_start time NOT NULL,duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 5 AND 240),
 weekdays integer[],status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CANCELED')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),plan_snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_date IS NULL OR end_date>=start_date),
 CHECK((mode='ONCE' AND weekdays IS NULL AND end_date IS NULL) OR
   (mode='WEEKLY' AND weekdays IS NOT NULL AND cardinality(weekdays) BETWEEN 1 AND 7 AND weekdays<@ARRAY[1,2,3,4,5,6,7]))
);
CREATE INDEX workout_schedule_owner ON workout_schedules(owner_user_id,status,id);
CREATE INDEX workout_schedule_plan ON workout_schedules(plan_id) WHERE status='ACTIVE';
CREATE TABLE workout_occurrences(
 id uuid PRIMARY KEY,owner_user_id uuid NOT NULL,schedule_id uuid NOT NULL REFERENCES workout_schedules(id),
 occurrence_key text NOT NULL,local_date date NOT NULL,starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,
 time_zone text NOT NULL,status text NOT NULL CHECK(status IN ('SCHEDULED','CANCELED')),
 plan_snapshot jsonb NOT NULL,version integer NOT NULL DEFAULT 1 CHECK(version>0),overridden boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(schedule_id,occurrence_key),CHECK(starts_at<ends_at),
 CONSTRAINT workout_no_overlap EXCLUDE USING gist(owner_user_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE(status='SCHEDULED')
);
CREATE INDEX workout_occurrence_owner ON workout_occurrences(owner_user_id,starts_at,id);
CREATE TABLE schedule_conflicts(
 schedule_id uuid NOT NULL REFERENCES workout_schedules(id),occurrence_key text NOT NULL,local_date date NOT NULL,
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,code text NOT NULL CHECK(code='SCHEDULE_OVERLAP'),
 detected_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(schedule_id,occurrence_key)
);
CREATE TABLE outbox_events(
 event_id uuid PRIMARY KEY,type text NOT NULL,schema_version integer NOT NULL,aggregate_id uuid NOT NULL,aggregate_version integer NOT NULL,
 occurred_at timestamptz NOT NULL,correlation_id uuid NOT NULL,payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PUBLISHED')),attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),published_at timestamptz,lease_token uuid,lease_until timestamptz,error_code text,
 UNIQUE(type,aggregate_id,aggregate_version)
);
CREATE INDEX workout_outbox_pending ON outbox_events(available_at,event_id) WHERE status='PENDING';
