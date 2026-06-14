package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
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

	queries := db.New(dbConn)

	// --- 1. Initialize Services ---
	authService := services.NewAuthService(dbConn, s_byte, onionApp)
	adminService := services.NewAdminService(dbConn, s_byte, onionApp)
	userService := services.NewUserService(dbConn)

	// --- 2. Initialize Handlers ---
	authHandler := handlers.NewAuthHandler(authService)
	adminHandler := handlers.NewAdminHandler(adminService)
	userHandler := handlers.NewUserHandler(userService)
	notificationHandler := handlers.NewNotificationHandler(adminService, queries)

	// 3. Setup Gin Router
	r := gin.Default()
	r.Use(middleware.CORSMiddleware())

	// --- 3. Define Routes ---
	v1 := r.Group("/api/v1")
	{
		// AUTHENTICATION DOMAIN
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

		// GENERAL AUTHENTICATED DOMAIN (All Roles)

		general := v1.Group("")
		general.Use(middleware.RequireAuth(s_byte))
		// general.Use(middleware.BlockSuspendedUsers(queries))
		{
			// Everyone can hit these, but the handler decides WHAT they see
			general.GET("/notifications", notificationHandler.GetMyNotifications)
			general.PUT("/notifications/read", notificationHandler.MarkAllRead)
			general.DELETE("/notifications/clear", notificationHandler.ClearAll)
			general.PUT("/notifications/:id/read", notificationHandler.MarkOneRead)
		}

		// ADMIN DOMAIN
		admin := v1.Group("/admin")
		admin.Use(middleware.RequireAuth(s_byte)) // Everyone here needs a valid token
		// admin.Use(middleware.BlockSuspendedUsers(queries))

		// SUPER ADMIN ONLY ---
		// Org-wide destructive/creation actions
		superAdminGroup := admin.Group("")
		superAdminGroup.Use(middleware.RequireRole("SUPER_ADMIN"))
		{
			superAdminGroup.POST("/users/invite", adminHandler.InviteUser)
			superAdminGroup.GET("/users", adminHandler.GetOrgUsers)
			superAdminGroup.GET("/stats", adminHandler.GetDashboardStats)
			superAdminGroup.GET("/users/unassigned", adminHandler.GetUnassignedUsers)
			superAdminGroup.POST("/teams", adminHandler.CreateTeam)
			superAdminGroup.GET("/teams", adminHandler.GetTeams)
			superAdminGroup.GET("/teams/:team_id/members", adminHandler.GetTeamMembers)
			superAdminGroup.POST("/teams/:team_id/members", adminHandler.AssignTeamMember)
			superAdminGroup.DELETE("/teams/:team_id/members/:user_id", adminHandler.RemoveTeamMember)
			superAdminGroup.POST("/teams/transfer", adminHandler.TransferTeamMember)
			superAdminGroup.GET("/users/assigned", adminHandler.GetAssignedUsers)
			superAdminGroup.GET("/users/:user_id/teams", adminHandler.GetUserTeams)
			superAdminGroup.PUT("/users/:user_id/system-profile", adminHandler.UpdateUserSystemProfile)
		}

		// TEAM ADMINS & SUPER ADMINS ---
		// Team-scoped actions
		teamAdminGroup := admin.Group("")
		teamAdminGroup.Use(middleware.RequireRole("ADMIN", "SUPER_ADMIN"))
		{

			teamAdminGroup.GET("/team-stats", adminHandler.GetAdminTeamStats)
			teamAdminGroup.GET("/employees", adminHandler.GetTeamEmployees)
			teamAdminGroup.GET("/teams/options", adminHandler.GetAdminTeamOptions) // when tf am i hitting this??
		}

		users := v1.Group("/users")

		// Every route in this block requires a valid login
		users.Use(middleware.RequireAuth(s_byte))
		// users.Use(middleware.BlockSuspendedUsers(queries))
		{

			users.GET("/me/profile", userHandler.GetMyProfile)
			users.PUT("/me/profile", userHandler.UpdateMyProfile)
		}
	}

	// 5. Start Server
	fmt.Printf("listening....")

	r.Run(":8082")
}
