package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"time"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/schemas"
	"github.com/crizah/Abhiyan/server/internal/util"
	"github.com/crizah/Onion/app"
)

type AdminService struct {
	db        *sql.DB
	queries   *db.Queries
	JwtSecret []byte
	onionApp  *app.App
}

func NewAdminService(dbConn *sql.DB, s []byte, oa *app.App) *AdminService {
	return &AdminService{
		db:        dbConn,
		queries:   db.New(dbConn),
		JwtSecret: s,
		onionApp:  oa,
	}
}

func (s *AdminService) InviteUser(ctx context.Context, adminOrgID string, req schemas.InviteUserRequest) (string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	qtx := s.queries.WithTx(tx)

	user, err := qtx.CreateInvitedUser(ctx, db.CreateInvitedUserParams{
		OrgID:   util.ParseUUID(adminOrgID),
		EmailID: req.Email,
	})
	if err != nil {
		return "", errors.New("user with this email may already exist")
	}

	_, err = qtx.AddUserSystemRole(ctx, db.AddUserSystemRoleParams{
		UserID: user.ID,
		Role:   db.SystemRole(req.Role),
	})
	if err != nil {
		return "", err
	}

	if err := tx.Commit(); err != nil {
		return "", err
	}

	token, err := util.GenerateInviteToken(user.EmailID, adminOrgID, req.Role, s.JwtSecret, 48*time.Hour)
	if err != nil {
		return "", err
	}

	frontendURL := os.Getenv("FRONTEND_URL")
	link := fmt.Sprintf("%s/accept-invite?token=%s", frontendURL, token)
	s.onionApp.Enqueue(ctx, "send_invite_email", map[string]any{"email": req.Email, "link": link})

	return token, nil
}

func (s *AdminService) GetTotalUsers(ctx context.Context, orgID string) (int64, error) {
	return s.queries.GetTotalUsersByOrg(ctx, util.ParseUUID(orgID))
}
