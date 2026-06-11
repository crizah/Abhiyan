package middleware

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// RequireAuth validates the JWT (from cookie or header) and injects user context
func RequireAuth(JwtSecret []byte) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tokenStr string

		// 1. Try to get the token from the httpOnly cookie first
		cookieToken, err := c.Cookie("access_token")
		if err == nil && cookieToken != "" {
			tokenStr = cookieToken
		} else {
			// 2. Fallback to Authorization header
			authHeader := c.GetHeader("Authorization")
			if authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") {
				tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}

		// 3. If no token was found in either location, block the request
		if tokenStr == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing or invalid token format"})
			return
		}

		// 4. Parse and validate the token
		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method")
			}
			return JwtSecret, nil
		})

		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		// 5. Extract claims
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token payload"})
			return
		}

		// Extract our custom MNC schema fields
		userID, idOk := claims["sub"].(string)
		orgID, orgOk := claims["org_id"].(string)
		role, roleOk := claims["role"].(string)
		email, emailOk := claims["email"].(string)

		if !idOk || !orgOk || !roleOk || !emailOk {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "malformed token claims"})
			return
		}

		// 6. Inject into Gin Context for the Handlers to use
		c.Set("user_id", userID)
		c.Set("org_id", orgID)
		c.Set("role", role)
		c.Set("email", email)

		c.Next()
	}
}

// RequireRole guards endpoints based on the injected role
func RequireRole(allowedRoles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userRole, exists := c.Get("role")
		if !exists {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		// Cast the interface{} returned by c.Get() to a string
		roleStr, ok := userRole.(string)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid role format"})
			return
		}

		// Check if the user's role is in the allowed list
		for _, role := range allowedRoles {
			if roleStr == role {
				c.Next()
				return
			}
		}

		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
	}
}
