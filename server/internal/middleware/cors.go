package middleware

import (
	"os"

	"github.com/gin-gonic/gin"
)

func CORSMiddleware() gin.HandlerFunc {
	allowedOrigins := map[string]bool{
		os.Getenv("CLIENT_IP"):    true,
		os.Getenv("FRONTEND_URL"): true,
		"http://localhost:3000":   true,
		"http://localhost:5173":   true,
	}

	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")

		if allowedOrigins[origin] {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, PUT, DELETE, OPTIONS")
			c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		}

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

// func CORSMiddleware() gin.HandlerFunc {
// 	return func(c *gin.Context) {
// 		origin := c.Request.Header.Get("Origin")

// 		// Mirror the exact origin of the request
// 		if origin != "" {
// 			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
// 		}

// 		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, PUT, DELETE, OPTIONS")
// 		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept")
// 		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")

// 		if c.Request.Method == "OPTIONS" {
// 			c.AbortWithStatus(204)
// 			return
// 		}

// 		c.Next()
// 	}
// }
