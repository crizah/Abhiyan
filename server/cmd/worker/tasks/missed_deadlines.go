package tasks

import (
	"context"
	"fmt"
	"log"
	"time"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
)

func NewPollMissedDeadlinesTask(queries *db.Queries) func(context.Context, map[string]any) (any, error) {
	return func(ctx context.Context, args map[string]any) (any, error) {
		log.Println("[Missed Deadline Poller] Scanning for overdue tasks...")

		candidates, err := queries.GetMissedDeadlineCandidates(ctx)
		if err != nil {
			log.Printf("[Missed Deadline Poller] ERROR: %v\n", err)
			return nil, fmt.Errorf("failed to fetch candidates: %w", err)
		}

		if len(candidates) == 0 {
			log.Println("[Missed Deadline Poller] 0 overdue tasks found.")
			return "No missed deadlines", nil
		}

		log.Printf("[Missed Deadline Poller] Found %d overdue task-assignee pairs.\n", len(candidates))

		count := 0
		for _, c := range candidates {
			_, err := queries.InsertScoreEvent(ctx, db.InsertScoreEventParams{
				TaskID:        c.TaskID,
				UserID:        c.UserID,
				TeamID:        c.TeamID,
				OrgID:         c.OrgID,
				EventType:     db.ScoreEventTypeMISSEDDEADLINE,
				PointsAwarded: 0,
				DueDateSnapshot: c.DueDate,
				EventAt:       time.Now(),
			})
			if err != nil {
				log.Printf("[Missed Deadline Poller] Skipped task %s user %s: %v\n", c.TaskID, c.UserID, err)
				continue
			}
			count++
		}

		log.Printf("[Missed Deadline Poller] Recorded %d missed deadline events.\n", count)
		return fmt.Sprintf("Recorded %d missed deadlines", count), nil
	}
}
