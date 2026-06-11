package handlers

import (
	"net/http"

	"github.com/crizah/Abhiyan/server/internal/schemas"
	"github.com/crizah/Abhiyan/server/internal/services"
	"github.com/gin-gonic/gin"
)

type AdminHandler struct {
	adminService *services.AdminService
}

func NewAdminHandler(svc *services.AdminService) *AdminHandler {
	return &AdminHandler{adminService: svc}
}

func (h *AdminHandler) InviteUser(c *gin.Context) {
	var req schemas.InviteUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	adminOrgID := c.MustGet("org_id").(string)

	token, err := h.adminService.InviteUser(c.Request.Context(), adminOrgID, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":     "Invite sent successfully",
		"debug_token": token,
	})
}

func (h *AdminHandler) GetDashboardStats(c *gin.Context) {
	orgID := c.MustGet("org_id").(string)

	count, err := h.adminService.GetTotalUsers(c.Request.Context(), orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch statistics"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"total_users": count,
	})
}

func (h *AdminHandler) GetAdminTeamStats(c *gin.Context) {
	// Extract the securely injected User ID
	userID := c.MustGet("user_id").(string)

	count, err := h.adminService.GetAdminTeamUsersCount(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch team statistics"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"total_users": count})
}
