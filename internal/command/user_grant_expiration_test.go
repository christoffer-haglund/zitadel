package command

import (
	"context"
	"testing"
	"time"

	"github.com/muhlemmer/gu"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/zitadel/zitadel/internal/api/authz"
	"github.com/zitadel/zitadel/internal/domain"
	"github.com/zitadel/zitadel/internal/eventstore"
	"github.com/zitadel/zitadel/internal/repository/usergrant"
	"github.com/zitadel/zitadel/internal/zerrors"
)

func TestCommandSide_SetUserGrantExpiration(t *testing.T) {
	future := time.Now().Add(time.Hour).UTC().Truncate(time.Second)
	otherFuture := future.Add(time.Hour)

	userGrantAdded := func(expiration *time.Time) eventstore.Event {
		return eventFromEventPusher(
			usergrant.NewUserGrantAddedEvent(context.Background(),
				&usergrant.NewAggregate("usergrant1", "org1").Aggregate,
				"user1",
				"project1",
				"", []string{"rolekey1"},
			).WithExpirationDate(expiration),
		)
	}

	type args struct {
		ctx            context.Context
		userGrantID    string
		expirationDate *time.Time
		check          UserGrantPermissionCheck
	}
	tests := []struct {
		name           string
		eventstore     func(t *testing.T) *eventstore.Eventstore
		args           args
		wantExpiration *time.Time
		wantErr        func(error) bool
	}{
		{
			name:       "missing id, invalid argument",
			eventstore: expectEventstore(),
			args: args{
				ctx:            authz.NewMockContextWithPermissions("", "", "", []string{domain.RoleProjectOwner}),
				expirationDate: &future,
			},
			wantErr: zerrors.IsErrorInvalidArgument,
		},
		{
			name:       "grant not found, not found",
			eventstore: expectEventstore(expectFilter()),
			args: args{
				ctx:            authz.NewMockContextWithPermissions("", "", "", []string{domain.RoleProjectOwner}),
				userGrantID:    "usergrant1",
				expirationDate: &future,
			},
			wantErr: zerrors.IsNotFound,
		},
		{
			name:       "no permission, permission denied",
			eventstore: expectEventstore(expectFilter(userGrantAdded(nil))),
			args: args{
				ctx:            context.Background(),
				userGrantID:    "usergrant1",
				expirationDate: &future,
			},
			wantErr: zerrors.IsPermissionDenied,
		},
		{
			name:       "mocked permission check fails, error",
			eventstore: expectEventstore(expectFilter(userGrantAdded(nil))),
			args: args{
				ctx:            authz.NewMockContextWithPermissions("", "", "", []string{domain.RoleProjectOwner}),
				userGrantID:    "usergrant1",
				expirationDate: &future,
				check:          failingUserGrantPermissionCheck,
			},
			wantErr: isMockedPermissionCheckErr,
		},
		{
			name: "set expiration, ok",
			eventstore: expectEventstore(
				expectFilter(userGrantAdded(nil)),
				expectPush(
					usergrant.NewUserGrantExpirationSetEvent(context.Background(),
						&usergrant.NewAggregate("usergrant1", "org1").Aggregate,
						&future,
					),
				),
			),
			args: args{
				ctx:            authz.NewMockContextWithPermissions("", "", "", []string{domain.RoleProjectOwner}),
				userGrantID:    "usergrant1",
				expirationDate: &future,
			},
			wantExpiration: &future,
		},
		{
			name: "change expiration, ok",
			eventstore: expectEventstore(
				expectFilter(userGrantAdded(&future)),
				expectPush(
					usergrant.NewUserGrantExpirationSetEvent(context.Background(),
						&usergrant.NewAggregate("usergrant1", "org1").Aggregate,
						&otherFuture,
					),
				),
			),
			args: args{
				ctx:            authz.NewMockContextWithPermissions("", "", "", []string{domain.RoleProjectOwner}),
				userGrantID:    "usergrant1",
				expirationDate: &otherFuture,
			},
			wantExpiration: &otherFuture,
		},
		{
			name: "remove expiration, ok",
			eventstore: expectEventstore(
				expectFilter(userGrantAdded(&future)),
				expectPush(
					usergrant.NewUserGrantExpirationSetEvent(context.Background(),
						&usergrant.NewAggregate("usergrant1", "org1").Aggregate,
						nil,
					),
				),
			),
			args: args{
				ctx:         authz.NewMockContextWithPermissions("", "", "", []string{domain.RoleProjectOwner}),
				userGrantID: "usergrant1",
			},
			wantExpiration: nil,
		},
		{
			name:       "unchanged expiration, no event, ok",
			eventstore: expectEventstore(expectFilter(userGrantAdded(&future))),
			args: args{
				ctx:            authz.NewMockContextWithPermissions("", "", "", []string{domain.RoleProjectOwner}),
				userGrantID:    "usergrant1",
				expirationDate: gu.Ptr(future),
			},
			wantExpiration: &future,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := &Commands{
				eventstore: tt.eventstore(t),
			}
			got, err := c.SetUserGrantExpiration(tt.args.ctx, tt.args.userGrantID, "", tt.args.expirationDate, tt.args.check)
			if tt.wantErr != nil {
				require.Error(t, err)
				assert.True(t, tt.wantErr(err), "unexpected error: %v", err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.wantExpiration, got.ExpirationDate)
		})
	}
}

// Role changes, including cascades caused by removed project roles,
// must never remove or alter the expiration of a time-bound grant.
func TestUserGrantWriteModel_RoleChangesKeepExpiration(t *testing.T) {
	expiration := time.Now().Add(time.Hour)
	agg := &usergrant.NewAggregate("usergrant1", "org1").Aggregate
	wm := NewUserGrantWriteModel("usergrant1", "org1")
	wm.AppendEvents(
		usergrant.NewUserGrantAddedEvent(context.Background(), agg, "user1", "project1", "", []string{"a", "b"}).
			WithExpirationDate(&expiration),
		usergrant.NewUserGrantChangedEvent(context.Background(), agg, "user1", []string{"a"}),
		usergrant.NewUserGrantCascadeChangedEvent(context.Background(), agg, []string{}),
		usergrant.NewUserGrantDeactivatedEvent(context.Background(), agg),
		usergrant.NewUserGrantReactivatedEvent(context.Background(), agg),
	)
	require.NoError(t, wm.Reduce())
	require.NotNil(t, wm.ExpirationDate)
	assert.True(t, expiration.Equal(*wm.ExpirationDate))
}
