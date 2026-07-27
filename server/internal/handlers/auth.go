package handlers

import (
	"net/http"
	"os"
	"time"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/services"
	"github.com/crizah/Abhiyan/server/internal/util"
	"github.com/google/uuid"

	"github.com/crizah/Abhiyan/server/internal/schemas"
	"github.com/gin-gonic/gin"
)

// cookieConfig returns the domain and secure flag for auth cookies.
// In Lambda (cross-origin), domain is empty so the browser scopes the cookie
// to the exact API host. Locally, COOKIE_DOMAIN drives the value.
func cookieConfig() (domain string, secure bool, sameSite http.SameSite) {
	if os.Getenv("AWS_LAMBDA_FUNCTION_NAME") != "" {
		// Cross-origin (Vercel → API Gateway): SameSite=None requires Secure=true
		return "", true, http.SameSiteNoneMode
	}
	d := os.Getenv("COOKIE_DOMAIN")
	if d == "localhost" {
		d = ""
	}
	// Local dev: SameSite=Lax works fine for same-origin requests
	return d, false, http.SameSiteLaxMode
}

// setSessionCookie mints the one shared httpOnly session cookie — used by
// every path that issues or re-issues a session (Login, GoogleLogin,
// SelectOrg, SwitchRole) so they all agree on domain/secure/SameSite.
func setSessionCookie(c *gin.Context, token string) {
	cookieDomain, isSecure, sameSite := cookieConfig()
	c.SetSameSite(sameSite)
	c.SetCookie("access_token", token, 86400, "/", cookieDomain, isSecure, true)
}

type AuthHandler struct {
	authService *services.AuthService
}

func NewAuthHandler(svc *services.AuthService) *AuthHandler {
	return &AuthHandler{authService: svc}
}

func (h *AuthHandler) RegisterOrg(c *gin.Context) {
	var req schemas.RegisterOrgRequest

	// ShouldBindJSON automatically validates based on the struct tags
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := h.authService.RegisterOrganization(c.Request.Context(), req)
	if err != nil {
		// In production, check for duplicate key errors (like email already exists)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, schemas.MessageResponse{Message: "Organization and Super Admin created successfully"})
}
func (h *AuthHandler) Me(c *gin.Context) {
	// 1. Read the cookie
	tokenString, err := c.Cookie("access_token")
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}

	// 2. Decode the token
	claims, err := util.VerifyAccessToken(tokenString, h.authService.JwtSecret)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
		return
	}

	// 3. Fetch org info (name + attendance toggle state) from DB
	orgInfo, err := h.authService.GetOrgInfo(c.Request.Context(), claims.OrgID)
	orgName := "Unknown Organization"
	attendanceEnabled := false
	if err == nil {
		orgName = orgInfo.Name
		attendanceEnabled = orgInfo.AttendanceEnabled
	}

	// 4. Check whether this user has a face registered
	user, err := h.authService.Queries.GetUserByEmail(c.Request.Context(), claims.Email)
	faceRegistered := err == nil && user.FaceS3Uri.Valid && user.FaceS3Uri.String != ""

	// 5. Every org this person belongs to, for the header's org-switcher menu
	// — works unchanged for a single-org user, who just gets a 1-item list.
	orgs := []schemas.OrgOption{}
	if memberships, mErr := h.authService.Queries.GetUserOrgMemberships(c.Request.Context(), util.ParseUUID(claims.UserID)); mErr == nil {
		for _, m := range memberships {
			orgs = append(orgs, schemas.OrgOption{
				OrgID:   m.OrgID.String(),
				OrgName: m.OrgName,
				Roles:   util.ParsePGTextArray(m.Roles),
			})
		}
	}

	// 6. Send the combined data back to React
	c.JSON(http.StatusOK, gin.H{
		"id":                 claims.UserID,
		"org_id":             claims.OrgID,
		"org_name":           orgName,
		"role":               claims.Role,
		"email":              claims.Email,
		"attendance_enabled": attendanceEnabled,
		"face_registered":    faceRegistered,
		"available_orgs":     orgs,
	})
}

// func (h *AuthHandler) GetDashboardStats(c *gin.Context) {
// 	// 1. Extract the secure org_id injected by your RequireAuth middleware
// 	orgIDStr := c.MustGet("org_id").(string)
// 	orgID := util.ParseUUID(orgIDStr) // Use your uuid parser helper

// 	// 2. Fetch the count from the DB
// 	count, err := h.authService.Queries.GetTotalUsersByOrg(c.Request.Context(), orgID)
// 	if err != nil {
// 		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch statistics"})
// 		return
// 	}

// 	// 3. Return the exact JSON structure React is expecting
// 	c.JSON(http.StatusOK, gin.H{
// 		"total_users": count,
// 	})
// }

// respondToLoginResult handles both outcomes of a login attempt: a
// single-org account gets its cookie set immediately; a multi-org account
// gets the pending-token/org-list response instead, with no cookie yet.
func respondToLoginResult(c *gin.Context, result *services.LoginResult) {
	if result.RequiresOrgSelection {
		c.JSON(http.StatusOK, schemas.LoginResponse{
			RequiresOrgSelection: true,
			PendingToken:         result.PendingToken,
			Orgs:                 result.Orgs,
		})
		return
	}

	setSessionCookie(c, result.Token)
	c.JSON(http.StatusOK, schemas.LoginResponse{Message: "Successfully logged in"})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req schemas.LoginRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.authService.Login(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	respondToLoginResult(c, result)
}

func (h *AuthHandler) GoogleLogin(c *gin.Context) {
	var req schemas.GoogleLoginRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.authService.LoginWithGoogle(c.Request.Context(), req.Credential)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	respondToLoginResult(c, result)
}

// SelectOrg completes a login that came back with requires_org_selection —
// verifies the short-lived pending token and chosen org, then mints the
// real session cookie exactly like a single-org login would have.
func (h *AuthHandler) SelectOrg(c *gin.Context) {
	var req schemas.SelectOrgRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, err := h.authService.SelectOrg(c.Request.Context(), req.PendingToken, req.OrgID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	setSessionCookie(c, token)
	c.JSON(http.StatusOK, schemas.LoginResponse{Message: "Successfully logged in"})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	cookieDomain, isSecure, sameSite := cookieConfig()

	// To delete a cookie, set its maxAge to -1
	c.SetSameSite(sameSite)
	c.SetCookie("access_token", "", -1, "/", cookieDomain, isSecure, true)
	c.JSON(http.StatusOK, gin.H{"message": "Successfully logged out"})
}

// func (h *AuthHandler) InviteUser(c *gin.Context) {
// 	var req schemas.InviteUserRequest
// 	if err := c.ShouldBindJSON(&req); err != nil {
// 		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
// 		return
// 	}

// 	// Extract the admin's organization ID safely from the JWT context
// 	adminOrgID := c.MustGet("org_id").(string)

// 	token, err := h.authService.InviteUser(c.Request.Context(), adminOrgID, req)
// 	if err != nil {
// 		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
// 		return
// 	}

// 	// Returning the token here so you can grab it in Postman to test the Accept route
// 	c.JSON(http.StatusOK, gin.H{
// 		"message":     "Invite sent successfully",
// 		"debug_token": token,
// 	})
// }

// SwitchRole re-mints the session with a different active role and/or a
// different active org — either field may be omitted, in which case that
// part of the session stays as it currently is. Switching org this way is
// the multi-org "access another org without logging out" mechanism: it swaps
// which org the current browser session is scoped to (matching how Notion/
// Linear/Slack-web switch workspaces), not a second simultaneous session.
func (h *AuthHandler) SwitchRole(c *gin.Context) {
	var req schemas.SwitchContextRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get the core account identity from the current context token
	userIDStr := c.MustGet("user_id").(string)
	userID := util.ParseUUID(userIDStr)
	currentOrgIDStr := c.MustGet("org_id").(string)
	emailStr := c.MustGet("email").(string)

	targetOrgIDStr := req.TargetOrgID
	if targetOrgIDStr == "" {
		targetOrgIDStr = currentOrgIDStr
	}
	targetOrgID := util.ParseUUID(targetOrgIDStr)

	if targetOrgIDStr != currentOrgIDStr {
		belongs, err := h.authService.Queries.IsUserInOrg(c.Request.Context(), db.IsUserInOrgParams{UserID: userID, OrgID: targetOrgID})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify organization"})
			return
		}
		if !belongs {
			c.JSON(http.StatusForbidden, gin.H{"error": "You do not belong to this organization"})
			return
		}
	}

	// Query DB to check what roles they hold in the TARGET org
	roles, err := h.authService.Queries.GetUserSystemRoles(c.Request.Context(), db.GetUserSystemRolesParams{
		UserID: userID,
		OrgID:  uuid.NullUUID{UUID: targetOrgID, Valid: true},
	})
	if err != nil || len(roles) == 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "You have no role in this organization"})
		return
	}

	targetRole := req.TargetRole
	if targetRole == "" {
		// No explicit role requested (a pure org switch) — default to the
		// highest role held in the target org, same rule as first login.
		targetRole = "EMPLOYEE"
		for _, r := range roles {
			if string(r) == "SUPER_ADMIN" {
				targetRole = "SUPER_ADMIN"
				break
			} else if string(r) == "ADMIN" {
				targetRole = "ADMIN"
			}
		}
	} else {
		hasPrivilege := false
		for _, r := range roles {
			roleStr := string(r)
			// SUPER_ADMIN inherits ADMIN and EMPLOYEE; ADMIN inherits EMPLOYEE
			if roleStr == targetRole || roleStr == "SUPER_ADMIN" || (roleStr == "ADMIN" && targetRole == "EMPLOYEE") {
				hasPrivilege = true
				break
			}
		}
		if !hasPrivilege {
			c.JSON(http.StatusForbidden, gin.H{"error": "You do not possess this role option"})
			return
		}
	}

	// Mint a brand new token with the modified active role/org context
	newToken, err := util.GenerateAccessToken(
		userIDStr,
		targetOrgIDStr,
		targetRole,
		emailStr,
		h.authService.JwtSecret,
		24*time.Hour,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update security context"})
		return
	}

	setSessionCookie(c, newToken)
	c.JSON(http.StatusOK, gin.H{"message": "Context switched successfully"})
}

// InvitePreview lets the FE decide which accept-invite form to render before
// the user submits anything (full signup form vs a lightweight "Join Org"
// confirmation for someone who already has an account elsewhere).
func (h *AuthHandler) InvitePreview(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token is required"})
		return
	}

	preview, err := h.authService.PreviewInvite(c.Request.Context(), token)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, preview)
}

func (h *AuthHandler) AcceptInvite(c *gin.Context) {
	var req schemas.AcceptInviteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := h.authService.AcceptInvite(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, schemas.MessageResponse{Message: "Account fully onboarded. You may now log in."})
}

func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req schemas.ForgotPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Always return 200 to avoid email enumeration
	_ = h.authService.ForgotPassword(c.Request.Context(), req.Email)
	c.JSON(http.StatusOK, schemas.MessageResponse{Message: "If that email is registered, a reset link has been sent."})
}

func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req schemas.ResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.authService.ResetPassword(c.Request.Context(), req.Token, req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, schemas.MessageResponse{Message: "Password reset successfully. You may now log in."})
}

func (h *AuthHandler) ResendPublicInvite(c *gin.Context) {
	var req schemas.ResendInviteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := h.authService.ResendPublicInvite(c.Request.Context(), req.Token)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "A fresh invite link has been emailed to you."})
}
