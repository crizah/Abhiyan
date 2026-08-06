-- name: UpsertDeviceToken :exec
INSERT INTO device_tokens (user_id, org_id, platform, fcm_token)
VALUES ($1, $2, $3, $4)
ON CONFLICT (fcm_token) DO UPDATE SET
    user_id = $1,
    org_id = $2,
    platform = $3,
    last_seen_at = NOW();

-- name: GetDeviceTokensForUser :many
SELECT fcm_token FROM device_tokens WHERE user_id = $1 AND org_id = $2;

-- name: DeleteDeviceToken :exec
DELETE FROM device_tokens WHERE fcm_token = $1;
