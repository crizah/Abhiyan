
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