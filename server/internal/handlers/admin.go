package handlers

import (
	"net/http"
	"strconv"

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

func (h *AdminHandler) GetOrgUsers(c *gin.Context) {
	orgID := c.MustGet("org_id").(string)

	// Extract pagination and search params from the query string
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "10"))
	searchTerm := c.Query("search")

	// Calculate SQL Offset
	offset := (page - 1) * pageSize

	response, err := h.adminService.GetOrgUsers(c.Request.Context(), orgID, int32(pageSize), int32(offset), searchTerm)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch users"})
		return
	}

	c.JSON(http.StatusOK, response)
}

func (h *AdminHandler) GetTeamEmployees(c *gin.Context) {

	userID := c.MustGet("user_id").(string)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "10"))

	search := c.Query("search")
	team := c.Query("team")
	role := c.Query("role")
	status := c.Query("status")

	offset := (page - 1) * pageSize

	response, err := h.adminService.GetTeamEmployees(c.Request.Context(), userID, int32(pageSize), int32(offset), search, team, role, status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch team employees"})
		return
	}

	c.JSON(http.StatusOK, response)
}

func (h *AdminHandler) GetAdminTeamOptions(c *gin.Context) {
	userID := c.MustGet("user_id").(string)

	teams, err := h.adminService.GetAdminTeamNames(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch teams"})
		return
	}

	c.JSON(http.StatusOK, teams)
}
