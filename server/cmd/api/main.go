package api

import (
	"database/sql"
	"log"
	"os"

	"github.com/crizah/Abhiyan/server/internal/handlers"
	"github.com/crizah/Abhiyan/server/internal/middleware"
	"github.com/crizah/Abhiyan/server/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	godotenv.Load()

	db_url := os.Getenv("DB_URL")
	// 1. Connect to Database
	dbConn, err := sql.Open("postgres", db_url)
	if err != nil {
		log.Fatal("Cannot connect to db:", err)
	}
	s := os.Getenv("JWT_SECRET")
	s_byte := []byte(s)

	// 2. Initialize Services & Handlers
	authService := services.NewAuthService(dbConn, s_byte)
	authHandler := handlers.NewAuthHandler(authService)

	// 3. Setup Gin Router
	r := gin.Default()
	r.Use(middleware.CORSMiddleware())

	// 4. Define Routes
	v1 := r.Group("/api/v1")
	{
		auth := v1.Group("/auth")
		{
			auth.POST("/register-org", authHandler.RegisterOrg)
			auth.POST("/login", authHandler.Login)
			auth.POST("/accept-invite", authHandler.AcceptInvite)
		}
		// protected routes
		admin := v1.Group("/admin")

		// Order matters!
		// 1. RequireAuth validates the token and injects the role/org into context
		admin.Use(middleware.RequireAuth(s_byte))

		// 2. RequireRole reads the injected role to block standard employees
		admin.Use(middleware.RequireRole("ADMIN", "SUPERADMIN"))
		{
			// This route is now fully secured
			admin.POST("/users/invite", authHandler.InviteUser)
		}

	}

	// 5. Start Server
	r.Run(":8080")
}
