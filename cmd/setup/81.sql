ALTER TABLE IF EXISTS projections.user_grants5 ADD COLUMN IF NOT EXISTS expiration_date TIMESTAMPTZ;
