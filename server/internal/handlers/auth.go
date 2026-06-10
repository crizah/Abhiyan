package handlers

import (
	"net/http"

	"github.com/crizah/Abhiyan/server/internal/services"

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

	c.JSON(http.StatusOK, schemas.TokenResponse{AccessToken: token})
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
