-- name: UpsertAttendanceRecord :one
INSERT INTO attendance_record (user_id, target_file_uri, status)
VALUES ($1, $2, 'pending')
ON CONFLICT (user_id, attendance_date)
DO UPDATE SET target_file_uri = $2, status = 'pending', updated_at = NOW()
RETURNING id;

-- name: GetTodayAttendance :one
SELECT id, status, present
FROM attendance_record
WHERE user_id = $1 AND attendance_date = CURRENT_DATE
LIMIT 1;

-- name: SetAttendanceResult :exec
UPDATE attendance_record
SET present = $2, status = $3, updated_at = NOW()
WHERE id = $1;

-- name: BatchInsertAbsentAttendance :exec
INSERT INTO attendance_record (user_id, present, status)
SELECT u.id, false, 'absent'
FROM users u
JOIN organizations o ON u.org_id = o.id
WHERE u.status = 'ACTIVE'
  AND o.attendance_enabled = true
  AND EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = u.id)
ON CONFLICT (user_id, attendance_date) DO NOTHING;

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
        ELSE 'absent'
    END AS attendance_status
FROM users u
LEFT JOIN attendance_record a ON u.id = a.user_id AND a.attendance_date = $1
LEFT JOIN team_members tm ON u.id = tm.user_id
LEFT JOIN teams t ON tm.team_id = t.id
WHERE u.org_id = $2 AND u.status = 'ACTIVE'
  AND EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = u.id)
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
        ELSE 'absent'
    END AS attendance_status
FROM users u
LEFT JOIN attendance_record a ON u.id = a.user_id AND a.attendance_date = $1
JOIN team_members tm ON u.id = tm.user_id AND tm.team_id = $3
JOIN teams t ON tm.team_id = t.id
WHERE u.org_id = $2 AND u.status = 'ACTIVE'
ORDER BY u.first_name;

-- name: GetUserAttendanceSummary :one
SELECT
    COUNT(*) FILTER (WHERE present = true)::int AS present_count,
    COUNT(*) FILTER (WHERE present = false)::int AS absent_count
FROM attendance_record
WHERE user_id = $1;

-- name: GetUserAttendanceHistory :many
SELECT attendance_date, present
FROM attendance_record
WHERE user_id = $1
ORDER BY attendance_date DESC
LIMIT 60;
