-- name: InsertScoreEvent :one
INSERT INTO employee_scores (task_id, user_id, team_id, org_id, event_type, points_awarded, due_date_snapshot, event_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: SupersedeScoreEvents :exec
UPDATE employee_scores
SET superseded = true
WHERE task_id = $1 AND user_id = $2 AND superseded = false;

-- name: GetUserScoreBreakdown :one
SELECT
    COALESCE(SUM(points_awarded), 0)::bigint AS total_points,
    COUNT(*) FILTER (WHERE event_type = 'ON_TIME_COMPLETION') AS on_time_count,
    COUNT(*) FILTER (WHERE event_type = 'LATE_COMPLETION') AS late_count,
    COUNT(*) FILTER (WHERE event_type = 'MISSED_DEADLINE') AS missed_count,
    COUNT(*) FILTER (WHERE event_type = 'REJECTION') AS rejection_count
FROM employee_scores
WHERE user_id = $1 AND superseded = false
  AND (sqlc.arg('team_filter')::text = '' OR team_id::text = sqlc.arg('team_filter'));

-- name: GetUserScoreEvents :many
SELECT
    es.id, es.task_id, es.team_id, es.event_type::text, es.points_awarded,
    es.due_date_snapshot, es.event_at,
    t.title AS task_title,
    tm.name AS team_name
FROM employee_scores es
JOIN tasks t ON es.task_id = t.id
JOIN teams tm ON es.team_id = tm.id
WHERE es.user_id = $1 AND es.superseded = false
  AND (sqlc.arg('team_filter')::text = '' OR es.team_id::text = sqlc.arg('team_filter'))
ORDER BY es.event_at DESC
LIMIT $2 OFFSET $3;

-- name: GetTeamLeaderboard :many
SELECT
    u.id AS user_id,
    u.first_name,
    u.last_name,
    u.email_id,
    COALESCE(SUM(es.points_awarded), 0)::bigint AS total_points,
    COUNT(es.id) FILTER (WHERE es.event_type = 'ON_TIME_COMPLETION') AS on_time_count,
    COUNT(es.id) FILTER (WHERE es.event_type IN ('ON_TIME_COMPLETION', 'LATE_COMPLETION')) AS completed_count
FROM team_members tm
JOIN users u ON tm.user_id = u.id
LEFT JOIN employee_scores es ON u.id = es.user_id AND es.team_id = tm.team_id AND es.superseded = false
WHERE tm.team_id = $1
GROUP BY u.id, u.first_name, u.last_name, u.email_id
ORDER BY total_points DESC, u.first_name ASC;

-- name: GetAggregatedLeaderboard :many
SELECT
    u.id AS user_id,
    u.first_name,
    u.last_name,
    u.email_id,
    COALESCE(SUM(es.points_awarded), 0)::bigint AS total_points,
    COUNT(es.id) FILTER (WHERE es.event_type = 'ON_TIME_COMPLETION') AS on_time_count,
    COUNT(es.id) FILTER (WHERE es.event_type IN ('ON_TIME_COMPLETION', 'LATE_COMPLETION')) AS completed_count
FROM (SELECT DISTINCT user_id FROM team_members WHERE team_id = ANY($1::uuid[])) AS members
JOIN users u ON members.user_id = u.id
LEFT JOIN employee_scores es ON u.id = es.user_id AND es.team_id = ANY($1::uuid[]) AND es.superseded = false
GROUP BY u.id, u.first_name, u.last_name, u.email_id
ORDER BY total_points DESC, u.first_name ASC;

-- name: GetLeaderboardVisibility :one
SELECT leaderboard_visible FROM team_leaderboard_settings
WHERE team_id = $1;

-- name: UpsertLeaderboardVisibility :exec
INSERT INTO team_leaderboard_settings (team_id, leaderboard_visible, updated_by, updated_at)
VALUES ($1, $2, $3, NOW())
ON CONFLICT (team_id) DO UPDATE SET leaderboard_visible = $2, updated_by = $3, updated_at = NOW();

-- name: GetMissedDeadlineCandidates :many
SELECT t.id AS task_id, t.team_id, t.due_date, tm.org_id, tp.user_id
FROM tasks t
JOIN teams tm ON t.team_id = tm.id
JOIN task_participants tp ON t.id = tp.task_id AND tp.role = 'ASSIGNEE'
WHERE t.due_date < NOW()
  AND t.status = 'OPEN'
  AND t.review_status != 'APPROVED'
  AND t.due_date IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM employee_scores es
      WHERE es.task_id = t.id AND es.user_id = tp.user_id
        AND es.event_type = 'MISSED_DEADLINE' AND es.superseded = false
  );

-- name: GetTaskAssigneesWithContext :many
SELECT tp.user_id, t.team_id, tm.org_id
FROM task_participants tp
JOIN tasks t ON tp.task_id = t.id
JOIN teams tm ON t.team_id = tm.id
WHERE tp.task_id = $1 AND tp.role = 'ASSIGNEE';

-- name: GetLeaderboardVisibilityBulk :many
SELECT team_id, leaderboard_visible
FROM team_leaderboard_settings
WHERE team_id = ANY($1::uuid[]);

-- name: GetUserScoreReportData :many
SELECT
    es.event_type::text, es.points_awarded, es.due_date_snapshot, es.event_at,
    t.title AS task_title,
    tm.name AS team_name
FROM employee_scores es
JOIN tasks t ON es.task_id = t.id
JOIN teams tm ON es.team_id = tm.id
WHERE es.user_id = $1 AND es.superseded = false
ORDER BY es.event_at DESC;

-- name: GetBulkUserScoreBreakdowns :many
SELECT
    u.id AS user_id,
    u.first_name,
    u.last_name,
    u.email_id,
    COALESCE(SUM(es.points_awarded), 0)::bigint AS total_points,
    COUNT(es.id) FILTER (WHERE es.event_type = 'ON_TIME_COMPLETION') AS on_time_count,
    COUNT(es.id) FILTER (WHERE es.event_type = 'LATE_COMPLETION') AS late_count,
    COUNT(es.id) FILTER (WHERE es.event_type = 'MISSED_DEADLINE') AS missed_count,
    COUNT(es.id) FILTER (WHERE es.event_type = 'REJECTION') AS rejection_count
FROM (SELECT DISTINCT user_id FROM team_members WHERE team_id = ANY($1::uuid[])) AS members
JOIN users u ON members.user_id = u.id
LEFT JOIN employee_scores es ON u.id = es.user_id AND es.team_id = ANY($1::uuid[]) AND es.superseded = false
GROUP BY u.id, u.first_name, u.last_name, u.email_id
ORDER BY total_points DESC;
