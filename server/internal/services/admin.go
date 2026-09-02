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
	"github.com/google/uuid"
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
	email := strings.ToLower(strings.TrimSpace(req.Email))
	orgID, err := util.ParseUUID(adminOrgID)
	if err != nil {
		return "", err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	qtx := s.queries.WithTx(tx)

	// Multi-org: an invite either creates a brand-new shared identity, or —
	// if this email already has one from another org — just attaches a new
	// org membership to it. Either way the person's password/profile is
	// untouched here; that only happens once (at their very first accept).
	var userID uuid.UUID
	existing, err := qtx.GetUserByEmail(ctx, email)
	if err == nil {
		userID = existing.ID
	} else if errors.Is(err, sql.ErrNoRows) {
		newUser, err := qtx.CreateInvitedUser(ctx, email)
		if err != nil {
			return "", errors.New("user with this email may already exist")
		}
		userID = newUser.ID
	} else {
		return "", err
	}

	if _, err := qtx.CreateOrgMembership(ctx, db.CreateOrgMembershipParams{
		UserID: userID,
		OrgID:  orgID,
		Status: db.UserStatusINVITED,
	}); err != nil {
		return "", errors.New("user is already invited to or a member of this organization")
	}

	_, err = qtx.AddUserSystemRole(ctx, db.AddUserSystemRoleParams{
		UserID: userID,
		OrgID:  orgID,
		Role:   db.SystemRole(req.Role),
	})
	if err != nil {
		return "", err
	}

	if err := tx.Commit(); err != nil {
		return "", err
	}

	token, err := util.GenerateInviteToken(email, adminOrgID, req.Role, s.JwtSecret, 48*time.Hour)
	if err != nil {
		return "", err
	}

	orgName, err := s.queries.GetOrganizationName(ctx, orgID)
	if err != nil {
		return "", err
	}

	frontendURL := os.Getenv("FRONTEND_URL")
	link := fmt.Sprintf("%s/accept-invite?token=%s", frontendURL, token)
	err = s.onionApp.Enqueue(ctx, "send_invite_email", map[string]any{"email": email, "orgName": orgName, "link": link})
	if err != nil {
		return "", err
	}

	return token, nil
}

func (s *AdminService) GetTotalUsers(ctx context.Context, orgID string) (int64, error) {
	parsedOrgID, err := util.ParseUUID(orgID)
	if err != nil {
		return 0, err
	}
	return s.queries.GetTotalUsersByOrg(ctx, parsedOrgID)
}

func (s *AdminService) GetAdminTeamUsersCount(ctx context.Context, userID string, orgID string) (int64, error) {
	uID, err := util.ParseUUID(userID)
	if err != nil {
		return 0, err
	}
	oID, err := util.ParseUUID(orgID)
	if err != nil {
		return 0, err
	}
	return s.queries.GetTotalUsersInAdminTeams(ctx, db.GetTotalUsersInAdminTeamsParams{
		UserID: uID,
		OrgID:  oID,
	})
}

func (s *AdminService) GetAdminDashboardStats(ctx context.Context, userID string, orgID string) (*schemas.AdminDashboardStatsResponse, error) {
	uID, err := util.ParseUUID(userID)
	if err != nil {
		return nil, err
	}
	oID, err := util.ParseUUID(orgID)
	if err != nil {
		return nil, err
	}

	// 1. Get overarching total distinct users
	totalUsers, err := s.queries.GetTotalUsersInAdminTeams(ctx, db.GetTotalUsersInAdminTeamsParams{UserID: uID, OrgID: oID})
	if err != nil {
		return nil, err
	}

	// 2. Get breakdown per team
	dbTeams, err := s.queries.GetAdminTeamWiseStats(ctx, db.GetAdminTeamWiseStatsParams{UserID: uID, OrgID: oID})
	if err != nil {
		return nil, err
	}

	var teamStats []schemas.TeamStatResponse
	for _, t := range dbTeams {
		teamStats = append(teamStats, schemas.TeamStatResponse{
			TeamID:      t.ID.String(),
			TeamName:    t.Name,
			MemberCount: int(t.MemberCount),
		})
	}

	// Prevent null JSON arrays
	if teamStats == nil {
		teamStats = []schemas.TeamStatResponse{}
	}

	return &schemas.AdminDashboardStatsResponse{
		TotalUsers: totalUsers,
		Teams:      teamStats,
	}, nil
}

func (s *AdminService) GetOrgUsers(ctx context.Context, orgID string, limit, offset int32, searchTerm string, roleFilter string, statusFilter string) (*schemas.PaginatedUsersResponse, error) {
	parsedOrgID, err := util.ParseUUID(orgID)
	if err != nil {
		return nil, err
	}

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
			Status:   string(u.Status),
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

func (s *AdminService) GetTeamEmployees(ctx context.Context, userID string, orgID string, limit, offset int32, search string, teamFilter string, roleFilter string, statusFilter string) (*schemas.PaginatedEmployeesResponse, error) {
	parsedUserID, err := util.ParseUUID(userID)
	if err != nil {
		return nil, err
	}
	parsedOrgID, err := util.ParseUUID(orgID)
	if err != nil {
		return nil, err
	}

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
		CallerOrgID:  parsedOrgID,
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
			Status:   string(u.Status),
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

func (s *AdminService) GetAdminTeamNames(ctx context.Context, userID string, orgID string) ([]string, error) {
	uID, err := util.ParseUUID(userID)
	if err != nil {
		return nil, err
	}
	oID, err := util.ParseUUID(orgID)
	if err != nil {
		return nil, err
	}
	names, err := s.queries.GetAdminTeamNames(ctx, db.GetAdminTeamNamesParams{
		UserID: uID,
		OrgID:  oID,
	})
	if err != nil {
		return nil, err
	}
	if names == nil {
		return []string{}, nil
	}
	return names, nil
}

func (s *AdminService) GetUnassignedOrgUsers(ctx context.Context, orgID string, limit, offset int32) (*schemas.PaginatedUnassignedUsersResponse, error) {
	parsedOrgID, err := util.ParseUUID(orgID)
	if err != nil {
		return nil, err
	}
	dbUsers, err := s.queries.GetUnassignedOrgUsers(ctx, db.GetUnassignedOrgUsersParams{
		OrgID:  parsedOrgID,
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		return nil, err
	}

	var users []schemas.UnassignedUserResponse
	var totalCount int64 = 0

	if len(dbUsers) > 0 {
		totalCount = dbUsers[0].TotalCount
	}

	for _, u := range dbUsers {
		fullName := strings.TrimSpace(u.FirstName.String + " " + u.LastName.String)
		if fullName == "" {
			fullName = "Pending Acceptance"
		}
		users = append(users, schemas.UnassignedUserResponse{
			ID:       u.ID.String(),
			FullName: fullName,
			EmailID:  u.EmailID,
			Status:   string(u.Status),
		})
	}

	if users == nil {
		users = []schemas.UnassignedUserResponse{}
	}

	return &schemas.PaginatedUnassignedUsersResponse{
		TotalCount: totalCount,
		Users:      users,
	}, nil
}

func (s *AdminService) CreateTeam(ctx context.Context, orgID, name, creatorID string) (string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	qtx := s.queries.WithTx(tx)

	parsedOrgID, err := util.ParseUUID(orgID)
	if err != nil {
		return "", err
	}
	parsedCreatorID, err := util.ParseUUID(creatorID)
	if err != nil {
		return "", err
	}

	// 1. Create the Team
	teamID, err := qtx.CreateTeam(ctx, db.CreateTeamParams{
		OrgID: parsedOrgID,
		Name:  name,
	})
	if err != nil {
		return "", errors.New("a team with this name may already exist")
	}

	// 2. Automatically make the creator the TEAM_ADMIN
	err = qtx.UpsertTeamMember(ctx, db.UpsertTeamMemberParams{
		TeamID:   teamID,
		UserID:   parsedCreatorID,
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
	parsedOrgID, err := util.ParseUUID(orgID)
	if err != nil {
		return nil, err
	}
	dbTeams, err := s.queries.GetOrgTeams(ctx, parsedOrgID)
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
	tID, err := util.ParseUUID(teamID)
	if err != nil {
		return nil, err
	}
	uID, err := util.ParseUUID(userID)
	if err != nil {
		return nil, err
	}

	// SECURITY GUARD: this is reachable by any authenticated user (not just
	// admins), so the only thing that matters is org membership — verify the
	// requester actually belongs to this team's organization.
	belongs, err := s.queries.CheckUserBelongsToTeamOrg(ctx, db.CheckUserBelongsToTeamOrgParams{ID: tID, UserID: uID})
	if err != nil {
		return nil, fmt.Errorf("failed to verify organization: %w", err)
	}
	if !belongs {
		return nil, errors.New("unauthorized: this team does not belong to your organization")
	}

	return s.fetchTeamMembers(ctx, tID)
}

// fetchTeamMembers is the unguarded core of GetTeamMembers, for internal callers
// that have already established the caller is authorized (e.g. ManageTeamMember's
// own last-admin check) and don't have a real "requester" to run the org check against.
func (s *AdminService) fetchTeamMembers(ctx context.Context, tID uuid.UUID) ([]schemas.TeamMemberResponse, error) {
	dbMembers, err := s.queries.GetTeamMembersDetails(ctx, tID)
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

func (s *AdminService) ManageTeamMember(ctx context.Context, teamID, userID, role string, isRemoval bool, reqUserID string) error {
	tID, err := util.ParseUUID(teamID)
	if err != nil {
		return err
	}
	uID, err := util.ParseUUID(userID)
	if err != nil {
		return err
	}
	reqUID, err := util.ParseUUID(reqUserID)
	if err != nil {
		return err
	}

	teamOrgID, err := s.queries.GetTeamOrgID(ctx, tID)
	if err != nil {
		return fmt.Errorf("failed to verify team's organization: %w", err)
	}

	// 0. Cross-org guard: neither the requester nor the target may act on a team
	// outside their own organization, regardless of role — a SUPER_ADMIN is only
	// super over their own org, not every org in the system.
	reqBelongs, err := s.queries.CheckUserBelongsToTeamOrg(ctx, db.CheckUserBelongsToTeamOrgParams{ID: tID, UserID: reqUID})
	if err != nil {
		return fmt.Errorf("failed to verify requester's organization: %w", err)
	}
	if !reqBelongs {
		return errors.New("action blocked: you do not belong to this team's organization")
	}

	if !isRemoval {
		belongs, err := s.queries.CheckUserBelongsToTeamOrg(ctx, db.CheckUserBelongsToTeamOrgParams{ID: tID, UserID: uID})
		if err != nil {
			return fmt.Errorf("failed to verify user's organization: %w", err)
		}
		if !belongs {
			return errors.New("action blocked: user does not belong to this team's organization")
		}
	}

	// 1. Authorization Check: Get the requester's system roles, scoped to this team's org
	reqSysRoles, err := s.queries.GetUserSystemRoles(ctx, db.GetUserSystemRolesParams{
		UserID: reqUID,
		OrgID:  teamOrgID,
	})
	if err != nil {
		return fmt.Errorf("failed to check requester roles: %w", err)
	}

	// Check if requester is a SUPER_ADMIN
	isSuperAdmin := false
	for _, r := range reqSysRoles {
		if string(r) == "SUPER_ADMIN" {
			isSuperAdmin = true
			break
		}
	}

	// 2. Authorization Check: If NOT a Super Admin, verify they manage this specific team
	if !isSuperAdmin {
		teamIds, err := s.queries.GetAdminManagedTeams(ctx, db.GetAdminManagedTeamsParams{
			UserID: reqUID,
			OrgID:  teamOrgID,
		})
		if err != nil {
			return fmt.Errorf("failed to verify managed teams: %w", err)
		}

		isTeamManager := false
		for _, t := range teamIds {
			if t.ID == tID {
				isTeamManager = true
				break
			}
		}

		if !isTeamManager {
			return errors.New("action blocked: You do not manage this team")
		}
	}

	// 3. Role Validation: Only System Admins/Super Admins can be made TEAM_ADMINs
	if !isRemoval && role == "TEAM_ADMIN" {
		sysRoles, err := s.queries.GetUserSystemRoles(ctx, db.GetUserSystemRolesParams{
			UserID: uID,
			OrgID:  teamOrgID,
		})
		if err != nil {
			return fmt.Errorf("failed to fetch target user roles: %w", err)
		}

		isSystemAdmin := false
		for _, r := range sysRoles {
			if string(r) == "ADMIN" || string(r) == "SUPER_ADMIN" {
				isSystemAdmin = true
				break
			}
		}

		if !isSystemAdmin {
			return errors.New("action blocked: Only System Admins or Super Admins can be made Team Admins")
		}
	}

	// 4. Safety Check: Prevent removing or demoting the last Team Admin
	if isRemoval || role == "MEMBER" {
		adminCount, err := s.queries.GetTeamAdminCount(ctx, tID)
		if err != nil {
			return fmt.Errorf("failed to get team admin count: %w", err)
		}

		if adminCount <= 1 {
			// Using your existing GetTeamMembers function to check the target's current role
			members, err := s.fetchTeamMembers(ctx, tID)
			if err == nil {
				for _, m := range members {
					if m.ID == userID && m.TeamRole == "TEAM_ADMIN" {
						return errors.New("cannot remove or demote the last Team Admin. Promote someone else first")
					}
				}
			}
		}
	}

	// 5. Execute DB Transaction
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

func (s *AdminService) TransferTeamMember(ctx context.Context, fromTeamID, toTeamID, userID, reqUserID string) error {
	fID, err := util.ParseUUID(fromTeamID)
	if err != nil {
		return err
	}
	tID, err := util.ParseUUID(toTeamID)
	if err != nil {
		return err
	}
	uID, err := util.ParseUUID(userID)
	if err != nil {
		return err
	}
	reqUID, err := util.ParseUUID(reqUserID)
	if err != nil {
		return err
	}

	// Cross-org guard: requester, target user, source team and destination team
	// must all belong to the same organization — a SUPER_ADMIN's reach stops at
	// their own org's boundary.
	reqBelongsFrom, err := s.queries.CheckUserBelongsToTeamOrg(ctx, db.CheckUserBelongsToTeamOrgParams{ID: fID, UserID: reqUID})
	if err != nil {
		return fmt.Errorf("failed to verify organization: %w", err)
	}
	reqBelongsTo, err := s.queries.CheckUserBelongsToTeamOrg(ctx, db.CheckUserBelongsToTeamOrgParams{ID: tID, UserID: reqUID})
	if err != nil {
		return fmt.Errorf("failed to verify organization: %w", err)
	}
	targetBelongsFrom, err := s.queries.CheckUserBelongsToTeamOrg(ctx, db.CheckUserBelongsToTeamOrgParams{ID: fID, UserID: uID})
	if err != nil {
		return fmt.Errorf("failed to verify organization: %w", err)
	}
	if !reqBelongsFrom || !reqBelongsTo || !targetBelongsFrom {
		return errors.New("action blocked: teams or user are outside your organization")
	}

	// Enforce safety rule: Prevent moving the last admin out of the current team
	adminCount, err := s.queries.GetTeamAdminCount(ctx, fID)
	if err != nil {
		return err
	}

	if adminCount <= 1 {
		members, _ := s.fetchTeamMembers(ctx, fID)
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

func (s *AdminService) GetAssignedOrgUsers(ctx context.Context, orgID string, limit, offset int32) (*schemas.PaginatedAssignedUsersResponse, error) {
	parsedOrgID, err := util.ParseUUID(orgID)
	if err != nil {
		return nil, err
	}
	dbUsers, err := s.queries.GetAssignedOrgUsers(ctx, db.GetAssignedOrgUsersParams{
		OrgID:  parsedOrgID,
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		return nil, err
	}

	var users []schemas.AssignedUserResponse
	var totalCount int64 = 0

	if len(dbUsers) > 0 {
		totalCount = dbUsers[0].TotalCount
	}

	for _, u := range dbUsers {
		fullName := strings.TrimSpace(u.FirstName.String + " " + u.LastName.String)
		if fullName == "" {
			fullName = "Pending Acceptance"
		}
		users = append(users, schemas.AssignedUserResponse{
			ID:       u.ID.String(),
			FullName: fullName,
			EmailID:  u.EmailID,
			Status:   string(u.Status),
		})
	}

	if users == nil {
		users = []schemas.AssignedUserResponse{}
	}

	return &schemas.PaginatedAssignedUsersResponse{
		TotalCount: totalCount,
		Users:      users,
	}, nil
}

func (s *AdminService) GetUserTeams(ctx context.Context, userID string, callerOrgID string) ([]schemas.UserTeamResponse, error) {
	uID, err := util.ParseUUID(userID)
	if err != nil {
		return nil, err
	}
	oID, err := util.ParseUUID(callerOrgID)
	if err != nil {
		return nil, err
	}

	belongs, err := s.queries.IsUserInOrg(ctx, db.IsUserInOrgParams{UserID: uID, OrgID: oID})
	if err != nil {
		return nil, fmt.Errorf("failed to verify user's organization: %w", err)
	}
	if !belongs {
		return nil, errors.New("unauthorized: user does not belong to your organization")
	}

	dbTeams, err := s.queries.GetUserTeams(ctx, db.GetUserTeamsParams{
		UserID: uID,
		OrgID:  oID,
	})
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

func (s *AdminService) UpdateUserSystemProfile(ctx context.Context, userID string, role string, status string, callerOrgID string) error {
	if status == "INVITED" {
		return errors.New("invalid operation: cannot manually revert a user's status to INVITED")
	}
	uID, err := util.ParseUUID(userID)
	if err != nil {
		return err
	}
	orgID, err := util.ParseUUID(callerOrgID)
	if err != nil {
		return err
	}

	belongs, err := s.queries.IsUserInOrg(ctx, db.IsUserInOrgParams{UserID: uID, OrgID: orgID})
	if err != nil {
		return fmt.Errorf("failed to verify user's organization: %w", err)
	}
	if !belongs {
		return errors.New("unauthorized: user does not belong to your organization")
	}

	// 1. Update membership status (this org only)
	if err := s.queries.UpdateMembershipStatus(ctx, db.UpdateMembershipStatusParams{
		Status: db.UserStatus(status),
		UserID: uID,
		OrgID:  orgID,
	}); err != nil {
		return err
	}

	// 2. Wipe old system roles (this org only — must not touch roles the
	// person holds in any other org they belong to)
	if err := s.queries.DeleteUserSystemRoles(ctx, db.DeleteUserSystemRolesParams{
		UserID: uID,
		OrgID:  orgID,
	}); err != nil {
		return err
	}

	// 3. Insert the new system role
	if err := s.queries.InsertUserSystemRole(ctx, db.InsertUserSystemRoleParams{
		UserID: uID,
		OrgID:  orgID,
		Role:   db.SystemRole(role),
	}); err != nil {
		return err
	}

	return nil
}

func (s *AdminService) GetAdminManagedTeams(ctx context.Context, userID string, orgID string) ([]schemas.TeamResponse, error) {
	uID, err := util.ParseUUID(userID)
	if err != nil {
		return nil, err
	}
	oID, err := util.ParseUUID(orgID)
	if err != nil {
		return nil, err
	}
	dbTeams, err := s.queries.GetAdminManagedTeams(ctx, db.GetAdminManagedTeamsParams{
		UserID: uID,
		OrgID:  oID,
	})
	if err != nil {
		return nil, err
	}

	var teams []schemas.TeamResponse
	for _, t := range dbTeams {
		teams = append(teams, schemas.TeamResponse{
			ID:          t.ID.String(),
			Name:        t.Name,
			MemberCount: int(t.MemberCount), // Properly forwards the aggregated count to your frontend column
		})
	}

	if teams == nil {
		teams = []schemas.TeamResponse{}
	}
	return teams, nil
}

func (s *AdminService) DeleteOrganization(ctx context.Context, orgID string) error {
	parsedOrgID, err := util.ParseUUID(orgID)
	if err != nil {
		return err
	}
	return s.queries.DeleteOrganization(ctx, parsedOrgID)
}

func (s *AdminService) SetAttendanceEnabled(ctx context.Context, orgID string, enabled bool) error {
	parsedOrgID, err := util.ParseUUID(orgID)
	if err != nil {
		return err
	}
	return s.queries.SetOrgAttendanceEnabled(ctx, db.SetOrgAttendanceEnabledParams{
		ID:                parsedOrgID,
		AttendanceEnabled: enabled,
	})

}
