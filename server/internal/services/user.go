package services

import (
	"context"
	"database/sql"
	"errors"

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

func (s *UserService) GetUserProfile(ctx context.Context, userID string, orgID string) (*schemas.UserProfileResponse, error) {
	uid := util.ParseUUID(userID)
	oid := util.ParseUUID(orgID)

	// 1. Fetch base profile (org-scoped: status/org_name are per-membership)
	baseProfile, err := s.queries.GetFullUserProfile(ctx, db.GetFullUserProfileParams{ID: uid, OrgID: oid})
	if err != nil {
		return nil, err
	}

	// 2. Fetch system roles (this org only — a person can hold different roles elsewhere)
	roles, err := s.queries.GetUserSystemRoles(ctx, db.GetUserSystemRolesParams{
		UserID: uid,
		OrgID:  oid,
	})
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	systemRoles := make([]string, len(roles))
	for i, r := range roles {
		systemRoles[i] = string(r)
	}

	// 3. Fetch team associations (this org only)
	dbTeams, err := s.queries.GetUserTeamsWithAdmins(ctx, db.GetUserTeamsWithAdminsParams{
		UserID: uid,
		OrgID:  oid,
	})
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	var teams []schemas.TeamProfile
	for _, t := range dbTeams {
		teams = append(teams, schemas.TeamProfile{
			TeamName:        t.TeamName,
			UserTeamRole:    string(t.UserTeamRole),
			TeamAdminEmails: util.ParsePGTextArray(t.TeamAdminEmails),
		})
	}
	return &schemas.UserProfileResponse{
		ID:          baseProfile.ID.String(),
		FirstName:   baseProfile.FirstName.String,
		LastName:    baseProfile.LastName.String,
		EmailID:     baseProfile.EmailID,
		PhoneNumber: baseProfile.PhoneNumber.String,
		SourceFace: schemas.FacePayload{
			FileURL: baseProfile.FaceS3Uri.String,
		},
		Status:      string(baseProfile.Status),
		OrgName:     baseProfile.OrgName,
		SystemRoles: systemRoles,
		Teams:       teams,
	}, nil
}

func (s *UserService) UpdateUserProfile(ctx context.Context, userID string, req schemas.UpdateProfileRequest) error {
	if req.PhoneNumber != "" && !util.IsValidPhoneNumber(req.PhoneNumber) {
		return errors.New("phone number must be a 10-digit number without the country code")
	}

	uid := util.ParseUUID(userID)

	params := db.UpdateUserProfileParams{
		ID:          uid,
		FirstName:   sql.NullString{String: req.FirstName, Valid: req.FirstName != ""},
		LastName:    sql.NullString{String: req.LastName, Valid: req.LastName != ""},
		PhoneNumber: sql.NullString{String: req.PhoneNumber, Valid: req.PhoneNumber != ""},
		FaceS3Uri:   sql.NullString{String: req.SourceFace.ObjectKey, Valid: req.SourceFace.ObjectKey != ""},
	}

	_, err := s.queries.UpdateUserProfile(ctx, params)
	return err
}

func (s *UserService) RegisterFace(ctx context.Context, userID string, objectKey string) error {
	uid := util.ParseUUID(userID)
	return s.queries.UpdateUserFace(ctx, db.UpdateUserFaceParams{
		ID:        uid,
		FaceS3Uri: sql.NullString{String: objectKey, Valid: true},
	})
}
