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
SELECT name, attendance_enabled, weekends_off FROM organizations
WHERE id = $1 LIMIT 1;

-- name: SetOrgAttendanceEnabled :exec
UPDATE organizations SET attendance_enabled = $2 WHERE id = $1;

-- name: SetOrgWeekendsOff :exec
UPDATE organizations SET weekends_off = $2 WHERE id = $1;

-- name: DeleteOrganization :exec
DELETE FROM organizations WHERE id = $1;

-- name: CreateOrgHoliday :one
INSERT INTO org_holidays (org_id, date, label)
VALUES ($1, $2, $3)
ON CONFLICT (org_id, date) DO UPDATE SET label = $3
RETURNING *;

-- name: DeleteOrgHoliday :exec
DELETE FROM org_holidays WHERE id = $1 AND org_id = $2;

-- name: ListOrgHolidays :many
SELECT * FROM org_holidays WHERE org_id = $1 ORDER BY date;

-- name: IsOrgHolidayToday :one
-- Single check used to gate mark-attendance and today's status: a holiday if
-- it's a configured one-off date, or a weekend and the org has weekends off.
SELECT EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.id = $1 AND (
        (o.weekends_off AND EXTRACT(DOW FROM CURRENT_DATE) IN (0, 6))
        OR EXISTS (SELECT 1 FROM org_holidays oh WHERE oh.org_id = o.id AND oh.date = CURRENT_DATE)
    )
);

