package main

import (
	"context"
	"database/sql"
	"log"
	"os"

	"github.com/crizah/Abhiyan/server/cmd/worker/tasks"
	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/services" // Import your services package
	app "github.com/crizah/Onion/app"
	broker "github.com/crizah/Onion/broker"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func main() {
	godotenv.Load()

	dbURL := os.Getenv("DB_URL")
	dbConn, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatal(err)
	}
	defer dbConn.Close()

	queries := db.New(dbConn)

	// 1. Initialize AWS SES Service
	senderEmail := os.Getenv("AWS_SES_SENDER") // e.g., "no-reply@yourdomain.com"
	if senderEmail == "" {
		log.Fatal("AWS_SES_SENDER environment variable is not set")
	}

	emailService, err := services.NewEmailService(context.Background(), senderEmail)
	if err != nil {
		log.Fatalf("Failed to initialize AWS SES client: %v", err)
	}

	// 2. Initialize Onion App
	broker_url := os.Getenv("BROKER_URL")
	dashboard_addr := os.Getenv("DASHBOARD_URL")
	onionApp, err := app.New(app.Config{
		BrokerAddr:    broker_url,
		BackendURL:    dbURL,
		DashboardAddr: dashboard_addr,

		Concurrency:  10,
		DefaultQueue: "default",
		Queues: []broker.Queue{
			{Name: "critical", Priority: 10},
			{Name: "reminders", Priority: 7},
			{Name: "polling", Priority: 7},
		},
	})
	if err != nil {
		log.Fatal(err)
	}

	// register task
	onionApp.Register("send_invite_email", tasks.NewSendInviteEmailTask(emailService))

	// register reminder
	onionApp.Register("send_reminder_email", tasks.NewSendReminderEmailTask(emailService))
	onionApp.Register("poll_due_reminders", tasks.NewPollDueRemindersTask(queries, onionApp))

	// map to queue
	onionApp.UpdateConfig(app.Config{
		TaskRoutes: map[string]string{
			"send_invite_email":   "critical",
			"send_reminder_email": "reminders",
			"poll_due_reminders":  "polling",
		},
	})

	// Schedule the Tick (Runs every 60 seconds)
	err = onionApp.Schedule("system_reminder_tick", "poll_due_reminders", "@every 1m", nil)
	if err != nil {
		log.Fatalf("failed to schedule reminder tick: %v", err)
	}

	// 4. Start Worker
	log.Println("Worker started successfully. Listening for tasks...")
	onionApp.Start()

}
