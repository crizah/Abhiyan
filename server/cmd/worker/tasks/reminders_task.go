package tasks

import (
	"context"
	"fmt"
	"log"
	"time"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Onion/app"
)

func NewPollDueRemindersTask(queries *db.Queries, onionApp *app.App) func(context.Context, map[string]any) (any, error) {
	return func(ctx context.Context, args map[string]any) (any, error) {

		log.Println("[Poller] Scanning for new reminders")

		reminders, err := queries.GetDueReminders(ctx)
		if err != nil {
			log.Printf("[Poller] ERROR: Failed to fetch reminders: %v\n", err)
			return nil, fmt.Errorf("failed to fetch due reminders: %w", err)
		}

		if len(reminders) == 0 {
			log.Println("[Poller] 0 reminders are currently due.")
			return "No reminders due", nil
		}

		log.Printf("[Poller] Found %d due reminders! Dispatching \n", len(reminders))

		for _, rem := range reminders {

			if rem.Channel == db.ReminderChannelWHATSAPP {
				// send to whatsapp
				assigneePhones, _ := queries.GetTaskAssigneePhones(ctx, rem.TaskID)

				for _, n := range assigneePhones {
					// skip if the database value was NULL or empty
					if !n.Valid || n.String == "" {
						continue
					}

					err := onionApp.Enqueue(ctx, "send_reminder_whatsapp", map[string]any{
						"rPN":      n.String,
						"taskName": rem.TaskTitle,
					})
					if err != nil {
						log.Printf("[Poller] Failed to enqueue whatsapp for %s: %v\n", n.String, err)
					} else {
						log.Printf("[Poller] Enqueued whatsapp reminder for: %s\n", n.String)
					}

				}

			} else {

				assigneeEmails, _ := queries.GetTaskAssigneeEmails(ctx, rem.TaskID)

				// 1. Dispatch emails

				for _, email := range assigneeEmails {
					err := onionApp.Enqueue(ctx, "send_reminder_email", map[string]any{
						"email":    email,
						"taskName": rem.TaskTitle,
					})
					if err != nil {
						log.Printf("[Poller] Failed to enqueue email for %s: %v\n", email, err)
					} else {
						log.Printf("[Poller] Enqueued email reminder for: %s\n", email)
					}
				}

			}

			// 2. State Management: ALWAYS complete the current row
			_ = queries.CompleteReminder(ctx, rem.ID)

			// 3. Spawning Logic: If recurring, insert a BRAND NEW row for the next date
			isRecurring := rem.RecurrenceValue.Valid && rem.RecurrenceUnit.Valid

			if isRecurring {
				nextTime := calculateNextOccurrence(
					time.Now(),
					int(rem.RecurrenceValue.Int32),
					string(rem.RecurrenceUnit.RecurrenceUnit),
				)

				// Re-use your existing CreateReminder query to spawn the next iteration
				_, err := queries.CreateReminder(ctx, db.CreateReminderParams{
					TaskID:          rem.TaskID,
					ScheduledAt:     nextTime,
					Channel:         rem.Channel,
					RecurrenceValue: rem.RecurrenceValue,
					RecurrenceUnit:  rem.RecurrenceUnit,
					IsSystemSpawned: true,
				})

				if err != nil {
					log.Printf("[Poller] Failed to spawn next recurring reminder for task %s: %v\n", rem.TaskID, err)
				} else {
					log.Printf("[Poller] Spawned next recurring reminder for: %v\n", nextTime)
				}
			}
		}

		log.Printf("[Poller] Successfully processed %d reminders.\n", len(reminders))
		return fmt.Sprintf("Processed %d reminders", len(reminders)), nil
	}
}

func calculateNextOccurrence(now time.Time, value int, unit string) time.Time {
	switch unit {
	case "HOURS":
		return now.Add(time.Duration(value) * time.Hour)
	case "DAYS":
		return now.AddDate(0, 0, value)
	case "WEEKS":
		return now.AddDate(0, 0, value*7)
	case "MONTHS":
		return now.AddDate(0, value, 0)
	default:
		return now.AddDate(0, 0, value)
	}
}
