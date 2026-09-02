package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/lambda"
	ginadapter "github.com/awslabs/aws-lambda-go-api-proxy/gin"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/handlers"
	"github.com/crizah/Abhiyan/server/internal/middleware"
	"github.com/crizah/Abhiyan/server/internal/services"
	app "github.com/crizah/Onion/app"
	"github.com/crizah/Onion/backend"
	"github.com/crizah/Onion/broker"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
)

func main() {
	// In Lambda, env vars are injected by Terraform at deploy time.
	// Locally, load from .env file.
	godotenv.Load()

	db_url := os.Getenv("DB_URL")

	// 1. Connect to Database
	dbConn, err := sql.Open("postgres", db_url)
	if err != nil {
		log.Fatal("Cannot connect to db:", err)
	}
	s := os.Getenv("JWT_SECRET")
	s_byte := []byte(s)
	googleClientID := os.Getenv("GOOGLE_CLIENT_ID")

	// initialise task queue
	broker_url := os.Getenv("BROKER_URL")
	dashboard_addr := os.Getenv("DASHBOARD_URL")

	br := app.BrokerAddr{Broker: broker.BrokerPostgres, Addr: db_url}
	ba := app.BackendURL{DB: backend.DBTypePostgres, ConnectionString: db_url}

	// Reuse the same Redis instance the task broker runs on for rate-limit counters.
	rdb := redis.NewClient(&redis.Options{Addr: broker_url})
	onionApp, err := app.New(app.Config{
		BrokerAddr:    br,
		BackendURL:    ba,
		DashboardAddr: dashboard_addr,
		DefaultQueue:  "default",
		Queues: []broker.Queue{
			{Name: "auth", Priority: 10},
			{Name: "critical", Priority: 10},
			{Name: "reminders", Priority: 7},
			{Name: "polling", Priority: 7},
		},
		TaskRoutes: map[string]string{
			"verify_google_token":       "auth",
			"send_invite_email":         "critical",
			"send_password_reset_email": "critical",
			"send_reminder_email":       "reminders",
			"send_reminder_whatsapp":    "reminders",
			"poll_due_reminders":        "polling",
			"validate_face":             "default",
			"compare_faces":             "default",
		},
	})
	if err != nil {
		panic(err)
	}

	queries := db.New(dbConn)

	// --- 1. Initialize Services ---
	authService := services.NewAuthService(dbConn, s_byte, googleClientID, onionApp, rdb)
	adminService := services.NewAdminService(dbConn, s_byte, onionApp)
	userService := services.NewUserService(dbConn)
	s3Service, err := services.NewS3Service(context.Background())
	if err != nil {
		log.Fatalf("Failed to initialize AWS S3 service: %v", err)
	}
	scoreService := services.NewScoreService(dbConn)
	taskService := services.NewTaskService(dbConn, onionApp, s3Service, scoreService)
	faceValidationService := services.NewFaceValidationService(dbConn)
	attendanceService := services.NewAttendanceService(dbConn)

	// --- 2. Initialize Handlers ---
	authHandler := handlers.NewAuthHandler(authService)
	adminHandler := handlers.NewAdminHandler(adminService)
	userHandler := handlers.NewUserHandler(userService)
	notificationHandler := handlers.NewNotificationHandler(adminService, queries)
	taskHandler := handlers.NewTaskHandler(taskService)
	uploadHandler := handlers.NewUploadHandler(s3Service, faceValidationService, onionApp)
	attendanceHandler := handlers.NewAttendanceHandler(attendanceService, onionApp)
	scoreHandler := handlers.NewScoreHandler(scoreService, adminService)

	// 3. Setup Gin Router
	r := gin.Default()
	r.Use(middleware.CORSMiddleware())

	// Unauthenticated auth endpoints: no user identity yet, so key by IP.
	// Tight limit - these are brute-force/credential-stuffing/email-bombing targets.
	authLimiter := middleware.RateLimit(rdb, "auth", 20, 5*time.Minute, middleware.KeyByIP)

	// Authenticated endpoints with real downstream cost (external API calls,
	// message sends, S3 writes). Keyed by user so it can't be starved by shared IPs.
	costLimiter := middleware.RateLimit(rdb, "cost", 20, time.Minute, middleware.KeyByUser)

	// --- 3. Define Routes ---
	v1 := r.Group("/api/v1")
	{
		// AUTHENTICATION DOMAIN
		auth := v1.Group("/auth")
		{
			// Public
			auth.POST("/register-org", authLimiter, authHandler.RegisterOrg)
			auth.POST("/login", authLimiter, authHandler.Login)
			auth.POST("/select-org", authLimiter, authHandler.SelectOrg)
			auth.POST("/google-login", authLimiter, authHandler.GoogleLogin)
			auth.POST("/logout", authHandler.Logout)
			auth.GET("/invite-preview", authHandler.InvitePreview)
			auth.POST("/accept-invite", authLimiter, authHandler.AcceptInvite)
			auth.POST("/resend-invite", authLimiter, authHandler.ResendPublicInvite)
			auth.POST("/forgot-password", authLimiter, authHandler.ForgotPassword)
			auth.POST("/reset-password", authLimiter, authHandler.ResetPassword)

			// auth
			auth.GET("/me", middleware.RequireAuth(s_byte), authHandler.Me)
			auth.POST("/switch-role", middleware.RequireAuth(s_byte), authHandler.SwitchRole)
		}

		// GENERAL AUTHENTICATED DOMAIN (All Roles)

		general := v1.Group("")
		general.Use(middleware.RequireAuth(s_byte))

		general.Use(middleware.BlockSuspendedUsers(queries))
		{
			// Everyone can hit these, but the handler decides WHAT they see
			general.GET("/notifications", notificationHandler.GetMyNotifications)
			general.PUT("/notifications/read", notificationHandler.MarkAllRead)
			general.DELETE("/notifications/clear", notificationHandler.ClearAll)
			general.PUT("/notifications/:id/read", notificationHandler.MarkOneRead)
			general.GET("/employee/teams", taskHandler.GetEmployeeTeams)
			general.GET("/employee/teams/:team_id/tasks", taskHandler.GetEmployeeTasks)
			general.PUT("/employee/tasks/:task_id/submit", taskHandler.SubmitTask)

			general.GET("/tasks/:task_id/updates", taskHandler.GetTaskUpdates)
			general.POST("/tasks/:task_id/updates", taskHandler.PostTaskUpdate)
			general.GET("/tasks/:task_id/updates/:update_id/comments", taskHandler.GetUpdateComments)
			general.POST("/tasks/:task_id/updates/:update_id/comments", taskHandler.PostUpdateComment)
			general.GET("/tasks/:task_id/details", taskHandler.GetFullTaskDetails)
			general.GET("/attachments/:attachment_id/transcription", taskHandler.GetTranscription)
			general.GET("/teams/:team_id/members", adminHandler.GetTeamMembers)
			general.GET("/upload/presigned-url", costLimiter, uploadHandler.GetPresignedUploadsURL)
			general.DELETE("/upload/s3-object", uploadHandler.DeleteS3Object)
			general.POST("/upload/validate-face", costLimiter, uploadHandler.ValidateFace)
			general.GET("/upload/validate-face/:job_id", uploadHandler.GetValidationStatus) // polling
			general.POST("/attendance/mark", attendanceHandler.MarkAttendance)
			general.GET("/attendance/today", attendanceHandler.GetTodayAttendance) // polling
			general.GET("/leaderboard", scoreHandler.GetEmployeeLeaderboard)
		}

		// ADMIN DOMAIN
		admin := v1.Group("/admin")
		admin.Use(middleware.RequireAuth(s_byte)) // Everyone here needs a valid token
		admin.Use(middleware.BlockSuspendedUsers(queries))

		// SUPER ADMIN ONLY ---
		// Org-wide destructive/creation actions
		superAdminGroup := admin.Group("")
		superAdminGroup.Use(middleware.RequireRole("SUPER_ADMIN"))
		{
			superAdminGroup.POST("/users/invite", costLimiter, adminHandler.InviteUser)
			superAdminGroup.GET("/users", adminHandler.GetOrgUsers) // needs to be paginated
			superAdminGroup.GET("/stats", adminHandler.GetDashboardStats)
			superAdminGroup.GET("/users/unassigned", adminHandler.GetUnassignedUsers) // needs to be paginated
			superAdminGroup.POST("/teams", adminHandler.CreateTeam)
			superAdminGroup.GET("/teams", adminHandler.GetTeams) // needs to be paginated

			superAdminGroup.POST("/teams/transfer", adminHandler.TransferTeamMember)
			superAdminGroup.GET("/users/assigned", adminHandler.GetAssignedUsers) // needs to be paginated
			superAdminGroup.PUT("/users/:user_id/system-profile", adminHandler.UpdateUserSystemProfile)
			superAdminGroup.GET("/users/:user_id/score-breakdown", scoreHandler.GetUserScoreBreakdown)
			superAdminGroup.PUT("/attendance", adminHandler.ToggleAttendance)
			superAdminGroup.DELETE("/organization", adminHandler.DeleteOrganization)
			superAdminGroup.GET("/face-registration-status", adminHandler.GetFaceRegistrationStatus)
			superAdminGroup.GET("/attendance", attendanceHandler.GetOrgAttendance)
			superAdminGroup.GET("/attendance/report", attendanceHandler.DownloadOrgReport)
			superAdminGroup.GET("/attendance/users/:user_id/summary", attendanceHandler.GetUserAttendanceSummary)
			superAdminGroup.GET("/attendance/users/:user_id/report", attendanceHandler.DownloadUserReport)
		}

		// TEAM ADMINS & SUPER ADMINS ---
		// Team-scoped actions
		teamAdminGroup := admin.Group("")
		teamAdminGroup.Use(middleware.RequireRole("ADMIN", "SUPER_ADMIN"))
		{

			teamAdminGroup.GET("/team-stats", adminHandler.GetAdminTeamStats)
			teamAdminGroup.GET("/employees", adminHandler.GetTeamEmployees)
			teamAdminGroup.GET("/teams/options", adminHandler.GetAdminTeamOptions)
			teamAdminGroup.POST("/teams/:team_id/tasks", costLimiter, taskHandler.CreateTask)
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
			teamAdminGroup.PUT("/tasks/:task_id/action/:action", costLimiter, taskHandler.ActionTask) // reject or reopen

			teamAdminGroup.GET("/employees/:user_id/score-breakdown", scoreHandler.GetUserScoreBreakdown)
			teamAdminGroup.GET("/leaderboard", scoreHandler.GetAdminLeaderboard)
			teamAdminGroup.PUT("/teams/:team_id/leaderboard-visibility", scoreHandler.ToggleLeaderboardVisibility)
			teamAdminGroup.GET("/reports/score-download", scoreHandler.DownloadScoreReport)
		}

		users := v1.Group("/users")

		// Every route in this block requires a valid login
		users.Use(middleware.RequireAuth(s_byte))
		users.Use(middleware.BlockSuspendedUsers(queries))
		{

			users.GET("/me/profile", userHandler.GetMyProfile)
			users.PUT("/me/profile", userHandler.UpdateMyProfile)
			users.PUT("/me/face", userHandler.RegisterFace)
		}
	}

	// 5. Start Server
	if os.Getenv("AWS_LAMBDA_FUNCTION_NAME") != "" {
		lambda.Start(ginadapter.NewV2(r).ProxyWithContext)
	} else {
		fmt.Printf("listening on :8082\n")
		r.Run(":8082")
	}
}
