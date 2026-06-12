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
