package handlers

import (
	"net/http"
	"os"

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

// func (h *AuthHandler) Login(c *gin.Context) {
// 	var req schemas.LoginRequest

// 	if err := c.ShouldBindJSON(&req); err != nil {
// 		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
// 		return
// 	}

// 	token, err := h.authService.Login(c.Request.Context(), req)
// 	if err != nil {
// 		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
// 		return
// 	}

// 	c.JSON(http.StatusOK, schemas.TokenResponse{AccessToken: token})
// }

// func (h *AuthHandler) Logout(c *gin.Context) {
// 	// To delete a cookie, set its maxAge to -1
// 	c.SetCookie("access_token", "", -1, "/", "localhost", false, true)
// 	c.JSON(http.StatusOK, gin.H{"message": "Successfully logged out"})
// }

func (h *AuthHandler) Me(c *gin.Context) {
	// 1. Read the cookie
	tokenString, err := c.Cookie("access_token")
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}

	// 2. Decode the token (Using your existing utility)
	claims, err := util.VerifyAccessToken(tokenString, h.authService.JwtSecret)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
		return
	}

	// 3. Send the user data back to React
	c.JSON(http.StatusOK, gin.H{
		"sub":    claims.UserID,
		"org_id": claims.OrgID,
		"role":   claims.Role,
		"email":  claims.Email,
	})
}

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

func (h *AuthHandler) InviteUser(c *gin.Context) {
	var req schemas.InviteUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Extract the admin's organization ID safely from the JWT context
	adminOrgID := c.MustGet("org_id").(string)

	token, err := h.authService.InviteUser(c.Request.Context(), adminOrgID, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Returning the token here so you can grab it in Postman to test the Accept route
	c.JSON(http.StatusOK, gin.H{
		"message":     "Invite sent successfully",
		"debug_token": token,
	})
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
