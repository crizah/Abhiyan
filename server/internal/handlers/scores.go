package handlers

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/crizah/Abhiyan/server/internal/services"
	"github.com/crizah/Abhiyan/server/internal/schemas"
	"github.com/crizah/Abhiyan/server/internal/util"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ScoreHandler struct {
	scoreService *services.ScoreService
	adminService *services.AdminService
}

func NewScoreHandler(sc *services.ScoreService, as *services.AdminService) *ScoreHandler {
	return &ScoreHandler{scoreService: sc, adminService: as}
}

func (h *ScoreHandler) GetUserScoreBreakdown(c *gin.Context) {
	targetUserID := c.Param("user_id")
	orgID := c.MustGet("org_id").(string)
	teamFilter := c.Query("team")
	if teamFilter == "ALL" {
		teamFilter = ""
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit < 1 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	result, err := h.scoreService.GetUserBreakdown(c.Request.Context(), targetUserID, teamFilter, int32(limit), int32(offset), orgID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (h *ScoreHandler) GetAdminLeaderboard(c *gin.Context) {
	userID := c.MustGet("user_id").(string)
	orgID := c.MustGet("org_id").(string)
	roleVal, _ := c.Get("role")
	role, _ := roleVal.(string)

	teamFilter := c.Query("team")

	// Fetch all teams for the role to build name map; used for both leaderboard and visibility panel
	var allTeams []schemas.TeamResponse
	var err error
	if role == "SUPER_ADMIN" {
		allTeams, err = h.adminService.GetAllOrgTeams(c.Request.Context(), orgID)
	} else {
		allTeams, err = h.adminService.GetAdminManagedTeams(c.Request.Context(), userID, orgID)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch teams"})
		return
	}

	nameMap := make(map[string]string)
	var allTeamIDs []uuid.UUID
	for _, t := range allTeams {
		allTeamIDs = append(allTeamIDs, util.ParseUUID(t.ID))
		nameMap[t.ID] = t.Name
	}

	// teamIDs is used for leaderboard entries only (respects filter); visibility always shows all teams
	var teamIDs []uuid.UUID
	if teamFilter != "" && teamFilter != "ALL" {
		teamIDs = []uuid.UUID{util.ParseUUID(teamFilter)}
	} else {
		teamIDs = allTeamIDs
	}

	if len(teamIDs) == 0 {
		c.JSON(http.StatusOK, schemas.LeaderboardResponse{Entries: []schemas.LeaderboardEntry{}})
		return
	}

	visSettings, _ := h.scoreService.GetLeaderboardVisibilityBulk(c.Request.Context(), allTeamIDs)
	for i := range visSettings {
		if name, ok := nameMap[visSettings[i].TeamID]; ok {
			visSettings[i].TeamName = name
		}
	}

	result, err := h.scoreService.GetLeaderboard(c.Request.Context(), teamIDs, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch leaderboard"})
		return
	}

	result.Teams = visSettings

	c.JSON(http.StatusOK, result)
}

func (h *ScoreHandler) ToggleLeaderboardVisibility(c *gin.Context) {
	teamID := c.Param("team_id")
	userID := c.MustGet("user_id").(string)
	roleVal, _ := c.Get("role")
	if role, _ := roleVal.(string); role == "SUPER_ADMIN" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Super admins cannot manage leaderboard visibility"})
		return
	}

	var req schemas.ToggleLeaderboardRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	orgID := c.MustGet("org_id").(string)
	if err := h.scoreService.ToggleLeaderboardVisibility(c.Request.Context(), teamID, req.Visible, userID, orgID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Leaderboard visibility updated"})
}

func (h *ScoreHandler) GetEmployeeLeaderboard(c *gin.Context) {
	userID := c.MustGet("user_id").(string)
	orgID := c.MustGet("org_id").(string)
	teamFilter := c.Query("team")

	result, err := h.scoreService.GetEmployeeLeaderboard(c.Request.Context(), userID, teamFilter, orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch leaderboard"})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (h *ScoreHandler) DownloadScoreReport(c *gin.Context) {
	userID := c.MustGet("user_id").(string)
	orgID := c.MustGet("org_id").(string)
	roleVal, _ := c.Get("role")
	role, _ := roleVal.(string)

	targetUserID := c.Query("user_id")
	teamFilter := c.Query("team")

	if targetUserID != "" {
		userName, err := h.scoreService.GetUserName(c.Request.Context(), targetUserID, orgID)
		if err != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}

		c.Header("Content-Type", "text/csv")
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=score_report_%s.csv", targetUserID[:8]))

		err = h.scoreService.WriteUserScoreReport(c.Request.Context(), targetUserID, userName.FullName, userName.Email, c.Writer, orgID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate report"})
		}
		return
	}

	var teamIDs []uuid.UUID

	if teamFilter != "" && teamFilter != "ALL" {
		teamIDs = []uuid.UUID{util.ParseUUID(teamFilter)}
	} else if role == "SUPER_ADMIN" {
		teams, err := h.adminService.GetAllOrgTeams(c.Request.Context(), orgID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch teams"})
			return
		}
		for _, t := range teams {
			teamIDs = append(teamIDs, util.ParseUUID(t.ID))
		}
	} else {
		teams, err := h.adminService.GetAdminManagedTeams(c.Request.Context(), userID, orgID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch teams"})
			return
		}
		for _, t := range teams {
			teamIDs = append(teamIDs, util.ParseUUID(t.ID))
		}
	}

	if len(teamIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"message": "No teams found"})
		return
	}

	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", "attachment; filename=performance_report.csv")

	err := h.scoreService.WriteBulkScoreReport(c.Request.Context(), teamIDs, c.Writer)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate report"})
	}
}
