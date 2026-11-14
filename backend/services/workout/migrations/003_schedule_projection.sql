ALTER TABLE workout_schedules ADD COLUMN next_projection_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE workout_schedules ADD COLUMN last_projected_at timestamptz;
ALTER TABLE workout_schedules ADD COLUMN projection_error text CHECK(projection_error IS NULL OR projection_error='PROJECTION_FAILED');
CREATE INDEX workout_projection_due ON workout_schedules(next_projection_at,id) WHERE status='ACTIVE';
CREATE INDEX workout_projection_slots ON workout_occurrences(schedule_id,local_date,id);
