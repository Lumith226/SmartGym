CREATE TABLE progress_migrations(version integer PRIMARY KEY,checksum text NOT NULL);
CREATE TABLE workout_logs(
 id uuid PRIMARY KEY,owner_user_id uuid NOT NULL,occurrence_id uuid,pose_result_id uuid,
 performed_at timestamptz(3) NOT NULL,duration_seconds integer CHECK(duration_seconds BETWEEN 1 AND 14400),
 notes text CHECK(length(notes)<=2000),source_type text NOT NULL CHECK(source_type IN ('MANUAL','OCCURRENCE','POSE')),
 source_snapshot jsonb NOT NULL,deleted_at timestamptz,version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz(3) NOT NULL DEFAULT now(),updated_at timestamptz(3) NOT NULL DEFAULT now(),
 CHECK((source_type='MANUAL' AND occurrence_id IS NULL AND pose_result_id IS NULL) OR
   (source_type='OCCURRENCE' AND occurrence_id IS NOT NULL AND pose_result_id IS NULL) OR (source_type='POSE' AND pose_result_id IS NOT NULL))
);
CREATE UNIQUE INDEX progress_occurrence_once ON workout_logs(owner_user_id,occurrence_id) WHERE occurrence_id IS NOT NULL;
CREATE UNIQUE INDEX progress_pose_once ON workout_logs(owner_user_id,pose_result_id) WHERE pose_result_id IS NOT NULL;
CREATE INDEX progress_owner_time ON workout_logs(owner_user_id,performed_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE TABLE log_exercises(
 id uuid PRIMARY KEY,log_id uuid NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
 exercise_id text NOT NULL CHECK(exercise_id~'^[a-z][a-z0-9_]{0,79}$'),
 title_snapshot text NOT NULL CHECK(length(title_snapshot) BETWEEN 1 AND 120),order_no integer NOT NULL CHECK(order_no BETWEEN 0 AND 199),
 UNIQUE(log_id,exercise_id),UNIQUE(log_id,order_no)
);
CREATE INDEX progress_exercise_filter ON log_exercises(exercise_id,log_id);
CREATE TABLE log_sets(
 id uuid PRIMARY KEY,log_exercise_id uuid NOT NULL REFERENCES log_exercises(id) ON DELETE CASCADE,
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 200),repetitions integer CHECK(repetitions BETWEEN 1 AND 500),
 duration_seconds integer CHECK(duration_seconds BETWEEN 1 AND 14400),weight_kg numeric CHECK(weight_kg BETWEEN 0 AND 1000),
 rpe integer CHECK(rpe BETWEEN 1 AND 10),CHECK(repetitions IS NOT NULL OR duration_seconds IS NOT NULL),
 UNIQUE(log_exercise_id,ordinal)
);
CREATE TABLE progress_idempotency(
 owner_user_id uuid NOT NULL,operation text NOT NULL DEFAULT 'log:create',key text NOT NULL,
 fingerprint text NOT NULL,log_id uuid NOT NULL REFERENCES workout_logs(id),response jsonb,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',PRIMARY KEY(owner_user_id,operation,key)
);
CREATE INDEX progress_receipt_expiry ON progress_idempotency(expires_at);
