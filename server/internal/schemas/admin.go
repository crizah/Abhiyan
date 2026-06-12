package schemas

type PaginatedUsersResponse struct {
	TotalCount int64             `json:"total_count"`
	Users      []OrgUserResponse `json:"users"`
}

type OrgUserResponse struct {
	ID       string   `json:"id"`
	FullName string   `json:"full_name"`
	EmailID  string   `json:"email_id"`
	Status   string   `json:"status"`
	Roles    []string `json:"roles"`
}

type TeamEmployeeResponse struct {
	ID       string `json:"id"`
	FullName string `json:"full_name"`
	EmailID  string `json:"email_id"`
	Status   string `json:"status"`
	TeamName string `json:"team_name"`
	TeamRole string `json:"team_role"`
}

type PaginatedEmployeesResponse struct {
	TotalCount int64                  `json:"total_count"`
	Employees  []TeamEmployeeResponse `json:"employees"`
}

type UnassignedUserResponse struct {
	ID       string `json:"id"`
	FullName string `json:"full_name"`
	EmailID  string `json:"email_id"`
	Status   string `json:"status"`
}

type TeamResponse struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	MemberCount int64  `json:"member_count"`
}

type TeamMemberResponse struct {
	ID       string `json:"id"`
	FullName string `json:"full_name"`
	EmailID  string `json:"email_id"`
	TeamRole string `json:"team_role"`
}

type CreateTeamRequest struct {
	Name string `json:"name" binding:"required"`
}

type AssignTeamMemberRequest struct {
	UserID   string `json:"user_id" binding:"required"`
	TeamRole string `json:"team_role" binding:"required,oneof=TEAM_ADMIN MEMBER"`
}
