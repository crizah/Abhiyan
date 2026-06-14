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
	roleFilter := c.Query("role")
	statusFilter := c.Query("status")

	// Calculate SQL Offset
	offset := (page - 1) * pageSize

	response, err := h.adminService.GetOrgUsers(c.Request.Context(), orgID, int32(pageSize), int32(offset), searchTerm, roleFilter, statusFilter)
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

func (h *AdminHandler) GetUnassignedUsers(c *gin.Context) {
	// Super Admins operate at the Org level
	orgID := c.MustGet("org_id").(string)

	users, err := h.adminService.GetUnassignedOrgUsers(c.Request.Context(), orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch unassigned users"})
		return
	}

	c.JSON(http.StatusOK, users)
}

func (h *AdminHandler) CreateTeam(c *gin.Context) {
	var req schemas.CreateTeamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	orgID := c.MustGet("org_id").(string)
	userID := c.MustGet("user_id").(string) // <-- Extract creator's ID

	teamID, err := h.adminService.CreateTeam(c.Request.Context(), orgID, req.Name, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Team created", "team_id": teamID})
}

func (h *AdminHandler) GetTeams(c *gin.Context) {
	orgID := c.MustGet("org_id").(string)
	teams, err := h.adminService.GetAllOrgTeams(c.Request.Context(), orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch teams"})
		return
	}
	c.JSON(http.StatusOK, teams)
}

func (h *AdminHandler) GetTeamMembers(c *gin.Context) {
	teamID := c.Param("team_id")
	userID := c.Param("user_id")
	roleVal, exists := c.Get("role")
	role := ""
	if exists {
		role = roleVal.(string)
	}

	members, err := h.adminService.GetTeamMembers(c.Request.Context(), teamID, userID, role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, members)
}

func (h *AdminHandler) AssignTeamMember(c *gin.Context) {
	teamID := c.Param("team_id")
	var req schemas.AssignTeamMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := h.adminService.ManageTeamMember(c.Request.Context(), teamID, req.UserID, req.TeamRole, false)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusOK)
}

func (h *AdminHandler) RemoveTeamMember(c *gin.Context) {
	teamID := c.Param("team_id")
	userID := c.Param("user_id")

	err := h.adminService.ManageTeamMember(c.Request.Context(), teamID, userID, "", true)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusOK)
}

func (h *AdminHandler) TransferTeamMember(c *gin.Context) {
	var req schemas.TransferTeamMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := h.adminService.TransferTeamMember(c.Request.Context(), req.FromTeamID, req.ToTeamID, req.UserID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusOK)
}

func (h *AdminHandler) GetAssignedUsers(c *gin.Context) {
	orgID := c.MustGet("org_id").(string)
	users, err := h.adminService.GetAssignedOrgUsers(c.Request.Context(), orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch assigned users"})
		return
	}
	c.JSON(http.StatusOK, users)
}

func (h *AdminHandler) GetUserTeams(c *gin.Context) {
	userID := c.Param("user_id")
	teams, err := h.adminService.GetUserTeams(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user teams"})
		return
	}
	c.JSON(http.StatusOK, teams)
}

func (h *AdminHandler) UpdateUserSystemProfile(c *gin.Context) {
	userID := c.Param("user_id")
	var payload struct {
		Role   string `json:"role" binding:"required"`
		Status string `json:"status" binding:"required"`
	}

	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := h.adminService.UpdateUserSystemProfile(c.Request.Context(), userID, payload.Role, payload.Status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user profile"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "User profile updated successfully"})
}

func (h *AdminHandler) GetAdminManagedTeams(c *gin.Context) {

	userID := c.MustGet("user_id").(string)
	orgID := c.MustGet("org_id").(string)

	// Extract role safely
	roleVal, exists := c.Get("role")
	role := ""
	if exists {
		role = roleVal.(string)
	}

	var teams interface{}
	var err error

	// If Super Admin, fetch ALL teams
	if role == "SUPER_ADMIN" {
		teams, err = h.adminService.GetAllOrgTeams(c.Request.Context(), orgID)
	} else {
		// Normal Admin: Fetch only teams they manage
		teams, err = h.adminService.GetAdminManagedTeams(c.Request.Context(), userID)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch teams"})
		return
	}

	// Prevents the "null" JSON quirk if they truly have 0 teams
	if teams == nil {
		c.JSON(http.StatusOK, []string{})
		return
	}

	c.JSON(http.StatusOK, teams)
}
