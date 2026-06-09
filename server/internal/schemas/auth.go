package schemas

// --- Requests ---

type RegisterOrgRequest struct {
	OrgName        string `json:"org_name" binding:"required"`
	OrgDomain      string `json:"org_domain"`
	AdminFirstName string `json:"admin_first_name" binding:"required"`
	AdminLastName  string `json:"admin_last_name"`
	AdminEmail     string `json:"admin_email" binding:"required,email"`
	AdminPhone     string `json:"admin_phone" binding:"required"`
	AdminPassword  string `json:"admin_password" binding:"required,min=8"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type InviteUserRequest struct {
	Email     string `json:"email" binding:"required,email"`
	FirstName string `json:"first_name" binding:"required"`
	LastName  string `json:"last_name"`
	Role      string `json:"role" binding:"required,oneof=ADMIN EMPLOYEE"`
}

type AcceptInviteRequest struct {
	Token       string `json:"token" binding:"required"` // The JWT from the URL
	Phone       string `json:"phone" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=8"`
}

// --- Responses ---

type TokenResponse struct {
	AccessToken string `json:"access_token"`
	// RefreshToken string `json:"refresh_token,omitempty"`
}

type MessageResponse struct {
	Message string `json:"message"`
}
