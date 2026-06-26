package middleware

import (
	"net/http"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func BlockSuspendedUsers(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. Extract user ID set by your JWT/Auth middleware
		userIDVal, exists := c.Get("user_id")
		if !exists {
			c.Next() // Or abort if authentication is strictly required here
			return
		}

		userIDStr, ok := userIDVal.(string)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user context"})
			c.Abort()
			return
		}
		userID, err := uuid.Parse(userIDStr)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user context"})
			c.Abort()
			return
		}

		// 2. Query current status from the database
		status, err := queries.GetUserStatus(c.Request.Context(), userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify account status"})
			c.Abort()
			return
		}

		// 3. Guard check
		if status.Valid && string(status.UserStatus) == "SUSPENDED" {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "Your account has been suspended. Please contact your system administrator.",
			})
			c.Abort() // Stops the request pipeline right here
			return
		}

		c.Next()
	}
}
