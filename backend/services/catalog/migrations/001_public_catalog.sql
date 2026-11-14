CREATE TABLE catalog_migrations (
  version integer PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE muscle_groups (
  id text PRIMARY KEY,
  label_vi text NOT NULL,
  slug text NOT NULL UNIQUE,
  svg_regions jsonb NOT NULL DEFAULT '[]',
  lifecycle text NOT NULL CHECK (lifecycle IN ('DRAFT','PUBLISHED','ARCHIVED'))
);
CREATE TABLE equipment (
  id text PRIMARY KEY,
  label_vi text NOT NULL,
  slug text NOT NULL UNIQUE,
  lifecycle text NOT NULL CHECK (lifecycle IN ('DRAFT','PUBLISHED','ARCHIVED'))
);
CREATE TABLE exercises (
  id text PRIMARY KEY,
  lifecycle text NOT NULL CHECK (lifecycle IN ('DRAFT','PUBLISHED','ARCHIVED')),
  current_published_version integer
);
CREATE TABLE exercise_revisions (
  exercise_id text NOT NULL REFERENCES exercises(id),
  version integer NOT NULL CHECK (version > 0),
  document jsonb NOT NULL,
  PRIMARY KEY (exercise_id,version),
  CHECK (document->>'id' = exercise_id),
  CHECK (jsonb_typeof(document->'instructions') = 'array')
);
ALTER TABLE exercises ADD CONSTRAINT published_revision_fk
  FOREIGN KEY (id,current_published_version)
  REFERENCES exercise_revisions(exercise_id,version) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE revision_muscle_groups (
  exercise_id text NOT NULL,
  version integer NOT NULL,
  group_id text NOT NULL REFERENCES muscle_groups(id),
  rank text NOT NULL CHECK (rank IN ('PRIMARY','SECONDARY')),
  PRIMARY KEY (exercise_id,version,group_id),
  FOREIGN KEY (exercise_id,version) REFERENCES exercise_revisions(exercise_id,version)
);
CREATE TABLE revision_equipment (
  exercise_id text NOT NULL,
  version integer NOT NULL,
  equipment_id text NOT NULL REFERENCES equipment(id),
  PRIMARY KEY (exercise_id,version,equipment_id),
  FOREIGN KEY (exercise_id,version) REFERENCES exercise_revisions(exercise_id,version)
);
CREATE TABLE slug_history (
  slug text PRIMARY KEY,
  exercise_id text NOT NULL REFERENCES exercises(id),
  state text NOT NULL CHECK (state IN ('CANONICAL','ALIAS')),
  UNIQUE (exercise_id,slug)
);
CREATE UNIQUE INDEX one_canonical_slug ON slug_history(exercise_id) WHERE state='CANONICAL';
CREATE TABLE publication_revisions (
  aggregate_version bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  revision text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE catalog_imports (
  source_revision text PRIMARY KEY,
  checksum text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX muscle_filter ON revision_muscle_groups(group_id,exercise_id,version);
CREATE INDEX equipment_filter ON revision_equipment(equipment_id,exercise_id,version);
