package middleware

import (
	"fmt"
	"net/http"
	"time"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/gin-gonic/gin"
)

// KeyByIP rate-limits per client IP. Use for unauthenticated endpoints where
// there's no user identity yet (login, password reset, invite acceptance, etc).
func KeyByIP(c *gin.Context) string {
	return c.ClientIP()
}

// KeyByUser rate-limits per authenticated user. Must run after RequireAuth,
// which sets "user_id" in the context.
func KeyByUser(c *gin.Context) string {
	if uid, ok := c.Get("user_id"); ok {
		if s, ok := uid.(string); ok && s != "" {
			return s
		}
	}
	// Not authenticated for some reason (misconfigured route) - fall back to IP
	// rather than sharing a single bucket across every unauthenticated caller.
	return c.ClientIP()
}

// RateLimit caps requests to `limit` per `window` using a Postgres fixed-window
// counter, keyed by keyFunc(c) under the given prefix. It fails open (allows
// the request) on errors so a DB blip doesn't take down the API.
func RateLimit(queries *db.Queries, prefix string, limit int, window time.Duration, keyFunc func(*gin.Context) string) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := fmt.Sprintf("ratelimit:%s:%s", prefix, keyFunc(c))

		hit, err := queries.RateLimitHit(c.Request.Context(), db.RateLimitHitParams{
			Key:  key,
			Secs: window.Seconds(),
		})
		if err != nil {
			c.Next()
			return
		}

		if hit.Count > int32(limit) {
			if ttl := time.Until(hit.ExpiresAt); ttl > 0 {
				c.Header("Retry-After", fmt.Sprintf("%.0f", ttl.Seconds()))
			}
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "too many requests, please slow down"})
			return
		}

		c.Next()
	}
}
