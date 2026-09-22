package tasks

import (
	"context"
	"fmt"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
)

func NewCleanupExpiredKVTask(queries *db.Queries) func(context.Context, map[string]any) (any, error) {
	return func(ctx context.Context, args map[string]any) (any, error) {
		if err := queries.DeleteExpiredKV(ctx); err != nil {
			return nil, fmt.Errorf("cleanup_expired_kv: %w", err)
		}
		return "ok", nil
	}
}
