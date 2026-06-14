-- name: CreateUser :one
INSERT into users (
    org_id, status, first_name, last_name, email_id, phone_number
) VALUES (
    $1, $2, $3, $4, $5, $6
)
RETURNING *;

-- name: CreateUserCredentials :one
INSERT into user_credentials (
    user_id, password_hash
) VALUES (
    $1, $2
)
RETURNING *;

-- name: AddUserSystemRole :one
-- NEW: Assigns a system role to a user
INSERT INTO user_system_roles (
    user_id, role
) VALUES (
    $1, $2
) RETURNING *;


-- name: GetUserSystemRoles :many
-- NEW: Fetches all roles assigned to a user
SELECT role FROM user_system_roles 
WHERE user_id = $1;

-- name: GetUserByEmail :one
SELECT * FROM users 
WHERE email_id = $1 LIMIT 1;

-- name: GetUserCredentials :one
SELECT * FROM user_credentials 
WHERE user_id = $1 LIMIT 1;

-- name: CreateInvitedUser :one
INSERT INTO users (
    org_id, email_id, status
) VALUES (
    $1, $2, 'INVITED'
)
RETURNING *;

-- name: UpdateUserOnboarding :one
UPDATE users 
SET 
    first_name = $1, 
    last_name = $2, 
    phone_number = $3, 
    status = 'ACTIVE'
WHERE 
    email_id = $4 AND status = 'INVITED'
RETURNING *;

-- name: GetTotalUsersByOrg :one
SELECT COUNT(*) FROM users 
WHERE org_id = $1;

-- name: GetFullUserProfile :one
SELECT 
    u.id, u.first_name, u.last_name, u.email_id, u.phone_number, u.status,
    o.name as org_name
FROM users u
JOIN organizations o ON u.org_id = o.id
WHERE u.id = $1 LIMIT 1;


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
WHERE tm.user_id = $1;

-- name: UpdateUserProfile :one
UPDATE users 
SET first_name = $2, last_name = $3, phone_number = $4
WHERE id = $1
RETURNING id, first_name, last_name, phone_number;

-- name: GetUsersByOrg :many
SELECT 
    u.id, u.first_name, u.last_name, u.email_id, u.status,
    COALESCE(
        (SELECT array_agg(role)::text[] 
         FROM user_system_roles 
         WHERE user_id = u.id), 
    '{}') AS roles
FROM users u
WHERE u.org_id = $1
ORDER BY u.created_at DESC;


-- name: GetUsersByOrgPaginated :many
SELECT 
    u.id, u.first_name, u.last_name, u.email_id, u.status,
    COALESCE(
        (SELECT array_agg(role)::text[] 
         FROM user_system_roles 
         WHERE user_id = u.id), 
    '{}') AS roles,
    COUNT(*) OVER() AS total_count
FROM users u
WHERE u.org_id = $1
  AND (@search_term::text = '' OR u.email_id ILIKE '%' || @search_term || '%' OR u.first_name ILIKE '%' || @search_term || '%' OR u.last_name ILIKE '%' || @search_term || '%')
  AND (@status_filter::text = '' OR u.status::text = @status_filter)
  AND (@role_filter::text = '' OR EXISTS (
        SELECT 1 FROM user_system_roles WHERE user_id = u.id AND role::text = @role_filter
      ))
ORDER BY u.created_at DESC
LIMIT $2 OFFSET $3;

-- name: GetUnassignedOrgUsers :many
SELECT u.id, u.first_name, u.last_name, u.email_id, u.status
FROM users u
LEFT JOIN team_members tm ON u.id = tm.user_id
WHERE u.org_id = $1 
  AND tm.team_id IS NULL
ORDER BY u.created_at DESC;

-- name: GetAssignedOrgUsers :many
SELECT u.id, u.first_name, u.last_name, u.email_id, u.status
FROM users u
WHERE u.org_id = $1 
  AND EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = u.id)
ORDER BY u.created_at DESC;

-- name: DeleteUserSystemRoles :exec
DELETE FROM user_system_roles WHERE user_id = $1;

-- name: InsertUserSystemRole :exec
INSERT INTO user_system_roles (user_id, role) VALUES ($1, $2);

-- name: UpdateUserStatus :exec
UPDATE users SET status = $1 WHERE id = $2;

-- name: GetUserStatus :one
SELECT status FROM users WHERE id = $1;

-- name: GetUserNameByID :one
SELECT first_name, last_name FROM users WHERE id = $1;