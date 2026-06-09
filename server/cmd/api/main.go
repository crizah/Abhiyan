package api

import (
	"database/sql"
	"log"
	"os"

	"github.com/crizah/Abhiyan/server/internal/handlers"
	"github.com/crizah/Abhiyan/server/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	godotenv.Load()
	// 1. Connect to Database
	dbConn, err := sql.Open("postgres", "postgres://user:pass@localhost:5432/taskdb?sslmode=disable")
	if err != nil {
		log.Fatal("Cannot connect to db:", err)
	}
	s := os.Getenv("JWT_SECRET")

	// 2. Initialize Services & Handlers
	authService := services.NewAuthService(dbConn, []byte(s))
	authHandler := handlers.NewAuthHandler(authService)

	// 3. Setup Gin Router
	r := gin.Default()

	// 4. Define Routes
	v1 := r.Group("/api/v1")
	{
		auth := v1.Group("/auth")
		{
			auth.POST("/register-org", authHandler.RegisterOrg)
			auth.POST("/login", authHandler.Login)
			auth.POST("/accept-invite", authHandler.AcceptInvite)
		}

		// Admin routes will require a JWT Auth Middleware
		// admin := v1.Group("/admin")
		// // admin.Use(middleware.RequireAuth) // You will build this next
		// {
		// 	// admin.POST("/users/invite", adminHandler.InviteUser)
		// }
	}

	// 5. Start Server
	r.Run(":8080")
}
