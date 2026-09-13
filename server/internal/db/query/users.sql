-- name: CreateUser :one
-- Shared identity only — org_id/status live on org_memberships, written
-- separately by the caller in the same transaction (multi-org membership).
INSERT into users (
    first_name, last_name, email_id, phone_number, face_s3_uri
) VALUES (
    $1, $2, $3, $4, $5
)
RETURNING *;

-- name: CreateOrgMembership :one
INSERT INTO org_memberships (user_id, org_id, status)
VALUES ($1, $2, $3)
RETURNING *;

-- name: CreateUserCredentials :one
INSERT into user_credentials (
    user_id, password_hash
) VALUES (
    $1, $2
)
RETURNING *;

-- name: AddUserSystemRole :one
-- Assigns a system role to a user, scoped to one org.
INSERT INTO user_system_roles (
    user_id, org_id, role
) VALUES (
    $1, $2, $3
) RETURNING *;


-- name: GetUserSystemRoles :many
-- Fetches the roles a user holds in one specific org (not global — a person
-- can hold different roles in different orgs).
SELECT role FROM user_system_roles
WHERE user_id = $1 AND org_id = $2;

-- name: GetUserByEmail :one
SELECT * FROM users 
WHERE email_id = $1 LIMIT 1;

-- name: GetEmailByUser :one
SELECT email_id from users where id = $1 LIMIT 1;

-- name: GetUserCredentials :one
SELECT * FROM user_credentials 
WHERE user_id = $1 LIMIT 1;

-- name: CreateInvitedUser :one
-- Shared identity only; the org_memberships row (status INVITED) is created
-- separately by the caller in the same transaction.
INSERT INTO users (
    email_id
) VALUES (
    $1
)
RETURNING *;

-- name: UpdateUserOnboarding :one
-- Shared profile fields only. Flipping the invited org's membership to ACTIVE
-- happens as a separate org-scoped call (a person may have other org
-- memberships that must be left untouched).
UPDATE users
SET
    first_name = $1,
    last_name = $2,
    phone_number = $3,
    face_s3_uri = $4
WHERE
    email_id = $5
RETURNING *;

-- name: GetTotalUsersByOrg :one
SELECT COUNT(*) FROM org_memberships
WHERE org_id = $1;

-- name: GetFullUserProfile :one
SELECT
    u.id, u.first_name, u.last_name, u.email_id, u.phone_number, om.status, u.face_s3_uri,
    o.name as org_name
FROM users u
JOIN org_memberships om ON om.user_id = u.id
JOIN organizations o ON o.id = om.org_id
WHERE u.id = $1 AND om.org_id = $2 LIMIT 1;


-- name: GetUserTeamsWithAdmins :many
SELECT 
    t.name as team_name,
    tm.team_role as user_team_role,
    COALESCE(
        (SELECT array_agg(u2.email_id)::text[]
         FROM team_members tm2
         JOIN users u2 ON tm2.user_id = u2.id
         WHERE tm2.team_id = t.id AND tm2.team_role = 'TEAM_ADMIN'
        ), '{}'
    ) as team_admin_emails
FROM team_members tm
JOIN teams t ON tm.team_id = t.id
WHERE tm.user_id = $1 AND t.org_id = $2;

-- name: UpdateUserProfile :one
UPDATE users 
SET first_name = $2, last_name = $3, phone_number = $4, face_s3_uri = $5
WHERE id = $1
RETURNING id, first_name, last_name, phone_number, face_s3_uri;

-- name: GetUsersByOrg :many
SELECT
    u.id, u.first_name, u.last_name, u.email_id, om.status,
    COALESCE(
        (SELECT array_agg(role)::text[]
         FROM user_system_roles
         WHERE user_id = u.id AND org_id = om.org_id),
    '{}') AS roles
FROM users u
JOIN org_memberships om ON om.user_id = u.id
WHERE om.org_id = $1
ORDER BY u.created_at DESC;


-- name: GetUsersByOrgPaginated :many
SELECT
    u.id, u.first_name, u.last_name, u.email_id, om.status,
    COALESCE(
        (SELECT array_agg(role)::text[]
         FROM user_system_roles
         WHERE user_id = u.id AND org_id = om.org_id),
    '{}') AS roles,
    COUNT(*) OVER() AS total_count
FROM users u
JOIN org_memberships om ON om.user_id = u.id
WHERE om.org_id = $1
  AND (@search_term::text = '' OR u.email_id ILIKE '%' || @search_term || '%' OR u.first_name ILIKE '%' || @search_term || '%' OR u.last_name ILIKE '%' || @search_term || '%')
  AND (@status_filter::text = '' OR om.status::text = @status_filter)
  AND (@role_filter::text = '' OR EXISTS (
        SELECT 1 FROM user_system_roles WHERE user_id = u.id AND org_id = om.org_id AND role::text = @role_filter
      ))
ORDER BY u.created_at DESC
LIMIT $2 OFFSET $3;

-- name: GetUnassignedOrgUsers :many
WITH base AS (
    SELECT u.id, u.first_name, u.last_name, u.email_id, om.status, u.created_at
    FROM users u
    JOIN org_memberships om ON om.user_id = u.id
    WHERE om.org_id = $1
      AND NOT EXISTS (
        SELECT 1 FROM team_members tm
        JOIN teams t ON t.id = tm.team_id
        WHERE tm.user_id = u.id AND t.org_id = $1
      )
)
SELECT id, first_name, last_name, email_id, status, created_at, COUNT(*) OVER() AS total_count
FROM base
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: GetAssignedOrgUsers :many
WITH base AS (
    SELECT u.id, u.first_name, u.last_name, u.email_id, om.status, u.created_at
    FROM users u
    JOIN org_memberships om ON om.user_id = u.id
    WHERE om.org_id = $1
      AND EXISTS (
        SELECT 1 FROM team_members tm
        JOIN teams t ON t.id = tm.team_id
        WHERE tm.user_id = u.id AND t.org_id = $1
      )
)
SELECT id, first_name, last_name, email_id, status, created_at, COUNT(*) OVER() AS total_count
FROM base
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: UpdateUserFace :exec
UPDATE users SET face_s3_uri = $2 WHERE id = $1;

-- name: DeleteUserSystemRoles :exec
-- Scoped to one org — must never wipe a person's roles in a different org
-- they also belong to.
DELETE FROM user_system_roles WHERE user_id = $1 AND org_id = $2;

-- name: InsertUserSystemRole :exec
INSERT INTO user_system_roles (user_id, org_id, role) VALUES ($1, $2, $3);

-- name: UpdateMembershipStatus :exec
UPDATE org_memberships SET status = $1 WHERE user_id = $2 AND org_id = $3;

-- name: GetMembershipStatus :one
SELECT status FROM org_memberships WHERE user_id = $1 AND org_id = $2;

-- name: GetUserNameByID :one
SELECT first_name, last_name FROM users WHERE id = $1;

-- name: GetPendingInvitedUser :one
SELECT u.id, u.email_id, om.org_id, om.status, usr.role
FROM users u
JOIN org_memberships om ON om.user_id = u.id
JOIN user_system_roles usr ON u.id = usr.user_id AND usr.org_id = om.org_id
WHERE u.email_id = $1 AND om.org_id = $2;

-- name: GetInvitedMembership :one
-- Same shape as GetPendingInvitedUser but keyed by user ID — used by the
-- admin-triggered resend, which knows the user's row (not their raw token).
SELECT u.email_id, om.status, usr.role
FROM users u
JOIN org_memberships om ON om.user_id = u.id
JOIN user_system_roles usr ON u.id = usr.user_id AND usr.org_id = om.org_id
WHERE u.id = $1 AND om.org_id = $2;

-- name: GetUserFaceURI :one
SELECT face_s3_uri FROM users WHERE id = $1;

-- name: GetUserOrgMemberships :many
-- Every active org a person belongs to, with the role(s) they hold in each —
-- powers the login org-picker and the org-switcher menu. One row per org
-- (roles aggregated) since a person can hold more than one role per org.
SELECT
    om.org_id,
    o.name AS org_name,
    om.status,
    COALESCE(
        (SELECT array_agg(role)::text[] FROM user_system_roles WHERE user_id = om.user_id AND org_id = om.org_id),
    '{}') AS roles
FROM org_memberships om
JOIN organizations o ON o.id = om.org_id
WHERE om.user_id = $1 AND om.status = 'ACTIVE'
ORDER BY o.name;

-- name: IsUserInOrg :one
-- Multi-org membership check: replaces the old single-users.org_id lookup this
-- was originally added as (this session's cross-org authorization fixes) — a
-- person can now belong to several orgs, so "the user's org" isn't a single
-- value anymore, only "is this user an active member of THIS org" is.
SELECT EXISTS (
    SELECT 1 FROM org_memberships
    WHERE user_id = $1 AND org_id = $2 AND status = 'ACTIVE'
);

-- name: UpdateUserCredentials :exec
UPDATE user_credentials
SET password_hash = $2, updated_at = NOW()
WHERE user_id = $1;

-- name: GetOrgFaceRegistrationStatus :many
-- Org-scoped (joins through org_memberships, not the legacy users.org_id) so
-- this can never leak another org's users — used by the super admin dashboard
-- to show who has/hasn't registered their face for attendance.
SELECT
    u.id, u.first_name, u.last_name, u.email_id,
    (u.face_s3_uri IS NOT NULL)::boolean AS face_registered
FROM users u
JOIN org_memberships om ON om.user_id = u.id
WHERE om.org_id = $1 AND om.status = 'ACTIVE'
ORDER BY u.first_name, u.last_name;