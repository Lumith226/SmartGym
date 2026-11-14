CREATE TABLE workout_migrations(version integer PRIMARY KEY,checksum text NOT NULL);
CREATE TABLE workout_plans(
 id uuid PRIMARY KEY,owner_user_id uuid NOT NULL,title text NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
 description text CHECK(length(description)<=500),status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ARCHIVED')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workout_owner ON workout_plans(owner_user_id,status,id);
CREATE TABLE workout_plan_items(
 id uuid PRIMARY KEY,plan_id uuid NOT NULL REFERENCES workout_plans(id),sort_order integer NOT NULL CHECK(sort_order BETWEEN 0 AND 39),
 exercise_id text NOT NULL CHECK(exercise_id~'^[a-z][a-z0-9_]{0,79}$'),title_snapshot text NOT NULL CHECK(length(title_snapshot) BETWEEN 1 AND 120),
 target_sets integer NOT NULL CHECK(target_sets BETWEEN 1 AND 30),target_reps integer CHECK(target_reps BETWEEN 1 AND 200),
 target_duration_seconds integer CHECK(target_duration_seconds BETWEEN 1 AND 3600),rest_seconds integer CHECK(rest_seconds BETWEEN 0 AND 600),
 UNIQUE(plan_id,sort_order),CHECK((target_reps IS NULL)<>(target_duration_seconds IS NULL))
);
CREATE TABLE workout_idempotency(
 owner_user_id uuid NOT NULL,key text NOT NULL,fingerprint text NOT NULL,response jsonb,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',PRIMARY KEY(owner_user_id,key)
);
