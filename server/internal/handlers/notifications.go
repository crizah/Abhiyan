package handlers

import (
	"fmt"
	"net/http"
	"time"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/schemas"
	"github.com/crizah/Abhiyan/server/internal/services"
	"github.com/crizah/Abhiyan/server/internal/util"
	"github.com/gin-gonic/gin"
)

type NotificationHandler struct {
	adminService *services.AdminService // Reusing AdminService for the unassigned query
	db           *db.Queries            // Your sqlc queries instance
}

func NewNotificationHandler(adminSvc *services.AdminService, queries *db.Queries) *NotificationHandler {
	return &NotificationHandler{adminService: adminSvc, db: queries}
}

func (h *NotificationHandler) GetMyNotifications(c *gin.Context) {
	// userID := c.MustGet("user_id").(string)
	orgID := c.GetString("org_id")
	role := c.GetString("role")

	var notifications []schemas.NotificationResponse

	// 1. Fetch standard DB notifications
	// (Add h.db.GetUserNotifications call here and map to the array)
	// For brevity, assuming this maps correctly.

	// 2. Inject Dynamic System Alerts (Unassigned Users Queue)
	if role == "SUPER_ADMIN" && orgID != "" {
		unassigned, err := h.adminService.GetUnassignedOrgUsers(c.Request.Context(), orgID)
		if err == nil && len(unassigned) > 0 {
			// Prepend the system alert to the top of the list
			sysAlert := schemas.NotificationResponse{
				ID:        "sys-unassigned-queue",
				Title:     "Action Required",
				Message:   fmt.Sprintf("You have %d user(s) waiting to be assigned to teams.", len(unassigned)),
				IsRead:    false, // System alerts are always unread until resolved
				IsSystem:  true,
				CreatedAt: time.Now().Format(time.RFC3339),
			}
			notifications = append([]schemas.NotificationResponse{sysAlert}, notifications...)
		}
	}

	c.JSON(http.StatusOK, notifications)
}

func (h *NotificationHandler) MarkAllRead(c *gin.Context) {
	// Execute h.db.MarkNotificationsRead
	c.Status(http.StatusOK)
}

func (h *NotificationHandler) ClearAll(c *gin.Context) {
	// Execute h.db.ClearNotifications
	c.Status(http.StatusOK)
}

func (h *NotificationHandler) MarkOneRead(c *gin.Context) {
	userID := c.MustGet("user_id").(string)
	notifID := c.Param("id")

	// Pass both to ensure a user can only mark their OWN notifications as read
	err := h.db.MarkOneNotificationRead(c.Request.Context(), db.MarkOneNotificationReadParams{
		ID:     util.ParseUUID(notifID),
		UserID: util.ParseUUID(userID),
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to mark notification read"})
		return
	}

	c.Status(http.StatusOK)
}
