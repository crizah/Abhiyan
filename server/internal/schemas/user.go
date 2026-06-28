package schemas

type TeamProfile struct {
	TeamName        string   `json:"team_name"`
	UserTeamRole    string   `json:"user_team_role"`
	TeamAdminEmails []string `json:"team_admin_emails"`
}

type UserProfileResponse struct {
	ID          string        `json:"id"`
	FirstName   string        `json:"first_name"`
	LastName    string        `json:"last_name"`
	EmailID     string        `json:"email_id"`
	PhoneNumber string        `json:"phone_number"`
	Status      string        `json:"status"`
	OrgName     string        `json:"org_name"`
	SourceFace  FacePayload   `json:"source_face"`
	SystemRoles []string      `json:"system_roles"`
	Teams       []TeamProfile `json:"teams"`
}

type UpdateProfileRequest struct {
	FirstName   string      `json:"first_name" binding:"required"` // Assuming first name is required
	LastName    string      `json:"last_name"`
	PhoneNumber string      `json:"phone_number"`
	SourceFace  FacePayload `json:"source_face"`
}

type RegisterFaceRequest struct {
	SourceFace FacePayload `json:"source_face" binding:"required"`
}
