package middleware

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
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

// RateLimit caps requests to `limit` per `window` using a Redis fixed-window
// counter, keyed by keyFunc(c) under the given prefix. It fails open (allows
// the request) on Redis errors so an outage doesn't take down the API.
func RateLimit(rdb *redis.Client, prefix string, limit int, window time.Duration, keyFunc func(*gin.Context) string) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := fmt.Sprintf("ratelimit:%s:%s", prefix, keyFunc(c))

		count, err := rdb.Incr(c.Request.Context(), key).Result()
		if err != nil {
			c.Next()
			return
		}
		if count == 1 {
			rdb.Expire(c.Request.Context(), key, window)
		}

		if count > int64(limit) {
			ttl, _ := rdb.TTL(c.Request.Context(), key).Result()
			if ttl > 0 {
				c.Header("Retry-After", fmt.Sprintf("%.0f", ttl.Seconds()))
			}
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "too many requests, please slow down"})
			return
		}

		c.Next()
	}
}
