package services

import (
	"context"
	"database/sql"
	"strings"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/schemas"
	"github.com/crizah/Abhiyan/server/internal/util"
)

type UserService struct {
	db      *sql.DB
	queries *db.Queries
}

func NewUserService(dbConn *sql.DB) *UserService {
	return &UserService{
		db:      dbConn,
		queries: db.New(dbConn),
	}
}

func (s *UserService) GetUserProfile(ctx context.Context, userID string) (*schemas.UserProfileResponse, error) {
	uid := util.ParseUUID(userID)

	// 1. Fetch base profile
	baseProfile, err := s.queries.GetFullUserProfile(ctx, uid)
	if err != nil {
		return nil, err
	}

	// 2. Fetch system roles
	roles, err := s.queries.GetUserSystemRoles(ctx, uid)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	systemRoles := make([]string, len(roles))
	for i, r := range roles {
		systemRoles[i] = string(r)
	}

	// 3. Fetch team associations
	dbTeams, err := s.queries.GetUserTeamsWithAdmins(ctx, uid)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	var teams []schemas.TeamProfile
	for _, t := range dbTeams {
		// PostgreSQL array_agg over text usually returns a string like "{admin@test.com,admin2@test.com}"
		// if not explicitly mapped by sqlc/pq. We clean it up here.
		rawEmails := ""
		if str, ok := t.TeamAdminEmails.(string); ok {
			rawEmails = str
		} else if b, ok := t.TeamAdminEmails.([]byte); ok {
			rawEmails = string(b)
		}

		rawEmails = strings.Trim(rawEmails, "{}")
		var emails []string
		if rawEmails != "" {
			emails = strings.Split(rawEmails, ",")
		}

		teams = append(teams, schemas.TeamProfile{
			TeamName:        t.TeamName,
			UserTeamRole:    string(t.UserTeamRole),
			TeamAdminEmails: emails,
		})
	}

	return &schemas.UserProfileResponse{
		ID:          baseProfile.ID.String(),
		FirstName:   baseProfile.FirstName.String,
		LastName:    baseProfile.LastName.String,
		EmailID:     baseProfile.EmailID,
		PhoneNumber: baseProfile.PhoneNumber,
		Status:      string(baseProfile.Status.UserStatus),
		OrgName:     baseProfile.OrgName,
		SystemRoles: systemRoles,
		Teams:       teams,
	}, nil
}

func (s *UserService) UpdateUserProfile(ctx context.Context, userID string, req schemas.UpdateProfileRequest) error {
	uid := util.ParseUUID(userID)

	params := db.UpdateUserProfileParams{
		ID:          uid,
		FirstName:   sql.NullString{String: req.FirstName, Valid: req.FirstName != ""},
		LastName:    sql.NullString{String: req.LastName, Valid: req.LastName != ""},
		PhoneNumber: req.PhoneNumber,
	}

	_, err := s.queries.UpdateUserProfile(ctx, params)
	return err
}
