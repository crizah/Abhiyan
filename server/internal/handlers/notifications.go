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
	adminService *services.AdminService
	db           *db.Queries
}

func NewNotificationHandler(adminSvc *services.AdminService, queries *db.Queries) *NotificationHandler {
	return &NotificationHandler{adminService: adminSvc, db: queries}
}

func (h *NotificationHandler) GetMyNotifications(c *gin.Context) {
	userID := c.MustGet("user_id").(string)
	orgID := c.GetString("org_id")
	role := c.GetString("role")

	var notifications []schemas.NotificationResponse

	// 1. Fetch standard DB notifications (this org only)
	dbNotifs, err := h.db.GetUserNotifications(c.Request.Context(), db.GetUserNotificationsParams{
		UserID: util.ParseUUID(userID),
		OrgID:  util.ParseUUID(orgID),
	})
	if err == nil {
		for _, n := range dbNotifs {
			notifications = append(notifications, schemas.NotificationResponse{
				ID:        n.ID.String(),
				Title:     n.Title,
				Message:   n.Message,
				IsRead:    n.IsRead.Bool,
				IsSystem:  false,
				Type:      "INFO",
				CreatedAt: n.CreatedAt.Time.Format(time.RFC3339),
			})
		}
	}

	// 2. Inject Dynamic System Alerts (Unassigned Users Queue)
	if role == "SUPER_ADMIN" && orgID != "" {
		unassigned, err := h.adminService.GetUnassignedOrgUsers(c.Request.Context(), orgID, 1, 0)
		if err == nil && unassigned.TotalCount > 0 {
			sysAlert := schemas.NotificationResponse{
				ID:        "sys-unassigned-queue",
				Title:     "Action Required",
				Message:   fmt.Sprintf("You have %d user(s) waiting to be assigned to teams.", unassigned.TotalCount),
				IsRead:    false,
				IsSystem:  true,
				Type:      "WARNING",
				CreatedAt: time.Now().Format(time.RFC3339),
			}
			notifications = append([]schemas.NotificationResponse{sysAlert}, notifications...)
		}
	}

	if notifications == nil {
		notifications = []schemas.NotificationResponse{}
	}

	c.JSON(http.StatusOK, notifications)
}

func (h *NotificationHandler) MarkAllRead(c *gin.Context) {
	userID := c.MustGet("user_id").(string)
	orgID := c.MustGet("org_id").(string)

	err := h.db.MarkNotificationsRead(c.Request.Context(), db.MarkNotificationsReadParams{
		UserID: util.ParseUUID(userID),
		OrgID:  util.ParseUUID(orgID),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to mark notifications read"})
		return
	}
	c.Status(http.StatusOK)
}

func (h *NotificationHandler) ClearAll(c *gin.Context) {
	userID := c.MustGet("user_id").(string)
	orgID := c.MustGet("org_id").(string)

	err := h.db.ClearNotifications(c.Request.Context(), db.ClearNotificationsParams{
		UserID: util.ParseUUID(userID),
		OrgID:  util.ParseUUID(orgID),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clear notifications"})
		return
	}
	c.Status(http.StatusOK)
}

func (h *NotificationHandler) MarkOneRead(c *gin.Context) {
	userID := c.MustGet("user_id").(string)
	orgID := c.MustGet("org_id").(string)
	notifID := c.Param("id")

	err := h.db.MarkOneNotificationRead(c.Request.Context(), db.MarkOneNotificationReadParams{
		ID:     util.ParseUUID(notifID),
		UserID: util.ParseUUID(userID),
		OrgID:  util.ParseUUID(orgID),
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to mark notification read"})
		return
	}

	c.Status(http.StatusOK)
}
