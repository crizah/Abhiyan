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

// GoogleLoginRequest carries the ID token ("credential") handed back by
// Google Identity Services on the frontend after the user picks an account.
type GoogleLoginRequest struct {
	Credential string `json:"credential" binding:"required"`
}

type InviteUserRequest struct {
	Email string `json:"email" binding:"required,email"`
	// FirstName string `json:"first_name" binding:"required"`
	// LastName  string `json:"last_name"`
	Role string `json:"role" binding:"required,oneof=ADMIN EMPLOYEE"`
}

// Phone/first_name/new_password are only required for a brand-new identity's
// first-ever accept — a person already registered elsewhere accepting a 2nd
// org's invite sends none of these (see AuthService.AcceptInvite), so binding
// enforces just the token; the service layer enforces the rest conditionally.
type AcceptInviteRequest struct {
	Token       string `json:"token" binding:"required"` // The JWT from the URL
	Phone       string `json:"phone"`
	FirstName   string `json:"first_name"`
	LastName    string `json:"last_name"`
	NewPassword string `json:"new_password"`
}

// InvitePreviewResponse lets the FE pick which accept-invite form to render
// before the user submits anything.
type InvitePreviewResponse struct {
	Email          string `json:"email"`
	OrgName        string `json:"org_name"`
	IsExistingUser bool   `json:"is_existing_user"`
}

// OrgOption is one entry in the org-picker (login) / org-switcher (header) menus.
type OrgOption struct {
	OrgID   string   `json:"org_id"`
	OrgName string   `json:"org_name"`
	Roles   []string `json:"roles"`
}

// LoginResponse covers both outcomes of Login/GoogleLogin: a single-membership
// account logs straight in (cookie already set, message only); a multi-org
// account gets a pending token instead and must call /auth/select-org next.
type LoginResponse struct {
	Message              string      `json:"message"`
	RequiresOrgSelection bool        `json:"requires_org_selection,omitempty"`
	PendingToken         string      `json:"pending_token,omitempty"`
	Orgs                 []OrgOption `json:"orgs,omitempty"`
}

type SelectOrgRequest struct {
	PendingToken string `json:"pending_token" binding:"required"`
	OrgID        string `json:"org_id" binding:"required"`
}

// SwitchContextRequest generalizes the original switch-role request: either
// field may be omitted, in which case that part of the session (role or org)
// stays as it currently is.
type SwitchContextRequest struct {
	TargetRole  string `json:"target_role" binding:"omitempty,oneof=SUPER_ADMIN ADMIN EMPLOYEE"`
	TargetOrgID string `json:"target_org_id" binding:"omitempty,uuid"`
}

// FacePayload is shared across user profile and attendance face registration.
type FacePayload struct {
	FileURL   string `json:"file_url"`
	ObjectKey string `json:"object_key"`
}

// --- Responses ---

type TokenResponse struct {
	AccessToken string `json:"access_token"`
	// RefreshToken string `json:"refresh_token,omitempty"`
}

type MessageResponse struct {
	Message string `json:"message"`
}
type ResendInviteRequest struct {
	Token string `json:"token" binding:"required"`
}

type ForgotPasswordRequest struct {
	Email string `json:"email" binding:"required,email"`
}

type ResetPasswordRequest struct {
	Token       string `json:"token" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=8"`
}
