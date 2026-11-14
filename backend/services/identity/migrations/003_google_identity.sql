ALTER TABLE users ADD COLUMN google_subject text UNIQUE CHECK (length(google_subject) BETWEEN 1 AND 255);
ALTER TABLE credentials ALTER COLUMN password_hash DROP NOT NULL;
