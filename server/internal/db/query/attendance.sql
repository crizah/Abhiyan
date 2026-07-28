-- name: UpsertAttendanceRecord :one
INSERT INTO attendance_record (user_id, org_id, target_file_uri, status)
VALUES ($1, $2, $3, 'pending')
ON CONFLICT (user_id, org_id, attendance_date)
DO UPDATE SET target_file_uri = $3, status = 'pending', updated_at = NOW()
RETURNING id;

-- name: GetTodayAttendance :one
SELECT id, status, present
FROM attendance_record
WHERE user_id = $1 AND org_id = $2 AND attendance_date = CURRENT_DATE
LIMIT 1;

-- name: SetAttendanceResult :exec
UPDATE attendance_record
SET present = $2, status = $3, updated_at = NOW()
WHERE id = $1;

-- name: BatchInsertAbsentAttendance :exec
INSERT INTO attendance_record (user_id, org_id, present, status)
SELECT om.user_id, om.org_id, false, 'absent'
FROM org_memberships om
JOIN organizations o ON om.org_id = o.id
WHERE om.status = 'ACTIVE'
  AND o.attendance_enabled = true
  AND EXISTS (
      SELECT 1 FROM team_members tm
      JOIN teams t ON tm.team_id = t.id
      WHERE tm.user_id = om.user_id AND t.org_id = om.org_id
  )
ON CONFLICT (user_id, org_id, attendance_date) DO NOTHING;

-- name: GetOrgAttendanceByDate :many
SELECT DISTINCT ON (u.id)
    u.id,
    COALESCE(u.first_name, '') AS first_name,
    COALESCE(u.last_name, '') AS last_name,
    u.email_id,
    COALESCE(t.name, 'Unassigned') AS team_name,
    CASE
        WHEN a.present = true THEN 'present'
        WHEN a.present = false THEN 'absent'
        ELSE 'no_record'
    END AS attendance_status
FROM users u
JOIN org_memberships om ON om.user_id = u.id AND om.org_id = $2 AND om.status = 'ACTIVE'
LEFT JOIN attendance_record a ON u.id = a.user_id AND a.org_id = $2 AND a.attendance_date = $1
LEFT JOIN team_members tm ON u.id = tm.user_id
LEFT JOIN teams t ON tm.team_id = t.id AND t.org_id = $2
WHERE EXISTS (
    SELECT 1 FROM team_members tm2
    JOIN teams t2 ON tm2.team_id = t2.id
    WHERE tm2.user_id = u.id AND t2.org_id = $2
)
ORDER BY u.id, u.first_name;

-- name: GetOrgAttendanceByDateAndTeam :many
SELECT
    u.id,
    COALESCE(u.first_name, '') AS first_name,
    COALESCE(u.last_name, '') AS last_name,
    u.email_id,
    t.name AS team_name,
    CASE
        WHEN a.present = true THEN 'present'
        WHEN a.present = false THEN 'absent'
        ELSE 'no_record'
    END AS attendance_status
FROM users u
JOIN org_memberships om ON om.user_id = u.id AND om.org_id = $2 AND om.status = 'ACTIVE'
LEFT JOIN attendance_record a ON u.id = a.user_id AND a.org_id = $2 AND a.attendance_date = $1
JOIN team_members tm ON u.id = tm.user_id AND tm.team_id = $3
JOIN teams t ON tm.team_id = t.id AND t.org_id = $2
ORDER BY u.first_name;

-- name: GetOrgAttendanceRange :many
SELECT
    u.id,
    COALESCE(u.first_name, '') AS first_name,
    COALESCE(u.last_name, '') AS last_name,
    u.email_id,
    COALESCE(t.name, 'Unassigned') AS team_name,
    d.day::date AS attendance_date,
    CASE
        WHEN a.present = true THEN 'present'
        WHEN a.present = false THEN 'absent'
        ELSE 'no_record'
    END AS attendance_status
FROM users u
JOIN org_memberships om ON om.user_id = u.id AND om.org_id = sqlc.arg('org_id') AND om.status = 'ACTIVE'
CROSS JOIN generate_series(sqlc.arg('from_date')::date, sqlc.arg('to_date')::date, interval '1 day') AS d(day)
LEFT JOIN attendance_record a ON a.user_id = u.id AND a.org_id = sqlc.arg('org_id') AND a.attendance_date = d.day
LEFT JOIN team_members tm ON u.id = tm.user_id
LEFT JOIN teams t ON tm.team_id = t.id AND t.org_id = sqlc.arg('org_id')
WHERE EXISTS (
    SELECT 1 FROM team_members tm2
    JOIN teams t2 ON tm2.team_id = t2.id
    WHERE tm2.user_id = u.id AND t2.org_id = sqlc.arg('org_id')
)
ORDER BY u.first_name, u.last_name, d.day;

-- name: GetOrgAttendanceRangeByTeam :many
SELECT
    u.id,
    COALESCE(u.first_name, '') AS first_name,
    COALESCE(u.last_name, '') AS last_name,
    u.email_id,
    t.name AS team_name,
    d.day::date AS attendance_date,
    CASE
        WHEN a.present = true THEN 'present'
        WHEN a.present = false THEN 'absent'
        ELSE 'no_record'
    END AS attendance_status
FROM users u
JOIN org_memberships om ON om.user_id = u.id AND om.org_id = sqlc.arg('org_id') AND om.status = 'ACTIVE'
CROSS JOIN generate_series(sqlc.arg('from_date')::date, sqlc.arg('to_date')::date, interval '1 day') AS d(day)
LEFT JOIN attendance_record a ON a.user_id = u.id AND a.org_id = sqlc.arg('org_id') AND a.attendance_date = d.day
JOIN team_members tm ON u.id = tm.user_id AND tm.team_id = sqlc.arg('team_id')
JOIN teams t ON tm.team_id = t.id AND t.org_id = sqlc.arg('org_id')
ORDER BY u.first_name, u.last_name, d.day;

-- name: GetUserAttendanceSummaryRange :one
SELECT
    COUNT(*) FILTER (WHERE present = true)::int AS present_count,
    COUNT(*) FILTER (WHERE present = false)::int AS absent_count
FROM attendance_record
WHERE user_id = $1 AND org_id = $2
  AND attendance_date BETWEEN sqlc.arg('from_date')::date AND sqlc.arg('to_date')::date;

-- name: GetUserAttendanceHistoryRange :many
SELECT attendance_date, present
FROM attendance_record
WHERE user_id = $1 AND org_id = $2
  AND attendance_date BETWEEN sqlc.arg('from_date')::date AND sqlc.arg('to_date')::date
ORDER BY attendance_date DESC;
