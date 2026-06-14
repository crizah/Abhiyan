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
		// status already invited
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

func (s *AdminService) GetUnassignedOrgUsers(ctx context.Context, orgID string) ([]schemas.UnassignedUserResponse, error) {
	parsedOrgID := util.ParseUUID(orgID)

	dbUsers, err := s.queries.GetUnassignedOrgUsers(ctx, parsedOrgID)
	if err != nil {
		return nil, err
	}

	var users []schemas.UnassignedUserResponse
	for _, u := range dbUsers {
		fullName := strings.TrimSpace(u.FirstName.String + " " + u.LastName.String)
		if fullName == "" {
			fullName = "Pending Acceptance" // Good default for invited users who haven't set a name
		}

		users = append(users, schemas.UnassignedUserResponse{
			ID:       u.ID.String(),
			FullName: fullName,
			EmailID:  u.EmailID,
			Status:   string(u.Status.UserStatus),
		})
	}

	// Always return an empty array instead of null for the frontend map function
	if users == nil {
		users = []schemas.UnassignedUserResponse{}
	}

	return users, nil
}

func (s *AdminService) CreateTeam(ctx context.Context, orgID, name, creatorID string) (string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	qtx := s.queries.WithTx(tx)

	// 1. Create the Team
	teamID, err := qtx.CreateTeam(ctx, db.CreateTeamParams{
		OrgID: util.ParseUUID(orgID),
		Name:  name,
	})
	if err != nil {
		return "", errors.New("a team with this name may already exist")
	}

	// 2. Automatically make the creator the TEAM_ADMIN
	err = qtx.UpsertTeamMember(ctx, db.UpsertTeamMemberParams{
		TeamID:   teamID,
		UserID:   util.ParseUUID(creatorID),
		TeamRole: "TEAM_ADMIN", // Or db.TeamRoleEnumTEAM_ADMIN depending on your generated types
	})
	if err != nil {
		return "", err
	}

	if err := tx.Commit(); err != nil {
		return "", err
	}

	return teamID.String(), nil
}

func (s *AdminService) GetAllOrgTeams(ctx context.Context, orgID string) ([]schemas.TeamResponse, error) {
	dbTeams, err := s.queries.GetOrgTeams(ctx, util.ParseUUID(orgID))
	if err != nil {
		return nil, err
	}

	var teams []schemas.TeamResponse
	for _, t := range dbTeams {
		teams = append(teams, schemas.TeamResponse{
			ID:          t.ID.String(),
			Name:        t.Name,
			MemberCount: int(t.MemberCount),
		})
	}
	if teams == nil {
		teams = []schemas.TeamResponse{}
	}
	return teams, nil
}

func (s *AdminService) GetTeamMembers(ctx context.Context, teamID string, userID string, role string) ([]schemas.TeamMemberResponse, error) {
	tID := util.ParseUUID(teamID)
	uID := util.ParseUUID(userID)

	// SECURITY GUARD: If they are not a SUPER_ADMIN, verify they actually manage this team
	if role != "SUPER_ADMIN" {
		isAdmin, err := s.queries.CheckTeamAdminStatus(ctx, db.CheckTeamAdminStatusParams{
			TeamID: tID,
			UserID: uID,
		})
		if err != nil || !isAdmin {
			return nil, errors.New("unauthorized: you do not manage this team")
		}
	}

	dbMembers, err := s.queries.GetTeamMembersDetails(ctx, util.ParseUUID(teamID))
	if err != nil {
		return nil, err
	}

	var members []schemas.TeamMemberResponse
	for _, m := range dbMembers {
		fullName := strings.TrimSpace(m.FirstName.String + " " + m.LastName.String)
		if fullName == "" {
			fullName = "Pending Acceptance"
		}

		members = append(members, schemas.TeamMemberResponse{
			ID:       m.ID.String(),
			FullName: fullName,
			EmailID:  m.EmailID,
			TeamRole: m.TmTeamRole,
		})
	}
	if members == nil {
		members = []schemas.TeamMemberResponse{}
	}
	return members, nil
}
func (s *AdminService) ManageTeamMember(ctx context.Context, teamID, userID, role string, isRemoval bool) error {
	tID := util.ParseUUID(teamID)
	uID := util.ParseUUID(userID)

	// GUARD 1: SYSTEM ROLE CHECK FOR TEAM ADMINS
	if !isRemoval && role == "TEAM_ADMIN" {
		sysRoles, err := s.queries.GetUserSystemRoles(ctx, uID)
		if err != nil {
			return err
		}

		isSystemAdmin := false
		for _, r := range sysRoles {
			if r == "ADMIN" || r == "SUPER_ADMIN" {
				isSystemAdmin = true
				break
			}
		}

		if !isSystemAdmin {
			return errors.New("action blocked: Only System Admins or Super Admins can be made Team Admins")
		}
	}

	// GUARD 2: PREVENT REMOVING THE LAST ADMIN
	if isRemoval || role == "MEMBER" {
		adminCount, err := s.queries.GetTeamAdminCount(ctx, tID)
		if err != nil {
			return err
		}

		if adminCount <= 1 {
			members, _ := s.GetTeamMembers(ctx, teamID, "", "SUPER_ADMIN")
			for _, m := range members {
				if m.ID == userID && m.TeamRole == "TEAM_ADMIN" {
					return errors.New("cannot remove or demote the last Team Admin. Promote someone else first")
				}
			}
		}
	}

	// Execute DB Transaction
	if isRemoval {
		return s.queries.RemoveTeamMember(ctx, db.RemoveTeamMemberParams{
			TeamID: tID,
			UserID: uID,
		})
	}

	return s.queries.UpsertTeamMember(ctx, db.UpsertTeamMemberParams{
		TeamID:   tID,
		UserID:   uID,
		TeamRole: db.TeamRoleEnum(role),
	})
}

func (s *AdminService) TransferTeamMember(ctx context.Context, fromTeamID, toTeamID, userID string) error {
	fID := util.ParseUUID(fromTeamID)
	tID := util.ParseUUID(toTeamID)
	uID := util.ParseUUID(userID)

	// Enforce safety rule: Prevent moving the last admin out of the current team
	adminCount, err := s.queries.GetTeamAdminCount(ctx, fID)
	if err != nil {
		return err
	}

	if adminCount <= 1 {
		members, _ := s.GetTeamMembers(ctx, fromTeamID, "", "SUPER_ADMIN")
		for _, m := range members {
			if m.ID == userID && m.TeamRole == "TEAM_ADMIN" {
				return errors.New("cannot transfer the last Team Admin. Promote someone else on this team first")
			}
		}
	}

	// Remove from old team
	err = s.queries.RemoveTeamMember(ctx, db.RemoveTeamMemberParams{
		TeamID: fID,
		UserID: uID,
	})
	if err != nil {
		return err
	}

	// Insert into new team (defaults to MEMBER role)
	return s.queries.UpsertTeamMember(ctx, db.UpsertTeamMemberParams{
		TeamID:   tID,
		UserID:   uID,
		TeamRole: "MEMBER",
	})
}

func (s *AdminService) GetAssignedOrgUsers(ctx context.Context, orgID string) ([]schemas.AssignedUserResponse, error) {
	dbUsers, err := s.queries.GetAssignedOrgUsers(ctx, util.ParseUUID(orgID))
	if err != nil {
		return nil, err
	}

	var users []schemas.AssignedUserResponse
	for _, u := range dbUsers {
		fullName := strings.TrimSpace(u.FirstName.String + " " + u.LastName.String)
		if fullName == "" {
			fullName = "Pending Acceptance"
		}

		users = append(users, schemas.AssignedUserResponse{
			ID:       u.ID.String(),
			FullName: fullName,
			EmailID:  u.EmailID,
			Status:   string(u.Status.UserStatus),
		})
	}
	if users == nil {
		users = []schemas.AssignedUserResponse{}
	}
	return users, nil
}

func (s *AdminService) GetUserTeams(ctx context.Context, userID string) ([]schemas.UserTeamResponse, error) {
	dbTeams, err := s.queries.GetUserTeams(ctx, util.ParseUUID(userID))
	if err != nil {
		return nil, err
	}

	var teams []schemas.UserTeamResponse
	for _, t := range dbTeams {
		teams = append(teams, schemas.UserTeamResponse{
			TeamID:   t.ID.String(),
			TeamName: t.Name,
			TeamRole: t.TmTeamRole,
		})
	}
	if teams == nil {
		teams = []schemas.UserTeamResponse{}
	}
	return teams, nil
}

func (s *AdminService) UpdateUserSystemProfile(ctx context.Context, userID string, role string, status string) error {
	if status == "INVITED" {
		return errors.New("invalid operation: cannot manually revert a user's status to INVITED")
	}
	uID := util.ParseUUID(userID)

	if err := s.queries.UpdateUserStatus(ctx, db.UpdateUserStatusParams{
		Status: db.NullUserStatus{
			UserStatus: db.UserStatus(status),
			Valid:      true, // <-- THIS FIXES THE BUG
		},
		ID: uID,
	}); err != nil {
		return err
	}

	// 2. Wipe old system roles
	if err := s.queries.DeleteUserSystemRoles(ctx, uID); err != nil {
		return err
	}

	// 3. Insert the new system role
	if err := s.queries.InsertUserSystemRole(ctx, db.InsertUserSystemRoleParams{
		UserID: uID,
		Role:   db.SystemRole(role),
	}); err != nil {
		return err
	}

	return nil
}

func (s *AdminService) GetAdminManagedTeams(ctx context.Context, userID string) ([]db.GetAdminManagedTeamsRow, error) {
	return s.queries.GetAdminManagedTeams(ctx, util.ParseUUID(userID))
}
