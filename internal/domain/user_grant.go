package domain

import (
	"slices"
	"time"

	es_models "github.com/zitadel/zitadel/internal/eventstore/v1/models"
)

type UserGrant struct {
	es_models.ObjectRoot

	State          UserGrantState
	UserID         string
	ProjectID      string
	ProjectGrantID string
	RoleKeys       []string
	// ExpirationDate is the point in time after which the grant is no longer effective.
	// nil means the grant does not expire.
	ExpirationDate *time.Time
}

type UserGrantState int32

const (
	UserGrantStateUnspecified UserGrantState = iota
	UserGrantStateActive
	UserGrantStateInactive
	UserGrantStateRemoved
)

func (u *UserGrant) IsValid() bool {
	return u.ProjectID != "" && u.UserID != ""
}

func (g *UserGrant) HasInvalidRoles(validRoles []string) bool {
	for _, roleKey := range g.RoleKeys {
		if !slices.Contains(validRoles, roleKey) {
			return true
		}
	}
	return false
}
