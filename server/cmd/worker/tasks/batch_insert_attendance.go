package tasks

import (
	"context"
	"fmt"
	"log"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
)

func NewBatchInsertAttendanceTask(queries *db.Queries) func(context.Context, map[string]any) (any, error) {
	return func(ctx context.Context, args map[string]any) (any, error) {
		log.Println("[Attendance] Inserting absent records for active users in attendance-enabled orgs")

		err := queries.BatchInsertAbsentAttendance(ctx)
		if err != nil {
			return nil, fmt.Errorf("batch insert attendance: %w", err)
		}

		log.Println("[Attendance] Batch insert complete")
		return "done", nil
	}
}
