package tasks

import (
	"context"
	"fmt"

	db "github.com/crizah/Abhiyan/server/internal/db/sqlc"
	"github.com/crizah/Abhiyan/server/internal/services"
	"github.com/crizah/Abhiyan/server/internal/util"
)

// NewSendPushNotificationTask delivers a push notification to every device
// registered for a given user (within an org). Fired alongside every DB
// notification write in TaskService, so the Android app gets a system-tray
// alert even when it's backgrounded rather than relying on the in-app poll.
func NewSendPushNotificationTask(queries *db.Queries, pushService services.PushInterface) func(context.Context, map[string]any) (any, error) {
	return func(ctx context.Context, args map[string]any) (any, error) {
		userIDStr, ok := args["user_id"].(string)
		if !ok {
			return nil, fmt.Errorf("missing or invalid 'user_id' argument")
		}
		orgIDStr, ok := args["org_id"].(string)
		if !ok {
			return nil, fmt.Errorf("missing or invalid 'org_id' argument")
		}
		title, ok := args["title"].(string)
		if !ok {
			return nil, fmt.Errorf("missing or invalid 'title' argument")
		}
		message, ok := args["message"].(string)
		if !ok {
			return nil, fmt.Errorf("missing or invalid 'message' argument")
		}

		tokens, err := queries.GetDeviceTokensForUser(ctx, db.GetDeviceTokensForUserParams{
			UserID: util.ParseUUID(userIDStr),
			OrgID:  util.ParseUUID(orgIDStr),
		})
		if err != nil {
			return nil, fmt.Errorf("failed to load device tokens for user %s: %w", userIDStr, err)
		}

		if len(tokens) == 0 {
			// Normal case: user has no Android device registered (web-only, or
			// hasn't granted notification permission yet).
			return "No registered devices, skipped", nil
		}

		var failures []string
		for _, token := range tokens {
			sendErr := pushService.SendPush(ctx, token, title, message)
			if sendErr == nil {
				continue
			}

			if services.IsUnregisteredToken(sendErr) {
				_ = queries.DeleteDeviceToken(ctx, token)
				continue
			}

			failures = append(failures, fmt.Sprintf("%s: %v", token, sendErr))
		}

		if len(failures) > 0 {
			return nil, fmt.Errorf("failed to push to %d/%d device(s): %v", len(failures), len(tokens), failures)
		}

		return fmt.Sprintf("Pushed to %d device(s)", len(tokens)), nil
	}
}
