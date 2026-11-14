ALTER TABLE outbox_events ADD COLUMN lease_token uuid;
ALTER TABLE outbox_events ADD COLUMN lease_until timestamptz;
ALTER TABLE outbox_events ADD COLUMN error_code text;
ALTER TABLE outbox_events ADD CONSTRAINT identity_outbox_lease_pair CHECK((lease_token IS NULL)=(lease_until IS NULL));
