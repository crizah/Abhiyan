
-- name: GetTotalUsersInAdminTeams :one
SELECT COUNT(DISTINCT tm2.user_id)
FROM team_members tm1
JOIN team_members tm2 ON tm1.team_id = tm2.team_id
WHERE tm1.user_id = $1 AND tm1.team_role = 'TEAM_ADMIN';

-- name: GetAdminTeamWiseStats :many
SELECT 
    t.id, 
    t.name, 
    (SELECT COUNT(user_id) FROM team_members WHERE team_id = t.id) as member_count
FROM teams t
JOIN team_members tm ON t.id = tm.team_id
WHERE tm.user_id = $1 AND tm.team_role = 'TEAM_ADMIN'
ORDER BY t.name ASC;

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

-- name: GetOrgTeams :many
SELECT t.id, t.name, COUNT(tm.user_id) AS member_count
FROM teams t
LEFT JOIN team_members tm ON t.id = tm.team_id
WHERE t.org_id = $1
GROUP BY t.id
ORDER BY t.name ASC;


-- name: CreateTeam :one
INSERT INTO teams (org_id, name) VALUES ($1, $2) RETURNING id;

-- name: GetTeamMembersDetails :many
SELECT u.id, u.first_name, u.last_name, u.email_id, tm.team_role::text
FROM team_members tm
JOIN users u ON tm.user_id = u.id
WHERE tm.team_id = $1
ORDER BY tm.team_role DESC, u.first_name ASC;

-- name: GetTeamAdminCount :one
SELECT COUNT(*) FROM team_members 
WHERE team_id = $1 AND team_role = 'TEAM_ADMIN';

-- name: UpsertTeamMember :exec
INSERT INTO team_members (team_id, user_id, team_role) 
VALUES ($1, $2, $3)
ON CONFLICT (team_id, user_id) 
DO UPDATE SET team_role = EXCLUDED.team_role;

-- name: RemoveTeamMember :exec
DELETE FROM team_members WHERE team_id = $1 AND user_id = $2;

-- name: GetUserTeams :many
SELECT t.id, t.name, tm.team_role::text
FROM team_members tm
JOIN teams t ON tm.team_id = t.id
WHERE tm.user_id = $1
ORDER BY t.name ASC;

-- name: GetAdminManagedTeams :many
SELECT 
    t.id, 
    t.name,
    COUNT(all_members.user_id) AS member_count
FROM teams t
-- 1. Identify teams where this user is an admin
JOIN team_members managers ON t.id = managers.team_id
-- 2. Fetch all members attached to those specific teams for aggregate counting
LEFT JOIN team_members all_members ON t.id = all_members.team_id
WHERE managers.user_id = $1 AND managers.team_role = 'TEAM_ADMIN'
GROUP BY t.id, t.name
ORDER BY t.name ASC;

-- name: CheckTeamAdminStatus :one
SELECT EXISTS (
    SELECT 1 FROM team_members 
    WHERE team_id = $1 AND user_id = $2 AND team_role = 'TEAM_ADMIN'
);



-- name: GetTeamAdminsByTask :many
SELECT tm.user_id 
FROM team_members tm
JOIN tasks t ON tm.team_id = t.team_id
WHERE t.id = $1 AND tm.team_role = 'TEAM_ADMIN';


-- name: GetEmployeeTeams :many
SELECT 
    t.id, 
    t.name, 
    tm.team_role,
    (SELECT COUNT(user_id) FROM team_members WHERE team_id = t.id) AS member_count
FROM teams t
JOIN team_members tm ON t.id = tm.team_id
WHERE tm.user_id = $1
ORDER BY t.name ASC;

