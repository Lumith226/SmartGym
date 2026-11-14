-- Keep the public taxonomy columns as projections of the published support revision.
ALTER TABLE muscle_groups ALTER COLUMN label_vi DROP NOT NULL, ALTER COLUMN slug DROP NOT NULL,
  DROP CONSTRAINT muscle_groups_slug_key, ADD COLUMN sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0);
ALTER TABLE equipment ALTER COLUMN label_vi DROP NOT NULL, ALTER COLUMN slug DROP NOT NULL,
  DROP CONSTRAINT equipment_slug_key;
CREATE UNIQUE INDEX muscle_groups_public_slug ON muscle_groups(slug) WHERE lifecycle='PUBLISHED';
CREATE UNIQUE INDEX equipment_public_slug ON equipment(slug) WHERE lifecycle='PUBLISHED';

CREATE TABLE exercise_variants (
  id text PRIMARY KEY,
  exercise_id text NOT NULL REFERENCES exercises(id),
  lifecycle text NOT NULL CHECK (lifecycle IN ('DRAFT','PUBLISHED','ARCHIVED'))
);
CREATE TABLE media_assets (
  id text PRIMARY KEY,
  lifecycle text NOT NULL CHECK (lifecycle IN ('DRAFT','PUBLISHED','ARCHIVED'))
);
CREATE TABLE media_uploads (
  id text PRIMARY KEY,
  actor_id uuid NOT NULL,
  object_key text NOT NULL UNIQUE,
  object_version text,
  expected_mime text NOT NULL,
  expected_bytes integer NOT NULL CHECK (expected_bytes BETWEEN 1 AND 104857600),
  expected_sha256 text NOT NULL CHECK (expected_sha256 ~ '^[a-f0-9]{64}$'),
  detected_mime text,
  status text NOT NULL CHECK (status IN ('RESERVED','VERIFYING','READY','REJECTED','EXPIRED')),
  expires_at timestamptz NOT NULL,
  error_code text,
  CHECK (status <> 'READY' OR (nullif(object_version,'') IS NOT NULL AND detected_mime IS NOT NULL))
);

CREATE TABLE support_revisions (
  content_type text NOT NULL CHECK (content_type IN ('muscle-group','equipment','exercise-variant','media')),
  content_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  document jsonb NOT NULL CHECK (jsonb_typeof(document)='object'),
  svg_regions jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(svg_regions)='array'),
  object_version text,
  actor uuid,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  group_id text GENERATED ALWAYS AS (CASE WHEN content_type='muscle-group' THEN content_id END) STORED REFERENCES muscle_groups(id),
  equipment_id text GENERATED ALWAYS AS (CASE WHEN content_type='equipment' THEN content_id END) STORED REFERENCES equipment(id),
  variant_id text GENERATED ALWAYS AS (CASE WHEN content_type='exercise-variant' THEN content_id END) STORED REFERENCES exercise_variants(id),
  media_id text GENERATED ALWAYS AS (CASE WHEN content_type='media' THEN content_id END) STORED REFERENCES media_assets(id),
  upload_id text GENERATED ALWAYS AS (CASE WHEN content_type='media' THEN document->>'uploadId' END) STORED REFERENCES media_uploads(id),
  PRIMARY KEY (content_type,content_id,version),
  UNIQUE (group_id,version), UNIQUE (equipment_id,version), UNIQUE (variant_id,version), UNIQUE (media_id,version),
  CHECK (content_type <> 'media' OR (upload_id IS NOT NULL AND nullif(object_version,'') IS NOT NULL))
);

DO $$
DECLARE owner_table text;
DECLARE revision_id text;
BEGIN
  FOR owner_table, revision_id IN VALUES ('muscle_groups','group_id'), ('equipment','equipment_id'),
    ('exercise_variants','variant_id'), ('media_assets','media_id')
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN edit_version integer NOT NULL DEFAULT 1 CHECK (edit_version > 0),
      ADD COLUMN current_draft_version integer, ADD COLUMN current_published_version integer,
      ADD COLUMN created_by uuid, ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
      ADD FOREIGN KEY (id,current_draft_version) REFERENCES support_revisions(%I,version),
      ADD FOREIGN KEY (id,current_published_version) REFERENCES support_revisions(%I,version)', owner_table,revision_id,revision_id);
  END LOOP;
END;
$$;

INSERT INTO support_revisions(content_type,content_id,version,document,svg_regions,action)
  SELECT 'muscle-group',id,1,jsonb_build_object('nameVi',label_vi,'slug',slug,'sortOrder',0)
    || CASE WHEN jsonb_array_length(svg_regions)=1 THEN jsonb_build_object('regionKey',svg_regions->>0) ELSE '{}' END,
    svg_regions,'BOOTSTRAP' FROM muscle_groups;
INSERT INTO support_revisions(content_type,content_id,version,document,action)
  SELECT 'equipment',id,1,jsonb_build_object('nameVi',label_vi,'slug',slug),'BOOTSTRAP' FROM equipment;
UPDATE muscle_groups SET current_draft_version=1,
  current_published_version=CASE WHEN lifecycle='PUBLISHED' THEN 1 END;
UPDATE equipment SET current_draft_version=1,
  current_published_version=CASE WHEN lifecycle='PUBLISHED' THEN 1 END;

ALTER TABLE revision_muscle_groups ADD COLUMN support_version integer,
  ADD FOREIGN KEY (group_id,support_version) REFERENCES support_revisions(group_id,version);
ALTER TABLE revision_equipment ADD COLUMN support_version integer,
  ADD FOREIGN KEY (equipment_id,support_version) REFERENCES support_revisions(equipment_id,version);
-- Pre-004 bootstrap and CMS publication both mark the immutable public document with publishedRevision.
UPDATE revision_muscle_groups r SET support_version=1 FROM exercise_revisions e
  WHERE e.exercise_id=r.exercise_id AND e.version=r.version AND e.document ? 'publishedRevision';
UPDATE revision_equipment r SET support_version=1 FROM exercise_revisions e
  WHERE e.exercise_id=r.exercise_id AND e.version=r.version AND e.document ? 'publishedRevision';

CREATE TABLE revision_variants (
  exercise_id text NOT NULL,
  version integer NOT NULL,
  variant_id text NOT NULL,
  support_version integer NOT NULL,
  PRIMARY KEY (exercise_id,version,variant_id),
  FOREIGN KEY (exercise_id,version) REFERENCES exercise_revisions(exercise_id,version),
  FOREIGN KEY (variant_id,support_version) REFERENCES support_revisions(variant_id,version)
);
CREATE INDEX revision_variants_support ON revision_variants(variant_id,exercise_id,version);
CREATE TABLE revision_media (
  exercise_id text NOT NULL,
  version integer NOT NULL,
  media_id text NOT NULL,
  support_version integer NOT NULL,
  display_order integer NOT NULL CHECK (display_order >= 0),
  PRIMARY KEY (exercise_id,version,media_id),
  UNIQUE (exercise_id,version,display_order),
  FOREIGN KEY (exercise_id,version) REFERENCES exercise_revisions(exercise_id,version),
  FOREIGN KEY (media_id,support_version) REFERENCES support_revisions(media_id,version)
);
CREATE INDEX revision_media_support ON revision_media(media_id,exercise_id,version);

ALTER TABLE publication_revisions ADD COLUMN content_type text, ADD COLUMN content_id text;

CREATE FUNCTION prevent_support_revision_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Support revisions are append-only';
END;
$$;
CREATE TRIGGER support_revisions_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON support_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_support_revision_changes();
