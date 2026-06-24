package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/handlers"
	"github.com/crizah/Abhiyan/server/internal/middleware"
	"github.com/crizah/Abhiyan/server/internal/services"
	app "github.com/crizah/Onion/app"
	"github.com/crizah/Onion/broker"
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
		DefaultQueue:  "default",
		Queues: []broker.Queue{
			{Name: "critical", Priority: 10},
			{Name: "reminders", Priority: 7},
			{Name: "polling", Priority: 7},
		},
		TaskRoutes: map[string]string{
			"send_invite_email":      "critical",
			"send_reminder_email":    "reminders",
			"send_reminder_whatsapp": "reminders",
			"poll_due_reminders":     "polling",
		},
	})
	if err != nil {
		panic(err)
	}

	queries := db.New(dbConn)

	// --- 1. Initialize Services ---
	authService := services.NewAuthService(dbConn, s_byte, onionApp)
	adminService := services.NewAdminService(dbConn, s_byte, onionApp)
	userService := services.NewUserService(dbConn)
	s3Service, err := services.NewS3Service(context.Background())
	if err != nil {
		log.Fatalf("Failed to initialize AWS S3 service: %v", err)
	}
	scoreService := services.NewScoreService(dbConn)
	taskService := services.NewTaskService(dbConn, onionApp, s3Service, scoreService)

	// --- 2. Initialize Handlers ---
	authHandler := handlers.NewAuthHandler(authService)
	adminHandler := handlers.NewAdminHandler(adminService)
	userHandler := handlers.NewUserHandler(userService)
	notificationHandler := handlers.NewNotificationHandler(adminService, queries)
	taskHandler := handlers.NewTaskHandler(taskService)
	uploadHandler := handlers.NewUploadHandler(s3Service)
	scoreHandler := handlers.NewScoreHandler(scoreService, adminService)

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
			auth.POST("/resend-invite", authHandler.ResendPublicInvite)

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
			general.GET("/employee/teams", taskHandler.GetEmployeeTeams)                // doesnt need to be paginated
			general.GET("/employee/teams/:team_id/tasks", taskHandler.GetEmployeeTasks) // needs to be paginated. done
			general.PUT("/employee/tasks/:task_id/submit", taskHandler.SubmitTask)

			// Re-use existing comment/update routes for employees
			general.GET("/tasks/:task_id/updates", taskHandler.GetTaskUpdates)
			general.POST("/tasks/:task_id/updates", taskHandler.PostTaskUpdate)
			general.GET("/tasks/:task_id/updates/:update_id/comments", taskHandler.GetUpdateComments)
			general.POST("/tasks/:task_id/updates/:update_id/comments", taskHandler.PostUpdateComment)
			general.GET("/tasks/:task_id/details", taskHandler.GetFullTaskDetails)
			general.GET("/attachments/:attachment_id/transcription", taskHandler.GetTranscription)
			general.GET("/teams/:team_id/members", adminHandler.GetTeamMembers)
			general.GET("/upload/presigned-url", uploadHandler.GetPresignedURL)
			general.DELETE("/upload/s3-object", uploadHandler.DeleteS3Object)
			general.GET("/leaderboard", scoreHandler.GetEmployeeLeaderboard)
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
			superAdminGroup.GET("/users", adminHandler.GetOrgUsers) // needs to be paginated
			superAdminGroup.GET("/stats", adminHandler.GetDashboardStats)
			superAdminGroup.GET("/users/unassigned", adminHandler.GetUnassignedUsers) // needs to be paginated
			superAdminGroup.POST("/teams", adminHandler.CreateTeam)
			superAdminGroup.GET("/teams", adminHandler.GetTeams) // needs to be paginated

			superAdminGroup.POST("/teams/transfer", adminHandler.TransferTeamMember)
			superAdminGroup.GET("/users/assigned", adminHandler.GetAssignedUsers) // needs to be paginated
			superAdminGroup.PUT("/users/:user_id/system-profile", adminHandler.UpdateUserSystemProfile)
			superAdminGroup.GET("/users/:user_id/score-breakdown", scoreHandler.GetUserScoreBreakdown)
			superAdminGroup.GET("/leaderboard", scoreHandler.GetAdminLeaderboard)
			superAdminGroup.GET("/reports/score-download", scoreHandler.DownloadScoreReport)
		}

		// TEAM ADMINS & SUPER ADMINS ---
		// Team-scoped actions
		teamAdminGroup := admin.Group("")
		teamAdminGroup.Use(middleware.RequireRole("ADMIN", "SUPER_ADMIN"))
		{

			teamAdminGroup.GET("/team-stats", adminHandler.GetAdminTeamStats)
			teamAdminGroup.GET("/employees", adminHandler.GetTeamEmployees) // needs to be paginated
			teamAdminGroup.GET("/teams/options", adminHandler.GetAdminTeamOptions)
			teamAdminGroup.POST("/teams/:team_id/tasks", taskHandler.CreateTask)
			teamAdminGroup.GET("/teams/:team_id/tasks", taskHandler.GetTeamTasks) // needs to be paginated
			teamAdminGroup.PUT("/tasks/:task_id/status", taskHandler.UpdateTaskStatus)
			teamAdminGroup.GET("/my-teams", adminHandler.GetAdminManagedTeams) // needs to be paginated
			teamAdminGroup.POST("/teams/:team_id/members", adminHandler.AssignTeamMember)
			teamAdminGroup.DELETE("/teams/:team_id/members/:user_id", adminHandler.RemoveTeamMember)
			teamAdminGroup.GET("/users/:user_id/teams", adminHandler.GetUserTeams)

			teamAdminGroup.GET("/teams/:team_id/members", adminHandler.GetTeamMembers) // depends
			teamAdminGroup.GET("/tasks/:task_id/updates", taskHandler.GetTaskUpdates)
			teamAdminGroup.POST("/tasks/:task_id/updates", taskHandler.PostTaskUpdate)
			teamAdminGroup.GET("/tasks/:task_id/updates/:update_id/comments", taskHandler.GetUpdateComments)
			teamAdminGroup.GET("/tasks/:task_id/details", taskHandler.GetFullTaskDetails)
			teamAdminGroup.PUT("/tasks/:task_id", taskHandler.UpdateTaskDetails)
			teamAdminGroup.GET("/tasks", taskHandler.GetAdminAllTasks)
			teamAdminGroup.POST("/tasks/:task_id/updates/:update_id/comments", taskHandler.PostUpdateComment)

			teamAdminGroup.PUT("/tasks/:task_id/approve", taskHandler.ApproveTask)
			teamAdminGroup.PUT("/tasks/:task_id/action/:action", taskHandler.ActionTask) // reject or reopen

			teamAdminGroup.GET("/employees/:user_id/score-breakdown", scoreHandler.GetUserScoreBreakdown)
			teamAdminGroup.GET("/leaderboard", scoreHandler.GetAdminLeaderboard)
			teamAdminGroup.PUT("/teams/:team_id/leaderboard-visibility", scoreHandler.ToggleLeaderboardVisibility)
			teamAdminGroup.GET("/reports/score-download", scoreHandler.DownloadScoreReport)
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
