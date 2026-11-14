CREATE FUNCTION catalog_search_key(input text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT lower(translate(
    regexp_replace(normalize(input, NFD), '[' || chr(768) || '-' || chr(879) || ']', '', 'g'),
    'Đđ', 'Dd'
  ) COLLATE "C")
$$;

ALTER TABLE exercise_revisions ADD COLUMN search_key text GENERATED ALWAYS AS (
  catalog_search_key(coalesce(document->>'nameVi', '') || ' ' || coalesce(document->>'nameEn', ''))
) STORED;

CREATE INDEX catalog_keyset ON exercises (id COLLATE "C") WHERE lifecycle='PUBLISHED';

ALTER TABLE catalog_imports ADD COLUMN source_manifest jsonb;
