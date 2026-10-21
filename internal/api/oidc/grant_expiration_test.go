package oidc

import (
	"testing"
	"time"

	"github.com/muhlemmer/gu"
	"github.com/stretchr/testify/assert"

	"github.com/zitadel/zitadel/internal/query"
)

func Test_earliestGrantExpiration(t *testing.T) {
	now := time.Now()
	tests := []struct {
		name   string
		grants []query.UserGrant
		want   *time.Time
	}{
		{
			name: "no grants",
			want: nil,
		},
		{
			name:   "no expiring grants",
			grants: []query.UserGrant{{ID: "1"}, {ID: "2"}},
			want:   nil,
		},
		{
			name: "earliest of mixed grants",
			grants: []query.UserGrant{
				{ID: "1", ExpirationDate: gu.Ptr(now.Add(2 * time.Hour))},
				{ID: "2"},
				{ID: "3", ExpirationDate: gu.Ptr(now.Add(time.Hour))},
			},
			want: gu.Ptr(now.Add(time.Hour)),
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, earliestGrantExpiration(tt.grants))
		})
	}
}

func Test_capExpiration(t *testing.T) {
	exp := time.Now().Add(12 * time.Hour)
	tests := []struct {
		name             string
		grantsExpiration *time.Time
		want             time.Time
	}{
		{
			name: "no grants expiration",
			want: exp,
		},
		{
			name:             "grants expire after token",
			grantsExpiration: gu.Ptr(exp.Add(time.Hour)),
			want:             exp,
		},
		{
			name:             "grants expire before token",
			grantsExpiration: gu.Ptr(exp.Add(-11 * time.Hour)),
			want:             exp.Add(-11 * time.Hour),
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, capExpiration(exp, tt.grantsExpiration))
		})
	}
}
