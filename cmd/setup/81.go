package setup

import (
	"context"
	_ "embed"

	"github.com/zitadel/zitadel/internal/database"
	"github.com/zitadel/zitadel/internal/eventstore"
)

var (
	//go:embed 81.sql
	addUserGrants5ExpirationDate string
)

type UserGrants5AddExpirationDate struct {
	dbClient *database.DB
}

func (mig *UserGrants5AddExpirationDate) Execute(ctx context.Context, _ eventstore.Event) error {
	_, err := mig.dbClient.ExecContext(ctx, addUserGrants5ExpirationDate)
	return err
}

func (mig *UserGrants5AddExpirationDate) String() string {
	return "81_user_grants5_add_expiration_date"
}
