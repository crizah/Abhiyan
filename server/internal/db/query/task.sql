-- name: CreateTask :one
INSERT INTO tasks (
    team_id, title, description, status, fulfillment_status, created_by, due_date
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
)
RETURNING *;

-- name: GetTaskByID :one
SELECT * FROM tasks
WHERE id = $1 LIMIT 1;

-- name: ListTasksByTeam :many
SELECT * FROM tasks
WHERE team_id = $1
ORDER BY created_at DESC;