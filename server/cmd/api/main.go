package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	"github.com/crizah/Abhiyan/server/internal/handlers"
	"github.com/crizah/Abhiyan/server/internal/middleware"
	"github.com/crizah/Abhiyan/server/internal/services"
	app "github.com/crizah/Onion/app"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
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

	// initialise task queue
	broker_url := os.Getenv("BROKER_URL")
	dashboard_addr := os.Getenv("DASHBOARD_URL")
	onionApp, err := app.New(app.Config{
		BrokerAddr:    broker_url,
		BackendURL:    db_url,
		DashboardAddr: dashboard_addr,
	})
	if err != nil {
		panic(err)
	}

	// --- 1. Initialize Services ---
	authService := services.NewAuthService(dbConn, s_byte, onionApp)
	adminService := services.NewAdminService(dbConn, s_byte, onionApp)
	userService := services.NewUserService(dbConn)

	// --- 2. Initialize Handlers ---
	authHandler := handlers.NewAuthHandler(authService)
	adminHandler := handlers.NewAdminHandler(adminService)
	userHandler := handlers.NewUserHandler(userService)

	// 3. Setup Gin Router
	r := gin.Default()
	r.Use(middleware.CORSMiddleware())

	// --- 3. Define Routes ---
	v1 := r.Group("/api/v1")
	{
		// ==========================================
		// AUTHENTICATION DOMAIN
		// ==========================================
		auth := v1.Group("/auth")
		{
			// Public
			auth.POST("/register-org", authHandler.RegisterOrg)
			auth.POST("/login", authHandler.Login)
			auth.POST("/logout", authHandler.Logout)
			auth.POST("/accept-invite", authHandler.AcceptInvite)

			// Protected Auth Context
			auth.GET("/me", middleware.RequireAuth(s_byte), authHandler.Me)
			auth.POST("/switch-role", middleware.RequireAuth(s_byte), authHandler.SwitchRole)
		}

		// ADMIN DOMAIN
		admin := v1.Group("/admin")

		// Block 1: Require Valid Token
		admin.Use(middleware.RequireAuth(s_byte))

		// Block 2: Require Admin or Super Admin Role
		admin.Use(middleware.RequireRole("ADMIN", "SUPER_ADMIN"))
		{
			// Fully secured endpoints using the new AdminHandler
			admin.POST("/users/invite", adminHandler.InviteUser)
			admin.GET("/stats", adminHandler.GetDashboardStats)
			admin.GET("/team-stats", adminHandler.GetAdminTeamStats)
		}

		users := v1.Group("/users")

		// Every route in this block requires a valid login
		users.Use(middleware.RequireAuth(s_byte))
		{
			// Note: These match the exact endpoints React is calling
			users.GET("/me/profile", userHandler.GetMyProfile)
			users.PUT("/me/profile", userHandler.UpdateMyProfile)
		}
	}

	// 5. Start Server
	fmt.Printf("listening....")

	r.Run(":8082")
}
