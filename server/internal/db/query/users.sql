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