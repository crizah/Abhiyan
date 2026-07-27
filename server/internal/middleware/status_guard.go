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

		// Suspension is per-org-membership, not global — a person suspended in
		// one org must not be blocked while acting in another they still belong
		// to, so this checks the ACTIVE org from the session, not the account
		// as a whole.
		orgIDStr, ok := c.Get("org_id")
		if !ok {
			c.Next()
			return
		}
		orgID, err := uuid.Parse(orgIDStr.(string))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid org context"})
			c.Abort()
			return
		}

		// 2. Query current membership status from the database
		status, err := queries.GetMembershipStatus(c.Request.Context(), db.GetMembershipStatusParams{
			UserID: userID,
			OrgID:  orgID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify account status"})
			c.Abort()
			return
		}

		// 3. Guard check
		if string(status) == "SUSPENDED" {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "Your account has been suspended in this organization. Please contact your system administrator.",
			})
			c.Abort() // Stops the request pipeline right here
			return
		}

		c.Next()
	}
}
