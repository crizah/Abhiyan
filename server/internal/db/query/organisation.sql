-- name: CreateOrganizations :one
INSERT INTO organizations (
    name, domain
) VALUES (
    $1, $2
)
RETURNING *;

