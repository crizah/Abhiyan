
-- name: GetTaskByID :one
SELECT * FROM tasks
WHERE id = $1 LIMIT 1;

-- name: GetTaskOrgID :one
SELECT t.org_id
FROM tasks tk
JOIN teams t ON tk.team_id = t.id
WHERE tk.id = $1;

-- name: GetTaskUpdateOrgID :one
SELECT t.org_id
FROM task_updates tu
JOIN tasks tk ON tu.task_id = tk.id
JOIN teams t ON tk.team_id = t.id
WHERE tu.id = $1;

-- name: GetTaskUpdateCommentOrgID :one
SELECT t.org_id
FROM task_update_comments c
JOIN task_updates tu ON c.task_update_id = tu.id
JOIN tasks tk ON tu.task_id = tk.id
JOIN teams t ON tk.team_id = t.id
WHERE c.id = $1;

-- name: GetAttachmentOrgID :one
SELECT COALESCE(t1.org_id, t2.org_id, t3.org_id) AS org_id
FROM attachments a
LEFT JOIN tasks tk1 ON a.task_id = tk1.id
LEFT JOIN teams t1 ON tk1.team_id = t1.id
LEFT JOIN task_updates tu ON a.task_update_id = tu.id
LEFT JOIN tasks tk2 ON tu.task_id = tk2.id
LEFT JOIN teams t2 ON tk2.team_id = t2.id
LEFT JOIN task_update_comments tc ON a.task_comment_id = tc.id
LEFT JOIN task_updates tu2 ON tc.task_update_id = tu2.id
LEFT JOIN tasks tk3 ON tu2.task_id = tk3.id
LEFT JOIN teams t3 ON tk3.team_id = t3.id
WHERE a.id = $1;

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
WITH base AS (
    SELECT t.id, t.team_id, t.title, t.description, t.status,
           t.fulfillment_status, t.review_status, t.created_by,
           t.due_date, t.created_at, u.first_name, u.last_name
    FROM tasks t
    JOIN users u ON t.created_by = u.id
    WHERE t.team_id = $1
)
SELECT *, COUNT(*) OVER() AS total_count
FROM base
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

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
SELECT tu.id, tu.task_id, tu.user_id, tu.content, tu.created_at,
       u.first_name, u.last_name,
       (SELECT COUNT(*) FROM task_update_comments c WHERE c.task_update_id = tu.id) AS comment_count
FROM task_updates tu
JOIN users u ON tu.user_id = u.id
WHERE tu.task_id = $1
ORDER BY tu.created_at DESC
LIMIT $2 OFFSET $3;

-- name: CreateReminder :one
INSERT INTO reminders (task_id, scheduled_at, channel, recurrence_value, recurrence_unit, is_system_spawned)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetTaskDetailsForNotifications :one
SELECT title FROM tasks WHERE id = $1;

-- name: GetTaskReminders :many
SELECT * FROM reminders
WHERE task_id = $1 AND is_system_spawned = FALSE ORDER BY scheduled_at ASC;

-- name: DeleteTaskParticipants :exec
DELETE FROM task_participants WHERE task_id = $1;

-- name: DeleteTaskReminders :exec
DELETE FROM reminders WHERE task_id = $1;

-- name: CancelTaskReminders :exec
UPDATE reminders SET status = 'CANCELLED' WHERE task_id = $1 AND status = 'PENDING';

-- name: GetAdminAllTasks :many
WITH base AS (
    SELECT DISTINCT
        t.id, t.team_id, t.title, t.description, t.status, t.fulfillment_status, t.review_status,
        t.created_by, t.due_date, t.created_at,
        u.first_name, u.last_name,
        tm.name AS team_name
    FROM tasks t
    JOIN users u ON t.created_by = u.id
    JOIN teams tm ON t.team_id = tm.id
    JOIN team_members tmem ON tm.id = tmem.team_id
    WHERE tmem.user_id = $1 AND tmem.team_role = 'TEAM_ADMIN'
)
SELECT *, COUNT(*) OVER() AS total_count
FROM base
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: UpdateTaskDeadline :exec
UPDATE tasks SET due_date = $2 WHERE id = $1;

-- name: GetTaskDeadline :one
SELECT due_date from tasks WHERE id = $1;

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

-- name: GetUpdateComments :many
SELECT c.id, c.task_update_id, c.user_id, c.content, c.created_at,
       u.first_name, u.last_name
FROM task_update_comments c
LEFT JOIN users u ON c.user_id = u.id
WHERE c.task_update_id = $1
ORDER BY c.created_at ASC
LIMIT $2 OFFSET $3;

-- name: GetTaskUpdateAuthor :one
SELECT user_id FROM task_updates WHERE id = $1;

-- name: GetEmployeeTasks :many
WITH distinct_tasks AS (
    SELECT DISTINCT 
        t.id, t.team_id, t.title, t.description, t.status, 
        t.fulfillment_status, t.review_status, t.created_by, 
        t.due_date, t.created_at, u.first_name, u.last_name
    FROM tasks t
    JOIN users u ON t.created_by = u.id
    JOIN task_participants tp ON t.id = tp.task_id
    WHERE t.team_id = $1 AND tp.user_id = $2
)
SELECT 
    *, 
    COUNT(*) OVER() AS total_count
FROM distinct_tasks
ORDER BY created_at DESC
LIMIT $3 OFFSET $4;

-- name: SubmitTaskState :exec
UPDATE tasks SET fulfillment_status = 'COMPLETED', review_status = 'PENDING' WHERE id = $1;

-- name: ApproveTaskState :exec
UPDATE tasks SET status = 'CLOSED', review_status = 'APPROVED' WHERE id = $1;

-- name: RejectTaskState :exec
UPDATE tasks SET status = 'OPEN', fulfillment_status = 'PENDING', review_status = 'REJECTED', due_date = $2 WHERE id = $1;

-- name: ReopenTaskState :exec
UPDATE tasks SET status = 'OPEN', fulfillment_status = 'PENDING', review_status = 'UNSUBMITTED', due_date = $2 WHERE id = $1;

-- name: GetDueReminders :many
SELECT r.id, r.task_id, r.channel, r.recurrence_value, r.recurrence_unit, t.title as task_title
FROM reminders r
JOIN tasks t ON r.task_id = t.id
WHERE r.status = 'PENDING' 
  AND r.scheduled_at <= NOW()
FOR UPDATE SKIP LOCKED;

-- name: CompleteReminder :exec
UPDATE reminders 
SET status = 'SENT' 
WHERE id = $1;

-- name: RescheduleReminder :exec
UPDATE reminders 
SET scheduled_at = $2 
WHERE id = $1;

-- name: GetTaskAssigneeEmails :many
SELECT u.email_id
FROM users u
JOIN task_participants tp ON u.id = tp.user_id
WHERE tp.task_id = $1 AND tp.role = 'ASSIGNEE';

-- name: GetTaskAssigneePhones :many
SELECT u.phone_number 
FROM users u JOIN task_participants tp on u.id = tp.user_id
WHERE tp.task_id = $1 and tp.role = 'ASSIGNEE';

-- name: InsertAttachment :one
INSERT INTO attachments (
    task_id, task_update_id, task_comment_id, file_name, file_url, file_type, file_size_bytes, uploaded_by
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
) RETURNING id;

-- name: GetTaskAttachments :many
SELECT a.id, a.file_name, a.file_url, a.file_type, a.file_size_bytes,
       t.status AS transcription_status, t.transcript_text,
       at.status AS transcode_status, at.transcoded_file_url
FROM attachments a
LEFT JOIN transcriptions t ON t.attachment_id = a.id
LEFT JOIN audio_transcodes at ON at.attachment_id = a.id
WHERE a.task_id = $1 AND a.task_update_id IS NULL;

-- name: GetTaskUpdateAttachments :many
SELECT a.id, a.task_update_id, a.file_name, a.file_url, a.file_type, a.file_size_bytes,
       t.status AS transcription_status, t.transcript_text,
       at.status AS transcode_status, at.transcoded_file_url
FROM attachments a
LEFT JOIN transcriptions t ON t.attachment_id = a.id
LEFT JOIN audio_transcodes at ON at.attachment_id = a.id
WHERE a.task_update_id = ANY($1::uuid[]);

-- name: GetTaskCommentAttachments :many
SELECT a.id, a.task_comment_id, a.file_name, a.file_url, a.file_type, a.file_size_bytes,
       t.status AS transcription_status, t.transcript_text,
       at.status AS transcode_status, at.transcoded_file_url
FROM attachments a
LEFT JOIN transcriptions t ON t.attachment_id = a.id
LEFT JOIN audio_transcodes at ON at.attachment_id = a.id
WHERE a.task_comment_id = ANY($1::uuid[]);

-- name: DeleteTaskAttachments :exec
DELETE FROM attachments WHERE task_id = $1 AND task_update_id IS NULL;

-- name: DeleteAttachmentsByIDs :many
DELETE FROM attachments WHERE id = ANY($1::uuid[])
RETURNING file_url;

-- name: IsTaskAssignee :one
SELECT EXISTS (
    SELECT 1 FROM task_participants
    WHERE task_id = $1 AND user_id = $2 AND role = 'ASSIGNEE'
);