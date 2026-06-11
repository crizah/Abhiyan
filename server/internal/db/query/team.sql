
-- name: GetTotalUsersInAdminTeams :one
SELECT COUNT(DISTINCT tm2.user_id)
FROM team_members tm1
JOIN team_members tm2 ON tm1.team_id = tm2.team_id
WHERE tm1.user_id = $1 AND tm1.team_role = 'TEAM_ADMIN';