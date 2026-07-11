package main

import (
	"context"
	"database/sql"
	"log"
	"os"
	"time"

	"github.com/crizah/Abhiyan/server/cmd/worker/tasks"
	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/services"
	app "github.com/crizah/Onion/app"
	broker "github.com/crizah/Onion/broker"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
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

	wa := os.Getenv("WHATSAPP_ACCESS_TOKEN")
	bp := os.Getenv("PHONE_ID")
	whatsappService := services.NewWhatsappService(context.Background(), wa, bp)

	s3Service, err := services.NewS3Service(context.Background())
	if err != nil {
		log.Fatalf("Failed to initialize S3 service: %v", err)
	}
	whisperService := services.NewWhisperService()

	// 2. Initialize Onion App
	broker_url := os.Getenv("BROKER_URL")
	dashboard_addr := os.Getenv("DASHBOARD_URL")
	googleClientID := os.Getenv("GOOGLE_CLIENT_ID")
	rdb := redis.NewClient(&redis.Options{Addr: broker_url})

	onionApp, err := app.New(app.Config{
		BrokerAddr:    broker_url,
		BackendURL:    dbURL,
		DashboardAddr: dashboard_addr,

		Concurrency:  10,
		DefaultQueue: "default",
		Queues: []broker.Queue{
			{Name: "auth", Priority: 10},
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
	onionApp.Register("send_password_reset_email", tasks.NewSendPasswordResetEmailTask(emailService))

	// register reminder
	onionApp.Register("send_reminder_email", tasks.NewSendReminderEmailTask(emailService))
	onionApp.Register("poll_due_reminders", tasks.NewPollDueRemindersTask(dbConn, queries, onionApp))
	onionApp.Register("send_reminder_whatsapp", tasks.NewSendReminderWhatsappTask(whatsappService))

	// register transcription
	onionApp.Register("poll_pending_transcriptions", tasks.NewPollPendingTranscriptionsTask(queries, onionApp))
	onionApp.Register("transcribe_audio", tasks.NewTranscribeAudioTask(queries, s3Service, whisperService))

	// register audio transcode (separate from transcription: produces a
	// universally-playable copy of voice notes for cross-browser/iOS playback)
	onionApp.Register("poll_pending_audio_transcodes", tasks.NewPollPendingAudioTranscodesTask(queries, onionApp))
	onionApp.Register("transcode_audio", tasks.NewTranscodeAudioTask(queries, s3Service))

	// register missed deadline poller
	onionApp.Register("poll_missed_deadlines", tasks.NewPollMissedDeadlinesTask(queries))

	// register google auth verification
	onionApp.Register("verify_google_token", tasks.NewVerifyGoogleTokenTask(rdb, googleClientID))

	// register face validation
	rekognitionService, err := services.NewRekognitionService(context.Background())
	if err != nil {
		log.Fatalf("Failed to initialize Rekognition service: %v", err)
	}
	faceValidationService := services.NewFaceValidationService(dbConn)
	onionApp.Register("validate_face", tasks.NewValidateFaceTask(faceValidationService, rekognitionService))

	// register attendance face compare
	attendanceService := services.NewAttendanceService(dbConn)
	onionApp.Register("compare_faces", tasks.NewCompareFacesTask(attendanceService, rekognitionService))

	// register attendance cron
	onionApp.Register("batch_insert_attendance", tasks.NewBatchInsertAttendanceTask(queries))

	// cron schedules (e.g. the daily attendance batch) are meant to fire at
	// local IST times regardless of the host/container's own timezone
	istLocation, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		log.Fatalf("failed to load IST location: %v", err)
	}

	// map to queue
	onionApp.UpdateConfig(app.Config{
		Location: istLocation,
		TaskRoutes: map[string]string{
			"verify_google_token":           "auth",
			"send_invite_email":             "critical",
			"send_password_reset_email":     "critical",
			"send_reminder_email":           "reminders",
			"send_reminder_whatsapp":        "reminders",
			"poll_due_reminders":            "polling",
			"poll_pending_transcriptions":   "polling",
			"transcribe_audio":              "default",
			"poll_pending_audio_transcodes": "polling",
			"transcode_audio":               "default",
			"poll_missed_deadlines":         "polling",
			"validate_face":                 "default",
			"compare_faces":                 "default",
			"batch_insert_attendance":       "polling",
		},
	})

	// Schedule the Ticks
	err = onionApp.Schedule("system_reminder_tick", "poll_due_reminders", "@every 1m", nil)
	if err != nil {
		log.Fatalf("failed to schedule reminder tick: %v", err)
	}

	err = onionApp.Schedule("system_transcription_tick", "poll_pending_transcriptions", "@every 30s", nil)
	if err != nil {
		log.Fatalf("failed to schedule transcription tick: %v", err)
	}

	err = onionApp.Schedule("system_audio_transcode_tick", "poll_pending_audio_transcodes", "@every 30s", nil)
	if err != nil {
		log.Fatalf("failed to schedule audio transcode tick: %v", err)
	}

	err = onionApp.Schedule("system_missed_deadline_tick", "poll_missed_deadlines", "@every 5m", nil)
	if err != nil {
		log.Fatalf("failed to schedule missed deadline tick: %v", err)
	}

	err = onionApp.Schedule("system_attendance_tick", "batch_insert_attendance", "1 0 * * *", nil)
	if err != nil {
		log.Fatalf("failed to schedule attendance tick: %v", err)
	}

	// 4. Start Worker
	log.Println("Worker started successfully. Listening for tasks...")
	onionApp.Start()

}
