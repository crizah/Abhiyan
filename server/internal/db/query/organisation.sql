-- name: CreateOrganizations :one
INSERT INTO organizations (
    name, domain
) VALUES (
    $1, $2
)
RETURNING *;

-- name: GetOrganizationName :one
SELECT name FROM organizations
WHERE id = $1 LIMIT 1;

-- name: GetOrgInfo :one
SELECT name, attendance_enabled FROM organizations
WHERE id = $1 LIMIT 1;

-- name: SetOrgAttendanceEnabled :exec
UPDATE organizations SET attendance_enabled = $2 WHERE id = $1;

