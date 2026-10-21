package migration

import (
	_ "embed"
)

var (
	//go:embed 019_authorizations_expiration_date/up.sql
	up019AuthorizationsExpirationDate string
	//go:embed 019_authorizations_expiration_date/down.sql
	down019AuthorizationsExpirationDate string
)

func init() {
	registerSQLMigration(19, up019AuthorizationsExpirationDate, down019AuthorizationsExpirationDate)
}
