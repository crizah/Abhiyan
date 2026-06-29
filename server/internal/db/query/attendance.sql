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

-- name: GetAbsentUsers :many
SELECT u.id, u.email_id FROM users u
LEFT JOIN attendance_record a 
ON u.id = a.user_id AND a.attendance_date= CURRENT_DATE
WHERE u.status = 'ACTIVE' 
AND a.id = NULL;
