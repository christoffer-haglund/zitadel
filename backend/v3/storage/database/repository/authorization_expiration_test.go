package repository_test

import (
	"testing"
	"time"

	"github.com/muhlemmer/gu"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/zitadel/zitadel/backend/v3/domain"
	"github.com/zitadel/zitadel/backend/v3/storage/database"
	"github.com/zitadel/zitadel/backend/v3/storage/database/repository"
)

func TestAuthorizationExpiration(t *testing.T) {
	tx, rollback := transactionForRollback(t)
	defer rollback()

	instanceID := createInstance(t, tx)
	organizationID := createOrganization(t, tx, instanceID)
	projectID := createProject(t, tx, instanceID, organizationID)
	role := createProjectRole(t, tx, instanceID, organizationID, projectID, "role")
	userID := createHumanUser(t, tx, instanceID, organizationID)

	repo := repository.AuthorizationRepository()
	future := time.Now().Add(time.Hour).UTC().Truncate(time.Microsecond)
	past := time.Now().Add(-time.Hour).UTC().Truncate(time.Microsecond)

	create := func(id string, expiration *time.Time) {
		t.Helper()
		require.NoError(t, repo.Create(t.Context(), tx, &domain.Authorization{
			ID:             id,
			UserID:         userID,
			ProjectID:      projectID,
			InstanceID:     instanceID,
			State:          domain.AuthorizationStateActive,
			Roles:          []string{role},
			ExpirationDate: expiration,
		}))
	}
	create("never-expires", nil)
	create("expires-later", &future)
	create("expired", &past)

	listEffectiveIDs := func(t *testing.T) []string {
		t.Helper()
		authorizations, err := repo.List(t.Context(), tx,
			database.WithCondition(database.And(
				repo.InstanceIDCondition(instanceID),
				repo.NotExpiredCondition(),
			)),
			database.WithOrderByAscending(repo.IDColumn()),
		)
		require.NoError(t, err)
		ids := make([]string, len(authorizations))
		for i, a := range authorizations {
			ids[i] = a.ID
		}
		return ids
	}

	t.Run("create and get keeps expiration", func(t *testing.T) {
		got, err := repo.Get(t.Context(), tx, database.WithCondition(repo.PrimaryKeyCondition(instanceID, "expires-later")))
		require.NoError(t, err)
		require.NotNil(t, got.ExpirationDate)
		assert.True(t, future.Equal(*got.ExpirationDate))

		got, err = repo.Get(t.Context(), tx, database.WithCondition(repo.PrimaryKeyCondition(instanceID, "never-expires")))
		require.NoError(t, err)
		assert.Nil(t, got.ExpirationDate)
	})

	t.Run("not expired condition keeps authorizations without expiration", func(t *testing.T) {
		assert.Equal(t, []string{"expires-later", "never-expires"}, listEffectiveIDs(t))
	})

	t.Run("extend expired authorization", func(t *testing.T) {
		savepoint, rollback := savepointForRollback(t, tx)
		defer rollback()
		_, err := repo.Update(t.Context(), savepoint, repo.PrimaryKeyCondition(instanceID, "expired"), nil, repo.SetExpirationDate(&future))
		require.NoError(t, err)

		authorizations, err := repo.List(t.Context(), savepoint, database.WithCondition(database.And(
			repo.InstanceIDCondition(instanceID),
			repo.IDCondition("expired"),
			repo.NotExpiredCondition(),
		)))
		require.NoError(t, err)
		assert.Len(t, authorizations, 1)
	})

	t.Run("expire authorization", func(t *testing.T) {
		savepoint, rollback := savepointForRollback(t, tx)
		defer rollback()
		_, err := repo.Update(t.Context(), savepoint, repo.PrimaryKeyCondition(instanceID, "never-expires"), nil, repo.SetExpirationDate(gu.Ptr(past)))
		require.NoError(t, err)

		authorizations, err := repo.List(t.Context(), savepoint, database.WithCondition(database.And(
			repo.InstanceIDCondition(instanceID),
			repo.NotExpiredCondition(),
		)))
		require.NoError(t, err)
		require.Len(t, authorizations, 1)
		assert.Equal(t, "expires-later", authorizations[0].ID)
	})

	t.Run("remove expiration", func(t *testing.T) {
		savepoint, rollback := savepointForRollback(t, tx)
		defer rollback()
		_, err := repo.Update(t.Context(), savepoint, repo.PrimaryKeyCondition(instanceID, "expired"), nil, repo.SetExpirationDate(nil))
		require.NoError(t, err)

		got, err := repo.Get(t.Context(), savepoint, database.WithCondition(repo.PrimaryKeyCondition(instanceID, "expired")))
		require.NoError(t, err)
		assert.Nil(t, got.ExpirationDate)
	})

	t.Run("role changes keep expiration", func(t *testing.T) {
		savepoint, rollback := savepointForRollback(t, tx)
		defer rollback()
		_, err := repo.Update(t.Context(), savepoint, repo.PrimaryKeyCondition(instanceID, "expires-later"), []string{})
		require.NoError(t, err)

		got, err := repo.Get(t.Context(), savepoint, database.WithCondition(repo.PrimaryKeyCondition(instanceID, "expires-later")))
		require.NoError(t, err)
		require.NotNil(t, got.ExpirationDate)
		assert.True(t, future.Equal(*got.ExpirationDate))
	})
}
