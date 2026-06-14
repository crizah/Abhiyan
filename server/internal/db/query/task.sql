
-- name: GetTaskByID :one
SELECT * FROM tasks
WHERE id = $1 LIMIT 1;

-- name: ListTasksByTeam :many
SELECT * FROM tasks
WHERE team_id = $1
ORDER BY created_at DESC;

-- name: UpdateTaskDetails :exec
UPDATE tasks 
SET title = $1, 
    description = $2, 
    due_date = $3 
WHERE id = $4;

-- name: CreateTask :one
INSERT INTO tasks (team_id, title, description, created_by, due_date)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetTeamTasks :many
SELECT t.*, u.first_name, u.last_name 
FROM tasks t
JOIN users u ON t.created_by = u.id
WHERE t.team_id = $1
ORDER BY t.created_at DESC;

-- name: UpdateTaskFulfillment :exec
UPDATE tasks 
SET fulfillment_status = $1 
WHERE id = $2;

-- name: UpdateTaskStatus :exec
UPDATE tasks 
SET status = $1 
WHERE id = $2;

-- name: AddTaskParticipant :exec
INSERT INTO task_participants (task_id, user_id, role)
VALUES ($1, $2, $3)
ON CONFLICT (task_id, user_id, role) DO NOTHING;

-- name: GetTaskParticipants :many
SELECT tp.role::text, u.id, u.first_name, u.last_name, u.email_id
FROM task_participants tp
JOIN users u ON tp.user_id = u.id
WHERE tp.task_id = $1;

-- name: AddTaskUpdate :one
INSERT INTO task_updates (task_id, user_id, content)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetTaskUpdates :many
SELECT tu.*, u.first_name, u.last_name
FROM task_updates tu
JOIN users u ON tu.user_id = u.id
WHERE tu.task_id = $1
ORDER BY tu.created_at ASC;

-- name: CreateReminder :one
INSERT INTO reminders (task_id, scheduled_at, channel, recurrence_value, recurrence_unit)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetTaskDetailsForNotifications :one
SELECT title FROM tasks WHERE id = $1;

-- name: GetTaskReminders :many
SELECT * FROM reminders WHERE task_id = $1 ORDER BY scheduled_at ASC;

-- name: DeleteTaskParticipants :exec
DELETE FROM task_participants WHERE task_id = $1;

-- name: DeleteTaskReminders :exec
DELETE FROM reminders WHERE task_id = $1;

-- name: GetAdminAllTasks :many
SELECT 
    t.id, t.team_id, t.title, t.description, t.status, t.fulfillment_status, t.review_status,
    t.created_by, t.due_date, t.created_at, 
    u.first_name, u.last_name, 
    tm.name as team_name
FROM tasks t
JOIN users u ON t.created_by = u.id
JOIN teams tm ON t.team_id = tm.id
JOIN team_members tmem ON tm.id = tmem.team_id
WHERE tmem.user_id = $1 AND tmem.team_role = 'TEAM_ADMIN'
ORDER BY t.created_at DESC;

-- name: UpdateTaskDeadline :exec
UPDATE tasks SET due_date = $2 WHERE id = $1;

-- name: AddUpdateComment :one
INSERT INTO task_update_comments (task_update_id, user_id, content)
VALUES ($1, $2, $3) RETURNING id;

-- name: GetTaskUpdateComments :many
SELECT c.id, c.task_update_id, c.user_id, c.content, c.created_at, 
       u.first_name, u.last_name
FROM task_update_comments c
JOIN task_updates tu ON c.task_update_id = tu.id
LEFT JOIN users u ON c.user_id = u.id
WHERE tu.task_id = $1
ORDER BY c.created_at ASC;

-- name: GetTaskUpdateAuthor :one
SELECT user_id FROM task_updates WHERE id = $1;

-- name: GetEmployeeTasks :many
SELECT DISTINCT t.id, t.team_id, t.title, t.description, t.status, t.fulfillment_status, t.review_status,
       t.created_by, t.due_date, t.created_at, u.first_name, u.last_name
FROM tasks t
JOIN users u ON t.created_by = u.id
JOIN task_participants tp ON t.id = tp.task_id
WHERE t.team_id = $1 AND tp.user_id = $2
ORDER BY t.created_at DESC;

-- name: SubmitTaskState :exec
UPDATE tasks SET fulfillment_status = 'COMPLETED', review_status = 'PENDING' WHERE id = $1;

-- name: ApproveTaskState :exec
UPDATE tasks SET status = 'CLOSED', review_status = 'APPROVED' WHERE id = $1;

-- name: RejectTaskState :exec
UPDATE tasks SET status = 'OPEN', fulfillment_status = 'PENDING', review_status = 'REJECTED', due_date = $2 WHERE id = $1;

-- name: ReopenTaskState :exec
UPDATE tasks SET status = 'OPEN', fulfillment_status = 'PENDING', review_status = 'UNSUBMITTED', due_date = $2 WHERE id = $1;