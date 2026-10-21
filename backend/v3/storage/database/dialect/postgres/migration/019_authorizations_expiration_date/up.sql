-- expiration_date is the point in time after which the authorization is no longer effective.
-- NULL means the authorization does not expire.
-- Readers must filter with (expiration_date IS NULL OR expiration_date > now()),
-- use the NotExpiredCondition of the authorization repository instead of writing it by hand.
ALTER TABLE zitadel.authorizations ADD COLUMN expiration_date TIMESTAMPTZ;
