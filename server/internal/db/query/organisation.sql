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

