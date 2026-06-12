package handlers

import (
	"net/http"

	"github.com/crizah/Abhiyan/server/internal/schemas"
	"github.com/crizah/Abhiyan/server/internal/services"
	"github.com/gin-gonic/gin"
)

type UserHandler struct {
	userService *services.UserService
}

func NewUserHandler(svc *services.UserService) *UserHandler {
	return &UserHandler{userService: svc}
}

func (h *UserHandler) GetMyProfile(c *gin.Context) {
	// Securely extracted from the JWT context
	userID := c.MustGet("user_id").(string)

	profile, err := h.userService.GetUserProfile(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch profile data"})
		return
	}

	c.JSON(http.StatusOK, profile)
}

func (h *UserHandler) UpdateMyProfile(c *gin.Context) {
	userID := c.MustGet("user_id").(string)

	var req schemas.UpdateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := h.userService.UpdateUserProfile(c.Request.Context(), userID, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update profile"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Profile updated successfully"})
}
