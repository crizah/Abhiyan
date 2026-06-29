package handlers

import (
	"fmt"
	"net/http"
	"time"

	"github.com/crizah/Abhiyan/server/internal/services"
	"github.com/crizah/Onion/app"
	"github.com/gin-gonic/gin"
)

type AttendanceHandler struct {
	attendanceService *services.AttendanceService
	onionApp          *app.App
}

func NewAttendanceHandler(attendanceService *services.AttendanceService, onionApp *app.App) *AttendanceHandler {
	return &AttendanceHandler{attendanceService: attendanceService, onionApp: onionApp}
}

func (h *AttendanceHandler) MarkAttendance(c *gin.Context) {
	// Gate: reject before 7am. Server TZ env var should match the org's timezone.
	if time.Now().Hour() < 7 {
		c.JSON(http.StatusForbidden, gin.H{"error": "Attendance cannot be marked before 7:00 AM"})
		return
	}

	var req struct {
		TargetObjectKey string `json:"target_object_key" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "target_object_key is required"})
		return
	}

	userID := c.MustGet("user_id").(string)
	orgID := c.MustGet("org_id").(string)

	enabled, err := h.attendanceService.IsAttendanceEnabled(c.Request.Context(), orgID)
	if err != nil || !enabled {
		c.JSON(http.StatusForbidden, gin.H{"error": "Attendance tracking is not enabled for your organization"})
		return
	}

	sourceKey, err := h.attendanceService.GetUserFaceURI(c.Request.Context(), userID)
	if err != nil || sourceKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No registered face found. Please register your face first."})
		return
	}

	recordID, err := h.attendanceService.UpsertRecord(c.Request.Context(), userID, req.TargetObjectKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create attendance record"})
		return
	}

	_ = h.onionApp.Enqueue(c.Request.Context(), "compare_faces", map[string]any{
		"attendance_id":     recordID,
		"source_object_key": sourceKey,
		"target_object_key": req.TargetObjectKey,
	})

	c.JSON(http.StatusAccepted, gin.H{"id": recordID})
}

func (h *AttendanceHandler) GetTodayAttendance(c *gin.Context) {
	userID := c.MustGet("user_id").(string)

	status, err := h.attendanceService.GetTodayStatus(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch attendance"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": status})
}

// Admin endpoints

func (h *AttendanceHandler) GetOrgAttendance(c *gin.Context) {
	orgID := c.MustGet("org_id").(string)
	date := c.DefaultQuery("date", time.Now().Format("2006-01-02"))
	teamID := c.Query("team")

	rows, err := h.attendanceService.GetOrgAttendance(c.Request.Context(), orgID, date, teamID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch attendance"})
		return
	}

	c.JSON(http.StatusOK, rows)
}

func (h *AttendanceHandler) DownloadOrgReport(c *gin.Context) {
	orgID := c.MustGet("org_id").(string)
	date := c.DefaultQuery("date", time.Now().Format("2006-01-02"))
	teamID := c.Query("team")

	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=attendance_%s.csv", date))

	if err := h.attendanceService.WriteOrgReport(c.Request.Context(), orgID, date, teamID, c.Writer); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate report"})
	}
}

func (h *AttendanceHandler) GetUserAttendanceSummary(c *gin.Context) {
	userID := c.Param("user_id")

	summary, err := h.attendanceService.GetUserSummary(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user attendance"})
		return
	}

	c.JSON(http.StatusOK, summary)
}

func (h *AttendanceHandler) DownloadUserReport(c *gin.Context) {
	userID := c.Param("user_id")

	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=attendance_user_%s.csv", userID[:8]))

	if err := h.attendanceService.WriteUserReport(c.Request.Context(), userID, c.Writer); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate report"})
	}
}
