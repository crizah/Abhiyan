-- name: GetUserNotifications :many
SELECT id, title, message, is_read, created_at
FROM notifications
WHERE user_id = $1 AND org_id = $2
ORDER BY created_at DESC
LIMIT 20;

-- name: MarkNotificationsRead :exec
UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND org_id = $2;

-- name: ClearNotifications :exec
DELETE FROM notifications WHERE user_id = $1 AND org_id = $2;

-- name: MarkOneNotificationRead :exec
UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 AND org_id = $3;


-- name: CreateNotification :exec
INSERT INTO notifications (user_id, org_id, title, message)
VALUES ($1, $2, $3, $4);

