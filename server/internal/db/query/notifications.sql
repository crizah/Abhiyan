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


-- name: CreateTaskCardNotification :exec
INSERT INTO notifications (user_id, org_id, title, message, task_id, card_kind)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: GetUserTaskCards :many
SELECT n.id, n.card_kind, n.message, n.created_at, n.task_id,
       t.title AS task_title, t.due_date,
       tm.name AS team_name,
       u.first_name AS creator_first_name, u.last_name AS creator_last_name
FROM notifications n
JOIN tasks t ON t.id = n.task_id
JOIN teams tm ON tm.id = t.team_id
LEFT JOIN users u ON u.id = t.created_by
WHERE n.user_id = $1 AND n.org_id = $2 AND n.card_kind IS NOT NULL
ORDER BY n.created_at DESC;

-- name: DismissTaskCard :exec
UPDATE notifications SET card_kind = NULL WHERE id = $1 AND user_id = $2 AND org_id = $3;
