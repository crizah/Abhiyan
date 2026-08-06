package handlers

import (
	"net/http"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/util"
	"github.com/gin-gonic/gin"
)

type DeviceHandler struct {
	db *db.Queries
}

func NewDeviceHandler(queries *db.Queries) *DeviceHandler {
	return &DeviceHandler{db: queries}
}

type registerDeviceRequest struct {
	FCMToken string `json:"fcm_token" binding:"required"`
}

// RegisterDevice upserts the FCM token for the current user/org so push
// notifications can be delivered to this device. Called by the Android app
// right after it registers with Firebase; a no-op for the web client.
func (h *DeviceHandler) RegisterDevice(c *gin.Context) {
	var req registerDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "fcm_token is required"})
		return
	}

	userID := c.MustGet("user_id").(string)
	orgID := c.MustGet("org_id").(string)

	err := h.db.UpsertDeviceToken(c.Request.Context(), db.UpsertDeviceTokenParams{
		UserID:   util.ParseUUID(userID),
		OrgID:    util.ParseUUID(orgID),
		Platform: "ANDROID",
		FcmToken: req.FCMToken,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to register device"})
		return
	}

	c.Status(http.StatusOK)
}
