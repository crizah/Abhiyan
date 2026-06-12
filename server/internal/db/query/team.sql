
-- name: GetTotalUsersInAdminTeams :one
SELECT COUNT(DISTINCT tm2.user_id)
FROM team_members tm1
JOIN team_members tm2 ON tm1.team_id = tm2.team_id
WHERE tm1.user_id = $1 AND tm1.team_role = 'TEAM_ADMIN';


-- name: GetTeamEmployeesPaginated :many
SELECT 
    u.id, u.first_name, u.last_name, u.email_id, u.status,
    t.name as team_name, tm_target.team_role::text as team_role,
    COUNT(*) OVER() AS total_count
FROM team_members tm_admin
JOIN teams t ON tm_admin.team_id = t.id
JOIN team_members tm_target ON t.id = tm_target.team_id
JOIN users u ON tm_target.user_id = u.id
WHERE tm_admin.user_id = $1 
  AND tm_admin.team_role = 'TEAM_ADMIN'
  AND (sqlc.arg('search_term')::text = '' OR u.email_id ILIKE '%' || sqlc.arg('search_term') || '%' OR u.first_name ILIKE '%' || sqlc.arg('search_term') || '%' OR u.last_name ILIKE '%' || sqlc.arg('search_term') || '%')
  AND (sqlc.arg('team_filter')::text = '' OR t.name = sqlc.arg('team_filter'))
  AND (sqlc.arg('role_filter')::text = '' OR tm_target.team_role::text = sqlc.arg('role_filter'))
  AND (sqlc.arg('status_filter')::text = '' OR u.status::text = sqlc.arg('status_filter'))
ORDER BY t.name ASC, u.created_at DESC
LIMIT $2 OFFSET $3;

-- name: GetAdminTeamNames :many
SELECT t.name 
FROM teams t
JOIN team_members tm ON t.id = tm.team_id
WHERE tm.user_id = $1 AND tm.team_role = 'TEAM_ADMIN'
ORDER BY t.name;