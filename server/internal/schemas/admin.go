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
