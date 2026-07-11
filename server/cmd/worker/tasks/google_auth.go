package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/crizah/Abhiyan/server/internal/util"
	"github.com/redis/go-redis/v9"
)

// GoogleAuthResult is written to Redis so the API Lambda can read it.
type GoogleAuthResult struct {
	Email string `json:"email,omitempty"`
	Error string `json:"error,omitempty"`
}

// NewVerifyGoogleTokenTask verifies a Google ID token and writes the result
// to Redis under the key "google_auth:{job_id}". The API Lambda polls that
// key while it waits. This task runs in the ECS worker, which has outbound
// internet access — the API Lambda does not.
func NewVerifyGoogleTokenTask(rdb *redis.Client, googleClientID string) func(context.Context, map[string]any) (any, error) {
	return func(ctx context.Context, args map[string]any) (any, error) {
		jobID, _ := args["job_id"].(string)
		credential, _ := args["credential"].(string)

		if jobID == "" || credential == "" {
			return nil, fmt.Errorf("verify_google_token: missing job_id or credential")
		}

		resultKey := "google_auth:" + jobID

		var result GoogleAuthResult

		claims, err := util.VerifyGoogleIDToken(ctx, credential, googleClientID)
		if err != nil {
			result = GoogleAuthResult{Error: "invalid google credential"}
		} else {
			result = GoogleAuthResult{Email: claims.Email}
		}

		data, marshalErr := json.Marshal(result)
		if marshalErr != nil {
			return nil, marshalErr
		}

		// TTL of 60s: Lambda polls for at most 10s, this gives plenty of headroom.
		if setErr := rdb.Set(ctx, resultKey, data, 60*time.Second).Err(); setErr != nil {
			return nil, fmt.Errorf("verify_google_token: failed to write result to redis: %w", setErr)
		}

		return "ok", nil
	}
}
