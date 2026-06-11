package handlers

import (
	"net/http"
	"os"
	"time"

	"github.com/crizah/Abhiyan/server/internal/services"
	"github.com/crizah/Abhiyan/server/internal/util"

	"github.com/crizah/Abhiyan/server/internal/schemas"
	"github.com/gin-gonic/gin"
)

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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to register organization"})
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

	// 3. Fetch the freshest Organization Name from the database
	orgName, err := h.authService.GetOrganizationName(c.Request.Context(), claims.OrgID)
	if err != nil {
		orgName = "Unknown Organization" // Safe fallback
	}

	// 4. Send the combined data back to React
	c.JSON(http.StatusOK, gin.H{
		"id":       claims.UserID,
		"org_id":   claims.OrgID,
		"org_name": orgName,
		"role":     claims.Role,
		"email":    claims.Email,
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

func (h *AuthHandler) Login(c *gin.Context) {
	var req schemas.LoginRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, err := h.authService.Login(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	// 1. Read configuration from environment
	cookieDomain := os.Getenv("COOKIE_DOMAIN")

	if cookieDomain == "localhost" {
		cookieDomain = ""
	}

	isSecure := os.Getenv("APP_ENV") == "production"

	// 2. Set the dynamic httpOnly cookie
	c.SetCookie("access_token", token, 86400, "/", cookieDomain, isSecure, true)

	c.JSON(http.StatusOK, gin.H{"message": "Successfully logged in"})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	cookieDomain := os.Getenv("COOKIE_DOMAIN")
	isSecure := os.Getenv("APP_ENV") == "production"

	// To delete a cookie, set its maxAge to -1
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

func (h *AuthHandler) SwitchRole(c *gin.Context) {
	type SwitchRoleRequest struct {
		TargetRole string `json:"target_role" binding:"required,oneof=SUPER_ADMIN ADMIN EMPLOYEE"`
	}

	var req SwitchRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get the core account identity from the current context token
	userIDStr := c.MustGet("user_id").(string)
	userID := util.ParseUUID(userIDStr)
	orgIDStr := c.MustGet("org_id").(string)
	emailStr := c.MustGet("email").(string)

	// Query DB to check if they actually possess the role they want to swap to
	roles, err := h.authService.Queries.GetUserSystemRoles(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify privileges"})
		return
	}

	hasPrivilege := false
	for _, r := range roles {
		if string(r) == req.TargetRole {
			hasPrivilege = true
			break
		}
	}

	// If they are a SUPER_ADMIN, they inherit the right to drop down to any role context
	for _, r := range roles {
		if string(r) == "SUPER_ADMIN" {
			hasPrivilege = true
		}
	}

	if !hasPrivilege {
		c.JSON(http.StatusForbidden, gin.H{"error": "You do not possess this role option"})
		return
	}

	// Mint a brand new token with the modified active role context
	newToken, err := util.GenerateAccessToken(
		userIDStr,
		orgIDStr,
		req.TargetRole, // The context they elected to assume
		emailStr,
		h.authService.JwtSecret,
		24*time.Hour,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update security context"})
		return
	}

	// Overwrite their existing access token cookie
	cookieDomain := os.Getenv("COOKIE_DOMAIN")
	if cookieDomain == "localhost" {
		cookieDomain = ""
	}
	isSecure := os.Getenv("APP_ENV") == "production"

	c.SetCookie("access_token", newToken, 86400, "/", cookieDomain, isSecure, true)
	c.JSON(http.StatusOK, gin.H{"message": "Context switched successfully"})
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
