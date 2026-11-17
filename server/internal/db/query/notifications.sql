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

-- name: GetOverdueTasksAsAssignee :many
SELECT t.id, t.title, tm.name AS team_name, t.due_date,
       COALESCE(u.first_name, '') AS creator_first_name,
       COALESCE(u.last_name, '') AS creator_last_name
FROM tasks t
JOIN teams tm ON tm.id = t.team_id AND tm.org_id = $2
JOIN task_participants tp ON tp.task_id = t.id AND tp.user_id = $1 AND tp.role = 'ASSIGNEE'
LEFT JOIN users u ON u.id = t.created_by
WHERE t.status = 'OPEN'
  AND t.review_status <> 'APPROVED'
  AND t.due_date < NOW();

-- name: GetOverdueTasksAsAssignor :many
SELECT t.id, t.title, tm.name AS team_name, t.due_date,
       tp.user_id AS assignee_id,
       COALESCE(u.first_name, '') AS assignee_first_name,
       COALESCE(u.last_name, '') AS assignee_last_name
FROM tasks t
JOIN teams tm ON tm.id = t.team_id AND tm.org_id = $2
JOIN task_participants tp ON tp.task_id = t.id AND tp.role = 'ASSIGNEE'
JOIN users u ON u.id = tp.user_id
WHERE t.created_by = $1
  AND t.status = 'OPEN'
  AND t.review_status <> 'APPROVED'
  AND t.due_date < NOW();
