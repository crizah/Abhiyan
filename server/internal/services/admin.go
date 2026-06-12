package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"strings"
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

func (s *AdminService) GetAdminTeamUsersCount(ctx context.Context, userID string) (int64, error) {
	return s.queries.GetTotalUsersInAdminTeams(ctx, util.ParseUUID(userID))
}
func (s *AdminService) GetOrgUsers(ctx context.Context, orgID string, limit, offset int32, searchTerm string, roleFilter string, statusFilter string) (*schemas.PaginatedUsersResponse, error) {
	parsedOrgID := util.ParseUUID(orgID)

	if roleFilter == "ALL" {
		roleFilter = ""
	}
	if statusFilter == "ALL" {
		statusFilter = ""
	}

	params := db.GetUsersByOrgPaginatedParams{
		OrgID:        parsedOrgID,
		Limit:        limit,
		Offset:       offset,
		SearchTerm:   searchTerm,
		RoleFilter:   roleFilter,
		StatusFilter: statusFilter,
	}

	dbUsers, err := s.queries.GetUsersByOrgPaginated(ctx, params)
	if err != nil {
		return nil, err
	}

	var users []schemas.OrgUserResponse
	var totalCount int64 = 0

	for i, u := range dbUsers {
		// Grab the total count from the first row
		if i == 0 {
			totalCount = u.TotalCount
		}

		rawRoles := ""
		if str, ok := u.Roles.(string); ok {
			rawRoles = str
		} else if b, ok := u.Roles.([]byte); ok {
			rawRoles = string(b)
		}
		rawRoles = strings.Trim(rawRoles, "{}")

		var roles []string
		if rawRoles != "" {
			roles = strings.Split(rawRoles, ",")
		}

		fullName := strings.TrimSpace(u.FirstName.String + " " + u.LastName.String)
		if fullName == "" {
			fullName = "Unknown User"
		}

		users = append(users, schemas.OrgUserResponse{
			ID:       u.ID.String(),
			FullName: fullName,
			EmailID:  u.EmailID,
			Status:   string(u.Status.UserStatus),
			Roles:    roles,
		})
	}

	if users == nil {
		users = []schemas.OrgUserResponse{}
	}

	return &schemas.PaginatedUsersResponse{
		TotalCount: totalCount,
		Users:      users,
	}, nil
}

func (s *AdminService) GetTeamEmployees(ctx context.Context, userID string, limit, offset int32, search string, teamFilter string, roleFilter string, statusFilter string) (*schemas.PaginatedEmployeesResponse, error) {
	parsedUserID := util.ParseUUID(userID)

	// Convert "ALL" filter strings from React to empty strings for SQLC
	if teamFilter == "ALL" {
		teamFilter = ""
	}
	if roleFilter == "ALL" {
		roleFilter = ""
	}
	if statusFilter == "ALL" {
		statusFilter = ""
	}

	params := db.GetTeamEmployeesPaginatedParams{
		UserID:       parsedUserID,
		Limit:        limit,
		Offset:       offset,
		SearchTerm:   search,
		TeamFilter:   teamFilter,
		RoleFilter:   roleFilter,
		StatusFilter: statusFilter,
	}

	dbUsers, err := s.queries.GetTeamEmployeesPaginated(ctx, params)
	if err != nil {
		return nil, err
	}

	var employees []schemas.TeamEmployeeResponse
	var totalCount int64 = 0

	for i, u := range dbUsers {
		if i == 0 {
			totalCount = u.TotalCount
		}

		fullName := strings.TrimSpace(u.FirstName.String + " " + u.LastName.String)
		if fullName == "" {
			fullName = "Unknown User"
		}

		employees = append(employees, schemas.TeamEmployeeResponse{
			ID:       u.ID.String(),
			FullName: fullName,
			EmailID:  u.EmailID,
			Status:   string(u.Status.UserStatus),
			TeamName: u.TeamName,
			TeamRole: u.TeamRole,
		})
	}

	if employees == nil {
		employees = []schemas.TeamEmployeeResponse{}
	}

	return &schemas.PaginatedEmployeesResponse{
		TotalCount: totalCount,
		Employees:  employees,
	}, nil
}

func (s *AdminService) GetAdminTeamNames(ctx context.Context, userID string) ([]string, error) {
	names, err := s.queries.GetAdminTeamNames(ctx, util.ParseUUID(userID))
	if err != nil {
		return nil, err
	}
	if names == nil {
		return []string{}, nil
	}
	return names, nil
}
