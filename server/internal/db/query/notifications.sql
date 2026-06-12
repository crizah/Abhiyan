-- name: GetUserNotifications :many
SELECT id, title, message, is_read, created_at
FROM notifications
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 20;

-- name: MarkNotificationsRead :exec
UPDATE notifications SET is_read = TRUE WHERE user_id = $1;

-- name: ClearNotifications :exec
DELETE FROM notifications WHERE user_id = $1;

-- name: MarkOneNotificationRead :exec
UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2;