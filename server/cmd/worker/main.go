package worker

import (
	"database/sql"
	"log"
	"os"

	"github.com/crizah/Abhiyan/server/cmd/worker/tasks"
	app "github.com/crizah/Onion/app"
	broker "github.com/crizah/Onion/broker"
	"github.com/joho/godotenv"
)

func main() {
	godotenv.Load()

	dbURL := os.Getenv("DATABASE_URL")
	dbConn, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatal(err)
	}
	defer dbConn.Close()

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
		},
	})

	// Register the task
	onionApp.Register("send_invite_email", tasks.SendInviteEmailTask)
	onionApp.Start()

}
